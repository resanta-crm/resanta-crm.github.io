/* Director proactive briefing v1. Only on click/voice request after opening Lera.
   Read-only CRM data. No writes, no background polling and no automatic messages. */
(function(){
'use strict';
if(/Android/i.test(navigator.userAgent||'')||window.crmAI360DirectorBriefHandleV1)return;
const ENDPOINT='crm-ai360-director-briefing-v1';
const INTENT=/(?:брифинг(?:\s+директора)?|приоритет[а-яё]*\s+(?:дня|на\s+сегодня)|(?:главн[а-яё]*|важн[а-яё]*)\s+(?:проблем[а-яё]*|риск[а-яё]*)\s+(?:на\s+сегодня|дня)|что\s+сегодня\s+(?:важн[а-яё]*|главн[а-яё]*))/i;
let pending=false,lastAsOf='',button=null,feedback=null,ownerVisible=false;
function allowed(){
 try{return typeof currentUser!=='undefined'&&!!currentUser?.id&&
 typeof currentProfile!=='undefined'&&currentProfile?.role==='boss'&&
 String(currentProfile?.name||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU')==='александр паюшин'&&
 document.getElementById('app')?.style.display!=='none';}catch{return false;}
}
const safe=(v,max=200)=>String(v??'').trim().slice(0,max);
async function errorCode(err){
 try{const json=await err?.context?.json?.();return String(json?.error||err?.message||'request_failed');}
 catch{return String(err?.message||'request_failed');}
}
function present(data){
 if(!data||data.mode!=='readonly'||data.kind!=='director_daily_brief'||
   data.items_count!==5||!Array.isArray(data.cards)||data.cards.length!==5||
   !/^\d{4}-\d\d-\d\d$/.test(String(data.as_of||'')))throw new Error('invalid_brief');
 const title='**БРИФИНГ ДИРЕКТОРА · '+safe(data.as_of,10)+'**\n';
 const lines=data.cards.map((x,i)=>{
  if(!x||!x.title||!x.fact||!x.action||!x.source)throw new Error('invalid_card');
  return '\n**'+(i+1)+'. '+safe(x.title,130)+'**'+
  '\nФакт: '+safe(x.fact,500)+
  '\nПредлагаю: '+safe(x.action,400)+
  '\nИсточник: '+safe(x.source,180)+' · данные '+safe(x.as_of,35);
 });
 const warnings=Array.isArray(data.warnings)?data.warnings.slice(0,5).map(x=>'• '+safe(x,250)):[];
 return title+lines.join('\n')+
  (warnings.length?'\n\n**Проверить качество данных:**\n'+warnings.join('\n'):'')+
  '\n\n**Только рекомендации. Ничего не создано, никому не отправлено.**';
}
async function requestBrief(ui){
 if(pending){ui.answer('Брифинг уже проверяется. Дождись результата этого запроса.');return;}
 if(!allowed())return;
 pending=true;
 if(button)button.disabled=true;
 window.__resantaAI360PendingV1=true;
 ui.textStatus('Собираю пять приоритетов из CRM: продажи, ПДЗ, задачи, маршруты, Триовист…');
 if(feedback)feedback.textContent='Проверяю подтверждённые данные…';
 try{
   const session=typeof window.crmEnsureFreshSessionV236166==='function'?
     await window.crmEnsureFreshSessionV236166(false):
     await db.auth.getSession().then(x=>x?.data?.session);
   if(!session?.access_token)throw new Error('not_authorized');
   const res=await db.functions.invoke(ENDPOINT,{body:{kind:'director_brief'}});
   if(res.error)throw new Error(await errorCode(res.error));
   if(!allowed())return;
   const message=present(res.data);
   lastAsOf=String(res.data.as_of);
   ui.answer(message,{speechSummary:safe(res.data.speech_summary,220)});
   if(feedback)feedback.textContent='Брифинг '+lastAsOf+' готов · 5 приоритетов · только чтение';
 }catch(e){
   if(!allowed())return;
   const code=String(e?.message||e);
   const detail=code==='source_unavailable'?'Источник продаж или операций CRM не ответил. Цифры не придумываю.':
      code==='not_authorized'?'Директорская сессия недоступна.':
      'Не удалось собрать брифинг ('+safe(code,80)+'). Ничего не менялось.';
   ui.answer(detail);
   if(feedback)feedback.textContent='Брифинг не получен · '+safe(code,70);
 }finally{
   pending=false;window.__resantaAI360PendingV1=false;if(button)button.disabled=false;
 }
}
window.crmAI360DirectorBriefHandleV1=function(text,ui){
 if(!allowed()||!INTENT.test(String(text||'')))return false;
 void requestBrief(ui);return true;
};
function mount(){
 const panel=document.querySelector('.rva-window');
 if(!panel||button||!allowed())return;
 const actions=panel.querySelector('.rva-actions');
 if(!actions)return;
 const div=document.createElement('div');div.className='rva-ai360-director-daily-brief';
 div.style.cssText='display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:5px 0';
 button=document.createElement('button');button.type='button';
 button.className='rva-btn rva-director-daily-brief-btn';
 button.textContent='🧠 Брифинг директора · 5 приоритетов';
 button.style.cssText='background:#e6efff;border:1px solid #96b5de;color:#154878;font-weight:750';
 feedback=document.createElement('span');feedback.className='rva-director-brief-status';
 feedback.style.cssText='color:#526d8b;font-size:11px;flex:1 1 170px';
 feedback.textContent='По запросу · без создания задач';
 feedback.setAttribute('role','status');
 div.append(button,feedback);
 actions.after(div);
 button.addEventListener('click',()=>{
   const core=window.crmAI360DirectorBriefHandleV1;
   if(typeof core!=='function'||!allowed())return;
   // The core's regular answer function is not public; submit through the
   // existing CRM question field to preserve the exact authorization/voice UI.
   const input=panel.querySelector('.rva-input');
   const send=panel.querySelector('.rva-send');
   if(input&&send){input.value='Лера, брифинг директора';send.click();}
 });
}
mount();
let checks=0;
const interval=window.setInterval(()=>{
 if(!allowed()){if(button)button.disabled=true;window.clearInterval(interval);return;}
 if(!button)mount();
 if(++checks>40||button)window.clearInterval(interval);
},650);
})();
