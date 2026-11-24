/* Triovist Tasks 360 · one native director screen.
 * Presentation-only layer. The monthly task engine, approvals, close, policy and payroll remain in 61.
 * Never makes API requests or writes data.
 */
(function(w){
'use strict';
if(w.RESANTA_TRIOVIST_TASKS360_V1)return;
const ID='tri-tasks360-style-v2',VERSION='2026.11.23.4-task-focus';
const root=()=>document.getElementById('tri-month-safe-v23651');
const active=()=>document.getElementById('page-triovist')?.classList.contains('active')&&
 document.querySelector('#tr14-shell [data-tr14="tasks"]')?.classList.contains('on');
const user=()=>{try{return typeof currentProfile!=='undefined'?currentProfile||{}:w.currentProfile||{}}catch(_){return w.currentProfile||{}}};
const isManager=()=>String(user().access_scope||'')==='triovist'&&String(user().role||'')==='manager';
const email=()=>String(user().email||'').trim().toLowerCase();
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const EMAILS=['aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru'];
const NAMES=['Александренко','Кришталь'];
const QUEUES=[
 ['total','Всего задач','Все задачи месяца, кроме отменённых и неактуальных.'],
 ['work','В работе','Новые, принятые, выполняемые и ожидающие ответа 21vek, срок которых ещё не истёк.']
];
const q=v=>Number(v).toLocaleString('ru-RU');
function css(){
 if(document.getElementById(ID))return;
 const s=document.createElement('style');s.id=ID;s.textContent=[
 '#page-triovist[data-triovist-view="tasks"] #tri-month-safe-v23651{background:var(--bg);border:1px solid var(--border);border-radius:13px;padding:15px}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-view{color:var(--text);margin:12px 0}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-strip{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:11px 0}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-item{position:relative;min-width:0;background:var(--card);border:1px solid var(--border);padding:13px;border-radius:12px}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-stat-label{display:flex;align-items:center;justify-content:space-between;gap:5px;color:var(--sub);font-size:13px}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-item strong{font-size:clamp(17px,2.1vw,25px);font-weight:850;display:block;margin:5px 0;color:var(--text)}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-count{display:block;width:100%;text-align:left;padding:0;border:0;background:none;cursor:pointer;border-radius:4px}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-count:hover strong{text-decoration:underline;color:var(--a)}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-help{display:inline-flex}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-help button{background:var(--card);border:1px solid var(--border);border-radius:7px;width:27px;height:27px;color:var(--a);font:inherit;font-weight:700;font-size:16px;cursor:pointer}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-tip{display:none;pointer-events:none;position:absolute;z-index:6;inset-block-start:37px;inset-inline-end:8px;width:calc(100% - 16px);padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);box-shadow:0 4px 14px #11182720;font-size:12px;line-height:1.4}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-help:is(:hover,:focus-within) .tm360-tip{display:block}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-detail{scroll-margin-top:70px}',
 '#page-triovist[data-triovist-view="tasks"] :is(button,summary,select,input):focus-visible{outline:2px solid var(--a);outline-offset:2px}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-actions button,#page-triovist[data-triovist-view="tasks"] .tm360-manager button{font-size:11px;border:1px solid var(--border);background:var(--card);color:var(--a);border-radius:8px;font-weight:750;padding:9px 11px;cursor:pointer}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-actions .primary{background:var(--a);color:#fff;border-color:var(--a)}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-manager{min-width:0;border:1px solid var(--border);border-radius:11px;background:var(--card);padding:12px}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-manager b{display:block;font-size:13px;color:var(--text)}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-manager p{font-size:11px;color:var(--sub);line-height:1.5;margin:7px 0}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-manager strong{font-size:20px;color:var(--a)}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-detail,#page-triovist[data-triovist-view="tasks"] .tm360-generator-rules{border:1px solid var(--border);background:var(--card);border-radius:11px;overflow:hidden;margin:10px 0}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-detail{overflow:visible}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-detail summary,#page-triovist[data-triovist-view="tasks"] .tm360-generator-rules summary{cursor:pointer;padding:11px 13px;font-size:11px;font-weight:800;color:var(--a)}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-detail>div,#page-triovist[data-triovist-view="tasks"] .tm360-generator-rules>div{padding:9px 12px 13px}',
 '#page-triovist[data-triovist-view="tasks"] #tri-task-generate-btn,#page-triovist[data-triovist-view="tasks"] #tri-task-plan-size-wrap,#page-triovist[data-triovist-view="tasks"] #tri-task-plan-period{display:none!important}',
 '#page-triovist[data-triovist-view="tasks"] #tri-month-safe-v23651 .tm51-task{border:1px solid var(--border);background:var(--card);border-radius:10px;padding:12px;margin:8px 0}',
 '#page-triovist[data-triovist-view="tasks"] #tri-month-safe-v23651 .tm51-title{font-size:13px}',
 '@media(max-width:690px){#page-triovist[data-triovist-view="tasks"] .tm360-grid{grid-template-columns:1fr}}'
 ].join('\n');document.head.appendChild(s);
}
const tally=(tasks,key)=>tasks.filter(t=>t.dataset.bucket===key).length;
function stat(key,label,n,sub){
 const tip='tm360-tip-'+key;
 return '<div class="tm360-item"><div class="tm360-stat-label">'+escapeHtml(label)+
 '<span class="tm360-help"><button type="button" aria-label="'+escapeHtml(label)+' — пояснение" aria-describedby="'+tip+'">*</button>'+
 '<span class="tm360-tip" id="'+tip+'" role="tooltip">'+escapeHtml(sub)+'</span></span></div>'+
 '<button type="button" class="tm360-count" data-tm360-filter="'+key+'" aria-label="'+escapeHtml(label)+' · '+q(n)+' · открыть список"><strong>'+q(n)+'</strong></button></div>';
}
function managerSummary(tasks,who,name){
 const mine=tasks.filter(t=>String(t.dataset.manager||'').toLowerCase()===who),total=mine.length;
 const done=mine.filter(t=>t.dataset.status==='verified').length;
 return '<div class="tm360-manager"><b>'+escapeHtml(name)+'</b><p><strong>'+q(total)+'</strong> рабочих задач · подтверждено '+q(done)+'</p>'+
 (isManager()?'':'<button type="button" data-tm360-filter="total" data-tm360-owner="'+escapeHtml(who)+'">Показать задачи менеджера</button>')+'</div>';
}
function disableLegacyGenerator(){
 const button=document.getElementById('tri-task-generate-btn');
 if(button)button.disabled=true;
}
function enhance(){
 if(!active())return false;
 const r=root();if(!r||!r.querySelector('.tm51-top'))return false;
 css();
 // The original month module already enforces per-manager scope; defensively filter display again.
 const own=isManager()?email():null;
 const tasks=[...r.querySelectorAll('.tm51-task')].filter(t=>t.dataset.excluded!=='1'&&(!own||String(t.dataset.manager||'').toLowerCase()===own));
 let head=r.querySelector('.tm360-view');
 if(!head){head=document.createElement('section');head.className='tm360-view';r.querySelector('.tm51-top').insertAdjacentElement('afterend',head)}
 const kpis='<div class="tm360-strip">'+QUEUES.map(([key,label,help])=>stat(key,label,key==='total'?tasks.length:tally(tasks,key),help)).join('')+'</div>';
 const managerView=(isManager()?EMAILS.filter(v=>v===own):EMAILS).map(mail=>managerSummary(tasks,mail,NAMES[EMAILS.indexOf(mail)])).join('');
 const actions='<div class="tm360-actions"><button type="button" data-tm360-expand>Открыть рабочие задачи</button></div>';
 head.innerHTML=kpis+actions+'<div class="tm360-grid">'+managerView+'</div>';
 // Move the existing actionable task cards, preserving their buttons and delegated events.
 let details=r.querySelector('.tm360-detail');
 if(!details){details=document.createElement('details');details.className='tm360-detail';
  const title=document.createElement('summary');title.textContent='Задачи и результаты';details.appendChild(title);
  const body=document.createElement('div');details.appendChild(body);
  r.appendChild(details);
 }
 const body=details.querySelector('div');
 const filters=r.querySelector('.tm51-filters');
 if(filters&&filters.parentElement!==body)body.appendChild(filters);
 for(const t of [...r.querySelectorAll('.tm51-task')]){
  // Defense in depth: do not display a different manager's task if a provider over-returns.
  if(own&&String(t.dataset.manager||'').toLowerCase()!==own)t.remove();
  else if(t.parentElement!==body)body.appendChild(t);
 }
 const empty=r.querySelector('#tm51-no-matches');
 if(empty&&empty.parentElement!==body)body.appendChild(empty);
 disableLegacyGenerator();
 if(r.dataset.tm360Bound!=='1'){
  r.dataset.tm360Bound='1';
  r.addEventListener('click',event=>{
   const jump=event.target.closest?.('[data-tm360-jump]');
   if(jump)return;
   const show=event.target.closest?.('[data-tm360-expand]');
   if(show){openWorkList(r);return}
   const queue=event.target.closest?.('[data-tm360-filter]');
   if(queue){
    const manager=r.querySelector('#tm51-manager'),status=r.querySelector('#tm51-status'),search=r.querySelector('#tm51-search');
    if(manager)manager.value=queue.dataset.tm360Owner||'all';
    if(search)search.value='';
    if(status){
     status.value=queue.dataset.tm360Filter==='total'?'work':'bucket:'+queue.dataset.tm360Filter;
     status.dispatchEvent(new Event('change',{bubbles:true}));
    }
    openWorkList(r);
   }
  });
 }
 return true;
}
function openWorkList(r){
 const list=r.querySelector('.tm360-detail');
 if(!list)return;
 list.open=true;
 list.querySelector('summary')?.focus?.({preventScroll:true});
 list.scrollIntoView?.({block:'start',behavior:'smooth'});
}
w.RESANTA_TRIOVIST_TASKS360_V1=Object.freeze({version:VERSION,enhance,readOnly:true,parserUntouched:true,competitorsUntouched:true,noDuplicateOverlay:true});
})(window);
