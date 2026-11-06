import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const get=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const core=get('assets/01-crm-core.js');
const imp=get('import_sales.py');
const map=get('assets/26-gps-visit-order-v2364.js');
const begin=core.indexOf('async function gpsResolveRoutePointForVisit(');
const end=core.indexOf('// Записать замер и пересчитать эталон.',begin);
assert.ok(begin>0&&end>begin);
const source=core.slice(begin,end);
const client={id:'client-1',city:'Витебск',address:'Ленина 1',
  gps_lat:55,gps_lng:30,gps_verified_at:'2026-10-22T10:00:00Z'};
const route={physical_point_id:'store-1',route_lat:99,route_lng:99};
const phone={lat:55,lng:30,accuracy:18};

function harness({point={id:'store-1',city:'Витебск',address:'Ленина 1',lat:null,lng:null},
  links=['store-1'],peers=['client-1'],verified=true}={}){
  const from=table=>({
    select(){return{eq(){return{
      maybeSingle(){return{data:point,error:null}},
      limit(){return {data:(table==='route_physical_point_clients'
        ? (calls++===0?links.map(point_id=>({point_id})):peers.map(client_id=>({client_id})))
        : []),error:null}}
    }}}}
  });
  let calls=0;
  const ctx={db:{from},console,Promise,Math,Number,GPS_RADIUS_VERIFIED:150,
    gpsDistance:(a,b,c,d)=>Math.round(Math.sqrt((a-c)**2+(b-d)**2)*111000),
    clientGeofence:()=>({lat:55,lng:30,radius:150,verified})};
  vm.createContext(ctx);
  vm.runInContext(source,ctx);
  return ctx;
}
test('trusted physical TT: exact reciprocal link, matching address, prior verified GPS',async()=>{
  const h=harness(),p=await h.gpsResolveRoutePointForVisit(client,route);
  assert.equal(p.gps_anchor_verified,true);
  assert.equal(p.gps_anchor_linked_exact,true);
  assert.equal(p.gps_anchor_lat,55);
  assert.equal(p.route_lat,null); // original route snapshot must not be trusted
  const chk=h.gpsCheckAgainstClient(client,phone,p);
  assert.equal(chk.status,'confirmed');
  assert.match(chk.note,/длительность отдельно проверяется/);
});
test('different pavilion linked to the same physical point cannot inherit GPS',async()=>{
  const h=harness({peers:['client-1','client-2']});
  const p=await h.gpsResolveRoutePointForVisit(client,route);
  assert.equal(p.gps_anchor_verified,false);
  assert.equal(h.gpsCheckAgainstClient(client,phone,p).status,'unverified');
});
test('legal entity with several physical shops cannot donate its GPS anchor',async()=>{
  const h=harness({links:['store-1','store-2']});
  const p=await h.gpsResolveRoutePointForVisit(client,route);
  assert.equal(p.gps_anchor_linked_exact,false);
  assert.equal(h.gpsCheckAgainstClient(client,phone,p).status,'unverified');
});
test('address mismatch, missing verification or conflicting current coordinate never count',async()=>{
  for (const params of [
    {point:{id:'store-1',city:'Витебск',address:'Ленина 2',lat:null,lng:null}},
    {point:{id:'store-1',city:'Витебск',address:'Ленина 1',lat:56,lng:30}},
    {verified:false}
  ]){
    const h=harness(params),p=await h.gpsResolveRoutePointForVisit(client,route);
    assert.equal(p.gps_anchor_verified,false);
    assert.equal(h.gpsCheckAgainstClient(client,phone,p).status,'unverified');
  }
});
test('independent native session is never inferred from one browser GPS fix',()=>{
  assert.match(source,/длительность отдельно проверяется по треку/);
  assert.match(source,/gps_anchor_verified===true/);
  assert.doesNotMatch(source,/return.*gps_session.*true/);
  assert.equal(harness().gpsCheckAgainstClient(client,null,route).status,'no_gps');
});
test('VIP 1C import blocks accidental ordinary Triovist client, keeps sales source intact',()=>{
  assert.match(imp,/def protected_vip_import_keys\(\)/);
  assert.match(imp,/canonical_client_key\("Триовист ООО"\)/);
  assert.match(imp,/vip_membership_v236429/);
  assert.match(imp,/if canonical_client_key\(name\) in protected_vip:/);
  assert.match(imp,/skipped_vip\.append\(name\)/);
  assert.match(imp,/replace_month\(month, rows\)/); // financial history still imported
});
test('map distinguishes confirmed visit numbers from stops/reports',()=>{
  assert.doesNotThrow(()=>new vm.Script(map));
  assert.match(map,/z\.no=z\.confirmed\?\+\+actualNumber:null/);
  assert.match(map,/const proven=ev\.filter\(x=>x\.confirmed\)/);
  assert.match(map,/const pending=ev\.filter\(x=>!x\.confirmed\)/);
  assert.match(map,/iconContent:x\.confirmed\?String\(x\.no\):''/);
});
