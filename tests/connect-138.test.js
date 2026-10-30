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
 assert.match(sql,/No DB trigger is used/);
 assert.match(sql,/connect_push_delivery_v1/);
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
 assert.match(html,/assets\/156-resanta-connect-android-push-v1\.js\?v=2/);
});
verify('FCM server requires sender CRM JWT and exact message ownership',()=>{
 const worker=read('supabase/functions/connect-fcm-send/index.ts');
 assert.match(worker,/auth\.getUser\(jwt\)/);
 assert.match(worker,/msg\.data\.sender_id!==userId/);
 assert.match(worker,/connect_active_staff_v1/);
 assert.match(worker,/connect_room_members_v1/);
 assert.match(worker,/if\(self\.error\|\|!self\.data\)/);
 assert.match(worker,/connect_permissions_v1/);
 assert.match(worker,/!isVideo\|\|x\.video_enabled/);
 assert.match(worker,/connect_push_devices_v1/);
});
verify('FCM worker uses server credentials, no customer message in notification payload',()=>{
 const worker=read('supabase/functions/connect-fcm-send/index.ts');
 assert.match(worker,/FIREBASE_SERVICE_ACCOUNT_JSON/);
 assert.match(worker,/SUPABASE_SERVICE_ROLE_KEY/);
 assert.match(worker,/https:\/\/fcm\.googleapis\.com\/v1\/projects\//);
 assert.match(worker,/notification:\{title:/);
 assert.doesNotMatch(worker,/notification:\{[^}]*msg\.data\.body/);
 assert.match(worker,/connect_push_delivery_v1/);
 assert.match(sql,/create table if not exists public\.connect_push_delivery_v1/);
 assert.match(sql,/revoke all on public\.connect_push_delivery_v1 from public,anon,authenticated/);
});
verify('Every sent chat and call invitation requests FCM without blocking conversation',()=>{
 const chat=read('assets/151-resanta-connect-v1.js');
 const livekit=read('assets/154-resanta-connect-video-v1.js');
 assert.match(chat,/crmConnectPush138\?\.sendForMessage\?\.\(message\.id\)/);
 assert.match(livekit,/crmConnectPush138\?\.sendForMessage\?\.\(r\.data\.id\)/);
 assert.match(js,/connect-fcm-send/);
 assert.match(js,/sendForMessage/);
 assert.match(html,/151-resanta-connect-v1\.js\?v=8/);
 assert.match(html,/154-resanta-connect-video-v1\.js\?v=7/);
});
console.log('CONNECT #138 staging '+count+' tests passed');
