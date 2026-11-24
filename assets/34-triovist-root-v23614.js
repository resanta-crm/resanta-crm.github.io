/* RESANTA CRM v23.6.377 · TRIOVIST ROOT · direct workspace router + stable access */
(function(){
'use strict';
const V='v23.6.415-triovist-commerce',STORE='resanta_triovist_root_v23614_tab',LEADERS=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']),INFOGRAPHIC_OWNER='payushin_ar@resanta.ru';
if(window.RESANTA_TRIOVIST_ROOT_V23614?.version===V)return;
if(window.RESANTA_TRIOVIST_ROOT_BOOTING_V23614===V)return;
window.RESANTA_TRIOVIST_ROOT_BOOTING_V23614=V;
if(window.RESANTA_TRIOVIST_ROOT_V23614){try{delete window.RESANTA_TRIOVIST_ROOT_V23614}catch(_){try{window.RESANTA_TRIOVIST_ROOT_V23614=null}catch(__){}}}
const WORK=['home','sales','groups','shares','stock','tasks','motivation','parser','competitors','infographics'],COMM=['anp','si','budget'];
let ctx=null,shell=null,panel=null,active='home',unixHealthy=false,busy=false,refreshBusy=false,navEpoch=0,mo=null,salesChannel=null,pendingSalesRefresh=false,lastSalesStamp='',commerceRequest=0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>(Number(v)||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const budgetDt=v=>{if(!v)return'';const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v);return d.toLocaleString('ru-RU',{timeZone:'Europe/Minsk',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});};
const month=()=>String((typeof TODAY!=='undefined'&&TODAY)||new Date().toISOString().slice(0,10)).slice(0,7),first=m=>String(m||month()).slice(0,7)+'-01',text=e=>String(e?.textContent||'').replace(/\s+/g,' ').trim();
function dbx(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
async function rpc(n,a={}){const d=dbx();if(!d)throw Error('Соединение с базой ещё не готово');const r=await d.rpc(n,a);if(r.error)throw r.error;return r.data}
const page=()=>document.getElementById('page-triovist'),host=()=>document.getElementById('main-content')||page()?.parentElement||document.querySelector('.main');
function localCtx(){let p=null;try{if(typeof currentProfile!=='undefined'&&currentProfile)p=currentProfile;else if(typeof currentUser!=='undefined'&&currentUser)p=currentUser}catch(_){}if(!p){try{p=window.currentProfile||window.currentUser}catch(_){}}if(!p)return null;const email=String(p.email||'').trim().toLowerCase(),role=String(p.role||'').toLowerCase(),scope=String(p.access_scope||'').toLowerCase(),is_manager=role==='manager'&&scope==='triovist',is_leader=role==='boss'&&LEADERS.has(email);return(is_manager||is_leader)?{email,name:p.name||email,is_manager,is_leader,can_write_expenses:is_leader||email==='krishtal_na@resanta.ru'}:null}
async function context(){
 // A global router is loaded for every CRM user. Never call restricted Triovist
 // RPC for ordinary users: 42501 would otherwise be retried every 250 ms.
 const local=localCtx();if(!local)return null;
 try{const c=await rpc('triovist_ui_context');if(c&&(c.is_manager||c.is_leader))return c}
 catch(e){console.warn('Triovist context unavailable; retaining existing profile scope',e?.code||e?.message||e)}
 return local;
}
function nonTriovistProfileReady(){
 let p=null;try{p=(typeof currentProfile!=='undefined'&&currentProfile)||window.currentProfile||null}catch(_){p=window.currentProfile||null}
 return !!(p?.email&&p?.role&&!localCtx());
}
const COMMERCE_STYLES=`
.tr14-commerce{display:grid;gap:14px;min-width:0;color:var(--text)}
.tr14-commerce *{box-sizing:border-box}
.tr14-commerce h2,.tr14-commerce h3,.tr14-commerce p{margin:0}
.tr14-commerce h2{font-size:25px;font-weight:700;line-height:1.2;letter-spacing:-.6px}
.tr14-commerce h3{font-size:16px;font-weight:650}
.tr14-commerce .tr14-note{color:var(--sub);font-size:13px;line-height:1.5}
.tr14-commerce .tr14-sec{align-items:center;gap:12px}
.tr14-commerce .tr14-k{grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr));margin:0}
.tr14-commerce .tr14-k>div,.tr14-commerce-card{min-width:0;border:1px solid var(--border);border-radius:12px;background:var(--card);padding:14px}
.tr14-commerce .tr14-k span{color:var(--sub);font-size:13px;text-transform:none}
.tr14-commerce .tr14-k b,.tr14-budget-value strong{font-size:clamp(20px,2vw,27px);font-weight:650;letter-spacing:-.4px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.tr14-budget-value{display:grid;gap:6px;justify-items:start}
.tr14-budget-value.over{color:var(--r);background:var(--rb)}
.tr14-commerce :is(.form-input,.btn-primary,.btn-secondary){min-height:38px;border-radius:8px;font-size:14px}
.tr14-commerce .form-input{max-width:100%;border-color:var(--border);background:var(--card);color:var(--text)}
.tr14-commerce .btn-secondary{display:inline-flex;align-items:center;border:1px solid var(--border);background:var(--card);color:var(--a)}
.tr14-commerce .btn-primary{background:var(--a);color:var(--card);border-color:var(--a)}
.tr14-commerce .tr14-form>div{min-width:0}
.tr14-commerce .tr14-form .form-label{color:var(--sub)}
.tr14-commerce .tr14-table{color:var(--text);font-size:14px}
.tr14-commerce .tr14-table th{background:var(--bg);font-weight:550;color:var(--sub)}
.tr14-commerce .tr14-table :is(th,td){border-color:var(--border);overflow-wrap:anywhere}
.tr14-commerce .tr14-table b{font-variant-numeric:tabular-nums}
.tr14-commerce .tr14-table-wrap{overflow:auto;margin-top:10px}
.tr14-commerce .tr14-table{min-width:540px}
.tr14-commerce .tr14-form{grid-template-columns:minmax(130px,.8fr) minmax(120px,.8fr) minmax(180px,1.4fr) auto;margin-bottom:4px}
.tr14-commerce .tr14-budget-base .tr14-form{grid-template-columns:minmax(130px,.8fr) minmax(200px,1.6fr) auto}
.tr14-budget-base>summary{cursor:pointer;color:var(--a);font-weight:600}
.tr14-budget-heading{position:relative;display:flex;align-items:center;gap:9px}
.tr14-budget-help{display:inline-flex;flex:none}
.tr14-budget-help button{display:grid;place-items:center;width:38px;height:38px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--a);font:700 20px/1 system-ui;cursor:pointer}
.tr14-budget-help :is(button,aside):focus-visible,.tr14-budget-base>summary:focus-visible{outline:3px solid var(--a);outline-offset:3px}
.tr14-budget-help:hover button,.tr14-budget-help button[aria-expanded=true]{background:var(--ab)}
.tr14-budget-popover{display:none;position:absolute;z-index:7;inset-block-start:100%;inset-inline-start:0;width:min(560px,calc(100vw - 4rem));max-height:min(55vh,430px);overflow:auto;overscroll-behavior:contain;padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--card);box-shadow:0 6px 22px #11182726;color:var(--text);font-size:13px;line-height:1.55;overflow-wrap:anywhere}
.tr14-budget-help:not([data-dismissed]):is(:hover,:focus-within,[data-open]) .tr14-budget-popover{display:block}
.tr14-budget-popover p+p{margin-top:8px}
.tr14-budget-comment{white-space:pre-wrap}
@media(max-width:880px){.tr14-commerce .tr14-form,.tr14-commerce .tr14-budget-base .tr14-form{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:530px){.tr14-commerce .tr14-form,.tr14-commerce .tr14-budget-base .tr14-form{grid-template-columns:minmax(0,1fr)}}
`;
function css(){let old=document.getElementById('tr14-css');if(old?.dataset.tr14Version===V)return;if(old)old.remove();const s=document.createElement('style');s.id='tr14-css';s.dataset.tr14Version=V;s.textContent=`#page-triovist[data-triovist-view] #tri-v22728-tabs{display:none!important}#tr14-shell [data-tr14=\"sales\"]{display:none!important}#tr14-shell{display:none;position:relative;top:auto;z-index:2;background:#f9fafbfa;border:1px solid #d9e3ef;border-radius:14px;padding:10px 12px;margin-bottom:14px;box-shadow:0 6px 20px #0f172a12}#tr14-panel{display:none;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:16px;margin-bottom:16px}.tr14-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px}.tr14-head b{color:#0c447c}.tr14-head-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.tr14-head span,.tr14-note{font-size:11px;color:#64748b}.tr14-refresh{border:1px solid #cbd5e1;background:#fff;color:#0c447c;border-radius:8px;padding:6px 10px;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap}.tr14-refresh:hover{background:#eff6ff}.tr14-refresh:disabled{opacity:.6;cursor:default}.tr14-g{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);gap:9px}.tr14-box{min-width:0;border-radius:10px;padding:8px;background:#f8fafc;border:1px solid #e5e7eb}.tr14-box.c{background:var(--card);border-color:var(--border)}.tr14-label{font-size:10px;font-weight:800;color:#64748b;margin:0 0 6px 2px}.tr14-row{display:flex;flex-wrap:wrap;gap:6px;overflow:visible}.tr14-row button{flex:none;border:1px solid #d8e0ea;background:#fff;border-radius:9px;padding:8px 10px;font-size:11px;font-weight:700;white-space:nowrap}.tr14-row button.on{background:#e6f1fb;border-color:#60a5fa;color:#0c447c}.tr14-box.c button.on{background:var(--ab);border-color:var(--a);color:var(--at)}.tr14-sec{display:flex;justify-content:space-between;align-items:end;gap:12px;flex-wrap:wrap}.tr14-sec h3{margin:0}.tr14-k{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:9px;margin:12px 0}.tr14-k>div{background:#f8fafc;border-radius:10px;padding:12px}.tr14-k span{display:block;font-size:10px;color:#64748b;text-transform:uppercase}.tr14-k b{display:block;font-size:18px;margin-top:4px}.tr14-form{display:grid;grid-template-columns:160px 180px minmax(220px,1fr) auto;gap:9px;align-items:end;margin:12px 0}.tr14-info,.tr14-warn{padding:10px 12px;border-radius:10px;font-size:12px;margin:10px 0}.tr14-info{background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a}.tr14-warn{background:#fff7ed;border:1px solid #fdba74;color:#9a3412}.tr14-table{width:100%;border-collapse:collapse;font-size:12px}.tr14-table th,.tr14-table td{padding:9px;border-bottom:1px solid #e5e7eb;text-align:left}.tr14-table th{background:#f8fafc;color:#64748b}#tri-v23612-shell,#tri-v23612-panel,#tri-v23611-shell,#tri-v23611-panel,#tri-v2369-shell,#tri-v2369-panel,#tri-manager-shell-v2367,#tri-manager-budget-v2367,#tri-commercial-panel-v2366{display:none!important}@media(max-width:900px){.tr14-g{grid-template-columns:1fr}.tr14-k{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){.tr14-form,.tr14-k{grid-template-columns:1fr}#tr14-shell{top:auto}}`+COMMERCE_STYLES;document.head.appendChild(s)}
function legacy(k){const p=page(),rx={home:/Сводка/i,sales:/Продажи\s*$/i,stock:/Остатки(?:\s+и\s+заказ)?/i,tasks:/Задачи\s*ИИ/i,motivation:/Мотивация/i,cards:/Карточки\s*21vek/i}[k];return p&&rx?[...p.querySelectorAll('button')].find(b=>rx.test(text(b)))||null:null}
const DIRECT_WORK_IDS=Object.freeze({
 home:['triovist-warning','tri-period-mode','tri-kpis','tri-manager-cards','tri-overview-360'],
 // v23.6.381: Sales is a detail workspace, not a duplicate of Summary.
 // It reuses the already loaded sales dataset; no extra RPCs are introduced.
 sales:['triovist-warning','tri-period-mode','tri-plans-card','tri-my-groups-card','tri-groups','tri-alerts','tri-details'],
 stock:['tri-stock-card'],
 tasks:['tri-task-card','tri-month-safe-v23651'],
 motivation:['tri-ai-independent-root-v2348','tri-motivation-card','tri-plans-card'],
 cards:['tri21-card'],
 parser:['tri21-control-v236107']
});
const directHidden=new Map();
function topPageChild(el){const p=page();let x=el;if(!p||!x)return null;while(x.parentElement&&x.parentElement!==p)x=x.parentElement;return x?.parentElement===p?x:null}
function restoreDirectWork(){
 for(const [el,v] of directHidden){
   if(!el?.isConnected)continue;
   if(v?.value)el.style.setProperty('display',v.value,v.priority||'');
   else el.style.removeProperty('display');
 }
 directHidden.clear();
}
function hideDirectWork(el){
 if(!el||directHidden.has(el))return;
 directHidden.set(el,{value:el.style.getPropertyValue('display'),priority:el.style.getPropertyPriority('display')});
 el.style.setProperty('display','none','important');
}
function directWorkRoots(){
 const out=new Set(),p=page();if(!p)return out;
 for(const ids of Object.values(DIRECT_WORK_IDS))for(const id of ids){const el=document.getElementById(id),top=topPageChild(el);if(top)out.add(top)}
 return out;
}
function showDirectWork(k){
 const p=page();if(!p)return false;
 restoreDirectWork();
 const allow=new Set();
 const head=p.firstElementChild;if(head)allow.add(head);
 for(const id of (DIRECT_WORK_IDS[k]||[])){const top=topPageChild(document.getElementById(id));if(top)allow.add(top)}
 for(const el of directWorkRoots())if(!allow.has(el))hideDirectWork(el);
 if(['stock','tasks','parser'].includes(k)){
   for(const id of (DIRECT_WORK_IDS[k]||[])){
     const top=topPageChild(document.getElementById(id));
     if(top)top.style.setProperty('display','block','important');
   }
 }
 return allow.size>1;
}
async function waitForDirect(test,ms=2200){
 const started=Date.now();while(Date.now()-started<ms){try{if(test())return true}catch(_){}await new Promise(r=>setTimeout(r,70))}return false;
}
async function prepareDirectWork(k){
 if(k==='home'||k==='sales'){
   if(pendingSalesRefresh){pendingSalesRefresh=false;await window.triovistSalesReload?.(true)}
   else if(typeof window.triovistSalesEnsureLoaded==='function')await window.triovistSalesEnsureLoaded();
   else if(typeof window.renderTriovist==='function')window.renderTriovist();
 }
 if(k==='tasks'){
   for(let i=0;i<30&&!window.RESANTA_TRIOVIST_TASK_MONTH_SAFE_V23651;i++)await new Promise(r=>setTimeout(r,50));
   const mod=window.RESANTA_TRIOVIST_TASK_MONTH_SAFE_V23651;
   if(!mod?.render)throw Error('Модуль задач месяца ещё не готов');
   await mod.render(false);
   window.RESANTA_TRIOVIST_TASKS360_V1?.enhance?.();
   await window.RESANTA_TRIOVIST_DEMAND_AI_V1?.open?.();
 }
 if(k==='stock'){
   if(typeof window.triovistStockEnsureLoaded==='function')await window.triovistStockEnsureLoaded();
   else if(typeof window.renderTriovistStock==='function')window.renderTriovistStock();
 }
 if(k==='parser'){
   await waitForDirect(()=>window.RESANTA_TRIOVIST_21VEK_CONTROL_V236107&&document.getElementById('tri21-control-v236107'));
   try{await window.RESANTA_TRIOVIST_21VEK_CONTROL_V236107?.refresh?.()}catch(e){console.warn('Triovist parser refresh',e)}
 }
}
function hideOld(){const p=page();if(!p||!p.classList.contains('active')||(active==='home'&&unixHealthy))return;const legacyHead=p.firstElementChild;if(legacyHead&&/Триовист\s*\/\s*21vek\.by/i.test(text(legacyHead)))legacyHead.style.setProperty('display','none','important');const bars=[];for(const b of p.querySelectorAll('button')){const t=text(b);if(/Отгрузки\s*1С|Новинки|Карточки\s*21vek/i.test(t))b.style.setProperty('display','none','important');if(!/Сводка/i.test(t))continue;const x=b.parentElement,all=x?[...x.querySelectorAll(':scope > button')].map(text).join('|'):'';if(/Продажи/i.test(all)&&/Остатки/i.test(all))bars.push(x)}bars.forEach(x=>x.style.setProperty('display','none','important'))}
function choose(k){active=k;const pg=page();if(pg)pg.dataset.triovistView=k;window.RESANTA_TRIOVIST_UNIX_DIRECTOR_V1?.show?.(k==='home'&&unixHealthy&&!!pg?.classList.contains('active'));shell?.querySelectorAll('[data-tr14]').forEach(b=>b.classList.toggle('on',b.dataset.tr14===k));try{localStorage.setItem(STORE+'|'+(ctx?.email||''),k)}catch(_){}}
function canSeeInfographics(){return String(ctx?.email||'').trim().toLowerCase()===INFOGRAPHIC_OWNER}
function visibleWorkKeys(){return WORK.filter(k=>k!=='infographics')}
function remembered(){try{const k=localStorage.getItem(STORE+'|'+(ctx?.email||''));if(k==='cards')return'parser';if(k==='infographics'&&!canSeeInfographics())return'home';return[...visibleWorkKeys(),...COMM].includes(k)?k:'home'}catch(_){return'home'}}
function shellComplete(el=shell){if(!el?.isConnected)return false;const need=[...visibleWorkKeys(),...COMM],keys=[...el.querySelectorAll('[data-tr14]')].map(b=>b.dataset.tr14),got=new Set(keys);return keys.length===need.length&&need.every(k=>got.has(k))}
function repairShell(){const el=shell?.isConnected?shell:document.getElementById('tr14-shell');if(!el)return false;const orphan=el!==shell;if(orphan||!shellComplete(el)){el.remove();const pp=panel?.isConnected?panel:document.getElementById('tr14-panel');pp?.remove();shell=null;panel=null;return true}return false}
function dom(){const p=page(),h=host();if(!p||!h)return false;repairShell();if(!shell?.isConnected){shell=document.createElement('div');shell.id='tr14-shell';const w=[['home','📊 Сводка 360°'],['sales','💰 Продажи'],['groups','📈 Группы и категории'],['shares','📊 Доли 21vek'],['stock','📦 Остатки и заказ'],['tasks','🤖 Задачи ИИ'],['motivation','🏆 Бонусы и план'],['parser','🌐 Парсер 21vek'],['competitors','⚔️ Конкуренты 21vek'],...[]],c=[['anp','🧾 АНП'],['si','🛠 Компенсация СИ'],['budget','💼 Бюджет']],r=a=>a.map(x=>`<button type="button" data-tr14="${x[0]}">${x[1]}</button>`).join('');shell.innerHTML=`<div class="tr14-head"><b>Триовист (21vek.by)</b><div class="tr14-head-actions"><span>${esc(ctx?.name||ctx?.email||'')}</span><button type="button" class="tr14-refresh" data-tr14-refresh>↻ Обновить</button></div></div><div class="tr14-g"><div class="tr14-box"><div class="tr14-label">РАБОТА</div><div class="tr14-row">${r(w)}</div></div><div class="tr14-box c"><div class="tr14-label">КОММЕРЦИЯ</div><div class="tr14-row">${r(c)}</div></div></div>`;shell.onclick=e=>{const rb=e.target.closest('[data-tr14-refresh]');if(rb){e.preventDefault();refreshCurrent();return}const b=e.target.closest('[data-tr14]');if(b)activate(b.dataset.tr14,true).catch(error)};h.insertBefore(shell,h.firstChild)}if(!panel?.isConnected){panel=document.createElement('div');panel.id='tr14-panel';shell.insertAdjacentElement('afterend',panel);bind()}hideOld();sync();return true}
async function refreshCurrent(){
 if(refreshBusy)return;
 const b=shell?.querySelector('[data-tr14-refresh]'),label=b?.textContent||'↻ Обновить',k=active;
 refreshBusy=true;if(b){b.disabled=true;b.textContent='↻ Обновляю…'}
 try{
   if(k==='home'&&window.RESANTA_TRIOVIST_UNIX_DIRECTOR_V1?.refresh){await window.RESANTA_TRIOVIST_UNIX_DIRECTOR_V1.refresh()}
   else if(k==='sales'){
     if(typeof window.triovistSalesReload==='function')await window.triovistSalesReload(true);
     else if(typeof window.triovistReload==='function')await window.triovistReload();
     else throw Error('Функция обновления продаж Triovist ещё не готова');
     // No overlapping old summary. Uni X is the only home view.
   }else if(k==='stock'){
     if(typeof window.triovistStockReload==='function')await window.triovistStockReload(true);
     else if(typeof window.triovistReload==='function')await window.triovistReload();
     else throw Error('Функция обновления остатков Triovist ещё не готова');
   }else if(k==='tasks')await window.RESANTA_TRIOVIST_TASK_MONTH_SAFE_V23651?.render?.(true);
   else if(k==='motivation')await window.RESANTA_SAFE_TRIOVIST_V236200?.refresh?.();
   else if(k==='parser')await window.RESANTA_TRIOVIST_21VEK_CONTROL_V236107?.refresh?.();
   else if(k==='groups'){
     const mod=window.RESANTA_TRIOVIST_GROUP_DYNAMICS_V236120;
     if(mod?.refresh)await mod.refresh();else if(mod?.open)await mod.open(panel,ctx);
   }else if(k==='shares')await window.RESANTA_TRIOVIST_SHARES360_V1?.refresh?.();
   else if(k==='competitors'){
     const mod=window.RESANTA_TRIOVIST_COMPETITORS_V236218;
     if(mod?.open)await mod.open(panel,ctx,true);
    }else if(k==='infographics'){
     await window.RESANTA_TRIOVIST_INFOGRAPHIC_BATCH_V236386?.refresh?.();
     await window.RESANTA_TRIOVIST_INFOGRAPHICS_V236385?.refresh?.();
     await window.RESANTA_TRIOVIST_PREMIUM_V236390?.refresh?.();
   }
   else if(k==='anp'||k==='si')await expense(k,document.querySelector(`[data-tr14-month="${k}"]`)?.value||month());
   else if(k==='budget')await budget(document.querySelector('[data-tr14-month="budget"]')?.value||month());
   if(active===k){sync();window.RESANTA_TRIOVIST_NATIVE_SECTIONS_V1?.mount?.(k,ctx)}
 }catch(e){console.error('Triovist refresh',e);alert('Не удалось обновить Triovist: '+(e?.message||e))}
 finally{refreshBusy=false;if(b?.isConnected){b.disabled=false;b.textContent=label}}
}
async function applySalesImportRefresh(payload){
 const rec=payload?.new||payload?.record||{};
 if(String(rec.source||'')!=='triovist_sales'||String(rec.status||'')!=='ok')return;
 const stamp=String(rec.source_message_at||rec.updated_at||rec.last_success_at||'');
 if(stamp&&stamp===lastSalesStamp)return;
 if(stamp)lastSalesStamp=stamp;
 try{window.TRIOVIST_DATA_HUB_V227315?.invalidate('sales','stock','tasks')}catch(_){}
 if(page()?.classList.contains('active')&&(active==='home'||active==='sales')){
  try{await refreshCurrent()}catch(e){console.warn('Triovist realtime refresh',e)}
 }else pendingSalesRefresh=true;
}
function subscribeSalesImport(){
 if(salesChannel)return true;
 const d=dbx();
 if(!d?.channel)return false;
 try{
  salesChannel=d.channel('triovist-sales-import-v236164')
   .on('postgres_changes',{event:'*',schema:'public',table:'crm_import_status',filter:'source=eq.triovist_sales'},payload=>{applySalesImportRefresh(payload)})
   .subscribe(status=>{if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')console.warn('Triovist sales realtime',status)});
  return true;
 }catch(e){console.warn('Triovist sales realtime subscribe',e);salesChannel=null;return false}
}

function sync(){const p=page();if(!p||!shell||!panel)return;const on=p.classList.contains('active');
 const mot=document.getElementById('tri-mot-compare-v236200');
 if(mot)mot.style.setProperty('display',on&&active==='motivation'?'block':'none','important');
 shell.style.setProperty('display',on?'block':'none','important');if(!on){panel.style.setProperty('display','none','important');p.style.removeProperty('display');window.RESANTA_TRIOVIST_UNIX_DIRECTOR_V1?.show?.(false);return}if(active==='home'&&unixHealthy&&window.RESANTA_TRIOVIST_UNIX_DIRECTOR_V1?.open){p.style.setProperty('display','none','important');panel.style.setProperty('display','none','important');window.RESANTA_TRIOVIST_UNIX_DIRECTOR_V1.show(true)}else if(active==='motivation'){p.style.setProperty('display','none','important');panel.style.setProperty('display','none','important')}else if(COMM.includes(active)||active==='groups'||active==='shares'||active==='competitors'||active==='infographics'){p.style.setProperty('display','none','important');panel.style.setProperty('display','block','important')}else{p.style.setProperty('display','block','important');panel.style.setProperty('display','none','important')}if(active!=='home'||!unixHealthy)window.RESANTA_TRIOVIST_UNIX_DIRECTOR_V1?.show?.(false);hideOld();
 // On first entry, start() may have opened the saved tab while Triovist was hidden.
 if(on)window.RESANTA_TRIOVIST_NATIVE_SECTIONS_V1?.mount?.(active,ctx);
}
function error(e){panel.innerHTML=`<div class="tr14-warn"><b>Ошибка.</b><br>${esc(e?.message||e)}</div>`;panel.style.setProperty('display','block','important')}
async function work(k,token){
 choose(k);panel.style.setProperty('display','none','important');page().style.setProperty('display','block','important');
 document.getElementById('tr14-direct-error')?.remove();
 restoreDirectWork();showDirectWork(k);hideOld();
 [0,80,250,700].forEach(ms=>setTimeout(()=>{if(token===navEpoch&&active===k&&page()?.classList.contains('active')){page().style.setProperty('display','block','important');shell.style.setProperty('display','block','important');showDirectWork(k);hideOld();/* Keep scroll position during parser navigation. */}},ms));
 try{await prepareDirectWork(k);if(k==='home')await window.RESANTA_TRIOVIST_SUMMARY360_V1?.open?.()}catch(e){
   console.warn('Triovist direct section '+k,e);
   const x=document.createElement('div');x.id='tr14-direct-error';x.className='tr14-warn';x.innerHTML='<b>Раздел не загрузился.</b><br>'+esc(e?.message||e);
   page()?.prepend(x);
 }
 if(token!==navEpoch||active!==k)return;
 showDirectWork(k);hideOld();
}
async function loadPremiumInfographics(){
 const expected='23.6.401';
 const ready=()=>{const x=window.RESANTA_TRIOVIST_PREMIUM_V236390;return x?.open&&String(x.version||'')===expected&&String(x.factoryVersion||'')==='5.0'?x:null};
 if(ready())return ready();
 if(window.RESANTA_TRIOVIST_PREMIUM_V236390){try{delete window.RESANTA_TRIOVIST_PREMIUM_V236390}catch(_){window.RESANTA_TRIOVIST_PREMIUM_V236390=null}}
 for(let attempt=1;attempt<=2;attempt++){
  document.querySelectorAll('script[data-tr14-premium-infographics]').forEach(x=>x.remove());
  try{
   await new Promise((resolve,reject)=>{
    const s=document.createElement('script');s.async=true;s.dataset.tr14PremiumInfographics='1';
    s.src='./assets/122-triovist-premium-infographic-v236390.js?v='+expected+'&factory=5.0.2-archived'+(attempt===2?'-retry2':'');
    const timer=setTimeout(()=>reject(Error('Таймаут загрузки профессионального модуля')),15000);
    s.onload=()=>{clearTimeout(timer);resolve(true)};
    s.onerror=()=>{clearTimeout(timer);reject(Error('Файл профессионального модуля не загрузился'))};
    document.head.appendChild(s);
   });
  }catch(e){if(attempt===2)throw e}
  const mod=ready();if(mod)return mod;
  if(window.RESANTA_TRIOVIST_PREMIUM_V236390){try{delete window.RESANTA_TRIOVIST_PREMIUM_V236390}catch(_){}}
 }
 throw Error('Профессиональный модуль v23.6.401 не инициализировался после двух загрузок.');
}
async function loadInfographicBatch(){
 const previous=window.RESANTA_TRIOVIST_INFOGRAPHIC_BATCH_V236386;if(previous?.open)return previous;
 const found=document.querySelector('script[data-tr14-infographic-batches]');
 if(!found){
  const s=document.createElement('script');s.async=true;s.dataset.tr14InfographicBatches='1';
  s.src='./assets/121-triovist-infographic-batches-v236386.js?v=23.6.391&factory=5.0';document.head.appendChild(s);
 }
 for(let i=0;i<50;i++){
  const mod=window.RESANTA_TRIOVIST_INFOGRAPHIC_BATCH_V236386;if(mod?.open)return mod;
  await new Promise(r=>setTimeout(r,100));
 }
 throw Error('Массовый раздел инфографики временно недоступен. Редактор отдельного товара сохранён.');
}
async function loadInfographics(){
 const existing=window.RESANTA_TRIOVIST_INFOGRAPHICS_V236385;if(existing?.open)return existing;
 const found=document.querySelector('script[data-tr14-infographics]');
 if(!found){const el=document.createElement('script');el.async=true;el.dataset.tr14Infographics='1';el.src='./assets/120-triovist-infographics-v236385.js?v=23.6.386';document.head.appendChild(el)}
 for(let i=0;i<50;i++){
  const mod=window.RESANTA_TRIOVIST_INFOGRAPHICS_V236385;
  if(mod?.open)return mod;
  await new Promise(r=>setTimeout(r,100));
 }
 throw Error('Модуль «Инфографика» не загрузился. Другие разделы работают, повторите попытку.');
}
async function activate(k,save=false){
 if(k==='cards')k='parser';
 if(k==='infographics'&&!canSeeInfographics())k='home';
 if(![...visibleWorkKeys(),...COMM].includes(k))k='home';
 const token=++navEpoch;
 if(k==='home'&&window.RESANTA_TRIOVIST_UNIX_DIRECTOR_V1?.open){
  choose(k);
  // Keep legacy page available until the new read-only overview has rendered.
  // Promise resolution alone is insufficient: open() must report successful render.
  const ux=window.RESANTA_TRIOVIST_UNIX_DIRECTOR_V1;
  let timeoutId=null,ok=false;
  try{
   ok=await Promise.race([
    Promise.resolve().then(()=>ux.open(ctx)),
    new Promise(resolve=>{timeoutId=setTimeout(()=>resolve(false),8000)})
   ]);
  }catch(e){console.warn('Triovist Uni X failed; restoring working home',e?.message||e)}
  finally{if(timeoutId!==null)clearTimeout(timeoutId)}
  if(token!==navEpoch||active!==k)return;
  unixHealthy=ok===true;
  if(unixHealthy){sync();return}
  // Failure / no verified sales / timeout: preserve all existing work tabs.
  try{ux.show(false)}catch(_){}
  await work('home',token);
  if(token===navEpoch&&active===k)sync();
  return;
 }
 if(k==='shares'){
   choose(k);page().style.setProperty('display','none','important');panel.style.setProperty('display','block','important');
   panel.innerHTML='<div class="tr14-info">Загружаю Доли 21vek…</div>';
   const mod=window.RESANTA_TRIOVIST_SHARES360_V1;
   if(!mod?.open)throw Error('Модуль «Доли 21vek» ещё не загрузился.');
   await mod.open(panel,ctx);
 }else if(k==='competitors'){
   choose(k);page().style.setProperty('display','none','important');panel.style.setProperty('display','block','important');
   panel.innerHTML='<div class="tr14-info">Загружаю конкурентный анализ 21vek…</div>';
   for(let i=0;i<30&&!window.RESANTA_TRIOVIST_COMPETITORS_V236218&&token===navEpoch;i++)await new Promise(r=>setTimeout(r,60));
   if(token!==navEpoch||active!==k)return;
   const mod=window.RESANTA_TRIOVIST_COMPETITORS_V236218;
   if(!mod?.open)throw Error('Модуль «Конкуренты 21vek» ещё не загрузился. Повторите через несколько секунд.');
   const mount=document.createElement('div');panel.replaceChildren(mount);await mod.open(mount,ctx);
 }else if(k==='infographics'){
   // Factory 5 is the only visible infographic workspace. Legacy V1/V4 data remain archived in DB/storage,
   // but their UI/workers are not loaded here. This keeps the heavy module isolated from every other CRM route.
   choose(k);page().style.setProperty('display','none','important');panel.style.setProperty('display','block','important');
   panel.innerHTML='<div class="tr14-info">Загружаю Фабрику инфографики 5.0…</div>';
   try{
     const factory=await loadPremiumInfographics();
     if(token!==navEpoch||active!==k)return;
     await factory.open(panel,ctx);
   }catch(e){
     console.warn('Infographic Factory 5 isolated load',e);
     if(token!==navEpoch||active!==k)return;
     panel.innerHTML='<div class="tr14-warn">Фабрика инфографики временно не загрузилась. Остальные разделы CRM не затронуты.</div>';
   }
 }else if(k==='motivation'){
   choose(k);page().style.setProperty('display','none','important');panel.style.setProperty('display','none','important');
   for(let i=0;i<30&&!window.RESANTA_SAFE_TRIOVIST_V236200&&token===navEpoch;i++)await new Promise(r=>setTimeout(r,50));
   if(token!==navEpoch||active!==k)return;
   const mod=window.RESANTA_SAFE_TRIOVIST_V236200;if(!mod?.refresh)throw Error('Модуль мотивации ещё не готов');await mod.refresh();
 }else if(k==='groups'){
   choose(k);page().style.setProperty('display','none','important');panel.style.setProperty('display','block','important');
   panel.innerHTML='<div class="tr14-info">Загружаю группы и динамику…</div>';
   for(let i=0;i<20&&!window.RESANTA_TRIOVIST_GROUP_DYNAMICS_V236120&&token===navEpoch;i++)await new Promise(r=>setTimeout(r,50));
   if(token!==navEpoch||active!==k)return;
   const mod=window.RESANTA_TRIOVIST_GROUP_DYNAMICS_V236120;
   if(!mod?.open)throw Error('Модуль «Группы и динамика» не загрузился. Остальные разделы Triovist доступны.');
   const mount=document.createElement('div');panel.replaceChildren(mount);await mod.open(mount,ctx);
 }else if(WORK.includes(k))await work(k,token);
 else{
   choose(k);page().style.setProperty('display','none','important');panel.style.setProperty('display','block','important');panel.innerHTML='<div class="tr14-info">Загрузка…</div>';
   if(k==='anp'||k==='si')await expense(k,month());
   else if(k==='budget')await budget(month());
 }
 if(token!==navEpoch||active!==k)return;
 if(save)choose(k);
 // Mount only inside the already-active native tab after its original data renderer.
 if(page()?.classList.contains('active'))window.RESANTA_TRIOVIST_NATIVE_SECTIONS_V1?.mount?.(k,ctx);
}
async function getMonth(m){return rpc('triovist_commercial_get_month',{p_month:first(m)})}
const monthInput=(k,m)=>`<div><label class="form-label" for="tr14-month-${k}">Месяц</label><input id="tr14-month-${k}" class="form-input" type="month" data-tr14-month="${k}" value="${esc(String(m||month()).slice(0,7))}"></div>`;
function docs(r,write){const x=(r.documents||[]).map(d=>`<button class="btn-secondary" data-tr14-doc="${esc(d.storage_path)}">📎 ${esc(d.file_name)}</button>`).join('')||'<span class="tr14-note">нет документа</span>';return x+(write?` <label class="btn-secondary" style="cursor:pointer">＋ документ<input hidden type="file" data-tr14-attach="${esc(r.id)}"></label>`:'')}
async function expense(kind,m){
 if(active!==kind)return;
 const request=++commerceRequest,token=navEpoch;
 const d=await getMonth(m);
 if(request!==commerceRequest||token!==navEpoch||active!==kind)return;
 const rows=(d.expenses||[]).filter(x=>x.expense_type===kind);
 const sum=rows.reduce((total,row)=>total+Number(row.amount||0),0);
 const write=!!d.can_write_expenses;
 const title=kind==='anp'?'АНП':'Компенсация СИ';
 panel.innerHTML=`
  <section class="tr14-commerce">
    <header class="tr14-sec"><div><h2>${title}</h2>
      <p class="tr14-note">${write?'Внесение расходов и документов.':'Просмотр.'}</p></div>${monthInput(kind,d.month)}</header>
    <div class="tr14-k">
      <div><span>${kind==='anp'?'АНП':'СИ'} за месяц</span><b>${money(sum)}</b></div>
      <div><span>АНП + СИ факт</span><b>${money(d.expenses_total)}</b></div>
      <div><span>Документов</span><b>${Number(d.documents_count||0)}</b></div>
      <div><span>Доступ</span><b>${write?'Внесение':'Просмотр'}</b></div>
    </div>
    ${write?`<div class="tr14-form">
      <div><label class="form-label" for="tr14-date">Дата</label><input id="tr14-date" class="form-input" type="date" value="${esc(String(d.month).slice(0,7)+'-01')}"></div>
      <div><label class="form-label" for="tr14-amount">Сумма, BYN</label><input id="tr14-amount" class="form-input" type="number" min="0" step="0.01"></div>
      <div><label class="form-label" for="tr14-comment">Комментарий</label><input id="tr14-comment" class="form-input"></div>
      <button class="btn-primary" type="button" data-tr14-save="${kind}">Сохранить</button>
    </div>`:'<p class="tr14-note">Без права изменения.</p>'}
    <div class="tr14-commerce-card tr14-table-wrap"><table class="tr14-table">
      <thead><tr><th>Дата</th><th>Сумма</th><th>Комментарий</th><th>Кто внёс</th><th>Документы</th></tr></thead>
      <tbody>${rows.length?rows.map(r=>`<tr><td>${esc(r.expense_date)}</td><td><b>${money(r.amount)}</b></td><td>${esc(r.comment||'—')}</td><td>${esc(r.created_by||'—')}</td><td>${docs(r,write)}</td></tr>`).join(''):'<tr><td colspan="5">За выбранный месяц расходов нет.</td></tr>'}</tbody>
    </table></div>
  </section>`;
}
async function budget(m){
  if(active!=='budget')return;
  const request=++commerceRequest,token=navEpoch;
  const d=await getMonth(m);
  if(request!==commerceRequest||token!==navEpoch||active!=='budget')return;
  const net=Number(d.sales_revenue_ex_vat||Number(d.sales_revenue||0)/1.2),
        accrual=Number(d.budget_month_accrual??(Math.round(net*.015*100)/100)),
        opening=Number(d.budget_opening_balance??d.budget_amount??0),
        spent=Number(d.budget_expenses_month_total||0),
        spentBefore=Number(d.budget_expenses_previous_total||0),
        total=Number(d.budget_available_total??(Math.round((opening+accrual-spent)*100)/100)),
        who=d.budget_updated_name||d.budget_updated_by||'—',
        carried=!!d.budget_is_carried,
        rows=Array.isArray(d.budget_expense_rows)?d.budget_expense_rows:[],
        anchorMonth=String(d.budget_anchor_month||'').slice(0,7),
        anchorLabel=anchorMonth?new Date(anchorMonth+'-01T00:00:00Z').toLocaleDateString('ru-RU',{timeZone:'UTC',month:'long',year:'numeric'}):'прошлого периода',
        ym=String(d.month||m).slice(0,7),
        todayMinsk=new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Minsk'}),
        dayForInput=todayMinsk.slice(0,7)===ym?todayMinsk:new Date(Date.UTC(Number(ym.slice(0,4)),Number(ym.slice(5,7)),0)).toISOString().slice(0,10),
        canAdd=!!d.is_leader&&!!d.budget_exists&&dayForInput<=todayMinsk,
        base=Number(d.budget_anchor_amount??d.budget_amount??opening);
  const audit=d.budget_exists
    ?`<p><b>${carried?'Базовый остаток перенесён автоматически.':'Базовый остаток.'}</b>
       ${money(base)} · ${esc(anchorLabel)}<br>Последнее изменение · ${esc(budgetDt(d.budget_updated_at))} · ${esc(who)}.</p>
       ${spentBefore>0?'<p>Ранее внесённые списания бюджета · '+money(spentBefore)+'.</p>':''}`
    :'';
  const rowsHtml=rows.map(r=>{
    const cancelled=!!r.voided_at;
    return `<tr${cancelled?' style="opacity:.65"':''}>
      <td>${esc(r.expense_date)}</td>
      <td><b>${money(r.amount)}</b></td>
      <td>${esc(r.description||'—')}</td>
      <td>${esc(r.created_by_name||r.created_by||'—')}<br><span class="tr14-note">${esc(budgetDt(r.created_at))}</span></td>
      <td>${cancelled?'<b>Отменён</b><br><span class="tr14-note">'+esc(r.void_reason||'')+'</span>':d.is_leader?'<button class="btn-secondary" type="button" data-tr14-budget-void="'+esc(r.id)+'">Отменить</button>':'Учтён'}</td>
    </tr>`;
  }).join('');

  panel.innerHTML=`
    <section class="tr14-commerce" aria-labelledby="tr14-budget-title">
      <header class="tr14-sec">
        <div class="tr14-budget-heading">
          <h2 id="tr14-budget-title">Бюджет Triovist</h2>
          <div class="tr14-budget-help">
            <button type="button" aria-label="Расчёт и история бюджета" aria-controls="tr14-budget-popover" aria-expanded="false" data-tr14-budget-help>*</button>
            <aside id="tr14-budget-popover" class="tr14-budget-popover" tabindex="0" aria-label="Расчёт и история бюджета">
              <p>Остаток переносится автоматически. Новые списания из этого раздела уменьшают доступный бюджет.</p>
              <p><b>Расчёт за месяц</b><br>${money(opening)} перенесено + ${money(accrual)} начислено (1,5%) − ${money(spent)} списано.</p>
              ${audit}
              ${d.budget_comment?`<p><b>Комментарий к базовому остатку</b><br><span class="tr14-budget-comment">${esc(d.budget_comment)}</span></p>`:''}
              ${carried?'<p><b>Ручной перенос не требуется.</b> CRM уже перенесла остаток автоматически.</p>':''}
              <p>Затраты из бюджета ведутся в отдельном журнале. Расходы, уже учтённые в базовом остатке, и записи в АНП и СИ повторно автоматически не списываются.</p>
            </aside>
          </div>
        </div>
        ${monthInput('budget',d.month)}
      </header>
      <div class="tr14-commerce-card tr14-budget-value${total<0?' over':''}">
        <span>${total<0?'Перерасход бюджета':'Доступный остаток'}</span>
        <strong>${money(Math.abs(total))}</strong>
      </div>
      ${d.budget_exists?'':'<p class="tr14-warn" role="status">Базовый остаток бюджета ещё не задан.</p>'}
      ${d.is_leader&&!carried?`
        <details class="tr14-commerce-card tr14-budget-base">
          <summary>${d.budget_exists?'Изменить базовый остаток':'Задать базовый остаток'}</summary>
          <div class="tr14-form">
            <div><label class="form-label" for="tr14-budget-amount">Базовый остаток, BYN</label><input id="tr14-budget-amount" class="form-input" type="number" min="0" step="0.01" value="${base.toFixed(2)}"></div>
            <div><label class="form-label" for="tr14-budget-comment">Комментарий</label><input id="tr14-budget-comment" class="form-input" value="${esc(d.budget_comment||'')}"></div>
            <button class="btn-primary" type="button" data-tr14-budget-save>Сохранить базу</button>
          </div>
        </details>`:''}
      <section class="tr14-commerce-card" aria-labelledby="tr14-budget-journal">
        <h3 id="tr14-budget-journal">Затраты из бюджета · ${esc(ym)}</h3>
        ${canAdd?`
          <div class="tr14-form">
            <div><label class="form-label" for="tr14-budget-expense-date">Дата расхода</label><input class="form-input" id="tr14-budget-expense-date" type="date" min="${esc(ym)}-01" max="${esc(todayMinsk)}" value="${esc(dayForInput)}"></div>
            <div><label class="form-label" for="tr14-budget-expense-amount">Сумма, BYN</label><input class="form-input" id="tr14-budget-expense-amount" type="number" step="0.01" min="0.01" placeholder="0,00"></div>
            <div><label class="form-label" for="tr14-budget-expense-description">На что потратили</label><input class="form-input" id="tr14-budget-expense-description" maxlength="1000"></div>
            <button class="btn-primary" type="button" data-tr14-budget-expense-save>Внести затрату</button>
          </div>`:
          d.is_leader?`<p class="tr14-note">Для списания выберите месяц с действующим базовым остатком, не позже текущего.</p>`:''}
        <div class="tr14-table-wrap">
          <table class="tr14-table"><thead><tr><th>Дата</th><th>Сумма</th><th>Назначение</th><th>Кто и когда внёс</th><th>Действие</th></tr></thead>
            <tbody>${rowsHtml||'<tr><td colspan="5" class="tr14-note">Затрат по бюджету за выбранный месяц ещё нет.</td></tr>'}</tbody>
          </table>
        </div>
      </section>
    </section>
  `;
}
async function saveExpense(kind){const d=document.getElementById('tr14-date')?.value,a=Number(document.getElementById('tr14-amount')?.value),c=document.getElementById('tr14-comment')?.value||'';if(!d||!(a>=0))throw Error('Укажите дату и сумму');await rpc('triovist_commercial_save_expense',{p_id:null,p_type:kind,p_expense_date:d,p_amount:a,p_comment:c});await expense(kind,document.querySelector(`[data-tr14-month="${kind}"]`)?.value||month())}
function storagePath(id,f){let ext=(String(f.name||'').toLowerCase().match(/\.([a-z0-9]{1,10})$/)||[])[1];if(!ext)ext=({'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'xlsx','application/vnd.ms-excel':'xls','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx','application/msword':'doc'}[f.type]||'bin');return `${id}/${Date.now()}_${Math.random().toString(36).slice(2,9)}_document.${ext}`}
async function attach(id,input){const f=input.files?.[0];if(!f)return;if(f.size>25*1024*1024)throw Error('Файл больше 25 МБ');const d=dbx(),path=storagePath(id,f),up=await d.storage.from('triovist-expense-docs').upload(path,f,{upsert:false,contentType:f.type||'application/octet-stream'});if(up.error)throw up.error;try{await rpc('triovist_commercial_attach_document',{p_expense_id:id,p_storage_path:path,p_file_name:f.name||'document',p_mime_type:f.type||null,p_size_bytes:f.size})}catch(e){try{await d.storage.from('triovist-expense-docs').remove([path])}catch(_){}throw e}await expense(active,document.querySelector(`[data-tr14-month="${active}"]`)?.value||month())}
async function openDoc(path){const r=await dbx().storage.from('triovist-expense-docs').createSignedUrl(path,900);if(r.error)throw r.error;if(!r.data?.signedUrl)throw Error('Ссылка не создана');window.open(r.data.signedUrl,'_blank','noopener')}
let budgetExpenseBusy=false;
async function addBudgetExpense(){
 if(budgetExpenseBusy)return;
 const dateInput=document.getElementById('tr14-budget-expense-date');
 const amountInput=document.getElementById('tr14-budget-expense-amount');
 const descriptionInput=document.getElementById('tr14-budget-expense-description');
 const b=document.querySelector('[data-tr14-budget-expense-save]');
 const date=dateInput?.value||'',raw=String(amountInput?.value||'').replace(',','.'),amount=Number(raw),description=String(descriptionInput?.value||'').trim();
 const m=document.querySelector('[data-tr14-month="budget"]')?.value||month();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date.slice(0,7)!==m)throw Error('Проверьте дату расхода и выбранный месяц');
 if(!raw||!Number.isFinite(amount)||amount<=0||Math.abs(Math.round(amount*100)-amount*100)>1e-6)throw Error('Введите положительную сумму в BYN с точностью до копеек');
 if(description.length<2)throw Error('Укажите, на что потрачены деньги');
 if(!window.crypto?.randomUUID)throw Error('Не удалось создать защищённый идентификатор операции. Обновите страницу.');
 const key=b?.dataset.requestId||(b.dataset.requestId=window.crypto.randomUUID());
 budgetExpenseBusy=true;if(b)b.disabled=true;
 try{
  await rpc('triovist_budget_add_expense',{p_request_id:key,p_expense_date:date,p_amount:amount,p_description:description});
  await budget(m);
 }finally{budgetExpenseBusy=false;if(b?.isConnected)b.disabled=false}
}
async function voidBudgetExpense(id){
 if(budgetExpenseBusy)return;
 const reason=window.prompt('Укажите причину отмены затратной записи (сама запись останется в истории):');
 if(reason===null)return;
 if(reason.trim().length<3)throw Error('Укажите причину отмены (не менее 3 символов)');
 const m=document.querySelector('[data-tr14-month="budget"]')?.value||month();
 budgetExpenseBusy=true;
 try{
  await rpc('triovist_budget_void_expense',{p_expense_id:id,p_reason:reason.trim()});
  await budget(m);
 }finally{budgetExpenseBusy=false}
}
async function saveBudget(){const a=Number(document.getElementById('tr14-budget-amount')?.value),c=document.getElementById('tr14-budget-comment')?.value||'',m=document.querySelector('[data-tr14-month="budget"]')?.value||month();if(!(a>=0))throw Error('Проверьте сумму');await rpc('triovist_commercial_set_budget',{p_month:first(m),p_amount:a,p_comment:c});await budget(m)}
function bind(){
 if(panel.dataset.bound)return;
 panel.dataset.bound='1';
 panel.addEventListener('change',async e=>{
  try{
   const m=e.target.closest('[data-tr14-month]');
   if(m){const kind=m.dataset.tr14Month;if(kind==='budget')await budget(m.value);else await expense(kind,m.value);return}
   const a=e.target.closest('[data-tr14-attach]');
   if(a){await attach(a.dataset.tr14Attach,a);a.value=''}
  }catch(error){alert(error.message||error)}
 });
 panel.addEventListener('click',async e=>{
  const tip=e.target.closest('[data-tr14-budget-help]');
  if(tip){setBudgetHelp(tip,tip.getAttribute('aria-expanded')!=='true');return}
  try{
   const s=e.target.closest('[data-tr14-save]');
   if(s){await saveExpense(s.dataset.tr14Save);return}
   const doc=e.target.closest('[data-tr14-doc]');
   if(doc){await openDoc(doc.dataset.tr14Doc);return}
   if(e.target.closest('[data-tr14-budget-expense-save]')){await addBudgetExpense();return}
   const v=e.target.closest('[data-tr14-budget-void]');
   if(v){await voidBudgetExpense(v.dataset.tr14BudgetVoid);return}
   if(e.target.closest('[data-tr14-budget-save]'))await saveBudget();
  }catch(error){alert(error.message||error)}
 });
 panel.addEventListener('keydown',e=>{
  const help=e.target.closest('.tr14-budget-help');
  if(e.key!=='Escape'||!help||help.hasAttribute('data-dismissed'))return;
  e.preventDefault();
  const tip=help.querySelector('[data-tr14-budget-help]');
  setBudgetHelp(tip,false);
  tip.focus();
 });
 panel.addEventListener('focusout',e=>{
  const help=e.target.closest('.tr14-budget-help');
  if(help&&!help.contains(e.relatedTarget))help.removeAttribute('data-dismissed');
 });
 panel.addEventListener('pointerover',e=>{
  const help=e.target.closest('.tr14-budget-help');
  if(help&&!help.contains(e.relatedTarget))help.removeAttribute('data-dismissed');
 });
}
function setBudgetHelp(button,open){
 const help=button.parentElement;
 button.setAttribute('aria-expanded',String(open));
 help.toggleAttribute('data-open',open);
 help.toggleAttribute('data-dismissed',!open);
}
async function ensure(){if(busy)return false;busy=true;try{if(!ctx){ctx=await context();if(!ctx)return false}css();return dom()}finally{busy=false}}
// Observe only the Triovist navigation state, never unrelated CRM DOM churn.
let observedPage=null;
function watch(){
 const p=page();if(!p)return;
 if(!mo){
  mo=new MutationObserver(()=>{
   ensure().then(async()=>{
    sync();
    if(pendingSalesRefresh&&page()?.classList.contains('active')&&(active==='home'||active==='sales')){
     pendingSalesRefresh=false;await refreshCurrent()
    }
   }).catch(e=>console.warn('Triovist view sync',e));
  });
  window.addEventListener('pageshow',()=>setTimeout(()=>{
   ensure().then(async()=>{
    watch();sync();subscribeSalesImport();
    if(pendingSalesRefresh&&page()?.classList.contains('active')&&(active==='home'||active==='sales')){
     pendingSalesRefresh=false;await refreshCurrent()
    }
   }).catch(()=>{})
  },80));
  document.addEventListener('visibilitychange',()=>{
   if(!document.hidden)setTimeout(()=>{
    ensure().then(async()=>{
     watch();sync();subscribeSalesImport();
     if(pendingSalesRefresh&&page()?.classList.contains('active')&&(active==='home'||active==='sales')){
      pendingSalesRefresh=false;await refreshCurrent()
     }
    }).catch(()=>{})
   },50)
  });
 }
 if(observedPage!==p){
  mo.disconnect();
  mo.observe(p,{attributes:true,attributeFilter:['class']});
  observedPage=p;
 }
}
// Reconcile visibility without reloading finance/budget content or losing typed inputs.
function resumeView(){
 if(document.hidden||!page()?.classList.contains('active')||!panel?.isConnected)return false;
 sync();return true;
}
async function start(){if(!await ensure())return false;watch();subscribeSalesImport();const preferred=remembered();active=preferred;try{await activate(preferred)}catch(e){console.warn('Triovist '+V+' saved tab failed, fallback to summary',e);try{localStorage.removeItem(STORE+'|'+(ctx?.email||''))}catch(_){}active='home';await activate('home')}sync();window.RESANTA_TRIOVIST_ROOT_V23614=Object.freeze({version:V,singleOwner:true,shellOutsidePage:true,asciiStorageKeys:true,originalFileNamePreserved:true,budgetExVat:true,managerTabRecovery:true,managerTabVisibilityRecovery:true,parserTab:true,directWorkspaceRouter:true,instantTabSwitch:true,sectionRefreshIsolation:true,navigationEpoch:true,lazyDataByTab:true,fastMonthlyTasks:true,singleMotivationSurface:true,forcedDirectCardVisibility:true,nonStickyMenu:true,separateSalesWorkspace:true,noLegacyButtonDependency:true,salesRealtimeRefresh:true,noSalesPolling:true,infographicPayushinOnly:true,infographicArchived:true,readOnlyResume:true,resumeView});console.info('RESANTA Triovist '+V+' ROOT',ctx);return true}
// Only one initialization (including the home RPC) may run at a time.
let n=0,bootPending=false;
const t=setInterval(async()=>{
 if(bootPending)return;
 bootPending=true;
 n++;
 try{
  if(nonTriovistProfileReady()){finishBoot();return}
  if(await start()||n>240)finishBoot()
 }catch(e){
  if(n>240)finishBoot();
 }finally{bootPending=false}
},250);
function finishBoot(){
 clearInterval(t);
 if(window.RESANTA_TRIOVIST_ROOT_BOOTING_V23614===V)delete window.RESANTA_TRIOVIST_ROOT_BOOTING_V23614;
}
})();