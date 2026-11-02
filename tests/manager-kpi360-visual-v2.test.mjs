import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const js=fs.readFileSync('assets/160-manager-kpi360-visual-v2.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261102_manager_kpi360_dashboard_visual_v2.sql','utf8');
const index=fs.readFileSync('index.html','utf8');
test('Visual KPI360 parses; all numeric values from RPC',()=>{
 new vm.Script(js,{filename:'visual.js'});
 const window={currentProfile:{role:'boss',name:'Александр Паюшин'}};
 const document={readyState:'loading',addEventListener(){}};
 vm.runInNewContext(js,{window,document});
 assert.equal(window.RESANTA_KPI360_VISUAL_V2.version,'2.1');
 const snapshot={sales:[{manager_name:'Руднев',shipment:170185,shipment_plan:159000,new_clients_plan:3},
 {manager_name:'Ачинович',shipment:101566,shipment_plan:145000,new_clients_plan:3},
 {manager_name:'Шкуран',shipment:72614,shipment_plan:153000,new_clients_plan:3}],
 managers:[{manager_name:'Руднев',bonus:6,first:3,returned:3},
 {manager_name:'Ачинович',bonus:5,first:1,returned:4},
 {manager_name:'Шкуран',bonus:2,first:0,returned:2}],
 prior_sales:[],summary:{bonus:13,first:4,returned:9,akb:98,akb_previous:101}};
 const totals=window.RESANTA_KPI360_VISUAL_V2.totals(snapshot);
 assert.equal(totals.sales,344365);
 assert.equal(totals.sales_plan,457000);
 assert.equal(totals.bonus,13);
 assert.equal(totals.bonus_plan,9);
 assert.equal(totals.akb,98);
 assert.equal(totals.akb_previous,101);
});
test('Read-only scoped database, manager cannot get network report or edit plans',()=>{
 assert.match(sql,/where id=auth\.uid\(\)/);
 assert.match(sql,/actor\.role='manager' and actor\.region='Витебск'/);
 assert.match(sql,/actor\.role='boss' and actor\.region='Витебск'/);
 assert.match(sql,/actor\.role='boss' or public\.crm_v2263_norm\(u\.name\)=public\.crm_v2263_norm\(actor\.name\)/);
 assert.match(sql,/revoke all on function public\.crm_manager_kpi360_dashboard_v2\(text\) from public,anon/);
 assert.match(js,/plans\.style\.display=isBoss\(\)\?'inline-flex':'none'/);
 assert.doesNotMatch(sql,/\b(update|delete|truncate)\s+public\.(?:clients|purchase_history|manager_kpi_plans)/i);
});
test('Six-month premium rule, canonical IDs and temporal comparisons',()=>{
 assert.match(sql,/having count\(distinct id\)=1/);
 assert.match(sql,/left join name_map n on c\.id is null and n\.k=public\.crm_client_key\(ph\.client_name\)/);
 assert.match(sql,/last_period<\(period-interval '6 months'\)::date/);
 assert.match(sql,/when last_period is null then 'first'/);
 assert.match(sql,/when last_period<\(period-interval '6 months'\)::date then 'returned'/);
 assert.match(sql,/count\(distinct client_key\)::int unique_akb/);
 assert.match(sql,/crm_manager_kpi_leaderboard\(p_month\)/);
 assert.match(index,/assets\/160-manager-kpi360-visual-v2\.js/);
});
test('Selected design has three KPIs, graphical views, Lera, client detail, export',()=>{
 for(const phrase of ['Продажи по менеджерам','Динамика продаж','Коротко за месяц','Спросить Леру','function exportCsv','Для KPI','Впервые','Вернувшиеся','Вся АКБ'])assert.ok(js.includes(phrase),phrase);
 assert.doesNotMatch(js,/Задачи на сегодня/);
 assert.match(js,/serial!==generation|serial===generation/);
 assert.match(js,/clientFilter='bonus'/);
});

test('Supabase client resolves from the top-level lexical const db',()=>{
 assert.match(js,/const dbc=\(\)=>\{try\{return typeof db!==\x27undefined\x27\?db:w\.db/);
 assert.match(js,/const client=dbc\(\)/);
});
