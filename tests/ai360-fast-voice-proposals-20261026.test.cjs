'use strict';
const fs=require('node:fs');
const assert=require('node:assert/strict');
const text=fs.readFileSync('supabase/functions/crm-ai360-task-drafts-v1/index.ts','utf8');
const voice=fs.readFileSync('assets/135-resanta-voice-capture-fix-v2.js','utf8');
const client=fs.readFileSync('assets/140-resanta-ai360-task-drafts-preview-v1.js','utf8');
// Isolate pure rule functions from the Edge source, stripping only TypeScript annotations.
// No external API or real customer records involved in the test.
let pure=text.slice(text.indexOf('function draftFor('),text.indexOf('Deno.serve('));
assert(pure.includes('function draftFor(')&&pure.includes('function mentionedManager('));
pure=pure.replace('row:any, today:string','row,today')
 .replace('value:string','value')
 .replace('question:string,roster:any[]','question,roster');
const norm=x=>String(x||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU');
const engine=new Function('norm',pure+'return {draftFor,mentionedManager};')(norm);
const today='2026-10-26';
const stale=engine.draftFor({closed_year_ago:1000,closed_month:200,last_visit:'2026-06-01'},today);
const bigDrop=engine.draftFor({closed_year_ago:1800,closed_month:400,last_visit:'2026-10-20'},today);
const ordinary=engine.draftFor({closed_year_ago:1500,closed_month:1300,last_visit:'2026-10-20'},today);
assert(stale.title.includes('визит'),'long-unvisited client must require an appointment');
assert(stale.criteria.includes('Дата визита'),'appointment has measurable result');
assert(bigDrop.title.includes('резким падением'),'heavy decline must have explicit recovery action');
assert(bigDrop.priority==='высокий','decline magnitude sets priority');
assert(ordinary.title.includes('повторный заказ'),'moderate decline leads to next-order action');
assert(ordinary.expected_result.includes('сумма'),'next-order outcome is measurable');
assert(ordinary.basis_detail.includes('200.00 BYN'),'gap is computed from evidence only');
assert(!/гарантирован|обеща|прогноз.*рост/i.test([stale,bigDrop,ordinary].map(x=>JSON.stringify(x)).join('')),'no fabricated growth promises');
const roster=[{name:'Руднев'},{name:'Ачинович'},{name:'Шкуран'}];
assert.equal(engine.mentionedManager('Лера, предложи три поручения для Руднева',roster)?.name,'Руднев');
assert.equal(engine.mentionedManager('предложи поручения Шкурану',roster)?.name,'Шкуран');
assert.equal(engine.mentionedManager('предложи поручения для Руднева и Шкуран',roster),null);
assert.equal(engine.mentionedManager('предложи поручения',roster),null);
assert(text.includes("payload?.kind==='preview_query'"),'single-call server entrypoint');
assert(text.includes("await Promise.all(["),'independent task/route checks in parallel');
assert(text.includes("const chosen:any[]=[]"),'select distinct task categories if actual data supports them');
assert(client.includes("kind:'preview_query',message:question"),'one request from browser');
assert(!client.includes("body:{kind:'directory'"),'no redundant directory roundtrip');
assert(!/\.(?:insert|upsert|update|delete)\s*\(/.test(text+client+voice),'no CRM writes introduced');
assert(text.includes("user.id!==OWNER_ID")&&text.includes("profile.data?.role!=='boss'"),'strict authorization retained');
assert(text.includes("matched.length===1"),'ambiguous client name rejected');
assert(text.includes("!busy.has(x.c.id)&&!scheduled.has(x.c.id)"),'task and route dedup retained');
console.log('AI360 fast proposals: one request, distinct evidence-based tasks, strict director guard and no writes PASS');
