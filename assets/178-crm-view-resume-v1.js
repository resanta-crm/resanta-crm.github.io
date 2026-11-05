/* RESANTA CRM · keep the same workspace when returning from another browser tab.
 * Read-only navigation state, isolated per browser tab and authenticated user.
 * No RPCs, no polling, no auth changes, no global refresh or forced reload.
 */
(function(w,d){
 'use strict';
 if(w.RESANTA_CRM_VIEW_RESUME_V1)return;
 const V='2026.11.05.2',KEY='resanta_crm_view_resume_v1';
 const TRI_LEADERS=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
 const TABS=new Set(['home','sales','groups','stock','tasks','motivation','cards','parser','competitors','infographics','anp','si','budget','price']);
 let resumeSeq=0,lastNavClick=0,restoreBusy=false,lastRepairAt=0;
 const profile=()=>{
  let p=null;
  try{if(typeof currentProfile!=='undefined')p=currentProfile}catch(_){}
  if(!p)p=w.currentProfile||null;
  return p?.email&&p?.role?{
   email:String(p.email).trim().toLowerCase(),
   role:String(p.role).toLowerCase(),
   scope:String(p.access_scope||'').toLowerCase()
  }:null;
 };
 const app=()=>d.getElementById('app');
 const signedIn=()=>!!profile()&&app()?.style?.display!=='none'&&d.getElementById('login-wrap')?.style?.display==='none';
 const page=()=>d.querySelector('.page.active')?.id?.replace(/^page-/,'')||'';
 const openTab=()=>String(d.querySelector('#tr14-shell [data-tr14].on')?.dataset?.tr14||d.getElementById('page-triovist')?.dataset?.triovistView||'');
 function capture(){
  const p=profile(),name=page();if(!signedIn()||!p||!name||!/^[a-z0-9-]{1,48}$/.test(name))return false;
  const item={v:1,email:p.email,role:p.role,scope:p.scope,page:name,tab:name==='triovist'&&TABS.has(openTab())?openTab():'',title:String(d.getElementById('topbar-title')?.textContent||'').slice(0,140),at:Date.now()};
  try{w.sessionStorage.setItem(KEY,JSON.stringify(item));return true}catch(_){return false}
 }
 function saved(){
  try{
   const raw=w.sessionStorage.getItem(KEY),x=raw?JSON.parse(raw):null;
   return x?.v===1&&typeof x.page==='string'&&/^[a-z0-9-]{1,48}$/.test(x.page)?x:null;
  }catch(_){return null}
 }
 function authorized(s,p){
  if(!p||!s||s.email!==p.email||s.role!==p.role||s.scope!==p.scope)return false;
  if(s.page==='triovist'){
   if(!(p.role==='boss'&&TRI_LEADERS.has(p.email))&&!(p.role==='manager'&&p.scope==='triovist'))return false;
  }else{
   if(p.scope==='triovist')return false;
   if(p.role==='auditor'||p.role==='auditor_pending')return s.page==='warehouse-control';
   if(p.role!=='boss'&&['control','managers','users','routes-boss'].includes(s.page))return false;
  }
  const target=d.getElementById('page-'+s.page);if(!target)return false;
  const nav=d.getElementById('nav-'+s.page)||d.getElementById('bn-'+s.page);
  if(!nav)return false;
  if(nav.style?.display==='none')return false;
  return true;
 }
 function restore(){
  if(restoreBusy||!signedIn()||d.visibilityState==='hidden')return false;
  const p=profile(),s=saved();if(!authorized(s,p))return false;
  const current=page();
  restoreBusy=true;
  try{
   if(current!==s.page){
    if(typeof w.goPage!=='function')return false;
    // Use the existing router so role checks, loaders and lazy rendering remain intact.
    w.goPage(s.page,s.title||(s.page==='triovist'?'Триовист / 21vek.by':'РЕСАНТА CRM'));
   }
   if(s.page==='triovist'&&TABS.has(s.tab)&&page()==='triovist'){
    const active=openTab();
    const buttons=d.querySelectorAll('#tr14-shell [data-tr14]')||[];
    const button=[...buttons].find(b=>b.dataset?.tr14===s.tab);
    if(active!==s.tab){
     // Existing Triovist router is the sole owner of access and section switching.
     button?.click?.();
    }else if(['anp','si','budget','price','groups','competitors'].includes(s.tab)){
     // The video bug: the active tab remains "Budget", but its working pane becomes
     // display:none after visibility lifecycle. Reconcile layout first (no RPC).
     const panel=d.getElementById('tr14-panel');
     const hidden=!!panel && panel.style?.getPropertyValue?.('display')==='none';
     if(hidden)w.RESANTA_TRIOVIST_ROOT_V23614?.resumeView?.();
     const finance=['anp','si','budget','price'].includes(s.tab);
     const incomplete=finance && !!panel && !panel.querySelector?.('.tr14-sec') &&
       !panel.querySelector?.('.tr14-info');
     // Reopen only if content was actually detached. Never wipe a healthy form.
     if(incomplete && Date.now()-lastRepairAt>5000 && button){
      lastRepairAt=Date.now();button.click?.();
     }
    }
   }
   return page()===s.page;
  }catch(e){console.warn('CRM resume: existing router could not restore view',e);return false}
  finally{restoreBusy=false}
 }
 function scheduleRestore(){
  const seq=++resumeSeq,requested=Date.now();
  // Bounded retries cover sleeping browser tabs and delayed authenticated startup.
  [100,450,1400,3500].forEach(ms=>setTimeout(()=>{
   if(seq!==resumeSeq||lastNavClick>requested||d.visibilityState==='hidden')return;
   restore();
  },ms));
 }
 d.addEventListener('visibilitychange',()=>{
  if(d.visibilityState==='hidden'){++resumeSeq;capture();}
  else scheduleRestore();
 });
 w.addEventListener('pagehide',()=>capture());
 w.addEventListener('pageshow',scheduleRestore);
 w.addEventListener('focus',scheduleRestore);
 // A deliberate user navigation supersedes an older saved snapshot.
 d.addEventListener('click',e=>{
  if(!e.target?.closest?.('.nav-item,.bn-item,[data-page],#tr14-shell [data-tr14]'))return;
  lastNavClick=Date.now();++resumeSeq;
  setTimeout(capture,140);
 },true);
 w.RESANTA_CRM_VIEW_RESUME_V1=Object.freeze({version:V,perTab:true,perUser:true,noRpc:true,noPolling:true,restore});
})(window,document);
