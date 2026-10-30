'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html');
const chat=read('assets/151-resanta-connect-v1.js');
const media=read('assets/152-resanta-connect-media-v1.js');
const css=read('assets/151-resanta-connect-v1.css');
const sql=read('supabase/migrations/20261030070000_connect_127_media.sql');
const cases=[
 ['Existing CRM chat and auth remain intact',()=>{
  assert.match(html,/id="nav-connect"/);assert.match(html,/id="page-connect"/);
  assert.match(chat,/dbClient=\(\)=>typeof db/);
  assert.doesNotMatch(media,/signInWithPassword|createClient\(/);
 }],
 ['Native upload and microphone buttons are available',()=>{
  for(const id of ['c127-file-input','c127-attach','c127-mic'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/152-resanta-connect-media-v1\.js/);
  assert.match(media,/getUserMedia/);assert.match(media,/MediaRecorder/);
  assert.match(media,/MAX_VOICE_MS=90000/);
 }],
 ['No background or hidden audio capture',()=>{
  assert.match(media,/document\.hidden&&recorder\)stopRecording\(true\)/);
  assert.match(media,/recWatch=setInterval\(\(\)=>discardIfNeeded\(\),400\)/);
 }],
 ['Attachments require explicit click and 10 MB cap',()=>{
  assert.match(media,/MAX_BYTES=10\*1024\*1024/);
  assert.match(media,/attach\.addEventListener\('click'/);
  assert.match(media,/createSignedUrl\(row\.file_path,120\)/);
  assert.match(media,/\.upload\(filePath,file,/);
  assert.match(media,/upsert:false/);
 }],
 ['Media messages publish transactionally',()=>{
  assert.match(media,/rpc\('connect_send_media_v1'/);
  assert.match(sql,/returns public\.connect_messages_v1/i);
  assert.match(sql,/security invoker/i);
  assert.match(sql,/insert into public\.connect_messages_v1/i);
  assert.match(sql,/insert into public\.connect_attachments_v1/i);
 }],
 ['Private bucket, MIME and access limits',()=>{
  assert.match(sql,/insert into storage\.buckets/);
  assert.match(sql,/false, 10485760/);
  assert.match(sql,/create policy connect_media_upload_v1/i);
  assert.match(sql,/create policy connect_media_read_v1/i);
  assert.match(sql,/public\.connect_is_member_v1/);
  assert.match(sql,/storage\.foldername\(name\)/);
 }],
 ['Attachment metadata is RLS protected',()=>{
  assert.match(sql,/alter table public\.connect_attachments_v1 enable row level security/i);
  assert.match(sql,/connect_attachment_read_v1/i);
  assert.match(sql,/connect_attachment_insert_v1/i);
  assert.match(sql,/sender_id=\(select auth\.uid\(\)\)/i);
 }],
 ['Old CRM tables and chat messages are not altered',()=>{
  assert.doesNotMatch(sql,/alter table public\.(?:connect_messages_v1|users|clients|visits|sales|tasks)\b/i);
  assert.doesNotMatch(sql,/drop table|truncate table/i);
 }],
 ['Messages and filenames never used as HTML',()=>{
  assert.doesNotMatch(media,/innerHTML\s*=/);
  assert.match(media,/\.textContent=String\(txt\)/);
  assert.match(chat,/node\('div','',message\.body\)/);
 }],
 ['Chat interface styles remain scoped',()=>{
  assert.match(css,/#page-connect \.c127-media/);
  assert.match(css,/#page-connect #c127-mic/);
 }]
];
let failed=0;
for(const [name,test] of cases)try{test();console.log('PASS '+name);}catch(e){failed++;console.error('FAIL '+name+' '+e.message);}
if(failed)process.exitCode=1;
else console.log('CONNECT #127 checks passed: '+cases.length);
