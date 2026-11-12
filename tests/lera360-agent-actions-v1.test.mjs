import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const browser=fs.readFileSync('assets/219-lera360-agent-actions-v1.js','utf8');
const server=fs.readFileSync('supabase/functions/crm-ai360-actions-v1/index.ts','utf8');
const director=fs.readFileSync('assets/134-resanta-voice-ai360-pilot-v1.js','utf8');
const staff=fs.readFileSync('assets/144-resanta-ai360-branch-voice-v1.js','utf8');
const loader=fs.readFileSync('index.html','utf8');
const capture=fs.readFileSync('assets/135-resanta-voice-capture-fix-v2.js','utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(prepareResponse){
 const calls=[],spoken=[],status=[],listeners={},ui={answer:v=>spoken.push(v),textStatus:v=>status.push(v)};
 const app={style:{display:'block'}};
 function el(){
  const hooks={},node={style:{},className:'',children:[],textContent:'',
   addEventListener:(name,fn)=>{hooks[name]=fn;},
   append(...parts){this.children.push(...parts);},
   remove(){this.removed=true;},hooks};
  return node;
 }
 const host=el();
 const pane={classList:{contains:x=>x==='rsa-branch-panel'},querySelector:x=>x.includes('.rsa-branch-log')?host:null};
 const document={hidden:false,addEventListener:(name,fn)=>{listeners[name]=fn;},
   getElementById:x=>x==='app'?app:null,
   querySelector:x=>x.includes('.rva-window')?pane:null,
   createElement:el};
 const root={addEventListener:(name,fn)=>{listeners[name]=fn;},
   crmEnsureFreshSessionV236166:async()=>({access_token:'test'})};
 const db={functions:{invoke:async(name,{body})=>{
  calls.push({name,body});
  if(body.kind==='prepare')return{data:prepareResponse};
  if(body.kind==='commit')return{data:{mode:body.draft.action==='chat'?'created_chat':'created_task',
    created:1,assigned_to:'Сидарович К.Н.',room_id:'fake-room'}};}}};
 const ctx={window:root,document,db,currentUser:{id:'director-id'},
   console,Date,String,RegExp,Promise,setTimeout};
 vm.runInNewContext(browser,ctx,{filename:'action-bridge'});
 return{root,document,ctx,calls,spoken,status,host,ui,listeners};
}
const draft={action:'task',assignee_id:'staff-id',assignee_name:'Сидарович К.Н.',
 title:'Позвонить руководителю',details:'Перезвонить в согласованное время',
 due_date:'2026-11-13',due_time:'10:00',source:'lera_agent360_confirmed_v1'};
const prepared={mode:'prepared',draft,summary:'Сидаровичу позвонить завтра в десять',
 approval_token:'fake-proof',expires_at:new Date(Date.now()+120000).toISOString(),requires_confirmation:true,created:0};
test('No action request, mic, chat or network on module initialization',()=>{
 const f=fixture(prepared);
 assert.equal(f.calls.length,0);
 assert.equal(f.host.children.length,0);
 assert.equal(f.root.crmAI360ActionHandleV1('Какая выручка по клиенту?',f.ui),false);
 assert.equal(f.calls.length,0);
});
test('Natural task request only prepares: explicit affirmative then commits once',async()=>{
 const f=fixture(prepared);
 assert.equal(f.root.crmAI360ActionHandleV1('Лера, поставь Сидоровичу задачу позвонить завтра в 10',f.ui),true);
 await tick();await tick();await tick();
 assert.deepEqual(f.calls.map(x=>x.body.kind),['prepare']);
 assert.ok(f.spoken.some(x=>x.includes('Создать?')));
 assert.equal(f.root.crmAI360ActionHandleV1('да',f.ui),true);
 await tick();await tick();await tick();
 assert.deepEqual(f.calls.map(x=>x.body.kind),['prepare','commit']);
 assert.equal(f.calls[1].body.confirmation,'подтверждаю');
 assert.ok(f.spoken.some(x=>x.includes('действительно создано')));
 assert.equal(f.root.crmAI360ActionHandleV1('да',f.ui),false,'no repeated confirmation');
});
test('Cancel and unrelated question never commit an action',async()=>{
 const f=fixture(prepared);
 f.root.crmAI360ActionHandleV1('Создай чат с Рудневым',f.ui);
 await tick();await tick();
 assert.equal(f.root.crmAI360ActionHandleV1('отмена',f.ui),true);
 assert.deepEqual(f.calls.map(x=>x.body.kind),['prepare']);
 f.root.crmAI360ActionHandleV1('Создай чат с Рудневым',f.ui);
 await tick();await tick();
 assert.equal(f.root.crmAI360ActionHandleV1('Почему падают продажи?',f.ui),false);
 assert.equal(f.root.crmAI360ActionHandleV1('да',f.ui),false);
 assert.ok(f.calls.every(x=>x.body.kind!=='commit'));
});
test('Closing or changing identity clears pending approval',async()=>{
 const f=fixture(prepared);
 f.root.crmAI360ActionHandleV1('Создай чат с Рудневым',f.ui);
 await tick();await tick();
 f.document.hidden=true;f.listeners.visibilitychange();
 f.document.hidden=false;f.ctx.currentUser={id:'other'};
 assert.equal(f.root.crmAI360ActionHandleV1('да',f.ui),false);
 assert.ok(f.calls.every(x=>x.body.kind!=='commit'));
});
test('Server performs only signed explicit two-phase operations with inherited CRM access',()=>{
 assert.match(server,/svc\.auth\.getUser\(jwt\)/);
 assert.match(server,/async function verifyToken/);
 assert.match(server,/explicit_confirmation_required/);
 assert.match(server,/body\?\.confirmation!=='подтверждаю'/);
 assert.match(server,/connect_create_room_v1/);
 assert.match(server,/global:\{headers:\{Authorization:'Bearer '\+jwt\}\}/);
 assert.match(server,/connect_permissions_v1/);
 assert.match(server,/connect_room_members_v1/);
 assert.match(server,/stableTaskId/);
 assert.match(server,/\.eq\('id',id\)/);
 assert.match(server,/task_write_verification_failed/);
 assert.doesNotMatch(browser,/SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|createClient\(/);
 assert.doesNotMatch(browser,/setInterval|MutationObserver|getUserMedia|MediaRecorder/);
});
test('One Lera: director and staff voice both route to signed action bridge',()=>{
 assert.match(director,/crmAI360ActionHandleV1\?\.\(query,\{answer,textStatus\}\)/);
 assert.match(staff,/crmAI360ActionHandleV1\?\.\(question,\{show,setStatus,authorized:panelVisible\}\)/);
 assert.match(capture,/__resantaAI360ActionBusyV1/);
 assert.match(staff,/crmAI360ActionBusyV1\?\.\(\)/);
 assert.match(loader,/219-lera360-agent-actions-v1\.js\?v=20261112a/);
 assert.ok(loader.indexOf('219-lera360-agent-actions-v1.js')<loader.indexOf('137-resanta-ai360-lazy-launch-v1.js'));
});
