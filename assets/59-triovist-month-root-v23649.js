/* RESANTA CRM v23.6.49 · TRIOVIST AI TASK MONTH ROOT
 * Root rules:
 * - month UI physically belongs to #tri-task-card only;
 * - never mounts after the global Triovist shell;
 * - old v23.6.47/v23.6.48 global roots are suppressed;
 * - one selected task month feeds the existing AI-task engine through the shared hub;
 * - no polling / no MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_MONTH_ROOT_V23649)return;

const V='v23.6.49';
const CACHE_TTL=30000;
const BOSSES=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
const MANAGERS=new Set(['aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru']);
let selected='',root=null,hubWrapped=false,refreshing=false;
const monthCache=new Map();

const dbx=()=>{try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}};
const prof=()=>{try{return window.currentProfile||currentProfile}catch(_){return window.currentProfile}};
const email=()=>String(prof()?.email||'').trim().toLowerCase();
const currentMonth=()=>String((typeof TODAY!=='undefined'&&TODAY)||new Date().toISOString().slice(0,10)).slice(0,7);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function isBoss(){return String(prof()?.role||'').toLowerCase()==='boss'&&BOSSES.has(email())}
function isManager(){return String(prof()?.access_scope||'').toLowerCase()==='triovist'&&MANAGERS.has(email())}
function canUse(){return isBoss()||isManager()}
function storageKey(){return 'triovist_task_month_v23649|'+email()}
function getMonth(){
  if(selected)return selected;
  try{selected=localStorage.getItem(storageKey())||currentMonth()}catch(_){selected=currentMonth()}
  if(!/^\d{4}-\d{2}$/.test(selected)||selected>currentMonth())selected=currentMonth();
  return selected;
}
function setMonth(m){
  const x=String(m||currentMonth()).slice(0,7);
  selected=/^\d{4}-\d{2}$/.test(x)?x:currentMonth();
  if(selected>currentMonth())selected=currentMonth();
  try{localStorage.setItem(storageKey(),selected)}catch(_){}
  monthCache.clear();
}
function shift(m,n){const a=String(m).split('-').map(Number),d=new Date(a[0],a[1]-1+n,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function label(m){const a=String(m).split('-').map(Number);return new Date(a[0],a[1]-1,1).toLocaleDateString('ru-RU',{month:'long',year:'numeric'}).replace(/^./,x=>x.toUpperCase())}
async function rpc(name,args){const d=dbx();if(!d)throw Error('Соединение с базой ещё не готово');const r=await d.rpc(name,args);if(r.error)throw r.error;return r.data}

function cleanupOldRoots(){
  document.getElementById('tri-month47')?.remove();
  document.getElementById('tri-month48')?.remove();
}
function css(){
  if(document.getElementById('tri-month49-css'))return;
  const s=document.createElement('style');
  s.id='tri-month49-css';
  s.textContent=`
    #tri-month47,#tri-month48{display:none!important}
    #tri-month49{display:none;margin:0 0 14px;padding:12px 14px;border:1px solid #bfdbfe;background:#f8fbff;border-radius:12px;box-shadow:0 3px 10px #0f172a0d}
    #tri-task-card #tri-month49{display:block}
    .tm49-top{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
    .tm49-nav{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    .tm49-nav button{border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:7px 10px;font-weight:700;cursor:pointer}
    .tm49-nav button:disabled{opacity:.45;cursor:not-allowed}
    .tm49-month{min-width:170px;text-align:center;font-weight:900;color:#0c447c}
    .tm49-source{margin-top:7px;padding:7px 9px;background:#fff;border:1px solid #dbeafe;border-radius:8px;font-size:11px;color:#475569}
    .tm49-grid{display:grid;grid-template-columns:repeat(2,minmax(250px,1fr));gap:8px;margin-top:10px}
    .tm49-card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px}
    .tm49-score{font-size:21px;font-weight:900}
    .tm49-note{font-size:11px;color:#64748b;margin-top:4px}
    .tm49-close{margin-top:8px;border:1px solid #2563eb;background:#2563eb;color:#fff;border-radius:7px;padding:6px 9px;font-weight:700;cursor:pointer}
    /* Absolute safety: the Triovist global shell/panel cannot leak over another CRM page. */
    #main-content:has(> .page.active:not(#page-triovist)) > #tr14-shell,
    #main-content:has(> .page.active:not(#page-triovist)) > #tr14-panel{display:none!important}
    @media(max-width:720px){.tm49-grid{grid-template-columns:1fr}.tm49-month{min-width:140px}}
  `;
  document.head.appendChild(s);
}

async function monthlyDashboard(args={}){
  const manager=isBoss()?(String(args?.p_manager_email||'').trim().toLowerCase()||null):email();
  const m=getMonth(),ck=(manager||'all')+'|'+m,now=Date.now(),hit=monthCache.get(ck);
  if(hit&&now-hit.at<CACHE_TTL)return hit.data;
  const data=await rpc('triovist_tasks_get_dashboard_month_v23648',{p_manager_email:manager,p_month:m+'-01'});
  monthCache.set(ck,{at:now,data});
  return data;
}
function wrapHub(){
  if(hubWrapped)return true;
  const hub=window.TRIOVIST_DATA_HUB_V227315;if(!hub)return false;
  const oldInvalidate=typeof hub.invalidate==='function'?hub.invalidate.bind(hub):()=>{};
  const oldInfo=typeof hub.info==='function'?hub.info.bind(hub):()=>({});
  window.TRIOVIST_DATA_HUB_V227315=Object.freeze({
    sales:hub.sales,stock:hub.stock,content:hub.content,
    tasks:(args)=>monthlyDashboard(args),
    invalidate:(...kinds)=>{if(!kinds.length||kinds.flat().includes('tasks'))monthCache.clear();return oldInvalidate(...kinds)},
    info:()=>({...oldInfo(),taskMonth:getMonth(),monthlyRoot:V})
  });
  hubWrapped=true;
  return true;
}

function taskCard(){return document.getElementById('tri-task-card')}
function taskTabActive(){return !!document.querySelector('#tr14-shell [data-tr14="tasks"].on')}
function ensureRoot(){
  cleanupOldRoots();css();
  const card=taskCard();if(!card)return null;
  if(root?.isConnected&&root.parentElement===card)return root;
  document.getElementById('tri-month49')?.remove();
  root=document.createElement('div');root.id='tri-month49';
  card.prepend(root);
  return root;
}
function syncGenerateButton(){
  const b=document.getElementById('tri-task-generate-btn');if(!b)return;
  const past=getMonth()<currentMonth();
  b.disabled=past;
  b.title=past?'Прошлый месяц доступен только для просмотра и закрытия. Новые задачи формируются в текущем месяце.':'';
}
async function summary(){return rpc('triovist_month_summary_v23647',{p_month:getMonth()+'-01',p_manager_email:null})}
async function render(){
  if(!canUse())return;
  cleanupOldRoots();wrapHub();
  const r=ensureRoot();if(!r)return;
  r.style.display=taskTabActive()?'block':'none';
  if(!taskTabActive())return;
  syncGenerateButton();
  r.innerHTML='<div class="tm49-note">Загружаю месяц задач…</div>';
  try{
    const d=await summary(),m=getMonth(),rows=Array.isArray(d?.managers)?d.managers:[];
    r.innerHTML=`<div class="tm49-top"><div><b>📅 Задачи ИИ · ${esc(label(m))}</b><div class="tm49-note">Один месяц управляет всем блоком задач: списком, статусами, соревнованием и KPI. Руководитель видит обоих менеджеров; менеджер — только себя.</div></div><div class="tm49-nav"><button type="button" data-tm49="prev">‹</button><span class="tm49-month">${esc(label(m))}</span><button type="button" data-tm49="next" ${m>=currentMonth()?'disabled':''}>›</button><button type="button" data-tm49="now">Текущий месяц</button></div></div><div class="tm49-source"><b>Месяц задач:</b> ${esc(label(m))}. Коммерческие рекомендации используют последний подтверждённый период продаж; месяц продаж не подменяется фиктивными сентябрьскими данными.</div><div class="tm49-grid">${rows.map(x=>`<div class="tm49-card"><b>${esc(x.manager_name)}</b><div class="tm49-score">${Number(x.score||0).toLocaleString('ru-RU')}%</div><div>Подтверждено ${x.verified||0} · частично ${x.partial||0} · не выполнено ${x.failed||0} · исключено ${x.excluded||0} · открыто ${x.open||0}</div><div class="tm49-note">KPI задач: +${(Number(x.task_kpi_rate||0)*100).toFixed(2).replace('.',',')}% к ставке${x.closed?' · 🔒 месяц закрыт':''}</div>${isBoss()&&m<currentMonth()&&!x.closed?`<button type="button" class="tm49-close" data-tm49-close="${esc(x.manager_email)}">Закрыть месяц</button>`:''}</div>`).join('')}</div>`;
  }catch(e){r.innerHTML='<div class="tm49-note" style="color:#b91c1c"><b>Не удалось загрузить месяц задач.</b> '+esc(e?.message||e)+'</div>'}
}

async function reloadTaskEngine(){
  if(refreshing)return;
  refreshing=true;
  try{
    monthCache.clear();
    try{window.TRIOVIST_DATA_HUB_V227315?.invalidate('tasks')}catch(_){}
    if(typeof window.triovistTasksReload==='function')await window.triovistTasksReload(true);
    else{
      const page=document.getElementById('page-triovist');
      const b=page?[...page.querySelectorAll('button')].find(x=>/Задачи\s*ИИ/i.test(String(x.textContent||''))):null;
      if(b)b.click();
    }
  }finally{refreshing=false;await render()}
}
async function choose(action){
  const m=getMonth();
  setMonth(action==='prev'?shift(m,-1):action==='next'?shift(m,1):currentMonth());
  await reloadTaskEngine();
}
function hideOutsideTasks(){if(root?.isConnected)root.style.display='none'}
function scheduleTaskRender(){[0,80,220].forEach(ms=>setTimeout(()=>{if(taskTabActive())render()},ms))}

// Capture only explicit navigation. No observers, no intervals.
document.addEventListener('click',e=>{
  const monthBtn=e.target.closest('[data-tm49]');
  if(monthBtn){e.preventDefault();e.stopPropagation();choose(monthBtn.dataset.tm49);return}
  const closeBtn=e.target.closest('[data-tm49-close]');
  if(closeBtn){
    e.preventDefault();e.stopPropagation();
    if(!confirm('Закрыть '+label(getMonth())+' для '+closeBtn.dataset.tm49Close+'? KPI задач будет зафиксирован.'))return;
    rpc('triovist_month_close_v23647',{p_month:getMonth()+'-01',p_manager_email:closeBtn.dataset.tm49Close}).then(()=>{monthCache.clear();render()}).catch(x=>alert(x?.message||x));
    return;
  }
  const triTab=e.target.closest('#tr14-shell [data-tr14]');
  if(triTab){if(triTab.dataset.tr14==='tasks')scheduleTaskRender();else hideOutsideTasks();return}
  const nav=e.target.closest('.nav-item,.bn-item');
  if(nav&&nav.id!=='nav-triovist'&&nav.id!=='bn-triovist')hideOutsideTasks();
},true);

cleanupOldRoots();css();wrapHub();
if(taskTabActive())scheduleTaskRender();
window.addEventListener('pageshow',()=>{cleanupOldRoots();wrapHub();if(taskTabActive())scheduleTaskRender()},{once:true});
window.RESANTA_TRIOVIST_MONTH_ROOT_V23649=Object.freeze({version:V,getMonth,setMonth,render,reload:reloadTaskEngine,noPolling:true,noObserver:true,mount:'#tri-task-card',serverMonthRpc:'triovist_tasks_get_dashboard_month_v23648'});
})();