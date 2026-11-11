/* PDZ Telegram · Lera personalized messages (pure, side-effect-free).
   The existing authenticated Telegram dispatcher owns sending and dedupe. */
export const clean = value=>String(value??'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,' ').trim();
export const surname = value=>clean(value).split(' ')[0]||'';
export const html = value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export const money = amount=>Number(amount||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
export const dateRU = date=>{const m=/^(\d{4})-(\d\d)-(\d\d)/.exec(String(date||''));return m?m[3]+'.'+m[2]+'.'+m[1]:'—';};
export const matchManager = (debtManager,userName)=>!!surname(debtManager)&&surname(debtManager)===surname(userName);
export const amount = rows=>(rows||[]).reduce((s,x)=>s+Number(x.debt_overdue||0),0);
export const keyOf = d=>clean(d.client_name)+'|'+surname(d.manager_name);

export function chooseRecipientRows(user,debts,managerUsers){
 const role=String(user?.role||''),email=clean(user?.email||''),list=Array.isArray(debts)?debts:[];
 if(role==='manager'){
  const eligible=managerUsers.find(x=>x.role==='manager'&&x.id===user.id&&x.access_scope!=='triovist');
  if(!eligible)return [];
  return list.filter(d=>matchManager(d.manager_name,eligible.name));
 }
 if(role!=='boss')return [];
 if(email==='payushin ar resanta ru')return list; // DФС sees network totals, only actual 1C data.
 const region=clean(user.region);
 if(!region)return [];
 const owned=(managerUsers||[]).filter(x=>x.role==='manager'&&clean(x.region)===region&&x.access_scope!=='triovist')
  .map(x=>surname(x.name)).filter(Boolean);
 return list.filter(d=>owned.includes(surname(d.manager_name)));
}

export function greeting(user,rows,binding){
 if(String(user.role)==='manager'){
  const matches=(rows||[]).find(x=>matchManager(x.manager_name,user.name));
  const words=String(matches?.manager_name||'').trim().split(/\s+/);
  const first=words.length>1&&/^[А-ЯЁа-яё-]{3,}$/.test(words[1])?words[1]:'';
  return html(first||binding?.telegram_first_name||user.name||'коллега');
 }
 return html(String(user.name||'руководитель').trim());
}

export function actionFor(row,record,today){
 const overdue=Number(row.debt_overdue_days||0);
 if(!record)return '📞 <b>Нет контакта в CRM.</b> Свяжись с клиентом и запиши результат, сумму и дату оплаты.';
 const contact='✍️ Контакт от '+dateRU(record.created_at)+'. ';
 if(record.promised_date){
  const date=String(record.promised_date).slice(0,10);
  const promised=Number(record.amount||0);
  if(date<today)return contact+'⚠️ <b>Срок обещания '+dateRU(date)+' прошёл.</b> Сверь реестр оплат, уточни остаток и следующий срок.';
  if(date===today)return contact+'📅 <b>Оплата обещана сегодня.</b> Проверь поступление по 1С и зафиксируй результат.';
  return contact+'📅 Ожидается '+dateRU(date)+(promised>0?' · '+money(promised)+' BYN':' · сумма не указана')+'. Контроль в назначенную дату.';
 }
 return contact+(overdue>=30?'❗ Уточни дату оплаты; при необходимости согласуй претензию.':'Уточни дату и сумму ожидаемой оплаты.');
}
export function contactStatus(record,today){
 if(!record)return 'no_record';
 if(record.promised_date&&String(record.promised_date).slice(0,10)<today)return 'promise_overdue';
 if(record.promised_date)return 'promise_planned';
 return 'contact_without_promise';
}
export function statusCounts(rows,evidence,today){
 const out={no_record:0,promise_overdue:0,promise_planned:0,contact_without_promise:0};
 for(const row of rows||[])out[contactStatus(evidence.get(keyOf(row)),today)]++;
 return out;
}
function dayChange(rows,prevRows){
 if(!Array.isArray(prevRows))return '';
 const delta=amount(rows)-amount(prevRows);
 return '\nЗа день: <b>'+(delta>0?'+':'')+money(delta)+' BYN</b> (сверка по предыдущей дате 1С, не подтверждение оплаты).';
}
export function managerBrief({user,binding,rows,previousRows,reportDate,today,evidence,legalAction}){
 const sorted=[...rows].sort((a,b)=>Number(b.debt_overdue||0)-Number(a.debt_overdue||0));
 const count=statusCounts(sorted,evidence,today),greet=greeting(user,sorted,binding);
 const header='👋 <b>Привет, '+greet+'! Это Лера.</b>\n'+
  '📊 <b>Твоя ПДЗ по 1С на '+dateRU(reportDate)+'</b>'+
  (today!==reportDate?' (последний загруженный отчёт)':'')+'\n'+
  'Должников: <b>'+sorted.length+'</b> · сумма: <b>'+money(amount(sorted))+' BYN</b>'+
  dayChange(sorted,previousRows)+'\n'+
  '🔔 Без контакта в CRM: <b>'+count.no_record+'</b> · просрочено обещаний: <b>'+count.promise_overdue+'</b>.\n'+
  'Сегодня проконтролируй каждый долг и зафиксируй результат в разделе «Задолженность 360°».';
 const lines=sorted.map((row,i)=>{
  const legal=typeof legalAction==='function'?legalAction(row):'';
  return '\n'+(i+1)+'. <b>'+html(row.client_name)+'</b> — <b>'+money(row.debt_overdue)+' BYN</b> · '+Number(row.debt_overdue_days||0)+' дн.'+
   (legal?' · '+legal:'')+'\n   '+actionFor(row,evidence.get(keyOf(row)),today);
 });
 lines.push('\n✅ В CRM укажи результат звонка и дату следующего действия. Отметка в Telegram не заменяет запись в CRM. Я напомню о сроках по подтверждённым данным.');
 return {header,lines,counts:count,total:amount(sorted),debtors:sorted.length};
}
export function leaderBrief({user,rows,previousRows,reportDate,today,evidence,managerUsers}){
 const sorted=[...rows].sort((a,b)=>Number(b.debt_overdue||0)-Number(a.debt_overdue||0));
 const count=statusCounts(sorted,evidence,today),isDfs=clean(user.email)==='payushin ar resanta ru';
 const header='☀️ <b>Доброе утро, '+greeting(user,sorted)+'! Это Лера.</b>\n'+
  '📊 <b>Контроль ПДЗ '+(isDfs?'филиальной сети':'подразделения '+html(user.region||''))+'</b>\n'+
  'Отчёт 1С на '+dateRU(reportDate)+(today!==reportDate?' (последний загруженный)':'')+'.\n'+
  'Просрочено: <b>'+money(amount(sorted))+' BYN</b> · должников: <b>'+sorted.length+'</b>'+
  dayChange(sorted,previousRows)+'\n'+
  '❗ Нет записи о контакте в CRM: <b>'+count.no_record+'</b> · нарушены обещанные сроки: <b>'+count.promise_overdue+'</b>.';
 const groups=new Map();
 for(const row of sorted){
  const name=surname(row.manager_name);
  if(!groups.has(name))groups.set(name,[]);
  groups.get(name).push(row);
 }
 const lines=['\n<b>Ответственные менеджеры:</b>'];
 for(const [key,items] of [...groups].sort((a,b)=>amount(b[1])-amount(a[1]))){
  const u=managerUsers.find(x=>x.role==='manager'&&surname(x.name)===key);
  const c=statusCounts(items,evidence,today);
  lines.push('• <b>'+html(u?.name||items[0]?.manager_name||'Менеджер не определён')+'</b>: '+
   items.length+' клиентов · '+money(amount(items))+' BYN · без отметок: '+c.no_record+
   (c.promise_overdue?' · нарушено обещаний: '+c.promise_overdue:''));
 }
 lines.push('\n<b>В первую очередь проверь:</b>');
 for(const row of sorted.slice(0,Math.min(5,sorted.length))){
  const state=contactStatus(evidence.get(keyOf(row)),today);
  lines.push('• '+html(row.client_name)+' ('+html(row.manager_name)+') — '+money(row.debt_overdue)+' BYN · '+
    (state==='promise_overdue'?'просрочено обещание':state==='no_record'?'нет контакта в CRM':
     state==='promise_planned'?'обещание под контролем':'нужна дата оплаты'));
 }
 if(!sorted.length)lines.push('Нет подтверждённых долгов у назначенных в CRM сотрудников. Для нового подразделения сначала закрепи менеджеров и клиентов.');
 lines.push('\n📌 Поручи менеджерам зафиксировать результаты в CRM. Факт звонка и поступление денег подтверждаются отдельно; задолженность не закрывается по одному сообщению.');
 return {header,lines,counts:count,total:amount(sorted),debtors:sorted.length};
}
