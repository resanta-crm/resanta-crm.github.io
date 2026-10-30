/* RESANTA CONNECT #128: unread counters + optional browser notifications.
 * No OS background push: works while the CRM page remains open.
 * No extra sign-in, no service worker or microphone use.
 */
(function(){
'use strict';
if(window.crmConnectNotify128)return;
let client=null,account=null,counts=new Map(),total=0;
let pollTimer=null,observer=null,fetchBusy=false,initialized=false,seenFirst=false,ackTimer=null;
let realtimeChannel=null,seenMessageIds=new Set(),notificationAccount=null,videoAllowed=false;
const $=id=>document.getElementById(id);
const activeProfile=()=>typeof currentProfile!=='undefined'?currentProfile:null;
const database=()=>typeof db!=='undefined'?db:null;
const isSignedIn=()=>!!activeProfile()?.id&&$('app')?.style?.display!=='none';
function clearState(){
 if(realtimeChannel&&database())database().removeChannel(realtimeChannel).catch?.(()=>{});
 realtimeChannel=null;notificationAccount=null;seenMessageIds.clear();
 account=null;counts.clear();total=0;seenFirst=false;videoAllowed=false;
 for(const id of ['c128-nav-count','c128-bottom-count']){
  const span=$(id);if(span){span.textContent='';span.hidden=true;}
 }
 const hint=$('c128-allow');if(hint)hint.hidden=true;
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
 if(hint)hint.hidden=!isSignedIn()||typeof Notification==='undefined'||Notification.permission!=='default';
}
function startUi(){
 badge('c128-nav-count','nav-connect');
 badge('c128-bottom-count','bn-connect');
 const bar=$('page-connect')?.querySelector('.c126-top');
 if(bar&&!$('c128-allow')){
  const btn=document.createElement('button');
  btn.type='button';btn.id='c128-allow';btn.className='c126-btn';
  btn.textContent='🔔 Уведомления';btn.hidden=true;
  btn.title='Разрешить уведомления, пока CRM открыта';
  btn.addEventListener('click',async()=>{
   if(typeof Notification==='undefined')return;
   try{
    const result=await Notification.requestPermission();
    if(result==='granted')btn.hidden=true;
    else btn.hidden=true;
   }catch(_){btn.hidden=true;}
  });
  bar.append(btn);
 }
 paint();
}
async function checkAccount(){
 if(!isSignedIn()||!database())return null;
 const id=activeProfile().id;
 if(account===id)return id;
 const info=await database().auth.getUser();
 if(info.error||info.data?.user?.id!==id){clearState();return null;}
 const rights=await database().from('connect_permissions_v1').select('chat_enabled,video_enabled')
  .eq('user_id',id).maybeSingle();
 if(rights.error||!rights.data?.chat_enabled){clearState();return null;}
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
  const increment=seenFirst&&newTotal>total;
  counts=next;total=newTotal;seenFirst=true;
  paint();
  if(increment&&document.hidden&&typeof Notification!=='undefined'&&Notification.permission==='granted'&&!realtimeChannel){
   try{
    const n=new Notification('РЕСАНТА CONNECT',{body:'Новые сообщения в корпоративных чатах',tag:'resanta-connect-unread'});
    n.onclick=()=>{window.focus();n.close();window.crmConnectOpen126?.();};
   }catch(_){}
  }
 }catch(e){
  // Chat notification service must not break login, CRM navigation or messages.
  console.warn('CONNECT unread refresh:',String(e?.message||e));
 }finally{fetchBusy=false;}
}
function notificationToast(roomId,isVideo){
  if(!isSignedIn())return;
  let host=$('c136-notification-toast');
  if(!host){
   host=document.createElement('div');host.id='c136-notification-toast';host.className='c136-notification-toast';
   host.setAttribute('role','alert');$('app')?.append(host);
  }
  host.replaceChildren();
  const message=document.createElement('strong');
  message.textContent=isVideo?'📹 Входящий видеозвонок · РЕСАНТА CONNECT':'💬 Новое сообщение · РЕСАНТА CONNECT';
  const open=document.createElement('button');open.type='button';open.textContent=isVideo?'Присоединиться':'Открыть чат';
  open.addEventListener('click',async()=>{
   host.hidden=true;
   try{await window.crmConnectOpenRoom136?.(roomId,isVideo);}catch(e){console.warn('CONNECT incoming action:',String(e?.message||e));}
  });
  const close=document.createElement('button');close.type='button';close.textContent='✕';
  close.setAttribute('aria-label','Скрыть уведомление');close.addEventListener('click',()=>{host.hidden=true;});
  host.append(message,open,close);host.hidden=false;
}
function onRealtimeMessage(message){
 if(!message?.id||!account||message.sender_id===account||!message.room_id)return;
 if(seenMessageIds.has(message.id))return;
 seenMessageIds.add(message.id);
 if(seenMessageIds.size>150)seenMessageIds.clear();
 // Chat-only staff must never see a button offering to join a forbidden video call.
 const isVideo=videoAllowed&&String(message.body||'').startsWith('📹 Начался видеозвонок');
 // Do not display alert for a chat that the user is actively reading, except for calls.
 const alreadyReading=$('app')?.dataset?.activePage==='connect' &&
  !!document.querySelector('#c126-rooms .c126-room.active[data-room-id="'+message.room_id+'"]');
 if(!alreadyReading||isVideo)notificationToast(message.room_id,isVideo);
 if(typeof Notification!=='undefined'&&Notification.permission==='granted'&&document.hidden){
  try{
   const n=new Notification(isVideo?'📹 Видеозвонок РЕСАНТА CONNECT':'💬 Сообщение РЕСАНТА CONNECT',{
    body:isVideo?'Приглашение от коллеги. Откройте чат для подключения.':'Новое сообщение от коллеги.',
    tag:'connect-incoming-'+message.id
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
   if(state==='CHANNEL_ERROR')console.warn('CONNECT realtime notifications unavailable, falling back to polling');
  });
}

function acknowledge(roomId){
 if(!roomId||!isSignedIn())return;
 if(ackTimer)clearTimeout(ackTimer);
 const expectedRoom=roomId,expectedAccount=account;
 ackTimer=setTimeout(async()=>{
  ackTimer=null;
  if(!isSignedIn()||account!==expectedAccount||$('app')?.dataset?.activePage!=='connect')return;
  try{
   const result=await database().rpc('connect_mark_read_v1',{p_room_id:expectedRoom});
   if(result.error)throw result.error;
   counts.delete(expectedRoom);
   total=[...counts.values()].reduce((a,b)=>a+b,0);
   paint();
  }catch(e){console.warn('CONNECT mark read:',String(e?.message||e));}
 },450);
}
function init(){
 if(initialized)return;
 initialized=true;startUi();
 pollTimer=window.setInterval(refresh,35000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
 const root=$('app');
 if(root){
  observer=new MutationObserver(()=>{
   if(!isSignedIn())clearState();
   else refresh();
  });
  observer.observe(root,{attributes:true,attributeFilter:['style']});
 }
 refresh();
}
window.crmConnectNotify128={
 init,refresh,markRead:acknowledge,paint,roomCount:id=>counts.get(id)||0
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
else init();
})();
