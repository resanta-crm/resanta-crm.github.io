import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const path='assets/140-resanta-ai360-task-drafts-preview-v1.js';
const uiSource=fs.readFileSync(path,'utf8');
const server=fs.readFileSync('supabase/functions/crm-ai360-task-real-approval-v1/index.ts','utf8');
test('Real task server must authenticate director and recheck ownership, live sources, duplicates',()=>{
 for(const expected of [
  "identity=await svc.auth.getUser(token)", "user.id!==OWNER_ID",
  "profile.data?.role!=='boss'", "client_ownership_changed",
  "conflicting_task_or_route", "crm_ai360_operations_snapshot_v1",
  "proposal_expired", "validDate(x.due_date,day)",
  "stableTaskId(", "const SOURCE='ai360_voice_approved'",
  "confirmation!==TEST_CONFIRMATION", "body.kind!=='commit_real'",
  ".from('tasks').insert(rows)", "review_status:'approved'"
 ]) assert.ok(server.includes(expected),expected);
 assert.ok(server.indexOf("if(body.kind!=='commit_real')")<server.indexOf(".from('tasks').insert(rows)"));
 assert.ok(!server.includes('ai360_voice_test_drafts_v1'));
});
test('No task is created without separate exact per-proposal confirmation',async()=>{
 const calls=[],answers=[];
 const C='11111111-1111-4111-8111-111111111111',A='22222222-2222-4222-8222-222222222222';
 const sample={client_id:C,client_name:'МИСАС ООО',manager_name:'Руднев',
   title:'Разобраться со снижением закупок',text:'Уточнить у клиента причину снижения заказов.',
   due_date:'2026-11-04',basis:'Клиент снизил закупки',expected_result:'Названа причина и следующий шаг.',
   criteria:'Комментарий в CRM',source:'crm_ai360_operations_snapshot_v1'};
 const serverCalls={
  'crm-ai360-task-drafts-v1':body=>({mode:'readonly',manager:'Руднев',as_of:'2026-10-29',items:[sample]}),
  'crm-ai360-task-real-approval-v1':body=>{
    if(body.kind==='validate')return {mode:'ready_real',created:0,items:[{...sample}]};
    if(body.kind==='commit_real')return {mode:'created_real',created:1,task_ids:[A],visible_to_manager:true};
    throw new Error('unexpected real action');
  },
  'crm-ai360-task-approval-v1':body=>({mode:'ready',created:0,items:[{...sample}]})
 };
 const ctx={window:{crypto:{randomUUID:()=>A},addEventListener:()=>{}},
  navigator:{userAgent:'Macintosh'},document:{hidden:false,getElementById:()=>({style:{display:'block'}})},
  currentUser:{id:'director'},currentProfile:{role:'boss',name:'Александр Паюшин'},
  db:{auth:{getSession:async()=>({data:{session:{access_token:'token'}}})},
    functions:{invoke:async(name,{body})=>{
     calls.push({name,body});return {data:serverCalls[name](body)};
    }}},setTimeout,Promise,console};
 vm.runInNewContext(uiSource,ctx);
 const ui={answer:(s)=>answers.push(String(s)),textStatus:()=>{}};
 const say=async phrase=>{assert.equal(ctx.window.crmAI360TaskDraftsHandleV1(phrase,ui),true,phrase);
   await new Promise(r=>setTimeout(r,55));};
 assert.equal(calls.length,0,'no requests on script load');
 await say('Подготовь реальные поручения для Руднева');
 assert.equal(calls.length,1);
 assert.equal(calls[0].name,'crm-ai360-task-drafts-v1');
 await say('Согласую первое');
 assert.equal(calls.length,2);
 assert.equal(calls[1].name,'crm-ai360-task-real-approval-v1');
 assert.equal(calls[1].body.kind,'validate');
 assert.match(answers.at(-1),/НИЧЕГО НЕ СОЗДАНО/);
 await say('да');
 assert.equal(calls.length,2,'simple "yes" must never create a live task');
 await say('Подтверждаю создание поручений');
 assert.equal(calls.length,3);
 assert.equal(calls[2].name,'crm-ai360-task-real-approval-v1');
 assert.equal(calls[2].body.kind,'commit_real');
 assert.equal(calls[2].body.confirmation,'подтверждаю создание поручений');
 assert.equal(calls[2].body.approval_id,A,'same id after validation');
 assert.equal(calls[2].body.items[0].client_id,C);
 assert.match(answers.at(-1),/созданы 1 реальных поручений/);
});
test('Test approvals remain separate from real task endpoint',()=>{
 assert.ok(uiSource.includes("const APPROVAL_ENDPOINT='crm-ai360-task-approval-v1'"));
 assert.ok(uiSource.includes("const REAL_APPROVAL_ENDPOINT='crm-ai360-task-real-approval-v1'"));
 assert.ok(uiSource.includes("realMode=/(?:реальн|настоящ|рабоч|боев)/i.test(q)"));
 assert.ok(uiSource.includes("live?'commit_real':'commit_test'"));
});
