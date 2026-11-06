import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const src=read('assets/181-gps-director360-v1.js');
const SQL=read('supabase/migrations/20261105_gps_director360_evidence_v1.sql');
const REV=read('supabase/migrations/20261105_gps_director360_stop_reviews_v1.sql');
const LIVE=read('supabase/migrations/20261105_gps_director360_live_stops_v1.sql');
const u='payushin_ar@resanta.ru';
const d={
 version:'gps-director360-evidence-v2',
 period:{from:'2026-10-30',to:'2026-11-05',manager:'all'},
 kpi:{planned:145,reports:143,gps_confirmed:64,geo_eligible:79,active_planned:0,active_no_geo:0,review:85,no_coordinates:66,
  verified_technical:0,unidentified_stops:76,resolved_stops:0,stale_days:9},
 urgent:{manager:'Руднев',review:31,no_coordinates:24,unidentified:29},
 managers:[
 {manager_name:'Ачинович',geo_eligible:27,planned:50,reports:50,gps_confirmed:22,attention_visits:28,no_coordinates:23,unidentified_stops:39,verified_technical:0},
 {manager_name:'Руднев',geo_eligible:25,planned:49,reports:49,gps_confirmed:19,attention_visits:31,no_coordinates:24,unidentified_stops:29,verified_technical:0},
 {manager_name:'Шкуран',geo_eligible:27,planned:46,reports:44,gps_confirmed:23,attention_visits:26,no_coordinates:19,unidentified_stops:8,verified_technical:0}
 ],
 weeks:[{start:'2026-10-30',end:'2026-11-05',manager:'Руднев',planned:49,reports:49,gps_confirmed:19,issues:30}],
 problems:[{key:'no_coordinates',label:'Нет доверенных координат ТТ',count:66}],
 cases:[{route_plan_id:'r1',workday_id:'w1',date:'2026-11-05',manager:'Руднев',client:'Пример ТТ',address:'ул. Тестовая',issue:'report_without_gps'}],
 stops:[{workday_id:'w1',date:'2026-11-05',manager:'Руднев',seq:2,minutes:52,type:'unidentified',review_action:null}],
 generated_at:'2026-11-05T17:30:00Z'
};
function fixture({role='boss',email=u,visible=true}={}){
 let overview=null;const handlers={},calls=[],tags=new Map();
 const panel={
  style:{display:visible?'block':'none'},firstChild:null,
  querySelector:()=>null,
  appendChild(node){this.legacy=node;},
  insertBefore(node){overview=node;},
 };
 const page={classList:{contains:k=>k==='active'}};
 const date={value:'2026-11-05'},start={value:'2026-10-30'},manager={value:'all'};
 const reviewInputs={
  'g360-review-action':{value:'technical_verified'},
  'g360-review-comment':{value:'Проверил: подтверждённый техперерыв у маршрута.'},
  'g360-review-due':{value:''}
 };
 const doc={
  readyState:'loading',head:{appendChild(node){tags.set(node.id,node)}},
  getElementById(id){if(id==='page-gps-control')return page;if(id==='gps-director-view-v236427')return panel;
   if(id==='gps-dir-from-v236427')return start;if(id==='gps-dir-to-v236427')return date;
   if(id==='gps-dir-manager-v236427')return manager;
   if(id==='gps360-director-v1')return overview;if(id==='gps360-director-style-v1')return tags.get(id);
   return reviewInputs[id]||null;},
  createElement(tag){return {id:'',tag,style:{},innerHTML:'',dataset:{},appendChild(){},
    setAttribute(){},querySelector(){return null;}};},
  addEventListener(k,fn){(handlers[k]??=[]).push(fn)},
 };
 const w={currentProfile:{role,email},confirm:()=>true,RESANTA_GPS_DIRECTOR_REPORT_V236427:{
  async loadDetails(){},downloadExcel(){}},db:{
  rpc:async(name,args)=>{calls.push({name,args});
   if(name==='gps_director360_evidence_v20261106')return{data:d,error:null};
   if(name==='gps_director360_stop_decide_v20261105')return{data:{ok:true,action:'technical_verified'},error:null};
   throw new Error('Unexpected RPC '+name)}
 }};
 vm.runInNewContext(src,{document:doc,window:w,console,Date,Intl,Math,Number,Set,Map,
   setTimeout(fn){fn()}},{filename:'181-gps-director360-v1.js'});
 function click(selector,dataset){
  const target={dataset:dataset||{},closest(q){return q==='#gps360-director-v1'?overview:
   q===selector?target:null}};
  for(const f of handlers.click||[])f({target});
 }
 return{api:w.RESANTA_GPS_DIRECTOR360_V1,doc,calls,w,click,
  html:()=>overview?.innerHTML||'',hasPanel:()=>!!overview};
}
const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();await new Promise(resolve=>setImmediate(resolve))};
test('GPS 360 parses; route screen remains fallback and cache-busted in index',()=>{
 assert.doesNotThrow(()=>new vm.Script(src));
 const old=read('assets/124-gps-director-report-v236427.js');
 assert.match(old,/RESANTA_GPS_DIRECTOR360_V1\?\.open/);
 assert.match(old,/else load\(false\)/);
 assert.match(old,/downloadExcel:exportExcel/);
 const index=read('index.html');
 assert.match(index,/181-gps-director360-v1\.js\?v=20261105-director360-1/);
 assert.match(index,/124-gps-director-report-v236427\.js\?v=20261105-director360-1/);
});
test('unauthorized role sees no new director screen and calls no RPC',async()=>{
 const f=fixture({role:'manager',email:'rudnev@resanta.ru'});
 assert.equal(f.api.open(),false);assert.equal(f.hasPanel(),false);
 assert.equal(f.calls.length,0);
});
test('hidden tab has no background GPS processing or AI calls',async()=>{
 const f=fixture({visible:false});
 assert.equal(f.api.open(),false);assert.equal(f.calls.length,0);
});
test('source-based KPIs and six-week manager chart load without writing GPS or decisions',async()=>{
 const f=fixture();await f.api.open();
 const html=f.html();
 assert.ok(html.includes('GPS · Директорский обзор'));
 for(const x of ['Плановых ТТ','Визитов по отчётам','GPS подтверждено','Неопознанные стоянки','Руднев','66','64','143','145']){
  assert.ok(html.includes(x),'Missing '+x)
 }
 assert.match(html,/Динамика по менеджерам/);
 assert.match(html,/Коротко за период/);
 assert.match(html,/Менеджеры · детализация по нажатию/);
 assert.deepEqual(f.calls.map(c=>c.name),['gps_director360_evidence_v20261106']);
});
test('chart switches among visit reports, independent GPS and problems',async()=>{
 const f=fixture();await f.api.open();
 f.click('[data-g360-metric]',{g360Metric:'gps_confirmed'});
 assert.match(f.html(),/aria-pressed="true">GPS<\/button>/);
 f.click('[data-g360-metric]',{g360Metric:'issues'});
 assert.match(f.html(),/aria-pressed="true">Отклонения<\/button>/);
 assert.equal(f.calls.length,1,'UI filters do not cause automatic backend refresh');
});
test('opening specific disputed manager and unclassified stop is an explicit drilldown',async()=>{
 const f=fixture();await f.api.open();
 f.click('[data-g360-manager]',{g360Manager:'Руднев'});
 assert.match(f.html(),/Пример ТТ/);
 assert.match(f.html(),/data-gps-brief-case="r1"/);
 f.click('[data-g360-details]',{g360Details:'stops'});
 assert.match(f.html(),/52 мин/);
 f.click('[data-g360-stop]',{g360Stop:'w1|2'});
 assert.match(f.html(),/g360-review-comment/);
 assert.equal(f.calls.length,1,'opening detail and editor has no write side effects');
});
test('director action makes just one server-side decision and preserves GPS source',async()=>{
 const f=fixture();await f.api.open();
 f.click('[data-g360-details]',{g360Details:'stops'});
 f.click('[data-g360-stop]',{g360Stop:'w1|2'});
 f.click('[data-g360-save]',{g360Save:'w1|2'});
 await flush();
 const writes=f.calls.filter(c=>c.name==='gps_director360_stop_decide_v20261105');
 assert.equal(writes.length,1);
 assert.equal(writes[0].args.p_action,'technical_verified');
 assert.equal(writes[0].args.p_stop_seq,2);
 assert.equal(writes[0].args.p_workday_id,'w1');
});
test('SQL separates reports and GPS and keeps technical stops director-verified',()=>{
 assert.match(SQL,/f\.visit_id IS NOT NULL\) report_exists/);
 assert.match(SQL,/f\.actual_minutes,0\)>=2\) gps_session/);
 assert.match(SQL,/THEN 'unidentified'/);
 assert.match(SQL,/r\.workday_id=d\.id AND r\.stop_seq/);
 assert.match(SQL,/review_action='technical_verified'/);
 assert.match(SQL,/gps_director360_classify_live_stops_v20261105/);
 assert.match(LIVE,/gps_detect_workday_stops/);
 assert.doesNotMatch(LIVE,/FROM public.gps_workday_aggregates/);
 assert.match(SQL,/p_to-p_from>41/);
 assert.match(SQL,/auth\.uid\(\) IS NULL OR NOT public\.gps_has_control_access\(\)/);
 assert.doesNotMatch(SQL,/DELETE FROM|UPDATE public\.gps_track_points|TRUNCATE/);
 assert.match(REV,/ENABLE ROW LEVEL SECURITY/);
 assert.match(REV,/REVOKE ALL ON TABLE .* FROM PUBLIC,anon,authenticated/);
 assert.match(REV,/INSERT INTO public\.gps_director360_stop_reviews_v1/);
 assert.doesNotMatch(REV,/DELETE FROM public\.gps_track_points|UPDATE public\.visits|UPDATE public\.route_plans/);
});

test('stop review requires completed GPS day and does not overwrite legacy stop classifications',()=>{
 assert.match(REV,/v_workday\.status='active'/);
 assert.match(REV,/gps_director360_classify_live_stops_v20261105/);
 assert.doesNotMatch(REV,/UPDATE\s+public\.gps_stop_classifications_v236417|UPDATE\s+public\.gps_workday_aggregates/i);
 assert.doesNotMatch(SQL,/UPDATE\s+public\.gps_workday_aggregates|DELETE\s+FROM\s+public\.gps_track_points/i);
});
