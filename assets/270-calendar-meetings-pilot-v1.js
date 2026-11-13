/* Calendar & meetings: isolated Payushin-only pilot on top of Lera #309.
 * Existing meeting owner-RLS and director briefing Edge are the only data sources.
 * No new assistant, no cron, no history storage, no automatic writes/invites. */
(function(window,document){
'use strict';
if(window.crmMeetingPlannerPilotV1)return;
const OWNER='544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
const ENDPOINT='crm-ai360-director-briefing-v1';
const COVERAGE_ENDPOINT='crm-ai360-meeting-coverage-v1';
const state={focus:'',mode:'week',meetings:[],loaded:false,loadError:'',loading:false,range:null,
 briefing:null,briefError:'',briefLoading:false,coverage:null,coverageError:'',coverageBusy:false,coverageSeq:0,
 selected:new Set(),actor:'',meetingSeq:0,briefSeq:0,notice:''};
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
const pageFor={sales:'sales',debt:'debt',tasks:'tasks',routes:'routes-boss',triovist:'vip',gps:'gps-control',parser:'vip',cards_21vek:'vip',triovist_tasks:'vip'};
function clear(){state.meetingSeq++;state.briefSeq++;state.coverageSeq++;state.meetings=[];state.loaded=false;state.loadError='';state.loading=false;
 state.briefing=null;state.briefError='';state.briefLoading=false;state.coverage=null;state.coverageError='';state.coverageBusy=false;
 state.selected.clear();state.range=null;state.notice='';}
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
 return '<div class="cmp-calendar">'+(state.mode==='day'?'<div class="cmp-day-caption">'+safe(weekday(state.focus))+' · '+safe(shortDate(state.focus))+'</div>':'<div class="cmp-weekdays">'+weekdays.map(x=>'<span>'+x+'</span>').join('')+'</div>')+
 '<div class="cmp-daygrid '+(state.mode==='month'?'is-month':state.mode==='day'?'is-day':'')+'">'+days.map(day=>{
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
function combinedCards(){
 const five=Array.isArray(state.briefing?.cards)?state.briefing.cards.map(c=>({...c,scope:'existing_verified_brief'})):[];
 const more=Array.isArray(state.coverage?.signals)?state.coverage.signals.map(c=>({
  id:c.id,title:c.title,fact:c.fact,action:c.action,source:c.source||c.domain,
  as_of:c.as_of||state.coverage.as_of,level:c.priority||'medium',domain:c.domain,
  scope:'limited_sample'})):[];
 return [...five,...more];
}
function briefCards(){
 if(state.briefLoading&&!state.briefing)return '<p class="cmp-muted">Лера собирает подтверждённую сводку пяти направлений…</p>';
 if(state.briefError&&!state.briefing)return '<p class="cmp-error">Брифинг пяти направлений недоступен: '+safe(state.briefError)+'. Остальные источники проверяются отдельно.</p>';
 const cards=combinedCards();
 if(!cards.length)return '<div class="cmp-empty"><b>Повестка пока не подготовлена</b><p>Нажмите «Лера · Подготовить совещание». Полный анализ не подменяется общим списком источников.</p></div>';
 return '<div class="cmp-source-note">'+safe(state.briefing?.as_of||state.coverage?.as_of||dateMinsk())+
 ' · '+cards.length+' предметных сигналов и вопросов. '+(state.coverage?'Дополнительно проверен каталог источников, только ограниченные выборки.':'Проверка остальных источников ещё не выполнена.')+'</div>'+
 cards.map(c=>{
 const chosen=state.selected.has(c.id),importance=c.scope==='limited_sample'?'Предварительный сигнал по выборке':
 c.level==='high'?'Высокий приоритет':c.level==='medium'?'Требует внимания':'Информация';
 const topicPage=pageFor[c.domain||c.id]||'dashboard';
 return '<article class="cmp-topic"><div class="cmp-topic-top"><span class="cmp-tag '+safe(c.level)+'">'+safe(importance)+'</span>'+
 '<span class="cmp-muted">'+safe(statusTag[c.domain||c.id]||c.domain||c.id)+'</span></div>'+
 '<h4>'+safe(trim(c.title,180))+'</h4><p><b>Факт:</b> '+safe(trim(c.fact,650))+'</p>'+
 '<p><b>Предлагаю:</b> '+safe(trim(c.action,450))+'</p>'+
 '<div class="cmp-muted cmp-source">Источник: '+safe(trim(c.source,190))+' · '+safe(trim(c.as_of,40))+
 (c.scope==='limited_sample'?' · Неполная выборка, нужно подтверждение в разделе':'')+'</div>'+
 '<div class="cmp-row cmp-actions"><button data-cmp-topic="'+safe(c.id)+'" class="cmp-btn'+(chosen?' strong':'')+'">'+
 (chosen?'✓ В повестке':'+ В повестку')+'</button>'+
 '<button class="cmp-btn" data-cmp-open="'+safe(topicPage)+'">Открыть раздел</button></div></article>';
 }).join('');
}
function audit(){
 const coverage=new Map((state.coverage?.entries||[]).map(x=>[x.id,x]));
 const navMap={
  'nav-dashboard':['sales','operations'],'nav-alerts':['tasks','clients'],
  'nav-clients':['clients','client_detail'],'nav-client360':['clients','client_detail'],
  'nav-connect':[],'nav-tasks':['tasks'],'nav-markdown':['markdown'],
  'nav-visits':['visits'],'nav-vip':['vip','vip_actions'],'nav-promotions':['promotions','promotion_budgets'],
  'nav-stands':['stands'],'nav-vip-actions':['vip_actions'],'nav-budgets':['promotion_budgets'],
  'nav-debt':['debt'],'nav-sales':['sales'],'nav-abc':['clients','sales'],
  'nav-my-routes':['routes'],'nav-route':['routes'],'nav-workday':['visits','routes'],
  'nav-control':['operations','tasks','gps'],'nav-gps-control':['gps'],
  'nav-managers':['motivation','sales'],'nav-routes-boss':['routes'],'nav-users':[]
 };
 const navs=[...document.querySelectorAll('.sidebar .nav-item[id^="nav-"]')].filter(x=>
  x.id!=='nav-meeting-planner'&&x.style.display!=='none'&&
  (typeof window.getComputedStyle!=='function'||window.getComputedStyle(x).display!=='none'));
 const seen=new Set();
 const visible=navs.filter(x=>{if(seen.has(x.id))return false;seen.add(x.id);return true;});
 const list=visible.map(n=>{
  const ids=navMap[n.id]||[],items=ids.map(x=>coverage.get(x)).filter(Boolean);
  const backed=ids.some(id=>state.briefing?.cards?.some(c=>c.id===id));
  const partial=items.some(x=>x.status==='partial'),missing=items.some(x=>x.status==='unavailable');
  const phase=partial||backed?'partial':missing?'unavailable':'pending';
  const desc=partial?'Частично: выборка без полной аналитики':backed?'Частично: подтверждённый узкий брифинг':
     missing?'Источник не ответил':'Полная аналитика не подключена';
  return '<div class="cmp-audit-item"><span class="cmp-audit-dot '+phase+'"></span>'+
   '<span>'+safe(n.textContent.replace(/[\n ]+/g,' ').trim())+'</span><small>'+safe(desc)+'</small>'+
   '<button data-cmp-open="'+safe(n.id.slice(4))+'" title="Открыть раздел">↗</button></div>';
 });
 const entries=state.coverage?.entries||[];
 return '<div class="cmp-audit-grid">'+list.join('')+'</div>'+
 (state.coverageBusy?'<p class="cmp-muted">Проверяю 34 зарегистрированных источника CRM небольшими пакетами…</p>':'')+
 (state.coverageError?'<p class="cmp-error">Каталог источников недоступен: '+safe(state.coverageError)+'</p>':'')+
 (state.coverage?'<div class="cmp-source-note">Каталог: '+safe(state.coverage.registered)+
  ' направлений · доступны ограниченные выборки: '+safe(state.coverage.sample_sources)+
  ' · недоступно: '+safe(state.coverage.unavailable)+
  ' · отдельные профильные расчёты требуются: '+safe(state.coverage.managed_pending)+
  '. Это не значит, что все разделы проверены полностью.</div>'+
 '<details class="cmp-coverage-details"><summary>Подробная проверка '+safe(entries.length)+' источников и причин неполного охвата</summary>'+
 '<div class="cmp-audit-grid">'+entries.map(x=>'<div class="cmp-audit-item">'+
 '<span class="cmp-audit-dot '+(x.status==='partial'?'partial':x.status==='unavailable'?'unavailable':'pending')+'"></span>'+
 '<span>'+safe(x.label||x.id)+'</span><small>'+safe(x.reason||'')+
 (x.as_of?' · '+safe(x.as_of):'')+'</small></div>').join('')+'</div></details>':'')+
 '<p class="cmp-muted">Зелёный статус полной проверки не присваивается за несколько строк данных. Модуль признаётся полностью проверенным только после профильных расчётов, сверки свежести и достоверности.</p>';
}
function agendaText(){
 const items=combinedCards().filter(c=>state.selected.has(c.id));
 if(!items.length)return '';
 return 'Черновик повестки на '+dateMinsk()+' (не сохранён в CRM)\n'+
 items.map((c,i)=>(i+1)+'. '+c.title+'\nФакт: '+c.fact+
 (c.scope==='limited_sample'?'\nОграничение: только часть данных, требуется сверка.':'')+
 '\nПредлагаю: '+c.action+'\nИсточник: '+c.source).join('\n\n')+
 '\n\nРешения и поручения создаются только после подтверждения руководителем.';
}
function draw(){
 const root=$('cmp-root');if(!root)return;
 root.innerHTML='<div class="cmp-head"><div><div class="cmp-overline">Персональный пилот · Александр</div>'+
 '<h2>Календарь и совещания</h2><p>Личный ежедневник, подготовка повестки и переход к видеочату в существующем CONNECT.</p></div>'+
 '<div class="cmp-row"><button class="cmp-btn" data-cmp-refresh>↻ Обновить встречи</button>'+
 '<button class="cmp-btn strong" data-cmp-voice>Лера · Открыть агента</button></div></div>'+
 (state.notice?'<div class="cmp-notice" role="status">'+safe(state.notice)+'</div>':'')+
 '<div class="cmp-kpis"><div><small>Встреч в выбранный день</small><strong>'+(state.loaded?meetingList(state.focus).length:'—')+'</strong></div>'+
 '<div><small>Частично проверено источников</small><strong>'+(state.coverage?state.coverage.sample_sources:(state.briefing?state.briefing.cards.length:'—'))+'</strong></div>'+
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
 '<p class="cmp-muted">5 подтверждённых управленческих сигналов + проверка остальных источников AI Agent 360°. Выборки по новым модулям неполные, их рекомендации предварительные.</p>'+
 briefCards()+'<div class="cmp-row cmp-actions"><button class="cmp-btn" data-cmp-copy '+(!state.selected.size?'disabled':'')+'>Скопировать повестку</button>'+
 '<button class="cmp-btn" data-cmp-connect>К видеосовещанию · CONNECT</button>'+ 
 '<button class="cmp-btn" data-cmp-gps>GPS · Опоздания на первую ТТ</button></div>'+
 '<p class="cmp-muted">Это черновик. Итоги и поручения оформляются отдельно с подтверждением. Полная история диалога не сохраняется.</p></section></div>'+
 '<section class="cmp-panel cmp-audit"><div class="cmp-panel-title"><h3>Что проверено в CRM</h3><span>Охват источников · без ложных отметок</span>'+ 
 '<button class="cmp-btn" data-cmp-coverage '+(state.coverageBusy?'disabled':'')+'>↻ Проверить источники</button></div>'+
 audit()+'</section>';
}
async function meetingsRefresh(){
 if(!authorized()||state.loading)return;
 const actor=userId(),seq=++state.meetingSeq;state.loading=true;state.loadError='';draw();
 try{
  const c=one(),auth=await c.auth.getUser();
  if(auth.error||auth.data?.user?.id!==OWNER)throw Error('Нет подтверждённой сессии директора');
  const focus=utc(state.focus),from=new Date(focus.getTime()-56*86400000).toISOString();
  const to=new Date(focus.getTime()+57*86400000).toISOString();
  const result=await c.from('crm_ai360_meetings_v1')
   .select('id,title,kind,format,purpose,starts_at,duration_minutes,location,participants,client_name')
   .eq('owner_id',OWNER).gte('starts_at',from).lt('starts_at',to).order('starts_at',{ascending:true}).limit(200);
  if(result.error)throw result.error;
  if(seq!==state.meetingSeq||actor!==userId()||!authorized())return;
  state.meetings=Array.isArray(result.data)?result.data:[];state.loaded=true;state.range={from,to};
  if(state.meetings.length===200)state.notice='Показаны первые 200 встреч за период. Для полного списка сузьте диапазон календаря.';
 }catch(e){if(seq===state.meetingSeq&&actor===userId()){state.loaded=false;state.loadError=trim(e?.message||e,180);}}
 finally{if(seq===state.meetingSeq){state.loading=false;if(authorized())draw();}}
}
async function coverageRefresh(){
 if(!authorized()||state.coverageBusy)return;
 const actor=userId(),seq=++state.coverageSeq;
 state.coverageBusy=true;state.coverageError='';draw();
 try{
  const c=one(),auth=await c.auth.getUser();
  if(auth.error||auth.data?.user?.id!==OWNER)throw Error('Нет подтверждённой сессии');
  const r=await c.functions.invoke(COVERAGE_ENDPOINT,{body:{kind:'meeting_coverage'}});
  if(r.error)throw r.error;
  const data=r.data;
  if(data?.kind!=='meeting_coverage'||data?.mode!=='readonly'||
     data.registered!==34||!Array.isArray(data.entries)||data.entries.length!==34)
   throw Error('Неверный ответ каталога');
  if(seq!==state.coverageSeq||actor!==userId()||!authorized())return;
  state.coverage=data;
 }catch(e){if(seq===state.coverageSeq&&actor===userId())state.coverageError=trim(e?.message||e,150);}
 finally{if(seq===state.coverageSeq){state.coverageBusy=false;if(authorized())draw();}}
}
async function briefRefresh(){
 if(!authorized()||state.briefLoading)return;
 const actor=userId(),seq=++state.briefSeq;state.briefLoading=true;state.briefError='';
 void coverageRefresh();draw();
 try{
  const c=one(),a=await c.auth.getUser();
  if(a.error||a.data?.user?.id!==OWNER)throw Error('Нет подтверждённой сессии директора');
  const res=await c.functions.invoke(ENDPOINT,{body:{kind:'director_brief'}});
  if(res.error)throw res.error;
  const d=res.data;
  if(d?.mode!=='readonly'||d?.kind!=='director_daily_brief'||d?.items_count!==5||
   !Array.isArray(d.cards)||d.cards.length!==5||
   d.cards.some(x=>!x.id||!x.title||!x.fact||!x.action||!x.source))throw Error('Некорректный ответ аналитики');
  if(seq!==state.briefSeq||actor!==userId()||!authorized())return;
  state.briefing=d;state.selected=new Set(d.cards.filter(x=>x.attention).map(x=>x.id));
  state.notice='Пять подтверждённых управленческих вопросов готовы. Остальные источники проверяются отдельно с явной отметкой ограничений.';
 }catch(e){if(seq===state.briefSeq&&actor===userId()){state.briefError=trim(e?.message||e,180);state.notice='';}}
 finally{if(seq===state.briefSeq){state.briefLoading=false;if(authorized())draw();}}
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
 const target=e.target.closest?.('#page-meeting-planner [data-cmp-date], #page-meeting-planner [data-cmp-shift], #page-meeting-planner [data-cmp-today], #page-meeting-planner [data-cmp-mode], #page-meeting-planner [data-cmp-brief], #page-meeting-planner [data-cmp-topic], #page-meeting-planner [data-cmp-open], #page-meeting-planner [data-cmp-copy], #page-meeting-planner [data-cmp-connect], #page-meeting-planner [data-cmp-voice], #page-meeting-planner [data-cmp-refresh], #page-meeting-planner [data-cmp-gps], #page-meeting-planner [data-cmp-coverage]');
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
 else if(target.hasAttribute('data-cmp-coverage')){void coverageRefresh();return;}
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
 else if(target.hasAttribute('data-cmp-gps')){
   if(typeof goPage==='function'){goPage('gps-control','GPS-контроль');
     if(typeof window.crmSchedulePageHook==='function')window.crmSchedulePageHook('gps-control',()=>window.crmGPSFirstTTv1?.open(),300);
     else setTimeout(()=>window.crmGPSFirstTTv1?.open(),350);
   }else state.notice='GPS-контроль пока недоступен.';return;
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
window.crmMeetingPlannerPilotV1=Object.freeze({render,refresh:meetingsRefresh,brief:briefRefresh,version:'payushin-coverage-gps-v2'});
})(window,document);
