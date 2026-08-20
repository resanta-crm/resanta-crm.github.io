/* RESANTA CRM v23.5.3.1 · GPS RELIABILITY GUARD
 * 1) Blocks a new Android workday only for real permission/background failures.
 * 2) A missing notification channel is created by the native plugin and never causes a settings loop.
 * 3) Makes boss GPS status truthful: online / delayed / not transmitting.
 * 4) Does not change routes, visits, distance calculation or stored GPS points.
 */
(function(){
'use strict';
if(window.RESANTA_GPS_RELIABILITY_V2353)return;
const VERSION='v23.5.3.1';
let lastPromptKey='',lastPromptAt=0;

function tracker(){
  try{return typeof v19NativeTracker==='function'?v19NativeTracker():(window.Capacitor?.Plugins?.WorkdayTracker||null);}catch(_){return null;}
}
function isAndroid(){
  try{return typeof v19IsNativeAndroid==='function'?v19IsNativeAndroid():!!(window.Capacitor?.isNativePlatform?.()&&window.Capacitor?.getPlatform?.()==='android');}catch(_){return false;}
}
async function nativeStatus(){
  const t=tracker();
  if(!t||typeof t.status!=='function')return null;
  try{return await t.status();}catch(e){console.warn('GPS '+VERSION+' status unavailable',e);return null;}
}
async function openSetting(method){
  const t=tracker();
  if(!t||typeof t[method]!=='function')return;
  try{await t[method]();}catch(e){console.warn('GPS settings open failed',method,e);}
}
async function ensureNotificationChannel(){
  const t=tracker();
  if(!t||typeof t.ensureNotificationChannel!=='function')return null;
  try{return await t.ensureNotificationChannel();}catch(e){console.warn('GPS notification channel bootstrap failed',e);return null;}
}
async function askOnce(key,message,method){
  const now=Date.now();
  if(lastPromptKey===key&&now-lastPromptAt<15000)return false;
  lastPromptKey=key;lastPromptAt=now;
  if(confirm(message)){await openSetting(method);return true;}
  return false;
}

const baseEnsure=(typeof window.v19EnsureNativePermissions==='function'&&window.v19EnsureNativePermissions)
  ||(typeof v19EnsureNativePermissions==='function'?v19EnsureNativePermissions:null);
async function strictEnsureNativePermissionsV2353(){
  if(!isAndroid()){
    if(baseEnsure)await baseEnsure();
    return true;
  }

  // v23.5.3.1: create the dedicated channel BEFORE any legacy/base permission check.
  // This removes the old deadlock: "channel absent -> block service -> service can never create channel".
  await ensureNotificationChannel();
  if(baseEnsure)await baseEnsure();

  let s=await nativeStatus();
  if(!s)return true;
  if(s.locationProviderEnabled===false){
    await askOnce('location-provider','На телефоне выключена геолокация Android.\n\nОткрыть настройки местоположения?','openLocationSettings');
    throw new Error('Включите геолокацию Android и снова нажмите «Начать рабочий день».');
  }
  if(s.fineLocationGranted===false){
    await askOnce('fine-location','Ресанта CRM не получила точное местоположение.\n\nОткрыть настройки приложения?','openAppSettings');
    throw new Error('Разрешите Ресанта CRM точное местоположение.');
  }
  if(s.backgroundLocationGranted===false){
    await askOnce('background-location','Для рабочего маршрута нужно разрешить местоположение «Всегда». Иначе Android может перестать передавать GPS, когда телефон в кармане.\n\nОткрыть настройки приложения?','openAppSettings');
    throw new Error('Разрешите: Местоположение → Разрешать всегда. После этого снова начните рабочий день.');
  }

  // Whole-app notification permission is a real blocker.
  if(s.notificationsEnabled===false||s.notificationPermissionGranted===false){
    await askOnce('notifications-off','Уведомления Ресанта CRM действительно отключены в Android. Без постоянного уведомления рабочий GPS не сможет надёжно работать.\n\nОткрыть настройки уведомлений?','openNotificationSettings');
    throw new Error('Включите уведомления Ресанта CRM, затем снова начните рабочий день.');
  }

  // A missing channel is NOT treated as disabled. New APK creates it itself.
  // For compatibility with the previous APK (which had no notificationChannelExists field),
  // do not block solely on notificationChannelEnabled=false when the app-wide permission is on.
  if(s.notificationChannelExists===false){
    await ensureNotificationChannel();
    s=await nativeStatus()||s;
  }
  if(s.notificationChannelExists===true&&s.notificationChannelEnabled===false){
    await askOnce('gps-channel-off','Канал «Рабочий GPS-маршрут» действительно отключён в Android.\n\nОткрыть настройки уведомлений?','openNotificationSettings');
    throw new Error('Включите канал «Рабочий GPS-маршрут», затем снова начните рабочий день.');
  }

  if(s.batteryUnrestricted===false){
    await askOnce('battery','Android ограничивает Ресанта CRM по батарее. Для надёжной записи маршрута установите для приложения режим «Без ограничений».\n\nОткрыть настройки батареи?','openBatterySettings');
    throw new Error('Установите для Ресанта CRM батарею «Без ограничений», затем снова начните рабочий день.');
  }
  lastPromptKey='';lastPromptAt=0;
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
  notificationChannelBootstrap:true,
  noMissingChannelLoop:true,
  repeatedPromptGuardMs:15000,
  requiresBackgroundLocation:true,
  requiresBatteryUnrestricted:true,
  truthfulBossStatus:true,
  routesUntouched:true,
  visitsUntouched:true,
  distanceUntouched:true
});
})();

// v23.5.8 no-cache bridge. This file itself is already loaded with Date.now() by the
// Yandex key-modal bridge, so the hard-stop reaches browsers even when an older
// index/14-routes asset is still cached.
(function loadGpsHardStopV2358(){
  if(window.RESANTA_GPS_HARD_STOP_V2358||document.querySelector('script[data-gps-hard-stop-v2358]'))return;
  const s=document.createElement('script');
  s.src='./assets/22-gps-hard-stop-v2358.js?_='+Date.now();
  s.async=false;
  s.dataset.gpsHardStopV2358='1';
  s.onerror=()=>console.warn('GPS hard-stop v23.5.8 failed to load; base GPS remains available.');
  document.head.appendChild(s);
})();
