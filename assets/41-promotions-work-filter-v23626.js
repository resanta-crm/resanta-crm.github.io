/* RESANTA CRM v23.6.26 · PROMOTIONS WORK FILTER ROOT FIX
 * Root cause fixed:
 * v23.6.8 counted raw statuses approved + in_work in the "В работе" KPI,
 * but its click switched the native filter to active_now, which only shows
 * promotions whose effective status is active today. Counter and list therefore
 * used different rules.
 *
 * This layer makes the director "В работе" button use the SAME rule as its KPI:
 * raw status approved OR in_work, regardless of whether the period is planned,
 * currently running, or already ended. No DB writes / budgets / approval flow.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_WORK_FILTER_V23626)return;
const VERSION='v23.6.26';
let workMode=false;

function promos(){
  try{return typeof allPromotions!=='undefined'&&Array.isArray(allPromotions)?allPromotions:(Array.isArray(window.allPromotions)?window.allPromotions:[])}catch(_){return []}
}
function isBoss(){try{return typeof promoIsBoss==='function'&&promoIsBoss()}catch(_){return false}}
function isWork(p){return !!p&&['approved','in_work'].includes(String(p.status||''));}
function promoIdFromCard(card){
  const btn=[...card.querySelectorAll('button')].find(b=>/Открыть/i.test(String(b.textContent||'')));
  const oc=btn?.getAttribute('onclick')||'';
  const m=oc.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);
  return m?m[0]:'';
}
function paintTabs(){
  const host=document.getElementById('promo-v2368-director');if(!host)return;
  const work=host.querySelector('[data-v2368-work]');
  const decision=host.querySelector('[data-v2368-open-action]');
  if(work)work.classList.toggle('primary',workMode);
  if(decision)decision.classList.toggle('primary',!workMode);
  const actions=host.querySelector('.promo-v2368-action-list');
  if(actions)actions.style.display=workMode?'none':'';
}
function applyWorkView(){
  if(!workMode||!isBoss())return;
  const list=document.getElementById('promo-list');if(!list)return;
  const byId=new Map(promos().map(p=>[String(p.id),p]));
  let shown=0;
  list.querySelectorAll('.promo-card').forEach(card=>{
    const p=byId.get(String(promoIdFromCard(card)));
    const show=isWork(p);
    card.style.display=show?'':'none';
    if(show)shown++;
  });
  let empty=document.getElementById('promo-v23626-work-empty');
  if(shown===0){
    if(!empty){empty=document.createElement('div');empty.id='promo-v23626-work-empty';empty.className='card';empty.style.cssText='text-align:center;color:var(--sub);padding:28px';empty.textContent='Акций в работе по выбранным менеджеру/поиску нет';list.appendChild(empty);}
  }else empty?.remove();
  paintTabs();
}
function openWork(){
  if(!isBoss())return;
  workMode=true;
  try{window.promoApprovalStageFilter='all'}catch(_){}
  const f=document.getElementById('promo-status-filter');
  if(f)f.value='all';
  try{renderPromotions()}catch(e){console.warn('Promotions '+VERSION+' render work',e)}
  setTimeout(applyWorkView,0);
  setTimeout(applyWorkView,60);
}
function leaveWork(){
  if(!workMode)return;
  workMode=false;
  document.getElementById('promo-v23626-work-empty')?.remove();
  setTimeout(paintTabs,0);
}
function bind(){
  // Window capture runs before the old v23.6.8 document-capture handler,
  // so the broken active_now switch never fires.
  window.addEventListener('click',e=>{
    const work=e.target?.closest?.('[data-v2368-work]');
    if(work){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openWork();return;}
    if(e.target?.closest?.('[data-v2368-open-action]'))leaveWork();
  },true);
  window.addEventListener('change',e=>{
    if(e.target?.id==='promo-status-filter'||e.target?.id==='promo-manager-filter')leaveWork();
  },true);
  const search=document.getElementById('promo-search');
  search?.addEventListener('input',()=>{if(workMode)setTimeout(applyWorkView,0)});
}
function install(){
  if(window.RESANTA_PROMOTIONS_WORK_FILTER_V23626)return true;
  if(typeof window.renderPromotions!=='function')return false;
  const base=window.renderPromotions;
  const wrapped=function(){const r=base.apply(this,arguments);if(workMode){setTimeout(applyWorkView,0);setTimeout(applyWorkView,50)}return r;};
  wrapped.__promoWorkFilterV23626=true;
  window.renderPromotions=wrapped;
  try{renderPromotions=wrapped}catch(_){}
  bind();
  window.RESANTA_PROMOTIONS_WORK_FILTER_V23626=Object.freeze({version:VERSION,rootFix:true,kpiAndListSameRule:true,workStatuses:['approved','in_work'],dbWrites:false,budgetsUntouched:true,approvalFlowUntouched:true});
  console.info('RESANTA promotions '+VERSION+' work-filter root fix installed');
  return true;
}
if(!install()){let tries=0;const t=setInterval(()=>{tries++;if(install()||tries>=80)clearInterval(t)},150)}
})();
