/* RESANTA CRM v23.6.63 · VIP COMPARISON DATA READY FIX
 * Fix only: the additional VIP comparison must wait for purchase_history
 * before calculating, then refresh once when the 1C sales source changes.
 * No VIP membership changes. No polling. No MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_VIP_PERIOD_COMPARE_DATA_FIX_V23663)return;
const V='v23.6.63';
const baseCompare=window.vipPeriodCompareV23662;
if(typeof baseCompare!=='function')return;
let flight=null,lastRenderedSig='';

function active(){try{return typeof crmActivePage==='function'?crmActivePage():(document.getElementById('app')?.dataset?.activePage||'')}catch(_){return''}}
function sourceSig(){
  let st=null;try{st=typeof crmImportStatus==='function'?crmImportStatus('sales'):null}catch(_){}
  let hist=0;try{hist=(allPurchaseHistory||[]).length}catch(_){}
  return [hist,st?.source_message_at||'',st?.report_date||'',st?.last_success_at||''].join('|');
}
function currentMode(){
  const b=document.querySelector('#vip-period-compare-v23662 .vpc-tab.active');
  const t=String(b?.textContent||'').toLowerCase();
  if(t.includes('месяц'))return'mom';
  if(t.includes('квартал'))return'qoq';
  return'yoy';
}
async function ensureHistory(){
  let n=0;try{n=(allPurchaseHistory||[]).length}catch(_){}
  if(n>0)return true;
  if(typeof window.v22722EnsureHistory==='function'){
    await window.v22722EnsureHistory({reason:'vip-period-compare-v23663'});
  }
  try{return (allPurchaseHistory||[]).length>0}catch(_){return false}
}
async function run(mode){
  const body=document.getElementById('vip-period-compare-v23662-body');
  if(body)body.textContent='Подтягиваю продажи 1С…';
  const ready=await ensureHistory();
  if(!ready){
    if(body)body.innerHTML='<span style="color:var(--r)">История продаж 1С ещё не загрузилась. Повторите открытие раздела.</span>';
    return false;
  }
  const out=await Promise.resolve(baseCompare(mode));
  lastRenderedSig=sourceSig();
  return out;
}
window.vipPeriodCompareV23662=function(mode){
  mode=['yoy','mom','qoq'].includes(mode)?mode:'yoy';
  if(flight)return flight;
  flight=run(mode).catch(e=>{
    console.warn(V+' VIP comparison',e);
    const body=document.getElementById('vip-period-compare-v23662-body');
    if(body)body.innerHTML='<span style="color:var(--r)">Не удалось посчитать сравнение: '+String(e?.message||e)+'</span>';
  }).finally(()=>{flight=null});
  return flight;
};

const baseRender=window.renderVip;
if(typeof baseRender==='function'){
  window.renderVip=function(){
    const out=baseRender.apply(this,arguments);
    setTimeout(()=>{
      if(active()!=='vip')return;
      const sig=sourceSig();
      if(sig!==lastRenderedSig)window.vipPeriodCompareV23662(currentMode());
    },0);
    return out;
  };
  try{renderVip=window.renderVip}catch(_){}
}

setTimeout(()=>{
  if(active()==='vip')window.vipPeriodCompareV23662(currentMode());
},0);

window.RESANTA_VIP_PERIOD_COMPARE_DATA_FIX_V23663=Object.freeze({
  version:V,
  waitsForPurchaseHistory:true,
  refreshOnSalesSourceChange:true,
  changesVipMembership:false,
  changesVipDepartments:false,
  noWrites:true,
  noPolling:true,
  noMutationObserver:true
});
})();