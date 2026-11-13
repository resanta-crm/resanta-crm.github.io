import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const OWNER='544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
const PEER='a24954b8-2fe1-4852-b629-d8f351e1bd36';
const tick=()=>new Promise(r=>setImmediate(r));
function director(invoke,search='?leraPilot=dialogue2'){
 const user={id:OWNER},calls=[],answers=[],prepared=[];
 const w={location:{search},addEventListener(){},crmAI360GreetingV1:()=>({id:user.id}),
  crmAI360ActionPrepareV2:q=>{prepared.push(q);return true;}};
 const context={window:w,currentUser:user,navigator:{userAgent:'Mac'},
  document:{getElementById:()=>({style:{display:'block'}}),addEventListener(){}},
  db:{auth:{getSession:async()=>({data:{session:{access_token:'test'}}})},
   functions:{invoke:async(name,{body})=>{calls.push(body);return {data:{protocol:'lera_dialogue_v2',...await invoke(body)}};}}},
  console,Date};
 vm.runInNewContext(fs.readFileSync('assets/143-resanta-ai360-unified-dialog-v1.js','utf8'),context);
 return {w,user,calls,answers,prepared,ui:{answer:text=>answers.push(text),textStatus(){}}};
}
const chat={mode:'agent360_free_conversation_v1',answer:'Готова помочь, Александр.',
 answer_verified:false,read_only:true,intent:'free_conversation',domains_used:[]};
test('20 consecutive turns keep CRM context through casual replies with bounded history',async()=>{
 let n=0;
 const f=director(async()=>++n%2?{answer:'Проверены продажи Руднева за октябрь',memory:{domain:'sales',manager:'Руднев',month:'2026-10'}}:chat);
 for(let i=0;i<20;i++){
  assert.equal(f.w.crmAI360UnifiedDialogHandleV1(i===0?'Продажи Руднева за октябрь':i%2?'Спасибо, как дела?':'Сравни с сентябрём',f.ui),true);
  await tick();
 }
 assert.equal(f.answers.length,20);assert.equal(f.calls.length,20);
 assert.ok(f.calls.every(x=>x.protocol==='lera_dialogue_v2'&&x.history.length<=12));
 assert.equal(f.calls[2].memory.manager,'Руднев');
 assert.ok(f.calls[2].history.some(x=>x.content.includes('Руднева')));
});
test('semantic action opens existing preparation, never a commit',async()=>{
 const f=director(async()=>({mode:'agent360_action_request_v2',protocol:'lera_dialogue_v2',
  requires_confirmation:true,created:0,read_only:true,action_question:'Поставь Рудневу задачу проверить клиента'}));
 f.w.crmAI360UnifiedDialogHandleV1('Пусть он проверит этого клиента',f.ui);await tick();
 assert.deepEqual(f.prepared,['Поставь Рудневу задачу проверить клиента']);assert.equal(f.answers.length,0);
});
test('an old reply and conversation never cross into a different signed-in account',async()=>{
 let release;
 const f=director(()=>new Promise(resolve=>{release=resolve;}));
 f.w.crmAI360UnifiedDialogHandleV1('Продажи моего клиента',f.ui);await tick();
 f.user.id=PEER;
 release({answer:'PRIVATE OLD ANSWER',memory:{client:'PRIVATE CLIENT'}});await tick();
 assert.equal(f.answers.length,0);
 f.w.crmAI360UnifiedDialogHandleV1('Привет',f.ui);await tick();
 assert.equal(f.calls[1].history.length,0);assert.equal(f.calls[1].memory.client,undefined);
 release(chat);await tick();assert.equal(f.answers.length,1);
});
test('owner uses unified dialogue on the ordinary CRM URL',async()=>{
 const f=director(async()=>chat,'');f.w.crmAI360UnifiedDialogHandleV1('Привет',f.ui);await tick();
 assert.equal(f.calls[0].protocol,'lera_dialogue_v2');assert.equal(f.w.__resantaLeraDialogueV2,true);
});
test('approved executive uses unified dialogue without impersonating owner',async()=>{
 const f=director(async()=>chat);f.user.id=PEER;
 f.w.crmAI360UnifiedDialogHandleV1('Привет',f.ui);await tick();
 assert.equal(f.calls[0].protocol,'lera_dialogue_v2');assert.equal(f.w.__resantaLeraDialogueV2,true);
});
test('pilot analytical show requests reach the agent instead of being consumed as navigation',()=>{
 const calls=[],root={__resantaLeraDialogueV2:true};
 vm.runInNewContext(fs.readFileSync('assets/221-lera360-voice-navigation-v1.js','utf8'),{
 window:root,document:{getElementById:()=>null},currentUser:{id:OWNER}});
 assert.equal(root.crmAI360NavigateV1('Покажи продажи за сентябрь',{answer:x=>calls.push(x)}),false);
 assert.equal(root.crmAI360NavigateV1('Покажи проблемных клиентов',{answer:x=>calls.push(x)}),false);
 assert.equal(calls.length,0);
 const voice=fs.readFileSync('assets/134-resanta-voice-ai360-pilot-v1.js','utf8');
 const pilot=voice.indexOf('if(window.__resantaLeraDialogueV2===true&&');
 assert.ok(pilot>voice.indexOf('crmAI360ActionHandleV1?.'));
 assert.ok(pilot<voice.indexOf("typeof window.crmAI360TaskDraftsHandleV1"));
});

test('owner refuses a silent downgrade to the legacy chat',async()=>{const f=director(async()=>({protocol:'legacy',answer:'WRONG'}),'');f.w.crmAI360UnifiedDialogHandleV1('Продажи',f.ui);await tick();assert.equal(f.answers.includes('WRONG'),false);assert.match(f.answers[0],/Единый агент/);});
