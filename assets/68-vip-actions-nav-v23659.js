/* RESANTA CRM v23.6.62 · VIP ACTIONS NAV BOOTSTRAP */
(function(){
'use strict';
if(window.RESANTA_VIP_ACTIONS_NAV_V23659)return;
function p(){try{return typeof currentProfile!=='undefined'?currentProfile:window.currentProfile}catch(_){return window.currentProfile||null}}
function allowed(){const x=p(),r=String(x?.role||'').toLowerCase(),s=String(x?.access_scope||'standard').toLowerCase();return r==='boss'||(r==='manager'&&s!=='triovist')}
let flight=null;
function load(){
  if(window.RESANTA_VIP_ACTIONS_V23659)return Promise.resolve(true);
  if(flight)return flight;
  flight=new Promise(resolve=>{
    const old=document.querySelector('script[data-vip-actions-v23659]');
    if(old){old.addEventListener('load',()=>resolve(true),{once:true});old.addEventListener('error',()=>resolve(false),{once:true});return}
    const s=document.createElement('script');s.src='./assets/67-vip-actions-v23659.js?v=23.6.62';s.async=true;s.dataset.vipActionsV23659='1';s.onload=()=>resolve(true);s.onerror=()=>resolve(false);document.head.appendChild(s);
  }).finally(()=>{flight=null});
  return flight;
}
function ensure(){
  let n=document.getElementById('nav-vip-actions-bootstrap');
  const real=document.getElementById('nav-vip-actions');
  if(real){n?.remove();real.style.display=allowed()?'flex':'none';return allowed()}
  if(!allowed()){if(n)n.style.display='none';return false}
  if(!n){
    n=document.createElement('button');n.className='nav-item';n.id='nav-vip-actions-bootstrap';n.innerHTML='<span class="icon">🎯</span> Акции VIP';
    n.onclick=async()=>{n.disabled=true;try{const ok=await load();if(!ok){alert('Не удалось загрузить раздел «Акции VIP»');return}document.getElementById('nav-vip-actions-bootstrap')?.remove();try{goPage('vip-actions','Акции VIP')}catch(_){}setTimeout(()=>window.crmVipActionsOpenV23659?.(false),0)}finally{n.disabled=false}};
    (document.getElementById('nav-promotions')||document.getElementById('nav-vip'))?.insertAdjacentElement('afterend',n);
  }
  n.style.display='flex';return true;
}
function boot(){ensure();window.addEventListener('pageshow',()=>setTimeout(ensure,0),{passive:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.RESANTA_VIP_ACTIONS_NAV_V23659=Object.freeze({version:'v23.6.62',lazy:true,noDataReads:true,noPolling:true});
})();