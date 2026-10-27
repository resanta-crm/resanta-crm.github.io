'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const bridge=fs.readFileSync('assets/138-resanta-ai360-sales-bridge-v1.js','utf8');
const server=fs.readFileSync('supabase/functions/crm-ai360-director-v1/index.ts','utf8');
const capture=fs.readFileSync('assets/135-resanta-voice-capture-fix-v2.js','utf8');
const launcher=fs.readFileSync('assets/137-resanta-ai360-lazy-launch-v1.js','utf8');
assert.ok(server.indexOf('user.id!==OWNER_ID') < server.indexOf("payload?.kind==='promotions_today'"),'promo endpoint is behind director auth');
assert.match(server,/\.eq\('status','in_work'\)\.lte\('start_date',today\)\.gte\('end_date',today\)/);
assert.match(server,/answer_verified:true,intent:'promotions'/);
assert.match(capture,/const clip=await capture\(12,epoch\)/);
assert.match(capture,/const second=await capture\(12,epoch\)/);
const micIdx=capture.indexOf("mic.addEventListener('click'");
const wakeIdx=capture.indexOf("wake.addEventListener('click'",micIdx);
const micHandler=capture.slice(micIdx,wakeIdx);
assert.match(micHandler,/void start\('manual'\)/);
assert.doesNotMatch(micHandler,/if\(mode==='wake'\)/);
assert.match(launcher,/135-resanta-voice-capture-fix-v2.js\?v=15/);
assert.match(launcher,/138-resanta-ai360-sales-bridge-v1.js\?v=8/);
const sends=[],answers=[];
const ctx={
 navigator:{userAgent:'Macintosh'},
 currentUser:{id:'director'},currentProfile:{role:'boss',name:'Александр Паюшин'},
 document:{getElementById:()=>({style:{display:'block'}})},
 db:{auth:{getSession:async()=>({data:{session:{access_token:'test'}}})},
  functions:{invoke:async(name,req)=>{
    sends.push(req.body);
    if(req.body.kind==='directory')return {data:{staff:[{role:'manager',name:'Руднев'}]}};
    if(req.body.kind==='promotions_today')return {data:{answer:'Сегодня 8 действующих акций CRM.',answer_verified:true}};
    return {data:{answer:'Продажи по подтверждённым данным CRM.',month:'2026-10'}};
  }}},
 window:{crmAI360StaffResolveV1:{resolve:q=>/руднев/i.test(q)?{kind:'exact',manager:'Руднев'}:{kind:'none'}}},
 Promise,console,setTimeout
};
vm.runInNewContext(bridge,ctx);
const ui={answer:s=>answers.push(s),textStatus:()=>{}};
const wait=()=>new Promise(done=>setTimeout(done,15));
(async()=>{
 assert.equal(ctx.window.crmAI360SalesHandleV1('Какие продажи у Руднева?',ui),true);
 await wait();
 assert.equal(ctx.window.crmAI360SalesHandleV1('Какие у нас сегодня акции?',ui),true);
 await wait();
 assert.ok(sends.some(x=>x.kind==='promotions_today'),'campaigns fetch must be executed');
 assert.ok(answers.some(x=>x.includes('8 действующих акций')),'user must receive actual campaign answer');
 assert.equal(ctx.window.crmAI360SalesHandleV1('Какие продажи?',ui),true);
 await wait();
 const saleCalls=sends.filter(x=>x.message==='Какие продажи?');
 assert.equal(saleCalls.length,1);
 assert.equal(saleCalls[0].focusManager,undefined,'old manager must not leak after campaigns');
 assert.equal(saleCalls[0].history.length,0,'old sales context must be cleared');
 console.log('PASS: actual mic handler, verified live promotions route and scope isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
