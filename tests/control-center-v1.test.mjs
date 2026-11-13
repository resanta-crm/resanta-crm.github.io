import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {normalizeAgentRequest} from '../supabase/functions/crm-ai360-agent-v1/contract.mjs';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('assets/283-control-center-v1.js');
const css=read('assets/283-control-center-v1.css');
const flush=async()=>{for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));};
const sampleKpi={version:'kpi360-visual-v2',month:'2026-11',latest_sales_month:'2026-11',sales:[
 {manager_name:'Шкуран',shipment:100,shipment_plan:200},
 {manager_name:'Руднев',shipment:200,shipment_plan:300},
 {manager_name:'Ачинович',shipment:300,shipment_plan:500}
]};
const sampleTri={end_month:'2026-11',available_months:['2026-11'],selected_month_plans:[{plan_amount:400},{plan_amount:600}],items:[{current_revenue:700},{current_revenue:100}]};
const samplePdz={version:'pdz360.daily.1',report_date:'2026-11-13',metrics:{amount:72000},series:[{report_date:'2026-11-10',total:74000},{report_date:'2026-11-13',total:72000}],rows:[{client_id:'c1',client_name:'Клиент <script>bad()</script>',manager_name:'Руднев',overdue:72000,days_overdue:12}]};
function node(id=''){
 const classes=new Set();
 return {id,innerHTML:'',textContent:'',dataset:{},style:{},events:{},attrs:{},classList:{contains:k=>classes.has(k),add:k=>classes.add(k),remove:k=>classes.delete(k),toggle:(k,on)=>on?classes.add(k):classes.delete(k)},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,v){this.events[k]=v},querySelector:()=>null,prepend(){},scrollIntoView(){this.scrolled=true}};
}
function fixture(options={}){
 const nodes=new Map(['page-dashboard','topbar-title','nav-dashboard','app'].map(id=>[id,node(id)]));
 const page=nodes.get('page-dashboard');page.classList.add('active');page.prepend=x=>nodes.set(x.id,x);
 const calls=[],navigate=[],coreCalls=[];let baseCalls=0,routeCalls=0,nativeCalls=0;
 const profile={id:'owner',role:'boss',name:'Александр Паюшин',email:'payushin_ar@resanta.ru',region:'Витебск',access_scope:'standard',...options.profile};
 const statuses=Object.fromEntries(['tasks','visits','routes','absences'].map(x=>[x,{status:'ready',error:'',loadedAt:1}]));
 if(options.coreError)statuses.tasks={status:'error',error:'network'};
 const data={crm_manager_kpi360_dashboard_v2:options.kpi||structuredClone(sampleKpi),triovist_get_dashboard:options.tri||structuredClone(sampleTri),crm_pdz360_daily_v1:options.pdz||structuredClone(samplePdz)};
 const document={readyState:'complete',getElementById:id=>nodes.get(id)||null,createElement:()=>{const el=node();el.insertAdjacentElement=(_p,x)=>nodes.set(x.id,x);return el;},addEventListener(){}};
 const context={document,currentProfile:profile,currentUser:{id:profile.id},setTimeout:options.setTimeout||setTimeout,clearTimeout:options.clearTimeout||clearTimeout,AbortController,TODAY:'2026-11-13',ROUTE_CONTROL_START_LABEL:'13.08.2026',console,Date:options.Date||Date,Map,Set,Promise,sessionStorage:options.sessionStorage,
  allTasks:[{id:'t1',manager_name:'Руднев',due_date:'2026-11-12',text:'call'},{id:'t2',manager_name:'Шкуран',due_date:'2026-11-15'}],allClients:[],
  buildDashboard:()=>{baseCalls++},goPage:(page,title)=>navigate.push({page,title}),goToTasksFiltered:filter=>navigate.push({page:'tasks',filter}),
  canonicalActiveTasks:x=>x,canonicalTasksForManager:name=>context.allTasks.filter(t=>t.manager_name===name),isTaskOverdue:t=>t.due_date<'2026-11-13',visibleVisitsForCurrentUser:()=>[],routePlansForCurrentUser:()=>[],
  routeTruthMetrics:()=>{routeCalls++;return {verifiedDue:Array(140).fill({}),duePlans:Array(148).fill({}),wb:{start:'2026-11-09',end:'2026-11-15'},offRouteWeek:[],markedOnlyWeek:[],overdue:Array(218).fill({})};},
  crmDashboardNativeHooksV1:()=>nativeCalls++,
  crmCoreResourceStatusV1:k=>statuses[k],crmEnsurePageDataV22733:async()=>{coreCalls.push('ensure')},crmCoreRefreshV22733:async()=>{coreCalls.push('refresh')},
  RESANTA_TRIOVIST:{fullAccessEmails:['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']},
  db:{rpc:async(name,args)=>{calls.push({name,args});if(options.rpc)return options.rpc(name,args);if(options.fail===name)return{error:{message:'fixture denied'}};return{data:data[name]};},
    from:table=>{assert.equal(table,'cash_receipts_1c');let start=0,end=999;const filters=[];const q={select:()=>q,gte:()=>q,lt:()=>q,order:()=>q,range:(a,b)=>{start=a;end=b;return q},eq:(k,v)=>{filters.push([k,v]);return q},then:resolve=>{calls.push({table,start,end,filters});return Promise.resolve({data:(options.receipts||[{id:'r1',amount:1234,document_at:'2026-11-12T12:00:00+03:00',imported_at:'2026-11-13T10:00:00Z'}]).slice(start,end+1)}).then(resolve)}};return q;}}
 };
 context.window=context;
 vm.createContext(context);vm.runInContext(source,context);
 const root=()=>nodes.get('control-center-v1');
 function click(label){
  const html=root().innerHTML;
  const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=html.match(new RegExp('<button[^>]*data-cc-action="([^"]+)"[^>]*>'+escaped+'<\\/button>'));
  assert.ok(match,'button exists: '+label);
  root().events.click({target:{closest:()=>({hasAttribute:k=>k==='data-cc-action',dataset:{ccAction:match[1]}})}});
 }
 return {context,root,nodes,page,calls,navigate,statuses,coreCalls,click,baseCalls:()=>baseCalls,routeCalls:()=>routeCalls,nativeCalls:()=>nativeCalls};
}
test('home entry is last, versioned, and unrelated sections have no new CSS selectors',()=>{
 const index=read('index.html');
 assert.ok(index.indexOf('assets/283-control-center-v1.js')>index.indexOf('assets/198-budgets-client360-v1.js'));
 assert.match(index,/283-control-center-v1.css\?v=20261113-2/);
 assert.match(index,/05-performance-core.js\?v=23.7.13-control-center-v1/);
 assert.doesNotThrow(()=>new Function(source));
 assert.doesNotMatch(css,/#page-(?:clients|tasks|sales|triovist|debt)\b/);
 assert.doesNotMatch(source,/\.from\([^)]*\)\.(?:insert|update|delete|upsert)|\.auth\.|signOut|setInterval|localStorage|\.fetch\(/);
});
test('real sources add Triovist exactly once and keep the approved weekly route evidence',async()=>{
 const f=fixture();await flush();const html=f.root().innerHTML;
 assert.match(html,/Триовист: проверить выполнение плана/);
 assert.match(html,/Интернет-магазин/);assert.match(html,/80%/);
 assert.match(html,/140 \/ 148/);assert.match(html,/8 точек требуют проверки/);
 assert.match(html,/aria-valuemax="148" aria-valuenow="140"/);
 assert.match(html,/Дневной план не рассчитывается/);
 const api=f.context.RESANTA_CONTROL_CENTER_V1;
 const total=api.totals(api.salesRows(sampleKpi,sampleTri,'2026-11'));
 assert.equal(total.actual,1400);assert.equal(total.plan,2000);
 assert.equal(f.calls.filter(x=>x.name==='triovist_get_dashboard').length,1);
 assert.ok(f.page.classList.contains('cc-installed'));
 assert.ok(!html.includes('<script>bad()'));assert.match(html,/&lt;script&gt;bad\(\)&lt;\/script&gt;/);
});
test('initial/failed core resources cannot claim no overdue tasks or completed routes',async()=>{
 const f=fixture({coreError:true});await flush();
 assert.match(f.root().innerHTML,/Не удалось обновить данные/);
 assert.ok(!f.root().innerHTML.includes('Всё в срок'));
 f.statuses.routes={status:'idle',error:''};f.context.buildDashboard();
 assert.match(f.root().innerHTML,/— \/ —/);
 assert.equal(f.baseCalls(),0,'hidden legacy dashboard is never rendered');
});
test('missing monthly sales and plans remain unknown, not fabricated zero or 100 percent',()=>{
 const f=fixture();const api=f.context.RESANTA_CONTROL_CENTER_V1;
 const noMonth={...sampleKpi,latest_sales_month:'2026-10'};
 const rows=api.salesRows(noMonth,{...sampleTri,available_months:['2026-10']},'2026-11');
 assert.ok(rows.every(x=>x.actual===null));assert.equal(api.totals(rows).actual,null);
 const absentPlan=api.salesRows(sampleKpi,{...sampleTri,selected_month_plans:[]},'2026-11');
 assert.equal(api.totals(absentPlan).plan,null);
});
test('denied Triovist source never produces a partial figure presented as the total',async()=>{
 const f=fixture({fail:'triovist_get_dashboard'});await flush();
 assert.match(f.root().innerHTML,/Всего · неполные данные/);
 assert.match(f.root().innerHTML,/Данные недоступны|не удалось прочитать/);
 assert.ok(!f.root().innerHTML.includes('Триовист: проверить выполнение плана'));
});
test('field manager reads only their source and explicitly scopes receipt query; Triovist is not requested',async()=>{
 const f=fixture({profile:{id:'field',role:'manager',name:'Шкуран',email:'shkuran@resanta.ru'},kpi:{...sampleKpi,sales:[sampleKpi.sales[0]],scope:'manager'}});await flush();
 assert.equal(f.calls.filter(x=>x.name==='triovist_get_dashboard').length,0);
 assert.ok(f.calls.find(x=>x.table)?.filters.some(([k,v])=>k==='manager_name'&&v==='Шкуран'));
 assert.match(f.root().innerHTML,/Мои результаты/);
 assert.ok(!f.root().innerHTML.includes('Триовист:'));
});
test('executive without existing Triovist permissions keeps those restrictions',async()=>{
 const f=fixture({profile:{email:'petrovichev@resanta.ru'}});await flush();
 assert.equal(f.calls.filter(x=>x.name==='triovist_get_dashboard').length,0);
 assert.ok(!f.root().innerHTML.includes('Триовист</strong>'));
});
for(const p of [{role:'auditor'},{role:'executive_viewer'},{role:'office_manager'},{role:'manager',access_scope:'triovist'},{role:'manager',access_scope:'standard',name:'Другой менеджер'}])test('special start page and permissions are retained: '+JSON.stringify(p),async()=>{
 const f=fixture({profile:p});await flush();assert.equal(f.root(),undefined);assert.equal(f.calls.length,0);f.context.buildDashboard();assert.equal(f.baseCalls(),1);assert.ok(!f.page.classList.contains('cc-installed'));
});
test('all navigation uses existing goPage, and original dashboard is recoverable',async()=>{
 const f=fixture();await flush();f.click('Открыть маршруты');assert.equal(f.navigate.at(-1).page,'routes-boss');
 f.click('Открыть продажи');assert.equal(f.navigate.at(-1).page,'sales');
 const b={hasAttribute:k=>k==='data-cc-legacy'};f.root().events.click({target:{closest:()=>b}});
 assert.ok(!f.page.classList.contains('cc-installed'));assert.match(f.root().innerHTML,/Вернуться в Центр управления/);
 f.root().events.click({target:{closest:()=>b}});assert.ok(f.page.classList.contains('cc-installed'));
});
test('pagination totals every receipt, not just the first API page',async()=>{
 const f=fixture({receipts:Array.from({length:1003},(_,i)=>({id:'r'+i,amount:1,document_at:'2026-11-12T12:00:00Z'}))});await flush();
 assert.equal(f.calls.filter(x=>x.table).length,2);assert.match(f.root().innerHTML,/Последний|последний/);
});
test('new month clears previous source data and sends the exact month to both sales sources',async()=>{
 const f=fixture();await flush();f.root().events.change({target:{matches:()=>true,value:'2026-10'}});await flush();
 assert.ok(f.calls.some(x=>x.name==='crm_manager_kpi360_dashboard_v2'&&x.args.p_month==='2026-10'));
 assert.ok(f.calls.some(x=>x.name==='triovist_get_dashboard'&&x.args.p_end_month==='2026-10'));
 assert.match(f.root().innerHTML,/октябрь 2026/);
 assert.match(f.root().innerHTML,/не удалось прочитать/,'wrong-month fixture responses are rejected');
});
test('late response after logout/account switch cannot paint or chain reads into the new session',async()=>{
 let resolve;const waiting=new Promise(r=>resolve=r);
 const f=fixture({rpc:(name)=>name==='crm_manager_kpi360_dashboard_v2'?waiting:Promise.resolve({data:sampleTri})});
 f.context.currentUser={id:'next'};f.context.currentProfile={id:'next',role:'auditor'};f.page.classList.remove('active');resolve({data:sampleKpi});await flush();
 assert.equal(f.calls.filter(x=>x.name==='crm_pdz360_daily_v1').length,0);
 assert.equal(f.calls.filter(x=>x.table).length,0);
 assert.ok(!f.root().innerHTML.includes('1 400'));
});
test('leaving home stops subsequent source requests; repeated home renders share loaded results',async()=>{
 const f=fixture();await flush();const count=f.calls.length;f.context.buildDashboard();await flush();assert.equal(f.calls.length,count);
 let resolve;const wait=new Promise(r=>resolve=r);const other=fixture({rpc:name=>name==='crm_manager_kpi360_dashboard_v2'?wait:Promise.resolve({data:sampleTri})});
 other.page.classList.remove('active');resolve({data:sampleKpi});await flush();assert.equal(other.calls.filter(x=>x.name==='crm_pdz360_daily_v1').length,0);
});
test('core readiness accessor is read-only and preserves refresh errors instead of treating cache fallback as success',()=>{
 const code=read('assets/05-performance-core.js');const start=code.indexOf('window.crmCoreResourceStatusV1=function'),end=code.indexOf('\n};',start)+3;
 const ctx={window:{},states:new Map([['tasks',{status:'ready',loadedAt:3,refreshing:false,error:Error('offline')} ]])};vm.runInNewContext(code.slice(start,end),ctx);
 const before=ctx.states.get('tasks');assert.equal(ctx.window.crmCoreResourceStatusV1('tasks').error,'offline');assert.equal(ctx.window.crmCoreResourceStatusV1('missing').status,'idle');assert.equal(ctx.states.size,1);assert.equal(ctx.states.get('tasks'),before);
});
test('four financial arrivals reuse one route calculation and never build hidden legacy lists',async()=>{
 const f=fixture();await flush();assert.equal(f.routeCalls(),1);assert.equal(f.baseCalls(),0);
 assert.equal(f.calls.filter(x=>x.name||x.table).length,4);
 f.context.buildDashboard();await flush();assert.equal(f.baseCalls(),0);assert.equal(f.nativeCalls(),1);
 f.context.buildDashboard();await flush();assert.equal(f.nativeCalls(),1,'native/GPS hooks are not restarted on every render');
 const legacy={hasAttribute:k=>k==='data-cc-legacy'};f.root().events.click({target:{closest:()=>legacy}});assert.equal(f.baseCalls(),1);
});
test('selected month and aggregate scope reach Lera without any browser financial facts',async()=>{
 const f=fixture();await flush();const api=f.context.RESANTA_CONTROL_CENTER_V1;
 const result=api.prepareAgentRequest('Почему здесь такой процент?',{manager:'Руднев',month:'2026-01'});
 assert.equal(result.memory.month,'2026-11');assert.equal(result.memory.branch,'Витебск');assert.equal(result.memory.manager,'');
 assert.match(result.question,/Триовист/);assert.match(result.question,/не подтверждение цифр/);
 assert.doesNotMatch(result.question,/140|148|72000|1.?400|Клиент|<script>/);
 assert.equal(api.prepareAgentRequest('Какие здесь продажи за октябрь 2026?',{}).memory.month,'2026-10');
 assert.equal(api.prepareAgentRequest('Привет, как дела?',{}).question,'Привет, как дела?');
 assert.equal(api.prepareAgentRequest('Мне здесь грустно',{}).question,'Мне здесь грустно');
 assert.equal(api.prepareAgentRequest('Создай здесь задачу',{}).question,'Создай здесь задачу');
 assert.ok(api.prepareAgentRequest('Почему здесь процент? '+'а'.repeat(2350),{}).question.length<=2400);
 f.page.classList.remove('active');const m={month:'2025-01'};assert.equal(api.prepareAgentRequest('Почему здесь такой процент?',m).memory,m);
});
test('field context never adds colleagues or Triovist to the question',async()=>{
 const f=fixture({profile:{id:'field',role:'manager',name:'Шкуран',email:'shkuran@resanta.ru'},kpi:{...sampleKpi,sales:[sampleKpi.sales[0]]}});await flush();
 const r=f.context.RESANTA_CONTROL_CENTER_V1.prepareAgentRequest('Что здесь по плану?',{});assert.match(r.question,/Только мои показатели/);assert.doesNotMatch(r.question,/Триовист|Руднев|Ачинович/);
});
test('all three existing adapters pass prepared context through the same JWT-protected endpoint',()=>{
 for(const p of ['assets/143-resanta-ai360-unified-dialog-v1.js','assets/147-resanta-ai360-staff-unified-dialog-v1.js','assets/210-resanta-agent360-single-entry-v1.js']){
  const code=read(p);assert.match(code,/prepareAgentRequest/);assert.match(code,/functions.invoke\(ENDPOINT/);assert.doesNotMatch(code,/service_role|skipAuth|bypass/);
 }
 assert.match(read('assets/221-lera360-voice-navigation-v1.js'),/центр\(\?:а\|е\)\?/);
 const native=read('assets/02-mobile-gps-base.js');assert.match(native,/window.crmDashboardNativeHooksV1=v19DashboardNativeHooks/);
 assert.match(native,/buildDashboard=function\(\)\{_v19BuildDashboardBase\(\);v19DashboardNativeHooks\(\);\}/);
});
test('previous compact result paints immediately after reload, is marked stale, and is bound to actor/region',async()=>{
 const values=new Map();const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 let clock=Date.now();class Clock extends Date{static now(){return clock}}
 const first=fixture({sessionStorage:storage,Date:Clock});await flush();
 const saved=JSON.parse(values.get('crm_control_center_v2:owner'));assert.equal(saved.version,2);assert.ok(values.get('crm_control_center_v2:owner').length<32000);
 clock+=240000;
 const next=fixture({sessionStorage:storage,Date:Clock,rpc:()=>new Promise(()=>{}),setTimeout:()=>1,clearTimeout(){}});
 assert.match(next.root().innerHTML,/80%/);assert.match(next.nodes.get('cc-refresh-status').innerHTML,/последние данные/);
 const other=fixture({sessionStorage:storage,Date:Clock,profile:{id:'other'},rpc:()=>new Promise(()=>{}),setTimeout:()=>1,clearTimeout(){}});assert.ok(!/>80%</.test(other.root().innerHTML));
 const changed=fixture({sessionStorage:storage,Date:Clock,profile:{region:'Другой филиал'},rpc:()=>new Promise(()=>{}),setTimeout:()=>1,clearTimeout(){}});assert.ok(!/>80%</.test(changed.root().innerHTML));
});
test('timeouts finish loading, abort the request, allow explicit retry and ignore a late old response',async()=>{
 const timers=new Map();let timerId=0,salesCalls=0,resolveOld;
 const old=new Promise(r=>resolveOld=r);
 const f=fixture({setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId},clearTimeout:id=>timers.delete(id),rpc:name=>{
  if(name==='crm_manager_kpi360_dashboard_v2'){salesCalls++;return salesCalls===1?old:Promise.resolve({data:sampleKpi});}
  return Promise.resolve({data:name==='triovist_get_dashboard'?sampleTri:samplePdz});
 }});await flush();
 for(const [id,t] of [...timers]){timers.delete(id);t.fn();}await flush();
 assert.match(f.nodes.get('cc-refresh-status').innerHTML,/Повторить загрузку/);
 f.context.buildDashboard();await flush();assert.equal(salesCalls,1,'timeout has cooldown, not a retry storm');
 f.nodes.get('cc-refresh-status').events.click({target:{closest:()=>({hasAttribute:k=>k==='data-cc-refresh'})}});await flush();assert.equal(salesCalls,2);assert.match(f.root().innerHTML,/80%/);
 resolveOld({data:{...sampleKpi,sales:[{manager_name:'Шкуран',shipment:99999999,shipment_plan:1}]}});await flush();assert.ok(!f.root().innerHTML.includes('99999999'));
});
test('an explicit permission denial removes the cached source instead of showing it as a network fallback',async()=>{
 let denied=false;const values=new Map();const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 const f=fixture({sessionStorage:storage,rpc:name=>Promise.resolve(denied&&name==='crm_manager_kpi360_dashboard_v2'?{error:{code:'42501',message:'Нет доступа'}}:{data:name==='crm_manager_kpi360_dashboard_v2'?sampleKpi:name==='triovist_get_dashboard'?sampleTri:samplePdz})});
 await flush();denied=true;f.context.RESANTA_CONTROL_CENTER_V1.refresh();await flush();
 assert.match(f.root().innerHTML,/Всего · неполные данные/);assert.equal(JSON.parse(values.get('crm_control_center_v2:owner')).slots.sales,undefined);
});
for(const tier of ['director','staff'])test('real '+tier+' bridge sends selected screen month through the existing normalized server contract',async()=>{
 const owner='544fb1e2-ef70-44de-bc62-e0e1596a4bfc',field='4fd79fa0-232d-4768-8099-25f47923cc4f';
 const f=fixture({profile:tier==='director'?{id:owner}:{id:field,role:'manager',name:'Шкуран',email:'shkuran@resanta.ru'}});await flush();
 let captured;const c=f.context;c.navigator={userAgent:'Mac'};c.addEventListener=()=>{};
 c.crmAI360GreetingV1=()=>c.currentProfile;c.crmAI360StaffIdentityV1=()=>({...c.currentProfile,tier:'field_manager'});
 c.db.auth={getSession:async()=>({data:{session:{access_token:'own-session-fixture'}}})};c.db.functions={invoke:async(endpoint,args)=>{assert.equal(endpoint,'crm-ai360-agent-v1');captured=args.body;return {error:{message:'captured-fixture'}}}};
 vm.runInContext(read(tier==='director'?'assets/143-resanta-ai360-unified-dialog-v1.js':'assets/147-resanta-ai360-staff-unified-dialog-v1.js'),c);
 const ui={answer(){},textStatus(){},authorized:()=>true,show(){},setStatus(){}};
 (tier==='director'?c.crmAI360UnifiedDialogHandleV1:c.crmAI360BranchUnifiedHandleV1)('Почему здесь такой процент?',ui);await flush();
 assert.equal(captured.memory.month,'2026-11');assert.match(captured.question,/Контекст интерфейса/);
 const normalized=normalizeAgentRequest(captured,{tier:tier==='director'?'network_director':'field_manager',endpoint:'existing-jwt-gateway'});
 assert.equal(normalized.payload.memory.month,'2026-11');assert.match(normalized.payload.question||normalized.payload.message,/Контекст интерфейса/);
 if(tier==='staff')assert.doesNotMatch(captured.question,/Триовист/);
});
