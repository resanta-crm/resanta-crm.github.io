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
 let filterText='',refreshing=false,oldest=null,loadingOlder=false;const drafts=new Map(),previews=new Map();
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
   const preview=previews.get(r.id);if(preview)b.append(node('span','c216-preview',preview.body?.slice(0,85)||''),node('time','',dateTime(preview.created_at)));
   host.append(b);
  });
  window.crmConnectNotify128?.paint();
 }
 async function getDirectory(){
  const expected=actor;const res=await dbClient().rpc('connect_directory_v1');if(actor!==expected)return;
  staff=ensure(res)||[];
  if(!staff.some(u=>u.id===actor))throw Error('Нет доступа к реестру сотрудников CRM.');
 }
 async function getRooms(){
  const expected=actor;const results=await Promise.all([
   dbClient().from('connect_rooms_v1').select('id,kind,title,created_at').order('created_at',{ascending:false}),
   dbClient().from('connect_room_members_v1').select('room_id,user_id,role,last_read_at'),
   dbClient().rpc('connect_room_previews_v2')
  ]);
  if(actor!==expected||profile()?.id!==expected)return;
  previews.clear();for(const r of ensure(results[2])||[])previews.set(r.room_id,r);
  rooms=ensure(results[0])||[];
  members=ensure(results[1])||[];
  if(roomId&&!ownMember(roomId))resetRoom();
  renderRooms();
 }
 function receipt(message){const others=members.filter(x=>x.room_id===message.room_id&&x.user_id!==actor);return others.length&&others.every(x=>Date.parse(x.last_read_at)>=Date.parse(message.created_at))?(others.length>1?'Прочитано всеми':'Прочитано'):'Сохранено';}
 function updateCall(message,bubble){
  if(!message.call_id||!myPermissions?.video_enabled)return;
  let state=bubble.querySelector('.c216-call-state');if(state?.dataset.final==='1'||state?.dataset.busy==='1')return;
  if(!state){state=node('small','c216-call-state','Проверяем состояние звонка…');bubble.append(state);}state.dataset.busy='1';
  dbClient().rpc('connect_call_action_v2',{p_room_id:message.room_id,p_action:'get',p_call_id:message.call_id}).then(r=>{if(!bubble.isConnected)return;const c=r.data?.call;const active=c&&['ringing','active'].includes(c.status);state.textContent=c?({ringing:'Ожидает ответа',active:'Звонок идёт',ended:'Звонок завершён',missed:'Пропущенный звонок'}[c.status]||'Звонок'):'Состояние недоступно';if(c&&!active){bubble.querySelector('button')?.remove();state.dataset.final='1';}}).catch(()=>{state.textContent='Состояние временно недоступно';}).finally(()=>{state.dataset.busy='';});
 }
 function appendMsg(message,prepend=false){
  window.crmConnectVideo131?.rememberIncoming?.(message);
  const host=$('c126-messages');
  if(!host||message.room_id!==roomId)return;
  const atBottom=host.scrollHeight-host.scrollTop-host.clientHeight<80;
  const existing=host.querySelector('[data-message="'+message.id+'"]');if(existing){const r=existing.querySelector('.c216-receipt');if(r)r.textContent=receipt(message);updateCall(message,existing);return;}
  host.querySelector('.c126-empty')?.remove();
  const bubble=node('article','c126-bubble'+(message.sender_id===actor?' mine':''));
  bubble.dataset.message=message.id;
  bubble.append(node('b','',staffName(message.sender_id)),node('div','',message.body),node('time','',dateTime(message.created_at)));
  const incomingCall=!!message.call_id&&
    message.sender_id!==actor&&myPermissions?.video_enabled===true&&
    Date.now()-Date.parse(message.created_at||'')<4*60*1000&&
    Date.now()-Date.parse(message.created_at||'')>=0;
  if(incomingCall){
    const enter=button('📹 Присоединиться к видеозвонку','c126-btn',()=>{
      if(roomId===message.room_id)window.crmConnectVideo131?.join?.({incoming:true});
    });
    enter.title='Подключиться к звонку этого чата';
    bubble.append(enter);
  }
  updateCall(message,bubble);
  if(message.sender_id===actor)bubble.append(node('small','c216-receipt',receipt(message)));
  if(prepend)host.prepend(bubble);else{host.append(bubble);host.dataset.latestMessage=message.id;if(atBottom)host.scrollTop=host.scrollHeight;else $('c216-new-messages').hidden=false;}
 }
 async function getMessages(){
  const requested=roomId,expected=actor;if(!requested)return;
  const res=await dbClient().from('connect_messages_v1').select('id,room_id,sender_id,body,created_at,call_id').eq('room_id',requested).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100);
  const rows=ensure(res)||[];if(roomId!==requested||actor!==expected||profile()?.id!==expected)return;
  const host=$('c126-messages');const initial=host.dataset.roomId!==requested;
  if(initial){host.replaceChildren();host.dataset.roomId=requested;host.dataset.latestMessage='';oldest=rows.at(-1)||null;$('c216-older').hidden=rows.length<100;$('c216-new-messages').hidden=true;}
  if(!rows.length&&!host.children.length)host.append(node('div','c126-empty','Напишите первое сообщение.'));
  rows.slice().reverse().forEach(m=>appendMsg(m));
  if(initial)host.scrollTop=host.scrollHeight;
  await window.crmConnectMedia127?.sync(requested,rows.map(x=>x.id));
 }
 async function getOlder(){
  if(loadingOlder||!oldest||!roomId)return;loadingOlder=true;const requested=roomId,expected=actor,boundary=oldest,host=$('c126-messages'),height=host.scrollHeight,scroll=host.scrollTop;
  try{const r=await dbClient().from('connect_messages_v1').select('id,room_id,sender_id,body,created_at,call_id').eq('room_id',requested).or('created_at.lt.'+boundary.created_at+',and(created_at.eq.'+boundary.created_at+',id.lt.'+boundary.id+')').order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100);
   const rows=ensure(r)||[];if(roomId!==requested||actor!==expected||profile()?.id!==expected)return;
   for(const m of rows)appendMsg(m,true);if(rows.length)oldest=rows.at(-1);$('c216-older').hidden=rows.length<100;host.scrollTop=scroll+host.scrollHeight-height;
   await window.crmConnectMedia127?.sync(requested,rows.map(x=>x.id));
  }catch(e){notice(textErr(e),true);}finally{loadingOlder=false;}
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
  if(roomId)drafts.set(actor+':'+roomId,$('c126-text').value);
  const changed=roomId!==id;roomId=id;$('page-connect').querySelector('.c126-grid')?.classList.add('c216-room-open');if(changed){$('c126-text').value=drafts.get(actor+':'+id)||'';$('c126-messages').dataset.roomId='';}
  window.crmConnectMedia127?.discardIfNeeded();
  $('c126-name').textContent=roomLabel(room);
  $('c126-info').textContent=members.filter(x=>x.room_id===id).length+' участников';
  if($('c216-mute'))$('c216-mute').textContent=window.crmConnectDeliveryV2?.isMuted?.(id)?'Уведомления чата: выкл.':'Уведомления чата: вкл.';
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
  const input=$('c126-text'),original=input.value,body=original.trim(),targetRoom=roomId,targetActor=actor;
  if(!body)return;
  sending=true;$('c126-send').disabled=true;
  try{
   const res=await dbClient().from('connect_messages_v1')
    .insert({room_id:targetRoom,sender_id:targetActor,body})
    .select('id,room_id,sender_id,body,created_at').single();
   const message=ensure(res);if(actor!==targetActor||profile()?.id!==targetActor)return;
   drafts.delete(targetActor+':'+targetRoom);if(message&&roomId===targetRoom){appendMsg(message);if(input.value===original)input.value='';notice('Сообщение сохранено.');}
  }catch(e){notice(textErr(e),true);}
  finally{sending=false;$('c126-send').disabled=false;}
 }
 async function refresh(){
  if(!isOpen()||!actor||refreshing)return;refreshing=true;try{await getRooms();if(roomId)await getMessages();window.crmConnectNotify128?.refresh();}finally{refreshing=false;}
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
    stopSub();actor=response.data.user.id;rooms=[];members=[];staff=[];drafts.clear();previews.clear();$('c126-messages').dataset.roomId='';resetRoom();
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
  const mute=button('Уведомления чата: вкл.','c126-btn',async()=>{if(!roomId)return;const value=!window.crmConnectDeliveryV2?.isMuted?.(roomId);const r=await dbClient().rpc('connect_set_mute_v2',{p_room_id:roomId,p_muted:value});if(r.error){notice(textErr(r.error),true);return;}window.crmConnectDeliveryV2?.setMuted?.(roomId,value);mute.textContent=value?'Уведомления чата: выкл.':'Уведомления чата: вкл.';});mute.id='c216-mute';$('c126-info').parentElement?.append(mute);
  const back=button('← Все чаты','c126-btn c216-back',()=>{$('page-connect').querySelector('.c126-grid')?.classList.remove('c216-room-open');});$('c126-name').parentElement?.prepend(back);
  const messages=$('c126-messages');const older=button('Загрузить предыдущие сообщения','c126-btn',getOlder);older.id='c216-older';older.hidden=true;messages.before(older);
  const next=button('Новые сообщения ↓','c126-btn',()=>{messages.scrollTop=messages.scrollHeight;next.hidden=true;window.crmConnectNotify128?.markRead(roomId);});next.id='c216-new-messages';next.hidden=true;messages.after(next);
  messages.addEventListener('scroll',()=>{if(messages.scrollHeight-messages.scrollTop-messages.clientHeight<80){next.hidden=true;window.crmConnectNotify128?.markRead(roomId);}});
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
   actorName:()=>staffName(actor),roomName:()=>roomLabel(rooms.find(r=>r.id===roomId)||{}),isOpen,
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
 // Notification "Open / Join" routes to the exact invited room, not the first recent chat.
 async function openInvitedRoom(id,joinVideo=false){
  await open();
  if(!id||!ownMember(id))return;
  await selectRoom(id);
  if(joinVideo&&myPermissions?.video_enabled)await window.crmConnectVideo131?.join?.({incoming:true});
 }
 window.crmConnectRoomState216={roomId:()=>roomId,lastMessageId:()=>($('c126-messages')?.dataset.latestMessage||null),atBottom:()=>{const e=$('c126-messages');return !!e&&e.scrollHeight-e.scrollTop-e.clientHeight<80;}};
 window.crmConnectOpenRoom136=openInvitedRoom;
 window.crmConnectOpen126=open;
 // defer scripts execute while readyState is 'interactive'; later CONNECT modules
 // (media/notifications) are not defined yet. Wait for DOMContentLoaded so the
 // attachment and microphone handlers are registered exactly once.
 if(document.readyState==='complete')init();
 else document.addEventListener('DOMContentLoaded',init,{once:true});
})();
