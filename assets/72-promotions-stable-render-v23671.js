/* RESANTA CRM v23.6.71 · PROMOTIONS STABLE RENDER
 * Final guard against duplicate full-page Promotions paints.
 * Loaded LAST after the complete Promotions stack.
 * Repeated renderPromotions() calls with identical data/filter state are ignored.
 * This prevents visual blinking caused by multiple legacy wrappers/navigation hooks.
 * No polling. No MutationObserver. No data writes.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_STABLE_RENDER_V23671)return;
const V='v23.6.71';
const base=window.renderPromotions;
if(typeof base!=='function')return;

let busy=false,pending=false,lastSig='',lastAt=0,lastResult;
const num=v=>Number(v)||0;
function safe(v){return String(v??'')}
function maxStamp(rows){
  let m='';
  for(const r of rows||[]){
    const s=safe(r?.updated_at||r?.created_at||r?.source_message_at||r?.report_date||'');
    if(s>m)m=s;
  }
  return m;
}
function promoDigest(){
  try{
    return (allPromotions||[]).map(p=>[
      p?.id,p?.status,p?.updated_at,p?.start_date,p?.end_date,p?.budget_id,
      p?.confirmed_sales,p?.sales_plan,p?.manager_name,p?.client_id,p?.client_name
    ].map(safe).join('~')).sort().join('|');
  }catch(_){return''}
}
function filterSig(){
  const g=id=>safe(document.getElementById(id)?.value);
  return [
    g('promo-status-filter'),
    g('promo-manager-filter'),
    g('promo-search'),
    g('promo54-month'),
    safe(window.promoApprovalStageFilter||'all')
  ].join('|');
}
function salesStamp(){
  let st='';
  try{
    const x=typeof crmImportStatus==='function'?crmImportStatus('sales'):null;
    st=[x?.source_message_at,x?.report_date,x?.last_success_at].map(safe).join('|');
  }catch(_){}
  let h=0;try{h=(allPurchaseHistory||[]).length}catch(_){}
  return st+'|'+h;
}
function signature(){
  let budgets=[],moves=[];
  try{budgets=allPromotionBudgets||[]}catch(_){}
  try{moves=allPromotionBudgetMovements||[]}catch(_){}
  return [
    promoDigest(),
    budgets.length,maxStamp(budgets),
    moves.length,maxStamp(moves),
    salesStamp(),
    filterSig()
  ].join('§');
}
function hasRenderedDom(){
  return !!document.getElementById('promo-kpi')?.children?.length &&
         !!document.getElementById('promo-list');
}
function run(){
  const sig=signature();
  if(sig===lastSig&&hasRenderedDom())return lastResult;
  if(busy){pending=true;return lastResult}
  busy=true;
  try{
    lastResult=base.apply(this,arguments);
    lastSig=signature();
    lastAt=Date.now();
    return lastResult;
  }finally{
    busy=false;
    if(pending){
      pending=false;
      const next=signature();
      if(next!==lastSig){
        queueMicrotask(()=>{try{window.renderPromotions()}catch(e){console.warn(V+' coalesced render',e)}});
      }
    }
  }
}
run.__promotionsStableRenderV23671=true;
run.__base=base;
window.renderPromotions=run;try{renderPromotions=run}catch(_){}

window.crmPromotionsRenderSignatureV23671=signature;
window.RESANTA_PROMOTIONS_STABLE_RENDER_V23671=Object.freeze({
  version:V,
  duplicateFullPaintsSuppressed:true,
  dataAware:true,
  filterAware:true,
  salesAware:true,
  coalescesReentrantCalls:true,
  noPolling:true,
  noMutationObserver:true,
  noWrites:true
});
})();