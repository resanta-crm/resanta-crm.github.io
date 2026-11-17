import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as contract from '../supabase/functions/crm-ai360-agent-v1/contract.mjs';
import * as conversation from '../supabase/functions/crm-ai360-agent-v1/conversation.mjs';
import * as history from '../supabase/functions/crm-ai360-agent-v1/history.mjs';
import * as controlCenter from '../supabase/functions/crm-ai360-agent-v1/control-center.mjs';
import {prepareRouteRequest} from '../supabase/functions/crm-ai360-agent-v1/route-tasks.mjs';
import * as planning from '../supabase/functions/crm-ai360-dialog-v4/scoped-planning.mjs';
import * as gps from '../supabase/functions/crm-ai360-dialog-v4/gps-evidence.mjs';
import * as catalog from '../supabase/functions/crm-ai360-dialog-v4/catalog.mjs';
import * as context from '../supabase/functions/crm-ai360-dialog-v4/context.mjs';
import * as managerSales from '../supabase/functions/crm-ai360-dialog-v4/manager-sales.mjs';
import {runToolCore} from '../supabase/functions/crm-ai360-dialog-v4/core.mjs';
import {dialogueName,clientMeetingTarget,clientMeetingMemory,shouldUseClientRiskAnswer} from '../supabase/functions/crm-ai360-dialog-v4/dialogue-core.mjs';
import {readTasks} from '../supabase/functions/crm-ai360-dialog-v4/task-read.mjs';

const OWNER='544fb1e2-ef70-44de-bc62-e0e1596a4bfc',TOKEN='local-test-session';
const pair=(kind,brief)=>({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({kind,brief,detail:'',offer:''})}]}],usage:{input_tokens:40,output_tokens:20}});
const tool=domain=>({output:[{type:'function_call',name:'crm_read',call_id:domain,arguments:JSON.stringify({domain,manager:null,month:null,client:null,level:null,group:null,subgroup:null,offset:0})}],usage:{input_tokens:40,output_tokens:20}});
function backend(outputs,options={}){
 const calls=[],profile={id:OWNER,name:'Александр Паюшин',role:'boss',region:'Витебск'};let modelCalls=0,director;
 const svc={auth:{getUser:async()=>({data:{user:{id:OWNER}}})},from:table=>{
  const b={select:()=>b,eq:()=>b,order:()=>b,lt:()=>b,maybeSingle:async()=>({data:table==='users'?profile:{enabled:false}}),limit:async()=>table==='tasks'?{data:[{title:'Первая задача',manager_name:'Руднев',due_date:'2026-11-17'},{title:'Вторая задача',manager_name:'Руднев',due_date:'2026-11-17'}],count:2}:{data:[{name:'Руднев'}]}};return b;
 },rpc:async(name,args)=>{calls.push({name,args});
  if(name==='crm_ai360_core_claim_v2')return {data:{allowed:true,claim_id:'local-claim'}};
  if(name==='crm_ai360_core_finish_v2')return {data:{ok:true}};
  if(name==='crm_ai360_sales_kpi_snapshot_v1')return options.sales?{data:options.sales}:{error:{message:'sales transport failed'}};
  if(name==='crm_ai360_debt_snapshot_v1')return {data:{scope:'network',debt_summary:{amount:10},manager_totals:[],overdue_debtors:[],warnings:[]}};
  if(name==='crm_ai360_operations_snapshot_v1')return {data:{scope:'network',period:'2026-11',task_summary:{open:2},client_summary:{},debt_summary:{},route_summary:{},visit_summary:{},declining_clients:[]}};
  throw Error('unexpected RPC '+name);
 }};
 const fetcher=async(url,init)=>{
  if(url.includes('/functions/v1/'))return options.upstream?options.upstream():director(new Request(url,init));
  if(url==='https://api.openai.com/v1/responses'){modelCalls++;assert.ok(outputs.length,'unexpected extra model request');return new Response(JSON.stringify(outputs.shift()),{headers:{'Content-Type':'application/json'}});}
  throw Error('unexpected URL');
 };
 function load(slug,imports){let handler;const code=fs.readFileSync('supabase/functions/'+slug+'/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
  vm.runInNewContext(code,{...imports,createClient:()=>svc,fetch:fetcher,Deno:{env:{get:k=>({SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'local-service',SUPABASE_ANON_KEY:'local-public',OPENAI_API_KEY:'local-provider'}[k])},serve:f=>handler=f},Response,Request,AbortSignal,Intl,Date,console});return handler;
 }
 director=load('crm-ai360-dialog-v4',{...planning,...gps,...catalog,...context,...managerSales,runToolCore,dialogueName,clientMeetingTarget,clientMeetingMemory,shouldUseClientRiskAnswer,readTasks,resolveClient:async()=>({error:'not_found'}),resolveAnyClient:async()=>({error:'not_found'})});
 const gateway=load('crm-ai360-agent-v1',{...contract,...conversation,...history,...controlCenter,prepareRouteRequest});
 const ask=question=>gateway(new Request('https://fixture.supabase.co/functions/v1/crm-ai360-agent-v1',{method:'POST',headers:{Authorization:'Bearer '+TOKEN,'Content-Type':'application/json',Origin:'https://resanta-crm.by'},body:JSON.stringify({action:'ask',protocol:'lera_dialogue_v2',question})}));
 return {ask,calls,modelCalls:()=>modelCalls};
}

test('failed required sales cannot become zero figures using unrelated successful evidence',async()=>{
 const f=backend([tool('sales'),tool('operations'),pair('crm','Продажи за ноябрь — 0 BYN.')]);
 const response=await f.ask('Покажи продажи за ноябрь'),data=await response.json();
 assert.equal(response.status,503);assert.equal(data.error,'sales_source_unavailable');assert.equal(data.answer_verified,false);assert.equal(data.read_only,true);
 assert.deepEqual(data.failed_domains,['sales']);assert.deepEqual(data.partial_sources,['operations']);assert.equal(data.answer,undefined);
 assert.equal(f.modelCalls(),3);assert.equal(f.calls.filter(x=>x.name==='crm_ai360_core_claim_v2').length,1);assert.equal(f.calls.filter(x=>x.name==='crm_ai360_core_finish_v2').length,1);
 assert.equal(f.calls.find(x=>x.name==='crm_ai360_core_finish_v2').args.p_actual_rub,0.036);
});

test('a financial failure also blocks model chat/clarification answers and action branches',async()=>{
 for(const kind of ['chat','clarification','action']){
  const last=kind==='action'?{output:[{type:'function_call',name:'prepare_action',call_id:'action',arguments:JSON.stringify({question:'Подготовь задачу проверить продажи'})}],usage:{input_tokens:40,output_tokens:20}}:pair(kind,'Продажи равны нулю.');
  const f=backend([tool('sales'),tool('operations'),last]),response=await f.ask('Какие продажи за ноябрь?'),data=await response.json();
  assert.equal(response.status,503,kind);assert.equal(data.error,'sales_source_unavailable',kind);assert.equal(data.answer_verified,false);
 }
});

test('a generic overview fails closed after sales failure even when another source succeeds',async()=>{
 const f=backend([tool('sales'),tool('operations'),pair('crm','Есть открытые задачи для обсуждения.')]);
 const response=await f.ask('Подготовь меня к совещанию'),data=await response.json();
 assert.equal(response.status,503);assert.equal(data.error,'sales_source_unavailable');assert.equal(data.answer_verified,false);
 assert.deepEqual(data.failed_domains,['sales']);assert.deepEqual(data.partial_sources,['operations']);
});

test('monthly plan and plan-completion questions require sales even without the word sales',async()=>{
 for(const question of ['Какой план на месяц?','Какой процент выполнения плана?']){
  const f=backend([tool('sales'),tool('operations'),pair('crm','План продаж — 0 BYN.')]);
  const response=await f.ask(question),data=await response.json();
  assert.equal(response.status,503,question);assert.equal(data.error,'sales_source_unavailable');assert.equal(data.answer_verified,false);
 }
});

test('generic briefings fail closed independently of numeric or textual zero wording',async()=>{
 for(const answer of ['План продаж — 0 BYN.','Продаж за ноябрь не было.','Продажи отсутствуют.','Ни одной реализации.','Разберите 2 задачи по продажам.']){
  const f=backend([tool('sales'),tool('operations'),pair('crm',answer)]),response=await f.ask('Подготовь меня к совещанию'),data=await response.json();
  assert.equal(response.status,503,answer);assert.equal(data.error,'sales_source_unavailable');assert.equal(data.answer,undefined);
 }
});

test('incidental sales failure preserves explicitly selected successful debt/tasks sources',async()=>{
 for(const [question,domain,answer] of [
  ['Покажи задолженность','debt','Задолженность — 10 BYN.'],
  ['Какие задачи открыты?','tasks','Открыто 2 задачи.'],
  ['Какие задачи открыты?','tasks','Разберите 2 задачи по продажам.'],
  ['Какие задачи открыты?','tasks','Продажи временно недоступны; открыто 2 задачи.']
 ]){
  const f=backend([tool('sales'),tool(domain),pair('crm',answer)]),response=await f.ask(question),data=await response.json();
  assert.equal(response.status,200,question);assert.equal(data.error,undefined);assert.equal(data.answer_verified,false);assert.deepEqual(data.failed_domains,['sales']);
 }
});

test('a named non-sales source must itself succeed before an unrelated answer may continue',async()=>{
 const f=backend([tool('sales'),tool('operations'),pair('crm','Есть открытые задачи.')]),response=await f.ask('Покажи задолженность'),data=await response.json();
 assert.equal(response.status,503);assert.equal(data.error,'sales_source_unavailable');
});

test('confirmed zero sales are preserved when the sales source actually returned them',async()=>{
 const f=backend([tool('sales'),pair('crm','Продажи за ноябрь — 0 BYN.')],{sales:{month:'2026-11',network_revenue:0,managers:[{manager_name:'Руднев',actual:0,plan:100}],freshness:{last_success_at:'2026-11-17'}}});
 const response=await f.ask('Покажи продажи за ноябрь'),data=await response.json();
 assert.equal(response.status,200);assert.match(data.answer,/0/);assert.deepEqual(data.failed_domains,[]);
});

test('gateway preserves only authorized domain names, never raw tool error text',async()=>{
 const f=backend([],{upstream:()=>new Response(JSON.stringify({error:'sales_source_unavailable',failed_domains:['sales','sales','RAW TOOL ERROR'],partial_sources:['operations','https://unsafe.invalid']}),{status:503})});
 const response=await f.ask('Покажи продажи за ноябрь'),data=await response.json();
 assert.equal(response.status,503);assert.deepEqual(data.failed_domains,['sales']);assert.deepEqual(data.partial_sources,['operations']);assert.equal(data.answer_verified,false);
 assert.doesNotMatch(JSON.stringify(data),/RAW TOOL ERROR|unsafe/);
});

function uiFixture(result){
 const answers=[],statuses=[];let invokes=0;
 const root={addEventListener(){},crmAI360GreetingV1:()=>({id:OWNER})},ctx={window:root,currentUser:{id:OWNER},navigator:{userAgent:'Mac'},document:{getElementById:()=>({style:{display:'block'}}),addEventListener(){}},
  db:{auth:{getSession:async()=>({data:{session:{access_token:TOKEN}}})},functions:{invoke:async()=>{invokes++;return result;}}},console,Date};
 vm.runInNewContext(fs.readFileSync('assets/143-resanta-ai360-unified-dialog-v1.js','utf8'),ctx);
 const ui={answer:(text,options)=>answers.push({text,options}),textStatus:text=>statuses.push(text)};
 return {root,answers,statuses,ui,invokes:()=>invokes};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('partial answer and its spoken summary/detail keep a short source warning',async()=>{
 const f=uiFixture({data:{protocol:'lera_dialogue_v2',answer:'Есть открытые задачи.',brief:'Есть открытые задачи.',detail:'Обсудите две задачи.',followup_question:'Рассказать подробнее?',read_only:true,answer_verified:false,failed_domains:['sales','RAW ERROR'],partial_sources:['operations']}});
 f.root.crmAI360UnifiedDialogHandleV1('Подготовь меня к совещанию',f.ui);await tick();
 assert.match(f.answers[0].text,/Не удалось проверить: продажи/);assert.match(f.answers[0].text,/Показана часть данных: задачи и маршруты/);assert.doesNotMatch(f.answers[0].text,/RAW ERROR/);
 assert.match(f.statuses.at(-1),/источники проверены частично/);
 if(f.answers[0].options.speechSummary)assert.match(f.answers[0].options.speechSummary,/Не удалось проверить/);
 f.root.crmAI360UnifiedDialogHandleV1('Расскажи подробнее',f.ui);assert.match(f.answers[1].text,/Не удалось проверить: продажи/);assert.equal(f.invokes(),1);
});

test('complete answers keep their previous presentation; missing sales get a clear error',async()=>{
 const complete=uiFixture({data:{protocol:'lera_dialogue_v2',answer:'Проверены задачи.',read_only:true,answer_verified:false,failed_domains:[],partial_sources:[]}});
 complete.root.crmAI360UnifiedDialogHandleV1('Проверь задачи',complete.ui);await tick();assert.equal(complete.answers[0].text,'Проверены задачи.');assert.match(complete.statuses.at(-1),/данные CRM/);
 const failed=uiFixture({error:{context:{json:async()=>({error:'sales_source_unavailable',failed_domains:['sales']})}}});
 failed.root.crmAI360UnifiedDialogHandleV1('Покажи продажи',failed.ui);await tick();assert.match(failed.answers[0].text,/Продажи сейчас не удалось проверить/);assert.doesNotMatch(failed.answers[0].text,/равны нулю|0 BYN/);
});
