import { and, eq, gt } from '@arkiv-network/sdk/query';
import { u64 } from '@arkiv-network/sdk/schema';
import { hexToString } from 'viem';
import { ArkivListings, arkivRuntime, arkivScope } from '../server/market/arkiv.ts';
import { readFile } from 'node:fs/promises';
const publisher=process.env.ARKIV_PUBLISHER_ADDRESS || '0x8d5b491D2c843F6B996De1EC66269809138cA60A';
// Querying never loads a signer, even when .env.local has one for the server.
const runtime=arkivRuntime({ARKIV_PUBLISHER_ADDRESS:publisher,ARKIV_ACCESS_KEY:process.env.ARKIV_ACCESS_KEY});
if(!runtime || await runtime.reader.getChainId() !== 7794095) throw new Error('Arkiv Rabdi required.');
const deployment=JSON.parse(await readFile(new URL('./fixtures/signature-market.json',import.meta.url),'utf8'));
const kind=process.argv[2];
if(kind && !['listing','bid'].includes(kind)) throw new Error('Usage: npm run arkiv:query -- [listing|bid]');
const result=await runtime.reader.select().from(ArkivListings).ownedBy(publisher)
 .where(and(eq('scope',arkivScope(deployment)),gt('expires',u64(BigInt(Math.floor(Date.now()/1000)))),...(kind?[eq('kind',kind)]:[])))
 .limit(25).fetch();
console.log(JSON.stringify({chainId:7794095,publisher,schema:'wiseone.garuda.orders.v1',entities:result.entities.map(entity=>({
 key:entity.$key,kind:entity.kind.value,tokenId:entity.tokenId.value,orderHash:entity.orderHash.value,
 maker:entity.maker.value,owner:entity.owner.value,expires:String(entity.expires.value),
 signedKind:JSON.parse(hexToString(entity.envelope.value)).order.kind,
}))},null,2));
