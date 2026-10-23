/* Director AI360 intent router, v1. Pure ES module; no database/network access.
   One current question overrides prior conversation topic. Direct KPI facts are rendered
   deterministically from authenticated CRM snapshots, never composed by a model. */
const norm=(value)=>String(value||'').toLocaleLowerCase('ru-RU').replaceAll('ё','е');
const num=(value)=>Number.isFinite(Number(value))?Number(value):0;
export const money=(value)=>num(value).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
export function classify(question){
 const q=norm(question).trim();
 const commercial=/(продаж|выруч|оборот|отгруз|реализац|кпи|kpi|выполн.{0,16}(?:план|кпи|kpi)|недобор|план\s+и\s+факт|план\s+факт|сколько.{0,24}продал|план.{0,20}(?:продаж|отгруз))/.test(q);
 const debt=/(долг|задолж|дебит|пдз|оплат|не плат|просроч.{0,18}(?:долг|задолж|платеж))/.test(q);
 const task=/(задач|поруч|задани|что постав|что поруч)/.test(q);
 const route=/(маршрут|запланир.{0,20}(?:визит|посещ)|план.{0,20}(?:визит|посещ))/.test(q);
 const visit=/(визит|посещ|встреч|когда.{0,45}был[аи]?|давно.{0,12}не был)/.test(q);
 const client=/(клиент|покупат|покупк|закуп|не покуп|не закуп|просел|потерян|сократили закуп)/.test(q);
 const why=/(почему|причин|из-за чего|за счет чего|что повли|объясни отстав|как получилось)/.test(q);
 const recommendation=/(как быть|что делать|что предлага|что порекоменду|порекоменд|посоветуй|подскажи.{0,35}(?:делат|шаг|действ|план)|что.{0,22}(?:сделат|предпринят)|что.{0,25}ей.{0,20}(?:делат|сделат)|как исправ|как увелич|что предприн|какие действия|как вернуть|как застав|как.{0,20}закрыт.{0,15}план|чтобы.{0,45}(?:купил|закуп|продал|закрыл|выполн)|закры.{0,10}(?:свой\s+)?план|составь.{0,15}(?:поруч|задач|план\s+действ)|подготовь.{0,15}(?:поруч|задач|план\s+действ))/.test(q);
 // Explicit action/causation takes priority over a keyword contained in the sentence.
 if(recommendation)return 'recommendations';
 if(why)return 'analysis';
 const tags=[commercial&&'sales',debt&&'debt',task&&'tasks',route&&'routes',visit&&'visits',client&&'clients'].filter(Boolean);
 if(tags.length===0)return 'analysis'; // Follow-ups retain evidence but never invent numeric scope.
 // Client or visit mentions in a question about sales do not automatically make it
 // a sales-and-debt question; debt is a clearly separate requested topic.
 if(tags.includes('debt')&&tags.includes('sales'))return 'multi';
 if(tags.includes('sales') && tags.includes('tasks') && /(?:и|сравни|вместе).{0,25}(?:задач|просроч)/.test(q))return 'multi';
 if(tags.includes('sales') && tags.includes('clients') && /(у каких|какие клиент|по клиент|падение клиент|просел)/.test(q))return 'clients';
 if(tags.includes('routes'))return 'routes';
 if(tags.includes('visits')&&!commercial)return 'visits';
 if(tags.includes('debt'))return 'debt';
 if(tags.includes('tasks')&&!commercial)return 'tasks';
 if(tags.includes('sales'))return 'sales';
 if(tags.includes('clients'))return 'clients';
 return tags[0];
}
export const needsSales=(kind)=>['sales','analysis','recommendations','multi'].includes(kind);
export const needsOperations=(kind)=>kind!=='sales';
export function selectEvidence(kind,sales,ops){
 const period=ops?.period||null;
 const root={intent:kind};
 if(needsSales(kind)&&sales){
   root.sales={
     month:sales.month,scope:sales.scope,managers:sales.managers,
     network_revenue:sales.network_revenue,planned_managers_plan:sales.planned_managers_plan,
     planned_managers_revenue:sales.planned_managers_revenue,
     freshness:sales.freshness,warnings:sales.warnings
   };
 }
 if(ops&&kind!=='sales'){
   const v={period,scope:ops.scope,warnings:ops.warnings};
   if(['analysis','recommendations','multi','clients'].includes(kind)){
     v.client_summary=ops.client_summary;
     v.declining_clients=ops.declining_clients;
   }
   if(['analysis','recommendations','multi','debt'].includes(kind)){
     v.debt_summary=ops.debt_summary;
     v.overdue_debtors=ops.overdue_debtors;
   }
   if(['analysis','recommendations','multi','tasks'].includes(kind)){
     v.task_summary=ops.task_summary;
     v.overdue_tasks_sample=ops.overdue_tasks_sample;
   }
   if(['analysis','recommendations','multi','routes'].includes(kind))
     v.route_summary=ops.route_summary;
   if(['analysis','recommendations','multi','visits'].includes(kind))
     v.visit_summary=ops.visit_summary;
   // Visits and route dates for declining clients are already present in their records.
   if(kind==='visits'||kind==='routes')
     v.client_visit_examples=(ops.declining_clients||[]).slice(0,6).map(x=>({
       client_name:x.client_name,last_visit:x.last_visit,next_route:x.next_route,
       visits_90d:x.visits_90d
     }));
   root.operations=v;
 }
 return root;
}
const MONTHS=['','января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
export function monthLabel(raw){
 const match=String(raw||'').match(/^(20\d\d)-(0[1-9]|1[0-2])$/);
 return match?MONTHS[Number(match[2])]+' '+match[1]+' года':String(raw||'неизвестный месяц');
}
export function dateLabel(raw){
 const m=String(raw||'').slice(0,10).match(/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
 return m?Number(m[3])+' '+MONTHS[Number(m[2])]+' '+m[1]+' года':String(raw||'дата не установлена');
}
const shortDate=(source)=>{
 const s=String(source||'').slice(0,10);
 const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
 return m?m[3]+'.'+m[2]+'.'+m[1]:null;
};
export function directSalesAnswer(sales,focus,month){
 if(!sales)return null;
 const period=String(sales.month||month||'').trim();
 const label=period?monthLabel(period):'текущий месяц';
 const updated=shortDate(sales.freshness?.last_success_at);
 const last=updated?' Последнее обновление продаж: '+dateLabel(sales.freshness.last_success_at)+'.':'';
 const incomplete=' Текущий месяц ещё не завершён; источник продаж помесячный.';
 const wanted=norm(focus).trim();
 if(wanted){
  const manager=(Array.isArray(sales.managers)?sales.managers:[]).find(m=>norm(m?.manager_name).trim()===wanted);
  if(!manager)return 'По менеджеру '+focus+' за '+label+' в CRM нет утверждённого плана и проверенного факта KPI. Не буду подменять их задолженностью или данными других менеджеров.';
  const pct=Number(manager.plan_pct);
  const percentage=Number.isFinite(pct)?pct.toLocaleString('ru-RU',{maximumFractionDigits:1})+'%':'нет расчёта';
  const gap=Number(manager.to_plan);
  const variance=gap<0?'план перевыполнен на '+money(Math.abs(gap)):'до плана '+money(gap);
  return 'Продажи менеджера '+manager.manager_name+' за '+label+': план '+money(manager.plan)+
    ', факт '+money(manager.actual)+', выполнение '+percentage+
    ', '+variance+'.'+last+incomplete;
 }
 const managers=Array.isArray(sales.managers)?sales.managers:[];
 if(!managers.length)return 'За '+label+' в проверенном источнике нет данных о планах и продажах менеджеров.';
 const lines=managers.map(m=>m.manager_name+': факт '+money(m.actual)+
  ', план '+money(m.plan)+', выполнение '+num(m.plan_pct).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%');
 return 'Продажи менеджеров за '+label+': '+lines.join('; ')+'.'+
  (sales.network_revenue!==undefined?' Общая выручка из импорта: '+money(sales.network_revenue)+'.':'')+
  last+incomplete;
}
export function directClientAnswer(ops,focus){
 if(!focus)return 'Уточни менеджера или скажи «по всей сети», чтобы я не смешала клиентов разных территорий.';
 if(!ops || String(ops.scope||'').toLocaleLowerCase('ru-RU')!==String(focus).toLocaleLowerCase('ru-RU'))
  return 'Не удалось подтвердить закрепление клиентов за '+focus+'. Чужих клиентов предлагать не буду.';
 const list=Array.isArray(ops.declining_clients)?ops.declining_clients:[];
 if(list.some(c=>String(c.manager_name||'').toLocaleLowerCase('ru-RU')!==String(focus).toLocaleLowerCase('ru-RU')))
  return 'Обнаружено несоответствие закрепления клиентов за '+focus+'. Рекомендации временно не показываю.';
 const period=monthLabel(ops.period?.last_closed_month)||'последний закрытый месяц';
 const prev=monthLabel(ops.period?.last_closed_year_ago)||'соответствующий месяц год назад';
 if(!list.length)return 'По закреплённым за '+focus+' клиентам нет подтверждённых примеров снижения закупок в сравнении '+period+' с '+prev+'. Для плана отгрузок нужна проверка заявок и остатков.';
 const bullets=list.slice(0,3).map((c,i)=>{
  const route=String(c.next_route||'').slice(0,10);
  const scheduled=/^\d{4}-\d{2}-\d{2}$/.test(route)&&route>=String(ops.period?.as_of||'');
  const next=scheduled?'визит уже в маршруте на '+dateLabel(route)+' — повторно не назначать':
    'ближайший визит не найден — сверить маршрут';
  const open=Number(c.open_tasks)||0;
  const tasks=open>0?'открыто '+open+' задач — проверить перед новыми поручениями':
    'задач не видно — сначала проверить потребность';
  return (i+1)+'. '+c.client_name+': снижение '+money(c.loss)+
   ', последнее посещение '+(c.last_visit?dateLabel(c.last_visit):'не установлено')+', '+next+', '+tasks;
 }).join('; ');
 return 'Проверила только клиентов, закреплённых за '+focus+'. Наибольшее снижение закупок за '+period+' по сравнению с '+prev+': '+bullets+
 '. Это не подтверждённые заказы и не гарантированный объём отгрузки. До встречи проверить потребность, незакрытые заявки, наличие товаров и условия оплаты; поручения только после согласования.';
}
// Grounded, short spoken executive briefing. Full evidence remains onscreen.
export function managementSpeech(ops,focus,sales=null){
 const check=verifyManagerOperations(ops,focus);
 if(!focus||!check.ok)return 'Не удалось подтвердить закрепление клиентов. Рекомендации на экране требуют проверки.';
 const m=(sales?.managers||[]).find(x=>norm(x.manager_name)===norm(focus));
 const clients=Array.isArray(ops.declining_clients)?ops.declining_clients.slice(0,2):[];
 const actions=clients.map(c=>{
   const day=String(c.next_route||'').slice(0,10);
   const planned=/^\d{4}-\d\d-\d\d$/.test(day) && day>=String(ops.period?.as_of||'');
   return c.client_name+': '+(planned?'подготовить заказ к визиту '+dateLabel(day):'сверить потребность и маршрут');
 });
 const intro=focus+(m&&Number.isFinite(Number(m.plan_pct))?': план выполнен на '+Number(m.plan_pct).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%.':'.');
 const speech=(intro+' '+actions.join('. ')+'. Детали на экране.').replace(/\s+/g,' ').trim();
 if(speech.length<=220)return speech;
 return (intro+' Приоритет — подготовить предложения к существующим визитам, проверить открытые задачи и долги. Детали на экране.').trim();
}
// Director actions are generated only from verified current-manager records.
// Not a prediction of orders, nor permission to write a task or schedule.
export function managerActionPlan(ops,focus,sales=null){
 const ownership=verifyManagerOperations(ops,focus);
 if(!focus || !ownership.ok)return 'Нет подтверждённого персонального закрепления клиентов. Не буду создавать рекомендации по чужим клиентам.';
 const candidates=Array.isArray(ops.declining_clients)?ops.declining_clients:[];
 const asOf=String(ops.period?.as_of||'').slice(0,10);
 const month=monthLabel(ops.period?.last_closed_month);
 const manager=(sales?.managers||[]).find(x=>norm(x.manager_name)===norm(focus));
 let head='Проект действий для '+focus+'. Данные по клиентам — за '+month+' по сравнению с соответствующим месяцем прошлого года.';
 if(manager && Number(manager.plan)>0)head+=' План выполнен на '+num(manager.plan_pct).toLocaleString('ru-RU',{maximumFractionDigits:1})+
   '%. Это отставание от плана, не доказательство общего падения выручки.';
 if(!candidates.length)return head+' Клиентов с проверенным снижением в этой выборке нет. Нужно уточнить реальную потребность и доступные заказы, прежде чем обещать отгрузку.';
 const items=candidates.slice(0,3).map((c,i)=>{
  const date=String(c.next_route||'').slice(0,10);
  const scheduled=/^\d{4}-\d\d-\d\d$/.test(date)&&(!asOf||date>=asOf);
  let action=scheduled?
   'Визит уже запланирован на '+dateLabel(date)+' — повторно не назначать. До визита уточнить потребность, возможные заявки, наличие товара и условия оплаты.':
   'Проверить существующий маршрут и согласовать удобную дату контакта; не создавать дублирующий визит.';
  const open=Number(c.open_tasks)||0,late=Number(c.overdue_tasks)||0;
  if(late>0)action+=' По клиенту '+late+' просроченных задач: прежде проверить их исполнение.';
  else if(open>0)action+=' Уже открыто '+open+' задач: проверить содержание, не дублировать поручения.';
  else action+=' Если задач нет, предложить директору проект одного поручения на согласование.';
  // Debtor rows do not have CRM client_id. Do not join on aliases, substrings,
  // amount similarity or fuzzy names: match exact legal-name string only.
  const sameName=(a,b)=>norm(a).replace(/\s+/g,' ').trim()===norm(b).replace(/\s+/g,' ').trim();
  const verifiedNameDebt=(ops.overdue_debtors||[]).find(d=>
    sameName(d.client_name,c.client_name)&&
    norm(d.manager_name).split(/\s+/)[0]===norm(focus).trim());
  if(verifiedNameDebt&&Number(verifiedNameDebt.debt_overdue)>=1){
    action+=' В ПДЗ есть запись с таким же названием: '+money(verifiedNameDebt.debt_overdue)+
      ', просрочка '+Math.max(0,Number(verifiedNameDebt.debt_overdue_days)||0)+
      ' дн. Сверить контрагента по реквизитам и условия оплаты до обсуждения новой отгрузки.';
  }
  const loss=Number(c.loss)>0?' (снижение закупок '+money(c.loss)+')':'';
  return (i+1)+'. '+c.client_name+loss+'. '+action+' После контакта зафиксировать подтверждённую заявку или причину отказа.';
 });
 return head+' '+items.join(' ')+' Все поручения — только предложения, в CRM ничего не создано. Потенциальная отгрузка не подтверждена.';
}
export function debtPriorityAnswer(ops,focus){
 if(!ops||!ops.debt_summary)return 'Сверенный отчёт ПДЗ пока недоступен. Не стану назначать взыскание без подтверждённой задолженности.';
 const check=verifyManagerOperations(ops,focus);
 if(focus&&!check.ok)return 'Не удалось подтвердить должников менеджера '+focus+'. Нельзя приписывать чужую задолженность.';
 const s=ops.debt_summary;
 const report=dateLabel(s.report_date);
 const creditors=(Array.isArray(ops.overdue_debtors)?ops.overdue_debtors:[]);
 const important=creditors.filter(x=>Number(x.debt_overdue)>=1).sort((a,b)=>{
  const av=Number(a.debt_overdue),bv=Number(b.debt_overdue);
  return bv-av||Number(b.debt_overdue_days)-Number(a.debt_overdue_days);
 });
 const tiny=creditors.filter(x=>Number(x.debt_overdue)>0&&Number(x.debt_overdue)<1);
 const title='ПДЗ '+(focus||'сети')+' по отчёту '+report+': '+money(s.amount)+
  ', должников '+num(s.debtor_rows)+'.';
 const rows=important.slice(0,3).map((c,i)=>{
  const days=Math.max(0,Number(c.debt_overdue_days)||0);
  const action=days>=30?'Длительная просрочка: сверить документы и согласовать график оплаты.':
   Number(c.debt_overdue)>=10000?'Крупный долг: связаться с клиентом и получить подтверждённую дату платежа.':
   'Сверить задолженность и согласовать дату оплаты.';
  return (i+1)+'. '+c.client_name+': '+money(c.debt_overdue)+', просрочка '+days+' дн. '+action;
 });
 const remainder=tiny.length?' Мелкие остатки до 1 BYN ('+tiny.length+' поз.) — на сверку, без приоритетного прозвона.':'';
 return title+' Приоритет по сумме и сроку: '+(rows.length?rows.join(' '):'существенных просроченных сумм в выборке нет.')+
  remainder+' Это проект действий, платежи и задачи не изменялись.';
}

export function verifyManagerOperations(ops,focus){
 if(!focus)return {ok:true};
 if(!ops||String(ops.scope||'').trim().toLocaleLowerCase('ru-RU')!==String(focus).trim().toLocaleLowerCase('ru-RU'))
  return {ok:false,reason:'manager_scope_mismatch'};
 const match=(manager)=>String(manager||'').trim().toLocaleLowerCase('ru-RU')===String(focus).trim().toLocaleLowerCase('ru-RU');
 const sameSurname=(name)=>String(name||'').trim().split(/\s+/)[0].toLocaleLowerCase('ru-RU')===String(focus).trim().toLocaleLowerCase('ru-RU');
 if((ops.declining_clients||[]).some(x=>!match(x.manager_name)))return {ok:false,reason:'foreign_declining_client'};
 if((ops.overdue_tasks_sample||[]).some(x=>!match(x.manager_name)))return {ok:false,reason:'foreign_task'};
 if((ops.overdue_debtors||[]).some(x=>!sameSurname(x.manager_name)))return {ok:false,reason:'foreign_debtor_assignment'};
 return {ok:true};
}
export function detectForeignClientMention(answer,foreignClients){
 const t=' '+norm(answer).replace(/[^а-яa-z0-9]+/g,' ').replace(/\s+/g,' ').trim()+' ';
 const legal=new Set(['ооо','чтуп','чп','ип','чсуп','чтсуп','чсупп','учп','зао','оао','оодо']);
 const generic=new Set(['сервис','магазин','торговля','технологии','строй','инструменты','компания','центр','торг']);
 for(const name of foreignClients||[]){
  const n=norm(name).replace(/[^а-яa-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  if(n.length>=9 && t.includes(' '+n+' '))return name;
  const core=n.split(' ').filter(w=>!legal.has(w)).join(' ');
  if(core.length>=5 && !generic.has(core) && t.includes(' '+core+' '))return name;
 }
 return null;
}
const markers={
 sales:/(продаж|выруч|оборот|отгруз|план|выполн|факт)/i,
 debt:/(долг|задолж|дебит|пдз|просроч|оплат)/i,
 tasks:/(задач|поруч|срок|исполнен|задани)/i,
 routes:/(маршрут|визит|посещ|запланир|точк)/i,
 visits:/(визит|посещ|встреч|был у клиент|последн.{0,10}контакт)/i,
 clients:/(клиент|покуп|закуп|выруч|продаж)/i,
 recommendations:/(клиент|продаж|задач|поруч|действи|предлага)/i,
 analysis:/(продаж|клиент|закуп|причин|фактор|падени|отстав|задач)/i,
 multi:/(продаж|задолж|пдз|долг)/i
};
function groundedAmounts(evidence){
 const values=[];
 const moneyKey=/(?:^plan$|^actual$|^to_plan$|amount|revenue|^loss$|^debt_overdue$|^closed_month$|^closed_year_ago$|^current_month$|^closed_delta$|^year_ago_sales_linked$|^closed_sales_linked$|^current_sales_linked$)/i;
 function walk(obj){
   if(!obj || typeof obj!=='object')return;
   if(Array.isArray(obj)){for(const x of obj)walk(x);return;}
   for(const [key,value] of Object.entries(obj)){
     if(moneyKey.test(key) && value!==null && value!=='' && Number.isFinite(Number(value)))
       values.push(Number(value));
     if(value&&typeof value==='object')walk(value);
   }
 }
 walk(evidence);
 return values;
}
function parseSpokenAmount(raw){
 let text=String(raw||'').replace(/[\s\u00a0\u202f]/g,'').trim();
 if(!text)return NaN;
 const last=Math.max(text.lastIndexOf('.'),text.lastIndexOf(','));
 const fraction=last>=0?text.slice(last+1):'';
 if(last>=0 && /^\d{1,2}$/.test(fraction))
   text=text.slice(0,last).replace(/[.,]/g,'')+'.'+fraction;
 else text=text.replace(/[.,]/g,'');
 return Number(text);
}
export function verifyAnswer(kind,answer,evidence=null){
 const s=String(answer||'').trim();
 if(s.length<25)return {ok:false,reason:'empty_or_too_short'};
 if(!markers[kind]?.test(s))return {ok:false,reason:'unrelated_topic'};
 if(kind==='sales' && /(задолж|дебитор|пдз)/i.test(s) && !/(продаж|выруч|отгруз)/i.test(s))
   return {ok:false,reason:'sales_answered_with_debt'};
 if(kind==='debt'&&/(план продаж|фактические продажи)/i.test(s)&&!/(задолж|долг|дебитор|пдз)/i.test(s))
   return {ok:false,reason:'debt_answered_with_sales'};
 // Without a same-period, same-method network revenue comparison, "sales fell"
 // is not a factual implication of plan execution at 30.7%. The manager KPI
 // snapshot explicitly has no comparable manager YoY baseline.
 if(kind==='analysis' && evidence?.sales){
   const broadFall=/(?:значительн[а-яё]*\s+)?(?:падени[а-яё]*|снижен[а-яё]*|сокращени[а-яё]*)\s+(?:общ[а-яё]*\s+)?(?:выручк[а-яё]*|продаж[а-яё]*|оборот[а-яё]*)|(?:выручк[а-яё]*|продаж[а-яё]*|оборот[а-яё]*)\s+(?:снизил[а-яё]*|упал[а-яё]*|сократил[а-яё]*)/i;
   const explicitClosedPeriod=/(?:за|в)\s+(?:последн\w*\s+)?(?:закрыт\w*|завершенн\w*|сентябр\w*|август\w*|июл\w*)\s+(?:месяц\w*|период\w*|20\d{2})|по\s+сравнен\w*\s+с\s+(?:аналогичн\w*|прошл\w*)/i;
   if(broadFall.test(s)&&!explicitClosedPeriod.test(s))
     return {ok:false,reason:'unproven_general_revenue_decline'};
 }
 if(evidence){
   const grounded=groundedAmounts(evidence);
   for(const match of s.matchAll(/(-?\d[\d\s\u00a0\u202f.,]{0,24}?)\s*(?:BYN|белорусск\w*\s+рубл?\w*|бел[.\s]+руб\w*)/giu)){
     const spoken=parseSpokenAmount(match[1]);
     if(!Number.isFinite(spoken) || !grounded.some(value=>Math.abs(value-spoken)<=0.021))
       return {ok:false,reason:'ungrounded_currency_value'};
   }
 }
 return {ok:true};
}
export function fallbackAnswer(kind,focus,ops,sales){
 const manager=focus?' у '+focus:'';
 if(kind==='sales')return directSalesAnswer(sales,focus,sales?.month);
 if(kind==='analysis'&&focus&&sales){
  const manager=(sales.managers||[]).find(m=>norm(m.manager_name)===norm(focus));
  const pct=manager?num(manager.plan_pct).toLocaleString('ru-RU',{maximumFractionDigits:1}):null;
  const count=Number(ops?.client_summary?.yoy_down_clients)||0;
  return 'У '+focus+(pct?' выполнение плана продаж '+pct+'%.':' пока нет утверждённого персонального KPI.')+
   ' Это отставание от плана, не доказательство падения общей выручки.'+
   (ops?' Среди закреплённых клиентов '+count+' имеют снижение связанных закупок за последний завершённый месяц к аналогичному месяцу прошлого года.':'')+
   ' Для решения сначала проверить конкретных клиентов, уже назначенные визиты, открытые задачи и условия оплаты. Причины пока требуют подтверждения.';
 }
 if(kind==='debt'&&ops?.debt_summary){
  const x=ops.debt_summary;
  return 'По последнему отчёту ПДЗ'+manager+': просроченная задолженность '+money(x.amount)+
   ', записей должников — '+num(x.debtor_rows)+'. Дата отчёта: '+(shortDate(x.report_date)||'не указана')+
   '. Это данные задолженности, не продажи.';
 }
 if(kind==='tasks'&&ops?.task_summary){
  const x=ops.task_summary;
  return 'Задачи'+manager+': открыто '+num(x.open_tasks)+
   ', из них просрочено '+num(x.overdue_tasks)+'. Для конкретного поручения запроси перечень клиентов и сроки.';
 }
 if(kind==='routes'&&ops?.route_summary){
  return 'Маршруты'+manager+': запланировано на ближайшие 30 дней '+num(ops.route_summary.planned_next30)+
  ', согласовано '+num(ops.route_summary.approved_next30)+'. План не подтверждает фактический визит.';
 }
 if(kind==='visits'&&ops?.visit_summary){
  return 'Посещения'+manager+': за последние 90 дней записано '+num(ops.visit_summary.visits_90d)+
   ' визитов. Последняя дата: '+(shortDate(ops.visit_summary.last_visit)||'нет даты')+'.';
 }
 if(kind==='clients'&&ops?.client_summary){
  return 'Клиенты'+manager+': активных закреплённых '+num(ops.client_summary.active_clients)+
   ', с покупками в выбранном месяце по связанным данным '+num(ops.client_summary.buying_clients_in_month)+
   ', со снижением закупок по завершённому месяцу '+num(ops.client_summary.yoy_down_clients)+'.';
 }
 return 'Для достоверного ответа'+manager+
  ' требуется дополнительный анализ подтверждённых данных CRM. Могу отдельно проверить продажи, клиентов, задачи, маршруты или дебиторскую задолженность.';
}
