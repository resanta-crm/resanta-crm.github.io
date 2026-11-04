/* Triovist Tasks 360 · presentation only · existing task approvals and payroll untouched. */
(function(w){
'use strict';
if(w.RESANTA_TRIOVIST_TASKS360_V1)return;
const ID='tri-tasks360-style';
const root=()=>document.getElementById('tri-month-safe-v23651');
const active=()=>document.getElementById('page-triovist')?.classList.contains('active')&&document.querySelector('#tr14-shell [data-tr14="tasks"]')?.classList.contains('on');
const user=()=>{try{return typeof currentProfile!=='undefined'?currentProfile||{}:w.currentProfile||{}}catch(_){return w.currentProfile||{}}};
const manager=()=>user().role==='manager'&&user().access_scope==='triovist';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function css(){
 if(document.getElementById(ID))return;
 const s=document.createElement('style');s.id=ID;s.textContent=[
 '#page-triovist[data-triovist-view="tasks"] .tm360-view{color:#183252}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-strip{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin:12px 0}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-item{min-width:0;background:linear-gradient(120deg,#f5faff,#fff);border:1px solid #dbe6f3;padding:12px;border-radius:12px}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-item.warn{background:linear-gradient(120deg,#fff3ed,#fff)}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-item.good{background:linear-gradient(120deg,#ebf9ef,#fff)}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-item span{display:block;color:#53677f;font-size:11px;font-weight:700}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-item strong{font-size:clamp(17px,2vw,24px);font-weight:850;display:block;margin:5px 0}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-brief{border:1px solid #ddd8f9;background:linear-gradient(125deg,#f5f1ff,#fff);padding:12px 14px;border-radius:12px;margin:11px 0;font-size:12px;line-height:1.6}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-policy{margin:10px 0;background:#fff;border:1px solid #e1e8f0;border-radius:11px;overflow:hidden}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-policy summary{padding:10px 12px;cursor:pointer;font-weight:750;color:#175d9e;font-size:12px}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-policy>div{padding:0 10px 10px}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-policy .tm51-info{margin:6px 0!important}',
 '#page-triovist[data-triovist-view="tasks"] #tri-month-safe-v23651 .tm51-task{border:1px solid #dfe7ef;background:#fff;box-shadow:0 2px 8px #193c670b;border-radius:12px}',
 '#page-triovist[data-triovist-view="tasks"] #tri-month-safe-v23651 .tm51-title{font-size:14px}',
 '@media(max-width:1050px){#page-triovist[data-triovist-view="tasks"] .tm360-strip{grid-template-columns:repeat(3,minmax(0,1fr))}}',
 '@media(max-width:620px){#page-triovist[data-triovist-view="tasks"] .tm360-strip{grid-template-columns:repeat(2,minmax(0,1fr))}}'
 ].join('\n');document.head.appendChild(s);
}
const stat=(label,n,cl='')=>'<div class="tm360-item '+cl+'"><span>'+esc(label)+'</span><strong>'+Number(n).toLocaleString('ru-RU')+'</strong></div>';
function enhance(){
 if(!active())return false;
 const r=root();if(!r||!r.querySelector('.tm51-top'))return false;
 css();const tasks=[...r.querySelectorAll('.tm51-task')].filter(x=>x.dataset.excluded!=='1');
 const count=k=>tasks.filter(x=>x.dataset.status===k).length;
 const working=['accepted','in_progress','waiting_21vek','partial'].reduce((s,k)=>s+count(k),0);
 const checking=['pending_approval','awaiting_check','submitted'].reduce((s,k)=>s+count(k),0);
 const late=count('overdue'),done=count('verified');
 let head=r.querySelector('.tm360-view');
 if(!head){head=document.createElement('div');head.className='tm360-view';r.querySelector('.tm51-top').insertAdjacentElement('afterend',head)}
 head.innerHTML='<div class="tm360-strip">'+stat('Рабочие задачи',tasks.length)+stat('В работе',working)+stat('На проверке',checking)+stat('Просрочено',late,'warn')+stat('Подтверждено',done,'good')+'</div>'+
 '<div class="tm360-brief"><b>✨ Короткий брифинг</b><div>'+(manager()?
 'Ваших рабочих задач: '+tasks.length+'. В работе: '+working+', ожидают проверки: '+checking+'. Откройте нужную задачу и выполните действие по её статусу.':
 'Всего рабочих задач: '+tasks.length+'. Ожидают проверки: '+checking+', просрочено: '+late+'. Ниже доступна детализация по менеджерам.')+
 '</div><small style="color:#65758c">Существующая логика ИИ, задания, согласование и премии не изменены.</small></div>';
 if(!r.querySelector('.tm360-policy')){
  const infos=[...r.children].filter(x=>x.classList?.contains('tm51-info')&&!x.querySelector('button'));
  const score=[...r.children].filter(x=>x.classList?.contains('tm51-grid'));
  if(infos.length||score.length){
   const details=document.createElement('details');details.className='tm360-policy';
   const summary=document.createElement('summary');summary.textContent='Инструкции, зарплатный KPI и полные показатели';details.appendChild(summary);
   const contents=document.createElement('div');details.appendChild(contents);
   for(const n of [...infos,...score])contents.appendChild(n);
   const filters=r.querySelector('.tm51-filters');
   if(filters)r.insertBefore(details,filters);else r.appendChild(details);
  }
 }
 return true;
}
w.RESANTA_TRIOVIST_TASKS360_V1=Object.freeze({version:'20261104.2',enhance,readOnly:true,parserUntouched:true,competitorsUntouched:true});
})(window);