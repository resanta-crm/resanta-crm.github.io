/* CONNECT #136: native CRM permissions dialog. Server RPC is the authority.
   Only the authorized CRM director can read/save all employee permissions. */
(function(){
 'use strict';
 if(window.crmConnectAccess136)return;
 const $=id=>document.getElementById(id);
 const state={};let started=false,lastUid=null,checking=false;
 const create=(tag,cls,content)=>{
  const e=document.createElement(tag);if(cls)e.className=cls;
  if(content!==undefined)e.textContent=String(content??'');return e;
 };
 const message=(text,bad=false)=>{
  const status=$('c136-status');if(status){status.textContent=text;status.classList.toggle('error',bad);}
 };
 const actor=()=>state.profile?.();
 function setNav(allowed){
  for(const id of ['nav-connect','bn-connect']){
   const n=$(id);if(!n)continue;
   if(!allowed)n.style.setProperty('display','none','important');
   else n.style.removeProperty('display');
  }
 }
 async function refreshForUser(){
  const user=actor();
  if(!user?.id||!state.client?.()){lastUid=null;return;}
  if(checking)return;checking=true;
  try{
   const profileId=user.id;
   const result=await state.client().from('connect_permissions_v1')
    .select('chat_enabled,video_enabled').eq('user_id',profileId).maybeSingle();
   if(result.error)throw result.error;
   if(actor()?.id!==profileId)return;
   lastUid=profileId;
   setNav(!!result.data?.chat_enabled);
   const button=$('c136-open');
   if(button)button.hidden=!(user.role==='boss'&&user.name==='Александр Паюшин');
  }catch(e){
   console.warn('CONNECT rights: '+String(e?.message||e));
   setNav(false);
  }finally{checking=false;}
 }
 function rowFor(record){
  const row=create('div','c136-row');
  const person=create('div','c136-person');
  person.append(create('strong','',record.name),create('small','',record.role||'Сотрудник'));
  const ch=create('input');ch.type='checkbox';ch.checked=!!record.chat_enabled;
  ch.setAttribute('aria-label','Чаты: '+record.name);
  const vi=create('input');vi.type='checkbox';vi.checked=!!record.video_enabled;
  vi.disabled=!ch.checked;vi.setAttribute('aria-label','Видеозвонки: '+record.name);
  ch.addEventListener('change',()=>{if(!ch.checked)vi.checked=false;vi.disabled=!ch.checked;});
  const save=create('button','c126-btn','Сохранить');save.type='button';
  save.addEventListener('click',async()=>{
   save.disabled=true;message('Сохраняем права '+record.name+'…');
   try{
    const result=await state.client().rpc('connect_set_permission_v1',{
     p_user_id:record.user_id,
     p_chat_enabled:!!ch.checked,
     p_video_enabled:!!vi.checked
    });
    if(result.error)throw result.error;
    message('Права «'+record.name+'» сохранены на сервере.');
    // Restore the live state after a successful update, no screen-only grants.
    record.chat_enabled=!!ch.checked;record.video_enabled=!!vi.checked;
    await refreshForUser();
   }catch(e){
    ch.checked=!!record.chat_enabled;vi.checked=!!record.video_enabled;vi.disabled=!ch.checked;
    message('Не удалось изменить права: '+String(e?.message||e),true);
   }finally{save.disabled=false;}
  });
  row.append(person,ch,vi,save);return row;
 }
 async function open(){
  if(!actor()?.id)return;
  const overlay=$('c136-overlay');if(!overlay)return;
  overlay.hidden=false;message('Загружаем права сотрудников…');
  const host=$('c136-rows');host.replaceChildren();
  try{
   const response=await state.client().rpc('connect_admin_permissions_v1');
   if(response.error)throw response.error;
   for(const person of response.data||[])host.append(rowFor(person));
   message('Доступ управляется сервером. Видео можно разрешить только при включённых чатах.');
  }catch(e){
   message('Нет доступа к управлению: '+String(e?.message||e),true);
  }
 }
 function init(hooks){
  Object.assign(state,hooks);
  if(started)return;started=true;
  const top=$('page-connect')?.querySelector('.c126-top');
  if(!top)return;
  const button=create('button','c126-btn','⚙ Права CONNECT');
  button.type='button';button.id='c136-open';button.hidden=true;
  button.addEventListener('click',open);top.append(button);
  const overlay=create('div','c136-overlay');overlay.id='c136-overlay';overlay.hidden=true;
  const dialog=create('div','c136-dialog');
  dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
  dialog.setAttribute('aria-label','Права РЕСАНТА CONNECT');
  const head=create('div','c136-header');
  head.append(create('strong','','⚙ Управление доступом · CONNECT'));
  const close=create('button','c126-btn','✕ Закрыть');close.type='button';
  close.addEventListener('click',()=>{overlay.hidden=true;});head.append(close);
  dialog.append(head,create('p','','Выбирай отдельно права на переписку и видеосвязь. Изменения сохраняются по каждому сотруднику.'));
  const titles=create('div','c136-row c136-columns');
  titles.append(create('strong','','Сотрудник'),create('strong','','Чаты'),create('strong','','Видео'),create('strong','',''));
  dialog.append(titles);
  const rows=create('div','c136-rows');rows.id='c136-rows';dialog.append(rows);
  const status=create('div','c136-status','');status.id='c136-status';status.setAttribute('role','status');dialog.append(status);
  overlay.append(dialog);$('app').append(overlay);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!overlay.hidden)overlay.hidden=true;});
  // Refresh rights when the app is shown after authenticated login.
  const app=$('app');
  if(typeof MutationObserver!=='undefined'&&app){
   const watcher=new MutationObserver(()=>{
    if(app.style.display==='none'){lastUid=null;overlay.hidden=true;return;}
    const id=actor()?.id;
    if(id&&id!==lastUid)refreshForUser();
   });
   watcher.observe(app,{attributes:true,attributeFilter:['style']});
  }
  refreshForUser();
 }
 window.crmConnectAccess136={init,refreshForUser};
})();
