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
test('Exact field-manager UUID and protected director write, with per-client ownership enforced',()=>{
 for(const str of ['SVC.auth.getUser(token)','allowedManagerIds[user.name]===user.id',
  "q=q.eq('manager_name',u.name)",
  "if(u.tier!=='manager'&&u.tier!=='director')",
  "clients.some(c=>c.id===client_id)","original.client_id!==client_id",
  "validMonthDay(birth_month,birth_day)",
  "const boss=SIDS.has(user.id)&&user.role==='boss'"])
   assert.ok(service.includes(str),str);
 assert.match(service,/return clients\.map\(c=>\(\{\.\.\.c,is_vip:/);
 assert.match(service,/unmatched_vip:unmatchedVip/);
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


test('LPR director reads hundreds of clients in bounded, ownership-safe requests', async()=>{
 const match=service.match(/async function fetchScopedLprContacts\(ids,svc=SVC\)\{[\s\S]*?\n\}\nasync function list/);
 assert.ok(match,'scoped batch reader present');
 const load=new Function('SVC','return ('+match[0].slice(0,-'\nasync function list'.length)+');')({});
 const ids=Array.from({length:685},(_,i)=>'client-'+String(i).padStart(4,'0'));
 const queries=[];
 const svc={from(table){
  assert.equal(table,'crm_lpr_contacts_v1');
  const q={select(){return q},in(field,part){assert.equal(field,'client_id');q.ids=part;return q},
   eq(field,value){assert.equal(field,'active');assert.equal(value,true);return q},
   order(){return q},limit(n){assert.equal(n,2500);queries.push(q.ids);
    return Promise.resolve({data:[{client_id:q.ids[0],full_name:'Test '+q.ids[0]},
      {client_id:'unowned-client',full_name:'Secret'}],error:null});}};
  return q;
 }};
 const result=await load(ids,svc);
 assert.equal(queries.length,Math.ceil(ids.length/75));
 assert.ok(queries.every(q=>q.length>0&&q.length<=75));
 assert.deepEqual(new Set(queries.flat()),new Set(ids));
 assert.equal(result.length,queries.length);
 assert.ok(result.every(row=>ids.includes(row.client_id)));
 const small=await load(ids.slice(0,2),svc);
 assert.equal(small.length,1);
});
test('LPR batch reader surfaces failed database requests instead of displaying partial list',async()=>{
 const match=service.match(/async function fetchScopedLprContacts\(ids,svc=SVC\)\{[\s\S]*?\n\}\nasync function list/);
 assert.ok(match);
 const load=new Function('SVC','return ('+match[0].slice(0,-'\nasync function list'.length)+');')({});
 const failing={from(){const q={select(){return q},in(){return q},eq(){return q},order(){return q},limit(){return Promise.resolve({data:null,error:{code:'PGRST'}})}};return q;}};
 await assert.rejects(load(['some-client'],failing),/lpr_read_unavailable/);
});
