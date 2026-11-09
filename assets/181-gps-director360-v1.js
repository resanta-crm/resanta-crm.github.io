/* RESANTA GPS Director 360° · Uni AI / Uni X v1. Native routes and GPS remain unchanged. */
(function(w,d){
'use strict';
if(w.RESANTA_GPS_DIRECTOR360_V1)return;
const VERSION='2026.11.09-gps360-decisions-v3',ID='gps360-director-v1',CSS='gps360-director-style-v1';
const MANAGERS=['Ачинович','Руднев','Шкуран'];
const COLORS={'Ачинович':'#1768dd','Руднев':'#945af5','Шкуран':'#13936c'};
let filters=null,data=null,busy=false,metric='reports',detailMode='closed',detailManager='all',visitScope='new',stopScope='open',caseStates={},editingStop='',notice='',lastKey='';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>(Number(v)||0).toLocaleString('ru-RU',{maximumFractionDigits:1});
const n=v=>Number(v)||0;
const pct=(v,t)=>t?Math.round(n(v)/n(t)*100)+'%':'—';
const day=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v))?v.slice(8,10)+'.'+v.slice(5,7):String(v||'—');
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const minus=(s,k)=>{const x=new Date(s+'T12:00:00Z');x.setUTCDate(x.getUTCDate()-k);return x.toISOString().slice(0,10)};
const profile=()=>{try{return typeof currentProfile!=='undefined'?currentProfile:w.currentProfile}catch(_){return w.currentProfile}};
const viewer=()=>{try{return typeof currentUser!=='undefined'?currentUser:w.currentUser}catch(_){return w.currentUser}};
const allowed=()=>profile()?.role==='boss'&&['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru'].includes(String(profile()?.email||viewer()?.email||'').toLowerCase());
const dbx=()=>{try{return typeof db!=='undefined'?db:w.db}catch(_){return w.db}};
const panel=()=>d.getElementById('gps-director-view-v236427');
const root=()=>d.getElementById(ID);
const isActive=()=>allowed()&&panel()?.style?.display!=='none'&&d.getElementById('page-gps-control')?.classList?.contains('active');
const base=()=>({from:d.getElementById('gps-dir-from-v236427')?.value||minus(today(),6),to:d.getElementById('gps-dir-to-v236427')?.value||today(),manager:'all'});
function css(){
 if(d.getElementById(CSS))return;
 const s=d.createElement('style');s.id=CSS;
 s.textContent=[
 '#gps360-director-v1{color:#17243a;font-family:inherit}',
 '#gps360-director-v1 *{box-sizing:border-box}',
 '#gps360-director-v1 h2{font-size:22px;font-weight:850;color:#111827;margin:0 0 3px}',
 '#gps360-director-v1 h3{font-size:16px;color:#1a2c45;margin:0 0 4px}',
 '#gps360-director-v1 .g-muted{font-size:11px;color:#6c7d92;line-height:1.55}',
 '#gps360-director-v1 .g-header,#gps360-director-v1 .g-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}',
 '#gps360-director-v1 .g-header{margin-bottom:12px}',
 '#gps360-director-v1 .g-controls,#gps360-director-v1 .g-nav,#gps360-director-v1 .g-tabs{display:flex;gap:7px;align-items:end;flex-wrap:wrap}',
 '#gps360-director-v1 .g-nav{margin:11px 0 13px;align-items:center}',
 '#gps360-director-v1 .g-controls label{font-size:10px;font-weight:750;color:#6d7e93;display:flex;flex-direction:column;gap:4px}',
 '#gps360-director-v1 select,#gps360-director-v1 input,#gps360-director-v1 textarea{border:1px solid #d7e0ec;border-radius:9px;background:#fff;color:#263a57;padding:9px;font:inherit;font-size:11px;max-width:100%}',
 '#gps360-director-v1 input[type=date]{max-width:147px}',
 '#gps360-director-v1 textarea{width:100%;min-height:65px}',
 '#gps360-director-v1 button{border:1px solid #cedce9;border-radius:8px;background:white;color:#15588c;padding:9px 12px;cursor:pointer;font-size:11px;font-weight:800}',
 '#gps360-director-v1 button:hover{background:#edf5ff}',
 '#gps360-director-v1 button:disabled{opacity:.5;cursor:not-allowed}',
 '#gps360-director-v1 button.g-primary{background:#1864be;border-color:#1864be;color:#fff}',
 '#gps360-director-v1 button[aria-pressed=true]{background:#e7f0ff;border-color:#70a3e9}',
 '#gps360-director-v1 .g-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:11px}',
 '#gps360-director-v1 .g-card,#gps360-director-v1 .g-box{background:white;border:1px solid #dfe6ef;border-radius:13px;padding:14px;min-width:0;margin-bottom:11px}',
 '#gps360-director-v1 .g-card small{font-size:10px;color:#64758f;display:block;line-height:1.45}',
 '#gps360-director-v1 .g-card strong{font-size:26px;letter-spacing:-.5px;color:#182438;display:block;margin:9px 0 5px}',
 '#gps360-director-v1 .g-card.attention{background:#fff9ef;border-color:#f2d5a4}',
 '#gps360-director-v1 .g-card.attention strong{font-size:19px;letter-spacing:0;color:#aa391f}',
 '#gps360-director-v1 .g-bar{height:6px;border-radius:6px;background:#e9eff7;overflow:hidden;margin:8px 0}',
 '#gps360-director-v1 .g-bar i{display:block;height:100%;background:#1768dd}',
 '#gps360-director-v1 .g-chart svg{width:100%;display:block;max-height:340px}',
 '#gps360-director-v1 .g-legend{display:flex;gap:17px;flex-wrap:wrap;font-size:11px;color:#64748b}',
 '#gps360-director-v1 .g-legend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px}',
 '#gps360-director-v1 .g-brief{background:#edf4ff;border:1px solid #cbddf6;border-radius:12px;padding:14px;margin-bottom:11px}',
 '#gps360-director-v1 .g-brief p{font-size:12px;line-height:1.55;margin:7px 0}',
 '#gps360-director-v1 .g-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}',
 '#gps360-director-v1 .g-rowbar{display:grid;grid-template-columns:100px 1fr 36px;gap:8px;align-items:center;padding:9px 0;font-size:12px}',
 '#gps360-director-v1 .g-rowbar .g-bar{height:13px;margin:0}',
 '#gps360-director-v1 .g-rowbar i{background:#fa8b43}',
 '#gps360-director-v1 .g-problem{display:flex;justify-content:space-between;gap:10px;border-bottom:1px solid #edf1f7;font-size:12px;padding:7px 0}',
 '#gps360-director-v1 table{width:100%;border-collapse:collapse;font-size:12px}',
 '#gps360-director-v1 th,#gps360-director-v1 td{text-align:left;padding:10px 8px;border-bottom:1px solid #e7edf5}',
 '#gps360-director-v1 th{font-size:11px;color:#73839a}',
 '#gps360-director-v1 .g-scroll{overflow-x:auto}#gps360-director-v1 .g-scroll table{min-width:720px}',
 '#gps360-director-v1 .g-warn{padding:10px 12px;background:#fffaee;border:1px solid #edce99;border-radius:9px;color:#825922;font-size:11px;line-height:1.5;margin-bottom:12px}',
 '#gps360-director-v1 .g-detail{background:#f9fcff;border:1px solid #c9dced;border-radius:9px;padding:12px;margin-top:10px}',
 '#gps360-director-v1 .g-detail[hidden]{display:none}',
 '#gps360-director-v1 .g-line{border-bottom:1px solid #e8eff7;padding:10px 0;font-size:11px}',
 '#gps360-director-v1 .g-line:last-child{border-bottom:0}',
 '#gps360-director-v1 .g-choice{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:8px}',
 '#gps360-director-v1 .g-choice label{font-size:11px;font-weight:700}',
 '#gps360-director-v1 .g-choice label>*{display:block;width:100%;margin-top:5px}',
 '#gps360-director-v1 .g-pill{border-radius:16px;background:#edf4fb;color:#25537f;padding:4px 8px;font-size:10px}',
 '@media(max-width:1200px){#gps360-director-v1 .g-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}',
 '@media(max-width:810px){#gps360-director-v1 .g-two{grid-template-columns:1fr}#gps360-director-v1 .g-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}'
 ].join('');
 d.head.appendChild(s);
}
function mount(){
 if(!allowed())return null;const p=panel();if(!p)return null;
 let el=root();if(el)return el;
 css();filters=filters||base();
 const nav=p.querySelector('.gps-director-jump');if(nav)nav.style.display='none';
 const legacy=d.createElement('div');legacy.id='gps360-legacy-v1';legacy.style.display='none';
 if(nav){while(nav.nextSibling)legacy.appendChild(nav.nextSibling)}
 else{while(p.firstChild)legacy.appendChild(p.firstChild)}
 p.appendChild(legacy);el=d.createElement('section');el.id=ID;p.insertBefore(el,legacy);return el;
}
function sync(){
 for(const [id,v] of [['gps-dir-from-v236427',filters.from],['gps-dir-to-v236427',filters.to],
  ['gps-dir-manager-v236427',filters.manager]]){
  const el=d.getElementById(id);if(el)el.value=v;
 }
}
function card(label,value,desc,ratio,color){
 return '<div class="g-card"><small>'+esc(label)+'</small><strong style="color:'+esc(color||'#182438')+'">'+num(value)+'</strong>'+
 (ratio==null?'':'<div class="g-bar"><i style="width:'+Math.min(100,Math.max(0,ratio))+'%"></i></div>')+
 '<small>'+esc(desc)+'</small></div>';
}
function graph(payload){
 const rows=Array.isArray(payload.weeks)?payload.weeks:[],to=payload.period.to;
 const weeks=Array.from({length:6},(_,i)=>({from:minus(to,41-7*i),to:minus(to,35-7*i)}));
 const values={};let top=5;
 for(const m of MANAGERS){
  values[m]=weeks.map(x=>{const match=rows.find(r=>r.start===x.from&&r.manager===m);return match?n(match[metric]):null});
  for(const v of values[m])if(v!==null)top=Math.max(top,v);
 }
 top=Math.ceil(top/4)*4;
 const xx=i=>55+i*172,yy=v=>229-200*v/top;
 let svg='<svg viewBox="0 0 960 278" role="img" aria-label="Динамика GPS и визитов за 6 недель"><title>Сравнение GPS по менеджерам</title>';
 for(let i=0;i<=4;i++){
  const v=top*i/4,y=yy(v);
  svg+='<line x1="55" x2="915" y1="'+y+'" y2="'+y+'" stroke="#e7eef7"/>'+
    '<text x="47" y="'+(y+4)+'" text-anchor="end" font-size="11" fill="#7387a4">'+num(v)+'</text>';
 }
 for(const name of MANAGERS){
  const data=values[name],color=COLORS[name];let path='';
  for(let i=0;i<data.length;i++){
   const v=data[i];if(v===null){if(path){svg+='<path d="'+path+'" stroke="'+color+'" stroke-width="3" fill="none"/>';path=''}continue}
   path+=(path?' L ':'M ')+xx(i)+' '+yy(v);
   svg+='<circle cx="'+xx(i)+'" cy="'+yy(v)+'" r="5" fill="'+color+'" stroke="white" stroke-width="2"><title>'+
      esc(name)+' · '+day(weeks[i].from)+'–'+day(weeks[i].to)+' · '+num(v)+'</title></circle>';
  }
  if(path)svg+='<path d="'+path+'" stroke="'+color+'" stroke-width="3" fill="none" stroke-linecap="round"/>';
 }
 svg+=weeks.map((x,i)=>'<text x="'+xx(i)+'" y="259" text-anchor="middle" font-size="10" fill="#7387a4">'+
 day(x.from)+'–'+day(x.to)+'</text>').join('')+'</svg>';
 return '<div class="g-chart">'+svg+'</div>';
}
const directorCase=x=>caseStates[String(x.route_plan_id||'')]||null;
const caseState=x=>directorCase(x)?.case_state||'new';
const closedCount=()=>data?.cases?.filter(x=>!x.day_active&&caseState(x)==='closed').length||0;
const openReview=()=>Math.max(0,Number(data?.kpi?.review||0)-closedCount());
function visitDetails(payload){
 const all=(payload.cases||[]).filter(x=>detailManager==='all'||x.manager===detailManager);
 const rows=all.filter(x=>visitScope==='all'||caseState(x)===visitScope).slice(0,80);
 const labels={coords_review:'Координаты требуют проверки',report_without_gps:'Отчёт есть, GPS не подтвердил',gps_without_report:'GPS есть, отчёта нет',no_evidence:'Не хватает независимых GPS-данных'};
 const tabs=[['new','Новые'],['in_progress','На проверке'],['closed','Закрытые'],['all','История']];
 return '<p class="g-muted">GPS, отчёт и решение руководителя — три независимых факта. Закрытый разбор не становится GPS-подтверждением.</p>'+
 '<div class="g-tabs">'+tabs.map(([id,title])=>'<button type="button" data-g360-visit-scope="'+id+'" '+(visitScope===id?'class="g-primary"':'')+'>'+title+' · '+num(id==='all'?all.length:all.filter(x=>caseState(x)===id).length)+'</button>').join('')+'</div>'+
 '<div class="g-scroll"><table><thead><tr><th>Дата / менеджер</th><th>Торговая точка</th><th>Причина GPS</th><th>Решение</th></tr></thead><tbody>'+
 (rows.length?rows.map(x=>{
 const d=directorCase(x),closed=caseState(x)==='closed';
 return '<tr><td>'+day(x.date)+'<div class="g-muted">'+esc(x.manager)+'</div></td><td><b>'+esc(x.client||'ТТ')+
 '</b><div class="g-muted">'+esc([x.city,x.address].filter(Boolean).join(', '))+'</div></td>'+
 '<td>'+esc(labels[x.issue]||'Требует проверки')+(x.day_active?' · день продолжается':'')+'</td>'+
 '<td><b style="color:'+(closed?'#16804a':'#905f14')+'">'+(closed?'✓ Разбор закрыт':caseState(x)==='in_progress'?'На проверке':'Новый случай')+'</b>'+
 (d?.comment?'<p class="g-muted">'+esc(d.comment)+'</p>':'')+
 '<div class="g-nav"><button type="button" data-gps-brief-case="'+esc(x.route_plan_id)+'">'+(closed?'История и доказательства':'Разобрать →')+'</button>'+
 (x.workday_id?'<button type="button" data-g360-case-map="'+esc(x.workday_id)+'" data-g360-plan="'+esc(x.route_plan_id)+'">Карта</button>':'')+
 '</div></td></tr>';
 }).join(''):'<tr><td colspan="4">В этом статусе случаев нет.</td></tr>')+'</tbody></table></div>';
}
const stopClosed=x=>['technical_verified','work_related','home_related','no_issue','forgot_end_day'].includes(x.review_action);
function stopDetails(payload){
 const all=(payload.stops||[]).filter(x=>detailManager==='all'||x.manager===detailManager);
 const matches=(x,id)=>id==='all'||(id==='closed'?stopClosed(x):id==='new'?!x.review_action:!stopClosed(x));
 const list=all.filter(x=>matches(x,stopScope)).slice(0,60);
 const labels={investigate:'На разборе',technical_verified:'Техническая подтверждена',work_related:'Рабочая',home_related:'Дом / старт',no_issue:'Без замечаний',forgot_end_day:'Забыл завершить GPS-день · закрыто'};
 const tabs=[['new','Новые'],['open','На проверке'],['closed','Закрытые'],['all','История']];
 return '<p class="g-muted">Закрытые управленческие случаи доступны в истории; исходный GPS-день и трек сохраняются.</p>'+
 '<div class="g-tabs">'+tabs.map(([id,title])=>'<button type="button" data-g360-stop-scope="'+id+'" '+(stopScope===id?'class="g-primary"':'')+'>'+title+' · '+num(all.filter(x=>matches(x,id)).length)+'</button>').join('')+'</div>'+
 (list.length?list.map(x=>{
  const id=x.workday_id+'|'+x.seq,closed=stopClosed(x);
  const suggest=String(x.review_comment||'').toLowerCase().includes('выключить')&&Number(x.minutes)>=60;
  return '<div class="g-line"><div class="g-head"><span><b>'+esc(x.manager)+'</b> · '+day(x.date)+
   ' · '+num(x.minutes)+' мин · остановка №'+num(x.seq)+'</span>'+
   '<span class="g-pill">'+esc(labels[x.review_action]||'Неопознанная')+'</span></div>'+
   (x.review_comment?'<p class="g-muted">Решение: '+esc(x.review_comment)+'</p>':'')+
   '<div class="g-nav"><button type="button" data-g360-map="'+esc(x.workday_id)+'" data-g360-map-seq="'+esc(x.seq)+'">Показать на карте</button>'+
   (!closed?'<button type="button" data-g360-stop="'+esc(id)+'">Принять решение</button>':'')+'</div>'+
   (editingStop===id?'<div class="g-choice"><label>Решение<select id="g360-review-action">'+
   [['investigate','Проверить причину'],['forgot_end_day','Забыл завершить GPS-день (закрыть)'],['technical_verified','Подтверждённая техническая'],
   ['work_related','Рабочая остановка'],['home_related','Дом / старт'],['no_issue','Без замечаний']].map(([action,title])=>
    '<option value="'+action+'" '+(suggest&&action==='forgot_end_day'?'selected':'')+'>'+title+'</option>').join('')+'</select></label>'+
   '<label>Срок проверки<input type="date" id="g360-review-due" min="'+today()+'"></label>'+
   '<label style="grid-column:1/-1">Комментарий (не менее 8 символов)<textarea id="g360-review-comment">'+esc(x.review_comment||'')+'</textarea></label>'+
   '<button type="button" class="g-primary" data-g360-save="'+esc(id)+'">Сохранить решение</button></div>':'')+'</div>';
 }).join(''):'<p class="g-muted">В выбранном статусе стоянок нет.</p>');
}
function render(){
 const el=mount();if(!el)return false;const f=filters,k=data?.kpi||{},p=n(k.planned),r=n(k.reports),g=n(k.gps_confirmed);
 const managers=data?.managers||[],stale=n(k.stale_days),u=data?.urgent;
 const options='<option value="all">Все менеджеры</option>'+MANAGERS.map(x=>
  '<option value="'+esc(x)+'" '+(f.manager===x?'selected':'')+'>'+esc(x)+'</option>').join('');
 let html='<div class="g-header"><div><h2>GPS · Директорский обзор</h2>'+
 '<div class="g-muted">Отдельно отчёты, доказательства GPS и решения руководителя</div></div>'+
 '<div class="g-controls"><label>Период с<input data-g360-filter="from" type="date" value="'+esc(f.from)+'" max="'+today()+'"></label>'+
 '<label>по<input data-g360-filter="to" type="date" value="'+esc(f.to)+'" max="'+today()+'"></label>'+
 '<label>Менеджер<select data-g360-filter="manager">'+options+'</select></label>'+
 '<button type="button" class="g-primary" data-g360-load '+(busy?'disabled':'')+'>'+(busy?'Считаю…':'↻ Показать')+'</button>'+
 '<button type="button" data-g360-export>Excel</button></div></div>'+
 '<div class="g-nav"><button type="button" data-g360-top>Сводка</button>'+
 '<button type="button" data-g360-legacy="meeting">✦ ИИ-повестка</button>'+
 '<button type="button" data-g360-legacy="time">⏱ Время</button>'+
 '<button type="button" data-g360-details="visits">Спорные ТТ</button>'+
 '<button type="button" data-g360-details="stops">Стоянки и решения</button></div>';
 if(notice)html+='<div class="'+(notice.startsWith('✓')?'g-brief':'g-warn')+'" role="status">'+esc(notice)+'</div>';
 if(!data){el.innerHTML=html+'<section class="g-box"><h3>Проверяю GPS-сводку…</h3><p class="g-muted">Данные берутся из сохранённых GPS-треков. Исходные данные не меняются.</p></section>';return true}
 html+='<div class="g-grid" id="g360-summary">'+
 card('Плановых ТТ',k.planned,'Завершённые дни; сегодня отдельно')+
 card('Визитов по отчётам',k.reports,pct(r,p)+' плана завершённых дней',p?r/p*100:0)+
 card('GPS подтверждено',k.gps_confirmed,pct(g,k.geo_eligible)+' из '+num(k.geo_eligible)+' ТТ с геозонами',k.geo_eligible?g/n(k.geo_eligible)*100:0,'#148653')+
 card('На разбор руководителю',openReview(),'Только завершённые дни · не нарушения',p?openReview()/p*100:0,'#b95024')+
 card('Нет координат ТТ',k.no_coordinates,'В очередь менеджерам, не руководителю',p?n(k.no_coordinates)/p*100:0)+
 '<div class="g-card attention"><small>⚠ Зона внимания</small><strong>'+esc(u?.manager||'Нет данных')+'</strong>'+
 '<small>На разборе (не обвинение): '+num(u?.review)+'</small>'+
 '<small>ТТ для выверки: '+num(u?.no_coordinates)+'</small></div></div>';
 if(n(k.active_planned)>0){
  html+='<div class="g-brief"><div class="g-head"><b>⏳ Рабочий день продолжается</b>'+
   '<span class="g-pill">'+num(k.active_planned)+' ТТ сегодня</span></div>'+
   '<p>Сегодня пока '+num(k.active_reports)+' отчётов по плановым точкам. '+
   'ТТ без готовых координат: '+num(k.active_no_geo)+'. '+
   'Незавершённый день НЕ считается просрочкой или нарушением менеджера.</p></div>';
 }
 if(stale)html+='<div class="g-warn">⚠ '+num(stale)+' рабочих дней имеют устаревший старый GPS-агрегат. Новый обзор пересчитывает GPS и стоянки непосредственно по исходным точкам; цифры старого экрана могут отличаться. Это не нарушение менеджера.</div>';
 html+='<section class="g-box"><div class="g-head"><div><h3>Динамика по менеджерам · 6 недель</h3>'+
 '<div class="g-muted">Шесть последовательных недель; отсутствие GPS не означает отсутствие визита.</div></div>'+
 '<div class="g-tabs">'+[['reports','Посещения'],['gps_confirmed','GPS'],['issues','Отклонения']].map(a=>
  '<button type="button" data-g360-metric="'+a[0]+'" aria-pressed="'+(metric===a[0])+'">'+a[1]+'</button>').join('')+
 '</div></div>'+graph(data)+'<div class="g-legend">'+MANAGERS.map(x=>'<span><i style="background:'+COLORS[x]+'"></i>'+x+'</span>').join('')+'</div></section>';
 html+='<section class="g-brief"><div class="g-head"><h3>◉ Коротко за период</h3>'+
 '<div class="g-tabs"><button type="button" class="g-primary" data-g360-legacy="meeting">✦ ИИ-повестка</button>'+
 '<button type="button" data-g360-details="visits">Маршруты и точки ↓</button></div></div>'+
 '<p>По завершённым дням: '+num(r)+' отчётов из '+num(p)+' плановых посещений ('+pct(r,p)+'). GPS-подтверждено: '+num(g)+' из '+num(k.geo_eligible)+' ТТ с доверенными координатами ('+pct(g,k.geo_eligible)+'). '+
 'Руководителю на разбор '+num(openReview())+' неоднозначных случаев; менеджерам на геопривязку '+num(k.no_coordinates)+' ТТ. '+
 'Неопознанных стоянок: '+num(k.unidentified_stops)+' (система проверяет связь с ТТ; это не нарушения). Подтверждённых технических: '+num(k.verified_technical)+
 '. Зона внимания — '+esc(u?.manager||'нет данных')+'.</p>'+
 '<div class="g-muted">Отметка менеджера не является GPS-доказательством. Причины стоянок фиксируются только по решению руководителя.</div></section>';
 html+='<div class="g-two"><section class="g-box"><h3>Отклонения по менеджерам</h3>'+
 '<div class="g-muted">Только завершённые дни и случаи без проблем геопривязки. Не рейтинг нарушений.</div>'+
 managers.map(x=>'<div class="g-rowbar"><b>'+esc(x.manager_name)+'</b><div class="g-bar">'+
 '<i style="width:'+Math.min(100,n(x.attention_visits)/Math.max(1,n(x.planned))*100)+'%"></i></div>'+
 '<b>'+pct(x.attention_visits,x.planned)+'</b></div>').join('')+'</section>'+
 '<section class="g-box"><h3>Причины проблем</h3>'+
 '<div class="g-muted">Критичные случаи отдельно; отсутствие координат и неопознанные стоянки не являются нарушениями.</div>'+
 (data.problems||[]).filter(x=>!['unidentified_stops','no_coordinates','stale_days'].includes(x.key)).map(x=>'<div class="g-problem"><span>'+esc(x.label)+'</span><b>'+num(x.count)+'</b></div>').join('')+
 '<div class="g-muted" style="margin-top:10px">На выверку координат менеджерам: '+num(k.no_coordinates)+' ТТ · неопознанные стоянки (не нарушения): '+num(k.unidentified_stops)+' · вероятные ТТ: '+num(k.probable_tt_stops)+'</div>'+
 '<div class="g-muted">Подтверждённых технических остановок: '+num(k.verified_technical)+
 '; закрытых разбором: '+num(k.resolved_stops)+'.</div></section></div>';
 html+='<section class="g-box"><h3>Менеджеры · детализация по нажатию</h3>'+
 '<div class="g-scroll"><table><thead><tr><th>Менеджер</th><th>План / отчёты</th><th>GPS подтверждено</th>'+
 '<th>На проверке</th><th>Нет координат</th><th>Стоянки без причины</th><th>Тех. подтверждены</th><th></th></tr></thead><tbody>'+
 managers.map(x=>'<tr><td><b>'+esc(x.manager_name)+'</b></td><td>'+num(x.planned)+' / '+num(x.reports)+'</td>'+
 '<td>'+num(x.gps_confirmed)+' · '+pct(x.gps_confirmed,x.geo_eligible)+'</td>'+
 '<td>'+num(Math.max(0,n(x.attention_visits)-(data.cases||[]).filter(c=>c.manager===x.manager_name&&!c.day_active&&caseState(c)==='closed').length))+'</td><td>'+num(x.no_coordinates)+'</td>'+
 '<td>'+num(x.unidentified_stops)+'</td><td>'+num(x.verified_technical)+'</td>'+
 '<td><button type="button" data-g360-manager="'+esc(x.manager_name)+'">Подробнее →</button></td></tr>').join('')+
 '<tr style="background:#edf4ff;font-weight:800"><td>ИТОГО</td><td>'+num(p)+' / '+num(r)+'</td>'+
 '<td>'+num(g)+'</td><td>'+num(openReview())+'</td><td>'+num(k.no_coordinates)+'</td>'+
 '<td>'+num(k.unidentified_stops)+'</td><td>'+num(k.verified_technical)+'</td><td>—</td></tr></tbody></table></div></section>';
 html+='<section class="g-box"><div class="g-head"><h3>Торговые точки, стоянки и решения</h3>'+
 '<div class="g-tabs"><button type="button" data-g360-details="visits">Спорные ТТ</button>'+
 '<button type="button" data-g360-details="stops">Неопознанные стоянки</button>'+
 '<button type="button" data-g360-legacy="decisions">Решения и напоминания</button></div></div>'+
 '<div id="g360-detail" class="g-detail" '+(detailMode==='closed'?'hidden':'')+'>'+
 '<div class="g-head"><h4>'+(detailMode==='stops'?'Разбор стоянок':'Разбор торговых точек')+
 (detailManager==='all'?' · все менеджеры':' · '+esc(detailManager))+'</h4>'+
 '<button type="button" data-g360-close>Свернуть</button></div>'+
 (detailMode==='stops'?stopDetails(data):visitDetails(data))+'</div></section>'+
 '<div class="g-muted">Период '+day(data.period?.from)+' — '+day(data.period?.to)+
 ' · Источник — GPS-факты и директорский журнал решений · исходные треки и маршруты не изменяются.</div>';
 el.innerHTML=html;return true;
}
async function load(force=false){
 if(!allowed()||!mount()||!isActive()||busy)return false;
 const f=filters,key=f.from+'|'+f.to+'|'+f.manager;
 if(!force&&data&&lastKey===key){render();return true}
 const from=new Date(f.from+'T12:00:00Z'),to=new Date(f.to+'T12:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(f.from)||!/^\d{4}-\d{2}-\d{2}$/.test(f.to)||
   f.from>f.to||f.to>today()||Math.round((to-from)/86400000)>41){
  notice='Выбери период до 42 дней, не позднее текущего дня.';render();return false;
 }
 const client=dbx();if(!client?.rpc){notice='Не удалось подключиться к CRM';render();return false}
 busy=true;notice='';render();sync();
 try{
  const [r,decision]=await Promise.all([
    client.rpc('gps_director360_evidence_v20261109',{p_from:f.from,p_to:f.to,p_manager:f.manager}),
    client.rpc('gps_director360_decisions_v20261109',{p_from:f.from,p_to:f.to})
  ]);
  if(r.error)throw r.error;
  if(decision.error)throw decision.error;
  caseStates=decision.data?.states||{};
  if(r.data?.version!=='gps-director360-evidence-v2'||r.data?.period?.from!==f.from||
    r.data?.period?.to!==f.to)throw Error('Данные GPS не прошли контроль источника и периода');
  data=r.data;lastKey=key;return true;
 }catch(e){notice='GPS 360° временно недоступен: '+String(e?.message||e)+'. Маршруты доступны в соседней вкладке.';return false}
 finally{busy=false;render()}
}
function open(force=false){if(!allowed()||!mount()||!isActive())return false;return load(force)}
function showDetails(mode,manager){
 detailMode=mode==='stops'?'stops':'visits';detailManager=manager||'all';editingStop='';render();
 root()?.querySelector('#g360-detail')?.scrollIntoView?.({behavior:'smooth',block:'start'});
}
async function legacy(which){
 const old=d.getElementById('gps360-legacy-v1');if(!old)return;
 old.style.display='block';
 for(const node of old.children)if(node.style)node.style.display='none';
 let target=null;
 if(which==='visits')target=d.getElementById('gps-dir-visits-v236427')?.closest('.gps-brief-card');
 if(which==='meeting')target=d.getElementById('gps-meeting-ai-v236441');
 if(which==='decisions')target=d.getElementById('gps-director-reminders-v236443');
 if(which==='time')target=d.getElementById('gps-unused-time-v1');
 if(target){target.style.display='block';target.scrollIntoView?.({behavior:'smooth',block:'center'})}
 if(which==='visits'){sync();await w.RESANTA_GPS_DIRECTOR_REPORT_V236427?.loadDetails?.()}
 if(which==='meeting')d.getElementById('gps-meeting-ai-run-v236441')?.click?.();
}
async function saveStop(id){
 if(busy||!allowed()||!data)return;
 const item=(data.stops||[]).find(x=>x.workday_id+'|'+x.seq===id);if(!item)return;
 const action=d.getElementById('g360-review-action')?.value||'investigate';
 const comment=d.getElementById('g360-review-comment')?.value?.trim()||'';
 const due=d.getElementById('g360-review-due')?.value||null;
 if(comment.length<8){notice='Укажи причину решения не менее чем из восьми символов.';render();return}
 if(!w.confirm?.('Сохранить решение по стоянке '+item.manager+' '+day(item.date)+' · '+num(item.minutes)+' минут?\nИсходный трек не изменяется.'))return;
 const client=dbx();busy=true;notice='';render();
 try{
  const r=await client.rpc(action==='forgot_end_day'
    ?'gps_director360_stop_close_v20261109':'gps_director360_stop_decide_v20261105',
    action==='forgot_end_day'
    ?{p_workday_id:item.workday_id,p_stop_seq:item.seq,p_action:action,p_comment:comment}
    :{p_workday_id:item.workday_id,p_stop_seq:item.seq,p_action:action,p_comment:comment,p_due_date:due});
  if(r.error)throw r.error;if(!r.data?.ok)throw Error('Решение не подтверждено сервером');
  editingStop='';lastKey='';busy=false;await load(true);
  notice='✓ Решение сохранено. Закрытые случаи находятся во вкладке «Закрытые». GPS-треки не изменялись.';
 }catch(e){notice='Решение не сохранено: '+String(e?.message||e)}
 finally{busy=false;render()}
}
d.addEventListener('click',e=>{
 if(!allowed()||!e.target.closest?.('#'+ID))return;
 const t=e.target;
 if(t.closest('[data-g360-load]')){load(true);return}
 if(t.closest('[data-g360-export]')){sync();w.RESANTA_GPS_DIRECTOR_REPORT_V236427?.downloadExcel?.();return}
 const mt=t.closest('[data-g360-metric]');if(mt){metric=mt.dataset.g360Metric;render();return}
 const man=t.closest('[data-g360-manager]');if(man){showDetails('visits',man.dataset.g360Manager);return}
 const dt=t.closest('[data-g360-details]');if(dt){showDetails(dt.dataset.g360Details,'all');return}
 if(t.closest('[data-g360-close]')){detailMode='closed';editingStop='';render();return}
 const stop=t.closest('[data-g360-stop]');if(stop){detailMode='stops';editingStop=editingStop===stop.dataset.g360Stop?'':stop.dataset.g360Stop;render();return}
 const save=t.closest('[data-g360-save]');if(save){saveStop(save.dataset.g360Save);return}
 const vs=t.closest('[data-g360-visit-scope]');if(vs){visitScope=vs.dataset.g360VisitScope;render();return}
 const ss=t.closest('[data-g360-stop-scope]');if(ss){stopScope=ss.dataset.g360StopScope;render();return}
 const caseMap=t.closest('[data-g360-case-map]');if(caseMap){
  if(typeof w.crmGpsOpenFocusV20261109==='function')w.crmGpsOpenFocusV20261109(caseMap.dataset.g360CaseMap,{route_plan_id:caseMap.dataset.g360Plan});
  else w.alert?.('Карта недоступна. Обновите страницу CRM.');return;
 }
 const map=t.closest('[data-g360-map]');if(map){
  if(typeof w.crmGpsOpenFocusV20261109==='function')w.crmGpsOpenFocusV20261109(map.dataset.g360Map,{stop_seq:Number(map.dataset.g360MapSeq)});
  else w.alert?.('Карта недоступна. Обновите страницу CRM.');return;
 }
 const lg=t.closest('[data-g360-legacy]');if(lg){legacy(lg.dataset.g360Legacy);return}
 if(t.closest('[data-g360-top]'))root()?.querySelector('#g360-summary')?.scrollIntoView?.({behavior:'smooth',block:'start'});
},true);
d.addEventListener('change',e=>{const t=e.target.closest?.('[data-g360-filter]');if(t&&filters)filters[t.dataset.g360Filter]=t.value},true);
function install(){if(!allowed())return;mount();if(isActive())open(false)}
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',install,{once:true});else install();
d.addEventListener('click',e=>{if(e.target.closest?.('#gps-tab-director-v236427,#bn-gps-control'))setTimeout(install,170)},true);
d.addEventListener('resanta-gps-decision-updated',()=>{if(allowed()&&isActive()){lastKey='';load(true)}},true);
w.RESANTA_GPS_DIRECTOR360_V1=Object.freeze({
 version:VERSION,open,render,readOnlyGps:true,originalRoutesPreserved:true,
 verifiedTechnicalRequiresDecision:true,stopReviewsAreAdditive:true
});
})(window,document);
