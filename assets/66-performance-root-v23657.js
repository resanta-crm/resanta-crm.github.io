/* RESANTA CRM v23.6.57 · PERFORMANCE ROOT
 * Page-scoped lazy modules only.
 * Hidden sections do zero optional work at startup.
 * No cache-busting Date.now() on ordinary module loads.
 * No business data writes.
 */
(function(){
'use strict';
if(window.RESANTA_PERFORMANCE_ROOT_V23657)return;
const V='23.6.62', flights=new Map();
function activePage(){try{return typeof crmActivePage==='function'?crmActivePage():(document.getElementById('app')?.dataset?.activePage||'')}catch(_){return''}}
function loaded(guard){return guard&&!!window[guard]}
function load(path,marker,guard){
  if(loaded(guard))return Promise.resolve(true);
  const key=path;if(flights.has(key))return flights.get(key);
  const existing=document.querySelector('script[data-'+marker+']');
  if(existing){
    const p=new Promise(resolve=>{
      if(loaded(guard))resolve(true);
      else{
        existing.addEventListener('load',()=>resolve(true),{once:true});
        existing.addEventListener('error',()=>resolve(false),{once:true});
      }
    });
    flights.set(key,p);return p.finally(()=>flights.delete(key));
  }
  const p=new Promise(resolve=>{
    const s=document.createElement('script');
    s.src='./'+path+'?v='+V;
    s.async=true;
    s.dataset[marker.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]='1';
    s.onload=()=>resolve(true);
    s.onerror=()=>{console.warn('PERF '+V+' module failed:',path);resolve(false)};
    document.head.appendChild(s);
  });
  flights.set(key,p);return p.finally(()=>flights.delete(key));
}
async function loadTriovist(){
  await Promise.all([
    load('assets/11-triovist-ai-plans-v2348.js','perf-tri-ai-v23657','RESANTA_TRIOVIST_AI_PLANS_V2348'),
    load('assets/13-triovist-seasonal-stock-v2350.js','perf-tri-stock-v23657','RESANTA_TRIOVIST_SEASONAL_STOCK_V2350'),
    load('assets/32-triovist-v23611.js','perf-tri-root-v23657','RESANTA_TRIOVIST_ROOT_V23614'),
    load('assets/61-triovist-task-month-safe-v23651.js','perf-tri-month-v23657','RESANTA_TRIOVIST_TASK_MONTH_SAFE_V23651')
  ]);
  await load('assets/19-triovist-stock-upload-truth-v23551.js','perf-tri-upload-v23657','RESANTA_TRIOVIST_STOCK_UPLOAD_TRUTH_V23551');
  await load('assets/20-triovist-partner-forecast-v2356.js','perf-tri-forecast-v23657','RESANTA_TRIOVIST_PARTNER_FORECAST_V2356');
}
async function loadPromotions(){
  await load('assets/25-promotions-boss-substitute-v2363.js','perf-promo-flow-v23657','RESANTA_PROMOTIONS_BOSS_SUBSTITUTE_V2363');
  await load('assets/63-promotions-management-v23654.js','perf-promo-management-v23657','RESANTA_PROMOTIONS_MANAGEMENT_V23654');
  await load('assets/65-promotions-close-v23656.js','perf-promo-close-v23657','RESANTA_PROMOTIONS_CLOSE_V23656');
}
async function loadRoutes(){
  await Promise.all([
    load('assets/14-routes-yandex-ui-v2351.js','perf-routes-yandex-v23657','RESANTA_ROUTES_YANDEX_UI_V2351'),
    load('assets/15-routes-yandex-key-modal-v23511.js','perf-routes-key-v23657','RESANTA_YANDEX_KEY_MODAL_V23511'),
    load('assets/33-triovist-shell-guard-v23613.js','perf-route-tabs-v23657','RESANTA_ROUTE_MONTH_TABS_SYNC_V23635')
  ]);
}

function paymentProfile(){try{return typeof currentProfile!=='undefined'?currentProfile:(window.currentProfile||null)}catch(_){return window.currentProfile||null}}
function paymentEligible(){
  const p=paymentProfile(),r=String(p?.role||'').toLowerCase(),e=String(p?.email||'').toLowerCase();
  return r==='boss'||r==='office_manager'||e==='payushin_ar@resanta.ru'||e==='sidarovich_kn@resanta.ru';
}
async function loadPaymentRegistry(){
  if(!paymentEligible())return false;
  const p=paymentProfile(),r=String(p?.role||'').toLowerCase();
  await load('assets/38-payment-registry-v23623.js','perf-payment-registry-v23658','RESANTA_PAYMENT_REGISTRY_V23623');
  if(r==='office_manager'||String(p?.access_scope||'').toLowerCase()==='payments_only'){
    await load('assets/39-office-manager-payments-only-v23624.js','perf-office-payments-v23658','RESANTA_OFFICE_MANAGER_PAYMENTS_ONLY_V23624');
  }
  await load('assets/42-payment-registry-nav-root-v23627.js','perf-payment-nav-v23658','RESANTA_PAYMENT_REGISTRY_NAV_ROOT_V23627');
  return true;
}
function maybeLoadPaymentRegistry(){if(paymentEligible())loadPaymentRegistry().catch(e=>console.warn('PERF '+V+' payment registry',e))}
async function loadForPage(page){
  const p=String(page||activePage()||'');
  try{
    if(p==='triovist')return await loadTriovist();
    if(p==='promotions'||p==='budgets')return await loadPromotions();
    if(p==='payment-registry')return await loadPaymentRegistry();
    if(p==='payments'||p==='debt')return await load('assets/12-finance-data-root-v2349.js','perf-finance-v23657','RESANTA_FINANCE_DATA_ROOT_V2349');
    if(p==='managers'){await load('assets/07-ai-manager-plans.js','perf-manager-ai-v23657','RESANTA_AI_MANAGER_PLANS_V2320');await load('assets/08-manager-gap-sources.js','perf-manager-gap-v23657','RESANTA_MANAGER_GAP_SOURCES_V2322');return await load('assets/10-manager-plans-root-v2330.js','perf-manager-plans-v23657','RESANTA_MANAGER_PLANS_ROOT_V2330');}
    if(p==='sales')return await load('assets/49-manager-sales-yoy-v23634.js','perf-manager-yoy-v23657','RESANTA_MANAGER_SALES_YOY_V23634');
    if(['routes-boss','my-routes','route','gps-control','workday'].includes(p))return await loadRoutes();
  }catch(e){console.warn('PERF '+V+' lazy page '+p,e)}
  return true;
}
const baseOpen=window.crmUltraPageOpenedV22734;
window.crmUltraPageOpenedV22734=function(page,epoch){
  const out=typeof baseOpen==='function'?baseOpen.apply(this,arguments):undefined;
  setTimeout(()=>loadForPage(page),0);
  return out;
};
/* goPage() no longer calls crmUltraPageOpenedV22734. The real navigation hook is
 * crmResponsivePageOpenedV227325, so optional page modules must attach there too. */
const baseResponsiveOpen=window.crmResponsivePageOpenedV227325;
window.crmResponsivePageOpenedV227325=function(page,epoch){
  const out=typeof baseResponsiveOpen==='function'?baseResponsiveOpen.apply(this,arguments):undefined;
  setTimeout(()=>loadForPage(page),0);
  return out;
};
window.crmPerformanceLoadPageV23657=loadForPage;
function boot(){
  setTimeout(()=>loadForPage(activePage()),0);
  [120,450,1000,2200,4500].forEach(ms=>setTimeout(maybeLoadPaymentRegistry,ms));
  try{
    const d=typeof db!=='undefined'?db:window.db;
    d?.auth?.onAuthStateChange?.(()=>setTimeout(maybeLoadPaymentRegistry,0));
  }catch(_){}
}
window.addEventListener('pageshow',()=>setTimeout(maybeLoadPaymentRegistry,0));
window.addEventListener('focus',()=>setTimeout(maybeLoadPaymentRegistry,0));
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.RESANTA_PERFORMANCE_ROOT_V23657=Object.freeze({
  version:'v23.6.62',pageScopedModules:true,controlHiddenNoLoad:true,noDateNowCacheBust:true,
  paymentRegistryLazy:true,officeManagerPaymentsOnly:true,noBusinessLogicChanges:true
});
})();