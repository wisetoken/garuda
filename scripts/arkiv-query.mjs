import { asc, desc } from '@arkiv-network/sdk/query';
import { ArkivListings, arkivRuntime } from '../server/market/arkiv.ts';
import { parseArkivFilters, orderFilters } from '../server/market/arkiv-filters.ts';
import { parseOrderEntity } from '../server/market/arkiv-schema.ts';
import { readFile } from 'node:fs/promises';
const publisher=process.env.ARKIV_PUBLISHER_ADDRESS || '0x8d5b491D2c843F6B996De1EC66269809138cA60A';
// Read-only: never load the configured signing key.
const runtime=arkivRuntime({ARKIV_PUBLISHER_ADDRESS:publisher,ARKIV_ACCESS_KEY:process.env.ARKIV_ACCESS_KEY});
if(!runtime || await runtime.reader.getChainId() !== 7794095) throw new Error('Arkiv Rabdi required.');
const deployment=JSON.parse(await readFile(new URL('./fixtures/signature-market.json',import.meta.url),'utf8'));
const input={};
for(const arg of process.argv.slice(2)) {
 if(['listing','bid'].includes(arg)) input.kind=arg;
 else {
  const match=/^--([a-zA-Z]+)=(.+)$/.exec(arg);
  if(!match) throw new Error('Use [listing|bid] and --minPrice=1000000000000000000, --sort=price, --direction=asc, etc.');
  input[match[1]]=match[2];
 }
}
const filters=parseArkivFilters(input);
if(Object.keys(input).some(k=>!(k in filters))) throw new Error('Unknown filter. See arkiv/schema.md.');
if(filters.before?.startsWith('v1:')) throw new Error('This query reads v2 only.');
const result=await runtime.reader.select().from(ArkivListings).ownedBy(publisher)
 .where(orderFilters(deployment,filters)).orderBy((filters.direction==='desc'?desc:asc)(filters.sort??'price'))
 .limit(25).offset(Number(filters.before??0)).fetch();
console.log(JSON.stringify({chainId:7794095,publisher,schema:ArkivListings.name,filters,entities:result.entities.map(entity=>{
 parseOrderEntity(entity,deployment,2);
 return {key:entity.$key,...Object.fromEntries(Object.entries(entity).filter(([k])=>!k.startsWith('$')&&!['snapshot','envelope'].includes(k))
  .map(([k,v])=>[k,typeof v.value==='bigint'?String(v.value):v.value]))};
})},null,2));
