/* Triovist Tasks 360 · one native director screen.
 * Presentation-only layer. The monthly task engine, approvals, close, policy and payroll remain in 61.
 * Never makes API requests or writes data.
 */
(function(w){
'use strict';
if(w.RESANTA_TRIOVIST_TASKS360_V1)return;
const ID='tri-tasks360-style-v2',VERSION='2026.11.05.2-plan-paused';
const root=()=>document.getElementById('tri-month-safe-v23651');
const active=()=>document.getElementById('page-triovist')?.classList.contains('active')&&
 document.querySelector('#tr14-shell [data-tr14="tasks"]')?.classList.contains('on');
const user=()=>{try{return typeof currentProfile!=='undefined'?currentProfile||{}:w.currentProfile||{}}catch(_){return w.currentProfile||{}}};
const isManager=()=>String(user().access_scope||'')==='triovist'&&String(user().role||'')==='manager';
const email=()=>String(user().email||'').trim().toLowerCase();
const escapeHtml=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const EMAILS=['aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru'];
const NAMES=['Александренко','Кришталь'];
const WORK=new Set(['new','accepted','in_progress','waiting_21vek']);
const APPROVAL=new Set(['pending_approval']);
const CHECK=new Set(['awaiting_check','submitted']);
const LATE=new Set(['overdue']);
const CONFIRMED=new Set(['verified']);
const EXCLUDED=new Set(['cancelled','not_relevant']);
const q=v=>Number(v).toLocaleString('ru-RU');
const percent=(a,b)=>b?Math.max(0,Math.min(100,a/b*100)):0;
function css(){
 if(document.getElementById(ID))return;
 const s=document.createElement('style');s.id=ID;s.textContent=[
 '#page-triovist[data-triovist-view="tasks"] #tri-month-safe-v23651{background:#f8fafd;border:1px solid #d9e4f1;border-radius:13px;padding:15px}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-view{color:#243d59;margin:12px 0}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-strip{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin:11px 0}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-item{min-width:0;background:#fff;border:1px solid #dbe5f0;padding:13px;border-radius:12px}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-item.warn{border-color:#f1c5ad;background:#fffaf7}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-item span{display:block;font-size:10px;font-weight:750;color:#698099;min-height:26px}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-item strong{font-size:clamp(17px,2.1vw,25px);font-weight:850;display:block;margin:5px 0;color:#203e5d}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-item.warn strong{color:#b93240}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-item small{font-size:10px;color:#8795a7}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-brief{border:1px solid #cbdcf3;background:linear-gradient(115deg,#edf5ff,#fff);border-radius:12px;padding:14px;margin:11px 0}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-brief b{font-size:14px;color:#194c7c}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-brief p{font-size:12px;color:#4a617e;line-height:1.65;margin:7px 0 0}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-brief small{display:block;font-size:10px;color:#70849a;margin-top:8px}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-actions button,#page-triovist[data-triovist-view="tasks"] .tm360-manager button{font-size:11px;border:1px solid #accbee;background:#f2f8ff;color:#155b97;border-radius:8px;font-weight:750;padding:9px 11px;cursor:pointer}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-actions .primary{background:#1f6cac;color:#fff;border-color:#1f6cac}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-manager{min-width:0;border:1px solid #dbe5f0;border-radius:11px;background:white;padding:12px}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-manager b{display:block;font-size:13px;color:#21476e}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-manager p{font-size:11px;color:#536a83;line-height:1.5;margin:7px 0}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-manager strong{font-size:20px;color:#19639d}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-track{display:flex;overflow:hidden;border-radius:8px;height:10px;background:#e8eef6;margin:9px 0}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-track span{display:block;height:100%}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-legend{display:flex;gap:9px;flex-wrap:wrap;font-size:10px;color:#74859c}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-legend i{display:inline-block;width:8px;height:8px;border-radius:3px;margin-right:3px}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-policy,#page-triovist[data-triovist-view="tasks"] .tm360-detail,#page-triovist[data-triovist-view="tasks"] .tm360-generator-rules{border:1px solid #d4e3f3;background:#f2f7ff;border-radius:11px;overflow:hidden;margin:10px 0}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-policy summary,#page-triovist[data-triovist-view="tasks"] .tm360-detail summary,#page-triovist[data-triovist-view="tasks"] .tm360-generator-rules summary{cursor:pointer;padding:11px 13px;font-size:11px;font-weight:800;color:#185c96}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-policy>div,#page-triovist[data-triovist-view="tasks"] .tm360-detail>div,#page-triovist[data-triovist-view="tasks"] .tm360-generator-rules>div{padding:9px 12px 13px}',
 '#page-triovist[data-triovist-view="tasks"] #tri-task-card>.tri-task-note{display:none!important}',
 '#page-triovist[data-triovist-view="tasks"] #tri-task-generate-btn,#page-triovist[data-triovist-view="tasks"] #tri-task-plan-size-wrap,#page-triovist[data-triovist-view="tasks"] #tri-task-plan-period{display:none!important}',
 '#page-triovist[data-triovist-view="tasks"] #tri-task-card>.tri-task-head .tri-task-note{display:none!important}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-generator-pause{border:1px solid #bfd3e9;border-radius:10px;background:#f2f7ff;padding:11px;margin:9px 0;font-size:12px;line-height:1.55;color:#24527d}',
 '#page-triovist[data-triovist-view="tasks"] #tri-task-card>.tri-task-head{background:#f5faff;border:1px solid #cbdff3;border-radius:12px;padding:12px;margin-top:12px}',
 '#page-triovist[data-triovist-view="tasks"] #tri-month-safe-v23651 .tm51-task{border:1px solid #dfe8f1;background:#fff;border-radius:10px;padding:12px;margin:8px 0}',
 '#page-triovist[data-triovist-view="tasks"] #tri-month-safe-v23651 .tm51-title{font-size:13px}',
 '#page-triovist[data-triovist-view="tasks"] .tm360-optional{font-size:10px;color:#72859a;line-height:1.55}',
 '@media(max-width:1050px){#page-triovist[data-triovist-view="tasks"] .tm360-strip{grid-template-columns:repeat(3,minmax(0,1fr))}}',
 '@media(max-width:690px){#page-triovist[data-triovist-view="tasks"] .tm360-grid{grid-template-columns:1fr}#page-triovist[data-triovist-view="tasks"] .tm360-strip{grid-template-columns:repeat(2,minmax(0,1fr))}}'
 ].join('\n');document.head.appendChild(s);
}
const tally=(tasks,states)=>tasks.filter(t=>states.has(String(t.dataset.status||''))).length;
const stat=(label,n,sub,warning=false)=>'<div class="tm360-item'+(warning?' warn':'')+'"><span>'+escapeHtml(label)+'</span><strong>'+q(n)+'</strong><small>'+escapeHtml(sub)+'</small></div>';
function managerSummary(tasks,who,name){
 const mine=tasks.filter(t=>String(t.dataset.manager||'').toLowerCase()===who),total=mine.length,done=tally(mine,CONFIRMED);
 const work=tally(mine,WORK),checking=tally(mine,CHECK),late=tally(mine,LATE),approval=tally(mine,APPROVAL);
 return '<div class="tm360-manager"><b>'+escapeHtml(name)+'</b><p><strong>'+q(total)+'</strong> рабочих задач · подтверждено '+q(done)+'</p>'+
 '<div class="tm360-track"><span style="background:#178858;width:'+percent(done,total).toFixed(2)+'%"></span>'+
 '<span style="background:#3d86c7;width:'+percent(work,total).toFixed(2)+'%"></span>'+
 '<span style="background:#d89e47;width:'+percent(approval+checking,total).toFixed(2)+'%"></span>'+
 '<span style="background:#cc4854;width:'+percent(late,total).toFixed(2)+'%"></span></div>'+
 '<p>В работе: '+q(work)+' · на согласовании: '+q(approval)+' · на проверке: '+q(checking)+' · просрочено: '+q(late)+'</p>'+
 '<p class="tm360-optional">Доля подтверждённых задач: '+percent(done,total).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%. Это не зарплатный KPI.</p>'+
 (isManager()?'':'<button type="button" data-tm360-owner="'+escapeHtml(who)+'">Показать задачи менеджера</button>')+'</div>';
}
function briefing(tasks,working,approvals,checking,late,done){
 let text='';
 if(!tasks.length)text='По выбранному месяцу нет действующих задач. Прежняя методика автоматического плана отключена; новая модель расчёта проходит согласование.';
 else if(isManager())text='Ваших задач: '+q(tasks.length)+'. В работе '+q(working)+', ожидают проверки '+q(checking)+', просрочено '+q(late)+'. Выполняйте действия по SKU и отправляйте результат на проверку.';
 else text='Задач месяца: '+q(tasks.length)+'. Просрочено '+q(late)+', на согласовании '+q(approvals)+', ожидают проверки '+q(checking)+'. Сначала разберите просроченные и ожидающие утверждения, затем проверьте коммерческий результат.';
 return '<section class="tm360-brief"><b>✨ Короткий директорский брифинг</b><p>'+text+'</p>'+
 '<small>Подтверждено '+q(done)+' задач. Статус «Частично» учитывается только по существующим правилам KPI, а не как обычная задача «В работе».</small></section>';
}
function generatorDetails(){
 const card=document.getElementById('tri-task-card');if(!card)return;
 const legacy=card.querySelector('.tm360-generator-rules');if(legacy)legacy.remove();
 const button=document.getElementById('tri-task-generate-btn');
 if(button){button.disabled=true;button.title='Прежний генератор отключён на сервере. Новую модель согласовываем отдельно.';}
 if(card.querySelector('.tm360-generator-pause'))return;
 const note=[...card.children].find(x=>x.classList?.contains('tri-task-note'));
 const anchor=note||card.querySelector('.tri-task-head');if(!anchor)return;
 const message=document.createElement('div');message.className='tm360-generator-pause';
 message.textContent='Прежняя методика задач по подгруппам отменена. Новые ИИ-планы временно не создаются. Для следующей модели: продажи 21vek, свободный остаток и подтверждённые поступления, Витебск, сезонность, целевой рост 15%; Чехов — справочно, группа 900 исключается. Новая формула — после согласования.';
 anchor.insertAdjacentElement('afterend',message);
}
function enhance(){
 if(!active())return false;
 const r=root();if(!r||!r.querySelector('.tm51-top'))return false;
 css();
 // The original month module already enforces per-manager scope; defensively filter display again.
 const own=isManager()?email():null;
 const tasks=[...r.querySelectorAll('.tm51-task')].filter(t=>t.dataset.excluded!=='1'&&(!own||String(t.dataset.manager||'').toLowerCase()===own));
 const working=tally(tasks,WORK),approval=tally(tasks,APPROVAL),checking=tally(tasks,CHECK),late=tally(tasks,LATE),done=tally(tasks,CONFIRMED);
 let head=r.querySelector('.tm360-view');
 if(!head){head=document.createElement('section');head.className='tm360-view';r.querySelector('.tm51-top').insertAdjacentElement('afterend',head)}
 const kpis='<div class="tm360-strip">'+stat('Всего задач',tasks.length,'Без отменённых')+stat('В работе',working,'Ещё не завершены')+
 stat('На согласовании',approval,'Требуют решения')+stat('На проверке',checking,'Подтвердить результат')+stat('Просрочено',late,'Нужна реакция',late>0)+'</div>';
 const managerView=(isManager()?EMAILS.filter(v=>v===own):EMAILS).map(mail=>managerSummary(tasks,mail,NAMES[EMAILS.indexOf(mail)])).join('');
 const actions='<div class="tm360-actions">'+
 (!isManager()?'<span class="tm360-optional">Новая методика ИИ-плана проходит согласование.</span>':'')+
 '<button type="button" data-tm360-expand>▤ Открыть рабочие задачи</button>'+
 '<span class="tm360-optional">Прежний генератор отключён. Проверка результатов уже существовавших задач сохранена.</span></div>';
 head.innerHTML=kpis+briefing(tasks,working,approval,checking,late,done)+actions+
 '<div class="tm360-grid">'+managerView+'</div>'+
 '<div class="tm360-legend"><span><i style="background:#178858"></i>Подтверждено</span><span><i style="background:#3d86c7"></i>В работе</span><span><i style="background:#d89e47"></i>Согласование / проверка</span><span><i style="background:#cc4854"></i>Просрочено</span></div>';
 // Keep the actual manager instructions, payroll summaries and close-month buttons in the DOM.
 let policies=r.querySelector('.tm360-policy');
 if(!policies){policies=document.createElement('details');policies.className='tm360-policy';
  const title=document.createElement('summary');title.textContent='Правила, зарплатный KPI и полные показатели';policies.appendChild(title);
  const content=document.createElement('div');policies.appendChild(content);
  const filters=r.querySelector('.tm51-filters');if(filters)r.insertBefore(policies,filters);else r.appendChild(policies);
 }
 const content=policies.querySelector('div');
 const infos=[...r.children].filter(x=>x.classList?.contains('tm51-info')&&!x.querySelector('button'));
 const score=[...r.children].filter(x=>x.classList?.contains('tm51-grid'));
 for(const node of [...infos,...score])content.appendChild(node);
 // Move the existing actionable task cards, preserving their buttons and delegated events.
 let details=r.querySelector('.tm360-detail');
 if(!details){details=document.createElement('details');details.className='tm360-detail';
  const title=document.createElement('summary');title.textContent='▤ Задачи и результаты — '+q(tasks.length)+' рабочих';details.appendChild(title);
  const body=document.createElement('div');details.appendChild(body);
  r.appendChild(details);
 }
 const body=details.querySelector('div');
 for(const t of [...r.querySelectorAll('.tm51-task')]){
  // Defense in depth: do not display a different manager's task if a provider over-returns.
  if(own&&String(t.dataset.manager||'').toLowerCase()!==own)t.remove();
  else body.appendChild(t);
 }
 const card=document.getElementById('tri-task-card');
 if(card)generatorDetails();
 if(r.dataset.tm360Bound!=='1'){
  r.dataset.tm360Bound='1';
  r.addEventListener('click',event=>{
   const jump=event.target.closest?.('[data-tm360-jump]');
   if(jump)return;
   const show=event.target.closest?.('[data-tm360-expand]');
   if(show){const d=r.querySelector('.tm360-detail');if(d){d.open=true;d.scrollIntoView?.({block:'nearest',behavior:'smooth'})}return}
   const person=event.target.closest?.('[data-tm360-owner]');
   if(person&&!isManager()){
    const select=r.querySelector('#tm51-manager');
    if(select){select.value=person.dataset.tm360Owner;select.dispatchEvent(new Event('change',{bubbles:true}))}
    const d=r.querySelector('.tm360-detail');if(d)d.open=true;
   }
  });
 }
 return true;
}
w.RESANTA_TRIOVIST_TASKS360_V1=Object.freeze({version:VERSION,enhance,readOnly:true,parserUntouched:true,competitorsUntouched:true,noDuplicateOverlay:true});
})(window);
