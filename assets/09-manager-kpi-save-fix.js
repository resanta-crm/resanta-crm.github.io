/* RESANTA CRM v23.5.6 · MANAGER KPI SAVE + PERMANENT ROOT BOOTSTRAP
 * Permanent bootstrap loaded by the existing index entry.
 * 1) Robust save: DB period rows are checked first; duplicate-key race retries as UPDATE.
 * 2) Loads the unified manager-plans root controller with a no-cache URL.
 * 3) v23.4.2 compatibility bridge exposes lexical auth state to lazy modules.
 * 4) Loads the finance truth controller with a no-cache URL.
 * 5) v23.5.5 loads corrected seasonal Triovist stock recommendations with a no-cache URL.
 * 6) v23.5.5.2 chains the 21vek upload/raw-export truth guard after the stock root.
 * 7) v23.5.6 chains client-forecast/RZ recommendation truth after both stock layers.
 * 8) v23.5.1 loads routes top-search + safe Yandex Maps adapter with a no-cache URL.
 * 9) v23.5.1.1 fixes Yandex Maps connect button with a normal CRM modal.
 */
(function(){
'use strict';
if(window.RESANTA_MANAGER_KPI_SAVE_FIX_V2330)return;

function canonicalPeriod(raw){
  const month=String(raw||'').slice(0,7);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month)?month+'-01':'';
}
function sameManagerSafe(a,b){
  const x=String(a||'').trim(),y=String(b||'').trim();
  if(!x||!y)return false;
  try{return typeof managerLooseMatch==='function'?managerLooseMatch(x,y):x.toLowerCase()===y.toLowerCase();}
  catch(_){return x.toLowerCase()===y.toLowerCase();}
}

async function saveManagerKpiPlanV2330(){
  if(currentProfile?.role!=='boss')return;
  const manager_name=String(document.getElementById('manager-plan-name')?.value||'').trim();
  const month_key=String(document.getElementById('manager-plan-month')?.value||'').slice(0,7);
  const period_month=canonicalPeriod(month_key);
  const shipment_plan=promoNum(document.getElementById('manager-plan-shipment')?.value);
  const akb_plan=Math.round(promoNum(document.getElementById('manager-plan-akb')?.value));
  const new_clients_plan=Math.round(promoNum(document.getElementById('manager-plan-new-clients')?.value));
  const note=String(document.getElementById('manager-plan-note')?.value||'').trim()||null;
  if(!manager_name||!period_month){alert('Выберите корректного менеджера и месяц');return;}

  const row={manager_name,period_month,shipment_plan,akb_plan,new_clients_plan,note,updated_by:currentProfile?.name||null,updated_at:new Date().toISOString()};
  let data=null,error=null;

  const existing=await db.from('manager_kpi_plans').select('*').eq('period_month',period_month);
  if(existing.error){alert('Не удалось проверить существующий план: '+existing.error.message);return;}
  let old=(existing.data||[]).find(x=>sameManagerSafe(x.manager_name,manager_name));

  if(old?.id){
    ({data,error}=await db.from('manager_kpi_plans').update(row).eq('id',old.id).select().single());
  }else{
    ({data,error}=await db.from('manager_kpi_plans').insert({...row,created_by:currentProfile?.name||null}).select().single());
    if(error&&String(error.code||'')==='23505'){
      const retry=await db.from('manager_kpi_plans').select('*').eq('period_month',period_month);
      old=(retry.data||[]).find(x=>sameManagerSafe(x.manager_name,manager_name));
      if(old?.id)({data,error}=await db.from('manager_kpi_plans').update(row).eq('id',old.id).select().single());
    }
  }

  if(error||!data){alert('Не удалось сохранить план: '+(error?.message||'не получена сохранённая запись'));return;}

  const list=Array.isArray(allManagerKpiPlans)?allManagerKpiPlans:[];
  let replaced=false;
  allManagerKpiPlans=list.map(x=>{
    const match=sameManagerSafe(x.manager_name,manager_name)&&String(x.period_month||'').slice(0,7)===month_key;
    if(match){replaced=true;return data;}
    return x;
  });
  if(!replaced)allManagerKpiPlans=[data,...allManagerKpiPlans];
  closeModal('modal-manager-plan');
  if(typeof renderManagers==='function')renderManagers();
}

window.saveManagerKpiPlan=saveManagerKpiPlanV2330;
try{saveManagerKpiPlan=saveManagerKpiPlanV2330;}catch(_){}

function installGlobalProfileBridgeV2342(){
  try{
    if(typeof currentProfile!=='undefined'){
      const d=Object.getOwnPropertyDescriptor(window,'currentProfile');
      if(!d||d.configurable){
        Object.defineProperty(window,'currentProfile',{
          configurable:true,
          enumerable:false,
          get:()=>currentProfile,
          set:v=>{currentProfile=v;}
        });
      }
    }
    if(typeof currentUser!=='undefined'){
      const d=Object.getOwnPropertyDescriptor(window,'currentUser');
      if(!d||d.configurable){
        Object.defineProperty(window,'currentUser',{
          configurable:true,
          enumerable:false,
          get:()=>currentUser,
          set:v=>{currentUser=v;}
        });
      }
    }
    window.RESANTA_GLOBAL_PROFILE_BRIDGE_V2342=Object.freeze({
      version:'v23.4.2',
      liveCurrentProfile:true,
      liveCurrentUser:true,
      fixesLazyModuleAuth:true
    });
  }catch(e){
    console.warn('Global profile bridge v23.4.2 failed',e);
  }
}
installGlobalProfileBridgeV2342();

function loadRoot(){
  if(window.RESANTA_MANAGER_PLANS_ROOT_V2330||document.querySelector('script[data-manager-plans-root-v2330]'))return;
  const s=document.createElement('script');
  s.src='./assets/10-manager-plans-root-v2330.js?_='+Date.now();
  s.async=false;
  s.dataset.managerPlansRootV2330='1';
  s.onerror=()=>console.warn('Manager plans v23.3.0 root failed to load; base CRM remains available.');
  document.head.appendChild(s);
}
loadRoot();

function loadFinanceRootV2349(){
  if(window.RESANTA_FINANCE_DATA_ROOT_V2349||document.querySelector('script[data-finance-root-v2349]'))return;
  const s=document.createElement('script');
  s.src='./assets/12-finance-data-root-v2349.js?_='+Date.now();
  s.async=false;
  s.dataset.financeRootV2349='1';
  s.onerror=()=>console.warn('Finance data root v23.4.9 failed to load; base CRM remains available.');
  document.head.appendChild(s);
}
loadFinanceRootV2349();

function loadTriovistPartnerForecastV2356(){
  if(window.RESANTA_TRIOVIST_PARTNER_FORECAST_V2356||document.querySelector('script[data-triovist-partner-forecast-v2356]'))return;
  const s=document.createElement('script');
  s.src='./assets/20-triovist-partner-forecast-v2356.js?_='+Date.now();
  s.async=false;
  s.dataset.triovistPartnerForecastV2356='1';
  s.onerror=()=>console.warn('Triovist partner forecast truth v23.5.6 failed to load; v23.5.5 recommendation remains available.');
  document.head.appendChild(s);
}

function loadTriovistStockUploadTruthV23551(){
  if(window.RESANTA_TRIOVIST_STOCK_UPLOAD_TRUTH_V23551){loadTriovistPartnerForecastV2356();return;}
  const existing=document.querySelector('script[data-triovist-stock-upload-truth-v23551]');
  if(existing){existing.addEventListener('load',loadTriovistPartnerForecastV2356,{once:true});setTimeout(()=>{if(window.RESANTA_TRIOVIST_STOCK_UPLOAD_TRUTH_V23551)loadTriovistPartnerForecastV2356();},250);return;}
  const s=document.createElement('script');
  s.src='./assets/19-triovist-stock-upload-truth-v23551.js?_='+Date.now();
  s.async=false;
  s.dataset.triovistStockUploadTruthV23551='1';
  s.onload=loadTriovistPartnerForecastV2356;
  s.onerror=()=>console.warn('Triovist 21vek upload truth guard v23.5.5.2 failed to load; stock page remains read-only safe until reload.');
  document.head.appendChild(s);
}

function loadTriovistSeasonalStockV2350(){
  if(window.RESANTA_TRIOVIST_SEASONAL_STOCK_V2350){loadTriovistStockUploadTruthV23551();return;}
  const existing=document.querySelector('script[data-triovist-seasonal-stock-v2350]');
  if(existing){existing.addEventListener('load',loadTriovistStockUploadTruthV23551,{once:true});setTimeout(()=>{if(window.RESANTA_TRIOVIST_SEASONAL_STOCK_V2350)loadTriovistStockUploadTruthV23551();},250);return;}
  const s=document.createElement('script');
  s.src='./assets/13-triovist-seasonal-stock-v2350.js?_='+Date.now();
  s.async=false;
  s.dataset.triovistSeasonalStockV2350='1';
  s.onload=loadTriovistStockUploadTruthV23551;
  s.onerror=()=>console.warn('Triovist stock truth v23.5.5 failed to load; base stock recommendation remains available.');
  document.head.appendChild(s);
}
loadTriovistSeasonalStockV2350();

function loadRoutesYandexUiV2351(){
  if(window.RESANTA_ROUTES_YANDEX_UI_V2351||document.querySelector('script[data-routes-yandex-ui-v2351]'))return;
  const s=document.createElement('script');
  s.src='./assets/14-routes-yandex-ui-v2351.js?_='+Date.now();
  s.async=false;
  s.dataset.routesYandexUiV2351='1';
  s.onerror=()=>console.warn('Routes Yandex UI v23.5.1 failed to load; base routes and OpenStreetMap remain available.');
  document.head.appendChild(s);
}
loadRoutesYandexUiV2351();

function loadRoutesYandexKeyModalV23511(){
  if(window.RESANTA_YANDEX_KEY_MODAL_V23511||document.querySelector('script[data-routes-yandex-key-modal-v23511]'))return;
  const s=document.createElement('script');
  s.src='./assets/15-routes-yandex-key-modal-v23511.js?_='+Date.now();
  s.async=false;
  s.dataset.routesYandexKeyModalV23511='1';
  s.onerror=()=>console.warn('Yandex Maps key modal v23.5.1.1 failed to load; base routes remain available.');
  document.head.appendChild(s);
}
loadRoutesYandexKeyModalV23511();

window.RESANTA_MANAGER_KPI_SAVE_FIX_V2330=Object.freeze({
  version:'v23.5.6',
  dbFirstUpdate:true,
  duplicateRaceRetry:true,
  rootNoCacheBootstrap:true,
  globalProfileBridge:'v23.4.2',
  financeRoot:'v23.4.9',
  triovistSeasonalStock:'v23.5.5',
  triovistStockUploadTruth:'v23.5.5.2',
  triovistPartnerForecast:'v23.5.6',
  routesYandexUi:'v23.5.1',
  routesYandexKeyModal:'v23.5.1.1',
  noSqlChanges:true
});
})();
