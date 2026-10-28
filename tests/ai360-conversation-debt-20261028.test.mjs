import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {debtEvidence,normalizeVoicePair,classifyFollowup} from '../supabase/functions/crm-ai360-dialog-v3/conversation.mjs';
const evidence=debtEvidence({
 debt_summary:{amount:111506.78,debtor_rows:41,rows_30d:3,rows_60d:1,report_date:'2026-10-27'},
 overdue_debtors:[
  {client_name:'Крупный долг',debt_overdue:45000,debt_overdue_days:10,manager_name:'Шкуран',report_date:'2026-10-27'},
  {client_name:'Долг давний',debt_overdue:0.06,debt_overdue_days:124,manager_name:'Руднев',report_date:'2026-10-27'}
 ],
 manager_totals:[{manager_name:'Шкуран Татьяна',amount:46511.37,debtor_rows:6},{manager_name:'Руднев Александр',amount:43067.85,debtor_rows:22}],
 warnings:['ПДЗ: сопоставление менеджера по первому слову ФИО']
});
assert.equal(evidence.count,41);
assert.equal(evidence.report_date,'2026-10-27');
assert.ok(evidence.summary.includes('111'));
assert.ok(evidence.summary.includes('30 дней'));
assert.ok(evidence.detail.includes('Долг давний'));
assert.ok(evidence.detail.includes('Шкуран Татьяна'));
assert.ok(evidence.summary.includes('Шкуран Татьяна'));
assert.ok(evidence.detail.includes('Не приравнивать'));
assert.equal(evidence.limited_clients,true);
const answer=normalizeVoicePair({brief:'Я понял. Я готов объяснить.',detail:'Понял, здесь требуется проверка.',offer:'Хочешь подробнее?'},{});
assert.ok(answer.brief.includes('Я поняла'));
assert.ok(answer.brief.includes('Я готова'));
assert.ok(answer.detail.startsWith('Поняла,'));
assert.equal(classifyFollowup('Да, давай!'),'yes'); // natural spoken confirmation of the pending offer
assert.equal(classifyFollowup('да'),'yes');
assert.equal(classifyFollowup('покажи на экране'),'screen');
assert.equal(classifyFollowup('нет'),'no');
const server=fs.readFileSync('supabase/functions/crm-ai360-dialog-v3/index.ts','utf8');
const bridge=fs.readFileSync('assets/143-resanta-ai360-unified-dialog-v1.js','utf8');
const core=fs.readFileSync('assets/134-resanta-voice-ai360-pilot-v1.js','utf8');
const loader=fs.readFileSync('assets/137-resanta-ai360-lazy-launch-v1.js','utf8');
const html=fs.readFileSync('index.html','utf8');
assert.ok(server.indexOf('u.id!==OWNER_ID')<server.indexOf('const question='));
assert.ok(server.includes("profile.data?.role!=='boss'"));
assert.ok(server.includes("svc.rpc('crm_ai360_operations_snapshot_v1'"));
assert.ok(server.includes("svc.rpc('crm_ai360_debt_snapshot_v1'"), 'debt must use only narrow snapshot');
const sql=fs.readFileSync('supabase/migrations/20261028130000_ai360_debt_snapshot_v1.sql','utf8');
assert.ok(sql.includes('SET statement_timeout TO \'3500ms\''));
assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.crm_ai360_debt_snapshot_v1(text) FROM PUBLIC'));
assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.crm_ai360_debt_snapshot_v1(text) TO service_role'));
assert.ok(!/\bINSERT\s+INTO\b|\bUPDATE\s+public\.|\bDELETE\s+FROM\b/i.test(sql),'debt source must be read only');
assert.ok(server.includes("debtEvidence(r.data,manager)"));
assert.ok(server.indexOf("if(domain==='debt')")<server.indexOf("if(getTool(domain))"));
assert.ok(server.includes("text:{format:{type:'json_schema'"));
assert.ok(server.includes("answer_verified:failed.length===0&&partial_sources.length===0"));
assert.ok(!/\.update\(|\.insert\(|\.upsert\(|\.delete\(/.test(server),'no CRM writes');
assert.ok(core.includes("crmAI360UnifiedDialogFollowupV3(query"));
assert.ok(core.includes("options?.noVoice===true"));
assert.ok(core.includes("options?.fullVoice===true"));
assert.ok(loader.includes('143-resanta-ai360-unified-dialog-v1.js?v=6'));
assert.ok(html.includes('137-resanta-ai360-lazy-launch-v1.js?v=32'));
const events=[],requests=[];
let response={brief:'Отчёт: 111 тысяч. Хочешь подробности?',detail:'Проверенный полный разбор по отчёту от 27 октября.',followup_question:'Хочешь подробнее?',memory:{domain:'debt',month:'2026-10',manager:''}};
const ctx={
 navigator:{userAgent:'Macintosh'},
 currentUser:{id:'director'}, currentProfile:{role:'boss',name:'Александр Паюшин'},
 document:{getElementById:()=>({style:{display:'block'}}),addEventListener:()=>{}},
 window:{addEventListener:()=>{}},
 db:{auth:{getSession:async()=>({data:{session:{access_token:'stub'}}})},
  functions:{invoke:async (name,{body})=>{requests.push({name,body});return {data:response};}}},
 Promise,console,setTimeout
};
vm.runInNewContext(bridge,ctx);
const ui={answer:(text,options)=>events.push({text,options}),textStatus:()=>{}};
const delay=()=>new Promise(res=>setTimeout(res,35));
assert.equal(ctx.window.crmAI360UnifiedDialogHandleV1('Сколько просроченной ПДЗ?',ui),true);
await delay();
assert.equal(requests.length,1);
assert.equal(requests[0].name,'crm-ai360-dialog-v4');
assert.equal(events[0].text,response.brief);
assert.equal(events[0].options.fullVoice,true);
assert.equal(ctx.window.crmAI360UnifiedDialogHandleV1('да',ui),true);
assert.equal(requests.length,1,'yes should NOT call CRM or LLM again');
assert.equal(events[1].text,response.detail);
assert.equal(events[1].options.fullVoice,true);
response={brief:'Продажи: кратко.',detail:'Подробный план продаж.',followup_question:'Хочешь план?',memory:{domain:'sales',manager:'',month:'2026-10'}};
assert.equal(ctx.window.crmAI360UnifiedDialogHandleV1('Какие продажи?',ui),true);
await delay();
assert.equal(ctx.window.crmAI360UnifiedDialogHandleV1('покажи на экране',ui),true);
assert.equal(requests.length,2);
assert.equal(events.at(-1).options.noVoice,true);
response={brief:'Акции: 3.',detail:'Полный список акций.',followup_question:'Подробнее?',memory:{domain:'promotions',manager:'',month:'2026-10'}};
assert.equal(ctx.window.crmAI360UnifiedDialogHandleV1('Какие акции?',ui),true);
await delay();
assert.equal(ctx.window.crmAI360UnifiedDialogHandleV1('нет',ui),true);
assert.equal(requests.length,3,'no should not hit CRM');
assert.match(events.at(-1).text,/Хорошо/);
assert.equal(ctx.window.crmAI360UnifiedDialogHandleV1('открой продажи',ui),false,'existing navigation unaffected');
ctx.window.crmAI360UnifiedDialogResetV1();
console.log('PASS debt truth, feminine speech, short/long interaction, no duplicate DB on yes/no, 31-tool auth safeguards');
