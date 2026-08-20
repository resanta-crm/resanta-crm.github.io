/* RESANTA CRM v23.6.2 · DIRECTOR GPS CONTROL
 * Lightweight director screen:
 * - total client visits;
 * - plan fact separated from off-plan visits;
 * - GPS warnings are visible but do not erase a recorded/linked visit;
 * - no raw GPS points and no maps in the main CRM.
 */
(function(){
'use strict';
if(window.RESANTA_GPS_AGGREGATED_ROOT_V2360)return;
const VERSION='v23.6.2';
let flight=null,reqSeq=0,lastRows=[];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const escAttr=v=>esc(v).replace(/`/g,'&#96;');
function active(){return !!document.getElementById('page-gps-control')?.classList.contains('active');}
function dateValue(){return document.getElementById('gps-control-date')?.value||String(window.TODAY||new Date().toISOString().slice(0,10));}
function filterValue(id){return document.getElementById(id)?.value||'all';}
function ageSec(v){const t=v?new Date(v).getTime():NaN;return Number.isFinite(t)?Math.max(0,Math.round((Date.now()-t)/1000)):Infinity;}
function ageText(v){const s=ageSec(v);if(!Number.isFinite(s))return'нет GPS';if(s<60)return s+' сек назад';if(s<3600)return Math.round(s/60)+' мин назад';return Math.round(s/3600)+' ч назад';}
function gpsTruth(w){const s=ageSec(w.last_point_at);if(s<=120)return{cls:'ok',text:'● GPS онлайн'};if(s<=600)return{cls:'warn',text:'● GPS задержка'};return{cls:'bad',text:'● GPS не передаёт'};}
function km(v){const n=Number(v)||0;return(n/1000).toLocaleString('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1})+' км';}
function clock(v){if(!v)return'—';try{return new Date(v).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});}catch(_){return'—';}}
function duration(a,b){const x=new Date(a).getTime(),y=b?new Date(b).getTime():Date.now();if(!Number.isFinite(x)||!Number.isFinite(y))return'';const m=Math.max(0,Math.round((y-x)/60000));return Math.floor(m/60)+' ч '+(m%60)+' мин';}
function dist(v){const n=Number(v);if(!Number.isFinite(n))return'';return n<1000?Math.round(n)+' м':(n/1000).toLocaleString('ru-RU',{maximumFractionDigits:1})+' км';}
function viewerUrl(id){return './assets/gps-viewer-v2360.html?v=23.6.2&workday='+encodeURIComponent(String(id||''))+'&_='+Date.now();}
function openViewer(id){if(!id)return;window.open(viewerUrl(id),'_blank','noopener');}
window.crmOpenGpsViewerV2360=openViewer;

function disableLegacyMap(){
  try{document.getElementById('gps-yandex-status-v2351')?.remove();}catch(_){}
  const map=document.getElementById('gps-control-map');
  if(map){
    try{map.id='gps-control-map-disabled-v2360';}catch(_){}
    map.innerHTML='<div style="padding:18px;border:1px dashed #BFDBFE;border-radius:12px;background:#F8FBFF;color:#1E3A8A;font-size:13px;line-height:1.55"><b>Карта открывается отдельно.</b><br>Основная CRM показывает только управленческую сводку и поэтому не зависает. Нажмите «Открыть маршрут» напротив менеджера.</div>';
  }
  try{if(window._v2273214GpsLayer?.clearLayers)window._v2273214GpsLayer.clearLayers();if(window.v19GpsMap?.remove)window.v19GpsMap.remove();}catch(_){}
  try{window.v19GpsMap=null;}catch(_){}
  const d=document.getElementById('gps-control-detail');
  if(d)d.innerHTML='<div style="padding:12px;border:1px solid #DBEAFE;border-radius:10px;background:#EFF6FF;color:#1E3A8A;font-size:12px;line-height:1.5"><b>Для руководителя оставлены только факты.</b><br>Клиенты, план, внеплановые визиты, пробег и GPS-отклонения. Технические точки доступны внутри отдельного маршрута.</div>';
}
function ensureManagers(rows){
  const el=document.getElementById('gps-control-manager');if(!el)return;
  const current=el.value||'all';
  const names=[...new Set((rows||[]).map(r=>String(r.manager_name||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
  const known=[...el.options].map(o=>o.value);
  for(const n of names)if(!known.includes(n)){const o=document.createElement('option');o.value=n;o.textContent=n;el.appendChild(o);}
  if([...el.options].some(o=>o.value===current))el.value=current;
}
function renderKpi(rows){
  const root=document.getElementById('gps-control-kpi');if(!root)return;
  const activeRows=rows.filter(x=>x.status==='active');
  const totalVisits=rows.reduce((s,x)=>s+(Number(x.visit_total)||0),0);
  const planVisited=rows.reduce((s,x)=>s+(Number(x.plan_visited_count)||0),0);
  const planTotal=rows.reduce((s,x)=>s+(Number(x.planned_count)||0),0);
  const warnings=rows.reduce((s,x)=>s+(Number(x.gps_warning_count)||0),0);
  root.innerHTML=
    '<div class="kpi"><div class="kpi-label">Сейчас в пути</div><div class="kpi-value '+(activeRows.length?'ok':'')+'">'+activeRows.length+'</div></div>'+
    '<div class="kpi"><div class="kpi-label">Клиентов посещено</div><div class="kpi-value">'+totalVisits+'</div></div>'+
    '<div class="kpi"><div class="kpi-label">План выполнен</div><div class="kpi-value">'+planVisited+' / '+planTotal+'</div></div>'+
    '<div class="kpi"><div class="kpi-label">GPS требует проверки</div><div class="kpi-value '+(warnings?'warn':'ok')+'">'+warnings+'</div></div>';
}
function currentPlace(w){
  const name=String(w.near_client_name||'').trim(),d=Number(w.near_client_distance_m);
  if(name)return '<b>'+esc(name)+'</b><div style="font-size:10px;color:var(--sub);margin-top:3px">рядом · '+esc(dist(d))+'</div>';
  return '<b>'+esc(ageText(w.last_point_at))+'</b><div style="font-size:10px;color:var(--sub);margin-top:3px">последняя GPS</div>';
}
function renderRows(rows){
  const root=document.getElementById('gps-control-list');if(!root)return;
  if(!rows.length){root.innerHTML='<div style="padding:18px;text-align:center;color:var(--sub)">За выбранную дату рабочих дней нет.</div>';return;}
  root.innerHTML='<table class="gps-route-table"><thead><tr><th>Менеджер</th><th>Статус</th><th>Рабочий день</th><th>Где сейчас</th><th>Пробег</th><th>Визиты</th><th>План</th><th>Контроль</th><th></th></tr></thead><tbody>'+
    rows.map(w=>{
      const live=w.status==='active',t=gpsTruth(w),planned=Number(w.planned_count)||0,planVisited=Number(w.plan_visited_count)||0;
      const total=Number(w.visit_total)||0,off=Number(w.offplan_count)||0,warn=Number(w.gps_warning_count)||0,pending=Math.max(0,planned-planVisited);
      let control='<span class="ok" style="font-size:11px;font-weight:700">Без отклонений</span>';
      if(warn||off){
        control=(warn?'<div class="warn" style="font-size:11px;font-weight:700">⚠ GPS к проверке: '+warn+'</div>':'')+
                (off?'<div style="font-size:11px;color:#1D4ED8;font-weight:700;margin-top:3px">↗ Вне плана: '+off+'</div>':'');
      }
      return '<tr>'+
        '<td><b>'+esc(w.manager_name)+'</b></td>'+
        '<td>'+(live?'<span class="gps-live-pill">в пути</span>':'<span class="tag tag-m">завершён</span>')+'<div class="'+t.cls+'" style="font-size:10px;margin-top:4px;font-weight:700">'+esc(t.text)+'</div></td>'+
        '<td>'+esc(clock(w.started_at))+' — '+(w.ended_at?esc(clock(w.ended_at)):'сейчас')+'<div style="font-size:10px;color:var(--sub)">'+esc(duration(w.started_at,w.ended_at))+'</div></td>'+
        '<td>'+currentPlace(w)+'</td>'+
        '<td><b>'+esc(km(w.total_distance_m))+'</b></td>'+
        '<td><b style="font-size:16px">'+total+'</b> клиент'+(total===1?'':'ов')+(off?'<div style="font-size:10px;color:#1D4ED8">из них вне плана '+off+'</div>':'')+'</td>'+
        '<td><b>'+planVisited+' / '+planned+'</b>'+(pending?'<div style="font-size:10px;color:var(--sub)">осталось '+pending+'</div>':'<div class="ok" style="font-size:10px">план закрыт</div>')+'</td>'+
        '<td>'+control+'</td>'+
        '<td><button class="btn-secondary" onclick="crmOpenGpsViewerV2360(\''+escAttr(w.id)+'\')">Открыть маршрут</button></td>'+
      '</tr>';
    }).join('')+
  '</tbody></table>';
}
async function load(force=false){
  if(!active())return;
  if(flight&&!force)return flight;
  const seq=++reqSeq;
  flight=(async()=>{
    const args={p_date:dateValue(),p_manager:filterValue('gps-control-manager'),p_status:filterValue('gps-control-status')};
    const {data,error}=await db.rpc('gps_get_control_workdays_director_v2362',args);
    if(error)throw error;
    if(!active()||seq!==reqSeq)return;
    lastRows=Array.isArray(data)?data:[];
    ensureManagers(lastRows);renderKpi(lastRows);renderRows(lastRows);disableLegacyMap();
  })().catch(e=>{
    console.error('GPS '+VERSION,e);
    const root=document.getElementById('gps-control-list');
    if(root&&active())root.innerHTML='<div style="padding:16px;border:1px solid #FECACA;background:#FEF2F2;color:#991B1B;border-radius:10px"><b>Не удалось загрузить директорскую GPS-сводку.</b><br>'+esc(e?.message||e)+'</div>';
  }).finally(()=>{flight=null;});
  return flight;
}
function installFilters(){
  for(const id of ['gps-control-date','gps-control-manager','gps-control-status']){
    const e=document.getElementById(id);if(!e||e.dataset.gpsAggV2362)continue;
    e.dataset.gpsAggV2362='1';e.addEventListener('change',()=>load(true));
  }
  const page=document.getElementById('page-gps-control');
  if(page){
    const b=[...page.querySelectorAll('button')].find(x=>/обновить/i.test(x.textContent||''));
    if(b&&!b.dataset.gpsAggV2362){
      b.dataset.gpsAggV2362='1';
      b.addEventListener('click',ev=>{ev.preventDefault();ev.stopImmediatePropagation();load(true);},true);
    }
  }
}
async function lightweightRender(){installFilters();disableLegacyMap();return load(false);}
function aggregatedOpen(id){openViewer(id);}
function install(){
  window.v19RenderGpsControl=lightweightRender;try{v19RenderGpsControl=lightweightRender;}catch(_){}
  window.v19OpenGpsWorkday=aggregatedOpen;try{v19OpenGpsWorkday=aggregatedOpen;}catch(_){}
  installFilters();disableLegacyMap();if(active())setTimeout(()=>load(true),0);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
setTimeout(install,250);setTimeout(install,900);
window.RESANTA_GPS_CONTROL_PERFORMANCE_V2357=Object.freeze({version:VERSION,directorView:true});
window.RESANTA_GPS_AGGREGATED_ROOT_V2360=Object.freeze({version:VERSION,rawPointsInMainCrm:false,mapInMainCrm:false,directorRpc:'gps_get_control_workdays_director_v2362',separateViewer:true});
})();
