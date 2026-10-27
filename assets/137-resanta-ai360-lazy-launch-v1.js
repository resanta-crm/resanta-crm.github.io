/* AI360 optional desktop launch. On-demand only; no voice script runs at CRM login.
   Android/WebView stay excluded after the 22 Oct authentication incident. */
(function(){
'use strict';
if(/Android/i.test(navigator.userAgent||'') || window.__resantaAI360LazyLaunchV1)return;
window.__resantaAI360LazyLaunchV1=true;
let button=null,loading=false,ready=false;
const scripts=[
 './assets/134-resanta-voice-ai360-pilot-v1.js?v=15',
 './assets/135-resanta-voice-capture-fix-v2.js?v=13',
 './assets/136-resanta-voice-quality-v3.js?v=16',
 './assets/139-resanta-ai360-staff-resolver-v1.js?v=1',
 './assets/140-resanta-ai360-task-drafts-preview-v1.js?v=6',
 './assets/142-resanta-ai360-director-proactive-brief-v1.js?v=1',
 './assets/138-resanta-ai360-sales-bridge-v1.js?v=7'
];
function owner(){
 try{return typeof currentUser!=='undefined'&&!!currentUser?.id &&
  typeof currentProfile!=='undefined'&&currentProfile?.role==='boss' &&
  String(currentProfile?.name||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU')==='александр паюшин' &&
  document.getElementById('app')?.style.display!=='none';}
 catch{return false;}
}
function load(src){
 return new Promise((resolve,reject)=>{
   const s=document.createElement('script');
   s.src=src;s.async=false;s.onload=resolve;s.onerror=()=>reject(new Error('Не удалось загрузить модуль '+src));
   document.body.appendChild(s);
 });
}
async function activate(){
 if(!owner()||loading)return;
 if(ready){document.querySelector('.rva-launch')?.click();return;}
 loading=true;button.disabled=true;button.textContent='Подключение AI…';
 try{
   for(const src of scripts){
     if(!owner())throw new Error('Сессия директора закрыта');
     // Task drafts are optional: a failed sidecar must never block the existing Lera.
     try { await load(src); }
     catch (e) {
       if (src.includes('/140-resanta-ai360-task-drafts-preview-v1.js') ||
           src.includes('/142-resanta-ai360-director-proactive-brief-v1.js')) {
         console.warn('AI360 optional draft preview unavailable:',e);
         continue;
       }
       throw e;
     }
   }
   if(!owner())throw new Error('Сессия директора закрыта');
   ready=true;button.hidden=true;
   document.querySelector('.rva-launch')?.click();
 }catch(e){
   console.warn('Optional AI360 loading:',e);
   button.title=String(e?.message||e).slice(0,170);
   button.textContent='AI 360° · повторить';
 }finally{
   loading=false;button.disabled=false;
 }
}
function reconcile(){
 const top=document.querySelector('#app .topbar');
 if(!top)return;
 if(!button){
   button=document.createElement('button');
   button.type='button';button.className='rva-ai360-safe-launch';
   button.textContent='🎙 РЕСАНТА AI 360°';
   button.style.cssText='border:1px solid #2769ab;border-radius:8px;background:#edf6ff;color:#185fa5;padding:7px 9px;font-size:12px;font-weight:750;cursor:pointer';
   button.addEventListener('click',activate);
   top.insertBefore(button,top.querySelector('.user-badge'));
 }
 button.hidden=!owner()||ready;
}
reconcile();
window.setInterval(reconcile,5000);
})();