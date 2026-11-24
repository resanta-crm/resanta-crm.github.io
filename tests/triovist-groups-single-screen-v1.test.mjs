import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const code=read('assets/82-triovist-group-dynamics-v236120.js');
const native=read('assets/173-triovist-native-sections-v1.js');
const index=read('index.html');
const loader=read('assets/100-safe-upgrades-loader-v236272.js');
const performance=read('assets/66-performance-root-v23657.js');
function fixture(role='leader',forecast=true,priceGap=false){
 const owner='aleksandrenko_av@resanta.ru',other='krishtal_na@resanta.ru';
 const manager=role==='manager',email=manager?owner:'payushin_ar@resanta.ru';
 const data=[
  {manager_email:owner,manager_name:'Александренко',group:'Климатическое оборудование',sku_count:32,share_pct:13,growth_pct:-20,current_revenue:12000,basis_revenue:60000,compare_revenue:110000,delta_revenue:-50000,current_qty:9},
  {manager_email:owner,manager_name:'Александренко',group:'Электрогенераторы',sku_count:18,share_pct:7,growth_pct:-90,current_revenue:1000,basis_revenue:5000,compare_revenue:10000,delta_revenue:-5000,current_qty:4},
  {manager_email:other,manager_name:'Кришталь',group:'Садовая техника',sku_count:45,share_pct:21,growth_pct:-25,current_revenue:40000,basis_revenue:70000,compare_revenue:135000,delta_revenue:-65000,current_qty:32},
  {manager_email:owner,manager_name:'Александренко',group:'Инструмент',sku_count:26,share_pct:18,growth_pct:5,current_revenue:19000,basis_revenue:21000,compare_revenue:20000,delta_revenue:1000,current_qty:50}
 ];
 const missing={...data[0],group:'Не распределено',subgroup:'Нет в прайс-листе',
  sku:'67/2/50',product:'Тепловентилятор ТВВ-30',catalog_match:false,
  current_revenue:1977.1,basis_revenue:2696.05,compare_revenue:0,current_qty:2,basis_qty:2.727,compare_qty:0,
  delta_revenue:2696.05,growth_pct:null,sku_count:1};
 const rpcCalls=[];
 const elements=new Map();
 const selectors=['[data-trgd-manager]','[data-trgd-quick]','[data-trgd-from]','[data-trgd-to]',
  '[data-trgd-compare-mode]','[data-trgd-cfrom]','[data-trgd-cto]','[data-trgd-sort]',
  '#trgd-chart-title','#trgd-main-range','#trgd-compare-range','[data-trgd-message]','[data-trgd-kpis]',
  '[data-trgd-graph]','[data-trgd-list]','[data-trgd-status]',
  '[data-trgd-details]','[data-trgd-dialog]'];
 for(const q of selectors)elements.set(q,{innerHTML:'',textContent:'',value:'',hidden:true,open:false,style:{},dataset:{},setAttribute(){}});
 const dialog=elements.get('[data-trgd-dialog]');
 dialog.showModal=()=>{dialog.open=true};
 dialog.close=()=>{dialog.open=false};
 dialog.querySelector=()=>null;
 const buttons=['all','down','up','topmoney','toppercent','topup'].map(k=>({dataset:{trgdView:k},classList:{toggle(){}}}));
 const drillRows=[];
 const host={
  innerHTML:'',onclick:null,onchange:null,
  querySelector:q=>elements.get(q)||null,
  querySelectorAll:q=>q==='[data-trgd-view]'?buttons:q==='[data-trgd-group]'?drillRows:[],
 };
 const doc={
  getElementById:()=>null,
  createElement:()=>({id:'',textContent:''}),
  head:{appendChild(){}}
 };
 const window={
  db:{rpc:async(name,args)=>{
   rpcCalls.push({name,args});
   if(name==='triovist_group_dynamics_context_v1')return {data:{
    access:manager?'manager':'full',last_month:'2026-11',
    catalog:{matched_skus:2136,sales_skus:2164,unmatched_skus:28},
    managers:[{email:owner,name:'Александренко'},{email:other,name:'Кришталь'}]},error:null};
   if(name==='triovist_group_dynamics_v1'){
    if(priceGap&&args.p_level==='sku'&&args.p_group==='Не распределено')return {data:{items:[missing]},error:null};
    if(priceGap&&args.p_level==='sku')return {data:{items:[]},error:null};
    if(args.p_level==='subgroup')return {data:{items:[{...data[0],subgroup:'Конвекторы'}]},error:null};
    if(args.p_level==='sku')return {data:{items:[{...data[0],sku:'67/4/1',product:'Конвектор'}]},error:null};
    const source=priceGap?[...data,missing]:data;
    const scoped=manager?source:source.filter(r=>!args.p_manager_email||r.manager_email===args.p_manager_email);
    const items=forecast?scoped:scoped.map(r=>({...r,basis_revenue:r.current_revenue,delta_revenue:r.current_revenue-r.compare_revenue}));
    return {data:{items,projection:{active:forecast,as_of:'2026-11-04'},classification:{unmatched_skus:28,unmatched_revenue:1080},
     last_import:{month:'2026-11'}},error:null};
   }
   throw Error('Unexpected RPC '+name);
  }}
 };
 const ctx={email,is_manager:manager,is_leader:!manager};
 vm.runInNewContext(code,{window,document:doc,console,Date,Number,Map,Set,encodeURIComponent,decodeURIComponent,CSS:{escape:x=>x}});
 const api=window.RESANTA_TRIOVIST_GROUP_DYNAMICS_V236120;
 const get=q=>elements.get(q);
 const click=(selector,dataset={})=>{
  const target={dataset,closest:q=>q===selector?target:null};
  return host.onclick({target});
 };
 return {api,host,get,click,ctx,data,rpcCalls,drillRows};
}

test('group dashboard compiles, is natively scoped, and avoids any write or parser operation',()=>{
 assert.doesNotThrow(()=>new vm.Script(code));
 assert.match(code,/const V='v23\.6\.125'/);
 assert.match(code,/function renderChart\(\)/);
 assert.match(code,/data-trgd-details/);
 assert.doesNotMatch(code,/\.insert\(|\.upsert\(|fetch\(|setInterval\(/);
 assert.doesNotMatch(code,/RESANTA_TRIOVIST_NATIVE_SECTIONS_V1\?\.refresh\?\.\('groups'\)/);
 assert.match(native,/if\(k==='groups'\|\|k==='stock'\|\|k==='tasks'\|\|k==='motivation'\)return false/);
});
test('open-period overview keeps fact and forecast separate and plots growth and loss',async()=>{
 const x=fixture();assert.equal(await x.api.open(x.host,x.ctx),true);
 assert.match(x.host.innerHTML,/Группы и категории/);
 assert.match(x.host.innerHTML,/Диапазон сравнения/);
 assert.match(x.host.innerHTML,/role="tooltip".*Где меняется оборот/);
 const k=x.get('[data-trgd-kpis]').innerHTML;
 assert.equal((k.match(/class="trgd-kpi"/g)||[]).length,4);
 assert.match(k,/Продажи периода/);
 assert.match(k,/role="tooltip">Ноя 2026 · подтверждённые продажи 1С по 2026-11-04/);
 assert.match(k,/Прогноз периода/);
 assert.match(k,/Изменение по прогнозу/);
 assert.doesNotMatch(x.host.innerHTML,/data-trgd-brief|data-trgd-catalog|Короткий директорский брифинг/);
 const chart=x.get('[data-trgd-graph]').innerHTML;
 assert.match(x.get('#trgd-chart-title').textContent,/прогноз/);
 assert.match(chart,/Климатическое оборудование/);
 assert.match(chart,/Садовая техника/);
 assert.match(chart,/class="trgd-change-fill down" style="--trgd-bar:50.00%"/);
 assert.match(chart,/class="trgd-change-fill up"/);
 assert.match(x.host.innerHTML,/data-trgd-details/);
 assert.doesNotMatch(x.host.innerHTML,/data-trgd-impact/);
 assert.equal(x.rpcCalls.filter(t=>t.name==='triovist_group_dynamics_v1').length,1);
});
test('chart omits its controls and retains the forecast cue in the title',async()=>{
 const x=fixture();await x.api.open(x.host,x.ctx);
 assert.doesNotMatch(x.host.innerHTML,/data-trgd-view|ТОП потерь/);
 assert.match(x.get('#trgd-chart-title').textContent,/прогноз/);
 assert.doesNotMatch(x.get('[data-trgd-graph]').innerHTML,/Нажмите на группу для детализации/);
});
test('manager view cannot leak data from other manager even when backend returns additional rows',async()=>{
 const x=fixture('manager');await x.api.open(x.host,x.ctx);
 for(const q of ['[data-trgd-graph]','[data-trgd-list]']){
  assert.doesNotMatch(x.get(q).innerHTML,/Кришталь|Садовая техника/,q);
 }
 assert.match(x.get('[data-trgd-kpis]').innerHTML,/Прогноз/);
 assert.match(x.get('[data-trgd-graph]').innerHTML,/Климатическое оборудование/);
});
test('calendar selects a month range, updates comparison, and queries only on Show',async()=>{
 const x=fixture();await x.api.open(x.host,x.ctx);
 const dialog=x.get('[data-trgd-dialog]');
 const queries=()=>x.rpcCalls.filter(x=>x.name==='triovist_group_dynamics_v1');
 x.click('[data-trgd-open-period]',{trgdOpenPeriod:'main'});
 assert.equal(dialog.open,true);
 assert.match(dialog.innerHTML,/<h5>2025<\/h5>.*<h5>2026<\/h5>/);
 x.click('[data-trgd-month]',{trgdMonth:'2026-11'});
 x.click('[data-trgd-month]',{trgdMonth:'2026-09'});
 assert.match(dialog.innerHTML,/Сен 2026 — Ноя 2026/);
 x.click('[data-trgd-period-confirm]');
 assert.equal(dialog.open,false);
 assert.equal(x.get('#trgd-main-range').textContent,'Сен 2026 — Ноя 2026');
 assert.equal(x.get('#trgd-compare-range').textContent,'Сен 2025 — Ноя 2025');
 assert.equal(queries().length,1);
 assert.equal(x.api.readOnlySnapshot().from,'2026-11');
 x.click('[data-trgd-apply]');
 await Promise.resolve();
 assert.equal(queries().at(-1).args.p_from_month,'2026-09-01');
 assert.equal(queries().at(-1).args.p_to_month,'2026-11-01');
 assert.equal(queries().at(-1).args.p_compare_from_month,'2025-09-01');
});
test('custom comparison and calendar cancellation preserve the intended dates',async()=>{
 const x=fixture();await x.api.open(x.host,x.ctx);
 const dialog=x.get('[data-trgd-dialog]');
 x.click('[data-trgd-open-period]',{trgdOpenPeriod:'main'});
 x.click('[data-trgd-preset]',{trgdPreset:'quarter'});
 assert.match(dialog.innerHTML,/Окт 2026 — Ноя 2026/);
 dialog.close();
 assert.equal(x.get('#trgd-main-range').textContent,'Ноя 2026');
 x.click('[data-trgd-open-period]',{trgdOpenPeriod:'compare'});
 x.click('[data-trgd-month]',{trgdMonth:'2026-08'});
 x.click('[data-trgd-period-confirm]');
 assert.equal(x.get('[data-trgd-compare-mode]').value,'custom');
 assert.equal(x.get('#trgd-compare-range').textContent,'Авг 2026');
 x.click('[data-trgd-apply]');
 await Promise.resolve();
 const args=x.rpcCalls.at(-1).args;
 assert.equal(args.p_compare_from_month,'2026-08-01');
 assert.equal(args.p_compare_to_month,'2026-08-01');
});
test('late asynchronous group filter responses cannot replace newer data',()=>{
 assert.match(code,/const request=\+\+loadEpoch/);
 assert.match(code,/if\(request!==loadEpoch\)return/);
 assert.match(code,/if\(request===loadEpoch\)showError\(e\)/);
});
test('closed-period overview leaves one sales total with details under stars',async()=>{
 const x=fixture('leader',false);await x.api.open(x.host,x.ctx);
 const k=x.get('[data-trgd-kpis]').innerHTML;
 assert.equal((k.match(/class="trgd-kpi"/g)||[]).length,3);
 assert.equal((k.match(/role="tooltip"/g)||[]).length,3);
 assert.match(k,/подтверждённые продажи 1С/);
 assert.doesNotMatch(k,/Прогноз|Продажи · факт 1С/);
 const list=x.get('[data-trgd-list]').innerHTML;
 assert.equal((list.match(/trgd-table-head/g)||[]).length,2);
 assert.match(list,/Продажи, BYN/);
 assert.doesNotMatch(list,/Доля|SKU · доля/);
 assert.match(code,/\.trgd-table-head\{position:sticky/);
});
test('chart opens the matching group and loads subgroup and SKU on demand',async()=>{
 const x=fixture();await x.api.open(x.host,x.ctx);
 const box={hidden:true,dataset:{},innerHTML:''};
 const owner='aleksandrenko_av@resanta.ru',group='Климатическое оборудование';
 const row={dataset:{manager:encodeURIComponent(owner),trgdGroup:encodeURIComponent(group)},
  nextElementSibling:box,querySelector:()=>null};
 x.drillRows.push(row);
 x.click('[data-trgd-inspect]',{manager:row.dataset.manager,trgdInspect:row.dataset.trgdGroup});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(x.get('[data-trgd-details]').open,true);
 assert.equal(box.hidden,false);
 assert.match(box.innerHTML,/Конвекторы/);
 x.click('[data-trgd-inspect]',{manager:row.dataset.manager,trgdInspect:row.dataset.trgdGroup});
 assert.equal(box.hidden,false,'clicking the chart always reveals the group');
 const skuBox={hidden:true,dataset:{},innerHTML:''};
 const subgroup={dataset:{manager:row.dataset.manager,group:row.dataset.trgdGroup,trgdSubgroup:encodeURIComponent('Конвекторы')},
  nextElementSibling:skuBox,querySelector:()=>null};
 const event={target:{closest:selector=>selector==='[data-trgd-subgroup]'?subgroup:null}};
 x.host.onclick(event);
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(skuBox.innerHTML,/SKU 67\/4\/1/);
 const levels=x.rpcCalls.filter(c=>c.name==='triovist_group_dynamics_v1');
 assert.deepEqual(levels.map(c=>c.args.p_level),['group','subgroup','sku']);
 assert.equal(levels.at(-1).args.p_group,group);
 assert.equal(levels.at(-1).args.p_subgroup,'Конвекторы');
});
test('cache busting makes native group version visible after hard reload',()=>{
 assert.match(loader,/20261123-groups-sticky/);
 assert.match(performance,/20261123-groups-sticky/);
 assert.match(index,/173-triovist-native-sections-v1\.js\?v=20261105-motivation-director-1/);
 assert.match(index,/100-safe-upgrades-loader-v236272\.js\?v=20261112-stands360-feedback-v3/);
 assert.match(native,/if\(k==='groups'\|\|k==='stock'\|\|k==='tasks'\|\|k==='motivation'\)return false/);
});

test('manager filter keeps the chart and detail table in the same scope',async()=>{
 const x=fixture();await x.api.open(x.host,x.ctx);
 const email='krishtal_na@resanta.ru';
 x.get('[data-trgd-manager]').value=email;
 x.click('[data-trgd-apply]');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(x.rpcCalls.at(-1).args.p_manager_email,email);
 for(const key of ['graph','list']){
  const html=x.get('[data-trgd-'+key+']').innerHTML;
  assert.match(html,/Садовая техника/);
  assert.doesNotMatch(html,/Климатическое оборудование|Александренко/);
 }
});

test('verified missing-price SKU moves into its sales group without increasing totals or inventing a price',async()=>{
 const x=fixture('leader',true,true);await x.api.open(x.host,x.ctx);
 const {groups}=x.api.readOnlySnapshot();
 const climate=groups.find(r=>r.group==='Климатическое оборудование');
 assert.equal(climate.current_revenue,13977.1);
 assert.equal(climate.basis_revenue,62696.05);
 assert.equal(climate.delta_revenue,-47303.95);
 assert.equal(climate.sku_count,33);
 assert.ok(!groups.some(r=>r.group==='Не распределено'));
 assert.equal(Math.round(groups.reduce((sum,r)=>sum+r.current_revenue,0)*100),7397710);
 const raw={sku:'67/2/50',group:'Не распределено',subgroup:'Нет в прайс-листе',catalog_match:false};
 const fixed=x.api.classifyUnmatchedSku(raw);
 assert.equal(fixed.subgroup,'Тепловентиляторы');
 assert.equal(fixed.catalog_match,false);
 assert.equal(fixed.sourcePriceError,true);
 assert.equal('price' in fixed,false);
 assert.equal(x.api.classifyUnmatchedSku({...raw,sku:'unverified'}).group,'Не распределено');
});
