import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const src=read('assets/189-falling-director360-v1.js');
const index=read('index.html');
const core=read('assets/02-mobile-gps-base.js');
const analytic=read('assets/03-triovist-routes.js');
const oldPeriod=read('assets/79-falling-task-period-v236106.js');

function fixture(role='boss'){
 const nodes={},events={};
 const classes=new Set(['active']);
 const page={classList:{contains:c=>classes.has(c),add:c=>classes.add(c),remove:c=>classes.delete(c),
   toggle(c,set){if(set)classes.add(c);else classes.delete(c)}},};
 const parent={insertBefore(node){nodes[node.id]=node}};
 nodes['page-falling']=page;
 nodes['falling-kpi']={parentElement:parent,innerHTML:'EXISTING KPI'};
 nodes['falling-list']={innerHTML:'EXISTING CLIENT DETAILS'};
 nodes['falling-severity']={value:'all'};
 nodes['falling-search']={value:''};
 nodes['falling-manager']={value:'all',options:[{value:'all',disabled:false},{value:'Руднев',disabled:false},{value:'Ачинович',disabled:false}]};
 const document={
  readyState:'complete',
  head:{appendChild(node){nodes[node.id]=node}},
  createElement(tag){return{id:'',tag,setAttribute(){},addEventListener(type,handler){events[type]=handler},innerHTML:''}},
  getElementById(id){return nodes[id]||null}
 };
 const client1={id:'client-1',name:'Тестовый Клиент А',manager_name:'Руднев',region:'Орша'};
 const client2={id:'client-2',name:'Тестовый Клиент Б',manager_name:'Ачинович',region:'Бобруйск'};
 const rows=[{
  client:client1,entity:{ids:new Set(['client-1']),key:'legal-1'},cur:1000,prev:3000,loss:2000,pct:66.6667,severity:'critical',
  task:{source:'stands',text:'Проверить стенд',done:false},breakdown:{cats:[{name:'Инструмент',loss:2000}],items:[{label:'Перфоратор А',group:'Инструмент',loss:900}]}
 },{
  client:client2,entity:{ids:new Set(['client-2']),key:'legal-2'},cur:2000,prev:2400,loss:400,pct:16.6667,severity:'action',
  task:{source:'falling_ai',text:'[ПАДЕНИЕ ПРОДАЖ] Вернуть клиента',done:false},breakdown:{cats:[],items:[]}
 }];
 const hist={
  'client-1':[
   {month:'2026-08-01',revenue:4000},{month:'2025-08-01',revenue:5000},
   {month:'2026-09-01',revenue:3000},{month:'2025-09-01',revenue:3500},
   {month:'2026-10-01',revenue:1000},{month:'2025-10-01',revenue:3000}
  ],
  'client-2':[
   {month:'2026-08-01',revenue:900},{month:'2025-08-01',revenue:1200},
   {month:'2026-09-01',revenue:1600},{month:'2025-09-01',revenue:2400},
   {month:'2026-10-01',revenue:2000},{month:'2025-10-01',revenue:2400}
  ]
 };
 let baseCalls=0,clientOpens=[],abcOpens=[],aiOpens=[];
 const window={
  renderFallingClients(){baseCalls++;return 'legacy-rendered'},
  v22716FallingHist(client){return hist[client.id]||[]},
  openClient(id){clientOpens.push(id)},
  openABCForClient(id){abcOpens.push(id)},
  v2274OpenFallingAi(id){aiOpens.push(id)},
 };
 const context={
  window,document,console,Intl,Date,Math,Number,Map,Set,String,Array,RegExp,Error,JSON,
  currentProfile:{role,name:'Test director'},
  v20FallingRows:rows,
  allTasks:[
   {client_id:'client-1',source:'stands',text:'Проверить стенд',done:false},
   {client_id:'client-2',source:'falling_ai',text:'[ПАДЕНИЕ ПРОДАЖ] Вернуть клиента',done:false}
  ],
  allPurchaseHistory:hist['client-1'].concat(hist['client-2']),
  v20FallingPeriod:()=>({start:'2026-01',end:'2026-10',label:'янв — окт 2026',previousLabel:'янв — окт 2025',current:['2026-01','2026-10']}),
  TODAY:'2026-11-09',
  alert(){}
 };
 vm.createContext(context);
 vm.runInContext(src,context,{filename:'falling360.js'});
 return {context,nodes,events,classes,window,rows,baseCalls:()=>baseCalls,clientOpens,abcOpens,aiOpens};
}
function press(f,selector,attrs={}){
 const click=f.events.click;assert.equal(typeof click,'function');
 click({target:{closest(query){
   return query==='button'?{hasAttribute:key=>Object.hasOwn(attrs,key),getAttribute:key=>attrs[key]}:null;
 }}});
}
test('isolated view loads after the established falling engine and task guards',()=>{
 assert.doesNotThrow(()=>new vm.Script(src));
 assert.match(index,/assets\/189-falling-director360-v1\.js\?v=20261109-falling360-1/);
 assert.ok(index.indexOf('assets/79-falling-task-period-v236106.js')<index.indexOf('assets/189-falling-director360-v1.js'));
 assert.ok(index.indexOf('assets/189-falling-director360-v1.js')>index.indexOf('assets/188-payments-director360-v1.js'));
 assert.match(core,/function renderFallingClients\(\)/);
 assert.match(analytic,/window\.v2274OpenFallingAi=async function\(id\)/);
 assert.match(oldPeriod,/installAiGuard/);
});
test('does not write sales, tasks, client records, routes, or invent recovered amounts',()=>{
 assert.doesNotMatch(src,/\b(?:db|supabase)\.(?:from|rpc|insert|update|delete)\s*\(/);
 assert.doesNotMatch(src,/\bfetch\s*\(/);
 assert.match(src,/Брифинг сформирован правилами/);
 assert.match(src,/Клиент, вышедший из списка падения, ещё не считается подтверждённо восстановленным/);
 assert.match(src,/Сравнение по одним и тем же клиентам/);
});
test('falling-task detection distinguishes unrelated client tasks',()=>{
 const f=fixture();
 const api=f.window.RESANTA_FALLING360_V1;
 assert.equal(api.readOnly,true);
 assert.equal(api.isRecoveryTask({source:'stands',text:'Оформить стенд'}),false);
 assert.equal(api.isRecoveryTask({source:'falling_ai'}),true);
 assert.equal(api.isRecoveryTask({text:'[ПАДЕНИЕ ПРОДАЖ] Вернуть клиента'}),true);
 assert.equal(api.taskOpen({done:false,review_status:'rejected'}),false);
 assert.equal(api.taskOpen({done:true}),false);
 assert.equal(api.taskOpen({done:false,review_status:'pending'}),true);
 assert.equal(JSON.stringify(Array.from(api.monthsFor('2026-11'))),JSON.stringify(['2026-08','2026-09','2026-10','2026-11']));
});
test('director dashboard renders exact KPI values and both years from known client history',()=>{
 const f=fixture();
 assert.equal(f.window.renderFallingClients(),'legacy-rendered');
 const html=f.nodes['falling360-root'].innerHTML;
 assert.equal(f.baseCalls(),1,'original engine executes once');
 assert.match(html,/Возврат продаж 360°/);
 assert.match(html,/Падающие клиенты/);
 assert.match(html,/Снижение оборота/);
 assert.match(html,/2,4 тыс. BYN/);
 assert.match(html,/Критично/);
 assert.match(html,/Без задачи возврата/);
 assert.match(html,/f360-swatch current/);
 assert.match(html,/>2026<\/span>/);
 assert.match(html,/Аналог прошлого года/);
 assert.match(html,/Тестовый Клиент А/);
 assert.match(html,/Тестовый Клиент Б/);
 assert.match(html,/У 1 есть задачи другого типа/);
 assert.ok(f.classes.has('f360-installed'));
 assert.equal(f.nodes['falling-list'].innerHTML,'EXISTING CLIENT DETAILS');
 assert.equal(f.nodes['falling-kpi'].innerHTML,'EXISTING KPI');
});
test('manager navigation triggers the original filter and remains scope-bound',()=>{
 const f=fixture();
 f.window.renderFallingClients();
 press(f,'button',{'data-f360-manager':'Руднев'});
 assert.equal(f.nodes['falling-manager'].value,'Руднев');
 assert.equal(f.baseCalls(),2);
 const m=fixture('manager');
 m.window.renderFallingClients();
 press(m,'button',{'data-f360-manager':'Руднев'});
 assert.equal(m.baseCalls(),1);
});
test('client deep dive uses original client, ABC and AI guard handlers',()=>{
 const f=fixture();
 f.window.renderFallingClients();
 press(f,'button',{'data-f360-focus':'client-1'});
 const html=f.nodes['falling360-root'].innerHTML;
 assert.match(html,/Потерянные группы/);
 assert.match(html,/Перфоратор А/);
 assert.match(html,/Мозговой штурм/);
 assert.match(html,/Комментарий руководителя для ИИ-задачи/);
 press(f,'button',{'data-f360-client':'client-1'});
 press(f,'button',{'data-f360-abc':'client-1'});
 press(f,'button',{'data-f360-ai':'client-1'});
 assert.deepEqual(f.clientOpens,['client-1']);
 assert.deepEqual(f.abcOpens,['client-1']);
 assert.deepEqual(f.aiOpens,['client-1']);
});
test('legacy card disclosure never deletes the original client list',()=>{
 const f=fixture();
 f.window.renderFallingClients();
 press(f,'button',{'data-f360-legacy':''});
 assert.equal(f.classes.has('f360-legacy-open'),true);
 assert.equal(f.nodes['falling-list'].innerHTML,'EXISTING CLIENT DETAILS');
});
