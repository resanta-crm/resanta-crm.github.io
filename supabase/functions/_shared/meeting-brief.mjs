const n=x=>Number.isFinite(Number(x))?Number(x):0;
const money=x=>n(x).toLocaleString('ru-RU',{maximumFractionDigits:2})+' BYN';
const label=m=>new Date(m+'-01T12:00Z').toLocaleDateString('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'});
const age=(today,date)=>/^\d{4}-\d\d-\d\d/.test(date||'')?Math.floor((Date.parse(today)-Date.parse(date.slice(0,10)))/86400000):null;
export function buildMeetingBrief({today,month,sales,operations=[],tri,taskMetrics=[],scope}){
 const cards=[],warnings=[];const closed=month<today.slice(0,7);
 const add=(id,level,title,fact,action,source,as_of,reason)=>cards.push({id,level,title,fact,action,source,as_of:as_of||null,reason,attention:level==='high'||level==='medium',scope:'profiled_metrics'});
 if(sales){
  const managers=(sales.managers||[]).filter(x=>n(x.plan)>0).sort((a,b)=>n(a.plan_pct)-n(b.plan_pct));
  const m=managers[0],gap=m&&n(m.to_plan)>0;
  const reportDay=String(sales.freshness?.report_date||'').slice(0,10),untrusted=!reportDay||reportDay>today||sales.freshness?.status!=='ok';
  if(untrusted)warnings.push('Продажи: дата или свежесть отчёта не подтверждает актуальный факт. Не использовать как доказательство критического отклонения.');
  add('sales',gap?(closed&&!untrusted?'high':'medium'):'info',gap?(closed?'Итог месяца: план не выполнен':'Продажи: остаток к месячному плану'):'Продажи и KPI',
   label(month)+': '+(m?m.manager_name+' — '+money(m.actual)+' из '+money(m.plan)+' ('+n(m.plan_pct).toFixed(1)+'%). Остаток '+money(m.to_plan)+'.':'Утверждённые планы менеджеров не найдены.'),
   closed?'Проверить причины и согласовать действия.':'Обсудить ближайшие отгрузки; месячный план ещё не завершён. Это не прогноз темпа.',
   'crm_ai360_sales_kpi_snapshot_v1',sales.freshness?.report_date||sales.freshness?.last_success_at,
   gap?(closed?'Выбранный месяц завершён, есть остаток к утверждённому плану.':'Месяц не завершён; сам остаток к плану не является критическим отставанием.'):'Подтверждённого отклонения не найдено; полнота планов требует проверки.');
  warnings.push(...(sales.warnings||[]));
 }else add('sales','unknown','Продажи: источник недоступен','Расчёт не получен.','Обновить подготовку.','crm_ai360_sales_kpi_snapshot_v1',null,'Отсутствие данных не означает отсутствие проблем.');
 const debtors=operations.flatMap(x=>x.overdue_debtors||[]).filter(x=>n(x.debt_overdue)>0).sort((a,b)=>n(b.debt_overdue)-n(a.debt_overdue));
 const d=debtors[0],date=operations.map(x=>x.debt_summary?.report_date).filter(Boolean).sort().at(-1),days=age(today,date);
 add('debt',!operations.length?'unknown':d?(days===null||days>2||days<0?'medium':'high'):'info',d?'ПДЗ: крупнейшая подтверждённая просрочка':'Задолженность: проверка реестра',
  d?d.client_name+' — '+money(d.debt_overdue)+', '+n(d.debt_overdue_days)+' дней. Отчёт: '+(date||'дата неизвестна')+'.':'В доступном профильном расчёте просроченные суммы не найдены.',
  'Проверить оплаты и комментарии ответственного; не создавать повторное поручение.',
  'crm_ai360_operations_snapshot_v1 / client_debt',date,
  d?(days===null||days>2||days<0?'Требуется обновление отчёта; актуальную сумму нужно подтвердить.':'Просроченная сумма подтверждена свежим отчётом. Крупнейший должник в разрешённой области.'):'Проверка ограничена действующим расчётом реестра.');
 const taskOk=taskMetrics.length>0;const sum=k=>taskMetrics.reduce((s,x)=>s+n(x.metrics?.[k]),0);
 add('tasks',!taskOk?'unknown':sum('risk_count')>0?'high':sum('stale_open')>0?'medium':'info','Задачи: исполнение и пересмотр отдельно',
  taskOk?sum('approved_open')+' подтверждённых открытых; '+sum('risk_count')+' с прошедшим сроком. Требуют пересмотра '+sum('stale_open')+', из них с прошедшим сроком '+sum('stale_overdue')+'.':'Разделение задач не получено.',
  'Проверить подтверждённые просроченные поручения; старые записи вынести на пересмотр.',
  'crm_meeting_source_metrics_v2 / tasks',today,
  sum('risk_count')>0?'Высокий приоритет относится только к подтверждённым поручениям с прошедшим сроком, а не к доказанному неисполнению.':'Записи на пересмотр не приравниваются к неисполненным поручениям.');
 const opp=operations.flatMap(x=>x.declining_clients||[]).find(x=>n(x.loss)>0&&n(x.open_tasks)===0&&!x.next_route);
 const period=operations[0]?.period;
 add('routes',opp?'medium':'info','Клиенты с падением закупок и маршруты',opp?opp.client_name+' — снижение '+money(opp.loss)+'. В профильной выборке нет следующего маршрута и открытого поручения.':'Подходящая проблема в профильной выборке не найдена.',
  'Проверить потребность клиента и план следующего визита.', 'crm_ai360_operations_snapshot_v1',today,
  'Сравнение закрытого месяца '+(period?.last_closed_month||'перед '+month)+' с аналогичным месяцем прошлого года. Список проблемных клиентов ограничен исходным расчётом.');
 if(tri){
  const days=age(today,tri.partner_stock_date),bad=days===null||days<0||days>10,gap=n(tri.plan)>n(tri.revenue);
  add('triovist',bad?'medium':gap&&closed?'high':gap?'medium':'info','Триовист / 21vek: продажи и остатки',
   label(month)+': '+money(tri.revenue)+' из плана '+money(tri.plan)+'. Остатки партнёра: '+(tri.partner_stock_date||'дата неизвестна')+'.',
   'Сверить актуальный импорт и потребность в пополнении.','crm_ai360_triovist_brief_v1',tri.partner_stock_date,
   bad?'Проблема качества данных: остатки требуют подтверждения.':closed?'Итог выбранного закрытого месяца.':'Месяц не завершён; остаток к плану не является прогнозом.');
 }
 warnings.push('Продажи относятся к выбранному месяцу; задачи, задолженность и доступность маршрутов — к текущему состоянию. Историю этих состояний задним числом не восстанавливаем.');
 return {kind:'director_daily_brief',mode:'readonly',as_of:today,generated_at:new Date().toISOString(),month,scope,cards:cards.sort((a,b)=>({high:0,medium:1,unknown:2,info:3}[a.level]-{high:0,medium:1,unknown:2,info:3}[b.level])),items_count:cards.length,warnings:[...new Set(warnings)].slice(0,8),disclaimer:'Рекомендации для проверки. Действия не выполнены.'};
}
