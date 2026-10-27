'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict');
const client=fs.readFileSync('assets/142-resanta-ai360-director-proactive-brief-v1.js','utf8');
const core=fs.readFileSync('assets/134-resanta-voice-ai360-pilot-v1.js','utf8');
const date='2026-10-27';
const warning='План/факт менеджеров основан на том же источнике CRM KPI, что и вкладка менеджеров; показатели общей выручки сети рассчитаны иначе, поэтому прямое сопоставление без проверки методики приведёт к ошибке руководителя. Нельзя делать вывод об эффективности по несопоставимым данным.';
const payload={kind:'director_daily_brief',mode:'readonly',items_count:5,as_of:date,
 cards:[
 {id:'sales',title:'Отставание от плана: Шкуран',fact:'Октябрь: 49 246 BYN из 153 000 BYN. До плана 103 754 BYN.',action:'Проверить сделки и ближайшие отгрузки; запросить у менеджера подтверждённый план закрытия остатка. Не считать это прогнозом.',source:'KPI таблица',as_of:date},
 {id:'debt',title:'ПДЗ: проверить крупнейшую просрочку',fact:'Руд Буд ЧТУП — 25 538 BYN, просрочка 7 дней.',action:'Проверить оплату, претензии и комментарии по клиенту; связаться с ответственным.',source:'debt table',as_of:date},
 {id:'tasks',title:'Открытые и просроченные задачи',fact:'653 открытых, 452 с прошедшим сроком. Из них согласованных 40, требуют пересмотра статуса 412.',action:'Сначала перепроверить задачи со статусом «требует пересмотра». Просрочку по дате не считать доказанным неисполнением.',source:'tasks table',as_of:date},
 {id:'routes',title:'Клиент с падением закупок без маршрута',fact:'МИСАС ООО · Руднев: спад связанных закупок 21 602 BYN; будущий маршрут отсутствует.',action:'Предложить менеджеру проверить потребность и включение клиента в маршрут. Сначала проверить, не появилось ли новое поручение.',source:'routes table',as_of:date},
 {id:'triovist',title:'Триовист / 21vek: продажи и свежесть остатков',fact:'Октябрь 440 572 BYN из плана 681 000 BYN. Остатки устарели на 14 дней.',action:'Проверить актуальный остаток и пополнение 21vek, затем категории с отставанием; не обещать отгрузку по устаревшему снимку.',source:'triovist stock',as_of:'2026-10-13'}
 ],warnings:[warning],speech_summary:'Старый короткий список пяти областей.'};
(async()=>{
 const lines=[],statuses=[],calls=[],win={crmEnsureFreshSessionV236166:async()=>({access_token:'mock'}),setInterval:()=>1,clearInterval:()=>{}};
 const doc={querySelector:()=>null,getElementById:()=>({style:{display:'block'}})};
 const database={functions:{invoke:async(slug,{body})=>{calls.push({slug,body});return {data:payload}}}};
 new Function('window','navigator','document','currentUser','currentProfile','db',client)(
   win,{userAgent:'Macintosh Chrome' },doc,{id:'director'},{role:'boss',name:'Александр Паюшин'},database);
 assert.equal(typeof win.crmAI360DirectorBriefHandleV1,'function','brief route mounted');
 const handled=win.crmAI360DirectorBriefHandleV1('Лера, брифинг директора',{
   answer:(text,opts)=>lines.push({text,opts}),textStatus:t=>statuses.push(t)
 });
 assert.equal(handled,true);
 await new Promise(r=>setTimeout(r,25));
 assert.equal(calls.length,1,'one director-only readonly request');
 assert.equal(calls[0].body.kind,'director_brief');
 assert.equal(lines.length,1,'one detailed answer');
 const spoken=lines[0].opts?.briefingVoiceText;
 assert(typeof spoken==='string'&&spoken.length>=700&&spoken.length<=3600,'substantive but bounded five-part narration');
 for(const ordinal of ['Первый','Второй','Третий','Четвёртый','Пятый'])
   assert(spoken.includes(ordinal+' приоритет.'),'spoken section '+ordinal);
 for(const evidence of ['103 754 BYN','25 538 BYN','452 с прошедшим сроком','21 602 BYN','440 572 BYN'])
   assert(spoken.includes(evidence),'spoken CRM-grounded evidence '+evidence);
 assert.equal((spoken.match(/Что делать:/g)||[]).length,5,'five decisions to check');
 assert(!spoken.includes('KPI таблица')&&!spoken.includes('triovist stock'),'table names stay on screen');
 assert(!spoken.includes(warning),'technical warnings not read as management priorities');
 assert(lines[0].text.includes(warning),'long caveats preserved on screen, not cut at 250 chars');
 assert(!('speechSummary' in lines[0].opts),'no generic short summary dispatched');
 assert(core.includes('options?.briefingVoiceText'),'core accepts dedicated briefing narration');
 assert(core.includes('speak(compact,{shortSummary:!directorBriefVoice})'),'five-part narration uses full voice playback');
 assert(!/\.(?:insert|update|delete|upsert)\s*\(/.test(client+core),'voice briefing never mutates CRM');
 console.log('AI360 briefing narration: all five facts/actions aloud, technical warnings on screen, no task writes PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
