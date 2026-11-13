import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as contract from '../supabase/functions/crm-ai360-agent-v1/contract.mjs';
import * as conversation from '../supabase/functions/crm-ai360-agent-v1/conversation.mjs';
import * as history from '../supabase/functions/crm-ai360-agent-v1/history.mjs';
import {controlCenterPlanRequest,readControlCenterPlan} from '../supabase/functions/crm-ai360-agent-v1/control-center.mjs';
import {agentPrincipal,AGENT360_OWNER_ID} from '../supabase/functions/crm-ai360-agent-v1/contract.mjs';
const owner={id:AGENT360_OWNER_ID,name:'Александр Паюшин',role:'boss',email:'payushin_ar@resanta.ru'};
const hint='\nКонтекст интерфейса, не подтверждение цифр: '+JSON.stringify({screen:'Центр управления',sales_month:'2026-11'});
const input={question:'Объясни общий процент выполнения плана продаж здесь за выбранный месяц. Что входит в этот итог?'+hint};
const request=()=>controlCenterPlanRequest(input,agentPrincipal(owner.id,owner),owner);
const kpi=()=>({version:'kpi360-visual-v2',month:'2026-11',latest_sales_month:'2026-11',sales:[
 {manager_name:'Ачинович',shipment:42515.53,shipment_plan:105000},
 {manager_name:'Руднев',shipment:58264.23,shipment_plan:167000},
 {manager_name:'Шкуран',shipment:44745.29,shipment_plan:89000}]});
const tri=()=>({end_month:'2026-11',available_months:['2026-11'],items:[{current_revenue:586535.9}],selected_month_plans:[{plan_amount:700000}]});
function db(sales=kpi(),shop=tri(),error=null){
 const calls=[];
 return {calls,rpc(name,args){calls.push({name,args});return {abortSignal(signal){assert.ok(signal instanceof AbortSignal);return Promise.resolve({data:name==='triovist_get_dashboard'?shop:sales,error});}};}};
}
test('combined card is 69%, not the 40.3% field-team subtotal',async()=>{
 const client=db(),r=await readControlCenterPlan(client,request());
 assert.equal(r.totals.percent,69);assert.equal(r.totals.plan,1061000);
 assert.ok(Math.abs(r.totals.actual-732060.95)<0.000001);
 assert.match(r.answer,/69%/);assert.match(r.answer,/Триовист учтён один раз/);
 assert.equal(r.answer_verified,true);assert.deepEqual(r.domains_used,['sales','triovist']);
 assert.deepEqual(client.calls.map(x=>x.name).sort(),['crm_manager_kpi360_dashboard_v2','triovist_get_dashboard']);
});
test('field manager receives only own row and never calls Triovist',async()=>{
 const profile={id:'19dd9943-99ae-47c4-a39c-4f82a11059a6',name:'Руднев',role:'manager',region:'Витебск'};
 const card=controlCenterPlanRequest(input,agentPrincipal(profile.id,profile),profile),client=db();
 assert.deepEqual(card.managers,['Руднев']);assert.equal(card.tri,false);
 const r=await readControlCenterPlan(client,card);
 assert.equal(r.totals.plan,167000);assert.equal(r.totals.actual,58264.23);
 assert.equal(client.calls.length,1);assert.doesNotMatch(r.answer,/Шкуран|Ачинович|Триовист/);
});
test('screen metadata cannot grant Triovist or principal access',()=>{
 const peer={...owner,id:'a24954b8-2fe1-4852-b629-d8f351e1bd36',name:'Руководство компании',email:'petrovichev@resanta.ru',region:'Все филиалы',access_scope:'standard'};
 const p=agentPrincipal(peer.id,peer,{id:peer.id,email:peer.email,email_confirmed_at:'2026-01-01'});
 assert.equal(controlCenterPlanRequest(input,p,peer).tri,false);
 assert.equal(controlCenterPlanRequest(input,null,owner),null);
 assert.equal(controlCenterPlanRequest(input,agentPrincipal(owner.id,owner),{...owner,id:'foreign'}),null);
});
test('other questions keep their existing agent route',()=>{
 for(const q of ['Привет','Создай план продаж','Открой продажи','План продаж Руднева здесь','Сравни план продаж за прошлый месяц','Какой план продаж у клиента здесь']){
  assert.equal(controlCenterPlanRequest({question:q+hint},agentPrincipal(owner.id,owner),owner),null,q);
 }
 assert.equal(controlCenterPlanRequest({question:'Объясни процент плана продаж'},agentPrincipal(owner.id,owner),owner),null);
});
test('incomplete or stale sources never become a verified combined total',async()=>{
 for(const [sales,shop] of [[{...kpi(),latest_sales_month:'2026-10'},tri()],
  [kpi(),{...tri(),available_months:[]}],[kpi(),{...tri(),selected_month_plans:[]}],
  [{...kpi(),sales:kpi().sales.slice(1)},tri()],
  [{...kpi(),sales:kpi().sales.map(x=>({...x,shipment_plan:0}))},tri()],
  [kpi(),{...tri(),items:[{current_revenue:null}]}]]){
  const r=await readControlCenterPlan(db(sales,shop),request());
  assert.equal(r.error,'control_center_sources_unavailable');assert.equal(r.answer_verified,undefined);
 }
 assert.equal((await readControlCenterPlan(db(kpi(),tri(),{message:'forbidden'}),request())).status,503);
});
test('selected month is passed to both sources',async()=>{
 const card={...request(),month:'2026-10'},sales={...kpi(),month:'2026-10'},shop={...tri(),end_month:'2026-10',available_months:['2026-10']},client=db(sales,shop);
 assert.equal((await readControlCenterPlan(client,card)).month,'2026-10');
 assert.equal(client.calls[0].args.p_month,'2026-10');assert.equal(client.calls[1].args.p_end_month,'2026-10');
});
test('authenticated gateway uses caller JWT, one settled claim, no upstream/model call',async()=>{
 const caller=db(),calls=[];let serve;
 const svc={auth:{getUser:async()=>({data:{user:{id:owner.id}}})},from(table){
  const b={select:()=>b,eq:()=>b,maybeSingle:async()=>({data:table==='users'?owner:{enabled:false}})};return b;
 },rpc:async(name,args)=>{calls.push({name,args});return {data:name==='crm_ai360_core_claim_v2'?{allowed:true,claim_id:'claim-card'}:{ok:true}};}};
 const token='test-authenticated-caller-jwt',env={SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_ANON_KEY:'public-key',SUPABASE_SERVICE_ROLE_KEY:'service-key'};
 const code=fs.readFileSync('supabase/functions/crm-ai360-agent-v1/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
 vm.runInNewContext(code,{...contract,...conversation,...history,controlCenterPlanRequest,readControlCenterPlan,
  createClient(url,key,options){if(key==='service-key')return svc;assert.equal(key,'public-key');assert.equal(options.global.headers.Authorization,'Bearer '+token);return caller;},
  Deno:{env:{get:k=>env[k]},serve:f=>{serve=f;}},Request,Response,AbortSignal,
  fetch:()=>{throw Error('unexpected model/upstream');}});
 const response=await serve(new Request('https://fixture.supabase.co',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify({...input,action:'ask'})}));
 const r=await response.json();assert.equal(response.status,200);assert.equal(r.totals.percent,69);
 assert.equal(r.protocol,'lera_dialogue_v2');assert.equal(r.route_tier,'network_director');
 assert.deepEqual(calls.map(x=>x.name),['crm_ai360_core_claim_v2','crm_ai360_core_finish_v2']);
 assert.equal(calls[1].args.p_actual_rub,0);assert.equal(calls[1].args.p_status,'ok');
});
