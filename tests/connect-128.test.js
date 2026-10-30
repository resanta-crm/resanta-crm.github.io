'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const html=read('index.html');
const chat=read('assets/151-resanta-connect-v1.js');
const css=read('assets/151-resanta-connect-v1.css');
const notify=read('assets/153-resanta-connect-notify-v1.js');
const sql=read('supabase/migrations/20261030080000_connect_128_unread.sql');
let passed=0;
const test=(name,fn)=>{try{fn();console.log('PASS '+name);passed++;}catch(e){console.error('FAIL '+name+' '+e.message);process.exitCode=1;}};
test('integrated native CRM nav, scripts and legacy chat kept',()=>{
 assert.match(html,/id="nav-connect"/);assert.match(html,/id="page-connect"/);
 assert.match(html,/153-resanta-connect-notify-v1\.js/);
 assert.match(chat,/window\.crmConnectOpen126=open/);
 assert.doesNotMatch(notify,/signInWithPassword|createClient\(/);
});
test('unread marker is server-derived and owned by user',()=>{
 assert.match(sql,/add column if not exists last_read_at/i);
 assert.match(sql,/connect_unread_counts_v1/);
 assert.match(sql,/rm\.user_id=\(select auth\.uid\(\)\)/);
 assert.match(sql,/connect_active_staff_v1/);
 assert.match(sql,/cm\.sender_id is distinct from/);
});
test('read acknowledgement changes only self and checks account',()=>{
 assert.match(sql,/update public\.connect_room_members_v1 rm\s+set last_read_at=clock_timestamp\(\)\s+where rm\.user_id=v_user and rm\.room_id=p_room_id/i);
 assert.match(sql,/if not found then/i);
 assert.match(sql,/connect_active_staff_v1\(v_user\)/);
});
test('no direct writes or anonymous access',()=>{
 assert.match(sql,/revoke all on function public\.connect_mark_read_v1\(uuid\) from public,anon/i);
 assert.match(sql,/grant execute on function public\.connect_mark_read_v1\(uuid\) to authenticated/i);
 assert.doesNotMatch(sql,/grant\s+update\s+on\s+public\.connect_room_members_v1/i);
});
test('optional browser notifications, no app-closed push claim',()=>{
 assert.match(notify,/Notification\.requestPermission\(\)/);
 assert.match(notify,/document\.hidden&&typeof Notification/);
 assert.match(notify,/while the CRM page remains open/);
 assert.doesNotMatch(notify,/ServiceWorker|pushManager|serviceWorker\.register/);
});
test('unread refresh is lazy and login-safe',()=>{
 assert.match(notify,/if\(!isSignedIn\(\)\)/);
 assert.match(notify,/account!==id/);
 assert.match(notify,/db\.auth\.getUser|database\(\)\.auth\.getUser/);
 assert.match(notify,/setInterval\(refresh,35000\)/);
});
test('existing chat marks only viewed room as read',()=>{
 assert.match(chat,/crmConnectNotify128\?\.markRead\(id\)/);
 assert.match(chat,/crmConnectNotify128\?\.paint\(\)/);
 assert.match(chat,/dataset\.roomId=r\.id/);
});
test('additive-only schema changes',()=>{
 assert.doesNotMatch(sql,/drop table|truncate table|delete from |alter table public\.(users|clients|visits|tasks|sales)/i);
});
test('scoped badges and no global CSS',()=>{
 assert.match(css,/#nav-connect \.c128-badge/);
 assert.match(css,/#page-connect \.c128-room-count/);
});
if(!process.exitCode)console.log('CONNECT #128 total checks:',passed);
