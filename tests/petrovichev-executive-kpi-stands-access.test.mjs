import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const m=readFileSync(new URL('../supabase/migrations/20261112201500_petrovichev_executive_kpi_stands_access_v1.sql',import.meta.url),'utf8');

test('Petrovichev KPI access is identity-scoped, role-scoped, and no other users are promoted',()=>{
  assert.match(m,/crm_manager_kpi360_dashboard_v2/);
  assert.match(m,/crm_manager_kpi360_history_v3/);
  assert.match(m,/crm_manager_kpi360_history_v4/);
  assert.match(m,/crm_manager_kpi360_yoy_v1/);
  assert.match(m,/actor\.id=''a24954b8-2fe1-4852-b629-d8f351e1bd36''::uuid/);
  assert.match(m,/actor\.role=''boss''/);
  assert.match(m,/actor\.access_scope=''standard''/);
  assert.match(m,/actor\.region=''Все филиалы''/);
  assert.match(m,/IF v_target_count<>1/);
});
test('Stand access comes from the separate role table without editing other users',()=>{
  assert.match(m,/public\.stand_roles_v236346/);
  assert.match(m,/ON CONFLICT \(user_id\) DO NOTHING/);
  assert.doesNotMatch(m,/UPDATE public\.users SET role/);
  assert.doesNotMatch(m,/UPDATE auth\.users/);
});
