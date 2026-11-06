import { seedMedia } from '../media/publication';
import { Pool } from 'pg';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { readSalesRuntime } from './config';
import { SaleStore } from './store';
import { SalesService } from './service';
import { seedPublications } from './publication';
import { stakeCollection } from '../../src/lib/blend/stake-collections';

export function serviceResolver(collection: 'signature' | 'advanced') {
  let pending: Promise<SalesService | null> | undefined;
  return () => pending ??= (async()=> {
    const runtime = await readSalesRuntime(collection === 'signature' ? process.env : {...process.env,
      GARUDA_DEPLOYMENT_JSON:process.env.GARUDA_ADVANCED_DEPLOYMENT_JSON,
      GARUDA_DEPLOYMENT_FILE:process.env.GARUDA_ADVANCED_DEPLOYMENT_FILE});
    if (!runtime) return null;
    if (stakeCollection(runtime.deployment.collection).id !== collection) throw new Error('Collection configuration mismatch.');
    const client=createPublicClient({chain: runtime.deployment.environment === 'ethereum-mainnet' ? mainnet : undefined, batch:{multicall:true}, transport:http(runtime.rpcUrl,{timeout:15000,retryCount:0})});
    if (runtime.deployment.environment === 'local-fork' && !/anvil/i.test(await client.request({method:'web3_clientVersion'})))
      throw new Error('Anvil required.');
    const pool=new Pool(runtime.database);
    pool.on('error',()=>console.error('Garuda database connection interrupted.'));
    const store=new SaleStore(pool,runtime.deployment);
    try { await store.migrate(); await seedPublications(store); await seedMedia(store); }
    catch(error) { await pool.end(); throw error; }
    return new SalesService(client,store);
  })().catch(error=>{pending=undefined;throw error;});
}
