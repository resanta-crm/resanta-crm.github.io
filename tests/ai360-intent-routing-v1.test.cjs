'use strict';
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
const url=pathToFileURL(path.resolve('supabase/functions/crm-ai360-director-v1/intent-router.mjs')).href;
(async()=>{
 const r=await import(url);
 const cases=[
  ['какие продажи у шкуран ?','sales'],
  ['Какие сейчас продажи Шкуран','sales'],
  ['Сколько продал Руднев в октябре','sales'],
  ['А какой план и факт у Ачинович','sales'],
  ['Выполнение KPI у Шкурана','sales'],
  ['Какая дебиторская задолженность у Шкуран','debt'],
  ['Сколько долгов у Руднева','debt'],
  ['Проверь просроченную ПДЗ Ачинович','debt'],
  ['Какие просроченные задачи у Шкуран','tasks'],
  ['Сколько поручений Рудневу ещё не выполнено','tasks'],
  ['Какие маршруты завтра у Шкуран','routes'],
  ['План визитов Руднева','routes'],
  ['Когда Ачинович была у клиентов?','visits'],
  ['Какие клиенты перестали закупать?','clients'],
  ['У каких клиентов Руднева упали продажи?','clients'],
  ['Почему упали продажи Шкуран?','analysis'],
  ['В чём причины отставания менеджера?','analysis'],
  ['Что делать по продажам Руднева?','recommendations'],
  ['Какие задачи поставить, чтобы клиенты купили?','recommendations'],
  ['Как быть теперь по продажам Руднева?','recommendations'],
  ['Какие продажи и долги у Шкуран?','multi'],
  ['Просто сравни продажи с задолженностью','multi']
 ];
 for(const [q,expect] of cases){
   const got=r.classify(q);
   assert.equal(got,expect,JSON.stringify({question:q,got,expect}));
 }
 const sales={
  month:'2026-10',managers:[
   {manager_name:'Шкуран',plan:153000,actual:46696.19,plan_pct:30.5,to_plan:106303.81},
   {manager_name:'Руднев',plan:159000,actual:123559.48,plan_pct:77.7,to_plan:35440.52}
  ],network_revenue:215186.45,freshness:{last_success_at:'2026-10-22T11:20:25Z'}
 };
 const ops={
  period:{as_of:'2026-10-22'},scope:'Шкуран',warnings:['only linked clients'],
  client_summary:{active_clients:229,buying_clients_in_month:10,yoy_down_clients:7},
  declining_clients:[{client_name:'Тестовый клиент',closed_year_ago:100,closed_month:20}],
  debt_summary:{amount:50249.13,debtor_rows:5,report_date:'2026-10-22'},
  overdue_debtors:[{client_name:'Тестовый должник',debt_overdue:50249.13}],
  task_summary:{open_tasks:170,overdue_tasks:127},
  overdue_tasks_sample:[{title:'Выполнить задачу'}],
  route_summary:{planned_next30:72,approved_next30:60},
  visit_summary:{visits_90d:150,last_visit:'2026-10-22'}
 };
 const straightforward=r.directSalesAnswer(sales,'Шкуран','2026-10');
 assert(straightforward.includes('Шкуран'));
 assert(straightforward.includes('46\u00a0696,19')||straightforward.includes('46 696,19'));
 assert(straightforward.includes('153\u00a0000,00')||straightforward.includes('153 000,00'));
 assert(straightforward.includes('30,5%'));
 assert(straightforward.includes('106\u00a0303,81')||straightforward.includes('106 303,81'));
 assert(!/долг|дебитор|задолж/i.test(straightforward));
 const salesOnly=r.selectEvidence('sales',sales,ops);
 assert(salesOnly.sales);
 assert.equal(salesOnly.operations,undefined,'sales question may not receive unrelated debt and tasks data');
 const debtOnly=r.selectEvidence('debt',sales,ops);
 assert(!debtOnly.sales,'debt-only question may not receive sales data');
 assert(debtOnly.operations.debt_summary);
 assert(!debtOnly.operations.task_summary);
 assert(!debtOnly.operations.client_summary);
 const taskOnly=r.selectEvidence('tasks',sales,ops);
 assert(taskOnly.operations.task_summary);
 assert(!taskOnly.operations.debt_summary);
 const routeOnly=r.selectEvidence('routes',sales,ops);
 assert(routeOnly.operations.route_summary);
 assert(!routeOnly.operations.debt_summary);
 const composite=r.selectEvidence('analysis',sales,ops);
 assert(composite.sales&&composite.operations.debt_summary&&composite.operations.task_summary);
 assert.equal(r.needsOperations('sales'),false);
 assert.equal(r.needsSales('debt'),false);
 assert.deepEqual(r.verifyAnswer('sales','У Шкуран 5 клиентов с просроченной задолженностью'),{ok:false,reason:'unrelated_topic'});
 assert.equal(r.verifyAnswer('sales','Продажи Шкуран по плану 153000 BYN, факт 46696 BYN').ok,true);
 assert.equal(r.verifyAnswer('debt','Просроченная задолженность составляет 50 тысяч').ok,true);
 assert.equal(r.verifyAnswer('tasks','По маршрутам всё отлично, вчера посетили клиентов').ok,false);
 assert.equal(r.fallbackAnswer('debt','Шкуран',ops,sales).includes('50'),true);
 assert.equal(r.fallbackAnswer('sales','Шкуран',ops,sales),straightforward);
 // The user's real failure case: sales may never be replaced by five debtors.
 assert(!r.directSalesAnswer(sales,'Шкуран','2026-10').includes('Руд Буд'));
 assert(!r.directSalesAnswer(sales,'Шкуран','2026-10').includes('ПДЗ'));
 console.log('AI360 intent routing + source isolation + grounded direct sales + response guard: OK; cases='+cases.length);
})().catch(error=>{console.error(error);process.exit(1);});
