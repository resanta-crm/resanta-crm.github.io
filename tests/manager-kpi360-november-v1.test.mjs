import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync('assets/160-manager-kpi360-visual-v2.js','utf8');
const html=fs.readFileSync('index.html','utf8');
function makeDashboard(){
 const window={currentProfile:{role:'boss',name:'Александр Паюшин'}};
 const document={readyState:'loading',addEventListener(){}};
 new vm.Script(src,{filename:'KPI360-visual-v2.js'}).runInNewContext({window,document});
 return window.RESANTA_KPI360_VISUAL_V2;
}
test('Nov 2026 plan view computes totals without inventing 1C facts',()=>{
 const ui=makeDashboard();
 const snapshot=ui.planSnapshot({
  sales:[
   {manager_name:'Руднев',shipment_plan:167000,akb_plan:46,new_clients_plan:3,shipment:0},
   {manager_name:'Ачинович',shipment_plan:105000,akb_plan:35,new_clients_plan:3,shipment:0},
   {manager_name:'Шкуран',shipment_plan:89000,akb_plan:26,new_clients_plan:3,shipment:0}
  ],managers:[],prior_sales:[]
 });
 assert.equal(snapshot.sales,361000);
 assert.equal(snapshot.akb,107);
 assert.equal(snapshot.bonus,9);
 assert.equal(snapshot.rows.length,3);
 assert.equal(snapshot.hasPlans,true);
});
test('pre-import November shows complete plan dashboard rather than a blank notice',()=>{
 assert.match(src,/function renderAwaitingImport\(data,el\)/);
 assert.match(src,/if\(!latestData\(data\)\)\{renderAwaitingImport\(data,el\);return\}/);
 assert.match(src,/План продаж по менеджерам/);
 assert.match(src,/Планы по клиентам/);
 assert.match(src,/Факт: ожидаем импорт 1С/);
 assert.match(src,/Нули и выполнение плана не рассчитываем/);
 assert.match(src,/Синие полосы показывают только утверждённые планы, а не факт/);
 assert.match(src,/Открыть /);
 assert.match(src,/Последняя выгрузка 1С/);
 assert.match(html,/160-manager-kpi360-visual-v2\.js\?v=20261102-4/);
});
test('November stays selected and graphs use last uploaded October, not fake Nov zero values',()=>{
 assert.doesNotMatch(src,/if\(!manuallySelected&&m>data\.latest_sales_month/);
 assert.match(src,/const historyPeriod=data\.latest_sales_month&&m>data\.latest_sales_month\?data\.latest_sales_month:m/);
 assert.match(src,/crm_manager_kpi360_history_v3/);
 assert.match(src,/historyMetric=b\.dataset\.metric;render\(data\)/);
});
test('pre-import view has no new write privileges and keeps existing 1C fact distinction',()=>{
 assert.doesNotMatch(src,/\.from\('purchase_history'\)\.update\(/);
 assert.doesNotMatch(src,/\.from\('manager_kpi_plans'\)\.update\(/);
 assert.match(src,/Права сохранены: менеджер видит только свои планы/);
 assert.match(src,/plans\.style\.display=isBoss\(\)\?'inline-flex':'none'/);
});
