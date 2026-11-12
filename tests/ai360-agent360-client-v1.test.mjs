import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function launch(){
 const calls=[],scope={currentUser:{id:'user-a'},window:{},console};
 scope.db={functions:{invoke:async(endpoint,{body})=>{
  calls.push({endpoint,body:structuredClone(body)});
  if(body.action==='capabilities')return {data:{tier:'field_manager',surfaces:[]}};
  return {data:{answer:'Подтверждённый ответ',memory:{manager:'Руднев'}}};
 }}};
 scope.window.crmEnsureFreshSessionV236166=async()=>({access_token:'mock-for-structure-only'});
 vm.runInNewContext(fs.readFileSync('assets/210-resanta-agent360-single-entry-v1.js','utf8'),scope);
 return {scope,calls,agent:scope.window.crmAgent360SingleEntryV1};
}
test('no eager requests, no microphone, and one endpoint for all clients',async()=>{
 const {calls,agent}=launch();
 assert.equal(calls.length,0);
 const answer=await agent.ask('Какие продажи?');
 assert.equal(answer.answer,'Подтверждённый ответ');
 assert.equal(calls.length,1);
 assert.equal(calls[0].endpoint,'crm-ai360-agent-v1');
 assert.equal(calls[0].body.action,'ask');
 const caps=await agent.capabilities();
 assert.equal(caps.tier,'field_manager');
 assert.equal(calls[1].body.action,'capabilities');
});

test('dialogue context stays bounded in memory and is erased on account switch',async()=>{
 const {scope,calls,agent}=launch();
 await agent.ask('Покажи продажи Руднева');
 await agent.ask('А что с задачами?');
 assert.equal(calls[1].body.history.length,2);
 assert.equal(calls[1].body.memory.manager,'Руднев');
 scope.currentUser={id:'user-b'};
 await agent.ask('Покажи мои задачи');
 assert.equal(calls[2].body.history.length,0);
 assert.equal(Object.keys(calls[2].body.memory).length,0);
 agent.reset();
 await agent.ask('Покажи мои маршруты');
 assert.equal(calls[3].body.history.length,0);
});

test('session refresh is single-flight, never overlaps two questions',async()=>{
 const {scope,calls,agent}=launch();
 let finish;
 scope.window.crmEnsureFreshSessionV236166=()=>new Promise(resolve=>{finish=resolve;});
 const first=agent.ask('Покажи продажи');
 await assert.rejects(agent.ask('Покажи клиентов'),/agent_request_in_progress/);
 finish({access_token:'mock-for-structure-only'});
 await first;
 assert.equal(calls.length,1);
});

test('unsupported input and unauthenticated UI fail closed',async()=>{
 const {scope,calls,agent}=launch();
 await assert.rejects(agent.ask('x'),/agent_question_invalid/);
 scope.currentUser=null;
 await assert.rejects(agent.ask('Покажи продажи'),/agent_not_authorized/);
 assert.equal(calls.length,0);
});
