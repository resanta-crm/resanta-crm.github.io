/* CLIENT360 | non-destructive legal entities, existing store cards stay untouched */
(function(root){
'use strict';
if(root.crmClient360V1)return;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let nav=null,page=null,items=[],groups=[],requests=[],checked=new Set(),busy=false;
const role=()=>{try{return typeof currentProfile!=='undefined'&&currentProfile?.role==='boss'}catch(_){return false}};
const canLink=()=>{try{return role()&&['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru'].includes(String(currentUser?.email||'').trim().toLowerCase())}catch(_){return false}};
function mount(){
 if(!role())return;
 const main=document.getElementById('main-content'),anchor=document.getElementById('nav-clients');
 if(!main||!anchor)return;
 if(!nav){
  nav=document.createElement('button');nav.id='nav-client360';nav.className='nav-item';
  nav.textContent='🏢 Клиент 360° · торговые точки';
  nav.onclick=open;anchor.parentNode.insertBefore(nav,anchor.nextSibling);
 }
 if(!page){
  page=document.createElement('div');page.id='page-client360';page.className='page';
  page.innerHTML='<div class="page-title">🏢 Клиент 360° · Юрлица и торговые точки</div>'+
  '<div class="card" style="margin:10px 0;line-height:1.5">'+
  '<b>Один контрагент — много адресов</b><p style="font-size:12px;color:var(--sub)">Здесь объединяем карточки в юридическую группу без удаления продаж, визитов и GPS. Если адреса/юрлица спорные — не связывайте до проверки реквизитов 1С.</p>'+
  '<div style="display:flex;gap:9px;flex-wrap:wrap"><input id="c360-search" class="form-input" placeholder="Поиск по названию или адресу" style="max-width:360px"><button class="btn-secondary" id="c360-find">Найти</button></div>'+
  '<div id="c360-selected" style="margin-top:12px;font-size:12px"></div>'+
  (canLink()?'<label style="display:block;margin:9px 0;font-size:12px">Название единого юрлица <input id="c360-legal" class="form-input" placeholder="Например, ИТ технологии"></label><button id="c360-group" class="btn-primary">Связать выбранные карточки (без удаления)</button>':'<p>Создание связей доступно ДФС и директору Витебска.</p>')+
  '</div><div id="c360-requests" class="card" style="margin-bottom:10px">Заявки на новые торговые точки…</div><div id="c360-output" class="card">Введите название клиента и нажмите «Найти».</div>'+
  '<div id="c360-groups" class="card" style="margin-top:10px"></div><div id="c360-detail" class="card" style="margin-top:10px;display:none"></div>';
  main.appendChild(page);
  page.querySelector('#c360-find').onclick=load;
  page.querySelector('#c360-search').addEventListener('keydown',e=>{if(e.key==='Enter')load()});
  page.querySelector('#c360-group')?.addEventListener('click',group);
 }
 nav.style.display=role()?'flex':'none';
}
async function load(){
 if(!role()||busy)return;
 mount();const out=page.querySelector('#c360-output');busy=true;out.textContent='Загружаю реестр…';
 try{
  const q=page.querySelector('#c360-search').value.trim();
  const {data,error}=await db.rpc('client360_catalog_v1',{p_query:q});
  if(error||!data?.ok)throw error||new Error('Сервер не вернул список');
  items=data.clients||[];groups=data.entities||[];
  const rq=await db.rpc('client360_review_requests_v1');
  if(rq.error)throw rq.error;
  requests=rq.data?.requests||[];
  render();
 }catch(e){out.textContent='Не удалось загрузить: '+(e?.message||e)}
 finally{busy=false}
}
function render(){
 const out=page.querySelector('#c360-output'),legal=page.querySelector('#c360-legal');
 // Do not silently prefill the first search hit: it caused an unrelated legal entity to be reused.
 if(legal)legal.placeholder='Введите проверенное название юрлица вручную';
 out.innerHTML='<div style="font-size:12px;color:var(--sub);margin-bottom:7px">Карточек в выборке: '+items.length+' · Отмечайте только тех, у кого подтверждено общее юрлицо</div>'+
 (items.length?'<div style="max-height:460px;overflow:auto">'+items.map(c=>
  '<label style="display:flex;align-items:start;gap:9px;padding:8px;border-bottom:1px solid var(--border)">'+
  (canLink()?'<input type="checkbox" data-c360-id="'+esc(c.id)+'" '+(checked.has(c.id)?'checked':'')+'>':'')+
  '<div><b>'+esc(c.name)+'</b> · '+esc(c.city||'')+', '+esc(c.address||'')+
  '<div style="font-size:11px;color:var(--sub)">МПП: '+esc(c.manager_name||'—')+
  (c.legal_name?' · Юрлицо: '+esc(c.legal_name):' · Пока не связано')+
  (c.code&&c.code.trim()?' · Код: '+esc(c.code):'')+'</div></div></label>'
 ).join('')+'</div>':'<p>Не найдено карточек. Уточните поиск.</p>');
 out.querySelectorAll('[data-c360-id]').forEach(x=>x.onchange=()=>{
  if(x.checked)checked.add(x.dataset.c360Id);else checked.delete(x.dataset.c360Id);renderSelected();
 });
 const requestBox=page.querySelector('#c360-requests');
 requestBox.innerHTML='<b>📍 Заявки на новые торговые точки: '+requests.length+'</b>'+
 (requests.length?requests.map(r=>
   '<div style="padding:9px;margin-top:6px;border-top:1px solid var(--border)"><b>'+esc(r.client_name)+'</b> · '+
   esc(r.city)+', '+esc(r.address)+' · МПП: '+esc(r.manager_name)+
   (canLink()?'<div style="display:flex;gap:7px;margin-top:7px"><button class="btn-primary" data-c360-approve="'+esc(r.id)+'">✅ Подтвердить адрес</button>'+
   '<button class="btn-secondary" data-c360-reject="'+esc(r.id)+'">Отклонить</button></div>':'')+
   '</div>').join(''):'<p style="font-size:12px">Нет заявок на проверку.</p>');
 requestBox.querySelectorAll('[data-c360-approve]').forEach(b=>b.onclick=()=>reviewPoint(b.dataset.c360Approve,true));
 requestBox.querySelectorAll('[data-c360-reject]').forEach(b=>b.onclick=()=>reviewPoint(b.dataset.c360Reject,false));
 const gs=page.querySelector('#c360-groups');
 gs.innerHTML='<b>Зарегистрированные группы юрлиц</b><div style="font-size:12px;color:var(--sub);margin-top:7px">'+
 (groups.length?groups.map(g=>'<div style="padding:4px"><button class="btn-secondary" data-c360-group="'+esc(g.id)+'">🏢 '+esc(g.name)+' · показать ТТ и визиты / редактировать</button></div>').join(''):'Пока нет подтверждённых групп')+'</div>';
 gs.querySelectorAll('[data-c360-group]').forEach(b=>b.onclick=()=>openGroup(b.dataset.c360Group));
 renderSelected();
}
function renderSelected(){
 if(!page)return;
 const v=page.querySelector('#c360-selected');
 v.textContent='Отмечено карточек: '+checked.size+'. Данные не удаляются и не переименовываются.';
}
async function group(){
 if(!canLink())return;
 const name=page.querySelector('#c360-legal').value.trim();
 if(checked.size<2){alert('Отметьте как минимум две карточки одного юрлица.');return}
 if(name.length<3){alert('Укажите подтверждённое название юрлица.');return}
 const button=page.querySelector('#c360-group');button.disabled=true;
 try{
  const {data,error}=await db.rpc('client360_group_clients_v1',{p_name:name,p_client_ids:[...checked]});
  if(error||!data?.ok)throw error||new Error('Связь не сохранена');
  checked.clear();page.querySelector('#c360-legal').value='';alert('✅ Связано '+data.linked_cards+' карточек под юрлицом «'+name+'». История и адреса сохранены.');
  await load();
 }catch(e){alert('Не удалось связать карточки: '+(e?.message||e))}
 finally{button.disabled=false}
}
async function reviewPoint(requestId,approve){
 if(!canLink())return;
 try{
   const {data,error}=await db.rpc('client360_approve_store_v1',{p_request_id:requestId,p_approve:approve,p_comment:approve?'Подтверждён адрес; GPS требует выверения':'Адрес не подтверждён'});
   if(error||!data?.ok)throw error||new Error('Нет подтверждения');
   await load();
 }catch(e){alert('Ошибка проверки ТТ: '+(e?.message||e))}
}
async function openGroup(entityId){
 const el=page?.querySelector('#c360-detail');if(!el)return;
 el.style.display='block';el.textContent='Загружаю торговые точки…';
 try{
  const {data,error}=await db.rpc('client360_entity_overview_v1',{p_entity_id:entityId});
  if(error||!data?.ok)throw error||new Error('Обзор недоступен');
  el.innerHTML='<b>🏢 '+esc(data.name)+'</b> · '+(data.clients||[]).length+' карточек'+
  (canLink()?'<div style="margin:8px 0"><button class="btn-secondary" data-c360-rename="'+esc(entityId)+'">✏️ Изменить название юрлица</button></div>':'')+
  '<p style="font-size:12px;color:var(--sub)">Группа объединяет карточки для анализа, а продажи, визиты и GPS остаются на исходных ID.</p>'+
  (data.clients||[]).map(c=>'<div style="padding:10px;border-top:1px solid var(--border)"><b>'+esc(c.name)+'</b>'+
  '<div style="font-size:12px">МПП: '+esc(c.manager_name||'—')+' · Визиты: '+esc(c.visits)+
  ' · Последний: '+esc(c.last_visit||'нет')+'</div>'+ 
  (canLink()?'<button class="btn-secondary" style="margin:5px 0" data-c360-unlink="'+esc(c.id)+'" data-c360-entity="'+esc(entityId)+'">Разорвать неверную связь юрлица</button>':'')+
  (c.stores||[]).map(p=>'<div style="font-size:12px;padding:4px 0">📍 '+
  esc(p.city||'')+', '+esc(p.address||'')+' · '+(p.lat==null||p.lng==null?'⚠️ нет координат':'📡 предварительные координаты')+
  (canLink()?'<button class="btn-secondary" data-c360-edit-point="'+esc(p.id)+'" data-city="'+esc(p.city||'')+'" data-address="'+esc(p.address||'')+'" style="margin-left:7px">✏️ Изменить ТТ</button>':'')+'</div>').join('')+
  '</div>').join('');
  el.querySelectorAll('[data-c360-rename]').forEach(b=>b.onclick=()=>editEntity(entityId,data.name));
  el.querySelectorAll('[data-c360-unlink]').forEach(b=>b.onclick=()=>unlinkClient(entityId,b.dataset.c360Unlink,data.name));
  el.querySelectorAll('[data-c360-edit-point]').forEach(b=>b.onclick=()=>editStore(b.dataset.c360EditPoint,b.dataset.city,b.dataset.address,entityId));
  el.scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){el.textContent='Ошибка: '+(e?.message||e)}
}
async function editEntity(id,currentName){
 if(!canLink())return;
 const name=prompt('Название юрлица в Клиент 360° (не изменяет 1С):',currentName);
 if(name===null||name.trim()===currentName)return;
 if(!confirm('Изменить название группы на «'+name.trim()+'»? Исходные карточки 1С останутся без изменений.'))return;
 try{
  const {data,error}=await db.rpc('client360_manage_entity_v2',{p_entity_id:id,p_name:name.trim(),p_unlink_client_ids:[]});
  if(error||!data?.ok)throw error||new Error('Изменение не сохранено');
  await load();await openGroup(id);root.dispatchEvent(new Event('resanta-client360-updated'));
 }catch(e){alert('Не удалось изменить юрлицо: '+(e.message||e))}
}
async function unlinkClient(entityId,clientId,entityName){
 if(!canLink())return;
 if(!confirm('Разорвать связь этой карточки с юрлицом «'+entityName+'»? Визиты, продажи и GPS останутся прежними.'))return;
 try{
  const {data,error}=await db.rpc('client360_manage_entity_v2',{p_entity_id:entityId,p_name:entityName,p_unlink_client_ids:[clientId]});
  if(error||!data?.ok||data.unlinked!==1)throw error||new Error('Связь не изменена');
  await load();await openGroup(entityId);root.dispatchEvent(new Event('resanta-client360-updated'));
 }catch(e){alert('Не удалось разорвать связь: '+(e.message||e))}
}
async function editStore(pointId,oldCity,oldAddress,entityId){
 if(!canLink())return;
 const city=prompt('Город торговой точки:',oldCity);if(city===null)return;
 const address=prompt('Адрес торговой точки:',oldAddress);if(address===null)return;
 if(city.trim()===oldCity&&address.trim()===oldAddress)return;
 if(!confirm('Изменить адрес торговой точки? GPS-координаты и исторические маршруты не меняются. Новый адрес потребует проверки геокодирования.'))return;
 try{
  const {data,error}=await db.rpc('client360_update_store_v2',{p_point_id:pointId,p_city:city.trim(),p_address:address.trim()});
  if(error||!data?.ok)throw error||new Error('Не сохранено');
  await openGroup(entityId);root.dispatchEvent(new Event('resanta-client360-updated'));
 }catch(e){alert('Не удалось изменить адрес: '+(e.message||e))}
}
function open(){if(!role())return;mount();if(typeof goPage==='function')goPage('client360','Клиент 360°');load()}
function reconcile(){if(role())mount();else if(nav)nav.style.display='none'}
reconcile();root.setInterval(reconcile,5000);
root.crmClient360V1={open,load};
})(window);
