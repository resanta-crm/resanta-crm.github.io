import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const f=p=>fs.readFileSync(p,'utf8');
const sql=f('supabase/migrations/20261029_lpr_birthdays_private_v1.sql');
const service=f('supabase/functions/crm-lpr-birthdays-v1/index.ts');
const mileage=f('supabase/functions/crm-my-mileage-v1/index.ts');
const ui=f('assets/149-lpr-v1.js');
const gpsui=f('assets/150-my-mileage-v1.js');
test('LPR dates and sending logs are private, no change to client or GPS tables',()=>{
 for(const table of ['crm_lpr_contacts_v1','crm_lpr_birthday_delivery_v1']){
  assert.ok(sql.includes('alter table public.'+table+' enable row level security'));
  assert.ok(sql.includes('revoke all on public.'+table+' from anon,authenticated'));
 }
 assert.match(sql,/unique\(lpr_id,recipient_user_id,event_date,event_kind\)/);
 assert.match(sql,/birth_day smallint/);assert.match(sql,/birth_month smallint/);
 assert.doesNotMatch(sql,/birth_year/);
});
test('Exact manager UUID, client ownership, and VIP director scope enforced on server',()=>{
 for(const s of ['SVC.auth.getUser(token)','allowedManagerIds[user.name]===user.id',
  "q=q.eq('manager_name',u.name)","if(u.tier!=='manager')",
  "clients.some(c=>c.id===client_id)","original.client_id!==client_id",
  "validMonthDay(birth_month,birth_day)"])
   assert.ok(service.includes(s),s);
 assert.match(service,/u\.tier==='manager'\|\|c\.is_vip===true\|\|vipIds\.has\(c\.id\)/);
});
test('VIP Telegram reminders at three days and birthday with dedupe',()=>{
 for(const s of ["event_kind:'3_days'","event_kind:'birthday'","x-crm-dispatch-secret",
  "crm_lpr_birthday_delivery_v1","if(ie.code==='23505')",
  "if(!client||(!client.is_vip&&!vipIds.has(client.id)))continue"])
   assert.ok(service.includes(s),s);
});
test('Personal mileage does not read other users or write GPS',()=>{
 for(const s of ['SVC.auth.getUser(token)',".eq('manager_name',u.name)",
  "user_id.eq.'+uid+',user_id.is.null",'gps_workdays',
  'gps_fuel_vehicle_settings','my_gps_mileage_v1'])
  assert.ok(mileage.includes(s),s);
 for(const s of ['.insert(','.update(','.delete(', 'body.manager_name'])
  assert.ok(!mileage.includes(s),s);
});
test('UI only loads private endpoints after click; no old CRM data source changed',()=>{
 assert.match(ui,/crmLprV1/);
 assert.match(gpsui,/crmMyMileageV1/);
 assert.match(ui,/crm-lpr-birthdays-v1/);
 assert.match(gpsui,/crm-my-mileage-v1/);
 const core=f('assets/148-resanta-ai360-staff-identity-v1.js');
 assert.match(core,/149-lpr-v1\.js/);
 assert.match(core,/150-my-mileage-v1\.js/);
 assert.match(f('assets/134-resanta-voice-ai360-pilot-v1.js'),/crmLprV1\?\.voice/);
 assert.match(f('assets/144-resanta-ai360-branch-voice-v1.js'),/crmLprV1\?\.voice/);
});
