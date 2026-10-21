/* Route director toolbar v1: month navigation + absences above search.
 * Presentation-only; no writes and no background polling.
 */
(function(){
'use strict';
if(window.RESANTA_ROUTE_BOSS_TOOLBAR_V1)return;
const ID='crm-route-topbar-v1',PAGE='page-routes-boss';
function boss(){try{return currentProfile?.role==='boss'}catch(_){return false}}
function active(){return !!document.getElementById(PAGE)?.classList.contains('active')}
function month(){try{return localStorage.getItem('crm_route_month_boss')||''}catch(_){return''}}
function style(){
 if(document.getElementById('crm-route-toolbar-css-v1'))return;
 const el=document.createElement('style');el.id='crm-route-toolbar-css-v1';
 el.textContent=[
 '#page-routes-boss #crm-route-topbar-v1{position:sticky;top:56px;z-index:42;background:rgba(249,250,251,.98);backdrop-filter:blur(8px);border:1px solid #dbe4ef;box-shadow:0 3px 10px rgba(15,23,42,.06);border-radius:10px;padding:8px 10px;margin:12px 0;display:flex;align-items:center;gap:10px;max-width:100%;box-sizing:border-box}',
 '#page-routes-boss #route-month-tabs-boss{display:flex!important;flex:1 1 280px;min-width:0;max-width:100%;overflow-x:auto!important;overflow-y:hidden!important;flex-wrap:nowrap!important;align-items:center;gap:8px;padding:3px 0;margin:0!important;scrollbar-width:thin;overscroll-behavior-x:contain}',
 '#page-routes-boss #route-month-tabs-boss .chip{display:inline-flex!important;flex:0 0 auto!important;white-space:nowrap!important;min-height:38px;align-items:center;justify-content:center;border-radius:9px}',
 '#page-routes-boss #route-month-tabs-boss .chip.active{background:#dbeafe!important;color:#174a85!important;border:1px solid #4387c6!important;font-weight:700}',
 '#page-routes-boss #crm-route-topbar-v1 #manager-absence-btn{display:inline-flex!important;flex:0 0 auto!important;align-items:center;justify-content:center;white-space:nowrap;min-height:38px;padding:8px 12px!important;border-radius:9px!important}',
 // Obsolete v22.4 route controls are disconnected from the current manual director planner.
 '#page-routes-boss #rb-search-top-v2351,#page-routes-boss #route-v224-filters,#page-routes-boss>.search-wrap,#page-routes-boss #rb-mgr-chips{display:none!important}',
 '#page-routes-boss #rb-search-top-v2351{top:calc(56px + var(--crm-route-toolbar-height,56px))!important;z-index:41!important}',
 '@media(max-width:730px){#page-routes-boss #crm-route-topbar-v1{gap:5px;flex-wrap:wrap;padding:6px;top:54px}#page-routes-boss #route-month-tabs-boss{flex:1 1 100%;width:100%}#page-routes-boss #crm-route-topbar-v1 #manager-absence-btn{width:100%;flex:1 1 auto!important;font-size:12px!important}#page-routes-boss #rb-search-top-v2351{top:calc(54px + var(--crm-route-toolbar-height,90px))!important}}'
 ].join('\n');
 document.head.appendChild(el);
}
function updateSelected(){
 const bar=document.getElementById(ID),tabs=bar?.querySelector('#route-month-tabs-boss');if(!tabs)return;
 const selected=month();
 tabs.querySelectorAll('button').forEach(b=>{
  const m=String(b.getAttribute('onclick')||'').match(/'boss'\s*,\s*'(\d{4}-\d{2})'/);
  if(!m)return;
  const chosen=m[1]===selected;
  b.classList.toggle('active',chosen);
  if(chosen)b.setAttribute('aria-current','date');else b.removeAttribute('aria-current');
 });
 const coverage=document.getElementById('rb-coverage-month');
 if(coverage&&/^\d{4}-(0[1-9]|1[0-2])$/.test(selected)&&coverage.value!==selected){
  coverage.value=selected;
  try{window.renderRouteCoverageV23675?.()}catch(e){console.warn('Route coverage sync:',e)}
 }
}
function geometry(){
 const page=document.getElementById(PAGE),bar=document.getElementById(ID);
 if(!page||!bar)return;
 page.style.setProperty('--crm-route-toolbar-height',Math.ceil((bar.offsetHeight||56)+8)+'px');
}
function install(){
 if(!boss())return false;
 const page=document.getElementById(PAGE),title=page?.querySelector('.page-title');
 const tabs=document.getElementById('route-month-tabs-boss'),absence=document.getElementById('manager-absence-btn');
 if(!page||!title||!tabs)return false;
 style();
 let bar=document.getElementById(ID);
 if(!bar){bar=document.createElement('div');bar.id=ID;bar.setAttribute('aria-label','Месяц маршрута и отсутствие менеджеров');}
 if(title.nextElementSibling!==bar)title.insertAdjacentElement('afterend',bar);
 if(tabs.parentElement!==bar)bar.appendChild(tabs);
 if(absence&&absence.parentElement!==bar)bar.appendChild(absence);
 updateSelected();geometry();
 return true;
}
const start=()=>{if(active())install()};
document.addEventListener('click',e=>{
 if(!boss())return;
 if(e.target.closest?.('#route-month-tabs-boss button')){
  window.setTimeout(()=>{updateSelected();geometry()},0);
 }else if(e.target.closest?.('.nav-item,.bn-item,[data-page]')){
  window.setTimeout(start,160);
 }
},true);
window.addEventListener('hashchange',()=>window.setTimeout(start,100));
window.addEventListener('resize',()=>{if(active())geometry()},{passive:true});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
window.RESANTA_ROUTE_BOSS_TOOLBAR_V1=Object.freeze({version:'route-toolbar-1.0.1',layoutOnly:true,install});
})();