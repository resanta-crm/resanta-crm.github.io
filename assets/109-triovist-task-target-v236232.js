/* RESANTA CRM v23.6.232 · Triovist task target editor + listing badges */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_TASK_TARGET_EDITOR_V236232)return;
const V='v23.6.232';
const LEADERS=['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru'];
const profile=()=>{try{return window.currentProfile||currentProfile}catch(_){return window.currentProfile}};
const email=()=>String(profile()?.email||'').trim().toLowerCase();
const isLeader=()=>String(profile()?.role||'').toLowerCase()==='boss'&&LEADERS.includes(email());
const dbx=()=>{try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}};
async function rpc(name,args){const d=dbx();if(!d?.rpc)throw new Error('Соединение с базой ещё не готово');const r=await d.rpc(name,args);if(r.error)throw r.error;return r.data}
function parseTarget(card){
 const t=String(card?.querySelector('.tm51-result')?.textContent||'');
 const m=t.match(/цельs+([ds.,]+)s*BYN/i);
 if(!m)return '';
 return m[1].replace(/s/g,'').replace(',','.');
}
function decorate(){
 const root=document.getElementById('tri-month-safe-v23651');if(!root)return;
 root.querySelectorAll('.tm51-task').forEach(card=>{
  const title=String(card.querySelector('.tm51-title')?.textContent||'');
  if(/листингs*↑/i.test(title)&&!card.querySelector('[data-v232-listing-badge]')){
    const pills=card.querySelector('.tm51-pills');
    if(pills){
      const s=document.createElement('span');s.className='tm51-pill';s.dataset.v232ListingBadge='1';
      s.style.cssText='background:#dcfce7;color:#166534';
      s.textContent='📈 Поднять листинг';
      pills.appendChild(s);
    }
  }
  const pill=[...card.querySelectorAll('.tm51-pill')].find(x=>String(x.textContent||'').trim()==='Бензиновые');
  if(pill)pill.textContent='Бензиновые генераторы';
  if(!isLeader()||card.dataset.status!=='pending_approval'||card.querySelector('[data-v232-edit-target]'))return;
  const id=card.querySelector('[data-task-id]')?.dataset?.taskId;if(!id)return;
  const actions=card.querySelector('.tm51-actions');if(!actions)return;
  const b=document.createElement('button');b.type='button';b.dataset.v232EditTarget=id;
  b.textContent='✏️ Изменить план BYN';b.title='Изменить денежную цель до согласования задачи';
  actions.insertBefore(b,actions.firstChild);
 });
}
async function edit(card,id){
 const current=parseTarget(card);
 const raw=prompt('Новый план по подгруппе, BYN:',current||'');
 if(raw===null)return;
 const n=Number(String(raw).replace(/s/g,'').replace(',','.'));
 if(!Number.isFinite(n)||n<=0){alert('Введите сумму больше 0');return}
 if(!confirm('Установить план '+n.toLocaleString('ru-RU',{maximumFractionDigits:2})+' BYN?'))return;
 try{
   await rpc('triovist_tasks_action',{p_task_id:id,p_action:'edit',p_payload:{target_revenue:String(n)}});
   const api=window.RESANTA_TRIOVIST_TASK_MONTH_SAFE_V23651;
   if(api?.render)await api.render(true);else location.reload();
 }catch(e){alert('Не удалось изменить план: '+(e?.message||e))}
}
document.addEventListener('click',e=>{
 const b=e.target.closest?.('[data-v232-edit-target]');if(!b)return;
 e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
 edit(b.closest('.tm51-task'),b.dataset.v232EditTarget);
},true);
const obs=new MutationObserver(()=>decorate());
function boot(){decorate();const root=document.getElementById('page-triovist')||document.body;obs.observe(root,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.RESANTA_TRIOVIST_TASK_TARGET_EDITOR_V236232=Object.freeze({version:V,decorate});
})();