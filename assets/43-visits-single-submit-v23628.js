/* RESANTA CRM v23.6.28 · VISITS SINGLE-SUBMIT ROOT FIX
 * Root cause:
 * - visit save buttons remained active while async save/GPS follow-up was still running;
 * - on slow mobile networks a manager could tap Save again and start a second save flow.
 *
 * Protection layers after this patch:
 * 1) UI single-flight lock for normal + quick visits;
 * 2) existing server route idempotency;
 * 3) existing DB unique exact-visit index.
 *
 * No GPS truth / route / task / visit business rules are changed.
 */
(function(){
'use strict';
if(window.RESANTA_VISITS_SINGLE_SUBMIT_V23628)return;
const V='v23.6.28';
const locks={visit:null,quick:null};

function buttonsFor(fnName,modalId){
  const root=document.getElementById(modalId)||document;
  return [...root.querySelectorAll('button')].filter(b=>String(b.getAttribute('onclick')||'').includes(fnName));
}
function lockButtons(fnName,modalId){
  const rows=buttonsFor(fnName,modalId).map(b=>({
    b,
    disabled:!!b.disabled,
    html:b.innerHTML,
    aria:b.getAttribute('aria-busy')
  }));
  rows.forEach(x=>{
    x.b.disabled=true;
    x.b.setAttribute('aria-busy','true');
    x.b.innerHTML='⏳ Сохраняем…';
  });
  return rows;
}
function restoreButtons(rows){
  (rows||[]).forEach(x=>{
    try{
      x.b.disabled=x.disabled;
      x.b.innerHTML=x.html;
      if(x.aria===null)x.b.removeAttribute('aria-busy');else x.b.setAttribute('aria-busy',x.aria);
    }catch(_){}
  });
}
function wrap(name,key,modalId){
  const current=window[name];
  if(typeof current!=='function')return false;
  if(current.__resantaVisitSingleSubmitV23628)return true;
  const base=current;
  const wrapped=function(){
    if(locks[key])return locks[key];
    const ui=lockButtons(name,modalId);
    let run;
    try{
      run=Promise.resolve(base.apply(this,arguments));
    }catch(e){
      restoreButtons(ui);
      throw e;
    }
    const guarded=run.finally(()=>{
      if(locks[key]===guarded)locks[key]=null;
      restoreButtons(ui);
    });
    locks[key]=guarded;
    return guarded;
  };
  try{Object.defineProperty(wrapped,'__resantaVisitSingleSubmitV23628',{value:true});}catch(_){wrapped.__resantaVisitSingleSubmitV23628=true;}
  window[name]=wrapped;
  return true;
}
function install(){
  const a=wrap('saveVisit','visit','modal-visit');
  const b=wrap('saveQuickVisit','quick','modal-quick-visit');
  return a&&b;
}
install();
[250,700,1500,3000,6000].forEach(ms=>setTimeout(install,ms));
window.addEventListener('pageshow',()=>setTimeout(install,0));
window.RESANTA_VISITS_SINGLE_SUBMIT_V23628=Object.freeze({
  version:V,
  normalVisitSingleFlight:true,
  quickVisitSingleFlight:true,
  serverIdempotencyPreserved:true,
  gpsLogicUntouched:true,
  routeLogicUntouched:true,
  taskLogicUntouched:true
});
console.info('RESANTA visits single-submit '+V+' installed');
})();
