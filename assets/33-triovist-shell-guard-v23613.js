/* RESANTA CRM v23.6.13 · TRIOVIST SHELL VISIBILITY ROOT
 * Permanent compatibility guard between the legacy Triovist tab switcher
 * and the v23.6.12 unified workspace.
 * The legacy switcher may set display:none on unknown direct children of
 * #page-triovist. This guard keeps only the unified v23.6.12 shell visible
 * and does not touch business data, RPCs, GPS, routes, sales or Supabase.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_SHELL_GUARD_V23613)return;
const V='v23.6.13';
let observer=null,timer=null;

function page(){return document.getElementById('page-triovist');}
function shells(){return [...document.querySelectorAll('#tri-v23612-shell')];}
function panels(){return [...document.querySelectorAll('#tri-v23612-panel')];}

function keepLatest(list){
  if(list.length<=1)return list[0]||null;
  const keep=list[list.length-1];
  for(const el of list.slice(0,-1)){
    try{el.remove();}catch(_){}
  }
  return keep;
}

function forceVisible(el){
  if(!el)return;
  el.hidden=false;
  el.removeAttribute('aria-hidden');
  if(el.style.getPropertyValue('display')!=='block'||el.style.getPropertyPriority('display')!=='important')
    el.style.setProperty('display','block','important');
  if(el.style.getPropertyValue('visibility')!=='visible'||el.style.getPropertyPriority('visibility')!=='important')
    el.style.setProperty('visibility','visible','important');
  if(el.style.getPropertyValue('opacity')!=='1'||el.style.getPropertyPriority('opacity')!=='important')
    el.style.setProperty('opacity','1','important');
}

function normalize(){
  const p=page();if(!p)return false;
  const shell=keepLatest(shells());
  const panel=keepLatest(panels());
  if(!shell)return false;
  forceVisible(shell);
  // Commercial panel must remain controlled by v23.6.12 itself.
  // We only make sure it stays next to the current shell if it exists.
  if(panel&&panel.parentElement===p&&shell.nextElementSibling!==panel){
    try{shell.insertAdjacentElement('afterend',panel);}catch(_){}
  }
  return true;
}

function schedule(delay=0){
  clearTimeout(timer);
  timer=setTimeout(normalize,delay);
}

function installObserver(){
  const p=page();if(!p||observer)return;
  observer=new MutationObserver(muts=>{
    let relevant=false;
    for(const m of muts){
      if(m.type==='childList'){relevant=true;break;}
      if(m.type==='attributes'){
        const t=m.target;
        if(t?.id==='tri-v23612-shell'||t?.id==='tri-v23612-panel'){relevant=true;break;}
      }
    }
    if(relevant)schedule(0);
  });
  observer.observe(p,{childList:true,subtree:true,attributes:true,attributeFilter:['style','hidden','class']});
}

function boot(){
  installObserver();
  normalize();
  // Base tab clicks mutate display after their handler runs.
  document.addEventListener('click',e=>{
    if(!e.target?.closest?.('#page-triovist button'))return;
    schedule(0);setTimeout(normalize,40);setTimeout(normalize,160);
  },true);
  window.addEventListener('focus',()=>schedule(0));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(0);});
  // Startup/re-render safety without permanent heavy polling.
  [100,300,700,1500,3000,6000].forEach(ms=>setTimeout(()=>{installObserver();normalize();},ms));
  window.RESANTA_TRIOVIST_SHELL_GUARD_V23613=Object.freeze({
    version:V,
    protectsUnifiedShell:true,
    legacyTabDisplayConflictFixed:true,
    duplicateShellCleanup:true,
    noBusinessDataChanges:true,
    noSqlChanges:true,
    gpsUntouched:true,
    routesUntouched:true
  });
  console.info('RESANTA Triovist '+V+' shell guard installed');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
