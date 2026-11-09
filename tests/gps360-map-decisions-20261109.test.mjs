import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const file=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const gps=file('assets/181-gps-director360-v1.js');
const details=file('assets/127-gps-director-case-review-v236440.js');
const brief=file('assets/124-gps-director-report-v236427.js');
const order=file('assets/26-gps-visit-order-v2364.js');
const viewer=file('assets/gps-viewer-v2360.html');
const map=file('assets/197-gps-map-unified-v1.js');
const migration=file('supabase/migrations/20261109_gps360_director_decisions_recheck_v1.sql');
const index=file('index.html');
test('all changed scripts and viewer inline application compile',()=>{
 for(const src of [gps,details,brief,order,map])assert.doesNotThrow(()=>new vm.Script(src));
 const scripts=[...viewer.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]).filter(x=>x.trim());
 assert.ok(scripts.length>=1);
 for(const src of scripts)assert.doesNotThrow(()=>new vm.Script(src));
});
test('map focus never returns silently when unavailable, caller passes workday and stop/plan',()=>{
 assert.match(map,/function open\(workday,opts=/);
 assert.match(map,/window\.alert/);
 assert.match(map,/window\.confirm/);
 assert.match(map,/gps-viewer-v2360\.html/);
 assert.match(order,/pendingFocus=Number\(no\)/);
 assert.match(order,/setTimeout\(\(\)=>window\.focusVisitV2364/);
 assert.match(order,/GPS-событие не найдено/);
 assert.match(gps,/data-g360-map-seq/);
 assert.match(gps,/crmGpsOpenFocusV20261109/);
 assert.match(details,/crmGpsOpenFocusV20261109/);
});
test('a 100 km GPS jump or long gap cannot become a direct blue line',()=>{
 const code=viewer.slice(viewer.indexOf('function validCoord('),viewer.indexOf('function key(){'));
 assert.ok(code.startsWith('function validCoord('));
 const points=[
 {lat:52,lng:30,t:'2026-11-04T10:00:00Z',accuracy:10,valid:true},
 {lat:52.0001,lng:30.0001,t:'2026-11-04T10:01:00Z',accuracy:10,valid:true},
 {lat:53,lng:31,t:'2026-11-04T10:02:00Z',accuracy:10,valid:true},
 {lat:53.0001,lng:31.0001,t:'2026-11-04T10:03:00Z',accuracy:10,valid:true}
 ];
 const coords=vm.runInNewContext(code+'safeTrackSegments('+JSON.stringify(points)+')',{});
 assert.ok(coords.breaks>=1);
 assert.equal(coords.segments.length,2);
 assert.equal(coords.valid.length,4);
 assert.match(viewer,/for\(const segment of clean\.segments\)/);
});
test('original GPS, manager visit and director decision remain independent',()=>{
 assert.match(migration,/gps_director_case_recheck_v20261109/);
 assert.match(migration,/gps_proximity_evidence/);
 assert.match(migration,/v_anchor_verified/);
 assert.match(migration,/p\.is_valid IS TRUE AND p\.is_mock IS NOT TRUE/);
 assert.match(migration,/p\.accuracy BETWEEN 0 AND 35/);
 assert.match(migration,/interval '2 minutes'/);
 assert.match(migration,/v_ambiguous/);
 assert.match(migration,/gps_status_changed',false/);
 assert.doesNotMatch(migration,/\b(?:UPDATE|DELETE FROM|TRUNCATE|DROP TABLE)\s+(?:public\.)?(?:gps_track_points|gps_points|gps_workdays|visits|route_plans)\b/i);
});
test('historic director case closure appears as closed without pretending GPS-confirmed',()=>{
 assert.match(migration,/resolved_verified','resolved_technical/);
 assert.match(migration,/closed_by_director/);
 assert.match(migration,/gps_verified_by_decision',false/);
 assert.match(gps,/caseState=x=>/);
 assert.match(gps,/closedCount/);
 assert.match(gps,/openReview\(\)/);
 assert.match(gps,/Закрытые/);
 assert.match(details,/Управленческий разбор закрыт/);
 assert.match(details,/gps_proximity_evidence/);
 assert.match(details,/resanta-gps-decision-updated/);
});
test('forgotten end of GPS day closes review only with actual corroboration and director authority',()=>{
 assert.match(migration,/gps_director360_stop_close_v20261109/);
 assert.match(migration,/p_action <> 'forgot_end_day'/);
 assert.match(migration,/distance_to_home_m/);
 assert.match(migration,/v_day\.status='active'/);
 assert.match(migration,/p_stop_seq/);
 assert.match(migration,/gps_director360_stop_reviews_v1/);
 assert.match(gps,/Забыл завершить GPS-день/);
 assert.match(gps,/stopClosed=x=>/);
 assert.match(gps,/gps_director360_stop_close_v20261109/);
});
test('published hooks and historical modules preserve their roles',()=>{
 for(const script of ['197-gps-map-unified-v1.js?v=20261109-map1',
 '181-gps-director360-v1.js?v=20261109-decisions1',
 '127-gps-director-case-review-v236440.js?v=20261109-decisions1'])assert.ok(index.includes(script),script);
 assert.match(order,/Внеплановые GPS-визиты без отчёта/);
 assert.match(brief,/resanta-gps-decision-updated/);
});
