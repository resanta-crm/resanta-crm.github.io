import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {controlCenterPlanRequest,readControlCenterPlan} from '../supabase/functions/crm-ai360-agent-v1/control-center.mjs';
import {agentPrincipal,AGENT360_OWNER_ID} from '../supabase/functions/crm-ai360-agent-v1/contract.mjs';
const {parseHTML}=await import(process.env.CRM_DOM_MODULE||'linkedom');
const read=p=>fs.readFileSync(p,'utf8');
const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
const owner={id:AGENT360_OWNER_ID,role:'boss',email:'payushin_ar@resanta.ru',name:'Александр Паюшин',region:'Витебск'};
const ids=Array.from({length:60},(_,i)=>'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'));
const annual=()=>({version:'control.sales.year.1',year:2026,previous_year:2025,today:'2026-11-14',scope:'Команда Витебска и Триовист',include_triovist:true,months:Array.from({length:12},(_,i)=>({month:'2026-'+String(i+1).padStart(2,'0'),previous_month:'2025-'+String(i+1).padStart(2,'0'),partial:i===10,future:i===11,managers:[{name:'Руднев',current:i===11?null:100,previous:50}],tri_current:i===11?null:200,tri_previous:100}))});
function fixture(options={}){
 const {document}=parseHTML('<html><body><div id="menu"><button id="nav-clients"></button><button id="nav-client360"></button></div><div id="page-clients" class="active"><div id="legacy">Исходный список</div></div><div id="cc-year-chart"></div></body></html>');
 document.defaultView.HTMLElement.prototype.scrollIntoView=function(){};
 const row=i=>({client_id:ids[i],name:'Клиент '+i,cards:1,points:1,managers:['Руднев'],revenue:100,open_tasks:0,members:[{id:ids[i],name:'Клиент '+i,code:'code-'+i,manager_name:'Руднев'}]});
 const detail={version:'clients.detail.1',month:'2026-11',entity:{id:ids[59],name:'Юрлицо <script>не исполнять</script>'},members:Array.from({length:5},(_,i)=>row(i).members[0]),points:Array.from({length:5},(_,i)=>({id:'p'+i,city:'Витебск',address:'Адрес '+i,clients:[row(i).members[0]],visits:i,last_visit:'2026-11-10',next_visit:null,lat:null,lng:null})),sales:[{month:'2026-11',revenue:500}],debt:{amount:50,report_date:'2026-11-14'},tasks:[],visits:[],audit:[],requests:[{city:'Витебск',address:'Новый адрес',status:'pending',created_at:'2026-11-14'}],can_edit:options.edit!==false};
 const calls=[],events={};let legacy=0;
 const ctx={document,console,Date,Intl,Map,Set,Promise,AbortController,setTimeout,clearTimeout,Event:document.defaultView.Event,MutationObserver:document.defaultView.MutationObserver,currentUser:{id:owner.id},currentProfile:{...owner,...options.profile},addEventListener:(n,f)=>events[n]=f,dispatchEvent:e=>events[e.type]?.(e),alert:()=>{},confirm:()=>true,renderClients:()=>legacy++,goPage:()=>{},openAddClient:()=>{},openClient:()=>{},db:{rpc(name,args){calls.push({name,args});if(options.rpc)return options.rpc(name,args);return Promise.resolve({data:name==='crm_clients_registry_v1'?{version:'clients.unified.1',total:60,rows:Array.from({length:args.p_offset?10:50},(_,i)=>row(args.p_offset+i)),metrics:{clients:60,cards:60,points:60,revenue:6000,debt:50},managers:['Руднев'],branches:['Витебск'],can_link:options.edit!==false}:name==='crm_clients_detail_v1'?detail:name==='crm_control_sales_year_v1'?annual():{ok:true,requests:[]}});}}};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(read('assets/285-clients-unified-v1.js'),ctx);
 const click=selector=>{const el=document.querySelector(selector);assert.ok(el,selector);el.dispatchEvent(new document.defaultView.Event('click',{bubbles:true}));};
 return {ctx,document,calls,click,detail,legacy:()=>legacy};
}
test('real DOM registry paginates, preserves explicit selection and never writes before confirmation',async()=>{
 const f=fixture();await flush();assert.equal(f.document.querySelectorAll('tbody tr').length,50);assert.equal(f.legacy(),0);
 const box=f.document.querySelector('[data-uc-select]');box.checked=true;box.dispatchEvent(new f.document.defaultView.Event('change',{bubbles:true}));
 assert.match(f.document.querySelector('.uc-selection').textContent,/Клиент 0/);
 f.click('[data-uc-action=next]');await flush();assert.equal(f.calls.at(-1).args.p_offset,50);assert.equal(f.document.querySelectorAll('tbody tr').length,10);assert.match(f.document.querySelector('.uc-selection').textContent,/Клиент 0/);
 const second=f.document.querySelector('[data-uc-select]');second.checked=true;second.dispatchEvent(new f.document.defaultView.Event('change',{bubbles:true}));f.click('[data-uc-action=preview]');
 assert.match(f.document.querySelector('#uc-dialog').textContent,/Клиент 0/);assert.match(f.document.querySelector('#uc-dialog').textContent,/Клиент 50/);assert.equal(f.calls.some(x=>x.name==='client360_group_clients_v1'),false);
 f.click('[data-uc-cancel]');assert.equal(f.document.getElementById('uc-dialog'),null);
 f.click('[data-uc-action=legacy]');assert.ok(f.document.getElementById('page-clients').classList.contains('uc-legacy'));assert.equal(f.legacy(),1);f.click('[data-uc-action=legacy]');assert.ok(f.document.getElementById('page-clients').classList.contains('uc-installed'));
});
test('one client has five distinct TTs, exact visits, no duplicated per-store revenue and request status',async()=>{
 const f=fixture();await flush();await f.ctx.RESANTA_CLIENTS_UNIFIED_V1.openDetail(ids[0]);
 assert.equal(f.document.querySelectorAll('#uc-detail script').length,0);f.click('[data-uc-tab=stores]');
 assert.equal(f.document.querySelectorAll('#uc-detail .uc-content .uc-store').length,5);assert.match(f.document.getElementById('uc-detail').textContent,/На согласовании/);assert.match(f.document.getElementById('uc-detail').textContent,/Визитов за 2026-11: 4/);assert.doesNotMatch(f.document.querySelector('.uc-store').textContent,/500/);
 const prepared=f.ctx.RESANTA_CLIENTS_UNIFIED_V1.prepareAgentRequest('Сводка по этому клиенту',{});assert.match(prepared.question,/client_id/);assert.doesNotMatch(prepared.question,/500/);
 const home=read('assets/283-control-center-v1.js');f.ctx.w=f.ctx;const hook=vm.runInContext('('+home.slice(home.indexOf('function prepareAgentRequest('),home.indexOf('function install(){'))+')',f.ctx);assert.equal(hook('Сводка по этому клиенту',{}).question,prepared.question);
});
test('read-only director cannot edit links or addresses; actor changes discard detail and selection',async()=>{
 const f=fixture({edit:false});await flush();await f.ctx.RESANTA_CLIENTS_UNIFIED_V1.openDetail(ids[0]);f.click('[data-uc-tab=stores]');assert.equal(f.document.querySelector('[data-uc-action=edit-store]'),null);assert.equal(f.document.querySelector('[data-uc-action=add-store]'),null);
 f.ctx.currentUser={id:'new-user'};f.ctx.currentProfile={id:'new-user',role:'manager',name:'Руднев',region:'Витебск'};f.ctx.renderClients();await flush();assert.equal(f.document.querySelector('#uc-detail .uc-panel'),null);assert.equal(f.document.querySelector('.uc-selection'),null);
});
test('late authenticated response cannot populate the next login',async()=>{
 let finish;const f=fixture({rpc:()=>new Promise(r=>finish=r)});await flush();f.ctx.currentUser={id:'logged-out'};f.ctx.currentProfile={};finish({data:{version:'clients.unified.1',rows:[{name:'secret'}]}});await flush();assert.doesNotMatch(f.document.body.textContent,/secret/);
});
test('annual UI: exact closed months, incomplete exclusion, missing month gap, expansion and month detail',async()=>{
 const f=fixture();await flush();vm.runInContext(read('assets/284-control-sales-year-v1.js'),f.ctx);f.ctx.RESANTA_YEAR_SALES_V1.mount(f.document.getElementById('cc-year-chart'),2026);await flush();
 const api=f.ctx.RESANTA_YEAR_SALES_V1,a=annual(),s=api.summarize(a);assert.equal(s.ytd,3300);assert.equal(s.closedCurrent,3000);assert.equal(s.closedPrevious,1500);assert.equal(s.percent,100);assert.equal(api.summarize(a,'Триовист').ytd,2200);assert.equal(api.summarize(a,'Руднев').ytd,1100);
 a.months[3].tri_current=null;assert.equal(api.summarize(a).ytd,null);assert.equal(api.summarize(a).percent,null);
 f.click('[data-ys-expand]');assert.ok(f.document.getElementById('year-sales-dialog'));f.click('#year-sales-dialog [data-ys-month="1"]');assert.match(f.document.querySelector('.ys-body').textContent,/2026-01 \/ 2025-01/);assert.equal(f.document.querySelectorAll('.ys-body tbody tr').length,2);f.click('[data-ys-close]');assert.equal(f.document.getElementById('year-sales-dialog'),null);
 assert.match(api.graph([{month:'2026-01',current:-10,previous:0}]),/-0,1 тыс.|-0/);
});
test('Lera rereads annual/client facts via caller RPC, without accepting browser totals or an action',async()=>{
 const principal=agentPrincipal(owner.id,owner),hint='\nКонтекст интерфейса, не подтверждение цифр: '+JSON.stringify({screen:'Центр управления',sales_month:'2026-11',revenue:99999999});
 const req=controlCenterPlanRequest({question:'Какие продажи здесь с начала года?'+hint},principal,owner);assert.equal(req.kind,'annual');
 const db={rpc:()=>({abortSignal:async()=>({data:annual()})})},r=await readControlCenterPlan(db,req);assert.equal(r.totals.ytd,3300);assert.equal(r.totals.closed_current,3000);assert.equal(r.totals.closed_previous,1500);assert.equal(r.read_only,true);
 const ch='\nКонтекст карточки клиента, не подтверждение цифр: '+JSON.stringify({screen:'Клиенты',client_id:ids[0],month:'2026-11'}),c=controlCenterPlanRequest({question:'Сводка по этому клиенту'+ch},principal,owner);assert.equal(c.kind,'client');
 assert.equal(controlCenterPlanRequest({question:'Удали этого клиента'+ch},principal,owner),null);assert.equal(controlCenterPlanRequest({question:'Почему упали продажи клиента?'+ch},principal,owner),null);
 const fail=await readControlCenterPlan({rpc:()=>({abortSignal:async()=>({error:{message:'forbidden'}})})},c);assert.equal(fail.status,503);assert.equal(fail.answer_verified,undefined);
});
