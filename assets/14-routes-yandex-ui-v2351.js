/* RESANTA CRM v23.5.1.2 · ROUTES TOP SEARCH + YANDEX MAP LIFECYCLE
 * Safe additive layer:
 * - keeps the existing boss route search at the top without changing filter logic;
 * - overlays Yandex Maps JS API 2.1 only on the currently opened GPS route;
 * - destroys/recreates the Yandex map when manager/day changes and CRM replaces the map DOM;
 * - keeps Leaflet/OpenStreetMap as a fallback;
 * - reuses existing GPS route/stops so route/GPS business logic is untouched.
 */
(function(){
'use strict';
if(window.RESANTA_ROUTES_YANDEX_UI_V2351)return;

const VERSION='v23.5.1.2';
const KEY_STORAGE='resanta_yandex_maps_api_key_v2351';
const OVERLAY_ID='gps-yandex-overlay-v2351';
const STATUS_ID='gps-yandex-status-v2351';
const SEARCH_SHELL_ID='rb-search-top-v2351';
let ymapsPromise=null;
let ymap=null;
let mapHost=null;
let yObjects=[];
let installedButtons=false;
let lastWorkday='';
let lastFingerprint='';
let syncTimer=null;
let originalFit=window.v2273214GpsFitAll;
let originalCurrent=window.v2273214GpsGoCurrent;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number(v);
const finite=v=>Number.isFinite(Number(v));

function isBoss(){
  try{return String(window.currentProfile?.role||'')==='boss';}catch(_){return false;}
}
function key(){
  try{return String(window.RESANTA_YANDEX_MAPS_API_KEY||localStorage.getItem(KEY_STORAGE)||'').trim();}
  catch(_){return String(window.RESANTA_YANDEX_MAPS_API_KEY||'').trim();}
}
function clearKey(){
  try{localStorage.removeItem(KEY_STORAGE);}catch(_){}
  try{delete window.RESANTA_YANDEX_MAPS_API_KEY;}catch(_){}
  location.reload();
}
window.resantaClearYandexMapsKeyV2351=clearKey;
// v23.5.1.1 replaces this with the CRM modal. This fallback is only for a failed modal load.
window.resantaSetYandexMapsKeyV2351=function(){
  if(typeof window.resantaOpenYandexKeyModalV23511==='function')return window.resantaOpenYandexKeyModalV23511();
  alert('Окно подключения Яндекс Карт ещё загружается. Повторите через секунду.');
};

function installTopSearch(){
  const page=document.getElementById('page-routes-boss');
  const input=document.getElementById('rb-search');
  if(!page||!input)return false;
  const wrap=input.closest('.search-wrap');
  if(!wrap)return false;
  let shell=document.getElementById(SEARCH_SHELL_ID);
  if(!shell){
    shell=document.createElement('div');
    shell.id=SEARCH_SHELL_ID;
    shell.style.cssText='position:sticky;top:56px;z-index:35;background:rgba(249,250,251,.97);backdrop-filter:blur(8px);padding:8px 0 10px;margin:-4px 0 8px;display:flex;gap:8px;align-items:center';
    const title=page.querySelector('.page-title');
    if(title)title.insertAdjacentElement('afterend',shell);else page.prepend(shell);
    const btn=document.createElement('button');
    btn.type='button';btn.className='btn-secondary';btn.style.cssText='white-space:nowrap;padding:9px 14px';btn.textContent='🔍 Поиск';
    btn.addEventListener('click',()=>{input.focus();try{input.select()}catch(_){}});
    shell.appendChild(btn);
  }
  if(wrap.parentElement!==shell){wrap.style.cssText='margin:0;flex:1;min-width:220px';shell.appendChild(wrap);}
  return true;
}

function mapRoot(){return document.getElementById('gps-control-map');}
function activeMapFor(root=mapRoot()){
  if(!root||!ymap||mapHost!==root||!root.isConnected)return false;
  const overlay=root.querySelector('#'+OVERLAY_ID);
  return !!(overlay&&overlay.isConnected&&overlay.parentElement===root);
}
function statusBox(root){
  if(!root)return null;
  let box=document.getElementById(STATUS_ID);
  if(box&&box.parentElement!==root.parentElement){try{box.remove()}catch(_){}box=null;}
  if(!box){
    box=document.createElement('div');box.id=STATUS_ID;
    box.style.cssText='margin:8px 0 8px;padding:8px 10px;border-radius:9px;font-size:12px;line-height:1.45';
    root.insertAdjacentElement('beforebegin',box);
  }
  return box;
}
function paintStatus(message='',bad=false,root=mapRoot()){
  const box=statusBox(root);if(!box)return;
  const hasKey=!!key(),active=activeMapFor(root);
  if(message){
    box.style.background=bad?'#FEF2F2':'#EFF6FF';box.style.border='1px solid '+(bad?'#FECACA':'#BFDBFE');box.style.color=bad?'#991B1B':'#1E3A8A';
    box.innerHTML=esc(message)+(isBoss()?' <button class="btn-secondary" style="padding:5px 9px;margin-left:6px" onclick="resantaSetYandexMapsKeyV2351()">Ключ Яндекс Карт</button>':'');
    return;
  }
  if(!hasKey){
    box.style.background='#FFFBEB';box.style.border='1px solid #FDE68A';box.style.color='#92400E';
    box.innerHTML='<b>Яндекс Карты готовы к подключению.</b> Нужен официальный API-ключ JavaScript API.'+(isBoss()?' <button class="btn-secondary" style="padding:5px 9px;margin-left:6px" onclick="resantaSetYandexMapsKeyV2351()">Подключить Яндекс Карты</button>':'');
    return;
  }
  if(!active){
    box.style.background='#EFF6FF';box.style.border='1px solid #BFDBFE';box.style.color='#1E3A8A';
    box.innerHTML='<b>Ключ Яндекс Карт сохранён.</b> Подключаю карту к открытому маршруту…'+(isBoss()?' <button class="btn-secondary" style="padding:5px 9px;margin-left:6px" onclick="resantaSetYandexMapsKeyV2351()">Сменить ключ</button>':'');
    return;
  }
  box.style.background='#F0FDF4';box.style.border='1px solid #BBF7D0';box.style.color='#166534';
  box.innerHTML='<b>Яндекс Карты включены.</b> Маршрут, GPS и номера остановок берутся из действующей CRM-логики.'+(isBoss()?' <button class="btn-secondary" style="padding:5px 9px;margin-left:6px" onclick="resantaSetYandexMapsKeyV2351()">Сменить ключ</button>':'');
}

function ensureYandex(){
  if(window.ymaps&&typeof window.ymaps.Map==='function')return Promise.resolve(window.ymaps);
  const apiKey=key();
  if(!apiKey)return Promise.reject(new Error('Для Яндекс Карт нужен API-ключ'));
  if(ymapsPromise)return ymapsPromise;
  ymapsPromise=new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-resanta-yandex-v2351]');
    if(existing){
      const started=Date.now();
      const wait=()=>{
        if(window.ymaps){window.ymaps.ready(()=>resolve(window.ymaps));return;}
        if(Date.now()-started>15000){reject(new Error('Яндекс Карты не загрузились за 15 секунд'));return;}
        setTimeout(wait,100);
      };
      wait();return;
    }
    const s=document.createElement('script');s.async=true;s.dataset.resantaYandexV2351='1';
    s.src='https://api-maps.yandex.ru/2.1/?apikey='+encodeURIComponent(apiKey)+'&lang=ru_RU';
    s.onload=()=>{if(!window.ymaps){reject(new Error('API Яндекс Карт загрузился без объекта ymaps'));return;}window.ymaps.ready(()=>resolve(window.ymaps));};
    s.onerror=()=>reject(new Error('Не удалось загрузить API Яндекс Карт. Проверьте ключ и ограничение по домену.'));
    document.head.appendChild(s);
  }).catch(e=>{ymapsPromise=null;throw e;});
  return ymapsPromise;
}

function destroyMapInstance(){
  if(ymap){try{ymap.destroy()}catch(e){console.warn('Yandex map destroy',e);}}
  if(mapHost){try{mapHost.querySelector('#'+OVERLAY_ID)?.remove()}catch(_){} }
  ymap=null;mapHost=null;yObjects=[];lastWorkday='';lastFingerprint='';
}
function ensureOverlay(root){
  if(!root)return null;
  if(mapHost&&mapHost!==root)destroyMapInstance();
  if(getComputedStyle(root).position==='static')root.style.position='relative';
  let overlay=root.querySelector('#'+OVERLAY_ID);
  if(!overlay){
    overlay=document.createElement('div');overlay.id=OVERLAY_ID;
    overlay.style.cssText='position:absolute;inset:0;z-index:1200;background:#eef2f6;border-radius:inherit;overflow:hidden';
    root.appendChild(overlay);
  }
  return overlay;
}
function ensureMapInstance(center,root){
  const overlay=ensureOverlay(root);if(!overlay)return false;
  if(!ymap||mapHost!==root){
    if(ymap)destroyMapInstance();
    const freshOverlay=ensureOverlay(root);if(!freshOverlay)return false;
    ymap=new window.ymaps.Map(freshOverlay,{center:center||[55.19,30.20],zoom:13,controls:['zoomControl','typeSelector','fullscreenControl']},{suppressMapOpenBlock:true,yandexMapDisablePoiInteractivity:false});
    mapHost=root;
  }else{try{ymap.container.fitToViewport()}catch(_){} }
  return true;
}

function ll(v){
  if(!v)return null;
  const lat=finite(v.lat)?n(v.lat):(typeof v.lat==='function'?n(v.lat()):NaN);
  const lng=finite(v.lng)?n(v.lng):(typeof v.lng==='function'?n(v.lng()):NaN);
  return Number.isFinite(lat)&&Number.isFinite(lng)?[lat,lng]:null;
}
function flattenLatLngs(raw,out=[]){
  if(!raw)return out;
  if(Array.isArray(raw))for(const x of raw){const p=ll(x);if(p)out.push(p);else if(Array.isArray(x))flattenLatLngs(x,out);}
  return out;
}
function leafletLayers(){try{return window._v2273214GpsLayer?.getLayers?.()||[];}catch(_){return[];}}
function routeSegments(){
  const layers=leafletLayers();let segs=[];
  for(const layer of layers){
    if(typeof layer?.getLatLngs!=='function')continue;
    const color=String(layer?.options?.color||'').toLowerCase();
    if(color&&color!=='#1666d3'&&color!=='rgb(22, 102, 211)')continue;
    const pts=flattenLatLngs(layer.getLatLngs());if(pts.length>1)segs.push(pts);
  }
  if(!segs.length)for(const layer of layers){if(typeof layer?.getLatLngs!=='function')continue;const pts=flattenLatLngs(layer.getLatLngs());if(pts.length>1)segs.push(pts);}
  const seen=new Set();return segs.filter(s=>{const sig=s.length+'|'+s[0].join(',')+'|'+s[s.length-1].join(',');if(seen.has(sig))return false;seen.add(sig);return true;});
}
function businessStops(){try{return Object.values(window._v2273214StopIndex||{}).filter(x=>finite(x?.lat)&&finite(x?.lng));}catch(_){return[];}}
function planStops(){
  const result=[];
  for(const layer of leafletLayers()){
    try{
      const icon=layer?._icon;if(!icon?.querySelector?.('.v2273214-plan-marker'))continue;
      const p=ll(layer.getLatLng?.());if(!p)continue;
      const raw=layer.getTooltip?.()?.getContent?.()||'План';result.push({lat:p[0],lng:p[1],label:String(raw).replace(/^План:\s*/i,'')});
    }catch(_){}
  }
  return result;
}
function allBounds(segs,stops,plans){
  const out=[];segs.forEach(s=>s.forEach(p=>out.push(p)));stops.forEach(x=>out.push([n(x.lat),n(x.lng)]));plans.forEach(x=>out.push([n(x.lat),n(x.lng)]));
  const last=window._v2273214GpsLast;if(finite(last?.lat)&&finite(last?.lng))out.push([n(last.lat),n(last.lng)]);return out;
}
function stopPreset(x){
  if(x?.kind==='client'&&x?.confidence==='high')return x?.visitSaved?'islands#greenCircleIcon':'islands#orangeCircleIcon';
  if(x?.kind==='client'&&x?.confidence!=='high')return'islands#blueCircleIcon';
  return'islands#orangeCircleIcon';
}
function addObject(obj){ymap.geoObjects.add(obj);yObjects.push(obj);}
function clearObjects(){if(!ymap)return;try{ymap.geoObjects.removeAll()}catch(_){}yObjects=[];}
function addRoute(segs){for(const coords of segs)addObject(new window.ymaps.Polyline(coords,{}, {strokeColor:'#1666d3',strokeWidth:5,strokeOpacity:.95}));}
function addStops(stops){
  for(const x of stops){
    const placemark=new window.ymaps.Placemark([n(x.lat),n(x.lng)],{iconContent:String(x.actualNo||'•'),hintContent:'№'+String(x.actualNo||'')+' · '+String(x.client?.name||x.client_name||'остановка')},{preset:stopPreset(x)});
    addObject(placemark);placemark.events.add('click',()=>window.v2273214SelectStop?.(x.id));
  }
}
function addPlans(plans){for(const p of plans)addObject(new window.ymaps.Placemark([p.lat,p.lng],{hintContent:'План: '+p.label},{preset:'islands#grayCircleDotIcon'}));}
function addCurrent(){const p=window._v2273214GpsLast;if(finite(p?.lat)&&finite(p?.lng))addObject(new window.ymaps.Placemark([n(p.lat),n(p.lng)],{hintContent:'МПП сейчас / последняя точка'},{preset:'islands#redCircleDotIcon'}));}
function fit(bounds){
  if(!ymap||!bounds.length)return;
  if(bounds.length===1){ymap.setCenter(bounds[0],16,{duration:0});return;}
  let minLat=90,maxLat=-90,minLng=180,maxLng=-180;
  for(const p of bounds){minLat=Math.min(minLat,p[0]);maxLat=Math.max(maxLat,p[0]);minLng=Math.min(minLng,p[1]);maxLng=Math.max(maxLng,p[1]);}
  try{ymap.setBounds([[minLat,minLng],[maxLat,maxLng]],{checkZoomRange:true,zoomMargin:35,duration:0})}catch(_){}
}
function fingerprint(segs,stops,plans){
  return[String(window._v2273214MapWorkdayId||''),segs.reduce((s,x)=>s+x.length,0),stops.map(x=>String(x.id)+':'+String(x.actualNo)+':'+n(x.lat).toFixed(5)+':'+n(x.lng).toFixed(5)).join('|'),plans.map(x=>n(x.lat).toFixed(5)+':'+n(x.lng).toFixed(5)).join('|'),window._v2273214GpsLast?JSON.stringify(window._v2273214GpsLast):''].join('~');
}

async function syncYandex(forceFit=false){
  const requestedRoot=mapRoot();
  if(!requestedRoot){if(mapHost&&!mapHost.isConnected)destroyMapInstance();return false;}
  if(mapHost&&mapHost!==requestedRoot)destroyMapInstance();
  if(!key()){paintStatus('',false,requestedRoot);return false;}
  if(!activeMapFor(requestedRoot))paintStatus('',false,requestedRoot);
  try{await ensureYandex();}catch(e){paintStatus('Яндекс Карты не подключены: '+String(e?.message||e),true,requestedRoot);return false;}
  // The user may switch manager/day while the API is loading. Never bind to a stale DOM node.
  if(mapRoot()!==requestedRoot||!requestedRoot.isConnected){scheduleSync(true);return false;}
  const segs=routeSegments(),stops=businessStops(),plans=planStops();
  const bounds=allBounds(segs,stops,plans),center=bounds[bounds.length-1]||[55.19,30.20];
  if(!ensureMapInstance(center,requestedRoot))return false;
  const fp=fingerprint(segs,stops,plans),workday=String(window._v2273214MapWorkdayId||'');
  if(fp!==lastFingerprint||forceFit){
    clearObjects();addRoute(segs);addPlans(plans);addStops(stops);addCurrent();
    const changed=workday&&workday!==lastWorkday;if(forceFit||!lastFingerprint||changed)fit(bounds);
    lastWorkday=workday;lastFingerprint=fp;
  }
  try{ymap.container.fitToViewport()}catch(_){}
  paintStatus('',false,requestedRoot);return true;
}
function scheduleSync(forceFit=false){clearTimeout(syncTimer);syncTimer=setTimeout(()=>syncYandex(forceFit),120);}

function wrapButtons(){
  if(installedButtons)return;installedButtons=true;
  originalFit=window.v2273214GpsFitAll;originalCurrent=window.v2273214GpsGoCurrent;
  window.v2273214GpsFitAll=function(){
    const root=mapRoot();
    if(activeMapFor(root)){const segs=routeSegments(),stops=businessStops(),plans=planStops();fit(allBounds(segs,stops,plans));return;}
    return originalFit?.apply(this,arguments);
  };
  window.v2273214GpsGoCurrent=function(){
    const root=mapRoot(),p=window._v2273214GpsLast;
    if(activeMapFor(root)&&finite(p?.lat)&&finite(p?.lng)){ymap.setCenter([n(p.lat),n(p.lng)],17,{duration:0});return;}
    return originalCurrent?.apply(this,arguments);
  };
}
function observe(){
  const mo=new MutationObserver(()=>{
    installTopSearch();
    const root=mapRoot();
    if(key()&&root&&root!==mapHost)scheduleSync(true);
    else if(mapHost&&!mapHost.isConnected)scheduleSync(true);
  });
  mo.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('resize',()=>{try{if(activeMapFor())ymap.container.fitToViewport()}catch(_){}});
  setInterval(()=>{
    installTopSearch();
    const root=mapRoot();
    if(mapHost&&(!mapHost.isConnected||mapHost!==root))destroyMapInstance();
    if(root)scheduleSync(false);
  },1500);
}
function install(){
  installTopSearch();wrapButtons();observe();
  if(mapRoot())scheduleSync(true);
  window.RESANTA_ROUTES_YANDEX_UI_V2351=Object.freeze({
    version:VERSION,
    searchMovedTop:true,
    yandexOfficialApi:true,
    yandexRequiresApiKey:true,
    oneActiveYandexMap:true,
    recreatesOnRouteDomChange:true,
    greenStatusOnlyWhenMapActive:true,
    leafletFallbackPreserved:true,
    gpsBusinessLogicUntouched:true,
    routeBusinessLogicUntouched:true
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
