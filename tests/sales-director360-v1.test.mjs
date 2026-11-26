import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const src=read('assets/190-sales-director360-v1.js');
const index=read('index.html');
const sql=read('docs/sales360_annual_rpc_v1.sql');
const v2sql=read('docs/sales360_scope_clients_rpc_v2.sql');
const v3sql=read('docs/sales360_product_drill_rpc_v3.sql');
const v4sql=read('docs/sales360_recovery_rpc_v4.sql');
const lera=read('assets/191-sales360-recovery-lera-v1.js');
const monthly=read('assets/118-sales-analytics-v236374.js');
const core=read('assets/01-crm-core.js');
const yoy=read('assets/49-manager-sales-yoy-v23634.js');

const monthlySample=(month,current,previous,closed=true,partial=false)=>({
 month,current,previous,has_current:true,has_previous:true,closed,partial
});
const sample={
 version:'sales360.2',triovist_revenue_ytd:0,year:2026,previous_year:2025,closed_month:10,kpi_month:'2026-11',
 months:[monthlySample('2026-01',120000,100000),monthlySample('2026-02',150000,125000),
 ...Array.from({length:7},(_,i)=>monthlySample('2026-'+String(i+3).padStart(2,'0'),100000,100000)),
 monthlySample('2026-10',316927.84,275000),monthlySample('2026-11',54578.96,330000,false,true),
 {month:'2026-12',current:0,previous:0,closed:false,has_current:false,has_previous:false,partial:false}],
 managers:[{name:'Руднев',current_revenue:470000,previous_revenue:410000,client_count:100},
           {name:'Ачинович',current_revenue:350000,previous_revenue:310000,client_count:92},
           {name:'Шкуран',current_revenue:240000,previous_revenue:220000,client_count:80},
           {name:'Не распределено',current_revenue:26927.84,previous_revenue:20000,client_count:1}],
 categories:[{category:'Электроинструмент',current_revenue:700000,previous_revenue:630000,clients:120},
             {category:'Генераторы',current_revenue:100000,previous_revenue:150000,clients:30},
             {category:'САДОВАЯ ТЕХНИКА',current_revenue:40000,previous_revenue:35000,clients:13}],
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
const sampleRecovery={
 version:'sales360.recovery.4',year:2026,previous_year:2025,period:'last3',
 from_month:8,to_month:10,closed:true,month_granularity:true,
 sales_imported_at:'2026-11-10T06:01:31Z',
 current_revenue:1077254.49,previous_revenue:738692.45,
 client_drop_30_count:14,client_drop_30_gap:91900.39,
 groups:[],
 subgroups:[
  {kind:'subgroup',category:'САДОВАЯ ТЕХНИКА',subgroup:'Бензопилы',status:'decline',previous_revenue:70404.73,current_revenue:48985.32,delta_byn:-21419.41,loss_byn:21419.41,delta_pct:-30.4},
  {kind:'subgroup',category:'ЭЛЕКТРОГЕНЕРАТОРЫ',subgroup:'Дизельные',status:'stopped',previous_revenue:10794.56,current_revenue:0,delta_byn:-10794.56,loss_byn:10794.56,delta_pct:-100}
 ],
 skus:[{kind:'sku',category:'САДОВАЯ ТЕХНИКА',subgroup:'Бензопилы',sku:'70/6/4',product:'Бензопила BS-45М Huter',status:'decline',previous_revenue:40105.7,current_revenue:14972.32,delta_byn:-25133.38,loss_byn:25133.38,delta_pct:-62.7}],
 clients:[{kind:'client',client_key:'c1',client_name:'Клиент & Строй',manager_name:'Руднев',status:'decline',previous_revenue:30000,current_revenue:17000,delta_byn:-13000,loss_byn:13000,delta_pct:-43.3}],
 growing_subgroups:[{kind:'subgroup',category:'ИНСТРУМЕНТ',subgroup:'Аккумуляторы',status:'growth',previous_revenue:10000,current_revenue:25000,delta_byn:15000,loss_byn:0,delta_pct:150}],
 growing_clients:[]
};
function fixture(role='boss'){
 const nodes={},events={},calls=[],recoveryCalls=[],navigation=[];
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
 const db={rpc:async(name,args)=>{
  if(name==='crm_sales360_recovery_v4'){
   recoveryCalls.push({name,args});
   const result={...sampleRecovery,year:args.p_year,previous_year:args.p_year-1,period:args.p_period,
    manager:args.p_manager,client_key:args.p_client_key||null,category_filter:args.p_category||null};
   if(args.p_category)return {data:{...result,subgroups:sampleRecovery.subgroups.filter(x=>x.category===args.p_category),clients:sampleRecovery.clients,skus:sampleRecovery.skus},error:null};
   return {data:result,error:null};
  }
  if(name==='crm_manager_kpi360_dashboard_v2'){
   return {data:{version:'kpi360-visual-v2',month:args.p_month,latest_sales_month:'2026-11',
    sales:sample.kpi.map(row=>({manager_name:row.manager_name,shipment_plan:row.plan,shipment:row.actual})),clients:[]},error:null};
  }
  calls.push({name,args});
  if(name==='crm_sales_month_breakdown_v1'){
   const items=args.p_view==='clients'?
    [{item_key:'c1',label:'Клиент & Строй',quantity:3,revenue:150}]:
    [{item_key:'sku:70/6/4',label:'Бензопила',sku:'70/6/4',quantity:3,revenue:150}];
   return {data:{month:args.p_month.slice(0,7),items,revenue:150,has_rows:true,total:1,partial:false},error:null};
  }
  if(name==='crm_sales360_product_drill_v3'){
   const rows=args.p_level==='subgroups'?
    [{item_key:'subgroup:Бензопилы',item_name:'Бензопилы',current_revenue:42000,previous_revenue:38000,current_qty:110,previous_qty:100},
     {item_key:'subgroup:Мойки высокого давления',item_name:'Мойки высокого давления',current_revenue:18000,previous_revenue:15000,current_qty:54,previous_qty:41}]:
    [{item_key:'sku:70/6/4',item_name:'Бензопила BS-45М Huter',sku:'70/6/4',product:'Бензопила BS-45М Huter',current_revenue:31000,previous_revenue:26000,current_qty:65,previous_qty:57},
     {item_key:'product:Без артикула',item_name:'Бензопила без артикула',sku:null,product:'Бензопила без артикула',current_revenue:11000,previous_revenue:12000,current_qty:45,previous_qty:43}];
   return {data:{version:'sales360.product.3',level:args.p_level,category:args.p_category,subgroup:args.p_subgroup,total:rows.length,items:rows,current_revenue:60000,previous_revenue:53000},error:null};
  }
  if(name==='crm_sales360_clients_v2'){
   const full=[
    {client_key:'c1',client_id:'c1',client_name:'Клиент & Строй',manager_name:'Руднев',current_revenue:75000,previous_revenue:65000},
    {client_key:'x2',client_id:null,client_name:'Нераспределено ТТ',manager_name:'Ачинович',current_revenue:18000,previous_revenue:12000}
   ];
   const entries=full.filter(x=>!args.p_search||x.client_name.toLowerCase().includes(args.p_search.toLowerCase()));
   const selected=entries.find(x=>x.client_key===args.p_client_key);
   return {data:{version:'sales360.clients.2',year:args.p_year,previous_year:args.p_year-1,total:entries.length,
    items:entries.slice(args.p_offset,args.p_offset+args.p_limit),
    detail:selected?{client:selected,months:sample.months,categories:sample.categories}:null},error:null};
  }
  return {data:{
   ...sample,manager:args.p_manager,exclude_triovist:args.p_exclude_triovist,
   managers:args.p_manager?sample.managers.filter(x=>x.name===args.p_manager):sample.managers,
   matrix:args.p_manager?sample.matrix.filter(x=>x.manager_name===args.p_manager):sample.matrix
  },error:null}
 }};
 const context={window,document:doc,console,Date,Intl,Map,Set,Number,Array,String,Math,Error,JSON,Promise,db,
   currentProfile:role==='boss'?{role,id:'boss-id',name:'Директор'}:{role,name:'Ачинович',id:'mgr-id'},
   TODAY:'2026-11-10',crmActivePage:()=>nodes.app.dataset.activePage,setTimeout};
 vm.createContext(context);
 vm.runInContext(src,context,{filename:'190-sales-director360-v1.js'});
 return{window,context,nodes,events,calls,recoveryCalls,navigation,classes};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,30));
test('ticket 8: month report opens on demand and SKU drill retains month and client',async()=>{
 const f=fixture('manager');await settle();
 const calls=()=>f.calls.filter(x=>x.name==='crm_sales_month_breakdown_v1').map(x=>x.args);
 assert.equal(calls().length,0);
 f.nodes['s360-monthly']={innerHTML:''};f.nodes['s360-breakdown-results']={innerHTML:''};
 const click=(action,index)=>f.events.click({target:{closest:sel=>sel==='button'?{dataset:{s360MonthAction:action,s360MonthIndex:index}}:null}});
 click('open');await settle();
 assert.equal(calls().at(-1).p_view,'clients');
 assert.match(f.nodes['s360-breakdown-results'].innerHTML,/Клиент &amp; Строй/);
 f.events.change({target:{closest:sel=>sel==='[data-s360-breakdown-month]'?{value:'2026-02'}:null}});await settle();
 click('client','0');await settle();
 assert.equal(calls().at(-1).p_month,'2026-02-01');
 assert.equal(calls().at(-1).p_client_key,'c1');
 assert.equal(calls().at(-1).p_manager,null);
 assert.equal(calls().at(-1).p_view,'sku');
 assert.match(f.nodes['s360-breakdown-results'].innerHTML,/Бензопила.*70\/6\/4/);
});
test('sales module stays isolated after original analytics and keeps core unchanged',()=>{
 assert.doesNotThrow(()=>new vm.Script(src));
 assert.ok(index.includes('assets/190-sales-director360-v1.js?v=20261110-sales360-6'));
 assert.ok(index.indexOf('assets/118-sales-analytics-v236374.js')<index.indexOf('assets/190-sales-director360-v1.js'));
 assert.ok(index.indexOf('assets/189-falling-director360-v1.js')<index.indexOf('assets/190-sales-director360-v1.js'));
 assert.match(core,/function renderSales\(\)/);
 assert.match(monthly,/crm_sales_month_dashboard_v236374/);
 assert.match(yoy,/crm_manager_sales_yoy_v23634/);
 assert.doesNotMatch(src,/\b(?:db|supabase)\.(?:from|insert|update|delete|upsert)\(/);
 assert.doesNotMatch(src,/\bfetch\s*\(/);
});
test('branch comparison keeps both sales channels and requires verified 1C ranges', async ()=>{
 const branchFile='assets/305-branch-sales-periods-v1.js';
 assert.ok(index.indexOf(branchFile)>0 && index.indexOf(branchFile)<index.indexOf('assets/190-sales-director360-v1.js'));
 const inputs=Array.from({length:4},()=>({value:''}));
 const names=['p_from','p_to','p_previous_from','p_previous_to'];
 const actions={};
 const preset={addEventListener:(event,fn)=>{actions.preset=fn}};
 const closed={addEventListener:(event,fn)=>{actions.closed=fn}};
 const form={
  addEventListener:(event,fn)=>{actions[event]=fn},
  querySelector(selector){
   if(selector==='select')return preset;
   if(selector==='[type="submit"]')return this.button;
   return inputs[names.indexOf(selector.split('"')[1])];
  },
  button:{}
 };
 const status={}, results={}, calls=[];
 const nodes={form,'[role="status"]':status,'[data-branch-results]':results,'[data-closed-month]':closed};
 const host={querySelector:selector=>nodes[selector]};
 const window={};
 vm.runInNewContext(read(branchFile),{window});
 const complete=(pos,month,end,field,triovist,full_months)=>({
  pos,from_date:month+'-01',to_date:month+'-'+end,complete:true,field,triovist,total:field+triovist,
  months:1,full_months,missing:[]
 });
 const november=complete(1,'2026-11','26',230359.94,861855.06,false);
 const missing={pos:2,from_date:'2025-11-01',to_date:'2025-11-26',complete:false,
  missing:[{from:'2025-11-01',to:'2025-11-26'}]};
 const october=[complete(1,'2026-10','31',316927.84,798475.54,true),
  complete(2,'2025-10','31',298849.17,522519.67,true)];
 const db={async rpc(name,args){
  calls.push([name,args]);
  return {data:{periods:args.p_from?october:[november,missing],
   today:'2026-11-26',include_triovist:true,source_message_at:'2026-11-26T08:00:08Z'}};
 }};
 window.RESANTA_BRANCH_SALES_PERIODS_V1.mount(host,{actor:'branch-boss',manager:null,db});
 await settle();
 assert.equal((host.innerHTML.match(/type="date"/g)||[]).length,4);
 assert.match(results.innerHTML,/1\s092\s215,00 BYN/);
 assert.match(results.innerHTML,/Нет полного среза 1С за 01\.11\.2025 — 26\.11\.2025/);
 assert.doesNotMatch(results.innerHTML,/%/);
 assert.equal(inputs[3].value,'2025-11-26');
 actions.closed();
 await settle();
 assert.deepEqual(JSON.parse(JSON.stringify(calls.at(-1))),['crm_branch_sales_periods_v1',{
  p_manager:null,p_from:'2026-10-01',p_to:'2026-10-31',p_previous_from:'2025-10-01',p_previous_to:'2025-10-31'
 }]);
 assert.match(results.innerHTML,/\+294\s034,54 BYN/);
 assert.match(results.innerHTML,/\+35,8\s%/);
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
 assert.doesNotMatch(src,/\bcreateTask\(/);
});
test('Sales360 is the default renderer and reuses the scoped annual data',async()=>{
 const f=fixture();
 f.window.renderSales();
 await settle();
 assert.equal(f.navigation.filter(x=>x==='native-sales').length,0);
 assert.equal(f.calls.filter(x=>x.name==='crm_sales360_annual_v2').length,1);
 assert.equal(f.calls[0].name,'crm_sales360_annual_v2');
 assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0].args)),{p_year:2026,p_manager:null,p_exclude_triovist:false});
 const root=f.nodes['sales360-root'];
 assert.ok(root.innerHTML.includes('Продажи филиала'));
 assert.ok(root.innerHTML.includes('Сравнение продаж'));
 assert.doesNotMatch(root.innerHTML,/Годовая детализация|Выбранный месяц · продажи|Разбор потерь и товарных групп|Директорский брифинг|Потенциал менеджеров/);
 assert.ok(root.innerHTML.includes('Клиент &amp; Строй'));
 assert.ok(f.classes.has('s360-installed'));
 f.window.renderSales();
 await settle();
 assert.equal(f.calls.filter(x=>x.name==='crm_sales360_annual_v2').length,1,'same year/manager reused within TTL');
});
test('manager selection refreshes the annual RPC without opening the old report',async()=>{
 const f=fixture();
 f.window.renderSales();await settle();
 f.events.change({target:{closest(sel){return sel==='[data-s360-select]'?{dataset:{s360Select:'manager'},value:'Руднев'}:null}}});
 await settle();
 assert.equal(f.calls.filter(x=>x.name==='crm_sales360_annual_v2').length,2);
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
 assert.match(html,/Выполнение плана/);
 assert.match(html,/Без точной ТТ|без точной ТТ/);
 assert.match(html,/Сравнение продаж/);
 assert.match(html,/Сравнение продаж/);
});
test('client search stays in Sales360 and uses the server-side client RPC',async()=>{
 const f=fixture();f.window.renderSales();await settle();
 const target={dataset:{s360ClientFind:''}};
 f.events.click({target:{closest(x){return x==='button'?target:null}}});
 await settle();
 assert.ok(!f.navigation.includes('native-yoy-open'));
 assert.ok(f.classes.has('s360-installed'));
 assert.equal(f.calls.at(-1).name,'crm_sales360_clients_v2');
 assert.match(f.nodes['sales360-root'].innerHTML,/Поиск клиентов/);
 assert.match(f.nodes['sales360-root'].innerHTML,/Клиент &amp; Строй/);
 assert.match(src,/w\.msyOpen374/,'legacy mode exists only behind explicit fallback');
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

test('selected periods share one graph with exact BYN and no old annual card',async()=>{
 const f=fixture();f.window.renderSales();await settle();
 const html=f.nodes['sales360-root'].innerHTML;
 assert.ok(html.indexOf('Период 1')<html.indexOf('s360-kpis'));
 assert.match(html,/Динамика выбранных периодов/);
 assert.match(html,/Точные суммы/);
 assert.match(html,/316\s*927,84 BYN/);
 assert.doesNotMatch(html,/Годовая детализация|Период в карточке|Динамика с января/);
});

test('manager switch does not reveal native reports or stale numbers during loading',async()=>{
 const f=fixture();f.window.renderSales();await settle();
 f.events.change({target:{closest(sel){return sel==='[data-s360-select]'?{dataset:{s360Select:'manager'},value:'Руднев'}:null}}});
 const loading=f.nodes['sales360-root'].innerHTML;
 assert.match(loading,/Загружаю продажи/);
 assert.match(loading,/s360-manager/);
 assert.ok(!loading.includes('Клиенты · Отгрузки за закрытые месяцы'));
 assert.ok(f.classes.has('s360-installed'));
 assert.ok(!f.navigation.includes('native-manager:Руднев'));
 await settle();
 assert.match(f.nodes['sales360-root'].innerHTML,/Продажи филиала/);
});
test('legacy reports open only by explicit action and return to the director view',async()=>{
 const f=fixture();f.window.renderSales();await settle();
 f.events.click({target:{closest(sel){return sel==='button'?{dataset:{s360Legacy:''}}:null}}});
 assert.ok(!f.classes.has('s360-installed'));
 assert.match(f.nodes['sales360-root'].innerHTML,/Вернуться к продажам/);
 assert.ok(f.navigation.includes('native-manager:all'));
 f.events.click({target:{closest(sel){return sel==='button'?{dataset:{s360Legacy:''}}:null}}});
 assert.ok(f.classes.has('s360-installed'));
 assert.match(f.nodes['sales360-root'].innerHTML,/Динамика выбранных периодов/);
});
test('one full-sales KPI only, no Triovist exclusion UI or separate sale totals',async()=>{
 const f=fixture();f.window.renderSales();await settle();
 const html=f.nodes['sales360-root'].innerHTML;
 assert.match(html,/Сравнение продаж/);
 assert.doesNotMatch(html,/Без Триовиста/);
 assert.doesNotMatch(html,/С января · без Триовиста/);
 assert.doesNotMatch(html,/id="s360-scope"/);
 assert.equal(f.calls.at(-1).args.p_exclude_triovist,false);
 assert.equal((html.match(/s360-tile/g)||[]).length,4);
});
test('clicking a top client opens client detail within Sales360, no old YoY report',async()=>{
 const f=fixture();f.window.renderSales();await settle();
 const target={dataset:{s360ClientKey:'c1'}};
 f.events.click({target:{closest(sel){return sel==='[data-s360-point]'?null:sel==='button'?target:null}}});
 await settle();
 assert.equal(f.calls.at(-1).name,'crm_sales360_clients_v2');
 assert.equal(f.calls.at(-1).args.p_client_key,'c1');
 assert.ok(f.classes.has('s360-installed'));
 assert.ok(!f.navigation.includes('native-yoy-open'));
 assert.match(f.nodes['sales360-root'].innerHTML,/По месяцам/);
 assert.match(f.nodes['sales360-root'].innerHTML,/Группы и SKU/);
});
test('server client search and access scope stay within the selected manager',async()=>{
 const f=fixture('manager');f.window.renderSales();await settle();
 const target={dataset:{s360AllClients:''}};
 f.events.click({target:{closest(sel){return sel==='[data-s360-point]'?null:sel==='button'?target:null}}});
 await settle();
 assert.equal(f.calls.at(-1).args.p_manager,null,'server enforces identity for manager');
 assert.ok(!f.navigation.includes('native-yoy-open'));
 f.events.click({target:{closest(sel){return sel==='[data-s360-point]'?null:sel==='button'?{dataset:{s360ClientKey:'c1'}}:null}}});
 await settle();
 assert.equal(f.calls.at(-1).args.p_client_key,'c1');
 assert.match(v2sql,/crm_sales360_clients_v2/);
 assert.match(v2sql,/Менеджер может просматривать только собственные данные/);
});
test('new RPC is additive, privilege-scoped, protects NULL client IDs and never writes sales',()=>{
 assert.match(v2sql,/create or replace function public\.crm_sales360_annual_v2/);
 assert.match(v2sql,/create or replace function public\.crm_sales360_clients_v2/);
 assert.match(v2sql,/coalesce\(s\.resolved_client_id in \(select id from triovist_ids\),false\)/);
 assert.match(v2sql,/v_role='manager'/);
 assert.match(v2sql,/auth\.uid\(\) is null/);
 assert.match(v2sql,/revoke all on function public\.crm_sales360_annual_v2\(integer,text,boolean\) from public,anon/);
 assert.match(v2sql,/revoke all on function public\.crm_sales360_clients_v2\(integer,text,boolean,text,integer,integer,text\) from public,anon/);
 assert.doesNotMatch(v2sql,/\b(?:update|delete|insert|truncate)\s+public\./i);
 assert.match(v2sql,/least\(50,greatest\(1,coalesce\(p_limit,20\)\)\)/);
});

test('client product drill opens garden subgroups then specific SKU without leaving Sales360',async()=>{
 const f=fixture();f.window.renderSales();await settle();
 const fire=dataset=>f.events.click({target:{closest(sel){return sel==='[data-s360-point]'?null:sel==='button'?{dataset}:null}}});
 fire({s360ClientKey:'c1'});await settle();
 fire({s360ClientTab:'products'});
 fire({s360DrillGroup:'САДОВАЯ ТЕХНИКА',s360DrillScope:'client'});await settle();
 let last=f.calls.at(-1);
 assert.equal(last.name,'crm_sales360_product_drill_v3');
 assert.equal(last.args.p_client_key,'c1');
 assert.equal(last.args.p_category,'САДОВАЯ ТЕХНИКА');
 assert.equal(last.args.p_level,'subgroups');
 assert.match(f.nodes['sales360-root'].innerHTML,/Бензопилы/);
 fire({s360DrillSubgroup:'Бензопилы',s360DrillScope:'client'});await settle();
 last=f.calls.at(-1);
 assert.equal(last.args.p_level,'sku');
 assert.equal(last.args.p_subgroup,'Бензопилы');
 assert.match(f.nodes['sales360-root'].innerHTML,/Бензопила BS-45М Huter/);
 assert.match(f.nodes['sales360-root'].innerHTML,/SKU 70\/6\/4/);
 assert.match(f.nodes['sales360-root'].innerHTML,/SKU не указан/);
 assert.ok(f.classes.has('s360-installed'));
 assert.ok(!f.navigation.includes('native-yoy-open'));
 const callCount=f.calls.length;
 fire({s360DrillBack:'',s360DrillScope:'client'});await settle();
 assert.equal(f.calls.length,callCount,'returning to cached subgroups does not request 1C again');
 assert.match(f.nodes['sales360-root'].innerHTML,/Бензопилы/);
});
test('additive product drill RPC requires server auth, stays read-only and is paginated',()=>{
 assert.match(v3sql,/create or replace function public\.crm_sales360_product_drill_v3/);
 assert.match(v3sql,/auth\.uid\(\) is null/);
 assert.match(v3sql,/Менеджер может просматривать только собственные данные/);
 assert.match(v3sql,/revoke all on function public\.crm_sales360_product_drill_v3\(integer,text,text,text,text,text,text,integer,integer\) from public,anon/);
 assert.match(v3sql,/grant execute on function public\.crm_sales360_product_drill_v3\(integer,text,text,text,text,text,text,integer,integer\) to authenticated,service_role/);
 assert.match(v3sql,/least\(100,greatest\(1,coalesce\(p_limit,50\)\)\)/);
 assert.doesNotMatch(v3sql,/\b(?:update|delete|insert|truncate)\s+public\./i);
});

test('drill patches only its own container and preserves client list/scroll context',async()=>{
 const f=fixture();f.window.renderSales();await settle();
 const fire=dataset=>f.events.click({target:{closest(sel){return sel==='[data-s360-point]'?null:sel==='button'?{dataset}:null}}});
 fire({s360ClientKey:'c1'});await settle();
 fire({s360ClientTab:'products'});
 const html=f.nodes['sales360-root'].innerHTML;
 assert.match(html,/s360-client-product-container/);
 const partial={innerHTML:''};
 f.nodes['s360-client-product-container']=partial;
 const callsBefore=f.calls.length;
 fire({s360DrillGroup:'САДОВАЯ ТЕХНИКА',s360DrillScope:'client'});await settle();
 assert.equal(f.nodes['sales360-root'].innerHTML,html,'the client/list DOM is not rebuilt');
 assert.match(partial.innerHTML,/Бензопилы/);
 assert.equal(f.calls.length,callsBefore+1);
 fire({s360DrillSubgroup:'Бензопилы',s360DrillScope:'client'});await settle();
 assert.equal(f.nodes['sales360-root'].innerHTML,html,'SKU step keeps page DOM and focus');
 assert.match(partial.innerHTML,/SKU 70\/6\/4/);
 const n=f.calls.length;
 fire({s360DrillBack:'',s360DrillScope:'client'});await settle();
 assert.equal(f.calls.length,n,'second look at subgroups uses browser cache');
 assert.match(partial.innerHTML,/Бензопилы/);
});
test('director briefing ranks meaningful category losses with evidence and a concrete next step',async()=>{
 const f=fixture();f.window.renderSales();await settle();
 const api=f.window.RESANTA_SALES360_V1;
 const sig=api.directorSignals(sample);
 assert.equal(sig.issues[0].kind,'decline');
 assert.equal(sig.issues[0].category,'Генераторы');
 assert.equal(sig.issues[0].loss,50000);
 assert.equal(sig.issues[0].priority,'Высокий');
 assert.match(sig.issues[0].action,/подгруппы и SKU/);
 assert.match(src,/directorSignals/);
 assert.doesNotMatch(src,/\.insert\(|\.upsert\(|\.update\(.*tasks/);
});
test('director signals filter weak declines instead of labelling any zero sales as incompetence',()=>{
 const f=fixture();const a={...sample};
 a.categories=[{category:'Незначительное снижение',current_revenue:9500,previous_revenue:10200},
  {category:'Возвраты',current_revenue:-2000,previous_revenue:250}];
 a.matrix=[];a.managers=[];
 const result=f.window.RESANTA_SALES360_V1.directorSignals(a);
 assert.equal(result.declineCount,0);
 assert.equal(result.issues.length,0);
});

test('Sales requests recovery only when opening an individual client',async()=>{
 const f=fixture('manager');f.window.renderSales();await settle();
 assert.equal(f.recoveryCalls.length,0);
 const button={dataset:{s360ClientKey:'c1'}};
 f.events.click({target:{closest(sel){return sel==='button'?button:null}}});
 await settle();
 f.events.click({target:{closest(sel){return sel==='button'?{dataset:{s360ClientTab:'products'}}:null}}});
 const html=f.nodes['sales360-root'].innerHTML;
 assert.match(html,/Разделы клиента/);
 assert.match(html,/Динамика клиента · где падение/);
 assert.equal(f.recoveryCalls.length,1);
 assert.equal(f.recoveryCalls[0].name,'crm_sales360_recovery_v4');
 assert.equal(f.recoveryCalls[0].args.p_client_key,'c1');
 assert.equal(f.recoveryCalls[0].args.p_manager,null);
 assert.equal(f.recoveryCalls[0].args.p_period,'last3');
 assert.match(v4sql,/crm_sales360_recovery_v4/);
 assert.match(lera,/crm_sales360_recovery_v4/);
});
test('recovery RPC is additive, read only, manager scoped, monthly, non-intrusive',()=>{
 assert.match(v4sql,/auth\.uid\(\) is null/);
 assert.match(v4sql,/Менеджер может просматривать только собственные данные/);
 assert.match(v4sql,/crm_client_exact_key_v236204/);
 assert.match(v4sql,/from public\.purchase_history/);
 assert.match(v4sql,/extract\(month from ph\.month\)::int between v_start and v_end/);
 assert.match(v4sql,/baseline_complete/);
 assert.match(v4sql,/История 2023 года начинается с марта/);
 assert.match(v4sql,/revoke all on function public\.crm_sales360_recovery_v4\(integer,text,text,text,text,text\) from public,anon/);
 assert.doesNotMatch(v4sql,/\b(?:update|delete|insert|truncate)\s+public\./i);
});
