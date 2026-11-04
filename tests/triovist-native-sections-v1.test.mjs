import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=x=>fs.readFileSync(new URL('../'+x,import.meta.url),'utf8');
const script=read('assets/173-triovist-native-sections-v1.js');
const router=read('assets/34-triovist-root-v23614.js');
const groups=read('assets/82-triovist-group-dynamics-v236120.js');
const motivation=read('assets/104-safe-triovist-v236200.js');
const index=read('index.html');
const lazy=read('assets/100-safe-upgrades-loader-v236272.js');

function fixture(tab='groups',on=true,rogue=false){
 let active=tab,mounted=null,lastClick=null;
 const elements=new Map(),creations=[],log=[];
 function cls(){const flags=new Set();return {add:v=>flags.add(v),remove:v=>flags.delete(v),contains:v=>flags.has(v),toggle(v,force){if(force===undefined?flags.has(v):!force){flags.delete(v);return false}flags.add(v);return true}}}
 const page={isConnected:true,classList:{contains:k=>k==='active'&&on},contains:node=>node?.scope==='page'};
 const pane={isConnected:true,classList:cls(),contains:node=>node===pane||node?.scope==='panel'};
 const shell={isConnected:true,parentElement:{contains:node=>node?.scope==='motivation'}};
 function item(scope){
  const native={scope,isConnected:true,classList:cls(),firstChild:null,box:null,children:[],textContent:'',
   insertBefore(el){this.box=el;this.children.unshift(el);el.parent=this;mounted=scope;},
   querySelector(q){if(q===':scope > .tx7')return this.box;if(q==='[data-trgd-kpis]')return {name:'kpis'};return null},
   querySelectorAll(){return []},contains:node=>node?.scope===scope};
  return native;
 }
 const roots={groups:item('panel'),stock:item('page'),tasks:item('page'),motivation:item('motivation'),
 cards:item('page'),parser:item('page'),competitors:pane};
 pane.querySelector=q=>q===':scope > .tx7'?pane.box:null;
 pane.insertBefore=el=>{pane.box=el;mounted='panel';el.parent=pane};
 pane.firstChild=null;
 const selectors={'#tr14-panel .trgd':roots.groups,'#tri-stock-card':roots.stock,'#tri-task-card':roots.tasks,
 '#tri-mot-compare-v236200':roots.motivation,'#tri21-card':roots.cards,'#tri21-control-v236107':roots.parser,'#tr14-panel':roots.competitors};
 const document={
  getElementById:id=>({'page-triovist':page,'tr14-panel':pane,'tr14-shell':shell}[id]||elements.get(id)||null),
  querySelector:q=>q==='#tr14-shell [data-tr14].on'?{dataset:{tr14:active}}:selectors[q]||null,
  createElement(tag){
   const el={tag,id:'',className:'',isConnected:true,attributes:{},innerHTML:'',listeners:{},
    setAttribute(k,v){this.attributes[k]=v},
    addEventListener(k,fn){this.listeners[k]=fn},
    querySelector(q){if(q==='[data-tx7-toggle]')return this.btn||null;return null}};
   creations.push(el);return el;
  },
  head:{appendChild(el){elements.set(el.id,el)}}
 };
 const ctx={email:'aleksandrenko_av@resanta.ru',is_manager:true,is_leader:false};
 const data=[
  {manager_email:ctx.email,manager_name:'Александренко',group:'Климат',current_revenue:500,basis_revenue:550,compare_revenue:1000,delta_revenue:-450},
  {manager_email:'krishtal_na@resanta.ru',manager_name:'Кришталь',group:'Секретная группа',current_revenue:90000,basis_revenue:90000,compare_revenue:1,delta_revenue:89999}
 ];
 const window={currentProfile:{email:ctx.email},
  RESANTA_TRIOVIST_GROUP_DYNAMICS_V236120:{readOnlySnapshot:()=>({groups:data,projection:{active:true}})}};
 vm.runInNewContext(script,{window,document,Date,Intl,Number,console});
 const api=window.RESANTA_TRIOVIST_NATIVE_SECTIONS_V1;
 return {api,ctx,roots,window,document,page,creations,log,select:k=>active=k,turnOff:()=>on=false,where:()=>mounted};
}

test('seven native sections exist, script is valid and has no polling, fetch or mutations',()=>{
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.deepEqual([...fixture().api.sections],['groups','stock','tasks','motivation','cards','parser','competitors']);
 assert.doesNotMatch(script,/(?:setInterval|MutationObserver|\.rpc\(|\.insert\(|\.upsert\(|\.update\(|\.delete\(|fetch\()/);
 assert.match(script,/noDatabaseWrites:true,noParserRuns:true,noPolling:true/);
});
test('groups show only manager-owned data and label forecast separately from fact',()=>{
 const f=fixture('groups');
 assert.equal(f.api.mount('groups',f.ctx),true);
 const html=f.roots.groups.box.innerHTML;
 assert.match(html,/Александренко/);
 assert.match(html,/Климат/);
 assert.match(html,/500,00 BYN/);
 assert.match(html,/Прогноз, не факт/);
 assert.doesNotMatch(html,/Кришталь|Секретная группа|90 000,00|89 999/);
 assert.equal(f.where(),'panel');
 assert.equal(f.roots.groups.classList.contains('tx7-hide-groups'),true);
});
test('other six briefings mount ONLY inside their active native containers',()=>{
 for(const tab of ['stock','tasks','motivation','cards','parser','competitors']){
  const f=fixture(tab);
  assert.equal(f.api.mount(tab,f.ctx),true,tab);
  assert.ok(f.roots[tab].box?.innerHTML.includes('Краткий брифинг'),tab);
  assert.notEqual(f.roots[tab].box?.parent,f.document.getElementById('main-content'),tab);
 }
});
test('inactive Triovist never mounts anywhere, regardless of selected nav tab',()=>{
 for(const tab of ['groups','stock','tasks','motivation','cards','parser','competitors']){
  const f=fixture(tab,false);
  assert.equal(f.api.mount(tab,f.ctx),false,tab);
  assert.equal(f.creations.length,0,tab);
 }
});
test('normal CRM user and missing actor cannot access any new Triovist surface',()=>{
 const f=fixture('stock');
 assert.equal(f.api.mount('stock',{email:'mpp@resanta.ru',is_manager:false,is_leader:false}),false);
 assert.equal(f.api.mount('stock',null),false);
 assert.equal(f.creations.length,0);
});
test('cross-section calls never mount: selected tab must match exact requested key',()=>{
 const f=fixture('groups');
 assert.equal(f.api.mount('stock',f.ctx),false);
 assert.equal(f.api.mount('competitors',f.ctx),false);
 assert.equal(f.creations.length,0);
});
test('stale identity cannot refresh native surface after profile switch',()=>{
 const f=fixture('groups');assert.equal(f.api.mount('groups',f.ctx),true);
 f.window.currentProfile.email='krishtal_na@resanta.ru';
 assert.equal(f.api.refresh('groups'),false);
});
test('router contains only active native-section mount after successful navigation',()=>{
 assert.match(router,/if\(page\(\)\?\.classList\.contains\('active'\)\)window\.RESANTA_TRIOVIST_NATIVE_SECTIONS_V1\?\.mount\?\.\(k,ctx\)/);
 assert.match(router,/if\(token!==navEpoch\|\|active!==k\)return;/);
 assert.match(router,/function sync\(\)/);
 assert.doesNotMatch(router,/RESANTA_TRIOVIST_ACTION_CENTER_V1/);
 assert.doesNotMatch(index,/<script[^>]+172-triovist-action-center-v1\.js/);
});
test('UI does not expose developer jargon and existing parser/business handlers are preserved',()=>{
 assert.doesNotMatch(script,/\bUI\/UX\b|Uni X Director/);
 for(const x of ['anp','si','budget','price'])assert.match(router,new RegExp("'"+x+"'"));
 assert.match(index,/173-triovist-native-sections-v1\.js\?v=20261104-seven-tabs-1/);
 assert.match(lazy,/20261104-native7-1/);
 assert.match(groups,/readOnlySnapshot/);
 assert.match(motivation,/RESANTA_TRIOVIST_NATIVE_SECTIONS_V1\?\.refresh/);
});

test('Sales duplicate is hidden visually but retained as a working detail route',()=>{
 assert.match(router,/#tr14-shell \[data-tr14=\\?"sales\\?"\]\{display:none!important\}/);
 assert.ok(router.includes("['sales','💰 Продажи']"));
 assert.match(router,/const WORK=\[\'home\',\'sales\'/);
});
