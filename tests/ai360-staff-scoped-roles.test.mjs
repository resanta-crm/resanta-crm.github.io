import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
 STAFF_USERS,STAFF_DOMAINS,staffPermission,targetManagers,safeMonth,safeOffset,
 narrowKpi,narrowDebt
} from '../supabase/functions/crm-ai360-staff-read-v1/permissions.mjs';
const server=fs.readFileSync('supabase/functions/crm-ai360-staff-read-v1/index.ts','utf8');
const sid='ba55dfe5-7e48-4f1f-b40e-674c7752fe1a';
const rud='19dd9943-99ae-47c4-a39c-4f82a11059a6';
const al='6efa656e-45c6-473b-a853-89eccb9ee43a';
const matching=id=>({id,name:STAFF_USERS[id].name,role:STAFF_USERS[id].role,region:STAFF_USERS[id].region});
test('Only six exact CRM staff IDs with unchanged role, name and region are accepted',()=>{
 assert.equal(Object.keys(STAFF_USERS).length,6);
 for(const id of Object.keys(STAFF_USERS)){
  assert.ok(staffPermission(id,matching(id)));
  for(const bad of [
   {...matching(id),role:'boss_extra'},
   {...matching(id),name:'Подставной сотрудник'},
   {...matching(id),region:'Гомель'},
   {...matching(id),id:'00000000-0000-4000-8000-000000000000'}
  ])assert.equal(staffPermission(id,bad),null);
 }
 assert.equal(staffPermission('544fb1e2-ef70-44de-bc62-e0e1596a4bfc',{
   id:'544fb1e2-ef70-44de-bc62-e0e1596a4bfc',name:'Александр Паюшин',role:'boss',region:'Витебск'
 }),null,'director must keep using original, separately secured AI360');
 assert.equal(staffPermission('unknown',{}),null);
});
test('Sid may read only Vitebsk managers; no Triovist or arbitrary director exports',()=>{
 const p=staffPermission(sid,matching(sid));
 assert.equal(p.tier,'branch_director');
 assert.deepEqual(targetManagers(p,'sales',null),['Руднев','Ачинович','Шкуран']);
 assert.deepEqual(targetManagers(p,'sales','Руднев'),['Руднев']);
 for(const bad of ['Кришталь','Александренко','Гомель','Паюшин']){
  assert.equal(targetManagers(p,'sales',bad),null,bad);
 }
 assert.equal(targetManagers(p,'payments',null),null);
 assert.equal(targetManagers(p,'triovist_tasks',null),null);
});
test('Rudnev cannot switch his identity by text, client name, or another manager',()=>{
 const p=staffPermission(rud,matching(rud));
 assert.deepEqual(targetManagers(p,'clients',null),['Руднев']);
 assert.deepEqual(targetManagers(p,'clients','Руднев'),['Руднев']);
 assert.equal(targetManagers(p,'clients','Шкуран'),null);
 assert.equal(targetManagers(p,'sales','Ачинович'),null);
 for(const name of ['gps','stock','payments','promotions','triovist','competitors']){
  assert.equal(targetManagers(p,name,null),null,name);
 }
});
test('Triovist managers see only personal 21vek tasks, not cross-category catalogs',()=>{
 const p=staffPermission(al,matching(al));
 assert.deepEqual(p.domains,['triovist_tasks','triovist_groups','triovist_cards',
  'triovist_issues','triovist_positions','triovist_infographics']);
 assert.deepEqual(targetManagers(p,'triovist_tasks',null),['Александренко']);
 for(const domain of p.domains)assert.deepEqual(targetManagers(p,domain,null),['Александренко']);
 assert.equal(targetManagers(p,'triovist_tasks','Кришталь'),null);
 for(const x of ['triovist','cards_21vek','competitors','triovist_stock','mrc','clients','cash','payments']){
  assert.equal(targetManagers(p,x,null),null,x);
 }
});
test('KPIs never leak network turnover or unapproved managers',()=>{
 const payload={month:'2026-10',network_revenue:999999,
  managers:[{manager_name:'Руднев',plan:159000,actual:154245,plan_pct:97,to_plan:4755,clients_current:30},
   {manager_name:'Ачинович',plan:145000,actual:76201,plan_pct:52.6,to_plan:68799},
   {manager_name:'Секретный клиент',plan:1,actual:9999}],
  freshness:{last_success_at:'2026-10-29'}};
 const scoped=narrowKpi(payload,['Руднев']);
 assert.equal(scoped.managers.length,1);
 assert.equal(scoped.managers[0].manager_name,'Руднев');
 assert.ok(!('network_revenue'in scoped));
 assert.doesNotMatch(JSON.stringify(scoped),/Секретный|999999/);
});
test('Debts require exact manager-specific snapshot and strip other managers',()=>{
 const snap={source:'crm_ai360_debt_snapshot_v1',scope:'Руднев',
  debt_summary:{amount:25400,debtor_rows:2},
  overdue_debtors:[
   {client_name:'Разрешённый клиент',manager_name:'Руднев Александр',debt_overdue:5000,debt_overdue_days:35},
   {client_name:'Чужой клиент',manager_name:'Ачинович Екатерина',debt_overdue:9000,debt_overdue_days:50}
  ]};
 const result=narrowDebt([snap],['Руднев']);
 assert.equal(result.overdue_debtors.length,1);
 assert.equal(result.overdue_debtors[0].client_name,'Разрешённый клиент');
 assert.equal(narrowDebt([snap],['Ачинович']),null);
});
test('Malformed date or offset cannot authorize arbitrary pages',()=>{
 assert.equal(safeOffset(-1),0);assert.equal(safeOffset(300),0);
 assert.equal(safeOffset(12.5),0);assert.equal(safeOffset(100),100);
 assert.equal(safeMonth('2030-12','2026-10-29'),'2026-10');
 assert.equal(safeMonth('2026-09','2026-10-29'),'2026-09');
});
test('Server side role enforcement and client validation precede sensitive data read',()=>{
 for(const token of [
  "svc.auth.getUser(token)","select('id,name,role,region,email')",
  "const permission=staffPermission(user.id,profileRes.data)",
  "const managers=targetManagers(permission,domain,",
  ".ilike('name',escapedName).in('manager_name',managers)",
  "if((verify.data||[]).length!==1)throw new Error('client_not_in_authorized_portfolio')",
  "p_client_id:client.id",
  "kind==='capabilities'","body?.kind!=='read'",
  "voice_enabled:['branch_director','field_manager'].includes(permission.tier)","real_task_creation_enabled:permission.tier==='branch_director'"
 ])assert.ok(server.includes(token),token);
 assert.ok(!server.includes(".insert(")&&!server.includes(".update(")&&!server.includes(".delete("));
 assert.ok(server.indexOf('const permission=staffPermission')<server.indexOf('const result=await readStaff('));
});
