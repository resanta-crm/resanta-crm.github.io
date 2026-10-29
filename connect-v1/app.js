/* RESANTA CONNECT #126 — isolated DEVELOPMENT preview.
 * Requires separate Supabase dev project and schema-pilot.sql.
 * Never connect this preview to the production CRM database.
 */
(() => {
  'use strict';
  const PRODUCTION_PROJECT = 'baqchjtvtmcfzwjjluhs';
  const $ = id => document.getElementById(id);
  const config = window.CONNECT_PILOT_CONFIG || {};
  let api = null;
  let currentUser = null;
  let employees = [];
  let rooms = [];
  let membership = [];
  let selectedRoom = null;
  let channel = null;
  let busy = false;
  const employee = id => employees.find(u => u.id === id);
  const displayName = id => employee(id)?.name || 'Сотрудник';
  const errorMessage = e => e?.message || 'Неизвестная ошибка';
  const alertMsg = (message, error = false) => {
    $('notice').textContent = message;
    $('notice').classList.toggle('error', error);
  };
  function requireOk(result) {
    if (result.error) throw result.error;
    return result.data;
  }
  function formatTime(iso) {
    const date = new Date(iso);
    return Number.isNaN(date.valueOf()) ? '' : date.toLocaleString('ru-RU', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  }
  function ownMembership(roomId) {
    return membership.find(m => m.room_id === roomId && m.user_id === currentUser?.id);
  }
  function roomLabel(room) {
    if (room.kind !== 'direct') return room.title;
    const peer = membership.find(m => m.room_id === room.id && m.user_id !== currentUser?.id);
    return peer ? displayName(peer.user_id) : 'Личный чат';
  }
  function button(text, className, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = className;
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
  }
  function showLogin() {
    $('main-screen').classList.add('hidden');
    $('login-screen').classList.remove('hidden');
    $('account-label').textContent = 'Тестовый вход';
  }
  function showApp() {
    $('main-screen').classList.remove('hidden');
    $('login-screen').classList.add('hidden');
    $('account-label').textContent = displayName(currentUser.id);
  }
  async function loadDirectory() {
    // The pilot uses existing CRM users; Supabase RLS limits directory read to active staff.
    employees = requireOk(await api.from('users').select('id,name,email,role').order('name')) || [];
    if (!employees.some(u => u.id === currentUser.id)) {
      throw new Error('Текущий пользователь не зарегистрирован в CRM. Доступ запрещён.');
    }
    showApp();
  }
  function drawRooms() {
    const list = $('rooms');
    list.replaceChildren();
    if (!rooms.length) {
      const div = document.createElement('p');
      div.className = 'empty';
      div.textContent = 'Пока нет чатов';
      list.append(div);
      return;
    }
    for (const room of rooms) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'room' + (selectedRoom === room.id ? ' active' : '');
      const name = document.createElement('strong');
      name.textContent = roomLabel(room);
      const details = document.createElement('small');
      details.textContent = (room.kind === 'direct' ? 'Личный' : room.kind === 'channel' ? 'Канал' : 'Группа') +
        ' · ' + membership.filter(m => m.room_id === room.id).length + ' участ.';
      row.append(name,details);
      row.addEventListener('click', () => openRoom(room.id).catch(e => alertMsg(errorMessage(e),true)));
      list.append(row);
    }
  }
  async function loadRooms() {
    const result = await Promise.all([
      api.from('connect_rooms_v1').select('id,kind,title,created_by,created_at').order('created_at',{ascending:false}),
      api.from('connect_room_members_v1').select('room_id,user_id,role')
    ]);
    rooms = requireOk(result[0]) || [];
    membership = requireOk(result[1]) || [];
    drawRooms();
    if (selectedRoom && !rooms.some(r => r.id === selectedRoom)) {
      selectedRoom = null;
      $('composer').classList.add('hidden');
      $('messages').replaceChildren();
    }
  }
  function appendMessage(m) {
    if (!selectedRoom || m.room_id !== selectedRoom) return;
    if ($('messages').querySelector('[data-message-id="' + m.id + '"]')) return;
    const empty = $('messages').querySelector('.empty');
    if (empty) empty.remove();
    const bubble = document.createElement('article');
    bubble.className = 'bubble' + (m.sender_id === currentUser.id ? ' mine' : '');
    bubble.dataset.messageId = m.id;
    const who = document.createElement('div');
    who.className='who';
    who.textContent = displayName(m.sender_id);
    const body = document.createElement('div');
    body.textContent = m.body; // textContent: no HTML/script injection
    const time = document.createElement('div');
    time.className = 'when';
    time.textContent = formatTime(m.created_at);
    bubble.append(who,body,time);
    $('messages').append(bubble);
    $('messages').scrollTop = $('messages').scrollHeight;
  }
  async function loadMessages() {
    const forRoom = selectedRoom;
    const data = requireOk(await api.from('connect_messages_v1')
      .select('id,room_id,sender_id,body,created_at')
      .eq('room_id',forRoom).order('created_at',{ascending:false}).limit(100));
    if (selectedRoom !== forRoom) return;
    $('messages').replaceChildren();
    if (!data.length) {
      const p = document.createElement('p');
      p.className = 'empty'; p.textContent = 'Напишите первое сообщение.';
      $('messages').append(p);
    }
    [...data].reverse().forEach(appendMessage);
  }
  function subscribe(roomId) {
    if (channel) api.removeChannel(channel);
    channel = api.channel('connect-v1-' + roomId)
      .on('postgres_changes',{
        event:'INSERT',schema:'public',table:'connect_messages_v1',
        filter:'room_id=eq.'+roomId
      },payload => {
        if (selectedRoom === roomId && payload.new) appendMessage(payload.new);
      }).subscribe(status => {
        if (status === 'CHANNEL_ERROR' && selectedRoom === roomId) {
          alertMsg('Переподключение чата. Историю можно обновить вручную.',true);
        }
      });
  }
  async function openRoom(id) {
    const room = rooms.find(r=>r.id===id);
    if (!room || !ownMembership(id)) throw new Error('Этот чат недоступен.');
    selectedRoom = id;
    $('chat-title').textContent = roomLabel(room);
    $('chat-details').textContent = membership.filter(m=>m.room_id===id).length + ' участников';
    $('composer').classList.remove('hidden');
    $('invite-btn').classList.toggle('hidden',room.kind==='direct'||ownMembership(id)?.role!=='owner');
    drawRooms();
    await loadMessages();
    if (selectedRoom === id) subscribe(id);
  }
  function listInviteCandidates() {
    return employees.filter(u=>u.id!==currentUser.id);
  }
  function toggleTitleField() {
    const direct = $('room-kind').value==='direct';
    $('title-field').classList.toggle('hidden',direct);
    $('room-name').required = !direct;
    if (direct) {
      // Native radio ensures a direct chat contains exactly one other employee.
      document.querySelectorAll('#people input').forEach(input=>input.type='radio');
    } else {
      document.querySelectorAll('#people input').forEach(input=>input.type='checkbox');
    }
  }
  function openCreate() {
    $('room-kind').value='direct';
    $('room-name').value='';
    const role = employee(currentUser.id)?.role;
    $('room-kind').querySelector('option[value=channel]').disabled = role !== 'boss';
    $('people').replaceChildren();
    for (const user of listInviteCandidates()) {
      const label = document.createElement('label');
      label.className = 'person';
      const input = document.createElement('input');
      input.type='radio'; input.name='invitee'; input.value=user.id;
      const text = document.createElement('span');
      text.textContent=user.name || user.email || 'Сотрудник';
      label.append(input,text);
      $('people').append(label);
    }
    toggleTitleField();
    $('room-dialog').showModal();
  }
  async function createRoom(event) {
    event.preventDefault();
    if (busy) return;
    busy = true; $('create-submit').disabled = true;
    try {
      const selected = [...document.querySelectorAll('#people input:checked')].map(el=>el.value);
      const kind=$('room-kind').value;
      if ((kind==='direct'&&selected.length!==1)||(kind!=='direct'&&selected.length<1)) {
        throw new Error('Выберите участников чата.');
      }
      const id=requireOk(await api.rpc('connect_create_room_v1',{
        p_kind:kind,p_title:$('room-name').value,p_other_members:selected
      }));
      $('room-dialog').close();
      await loadRooms();
      await openRoom(id);
      alertMsg('Чат создан. Он виден только его участникам.');
    } catch(e) { alertMsg(errorMessage(e),true); }
    finally { busy=false; $('create-submit').disabled=false; }
  }
  function openInvite() {
    const room = rooms.find(r=>r.id===selectedRoom);
    if (!room || room.kind==='direct' || ownMembership(room.id)?.role!=='owner') return;
    $('invite-user').replaceChildren();
    const already = new Set(membership.filter(m=>m.room_id===room.id).map(m=>m.user_id));
    for (const u of employees.filter(u=>!already.has(u.id))) {
      const option = document.createElement('option');
      option.value=u.id; option.textContent=u.name || u.email;
      $('invite-user').append(option);
    }
    if (!$('invite-user').options.length) { alertMsg('Все доступные сотрудники уже в этом чате.'); return; }
    $('invite-dialog').showModal();
  }
  async function submitInvite(event) {
    event.preventDefault();
    try {
      requireOk(await api.rpc('connect_invite_member_v1',{
        p_room_id:selectedRoom,p_user_id:$('invite-user').value
      }));
      $('invite-dialog').close();
      await loadRooms();
      await openRoom(selectedRoom);
      alertMsg('Сотрудник приглашён.');
    } catch(e) { alertMsg(errorMessage(e),true); }
  }
  async function sendMessage(event) {
    event.preventDefault();
    if (busy || !selectedRoom) return;
    const body = $('message-body').value.trim();
    if (!body) return;
    busy=true; $('send-btn').disabled=true;
    try {
      const payload = requireOk(await api.from('connect_messages_v1')
        .insert({room_id:selectedRoom,sender_id:currentUser.id,body})
        .select('id,room_id,sender_id,body,created_at').single());
      appendMessage(payload);
      $('message-body').value='';
      alertMsg('Режим тестирования · переписка сохраняется в отдельном тестовом проекте.');
    } catch(e) { alertMsg(errorMessage(e),true); }
    finally { busy=false; $('send-btn').disabled=false; }
  }
  async function connectUser() {
    const {data,error}=await api.auth.getUser();
    if (error || !data?.user) { showLogin(); return; }
    currentUser=data.user;
    await loadDirectory();
    await loadRooms();
    alertMsg('Тестовый мессенджер подключён. Доступ только для участников чатов.');
  }
  async function signIn(event) {
    event.preventDefault();
    try {
      requireOk(await api.auth.signInWithPassword({
        email:$('email').value.trim(),password:$('password').value
      }));
      $('password').value='';
      await connectUser();
    }catch(e){alertMsg(errorMessage(e),true);}
  }
  async function start() {
    // Fail closed: impossible to run this branch preview against existing production DB.
    if (!config.url || !config.publishableKey || config.url.includes(PRODUCTION_PROJECT)) {
      alertMsg('Нужен отдельный TEST-проект Supabase. Подключение к рабочей CRM заблокировано.',true);
      $('login-form').querySelector('button').disabled=true;
      return;
    }
    if (!window.supabase?.createClient) {
      alertMsg('Не загружена библиотека Supabase. Проверьте подключение.',true);
      return;
    }
    api=window.supabase.createClient(config.url,config.publishableKey);
    try { await connectUser(); } catch(e) { alertMsg(errorMessage(e),true);showLogin(); }
  }
  $('login-form').addEventListener('submit',signIn);
  $('create-room').addEventListener('click',openCreate);
  $('create-form').addEventListener('submit',createRoom);
  $('create-cancel').addEventListener('click',()=>$('room-dialog').close());
  $('room-kind').addEventListener('change',toggleTitleField);
  $('reload-rooms').addEventListener('click',()=>loadRooms().catch(e=>alertMsg(errorMessage(e),true)));
  $('composer').addEventListener('submit',sendMessage);
  $('invite-btn').addEventListener('click',openInvite);
  $('invite-form').addEventListener('submit',submitInvite);
  $('invite-cancel').addEventListener('click',()=>$('invite-dialog').close());
  $('message-body').addEventListener('keydown',e=>{
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault(); $('composer').requestSubmit();}
  });
  start();
})();
