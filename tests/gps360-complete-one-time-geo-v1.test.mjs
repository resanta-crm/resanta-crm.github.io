import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import vm from 'node:vm';
const get=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const core=get('assets/01-crm-core.js');
const manager=get('assets/183-gps-store-verify-v1.js');
const director=get('assets/181-gps-director360-v1.js');
const history=get('supabase/migrations/20261106_gps360_safe_history_v1.sql');
const onsite=get('supabase/migrations/20261106_gps360_store_onsite_v1.sql');
const v2=get('supabase/migrations/20261106_gps360_evidence_completed_v2.sql');
const stops=get('supabase/migrations/20261106_gps360_probable_stops_v1.sql');

test('manager on-site module, director dashboard and core parse',()=>{
 assert.doesNotThrow(()=>new vm.Script(manager));
 assert.doesNotThrow(()=>new vm.Script(director));
 assert.doesNotThrow(()=>new vm.Script(core));
});
test('core visit, route and CRM business logic byte-identical except explicitly agreed non-blocking GPS hooks',()=>{
 const before=execFileSync('git',['show','origin/main:assets/01-crm-core.js'],{encoding:'utf8',maxBuffer:12*1024*1024});
 let normalized=core;
 // The manager feedback release changes only the store picker, its exact route
 // selection and the new-client form. Keep the GPS guard over everything else.
 const restore=(start,end)=>{
  const a=normalized.indexOf(start),b=normalized.indexOf(end,a+start.length);
  const x=before.indexOf(start),y=before.indexOf(end,x+start.length);
  assert.ok(a>=0&&b>a&&x>=0&&y>x,`Cannot isolate ${start}`);
  normalized=normalized.slice(0,a)+before.slice(x,y)+normalized.slice(b);
 };
 // A CI-only PR may leave CRM core byte-identical to main. Normalize only
 // when the branch actually changed core; otherwise retain exact equality.
 if(core!==before){
  normalized=normalized.replace('let visitSelectionKeyV3=null;\n','');
  restore('function openAddVisit(clientId){','// ===== Проверка на НМС');
  normalized=normalized.replace("      &&(!visitSelectionKeyV3||window.crmRouteCatalogV3.rowKeys(r).includes(visitSelectionKeyV3))\n",'');
  restore('function openAddClient(){','// openAddTask defined above');
  restore('// Сверка замера с геозоной клиента.','// Записать замер и пересчитать эталон.');
  restore('async function checkinHere(','// Дата в человеческом виде');
  normalized=normalized.replace(
    '  const qvGpsPoint=qvGeo?await gpsResolveRoutePointForVisit(c,qvMatchedPlan):qvMatchedPlan;\n  const qvGpsCheck=gpsCheckAgainstClient(c,qvGeo,qvGpsPoint);',
    '  const qvGpsCheck=gpsCheckAgainstClient(c,qvGeo,qvMatchedPlan);'
  );
  normalized=normalized.replace(
    '  if(qvGeo&&c&&(!qvMatchedPlan?.physical_point_id||qvGpsPoint?.gps_anchor_linked_exact===true)){',
    '  if(qvGeo&&c){'
  );
  normalized=normalized.replace(
    '  const resolvedVisitPoint=geo?await gpsResolveRoutePointForVisit(c,matchedVisitPlan):matchedVisitPlan;\n  const gchk=gpsCheckAgainstClient(c,geo,resolvedVisitPoint);',
    '  const gchk=gpsCheckAgainstClient(c,geo,matchedVisitPlan);'
  );
 }
 assert.equal(normalized,before,'Never replace original visit transactions, routes, parsers or clients');
 const events=(core.match(/resanta-gps360-store-check/g)||[]);
 assert.equal(events.length,3,'Only check-in and two successful visit save routes');
 assert.match(core,/qvMatchedPlan\?\.physical_point_id/);
 assert.match(core,/matchedVisitPlan\?\.physical_point_id/);
 assert.match(core,/gpsResolveRoutePointForVisit/);
 assert.match(core,/gps_anchor_linked_exact/);
 assert.match(core,/gps_anchor_verified===true/);
 assert.match(core,/const canSample=!checkinPlan/);
});
test('history: only missing physical store coordinates, 3 independent days, <=35m spread, no nearby candidate or known TT',()=>{
 assert.match(history,/COUNT\(DISTINCT visit_date\)>=3/);
 assert.match(history,/MAX\(lng\)\)<=35/);
 assert.match(history,/FROM grouped peer/);
 assert.match(history,/other\.id<>p\.id/);
 assert.match(history,/g\.lat,g\.lng,other\.lat,other\.lng\)<50/);
 assert.match(history,/p\.lat IS NULL AND p\.lng IS NULL/);
 assert.match(history,/v\.gps_accuracy BETWEEN 1 AND 40/);
 assert.match(history,/gps360_store_geo_audit_v1/);
 assert.match(history,/old_row/);
 assert.doesNotMatch(history,/\bUPDATE\s+(public\.)?(gps_track_points|visits|route_plans)\b/i);
});
test('manager confirmation is exact physical TT and a director-approved route',()=>{
 assert.match(onsite,/lower\(trim\(manager_name\)\)=lower\(trim\(v_user\.name\)\)/);
 assert.match(onsite,/approved IS TRUE AND review_status='approved'/);
 assert.match(onsite,/v_plan\.physical_point_id/);
 assert.match(onsite,/UNIQUE\(route_plan_id,manager_id\)/);
 assert.match(onsite,/p_accuracy_m NOT BETWEEN 1 AND 60/);
 assert.match(onsite,/v_route\.visit_date<>timezone\('Europe\/Minsk',p_observed_at\)::date/);
 assert.match(onsite,/auth\.uid\(\)/);
});
test('manager confirms actual independent native GPS, not arbitrary client browser coordinates',()=>{
 assert.match(onsite,/g\.is_valid IS TRUE/);
 assert.match(onsite,/coalesce\(g\.is_mock,false\)=false/);
 assert.match(onsite,/g\.accuracy BETWEEN 1 AND 65/);
 assert.match(onsite,/gps_haversine_m\(g\.lat,g\.lng,v_action\.observed_lat,v_action\.observed_lng\)<=75/);
 assert.match(onsite,/IF v_matched<2 THEN/);
 assert.match(onsite,/status','pending_sync'/);
 assert.match(onsite,/other\.lat,other\.lng/);
 assert.match(onsite,/status='conflict'/);
 assert.doesNotMatch(onsite,/\bUPDATE\s+(public\.)?(gps_track_points|visits|route_plans)\b/i);
});
test('manager one-time prompt and offline queue do not erase later unsent requests',()=>{
 assert.match(manager,/resanta-gps360-store-check/);
 assert.match(manager,/marked\(evt\.route_plan_id\)/);
 assert.match(manager,/data-g-yes/);
 assert.match(manager,/data-g-no/);
 assert.match(manager,/data-g-later/);
 assert.match(manager,/resanta_gps360_geo_queue_v1/);
 assert.match(manager,/pending\.push\(\.\.\.rows\.slice\(i\+1\)\)/);
 assert.match(manager,/addEventListener\('online'/);
 assert.match(manager,/gps360_store_onsite_retry_v20261106/);
 assert.match(manager,/plan\.approved===true && plan\.review_status==='approved'/);
});
test('new director summary excludes active workday from problems AND weekly chart',()=>{
 assert.match(v2,/gps-director360-evidence-v2/);
 assert.match(v2,/f\.workday_status IS DISTINCT FROM 'active'/);
 assert.match(v2,/d\.workday_status IS DISTINCT FROM 'active'/);
 assert.match(v2,/WHERE f\.workday_status IS DISTINCT FROM 'active'/);
 assert.match(v2,/active_planned/);
 assert.match(v2,/active_no_geo/);
 assert.match(v2,/geo_eligible/);
 assert.match(v2,/review_is_not_violation/);
 assert.match(v2,/NOT coordinates_issue/);
 assert.match(director,/gps_director360_evidence_v20261106/);
 assert.match(director,/Незавершённый день НЕ считается просрочкой/);
 assert.match(director,/На разбор руководителю/);
});
test('probable stop matching does not claim GPS confirmation or a manager violation',()=>{
 assert.match(stops,/v_count<>1 THEN v_probable:=null/);
 assert.match(stops,/visit_created_at/);
 assert.match(stops,/v_class:='probable_tt'/);
 assert.match(stops,/не равно независимому подтверждению/);
 assert.match(stops,/v_class:='unidentified'/);
 assert.doesNotMatch(stops,/UPDATE public\.gps_track_points|UPDATE public\.visits/i);
});
test('new functions protected and audit tables inaccessible directly to normal/anon clients',()=>{
 for(const sql of [history,onsite,v2,stops])assert.match(sql,/REVOKE ALL ON FUNCTION/i);
 for(const sql of [history,onsite])assert.match(sql,/ENABLE ROW LEVEL SECURITY/);
 assert.match(onsite,/REVOKE ALL ON public\.gps360_store_onsite_v1 FROM PUBLIC,anon,authenticated/);
 assert.match(history,/REVOKE ALL ON public\.gps360_store_geo_audit_v1 FROM PUBLIC,anon,authenticated/);
 assert.match(onsite,/REVOKE ALL ON FUNCTION public\.gps360_store_onsite_finalize_internal_v20261106\(uuid\)\s+FROM PUBLIC,anon,authenticated/);
});
test('site loads updated protected GPS UI and only one new on-site manager module',()=>{
 const index=get('index.html');
 assert.match(index,/01-crm-core\.js\?v=20261106-(?:gps360-geoonce1|manager-feedback)/);
 assert.match(index,/181-gps-director360-v1\.js\?v=20261106-director360-geo1/);
 assert.match(index,/183-gps-store-verify-v1\.js\?v=20261106-geoonce1/);
 assert.equal((index.match(/183-gps-store-verify-v1\.js/g)||[]).length,1);
 assert.match(index,/124-gps-director-report-v236427\.js/);
 assert.match(index,/02-mobile-gps-base\.js/);
});
