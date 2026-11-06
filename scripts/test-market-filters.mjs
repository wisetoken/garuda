import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseEther } from 'viem';
import { render } from '@arkiv-network/sdk/query';
import { ArkivListings } from '../server/market/arkiv-schema.ts';
import { parseArkivFilters, orderFilters, includeLegacy } from '../server/market/arkiv-filters.ts';
import { arkivQueryFilters, exactStakeSearch, priceUnits, dateSeconds, rangeError } from '../src/lib/market/filter-query.ts';
import { emptyFilters, filterEntries, marketColumns } from '../src/lib/market/presentation.ts';
import { normalizeColumns, columnsForView } from '../src/components/table/column-preferences.ts';
const deployment = JSON.parse(await readFile(new URL('./fixtures/signature-market.json', import.meta.url), 'utf8'));
const owner = '0x22079a848266a7d2e40cf0ff71a6573d78adcf37';
const bidder = '0x1111111111111111111111111111111111111111';

test('column preferences retain reordering/visibility while repairing old or malformed layouts', () => {
  const saved = [{ id:'price', enabled:false, label:'Old price' }, { id:'type', enabled:true },
    { id:'price', enabled:true }, null, { id:'removed' }, { id:'actions', enabled:true }];
  const copy = structuredClone(saved);
  const columns = normalizeColumns(saved, marketColumns);
  assert.deepEqual(columns.slice(0,2), [{id:'price',label:'Asking price',enabled:false}, {id:'type',label:'Type',enabled:true}]);
  assert.equal(columns.at(-1).id,'actions');
  assert.equal(columns.length, marketColumns.length);
  assert.equal(columns.find(c=>c.id==='created').enabled,false);
  assert.deepEqual(saved,copy);
  assert.deepEqual(normalizeColumns({},marketColumns),normalizeColumns(null,marketColumns));
  assert.deepEqual(normalizeColumns(marketColumns.map(c=>({...c,enabled:false})),marketColumns).map(c=>c.enabled),
    normalizeColumns(null,marketColumns).map(c=>c.enabled));
});
test('switching from a bidder-only layout to listings keeps a visible column without losing saved preferences', () => {
  const columns = normalizeColumns(null, marketColumns).map(c=>({...c,enabled:c.id==='bidder'}));
  const listing = columnsForView(columns,['bidder']);
  assert.ok(listing.some(c=>c.id!=='bidder' && c.enabled));
  assert.deepEqual(columns.filter(c=>c.enabled).map(c=>c.id),['bidder']);
  assert.equal(columnsForView(columns,[]),columns);
});
test('WISE ranges preserve wei precision and reject rounded, negative or overflowing input', () => {
  assert.equal(priceUnits('9007199254740993.000000000000000001'),9007199254740993000000000000000001n);
  assert.equal(priceUnits('0'),0n);
  assert.equal(priceUnits(''),undefined);
  for (const value of ['-1','1e3','1,000','1.0000000000000000001',String(2n**256n)]) assert.throws(()=>priceUnits(value));
  assert.match(rangeError({minPrice:'10',maxPrice:'9'}),/Minimum/);
});
test('maturity range includes the end of its UTC day and rejects impossible or reversed dates', () => {
  assert.equal(dateSeconds('2027-01-01'),1798761600);
  assert.equal(dateSeconds('2027-01-01',true),1798847999);
  assert.equal(dateSeconds('1970-01-01'),0);
  assert.equal(rangeError({maturesFrom:'2027-01-01',maturesTo:'2027-01-01'}),'');
  for(const value of ['2026-02-29','2026-13-01','not a date','1969-12-31']) assert.throws(()=>dateSeconds(value));
  assert.match(rangeError({maturesFrom:'2027-01-02',maturesTo:'2027-01-01'}),/end date/);
});
test('exact stake searches distinguish IDs, support collection labels, and leave partial addresses local', () => {
  assert.deepEqual(exactStakeSearch('Signature Stake #0053'),{tokenId:'53',stakeType:'signature'});
  assert.deepEqual(exactStakeSearch(' advanced #22 '),{tokenId:'22',stakeType:'advanced'});
  assert.equal(exactStakeSearch('0x2207'),undefined);
  assert.equal(exactStakeSearch(String(2n**256n)),undefined);
  assert.deepEqual(arkivQueryFilters({...emptyFilters,search:'0x2207'}),{});
  assert.deepEqual(arkivQueryFilters({...emptyFilters,search:owner}),{participant:owner});
});
test('UI filter values produce typed Arkiv predicates for listings and bids before pagination', () => {
  const ui = {...emptyFilters,search:owner,collections:['signature'],minPrice:'1000.000000000000000001',
    maxPrice:'42000',maturesFrom:'2027-01-01',maturesTo:'2031-12-31'};
  const query = arkivQueryFilters(ui);
  assert.equal(query.minPrice,'1000000000000000000001');
  for(const kind of ['listing','bid']) {
    const f = parseArkivFilters({...query,kind,sort:'stakeStartAt',direction:'desc'});
    const sql = render(orderFilters(deployment,f),ArkivListings);
    for(const field of ['maker','stakeOwner','stakeType','price','maturesAt',kind]) assert.ok(sql.includes(field),sql);
    assert.ok(sql.includes(' OR '),sql);
    assert.ok(sql.includes(query.minPrice));
    assert.ok(sql.includes('u256('));
    assert.equal(includeLegacy(f),false);
  }
  assert.throws(()=>parseArkivFilters({participant:'0x2207'}));
});
test('catalog filters use the same exact price/date boundaries and keep bidder matches', () => {
  const position = {status:'Active',startAt:1700000000,maturesAt:dateSeconds('2027-01-01',true),observedAt:1790000000};
  const row = (id,amount,extra={}) => ({order:{tokenId:id,amount:String(parseEther(amount)),collection:deployment.collection,
    owner,maker:bidder,...extra}});
  const first={row:row('53','1000.000000000000000001'),position};
  const second={row:row('153','1000'),position:{...position,maturesAt:position.maturesAt+1}};
  assert.deepEqual(filterEntries([first,second],{...emptyFilters,search:'53'}),[first]);
  assert.deepEqual(filterEntries([first,second],{...emptyFilters,minPrice:'1000.000000000000000001'}),[first]);
  assert.deepEqual(filterEntries([first,second],{...emptyFilters,maturesFrom:'2027-01-01',maturesTo:'2027-01-01'}),[first]);
  assert.deepEqual(filterEntries([first,second],{...emptyFilters,search:bidder}),[first,second]);
  assert.deepEqual(filterEntries([first,second],{...emptyFilters,collections:['advanced']}),[]);
});
