/* AI360 sales and KPI dialogue bridge. Director-only, text/voice, no on-login network activity. */
(function(){
'use strict';
if(/Android/i.test(navigator.userAgent||'')||window.crmAI360SalesHandleV1)return;
const ENDPOINT='crm-ai360-director-v1';
const MONTHS={январ:1,феврал:2,март:3,апрел:4,ма:5,июн:6,июл:7,август:8,сентябр:9,октябр:10,ноябр:11,декабр:12};
let history=[],pending=false,lastMonth=null;
const topic=/(продаж|выруч|оборот|отгруз|реализац|выполн|кпи|kpi|отста|план|филиал|менеджер|сети\b)/i;
const follow=/(почему|из-за чего|за счет чего|что предлага|что делать|как исправ|что дальше|какая причин|а кто|а если|сравни|что измен|какие действ)/i;
function allowed(){
 try{return typeof currentUser!=='undefined'&&!!currentUser?.id&&
  typeof currentProfile!=='undefined'&&currentProfile?.role==='boss'&&
  String(currentProfile?.name||'').trim().replace(/\s+/g,' ').toLowerCase()==='александр паюшин'&&
  document.getElementById('app')?.style.display!=='none';}
 catch{return false;}
}
function parseMonth(query){
 const q=String(query||'').toLowerCase();
 const entry=Object.entries(MONTHS).find(([name])=>q.includes(name));
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
   llm_not_configured:'На сервере пока не настроена языковая модель.',
   llm_temporarily_unavailable:'Связь с языковой моделью временно недоступна.',
   llm_rate_limited:'Лимит запросов провайдера. Повтори позже.',
   llm_request_failed:'Языковая модель сейчас не ответила. Данные CRM не менялись.',
   not_authorized:'Сервер запретил доступ. Проверь учётную запись директора.',
   month_not_supported:'Такой месяц пока недоступен для анализа.',
   quota_unavailable:'Лимит запросов сейчас проверить не удалось.'
 };
 return known[code]||'Сейчас не удалось получить проверенный аналитический ответ. Данные CRM не менялись.';
}
window.crmAI360SalesHandleV1=function(query,ui){
 if(!allowed())return false;
 const text=String(query||'').trim().slice(0,400);
 if(!text || /^(открой|перейди|покажи раздел|вернись)\b/i.test(text))return false;
 const relevant=topic.test(text)||(history.length>0&&follow.test(text));
 if(!relevant)return false;
 if(pending){ui.answer('Предыдущий аналитический вопрос ещё обрабатывается.');return true;}
 pending=true;ui.textStatus('Проверяю продажи и KPI в CRM…');
 const explicitMonth=parseMonth(text);
 const selectedMonth=explicitMonth||((history.length&&follow.test(text))?lastMonth:null);
 (async()=>{
  try{
   const currentSession=typeof window.crmEnsureFreshSessionV236166==='function'
    ?await window.crmEnsureFreshSessionV236166(false):await db.auth.getSession().then(x=>x?.data?.session);
   if(!currentSession?.access_token)throw new Error('not_authorized');
   const payload={message:text,history:history.slice(-6)};
   if(selectedMonth)payload.month=selectedMonth;
   const {data,error}=await db.functions.invoke(ENDPOINT,{body:payload});
   if(error){
     let detail='';
     try{const parsed=await error.context?.json?.();detail=String(parsed?.error||'');}catch{}
     throw new Error(detail||error.message||'request_failed');
   }
   if(!allowed())return;
   const message=String(data?.answer||'').trim();
   if(!message)throw new Error('llm_empty_answer');
   history.push({role:'user',content:text},{role:'assistant',content:message});
   history=history.slice(-6);
   lastMonth=String(data.month||'');
   ui.answer(message);
  }catch(e){
   if(allowed())ui.answer(reason(String(e?.message||e)));
  }finally{pending=false;}
 })();
 return true;
};
})();