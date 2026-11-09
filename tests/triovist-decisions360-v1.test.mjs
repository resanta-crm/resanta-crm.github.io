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
 assert.match(task,/листинг требует проверки/);
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
test('task motivation uses current approved policy and current payroll snapshot',()=>{
 assert.match(taskUi,/readOnlySnapshot/);
 assert.match(taskUi,/task_kpi_rate/);
 assert.match(taskUi,/task_kpi_max/);
 assert.match(taskUi,/В работе ≠ премия/);
 assert.match(taskUi,/Мотивация по задачам/);
});
test('share advice explains points and historical US dollars, not invented Q4 actuals',()=>{
 assert.match(shares,/Модель \+1 п\. п\. \(9 мес\.\)/);
 assert.match(shares,/goal_requires_review/);
 assert.match(shares,/2026.*без НДС/);
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
 assert.match(index,/61-triovist-task-month-safe-v23651\.js\?v=20261109-decisions360-fact1/);
 assert.match(index,/169-triovist-tasks360-ux-v1\.js\?v=20261109-decisions360-motivation1/);
 assert.match(index,/182-triovist-shares360-v1\.js\?v=20261109-decisions360-evidence1/);
 assert.match(index,/2026-11-06-release-guard-v1/);
});
