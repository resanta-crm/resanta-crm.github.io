/* RESANTA CRM v23.6.122 · TRIOVIST · GROUP DYNAMICS REFRESH GUARD
 * Captures the live manager/period controls before the global Triovist refresh
 * can rerender the workspace. The existing v23.6.121 wrapper then restores
 * the saved controls and reapplies them. No business-data writes. No polling.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_GROUP_DYNAMICS_REFRESH_V236122)return;
const V='v23.6.122',BASE='resanta_triovist_groups_filters_v236121';
const panel=()=>document.getElementById('tr14-panel');
const q=(h,s)=>h?.querySelector(s)||null;
function ctx(){
  const h=panel();
  if(h?.__trgd121ctx)return h.__trgd121ctx;
  try{
    const p=(typeof currentProfile!=='undefined'&&currentProfile)||window.currentProfile||(typeof currentUser!=='undefined'&&currentUser)||window.currentUser||null;
    return p?{email:p.email||''}:null;
  }catch(_){return null}
}
function key(c){return BASE+'|'+String(c?.email||'unknown').toLowerCase()}
function read(h){return{
  manager:q(h,'[data-trgd-manager]')?.value||'',
  quick:q(h,'[data-trgd-quick]')?.value||'month',
  from:q(h,'[data-trgd-from]')?.value||'',to:q(h,'[data-trgd-to]')?.value||'',
  compareMode:q(h,'[data-trgd-compare-mode]')?.value||'year',
  cfrom:q(h,'[data-trgd-cfrom]')?.value||'',cto:q(h,'[data-trgd-cto]')?.value||'',
  sort:q(h,'[data-trgd-sort]')?.value||'revenue',
  view:q(h,'[data-trgd-view].on')?.dataset?.trgdView||'all'
}}
function valid(s){return !!(s&&/^\d{4}-\d{2}$/.test(s.from||'')&&/^\d{4}-\d{2}$/.test(s.to||'')&&/^\d{4}-\d{2}$/.test(s.cfrom||'')&&/^\d{4}-\d{2}$/.test(s.cto||''))}
function capture(){
  const h=panel(),c=ctx();
  if(!h?.querySelector('.trgd'))return false;
  const s=read(h);if(!valid(s))return false;
  try{localStorage.setItem(key(c),JSON.stringify(s));sessionStorage.setItem('trgd122_refresh_pending',JSON.stringify({at:Date.now(),key:key(c)}));return true}catch(_){return false}
}
function groupsActive(){return !!document.querySelector('#tr14-shell [data-tr14="groups"].on')&&!!panel()?.querySelector('.trgd')}
// Capture phase is intentional: the ROOT refresh handler lives on #tr14-shell
// and may rerender Triovist before the async group wrapper can read the controls.
document.addEventListener('click',e=>{
  if(e.target?.closest?.('[data-tr14-refresh]')&&groupsActive())capture();
},true);
// Also persist direct edits immediately, so a tab switch/re-render keeps them.
document.addEventListener('change',e=>{
  if(!groupsActive())return;
  if(e.target?.closest?.('[data-trgd-manager],[data-trgd-quick],[data-trgd-from],[data-trgd-to],[data-trgd-compare-mode],[data-trgd-cfrom],[data-trgd-cto],[data-trgd-sort]'))capture();
},true);
window.RESANTA_TRIOVIST_GROUP_DYNAMICS_REFRESH_V236122=Object.freeze({version:V,capture,noPolling:true,readOnly:true});
})();
