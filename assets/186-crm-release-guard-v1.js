/* RESANTA CRM · release guard: detect stale open tabs, never reload without consent.
 * UI-only. No DB writes, no cache/storage clearing, no changes to CRM workflows.
 */
(function(w,d){
'use strict';
if(w.RESANTA_CRM_RELEASE_GUARD_V1)return;
const build=typeof APP_VERSION==='string'?APP_VERSION:'';
const interval=10*60*1000;
let lastCheck=0,busy=false,ignored='',currentNotice=null;
function show(newVersion){
 if(currentNotice||ignored===newVersion||!d.body)return;
 const node=d.createElement('aside');
 node.id='crm-release-update-notice';
 node.setAttribute('role','status');
 node.style.cssText='position:fixed;right:18px;bottom:18px;z-index:200001;max-width:340px;background:#fff;color:#1f3550;border:1px solid #b9cee5;border-radius:12px;box-shadow:0 8px 26px rgba(22,54,84,.18);padding:14px 15px;font:13px/1.5 system-ui,-apple-system,sans-serif';
 const msg=d.createElement('div');
 msg.textContent='Доступна новая версия РЕСАНТА CRM. Сохрани незавершённые изменения и обнови страницу, чтобы увидеть новые разделы.';
 const actions=d.createElement('div');
 actions.style.cssText='display:flex;gap:8px;justify-content:flex-end;margin-top:11px';
 const later=d.createElement('button');
 later.type='button';later.textContent='Позже';
 const update=d.createElement('button');
 update.type='button';update.textContent='Обновить CRM';
 [later,update].forEach(btn=>btn.style.cssText='border-radius:7px;padding:7px 10px;border:1px solid #b9cee5;cursor:pointer;font:600 12px system-ui');
 update.style.cssText+=';background:#1768ad;color:white;border-color:#1768ad';
 later.addEventListener('click',()=>{ignored=newVersion;node.remove();currentNotice=null});
 update.addEventListener('click',()=>{
   const url=new URL(w.location.href);
   url.searchParams.set('crm_build_refresh',String(Date.now()));
   w.location.assign(url.toString());
 });
 actions.append(later,update);node.append(msg,actions);d.body.appendChild(node);currentNotice=node;
}
async function check(){
 if(!build||d.hidden||busy||Date.now()-lastCheck<interval)return;
 busy=true;lastCheck=Date.now();
 const controller=new AbortController();
 const timeout=w.setTimeout(()=>controller.abort(),8000);
 try{
  const url=new URL('/index.html',w.location.origin);
  url.searchParams.set('crm_release_probe',String(Date.now()));
  const response=await w.fetch(url.toString(),{cache:'no-store',credentials:'same-origin',signal:controller.signal});
  if(!response.ok)return;
  const source=await response.text();
  const match=source.match(/const\s+APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if(match&&match[1]!==build)show(match[1]);
 }catch(e){ /* Offline or blocked: do not interrupt the CRM. */ }
 finally{w.clearTimeout(timeout);busy=false}
}
w.setTimeout(check,45000);
w.setInterval(check,5*60*1000);
d.addEventListener('visibilitychange',()=>{if(!d.hidden)void check()});
w.addEventListener('focus',()=>{void check()});
w.RESANTA_CRM_RELEASE_GUARD_V1=Object.freeze({version:'1.0',build,check,readOnly:true,autoReload:false});
})(window,document);
