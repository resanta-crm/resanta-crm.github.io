/* RESANTA CRM v23.5.8 · GPS HARD STOP / NAVIGATION RESCUE
 * Root protection against GPS-control starving the rest of the CRM.
 * - leaving GPS-control immediately suspends all GPS-control UI work;
 * - old Yandex v23.5.1.x loops are neutralized outside GPS by temporarily hiding their key;
 * - Yandex is enabled only when a concrete workday is opened;
 * - navigation away from GPS gets a capture-phase rescue so the shell switches first;
 * - no GPS points, distance, visits, routes or business rules are changed.
 */
(function(){
'use strict';
if(window.RESANTA_GPS_HARD_STOP_V2358)return;
const VERSION='v23.5.8';
const OLD_KEY='resanta_yandex_maps_api_key_v2351';
const SAFE_KEY='resanta_yandex_maps_api_key_v2358';
let baseGoPage=null;
let installedOpen=false,installedRender=false,installedGo=false;

function gpsPage(){return document.getElementById('page-gps-control');}
function activeGps(){return !!gpsPage()?.classList.contains('active');}
function currentPage(){try{return document.getElementById('app')?.dataset?.activePage||'';}catch(_){return'';}}
function readOldKey(){try{return String(localStorage.getItem(OLD_KEY)||window.RESANTA_YANDEX_MAPS_API_KEY||'').trim();}catch(_){return String(window.RESANTA_YANDEX_MAPS_API_KEY||'').trim();}}
function readSafeKey(){try{return String(localStorage.getItem(SAFE_KEY)||'').trim();}catch(_){return'';}}
function rememberKey(){const k=readOldKey()||readSafeKey();if(!k)return'';try{localStorage.setItem(SAFE_KEY,k);}catch(_){}return k;}
function disableLegacyYandex(){
  const k=rememberKey();
  try{localStorage.removeItem(OLD_KEY);}catch(_){}
  try{delete window.RESANTA_YANDEX_MAPS_API_KEY;}catch(_){}
  try{document.querySelectorAll('#gps-yandex-overlay-v2351').forEach(x=>x.remove());}catch(_){}
  window.__RESANTA_GPS_BACKGROUND_SUSPENDED=true;
  return k;
}
function enableYandexForWorkday(){
  const k=readSafeKey()||readOldKey();
  if(k){try{localStorage.setItem(SAFE_KEY,k);localStorage.setItem(OLD_KEY,k);}catch(_){}window.RESANTA_YANDEX_MAPS_API_KEY=k;}
  window.__RESANTA_GPS_BACKGROUND_SUSPENDED=false;
  return k;
}
function prepareGpsPage(){
  // Do not start Yandex just because GPS-control shell is visible.
  // A concrete workday opener will restore the key.
  disableLegacyYandex();
  window.__RESANTA_GPS_BACKGROUND_SUSPENDED=false;
}
function suspendGps(){
  disableLegacyYandex();
  try{document.getElementById('gps-yandex-status-v2351')?.remove();}catch(_){}
  try{window.__RESANTA_GPS_UI_EPOCH=(Number(window.__RESANTA_GPS_UI_EPOCH)||0)+1;}catch(_){}
}

function parseNav(btn){
  const raw=String(btn?.getAttribute?.('onclick')||'');
  let m=raw.match(/goPage\(\s*['\"]([^'\"]+)['\"]\s*,\s*['\"]([^'\"]*)['\"]/i);
  if(!m)m=raw.match(/goPage\(\s*['\"]([^'\"]+)['\"]/i);
  return m?{page:m[1],title:m[2]||String(btn.textContent||'').trim()}:null;
}
function fastShellSwitch(page,title,btn){
  try{
    const app=document.getElementById('app');if(app)app.dataset.activePage=page;
    window.__crmNavEpoch=(Number(window.__crmNavEpoch)||0)+1;
    document.querySelectorAll('.page.active').forEach(x=>x.classList.remove('active'));
    document.getElementById('page-'+page)?.classList.add('active');
    document.querySelectorAll('.nav-item.active,.bn-item.active').forEach(x=>x.classList.remove('active'));
    btn?.classList?.add('active');
    if(title){const t=document.querySelector('.topbar-title');if(t)t.textContent=title;}
    const main=document.querySelector('.main');if(main)main.scrollTop=0;
  }catch(e){console.warn('GPS '+VERSION+' shell switch',e);}
}

function installGoPageGuard(){
  if(installedGo)return true;
  let base=null;try{base=window.goPage||(typeof goPage==='function'?goPage:null);}catch(_){}
  if(typeof base!=='function')return false;
  baseGoPage=base;
  const wrapped=function(p,title){
    if(String(p)==='gps-control')prepareGpsPage();else if(activeGps()||currentPage()==='gps-control')suspendGps();
    return base.apply(this,arguments);
  };
  wrapped.__gpsHardStopV2358=true;wrapped.__base=base;
  window.goPage=wrapped;try{goPage=wrapped;}catch(_){}
  installedGo=true;return true;
}

function installOpenGuard(){
  if(installedOpen)return true;
  let base=null;try{base=window.v19OpenGpsWorkday||(typeof v19OpenGpsWorkday==='function'?v19OpenGpsWorkday:null);}catch(_){}
  if(typeof base!=='function')return false;
  const wrapped=async function(id){
    if(!activeGps()||window.__RESANTA_GPS_BACKGROUND_SUSPENDED)return;
    if(!id)return;
    enableYandexForWorkday();
    const epoch=Number(window.__RESANTA_GPS_UI_EPOCH)||0;
    const out=await base.apply(this,arguments);
    if(!activeGps()||epoch!==(Number(window.__RESANTA_GPS_UI_EPOCH)||0)){suspendGps();return out;}
    return out;
  };
  wrapped.__gpsHardStopV2358=true;wrapped.__base=base;
  window.v19OpenGpsWorkday=wrapped;try{v19OpenGpsWorkday=wrapped;}catch(_){}
  installedOpen=true;return true;
}
function installRenderGuard(){
  if(installedRender)return true;
  let base=null;try{base=window.v19RenderGpsControl||(typeof v19RenderGpsControl==='function'?v19RenderGpsControl:null);}catch(_){}
  if(typeof base!=='function')return false;
  const wrapped=async function(){
    if(!activeGps()||window.__RESANTA_GPS_BACKGROUND_SUSPENDED)return;
    const epoch=Number(window.__RESANTA_GPS_UI_EPOCH)||0;
    const out=await base.apply(this,arguments);
    if(!activeGps()||epoch!==(Number(window.__RESANTA_GPS_UI_EPOCH)||0))return out;
    return out;
  };
  wrapped.__gpsHardStopV2358=true;wrapped.__base=base;
  window.v19RenderGpsControl=wrapped;try{v19RenderGpsControl=wrapped;}catch(_){}
  installedRender=true;return true;
}

// Run before inline onclick. If GPS has made its own page heavy, switch the shell first,
// then let the normal CRM navigation/render run on the next task.
document.addEventListener('click',e=>{
  const btn=e.target?.closest?.('.nav-item,.bn-item');if(!btn)return;
  const nav=parseNav(btn);if(!nav)return;
  if(nav.page==='gps-control'){prepareGpsPage();return;}
  if(!activeGps()&&currentPage()!=='gps-control')return;
  e.preventDefault();e.stopPropagation();if(typeof e.stopImmediatePropagation==='function')e.stopImmediatePropagation();
  suspendGps();fastShellSwitch(nav.page,nav.title,btn);
  const go=baseGoPage||window.goPage;
  if(typeof go==='function')setTimeout(()=>{try{go(nav.page,nav.title);}catch(err){console.error('GPS '+VERSION+' deferred navigation failed',err);}},35);
},true);

document.addEventListener('pointerdown',e=>{
  const btn=e.target?.closest?.('.nav-item,.bn-item');if(!btn)return;
  const nav=parseNav(btn);if(nav&&nav.page!=='gps-control'&&(activeGps()||currentPage()==='gps-control'))suspendGps();
},true);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')suspendGps();});
window.addEventListener('pagehide',suspendGps);

function install(){
  rememberKey();
  if(!activeGps())suspendGps();else prepareGpsPage();
  installGoPageGuard();installOpenGuard();installRenderGuard();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});else setTimeout(install,0);
setTimeout(install,350);setTimeout(install,1000);setTimeout(install,2200);setTimeout(install,5000);

window.RESANTA_GPS_HARD_STOP_V2358=Object.freeze({
  version:VERSION,
  navigationRescue:true,
  gpsUiActivePageOnly:true,
  yandexKeyParkedOutsideGps:true,
  yandexStartsOnConcreteWorkday:true,
  noGpsDataChanges:true,
  noRouteBusinessChanges:true
});
})();
