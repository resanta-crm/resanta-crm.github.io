'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),get=x=>fs.readFileSync(path.join(root,x),'utf8');
const sql=get('supabase/migrations/20261030105000_connect_136_permissions.sql');
const chat=get('assets/151-resanta-connect-v1.js');
const ui=get('assets/155-resanta-connect-permissions-v1.js');
const edge=get('supabase/functions/connect-livekit-token/index.ts');
const html=get('index.html');
let passed=0,failed=0;
function check(name,fn){try{fn();passed++;console.log('PASS',name);}catch(e){failed++;console.error('FAIL',name,e.message);}}
check('Permission table is RLS-protected read-only to authenticated users',()=>{
 assert.match(sql,/create table if not exists public.connect_permissions_v1/i);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on public.connect_permissions_v1 from public,anon,authenticated/);
 assert.match(sql,/grant select on public.connect_permissions_v1 to authenticated/);
 assert.match(sql,/constraint connect_video_requires_chat_v1/);
});
check('Exactly 10 approved staff seeded by name with Nesterov excluded',()=>{
 for(const name of ['Александр Паюшин','Сидарович К.Н.','Руднев','Ачинович','Шкуран','Александренко','Кришталь','Нестеров П.Ю.','Офис-менеджер Витебск','Менеджер сервисного центра'])assert.ok(sql.includes(name),name);
 assert.match(sql,/u\.name <> 'Нестеров П\.Ю\.'/);
 assert.match(sql,/u\.name not in \('Нестеров П\.Ю\.','Офис-менеджер Витебск','Менеджер сервисного центра'\)/);
});
check('Existing CONNECT RLS now enforces chat-enabled status everywhere',()=>{
 assert.match(sql,/create or replace function public\.connect_active_staff_v1/);
 assert.match(sql,/join public\.connect_permissions_v1 p on p\.user_id=u\.id/);
 assert.match(sql,/p\.chat_enabled is true/);
 assert.doesNotMatch(sql,/drop table|truncate table|alter table public\.users|alter table public\.connect_messages_v1/i);
});
check('Permission editing is director-only server-side and cannot grant video without chat',()=>{
 assert.match(sql,/connect_access_admin_v1/);
 assert.match(sql,/u\.role='boss' and u\.name='Александр Паюшин'/);
 assert.match(sql,/connect_set_permission_v1/);
 assert.match(sql,/if not public\.connect_access_admin_v1\(\)/);
 assert.match(sql,/p_video_enabled and not p_chat_enabled/);
 assert.match(sql,/if p_user_id=auth\.uid\(\) and not p_chat_enabled/);
});
check('Forbidden staff cannot be offered in chat invitations',()=>{
 assert.match(chat,/rpc\('connect_directory_v1'\)/);
 assert.match(sql,/join public\.connect_permissions_v1 p on p\.user_id=u\.id and p\.chat_enabled/);
 assert.match(chat,/if\(!rights\.data\?\.chat_enabled\)/);
});
check('Token server refuses chat-only members including office and service',()=>{
 assert.match(edge,/connect_permissions_v1/);
 assert.match(edge,/!permissionCheck\.data\?\.video_enabled/);
 assert.match(edge,/!permissionCheck\.data\?\.chat_enabled/);
 assert.match(edge,/auth\.getUser\(jwt\)/);
 assert.doesNotMatch(edge,/SUPABASE_SERVICE_ROLE_KEY/);
});
check('Director modal uses server RPCs and existing CRM identity',()=>{
 assert.match(ui,/connect_admin_permissions_v1/);
 assert.match(ui,/connect_set_permission_v1/);
 assert.match(ui,/ch\.checked/);
 assert.match(ui,/vi\.disabled=!ch\.checked/);
 assert.match(ui,/user\.role==='boss'&&user\.name==='Александр Паюшин'/);
 assert.doesNotMatch(ui,/signInWithPassword|createClient\(/);
});
check('JS parses and UI scripts are deferred from existing CRM',()=>{
 new Function(chat);new Function(ui);
 vm.runInNewContext(ui,{window:{},document:{getElementById:()=>null}});
 assert.match(html,/155-resanta-connect-permissions-v1\.js/);
 assert.match(html,/155-resanta-connect-permissions-v1\.css/);
});
check('Realtime notifications alert incoming messages and call invitations',()=>{
 const notify=get('assets/153-resanta-connect-notify-v1.js');
 assert.match(notify,/startRealtime\(id\)/);
 assert.match(notify,/const isVideo=videoAllowed&&/);
 assert.match(notify,/if\(rights.error\|\|!rights.data\?\.chat_enabled\)/);
 assert.match(notify,/connect_messages_v1/);
 assert.match(notify,/startsWith\('📹 Начался видеозвонок'\)/);
 assert.match(notify,/crmConnectOpenRoom136/);
 assert.match(chat,/crmConnectOpenRoom136=openInvitedRoom/);
 assert.match(get('assets/154-resanta-connect-video-v1.js'),/window\.crmConnectVideo131=\{init,chatChanged,join,rememberIncoming\}/);
 assert.match(html,/153-resanta-connect-notify-v1\.js\?v=3/);
 assert.match(html,/154-resanta-connect-video-v1\.js\?v=7/);
});
console.log('CONNECT #136 permissions: '+passed+' passed, '+failed+' failed');
if(failed)process.exitCode=1;
