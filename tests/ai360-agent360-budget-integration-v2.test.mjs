import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as contract from '../supabase/functions/crm-ai360-agent-v1/contract.mjs';
import * as conversation from '../supabase/functions/crm-ai360-agent-v1/conversation.mjs';
import * as history from '../supabase/functions/crm-ai360-agent-v1/history.mjs';
import * as gps from '../supabase/functions/crm-ai360-dialog-v4/gps-evidence.mjs';
import * as catalog from '../supabase/functions/crm-ai360-dialog-v4/catalog.mjs';
import * as context from '../supabase/functions/crm-ai360-dialog-v4/context.mjs';
import * as managerSales from '../supabase/functions/crm-ai360-dialog-v4/manager-sales.mjs';
import {runToolCore} from '../supabase/functions/crm-ai360-dialog-v4/core.mjs';
import {dialogueName} from '../supabase/functions/crm-ai360-dialog-v4/dialogue-core.mjs';
const OWNER='544fb1e2-ef70-44de-bc62-e0e1596a4bfc',TOKEN='test-caller-jwt-fixture';
const pair=(kind,brief)=>({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({kind,brief,detail:'',offer:''})}]}],usage:{input_tokens:40,output_tokens:20}});
function setup(outputs){
 const rpcCalls=[],forwarded=[],user={id:OWNER},profile={id:OWNER,name:'Александр Паюшин',role:'boss',region:'Витебск'};
 const svc={auth:{getUser:async token=>({data:{user:token===TOKEN?user:null}})},from:table=>{
 const b={select:()=>b,eq:()=>b,maybeSingle:async()=>({data:table==='users'?profile:{enabled:false}}),limit:async()=>({data:[{name:'Руднев'}]})};return b;},
 rpc:async(name,args)=>{rpcCalls.push({name,args});
 if(name==='crm_ai360_core_claim_v2')return {data:{allowed:true,claim_id:'claim-one'}};
 if(name==='crm_ai360_core_finish_v2')return {data:{ok:true}};
 if(name==='crm_ai360_operations_snapshot_v1')return {data:{scope:'network',period:'2026-11',task_summary:{open:2},client_summary:{},debt_summary:{},route_summary:{},visit_summary:{},declining_clients:[]}};
 throw Error('unexpected RPC '+name);}};
 let director;
 const fetcher=async(url,init)=>{
 if(url.includes('/functions/v1/')){forwarded.push({url,headers:init.headers});return director(new Request(url,init));}
 if(url==='https://api.openai.com/v1/responses'){const output=outputs.shift();if(!output)throw Error('unexpected model call');return new Response(JSON.stringify(output),{status:200,headers:{'Content-Type':'application/json'}});}
 throw Error('unexpected URL');};
 function load(slug,imports){let handler;const code=fs.readFileSync('supabase/functions/'+slug+'/index.ts','utf8').replace(/^import .*;\r?\n/gm,'');
 const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-service',SUPABASE_ANON_KEY:'test-anon',OPENAI_API_KEY:'test-provider'};
 vm.runInNewContext(code,{...imports,createClient:()=>svc,fetch:fetcher,Deno:{env:{get:k=>env[k]},serve:f=>{handler=f;}},Response,Request,AbortSignal,Intl,Date,console});return handler;}
 director=load('crm-ai360-dialog-v4',{...gps,...catalog,...context,...managerSales,runToolCore,dialogueName,readTasks:async()=>{throw Error('unexpected tasks');},resolveClient:async()=>({error:'not_found'}),resolveAnyClient:async()=>({error:'not_found'})});
 const gateway=load('crm-ai360-agent-v1',{...contract,...conversation,...history});
 const ask=question=>gateway(new Request('https://test.supabase.co/functions/v1/crm-ai360-agent-v1',{method:'POST',headers:{Authorization:'Bearer '+TOKEN,'Content-Type':'application/json',Origin:'https://resanta-crm.by'},body:JSON.stringify({action:'ask',protocol:'lera_dialogue_v2',question})}));
 return {ask,rpcCalls,forwarded};
}
test('gateway and director chat make exactly one budget claim',async()=>{
 const f=setup([pair('chat','Здравствуйте, Александр.')]);const response=await f.ask('Привет, как дела?'),data=await response.json();
 assert.equal(response.status,200);assert.equal(data.intent,'free_conversation');assert.equal(data.answer_verified,false);
 assert.equal(f.rpcCalls.filter(x=>x.name==='crm_ai360_core_claim_v2').length,1);
 assert.equal(f.rpcCalls.filter(x=>x.name==='crm_ai360_core_finish_v2').length,1);
 assert.equal(f.forwarded.length,1);assert.equal(f.forwarded[0].headers.Authorization,'Bearer '+TOKEN);
});
test('gateway and director CRM rounds share one budget claim and preserve partial sources',async()=>{
 const tool={output:[{type:'function_call',name:'crm_read',call_id:'read1',arguments:JSON.stringify({domain:'operations',manager:null,month:null,client:null,level:null,group:null,subgroup:null,offset:0})}],usage:{input_tokens:50,output_tokens:30}};
 const f=setup([tool,pair('crm','Есть открытые задачи для обсуждения.')]);const response=await f.ask('Подготовь меня к совещанию'),data=await response.json();
 assert.equal(response.status,200);assert.equal(data.protocol,'lera_dialogue_v2');assert.equal(data.error,undefined);
 assert.equal(f.rpcCalls.filter(x=>x.name==='crm_ai360_core_claim_v2').length,1);
 assert.equal(f.rpcCalls.find(x=>x.name==='crm_ai360_core_finish_v2').args.p_rounds,2);
 assert.equal(f.rpcCalls.filter(x=>x.name==='crm_ai360_operations_snapshot_v1').length,1);
 assert.equal(data.answer_verified,false);assert.ok(data.partial_sources.includes('operations'));
});

test('network question overrides a stale individual model tool argument',async()=>{
 const tool={output:[{type:'function_call',name:'crm_read',call_id:'network',arguments:JSON.stringify({domain:'operations',manager:'Руднев',month:null,client:null,level:null,group:null,subgroup:null,offset:0})}],usage:{input_tokens:50,output_tokens:30}};
 const f=setup([tool,pair('crm','Сводка по сети.')]);const response=await f.ask('Покажи полевых менеджеров');
 assert.equal(response.status,200);const call=f.rpcCalls.find(x=>x.name==='crm_ai360_operations_snapshot_v1');assert.ok(call);assert.equal(call.args.p_manager,null);
});
