'use strict';
const vm=require('node:vm');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const js=fs.readFileSync('assets/143-resanta-ai360-unified-dialog-v1.js','utf8');
const loader=fs.readFileSync('assets/137-resanta-ai360-lazy-launch-v1.js','utf8');
const html=fs.readFileSync('index.html','utf8');
assert.match(js,/const ENDPOINT='crm-ai360-dialog-v4'/);
assert.match(loader,/143-resanta-ai360-unified-dialog-v1.js\?v=5/);
assert.match(html,/137-resanta-ai360-lazy-launch-v1.js\?v=31/);
const calls=[],answers=[];let response='ok';
const ctx={
 navigator:{userAgent:'Macintosh'}, currentUser:{id:'dfs'},
 currentProfile:{role:'boss',name:'Александр Паюшин'},
 document:{getElementById:()=>({style:{display:'block'}}),addEventListener:()=>{}},
 window:{addEventListener:()=>{}},
 db:{auth:{getSession:async()=>({data:{session:{access_token:'token'}}})},
 functions:{invoke:async(name,{body})=>{
  calls.push({name,body});
  if(response==='404'&&name==='crm-ai360-dialog-v4')return {error:{context:{status:404},message:'not found'}};
  if(response==='503')return {error:{context:{status:503},message:'overloaded'}};
  return {data:{answer:'Данные CRM проверены.',memory:{manager:'Руднев',month:'2026-10',domain:'routes'}}};
 }}},setTimeout,Promise,console
};
vm.runInNewContext(js,ctx);
assert.equal(calls.length,0,'no requests on login or page boot');
const ui={answer:a=>answers.push(a),textStatus:()=>{}};
const tick=()=>new Promise(r=>setTimeout(r,25));
(async()=>{
 assert.equal(ctx.window.crmAI360UnifiedDialogHandleV1('Расскажи про клиентов',ui),true);
 await tick();
 assert.equal(calls[0].name,'crm-ai360-dialog-v4');
 assert.equal(answers[0],'Данные CRM проверены.');
 response='404';
 assert.equal(ctx.window.crmAI360UnifiedDialogHandleV1('Какие есть акции?',ui),true);
 await tick();
 assert.deepEqual(calls.slice(1,3).map(x=>x.name),['crm-ai360-dialog-v4','crm-ai360-dialog-v3']);
 response='503';
 const prev=calls.length;
 assert.equal(ctx.window.crmAI360UnifiedDialogHandleV1('Какие остатки?',ui),true);
 await tick();
 assert.equal(calls.length,prev+1,'network failure must not double DB work');
 response='ok';
 assert.equal(ctx.window.crmAI360UnifiedDialogHandleV1('Назови клиентов снова',ui),true);
 await tick();
 assert.equal(calls.at(-1).name,'crm-ai360-dialog-v3','next question uses stable v3 after failed v4');
 console.log('PASS safe lazy v2 browser activation, v1 missing-route fallback and no retry on 503');
})().catch(e=>{console.error(e);process.exitCode=1;});
