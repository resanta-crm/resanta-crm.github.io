/* RESANTA CONNECT 131 video. Uses authenticated CRM token function.
   Nothing is loaded/captured until the employee clicks the video button. */
(function(){
'use strict';
if(window.crmConnectVideo131)return;
const $=id=>document.getElementById(id);
const ctx={};
const SDK_URL='https://cdn.jsdelivr.net/npm/livekit-client@2.23.0/dist/livekit-client.umd.min.js';
let ready=false, connecting=false, call=null, callChat=null, sdkLoading=null, monitor=null, requestEpoch=0;
let minimized=false, callIdentity=null,screenBusy=false,micBusy=false;
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=String(text??'');return n;};
const status=(s,bad)=>{const e=$('c131-status');if(e){e.textContent=s;e.classList.toggle('error',!!bad);}};
function loadSdk(){
 if(window.LivekitClient?.Room)return Promise.resolve(window.LivekitClient);
 if(sdkLoading)return sdkLoading;
 sdkLoading=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src=SDK_URL;script.async=true;
  script.referrerPolicy='no-referrer';
  const timer=setTimeout(()=>{script.remove();reject(Error('Не удалось загрузить LiveKit.'));},18000);
  script.onload=()=>{clearTimeout(timer);window.LivekitClient?.Room?resolve(window.LivekitClient):reject(Error('Модуль LiveKit не запустился.'));};
  script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('Видеомодуль недоступен. Проверьте интернет и VPN.'));};
  document.head.append(script);
 }).catch(e=>{sdkLoading=null;throw e;});
 return sdkLoading;
}
function tile(id,name){
 const wall=$('c131-wall');if(!wall)return null;
 let box=Array.from(wall.children).find(e=>e.dataset.participant===id);
 if(!box){
  box=el('div','c131-tile');box.dataset.participant=id;
  box.append(el('div','c131-tracks'),el('small','',name||'Сотрудник'));
  wall.append(box);
 }
 return box;
}
function count(){
 if(call&&$('c131-count'))$('c131-count').textContent=(1+call.remoteParticipants.size)+' участник(ов)';
 updateMini();
}
function updateMini(){
 const bar=$('c131-mini');if(!bar)return;
 const participants=call?1+call.remoteParticipants.size:0;
 const info=$('c131-mini-info');
 if(info)info.textContent=participants+' участник(ов) · '+(call?.localParticipant?.isScreenShareEnabled?'🖥 Экран показывается':'Экран не показывается');
 const mic=$('c131-mini-mic');
 if(mic){mic.textContent=call?.localParticipant?.isMicrophoneEnabled?'🎤 Выключить':'🎤 Включить';mic.disabled=!call||micBusy;}
 const screen=$('c131-mini-screen');
 if(screen){screen.textContent=call?.localParticipant?.isScreenShareEnabled?'⏹ Остановить экран':'🖥 Показать экран';screen.disabled=!call||screenBusy;}
 const fullScreen=$('c131-screen');
 if(fullScreen){fullScreen.textContent=screen?.textContent||'🖥 Показать экран';fullScreen.disabled=!call||screenBusy;}
 const fullMic=$('c131-mic');
 if(fullMic){fullMic.textContent=mic?.textContent||'🎤 Включить';fullMic.disabled=!call||micBusy;}
}
function minimize(){
 if(!call)return;
 minimized=true;
 $('c131-overlay').hidden=true;
 $('c131-mini').hidden=false;
 updateMini();
}
function restore(){
 if(!call)return;
 minimized=false;
 $('c131-mini').hidden=true;
 $('c131-overlay').hidden=false;
 updateMini();
}
function attach(track,person,local){
 if(!track)return;
 const parent=tile(local?'local':person.identity,local?(ctx.actorName?.()||'Вы')+' (вы)':person.name);
 if(track.kind==='audio'){
  if(local)return;
  const audio=track.attach();audio.autoplay=true;
  $('c131-audio')?.append(audio);
  try{audio.play()?.catch(()=>status('Для звука нажмите «Разрешить звук».'));}catch(_){}
 }else if(track.kind==='video'){
  const video=track.attach();video.className='c131-video';video.playsInline=true;
  video.autoplay=true;video.muted=!!local;
  parent?.querySelector('.c131-tracks')?.append(video);
 }
}
function detach(track){
 if(!track)return;
 try{track.detach().forEach(e=>{e.pause?.();e.remove();});}catch(_){}
}
function hide(){
 $('c131-overlay').hidden=true;
 if($('c131-mini'))$('c131-mini').hidden=true;
 $('c131-wall')?.replaceChildren();$('c131-audio')?.replaceChildren();
 callChat=null;callIdentity=null;minimized=false;connecting=false;screenBusy=false;micBusy=false;
 $('c131-start').disabled=false;
 $('c131-start').textContent='📹 Видеозвонок';
}
async function leave(quiet=false){
 requestEpoch++;
 const old=call;call=null;
 if(monitor){clearInterval(monitor);monitor=null;}
 if(old)try{await old.disconnect();}catch(_){}
 hide();
 if(!quiet)ctx.notify?.('Видеозвонок завершён.');
}
async function join(){
 if(call){restore();return;}
 if(connecting)return;
 if(!ctx.isOpen?.()||!ctx.roomId?.()||!ctx.actor?.())return;
 if(!window.isSecureContext){ctx.notify?.('Видеосвязь требует HTTPS.',true);return;}
 const selected=ctx.roomId(),expectedActor=ctx.actor(),epoch=++requestEpoch;connecting=true;$('c131-start').disabled=true;
 $('c131-overlay').hidden=false;status('Проверяем доступ к комнате…');
 let candidate=null;
 try{
  const client=ctx.client?.();if(!client)throw Error('CRM ещё загружается.');
  const response=await client.functions.invoke('connect-livekit-token',{body:{room_id:selected}});
  if(response.error){
   let detail='';
   try{detail=(await response.error.context?.json?.())?.error||'';}catch(_){}
   throw Error(detail||response.error.message||'Сервер видеозвонков недоступен');
  }
  if(!response.data?.ok||!response.data?.token||!response.data?.url)throw Error(response.data?.error||'Не удалось получить доступ');
  if(epoch!==requestEpoch||!ctx.isOpen?.()||ctx.roomId?.()!==selected)throw Error('Вы перешли в другой чат.');
  status('Подключаем видеосвязь…');
  const livekit=await loadSdk();
  if(epoch!==requestEpoch||!ctx.isOpen?.()||ctx.roomId?.()!==selected)throw Error('Чат изменился.');
  candidate=new livekit.Room({adaptiveStream:true,dynacast:true,
   videoCaptureDefaults:{resolution:{width:1280,height:720}}});
  candidate.on(livekit.RoomEvent.ParticipantConnected,p=>{tile(p.identity,p.name);count();});
  candidate.on(livekit.RoomEvent.ParticipantDisconnected,p=>{
   Array.from($('c131-wall')?.children||[]).find(e=>e.dataset.participant===p.identity)?.remove();count();
  });
  candidate.on(livekit.RoomEvent.TrackSubscribed,(t,_pub,p)=>attach(t,p,false));
  candidate.on(livekit.RoomEvent.TrackUnsubscribed,t=>detach(t));
  candidate.on(livekit.RoomEvent.LocalTrackPublished,pub=>{
   if(pub.track)attach(pub.track,candidate.localParticipant,true);
   if(call===candidate)updateMini();
  });
  candidate.on(livekit.RoomEvent.LocalTrackUnpublished,pub=>{
   detach(pub.track);
   // Native browser "Stop sharing" also fires this event. Sync both controls.
   if(call===candidate){
    updateMini();
    if(pub.source==='screen_share'||pub.track?.source==='screen_share')
     status('Демонстрация экрана остановлена.');
   }
  });
  candidate.on(livekit.RoomEvent.Disconnected,()=>{if(call===candidate)leave(true);});
  await candidate.connect(response.data.url,response.data.token);
  if(epoch!==requestEpoch||!ctx.isOpen?.()||ctx.roomId?.()!==selected)throw Error('Чат закрыт.');
  call=candidate;callChat=selected;callIdentity=expectedActor;connecting=false;$('c131-start').disabled=false;
  $('c131-start').textContent='📹 Вернуться в звонок';
  tile('local',(ctx.actorName?.()||'Вы')+' (вы)');
  for(const p of call.remoteParticipants.values())tile(p.identity,p.name);
  count();
  status('Видеозвонок подключён. Камеру и микрофон можно включить отдельно.');
  monitor=setInterval(()=>{
   // Do not automatically minimize an explicitly restored call.
   // Navigation transitions are handled once by MutationObserver below.
   if(!ctx.isSignedIn?.(callIdentity))leave(true);
  },1200);
  try{await call.localParticipant.setMicrophoneEnabled(true);$('c131-mic').textContent='🎤 Выключить микрофон';}
  catch(_){status('Разрешите микрофон в настройках браузера.');}
  try{await call.localParticipant.setCameraEnabled(true);$('c131-cam').textContent='📷 Выключить камеру';}
  catch(_){status('Подключились без камеры. Её можно включить позже.');}
  try{await call.startAudio?.();}catch(_){}
 }catch(e){
  if(candidate&&!call)try{await candidate.disconnect();}catch(_){}
  connecting=false;$('c131-start').disabled=false;
  if(epoch===requestEpoch)status('Ошибка подключения: '+String(e?.message||e),true);
 }
}
async function toggle(kind){
 if(!call)return;
 if((kind==='screen'&&screenBusy)||(kind==='mic'&&micBusy))return;
 if(kind==='screen')screenBusy=true;
 if(kind==='mic')micBusy=true;
 const p=call.localParticipant;
 const b=kind==='mic'?$('c131-mic'):kind==='cam'?$('c131-cam'):$('c131-screen');
 const miniButton=kind==='mic'?$('c131-mini-mic'):kind==='screen'?$('c131-mini-screen'):null;
 b.disabled=true;if(miniButton)miniButton.disabled=true;
 try{
  if(kind==='mic'){
   const enabled=!p.isMicrophoneEnabled;await p.setMicrophoneEnabled(enabled);
   b.textContent=enabled?'🎤 Выключить микрофон':'🎤 Включить микрофон';
   status(enabled?'Микрофон включён.':'Микрофон выключен.');
  }else if(kind==='cam'){
   const enabled=!p.isCameraEnabled;await p.setCameraEnabled(enabled);
   b.textContent=enabled?'📷 Выключить камеру':'📷 Включить камеру';
   status(enabled?'Камера включена.':'Камера выключена.');
  }else{
   const enabled=!p.isScreenShareEnabled;
   await p.setScreenShareEnabled(enabled,{audio:true});
   b.textContent=enabled?'⏹ Остановить экран':'🖥 Показать экран';
   // A successful selection must replace an earlier browser permission error.
   // Treat the SDK's actual publication state as the source of truth.
   const active=!!p.isScreenShareEnabled;
   status(active?'Демонстрация экрана включена.':'Демонстрация экрана остановлена.');
   if(active&&enabled)minimize();
  }
 }catch(e){
  const details=String(e?.message||e);
  const denied=/NotAllowedError|Permission denied|not allowed|not permitted|access denied/i.test(String(e?.name||'')+' '+details);
  if(denied&&kind==='screen'){
   status('Демонстрация не началась: окно не выбрано или браузер/macOS не разрешил захват экрана. Попробуйте снова.',true);
  }else if(denied){
   status('Нет разрешения на '+(kind==='mic'?'микрофон':'камеру')+'. Проверьте доступ браузера и настройки macOS.',true);
  }else{
   status('Не удалось управлять устройством: '+details,true);
  }
 }finally{
  if(kind==='screen')screenBusy=false;
  if(kind==='mic')micBusy=false;
  b.disabled=false;updateMini();
 }
}
async function invite(){
 if(!call||!callChat)return;
 const button=$('c131-invite');button.disabled=true;
 try{
  const body='📹 Начался видеозвонок. Откройте этот чат и нажмите «Видеозвонок», чтобы присоединиться.';
  const r=await ctx.client().from('connect_messages_v1')
   .insert({room_id:callChat,sender_id:ctx.actor(),body})
   .select('id,room_id,sender_id,body,created_at').single();
  if(r.error)throw r.error;
  if(r.data){ctx.onMessage?.(r.data);window.crmConnectPush138?.sendForMessage?.(r.data.id);}
  status('Приглашение отправлено в этот чат.');
 }catch(e){status('Не удалось отправить приглашение: '+String(e?.message||e),true);}
 finally{button.disabled=false;}
}
function init(hooks){
 Object.assign(ctx,hooks);
 if(ready)return;
 const head=$('page-connect')?.querySelector('.c126-head');
 if(!head)return;
 ready=true;
 const b=el('button','c126-btn','📹 Видеозвонок');b.id='c131-start';b.type='button';b.title='Видеозвонок текущего чата';
 b.hidden=true;b.addEventListener('click',join);head.append(b);
 const overlay=el('div','c131-overlay');overlay.id='c131-overlay';overlay.hidden=true;
 overlay.innerHTML=[
  '<section class="c131-dialog" role="dialog" aria-modal="true" aria-label="Видеозвонок РЕСАНТА">',
  '<div class="c131-head"><div><strong>📹 РЕСАНТА CONNECT · Видеозвонок</strong><small id="c131-count">Подключение…</small></div>',
  '<div class="c131-header-actions"><button type="button" id="c131-minimize" class="c126-btn">▁ Свернуть</button>',
  '<button type="button" id="c131-close" class="c126-btn">✕ Завершить</button></div></div>',
  '<div id="c131-status" class="c131-status" role="status">Подключение…</div>',
  '<div class="c131-share-hint">Чтобы показать свою работу, нажмите «Показать экран», выберите вкладку CRM или весь экран и разрешите доступ. При сворачивании видеосвязь не прерывается.</div>',
  '<div id="c131-wall" class="c131-wall"></div><div id="c131-audio" hidden></div>',
  '<div class="c131-tools">',
  '<button type="button" id="c131-mic" class="c126-btn">🎤 Включить микрофон</button>',
  '<button type="button" id="c131-cam" class="c126-btn">📷 Включить камеру</button>',
  '<button type="button" id="c131-screen" class="c126-btn">🖥 Показать экран</button>',
  '<button type="button" id="c131-invite" class="c126-btn">📨 Позвать в чат</button>',
  '<button type="button" id="c131-join" class="c126-btn">↻ Повторить</button>',
  '<button type="button" id="c131-leave" class="c126-btn c131-danger">Завершить звонок</button>',
  '</div></section>'
 ].join('');
 $('app').append(overlay);
 const minibar=el('div','c131-mini');minibar.id='c131-mini';minibar.hidden=true;
 minibar.setAttribute('role','region');minibar.setAttribute('aria-label','Активный звонок РЕСАНТА CONNECT');
 minibar.innerHTML=[
  '<strong>📹 Идёт видеозвонок</strong><small id="c131-mini-info">1 участник</small>',
  '<div class="c131-mini-actions">',
  '<button id="c131-mini-restore" type="button" class="c126-btn">⛶ Развернуть</button>',
  '<button id="c131-mini-mic" type="button" class="c126-btn">🎤 Выключить</button>',
  '<button id="c131-mini-screen" type="button" class="c126-btn">🖥 Экран</button>',
  '<button id="c131-mini-leave" type="button" class="c126-btn c131-danger">✕ Завершить</button>',
  '</div>'
 ].join('');
 $('app').append(minibar);
 $('c131-minimize').addEventListener('click',minimize);
 $('c131-mini-restore').addEventListener('click',restore);
 $('c131-mini-leave').addEventListener('click',()=>leave());
 $('c131-mini-mic').addEventListener('click',()=>toggle('mic'));
 $('c131-mini-screen').addEventListener('click',()=>toggle('screen'));
 $('c131-close').addEventListener('click',()=>leave());
 $('c131-leave').addEventListener('click',()=>leave());
 $('c131-mic').addEventListener('click',()=>toggle('mic'));
 $('c131-cam').addEventListener('click',()=>toggle('cam'));
 $('c131-screen').addEventListener('click',()=>toggle('screen'));
 $('c131-invite').addEventListener('click',invite);
 $('c131-join').addEventListener('click',join);
 // React immediately to CRM navigation/logout, not just the periodic fallback.
 if(typeof MutationObserver!=='undefined'){
  let previousPage=$('app')?.dataset?.activePage||'';
  const watch=new MutationObserver(()=>{
   if(!call)return;
   if(!ctx.isSignedIn?.(callIdentity)){leave(true);return;}
   const currentPage=$('app')?.dataset?.activePage||'';
   // Minimize once when navigating away, NOT repeatedly after user restores.
   if(currentPage!==previousPage){
    previousPage=currentPage;
    if(currentPage!=='connect'&&!minimized)minimize();
   }
  });
  watch.observe($('app'),{attributes:true,attributeFilter:['data-active-page','style']});
 }
}
// Changing CRM sections or selecting a different chat must NOT hang up an ongoing call.
function chatChanged(_id){
 if(call){updateMini();return;}
 if(connecting&&ctx.isOpen?.()===false)leave(true);
}
window.crmConnectVideo131={init,chatChanged,join};
})();