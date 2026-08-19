/* RESANTA CRM v23.5.4 · VISIT GPS TRUTH
 * Strict route truth from 2026-08-19 forward:
 * - a task report never proves a physical visit;
 * - a route visit is auto-confirmed only when the saved visit has gps_status=confirmed;
 * - no_gps / unverified / far visits go to a boss review queue;
 * - boss can explicitly confirm or reject the physical visit using existing route_plans fields;
 * - no schema changes; old route history before the cutoff keeps the previous logic.
 */
(function(){
'use strict';
if(window.RESANTA_VISIT_GPS_TRUTH_V2354)return;
const VERSION='v23.5.4';
const STRICT_FROM='2026-08-19';
const PENDING='gps_review_pending';
const BOSS_OK='boss_confirmed_gps_review';
const BOSS_NO='boss_rejected_gps_review';
const AUTO_OK='verified_visit_gps';

const norm=v=>String(v==null?'':v).trim();
const escHtml=v=>String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
function allVisitsSafe(){try{return Array.isArray(allVisits)?allVisits:[];}catch(_){return[];}}
function allRoutesSafe(){try{return Array.isArray(allRoutePlans)?allRoutePlans:[];}catch(_){return[];}}
function role(){try{return currentProfile?.role||'';}catch(_){return'';}}
function isBoss(){return role()==='boss';}
function routeId(r){try{return typeof routePlanId==='function'?routePlanId(r):String(r?.id||'');}catch(_){return String(r?.id||'');}}
function visitId(v){return String(v?.id||'');}
function visitDateSafe(v){try{return typeof visitDate==='function'?visitDate(v):String(v?.date||v?.created_at||'').slice(0,10);}catch(_){return String(v?.date||v?.created_at||'').slice(0,10);}}
function visitManager(v){try{return typeof visitManagerName==='function'?visitManagerName(v):String(v?.manager_name||'');}catch(_){return String(v?.manager_name||'');}}
function mgrMatch(a,b){try{return typeof managerLooseMatch==='function'?managerLooseMatch(a,b):norm(a).toLowerCase()===norm(b).toLowerCase();}catch(_){return norm(a).toLowerCase()===norm(b).toLowerCase();}}
function clientMatch(r,v){try{return typeof routeClientMatchesVisit==='function'?routeClientMatchesVisit(r,v):String(r?.client_id||'')===String(v?.client_id||'');}catch(_){return String(r?.client_id||'')===String(v?.client_id||'');}}
function explicitMatch(r,v){
  try{return typeof routePlanExplicitlyLinked==='function'?routePlanExplicitlyLinked(r,v):((routeId(r)&&String(v?.route_plan_id||'')===routeId(r))||(r?.linked_visit_id&&String(r.linked_visit_id)===visitId(v)));}
  catch(_){return false;}
}
function identityMatch(r,v){
  if(!r||!v||v.is_duplicate)return false;
  try{if(typeof routePlanIdentityMatchesVisit==='function')return routePlanIdentityMatchesVisit(r,v);}catch(_){}
  return visitDateSafe(v)===String(r?.visit_date||'').slice(0,10)&&mgrMatch(r?.manager_name,visitManager(v))&&clientMatch(r,v);
}
function visitGpsConfirmed(v){return String(v?.gps_status||'').toLowerCase()==='confirmed';}
function strictRoute(r){return String(r?.visit_date||'').slice(0,10)>=STRICT_FROM;}
function bossConfirmed(r){return String(r?.link_status||'')===BOSS_OK;}
function bossRejected(r){return String(r?.link_status||'')===BOSS_NO;}
function matchingVisits(r,visits){
  const rows=(visits||allVisitsSafe()).filter(v=>v&&!v.is_duplicate);
  return rows.filter(v=>explicitMatch(r,v)||identityMatch(r,v));
}
function reviewVisitForRoute(r,visits){
  const rows=matchingVisits(r,visits);
  if(!rows.length)return null;
  const linked=String(r?.linked_visit_id||'');
  return rows.find(v=>linked&&visitId(v)===linked)
    ||rows.slice().sort((a,b)=>String(b?.created_at||'').localeCompare(String(a?.created_at||'')))[0]
    ||null;
}
function strictVerified(r,visits){
  if(!strictRoute(r))return null;
  const matches=matchingVisits(r,visits);
  if(matches.some(visitGpsConfirmed))return true;
  if(bossConfirmed(r))return true;
  return false;
}

const baseRoutePlanVerified=(typeof window.routePlanVerified==='function'&&window.routePlanVerified)
  ||(typeof routePlanVerified==='function'?routePlanVerified:null);
if(baseRoutePlanVerified&&!baseRoutePlanVerified.__gpsTruthV2354){
  const wrapped=function(r,visits,plans){
    const strict=strictVerified(r,visits);
    return strict===null?baseRoutePlanVerified.call(this,r,visits,plans):strict;
  };
  wrapped.__gpsTruthV2354=true;
  wrapped.__base=baseRoutePlanVerified;
  window.routePlanVerified=wrapped;
  try{routePlanVerified=wrapped;}catch(_){}
}

function gpsLabel(v){
  const status=String(v?.gps_status||'').toLowerCase();
  const dist=Number(v?.gps_distance);
  if(status==='confirmed')return {status,text:'GPS подтверждён'+(Number.isFinite(dist)?' · '+Math.round(dist)+' м':'')};
  if(status==='far')return {status,text:'GPS вне геозоны'+(Number.isFinite(dist)?' · '+Math.round(dist)+' м':'')};
  if(status==='unverified')return {status,text:'GPS есть, но координаты ТТ не выверены'+(Number.isFinite(dist)?' · '+Math.round(dist)+' м':'')};
  if(status==='no_gps')return {status,text:'GPS визита не получен'};
  return {status:status||'unknown',text:'GPS-подтверждение отсутствует'};
}

async function persistRouteState(route,visit,state,visited){
  if(!route||!route.id)return false;
  const upd={
    visited:!!visited,
    linked_visit_id:visit?.id?String(visit.id):(route.linked_visit_id||null),
    link_status:state,
    linked_at:new Date().toISOString()
  };
  try{
    const {error}=await db.from('route_plans').update(upd).eq('id',route.id);
    if(error){console.warn('GPS route truth state was not persisted',error);return false;}
    Object.assign(route,upd);
    return true;
  }catch(e){console.warn('GPS route truth state persist failed',e);return false;}
}

async function normalizeNewVisit(v){
  if(!v||v.is_duplicate)return;
  const rid=String(v.route_plan_id||'');
  if(!rid)return;
  const route=allRoutesSafe().find(r=>routeId(r)===rid);
  if(!route||!strictRoute(route))return;
  if(visitGpsConfirmed(v)){
    if(!bossConfirmed(route))await persistRouteState(route,v,AUTO_OK,true);
    return;
  }
  if(bossConfirmed(route)||bossRejected(route))return;
  await persistRouteState(route,v,PENDING,false);
}

function newVisitSince(before){
  const rows=allVisitsSafe();
  const created=rows.filter(v=>v?.id&&!before.has(String(v.id)));
  if(!created.length)return null;
  return created.slice().sort((a,b)=>String(b?.created_at||'').localeCompare(String(a?.created_at||'')))[0]||created[0];
}
function refreshTruthUi(){
  try{if(typeof renderVisits==='function'&&document.getElementById('page-visits')?.classList.contains('active'))renderVisits();}catch(_){}
  try{if(typeof buildDashboard==='function')buildDashboard();}catch(_){}
  try{if(typeof renderAlerts==='function'&&document.getElementById('page-alerts')?.classList.contains('active'))renderAlerts();}catch(_){}
  setTimeout(renderReviewCard,0);
}
function wrapSaver(name){
  let base=null;
  try{base=window[name]||(name==='saveVisit'&&typeof saveVisit==='function'?saveVisit:null)||(name==='saveQuickVisit'&&typeof saveQuickVisit==='function'?saveQuickVisit:null);}catch(_){}
  if(typeof base!=='function'||base.__gpsTruthV2354)return;
  const wrapped=async function(){
    const before=new Set(allVisitsSafe().map(v=>String(v?.id||'')).filter(Boolean));
    const out=await base.apply(this,arguments);
    const v=newVisitSince(before);
    if(v){await normalizeNewVisit(v);refreshTruthUi();}
    return out;
  };
  wrapped.__gpsTruthV2354=true;wrapped.__base=base;
  window[name]=wrapped;
  try{if(name==='saveVisit')saveVisit=wrapped;else if(name==='saveQuickVisit')saveQuickVisit=wrapped;}catch(_){}
}

function pendingReviews(){
  const routes=allRoutesSafe().filter(r=>r&&!r.removed&&strictRoute(r)&&r.review_status!=='pending'&&r.review_status!=='rejected');
  const out=[];
  for(const r of routes){
    const matches=matchingVisits(r);
    if(!matches.length)continue;
    if(matches.some(visitGpsConfirmed)||bossConfirmed(r)||bossRejected(r))continue;
    const v=reviewVisitForRoute(r,matches);
    if(v)out.push({route:r,visit:v,gps:gpsLabel(v)});
  }
  return out.sort((a,b)=>String(b.route.visit_date||'').localeCompare(String(a.route.visit_date||'')));
}

async function decide(routeIdValue,visitIdValue,ok){
  if(!isBoss()){alert('Подтвердить или отклонить визит может только руководитель.');return;}
  const route=allRoutesSafe().find(r=>routeId(r)===String(routeIdValue));
  const visit=allVisitsSafe().find(v=>visitId(v)===String(visitIdValue));
  if(!route||!visit){alert('Маршрут или визит не найден. Обновите CRM и попробуйте снова.');return;}
  const g=gpsLabel(visit);
  const question=ok
    ?'Подтвердить физический визит без автоматического GPS-подтверждения?\n\n'+String(route.client_name||'Клиент')+'\n'+g.text+'\n\nПодтверждайте только после проверки GPS-трека/объяснения менеджера.'
    :'Отметить, что физический визит НЕ подтверждён?\n\n'+String(route.client_name||'Клиент')+'\n'+g.text+'\n\nТочка останется невыполненной.';
  if(!confirm(question))return;
  const saved=await persistRouteState(route,visit,ok?BOSS_OK:BOSS_NO,!!ok);
  if(!saved){alert('Не удалось сохранить решение руководителя. Данные маршрута не изменены.');return;}
  refreshTruthUi();
}
window.crmGpsVisitReviewDecisionV2354=decide;

function reviewRow(x){
  const r=x.route,v=x.visit,g=x.gps;
  const d=String(r.visit_date||'').slice(0,10)||'—';
  const result=String(v.result||v.text||'').trim();
  return '<div style="padding:10px 0;border-top:1px solid var(--border);display:grid;grid-template-columns:minmax(240px,1fr) auto;gap:10px;align-items:center">'
    +'<div><div style="font-weight:800">'+escHtml(r.client_name||'Клиент')+' <span style="font-size:11px;color:var(--sub);font-weight:600">· '+escHtml(r.manager_name||'—')+'</span></div>'
    +'<div style="font-size:11px;color:var(--sub);margin-top:3px">план '+escHtml(d)+' · '+escHtml(g.text)+(Number.isFinite(Number(v.gps_accuracy))?' · точность ±'+Math.round(Number(v.gps_accuracy))+' м':'')+'</div>'
    +(result?'<div style="font-size:11px;margin-top:3px"><b>Отчёт:</b> '+escHtml(result.slice(0,180))+'</div>':'')
    +'</div>'
    +(isBoss()?'<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end"><button class="btn-secondary" onclick="crmGpsVisitReviewDecisionV2354(\''+escHtml(routeId(r))+'\',\''+escHtml(visitId(v))+'\',true)">✅ Подтвердить визит</button><button class="btn-secondary" style="border-color:#FCA5A5;color:#B91C1C" onclick="crmGpsVisitReviewDecisionV2354(\''+escHtml(routeId(r))+'\',\''+escHtml(visitId(v))+'\',false)">❌ Не был</button></div>':'<span class="tag tag-a">На проверке руководителя</span>')
    +'</div>';
}
function renderReviewCard(){
  const page=document.getElementById('page-visits');
  if(!page)return;
  let card=document.getElementById('gps-visit-review-v2354');
  const rows=pendingReviews();
  if(!rows.length){if(card)card.remove();return;}
  if(!card){
    card=document.createElement('div');card.id='gps-visit-review-v2354';card.className='card';card.style.marginBottom='12px';
    const anchor=document.getElementById('overdue-visits-block')||page.firstElementChild;
    if(anchor&&anchor.parentNode===page)page.insertBefore(card,anchor);else page.appendChild(card);
  }
  card.innerHTML='<div class="card-title" style="color:var(--am)">📍 Визиты без GPS-подтверждения — на разбор ('+rows.length+')</div>'
    +'<div style="font-size:11px;color:var(--sub);line-height:1.5;margin-bottom:7px">Отчёт менеджера сохранён, но физическое присутствие автоматически не подтверждено. Такая точка <b>не считается выполненной</b>, пока GPS не подтвердит визит или руководитель не примет решение.</div>'
    +rows.slice(0,100).map(reviewRow).join('');
}

const baseRenderVisits=(typeof window.renderVisits==='function'&&window.renderVisits)||(typeof renderVisits==='function'?renderVisits:null);
if(baseRenderVisits&&!baseRenderVisits.__gpsTruthV2354){
  const wrapped=function(){const out=baseRenderVisits.apply(this,arguments);setTimeout(renderReviewCard,0);return out;};
  wrapped.__gpsTruthV2354=true;wrapped.__base=baseRenderVisits;
  window.renderVisits=wrapped;try{renderVisits=wrapped;}catch(_){}
}

function install(){wrapSaver('saveVisit');wrapSaver('saveQuickVisit');renderReviewCard();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,0),{once:true});else setTimeout(install,0);
setTimeout(install,800);setTimeout(install,2200);

window.RESANTA_VISIT_GPS_TRUTH_V2354=Object.freeze({
  version:VERSION,
  strictFrom:STRICT_FROM,
  autoConfirmGpsStatus:'confirmed',
  taskReportDoesNotConfirmVisit:true,
  bossReviewFor:['no_gps','unverified','far','unknown'],
  noSchemaChanges:true,
  routeHistoryBeforeCutoffUntouched:true
});
})();
