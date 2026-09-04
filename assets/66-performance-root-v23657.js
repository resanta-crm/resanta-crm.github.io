/* RESANTA CRM v23.6.68 · MODULE CONTRACT ROOT
 * Explicit page-scoped module contracts.
 * Fixes the hidden dependency chain where unrelated business modules were
 * accidentally loaded through the old GPS bridge.
 * No business data writes. No polling. No MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_PERFORMANCE_ROOT_V23657)return;

const V='23.6.68',flights=new Map(),contractFlights=new Map();

function activePage(){
  try{return typeof crmActivePage==='function'?crmActivePage():(document.getElementById('app')?.dataset?.activePage||'')}
  catch(_){return''}
}
function profile(){
  try{return typeof currentProfile!=='undefined'?currentProfile:(window.currentProfile||null)}
  catch(_){return window.currentProfile||null}
}
function isBoss(){
  const p=profile(),r=String(p?.role||'').toLowerCase(),e=String(p?.email||'').toLowerCase();
  return r==='boss'||e==='payushin_ar@resanta.ru';
}
function loaded(guard){return !!(guard&&window[guard])}
function attrName(marker){return 'data-'+marker}
function load(path,marker,guard){
  if(loaded(guard))return Promise.resolve(true);
  if(flights.has(path))return flights.get(path);
  const selector='script['+attrName(marker)+']';
  const file=path.split('/').pop();
  const existing=document.querySelector(selector)||[...document.scripts].find(s=>String(s.src||'').includes('/'+file));
  if(existing){
    const p=new Promise(resolve=>{
      if(loaded(guard)){resolve(true);return}
      let done=false;
      const finish=ok=>{if(done)return;done=true;resolve(ok)};
      existing.addEventListener('load',()=>finish(loaded(guard)||true),{once:true});
      existing.addEventListener('error',()=>finish(false),{once:true});
      setTimeout(()=>finish(loaded(guard)),2500);
    });
    flights.set(path,p);
    return p.finally(()=>flights.delete(path));
  }
  const p=new Promise(resolve=>{
    const s=document.createElement('script');
    s.src='./'+path+'?v='+V;
    s.async=true;
    s.setAttribute(attrName(marker),'1');
    s.onload=()=>resolve(loaded(guard)||true);
    s.onerror=()=>{console.warn('ROOT '+V+' module failed:',path);resolve(false)};
    document.head.appendChild(s);
  });
  flights.set(path,p);
  return p.finally(()=>flights.delete(path));
}
async function serial(items){
  for(const x of items){
    const ok=await load(x.path,x.marker,x.guard);
    if(!ok&&!loaded(x.guard))throw new Error('Не загрузился модуль '+x.path);
  }
  return true;
}
function onceContract(key,fn){
  if(contractFlights.has(key))return contractFlights.get(key);
  const p=Promise.resolve().then(fn).finally(()=>contractFlights.delete(key));
  contractFlights.set(key,p);return p;
}

const CONTRACT={
  promotions:[
    {path:'assets/25-promotions-boss-substitute-v2363.js',marker:'perf-promo-flow-v23668',guard:'RESANTA_PROMOTIONS_BOSS_SUBSTITUTE_V2363'},
    {path:'assets/41-promotions-work-filter-v23626.js',marker:'perf-promo-work-v23668',guard:'RESANTA_PROMOTIONS_WORK_FILTER_V23626'},
    {path:'assets/45-promotions-budget-truth-v23630.js',marker:'perf-promo-budget-truth-v23668',guard:'RESANTA_PROMOTIONS_BUDGET_TRUTH_V23630'},
    {path:'assets/46-promotions-budget-dfs-override-v23631.js',marker:'perf-promo-budget-override-v23668',guard:'RESANTA_PROMOTIONS_BUDGET_DFS_OVERRIDE_V23631'},
    {path:'assets/47-promotions-budget-snapshot-v23632.js',marker:'perf-promo-budget-snapshot-v23668',guard:'RESANTA_PROMOTIONS_BUDGET_SNAPSHOT_V23632'},
    {path:'assets/63-promotions-management-v23654.js',marker:'perf-promo-management-v23668',guard:'RESANTA_PROMOTIONS_MANAGEMENT_V23654'},
    {path:'assets/65-promotions-close-v23656.js',marker:'perf-promo-close-v23668',guard:'RESANTA_PROMOTIONS_CLOSE_V23656'}
  ],
  warehouseShell:[
    {path:'assets/36-warehouse-control-v23620.js',marker:'perf-warehouse-shell-v23668',guard:'RESANTA_WAREHOUSE_CONTROL_V23620'}
  ],
  warehouse:[
    {path:'assets/37-warehouse-weekly-v23621.js',marker:'perf-warehouse-weekly-v23668',guard:'RESANTA_WAREHOUSE_WEEKLY_V23622'},
    {path:'assets/48-warehouse-freshness-v23633.js',marker:'perf-warehouse-fresh-v23668',guard:'RESANTA_WAREHOUSE_FRESHNESS_V23633'},
    {path:'assets/51-warehouse-compact-days-v23637.js',marker:'perf-warehouse-compact-v23668',guard:'RESANTA_WAREHOUSE_COMPACT_V23637'},
    {path:'assets/54-warehouse-stock-truth-v23641.js',marker:'perf-warehouse-stock-truth-v23668',guard:'RESANTA_WAREHOUSE_STOCK_TRUTH_V23641'},
    {path:'assets/55-warehouse-smart-excess-v23642.js',marker:'perf-warehouse-smart-v23668',guard:'RESANTA_WAREHOUSE_SMART_EXCESS_V23645'}
  ]
};

async function ensurePromotionData(){
  if(typeof window.v2273EnsureFeature==='function')await window.v2273EnsureFeature('promotions');
  return true;
}
function promoOverlay(show,text){
  const root=document.getElementById('page-promotions');if(!root)return;
  let el=document.getElementById('promo-contract-loading-v23668');
  if(!show){el?.remove();return}
  if(!root.style.position)root.style.position='relative';
  if(!el){
    el=document.createElement('div');
    el.id='promo-contract-loading-v23668';
    el.style.cssText='position:absolute;inset:0;z-index:120;background:rgba(249,250,251,.992);display:flex;align-items:flex-start;justify-content:center;padding-top:34px;min-height:520px';
    el.innerHTML='<div class="card" style="width:min(620px,calc(100% - 32px));padding:22px;text-align:center"><div style="font-size:20px;font-weight:800;margin-bottom:7px">🎯 Акции</div><div id="promo-contract-loading-text-v23668" style="font-size:13px;color:var(--sub)">Загружаю актуальные акции…</div></div>';
    root.appendChild(el);
  }
  const t=document.getElementById('promo-contract-loading-text-v23668');if(t&&text)t.textContent=text;
}
async function loadPromotions(){
  return onceContract('promotions',async()=>{
    await Promise.all([ensurePromotionData(),serial(CONTRACT.promotions)]);
    return CONTRACT.promotions.every(x=>loaded(x.guard));
  });
}
async function finalizePromotions(epoch){
  const ok=await loadPromotions();
  if(!ok)throw new Error('Не весь стек Акций загрузился');
  if(activePage()!=='promotions')return true;
  if(epoch!=null&&window.__crmNavEpoch!=null&&Number(epoch)!==Number(window.__crmNavEpoch))return true;
  try{window.crmSingleRenderMarkPageV227327?.('promotions')}catch(_){}
  try{window.crmSingleRenderRequestV227327?.('promotions',{reason:'feature-ready',force:true,delay:0})}catch(_){}
  setTimeout(()=>{
    if(activePage()==='promotions')promoOverlay(false);
  },120);
  return true;
}

async function loadWarehouseShell(){
  if(!isBoss())return false;
  return onceContract('warehouse-shell',()=>serial(CONTRACT.warehouseShell));
}
async function loadWarehouse(){
  if(!isBoss())return false;
  return onceContract('warehouse',async()=>{
    await loadWarehouseShell();
    await serial(CONTRACT.warehouse);
    return true;
  });
}

async function loadTriovist(){
  await Promise.all([
    load('assets/11-triovist-ai-plans-v2348.js','perf-tri-ai-v23668','RESANTA_TRIOVIST_AI_PLANS_V2348'),
    load('assets/13-triovist-seasonal-stock-v2350.js','perf-tri-stock-v23668','RESANTA_TRIOVIST_SEASONAL_STOCK_V2350'),
    load('assets/32-triovist-v23611.js','perf-tri-root-v23668','RESANTA_TRIOVIST_ROOT_V23614'),
    load('assets/61-triovist-task-month-safe-v23651.js','perf-tri-month-v23668','RESANTA_TRIOVIST_TASK_MONTH_SAFE_V23651')
  ]);
  await load('assets/19-triovist-stock-upload-truth-v23551.js','perf-tri-upload-v23668','RESANTA_TRIOVIST_STOCK_UPLOAD_TRUTH_V23551');
  await load('assets/20-triovist-partner-forecast-v2356.js','perf-tri-forecast-v23668','RESANTA_TRIOVIST_PARTNER_FORECAST_V2356');
}
async function loadRoutes(){
  await Promise.all([
    load('assets/14-routes-yandex-ui-v2351.js','perf-routes-yandex-v23668','RESANTA_ROUTES_YANDEX_UI_V2351'),
    load('assets/15-routes-yandex-key-modal-v23511.js','perf-routes-key-v23668','RESANTA_YANDEX_KEY_MODAL_V23511'),
    load('assets/33-triovist-shell-guard-v23613.js','perf-route-tabs-v23668','RESANTA_ROUTE_MONTH_TABS_SYNC_V23635')
  ]);
}
function paymentEligible(){
  const p=profile(),r=String(p?.role||'').toLowerCase(),e=String(p?.email||'').toLowerCase();
  return r==='boss'||r==='office_manager'||e==='payushin_ar@resanta.ru'||e==='sidarovich_kn@resanta.ru';
}
async function loadPaymentRegistry(){
  if(!paymentEligible())return false;
  const p=profile(),r=String(p?.role||'').toLowerCase();
  await load('assets/38-payment-registry-v23623.js','perf-payment-registry-v23668','RESANTA_PAYMENT_REGISTRY_V23623');
  if(r==='office_manager'||String(p?.access_scope||'').toLowerCase()==='payments_only'){
    await load('assets/39-office-manager-payments-only-v23624.js','perf-office-payments-v23668','RESANTA_OFFICE_MANAGER_PAYMENTS_ONLY_V23624');
  }
  await load('assets/42-payment-registry-nav-root-v23627.js','perf-payment-nav-v23668','RESANTA_PAYMENT_REGISTRY_NAV_ROOT_V23627');
  return true;
}
function maybeLoadPaymentRegistry(){if(paymentEligible())loadPaymentRegistry().catch(e=>console.warn('ROOT '+V+' payment registry',e))}
function maybeLoadWarehouseShell(){if(isBoss())loadWarehouseShell().catch(e=>console.warn('ROOT '+V+' warehouse shell',e))}

async function loadForPage(page,epoch){
  const p=String(page||activePage()||'');
  try{
    if(p==='triovist')return await loadTriovist();
    if(p==='promotions'){
      promoOverlay(true,'Загружаю актуальные акции, бюджеты и продажи из 1С…');
      return await finalizePromotions(epoch);
    }
    if(p==='budgets')return await loadPromotions();
    if(p==='warehouse-control'){
      await loadWarehouse();
      if(activePage()==='warehouse-control')await window.crmWarehouseControlV1?.open?.(false);
      return true;
    }
    if(p==='payment-registry')return await loadPaymentRegistry();
    if(p==='payments'||p==='debt')return await load('assets/12-finance-data-root-v2349.js','perf-finance-v23668','RESANTA_FINANCE_DATA_ROOT_V2349');
    if(p==='managers'){
      await load('assets/07-ai-manager-plans.js','perf-manager-ai-v23668','RESANTA_AI_MANAGER_PLANS_V2320');
      await load('assets/08-manager-gap-sources.js','perf-manager-gap-v23668','RESANTA_MANAGER_GAP_SOURCES_V2322');
      return await load('assets/10-manager-plans-root-v2330.js','perf-manager-plans-v23668','RESANTA_MANAGER_PLANS_ROOT_V2330');
    }
    if(p==='sales')return await load('assets/49-manager-sales-yoy-v23634.js','perf-manager-yoy-v23668','RESANTA_MANAGER_SALES_YOY_V23634');
    if(['routes-boss','my-routes','route','gps-control','workday'].includes(p))return await loadRoutes();
  }catch(e){
    if(p==='promotions'){
      promoOverlay(true,'Ошибка загрузки модулей Акций. Повторите открытие раздела.');
      console.error('ROOT '+V+' promotions contract',e);
    }else console.warn('ROOT '+V+' lazy page '+p,e);
    return false;
  }
  return true;
}

const baseOpen=window.crmUltraPageOpenedV22734;
window.crmUltraPageOpenedV22734=function(page,epoch){
  const out=typeof baseOpen==='function'?baseOpen.apply(this,arguments):undefined;
  setTimeout(()=>loadForPage(page,epoch),0);
  return out;
};

const baseResponsiveOpen=window.crmResponsivePageOpenedV227325;
window.crmResponsivePageOpenedV227325=function(page,epoch){
  const p=String(page||'');
  if(p==='promotions')promoOverlay(true,'Загружаю актуальные акции, бюджеты и продажи из 1С…');
  const out=typeof baseResponsiveOpen==='function'?baseResponsiveOpen.apply(this,arguments):undefined;
  setTimeout(()=>loadForPage(page,epoch),0);
  return out;
};

window.crmPerformanceLoadPageV23657=loadForPage;
window.crmModuleContractCheckV23668=function(){
  return {
    version:'v'+V,
    promotions:Object.fromEntries(CONTRACT.promotions.map(x=>[x.guard,loaded(x.guard)])),
    warehouseShell:Object.fromEntries(CONTRACT.warehouseShell.map(x=>[x.guard,loaded(x.guard)])),
    warehouse:Object.fromEntries(CONTRACT.warehouse.map(x=>[x.guard,loaded(x.guard)])),
    warehouseNav:!!document.getElementById('nav-warehouse-control'),
    activePage:activePage()
  };
};

function boot(){
  setTimeout(()=>loadForPage(activePage(),window.__crmNavEpoch),0);
  setTimeout(maybeLoadPaymentRegistry,120);
  setTimeout(maybeLoadWarehouseShell,180);
  try{
    const d=typeof db!=='undefined'?db:window.db;
    d?.auth?.onAuthStateChange?.(()=>{
      setTimeout(maybeLoadPaymentRegistry,0);
      setTimeout(maybeLoadWarehouseShell,0);
    });
  }catch(_){}
}
window.addEventListener('pageshow',()=>{
  setTimeout(maybeLoadPaymentRegistry,0);
  setTimeout(maybeLoadWarehouseShell,0);
},{passive:true});

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

window.RESANTA_PERFORMANCE_ROOT_V23657=Object.freeze({
  version:'v'+V,
  explicitModuleContracts:true,
  promotionsStack:['25','41','45','46','47','63','65'],
  promotionsDataBeforeFinalRender:true,
  warehouseShell:'36',
  warehouseStack:['37','48','51','54','55'],
  warehouseIndependentOfGps:true,
  pageScopedModules:true,
  paymentRegistryLazy:true,
  officeManagerPaymentsOnly:true,
  noPolling:true,
  noMutationObserver:true,
  noBusinessDataWrites:true
});
})();