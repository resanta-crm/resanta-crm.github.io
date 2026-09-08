/* RESANTA CRM v23.6.92 · PAYMENT EXECUTOR = CASHLESS REGISTRY ONLY
 * Dedicated lightweight shell for payment_executor (Nesterov).
 * Access: only "Реестр безналичных оплат".
 * Workflow rights are enforced by Supabase RPCs.
 */
(function(){
'use strict';
if(window.RESANTA_PAYMENT_EXECUTOR_ONLY_V23692)return;
const V='v23.6.92';

function profile(){
  try{return typeof currentProfile!=='undefined'?currentProfile:(window.currentProfile||null)}catch(_){return window.currentProfile||null}
}
function isPaymentExecutor(){
  const p=profile();
  return String(p?.role||'').toLowerCase()==='payment_executor'
    && String(p?.email||'').toLowerCase()==='nesterov_py@resanta.ru';
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
    if(!isPaymentExecutor())return baseBootstrap.apply(this,arguments);
    clearHeavyState();
    return true;
  };
}
const baseWarm=window.crmWarmDashboardV22733;
if(typeof baseWarm==='function'){
  window.crmWarmDashboardV22733=function(){
    if(isPaymentExecutor())return Promise.resolve(true);
    return baseWarm.apply(this,arguments);
  };
}
const baseEnsure=window.crmEnsurePageDataV22733;
if(typeof baseEnsure==='function'){
  window.crmEnsurePageDataV22733=function(){
    if(isPaymentExecutor())return Promise.resolve(true);
    return baseEnsure.apply(this,arguments);
  };
}
const basePrefetch=window.crmUltraPrefetchPageV22734;
if(typeof basePrefetch==='function'){
  window.crmUltraPrefetchPageV22734=function(){
    if(isPaymentExecutor())return;
    return basePrefetch.apply(this,arguments);
  };
}

function lockMenus(){
  if(!isPaymentExecutor())return false;
  document.querySelectorAll('.nav-item').forEach(el=>{
    el.style.display=el.id==='nav-payment-registry'?'flex':'none';
    el.classList.toggle('active',el.id==='nav-payment-registry');
  });
  document.querySelectorAll('.nav-section').forEach(el=>el.style.display='none');
  document.querySelectorAll('.mobile-nav-item,.bottom-nav-item,.bn-item').forEach(el=>{
    el.style.display=(el.id==='bn-payment-registry'||el.id==='nav-payment-registry')?'flex':'none';
  });
  const t=document.querySelector('.topbar-title');
  if(t)t.textContent='Реестр безналичных оплат';
  return true;
}
function enterPayments(){
  if(!isPaymentExecutor())return false;
  clearHeavyState();
  lockMenus();
  const nav=document.getElementById('nav-payment-registry');
  const page=document.getElementById('page-payment-registry');
  if(nav){
    nav.style.display='flex';
    if(!page?.classList.contains('active'))nav.click();
    else setTimeout(()=>{try{nav.onclick?.()}catch(_){}},0);
    return true;
  }
  return false;
}

try{
  if(typeof goPage==='function'){
    const baseGoPage=goPage;
    goPage=function(p,title){
      if(isPaymentExecutor()&&p!=='payment-registry'){
        p='payment-registry';
        title='Реестр безналичных оплат';
      }
      const out=baseGoPage.call(this,p,title);
      if(isPaymentExecutor())setTimeout(lockMenus,0);
      return out;
    };
  }
}catch(_){}

try{
  if(typeof buildDashboard==='function'){
    const baseBuildDashboard=buildDashboard;
    buildDashboard=function(){
      if(isPaymentExecutor()){
        setTimeout(enterPayments,0);
        return;
      }
      return baseBuildDashboard.apply(this,arguments);
    };
  }
}catch(_){}

let tries=0;
(function settle(){
  if(isPaymentExecutor()){enterPayments();return;}
  if(++tries<80)setTimeout(settle,150);
})();
window.addEventListener('pageshow',()=>{if(isPaymentExecutor())setTimeout(enterPayments,0)});
window.addEventListener('focus',()=>{if(isPaymentExecutor())setTimeout(lockMenus,0)});

window.RESANTA_PAYMENT_EXECUTOR_ONLY_V23692=Object.freeze({
  version:V,
  role:'payment_executor',
  email:'nesterov_py@resanta.ru',
  paymentRegistryOnly:true,
  noHeavyBootstrap:true,
  noPrefetch:true,
  noPolling:true,
  noMutationObserver:true
});
})();