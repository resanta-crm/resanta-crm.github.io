import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const bridge=load('assets/264-resanta-ai360-finance-voice-bridge-v1.js');
const page=load('index.html');
const gateway=load('supabase/functions/crm-ai360-budget-voice-v1/index.ts');
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(role='boss',custom){
 const requests=[],spoken=[],hooks={};
 const doc={hidden:false,getElementById:()=>({style:{display:'block'}}),querySelector:()=>({hidden:false})};
 const root={addEventListener:(k,fn)=>{hooks[k]=fn}};
 let legacy=0;
 root.crmAI360BranchUnifiedHandleV1=function(){legacy++;return true};
 const ctx={window:root,document:doc,currentUser:{id:'user1'},currentProfile:{role},
  db:{auth:{getSession:async()=>({data:{session:{access_token:'test-token'}}})},
    functions:{invoke:async(name,{body})=>{requests.push({name,body});return custom?custom(name,body):
       {data:{answer_verified:true,read_only:true,role:role==='boss'?'network_director':'field_manager',
         domains_used:['promotion_budgets'],source:'promotion_budget_truth_v1',
         answer:'У Бензоленда свободно -132,89 BYN.',
         memory:{client_id:'123e4567-e89b-12d3-a456-426614174000'}}};}}},
  console,Promise,Date,String,RegExp,Number};
 vm.runInNewContext(bridge,ctx);
 const ui={answer:(message)=>spoken.push(message),show:(message)=>spoken.push(message),
  textStatus(){},setStatus(){},authorized:()=>true};
 return{root,ctx,doc,requests,spoken,ui,hooks,legacy:()=>legacy};
}
test('a single lazy integration mounts no extra timers, listeners or eager fetches',()=>{
 assert.doesNotThrow(()=>new vm.Script(bridge));
 assert.doesNotMatch(bridge,/setInterval|setTimeout|MutationObserver|localStorage|sessionStorage|new Worker/);
 const f=fixture();
 assert.equal(f.requests.length,0);
 assert.equal(Object.keys(f.hooks).length,1);
 assert.ok(page.includes('264-resanta-ai360-finance-voice-bridge-v1.js?v=20261111-onevoice-safe2'));
 assert.ok(page.includes('144-resanta-ai360-branch-voice-v1.js?v=9'));
 assert.ok(page.includes('137-resanta-ai360-lazy-launch-v1.js?v=36'));
});
test('director lazy voice bridge intercepts financial question with own verified endpoint',async()=>{
 const f=fixture('boss');
 assert.equal(f.root.crmAI360UnifiedDialogHandleV1,undefined);
 let old=0;
 f.root.crmAI360UnifiedDialogHandleV1=()=>{old++;return true};
 assert.equal(f.root.crmAI360UnifiedDialogHandleV1('Какой бюджет у Бензоленда?',f.ui),true);
 await tick();await tick();
 assert.equal(f.requests.length,1);assert.equal(old,0);
 assert.equal(f.requests[0].name,'crm-ai360-budget-voice-v1');
 assert.match(f.spoken.at(-1),/Бензоленда/);
 assert.equal(f.root.crmAI360UnifiedDialogHandleV1('А сколько он должен?',f.ui),true);
 await tick();await tick();
 assert.equal(f.requests[1].body.memory.client_id,'123e4567-e89b-12d3-a456-426614174000');
 assert.equal(f.root.crmAI360UnifiedDialogHandleV1('Покажи KPI продаж',f.ui),true);
 assert.equal(old,1,'non-financial questions stay with existing Lera');
});
test('staff bridge uses existing handler, no network-wide or чужие responses',async()=>{
 const f=fixture('manager');
 const original=f.root.crmAI360BranchUnifiedHandleV1;
 assert.equal(f.root.crmAI360BranchUnifiedHandleV1('Какие акции у клиента Бензоленд?',f.ui),true);
 await tick();await tick();
 assert.equal(f.requests.length,1);assert.equal(f.legacy(),0);
 assert.equal(f.root.crmAI360BranchUnifiedHandleV1('Что по маршрутам?',f.ui),true);
 assert.equal(f.legacy(),1);
 assert.equal(f.root.crmAI360BranchUnifiedHandleV1,original,'stable wrapper identity on repeat');
});
test('rejects unverified/foreign data and requests made after hiding panel',async()=>{
 const f=fixture('manager',()=>({data:{answer:'SECRET_OTHER_BRANCH',answer_verified:true,read_only:true,
  role:'network_director',source:'promotion_budget_truth_v1',domains_used:['promotion_budgets']}}));
 assert.equal(f.root.crmAI360BranchUnifiedHandleV1('Бюджет у клиента Бензоленд?',f.ui),true);
 await tick();await tick();
 assert.doesNotMatch(f.spoken.join(' '),/SECRET_OTHER_BRANCH/);
 f.doc.hidden=true;
 f.root.crmAI360BranchUnifiedHandleV1('Бюджет Бензоленда',f.ui);
 assert.equal(f.requests.length,1);
});
test('latest single dated 1C snapshot and verified manager scope used for PDZ',()=>{
 assert.match(gateway,/scopeForVoice\(user\.data,staff\.data/);
 assert.match(gateway,/\.eq\('report_date',reportDate\)\.gt\('debt_overdue',0\)/);
 assert.match(gateway,/fold\(d\.manager_name\)\.split\(' '\)\[0\]/);
 assert.doesNotMatch(gateway,/\.(?:insert|upsert|update|delete)\(/);
 assert.doesNotMatch(bridge,/\.(?:insert|upsert|update|delete)\(/);
});
test('100 ordinary non-finance questions add zero new backend requests',()=>{
 const f=fixture();
 let old=0;f.root.crmAI360UnifiedDialogHandleV1=()=>{old++;return true};
 for(let i=0;i<100;i++)f.root.crmAI360UnifiedDialogHandleV1('Покажи KPI продаж за месяц',f.ui);
 assert.equal(old,100);
 assert.equal(f.requests.length,0);
});
