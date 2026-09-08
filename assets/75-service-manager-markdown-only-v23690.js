/* RESANTA CRM v23.6.90 · SERVICE MANAGER = MARKDOWN ONLY
 * Dedicated lightweight shell for service_manager.
 * Access: only the "Уценка" section.
 * No clients, sales, GPS, routes, payments, warehouse, promotions or Triovist preload.
 */
(function(){
'use strict';
if(window.RESANTA_SERVICE_MANAGER_MARKDOWN_ONLY_V23690)return;
const V='v23.6.90';

function profile(){
  try{return typeof currentProfile!=='undefined'?currentProfile:(window.currentProfile||null)}catch(_){return window.currentProfile||null}
}
function isServiceManager(){
  return String(profile()?.role||'').toLowerCase()==='service_manager';
}
function clearHeavyState(){
  try{allClients=[]}catch(_){} try{allTasks=[]}catch(_){} try{allVisits=[]}catch(_){}
  try{allRoutePlans=[]}catch(_){} try{allNegotiations=[]}catch(_){} try{allPurchases=[]}catch(_){}
  try{allPurchaseItems=[]}catch(_){} try{allPurchaseHistory=[]}catch(_){} try{allClientPhotos=[]}catch(_){}
  try{allVipSales=[]}catch(_){} try{allVipPromotions=[]}catch(_){} try{allPromotions=[]}catch(_){}
  try{allPromotionBudgets=[]}catch(_){} try{allClientDebt=[]}catch(_){} try{allStock=[]}catch(_){}
  try{allPrice=[]}catch(_){} try{allImportStatus=[]}catch(_){} try{allUsers=profile()?[profile()]:[]}catch(_){}
}

const baseBootstrap=window.crmFastBootstrapV22733;
if(typeof baseBootstrap==='function'){
  window.crmFastBootstrapV22733=async function(){
    if(!isServiceManager())return baseBootstrap.apply(this,arguments);
    clearHeavyState();
    return true;
  };
}
const baseWarm=window.crmWarmDashboardV22733;
if(typeof baseWarm==='function'){
  window.crmWarmDashboardV22733=function(){
    if(isServiceManager())return Promise.resolve(true);
    return baseWarm.apply(this,arguments);
  };
}
const baseEnsure=window.crmEnsurePageDataV22733;
if(typeof baseEnsure==='function'){
  window.crmEnsurePageDataV22733=function(){
    if(isServiceManager())return Promise.resolve(true);
    return baseEnsure.apply(this,arguments);
  };
}
const basePrefetch=window.crmUltraPrefetchPageV22734;
if(typeof basePrefetch==='function'){
  window.crmUltraPrefetchPageV22734=function(){
    if(isServiceManager())return;
    return basePrefetch.apply(this,arguments);
  };
}

function lockMenus(){
  if(!isServiceManager())return false;
  document.querySelectorAll('.nav-item').forEach(el=>{
    el.style.display=el.id==='nav-markdown'?'flex':'none';
    el.classList.toggle('active',el.id==='nav-markdown');
  });
  document.querySelectorAll('.nav-section').forEach(el=>el.style.display='none');
  document.querySelectorAll('.mobile-nav-item,.bottom-nav-item,.bn-item').forEach(el=>{
    el.style.display=el.id==='bn-markdown'?'flex':'none';
  });
  const t=document.querySelector('.topbar-title');
  if(t)t.textContent='Уценка';
  return true;
}
function enterMarkdown(){
  if(!isServiceManager())return false;
  clearHeavyState();
  lockMenus();
  const page=document.getElementById('page-markdown');
  const nav=document.getElementById('nav-markdown');
  if(page?.classList.contains('active')){
    try{window.crmMarkdownOpenV23687?.(false)}catch(_){}
    return true;
  }
  if(nav){
    nav.style.display='flex';
    nav.click();
    return true;
  }
  return false;
}

try{
  if(typeof goPage==='function'){
    const baseGoPage=goPage;
    goPage=function(p,title){
      if(isServiceManager()&&p!=='markdown'){p='markdown';title='Уценка'}
      const out=baseGoPage.call(this,p,title);
      if(isServiceManager())setTimeout(lockMenus,0);
      return out;
    };
  }
}catch(_){}

try{
  if(typeof buildDashboard==='function'){
    const baseBuildDashboard=buildDashboard;
    buildDashboard=function(){
      if(isServiceManager()){setTimeout(enterMarkdown,0);return;}
      return baseBuildDashboard.apply(this,arguments);
    };
  }
}catch(_){}

let tries=0;
(function settle(){
  if(isServiceManager()){enterMarkdown();return;}
  if(++tries<80)setTimeout(settle,150);
})();
window.addEventListener('pageshow',()=>{if(isServiceManager())setTimeout(enterMarkdown,0)});
window.addEventListener('focus',()=>{if(isServiceManager())setTimeout(lockMenus,0)});

window.RESANTA_SERVICE_MANAGER_MARKDOWN_ONLY_V23690=Object.freeze({
  version:V,
  role:'service_manager',
  markdownOnly:true,
  noHeavyBootstrap:true,
  noPrefetch:true,
  noPolling:true,
  noMutationObserver:true
});
})();