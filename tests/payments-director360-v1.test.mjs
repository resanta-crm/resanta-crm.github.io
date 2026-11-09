import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const src=read('assets/188-payments-director360-v1.js');
const index=read('index.html');
const core=read('assets/01-crm-core.js');
const receiptCore=read('assets/03-triovist-routes.js');
const finance=read('assets/12-finance-data-root-v2349.js');

const rows=[
 {client_id:'c1',client_name:'Строймастер УЧП',manager_name:'Ачинович',document_number:'001',document_type:'Поступление',document_at:'2026-11-05',period_start:'2026-11-01',period_end:'2026-11-30',amount:105.25},
 {client_id:'c1',client_name:'Строймастер УЧП',manager_name:'Ачинович',document_number:'002',document_type:'Поступление',document_at:'2026-11-04',period_start:'2026-11-01',period_end:'2026-11-30',amount:2000},
 {client_id:'c2',client_name:'Ремонт & Строй',manager_name:'Руднев',document_number:'003',document_type:'Поступление',document_at:'2026-11-03',period_start:'2026-11-01',period_end:'2026-11-30',amount:8900.75},
 {client_id:'c3',client_name:'Покупатель',manager_name:'Шкуран',document_number:'004',document_at:'2026-10-11',period_start:'2026-10-01',period_end:'2026-10-31',amount:400}
];

function load(){
 const listeners={},nodes={},events={};
 const cls=()=>({add(){},toggle(){},remove(){}});
 const parent={insertBefore(node){nodes[node.id]=node;}};
 for(const id of ['payments-kpi','payments-list']){
  nodes[id]={id,parentNode:parent,classList:cls(),innerHTML:''};
 }
 nodes['payments-manager']={value:'all',disabled:false,options:[{value:'all',textContent:'Все менеджеры',disabled:false},
  {value:'Ачинович',textContent:'Ачинович',disabled:false},{value:'Руднев',textContent:'Руднев',disabled:false},{value:'Шкуран',textContent:'Шкуран',disabled:false}]};
 nodes['payments-month']={value:'2026-11'};
 nodes['payments-period']={value:'all'};
 nodes['payments-search']={value:''};
 const document={
  readyState:'complete',head:{appendChild(node){nodes[node.id]=node;}},
  getElementById(id){return nodes[id]||null;},
  createElement(tag){return{id:'',tag,innerHTML:'',classList:cls(),setAttribute(){},
    addEventListener(name,fn){events[name]=fn;}};},
  addEventListener(name,fn){listeners[name]=fn}
 };
 let oldCalls=0;
 const window={
  renderPayments(){oldCalls++},
  openClient(id){events.clientOpened=id}
 };
 const initial=JSON.stringify(rows);
 const context={window,document,console,Date,Intl,Map,Set,Number,Array,String,Math,allCashReceipts:rows};
 vm.runInNewContext(src,context,{filename:'payments360.js'});
 window.renderPayments();
 return{window,nodes,events,original:initial,getCalls:()=>oldCalls};
}

test('payments 360 is optional, registered last, keeps original receipts/filters/export',()=>{
 assert.doesNotThrow(()=>new vm.Script(src));
 assert.match(index,/assets\/188-payments-director360-v1\.js\?v=20261109-payments360-1/);
 assert.ok(index.indexOf('assets/03-triovist-routes.js')<index.indexOf('assets/188-payments-director360-v1.js'));
 assert.ok(index.indexOf('assets/12-finance-data-root-v2349.js')<index.indexOf('assets/188-payments-director360-v1.js'));
 assert.match(receiptCore,/window\.renderPayments=function\(\)/);
 assert.match(finance,/allCashReceipts/);
 assert.match(core,/function openClient\(/);
 assert.doesNotMatch(src,/\b(?:db|supabase)\.(?:from|rpc|insert|update|delete)\s*\(/);
 assert.doesNotMatch(src,/fetch\s*\(/);
});
test('only 1C document_at decides payment month; report and manager filters are preserved',()=>{
 const f=load(),api=f.window.RESANTA_PAYMENTS360_V1;
 assert.equal(api.readOnly,true);
 assert.equal(api.filterRows(rows,{month:'2026-11',report:'all',manager:'all',search:''}).length,3);
 assert.equal(api.filterRows(rows,{month:'2026-11',report:'all',manager:'Ачинович',search:''}).length,2);
 assert.equal(api.filterRows(rows,{month:'2026-11',report:'2026-10-01|2026-10-31',manager:'all',search:''}).length,0);
 assert.equal(api.filterRows(rows,{month:'2026-11',report:'all',manager:'Руднев',search:'003'}).length,1);
 assert.equal(api.filterRows(rows,{month:'2026-10',report:'all',manager:'all',search:''}).length,1);
});
test('KPI is exact BYN, unique payers and documents; screen never fabricates demo figures',()=>{
 const f=load(),root=f.nodes['payments360-director-v1'];
 const text=root.innerHTML;
 assert.equal(f.getCalls(),1,'original finance renderer still executes exactly once');
 assert.match(text,/11\s?006,00 BYN/);
 assert.match(text,/3 клиентов/);
 assert.match(text,/05\.11\.2026/);
 assert.match(text,/Строймастер УЧП/);
 assert.match(text,/Ремонт &amp; Строй/);
 assert.doesNotMatch(text,/26К|~16К|~4К/);
 assert.equal(JSON.stringify(rows),f.original,'source 1C receipts must not change');
});
test('native manager switching reuses current finance filter without writing data',()=>{
 const f=load(),root=f.nodes['payments360-director-v1'];
 f.events.click({target:{closest(selector){
   if(selector==='[data-p360-manager]')return{dataset:{p360Manager:'Ачинович'}};
   return null;
 }}});
 assert.equal(f.nodes['payments-manager'].value,'Ачинович');
 assert.equal(f.getCalls(),2);
 assert.match(root.innerHTML,/2\s?105,25 BYN/);
 assert.doesNotMatch(root.innerHTML,/8\s?900,75 BYN<\/b><\/button>/);
});
test('source finance truth and 1C import record remain unchanged',()=>{
 const f=load(),api=f.window.RESANTA_PAYMENTS360_V1;
 const selected=api.filterRows(rows,{month:'2026-11',report:'all',manager:'all',search:''});
 const sums=api.summary(selected);
 assert.equal(sums.amount,11006);
 assert.equal(sums.clients,2);
 assert.equal(sums.docs,3);
 assert.equal(sums.latest,'2026-11-05');
 assert.match(src,/Долги и просрочки проверяются отдельно в ПДЗ/);
 assert.match(src,/Дата документа, не дата импорта/);
 assert.match(src,/Открыть исходный список/);
 assert.match(src,/typeof w\.openClient==='function'/);
});
