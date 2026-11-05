/* AI360 optional owner-only launch. No voice code runs at login.
   INMO Android Capacitor may load the existing director Lera ONLY after owner tap.
   Other Android browsers and staff remain excluded. */
(function(){
'use strict';
const android=/Android/i.test(navigator.userAgent||'');
const nativeAndroid=android&&window.Capacitor?.isNativePlatform?.()===true&&window.Capacitor?.getPlatform?.()==='android';
if((android&&!nativeAndroid)||window.__resantaAI360LazyLaunchV1)return;
window.__resantaAI360LazyLaunchV1=true;
let button=null,loading=false,ready=false;
const scripts=[
 './assets/134-resanta-voice-ai360-pilot-v1.js?v=18',
 './assets/135-resanta-voice-capture-fix-v2.js?v=17',
 './assets/136-resanta-voice-quality-v3.js?v=17',
 './assets/139-resanta-ai360-staff-resolver-v1.js?v=1',
 './assets/140-resanta-ai360-task-drafts-preview-v1.js?v=7',
 './assets/142-resanta-ai360-director-proactive-brief-v1.js?v=3',
 './assets/138-resanta-ai360-sales-bridge-v1.js?v=8',
 './assets/143-resanta-ai360-unified-dialog-v1.js?v=8'
];
// Android director: text and authenticated navigation first. Audio is optional
// and must never start automatically just because the AI panel was opened.
const nativeTextScripts=[
 './assets/134-resanta-voice-ai360-pilot-v1.js?v=19',
 './assets/139-resanta-ai360-staff-resolver-v1.js?v=1',
 './assets/142-resanta-ai360-director-proactive-brief-v1.js?v=4',
 './assets/138-resanta-ai360-sales-bridge-v1.js?v=8',
 './assets/143-resanta-ai360-unified-dialog-v1.js?v=8'
];
const nativeAudioScripts=[
 './assets/136-resanta-voice-quality-v3.js?v=18',
 './assets/135-resanta-voice-capture-fix-v2.js?v=17'
];
let androidAudioReady=false,androidAudioLoading=false;
// Create and resume the output context synchronously within the explicit
// Android button click, BEFORE any script fetch or network/STT/TTS request.
// Desktop users and other Android accounts never create this context.
function primeAndroidOutput(){
 if(!nativeAndroid||!owner())return false;
 try{
   const Constructor=window.AudioContext||window.webkitAudioContext;
   if(!Constructor)return false;
   let context=window.__resantaAI360AndroidOutputContextV1;
   if(!context||context.state==='closed'){
     context=new Constructor();
     window.__resantaAI360AndroidOutputContextV1=context;
   }
   const attempt=context.resume();
   if(attempt&&typeof attempt.catch==='function')
     void attempt.catch(e=>console.warn('AIR3 audio output unlock:',String(e?.name||'error').slice(0,60)));
   return true;
 }catch(e){
   console.warn('AIR3 Web Audio unavailable:',String(e?.name||'error').slice(0,60));
   return false;
 }
}
function installNativeAudioGate(){
 if(!nativeAndroid||!owner())return;
 const panel=document.querySelector('.rva-window');
 if(!panel||panel.querySelector('.rva-android-audio-gate'))return;
 const actions=panel.querySelector('.rva-actions');
 if(!actions)return;
 // Without the explicit audio opt-in, the legacy Web Speech button must
 // not attempt to open unsupported native speech services on INMO WebView.
 const mic=panel.querySelector('.rva-mic'),wake=panel.querySelector('.rva-wake');
 for(const control of [mic,wake])if(control){control.disabled=true;control.title='Сначала подключите голос на очках';}
 const box=document.createElement('div');
 box.className='rva-android-audio-gate';
 box.style.cssText='display:flex;gap:7px;align-items:center;flex-wrap:wrap;padding:8px;border:1px solid #bdd2e7;border-radius:10px;background:#f2f8ff';
 const start=document.createElement('button');
 start.type='button';start.className='rva-btn';start.textContent='🎤 Подключить голос на очках';
 const note=document.createElement('span');
 note.style.cssText='font-size:11px;color:#315777;flex:1 1 180px';
 note.setAttribute('role','status');
 note.textContent='CRM и текстовая Лера работают отдельно от микрофона.';
 box.append(start,note);
 actions.before(box);
 start.addEventListener('click',async()=>{
   if(androidAudioReady||androidAudioLoading||!owner())return;
   // User gesture unlock: do this synchronously, before awaiting any scripts.
   primeAndroidOutput();
   // Detect missing WebView media support without touching the mic itself.
   if(typeof navigator.mediaDevices?.getUserMedia!=='function'||typeof window.MediaRecorder!=='function'){
     note.textContent='Встроенный WebView не поддерживает запись. CRM и текстовая Лера продолжают работать.';
     return;
   }
   androidAudioLoading=true;start.disabled=true;start.textContent='🎤 Проверяю голосовые модули…';
   try{
     for(const src of nativeAudioScripts){
       if(!owner())throw new Error('Сессия директора закрыта');
       await load(src);
     }
     if(typeof window.crmResantaVoiceSpeakV3!=='function'||
        typeof window.crmResantaVoiceSuspendV2!=='function')
       throw new Error('Голосовой интерфейс не инициализировался');
     androidAudioReady=true;
     window.__resantaAI360AndroidVoiceArmed=true;
     for(const control of [mic,wake])if(control){control.disabled=false;control.title='';}
     start.textContent='✓ Голосовые модули подключены';
     note.textContent='Голосовые модули готовы. Нажми «🔊 Проверить звук Леры» и подтверди озвучку Яндекса, затем задавай вопросы голосом.';
   }catch(e){
     console.warn('AIR3 optional audio init:',e);
     start.textContent='🎤 Повторить подключение голоса';
     note.textContent='Не удалось подключить голос: '+String(e?.message||e).slice(0,120)+'. CRM и текстовый помощник доступны.';
   }finally{
     androidAudioLoading=false;
     if(!androidAudioReady)start.disabled=false;
   }
 });
}
function owner(){
 try{return typeof currentUser!=='undefined'&&!!currentUser?.id &&
  (!nativeAndroid||String(currentUser.id)==='544fb1e2-ef70-44de-bc62-e0e1596a4bfc') &&
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
 // Android director voice stays behind this deliberate user action.
 if(nativeAndroid){window.__resantaAI360AndroidDirectorOptIn=true;window.__resantaAI360AndroidVoiceArmed=false;}
 try{
   for(const src of (nativeAndroid ? nativeTextScripts : scripts)){
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
   if(nativeAndroid)installNativeAudioGate();
   document.querySelector('.rva-launch')?.click();
 }catch(e){
   if(nativeAndroid)window.__resantaAI360AndroidDirectorOptIn=false;
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