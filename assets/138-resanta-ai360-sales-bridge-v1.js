/* AI360 sales/KPI director conversation bridge v2.
 * Server-verified manager directory and pure resolver (139).
 * Uncertain surnames require confirmation; the model never chooses a person by guess.
 * Zero network calls on login. No CRM data writes.
 */
(function(){
'use strict';
if(/Android/i.test(navigator.userAgent||'')||window.crmAI360SalesHandleV1)return;
const ENDPOINT='crm-ai360-director-v1';
const MONTHS={январ:1,феврал:2,март:3,апрел:4,ма:5,июн:6,июл:7,август:8,сентябр:9,октябр:10,ноябр:11,декабр:12};
let history=[],pending=false,lastMonth=null,lastManager=null,pendingMatch=null,staffCache=null;
const topic=/(продаж|выруч|оборот|отгруз|реализац|выполн|кпи|kpi|отста|план|филиал|менеджер|сет[ьи]|клиент|задач|маршрут|посещ|визит|пд[зэ]|долг|задолж|дебит|просроч|поруч|закуп|покуп)/i;
const follow=/(почему|из-за чего|за счет чего|что предлага|что делать|как исправ|что дальше|какая причин|а кто|а если|сравни|что измен|какие действ|а у него|а он|что с ними|а что с|что с его|что у него|как быть|что порекоменду|чтобы эти клиенты|эти клиенты|их посещал|когда был|проверь долг|какие риски|составь поручен|готовь поручен|у кого больше)/i;
const globalIntent=/(по всей сети|всех менеджеров|у всех|в целом|общ[аяие].*продаж|сравни.*менеджер|по филиалам|по всем клиентам|всей клиентской базе|у кого из менеджеров|кто из менеджеров|всех филиалов)/i;
const yes=/^(да|верно|правильно|это он|именно|ага|давай|точно)(?:\s|$)/i;
const no=/^(нет|не он|неверно|другого|другая|неа)(?:\s|$)/i;
function allowed(){
 try{return typeof currentUser!=='undefined'&&!!currentUser?.id&&
  typeof currentProfile!=='undefined'&&currentProfile?.role==='boss'&&
  String(currentProfile?.name||'').trim().replace(/\s+/g,' ').toLowerCase()==='александр паюшин'&&
  document.getElementById('app')?.style.display!=='none';}
 catch{return false;}
}
function parseMonth(query){
 const q=String(query||'').toLowerCase();
 const entry=Object.entries(MONTHS).find(([name])=>name==='ма'?/(?:^|\s)ма[йя](?=\s|$)/.test(q):q.includes(name));
 if(!entry)return null;
 const explicit=q.match(/\b20(25|26)\b/);
 const year=explicit?Number(explicit[0]):new Date().getFullYear();
 return String(year)+'-'+String(entry[1]).padStart(2,'0');
}
function reason(code){
 const known={
  llm_daily_limit:'Дневной лимит интеллектуальных вопросов — 20. Завтра он обновится.',
  sales_data_unavailable:'Источник продаж временно недоступен. Данные не придумываю — повтори позже.',
  empty_sales_snapshot:'CRM не вернула подтверждённые продажи.',
  staff_directory_unavailable:'Справочник сотрудников пока недоступен. Фамилию проверить не могу.',
  llm_not_configured:'На сервере пока не настроена языковая модель.',
  llm_temporarily_unavailable:'Связь с языковой моделью временно недоступна.',
  llm_rate_limited:'Лимит запросов провайдера. Повтори позже.',
  llm_request_failed:'Языковая модель сейчас не ответила. Данные CRM не менялись.',
  not_authorized:'Сервер запретил доступ. Проверь учётную запись директора.',
  month_not_supported:'Такой месяц пока недоступен для анализа.',
  quota_unavailable:'Лимит запросов сейчас проверить не удалось.',
  operations_unavailable:'Не удалось проверить клиентов, задачи, маршруты или ПДЗ. Я не буду придумывать показатели — повтори запрос позднее.'
 };
 return known[code]||'Сейчас не удалось получить проверенный аналитический ответ. Данные CRM не менялись.';
}
async function roster(){
 if(staffCache)return staffCache;
 const r=await db.functions.invoke(ENDPOINT,{body:{kind:'directory'}});
 if(r.error){
  let code='';
  try{const data=await r.error.context?.json?.();code=String(data?.error||'');}catch{}
  throw new Error(code||'staff_directory_unavailable');
 }
 if(!Array.isArray(r.data?.staff))throw new Error('staff_directory_unavailable');
 staffCache=r.data.staff.filter(p=>p&&p.role==='manager'&&typeof p.name==='string');
 return staffCache;
}
async function popError(error){
 if(error?.context?.json){
  try{const data=await error.context.json();return String(data?.error||error.message||'request_failed');}
  catch{}
 }
 return String(error?.message||'request_failed');
}
window.crmAI360SalesHandleV1=function(query,ui){
 if(!allowed())return false;
 let text=String(query||'').trim().slice(0,400);
 if(!text || /^(открой|перейди|покажи раздел|вернись)\b/i.test(text))return false;
 // Speech recognition can mistake "по продажам" for "по родню".
 // Repair ONLY within a real sales/client conversation with a second commercial cue.
 // An unrelated mention of family must never be forcibly rewritten.
 if(history.length>0 && /\bкак быть\b/i.test(text) &&
     /по\s+(?:родню|родне|родни|родня|рудню)(?=[\s?.!,]|$)/iu.test(text) &&
     /(клиент|задач|купил|покуп|закуп|выруч|продаж|ру[дт]нев)/i.test(text)){
   text=text.replace(/по\s+(?:родню|родне|родни|родня|рудню)(?=[\s?.!,]|$)/iu,'по продажам');
 }
 const awaiting=pendingMatch!==null;
 if(!awaiting&&!topic.test(text)&&!(history.length>0&&follow.test(text)))return false;
 if(pending){ui.answer('Предыдущий аналитический вопрос ещё обрабатывается.');return true;}
 if(awaiting){
  const choice=pendingMatch;
  if(no.test(text)){
   pendingMatch=null;
   ui.answer('Поняла, это не '+choice.manager+'. Назови фамилию менеджера ещё раз.');
   return true;
  }
  if(yes.test(text)){
   pendingMatch=null;
   const original=choice.question;
   text=original.replace(choice.heard,choice.manager);
   if(!topic.test(text))text+=' продажи';
   return ask(text,ui,choice.manager);
  }
  pendingMatch=null;
  if(!topic.test(text)&&!follow.test(text)){
   ui.answer('Назови фамилию вместе с вопросом, например: какие продажи у Руднева?');
   return true;
  }
 }
 return ask(text,ui,null);
};
function ask(text,ui,confirmedManager){
 pending=true;
 window.__resantaAI360PendingV1=true;
 ui.textStatus('Проверяю фамилию и продажи в CRM…');
 (async()=>{
  try{
   const session=typeof window.crmEnsureFreshSessionV236166==='function'
    ?await window.crmEnsureFreshSessionV236166(false):await db.auth.getSession().then(x=>x?.data?.session);
   if(!session?.access_token)throw new Error('not_authorized');
   const directory=await roster();
   if(!allowed())return;
   let focus=confirmedManager;
   if(!focus){
    const resolver=window.crmAI360StaffResolveV1;
    if(!resolver?.resolve)throw new Error('staff_directory_unavailable');
    const hit=resolver.resolve(text,directory);
    if(hit.kind==='confirm'){
     pendingMatch={manager:hit.manager,heard:hit.heard,question:text};
     ui.answer('Ты имеешь в виду менеджера '+hit.manager+'? Скажи «да» или «нет».');
     return;
    }
    if(hit.kind==='unknown'||hit.kind==='ambiguous'){
     const names=directory.map(x=>x.name).slice(0,6).join(', ');
     ui.answer('Не уверена, какую фамилию ты произнёс. Уточни, пожалуйста, имя менеджера. В справочнике: '+names+'.');
     return;
    }
    if(hit.kind==='exact')focus=hit.manager;
   }
   if(!focus && globalIntent.test(text))lastManager=null;
   if(!focus && lastManager && follow.test(text) && !globalIntent.test(text))focus=lastManager;
   const explicitMonth=parseMonth(text);
   const selectedMonth=explicitMonth||((history.length&&follow.test(text))?lastMonth:null);
   const payload={message:text,history:history.slice(-6)};
   if(selectedMonth)payload.month=selectedMonth;
   if(focus)payload.focusManager=focus;
   ui.textStatus('Проверяю продажи и KPI в CRM…');
   const result=await db.functions.invoke(ENDPOINT,{body:payload});
   if(result.error)throw new Error(await popError(result.error));
   if(!allowed())return;
   const answer=String(result.data?.answer||'').trim();
   if(!answer)throw new Error('llm_empty_answer');
   history.push({role:'user',content:text},{role:'assistant',content:answer});
   history=history.slice(-6);
   lastMonth=String(result.data?.month||'');
   if(focus)lastManager=focus;
   ui.answer(answer);
  }catch(e){if(allowed())ui.answer(reason(String(e?.message||e)));}
  finally{pending=false;window.__resantaAI360PendingV1=false;}
 })();
 return true;
}
})();