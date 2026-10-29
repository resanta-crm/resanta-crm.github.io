import test from 'node:test';
import assert from 'node:assert/strict';
import {isManagerSalesQuestion,resolveSalesMonth,formatManagerSales} from '../supabase/functions/crm-ai360-dialog-v4/manager-sales.mjs';
import {readFileSync} from 'node:fs';
const names=['Руднев','Шкуран','Ачинович','Кришталь'];
const snapshot={
 month:'2026-10',
 managers:[
  {manager_name:'Шкуран',plan:153000,actual:49246.28,plan_pct:32.2,to_plan:103753.72},
  {manager_name:'Ачинович',plan:145000,actual:76201.14,plan_pct:52.6,to_plan:68798.86},
  {manager_name:'Руднев',plan:159000,actual:154245.65,plan_pct:97,to_plan:4754.35}
 ],
 network_revenue:266322.18,planned_managers_revenue:279693.07,
 freshness:{status:'ok',last_success_at:'2026-10-29T07:10:43+00:00'},
 warnings:['Методики не сравнивать']
};
test('Manager sales intent catches phrasing and inflected surnames',()=>{
 for(const q of ['Проанализируй продажи менеджеров','Сколько продал Руднев?',
 'Сравни план и факт Ачинович','Выручка Шкурана за октябрь']){
  assert.equal(isManagerSalesQuestion(q,{managerNames:names}),true,q);
 }
 for(const q of ['Проверь маршруты Руднева','Посчитай ПДЗ менеджеров',
 'Мотивация менеджеров','Продажи клиента Эльхом Гарден']){
  assert.equal(isManagerSalesQuestion(q,{managerNames:names}),false,q);
 }
 assert.equal(isManagerSalesQuestion('А остальные?',{managerNames:names,memory:{domain:'sales_managers'}}),true);
});
test('Spoken month does not silently treat last month as current',()=>{
 assert.equal(resolveSalesMonth('Продажи Руднева за сентябрь', '2026-10','2026-10-29'),'2026-09');
 assert.equal(resolveSalesMonth('За 2025-10 сравни менеджеров','2026-10','2026-10-29'),'2025-10');
 assert.equal(resolveSalesMonth('За декабрь 2026','2026-10','2026-10-29'),'2026-10');
});
test('All sales managers grounded to the same KPI source',()=>{
 const r=formatManagerSales({question:'Сравни продажи менеджеров за октябрь',data:snapshot,month:'2026-10',managerNames:names});
 assert.equal(r.verified,true);
 assert.equal(r.source,'crm_ai360_sales_kpi_snapshot_v1');
 assert.match(r.brief,/Руднев.+154[\s\u00a0\u202f]246/);
 assert.match(r.brief,/Шкуран.+49[\s\u00a0\u202f]246/);
 assert.match(r.detail,/279[\s\u00a0\u202f]693/);
 assert.match(r.detail,/266[\s\u00a0\u202f]322/);
 assert.match(r.detail,/13[\s\u00a0\u202f]371/);
 assert.match(r.detail,/не совокупный KPI/i);
 assert.doesNotMatch(r.detail,/год к году.*\d+%/i);
});
test('Single manager and a two-person comparison stay in requested scope',()=>{
 let r=formatManagerSales({question:'Продажи Руднева',data:snapshot,month:'2026-10',managerNames:names});
 assert.equal(r.manager,'Руднев');
 assert.doesNotMatch(r.brief,/Ачинович/);
 r=formatManagerSales({question:'Сравни продажи Шкурана и Руднева',data:snapshot,month:'2026-10',managerNames:names});
 assert.match(r.brief,/Шкуран/);assert.match(r.brief,/Руднев/);
 assert.doesNotMatch(r.brief,/Ачинович/);
});
test('No manager result is invented for staff with no approved plan',()=>{
 const r=formatManagerSales({question:'Продажи Кришталь',data:snapshot,month:'2026-10',managerNames:names});
 assert.match(r.brief,/нет утверждённого плана/);
 assert.doesNotMatch(r.brief,/266[\s\u00a0\u202f]322/);
});
test('Failed or stale snapshots are not presented as verified',()=>{
 assert.equal(formatManagerSales({question:'Продажи менеджеров',data:{...snapshot,month:'2026-09'},month:'2026-10',managerNames:names}).error,'sales_source_invalid');
 assert.equal(formatManagerSales({question:'Продажи менеджеров',data:{...snapshot,freshness:{status:'error'}},month:'2026-10',managerNames:names}).error,'sales_import_not_fresh');
});
test('Backend routes manager sales before open-ended model calls',()=>{
 const src=readFileSync('supabase/functions/crm-ai360-dialog-v4/index.ts','utf8');
 assert.ok(src.indexOf("if(isManagerSalesQuestion(question")>0);
 assert.ok(src.indexOf("if(isManagerSalesQuestion(question")<src.indexOf('const output = await runToolCore('));
 assert.match(src,/intent:'verified_manager_sales'/);
});
