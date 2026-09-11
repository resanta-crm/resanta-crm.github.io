/* RESANTA CRM v23.6.105 · PROMOTIONS WORK FILTER ROOT FIX
 * Fixes two mismatches in v23.6.8:
 * 1) "В работе" = raw status in_work only.
 * 2) Leaving the Work view restores the previous status filter instead of
 *    leaking the technical `all` filter and showing already completed actions.
 * UI-only: no promotion writes, budgets or approval transitions are changed.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_WORK_FILTER_V23626)return;
const VERSION='v23.6.105';
let workMode=false,returnFilter='current';
function promos(){try{return typeof allPromotions!=='undefined'&&Array.isArray(allPromotions)?allPromotions:(Array.isArray(window.allPromotions)?window.allPromotions:[])}catch(_){return[]}}
function isBoss(){try{return typeof promoIsBoss==='function'&&promoIsBoss()}catch(_){return false}}
function isWork(p){return !!p&&String(p.status||'')==='in_work'}
function workCount(){return promos().filter(isWork).length}
function promoIdFromCard(card){const btn=[...card.querySelectorAll('button')].find(b=>/Открыть/i.test(String(b.textContent||'')));const oc=btn?.getAttribute('onclick')||'';const m=oc.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);return m?m[0]:''}
function paintTabs(){
  const host=document.getElementById('promo-v2368-director');if(!host)return;
  const work=host.querySelector('[data-v2368-work]'),decision=host.querySelector('[data-v2368-open-action]');
  if(work){work.classList.toggle('primary',workMode);const b=work.querySelector('b');if(b)b.textContent=String(workCount())}
  if(decision)decision.classList.toggle('primary',!workMode);
  const actions=host.querySelector('.promo-v2368-action-list');if(actions)actions.style.display=workMode?'none':'';
}
function applyWorkView(){
  if(!workMode||!isBoss())return;
  const list=document.getElementById('promo-list');if(!list)return;
  const byId=new Map(promos().map(p=>[String(p.id),p]));let shown=0;
  list.querySelectorAll('.promo-card').forEach(card=>{const show=isWork(byId.get(String(promoIdFromCard(card))));card.style.display=show?'':'none';if(show)shown++});
  let empty=document.getElementById('promo-v23626-work-empty');
  if(!shown){if(!empty){empty=document.createElement('div');empty.id='promo-v23626-work-empty';empty.className='card';empty.style.cssText='text-align:center;color:var(--sub);padding:28px';empty.textContent='Акций в работе по выбранным фильтрам нет';list.appendChild(empty)}}else empty?.remove();
  paintTabs();
}
function openWork(){
  if(!isBoss())return;
  const f=document.getElementById('promo-status-filter');
  if(f&&f.value&&f.value!=='all')returnFilter=f.value;
  workMode=true;
  try{window.promoApprovalStageFilter='all'}catch(_){}
  if(f)f.value='all';
  try{renderPromotions()}catch(e){console.warn('Promotions '+VERSION+' render work',e)}
  setTimeout(applyWorkView,0);setTimeout(applyWorkView,70);
}
function leaveWork(restoreFilter=true){
  if(!workMode)return;
  workMode=false;
  document.getElementById('promo-v23626-work-empty')?.remove();
  if(restoreFilter){const f=document.getElementById('promo-status-filter');if(f&&f.value==='all')f.value=returnFilter||'current';}
  setTimeout(paintTabs,0);
}
function bind(){
  window.addEventListener('click',e=>{
    const work=e.target?.closest?.('[data-v2368-work]');
    if(work){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();openWork();return}
    if(e.target?.closest?.('[data-v2368-open-action]'))leaveWork(true);
  },true);
  window.addEventListener('change',e=>{
    if(e.target?.id==='promo-status-filter'){
      const v=String(e.target.value||'current');
      if(workMode)leaveWork(false);
      if(v!=='all')returnFilter=v;
    }
    if(workMode&&e.target?.id==='promo-manager-filter')setTimeout(applyWorkView,0);
  },true);
}
function install(){
  if(window.RESANTA_PROMOTIONS_WORK_FILTER_V23626)return true;
  if(typeof window.renderPromotions!=='function')return false;
  const base=window.renderPromotions;
  const wrapped=function(){const r=base.apply(this,arguments);setTimeout(()=>{try{paintTabs();if(workMode)applyWorkView()}catch(e){console.warn('Promotions '+VERSION+' view',e)}},0);if(workMode)setTimeout(applyWorkView,70);return r};
  window.renderPromotions=wrapped;try{renderPromotions=wrapped}catch(_){}
  bind();setTimeout(paintTabs,0);
  window.RESANTA_PROMOTIONS_WORK_FILTER_V23626=Object.freeze({version:VERSION,rootFix:true,workStatus:'in_work',approvedMeansWaitingManager:true,allWorkDates:true,restoresPreviousFilter:true,dbWrites:false,budgetsUntouched:true,approvalFlowUntouched:true});
  console.info('RESANTA promotions '+VERSION+' work-filter root fix installed');return true;
}
if(!install()){let tries=0;const t=setInterval(()=>{tries++;if(install()||tries>=80)clearInterval(t)},150)}
})();
