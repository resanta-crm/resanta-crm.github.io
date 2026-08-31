/* RESANTA CRM v23.6.35 · ROUTE MONTH TAB ↔ MANUAL ROUTE SYNC
 * UI-only hotfix for boss route month tabs in lightweight manual-route mode.
 * - keeps month tabs clickable and visibly active;
 * - synchronizes crm_route_month_boss with the manual route date picker;
 * - preserves an existing date when it already belongs to the selected month;
 * - otherwise selects the first weekday of the selected month;
 * - no Supabase writes, no route generation, no polling, no heavy reload.
 */
(function(){
'use strict';
if(window.RESANTA_ROUTE_MONTH_TABS_SYNC_V23635)return;
const VERSION='v23.6.35';
const TAB_ROOT_ID='route-month-tabs-boss';
const DATE_ID='mrl-date';

function validMonth(v){return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v||''));}
function firstWorkday(ym){
  if(!validMonth(ym))return'';
  const y=Number(ym.slice(0,4)),m=Number(ym.slice(5,7))-1;
  const d=new Date(y,m,1,12,0,0,0);
  while(d.getDay()===0||d.getDay()===6)d.setDate(d.getDate()+1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function buttonMonth(btn){
  const raw=String(btn?.getAttribute?.('onclick')||'');
  const m=raw.match(/v221SelectRouteMonth\s*\(\s*['\"]boss['\"]\s*,\s*['\"](\d{4}-\d{2})['\"]\s*\)/i);
  return m?.[1]||'';
}
function paintActiveMonth(ym){
  const root=document.getElementById(TAB_ROOT_ID);if(!root||!validMonth(ym))return;
  root.querySelectorAll('button').forEach(btn=>{
    const active=buttonMonth(btn)===ym;
    btn.classList.toggle('active',active);
    btn.setAttribute('aria-pressed',active?'true':'false');
  });
}
function syncManualDate(ym){
  const input=document.getElementById(DATE_ID);if(!input||!validMonth(ym))return;
  const current=String(input.value||'').slice(0,10);
  if(current.startsWith(ym+'-'))return;
  const next=firstWorkday(ym);if(!next)return;
  input.value=next;
  try{input.dispatchEvent(new Event('change',{bubbles:true}));}catch(_){ }
}
function applyMonth(ym){
  if(!validMonth(ym))return;
  try{localStorage.setItem('crm_route_month_boss',ym);}catch(_){ }
  paintActiveMonth(ym);
  syncManualDate(ym);
}
function installWrapper(){
  const fn=window.v221SelectRouteMonth;
  if(typeof fn!=='function')return false;
  if(fn.__routeMonthSyncV23635)return true;
  const wrapped=function(kind,month){
    const result=fn.apply(this,arguments);
    if(kind==='boss'&&validMonth(month)){
      applyMonth(month);
      setTimeout(()=>{paintActiveMonth(month);syncManualDate(month);},0);
      setTimeout(()=>paintActiveMonth(month),120);
    }
    return result;
  };
  wrapped.__routeMonthSyncV23635=true;
  wrapped.__routeMonthSyncBase=fn;
  window.v221SelectRouteMonth=wrapped;
  return true;
}
function delegatedTabGuard(e){
  const btn=e.target?.closest?.('#'+TAB_ROOT_ID+' button');if(!btn)return;
  const ym=buttonMonth(btn);if(!validMonth(ym))return;
  setTimeout(()=>applyMonth(ym),0);
}
function install(){
  installWrapper();
  document.addEventListener('click',delegatedTabGuard,true);
  const selected=(()=>{try{return localStorage.getItem('crm_route_month_boss')||'';}catch(_){return'';}})();
  if(validMonth(selected))setTimeout(()=>paintActiveMonth(selected),0);
}
install();
[120,450,1000,2200].forEach(ms=>setTimeout(()=>{installWrapper();const ym=(()=>{try{return localStorage.getItem('crm_route_month_boss')||'';}catch(_){return'';}})();if(validMonth(ym))paintActiveMonth(ym);},ms));
window.RESANTA_ROUTE_MONTH_TABS_SYNC_V23635=Object.freeze({version:VERSION,uiOnly:true,noDbWrites:true,noRouteGeneration:true,noPolling:true,manualRoutePreserved:true});
console.info('RESANTA route month tabs sync '+VERSION+' installed');
})();
