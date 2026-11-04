import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const unix=read('assets/171-triovist-unix-director-v1.js');
const router=read('assets/34-triovist-root-v23614.js');
const index=read('index.html');
const liveSales={
 end_month:'2026-10',last_import:{imported_at:'2026-11-03T18:13:00+03:00'},
 items:[
  {manager_email:'aleksandrenko_av@resanta.ru',manager_name:'Александренко',assigned_group:'Инструмент',current_revenue:562611.56,previous_revenue:415000},
  {manager_email:'krishtal_na@resanta.ru',manager_name:'Кришталь',assigned_group:'Садовая техника',current_revenue:235863.98,previous_revenue:107519.67}
 ],
 period_plans:[{manager_email:'aleksandrenko_av@resanta.ru',plan_amount:543000},{manager_email:'krishtal_na@resanta.ru',plan_amount:138000}]
};
function fixture(role='boss',failedSales=false){
 const calls=[],clicked=[],elements=new Map();
 const shell={classList:{add(){}},children:[],appendChild(x){this.children.push(x);elements.set(x.id,x);x.parentElement=this},
  insertBefore(x,ref){this.children.splice(Math.max(0,this.children.indexOf(ref)),0,x);elements.set(x.id,x);x.parentElement=this},
  querySelector(s){return {click(){clicked.push(s)}}}};
 const page={classList:{contains(x){return x==='active'}}};
 elements.set('tr14-shell',shell);elements.set('page-triovist',page);
 const document={head:{appendChild(x){elements.set(x.id,x)}},getElementById:k=>elements.get(k)||null,
  createElement(tag){return {tagName:tag,id:'',dataset:{},innerHTML:'',style:{},listeners:{},
   setAttribute(k,v){this[k]=v},addEventListener(k,fn){this.listeners[k]=fn},contains(){return true}}}};
 const w={};
 const d={rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='triovist_get_dashboard')return failedSales?{error:{message:'Нет подтверждения 1С'}}:{data:{...liveSales,end_month:args.p_end_month},error:null};
  if(name==='triovist_tasks_get_dashboard_month_v23648')return {data:{tasks:[
   {title:'Проверить карточки',manager_email:'aleksandrenko_av@resanta.ru',status:'in_progress',due_date:'2026-11-07'},
   {title:'Заказать садовую технику',manager_email:'krishtal_na@resanta.ru',status:'pending_approval',due_date:'2026-11-08'}
  ]},error:null};
  if(name==='triovist_partner_stock_state_v236207')return {data:{snapshot_date:'2026-10-13'},error:null};
  if(name==='triovist_21vek_status_v236107')return {data:{working:{completed_at:'2026-11-03T14:05:00+03:00'}},error:null};
  throw new Error('unexpected request '+name);
 }};
 const ctx={is_leader:role==='boss',is_manager:role==='manager',email:role==='boss'?'payushin_ar@resanta.ru':'aleksandrenko_av@resanta.ru'};
 vm.runInNewContext(unix,{window:w,document,db:d,console,Date,Intl,Promise,setTimeout});
 return {api:w.RESANTA_TRIOVIST_UNIX_DIRECTOR_V1,ctx,calls,clicked,elements,root:()=>elements.get('tr14-unix-home')};
}
test('Uni X script and original router are JavaScript syntax-valid',()=>{
 assert.doesNotThrow(()=>new vm.Script(unix));
 assert.doesNotThrow(()=>new vm.Script(router));
});
test('main dashboard computes only source-backed October sales and previous year',()=>{
 const {api}=fixture();
 const m=api.compute(liveSales,{is_leader:true});
 assert.equal(m.current,798475.54);
 assert.equal(m.previous,522519.67);
 assert.ok(m.yoy>52&&m.yoy<53);
 assert.equal(m.plan,681000);
 assert.equal(m.groups.length,2);
});
test('manager overview never renders another manager revenue or tasks',async()=>{
 const f=fixture('manager');
 assert.equal(await f.api.open(f.ctx),true);
 const page=f.root().innerHTML.replace(/\u00a0/g,' ');
 assert.match(page,/562 611,56/);
 assert.doesNotMatch(page,/235 863,98|Заказать садовую технику|Кришталь/);
 const args=f.calls.find(c=>c.name==='triovist_tasks_get_dashboard_month_v23648').args;
 assert.equal(args.p_manager_email,'aleksandrenko_av@resanta.ru');
});
test('director receives one unified screen with KPIs, chart, cards, risks and controls',async()=>{
 const f=fixture();assert.equal(await f.api.open(f.ctx),true);
 const out=f.root().innerHTML;
 for(const phrase of ['Сводка 360°','Продажи','Товарные группы','Карточки 21vek','Конкуренты 21vek','Ключевые задачи','Финансовый итог','Заказы и остатки','Короткий ИИ-брифинг'])assert.ok(out.includes(phrase),phrase);
 assert.equal(f.root().dataset.visible,'true');
 assert.ok(f.elements.get('tr14-unix-back'));
});
test('drill-down dispatches existing links, never reimplements write handlers',async()=>{
 const f=fixture();await f.api.open(f.ctx);
 const el=f.root();const click=el.listeners.click;
 for(const area of ['sales','groups','stock','tasks','cards','competitors','motivation','anp','si','budget','price']){
  click({target:{closest:()=>({dataset:{uxGo:area}})}});
  assert.ok(f.clicked.at(-1).includes('data-tr14="'+area+'"'),area);
 }
 assert.doesNotMatch(unix,/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.storage\.from\(/);
});
test('open current month never draws previous complete month as comparable bars',async()=>{
 const f=fixture();await f.api.open(f.ctx);
 const p=f.root(),month=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Minsk',month:'2-digit',year:'numeric'}).formatToParts(new Date());
 const now=month.find(x=>x.type==='year').value+'-'+month.find(x=>x.type==='month').value;
 p.listeners.change({target:{dataset:{uxMonth:''},value:now}});
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.match(p.innerHTML,/Текущий месяц не завершён/);
 assert.doesNotMatch(p.innerHTML,/ux-track prev/);
});
test('failed authoritative sales query keeps empty state; no made-up KPI',async()=>{
 const f=fixture('boss',true);assert.equal(await f.api.open(f.ctx),false);
 assert.match(f.root().innerHTML,/Продажи 1С пока не подтверждены/);
 assert.doesNotMatch(f.root().innerHTML,/798 475|522 519/);
});
test('root selects new Home and hides legacy page, while detail paths and Commerce remain',()=>{
 assert.match(router,/if\(k==='home'&&window\.RESANTA_TRIOVIST_UNIX_DIRECTOR_V1\?\.open/);
 assert.match(router,/p\.style\.setProperty\('display','none','important'\);panel\.style\.setProperty\('display','none','important'\);window\.RESANTA_TRIOVIST_UNIX_DIRECTOR_V1\.show\(true\)/);
 for(const section of ["'anp','🧾 АНП'","'si','🛠 Компенсация СИ'","'budget','💼 Бюджет'","'price','🧮 Расчёт цены'","'parser','🌐 Парсер 21vek'","'competitors','⚔️ Конкуренты 21vek'"]){
  assert.ok(router.includes(section),section);
 }
 assert.match(unix,/\[data-tr14="infographics"\]\{display:none!important\}/);
 assert.match(router,/RESANTA_TRIOVIST_UNIX_DIRECTOR_V1\?\.show/);
});
test('script cache version, loading order and unchanged parser integration',()=>{
 assert.ok(index.includes('171-triovist-unix-director-v1.js?v=20261104-unix1'));
 assert.ok(index.indexOf('171-triovist-unix-director-v1.js')<index.indexOf('34-triovist-root-v23614.js?v=20261104-unix1'));
 assert.ok(router.includes("RESANTA_TRIOVIST_21VEK_CONTROL_V236107?.refresh"));
 assert.ok(router.includes('RESANTA_TRIOVIST_COMPETITORS_V236218'));
});
