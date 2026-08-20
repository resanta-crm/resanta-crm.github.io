/* RESANTA CRM v23.5.7 · GPS CONTROL PERFORMANCE ROOT
 * - GPS-control work is active-page only.
 * - full workday track reload is throttled and single-flight.
 * - explicit "Карта" clicks still force an immediate full reload.
 * - strict route verification uses a date index instead of scanning all visits per route.
 * Business rules, GPS points and route truth are unchanged.
 */
(function(){
'use strict';
if(window.RESANTA_GPS_CONTROL_PERFORMANCE_V2357)return;
const VERSION='v23.5.7',STRICT_FROM='2026-08-19',HEAVY_TTL=90000;
const heavyFlights=new Map(),heavyAt=new Map();
let renderFlight=null,visRef=null,visLen=-1,visByDate=new Map(),visByRoute=new Map();
const norm=v=>String(v==null?'':v).trim().toLowerCase();
function active(){return !!document.getElementById('page-gps-control')?.classList.contains('active');}
function rebuildVisitIndex(){let rows=[];try{rows=Array.isArray(allVisits)?allVisits:[];}catch(_){rows=[];}if(rows===visRef&&rows.length===visLen)return;visRef=rows;visLen=rows.length;visByDate=new Map();visByRoute=new Map();for(const v of rows){if(!v||v.is_duplicate)continue;let d='';try{d=typeof visitDate==='function'?visitDate(v):String(v.date||v.created_at||'').slice(0,10);}catch(_){d=String(v.date||v.created_at||'').slice(0,10);}if(d){if(!visByDate.has(d))visByDate.set(d,[]);visByDate.get(d).push(v);}const rid=String(v.route_plan_id||'');if(rid){if(!visByRoute.has(rid))visByRoute.set(rid,[]);visByRoute.get(rid).push(v);}}}
function routeId(r){try{return typeof routePlanId==='function'?String(routePlanId(r)||''):String(r?.id||'');}catch(_){return String(r?.id||'');}}
function visitId(v){return String(v?.id||'');}
function mgrMatch(a,b){try{return typeof managerLooseMatch==='function'?managerLooseMatch(a,b):norm(a)===norm(b);}catch(_){return norm(a)===norm(b);}}
function visitMgr(v){try{return typeof visitManagerName==='function'?visitManagerName(v):v?.manager_name||'';}catch(_){return v?.manager_name||'';}}
function explicitMatch(r,v){try{return typeof routePlanExplicitlyLinked==='function'?routePlanExplicitlyLinked(r,v):((routeId(r)&&String(v?.route_plan_id||'')===routeId(r))||(r?.linked_visit_id&&String(r.linked_visit_id)===visitId(v)));}catch(_){return false;}}
function identityMatch(r,v){try{if(typeof routePlanIdentityMatchesVisit==='function')return routePlanIdentityMatchesVisit(r,v);}catch(_){}let vd='';try{vd=typeof visitDate==='function'?visitDate(v):String(v?.date||v?.created_at||'').slice(0,10);}catch(_){vd=String(v?.date||v?.created_at||'').slice(0,10);}if(vd!==String(r?.visit_date||'').slice(0,10)||!mgrMatch(r?.manager_name,visitMgr(v)))return false;try{return typeof routeClientMatchesVisit==='function'?routeClientMatchesVisit(r,v):String(r?.client_id||'')===String(v?.client_id||'');}catch(_){return String(r?.client_id||'')===String(v?.client_id||'');}}
function strictCandidates(r){rebuildVisitIndex();const rid=routeId(r),date=String(r?.visit_date||'').slice(0,10),out=[],seen=new Set();for(const v of visByRoute.get(rid)||[]){const id=visitId(v)||String(out.length);if(!seen.has(id)){seen.add(id);out.push(v);}}for(const v of visByDate.get(date)||[]){if(!mgrMatch(r?.manager_name,visitMgr(v)))continue;const id=visitId(v)||String(out.length);if(!seen.has(id)){seen.add(id);out.push(v);}}return out;}
function installFastVerifier(){let base=null;try{base=window.routePlanVerified||(typeof routePlanVerified==='function'?routePlanVerified:null);}catch(_){}if(typeof base!=='function'||base.__gpsPerfV2357)return false;const wrapped=function(r,visits,plans){const d=String(r?.visit_date||'').slice(0,10);if(!r||d<STRICT_FROM||Array.isArray(visits))return base.call(this,r,visits,plans);const link=String(r?.link_status||'');if(link==='boss_confirmed_gps_review')return true;if(link==='boss_rejected_gps_review')return false;const rows=strictCandidates(r);for(const v of rows){if(!(explicitMatch(r,v)||identityMatch(r,v)))continue;if(String(v?.gps_status||'').toLowerCase()==='confirmed')return true;}return false;};wrapped.__gpsPerfV2357=true;wrapped.__base=base;window.routePlanVerified=wrapped;try{routePlanVerified=wrapped;}catch(_){}return true;}
function installOpenGuard(){let base=null;try{base=window.v19OpenGpsWorkday||(typeof v19OpenGpsWorkday==='function'?v19OpenGpsWorkday:null);}catch(_){}if(typeof base!=='function'||base.__gpsPerfV2357)return false;const wrapped=async function(id,silent){if(!active())return;const k=String(id||'');const explicit=silent!==true;if(!explicit&&heavyAt.has(k)&&Date.now()-heavyAt.get(k)<HEAVY_TTL)return;if(heavyFlights.has(k))return heavyFlights.get(k);const p=(async()=>{try{return await base.apply(this,arguments);}finally{heavyAt.set(k,Date.now());heavyFlights.delete(k);}})();heavyFlights.set(k,p);return p;};wrapped.__gpsPerfV2357=true;wrapped.__base=base;window.v19OpenGpsWorkday=wrapped;try{v19OpenGpsWorkday=wrapped;}catch(_){}return true;}
function installRenderGuard(){let base=null;try{base=window.v19RenderGpsControl||(typeof v19RenderGpsControl==='function'?v19RenderGpsControl:null);}catch(_){}if(typeof base!=='function'||base.__gpsPerfV2357)return false;const wrapped=async function(force){if(!active())return;if(renderFlight)return renderFlight;renderFlight=(async()=>{try{return await base.apply(this,arguments);}finally{renderFlight=null;}})();return renderFlight;};wrapped.__gpsPerfV2357=true;wrapped.__base=base;window.v19RenderGpsControl=wrapped;try{v19RenderGpsControl=wrapped;}catch(_){}return true;}
function install(){installFastVerifier();installOpenGuard();installRenderGuard();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});else setTimeout(install,0);
setTimeout(install,400);setTimeout(install,1400);setTimeout(install,3000);
window.RESANTA_GPS_CONTROL_PERFORMANCE_V2357=Object.freeze({version:VERSION,activePageOnly:true,fullTrackTtlMs:HEAVY_TTL,singleFlight:true,indexedVisitTruth:true,noBusinessRuleChanges:true});
})();