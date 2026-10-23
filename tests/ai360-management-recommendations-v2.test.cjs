'use strict';
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const fs=require('node:fs');
(async()=>{
 const r=await import(pathToFileURL(path.resolve('supabase/functions/crm-ai360-director-v1/intent-router.mjs')).href);
 const ops={
  scope:'Шкуран',period:{as_of:'2026-10-23',last_closed_month:'2026-09',last_closed_year_ago:'2025-09'},
  declining_clients:[
   {client_name:'ЛельТехноТорг ООО',manager_name:'Шкуран',loss:1318.65,next_route:'2026-10-27',
    open_tasks:3,overdue_tasks:1,last_visit:'2026-10-13'},
   {client_name:'Руд Буд ЧТУП',manager_name:'Шкуран',loss:985.27,next_route:'2026-10-28',
    open_tasks:2,overdue_tasks:0,last_visit:'2026-10-14'},
   {client_name:'ЦарьСтройДом ООО',manager_name:'Шкуран',loss:910.47,next_route:null,
    open_tasks:0,overdue_tasks:0,last_visit:'2026-10-13'}
  ],
  overdue_debtors:[
   {client_name:'Руд Буд ЧТУП',manager_name:'Шкуран Татьяна Григорьевна',
    debt_overdue:25538.23,debt_overdue_days:4},
   {client_name:'АдильхановаТрэйд ЧП',manager_name:'Шкуран Татьяна Григорьевна',
    debt_overdue:16833.42,debt_overdue_days:16},
   {client_name:'АвтоКолор-техно ООО',manager_name:'Шкуран Татьяна Григорьевна',
    debt_overdue:0.06,debt_overdue_days:120}
  ],
  debt_summary:{amount:51211.37,debtor_rows:6,report_date:'2026-10-23'},
  overdue_tasks_sample:[{manager_name:'Шкуран',title:'Тест'}]
 };
 const sales={managers:[{manager_name:'Шкуран',plan:153000,actual:46965.42,plan_pct:30.7,to_plan:106034.58}]};
 const plan=r.managerActionPlan(ops,'Шкуран',sales);
 assert(plan.includes('30,7%'));
 assert(plan.includes('отставание от плана, не доказательство общего падения выручки'));
 assert(plan.includes('27 октября 2026 года') && plan.includes('28 октября 2026 года'));
 assert(plan.includes('уже в маршруте'));
 assert(plan.includes('Не назначать повторно'));
 assert(plan.includes('Сначала проверить 2 открытых задач'));
 assert(plan.includes('Сначала проверить 1 просроченных задач'));
 assert(plan.toLowerCase().includes('проверить существующие маршруты'));
 assert(plan.includes('проект задачи на согласование'));
 assert(plan.includes('не создавались'));
 assert(plan.includes('не гарантируют возврат объёма'));
 assert(plan.includes('В ПДЗ есть запись с таким же названием: 25') && plan.includes('Сверить контрагента по реквизитам'),
 'exact-name matching should flag the same client debt but require counterparty verification');
 assert(!plan.includes('МИСАС')&&!plan.includes('Шанс-Хоум'));
 assert(plan.includes('Ответственный: Шкуран'));
 assert(plan.includes('Результат: подтверждённая потребность'));
 assert(plan.includes('До визита подготовить'));
 const short=r.managementSpeech(ops,'Шкуран',sales);
 assert(short.length<=190,'speech must be concise, got '+short.length);
 assert(short.includes('ЛельТехноТорг'));
 assert(!short.includes('МИСАС'));
 assert(!short.includes('153000'));
 assert.equal(r.classify('Там порекомендую, чтобы она продала и закрыла свой план'),'recommendations');
 const cross={...ops,declining_clients:[{...ops.declining_clients[0],manager_name:'Руднев'}]};
 assert(r.managerActionPlan(cross,'Шкуран',sales).includes('чужим клиентам'));
 const report=r.debtPriorityAnswer(ops,'Шкуран');
 assert(report.includes('51')&&report.includes('Руд Буд ЧТУП'));
 assert(report.includes('Крупный долг'));
 assert(report.includes('Мелкие остатки до 1 BYN (1 поз.)'));
 assert(!report.includes('АвтоКолор-техно ООО:'));
 const crossDebt={...ops,overdue_debtors:[{...ops.overdue_debtors[0],manager_name:'Руднев Дмитрий'}]};
 assert(r.debtPriorityAnswer(crossDebt,'Шкуран').includes('чужую задолженность'));
 const stranger={...ops,scope:'вся сеть'};
 assert(r.managerActionPlan(stranger,'Шкуран',sales).includes('чужим клиентам'));
 assert.equal(r.classify('Что делать с ПДЗ Шкуран?'),'recommendations');
 assert.equal(r.classify('Какие клиенты Шкуран снизили закупки?'),'clients');
 const edge=fs.readFileSync('supabase/functions/crm-ai360-director-v1/index.ts','utf8');
 assert(edge.includes("intent==='recommendations'&&verifiedFocus"));
 assert(edge.includes("intent==='debt'"));
 assert(edge.includes('debtPriorityAnswer(operations,verifiedFocus)'));
 assert(edge.includes('managerActionPlan(operations,verifiedFocus,snapshot)'));
 assert(edge.includes('не доказательств')||edge.includes('НЕ доказывает'));
 assert(!edge.includes("svc.from('tasks').update"),'no direct writes to tasks');
 console.log('Director manager actions, scheduled visits, task reuse and PДЗ materiality: OK');
})().catch(e=>{console.error(e);process.exit(1);});
