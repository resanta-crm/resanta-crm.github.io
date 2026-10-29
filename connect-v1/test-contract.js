/* Node-only deterministic safety checks; no Supabase production calls. */
'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = __dirname;
const read = name => fs.readFileSync(path.join(root,name),'utf8');
const sql = read('schema-pilot.sql');
const ui = read('app.js');
const page = read('index.html');
const readme = read('README.md');
const native = fs.readFileSync(path.join(root,'..','assets','151-resanta-connect-v1.js'),'utf8');
const nativeCss = fs.readFileSync(path.join(root,'..','assets','151-resanta-connect-v1.css'),'utf8');
const crm = fs.readFileSync(path.join(root,'..','index.html'),'utf8');
const count = (s,re) => [...s.matchAll(re)].length;
const checks = [
  ['RLS applied to each chat table', () => {
    for(const name of ['connect_rooms_v1','connect_room_members_v1','connect_messages_v1'])
      assert.match(sql,new RegExp('alter table public\\.'+name+' enable row level security','i'));
  }],
  ['No anonymous access to chat tables', () => {
    assert.match(sql,/revoke all on public\.connect_rooms_v1,public\.connect_room_members_v1,public\.connect_messages_v1 from anon/i);
    assert.match(sql,/revoke all on function public\.connect_create_room_v1[\s\S]+from public, anon/i);
  }],
  ['Messages readable and writable by room members only', () => {
    assert.match(sql,/create policy connect_messages_read_v1[\s\S]+using \(public\.connect_is_member_v1\(room_id\)\)/i);
    assert.match(sql,/sender_id=auth\.uid\(\)/);
    assert.match(sql,/public\.connect_is_member_v1\(room_id\)/);
  }],
  ['Creator obtains room ownership, direct rooms stable', () => {
    assert.match(sql,/on conflict\(direct_key\) do nothing/i);
    assert.match(sql,/values\(v_id,v_me,'owner'\)/i);
  }],
  ['Roles are looked up server-side', () => {
    assert.match(sql,/select u\.role into v_role from public\.users u where u\.id=v_me/i);
    assert.match(sql,/p_kind='channel' and v_role<>'boss'/i);
    assert.match(sql,/only the group owner may invite/i);
  }],
  ['Identity is server-derived from auth.uid', () => {
    assert.ok(count(sql,/auth\.uid\(\)/g)>=4);
    assert.doesNotMatch(sql.split('\n').filter(line => !/^\s*--/.test(line)).join('\n'),/user_metadata|raw_user_meta_data/i);
  }],
  ['Prototype refuses production database', () => {
    assert.match(ui,/config\.url\.includes\(PRODUCTION_PROJECT\)/);
    assert.match(ui,/Подключение к рабочей CRM заблокировано/);
  }],
  ['Messages rendered without HTML injection', () => {
    assert.match(ui,/body\.textContent = m\.body/);
    assert.doesNotMatch(ui,/\.innerHTML\s*=/);
  }],
  ['Invitees are selected from employee directory', () => {
    assert.match(ui,/employees\.filter\(u=>u\.id!==currentUser\.id\)/);
  }],
  ['No production CRM scripts on page', () => {
    assert.doesNotMatch(page,/assets\/01-crm-core|assets\/03-triovist-routes/);
    assert.match(page,/src="\.\/config\.js"/);
    assert.match(page,/src="\.\/app\.js"/);
  }],
  ['Native CRM menu and same authenticated Supabase client', () => {
    assert.match(crm,/id="nav-connect"/);
    assert.match(crm,/id="bn-connect"/);
    assert.match(crm,/id="page-connect"/);
    assert.match(crm,/assets\/151-resanta-connect-v1\.js/);
    assert.match(native,/dbClient=\(\)=>typeof db/);
    assert.match(native,/goPage\('connect','Чаты'\)/);
    assert.doesNotMatch(native,/signInWithPassword|createClient\(/);
  }],
  ['Native text messages are XSS-safe and membership-scoped', () => {
    assert.match(native,/node\('div','',message\.body\)/);
    assert.doesNotMatch(native,/innerHTML\s*=/);
    assert.match(native,/connect_messages_v1/);
    assert.match(native,/connect_is_member|ownMember/);
    assert.ok(nativeCss.includes('#page-connect [hidden]'));
  }],
  ['Docs clarify no production rollout', () => {
    assert.match(readme,/NOT PRODUCTION READY/i);
    assert.match(readme,/Gomel is deferred/i);
  }],
];
for(const [label,fn] of checks) {
  try {fn(); console.log('PASS',label);}
  catch(e) {console.error('FAIL',label,e.message);process.exitCode=1;}
}
if(!process.exitCode) console.log('CONNECT contract checks passed:',checks.length);
