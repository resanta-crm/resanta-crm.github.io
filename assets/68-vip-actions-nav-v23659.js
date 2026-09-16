/* RESANTA CRM v23.6.127 · VIP ACTIONS HIDDEN
 * Акции VIP больше не являются отдельным пользовательским контуром.
 * Данные и старый модуль 67 не удаляются: это только безопасное скрытие навигации.
 * Обычный раздел «Акции» и его согласование не меняются.
 * No data writes. No polling. No MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_VIP_ACTIONS_NAV_V23659)return;

function hide(){
  const n=document.getElementById('nav-vip-actions');
  if(n){
    n.style.display='none';
    n.disabled=true;
    n.setAttribute('aria-hidden','true');
    n.tabIndex=-1;
  }
  const page=document.getElementById('page-vip-actions');
  if(page){
    page.classList.remove('active');
    page.style.display='none';
    page.setAttribute('aria-hidden','true');
  }
  return true;
}

// Старые внешние вызовы не должны повторно открывать VIP-раздел.
window.crmVipActionsNavOpenV23673=function(){
  hide();
  try{
    const current=document.getElementById('page-vip-actions');
    if(current?.classList.contains('active')&&typeof goPage==='function')goPage('promotions','Акции');
  }catch(_){}
  return false;
};

function boot(){
  hide();
  window.addEventListener('pageshow',hide,{passive:true});
  window.addEventListener('focus',hide,{passive:true});
  try{
    const d=typeof db!=='undefined'?db:window.db;
    d?.auth?.onAuthStateChange?.(()=>setTimeout(hide,0));
  }catch(_){}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

window.RESANTA_VIP_ACTIONS_NAV_V23659=Object.freeze({
  version:'v23.6.127',
  hidden:true,
  dataPreserved:true,
  legacyModuleNotLoaded:true,
  noDataReads:true,
  noDataWrites:true,
  noPolling:true,
  noMutationObserver:true
});
})();
