import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const backend=fs.readFileSync('supabase/functions/crm-ai360-branch-task-approval-v1/index.ts','utf8');
const ui=fs.readFileSync('assets/145-resanta-ai360-branch-task-approval-v1.js','utf8');
const voice=fs.readFileSync('assets/144-resanta-ai360-branch-voice-v1.js','utf8');
const html=fs.readFileSync('index.html','utf8');
test('Real writes require exact Sidarovich account, profile and Vitebsk manager',()=>{
 for(const x of [
  "userId!==SID","staffPermission(userId,profile.data)","perm.tier!=='branch_director'",
  "targetManagers(perm,'tasks',draft.manager_name)",
  ".eq('role','manager').eq('region','Витебск')",
  ".eq('manager_name',manager.name)","client_not_assigned_to_manager",
  "source:SOURCE","const SOURCE='ai360_branch_voice_approved'"
 ]){
  assert.ok(backend.includes(x)||ui.includes(x),x);
 }
 assert.doesNotMatch(backend,/OWNER_ID|александр паюшин/);
 assert.match(backend,/confirm.*=|CONFIRM='подтверждаю создание поручения'/i);
});
test('No task write before a signed, timely, exact second confirmation',()=>{
 assert.match(backend,/body\.kind==='validate'/);
 assert.match(backend,/makeApprovalToken|await sign\(secret,userId/);
 assert.match(backend,/if\(body\.kind==='commit'&&body\.confirmation!==CONFIRM\)/);
 const verifyPos=backend.indexOf('if(!await verify(secret,userId,body.approval_id');
 const writePos=backend.indexOf(".from('tasks').insert(row)");
 assert.ok(verifyPos>0&&writePos>verifyPos);
 assert.match(backend,/expiry<=now\|\|expiry>now\+600000/);
 assert.match(backend,/const id=await taskId\(canonical\)/);
 assert.match(backend,/if\(duplicate\.data\?\.length\)/);
 assert.match(backend,/if\(prior\.data\?\.length\)/);
 assert.match(backend,/review_status:'approved'/);
 assert.match(backend,/reviewed_by:profile\.data\.name/);
});
test('Cannot create tasks for archived client or forged client ID',()=>{
 assert.ok(backend.includes("const escaped=draft.client_name.replace("));
 assert.match(backend,/\.ilike\('name',escaped\)\.eq\('manager_name',manager\.name\)/);
 assert.match(backend,/c\.data\[0\]\.is_archived\|\|c\.data\[0\]\.to_delete/);
 assert.doesNotMatch(backend,/body\.client_id|body\.manager_id/);
 assert.match(backend,/client_id:client\?\.id\|\|null/);
});
function mock({id='ba55dfe5-7e48-4f1f-b40e-674c7752fe1a',name='Сидарович К.Н.'}={}){
 const calls=[],items=[];
 const make=(type='div')=>{
  const item={tag:type,style:{},listeners:{},children:[],value:'',textContent:'',disabled:false,
   append(...a){this.children.push(...a);for(const i of a)i.parentNode=this;},
   appendChild(i){this.children.push(i);i.parentNode=this;return i;},
   insertBefore(i){this.children.push(i);i.parentNode=this;},
   addEventListener(n,fn){this.listeners[n]=fn;},
   setAttribute(){},focus(){},querySelector(){return null},get hidden(){return this._hidden||false;},
   set hidden(v){this._hidden=v;},get nextSibling(){return null}};
  items.push(item);return item;
 };
 const doc={hidden:false,getElementById:()=>({style:{display:'block'}}),createElement:make};
 const log=make('div'),status=make('div'),panel=make('section');
 panel.querySelector=selector=>selector==='.rsa-branch-log'?log:
   selector==='[data-rsa-task-status]'?status:selector==='.rsa-branch-task-actions'?make('div'):null;
 panel.appendChild(log);
 const root={
  crypto:{randomUUID:()=>'33333333-3333-4333-8333-333333333333'},
  addEventListener(){},setInterval(){},crmEnsureFreshSessionV236166:async()=>({access_token:'valid'})
 };
 const ctx={window:root,navigator:{userAgent:'Macintosh'},document:doc,
  currentUser:{id},currentProfile:{name,role:'boss',region:'Витебск'},console,
  Intl,Date,Promise,db:{auth:{getSession:async()=>({data:{session:{access_token:'valid'}}})},
   functions:{invoke:async(endpoint,{body})=>{
    calls.push({endpoint,body});
    if(body.kind==='validate')return {data:{mode:'ready_branch',created:0,
     approval_token:'signed-token-for-test',
     proposal:{manager_name:body.manager_name,client_name:body.client_name,title:body.title,
      text:body.text,due_date:body.due_date,expected_result:body.expected_result}}};
    return {data:{mode:'created_branch',created:1,assigned_to:body.manager_name}};
   }}}};
 vm.runInNewContext(ui,ctx);
 if(root.crmAI360BranchTaskMountV1)root.crmAI360BranchTaskMountV1(panel);
 const find=(type)=>items.filter(x=>x.tag===type);
 return {root,panel,items,calls,find,status};
}
test('No requests on script load, pilot hidden from other users',()=>{
 const sid=mock(),other=mock({id:'544fb1e2-ef70-44de-bc62-e0e1596a4bfc',name:'Александр Паюшин'});
 assert.equal(sid.calls.length,0);
 assert.equal(other.calls.length,0);
 assert.equal(other.root.crmAI360BranchTaskHandleV1('Создай поручение Рудневу'),false);
 assert.equal(other.find('section').length,1);
});
test('A voiced task opens a draft, validates, then requires explicit confirmation',async()=>{
 const x=mock();
 assert.equal(x.root.crmAI360BranchTaskHandleV1('Создай поручение Рудневу: Проверить матрицу клиента'),true);
 assert.equal(x.calls.length,0);
 const manager=x.find('select')[0];
 const input=x.find('input');
 const textarea=x.find('textarea')[0];
 const title=input.find(z=>z.maxLength===110);
 const due=input.find(z=>z.type==='date');
 assert.equal(manager.value,'Руднев');
 assert.equal(title.value,'Проверить матрицу клиента');
 assert.equal(textarea.value,'Проверить матрицу клиента');
 due.value='2026-11-04';
 // Tiny UI test cannot access the internal validate button directly by node text.
 const validateButton=x.find('button').find(z=>z.textContent==='1. Проверить');
 const commitButton=x.find('button').find(z=>z.textContent==='2. Подтверждаю создание поручения');
 assert.ok(validateButton&&commitButton);
 assert.equal(commitButton.disabled,true);
 validateButton.listeners.click();
 await new Promise(r=>setTimeout(r,25));
 assert.equal(x.calls.length,1);
 assert.equal(x.calls[0].endpoint,'crm-ai360-branch-task-approval-v1');
 assert.equal(x.calls[0].body.kind,'validate');
 assert.equal(commitButton.disabled,false);
 assert.equal(x.root.crmAI360BranchTaskHandleV1('да'),false);
 assert.equal(x.calls.length,1);
 x.root.crmAI360BranchTaskHandleV1('подтверждаю создание поручения');
 await new Promise(r=>setTimeout(r,25));
 assert.equal(x.calls.length,2);
 assert.equal(x.calls[1].body.kind,'commit');
 assert.equal(x.calls[1].body.confirmation,'подтверждаю создание поручения');
 assert.equal(x.calls[1].body.approval_token,'signed-token-for-test');
 assert.equal(commitButton.disabled,true);
});
test('Changes after validation invalidate confirmation proof',async()=>{
 const x=mock();
 x.root.crmAI360BranchTaskHandleV1('Создай поручение Ачинович: Связаться с клиентом и подтвердить заказ');
 const due=x.find('input').find(z=>z.type==='date');due.value='2026-11-04';
 const validateButton=x.find('button').find(z=>z.textContent==='1. Проверить');
 validateButton.listeners.click();
 await new Promise(r=>setTimeout(r,25));
 assert.equal(x.calls.length,1);
 const txt=x.find('textarea')[0];
 txt.value='Назначить другой адрес без согласования';
 txt.listeners.input();
 assert.equal(x.root.crmAI360BranchTaskHandleV1('подтверждаю создание поручения'),true);
 await new Promise(r=>setTimeout(r,15));
 assert.equal(x.calls.length,1,'no writes on edited drafts');
});
test('Old director pilot stays separate and the new script is cache-busted',()=>{
 assert.match(html,/144-resanta-ai360-branch-voice-v1\.js\?v=5/);
 assert.match(html,/145-resanta-ai360-branch-task-approval-v1\.js\?v=1/);
 assert.match(html,/137-resanta-ai360-lazy-launch-v1\.js\?v=55/);
 assert.match(voice,/crmAI360BranchTaskHandleV1\?\.\(question\)/);
 assert.match(voice,/crmAI360BranchTaskMountV1\?\.\(panel\)/);
 assert.match(voice,/crmAI360BranchTaskResetV1\?\.\(\)/);
 assert.doesNotMatch(ui,/\.from\(['"]tasks['"]\)\.insert/);
 assert.doesNotMatch(ui,/localStorage/);
});
