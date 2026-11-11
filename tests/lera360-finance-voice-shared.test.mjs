import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const bridge=read('assets/264-resanta-ai360-finance-voice-bridge-v1.js');
const director=read('assets/143-resanta-ai360-unified-dialog-v1.js');
const staff=read('assets/144-resanta-ai360-branch-voice-v1.js');
const launch=read('assets/137-resanta-ai360-lazy-launch-v1.js');
const pilot=read('assets/134-resanta-voice-ai360-pilot-v1.js');
const premium=read('assets/146-resanta-ai360-branch-premium-voice-v1.js');
const endpoint=read('supabase/functions/crm-ai360-budget-voice-v1/index.ts');
const html=read('index.html');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(role='boss',respond){
 const calls=[],said=[],errors=[],hooks={};
 const doc={hidden:false,querySelector:()=>({hidden:false}),getElementById:()=>({style:{display:'block'}})};
 const root={addEventListener:(key,fn)=>{hooks[key]=fn}};
 const ctx={window:root,document:doc,currentUser:{id:'u1'},currentProfile:{role},
  db:{auth:{getSession:async()=>({data:{session:{access_token:'valid'}}})},
    functions:{invoke:async(name,opts)=>{
      calls.push({name,body:opts.body});
      return respond?respond(name,opts.body):{data:{
       answer_verified:true,read_only:true,source:'promotion_budget_truth_v1',
       domains_used:['promotion_budgets'],role:role==='boss'?'network_director':'field_manager',
       answer:'У Бензоленда свободно -132,89 BYN.',
       memory:{client_id:'123e4567-e89b-12d3-a456-426614174000'}
      }};
    }}},
  console,Promise,Date,String,Array,Set,RegExp,Number};
 vm.runInNewContext(bridge,ctx);
 const ui={answer:(message,options)=>said.push({message,options}),show:(message)=>said.push({message}),
  textStatus:()=>{},setStatus:()=>{},authorized:()=>true};
 return {root,ctx,ui,calls,said,errors,doc,hooks};
}
test('finance bridge is syntax valid, isolated and no eager network call or timers',()=>{
 for(const s of [bridge,director,staff,launch,pilot,premium])assert.doesNotThrow(()=>new vm.Script(s));
 const f=fixture();
 assert.equal(f.calls.length,0);
 assert.equal(typeof f.root.crmAI360FinanceVoiceHandleV1,'function');
 assert.doesNotMatch(bridge,/setInterval|MutationObserver|setTimeout|new Worker|localStorage|sessionStorage/);
 assert.match(html,/264-resanta-ai360-finance-voice-bridge-v1\.js\?v=20261111-onevoice-1/);
 assert.ok(director.indexOf('crmAI360FinanceVoiceHandleV1?.(')<director.indexOf('crmAI360UnifiedDialogFollowupV3?.('));
 assert.ok(staff.indexOf('crmAI360FinanceVoiceHandleV1?.(')<staff.indexOf('crmAI360BranchUnifiedHandleV1?.('));
});
test('single client question and client-specific follow-up stay with one verified gateway',async()=>{
 const f=fixture();
 assert.equal(f.root.crmAI360FinanceVoiceHandleV1('Привет, Лера, какой бюджет у Бензоленда?',f.ui),true);
 await tick();await tick();
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].name,'crm-ai360-budget-voice-v1');
 assert.match(f.said.at(-1).message,/Бензоленда/);
 assert.equal(f.root.crmAI360FinanceVoiceHandleV1('А сколько он нам должен?',f.ui),true);
 await tick();await tick();
 assert.equal(f.calls.length,2);
 assert.equal(f.calls[1].body.memory.client_id,'123e4567-e89b-12d3-a456-426614174000');
 assert.equal(f.root.crmAI360FinanceVoiceHandleV1('Какие продажи за месяц?',f.ui),false);
});
test('staff voice uses same endpoint but never claims network role',async()=>{
 const f=fixture('manager');
 assert.equal(f.root.crmAI360FinanceVoiceHandleV1('Какой резерв у клиента Бензоленд?',f.ui),true);
 await tick();await tick();
 assert.equal(f.calls[0].name,'crm-ai360-budget-voice-v1');
 assert.match(f.said.at(-1).message,/Бензоленда/);
});
test('foreign answer is rejected, no data leak on account change or closed panel',async()=>{
 const f=fixture('manager',()=>({data:{answer:'SECRET',answer_verified:true,read_only:true,source:'promotion_budget_truth_v1',domains_used:['promotion_budgets'],role:'network_director'}}));
 assert.equal(f.root.crmAI360FinanceVoiceHandleV1('Бюджет у Бензоленда',f.ui),true);
 await tick();await tick();
 assert.doesNotMatch(f.said.map(x=>x.message).join(' '),/SECRET/);
 f.doc.hidden=true;
 assert.equal(f.root.crmAI360FinanceVoiceHandleV1('Резерв Бензоленда',f.ui),false);
 f.doc.hidden=false;f.ctx.currentUser.id='another';
 assert.equal(f.root.crmAI360FinanceVoiceHandleV1('Резерв Бензоленда',f.ui),true);
 await tick();await tick();
 assert.doesNotMatch(f.said.map(x=>x.message).join(' '),/SECRET/);
});
test('voice opt-in wake includes Lera, but hidden page and Android security guards remain',()=>{
 assert.match(pilot,/привет\[\\s,!\.\\-–—\]\+\(\?:ресанта\|лера\)/);
 assert.match(premium,/ресанта\|резанта\|лера/);
 assert.match(pilot,/document\.hidden/);
 assert.match(launch,/__resantaAI360AndroidDirectorOptIn/);
 assert.match(pilot,/window\.setInterval\(reconcile,1600\)/,'preexisting interval is untouched, no new one');
});
test('voice finance gateway reads ONLY latest dated 1C snapshot with server scope',()=>{
 assert.match(endpoint,/scopeForVoice\(user\.data,staff\.data/);
 assert.match(endpoint,/report_date'\)\.order\('report_date',\{ascending:false\}\)/);
 assert.match(endpoint,/\.eq\('report_date',reportDate\)\.gt\('debt_overdue',0\)/);
 assert.match(endpoint,/fold\(d\.manager_name\)\.split\(' '\)\[0\]/);
 assert.doesNotMatch(endpoint,/\.(?:insert|update|upsert|delete)\(/);
 assert.doesNotMatch(bridge,/\.(?:insert|update|upsert|delete)\(/);
});
