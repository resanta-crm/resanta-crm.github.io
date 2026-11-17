import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as planning from '../supabase/functions/crm-ai360-dialog-v4/scoped-planning.mjs';
import * as gps from '../supabase/functions/crm-ai360-dialog-v4/gps-evidence.mjs';
import * as catalog from '../supabase/functions/crm-ai360-dialog-v4/catalog.mjs';
import * as context from '../supabase/functions/crm-ai360-dialog-v4/context.mjs';
import * as managerSales from '../supabase/functions/crm-ai360-dialog-v4/manager-sales.mjs';
import {runToolCore} from '../supabase/functions/crm-ai360-dialog-v4/core.mjs';
import {dialogueName} from '../supabase/functions/crm-ai360-dialog-v4/dialogue-core.mjs';
import {clientMeetingTarget,clientMeetingMemory,shouldUseClientRiskAnswer,runDialogueCore} from '../supabase/functions/crm-ai360-dialog-v4/dialogue-core.mjs';
import {riskEvidenceAnswer} from '../supabase/functions/crm-ai360-dialog-v4/scoped-planning.mjs';

const heard='лер слушай проблемы я не успеваю подготовь меня ко встрече с триовистом';
const tool=values=>({output:[{type:'function_call',name:'crm_read',call_id:'test',arguments:JSON.stringify({domain:'clients',manager:null,month:null,client:null,level:null,group:null,subgroup:null,offset:0,...values})}]});
const message=brief=>({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({kind:'crm',brief,detail:'Проверенные данные текущего клиента.',offer:''})}]}]});
const triovist={domain:'triovist',scope:'client_all',owner:'Триовист',plan:100,revenue:80};
const customer={domain:'client_detail',scope:'client_all',client_name:'НилСтрой ООО',items:[],current_byn:0};
function fixture(question=heard,options={}){
 const reads=[],requests=[],responses=options.responses||[message('Подготовка к встрече с Триовистом.')];
 const opts={question,history:[{role:'assistant',content:'Ранее обсуждали падающих клиентов Руднева.'}],
  memory:{manager:'Руднев',branch:'Витебск',client:'Чужой клиент',group:'Старая группа',offset:80,domain:'clients'},
  domains:options.domains||['triovist','client_detail','client_schedule','client_groups','stock','clients','operations','sales','debt'],
  model:'gpt-5.4-mini',readDefinition:{type:'function',name:'crm_read'},
  readTool:async args=>{reads.push(args);return options.read?options.read(args):args.domain==='triovist'?triovist:customer;},
  request:async body=>{requests.push(structuredClone(body));return responses.shift();}};
 return {opts,reads,requests};
}
test('the actual spoken request targets Triovist and cannot select the generic risk formatter',()=>{
 assert.deepEqual(clientMeetingTarget(heard),{client:'триовистом',domain:'triovist'});
 assert.equal(shouldUseClientRiskAnswer(heard,{domain:'clients'}),false);
 const risk={domain:'clients',source:'crm_ai360_client_risk_v41',period:'test',matched_risky_clients:62,total_decline_byn:100,clients:[]};
 assert.match(riskEvidenceAnswer([risk]).brief,/62 падающих клиентов/);
 const chosen=(shouldUseClientRiskAnswer(heard,{domain:'clients'})?riskEvidenceAnswer([risk]):null)||{brief:'Встреча с Триовистом.'};
 assert.equal(chosen.brief,'Встреча с Триовистом.');
});
test('named meetings work for arbitrary customers and do not turn ordinary office preparation into a customer request',()=>{
 for(const name of ['НилСтрой ООО','Иваницкая','Орион 2047','Строймастер']){
  assert.equal(clientMeetingTarget('Подготовь меня к встрече с '+name).domain,'client_detail');
  assert.equal(clientMeetingTarget('Подготовь меня к встрече с '+name).client,name);
 }
 for(const q of ['Подготовь меня к совещанию','Подготовь меня к встрече с ними','Подготовь меня к встрече с менеджерами','Создай встречу с НилСтроем завтра'])assert.equal(clientMeetingTarget(q),null);
});
test('new client meeting clears previous manager, branch, customer and drilldown without mutating input memory',()=>{
 const old={manager:'Руднев',branch:'Витебск',client:'Другой клиент',group:'Старая',subgroup:'Старая',level:'sku',offset:80,month:'2026-11'};
 const next=clientMeetingMemory(old,clientMeetingTarget(heard));
 assert.equal(next.manager,'');assert.equal(next.branch,null);assert.equal(next.client,'');assert.equal(next.group,'');assert.equal(next.subgroup,'');assert.equal(next.offset,0);assert.equal(next.subject,'client');assert.equal(next.month,'2026-11');
 assert.equal(old.manager,'Руднев');assert.equal(old.client,'Другой клиент');assert.equal(old.offset,80);
});
test('targeted facts are read before the first model request without an extra paid routing round',async()=>{
 const f=fixture();const output=await runDialogueCore(f.opts);
 assert.deepEqual(f.reads.map(x=>x.domain),['triovist']);assert.equal(f.reads[0].manager,null);assert.equal(f.requests.length,1);assert.equal(f.requests[0].model,'gpt-5.4-mini');
 assert.deepEqual(output.used,['triovist']);assert.match(f.requests[0].input.at(-1).content,/"scope":"client_all"/);
 const memory=JSON.parse(f.requests[0].input.find(x=>x.role==='user').content).memory;
 assert.equal(memory.manager,'');assert.equal(memory.branch,null);assert.equal(memory.client,'');
});
test('a model attempt to read general client risk never executes or replaces the named meeting answer',async()=>{
 const f=fixture(heard,{responses:[tool({domain:'clients',manager:'Руднев'}),message('Подготовка к встрече с Триовистом.')]});
 const output=await runDialogueCore(f.opts);
 assert.deepEqual(f.reads.map(x=>x.domain),['triovist']);assert.deepEqual(output.used,['triovist']);assert.equal(output.pair.brief,'Подготовка к встрече с Триовистом.');
 assert.equal(JSON.parse(f.requests[1].input.find(x=>x.type==='function_call_output').output).error,'client_subject_required');
});
test('generic named-customer meetings also reject office-wide operations, sales and debt substitution',async()=>{
 for(const domain of ['clients','operations','sales','debt','routes']){
  const f=fixture('Подготовь меня к встрече с НилСтрой ООО',{responses:[tool({domain}),message('Встреча с НилСтрой ООО.')],read:async()=>customer});
  const output=await runDialogueCore(f.opts);assert.deepEqual(f.reads.map(x=>x.domain),['client_detail']);assert.equal(f.reads[0].client,'НилСтрой ООО');assert.match(output.pair.brief,/НилСтрой/);
 }
});
test('related customer tools retain the newly named customer rather than an AI-supplied old one',async()=>{
 const f=fixture('Подготовь меня к встрече с НилСтрой ООО',{responses:[tool({domain:'client_schedule',manager:'Руднев',client:'Чужой клиент'}),message('Встреча с НилСтрой ООО.')],read:async args=>args.domain==='client_detail'?customer:{domain:args.domain,scope:'client_all',tasks:[]}});
 await runDialogueCore(f.opts);assert.equal(f.reads.length,2);assert.equal(f.reads[1].manager,null);assert.equal(f.reads[1].client,'НилСтрой ООО');
});
test('missing, ambiguous or inaccessible target stops with explicit clarification/unavailability and no model/network fallback',async()=>{
 for(const error of ['client_not_found','client_ambiguous','client_directory_unavailable','source_unavailable']){
  const f=fixture('Подготовь меня к встрече с НилСтрой ООО',{read:async()=>({error})});const result=await runDialogueCore(f.opts);
  assert.equal(result.kind,'clarification');assert.match(result.pair.brief,/клиент/);assert.equal(f.requests.length,0);assert.equal(f.reads.length,1);
 }
 const denied=fixture(heard,{domains:['clients','operations','sales']});const deniedResult=await runDialogueCore(denied.opts);
 assert.equal(deniedResult.kind,'clarification');assert.equal(denied.reads.length,0);assert.equal(denied.requests.length,0);
 const incomplete=fixture(heard,{read:async()=>({...triovist,revenue:null})});const result=await runDialogueCore(incomplete.opts);assert.equal(result.kind,'clarification');assert.equal(incomplete.requests.length,0);
});
test('an explicit falling-client request and a short continuation keep their deterministic formatter',()=>{
 for(const q of ['Покажи топ падающих клиентов','Клиенты с падением выручки','Покажи снижение по клиентам'])assert.equal(shouldUseClientRiskAnswer(q),true);
 assert.equal(shouldUseClientRiskAnswer('дальше',{domain:'clients'}),true);
 assert.equal(shouldUseClientRiskAnswer('Расскажи про Триовист',{domain:'clients'}),false);
 assert.equal(shouldUseClientRiskAnswer('дальше про НилСтрой',{domain:'clients'}),false);
});
test('office preparation and four-copy shared-core deployment contract remain unchanged',async()=>{
 const f=fixture('Подготовь меня к совещанию',{responses:[tool({domain:'clients'}),message('Общий обзор офиса.')],read:async()=>({domain:'clients',total:10})});
 await runDialogueCore(f.opts);assert.equal(f.requests.length,2);assert.deepEqual(f.reads.map(x=>x.domain),['clients']);
 const owner=fs.readFileSync('supabase/functions/crm-ai360-dialog-v4/dialogue-core.mjs','utf8');
 for(const file of ['supabase/functions/_shared/lera-dialogue-core-v2.mjs','supabase/functions/crm-ai360-director-peer-v1/dialogue-core.mjs','supabase/functions/crm-ai360-staff-dialog-v1/dialogue-core.mjs'])assert.equal(fs.readFileSync(file,'utf8'),owner);
});

test('upcoming meeting adjectives and a customer topic cannot replace the actual counterparty',()=>{
 for(const q of ['Подготовь к завтрашней встрече с Триовистом','Подготовь меня к нашей предстоящей встрече с НилСтрой'])assert.ok(clientMeetingTarget(q));
 assert.deepEqual(clientMeetingTarget('Подготовь меня к встрече с НилСтрой по поставкам Триовиста'),{client:'НилСтрой',domain:'client_detail'});
 assert.deepEqual(clientMeetingTarget('Подготовь меня к встрече с Триовистом по поставкам НилСтроя'),{client:'Триовистом',domain:'triovist'});
});
test('explicit staff meetings preserve verified employee scope while an explicitly named client remains a customer',async()=>{
 for(const q of ['Подготовь к встрече с руководителем Сидоровичем','Подготовь к встрече с директором Рудневым','Подготовь к встрече с менеджером Ачиновичем','Подготовь к встрече с сотрудником Ивановым'])assert.equal(clientMeetingTarget(q),null);
 assert.equal(clientMeetingTarget('Подготовь к встрече с Рудневым',{explicit_manager:'Руднев'}),null);
 assert.equal(clientMeetingTarget('Подготовь к встрече с компанией Руднев',{explicit_manager:'Руднев'}).client,'Руднев');
 const f=fixture('Подготовь к встрече с Рудневым',{responses:[message('Встреча с менеджером Рудневым.')]});
 f.opts.memory.explicit_manager='Руднев';await runDialogueCore(f.opts);assert.equal(f.reads.length,0);
});
test('target canonicalization precedes duplicate-read accounting and preserves the selected month',async()=>{
 const f=fixture(heard,{responses:[tool({domain:'triovist',manager:'Руднев',client:'Другой клиент',month:null,level:'groups'}),message('Встреча с Триовистом.')]});
 f.opts.memory.month='2026-11';await runDialogueCore(f.opts);
 assert.equal(f.reads.length,1);assert.equal(f.reads[0].month,'2026-11');
 assert.deepEqual(JSON.parse(f.requests[1].input.find(x=>x.type==='function_call_output').output),triovist);
});
test('staff verified-client facts stay authorized and cannot fall back to branch risk',async()=>{
 const f=fixture('Подготовь к встрече с НилСтрой ООО',{domains:['client_detail','clients'],read:async()=>({...customer,scope:'verified_client',managers:['Ачинович']})});
 const result=await runDialogueCore(f.opts);assert.equal(f.reads.length,1);assert.equal(f.requests.length,1);assert.equal(result.kind,'crm');
});
test('peer and staff gateway integrations keep their existing authorization and gate generic formatters',()=>{
 const peer=fs.readFileSync('supabase/functions/crm-ai360-director-peer-v1/index.ts','utf8');
 const staff=fs.readFileSync('supabase/functions/crm-ai360-staff-dialog-v1/index.ts','utf8');
 for(const source of [peer,staff]){assert.match(source,/shouldUseClientRiskAnswer\(question,memory\)/);assert.match(source,/!clientMeeting\?routeEvidenceAnswer/);assert.match(source,/clientMeetingMemory\(memory,clientMeeting\)/);}
 assert.match(peer,/userId !== PETROVICHEV_ID/);assert.match(peer,/region !== 'Все филиалы'/);
 assert.match(staff,/permission\.tier!=='branch_director'\?permission\.name:subject\|\|selected\|\|null/);
 assert.match(staff,/evidence\.scope\.managers\.some\(x=>!permitted\.includes\(x\)\)/);
 assert.match(staff,/subject&&evidence\.scope\.managers\.some\(x=>x!==subject\)/);
});

function ownerMeetingHandler(responses,{unavailable=false}={}){
 const owner='544fb1e2-ef70-44de-bc62-e0e1596a4bfc',calls=[];let handler,paid=0;
 const profile={id:owner,name:'Александр Паюшин',role:'boss',region:'Витебск'};
 const svc={auth:{getUser:async()=>({data:{user:{id:owner}}})},from:()=>{
  const b={select:()=>b,eq:()=>b,maybeSingle:async()=>({data:profile}),limit:async()=>({data:[{name:'Руднев'},{name:'Шкуран'}]})};return b;
 },rpc:async(name,args)=>{calls.push({name,args});
  if(name==='crm_ai360_core_claim_v2')return {data:{allowed:true,claim_id:'offline-claim'}};
  if(name==='crm_ai360_core_finish_v2')return {data:{ok:true}};
  if(name==='crm_ai360_triovist_brief_v1')return unavailable?{error:{message:'offline source failure'}}:{data:{plan:100,revenue:80}};
  throw Error('Unexpected unrelated CRM read '+name);
 }};
 const code=fs.readFileSync('supabase/functions/crm-ai360-dialog-v4/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
 vm.runInNewContext(code,{...planning,...gps,...catalog,...context,...managerSales,
  dialogueName,clientMeetingTarget,clientMeetingMemory,shouldUseClientRiskAnswer,runToolCore,createClient:()=>svc,
  resolveAnyClient:async()=>({error:'not_found'}),resolveClient:async()=>({error:'not_found'}),readTasks:async()=>{throw Error('Unexpected tasks source');},
  fetch:async(url)=>{assert.equal(url,'https://api.openai.com/v1/responses');paid++;assert.ok(responses.length);return new Response(JSON.stringify({...responses.shift(),usage:{input_tokens:40,output_tokens:20}}));},
  Deno:{env:{get:k=>({SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'offline-service',SUPABASE_ANON_KEY:'offline-public',OPENAI_API_KEY:'offline-provider'}[k])},serve:f=>handler=f},
  Response,Request,AbortSignal,Intl,Date,console});
 return {calls,paid:()=>paid,ask:()=>handler(new Request('https://fixture.supabase.co/functions/v1/crm-ai360-dialog-v4',{method:'POST',headers:{Authorization:'Bearer offline-test-session',Origin:'https://resanta-crm.by','Content-Type':'application/json'},body:JSON.stringify({protocol:'lera_dialogue_v2',message:heard,memory:{manager:'Руднев',branch:'Витебск',domain:'clients',client:'Старый клиент',group:'Старая группа',offset:80,month:'2026-11'}})}))};
}
test('actual owner handler preserves the spoken Triovist meeting through source routing, formatter and response memory',async()=>{
 const f=ownerMeetingHandler([tool({domain:'clients',manager:'Руднев'}),message('Подготовка к встрече с Триовистом: сверить выполнение плана и следующие поставки.')]);
 const response=await f.ask(),data=await response.json();
 assert.equal(response.status,200);assert.match(data.answer,/встрече с Триовистом/);assert.doesNotMatch(data.answer,/падающих клиентов/);
 assert.equal(data.memory.subject,'client');assert.equal(data.memory.manager,'');assert.equal(data.memory.client,'Триовист');assert.equal(data.memory.branch,null);
 assert.equal(f.calls.filter(x=>x.name==='crm_ai360_triovist_brief_v1').length,1);assert.equal(f.calls.filter(x=>x.name==='crm_ai360_core_claim_v2').length,1);assert.equal(f.calls.filter(x=>x.name==='crm_ai360_core_finish_v2').length,1);assert.equal(f.paid(),2);
});
test('actual owner handler settles an unavailable named client without paying for a guessed network answer',async()=>{
 const f=ownerMeetingHandler([],{unavailable:true}),response=await f.ask(),data=await response.json();
 assert.equal(response.status,200);assert.match(data.answer,/Не удалось получить подтверждённые данные/);assert.equal(f.paid(),0);
 assert.equal(f.calls.find(x=>x.name==='crm_ai360_core_finish_v2').args.p_actual_rub,0);
 assert.equal(f.calls.filter(x=>x.name==='crm_ai360_triovist_brief_v1').length,1);
});

test('a duplicate source request returns the original facts without a new read, failure or duplicate evidence',async()=>{
 const f=fixture(heard,{responses:[tool({domain:'triovist'}),tool({domain:'triovist'}),message('Триовист: план 100, факт 80.')]});
 const result=await runDialogueCore(f.opts);
 assert.equal(f.reads.length,1);assert.deepEqual(result.used,['triovist']);assert.equal(f.requests.length,3);
 for(const request of f.requests.slice(1)){
  const facts=JSON.parse(request.input.filter(x=>x.type==='function_call_output').at(-1).output);
  assert.deepEqual(facts,triovist);assert.equal(facts.error,undefined);
 }
});
test('authorized related Triovist sources are available only for a Triovist meeting',async()=>{
 const related=['triovist_tasks','triovist_stock','competitors','cards_21vek','card_issues','mrc','parser','infographics'];
 for(const domain of related){
  const own=fixture(heard,{domains:['triovist','client_detail',domain],responses:[tool({domain}),message('Триовист: данные текущего клиента.')],read:async args=>args.domain==='triovist'?triovist:{domain:args.domain,scope:'entity_all',items:[]}});
  await runDialogueCore(own.opts);assert.deepEqual(own.reads.map(x=>x.domain),['triovist',domain]);assert.equal(own.reads[1].manager,null);
  const other=fixture('Подготовь к встрече с НилСтрой ООО',{domains:['triovist','client_detail',domain],responses:[tool({domain}),message('НилСтрой: данные текущего клиента.')]});
  await runDialogueCore(other.opts);assert.deepEqual(other.reads.map(x=>x.domain),['client_detail']);
  assert.equal(JSON.parse(other.requests[1].input.find(x=>x.type==='function_call_output').output).error,'client_subject_required');
 }
});
test('related-source permission checks still precede cached facts and the four-source/five-round bounds remain',async()=>{
 const denied=fixture(heard,{domains:['triovist'],responses:[tool({domain:'triovist_tasks'}),message('Триовист.')]});
 await runDialogueCore(denied.opts);assert.equal(denied.reads.length,1);
 assert.equal(JSON.parse(denied.requests[1].input.find(x=>x.type==='function_call_output').output).error,'not_authorized_domain');
 const domains=['triovist','triovist_tasks','triovist_stock','cards_21vek','mrc'];
 const bounded=fixture(heard,{domains,responses:[...domains.slice(1).map(domain=>tool({domain})),message('Триовист.')],read:async args=>args.domain==='triovist'?triovist:{domain:args.domain,items:[]}});
 const result=await runDialogueCore(bounded.opts);assert.equal(bounded.reads.length,4);assert.equal(bounded.requests.length,5);assert.equal(result.error,null);
 assert.equal(bounded.requests[4].tool_choice,'none');
 assert.equal(JSON.parse(bounded.requests[4].input.filter(x=>x.type==='function_call_output').at(-1).output).error,'request_budget_reached');
});
test('actual owner handler receives cached Triovist facts on reread instead of a false unavailable check',async()=>{
 const f=ownerMeetingHandler([tool({domain:'triovist',manager:'Руднев',client:'Чужой клиент'}),message('Триовист: план 100, факт 80; подготовим вопросы по выполнению плана.')]);
 const response=await f.ask(),data=await response.json();assert.equal(response.status,200);assert.match(data.answer,/Триовист/);
 assert.equal(f.calls.filter(x=>x.name==='crm_ai360_triovist_brief_v1').length,1);assert.deepEqual(data.failed_domains,[]);assert.deepEqual(data.partial_sources,[]);assert.equal(f.paid(),2);
});
