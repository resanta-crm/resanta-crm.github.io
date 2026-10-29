import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {STAFF_USERS,staffPermission,targetManagers,narrowKpi} from '../supabase/functions/crm-ai360-staff-read-v1/permissions.mjs';
const identity=fs.readFileSync('assets/148-resanta-ai360-staff-identity-v1.js','utf8');
const ui=fs.readFileSync('assets/144-resanta-ai360-branch-voice-v1.js','utf8');
const stt=fs.readFileSync('supabase/functions/crm-voice-transcribe-v1/index.ts','utf8');
const tts=fs.readFileSync('supabase/functions/crm-voice-yandex-tts-v1/index.ts','utf8');
const server=fs.readFileSync('supabase/functions/crm-ai360-staff-dialog-v1/index.ts','utf8');
const gateway=fs.readFileSync('supabase/functions/crm-ai360-staff-read-v1/index.ts','utf8');
const task=fs.readFileSync('supabase/functions/crm-ai360-branch-task-approval-v1/index.ts','utf8');
const page=fs.readFileSync('index.html','utf8');
const USER_IDS={
 'Руднев':'19dd9943-99ae-47c4-a39c-4f82a11059a6',
 'Ачинович':'3d935a76-c6fe-44b6-b248-fcbe58c6bf1c',
 'Шкуран':'4fd79fa0-232d-4768-8099-25f47923cc4f'
};
const create=(x='Руднев')=>{
 const id=USER_IDS[x],calls=[],nodes=[];
 const element=tag=>{
  const e={tag,style:{display:''},hidden:false,disabled:false,textContent:'',className:'',
   children:[],value:'',scrollHeight:0,handlers:{},setAttribute(){},
   append(...args){this.children.push(...args);},
   appendChild(v){this.children.push(v);return v;},
   insertBefore(v){this.children.push(v);return v;},
   querySelector(){return null;},focus(){},addEventListener(name,cb){this.handlers[name]=cb;}};
  nodes.push(e);return e;
 };
 const app=element('app'),top=element('topbar');
 const doc={hidden:false,createElement:element,head:element('head'),body:element('body'),
  getElementById:k=>k==='app'?app:null,querySelector:k=>k==='#app .topbar'?top:null,
  addEventListener(){}};
 const win={setInterval(){},addEventListener(){},crypto:{randomUUID:()=>'stub'},
  speechSynthesis:null};
 const ctx={window:win,navigator:{userAgent:'Macintosh'},document:doc,console,Intl,Date,Promise,
  currentUser:{id},currentProfile:{name:x,role:'manager',region:'Витебск'},
  db:{auth:{getSession:async()=>({data:{session:{access_token:'session'}}})},
    functions:{invoke:async(ep,{body})=>{
     calls.push({ep,body});
     if(body.kind==='capabilities')return {data:{ready:true,role:'field_manager',
      own_name:x,voice_enabled:true,real_task_creation_enabled:false,
      domains:['sales','debt','clients','tasks','routes','visits','client_detail']}};
     return {data:{mode:'staff_scoped_readonly_pilot_v1',answer_verified:true,read_only:true,
      domain:body.domain,scope:{role:'field_manager',managers:[x]},as_of:'2026-10-29',
      data:{source:'sales',month:'2026-10',managers:[{manager_name:x,plan:1000,actual:100,plan_pct:10,to_plan:900}]}}};
    }}}
 };
 vm.runInNewContext(identity,ctx);vm.runInNewContext(ui,ctx);
 return {ctx,win,calls,nodes,top,api:win.crmAI360BranchVoicePilotV1};
};
test('All three managers use the same Lera frontend and one shared voice identity',async()=>{
 for(const name of Object.keys(USER_IDS)){
  const x=create(name);
  assert.equal(x.api.allowed(),true);
  assert.equal(x.calls.length,0);
  assert.equal(x.win.crmAI360StaffIdentityV1().tier,'field_manager');
  assert.equal(x.win.crmAI360StaffIdentityV1().can_create_tasks,false);
  const launch=x.nodes.find(z=>z.className==='rsa-branch-launch');
  assert.ok(launch);assert.match(launch.textContent,/Мои клиенты/);
  await x.api.open();
  assert.equal(x.calls.length,1);assert.equal(x.calls[0].body.kind,'capabilities');
  assert.equal(x.nodes.filter(z=>z.className==='rsa-branch-task-form').length,0);
  x.api.close();
 }
});
test('Managers cannot read other managers, even by passing their names in server calls',()=>{
 for(const [name,id] of Object.entries(USER_IDS)){
  const p=staffPermission(id,{id,...STAFF_USERS[id]});
  assert.deepEqual(targetManagers(p,'sales',null),[name]);
  for(const target of Object.keys(USER_IDS))if(target!==name){
   assert.equal(targetManagers(p,'sales',target),null);
   assert.equal(targetManagers(p,'clients',target),null);
  }
  assert.equal(targetManagers(p,'gps',null),null);
  assert.equal(targetManagers(p,'promotions',null),null);
  const clean=narrowKpi({month:'2026-10',network_revenue:999,
   managers:[{manager_name:name,plan:10,actual:5},
    {manager_name:'Другой менеджер',plan:100,actual:100}]},[name]);
  assert.deepEqual(clean.managers.map(m=>m.manager_name),[name]);
  assert.doesNotMatch(JSON.stringify(clean),/Другой менеджер|network_revenue/);
 }
});
test('Shared premium speech and OpenAI text backend rechecks exact user profiles',()=>{
 for(const s of [stt,tts]){
  for(const id of Object.values(USER_IDS))assert.ok(s.includes(id),id);
  assert.match(s,/FIELD_IDS\.has\(user\.id\)/);
  assert.match(s,/region==='Витебск'/);
  assert.match(s,/!isOwner&&!isBranch&&!isField&&!isTriovist/);
 }
 assert.match(server,/staffPermission\(userId,prof\.data\)/);
 assert.match(server,/permission\.tier==='field_manager'\?\[permission\.name\]:NAMES/);
 assert.match(server,/error:'manager_outside_own_portfolio'/);
 assert.match(server,/evidence\.scope\.managers\.some\(x=>!permitted\.includes\(x\)\)/);
 assert.match(server,/p_user_id:userId/);
 assert.match(gateway,/real_task_creation_enabled:permission\.tier==='branch_director'/);
 assert.match(gateway,/voice_enabled:\['branch_director','field_manager'\]/);
});
test('Only branch director can use signed task commit; field managers cannot',()=>{
 assert.match(task,/userId!==SID/);
 assert.match(task,/perm\.tier!=='branch_director'/);
 assert.match(task,/if\(!await verify\(secret,userId/);
 assert.ok(!ui.includes("crm-ai360-branch-task-approval-v1"));
 assert.match(page,/148-resanta-ai360-staff-identity-v1\.js\?v=2/);
 assert.match(page,/144-resanta-ai360-branch-voice-v1\.js\?v=8/);
 assert.match(page,/146-resanta-ai360-branch-premium-voice-v1\.js\?v=3/);
 assert.match(page,/147-resanta-ai360-staff-unified-dialog-v1\.js\?v=3/);
});
