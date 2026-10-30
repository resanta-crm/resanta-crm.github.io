'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,n),'utf8');
const server=read('supabase/functions/connect-livekit-token/index.ts');
const client=read('assets/154-resanta-connect-video-v1.js');
const chat=read('assets/151-resanta-connect-v1.js');
const html=read('index.html'),css=read('assets/154-resanta-connect-video-v1.css');
const checks=[
 ['Native CRM: video button inside chat; no separate login',()=>{
  assert.match(html,/assets\/154-resanta-connect-video-v1\.js/);
  assert.match(html,/assets\/154-resanta-connect-video-v1\.css/);
  assert.match(chat,/window\.crmConnectVideo131\?\.init/);
  assert.match(chat,/window\.crmConnectVideo131\?\.chatChanged/);
  assert.doesNotMatch(client,/signInWithPassword|createClient\(/);
 }],
 ['Keys and identity never exposed by browser client',()=>{
  assert.doesNotMatch(client,/LIVEKIT_API_SECRET|LIVEKIT_API_KEY|service_role|new AccessToken/);
  assert.match(client,/functions\.invoke\('connect-livekit-token'/);
  assert.match(server,/Deno\.env\.get\("LIVEKIT_API_SECRET"\)/);
  assert.match(server,/new AccessToken\(apiKey, apiSecret/);
 }],
 ['Server only permits active authenticated chat members',()=>{
  assert.match(server,/auth\.getUser\(jwt\)/);
  assert.match(server,/connect_active_staff_v1/);
  assert.match(server,/connect_room_members_v1/);
  assert.match(server,/\.eq\("room_id", roomId\)\.eq\("user_id", userId\)/);
  assert.match(server,/if \(staffCheck\.data !== true \|\| !permissionCheck\.data\?\.chat_enabled/);
  assert.match(server,/!permissionCheck\.data\?\.video_enabled/);
  assert.match(server,/!memberCheck\.data \|\| !profileCheck\.data/);
  assert.doesNotMatch(server,/SUPABASE_SERVICE_ROLE_KEY/);
 }],
 ['Room and token scope are always derived on server',()=>{
  assert.match(server,/const livekitRoom = "resanta-connect-" \+ roomId/);
  assert.match(server,/identity: userId/);
  assert.match(server,/roomJoin: true/);
  assert.match(server,/room: livekitRoom/);
  assert.match(server,/5 \* 60 \* 60/);
  assert.doesNotMatch(server,/body\.identity|body\.room_name|body\.livekit_room/);
 }],
 ['Server is origin-restricted and no-cache',()=>{
  assert.match(server,/https:\/\/resanta-crm\.by/);
  assert.match(server,/Origin denied/);
  assert.match(server,/Cache-Control": "no-store"/);
  assert.match(server,/url\.protocol !== "wss:"/);
 }],
 ['SDK is lazy-loaded only on actual call click',()=>{
  assert.match(client,/const SDK_URL='https:\/\/cdn\.jsdelivr\.net\/npm\/livekit-client@2\.23\.0/);
  assert.match(client,/b\.addEventListener\('click',join\)/);
  assert.match(client,/const livekit=await loadSdk\(\)/);
  assert.doesNotMatch(html,/<script[^>]+livekit-client/);
 }],
 ['Camera mic screen controls and explicit leave',()=>{
  assert.match(client,/setMicrophoneEnabled/);
  assert.match(client,/setCameraEnabled/);
  assert.match(client,/setScreenShareEnabled/);
  assert.match(client,/c131-leave/);
  assert.match(client,/await old\.disconnect/);
  assert.match(client,/requestEpoch\+\+/);
 }],
 ['Names and error messages are not inserted into HTML',()=>{
  assert.match(client,/n\.textContent=String/);
  assert.doesNotMatch(client,/innerHTML\s*\+=/);
  assert.match(css,/#app \.c131-overlay/);
 }],
 ['Video module parses and exposes only hooks',()=>{
  new Function(client);
  const window={},document={getElementById:()=>null};
  vm.runInNewContext(client,{window,document});
  assert.equal(typeof window.crmConnectVideo131?.init,'function');
  assert.equal(typeof window.crmConnectVideo131?.chatChanged,'function');
 }],
 ['Browser permission errors clear after successful device sharing',()=>{
  assert.match(client,/status\(active\?'Демонстрация экрана включена\.'/);
  assert.match(client,/status\(enabled\?'Камера включена\.'/);
  assert.match(client,/status\(enabled\?'Микрофон включён\.'/);
  assert.match(client,/Permission denied/);
  assert.match(client,/Демонстрация не началась: окно не выбрано/);
  assert.match(client,/b\.disabled=false;updateMini\(\);/);
 }],
 ['Defer scripts finish before CRM chat initializes',()=>{
  assert.match(chat,/document\.readyState==='complete'\)init\(\)/);
  assert.match(chat,/document\.addEventListener\('DOMContentLoaded'/);
 }]
];
let failed=0;for(const [name,run] of checks){try{run();console.log('PASS',name);}catch(e){failed++;console.log('FAIL',name,e.message);}}
if(failed)process.exitCode=1;else console.log('CONNECT #131: '+checks.length+' checks passed');
