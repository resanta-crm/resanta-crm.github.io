/* Lera x PDZ360: same signed-in read-only day-over-day data as the UI.
 * No 1C writes, task creation, microphone or network calls until a user question.
 */
(function(w){
'use strict';
if(w.crmAI360PDZDailyHandleV1)return;
const normalize=x=>String(x||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').trim();
const money=x=>Number(x||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const names=['Руднев','Ачинович','Шкуран','Сидарович','Александренко','Кришталь'];
const intent=q=>/(пдз|задолж|дебитор|долг|должник|просроч[а-я]*\s+(?:платеж|оплат|долг))/i.test(q)&&
 !/(задач|поручен|триовист|21vek|21\s*век|склад|маршрут|gps|джипиэс)/i.test(q);
const who=()=>{try{const u=typeof currentUser!=='undefined'?currentUser:null,p=typeof currentProfile!=='undefined'?currentProfile:null;return u?.id&&['boss','manager'].includes(p?.role)?{id:u.id,role:p.role,name:p.name}:null;}catch{return null}};
function summary(d,short=false){
 const m=d.metrics||{},rows=Array.isArray(d.rows)?d.rows:[],delta=Number(d.day_change||0),tone=delta<0?'уменьшилась':'увеличилась';
 const base='На '+String(d.report_date||'нет даты')+' подтверждённая ПДЗ '+money(m.amount)+', должников '+Number(m.debtors||0)+'. ';
 const cmp=d.previous_report_date?'По сравнению с '+d.previous_report_date+' задолженность '+(delta===0?'не изменилась':tone+' на '+money(Math.abs(delta)))+'. ':'Предыдущего отчётного дня нет. ';
 if(short)return base+cmp+'Подробнее на экране.';
 let out=base+cmp+'Это изменение долга, а не обязательно подтверждённая оплата. ';
 out+='Сумма просрочки 30 и более дней '+money(m.over_30)+'. ';
 if(Number(m.promised_clients||0))out+='На ближайшие семь дней подтверждены '+Number(m.promised_clients)+' договорённостей на '+money(m.promised_amount)+'. ';
 else out+='Подтверждённых обещаний оплаты на ближайшие семь дней в комментариях нет. ';
 if(rows.length)out+='Приоритетные должники: '+rows.slice(0,3).map(x=>x.client_name+': '+money(x.overdue)+', '+x.days_overdue+' дней просрочки').join('; ')+'. ';
 out+='Следующее действие: проверить последние контакты и обещанные даты оплат у крупнейших должников. Задачи автоматически не создаю.';
 return out;
}
let busy=false;
function handle(question,ui,mode){
 if(!intent(normalize(question)))return false;
 const user=who();if(!user||(mode==='director'&&user.role!=='boss'))return false;
 if(mode==='staff'&&ui?.authorized&&!ui.authorized())return false;
 const seen=names.filter(name=>normalize(question).includes(normalize(name)));
 if(user.role==='manager'&&seen.some(name=>normalize(name)!==normalize(user.name))){
  (mode==='director'?ui?.answer:ui?.show)?.('Долги другого менеджера недоступны по вашей роли.');
  return true;
 }
 if(seen.length>1){
  (mode==='director'?ui?.answer:ui?.show)?.('Назови одного менеджера для сравнения ПДЗ.');
  return true;
 }
 if(busy){(mode==='director'?ui?.answer:ui?.show)?.('Сейчас проверяю предыдущий запрос по задолженности.');return true;}
 busy=true;
 const dbx=()=>{try{return typeof db!=='undefined'?db:w.db}catch{return w.db}};
 const live=()=>{const cur=who();return cur?.id===user.id&&(mode!=='staff'||!ui?.authorized||ui.authorized());};
 void (async()=>{
  const database=dbx();if(!database?.rpc)throw Error('Нет соединения с Supabase');
  const session=await database.auth.getSession();
  if(!session?.data?.session?.access_token)throw Error('Требуется повторная авторизация');
  if(!live())return;
  const {data,error}=await database.rpc('crm_pdz360_daily_v1',{
   p_manager:user.role==='boss'&&seen.length===1?seen[0]:null,p_days:30
  });
  if(error)throw error;
  if(!live())return;
  if(data?.version!=='pdz360.daily.1'||!Array.isArray(data.rows)||!Array.isArray(data.series))throw Error('Данные ПДЗ не подтверждены');
  if(user.role==='manager'&&normalize(data.manager)!==normalize(user.name))throw Error('Несоответствие прав доступа');
  const full=summary(data);
  if(mode==='director')ui?.answer?.(full,{speechSummary:summary(data,true)});
  else ui?.show?.(full);
 })().catch(e=>{if(live()){const msg='Не удалось проверить ежедневную ПДЗ: '+String(e?.message||e).slice(0,95)+'. Цифры не придумываю.';if(mode==='director')ui?.answer?.(msg);else ui?.show?.(msg);}})
 .finally(()=>{busy=false;});
 return true;
}
w.crmAI360PDZDailyHandleV1=(q,ui)=>handle(q,ui,'director');
w.crmAI360BranchPDZHandleV1=(q,ui)=>handle(q,ui,'staff');
function hookStaff(){
 const original=w.crmAI360BranchUnifiedHandleV1;
 if(typeof original!=='function'||original.__pdz360Wrapped)return;
 const fn=function(q,ui){if(w.crmAI360BranchPDZHandleV1?.(q,ui))return true;return original.apply(this,arguments)};
 Object.defineProperty(fn,'__pdz360Wrapped',{value:true});
 w.crmAI360BranchUnifiedHandleV1=fn;
 w.document?.removeEventListener?.('click',hookStaff,true);
}
hookStaff();
if(!w.crmAI360BranchUnifiedHandleV1?.__pdz360Wrapped)w.document?.addEventListener?.('click',hookStaff,true);
w.RESANTA_PDZ360_LERA_V1=Object.freeze({rpc:'crm_pdz360_daily_v1',readOnly:true,intent,summary});
})(window);
