import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const mod=read('assets/168-triovist-summary-360-v1.js');
const base=read('assets/34-triovist-root-v23614.js');
const old=read('assets/03-triovist-routes.js');
const html=read('index.html');

function run(options={}){
 const month=options.month||'2026-11';
 const role=options.role||'boss',userEmail=options.email||(role==='manager'?'aleksandrenko_av@resanta.ru':'payushin_ar@resanta.ru');
 const page={id:'page-triovist',dataset:{triovistView:'home'},classList:{
  values:new Set(['active']),contains(k){return this.values.has(k)},add(k){this.values.add(k)},remove(k){this.values.delete(k)}
 },appendChild(el){children.set(el.id,el);el.parentElement=this},insertBefore(el){this.appendChild(el)}};
 const children=new Map();
 const before={id:'tri-kpis',parentElement:page};
 const forms={
  'tri-period-month':{value:month},'tri-period-mode':{value:'month'},
  'tri-manager-filter':{value:'all'},'tri-search':{value:''}
 };
 const document={readyState:'complete',head:{appendChild(el){children.set(el.id,el)}},getElementById(id){
  if(id==='page-triovist')return page;
  if(id==='tri-kpis')return before;
  return children.get(id)||forms[id]||null;
 },createElement(tag){return {tag,id:'',innerHTML:'',textContent:'',parentElement:null,
  setAttribute(){},addEventListener(){},style:{},dataset:{}}},querySelector(){return null},addEventListener(){}};
 const items=options.items||[
  {manager_name:'Александренко',manager_email:'aleksandrenko_av@resanta.ru',assigned_group:'Инструмент',current_revenue:8305.31,previous_revenue:235809.01},
  {manager_name:'Кришталь',manager_email:'krishtal_na@resanta.ru',assigned_group:'Климат',current_revenue:5366.76,previous_revenue:134711.03}
 ];
 const dashboard=options.dashboard||{end_month:month,period_plans:[],last_import:{imported_at:'2026-11-03T18:13:00+03:00'}};
 const w={
  currentProfile:{email:userEmail,role,access_scope:role==='manager'?'triovist':null},
  renderTriovist(){},
  TRIOVIST_RUNTIME_STATE_V227324:{snapshot:()=>({loaded:true,dashboard,salesItems:items})},
  db:{rpc:async(name,args)=>name==='triovist_get_dashboard'&&options.lastClosed?
   ({data:{end_month:args.p_end_month,items:options.lastClosed},error:null}):
   ({data:null,error:{message:'not mocked'}})}
 };
 const ctx={window:w,document,TODAY:'2026-11-04',currentProfile:w.currentProfile,Date,Promise,console};
 vm.runInNewContext(mod,ctx,{filename:'triovist-summary.js'});
 return {page,document,window:w,forms,root:children.get('tri-overview-360')};
}

test('overview renders complete dashboard with existing sales and actionable sections',async()=>{
 const env=run();
 assert.equal(await env.window.RESANTA_TRIOVIST_SUMMARY360_V1.open(),true);
 const content=env.root.innerHTML;
 for(const title of ['Сводка 360°','Продажи','План','Год к году','Короткий ИИ-брифинг','Свежесть источников','Менеджеры','Триовист','задачам ИИ'])assert.ok(content.includes(title),title);
 assert.ok(content.replace(/\u00a0/g,' ').includes('13 672,07'),'localized amount was not displayed');
 assert.ok(env.page.classList.contains('tri360-ready'));
});
test('partial November does not misrepresent 2025 full November as comparable YoY -96%',async()=>{
 const env=run();await env.window.RESANTA_TRIOVIST_SUMMARY360_V1.open();
 assert.match(env.root.innerHTML,/Месяц продолжается/);
 assert.match(env.root.innerHTML,/Закрытый|Загружаем/);
 assert.doesNotMatch(env.root.innerHTML,/-96[,.]3%/);
});
test('closed month can show exact YoY and a verified plan, never synthetic values',async()=>{
 const env=run({month:'2026-10',items:[{manager_name:'Александренко',manager_email:'aleksandrenko_av@resanta.ru',assigned_group:'Инструмент',current_revenue:150,previous_revenue:100}],
 dashboard:{end_month:'2026-10',period_plans:[{manager_email:'aleksandrenko_av@resanta.ru',plan_amount:300}],last_import:{imported_at:'2026-10-31'}}});
 await env.window.RESANTA_TRIOVIST_SUMMARY360_V1.open();
 assert.match(env.root.innerHTML,/\+50%/);
 assert.match(env.root.innerHTML,/300,00 BYN/);
 assert.doesNotMatch(env.root.innerHTML,/Месяц ещё не завершён/);
});
test('Triovist manager only sees own categories and not other manager groups',async()=>{
 const env=run({role:'manager'});await env.window.RESANTA_TRIOVIST_SUMMARY360_V1.open();
 assert.match(env.root.innerHTML,/Александренко/);
 assert.doesNotMatch(env.root.innerHTML,/Кришталь|Климат/);
});
test('missing plan is explicitly not assigned, never zero or fabricated',async()=>{
 const env=run();await env.window.RESANTA_TRIOVIST_SUMMARY360_V1.open();
 assert.match(env.root.innerHTML,/Не задан/);
 assert.match(env.root.innerHTML,/План задан не всем/);
});
test('fallback keeps old KPIs if runtime has no authenticated sales snapshot',async()=>{
 const env=run();env.window.TRIOVIST_RUNTIME_STATE_V227324.snapshot=()=>({loaded:false,salesItems:[]});
 assert.equal(await env.window.RESANTA_TRIOVIST_SUMMARY360_V1.open(),false);
 assert.equal(env.page.classList.contains('tri360-ready'),false);
});
test('existing Work and all four Commerce actions stay in original router',()=>{
 for(const token of ["'anp','🧾 АНП'","'si','🛠 Компенсация СИ'","'budget','💼 Бюджет'","'price','🧮 Расчёт цены'","'tasks','🤖 Задачи ИИ'"])
  assert.ok(base.includes(token),'missing '+token);
 assert.match(base,/home:\['triovist-warning','tri-period-mode','tri-kpis','tri-manager-cards','tri-overview-360'\]/);
 assert.match(base,/await window\.RESANTA_TRIOVIST_SUMMARY360_V1\?\.open/);
 assert.match(old,/dashboard:triDashboard\?/);
 assert.match(html,/168-triovist-summary-360-v1\.js\?v=20261104-3/);
});
test('read-only summary never submits tasks, changes plans or budgets',()=>{
 assert.doesNotMatch(mod,/\.insert\(|\.upsert\(|\.update\(|\.delete\(|\.from\(/);
 assert.doesNotMatch(mod,/triovist_set_plan|triovist_commercial_set_budget|triovist_tasks_action/);
 assert.match(mod,/data-tri360="section" data-value="tasks"/);
});

test('real last closed month is compared to same month one year earlier; November is not',async()=>{
 const e=run({lastClosed:[
  {manager_name:'Александренко',manager_email:'aleksandrenko_av@resanta.ru',assigned_group:'Инструмент',current_revenue:500000,previous_revenue:300000},
  {manager_name:'Кришталь',manager_email:'krishtal_na@resanta.ru',assigned_group:'Климат',current_revenue:298475.54,previous_revenue:222519.67}
 ]});
 await e.window.RESANTA_TRIOVIST_SUMMARY360_V1.open();
 await new Promise(done=>setTimeout(done,0));
 const result=e.root.innerHTML.replace(/\u00a0/g,' ');
 assert.match(result,/798 475,54 BYN/);
 assert.match(result,/522 519,67 BYN/);
 assert.match(result,/\+52,8%/);
 assert.match(result,/Факт ноябрь 2026 г\./);
 assert.doesNotMatch(result,/Не рассчитываем|370 520,04 BYN|Прошлый период/);
 const graph=result.slice(result.indexOf('Продажи по группам'),result.indexOf('Короткий ИИ-брифинг'));
 assert.doesNotMatch(graph,/t360-track prior/);
});
test('last closed month follows manager scope and does not reveal another manager numbers',async()=>{
 const e=run({role:'manager',lastClosed:[
  {manager_name:'Александренко',manager_email:'aleksandrenko_av@resanta.ru',current_revenue:500000,previous_revenue:300000},
  {manager_name:'Кришталь',manager_email:'krishtal_na@resanta.ru',current_revenue:298475.54,previous_revenue:222519.67}
 ]});
 await e.window.RESANTA_TRIOVIST_SUMMARY360_V1.open();
 await new Promise(done=>setTimeout(done,0));
 const result=e.root.innerHTML.replace(/\u00a0/g,' ');
 assert.match(result,/500 000,00 BYN/);
 assert.match(result,/300 000,00 BYN/);
 assert.doesNotMatch(result,/298 475,54 BYN|522 519,67 BYN/);
});
