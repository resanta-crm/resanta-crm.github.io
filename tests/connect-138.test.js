'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const sql=read('supabase/migrations/20261030113000_connect_138_push_prep.sql');
const js=read('assets/156-resanta-connect-android-push-v1.js');
const html=read('index.html');
let count=0;
function verify(label,fn){fn();count++;console.log('PASS',label);}
verify('Private push device registry enforces RLS and has no authenticated direct access',()=>{
 assert.match(sql,/create table if not exists public\.connect_push_devices_v1/);
 assert.match(sql,/alter table public\.connect_push_devices_v1 enable row level security/);
 assert.match(sql,/revoke all on public\.connect_push_devices_v1 from public, anon, authenticated/);
 assert.match(sql,/connect_active_staff_v1\(v_user\)/);
});
verify('Only the logged in CRM employee can bind and revoke their own FCM token',()=>{
 assert.match(sql,/v_user uuid:=auth\.uid\(\)/);
 assert.match(sql,/on conflict\(fcm_token\) do update set user_id=excluded\.user_id/);
 assert.match(sql,/where fcm_token=p_token and user_id=auth\.uid\(\)/);
 assert.match(sql,/revoke all on function public\.connect_push_register_v1\(text\) from public,anon/);
});
verify('No push is dispatched until Firebase configuration is complete',()=>{
 assert.match(sql,/No trigger is enabled until FCM credentials/);
 assert.match(sql,/connect_push_outbox_v1/);
 assert.doesNotMatch(sql,/create trigger\s+.*connect_push/i);
});
verify('CRM script requests opt-in only in native Android, on click',()=>{
 new Function(js);
 assert.match(js,/window\.Capacitor\?\.isNativePlatform/);
 assert.match(js,/addEventListener\('click',enable\)/);
 assert.match(js,/await push\(\)\.requestPermissions\(\)/);
 assert.match(js,/await push\(\)\.register\(\)/);
 assert.match(js,/connect_push_register_v1/);
 assert.match(js,/connect_permissions_v1/);
});
verify('Notification activation deep links only to validated CRM room ids',()=>{
 assert.match(js,/\^\[0-9a-f-\]\{36\}\$/i);
 assert.match(js,/window\.crmConnectOpenRoom136/);
 assert.match(js,/pushNotificationActionPerformed/);
 assert.match(js,/onSignedOut/);
});
verify('No Firebase service secrets in browser or migration',()=>{
 assert.doesNotMatch(js,/service_account|private_key|FCM_SERVER_KEY|SUPABASE_SERVICE_ROLE_KEY|google-services\.json/);
 assert.match(html,/assets\/156-resanta-connect-android-push-v1\.js\?v=1/);
});
console.log('CONNECT #138 staging '+count+' tests passed');
