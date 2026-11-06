import { Pool } from 'pg';
import { createPublicClient, http } from 'viem';
import { readSalesRuntime } from '../server/market/config.ts';
import { SaleStore } from '../server/market/store.ts';
import { SalesService } from '../server/market/service.ts';
import { arkivRuntime, publishArkiv, ArkivListings } from '../server/market/arkiv.ts';
import { readOrderMetadata } from '../server/market/arkiv-metadata.ts';
import { parseOrderEntity, ORDER_SCHEMA_VERSION } from '../server/market/arkiv-schema.ts';
// Explicit --publish only. Never signs Ethereum orders, changes their terms, or settles trades.
const write=process.argv.includes('--publish'), evidence=[];
if(process.argv.slice(2).some(arg=>arg!=='--publish')) throw new Error('Usage: arkiv-republish.mjs [--publish]');
async function main() {
const runtime=arkivRuntime(write?process.env:{ARKIV_PUBLISHER_ADDRESS:process.env.ARKIV_PUBLISHER_ADDRESS || '0x8d5b491D2c843F6B996De1EC66269809138cA60A',
 ARKIV_ACCESS_KEY:process.env.ARKIV_ACCESS_KEY});
if(!runtime || await runtime.reader.getChainId()!==7794095 || (write&&!runtime.writer)) throw new Error('Rabdi publisher configuration required.');
for(const collection of ['signature','advanced']) {
 const config=await readSalesRuntime(collection==='signature'?process.env:{...process.env,
  GARUDA_DEPLOYMENT_JSON:process.env.GARUDA_ADVANCED_DEPLOYMENT_JSON,GARUDA_DEPLOYMENT_FILE:process.env.GARUDA_ADVANCED_DEPLOYMENT_FILE});
 if(!config) continue;
 if(config.deployment.environment!=='ethereum-mainnet') throw new Error('Only existing Ethereum mainnet orders can be copied.');
 const pool=new Pool(config.database), store=new SaleStore(pool,config.deployment);
 try {
  if(write) await store.migrate();
  const service=new SalesService(createPublicClient({transport:http(config.rpcUrl,{timeout:20000,retryCount:2})}),store);
  let before;
  do {
   const rows=await store.list({before,limit:100});
   for(const stored of rows) {
    if(Number(stored.order.deadline)<=Date.now()/1000) continue;
    console.error(`Checking ${collection} #${stored.order.tokenId} ${stored.order.kind===0?'listing':'bid'}`);
    const row=await service.get(stored.hash);
    const entry={collection,orderHash:row.hash,kind:row.order.kind===0?'listing':'bid',tokenId:row.order.tokenId,
     amount:row.order.amount,deadline:row.order.deadline,status:row.status};
    if(row.status!=='available') { evidence.push(entry); continue; }
    if(!write) { const m=await readOrderMetadata(service,row); evidence.push({...entry,principal:m.snapshot.principal,shares:m.snapshot.shares}); continue; }
    const result=await publishArkiv(service,row.hash,runtime);
    const entity=await runtime.reader.getEntity(result.entityKey,ArkivListings);
    parseOrderEntity(entity,store.deployment,2);
    const previous=await pool.query('SELECT tx_hash FROM garuda_arkiv_publications WHERE scope=$1 AND hash=$2 AND entity_key=$3',
     [store.scope,row.hash,result.entityKey]);
    const txHash=result.txHash??previous.rows[0]?.tx_hash;
    if(txHash) {
     const receipt=await runtime.reader.getTransactionReceipt({hash:txHash});
     if(receipt.status!=='success') throw new Error('Arkiv publication receipt failed.');
    }
    await pool.query(`INSERT INTO garuda_arkiv_publications(scope,hash,schema_version,state,entity_key,tx_hash)
     VALUES($1,$2,$3,'published',$4,$5) ON CONFLICT(scope,hash) DO UPDATE SET schema_version=$3,state='published',entity_key=$4,tx_hash=$5,error_code=NULL`,
     [store.scope,row.hash,ORDER_SCHEMA_VERSION,result.entityKey,txHash??null]);
    evidence.push({...entry,...result,txHash,schema:ArkivListings.name,publisher:runtime.publisher,
     principal:String(entity.principal.value),shares:String(entity.shares.value),maturesAt:String(entity.maturesAt.value),
     observedAt:String(entity.observedAt.value),blockNumber:String(entity.blockNumber.value),blockHash:entity.blockHash.value});
    console.error(`Verified ${entry.kind} ${collection} #${entry.tokenId}: ${result.entityKey}`);
   }
   before=rows.length===100?rows.at(-1).sequence:undefined;
  } while(before);
 } finally {await pool.end();}
}
}
try { await main(); }
catch(error) { console.error(`Republication stopped (${error?.name ?? 'Error'}). Completed records are retained; rerunning is safe.`); process.exitCode=1; }
finally { console.log(JSON.stringify({published:write,completed:!process.exitCode,verifiedAt:new Date().toISOString(),chainId:7794095,orders:evidence},null,2)); }
