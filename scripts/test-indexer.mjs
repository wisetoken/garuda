import test from 'node:test';
import assert from 'node:assert/strict';
import { syncSalesIndex } from '../server/market/indexer.ts';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
function fixture() {
  const points = new Map(), events = [], logReads = [];
  let owner, lockFailure;
  const canonical = n => `block-${n}`;
  const client = {
    getBlock: async ({blockNumber}) => ({number:blockNumber,hash:canonical(blockNumber)}),
    getLogs: async args => { logReads.push(args); return []; },
  };
  // Emulate both immediate and waiting advisory locks, so the previous
  // pg_try_advisory_xact_lock implementation reproduces the production failure.
  const store = () => ({ scope:'shared-market', deployment:{deploymentBlock:'100',adapter:'zone',collection:'nft'},
    transaction: async run => {
      let owned;
      try { return await run({query:async (sql,args=[]) => {
        if (sql.includes('lock_timeout')) return {};
        if (sql.includes('advisory')) {
          if (lockFailure) throw lockFailure;
          if (sql.includes('pg_try_') && owner) return {rows:[{locked:false}]};
          while (owner) await owner.promise;
          owned = owner = deferred(); return {rows:[{locked:true}]};
        }
        if (sql.startsWith('SELECT block_number')) return {rows:[...points].sort(([a],[b])=>b-a).map(([n,hash])=>({block_number:String(n),block_hash:hash}))};
        if (sql.startsWith('DELETE FROM blend_sale_checkpoints')) { for (const n of points.keys()) if (n>Number(args[1])) points.delete(n); return {}; }
        if (sql.startsWith('DELETE FROM blend_sale_events')) { for(let i=events.length-1;i>=0;i--) if(events[i]>Number(args[1]))events.splice(i,1); return {}; }
        if (sql.startsWith('INSERT INTO blend_sale_checkpoints')) { points.set(Number(args[1]),args[2]); return {}; }
        throw Error(`Unexpected query: ${sql}`);
      }}); } finally { if (owned) { owner=undefined; owned.resolve(); } }
    },
  });
  return {points,events,logReads,client,store,canonical,setLockFailure:e=>{lockFailure=e;}};
}

test('independent API instances wait for the refresher and reuse its committed progress', async () => {
  const f=fixture(), entered=deferred(), release=deferred();
  f.client.getLogs=async args=>{f.logReads.push(args);entered.resolve();await release.promise;return [];};
  const first=syncSalesIndex(f.client,f.store(),102n);
  await entered.promise;
  let secondSettled=false;
  const second=syncSalesIndex(f.client,f.store(),102n).finally(()=>{secondSettled=true;});
  // Attach a rejection handler while checking that contention remains pending.
  const outcome=second.then(value=>({value}),error=>({error}));
  try {
    await new Promise(resolve=>setTimeout(resolve,10));
    assert.equal(secondSettled,false,'A competing instance must wait, not return index-busy');
  } finally {release.resolve();await first;}
  const result=await outcome;
  assert.equal(result.error,undefined);
  assert.equal(result.value.caughtUp,true);
  assert.equal(f.logReads.length,1,'The waiter must not repeat the completed Ethereum scan');
});

test('an older request cannot rewind a newer canonical checkpoint after waiting', async () => {
  const f=fixture();f.points.set(103,f.canonical(103));f.events.push(103);
  assert.deepEqual(await syncSalesIndex(f.client,f.store(),102n),{caughtUp:true,blockNumber:102n});
  assert.equal(f.points.has(103),true);assert.deepEqual(f.events,[103]);assert.equal(f.logReads.length,0);
});

test('noncanonical future checkpoints are still removed and rebuilt after a reorg', async () => {
  const f=fixture();f.points.set(103,'orphaned');f.points.set(100,f.canonical(100));f.events.push(103);
  assert.equal((await syncSalesIndex(f.client,f.store(),102n)).caughtUp,true);
  assert.equal(f.points.has(103),false);assert.deepEqual(f.events,[]);
  assert.equal(f.logReads[0].fromBlock,101n);assert.equal(f.logReads[0].toBlock,102n);
});

test('a lock timeout remains retryable and does not continue with an unchecked index', async () => {
  const f=fixture();f.setLockFailure(Object.assign(new Error('internal detail'),{code:'55P03'}));
  await assert.rejects(syncSalesIndex(f.client,f.store(),102n),e=>e.code==='index-busy');
  assert.equal(f.logReads.length,0);
});
