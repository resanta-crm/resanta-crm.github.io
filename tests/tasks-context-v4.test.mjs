import test from 'node:test';import assert from 'node:assert/strict';
import {selectedTaskQuestion} from '../supabase/functions/crm-ai360-agent-v1/task-context.mjs';
const context={client_id:'11111111-1111-4111-8111-111111111111'};
test('selected-client shipment question uses verified task context',()=>assert.equal(selectedTaskQuestion({task_context:context,question:'Почему задача ещё не закрыта?'}).client_id,context.client_id));
test('creation and other writes retain existing signed action path',()=>{for(const question of ['Создай задачу по клиенту','Лера, перенеси задачу','Поставь задачу менеджеру'])assert.equal(selectedTaskQuestion({task_context:context,question}),null);});
test('no context or unrelated question never reroutes another CRM section',()=>{assert.equal(selectedTaskQuestion({question:'Почему задача не закрыта?'}),null);assert.equal(selectedTaskQuestion({task_context:context,question:'Какая погода?'}),null);});

import fs from 'node:fs';import vm from 'node:vm';
const taskEndpoint=fs.readFileSync(new URL('../supabase/functions/crm-tasks-assistant-v4/index.ts',import.meta.url),'utf8');
async function selectedFacts(input,rows){
 const source=taskEndpoint.slice(taskEndpoint.indexOf(" if(input.action==='question'){"),taskEndpoint.indexOf(" const claim=await svc.rpc('crm_ai360_core_claim_v2'" )).replace(/\(x:any\)/g,'(x)');
 const caller={from(name){let data=[...(rows[name]||[])];const q={select(){return q},eq(k,v){data=data.filter(x=>x[k]===v);return q},order(){return q},limit(n){data=data.slice(0,n);return q},maybeSingle(){return Promise.resolve({data:data[0],error:null})},then(f){return Promise.resolve({data,error:null}).then(f)}};return q;}};
 return vm.runInNewContext('(async()=>{let taskFacts=null;'+source+';return taskFacts;})()',{input:{action:'question',...input},caller,req:{},send:(_,body,status)=>({body,status})});
}
test('selected old task and route are filtered before history limits',async()=>{
 const other=Array.from({length:10},(_,i)=>({client_id:'c',task_id:'new'+i,route_id:'new'+i}));
 const facts=await selectedFacts({client_id:'c',task_id:'old',route_id:'old-route'},{clients:[{id:'c'}],tasks:[{id:'old',client_id:'c',done:true}],crm_task_contracts_v4:[...other,{client_id:'c',task_id:'old',state:'verified'}],crm_shelf_scans_v4:[...other,{client_id:'c',route_id:'old-route',items:[]}]});
 assert.equal(facts.tasks[0].id,'old');assert.equal(facts.verification[0].state,'verified');assert.equal(facts.shelf[0].route_id,'old-route');
});
test('missing or mismatched selected task cannot produce a guessed answer',async()=>{const r=await selectedFacts({client_id:'c',task_id:'foreign'},{clients:[{id:'c'}],tasks:[{id:'foreign',client_id:'other'}]});assert.equal(r.status,404);assert.equal(r.body.error,'TASK_CLIENT_SCOPE');});
