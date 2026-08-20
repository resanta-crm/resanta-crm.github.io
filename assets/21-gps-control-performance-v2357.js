/* RESANTA CRM v23.5.9 · GPS CONTROL LAZY ROOT
 * Entry is lightweight; full workday opens only by explicit "Карта".
 * Physical-stop detection is precomputed in a Web Worker, then the proven CRM
 * renderer is reused with the exact stop result. Stored data/business truth unchanged.
 */
(function(){
'use strict';
if(window.RESANTA_GPS_CONTROL_LAZY_V2359)return;
const VERSION='v23.5.9',WORKER='./assets/23-gps-stop-worker-v2359.js';
let renderFlight=null,worker=null,epoch=0;
let baseOpen=null,baseGo=null;
function active(){return !!document.getElementById('page-gps-control')?.classList.contains('active');}
function cancel(){epoch++;if(worker){try{worker.terminate();}catch(_){}worker=null;}}
function placeholder(){const d=document.getElementById('gps-control-detail');if(d)d.innerHTML='<div class="v2273214-selected"><div class="v2273214-selected-title">Выберите рабочий день в таблице</div><div class="v2273214-selected-meta">Полный GPS-маршрут и остановки загружаются только после нажатия «Карта». Вход в GPS-контроль больше не запускает тяжёлый расчёт.</div></div>';}
function planStats(w){try{return v19PlanStats(w);}catch(_){return{plans:[],visited:[],missed:[]};}}
async function lightRender(){
  if(!active()||!v19GpsControllerAccess)return;if(renderFlight)return renderFlight;const my=epoch;
  renderFlight=(async()=>{try{
    const dateEl=document.getElementById('gps-control-date'),managerEl=document.getElementById('gps-control-manager'),statusEl=document.getElementById('gps-control-status');
    if(dateEl&&!dateEl.value)dateEl.value=TODAY;
    if(managerEl&&managerEl.options.length<=1)allUsers.filter(u=>isFieldManagerUser(u)&&u.name).forEach(u=>managerEl.insertAdjacentHTML('beforeend','<option value="'+escAttr(u.name)+'">'+esc(u.name)+'</option>'));
    const date=dateEl?.value||TODAY,mgr=managerEl?.value||'all',status=statusEl?.value||'all';let q=db.from('gps_workdays').select('*').eq('work_date',date).order('started_at',{ascending:false});if(mgr!=='all')q=q.eq('manager_name',mgr);if(status!=='all')q=q.eq('status',status);
    const {data,error}=await q;if(error)throw error;if(!active()||my!==epoch)return;
    const names=new Set(allUsers.filter(u=>isFieldManagerUser(u)&&u.name).map(u=>String(u.name).trim().toLowerCase()));v19GpsControlRows=(data||[]).filter(w=>names.has(String(w.manager_name||'').trim().toLowerCase()));
    const a=v19GpsControlRows.filter(w=>w.status==='active'),c=v19GpsControlRows.filter(w=>w.status==='completed'),km=v19GpsControlRows.reduce((s,w)=>s+(Number(w.total_distance_m)||0),0),stale=a.filter(w=>!w.last_point_at||Date.now()-new Date(w.last_point_at).getTime()>600000);
    const k=document.getElementById('gps-control-kpi');if(k)k.innerHTML='<div class="kpi"><div class="kpi-label">Сейчас в пути</div><div class="kpi-value '+(a.length?'ok':'')+'">'+a.length+'</div></div><div class="kpi"><div class="kpi-label">Завершили день</div><div class="kpi-value">'+c.length+'</div></div><div class="kpi"><div class="kpi-label">Пробег за дату</div><div class="kpi-value">'+v19Km(km)+'</div></div><div class="kpi"><div class="kpi-label">Нет точки >10 мин</div><div class="kpi-value '+(stale.length?'bad':'')+'">'+stale.length+'</div></div>';
    const list=document.getElementById('gps-control-list');if(list)list.innerHTML=v19GpsControlRows.length?'<table class="gps-route-table"><thead><tr><th>Менеджер</th><th>Статус</th><th>Начало / конец</th><th>Последняя точка</th><th>Пробег</th><th>Маршрут</th><th></th></tr></thead><tbody>'+v19GpsControlRows.map(w=>{const ps=planStats(w),live=w.status==='active',old=live&&(!w.last_point_at||Date.now()-new Date(w.last_point_at).getTime()>600000);return '<tr><td><b>'+esc(w.manager_name)+'</b></td><td>'+(live?'<span class="gps-live-pill">в пути</span>':'<span class="tag tag-m">завершён</span>')+(old?'<div class="bad" style="font-size:10px;margin-top:4px">GPS давно не обновлялся</div>':'')+'</td><td>'+v19Time(w.started_at)+' — '+(w.ended_at?v19Time(w.ended_at):'сейчас')+'<div style="font-size:10px;color:var(--sub)">'+v19Duration(w.started_at,w.ended_at)+'</div></td><td>'+v19Age(w.last_point_at)+'</td><td><b>'+v19Km(w.total_distance_m)+'</b><div style="font-size:10px;color:var(--sub)">'+(w.valid_points||0)+' точек</div></td><td>'+ps.visited.length+' / '+ps.plans.length+' посещено'+(ps.missed.length?'<div class="bad" style="font-size:10px">'+ps.missed.length+' не подтверждено</div>':'')+'</td><td><button class="btn-secondary" onclick="v19OpenGpsWorkday(\''+w.id+'\',false)">Карта</button></td></tr>';}).join('')+'</tbody></table>':'<div style="padding:18px;color:var(--sub);text-align:center">За выбранную дату рабочие дни не найдены.</div>';
    if(!v19SelectedWorkdayId||!v19GpsControlRows.some(w=>String(w.id)===String(v19SelectedWorkdayId)))placeholder();
  }catch(e){if(active())console.error('GPS '+VERSION+' list',e);}finally{renderFlight=null;}})();return renderFlight;
}
function workerStops(points,my){return new Promise((resolve,reject)=>{worker=new Worker(WORKER+'?_='+Date.now());worker.onmessage=e=>{const w=worker;worker=null;try{w?.terminate();}catch(_){}if(my!==epoch||!active())reject(new Error('cancelled'));else resolve(e.data||[]);};worker.onerror=e=>{const w=worker;worker=null;try{w?.terminate();}catch(_){}reject(new Error(e.message||'GPS worker error'));};worker.postMessage((points||[]).map(p=>({lat:Number(p.lat),lng:Number(p.lng),acc:Number.isFinite(Number(p.accuracy))?Number(p.accuracy):null,t:new Date(p.recorded_at).getTime(),recorded_at:p.recorded_at,valid:v206GpsBool(p.is_valid)})));});}
async function lazyOpen(id,silent){
  if(!active()||!id||typeof baseOpen!=='function')return;cancel();const my=epoch;v19SelectedWorkdayId=id;
  const d=document.getElementById('gps-control-detail');if(d)d.innerHTML='<div id="gps-lazy-loading-v2359" style="padding:10px 12px;border:1px solid #BFDBFE;background:#EFF6FF;color:#1E3A8A;border-radius:10px;font-size:12px;font-weight:700">Готовлю GPS-маршрут в отдельном потоке… меню CRM остаётся доступным.</div>';
  try{
    const {data,error}=await db.from('gps_track_points').select('lat,lng,accuracy,recorded_at,is_valid').eq('workday_id',id).order('recorded_at',{ascending:true});if(error)throw error;if(my!==epoch||!active())return;
    const stops=await workerStops(data||[],my);if(my!==epoch||!active())return;
    const origStops=window.v2273214PhysicalStops||(typeof v2273214PhysicalStops==='function'?v2273214PhysicalStops:null),origMin=window.v2273214MinDistance||(typeof v2273214MinDistance==='function'?v2273214MinDistance:null);
    const ready=()=>stops;
    const fastMin=(st,gf)=>{let m=Infinity;for(const p of st?.points||[]){const x=gpsDistance(Number(gf.lat),Number(gf.lng),Number(p.lat),Number(p.lng));if(x<m)m=x;}return Math.round(m);};
    window.v2273214PhysicalStops=ready;try{v2273214PhysicalStops=ready;}catch(_){}window.v2273214MinDistance=fastMin;try{v2273214MinDistance=fastMin;}catch(_){}
    try{return await baseOpen(id,silent);}finally{if(origStops){window.v2273214PhysicalStops=origStops;try{v2273214PhysicalStops=origStops;}catch(_){}}if(origMin){window.v2273214MinDistance=origMin;try{v2273214MinDistance=origMin;}catch(_){}}}
  }catch(e){if(String(e?.message||'')!=='cancelled'&&active()){console.error('GPS '+VERSION+' map',e);alert('Не удалось открыть маршрут: '+(e.message||e));}}
}
function install(){
  if(!baseOpen){try{baseOpen=window.v19OpenGpsWorkday||(typeof v19OpenGpsWorkday==='function'?v19OpenGpsWorkday:null);}catch(_){}}
  window.v19RenderGpsControl=lightRender;try{v19RenderGpsControl=lightRender;}catch(_){}window.v19OpenGpsWorkday=lazyOpen;try{v19OpenGpsWorkday=lazyOpen;}catch(_){}
  if(!baseGo){try{baseGo=window.goPage||(typeof goPage==='function'?goPage:null);}catch(_){}if(typeof baseGo==='function'){const g=function(p,t){if(String(p)!=='gps-control'&&active())cancel();const r=baseGo.apply(this,arguments);if(String(p)==='gps-control')setTimeout(()=>lightRender(),0);return r;};g.__gpsLazyV2359=true;window.goPage=g;try{goPage=g;}catch(_){}}}
  if(active())setTimeout(()=>lightRender(),0);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});else setTimeout(install,0);setTimeout(install,400);setTimeout(install,1200);
window.RESANTA_GPS_CONTROL_LAZY_V2359=Object.freeze({version:VERSION,autoOpenWorkday:false,explicitMapOnly:true,workerStops:true,cancellableBeforeRender:true,lightRefreshOnly:true});
})();
