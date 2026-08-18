/* RESANTA CRM v23.3.0 · MANAGER KPI SAVE + ROOT BOOTSTRAP
 * Permanent bootstrap loaded by the existing index entry.
 * 1) Robust save: DB period rows are checked first; duplicate-key race retries as UPDATE.
 * 2) Loads the unified manager-plans root controller with a no-cache URL.
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

window.RESANTA_MANAGER_KPI_SAVE_FIX_V2330=Object.freeze({
  version:'v23.3.0',
  dbFirstUpdate:true,
  duplicateRaceRetry:true,
  rootNoCacheBootstrap:true,
  noSqlChanges:true
});
})();
