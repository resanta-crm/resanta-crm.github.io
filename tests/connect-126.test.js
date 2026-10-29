'use strict';
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html');
const app=read('assets/151-resanta-connect-v1.js');
const css=read('assets/151-resanta-connect-v1.css');
const schema=read('supabase/migrations/20261029190000_connect_v1.sql');
const perf=read('supabase/migrations/20261029191000_connect_v1_perf.sql');
const checks=[
 ['Native section and desktop/mobile nav',()=>{
  for(const id of ['nav-connect','bn-connect','page-connect','c126-compose','c126-overlay'])
   assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/assets\/151-resanta-connect-v1\.js/);
  assert.match(html,/assets\/151-resanta-connect-v1\.css/);
 }],
 ['Existing auth, never new login',()=>{
  assert.match(app,/dbClient=\(\)=>typeof db/);
  assert.match(app,/goPage\('connect','Чаты'\)/);
  assert.match(app,/auth\.getUser\(\)/);
  assert.doesNotMatch(app,/signInWithPassword|createClient\(/);
 }],
 ['No background requests on CRM login',()=>{
  assert.match(app,/window\.crmConnectOpen126=open/);
  assert.doesNotMatch(app,/setInterval\(\s*open/);
 }],
 ['Messages safe from HTML injection',()=>{
  assert.match(app,/node\('div','',message\.body\)/);
  assert.doesNotMatch(app,/innerHTML\s*=/);
 }],
 ['All separate tables enforce RLS',()=>{
  for(const name of ['connect_rooms_v1','connect_room_members_v1','connect_messages_v1'])
   assert.match(schema,new RegExp('alter table public\\.'+name+' enable row level security','i'));
 }],
 ['Anon has no access; staff scoped by membership',()=>{
  assert.match(schema,/revoke all on public\.connect_rooms_v1,public\.connect_room_members_v1,public\.connect_messages_v1 from anon/i);
  assert.match(schema,/create policy connect_messages_read_v1[\s\S]+using \(public\.connect_is_member_v1\(room_id\)\)/i);
  assert.match(schema,/connect_messages_write_v1[\s\S]+sender_id=auth\.uid\(\)/i);
  assert.match(schema,/revoke all on function public\.connect_create_room_v1[\s\S]+from public, anon/i);
 }],
 ['Rooms use server-side authenticated identity',()=>{
  assert.match(schema,/v_me uuid:=auth\.uid\(\)/i);
  assert.match(schema,/only the group owner may invite/i);
  assert.match(schema,/p_kind='channel' and v_role<>'boss'/i);
  assert.match(schema,/on conflict\(direct_key\) do nothing/i);
 }],
 ['No existing CRM schema modified',()=>{
  assert.doesNotMatch(schema+'\n'+perf,/drop table|truncate table|alter table public\.(users|clients|visits|tasks)\b/i);
 }],
 ['Only scoped CSS',()=>{
  assert.match(css,/#page-connect/);
  assert.doesNotMatch(css,/(^|\n)\s*(body|\.sidebar|\.main|\.page)\s*{/);
 }],
 ['Read-only auth checks after logout',()=>{
  assert.match(app,/style\?\.display!=='none'/);
 }]
];
for(const [name,fn] of checks){
 try{fn();console.log('PASS',name);}
 catch(e){console.error('FAIL',name,e.message);process.exitCode=1;}
}
if(!process.exitCode)console.log('CONNECT native CRM checks:',checks.length,'passed');
