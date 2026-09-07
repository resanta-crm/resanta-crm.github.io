/* RESANTA CRM v23.6.78 · VIP ACTIONS PERMANENT NAV */
(function(){
'use strict';
if(window.RESANTA_VIP_ACTIONS_NAV_V23659)return;

function p(){try{return typeof currentProfile!=='undefined'?currentProfile:window.currentProfile}catch(_){return window.currentProfile||null}}
function allowed(){
  const x=p(),r=String(x?.role||'').toLowerCase(),s=String(x?.access_scope||'standard').toLowerCase();
  return r==='boss'||(r==='manager'&&s!=='triovist');
}
function sync(){
  const n=document.getElementById('nav-vip-actions');
  if(n)n.style.display=allowed()?'flex':'none';
  return allowed();
}

let flight=null;
function load(){
  if(window.RESANTA_VIP_ACTIONS_V23659)return Promise.resolve(true);
  if(flight)return flight;
  flight=new Promise(resolve=>{
    const old=[...document.scripts].find(s=>String(s.src||'').includes('/67-vip-actions-v23659.js'));
    if(old){
      if(window.RESANTA_VIP_ACTIONS_V23659){resolve(true);return}
      let done=false;
      const finish=ok=>{if(done)return;done=true;resolve(ok)};
      old.addEventListener('load',()=>finish(!!window.RESANTA_VIP_ACTIONS_V23659),{once:true});
      old.addEventListener('error',()=>finish(false),{once:true});
      setTimeout(()=>{
        if(window.RESANTA_VIP_ACTIONS_V23659){finish(true);return}
        const s=document.createElement('script');
        s.src='./assets/67-vip-actions-v23659.js?v=23.6.78';
        s.async=false;
        s.onload=()=>finish(!!window.RESANTA_VIP_ACTIONS_V23659);
        s.onerror=()=>finish(false);
        document.head.appendChild(s);
      },350);
      return;
    }
    const s=document.createElement('script');
    s.src='./assets/67-vip-actions-v23659.js?v=23.6.78';
    s.async=false;
    s.onload=()=>resolve(!!window.RESANTA_VIP_ACTIONS_V23659);
    s.onerror=()=>resolve(false);
    document.head.appendChild(s);
  }).finally(()=>{flight=null});
  return flight;
}

window.crmVipActionsNavOpenV23673=async function(){
  if(!sync())return;
  const n=document.getElementById('nav-vip-actions');
  if(n)n.disabled=true;
  try{
    const ok=await load();
    if(!ok){alert('Не удалось загрузить раздел «Акции VIP»');return}
    try{goPage('vip-actions','Акции VIP')}catch(_){}
    setTimeout(()=>window.crmVipActionsOpenV23659?.(false),0);
  }finally{
    if(n)n.disabled=false;
  }
};

function boot(){
  sync();
  window.addEventListener('pageshow',()=>setTimeout(sync,0),{passive:true});
  window.addEventListener('focus',sync,{passive:true});
  try{
    const d=typeof db!=='undefined'?db:window.db;
    d?.auth?.onAuthStateChange?.(()=>setTimeout(sync,0));
  }catch(_){}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

window.RESANTA_VIP_ACTIONS_NAV_V23659=Object.freeze({
  version:'v23.6.78',
  permanentNav:true,
  managerStandardAllowed:true,
  triovistExcluded:true,
  lazyPageLoad:true,
  noDataReads:true,
  noPolling:true
});
})();