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
   speech_summary:'Проверенный краткий итог для директора.',
   month:'2026-10'}};
}}};
vm.runInNewContext(fs.readFileSync('assets/138-resanta-ai360-sales-bridge-v1.js','utf8'),ctx);
let spokenSummaries=[];
const ui={answer:(t,options)=>{answers.push(t);if(options?.speechSummary)spokenSummaries.push(options.speechSummary);},textStatus:()=>{}};
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
 // Exact failure from the director's recording: a new TOPIC without an explicit
 // surname must NOT silently switch from Shkuran's portfolio to whole network.
 assert.equal(window.crmAI360SalesHandleV1('Какие клиенты ей нужно отгрузить?',ui),true);
 await wait();
 result=calls.filter(x=>x.kind!=='directory').at(-1);
 assert.equal(result.focusManager,'Шкуран','implicit client question must keep Shkuran');
 assert.equal(window.crmAI360SalesHandleV1('Там порекомендую, чтобы она продала и закрыла свой план',ui),true);
 await wait();
 result=calls.filter(x=>x.kind!=='directory').at(-1);
 assert.equal(result.focusManager,'Шкуран','garbled recommendation must retain Shkuran');
 assert(spokenSummaries.includes('Проверенный краткий итог для директора.'),
   'spoken executive summary must reach the voice UI separately from full answer');
 assert.equal(window.crmAI360SalesHandleV1('А какие у неё просроченные долги?',ui),true);
 await wait();
 result=calls.filter(x=>x.kind!=='directory').at(-1);
 assert.equal(result.focusManager,'Шкуран','new debt topic must keep Shkuran');
 assert.equal(window.crmAI360SalesHandleV1('У каких клиентов Руднева снизились закупки?',ui),true);
 await wait();
 result=calls.filter(x=>x.kind!=='directory').at(-1);
 assert.equal(result.focusManager,'Руднев','phase 3 clients keep specific manager');
 assert.equal(window.crmAI360SalesHandleV1('А что с его просроченной дебиторкой?',ui),true);
 await wait();
 result=calls.filter(x=>x.kind!=='directory').at(-1);
 assert.equal(result.focusManager,'Руднев','phase 3 debtor follow-up keeps manager');
 assert.equal(window.crmAI360SalesHandleV1('Какие маршруты и визиты у Шкурана?',ui),true);
 await wait();
 result=calls.filter(x=>x.kind!=='directory').at(-1);
 assert.equal(result.focusManager,'Шкуран','phase 3 visit and route questions');
 assert.equal(window.crmAI360SalesHandleV1('Покажи просроченные задачи по всей сети',ui),true);
 await wait();
 result=calls.filter(x=>x.kind!=='directory').at(-1);
 assert.equal(result.focusManager,undefined,'phase 3 network question clears manager');
 assert.equal(window.crmAI360SalesHandleV1('Подготовь поручение менеджеру Рудневу по проблемным клиентам',ui),true);
 await wait();
 result=calls.filter(x=>x.kind!=='directory').at(-1);
 assert.equal(result.focusManager,'Руднев','phase 3 management draft question');
 const misheard='Ну и как быть теперь по родню? Какие задачи ты порекомендуешь мне сейчас, чтобы эти клиенты купили у него?';
 assert.equal(window.crmAI360SalesHandleV1(misheard,ui),true);
 await wait();
 result=calls.filter(x=>x.kind!=='directory').at(-1);
 assert.equal(result.focusManager,'Руднев','misheard follow-up must retain the previously discussed manager');
 assert(result.message.includes('по продажам'),'repair domain-context misrecognition');
 assert(!result.message.includes('по родню'),'remove misheard homophone');
 const edge=fs.readFileSync('supabase/functions/crm-ai360-director-v1/index.ts','utf8');
 assert(edge.includes("crm_ai360_operations_snapshot_v1"),'server must call phase3 RPC');
 assert(edge.includes("crm_ai360_llm_claim_v1"),'server must enforce quota');
 assert(edge.includes("operations_unavailable"),'no fabricated operations fallback');
 assert(edge.includes("verify")||edge.includes("svc.auth.getUser("));
 assert(!edge.includes("svc.from('tasks').update"),'AI must never silently modify tasks');
 const migration=fs.readFileSync('supabase/migrations/20261022_ai360_phase3_operations_snapshot_v1.sql','utf8');
 assert(/language sql/i.test(migration)&&!/security definer/i.test(migration),'phase 3 must use SQL invoker (default) and never SECURITY DEFINER');
 assert(migration.includes('revoke all on function public.crm_ai360_operations_snapshot_v1'));
 assert(migration.includes('grant execute on function public.crm_ai360_operations_snapshot_v1(text,date) to service_role'));
 const p=fs.readFileSync('assets/135-resanta-voice-capture-fix-v2.js','utf8');
 assert(p.includes("submit('Привет, Ресанта')"));
 assert(p.includes("await waitForAssistant(epoch,'wake')"));
 assert(p.includes("await waitForAssistant(epoch,'manual')"));
 assert(p.includes('window.__resantaAI360PendingV1'));
 const pilot=fs.readFileSync('assets/134-resanta-voice-ai360-pilot-v1.js','utf8');
 assert(pilot.includes('Привет! Слушаю тебя. Чем могу помочь?'));
 assert(!pilot.includes('Пока это пилот голосового управления.'),'do not read obsolete pilot fallback');
 assert(pilot.includes("спасибо")&&pilot.includes('Пожалуйста! Обращайся'),'natural gratitude');
 assert(pilot.includes('lastDetailedResponse')&&pilot.includes('briefVoiceText')&&pilot.includes('Озвучиваю предыдущий ответ полностью.'),'short voice and on-demand full replay');
 assert(pilot.includes('rva-stop-audio')&&pilot.includes('crmResantaVoiceStopV3'),'visible stop-speech action is wired');
 assert(pilot.includes('options.speechSummary'),'server summary is used for short audio');
 assert(p.includes('partialHelloAt')&&p.includes('Date.now()-partialHelloAt<=15000'),'split greeting recover');
 assert(p.includes("Услышала «Привет»."),'single hello must request second wake word');
 console.log('Manager scope continuity, greeting, Russian customer references, concise voice and gratitude: OK');
})().catch(e=>{console.error(e);process.exit(1);});
