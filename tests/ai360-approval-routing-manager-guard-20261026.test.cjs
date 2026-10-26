'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const draft=fs.readFileSync('assets/140-resanta-ai360-task-drafts-preview-v1.js','utf8');
const core=fs.readFileSync('assets/134-resanta-voice-ai360-pilot-v1.js','utf8');
const memo='a3b9363d-40cc-4129-9d84-bf4a5e128ed7';
const client=(manager,client_id='a84979f3-1ad9-4d42-9d72-71e506971ec9')=>({
  draft_id:'preview-1',client_id,client_name:'Тестовый клиент',
  manager_name:manager,title:'Согласовать заказ',
  text:'Уточнить срок нового заказа по связанным продажам.',
  due_date:'2026-11-03',basis:'Падение закупок',expected_result:'Следующий заказ',
  criteria:'Зафиксировано в CRM'
});
function harness(){
 const calls=[],answers=[],statuses=[];
 const scope={window:{
   crypto:{randomUUID:()=>memo},
   crmEnsureFreshSessionV236166:async()=>({access_token:'fake_token'})
 },navigator:{userAgent:'Windows Chrome'},
 document:{hidden:false,getElementById:()=>({style:{display:'block'}})},
 currentUser:{id:'director'},currentProfile:{name:'Александр Паюшин',role:'boss'},
 db:{auth:{getSession:async()=>({data:{session:{access_token:'fake_token'}}})},
    functions:{invoke:async(name,{body})=>{
     calls.push({name,body});
     if(name==='crm-ai360-task-drafts-v1')return {data:{
       mode:'readonly',manager:'Шкуран',as_of:'2026-10-26',
       items:[client('Шкуран')]
     }};
     if(name==='crm-ai360-task-approval-v1')return {data:{
       mode:'ready',created:0,items:body.items
     }};
     throw Error('Unrecognized endpoint');
    }}
 }};
 vm.runInNewContext(draft,vm.createContext(scope),{filename:'draft-module.js'});
 const api=scope.window.crmAI360TaskDraftsHandleV1;
 const internals=scope.window.crmAI360TaskDraftsPreviewInternalsV1;
 const ui={answer:x=>answers.push(String(x)),textStatus:x=>statuses.push(String(x))};
 const tick=()=>new Promise(r=>setTimeout(r,20));
 return {api,internals,ui,calls,answers,statuses,tick};
}
(async()=>{
 const h=harness();
 const commands=['Согласую первое поручение для Руднева.',
   'Согласовать первое поручение для Руднева',
   'Утверждаю первое поручение для Руднева',
   'Одобряю первое поручение для Руднева',
   'Согласен на первое поручение для Руднева'];
 for(const cmd of commands){
   assert.equal(h.internals.approvalIntent(cmd),true,'missed natural approval: '+cmd);
   assert.equal(h.api(cmd,h.ui),true,'must consume approval without drafts: '+cmd);
   assert(h.answers.at(-1).includes('Сначала попроси Леру предложить'));
 }
 assert.equal(h.calls.length,0,'no network calls on approval without draft');
 assert.equal(h.api('Предложи поручения для Шкурана',h.ui),true);
 await h.tick();
 assert.equal(h.calls.length,1);
 assert.equal(h.api('Согласую первое поручение для Руднева.',h.ui),true);
 await h.tick();
 assert.equal(h.calls.length,1,'cannot validate active Shkuran draft for Rudnev');
 assert(h.answers.at(-1).includes('не совпадает'));
 assert.equal(h.api('Согласовать первое поручение для Шкурана',h.ui),true);
 await h.tick();
 assert.equal(h.calls.length,2);
 assert.equal(h.calls[1].body.kind,'validate');
 assert.equal(h.calls[1].body.items[0].manager_name,'Шкуран');
 assert.equal(h.calls.filter(x=>x.body.kind==='commit').length,0);
 assert.equal(h.api('Не подтверждаю',h.ui),true);
 assert.equal(h.calls.length,2,'rejection must not create tasks');
 assert.equal(h.internals.specifiedManager('согласовать первое для Руднева').name,'Руднев');
 assert.equal(h.internals.specifiedManager('согласовать первое для Михеева').kind,'unknown');
 assert.equal(h.internals.specifiedManager('согласую первое для Руднева и Шкурана').kind,'ambiguous');
 assert(core.includes('if(approvalCommand)'), 'core must intercept failed/missing approval module');
 assert(core.includes('if (window.crmAI360TaskDraftsHandleV1(query, {answer, textStatus})) return;'),
   'draft module stays first in the command path');
 console.log('AI360 approval routing: natural first-person forms, no draft, cross-manager rejection, exact validation and no writes PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
