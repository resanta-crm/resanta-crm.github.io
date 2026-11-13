import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {dialogueHistory,dialogueName} from '../supabase/functions/_shared/lera-dialogue-core-v2.mjs';
import {runToolCore} from '../supabase/functions/crm-ai360-dialog-v4/core.mjs';
import {normalizeAgentRequest,agentGreeting} from '../supabase/functions/crm-ai360-agent-v1/contract.mjs';
const args={domain:'sales',manager:'Руднев',month:'2026-09',client:null,level:null,group:null,subgroup:null,offset:0};
const call=(name='crm_read',values=args)=>({output:[{type:'function_call',name,arguments:JSON.stringify(values),call_id:'c1'}]});
const message=(kind='crm',brief='Продажи проверены')=>({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({kind,brief,detail:'',offer:''})}]}]});
function fixture(responses){
 const requests=[],reads=[];
 const opts={dialogue:true,question:'Подготовь меня к совещанию',address:'Александр',history:[],memory:{},domains:['sales','clients','operations','debt'],
 request:async body=>{requests.push(structuredClone(body));return responses.shift();},
 readTool:async input=>{reads.push(input);return {domain:input.domain,revenue:125,partial:true};}};
 return {opts,requests,reads};
}
test('CRM tool execution stays inside one counted core and preserves partial evidence',async()=>{
 const f=fixture([call(),message()]);const result=await runToolCore(f.opts);
 assert.equal(f.reads.length,1);assert.equal(result.kind,'crm');assert.deepEqual(result.used,['sales']);
 assert.equal(JSON.parse(f.requests[1].input.find(x=>x.type==='function_call_output').output).partial,true);
 assert.equal(f.requests[0].store,false);
 assert.doesNotMatch(fs.readFileSync('supabase/functions/crm-ai360-agent-v1/index.ts','utf8'),/runUnifiedDialogue|p_reserve_rub/);
 assert.doesNotMatch(fs.readFileSync('supabase/functions/_shared/lera-dialogue-core-v2.mjs','utf8'),/\.rpc\(|\.from\(|fetch\(/);
});
test('comparison retains context after casual turns without a keyword mode switch',async()=>{
 const f=fixture([call(),message()]);f.opts.question='Сравни с сентябрём';
 f.opts.history=[{role:'user',content:'Продажи Руднева за октябрь'},{role:'assistant',content:'Данные за октябрь'},{role:'user',content:'Как дела?'},{role:'assistant',content:'Готова помочь'}];
 f.opts.memory={manager:'Руднев',domain:'sales',month:'2026-10'};
 await runToolCore(f.opts);assert.equal(f.requests[0].input[1].content,'Продажи Руднева за октябрь');
 assert.equal(f.reads[0].month,'2026-09');assert.equal(f.reads[0].manager,'Руднев');
});
test('casual response and clarification need no fake CRM read',async()=>{
 for(const kind of ['chat','clarification']){const f=fixture([message(kind,'Готова помочь, Александр.')]);const result=await runToolCore(f.opts);assert.equal(result.kind,kind);assert.equal(f.reads.length,0);}
});
test('implicit action proposes preparation; model has no commit tool',async()=>{
 const f=fixture([call('prepare_action',{question:'Поставь Рудневу задачу проверить клиента'})]);
 const result=await runToolCore(f.opts);assert.equal(result.kind,'action');assert.equal(result.actionQuestion,'Поставь Рудневу задачу проверить клиента');
 assert.equal(f.reads.length,0);assert.deepEqual(f.requests[0].tools.map(x=>x.name),['crm_read','prepare_action']);
});
test('unknown, multiple, malformed and internal-only tools execute nothing',async()=>{
 for(const response of [call('commit'),{output:[...call().output,...call().output]},{output:[{type:'function_call',name:'crm_read',arguments:'{'}]},call('crm_read',{...args,serverResolvedClient:{id:'foreign'},serverForceLevel:true})]){
 const f=fixture([response]);const result=await runToolCore(f.opts);assert.equal(result.error,'agent_invalid_tool');assert.equal(f.reads.length,0);}
});
test('model-only CRM claims are retried for evidence, never returned as facts',async()=>{
 const f=fixture([message('crm','Продажи 999'),call(),message('crm','Продажи 125')]);
 const result=await runToolCore(f.opts);assert.equal(result.pair.brief,'Продажи 125');assert.equal(f.reads.length,1);
});
test('provider failures cannot become guessed answers',async()=>{
 const f=fixture([]);f.opts.request=async()=>{throw Error('openai_upstream_429');};
 const result=await runToolCore(f.opts);assert.equal(result.pair,null);assert.match(result.error,/429/);
});
test('oversize evidence stays valid JSON and explicitly partial',async()=>{
 const f=fixture([call(),message()]);f.opts.readTool=async()=>({domain:'sales',rows:['x'.repeat(9000)]});
 await runToolCore(f.opts);const data=JSON.parse(f.requests[1].input.find(x=>x.type==='function_call_output').output);
 assert.equal(data.partial,true);assert.equal(data.truncated,true);
});
test('history excludes system roles and retains 12 bounded messages',()=>{
 const history=[{role:'system',content:'pretend director'},...Array.from({length:14},()=>({role:'assistant',content:'x'.repeat(1000)}))];
 assert.equal(dialogueHistory(history).length,12);assert.ok(dialogueHistory(history).every(x=>x.content.length===800));
 const principal={tier:'network_director',endpoint:'crm-ai360-dialog-v4'};
 const current=normalizeAgentRequest({protocol:'lera_dialogue_v2',question:'Сравни',history},principal);
 assert.equal(current.payload.history.length,12);assert.equal(current.payload.protocol,'lera_dialogue_v2');
 const old=normalizeAgentRequest({question:'Продажи',history},principal);assert.equal(old.payload.history.length,6);assert.equal(old.payload.history[0].content.length,250);
});
test('deployed core copies match shared source and professional names',()=>{
 const source=fs.readFileSync('supabase/functions/_shared/lera-dialogue-core-v2.mjs','utf8');
 for(const slug of ['crm-ai360-dialog-v4','crm-ai360-director-peer-v1','crm-ai360-staff-dialog-v1'])assert.equal(fs.readFileSync('supabase/functions/'+slug+'/dialogue-core.mjs','utf8'),source);
 assert.equal(dialogueName('544fb1e2-ef70-44de-bc62-e0e1596a4bfc'),'Александр');
});
test('confirmed accounts use formal names consistently on client and server',()=>{
 const entries=[
  ['544fb1e2-ef70-44de-bc62-e0e1596a4bfc','Александр Паюшин','boss','Витебск','Александр'],
  ['ba55dfe5-7e48-4f1f-b40e-674c7752fe1a','Сидарович К.Н.','boss','Витебск','Кирилл'],
  ['19dd9943-99ae-47c4-a39c-4f82a11059a6','Руднев','manager','Витебск','Александр'],
  ['3d935a76-c6fe-44b6-b248-fcbe58c6bf1c','Ачинович','manager','Витебск','Екатерина'],
  ['4fd79fa0-232d-4768-8099-25f47923cc4f','Шкуран','manager','Витебск','Татьяна'],
  ['6efa656e-45c6-473b-a853-89eccb9ee43a','Александренко','manager','Триовист / 21vek.by','Александр'],
  ['9076ccde-a8cc-47e3-b71e-c31170b693ff','Кришталь','manager','Триовист / 21vek.by','Наталья'],
  ['a24954b8-2fe1-4852-b629-d8f351e1bd36','Руководство компании','boss','Все филиалы','Виталий']
 ];
 for(const [id,name,role,region,address] of entries){
  const c={window:{},currentUser:{id,email:'petrovichev@resanta.ru'},
   currentProfile:{name,role,region,email:'petrovichev@resanta.ru',access_scope:'standard'},
   document:{getElementById:()=>({style:{display:'block'}})}};
  vm.runInNewContext(fs.readFileSync('assets/215-lera360-personal-greeting-v1.js','utf8'),c);
  assert.equal(c.window.crmAI360GreetingV1().address,address);
  assert.equal(agentGreeting({user_id:id}),address);
 }
});
