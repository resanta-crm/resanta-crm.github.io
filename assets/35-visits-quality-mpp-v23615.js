/* RESANTA CRM v23.6.112 · VISITS QUALITY PERSISTENCE
 * Keeps closed visit-quality reviews synchronized from Supabase.
 * The experimental boss-wide MPP filter is permanently removed: it injected
 * a dead UI block and temporarily rewrote allVisits/allRoutePlans during render.
 * GPS capture, routes, visit writes, sales and Triovist remain untouched.
 */
(function(){
'use strict';
if(window.RESANTA_VISITS_QUALITY_MPP_V23615)return;

const VERSION='v23.6.112';
const REVIEW_TTL_MS=30000;
const LEGACY_FILTER_STORAGE_KEY='resanta_visits_mpp_filter_v23615';
let reviewRowsByVisit=new Map();
let reviewSignature='';
let reviewLoadedAt=0;
let reviewFlight=null;

function isBoss(){
  try{return String(currentProfile?.role||'').trim().toLowerCase()==='boss';}
  catch(_){return false;}
}
function visitsPage(){return document.getElementById('page-visits');}
function visitsActive(){return !!visitsPage()?.classList.contains('active');}
function getDb(){try{return db;}catch(_){return window.db||null;}}

function cleanupLegacyMppFilter(){
  try{document.getElementById('visits-mpp-filter-v23615')?.remove();}catch(_){}
  try{sessionStorage.removeItem(LEGACY_FILTER_STORAGE_KEY);}catch(_){}
}

function reviewsSig(rows){
  return (rows||[]).map(r=>[
    String(r?.visit_id||''),
    String(r?.reviewed_at||''),
    String(r?.reviewer_name||''),
    String(r?.resolution||'')
  ].join('|')).sort().join('~');
}
function installReviewRows(rows){
  const clean=Array.isArray(rows)?rows.filter(r=>r&&r.visit_id):[];
  const nextSig=reviewsSig(clean);
  const changed=nextSig!==reviewSignature;
  reviewSignature=nextSig;
  reviewRowsByVisit=new Map(clean.map(r=>[String(r.visit_id),r]));
  reviewLoadedAt=Date.now();
  try{allVisitQualityReviews=clean.slice();}catch(_){}
  return changed;
}
async function syncQualityReviews(force=false){
  if(!isBoss())return false;
  if(reviewFlight)return reviewFlight;
  if(!force&&reviewLoadedAt&&Date.now()-reviewLoadedAt<REVIEW_TTL_MS)return false;
  const client=getDb();
  if(!client)return false;
  reviewFlight=(async()=>{
    const {data,error}=await client.from('visit_quality_reviews')
      .select('*')
      .order('reviewed_at',{ascending:false})
      .limit(2000);
    if(error)throw error;
    return installReviewRows(data||[]);
  })().catch(e=>{
    console.warn('Visits '+VERSION+' quality review sync:',e?.message||e);
    return false;
  }).finally(()=>{reviewFlight=null;});
  return reviewFlight;
}
function safeRenderVisits(){
  try{if(visitsActive()&&typeof renderVisits==='function')renderVisits();}
  catch(e){console.warn('Visits '+VERSION+' rerender:',e);}
}
async function syncAndRefresh(force=false){
  const changed=await syncQualityReviews(force);
  cleanupLegacyMppFilter();
  if(changed&&visitsActive())safeRenderVisits();
  return changed;
}

function installQualityLookup(){
  let base=null;
  try{base=window.visitQualityReview||(typeof visitQualityReview==='function'?visitQualityReview:null);}catch(_){}
  if(typeof base!=='function'||base.__visitsQualityV236112)return;
  const wrapped=function(v){
    const id=String(v?.id||'');
    if(id&&reviewRowsByVisit.has(id))return reviewRowsByVisit.get(id);
    return base.apply(this,arguments);
  };
  wrapped.__visitsQualityV236112=true;
  wrapped.__base=base;
  window.visitQualityReview=wrapped;
  try{visitQualityReview=wrapped;}catch(_){}
}
function installQualityActions(){
  let closeBase=null,reopenBase=null;
  try{closeBase=window.closeVisitQualityIssue||(typeof closeVisitQualityIssue==='function'?closeVisitQualityIssue:null);}catch(_){}
  try{reopenBase=window.reopenVisitQualityIssue||(typeof reopenVisitQualityIssue==='function'?reopenVisitQualityIssue:null);}catch(_){}

  if(typeof closeBase==='function'&&!closeBase.__visitsQualityV236112){
    const wrappedClose=async function(){
      const out=await closeBase.apply(this,arguments);
      await syncQualityReviews(true);
      if(visitsActive())safeRenderVisits();
      return out;
    };
    wrappedClose.__visitsQualityV236112=true;
    wrappedClose.__base=closeBase;
    window.closeVisitQualityIssue=wrappedClose;
    try{closeVisitQualityIssue=wrappedClose;}catch(_){}
  }

  if(typeof reopenBase==='function'&&!reopenBase.__visitsQualityV236112){
    const wrappedReopen=async function(visitId){
      const key=String(visitId||'');
      if(key)reviewRowsByVisit.delete(key);
      const out=await reopenBase.apply(this,arguments);
      await syncQualityReviews(true);
      if(visitsActive())safeRenderVisits();
      return out;
    };
    wrappedReopen.__visitsQualityV236112=true;
    wrappedReopen.__base=reopenBase;
    window.reopenVisitQualityIssue=wrappedReopen;
    try{reopenVisitQualityIssue=wrappedReopen;}catch(_){}
  }
}

function installRenderWrapper(){
  let base=null;
  try{base=window.renderVisits||(typeof renderVisits==='function'?renderVisits:null);}catch(_){}
  if(typeof base!=='function')return;

  // If an old in-memory session already has the removed MPP wrapper, unwrap it.
  while(base&&base.__visitsMppV23615&&typeof base.__base==='function')base=base.__base;
  if(base.__visitsQualityOnlyV236112)return;

  const wrapped=function(){
    cleanupLegacyMppFilter();
    const out=base.apply(this,arguments);
    cleanupLegacyMppFilter();
    if(isBoss())syncAndRefresh(false);
    return out;
  };
  wrapped.__visitsQualityOnlyV236112=true;
  wrapped.__base=base;
  window.renderVisits=wrapped;
  try{renderVisits=wrapped;}catch(_){}
}

function install(){
  cleanupLegacyMppFilter();
  installQualityLookup();
  installQualityActions();
  installRenderWrapper();
  if(visitsActive()&&isBoss()){
    syncAndRefresh(true);
    try{safeRenderVisits();}catch(_){}
  }
}

setTimeout(install,250);
setTimeout(install,1200);
setTimeout(()=>{cleanupLegacyMppFilter();if(visitsActive()&&isBoss())syncAndRefresh(true);},2200);

// Compatibility no-op: old callers cannot re-enable the removed filter.
window.crmSetVisitsMppFilterV23615=function(){cleanupLegacyMppFilter();};
window.crmVisitsQualityMppStateV23615=function(){
  return {version:VERSION,manager:'all',reviews:reviewRowsByVisit.size,reviewLoadedAt,bossMppFilter:false};
};
window.RESANTA_VISITS_QUALITY_MPP_V23615=Object.freeze({
  version:VERSION,
  closedQualityReviewsServerTruth:true,
  refreshSafe:true,
  bossMppFilter:false,
  legacyMppFilterRemoved:true,
  noDatasetMutation:true,
  noSqlChanges:true,
  gpsCaptureUntouched:true,
  routeCalculationsUntouched:true,
  visitWritesUntouched:true,
  salesUntouched:true,
  triovistUntouched:true
});
})();
