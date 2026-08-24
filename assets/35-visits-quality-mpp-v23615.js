/* RESANTA CRM v23.6.15 · VISITS QUALITY PERSISTENCE + BOSS MPP FILTER
 * Scope is deliberately narrow:
 * 1) closed visit-quality reviews are rehydrated from Supabase when Visits opens;
 * 2) boss can filter the whole Visits page by one field manager (MPP).
 *
 * No DB schema changes. GPS capture, workday, route calculations, visit writes,
 * sales and Triovist business logic are untouched.
 */
(function(){
'use strict';
if(window.RESANTA_VISITS_QUALITY_MPP_V23615)return;

const VERSION='v23.6.15';
const REVIEW_TTL_MS=30000;
const FILTER_STORAGE_KEY='resanta_visits_mpp_filter_v23615';
let selectedManager='all';
let reviewRowsByVisit=new Map();
let reviewSignature='';
let reviewLoadedAt=0;
let reviewFlight=null;
let renderInstallSeq=0;

function isBoss(){
  try{return String(currentProfile?.role||'').trim().toLowerCase()==='boss';}
  catch(_){return false;}
}
function visitsPage(){return document.getElementById('page-visits');}
function visitsActive(){return !!visitsPage()?.classList.contains('active');}
function getDb(){try{return db;}catch(_){return window.db||null;}}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function norm(v){return String(v??'').trim();}
function low(v){return norm(v).toLowerCase();}
function managerMatch(a,b){
  if(!a||!b)return false;
  try{return typeof managerLooseMatch==='function'?!!managerLooseMatch(a,b):low(a)===low(b);}
  catch(_){return low(a)===low(b);}
}
function visitManager(v){
  try{return typeof visitManagerName==='function'?norm(visitManagerName(v)):norm(v?.manager_name);}
  catch(_){return norm(v?.manager_name);}
}
function rawVisits(){try{return Array.isArray(allVisits)?allVisits:[];}catch(_){return[];}}
function rawRoutes(){try{return Array.isArray(allRoutePlans)?allRoutePlans:[];}catch(_){return[];}}
function currentVisibleVisits(){
  try{return typeof visibleVisitsForCurrentUser==='function'?(visibleVisitsForCurrentUser()||[]):rawVisits();}
  catch(_){return rawVisits();}
}
function currentVisibleRoutes(){
  try{return typeof routePlansForCurrentUser==='function'?(routePlansForCurrentUser()||[]):rawRoutes();}
  catch(_){return rawRoutes();}
}
function managerNamesFrom(visits,routes){
  const set=new Set();
  (visits||[]).forEach(v=>{const n=visitManager(v);if(n)set.add(n);});
  (routes||[]).forEach(r=>{const n=norm(r?.manager_name);if(n)set.add(n);});
  return [...set].sort((a,b)=>a.localeCompare(b,'ru'));
}
function loadStoredFilter(){
  try{const v=sessionStorage.getItem(FILTER_STORAGE_KEY);if(v)selectedManager=v;}catch(_){}
}
function saveStoredFilter(){
  try{sessionStorage.setItem(FILTER_STORAGE_KEY,selectedManager);}catch(_){}
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
  // Keep the legacy source in sync too: other existing CRM blocks may read it directly.
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
  if(changed&&visitsActive())safeRenderVisits();
  return changed;
}

function installQualityLookup(){
  let base=null;
  try{base=window.visitQualityReview||(typeof visitQualityReview==='function'?visitQualityReview:null);}catch(_){}
  if(typeof base!=='function'||base.__visitsQualityV23615)return;
  const wrapped=function(v){
    const id=String(v?.id||'');
    if(id&&reviewRowsByVisit.has(id))return reviewRowsByVisit.get(id);
    return base.apply(this,arguments);
  };
  wrapped.__visitsQualityV23615=true;
  wrapped.__base=base;
  window.visitQualityReview=wrapped;
  try{visitQualityReview=wrapped;}catch(_){}
}
function installQualityActions(){
  let closeBase=null,reopenBase=null;
  try{closeBase=window.closeVisitQualityIssue||(typeof closeVisitQualityIssue==='function'?closeVisitQualityIssue:null);}catch(_){}
  try{reopenBase=window.reopenVisitQualityIssue||(typeof reopenVisitQualityIssue==='function'?reopenVisitQualityIssue:null);}catch(_){}

  if(typeof closeBase==='function'&&!closeBase.__visitsQualityV23615){
    const wrappedClose=async function(visitId){
      const out=await closeBase.apply(this,arguments);
      // Base function already verifies the UPSERT. Re-read the tiny truth table so
      // the cache survives F5 / optimized page hydration as well.
      await syncQualityReviews(true);
      if(visitsActive())safeRenderVisits();
      return out;
    };
    wrappedClose.__visitsQualityV23615=true;
    wrappedClose.__base=closeBase;
    window.closeVisitQualityIssue=wrappedClose;
    try{closeVisitQualityIssue=wrappedClose;}catch(_){}
  }

  if(typeof reopenBase==='function'&&!reopenBase.__visitsQualityV23615){
    const wrappedReopen=async function(visitId){
      const key=String(visitId||'');
      // Do not let our authoritative cache keep a row visually closed while the
      // legacy delete action is executing. The server re-sync below restores it
      // automatically if the user cancels or the delete fails.
      if(key)reviewRowsByVisit.delete(key);
      const out=await reopenBase.apply(this,arguments);
      await syncQualityReviews(true);
      if(visitsActive())safeRenderVisits();
      return out;
    };
    wrappedReopen.__visitsQualityV23615=true;
    wrappedReopen.__base=reopenBase;
    window.reopenVisitQualityIssue=wrappedReopen;
    try{reopenVisitQualityIssue=wrappedReopen;}catch(_){}
  }
}

function ensureFilterUi(managers){
  const page=visitsPage();
  if(!page)return;
  let root=document.getElementById('visits-mpp-filter-v23615');
  if(!isBoss()){
    root?.remove();
    return;
  }
  managers=Array.isArray(managers)?managers:[];
  if(selectedManager!=='all'&&!managers.some(n=>managerMatch(n,selectedManager))){
    selectedManager='all';
    saveStoredFilter();
  }
  if(!root){
    root=document.createElement('div');
    root.id='visits-mpp-filter-v23615';
    root.className='card';
    root.style.cssText='padding:12px 14px;margin-bottom:12px;border-color:#BFDBFE;background:#F8FBFF';
    const anchor=document.getElementById('visits-kpi')||document.getElementById('visits-quality-block')||page.firstElementChild;
    if(anchor&&anchor.parentNode===page)page.insertBefore(root,anchor);
    else page.prepend(root);
  }
  root.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">'
    +'<div><div style="font-size:12px;font-weight:800;color:var(--at)">МПП</div>'
    +'<div style="font-size:11px;color:var(--sub);margin-top:2px">Фильтр действует на весь раздел: качество, GPS, маршрут и историю визитов.</div></div>'
    +'<div class="chips" data-mpp-chips-v23615 style="margin:0"></div></div>';
  const chips=root.querySelector('[data-mpp-chips-v23615]');
  if(!chips)return;
  const items=[{value:'all',label:'Все'},...managers.map(n=>({value:n,label:n}))];
  items.forEach(item=>{
    const b=document.createElement('button');
    b.type='button';
    const active=item.value==='all'?selectedManager==='all':managerMatch(item.value,selectedManager);
    b.className='chip'+(active?' active':'');
    b.textContent=item.label;
    b.dataset.manager=item.value;
    b.addEventListener('click',()=>{
      selectedManager=item.value;
      saveStoredFilter();
      safeRenderVisits();
    });
    chips.appendChild(b);
  });
}

function installRenderWrapper(){
  let base=null;
  try{base=window.renderVisits||(typeof renderVisits==='function'?renderVisits:null);}catch(_){}
  if(typeof base!=='function'||base.__visitsMppV23615)return;
  const seq=++renderInstallSeq;
  const wrapped=function(){
    const managerSourceVisits=currentVisibleVisits();
    const managerSourceRoutes=currentVisibleRoutes();
    const managers=managerNamesFrom(managerSourceVisits,managerSourceRoutes);
    let restore=null;

    if(isBoss()&&selectedManager!=='all'){
      try{
        const originalVisits=allVisits;
        const originalRoutes=allRoutePlans;
        const filteredVisits=(Array.isArray(originalVisits)?originalVisits:[]).filter(v=>managerMatch(visitManager(v),selectedManager));
        const filteredRoutes=(Array.isArray(originalRoutes)?originalRoutes:[]).filter(r=>managerMatch(r?.manager_name,selectedManager));
        allVisits=filteredVisits;
        allRoutePlans=filteredRoutes;
        // Restore after zero-delay callbacks queued by the existing GPS truth
        // renderer. This makes its "на разбор" list obey the same MPP filter too.
        restore=()=>{
          try{if(allVisits===filteredVisits)allVisits=originalVisits;}catch(_){}
          try{if(allRoutePlans===filteredRoutes)allRoutePlans=originalRoutes;}catch(_){}
        };
      }catch(e){
        console.warn('Visits '+VERSION+' MPP filter:',e);
      }
    }

    let out;
    try{out=base.apply(this,arguments);}
    finally{
      ensureFilterUi(managers);
      if(restore)setTimeout(restore,0);
    }
    // Never block the render on network. The first open may briefly show the
    // legacy cache, then correct itself from server truth once the small review
    // table arrives. Subsequent renders use the 30-second memory cache.
    if(isBoss())syncAndRefresh(false);
    return out;
  };
  wrapped.__visitsMppV23615=true;
  wrapped.__base=base;
  wrapped.__installSeq=seq;
  window.renderVisits=wrapped;
  try{renderVisits=wrapped;}catch(_){}
}

function install(){
  loadStoredFilter();
  installQualityLookup();
  installQualityActions();
  installRenderWrapper();
  if(visitsActive()&&isBoss()){
    syncAndRefresh(true);
    try{safeRenderVisits();}catch(_){}
  }
}

// asset 22 is itself no-cache-loaded. Delay the first wrap slightly so the
// existing visit-GPS wrapper can become the base; retry once in case another
// late bridge wraps renderVisits afterwards.
setTimeout(install,450);
setTimeout(install,1600);
setTimeout(()=>{if(visitsActive()&&isBoss())syncAndRefresh(true);},2200);

window.crmSetVisitsMppFilterV23615=function(name){
  if(!isBoss())return;
  selectedManager=norm(name)||'all';
  saveStoredFilter();
  safeRenderVisits();
};
window.crmVisitsQualityMppStateV23615=function(){
  return {version:VERSION,manager:selectedManager,reviews:reviewRowsByVisit.size,reviewLoadedAt};
};
window.RESANTA_VISITS_QUALITY_MPP_V23615=Object.freeze({
  version:VERSION,
  closedQualityReviewsServerTruth:true,
  refreshSafe:true,
  bossMppFilter:true,
  filtersQuality:true,
  filtersGpsReview:true,
  filtersRouteMisses:true,
  filtersVisitHistory:true,
  noSqlChanges:true,
  gpsCaptureUntouched:true,
  routeCalculationsUntouched:true,
  visitWritesUntouched:true,
  salesUntouched:true,
  triovistUntouched:true
});
})();
