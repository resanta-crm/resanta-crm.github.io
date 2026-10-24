'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const draft=fs.readFileSync('assets/140-resanta-ai360-task-drafts-preview-v1.js','utf8');
const voice=fs.readFileSync('assets/134-resanta-voice-ai360-pilot-v1.js','utf8');
const loader=fs.readFileSync('assets/137-resanta-ai360-lazy-launch-v1.js','utf8');
const server=fs.readFileSync('supabase/functions/crm-ai360-task-drafts-v1/index.ts','utf8');
assert(voice.indexOf('crmAI360TaskDraftsHandleV1')<voice.indexOf('crmAI360SalesHandleV1'));
assert(loader.includes('140-resanta-ai360-task-drafts-preview-v1.js'));
assert(loader.includes('if(/Android/i.test(navigator.userAgent'));
for(const source of [server,draft]){
 assert(!/\.(?:insert|update|delete|upsert|remove)\s*\(/.test(source),
  'read-only stage must not write to CRM');
}
for(const s of ["user.id!==OWNER_ID","profile.data?.role!=='boss'","VITEBSK_REGIONS","crm_ai360_operations_snapshot_v1",
   "client_verification_unavailable","task_verification_unavailable","route_verification_unavailable",
   "verification_incomplete","mode:'readonly'"])assert(server.includes(s),'missing server safety: '+s);
assert(/CREATE|DROP|ALTER|TRUNCATE/.test(server)===false,'server stage must never include DDL');
function mock(opts={}){
 const seen=[],lines=[],statuses=[];
 const ui={answer:(t)=>lines.push(String(t)),textStatus:(t)=>statuses.push(String(t))};
 const state={
  window:{
   crmEnsureFreshSessionV236166:async()=>({access_token:'valid-session'}),
   crmAI360StaffResolveV1:{resolve:(q,staff)=>/руднев/i.test(q)
    ?{kind:'exact',manager:'Иван Руднев'}:{kind:'unknown'}}
  },
  navigator:{userAgent:opts.android?'Android':'Windows'},
  document:{hidden:false,getElementById:(id)=>id==='app'?{style:{display:'block'}}:null},
  currentUser:{id:'director'},currentProfile:{role:opts.guest?'manager':'boss',name:'Александр Паюшин'},
  db:{auth:{getSession:async()=>({data:{session:{access_token:'valid-session'}}})},
   functions:{invoke:async(name,{body})=>{
    seen.push({name,body});
    if(name!=='crm-ai360-task-drafts-v1')throw Error('unknown endpoint');
    if(body.kind==='directory')return {data:{staff:[{name:'Иван Руднев',role:'manager'}]}};
    if(body.kind==='preview')return {data:{
     mode:opts.badMode?'write':'readonly',
     as_of:'2026-10-24',items:[{
      draft_id:'preview-1',client_id:'example-client',client_name:'Клиент А',
      manager_name:opts.foreign?'Посторонний менеджер':'Иван Руднев',
      title:'Восстановить контакт',text:'Позвонить клиенту',
      basis:'Снижение связанных продаж',expected_result:'Результат звонка',
      criteria:'Запись в CRM',due_date:'2026-10-29',source:'purchase_history'
     }]
    }};
    throw Error('unexpected request');
   }}}
 };
 vm.runInNewContext(draft,vm.createContext(state),{filename:'140-task-drafts.js'});
 return {handler:state.window.crmAI360TaskDraftsHandleV1,
  internals:state.window.crmAI360TaskDraftsPreviewInternalsV1,lines,statuses,seen,ui,state};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
(async()=>{
 const a=mock();
 assert.equal(a.handler('лера предложи поручения для руднева',a.ui),true);
 await tick();
 assert.equal(a.seen.filter(x=>x.body.kind==='directory').length,1);
 assert.equal(a.seen.filter(x=>x.body.kind==='preview').length,1);
 assert(a.lines.some(s=>s.includes('НИЧЕГО НЕ СОХРАНЕНО')));
 assert(a.lines.some(s=>s.includes('Клиент А')));
 assert.equal(a.handler('измени срок первого на 29 октября',a.ui),true);
 assert(a.lines.at(-1).includes('2026-10-29'));
 assert.equal(a.handler('согласовать первое',a.ui),true);
 assert(a.lines.at(-1).includes('НЕ согласование'));
 assert.equal(a.seen.length,2,'selection cannot send additional server requests');
 assert.equal(a.handler('отмени все',a.ui),true);
 assert(a.lines.at(-1).includes('Никакие задачи не были созданы'));
 assert.equal(a.internals.validDay(31,2,2026),null,'impossible deadline rejected');
 assert.equal(a.handler('покажи черновики',a.ui),false,'no active state after cancel');

 const b=mock({foreign:true});
 b.handler('предложи поручения Рудневу',b.ui);await tick();
 assert(b.lines.some(x=>x.includes('Никакие задачи не созданы')),'wrong manager must fail closed');
 const c=mock({badMode:true});
 c.handler('предложи поручения Рудневу',c.ui);await tick();
 assert(c.lines.some(x=>x.includes('Никакие задачи не созданы')),'non-readonly response must fail closed');
 assert.equal(mock({guest:true}).handler('предложи поручения Рудневу',{answer:()=>{}}),false);
 assert.equal(mock({android:true}).handler,undefined,'Android must never load draft voice handler');
 console.log('AI360 task draft staging: 14 read-only/role/voice/date/rollback invariants PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
