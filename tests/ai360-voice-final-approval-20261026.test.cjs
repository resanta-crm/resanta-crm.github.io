'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const client=fs.readFileSync('assets/140-resanta-ai360-task-drafts-preview-v1.js','utf8');
const server=fs.readFileSync('supabase/functions/crm-ai360-task-approval-v1/index.ts','utf8');
const id='a84979f3-1ad9-4d42-9d72-71e506971ec9';
const approvalId='52e8ea87-99c1-44db-ae99-f2b5c544e6df';
const sample={draft_id:'preview-1',client_id:id,client_name:'Клиент А',
 manager_name:'Руднев',title:'Восстановить продажи',
 text:'Связаться с клиентом и уточнить следующий заказ',due_date:'2026-11-03',
 basis:'Связанные закупки',expected_result:'Согласован заказ',criteria:'Отчёт в CRM',source:'purchase_history'};
const sampleTwo={...sample,draft_id:'preview-2',
 client_id:'b049792f-9778-4d4a-a0d6-94444f876dcc',client_name:'Клиент Б'};
function setup(opts={}){
 const calls=[],answers=[],statuses=[];
 const ctx={
  console,
  window:{
   crypto:{randomUUID:()=>approvalId},
   crmEnsureFreshSessionV236166:async()=>({access_token:'mock'}),
  },navigator:{userAgent:opts.android?'Android':'Windows'},
  document:{hidden:false,getElementById:()=>({style:{display:'block'}})},
  currentUser:{id:'boss'},currentProfile:{name:'Александр Паюшин',role:opts.guest?'manager':'boss'},
  db:{auth:{getSession:async()=>({data:{session:{access_token:'mock'}}})},
      functions:{invoke:async(name,{body})=>{
       calls.push({name,body});
       if(name==='crm-ai360-task-drafts-v1')return {data:{
        mode:'readonly',manager:'Руднев',as_of:'2026-10-26',items:[sample,sampleTwo]}};
       if(name==='crm-ai360-task-approval-v1'){
        if(body.kind==='validate')return {data:{mode:'ready',created:0,
          items:body.items.map(x=>({...x}))}};
        if(body.kind==='commit_test')return opts.failCommit?
          {error:{message:'connection_lost'}}:
          {data:{mode:'test_saved',saved:body.items.length,created:0,test_ids:body.items.map(x=>x.client_id)}};
       }
       throw Error('unexpected invocation');
      }}}
 };
 vm.runInNewContext(client,vm.createContext(ctx),{filename:'ai360-approval-client.js'});
 const handler=ctx.window.crmAI360TaskDraftsHandleV1;
 const ui={answer:x=>answers.push(String(x)),textStatus:x=>statuses.push(String(x))};
 const tick=()=>new Promise(ok=>setTimeout(ok,15));
 return {handler,ui,calls,answers,statuses,tick};
}
(async()=>{
 const a=setup();
 assert.equal(a.handler('Лера, предложи три поручения для Руднева',a.ui),true);
 await a.tick();
 assert(a.answers.at(-1).includes('НИЧЕГО НЕ СОХРАНЕНО'));
 assert.equal(a.calls.length,1);
 assert.equal(a.handler('согласовать первое и второе',a.ui),true);
 await a.tick();
 assert.equal(a.calls.length,2);
 assert.equal(a.calls[1].body.kind,'validate');
 assert.equal(a.calls[1].body.items.length,2);
 assert(a.answers.at(-1).includes('Менеджеры их НЕ увидят'));
 assert(!a.calls.some(x=>x.body.kind==='commit'),'no real commit mode allowed');
 assert.equal(a.handler('да',a.ui),true);
 assert.equal(a.calls.length,2,'a generic yes must not commit');
 assert(a.answers.at(-1).includes('скажи точно'));
 assert.equal(a.calls.length,2);
 assert.equal(a.handler('подтверждаю сохранение тестовых поручений',a.ui),true);
 await a.tick();
 assert.equal(a.calls.length,3);
 assert.equal(a.calls[2].body.confirmation,'подтверждаю сохранение тестовых поручений');
 assert.equal(a.calls[2].body.approval_id,approvalId);
 assert.equal(a.calls[2].body.kind,'commit_test');
 assert(a.answers.at(-1).includes('2 поручений сохранено'));
 assert(a.answers.at(-1).includes('Рабочих задач создано: 0'));
 assert.equal(a.calls.filter(x=>x.body.kind==='commit').length,0);
 assert.equal(a.handler('подтверждаю сохранение тестовых поручений',a.ui),true);
 assert.equal(a.calls.length,3,'confirmation replay cannot create again in same page');
 assert(a.answers.at(-1).includes('Нет тестовых черновиков'));
 a.handler('подтверждаю создание поручений',a.ui);
 assert.equal(a.calls.length,3,'old production command blocked');
 const b=setup();
 b.handler('предложи поручения для Руднева',b.ui);await b.tick();
 b.handler('согласовать первое',b.ui);await b.tick();
 b.handler('отмена создания',b.ui);
 assert.equal(b.calls.length,2,'cancellation must not commit');
 b.handler('подтверждаю сохранение тестовых поручений',b.ui);
 assert.equal(b.calls.length,2);
 const c=setup();
 c.handler('предложи поручения для Руднева',c.ui);await c.tick();
 c.handler('согласовать первое',c.ui);await c.tick();
 const id0=c.calls[1].body.approval_id;
 c.handler('измени срок первого на 10 ноября 2026',c.ui);
 c.handler('подтверждаю сохранение тестовых поручений',c.ui);
 assert.equal(c.calls.length,2,'changing date must invalidate pending confirmation');
 c.handler('согласовать первое',c.ui);await c.tick();
 assert(c.calls[2].body.items[0].due_date==='2026-11-10');
 const d=setup({guest:true});
 assert.equal(d.handler('предложи поручения для Руднева',d.ui),false);
 const e=setup({android:true});
 assert.equal(e.handler,undefined);
 assert(!/db\.from\(['"]tasks['"]\)\.insert/.test(client),'browser may not write tasks');
 for(const needed of ['user.id!==OWNER_ID','profile.data?.role!==\'boss\'',
  'manager_not_found','client_ownership_changed','conflicting_task_or_route',
  'TEST_CONFIRMATION','approval_id_conflict',
  "const TEST_TABLE='ai360_voice_test_drafts_v1'", "mode:'test_saved'"]){
   assert(server.includes(needed),'approval backend missing safety '+needed);
 }
 console.log('AI360 voice approval: two explicit steps; no yes, cancel, edit, role/Android and idempotent intent PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
