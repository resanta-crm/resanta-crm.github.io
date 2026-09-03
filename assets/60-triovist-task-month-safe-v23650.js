/* RESANTA CRM v23.6.50 · TRIOVIST AI TASK MONTHS — ISOLATED SAFE LAYER
 * IMPORTANT:
 * - mounts ONLY inside #tri-task-card;
 * - NEVER wraps/replaces TRIOVIST_DATA_HUB;
 * - NEVER touches Summary / Sales / Stock / Motivation / Cards;
 * - no polling, no MutationObserver;
 * - current task generator remains the original proven one.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_TASK_MONTH_SAFE_V23650)return;

const V='v23.6.50';
const ALEKS='aleksandrenko_av@resanta.ru';
const KRISHTAL='krishtal_na@resanta.ru';
const MANAGERS=[ALEKS,KRISHTAL];
const LEADERS=['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru'];
const CLOSED=new Set(['verified','cancelled','not_relevant','not_achieved']);
const STATUS={
 pending_approval:'На согласовании',new:'Новая',accepted:'Принята',in_progress:'В работе',waiting_21vek:'Ожидает 21vek',
 awaiting_check:'Ожидает проверки',partial:'Частично выполнена',verified:'Выполнена и подтверждена',not_achieved:'Не выполнена',
 overdue:'Просрочена',cancelled:'Отменена',not_relevant:'Неактуальна'
};
let selected='',busy=false,lastKey='',lastAt=0,lastPack=null;

const profile=()=>{try{return window.currentProfile||currentProfile}catch(_){return window.currentProfile}};
const email=()=>String(profile()?.email||'').trim().toLowerCase();
const isLeader=()=>String(profile()?.role||'').toLowerCase()==='boss'&&LEADERS.includes(email());
const isManager=()=>String(profile()?.access_scope||'').toLowerCase()==='triovist'&&MANAGERS.includes(email());
const canUse=()=>isLeader()||isManager();
const dbx=()=>{try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number(v)||0;
const curMonth=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
const storageKey=()=>`triovist_task_month_safe_v23650|${email()}`;
function getMonth(){if(selected)return selected;try{selected=localStorage.getItem(storageKey())||curMonth()}catch(_){selected=curMonth()}if(!/^\d{4}-\d{2}$/.test(selected)||selected>curMonth())selected=curMonth();return selected}
function setMonth(m){selected=String(m||curMonth()).slice(0,7);if(!/^\d{4}-\d{2}$/.test(selected)||selected>curMonth())selected=curMonth();try{localStorage.setItem(storageKey(),selected)}catch(_){}lastKey='';lastPack=null}
function shift(m,n){const a=String(m).split('-').map(Number),d=new Date(a[0],a[1]-1+n,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function monthLabel(m){const a=String(m).split('-').map(Number);return new Date(a[0],a[1]-1,1).toLocaleDateString('ru-RU',{month:'long',year:'numeric'}).replace(/^./,x=>x.toUpperCase())}
function dateLabel(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}.${m[2]}.${m[1]}`:'—'}
function managerName(e){return String(e||'').toLowerCase()===ALEKS?'Александренко':String(e||'').toLowerCase()===KRISHTAL?'Кришталь':'—'}
async function rpc(name,args){const d=dbx();if(!d)throw new Error('Соединение с базой ещё не готово');const r=await d.rpc(name,args);if(r.error)throw r.error;return r.data}

function injectCss(){
 if(document.getElementById('tri-month-safe50-css'))return;
 const s=document.createElement('style');s.id='tri-month-safe50-css';s.textContent=`
 #tri-month-safe-v23650{margin:0 0 14px;padding:13px 14px;border:1px solid #bfdbfe;background:#f8fbff;border-radius:12px}
 .tm50-top{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.tm50-nav{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
 .tm50-nav button{border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:7px 10px;font-weight:700;cursor:pointer}.tm50-nav button:disabled{opacity:.45;cursor:not-allowed}
 .tm50-month{min-width:170px;text-align:center;font-weight:900;color:#0c447c}.tm50-note{font-size:11px;color:#64748b;line-height:1.45}.tm50-alert{margin-top:8px;padding:8px 10px;border-radius:8px;background:#fff;border:1px solid #dbeafe;font-size:12px}
 .tm50-grid{display:grid;grid-template-columns:repeat(2,minmax(250px,1fr));gap:9px;margin-top:10px}.tm50-kpi{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:11px}
 .tm50-score{font-size:24px;font-weight:900}.tm50-rate{font-size:15px;font-weight:800;color:#166534}.tm50-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.tm50-actions button{border:1px solid #cbd5e1;background:#fff;border-radius:7px;padding:6px 8px;font-weight:700;cursor:pointer}.tm50-actions .primary{background:#2563eb;color:#fff;border-color:#2563eb}.tm50-actions .danger{color:#b91c1c}
 .tm50-filters{display:grid;grid-template-columns:190px 190px minmax(220px,1fr);gap:8px;margin-top:12px}.tm50-filters select,.tm50-filters input{width:100%;border:1px solid #d1d5db;border-radius:8px;padding:8px 10px;background:#fff}
 .tm50-task{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:11px;margin-top:8px}.tm50-task-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.tm50-title{font-weight:900}.tm50-pills{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.tm50-pill{display:inline-flex;padding:3px 7px;border-radius:99px;background:#f3f4f6;font-size:10px;font-weight:800}.tm50-status-verified{background:#dcfce7;color:#166534}.tm50-status-overdue,.tm50-status-not_achieved{background:#fee2e2;color:#991b1b}.tm50-status-awaiting_check,.tm50-status-partial{background:#fef3c7;color:#92400e}
 .tm50-details{margin-top:8px;font-size:12px;line-height:1.5;color:#374151}.tm50-empty{padding:18px;text-align:center;color:#64748b;background:#fff;border:1px dashed #cbd5e1;border-radius:10px;margin-top:10px}
 /* v23.6.50 becomes the canonical visible task list only inside the existing task card. */
 #tri-task-card.tri-month-safe50 > .tri-task-kpis,
 #tri-task-card.tri-month-safe50 > .tri-task-filters,
 #tri-task-card.tri-month-safe50 > .card-title,
 #tri-task-card.tri-month-safe50 > #tri-task-list,
 #tri-task-card.tri-month-safe50 > #tri-task-ranking,
 #tri-task-card.tri-month-safe50 > #tri-task-groups{display:none!important}
 #tri-task-card.tri-month-safe50-past > .tri-task-head,
 #tri-task-card.tri-month-safe50-past > .tri-task-note,
 #tri-task-card.tri-month-safe50-past > #tri-task-banner,
 #tri-task-card.tri-month-safe50-past > div:has(#tri-task-manager-wrap){display:none!important}
 @media(max-width:760px){.tm50-grid,.tm50-filters{grid-template-columns:1fr}.tm50-month{min-width:135px}}
 `;document.head.appendChild(s);
}

function card(){return document.getElementById('tri-task-card')}
function ensureRoot(){
 if(!canUse())return null;injectCss();const c=card();if(!c)return null;
 c.classList.add('tri-month-safe50');
 const past=getMonth()<curMonth();c.classList.toggle('tri-month-safe50-past',past);
 let r=document.getElementById('tri-month-safe-v23650');
 if(!r){r=document.createElement('div');r.id='tri-month-safe-v23650';c.prepend(r)}
 return r;
}

async function loadPack(force=false){
 const m=getMonth(),mgr=isLeader()?null:email(),key=m+'|'+(mgr||'all');
 if(!force&&lastPack&&lastKey===key&&Date.now()-lastAt<45000)return lastPack;
 const [dash,summary,policy]=await Promise.all([
   rpc('triovist_tasks_get_dashboard_month_v23648',{p_manager_email:mgr,p_month:m+'-01'}),
   rpc('triovist_month_summary_v23647',{p_month:m+'-01',p_manager_email:mgr}),
   rpc('triovist_motivation_get_policy',{})
 ]);
 lastKey=key;lastAt=Date.now();lastPack={dash:dash||{tasks:[]},summary:summary||{managers:[]},policy:policy||{}};return lastPack;
}
function taskProgress(t,weights){const w=weights||{};return num(w[String(t.status||'')])}
function taskItems(t){const ctx=t?.commercial_context||{};return Array.isArray(t?.items)&&t.items.length?t.items:(Array.isArray(ctx.plan_items)?ctx.plan_items:[])}
function managerSummary(rows,tasks,policy){
 const weights=policy?.task_progress_weights||{};
 return rows.map(x=>{
   const mt=tasks.filter(t=>String(t.manager_email||'').toLowerCase()===String(x.manager_email||'').toLowerCase());
   const progress=mt.length?mt.reduce((s,t)=>s+taskProgress(t,weights),0)/mt.length:0;
   return {...x,progress};
 });
}
function policyText(p){
 const th=Array.isArray(p?.task_thresholds)?p.task_thresholds:[];
 const parts=th.map(x=>`${num(x.from).toLocaleString('ru-RU')}–${num(x.to).toLocaleString('ru-RU')}% → +${(num(x.rate)*100).toFixed(2).replace('.',',')}%`);
 return parts.length?parts.join(' · '):'<60% → +0,00% · 60–79,99% → +0,04% · 80–89,99% → +0,07% · 90–100% → +0,10%';
}
function summaryCard(x,p){
 const taskRate=num(x.task_kpi_rate),base=num(p?.base_rate||0.015),minRate=base+taskRate;
 const past=getMonth()<curMonth(),canClose=isLeader()&&past&&!x.closed&&num(x.open)===0;
 return `<div class="tm50-kpi"><b>${esc(x.manager_name||managerName(x.manager_email))}</b><div class="tm50-score">${num(x.score).toLocaleString('ru-RU',{maximumFractionDigits:2})}%</div><div class="tm50-note">Итог задач для зарплатного KPI</div><div style="margin-top:5px">Подтверждено <b>${num(x.verified)}</b> · частично <b>${num(x.partial)}</b> · не выполнено <b>${num(x.failed)}</b> · исключено <b>${num(x.excluded)}</b> · открыто <b>${num(x.open)}</b></div><div style="margin-top:6px">Текущий ход работы: <b>${num(x.progress).toLocaleString('ru-RU',{maximumFractionDigits:1})}%</b></div><div class="tm50-rate" style="margin-top:6px">Задачи дают +${(taskRate*100).toFixed(2).replace('.',',')}% к ставке</div><div class="tm50-note">База ${(base*100).toFixed(2).replace('.',',')}%. Минимальная ставка с учётом только задач: <b>${(minRate*100).toFixed(2).replace('.',',')}%</b>. План/рост/командный KPI считаются отдельно в «Мотивации».</div>${x.closed?'<div class="tm50-alert">🔒 Месяц закрыт и результат зафиксирован.</div>':past&&num(x.open)>0?`<div class="tm50-alert">Закрыть месяц пока нельзя: осталось открытых задач <b>${num(x.open)}</b>.</div>`:''}${canClose?`<div class="tm50-actions"><button class="primary" data-tm50-close="${esc(x.manager_email)}">🔒 Закрыть месяц</button></div>`:''}</div>`;
}
function taskButtons(t){
 const s=String(t.status||''),out=[];
 if(isLeader()){
   if(s==='pending_approval')out.push(['approve','✅ Согласовать','primary']);
   if(!CLOSED.has(s))out.push(['not_relevant','Неактуальна','']);
   if(!CLOSED.has(s))out.push(['cancel','Отменить','danger']);
 }else if(String(t.manager_email||'').toLowerCase()===email()){
   if(s==='new')out.push(['accept','Принять','primary']);
   if(s==='accepted')out.push(['start','Начать','primary']);
   if(['in_progress','partial','overdue'].includes(s))out.push(['waiting_21vek','Ожидаю 21vek','']);
   if(['in_progress','waiting_21vek','partial','overdue'].includes(s))out.push(['submit_check','Отправить на проверку','primary']);
   if(['partial','overdue'].includes(s))out.push(['continue','Продолжить','']);
   if(!CLOSED.has(s))out.push(['comment','Комментарий','']);
 }
 return out.map(x=>`<button class="${x[2]}" data-tm50-action="${x[0]}" data-task-id="${esc(t.id)}">${x[1]}</button>`).join('');
}
function taskHtml(t){
 const items=taskItems(t),verified=items.filter(x=>x.item_status==='verified').length,s=String(t.status||''),ctx=t.commercial_context||{};
 return `<div class="tm50-task" data-manager="${esc(String(t.manager_email||'').toLowerCase())}" data-status="${esc(s)}" data-search="${esc([t.title,t.group_name,t.manager_name,t.task_text,...items.flatMap(x=>[x.sku,x.product_name])].join(' ').toLowerCase())}"><div class="tm50-task-head"><div><div class="tm50-title">${esc(t.title||'Задача')}</div><div class="tm50-pills"><span class="tm50-pill tm50-status-${esc(s)}">${esc(STATUS[s]||s)}</span><span class="tm50-pill">${esc(t.manager_name||managerName(t.manager_email))}</span><span class="tm50-pill">${esc(t.group_name||'Без подгруппы')}</span><span class="tm50-pill">до ${dateLabel(t.due_date)}</span></div></div><div style="text-align:right"><b>${verified}/${items.length}</b><div class="tm50-note">SKU подтверждено</div></div></div><details class="tm50-details"><summary style="cursor:pointer;font-weight:800">Показать задачу и результат</summary><div style="margin-top:7px"><b>Что сделать:</b><br>${esc(t.task_text||'—').replace(/\n/g,'<br>')}</div>${t.expected_result?`<div style="margin-top:7px"><b>Ожидаемый результат:</b><br>${esc(t.expected_result)}</div>`:''}${t.result_summary?`<div style="margin-top:7px"><b>Последняя проверка:</b><br>${esc(t.result_summary)}</div>`:''}${t.manager_comment?`<div style="margin-top:7px"><b>Комментарий менеджера:</b><br>${esc(t.manager_comment)}</div>`:''}${t.leader_comment?`<div style="margin-top:7px"><b>Комментарий руководителя:</b><br>${esc(t.leader_comment)}</div>`:''}${items.length?`<div style="margin-top:7px"><b>SKU:</b> ${items.slice(0,12).map(x=>esc(x.sku||x.product_name||'—')).join(', ')}</div>`:''}</details><div class="tm50-actions">${taskButtons(t)}</div></div>`;
}
function applyFilters(root){
 const mgr=root.querySelector('#tm50-manager')?.value||'all',st=root.querySelector('#tm50-status')?.value||'all',q=String(root.querySelector('#tm50-search')?.value||'').trim().toLowerCase();let shown=0;
 root.querySelectorAll('.tm50-task').forEach(el=>{const ok=(mgr==='all'||el.dataset.manager===mgr)&&(st==='all'||el.dataset.status===st)&&(!q||String(el.dataset.search||'').includes(q));el.style.display=ok?'block':'none';if(ok)shown++});
 const c=root.querySelector('#tm50-shown');if(c)c.textContent=shown.toLocaleString('ru-RU');
}
async function render(force=false){
 if(!canUse())return;const r=ensureRoot();if(!r)return;
 r.innerHTML='<div class="tm50-note">Загружаю задачи месяца…</div>';
 try{
   const pack=await loadPack(force),m=getMonth(),tasks=Array.isArray(pack.dash?.tasks)?pack.dash.tasks:[],sumRows=managerSummary(Array.isArray(pack.summary?.managers)?pack.summary.managers:[],tasks,pack.policy),past=m<curMonth();
   const visibleTasks=tasks.filter(t=>isLeader()||String(t.manager_email||'').toLowerCase()===email());
   const managers=isLeader()?MANAGERS:[email()];
   const states=[...new Set(visibleTasks.map(t=>String(t.status||'')).filter(Boolean))].sort();
   r.innerHTML=`<div class="tm50-top"><div><b style="font-size:16px">📅 Задачи ИИ · ${esc(monthLabel(m))}</b><div class="tm50-note">Руководитель и менеджеры листают месяцы одинаково. Менеджер видит только свои задачи и свой KPI.</div></div><div class="tm50-nav"><button data-tm50="prev">‹</button><span class="tm50-month">${esc(monthLabel(m))}</span><button data-tm50="next" ${m>=curMonth()?'disabled':''}>›</button><button data-tm50="now">Текущий месяц</button></div></div><div class="tm50-alert"><b>Как считается мотивация за задачи:</b> ${esc(policyText(pack.policy))}. База ${(num(pack.policy?.base_rate||0.015)*100).toFixed(2).replace('.',',')}%, KPI всего до ${(num(pack.policy?.max_kpi_rate||0.005)*100).toFixed(2).replace('.',',')}%; задачи дают максимум ${(num(pack.policy?.task_kpi_max||0.001)*100).toFixed(2).replace('.',',')}%.</div><div class="tm50-grid">${sumRows.map(x=>summaryCard(x,pack.policy)).join('')}</div>${!past?'<div class="tm50-alert">Сейчас открыт рабочий месяц. Новый сентябрьский план формируется штатной кнопкой ниже — по одному менеджеру, 8/10/12/15 подгрупп. Старые месяцы не перезаписываются.</div>':'<div class="tm50-alert">Это архивный месяц. Генерация нового плана здесь отключена; можно разобрать старые задачи и закрыть месяц после завершения открытых.</div>'}<div class="tm50-filters">${isLeader()?`<select id="tm50-manager"><option value="all">Оба менеджера</option>${managers.map(x=>`<option value="${x}">${managerName(x)}</option>`).join('')}</select>`:'<div></div>'}<select id="tm50-status"><option value="all">Все статусы</option>${states.map(x=>`<option value="${esc(x)}">${esc(STATUS[x]||x)}</option>`).join('')}</select><input id="tm50-search" placeholder="Поиск: задача, подгруппа, SKU"></div><div style="margin-top:12px"><b>Задачи месяца — <span id="tm50-shown">${visibleTasks.length}</span></b></div>${visibleTasks.length?visibleTasks.map(taskHtml).join(''):'<div class="tm50-empty">В этом месяце задач пока нет.</div>'}`;
   r.querySelector('#tm50-manager')?.addEventListener('change',()=>applyFilters(r));r.querySelector('#tm50-status')?.addEventListener('change',()=>applyFilters(r));r.querySelector('#tm50-search')?.addEventListener('input',()=>applyFilters(r));
 }catch(e){r.innerHTML=`<div class="tm50-alert" style="border-color:#fecaca;color:#991b1b"><b>Не удалось загрузить месяцы задач.</b> ${esc(e?.message||e)}</div>`}
}

async function taskAction(id,action){
 if(busy)return;busy=true;
 try{
   const payload={};
   if(action==='cancel'&&!confirm('Отменить эту задачу?'))return;
   if(action==='not_relevant'&&!confirm('Пометить задачу как неактуальную и исключить из KPI месяца?'))return;
   if(action==='approve'&&!confirm('Согласовать задачу и отправить менеджеру?'))return;
   if(['comment','waiting_21vek','submit_check'].includes(action)){
     const c=prompt(action==='submit_check'?'Что сделано и чем подтверждается?':'Комментарий по задаче:','');if(c===null)return;payload.comment=c;
     if(action==='submit_check'){const p=prompt('Ссылка на подтверждение или документ (необязательно):','');if(p!==null)payload.proof_url=p;}
   }
   await rpc('triovist_tasks_action',{p_task_id:id,p_action:action,p_payload:payload});lastKey='';lastPack=null;await render(true);
 }catch(e){alert('Не удалось изменить задачу: '+(e?.message||e))}finally{busy=false}
}
async function closeMonth(manager){
 if(!isLeader()||getMonth()>=curMonth())return;
 if(!confirm(`Закрыть ${monthLabel(getMonth())} для ${managerName(manager)}? KPI задач будет зафиксирован.`))return;
 try{await rpc('triovist_month_close_v23647',{p_month:getMonth()+'-01',p_manager_email:manager});lastKey='';lastPack=null;await render(true)}catch(e){alert(e?.message||e)}
}
function choose(a){const m=getMonth();setMonth(a==='prev'?shift(m,-1):a==='next'?shift(m,1):curMonth());render(true)}

function bind(){
 if(window.__TRIOVIST_TASK_MONTH_SAFE50_BOUND)return;window.__TRIOVIST_TASK_MONTH_SAFE50_BOUND=true;
 document.addEventListener('click',e=>{
   const n=e.target.closest('#tri-month-safe-v23650 [data-tm50]');if(n){e.preventDefault();e.stopPropagation();choose(n.dataset.tm50);return}
   const a=e.target.closest('#tri-month-safe-v23650 [data-tm50-action]');if(a){e.preventDefault();e.stopPropagation();taskAction(a.dataset.taskId,a.dataset.tm50Action);return}
   const c=e.target.closest('#tri-month-safe-v23650 [data-tm50-close]');if(c){e.preventDefault();e.stopPropagation();closeMonth(c.dataset.tm50Close);return}
 },true);
}
function mount(){if(!canUse())return;if(!card())return;ensureRoot();render(false)}

const oldRenderTri=window.renderTriovist;
if(typeof oldRenderTri==='function')window.renderTriovist=function(){const out=oldRenderTri.apply(this,arguments);setTimeout(mount,0);return out};
const oldTaskRender=window.triovistTasksRender;
if(typeof oldTaskRender==='function')window.triovistTasksRender=function(){const out=oldTaskRender.apply(this,arguments);setTimeout(mount,0);return out};
const oldTaskReload=window.triovistTasksReload;
if(typeof oldTaskReload==='function')window.triovistTasksReload=async function(){const out=await oldTaskReload.apply(this,arguments);lastKey='';lastPack=null;setTimeout(()=>render(true),0);return out};

bind();setTimeout(mount,0);
window.RESANTA_TRIOVIST_TASK_MONTH_SAFE_V23650=Object.freeze({version:V,getMonth,setMonth,render,mount,isolated:true,noHubWrap:true,noPolling:true,noObserver:true,mountPoint:'#tri-task-card'});
})();