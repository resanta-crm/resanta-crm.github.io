'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('assets/138-resanta-ai360-sales-bridge-v1.js','utf8');
const sends=[];
const ctx={
 navigator:{userAgent:'Macintosh'},
 currentUser:{id:'director'},currentProfile:{role:'boss',name:'Александр Паюшин'},
 document:{getElementById:()=>({style:{display:'block'}})},
 db:{auth:{getSession:async()=>({data:{session:{access_token:'test'}}})},
 functions:{invoke:async(name,req)=>{
   if(req.body.kind==='directory')return {data:{staff:[{role:'manager',name:'Руднев'}]}};
   sends.push(req.body);
   return {data:{answer:'По проверенным продажам Руднева информация доступна в CRM.',month:'2026-10'}};
 }}},
 window:{crmAI360StaffResolveV1:{resolve:(question)=>/руднев/i.test(question)?
 {kind:'exact',manager:'Руднев'}:{kind:'none'}}},
 console,Promise,setTimeout
};
ctx.window.window=ctx.window;
vm.runInNewContext(code,ctx,{filename:'sales-bridge.js'});
const ui={answer:()=>{},textStatus:()=>{}};
const flush=()=>new Promise(resolve=>setTimeout(resolve,10));
(async()=>{
 assert.equal(ctx.window.crmAI360SalesHandleV1('Какие продажи у Руднева?',ui),true);
 await flush();
 assert.equal(sends.length,1);
 assert.equal(sends[0].focusManager,'Руднев');
 assert.equal(ctx.window.crmAI360SalesHandleV1('А теперь Триовист',ui),false);
 assert.equal(ctx.window.crmAI360SalesHandleV1('Что делать?',ui),false);
 assert.equal(ctx.window.crmAI360SalesHandleV1('Какие продажи?',ui),true);
 await flush();
 assert.equal(sends.length,2);
 assert.equal(sends[1].focusManager,undefined,'Old manager must not leak into new topic');
 assert.equal(sends[1].history.length,0,'Old conversation must be cleared on explicit area change');
 assert.equal(ctx.window.crmAI360SalesHandleV1('Какие продажи у Руднева за сентябрь?',ui),true);
 await flush();
 assert.equal(sends[2].month,'2026-09');
 assert.equal(ctx.window.crmAI360SalesHandleV1('А по всей сети сколько продаж?',ui),true);
 await flush();
 assert.equal(sends[3].month,undefined,'Network scope must not inherit Rudnev month');
 assert.equal(sends[3].focusManager,undefined,'Network scope must clear manager');
 console.log('PASS: AI360 isolates manager scope after explicit CRM section switch');
})().catch(err=>{console.error(err);process.exitCode=1});
