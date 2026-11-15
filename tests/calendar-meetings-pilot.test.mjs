import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {meetingAccess,meetingContext,allowedManagers,EXCLUDED,OWNER} from '../supabase/functions/_shared/meeting-access.mjs';
import {buildMeetingBrief} from '../supabase/functions/_shared/meeting-brief.mjs';
import {prepareMeeting} from '../supabase/functions/_shared/meeting-prepare.mjs';
import {readMeetingContext} from '../supabase/functions/crm-ai360-agent-v1/meeting-context.mjs';
const code=fs.readFileSync('assets/270-calendar-meetings-pilot-v1.js','utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function harness(id=OWNER,source=code){
 const root={innerHTML:'',textContent:''},app={style:{display:'flex'},dataset:{activePage:'meeting-planner'}},calls=[],inputs={},rows=[];let listener;
 const client={auth:{getUser:async()=>({data:{user:{id}}})},functions:{invoke:async(name,{body})=>{calls.push({name,body});return {data:{preparation_id:'9d3f5760-64a8-4cfa-aeaa-7c77c2b7fede',briefing:{mode:'readonly',month:body.context.month,generated_at:new Date().toISOString(),scope:'test',cards:[{id:'tasks',level:'high',title:'Задачи',fact:'Факт',action:'Проверить',source:'tasks',attention:true}]},coverage:{entries:[],signals:[],registered:0}}};}},
 from(table){const filters=[];let insert=null;const q={select(){return q},eq(k,v){filters.push([k,v]);return q},gte(){return q},lt(){return q},order(){return q},limit(){return q},or(){return q},insert(x){insert=x;return q},single(){return q},then(resolve){calls.push({table,filters,insert});if(insert){const x={...insert,id:'new-id',status:'scheduled',updated_at:'2026-11-15T09:00:00Z'};rows.push(x);resolve({data:x});}else resolve({data:rows.filter(x=>x.owner_id===id)});}};return q;},
 rpc:async(name,args)=>{calls.push({name,args});const m=rows.find(x=>x.id===args.p_id);Object.assign(m,args.p_patch);return {data:m};}};
 const doc={addEventListener(n,fn){if(n==='click')listener=fn},getElementById:k=>k==='cmp-root'?root:k==='app'?app:inputs[k]||null,querySelector(){return null}};
 const win={db:client,confirm:()=>true};vm.runInNewContext(source,{window:win,document:doc,currentUser:{id},currentProfile:{id,role:'manager',name:'Test'},Intl,Date,Set,Array,String,Object,Number,Promise,AbortSignal,setTimeout,clearTimeout,navigator:{clipboard:{writeText:async()=>{}}}});
 return {win,root,calls,inputs,rows,doc,client,async click(key,value){const target={dataset:{[key.replace(/-([a-z])/g,(_,x)=>x.toUpperCase())]:value},hasAttribute:a=>a==='data-'+key};await listener({target:{closest:()=>target}});await tick();},async render(){win.crmMeetingPlannerPilotV1.render();await tick();}};
}
test('all active accounts have calendar access except Nesterov; analytical scope remains separate',()=>{
 assert.equal(meetingAccess({id:EXCLUDED},{id:EXCLUDED,role:'boss'}),null);
 const ordinary=meetingAccess({id:'office'},{id:'office',role:'office_manager'});assert.deepEqual(ordinary.managers,[]);
 const field=meetingAccess({id:'19dd9943-99ae-47c4-a39c-4f82a11059a6'},{id:'19dd9943-99ae-47c4-a39c-4f82a11059a6',role:'manager',name:'Руднев',region:'Витебск'});
 assert.deepEqual(field.managers,['Руднев']);assert.throws(()=>allowedManagers(field,'Шкуран'));
});
test('Nesterov cannot trigger even calendar reads',async()=>{const h=harness(EXCLUDED);await h.render();assert.match(h.root.textContent,/Нет доступа/);assert.equal(h.calls.length,0);});
test('ordinary employee reads only own scheduled meetings; initial import is inert',async()=>{const h=harness('office');assert.equal(h.calls.length,0);await h.render();assert.match(h.root.innerHTML,/Календарь и совещания/);assert.ok(h.calls.find(x=>x.filters?.some(([k,v])=>k==='owner_id'&&v==='office')));assert.equal(h.calls.some(x=>x.insert),false);});
test('selected date reaches preparation and Lera; changing date invalidates the old snapshot',async()=>{const h=harness();await h.render();await h.click('cmp-date','2026-10-20');await h.click('cmp-brief');const ctx=h.win.crmMeetingPlannerPilotV1.prepareAgentRequest('Почему?',{});assert.equal(ctx.memory.month,'2026-10');assert.equal(ctx.meeting_context.focus,'2026-10-20');assert.ok(ctx.meeting_context.preparation_id);assert.equal(h.calls.find(x=>x.name==='crm-meeting-prepare-v2').body.context.month,'2026-10');await h.click('cmp-date','2026-11-20');assert.equal(h.win.crmMeetingPlannerPilotV1.prepareAgentRequest('Почему?',{}).meeting_context.preparation_id,null);});
test('create, save agenda, restore, save minutes and cancel affect the selected personal meeting',async()=>{const h=harness();await h.render();await h.click('cmp-new');Object.assign(h.inputs,{'cmp-title':{value:'Рабочее совещание'},'cmp-purpose':{value:'Обсудить рабочие вопросы'},'cmp-date-input':{value:'2026-11-20'},'cmp-time-input':{value:'10:00'},'cmp-duration':{value:'60'}});await h.click('cmp-save-meeting');assert.equal(h.rows.length,1);assert.equal(h.rows[0].owner_id,OWNER);await h.click('cmp-brief');await h.click('cmp-save-agenda');assert.equal(h.rows[0].agenda.topics.length,1);await h.win.crmMeetingPlannerPilotV1.refresh();assert.match(h.root.innerHTML,/Сохранённая повестка/);h.inputs['cmp-minutes']={value:'Решения сохранены'};await h.click('cmp-save-minutes');assert.equal(h.rows[0].minutes,'Решения сохранены');await h.click('cmp-cancel','new-id');assert.equal(h.rows[0].status,'cancelled');});
test('current-month 99 percent is not high, stale tasks do not count as confirmed overdue, labels follow actual month',()=>{
 const b=buildMeetingBrief({today:'2026-11-15',month:'2026-11',scope:'test',sales:{freshness:{status:'ok',report_date:'2026-11-14'},managers:[{manager_name:'Руднев',plan:100,actual:99,to_plan:1,plan_pct:99}]},operations:[{period:{last_closed_month:'2026-10'},debt_summary:{report_date:'2026-11-14'},overdue_debtors:[{client_name:'Клиент',debt_overdue:500,debt_overdue_days:15}]}],taskMetrics:[{metrics:{approved_open:0,risk_count:0,stale_open:100,stale_overdue:99}}]});
 assert.notEqual(b.cards.find(x=>x.id==='sales').level,'high');assert.notEqual(b.cards.find(x=>x.id==='tasks').level,'high');assert.match(b.cards.find(x=>x.id==='sales').fact,/ноябрь 2026/);assert.equal(b.cards.find(x=>x.id==='debt').attention,true);
});
test('malformed dates and unauthorized managers fail closed',()=>{assert.throws(()=>meetingContext({focus:'2026-02-30'},'2026-11-15'));assert.throws(()=>meetingContext({month:'2026-13'},'2026-11-15'));});
test('preparation calculates full metrics, isolates a failed source, never scans forbidden staff domains',async()=>{
 const seen=[];const svc={rpc:async(name,args)=>{seen.push({name,args});if(args.p_source==='clients')return {error:'offline'};if(name==='crm_meeting_source_metrics_v2')return {data:{metrics:{rows:2000,risk_count:0},period_mode:'current_state'}};return {data:name.includes('sales')?{managers:[]}:{}};}};
 const result=await prepareMeeting(svc,{network:false,managers:['Руднев'],scope:'Руднев'},{focus:'2026-11-15',month:'2026-11',manager:null},'2026-11-15');
 assert.ok(result.coverage.entries.find(x=>x.id==='clients').status==='unavailable');assert.equal(result.coverage.entries.find(x=>x.id==='tasks').metrics.rows,2000);assert.equal(seen.some(x=>x.args.p_source==='cash'),false);assert.ok(seen.filter(x=>x.name==='crm_meeting_source_metrics_v2').every(x=>x.args.p_manager==='Руднев'));assert.equal(result.coverage.signals.some(x=>x.domain==='debt'),false);
});
test('server meeting context refuses a foreign meeting or mismatched preparation',async()=>{
 const svc={from(){return {select(){return this},eq(){return this},maybeSingle:async()=>({data:null})}}};
 assert.equal((await readMeetingContext(svc,{id:OWNER},{id:OWNER,role:'boss'},{focus:'2026-11-15',meeting_id:'11111111-1111-1111-1111-111111111111'},'2026-11-15')).error,'meeting_not_allowed');
});
test('category managers prepare only their own cards, issues, tasks and LPR',async()=>{
 const calls=[],svc={rpc:async(name,args)=>{calls.push({name,args});return {data:{metrics:{rows:10,risk_count:1}}};}};
 const result=await prepareMeeting(svc,{network:false,category:true,managers:['Кришталь'],scope:'Кришталь'},{month:'2026-11',focus:'2026-11-15'},'2026-11-15');
 assert.deepEqual(calls.map(x=>x.args.p_source).sort(),['card_issues','cards_21vek','lpr','triovist_tasks']);assert.ok(calls.every(x=>x.args.p_manager==='Кришталь'));assert.equal(result.briefing.cards.length,0);
});
test('tomorrow, explicit dates and current calendar day reach the agenda API correctly',async()=>{
 const source=fs.readFileSync('assets/219-lera360-agent-actions-v1.js','utf8'),calls=[];
 const doc={addEventListener(){},hidden:false,getElementById:()=>({style:{display:'flex'}}),querySelector:()=>({})};
 const root={addEventListener(){},crmMeetingPlannerPilotV1:{prepareAgentRequest:()=>({meeting_context:{focus:'2026-12-12'}})}};
 const db={auth:{getSession:async()=>({data:{session:{access_token:'test'}}})},functions:{invoke:async(name,{body})=>{calls.push(body);return {data:{mode:'agenda',items:[],has_more:false}};}}};
 vm.runInNewContext(source,{window:root,document:doc,currentUser:{id:OWNER},db,Intl,Date,Set,Array,String,Object,Number,Promise});
 const ui={answer(){},textStatus(){}};
 root.crmAI360ActionHandleV1('Какие встречи завтра?',ui);await tick();assert.equal(calls.at(-1).period,'tomorrow');
 root.crmAI360ActionHandleV1('Какие встречи 20.11.2026?',ui);await tick();assert.equal(calls.at(-1).from,'2026-11-20');assert.equal(calls.at(-1).to,'2026-11-21');
 root.crmAI360ActionHandleV1('Мои встречи',ui);await tick();assert.equal(calls.at(-1).from,'2026-12-12');
});

test('calendar opens the existing staff launcher and never closes an already open Lera',async()=>{
 const h=harness('office');await h.render();let launches=0;h.doc.querySelector=s=>s.includes('rsa-branch-launch')?{click(){launches++}}:null;
 await h.click('cmp-voice');assert.equal(launches,1);
 h.doc.querySelector=s=>s.includes('rva-window')?{}:{click(){launches++}};await h.click('cmp-voice');assert.equal(launches,1);
});

test('hung preparation stops loading and exposes an explicit timeout',async()=>{
 const h=harness(OWNER,code.replace('),45000);','),1);'));await h.render();h.client.functions.invoke=()=>new Promise(()=>{});await h.click('cmp-brief');await new Promise(r=>setTimeout(r,10));assert.match(h.root.innerHTML,/Источник не ответил вовремя/);assert.doesNotMatch(h.root.innerHTML,/Подготавливаю…/);
});

async function coverageHarness(entries){const h=harness();h.client.functions.invoke=async()=>({data:{preparation_id:'9d3f5760-64a8-4cfa-aeaa-7c77c2b7fede',briefing:{mode:'readonly',month:new Date().toISOString().slice(0,7),cards:[]},coverage:{entries,generated_at:'2026-11-15T08:27:00Z'}}});await h.render();await h.click('cmp-brief');return h;}
test('coverage separates transport failures from actual control counts and uses Russian names',async()=>{
 const h=await coverageHarness([{id:'sales',label:'sales',status:'profiled'},{id:'client_schedule',label:'client_schedule',status:'partial'},{id:'card_issues',label:'Ошибки карточек 21vek',status:'aggregated',metrics:{rows:4018,risk_count:1150},check_label:'Открытые критические проблемы',period_mode:'current_state'}]);
 const html=h.root.innerHTML;assert.match(html,/Найдено: 1(?:\s|&nbsp;)*150/ );assert.match(html,/Записей в расчёте: 4(?:\s|&nbsp;)*018/);assert.match(html,/сбоев загрузки/);assert.doesNotMatch(html,/>sales<|>client_schedule<|0 ошибок/);assert.match(html,/Продажи и KPI/);assert.match(html,/Поручения и маршруты клиента/);assert.match(html,/cmp-coverage-card warning/);
});
test('empty sources, unknown controls, unavailable and restricted sources never become green',async()=>{
 const h=await coverageHarness([{id:'infographics',status:'aggregated',metrics:{rows:0,risk_count:0},period_mode:'selected_month'},{id:'stock',status:'aggregated',metrics:{rows:1609,risk_count:null},period_mode:'latest_report_in_or_before_month',as_of:'2026-11-10'},{id:'chats',status:'restricted',reason:'Личные переписки не анализируются автоматически.'},{id:'clients',status:'unavailable'}]);
 const html=h.root.innerHTML;assert.doesNotMatch(html,/cmp-coverage-card ok/);assert.match(html,/Нет записей в указанной области/);assert.match(html,/Отдельная проверка отклонений не рассчитана/);assert.match(html,/cmp-coverage-card error/);assert.match(html,/Ограничено доступом/);assert.match(html,/Отчёт на \d+ дн. раньше даты совещания/);assert.doesNotMatch(html,/не подтверждена/);
});
test('zero control results are scoped, dates use Minsk, labels are escaped and links use existing navigation',async()=>{
 const h=await coverageHarness([{id:'cards_21vek',label:'Карточки <img src=x>',status:'aggregated',metrics:{rows:1724,risk_count:0},period_mode:'current_state'}]);
 assert.match(h.root.innerHTML,/cmp-coverage-card ok/);assert.match(h.root.innerHTML,/только к указанному признаку/);assert.match(h.root.innerHTML,/15.11.2026, 11:27/);assert.match(h.root.innerHTML,/&lt;img src=x&gt;/);assert.doesNotMatch(h.root.innerHTML,/<img src=x>/);
 let opened=0;h.inputs['nav-triovist']={style:{display:''},click(){opened++}};await h.win.crmMeetingPlannerPilotV1.render();assert.match(h.root.innerHTML,/data-cmp-open="cards_21vek"/);await h.click('cmp-open','cards_21vek');assert.equal(opened,1);h.inputs['nav-triovist'].style.display='none';await h.click('cmp-open','cards_21vek');assert.equal(opened,1);h.inputs['nav-payments']={style:{display:''},click(){opened++}};await h.click('cmp-open','cash');assert.equal(opened,2);
});
test('Lera receives server-owned coverage counts and distinguishes loading from business problems',async()=>{
 const prep={context:{focus:'2026-11-15',month:'2026-11',meeting_id:null},created_at:new Date().toISOString(),briefing:{cards:[]},coverage:{entries:[{id:'card_issues',label:'Ошибки карточек 21vek',status:'aggregated',metrics:{rows:4018,risk_count:1150},check_label:'Открытые критические проблемы',as_of:null},{id:'stock',status:'aggregated',metrics:{rows:1609,risk_count:null}},{id:'client_detail',label:'client_detail',status:'partial'}]}};
 const svc={from(){return {select(){return this},eq(){return this},maybeSingle:async()=>({data:prep})}}};
 const r=await readMeetingContext(svc,{id:OWNER},{id:OWNER,role:'boss'},{focus:'2026-11-15',month:'2026-11',preparation_id:'9d3f5760-64a8-4cfa-aeaa-7c77c2b7fede'},'2026-11-15');
 assert.match(r.text,/Ошибки загрузки источников: 0/);assert.match(r.text,/"control_count":1150/);assert.match(r.text,/"control_count":null/);assert.match(r.text,/Ассортимент клиента/);assert.doesNotMatch(r.text,/"name":"client_detail"/);
});

test('invalid meeting keeps all draft fields and displays a specific title error',async()=>{
 const h=harness();await h.render();await h.click('cmp-new');Object.assign(h.inputs,{'cmp-title':{value:'А'},'cmp-purpose':{value:'Не терять введённую цель'},'cmp-date-input':{value:'2026-11-20'},'cmp-time-input':{value:'11:25'},'cmp-duration':{value:'30'}});await h.click('cmp-save-meeting');
 assert.match(h.root.innerHTML,/Введите название от 3 до 160/);assert.match(h.root.innerHTML,/Не терять введённую цель/);assert.match(h.root.innerHTML,/value="11:25"/);assert.match(h.root.innerHTML,/value="30"/);assert.equal(h.rows.length,0);
 h.inputs['cmp-title'].value='План';h.inputs['cmp-purpose'].value='';await h.click('cmp-save-meeting');assert.equal(h.rows.length,1);assert.equal(h.rows[0].title,'План');assert.equal(h.rows[0].purpose,'');
});
test('invited meeting is visible without edit, cancellation or private preparation controls',async()=>{
 const h=harness();h.win.crmCalendarInvitesV3={list:async()=>[{id:'invite',owner_id:'other',is_owner:false,organizer:'Коллега',title:'Совещание',purpose:'Рабочая встреча',starts_at:new Date().toISOString(),duration_minutes:30,status:'scheduled',agenda:{},minutes:''}]};await h.render();await h.click('cmp-meeting','invite');
 assert.match(h.root.innerHTML,/Приглашение · Совещание/);assert.doesNotMatch(h.root.innerHTML,/data-cmp-edit=|data-cmp-cancel=|data-cmp-save-agenda|data-cmp-save-minutes/);assert.equal(h.win.crmMeetingPlannerPilotV1.prepareAgentRequest('Почему?',{}).meeting_context.meeting_id,null);
});
