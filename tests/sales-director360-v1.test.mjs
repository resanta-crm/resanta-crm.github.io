import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const src=read('assets/190-sales-director360-v1.js');
const index=read('index.html');
const sql=read('docs/sales360_annual_rpc_v1.sql');
const monthly=read('assets/118-sales-analytics-v236374.js');
const core=read('assets/01-crm-core.js');
const yoy=read('assets/49-manager-sales-yoy-v23634.js');

const monthlySample=(month,current,previous,closed=true,partial=false)=>({
 month,current,previous,has_current:true,has_previous:true,closed,partial
});
const sample={
 version:'sales360.1',year:2026,previous_year:2025,closed_month:10,kpi_month:'2026-11',
 months:[monthlySample('2026-01',120000,100000),monthlySample('2026-02',150000,125000),
 ...Array.from({length:7},(_,i)=>monthlySample('2026-'+String(i+3).padStart(2,'0'),100000,100000)),
 monthlySample('2026-10',316927.84,275000),monthlySample('2026-11',54578.96,330000,false,true),
 {month:'2026-12',current:0,previous:0,closed:false,has_current:false,has_previous:false,partial:false}],
 managers:[{name:'Руднев',current_revenue:470000,previous_revenue:410000,client_count:100},
           {name:'Ачинович',current_revenue:350000,previous_revenue:310000,client_count:92},
           {name:'Шкуран',current_revenue:240000,previous_revenue:220000,client_count:80},
           {name:'Не распределено',current_revenue:26927.84,previous_revenue:20000,client_count:1}],
 categories:[{category:'Электроинструмент',current_revenue:700000,previous_revenue:630000,clients:120},
             {category:'Генераторы',current_revenue:100000,previous_revenue:150000,clients:30}],
 matrix:[{manager_name:'Руднев',category:'Генераторы',revenue:70000,previous_revenue:70000,clients:15},
         {manager_name:'Шкуран',category:'Генераторы',revenue:30000,previous_revenue:30000,clients:10},
         {manager_name:'Ачинович',category:'Электроинструмент',revenue:350000,previous_revenue:300000,clients:70}],
 active_clients_ytd:287,unallocated_client_revenue:18000,unallocated_manager_revenue:10000,
 top_clients:[{client_key:'c1',client_id:'c1',client_name:'Клиент & Строй',manager_name:'Руднев',is_unallocated:false,revenue:75000},
              {client_key:'x2',client_id:null,client_name:'Нераспределено ТТ',manager_name:'Ачинович',is_unallocated:true,revenue:18000}],
 kpi:[{manager_name:'Руднев',actual:33384,plan:167000},
      {manager_name:'Ачинович',actual:14898.58,plan:105000},
      {manager_name:'Шкуран',actual:10080.74,plan:89000}],
 freshness:{last_success_at:'2026-11-10T05:00:00'}
};
function fixture(role='boss'){
 const nodes={},events={},calls=[],navigation=[];
 const classes=new Set();
 const page={classList:{toggle(name,flag){if(flag)classes.add(name);else classes.delete(name)}},
  insertAdjacentElement(_,node){nodes[node.id]=node;},
  querySelector(){return null;}};
 const doc={
  readyState:'complete',head:{appendChild(node){nodes[node.id]=node}},
  getElementById(id){return nodes[id]||null},
  createElement(tag){return{tag,id:'',textContent:'',innerHTML:'',setAttribute(){},
     addEventListener(name,fn){events[name]=fn},querySelector(){return null}}}
 };
 nodes['page-sales']=page;nodes['app']={dataset:{activePage:'sales'}};
 const window={
  renderSales(){navigation.push('native-sales')},
  salesMgr374(value){navigation.push('native-manager:'+value)},
  salesMonth374(value){navigation.push('native-month:'+value)},
  msyOpen374(){navigation.push('native-yoy-open')},
  openClient(id){navigation.push('client:'+id)},
  goPage(page){navigation.push('page:'+page)},
  navigator:{clipboard:{writeText:async()=>{}}}
 };
 const db={rpc:async(name,args)=>{calls.push({name,args});return {data:{
    ...sample,manager:args.p_manager,
    managers:args.p_manager?sample.managers.filter(x=>x.name===args.p_manager):sample.managers,
    matrix:args.p_manager?sample.matrix.filter(x=>x.manager_name===args.p_manager):sample.matrix
  },error:null}}};
 const context={window,document:doc,console,Date,Intl,Map,Set,Number,Array,String,Math,Error,JSON,Promise,db,
   currentProfile:role==='boss'?{role,id:'boss-id',name:'Директор'}:{role,name:'Ачинович',id:'mgr-id'},
   TODAY:'2026-11-10',crmActivePage:()=>nodes.app.dataset.activePage,setTimeout};
 vm.createContext(context);
 vm.runInContext(src,context,{filename:'190-sales-director360-v1.js'});
 return{window,context,nodes,events,calls,navigation,classes};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,30));
test('sales module stays isolated after original analytics and keeps core unchanged',()=>{
 assert.doesNotThrow(()=>new vm.Script(src));
 assert.ok(index.includes('assets/190-sales-director360-v1.js?v=20261110-sales360-2'));
 assert.ok(index.indexOf('assets/118-sales-analytics-v236374.js')<index.indexOf('assets/190-sales-director360-v1.js'));
 assert.ok(index.indexOf('assets/189-falling-director360-v1.js')<index.indexOf('assets/190-sales-director360-v1.js'));
 assert.match(core,/function renderSales\(\)/);
 assert.match(monthly,/crm_sales_month_dashboard_v236374/);
 assert.match(yoy,/crm_manager_sales_yoy_v23634/);
 assert.doesNotMatch(src,/\b(?:db|supabase)\.(?:from|insert|update|delete|upsert)\(/);
 assert.doesNotMatch(src,/\bfetch\s*\(/);
});
test('annual comparison excludes incomplete November and future months',()=>{
 const a=fixture();
 const api=a.window.RESANTA_SALES360_V1;
 const y=api.ytd(sample);
 assert.equal(y.months,10);
 assert.equal(y.current,120000+150000+700000+316927.84);
 assert.equal(y.prev,100000+125000+700000+275000);
 const c=api.chartData(sample,'months');
 assert.equal(c.length,12);
 assert.equal(c[10].partial,true);
 assert.equal(c[10].current,54578.96);
 assert.equal(c[11].hasCurrent,false);
 const q=api.chartData(sample,'quarters');
 assert.equal(q.length,4);
 assert.equal(q[3].partial,true);
});
test('manager/category matrix surfaces testable opportunities, never a knowledge diagnosis',()=>{
 const f=fixture();
 const api=f.window.RESANTA_SALES360_V1;
 assert.equal(api.categoryMatrix(sample,'Генераторы').length,2);
 const gaps=api.managerGaps(sample);
 assert.ok(gaps.some(x=>x.manager==='Ачинович'&&x.category==='Генераторы'));
 assert.match(src,/Отсутствие продаж не доказывает нехватку знаний/);
 assert.match(src,/Задача создаётся только после согласования руководителем/);
 assert.doesNotMatch(src,/\bcreateTask\(/);
});
test('sales native renderer executes, and server annual RPC has no local history scanning',async()=>{
 const f=fixture();
 f.window.renderSales();
 await settle();
 assert.equal(f.navigation.filter(x=>x==='native-sales').length,1);
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].name,'crm_sales360_annual_v1');
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].args)),{p_year:2026,p_manager:null});
 const root=f.nodes['sales360-root'];
 assert.ok(root.innerHTML.includes('Продажи 360°'));
 assert.ok(root.innerHTML.includes('Управление ростом'));
 assert.ok(root.innerHTML.includes('ИИ · Утренний брифинг продаж'));
 assert.ok(root.innerHTML.includes('Матрица')||root.innerHTML.includes('Потенциал менеджеров'));
 assert.ok(root.innerHTML.includes('Ноябрь')||root.innerHTML.includes('Ноя'));
 assert.ok(root.innerHTML.includes('Клиент &amp; Строй'));
 assert.ok(f.classes.has('s360-installed'));
 f.window.renderSales();
 await settle();
 assert.equal(f.calls.length,1,'same year/manager reused within TTL');
});
test('manager and period selection are real, and category switch does not fetch',async()=>{
 const f=fixture();
 f.window.renderSales();await settle();
 const start=f.calls.length;
 f.events.change({target:{closest(sel){return sel==='[data-s360-select]'?{dataset:{s360Select:'category'},value:'Генераторы'}:null}}});
 assert.equal(f.calls.length,start,'category filter uses existing category matrix');
 f.events.change({target:{closest(sel){return sel==='[data-s360-select]'?{dataset:{s360Select:'manager'},value:'Руднев'}:null}}});
 await settle();
 assert.equal(f.calls.length,start+1);
 assert.ok(!f.navigation.includes('native-manager:Руднев'),'old report stays dormant during Sales360 manager changes');
 assert.equal(f.calls.at(-1).args.p_manager,'Руднев');
 assert.ok(f.classes.has('s360-installed'));
 assert.match(f.nodes['sales360-root'].innerHTML,/Руднев/);
});
test('manager role never renders cross-manager choices and receives server-side scoped response',async()=>{
 const f=fixture('manager');
 f.window.renderSales();await settle();
 const html=f.nodes['sales360-root'].innerHTML;
 assert.match(html,/Ачинович/);
 assert.doesNotMatch(html,/id="s360-manager"/);
 assert.equal(f.calls[0].args.p_manager,null,'server must enforce auth role for managers');
 assert.match(sql,/v_role='manager'/);
 assert.match(sql,/Менеджер может просматривать только собственные данные/);
 assert.match(sql,/auth\.uid\(\) is null/);
});
test('plan/fact comes from same KPI leaderboard; unlabeled sales remain included',async()=>{
 const f=fixture();f.window.renderSales();await settle();
 const html=f.nodes['sales360-root'].innerHTML;
 assert.match(sql,/crm_manager_kpi_leaderboard/);
 assert.match(html,/План\/факт месяца/);
 assert.match(html,/Без точной ТТ/);
 assert.match(html,/Включено в общий оборот/);
 assert.match(html,/316/);
});
test('legacy report and all clients remain reachable without disturbing native cards',async()=>{
 const f=fixture();f.window.renderSales();await settle();
 const target={dataset:{s360AllClients:''}};
 f.events.click({target:{closest(x){return x==='button'?target:null}}});
 assert.ok(f.navigation.includes('native-yoy-open'));
 assert.ok(!f.classes.has('s360-installed'));
 assert.match(src,/w\.msyOpen374/);
 assert.match(src,/w\.salesMonth374/);
 assert.match(src,/w\.openClient/);
});
test('SQL RPC is authenticated and read-only; missing months are explicit',()=>{
 assert.match(sql,/security definer/);
 assert.match(sql,/auth\.uid\(\) is null/);
 assert.match(sql,/revoke all on function public\.crm_sales360_annual_v1\(integer,text\) from public,anon/);
 assert.match(sql,/grant execute on function public\.crm_sales360_annual_v1\(integer,text\) to authenticated,service_role/);
 assert.match(sql,/has_current/);
 assert.match(sql,/partial/);
 assert.match(sql,/unallocated_manager_revenue/);
 assert.match(sql,/unallocated_client_revenue/);
 assert.doesNotMatch(sql,/\b(update|delete|insert|truncate)\s+public\./i);
});

test('unified month selector stays on top, exact BYN turnover on graph and live month focus',async()=>{
 const f=fixture();f.window.renderSales();await settle();
 const root=f.nodes['sales360-root'];
 assert.ok(root.innerHTML.indexOf('s360-month')<root.innerHTML.indexOf('s360-kpis'));
 assert.match(root.innerHTML,/Год сравнения/);
 assert.match(root.innerHTML,/Месяц · фокус графика/);
 assert.match(root.innerHTML,/Оборот, BYN/);
 assert.match(root.innerHTML,/data-s360-point="2026-11"/);
 assert.match(root.innerHTML,/54\s*578,96 BYN/);
 assert.match(root.innerHTML,/Без итогового сравнения/,'unfinished November does not get misleading YoY');
 assert.match(root.innerHTML,/10\.11\.2026, 08:00 \(Минск\)/);
 const oldCalls=f.calls.length;
 f.events.change({target:{closest(sel){return sel==='[data-s360-select]'?{dataset:{s360Select:'month'},value:'2026-10'}:null}}});
 assert.equal(f.calls.length,oldCalls,'selecting month only focuses annual data');
 assert.match(root.innerHTML,/316\s*927,84 BYN/);
 assert.match(root.innerHTML,/Сопоставимые закрытые периоды/);
 f.events.click({target:{closest(sel){return sel==='button'?{dataset:{s360Step:'-1'}}:null}}});
 assert.match(root.innerHTML,/Сен/);
});
test('manager switch does not reveal native reports or stale numbers during loading',async()=>{
 const f=fixture();f.window.renderSales();await settle();
 f.events.change({target:{closest(sel){return sel==='[data-s360-select]'?{dataset:{s360Select:'manager'},value:'Руднев'}:null}}});
 const loading=f.nodes['sales360-root'].innerHTML;
 assert.match(loading,/Загружаю данные выбранного менеджера/);
 assert.match(loading,/s360-month/);
 assert.ok(!loading.includes('Клиенты · Отгрузки за закрытые месяцы'));
 assert.ok(f.classes.has('s360-installed'));
 assert.ok(!f.navigation.includes('native-manager:Руднев'));
 await settle();
 assert.match(f.nodes['sales360-root'].innerHTML,/Управление ростом/);
});
test('legacy reports open only by explicit action and return to the director view',async()=>{
 const f=fixture();f.window.renderSales();await settle();
 f.events.click({target:{closest(sel){return sel==='button'?{dataset:{s360Legacy:''}}:null}}});
 assert.ok(!f.classes.has('s360-installed'));
 assert.match(f.nodes['sales360-root'].innerHTML,/Вернуться к Продажи 360°/);
 assert.ok(f.navigation.includes('native-manager:all'));
 f.events.click({target:{closest(sel){return sel==='button'?{dataset:{s360Legacy:''}}:null}}});
 assert.ok(f.classes.has('s360-installed'));
 assert.match(f.nodes['sales360-root'].innerHTML,/Динамика с января/);
});
test('keyboard selecting a graph point changes focus without RPC or opening native reports',async()=>{
 const f=fixture();f.window.renderSales();await settle();
 const start=f.calls.length;
 const p={dataset:{s360Point:'2026-10'}};
 f.events.keydown({key:'Enter',target:{closest(sel){return sel==='[data-s360-point]'?p:null}},preventDefault(){}});
 assert.equal(f.calls.length,start);
 assert.match(f.nodes['sales360-root'].innerHTML,/Сопоставимые закрытые периоды/);
 assert.ok(!f.navigation.some(x=>x.startsWith('native-month:')));
});
