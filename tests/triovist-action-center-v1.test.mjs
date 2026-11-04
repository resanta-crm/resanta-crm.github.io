import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const script=read('assets/172-triovist-action-center-v1.js');
const router=read('assets/34-triovist-root-v23614.js');
const motivation=read('assets/104-safe-triovist-v236200.js');
const index=read('index.html');
function fixture(role='manager'){
 const nodes=new Map(),calls=[];
 const parent={children:[],insertBefore(node,ref){
  this.children=this.children.filter(x=>x!==node);
  const i=this.children.indexOf(ref);this.children.splice(i<0?this.children.length:i,0,node);
  node.parentElement=this;nodes.set(node.id,node);
 }};
 function el(id=''){
  return {id,parentElement:null,dataset:{},innerHTML:'',textContent:'',listeners:{},style:{setProperty(){}},classList:{contains(x){return x==='active'}},
   setAttribute(){},addEventListener(type,f){this.listeners[type]=f},contains(){return true},
   insertAdjacentElement(where,child){assert.equal(where,'afterend');const p=this.parentElement;const idx=p.children.indexOf(this);p.children=p.children.filter(x=>x!==child);p.children.splice(idx+1,0,child);child.parentElement=p;nodes.set(child.id,child)},
   get previousElementSibling(){const p=this.parentElement;if(!p)return null;return p.children[p.children.indexOf(this)-1]||null}
  };
 }
 const shell=el('tr14-shell'),page=el('page-triovist');parent.insertBefore(shell,null);parent.insertBefore(page,null);
 const document={head:{appendChild(x){nodes.set(x.id,x)}},getElementById:id=>nodes.get(id)||null,
  createElement:()=>el(),querySelector:()=>({click(){}})};
 const profiles={email:'aleksandrenko_av@resanta.ru',is_manager:true,is_leader:false};
 const w={RESANTA_TRIOVIST_UNIX_DIRECTOR_V1:{
  readOnlySnapshot:()=>({month:'2026-10',sales:{items:[
   {manager_email:'aleksandrenko_av@resanta.ru',assigned_group:'Инструмент',current_revenue:80,previous_revenue:180},
   {manager_email:'krishtal_na@resanta.ru',assigned_group:'Садовая техника',current_revenue:3000,previous_revenue:100}],
   period_plans:[]},tasks:{tasks:[
   {manager_email:'aleksandrenko_av@resanta.ru',status:'overdue',title:'Проверить инструмент',priority_score:7},
   {manager_email:'krishtal_na@resanta.ru',status:'in_progress',title:'Секретная задача Кришталь'}]},
   stock:{snapshot_date:'2026-10-01'},parser:{last_good:{completed_at:'2026-10-02'}}}),
  compute(data,ctx){const rows=data.items.filter(x=>!ctx.is_manager||x.manager_email===ctx.email);
   return {current:rows.reduce((n,x)=>n+x.current_revenue,0),
   groups:rows.map(x=>({name:x.assigned_group,manager:x.manager_email,cur:x.current_revenue,prev:x.previous_revenue}))}}
 },RESANTA_TRIOVIST_GROUP_DYNAMICS_V236120:{readOnlySnapshot:()=>({from:'2026-10',to:'2026-10',groups:[]})},
 RESANTA_TRIOVIST_TASK_MONTH_SAFE_V23651:{readOnlySnapshot:()=>({month:'2026-11',pack:{dash:{tasks:[]}}})},
 RESANTA_TRIOVIST_COMPETITORS_V236218:{readOnlySummary:()=>({summary:{confirmed_gaps:4,competitor_stronger:12}})},
 TRIOVIST_DATA_HUB_V227315:{content:async()=>({issues:[
   {manager_email:'aleksandrenko_av@resanta.ru',sku:'A-01',severity:'critical',status:'open',issue_title:'Нет фото'},
   {manager_email:'aleksandrenko_av@resanta.ru',sku:'A-01',severity:'critical',status:'open',issue_title:'Нет описания'},
   {manager_email:'krishtal_na@resanta.ru',sku:'K-SECRET',severity:'critical',status:'open',issue_title:'Секрет'}
  ],managers:[]})}};
 const db={rpc:async(name,args)=>{calls.push({name,args});
  if(name==='triovist_own_listing_positions_v236351')return {data:{summary:{total:12},rows:[
   {manager_email:'aleksandrenko_av@resanta.ru',sku:'A-01',movement:'down',current_label:'#50',previous_label:'#30'},
   {manager_email:'krishtal_na@resanta.ru',sku:'K-SECRET',movement:'down',current_label:'#100',previous_label:'#10'}
  ]}};
  throw Error('Unexpected RPC '+name);
 }};
 const ctx=role==='manager'?profiles:role==='leader'?{email:'payushin_ar@resanta.ru',is_manager:false,is_leader:true}:null;
 vm.runInNewContext(script,{window:w,document,db,console,Date,Intl,Promise,setTimeout});
 return {api:w.RESANTA_TRIOVIST_ACTION_CENTER_V1,ctx,calls,shell,document,nodes,root:()=>nodes.get('tr14-action-center')};
}
const flush=()=>new Promise(r=>setTimeout(r,5));
test('all modified action-center and routing modules are JS syntax-valid',()=>{
 for(const file of ['assets/172-triovist-action-center-v1.js','assets/104-safe-triovist-v236200.js','assets/34-triovist-root-v23614.js','assets/171-triovist-unix-director-v1.js','assets/82-triovist-group-dynamics-v236120.js','assets/61-triovist-task-month-safe-v23651.js','assets/106-triovist-competitors-v236218.js'])assert.doesNotThrow(()=>new vm.Script(read(file)),file);
});
test('manager home prioritizes own problems and cannot see another manager',async()=>{
 const f=fixture();f.api.show('home',f.ctx);await flush();
 const html=f.root().innerHTML;
 assert.match(html,/Проверить инструмент/);
 assert.match(html,/Инструмент/);
 assert.match(html,/Листинг A-01/);
 assert.doesNotMatch(html,/Секретная задача|K-SECRET|Садовая техника/);
 assert.equal(f.calls.filter(x=>x.name==='triovist_own_listing_positions_v236351').length,1);
 assert.equal(f.calls[0].args.p_manager_email,'aleksandrenko_av@resanta.ru');
});
test('authorized manager sees only own issues grouped by SKU, without writes',async()=>{
 const f=fixture();f.api.show('cards',f.ctx);await flush();
 const html=f.root().innerHTML;
 assert.match(html,/A-01/);
 assert.match(html,/2 критических, 2 открытых/);
 assert.doesNotMatch(html,/K-SECRET/);
 assert.equal(f.calls.length,0,'cards reuse existing shared content hub');
 assert.doesNotMatch(script,/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.functions\.invoke\(/);
});
test('tasks page does not mistake October cached tasks for November tasks',async()=>{
 const f=fixture();f.api.show('tasks',f.ctx);await flush();
 assert.match(f.root().innerHTML,/Задачи месяца/);
 assert.doesNotMatch(f.root().innerHTML,/Проверить инструмент/);
});
test('missing access never draws a briefing and never contacts Supabase',async()=>{
 const f=fixture('none');f.api.show('home',null);await flush();
 assert.equal(f.root().dataset.open,'false');
 assert.equal(f.calls.length,0);
});
test('menu remains above motivation and action-center slot in one parent',async()=>{
 const f=fixture();f.api.show('home',f.ctx);await flush();
 const c=f.root();assert.equal(f.shell.parentElement.children.indexOf(c),1);
 assert.match(motivation,/if\(h\.previousElementSibling!==shell\)shell\.insertAdjacentElement/);
 assert.match(router,/RESANTA_TRIOVIST_ACTION_CENTER_V1\?\.show/);
 assert.match(script,/data-tr14="sales"/,'Sales route is hidden visually but retained for drill-down');
});
test('only action-center-specific scripts updated; parsers and database stay unchanged',()=>{
 assert.match(index,/172-triovist-action-center-v1\.js\?v=20261104-action-center-1/);
 assert.match(index,/34-triovist-root-v23614\.js\?v=20261104-action-center-406/);
 assert.match(index,/171-triovist-unix-director-v1\.js\?v=20261104-action-center-5/);
 assert.doesNotMatch(script,/setInterval|MutationObserver|service_role/);
});
