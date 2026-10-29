/* Isolated LPR screen: birth day/month only. No polling of user data. */
(function(root){
'use strict';
if(root.crmLprV1)return;
const ENDPOINT='crm-lpr-birthdays-v1';
const IDS=['544fb1e2-ef70-44de-bc62-e0e1596a4bfc','ba55dfe5-7e48-4f1f-b40e-674c7752fe1a'];
const M=['Руднев','Ачинович','Шкуран'];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let nav=null,page=null,info=null,editId=null,loading=false;
function role(){
 try{
  const p=currentProfile,u=currentUser;
  if(!u?.id||document.getElementById('app')?.style.display==='none')return null;
  if(p?.role==='manager'&&p.region==='Витебск'&&M.includes(p.name))return 'manager';
  if(p?.role==='boss'&&p.region==='Витебск'&&IDS.includes(u.id))return 'director';
 }catch{}return null;
}
function mount(){
 const main=document.getElementById('main-content'),link=document.getElementById('nav-clients');
 if(!main||!link)return;
 if(!nav){
  nav=document.createElement('button');nav.className='nav-item';nav.id='nav-lpr-birthdays';
  nav.textContent='🎂 ЛПР и дни рождения';nav.addEventListener('click',open);
  link.parentNode?.insertBefore(nav,link.nextSibling);
 }
 if(!page){
  page=document.createElement('div');page.className='page';page.id='page-lpr-birthdays';
  page.innerHTML='<div class="page-title">🎂 ЛПР и дни рождения</div><div id="lpr-view-v1"></div>';
  main.appendChild(page);
 }
 nav.style.display=role()?'':'none';
}
async function request(body){
 if(!role())throw Error('Нет доступа');
 const sess=await db.auth.getSession();if(!sess.data?.session?.access_token)throw Error('Требуется вход в CRM');
 const {data,error}=await db.functions.invoke(ENDPOINT,{body});
 if(error||data?.error)throw Error(data?.error||'Сервис ЛПР недоступен');
 return data;
}
async function reload(){
 if(loading||!role())return;loading=true;
 const v=page?.querySelector('#lpr-view-v1');if(v)v.textContent='Загружаю ЛПР…';
 try{const x=await request({action:'list'});
  if(x.mode!=='lpr_v1'||x.scope!==role())throw Error('Данные не подтверждены');
  info=x;render();
 }catch(e){if(v)v.textContent='Не удалось загрузить ЛПР: '+String(e.message||e);}
 finally{loading=false;}
}
async function open(){
 if(!role())return;mount();
 if(typeof root.goPage==='function')root.goPage('lpr-birthdays','ЛПР и дни рождения');
 else{document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));page.classList.add('active');}
 await reload();
}
function read(id){return page?.querySelector('#lpr-'+id)?.value||'';}
function field(label,id,value='',type='text'){
 return '<label style="display:block;font-size:12px">'+label+
 '<input class="form-input" id="lpr-'+id+'" type="'+type+'" value="'+esc(value)+'"></label>';
}
function render(){
 const v=page?.querySelector('#lpr-view-v1');if(!v||!info)return;
 const clients=info.clients||[],contacts=info.contacts||[],upcoming=info.upcoming||[],canWrite=role()==='manager';
 const fmt=d=>d.days_until===0?'Сегодня':d.days_until===1?'Завтра':'Через '+d.days_until+' дн.';
 v.innerHTML='<div class="card"><b>📅 Брифинг: ближайшие 14 дней</b>'+
 '<p>ЛПР: '+contacts.length+' · Скоро дни рождения: '+upcoming.length+
 ' · Клиентов без ЛПР: '+info.missing_clients+'</p>'+
 (upcoming.length?upcoming.slice(0,40).map(c=>'<div style="padding:5px 0">'+esc(fmt(c))+
 ' — <b>'+esc(c.full_name)+'</b>, '+esc(c.client_name)+
 (c.is_vip?' 💎 ВИП':'')+(role()==='director'?' · '+esc(c.manager_name):'')+'</div>').join(''):
 '<p>В ближайшие 14 дней известных дат нет.</p>')+
 '<p style="font-size:11px;color:var(--sub)">Напоминания в Telegram для ВИП: за 3 дня и в день рождения, только при подключённом аккаунте.</p>'+
 '<button class="btn-secondary" id="lpr-link-telegram">Подключить Telegram</button></div>'+
 (canWrite?'<div class="card" style="margin-top:10px"><b>Добавить / изменить ЛПР</b>'+
 '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px;margin:10px 0">'+
 '<label>Клиент<select id="lpr-client" class="form-input"><option value="">Выбрать…</option>'+
 clients.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+(c.is_vip?' 💎':'')+'</option>').join('')+'</select></label>'+
 field('ФИО','name')+field('Должность','position')+
 field('День','day','','number')+field('Месяц','month','','number')+
 '</div><button class="btn-primary" id="lpr-save">Сохранить</button> '+
 '<button class="btn-secondary" id="lpr-new">Новый ЛПР</button>'+
 '<p style="font-size:11px;color:var(--sub)">Можно добавить нескольких ЛПР одного клиента. Год рождения не требуется.</p></div>':'')+
 '<div class="card" style="margin-top:10px"><b>'+(canWrite?'ЛПР моих клиентов':'ЛПР ВИП-клиентов')+'</b>'+
 '<div style="max-height:380px;overflow:auto"><table class="tbl"><thead><tr><th>Клиент</th><th>ФИО</th><th>Должность</th><th>ДР</th><th></th></tr></thead><tbody>'+
 (contacts.length?contacts.map(c=>'<tr><td>'+esc(clients.find(x=>x.id===c.client_id)?.name||'')+
 '</td><td>'+esc(c.full_name)+'</td><td>'+esc(c.position_title)+'</td><td>'+
 String(c.birth_day).padStart(2,'0')+'.'+String(c.birth_month).padStart(2,'0')+'</td><td>'+
 (canWrite?'<button class="btn-secondary" data-lpr-edit="'+esc(c.id)+'">Изменить</button>':'')+
 '</td></tr>').join(''):'<tr><td colspan="5">ЛПР пока не заполнены</td></tr>')+
 '</tbody></table></div></div>';
 v.querySelector('#lpr-save')?.addEventListener('click',save);
 v.querySelector('#lpr-new')?.addEventListener('click',()=>{editId=null;render();});
 v.querySelector('#lpr-link-telegram')?.addEventListener('click',linkTelegram);
 v.querySelectorAll('[data-lpr-edit]').forEach(b=>b.addEventListener('click',()=>{
  const c=contacts.find(x=>x.id===b.dataset.lprEdit);if(!c)return;editId=c.id;
  for(const [id,val] of [['client',c.client_id],['name',c.full_name],['position',c.position_title],
    ['day',c.birth_day],['month',c.birth_month]]){const node=v.querySelector('#lpr-'+id);if(node)node.value=val;}
 }));
}
async function save(){
 if(role()!=='manager')return;
 const body={action:'save',id:editId||undefined,client_id:read('client'),
  full_name:read('name'),position_title:read('position'),birth_day:Number(read('day')),
  birth_month:Number(read('month'))};
 try{await request(body);editId=null;await reload();}
 catch(e){root.alert('ЛПР: '+String(e.message||e));}
}
async function linkTelegram(){
 try{
  const x=await db.rpc('crm_telegram_binding_status');
  if(x.data?.connected){root.alert('Telegram уже подключён.');return;}
  const c=await db.rpc('crm_create_telegram_link_code');
  if(c.error||!c.data)throw Error('Не удалось получить код');
  const url='https://t.me/ResantaCRMActionsBot?start='+encodeURIComponent(c.data);
  if(!root.open(url,'_blank'))root.location.href=url;
 }catch(e){root.alert('Telegram: '+String(e.message||e));}
}
function voice(question,ui){
 if(!role()||!/день рожден|дни рожден|именинник|поздрав|лпр/.test(String(question||'').toLowerCase()))return false;
 void (async()=>{
  try{const x=await request({action:'brief'});
   if(!role()||x.scope!==role())return;
   const a=(x.upcoming||[]).slice(0,7).map(v=>
    (v.days_until===0?'Сегодня':v.days_until===1?'Завтра':'Через '+v.days_until+' дня')+
    ' день рождения у '+v.full_name+', клиент '+v.client_name+(v.is_vip?', ВИП':'')+'.');
   ui?.answer?.('Брифинг ЛПР. '+(a.length?a.join(' '):'На ближайшие две недели записанных дней рождения нет.')+
    ' Без ЛПР осталось '+x.missing_clients+' клиентов. Подробности в разделе «ЛПР и дни рождения».');
  }catch{ui?.answer?.('Не могу подтвердить даты рождения через CRM. Открой раздел ЛПР для проверки.');}
 })();
 return true;
}
function reconcile(){if(role())mount();else if(nav)nav.style.display='none';}
reconcile();root.setInterval(reconcile,5000);
root.crmLprV1={open,reload,voice,role};
})(window);