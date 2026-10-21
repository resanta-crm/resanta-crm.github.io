/* RESANTA CRM v23.6.438 · fast GPS director briefing
 * Facts only: plan, actual arrival/departure, time in TT, arrival delta,
 * technical stops and XLSX export.
 * Access: Payushin + Sidarovich only (backend RPC also enforces it).
 */
(function(){
'use strict';
if(window.RESANTA_GPS_DIRECTOR_REPORT_V236427)return;

const VERSION='v23.6.438';
const ALLOWED=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
let mode='route',busy=false,lastData={visits:[],summary:{}},pageOffset=0,onlyIssues=true,technicalLoadedKey='',activeFindingFilter='all';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const profile=()=>{try{return typeof currentProfile!=='undefined'?currentProfile:null}catch(_){return null}};
const user=()=>{try{return typeof currentUser!=='undefined'?currentUser:null}catch(_){return null}};
const email=()=>String(profile()?.email||user()?.email||'').trim().toLowerCase();
const allowed=()=>profile()?.role==='boss'&&ALLOWED.has(email());
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const day=v=>{const s=String(v||'');const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+'.'+m[2]+'.'+m[1]:s||'—';};
const hhmm=v=>{const s=String(v||'');return /^\d{2}:\d{2}/.test(s)?s.slice(0,5):'—';};
const localTime=v=>{if(!v)return'—';try{return new Date(v).toLocaleTimeString('ru-RU',{timeZone:'Europe/Minsk',hour:'2-digit',minute:'2-digit'});}catch(_){return'—';}};
const delta=v=>{
  const n=Number(v);if(!Number.isFinite(n))return'—';
  if(n===0)return'0:00';
  const a=Math.abs(Math.round(n));
  return(n<0?'−':'+')+Math.floor(a/60)+':'+String(a%60).padStart(2,'0');
};
const mins=v=>{const n=Number(v);return Number.isFinite(n)?n.toLocaleString('ru-RU',{maximumFractionDigits:1})+' мин':'—';};

function standardNodes(){
  const page=document.getElementById('page-gps-control');if(!page)return[];
  const nodes=[];
  const date=document.getElementById('gps-control-date');
  if(date?.closest('.card'))nodes.push(date.closest('.card'));
  const k=document.getElementById('gps-control-kpi');if(k)nodes.push(k);
  const list=document.getElementById('gps-control-list');if(list?.closest('.card'))nodes.push(list.closest('.card'));
  const grid=page.querySelector('.gps-control-grid');if(grid)nodes.push(grid);
  const home=document.getElementById('gps-home-zones-v236419');if(home)nodes.push(home);
  return [...new Set(nodes)];
}
function headerRefresh(){
  const page=document.getElementById('page-gps-control');if(!page)return null;
  return [...page.querySelectorAll(':scope > div:first-child button')].find(b=>/обновить/i.test(b.textContent||''))||null;
}
function setMode(next){
  mode=next==='director'?'director':'route';
  const director=document.getElementById('gps-director-view-v236427');
  for(const n of standardNodes())n.style.display=mode==='director'?'none':'';
  if(director)director.style.display=mode==='director'?'block':'none';
  const ref=headerRefresh();if(ref)ref.style.display=mode==='director'?'none':'';
  document.getElementById('gps-tab-route-v236427')?.classList.toggle('btn-primary',mode==='route');
  document.getElementById('gps-tab-route-v236427')?.classList.toggle('btn-secondary',mode!=='route');
  document.getElementById('gps-tab-director-v236427')?.classList.toggle('btn-primary',mode==='director');
  document.getElementById('gps-tab-director-v236427')?.classList.toggle('btn-secondary',mode!=='director');
  if(mode==='director')load(false);
}
function ensureUi(){
  if(!allowed())return null;
  const page=document.getElementById('page-gps-control');if(!page)return null;
  if(document.getElementById('gps-director-view-v236427'))return document.getElementById('gps-director-view-v236427');

  const head=page.firstElementChild;
  const tabs=document.createElement('div');
  tabs.id='gps-tabs-v236427';
  tabs.style.cssText='display:flex;gap:8px;align-items:center;margin:-4px 0 14px;flex-wrap:wrap';
  tabs.innerHTML='<button id="gps-tab-route-v236427" class="btn-primary">Маршруты</button>'+
                 '<button id="gps-tab-director-v236427" class="btn-secondary">Руководитель</button>';
  head?.insertAdjacentElement('afterend',tabs);

  const now=new Date();
  const start=new Date(now.getFullYear(),now.getMonth(),now.getDate()-6);
  const panel=document.createElement('div');
  panel.id='gps-director-view-v236427';
  panel.style.display='none';

  panel.innerHTML=`
    <style id="gps-briefing-styles-v236438">
      #gps-director-view-v236427 .gps-brief-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
      #gps-director-view-v236427 .gps-brief-title{font-size:19px;font-weight:750;line-height:1.3}
      #gps-director-view-v236427 .gps-brief-muted{font-size:12px;color:var(--sub);line-height:1.45}
      #gps-director-view-v236427 .gps-brief-filters{display:flex;gap:9px;align-items:end;flex-wrap:wrap;margin-top:16px}
      #gps-director-view-v236427 .gps-brief-card{border:1px solid var(--border);border-radius:12px;background:var(--card);padding:15px;margin-bottom:12px;overflow-x:auto}
      #gps-director-view-v236427 .gps-brief-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:10px}
      #gps-director-view-v236427 .gps-brief-metric{padding:13px 14px;border:1px solid var(--border);border-radius:11px;background:#fafcff}
      #gps-director-view-v236427 .gps-brief-metric:hover,#gps-director-view-v236427 .gps-brief-action:hover{border-color:var(--a);background:#f0f7ff}#gps-director-view-v236427 .gps-brief-metric:focus-visible,#gps-director-view-v236427 .gps-brief-action:focus-visible{outline:2px solid var(--a)}
      #gps-director-view-v236427 .gps-brief-metric strong{font-size:25px;font-weight:800;display:block;margin-top:4px}
      #gps-director-view-v236427 .gps-brief-actions{display:grid;grid-template-columns:repeat(auto-fit,minmax(265px,1fr));gap:10px;margin-top:12px}
      #gps-director-view-v236427 .gps-brief-action{border:1px solid var(--border);border-radius:10px;padding:12px;background:#fff;line-height:1.5}
      #gps-director-view-v236427 .gps-brief-action strong{font-size:13px}
      #gps-director-view-v236427 .gps-brief-action small{display:block;color:var(--sub);margin-top:3px;font-size:11px}
      #gps-director-view-v236427 .gps-brief-actions .gps-brief-action[data-warning="true"]{border-left:3px solid #d97706}
      #gps-director-view-v236427 #gps-dir-visits-v236427{overflow-x:auto}
      #gps-director-view-v236427 #gps-dir-visits-v236427 .gps-route-table{min-width:970px}
      #gps-director-view-v236427 #gps-integrity-list-v236429{display:none}
      #gps-director-view-v236427 .gps-brief-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      #gps-director-view-v236427 .gps-brief-stamp{font-size:10px;color:var(--sub);margin-top:8px}
      @media(max-width:640px){#gps-director-view-v236427 .gps-brief-filters>div{flex:1;min-width:120px}#gps-director-view-v236427 .gps-brief-filters input,#gps-director-view-v236427 .gps-brief-filters select{max-width:100%;width:100%!important}}
    </style>
    <div class="gps-brief-card">
      <div class="gps-brief-top">
        <div><div class="gps-brief-title">GPS-брифинг руководителя</div>
        <div class="gps-brief-muted">Сначала проблемы и решения · подробный GPS только по выбранному маршруту</div></div>
        <span style="font-size:11px;color:var(--sub)">Быстрые готовые сводки</span>
      </div>
      <div class="gps-brief-filters">
        <div><label class="form-label">Период с</label><input type="date" id="gps-dir-from-v236427" class="form-input" style="width:auto" value="${iso(start)}"></div>
        <div><label class="form-label">по</label><input type="date" id="gps-dir-to-v236427" class="form-input" style="width:auto" value="${iso(now)}"></div>
        <div><label class="form-label">Менеджер</label><select id="gps-dir-manager-v236427" class="form-input" style="min-width:170px"><option value="all">Все менеджеры</option><option value="Ачинович">Ачинович</option><option value="Руднев">Руднев</option><option value="Шкуран">Шкуран</option></select></div>
        <button class="btn-primary" id="gps-dir-load-v236427">Показать</button>
        <button class="btn-secondary" id="gps-dir-xlsx-v236427">↓ Excel</button>
      </div>
      <div id="gps-brief-sync-v236438" class="gps-brief-stamp">Для скорости выводятся сохранённые расчёты, исходные точки GPS не пересчитываются.</div>
    </div>
    <div class="gps-brief-grid" id="gps-dir-kpi-v236427" style="margin-bottom:12px"></div>
    <div class="gps-brief-card"><div class="gps-brief-title" style="font-size:15px">Что требует внимания</div>
      <div id="gps-brief-actions-v236438" class="gps-brief-actions"></div></div>
    <div class="gps-brief-card" id="gps-director-reminders-v236443">
      <div class="gps-brief-top">
        <div><div class="gps-brief-title" style="font-size:15px">🔔 Контроль решений и напоминания</div>
        <div class="gps-brief-muted">Принятые директором решения: просрочено, на сегодня, без срока и в ближайшие 7 дней. Не зависит от выбранного периода GPS.</div></div>
        <button type="button" class="btn-secondary" id="gps-reminders-refresh-v236443">Обновить</button>
      </div>
      <div id="gps-reminders-content-v236443" style="margin-top:10px"><div class="gps-brief-muted">Напоминания появятся после сохранения решения директора по торговой точке.</div></div>
    </div>
    <div class="gps-brief-card" id="gps-meeting-ai-v236441" style="border-color:#c5d9ef">
      <div class="gps-brief-top">
        <div><div class="gps-brief-title" style="font-size:15px">✦ ИИ-повестка маршрутного совещания</div>
          <div class="gps-brief-muted">Вопросы руководителю, проверяемые факты, рекомендуемые решения. Только GPS и визиты ТТ.</div>
        </div>
        <button id="gps-meeting-ai-run-v236441" type="button" class="btn-primary">Подготовить совещание</button>
      </div>
      <div id="gps-meeting-ai-result-v236441" style="margin-top:10px">
        <div class="gps-brief-muted">ИИ не запускается автоматически и не влияет на скорость открытия CRM. Подготовка по нажатию.</div>
      </div>
    </div>
    <div class="gps-brief-card">
      <div class="gps-brief-top"><div class="gps-brief-title" style="font-size:15px">Посещения торговых точек</div>
        <div class="gps-brief-toolbar"><button class="btn-secondary" id="gps-brief-issues-v236438">Только спорные</button><button class="btn-secondary" id="gps-brief-all-v236438">Все ТТ</button></div></div>
      <div class="gps-brief-muted" style="margin:8px 0">Отметка о визите и достоверный GPS — разные подтверждения. Нет данных ≠ менеджер не был.</div>
      <div id="gps-dir-visits-v236427"><div style="padding:12px;color:var(--sub)">Загрузка…</div></div>
      <div id="gps-brief-page-v236438" class="gps-brief-toolbar" style="justify-content:space-between;margin-top:12px"></div>
    </div>
    <div class="gps-brief-card">
      <div class="gps-brief-top"><div class="gps-brief-title" style="font-size:15px">Технические остановки</div><button class="btn-secondary" id="gps-brief-tech-load-v236438">Показать детали</button></div>
      <div class="gps-brief-muted" style="margin:7px 0">Классификация сохранена отдельно от плановых и внеплановых ТТ. Подробности загружаются только по запросу.</div>
      <div id="gps-dir-tech-v236427">Нажмите «Показать детали».</div>
    </div>
  `;

  page.appendChild(panel);

  tabs.querySelector('#gps-tab-route-v236427').addEventListener('click',()=>setMode('route'));
  tabs.querySelector('#gps-tab-director-v236427').addEventListener('click',()=>setMode('director'));
  panel.querySelector('#gps-dir-load-v236427').addEventListener('click',()=>load(true));
  panel.querySelector('#gps-dir-xlsx-v236427').addEventListener('click',exportExcel);
  panel.querySelector('#gps-brief-issues-v236438').addEventListener('click',()=>{onlyIssues=true;activeFindingFilter='all';pageOffset=0;load(true);});
  panel.querySelector('#gps-brief-all-v236438').addEventListener('click',()=>{onlyIssues=false;activeFindingFilter='all';pageOffset=0;load(true);});
  panel.querySelector('#gps-brief-tech-load-v236438').addEventListener('click',()=>loadTechnical());
  panel.addEventListener('click',event=>{
    if(!allowed()||mode!=='director')return;
    const btn=event.target.closest('[data-gps-brief-filter]');
    if(btn){event.preventDefault();const value=btn.getAttribute('data-gps-brief-filter')||'all';
      if(value==='technical'){loadTechnical();document.getElementById('gps-dir-tech-v236427')?.scrollIntoView({behavior:'smooth',block:'center'});return;}
      activeFindingFilter=value;onlyIssues=value==='review';pageOffset=0;load(true);
      document.getElementById('gps-dir-visits-v236427')?.scrollIntoView({behavior:'smooth',block:'start'});
    }
  });
  for(const id of ['gps-dir-from-v236427','gps-dir-to-v236427','gps-dir-manager-v236427']){
    panel.querySelector('#'+id)?.addEventListener('change',()=>{pageOffset=0;technicalLoadedKey='';if(mode==='director')load(true);});
  }

  const obs=new MutationObserver(()=>{
    if(mode==='director'){
      const home=document.getElementById('gps-home-zones-v236419');
      if(home)home.style.display='none';
    }
  });
  obs.observe(page,{childList:true,subtree:false});
  return panel;
}
function args(){
  return{
    p_from:document.getElementById('gps-dir-from-v236427')?.value||'',
    p_to:document.getElementById('gps-dir-to-v236427')?.value||'',
    p_manager:document.getElementById('gps-dir-manager-v236427')?.value||'all'
  };
}
function fillManagers(visits){
  const el=document.getElementById('gps-dir-manager-v236427');if(!el)return;
  const cur=el.value||'all';
  const names=[...new Set((visits||[]).map(x=>String(x.manager_name||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
  const existing=new Set([...el.options].map(o=>o.value));
  for(const n of names)if(!existing.has(n)){const o=document.createElement('option');o.value=n;o.textContent=n;el.appendChild(o);}
  if([...el.options].some(o=>o.value===cur))el.value=cur;
}

const shownNumber=n=>(Number(n)||0).toLocaleString('ru-RU');
const metric=(label,value,sub,color='',filter='all')=>'<button type="button" class="gps-brief-metric" data-gps-brief-filter="'+esc(filter)+'" title="Нажмите, чтобы раскрыть список" style="text-align:left;cursor:pointer;width:100%;font:inherit"><div class="gps-brief-muted">'+esc(label)+' ↗</div><strong style="'+(color?'color:'+color:'')+'">'+shownNumber(value)+'</strong><div class="gps-brief-muted">'+esc(sub)+'</div></button>';
function renderKpi(data){
  const s=data?.summary||{};
  const root=document.getElementById('gps-dir-kpi-v236427');if(!root)return;
  root.innerHTML=
    metric('Плановых ТТ',s.total,'за выбранный период','','all')+
    metric('GPS подтверждён',s.confirmed,'включая передачи','#166534','confirmed')+
    metric('Нужна проверка',s.review,'не равно нарушению','#9a3412','review')+
    metric('День продолжается',s.pending,'факт ещё может появиться','','pending')+
    metric('Технические остановки',s.technical_stops,'из сохранённой классификации','','technical');
}
function renderActions(data){
  const s=data?.summary||{},root=document.getElementById('gps-brief-actions-v236438');
  if(!root)return;
  const defs=[
    ['Отметка без подтверждения GPS',s.report_without_gps,'Есть отчёт о визите. Проверьте качество GPS и геозону ТТ.','report_without_gps'],
    ['Нет готового GPS-расчёта',s.no_snapshot,'Нельзя считать посещение пропущенным. Проверьте историю и готовность снимка.','no_snapshot'],
    ['Требуется выверение координат',s.coordinates,'Уточните фактическую геозону торговой точки.','coords_review'],
    ['GPS был, отчёт не оформлен',s.gps_without_report,'Проверьте наличие оформленного визита.','gps_without_report'],
    ['Посещение без подтверждения',s.not_confirmed,'Сверить маршрут и факт визита до управленческого вывода.','not_confirmed'],
    ['Нет свежих координат',s.gps_data_late,'Проверить Android, связь и накопленную очередь.','pending'],
    ['Предварительные сводки',s.stale_snapshots,'Это количество рабочих дней. По нажатию — их ТТ.','stale_snapshots']
  ].filter(x=>Number(x[1])>0);
  root.innerHTML=defs.length?defs.map(([label,num,description,filter])=>
    '<button type="button" class="gps-brief-action" data-warning="true" data-gps-brief-filter="'+esc(filter)+'" style="font:inherit;text-align:left;cursor:pointer"><strong>'+esc(label)+' · '+shownNumber(num)+' ↗</strong><small>'+esc(description)+'</small></button>'
    ).join(''):'<div class="gps-brief-action"><strong>Нет выявленных исключений</strong><small>Сводка не заменяет проверку конкретных визитов.</small></div>';
}
function showTime(v){
  if(!v)return '—';
  try{return new Date(v).toLocaleTimeString('ru-RU',{timeZone:'Europe/Minsk',hour:'2-digit',minute:'2-digit'})}
  catch(_){return '—';}
}
function renderVisits(rows){
  const root=document.getElementById('gps-dir-visits-v236427');if(!root)return;
  document.getElementById('gps-brief-issues-v236438')?.classList.toggle('btn-primary',onlyIssues);
  document.getElementById('gps-brief-all-v236438')?.classList.toggle('btn-primary',!onlyIssues);
  if(!rows.length){root.innerHTML='<div style="padding:14px;color:var(--sub)">Для выбранного фильтра записей нет.</div>';return;}
  root.innerHTML='<table class="gps-route-table"><thead><tr>'+
    '<th>Дата / менеджер</th><th>Торговая точка</th><th>Заключение</th><th>План</th><th>GPS / передача</th><th>Источник / проверка</th><th>Маршрут</th>'+
    '</tr></thead><tbody>'+rows.map(r=>{
     const tone=r.decision==='confirmed'?'#166534':r.decision==='pending'?'#6b7280':'#9a3412';
     const snapshot=r.snapshot_status==='stale'?' · снимок предварительный':'';
     const gpsStatus=r.gps_verified?'GPS выверен':'GPS не выверен';
     const info=[r.coordinate_source||'—',gpsStatus].filter(Boolean).join(' · ');
     return '<tr><td><b>'+esc(day(r.date))+'</b><div style="font-size:11px">'+esc(r.manager_name)+'</div></td>'+
     '<td><b>'+esc(r.client_name||'—')+'</b><div style="color:var(--sub);font-size:10px">'+esc([r.city,r.address].filter(Boolean).join(', '))+'</div></td>'+
     '<td><b style="color:'+tone+'">'+esc(r.reason)+'</b><div style="font-size:10px;color:var(--sub)">'+esc(snapshot)+'</div></td>'+
     '<td>'+esc(hhmm(r.planned_start))+'–'+esc(hhmm(r.planned_end))+'</td>'+
     '<td>'+esc(showTime(r.actual_arrival_at))+'–'+esc(showTime(r.actual_departure_at))+
        (r.actual_minutes!=null?'<div style="font-size:10px">'+esc(mins(r.actual_minutes))+'</div>':'')+'</td>'+
     '<td style="font-size:10px">'+esc(info)+'</td>'+
     '<td><div style="display:flex;gap:5px;flex-wrap:wrap"><button type="button" class="btn-primary" data-gps-brief-case="'+esc(r.route_plan_id)+'">Разобрать</button><button type="button" class="btn-secondary" onclick="crmOpenGpsViewerV2360(\''+esc(r.workday_id)+'\')">Карта</button></div></td></tr>';
    }).join('')+'</tbody></table>';
}
function renderPage(data){
  const box=document.getElementById('gps-brief-page-v236438');if(!box)return;
  const total=Number(data?.total_matching)||0,from=total?Number(data?.offset||0)+1:0,to=Math.min(total,Number(data?.offset||0)+(data?.visits?.length||0));
  box.innerHTML='<span class="gps-brief-muted">Показано '+shownNumber(from)+'–'+shownNumber(to)+' из '+shownNumber(total)+(activeFindingFilter!=='all'?' · фильтр: '+esc(activeFindingFilter):'')+'</span>'+
  '<span class="gps-brief-toolbar"><button class="btn-secondary" id="gps-brief-prev-v236438" '+(pageOffset<=0?'disabled':'')+'>Назад</button>'+
  '<button class="btn-secondary" id="gps-brief-next-v236438" '+(to>=total?'disabled':'')+'>Далее</button></span>';
  document.getElementById('gps-brief-prev-v236438')?.addEventListener('click',()=>{pageOffset=Math.max(0,pageOffset-80);load(true);});
  document.getElementById('gps-brief-next-v236438')?.addEventListener('click',()=>{pageOffset+=80;load(true);});
}
function renderTech(rows,total){
 const box=document.getElementById('gps-dir-tech-v236427');if(!box)return;
 if(!rows?.length){box.innerHTML='<div style="padding:12px;color:var(--sub)">За период сохранённых технических остановок нет.</div>';return;}
 box.innerHTML='<div class="gps-brief-muted" style="margin:8px 0">Показано '+shownNumber(rows.length)+' из '+shownNumber(total)+' остановок. Полный маршрут по кнопке.</div>'+
  '<table class="gps-route-table"><thead><tr><th>Дата</th><th>Менеджер</th><th>Остановка</th><th>Время</th><th>Длительность</th><th></th></tr></thead><tbody>'+
  rows.map(r=>'<tr><td>'+esc(day(r.work_date))+'</td><td>'+esc(r.manager_name)+'</td><td>'+esc(r.label||'Техническая остановка')+
  '</td><td>'+esc(showTime(r.stop?.start_at))+'–'+esc(showTime(r.stop?.end_at))+'</td>'+
  '<td>'+esc(mins(r.stop?.minutes))+'</td><td><button class="btn-secondary" onclick="crmOpenGpsViewerV2360(\''+esc(r.workday_id)+'\')">Карта</button></td></tr>').join('')+'</tbody></table>';
}
async function loadTechnical(){
 if(!allowed()||mode!=='director')return;
 const a=args(),key=[a.p_from,a.p_to,a.p_manager].join('|');
 const b=document.getElementById('gps-brief-tech-load-v236438');if(b)b.disabled=true;
 const box=document.getElementById('gps-dir-tech-v236427');if(box)box.textContent='Загрузка сохранённой классификации…';
 try{
   const {data,error}=await db.rpc('gps_director_technical_briefing_v236438',{...a,p_limit:80});
   if(error)throw error;
   if(key!==[args().p_from,args().p_to,args().p_manager].join('|'))return;
   renderTech(data?.stops||[],data?.total||0);technicalLoadedKey=key;
 }catch(e){if(box)box.textContent='Не удалось загрузить технические остановки: '+(e?.message||e);}
 finally{if(b)b.disabled=false;}
}


async function load(force=false){
  if(!allowed()||mode!=='director'||busy)return;
  const panel=ensureUi();if(!panel)return;
  const a=args();
  if(!a.p_from||!a.p_to)return;
  if(a.p_from>a.p_to){alert('Начало периода позже окончания');return;}
  busy=true;
  const btn=document.getElementById('gps-dir-load-v236427');if(btn)btn.disabled=true;
  const area=document.getElementById('gps-dir-visits-v236427');
  if(area)area.innerHTML='<div style="padding:14px;color:var(--sub)">Загрузка быстрого GPS-брифинга…</div>';
  try{
    const {data,error}=await db.rpc('gps_director_briefing_filtered_v236440',
       {...a,p_limit:80,p_offset:pageOffset,p_only_issues:onlyIssues,p_filter:activeFindingFilter});
    if(error)throw error;
    lastData=data||{visits:[],summary:{}};
    fillManagers(lastData.visits||[]);
    renderKpi(lastData);renderActions(lastData);renderVisits(lastData.visits||[]);renderPage(lastData);
    const stamp=document.getElementById('gps-brief-sync-v236438');
    if(stamp)stamp.textContent='Данные: готовые GPS-снимки и планы · обработка без повторного чтения GPS-трека · период '+day(a.p_from)+' — '+day(a.p_to);
    if(technicalLoadedKey!==[a.p_from,a.p_to,a.p_manager].join('|')){
      const tech=document.getElementById('gps-dir-tech-v236427');if(tech)tech.textContent='Нажмите «Показать детали».';
    }
  }catch(e){
    console.error('GPS briefing '+VERSION,e);
    if(area)area.innerHTML='<div style="padding:14px;border:1px solid #fecaca;border-radius:10px;color:#991b1b"><b>Брифинг временно недоступен.</b><div style="font-size:11px;margin-top:4px">'+esc(e?.message||e)+'</div><div style="font-size:11px;margin-top:5px">Исходные GPS-данные не изменены; можно открыть маршруты на соседней вкладке.</div></div>';
  }finally{busy=false;if(btn)btn.disabled=false;}
}


async function exportCsvBackup(){
 const a=args(),rows=[],step=250;
 for(let offset=0;offset<=5000;offset+=step){
   const {data,error}=await db.rpc('gps_director_briefing_v236438',{...a,p_limit:step,p_offset:offset,p_only_issues:false});
   if(error)throw error;
   rows.push(...(data?.visits||[]));
   if(rows.length>=Number(data?.total_matching||0)||!(data?.visits||[]).length)break;
 }
 const col=[['Дата','Менеджер','ТТ','Адрес','Статус','План с','План до','GPS приехал','GPS уехал','Минут','Источник'],
 ...rows.map(r=>[day(r.date),r.manager_name,r.client_name,[r.city,r.address].filter(Boolean).join(', '),r.reason,hhmm(r.planned_start),hhmm(r.planned_end),showTime(r.actual_arrival_at),showTime(r.actual_departure_at),r.actual_minutes??'',r.coordinate_source])];
 const txt='\ufeff'+col.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
 const blob=new Blob([txt],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 const link=document.createElement('a');link.href=url;link.download='GPS_Брифинг_'+a.p_from+'_'+a.p_to+'.csv';
 document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1800);
}
async function exportExcel(){
  if(!allowed())return;
  const a=args();
  const btn=document.getElementById('gps-dir-xlsx-v236427');if(btn)btn.disabled=true;
  try{
    const {data:{session},error}=await db.auth.getSession();if(error)throw error;
    if(!session?.access_token)throw new Error('Нет активной сессии CRM');
    const r=await fetch('https://baqchjtvtmcfzwjjluhs.supabase.co/functions/v1/crm-gps-director-export-v236427',{
      method:'POST',
      headers:{'content-type':'application/json','authorization':'Bearer '+session.access_token},
      body:JSON.stringify({from:a.p_from,to:a.p_to,manager:a.p_manager})
    });
    if(!r.ok){const j=await r.json().catch(()=>({}));throw new Error(j?.error||('HTTP '+r.status));}
    const blob=await r.blob();
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;link.download='GPS_Руководитель_'+a.p_from+'_'+a.p_to+'.xlsx';
    document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
  }catch(e){try{await exportCsvBackup();alert('Excel-сервис временно недоступен. Выгружен CSV, который открывается в Excel.');}catch(e2){alert('Не удалось выгрузить отчёт: '+(e2?.message||e));}}
  finally{if(btn)btn.disabled=false;}
}
function install(){
  if(!allowed())return;
  ensureUi();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
setTimeout(install,500);setTimeout(install,1200);
document.addEventListener('click',e=>{
  if(e.target.closest?.('#bn-gps-control,[onclick*="gps-control"]'))setTimeout(install,220);
},true);
setInterval(()=>{
  if(document.getElementById('page-gps-control')?.classList.contains('active')&&allowed()&&!document.getElementById('gps-director-view-v236427'))install();
},2000);

window.RESANTA_GPS_DIRECTOR_REPORT_V236427=Object.freeze({version:'v23.6.440',access:['payushin','sidarovich'],factsOnly:true,briefing:true,drilldown:true,snapshotReport:true,heavyGpsOnOpen:false});
})();