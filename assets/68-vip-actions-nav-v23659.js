/* RESANTA CRM v23.6.131 · VIP ACTIONS HIDDEN
 * Акции VIP больше не являются отдельным пользовательским контуром.
 * Данные и старый модуль 67 не удаляются: это только безопасное скрытие навигации.
 * Обычный раздел «Акции» и его согласование не меняются.
 * No data writes. No polling. No MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_VIP_ACTIONS_NAV_V23659)return;

function hardCss(){
  if(document.getElementById('vip-actions-hard-hidden-v236131'))return;
  const s=document.createElement('style');
  s.id='vip-actions-hard-hidden-v236131';
  s.textContent='#nav-vip-actions,#nav-vip-actions-bootstrap,#page-vip-actions{display:none!important;visibility:hidden!important;pointer-events:none!important}';
  document.head.appendChild(s);
}
if(!window.RESANTA_VIP_ACTIONS_V23659)window.RESANTA_VIP_ACTIONS_V23659=Object.freeze({version:'disabled-v23.6.131',disabled:true});

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

window.crmVipActionsNavOpenV23673=function(){
  hide();
  try{
    const current=document.getElementById('page-vip-actions');
    if(current?.classList.contains('active')&&typeof goPage==='function')goPage('promotions','Акции');
  }catch(_){}
  return false;
};

function boot(){
  hardCss();
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
  version:'v23.6.131',
  hidden:true,
  dataPreserved:true,
  legacyModuleNotLoaded:true,
  noDataReads:true,
  noDataWrites:true,
  noPolling:true,
  noMutationObserver:true
});
})();
