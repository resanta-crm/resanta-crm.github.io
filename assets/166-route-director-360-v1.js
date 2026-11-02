/* RESANTA CRM · Routes Director 360 · 02.11.2026
 * Director-only presentation layer. Reuses the approved manual day editor.
 * No writes, no route automation, no changes to GPS, 1C or workflows.
 */
(function(w){
'use strict';
if(w.RESANTA_ROUTE_DIRECTOR_360_V1)return;
const ID='route-director-360',PAGE='page-routes-boss',CSS=ID+'-styles';
const S={period:'month',month:'',start:'',manager:'all',day:'',ai:null,editor:false,audit:false,details:false};
const h=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\u0027':'&#39;'}[c]));
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate());
const date=s=>new Date(String(s)+'T12:00:00Z');
const add=(s,n)=>{const d=date(s);d.setUTCDate(d.getUTCDate()+n);return iso(d)};
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const validMonth=m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(m);
const endMonth=m=>{const [y,mm]=m.split('-').map(Number);return iso(new Date(Date.UTC(y,mm,0)))};
const firstMonday=m=>{const d=date(m+'-01'),offset=(8-d.getUTCDay())%7;return add(m+'-01',offset)};
const monthName=m=>new Date(m+'-01T12:00:00Z').toLocaleDateString('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'});
const humanDay=s=>new Date(s+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'});
const boss=()=>{try{return currentProfile?.role==='boss'}catch(_){return false}};
const getData=()=>{try{return {plans:Array.isArray(allRoutePlans)?allRoutePlans:[],clients:Array.isArray(allClients)?allClients:[],tasks:Array.isArray(allTasks)?allTasks:[]}}catch(_){return {plans:[],clients:[],tasks:[]}}};
const page=()=>document.getElementById(PAGE);
const root=()=>document.getElementById(ID);
const scopeManagers=()=>{
 try{if(typeof routeManagerNames==='function'){const names=routeManagerNames();if(Array.isArray(names)&&names.length)return names.filter(Boolean)}}catch(_){}
 const m=document.getElementById('mrl-manager');return [...(m?.options||[])].map(x=>x.value).filter(Boolean);
};
function selectedMonth(){let m='';try{m=localStorage.getItem('crm_route_month_boss')||''}catch(_){}return validMonth(m)?m:(validMonth(S.month)?S.month:today().slice(0,7))}
function range(){
 const m=S.month,end=endMonth(m);if(S.period==='month')return {from:m+'-01',to:end,label:'Весь месяц'};
 const count=num(S.period),start=S.start&&S.start.startsWith(m)?S.start:firstMonday(m);
 return {from:start,to:add(start,count*7-1)>end?end:add(start,count*7-1),label:count===1?'Неделя':count+' недели'};
}
const include=(d,r)=>d>=r.from&&d<=r.to;
const activeClient=c=>c&&!c.is_archived&&['рабочий','потенциальный'].includes(String(c.client_status||'').trim().toLowerCase());
const normalized=s=>String(s||'').trim().toLocaleLowerCase('ru-RU').replace(/\s+/g,' ');
function idsOf(row,byName){
 const ids=new Set();if(row.client_id)ids.add(String(row.client_id));
 let x=row.linked_client_ids;if(typeof x==='string'){try{x=JSON.parse(x)}catch(_){x=[]}}
 if(Array.isArray(x))x.forEach(id=>{if(id)ids.add(String(id))});
 if(!ids.size){const matches=byName.get(normalized(row.manager_name)+'|'+normalized(row.client_name))||[];if(matches.length===1)ids.add(String(matches[0].id));}
 return [...ids];
}
function pointKey(row){
 return String(row.physical_point_key||row.physical_point_id||row.network_point_id||row.client_id||row.id||'');
}
function snapshot(){
 if(!boss())return null;
 const {plans,clients,tasks}=getData(),r=range(),allowed=new Set(scopeManagers());
 const scoped=plans.filter(p=>!p.removed&&allowed.has(p.manager_name)&&include(String(p.visit_date||''),r)&& (S.manager==='all'||p.manager_name===S.manager));
 const active=clients.filter(c=>activeClient(c)&&allowed.has(c.manager_name)&&(S.manager==='all'||c.manager_name===S.manager));
 const byName=new Map();active.forEach(c=>{const k=normalized(c.manager_name)+'|'+normalized(c.name);if(!byName.has(k))byName.set(k,[]);byName.get(k).push(c)});
 const covered=new Set(),routeCovered=new Set(),callsCovered=new Set();
 let unlinked=0;
 scoped.filter(p=>!p.is_office_day&&!p.is_network_point).forEach(p=>{const ids=idsOf(p,byName);if(!ids.length)unlinked++;ids.forEach(id=>{routeCovered.add(id);covered.add(id)})});
 tasks.filter(t=>t.source==='route_call_monthly'&&include(String(t.due_date||''),r)&&(t.done||t.review_status!=='stale_review')).forEach(t=>{if(t.client_id){callsCovered.add(String(t.client_id));covered.add(String(t.client_id))}});
 const missing=active.filter(c=>!covered.has(String(c.id)));
 const buckets=new Map();scoped.forEach(p=>{if(!buckets.has(p.visit_date))buckets.set(p.visit_date,[]);buckets.get(p.visit_date).push(p)});
 const days={};let dateStr=r.from,working=0,filled=0,empty=0,over=0,atLimit=0;
 const dayManagers=S.manager==='all'?[...allowed]:[S.manager];
 while(dateStr<=r.to){
  const dow=date(dateStr).getUTCDay(),rows=buckets.get(dateStr)||[],office=rows.some(p=>p.is_office_day);
  // Load limits apply to each individual field manager, never to the sum of all managers.
  const managerCounts=dayManagers.map(manager=>{
   const subset=rows.filter(p=>p.manager_name===manager);
   const points=new Set(subset.filter(p=>!p.is_office_day).map(pointKey));
   return {manager,count:points.size,office:subset.some(p=>p.is_office_day)};
  });
  const count=managerCounts.reduce((a,x)=>a+x.count,0),maxLoad=Math.max(0,...managerCounts.map(x=>x.count));
  const visits=rows.filter(p=>!p.is_network_point&&!p.is_office_day).length;
  const pending=rows.filter(p=>p.review_status!=='approved'&&p.approved!==true).length;
  const isWorkday=dow!==0&&dow!==6;
  days[dateStr]={rows,office,count,visits,pending,isWorkday,maxLoad,managerCounts};
  if(isWorkday){working+=dayManagers.length;managerCounts.forEach(x=>{if(x.count||x.office)filled++;else empty++})}
  over+=managerCounts.filter(x=>x.count>15).length;
  atLimit+=managerCounts.filter(x=>x.count===15).length;
  dateStr=add(dateStr,1);
 }
 const pending=scoped.filter(p=>p.review_status!=='approved'&&p.approved!==true).length;
 const percent=active.length?Math.round((active.length-missing.length)*100/active.length):null;
 return {r,active,scoped,days,filled,working,empty,over,atLimit,pending,missing,percent,unlinked,routeCovered,callsCovered};
}
function styles(){
 if(document.getElementById(CSS))return;
 const node=document.createElement('style');node.id=CSS;node.textContent=[
 '#page-routes-boss.rd360 > :not(.page-title):not(#route-director-360){display:none!important}',
 '#page-routes-boss.rd360.rd360-editor > #manual-route-lite{display:block!important;margin-top:16px}',
 '#page-routes-boss.rd360.rd360-audit > #route-month-ai-audit-v1{display:block!important;margin-top:16px}',
 '#page-routes-boss.rd360.rd360-details > #rb-coverage-card,#page-routes-boss.rd360.rd360-details > #rb-content{display:block!important;margin-top:16px}',
 '#page-routes-boss.rd360 > .page-title{margin-bottom:10px}',
 '#route-director-360{color:var(--text,#16233a);font-size:13px;max-width:1600px;margin:0 auto}',
 '#route-director-360 .rd-panel{background:#fff;border:1px solid #e2e9f4;border-radius:14px;padding:15px;box-shadow:0 3px 12px rgba(21,48,86,.04);min-width:0}',
 '#route-director-360 .rd-top{display:flex;align-items:end;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px}',
 '#route-director-360 .rd-tabs{display:inline-flex;flex-wrap:wrap;gap:5px;padding:4px;border-radius:11px;background:#f1f5fa}',
 '#route-director-360 button,#route-director-360 select,#route-director-360 input{font:inherit}',
 '#route-director-360 button{cursor:pointer;border:1px solid #cfe0f3;border-radius:9px;background:#fff;color:#15569a;padding:9px 12px;font-weight:700}',
 '#route-director-360 button:hover{background:#eff6ff}#route-director-360 button:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}',
 '#route-director-360 button.rd-active,#route-director-360 button.rd-primary{background:#1765b4;color:#fff;border-color:#1765b4}',
 '#route-director-360 .rd-select{padding:10px;border:1px solid #d7e3f2;border-radius:9px;background:#fff;max-width:240px}',
 '#route-director-360 .rd-filters{display:flex;gap:10px;align-items:center;flex-wrap:wrap}',
 '#route-director-360 .rd-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:12px}',
 '#route-director-360 .rd-metric{border:1px solid #e2eaf4;background:linear-gradient(145deg,#fff,#f2f8ff);border-radius:13px;padding:13px;min-width:0;text-align:left;color:#172b45}',
 '#route-director-360 .rd-metric b{font-size:24px;display:block;margin:8px 0 2px;line-height:1.15}',
 '#route-director-360 .rd-metric span{font-size:11px;line-height:1.3;color:#5b6a7d}#route-director-360 .rd-metric strong{font-size:12px}',
 '#route-director-360 .rd-risk{background:linear-gradient(145deg,#fff,#fff3f2);border-color:#f5dada}',
 '#route-director-360 .rd-main{display:grid;grid-template-columns:minmax(0,1.8fr) minmax(270px,1fr);gap:12px}',
 '#route-director-360 .rd-panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:12px}',
 '#route-director-360 h3{font-size:16px;margin:0;font-weight:800;color:#172b45}',
 '#route-director-360 .rd-sub{font-size:11px;color:#64748b;line-height:1.5;margin-top:5px}',
 '#route-director-360 .rd-legend{font-size:10px;color:#65758b;display:flex;gap:9px;flex-wrap:wrap}',
 '#route-director-360 .rd-cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}',
 '#route-director-360 .rd-weekday{font-size:11px;text-align:center;color:#6b7280;font-weight:750;padding:7px 1px}',
 '#route-director-360 .rd-day{min-width:0;min-height:58px;border-radius:8px!important;border:1px solid #e4eaf2!important;background:#f8fafc!important;color:#253d5d!important;text-align:left;padding:7px!important;font-size:11px!important}',
 '#route-director-360 .rd-day b{display:block;margin-bottom:5px}#route-director-360 .rd-day small{display:block;font-size:10px;line-height:1.3}',
 '#route-director-360 .rd-day.rd-green{background:#e0f8e6!important;border-color:#c7ebd2!important}',
 '#route-director-360 .rd-day.rd-yellow{background:#fff3c9!important;border-color:#f8e5a4!important}',
 '#route-director-360 .rd-day.rd-red{background:#ffdfdf!important;border-color:#f5caca!important}',
 '#route-director-360 .rd-day.rd-outside{opacity:.27}#route-director-360 .rd-day.rd-focus{outline:2px solid #2676da!important}',
 '#route-director-360 .rd-day:disabled{cursor:default;opacity:.28}',
 '#route-director-360 .rd-brief-line{padding:11px 0;border-bottom:1px solid #e9eef6;display:flex;gap:9px;line-height:1.45}',
 '#route-director-360 .rd-brief-line:last-child{border-bottom:0}',
 '#route-director-360 .rd-brief-icon{font-size:17px;flex:0 0 23px}',
 '#route-director-360 .rd-detail{margin-top:10px;border:1px solid #e2eaf4;border-radius:10px;padding:12px;background:#fbfdff}',
 '#route-director-360 details summary{cursor:pointer;font-weight:750;color:#174d8b}',
 '#route-director-360 .rd-actions{display:flex;gap:9px;flex-wrap:wrap;margin:12px 0}',
 '#route-director-360 .rd-actions button{flex:1;min-width:150px}',
 '#route-director-360 .rd-list{margin-top:9px;max-height:300px;overflow:auto}',
 '#route-director-360 .rd-list-row{padding:8px 4px;border-bottom:1px solid #e8edf4;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}',
 '#route-director-360 .rd-list-row:last-child{border:0}',
 '#route-director-360 .rd-note{font-size:11px;color:#65758b;line-height:1.5;margin:10px 0}',
 '@media(max-width:1150px){#route-director-360 .rd-grid{grid-template-columns:repeat(3,minmax(0,1fr))}#route-director-360 .rd-main{grid-template-columns:1fr}}',
 '@media(max-width:640px){#route-director-360 .rd-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#route-director-360 .rd-metric b{font-size:21px}#route-director-360 .rd-top{align-items:stretch}#route-director-360 .rd-filters>*{flex:1;min-width:125px}#route-director-360 .rd-cal{gap:2px}#route-director-360 .rd-day{min-height:49px;padding:4px!important;font-size:9px!important}#route-director-360 .rd-day small{font-size:9px}#route-director-360 .rd-legend{font-size:9px}}'
 ].join('\n');document.head.appendChild(node);
}
function metric(icon,title,value,sub,risk,details){
 return '<button type="button" class="rd-metric'+(risk?' rd-risk':'')+'" data-action="'+details+'" title="Показать подробности"><strong>'+icon+' '+h(title)+'</strong><b>'+h(value)+'</b><span>'+h(sub)+'</span></button>';
}
function calendar(s){
 const m=S.month,[yy,mm]=m.split('-').map(Number);
 const daysInMonth=new Date(Date.UTC(yy,mm,0)).getUTCDate();
 const startIdx=(new Date(Date.UTC(yy,mm-1,1)).getUTCDay()+6)%7;
 let html=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(wd=>'<div class="rd-weekday">'+wd+'</div>').join('');
 for(let z=0;z<Math.ceil((startIdx+daysInMonth)/7)*7;z++){
  const day=z-startIdx+1;if(day<1||day>daysInMonth){html+='<div class="rd-day rd-outside" aria-hidden="true"></div>';continue}
  const d=m+'-'+pad(day),data=s.days[d]||{},rows=data.rows||[];
  const count=num(data.count),office=!!data.office,active=include(d,s.r),isWeekend=[0,6].includes(date(d).getUTCDay());
  const load=num(data.maxLoad);
  const level=load>15?'rd-red':load>=10?'rd-yellow':count?'rd-green':'';
  const txt=count?count+' точек'+(S.manager==='all'?' · '+(data.managerCounts||[]).filter(x=>x.count>0).length+' МПП':''):office?'🏢 Офис':isWeekend?'Выходной':'Нет плана';
  const pending=data.pending?'<small style="color:#b42318">● Требует проверки</small>':'';
  html+='<button type="button" class="rd-day '+level+(!active?' rd-outside':'')+(S.day===d?' rd-focus':'')+'" data-action="day" data-date="'+d+'" aria-label="'+h(humanDay(d)+': '+txt)+'"><b>'+day+'</b><small>'+h(txt)+'</small>'+pending+'</button>';
 }
 return html;
}
function brief(s){
 const out=[];
 if(!s.active.length)out.push(['ℹ️','Нет доступных активных клиентов для выбранного менеджера. Проверьте загрузку и фильтры.']);
 else if(s.missing.length)out.push(['🔴',s.missing.length+' клиентов не покрыты визитом или месячной задачей на прозвон в выбранном периоде.']);
 else out.push(['✅','Все закреплённые клиенты имеют плановый визит или прозвон в периоде.']);
 if(s.over)out.push(['⚠️','Превышен лимит 15 точек в '+s.over+' днях менеджеров. Откройте даты и проверьте состав.']);
 else if(s.atLimit)out.push(['🟡',s.atLimit+' дн. запланированы ровно на лимит 15 точек.']);
 if(s.empty)out.push(['📅',s.empty+' будних дней без визитов и без офисного дня.']);
 if(s.pending)out.push(['🕒',s.pending+' строк маршрута имеют статус, отличный от утверждённого.']);
 if(!s.pending&&s.scoped.length)out.push(['✅','Все записи выбранного периода уже утверждены. Повторного согласования не требуется.']);
 if(s.unlinked)out.push(['🔎',s.unlinked+' строк не удалось однозначно сопоставить с клиентом; покрытие может быть занижено.']);
 if(S.ai&&S.ai.month===S.month&&Array.isArray(S.ai.highlights)&&S.ai.highlights.length){
  const x=S.ai.highlights[0];
  out.push(['🤖','Аудит: '+S.ai.total+' сигналов; первый приоритет — '+(x.clientName||'маршрут')+': '+x.reason]);
 }
 return out.slice(0,5).map(([ic,t])=>'<div class="rd-brief-line"><span class="rd-brief-icon">'+ic+'</span><span>'+h(t)+'</span></div>').join('');
}
function visibleDay(s){
 const d=S.day,data=s.days[d];
 if(!d||!data)return '';
 return '<div class="rd-detail"><div class="rd-panel-head"><b>📍 '+h(humanDay(d))+' · '+data.count+' точек</b><button data-action="edit-day" data-date="'+h(d)+'">Изменить день</button></div>'+
  (data.rows.length?'<div class="rd-list">'+data.rows.slice(0,20).map(p=>'<div class="rd-list-row"><span>'+h(p.is_office_day?'Офис':(p.client_name||p.city||'Точка'))+'</span><span>'+h(p.city||'')+'</span></div>').join('')+'</div>':'<div class="rd-sub">На этот день пока нет точек. Можно добавить визиты в редакторе.</div>')+'</div>';
}
function render(){
 if(!boss())return;const p=page();if(!p)return;
 if(!S.month)S.month=selectedMonth();
 if(!S.start||!S.start.startsWith(S.month))S.start=firstMonday(S.month);
 const el=root();if(!el)return;
 const s=snapshot(),now=monthName(S.month),r=s.r,selected=S.manager;
 const managers=scopeManagers(),options='<option value="all">Все менеджеры</option>'+managers.map(m=>'<option value="'+h(m)+'"'+(m===selected?' selected':'')+'>'+h(m)+'</option>').join('');
 const tabs=[['1','Неделя'],['2','2 недели'],['3','3 недели'],['month','Месяц']].map(([key,label])=>'<button data-action="period" data-period="'+key+'" class="'+(S.period===key?'rd-active':'')+'">'+label+'</button>').join('');
 const status=!s.scoped.length?'Нет проекта':s.pending?'Требует проверки':'Утверждено';
 const activeCount=s.active.length;
 el.innerHTML=
 '<div class="rd-top"><div><div class="rd-tabs" role="group" aria-label="Период">'+tabs+'</div><div class="rd-sub">Директорский обзор · '+h(r.from)+' — '+h(r.to)+'</div>'+(S.editor?'<button style="margin-top:7px" data-action="close-editor">← Вернуться к обзору</button>':'')+'</div>+'
 '<div class="rd-filters"><label>Менеджер <select class="rd-select" data-change="manager">'+options+'</select></label><label>Месяц <input class="rd-select" type="month" data-change="month" value="'+h(S.month)+'"></label></div></div>'+
 '<div class="rd-grid">'+
 metric('👥','Покрытие клиентов',s.percent===null?'—':s.percent+'%',(activeCount-s.missing.length)+' из '+activeCount+' · визит / прозвон',false,'missing')+
 metric('📅','Дней заполнено',s.filled+'/'+s.working,S.manager==='all'?'Дни × менеджеры (все МПП)':'Рабочие дни выбранного периода',false,'empty')+
 metric('🚫','Без покрытия',String(s.missing.length),'Не назначен визит или прозвон',s.missing.length>0,'missing')+
 metric('⚠️','Перегрузов',String(s.over),'Дни МПП свыше 15 уникальных точек',s.over>0,'over')+
 metric('🗓','Пустые дни',String(s.empty),S.manager==='all'?'Будни МПП без плана':'Будни без плана и офисного дня',false,'empty')+
 metric('🏁','Статус маршрута',status,s.pending?'Неутверждённых строк: '+s.pending:'Плановых записей: '+s.scoped.length,s.pending>0,'approval')+
 '</div>'+
 '<div class="rd-main"><section class="rd-panel"><div class="rd-panel-head"><h3>🗓 '+h(now)+'</h3>'+
 '<div class="rd-filters"><button data-action="prev" title="Предыдущая неделя">‹</button><button data-action="next" title="Следующая неделя">›</button></div></div>'+
 '<div class="rd-legend"><span>🟢 1–9 точек</span><span>🟡 10–15 точек (высокая загрузка)</span><span>🔴 более 15 (превышение лимита)</span><span>Серый — без плана</span></div>'+
 '<div class="rd-cal" style="margin-top:8px">'+calendar(s)+'</div>'+visibleDay(s)+'</section>'+
 '<aside><section class="rd-panel"><div class="rd-panel-head"><h3>🤖 Краткий брифинг</h3><span class="rd-sub">По текущим данным</span></div>'+brief(s)+'</section>'+
 '<div class="rd-detail"><details><summary>🎯 Риски клиентов · '+s.missing.length+'</summary><div class="rd-sub">Полный список ниже. Здесь учитываются и визиты, и месячные прозвоны.</div></details></div>'+
 '<div class="rd-detail"><details><summary>🚚 Логистика и загрузка</summary><div class="rd-sub">Полный день — 15 ТТ. Расстояния по прямой не выдаются за дорожный пробег. Для анализа переездов запустите действующий месячный аудит.</div></details></div>'+
 '<div class="rd-detail"><details><summary>💡 ИИ-рекомендации '+(S.ai&&S.ai.month===S.month?'· '+S.ai.total+' сигналов':'')+'</summary><div class="rd-sub">'+(S.ai&&S.ai.month===S.month?'Проверьте результаты ниже через кнопку «Подробный аудит».':'Нажмите «ИИ-анализ», чтобы получить расчёт действующего аудита.')+'</div></details></div></aside></div>'+
 '<div class="rd-actions"><button data-action="edit">＋ Добавить / изменить день</button><button class="rd-primary" data-action="approve">✓ Согласовать день</button><button data-action="audit">✧ ИИ-анализ маршрута</button></div>'+
 '<div class="rd-note">В текущем регламенте маршрут утверждается и отправляется менеджеру при явном сохранении каждого дня руководителем. Кнопка согласования открывает проверку дня в действующем редакторе — без массового автоматического утверждения.</div>'+
 '<div class="rd-main"><details class="rd-panel" id="rd360-missing"><summary>👥 Клиенты без покрытия · '+s.missing.length+'</summary><div class="rd-list">'+
 s.missing.slice(0,150).map(c=>'<div class="rd-list-row"><span>'+h(c.name||'Без названия')+'</span><span>'+h(c.manager_name||'')+' · '+h(c.city||'')+'</span></div>').join('')+
 (s.missing.length>150?'<p class="rd-sub">Показаны первые 150 — детальный реестр доступен в существующем блоке покрытия.</p>':'')+
 (!s.missing.length?'<p class="rd-sub">Непокрытых клиентов нет.</p>':'')+
 '</div></details><details class="rd-panel" id="rd360-over"><summary>⚠️ Перегруженные и заполненные до лимита дни</summary><div class="rd-list">'+
 Object.entries(s.days).flatMap(([d,x])=>(x.managerCounts||[]).filter(v=>v.count>=15).map(v=>'<div class="rd-list-row"><span>'+h(humanDay(d))+' · '+h(v.manager)+'</span><span>'+v.count+' точек · '+(v.count>15?'превышение':'лимит')+'</span></div>')).join('')+
 (!Object.values(s.days).some(x=>(x.managerCounts||[]).some(y=>y.count>=15))?'<p class="rd-sub">У менеджеров нет дней с 15 и более точками.</p>':'')+
 '</div></details></div>'+
 '<div class="rd-actions"><button data-action="ai-details">Раскрыть полный ИИ-аудит и решения ДФ</button><button data-action="details">Показать действующий отчёт покрытия</button><button data-action="absences">Отсутствия / замещения</button></div>';
 p.classList.add('rd360');p.classList.toggle('rd360-editor',S.editor);p.classList.toggle('rd360-audit',S.audit);p.classList.toggle('rd360-details',S.details);
}
function openEditor(d){
 S.editor=true;render();
 const sel=document.getElementById('mrl-manager');if(sel&&S.manager!=='all'&&[...sel.options].some(o=>o.value===S.manager))sel.value=S.manager;
 const day=d||S.day||((S.month===today().slice(0,7)&&today()<=endMonth(S.month))?today():firstMonday(S.month));
 const field=document.getElementById('mrl-date');if(field)field.value=day;
 if(typeof w.openBossRouteDayEditor==='function')w.openBossRouteDayEditor(day,sel?.value||'');
 else document.getElementById('mrl-load')?.click();
 document.getElementById('manual-route-lite')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function attach(){
 const el=root();if(!el||el.dataset.bound)return;el.dataset.bound='1';
 el.addEventListener('change',e=>{
  const type=e.target.dataset.change;
  if(type==='manager'){S.manager=e.target.value;if(typeof rbMgrFilter!=='undefined')rbMgrFilter=S.manager;S.ai=null;render();return}
  if(type==='month'){const m=e.target.value;if(!validMonth(m))return;S.month=m;S.day='';S.start=firstMonday(m);S.ai=null;
   if(typeof w.v221SelectRouteMonth==='function')w.v221SelectRouteMonth('boss',m);
   else{try{localStorage.setItem('crm_route_month_boss',m)}catch(_){}}
   const coverage=document.getElementById('rb-coverage-month');if(coverage)coverage.value=m;
   try{w.renderRouteCoverageV23675?.()}catch(_){}
   render();
  }
 });
 el.addEventListener('click',e=>{
  const btn=e.target.closest('[data-action]');if(!btn)return;
  const action=btn.dataset.action;
  if(action==='period'){S.period=btn.dataset.period;S.day='';render()}
  else if(action==='prev'||action==='next'){const next=add(S.start,action==='prev'?-7:7);if(next.startsWith(S.month)){S.start=next;S.day='';render()}}
  else if(action==='day'){S.day=btn.dataset.date;render()}
  else if(action==='edit'||action==='edit-day'||action==='approve'){openEditor(btn.dataset.date||S.day)}
  else if(action==='missing'){render();el.querySelector('#rd360-missing').open=true;el.querySelector('#rd360-missing').scrollIntoView({behavior:'smooth',block:'nearest'})}
  else if(action==='over'){render();el.querySelector('#rd360-over').open=true;el.querySelector('#rd360-over').scrollIntoView({behavior:'smooth',block:'nearest'})}
  else if(action==='empty'){S.day=Object.keys(snapshot().days).find(d=>snapshot().days[d].isWorkday&&!snapshot().days[d].count&&!snapshot().days[d].office)||'';render()}
  else if(action==='approval'){openEditor(S.day)}
  else if(action==='audit'){
   if(typeof rbMgrFilter!=='undefined')rbMgrFilter=S.manager;
   const audit=w.RESANTA_ROUTE_MONTH_AI_AUDIT_V1;
   if(audit&&typeof audit.run==='function')audit.run();
   else{S.audit=true;render();const old=document.getElementById('route-ai-run-v1');if(old)old.click();else alert('Модуль аудита не загружен. Откройте раздел ещё раз и повторите.')}
  }
  else if(action==='ai-details'){S.audit=!S.audit;render();if(S.audit)document.getElementById('route-month-ai-audit-v1')?.scrollIntoView({behavior:'smooth',block:'start'})}
  else if(action==='details'){S.details=!S.details;render();if(S.details)document.getElementById('rb-coverage-card')?.scrollIntoView({behavior:'smooth',block:'start'})}
  else if(action==='close-editor'){S.editor=false;render();root()?.scrollIntoView({behavior:'smooth',block:'start'})}
  else if(action==='absences')w.openManagerAbsences?.();
 });
}
function install(){
 if(!boss()||!page())return;
 styles();
 if(!S.month)S.month=selectedMonth();
 if(!root()){const el=document.createElement('section');el.id=ID;const title=page().querySelector('.page-title');(title||page()).insertAdjacentElement(title?'afterend':'afterbegin',el)}
 attach();render();
}
let pending=false;function schedule(){if(pending)return;pending=true;setTimeout(()=>{pending=false;if(page()?.classList.contains('active'))install()},30)}
const oldRender=w.renderRoutesBoss;
if(typeof oldRender==='function')w.renderRoutesBoss=function(){const result=oldRender.apply(this,arguments);schedule();return result};
const oldGo=w.goPage;
if(typeof oldGo==='function')w.goPage=function(){const result=oldGo.apply(this,arguments);if(arguments[0]==='routes-boss')schedule();return result};
const oldLoad=w.loadData;
if(typeof oldLoad==='function')w.loadData=async function(){const result=await oldLoad.apply(this,arguments);schedule();return result};
w.addEventListener('resanta-route-audit-brief',e=>{if(!boss()||!e.detail)return;S.ai=e.detail;render()});
w.addEventListener('pageshow',schedule);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
w.RESANTA_ROUTE_DIRECTOR_360_V1=Object.freeze({version:'1.0.0',readOnly:true,install,refresh:render,snapshot});
})(window);
