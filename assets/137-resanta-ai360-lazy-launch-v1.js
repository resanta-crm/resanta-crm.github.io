/* AI360 optional owner-only launch. No voice code runs at login.
   INMO Android Capacitor may load the existing director Lera ONLY after owner tap.
   Other Android browsers and staff remain excluded. */
(function(){
'use strict';
const android=/Android/i.test(navigator.userAgent||'');
const nativeAndroid=android&&window.Capacitor?.isNativePlatform?.()===true&&window.Capacitor?.getPlatform?.()==='android';
if((android&&!nativeAndroid)||window.__resantaAI360LazyLaunchV1)return;
window.__resantaAI360LazyLaunchV1=true;
let button=null,loading=false,ready=false,activationFlight=null;
const scripts=[
 './assets/134-resanta-voice-ai360-pilot-v1.js?v=21&lera=20261113&release=continuous-gps-1&leraRelease=20261113-stable-dialog2&dialogueRelease=20261113-v2&wakeRelease=20261117-1',
 './assets/135-resanta-voice-capture-fix-v2.js?v=21&lera=20261113-turntaking&release=continuous-gps-1&leraRelease=20261113-stable-dialog2&videoRelease=20261113-v3&tasksAudio=20261115&networkRelease=20261116-5&wakeRelease=20261117-1',
 './assets/136-resanta-voice-quality-v3.js?v=19&lera=20261112-naturalvoice&videoRelease=20261113-v3&networkRelease=20261116-5&wakeRelease=20261117-1',
 './assets/139-resanta-ai360-staff-resolver-v1.js?v=1',
 './assets/140-resanta-ai360-task-drafts-preview-v1.js?v=7',
 './assets/142-resanta-ai360-director-proactive-brief-v1.js?v=3',
 './assets/138-resanta-ai360-sales-bridge-v1.js?v=8',
 './assets/191-sales360-recovery-lera-v1.js?v=20261110-1',
 './assets/194-pdz360-lera-v1.js?v=20261110-1',
 './assets/143-resanta-ai360-unified-dialog-v1.js?v=11&tasksRelease=20261116-3&meetingRelease=20261115&lera=20261113&leraRelease=20261113-stable-dialog2&dialogueRelease=20261113-v2&videoRelease=20261113-v3&rolloutRelease=20261113-v4&controlRelease=20261113-v2&sourceRelease=20261117-1'
];
// Android director: text and authenticated navigation first. Audio is optional
// and must never start automatically just because the AI panel was opened.
const nativeTextScripts=[
 './assets/134-resanta-voice-ai360-pilot-v1.js?v=21&lera=20261113&release=continuous-gps-1&leraRelease=20261113-stable-dialog2&dialogueRelease=20261113-v2&wakeRelease=20261117-1',
 './assets/139-resanta-ai360-staff-resolver-v1.js?v=1',
 './assets/142-resanta-ai360-director-proactive-brief-v1.js?v=4',
 './assets/138-resanta-ai360-sales-bridge-v1.js?v=8',
 './assets/191-sales360-recovery-lera-v1.js?v=20261110-1',
 './assets/194-pdz360-lera-v1.js?v=20261110-1',
 './assets/143-resanta-ai360-unified-dialog-v1.js?v=11&tasksRelease=20261116-3&meetingRelease=20261115&lera=20261113&leraRelease=20261113-stable-dialog2&dialogueRelease=20261113-v2&videoRelease=20261113-v3&rolloutRelease=20261113-v4&controlRelease=20261113-v2&sourceRelease=20261117-1'
];
const nativeAudioScripts=[
 './assets/136-resanta-voice-quality-v3.js?v=19&lera=20261112-naturalvoice&videoRelease=20261113-v3&networkRelease=20261116-5&wakeRelease=20261117-1',
 './assets/135-resanta-voice-capture-fix-v2.js?v=21&lera=20261113-turntaking&release=continuous-gps-1&leraRelease=20261113-stable-dialog2&videoRelease=20261113-v3&tasksAudio=20261115&networkRelease=20261116-5&wakeRelease=20261117-1'
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
// AIR3_OFFLINE_HANDSFREE_BEGIN
// New, per-actor consent is deliberately separate from the legacy paid wake settings.
const HANDSFREE_KEY='resanta-air3-local-wake-consent-v1:';
let handsfreeRun=null,handsfreeFlight=null,handsfreeBlocked='',handsfreeBlockReason='';
let nativeAudioFlight=null,targetProbe=null,handsfreeTeardown=null;
function handsfreeIdentity(){
 if(!nativeAndroid||!owner())return null;
 try{
  const id=String(currentUser?.id||'');
  if(String(currentProfile?.id||'')!==id||document.getElementById('app')?.style.display==='none')return null;
  return {id,key:[id,currentProfile.role,currentProfile.region||'',currentProfile.access_scope||''].join('|')};
 }catch(_){return null;}
}
function handsfreeConsent(id){try{return window.localStorage?.getItem(HANDSFREE_KEY+id)==='yes';}catch(_){return false;}}
function saveHandsfreeConsent(id,on){try{on?window.localStorage?.setItem(HANDSFREE_KEY+id,'yes'):window.localStorage?.removeItem(HANDSFREE_KEY+id);}catch(_){}}
function handsfreeStatus(text){
 const node=document.querySelector('.rva-air3-handsfree-status');if(node)node.textContent=text;
 const control=document.querySelector('.rva-air3-handsfree');
 if(control){control.textContent=handsfreeRun?.started?'■ Выключить «Лера» на очках':'◉ Включить «Лера» на очках';control.setAttribute('aria-pressed',String(!!handsfreeRun?.started));}
}
function handsfreeBusy(){return !!(window.__resantaVoiceOutputBusy||window.__resantaAI360PendingV1||window.__resantaAI360ActionBusyV1||window.speechSynthesis?.speaking||window.RESANTA_TASKS_ROUTE_V4?.recording?.());}
function handsfreeCurrent(run){
 const identity=handsfreeIdentity();
 return !!run&&handsfreeRun===run&&!run.stopped&&!run.abort.signal.aborted&&identity?.key===run.actorKey&&!document.hidden;
}
function handsfreeWait(task,ms,run){
 return new Promise((resolve,reject)=>{
  let settled=false,timer;const signal=run?.abort.signal;
  const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
  const abort=()=>finish(new Error('handsfree_cancelled'));
  Promise.resolve(task).then(value=>finish(null,value),error=>finish(error));
  if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
  timer=setTimeout(()=>finish(new Error('handsfree_local_timeout')),ms);
 });
}
async function identifyAir3(){
 if(!nativeAndroid)return false;
 if(!targetProbe)targetProbe=(async()=>{
  const plugin=window.Capacitor?.Plugins?.Air3Voice;
  if(typeof plugin?.capabilities!=='function')return null;
  try{
   const caps=await handsfreeWait(plugin.capabilities(),2000);
   if(caps?.bootstrapCore!==true)return caps?.bootstrapCore===false?false:null;
   // Migrate old saved settings before 135 can initialize. Never restore the
   // old cloud wake loop as a fallback when a local model is unavailable.
   window.__resantaAIR3DisablePaidWakeAutoV1=true;return true;
  }catch(_){targetProbe=null;return null;}
 })();
 return targetProbe;
}
function syncNativeAudioUi(){
 for(const selector of ['.rva-mic','.rva-wake']){const control=document.querySelector(selector);if(control){control.disabled=false;control.title='';}}
 const connected=document.querySelector('.rva-android-connect');if(connected){connected.disabled=true;connected.textContent='✓ Голосовые модули подключены';}
}
async function ensureNativeAudio(guard=owner){
 if(androidAudioReady){if(!guard())throw new Error('handsfree_cancelled');window.__resantaAI360AndroidVoiceArmed=true;syncNativeAudioUi();return true;}
 if(!nativeAudioFlight)nativeAudioFlight=(async()=>{
  const target=await identifyAir3();if(target===null&&window.__resantaAIR3DisablePaidWakeAutoV1!==true)throw new Error('Не удалось проверить модель очков. Повтори подключение голоса.');if(!guard())throw new Error('handsfree_cancelled');
  for(const src of nativeAudioScripts){if(!guard())throw new Error('handsfree_cancelled');await load(src);}
  if(!guard()||typeof window.crmResantaVoiceSpeakV3!=='function'||typeof window.crmResantaVoiceSuspendV2!=='function')throw new Error('Голосовой интерфейс не инициализировался');
  androidAudioReady=true;window.__resantaAI360AndroidVoiceArmed=true;syncNativeAudioUi();return true;
 })().finally(()=>{nativeAudioFlight=null;});
 const result=await nativeAudioFlight;if(!guard())throw new Error('handsfree_cancelled');return result;
}
function stopHandsfree(reason='manual',forget=false){
 const run=handsfreeRun,identity=handsfreeIdentity();
 if(forget&&identity)saveHandsfreeConsent(identity.id,false);
 handsfreeBlocked=run?.actorKey||identity?.key||handsfreeBlocked;handsfreeBlockReason=reason;
 handsfreeRun=null;window.__resantaAIR3OfflineWakeActiveV1=false;
 if(run){
  run.stopped=true;run.abort.abort();
  try{Promise.resolve(run.listener?.remove?.()).catch(()=>{});}catch(_){}
  try{
   // Native stop settles only after the old AudioRecord/model are released.
   // A rapid foreground return must await that cleanup, never race wake_busy.
   const stopping=Promise.all([handsfreeTeardown||Promise.resolve(),Promise.resolve(run.plugin.stop({leaseId:run.leaseId}))]);
   handsfreeTeardown=stopping;
   void stopping.finally(()=>{if(handsfreeTeardown===stopping)handsfreeTeardown=null;}).catch(()=>{});
  }catch(_){}
 }
 window.crmResantaNativeQuestionCancelV2?.();window.crmResantaNativeOutputCancelV3?.();
 if(reason==='logout'||reason==='account'||reason==='pagehide')window.crmAI360UnifiedDialogResetV1?.();
 handsfreeStatus(forget?'Пробуждение «Лера» выключено.':'Микрофон очков остановлен.');
}
async function pauseHandsfree(run){
 if(!handsfreeCurrent(run)||!run.started||run.phase==='paused'||run.phase==='pausing')return;
 run.phase='pausing';
 try{await handsfreeWait(run.plugin.pause({leaseId:run.leaseId}),5000,run);if(handsfreeCurrent(run))run.phase='paused';}
 catch(_){if(handsfreeCurrent(run))stopHandsfree('native-error');}
}
async function rearmHandsfree(run){
 if(!handsfreeCurrent(run)||!run.started||run.phase!=='paused'||run.question||handsfreeBusy())return;
 run.phase='arming';run.captureId='';
 try{await handsfreeWait(run.plugin.rearm({leaseId:run.leaseId}),10000,run);if(handsfreeCurrent(run)&&run.phase==='arming'){run.phase='listening';handsfreeStatus(run.continued?'Скажи «Лера» и продолжи вопрос, либо «Лера, я закончил».':'Скажи «Лера», затем задай вопрос. Ожидание работает локально.');}}
 catch(_){if(handsfreeCurrent(run))stopHandsfree('native-error');}
}
async function handsfreeEvent(run,event){
 if(!handsfreeCurrent(run)||event?.leaseId!==run.leaseId)return;
 if(event.type==='error'){stopHandsfree('native-error');handsfreeStatus('Локальный микрофон остановлен. Включи «Лера» снова, чтобы повторить.');return;}
 if(event.type==='state')return; // Command promises and current-lease guards own the web state.
 if(handsfreeBusy()&&!run.question){void pauseHandsfree(run);return;}
 const eventId=String(event.eventId||'');if(!/^[0-9a-f-]{36}$/i.test(eventId))return;
 if(event.type==='wake'){
  if(run.seen.has(eventId)||run.question||!['listening','arming'].includes(run.phase))return;
  run.captureId=eventId;run.phase='capturing';handsfreeStatus('Слушаю твой вопрос…');return;
 }
 if(event.type!=='question'||run.captureId!==eventId||run.seen.has(eventId)||run.question)return;
 run.seen.add(eventId);if(run.seen.size>64)run.seen.delete(run.seen.values().next().value);
 run.phase='paused';
 if(event.loud!==true){handsfreeStatus('Вопрос не прозвучал. Скажи «Лера», когда будешь готов.');return;}
 if(typeof window.crmResantaNativeQuestionV2!=='function'){stopHandsfree('native-error');return;}
 const payload={...event,actor:run.actor};
 const question=Promise.resolve(window.crmResantaNativeQuestionV2(payload));run.question=question;
 // 135 validates and decodes synchronously before returning its promise.
 // Drop both bridge/base64 references while the single paid STT is in flight.
 payload.wavBase64='';event.wavBase64='';
 try{
  const result=await question;
  if(!handsfreeCurrent(run))return;
  run.continued=result?.continued===true;
  if(result?.ok!==true){stopHandsfree('question-error');handsfreeStatus('Не удалось обработать вопрос. Автоматический повтор отключён; включи «Лера», чтобы продолжить.');}
 }catch(_){if(handsfreeCurrent(run))stopHandsfree('question-error');}
 finally{if(run.question===question)run.question=null;}
}
async function startHandsfree(automatic=false){
 const identity=handsfreeIdentity();
 if(!identity||document.hidden||automatic&&!handsfreeConsent(identity.id))return false;
 if(handsfreeRun&&handsfreeCurrent(handsfreeRun))return true;
 if(handsfreeFlight)return handsfreeFlight;
 if(automatic&&handsfreeBlocked===identity.key)return false;
 if(!automatic)primeAndroidOutput();
 const leaseId=window.crypto?.randomUUID?.();
 if(!leaseId){handsfreeStatus('Локальный голосовой режим недоступен в этом WebView.');return false;}
 const plugin=window.Capacitor?.Plugins?.Air3Wake;
 if(typeof plugin?.capabilities!=='function'||typeof plugin?.addListener!=='function'){handsfreeBlocked=identity.key;handsfreeStatus('Для локального слова «Лера» нужно обновление приложения очков.');return false;}
 const run={actor:identity.id,actorKey:identity.key,leaseId,plugin,abort:new AbortController(),phase:'preparing',started:false,stopped:false,listener:null,seen:new Set(),captureId:'',question:null};
 handsfreeRun=run;
 const flight=(async()=>{
  try{
   const caps=await handsfreeWait(plugin.capabilities(),3000,run);
   if(!handsfreeCurrent(run))return false;
   if(caps?.supported!==true||caps?.offline!==true||caps?.modelBundled!==true||caps?.wakeWord!=='лера')throw new Error('handsfree_model_unavailable');
   window.__resantaAIR3DisablePaidWakeAutoV1=true;
   if(!handsfreeConsent(identity.id)){
    if(automatic)return false;
    if(!window.confirm('Включить локальное пробуждение «Лера» на этих очках для твоей учётной записи? В открытой CRM очки будут ждать это слово без отправки звука в интернет. После обращения один вопрос передаётся в защищённое распознавание CRM, а ответы озвучиваются с действующими платными лимитами. Режим будет включаться после следующих входов; его можно выключить. При выходе из учётной записи или скрытии CRM микрофон останавливается.'))return false;
   }
   const permissions=await handsfreeWait(plugin.checkPermissions(),3000,run);
   if(!handsfreeCurrent(run))return false;
   if(permissions?.microphone!=='granted'){
    if(automatic)throw new Error('handsfree_permission_required');
    const granted=await handsfreeWait(plugin.requestPermissions(),60000,run);
    if(granted?.microphone!=='granted')throw new Error('handsfree_permission_required');
   }
   if(!handsfreeCurrent(run))return false;
   if(typeof window.crmFastBootstrapV22733!=='function')throw new Error('handsfree_crm_not_ready');
   await handsfreeWait(window.crmFastBootstrapV22733(),95000,run);
   if(!handsfreeCurrent(run))return false;
   const auth=await handsfreeWait(db.auth.getSession(),5000,run);
   if(!handsfreeCurrent(run)||auth?.error||auth?.data?.session?.user?.id!==run.actor||!auth.data.session.access_token)throw new Error('handsfree_session_required');
   window.__resantaAIR3OfflineWakeActiveV1=true;
   window.crmResantaVoiceSuspendV2?.();
   const activated=await handsfreeWait(activate({greet:false,isCurrent:()=>handsfreeCurrent(run)}),30000,run);
   if(activated!==true)throw new Error('handsfree_panel_unavailable');
   if(!handsfreeCurrent(run))return false;
   await handsfreeWait(ensureNativeAudio(()=>handsfreeCurrent(run)),30000,run);
   if(!handsfreeCurrent(run))return false;
   window.crmResantaVoiceSuspendV2?.();
   if(automatic&&window.crmResantaVoiceHasConsentV3?.()!==true)throw new Error('handsfree_voice_consent_required');
   if(!automatic&&window.crmResantaVoiceAuthorizeV3?.()!==true)throw new Error('handsfree_voice_consent_required');
   if(!handsfreeCurrent(run)||window.crmAI360OpenPanelV1?.({greet:false})!==true)throw new Error('handsfree_panel_unavailable');
   const listener=await handsfreeWait(plugin.addListener('wakeEvent',event=>void handsfreeEvent(run,event).catch(()=>{if(handsfreeCurrent(run))stopHandsfree('question-error');})),3000,run);
   if(!handsfreeCurrent(run)){try{await listener?.remove?.();}catch(_){}return false;}run.listener=listener;
   handsfreeStatus('Подключаю локальное слово «Лера»…');
   if(handsfreeTeardown)await handsfreeWait(handsfreeTeardown,10000,run);
   if(!handsfreeCurrent(run))return false;
   await handsfreeWait(plugin.start({leaseId}),30000,run);
   if(!handsfreeCurrent(run))return false;
   run.started=true;run.phase='listening';handsfreeBlocked='';handsfreeBlockReason='';saveHandsfreeConsent(run.actor,true);
   handsfreeStatus('Скажи «Лера», затем задай вопрос. Ожидание работает локально.');return true;
  }catch(error){
   if(handsfreeRun===run){stopHandsfree('start-error');handsfreeStatus(String(error?.message||'').includes('model')?'Локальная модель ещё недоступна. Платный режим ожидания не включён.':'Локальный голосовой режим не включён. Проверь разрешение микрофона и включи «Лера» снова.');}
   return false;
  }finally{if(handsfreeRun===run&&!run.started)stopHandsfree('not-started');}
 })();
 handsfreeFlight=flight;
 void flight.finally(()=>{if(handsfreeFlight===flight)handsfreeFlight=null;}).catch(()=>{});return flight;
}
function reconcileHandsfree(){
 const identity=handsfreeIdentity(),run=handsfreeRun;
 if(!identity){if(run)stopHandsfree('account');if(handsfreeBlockReason==='logout'||handsfreeBlockReason==='account'){handsfreeBlocked='';handsfreeBlockReason='';}return;}
 if(document.hidden){if(run)stopHandsfree('hidden');return;}
 if(run&&run.actorKey!==identity.key){stopHandsfree('account');return;}
 if(run){
  if(run.started){
   const panel=document.querySelector('.rva-window');if(!panel||panel.hidden||panel.classList?.contains('rva-mini')){stopHandsfree('panel');return;}
   if(handsfreeBusy()&&!run.question)void pauseHandsfree(run);
   else if(!handsfreeBusy()&&!run.question&&run.phase==='paused')void rearmHandsfree(run);
  }
  return;
 }
 if(handsfreeBlockReason==='hidden'){handsfreeBlocked='';handsfreeBlockReason='';}
 if(handsfreeConsent(identity.id)&&handsfreeBlocked!==identity.key&&!handsfreeFlight)void startHandsfree(true);
}
function installHandsfreeControl(box){
 if(!nativeAndroid||!owner()||box.querySelector?.('.rva-air3-handsfree'))return;
 const control=document.createElement('button');control.type='button';control.className='rva-btn rva-air3-handsfree';control.textContent='◉ Включить «Лера» на очках';control.setAttribute('aria-pressed','false');
 const note=document.createElement('span');note.className='rva-air3-handsfree-status';note.style.cssText='font-size:11px;color:#315777';note.setAttribute('role','status');note.textContent='Локальное ожидание слова «Лера» включается отдельно один раз.';
 control.addEventListener('click',()=>{if(handsfreeRun?.started)stopHandsfree('manual',true);else void startHandsfree(false);});box.append(control,note);
}
if(nativeAndroid){
 window.crmAIR3HandsfreeV1=Object.freeze({enable:()=>startHandsfree(false),disable:()=>stopHandsfree('manual',true),suspend:()=>stopHandsfree('manual'),isCurrent:(leaseId,actor)=>!!handsfreeRun&&handsfreeRun.leaseId===leaseId&&handsfreeRun.actor===actor&&handsfreeCurrent(handsfreeRun),outputBusy:busy=>{if(busy&&handsfreeRun)void pauseHandsfree(handsfreeRun);},status:()=>({active:!!handsfreeRun?.started,state:handsfreeRun?.phase||'off'})});
 for(const name of ['crmLocalSignOutV236258','crmShowSignedOutUiV236258']){
  const previous=window[name];if(typeof previous==='function')window[name]=function(){stopHandsfree('logout');return previous.apply(this,arguments);};
 }
 document.addEventListener?.('visibilitychange',()=>{if(document.hidden)stopHandsfree('hidden');});
 window.addEventListener?.('pagehide',()=>stopHandsfree('pagehide'));
 window.addEventListener?.('pageshow',()=>{if(handsfreeBlockReason==='pagehide'){handsfreeBlocked='';handsfreeBlockReason='';}});
 window.setInterval(reconcileHandsfree,250);
}
// AIR3_OFFLINE_HANDSFREE_END

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
 start.type='button';start.className='rva-btn rva-android-connect';start.textContent='🎤 Подключить голос на очках';
 const note=document.createElement('span');
 note.style.cssText='font-size:11px;color:#315777;flex:1 1 180px';
 note.setAttribute('role','status');
 note.textContent='CRM и текстовая Лера работают отдельно от микрофона.';
 box.append(start,note);
 installHandsfreeControl(box);
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
     await ensureNativeAudio();
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
 try{
  const exactOwner=typeof currentUser!=='undefined'&&
    String(currentUser?.id)==='544fb1e2-ef70-44de-bc62-e0e1596a4bfc'&&
    typeof currentProfile!=='undefined'&&currentProfile?.role==='boss'&&
    String(currentProfile?.name||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU')==='александр паюшин';
  if(nativeAndroid)return exactOwner; // preserve original AIR3 owner-only safety
  const greeting=window.crmAI360GreetingV1?.();
  const exactPeer=greeting?.id==='a24954b8-2fe1-4852-b629-d8f351e1bd36';
  return (exactOwner||exactPeer)&&document.getElementById('app')?.style.display!=='none';
 }catch{return false;}
}
function load(src){
 return new Promise((resolve,reject)=>{
   const s=document.createElement('script');
   s.src=src;s.async=false;s.onload=resolve;s.onerror=()=>reject(new Error('Не удалось загрузить модуль '+src));
   document.body.appendChild(s);
 });
}
async function activate(options={}){
 if(!owner())return false;
 const current=()=>owner()&&(!options.isCurrent||options.isCurrent()===true);
 if(loading&&activationFlight){await activationFlight;if(!current())return false;}
 if(ready){if(typeof window.crmAI360OpenPanelV1==='function')window.crmAI360OpenPanelV1({greet:options.greet===true});else document.querySelector('.rva-launch')?.click();return true;}
 if(!current())return false;
 loading=true;if(button){button.disabled=true;button.textContent='Подключение AI…';}
 if(nativeAndroid){window.__resantaAI360AndroidDirectorOptIn=true;window.__resantaAI360AndroidVoiceArmed=false;}
 const flight=(async()=>{
  try{
   for(const src of (nativeAndroid ? nativeTextScripts : scripts)){
    if(!current())throw new Error('Сессия директора закрыта');
    try{await load(src);}catch(e){
     if(src.includes('/140-resanta-ai360-task-drafts-preview-v1.js')||src.includes('/142-resanta-ai360-director-proactive-brief-v1.js')){console.warn('AI360 optional draft preview unavailable:',e);continue;}throw e;
    }
   }
   if(!current())throw new Error('Сессия директора закрыта');
   ready=true;if(button)button.hidden=true;
   if(nativeAndroid)installNativeAudioGate();
   if(typeof window.crmAI360OpenPanelV1==='function')window.crmAI360OpenPanelV1({greet:options.greet!==false});else document.querySelector('.rva-launch')?.click();
   return true;
  }catch(e){
   if(nativeAndroid)window.__resantaAI360AndroidDirectorOptIn=false;
   console.warn('Optional AI360 loading:',e);if(button){button.title=String(e?.message||e).slice(0,170);button.textContent='AI 360° · повторить';}return false;
  }finally{loading=false;if(button)button.disabled=false;}
 })();
 activationFlight=flight;try{return await flight;}finally{if(activationFlight===flight)activationFlight=null;}
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
