/* RESANTA CRM v23.5.3 · GPS RELIABILITY GUARD
 * 1) Blocks a new Android workday until background location + battery settings are safe.
 * 2) Makes boss GPS status truthful: online / delayed / not transmitting.
 * 3) Does not change routes, visits, distance calculation or stored GPS points.
 */
(function(){
'use strict';
if(window.RESANTA_GPS_RELIABILITY_V2353)return;
const VERSION='v23.5.3';

function tracker(){
  try{return typeof v19NativeTracker==='function'?v19NativeTracker():(window.Capacitor?.Plugins?.WorkdayTracker||null);}catch(_){return null;}
}
function isAndroid(){
  try{return typeof v19IsNativeAndroid==='function'?v19IsNativeAndroid():!!(window.Capacitor?.isNativePlatform?.()&&window.Capacitor?.getPlatform?.()==='android');}catch(_){return false;}
}
async function nativeStatus(){
  const t=tracker();
  if(!t||typeof t.status!=='function')return null;
  try{return await t.status();}catch(e){console.warn('GPS v23.5.3 status unavailable',e);return null;}
}
async function openSetting(method){
  const t=tracker();
  if(!t||typeof t[method]!=='function')return;
  try{await t[method]();}catch(e){console.warn('GPS settings open failed',method,e);}
}

const baseEnsure=(typeof window.v19EnsureNativePermissions==='function'&&window.v19EnsureNativePermissions)
  ||(typeof v19EnsureNativePermissions==='function'?v19EnsureNativePermissions:null);
async function strictEnsureNativePermissionsV2353(){
  if(baseEnsure)await baseEnsure();
  if(!isAndroid())return true;
  const s=await nativeStatus();
  if(!s)return true;
  if(s.locationProviderEnabled===false){
    if(confirm('На телефоне выключена геолокация Android.\n\nОткрыть настройки местоположения?'))await openSetting('openLocationSettings');
    throw new Error('Включите геолокацию Android и снова нажмите «Начать рабочий день».');
  }
  if(s.fineLocationGranted===false){
    if(confirm('Ресанта CRM не получила точное местоположение.\n\nОткрыть настройки приложения?'))await openSetting('openAppSettings');
    throw new Error('Разрешите Ресанта CRM точное местоположение.');
  }
  if(s.backgroundLocationGranted===false){
    if(confirm('Для рабочего маршрута нужно разрешить местоположение «Всегда». Иначе Android может перестать передавать GPS, когда телефон в кармане.\n\nОткрыть настройки приложения?'))await openSetting('openAppSettings');
    throw new Error('Разрешите: Местоположение → Разрешать всегда. После этого снова начните рабочий день.');
  }
  if(s.notificationsEnabled===false||s.notificationChannelEnabled===false){
    if(confirm('Отключено постоянное уведомление рабочего GPS. Без него Android может остановить запись.\n\nОткрыть настройки уведомлений?'))await openSetting('openNotificationSettings');
    throw new Error('Включите уведомления Ресанта CRM и канал «Рабочий GPS-маршрут».');
  }
  if(s.batteryUnrestricted===false){
    if(confirm('Android ограничивает Ресанта CRM по батарее. Для надёжной записи маршрута установите для приложения режим «Без ограничений».\n\nОткрыть настройки батареи?'))await openSetting('openBatterySettings');
    throw new Error('Установите для Ресанта CRM батарею «Без ограничений», затем снова начните рабочий день.');
  }
  return true;
}
window.v19EnsureNativePermissions=strictEnsureNativePermissionsV2353;
try{v19EnsureNativePermissions=strictEnsureNativePermissionsV2353;}catch(_){ }

function ageSeconds(value){
  if(!value)return Infinity;
  const t=new Date(value).getTime();
  return Number.isFinite(t)?Math.max(0,Math.round((Date.now()-t)/1000)):Infinity;
}
function ageText(sec){
  if(!Number.isFinite(sec))return'нет точки';
  if(sec<60)return sec+' сек назад';
  const min=Math.round(sec/60);return min+' мин назад';
}
function truthMeta(w){
  const sec=ageSeconds(w?.last_point_at);
  if(sec<=120)return{cls:'ok',bg:'#ECFDF5',border:'#86EFAC',color:'#166534',text:'● GPS онлайн · '+ageText(sec)};
  if(sec<=600)return{cls:'warn',bg:'#FFF7ED',border:'#FDBA74',color:'#9A3412',text:'● GPS задержка · '+ageText(sec)};
  return{cls:'bad',bg:'#FEF2F2',border:'#FCA5A5',color:'#B91C1C',text:'● GPS не передаёт · '+ageText(sec)};
}
function gpsRows(){try{return Array.isArray(v19GpsControlRows)?v19GpsControlRows:[];}catch(_){return[];}}
function sameName(a,b){return String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase();}
function decorateBossGpsTruth(){
  const table=document.querySelector('#gps-control-list table');
  if(!table)return;
  const data=gpsRows();
  table.querySelectorAll('tbody tr').forEach(tr=>{
    const cells=tr.querySelectorAll('td');if(cells.length<4)return;
    const manager=String(cells[0].textContent||'').trim();
    const w=data.find(x=>sameName(x.manager_name,manager));
    if(!w||String(w.status||'')!=='active')return;
    let badge=cells[1].querySelector('.gps-truth-v2353');
    if(!badge){badge=document.createElement('div');badge.className='gps-truth-v2353';badge.style.cssText='margin-top:6px;padding:4px 7px;border-radius:8px;font-size:10px;font-weight:800;line-height:1.25;width:max-content;max-width:180px';cells[1].appendChild(badge);}
    const m=truthMeta(w);badge.textContent=m.text;badge.style.background=m.bg;badge.style.border='1px solid '+m.border;badge.style.color=m.color;
  });
  const selected=(()=>{try{return data.find(x=>String(x.id)===String(v19SelectedWorkdayId));}catch(_){return null;}})();
  const detail=document.querySelector('#gps-control-detail,#gps-control-details');
  if(detail&&selected&&String(selected.status||'')==='active'){
    let box=detail.querySelector('.gps-live-truth-v2353');
    if(!box){box=document.createElement('div');box.className='gps-live-truth-v2353';box.style.cssText='margin:0 0 10px;padding:9px 11px;border-radius:10px;font-size:12px;font-weight:800';detail.prepend(box);}
    const m=truthMeta(selected);box.textContent=m.text+(m.cls==='bad'?' · текущая позиция неизвестна до новой GPS-точки':'');box.style.background=m.bg;box.style.border='1px solid '+m.border;box.style.color=m.color;
  }
}

const baseGpsRender=(typeof window.v19RenderGpsControl==='function'&&window.v19RenderGpsControl)
  ||(typeof v19RenderGpsControl==='function'?v19RenderGpsControl:null);
if(baseGpsRender){
  const wrapped=async function(...args){const r=await baseGpsRender.apply(this,args);setTimeout(decorateBossGpsTruth,0);return r;};
  window.v19RenderGpsControl=wrapped;try{v19RenderGpsControl=wrapped;}catch(_){ }
}
const mo=new MutationObserver(()=>{if(document.getElementById('page-gps-control')?.classList.contains('active'))decorateBossGpsTruth();});
setTimeout(()=>{const root=document.getElementById('page-gps-control');if(root)mo.observe(root,{childList:true,subtree:true});decorateBossGpsTruth();},800);

window.RESANTA_GPS_RELIABILITY_V2353=Object.freeze({
  version:VERSION,
  strictAndroidPreflight:true,
  requiresBackgroundLocation:true,
  requiresBatteryUnrestricted:true,
  truthfulBossStatus:true,
  routesUntouched:true,
  visitsUntouched:true,
  distanceUntouched:true
});
})();
