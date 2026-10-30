/* RESANTA AI360 · branch-director voice pilot v1.
   Sidarovich ONLY. The existing Payushin director AI and Android app are unchanged.
   No CRM reads on login. No model calls, no task writes, no paid STT/TTS.
   Browser recognition and browser speech synthesis run only after user action.
*/
(function(root){
'use strict';
// Android/WebView is blocked unless a signed-in employee explicitly activates the opt-in launcher.
if((/Android/i.test(navigator.userAgent||'')&&!root.__resantaAI360AndroidStaffOptIn)||root.crmAI360BranchVoicePilotV1)return;
const role=()=>root.crmAI360StaffIdentityV1?.()||null;
const ENDPOINT='crm-ai360-staff-read-v1';
const STEMS=[['рудн','Руднев'],['ачинов','Ачинович'],['шкур','Шкуран']];
const MONTHS=[['январ',1],['феврал',2],['март',3],['апрел',4],['ма',5],['июн',6],['июл',7],['август',8],['сентябр',9],['октябр',10],['ноябр',11],['декабр',12]];
const MAX_ANSWER=4000;
const normalize=x=>String(x??'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
const text=x=>String(x??'').replace(/[\u0000-\u001f]+/g,' ').trim().slice(0,180);
const amount=x=>Number(x||0).toLocaleString('ru-RU',{maximumFractionDigits:0})+' белорусских рублей';
const n=x=>Number.isFinite(Number(x))?Number(x):0;
let launcher=null,panel=null,log=null,field=null,status=null,send=null,mic=null,mute=null;
let busy=false,verified=false,recognition=null,muted=false,epoch=0;
let last={domain:'',manager:null,month:null,offset:0,client_name:'',group:'',subgroup:'',level:'groups'};
const Recognition=root.SpeechRecognition||root.webkitSpeechRecognition||null;
function allowed(){
 const p=role();
 return !!p&&['branch_director','field_manager','triovist_category'].includes(p.tier);
}
function panelVisible(){return Boolean(allowed()&&panel&&!panel.hidden&&!document.hidden);}
function say(message){
 if(!panelVisible()||muted)return;
 // Shared paid provider engines: OpenAI transcription, Yandex SpeechKit narration.
 // No robotic browser fallback in this branch pilot.
 void root.crmAI360BranchPremiumVoiceV1?.speak(String(message||'').slice(0,1200));
}
function show(message,{speak=true}={}){
 if(!panelVisible()||!log)return;
 const p=document.createElement('div');p.className='rsa-staff-answer';
 p.style.cssText='white-space:pre-wrap;padding:10px 12px;background:#f2f7ff;border:1px solid #d6e6fb;border-radius:10px;margin-top:10px;font-size:13px;line-height:1.5;';
 p.textContent=String(message||'').slice(0,MAX_ANSWER);
 log.appendChild(p);log.scrollTop=log.scrollHeight;
 if(speak)say(String(message||'').slice(0,1100));
}
function setStatus(message){if(status)status.textContent=text(message);}
function managerFrom(q){
 const hits=STEMS.filter(([stem])=>q.includes(stem)).map(x=>x[1]);
 return hits.length===1?hits[0]:null;
}
function monthFrom(q){
 const iso=q.match(/\b(20\d{2})[-.](0[1-9]|1[0-2])\b/);
 if(iso)return iso[1]+'-'+iso[2];
 const m=MONTHS.find(([stem])=>q.includes(stem));
 if(!m)return null;
 const year=q.match(/\b20\d{2}\b/);
 return (year?year[0]:new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric'}).format(new Date()))+
   '-'+String(m[1]).padStart(2,'0');
}
function parseQuestion(raw,previous=last){
 const q=normalize(raw).replace(/^(?:лера|ресанта)[,.!?\s]*/i,'');
 const continuation=/^(?:дальше|продолж|остальные|следующие|еще|ещё|а дальше|покажи ещё|покажи еще)/.test(q);
 const namedManager=managerFrom(q);
 const clientFollowup=previous.domain==='client_detail'&&
   /(?:групп|подгрупп|артикул|sku|категори)/.test(q)&&
   /^(?:покажи|какие|дай|расскажи|а\s|назови|выведи)/.test(q);
 const domain=continuation&&previous.domain?previous.domain:
   role()?.tier==='triovist_category'&&/мои категории|закрепленн.*групп|группы товар/.test(q)?'triovist_groups':
   role()?.tier==='triovist_category'&&/позици|топ.?60|выдач|ранжир/.test(q)?'triovist_positions':
   role()?.tier==='triovist_category'&&/ошибк|замечан|проблемн.*карточ|дефект/.test(q)?'triovist_issues':
   role()?.tier==='triovist_category'&&/инфограф/.test(q)?'triovist_infographics':
   role()?.tier==='triovist_category'&&/поручен|задач/.test(q)?'triovist_tasks':
   role()?.tier==='triovist_category'&&/21век|21vek|карточ|товар|ассортимент|категори/.test(q)?'triovist_cards':
   /(?:что|какие|чем).*?(?:обсуд|подсвет|предлож|порекоменд|сделать).*?(?:рудн|ачинов|шкур)|(?:обсуд|подсвет|предлож).*?(?:с |для )(?:рудн|ачинов|шкур)/.test(q)?'manager_brief':
   /пдз|долг|задолж|дебитор|просроч.*оплат/.test(q)?'debt':
   /gps|джипиэс|геолокац/.test(q)?'gps':
   /склад|остатк|наличи.*товар/.test(q)?'stock':
   /визит|посещен|переговор/.test(q)?'visits':
   /маршрут|план.*поезд/.test(q)?'routes':
   /задач|поручен/.test(q)?'tasks':
   clientFollowup||(/клиент|покупател/.test(q)&&
    /групп|подгрупп|sku|артикул|товар.*по|по.*товар|разбор|анализ|динамик|паден/.test(q))?'client_detail':
   /клиент|покупател|база/.test(q)?'clients':
   /продаж|продал|выруч|оборот|план|факт|кпи|kpi/.test(q)?'sales':null;
 const month=monthFrom(q)||(continuation?previous.month:null);
 const payload={kind:'read',domain,manager:namedManager||(continuation?previous.manager:null),
  month,offset:continuation?previous.offset:0,
  when:/\bсегодня\b|на сегодня/.test(q)?'today':null};
 if(domain==='client_detail'){
  const match=q.match(/(?:^|\s)(?:по\s+)?клиент(?:у|а|ом)?\s+[«"]?(.+?)(?=\s+(?:в\s+(?:группе|подгруппе)|групп[а-я]*|подгрупп[а-я]*|артикул[а-я]*|sku|за\s+(?:20\d{2}|[а-я]+))|$)/);
  const named=match?.[1]?.replace(/["»«]/g,'').trim().slice(0,150)||'';
  const sameClient=!named||named===previous.client_name;
  payload.client_name=named||(previous.domain==='client_detail'?previous.client_name:'');
  payload.level=/sku|артикул/.test(q)?'sku':
    /подгрупп/.test(q)?'subgroups':continuation?previous.level:'groups';
  const groupMatch=q.match(/(?:в\s+группе|группа\s*[:\-])\s*[«"]?(.+?)(?=\s+в\s+подгруппе|[»"]?$)/);
  const subgroupMatch=q.match(/(?:в\s+подгруппе|подгруппа\s*[:\-])\s*[«"]?(.+?)[»"]?$/);
  payload.group=(groupMatch?.[1]?.replace(/[»" ]+$/,'').trim().slice(0,120))||
    (sameClient?previous.group:'')||null;
  payload.subgroup=(subgroupMatch?.[1]?.replace(/[»" ]+$/,'').trim().slice(0,120))||
    (sameClient?previous.subgroup:'')||null;
 }
 return payload;
}

function formatted(domain,data,scope){
 const managers=Array.isArray(scope?.managers)?scope.managers.join(', '):'Витебск';
 if(domain==='routes'&&data.route_summary){
  const sum=data.route_summary;
  const detailed=(data.items||[]).map(r=>text(r.client_name)+
    ': '+(r.visited?'отмечено посещение':'посещение пока не отмечено')+
    (r.approved?', маршрут подтверждён':', ожидает подтверждения'));
  return 'Маршрут · '+managers+' · '+text(sum.date)+
   '. Всего точек '+n(sum.total_routes)+
   ', подтверждено '+n(sum.confirmed_routes)+
   ', посещено '+n(sum.visited_routes)+
   ', без отметки посещения '+n(sum.not_yet_visited)+'.\n'+
   'Первые '+(data.items||[]).length+' точек:\n'+
   (detailed.join('\n')||'В маршруте нет подтверждённых точек.')+
   (data.has_more?'\nЭто часть списка. Для остальных точек скажи «дальше».':'');
 }
 if(domain.startsWith('triovist_')){
  const titles={triovist_groups:'Мои группы 21vek',triovist_cards:'Карточки 21vek',
   triovist_positions:'Поисковые позиции',triovist_issues:'Замечания к карточкам',
   triovist_tasks:'Задачи Триовист',triovist_infographics:'Инфографика'};
  const formatItem={
   triovist_groups:r=>text(r.group_name),
   triovist_cards:r=>text(r.sku)+' · '+text(r.product_name)+' · '+text(r.category)+
     ' · фото '+n(r.photo_count)+' · '+text(r.registry_snapshot_date),
   triovist_positions:r=>text(r.sku)+' · '+text(r.category)+' · позиция '+
     text(r.current_position??'нет данных')+' · '+text(r.current_observed_at),
   triovist_issues:r=>text(r.issue_title)+' · '+text(r.severity)+' · '+text(r.status),
   triovist_tasks:r=>text(r.title)+' · '+text(r.group_name)+' · '+text(r.status)+
     ' · срок '+text(r.due_date),
   triovist_infographics:r=>text(r.sku)+' · '+text(r.group_name)+' · '+text(r.status)+
     ' · слайдов '+n(r.completed_slides)+' из '+n(r.slide_count)
  };
  const rows=(data.items||[]).map(formatItem[domain]||(()=>'' )).filter(Boolean);
  return (titles[domain]||'Мои категории')+' · '+text(data.manager_name||managers)+
   '.\nЗакреплено групп: '+n(data.group_count)+'.\n'+
   (rows.join('\n')||'Записей по выбранному условию нет.')+
   (data.has_more?'\nПоказана только часть. Скажи «дальше» для продолжения.':'')+
   '\nТолько категории, закреплённые в CRM. Отчёты могут быть не сегодняшними.';
 }
 if(domain==='sales'){
  const rows=(data.managers||[]).map(r=>{
   const v=Number(r.plan_pct);
   return r.manager_name+': план '+amount(r.plan)+', факт '+amount(r.actual)+
    ', выполнение '+(Number.isFinite(v)?v.toLocaleString('ru-RU',{maximumFractionDigits:1}):'не рассчитано')+
    '%. До плана '+amount(r.to_plan)+'.';
  });
  return 'Продажи менеджеров · '+text(data.month)+'.\n'+(rows.join('\n')||'Утверждённых планов в разрешённой выборке нет.')+
   '\nВажно: факт — отгрузки по методике KPI. Общий оборот филиала здесь не рассчитывается.';
 }
 if(domain==='debt'){
  const totals=(data.manager_totals||[]).map(m=>m.manager_name+': просрочка '+amount(m.amount)+
   ', строк '+n(m.debtor_rows)+'.');
  const debt=(data.overdue_debtors||[]).slice(0,8).map(d=>text(d.client_name)+
   ' — '+amount(d.debt_overdue)+', '+n(d.debt_overdue_days)+' дней, '+text(d.manager_name)+'.');
  return 'Просроченная ПДЗ · '+managers+'.\n'+totals.join('\n')+
   '\nКрупнейшие долги:\n'+(debt.join('\n')||'Нет подтверждённых строк.')+
   '\nПоказаны не все должники; данные по последнему импорту.';
 }
 if(domain==='client_detail'){
  const lines=(data.items||[]).map(r=>{
   const label=data.level==='sku'?('Артикул '+text(r.sku||'не указан')+' '+text(r.product)):
     data.level==='subgroups'?text(r.subgroup):text(r.category);
   return label+': изменение '+amount(r.delta_byn)+'.';
  });
  return 'Клиент '+text(data.client_name)+', '+text(data.manager_name)+
   '. Период '+text(data.current_period)+'. Суммарное изменение '+amount(data.delta_byn)+
   '.\n'+(lines.join('\n')||'Данных по выбранному уровню нет.')+
   (data.has_more?'\nЭто часть списка. Скажи «дальше».':'')+
   (data.level==='groups'?'\nДля детализации скажи «Покажи подгруппы в группе Садовая техника», затем назови нужную подгруппу.':'');
 }
 const fields={
  clients:r=>text(r.name)+' — '+text(r.manager_name)+', '+text(r.client_status||'статус не указан'),
  tasks:r=>text(r.manager_name)+': '+text(r.title)+', срок '+text(r.due_date)+', '+text(r.review_status),
  routes:r=>text(r.manager_name)+': '+text(r.client_name)+', '+text(r.visit_date)+', '+text(r.status),
  visits:r=>text(r.manager_name)+': '+text(r.date)+', '+text(r.goal)+', итог '+text(r.result),
  gps:r=>text(r.manager_name)+': '+text(r.work_date)+', остановок '+n(r.physical_stops)+
   ', посещений '+n(r.visited_count)+', пропущено '+n(r.missed_count),
  stock:r=>text(r.sku)+' '+text(r.product)+', доступно '+n(r.qty_avail)+' шт., склад '+text(r.warehouse)
 };
 const labels={clients:'Клиенты',tasks:'Поручения',routes:'Маршруты',
  visits:'Посещения',gps:'GPS-контроль',stock:'Остатки'};
 const lines=(data.items||[]).map(fields[domain]||(()=>'' )).filter(Boolean);
 return (labels[domain]||'Раздел CRM')+' · '+managers+'.\n'+
  (lines.join('\n')||'В этой выборке записи не найдены.')+
  (data.has_more?'\nПоказана только часть записей. Скажи «дальше».':'\nЭто только выбранный раздел, не аудит всей базы.');
}
async function managerBrief(manager,month,started){
 if(!manager){show('Назови менеджера Витебска: Руднев, Ачинович или Шкуран.');return;}
 busy=true;if(send)send.disabled=true;if(mic)mic.disabled=true;
 setStatus('Проверяю продажи, ПДЗ и задачи '+manager+'…');
 try{
  const sources=['sales','debt','tasks'];
  const values=await Promise.all(sources.map(domain=>db.functions.invoke(ENDPOINT,{
   body:{kind:'read',domain,manager,month,offset:0}
  })));
  if(!panelVisible()||started!==epoch)return;
  const data={};
  const permittedRole=role();
  for(let i=0;i<values.length;i++){
   const res=values[i];const p=res.data;
   if(res.error||!p||p.answer_verified!==true||p.read_only!==true||
     p.domain!==sources[i]||p.scope?.role!==permittedRole?.tier||
     !Array.isArray(p.scope?.managers)||p.scope.managers.length!==1||p.scope.managers[0]!==manager)
    throw Error('manager_brief_source_unverified');
   data[sources[i]]=p.data;
  }
  const m=(data.sales.managers||[]).find(x=>x.manager_name===manager);
  const debt=(data.debt.manager_totals||[]).find(x=>x.manager_name===manager);
  const toDiscuss=[];
  if(m)toDiscuss.push('План и продажи: '+amount(m.actual)+' из '+amount(m.plan)+
   ', выполнение '+Number(m.plan_pct||0).toLocaleString('ru-RU',{maximumFractionDigits:1})+
   '%. Уточнить подтверждённые отгрузки и следующие заказы.');
  if(debt&&n(debt.amount)>0)toDiscuss.push('ПДЗ: '+amount(debt.amount)+
    '. Попросить даты закрытия просрочки и план работы с должниками.');
  const tasks=(data.tasks.items||[]);
  if(tasks.length)toDiscuss.push('Незакрытые задачи: '+tasks.length+
   (data.tasks.has_more?' или больше (показана часть)':' в текущей выборке')+
   '. Проверить сроки и результаты.');
  toDiscuss.push('Проверить клиентскую базу, падающих клиентов и ближайший маршрут отдельно, прежде чем утверждать новые поручения.');
  show('Что обсудить с '+manager+' на основании CRM:\n'+toDiscuss.map((x,i)=>(i+1)+'. '+x).join('\n')+
   '\nЭто проверенные сигналы, не утверждение о причинах падения продаж. При желании подготовлю поручение.');
  setStatus('Проверены три источника CRM · '+manager);
 }catch(e){
  if(panelVisible()&&started===epoch)show('Не смогла проверить все источники по '+manager+
   '. Частичную аналитику не выдаю за подтверждённую.',{speak:false});
 }finally{if(started===epoch){busy=false;if(send)send.disabled=false;if(mic)mic.disabled=false;}}
}

async function read(q){
 if(busy||!panelVisible())return;
 // Director-grade AI orchestration on the same OpenAI model; server limits every read
 // to branch-authorized data and never delegates task creation to the model.
 if(root.crmAI360BranchUnifiedHandleV1?.(q,{show,setStatus,authorized:panelVisible}))return;
 const parsed=parseQuestion(q);
 if(parsed.domain==='manager_brief'){
  const seq=++epoch;
  void managerBrief(parsed.manager,parsed.month,seq);
  return;
 }
 if(!parsed.domain){
  show('Уточни раздел: продажи, ПДЗ, задачи, маршруты, визиты, GPS, остатки или клиенты.');
  return;
 }
 if(parsed.domain==='client_detail'&&!parsed.client_name){
  show('Назови точное название клиента, как в CRM. Я проверю его закрепление в Витебском филиале.');
  return;
 }
 busy=true;const started=++epoch;
 if(send)send.disabled=true;if(mic)mic.disabled=true;
 setStatus('Проверяю доступ и данные CRM…');
 try{
  const session=typeof root.crmEnsureFreshSessionV236166==='function'?
   await root.crmEnsureFreshSessionV236166(false):
   await db.auth.getSession().then(x=>x?.data?.session);
  if(!session?.access_token)throw new Error('not_authorized');
  if(!allowed()||!panelVisible()||started!==epoch)return;
  const res=await db.functions.invoke(ENDPOINT,{body:parsed});
  if(res.error){
   let code='source_unavailable';
   try{code=String((await res.error.context?.json?.())?.error||res.error.message||code);}catch{}
   throw new Error(code);
  }
  if(!allowed()||!panelVisible()||started!==epoch)return;
  const payload=res.data;
  if(payload?.mode!=='staff_scoped_readonly_pilot_v1'||payload?.answer_verified!==true||
    payload?.read_only!==true||payload.domain!==parsed.domain||
    payload.scope?.role!==role()?.tier||!Array.isArray(payload.scope.managers)||
    payload.scope.managers.some(name=>role()?.tier==='branch_director'?
      !STEMS.some(v=>v[1]===name):name!==role()?.name))
    throw new Error('invalid_scoped_reply');
  const data=payload.data||{};
  const answer=formatted(parsed.domain,data,payload.scope);
  last={domain:parsed.domain,manager:parsed.manager,month:parsed.month,
   offset:data.has_more&&Number.isInteger(data.next_offset)?data.next_offset:0,
   client_name:parsed.client_name||'',group:parsed.group||'',subgroup:parsed.subgroup||'',
   level:parsed.level||'groups'};
  setStatus('Данные проверены · '+text(payload.as_of)+' · только чтение');
  show(answer);
 }catch(e){
  if(panelVisible()&&started===epoch){
   const issue=String(e?.message||e).slice(0,110);
   const safeMsg=/^client_not_in_authorized_portfolio/.test(issue)?
    'Указанный клиент не закреплён за разрешёнными менеджерами Витебска либо имя неоднозначно. Чужие данные не показываю.':
    /^group_required|^subgroup_required/.test(issue)?
    'Для детализации назови точную группу и подгруппу товара.':
    'Не удалось получить проверенный ответ CRM ('+text(issue)+'). Другие данные не подставляю.';
   setStatus('Данные не получены');show(safeMsg,{speak:false});
  }
 }finally{if(started===epoch){busy=false;if(send)send.disabled=false;if(mic)mic.disabled=false;}}
}
function submit(){
 if(!field||busy||!panelVisible())return;
 const question=field.value.trim().slice(0,350);if(!question)return;
 field.value='';const line=document.createElement('div');line.textContent='Вы: '+question;
 line.style.cssText='padding:8px 4px;font-size:12px;color:#445b77;';
 log.appendChild(line);log.scrollTop=log.scrollHeight;
 // Voice task commands are handled before ordinary read-only analytic questions.
 if(root.crmAI360BranchTaskHandleV1?.(question))return;
 if(root.crmLprV1?.voice(question,{answer:show}))return;
 void read(question);
}
function beginMicrophone(){
 if(!panelVisible()||busy)return;
 if(!root.crmAI360BranchPremiumVoiceV1){
  show('Голосовой движок временно недоступен. Используй текстовый вопрос.',{speak:false});
  return;
 }
 root.crmAI360BranchPremiumVoiceV1.listen();
}
function close(){
 epoch++;busy=false;
 if(recognition){try{recognition.abort();}catch{}recognition=null;}
 root.crmAI360BranchPremiumVoiceV1?.stop();
 if(panel)panel.hidden=true;
 root.crmAI360BranchPremiumVoiceV1?.stop();
 root.crmAI360BranchUnifiedResetV1?.();
 root.crmAI360BranchTaskResetV1?.();
 if(log)log.textContent='';
 last={domain:'',manager:null,month:null,offset:0,client_name:'',group:'',subgroup:'',level:'groups'};
 verified=false;
}
function buildPanel(){
 if(panel)return;
 const style=document.createElement('style');
 style.textContent='.rsa-branch-panel[hidden]{display:none!important}.rsa-branch-panel{position:fixed;z-index:960;right:16px;top:58px;bottom:16px;width:min(500px,calc(100vw - 32px));background:#fff;border:1px solid #b4d0ef;border-radius:16px;box-shadow:0 18px 60px #09233b40;padding:14px;box-sizing:border-box;display:flex;flex-direction:column;gap:10px;color:#1c334e}.rsa-branch-panel button{cursor:pointer;border-radius:8px;border:1px solid #b8cbe1;background:#f3f8ff;padding:8px}.rsa-branch-panel button:disabled{opacity:.55;cursor:wait}.rsa-branch-panel input{min-width:0;flex:1;border:1px solid #adbed0;border-radius:8px;padding:9px}.rsa-branch-log{overflow-y:auto;min-height:0;flex:1}@media(max-width:600px){.rsa-branch-panel{inset:6px;width:auto}}';
 document.head.appendChild(style);
 panel=document.createElement('section');panel.className='rsa-branch-panel';panel.hidden=true;
 panel.setAttribute('role','dialog');panel.setAttribute('aria-label','РЕСАНТА AI · руководитель филиала');
 const heading=document.createElement('div');heading.style.cssText='display:flex;gap:9px;align-items:center;';
 const name=document.createElement('strong');name.textContent='🎙 РЕСАНТА AI · '+(role()?.tier==='triovist_category'?'Триовист 21vek':role()?.tier==='field_manager'?'Мои клиенты':'Витебск');
 name.style.flex='1';
 const exit=document.createElement('button');exit.type='button';exit.textContent='Закрыть';
 exit.addEventListener('click',close);heading.append(name,exit);
 const note=document.createElement('small');
 note.textContent=role()?.can_create_tasks?'Директор филиала · данные Витебска · поручения после подтверждения':role()?.tier==='triovist_category'?'Триовист · только закреплённые категории 21vek · без создания поручений':'Менеджер · только мои клиенты и задачи · без создания поручений';
 const entry=document.createElement('div');entry.style.cssText='display:flex;gap:8px;';
 field=document.createElement('input');field.type='text';field.maxLength=350;
 field.placeholder='Например: продажи Руднева или ПДЗ филиала';
 field.setAttribute('aria-label','Вопрос Лере');
 field.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();submit();}});
 send=document.createElement('button');send.type='button';send.textContent='➤';send.addEventListener('click',submit);
 entry.append(field,send);
 const actions=document.createElement('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:8px;';
 mic=document.createElement('button');mic.textContent='🎤 Спросить через OpenAI';mic.addEventListener('click',beginMicrophone);
 mute=document.createElement('button');mute.textContent='🔊 Лера · Яндекс';mute.addEventListener('click',()=>{
  muted=!muted;mute.textContent=muted?'🔇 Голос выключен':'🔊 Лера · Яндекс';
  root.crmAI360BranchPremiumVoiceV1?.setMuted(muted);
 });
 const wake=document.createElement('button');wake.type='button';
 wake.textContent='◉ Привет, Ресанта';
 wake.addEventListener('click',()=>{
  const active=root.crmAI360BranchPremiumVoiceV1?.toggleWake()||false;
  wake.textContent=active?'■ Выключить ожидание':'◉ Привет, Ресанта';
 });
 const voiceSwitch=document.createElement('button');voiceSwitch.type='button';
 voiceSwitch.textContent='Голос: Лера';
 let useDasha=false;
 voiceSwitch.addEventListener('click',()=>{
  useDasha=!useDasha;
  root.crmAI360BranchPremiumVoiceV1?.setVoice(useDasha?'dasha':'lera');
  voiceSwitch.textContent=useDasha?'Голос: Даша':'Голос: Лера';
 });
 actions.append(mic,wake,mute,voiceSwitch);
 status=document.createElement('div');status.style.cssText='font-size:11px;color:#54708e;';
 status.setAttribute('role','status');status.textContent='Только чтение · готова к вопросу';
 log=document.createElement('div');log.className='rsa-branch-log';log.setAttribute('role','log');
 const speechNote=document.createElement('small');
 speechNote.textContent='Речь распознаётся OpenAI, озвучка — Яндекс Лера/Даша. Ожидание «Привет, Ресанта» включается вручную и прекращается при закрытии окна. Голос передаётся внешним сервисам.';
 panel.append(heading,note,log,entry,actions,status,speechNote);
 document.body.appendChild(panel);
 root.crmAI360BranchTaskMountV1?.(panel);
 root.crmAI360BranchPremiumVoiceV1?.bind({
  panel,authorized:panelVisible,
  onTranscript:q=>{if(panelVisible()&&field){field.value=q;submit();}},
  onStatus:setStatus
 });
}
async function open(){
 if(!allowed())return;
 buildPanel();panel.hidden=false;
 if(verified){setStatus('Подключено · только чтение');return;}
 const seq=++epoch;setStatus('Проверяю права доступа…');
 try{
  const session=typeof root.crmEnsureFreshSessionV236166==='function'?
   await root.crmEnsureFreshSessionV236166(false):await db.auth.getSession().then(x=>x?.data?.session);
  if(!session?.access_token)throw new Error('not_authorized');
  const response=await db.functions.invoke(ENDPOINT,{body:{kind:'capabilities'}});
  if(response.error)throw new Error('permission_unavailable');
  const data=response.data;
  if(seq!==epoch||!panelVisible()||data?.ready!==true||
   data?.role!==role()?.tier||data?.own_name!==role()?.name||
   data?.voice_enabled!==true||data?.real_task_creation_enabled!==role()?.can_create_tasks||
   !Array.isArray(data.domains)||!data.domains.includes(role()?.tier==='triovist_category'?'triovist_cards':'sales'))
   throw new Error('invalid_staff_capabilities');
  verified=true;
  setStatus('Подключено · голос OpenAI + Яндекс · поручения с подтверждением');
  show(role()?.can_create_tasks?'Здравствуйте! Я Лера, помощник Витебского филиала. Анализирую разрешённые данные и готовлю поручения только после подтверждения.':role()?.tier==='triovist_category'?'Здравствуйте! Я Лера. Помогу анализировать ваши категории Триовиста: карточки 21vek, позиции, замечания, задачи и инфографику. Поручения не создаю.':'Здравствуйте! Я Лера, ваш помощник в CRM. Показываю только ваши продажи, клиентов, задачи, маршруты и ПДЗ. Создание поручений недоступно.',{speak:false});
 }catch(e){if(panelVisible()&&seq===epoch){setStatus('Не удалось подтвердить права доступа');show('Доступ к защищённой аналитике сейчас не подтверждён. Ничего не менялось.',{speak:false});}}
}
function mount(){
 const top=document.querySelector('#app .topbar');
 if(!top)return;
 if(!launcher){
  launcher=document.createElement('button');launcher.type='button';launcher.className='rsa-branch-launch';
  launcher.textContent=role()?.tier==='triovist_category'?'🎙 Лера · Триовист':role()?.tier==='field_manager'?'🎙 Лера · Мои клиенты':'🎙 Лера · Витебск';
  launcher.style.cssText='border:1px solid #2771ac;border-radius:8px;background:#ebf6ff;color:#15558e;padding:7px 9px;font-size:12px;font-weight:750;cursor:pointer';
  launcher.addEventListener('click',()=>void open());
  top.insertBefore(launcher,top.querySelector('.user-badge'));
 }
 launcher.hidden=!allowed();
 if(allowed())launcher.textContent=role()?.tier==='triovist_category'?'🎙 Лера · Триовист':role()?.tier==='field_manager'?'🎙 Лера · Мои клиенты':'🎙 Лера · Витебск';
 if(!allowed()&&panel&&!panel.hidden)close();
}
root.crmAI360BranchVoicePilotV1={allowed,parseQuestion,formatted,open,close,submit,beginMicrophone};
mount();
root.setInterval(mount,5000);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&recognition){try{recognition.abort();}catch{}recognition=null;}});
root.addEventListener('pagehide',close);
})(window);
