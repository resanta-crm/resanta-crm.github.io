/* RESANTA CONNECT #128: unread counters + optional browser notifications.
 * Open-page fallback; background Web Push is isolated in CONNECT v2.
 * No extra sign-in, no service worker or microphone use.
 */
(function(){
'use strict';
if(window.crmConnectNotify128)return;
let client=null,account=null,counts=new Map(),total=0;
let pollTimer=null,observer=null,fetchBusy=false,initialized=false,seenFirst=false,ackTimer=null;
let realtimeReady=false;let realtimeChannel=null,seenMessageIds=new Set(),notificationAccount=null,videoAllowed=false;
const $=id=>document.getElementById(id);
const activeProfile=()=>typeof currentProfile!=='undefined'?currentProfile:null;
const database=()=>typeof db!=='undefined'?db:null;
const isSignedIn=()=>!!activeProfile()?.id&&$('app')?.style?.display!=='none';
function clearState(){
 if(realtimeChannel&&database())database().removeChannel(realtimeChannel)?.catch?.(()=>{});
 realtimeChannel=null;realtimeReady=false;notificationAccount=null;seenMessageIds.clear();
 account=null;counts.clear();total=0;seenFirst=false;videoAllowed=false;
 for(const id of ['c128-nav-count','c128-bottom-count']){
  const span=$(id);if(span){span.textContent='';span.hidden=true;}
 }
 const hint=$('c128-allow');if(hint)hint.hidden=true;
 const toast=$('c136-notification-toast');
 if(toast){toast.hidden=true;delete toast.dataset.callId;toast.replaceChildren();}
}
function badge(id,hostId){
 const host=$(hostId);if(!host)return null;
 let item=$(id);
 if(!item){item=document.createElement('span');item.id=id;item.className='c128-badge';item.hidden=true;item.setAttribute('aria-label','Непрочитанные сообщения');host.append(item);}
 return item;
}
function paint(){
 const visible=total?String(total>99?'99+':total):'';
 for(const id of ['c128-nav-count','c128-bottom-count']){
  const item=$(id);if(item){item.hidden=!visible;item.textContent=visible;}
 }
 for(const button of document.querySelectorAll('#c126-rooms .c126-room[data-room-id]')){
  const count=counts.get(button.dataset.roomId)||0;
  let b=button.querySelector('.c128-room-count');
  if(count>0&&!b){b=document.createElement('span');b.className='c128-room-count';button.append(b);}
  if(b){b.textContent=count>99?'99+':String(count);b.hidden=!count;}
 }
 const hint=$('c128-allow');
 if(hint)hint.hidden=!isSignedIn();
}
function startUi(){
 badge('c128-nav-count','nav-connect');
 badge('c128-bottom-count','bn-connect');
 const bar=$('page-connect')?.querySelector('.c126-top');
 if(bar&&!$('c128-allow')){
  const btn=document.createElement('button');
  btn.type='button';btn.id='c128-allow';btn.className='c126-btn';
  btn.textContent='🔔 Уведомления';btn.hidden=true;
  btn.title='Подключение браузера, APK и проверка доставки';
  btn.addEventListener('click',()=>window.crmConnectDeliveryV2?.panel?.());
  bar.append(btn);
 }
 paint();
}
async function checkAccount(){
 if(!isSignedIn()||!database())return null;
 const id=activeProfile().id;
 if(account===id)return id;
 if(account)clearState();
 const info=await database().auth.getUser();
 if(info.error||info.data?.user?.id!==id){clearState();return null;}
 const rights=await database().from('connect_permissions_v1').select('chat_enabled,video_enabled')
  .eq('user_id',id).maybeSingle();
 if(rights.error||!rights.data?.chat_enabled){clearState();return null;}
 if(!isSignedIn()||activeProfile()?.id!==id)return null;
 account=id;counts.clear();total=0;seenFirst=false;videoAllowed=rights.data.video_enabled===true;
 startUi();startRealtime(id);return id;
}
async function refresh(){
 if(fetchBusy)return;
 if(!isSignedIn()){if(account)clearState();return;}
 fetchBusy=true;
 try{
  const id=await checkAccount();
  if(!id)return;
  const result=await database().rpc('connect_unread_counts_v1');
  if(result.error)throw result.error;
  if(account!==id)return;
  const next=new Map(),data=result.data||[];
  for(const row of data){const n=Math.max(0,Number(row.unread_count)||0);if(n)next.set(row.room_id,n);}
  const newTotal=[...next.values()].reduce((a,b)=>a+b,0);
  const changed=data.filter(r=>seenFirst&&(Number(r.unread_count)||0)>(counts.get(r.room_id)||0));
  counts=next;total=newTotal;seenFirst=true;
  paint();
  if(!realtimeReady){
   for(const row of changed){const latest=await database().from('connect_messages_v1').select('id,room_id,sender_id,body,created_at,call_id').eq('room_id',row.room_id).neq('sender_id',id).order('created_at',{ascending:false}).limit(1);if(account===id&&!latest.error&&latest.data?.[0])onRealtimeMessage(latest.data[0]);}
  }

 }catch(e){
  // Chat notification service must not break login, CRM navigation or messages.
  console.warn('CONNECT unread refresh:',String(e?.message||e));
 }finally{fetchBusy=false;}
}
function notificationToast({room_id:roomId,call_id:callId,body},isVideo){
  if(!isSignedIn())return;
  let host=$('c136-notification-toast');
  if(!host){
   host=document.createElement('div');host.id='c136-notification-toast';host.className='c136-notification-toast';
   host.setAttribute('role','alert');$('app')?.append(host);
  }
  host.replaceChildren();
  delete host.dataset.callId;
  const title=document.createElement('strong');
  title.textContent=isVideo?'📹 Входящий видеозвонок · ГК Ресанта':'💬 Новое сообщение · ГК Ресанта';
  host.append(title);
  const characters=[...String(body??'').trim()];
  if(!isVideo&&characters.length){
   const preview=document.createElement('p');
   preview.className='c136-notification-preview';
   preview.textContent=characters.slice(0,240).join('')+(characters.length>240?'…':'');
   host.append(preview);
  }
  const open=document.createElement('button');open.type='button';open.textContent=isVideo?'Присоединиться':'Открыть чат';
  open.addEventListener('click',async()=>{
   host.hidden=true;
   try{
    if(!await window.crmConnectOpenRoom136?.(roomId,false)||!isVideo)return;
    if(callId){
     const r=await database().rpc('connect_call_action_v2',{p_room_id:roomId,p_action:'get',p_call_id:callId});
     if(!r.data?.call||!['ringing','active'].includes(r.data.call.status))throw Error('Звонок уже завершён.');
    }
    if(window.crmConnectRoomState216?.roomId()===roomId)await window.crmConnectVideo131?.join?.({incoming:true});
   }catch(e){console.warn('CONNECT incoming action:',String(e?.message||e));}
  });
  const close=document.createElement('button');close.type='button';close.textContent='✕';
  close.setAttribute('aria-label','Скрыть уведомление');close.addEventListener('click',()=>{host.hidden=true;});
  host.append(open);
  if(isVideo&&callId){const decline=document.createElement('button');decline.type='button';decline.textContent='Отклонить';decline.addEventListener('click',async()=>{await database().rpc('connect_call_action_v2',{p_room_id:roomId,p_action:'decline',p_call_id:callId});host.hidden=true;});host.append(decline);}
  host.append(close);host.hidden=false;
  if(isVideo){window.crmConnectDeliveryV2?.playSound?.();setTimeout(()=>{if(host.dataset.callId===callId)host.hidden=true;},90000);host.dataset.callId=callId||'';}
}
function onRealtimeMessage(message){
 if(!message?.id||!account||account!==activeProfile()?.id||!isSignedIn()||message.sender_id===account||!message.room_id)return;
 if(window.crmConnectDeliveryV2?.isMuted?.(message.room_id)){void refresh();return;}
 if(seenMessageIds.has(message.id))return;
 seenMessageIds.add(message.id);
 if(seenMessageIds.size>150)seenMessageIds.clear();
 // Chat-only staff must never see a button offering to join a forbidden video call.
 const isVideo=videoAllowed&&!!(message.call_id||message.kind==='video_call');
 // Do not display alert for a chat that the user is actively reading, except for calls.
 const reading=window.crmConnectRoomState216;
 const alreadyReading=!document.hidden&&(document.hasFocus?.()??true)&&$('app')?.dataset?.activePage==='connect' &&
  reading?.roomId()===message.room_id&&reading?.atBottom();
 let noticeClaim=true;try{const key='connect-notice:'+account+':'+message.id;noticeClaim=!localStorage.getItem(key);if(noticeClaim)localStorage.setItem(key,String(Date.now()));}catch(_){}
 if(!document.hidden&&(!alreadyReading||isVideo))notificationToast(message,isVideo);
 if(noticeClaim&&typeof Notification!=='undefined'&&Notification.permission==='granted'&&(document.hidden||!(document.hasFocus?.()??true))&&!window.crmConnectDeliveryV2?.isSubscribed?.()){
  try{
   const n=new Notification(isVideo?'📹 Видеозвонок · ГК Ресанта':'💬 Сообщение · ГК Ресанта',{
    body:isVideo?'Приглашение от коллеги. Откройте чат для подключения.':'Новое сообщение от коллеги.',
    tag:'connect-'+message.id
   });
   n.onclick=()=>{window.focus();n.close();window.crmConnectOpenRoom136?.(message.room_id,isVideo);};
  }catch(_){}
 }
 refresh();
}
function startRealtime(id){
 if(!database()||realtimeChannel||notificationAccount===id)return;
 notificationAccount=id;
 realtimeChannel=database().channel('connect-incoming-'+id)
  .on('postgres_changes',{event:'INSERT',schema:'public',table:'connect_messages_v1'},event=>{
   if(account===id&&isSignedIn())onRealtimeMessage(event.new);
  })
  .subscribe(state=>{
   realtimeReady=state==='SUBSCRIBED';
   if(state==='CHANNEL_ERROR')console.warn('CONNECT realtime notifications unavailable, falling back to polling');
  });
}

function acknowledge(roomId){
 if(!roomId||!isSignedIn())return;
 if(ackTimer)clearTimeout(ackTimer);
 const expectedRoom=roomId,expectedAccount=account;
 ackTimer=setTimeout(async()=>{
  ackTimer=null;
  if(!isSignedIn()||account!==expectedAccount||document.hidden||!(document.hasFocus?.()??true)||$('app')?.dataset?.activePage!=='connect'||window.crmConnectRoomState216?.roomId()!==expectedRoom||!window.crmConnectRoomState216?.atBottom())return;
  const last=window.crmConnectRoomState216?.lastMessageId();if(!last)return;
  try{
   const result=await database().rpc('connect_mark_read_v2',{p_room_id:expectedRoom,p_message_id:last});
   if(result.error)throw result.error;
   await refresh();
  }catch(e){console.warn('CONNECT mark read:',String(e?.message||e));}
 },450);
}
function init(){
 if(initialized)return;
 initialized=true;startUi();
 pollTimer=window.setInterval(refresh,35000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){refresh();acknowledge(window.crmConnectRoomState216?.roomId());}});
 window.addEventListener('focus',()=>{refresh();acknowledge(window.crmConnectRoomState216?.roomId());});
 const root=$('app');
 if(root){
  observer=new MutationObserver(()=>{
   if(!isSignedIn()||(account&&activeProfile()?.id!==account))clearState();
   if(isSignedIn())refresh();
  });
  observer.observe(root,{attributes:true,attributeFilter:['style']});
 }
 refresh();
}
window.crmConnectNotify128={
 init,refresh,incoming:onRealtimeMessage,markRead:acknowledge,paint,roomCount:id=>counts.get(id)||0
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();
