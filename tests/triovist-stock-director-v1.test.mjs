import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const source=read('assets/174-triovist-stock-director-v1.js');
const routes=read('assets/03-triovist-routes.js');
const native=read('assets/173-triovist-native-sections-v1.js');
const index=read('index.html');

function fixture(){
 const logs={},styles=[];
 const card={classList:{add(){}},contains:el=>el===meta||el===root,querySelector:selector=>selector==='.card-title'?title:null};
 const note={textContent:''};
 const title={textContent:'',parentElement:{querySelector:()=>note}};
 const elem=()=>({dataset:{},innerHTML:'',textContent:'',listeners:{},addEventListener(t,fn){this.listeners[t]=fn}});
 const meta=elem(),root=elem(),busy=elem();
 const doc={getElementById:id=>id==='trst174-css'?null:id==='tri-stock-card'?card:null,
  querySelector:q=>q==='#tri-stock-card [data-trst-loading]'?busy:null,
  createElement:()=>({id:'',textContent:''}),head:{appendChild:e=>styles.push(e)}};
 const window={};
 vm.runInNewContext(source,{window,document:doc,Number,Math,Map,console});
 const sample=[
  {manager_email:'aleksandrenko_av@resanta.ru',manager_name:'Александренко',sku:'A-1',product:'Генератор',assigned_group:'Генераторы',sales_90:5,partner_total:0,partner_orders:0,stock_days:0,own_qty:8,chekhov_qty:6,recommended:10,ship_own:4,order_chekhov:3,uncovered:3},
  {manager_email:'aleksandrenko_av@resanta.ru',manager_name:'Александренко',sku:'A-2',product:'Инструмент',assigned_group:'Инструмент',sales_90:6,partner_total:4,partner_orders:0,stock_days:12,own_qty:3,chekhov_qty:0,recommended:3,ship_own:3,order_chekhov:0,uncovered:0},
  {manager_email:'krishtal_na@resanta.ru',manager_name:'Кришталь',sku:'K-1',product:'Триммер',assigned_group:'Сад',sales_90:7,partner_total:0,partner_orders:2,stock_days:2,own_qty:2,chekhov_qty:4,recommended:7,ship_own:2,order_chekhov:3,uncovered:2}
 ];
 let opts={meta,root,items:sample,imports:{partner:{snapshot_date:'2026-11-04',source_file:'21.xlsx'},own:{report_date:'2026-11-05'},chekhov:{snapshot_date:'2026-11-03',source_file:'ch.xlsx'}},
 days:45,error:'',isBoss:true,isManager:false,actorEmail:'payushin_ar@resanta.ru',search:''};
 const api=window.RESANTA_TRIOVIST_STOCK_DIRECTOR_V1;
 const render=()=>api.render(opts);
 window.renderTriovistStock=render;window.triovistStockReload=()=>{logs.retries=(logs.retries||0)+1};
 const click=(host,key,elementData)=>{
  let el={dataset:elementData};
  el.closest=s=>s===key?el:null;
  host.listeners.click({target:el});
 };
 return {api,meta,root,doc,window,opts,render,click,logs,sample,styles};
}
test('new module compiles and never writes to database, starts parser or imports files',()=>{
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.match(source,/readOnly:true,noDbWrites:true,noParserRuns:true/);
 assert.doesNotMatch(source,/\.rpc\(|\.insert\(|\.upsert\(|fetch\(|setInterval\(/);
 assert.doesNotMatch(source,/main-content|MutationObserver/);
});
test('director KPI, source dates, chart, manager priorities and one SKU detail render natively',()=>{
 const x=fixture();assert.equal(x.render(),true);
 assert.match(x.meta.innerHTML,/Риск дефицита/);
 assert.match(x.meta.innerHTML,/2 SKU/);
 assert.match(x.meta.innerHTML,/Отгрузить из Витебска/);
 assert.match(x.meta.innerHTML,/9 ед/);
 assert.match(x.meta.innerHTML,/Заказать из Чехова/);
 assert.match(x.meta.innerHTML,/6 ед/);
 assert.match(x.meta.innerHTML,/Остаётся не покрыто/);
 assert.match(x.meta.innerHTML,/5 ед/);
 assert.match(x.meta.innerHTML,/21\.xlsx|ch\.xlsx/);
 assert.match(x.meta.innerHTML,/Приоритеты менеджеров/);
 assert.match(x.meta.innerHTML,/Александренко/);
 assert.match(x.meta.innerHTML,/Кришталь/);
 assert.match(x.meta.innerHTML,/trst-track/);
 assert.match(x.root.innerHTML,/data-trst-details/);
 assert.match(x.root.innerHTML,/Генераторы|Генератор/);
});
test('manager role cannot see another manager, even if untrusted calling code supplies extra records',()=>{
 const x=fixture();x.opts.isBoss=false;x.opts.isManager=true;x.opts.actorEmail='aleksandrenko_av@resanta.ru';
 assert.equal(x.render(),true);
 assert.doesNotMatch(x.meta.innerHTML+x.root.innerHTML,/Кришталь|K-1|Триммер/);
 assert.match(x.meta.innerHTML,/Александренко/);
 assert.match(x.meta.innerHTML,/3 ед/);
});
test('missing dates are labelled as unverified instead of invented freshness',()=>{
 const x=fixture();x.opts.imports={partner:{},own:{},chekhov:{}};
 x.render();
 assert.match(x.meta.innerHTML,/отсутствует дата снимка/);
 assert.match(x.meta.innerHTML,/не загружена/);
});
test('API handles backend failure: no stale KPIs, safe retry button',()=>{
 const x=fixture();x.render();x.opts.error='Test RPC timeout <server>';
 x.render();
 assert.match(x.meta.innerHTML,/Не удалось загрузить/);
 assert.match(x.meta.innerHTML,/&lt;server&gt;/);
 assert.doesNotMatch(x.meta.innerHTML,/Отгрузить из Витебска/);
 assert.equal(x.root.innerHTML,'');
 x.click(x.meta,'[data-trst-retry]',{});
 assert.equal(x.logs.retries,1);
});
test('table supports more than 500 rows with pagination rather than losing data',()=>{
 const x=fixture();x.opts.items=Array.from({length:520},(_,i)=>({...x.sample[0],sku:'A-'+String(i+1),uncovered:1}));
 x.render();
 assert.match(x.root.innerHTML,/520/);
 assert.match(x.root.innerHTML,/1 \/ 21/);
 assert.equal((x.root.innerHTML.match(/<tr><td>/g)||[]).length,25);
 x.click(x.root,'[data-trst-page]',{trstPage:'2'});
 assert.match(x.root.innerHTML,/2 \/ 21/);
 assert.equal((x.root.innerHTML.match(/<tr><td>/g)||[]).length,25);
});
test('director manager filter scopes visible KPIs and detailed SKU',()=>{
 const x=fixture();x.render();
 x.meta.listeners.change({target:{id:'tri-stock-director-manager',value:'krishtal_na@resanta.ru'}});
 assert.match(x.meta.innerHTML,/2 ед/);
 assert.doesNotMatch(x.root.innerHTML,/A-1|Генератор/);
 assert.match(x.root.innerHTML,/K-1|Триммер/);
});
test('stock day change invalidates cache, waits in-flight and recomputes via legacy RPC',()=>{
 assert.match(routes,/window\.triovistStockDaysChanged=async function/);
 assert.match(routes,/const n=Number\(document\.getElementById\('tri-stock-days'\)\?\.value\)\|\|45,epoch=\+\+triStockDaysEpoch/);
 assert.match(routes,/if\(triStockFlight\)await triStockFlight/);
 assert.match(routes,/await window\.triovistStockReload\(true\)/);
 assert.match(routes,/if\(force\)\{window\.TRIOVIST_DATA_HUB_V227315\?\.invalidate\('stock'\)/);
 assert.match(routes,/p_target_days:Number\(document\.getElementById\('tri-stock-days'\)\?\.value\)\|\|45/);
});
test('errors are retryable and real stock data cannot leave the manager scope',()=>{
 assert.match(routes,/triStockError=e\.message\|\|String\(e\);triStockLoaded=false/);
 assert.match(routes,/const allowed=triStockItems\.filter\(x=>triIsBoss\(\)\|\|\(triIsManager\(\)&&String\(x\.manager_email/);
 assert.match(routes,/actorEmail:triEmail\(\)/);
 assert.match(routes,/if\(director\.render\(\{meta,root,items:allowed/);
 assert.match(routes,/function triStockFiltered\(\)\{let mgr=document\.getElementById\('tri-stock-director-manager'\)/);
 assert.match(routes,/window\.triovistExportStock=function\(\)/);
});
test('legacy stock stays fallback and six other tabs are untouched by overlay removal',()=>{
 assert.match(native,/if\(k==='groups'\|\|k==='stock'\|\|k==='tasks'\|\|k==='motivation'\)return false/);
 assert.match(index,/174-triovist-stock-director-v1\.js\?v=20261105-stock-director-1/);
 assert.match(index,/03-triovist-routes\.js\?v=20261105-stock-director-1/);
 assert.match(routes,/Triovist stock native director fallback/);
 assert.match(routes,/const shown=rows\.slice\(0,500\)/); // emergency legacy fallback remains
 assert.match(routes,/window\.triovistExportStock=function\(\)/);
});
