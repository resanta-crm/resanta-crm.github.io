/* RESANTA CRM v23.6.27 · PAYMENT REGISTRY NAV ROOT FIX
 * Root cause: payment registry loaded before currentProfile was ready; the module
 * stopped retrying after a short window and left the nav item hidden forever.
 * This lightweight layer only restores visibility after profile readiness.
 * No DB reads, no polling after settle, no business-data mutations.
 */
(function(){
'use strict';
if(window.RESANTA_PAYMENT_REGISTRY_NAV_ROOT_V23627)return;
const V='v23.6.27';
let settled=false,tries=0,timer=null;
function profile(){try{return typeof currentProfile!=='undefined'?currentProfile:(window.currentProfile||null)}catch(_){return window.currentProfile||null}}
function allowed(){const p=profile();const r=String(p?.role||'').toLowerCase(),e=String(p?.email||'').toLowerCase();return r==='boss'||r==='office_manager'||e==='payushin_ar@resanta.ru'||e==='sidarovich_kn@resanta.ru'}
function ensureVisible(){
  const nav=document.getElementById('nav-payment-registry');
  const p=profile();
  if(!p||!nav)return false;
  if(allowed())nav.style.display='flex';
  settled=true;
  if(timer){clearInterval(timer);timer=null;}
  return true;
}
function start(){
  if(ensureVisible())return;
  if(timer)return;
  timer=setInterval(()=>{
    tries++;
    if(ensureVisible()||tries>=120){clearInterval(timer);timer=null;}
  },250);
}
start();
window.addEventListener('pageshow',()=>setTimeout(start,0));
window.addEventListener('focus',()=>setTimeout(start,0));
try{
  const d=typeof db!=='undefined'?db:window.db;
  d?.auth?.onAuthStateChange?.(()=>{settled=false;tries=0;setTimeout(start,0)});
}catch(_){}
window.RESANTA_PAYMENT_REGISTRY_NAV_ROOT_V23627=Object.freeze({version:V,localOnly:true,noDbReads:true,noHeavyPolling:true});
})();
