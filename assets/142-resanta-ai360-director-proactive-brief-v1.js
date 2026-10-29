/* AI360 director proactivity v2. Once daily after the director explicitly opens Lera.
   Verified read-only CRM brief, no hidden polling, no CRM writes or automatic tasks. */
(function(){
'use strict';
if(/Android/i.test(navigator.userAgent||'')||window.crmAI360DirectorBriefHandleV1)return;
const ENDPOINT='crm-ai360-director-briefing-v1';
const INTENT=/(?:брифинг(?:\s+директора)?|приоритет[а-яё]*\s+(?:дня|на\s+сегодня)|(?:главн[а-яё]*|важн[а-яё]*)\s+(?:проблем[а-яё]*|риск[а-яё]*)\s+(?:на\s+сегодня|дня)|что\s+сегодня\s+(?:важн[а-яё]*|главн[а-яё]*))/i;
let pending=false,lastAsOf='',button=null,feedback=null,proactiveToggle=null;
const SEEN_KEY='resanta-ai360-brief-seen-daily-v2';
const OPT_KEY='resanta-ai360-brief-enabled-v2';
let attemptAt=0;
function stored(key){try{return window.localStorage?.getItem(key)||'';}catch{return '';}}
function save(key,value){try{window.localStorage?.setItem(key,value);}catch{}}
function todayMinsk(){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',
  year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const part=x=>parts.find(p=>p.type===x)?.value||'';
 return part('year')+'-'+part('month')+'-'+part('day');
}
function panelVisible(){
 const panel=document.querySelector('.rva-window');
 return Boolean(panel&&!panel.hidden&&!document.hidden&&!panel.classList.contains('rva-mini'));
}
function enabled(){return stored(OPT_KEY)!=='off';}
function toggleTitle(){
 if(proactiveToggle){
  proactiveToggle.textContent='Автобрифинг: '+(enabled()?'включён':'выключен');
  proactiveToggle.setAttribute('aria-pressed',String(enabled()));
 }
}
function allowed(){
 try{return typeof currentUser!=='undefined'&&!!currentUser?.id&&
 typeof currentProfile!=='undefined'&&currentProfile?.role==='boss'&&
 String(currentProfile?.name||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU')==='александр паюшин'&&
 document.getElementById('app')?.style.display!=='none';}catch{return false;}
}
const safe=(v,max=200)=>String(v??'').trim().slice(0,max);
const ordinal=['Первый','Второй','Третий','Четвёртый','Пятый'];
// Speech is a *fact-based* spoken rendering of the same five server cards, not
// a separate LLM summary. No table names, import internals or stale warnings
// spoken aloud. Exact figures and recommended decisions remain grounded.
function speechBrief(data){
 if(!Array.isArray(data?.cards)||data.cards.length!==5)return '';
 const spoken=data.cards.map((c,i)=>{
   if(!c?.fact||!c?.title||!c?.action)return '';
   const action=String(c.action).trim();
   const period=action.search(/[.!?](?:\s|$)/);
   const firstAction=(period>=0?action.slice(0,period+1):action).slice(0,240).trim();
   return ordinal[i]+' приоритет. '+safe(c.title,130)+'. '+
     safe(c.fact,500)+'. Что делать: '+firstAction;
 });
 if(spoken.some(x=>!x))return '';
 return ('Брифинг директора на '+safe(data.as_of,10)+'. '+
   spoken.join(' ')+' Все пять направлений проверены. '+
   'Подробные источники и ограничения есть на экране. '+
   'Никакие поручения не созданы.').replace(/\s+/g,' ').trim();
}
// Only one or two grounded actionable signals are voiced automatically.
// The complete five-source explanation remains visible in the transcript.
function shortProactiveSpeech(data){
 const cards=(data?.cards||[]).filter(c=>c?.attention&&['high','medium'].includes(c.level));
 const selected=cards.length?cards.slice(0,2):(data?.cards||[]).slice(0,1);
 const note=selected.map(c=>safe(c.title,55)+'. '+safe(c.fact,70)).join('; ');
 return ('Я проверила CRM. '+(note||'Директорский брифинг готов.')+
  ' Все пять направлений на экране. Для подробностей скажи «расскажи подробнее».').slice(0,225);
}
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
 const warnings=Array.isArray(data.warnings)?data.warnings.slice(0,5).map(x=>{
  // Do not cut source warnings mid-word or mid-sentence like the previous
  // arbitrary 250-character clipping did.
  const value=String(x??'').trim();
  if(value.length<=850)return '• '+value;
  const prefix=value.slice(0,820);
  const sentence=prefix.match(/^[\s\S]*[.!?](?=\s|$)/);
  return '• '+(sentence&&sentence[0].length>=320?sentence[0]:prefix.replace(/\s+\S*$/,'')+'…');
}):[];
 return title+lines.join('\n')+
  (warnings.length?'\n\n**Проверить качество данных:**\n'+warnings.join('\n'):'')+
  '\n\n**Только рекомендации. Ничего не создано, никому не отправлено.**';
}
async function requestBrief(ui,{auto=false}={}){
 if(pending){if(!auto)ui.answer('Брифинг уже проверяется. Дождись результата этого запроса.');return;}
 if(!allowed()||(auto&&!panelVisible()))return;
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
   if(!allowed()||(auto&&!panelVisible()))return;
   const message=present(res.data);
   lastAsOf=String(res.data.as_of);
   ui.answer(message,auto?{speechSummary:shortProactiveSpeech(res.data)}:
     {briefingVoiceText:speechBrief(res.data)});
   if(auto)save(SEEN_KEY,lastAsOf);
   if(feedback)feedback.textContent='Брифинг '+lastAsOf+' готов · 5 приоритетов · только чтение';
 }catch(e){
   if(!allowed())return;
   const code=String(e?.message||e);
   if(auto){if(feedback)feedback.textContent='Автобрифинг недоступен: можно запустить кнопкой';return;}
   const detail=code==='source_unavailable'?'Источник продаж или операций CRM не ответил. Цифры не придумываю.':
      code==='not_authorized'?'Директорская сессия недоступна.':
      'Не удалось собрать брифинг ('+safe(code,80)+'). Ничего не менялось.';
   ui.answer(detail);
   if(feedback)feedback.textContent='Брифинг не получен · '+safe(code,70);
 }finally{
   pending=false;window.__resantaAI360PendingV1=false;if(button)button.disabled=false;
 }
}
// Called ONLY on a real user action opening the already loaded voice panel.
window.crmAI360DirectorProactiveOpenV2=function(ui){
 if(!allowed()||!panelVisible()||!enabled()||pending||
  window.__resantaAI360PendingV1)return false;
 const day=todayMinsk();
 if(stored(SEEN_KEY)===day)return false;
 const now=Date.now();
 if(now-attemptAt<20000)return false;
 attemptAt=now;
 void requestBrief(ui,{auto:true});
 return true;
};
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
 feedback.textContent='Автобрифинг при открытии · один раз в день · без создания задач';
 feedback.setAttribute('role','status');
 proactiveToggle=document.createElement('button');
 proactiveToggle.type='button';proactiveToggle.className='rva-btn rva-proactive-toggle';
 proactiveToggle.title='Автоматический брифинг после открытия Леры: только чтение CRM, не создаёт поручений';
 proactiveToggle.style.cssText='font-size:11px;max-width:160px';
 toggleTitle();
 proactiveToggle.addEventListener('click',()=>{
   save(OPT_KEY,enabled()?'off':'on');
   toggleTitle();
   if(feedback)feedback.textContent=enabled()?'Автобрифинг включён':'Автобрифинг отключён';
 });
 div.append(button,proactiveToggle,feedback);
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
