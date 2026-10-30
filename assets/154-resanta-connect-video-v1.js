/* RESANTA CONNECT 131 video. Uses authenticated CRM token function.
   Nothing is loaded/captured until the employee clicks the video button. */
(function(){
'use strict';
if(window.crmConnectVideo131)return;
const $=id=>document.getElementById(id);
const ctx={};
const SDK_URL='https://cdn.jsdelivr.net/npm/livekit-client@2.23.0/dist/livekit-client.umd.min.js';
let ready=false, connecting=false, call=null, callChat=null, sdkLoading=null, monitor=null, requestEpoch=0;
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
 $('c131-wall')?.replaceChildren();$('c131-audio')?.replaceChildren();
 callChat=null;connecting=false;$('c131-start').disabled=false;
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
 if(connecting||call)return;
 if(!ctx.isOpen?.()||!ctx.roomId?.()||!ctx.actor?.())return;
 if(!window.isSecureContext){ctx.notify?.('Видеосвязь требует HTTPS.',true);return;}
 const selected=ctx.roomId(),epoch=++requestEpoch;connecting=true;$('c131-start').disabled=true;
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
  candidate.on(livekit.RoomEvent.LocalTrackPublished,pub=>{if(pub.track)attach(pub.track,candidate.localParticipant,true);});
  candidate.on(livekit.RoomEvent.LocalTrackUnpublished,pub=>detach(pub.track));
  candidate.on(livekit.RoomEvent.Disconnected,()=>{if(call===candidate)leave(true);});
  await candidate.connect(response.data.url,response.data.token);
  if(epoch!==requestEpoch||!ctx.isOpen?.()||ctx.roomId?.()!==selected)throw Error('Чат закрыт.');
  call=candidate;callChat=selected;connecting=false;$('c131-start').disabled=false;
  tile('local',(ctx.actorName?.()||'Вы')+' (вы)');
  for(const p of call.remoteParticipants.values())tile(p.identity,p.name);
  count();
  status('Видеозвонок подключён. Камеру и микрофон можно включить отдельно.');
  monitor=setInterval(()=>{if(!ctx.isOpen?.()||ctx.roomId?.()!==callChat||!ctx.actor?.())leave(true);},1500);
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
 const p=call.localParticipant;
 const b=kind==='mic'?$('c131-mic'):kind==='cam'?$('c131-cam'):$('c131-screen');
 b.disabled=true;
 try{
  if(kind==='mic'){
   const enabled=!p.isMicrophoneEnabled;await p.setMicrophoneEnabled(enabled);
   b.textContent=enabled?'🎤 Выключить микрофон':'🎤 Включить микрофон';
  }else if(kind==='cam'){
   const enabled=!p.isCameraEnabled;await p.setCameraEnabled(enabled);
   b.textContent=enabled?'📷 Выключить камеру':'📷 Включить камеру';
  }else{
   const enabled=!p.isScreenShareEnabled;
   await p.setScreenShareEnabled(enabled,{audio:true});
   b.textContent=enabled?'⏹ Остановить экран':'🖥 Показать экран';
  }
 }catch(e){status('Не удалось включить устройство: '+String(e?.message||e),true);}
 finally{b.disabled=false;}
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
  if(r.data)ctx.onMessage?.(r.data);
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
  '<button type="button" id="c131-close" class="c126-btn">✕ Закрыть</button></div>',
  '<div id="c131-status" class="c131-status" role="status">Подключение…</div>',
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
 $('page-connect').append(overlay);
 $('c131-close').addEventListener('click',()=>leave());
 $('c131-leave').addEventListener('click',()=>leave());
 $('c131-mic').addEventListener('click',()=>toggle('mic'));
 $('c131-cam').addEventListener('click',()=>toggle('cam'));
 $('c131-screen').addEventListener('click',()=>toggle('screen'));
 $('c131-invite').addEventListener('click',invite);
 $('c131-join').addEventListener('click',join);
}
function chatChanged(id){if((callChat&&callChat!==id)||(connecting&&ctx.roomId?.()!==id))leave(true); }
window.crmConnectVideo131={init,chatChanged};
})();