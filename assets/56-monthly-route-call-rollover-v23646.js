/* RESANTA CRM v23.6.46 · MONTHLY ROUTE CALL ROLLOVER
 * One lightweight boss-only check per month. No polling.
 * Old monthly route_call tasks are archived as stale_review; one current-month task per client remains active.
 */
(function(){
'use strict';
if(window.RESANTA_MONTHLY_ROUTE_CALL_ROLLOVER_V23646)return;
const V='v23.6.46', KEY='crm_route_call_rollover_month_v23646';
function dbx(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
function monthKey(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
async function run(){
  try{
    if(typeof currentProfile==='undefined'||currentProfile?.role!=='boss')return false;
    const m=monthKey();
    if(localStorage.getItem(KEY)===m)return true;
    const d=dbx();if(!d)return false;
    const {data,error}=await d.rpc('crm_rollover_monthly_route_calls_v23646',{p_target_month:m+'-01'});
    if(error)throw error;
    localStorage.setItem(KEY,m);
    if((Number(data?.created)||0)+(Number(data?.archived_previous)||0)>0){
      try{if(typeof window.crmCoreGetV22733==='function')await window.crmCoreGetV22733('tasks',true)}catch(_){}
      try{if(document.getElementById('page-dashboard')?.classList.contains('active')&&typeof renderDashboard==='function')renderDashboard()}catch(_){}
    }
    return true;
  }catch(e){console.warn('Monthly route-call rollover '+V,e);return false}
}
window.crmRunMonthlyRouteCallRolloverV23646=run;
window.addEventListener('load',()=>{setTimeout(async()=>{if(!(await run()))setTimeout(run,4000)},1200)},{once:true});
window.RESANTA_MONTHLY_ROUTE_CALL_ROLLOVER_V23646=Object.freeze({version:V,monthly:true,bossOnly:true,noPolling:true,historyPreserved:true});
})();
