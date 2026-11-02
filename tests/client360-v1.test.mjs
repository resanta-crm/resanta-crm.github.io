import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const f=p=>fs.readFileSync(p,'utf8');
const schema=f('supabase/migrations/20261102_client360_legal_stores_v1.sql');
const core=f('assets/01-crm-core.js');
const directory=f('assets/158-client360-legal-stores-v1.js');
const ui=f('index.html');
const lpr=f('supabase/functions/crm-lpr-birthdays-v1/index.ts');

test('Client360 grouping is non-destructive and anonymous clients cannot call write RPCs',()=>{
 for(const table of ['client360_entities_v1','client360_entity_clients_v1','client360_point_requests_v1'])
  assert.match(schema,new RegExp('alter table public\\.'+table+' enable row level security'));
 for(const name of ['client360_group_clients_v1','client360_create_route_v1','client360_approve_store_v1'])
  assert.ok(schema.includes(name),name);
 assert.match(schema,/from public,anon/);
 assert.match(schema,/u\.role|v_role/);
 assert.match(directory,/Связать выбранные карточки \(без удаления\)/);
 assert.match(core,/p_name:target\.name,p_client_ids:\[sourceId,targetId\]/);
});

test('Manager route selects an exact physical store, not first company GPS',()=>{
 for(const token of ['client360_points_for_client_v1','client360_create_route_v1',
   'p_point_id:pointId','client360_request_store_v1'])
  assert.ok(core.includes(token),token);
 assert.match(core,/gpsCheckAgainstClient\(c,qvGeo,qvMatchedPlan\)/);
 assert.match(core,/gpsCheckAgainstClient\(c,geo,matchedVisitPlan\)/);
 assert.match(schema,/selected_physical_store/);
 assert.match(schema,/Обязательно выберите торговую точку/);
});

test('LPR boss may create birthdays, field manager cannot edit other clients',()=>{
 assert.match(lpr,/if\(u\.tier!=='manager'&&u\.tier!=='director'\)/);
 assert.match(lpr,/clients\.some\(c=>c\.id===client_id\)/);
 assert.match(lpr,/allowedManagerIds\[user\.name\]===user\.id/);
 assert.match(lpr,/unmatched_vip:unmatchedVip/);
});

test('Versioned Client360 entrypoint does not replace CRM login',()=>{
 assert.match(ui,/01-crm-core\.js\?v=23\.6\.339-client360-1/);
 assert.match(ui,/158-client360-legal-stores-v1\.js\?v=1/);
 assert.match(ui,/149-lpr-v1\.js\?v=client360-20261102/);
 assert.match(core,/async function initAuth\(\)/);
 assert.doesNotMatch(directory,/db\.from\(['\"]clients['\"]\)\.delete\(/);
});

// Verify the additional KPI360 interface whenever the existing CRM regression runs.
import './manager-kpi360-v1.test.mjs';

// Regression of new KPI360 visual dashboard and manager data boundaries.
import './manager-kpi360-visual-v2.test.mjs';
