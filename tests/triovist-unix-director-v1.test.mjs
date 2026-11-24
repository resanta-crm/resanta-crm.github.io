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
function fixture(role='boss',failedSales=false,sales=liveSales){
 const calls=[],clicked=[],elements=new Map();
 const shell={classList:{keys:new Set(),add(k){this.keys.add(k)},contains(k){return this.keys.has(k)}},children:[],appendChild(x){this.children.push(x);elements.set(x.id,x);x.parentElement=this},
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
  if(name==='triovist_get_dashboard')return failedSales?{error:{message:'Нет подтверждения 1С'}}:{data:{...sales,end_month:args.p_end_month},error:null};
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
test('direct entry to a detail section has the shared shell styling without a sales request',()=>{
 const f=fixture();
 f.api.show(false);
 assert.equal(f.root().dataset.visible,'false');
 assert.equal(f.elements.get('tr14-shell').classList.contains('ux-director-shell'),true);
 assert.equal(f.elements.get('tr14-unix-back').dataset.visible,'true');
 assert.deepEqual(f.calls,[]);
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
test('manager overview never renders another manager revenue or plan',async()=>{
 const f=fixture('manager');
 assert.equal(await f.api.open(f.ctx),true);
 const page=f.root().innerHTML.replace(/\u00a0/g,' ');
 assert.match(page,/562 611,56/);
 assert.doesNotMatch(page,/235 863,98|Кришталь|138 000,00/);
});
test('director summary contains only three sales KPIs and manager sales with plan tooltips',async()=>{
 const f=fixture();assert.equal(await f.api.open(f.ctx),true);
 const out=f.root().innerHTML.replace(/\u00a0/g,' ');
 assert.match(out,/<h2 class="ux-brand">Триовист<\/h2>/);
 assert.equal([...out.matchAll(/class="ux-tile"/g)].length,3);
 for(const phrase of ['Товарные группы','Карточки 21vek','Конкуренты 21vek','Ключевые задачи','Финансовый итог','Заказы и остатки','Короткий ИИ-брифинг','Свежесть','Задачи ИИ'])assert.ok(!out.includes(phrase),phrase);
 assert.match(out,/role="tooltip">Факт 1С · импорт: 2026-11-03<\/span>/);
 assert.match(out,/role="tooltip">Выполнение 117,3%<\/span>/);
 assert.match(out,/Александренко<\/th><td><strong>562 611,56 BYN<\/strong>.*ux-execution">103,6%<\/strong>.*role="tooltip">План на месяц · 543 000,00 BYN<\/span>/);
 assert.match(out,/Кришталь<\/th><td><strong>235 863,98 BYN<\/strong>.*ux-execution">170,9%<\/strong>.*role="tooltip">План на месяц · 138 000,00 BYN<\/span>/);
 assert.match(f.elements.get('tr14-unix-css').textContent,/\.ux-help:is\(:hover,:focus-within\) \.ux-tooltip\{display:block\}/);
 assert.equal(f.root().dataset.visible,'true');
 assert.ok(f.elements.get('tr14-unix-back'));
});
test('sales details still dispatch the existing route',async()=>{
 const f=fixture();await f.api.open(f.ctx);
 f.root().listeners.click({target:{closest:selector=>selector==='[data-ux-sales]'?{}:null}});
 assert.equal(f.clicked.at(-1),'[data-tr14="sales"]');
 assert.doesNotMatch(unix,/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.storage\.from\(/);
});
test('current month keeps both comparison explanations in tooltips',async()=>{
 const f=fixture();await f.api.open(f.ctx);
 const p=f.root(),month=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Minsk',month:'2-digit',year:'numeric'}).formatToParts(new Date());
 const now=month.find(x=>x.type==='year').value+'-'+month.find(x=>x.type==='month').value;
 assert.match(p.innerHTML,new RegExp('data-ux-month max="'+now+'" value="'+now+'"'));
 assert.equal(f.calls.length,1);
 assert.match(p.innerHTML,/role="tooltip">Текущий месяц не завершён\./);
 assert.match(p.innerHTML,/role="tooltip">Месяц ещё не закрыт<\/span>/);
 assert.match(p.innerHTML,/<strong>Не считаем<\/strong>/);
 assert.equal(f.calls.at(-1).args.p_end_month,now);
 const old=new Date(Date.UTC(Number(now.slice(0,4)),Number(now.slice(5,7))-2,1)).toISOString().slice(0,7);
 p.listeners.change({target:{dataset:{uxMonth:''},value:old}});
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(f.calls.at(-1).args.p_end_month,old);
 assert.match(p.innerHTML,new RegExp('value="'+old+'"'));
});
test('failed authoritative sales query keeps empty state; no made-up KPI',async()=>{
 const f=fixture('boss',true);assert.equal(await f.api.open(f.ctx),false);
 assert.match(f.root().innerHTML,/Продажи 1С пока не подтверждены/);
 assert.doesNotMatch(f.root().innerHTML,/798 475|522 519/);
});
test('root selects new Home and hides legacy page, while detail paths and Commerce remain',()=>{
 assert.match(router,/if\(k==='home'&&window\.RESANTA_TRIOVIST_UNIX_DIRECTOR_V1\?\.open/);
 assert.match(router,/unixHealthy&&window\.RESANTA_TRIOVIST_UNIX_DIRECTOR_V1\?\.open/);
 for(const section of ["'anp','🧾 АНП'","'si','🛠 Компенсация СИ'","'budget','💼 Бюджет'","'parser','🌐 Парсер 21vek'","'competitors','⚔️ Конкуренты 21vek'"]){
  assert.ok(router.includes(section),section);
 }
 assert.match(unix,/\[data-tr14="infographics"\]\{display:none!important\}/);
 assert.match(router,/RESANTA_TRIOVIST_UNIX_DIRECTOR_V1\?\.show/);
});
test('script cache version, loading order and unchanged parser integration',()=>{
 assert.ok(index.includes('171-triovist-unix-director-v1.js?v=20261124-market-work1'));
 assert.ok(index.indexOf('171-triovist-unix-director-v1.js')<index.indexOf('34-triovist-root-v23614.js'));
 assert.ok(router.includes("RESANTA_TRIOVIST_21VEK_CONTROL_V236107?.refresh"));
 assert.ok(router.includes('RESANTA_TRIOVIST_COMPETITORS_V236218'));
});
 
test('new overview has an explicit fallback instead of hiding a broken workspace',async()=>{
 const f=fixture('manager',true);
 assert.equal(await f.api.open(f.ctx),false);
 assert.ok(router.includes("unixHealthy=ok===true"));
 assert.ok(router.includes("await work('home',token)"));
 assert.ok(router.includes("timeoutId=setTimeout"));
});
test('ordinary CRM employees are not subjected to Triovist authorization retry storms',()=>{
 assert.ok(router.includes('if(!local)return null;'));
 assert.ok(router.includes('nonTriovistProfileReady()'));
 assert.match(router,/if\(nonTriovistProfileReady\(\)\)\{finishBoot\(\);return\}/);
 assert.match(router,/function finishBoot\(\)\{\s*clearInterval\(t\)/);
});

test('Triovist navigation observer is scoped, initialization never overlaps and title stays clean',()=>{
 assert.match(router,/mo\.observe\(p,\{attributes:true,attributeFilter:\['class'\]\}\)/);
 assert.doesNotMatch(router,/mo\.observe\(document\.documentElement/);
 assert.match(router,/if\(bootPending\)return;/);
 assert.match(router,/finally\{bootPending=false\}/);
 assert.match(router,/<b>Триовист \(21vek\.by\)<\/b>/);
 assert.doesNotMatch(router,/Триовист \(21vek\.by\) · Uni X Director<\/b>/);
});
test('the summary shares a sales request and does not load data for the hidden panels',async()=>{
 const f=fixture();
 const [a,b]=await Promise.all([f.api.open(f.ctx),f.api.open(f.ctx)]);
 assert.equal(a,true);
 assert.equal(b,true);
 assert.deepEqual(f.calls.map(c=>c.name),['triovist_get_dashboard']);
});
test('an absent manager plan keeps sales visible and does not produce a percentage',async()=>{
 const f=fixture('boss',false,{...liveSales,period_plans:liveSales.period_plans.slice(0,1)});
 await f.api.open(f.ctx);
 const html=f.root().innerHTML;
 assert.match(html,/План на месяц не задан<\/span>/);
 assert.match(html,/Кришталь<\/th><td><strong>235[\s\u00a0]863,98 BYN<\/strong>.*ux-execution">—<\/strong>/);
 assert.match(html,/<strong>Не задан<\/strong>/);
});

test('rolled-back action center never loads outside the Triovist page',()=>{
 assert.doesNotMatch(index,/<script[^>]+172-triovist-action-center-v1\.js/);
 assert.doesNotMatch(router,/RESANTA_TRIOVIST_ACTION_CENTER_V1/);
 assert.doesNotMatch(unix,/RESANTA_TRIOVIST_ACTION_CENTER_V1/);
 assert.match(router,/shell\.style\.setProperty\('display',on\?'block':'none','important'\)/);
 assert.match(router,/if\(!on\)\{panel\.style\.setProperty\('display','none','important'\)/);
});
test('new seven-section module mounts only after native tab activation and is not a global overlay',()=>{
 assert.match(router,/window\.RESANTA_TRIOVIST_NATIVE_SECTIONS_V1\?\.mount\?\.\(k,ctx\)/);
 assert.ok(index.includes('173-triovist-native-sections-v1.js?v=20261105-motivation-director-1'));
 assert.match(router,/mo\.observe\(p,\{attributes:true,attributeFilter:\['class'\]\}\)/);
 assert.doesNotMatch(router,/mo\.observe\(document\.documentElement/);
});


test('Triovist Work and Commerce navigation is anchored above all page content',()=>{
 assert.match(router,/h\.insertBefore\(shell,h\.firstChild\)/);
 assert.doesNotMatch(router,/h\.insertBefore\(shell,p\)/);
 assert.match(router,/shell\.insertAdjacentElement\('afterend',panel\)/);
});

test('Navigation removes the duplicate card tab and restores a saved card route in the parser',()=>{
 assert.match(index,/34-triovist-root-v23614\.js\?v=20261124-commerce1/);
 for(const key of ['home','sales','groups','stock','tasks','motivation','parser','competitors','anp','si','budget']){
  assert.ok(router.includes("["+String.fromCharCode(39)+key+String.fromCharCode(39)+","),"Missing navigation key "+key);
 }
 assert.doesNotMatch(router,/\['cards','🧩 Карточки 21vek'\]/);
 assert.match(router,/function remembered\(\)\{[^\n]*if\(k==='cards'\)return'parser'/);
 assert.match(router,/async function activate\(k,save=false\)\{\s*if\(k==='cards'\)k='parser'/);
 assert.match(router,/shell\.onclick=e=>/);
 assert.match(router,/activate\(b\.dataset\.tr14,true\)/);
});

test('commerce retains three routes, and a stored price route falls back to the overview',()=>{
 assert.match(router,/COMM=\['anp','si','budget'\]/);
 assert.doesNotMatch(router,/Расчёт цены|triovist_price_search_v23612|data-tr14-zero/);
 const remembered=router.slice(router.indexOf('function remembered('),router.indexOf('function shellComplete('));
 const ctx={localStorage:{getItem:()=> 'price'},STORE:'route',ctx:{email:'fixture'},COMM:['anp','si','budget'],visibleWorkKeys:()=>['home','parser']};
 vm.runInNewContext(remembered+';globalThis.remembered=remembered;',ctx);
 assert.equal(ctx.remembered(),'home');
});

test('budget shows the balance and journal and keeps the live calculation, carryover and complete comment in help',async()=>{
 const panel={innerHTML:''};
 const data={month:'2026-11-01',is_leader:true,budget_exists:true,budget_is_carried:true,
  budget_anchor_amount:50000,budget_anchor_month:'2026-08-01',budget_opening_balance:70000,budget_month_accrual:10000,
  budget_expenses_month_total:30000,budget_expenses_previous_total:9000,budget_available_total:50000,budget_comment:'Первый абзац\nВторой <отчёт>',
  budget_expense_rows:[{id:'entry',expense_date:'2026-11-01',amount:100,description:'Запись журнала'}]};
 const start=router.indexOf('async function budget('),end=router.indexOf('async function saveExpense(',start);
 const ctx={panel,commerceRequest:0,navEpoch:1,active:'budget',monthInput:()=>'',getMonth:async()=>data,
  money:v=>v+' BYN',budgetDt:()=>'',esc:v=>String(v??'').replaceAll('<','&lt;').replaceAll('>','&gt;')};
 vm.runInNewContext(router.slice(start,end)+';globalThis.budget=budget;',ctx);
 await ctx.budget('2026-11');
 const main=panel.innerHTML.replace(/<aside[\s\S]*?<\/aside>/,'');
 const help=panel.innerHTML.match(/<aside[\s\S]*?<\/aside>/)?.[0];
 assert.match(main,/Доступный остаток/);
 assert.match(main,/Запись журнала/);
 assert.match(main,/data-tr14-budget-expense-save/);
 assert.doesNotMatch(main,/переносится автоматически|30000 BYN|Первый абзац/);
 assert.match(help,/70000 BYN перенесено \+ 10000 BYN начислено \(1,5%\) − 30000 BYN списано/);
 assert.match(help,/9000 BYN/);
 assert.match(help,/Первый абзац\nВторой &lt;отчёт&gt;/);
 assert.doesNotMatch(main,/data-tr14-budget-save/);
 data.budget_is_carried=false;
 data.budget_available_total=-500;
 await ctx.budget('2026-11');
 assert.match(panel.innerHTML,/Перерасход бюджета/);
 assert.match(panel.innerHTML,/<details class="tr14-commerce-card tr14-budget-base">/);
 assert.match(panel.innerHTML,/data-tr14-budget-save/);
});
