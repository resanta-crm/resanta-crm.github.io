'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const staff=[
 {name:'Руднев',role:'manager'},
 {name:'Шкуран',role:'manager'},
 {name:'Ачинович',role:'manager'},
 {name:'Кришталь',role:'manager'}
];
const window={};
const ctx={window,console,currentUser:{id:'test'},currentProfile:{name:'Александр Паюшин',role:'boss'},
 document:{getElementById:()=>({style:{display:'block'}})},
 navigator:{userAgent:'Windows NT 10.0'},setTimeout,clearTimeout};
vm.runInNewContext(fs.readFileSync('assets/139-resanta-ai360-staff-resolver-v1.js','utf8'),ctx);
function recognized(q){return window.crmAI360StaffResolveV1.resolve(q,staff);}
assert.equal(recognized('Какие продажи у менеджера Руднева?').kind,'exact');
assert.equal(recognized('Какие продажи у менеджера Руднева?').manager,'Руднев');
assert.equal(recognized('Сколько продал Руднев в октябре?').manager,'Руднев');
assert.equal(recognized('У Шкурана что с выполнением плана?').manager,'Шкуран');
assert.equal(recognized('Расскажи про менеджера орудия').kind,'confirm');
assert.equal(recognized('Расскажи про менеджера орудия').manager,'Руднев');
assert.equal(recognized('Продажи менеджера рутнева').kind,'confirm');
assert.equal(recognized('Продажи менеджера несуществующего').kind,'unknown');
assert.equal(recognized('Какие продажи у всех менеджеров?').kind,'none');
let calls=[],answers=[];
window.crmEnsureFreshSessionV236166=async()=>({access_token:'good'});
ctx.db={functions:{invoke:async (n,opts)=>{
 assert.equal(n,'crm-ai360-director-v1');
 calls.push(opts.body);
 if(opts.body.kind==='directory')return {data:{staff}};
 return {data:{answer:opts.body.focusManager?
   'Персональная аналитика '+opts.body.focusManager:'Сводка по всем',
   month:'2026-10'}};
}}};
vm.runInNewContext(fs.readFileSync('assets/138-resanta-ai360-sales-bridge-v1.js','utf8'),ctx);
const ui={answer:t=>answers.push(t),textStatus:()=>{}};
const wait=()=>new Promise(r=>setTimeout(r,30));
(async()=>{
 assert.equal(window.crmAI360SalesHandleV1('какие продажи у менеджера орудия',ui),true);
 await wait();
 assert(answers.at(-1).includes('Ты имеешь в виду менеджера Руднев'));
 assert.equal(calls.filter(x=>x.kind!=='directory').length,0,'no paid LLM call before confirmation');
 assert.equal(window.crmAI360SalesHandleV1('да',ui),true);
 await wait();
 let result=calls.filter(x=>x.kind!=='directory').at(-1);
 assert.equal(result.focusManager,'Руднев');
 assert(result.message.includes('Руднев'));
 assert.equal(window.crmAI360SalesHandleV1('а почему он отстаёт',ui),true);
 await wait();
 result=calls.filter(x=>x.kind!=='directory').at(-1);
 assert.equal(result.focusManager,'Руднев','follow-up keeps manager');
 assert.equal(window.crmAI360SalesHandleV1('какие продажи по всей сети',ui),true);
 await wait();
 result=calls.filter(x=>x.kind!=='directory').at(-1);
 assert.equal(result.focusManager,undefined,'whole-network question must clear personal scope');
 assert.equal(window.crmAI360SalesHandleV1('какие продажи у Шкурана',ui),true);
 await wait();
 result=calls.filter(x=>x.kind!=='directory').at(-1);
 assert.equal(result.focusManager,'Шкуран');
 assert.equal(window.crmAI360SalesHandleV1('а что предлагаешь делать',ui),true);
 await wait();
 result=calls.filter(x=>x.kind!=='directory').at(-1);
 assert.equal(result.focusManager,'Шкуран');
 const p=fs.readFileSync('assets/135-resanta-voice-capture-fix-v2.js','utf8');
 assert(p.includes("submit('Привет, Ресанта')"));
 assert(p.includes("await waitForAssistant(epoch,'wake')"));
 assert(p.includes("await waitForAssistant(epoch,'manual')"));
 assert(p.includes('window.__resantaAI360PendingV1'));
 const pilot=fs.readFileSync('assets/134-resanta-voice-ai360-pilot-v1.js','utf8');
 assert(pilot.includes('Привет! Слушаю тебя. Чем могу помочь?'));
 console.log('Greeting routing, Russian surnames, unclear audio, confirmation, and personal KPI context: OK');
})().catch(e=>{console.error(e);process.exit(1);});
