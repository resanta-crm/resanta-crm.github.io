/* RESANTA CRM v23.2.3 · MANAGER KPI SAVE FIX
 * Fix duplicate key on manager_kpi_plans(manager_name, period_month).
 * Uses DB unique key as source of truth instead of relying on possibly stale local cache.
 */
(function(){
'use strict';
if(window.RESANTA_MANAGER_KPI_SAVE_FIX_V2323)return;

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

window.saveManagerKpiPlan=async function(){
  if(currentProfile?.role!=='boss')return;
  const manager_name=String(document.getElementById('manager-plan-name')?.value||'').trim();
  const month_key=String(document.getElementById('manager-plan-month')?.value||'').slice(0,7);
  const period_month=canonicalPeriod(month_key);
  const shipment_plan=promoNum(document.getElementById('manager-plan-shipment')?.value);
  const akb_plan=Math.round(promoNum(document.getElementById('manager-plan-akb')?.value));
  const new_clients_plan=Math.round(promoNum(document.getElementById('manager-plan-new-clients')?.value));
  const note=String(document.getElementById('manager-plan-note')?.value||'').trim()||null;
  if(!manager_name||!period_month){alert('Выберите корректного менеджера и месяц');return;}

  const row={
    manager_name,period_month,shipment_plan,akb_plan,new_clients_plan,note,
    updated_by:currentProfile?.name||null,
    updated_at:new Date().toISOString()
  };

  const {data,error}=await db.from('manager_kpi_plans')
    .upsert(row,{onConflict:'manager_name,period_month'})
    .select().single();

  if(error){alert('Не удалось сохранить план: '+error.message);return;}

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
};
try{saveManagerKpiPlan=window.saveManagerKpiPlan;}catch(_){}

window.RESANTA_MANAGER_KPI_SAVE_FIX_V2323=Object.freeze({
  version:'v23.2.3',
  upsertByUniqueKey:true,
  localCacheMayBeStale:true,
  noSqlChanges:true
});
})();
