/* RESANTA CRM v23.6.106 · FALLING CLIENT TASK PERIOD TRUTH
 * Root fix for "Падающие клиенты":
 * - an unfinished client task is always visible regardless of its month;
 * - in single-month mode, a task due in that selected month is shown even if completed;
 * - a completed task from the selected month prevents a duplicate AI task for that same month;
 * - matching is client_id-first; names are only a legacy fallback;
 * - YTD/custom views may show the latest task in the period, but historical completed tasks do not block a new action there.
 * UI-only. No polling, MutationObserver or database writes.
 */
(function(){
'use strict';
if(window.RESANTA_FALLING_TASK_PERIOD_V236106)return;
const V='v23.6.106';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
const d10=v=>String(v||'').slice(0,10);
const month=v=>d10(v).slice(0,7);
function taskRows(){try{return Array.isArray(allTasks)?allTasks:(Array.isArray(window.allTasks)?window.allTasks:[])}catch(_){return[]}}
function loose(a,b){
  try{if(typeof nameLooseMatch==='function')return nameLooseMatch(a,b)}catch(_){}
  const n=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,' ').trim();
  const x=n(a),y=n(b);return !!x&&!!y&&(x===y||x.includes(y)||y.includes(x));
}
function sameClient(t,c){
  if(!t||!c)return false;
  if(t.client_id&&c.id)return String(t.client_id)===String(c.id);
  return loose(t.client_name||'',c.name||'');
}
function accepted(t){return !!t&&String(t.review_status||'').toLowerCase()!=='rejected'}
function isOpen(t){
  if(!accepted(t)||t.done===true)return false;
  try{if(typeof isActiveTask==='function')return !!isActiveTask(t)}catch(_){}
  return true;
}
function currentPeriod(){
  try{const p=window.v20FallingPeriod?.();if(p?.start&&p?.end)return p}catch(_){}
  const ym=String(document.getElementById('falling-end-month')?.value||window.TODAY||new Date().toISOString()).slice(0,7);
  return{mode:'month',start:ym,end:ym,label:ym};
}
function taskInPeriod(t,p){
  const due=month(t?.due_date);
  if(due)return due>=p.start&&due<=p.end;
  const done=month(t?.done_at),created=month(t?.created_at);
  return (!!done&&done>=p.start&&done<=p.end)||(!done&&!!created&&created>=p.start&&created<=p.end);
}
function taskSortValue(t){return String(t?.due_date||t?.done_at||t?.created_at||'')}
function latest(rows){return [...rows].sort((a,b)=>taskSortValue(b).localeCompare(taskSortValue(a))||String(b.created_at||'').localeCompare(String(a.created_at||'')))[0]||null}
function stateFor(c){
  const p=currentPeriod(),rows=taskRows().filter(t=>accepted(t)&&sameClient(t,c));
  const active=latest(rows.filter(isOpen));
  const periodTask=latest(rows.filter(t=>taskInPeriod(t,p)));
  const display=active||periodTask||null;
  const block=!!active||(p.mode==='month'&&!!periodTask);
  return{period:p,active,periodTask,display,block};
}
function taskLabel(s){
  const t=s.display;if(!t)return'';
  if(s.active){
    const overdue=d10(t.due_date)&&d10(t.due_date)<d10(window.TODAY||new Date().toISOString());
    return overdue?'🔴 Незакрытая задача просрочена':'🔵 У клиента есть незакрытая задача';
  }
  if(t.done===true)return s.period.mode==='month'?'✅ Задача выбранного месяца выполнена':'✅ Последняя задача выбранного периода выполнена';
  return '🟡 Задача выбранного периода';
}
function taskStatusBlock(s){
  const t=s.display;if(!t)return'';
  const title=String(t.title||t.text||'Задача').replace(/\s+/g,' ').trim();
  const due=d10(t.due_date),done=d10(t.done_at);
  const bg=s.active?'#EFF6FF':'#F0FDF4',border=s.active?'#BFDBFE':'#BBF7D0',color=s.active?'#1D4ED8':'#166534';
  const meta=[due?'срок '+due:'',t.done===true&&done?'выполнена '+done:'',t.manager_name||''].filter(Boolean).join(' · ');
  return '<div class="card v236106-task-period" style="margin:-8px 0 12px;border-top:0;background:'+bg+';border-color:'+border+';padding:10px 16px"><div style="font-weight:800;color:'+color+'">'+esc(taskLabel(s))+'</div><div style="font-size:11px;color:var(--sub);margin-top:3px">'+esc(meta)+'</div><div style="font-size:12px;margin-top:5px">'+esc(title.slice(0,260))+(title.length>260?'…':'')+'</div></div>';
}
function injectStatus(html,s){
  if(!s.display)return html;
  const marker='<div class="card" style="margin:-8px 0 12px;border-top:0;background:#FFFBEB">';
  const block=taskStatusBlock(s);
  if(html.includes(marker))return html.replace(marker,block+marker);
  return html+block;
}
function patchTaskWording(html,s){
  if(!s.display)return html;
  if(s.period.mode==='month'&&s.periodTask&&s.periodTask.done===true){
    html=html.replace(/Активной задачи нет/g,'Задача месяца выполнена');
    html=html.replace(/Активная задача уже есть/g,'✅ Задача этого месяца выполнена');
  }else if(s.active){
    html=html.replace(/Активной задачи нет/g,'Активная задача есть');
  }
  return html;
}
function installCard(){
  const base=window.v20FallingCard;
  if(typeof base!=='function')return false;
  if(base.__fallingTaskPeriodV236106)return true;
  const wrapped=function(x){
    const s=stateFor(x?.client||{});
    const y=s.block&&s.display?{...x,task:s.display}:x;
    let html=base.call(this,y);
    html=patchTaskWording(html,s);
    return injectStatus(html,s);
  };
  wrapped.__fallingTaskPeriodV236106=true;wrapped.__base=base;
  window.v20FallingCard=wrapped;try{v20FallingCard=wrapped}catch(_){}
  return true;
}
function installAiGuard(){
  const base=window.v2274OpenFallingAi;
  if(typeof base!=='function')return false;
  if(base.__fallingTaskPeriodV236106)return true;
  const wrapped=function(id){
    try{
      const data=typeof v20ComputeFalling==='function'?v20ComputeFalling():null;
      const row=data?.rows?.find(x=>String(x?.client?.id||'')===String(id));
      if(row){
        const s=stateFor(row.client);
        if(!s.active&&s.period.mode==='month'&&s.periodTask){
          const t=s.periodTask,done=t.done===true;
          alert((done?'За выбранный месяц задача у клиента уже была выполнена.':'За выбранный месяц у клиента уже есть задача.')+'\n\nСрок: '+(d10(t.due_date)||'—')+(done?'\nВыполнена: '+(d10(t.done_at)||'—'):'')+'\n\n'+String(t.title||t.text||'').slice(0,350)+'\n\nНовая ИИ-задача за этот же месяц не создаётся, чтобы не было дублей.');
          return;
        }
      }
    }catch(e){console.warn('Falling '+V+' monthly duplicate guard',e)}
    return base.apply(this,arguments);
  };
  wrapped.__fallingTaskPeriodV236106=true;wrapped.__base=base;
  window.v2274OpenFallingAi=wrapped;try{v2274OpenFallingAi=wrapped}catch(_){}
  return true;
}
function install(){const a=installCard(),b=installAiGuard();return a&&b}
install();[150,400,900,1800,3500].forEach(ms=>setTimeout(()=>{if(install()&&ms===3500){try{if(document.getElementById('page-falling')?.classList.contains('active')&&typeof renderFallingClients==='function')renderFallingClients()}catch(_){}}},ms));
window.RESANTA_FALLING_TASK_PERIOD_V236106=Object.freeze({version:V,clientIdFirst:true,activeAcrossMonths:true,selectedMonthHistory:true,monthlyDuplicateGuard:true,noPolling:true,noMutationObserver:true,dbWrites:false});
console.info('RESANTA falling task period '+V+' installed');
})();
