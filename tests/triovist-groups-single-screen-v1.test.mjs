import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const code=read('assets/82-triovist-group-dynamics-v236120.js');
const native=read('assets/173-triovist-native-sections-v1.js');
const index=read('index.html');
const loader=read('assets/100-safe-upgrades-loader-v236272.js');
function fixture(role='leader'){
 const owner='aleksandrenko_av@resanta.ru',other='krishtal_na@resanta.ru';
 const manager=role==='manager',email=manager?owner:'payushin_ar@resanta.ru';
 const data=[
  {manager_email:owner,manager_name:'Александренко',group:'Климатическое оборудование',sku_count:32,share_pct:13,growth_pct:-20,current_revenue:12000,basis_revenue:60000,compare_revenue:110000,delta_revenue:-50000,current_qty:9},
  {manager_email:owner,manager_name:'Александренко',group:'Электрогенераторы',sku_count:18,share_pct:7,growth_pct:-90,current_revenue:1000,basis_revenue:5000,compare_revenue:10000,delta_revenue:-5000,current_qty:4},
  {manager_email:other,manager_name:'Кришталь',group:'Садовая техника',sku_count:45,share_pct:21,growth_pct:-25,current_revenue:40000,basis_revenue:70000,compare_revenue:135000,delta_revenue:-65000,current_qty:32},
  {manager_email:owner,manager_name:'Александренко',group:'Инструмент',sku_count:26,share_pct:18,growth_pct:5,current_revenue:19000,basis_revenue:21000,compare_revenue:20000,delta_revenue:1000,current_qty:50}
 ];
 const rpcCalls=[];
 const elements=new Map();
 const selectors=['[data-trgd-manager]','[data-trgd-quick]','[data-trgd-from]','[data-trgd-to]',
  '[data-trgd-compare-mode]','[data-trgd-cfrom]','[data-trgd-cto]','[data-trgd-sort]',
  '[data-trgd-catalog]','[data-trgd-kpis]','[data-trgd-brief]','[data-trgd-managers]',
  '[data-trgd-graph]','[data-trgd-priorities]','[data-trgd-list]','[data-trgd-status]',
  '[data-trgd-details]','[data-trgd-catalog-detail]'];
 for(const q of selectors)elements.set(q,{innerHTML:'',textContent:'',value:'',hidden:true,open:false,style:{},dataset:{},setAttribute(){}});
 const buttons=['all','down','up','topmoney','toppercent','topup'].map(k=>({dataset:{trgdView:k},classList:{toggle(){}}}));
 const host={
  innerHTML:'',onclick:null,onchange:null,
  querySelector:q=>elements.get(q)||null,
  querySelectorAll:q=>q==='[data-trgd-view]'?buttons:[],
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
    const items=manager?data:data.filter(r=>!args.p_manager_email||r.manager_email===args.p_manager_email);
    return {data:{items,projection:{active:true,as_of:'2026-11-04'},classification:{unmatched_skus:28,unmatched_revenue:1080},
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
 return {api,host,get,click,ctx,data,rpcCalls};
}

test('group dashboard compiles, is natively scoped, and avoids any write or parser operation',()=>{
 assert.doesNotThrow(()=>new vm.Script(code));
 assert.match(code,/const V='v23\.6\.121'/);
 assert.match(code,/function renderPriorities\(\)/);
 assert.match(code,/function renderManagers\(\)/);
 assert.match(code,/function renderChart\(\)/);
 assert.match(code,/data-trgd-details/);
 assert.doesNotMatch(code,/\.insert\(|\.upsert\(|fetch\(|setInterval\(/);
 assert.doesNotMatch(code,/RESANTA_TRIOVIST_NATIVE_SECTIONS_V1\?\.refresh\?\.\('groups'\)/);
 assert.match(native,/if\(k==='groups'\)return false/);
});
test('single-screen view renders one set of four KPI cards, a chart, and visible priorities',async()=>{
 const x=fixture();assert.equal(await x.api.open(x.host,x.ctx),true);
 assert.match(x.host.innerHTML,/Группы и категории/);
 assert.match(x.host.innerHTML,/Точные месяцы для сравнения/);
 const k=x.get('[data-trgd-kpis]').innerHTML;
 assert.equal((k.match(/class="trgd-kpi"/g)||[]).length,4);
 assert.match(k,/Продажи · факт 1С/);
 assert.match(k,/Прогноз периода/);
 assert.match(k,/Прогноз к прошлому периоду/);
 assert.match(x.get('[data-trgd-brief]').innerHTML,/Короткий директорский брифинг/);
 assert.match(x.get('[data-trgd-graph]').innerHTML,/Прогноз полного периода/);
 assert.match(x.get('[data-trgd-priorities]').innerHTML,/Климатическое оборудование/);
 assert.match(x.get('[data-trgd-priorities]').innerHTML,/Садовая техника/);
 assert.match(x.host.innerHTML,/data-trgd-details/);
 assert.doesNotMatch(x.host.innerHTML,/data-trgd-impact/);
 assert.equal(x.rpcCalls.filter(t=>t.name==='triovist_group_dynamics_v1').length,1);
});
test('declines by money and by percent use different sorting, filters update visible cards immediately',async()=>{
 const x=fixture('manager');await x.api.open(x.host,x.ctx);
 x.click('[data-trgd-view]',{trgdView:'topmoney'});
 const money=x.get('[data-trgd-priorities]').innerHTML;
 assert.ok(money.indexOf('Климатическое оборудование')<money.indexOf('Электрогенераторы'));
 x.click('[data-trgd-view]',{trgdView:'toppercent'});
 const pct=x.get('[data-trgd-priorities]').innerHTML;
 assert.ok(pct.indexOf('Электрогенераторы')<pct.indexOf('Климатическое оборудование'));
 x.click('[data-trgd-view]',{trgdView:'up'});
 const up=x.get('[data-trgd-priorities]').innerHTML;
 assert.match(up,/Инструмент/);
 assert.doesNotMatch(up,/Климатическое оборудование|Электрогенераторы/);
 assert.equal(x.rpcCalls.filter(t=>t.name==='triovist_group_dynamics_v1').length,1,'view changes do not require extra queries');
});
test('manager view cannot leak data from other manager even when backend returns additional rows',async()=>{
 const x=fixture('manager');await x.api.open(x.host,x.ctx);
 for(const q of ['[data-trgd-brief]','[data-trgd-managers]','[data-trgd-priorities]','[data-trgd-list]']){
  assert.doesNotMatch(x.get(q).innerHTML,/Кришталь|Садовая техника/,q);
 }
 assert.match(x.get('[data-trgd-kpis]').innerHTML,/Прогноз/);
 assert.match(x.get('[data-trgd-managers]').innerHTML,/Александренко/);
});
test('catalog warning appears once and is independent of date status',async()=>{
 const x=fixture();await x.api.open(x.host,x.ctx);
 assert.equal((x.get('[data-trgd-catalog]').innerHTML.match(/data-trgd-catalog-toggle/g)||[]).length,1);
 assert.match(x.get('[data-trgd-catalog]').innerHTML,/28 SKU/);
 assert.match(x.get('[data-trgd-catalog]').innerHTML,/Сопоставлено:/);
 assert.match(x.get('[data-trgd-catalog]').innerHTML,/2[\s\u00a0\u202f]136/);
 assert.doesNotMatch(x.get('[data-trgd-status]').innerHTML||x.get('[data-trgd-status]').textContent,/28 SKU/);
});
test('late asynchronous group filter responses cannot replace newer data',()=>{
 assert.match(code,/const request=\+\+loadEpoch/);
 assert.match(code,/if\(request!==loadEpoch\)return/);
 assert.match(code,/if\(request===loadEpoch\)showError\(e\)/);
});
test('all detailed subgroups/SKU still use previous safe lazy RPC route',()=>{
 assert.match(code,/getLevel\('subgroup',manager\|\|null,group,null\)/);
 assert.match(code,/getLevel\('sku',manager\|\|null,group,sub\)/);
 assert.match(code,/data-trgd-inspect/);
 assert.match(code,/box\.open=true/);
 assert.match(code,/toggleGroup\(g\.dataset\.manager,g\.dataset\.trgdGroup\)/);
 assert.match(code,/toggleSubgroup\(sg\.dataset\.manager,sg\.dataset\.group,sg\.dataset\.trgdSubgroup\)/);
});
test('cache busting makes native group version visible after hard reload',()=>{
 assert.match(loader,/20261105-groups-single-121/);
 assert.match(index,/173-triovist-native-sections-v1\.js\?v=20261105-groups-single-1/);
 assert.match(index,/100-safe-upgrades-loader-v236272\.js\?v=20261105-groups-single-1/);
 assert.match(native,/if\(k==='groups'\)return false/);
});

test('director choosing a manager uses the existing scoped RPC and hides other manager cards',async()=>{
 const x=fixture();await x.api.open(x.host,x.ctx);
 const email=encodeURIComponent('krishtal_na@resanta.ru');
 x.click('[data-trgd-select-manager]',{trgdSelectManager:email});
 for(let i=0;i<12;i++)await Promise.resolve();
 const calls=x.rpcCalls.filter(v=>v.name==='triovist_group_dynamics_v1');
 assert.ok(calls.some(c=>c.args.p_manager_email==='krishtal_na@resanta.ru'));
 const summary=x.get('[data-trgd-managers]').innerHTML;
 assert.match(summary,/Кришталь/);
 assert.doesNotMatch(summary,/Александренко/);
});
