/* RESANTA CRM v23.6.29 · ROUTE VISIT EVIDENCE
 * Root fix: a valid check-in / sustained GPS stop at the client cannot be
 * cancelled just because the visit report is saved after the manager leaves.
 * Keeps the report GPS point for audit; only route truth uses visit evidence.
 */
(function(){
'use strict';
if(window.RESANTA_ROUTE_VISIT_EVIDENCE_V23629)return;
const VERSION='v23.6.29',EVIDENCE='verified_visit_evidence',BOSS_OK='boss_confirmed_gps_review',BOSS_NO='boss_rejected_gps_review';
const low=v=>String(v??'').trim().toLowerCase();
function visits(){try{return Array.isArray(allVisits)?allVisits:[]}catch(_){return[]}}
function routes(){try{return Array.isArray(allRoutePlans)?allRoutePlans:[]}catch(_){return[]}}
function routeId(r){return String(r?.id||'')}
function visitId(v){return String(v?.id||'')}
function evidenceOk(r){return [EVIDENCE,'verified_visit_gps',BOSS_OK].includes(String(r?.link_status||''));}
function refresh(){try{if(document.getElementById('page-visits')?.classList.contains('active')&&typeof renderVisits==='function')renderVisits()}catch(_){}try{if(document.getElementById('page-routes')?.classList.contains('active')&&typeof renderRoute==='function')renderRoute()}catch(_){} }
async function reconcile(v){
  if(!v||v.is_duplicate||!v.route_plan_id||!v.id)return false;
  const r=routes().find(x=>routeId(x)===String(v.route_plan_id));
  if(!r||String(r.link_status||'')===BOSS_NO||evidenceOk(r))return evidenceOk(r);
  try{
    const {data,error}=await db.rpc('crm_route_apply_visit_evidence_v23627',{p_route_plan_id:String(v.route_plan_id),p_visit_id:String(v.id)});
    if(error)throw error;
    if(data?.confirmed&&data?.applied){
      const upd={visited:true,linked_visit_id:String(v.id),link_status:EVIDENCE,linked_at:r.linked_at||new Date().toISOString()};
      Object.assign(r,upd);
      try{allRoutePlans=allRoutePlans.map(x=>routeId(x)===routeId(r)?{...x,...upd}:x)}catch(_){}
      refresh();
      return true;
    }
  }catch(e){console.warn('Route evidence '+VERSION,e)}
  return false;
}
async function reconcileRecent(){
  const candidates=routes().filter(r=>String(r.link_status||'')==='gps_review_pending'&&r.linked_visit_id).slice(0,20);
  for(const r of candidates){const v=visits().find(x=>visitId(x)===String(r.linked_visit_id));if(v)await reconcile(v);}
}
function wrapVerified(){
  let base=null;try{base=window.routePlanVerified||(typeof routePlanVerified==='function'?routePlanVerified:null)}catch(_){}
  if(typeof base!=='function'||base.__routeEvidenceV23629)return false;
  const w=function(r){if(evidenceOk(r))return true;return base.apply(this,arguments)};
  w.__routeEvidenceV23629=true;w.__base=base;window.routePlanVerified=w;try{routePlanVerified=w}catch(_){}return true;
}
function wrapSaver(name){
  if(!window.RESANTA_VISIT_GPS_TRUTH_V2354)return false;
  let base=null;try{base=window[name]||(name==='saveVisit'&&typeof saveVisit==='function'?saveVisit:null)||(name==='saveQuickVisit'&&typeof saveQuickVisit==='function'?saveQuickVisit:null)}catch(_){}
  if(typeof base!=='function'||base.__routeEvidenceV23629)return false;
  const w=async function(){
    const before=new Set(visits().map(x=>visitId(x)).filter(Boolean));
    const out=await base.apply(this,arguments);
    const fresh=visits().filter(v=>v?.id&&v.route_plan_id&&!before.has(visitId(v))).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
    if(fresh.length)for(const v of fresh.slice(0,3))await reconcile(v);
    else{
      const recent=visits().filter(v=>v?.route_plan_id&&v?.id).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,2);
      for(const v of recent)await reconcile(v);
    }
    return out;
  };
  w.__routeEvidenceV23629=true;w.__gpsTruthV2360=true;w.__base=base;
  if(base.__resantaVisitSingleSubmitV23628)w.__resantaVisitSingleSubmitV23628=true;
  window[name]=w;try{if(name==='saveVisit')saveVisit=w;else saveQuickVisit=w}catch(_){}return true;
}
function cleanFalseReview(){
  const card=document.getElementById('gps-visit-review-v2354');if(!card)return;
  const accepted=routes().filter(evidenceOk);if(!accepted.length)return;
  const rows=[...card.children].filter(x=>x.tagName==='DIV'&&/border-top/i.test(String(x.getAttribute('style')||'')));
  for(const row of rows){const t=low(row.textContent);if(accepted.some(r=>t.includes(low(r.client_name))&&t.includes(low(r.manager_name))))row.remove();}
  const left=[...card.children].filter(x=>x.tagName==='DIV'&&/border-top/i.test(String(x.getAttribute('style')||'')));
  if(!left.length)card.remove();
}
function wrapRender(){
  let base=null;try{base=window.renderVisits||(typeof renderVisits==='function'?renderVisits:null)}catch(_){}
  if(typeof base!=='function'||base.__routeEvidenceV23629)return false;
  const w=function(){const out=base.apply(this,arguments);setTimeout(cleanFalseReview,0);return out};w.__routeEvidenceV23629=true;w.__base=base;window.renderVisits=w;try{renderVisits=w}catch(_){}return true;
}
function install(){wrapVerified();wrapSaver('saveVisit');wrapSaver('saveQuickVisit');wrapRender();setTimeout(reconcileRecent,100);}
[300,900,1900,3500].forEach(ms=>setTimeout(install,ms));
window.RESANTA_ROUTE_VISIT_EVIDENCE_V23629=Object.freeze({version:VERSION,checkinTruth:true,sustainedStopTruth:true,reportGpsKeptForAudit:true,noRadiusInflation:true,singleSubmitPreserved:true});
})();
