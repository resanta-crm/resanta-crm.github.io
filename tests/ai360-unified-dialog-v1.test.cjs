'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const api=fs.readFileSync('supabase/functions/crm-ai360-dialog-v1/index.ts','utf8');
const bridge=fs.readFileSync('assets/143-resanta-ai360-unified-dialog-v1.js','utf8');
const pilot=fs.readFileSync('assets/134-resanta-voice-ai360-pilot-v1.js','utf8');
assert.ok(api.indexOf("u.id!==OWNER_ID")>=0,'director JWT binding');
assert.ok(api.indexOf("u.id!==OWNER_ID")<api.indexOf("const question="),'auth before question planner');
assert.ok(api.includes("profile.data?.role!=='boss'"),'server role gate');
assert.ok(api.includes("'crm_ai360_sales_kpi_snapshot_v1'"));
assert.ok(api.includes("'crm_ai360_operations_snapshot_v1'"));
assert.ok(api.includes("'crm_ai360_triovist_brief_v1'"));
assert.ok(api.includes("'vip_membership_v236429'"));
assert.ok(api.includes("'payment_registry'"));
assert.ok(api.includes("'promotions'"));
assert.ok(api.includes(".in('status',['submitted','approved'])"),'limited payments');
assert.ok(api.includes(".eq('status','in_work')"),'exclude rejected campaigns');
assert.ok(api.includes("Могу подготовить проект решения, но голосом ничего не утвердил."),'payments are readonly');
assert.ok(!/\.update\(|\.insert\(|\.delete\(|\.upsert\(/.test(api),'no direct record writes');
assert.ok(pilot.includes("crmAI360UnifiedDialogHandleV1(query"),'assistant connected to new gateway after safeguards');
const calls=[],said=[];
const ctx={
 navigator:{userAgent:'Macintosh'},
 document:{getElementById:()=>({style:{display:'block'}}),hidden:false,addEventListener:()=>{}},
 currentUser:{id:'dfs'},currentProfile:{role:'boss',name:'Александр Паюшин'},
 db:{auth:{getSession:async()=>({data:{session:{access_token:'test'}}})},functions:{invoke:async(n,q)=>{
  calls.push({n,body:q.body});return {data:{answer:'Проверенная сводка CRM.',memory:{manager:'Руднев',month:'2026-10',domain:'sales'}}};
 }}},
 window:{addEventListener:()=>{}},Promise,setTimeout,console
};
vm.runInNewContext(bridge,ctx,{filename:'unified.js'});
const ui={answer:x=>said.push(x),textStatus:()=>{}};
const flush=()=>new Promise(r=>setTimeout(r,20));
(async()=>{
 assert.equal(ctx.window.crmAI360UnifiedDialogHandleV1('Какие продажи у Руднева?',ui),true);
 await flush();
 assert.equal(calls.length,1);
 assert.equal(calls[0].n,'crm-ai360-dialog-v2');
 assert.equal(ctx.window.crmAI360UnifiedDialogHandleV1('А какие у него забытые клиенты?',ui),true);
 await flush();
 assert.equal(calls.length,2);
 assert.equal(calls[1].body.memory.manager,'Руднев');
 assert.equal(calls[1].body.history[0].content,'Какие продажи у Руднева?');
 assert.equal(ctx.window.crmAI360UnifiedDialogHandleV1('открой продажи',ui),false);
 ctx.window.crmAI360UnifiedDialogResetV1();
 assert.equal(ctx.window.crmAI360UnifiedDialogHandleV1('Какие у нас акции?',ui),true);
 await flush();
 assert.equal(calls[2].body.history.length,0);
 assert.equal(calls[2].body.memory.manager,undefined);
 console.log('PASS unified bridge, source guards and independent sessions');
})().catch(e=>{console.error(e);process.exitCode=1;});
