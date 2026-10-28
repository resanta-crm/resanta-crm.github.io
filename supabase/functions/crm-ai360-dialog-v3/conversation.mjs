// Evidence-first conversation contracts for the director's voice pilot.
// This file is pure: no SQL, authorization, background work or external API calls.
const num=n=>Number.isFinite(Number(n))?Number(n):0;
const money=n=>num(n).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' белорусских рублей';
const short=s=>String(s??'').replace(/[\r\n\t]+/g,' ').replace(/\s+/g,' ').trim().slice(0,150);
/** @param {any} snapshot @param {string|null} [manager] */
export function debtEvidence(snapshot,manager=null){
 const debt=snapshot?.debt_summary||{};
 const rows=Array.isArray(snapshot?.overdue_debtors)?snapshot.overdue_debtors.slice(0,8):[];
 const date=debt.report_date||null, n=Number(debt.debtor_rows||0);
 const warning=Array.isArray(snapshot?.warnings)?snapshot.warnings.filter(x=>/ПДЗ|дебит|долг/.test(String(x))).slice(0,2):[];
 const heading=(manager?'По менеджеру '+short(manager)+'. ':'')+'ПДЗ: отчёт '+(date||'без подтверждённой даты')+
  '. Всего записей с просрочкой '+n+', просроченная сумма '+money(debt.amount)+
  '. Записей со сроком 30 и более дней '+num(debt.rows_30d)+
  ' (включая '+num(debt.rows_60d)+' со сроком 60 и более дней).';
 const top=rows.map((r,i)=>{
  const amount=num(r.debt_overdue),days=num(r.debt_overdue_days);
  return (i+1)+') '+short(r.client_name)+' — '+money(amount)+', дней просрочки '+days+
   ', менеджер '+short(r.manager_name||'не указан')+
   ', отчёт '+(r.report_date||date||'нет даты');
 });
 const detail=heading+' Крупнейшие подтверждённые должники по сумме (не весь реестр): '+
  (top.length?top.join('; '):'связанный список отсутствует')+
  '. Не приравнивать максимальное число дней просрочки к наибольшей сумме долга.'+
  (warning.length?' Ограничения источника: '+warning.map(short).join('; '):'');
 const terse=(manager?'По '+short(manager)+': ':'')+'по отчёту '+(date||'без даты')+
  ' просрочено '+money(debt.amount)+', '+n+' записей.'+
  ' Срок от 30 дней — '+num(debt.rows_30d)+' записей.'+
  (rows.length?' Крупнейший должник: '+short(rows[0].client_name)+' — '+money(rows[0].debt_overdue)+'.':'')+
  ' Хочешь, разберу крупнейших должников и действия по ним?';
 return {summary:terse,detail,report_date:date,count:n,
  source:'crm_ai360_operations_snapshot_v1',limited_clients:rows.length< n};
}
export function normalizeVoicePair(input,fallback){
 const raw=(input&&typeof input==='object')?input:{};
 // LLM can present evidence, but it must not control actions or HTML.
 const clean=x=>String(x||'').replace(/<[^>]+>/g,'').replace(/\r/g,'').trim();
 const brief=clean(raw.brief).slice(0,450)||clean(fallback?.brief).slice(0,450)||'По текущему вопросу подтверждённые данные недоступны.';
 const detail=clean(raw.detail).slice(0,3200)||clean(fallback?.detail).slice(0,3200)||brief;
 const offer=clean(raw.offer).slice(0,170)||'Хочешь, расскажу подробнее?';
 // Only assistant's first-person gender is normalized. Never alter employee names or source data.
 const feminine=s=>s.replace(/Я понял(?![А-Яа-яЁё])/gi,'Я поняла').replace(/Я готов(?![А-Яа-яЁё])/gi,'Я готова').replace(/(^|[.!?] )Понял,/gi,'$1Поняла,');
 return {brief:feminine(brief),detail:feminine(detail),offer:feminine(offer)};
}
export function classifyFollowup(value){
 const s=String(value||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[.,!?;:]/g,' ').replace(/\s+/g,' ').trim();
 if(/^(да|давай|да давай|да хочу|да конечно|конечно|конечно расскажи|хорошо|угу|ага|расскажи|расскажи подробнее|подробнее|поподробнее|озвучь|озвучь подробнее|хочу подробнее|да расскажи|давай подробнее|давай подробно|читай полностью|прочитай полностью|полностью|весь ответ|продолжай)$/.test(s))return 'yes';
 if(/^(нет|не надо|не нужно|не сейчас|спасибо не надо|пока не надо|достаточно|это все|это все спасибо)$/.test(s))return 'no';
 if(/^(покажи на экране|покажи подробнее на экране|хочу на экране|полный отчет на экране|покажи весь отчет)$/.test(s))return 'screen';
 return 'other';
}
