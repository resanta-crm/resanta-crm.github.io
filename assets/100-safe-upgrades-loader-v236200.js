/* RESANTA CRM v23.6.200 · SAFE LAZY BUSINESS UPGRADES LOADER */
(function(){
'use strict';
if(window.RESANTA_SAFE_UPGRADES_LOADER_V236200)return;
const V='23.6.201',flights=new Map();
function active(id){const name=String(id||'').replace(/^page-/,'');return !!document.getElementById(id)?.classList.contains('active')||String(document.getElementById('app')?.dataset?.activePage||'')===name}
function load(path,guard){
 if(window[guard])return Promise.resolve(true);
 if(flights.has(path))return flights.get(path);
 const p=new Promise(resolve=>{
   const s=document.createElement('script');
   s.src='./'+path+'?v='+V;
   s.async=true;
   s.onload=()=>resolve(!!window[guard]);
   s.onerror=()=>{console.warn('SAFE '+V+' module failed',path);resolve(false)};
   document.head.appendChild(s);
 }).finally(()=>flights.delete(path));
 flights.set(path,p);return p;
}
function route(){
 try{
   if(active('page-vip')||active('page-debt'))load('assets/102-safe-vip-pdz-v236200.js','RESANTA_SAFE_VIP_PDZ_V236200');
   if(active('page-promotions'))load('assets/83-promotions-mo2-selector-v236123.js','RESANTA_PROMOTIONS_MO2_SELECTOR_V236123');
   if(active('page-triovist'))load('assets/104-safe-triovist-v236200.js','RESANTA_SAFE_TRIOVIST_V236200');
 }catch(e){console.warn('SAFE '+V+' route',e)}
}
function boot(){
 document.addEventListener('click',e=>{
   if(e.target.closest?.('.nav-item,.bn-item,[data-page],#tr14-shell [data-tr14]'))setTimeout(route,140);
 },true);
 window.addEventListener('hashchange',()=>setTimeout(route,80));
 route();
}
if(document.readyState==='complete')setTimeout(boot,0);else window.addEventListener('load',boot,{once:true});
window.RESANTA_SAFE_UPGRADES_LOADER_V236200=Object.freeze({version:V,lazy:true,noPolling:true});
})();