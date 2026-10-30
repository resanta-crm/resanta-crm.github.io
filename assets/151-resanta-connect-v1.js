/* RESANTA CONNECT №126. Native, lazy loaded inside existing CRM.
 * Uses existing db, Supabase Auth and goPage(). No requests during login.
 * All access restrictions are enforced by Postgres RLS/RPC.
 */
(function(){
 'use strict';
 if(window.crmConnect126Active)return;
 window.crmConnect126Active=true;
 const $=id=>document.getElementById(id);
 const node=(tag,css,text)=>{const n=document.createElement(tag);if(css)n.className=css;if(text!==undefined)n.textContent=String(text??'');return n;};
 let staff=[],rooms=[],members=[],actor=null,roomId=null,channel=null;
 let active=false,loading=false,sending=false,ticker=null,dialogMode='create',myPermissions=null;
 let filterText='';
 const dbClient=()=>typeof db!=='undefined'?db:null;
 const profile=()=>typeof currentProfile!=='undefined'?currentProfile:null;
 const isOpen=()=>$('app')?.dataset?.activePage==='connect'&&$('app')?.style?.display!=='none'&&!!profile();
 const staffName=id=>staff.find(x=>x.id===id)?.name||'Сотрудник';
 const ownMember=id=>members.find(x=>x.user_id===actor&&x.room_id===id);
 const roomLabel=r=>{
  if(r.kind!=='direct')return r.title||'Групповой чат';
  const other=members.find(x=>x.room_id===r.id&&x.user_id!==actor);
  return other?staffName(other.user_id):'Личный чат';
 };
 const textErr=e=>String(e?.message||e?.error_description||e||'Ошибка сервиса');
 function ensure(res){if(res.error)throw res.error;return res.data;}
 function notice(t,bad){
  const n=$('c126-status');if(n){n.textContent=String(t);n.classList.toggle('error',!!bad);}
 }
 function button(label,cls,fn){
  const b=node('button',cls,label);b.type='button';b.addEventListener('click',fn);return b;
 }
 function dateTime(x){
  const d=new Date(x);
  return Number.isFinite(d.valueOf())?d.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
 }
 function resetRoom(){
  window.crmConnectVideo131?.chatChanged(null);
  roomId=null;
  stopSub();
  $('c126-name').textContent='Выберите чат';
  $('c126-info').textContent='Только сотрудники CRM';
  $('c126-compose').hidden=true;
  $('c126-invite').hidden=true;
  if($('c131-start'))$('c131-start').hidden=true;
  $('c126-messages').replaceChildren(node('div','c126-empty','Создайте первый чат с коллегой.'));
 }
 function stopSub(){
  if(channel&&dbClient())dbClient().removeChannel(channel);
  channel=null;
 }
 function renderRooms(){
  const host=$('c126-rooms');host.replaceChildren();
  const visible=rooms.filter(r=>roomLabel(r).toLocaleLowerCase('ru-RU').includes(filterText));
  if(!visible.length){host.append(node('div','c126-empty','Пока нет чатов'));return;}
  visible.forEach(r=>{
   const b=button('','c126-room'+(r.id===roomId?' active':''),()=>selectRoom(r.id).catch(e=>notice(textErr(e),true)));
   b.dataset.roomId=r.id;
   b.append(node('b','',roomLabel(r)),node('small','',(r.kind==='direct'?'Личный':r.kind==='channel'?'Канал':'Группа')+' · '+members.filter(x=>x.room_id===r.id).length+' уч.'));
   host.append(b);
  });
  window.crmConnectNotify128?.paint();
 }
 async function getDirectory(){
  const res=await dbClient().rpc('connect_directory_v1');
  staff=ensure(res)||[];
  if(!staff.some(u=>u.id===actor))throw Error('Нет доступа к реестру сотрудников CRM.');
 }
 async function getRooms(){
  const results=await Promise.all([
   dbClient().from('connect_rooms_v1').select('id,kind,title,created_at').order('created_at',{ascending:false}),
   dbClient().from('connect_room_members_v1').select('room_id,user_id,role')
  ]);
  rooms=ensure(results[0])||[];
  members=ensure(results[1])||[];
  if(roomId&&!ownMember(roomId))resetRoom();
  renderRooms();
 }
 function appendMsg(message){
  const host=$('c126-messages');
  if(!host||message.room_id!==roomId)return;
  if(host.querySelector('[data-message="'+message.id+'"]'))return;
  host.querySelector('.c126-empty')?.remove();
  const bubble=node('article','c126-bubble'+(message.sender_id===actor?' mine':''));
  bubble.dataset.message=message.id;
  bubble.append(node('b','',staffName(message.sender_id)),node('div','',message.body),node('time','',dateTime(message.created_at)));
  host.append(bubble);
  host.scrollTop=host.scrollHeight;
 }
 async function getMessages(){
  const requested=roomId;if(!requested)return;
  const res=await dbClient().from('connect_messages_v1')
   .select('id,room_id,sender_id,body,created_at')
   .eq('room_id',requested).order('created_at',{ascending:false}).limit(100);
  const rows=ensure(res)||[];
  if(roomId!==requested)return;
  const host=$('c126-messages');host.replaceChildren();
  if(!rows.length)host.append(node('div','c126-empty','Напишите первое сообщение.'));
  rows.slice().reverse().forEach(appendMsg);
  await window.crmConnectMedia127?.sync(requested,rows.map(x=>x.id));
 }
 function subscribe(id){
  stopSub();
  channel=dbClient().channel('crm-connect-'+id)
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'connect_messages_v1',filter:'room_id=eq.'+id},e=>{
    if(isOpen()&&roomId===id&&e.new){
     appendMsg(e.new);
     if(e.new.sender_id!==actor){
      window.setTimeout(()=>window.crmConnectMedia127?.syncOne(e.new.id,e.new.room_id),800);
      window.crmConnectNotify128?.markRead(id);
     }
    }
   }).subscribe(status=>{
    if(status==='CHANNEL_ERROR'&&isOpen()&&roomId===id)notice('Проблема с онлайн-связью. Нажмите «Обновить».',true);
   });
 }
 async function selectRoom(id){
  const room=rooms.find(x=>x.id===id);
  if(!room||!ownMember(id))throw Error('Чат недоступен.');
  window.crmConnectVideo131?.chatChanged(id);
  roomId=id;
  window.crmConnectMedia127?.discardIfNeeded();
  $('c126-name').textContent=roomLabel(room);
  $('c126-info').textContent=members.filter(x=>x.room_id===id).length+' участников';
  $('c126-invite').hidden=room.kind==='direct'||ownMember(id)?.role!=='owner';
  $('c126-compose').hidden=false;
  if($('c131-start'))$('c131-start').hidden=!myPermissions?.video_enabled;
  renderRooms();
  await getMessages();
  if(roomId===id&&isOpen()){
   subscribe(id);
   window.crmConnectNotify128?.markRead(id);
  }
 }
 function syncKind(){
  const direct=$('c126-kind').value==='direct';
  const invite=dialogMode==='invite';
  $('c126-title-label').hidden=direct||invite;
  $('c126-title').required=!direct&&!invite;
  $('c126-people').querySelectorAll('input').forEach(i=>i.type=direct||invite?'radio':'checkbox');
 }
 function openDialog(isInvite){
  if(!actor||!isOpen())return;
  dialogMode=isInvite?'invite':'create';
  $('c126-dialog-title').textContent=isInvite?'Пригласить коллегу':'Создать чат';
  $('c126-kind-label').hidden=isInvite;
  $('c126-kind').value=isInvite?'group':'direct';
  $('c126-title').value='';
  $('c126-kind').querySelector('option[value=channel]').disabled=profile()?.role!=='boss';
  const current=new Set(members.filter(x=>x.room_id===roomId).map(x=>x.user_id));
  const host=$('c126-people');host.replaceChildren();
  staff.filter(u=>u.id!==actor&&(!isInvite||!current.has(u.id))).forEach(u=>{
   const label=node('label');
   const input=node('input');input.type='radio';input.name='c126-employee';input.value=u.id;
   label.append(input,node('span','',u.name||u.email));host.append(label);
  });
  $('c126-save').textContent=isInvite?'Пригласить':'Создать';
  syncKind();
  $('c126-overlay').hidden=false;
 }
 function closeDialog(){$('c126-overlay').hidden=true;}
 async function saveDialog(e){
  e.preventDefault();if(sending)return;
  const selected=Array.from($('c126-people').querySelectorAll('input:checked')).map(x=>x.value);
  const kind=$('c126-kind').value;
  if(dialogMode==='invite'&&selected.length!==1){notice('Выберите одного сотрудника.',true);return;}
  if(dialogMode!=='invite'&&((kind==='direct'&&selected.length!==1)||(kind!=='direct'&&selected.length<1))){notice('Выберите участников чата.',true);return;}
  sending=true;$('c126-save').disabled=true;
  try{
   if(dialogMode==='invite'){
    ensure(await dbClient().rpc('connect_invite_member_v1',{p_room_id:roomId,p_user_id:selected[0]}));
    closeDialog();await getRooms();
    if(roomId)await selectRoom(roomId);
    notice('Сотрудник добавлен.');
   }else{
    const id=ensure(await dbClient().rpc('connect_create_room_v1',{
     p_kind:kind,p_title:$('c126-title').value,p_other_members:selected
    }));
    closeDialog();await getRooms();await selectRoom(id);
    notice('Чат создан. Сообщения видят только его участники.');
   }
  }catch(e){notice(textErr(e),true);}
  finally{sending=false;$('c126-save').disabled=false;}
 }
 async function send(e){
  e.preventDefault();if(sending||!roomId)return;
  const input=$('c126-text'),body=input.value.trim();
  if(!body)return;
  sending=true;$('c126-send').disabled=true;
  try{
   const res=await dbClient().from('connect_messages_v1')
    .insert({room_id:roomId,sender_id:actor,body})
    .select('id,room_id,sender_id,body,created_at').single();
   const message=ensure(res);if(message)appendMsg(message);
   input.value='';notice('Сообщение отправлено.');
  }catch(e){notice(textErr(e),true);}
  finally{sending=false;$('c126-send').disabled=false;}
 }
 async function refresh(){
  if(!isOpen()||!actor)return;
  await getRooms();if(roomId)await getMessages();
  window.crmConnectNotify128?.refresh();
 }
 async function open(){
  if(typeof goPage!=='function'||!$('page-connect'))return;
  if(loading)return;
  loading=true;
  try{
   if(!dbClient())throw Error('Система авторизации ещё загружается.');
   const response=await dbClient().auth.getUser();
   if(response.error||!response.data?.user)throw Error('Войдите в CRM.');
   if(!profile()||response.data.user.id!==profile().id)throw Error('Не удалось подтвердить учётную запись CRM.');
   const rights=await dbClient().from('connect_permissions_v1').select('chat_enabled,video_enabled')
    .eq('user_id',response.data.user.id).maybeSingle();
   if(rights.error)throw rights.error;
   if(!rights.data?.chat_enabled)throw Error('Доступ к корпоративным чатам для вашей учётной записи не предоставлен.');
   myPermissions=rights.data;
   goPage('connect','Чаты');
   if(actor!==response.data.user.id){
    stopSub();actor=response.data.user.id;rooms=[];members=[];staff=[];resetRoom();
   }
   await getDirectory();await getRooms();
   if(roomId&&ownMember(roomId))await selectRoom(roomId);
   else if(rooms.length)await selectRoom(rooms[0].id);
   else resetRoom();
   if(!ticker)ticker=window.setInterval(()=>{
    if(isOpen()&&actor&&document.visibilityState==='visible')refresh().catch(e=>notice(textErr(e),true));
    else if(!isOpen())stopSub();
   },25000);
   active=true;notice('РЕСАНТА CONNECT · корпоративные чаты доступны.');
   window.crmConnectAccess136?.refreshForUser?.();
  }catch(e){
   notice('Чаты пока недоступны: '+textErr(e),true);active=false;
   window.crmConnectAccess136?.refreshForUser?.();
  }
  finally{loading=false;}
 }
 function init(){
  const host=$('page-connect');if(!host)return;
  $('c126-refresh').addEventListener('click',()=>refresh().catch(e=>notice(textErr(e),true)));
  $('c126-new').addEventListener('click',()=>openDialog(false));
  $('c126-invite').addEventListener('click',()=>openDialog(true));
  $('c126-kind').addEventListener('change',syncKind);
  $('c126-close').addEventListener('click',closeDialog);
  $('c126-cancel').addEventListener('click',closeDialog);
  $('c126-room-form').addEventListener('submit',saveDialog);
  $('c126-compose').addEventListener('submit',send);
  $('c126-text').addEventListener('keydown',e=>{
   if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('c126-compose').requestSubmit();}
  });
  $('c126-filter').addEventListener('input',e=>{
   filterText=e.target.value.trim().toLocaleLowerCase('ru-RU');renderRooms();
  });
  window.crmConnectMedia127?.init({
   client:dbClient,roomId:()=>roomId,actor:()=>actor,isOpen,
   notify:notice,onMessage:appendMsg
  });
  window.crmConnectAccess136?.init({client:dbClient,profile,notify:notice});
  window.crmConnectVideo131?.init({
   client:dbClient,roomId:()=>roomId,actor:()=>actor,
   actorName:()=>staffName(actor),isOpen,
   // Keep an active meeting when switching pages; end it immediately on sign-out/account change.
   isSignedIn:expectedId=>!!expectedId && $('app')?.style?.display!=='none' &&
    profile()?.id===expectedId && typeof currentUser!=='undefined' && currentUser?.id===expectedId,
   notify:notice,onMessage:appendMsg
  });
  document.addEventListener('visibilitychange',()=>{
   if(document.hidden)stopSub();
   else if(isOpen()&&roomId&&active)subscribe(roomId);
  });
 }
 window.crmConnectOpen126=open;
 // defer scripts execute while readyState is 'interactive'; later CONNECT modules
 // (media/notifications) are not defined yet. Wait for DOMContentLoaded so the
 // attachment and microphone handlers are registered exactly once.
 if(document.readyState==='complete')init();
 else document.addEventListener('DOMContentLoaded',init,{once:true});
})();