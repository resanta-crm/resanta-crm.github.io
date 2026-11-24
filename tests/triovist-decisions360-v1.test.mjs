import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const get=(path)=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const task=get('assets/61-triovist-task-month-safe-v23651.js');
const taskUi=get('assets/169-triovist-tasks360-ux-v1.js');
const shares=get('assets/182-triovist-shares360-v1.js');
const index=get('index.html');
const sqlTask=get('supabase/migrations/20261109_triovist_decisions360_task_facts_v1.sql');
const sqlShares=get('supabase/migrations/20261109_triovist_decisions360_category_evidence_v1.sql');
test('existing modules parse without source syntax errors',()=>{
 for(const script of [task,taskUi,shares])assert.doesNotThrow(()=>new vm.Script(script));
});
test('subgroup task output displays live 1C shipment fact, source and independent listing check',()=>{
 assert.match(task,/triovist_decisions360_task_facts_v1/);
 assert.match(task,/live\.fact_by_task/);
 assert.match(task,/live\?\.matched_lines/);
 assert.match(task,/fact_status/);
 assert.match(task,/факты нескольких задач не суммировать|Факты нескольких задач не суммировать|Факты нескольких задач не суммировать|Факты нескольких задач не суммировать/i);
 assert.match(task,/листинг требует проверки/i);
});
test('sale matching is strict on subgroup, brand, manager and month; does not alter existing 1C records',()=>{
 assert.match(sqlTask,/uni-brainstorm-subgroup-v2/);
 assert.match(sqlTask,/triovist_sales_override/);
 assert.match(sqlTask,/public\.triovist_norm\(o\.subgroup\)=public\.triovist_norm\(t\.subgroup\)/);
 assert.match(sqlTask,/expected_brand/);
 assert.match(sqlTask,/lower\(coalesce\(o\.product,''\)\)/);
 assert.match(sqlTask,/o\.month=v_month/);
 assert.match(sqlTask,/v_filter:=a\.actor_email/);
 assert.doesNotMatch(sqlTask,/\bUPDATE\s+public\.triovist_ai_tasks\b|\bUPDATE\s+public\.triovist_sales_override\b|\bDELETE\s+FROM\b/i);
});
test('task screen retains scoped data without repeating the payroll view',()=>{
 assert.match(task,/readOnlySnapshot/);
 assert.doesNotMatch(taskUi,/Мотивация по задачам|task_kpi_rate/);
 const bonuses=get('assets/175-triovist-motivation-director-v1.js');
 assert.match(bonuses,/row\.task_rate/);
 assert.match(bonuses,/Ход работы по задачам/);
});
test('historical share evidence remains separate from the streamlined report',()=>{
 assert.match(shares,/2026.*без НДС/);
 assert.match(shares,/role="tooltip"/);
 assert.doesNotMatch(shares,/Модель \+1 п\. п\.|Цель квартала|Утренний брифинг|ТОП возможностей|План \/ факт доли|Категории под контролем|save-goal/);
 assert.match(sqlShares,/baseline_months',9/);
 assert.match(sqlShares,/one_pp_usd_9m/);
 assert.match(sqlShares,/goal_requires_review/);
 assert.match(sqlShares,/volume_status','нет подтвержденного оборота по SKU'/);
});
test('manager only provides a commercial recommendation, all repeatable evidence is loaded from CRM',()=>{
 const form=shares.slice(shares.indexOf('function managerForm(t,ans){'),shares.indexOf('function categoryDetail(rows){'));
 assert.match(form,/data-answer="recommendation"/);
 assert.match(form,/data-answer="subgroup"/);
 assert.doesNotMatch(form,/data-answer="competitor_evidence"/);
 assert.match(shares,/Object\.assign\(ans,automaticAnswer\(t\.category\)\)/);
 assert.match(shares,/triovist_decisions360_category_evidence_v1/);
});
test('share SKU data includes original price age, Chekhov, partner free stock and exact listing',()=>{
 for(const token of ['triovist_price_items','triovist_chekhov_stock','triovist_partner_stock','triovist_21vek_top_current',
  'triovist_market_comp_position_current_v236352', "interval '72 hours'"])assert.ok(sqlShares.includes(token),token);
 assert.match(sqlShares,/not_verified_for_category/);
 assert.match(shares,/Своб\. 21vek|своб\. 21vek/);
});
test('both source functions authorize managers by role and category and grant no anonymous access',()=>{
 for(const sql of [sqlTask,sqlShares]){
  assert.match(sql,/SECURITY DEFINER/);
  assert.match(sql,/REVOKE ALL ON FUNCTION/);
  assert.match(sql,/TO authenticated/);
  assert.match(sql,/actor_email/);
  assert.doesNotMatch(sql,/\bTRUNCATE\b|\bDROP TABLE\b/);
 }
 assert.match(sqlShares,/a\.actor_email=lower\(coalesce\(v_owner,''\)\)|v_actor\.actor_email=lower\(coalesce\(v_owner,''\)\)/);
});
test('existing CRM startup and other module scripts remain unchanged',()=>{
 assert.match(index,/61-triovist-task-month-safe-v23651\.js\?v=20261123-task-focus1/);
 assert.match(index,/169-triovist-tasks360-ux-v1\.js\?v=20261123-task-focus1/);
 assert.match(index,/182-triovist-shares360-v1\.js\?v=20261123-shares-card2/);
 assert.match(index,/const APP_VERSION = '2026-11-13-lera-approved-rollout-v4-lpr-birthdays-20261114-v2-connect-v2'/);
});

test('the shares report switches both chart and KPIs between uploaded snapshots', async()=>{
 const datasets={
  triovist_share_categories_v1:[
   {period_end:'2026-09-30',category:'Насосы',market_usd:1000,source_label:'21vek · 9 месяцев 2026 · USD без НДС'},
   {period_end:'2026-10-31',category:'Насосы',market_usd:2000,source_label:'Октябрь 2026'},
   {period_end:'2026-10-31',category:'Инструмент',market_usd:1000,source_label:'Октябрь 2026'}
  ],
  triovist_share_brands_v1:[
   {period_end:'2026-09-30',category:'Насосы',brand:'Ресанта',revenue_usd:100},
   {period_end:'2026-10-31',category:'Насосы',brand:'Ресанта',revenue_usd:400},
   {period_end:'2026-10-31',category:'Насосы',brand:'Huter',revenue_usd:200},
   ...Array.from({length:510},(_,i)=>({period_end:'2026-10-31',category:'Инструмент',brand:'brand'+i,revenue_usd:1})),
   {period_end:'2026-10-31',category:'Инструмент',brand:'Ресанта',revenue_usd:100}
  ],
  triovist_share_assignments_v1:[
   {category:'Инструмент',manager_email:'aleksandrenko_av@resanta.ru'},
   {category:'Насосы',manager_email:'krishtal_na@resanta.ru'}
  ],
  triovist_share_tasks_v1:[
   {id:'research-1',category:'Инструмент',title:'Исследовать категорию Инструмент',status:'research'}
  ],triovist_share_answers_v1:[]
 };
 const requests=[],events={};
 const root={innerHTML:'',addEventListener(type,fn){events[type]=fn},querySelector(){return null},contains(){return true}};
 let mounted=false;
 const host={querySelector:()=>mounted?root:null,replaceChildren(){mounted=true}};
 const document={getElementById:()=>null,head:{appendChild(){}},createElement:tag=>tag==='div'?root:{}};
 const window={db:{rpc:async()=>({data:{}}),from(table){
  let rows=[...datasets[table]];
  const query={
   select(){return query},
   eq(key,value){rows=rows.filter(x=>x[key]===value);requests.push([table,key,value]);return query},
   order(key,{ascending=true}={}){rows.sort((a,b)=>String(a[key]).localeCompare(String(b[key]))*(ascending?1:-1));return query},
   range(from,to){return Promise.resolve({data:rows.slice(from,to+1)})},
   limit(max){return Promise.resolve({data:rows.slice(0,max)})},
   then(resolve){return Promise.resolve({data:rows}).then(resolve)}
  };
  return query;
 }}};
 vm.runInNewContext(shares,{window,document,console});
 const ui=window.RESANTA_TRIOVIST_SHARES360_V1;
 const filter=(name,value)=>events.change({target:{dataset:{filter:name},value}});
 const settle=()=>new Promise(resolve=>setImmediate(resolve));
 await ui.open(host,{is_leader:true});
 assert.match(root.innerHTML,/<option value="2026-10-31" selected>/);
 assert.match(root.innerHTML,/23,33%/);
 assert.match(root.innerHTML,/width:30\.00%/);
 assert.match(root.innerHTML,/width:10\.00%/);
 assert.match(root.innerHTML,/role="tooltip">Октябрь 2026/);
 filter('brand','huter');
 assert.match(root.innerHTML,/width:10\.00%/);
 assert.doesNotMatch(root.innerHTML,/width:30\.00%/);
 filter('brand','all');
 events.click({target:{closest:()=>({dataset:{cat:'Инструмент'}})}});
 assert.match(root.innerHTML,/<section class="sh-panel"><h3>Продажи по брендам/);
 assert.doesNotMatch(root.innerHTML,/<h3>Ответственный|Закрепить категорию|Сохранить закрепление|Исследовать категорию Инструмент/);
 filter('period','2026-09-30');
 await settle();
 assert.match(root.innerHTML,/<option value="2026-09-30" selected>Январь–сентябрь 2026/);
 assert.match(root.innerHTML,/Доля по категориям/);
 assert.doesNotMatch(root.innerHTML,/Инструмент|23,33%/);
 assert.match(root.innerHTML,/width:10\.00%/);
 assert.ok(requests.some(x=>x[0]==='triovist_share_brands_v1'&&x[2]==='2026-09-30'));
 await ui.refresh();
 assert.match(root.innerHTML,/<option value="2026-09-30" selected>/);
 events.click({target:{closest:()=>({dataset:{view:'tasks'}})}});
 assert.match(root.innerHTML,/Очередь исследований/);
 assert.match(root.innerHTML,/Исследовать категорию Инструмент/);
 await settle();
 assert.doesNotMatch(root.innerHTML,/data-filter="period"/);
});
