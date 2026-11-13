/* Calendar & meetings: isolated Payushin-only pilot on top of Lera #309.
 * Existing meeting owner-RLS and director briefing Edge are the only data sources.
 * No new assistant, no cron, no history storage, no automatic writes/invites. */
(function(window,document){
'use strict';
if(window.crmMeetingPlannerPilotV1)return;
const OWNER='544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
const ENDPOINT='crm-ai360-director-briefing-v1';
const state={focus:'',mode:'week',meetings:[],loaded:false,loadError:'',loading:false,range:null,
 briefing:null,briefError:'',briefLoading:false,selected:new Set(),actor:'',seq:0,notice:''};
const $=id=>document.getElementById(id);
const safe=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const trim=(x,len=480)=>String(x??'').trim().slice(0,len);
const one=()=>typeof db!=='undefined'?db:window.db;
const userId=()=>{try{return typeof currentUser!=='undefined'?String(currentUser?.id||''):'';}catch{return '';}};
const authorized=()=>{try{return userId()===OWNER&&typeof currentProfile!=='undefined'&&currentProfile?.id===OWNER&&
 currentProfile?.role==='boss'&&String(currentProfile?.email||'').toLowerCase()==='payushin_ar@resanta.ru'&&
 $('app')?.style.display!=='none';}catch{return false;}};
const dateMinsk=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const utc=d=>new Date(d+'T12:00:00Z');
const dateISO=d=>d.toISOString().slice(0,10);
const move=(d,days)=>dateISO(new Date(utc(d).getTime()+days*86400000));
const monthMove=(d,n)=>{const x=utc(d),day=x.getUTCDate(),year=x.getUTCFullYear(),month=x.getUTCMonth()+n;
 const last=new Date(Date.UTC(year,month+1,0)).getUTCDate();
 return dateISO(new Date(Date.UTC(year,month,Math.min(day,last),12)));};
const monthTitle=d=>utc(d).toLocaleDateString('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'});
const shortDate=d=>utc(d).toLocaleDateString('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'});
const weekday=d=>utc(d).toLocaleDateString('ru-RU',{weekday:'short',timeZone:'UTC'});
const time=x=>new Date(x).toLocaleTimeString('ru-RU',{timeZone:'Europe/Minsk',hour:'2-digit',minute:'2-digit'});
const dayOf=x=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(x));
const modeLabel={day:'День',week:'Неделя',month:'Месяц'};
const statusTag={sales:'Продажи',debt:'Задолженность',tasks:'Задачи',routes:'Маршруты',triovist:'Триовист'};
const pageFor={sales:'sales',debt:'debt',tasks:'tasks',routes:'routes-boss',triovist:'vip'};
function clear(){state.seq++;state.meetings=[];state.loaded=false;state.loadError='';state.loading=false;
 state.briefing=null;state.briefError='';state.briefLoading=false;state.selected.clear();state.range=null;state.notice='';}
function periodDates(){
 const base=utc(state.focus),dow=(base.getUTCDay()+6)%7;
 if(state.mode==='day')return [state.focus];
 if(state.mode==='week')return Array.from({length:7},(_,i)=>move(state.focus,i-dow));
 const start=state.focus.slice(0,7)+'-01',firstDow=(utc(start).getUTCDay()+6)%7;
 const first=move(start,-firstDow);return Array.from({length:42},(_,i)=>move(first,i));
}
function meetingList(day){return state.meetings.filter(m=>dayOf(m.starts_at)===day).sort((a,b)=>String(a.starts_at).localeCompare(String(b.starts_at)));}
function calendar(){
 const days=periodDates(),weekdays=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
 return '<div class="cmp-calendar"><div class="cmp-weekdays">'+weekdays.map(x=>'<span>'+x+'</span>').join('')+'</div>'+
 '<div class="cmp-daygrid '+(state.mode==='month'?'is-month':'')+'">'+days.map(day=>{
 const count=meetingList(day).length,other=state.mode==='month'&&day.slice(0,7)!==state.focus.slice(0,7);
 return '<button type="button" data-cmp-date="'+day+'" class="cmp-day'+(day===state.focus?' selected':'')+
 (day===dateMinsk()?' today':'')+(other?' other':'')+'" aria-label="'+safe(day)+', встреч: '+count+
 '" aria-pressed="'+(day===state.focus)+'"><strong>'+Number(day.slice(8))+'</strong>'+
 '<small>'+safe(weekday(day))+'</small>'+(count?'<b>'+count+' встреч</b>':'')+'</button>';
 }).join('')+'</div></div>';
}
function meetingCards(){
 if(state.loading&&!state.loaded)return '<p class="cmp-muted">Загружаю личные встречи…</p>';
 if(state.loadError)return '<p class="cmp-error">Не удалось прочитать календарь: '+safe(state.loadError)+'. Это не означает, что встреч нет.</p>';
 if(!state.loaded)return '<p class="cmp-muted">Выберите дату или обновите календарь.</p>';
 const day=state.focus,meetings=meetingList(day);
 if(!meetings.length)return '<p class="cmp-muted">На '+safe(shortDate(day))+' в личном календаре CRM нет запланированных встреч.</p>';
 return meetings.map(m=>'<div class="cmp-meeting"><div class="cmp-meeting-time">'+safe(time(m.starts_at))+'</div>'+
 '<div><b>'+safe(m.title)+'</b><div class="cmp-muted">'+safe(trim(m.purpose,300))+'</div>'+
 '<small>'+safe(m.duration_minutes)+' мин · '+safe(m.format==='remote'?'Онлайн':m.format==='in_person'?'Очно':'Внутренняя встреча')+
 (m.client_name?' · '+safe(m.client_name):'')+'</small>'+
 (Array.isArray(m.participants)&&m.participants.length?'<small>Указаны участники: '+safe(m.participants.join(', '))+' · приглашения не подтверждены</small>':'')+
 '</div></div>').join('');
}
function briefCards(){
 if(state.briefLoading)return '<p class="cmp-muted">Лера проверяет пять существующих источников CRM…</p>';
 if(state.briefError)return '<p class="cmp-error">Брифинг недоступен: '+safe(state.briefError)+'. Данные не подменяются догадками.</p>';
 if(!state.briefing)return '<div class="cmp-empty"><b>Повестка пока не подготовлена</b><p>Нажмите «Лера · Подготовить совещание». Используем существующий защищённый брифинг без новых запросов к тяжёлым отчётам.</p></div>';
 const data=state.briefing;
 return '<div class="cmp-source-note">Проверено '+safe(data.as_of)+' · '+data.cards.length+
 ' направлений · другие разделы пока не входят в этот брифинг</div>'+
 data.cards.map(c=>{
 const chosen=state.selected.has(c.id),importance=c.level==='high'?'Высокий приоритет':c.level==='medium'?'Требует внимания':'Информация';
 return '<article class="cmp-topic"><div class="cmp-topic-top"><span class="cmp-tag '+safe(c.level)+'">'+importance+'</span>'+
 '<span class="cmp-muted">'+safe(statusTag[c.id]||c.id)+'</span></div>'+
 '<h4>'+safe(trim(c.title,180))+'</h4><p><b>Факт:</b> '+safe(trim(c.fact,650))+'</p>'+
 '<p><b>Предлагаю:</b> '+safe(trim(c.action,450))+'</p>'+
 '<div class="cmp-muted cmp-source">Источник: '+safe(trim(c.source,190))+' · '+safe(trim(c.as_of,40))+'</div>'+
 '<div class="cmp-row cmp-actions"><button data-cmp-topic="'+safe(c.id)+'" class="cmp-btn'+(chosen?' strong':'')+'">'+
 (chosen?'✓ В повестке':'+ В повестку')+'</button>'+
 '<button class="cmp-btn" data-cmp-open="'+safe(pageFor[c.id]||'dashboard')+'">Открыть раздел</button></div></article>';
 }).join('');
}
function audit(){
 const navs=[...document.querySelectorAll('.sidebar .nav-item[id^="nav-"]')].filter(x=>
  x.id!=='nav-meeting-planner'&&x.style.display!=='none'&&
  (typeof window.getComputedStyle!=='function'||window.getComputedStyle(x).display!=='none'));
 const map={'nav-sales':'sales','nav-debt':'debt','nav-tasks':'tasks',
   'nav-routes-boss':'routes','nav-vip':'triovist'};
 const seen=new Set();
 const list=navs.filter(x=>{if(seen.has(x.id))return false;seen.add(x.id);return true;});
 return '<div class="cmp-audit-grid">'+list.map(n=>{
 const id=n.id.slice(4),key=map[n.id],checked=!!state.briefing?.cards?.some(c=>c.id===key);
 return '<div class="cmp-audit-item"><span class="cmp-audit-dot '+(checked?'checked':'pending')+'"></span>'+
 '<span>'+safe(n.textContent.replace(/[\n ]+/g,' ').trim())+'</span>'+
 '<small>'+(checked?'Есть проверенный брифинг':'Пока не подключён к брифингу')+'</small>'+
 '<button data-cmp-open="'+safe(id)+'" title="Открыть исходный раздел">↗</button></div>';
 }).join('')+'</div><p class="cmp-muted">Показываются доступные пункты меню. Отметка «Проверен» означает проверку в текущем брифинге, а не полный аудит всех показателей модуля. Неподключённые разделы не считаются проверенными.</p>';
}
function agendaText(){
 if(!state.briefing)return '';
 const items=state.briefing.cards.filter(c=>state.selected.has(c.id));
 return 'Черновик повестки на '+dateMinsk()+' (не сохранён в CRM)\n'+
 items.map((c,i)=>(i+1)+'. '+c.title+'\nФакт: '+c.fact+'\nПредлагаю: '+c.action+'\nИсточник: '+c.source).join('\n\n')+
 '\n\nРешения и поручения оформляются после подтверждения руководителя. Полные разговоры не записываются.';
}
function draw(){
 const root=$('cmp-root');if(!root)return;
 root.innerHTML='<div class="cmp-head"><div><div class="cmp-overline">Персональный пилот · Александр</div>'+
 '<h2>Календарь и совещания</h2><p>Личный ежедневник, подготовка повестки и переход к видеочату в существующем CONNECT.</p></div>'+
 '<div class="cmp-row"><button class="cmp-btn" data-cmp-refresh>↻ Обновить встречи</button>'+
 '<button class="cmp-btn strong" data-cmp-voice>Лера · Открыть агента</button></div></div>'+
 (state.notice?'<div class="cmp-notice" role="status">'+safe(state.notice)+'</div>':'')+
 '<div class="cmp-kpis"><div><small>Встреч в выбранный день</small><strong>'+(state.loaded?meetingList(state.focus).length:'—')+'</strong></div>'+
 '<div><small>Проверено направлений</small><strong>'+(state.briefing?state.briefing.cards.length:'—')+'</strong></div>'+
 '<div><small>Вопросов в повестке</small><strong>'+state.selected.size+'</strong></div></div>'+
 '<div class="cmp-columns"><section class="cmp-panel"><div class="cmp-panel-title"><h3>Мой календарь</h3>'+
 '<div class="cmp-modes">'+Object.entries(modeLabel).map(([k,v])=>'<button type="button" data-cmp-mode="'+k+'" aria-pressed="'+(state.mode===k)+'"'+(state.mode===k?' class="active"':'')+'>'+v+'</button>').join('')+'</div></div>'+
 '<div class="cmp-row cmp-date-nav"><button data-cmp-shift="-1" aria-label="Назад">‹</button><b>'+safe(monthTitle(state.focus))+'</b><button data-cmp-shift="1" aria-label="Вперёд">›</button>'+
 '<button data-cmp-today>Сегодня</button></div>'+calendar()+
 '<h4>Встречи · '+safe(shortDate(state.focus))+'</h4>'+meetingCards()+
 '<div class="cmp-row cmp-actions"><button class="cmp-btn" data-cmp-voice>+ Назначить встречу через Леру</button>'+
 '<button class="cmp-btn" data-cmp-connect>Открыть CONNECT</button></div>'+
 '<p class="cmp-muted">CONNECT открывает рабочие чаты. Видеозвонок начинается из выбранного чата; автоматическая отправка приглашений и напоминаний пока не включена.</p></section>'+
 '<section class="cmp-panel"><div class="cmp-panel-title"><h3>Лера · Повестка совещания</h3>'+
 '<button class="cmp-btn strong" data-cmp-brief '+(state.briefLoading?'disabled':'')+'>✦ Подготовить совещание</button></div>'+
 '<p class="cmp-muted">Анализ существующего директорского брифинга по пяти направлениям. Ничего не создаётся и никому не отправляется автоматически.</p>'+
 briefCards()+'<div class="cmp-row cmp-actions"><button class="cmp-btn" data-cmp-copy '+(!state.selected.size?'disabled':'')+'>Скопировать повестку</button>'+
 '<button class="cmp-btn" data-cmp-connect>К видеосовещанию · CONNECT</button></div>'+
 '<p class="cmp-muted">Это черновик. Итоги и поручения оформляются отдельно с подтверждением. Полная история диалога не сохраняется.</p></section></div>'+
 '<section class="cmp-panel cmp-audit"><div class="cmp-panel-title"><h3>Что проверено в CRM</h3><span>Охват источников · без ложных отметок</span></div>'+
 audit()+'</section>';
}
async function meetingsRefresh(){
 if(!authorized()||state.loading)return;
 const actor=userId(),seq=++state.seq;state.loading=true;state.loadError='';draw();
 try{
  const c=one(),auth=await c.auth.getUser();
  if(auth.error||auth.data?.user?.id!==OWNER)throw Error('Нет подтверждённой сессии директора');
  const focus=utc(state.focus),from=new Date(focus.getTime()-56*86400000).toISOString();
  const to=new Date(focus.getTime()+57*86400000).toISOString();
  const result=await c.from('crm_ai360_meetings_v1')
   .select('id,title,kind,format,purpose,starts_at,duration_minutes,location,participants,client_name')
   .eq('owner_id',OWNER).gte('starts_at',from).lt('starts_at',to).order('starts_at',{ascending:true}).limit(200);
  if(result.error)throw result.error;
  if(seq!==state.seq||actor!==userId()||!authorized())return;
  state.meetings=Array.isArray(result.data)?result.data:[];state.loaded=true;state.range={from,to};
 }catch(e){if(seq===state.seq&&actor===userId()){state.loaded=false;state.loadError=trim(e?.message||e,180);}}
 finally{if(seq===state.seq){state.loading=false;if(authorized())draw();}}
}
async function briefRefresh(){
 if(!authorized()||state.briefLoading)return;
 const actor=userId(),seq=++state.seq;state.briefLoading=true;state.briefError='';draw();
 try{
  const c=one(),a=await c.auth.getUser();
  if(a.error||a.data?.user?.id!==OWNER)throw Error('Нет подтверждённой сессии директора');
  const res=await c.functions.invoke(ENDPOINT,{body:{kind:'director_brief'}});
  if(res.error)throw res.error;
  const d=res.data;
  if(d?.mode!=='readonly'||d?.kind!=='director_daily_brief'||d?.items_count!==5||
   !Array.isArray(d.cards)||d.cards.length!==5||
   d.cards.some(x=>!x.id||!x.title||!x.fact||!x.action||!x.source))throw Error('Некорректный ответ аналитики');
  if(seq!==state.seq||actor!==userId()||!authorized())return;
  state.briefing=d;state.selected=new Set(d.cards.filter(x=>x.attention).map(x=>x.id));
  state.notice='Проверено пять направлений. Остальные разделы требуют подключения к общему аналитическому обзору.';
 }catch(e){if(seq===state.seq&&actor===userId()){state.briefError=trim(e?.message||e,180);state.notice='';}}
 finally{if(seq===state.seq){state.briefLoading=false;if(authorized())draw();}}
}
function render(){
 const root=$('cmp-root');if(!root)return;
 if(state.actor&&state.actor!==userId())clear();
 state.actor=userId();
 if(!authorized()){root.textContent='Раздел доступен только в персональном пилоте директора.';return;}
 if(!state.focus)state.focus=dateMinsk();
 draw();
 if(!state.loaded&&!state.loading)void meetingsRefresh();
}
function onClick(e){
 const target=e.target.closest?.('#page-meeting-planner [data-cmp-date], #page-meeting-planner [data-cmp-shift], #page-meeting-planner [data-cmp-today], #page-meeting-planner [data-cmp-mode], #page-meeting-planner [data-cmp-brief], #page-meeting-planner [data-cmp-topic], #page-meeting-planner [data-cmp-open], #page-meeting-planner [data-cmp-copy], #page-meeting-planner [data-cmp-connect], #page-meeting-planner [data-cmp-voice], #page-meeting-planner [data-cmp-refresh]');
 if(!target)return;
 if(!authorized())return;
 if(target.hasAttribute('data-cmp-date'))state.focus=target.dataset.cmpDate;
 else if(target.hasAttribute('data-cmp-today'))state.focus=dateMinsk();
 else if(target.hasAttribute('data-cmp-mode'))state.mode=target.dataset.cmpMode;
 else if(target.hasAttribute('data-cmp-shift')){
   const delta=Number(target.dataset.cmpShift)||0;
   state.focus=state.mode==='month'?monthMove(state.focus,delta):move(state.focus,delta*(state.mode==='week'?7:1));
 }
 else if(target.hasAttribute('data-cmp-refresh')){void meetingsRefresh();return;}
 else if(target.hasAttribute('data-cmp-brief')){void briefRefresh();return;}
 else if(target.hasAttribute('data-cmp-topic')){
   const id=target.dataset.cmpTopic;if(state.selected.has(id))state.selected.delete(id);else state.selected.add(id);
 }
 else if(target.hasAttribute('data-cmp-open')){
   const id=target.dataset.cmpOpen,nav=$('nav-'+id);
   if(nav&&nav.style.display!=='none'){nav.click();return;}
   state.notice='Раздел сейчас недоступен для перехода.';
 }
 else if(target.hasAttribute('data-cmp-connect')){
   if(typeof window.crmConnectOpen126==='function'){Promise.resolve(window.crmConnectOpen126()).catch(()=>{});return;}
   state.notice='CONNECT недоступен. Видеозвонок не запущен.';
 }
 else if(target.hasAttribute('data-cmp-voice')){
   const launch=document.querySelector('.rva-launch:not([hidden]), .rva-ai360-safe-launch:not([hidden])');
   if(launch){launch.click();return;}
   state.notice='Лера пока не запущена. Откройте существующего ИИ-агента через кнопку CRM.';
 }
 else if(target.hasAttribute('data-cmp-copy')){
   const content=agendaText();
   if(!content){state.notice='Сначала выберите вопросы повестки.';draw();return;}
   if(navigator.clipboard?.writeText){
     navigator.clipboard.writeText(content).then(()=>{state.notice='Черновик повестки скопирован; в CRM он ещё не сохранён.';draw();})
      .catch(()=>{window.prompt('Скопируйте черновик вручную:',content);});
   }else window.prompt('Скопируйте черновик вручную:',content);
   return;
 }
 if(!state.range||utc(state.focus).getTime()<Date.parse(state.range.from)+3*86400000||
    utc(state.focus).getTime()>Date.parse(state.range.to)-3*86400000){
   state.loaded=false;state.meetings=[];state.range=null;
 }
 draw();
 if(!state.loaded&&!state.loading)void meetingsRefresh();
}
document.addEventListener('click',onClick);
window.crmMeetingPlannerPilotV1=Object.freeze({render,refresh:meetingsRefresh,brief:briefRefresh,version:'payushin-pilot-v1'});
})(window,document);
