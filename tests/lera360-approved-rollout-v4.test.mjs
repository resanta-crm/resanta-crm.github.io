import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as contract from '../supabase/functions/crm-ai360-agent-v1/contract.mjs';
import {routeWindow,readRouteWindow,readClientRisk,branchScope,routeEvidenceAnswer,riskEvidenceAnswer} from '../supabase/functions/_shared/lera-scoped-planning-v4.mjs';
const day='2026-11-13',read=p=>fs.readFileSync(p,'utf8');
const profiles=[
 ['544fb1e2-ef70-44de-bc62-e0e1596a4bfc','Александр Паюшин','boss','Витебск'],
 ['a24954b8-2fe1-4852-b629-d8f351e1bd36','Руководство компании','boss','Все филиалы'],
 ['ba55dfe5-7e48-4f1f-b40e-674c7752fe1a','Сидарович К.Н.','boss','Витебск'],
 ['19dd9943-99ae-47c4-a39c-4f82a11059a6','Руднев','manager','Витебск'],
 ['3d935a76-c6fe-44b6-b248-fcbe58c6bf1c','Ачинович','manager','Витебск'],
 ['4fd79fa0-232d-4768-8099-25f47923cc4f','Шкуран','manager','Витебск'],
 ['6efa656e-45c6-473b-a853-89eccb9ee43a','Александренко','manager','Триовист / 21vek.by'],
 ['9076ccde-a8cc-47e3-b71e-c31170b693ff','Кришталь','manager','Триовист / 21vek.by']
].map(([id,name,role,region])=>({id,name,role,region,access_scope:'standard',email:'petrovichev@resanta.ru'}));
for(const p of profiles)test('approved identity routes ordinary URL to semantic agent: '+p.name,async()=>{
 let handler,forwarded;const user={id:p.id,email:p.email,email_confirmed_at:'2026-11-01'};
 const svc={auth:{getUser:async()=>({data:{user}})},from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:p})};return q;}};
 const code=read('supabase/functions/crm-ai360-agent-v1/index.ts').replace(/^import .*;\r?\n/gm,'');
 vm.runInNewContext(code,{...contract,createClient:()=>svc,historyEnabled:async()=>({enabled:false}),saveHistoryTurn:async()=>({saved:false}),Deno:{env:{get:()=> 'fixture-setting'},serve:f=>handler=f},Response,Request,AbortSignal,fetch:async(url,init)=>{forwarded={url,body:JSON.parse(init.body),auth:init.headers.Authorization};return new Response(JSON.stringify({answer:'fixture',read_only:true,answer_verified:false}));}});
 const res=await handler(new Request('https://fixture/agent',{method:'POST',headers:{Authorization:'Bearer test-own-user-fixture'},body:JSON.stringify({question:'Какие у меня продажи?'})}));
 assert.equal(res.status,200);assert.equal(forwarded.body.protocol,'lera_dialogue_v2');assert.equal(forwarded.auth,'Bearer test-own-user-fixture');
 assert.ok(forwarded.url.endsWith(contract.agentPrincipal(p.id,p,user).endpoint));assert.equal((await res.json()).route_tier,contract.agentPrincipal(p.id,p,user).tier);
 assert.equal(contract.agentPrincipal(p.id,{...p,role:'office_manager'},user),null,'role changes revoke agent access');
});
test('unapproved identity and unverified executive email do not enter rollout',()=>{
 assert.equal(contract.agentPrincipal('unknown',{...profiles[3],id:'unknown'}),null);
 assert.equal(contract.agentPrincipal(profiles[1].id,profiles[1],{id:profiles[1].id,email:profiles[1].email}),null);
});
test('next week is Monday 16 to Sunday 22, not 17 to 23',()=>{assert.deepEqual(routeWindow('На следующей неделе есть маршрут у менеджеров?',day),{from:'2026-11-16',to:'2026-11-22'});});
test('both actual spoken date questions retain their requested day',()=>{
 for(const q of ['Скажи что действительно 16 числа нет ни одного маршрута','Лера, на 16-е число есть маршруты?'])assert.equal(routeWindow(q,day).from,'2026-11-16');
 assert.equal(routeWindow('Посмотри на 17 число есть маршруты у трех менеджеров',day).from,'2026-11-17');
 assert.equal(routeWindow('на 2 декабря 2026',day).from,'2026-12-02');assert.equal(routeWindow('на 31 февраля 2026',day).error,'invalid_route_date');
});
function routeFixture(){const rows=[];for(const [manager,n] of [['Ачинович',10],['Руднев',11],['Шкуран',14]])for(let i=0;i<n;i++)rows.push({visit_date:'2026-11-17',manager_name:manager,client_name:'Клиент '+i,approved:true});rows.push({visit_date:'2026-11-27',manager_name:'Шкуран',client_name:'Будущий',approved:true});
 return {from:table=>{assert.equal(table,'route_plans');const filters=[];let opts={},range=[0,999];const q={select:(s,o)=>{opts=o||{};return q;},gte:(k,v)=>{filters.push(r=>r[k]>=v);return q;},lte:(k,v)=>{filters.push(r=>r[k]<=v);return q;},eq:(k,v)=>{filters.push(r=>r[k]===v);return q;},in:(k,v)=>{filters.push(r=>v.includes(r[k]));return q;},order:()=>q,range:(a,b)=>{range=[a,b];return q;},then:resolve=>{const selected=rows.filter(r=>filters.every(f=>f(r)));return Promise.resolve({data:opts.head?null:selected.slice(range[0],range[1]+1),count:opts.count?selected.length:null}).then(resolve);}};return q;}};
}
test('Nov 17 exact count is 35 despite a 12-row evidence page; future Nov 27 excluded',async()=>{
 const e=await readRouteWindow(routeFixture(),{managers:['Ачинович','Руднев','Шкуран'],question:'на 17 число',today:day});assert.equal(e.total_count,35);assert.equal(e.approved_count,35);assert.equal(e.rows.length,12);assert.equal(e.partial,true);assert.deepEqual(e.manager_counts.map(x=>x.count),[10,11,14]);assert.match(routeEvidenceAnswer([e]).brief,/35 плановых посещений/);
});
test('empty page with nonzero full count never becomes no routes',async()=>{
 const e=await readRouteWindow(routeFixture(),{managers:['Шкуран'],question:'на 17 число',today:day,offset:200});assert.equal(e.rows.length,0);assert.equal(e.total_count,14);assert.match(routeEvidenceAnswer([e]).brief,/14 плановых/);
 const absent=await readRouteWindow(routeFixture(),{managers:['Шкуран'],question:'на 16 число',today:day});assert.equal(absent.total_count,0);
});
test('field employee scope cannot include colleagues route rows',async()=>{
 const e=await readRouteWindow(routeFixture(),{managers:['Ачинович'],question:'на следующей неделе',today:day});assert.equal(e.total_count,10);assert.ok(e.rows.every(x=>x.manager_name==='Ачинович'));
});
test('branch is retained for top-three followup and cleared by network request',()=>{
 assert.equal(branchScope('по филиалу Витебске'),'Витебск');assert.equal(branchScope('Покажи топ-3',{branch:'Витебск'}),'Витебск');assert.equal(branchScope('Теперь по всей сети',{branch:'Витебск'}),null);
 const p=contract.agentPrincipal(profiles[0].id,profiles[0]);assert.equal(contract.normalizeAgentRequest({question:'топ-3',memory:{branch:'Витебск'}},p).payload.memory.branch,'Витебск');
});
test('Vitebsk risk merges exact authorized employee summaries; never calls network snapshot',async()=>{
 const called=[];const svc={rpc:async(name,args)=>{called.push(args.p_manager);return {data:{period:'2026-08..2026-10',comparison_period:'2025-08..2025-10',matched_risky_clients:10,total_decline_byn:1000,clients:[{name:args.p_manager+' клиент',manager_name:args.p_manager,loss_byn:args.p_manager==='Шкуран'?700:300,drop_pct:40,current_3m:100,prior_year_3m:800}]}};}};
 const e=await readClientRisk(svc,{branch:'Витебск',month:'2026-11',authorizedManagers:['Шкуран','Руднев','Ачинович']});assert.deepEqual(called,['Шкуран','Руднев','Ачинович']);assert.equal(e.matched_risky_clients,30);assert.equal(e.total_decline_byn,3000);assert.equal(e.clients[0].manager_name,'Шкуран');assert.match(riskEvidenceAnswer([e]).brief,/филиалу Витебск/);assert.match(riskEvidenceAnswer([e]).brief,/700 BYN/);
});
test('deployed role helpers and dialogue instructions remain identical',()=>{
 for(const name of ['crm-ai360-dialog-v4','crm-ai360-director-peer-v1','crm-ai360-staff-dialog-v1','crm-ai360-staff-read-v1'])assert.equal(read('supabase/functions/'+name+'/scoped-planning.mjs'),read('supabase/functions/_shared/lera-scoped-planning-v4.mjs'));
});
test('staff panel displays detail but speaks only the provided short answer',()=>{
 const source=read('assets/144-resanta-ai360-branch-voice-v1.js');const start=source.indexOf('function show('),end=source.indexOf('function setStatus',start);const spoken=[],nodes=[];
 const ctx={panelVisible:()=>true,log:{appendChild:p=>nodes.push(p),scrollHeight:5},MAX_ANSWER:5000,document:{createElement:()=>({style:{}})},say:x=>spoken.push(x)};
 vm.runInNewContext(source.slice(start,end)+'\nthis.showAnswer=show;',ctx);
 ctx.showAnswer('Подробный отчёт на экране',{speechSummary:'Краткий итог голосом'});assert.equal(nodes[0].textContent,'Подробный отчёт на экране');assert.deepEqual(spoken,['Краткий итог голосом']);
});
