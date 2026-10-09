/* RESANTA CRM v23.6.200 · SAFE LAZY BUSINESS UPGRADES LOADER */
(function(){
'use strict';
if(window.RESANTA_SAFE_UPGRADES_LOADER_V236200)return;
const V='23.6.284',flights=new Map();
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
   if(active('page-debt')){load('assets/102-safe-vip-pdz-v236200.js','RESANTA_SAFE_VIP_PDZ_V236200');load('assets/113-pdz-control-v236275.js','RESANTA_PDZ_CONTROL_V236277');}
   if(active('page-promotions'))load('assets/83-promotions-mo2-selector-v236123.js','RESANTA_PROMOTIONS_MO2_SELECTOR_V236123');
   if(active('page-triovist')){load('assets/104-safe-triovist-v236200.js','RESANTA_SAFE_TRIOVIST_V236200');load('assets/106-triovist-competitors-v236218.js','RESANTA_TRIOVIST_COMPETITORS_V236218');load('assets/107-triovist-auth-export-v236221.js','RESANTA_TRIOVIST_AUTH_EXPORT_V236221');load('assets/108-triovist-plan-server-v236231.js','RESANTA_TRIOVIST_PLAN_SERVER_V236231');load('assets/109-triovist-task-target-v236232.js','RESANTA_TRIOVIST_TASK_TARGET_EDITOR_V236232');load('assets/111-triovist-db-queue-v236251.js','RESANTA_TRIOVIST_DB_QUEUE_V236251');}
   if(active('page-markdown'))load('assets/110-markdown-service-sales-v236233.js','RESANTA_MARKDOWN_SERVICE_SALES_V236233');
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