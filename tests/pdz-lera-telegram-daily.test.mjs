import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 clean,surname,matchManager,chooseRecipientRows,greeting,managerBrief,leaderBrief,
 actionFor,contactStatus,statusCounts,keyOf
} from '../supabase/functions/crm-pdz-telegram/lera-message.mjs';
const source=readFileSync(new URL('../supabase/functions/crm-pdz-telegram/index.ts',import.meta.url),'utf8');
const users=[
 {id:'dfs',name:'Александр Паюшин',email:'payushin_ar@resanta.ru',region:'Витебск',role:'boss'},
 {id:'df',name:'Сидарович К.Н.',email:'sidarovich_kn@resanta.ru',region:'Витебск',role:'boss'},
 {id:'gomel',name:'Самойлов Д. С.',email:'samoylov@resanta.ru',region:'Гомель',role:'boss'},
 {id:'rudnev',name:'Руднев',region:'Витебск',role:'manager',access_scope:'standard'},
 {id:'ach',name:'Ачинович',region:'Витебск',role:'manager',access_scope:'standard'},
 {id:'shk',name:'Шкуран',region:'Витебск',role:'manager',access_scope:'standard'},
 {id:'tri',name:'Кришталь',region:'Триовист / 21vek.by',role:'manager',access_scope:'triovist'}
];
const debt=[
 {client_name:'Лепельтехнострой ЧП',manager_name:'Руднев Александр Александрович',debt_overdue:15000.55,debt_overdue_days:32},
 {client_name:'Клиент & Строй',manager_name:'Руднев Александр Александрович',debt_overdue:7200.52,debt_overdue_days:48},
 {client_name:'Бобруйскстрой',manager_name:'Ачинович Екатерина Геннадьевна',debt_overdue:9500,debt_overdue_days:12},
 {client_name:'Точка Шкуран',manager_name:'Шкуран Татьяна Григорьевна',debt_overdue:2000,debt_overdue_days:19},
 {client_name:'Гомельский склад',manager_name:'Будущий менеджер',debt_overdue:5600,debt_overdue_days:10}
];
const today='2026-11-11',reportDate='2026-11-10';
test('surname scope is exact and never a substring coincidence',()=>{
 assert.ok(matchManager('Руднев Александр Александрович','Руднев'));
 assert.ok(!matchManager('Руднева Мария','Руднев'));
 assert.ok(!matchManager('Ачинович Екатерина','Руднев'));
 assert.equal(surname('Руднев Александр'),'руднев');
});
test('field managers see only their assigned records; no unauthorized Triovist or new regional debt',()=>{
 const rows=chooseRecipientRows(users[3],debt,users);
 assert.equal(rows.length,2);
 assert.ok(rows.every(r=>r.manager_name.startsWith('Руднев')));
 assert.equal(chooseRecipientRows(users[4],debt,users).length,1);
 assert.equal(chooseRecipientRows(users[6],debt,users).length,0);
 const impostor={id:'other',name:'Руднев',role:'manager',access_scope:'standard'};
 assert.equal(chooseRecipientRows(impostor,debt,users).length,0);
});
test('DFS sees the existing full network; branch director only verified Vitebsk managers',()=>{
 const dfs=chooseRecipientRows(users[0],debt,users);
 const df=chooseRecipientRows(users[1],debt,users);
 const gomel=chooseRecipientRows(users[2],debt,users);
 assert.equal(dfs.length,5);
 assert.equal(df.length,4);
 assert.equal(gomel.length,0,'no Goumel client is inferred from a surname/unknown manager');
 assert.ok(df.every(x=>x.client_name!=='Гомельский склад'));
});
test('managers get a warm personalized Lera greeting and every debtor with required action',()=>{
 const rows=chooseRecipientRows(users[3],debt,users);
 const digest=managerBrief({user:users[3],binding:{telegram_first_name:'Саша'},rows,previousRows:rows.map(x=>({...x,debt_overdue:x.debt_overdue+100})),
  reportDate,today,evidence:new Map(),legalAction:()=>''});
 assert.match(digest.header,/Привет, Саня! Это Лера/);
 assert.match(digest.header,/последний загруженный отчёт/);
 assert.match(digest.header,/2<\/b> · просрочено обещаний/);
 assert.match(digest.header,/-200,00 BYN/);
 assert.equal(digest.lines.filter(x=>x.includes('<b>')&&x.includes('BYN')).length,2);
 assert.match(digest.lines[1],/Клиент &amp; Строй/);
 assert.match(digest.lines[0],/Свяжись с клиентом/);
 assert.match(digest.lines.at(-1),/Отметка в Telegram не заменяет запись в CRM/);
});
test('known payment promises stop first-contact reminders but past promises require verification',()=>{
 const row=debt[0];
 const evidence=new Map([[keyOf(row),{created_at:'2026-11-10T12:00:00Z',promised_date:'2026-11-13',amount:4500}]]);
 const digest=managerBrief({user:users[3],rows:[row],previousRows:null,reportDate,today,evidence});
 assert.equal(digest.counts.promise_planned,1);
 assert.equal(digest.counts.no_record,0);
 assert.match(digest.lines[0],/Ожидается 13\.11\.2026 · 4\s?500,00 BYN/);
 evidence.set(keyOf(row),{created_at:'2026-11-10T12:00:00Z',promised_date:'2026-11-10',amount:4500});
 assert.equal(contactStatus(evidence.get(keyOf(row)),today),'promise_overdue');
 assert.match(actionFor(row,evidence.get(keyOf(row)),today),/Срок обещания 10\.11\.2026 прошёл/);
 assert.match(actionFor(row,evidence.get(keyOf(row)),today),/Сверь реестр оплат/);
});
test('leadership digest covers each scoped manager, unresolved contacts and customer priorities',()=>{
 const rows=chooseRecipientRows(users[1],debt,users);
 const digest=leaderBrief({user:users[1],rows,previousRows:null,reportDate,today,evidence:new Map(),managerUsers:users});
 assert.match(digest.header,/Сидарович К\.Н\./);
 assert.equal(digest.debtors,4);
 assert.equal(digest.counts.no_record,4);
 assert.match(digest.lines.join('\n'),/Руднев/);
 assert.match(digest.lines.join('\n'),/Шкуран/);
 assert.doesNotMatch(digest.lines.join('\n'),/Гомельский склад/);
 assert.match(digest.lines.join('\n'),/В первую очередь проверь/);
});
test('reporting statements never turn decreased debt into an asserted receipt',()=>{
 const digest=managerBrief({user:users[3],rows:debt.slice(0,2),previousRows:debt.slice(0,2),reportDate,today,evidence:new Map()});
 assert.match(digest.header,/не подтверждение оплаты/);
 assert.doesNotMatch(digest.header,/поступила оплата|деньги пришли/);
});
test('original authenticated dispatch stays in place, reuses binding and dedupe keys',()=>{
 assert.match(source,/x-crm-dispatch-secret/);
 assert.match(source,/pdz_daily_sent:/);
 assert.match(source,/pdz_daily_group_sent:/);
 assert.match(source,/crm_telegram_bindings/);
 assert.match(source,/TELEGRAM_BOT_TOKEN/);
 assert.match(source,/chooseRecipientRows/);
 assert.match(source,/verifiedComments/);
 assert.match(source,/leaderBrief/);
 assert.match(source,/managerBrief/);
 assert.doesNotMatch(source,/createBot\(|registerBot\(|setWebhook\(/);
 assert.doesNotMatch(source,/\.from\('tasks'\)\.(insert|upsert|update|delete)/);
});

test('Lera uses familiar individual names only for exactly matched manager accounts',()=>{
 const ac=managerBrief({user:users[4],binding:{telegram_first_name:'Катя'},rows:[debt[2]],previousRows:null,reportDate,today,evidence:new Map()});
 const sh=managerBrief({user:users[5],binding:{telegram_first_name:'Таня'},rows:[debt[3]],previousRows:null,reportDate,today,evidence:new Map()});
 assert.match(ac.header,/Привет, Катюшка! Это Лера/);
 assert.match(sh.header,/Привет, Танюшка! Это Лера/);
 const impostor={name:'Ачиновиченко',role:'manager'};
 assert.notEqual(greeting(impostor,[],{telegram_first_name:'Лена'}),'Катюшка');
 assert.match(greeting(users[1],[]),/Сидарович/);
});
