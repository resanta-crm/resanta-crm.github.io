/* RESANTA CRM v23.6.121 compatibility loader.
 * The former v23.6.12 workspace is intentionally retired: it fought with
 * legacy Triovist renders. This file remains only because permanent no-cache
 * bootstraps already point here.
 */
(function(){
'use strict';
const compat=Object.freeze({version:'v23.6.14',retired:true,delegatesTo:'v23.6.14'});
window.RESANTA_TRIOVIST_SINGLE_V23612=window.RESANTA_TRIOVIST_SINGLE_V23612||compat;
window.RESANTA_TRIOVIST_SINGLE_V23611=window.RESANTA_TRIOVIST_SINGLE_V23611||compat;
const cv=(()=>{try{return new URL(document.currentScript?.src||'',location.href).searchParams.get('v')||'23.6.121'}catch(_){return'23.6.121'}})().replace(/^v/,'');
function loadGroupFix(){
  if(window.RESANTA_TRIOVIST_GROUP_DYNAMICS_FIXES_V236121||document.querySelector('script[data-trgd-fix-v236121]'))return;
  const f=document.createElement('script');
  f.src='./assets/83-triovist-group-dynamics-fixes-v236121.js?v='+encodeURIComponent(cv);
  f.async=false;f.dataset.trgdFixV236121='1';
  f.onerror=()=>console.error('Triovist group dynamics fixes v23.6.121 failed to load; base analytics remains available.');
  document.head.appendChild(f);
}
if(window.RESANTA_TRIOVIST_ROOT_V23614){loadGroupFix();return;}
const stale=document.querySelector('script[data-triovist-root-v23614]');
if(stale){const age=Date.now()-Number(stale.dataset.triovistStartedAt||0);if(stale.dataset.triovistStartedAt&&age<5000){loadGroupFix();return;}stale.remove();}
const s=document.createElement('script');
s.src='./assets/34-triovist-root-v23614.js?v='+encodeURIComponent(cv);
s.async=false;
s.dataset.triovistRootV23614='1';
s.dataset.triovistStartedAt=String(Date.now());
s.onload=loadGroupFix;
s.onerror=()=>{console.error('Triovist ROOT v23.6.14 failed to load; base Triovist remains available.');loadGroupFix();};
document.head.appendChild(s);
})();
