import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../supabase/migrations/20261117041634_control_sales_summary_v1.sql',import.meta.url),'utf8');
const checks=readFileSync(new URL('../tests/control-sales-summary-20261117.sql',import.meta.url),'utf8');
const ui=readFileSync(new URL('../assets/283-control-center-v1.js',import.meta.url),'utf8');

test('thin read reuses one canonical sales calculator without changing full KPI routines or formulas',()=>{
  assert.equal((sql.match(/create or replace function/g)||[]).length,1);
  assert.match(sql,/create or replace function public\.crm_control_sales_summary_v1\(p_month text\)/);
  assert.equal((sql.match(/public\.crm_manager_kpi_leaderboard\(p_month\)/g)||[]).length,1);
  assert.match(sql,/select to_char\(max\(month\),'YYYY-MM'\)/);
  assert.doesNotMatch(sql,/crm_manager_kpi360_(?:dashboard|yoy|history)|sum\(|client_aliases|insert into|update public|delete from|create table/i);
  for(const key of ['manager_name','shipment','shipment_plan'])assert.match(sql,new RegExp("'"+key+"',x\\."+key));
});

test('authorization keeps the existing boss/field/executive allowlist and explicitly denies null profiles',()=>{
  assert.match(sql,/where id=auth\.uid\(\)/);
  assert.match(sql,/actor\.id is null/);
  assert.match(sql,/actor\.role='boss' and actor\.region='Витебск'/);
  assert.match(sql,/in \('александр паюшин','сидарович к н'\)/);
  assert.match(sql,/actor\.role='manager' and actor\.region='Витебск'/);
  assert.match(sql,/in \('руднев','ачинович','шкуран'\)/);
  for(const exact of ["actor.id='a24954b8-2fe1-4852-b629-d8f351e1bd36'::uuid","lower(actor.email)='petrovichev@resanta.ru'","actor.access_scope='standard'","actor.region='Все филиалы'"])assert.ok(sql.includes(exact));
  assert.match(sql,/\) is not true then\s*raise exception 'not_authorized'/);
  assert.match(sql,/where actor\.role='boss' or\s*public\.crm_v2263_norm\(x\.manager_name\)=public\.crm_v2263_norm\(actor\.name\)/);
  assert.match(sql,/set search_path='public','auth','pg_catalog'/);
  assert.match(sql,/revoke all on function public\.crm_control_sales_summary_v1\(text\) from public,anon,service_role/);
  assert.match(sql,/grant execute on function public\.crm_control_sales_summary_v1\(text\) to authenticated/);
  assert.doesNotMatch(sql,/grant .*schema|grant .*table|grant .* to public|grant .* to anon/i);
});

test('month and small response are explicit; the UI has no automatic full-dashboard fallback',()=>{
  assert.match(sql,/p_month is null or p_month !~/);
  assert.match(sql,/perform \(p_month\|\|'-01'\)::date/);
  assert.match(sql,/'version','kpi360-sales-v1'/);
  assert.match(sql,/'month',p_month/);
  assert.match(sql,/'latest_sales_month',last_available_month/);
  assert.match(ui,/rpc\('crm_control_sales_summary_v1',\{p_month:month\},signal\)/);
  assert.match(ui,/x\.version!=='kpi360-sales-v1'/);
  assert.doesNotMatch(ui,/crm_manager_kpi360_dashboard_v2|kpi360-visual-v2/);
  assert.match(ui,/query\.abortSignal\(signal\)/);
});

test('database check script is rollback-only with actual authenticated/anonymous parity scenarios',()=>{
  assert.match(checks,/\bbegin;/i);assert.match(checks,/rollback;\s*$/i);
  assert.doesNotMatch(checks,/\bcommit\b|insert into|update public|delete from|create .*function/i);
  for(const label of ['owner','branch','rudnev','achinovich','shkuran','protected_executive','unauthorized_account','missing_profile'])assert.ok(checks.includes("'"+label+"'"));
  assert.match(checks,/set local role authenticated/);
  assert.match(checks,/actual:=public\.crm_control_sales_summary_v1\('2026-11'\)/);
  assert.match(checks,/full_result:=public\.crm_manager_kpi360_dashboard_v2\('2026-11'\)/);
  assert.match(checks,/actual->'sales' is distinct from expected_sales/);
  assert.match(checks,/set local role anon/);
  assert.match(checks,/exception when insufficient_privilege then rejected:=true/);
});
