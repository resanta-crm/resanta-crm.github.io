/* RESANTA CRM v23.0.0
 * Triovist, routing, networks, commercial planning
 * Extracted from v22.7.32.2.17 without business-logic changes.
 * Original inline script range: 9-33
 */

/* ===== ORIGINAL INLINE SCRIPT 9 ===== */
// ============================================================================
// RESANTA CRM v22.7.31.5 · TRIOVIST SHARED DATA HUB
// Один in-flight запрос на тяжёлый источник. Все блоки Триовиста переиспользуют
// один и тот же результат вместо параллельных повторных RPC.
// ============================================================================
(function(){
'use strict';
if(window.TRIOVIST_DATA_HUB_V227315)return;
const VERSION='v22.7.31.5',cache=new Map(),TTL={sales:120000,stock:120000,tasks:30000,content:120000},ERROR_COOLDOWN=15000;
const counters={network:0,shared:0,cache:0,blocked:0};
function currentMonth(){const raw=String(window.TODAY||new Date().toISOString().slice(0,10));return raw.slice(0,7);}
function normalize(kind,args={}){
  if(kind==='sales'){const mode=String(args.p_mode||'month');return{p_end_month:String(args.p_end_month||currentMonth()).slice(0,7),p_mode:mode,p_start_month:mode==='custom'&&args.p_start_month?String(args.p_start_month).slice(0,7):null};}
  if(kind==='stock')return{p_target_days:Number(args.p_target_days)||45};
  if(kind==='tasks')return{p_manager_email:args.p_manager_email==null?null:String(args.p_manager_email).toLowerCase()};
  if(kind==='content')return{p_manager_email:args.p_manager_email==null?null:String(args.p_manager_email).toLowerCase()};
  return args||{};
}
function rpcName(kind){return{sales:'triovist_get_dashboard',stock:'triovist_get_stock_dashboard',tasks:'triovist_tasks_get_dashboard',content:'triovist_content_get_dashboard'}[kind];}
function timeoutFor(kind){return kind==='tasks'?60000:90000;}
function cacheKey(kind,args){return kind+'|'+JSON.stringify(normalize(kind,args));}
async function fetchRpc(kind,args){
  const name=rpcName(kind),payload=normalize(kind,args);if(!name)throw new Error('Неизвестный источник Триовиста: '+kind);
  counters.network++;let timer;const timeout=timeoutFor(kind);
  const wait=new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Сервер не ответил вовремя: '+name)),timeout));
  try{const r=await Promise.race([db.rpc(name,payload),wait]);if(r?.error)throw r.error;return r?.data;}finally{clearTimeout(timer);}
}
async function get(kind,args={},options={}){
  const key=cacheKey(kind,args),now=Date.now(),ttl=Number(options.ttl)||TTL[kind]||60000,e=cache.get(key);
  if(e?.promise){counters.shared++;return e.promise;}
  if(e&&Object.prototype.hasOwnProperty.call(e,'data')&&now-e.at<ttl){counters.cache++;return e.data;}
  if(e?.error&&e.errorUntil>now){counters.blocked++;throw e.error;}
  const promise=fetchRpc(kind,args).then(data=>{cache.set(key,{data,at:Date.now()});return data;}).catch(error=>{cache.set(key,{error,errorUntil:Date.now()+ERROR_COOLDOWN});throw error;});
  cache.set(key,{promise,startedAt:now});return promise;
}
function invalidate(...kinds){const set=new Set(kinds.flat().filter(Boolean));if(!set.size){cache.clear();return;}for(const key of [...cache.keys()])if(set.has(String(key).split('|',1)[0]))cache.delete(key);}
function info(){return{version:VERSION,entries:cache.size,...counters};}
window.TRIOVIST_DATA_HUB_V227315=Object.freeze({
  sales:(args,opts)=>get('sales',args,opts),stock:(args,opts)=>get('stock',args,opts),tasks:(args,opts)=>get('tasks',args,opts),content:(args,opts)=>get('content',args,opts),invalidate,info
});
window.RESANTA_TRIOVIST_PERF_V227315=Object.freeze({version:VERSION,singleFlight:true,sharedCache:true,errorCooldownMs:ERROR_COOLDOWN});
})();

/* ===== ORIGINAL INLINE SCRIPT 10 ===== */
// ============================================================================
// RESANTA CRM v22.0 · Триовист / 21vek.by
// Произвольные периоды, Excel-выгрузка, остатки 21vek/Витебск/Чехов,
// рекомендации заказа и последняя отгрузка по доступной месячной истории.
(function(){
  'use strict';
  const TRI_VERSION='22.0.3',TRI_SCOPE='triovist',TRI_CLIENT='ООО Триовист';
  const TRI_ALEKS_EMAIL='aleksandrenko_av@resanta.ru',TRI_KRISHTAL_EMAIL='krishtal_na@resanta.ru';
  const TRI_LEADER_EMAILS=Object.freeze(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
  let triItems=[],triAssignments=[],triPeriodPlans=[],triSelectedMonthPlans=[],triHistory={},triDashboard=null;
  let triStockItems=[],triStockMeta={},triStockDays=45,triStockError='',triLoading=false,triLoaded=false;
  const triNorm=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,' ').trim();
  const triCompact=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,'');
  const triNum=v=>Number(v)||0,triEmail=()=>String(currentProfile?.email||currentUser?.email||'').trim().toLowerCase();
  const triIsBoss=()=>currentProfile?.role==='boss'&&TRI_LEADER_EMAILS.includes(triEmail());
  const triIsManager=()=>String(currentProfile?.access_scope||'').toLowerCase()===TRI_SCOPE;
  const triCanSee=()=>triIsBoss()||triIsManager();
  const triCanUploadStock=()=>triIsBoss()||(triIsManager()&&[TRI_ALEKS_EMAIL,TRI_KRISHTAL_EMAIL].includes(triEmail()));
  const triManagerName=e=>String(e||'').toLowerCase()===TRI_ALEKS_EMAIL?'Александренко':String(e||'').toLowerCase()===TRI_KRISHTAL_EMAIL?'Кришталь':'Не распределено';
  const triCents=v=>Math.round((Number(v)||0)*100),triMoney=v=>(triCents(v)/100).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
  const triQty=v=>(Number(v)||0).toLocaleString('ru-RU',{maximumFractionDigits:3});
  const triPct=(c,p)=>p>0?((c-p)/p*100):c>0?100:0;
  const triStatus=(c,p)=>p<=0&&c>0?'new':p>0&&c<=0?'lost':p>0&&c<p?'falling':c>=p&&p>0?'growth':'none';
  const triStatusHtml=(c,p)=>{const s=triStatus(c,p),pct=triPct(c,p);if(s==='lost')return'<span class="tri-status tri-lost">Потеря</span>';if(s==='falling')return'<span class="tri-status tri-falling">Падение '+Math.abs(pct).toFixed(1)+'%</span>';if(s==='growth')return'<span class="tri-status tri-growth">Рост +'+pct.toFixed(1)+'%</span>';if(s==='new')return'<span class="tri-status tri-new">Новые продажи</span>';return'<span class="tri-status tri-none">Без продаж</span>';};
  const triDateTime=v=>{if(!v)return'—';try{return new Date(v).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(_){return String(v);}};

  function triSearchValue(){const el=document.getElementById('tri-search');if(!el)return'';const raw=String(el.value||'').trim();if(raw.includes('@')||/resanta\.ru/i.test(raw)||raw.toLowerCase()===triEmail()){el.value='';return'';}return triNorm(raw);}
  window.triovistClearUnexpectedAutofill=function(){const el=document.getElementById('tri-search');if(!el)return false;const raw=String(el.value||'').trim();if(raw.includes('@')||/resanta\.ru/i.test(raw)||raw.toLowerCase()===triEmail()){el.value='';return true;}return false;};

  function triInjectCss(){if(document.getElementById('triovist-v22-style'))return;const s=document.createElement('style');s.id='triovist-v22-style';s.textContent=`
    .tri-toolbar{display:grid;grid-template-columns:180px 170px 170px minmax(180px,1fr) minmax(180px,1fr);gap:10px;align-items:end}.tri-kpis{display:grid;grid-template-columns:repeat(5,minmax(140px,1fr));gap:10px;margin:12px 0}.tri-kpi{background:#fff;border:1px solid var(--border);border-radius:12px;padding:13px}.tri-kpi-label{font-size:10px;color:var(--sub);text-transform:uppercase;font-weight:700}.tri-kpi-value{font-size:21px;font-weight:800;margin-top:5px}.tri-kpi-sub{font-size:10px;color:var(--sub);margin-top:3px}
    .tri-manager-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:12px}.tri-manager-card{background:#fff;border:1px solid var(--border);border-radius:12px;padding:14px}.tri-manager-head{display:flex;justify-content:space-between;gap:10px}.tri-manager-name{font-size:16px;font-weight:800}.tri-manager-email,.tri-note{font-size:11px;color:var(--sub);line-height:1.5}.tri-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}.tri-metric{background:var(--bg);border-radius:9px;padding:9px}.tri-metric b{display:block;font-size:14px}.tri-metric span{font-size:9px;color:var(--sub);text-transform:uppercase}
    .tri-table-wrap{overflow:auto;border:1px solid var(--border);border-radius:10px}.tri-table{width:100%;border-collapse:collapse;min-width:980px;font-size:12px}.tri-table th{background:var(--bg);color:var(--sub);font-size:10px;text-transform:uppercase;text-align:left;padding:9px;border-bottom:1px solid var(--border);white-space:nowrap}.tri-table td{padding:9px;border-bottom:1px solid var(--border);vertical-align:top}.tri-clickable{cursor:pointer}.tri-clickable:hover{background:#F8FAFC}.tri-open-btn{border:1px solid var(--border);background:#fff;border-radius:7px;padding:5px 8px;color:var(--a);cursor:pointer;font-weight:700}
    .tri-status{display:inline-flex;border-radius:99px;padding:3px 8px;font-size:10px;font-weight:800;white-space:nowrap}.tri-lost{background:#FEE2E2;color:#B91C1C}.tri-falling{background:#FFEDD5;color:#C2410C}.tri-growth{background:#DCFCE7;color:#166534}.tri-new{background:#DBEAFE;color:#1D4ED8}.tri-none{background:#F3F4F6;color:#6B7280}.tri-alert-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.tri-alert-card{background:#fff;border:1px solid var(--border);border-radius:12px;padding:14px}.tri-alert-row{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px}
    .tri-assignment-row{display:grid;grid-template-columns:minmax(210px,1fr) 220px;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)}.tri-warning{background:#FFF7ED;border:1px solid #FDBA74;color:#9A3412;border-radius:10px;padding:10px 12px;font-size:11px;margin-bottom:12px}.tri-ok{background:#ECFDF5;border:1px solid #86EFAC;color:#166534;border-radius:10px;padding:10px 12px;font-size:11px;margin-bottom:12px}.tri-empty{text-align:center;color:var(--sub);padding:26px}.tri-my-groups{display:flex;flex-wrap:wrap;gap:8px}.tri-group-chip{padding:8px 11px;border-radius:9px;background:#EFF6FF;border:1px solid #BFDBFE;color:#1E3A8A;font-size:12px;font-weight:700}.tri-plan-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.tri-plan-box{border:1px solid var(--border);border-radius:10px;padding:12px;background:var(--bg)}.tri-plan-actions{display:flex;justify-content:flex-end;margin-top:10px}
    .tri-stock-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:end}.tri-stock-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:8px;margin:10px 0}.tri-stock-kpi{background:var(--bg);padding:10px;border-radius:9px}.tri-stock-kpi b{display:block;font-size:14px;margin-top:3px}.tri-stock-table{min-width:1550px}.tri-rec{font-weight:800;color:#9A3412}.tri-uncovered{font-weight:800;color:var(--r)}
    @media(max-width:1100px){.tri-toolbar{grid-template-columns:repeat(2,minmax(0,1fr))}.tri-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.tri-stock-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.tri-manager-grid,.tri-alert-grid,.tri-plan-grid{grid-template-columns:1fr}.tri-toolbar,.tri-stock-grid{grid-template-columns:1fr}.tri-metrics{grid-template-columns:1fr}.tri-assignment-row{grid-template-columns:1fr}}
  `;document.head.appendChild(s);}

  function triInjectUi(){triInjectCss();if(!document.getElementById('nav-triovist')){const n=document.createElement('button');n.className='nav-item';n.id='nav-triovist';n.style.display='none';n.setAttribute('onclick',"goPage('triovist','Триовист / 21vek.by')");n.innerHTML='<span class="icon">🏬</span> Триовист / 21vek.by';const sec=document.getElementById('nav-section-boss');(sec?.parentNode||document.querySelector('.sidebar'))?.insertBefore(n,sec||null);}if(!document.getElementById('bn-triovist')){const b=document.createElement('button');b.className='bn-item';b.id='bn-triovist';b.style.display='none';b.setAttribute('onclick',"goPage('triovist','Триовист / 21vek.by')");b.innerHTML='🏬<span>Триовист</span>';document.querySelector('.bottom-nav')?.appendChild(b);}if(document.getElementById('page-triovist'))document.getElementById('page-triovist').remove();
    const page=document.createElement('div');page.className='page';page.id='page-triovist';page.innerHTML=`
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px"><div><div class="page-title" style="margin-bottom:3px">🏬 Триовист / 21vek.by</div><div class="tri-note">Клиент: <b>${TRI_CLIENT}</b> · суммы с НДС и до копейки</div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-secondary" onclick="triovistExportProblems()">⬇ Excel: падение SKU</button><button class="btn-secondary" onclick="triovistReload()">↻ Обновить экран</button></div></div>
      <div id="triovist-warning"></div>
      <div class="card" style="margin-bottom:12px"><div class="tri-toolbar">
        <div><label class="form-label">Период</label><select class="form-input" id="tri-period-mode" onchange="triovistPeriodModeChanged()"><option value="month">Выбранный месяц</option><option value="ytd">С начала года</option><option value="custom">Произвольный диапазон</option></select></div>
        <div id="tri-start-wrap" style="display:none"><label class="form-label">Месяц начала</label><input class="form-input" type="month" id="tri-period-start" onchange="triovistPeriodChanged()"></div>
        <div><label class="form-label">Месяц окончания</label><input class="form-input" type="month" id="tri-period-month" onchange="triovistPeriodChanged()"></div>
        <div id="tri-manager-filter-wrap"><label class="form-label">Менеджер</label><select class="form-input" id="tri-manager-filter" onchange="renderTriovist()"><option value="all">Оба менеджера</option><option value="${TRI_ALEKS_EMAIL}">Александренко</option><option value="${TRI_KRISHTAL_EMAIL}">Кришталь</option></select></div>
        <div><label class="form-label">Поиск</label><input class="form-input" type="search" id="tri-search" autocomplete="off" data-lpignore="true" placeholder="Группа, SKU или товар" oninput="renderTriovist()"></div>
      </div><div class="tri-note" id="tri-period-note" style="margin-top:9px"></div></div>
      <div id="tri-kpis" class="tri-kpis"></div><div id="tri-manager-cards" class="tri-manager-grid"></div>
      <div class="card" id="tri-plans-card" style="display:none;margin-bottom:12px"><div class="card-title">Планы на выбранный месяц</div><div id="tri-plan-editor" class="tri-plan-grid"></div><div class="tri-plan-actions"><button class="btn-primary" onclick="triovistSavePlans()">Сохранить планы</button></div></div>
      <div class="card" id="tri-my-groups-card" style="display:none;margin-bottom:12px"><div class="card-title">Мои закреплённые товарные группы</div><div id="tri-my-groups"></div></div>
      <div class="card" style="margin-bottom:12px"><div class="card-title">Продажи по товарным группам</div><div class="tri-note" style="margin-bottom:8px">Нажмите «Открыть», чтобы перейти к SKU.</div><div id="tri-groups"></div></div>
      <div id="tri-alerts" class="tri-alert-grid"></div><div class="card" style="margin-top:12px"><div class="card-title">Подгруппы и SKU</div><div id="tri-details"></div></div>
      <div class="card" id="tri-stock-card" style="margin-top:12px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><div class="card-title">Остатки и рекомендации заказа</div><div class="tri-note">21vek и Чехов загружаются вручную Паюшиным, Сидоровичем, Александренко или Кришталь. Наш склад Витебск обновляется автоматически. Рекомендация = запас на выбранное число дней + заказы 21vek − текущий остаток 21vek. Последняя отгрузка сейчас доступна с точностью до месяца.</div></div><div class="tri-stock-tools"><div><label class="form-label">Запас, дней</label><select class="form-input" id="tri-stock-days" onchange="triovistStockDaysChanged()"><option>10</option><option>20</option><option>30</option><option selected>45</option><option>60</option><option>90</option></select></div><div><label class="form-label">Поиск</label><input class="form-input" id="tri-stock-search" placeholder="SKU или товар" oninput="renderTriovistStock()"></div><button class="btn-secondary" onclick="triovistExportStock()">⬇ Excel</button><button class="btn-secondary tri-stock-upload" data-source="partner" style="display:none" onclick="document.getElementById('tri-partner-file').click()">Загрузить остатки 21vek</button><button class="btn-secondary tri-stock-upload" data-source="chekhov" style="display:none" onclick="document.getElementById('tri-chekhov-file').click()">Загрузить остатки Чехова</button></div></div><input hidden type="file" id="tri-partner-file" accept=".xlsx" onchange="triovistUploadStock('partner',event)"><input hidden type="file" id="tri-chekhov-file" accept=".xlsx" onchange="triovistUploadStock('chekhov',event)"><div id="tri-stock-upload-status" class="tri-note" style="display:none;margin-top:10px;padding:9px 11px;border-radius:8px;background:#EFF6FF;border:1px solid #BFDBFE"></div><div id="tri-stock-meta"></div><div id="tri-stock-table"></div></div>
      <div class="card" id="tri-assignments-card" style="display:none;margin-top:12px"><div class="card-title">Закрепление товарных групп</div><div id="tri-assignments"></div></div>`;
    document.getElementById('main-content')?.appendChild(page);
  }

  function triApplyAccessUi(){const nav=document.getElementById('nav-triovist'),bn=document.getElementById('bn-triovist');if(nav)nav.style.display=triCanSee()?'flex':'none';if(bn)bn.style.display=triCanSee()?'flex':'none';if(triIsManager()){document.querySelectorAll('.sidebar .nav-item').forEach(x=>x.style.display=x.id==='nav-triovist'?'flex':'none');document.querySelectorAll('.sidebar .nav-section').forEach(x=>x.style.display='none');document.querySelectorAll('.bottom-nav .bn-item').forEach(x=>x.style.display=x.id==='bn-triovist'?'flex':'none');const mf=document.getElementById('tri-manager-filter-wrap');if(mf)mf.style.display='none';const sel=document.getElementById('tri-manager-filter');if(sel)sel.value=triEmail();const tt=document.getElementById('topbar-title');if(tt)tt.textContent='Триовист / 21vek.by';}else{const mf=document.getElementById('tri-manager-filter-wrap');if(mf)mf.style.display=triIsBoss()?'block':'none';}const show=triIsBoss();['tri-assignments-card','tri-plans-card'].forEach(id=>{const x=document.getElementById(id);if(x)x.style.display=show?'block':'none';});document.querySelectorAll('.tri-stock-upload').forEach(x=>x.style.display=triCanUploadStock()?'inline-flex':'none');const mg=document.getElementById('tri-my-groups-card');if(mg)mg.style.display=triIsManager()?'block':'none';}
  const triSelectedEnd=()=>document.getElementById('tri-period-month')?.value||'';
  const triSelectedStart=()=>document.getElementById('tri-period-start')?.value||'';
  const triSelectedMode=()=>document.getElementById('tri-period-mode')?.value||'month';
  window.triovistPeriodModeChanged=function(){const custom=triSelectedMode()==='custom';const w=document.getElementById('tri-start-wrap');if(w)w.style.display=custom?'block':'none';if(custom&&!triSelectedStart()){const end=triSelectedEnd();document.getElementById('tri-period-start').value=end?end.slice(0,4)+'-01':'';}triovistPeriodChanged();};
  window.triovistPeriodChanged=async function(){await triovistReload();};

  async function triLoadData(){if(!triCanSee()){triLoaded=true;return;}triLoading=true;try{const payload={p_end_month:triSelectedEnd()||null,p_mode:triSelectedMode(),p_start_month:triSelectedMode()==='custom'?(triSelectedStart()||null):null};const hub=window.TRIOVIST_DATA_HUB_V227315;const [dashboard,a]=await Promise.all([withTimeout(hub.sales(payload),95000,'аналитика Триовист'),withTimeout(db.from('triovist_group_assignments').select('*').eq('active',true).order('priority').order('group_name'),20000,'закрепление групп')]);if(a.error)throw a.error;triDashboard=dashboard||{};triItems=Array.isArray(triDashboard.items)?triDashboard.items:[];triPeriodPlans=triDashboard.period_plans||[];triSelectedMonthPlans=triDashboard.selected_month_plans||[];triHistory=triDashboard.history||{};triAssignments=a.data||[];const e=document.getElementById('tri-period-month');if(e&&!e.value)e.value=triDashboard.end_month||'';const st=document.getElementById('tri-period-start');if(st&&!st.value)st.value=triDashboard.current_from||'';triLoaded=true;}finally{triLoading=false;}}
  async function triLoadStock(){triStockError='';try{const hub=window.TRIOVIST_DATA_HUB_V227315,d=await withTimeout(hub.stock({p_target_days:Number(document.getElementById('tri-stock-days')?.value)||45}),95000,'остатки Триовиста');const data=d||{};triStockItems=Array.isArray(data.items)?data.items:[];triStockMeta=data.imports||{};triStockDays=Number(data.target_days)||45;const s=document.getElementById('tri-stock-days');if(s)s.value=String(triStockDays);}catch(e){triStockItems=[];triStockError=e.message||String(e);}}
  window.crmPrefetchTriovistV22734=async function(){if(!triCanSee())return false;try{await Promise.allSettled([triLoadData(),triLoadStock()]);return true;}catch(_){return false;}};
  window.triovistReload=async function(){try{window.TRIOVIST_DATA_HUB_V227315?.invalidate('sales','stock','tasks','content');triLoaded=false;renderTriovist();await Promise.all([triLoadData(),triLoadStock()]);renderTriovist();}catch(e){console.error(e);const w=document.getElementById('triovist-warning');if(w)w.innerHTML='<div class="tri-warning">Не удалось загрузить Триовист: '+esc(e.message||String(e))+'</div>';}};

  function triPeriodLabel(){const cf=triDashboard?.current_from,ct=triDashboard?.current_to,pf=triDashboard?.previous_from,pt=triDashboard?.previous_to;return{label:cf===ct?'месяц '+ct:cf+' — '+ct,prevLabel:pf===pt?'месяц '+pt:pf+' — '+pt};}
  function triFilteredItems(){let mgr=document.getElementById('tri-manager-filter')?.value||'all';if(triIsManager())mgr=triEmail();const q=triSearchValue();return triItems.filter(r=>(mgr==='all'||String(r.manager_email||'').toLowerCase()===mgr)&&(!q||triNorm([r.assigned_group,r.category,r.subgroup,r.sku,r.product].join(' ')).includes(q)));}
  function triAggregate(items,keyFn){const m=new Map();items.forEach(r=>{const k=keyFn(r);if(!k)return;if(!m.has(k))m.set(k,{key:k,curCents:0,prevCents:0,qtyCur:0,qtyPrev:0,manager_email:r.manager_email||'',manager_name:r.manager_name||triManagerName(r.manager_email),group:r.assigned_group||r.category||'Не распределено',subgroup:r.subgroup||'Прочее',sku:r.sku||'',product:r.product||'Без наименования'});const x=m.get(k);x.curCents+=triCents(r.current_revenue);x.prevCents+=triCents(r.previous_revenue);x.qtyCur+=triNum(r.current_qty);x.qtyPrev+=triNum(r.previous_qty);});return[...m.values()].map(x=>({...x,cur:x.curCents/100,prev:x.prevCents/100}));}
  const triPlanFor=e=>{const x=triPeriodPlans.find(p=>String(p.manager_email||'').toLowerCase()===e);return x?.plan_amount==null?null:triCents(x.plan_amount)/100;};
  const triSelectedPlanFor=e=>{const x=triSelectedMonthPlans.find(p=>String(p.manager_email||'').toLowerCase()===e);return x?.plan_amount==null?'':(triCents(x.plan_amount)/100).toFixed(2).replace('.',',');};
  function triManagerSummary(items,e){const x=triAggregate(items.filter(r=>String(r.manager_email||'').toLowerCase()===e),()=>e)[0]||{cur:0,prev:0};return{...x,email:e,name:triManagerName(e),plan:triPlanFor(e)};}
  function triRenderPlanEditor(){const root=document.getElementById('tri-plan-editor');if(!root||!triIsBoss())return;const month=triDashboard?.end_month||triSelectedEnd();root.innerHTML=[TRI_ALEKS_EMAIL,TRI_KRISHTAL_EMAIL].map(e=>'<div class="tri-plan-box"><label class="form-label">'+triManagerName(e)+' · '+esc(month)+'</label><input class="form-input tri-plan-input" inputmode="decimal" data-email="'+e+'" value="'+escAttr(triSelectedPlanFor(e))+'" placeholder="0,00"></div>').join('');}
  window.triovistSavePlans=async function(){if(!triIsBoss())return;const month=triDashboard?.end_month||triSelectedEnd();try{for(const input of document.querySelectorAll('.tri-plan-input')){const raw=String(input.value||'').trim().replace(/\s/g,'').replace(',','.');if(raw==='')continue;const n=Number(raw);if(!Number.isFinite(n)||n<0)throw new Error('Некорректный план');const r=await db.rpc('triovist_set_plan',{p_manager_email:input.dataset.email,p_period_month:month,p_plan_amount:Math.round(n*100)/100});if(r.error)throw r.error;}alert('✅ Планы сохранены');await triovistReload();}catch(e){alert('Не удалось сохранить планы: '+(e.message||e));}};
  function triRenderMyGroups(){const root=document.getElementById('tri-my-groups');if(!root||!triIsManager())return;const rows=triAssignments.filter(a=>String(a.manager_email).toLowerCase()===triEmail());root.className='tri-my-groups';root.innerHTML=rows.map(a=>'<span class="tri-group-chip">'+esc(a.group_name)+'</span>').join('')||'<div class="tri-empty">Группы не закреплены.</div>';}
  function triRenderAssignments(){const root=document.getElementById('tri-assignments');if(!root||!triIsBoss())return;root.innerHTML=triAssignments.map(a=>'<div class="tri-assignment-row"><div><b>'+esc(a.group_name)+'</b></div><select class="form-input" onchange="triovistChangeAssignment(\''+escAttr(a.id)+'\',this.value)" '+(Number(a.priority)===1?'disabled':'')+'><option value="'+TRI_ALEKS_EMAIL+'" '+(String(a.manager_email).toLowerCase()===TRI_ALEKS_EMAIL?'selected':'')+'>Александренко</option><option value="'+TRI_KRISHTAL_EMAIL+'" '+(String(a.manager_email).toLowerCase()===TRI_KRISHTAL_EMAIL?'selected':'')+'>Кришталь</option></select></div>').join('');}
  window.triovistChangeAssignment=async function(id,email){if(!triIsBoss())return;const r=await db.from('triovist_group_assignments').update({manager_email:email,manager_name:triManagerName(email),updated_at:new Date().toISOString()}).eq('id',id);if(r.error)alert(r.error.message);await triovistReload();};
  window.triovistOpenGroup=i=>{const e=document.getElementById('tri-detail-'+i);if(e){e.open=true;setTimeout(()=>e.scrollIntoView({behavior:'smooth',block:'start'}),30);}};

  async function triEnsureXlsx(){if(window.XLSX)return window.XLSX;if(typeof window._loadSheetJS==='function')return window._loadSheetJS();return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=()=>resolve(window.XLSX);s.onerror=()=>reject(new Error('Не удалось загрузить модуль Excel'));document.head.appendChild(s);});}
  function triExportBook(sheets,filename){triEnsureXlsx().then(X=>{const wb=X.utils.book_new();sheets.forEach(x=>X.utils.book_append_sheet(wb,X.utils.json_to_sheet(x.rows),x.name));X.writeFile(wb,filename);}).catch(e=>alert(e.message||e));}
  window.triovistExportProblems=function(){const items=triFilteredItems(),products=triAggregate(items,r=>(r.manager_email||'')+'|'+(r.assigned_group||r.category||'')+'|'+(r.sku||r.product||''));const row=x=>({'Менеджер':x.manager_name,'Товарная группа':x.group,'Подгруппа':x.subgroup,'Артикул':x.sku,'Товар':x.product,'Текущий период, BYN':x.cur.toFixed(2),'Прошлый период, BYN':x.prev.toFixed(2),'Потерянный оборот, BYN':Math.max(0,x.prev-x.cur).toFixed(2),'Изменение, %':triPct(x.cur,x.prev).toFixed(1),'Статус':triStatus(x.cur,x.prev)==='lost'?'Потерянный SKU':'Падающий SKU'});const falling=products.filter(x=>triStatus(x.cur,x.prev)==='falling').map(row),lost=products.filter(x=>triStatus(x.cur,x.prev)==='lost').map(row);triExportBook([{name:'Падающие SKU',rows:falling},{name:'Потерянные SKU',rows:lost}],`Триовист_падение_${triDashboard?.current_from||''}_${triDashboard?.current_to||''}.xlsx`);};

  function triArticleFromProduct(value){const t=String(value||''),m=t.match(/\d+(?:\/\d+){1,6}/g);if(m?.length)return m[m.length-1];const k=triCompact(t);if(k.includes('асн3000н1с')||k.includes('асн3000н1ц')||k.includes('asn3000n1c'))return'63/6/21';if(k.includes('clm36li'))return'70/4/10';if(k.includes('elm1800t'))return'70/4/5';if(k.includes('dt9208a'))return'61/10/507';return'';}
  const triCellNum=v=>{if(v==null||v==='')return'0';const n=Number(String(v).replace(/\s/g,'').replace(',','.'));return Number.isFinite(n)?String(n):'0';};
  function triSkuFromCell(value){
    const m=String(value==null?'':value).match(/\d+(?:\/\d+){1,6}/g);
    return m?.length?m[m.length-1]:'';
  }
  function triPartnerDiagText(diag,maxExamples=5){
    if(!diag)return'';
    const skipped=Number(diag.skipped_unmatched||0)+Number(diag.skipped_excluded_no_sku||0)+Number(diag.skipped_900||0);
    let text='Принято: '+Number(diag.accepted||0)+' строк.';
    if(skipped)text+=' Пропущено безопасно: '+skipped+'.';
    if(diag.has_sales){
      text+='\nПродажи 3 мес. подтверждены из колонок: '+(diag.sales_columns||[]).join(' + ')+'.';
      const sx=(diag.sales_examples||[]).slice(0,Math.min(maxExamples,3));
      if(sx.length)text+='\nКонтроль продаж: '+sx.map(x=>x.sku+' = '+x.parts.join(' + ')+' = '+x.total).join('; ')+'.';
    }else text+='\n⚠️ Продажи 3 мес. НЕ подтверждены — такой файл не может заменить рабочий снимок.';
    if(diag.skipped_unmatched)text+=' Не распознан наш артикул: '+diag.skipped_unmatched+'.';
    if(diag.skipped_excluded_no_sku)text+=' Комплекты/служебные без артикула: '+diag.skipped_excluded_no_sku+'.';
    if(diag.skipped_900)text+=' Группа 900: '+diag.skipped_900+'.';
    const ex=(diag.unmatched_examples||[]).slice(0,maxExamples);
    if(ex.length)text+='\nНе распознаны (первые '+ex.length+'): '+ex.map(x=>'стр. '+x.row+' — '+x.product).join('; ');
    return text;
  }
  function triDetectPartnerSalesColumns(raw){
    const h=(raw||[]).map(triCompact);
    const exact=(name)=>h.findIndex(v=>v===triCompact(name));
    const stats=[];
    h.forEach((v,i)=>{const m=v.match(/^статистикапродаж(\d+)$/);if(m)stats.push({i,n:Number(m[1])||0,label:String(raw[i]||'')});});
    // Новый формат 21vek: «Статистика продаж2», «Статистика продаж1», «Продажи за 3 мес.».
    // Эти три поля являются тремя месячными значениями, их сумма = продажи за 3 месяца.
    const sales3=exact('Продажи за 3 мес.');
    if(stats.length>=2&&sales3>=0){
      stats.sort((a,b)=>b.n-a.n||a.i-b.i);
      const picked=[stats[0].i,stats[1].i,sales3];
      if(new Set(picked).size===3)return{ok:true,mode:'21vek_statistics_2_1_plus_3m',indexes:picked,labels:picked.map(i=>String(raw[i]||''))};
    }
    // Старые выгрузки: три отдельные колонки, начинающиеся с «Продажи за ...».
    const old=h.map((v,i)=>v.startsWith('продажиза')?i:-1).filter(i=>i>=0);
    if(old.length>=3){const picked=old.slice(-3);return{ok:true,mode:'legacy_sales_columns',indexes:picked,labels:picked.map(i=>String(raw[i]||''))};}
    // Резерв на будущий формат: ровно три явных поля статистики продаж.
    if(stats.length>=3){stats.sort((a,b)=>b.n-a.n||a.i-b.i);const picked=stats.slice(0,3).map(x=>x.i);return{ok:true,mode:'statistics_three_columns',indexes:picked,labels:picked.map(i=>String(raw[i]||''))};}
    return{ok:false,mode:'not_detected',indexes:[-1,-1,-1],labels:[]};
  }
  function triParsePartner(aoa){
    let hr=-1;
    for(let i=0;i<Math.min(30,aoa.length);i++){
      const h=(aoa[i]||[]).map(triCompact);
      const product=h.some(v=>v==='номенклатура'||v.startsWith('номенклатура')||v.startsWith('наименование'));
      const total=h.some(v=>v==='всего'||v.startsWith('всего'));
      const article=h.some(v=>v==='артикул'||v.startsWith('артикул')||v.startsWith('кодтовара')||v.startsWith('idтовара')||v==='sku');
      if(article&&product&&total){hr=i;break;}
    }
    if(hr<0)throw new Error('Не найдена шапка 21vek: нужны Артикул/Код товара, Номенклатура и Всего');
    const raw=aoa[hr]||[],h=raw.map(triCompact);
    const find=(...names)=>{for(const x of names){const k=triCompact(x),i=h.findIndex(v=>v===k||v.startsWith(k));if(i>=0)return i;}throw new Error('Нет колонки «'+names.join(' / ')+'»');};
    const findOptional=(...names)=>{for(const x of names){const k=triCompact(x),i=h.findIndex(v=>v===k||v.startsWith(k));if(i>=0)return i;}return -1;};
    const salesDetected=triDetectPartnerSalesColumns(raw),hasSales=salesDetected.ok,sales=salesDetected.indexes;
    const c={ps:find('Артикул','Артикул 21vek','Код товара','ID товара','SKU'),kind:findOptional('Вид','Категория'),brand:findOptional('Производитель','Бренд'),p:find('Номенклатура','Наименование'),m1:sales[0],m2:sales[1],m3:sales[2],total:find('Всего','Остаток всего'),free:findOptional('Свободно','Доступно'),transit:findOptional('В пути','Свободно в пути','Свободно в пути и резерве','В пути и резерве'),reserve:findOptional('Резерв'),orders:findOptional('Заказы','В заказах')};
    // В разных выгрузках 21vek наш артикул может быть отдельной колонкой или только частью названия.
    // Обычная колонка «Артикул» часто является внутренним числовым кодом 21vek, поэтому принимаем
    // значение из неё как наш SKU ТОЛЬКО если оно само имеет формат 71/2/11 и т.п.
    const ownSkuCols=[];
    ['Наш артикул','Артикул поставщика','Артикул производителя','SKU поставщика','SKU производителя','Код поставщика','Код производителя','Наш SKU'].forEach(name=>{const i=findOptional(name);if(i>=0&&!ownSkuCols.includes(i))ownSkuCols.push(i);});
    const rows=[];
    const diag={accepted:0,skipped_empty:0,skipped_unmatched:0,skipped_excluded_no_sku:0,skipped_900:0,matched_explicit_column:0,matched_partner_column:0,matched_product:0,unmatched_examples:[],header_row:hr+1,has_sales:hasSales,sales_mode:salesDetected.mode,sales_columns:salesDetected.labels,sales_examples:[]};
    for(let i=hr+1;i<aoa.length;i++){
      const r=aoa[i]||[],product=String(r[c.p]||'').trim();if(!product){diag.skipped_empty++;continue;}
      const kind=c.kind>=0?String(r[c.kind]||''):'',packed=triCompact(kind+' '+product),excluded=product.includes('+')||packed.includes('комплект')||triCompact(product).includes('невыводить');
      let sku='',matchSource='';
      for(const idx of ownSkuCols){sku=triSkuFromCell(r[idx]);if(sku){matchSource='explicit';break;}}
      if(!sku){sku=triSkuFromCell(r[c.ps]);if(sku)matchSource='partner';}
      if(!sku){sku=triArticleFromProduct(product);if(sku)matchSource='product';}
      if(!sku){
        if(excluded){diag.skipped_excluded_no_sku++;continue;}
        diag.skipped_unmatched++;
        if(diag.unmatched_examples.length<20)diag.unmatched_examples.push({row:i+1,partner_sku:String(r[c.ps]||''),product});
        continue;
      }
      if(/^900(?:\/|$)/i.test(sku)||/(^|[^0-9])900\s*(группа|гр\.?)([^0-9]|$)/i.test(kind+' '+product)){diag.skipped_900++;continue;}
      if(matchSource==='explicit')diag.matched_explicit_column++;else if(matchSource==='partner')diag.matched_partner_column++;else diag.matched_product++;
      const partnerSku=String(r[c.ps]||'').trim()||sku;
      const transit=c.transit>=0?(Number(r[c.transit])||0):0,free=c.free>=0?(Number(r[c.free])||0):(Number(r[c.total])||0),orders=c.orders>=0?r[c.orders]:0;
      const salesParts=hasSales?[Number(triCellNum(r[c.m1]))||0,Number(triCellNum(r[c.m2]))||0,Number(triCellNum(r[c.m3]))||0]:[0,0,0];
      const rowObj={row_key:partnerSku+'|'+sku+'|'+product,partner_sku:partnerSku,sku,kind,brand:c.brand>=0?String(r[c.brand]||''):'',product,
        sales_m1:String(salesParts[0]),sales_m2:String(salesParts[1]),sales_m3:String(salesParts[2]),
        sales_m1_label:hasSales?String(raw[c.m1]||'').trim():null,
        sales_m2_label:hasSales?String(raw[c.m2]||'').trim():null,
        sales_m3_label:hasSales?String(raw[c.m3]||'').trim():null,
        qty_total:triCellNum((Number(r[c.total])||0)+transit),qty_free:triCellNum(free+transit),qty_transit_reserve:triCellNum(transit+(c.reserve>=0?(Number(r[c.reserve])||0):0)),qty_orders:triCellNum(orders),excluded,
        match_note:excluded?'Комплект исключён из рекомендации':''};
      rows.push(rowObj);
      if(hasSales&&(diag.sales_examples.length<10||sku==='65/60')){
        const sample={sku,parts:salesParts,total:salesParts.reduce((a,b)=>a+b,0)};
        if(sku==='65/60')diag.sales_examples.unshift(sample);else diag.sales_examples.push(sample);
        if(diag.sales_examples.length>10)diag.sales_examples=diag.sales_examples.slice(0,10);
      }
    }
    diag.accepted=rows.length;
    const eligible=diag.accepted+diag.skipped_unmatched;
    const quality=eligible?diag.accepted/eligible:0;
    if(rows.length<100)throw new Error('Файл 21vek распознан, но найдено только '+rows.length+' корректных SKU. Старые остатки сохранены.');
    if(eligible>=100&&quality<0.60)throw new Error('Формат файла 21vek сильно изменился: распознано только '+Math.round(quality*100)+'% товарных строк ('+rows.length+' из '+eligible+'). Старые остатки сохранены.');
    // Продажи являются частью одного атомарного снимка 21vek. Если три месячных поля
    // не подтверждены, рабочий снимок НЕ заменяем: иначе свежий остаток будет сочетаться
    // со старыми продажами и даст ложную рекомендацию заказа.
    if(!hasSales)throw new Error('Не удалось определить 3 месячные колонки продаж 21vek. Ожидается новый формат «Статистика продаж2 + Статистика продаж1 + Продажи за 3 мес.» либо старый формат с тремя колонками «Продажи за ...». Старые остатки и продажи сохранены.');
    Object.defineProperty(rows,'_triDiag',{value:diag,enumerable:false,configurable:true});
    return rows;
  }
  function triParseChekhov(aoa){let hr=-1;for(let i=0;i<Math.min(20,aoa.length);i++){const h=(aoa[i]||[]).map(triCompact);if(h.includes('номенклатура')&&h.includes('артикул')){hr=i;break;}}if(hr<0)throw new Error('Не найдена шапка Чехова');const h=(aoa[hr]||[]).map(triCompact),find=x=>{const i=h.findIndex(v=>v===triCompact(x)||v.startsWith(triCompact(x)));if(i<0)throw new Error('Нет колонки «'+x+'»');return i;},c={p:find('Номенклатура'),sku:find('Артикул'),box:find('Количество в коробке'),stock:find('Остаток'),near:find('Остаток рядом'),total:find('Сумма')};const rows=[],seen=new Set();for(let i=hr+1;i<aoa.length;i++){const r=aoa[i]||[],sku=String(r[c.sku]||'').trim().replace(/^'/,'');if(!/^\d+(?:\/\d+){1,6}$/.test(sku))continue;if(/^900(?:\/|$)/i.test(sku)||/(^|[^0-9])900\s*(группа|гр\.?)([^0-9]|$)/i.test(String(r[c.p]||'')))continue;if(seen.has(sku))throw new Error('Дубль Чехова: '+sku);seen.add(sku);rows.push({sku,product:String(r[c.p]||''),box_qty:triCellNum(r[c.box]),qty_stock:triCellNum(r[c.stock]),qty_nearby:triCellNum(r[c.near]),qty_total:triCellNum(r[c.total])});}if(rows.length<100)throw new Error('Слишком мало строк Чехова: '+rows.length);return rows;}
  function triStockImportId(source){
    try{if(window.crypto&&typeof window.crypto.randomUUID==='function')return source+'-'+window.crypto.randomUUID();}catch(_){ }
    return source+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,12);
  }
  function triStockUploadStatus(message,visible=true){const el=document.getElementById('tri-stock-upload-status');if(!el)return;if(!visible){el.style.display='none';el.textContent='';return;}el.style.display='block';el.style.whiteSpace='pre-wrap';el.textContent=message;}
  function triStockUploadBusy(busy,source,done=0,total=0){document.querySelectorAll('.tri-stock-upload').forEach(btn=>{btn.disabled=busy;if(!btn.dataset.originalText)btn.dataset.originalText=btn.textContent;if(!busy)btn.textContent=btn.dataset.originalText;else if(btn.dataset.source===source)btn.textContent=total?('Загрузка '+done+' из '+total+'…'):'Подготовка файла…';});}
  async function triStockRpc(name,args,timeout,label){const r=await withTimeout(db.rpc(name,args),timeout,label);if(r.error)throw r.error;return r.data||{};}
  window.triovistUploadStock=async function(source,event){
    if(!triCanUploadStock()){alert('Загрузка остатков доступна только руководителям и менеджерам Триовиста.');return;}
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    const sourceName=source==='partner'?'21vek':'Чехов';
    let importId='',uploadStage='чтение и проверка Excel',partnerDiag=null;
    try{
      triStockUploadBusy(true,source);
      triStockUploadStatus('Читаю и проверяю файл '+sourceName+'…');
      const X=await triEnsureXlsx();
      const wb=X.read(await file.arrayBuffer(),{type:'array'});
      if(!wb.SheetNames?.length)throw new Error('В Excel нет листов');
      const aoa=X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:null,raw:true});
      const rows=source==='partner'?triParsePartner(aoa):triParseChekhov(aoa);
      partnerDiag=source==='partner'?(rows._triDiag||null):null;
      const diagText=partnerDiag?triPartnerDiagText(partnerDiag):('Принято: '+rows.length+' строк.');
      triStockUploadStatus(sourceName+': файл проверен.\n'+diagText);
      const confirmText='Загрузить '+rows.length+' корректных строк из файла «'+file.name+'»?\n\n'+diagText+'\n\nТекущие остатки будут заменены только после полной загрузки и серверной проверки.';
      if(!confirm(confirmText)){triStockUploadStatus('ℹ️ '+sourceName+': загрузка отменена пользователем. Старые остатки сохранены.',true);return;}
      importId=triStockImportId(source);
      uploadStage='начало серверной загрузки';
      await triStockRpc('triovist_stock_stage_begin',{p_source:source,p_import_id:importId},30000,'начало загрузки остатков');
      const batchSize=250;
      for(let offset=0;offset<rows.length;offset+=batchSize){
        const batch=rows.slice(offset,offset+batchSize);
        const done=Math.min(offset+batch.length,rows.length);
        uploadStage='пакет '+(Math.floor(offset/batchSize)+1)+' ('+done+' из '+rows.length+')';
        triStockUploadBusy(true,source,done,rows.length);
        triStockUploadStatus(sourceName+': загружено '+done+' из '+rows.length+' строк. Не закрывайте страницу.'+(partnerDiag?'\n'+triPartnerDiagText(partnerDiag,3):''));
        await triStockRpc('triovist_stock_stage_batch',{p_source:source,p_import_id:importId,p_rows:batch},45000,'пакет остатков '+sourceName);
      }
      uploadStage='финальная серверная проверка и замена рабочего снимка';
      triStockUploadStatus(sourceName+': проверяю итог и заменяю рабочие остатки…');
      const result=await triStockRpc('triovist_stock_stage_commit',{p_source:source,p_import_id:importId,p_expected_rows:rows.length,p_source_file:file.name,p_snapshot_date:new Date().toISOString().slice(0,10)},90000,'завершение загрузки остатков');
      const skipped=partnerDiag?(Number(partnerDiag.skipped_unmatched||0)+Number(partnerDiag.skipped_excluded_no_sku||0)+Number(partnerDiag.skipped_900||0)):0;
      triStockUploadStatus('✅ '+sourceName+': успешно загружено '+Number(result.rows||rows.length)+' строк.'+(skipped?'\nПропущено безопасно: '+skipped+'. '+triPartnerDiagText(partnerDiag,5):''),true);
      alert('✅ Остатки '+sourceName+' загружены: '+Number(result.rows||rows.length)+' строк.'+(skipped?'\nПропущено безопасно: '+skipped+'.':'')+'\n\nКто загрузил файл и время сохранены в журнале.');
      await triLoadStock();renderTriovistStock();
    }catch(e){
      if(importId){try{await db.rpc('triovist_stock_stage_abort',{p_source:source,p_import_id:importId});}catch(_){ }}
      const reason=String(e?.message||e||'Неизвестная ошибка');
      const diag=partnerDiag?'\n'+triPartnerDiagText(partnerDiag,5):'';
      triStockUploadStatus('❌ '+sourceName+': ошибка на этапе «'+uploadStage+'».\n'+reason+'\nСтарые остатки сохранены.'+diag,true);
      alert('Остатки '+sourceName+' не загружены. Старые данные сохранены.\n\nЭтап: '+uploadStage+'\nПричина: '+reason+diag);
    }finally{triStockUploadBusy(false,source);}
  };
  window.triovistStockDaysChanged=async function(){const n=Number(document.getElementById('tri-stock-days')?.value)||45;try{
    // 10/20 дней — быстрые оперативные горизонты. Не меняем ими общий сохранённый
    // норматив руководителя; RPC расчёта всё равно получает p_target_days=n.
    if(triIsBoss()&&n>=30){const r=await db.rpc('triovist_set_recommendation_days',{p_target_days:n});if(r.error)throw r.error;}
    await triLoadStock();renderTriovistStock();
  }catch(e){alert(e.message||e);}};
  function triStockFiltered(){let mgr=document.getElementById('tri-manager-filter')?.value||'all';if(triIsManager())mgr=triEmail();const q=triNorm(document.getElementById('tri-stock-search')?.value||'');return triStockItems.filter(x=>(mgr==='all'||String(x.manager_email||'').toLowerCase()===mgr)&&(!q||triNorm([x.sku,x.product,x.assigned_group,x.brand].join(' ')).includes(q)));}
  window.renderTriovistStock=function(){const meta=document.getElementById('tri-stock-meta'),root=document.getElementById('tri-stock-table');if(!meta||!root)return;if(triStockError){meta.innerHTML='<div class="tri-warning">'+esc(triStockError)+'</div>';root.innerHTML='';return;}const p=triStockMeta.partner||{},c=triStockMeta.chekhov||{},o=triStockMeta.own||{},rows=triStockFiltered().sort((a,b)=>triNum(b.recommended)-triNum(a.recommended)||triNum(b.sales_90)-triNum(a.sales_90));meta.innerHTML='<div class="tri-stock-grid"><div class="tri-stock-kpi"><span class="tri-note">Остатки 21vek</span><b>'+esc(p.snapshot_date||'не загружены')+'</b><span class="tri-note">'+esc(p.source_file||'')+'</span></div><div class="tri-stock-kpi"><span class="tri-note">Наш склад Витебск</span><b>'+esc(o.report_date||'нет даты')+'</b><span class="tri-note">автоматически из 1С</span></div><div class="tri-stock-kpi"><span class="tri-note">Остатки Чехова</span><b>'+esc(c.snapshot_date||'не загружены')+'</b><span class="tri-note">'+esc(c.source_file||'')+'</span></div><div class="tri-stock-kpi"><span class="tri-note">Горизонт рекомендации</span><b>'+triStockDays+' дней</b><span class="tri-note">по продажам 21vek за 3 месяца</span></div></div>';if(!rows.length){root.innerHTML='<div class="tri-empty">Нет сопоставленных остатков. Загрузите актуальные файлы 21vek и Чехова.</div>';return;}const shown=rows.slice(0,500);root.innerHTML='<div class="tri-note" style="margin-bottom:8px">Найдено '+rows.length+' SKU. Показано '+shown.length+'. Для точного дня последней отгрузки нужен отдельный детальный отчёт 1С; текущая история хранит месяц.</div><div class="tri-table-wrap"><table class="tri-table tri-stock-table"><thead><tr><th>Менеджер</th><th>Группа</th><th>Артикул / товар</th><th>Продажи 3 мес.</th><th>21vek всего</th><th>Заказы 21vek</th><th>Дней запаса</th><th>Наш склад</th><th>Чехов</th><th>Рекоменд. заказ</th><th>Отгрузить сейчас</th><th>Заказать Чехов</th><th>Не покрыто</th><th>Последняя отгрузка</th></tr></thead><tbody>'+shown.map(x=>'<tr><td>'+esc(x.manager_name||'—')+'</td><td>'+esc(x.assigned_group||'—')+'</td><td><b>'+esc(x.sku)+'</b><div class="tri-note">'+esc(x.product)+'</div></td><td>'+triQty(x.sales_90)+'</td><td>'+triQty(x.partner_total)+'</td><td>'+triQty(x.partner_orders)+'</td><td>'+(x.stock_days==null?'—':triQty(x.stock_days))+'</td><td>'+triQty(x.own_qty)+'</td><td>'+triQty(x.chekhov_qty)+'</td><td class="tri-rec">'+triQty(x.recommended)+'</td><td>'+triQty(x.ship_own)+'</td><td>'+triQty(x.order_chekhov)+'</td><td class="'+(triNum(x.uncovered)>0?'tri-uncovered':'')+'">'+triQty(x.uncovered)+'</td><td>'+esc(x.last_shipment_month||'—')+'<div class="tri-note">'+(x.last_shipment_month?'кол-во '+triQty(x.last_shipment_qty):'нет отгрузок')+'</div></td></tr>').join('')+'</tbody></table></div>';};
  window.triovistExportStock=function(){const rows=triStockFiltered().map(x=>({'Менеджер':x.manager_name,'Группа':x.assigned_group,'Артикул':x.sku,'Товар':x.product,'Продажи 3 месяца':x.sales_90,'Остаток 21vek':x.partner_total,'Заказы 21vek':x.partner_orders,'Чистый остаток после заказов':x.partner_net,'Дней запаса':x.stock_days,'Наш остаток Витебск':x.own_qty,'Остаток Чехов':x.chekhov_qty,'Рекомендуемый заказ':x.recommended,'Отгрузить с Витебска':x.ship_own,'Заказать из Чехова':x.order_chekhov,'Непокрытый дефицит':x.uncovered,'Последняя отгрузка (месяц)':x.last_shipment_month,'Количество последней отгрузки':x.last_shipment_qty}));triExportBook([{name:'Остатки и заказ',rows}],`Триовист_остатки_${new Date().toISOString().slice(0,10)}.xlsx`);};

  window.renderTriovist=function(){triApplyAccessUi();if(!triCanSee())return;const warn=document.getElementById('triovist-warning');if(triLoading){warn.innerHTML='<div class="card tri-empty">Загрузка…</div>';return;}if(!triLoaded){warn.innerHTML='<div class="tri-warning">Нажмите «Обновить».</div>';return;}const items=triFilteredItems(),total=triAggregate(items,()=> 'all')[0]||{cur:0,prev:0},loss=Math.max(0,total.prev-total.cur),pct=triPct(total.cur,total.prev);const groups=triAggregate(items,r=>(r.manager_email||'none')+'|'+(r.assigned_group||r.category||'Не распределено')).sort((a,b)=>b.cur-a.cur||b.prev-a.prev),products=triAggregate(items,r=>(r.manager_email||'none')+'|'+(r.assigned_group||r.category||'Не распределено')+'|'+(r.sku||r.product||'')).sort((a,b)=>(b.prev-b.cur)-(a.prev-a.cur));const fallingGroups=groups.filter(x=>triStatus(x.cur,x.prev)==='falling'),lostGroups=groups.filter(x=>triStatus(x.cur,x.prev)==='lost'),fallingSku=products.filter(x=>triStatus(x.cur,x.prev)==='falling'),lostSku=products.filter(x=>triStatus(x.cur,x.prev)==='lost');const managers=[TRI_ALEKS_EMAIL,TRI_KRISHTAL_EMAIL].filter(e=>triIsBoss()||e===triEmail()).map(e=>triManagerSummary(items,e)),allPlan=managers.every(x=>x.plan!=null)?managers.reduce((s,x)=>s+triNum(x.plan),0):null;const labels=triPeriodLabel(),last=triDashboard?.last_import||{};warn.innerHTML='<div class="tri-ok">История: '+(triHistory.months||0)+' месяцев, '+(triHistory.groups||0)+' групп. Последнее обновление продаж: '+triDateTime(last.imported_at)+(last.month?' · период '+esc(last.month):'')+'.</div>';document.getElementById('tri-period-note').textContent='Сравнение: '+labels.label+' против '+labels.prevLabel+'.';document.getElementById('tri-kpis').innerHTML='<div class="tri-kpi"><div class="tri-kpi-label">Продажи периода</div><div class="tri-kpi-value">'+triMoney(total.cur)+'</div></div><div class="tri-kpi"><div class="tri-kpi-label">Аналогичный период</div><div class="tri-kpi-value">'+triMoney(total.prev)+'</div></div><div class="tri-kpi"><div class="tri-kpi-label">Динамика</div><div class="tri-kpi-value" style="color:'+(pct<0?'var(--r)':'var(--g)')+'">'+(pct>0?'+':'')+pct.toFixed(1)+'%</div></div><div class="tri-kpi"><div class="tri-kpi-label">Потерянный оборот</div><div class="tri-kpi-value" style="color:'+(loss?'var(--r)':'var(--g)')+'">'+triMoney(loss)+'</div></div><div class="tri-kpi"><div class="tri-kpi-label">План / факт</div><div class="tri-kpi-value" style="font-size:16px">'+(allPlan==null?'План не задан':triMoney(allPlan)+' / '+triMoney(total.cur))+'</div></div>';document.getElementById('tri-manager-cards').innerHTML=managers.map(x=>'<div class="tri-manager-card"><div class="tri-manager-head"><div><div class="tri-manager-name">'+esc(x.name)+'</div><div class="tri-manager-email">'+esc(x.email)+'</div></div>'+triStatusHtml(x.cur,x.prev)+'</div><div class="tri-metrics"><div class="tri-metric"><span>Продажи</span><b>'+triMoney(x.cur)+'</b></div><div class="tri-metric"><span>Потеря</span><b>'+triMoney(Math.max(0,x.prev-x.cur))+'</b></div><div class="tri-metric"><span>План</span><b>'+(x.plan==null?'Не задан':triMoney(x.plan))+'</b></div></div></div>').join('');const byGroup=new Map();products.forEach(x=>{const k=x.manager_name+'|'+x.group;if(!byGroup.has(k))byGroup.set(k,[]);byGroup.get(k).push(x);});const entries=[...byGroup.entries()],idx=new Map(entries.map(([k],i)=>[k,i]));document.getElementById('tri-groups').innerHTML=groups.length?'<div class="tri-table-wrap"><table class="tri-table"><thead><tr><th>Менеджер</th><th>Группа</th><th>Продажи</th><th>Прошлый период</th><th>Изменение</th><th>Потеря</th><th>Статус</th><th></th></tr></thead><tbody>'+groups.map(x=>{const i=idx.get(x.manager_name+'|'+x.group);return'<tr class="tri-clickable" onclick="triovistOpenGroup('+i+')"><td>'+esc(x.manager_name)+'</td><td><b>'+esc(x.group)+'</b></td><td>'+triMoney(x.cur)+'</td><td>'+triMoney(x.prev)+'</td><td>'+(triPct(x.cur,x.prev)>0?'+':'')+triPct(x.cur,x.prev).toFixed(1)+'%</td><td>'+triMoney(Math.max(0,x.prev-x.cur))+'</td><td>'+triStatusHtml(x.cur,x.prev)+'</td><td><button class="tri-open-btn">Открыть</button></td></tr>';}).join('')+'</tbody></table></div>':'<div class="tri-empty">Нет продаж.</div>';const alert=(title,list,kind)=>'<div class="tri-alert-card"><div class="card-title">'+title+' ('+list.length+')</div>'+(list.length?list.slice(0,15).map(x=>'<div class="tri-alert-row"><div><b>'+esc(x.group)+'</b>'+(x.product?'<div class="tri-note">'+esc((x.sku?x.sku+' · ':'')+x.product)+'</div>':'')+'</div><div><b style="color:var(--r)">'+triMoney(Math.max(0,x.prev-x.cur))+'</b><div class="tri-note">'+(kind==='lost'?'нет продаж':'осталось '+triMoney(x.cur))+'</div></div></div>').join(''):'<div class="tri-empty">Нет позиций</div>')+'</div>';document.getElementById('tri-alerts').innerHTML=alert('📉 Падающие группы',fallingGroups,'falling')+alert('⛔ Потерянные группы',lostGroups,'lost')+alert('📉 Падающие SKU',fallingSku,'falling')+alert('⛔ Потерянные SKU',lostSku,'lost');document.getElementById('tri-details').innerHTML=entries.map(([k,list],i)=>{const [mgr,group]=k.split('|');return'<details id="tri-detail-'+i+'"><summary style="cursor:pointer;padding:10px 0"><b>'+esc(group)+'</b> · '+esc(mgr)+' · '+list.length+' SKU</summary><div class="tri-table-wrap"><table class="tri-table"><thead><tr><th>SKU</th><th>Товар</th><th>Подгруппа</th><th>Продажи</th><th>Прошлый период</th><th>Потеря</th><th>Статус</th></tr></thead><tbody>'+list.map(x=>'<tr><td>'+esc(x.sku||'—')+'</td><td>'+esc(x.product)+'</td><td>'+esc(x.subgroup)+'</td><td>'+triMoney(x.cur)+'</td><td>'+triMoney(x.prev)+'</td><td>'+triMoney(Math.max(0,x.prev-x.cur))+'</td><td>'+triStatusHtml(x.cur,x.prev)+'</td></tr>').join('')+'</tbody></table></div></details>';}).join('')||'<div class="tri-empty">Нет SKU.</div>';triRenderPlanEditor();triRenderMyGroups();triRenderAssignments();renderTriovistStock();};

  // v22.7.32.2.4 — official read-only bridge for later Triovist modules.
  // Prevents ReferenceError from cross-<script> lexical variables such as
  // triStockMeta / triStockItems / triItems.
  window.TRIOVIST_RUNTIME_STATE_V227324=Object.freeze({
    snapshot:()=>({
      salesItems:Array.isArray(triItems)?triItems:[],
      stockItems:Array.isArray(triStockItems)?triStockItems:[],
      stockMeta:triStockMeta&&typeof triStockMeta==='object'?triStockMeta:{},
      loaded:!!triLoaded,
      loading:!!triLoading
    })
  });

  triInjectUi();const baseLoadData=loadData;loadData=async function(){if(triIsManager()){allClients=[];allTasks=[];allVisits=[];allUsers=currentProfile?[currentProfile]:[];allRoutePlans=[];allNegotiations=[];allPurchases=[];allPurchaseItems=[];allPurchaseHistory=[];allClientPhotos=[];allVipSales=[];allPromotions=[];allPromotionBudgets=[];allPromotionBudgetMovements=[];allPromotionPhotos=[];allClientDebt=[];allStock=[];allPrice=[];allImportStatus=[];allCashReceipts=[];await Promise.all([triLoadData(),triLoadStock()]);return;}await baseLoadData();};const baseStartApp=startApp;startApp=function(){baseStartApp();triApplyAccessUi();};const baseGoPage=goPage;goPage=function(p,title){if(triIsManager()&&p!=='triovist'){p='triovist';title='Триовист / 21vek.by';}baseGoPage(p,title);triApplyAccessUi();if(p==='triovist')crmSchedulePageHook('triovist',async()=>{if(!triLoaded||!triStockItems.length)try{await Promise.all([triLoadData(),triLoadStock()]);}catch(e){console.warn(e);}if(crmActivePage()==='triovist')renderTriovist();},0);};const baseBuildDashboard=buildDashboard;buildDashboard=function(){if(triIsManager()){triApplyAccessUi();document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));document.getElementById('page-triovist')?.classList.add('active');renderTriovist();return;}baseBuildDashboard();triApplyAccessUi();};window.RESANTA_TRIOVIST=Object.freeze({version:'22.7.31.5',client:TRI_CLIENT,salesWithVat:true,customPeriods:true,stockRecommendations:true,fullAccessEmails:TRI_LEADER_EMAILS});
})();

/* ===== ORIGINAL INLINE SCRIPT 11 ===== */
// ============================================================================
// RESANTA CRM v21.7 · защита поиска + автоматический Триовист
// Браузер/менеджер паролей не должен вставлять корпоративный email в поиск
// клиентов, маршрутов, задач, акций, бюджетов, Триовиста и другие фильтры.
(function(){
  'use strict';
  const FILTER_SELECTOR=[
    'input[type="search"]',
    'input.search-input',
    'input[id*="search"]',
    'input[id*="filter"]'
  ].join(',');
  let scanTimer=0;

  function currentEmails(){
    return [
      window.currentUser?.email,
      window.currentProfile?.email,
      document.getElementById('my-password-username')?.value,
      document.getElementById('password-autofill-username')?.value
    ].map(v=>String(v||'').trim().toLowerCase()).filter(Boolean);
  }

  function isSearchFilter(el){
    if(!(el instanceof HTMLInputElement))return false;
    if(el.type==='email'||el.type==='password'||el.type==='hidden')return false;
    if(el.closest('#login-screen,#reset-screen,#modal-invite-user,#modal-my-password,#modal-user-password'))return false;
    return el.matches(FILTER_SELECTOR);
  }

  function looksLikeCredential(value){
    const v=String(value||'').trim().toLowerCase();
    if(!v)return false;
    if(currentEmails().includes(v))return true;
    return /^[^\s@]+@resanta\.ru$/i.test(v);
  }

  function harden(el,index){
    if(!isSearchFilter(el))return;
    el.setAttribute('autocomplete','off');
    el.setAttribute('autocorrect','off');
    el.setAttribute('autocapitalize','off');
    el.setAttribute('spellcheck','false');
    el.setAttribute('data-lpignore','true');
    el.setAttribute('data-1p-ignore','true');
    el.setAttribute('data-form-type','other');
    const safeId=String(el.id||index||'filter').replace(/[^a-z0-9_-]+/gi,'_');
    el.setAttribute('name','crm_filter_'+safeId+'_v216');
  }

  function clearOne(el,notify=true){
    if(!isSearchFilter(el)||!looksLikeCredential(el.value)||el.dataset.crmClearing==='1')return false;
    el.dataset.crmClearing='1';
    el.value='';
    // onchange/oninput страницы пересчитают список уже без ошибочного email.
    if(notify)el.dispatchEvent(new Event('input',{bubbles:true}));
    delete el.dataset.crmClearing;
    return true;
  }

  function scan(notify=true){
    document.querySelectorAll(FILTER_SELECTOR).forEach((el,i)=>{
      harden(el,i);
      clearOne(el,notify);
    });
  }

  function scheduleScan(){
    clearTimeout(scanTimer);
    scanTimer=setTimeout(()=>scan(true),40);
  }

  document.addEventListener('focusin',e=>{
    if(isSearchFilter(e.target)){
      harden(e.target,0);
      clearOne(e.target,true);
    }
  },true);
  document.addEventListener('input',e=>{
    if(isSearchFilter(e.target))clearOne(e.target,true);
  },true);
  document.addEventListener('change',e=>{
    if(isSearchFilter(e.target))clearOne(e.target,true);
  },true);
  window.addEventListener('pageshow',()=>{
    [0,100,350,900,1800,3500].forEach(ms=>setTimeout(()=>scan(true),ms));
  });
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)[0,150,700].forEach(ms=>setTimeout(()=>scan(true),ms));
  });

  const observer=new MutationObserver(scheduleScan);
  observer.observe(document.documentElement,{childList:true,subtree:true});

  // Некоторые менеджеры паролей подставляют email без события input спустя секунды.
  // Лёгкая периодическая проверка окончательно закрывает этот сценарий.
  setInterval(()=>scan(true),2000);
  scan(false);
  window.resantaClearSearchAutofill=scan;
})();

/* ===== ORIGINAL INLINE SCRIPT 12 ===== */
// RESANTA CRM v22.0 · произвольный диапазон и Excel для обычных менеджеров
(function(){
  'use strict';
  function install(){
    const mode=document.getElementById('falling-period-mode');if(!mode)return;
    if(![...mode.options].some(o=>o.value==='custom'))mode.insertAdjacentHTML('beforeend','<option value="custom">Произвольный диапазон месяцев</option>');
    if(!document.getElementById('falling-start-wrap')){
      const end=document.getElementById('falling-end-month')?.parentElement;
      end?.insertAdjacentHTML('beforebegin','<div id="falling-start-wrap" style="display:none"><label class="form-label">С месяца</label><input id="falling-start-month" type="month" class="form-input" onchange="renderFallingClients()"></div>');
    }
    const head=document.querySelector('#page-falling .page-title')?.closest('div[style*="justify-content"]');
    if(head&&!document.getElementById('falling-export-btn'))head.querySelector('button')?.insertAdjacentHTML('beforebegin','<button id="falling-export-btn" class="btn-secondary" onclick="v22ExportFallingExcel()">⬇ Excel</button>');
    v22FallingModeUi();
  }
  window.v20MonthRange=function(start,end){const out=[];let cur=start;while(cur&&cur<=end&&out.length<60){out.push(cur);cur=abcMonthShift(cur,1);}return out;};
  window.v22FallingModeUi=function(){const custom=document.getElementById('falling-period-mode')?.value==='custom',w=document.getElementById('falling-start-wrap');if(w)w.style.display=custom?'block':'none';if(custom){const s=document.getElementById('falling-start-month'),e=document.getElementById('falling-end-month');if(s&&!s.value&&e?.value)s.value=e.value.slice(0,4)+'-01';}};
  const oldChanged=window.v20FallingPeriodChanged;window.v20FallingPeriodChanged=function(){v22FallingModeUi();return oldChanged?oldChanged():renderFallingClients();};
  window.v20FallingPeriod=function(){const mode=document.getElementById('falling-period-mode')?.value||'ytd_full';let end=document.getElementById('falling-end-month')?.value||v20DefaultEndMonth();if(mode==='ytd_full'&&end===TODAY.slice(0,7))end=abcMonthShift(end,-1);let start;if(mode==='month')start=end;else if(mode==='custom')start=document.getElementById('falling-start-month')?.value||end.slice(0,4)+'-01';else start=end.slice(0,4)+'-01';if(start>end){const t=start;start=end;end=t;}const current=v20MonthRange(start,end),previous=current.map(v20MonthMinusYear);return{mode,start,end,current,previous,label:start===end?monthLabel(end):monthLabel(start)+' — '+monthLabel(end),previousLabel:v20MonthMinusYear(start)===v20MonthMinusYear(end)?monthLabel(v20MonthMinusYear(end)):monthLabel(v20MonthMinusYear(start))+' — '+monthLabel(v20MonthMinusYear(end))};};
  async function xlsx(){if(window.XLSX)return window.XLSX;if(typeof window._loadSheetJS==='function')return window._loadSheetJS();throw new Error('Модуль Excel не загрузился');}
  window.v22ExportFallingExcel=async function(){try{const data=v20ComputeFalling(),sev=document.getElementById('falling-severity')?.value||'all',q=abcNorm(document.getElementById('falling-search')?.value||'');const rows=data.rows.filter(x=>(sev==='all'||x.severity===sev)&&(!q||abcNorm(x.client.name+' '+x.client.region+' '+x.client.manager_name).includes(q)));const clients=[],items=[];rows.forEach(x=>{clients.push({'Менеджер':x.client.manager_name,'Клиент':x.client.name,'Регион':x.client.region,'Период, BYN':Number(x.cur.toFixed(2)),'Прошлый год, BYN':Number(x.prev.toFixed(2)),'Потерянный оборот, BYN':Number(x.loss.toFixed(2)),'Падение, %':Number(x.pct.toFixed(1)),'Последняя продажа':x.lastSale||''});x.breakdown.items.forEach(p=>items.push({'Менеджер':x.client.manager_name,'Клиент':x.client.name,'Группа':p.group,'Товар':p.label,'ABC':p.abc||'','Текущий период, BYN':Number(p.cur.toFixed(2)),'Прошлый период, BYN':Number(p.prev.toFixed(2)),'Потеря, BYN':Number(p.loss.toFixed(2)),'Статус':p.cur<=0?'Потерян':'Падает'}));});const X=await xlsx(),wb=X.utils.book_new();X.utils.book_append_sheet(wb,X.utils.json_to_sheet(clients),'Падающие клиенты');X.utils.book_append_sheet(wb,X.utils.json_to_sheet(items),'Падающие товары');X.writeFile(wb,'Падающие_клиенты_'+data.period.start+'_'+data.period.end+'.xlsx');}catch(e){alert('Не удалось сформировать Excel: '+(e.message||e));}};
  install();const mo=new MutationObserver(install);mo.observe(document.documentElement,{childList:true,subtree:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 13 ===== */
// ============================================================================
// RESANTA CRM v22.1 · переход месяца, комментарии падения, подгруппы Триовиста,
// месячный цикл маршрутов: проект руководителя → проверка менеджера → согласование.
(function(){
  'use strict';
  const V221='22.1';
  const ymNow=()=>TODAY.slice(0,7);
  const ymPrev=()=>abcMonthShift(ymNow(),-1);
  const reportYm=st=>String(st?.report_period||st?.report_date||'').slice(0,7);
  const banner=(bg,color,html)=>'<div style="background:'+bg+';border-radius:8px;padding:9px 12px;margin-bottom:12px;font-size:12px;line-height:1.55;color:'+color+'">'+html+'</div>';

  // Новый календарный месяц не является ошибкой: июль остаётся закрытым срезом,
  // пока 1С не пришлёт первый полноценный августовский отчёт.
  window.salesFreshnessBanner=function(){
    const st=crmImportStatus('sales');
    if(!st)return banner('var(--amb)','var(--am)','🕒 Продажи ещё не загружены. Ожидается отчёт 1С.');
    const rep=reportYm(st),cur=ymNow(),prev=ymPrev(),failed=st.status==='error',hours=crmHoursSince(st.last_success_at);
    let text='Продажи обновлены: <b>'+crmDateTime(st.last_success_at)+'</b> · период 1С: <b>'+crmPeriodLabel(st.report_period)+'</b> · строк: <b>'+(st.row_count??'—')+'</b>';
    if(st.source_message_at)text+=' · письмо: '+crmDateTime(st.source_message_at);
    if(failed)return banner('var(--rb)','var(--r)','⚠️ '+text+'<br>Последняя попытка завершилась ошибкой: '+esc(String(st.error_text||'смотрите GitHub Actions')));
    if(rep===cur)return banner(hours!=null&&hours>18?'var(--amb)':'var(--gb)',hours!=null&&hours>18?'var(--am)':'var(--g)',(hours!=null&&hours>18?'🕒 ':'✅ ')+text);
    if(rep===prev)return banner('var(--amb)','var(--am)','🕒 '+text+'<br>Идёт новый месяц. Закрытый '+crmPeriodLabel(rep)+' сохранён; '+crmPeriodLabel(cur)+' появится автоматически после первого корректного отчёта 1С за новый месяц.');
    return banner('var(--rb)','var(--r)','⚠️ '+text+'<br>Отчёт старше предыдущего календарного месяца — проверьте рассылку 1С.');
  };

  window.debtFreshnessBanner=function(){
    const st=crmImportStatus('pdz'),row=(allClientDebt||[]).find(d=>d.report_date||d.imported_at)||{};
    const rd=String(st?.report_date||row.report_date||'').slice(0,10),success=st?.last_success_at||row.imported_at||null;
    if(!st&&!rd&&!success)return'';
    const age=rd?Math.round((new Date(TODAY+'T00:00:00')-new Date(rd+'T00:00:00'))/86400000):null,failed=st?.status==='error';
    let text='ПДЗ загружена: <b>'+crmDateTime(success)+'</b>'+(rd?' · отчёт 1С на <b>'+rd+'</b>':'')+(st?.row_count!=null?' · должников: <b>'+st.row_count+'</b>':'');
    if(st?.source_message_at)text+=' · письмо: '+crmDateTime(st.source_message_at);
    if(failed)return banner('var(--rb)','var(--r)','⚠️ '+text+'<br>Последняя попытка: '+esc(String(st.error_text||'ошибка импорта')));
    if(Number(st?.row_count)===0)return banner('var(--gb)','var(--g)','✅ '+text+'<br>Отчёт проверен: просроченной задолженности по менеджерам нет. Старый список должников очищен.');
    if(age===1)return banner('var(--amb)','var(--am)','🕒 '+text+'<br>Показывается последний подтверждённый срез. Сегодняшний появится автоматически после рассылки 1С.');
    if(age!=null&&age>1)return banner('var(--rb)','var(--r)','⚠️ '+text+'<br>Срез старше одного дня — проверьте дату отчёта и рассылку 1С.');
    return banner('var(--gb)','var(--g)','✅ '+text);
  };

  window.v20PaymentsFreshness=function(){
    const st=crmImportStatus('payments');if(!st)return'<div class="v20-period-warning">Поступления ещё не загружены.</div>';
    const rep=reportYm(st),cur=ymNow(),prev=ymPrev(),failed=st.status==='error';
    let text='Последняя загрузка поступлений: <b>'+crmDateTime(st.last_success_at)+'</b> · период: <b>'+esc(st.report_period||'—')+'</b> · документов: <b>'+(st.row_count??'—')+'</b>';
    if(failed)return banner('var(--rb)','var(--r)','⚠️ '+text+'<br>'+esc(st.error_text||'Ошибка импорта'));
    if(rep===cur)return banner('var(--gb)','var(--g)','✅ '+text);
    if(rep===prev)return banner('var(--amb)','var(--am)','🕒 '+text+'<br>Новый месяц начался. Август появится автоматически после первого отчёта поступлений 1С за август.');
    return banner('var(--rb)','var(--r)','⚠️ '+text+'<br>Период отчёта устарел.');
  };

  // Личный комментарий руководителя по падающему клиенту.
  let fallingNotes={},fallingNotesLoaded=false,fallingNotesLoading=false;
  async function loadFallingNotes(){
    if(currentProfile?.role!=='boss'||fallingNotesLoaded||fallingNotesLoading)return;
    fallingNotesLoading=true;
    try{const {data,error}=await db.from('falling_client_notes').select('*');if(error)throw error;(data||[]).forEach(x=>fallingNotes[String(x.client_id)]=x);fallingNotesLoaded=true;}
    catch(e){console.warn('falling notes',e);}finally{fallingNotesLoading=false;}
  }
  window.v221SaveFallingNote=async function(clientId,clientName){
    if(currentProfile?.role!=='boss')return;const el=document.getElementById('fall-note-'+clientId),note=String(el?.value||'').trim();
    const row={client_id:String(clientId),client_name:clientName||null,note,updated_by:currentProfile?.name||null,updated_at:new Date().toISOString()};
    const {data,error}=await db.from('falling_client_notes').upsert(row,{onConflict:'client_id'}).select().single();if(error){alert(error.message);return;}fallingNotes[String(clientId)]=data||row;alert('Комментарий сохранён только для руководителя.');
  };
  const baseFallingCard=window.v20FallingCard;
  window.v20FallingCard=function(x){
    let html=baseFallingCard(x);if(currentProfile?.role!=='boss')return html;const c=x.client,n=fallingNotes[String(c.id)]?.note||'';
    return html+'<div class="card" style="margin:-8px 0 12px;border-top:0;background:#FFFBEB"><div class="card-title">📝 Комментарий руководителя для себя</div><textarea id="fall-note-'+escAttr(c.id)+'" class="form-input" rows="2" placeholder="Что обсудить, проверить или проконтролировать">'+esc(n)+'</textarea><button class="btn-secondary" style="margin-top:8px" onclick="v221SaveFallingNote(\''+escAttr(c.id)+'\',\''+escAttr(c.name)+'\')">Сохранить комментарий</button></div>';
  };
  const baseRenderFalling=window.renderFallingClients;
  window.renderFallingClients=function(){baseRenderFalling();if(currentProfile?.role==='boss'&&!fallingNotesLoaded&&!fallingNotesLoading){loadFallingNotes().then(()=>baseRenderFalling());}};

  // Триовист: прайс-лист является источником подгруппы. В каждой группе строим
  // свод по подгруппам и возможность провалиться до SKU.
  function priceSubgroup(sku,fallback){const p=(allPrice||[]).find(x=>String(x.sku||'').trim()===String(sku||'').trim());return String(p?.subgroup||fallback||'Без подгруппы').trim()||'Без подгруппы';}
  function parseMoneyCell(v){return Number(String(v||'').replace(/[^0-9,.-]/g,'').replace(/\s/g,'').replace(',','.'))||0;}
  function enhanceTriDetails(){
    document.querySelectorAll('#tri-details details').forEach((d,di)=>{
      if(d.dataset.subgroupEnhanced==='1')return;const table=d.querySelector('table'),body=table?.tBodies?.[0];if(!body)return;
      const map=new Map();[...body.rows].forEach(tr=>{const sku=tr.cells[0]?.textContent.trim(),sg=priceSubgroup(sku,tr.cells[2]?.textContent);tr.cells[2].textContent=sg;tr.dataset.subgroup=sg;const x=map.get(sg)||{count:0,cur:0,prev:0,loss:0};x.count++;x.cur+=parseMoneyCell(tr.cells[3]?.textContent);x.prev+=parseMoneyCell(tr.cells[4]?.textContent);x.loss+=parseMoneyCell(tr.cells[5]?.textContent);map.set(sg,x);});
      const wrap=document.createElement('div');wrap.className='tri-subgroup-summary';wrap.innerHTML='<div style="font-size:12px;font-weight:800;margin:8px 0">Разбивка по подгруппам из прайс-листа</div><div class="tri-table-wrap"><table class="tri-table" style="min-width:700px"><thead><tr><th>Подгруппа</th><th>SKU</th><th>Продажи</th><th>Прошлый период</th><th>Потеря</th><th></th></tr></thead><tbody>'+[...map.entries()].sort((a,b)=>b[1].cur-a[1].cur).map(([sg,x])=>'<tr><td><b>'+esc(sg)+'</b></td><td>'+x.count+'</td><td>'+triMoneyCompat(x.cur)+'</td><td>'+triMoneyCompat(x.prev)+'</td><td>'+triMoneyCompat(x.loss)+'</td><td><button class="tri-open-btn" onclick="v221FilterTriSubgroup('+di+',\''+escAttr(sg)+'\')">Открыть SKU</button></td></tr>').join('')+'</tbody></table></div><button class="btn-secondary" style="margin:8px 0" onclick="v221FilterTriSubgroup('+di+',\'all\')">Показать все SKU</button>';
      table.parentElement.parentElement.insertBefore(wrap,table.parentElement);
      d.dataset.subgroupEnhanced='1';
    });
  }
  function triMoneyCompat(v){return (Number(v)||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';}
  window.v221FilterTriSubgroup=function(detailIndex,subgroup){const d=document.querySelectorAll('#tri-details details')[detailIndex];if(!d)return;d.open=true;d.querySelectorAll('tbody tr').forEach(tr=>{if(tr.closest('.tri-subgroup-summary'))return;tr.style.display=subgroup==='all'||tr.dataset.subgroup===subgroup?'':'none';});d.scrollIntoView({behavior:'smooth',block:'start'});};
  function enhanceTriStock(){document.querySelectorAll('#tri-stock-table tbody tr').forEach(tr=>{if(tr.dataset.subgroupEnhanced==='1')return;const sku=tr.cells[2]?.querySelector('b')?.textContent||'',sg=priceSubgroup(sku,'');if(sg&&tr.cells[1])tr.cells[1].insertAdjacentHTML('beforeend','<div class="tri-note">'+esc(sg)+'</div>');tr.dataset.subgroupEnhanced='1';});}
  const baseTriRender=window.renderTriovist;window.renderTriovist=function(){baseTriRender();setTimeout(()=>{enhanceTriDetails();enhanceTriStock();},0);};
  const baseTriStock=window.renderTriovistStock;window.renderTriovistStock=function(){baseTriStock();setTimeout(enhanceTriStock,0);};

  // Месячные вкладки маршрутов и полный цикл согласования.
  let routeMonthBoss=localStorage.getItem('crm_route_month_boss')||ymNow();
  let routeMonthManager=localStorage.getItem('crm_route_month_manager')||ymNow();
  function monthText(ym){try{return new Date(ym+'-01T12:00:00').toLocaleDateString('ru-RU',{month:'long',year:'numeric'});}catch(_){return ym;}}
  function routeMonths(){const s=new Set([abcMonthShift(ymNow(),-1),ymNow(),abcMonthShift(ymNow(),1)]);(allRoutePlans||[]).forEach(r=>{const m=String(r.visit_date||'').slice(0,7);if(/^\d{4}-\d{2}$/.test(m))s.add(m);});return[...s].sort();}
  function installRouteUi(){
    const bossPage=document.getElementById('page-routes-boss');
    const bossTitle=bossPage?.querySelector('.page-title');
    // Маршрутные элементы должны жить ТОЛЬКО внутри страницы маршрутов.
    // В прежней версии parentElement.insertAdjacentHTML('afterend', ...) вставлял
    // блок после всей страницы, поэтому он отображался в Клиентах, Задачах, ВИП,
    // Акциях, ПДЗ и Поступлениях.
    ['route-month-tabs-boss','route-month-note-boss','route-v222-settings','route-day-tabs-boss-top'].forEach(id=>{
      const el=document.getElementById(id);
      if(el&&bossPage&&!bossPage.contains(el))el.remove();
    });
    if(bossPage&&bossTitle&&!document.getElementById('route-month-tabs-boss')){
      bossTitle.insertAdjacentHTML('afterend','<div id="route-month-tabs-boss" class="chips" style="margin-bottom:12px"></div><div id="route-month-note-boss" class="v20-period-warning" style="margin-bottom:12px">Маршрут формируется на месяц: руководитель создаёт проект, менеджер проверяет и отправляет на согласование, руководитель редактирует и утверждает. Клиенты с общим ассортиментом менее 15 SKU в маршрут не включаются — создаётся напоминание на прозвон.</div>');
    }
    const managerPage=document.getElementById('page-my-routes');
    const managerHead=managerPage?.querySelector('.page-title')?.parentElement;
    ['route-month-tabs-manager','route-manager-submit-wrap','route-day-tabs-manager'].forEach(id=>{
      const el=document.getElementById(id);
      if(el&&managerPage&&!managerPage.contains(el))el.remove();
    });
    if(managerHead&&!document.getElementById('route-month-tabs-manager'))managerHead.insertAdjacentHTML('afterend','<div id="route-month-tabs-manager" class="chips" style="margin:12px 0"></div><div id="route-manager-submit-wrap" style="margin-bottom:12px"></div>');
  }
  function drawRouteTabs(){installRouteUi();const months=routeMonths();const make=(id,sel,kind)=>{const el=document.getElementById(id);if(el)el.innerHTML=months.map(m=>'<button class="chip '+(m===sel?'active':'')+'" onclick="v221SelectRouteMonth(\''+kind+'\',\''+m+'\')">'+esc(monthText(m))+'</button>').join('');};make('route-month-tabs-boss',routeMonthBoss,'boss');make('route-month-tabs-manager',routeMonthManager,'manager');}
  window.v221SelectRouteMonth=function(kind,month){if(kind==='boss'){routeMonthBoss=month;localStorage.setItem('crm_route_month_boss',month);renderRoutesBoss();}else{routeMonthManager=month;localStorage.setItem('crm_route_month_manager',month);renderMyRoutes();}};
  function selectedRouteMonth(){return currentProfile?.role==='boss'?routeMonthBoss:routeMonthManager;}
  window.v18PendingRouteRows=function(){const q=String(document.getElementById('rb-approval-client')?.value||'').toLowerCase(),date=document.getElementById('rb-date-filter')?.value||'',mgr=(typeof rbMgrFilter!=='undefined'?rbMgrFilter:'all');return allRoutePlans.filter(r=>r.review_status==='pending'&&(!date||r.visit_date===date)&&(mgr==='all'||r.manager_name===mgr)&&(!q||String(r.client_name||'').toLowerCase().includes(q)));};
  window.v18RenderRouteApprovalQueue=function(){const root=document.getElementById('rb-content');if(!root)return;const rows=v18PendingRouteRows(),groups={};rows.forEach(r=>{const k=r.manager_name+'|'+r.visit_date;(groups[k]=groups[k]||[]).push(r);});root.style.display='block';root.innerHTML=Object.entries(groups).map(([k,list])=>{const [m,d]=k.split('|'),comment=list.find(x=>x.manager_comment)?.manager_comment||'';return '<div class="card" style="margin-bottom:10px;border-color:var(--am)"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>⚠ '+esc(m)+'</b> · '+esc(d)+(comment?'<div style="font-size:12px;margin-top:5px"><b>Комментарий менеджера:</b> '+esc(comment)+'</div>':'')+'<div style="font-size:12px;color:var(--sub);margin-top:4px">'+list.map(r=>(r.removed?'🗑 убрать: ':'➕ оставить: ')+esc(r.client_name)).join(' · ')+'</div></div><div style="display:flex;gap:6px"><button class="btn-primary" onclick="v18ApproveRouteGroup(\''+escAttr(m)+'\',\''+d+'\',true)">Согласовать</button><button class="btn-secondary" onclick="v18ApproveRouteGroup(\''+escAttr(m)+'\',\''+d+'\',false)">Отклонить</button></div></div></div>';}).join('')||'<div class="card" style="color:var(--sub)">Нет маршрутов, требующих согласования.</div>';};

  const baseRoutesBoss=window.renderRoutesBoss;
  window.renderRoutesBoss=function(){drawRouteTabs();const saved=allRoutePlans;allRoutePlans=saved.filter(r=>String(r.visit_date||'').startsWith(routeMonthBoss));try{baseRoutesBoss();}finally{allRoutePlans=saved;}const count=saved.filter(r=>String(r.visit_date||'').startsWith(routeMonthBoss)&&r.review_status==='pending'&&!r.removed).length;const t=document.querySelector('#page-routes-boss .page-title');if(t)t.textContent='📋 Маршруты · '+monthText(routeMonthBoss)+(count?' · '+count+' на согласовании':'');};
  const baseMyRoutes=window.renderMyRoutes;
  window.renderMyRoutes=function(){drawRouteTabs();const saved=allRoutePlans;allRoutePlans=saved.filter(r=>String(r.visit_date||'').startsWith(routeMonthManager));try{baseMyRoutes();}finally{allRoutePlans=saved;}const t=document.querySelector('#page-my-routes .page-title');if(t)t.textContent='📅 Мой маршрут · '+monthText(routeMonthManager);const drafts=saved.filter(r=>r.manager_name===currentProfile?.name&&String(r.visit_date||'').startsWith(routeMonthManager)&&r.review_status==='draft_manager');const pending=saved.filter(r=>r.manager_name===currentProfile?.name&&String(r.visit_date||'').startsWith(routeMonthManager)&&r.review_status==='pending');const w=document.getElementById('route-manager-submit-wrap');if(w)w.innerHTML=drafts.length?'<div class="card" style="background:#F5F3FF;border-color:#C4B5FD"><b>Проект маршрута готов к проверке: '+drafts.length+' точек.</b><div style="font-size:12px;color:var(--sub);margin:5px 0 10px">Добавьте или уберите точки, затем отправьте весь месяц руководителю.</div><button class="btn-primary" onclick="v221SubmitRouteMonth()">Отправить руководителю на согласование</button></div>':pending.length?'<div class="tri-warning">Маршрут отправлен руководителю и ожидает согласования.</div>':'';renderCallReminders();};

  window.v221SubmitRouteMonth=async function(){const rows=allRoutePlans.filter(r=>r.manager_name===currentProfile?.name&&String(r.visit_date||'').startsWith(routeMonthManager)&&r.review_status==='draft_manager');if(!rows.length){alert('Нет проекта для отправки.');return;}const comment=prompt('Комментарий руководителю по маршруту (можно оставить пустым):')||'';if(!confirm('Отправить маршрут за '+monthText(routeMonthManager)+' руководителю?'))return;const ids=rows.map(r=>r.id),upd={review_status:'pending',approved:false,source:'manager_review',manager_comment:comment||null,submitted_at:new Date().toISOString(),submitted_by:currentProfile?.name||null};const {error}=await db.from('route_plans').update(upd).in('id',ids);if(error){alert(error.message);return;}allRoutePlans=allRoutePlans.map(r=>ids.includes(r.id)?{...r,...upd}:r);renderMyRoutes();};

  function categoryVisits(cat){const n=String(cat||'').toUpperCase().replace(/\s/g,'');if(n.includes('ПЕРЕДАН'))return 2;if(n.includes('ОПТОВ')||n.includes('ИНТЕРНЕТ'))return 1;if(n==='AAA'||n==='ААА'||n==='A'||n==='А')return 4;if(n==='B'||n==='В')return 2;return 1;}
  function workdayDate(ym,day){const max=new Date(Number(ym.slice(0,4)),Number(ym.slice(5,7)),0).getDate();let d=new Date(Number(ym.slice(0,4)),Number(ym.slice(5,7))-1,Math.max(1,Math.min(max,day)),12);if(d.getDay()===6)d.setDate(d.getDate()-1);if(d.getDay()===0)d.setDate(d.getDate()+1);return toLocalDate(d);}
  function nextUniqueRouteDate(manager,client,ym,day,keys){for(let offset=0;offset<12;offset++){const d=workdayDate(ym,day+offset),k=manager+'|'+client+'|'+d;if(!keys.has(k)){keys.add(k);return d;}}const d=workdayDate(ym,day),k=manager+'|'+client+'|'+d;keys.add(k);return d;}
  window.generateNextMonthRoute=async function(){
    if(currentProfile?.role!=='boss')return;const baseMonth=routeMonthBoss,targetMonth=abcMonthShift(baseMonth,1);const existing=allRoutePlans.filter(r=>String(r.visit_date||'').startsWith(targetMonth)&&!r.removed);if(existing.length&&!confirm('На '+monthText(targetMonth)+' уже есть '+existing.length+' точек. Добавить только недостающих клиентов?'))return;
    const managers=(allUsers||[]).filter(isFieldManagerUser).map(u=>u.name);const existingKey=new Set(existing.map(r=>r.manager_name+'|'+r.client_name+'|'+r.visit_date));const rows=[],calls=[];
    for(const c of allClients.filter(x=>managers.includes(x.manager_name)&&x.client_status!=='Закрыт')){
      const sku=Number(c.sku_count);if(Number.isFinite(sku)&&sku<15){const due=monthEndForYm(targetMonth);const duplicate=(allTasks||[]).some(t=>t.client_id===c.id&&String(t.due_date||'').startsWith(targetMonth)&&String(t.source||'')==='route_call');if(!duplicate)calls.push({text:'📞 Прозвонить клиента вместо визита: общий ассортимент '+sku+' SKU (менее 15). Уточнить продажи, остатки и потребность.',due_date:due,done:false,manager_name:c.manager_name,client_id:c.id,source:'route_call',auto_generated:true,review_status:'approved'});continue;}
      const count=categoryVisits(c.role_type),base=allRoutePlans.filter(r=>r.manager_name===c.manager_name&&r.client_name===c.name&&String(r.visit_date||'').startsWith(baseMonth)&&!r.removed).sort((a,b)=>a.visit_date.localeCompare(b.visit_date));
      for(let i=0;i<count;i++){const defaultDay=Math.round((i+0.5)*(new Date(Number(targetMonth.slice(0,4)),Number(targetMonth.slice(5,7)),0).getDate()/count)),day=base[i]?Number(base[i].visit_date.slice(8,10)):defaultDay,date=nextUniqueRouteDate(c.manager_name,c.name,targetMonth,day,existingKey);rows.push({manager_name:c.manager_name,visit_date:date,client_name:c.name,city:c.city||c.region||'',address:c.address||'',category:c.role_type||'',approved:false,review_status:'draft_manager',source:'generated_regulation',reason:'Регламент: '+count+' посещ. в месяц; проект должен проверить менеджер',generated_month:targetMonth,removed:false});}
    }
    const chunk=async(table,data)=>{for(let i=0;i<data.length;i+=250){const {data:added,error}=await db.from(table).insert(data.slice(i,i+250)).select();if(error)throw error;if(table==='route_plans')allRoutePlans.push(...(added||[]));else allTasks.unshift(...(added||[]));}};
    try{await chunk('route_plans',rows);await chunk('tasks',calls);routeMonthBoss=targetMonth;localStorage.setItem('crm_route_month_boss',targetMonth);renderRoutesBoss();alert('Проект '+monthText(targetMonth)+' создан: '+rows.length+' точек. '+calls.length+' клиентов с ассортиментом менее 15 SKU переведены в напоминания на прозвон. Менеджеры должны проверить проект и отправить его на согласование.');}catch(e){alert('Не удалось сформировать проект: '+e.message);}
  };
  window.approveAllRoutes=async function(){const rows=allRoutePlans.filter(r=>String(r.visit_date||'').startsWith(routeMonthBoss)&&!r.removed&&r.review_status==='pending');if(!rows.length){alert('За выбранный месяц нет маршрутов на согласовании.');return;}if(!confirm('Согласовать '+rows.length+' точек за '+monthText(routeMonthBoss)+'?'))return;const ids=rows.map(r=>r.id),upd={approved:true,review_status:'approved',approved_by:currentProfile?.name||null,approved_at:new Date().toISOString()};const {error}=await db.from('route_plans').update(upd).in('id',ids);if(error){alert(error.message);return;}allRoutePlans=allRoutePlans.map(r=>ids.includes(r.id)?{...r,...upd}:r);renderRoutesBoss();};

  window.addRouteStop=async function(clientId){
    const c=allClients.find(x=>x.id===clientId);if(!c)return;const myName=currentProfile?.name,date=routeStopAddDate||workdayDate(routeMonthManager,15);
    const row={manager_name:myName,visit_date:date,client_name:c.name,city:c.city||c.region||'',address:c.address||'',category:c.role_type||'',approved:false,review_status:'draft_manager',source:'manager_draft',generated_month:routeMonthManager,removed:false};
    const {data,error}=await db.from('route_plans').insert(row).select().single();if(error){alert(error.message);return;}if(data)allRoutePlans.push(data);closeModal('modal-add-route-stop');renderMyRoutes();
  };
  window.removeRouteStop=async function(rowId,date){
    if(!confirm('Убрать точку из проекта маршрута?'))return;const upd={removed:true,approved:false,review_status:'draft_manager',source:'manager_draft'};const {error}=await db.from('route_plans').update(upd).eq('id',rowId);if(error){alert(error.message);return;}allRoutePlans=allRoutePlans.map(r=>String(r.id)===String(rowId)?{...r,...upd}:r);renderMyRoutes();
  };

  function renderCallReminders(){const root=document.getElementById('mr-content');if(!root)return;const rows=(allTasks||[]).filter(t=>t.manager_name===currentProfile?.name&&String(t.due_date||'').startsWith(routeMonthManager)&&String(t.source||'')==='route_call'&&!t.done);if(!rows.length)return;root.insertAdjacentHTML('afterbegin','<div class="card" style="margin-bottom:12px;border-color:#F59E0B"><div class="card-title">📞 Клиенты менее 15 SKU — прозвон вместо визита ('+rows.length+')</div>'+rows.map(t=>'<div style="display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-top:1px solid var(--border)"><div>'+esc(allClients.find(c=>c.id===t.client_id)?.name||'Клиент')+'<div class="tri-note">'+esc(t.text||'')+'</div></div><button class="btn-secondary" onclick="v221CompleteCall(\''+t.id+'\')">Зафиксировать звонок</button></div>').join('')+'</div>');}
  window.v221CompleteCall=async function(id){const result=prompt('Краткий результат звонка:');if(result===null||!result.trim())return;const upd={done:true,done_comment:result.trim(),fact_result:result.trim(),closed_by:currentProfile?.name||null,done_at:new Date().toISOString()};const {error}=await db.from('tasks').update(upd).eq('id',id);if(error){alert(error.message);return;}allTasks=allTasks.map(t=>String(t.id)===String(id)?{...t,...upd}:t);renderMyRoutes();};

  const baseLoadV221=window.loadData;window.loadData=async function(){await baseLoadV221();if(String(currentProfile?.access_scope||'').toLowerCase()==='triovist'){try{allPrice=await loadAllRows('price_list');}catch(e){console.warn('Прайс-лист для подгрупп Триовиста не загрузился',e);allPrice=[];}if(document.getElementById('page-triovist')?.classList.contains('active'))setTimeout(()=>window.renderTriovist?.(),0);}};

  const baseGo=window.goPage;window.goPage=function(p,title){return baseGo(p,title);};
  installRouteUi();drawRouteTabs();
  window.RESANTA_V221=Object.freeze({version:V221,monthRollover:true,fallingNotes:true,routeMonthWorkflow:true,triovistSubgroupsFromPrice:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 14 ===== */
// RESANTA CRM v22.1.1 · восстановление видимости маршрутов и защита от случайного формирования месяца
(function(){
  'use strict';
  const V2211='22.1.1';

  function ymShiftLocal(ym,delta){
    const a=String(ym||'').split('-').map(Number);
    const d=new Date(a[0]||new Date().getFullYear(),(a[1]||1)-1+delta,1,12);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  }
  function monthLabelLocal(ym){
    try{return new Date(ym+'-01T12:00:00').toLocaleDateString('ru-RU',{month:'long',year:'numeric'});}catch(_){return ym;}
  }
  function resetBossRouteFilters(){
    const approval=document.getElementById('rb-approval-filter');
    if(approval)approval.value='all';
    const date=document.getElementById('rb-date-filter');
    if(date)date.value='';
    const approvalClient=document.getElementById('rb-approval-client');
    if(approvalClient)approvalClient.value='';
    const search=document.getElementById('rb-search');
    if(search)search.value='';
    try{
      if(typeof rbMgrFilter!=='undefined')rbMgrFilter='all';
      document.querySelectorAll('#rb-mgr-chips .chip').forEach((b,i)=>b.classList.toggle('active',i===0));
    }catch(_){ }
  }

  // При переходе между месяцами всегда открываем «Все маршруты».
  // Ранее оставался фильтр «Требуют согласования», из-за чего согласованный июль
  // и черновик сентября выглядели как будто пропали.
  const selectMonthBase=window.v221SelectRouteMonth;
  if(typeof selectMonthBase==='function'){
    window.v221SelectRouteMonth=function(kind,month){
      if(kind==='boss')resetBossRouteFilters();
      return selectMonthBase(kind,month);
    };
  }

  // Если страница руководителя открывается после обновления, а старый фильтр
  // остался в DOM, показываем все маршруты выбранного месяца.
  const renderBossBase=window.renderRoutesBoss;
  if(typeof renderBossBase==='function'){
    window.renderRoutesBoss=function(){
      const selected=localStorage.getItem('crm_route_month_boss')||String(window.TODAY||new Date().toISOString().slice(0,10)).slice(0,7);
      const approval=document.getElementById('rb-approval-filter');
      const monthRows=(typeof allRoutePlans!=='undefined'?allRoutePlans:[]).filter(r=>String(r.visit_date||'').startsWith(selected)&&!r.removed);
      const pendingRows=monthRows.filter(r=>String(r.review_status||'')==='pending');
      // Автоматически сбрасываем только ложную пустоту: маршруты есть, а pending нет.
      if(approval&&approval.value==='pending'&&monthRows.length>0&&pendingRows.length===0){approval.value='all';}
      const result=renderBossBase();
      setTimeout(()=>{
        const root=document.getElementById('rb-content');
        if(root&&monthRows.length===0&&(!root.textContent||/не загружены|нет маршрутов/i.test(root.textContent))){
          root.innerHTML='<div class="card" style="color:var(--sub)">За '+monthLabelLocal(selected)+' маршрутов нет.</div>';
        }
      },0);
      return result;
    };
  }

  // Защита от повторного/случайного формирования следующего месяца.
  const generateBase=window.generateNextMonthRoute;
  if(typeof generateBase==='function'){
    window.generateNextMonthRoute=async function(){
      if(currentProfile?.role!=='boss')return;
      const baseMonth=localStorage.getItem('crm_route_month_boss')||String(window.TODAY||new Date().toISOString().slice(0,10)).slice(0,7);
      const targetMonth=ymShiftLocal(baseMonth,1);
      const existing=(typeof allRoutePlans!=='undefined'?allRoutePlans:[]).filter(r=>String(r.visit_date||'').startsWith(targetMonth)&&!r.removed);
      if(existing.length){
        resetBossRouteFilters();
        if(typeof window.v221SelectRouteMonth==='function')window.v221SelectRouteMonth('boss',targetMonth);
        alert('Проект на '+monthLabelLocal(targetMonth)+' уже существует: '+existing.length+' точек. Повторное формирование заблокировано, чтобы не создавать дубли.');
        return;
      }
      const typed=prompt('Будет создан проект на '+monthLabelLocal(targetMonth)+'.\nЧтобы продолжить, введите слово СОЗДАТЬ:');
      if(String(typed||'').trim().toUpperCase()!=='СОЗДАТЬ')return;
      return generateBase();
    };
  }

  // После загрузки данных гарантируем видимость выбранного месяца.
  const loadBase=window.loadData;
  if(typeof loadBase==='function'){
    window.loadData=async function(){
      const result=await loadBase();
      if(document.getElementById('page-routes-boss')?.classList.contains('active')){
        resetBossRouteFilters();
        setTimeout(()=>window.renderRoutesBoss?.(),0);
      }
      return result;
    };
  }

  window.RESANTA_V2211=Object.freeze({version:V2211,routeVisibilityFix:true,duplicateMonthGuard:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 15 ===== */
// ============================================================================
// RESANTA CRM v22.2 · аудит клиентов и месячный маршрут:
// руководитель формирует проект → совместное обсуждение с менеджером →
// руководитель окончательно утверждает и отправляет согласованный месяц.
(function(){
  'use strict';
  const V222='22.2.4';
  const FIELD_MANAGERS=['Руднев','Ачинович','Шкуран'];
  let v222Profiles={};
  let v222Workflows=[];
  let v222BossDay='';
  let v222ManagerDay='';

  const ymNow222=()=>String(window.TODAY||new Date().toISOString().slice(0,10)).slice(0,7);
  const bossMonth222=()=>localStorage.getItem('crm_route_month_boss')||ymNow222();
  const managerMonth222=()=>localStorage.getItem('crm_route_month_manager')||ymNow222();
  const monthEnd222=ym=>new Date(Number(ym.slice(0,4)),Number(ym.slice(5,7)),0).getDate();
  const localDate222=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const esc222=s=>typeof esc==='function'?esc(String(s??'')):String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const validCoord222=c=>Number.isFinite(Number(c?.lat))&&Number.isFinite(Number(c?.lng))&&Math.abs(Number(c.lat))>0.000001&&Math.abs(Number(c.lng))>0.000001;
  const profile222=c=>v222Profiles[String(c?.id)]||{route_mode:'auto'};
  const routeStatus222=r=>String(r?.review_status||(r?.approved?'approved':'boss_draft'));
  const workflow222=(manager,month)=>v222Workflows.find(x=>x.manager_name===manager&&x.route_month===month)||null;
  const potential222=c=>String(c?.client_status||'').trim().toLowerCase()==='потенциальный';
  function inferRouteRegion222(city,manager){
    const s=String(city||'').trim().toLowerCase().replace(/ё/g,'е');
    const mog=['могилев','бобруйск','быхов','горки','кировск','климовичи','кличев','костюковичи','краснополье','кричев','круглое','мстиславль','осиповичи','славгород','хотимск','чаусы','чериков','шклов','елизово','глуск','белыничи','дрибин'];
    const vit=['витебск','орша','полоцк','новополоцк','миоры','шарковщина','глубокое','поставы','лепель','сенно','браслав','верхнедвинск','городок','дубровно','докшицы','лиозно','толочин','ушачи','чашники','бешенковичи','россоны'];
    const gom=['гомель','мозырь','речица','жлобин','рогачев','калинковичи','светлогорск','хойники','чечерск','добруш','ветка','петриков','туров','лельчицы','буда-кошелево','наровля','ельск','октябрьский','лоев','брагин','тереховка'];
    if(mog.some(x=>s.includes(x)))return'Могилёвская область';
    if(vit.some(x=>s.includes(x)))return'Витебская область';
    if(gom.some(x=>s.includes(x)))return'Гомельская область';
    if(manager==='Ачинович')return'Могилёвская область';
    if(manager==='Шкуран')return'Гомельская область';
    return'';
  }
  function routeCity222(c){
    const p=profile222(c);
    return String(p.route_city||c?.city||c?.region||'Без города').trim()||'Без города';
  }
  function routeRegion222(c){
    const p=profile222(c);
    return String(p.route_region||inferRouteRegion222(routeCity222(c),c?.manager_name)||'').trim();
  }
  function routeLocation222(c){return [routeCity222(c),routeRegion222(c),String(c?.address||'').trim()].filter(Boolean).join(' · ');}
  window.v224RouteCity=routeCity222;
  window.v224RouteRegion=routeRegion222;
  window.v224RouteLocation=routeLocation222;

  function routeCategory222(c){
    const n=String(c?.role_type||'').toUpperCase().replace(/\s/g,'');
    if(n.includes('ПЕРЕДАН'))return'Передан на 3%';
    if(n.includes('ОПТОВ'))return'Оптовик';
    if(n.includes('ИНТЕРНЕТ'))return'Интернет';
    if(n==='AAA'||n==='ААА')return'AAA';
    if(n==='A'||n==='А')return'A';
    if(n==='B'||n==='В')return'B';
    return'C';
  }
  function visits222(c){
    if(potential222(c))return 1;
    const cat=routeCategory222(c);
    if(cat==='AAA'||cat==='A')return 4;
    if(cat==='B'||cat==='Передан на 3%')return 2;
    return 1;
  }
  function plannedMinutes222(c){
    if(potential222(c))return 60;
    const cat=routeCategory222(c);
    if(cat==='AAA'||cat==='A')return 90;
    if(cat==='B')return 60;
    return 45;
  }
  function routeReadiness222(c){
    const p=profile222(c),sku=Number(c?.sku_count)||0,our=Number(c?.sku_our)||0;
    if(String(c?.client_status||'').toLowerCase()==='закрыт'||p.route_mode==='exclude')return{kind:'exclude',reason:p.manager_note||'Клиент закрыт или исключён'};
    if(p.route_mode==='manual')return{kind:'manual',reason:p.manager_note||'Требуется решение руководителя'};
    if(!String(c?.address||'').trim())return{kind:'review',reason:'Нет адреса'};
    if(!validCoord222(c))return{kind:'review',reason:'Нет подтверждённых координат'};
    if(potential222(c))return{kind:'ready',reason:'Потенциальная ТТ — обязательный первичный визит'};
    if(p.route_mode==='call'||sku<15)return{kind:'call',reason:p.manager_note||('Общий ассортимент '+sku+' SKU — прозвон вместо визита')};
    if(our>sku)return{kind:'review',reason:'Наше SKU больше общего SKU'};
    if(!String(c?.role_type||'').trim())return{kind:'review',reason:'Нет категории'};
    return{kind:'ready',reason:'Готов к маршруту'};
  }
  function selectedManagers222(){
    try{
      if(typeof rbMgrFilter!=='undefined'&&FIELD_MANAGERS.includes(rbMgrFilter))return[rbMgrFilter];
    }catch(_){}
    return FIELD_MANAGERS.slice();
  }
  function statusLabel222(status){
    return({boss_draft:'Проект руководителя',joint_review:'Совместное обсуждение',approved:'Согласован и отправлен',cancelled:'Отменён'})[status]||'Проект';
  }
  let v222LoadedAt=0;
  async function loadV222(force=false){
    if(!force&&v222LoadedAt&&Date.now()-v222LoadedAt<60000)return false;
    try{
      const [p,w]=await Promise.all([
        loadAllRows('client_route_profiles'),
        loadAllRows('route_month_workflow')
      ]);
      v222Profiles={};(p||[]).forEach(x=>v222Profiles[String(x.client_id)]=x);
      v222Workflows=w||[];v222LoadedAt=Date.now();return true;
    }catch(e){console.warn('v22.2 route data',e);v222Profiles={};v222Workflows=[];v222LoadedAt=Date.now();return true;}
  }
  async function upsertWorkflow222(row){
    const full={...row,updated_at:new Date().toISOString()};
    const {data,error}=await db.from('route_month_workflow').upsert(full,{onConflict:'manager_name,route_month'}).select().single();
    if(error)throw error;
    v222Workflows=v222Workflows.filter(x=>!(x.manager_name===full.manager_name&&x.route_month===full.route_month));
    v222Workflows.push(data||full);
    return data||full;
  }

  function installUi222(){
    const old=document.getElementById('gen-next-month-btn');
    if(old){
      old.textContent='🧭 Сформировать проект на выбранный месяц';
      old.onclick=()=>window.generateNextMonthRoute();
    }
    const approve=[...document.querySelectorAll('#page-routes-boss button')].find(b=>/Согласовать все|Утвердить и отправить/i.test(b.textContent||''));
    if(approve){approve.textContent='✅ Утвердить и отправить месяц';approve.onclick=()=>window.approveAllRoutes();}
    const approval=document.getElementById('rb-approval-filter');
    if(approval&&approval.dataset.v222!=='1'){
      approval.innerHTML='<option value="all">Все статусы</option><option value="boss_draft">Проект руководителя</option><option value="joint_review">Изменения менеджера</option><option value="approved">Согласованные</option>';
      approval.value='all';approval.dataset.v222='1';
    }
    const tabs=document.getElementById('route-month-tabs-boss');
    if(tabs&&!document.getElementById('route-v222-settings')){
      tabs.insertAdjacentHTML('afterend',
        '<div id="route-v222-settings" class="card" style="margin-bottom:12px;padding:12px">'
        +'<div style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">'
        +'<label><span class="form-label">Офисный день</span><select id="route-v222-office" class="form-input" style="width:150px"><option value="1">Понедельник</option><option value="2">Вторник</option><option value="3">Среда</option><option value="4">Четверг</option><option value="5" selected>Пятница</option></select></label>'
        +'<label><span class="form-label">Макс. точек в день</span><select id="route-v222-max" class="form-input" style="width:120px"><option>4</option><option>5</option><option>6</option><option>7</option><option>8</option><option>9</option><option>10</option><option>11</option><option>12</option><option>13</option><option>14</option><option selected>15</option></select></label>'
        +'<button class="btn-secondary" onclick="v222ShowReadiness()">Проверить готовность</button>'
        +'</div><div id="route-v222-workflow" style="margin-top:10px"></div><div id="route-v222-precheck" style="margin-top:8px"></div>'
        +'<div id="route-day-tabs-boss" class="chips" style="margin-top:10px"></div></div>');
    }
    const bossContent=document.getElementById('rb-content');
    if(bossContent&&!document.getElementById('route-day-tabs-boss-top')){
      bossContent.insertAdjacentHTML('beforebegin','<div id="route-day-tabs-boss-top" class="chips" style="position:sticky;top:0;z-index:25;background:#fff;padding:9px 4px;margin:0 0 10px;border-bottom:1px solid var(--border);box-shadow:0 3px 8px rgba(15,23,42,.06)"></div>');
    }
    const managerTabs=document.getElementById('route-month-tabs-manager');
    if(managerTabs&&!document.getElementById('route-day-tabs-manager')){
      managerTabs.insertAdjacentHTML('afterend','<div id="route-day-tabs-manager" class="chips" style="margin:0 0 10px"></div>');
    }
  }

  function drawWorkflow222(){
    const root=document.getElementById('route-v222-workflow');if(!root)return;
    const month=bossMonth222(),managers=selectedManagers222();
    root.innerHTML=managers.map(m=>{
      const w=workflow222(m,month),s=w?.status||'нет проекта';
      const color=s==='approved'?'var(--g)':s==='joint_review'?'var(--am)':'var(--at)';
      return'<span class="tag" style="margin-right:6px;background:var(--bg);color:'+color+'"><b>'+esc222(m)+'</b>: '+esc222(statusLabel222(s))+'</span>';
    }).join('');
  }
  function dayRows222(kind){
    const month=kind==='boss'?bossMonth222():managerMonth222();
    const manager=kind==='manager'?currentProfile?.name:null;
    return(allRoutePlans||[]).filter(r=>String(r.visit_date||'').startsWith(month)&&!r.removed&&(!manager||r.manager_name===manager));
  }
  function drawDayTabs222(kind){
    const ids=kind==='boss'?['route-day-tabs-boss-top','route-day-tabs-boss']:['route-day-tabs-manager'];
    const roots=ids.map(id=>document.getElementById(id)).filter(Boolean);if(!roots.length)return;
    const selected=kind==='boss'?v222BossDay:v222ManagerDay;
    const counts={};dayRows222(kind).forEach(r=>counts[r.visit_date]=(counts[r.visit_date]||0)+1);
    const dates=Object.keys(counts).sort();
    const tabs='<button class="chip '+(!selected?'active':'')+'" onclick="v222SelectRouteDay(\''+kind+'\',\'\')">Весь месяц</button>'
      +dates.map(d=>'<button class="chip '+(selected===d?'active':'')+'" onclick="v222SelectRouteDay(\''+kind+'\',\''+d+'\')">'+d.slice(8,10)+'.'+d.slice(5,7)+' · '+counts[d]+'</button>').join('');
    roots.forEach(root=>root.innerHTML=tabs);
  }
  window.v222SelectRouteDay=function(kind,date){
    if(kind==='boss'){
      v222BossDay=date;
      const el=document.getElementById('rb-date-filter');if(el)el.value=date;
      window.renderRoutesBoss?.();
    }else{v222ManagerDay=date;window.renderMyRoutes?.();}
  };

  function readiness222(managers){
    const result={};
    managers.forEach(m=>result[m]={ready:[],call:[],review:[],manual:[],exclude:[]});
    (allClients||[]).filter(c=>managers.includes(c.manager_name)).forEach(c=>{
      const r=routeReadiness222(c);(result[c.manager_name][r.kind]||result[c.manager_name].review).push({c,reason:r.reason});
    });
    return result;
  }
  window.v222ShowReadiness=function(){
    installUi222();const result=readiness222(selectedManagers222()),root=document.getElementById('route-v222-precheck');if(!root)return;
    root.innerHTML=Object.entries(result).map(([m,x])=>
      '<div style="font-size:12px;line-height:1.55;margin-top:6px"><b>'+esc222(m)+'</b>: '
      +'<span style="color:var(--g)">готовы '+x.ready.length+'</span> · '
      +'<span style="color:var(--am)">прозвон '+x.call.length+'</span> · '
      +'<span style="color:var(--r)">не готовы '+x.review.length+'</span> · '
      +'ручное решение '+x.manual.length+' · исключены '+x.exclude.length
      +(x.review.length?'<details style="margin-top:4px"><summary>Показать первые проблемные карточки</summary>'+x.review.slice(0,30).map(v=>'<div>• '+esc222(v.c.name)+' — '+esc222(v.reason)+'</div>').join('')+'</details>':'')
      +'</div>').join('');
  };

  function fieldDates222(ym,officeDow){
    const out=[],weeks={};
    for(let day=1;day<=monthEnd222(ym);day++){
      const d=new Date(Number(ym.slice(0,4)),Number(ym.slice(5,7))-1,day,12);
      const js=d.getDay(),dow=js===0?7:js;
      if(dow>5||dow===officeDow)continue;
      const monday=new Date(d);monday.setDate(d.getDate()-(dow-1));
      const wk=localDate222(monday);
      const ds=localDate222(d);out.push(ds);(weeks[wk]=weeks[wk]||[]).push(ds);
    }
    return{dates:out,weeks};
  }
  function hash222(s){let h=2166136261;for(const ch of String(s||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return Math.abs(h>>>0);}
  function zone222(c){return [routeRegion222(c),routeCity222(c)].filter(Boolean).join(' / ')||'Без города';}
  function distance222(a,b){const dx=Number(a.lat)-Number(b.lat),dy=Number(a.lng)-Number(b.lng);return dx*dx+dy*dy;}
  function orderPoints222(items){
    if(items.length<2)return items.slice();
    const cx=items.reduce((s,x)=>s+Number(x.c.lat),0)/items.length,cy=items.reduce((s,x)=>s+Number(x.c.lng),0)/items.length;
    let first=items.reduce((best,x)=>{const d=(Number(x.c.lat)-cx)**2+(Number(x.c.lng)-cy)**2;return!best||d>best.d?{x,d}:best;},null).x;
    const left=items.slice(),out=[];let cur=first;
    while(left.length){let idx=left.indexOf(cur);if(idx<0)idx=0;cur=left.splice(idx,1)[0];out.push(cur);if(left.length)cur=left.reduce((best,x)=>distance222(cur.c,x.c)<distance222(cur.c,best.c)?x:best,left[0]);}
    return out;
  }
  function scheduleManager222(manager,clients,ym,officeDow,maxPoints,batchId){
    const fd=fieldDates222(ym,officeDow),weekKeys=Object.keys(fd.weeks).sort();
    if(!weekKeys.length)throw new Error('В месяце нет доступных полевых дней');
    const occurrences=[];
    clients.forEach(c=>{
      const count=visits222(c),seed=hash222(c.id)%weekKeys.length;
      for(let i=0;i<count;i++){
        const wi=(seed+Math.floor(i*weekKeys.length/count))%weekKeys.length;
        occurrences.push({c,week:weekKeys[wi],occurrence:i+1});
      }
    });
    const assigned=[];
    weekKeys.forEach(wk=>{
      const weekDates=fd.weeks[wk],dayLoads=Object.fromEntries(weekDates.map(d=>[d,0])),dayZones=Object.fromEntries(weekDates.map(d=>[d,new Set()]));
      const byZone={};occurrences.filter(o=>o.week===wk).forEach(o=>(byZone[zone222(o.c)]=byZone[zone222(o.c)]||[]).push(o));
      Object.entries(byZone).sort((a,b)=>b[1].length-a[1].length).forEach(([z,list])=>{
        const ordered=orderPoints222(list);
        for(let i=0;i<ordered.length;i+=maxPoints){
          const chunk=ordered.slice(i,i+maxPoints);
          let candidates=weekDates.filter(d=>dayLoads[d]+chunk.length<=maxPoints);
          if(!candidates.length)candidates=weekDates.slice();
          candidates.sort((a,b)=>{
            const az=dayZones[a].has(z)?0:1,bz=dayZones[b].has(z)?0:1;
            return az-bz||dayLoads[a]-dayLoads[b]||a.localeCompare(b);
          });
          const date=candidates[0];dayZones[date].add(z);
          chunk.forEach(o=>{assigned.push({...o,date,zone:z});dayLoads[date]++;});
        }
      });
    });
    const byDate={};assigned.forEach(x=>(byDate[x.date]=byDate[x.date]||[]).push(x));
    const rows=[];
    Object.keys(byDate).sort().forEach(date=>{
      const ordered=orderPoints222(byDate[date]);ordered.forEach((o,idx)=>{
        const c=o.c;
        rows.push({
          client_id:c.id,manager_name:manager,visit_date:date,client_name:c.name,
          city:routeCity222(c),region:routeRegion222(c),address:c.address||'',category:routeCategory222(c),
          approved:false,review_status:'boss_draft',source:'boss_draft',
          generated_month:ym,route_batch_id:batchId,route_zone:o.zone,
          sort_order:idx+1,planned_minutes:plannedMinutes222(c),removed:false,
          reason:potential222(c)?'Потенциальная ТТ: первичный визит, оценка потенциала и подключение клиента · проект руководителя':'Регламент: '+visits222(c)+' посещ. в месяц · проект руководителя'
        });
      });
    });
    return rows;
  }
  async function chunks222(table,action,data){
    for(let i=0;i<data.length;i+=200){
      const part=data.slice(i,i+200);
      let q=db.from(table);
      const res=action==='insert'?await q.insert(part).select():await q.update(part);
      if(res.error)throw res.error;
      if(table==='route_plans'&&action==='insert')allRoutePlans.push(...(res.data||[]));
    }
  }
  async function updateIds222(table,ids,patch){
    for(let i=0;i<ids.length;i+=200){
      const {error}=await db.from(table).update(patch).in('id',ids.slice(i,i+200));
      if(error)throw error;
    }
  }

  window.generateNextMonthRoute=async function(){
    if(currentProfile?.role!=='boss')return;
    installUi222();
    const ym=bossMonth222(),current=ymNow222();
    if(ym<current){alert('Проект нельзя формировать на прошедший месяц. Выберите текущий или будущий месяц.');return;}
    const managers=selectedManagers222(),officeDow=Number(document.getElementById('route-v222-office')?.value||5),maxPoints=Math.min(15,Math.max(1,Number(document.getElementById('route-v222-max')?.value||15)));
    const active=(allRoutePlans||[]).filter(r=>managers.includes(r.manager_name)&&String(r.visit_date||'').startsWith(ym)&&!r.removed);
    const visited=active.filter(r=>r.visited);
    if(visited.length){alert('В выбранном месяце уже есть '+visited.length+' посещённых точек. Автоматическая замена заблокирована.');return;}
    if(active.length){
      const approved=active.some(r=>r.approved||routeStatus222(r)==='approved');
      const word=approved?'ПЕРЕСОЗДАТЬ':'ЗАМЕНИТЬ';
      const typed=prompt('На выбранный месяц уже есть '+active.length+' точек. Старый проект будет сохранён в базе как убранный.\nВведите '+word+':');
      if(String(typed||'').trim().toUpperCase()!==word)return;
      const ids=active.map(r=>r.id);try{await updateIds222('route_plans',ids,{removed:true,approved:false,source:'superseded_v222'});}catch(e){alert(e.message);return;}
      allRoutePlans=allRoutePlans.map(r=>ids.includes(r.id)?{...r,removed:true,approved:false,source:'superseded_v222'}:r);
    }else{
      const typed=prompt('Сформировать проект маршрута на '+ym+' для: '+managers.join(', ')+'?\nВведите СОЗДАТЬ:');
      if(String(typed||'').trim().toUpperCase()!=='СОЗДАТЬ')return;
    }
    const check=readiness222(managers),batchId='v222-'+ym+'-'+Date.now(),routeRows=[],callTasks=[];
    for(const manager of managers){
      const ready=check[manager].ready.map(x=>x.c);
      routeRows.push(...scheduleManager222(manager,ready,ym,officeDow,maxPoints,batchId));
      for(const x of check[manager].call){
        const c=x.c,duplicate=(allTasks||[]).some(t=>String(t.client_id)===String(c.id)&&String(t.due_date||'').startsWith(ym)&&String(t.source||'')==='route_call'&&!t.done);
        if(!duplicate)callTasks.push({text:'📞 Прозвонить клиента вместо визита: '+x.reason+'. Зафиксировать потребность и следующее действие.',due_date:ym+'-10',done:false,manager_name:manager,client_id:c.id,source:'route_call'});
      }
    }
    try{
      for(let i=0;i<routeRows.length;i+=200){const {data,error}=await db.from('route_plans').insert(routeRows.slice(i,i+200)).select();if(error)throw error;allRoutePlans.push(...(data||[]));}
      for(let i=0;i<callTasks.length;i+=200){const {data,error}=await db.from('tasks').insert(callTasks.slice(i,i+200)).select();if(error)throw error;allTasks.unshift(...(data||[]));}
      for(const manager of managers)await upsertWorkflow222({manager_name:manager,route_month:ym,status:'boss_draft',office_weekday:officeDow,max_points_day:maxPoints,created_by:currentProfile?.name||null,created_at:new Date().toISOString(),boss_comment:null,manager_comment:null,approved_by:null,approved_at:null});
      const filter=document.getElementById('rb-approval-filter');if(filter)filter.value='all';
      v222BossDay='';const date=document.getElementById('rb-date-filter');if(date)date.value='';
      window.renderRoutesBoss?.();
      alert('Проект на '+ym+' сформирован.\nТочек: '+routeRows.length+'.\nПрозвонов: '+callTasks.length+'.\nНе готовы к маршруту: '+managers.reduce((s,m)=>s+check[m].review.length,0)+'.\nТеперь обсудите проект с каждым менеджером и после корректировок утвердите весь месяц.');
    }catch(e){alert('Не удалось сформировать проект: '+(e.message||e));}
  };

  window.v222SaveManagerRouteComment=async function(){
    const manager=currentProfile?.name,ym=managerMonth222();if(!FIELD_MANAGERS.includes(manager))return;
    const old=workflow222(manager,ym)?.manager_comment||'',comment=prompt('Комментарий по проекту маршрута:',old);if(comment===null)return;
    try{await upsertWorkflow222({manager_name:manager,route_month:ym,status:'joint_review',manager_comment:comment.trim()||null,manager_reviewed_by:manager,manager_reviewed_at:new Date().toISOString()});window.renderMyRoutes?.();}catch(e){alert(e.message);}
  };
  window.v221SubmitRouteMonth=function(){alert('Новый порядок: маршрут формирует руководитель, затем вы обсуждаете его вместе. Финально утверждает и отправляет руководитель.');};

  window.addRouteStop=async function(clientId){
    const c=allClients.find(x=>String(x.id)===String(clientId));if(!c)return;
    const manager=currentProfile?.name,ym=managerMonth222(),w=workflow222(manager,ym);
    if(w?.status==='approved'){alert('Согласованный месяц нельзя изменять. Обратитесь к руководителю.');return;}
    const ready=routeReadiness222(c);if(['exclude','call'].includes(ready.kind)){alert('Эта карточка не предназначена для полевого визита: '+ready.reason);return;}
    const date=routeStopAddDate||ym+'-15';
    const row={client_id:c.id,manager_name:manager,visit_date:date,client_name:c.name,city:routeCity222(c),region:routeRegion222(c),address:c.address||'',category:routeCategory222(c),approved:false,review_status:'joint_review',source:'manager_suggestion',generated_month:ym,manager_suggested:true,removed:false};
    const {data,error}=await db.from('route_plans').insert(row).select().single();if(error){alert(error.message);return;}if(data)allRoutePlans.push(data);
    try{await upsertWorkflow222({manager_name:manager,route_month:ym,status:'joint_review',manager_reviewed_by:manager,manager_reviewed_at:new Date().toISOString()});}catch(e){}
    closeModal('modal-add-route-stop');window.renderMyRoutes?.();
  };
  window.removeRouteStop=async function(rowId,date){
    const r=allRoutePlans.find(x=>String(x.id)===String(rowId));if(!r)return;
    const ym=String(date||r.visit_date||'').slice(0,7),w=workflow222(r.manager_name,ym);
    if(w?.status==='approved'){alert('Согласованный месяц нельзя изменять. Обратитесь к руководителю.');return;}
    if(!confirm('Предложить убрать точку из проекта? Изменение увидит руководитель.'))return;
    const upd={removed:true,approved:false,review_status:'joint_review',source:'manager_suggestion',manager_suggested:true};
    const {error}=await db.from('route_plans').update(upd).eq('id',rowId);if(error){alert(error.message);return;}Object.assign(r,upd);
    try{await upsertWorkflow222({manager_name:r.manager_name,route_month:ym,status:'joint_review',manager_reviewed_by:currentProfile?.name||null,manager_reviewed_at:new Date().toISOString()});}catch(e){}
    window.renderMyRoutes?.();
  };

  window.approveDayRoute=function(){alert('Финально утверждается весь месяц после обсуждения с менеджером. Используйте кнопку «Утвердить и отправить месяц».');};
  window.rejectDayRoute=function(){alert('Исправьте проект совместно с менеджером. Отдельный день не отклоняется — финально утверждается весь месяц.');};
  window.approveAllRoutes=async function(){
    if(currentProfile?.role!=='boss')return;
    const ym=bossMonth222(),managers=selectedManagers222();
    const rows=(allRoutePlans||[]).filter(r=>managers.includes(r.manager_name)&&String(r.visit_date||'').startsWith(ym)&&!r.removed&&!r.visited);
    if(!rows.length){alert('Нет активного проекта за выбранный месяц.');return;}
    const typed=prompt('Будет утверждено и отправлено менеджерам '+rows.length+' точек за '+ym+'.\nВведите УТВЕРДИТЬ:');
    if(String(typed||'').trim().toUpperCase()!=='УТВЕРДИТЬ')return;
    const now=new Date().toISOString(),ids=rows.map(r=>r.id),patch={approved:true,review_status:'approved',published_by:currentProfile?.name||null,published_at:now,approved_by:currentProfile?.name||null,approved_at:now};
    try{
      await updateIds222('route_plans',ids,patch);allRoutePlans=allRoutePlans.map(r=>ids.includes(r.id)?{...r,...patch}:r);
      for(const manager of managers)await upsertWorkflow222({manager_name:manager,route_month:ym,status:'approved',approved_by:currentProfile?.name||null,approved_at:now});
      const filter=document.getElementById('rb-approval-filter');if(filter)filter.value='approved';
      window.renderRoutesBoss?.();alert('Маршрут за '+ym+' утверждён и отправлен менеджерам. Точек: '+rows.length+'.');
    }catch(e){alert('Не удалось утвердить месяц: '+(e.message||e));}
  };

  const renderBossOld=window.renderRoutesBoss;
  window.renderRoutesBoss=function(){
    installUi222();
    const saved=allRoutePlans,filter=document.getElementById('rb-approval-filter')?.value||'all';
    let subset=saved.slice().sort((a,b)=>String(a.visit_date||'').localeCompare(String(b.visit_date||''))||(Number(a.sort_order)||999)-(Number(b.sort_order)||999));
    if(filter!=='all')subset=subset.filter(r=>routeStatus222(r)===filter);
    if(v222BossDay)subset=subset.filter(r=>r.visit_date===v222BossDay);
    allRoutePlans=subset;
    try{renderBossOld?.();}finally{allRoutePlans=saved;}
    installUi222();drawWorkflow222();drawDayTabs222('boss');
  };

  const renderManagerOld=window.renderMyRoutes;
  window.renderMyRoutes=function(){
    installUi222();
    const saved=allRoutePlans;
    let subset=saved.slice().sort((a,b)=>String(a.visit_date||'').localeCompare(String(b.visit_date||''))||(Number(a.sort_order)||999)-(Number(b.sort_order)||999));
    if(v222ManagerDay)subset=subset.filter(r=>r.visit_date===v222ManagerDay);
    allRoutePlans=subset;
    try{renderManagerOld?.();}finally{allRoutePlans=saved;}
    installUi222();drawDayTabs222('manager');
    const manager=currentProfile?.name,ym=managerMonth222(),w=workflow222(manager,ym),wrap=document.getElementById('route-manager-submit-wrap');
    if(wrap&&FIELD_MANAGERS.includes(manager)){
      const status=w?.status||'boss_draft';
      wrap.innerHTML='<div class="card" style="background:#F5F3FF;border-color:#C4B5FD"><b>'+esc222(statusLabel222(status))+'</b>'
        +'<div style="font-size:12px;color:var(--sub);margin:5px 0 10px">'
        +(status==='approved'?'Маршрут утверждён руководителем и является рабочим на месяц.':'Проект сформировал руководитель. Обсудите даты и точки вместе. Вы можете предложить добавить или убрать точку; финально утверждает руководитель.')
        +'</div>'+(status!=='approved'?'<button class="btn-secondary" onclick="v222SaveManagerRouteComment()">Комментарий руководителю</button>':'')
        +(w?.manager_comment?'<div class="tri-note" style="margin-top:6px">Комментарий: '+esc222(w.manager_comment)+'</div>':'')+'</div>';
    }
  };

  const selectMonthOld=window.v221SelectRouteMonth;
  if(typeof selectMonthOld==='function')window.v221SelectRouteMonth=function(kind,month){
    if(kind==='boss')v222BossDay='';else v222ManagerDay='';
    const result=selectMonthOld(kind,month);setTimeout(()=>{installUi222();drawWorkflow222();drawDayTabs222(kind);},0);return result;
  };

  const loadOld=window.loadData;
  window.loadData=async function(){const result=await loadOld();installUi222();return result;};

  window.crmPrefetchRouteWorkflowV22734=()=>loadV222(false);
  const goOld=window.goPage;
  window.goPage=function(page,title){const out=goOld(page,title);if(page==='routes-boss'||page==='my-routes')crmSchedulePageHook(page,async()=>{const refreshed=await loadV222();if(crmActivePage()!==page)return;installUi222();if(refreshed&&page==='my-routes')window.renderMyRoutes?.();},15);return out;};

  installUi222();
  window.RESANTA_V222=Object.freeze({version:V222,leaderFirst:true,jointReview:true,monthlyPublish:true,clientAuditImported:true,potentialClientsInRoute:true,cityRegionAddress:true,stickyDateTabs:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 16 ===== */
// ============================================================================
// RESANTA CRM GPS hotfix v20.8.1
// Без APK и кабеля: обновляет сессию старой GPS-службы, мягко перезапускает
// только Android-сервис и отправляет накопленную локальную очередь в CRM.
// Рабочий день в CRM не завершается, очередь не очищается.
// ============================================================================
(function(){
  const VERSION='20.8.1';
  let busy=false;
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const errText=e=>String(e?.message||e||'Неизвестная ошибка');

  async function freshSession(){
    let session=null;
    try{
      const refreshed=await db.auth.refreshSession();
      session=refreshed?.data?.session||null;
    }catch(_){ }
    if(!session){
      try{session=(await db.auth.getSession())?.data?.session||null;}catch(_){ }
    }
    if(!session)throw new Error('Сессия CRM истекла. Нажмите «Выйти», войдите заново и повторите отправку. Очередь GPS при этом не удаляется.');
    return session;
  }

  function queueCount(status){return Math.max(0,Number(status?.queueSize)||0);}

  window.v209ReconnectLegacyGps=async function(){
    if(busy)return;
    if(!v19MyWorkday?.id){alert('Активный рабочий день не найден.');return;}
    const tracker=typeof v19NativeTracker==='function'?v19NativeTracker():null;
    if(!tracker||typeof tracker.start!=='function'){
      alert('Откройте именно установленное приложение «Ресанта CRM», а не сайт в браузере.');
      return;
    }
    const ok=confirm('Восстановить связь GPS с CRM и отправить накопленные точки?\n\nБудет перезапущена только GPS-служба Android. Рабочий день НЕ завершится, локальная очередь НЕ удаляется.');
    if(!ok)return;
    busy=true;
    const btn=document.getElementById('v209-gps-reconnect-btn');
    if(btn){btn.disabled=true;btn.textContent='Обновляю связь…';}
    try{
      const before=await v19NativeStatus();
      const beforeQueue=queueCount(before);
      const session=await freshSession();
      const payload={
        workdayId:String(v19MyWorkday.id),
        userId:String(currentUser?.id||''),
        managerName:currentProfile?.name||currentUser?.email||'',
        supabaseUrl:SUPABASE_URL,
        anonKey:SUPABASE_KEY,
        accessToken:session.access_token,
        refreshToken:session.refresh_token||'',
        intervalMs:30000,
        minDistanceM:50
      };

      // Современной службе передаём сессию напрямую.
      if(typeof tracker.updateSession==='function'){
        try{await tracker.updateSession({accessToken:session.access_token,refreshToken:session.refresh_token||''});}catch(_){ }
      }

      // Старая GPS-служба могла игнорировать новые токены, пока уже запущена.
      // Поэтому мягко перезапускаем только native-service, НЕ закрывая рабочий день.
      if(typeof tracker.stop==='function'){
        await tracker.stop();
        await sleep(1200);
      }
      await tracker.start(payload);
      if(typeof tracker.ensureRunning==='function'){
        try{await tracker.ensureRunning();}catch(_){ }
      }
      if(typeof tracker.flush==='function'){
        try{await tracker.flush();}catch(_){ }
      }

      await sleep(7000);
      const after=await v19NativeStatus();
      const afterQueue=queueCount(after);
      await v19RenderManagerWorkday();
      await v19RenderWorkdayCard();

      if(afterQueue===0){
        alert('✅ Все накопленные GPS-точки отправлены в CRM.\n\nНе завершайте рабочий день, пока руководитель не увидит пробег.');
      }else if(afterQueue<beforeQueue){
        alert('✅ Связь восстановлена. Отправка началась.\n\nБыло в очереди: '+beforeQueue+'\nОсталось: '+afterQueue+'\n\nОставьте приложение открытым и интернет включённым на 2–5 минут.');
      }else{
        alert('GPS-служба перезапущена с новой сессией.\n\nВ очереди осталось: '+afterQueue+'. Оставьте приложение открытым и интернет включённым на 2–5 минут, затем нажмите кнопку ещё раз.\n\nПриложение не удаляйте и рабочий день не завершайте.');
      }
    }catch(e){
      alert('Не удалось восстановить отправку GPS:\n'+errText(e)+'\n\nПриложение не удаляйте — накопленные точки остаются на устройстве.');
    }finally{
      busy=false;
      const b=document.getElementById('v209-gps-reconnect-btn');
      if(b){b.disabled=false;b.textContent='↻ Обновить связь и отправить очередь';}
    }
  };

  function addReconnectBlock(status){
    const root=document.getElementById('workday-manager-status');
    if(!root||!v19MyWorkday?.id||!status?.native)return;
    const q=queueCount(status);
    const needs=q>0||status.legacyNative||status.authNeedsLogin||/нет связи|сесс|token|jwt|401|403/i.test(String(status.lastError||''));
    if(!needs||document.getElementById('v209-gps-reconnect-box'))return;
    const box=document.createElement('div');
    box.id='v209-gps-reconnect-box';
    box.style.cssText='margin-top:12px;padding:12px 14px;border:1px solid #F59E0B;border-radius:12px;background:#FFFBEB;color:#78350F';
    box.innerHTML='<div style="font-weight:700;margin-bottom:5px">GPS-точки сохранены на планшете</div>'+
      '<div style="font-size:12px;line-height:1.5;margin-bottom:10px">'+
      (q?'В очереди: <b>'+q+'</b>. ':'')+
      'Удалять приложение и завершать рабочий день не нужно. Кнопка обновит авторизацию старой GPS-службы и запустит отправку.</div>'+
      '<button id="v209-gps-reconnect-btn" class="btn-primary" onclick="v209ReconnectLegacyGps()">↻ Обновить связь и отправить очередь</button>';
    root.appendChild(box);
  }

  const baseRender=window.v19RenderManagerWorkday;
  window.v19RenderManagerWorkday=async function(){
    const result=await baseRender.apply(this,arguments);
    try{addReconnectBlock(await v19NativeStatus());}catch(_){ }
    return result;
  };

  window.addEventListener('online',()=>{
    setTimeout(async()=>{
      try{
        const s=await v19NativeStatus();
        if(queueCount(s)>0&&document.getElementById('page-workday')?.classList.contains('active'))addReconnectBlock(s);
      }catch(_){ }
    },500);
  });

  window.RESANTA_GPS_QUEUE_RECONNECT=Object.freeze({version:VERSION,webOnly:true,noUninstall:true,noWorkdayFinish:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 17 ===== */
// ============================================================================
// RESANTA CRM v22.4.8 FINAL ROUTES — реальная вместимость дня и старт из города проживания
// Руководитель создаёт проект → совместное обсуждение → руководитель утверждает.
// ============================================================================
(function(){
  'use strict';
  const VERSION='22.4.8';
  const MANAGERS=['Руднев','Ачинович','Шкуран'];
  const DAY_LIMIT_MINUTES=540;
  const HOME_CITY={
    'Руднев':{city:'Орша',lat:54.5084,lng:30.4173},
    'Ачинович':{city:'Бобруйск',lat:53.1384,lng:29.2214},
    'Шкуран':{city:'Мозырь',lat:52.0495,lng:29.2456}
  };
  const CITY_COORDS={
    'орша':[54.5084,30.4173],'дубровно':[54.5716,30.6910],'толочин':[54.4099,29.6955],
    'витебск':[55.1904,30.2049],'городок':[55.4627,29.9849],'бешенковичи':[55.0438,29.4552],'сенно':[54.8108,29.7066],'лиозно':[55.0247,30.7970],
    'верхнедвинск':[55.7777,27.9389],'россоны':[55.9058,28.8135],'полоцк':[55.4856,28.7680],'новополоцк':[55.5318,28.5987],
    'браслав':[55.6413,27.0410],'миоры':[55.6222,27.6281],'шарковщина':[55.3689,27.4686],'глубокое':[55.1384,27.6905],'поставы':[55.1168,26.8326],'докшицы':[54.8918,27.7667],
    'лепель':[54.8814,28.6990],'чашники':[54.8584,29.1608],'ушачи':[55.1796,28.6158],
    'могилев':[53.9007,30.3314],'шклов':[54.2131,30.2877],'быхов':[53.5210,30.2454],'круглое':[54.2488,29.7968],'белыничи':[53.9994,29.7080],'дрибин':[54.1190,31.0934],
    'горки':[54.2861,30.9863],'мстиславль':[54.0190,31.7240],'кричев':[53.6945,31.7190],'климовичи':[53.6093,31.9586],'костюковичи':[53.3520,32.0514],'хотимск':[53.4084,32.5792],'чериков':[53.5689,31.3836],'краснополье':[53.3356,31.3991],'славгород':[53.4432,31.0014],'чаусы':[53.8075,30.9717],
    'бобруйск':[53.1384,29.2214],'осиповичи':[53.3011,28.6386],'кировск':[53.2698,29.4750],'глуск':[52.9033,28.6840],'кличев':[53.4921,29.3350],'елизово':[53.4048,29.0086],
    'жлобин':[52.8926,30.0280],'рогачев':[53.0934,30.0495],'светлогорск':[52.6329,29.7389],'октябрьский':[52.6454,28.8823],
    'гомель':[52.4345,30.9754],'речица':[52.3714,30.3866],'буда кошелево':[52.7179,30.5701],'ветка':[52.5591,31.1794],'добруш':[52.4089,31.3237],
    'мозырь':[52.0495,29.2456],'калинковичи':[52.1323,29.3257],'петриков':[52.1286,28.4921],'туров':[52.0684,27.7350],'лельчицы':[51.7868,28.3280],'наровля':[51.7961,29.5004],'ельск':[51.8141,29.1522],
    'хойники':[51.8911,29.9677],'брагин':[51.7870,30.2677],'лоев':[51.9458,30.7953],'чечерск':[52.9164,30.9174],'тереховка':[51.7809,30.0368]
  };
  let physicalPoints=[];
  let pointLinks=[];
  let linksByPoint=new Map();
  let linksByClient=new Map();
  let routeProfiles=new Map();
  let selectedWeek='';
  let geocodingBusy=false;

  const norm=s=>String(s||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,' ').trim();
  const escV=s=>typeof esc==='function'?esc(String(s??'')):String(s??'').replace(/[&<>]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
  const monthSelected=()=>localStorage.getItem('crm_route_month_boss')||String(window.TODAY||new Date().toISOString().slice(0,10)).slice(0,7);
  const monthManager=()=>localStorage.getItem('crm_route_month_manager')||String(window.TODAY||new Date().toISOString().slice(0,10)).slice(0,7);
  const localDate=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const monthLastDay=ym=>new Date(Number(ym.slice(0,4)),Number(ym.slice(5,7)),0).getDate();
  const validCoord=p=>Number.isFinite(Number(p?.lat))&&Number.isFinite(Number(p?.lng))&&Math.abs(Number(p.lat))>0.000001&&Math.abs(Number(p.lng))>0.000001;
  const hash=s=>{let h=2166136261;for(const ch of String(s||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return Math.abs(h>>>0);};

  function rebuildLinkIndexes(){
    linksByPoint=new Map();linksByClient=new Map();
    pointLinks.forEach(l=>{
      const pk=String(l.point_id),ck=String(l.client_id);
      if(!linksByPoint.has(pk))linksByPoint.set(pk,[]);
      if(!linksByClient.has(ck))linksByClient.set(ck,[]);
      linksByPoint.get(pk).push(l);linksByClient.get(ck).push(l);
    });
  }

  let v224LoadedAt=0;
  async function loadV224(force=false){
    if(!force&&v224LoadedAt&&Date.now()-v224LoadedAt<60000)return false;
    try{
      const [p,l,profiles]=await Promise.all([
        loadAllRows('route_physical_points'),
        loadAllRows('route_physical_point_clients'),
        loadAllRows('client_route_profiles')
      ]);
      physicalPoints=(p||[]).filter(x=>x.active!==false);
      pointLinks=l||[];
      routeProfiles=new Map((profiles||[]).map(x=>[String(x.client_id),x]));
      rebuildLinkIndexes();v224LoadedAt=Date.now();return true;
    }catch(e){
      console.warn('v22.4 tables are not installed',e);
      physicalPoints=[];pointLinks=[];routeProfiles=new Map();rebuildLinkIndexes();v224LoadedAt=Date.now();return true;
    }
  }

  function clientsForPoint(point){
    const map=new Map((allClients||[]).map(c=>[String(c.id),c]));
    return (linksByPoint.get(String(point.id))||[])
      .map(l=>({client:map.get(String(l.client_id)),isPrimary:!!l.is_primary}))
      .filter(x=>x.client);
  }
  function routeMode(c){return String(routeProfiles.get(String(c.id))?.route_mode||'auto').toLowerCase();}
  function isPotential(c){return norm(c?.client_status)==='потенциальный';}
  function isWorking(c){return norm(c?.client_status)==='рабочий';}
  function sku(c){return Number(c?.sku_count)||0;}
  function category(c){
    const n=String(c?.role_type||'C').toUpperCase().replace(/\s/g,'');
    if(n.includes('ПЕРЕДАН'))return'Передан на 3%';
    if(n.includes('ОПТОВ'))return'Оптовик';
    if(n.includes('ИНТЕРНЕТ'))return'Интернет';
    if(n==='AAA'||n==='ААА')return'AAA';
    if(n==='A'||n==='А')return'A';
    if(n==='B'||n==='В')return'B';
    return'C';
  }
  function categoryRank(cat){return({AAA:5,A:4,B:3,'Передан на 3%':3,C:2,Оптовик:1,Интернет:1})[cat]||1;}
  function routeCorridor(plan){
    const city=norm(plan?.point?.city),region=norm(plan?.point?.region);
    const groups=[
      ['vit-north',['верхнедвинск','россоны','полоцк','новополоцк']],
      ['vit-west',['браслав','миоры','шарковщина','глубокое','поставы','докшицы']],
      ['vit-center',['витебск','городок','бешенковичи','сенно','лиозно']],
      ['vit-east',['орша','дубровно','толочин']],
      ['vit-south',['лепель','чашники','ушачи']],
      ['mog-center',['могилев','шклов','быхов','круглое','белыничи','дрибин']],
      ['mog-east',['горки','мстиславль','кричев','климовичи','костюковичи','хотимск','чериков','краснополье','славгород','чаусы']],
      ['mog-south',['бобруйск','осиповичи','кировск','глуск','кличев','елизово']],
      ['gom-north',['жлобин','рогачев','светлогорск','октябрьский']],
      ['gom-center',['гомель','речица','буда кошелево','ветка','добруш']],
      ['gom-west',['мозырь','калинковичи','петриков','туров','лельчицы','наровля','ельск']],
      ['gom-east',['хойники','брагин','лоев','чечерск','тереховка']]
    ];
    for(const [key,cities] of groups)if(cities.some(x=>city.includes(x)))return key;
    return region+'|'+city;
  }
  function maxVisits(cat){if(cat==='AAA'||cat==='A')return 4;if(cat==='B'||cat==='Передан на 3%')return 2;return 1;}
  function visitMinutes(cat,potential){if(potential)return 30;if(cat==='AAA')return 60;if(cat==='A')return 45;if(cat==='B'||cat==='Передан на 3%')return 30;return 20;}
  function visitWeight(plan){if(plan.potential)return 1.5;if(plan.category==='AAA')return 4;if(plan.category==='A')return 3;if(plan.category==='B'||plan.category==='Передан на 3%')return 2;return 1;}

  function pointPlan(point){
    const linked=clientsForPoint(point);
    const auto=linked.filter(x=>!['exclude','manual'].includes(routeMode(x.client)));
    const eligible=auto.filter(x=>isPotential(x.client)||(isWorking(x.client)&&sku(x.client)>=15));
    if(!eligible.length)return null;
    const best=eligible.slice().sort((a,b)=>categoryRank(category(b.client))-categoryRank(category(a.client))||sku(b.client)-sku(a.client))[0];
    const primary=linked.find(x=>x.isPrimary)?.client||best.client;
    const cat=eligible.reduce((acc,x)=>categoryRank(category(x.client))>categoryRank(acc)?category(x.client):acc,'C');
    const potential=eligible.some(x=>isPotential(x.client));
    const names=linked.map(x=>x.client.name);
    return{
      point,linked,eligible,primary,category:cat,potential,
      visits:potential&&eligible.every(x=>isPotential(x.client))?1:maxVisits(cat),
      minutes:visitMinutes(cat,potential),
      names,
      label:names.length===1?names[0]:(primary.name+' + ещё '+(names.length-1)+' юрлиц'),
      zone:[point.region,point.city].filter(Boolean).join(' / ')||'Без города'
    };
  }

  function callClients(manager){
    return (allClients||[]).filter(c=>c.manager_name===manager&&isWorking(c)&&sku(c)<15&&!['exclude','manual'].includes(routeMode(c)));
  }
  function plansForManager(manager){
    return physicalPoints.filter(p=>p.manager_name===manager).map(pointPlan).filter(Boolean);
  }

  function isVisitedRouteRow(row){
    if(!row||row.removed)return false;
    return row.visited===true||String(row.visited).toLowerCase()==='true'||!!row.linked_visit_id||String(row.link_status||'').toLowerCase()==='verified_visit';
  }
  function routeRowClientIds(row){
    const out=[];
    if(row?.client_id)out.push(String(row.client_id));
    const raw=row?.linked_client_ids;
    if(Array.isArray(raw))raw.forEach(x=>out.push(String(x)));
    else if(raw!=null&&raw!==''){
      let parsed=null;
      if(typeof raw==='string'){try{parsed=JSON.parse(raw);}catch(_){parsed=raw.split(/[,;\s]+/);}}
      else parsed=raw;
      if(Array.isArray(parsed))parsed.forEach(x=>out.push(String(x)));
    }
    return[...new Set(out.filter(Boolean))];
  }
  function pointIdForRouteRow(row,plans){
    const byId=new Map(plans.map(p=>[String(p.point.id),p]));
    const byKey=new Map(plans.map(p=>[String(p.point.point_key||''),p]).filter(x=>x[0]));
    if(row?.physical_point_id&&byId.has(String(row.physical_point_id)))return String(row.physical_point_id);
    if(row?.physical_point_key&&byKey.has(String(row.physical_point_key)))return String(byKey.get(String(row.physical_point_key)).point.id);
    const candidates=new Set();
    routeRowClientIds(row).forEach(cid=>(linksByClient.get(cid)||[]).forEach(l=>{if(byId.has(String(l.point_id)))candidates.add(String(l.point_id));}));
    if(candidates.size===1)return[...candidates][0];
    const rowCity=norm(row?.city),rowAddress=norm(row?.address);
    const matched=plans.filter(p=>(!rowCity||norm(p.point.city)===rowCity)&&(!rowAddress||norm(p.point.address)===rowAddress));
    if(matched.length===1)return String(matched[0].point.id);
    if(candidates.size>1&&rowAddress){
      const narrowed=[...candidates].map(id=>byId.get(id)).filter(Boolean).filter(p=>norm(p.point.address)===rowAddress&&(!rowCity||norm(p.point.city)===rowCity));
      if(narrowed.length===1)return String(narrowed[0].point.id);
    }
    return null;
  }
  function visitedStateForManager(manager,ym,plans){
    const rows=(allRoutePlans||[]).filter(r=>r.manager_name===manager&&String(r.visit_date||'').startsWith(ym)&&isVisitedRouteRow(r));
    const counts=new Map(),seen=new Set();let unmatched=0;
    rows.forEach(r=>{
      const visitKey=r.linked_visit_id?'visit:'+String(r.linked_visit_id):'route:'+String(r.id||Math.random());
      if(seen.has(visitKey))return;seen.add(visitKey);
      const pointId=pointIdForRouteRow(r,plans);
      if(pointId)counts.set(pointId,(counts.get(pointId)||0)+1);else unmatched++;
    });
    return{rows,counts,unmatched,mapped:[...counts.values()].reduce((s,x)=>s+x,0)};
  }

  function mondayOf(dateString){
    const d=new Date(dateString+'T12:00:00');const js=d.getDay(),dow=js===0?7:js;d.setDate(d.getDate()-(dow-1));return localDate(d);
  }
  function weeksInMonth(ym){
    const out=[];for(let d=1;d<=monthLastDay(ym);d++){const ds=ym+'-'+String(d).padStart(2,'0'),w=mondayOf(ds);if(!out.includes(w))out.push(w);}return out;
  }
  function fieldCalendar(ym,officeDow,minDateExclusive=''){
    const dates=[],office=[],weeks=new Map();
    for(let day=1;day<=monthLastDay(ym);day++){
      const d=new Date(Number(ym.slice(0,4)),Number(ym.slice(5,7))-1,day,12);const js=d.getDay(),dow=js===0?7:js;if(dow>5)continue;
      const ds=localDate(d);if(minDateExclusive&&ds<=minDateExclusive)continue;
      const wk=mondayOf(ds);
      if(dow===officeDow){office.push(ds);continue;}
      dates.push(ds);if(!weeks.has(wk))weeks.set(wk,[]);weeks.get(wk).push(ds);
    }
    return{dates,office,weeks,weekKeys:[...weeks.keys()].sort()};
  }

  function haversineKm(a,b){
    if(!validCoord(a)||!validCoord(b))return null;
    const R=6371,rad=Math.PI/180,dLat=(Number(b.lat)-Number(a.lat))*rad,dLng=(Number(b.lng)-Number(a.lng))*rad;
    const la1=Number(a.lat)*rad,la2=Number(b.lat)*rad;
    const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLng/2)**2;
    return 2*R*Math.asin(Math.sqrt(Math.min(1,h)));
  }
  function approxPoint(plan){
    if(validCoord(plan?.point))return plan.point;
    const c=norm(plan?.point?.city);
    for(const [name,xy] of Object.entries(CITY_COORDS))if(c===name||c.includes(name))return{lat:xy[0],lng:xy[1]};
    return null;
  }
  function homePoint(manager){return HOME_CITY[manager]||null;}
  function distanceKmPlans(a,b){
    const pa=approxPoint(a),pb=approxPoint(b);
    if(!pa||!pb)return null;
    return haversineKm(pa,pb);
  }
  function travelMinutes(a,b){
    if(!a||!b)return 0;
    const km=distanceKmPlans(a,b);
    if(km!=null)return Math.max(5,Math.min(210,Math.round(km*1.22/58*60+7)));
    if(a.zone===b.zone)return 7;
    if(routeCorridor(a)===routeCorridor(b))return 35;
    return norm(a.point.region)===norm(b.point.region)?75:150;
  }
  function routeOrderForManager(plans,manager){
    if(plans.length<2)return plans.slice();
    const home=homePoint(manager);
    const remaining=plans.slice(),out=[];
    let current=null;
    if(home){
      current=remaining.reduce((best,p)=>{
        const pp=approxPoint(p);const d=pp?haversineKm(home,pp):-1;
        return !best||d>best.d?{p,d}:best;
      },null)?.p||remaining[0];
    }else current=remaining[0];
    while(remaining.length){
      let idx=remaining.indexOf(current);if(idx<0)idx=0;
      current=remaining.splice(idx,1)[0];out.push(current);
      if(remaining.length){
        current=remaining.reduce((best,p)=>{
          const d=distanceKmPlans(out[out.length-1],p);
          const bd=distanceKmPlans(out[out.length-1],best);
          if(d==null&&bd==null)return String(p.point.address||'').localeCompare(String(best.point.address||''),'ru')<0?p:best;
          if(d==null)return best;if(bd==null)return p;return d<bd?p:best;
        },remaining[0]);
      }
    }
    return out;
  }
  function estimatedDayMinutes(items,manager){
    const plans=items.map(x=>x.plan||x);
    if(!plans.length)return 0;
    const ordered=routeOrderForManager(plans,manager);
    let total=ordered.reduce((s,p)=>s+Math.max(15,Number(p.minutes)||20),0);
    for(let i=1;i<ordered.length;i++)total+=travelMinutes(ordered[i-1],ordered[i]);
    return total;
  }
  function sameClientOnDay(day,plan){
    const ids=new Set(plan.linked.map(x=>String(x.client.id)));
    return day.items.some(o=>o.plan.linked.some(x=>ids.has(String(x.client.id))));
  }
  function incrementalMinutes(day,plan){
    const last=day.items.length?day.items[day.items.length-1].plan:null;
    return plan.minutes+travelMinutes(last,plan);
  }
  function dayDistanceScore(day,plan){
    if(!day.items.length)return 999999;
    let best=999999;
    for(const item of day.items){
      const km=haversineKm(item.plan.point,plan.point);
      if(km!=null)best=Math.min(best,km);
    }
    if(best<999999)return best;
    if(day.zones.has(plan.zone))return 0;
    const sameRegion=day.items.some(x=>norm(x.plan.point.region)===norm(plan.point.region));
    return sameRegion?250:1000;
  }
  function canFit(day,plan,maxPoints){
    if(day.items.length>=maxPoints||sameClientOnDay(day,plan))return false;
    return estimatedDayMinutes([...day.items,{plan}],day.manager)<=DAY_LIMIT_MINUTES;
  }

  function nearestGeoOrder(plans){
    if(plans.length<2)return plans.slice();
    const cx=plans.reduce((s,x)=>s+Number(x.point.lat),0)/plans.length,cy=plans.reduce((s,x)=>s+Number(x.point.lng),0)/plans.length;
    let current=plans.reduce((best,x)=>{const d=(Number(x.point.lat)-cx)**2+(Number(x.point.lng)-cy)**2;return!best||d>best.d?{x,d}:best;},null).x;
    const left=plans.slice(),out=[];
    while(left.length){let idx=left.indexOf(current);if(idx<0)idx=0;current=left.splice(idx,1)[0];out.push(current);if(left.length)current=left.reduce((best,x)=>haversineKm(current.point,x.point)<haversineKm(current.point,best.point)?x:best,left[0]);}
    return out;
  }
  function nearestOrder(plans,manager){
    return routeOrderForManager(plans,manager);
  }

  function assignOccurrence(days,occ,maxPoints,preferredWeek,mandatory){
    let candidates=days.filter(d=>canFit(d,occ.plan,maxPoints));
    if(!candidates.length)return false;
    candidates.sort((a,b)=>{
      const aSameZone=a.zones.has(occ.plan.zone),bSameZone=b.zones.has(occ.plan.zone);
      const aEmpty=a.items.length===0,bEmpty=b.items.length===0;
      const aPreferred=a.week===preferredWeek,bPreferred=b.week===preferredWeek;
      const corridor=routeCorridor(occ.plan);
      const aSameCorridor=a.items.some(x=>routeCorridor(x.plan)===corridor);
      const bSameCorridor=b.items.some(x=>routeCorridor(x.plan)===corridor);
      const aSameRegion=a.items.some(x=>norm(x.plan.point.region)===norm(occ.plan.point.region));
      const bSameRegion=b.items.some(x=>norm(x.plan.point.region)===norm(occ.plan.point.region));
      const ad=dayDistanceScore(a,occ.plan),bd=dayDistanceScore(b,occ.plan);
      if(mandatory){
        // Обязательные первые визиты: сначала заполняем день одним городом.
        // Новый город получает свободный полевой день раньше, чем смешивается с другим городом.
        if(aSameZone!==bSameZone)return aSameZone?-1:1;
        if(!aSameZone&&!bSameZone&&aEmpty!==bEmpty)return aEmpty?-1:1;
        if(aPreferred!==bPreferred)return aPreferred?-1:1;
        if(!aEmpty&&!bEmpty&&aSameCorridor!==bSameCorridor)return aSameCorridor?-1:1;
        if(!aEmpty&&!bEmpty&&aSameRegion!==bSameRegion)return aSameRegion?-1:1;
        return ad-bd||a.zones.size-b.zones.size||a.items.length-b.items.length||a.date.localeCompare(b.date);
      }
      // Повторы распределяем по неделям, но также держим их рядом с тем же городом.
      if(aPreferred!==bPreferred)return aPreferred?-1:1;
      if(aSameZone!==bSameZone)return aSameZone?-1:1;
      if(aEmpty!==bEmpty)return aEmpty?-1:1;
      if(aSameCorridor!==bSameCorridor)return aSameCorridor?-1:1;
      if(aSameRegion!==bSameRegion)return aSameRegion?-1:1;
      return ad-bd||a.items.length-b.items.length||a.date.localeCompare(b.date);
    });
    const day=candidates[0];
    day.items.push(occ);day.minutes=estimatedDayMinutes(day.items,day.manager);day.zones.add(occ.plan.zone);
    return true;
  }

  function buildSchedule(manager,ym,officeDow,maxPoints,visitedState){
    const today=String(window.TODAY||new Date().toISOString().slice(0,10)).slice(0,10);
    const minDateExclusive=ym===today.slice(0,7)?today:'';
    const calendar=fieldCalendar(ym,officeDow,minDateExclusive);
    const days=calendar.dates.map(date=>({date,week:mondayOf(date),items:[],minutes:0,zones:new Set(),manager}));
    const plans=plansForManager(manager),mandatory=[],repeats=[];
    let completedVisits=0,completedPoints=0;
    plans.forEach(p=>{
      const done=Math.min(p.visits,Number(visitedState?.counts?.get(String(p.point.id))||0));
      completedVisits+=done;if(done>0)completedPoints++;
      for(let n=done+1;n<=p.visits;n++){
        const item={plan:p,occurrence:n,mandatory:n===1};
        (n===1?mandatory:repeats).push(item);
      }
    });
    if((mandatory.length||repeats.length)&&!days.length){
      return{error:'В выбранном месяце не осталось полевых дней для непосещённых точек.',calendar,days,plans,mandatory,repeats,completedVisits,completedPoints};
    }
    mandatory.sort((a,b)=>routeCorridor(a.plan).localeCompare(routeCorridor(b.plan),'ru')||a.plan.zone.localeCompare(b.plan.zone,'ru')||categoryRank(b.plan.category)-categoryRank(a.plan.category)||a.plan.label.localeCompare(b.plan.label,'ru'));
    const unassignedMandatory=[];
    mandatory.forEach(o=>{
      const wk=calendar.weekKeys[hash(o.plan.point.point_key)%Math.max(1,calendar.weekKeys.length)];
      if(!assignOccurrence(days,o,maxPoints,wk,true))unassignedMandatory.push(o);
    });
    if(unassignedMandatory.length)return{error:'Не помещаются оставшиеся обязательные первичные визиты: '+unassignedMandatory.length,calendar,days,plans,mandatory,repeats,unassignedMandatory,completedVisits,completedPoints};
    let repeatsPlaced=0;
    repeats.sort((a,b)=>categoryRank(b.plan.category)-categoryRank(a.plan.category)||a.occurrence-b.occurrence||a.plan.label.localeCompare(b.plan.label,'ru'));
    repeats.forEach(o=>{
      const base=hash(o.plan.point.point_key)%Math.max(1,calendar.weekKeys.length);
      const idx=Math.min(calendar.weekKeys.length-1,Math.round(base+(o.occurrence-1)*(calendar.weekKeys.length-1)/Math.max(1,o.plan.visits-1)));
      if(assignOccurrence(days,o,maxPoints,calendar.weekKeys[idx],false))repeatsPlaced++;
    });
    return{calendar,days,plans,mandatory,repeats,repeatsPlaced,skippedRepeats:repeats.length-repeatsPlaced,completedVisits,completedPoints};
  }

  function timeString(minutes){const m=Math.max(0,Math.min(23*60+59,Math.round(minutes)));return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')+':00';}
  function allocateDayTimes(ordered){
    const count=ordered.length;if(!count)return[];
    const rawTravel=[];for(let i=0;i<count;i++)rawTravel.push(i===0?0:travelMinutes(ordered[i-1],ordered[i]));
    const rawTotal=rawTravel.reduce((s,x)=>s+x,0),maxTravel=Math.min(240,Math.max(0,DAY_LIMIT_MINUTES-count*15));
    const factor=rawTotal>maxTravel&&rawTotal>0?maxTravel/rawTotal:1;
    const travel=rawTravel.map(x=>Math.round(x*factor));
    let travelTotal=travel.reduce((s,x)=>s+x,0),visitBudget=Math.max(count*15,DAY_LIMIT_MINUTES-travelTotal);
    if(visitBudget+travelTotal>DAY_LIMIT_MINUTES){
      let over=visitBudget+travelTotal-DAY_LIMIT_MINUTES;
      for(let i=travel.length-1;i>0&&over>0;i--){const cut=Math.min(travel[i],over);travel[i]-=cut;over-=cut;}
      travelTotal=travel.reduce((s,x)=>s+x,0);visitBudget=DAY_LIMIT_MINUTES-travelTotal;
    }
    const weights=ordered.map(visitWeight),base=15,totalBase=base*count,extra=Math.max(0,visitBudget-totalBase),sumW=weights.reduce((s,x)=>s+x,0)||count;
    const durations=weights.map(w=>base+Math.floor(extra*w/sumW));
    let used=durations.reduce((s,x)=>s+x,0),residual=visitBudget-used;
    for(let i=0;residual>0;i=(i+1)%count,residual--)durations[i]++;
    let cursor=9*60;const out=[];
    for(let i=0;i<count;i++){
      cursor+=travel[i];const start=cursor,end=start+durations[i];out.push({start,end,minutes:durations[i],travelBefore:travel[i]});cursor=end;
    }
    if(out.length){const delta=18*60-out[out.length-1].end;out[out.length-1].end+=delta;out[out.length-1].minutes+=delta;}
    return out;
  }
  function rowsFromSchedule(manager,ym,schedule,batchId){
    const rows=[];
    schedule.days.forEach(day=>{
      if(!day.items.length)return;
      const ordered=nearestOrder(day.items.map(x=>x.plan),manager);
      const occByKey=new Map(day.items.map(x=>[String(x.plan.point.id),x]));
      const timing=allocateDayTimes(ordered);
      ordered.forEach((plan,idx)=>{
        const occ=occByKey.get(String(plan.point.id)),slot=timing[idx];
        rows.push({
          client_id:plan.primary.id,
          manager_name:manager,
          visit_date:day.date,
          client_name:plan.label,
          city:plan.point.city||'',region:plan.point.region||'',address:plan.point.address||'',category:plan.category,
          approved:false,review_status:'boss_draft',source:'boss_physical_route',generated_month:ym,
          route_batch_id:batchId,route_zone:plan.zone,sort_order:idx+1,planned_minutes:slot.minutes,removed:false,
          physical_point_id:plan.point.id,physical_point_key:plan.point.point_key,
          linked_client_ids:plan.linked.map(x=>x.client.id),linked_client_names:plan.names,
          route_lat:validCoord(plan.point)?Number(plan.point.lat):null,route_lng:validCoord(plan.point)?Number(plan.point.lng):null,
          planned_start:timeString(slot.start),planned_end:timeString(slot.end),is_office_day:false,route_version:VERSION,
          reason:(occ?.occurrence===1?'Обязательный первичный визит':'Повторный визит №'+occ?.occurrence)+' · '+plan.category+' · физическая ТТ · юрлица: '+plan.names.join(' / ')
        });
      });
    });
    schedule.calendar.office.forEach(date=>rows.push({
      manager_name:manager,visit_date:date,client_name:'Офисный день',city:'',region:'',address:'',category:'Офис',
      approved:false,review_status:'boss_draft',source:'office_day',generated_month:ym,route_batch_id:batchId,
      route_zone:'Офис',sort_order:0,planned_minutes:540,removed:false,planned_start:'09:00:00',planned_end:'18:00:00',
      is_office_day:true,route_version:VERSION,reason:'Один офисный день в неделю по регламенту'
    }));
    return rows;
  }

  async function insertChunks(table,rows){
    const out=[];for(let i=0;i<rows.length;i+=150){const {data,error}=await db.from(table).insert(rows.slice(i,i+150)).select();if(error)throw error;out.push(...(data||[]));}return out;
  }
  async function updateIds(ids,patch){for(let i=0;i<ids.length;i+=150){const {error}=await db.from('route_plans').update(patch).in('id',ids.slice(i,i+150));if(error)throw error;}}

  window.generateNextMonthRoute=async function(){
    if(currentProfile?.role!=='boss')return;
    if(!physicalPoints.length){alert('Сначала выполните SQL v22.4.1 в Supabase и обновите страницу.');return;}
    const ym=monthSelected(),current=String(window.TODAY||new Date().toISOString().slice(0,10)).slice(0,7);
    if(ym<current){alert('Нельзя формировать проект на прошедший месяц.');return;}
    const managers=(typeof rbMgrFilter!=='undefined'&&MANAGERS.includes(rbMgrFilter))?[rbMgrFilter]:MANAGERS.slice();
    const officeDow=Number(document.getElementById('route-v222-office')?.value||5),maxPoints=Math.min(15,Math.max(1,Number(document.getElementById('route-v222-max')?.value||15)));
    const missing=[];managers.forEach(m=>plansForManager(m).forEach(p=>{if(!validCoord(p.point))missing.push(p);}));
    if(missing.length){
      const proceed=confirm('У '+missing.length+' физических ТТ пока нет точных координат.\n\nМаршрут будет построен по области → городу → точному адресу, а точки с координатами дополнительно оптимизируются по расстоянию.\n\nGPS-контроль по точкам без координат не включается. Геокодирование можно продолжить позже.\n\nСформировать проект маршрута сейчас?');
      if(!proceed)return;
    }
    const active=(allRoutePlans||[]).filter(r=>managers.includes(r.manager_name)&&String(r.visit_date||'').startsWith(ym)&&!r.removed);
    const visitedActive=active.filter(isVisitedRouteRow),replaceable=active.filter(r=>!isVisitedRouteRow(r));
    const plansByManager={},visitedByManager={};
    managers.forEach(m=>{plansByManager[m]=plansForManager(m);visitedByManager[m]=visitedStateForManager(m,ym,plansByManager[m]);});
    if(replaceable.length){
      const word=replaceable.some(r=>r.approved||r.review_status==='approved')?'ПЕРЕСОЗДАТЬ':'ЗАМЕНИТЬ';
      const typed=prompt('На '+ym+' уже есть маршрут.\n\nПосещённые точки: '+visitedActive.length+' — будут СОХРАНЕНЫ и учтены в частоте месяца.\nНепосещённые точки: '+replaceable.length+' — будут заменены новым проектом.\n\nВведите '+word+':');
      if(String(typed||'').trim().toUpperCase()!==word)return;
    }else if(visitedActive.length){
      const typed=prompt('В '+ym+' уже есть '+visitedActive.length+' посещённых точек. Они будут сохранены и учтены.\nБудет достроена только оставшаяся часть месяца после текущей даты.\n\nВведите ДОСТРОИТЬ:');
      if(String(typed||'').trim().toUpperCase()!=='ДОСТРОИТЬ')return;
    }else{
      const typed=prompt('Сформировать проект на '+ym+' для: '+managers.join(', ')+'?\nВведите СОЗДАТЬ:');
      if(String(typed||'').trim().toUpperCase()!=='СОЗДАТЬ')return;
    }
    const schedules={},errors=[];
    managers.forEach(m=>{schedules[m]=buildSchedule(m,ym,officeDow,maxPoints,visitedByManager[m]);if(schedules[m].error)errors.push(m+': '+schedules[m].error);});
    if(errors.length){alert('Маршрут не создан:\n'+errors.join('\n'));return;}
    const batchId='v2248-'+ym+'-'+Date.now(),callSource='route_call_v2248:'+batchId,rows=[],calls=[];
    managers.forEach(m=>{
      rows.push(...rowsFromSchedule(m,ym,schedules[m],batchId));
      callClients(m).forEach(c=>{
        const duplicate=(allTasks||[]).some(t=>String(t.client_id)===String(c.id)&&String(t.due_date||'').startsWith(ym)&&String(t.source||'').startsWith('route_call_v224')&&!t.done);
        if(!duplicate)calls.push({text:'📞 Прозвон вместо полевого визита: общий ассортимент '+sku(c)+' SKU (менее 15). Уточнить продажи, остатки, потребность и зафиксировать следующее действие.',due_date:ym+'-10',done:false,manager_name:m,client_id:c.id,source:callSource});
      });
    });
    const replacedIds=replaceable.map(r=>r.id);
    const workflowBefore=new Map(managers.map(m=>[m,(v222Workflows||[]).find(w=>w.manager_name===m&&w.route_month===ym)||null]));
    let routesInserted=false,tasksInserted=false,oldRoutesHidden=false;
    try{
      // Сначала проверяем и сохраняем настройки месяца. Если ограничение БД не подходит,
      // ошибка произойдёт ДО изменения маршрутов, задач и посещённых данных.
      for(const m of managers){
        const previous=workflowBefore.get(m);
        const wf={manager_name:m,route_month:ym,status:'boss_draft',office_weekday:officeDow,max_points_day:maxPoints,created_by:previous?.created_by||currentProfile?.name||null,created_at:previous?.created_at||new Date().toISOString(),updated_at:new Date().toISOString(),boss_comment:null,manager_comment:null,approved_by:null,approved_at:null};
        const {error}=await db.from('route_month_workflow').upsert(wf,{onConflict:'manager_name,route_month'});if(error)throw error;
      }
      if(replacedIds.length){
        await updateIds(replacedIds,{removed:true});oldRoutesHidden=true;
        allRoutePlans=allRoutePlans.map(r=>replacedIds.includes(r.id)?{...r,removed:true}:r);
      }
      const inserted=await insertChunks('route_plans',rows);routesInserted=true;allRoutePlans.push(...inserted);
      const taskRows=await insertChunks('tasks',calls);tasksInserted=true;allTasks.unshift(...taskRows);
      // После формирования всегда открываем весь активный проект выбранного месяца.
      // Старые поисковые, недельные, дневные и служебные фильтры не должны создавать ложную пустоту.
      selectedWeek='';
      try{if(typeof rbMgrFilter!=='undefined')rbMgrFilter='all';}catch(_){}
      try{if(typeof rbTaskFilter!=='undefined')rbTaskFilter='all';}catch(_){}
      const clearIds=['rb-date-filter','v224-date','rb-search','rb-approval-client'];
      clearIds.forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
      const weekEl=document.getElementById('v224-week');if(weekEl)weekEl.value='';
      const statusEl=document.getElementById('v224-status');if(statusEl)statusEl.value='all';
      const approvalEl=document.getElementById('rb-approval-filter');if(approvalEl)approvalEl.value='all';
      const managerEl=document.getElementById('v224-manager');if(managerEl)managerEl.value='all';
      await loadV224();
      if(typeof window.v222SelectRouteDay==='function')window.v222SelectRouteDay('boss','');
      else window.renderRoutesBoss?.();
      const mandatory=managers.reduce((s,m)=>s+schedules[m].mandatory.length,0),repeats=managers.reduce((s,m)=>s+schedules[m].repeatsPlaced,0),skipped=managers.reduce((s,m)=>s+schedules[m].skippedRepeats,0),office=managers.reduce((s,m)=>s+schedules[m].calendar.office.length,0),mapped=managers.reduce((s,m)=>s+visitedByManager[m].mapped,0),unmatched=managers.reduce((s,m)=>s+visitedByManager[m].unmatched,0);
      alert('Проект '+ym+' сформирован и открыт для проверки.\n\nПосещённые точки сохранены: '+visitedActive.length+'\nПосещённые визиты учтены в частоте: '+mapped+(unmatched?'\nПосещённые строки без однозначной привязки к физической ТТ: '+unmatched+' — сохранены, но не вычитались из частоты.':'')+'\nОставшиеся обязательные первые визиты: '+mandatory+'\nНовые повторные визиты: '+repeats+'\nПовторы, не вошедшие из-за лимита: '+skipped+'\nБудущие офисные дни: '+office+'\nНовые задачи на прозвон: '+calls.length+'\nБез точных координат, распределены по области/городу/адресу: '+missing.length+'\n\nПрошедшие и посещённые данные не изменены. Теперь проверьте проект вместе с менеджерами; финально утверждает руководитель.');
    }catch(e){
      const rollbackErrors=[];
      try{
        const {error}=await db.from('route_plans').delete().eq('route_batch_id',batchId);
        if(error)throw error;
        allRoutePlans=allRoutePlans.filter(r=>String(r.route_batch_id)!==String(batchId));
      }catch(x){rollbackErrors.push('новые строки маршрута: '+(x.message||x));}
      try{
        const {error}=await db.from('tasks').delete().eq('source',callSource);
        if(error)throw error;
        allTasks=allTasks.filter(t=>String(t.source)!==String(callSource));
      }catch(x){rollbackErrors.push('новые задачи: '+(x.message||x));}
      if(oldRoutesHidden&&replacedIds.length){
        try{
          await updateIds(replacedIds,{removed:false});
          allRoutePlans=allRoutePlans.map(r=>replacedIds.includes(r.id)?{...r,removed:false}:r);
        }catch(x){rollbackErrors.push('возврат прежнего проекта: '+(x.message||x));}
      }
      try{
        for(const m of managers){
          const previous=workflowBefore.get(m);
          if(previous){
            const restore={...previous};delete restore.id;
            const {error}=await db.from('route_month_workflow').upsert(restore,{onConflict:'manager_name,route_month'});if(error)throw error;
          }else{
            const {error}=await db.from('route_month_workflow').delete().eq('manager_name',m).eq('route_month',ym);if(error)throw error;
          }
        }
      }catch(x){rollbackErrors.push('настройки месяца: '+(x.message||x));}
      try{await loadV224();window.renderRoutesBoss?.();}catch(_){}
      alert('Маршрут не создан. Все выполненные этим запуском изменения автоматически отменены.\n\nПричина: '+(e.message||e)+(rollbackErrors.length?'\n\nТребует проверки отката: '+rollbackErrors.join('; '):''));
    }
  };

  async function syncSinglePointClients(point){
    const links=linksByPoint.get(String(point.id))||[];
    for(const l of links){
      const all=linksByClient.get(String(l.client_id))||[];
      const active=all.filter(x=>physicalPoints.some(p=>String(p.id)===String(x.point_id)&&p.active!==false));
      if(active.length!==1)continue;
      const {error}=await db.from('clients').update({lat:Number(point.lat),lng:Number(point.lng),geocoded_at:new Date().toISOString()}).eq('id',l.client_id);
      if(!error){const c=allClients.find(x=>String(x.id)===String(l.client_id));if(c){c.lat=Number(point.lat);c.lng=Number(point.lng);c.geocoded_at=new Date().toISOString();}}
    }
  }

  function selectedGeocodeManagers(){
    const ui=String(document.getElementById('v224-manager')?.value||'').trim();
    if(MANAGERS.includes(ui))return[ui];
    if(typeof rbMgrFilter!=='undefined'&&MANAGERS.includes(rbMgrFilter))return[rbMgrFilter];
    return[];
  }

  function compactAddress(value){
    return String(value||'')
      .replace(/\s+/g,' ')
      .replace(/\s*,\s*/g,', ')
      .replace(/^\s*республика\s+беларусь\s*,?\s*/i,'')
      .replace(/^\s*беларусь\s*,?\s*/i,'')
      .trim();
  }

  function queryVariants(point){
    const address=compactAddress(point.address),city=compactAddress(point.city),region=compactAddress(point.region);
    const arr=[
      [address,city,region,'Беларусь'],
      [address,city,'Беларусь'],
      [city,address,'Беларусь']
    ].map(parts=>parts.filter(Boolean).join(', '));
    return[...new Set(arr.filter(Boolean))];
  }

  function inBelarus(lat,lng){
    return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=51.15&&lat<=56.25&&lng>=23.0&&lng<=33.0;
  }

  function addressNumber(value){
    const m=String(value||'').match(/(?:^|[\s,])(?:д\.?\s*)?(\d+[а-яa-z]?(?:[\/-]\d+[а-яa-z]?)?)(?=$|[\s,])/i);
    return m?norm(m[1]):'';
  }

  function candidateStatus(point,label,lat,lng){
    if(!inBelarus(lat,lng))return'reject';
    const nlabel=norm(label),city=norm(point.city),region=norm(point.region),num=addressNumber(point.address);
    const cityWords=city.split(' ').filter(x=>x.length>=4);
    const regionWords=region.split(' ').filter(x=>x.length>=5&&!['область','район'].includes(x));
    const cityOk=!cityWords.length||cityWords.some(x=>nlabel.includes(x));
    const regionOk=!regionWords.length||regionWords.some(x=>nlabel.includes(x));
    const numberOk=!num||nlabel.includes(num);
    if(cityOk&&numberOk)return'ok';
    if((cityOk||regionOk)&&numberOk)return'review';
    return'reject';
  }

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function fetchJson(url,timeoutMs){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs||22000);
    try{
      const response=await fetch(url,{headers:{'Accept':'application/json'},signal:controller.signal});
      if(response.status===429||response.status===403){const e=new Error('GEOCODER_LIMIT');e.code='GEOCODER_LIMIT';e.retryAfter=Math.max(65,Number(response.headers.get('Retry-After'))||65);throw e;}
      if(!response.ok){const e=new Error('HTTP_'+response.status);e.code='GEOCODER_TEMP';throw e;}
      return await response.json();
    }finally{clearTimeout(timer);}
  }

  function firstAcceptedNominatim(point,data){
    for(const item of Array.isArray(data)?data:[]){
      const lat=Number(item.lat),lng=Number(item.lon),label=String(item.display_name||'');
      const status=candidateStatus(point,label,lat,lng);
      if(status!=='reject')return{lat,lng,label,status,provider:'nominatim'};
    }
    return null;
  }
  function firstAcceptedPhoton(point,data){
    const features=Array.isArray(data?.features)?data.features:[];
    for(const item of features){
      const coords=item?.geometry?.coordinates||[],lng=Number(coords[0]),lat=Number(coords[1]);
      const p=item?.properties||{},countryCode=String(p.countrycode||p.country_code||'').toLowerCase();
      if(countryCode&&countryCode!=='by')continue;
      const label=[p.name,p.housenumber,p.street,p.city,p.county,p.state,p.country].filter(Boolean).join(', ');
      const status=candidateStatus(point,label,lat,lng);
      if(status!=='reject')return{lat,lng,label,status,provider:'photon'};
    }
    return null;
  }

  async function geocodePointRobust(point){
    const variants=queryVariants(point);
    // Не более одного запроса в секунду. Резервный вариант вызывается только после паузы.
    for(let i=0;i<Math.min(2,variants.length);i++){
      const q=variants[i];
      const nomUrl='https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=by&accept-language=ru&q='+encodeURIComponent(q);
      const nom=await fetchJson(nomUrl,22000);
      const hit=firstAcceptedNominatim(point,nom);if(hit)return hit;
      await sleep(1400);
    }
    await sleep(1400);
    const q=variants[0]||'';
    const photonUrl='https://photon.komoot.io/api/?limit=8&lang=ru&q='+encodeURIComponent(q);
    const photon=await fetchJson(photonUrl,22000);
    return firstAcceptedPhoton(point,photon);
  }

  async function geocodeWithBackoff(point,btn,position,total,manager){
    const waits=[65,120,240];
    for(let attempt=0;attempt<=waits.length;attempt++){
      try{return await geocodePointRobust(point);}catch(e){
        const limited=e?.code==='GEOCODER_LIMIT'||e?.code==='GEOCODER_TEMP'||e?.name==='AbortError';
        if(!limited||attempt===waits.length)throw e;
        const seconds=Math.max(waits[attempt],Number(e.retryAfter)||0);
        for(let left=seconds;left>0;left--){if(btn)btn.textContent='⏳ пауза '+left+'с · '+position+'/'+total+' · '+manager;await sleep(1000);}
      }
    }
    return null;
  }

  window.geocodeAllClients=async function(){
    if(geocodingBusy)return;
    const managers=selectedGeocodeManagers();
    if(managers.length!==1){alert('Для безопасного геокодирования выберите одного менеджера в верхнем фильтре.');return;}
    const manager=managers[0];
    // ВАЖНО: геокодируем только те физические ТТ, которые реально входят в полевой маршрут.
    // Не берём исключённых клиентов, карточки для прозвона (<15 SKU), закрытые и ручные исключения.
    const routePlans=plansForManager(manager);
    const todo=routePlans.map(x=>x.point).filter(p=>p.address&&!validCoord(p));
    if(!todo.length){alert('У '+manager+' все физические ТТ, входящие в маршрут, уже имеют координаты.');return;}
    const mins=Math.max(2,Math.ceil(todo.length*2.8/60));
    if(!confirm('Менеджер: '+manager+'\nФизических ТТ в маршруте: '+routePlans.length+'\nОсталось без координат: '+todo.length+'\n\nГеокодировать только эти маршрутные ТТ?\nУже сохранённые координаты не изменяются.\nПримерное время: '+mins+' мин. Не закрывайте вкладку.'))return;
    geocodingBusy=true;const btn=document.getElementById('geocode-btn');let done=0,review=0,notFound=0,serviceStopped=false,processed=0;
    for(const p of todo){
      if(btn)btn.textContent='📍 '+processed+'/'+todo.length+' · '+manager;
      try{
        const hit=await geocodeWithBackoff(p,btn,processed+1,todo.length,manager);
        if(hit){
          const now=new Date().toISOString();
          const patch={lat:hit.lat,lng:hit.lng,geocoded_at:now,geocode_status:hit.status,geocode_label:hit.provider+': '+hit.label,updated_at:now};
          const {error}=await db.from('route_physical_points').update(patch).eq('id',p.id);if(error)throw error;
          Object.assign(p,patch);await syncSinglePointClients(p);hit.status==='ok'?done++:review++;
        }else notFound++;
      }catch(e){
        console.warn('geocode point',p,e);
        if(e?.code==='GEOCODER_LIMIT'||e?.code==='GEOCODER_TEMP'||e?.name==='AbortError'){
          serviceStopped=true;
          break;
        }
        notFound++;
      }
      processed++;
      await new Promise(r=>setTimeout(r,1600));
    }
    geocodingBusy=false;if(btn)btn.textContent='📍 Геокодировать изменённые адреса';
    window.v224ShowReadiness();
    const left=plansForManager(manager).filter(x=>x.point.address&&!validCoord(x.point)).length;
    let text='Геокодирование '+manager+' завершено.\n\nТочно сопоставлено: '+done+'\nНужно проверить на карте: '+review+'\nАдрес не распознан: '+notFound+'\nОсталось без координат: '+left+'.';
    if(serviceStopped)text+='\n\nПосле автоматических пауз сервис всё ещё недоступен. Это не блокирует формирование маршрута: точки без координат распределяются по области, городу и точному адресу.';
    alert(text);
  };

  window.v224ShowReadiness=function(){
    installUi();const managers=(typeof rbMgrFilter!=='undefined'&&MANAGERS.includes(rbMgrFilter))?[rbMgrFilter]:MANAGERS.slice();
    const ym=monthSelected(),officeDow=Number(document.getElementById('route-v222-office')?.value||5),maxPoints=Math.min(15,Math.max(1,Number(document.getElementById('route-v222-max')?.value||15)));
    const root=document.getElementById('route-v222-precheck');if(!root)return;
    const today=String(window.TODAY||new Date().toISOString().slice(0,10)).slice(0,10),minDate=ym===today.slice(0,7)?today:'';
    root.innerHTML=managers.map(m=>{
      const plans=plansForManager(m),state=visitedStateForManager(m,ym,plans),missing=plans.filter(x=>!validCoord(x.point)),review=plans.filter(x=>x.point.geocode_status==='review'),calls=callClients(m),cal=fieldCalendar(ym,officeDow,minDate),capacity=cal.dates.length*maxPoints;
      let remainingFirst=0,remainingVisits=0;plans.forEach(p=>{const done=Math.min(p.visits,Number(state.counts.get(String(p.point.id))||0));if(done===0)remainingFirst++;remainingVisits+=Math.max(0,p.visits-done);});
      return'<div class="v224-ready"><b>'+escV(m)+'</b>: физических ТТ <b>'+plans.length+'</b> · посещено и сохранится <b style="color:var(--g)">'+state.rows.length+'</b> · осталось первых визитов <b>'+remainingFirst+'</b> · всего осталось визитов <b>'+remainingVisits+'</b> · доступно будущих точек <b>'+capacity+'</b> · прозвон <b>'+calls.length+'</b> · без точных координат <b style="color:'+(missing.length?'var(--am)':'var(--g)')+'">'+missing.length+'</b> · проверить карту <b style="color:'+(review.length?'var(--am)':'var(--g)')+'">'+review.length+'</b>'
        +(state.unmatched?'<div style="color:var(--am);margin-top:4px">⚠ Посещённых строк без однозначной привязки к физической ТТ: '+state.unmatched+'. Они сохранятся и не будут удалены.</div>':'')
        +(missing.length?'<details><summary>Показать точки без точных координат — маршрут строится по адресу</summary>'+missing.slice(0,40).map(x=>'<div>• '+escV(x.label)+' — '+escV([x.point.city,x.point.address].filter(Boolean).join(', '))+'</div>').join('')+'</details>':'')
        +(review.length?'<details><summary>Показать сомнительные точки</summary>'+review.slice(0,40).map(x=>'<div>• '+escV(x.label)+' — <a target="_blank" href="https://yandex.by/maps/?pt='+Number(x.point.lng)+','+Number(x.point.lat)+'&z=16">открыть карту</a></div>').join('')+'</details>':'')+'</div>';
    }).join('');
  };
  window.v222ShowReadiness=window.v224ShowReadiness;

  function installUi(){
    const page=document.getElementById('page-routes-boss');if(!page)return;
    const settings=document.getElementById('route-v222-settings');
    if(settings){
      const btn=settings.querySelector('button[onclick*="ShowReadiness"]');if(btn){btn.textContent='Проверить готовность маршрута';btn.onclick=window.v224ShowReadiness;}
      const note=document.getElementById('route-month-note-boss');if(note)note.innerHTML='<b>v22.4.8.</b> Перед изменением маршрута проверяются настройки месяца; при любой ошибке новые строки и задачи удаляются, прежний проект восстанавливается. Посещённые точки сохраняются и учитываются; маршрут достраивается только по оставшейся части месяца. Маршрут строится по физическим торговым точкам: сначала обязательные первые визиты, затем повторы; дни ограничены реальными 09:00–18:00: учитывается время визитов и переездов; города группируются по территориальным коридорам и не смешиваются, если такой день не помещается. Маршрут внутри дня начинается с дальней точки и идёт в сторону города проживания менеджера (Руднев — Орша, Ачинович — Бобруйск, Шкуран — Мозырь). 4 августа и все прошедшие даты при перестроении исключаются. Несколько юрлиц в одной ТТ показываются одной остановкой; продажи, задачи и история карточек не объединяются. Финально утверждает руководитель.';
    }
    const geo=document.getElementById('geocode-btn');if(geo){geo.textContent='📍 Геокодировать изменённые адреса';geo.onclick=window.geocodeAllClients;}
    const gen=document.getElementById('gen-next-month-btn');if(gen){gen.textContent='🧭 Сформировать проект на выбранный месяц';gen.onclick=window.generateNextMonthRoute;}
    const tabs=document.getElementById('route-month-tabs-boss');
    if(tabs&&!document.getElementById('route-v224-filters')){
      tabs.insertAdjacentHTML('afterend','<div id="route-v224-filters" class="card" style="padding:10px;margin:0 0 10px"><div style="font-size:11px;font-weight:800;color:var(--sub);margin-bottom:6px">ФИЛЬТРЫ: МЕСЯЦ → МЕНЕДЖЕР → НЕДЕЛЯ → ДАТА → СТАТУС</div><div style="display:flex;gap:8px;flex-wrap:wrap"><select id="v224-manager" class="form-input" style="width:150px"><option value="all">Все менеджеры</option><option>Руднев</option><option>Ачинович</option><option>Шкуран</option></select><select id="v224-week" class="form-input" style="width:190px"><option value="">Весь месяц</option></select><input id="v224-date" type="date" class="form-input" style="width:155px"><select id="v224-status" class="form-input" style="width:190px"><option value="all">Все статусы</option><option value="boss_draft">Проект руководителя</option><option value="joint_review">Совместное обсуждение</option><option value="approved">Утверждён</option></select></div></div>');
      const mgr=document.getElementById('v224-manager'),week=document.getElementById('v224-week'),date=document.getElementById('v224-date'),status=document.getElementById('v224-status');
      mgr.value=(typeof rbMgrFilter!=='undefined'&&MANAGERS.includes(rbMgrFilter))?rbMgrFilter:'all';
      mgr.onchange=()=>{
        if(typeof rbMgrFilter!=='undefined')rbMgrFilter=mgr.value;
        selectedWeek='';week.value='';date.value='';
        const oldDate=document.getElementById('rb-date-filter');if(oldDate)oldDate.value='';
        window.renderRoutesBoss?.();
      };
      week.onchange=()=>{
        selectedWeek=week.value;date.value='';
        const oldDate=document.getElementById('rb-date-filter');if(oldDate)oldDate.value='';
        if(typeof window.v222SelectRouteDay==='function')window.v222SelectRouteDay('boss','');
        else window.renderRoutesBoss?.();
      };
      date.onchange=()=>{
        selectedWeek='';week.value='';
        const old=document.getElementById('rb-date-filter');if(old)old.value=date.value;
        window.renderRoutesBoss?.();
      };
      status.onchange=()=>{const old=document.getElementById('rb-approval-filter');if(old)old.value=status.value;window.renderRoutesBoss?.();};
      const oldTop=document.getElementById('rb-approval-filter')?.parentElement;if(oldTop)oldTop.style.display='none';
      const oldMgr=document.getElementById('rb-mgr-chips')?.parentElement;if(oldMgr)oldMgr.style.display='none';
    }
    // Согласование выполняется только кнопкой «Утвердить и отправить месяц».
    // Старые кнопки по отдельным дням скрываем, чтобы не путать руководителя.
    document.querySelectorAll('#rb-content button').forEach(b=>{
      const t=String(b.textContent||'').trim();
      if(t==='✅ Согласовать'||t==='✕ Отклонить')b.style.display='none';
    });
    refreshWeekOptions();
  }

  function refreshWeekOptions(){
    const el=document.getElementById('v224-week');if(!el)return;const ym=monthSelected(),weeks=weeksInMonth(ym),old=selectedWeek;
    el.innerHTML='<option value="">Весь месяц</option>'+weeks.map(w=>'<option value="'+w+'">Неделя с '+w.slice(8,10)+'.'+w.slice(5,7)+'</option>').join('');
    if(weeks.includes(old))el.value=old;else{selectedWeek='';el.value='';}
    const d=document.getElementById('v224-date'),oldD=document.getElementById('rb-date-filter');if(d&&oldD)d.value=oldD.value||'';
    const s=document.getElementById('v224-status'),oldS=document.getElementById('rb-approval-filter');if(s&&oldS)s.value=oldS.value||'all';
  }

  const renderBossBase=window.renderRoutesBoss;
  window.renderRoutesBoss=function(){
    installUi();
    const saved=allRoutePlans;
    const ym=monthSelected();
    const selectedDate=String(document.getElementById('rb-date-filter')?.value||'');
    // В рабочем проекте показываем только активные строки выбранного месяца.
    // Убранные версии остаются в базе для истории, но больше не смешиваются с новым проектом.
    let visible=saved.filter(r=>String(r.visit_date||'').startsWith(ym)&&!r.removed);
    if(selectedDate)visible=visible.filter(r=>String(r.visit_date||'')===selectedDate);
    else if(selectedWeek)visible=visible.filter(r=>mondayOf(String(r.visit_date||''))===selectedWeek);
    allRoutePlans=visible;
    try{
      const result=renderBossBase?.();
      const root=document.getElementById('rb-content');
      if(root&&visible.length&&/маршруты не загружены|нет маршрутов/i.test(String(root.textContent||''))){
        // Скрытый старый фильтр «без задач» не должен прятать сформированный маршрут.
        try{if(typeof rbTaskFilter!=='undefined')rbTaskFilter='all';}catch(_){}
        const search=document.getElementById('rb-search');if(search)search.value='';
        renderBossBase?.();
      }
      return result;
    }finally{allRoutePlans=saved;installUi();}
  };

  const selectDayBase=window.v222SelectRouteDay;
  if(typeof selectDayBase==='function')window.v222SelectRouteDay=function(kind,date){
    if(kind==='boss'&&date){
      selectedWeek='';
      const week=document.getElementById('v224-week');if(week)week.value='';
      const dateUi=document.getElementById('v224-date');if(dateUi)dateUi.value=date;
    }
    if(kind==='boss'&&!date){const dateUi=document.getElementById('v224-date');if(dateUi)dateUi.value='';}
    return selectDayBase(kind,date);
  };

  const selectMonthBase=window.v221SelectRouteMonth;
  if(typeof selectMonthBase==='function')window.v221SelectRouteMonth=function(kind,month){
    selectedWeek='';
    const week=document.getElementById('v224-week');if(week)week.value='';
    const dateUi=document.getElementById('v224-date');if(dateUi)dateUi.value='';
    const result=selectMonthBase(kind,month);
    setTimeout(()=>{installUi();kind==='boss'?window.renderRoutesBoss?.():window.renderMyRoutes?.();},0);
    return result;
  };

  window.loadTodayToRoute=async function(date){
    const myName=currentProfile?.name;
    const rows=(allRoutePlans||[]).filter(r=>r.manager_name===myName&&r.visit_date===date&&!r.removed&&!r.is_office_day);
    routeClients=[];
    rows.sort((a,b)=>(Number(a.sort_order)||999)-(Number(b.sort_order)||999)).forEach(r=>{
      if(!String(r.address||'').trim())return;
      if(r.is_network_point){
        routeClients.push({id:'network_'+r.id,name:r.network_name||r.client_name||'Сетевая точка',address:r.address,city:r.city||'',region:r.region||'',role_type:r.network_category||r.category||'AAA',manager_name:myName,lat:r.route_lat,lng:r.route_lng,route_plan_id:r.id,is_network_point:true,network_transfer_status:r.network_transfer_status,network_transfer_recipient:r.network_transfer_recipient,network_transfer_completed_at:r.network_transfer_completed_at,visited:!!r.visited});
        return;
      }
      const c=(allClients||[]).find(x=>String(x.id)===String(r.client_id))||(allClients||[]).find(x=>nameLooseMatch(x.name,r.client_name));
      routeClients.push({
        ...(c||{}),id:c?.id||('plan_'+r.id),name:r.client_name,address:r.address,city:r.city||'',region:r.region||'',
        role_type:r.category,manager_name:myName,lat:r.route_lat??c?.lat,lng:r.route_lng??c?.lng,
        route_plan_id:r.id,physical_point_id:r.physical_point_id,linked_client_ids:r.linked_client_ids||[]
      });
    });
    routeClients=groupByCity(routeClients);goPage('route','Маршрут дня');renderRoute();
  };

  const loadBase=window.loadData;
  window.loadData=async function(){const result=await loadBase();installUi();return result;};
  window.crmPrefetchPhysicalRoutesV22734=()=>loadV224(false);
  const goBase=window.goPage;
  window.goPage=function(page,title){const out=goBase(page,title);if(page==='routes-boss'||page==='my-routes'||page==='route')crmSchedulePageHook(page,async()=>{const refreshed=await loadV224();if(crmActivePage()!==page)return;installUi();if(refreshed&&page==='my-routes')window.renderMyRoutes?.();else if(refreshed&&page==='route')window.renderRoute?.();},25);return out;};

  installUi();
  // Public read-only API for the manual route planner (v22.5.0).
  // It deliberately exposes only calculated physical-route data and reload helpers;
  // client cards, sales, tasks and visits remain in their original tables.
  window.RESANTA_MANUAL_ROUTE_API=Object.freeze({
    managers:()=>MANAGERS.slice(),
    plansForManager:(manager)=>plansForManager(manager),
    clientsForPoint:(point)=>clientsForPoint(point),
    pointIdForRouteRow:(row,manager)=>pointIdForRouteRow(row,plansForManager(manager)),
    isVisitedRouteRow:(row)=>isVisitedRouteRow(row),
    routeMonth:()=>monthSelected(),
    reloadPhysical:()=>loadV224(true),
    validCoord:(point)=>validCoord(point),
    sku:(client)=>sku(client),
    category:(client)=>category(client),
    isPotential:(client)=>isPotential(client),
    version:VERSION
  });
  window.RESANTA_V224=Object.freeze({version:VERSION,realDayCapacity:true,managerHomeCities:true,excludePastDates:true,physicalPoints:true,routeOnlyGeocoding:true,oneOfficeDayWeek:true,firstVisitsBeforeRepeats:true,maxPoints15:true,bossFinalApproval:true,xlsSource:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 18 ===== */
// RESANTA CRM v22.5.2 · ЛЁГКОЕ РУЧНОЕ ПЛАНИРОВАНИЕ МАРШРУТОВ
(function(){
  'use strict';
  const VERSION='22.5.2';
  const MAX_POINTS=15;
  const MANAGERS=['Руднев','Ачинович','Шкуран'];
  const state={
    manager:'Руднев',date:'',type:'field',city:'',query:'',
    selected:new Set(),locked:new Set(),networkSelected:new Set(),networkLocked:new Set(),
    networkPoints:[],networkLoaded:false,
    plansCache:new Map(),planMapCache:new Map(),monthIndexCache:new Map(),rowPointCache:new Map(),
    loading:false,installed:false,refreshTimer:null,liveChannel:null
  };

  const api=()=>window.RESANTA_MANUAL_ROUTE_API;
  const escM=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const normM=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,' ').trim();
  const todayM=()=>String(window.TODAY||new Date().toISOString().slice(0,10)).slice(0,10);
  const ymM=()=>localStorage.getItem('crm_route_month_boss')||todayM().slice(0,7);
  const activeRow=r=>r&&!r.removed;
  const isVisited=r=>api()?.isVisitedRouteRow?.(r)||r?.visited===true||String(r?.visited||'').toLowerCase()==='true'||!!r?.linked_visit_id;
  const approvedRow=r=>activeRow(r)&&(r.approved===true||String(r.review_status||'').toLowerCase()==='approved');
  const pointId=p=>String(p?.point?.id||'');
  const pointCity=p=>String(p?.point?.city||'').trim()||'Без города';
  const pointAddress=p=>String(p?.point?.address||'').trim()||'Адрес не указан';
  const clientSku=c=>Number(c?.sku_count)||0;
  const isPotential=c=>normM(c?.client_status)==='потенциальный';
  const networkId=n=>String(n?.id||'');
  const networkForManager=manager=>(state.networkPoints||[]).filter(n=>n.active!==false&&normM(n.manager_name)===normM(manager)).sort((a,b)=>String(a.city||'').localeCompare(String(b.city||''),'ru')||String(a.network_name||'').localeCompare(String(b.network_name||''),'ru')||String(a.address||'').localeCompare(String(b.address||''),'ru'));
  async function loadNetworkPoints(){
    if(state.networkLoaded)return state.networkPoints;
    try{state.networkPoints=(await loadAllRows('route_network_points')||[]).filter(x=>x.active!==false);state.networkLoaded=true;}
    catch(e){console.warn('v22.7.1 network points are not installed',e);state.networkPoints=[];state.networkLoaded=true;}
    return state.networkPoints;
  }

  function addDays(dateStr,n){const d=new Date(dateStr+'T12:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function nextWorkday(dateStr){let d=addDays(dateStr,1);for(let i=0;i<7;i++){const x=new Date(d+'T12:00:00').getDay();if(x!==0&&x!==6)return d;d=addDays(d,1);}return d;}
  function defaultDate(){const ym=ymM(),today=todayM();if(ym===today.slice(0,7))return nextWorkday(today);let d=ym+'-01',js=new Date(d+'T12:00:00').getDay();if(js===6)d=addDays(d,2);else if(js===0)d=addDays(d,1);return d;}

  function ensureStyles(){
    if(document.getElementById('manual-route-lite-style'))return;
    const s=document.createElement('style');s.id='manual-route-lite-style';s.textContent=`
      #manual-route-lite{border:2px solid #7C3AED;background:#FAF5FF;margin:10px 0 14px;padding:14px;border-radius:14px}
      .mrl-grid{display:grid;grid-template-columns:180px 180px 190px 1fr;gap:10px;align-items:end}.mrl-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .mrl-work{display:grid;grid-template-columns:240px 1fr;gap:12px;margin-top:12px}.mrl-cities,.mrl-points{background:#fff;border:1px solid var(--border);border-radius:10px;max-height:460px;overflow:auto}
      .mrl-city{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--border);background:#fff;padding:10px 12px;cursor:pointer}.mrl-city.active{background:#EDE9FE;color:#5B21B6;font-weight:700}
      .mrl-row{display:flex;gap:9px;align-items:flex-start;padding:10px 12px;border-bottom:1px solid var(--border)}.mrl-row.locked{opacity:.7;background:#F8FAFC}
      .mrl-must{color:var(--r);font-weight:700}.mrl-due{color:var(--am);font-weight:700}.mrl-ok{color:var(--g)}
      .mrl-summary{background:#fff;border:1px solid #C4B5FD;border-radius:10px;padding:10px;margin-top:10px;max-height:180px;overflow:auto}.mrl-day{background:#fff;border:1px solid var(--border);border-radius:10px;padding:10px;margin-top:10px}
      @media(max-width:900px){.mrl-grid{grid-template-columns:1fr 1fr}.mrl-work{grid-template-columns:1fr}}@media(max-width:520px){.mrl-grid{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }

  function getPlans(manager){
    if(state.plansCache.has(manager))return state.plansCache.get(manager);
    let list=api()?.plansForManager?.(manager)||[];
    list=list.filter(p=>(p.eligible||[]).some(x=>isPotential(x.client)||clientSku(x.client)>=15));
    state.plansCache.set(manager,list);
    state.planMapCache.set(manager,new Map(list.map(p=>[pointId(p),p])));
    return list;
  }
  function clearIndexes(){state.monthIndexCache.clear();state.rowPointCache.clear();}
  function rowPointId(row,manager){
    if(row?.is_network_point)return '';
    if(row?.physical_point_id)return String(row.physical_point_id);
    const key=String(row?.id||'')+'|'+manager;
    if(state.rowPointCache.has(key))return state.rowPointCache.get(key);
    let pid='';
    try{pid=String(api()?.pointIdForRouteRow?.(row,getPlans(manager))||'');}catch(_){pid='';}
    state.rowPointCache.set(key,pid);return pid;
  }
  function monthIndex(manager,ym){
    const key=manager+'|'+ym;
    if(state.monthIndexCache.has(key))return state.monthIndexCache.get(key);
    const idx={counts:new Map(),dates:new Map(),dayRows:new Map()};
    for(const r of (allRoutePlans||[])){
      if(r.manager_name!==manager||!String(r.visit_date||'').startsWith(ym)||!activeRow(r))continue;
      if(!idx.dayRows.has(r.visit_date))idx.dayRows.set(r.visit_date,[]);idx.dayRows.get(r.visit_date).push(r);
      if(r.is_network_point)continue;
      const pid=rowPointId(r,manager);if(!pid)continue;
      idx.counts.set(pid,(idx.counts.get(pid)||0)+1);
      if(!idx.dates.has(pid))idx.dates.set(pid,[]);idx.dates.get(pid).push(r.visit_date);
    }
    for(const dates of idx.dates.values())dates.sort();
    state.monthIndexCache.set(key,idx);return idx;
  }
  function countsExcludingDate(manager,ym,date){
    const idx=monthIndex(manager,ym),counts=new Map(idx.counts);
    for(const r of (idx.dayRows.get(date)||[])){const pid=rowPointId(r,manager);if(pid)counts.set(pid,Math.max(0,(counts.get(pid)||0)-1));}
    return counts;
  }
  function recommendation(plan,counts){
    const n=counts.get(pointId(plan))||0,target=Math.max(1,Number(plan.visits)||1);
    if(n===0)return{level:'must',text:'Первый визит ещё не запланирован'};
    if(n<target)return{level:'due',text:'По регламенту не хватает посещений: '+(target-n)};
    return{level:'ok',text:'Норматив месяца закрыт'};
  }

  function hideOldHeavyBlocks(){
    ['route-v222-settings','route-v224-settings','route-day-tabs-boss-top','route-day-tabs-boss','gen-next-month-btn','geocode-btn'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
    const approval=[...document.querySelectorAll('#page-routes-boss button')];
    approval.forEach(b=>{const t=String(b.textContent||'');if(/Согласовать все|Утвердить и отправить месяц|Сформировать проект/i.test(t))b.style.display='none';});
  }

  function panelHtml(){
    return `<div id="manual-route-lite">
      <div style="font-size:18px;font-weight:800;color:#5B21B6">🗓 Ручной маршрут руководителя</div>
      <div style="font-size:12px;color:var(--sub);margin-top:4px">Выберите менеджера, дату и тип дня. Клиенты загружаются только после нажатия кнопки — раздел больше не обрабатывает весь месяц сразу.</div>
      <div class="mrl-grid" style="margin-top:12px">
        <label><span class="form-label">Менеджер</span><select id="mrl-manager" class="form-input">${MANAGERS.map(m=>'<option>'+escM(m)+'</option>').join('')}</select></label>
        <label><span class="form-label">Дата</span><input id="mrl-date" class="form-input" type="date"></label>
        <label><span class="form-label">Тип дня</span><select id="mrl-type" class="form-input"><option value="field">Полевой день</option><option value="office">Офисный день 09:00–18:00</option></select></label>
        <div class="mrl-actions"><button class="btn-primary" id="mrl-load">Показать клиентов</button><button class="btn-secondary" id="mrl-check">Проверить пропуски</button></div>
      </div>
      <div id="mrl-status" style="font-size:12px;color:var(--sub);margin-top:8px"></div>
      <div id="mrl-editor" style="display:none">
        <div id="mrl-field">
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><input id="mrl-search" class="form-input" style="max-width:360px" placeholder="Поиск клиента или адреса"><button class="btn-secondary" id="mrl-recommended">Добавить рекомендованные в городе</button><button class="btn-secondary" id="mrl-clear">Снять выбор</button></div>
          <div class="mrl-work"><div id="mrl-cities" class="mrl-cities"></div><div id="mrl-points" class="mrl-points"></div></div>
          <div id="mrl-network-wrap" style="margin-top:12px;background:#EFF6FF;border:1px solid #93C5FD;border-radius:10px;padding:10px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b style="color:#1D4ED8">🏬 Сетевые точки / передача</b><div style="font-size:11px;color:var(--sub);margin-top:2px">Не являются клиентами и не участвуют в продажах, АКБ, ABC, планах и ИИ-задачах.</div></div><button type="button" class="btn-secondary" id="mrl-network-geocode" style="font-size:11px">📍 Геокодировать сети</button></div>
            <div id="mrl-network-points" style="margin-top:8px;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:6px"></div>
          </div>
          <div id="mrl-summary" class="mrl-summary"></div>
        </div>
        <div id="mrl-office" style="display:none;background:var(--ab);border-radius:10px;padding:14px;margin-top:12px;color:var(--at)"><b>Офисный день 09:00–18:00.</b> Непосещённые клиентские точки этой даты будут сняты. Посещённые строки сохраняются.</div>
        <div class="mrl-actions" style="justify-content:flex-end"><button class="btn-primary" id="mrl-save">Сохранить и сразу отправить менеджеру</button></div>
      </div>
      <div id="mrl-reminder" style="display:none" class="mrl-day"></div>
      <div id="mrl-current" class="mrl-day"></div>
    </div>`;
  }

  function installBossUi(){
    if(currentProfile?.role!=='boss')return;
    ensureStyles();const page=document.getElementById('page-routes-boss');if(!page)return;
    hideOldHeavyBlocks();
    let panel=document.getElementById('manual-route-lite');
    if(!panel){
      const anchor=document.getElementById('route-month-note-boss')||document.getElementById('route-month-tabs-boss')||page.firstElementChild;
      if(anchor)anchor.insertAdjacentHTML('afterend',panelHtml());else page.insertAdjacentHTML('afterbegin',panelHtml());
      panel=document.getElementById('manual-route-lite');
      bindPanel();
    }
    const note=document.getElementById('route-month-note-boss');if(note)note.innerHTML='<b>v22.7.1.</b> Ручной маршрут: менеджер → дата → город → физические ТТ. Автоматическое формирование отключено. Рабочие клиенты менее 15 SKU исключены.';
    renderCurrentDay();state.installed=true;
  }

  function bindPanel(){
    const manager=document.getElementById('mrl-manager'),date=document.getElementById('mrl-date'),type=document.getElementById('mrl-type');
    manager.value=state.manager;date.value=state.date||defaultDate();type.value=state.type;
    manager.addEventListener('change',()=>{state.manager=manager.value;resetEditor();renderCurrentDay();});
    date.addEventListener('change',()=>{state.date=date.value;resetEditor();renderCurrentDay();});
    type.addEventListener('change',()=>{state.type=type.value;toggleType();});
    document.getElementById('mrl-load').addEventListener('click',loadEditor);
    document.getElementById('mrl-check').addEventListener('click',showReminder);
    document.getElementById('mrl-search').addEventListener('input',e=>{state.query=e.target.value;renderPoints();});
    document.getElementById('mrl-recommended').addEventListener('click',addRecommended);
    document.getElementById('mrl-clear').addEventListener('click',()=>{state.selected=new Set(state.locked);state.networkSelected=new Set(state.networkLocked);renderPoints();renderNetworkPoints();renderSummary();});
    document.getElementById('mrl-network-geocode').addEventListener('click',()=>window.v2271GeocodeNetworkPoints?.(state.manager));
    document.getElementById('mrl-save').addEventListener('click',saveDay);
  }
  function resetEditor(){state.selected=new Set();state.locked=new Set();state.networkSelected=new Set();state.networkLocked=new Set();state.city='';state.query='';const ed=document.getElementById('mrl-editor');if(ed)ed.style.display='none';}
  function toggleType(){const office=state.type==='office';document.getElementById('mrl-field').style.display=office?'none':'block';document.getElementById('mrl-office').style.display=office?'block':'none';}

  async function loadEditor(){
    if(state.loading)return;state.loading=true;
    const status=document.getElementById('mrl-status');status.textContent='Загружаю клиентов выбранного менеджера…';
    try{
      state.manager=document.getElementById('mrl-manager').value;state.date=document.getElementById('mrl-date').value;state.type=document.getElementById('mrl-type').value;
      if(!state.date)throw new Error('Выберите дату.');
      if(state.date<=todayM())throw new Error('Выберите будущую дату после '+todayM()+'.');
      await loadNetworkPoints();
      const ps=getPlans(state.manager),idx=monthIndex(state.manager,state.date.slice(0,7));
      state.selected=new Set();state.locked=new Set();state.networkSelected=new Set();state.networkLocked=new Set();
      for(const r of (idx.dayRows.get(state.date)||[])){
        if(r.is_network_point&&r.network_point_id){const nid=String(r.network_point_id);state.networkSelected.add(nid);if(isVisited(r))state.networkLocked.add(nid);continue;}
        const pid=rowPointId(r,state.manager);if(pid){state.selected.add(pid);if(isVisited(r))state.locked.add(pid);}
      }
      const cities=[...new Set(ps.map(pointCity))].sort((a,b)=>a.localeCompare(b,'ru'));
      const firstSelected=ps.find(p=>state.selected.has(pointId(p)));state.city=firstSelected?pointCity(firstSelected):(cities[0]||'');
      document.getElementById('mrl-editor').style.display='block';toggleType();renderCities();renderPoints();renderNetworkPoints();renderSummary();
      status.textContent='Загружено физических ТТ: '+ps.length+' · сетевых точек: '+networkForManager(state.manager).length+'. В список клиентов не входят рабочие клиенты менее 15 SKU.';
    }catch(e){status.textContent='';alert(e.message||e);}finally{state.loading=false;}
  }

  function renderCities(){
    const ps=getPlans(state.manager),counts={};ps.forEach(p=>counts[pointCity(p)]=(counts[pointCity(p)]||0)+1);
    document.getElementById('mrl-cities').innerHTML=Object.keys(counts).sort((a,b)=>a.localeCompare(b,'ru')).map(c=>'<button class="mrl-city '+(c===state.city?'active':'')+'" data-city="'+escM(c)+'">'+escM(c)+' <span style="float:right;color:var(--sub)">'+counts[c]+'</span></button>').join('');
    document.querySelectorAll('#mrl-cities .mrl-city').forEach(b=>b.addEventListener('click',()=>{state.city=b.dataset.city||'';renderCities();renderPoints();}));
  }
  function visiblePlans(){
    const q=normM(state.query),counts=countsExcludingDate(state.manager,state.date.slice(0,7),state.date),rank={must:0,due:1,ok:2};
    return getPlans(state.manager).filter(p=>pointCity(p)===state.city).filter(p=>!q||normM(p.label+' '+pointAddress(p)+' '+(p.names||[]).join(' ')).includes(q)).sort((a,b)=>rank[recommendation(a,counts).level]-rank[recommendation(b,counts).level]||pointAddress(a).localeCompare(pointAddress(b),'ru'));
  }
  function renderPoints(){
    const root=document.getElementById('mrl-points');if(!root)return;
    const counts=countsExcludingDate(state.manager,state.date.slice(0,7),state.date),rows=visiblePlans();
    if(!rows.length){root.innerHTML='<div style="padding:18px;color:var(--sub)">В этом городе нет подходящих маршрутных ТТ.</div>';return;}
    root.innerHTML=rows.map(p=>{
      const id=pointId(p),checked=state.selected.has(id),locked=state.locked.has(id),rec=recommendation(p,counts),skuText=(p.eligible||[]).map(x=>x.client.name+': '+clientSku(x.client)+' SKU').join(' · ');
      return '<label class="mrl-row '+(locked?'locked':'')+'"><input type="checkbox" data-pid="'+escM(id)+'" '+(checked?'checked ':'')+(locked?'disabled ':'')+'style="width:18px;height:18px;margin-top:2px"><span style="flex:1"><b>'+escM(p.label)+'</b><span style="display:block;font-size:11px;color:var(--sub);margin-top:2px">📍 '+escM(pointAddress(p))+'</span><span class="mrl-'+rec.level+'" style="display:block;font-size:11px;margin-top:3px">'+escM(rec.text)+'</span><span style="display:block;font-size:10px;color:var(--sub);margin-top:2px">'+escM(p.category)+' · '+escM(skuText)+'</span></span></label>';
    }).join('');
    root.querySelectorAll('input[data-pid]').forEach(ch=>ch.addEventListener('change',()=>{const id=String(ch.dataset.pid);if(ch.checked)state.selected.add(id);else state.selected.delete(id);renderSummary();}));
  }
  function renderNetworkPoints(){
    const root=document.getElementById('mrl-network-points');if(!root)return;
    const rows=networkForManager(state.manager);
    if(!rows.length){root.innerHTML='<div style="font-size:12px;color:var(--sub);padding:6px">У менеджера нет сетевых точек.</div>';return;}
    root.innerHTML=rows.map(n=>{
      const id=networkId(n),checked=state.networkSelected.has(id),locked=state.networkLocked.has(id),geo=(Number.isFinite(Number(n.lat))&&Number.isFinite(Number(n.lng)))?'📍 координаты есть':'⚠ без координат';
      return '<label class="mrl-row '+(locked?'locked':'')+'" style="margin:0;border:1px solid #BFDBFE;border-radius:8px;background:#fff"><input type="checkbox" data-npid="'+escM(id)+'" '+(checked?'checked ':'')+(locked?'disabled ':'')+'style="width:18px;height:18px;margin-top:2px"><span style="flex:1"><b>🏬 '+escM(n.network_name)+' · '+escM(n.city||'')+'</b><span style="display:block;font-size:11px;color:var(--sub);margin-top:2px">'+escM(n.address||'Адрес не указан')+'</span><span style="display:block;font-size:10px;color:'+(geo.startsWith('📍')?'var(--g)':'var(--am)')+';margin-top:3px">AAA · передача · '+geo+'</span></span></label>';
    }).join('');
    root.querySelectorAll('input[data-npid]').forEach(ch=>ch.addEventListener('change',()=>{const id=String(ch.dataset.npid);if(ch.checked)state.networkSelected.add(id);else state.networkSelected.delete(id);renderSummary();}));
  }
  function addRecommended(){const counts=countsExcludingDate(state.manager,state.date.slice(0,7),state.date);for(const p of visiblePlans())if(recommendation(p,counts).level!=='ok')state.selected.add(pointId(p));renderPoints();renderSummary();}
  function renderSummary(){
    const root=document.getElementById('mrl-summary');if(!root)return;
    const selected=getPlans(state.manager).filter(p=>state.selected.has(pointId(p))).sort((a,b)=>pointCity(a).localeCompare(pointCity(b),'ru')||pointAddress(a).localeCompare(pointAddress(b),'ru'));
    const networks=networkForManager(state.manager).filter(n=>state.networkSelected.has(networkId(n)));
    const total=selected.length+networks.length,grouped={};selected.forEach(p=>(grouped[pointCity(p)]||(grouped[pointCity(p)]=[])).push(p));
    root.innerHTML='<b>Выбрано: '+total+' из '+MAX_POINTS+' · клиентских ТТ '+selected.length+' · сетевых '+networks.length+'</b>'
      +(selected.length?Object.entries(grouped).map(([c,ps])=>'<div style="padding:5px 0;border-top:1px solid #E9D5FF"><b>'+escM(c)+'</b> — '+ps.length+': '+ps.map(p=>escM(p.label)).join('; ')+'</div>').join(''):'')
      +(networks.length?'<div style="padding:5px 0;border-top:1px solid #BFDBFE;color:#1D4ED8"><b>🏬 Сети</b> — '+networks.map(n=>escM(n.network_name+' · '+n.city)).join('; ')+'</div>':'')
      +(!total?'<div style="padding-top:6px;color:var(--sub)">Точки ещё не выбраны.</div>':'')+(total>MAX_POINTS?'<div style="color:var(--r);font-weight:700">Лимит 15 ТТ превышен.</div>':'');
  }

  function showReminder(){
    state.manager=document.getElementById('mrl-manager').value;state.date=document.getElementById('mrl-date').value||defaultDate();
    const ps=getPlans(state.manager),idx=monthIndex(state.manager,state.date.slice(0,7)),missed=[],under=[];
    for(const p of ps){const n=idx.counts.get(pointId(p))||0,target=Math.max(1,Number(p.visits)||1);if(n===0)missed.push(p);else if(n<target)under.push({p,left:target-n});}
    const cities=[...new Set(missed.map(pointCity))];const root=document.getElementById('mrl-reminder');root.style.display='block';
    root.innerHTML='<b>'+escM(state.manager)+'</b>: обязательных физических ТТ без даты — <b style="color:'+(missed.length?'var(--r)':'var(--g)')+'">'+missed.length+'</b> · повторных визитов не хватает — <b style="color:'+(under.length?'var(--am)':'var(--g)')+'">'+under.reduce((s,x)=>s+x.left,0)+'</b>'+(cities.length?'<div style="font-size:11px;color:var(--sub);margin-top:4px">Города: '+escM(cities.slice(0,15).join(', '))+(cities.length>15?'…':'')+'</div>':'');
  }

  function renderCurrentDay(){
    const root=document.getElementById('mrl-current');if(!root)return;
    const manager=document.getElementById('mrl-manager')?.value||state.manager,date=document.getElementById('mrl-date')?.value||state.date||defaultDate();
    const rows=(allRoutePlans||[]).filter(r=>r.manager_name===manager&&r.visit_date===date&&activeRow(r));
    if(!rows.length){root.innerHTML='<b>Выбранный день:</b> '+escM(manager)+' · '+escM(date)+' — маршрут пока не задан.';return;}
    const active=rows.sort((a,b)=>(Number(a.sort_order)||0)-(Number(b.sort_order)||0));
    root.innerHTML='<b>Выбранный день:</b> '+escM(manager)+' · '+escM(date)+' · '+active.length+' строк'+active.map((r,i)=>'<div style="font-size:12px;padding:5px 0;border-top:1px solid var(--border)">'+(i+1)+'. '+escM(r.is_office_day?'Офисный день 09:00–18:00':r.is_network_point?'🏬 '+(r.network_name||r.client_name||'Сеть')+' — передача · '+(r.city||'')+', '+(r.address||''):(r.client_name||'ТТ')+' — '+(r.city||'')+', '+(r.address||''))+(isVisited(r)?' · ✅ выполнено':'')+'</div>').join('');
  }

  function plannedTimes(count,index){if(!count)return{start:'09:00:00',end:'18:00:00',minutes:540};const slot=Math.max(20,Math.floor(540/count)),start=9*60+slot*index,end=index===count-1?18*60:Math.min(18*60,start+slot);const fmt=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')+':00';return{start:fmt(start),end:fmt(end),minutes:end-start};}
  function rowFromPlan(plan,manager,date,index,count){const t=plannedTimes(count,index),primary=plan.primary||plan.eligible?.[0]?.client,now=new Date().toISOString();return{
    client_id:primary?.id||null,manager_name:manager,visit_date:date,client_name:plan.label,city:plan.point.city||'',region:plan.point.region||'',address:plan.point.address||'',category:plan.category||'',
    approved:true,review_status:'approved',source:'boss_manual_approved',generated_month:date.slice(0,7),removed:false,sort_order:index+1,planned_minutes:t.minutes,planned_start:t.start,planned_end:t.end,is_office_day:false,
    physical_point_id:plan.point.id,physical_point_key:plan.point.point_key,linked_client_ids:(plan.linked||[]).map(x=>x.client.id),linked_client_names:plan.names||[],route_lat:plan.point.lat||null,route_lng:plan.point.lng||null,
    route_zone:[plan.point.region,plan.point.city].filter(Boolean).join(' / '),route_version:VERSION,reason:'Маршрут вручную составлен и утверждён руководителем',approved_by:currentProfile?.name||null,approved_at:now,
    is_network_point:false,network_point_id:null,network_name:null,network_category:null
  };}
  function rowFromNetwork(n,manager,date,index,count){const t=plannedTimes(count,index),now=new Date().toISOString();return{
    client_id:null,manager_name:manager,visit_date:date,client_name:'🏬 '+n.network_name+' — передача',city:n.city||'',region:n.region||'',address:n.address||'',category:n.category||'AAA',
    approved:true,review_status:'approved',source:'boss_network_transfer_v2271',generated_month:date.slice(0,7),removed:false,sort_order:index+1,planned_minutes:t.minutes,planned_start:t.start,planned_end:t.end,is_office_day:false,
    physical_point_id:null,physical_point_key:null,linked_client_ids:[],linked_client_names:[],route_lat:n.lat||null,route_lng:n.lng||null,
    route_zone:[n.region,n.city].filter(Boolean).join(' / '),route_version:'22.7.1',reason:'Сетевая торговая точка добавлена руководителем для передачи. Продажи и клиентская аналитика не учитываются.',approved_by:currentProfile?.name||null,approved_at:now,
    is_network_point:true,network_point_id:n.id,network_name:n.network_name,network_category:n.category||'AAA',network_transfer_status:'planned',network_transfer_recipient:null,network_transfer_comment:null,network_transfer_completed_at:null,network_transfer_completed_by:null,visited:false
  };}
  async function updateRows(ids,patch){for(let i=0;i<ids.length;i+=100){const {error}=await db.from('route_plans').update(patch).in('id',ids.slice(i,i+100));if(error)throw error;}}
  async function reloadRoutes(){allRoutePlans=await loadAllRows('route_plans');clearIndexes();}
  async function approveWorkflow(manager,ym){
    const {data:old,error:e0}=await db.from('route_month_workflow').select('*').eq('manager_name',manager).eq('route_month',ym).maybeSingle();if(e0)throw e0;
    const now=new Date().toISOString(),row={...(old||{}),manager_name:manager,route_month:ym,status:'approved',office_weekday:Number(old?.office_weekday||1),max_points_day:15,updated_at:now,approved_by:currentProfile?.name||null,approved_at:now,boss_comment:'Маршрут составляет и изменяет руководитель вручную.'};
    delete row.id;const {error}=await db.from('route_month_workflow').upsert(row,{onConflict:'manager_name,route_month'});if(error)throw error;
  }

  async function saveDay(){
    if(currentProfile?.role!=='boss')return;
    state.manager=document.getElementById('mrl-manager').value;state.date=document.getElementById('mrl-date').value;state.type=document.getElementById('mrl-type').value;
    if(!state.date||state.date<=todayM()){alert('Выберите будущую дату после '+todayM()+'.');return;}
    const office=state.type==='office';
    const selected=getPlans(state.manager).filter(p=>state.selected.has(pointId(p))).sort((a,b)=>pointCity(a).localeCompare(pointCity(b),'ru')||pointAddress(a).localeCompare(pointAddress(b),'ru'));
    const selectedNetworks=networkForManager(state.manager).filter(n=>state.networkSelected.has(networkId(n))).sort((a,b)=>String(a.city||'').localeCompare(String(b.city||''),'ru')||String(a.address||'').localeCompare(String(b.address||''),'ru'));
    const totalSelected=selected.length+selectedNetworks.length;
    if(!office&&!totalSelected){alert('Выберите хотя бы одну клиентскую или сетевую торговую точку.');return;}
    if(totalSelected>MAX_POINTS){alert('На день можно сохранить не более 15 физических ТТ, включая сетевые точки.');return;}
    if(!confirm((office?'Сохранить офисный день':'Сохранить '+totalSelected+' ТТ, включая сетевых '+selectedNetworks.length)+' для '+state.manager+' на '+state.date+' и сразу отправить менеджеру?'))return;
    const btn=document.getElementById('mrl-save');btn.disabled=true;btn.textContent='Сохраняю…';
    try{
      const old=(allRoutePlans||[]).filter(r=>r.manager_name===state.manager&&r.visit_date===state.date&&activeRow(r)),visited=old.filter(isVisited),replaceable=old.filter(r=>!isVisited(r)),keepIds=new Set();
      if(office){
        const row={manager_name:state.manager,visit_date:state.date,client_name:'Офисный день',city:'',region:'',address:'',category:'Офис',approved:true,review_status:'approved',source:'boss_manual_approved',generated_month:state.date.slice(0,7),removed:false,sort_order:0,planned_minutes:540,planned_start:'09:00:00',planned_end:'18:00:00',is_office_day:true,route_version:VERSION,reason:'Офисный день вручную утверждён руководителем',approved_by:currentProfile?.name||null,approved_at:new Date().toISOString(),is_network_point:false,network_point_id:null};
        const existing=old.find(r=>r.is_office_day&&!isVisited(r));if(existing){const {error}=await db.from('route_plans').update(row).eq('id',existing.id);if(error)throw error;keepIds.add(String(existing.id));}else{const {data,error}=await db.from('route_plans').insert(row).select().single();if(error)throw error;if(data)keepIds.add(String(data.id));}
      }else{
        const entries=[...selected.map(p=>({kind:'client',city:pointCity(p),address:pointAddress(p),value:p})),...selectedNetworks.map(n=>({kind:'network',city:String(n.city||''),address:String(n.address||''),value:n}))].sort((a,b)=>a.city.localeCompare(b.city,'ru')||a.address.localeCompare(b.address,'ru'));
        for(let i=0;i<entries.length;i++){
          const e=entries[i];
          if(e.kind==='client'){
            const p=e.value,pid=pointId(p),patch=rowFromPlan(p,state.manager,state.date,i,entries.length),existing=old.find(r=>!r.is_network_point&&rowPointId(r,state.manager)===pid&&!isVisited(r));
            if(existing){const {error}=await db.from('route_plans').update(patch).eq('id',existing.id);if(error)throw error;keepIds.add(String(existing.id));}
            else{const removed=(allRoutePlans||[]).find(r=>r.manager_name===state.manager&&r.visit_date===state.date&&r.removed&&!r.is_network_point&&rowPointId(r,state.manager)===pid);if(removed){const {error}=await db.from('route_plans').update(patch).eq('id',removed.id);if(error)throw error;keepIds.add(String(removed.id));}else{const {data,error}=await db.from('route_plans').insert(patch).select().single();if(error)throw error;if(data)keepIds.add(String(data.id));}}
          }else{
            const n=e.value,nid=networkId(n),patch=rowFromNetwork(n,state.manager,state.date,i,entries.length),existing=old.find(r=>r.is_network_point&&String(r.network_point_id||'')===nid&&!isVisited(r));
            if(existing){const {error}=await db.from('route_plans').update(patch).eq('id',existing.id);if(error)throw error;keepIds.add(String(existing.id));}
            else{const removed=(allRoutePlans||[]).find(r=>r.manager_name===state.manager&&r.visit_date===state.date&&r.removed&&r.is_network_point&&String(r.network_point_id||'')===nid);if(removed){const {error}=await db.from('route_plans').update(patch).eq('id',removed.id);if(error)throw error;keepIds.add(String(removed.id));}else{const {data,error}=await db.from('route_plans').insert(patch).select().single();if(error)throw error;if(data)keepIds.add(String(data.id));}}
          }
        }
      }
      const removeIds=replaceable.filter(r=>!keepIds.has(String(r.id))).map(r=>r.id);if(removeIds.length)await updateRows(removeIds,{removed:true,approved:false,source:'superseded_by_manual_v2271'});
      const dayIds=[...keepIds,...visited.map(r=>String(r.id))];if(dayIds.length)await updateRows(dayIds,{approved:true,review_status:'approved',approved_by:currentProfile?.name||null,approved_at:new Date().toISOString()});
      await approveWorkflow(state.manager,state.date.slice(0,7));await reloadRoutes();renderCurrentDay();resetEditor();
      alert('Готово. День сразу утверждён и отправлен менеджеру.\n\n'+state.manager+' · '+state.date+'\n'+(office?'Офисный день 09:00–18:00':'Всего ТТ: '+totalSelected+' · клиентских: '+selected.length+' · сетевых: '+selectedNetworks.length));
    }catch(e){alert('Не удалось сохранить маршрут. Посещённые данные не удалялись.\n\n'+(e.message||e));}
    finally{btn.disabled=false;btn.textContent='Сохранить и сразу отправить менеджеру';}
  }

  function lightweightBossRender(){
    installBossUi();hideOldHeavyBlocks();
    const old=document.getElementById('rb-content');if(old)old.innerHTML='';
    renderCurrentDay();
  }

  function stripManagerEditing(){
    const page=document.getElementById('page-my-routes');if(!page)return;
    page.querySelectorAll('.route-stop-delete,button').forEach(b=>{const t=String(b.textContent||'').trim();if(b.classList.contains('route-stop-delete')||t==='+ точка'||t.includes('Комментарий руководителю')||t.includes('Отправить руководителю'))b.style.display='none';});
    const wrap=document.getElementById('route-manager-submit-wrap');if(wrap)wrap.innerHTML='<div class="card" style="background:var(--gb);border-color:var(--g)"><b>Маршрут утверждает руководитель.</b><div style="font-size:12px;color:var(--sub);margin-top:4px">Для изменения позвоните руководителю.</div></div>';
  }

  // Отключаем тяжёлые автоматические проверки и генерацию старых версий.
  window.v224ShowReadiness=function(){};
  window.v222ShowReadiness=function(){};
  window.generateNextMonthRoute=function(){alert('Автоматическое формирование отключено. Используйте ручной блок руководителя.');};
  window.approveAllRoutes=function(){alert('Каждый сохранённый руководителем день утверждается сразу.');};
  window.openNewBossRouteDayEditor=function(){installBossUi();document.getElementById('mrl-load')?.click();};
  window.openBossRouteDayEditor=function(date,manager){installBossUi();if(MANAGERS.includes(manager))document.getElementById('mrl-manager').value=manager;if(date)document.getElementById('mrl-date').value=date;document.getElementById('mrl-load')?.click();};

  const previousBossRender=window.renderRoutesBoss;
  window.renderRoutesBoss=function(){return lightweightBossRender();};
  const previousMyRender=window.renderMyRoutes;
  window.renderMyRoutes=function(){
    const saved=allRoutePlans,my=currentProfile?.name,ym=localStorage.getItem('crm_route_month_manager')||todayM().slice(0,7);
    allRoutePlans=(saved||[]).filter(r=>r.manager_name===my&&String(r.visit_date||'').startsWith(ym)&&(approvedRow(r)||isVisited(r)));
    try{return previousMyRender?.();}finally{allRoutePlans=saved;setTimeout(stripManagerEditing,0);}
  };
  const previousToday=window.loadTodayToRoute;
  if(typeof previousToday==='function')window.loadTodayToRoute=function(date){const saved=allRoutePlans,my=currentProfile?.name;allRoutePlans=(saved||[]).filter(r=>r.manager_name===my&&r.visit_date===date&&(approvedRow(r)||isVisited(r)));try{return previousToday(date);}finally{allRoutePlans=saved;}};
  window.addRouteStop=function(){alert('Маршрут изменяет только руководитель.');};
  window.removeRouteStop=function(){alert('Маршрут изменяет только руководитель.');};

  async function managerRefresh(){
    if(currentProfile?.role==='boss'||document.visibilityState!=='visible'||!document.getElementById('page-my-routes')?.classList.contains('active'))return;
    try{allRoutePlans=await loadAllRows('route_plans');window.renderMyRoutes?.();}catch(e){console.warn('route refresh',e);}
  }
  function startManagerUpdates(){
    if(currentProfile?.role==='boss'||state.liveChannel)return;
    try{let timer=null;state.liveChannel=db.channel('route-plans-v2252-manager').on('postgres_changes',{event:'*',schema:'public',table:'route_plans'},()=>{clearTimeout(timer);timer=setTimeout(managerRefresh,700);}).subscribe();}catch(e){console.warn('Realtime unavailable',e);}
    setInterval(managerRefresh,30000);
  }

  const previousGo=window.goPage;
  window.goPage=function(page,title){const r=previousGo(page,title);if(page==='my-routes')crmSchedulePageHook('my-routes',()=>{stripManagerEditing();startManagerUpdates();},35);return r;};
  const previousLoad=window.loadData;
  if(typeof previousLoad==='function')window.loadData=async function(){const r=await previousLoad();state.plansCache.clear();state.planMapCache.clear();state.networkLoaded=false;state.networkPoints=[];clearIndexes();if(document.getElementById('page-routes-boss')?.classList.contains('active'))lightweightBossRender();return r;};
  window.addEventListener('resanta-network-points-updated',async()=>{state.networkLoaded=false;state.networkPoints=[];await loadNetworkPoints();if(document.getElementById('mrl-editor')?.style.display!=='none'){renderNetworkPoints();renderSummary();}});

  setTimeout(()=>{if(document.getElementById('page-routes-boss')?.classList.contains('active'))lightweightBossRender();startManagerUpdates();},0);
  window.RESANTA_V2252=Object.freeze({version:VERSION,lightweightBossPlanner:true,lazyClientLoad:true,cachedMonthIndex:true,noAutomaticReadiness:true,bossDirectApproval:true,managerReadOnly:true,excludeWorkingUnder15Sku:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 19 ===== */
// v22.5.3: однократная очистка восстановленного браузером текста поиска.
window.addEventListener('pageshow',function(){
  setTimeout(function(){
    if(typeof clearRestoredMainSearches==='function')clearRestoredMainSearches();
    const active=document.querySelector('.page.active')?.id||'';
    if(active==='page-clients'&&typeof renderClients==='function')renderClients();
    if(active==='page-routes-boss'&&typeof renderRoutesBoss==='function')renderRoutesBoss();
  },0);
});

/* ===== ORIGINAL INLINE SCRIPT 20 ===== */
// RESANTA CRM v22.5.4 · КОНТРОЛЬ РУЧНЫХ МАРШРУТОВ И ФАКТИЧЕСКИХ ПОСЕЩЕНИЙ ДЛЯ РУКОВОДИТЕЛЯ
(function(){
  'use strict';
  const VERSION='22.5.4';
  const MANAGERS=['Руднев','Ачинович','Шкуран'];
  let liveChannel=null, refreshTimer=null, refreshing=false;

  const profile=()=>typeof currentProfile!=='undefined'?currentProfile:window.currentProfile;
  const database=()=>typeof db!=='undefined'?db:window.db;
  const today=()=>String((typeof TODAY!=='undefined'?TODAY:window.TODAY)||new Date().toISOString().slice(0,10)).slice(0,10);
  const routes=()=>typeof allRoutePlans!=='undefined'?(allRoutePlans||[]):(window.allRoutePlans||[]);
  const visits=()=>typeof allVisits!=='undefined'?(allVisits||[]):(window.allVisits||[]);
  const setRoutes=value=>{if(typeof allRoutePlans!=='undefined')allRoutePlans=value;else window.allRoutePlans=value;};
  const setVisits=value=>{if(typeof allVisits!=='undefined')allVisits=value;else window.allVisits=value;};
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const routeDate=()=>String(document.getElementById('mrl-date')?.value||today()).slice(0,10);
  const selectedManager=()=>String(document.getElementById('mrl-manager')?.value||'Руднев');
  const isActiveRoute=r=>r&&!r.removed;
  const vDate=v=>typeof visitDate==='function'?visitDate(v):String(v?.date||v?.created_at||'').slice(0,10);
  const vManager=v=>typeof visitManagerName==='function'?visitManagerName(v):String(v?.manager_name||'');
  const isVisitedRow=r=>r?.visited===true||String(r?.visited||'').toLowerCase()==='true'||!!r?.linked_visit_id;
  const compact=s=>String(s||'').replace(/\s+/g,' ').trim();

  function ensureStyle(){
    if(document.getElementById('boss-day-control-v2254-style'))return;
    const style=document.createElement('style');
    style.id='boss-day-control-v2254-style';
    style.textContent=`
      #boss-day-control-v2254{margin-top:12px;background:#fff;border:1px solid #C4B5FD;border-radius:12px;padding:12px}
      .bdc-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
      .bdc-actions{display:flex;gap:8px;flex-wrap:wrap}.bdc-actions button{font-size:12px}
      .bdc-summary{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:8px;margin-top:10px}
      .bdc-kpi{border:1px solid var(--border);border-radius:10px;padding:9px;background:#F8FAFC}
      .bdc-manager{border:1px solid var(--border);border-radius:10px;margin-top:10px;overflow:hidden;background:#fff}
      .bdc-manager summary{cursor:pointer;padding:10px 12px;font-weight:700;background:#F8FAFC;list-style:none}
      .bdc-manager summary::-webkit-details-marker{display:none}
      .bdc-route-row{display:grid;grid-template-columns:34px minmax(220px,1.4fr) minmax(180px,1fr) minmax(180px,1fr);gap:8px;align-items:start;padding:9px 10px;border-top:1px solid var(--border);font-size:12px}
      .bdc-num{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--ab);color:var(--at);font-weight:700}
      .bdc-visited{color:var(--g);font-weight:700}.bdc-missed{color:var(--r);font-weight:700}.bdc-planned{color:var(--a);font-weight:700}
      .bdc-muted{color:var(--sub);font-size:11px;margin-top:2px}.bdc-empty{padding:12px;color:var(--sub);font-size:12px}
      @media(max-width:900px){.bdc-summary{grid-template-columns:1fr}.bdc-route-row{grid-template-columns:32px 1fr}.bdc-route-row>div:nth-child(3),.bdc-route-row>div:nth-child(4){grid-column:2}}
    `;
    document.head.appendChild(style);
  }

  function allDayVisits(date){return visits().filter(v=>vDate(v)===date);}

  function linkedVisitForRow(row,dayVisits){
    const rid=String(row?.id||''),linkedId=String(row?.linked_visit_id||'');
    let found=dayVisits.find(v=>(rid&&String(v?.route_plan_id||'')===rid)||(linkedId&&String(v?.id||'')===linkedId));
    if(found)return found;
    const manager=String(row?.manager_name||'');
    const candidates=dayVisits.filter(v=>!manager||!vManager(v)||vManager(v)===manager);
    if(typeof routeClientMatchesVisit==='function'){
      found=candidates.find(v=>routeClientMatchesVisit(row,v));
      if(found)return found;
    }
    const linkedClients=Array.isArray(row?.linked_client_ids)?row.linked_client_ids.map(String):[];
    if(row?.client_id)linkedClients.push(String(row.client_id));
    if(linkedClients.length){
      found=candidates.find(v=>v?.client_id&&linkedClients.includes(String(v.client_id)));
      if(found)return found;
    }
    return null;
  }

  function visitTime(v){
    const raw=String(v?.created_at||v?.updated_at||'');
    if(!raw)return '';
    const d=new Date(raw);
    return Number.isNaN(d.getTime())?'':d.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
  }

  function statusFor(row,visit,date){
    if(row?.is_office_day)return {cls:'bdc-planned',label:'🏢 Офисный день 09:00–18:00',detail:''};
    if(visit){
      const detail=[visitTime(visit),compact(visit.result),compact(visit.text)].filter(Boolean).join(' · ');
      return {cls:'bdc-visited',label:'✅ Посещено',detail};
    }
    if(isVisitedRow(row))return {cls:'bdc-visited',label:'✅ Посещено',detail:'Визит связан с точкой маршрута'};
    if(date<today())return {cls:'bdc-missed',label:'⚠️ Не посещено',detail:'Дата маршрута уже прошла'};
    if(date===today())return {cls:'bdc-planned',label:'🕒 По плану сегодня',detail:'После сохранения визита статус обновится'};
    return {cls:'bdc-planned',label:'📅 Запланировано',detail:'Маршрут утверждён руководителем'};
  }

  function managerBlock(manager,date,managerRows,dayVisits){
    const ordered=managerRows.slice().sort((a,b)=>(Number(a.sort_order)||999)-(Number(b.sort_order)||999)||String(a.city||'').localeCompare(String(b.city||''),'ru'));
    const matched=ordered.map(r=>({row:r,visit:linkedVisitForRow(r,dayVisits)}));
    const visitedCount=matched.filter(x=>x.visit||isVisitedRow(x.row)).length;
    const cities=[...new Set(ordered.map(r=>String(r.city||'').trim()).filter(Boolean))];
    const open=manager===selectedManager()?' open':'';
    const body=ordered.length?matched.map((x,i)=>{
      const r=x.row,s=statusFor(r,x.visit,date);
      const title=r.is_office_day?'Офисный день':(r.client_name||'Торговая точка');
      const place=[r.city,r.address].filter(Boolean).join(', ')||'Адрес не указан';
      const approved=r.approved===true||String(r.review_status||'')==='approved';
      return `<div class="bdc-route-row">
        <div class="bdc-num">${r.is_office_day?'О':i+1}</div>
        <div><b>${esc(title)}</b><div class="bdc-muted">${esc(place)}</div></div>
        <div><span class="${s.cls}">${esc(s.label)}</span><div class="bdc-muted">${esc(s.detail)}</div></div>
        <div><div class="bdc-muted">${approved?'✅ Утверждено руководителем':'🟡 Черновик'}</div>${r.reason?`<div class="bdc-muted">${esc(r.reason)}</div>`:''}</div>
      </div>`;
    }).join(''):'<div class="bdc-empty">На эту дату маршрут не задан.</div>';
    return `<details class="bdc-manager"${open}><summary>👤 ${esc(manager)} — ${ordered.length} точек · ${visitedCount} посещено${cities.length?' · '+esc(cities.join(', ')):''}</summary>${body}</details>`;
  }

  function renderBossDayControl(){
    if(profile()?.role!=='boss')return;
    const host=document.getElementById('manual-route-lite');if(!host)return;
    ensureStyle();
    let root=document.getElementById('boss-day-control-v2254');
    if(!root){root=document.createElement('div');root.id='boss-day-control-v2254';const current=document.getElementById('mrl-current');(current||host).insertAdjacentElement('afterend',root);}
    const date=routeDate();
    const dayRoutes=routes().filter(r=>isActiveRoute(r)&&String(r.visit_date||'')===date&&MANAGERS.includes(String(r.manager_name||'')));
    const dayVisits=allDayVisits(date);
    const visitedCount=dayRoutes.filter(r=>linkedVisitForRow(r,dayVisits)||isVisitedRow(r)).length;
    const missed=dayRoutes.filter(r=>!r.is_office_day&&!linkedVisitForRow(r,dayVisits)&&!isVisitedRow(r)&&date<today()).length;
    root.innerHTML=`
      <div class="bdc-head"><div><b style="font-size:16px">👁 Контроль маршрутов и посещений на ${esc(date)}</b><div class="bdc-muted">Руководитель видит все утверждённые дни. Фактическое посещение появится после сохранения визита менеджером.</div></div>
      <div class="bdc-actions"><button class="btn-secondary" id="bdc-refresh">↻ Обновить</button><button class="btn-secondary" id="bdc-open-visits">📝 Открыть все визиты</button></div></div>
      <div class="bdc-summary"><div class="bdc-kpi"><b>${dayRoutes.length}</b><div class="bdc-muted">точек запланировано</div></div><div class="bdc-kpi"><b style="color:var(--g)">${visitedCount}</b><div class="bdc-muted">фактически посещено</div></div><div class="bdc-kpi"><b style="color:${missed?'var(--r)':'var(--sub)'}">${missed}</b><div class="bdc-muted">просрочено без визита</div></div></div>
      ${MANAGERS.map(m=>managerBlock(m,date,dayRoutes.filter(r=>r.manager_name===m),dayVisits)).join('')}
    `;
    document.getElementById('bdc-refresh')?.addEventListener('click',()=>refreshSelectedDate(true));
    document.getElementById('bdc-open-visits')?.addEventListener('click',()=>typeof goPage==='function'&&goPage('visits','История визитов'));
    const note=document.getElementById('route-month-note-boss');
    if(note)note.innerHTML='<b>v22.5.4.</b> Ручной маршрут руководителя и контроль фактических посещений. ИИ-задачи используют текущий утверждённый маршрут.';
  }

  function mergeDayData(date,dayRoutes,dayVisits){
    setRoutes(routes().filter(r=>String(r.visit_date||'')!==date).concat(dayRoutes||[]));
    setVisits(visits().filter(v=>vDate(v)!==date).concat(dayVisits||[]));
  }

  let lastRefreshDate='',lastRefreshAt=0;
  async function refreshSelectedDate(force=false){
    if(refreshing||profile()?.role!=='boss')return;
    const databaseClient=database();
    if(!databaseClient)return;
    const date=routeDate(),btn=document.getElementById('bdc-refresh');
    if(!force&&lastRefreshDate===date&&Date.now()-lastRefreshAt<30000){renderBossDayControl();return;}
    refreshing=true;if(btn){btn.disabled=true;btn.textContent='Обновляю…';}
    try{
      const [rp,vp]=await Promise.all([
        databaseClient.from('route_plans').select('*').eq('visit_date',date),
        databaseClient.from('visits').select('*').eq('date',date)
      ]);
      if(rp.error)throw rp.error;if(vp.error)throw vp.error;
      mergeDayData(date,rp.data||[],vp.data||[]);lastRefreshDate=date;lastRefreshAt=Date.now();
      renderBossDayControl();
    }catch(e){alert('Не удалось обновить выбранный день: '+(e.message||e));}
    finally{refreshing=false;const liveBtn=document.getElementById('bdc-refresh');if(liveBtn){liveBtn.disabled=false;liveBtn.textContent='↻ Обновить';}}
  }

  function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(document.getElementById('page-routes-boss')?.classList.contains('active'))refreshSelectedDate();},600);}

  function startRealtime(){
    const databaseClient=database();
    if(liveChannel||!databaseClient||profile()?.role!=='boss')return;
    try{
      liveChannel=databaseClient.channel('boss-route-visits-v2254')
        .on('postgres_changes',{event:'*',schema:'public',table:'route_plans'},payload=>{const d=String(payload?.new?.visit_date||payload?.old?.visit_date||'');if(d===routeDate())scheduleRefresh();})
        .on('postgres_changes',{event:'*',schema:'public',table:'visits'},payload=>{const d=String(payload?.new?.date||payload?.old?.date||'');if(d===routeDate())scheduleRefresh();})
        .subscribe();
    }catch(e){console.warn('boss day realtime unavailable',e);}
  }

  function install(){
    if(profile()?.role!=='boss')return;
    const panel=document.getElementById('manual-route-lite');if(!panel)return;
    renderBossDayControl();startRealtime();
    const manager=document.getElementById('mrl-manager'),date=document.getElementById('mrl-date'),save=document.getElementById('mrl-save');
    if(manager&&!manager.dataset.v2254){manager.dataset.v2254='1';manager.addEventListener('change',()=>setTimeout(renderBossDayControl,0));}
    if(date&&!date.dataset.v2254){date.dataset.v2254='1';date.addEventListener('change',()=>setTimeout(()=>refreshSelectedDate(true),0));}
    if(save&&!save.dataset.v2254){save.dataset.v2254='1';save.addEventListener('click',()=>setTimeout(()=>refreshSelectedDate(true),1800));}
  }

  const prevBossRender=window.renderRoutesBoss;
  window.renderRoutesBoss=function(){const result=prevBossRender?.();setTimeout(install,0);return result;};
  const prevGo=window.goPage;
  window.goPage=function(page,title){const result=prevGo?.(page,title);if(page==='routes-boss')crmSchedulePageHook('routes-boss',()=>{install();refreshSelectedDate(false);},45);return result;};
  const prevLoad=window.loadData;
  if(typeof prevLoad==='function')window.loadData=async function(){const result=await prevLoad();setTimeout(install,0);return result;};
  window.addEventListener('pageshow',()=>setTimeout(install,0));
  setTimeout(install,0);
  window.RESANTA_V2254=Object.freeze({version:VERSION,bossSeesAllManagersForDate:true,routeVisitStatus:true,realtimeBossControl:true,aiRouteTasksUntouched:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 21 ===== */
(function(){
  const V='22.6.2';
  const STORAGE_KEYS=[
    'crm_clients_search_v2253','crm_clients_search_v2252',
    'crm_clients_search_v2260_manual','client-search','crm_client_search'
  ];
  let generation=0;
  window.__crmClientSearchQuery='';

  function purgeStoredClientSearch(){
    try{
      STORAGE_KEYS.forEach(k=>{localStorage.removeItem(k);sessionStorage.removeItem(k);});
    }catch(_){ }
    try{
      if(history.state&&typeof history.state==='object'){
        const next={...history.state};
        STORAGE_KEYS.forEach(k=>delete next[k]);
        history.replaceState(next,document.title,location.href);
      }
    }catch(_){ }
  }

  function clientsPageActive(){
    return document.getElementById('page-clients')?.classList.contains('active');
  }

  function makeCleanInput(){
    const old=document.getElementById('client-search');
    if(!old)return null;
    const fresh=document.createElement('input');
    fresh.id='client-search';
    fresh.className=old.className||'search-input';
    fresh.type='text';
    fresh.placeholder=old.placeholder||'Поиск по названию, коду, региону...';
    fresh.value='';
    fresh.defaultValue='';
    fresh.name='crm_client_lookup_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    fresh.autocomplete='off';
    fresh.setAttribute('autocorrect','off');
    fresh.setAttribute('autocapitalize','off');
    fresh.setAttribute('spellcheck','false');
    fresh.setAttribute('data-lpignore','true');
    fresh.setAttribute('data-1p-ignore','true');
    fresh.setAttribute('aria-autocomplete','none');
    // Пока пользователь сам не нажал на поле, браузер не сможет восстановить
    // в нём старый поисковый запрос.
    fresh.readOnly=true;
    fresh.dataset.crmActivated='0';

    function activate(ev){
      if(ev && ev.isTrusted===false)return;
      fresh.dataset.crmActivated='1';
      fresh.readOnly=false;
      fresh.value='';
      fresh.defaultValue='';
      window.__crmClientSearchQuery='';
    }
    fresh.addEventListener('pointerdown',activate,{once:true});
    fresh.addEventListener('keydown',ev=>{
      if(fresh.dataset.crmActivated!=='1')activate(ev);
    });
    fresh.addEventListener('input',ev=>{
      if(fresh.dataset.crmActivated!=='1'){
        fresh.value='';
        fresh.defaultValue='';
        window.__crmClientSearchQuery='';
        return;
      }
      window.__crmClientSearchQuery=String(fresh.value||'');
      if(typeof renderClients==='function')renderClients();
    });
    fresh.addEventListener('search',()=>{
      window.__crmClientSearchQuery=String(fresh.value||'');
      if(typeof renderClients==='function')renderClients();
    });
    old.replaceWith(fresh);
    return fresh;
  }

  function hardResetClientSearch(){
    purgeStoredClientSearch();
    window.__crmClientSearchQuery='';
    const myGeneration=++generation;
    let input=makeCleanInput();
    if(typeof renderClients==='function')renderClients();
    // Яндекс.Браузер/Chrome иногда пытается восстановить поле через несколько
    // секунд после загрузки. До первого реального действия пользователя
    // принудительно держим поле пустым.
    let ticks=0;
    const timer=setInterval(()=>{
      if(myGeneration!==generation){clearInterval(timer);return;}
      input=document.getElementById('client-search');
      if(!input){clearInterval(timer);return;}
      if(input.dataset.crmActivated==='1'){
        clearInterval(timer);
        return;
      }
      if(input.value||window.__crmClientSearchQuery){
        input.value='';
        input.defaultValue='';
        window.__crmClientSearchQuery='';
        if(typeof renderClients==='function')renderClients();
      }
      ticks++;
      if(ticks>=120)clearInterval(timer); // 60 секунд после открытия раздела
    },500);
  }

  function resetIfClientsActive(){
    purgeStoredClientSearch();
    if(clientsPageActive())hardResetClientSearch();
  }

  const previousGoPage=window.goPage;
  window.goPage=function(page,title){
    const result=previousGoPage.apply(this,arguments);
    if(page==='clients')crmSchedulePageHook('clients',hardResetClientSearch,5);
    return result;
  };

  const previousStatusFilter=window.setStatusFilter;
  window.setStatusFilter=function(status,button){
    if(status==='new1c'){
      window.__crmClientSearchQuery='';
      const input=document.getElementById('client-search');
      if(input){input.value='';input.defaultValue='';}
      window.regionFilter='all';
      window.managerFilter=currentProfile?.role==='boss'?'all':'mine';
    }
    return previousStatusFilter.apply(this,arguments);
  };

  window.addEventListener('pageshow',()=>setTimeout(resetIfClientsActive,0));
  window.addEventListener('load',()=>setTimeout(resetIfClientsActive,0));
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'&&clientsPageActive())setTimeout(hardResetClientSearch,0);
  });

  purgeStoredClientSearch();
  if(clientsPageActive())setTimeout(hardResetClientSearch,0);
  window.RESANTA_V2262=Object.freeze({
    version:V,
    isolatedClientSearchState:true,
    browserRestoreBlocked:true,
    cacheVersionUpdated:true
  });
})();

/* ===== ORIGINAL INLINE SCRIPT 22 ===== */
// RESANTA CRM v22.6.3 · поступления по месяцу платежа, единый GPS/визит/задачи,
// общий KPI-лидерборд для трёх полевых менеджеров.
(function(){
  'use strict';
  const VERSION='22.6.3';
  const FIELD_MANAGERS=['Руднев','Ачинович','Шкуран'];
  const norm=v=>String(v??'').trim().toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,' ').trim().replace(/\s+/g,' ');
  const escHtml=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const num=v=>Number(v)||0;
  const dateOnly=v=>String(v||'').slice(0,10);
  const monthKey=v=>{
    const raw=String(v||'');
    const iso=raw.match(/^(\d{4})-(\d{2})/);if(iso)return iso[1]+'-'+iso[2];
    const ru=raw.match(/^(\d{2})[.\/]?(\d{2})[.\/]?(\d{4})/);if(ru)return ru[3]+'-'+ru[2];
    const d=new Date(raw);return Number.isNaN(d.getTime())?'':d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
  };
  const monthLabelRu=m=>{const a=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];const x=String(m||'').match(/^(\d{4})-(\d{2})$/);return x?(a[Number(x[2])-1]+' '+x[1]):m;};

  // ------------------------------------------------------------------
  // 1. Поступления: основной фильтр — фактический месяц document_at.
  // ------------------------------------------------------------------
  function paymentMonths(){
    return [...new Set((allCashReceipts||[]).map(r=>monthKey(r.document_at)).filter(Boolean))].sort().reverse();
  }
  const baseV20Init=window.v20InitFilters;
  window.v20InitFilters=function(){
    if(typeof baseV20Init==='function')baseV20Init();
    const monthSel=document.getElementById('payments-month');
    if(monthSel){
      const old=monthSel.value;
      const months=paymentMonths();
      monthSel.innerHTML='<option value="all">Все месяцы</option>'+months.map(m=>'<option value="'+m+'">'+escHtml(monthLabelRu(m))+'</option>').join('');
      monthSel.value=(old&&(['all',...months].includes(old)))?old:(months[0]||'all');
    }
    const reportSel=document.getElementById('payments-period');
    if(reportSel){
      const old=reportSel.value||'all';
      const periods=typeof v20ReceiptPeriods==='function'?v20ReceiptPeriods():[];
      reportSel.innerHTML='<option value="all">Все отчёты 1С</option>'+periods.map(p=>'<option value="'+escHtml(p.key)+'">'+escHtml(p.start)+' — '+escHtml(p.end)+'</option>').join('');
      reportSel.value=(old==='all'||periods.some(p=>p.key===old))?old:'all';
    }
  };
  window.renderPayments=function(){
    window.v20InitFilters();
    const fresh=document.getElementById('payments-freshness');if(fresh&&typeof v20PaymentsFreshness==='function')fresh.innerHTML=v20PaymentsFreshness();
    const payMonth=document.getElementById('payments-month')?.value||'all';
    const reportPeriod=document.getElementById('payments-period')?.value||'all';
    const mgr=document.getElementById('payments-manager')?.value||'all';
    const q=typeof abcNorm==='function'?abcNorm(document.getElementById('payments-search')?.value||''):norm(document.getElementById('payments-search')?.value||'');
    let rows=(allCashReceipts||[]).filter(r=>(payMonth==='all'||monthKey(r.document_at)===payMonth)
      &&(reportPeriod==='all'||(dateOnly(r.period_start)+'|'+dateOnly(r.period_end))===reportPeriod)
      &&(mgr==='all'||r.manager_name===mgr)
      &&(!q||(typeof abcNorm==='function'?abcNorm((r.client_name||'')+' '+(r.document_number||'')+' '+(r.manager_name||'')):norm((r.client_name||'')+' '+(r.document_number||'')+' '+(r.manager_name||''))).includes(q)));
    rows.sort((a,b)=>String(b.document_at||'').localeCompare(String(a.document_at||'')));
    const total=rows.reduce((s,r)=>s+num(r.amount),0),clients=new Set(rows.map(r=>r.client_id||(typeof abcNorm==='function'?abcNorm(r.client_name):norm(r.client_name)))),docs=new Set(rows.map(r=>(r.manager_name||'')+'|'+(r.client_name||'')+'|'+(r.document_number||'')+'|'+(r.document_at||''))),latest=rows[0]?.document_at;
    const kpi=document.getElementById('payments-kpi');
    if(kpi)kpi.innerHTML='<div class="kpi"><div class="kpi-label">Поступило</div><div class="kpi-value ok">'+fmt(total)+'</div><div class="kpi-sub">BYN</div></div><div class="kpi"><div class="kpi-label">Клиентов оплатили</div><div class="kpi-value">'+clients.size+'</div></div><div class="kpi"><div class="kpi-label">Документов</div><div class="kpi-value">'+docs.size+'</div></div><div class="kpi"><div class="kpi-label">Последний платёж</div><div class="kpi-value" style="font-size:16px">'+v20ReceiptDate(latest)+'</div></div>';
    const byMgr=new Map();rows.forEach(r=>{const m=r.manager_name||'Без менеджера';if(!byMgr.has(m))byMgr.set(m,[]);byMgr.get(m).push(r);});
    const html=[...byMgr.entries()].sort((a,b)=>a[0].localeCompare(b[0],'ru')).map(([manager,mrows])=>{const byClient=new Map();mrows.forEach(r=>{const k=r.client_id||norm(r.client_name);if(!byClient.has(k))byClient.set(k,{name:r.client_name,id:r.client_id,rows:[]});byClient.get(k).rows.push(r);});const mtotal=mrows.reduce((s,r)=>s+num(r.amount),0);return '<div class="card v20-payment-manager"><div class="v20-fall-head"><div class="card-title" style="margin:0">👤 '+escHtml(manager)+'</div><div style="font-size:18px;font-weight:800;color:var(--g)">'+fmt(mtotal)+' BYN</div></div>'+[...byClient.values()].sort((a,b)=>b.rows.reduce((s,r)=>s+num(r.amount),0)-a.rows.reduce((s,r)=>s+num(r.amount),0)).map(c=>{const ctotal=c.rows.reduce((s,r)=>s+num(r.amount),0);return '<details class="v20-payment-client"><summary><span><b>'+escHtml(c.name)+'</b><span style="font-size:10px;color:var(--sub);margin-left:6px">'+c.rows.length+' док.</span></span><span style="font-weight:800;color:var(--g)">'+fmt(ctotal)+' BYN</span></summary><div class="v20-payment-docs"><table class="v20-mini-table"><thead><tr><th>Дата платежа</th><th>Документ</th><th>Сумма</th></tr></thead><tbody>'+c.rows.map(r=>'<tr><td>'+v20ReceiptDate(r.document_at)+'</td><td>'+escHtml(r.document_number)+'<div style="font-size:10px;color:var(--sub)">'+escHtml(r.document_type||'Поступление')+'</div></td><td style="font-weight:700">'+fmt(r.amount)+' BYN</td></tr>').join('')+'</tbody></table>'+(c.id?'<button class="btn-secondary" style="margin-top:8px" onclick="openClient(\''+c.id+'\')">Открыть клиента</button>':'')+'</div></details>';}).join('')+'</div>';}).join('');
    const list=document.getElementById('payments-list');if(list)list.innerHTML=html||'<div class="card" style="text-align:center;color:var(--sub);padding:24px">За выбранный месяц платежей менеджеров нет.</div>';
  };

  // ------------------------------------------------------------------
  // 2. Единая идентификация маршрута по route_plan_id / physical point /
  // linked_client_ids / client_id / aliases.
  // ------------------------------------------------------------------
  window.routeClientMatchesVisit=function(r,v){
    if(!r||!v)return false;
    const rid=String(r.id||''),vrid=String(v.route_plan_id||'');
    if(rid&&vrid&&rid===vrid)return true;
    if(r.linked_visit_id&&v.id&&String(r.linked_visit_id)===String(v.id))return true;
    const visitClientId=String(v.client_id||'');
    const linked=Array.isArray(r.linked_client_ids)?r.linked_client_ids.map(String):[];
    if(r.client_id)linked.push(String(r.client_id));
    if(visitClientId&&linked.includes(visitClientId))return true;
    const rc=r.client_id?allClients.find(c=>String(c.id)===String(r.client_id)):matchClientByName(r.client_name||'');
    const vc=v.client_id?allClients.find(c=>String(c.id)===String(v.client_id)):null;
    if(rc&&vc&&String(rc.id)===String(vc.id))return true;
    if(vc&&linked.includes(String(vc.id)))return true;
    const rv=new Set((rc&&typeof clientNameVariants==='function'?clientNameVariants(rc):[r.client_name,...(Array.isArray(r.linked_client_names)?r.linked_client_names:[])]).map(x=>typeof canonicalSalesClientName==='function'?canonicalSalesClientName(x):norm(x)).filter(Boolean));
    const vv=new Set((vc&&typeof clientNameVariants==='function'?clientNameVariants(vc):[v.client_name]).map(x=>typeof canonicalSalesClientName==='function'?canonicalSalesClientName(x):norm(x)).filter(Boolean));
    for(const k of rv)if(vv.has(k))return true;
    return false;
  };
  function visitForPlan(r,dayVisits){
    return (dayVisits||[]).find(v=>!v.is_duplicate&&((r.id&&String(v.route_plan_id||'')===String(r.id))||(r.linked_visit_id&&String(v.id||'')===String(r.linked_visit_id))||(visitDate(v)===String(r.visit_date||'').slice(0,10)&&managerLooseMatch(r.manager_name,visitManagerName(v))&&routeClientMatchesVisit(r,v))))||null;
  }
  function routeClientIds(r){const ids=[];if(r?.client_id)ids.push(String(r.client_id));if(Array.isArray(r?.linked_client_ids))r.linked_client_ids.forEach(x=>ids.push(String(x)));const c=clientForPlan(r);if(c)ids.push(String(c.id));return [...new Set(ids)];}
  function clientForPlan(r){
    if(!r)return null;
    const ids=[];if(r.client_id)ids.push(String(r.client_id));if(Array.isArray(r.linked_client_ids))r.linked_client_ids.forEach(x=>ids.push(String(x)));
    for(const id of ids){const c=(allClients||[]).find(x=>String(x.id)===id);if(c)return c;}
    const names=[r.client_name,...(Array.isArray(r.linked_client_names)?r.linked_client_names:[])].filter(Boolean);
    for(const name of names){const c=matchClientByName(name);if(c)return c;}
    return null;
  }
  function planPointCoords(r){
    const lat=Number(r?.route_lat),lng=Number(r?.route_lng);if(Number.isFinite(lat)&&Number.isFinite(lng))return {lat,lng};
    const gf=clientGeofence(clientForPlan(r));return gf&&Number.isFinite(Number(gf.lat))&&Number.isFinite(Number(gf.lng))?{lat:Number(gf.lat),lng:Number(gf.lng)}:null;
  }
  function taskDoneDate(t){return dateOnly(t?.done_at||t?.updated_at||'');}
  function taskStatsForPlan(r,date){
    const ids=routeClientIds(r),names=[r?.client_name,...(Array.isArray(r?.linked_client_names)?r.linked_client_names:[])].filter(Boolean);
    const rows=(allTasks||[]).filter(t=>(t.client_id&&ids.includes(String(t.client_id)))||(!t.client_id&&names.some(n=>nameLooseMatch(t.client_name||'',n))));
    const done=rows.filter(t=>!!t.done&&taskDoneDate(t)===date).length;
    const open=rows.filter(t=>!t.done).length;
    return {done,open,total:done+open};
  }
  function visitTimeLabel(v){const raw=v?.created_at||v?.updated_at||'';if(!raw)return 'время не записано';try{return new Date(raw).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});}catch(_){return String(raw);}}

  const baseOpenGps=window.v19OpenGpsWorkday;
  window.v19OpenGpsWorkday=async function(id,silent){
    await baseOpenGps.apply(this,arguments);
    try{
      const w=(v19GpsControlRows||[]).find(x=>String(x.id)===String(id));if(!w)return;
      const date=String(w.work_date||'').slice(0,10);
      const plans=(allRoutePlans||[]).filter(r=>!r.removed&&String(r.visit_date||'').slice(0,10)===date&&managerLooseMatch(r.manager_name,w.manager_name));
      const visits=(allVisits||[]).filter(v=>!v.is_duplicate&&visitDate(v)===date&&managerLooseMatch(visitManagerName(v),w.manager_name));
      const {data:track}=await db.from('gps_track_points').select('lat,lng,accuracy,recorded_at,is_valid').eq('workday_id',id).order('recorded_at',{ascending:true});
      const usable=(track||[]).filter(p=>v206GpsBool(p.is_valid)&&Number(p.accuracy||0)<=150&&Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng)));
      const rows=plans.map((r,i)=>{
        const v=visitForPlan(r,visits),ts=taskStatsForPlan(r,date);
        let gpsNear=null;
        const c=clientForPlan(r);
        const gf=planPointCoords(r);
        if(gf&&usable.length){gpsNear=Math.min(...usable.map(p=>gpsDistance(gf.lat,gf.lng,Number(p.lat),Number(p.lng))));}
        const status=v?'<span class="ok"><b>✅ Визит сохранён</b> · '+escHtml(visitTimeLabel(v))+'</span>'
          :(Number.isFinite(gpsNear)&&gpsNear<=200?'<span class="warn"><b>📍 GPS был рядом ('+Math.round(gpsNear)+' м)</b>, но визит не сохранён</span>':'<span class="bad"><b>Не подтверждено</b></span>');
        const tasks=ts.total?('<span class="'+(ts.open?'warn':'ok')+'">задачи: '+ts.done+' выполнено · '+ts.open+' открыто</span>'):'<span style="color:var(--sub)">открытых задач нет</span>';
        return '<tr><td>'+(i+1)+'</td><td><b>'+escHtml(r.client_name||'Торговая точка')+'</b><div style="font-size:10px;color:var(--sub)">'+escHtml([r.city,r.address].filter(Boolean).join(', '))+'</div></td><td>'+status+'</td><td>'+tasks+'</td></tr>';
      }).join('');
      const detail=document.getElementById('gps-control-detail');
      if(detail)detail.insertAdjacentHTML('beforeend','<div class="gps-detail-row"><b>Посещения и задачи по точкам:</b><div style="overflow:auto;margin-top:7px"><table class="v20-mini-table" style="min-width:620px"><thead><tr><th>#</th><th>Точка</th><th>Факт</th><th>Задачи</th></tr></thead><tbody>'+ (rows||'<tr><td colspan="4">Маршрут на дату не задан</td></tr>') +'</tbody></table></div></div>');
      if(window.v19GpsMap&&window.L){
        // Плановые физические точки видны даже если у строки маршрута нет primary client_id.
        plans.forEach(r=>{const xy=planPointCoords(r);if(!xy)return;const v=visitForPlan(r,visits),ts=taskStatsForPlan(r,date),fill=v?'#16a34a':'#64748b';L.circleMarker([xy.lat,xy.lng],{radius:v?7:5,color:'#fff',weight:2,fillColor:fill,fillOpacity:.95}).addTo(v19GpsMap).bindPopup('<b>'+(v?'✅ Посещено':'📅 Плановая ТТ')+'</b><br>'+escHtml(r.client_name||'Торговая точка')+'<br>'+escHtml([r.city,r.address].filter(Boolean).join(', '))+'<br>Задачи: '+ts.done+' выполнено · '+ts.open+' открыто');});
        visits.forEach(v=>{const lat=Number(v.gps_lat),lng=Number(v.gps_lng);if(!Number.isFinite(lat)||!Number.isFinite(lng))return;const client=v.client_id?allClients.find(c=>String(c.id)===String(v.client_id)):null;L.circleMarker([lat,lng],{radius:9,color:'#fff',weight:3,fillColor:'#16a34a',fillOpacity:1}).addTo(v19GpsMap).bindPopup('<b>✅ Сохранённый визит</b><br>'+escHtml(client?.name||'Клиент')+'<br>'+escHtml(visitTimeLabel(v)));});
      }
    }catch(e){console.warn('Дополнительный контроль визитов не загрузился',e);}
  };

  // Менеджер видит тот же очищенный пробег, что и руководитель.
  let myGpsTimer=null,myGpsCache=null,myGpsCacheAt=0;
  async function loadMyGps(force){
    if(currentProfile?.role!=='manager')return null;
    if(!force&&myGpsCache&&Date.now()-myGpsCacheAt<45000)return myGpsCache;
    const {data,error}=await db.rpc('crm_my_gps_day_bundle',{p_date:TODAY});
    if(error){console.warn('Мой GPS-итог недоступен',error);return null;}
    const bundle=data||{},points=Array.isArray(bundle.points)?bundle.points:[],valid=points.filter(p=>v206GpsBool(p.is_valid)),segments=v206GpsSegments(valid),distance=segments.flat().length>1?v207GpsRouteDistance(segments):num(bundle.workday?.total_distance_m);
    const manager=currentProfile?.name||'',plans=(allRoutePlans||[]).filter(r=>!r.removed&&String(r.visit_date||'').slice(0,10)===TODAY&&managerLooseMatch(r.manager_name,manager)),visits=(allVisits||[]).filter(v=>!v.is_duplicate&&visitDate(v)===TODAY&&managerLooseMatch(visitManagerName(v),manager)),visited=plans.filter(r=>visitForPlan(r,visits)||routePlanVerified(r,visits,plans)).length;
    const tasksDone=(allTasks||[]).filter(t=>managerLooseMatch(taskManagerName(t),manager)&&t.done&&taskDoneDate(t)===TODAY).length;
    const serverPoints=points.filter(p=>v206GpsBool(p.is_valid)).length;
    myGpsCache={...bundle,distance,plans:plans.length,visited,tasksDone,serverPoints};myGpsCacheAt=Date.now();return myGpsCache;
  }
  function myGpsHtml(x){if(!x||!x.workday)return '<div style="font-size:12px;color:var(--sub);margin-top:8px">Сегодня рабочий GPS-день ещё не начат.</div>';return '<div style="display:grid;grid-template-columns:repeat(4,minmax(105px,1fr));gap:8px;margin-top:10px"><div class="kpi" style="padding:9px"><div class="kpi-label">Мой пробег сегодня</div><div class="kpi-value" style="font-size:20px">'+v19Km(x.distance)+'</div></div><div class="kpi" style="padding:9px"><div class="kpi-label">Посещено / план</div><div class="kpi-value" style="font-size:20px">'+x.visited+' / '+x.plans+'</div></div><div class="kpi" style="padding:9px"><div class="kpi-label">Задач выполнено</div><div class="kpi-value" style="font-size:20px">'+x.tasksDone+'</div></div><div class="kpi" style="padding:9px"><div class="kpi-label">GPS-точек принято</div><div class="kpi-value" style="font-size:20px">'+num(x.serverPoints)+'</div></div></div>';}
  async function enhanceMyWorkday(){const x=await loadMyGps(true);const root=document.getElementById('workday-manager-status');if(root){root.querySelector('#v2263-my-km')?.remove();root.insertAdjacentHTML('beforeend','<div id="v2263-my-km">'+myGpsHtml(x)+'</div>');}const card=document.getElementById('manager-workday-card');if(card&&x?.workday){let el=card.querySelector('#v2263-dash-km');if(!el){el=document.createElement('div');el.id='v2263-dash-km';card.appendChild(el);}el.innerHTML='<div style="font-size:12px;color:var(--sub);margin-top:8px">Сегодня: <b style="color:var(--text)">'+v19Km(x.distance)+'</b> · визитов '+x.visited+'/'+x.plans+' · задач выполнено '+x.tasksDone+'</div>';}}
  const baseRenderManagerWorkday=window.v19RenderManagerWorkday;
  window.v19RenderManagerWorkday=async function(){await baseRenderManagerWorkday.apply(this,arguments);await enhanceMyWorkday();};
  const baseRenderWorkdayCard=window.v19RenderWorkdayCard;
  window.v19RenderWorkdayCard=async function(){await baseRenderWorkdayCard.apply(this,arguments);await enhanceMyWorkday();};

  // ------------------------------------------------------------------
  // 3. Общий KPI-лидерборд: агрегаты из SECURITY DEFINER RPC, без доступа
  // менеджеров к чужим карточкам и деталям продаж.
  // ------------------------------------------------------------------
  function exposeKpiMenu(){if(!['boss','manager'].includes(currentProfile?.role||''))return;['nav-managers','bn-managers'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display='flex';});}
  function pct(f,p){return num(p)>0?Math.round(num(f)/num(p)*100):null;}
  function pctTag(x){return x==null?'<span class="tag tag-gray">план не задан</span>':'<span class="tag '+(x>=100?'tag-m':x>=70?'':'tag-r')+'">'+x+'%</span>';}
  function score(r){const vals=[pct(r.shipment,r.shipment_plan),pct(r.akb,r.akb_plan),pct(r.new_clients,r.new_clients_plan)].filter(x=>x!=null);return vals.length?Math.round(vals.reduce((s,x)=>s+x,0)/vals.length):0;}
  window.renderManagers=async function(){
    const month=(document.getElementById('manager-kpi-month')?.value||TODAY.slice(0,7)).slice(0,7),body=document.getElementById('managers-table');if(!body)return;
    body.innerHTML='<tr><td colspan="13" style="text-align:center;color:var(--sub)">Загружаю общий рейтинг…</td></tr>';
    const {data,error}=await db.rpc('crm_manager_kpi_leaderboard',{p_month:month});
    if(error){console.warn('KPI-лидерборд недоступен',error);body.innerHTML='<tr><td colspan="13" class="bad">Не удалось загрузить общий рейтинг: '+escHtml(error.message||error)+'</td></tr>';return;}
    const rows=(data||[]).filter(r=>FIELD_MANAGERS.some(n=>managerLooseMatch(r.manager_name,n))).map(r=>({...r,_score:score(r)})).sort((a,b)=>b._score-a._score||num(b.shipment)-num(a.shipment));
    let board=document.getElementById('manager-kpi-leaderboard-v2263');if(!board){board=document.createElement('div');board.id='manager-kpi-leaderboard-v2263';document.querySelector('#page-managers .card')?.insertAdjacentElement('beforebegin',board);}
    board.innerHTML='<div class="kpi-row" style="margin-bottom:12px">'+rows.map((r,i)=>'<div class="kpi" style="'+(managerLooseMatch(r.manager_name,currentProfile?.name)?'border:2px solid var(--a);':'')+'"><div class="kpi-label">'+(i===0?'🥇':i===1?'🥈':'🥉')+' '+escHtml(r.manager_name)+'</div><div class="kpi-value">'+r._score+'%</div><div class="kpi-sub">среднее выполнение 3 планов</div></div>').join('')+'</div>';
    const boss=currentProfile?.role==='boss';
    body.innerHTML=rows.map((r,i)=>'<tr style="'+(managerLooseMatch(r.manager_name,currentProfile?.name)?'background:var(--ab);':'')+'"><td><strong>'+ (i+1)+'. '+escHtml(r.manager_name)+'</strong></td><td>'+escHtml(r.region||'—')+'</td><td>'+num(r.visits)+'</td><td>'+num(r.tasks_open)+'</td><td>'+(num(r.overdue)?'<span class="tag tag-r">'+num(r.overdue)+'</span>':'<span class="tag tag-m">0</span>')+'</td><td>'+num(r.clients)+'</td><td>'+fmt(num(r.shipment_plan))+' / <b>'+fmt(num(r.shipment))+'</b> BYN</td><td>'+pctTag(pct(r.shipment,r.shipment_plan))+'</td><td>'+fmt(num(r.akb_plan))+' / <b>'+num(r.akb)+'</b></td><td>'+pctTag(pct(r.akb,r.akb_plan))+'</td><td>'+fmt(num(r.new_clients_plan))+' / <b>'+num(r.new_clients)+'</b></td><td>'+pctTag(pct(r.new_clients,r.new_clients_plan))+'</td><td>'+(boss?'<button class="btn-secondary" onclick="openManagerSales(\''+escHtml(r.manager_name)+'\')">Продажи</button>':'<span class="tag tag-gray">только рейтинг</span>')+'</td></tr>').join('')||'<tr><td colspan="13">Нет данных</td></tr>';
    const b=document.querySelector('#page-managers button[onclick="openManagerPlanEditor()"]');if(b)b.style.display=boss?'inline-flex':'none';
  };

  const baseStartApp=window.startApp;
  window.startApp=async function(){const out=await baseStartApp.apply(this,arguments);exposeKpiMenu();if(currentProfile?.role==='manager'){clearInterval(myGpsTimer);myGpsTimer=setInterval(()=>{myGpsCacheAt=0;enhanceMyWorkday();},60000);}return out;};
  const baseGoPage=window.goPage;
  window.goPage=function(page,title){const out=baseGoPage.apply(this,arguments);if(page==='managers')exposeKpiMenu();return out;};
  const baseLogout=window.doLogout;
  window.doLogout=async function(){clearInterval(myGpsTimer);return baseLogout.apply(this,arguments);};

  exposeKpiMenu();
  window.RESANTA_V2263=Object.freeze({version:VERSION,paymentMonthFilter:true,physicalPointVisitTruth:true,quickVisitGps:true,managerOwnKm:true,sharedSafeKpi:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 23 ===== */
// ============================================================================
// RESANTA CRM v22.6.4 · календарные месяцы поступлений + транзакционный визит
// + свежий контроль маршрутов + самовосстановление GPS при открытом приложении.
// ============================================================================
(function(){
  'use strict';
  const VERSION='22.6.4';
  const esc4=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const norm4=v=>String(v??'').trim().toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,' ').trim().replace(/\s+/g,' ');
  const date10=v=>String(v||'').slice(0,10);
  const month4=v=>{const m=String(v||'').match(/^(\d{4})-(\d{2})/);return m?m[1]+'-'+m[2]:'';};
  const monthLabel4=m=>{const a=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];const x=String(m||'').match(/^(\d{4})-(\d{2})$/);return x?(a[Number(x[2])-1]+' '+x[1]):m;};
  const addMonths4=(m,n)=>{const x=String(m||'').match(/^(\d{4})-(\d{2})$/);if(!x)return '';const d=new Date(Number(x[1]),Number(x[2])-1+n,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');};

  // Результаты задач, возвращённые серверной транзакцией визита.
  window.v2264TaskPayload=function(decisions){
    return Object.entries(decisions||{}).map(([taskId,d])=>({task_id:String(taskId),done:!!d?.done,reason:String(d?.reason||'').trim(),new_date:d?.newDate||null}));
  };
  window.v2264MergeReturnedTasks=function(rows){
    const list=Array.isArray(rows)?rows:[];
    for(const row of list){
      const i=(allTasks||[]).findIndex(t=>String(t.id)===String(row.id));
      if(i>=0)allTasks[i]={...allTasks[i],...row}; else allTasks.push(row);
    }
  };

  // ------------------------------------------------------------------------
  // Поступления. Список месяцев больше не зависит от наличия загруженного
  // отчёта: от первого месяца данных до 12 месяцев вперёд от текущего.
  // Даты документов показываются без сдвига часового пояса.
  // ------------------------------------------------------------------------
  window.v20ReceiptDate=function(v){
    const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m?m[3]+'.'+m[2]+'.'+m[1]:'—';
  };
  function calendarPaymentMonths(){
    const actual=(allCashReceipts||[]).flatMap(r=>[month4(r.document_at),month4(r.period_start),month4(r.period_end)]).filter(Boolean).sort();
    const current=month4(typeof TODAY!=='undefined'?TODAY:new Date().toISOString());
    let start=actual[0]||current,end=addMonths4(current,12);
    if(actual.length&&actual[actual.length-1]>end)end=actual[actual.length-1];
    const out=[];let x=start,guard=0;
    while(x&&x<=end&&guard++<60){out.push(x);x=addMonths4(x,1);}
    return out;
  }
  const initPayments2263=window.v20InitFilters;
  window.v20InitFilters=function(){
    if(typeof initPayments2263==='function')initPayments2263();
    const sel=document.getElementById('payments-month');if(!sel)return;
    const old=sel.value,months=calendarPaymentMonths(),first=!sel.dataset.v2264Ready;
    sel.innerHTML='<option value="all">Все месяцы</option>'+months.map(m=>'<option value="'+m+'">'+esc4(monthLabel4(m))+'</option>').join('');
    const current=month4(typeof TODAY!=='undefined'?TODAY:new Date().toISOString());
    sel.value=(!first&&(['all',...months].includes(old)))?old:(months.includes(current)?current:(months[months.length-1]||'all'));
    sel.dataset.v2264Ready='1';
  };
  const renderPayments2263=window.renderPayments;
  window.renderPayments=function(){
    if(typeof renderPayments2263==='function')renderPayments2263();
    const sel=document.getElementById('payments-month'),month=sel?.value||'all';
    if(month==='all')return;
    const has=(allCashReceipts||[]).some(r=>month4(r.document_at)===month);
    if(!has){
      const list=document.getElementById('payments-list');
      if(list)list.innerHTML='<div class="card" style="text-align:center;padding:26px"><div style="font-size:18px;font-weight:700">За '+esc4(monthLabel4(month))+' поступлений пока нет</div><div style="font-size:12px;color:var(--sub);margin-top:7px">Месяц уже доступен. Данные появятся автоматически после первого отчёта 1С с документами за этот месяц.</div></div>';
    }
  };

  // ------------------------------------------------------------------------
  // GPS-контроль руководителя. Перед каждым ручным обновлением сервер отдаёт
  // свежие маршруты, визиты и задачи за выбранную дату; браузерный кэш больше
  // не определяет план/факт.
  // ------------------------------------------------------------------------
  function mergeDayRows(target,date,rows,dateGetter){
    return (target||[]).filter(x=>dateGetter(x)!==date).concat(Array.isArray(rows)?rows:[]);
  }
  async function refreshGpsTruth2264(){
    if(currentProfile?.role!=='boss')return;
    const date=document.getElementById('gps-control-date')?.value||TODAY;
    const mgr=document.getElementById('gps-control-manager')?.value||'all';
    const {data,error}=await db.rpc('crm_v2264_gps_control_bundle',{p_date:date,p_manager:mgr==='all'?null:mgr});
    if(error)throw error;
    const b=data||{};
    allRoutePlans=mergeDayRows(allRoutePlans,date,b.route_plans,x=>date10(x.visit_date));
    allVisits=mergeDayRows(allVisits,date,b.visits,x=>date10(x.date||x.created_at));
    const taskRows=Array.isArray(b.tasks)?b.tasks:[];
    if(mgr==='all')allTasks=taskRows;
    else allTasks=(allTasks||[]).filter(t=>{
      const name=typeof taskManagerName==='function'?taskManagerName(t):(t.manager_name||'');
      return !managerLooseMatch(name,mgr);
    }).concat(taskRows);
  }
  const gpsControl2263=window.v19RenderGpsControl;
  window.v19RenderGpsControl=async function(force){
    try{if(force)await refreshGpsTruth2264();}
    catch(e){alert('Не удалось получить свежие визиты и задачи с сервера: '+(e.message||e));return;}
    return gpsControl2263.apply(this,arguments);
  };

  // ------------------------------------------------------------------------
  // Самовосстановление фонового GPS. Оно не заменяет разрешения Android, но
  // при открытии/возврате в приложение автоматически перезапускает нативный
  // сервис, если рабочий день активен, а запись остановилась или устарела.
  // ------------------------------------------------------------------------
  let healBusy=false,lastHeal=0;
  async function ensureGpsAlive2264(){
    if(healBusy||currentProfile?.role!=='manager'||!v19MyWorkday?.id||document.hidden)return;
    if(Date.now()-lastHeal<90000)return;
    healBusy=true;lastHeal=Date.now();
    try{
      await v19LoadMyWorkday();
      if(!v19MyWorkday?.id)return;
      const native=await v19NativeStatus();
      const last=native.lastPointAt||v19MyWorkday.last_point_at;
      const stale=!last||Date.now()-new Date(last).getTime()>12*60000;
      const running=!!native.active&&String(native.workdayId||'')===String(v19MyWorkday.id);
      if((!running||stale)&&v19NativeTracker()){
        await v19StartNativeFor(v19MyWorkday);
        await v19LoadMyWorkday();
      }
    }catch(e){console.warn('Автовосстановление GPS не удалось',e);}
    finally{healBusy=false;}
  }
  function gpsStaleWarning2264(last){
    if(!last)return 'Сервер ещё не получил ни одной GPS-точки.';
    const min=Math.max(0,Math.round((Date.now()-new Date(last).getTime())/60000));
    return min>10?'Последняя GPS-точка была '+min+' мин назад. CRM пытается автоматически возобновить запись.':'';
  }
  const managerWorkday2263=window.v19RenderManagerWorkday;
  window.v19RenderManagerWorkday=async function(){
    await managerWorkday2263.apply(this,arguments);
    const root=document.getElementById('workday-manager-status');if(!root||!v19MyWorkday)return;
    const native=await v19NativeStatus(),msg=gpsStaleWarning2264(native.lastPointAt||v19MyWorkday.last_point_at);
    root.querySelector('#v2264-gps-warning')?.remove();
    if(msg)root.insertAdjacentHTML('beforeend','<div id="v2264-gps-warning" class="promo-warning" style="margin-top:10px;color:var(--r)"><b>⚠ GPS требует внимания.</b> '+esc4(msg)+'<div style="margin-top:7px"><button class="btn-primary" onclick="v19ResumeWorkday()">Возобновить GPS сейчас</button></div></div>');
  };
  window.addEventListener('focus',()=>setTimeout(ensureGpsAlive2264,700));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(ensureGpsAlive2264,700);});
  setInterval(ensureGpsAlive2264,120000);
  setTimeout(ensureGpsAlive2264,5000);

  window.RESANTA_V2264=Object.freeze({version:VERSION,calendarPaymentMonths:true,timezoneSafePayments:true,transactionalVisit:true,freshGpsControl:true,gpsSelfHeal:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 24 ===== */
// ============================================================================
// RESANTA CRM v22.6.5 · Триовист / 21vek.by — контроль карточек из Excel.
// Новый снимок сравнивается с предыдущим: проблемы открываются и закрываются
// автоматически. Исчезнувшая из файла карточка требует проверки и не считается
// исправленной.
// ============================================================================
(function(){
  'use strict';
  const VERSION='22.6.5';
  const ALEKS='aleksandrenko_av@resanta.ru';
  const KRISHTAL='krishtal_na@resanta.ru';
  const LEADERS=['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru'];
  const MANAGERS=[ALEKS,KRISHTAL];
  let tri21Data={managers:[],issues:[]},tri21Loaded=false,tri21Loading=false,tri21UploadBusy=false;

  const email=()=>String(currentProfile?.email||currentUser?.email||'').trim().toLowerCase();
  const isLeader=()=>currentProfile?.role==='boss'&&LEADERS.includes(email());
  const isTriManager=()=>String(currentProfile?.access_scope||'').toLowerCase()==='triovist'&&MANAGERS.includes(email());
  const canSee=()=>isLeader()||isTriManager();
  const managerName=e=>String(e||'').toLowerCase()===ALEKS?'Александренко':String(e||'').toLowerCase()===KRISHTAL?'Кришталь':'Не распределено';
  const h=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const ha=v=>h(v).replace(/`/g,'&#96;');
  const n=v=>{if(v===null||v===undefined||v==='')return null;const x=Number(String(v).replace(/\s/g,'').replace(',','.').replace(/[^0-9.+-]/g,''));return Number.isFinite(x)?x:null;};
  const int=v=>{const x=n(v);return x===null?0:Math.max(0,Math.round(x));};
  const rating=v=>{const x=n(v);return x!==null&&x>0?x:null;};
  const norm=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,' ').trim().replace(/\s+/g,' ');
  const compact=v=>norm(v).replace(/\s/g,'');
  const boolStock=v=>{const s=norm(v);return s==='да'||s.includes('в наличии')||s==='есть'||s==='true'||s==='1';};
  const days=v=>{const x=n(v);return x===null?null:Math.max(0,Math.round(x));};
  const today=()=>String(typeof TODAY!=='undefined'?TODAY:new Date().toISOString().slice(0,10)).slice(0,10);
  const fmtDate=v=>{if(!v)return'—';const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'.'+m[2]+'.'+m[1]:String(v);};
  const fmtDateTime=v=>{if(!v)return'—';try{return new Date(v).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(_){return String(v);}};

  const ISSUE_LABELS={
    listing_outside_top60:'Вне ТОП-60',listing_31_60:'Ниже ТОП-30',out_of_stock:'Нет в наличии',
    no_reviews:'Нет отзывов',no_questions:'Нет вопросов',no_video:'Нет видео',video_available_not_uploaded:'Можно загрузить видео',few_photos:'Мало фотографий',
    no_description:'Нет описания',no_warranty:'Нет гарантии',low_product_rating:'Рейтинг карточки ниже 4',
    low_last_review:'Последний отзыв ниже 4',negative_review_unanswered:'Отрицательный отзыв без ответа',
    question_unanswered:'Вопрос без ответа',delivery_minsk_slow:'Доставка Минск дольше 1 дня'
  };
  const STATUS_LABELS={open:'Открыто',resolved:'Исправлено',needs_review:'Требует проверки'};

  function removeLostGroups(){
    document.querySelectorAll('#tri-alerts .tri-alert-card').forEach(card=>{
      const title=card.querySelector('.card-title')?.textContent||'';
      if(title.includes('Потерянные группы'))card.remove();
    });
  }

  function injectCss(){
    if(document.getElementById('tri21-v2265-css'))return;
    const s=document.createElement('style');s.id='tri21-v2265-css';s.textContent=`
      .tri21-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}.tri21-tools{display:flex;gap:8px;align-items:end;flex-wrap:wrap}.tri21-kpis{display:grid;grid-template-columns:repeat(5,minmax(135px,1fr));gap:9px;margin:12px 0}.tri21-kpi{background:var(--bg);border-radius:10px;padding:11px}.tri21-kpi span{display:block;color:var(--sub);font-size:10px;text-transform:uppercase;font-weight:700}.tri21-kpi b{display:block;font-size:20px;margin-top:4px}.tri21-manager-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}.tri21-manager{border:1px solid var(--border);border-radius:11px;padding:12px}.tri21-manager-title{display:flex;justify-content:space-between;gap:8px}.tri21-filters{display:grid;grid-template-columns:180px 190px 240px minmax(220px,1fr);gap:9px;margin:12px 0}.tri21-table{min-width:1280px}.tri21-severity{display:inline-flex;padding:3px 8px;border-radius:99px;font-size:10px;font-weight:800}.tri21-critical{background:#FEE2E2;color:#B91C1C}.tri21-warning{background:#FFEDD5;color:#C2410C}.tri21-info{background:#DBEAFE;color:#1D4ED8}.tri21-open{color:#B91C1C;font-weight:800}.tri21-resolved{color:#166534;font-weight:800}.tri21-review{color:#9A3412;font-weight:800}.tri21-new{display:inline-flex;margin-left:5px;padding:2px 6px;border-radius:99px;background:#DBEAFE;color:#1D4ED8;font-size:9px;font-weight:800}.tri21-upload-status{display:none;margin-top:10px;padding:10px 12px;border-radius:9px;background:#EFF6FF;border:1px solid #BFDBFE;font-size:12px}.tri21-note{color:var(--sub);font-size:11px;line-height:1.5}.tri21-link{font-weight:700;color:var(--a);text-decoration:none}.tri21-link:hover{text-decoration:underline}
      @media(max-width:1100px){.tri21-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.tri21-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.tri21-manager-grid,.tri21-kpis,.tri21-filters{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }

  function injectUi(){
    if(!canSee())return;
    injectCss();
    const page=document.getElementById('page-triovist');if(!page||document.getElementById('tri21-card'))return;
    const card=document.createElement('div');card.className='card';card.id='tri21-card';card.style.marginTop='12px';
    card.innerHTML=`
      <div class="tri21-head"><div><div class="card-title" style="margin-bottom:3px">🔎 Контроль карточек 21vek</div><div class="tri21-note">Загрузите свежие Excel Александренко и Кришталь. CRM пересчитает показатели, сравнит их с предыдущей загрузкой, откроет новые проблемы и автоматически закроет исправленные.</div></div><div class="tri21-tools">
        <div><label class="form-label">Дата снимка</label><input class="form-input" type="date" id="tri21-date" value="${today()}"></div>
        <button class="btn-secondary tri21-upload-btn" data-manager="${ALEKS}" onclick="document.getElementById('tri21-file-aleks').click()">⬆ Отчёт Александренко</button>
        <button class="btn-secondary tri21-upload-btn" data-manager="${KRISHTAL}" onclick="document.getElementById('tri21-file-krishtal').click()">⬆ Отчёт Кришталь</button>
        <button class="btn-secondary" onclick="triovistContentReload(true)">↻ Обновить контроль</button>
      </div></div>
      <input hidden type="file" id="tri21-file-aleks" accept=".xlsx" onchange="triovistContentUpload('${ALEKS}',event)">
      <input hidden type="file" id="tri21-file-krishtal" accept=".xlsx" onchange="triovistContentUpload('${KRISHTAL}',event)">
      <div id="tri21-upload-status" class="tri21-upload-status"></div>
      <div id="tri21-meta" class="tri21-note" style="margin-top:9px"></div>
      <div id="tri21-kpis" class="tri21-kpis"></div>
      <div id="tri21-managers" class="tri21-manager-grid"></div>
      <div class="tri21-filters">
        <div id="tri21-manager-wrap"><label class="form-label">Менеджер</label><select class="form-input" id="tri21-manager" onchange="triovistContentRender()"><option value="all">Все менеджеры</option><option value="${ALEKS}">Александренко</option><option value="${KRISHTAL}">Кришталь</option></select></div>
        <div><label class="form-label">Статус</label><select class="form-input" id="tri21-status" onchange="triovistContentRender()"><option value="active">Открытые + проверка</option><option value="all">Все изменения последней загрузки</option><option value="open">Только открытые</option><option value="needs_review">Требуют проверки</option><option value="resolved">Исправлено последней загрузкой</option></select></div>
        <div><label class="form-label">Тип проблемы</label><select class="form-input" id="tri21-type" onchange="triovistContentRender()"><option value="all">Все типы</option>${Object.entries(ISSUE_LABELS).map(([k,v])=>`<option value="${k}">${h(v)}</option>`).join('')}</select></div>
        <div><label class="form-label">Поиск</label><input class="form-input" id="tri21-search" placeholder="Артикул, товар, карточка 21vek" oninput="triovistContentRender()"></div>
      </div>
      <div id="tri21-list"></div>`;
    const stock=document.getElementById('tri-stock-card');
    if(stock)stock.parentNode.insertBefore(card,stock);else page.appendChild(card);
    applyAccess();
  }

  function applyAccess(){
    if(!document.getElementById('tri21-card'))return;
    document.querySelectorAll('.tri21-upload-btn').forEach(b=>{
      const target=b.dataset.manager;
      b.style.display=(isLeader()||(isTriManager()&&email()===target))?'inline-flex':'none';
    });
    const wrap=document.getElementById('tri21-manager-wrap'),sel=document.getElementById('tri21-manager');
    if(isTriManager()){
      if(wrap)wrap.style.display='none';
      if(sel)sel.value=email();
    }else if(wrap)wrap.style.display='block';
  }

  function setStatus(text,kind='info'){
    const el=document.getElementById('tri21-upload-status');if(!el)return;
    el.style.display=text?'block':'none';
    el.style.background=kind==='error'?'#FEF2F2':kind==='ok'?'#ECFDF5':'#EFF6FF';
    el.style.borderColor=kind==='error'?'#FCA5A5':kind==='ok'?'#86EFAC':'#BFDBFE';
    el.style.color=kind==='error'?'#991B1B':kind==='ok'?'#166534':'#1E3A8A';
    el.textContent=text||'';
  }

  function sheet(wb,name){
    const exact=wb.Sheets[name];if(exact)return exact;
    const wanted=norm(name);const found=wb.SheetNames.find(nm=>norm(nm)===wanted);
    return found?wb.Sheets[found]:null;
  }
  function grid(X,ws){return ws?X.utils.sheet_to_json(ws,{header:1,defval:'',raw:false,blankrows:false}):[];}
  function keyBase(row){
    const donor=String(row?.[5]||'').trim(),url=String(row?.[6]||'').trim(),sku=String(row?.[4]||'').trim();
    return donor?'donor:'+compact(donor):url?'url:'+compact(url):'sku:'+compact(sku);
  }
  function parseRuDate(v){
    const s=String(v||'').trim();if(!s)return null;
    let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return `${m[1]}-${m[2]}-${m[3]}`;
    m=s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);if(m)return `${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
    m=s.toLowerCase().match(/^(\d{1,2})\s+([а-яё]+),?\s+(\d{4})/);
    if(m){const mm={янв:1,фев:2,мар:3,апр:4,май:5,июн:6,июл:7,авг:8,сен:9,окт:10,ноя:11,дек:12};const k=Object.keys(mm).find(x=>m[2].startsWith(x));if(k)return `${m[3]}-${String(mm[k]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;}
    return null;
  }

  async function parseReport(file){
    const X=typeof _loadSheetJS==='function'?await _loadSheetJS():window.XLSX;
    if(!X)throw new Error('Не загрузился модуль чтения Excel');
    const wb=X.read(await file.arrayBuffer(),{type:'array',cellDates:false});
    const general=grid(X,sheet(wb,'Общие данные'));
    if(general.length<3)throw new Error('В файле не найден лист «Общие данные» или он пустой');
    const reviews=grid(X,sheet(wb,'Отзывы'));
    const questions=grid(X,sheet(wb,'Вопросы и ответы'));
    const hd=grid(X,sheet(wb,'Видео HD'));
    const yt=grid(X,sheet(wb,'Видео YT'));

    const reviewMap=new Map();
    for(let i=2;i<reviews.length;i++){
      const r=reviews[i];if(!r||(!r[4]&&!r[5]&&!r[6]))continue;
      const k=keyBase(r),rvRating=rating(r[12]),date=parseRuDate(r[11]),answer=String(r[10]||'').trim(),text=[r[7],r[8],r[9]].filter(Boolean).join(' | ').trim();
      const a=reviewMap.get(k)||{negative:0,unansweredNegative:0,latestDate:null,latestRating:null,latestText:'',latestAnswered:null};
      if(rvRating!==null&&rvRating<4){a.negative++;if(!answer)a.unansweredNegative++;}
      if(date&&(!a.latestDate||date>a.latestDate)){a.latestDate=date;a.latestRating=rvRating;a.latestText=text.slice(0,1900);a.latestAnswered=!!answer;}
      reviewMap.set(k,a);
    }

    const questionMap=new Map();
    for(let i=2;i<questions.length;i++){
      const r=questions[i];if(!r||(!r[4]&&!r[5]&&!r[6]))continue;
      const k=keyBase(r),q=String(r[7]||'').trim(),answer=String(r[8]||'').trim();
      if(q&&!answer)questionMap.set(k,(questionMap.get(k)||0)+1);
    }

    function videoMap(rows,totalCol,siteCol,uploadCol){
      const map=new Map();
      for(let i=2;i<rows.length;i++){
        const r=rows[i];if(!r||(!r[4]&&!r[5]&&!r[6]))continue;
        map.set(keyBase(r),{available:int(r[totalCol]),site:int(r[siteCol]),uploadable:Math.max(0,int(r[uploadCol]))});
      }
      return map;
    }
    const hdMap=videoMap(hd,12,13,14),ytMap=videoMap(yt,10,11,12);

    const map=new Map();
    for(let i=2;i<general.length;i++){
      const r=general[i];if(!r||(!r[1]&&!r[4]&&!r[5]&&!r[6]))continue;
      const base=keyBase(r);if(base==='sku:')continue;
      const keyword=String(r[11]||'').trim(),cardKey=base;
      const rv=reviewMap.get(base)||{},q=questionMap.get(base)||0,hv=hdMap.get(base)||{},yv=ytMap.get(base)||{};
      const row={
        card_key:cardKey,sku:String(r[4]||'').trim(),donor_article:String(r[5]||'').trim(),
        product_name:String(r[1]||'').trim(),category:String(r[2]||'').trim(),subgroup:String(r[3]||'').trim(),
        product_url:String(r[6]||'').trim(),price:n(r[7]),description_present:!!String(r[8]||'').trim(),
        warranty_present:!!String(r[9]||'').trim(),sale_flag:String(r[10]||'').trim(),keyword,
        listing_position:n(r[12]),product_rating:rating(r[13]),last_review_rating:rv.latestRating??rating(r[14]),
        review_count:int(r[15]),question_count:int(r[16]),photo_count:int(r[17]),video_count:int(r[18]),
        in_stock:boolStock(r[19]),delivery_minsk_days:days(r[20]),pickup_minsk_days:days(r[21]),
        mdc_value:String(r[34]||'').trim(),sale_value:String(r[35]||'').trim(),negative_reviews:rv.negative||0,
        unanswered_negative_reviews:rv.unansweredNegative||0,unanswered_questions:q,
        latest_review_date:rv.latestDate||null,latest_review_text:rv.latestText||'',latest_review_answered:rv.latestAnswered??null,
        hd_available:hv.available||0,hd_on_site:hv.site||0,hd_uploadable:hv.uploadable||0,
        yt_available:yv.available||0,yt_on_site:yv.site||0,yt_uploadable:yv.uploadable||0,source_row:i+1
      };
      const old=map.get(cardKey);
      if(!old){map.set(cardKey,row);continue;}
      const keywords=[...new Set([old.keyword,row.keyword].filter(Boolean))].join(' / ').slice(0,500);
      old.keyword=keywords;
      old.listing_position=(old.listing_position===null||row.listing_position===null)?null:Math.max(old.listing_position,row.listing_position);
      old.description_present=old.description_present||row.description_present;
      old.warranty_present=old.warranty_present||row.warranty_present;
      old.in_stock=old.in_stock||row.in_stock;
      old.review_count=Math.max(old.review_count,row.review_count);
      old.question_count=Math.max(old.question_count,row.question_count);
      old.photo_count=Math.max(old.photo_count,row.photo_count);
      old.video_count=Math.max(old.video_count,row.video_count);
      old.delivery_minsk_days=Math.max(old.delivery_minsk_days??0,row.delivery_minsk_days??0)||null;
      old.pickup_minsk_days=Math.max(old.pickup_minsk_days??0,row.pickup_minsk_days??0)||null;
      map.set(cardKey,old);
    }
    const rows=[...map.values()];
    if(rows.length<20)throw new Error('Найдено слишком мало карточек: '+rows.length+'. Проверьте формат файла.');
    return {rows,sheets:{general:general.length-2,reviews:Math.max(0,reviews.length-2),questions:Math.max(0,questions.length-2),hd:Math.max(0,hd.length-2),yt:Math.max(0,yt.length-2)}};
  }

  function preview(rows){
    return {
      cards:rows.length,top30:rows.filter(x=>x.listing_position!==null&&x.listing_position<=30).length,
      top60:rows.filter(x=>x.listing_position!==null&&x.listing_position<=60).length,
      outStock:rows.filter(x=>!x.in_stock).length,noVideo:rows.filter(x=>x.video_count===0).length,
      uploadVideo:rows.filter(x=>x.hd_uploadable+x.yt_uploadable>0).length,
      unansweredNegative:rows.reduce((s,x)=>s+x.unanswered_negative_reviews,0),
      unansweredQuestions:rows.reduce((s,x)=>s+x.unanswered_questions,0)
    };
  }

  async function rpc(name,args,timeout=90000){
    let timer;const p=db.rpc(name,args);const t=new Promise((_,rej)=>timer=setTimeout(()=>rej(new Error('Сервер не ответил вовремя: '+name)),timeout));
    try{const r=await Promise.race([p,t]);if(r?.error)throw r.error;return r?.data;}finally{clearTimeout(timer);}
  }

  window.triovistContentUpload=async function(manager,event){
    const input=event?.target,file=input?.files?.[0];if(input)input.value='';
    if(!file||tri21UploadBusy)return;
    if(!/\.xlsx$/i.test(file.name)){alert('Загрузите файл .xlsx');return;}
    tri21UploadBusy=true;let importId=null;
    try{
      setStatus('Читаю и проверяю '+file.name+'…');
      const parsed=await parseReport(file),p=preview(parsed.rows),name=managerName(manager);
      const ok=confirm(`Загрузить отчёт ${name}?\n\nКарточек: ${p.cards}\nТОП-30: ${p.top30}\nТОП-60: ${p.top60}\nНет в наличии: ${p.outStock}\nБез видео: ${p.noVideo}\nМожно загрузить видео: ${p.uploadVideo}\nОтрицательных отзывов без ответа: ${p.unansweredNegative}\nВопросов без ответа: ${p.unansweredQuestions}\n\nCRM сравнит этот снимок с предыдущим.`);
      if(!ok){setStatus('Загрузка отменена.');return;}
      const snap=document.getElementById('tri21-date')?.value||today();
      setStatus('Создаю новый снимок '+name+'…');
      importId=await rpc('triovist_content_stage_begin',{p_manager_email:manager,p_source_file:file.name,p_snapshot_date:snap,p_expected_cards:parsed.rows.length},45000);
      const batch=150;
      for(let i=0;i<parsed.rows.length;i+=batch){
        const end=Math.min(parsed.rows.length,i+batch);
        setStatus(`Загружаю ${name}: ${end} из ${parsed.rows.length} карточек…`);
        await rpc('triovist_content_stage_batch',{p_import_id:importId,p_rows:parsed.rows.slice(i,end)},90000);
      }
      setStatus('Сравниваю с предыдущей загрузкой и пересчитываю проблемы…');
      const result=await rpc('triovist_content_stage_commit',{p_import_id:importId,p_expected_cards:parsed.rows.length},120000);
      importId=null;
      const s=result?.summary||{};
      setStatus(`✅ ${name}: загружено ${s.cards||parsed.rows.length} карточек. Новых проблем: ${s.new_issues||0}, исправлено: ${s.resolved_issues||0}, открыто: ${s.open_issues||0}, требуют проверки: ${s.needs_review||0}.`,'ok');
      await window.triovistContentReload(true);
    }catch(e){
      if(importId)try{await db.rpc('triovist_content_stage_abort',{p_import_id:importId});}catch(_){ }
      console.error(e);setStatus('Ошибка загрузки: '+(e.message||e),'error');alert('Не удалось загрузить отчёт 21vek: '+(e.message||e));
    }finally{tri21UploadBusy=false;}
  };

  async function loadDashboard(force=false){
    if(!canSee()||tri21Loading)return;
    if(tri21Loaded&&!force)return;
    tri21Loading=true;
    try{
      const hub=window.TRIOVIST_DATA_HUB_V227315;
      const data=await hub.content({p_manager_email:null});
      tri21Data=data||{managers:[],issues:[]};tri21Loaded=true;
    }catch(e){
      console.warn('Контроль карточек 21vek недоступен',e);
      tri21Data={managers:[],issues:[],error:e.message||String(e)};tri21Loaded=true;
    }finally{tri21Loading=false;}
  }

  window.triovistContentReload=async function(force=true){if(force)window.TRIOVIST_DATA_HUB_V227315?.invalidate('content');await loadDashboard(force);window.triovistContentRender();};
  window.triovistContentEnsureLoaded=async function(){await loadDashboard(false);window.triovistContentRender();};

  function filteredIssues(){
    const manager=document.getElementById('tri21-manager')?.value||'all',status=document.getElementById('tri21-status')?.value||'active',type=document.getElementById('tri21-type')?.value||'all',q=norm(document.getElementById('tri21-search')?.value||'');
    return (tri21Data.issues||[]).filter(x=>(manager==='all'||x.manager_email===manager))
      .filter(x=>status==='all'||(status==='active'?['open','needs_review'].includes(x.status):x.status===status))
      .filter(x=>type==='all'||x.issue_type===type)
      .filter(x=>!q||norm([x.sku,x.donor_article,x.product_name,x.category,x.subgroup,x.issue_title,x.keyword].join(' ')).includes(q));
  }

  window.triovistContentRender=function(){
    if(!canSee())return;injectUi();applyAccess();removeLostGroups();
    const meta=document.getElementById('tri21-meta'),kpis=document.getElementById('tri21-kpis'),mgrBox=document.getElementById('tri21-managers'),list=document.getElementById('tri21-list');
    if(!meta||!kpis||!mgrBox||!list)return;
    if(tri21Loading){meta.textContent='Загрузка контроля карточек…';return;}
    if(tri21Data.error){meta.innerHTML='<span style="color:var(--r)">Контроль карточек пока недоступен: '+h(tri21Data.error)+'</span>';kpis.innerHTML='';mgrBox.innerHTML='';list.innerHTML='';return;}
    const managers=(tri21Data.managers||[]).filter(x=>isLeader()||x.manager_email===email());
    const all=(tri21Data.issues||[]).filter(x=>isLeader()||x.manager_email===email());
    const active=all.filter(x=>x.status==='open'),review=all.filter(x=>x.status==='needs_review'),resolved=all.filter(x=>x.status==='resolved'&&x.is_resolved_latest),fresh=all.filter(x=>x.is_new_latest&&x.status==='open'),critical=active.filter(x=>x.severity==='critical');
    meta.innerHTML=managers.length?'Последние снимки: '+managers.map(m=>'<b>'+h(m.manager_name)+'</b> — '+fmtDate(m.snapshot_date)+' ('+h(m.source_file)+', '+Number(m.summary?.cards||0).toLocaleString('ru-RU')+' карточек)').join(' · '):'Отчёты карточек ещё не загружены. Сначала загрузите два свежих Excel.';
    kpis.innerHTML=[['Открыто',active.length],['Критических',critical.length],['Новых',fresh.length],['Исправлено',resolved.length],['Требуют проверки',review.length]].map(([a,b])=>'<div class="tri21-kpi"><span>'+a+'</span><b>'+Number(b).toLocaleString('ru-RU')+'</b></div>').join('');
    mgrBox.innerHTML=managers.map(m=>{const s=m.summary||{};return '<div class="tri21-manager"><div class="tri21-manager-title"><div><b>'+h(m.manager_name)+'</b><div class="tri21-note">'+fmtDate(m.snapshot_date)+' · '+h(m.source_file)+'</div></div><b>'+Number(s.cards||0).toLocaleString('ru-RU')+' карточек</b></div><div class="tri-metrics"><div class="tri-metric"><span>ТОП-30</span><b>'+Number(s.top30||0).toLocaleString('ru-RU')+'</b></div><div class="tri-metric"><span>ТОП-60</span><b>'+Number(s.top60||0).toLocaleString('ru-RU')+'</b></div><div class="tri-metric"><span>Новые / исправлено</span><b>'+Number(s.new_issues||0)+' / '+Number(s.resolved_issues||0)+'</b></div></div></div>';}).join('');
    const rows=filteredIssues(),shown=rows.slice(0,600);
    if(!rows.length){list.innerHTML='<div class="tri-empty">По выбранным фильтрам проблем нет.</div>';return;}
    list.innerHTML='<div class="tri21-note" style="margin-bottom:7px">Показано '+shown.length+' из '+rows.length+'. Исправленные проблемы отображаются только для последней загрузки.</div><div class="tri-table-wrap"><table class="tri-table tri21-table"><thead><tr><th>Менеджер</th><th>Важность</th><th>Статус</th><th>Проблема</th><th>Артикул / карточка</th><th>Товар</th><th>Текущее значение</th><th>Предыдущее</th><th>Снимок</th></tr></thead><tbody>'+shown.map(x=>{
      const statusClass=x.status==='resolved'?'tri21-resolved':x.status==='needs_review'?'tri21-review':'tri21-open';
      return '<tr><td><b>'+h(x.manager_name)+'</b></td><td><span class="tri21-severity tri21-'+h(x.severity)+'">'+(x.severity==='critical'?'Критично':x.severity==='warning'?'Внимание':'Информация')+'</span></td><td><span class="'+statusClass+'">'+h(STATUS_LABELS[x.status]||x.status)+'</span>'+(x.is_new_latest&&x.status==='open'?'<span class="tri21-new">НОВАЯ</span>':'')+'</td><td><b>'+h(x.issue_title)+'</b>'+(x.keyword?'<div class="tri21-note">Запрос: '+h(x.keyword)+'</div>':'')+'</td><td><b>'+h(x.sku||'—')+'</b><div class="tri21-note">21vek: '+h(x.donor_article||'—')+'</div>'+(x.product_url?'<a class="tri21-link" href="'+ha(x.product_url)+'" target="_blank" rel="noopener">Открыть карточку</a>':'')+'</td><td>'+h(x.product_name||'Карточка отсутствует в новом отчёте')+'<div class="tri21-note">'+h([x.category,x.subgroup].filter(Boolean).join(' · '))+'</div></td><td>'+h(x.current_value||'—')+'</td><td>'+h(x.previous_value||'—')+'</td><td>'+fmtDate(x.snapshot_date)+'</td></tr>';
    }).join('')+'</tbody></table></div>';
  };

  const baseRender=window.renderTriovist;
  window.renderTriovist=function(){const out=baseRender?.apply(this,arguments);injectUi();removeLostGroups();const pane=document.getElementById('tri-v22728-pane-cards');if(pane?.classList.contains('active')&&tri21Loaded)window.triovistContentRender();return out;};
  const baseReload=window.triovistReload;
  window.triovistReload=async function(){const out=await baseReload?.apply(this,arguments);tri21Loaded=false;const pane=document.getElementById('tri-v22728-pane-cards');if(pane?.classList.contains('active')){window.TRIOVIST_DATA_HUB_V227315?.invalidate('content');await loadDashboard(true);window.triovistContentRender();}return out;};
  const baseLoad=window.loadData;
  window.loadData=async function(){return await baseLoad.apply(this,arguments);};
  const baseGo=window.goPage;
  window.goPage=function(page,title){return baseGo.apply(this,arguments);};

  injectUi();removeLostGroups();
  window.RESANTA_V2265=Object.freeze({version:VERSION,excelSnapshots:true,automaticIssueOpenClose:true,missingCardNeedsReview:true,lostGroupsRemoved:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 25 ===== */
// ============================================================================
// RESANTA CRM · Триовист / 21vek.by — коммерческие ИИ-задачи роста.
// В v22.7.31.9 задача ставится на уровне товарной ПОДГРУППЫ.
// Внутри задачи хранится приоритетный список SKU; план отдельно по менеджеру, 8/10/12/15 подгрупп, срок конец месяца.
// ============================================================================
(function(){
  'use strict';
  const VERSION='22.7.31.9';
  const ALEKS='aleksandrenko_av@resanta.ru';
  const KRISHTAL='krishtal_na@resanta.ru';
  const LEADERS=['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru'];
  const MANAGERS=[ALEKS,KRISHTAL];
  const ACTIVE=['pending_approval','new','accepted','in_progress','waiting_21vek','awaiting_check','partial','overdue'];
  const CLOSED=['verified','cancelled','not_relevant','not_achieved'];
  const TYPE_LABELS={availability:'Наличие и заказ',listing:'Рост позиции',reputation:'Отзывы и рейтинг',media:'Фото и видео',content:'Описание и гарантия',novelty:'Новинка'};
  const STATUS_LABELS={pending_approval:'На согласовании',new:'Новая',accepted:'Принята',in_progress:'В работе',waiting_21vek:'Ожидает 21vek',awaiting_check:'Ожидает проверки',partial:'Частично выполнена',verified:'Выполнена и подтверждена',not_achieved:'Не выполнена',overdue:'Просрочена',cancelled:'Отменена',not_relevant:'Неактуальна'};
  let data={tasks:[],summary:{},groups:[],managers:[]};
  let sales={items:[],period_plans:[],selected_month_plans:[]};
  let stock={items:[]};
  let triShipmentsV22728=[],triNoveltiesV22728=[];
  let loading=false,loaded=false,aiBusy=false,enrichBusy=false;

  const userEmail=()=>String(currentProfile?.email||currentUser?.email||'').trim().toLowerCase();
  const isLeader=()=>currentProfile?.role==='boss'&&LEADERS.includes(userEmail());
  const isTriManager=()=>String(currentProfile?.access_scope||'').toLowerCase()==='triovist'&&MANAGERS.includes(userEmail());
  const canSee=()=>isLeader()||isTriManager();
  const h=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const ha=v=>h(v).replace(/`/g,'&#96;');
  const norm=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,' ').trim().replace(/\s+/g,' ');
  const skuKey=v=>String(v||'').toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g,'');
  const num=v=>Number(v)||0;
  const money=v=>num(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
  const qty=v=>num(v).toLocaleString('ru-RU',{maximumFractionDigits:2});
  const pct=(a,b)=>b>0?(a-b)/b*100:a>0?100:0;
  const fmtDate=v=>{const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'.'+m[2]+'.'+m[1]:'—';};
  const managerName=e=>String(e||'').toLowerCase()===ALEKS?'Александренко':String(e||'').toLowerCase()===KRISHTAL?'Кришталь':'—';
  const currentMonth=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');};
  const rpc=async(name,args,timeout=90000)=>{let timer;const t=new Promise((_,rej)=>timer=setTimeout(()=>rej(new Error('Сервер не ответил вовремя: '+name)),timeout));try{const r=await Promise.race([db.rpc(name,args),t]);if(r?.error)throw r.error;return r?.data;}finally{clearTimeout(timer);}};

  function injectCss(){
    if(document.getElementById('tri-task-v2266-css'))return;
    const s=document.createElement('style');s.id='tri-task-v2266-css';s.textContent=`
      .tri-task-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}.tri-task-tools{display:flex;gap:8px;flex-wrap:wrap}.tri-task-kpis{display:grid;grid-template-columns:repeat(7,minmax(115px,1fr));gap:9px;margin:12px 0}.tri-task-kpi{background:var(--bg);border-radius:10px;padding:11px}.tri-task-kpi span{display:block;color:var(--sub);font-size:10px;text-transform:uppercase;font-weight:700}.tri-task-kpi b{display:block;font-size:20px;margin-top:4px}.tri-task-filters{display:grid;grid-template-columns:170px 180px 180px 170px 180px minmax(210px,1fr);gap:9px;margin:12px 0}.tri-task-rank{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0}.tri-task-rank-card{border:1px solid var(--border);border-radius:11px;padding:12px;background:#fff}.tri-task-rank-head{display:flex;justify-content:space-between;gap:8px}.tri-task-score{font-size:22px;font-weight:900;color:var(--a)}.tri-task-card{border:1px solid var(--border);border-radius:12px;padding:14px;margin-bottom:10px;background:#fff}.tri-task-card.overdue{border-color:#FCA5A5}.tri-task-card.verified{border-color:#86EFAC;background:#F0FDF4}.tri-task-card.pending_approval{border-color:#FCD34D;background:#FFFBEB}.tri-task-card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.tri-task-title{font-size:15px;font-weight:900}.tri-task-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.tri-task-pill{display:inline-flex;padding:3px 8px;border-radius:99px;font-size:10px;font-weight:800;background:#F3F4F6;color:#374151}.tri-task-priority{color:#fff}.tri-task-p100{background:#B91C1C}.tri-task-p75{background:#EA580C}.tri-task-p50{background:#2563EB}.tri-task-p0{background:#6B7280}.tri-task-status{background:#E0E7FF;color:#3730A3}.tri-task-body{display:grid;grid-template-columns:1.15fr 1fr;gap:12px;margin-top:11px}.tri-task-box{background:var(--bg);border-radius:9px;padding:10px;font-size:12px;line-height:1.5}.tri-task-box b{display:block;margin-bottom:3px}.tri-task-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}.tri-task-items{margin-top:10px}.tri-task-items summary{cursor:pointer;font-weight:800;color:var(--a)}.tri-task-item{display:grid;grid-template-columns:110px minmax(220px,1fr) 170px 170px;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);font-size:11px}.tri-task-item-status{font-weight:800}.tri-task-ok{color:#166534}.tri-task-bad{color:#B91C1C}.tri-task-wait{color:#9A3412}.tri-task-note{font-size:11px;color:var(--sub);line-height:1.5}.tri-task-banner{display:none;margin-top:9px;padding:10px 12px;border-radius:9px;background:#EFF6FF;border:1px solid #BFDBFE;font-size:12px}.tri-task-group-table{min-width:1050px}.tri-task-rank-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:9px}.tri-task-rank-metric{background:var(--bg);padding:8px;border-radius:8px}.tri-task-rank-metric span{display:block;color:var(--sub);font-size:9px;text-transform:uppercase}.tri-task-rank-metric b{font-size:13px}.tri-task-ai{color:#7C3AED;font-weight:800}
      @media(max-width:1150px){.tri-task-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.tri-task-filters{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:750px){.tri-task-kpis,.tri-task-filters,.tri-task-rank,.tri-task-body{grid-template-columns:1fr}.tri-task-item{grid-template-columns:1fr}.tri-task-rank-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;document.head.appendChild(s);
  }

  function injectUi(){
    if(!canSee())return;
    injectCss();
    const page=document.getElementById('page-triovist');if(!page||document.getElementById('tri-task-card'))return;
    const card=document.createElement('div');card.className='card';card.id='tri-task-card';card.style.marginTop='12px';
    card.innerHTML=`
      <div class="tri-task-head"><div><div class="card-title" style="margin-bottom:3px">🤖 Месячный план по подгруппам 21vek</div><div class="tri-task-note">Выберите менеджера. CRM сама ранжирует товарные подгруппы по потерянному обороту и реализуемости, а внутри каждой задачи показывает конкретные SKU, которые дают основной коммерческий эффект.</div></div><div class="tri-task-tools"><button class="btn-primary" id="tri-task-generate-btn" onclick="triovistTasksGenerateFresh(true)">🤖 Сформировать план по подгруппам</button><button class="btn-secondary" onclick="triovistTasksReload(true)">↻ Обновить список</button></div></div>
      <div class="tri-task-note" style="margin-top:7px"><b>Логика плана:</b> одна задача = одна товарная подгруппа · внутри до 12 приоритетных SKU · 8/10/12/15 задач на месяц · срок — последний день месяца · Витебск обязателен для SKU в работе · Чехов только справочно · группа 900 запрещена · уже отгруженное повторно не ставить · согласованные и взятые в работу задачи при пересборке не изменяются.</div>
      <div id="tri-task-banner" class="tri-task-banner"></div>
      <div style="display:grid;grid-template-columns:minmax(230px,1fr) 160px minmax(220px,1fr);gap:10px;margin:12px 0;align-items:end">
        <div id="tri-task-manager-wrap"><label class="form-label">Менеджер для плана</label><select class="form-input" id="tri-task-manager" onchange="triovistTasksRender()"><option value="all">Выберите менеджера</option><option value="${ALEKS}">Александренко</option><option value="${KRISHTAL}">Кришталь</option></select></div>
        <div id="tri-task-plan-size-wrap"><label class="form-label">Подгрупп в плане</label><select class="form-input" id="tri-task-plan-size"><option value="8">8 задач</option><option value="10" selected>10 задач</option><option value="12">12 задач</option><option value="15">15 задач</option></select></div>
        <div class="tri-task-note" id="tri-task-plan-period" style="padding:10px 12px;background:var(--bg);border-radius:9px">Срок новых задач: конец текущего месяца.</div>
      </div>
      <div id="tri-task-kpis" class="tri-task-kpis"></div>
      <div class="tri-task-filters">
        <div><label class="form-label">Статус</label><select class="form-input" id="tri-task-status" onchange="triovistTasksRender()"><option value="active">Активные</option><option value="all">Все</option><option value="pending_approval">На согласовании</option><option value="new">Новые</option><option value="in_work">В работе</option><option value="awaiting_check">Ожидают проверки</option><option value="partial">Частично</option><option value="overdue">Просроченные</option><option value="not_achieved">Не выполненные</option><option value="verified">Выполненные</option></select></div>
        <div><label class="form-label">Подгруппа</label><select class="form-input" id="tri-task-group" onchange="triovistTasksRender()"><option value="all">Все группы</option></select></div>
        <div><label class="form-label">Тип задачи</label><select class="form-input" id="tri-task-type" onchange="triovistTasksRender()"><option value="all">Все типы</option>${Object.entries(TYPE_LABELS).map(([k,v])=>`<option value="${k}">${h(v)}</option>`).join('')}</select></div>
        <div><label class="form-label">Приоритет</label><select class="form-input" id="tri-task-priority" onchange="triovistTasksRender()"><option value="all">Все</option><option value="90">Критический 90+</option><option value="75">Высокий 75+</option><option value="50">Средний 50+</option><option value="0">Низкий</option></select></div>
        <div><label class="form-label">Поиск</label><input class="form-input" id="tri-task-search" placeholder="SKU, подгруппа, задача" oninput="triovistTasksRender()"></div>
      </div>
      <div class="card-title" style="margin-top:4px">Задачи</div><div id="tri-task-list" style="margin-top:8px"></div>
      <div class="card-title" style="margin-top:14px">Соревнование менеджеров</div><div id="tri-task-ranking" class="tri-task-rank"></div>
      <div class="card-title" style="margin-top:14px">Рост по товарным подгруппам</div><div id="tri-task-groups" style="margin-top:8px"></div>`;
    const stockCard=document.getElementById('tri-stock-card');
    if(stockCard)stockCard.parentNode.insertBefore(card,stockCard);else page.appendChild(card);
    applyAccess();
  }

  function applyAccess(){
    const wrap=document.getElementById('tri-task-manager-wrap'),sel=document.getElementById('tri-task-manager'),genBtn=document.getElementById('tri-task-generate-btn'),sizeWrap=document.getElementById('tri-task-plan-size-wrap');
    if(isTriManager()){if(wrap)wrap.style.display='none';if(sel)sel.value=userEmail();}
    else if(wrap)wrap.style.display='block';
    if(genBtn)genBtn.style.display=isLeader()?'inline-flex':'none';
    if(sizeWrap)sizeWrap.style.display=isLeader()?'block':'none';
    const period=document.getElementById('tri-task-plan-period');
    if(period){const d=new Date(),last=new Date(d.getFullYear(),d.getMonth()+1,0);period.textContent='Срок новых задач: '+String(last.getDate()).padStart(2,'0')+'.'+String(last.getMonth()+1).padStart(2,'0')+'.'+last.getFullYear()+' · пересборка заменяет только несогласованный ИИ-план выбранного менеджера.';}
  }

  function banner(text,kind='info'){
    const el=document.getElementById('tri-task-banner');if(!el)return;
    el.style.display=text?'block':'none';el.textContent=text||'';
    el.style.background=kind==='error'?'#FEF2F2':kind==='ok'?'#F0FDF4':'#EFF6FF';
    el.style.borderColor=kind==='error'?'#FCA5A5':kind==='ok'?'#86EFAC':'#BFDBFE';
    el.style.color=kind==='error'?'#991B1B':kind==='ok'?'#166534':'#1E3A8A';
  }

  function triTaskIs900V22728(t){
    const values=[t?.group_name,t?.category,t?.subgroup,...((t?.items||[]).flatMap(x=>[x?.sku,x?.product_name]))];
    return values.some(v=>/^900(?:\/|$)/i.test(String(v||'').trim())||/(^|[^0-9])900\s*(группа|гр\.?)([^0-9]|$)/i.test(String(v||'')));
  }
  function triTaskAllowedV22728(t){return !!t&&!['answers','delivery'].includes(String(t.task_type||''))&&!triTaskIs900V22728(t);}
  function triShipmentQtyV22728(sku,snapshot){
    const k=skuKey(sku);return triShipmentsV22728.filter(x=>skuKey(x.sku)===k&&(!snapshot||String(x.shipment_date||'')>String(snapshot))).reduce((a,x)=>a+num(x.qty),0);
  }
  function triNoveltyV22728(sku){return triNoveltiesV22728.find(x=>skuKey(x.sku)===skuKey(sku)&&!x.is_legacy)||null;}

  function periodPayload(){
    const mode=document.getElementById('tri-period-mode')?.value||'month';
    const end=document.getElementById('tri-period-month')?.value||currentMonth();
    const start=document.getElementById('tri-period-start')?.value||null;
    return {p_end_month:end,p_mode:mode,p_start_month:mode==='custom'?start:null};
  }

  async function loadCommercial(){
    const since=new Date(Date.now()-45*86400000).toISOString().slice(0,10);
    const [s1,s2,s3,s4]=await Promise.allSettled([
      window.TRIOVIST_DATA_HUB_V227315.sales(periodPayload()),
      window.TRIOVIST_DATA_HUB_V227315.stock({p_target_days:Number(document.getElementById('tri-stock-days')?.value)||45}),
      db.from('triovist_shipments').select('*').gte('shipment_date',since).order('shipment_date',{ascending:false}),
      db.from('triovist_first_positive_stock').select('*').eq('is_legacy',false).order('first_positive_date',{ascending:false}).limit(1000)
    ]);
    sales=s1.status==='fulfilled'?(s1.value||{}):{items:[],period_plans:[],selected_month_plans:[]};
    stock=s2.status==='fulfilled'?(s2.value||{}):{items:[]};
    triShipmentsV22728=s3.status==='fulfilled'?(s3.value?.data||[]):[];
    triNoveltiesV22728=s4.status==='fulfilled'?(s4.value?.data||[]):[];
    stock.items=(stock.items||[]).filter(x=>!triTaskIs900V22728({group_name:x.assigned_group,category:x.category,subgroup:x.subgroup,items:[{sku:x.sku,product_name:x.product}]}));
  }

  // v22.7.30.4 — свежие коммерческие задачи. Важно: это отдельный источник задач,
  // а не фильтр старого генератора карточек. Сервер повторно проверяет все жёсткие правила.
  function triAgeDaysV227304(v){
    if(!v)return 9999;const d=new Date(String(v).length===10?String(v)+'T12:00:00':v);if(Number.isNaN(d.getTime()))return 9999;return Math.floor((Date.now()-d.getTime())/86400000);
  }
  function triPlusDaysV227304(days){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+days);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function triGroup900V227304(v){return /^900(?:\/|$)/i.test(String(v||'').trim())||/(^|[^0-9])900\s*(группа|гр\.?)([^0-9]|$)/i.test(String(v||''));}
  function triContentTaskTypeV227304(issue){
    const t=String(issue?.issue_type||'');
    if(['question_unanswered','no_questions','delivery_minsk_slow'].includes(t))return null;
    if(['listing_outside_top60','listing_31_60'].includes(t))return'listing';
    if(t==='out_of_stock')return'availability';
    if(['no_reviews','low_product_rating','low_last_review','negative_review_unanswered'].includes(t))return'reputation';
    if(['no_video','video_available_not_uploaded','few_photos'].includes(t))return'media';
    if(['no_description','no_warranty'].includes(t))return'content';
    return null;
  }
  function triPriorityLabelV227304(v){return v>=90?'Критический':v>=75?'Высокий':v>=50?'Средний':'Низкий';}
  function triCandidateKeyV227304(manager,sku,reason){return 'v22731|'+String(manager||'').toLowerCase()+'|'+skuKey(sku)+'|'+String(reason||'');}
  function triCandidateBaseV227304(manager,group,sku,product,reason,score,ctx,fields={}){
    const p=Math.max(0,Math.min(100,Math.round(score)));
    return {
      candidate_key:triCandidateKeyV227304(manager,sku,reason),generator_version:'v22.7.31',reason_code:reason,
      manager_email:String(manager||'').toLowerCase(),manager_name:managerName(manager),group_name:group||'Не распределено',sku:String(sku||''),product_name:product||'',
      task_type:fields.task_type||'listing',priority_score:p,base_priority:p,due_date:fields.due_date||triPlusDaysV227304(5),
      title:fields.title||'Коммерческая задача '+sku,task_text:fields.task_text||'',basis:fields.basis||'',expected_result:fields.expected_result||'',criteria:fields.criteria||'',next_step:fields.next_step||'',
      commercial_context:{...(ctx||{}),candidate_key:triCandidateKeyV227304(manager,sku,reason),generator_version:'v22.7.31',reason_code:reason,sku:String(sku||''),product_name:product||'',group_name:group||'Не распределено'}
    };
  }
  async function triBuildFreshCandidatesV227304(){
    const month=currentMonth(),since=new Date(Date.now()-120*86400000).toISOString().slice(0,10);
    const stage=async(label,promise)=>{try{return await promise;}catch(e){throw new Error(label+': '+(e?.message||e));}};
    const [saleData,stockData,contentData,shipRes,novRes]=await Promise.all([
      stage('Продажи 21vek',window.TRIOVIST_DATA_HUB_V227315.sales({p_end_month:month,p_mode:'month',p_start_month:null})),
      stage('Остатки Триовиста',window.TRIOVIST_DATA_HUB_V227315.stock({p_target_days:Number(document.getElementById('tri-stock-days')?.value)||45})),
      stage('Карточки 21vek',window.TRIOVIST_DATA_HUB_V227315.content({p_manager_email:null})).catch(()=>({managers:[],issues:[]})),
      stage('Отгрузки 1С',db.from('triovist_shipments').select('*').gte('shipment_date',since).order('shipment_date',{ascending:false})),
      stage('Реестр новинок',db.from('triovist_first_positive_stock').select('*').eq('is_legacy',false).order('first_positive_date',{ascending:false}).limit(5000))
    ]);
    if(shipRes?.error)throw new Error('Отгрузки 1С: '+(shipRes.error.message||shipRes.error));if(novRes?.error)throw new Error('Реестр новинок: '+(novRes.error.message||novRes.error));
    const last=saleData?.last_import||{},imports=stockData?.imports||{},ownDate=imports?.own?.report_date||'',partnerDate=imports?.partner?.snapshot_date||'';
    const salesMonth=String(last.month||saleData?.end_month||month).slice(0,7),salesAt=last.imported_at||'';
    if(salesMonth!==month)throw new Error('Продажи 21vek не свежие: последний период '+(salesMonth||'не определён')+', нужен '+month+'. Сначала обновите продажи.');
    if(!salesAt||triAgeDaysV227304(salesAt)>3)throw new Error('Продажи 21vek не обновлялись более 3 дней. Сначала запустите импорт продаж.');
    if(!ownDate||triAgeDaysV227304(ownDate)>3)throw new Error('Остаток Витебска старше 3 дней. Свежие задачи не создаются на старом складе.');
    if(!partnerDate||triAgeDaysV227304(partnerDate)>10)throw new Error('Остаток 21vek старше 10 дней. Сначала загрузите свежий недельный файл 21vek.');
    if(typeof window.triovistCommercialEngineV227313!=='function')throw new Error('Коммерческий движок v22.7.31.3 не загружен. Обновите страницу без кэша.');
    // Эти данные уже только что прочитаны для генерации. Сохраняем их в рабочее
    // состояние экрана, чтобы после INSERT не делать второй полный круг RPC.
    sales=saleData;stock=stockData;triShipmentsV22728=shipRes.data||[];triNoveltiesV22728=novRes.data||[];
    stock.items=(stock.items||[]).filter(x=>!triTaskIs900V22728({group_name:x.assigned_group,category:x.category,subgroup:x.subgroup,items:[{sku:x.sku,product_name:x.product}]}));
    const blocked={};MANAGERS.forEach(m=>blocked[m]=new Set());
    (data.tasks||[]).filter(t=>ACTIVE.includes(t.status)&&t.status!=='pending_approval').forEach(t=>{
      const m=String(t.manager_email||'').toLowerCase();if(!blocked[m])return;const ctx=t.commercial_context||{};
      const rows=[...(Array.isArray(t.items)?t.items:[]),...(Array.isArray(ctx.plan_items)?ctx.plan_items:[])];
      rows.forEach(x=>{const k=skuKey(x?.sku);if(k)blocked[m].add(k);});const one=skuKey(ctx.sku||t.sku);if(one)blocked[m].add(one);
    });
    const pack=window.triovistCommercialEngineV227313({salesData:saleData,stockData,contentIssues:contentData?.issues||[],shipments:shipRes.data||[],novelties:novRes.data||[],partnerSnapshotDate:partnerDate,ownReportDate:ownDate,blockedSkusByManager:Object.fromEntries(Object.entries(blocked).map(([m,set])=>[m,[...set]]))});
    return {candidates:pack.candidates,diagnostics:pack.diagnostics,meta:{sales_month:salesMonth,sales_imported_at:salesAt,own_report_date:ownDate,partner_snapshot_date:partnerDate,generated_at:new Date().toISOString(),candidate_count:pack.candidates.length,diagnostics:pack.diagnostics}};
  }


  function triMonthEndV227319(){
    const d=new Date(),last=new Date(d.getFullYear(),d.getMonth()+1,0);
    return last.getFullYear()+'-'+String(last.getMonth()+1).padStart(2,'0')+'-'+String(last.getDate()).padStart(2,'0');
  }

  function triSubgroupPortfolioV227319(candidates,manager,target){
    const all=(candidates||[]).filter(x=>String(x.manager_email||'').toLowerCase()===manager)
      .sort((a,b)=>num(b.priority_score)-num(a.priority_score)||num(b.commercial_context?.actionable_loss)-num(a.commercial_context?.actionable_loss)||num(b.commercial_context?.commercial_value)-num(a.commercial_context?.commercial_value));
    const primary=all.slice(0,target),reserve=all.slice(target,target+5);
    return {primary,rows:[...primary,...reserve],totalCandidates:all.length,reserve:reserve.length};
  }

  async function generateFreshTasksV227314(manual=true){
    if(!isLeader())return;
    const manager=String(document.getElementById('tri-task-manager')?.value||'all').toLowerCase();
    if(!MANAGERS.includes(manager)){
      banner('Сначала выберите менеджера: Александренко или Кришталь. План формируется отдельно для каждого.','error');
      if(manual)alert('Сначала выберите менеджера для месячного плана.');
      return;
    }
    const target=[8,10,12,15].includes(Number(document.getElementById('tri-task-plan-size')?.value))?Number(document.getElementById('tri-task-plan-size').value):10;
    const dueDate=triMonthEndV227319(),name=managerName(manager);
    if(manual&&!confirm('Пересобрать месячный план по подгруппам для '+name+'?\n\nЦель: до '+target+' сильных задач-подгрупп со сроком '+fmtDate(dueDate)+'.\n\nВнутри каждой задачи CRM покажет до 12 приоритетных SKU. Несогласованный старый план этого менеджера будет заменён. Согласованные и выполняемые задачи останутся без изменений.'))return;
    const btn=document.getElementById('tri-task-generate-btn');if(btn)btn.disabled=true;
    try{
      banner('Формирую план '+name+': свежесть данных → продажи/остатки/карточки → агрегация SKU в подгруппы → денежный потенциал → '+target+' приоритетных подгрупп…');
      const pack=await triBuildFreshCandidatesV227304(),d=pack.diagnostics||{};
      const portfolio=triSubgroupPortfolioV227319(pack.candidates,manager,target);
      if(!portfolio.rows.length){
        banner('Для '+name+' не найдено сильных подгрупп. Проверено '+num(d.scanned)+' SKU: без Витебска '+num(d.no_vitebsk)+', уже заняты согласованными задачами '+num(d.blocked_active)+', группа 900 '+num(d.group_900)+', без коммерческого сигнала '+num(d.no_signal)+'.','ok');
        return;
      }
      const planMonth=currentMonth();
      const rows=portfolio.rows.map((x,i)=>({...x,due_date:dueDate,generator_version:'v22.7.31.9',commercial_context:{...(x.commercial_context||{}),plan_month:planMonth,plan_due_date:dueDate,plan_target:target,portfolio_primary:i<portfolio.primary.length,portfolio_rank:i<portfolio.primary.length?i+1:null}}));
      const meta={...pack.meta,generator_version:'v22.7.31.9',plan_month:planMonth,plan_due_date:dueDate,plan_target:target,manager_email:manager,primary_count:portfolio.primary.length,reserve_count:portfolio.reserve};
      const out=await rpc('triovist_tasks_generate_subgroup_v227319',{p_manager_email:manager,p_target_count:target,p_month_end:dueDate,p_rows:rows,p_meta:meta},60000);
      const created=num(out?.created),deleted=num(out?.deleted_pending),archived=num(out?.archived_rule_tasks),locked=num(out?.locked_subgroup_tasks),createdIds=Array.isArray(out?.created_task_ids)?out.created_task_ids.map(String).filter(Boolean):[];
      const skipped=num(out?.skipped_duplicates)+num(out?.skipped_rules);
      const summary=name+': найдено '+portfolio.totalCandidates+' сильных подгрупп → целевой план '+target+' · сохранено согласованных подгрупп '+locked+' · заменено несогласованных '+deleted+(archived?' · архивировано старых правил '+archived:'')+' · создано '+created+(skipped?' · пропущено '+skipped:'')+' · срок '+fmtDate(dueDate);

      window.TRIOVIST_DATA_HUB_V227315.invalidate('tasks');
      const fresh=await window.TRIOVIST_DATA_HUB_V227315.tasks({p_manager_email:null});
      data=fresh||{tasks:[],summary:{},groups:[],managers:[]};data.tasks=(data.tasks||[]).filter(triTaskAllowedV22728);loaded=true;
      const sel=document.getElementById('tri-task-manager');if(sel)sel.value=manager;
      render();

      if(created>0){
        if(createdIds.length!==created){banner(summary+' · ИИ не запущен: сервер вернул '+createdIds.length+' ID из '+created+' новых задач. Базовый план сохранён.','error');return;}
        await maybeAutoAI(true,createdIds,summary);
      }else banner(summary+'. Новых задач не потребовалось.','ok');
    }catch(e){
      console.error(e);banner('План по подгруппам '+name+' не создан: '+(e.message||e),'error');
      if(manual)alert('План Триовиста по подгруппам для '+name+' не сформирован.\n\n'+(e.message||e));
    }finally{if(btn)btn.disabled=false;}
  }
  window.triovistTasksGenerateFresh=generateFreshTasksV227314;

  function contextForTask(t){
    const saved=(t.commercial_context&&typeof t.commercial_context==='object')?t.commercial_context:{};
    const storedItems=Array.isArray(t.items)&&t.items.length?t.items:(Array.isArray(saved.plan_items)?saved.plan_items:[]);
    const skus=new Set(storedItems.map(x=>skuKey(x.sku)).filter(Boolean));
    if(!skus.size&&saved.sku)skus.add(skuKey(saved.sku));
    const groupN=norm(saved.subgroup_name||t.group_name||saved.group_name);
    const manager=String(t.manager_email||'').toLowerCase();
    const managerSalesRows=(sales.items||[]).filter(x=>String(x.manager_email||'').toLowerCase()===manager),managerStockRows=(stock.items||[]).filter(x=>String(x.manager_email||'').toLowerCase()===manager);
    const salesRows=managerSalesRows.filter(x=>skus.size?skus.has(skuKey(x.sku)):norm(x.subgroup||x.category||x.assigned_group)===groupN);
    const stockRows=managerStockRows.filter(x=>skus.size?skus.has(skuKey(x.sku)):norm(x.subgroup||x.category||x.assigned_group)===groupN);
    const subgroupSalesRows=saved.task_scope==='subgroup'?managerSalesRows.filter(x=>norm(x.subgroup||x.category||x.assigned_group)===groupN):salesRows;
    const current=subgroupSalesRows.reduce((a,x)=>a+num(x.current_revenue),0),previous=subgroupSalesRows.reduce((a,x)=>a+num(x.previous_revenue),0);
    const snapshot=stock?.imports?.partner?.snapshot_date||saved.partner_snapshot_date||'';
    const shippedAfter=stockRows.reduce((a,x)=>a+triShipmentQtyV22728(x.sku,snapshot),0),rawRecommended=stockRows.reduce((a,x)=>a+num(x.recommended),0);
    const ctx={...saved,task_id:t.id,current_revenue:current,previous_revenue:previous,loss:Math.max(0,previous-current),partner_total:stockRows.reduce((a,x)=>a+num(x.partner_total),0),own_qty:stockRows.reduce((a,x)=>a+num(x.own_qty),0),chekhov_qty:stockRows.reduce((a,x)=>a+num(x.chekhov_qty),0),shipped_after_snapshot:shippedAfter,recommended_qty:Math.max(0,rawRecommended-shippedAfter),uncovered:stockRows.reduce((a,x)=>a+num(x.uncovered),0),sku_count:skus.size||storedItems.length,plan_items:storedItems};
    if(saved.task_scope==='subgroup'){
      ctx.subgroup_current_revenue=current;ctx.subgroup_previous_revenue=previous;ctx.subgroup_loss=Math.max(0,previous-current);
      t._ctx=ctx;t.commercial_context=ctx;t.priority_score=num(t.base_priority||saved.priority_score||t.priority_score);return ctx;
    }
    let score=num(t.base_priority);if(ctx.loss>0)score+=10;if(ctx.previous_revenue>0&&ctx.current_revenue===0)score+=8;if(ctx.recommended_qty>0&&ctx.own_qty>0)score+=7;if(ctx.partner_total<=0&&ctx.own_qty>0)score+=10;if(ctx.partner_total<=0&&ctx.own_qty<=0)score-=12;
    t._ctx=ctx;t.priority_score=Math.max(0,Math.min(100,score));t.commercial_context=ctx;return ctx;
  }

  async function enrichTasks(){
    if(enrichBusy)return;const rows=(data.tasks||[]).filter(t=>ACTIVE.includes(t.status)).map(contextForTask);if(!rows.length)return;
    enrichBusy=true;try{await rpc('triovist_tasks_enrich_context',{p_rows:rows},60000);}catch(e){console.warn('Не удалось обогатить задачи продажами и остатками',e);}finally{enrichBusy=false;}
  }

  async function loadAll(force=false){
    if(!canSee()||loading||(loaded&&!force))return;
    loading=true;injectUi();banner('Загружаю задачи, продажи и остатки…');
    try{
      const [tasksResult]=await Promise.all([window.TRIOVIST_DATA_HUB_V227315.tasks({p_manager_email:null}),loadCommercial()]);
      data=tasksResult||{tasks:[],summary:{},groups:[],managers:[]};data.tasks=(data.tasks||[]).filter(triTaskAllowedV22728);loaded=true;
      await enrichTasks();
      banner('');render();
      // v22.7.31.4: ИИ запускается только цепочкой кнопки и только для ID новых задач.
    }catch(e){console.error(e);banner('Задачи 21vek пока недоступны: '+(e.message||e),'error');}
    finally{loading=false;}
  }

  function aiSignature(tasks){return tasks.map(t=>t.id+':'+String(t.source_import_id||'')+':'+String(!!t.ai_generated)).sort().join('|');}

  async function callAIForManager(manager,tasks){
    if(!tasks.length)return 0;
    if(typeof _aiUsageToday==='function'&&typeof AI_DAILY_LIMIT!=='undefined'&&_aiUsageToday()>=AI_DAILY_LIMIT)throw new Error('Дневной лимит ИИ исчерпан. Базовые задачи уже созданы и работают.');
    if(typeof _bumpAiUsage==='function')_bumpAiUsage();
    const input=tasks.map(t=>({
      task_id:t.id,manager:managerName(manager),group:t.group_name,type:TYPE_LABELS[t.task_type]||t.task_type,
      priority:t.priority_score,due_date:t.due_date,basis:t.basis,base_task:t.task_text,
      expected_result:t.expected_result,criteria:t.criteria,commercial_context:t._ctx||t.commercial_context||{},
      items:((t.items||[]).length?(t.items||[]):((t._ctx||t.commercial_context||{}).plan_items||[])).slice(0,12).map(x=>({sku:x.sku,product:x.product_name,reason:x.reason_label||x.issue_title,loss:x.loss,current_revenue:x.current_revenue,previous_revenue:x.previous_revenue,stock_21vek:x.partner_total,stock_vitebsk:x.own_qty,problem:x.content_issue_title||'',current:x.current_value,target:x.target_value}))
    }));
    const system='Ты — коммерческий директор крупнейшего интернет-канала 21vek.by для брендов Ресанта, Huter, Вихрь и Eurolux. Входная задача уже выбрана CRM НА УРОВНЕ ТОВАРНОЙ ПОДГРУППЫ. Не превращай её обратно в задачу по одному SKU и не создавай отдельные поручения на каждый товар. Цель — одно сильное коммерческое поручение менеджеру по всей подгруппе до due_date, а массив items — приоритетные SKU внутри этой задачи. Используй только входные факты и цифры. В title обязательно назови подгруппу и коммерческий результат: вернуть продажи / увеличить sell-out / восстановить наличие / усилить видимость. В task_text дай 4–6 действий: сначала отработать SKU в порядке коммерческого эффекта; для SKU с товаром на 21vek и падением продаж работать с sell-out (позиция, цена/SALE, поиск, карточка), без лишней отгрузки; для SKU с 21vek=0 отгружать только из свободного остатка Витебска и не повторять отгрузку, если она уже сделана; исправить отмеченные проблемы карточек; в конце сверить результат подгруппы. Чехов только справочно. Группа 900, вопросы покупателей и доставка запрещены. Не меняй список SKU, due_date, current_revenue, previous_revenue, loss, target_revenue и остатки. basis должен описывать ИМЕННО подгруппу: текущая выручка, аналог, потеря, сколько SKU в работе и какие типы проблем доминируют. expected_result и criteria должны использовать target_revenue подгруппы из commercial_context. Не пиши критерий «продажи > 0», если CRM дала денежную цель. Верни строго JSON-массив без markdown. Для каждой task_id один объект: {"task_id":"uuid","title":"коммерческая цель + подгруппа","task_text":"4-6 конкретных действий по подгруппе","basis":"цифры подгруппы и ключевые SKU","expected_result":"измеримый результат подгруппы к сроку","criteria":"точный критерий проверки","next_step":"следующий шаг, если цель не достигнута"}.'
    const prompt='ЗАДАЧИ ДЛЯ '+managerName(manager)+':\n'+JSON.stringify(input);
    let timer;const timeout=new Promise((_,rej)=>timer=setTimeout(()=>rej(new Error('ИИ не ответил за 70 секунд')),70000));
    try{
      const response=await Promise.race([fetch('https://baqchjtvtmcfzwjjluhs.supabase.co/functions/v1/dynamic-service',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+SUPABASE_KEY},body:JSON.stringify({prompt,system})}),timeout]);
      const out=await response.json();if(out.error)throw new Error(out.error);
      const cleaned=String(out.text||'').trim().replace(/```json|```/g,'').trim();
      const parsed=JSON.parse(cleaned);if(!Array.isArray(parsed))throw new Error('ИИ вернул неожиданный формат');
      const allowed=new Set(tasks.map(t=>String(t.id)));
      const updates=parsed.filter(x=>x&&allowed.has(String(x.task_id))).map(x=>({task_id:x.task_id,title:x.title||'',task_text:x.task_text||'',basis:x.basis||'',expected_result:x.expected_result||'',criteria:x.criteria||'',next_step:x.next_step||''}));
      if(!updates.length)throw new Error('ИИ не вернул задачи');
      return await rpc('triovist_tasks_apply_ai',{p_updates:updates},60000);
    }finally{clearTimeout(timer);}
  }

  async function maybeAutoAI(manual=false,onlyTaskIds=null,summaryPrefix=''){
    if(aiBusy||!isLeader())return 0;
    const ids=Array.isArray(onlyTaskIds)?new Set(onlyTaskIds.map(String).filter(Boolean)):null;
    const pending=(data.tasks||[]).filter(t=>triTaskAllowedV22728(t)&&ACTIVE.includes(t.status)&&!t.ai_generated&&(!ids||ids.has(String(t.id))));
    const prefix=summaryPrefix?summaryPrefix+' · ':'';
    if(!pending.length){if(manual)banner(prefix+(ids?'Новые задачи уже сформулированы ИИ либо не найдены после обновления.':'Все активные задачи уже сформулированы ИИ.'),'ok');return 0;}
    const signature=aiSignature(pending),key='crm_triovist_ai_227314_'+signature;
    if(!manual&&localStorage.getItem(key)==='done')return 0;
    aiBusy=true;const btn=document.getElementById('tri-task-generate-btn');if(btn)btn.disabled=true;
    try{
      banner(prefix+'ИИ формулирует SMART только для '+pending.length+' только что созданных задач. Базовые задачи уже сохранены…');
      let total=0;
      for(const manager of MANAGERS){
        const rows=pending.filter(t=>t.manager_email===manager);
        for(let i=0;i<rows.length;i+=8){const batch=rows.slice(i,i+8);if(batch.length)total+=num(await callAIForManager(manager,batch));}
      }
      localStorage.setItem(key,'done');
      banner(prefix+'ИИ сформулировал '+total+' из '+pending.length+' новых задач. Они находятся «На согласовании» у руководителя.','ok');
      window.TRIOVIST_DATA_HUB_V227315.invalidate('tasks');const fresh=await window.TRIOVIST_DATA_HUB_V227315.tasks({p_manager_email:null});data=fresh||data;await enrichTasks();render();
      return total;
    }catch(e){console.warn(e);banner(prefix+'ИИ не обновил формулировки: '+(e.message||e)+'. Базовые задачи уже созданы и не потеряны.','error');return 0;}
    finally{aiBusy=false;if(btn)btn.disabled=false;}
  }

  function filterTasks(){
    const manager=document.getElementById('tri-task-manager')?.value||'all';
    const status=document.getElementById('tri-task-status')?.value||'active';
    const group=document.getElementById('tri-task-group')?.value||'all';
    const type=document.getElementById('tri-task-type')?.value||'all';
    const priority=document.getElementById('tri-task-priority')?.value||'all';
    const q=norm(document.getElementById('tri-task-search')?.value||'');
    return (data.tasks||[]).filter(t=>manager==='all'||t.manager_email===manager)
      .filter(t=>status==='all'||(status==='active'?ACTIVE.includes(t.status):status==='in_work'?['accepted','in_progress','waiting_21vek'].includes(t.status):t.status===status))
      .filter(t=>group==='all'||t.group_name===group).filter(t=>type==='all'||t.task_type===type)
      .filter(t=>priority==='all'||(priority==='0'?num(t.priority_score)<50:num(t.priority_score)>=num(priority)))
      .filter(t=>{const its=(t.items||[]).length?(t.items||[]):((t.commercial_context||{}).plan_items||[]);return !q||norm([t.title,t.task_text,t.group_name,t.manager_name,...its.flatMap(x=>[x.sku,x.product_name,x.issue_title])].join(' ')).includes(q);});
  }

  function fillGroupFilter(){
    const sel=document.getElementById('tri-task-group');if(!sel)return;const old=sel.value||'all';
    const groups=[...new Set((data.tasks||[]).map(x=>x.group_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
    sel.innerHTML='<option value="all">Все подгруппы</option>'+groups.map(g=>'<option value="'+ha(g)+'">'+h(g)+'</option>').join('');if(groups.includes(old))sel.value=old;
  }

  function managerSales(email){const rows=(sales.items||[]).filter(x=>String(x.manager_email||'').toLowerCase()===email);return{cur:rows.reduce((s,x)=>s+num(x.current_revenue),0),prev:rows.reduce((s,x)=>s+num(x.previous_revenue),0)};}
  function managerPlan(email){const arr=[...(sales.period_plans||[]),...(sales.selected_month_plans||[])];const x=arr.find(p=>String(p.manager_email||'').toLowerCase()===email);return x?.plan_amount==null?null:num(x.plan_amount);}

  function rankingHtml(){
    const managerView=isTriManager();
    const rows=MANAGERS.map(email=>{
      const meta=(data.managers||[]).find(x=>x.manager_email===email)||{};const s=managerSales(email),plan=managerPlan(email);
      const top30=num(meta.cards)>0?num(meta.top30)/num(meta.cards)*100:0,taskTotal=num(meta.verified_tasks)+num(meta.active_tasks)+num(meta.overdue_tasks)+num(meta.not_achieved_tasks),taskRate=taskTotal>0?num(meta.verified_tasks)/taskTotal*100:0;
      const planScore=plan>0?Math.min(120,s.cur/plan*100):Math.max(0,Math.min(100,50+pct(s.cur,s.prev)));
      const growthScore=Math.max(0,Math.min(100,50+pct(s.cur,s.prev)));
      const score=Math.round(managerView?(taskRate*.6+top30*.4):(planScore*.45+growthScore*.25+taskRate*.2+top30*.1));
      return{email,name:managerName(email),...meta,...s,plan,top30,taskRate,score};
    }).sort((a,b)=>b.score-a.score);
    return rows.map((x,i)=>{const salesVisible=isLeader()||x.email===userEmail();return '<div class="tri-task-rank-card"><div class="tri-task-rank-head"><div><b>'+(i+1)+' место · '+h(x.name)+'</b><div class="tri-task-note">'+(managerView?'Рейтинг: подтверждённые задачи и доля карточек в ТОП-30':'Рейтинг: продажи, рост, подтверждённые задачи и ТОП-30')+'</div></div><div class="tri-task-score">'+x.score+'</div></div><div class="tri-task-rank-metrics"><div class="tri-task-rank-metric"><span>Продажи</span><b>'+(salesVisible?money(x.cur):'общий KPI')+'</b></div><div class="tri-task-rank-metric"><span>План</span><b>'+(salesVisible?(x.plan==null?'не задан':money(x.plan)):'общий KPI')+'</b></div><div class="tri-task-rank-metric"><span>ТОП-30</span><b>'+x.top30.toFixed(1)+'%</b></div><div class="tri-task-rank-metric"><span>Задачи</span><b>'+num(x.verified_tasks)+' ✓ / '+num(x.not_achieved_tasks)+' не вып.</b></div></div></div>';}).join('');
  }

  function groupRows(){
    const map=new Map();
    (sales.items||[]).forEach(x=>{const m=String(x.manager_email||'').toLowerCase(),name=x.subgroup||x.category||x.assigned_group||'Прочее',key=m+'|'+norm(name);let g=map.get(key);if(!g){g={manager_email:m,manager_name:managerName(m),group_name:name,parent_group:x.assigned_group||x.category||'',cur:0,prev:0,skus:new Set(),active_tasks:0,verified_tasks:0};map.set(key,g);}g.cur+=num(x.current_revenue);g.prev+=num(x.previous_revenue);if(x.sku)g.skus.add(skuKey(x.sku));});
    (data.tasks||[]).forEach(t=>{const key=String(t.manager_email||'').toLowerCase()+'|'+norm(t.group_name),g=map.get(key);if(!g)return;if(ACTIVE.includes(t.status))g.active_tasks++;if(t.status==='verified')g.verified_tasks++;});
    return [...map.values()].map(g=>({...g,sku_count:g.skus.size})).sort((a,b)=>Math.max(0,b.prev-b.cur)-Math.max(0,a.prev-a.cur)||b.cur-a.cur);
  }

  function actionButtons(t){
    const b=[];
    if(isLeader()){
      if(t.status==='pending_approval')b.push(['approve','✅ Согласовать','btn-primary']);
      if(!CLOSED.includes(t.status))b.push(['edit','✏️ Изменить','btn-secondary']);
      if(!CLOSED.includes(t.status))b.push(['cancel','✕ Отменить','btn-secondary']);
    }else if(t.manager_email===userEmail()){
      if(t.status==='new')b.push(['accept','Принять','btn-primary']);
      if(t.status==='accepted')b.push(['start','Начать','btn-primary']);
      if(['in_progress','partial','overdue'].includes(t.status))b.push(['waiting_21vek','Ожидаю 21vek','btn-secondary']);
      if(['in_progress','waiting_21vek','partial','overdue'].includes(t.status))b.push(['submit_check','Отправить на проверку','btn-primary']);
      if(['partial','overdue'].includes(t.status))b.push(['continue','Продолжить работу','btn-secondary']);
      if(!CLOSED.includes(t.status))b.push(['comment','Комментарий / подтверждение','btn-secondary']);
    }
    return b.map(([a,l,c])=>'<button class="'+c+'" onclick="triovistTaskAction(\''+t.id+'\',\''+a+'\')">'+l+'</button>').join('');
  }

  function triPlanItemLiveV227319(x,manager){
    const k=skuKey(x?.sku),sr=(sales.items||[]).filter(r=>String(r.manager_email||'').toLowerCase()===manager&&skuKey(r.sku)===k),st=(stock.items||[]).find(r=>String(r.manager_email||'').toLowerCase()===manager&&skuKey(r.sku)===k)||(stock.items||[]).find(r=>skuKey(r.sku)===k);
    const cur=sr.reduce((a,r)=>a+num(r.current_revenue),0),prev=sr.reduce((a,r)=>a+num(r.previous_revenue),0),curQty=sr.reduce((a,r)=>a+num(r.current_qty),0),partner=num(st?.partner_total),own=num(st?.own_qty),days=st?.stock_days==null?null:num(st.stock_days),reason=String(x?.reason_code||'');
    let status=String(x?.item_status||'open');
    if(['lost_sales','falling_sales'].includes(reason)&&num(x.target_revenue)>0)status=cur>=num(x.target_revenue)?'verified':'open';
    else if(reason==='no_stock_21vek')status=partner>0?'verified':'open';
    else if(reason==='low_stock_21vek')status=(days!=null&&days>=num(x.target_stock_days||14))?'verified':'open';
    else if(reason==='novelty')status=curQty>=num(x.target_qty||1)?'verified':'open';
    const current='Продажи '+money(cur)+' · 21vek '+qty(partner)+' · Витебск '+qty(own)+(days==null?'':' · запас '+qty(days)+' дн.');
    return {...x,item_status:status,current_value:current,live_current_revenue:cur,live_previous_revenue:prev,live_partner_total:partner,live_own_qty:own};
  }

  function taskHtml(t){
    const p=num(t.priority_score),pc=p>=90?'tri-task-p100':p>=75?'tri-task-p75':p>=50?'tri-task-p50':'tri-task-p0',ctx=t._ctx||t.commercial_context||{},manager=String(t.manager_email||'').toLowerCase();
    let items=(t.items||[]).length?(t.items||[]):(Array.isArray(ctx.plan_items)?ctx.plan_items:[]);
    if(ctx.task_scope==='subgroup')items=items.map(x=>triPlanItemLiveV227319(x,manager));
    else if(!items.length){const fallbackSku=ctx.sku||t.sku||'';if(fallbackSku)items=[{sku:fallbackSku,product_name:ctx.product_name||t.product_name||'',issue_title:ctx.content_issue_title||ctx.strategy_label||t.title,current_value:ctx.current_value||('21vek '+qty(ctx.partner_total)+' шт.'),target_value:ctx.target_value||ctx.target_metric||t.expected_result,item_status:'open',donor_article:ctx.donor_article||'',product_url:ctx.product_url||''}];}
    const verified=items.filter(x=>x.item_status==='verified').length;
    const itemHtml=items.map((x,i)=>{const cls=x.item_status==='verified'?'tri-task-ok':x.item_status==='missing'?'tri-task-wait':'tri-task-bad',label=x.item_status==='verified'?'Цель достигнута':x.item_status==='missing'?'Нет в новом отчёте':'В работе';return '<div class="tri-task-item"><div><b>'+(i+1)+'. '+h(x.sku||'—')+'</b><div class="tri-task-note">21vek '+h(x.donor_article||'—')+'</div></div><div>'+h(x.product_name||'Товар')+'<div class="tri-task-note"><b>'+h(x.reason_label||x.issue_title||'Приоритетный SKU')+'</b></div>'+(x.content_issue_title?'<div class="tri-task-note">Карточка: '+h(x.content_issue_title)+'</div>':'')+(x.product_url?'<a href="'+ha(x.product_url)+'" target="_blank" rel="noopener">Открыть карточку</a>':'')+'</div><div><span class="'+cls+' tri-task-item-status">'+label+'</span><div class="tri-task-note">Сейчас: '+h(x.current_value||'—')+'</div></div><div><b>Цель SKU</b><div class="tri-task-note">'+h(x.target_value||'—')+'</div></div></div>';}).join('');
    const reasonLabel=ctx.task_scope==='subgroup'?(ctx.strategy_label||'План подгруппы'):(({lost_sales:'Возврат продаж',no_stock_21vek:'Нет наличия 21vek',novelty:'Новинка',falling_sales:'Падение SKU',low_stock_21vek:'Низкий запас'}[ctx.reason_code]||ctx.content_issue_title||ctx.reason_code));
    const parentPill=ctx.parent_group&&norm(ctx.parent_group)!==norm(t.group_name)?'<span class="tri-task-pill">'+h(ctx.parent_group)+'</span>':'';
    const cur=ctx.subgroup_current_revenue==null?ctx.current_revenue:ctx.subgroup_current_revenue,prev=ctx.subgroup_previous_revenue==null?ctx.previous_revenue:ctx.subgroup_previous_revenue,loss=ctx.subgroup_loss==null?ctx.loss:ctx.subgroup_loss;
    const scopeNote=ctx.task_scope==='subgroup'?'<div class="tri-task-note" style="margin-top:5px">В работу отобрано: '+items.length+' SKU · потерянные '+num(ctx.lost_sku_count)+' · падающие '+num(ctx.falling_sku_count)+' · без наличия 21vek '+num(ctx.no_stock_sku_count)+' · проблемы карточек '+num(ctx.content_issue_count)+' · новинки '+num(ctx.novelty_count)+'.</div>':'';
    return '<div class="tri-task-card '+h(t.status)+'"><div class="tri-task-card-head"><div><div class="tri-task-title">'+h(t.title)+'</div><div class="tri-task-meta"><span class="tri-task-pill tri-task-priority '+pc+'">'+p+'/100 · '+h(triPriorityLabelV227304(p))+'</span><span class="tri-task-pill tri-task-status">'+h(STATUS_LABELS[t.status]||t.status)+'</span><span class="tri-task-pill">'+h(t.manager_name)+'</span>'+parentPill+'<span class="tri-task-pill">'+h(t.group_name)+'</span><span class="tri-task-pill">до '+fmtDate(t.due_date)+'</span>'+(reasonLabel?'<span class="tri-task-pill">'+h(reasonLabel)+'</span>':'')+(t.ai_generated?'<span class="tri-task-pill tri-task-ai">🤖 ИИ</span>':'<span class="tri-task-pill">правило CRM</span>')+'</div></div><div style="text-align:right"><b>'+verified+' / '+items.length+'</b><div class="tri-task-note">SKU достигли цели</div></div></div><div class="tri-task-body"><div><div class="tri-task-box"><b>Что сделать</b>'+h(t.task_text||'—').replace(/\n/g,'<br>')+'</div><div class="tri-task-box" style="margin-top:8px"><b>Основание</b>'+h(t.basis||'—')+'<div class="tri-task-note" style="margin-top:5px">Подгруппа: продажи '+money(cur)+' · аналог '+money(prev)+' · потеря '+money(loss)+'</div><div class="tri-task-note">SKU в работе: 21vek '+qty(ctx.partner_total)+' шт. · Витебск '+qty(ctx.own_qty)+' · Чехов '+qty(ctx.chekhov_qty)+' (справочно)</div>'+scopeNote+'</div></div><div><div class="tri-task-box"><b>Ожидаемый результат</b>'+h(t.expected_result||'—')+'</div><div class="tri-task-box" style="margin-top:8px"><b>Критерий</b>'+h(t.criteria||'—')+'</div>'+(t.result_summary?'<div class="tri-task-box" style="margin-top:8px"><b>Последняя проверка</b>'+h(t.result_summary)+'</div>':'')+(t.manager_comment?'<div class="tri-task-box" style="margin-top:8px"><b>Комментарий менеджера</b>'+h(t.manager_comment)+'</div>':'')+(t.leader_comment?'<div class="tri-task-box" style="margin-top:8px"><b>Комментарий руководителя</b>'+h(t.leader_comment)+'</div>':'')+'</div></div><details class="tri-task-items"><summary>Показать приоритетные SKU и результат проверки ('+items.length+')</summary>'+itemHtml+'</details><div class="tri-task-actions">'+actionButtons(t)+'</div></div>';
  }

  function render(){
    if(!canSee())return;injectUi();applyAccess();fillGroupFilter();
    const s=data.summary||{};
    const k=document.getElementById('tri-task-kpis'),r=document.getElementById('tri-task-ranking'),g=document.getElementById('tri-task-groups'),l=document.getElementById('tri-task-list');if(!k||!r||!g||!l)return;
    k.innerHTML=[['На согласовании',s.pending_approval],['Активные',s.active],['Частично',s.partial],['Просрочено',s.overdue],['Не выполнено',s.not_achieved],['Подтверждено',s.verified],['Ждут ИИ',s.ai_pending]].map(([a,b])=>'<div class="tri-task-kpi"><span>'+a+'</span><b>'+num(b).toLocaleString('ru-RU')+'</b></div>').join('');
    r.innerHTML=rankingHtml();
    const groups=groupRows().filter(x=>isLeader()||(x.manager_email===userEmail()));
    g.innerHTML=groups.length?'<div class="tri-table-wrap"><table class="tri-table tri-task-group-table"><thead><tr><th>Менеджер</th><th>Подгруппа</th><th>Продажи</th><th>Аналог</th><th>Динамика</th><th>Потеря</th><th>SKU</th><th>Задачи</th></tr></thead><tbody>'+groups.map(x=>'<tr><td><b>'+h(x.manager_name||managerName(x.manager_email))+'</b></td><td><b>'+h(x.group_name)+'</b>'+(x.parent_group?'<div class="tri-task-note">'+h(x.parent_group)+'</div>':'')+'</td><td>'+money(x.cur)+'</td><td>'+money(x.prev)+'</td><td style="color:'+(pct(x.cur,x.prev)<0?'var(--r)':'var(--g)')+'">'+(pct(x.cur,x.prev)>0?'+':'')+pct(x.cur,x.prev).toFixed(1)+'%</td><td>'+money(Math.max(0,x.prev-x.cur))+'</td><td>'+num(x.sku_count)+'</td><td>'+num(x.active_tasks)+' актив. · '+num(x.verified_tasks)+' ✓</td></tr>').join('')+'</tbody></table></div>':'<div class="tri-empty">Нет данных по подгруппам.</div>';
    const rows=filterTasks().filter(triTaskAllowedV22728);l.innerHTML=rows.length?rows.map(taskHtml).join(''):'<div class="tri-empty">По выбранным фильтрам задач нет.</div>';
  }

  window.triovistTasksReload=async function(force=true){if(force)window.TRIOVIST_DATA_HUB_V227315?.invalidate('tasks');loaded=false;await loadAll(force);};
  window.triovistTasksEnsureLoaded=async function(){await loadAll(false);};
  window.triovistTasksRender=render;
  window.triovistTasksRunAI=async function(){await maybeAutoAI(true);};

  window.triovistTaskAction=async function(id,action){
    const t=(data.tasks||[]).find(x=>String(x.id)===String(id));if(!t)return;
    const payload={};
    if(action==='cancel'&&!confirm('Отменить задачу «'+t.title+'»?'))return;
    if(action==='approve'&&!confirm('Согласовать задачу и отправить менеджеру?'))return;
    if(action==='edit'){
      const title=prompt('Название задачи:',t.title||'');if(title===null)return;
      const taskText=prompt('Что должен сделать менеджер:',t.task_text||'');if(taskText===null)return;
      const expected=prompt('Ожидаемый результат:',t.expected_result||'');if(expected===null)return;
      const criteria=prompt('Критерий подтверждения:',t.criteria||'');if(criteria===null)return;
      const due=prompt('Срок YYYY-MM-DD:',String(t.due_date||'').slice(0,10));if(due===null)return;
      payload.title=title;payload.task_text=taskText;payload.expected_result=expected;payload.criteria=criteria;payload.due_date=due;
      const comment=prompt('Комментарий руководителя (необязательно):',t.leader_comment||'');if(comment!==null)payload.comment=comment;
    }
    if(action==='comment'||action==='waiting_21vek'||action==='submit_check'){
      const comment=prompt(action==='submit_check'?'Что сделано и чем подтверждается?':'Комментарий по задаче:',t.manager_comment||'');if(comment===null)return;payload.comment=comment;
      if(action==='submit_check'){const proof=prompt('Ссылка на подтверждение или документ (необязательно):',t.proof_url||'');if(proof!==null)payload.proof_url=proof;}
    }
    try{banner('Сохраняю действие по задаче…');await rpc('triovist_tasks_action',{p_task_id:id,p_action:action,p_payload:payload},45000);banner('Действие сохранено.','ok');window.TRIOVIST_DATA_HUB_V227315?.invalidate('tasks');loaded=false;await loadAll(true);}catch(e){banner('Не удалось изменить задачу: '+(e.message||e),'error');}
  };

  const baseRender=window.renderTriovist;
  window.renderTriovist=function(){const out=baseRender?.apply(this,arguments);injectUi();const pane=document.getElementById('tri-v22728-pane-tasks');if(pane?.classList.contains('active')){if(loaded)render();else setTimeout(()=>loadAll(false),0);}return out;};
  const baseReload=window.triovistReload;
  window.triovistReload=async function(){const out=await baseReload?.apply(this,arguments);loaded=false;const pane=document.getElementById('tri-v22728-pane-tasks');if(pane?.classList.contains('active'))await loadAll(true);return out;};
  const baseLoad=window.loadData;
  window.loadData=async function(){return await baseLoad.apply(this,arguments);};
  const baseGo=window.goPage;
  window.goPage=function(page,title){return baseGo.apply(this,arguments);};
  const baseContentUpload=window.triovistContentUpload;
  if(typeof baseContentUpload==='function')window.triovistContentUpload=async function(manager,event){const out=await baseContentUpload.apply(this,arguments);loaded=false;await loadAll(true);return out;};

  injectUi();
  window.RESANTA_V2266=Object.freeze({version:'v22.7.31.9',monthlyPlanTarget:[8,10,12,15],taskScope:'subgroup',maxItemsPerSubgroup:12,leaderApproval:true,aiSmartText:true,commercialContext:true,autoVerificationByNextExcel:true,managerCompetition:true,managerSpecificGeneration:true,monthEndDueDate:true,vitebskOnlyTaskBasis:true,chekhovInformationalOnly:true,forbidBuyerQuestions:true,forbidDelivery:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 26 ===== */
// ============================================================================
// RESANTA CRM v22.6.7 · Триовист / 21vek.by — мотивация 1,5% + KPI до 0,5%.
// Предварительный расчёт по плану, росту групп, подтверждённым задачам и
// общему результату Триовист. Задачи подняты выше коммерческой аналитики.
// ============================================================================
(function(){
  'use strict';
  const VERSION='22.6.7';
  const ALEKS='aleksandrenko_av@resanta.ru';
  const KRISHTAL='krishtal_na@resanta.ru';
  const MANAGERS=[ALEKS,KRISHTAL];
  const LEADERS=['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru'];
  let motPolicy=null,motTasks={tasks:[],managers:[]},motSales={items:[],period_plans:[],selected_month_plans:[]};
  let motLoaded=false,motLoading=false;

  const email=()=>String(currentProfile?.email||currentUser?.email||'').trim().toLowerCase();
  const isLeader=()=>currentProfile?.role==='boss'&&LEADERS.includes(email());
  const isManager=()=>String(currentProfile?.access_scope||'').toLowerCase()==='triovist'&&MANAGERS.includes(email());
  const canSee=()=>isLeader()||isManager();
  const h=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const num=v=>Number(v)||0;
  const managerName=e=>String(e||'').toLowerCase()===ALEKS?'Александренко':String(e||'').toLowerCase()===KRISHTAL?'Кришталь':'—';
  const money=v=>num(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
  const rateFmt=v=>(num(v)*100).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
  const pctFmt=v=>(num(v)>0?'+':'')+num(v).toLocaleString('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
  const currentMonth=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');};
  const selectedMonth=()=>document.getElementById('tri-period-month')?.value||currentMonth();
  const rpc=async(name,args={},timeout=60000)=>{let timer;const wait=new Promise((_,rej)=>timer=setTimeout(()=>rej(new Error('Сервер не ответил вовремя: '+name)),timeout));try{const r=await Promise.race([db.rpc(name,args),wait]);if(r?.error)throw r.error;return r?.data;}finally{clearTimeout(timer);}};

  function injectCss(){
    if(document.getElementById('tri-mot-v2267-css'))return;
    const s=document.createElement('style');s.id='tri-mot-v2267-css';s.textContent=`
      .tri-mot-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}.tri-mot-note{font-size:11px;color:var(--sub);line-height:1.5}.tri-mot-banner{display:none;margin-top:9px;padding:10px 12px;border:1px solid #BFDBFE;background:#EFF6FF;border-radius:9px;font-size:12px}.tri-mot-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:12px}.tri-mot-manager{border:1px solid var(--border);border-radius:12px;padding:14px;background:#fff}.tri-mot-manager.me{border-color:#93C5FD;background:#F8FBFF}.tri-mot-manager-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.tri-mot-rate{font-size:25px;font-weight:900;color:var(--a);white-space:nowrap}.tri-mot-subrate{font-size:10px;color:var(--sub);text-align:right}.tri-mot-planline{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;margin-top:12px}.tri-mot-bar{height:10px;border-radius:99px;background:#E5E7EB;overflow:hidden;margin-top:6px}.tri-mot-bar>span{display:block;height:100%;background:linear-gradient(90deg,#2563EB,#16A34A);border-radius:99px}.tri-mot-breakdown{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:12px}.tri-mot-part{background:var(--bg);border-radius:9px;padding:10px}.tri-mot-part span{display:block;color:var(--sub);font-size:9px;text-transform:uppercase;font-weight:700}.tri-mot-part b{display:block;font-size:15px;margin-top:4px}.tri-mot-part small{display:block;color:var(--sub);font-size:9px;margin-top:3px}.tri-mot-foot{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:11px;padding-top:10px;border-top:1px solid var(--border)}.tri-mot-pace{font-weight:800}.tri-mot-good{color:#166534}.tri-mot-warn{color:#9A3412}.tri-mot-bad{color:#B91C1C}.tri-mot-team-unknown{background:#FFF7ED;border:1px solid #FDBA74;color:#9A3412;border-radius:8px;padding:8px 10px;margin-top:10px;font-size:10px}.tri-mot-policy{margin-top:12px;padding:10px 12px;border-radius:9px;background:#F5F3FF;border:1px solid #DDD6FE;color:#5B21B6;font-size:11px;line-height:1.5}
      @media(max-width:1050px){.tri-mot-grid{grid-template-columns:1fr}.tri-mot-breakdown{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:650px){.tri-mot-breakdown{grid-template-columns:1fr}.tri-mot-planline{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }

  function injectUi(){
    if(!canSee())return;
    injectCss();
    const page=document.getElementById('page-triovist');if(!page)return;
    let card=document.getElementById('tri-motivation-card');
    if(!card){
      card=document.createElement('div');card.className='card';card.id='tri-motivation-card';card.style.marginBottom='12px';
      card.innerHTML=`<div class="tri-mot-head"><div><div class="card-title" style="margin-bottom:3px">💰 Мотивация: 1,5% + KPI до 0,5%</div><div class="tri-mot-note">Предварительный расчёт за выбранный месяц. Максимум на выходе — 2,00%. Зарплатный KPI по задачам начисляется только после подтверждения результата свежим Excel.</div></div><button class="btn-secondary" onclick="triovistMotivationReload(true)">↻ Обновить мотивацию</button></div><div id="tri-mot-banner" class="tri-mot-banner"></div><div id="tri-mot-grid" class="tri-mot-grid"></div><div id="tri-mot-policy" class="tri-mot-policy"></div>`;
      const plans=document.getElementById('tri-plans-card');
      if(plans)plans.insertAdjacentElement('afterend',card);else document.getElementById('tri-manager-cards')?.insertAdjacentElement('afterend',card);
    }
    moveTasksHigher();
  }

  function moveTasksHigher(){
    const mot=document.getElementById('tri-motivation-card'),task=document.getElementById('tri-task-card');
    if(mot&&task&&mot.nextElementSibling!==task)mot.insertAdjacentElement('afterend',task);
  }

  function banner(text,kind='info'){
    const el=document.getElementById('tri-mot-banner');if(!el)return;
    el.style.display=text?'block':'none';el.textContent=text||'';
    el.style.background=kind==='error'?'#FEF2F2':kind==='ok'?'#F0FDF4':'#EFF6FF';
    el.style.borderColor=kind==='error'?'#FCA5A5':kind==='ok'?'#86EFAC':'#BFDBFE';
    el.style.color=kind==='error'?'#991B1B':kind==='ok'?'#166534':'#1E3A8A';
  }

  function monthFactor(month){
    const m=String(month||'').match(/^(\d{4})-(\d{2})$/);if(!m)return 1;
    const y=Number(m[1]),mo=Number(m[2]),now=new Date(),cur=now.getFullYear()*12+now.getMonth(),sel=y*12+mo-1;
    if(sel<cur)return 1;if(sel>cur)return 0;
    return Math.max(0.01,Math.min(1,now.getDate()/new Date(y,mo,0).getDate()));
  }

  function planFor(manager){
    const selected=(motSales.selected_month_plans||[]).find(x=>String(x.manager_email||'').toLowerCase()===manager);
    if(selected?.plan_amount!=null)return num(selected.plan_amount);
    const period=(motSales.period_plans||[]).find(x=>String(x.manager_email||'').toLowerCase()===manager);
    return period?.plan_amount==null?null:num(period.plan_amount);
  }

  function salesFor(manager){
    const rows=(motSales.items||[]).filter(x=>String(x.manager_email||'').toLowerCase()===manager);
    return{rows,current:rows.reduce((s,x)=>s+num(x.current_revenue),0),previous:rows.reduce((s,x)=>s+num(x.previous_revenue),0)};
  }

  function rateBy(value,thresholds,maxRate){
    const rows=Array.isArray(thresholds)?thresholds:[];
    const row=rows.find(x=>num(value)>=num(x.from)&&num(value)<=num(x.to));
    return Math.min(num(maxRate),Math.max(0,num(row?.rate)));
  }

  function taskWeight(t){const p=num(t.base_priority||t.priority_score);return p>=90?5:p>=75?3:p>=50?2:1;}
  function verifiedItemRatio(t){const total=num(t.item_count)||(t.items||[]).length,ok=num(t.verified_item_count)||(t.items||[]).filter(x=>x.item_status==='verified').length;return total>0?Math.max(0,Math.min(1,ok/total)):0;}
  function salaryTaskRatio(t){if(t.status==='verified')return 1;if(t.status==='partial')return verifiedItemRatio(t);return 0;}
  function progressTaskRatio(t){
    if(t.status==='partial')return Math.max(.5,verifiedItemRatio(t));
    const raw=motPolicy?.task_progress_weights?.[t.status];return Math.max(0,Math.min(1,num(raw)/100));
  }

  function taskMetrics(manager){
    const all=(motTasks.tasks||[]).filter(t=>String(t.manager_email||'').toLowerCase()===manager).filter(t=>!['cancelled','not_relevant'].includes(t.status));
    const salaryEligible=all.filter(t=>t.status!=='pending_approval');
    let denom=0,earned=0,progressDenom=0,progress=0;
    salaryEligible.forEach(t=>{const w=taskWeight(t);denom+=w;earned+=w*salaryTaskRatio(t);});
    all.forEach(t=>{const w=taskWeight(t);progressDenom+=w;progress+=w*progressTaskRatio(t);});
    return{
      total:all.length,pending:all.filter(t=>t.status==='pending_approval').length,verified:all.filter(t=>t.status==='verified').length,
      partial:all.filter(t=>t.status==='partial').length,overdue:all.filter(t=>t.status==='overdue').length,
      criticalOverdue:all.filter(t=>t.status==='overdue'&&num(t.base_priority||t.priority_score)>=90).length,
      salaryRate:denom>0?earned/denom*100:0,progressRate:progressDenom>0?progress/progressDenom*100:0
    };
  }

  function managerResult(manager,team){
    const s=salesFor(manager),plan=planFor(manager),factor=monthFactor(selectedMonth());
    const planPct=plan>0?s.current/plan*100:0;
    const expected=plan>0?plan*factor:0,pacePct=expected>0?s.current/expected*100:0;
    const forecastSales=factor>0&&factor<1?s.current/factor:s.current,forecastPlanPct=plan>0?forecastSales/plan*100:0;
    const growthPct=s.previous>0?(s.current-s.previous)/s.previous*100:(s.current>0?100:0);
    const tm=taskMetrics(manager);
    const planAdd=rateBy(planPct,motPolicy.plan_thresholds,motPolicy.plan_kpi_max);
    const forecastPlanAdd=rateBy(forecastPlanPct,motPolicy.plan_thresholds,motPolicy.plan_kpi_max);
    const growthAdd=rateBy(growthPct,motPolicy.growth_thresholds,motPolicy.growth_kpi_max);
    const taskAdd=rateBy(tm.salaryRate,motPolicy.task_thresholds,motPolicy.task_kpi_max);
    const forecastTaskAdd=rateBy(tm.progressRate,motPolicy.task_thresholds,motPolicy.task_kpi_max);
    const personal=planAdd+growthAdd+taskAdd,forecastPersonal=forecastPlanAdd+growthAdd+forecastTaskAdd;
    const teamAdd=team.known&&team.actualPlanPct>=100&&team.criticalOverdue===0?num(motPolicy.team_kpi_max):0;
    const forecastTeamAdd=team.known&&team.forecastPlanPct>=100&&team.criticalOverdue===0?num(motPolicy.team_kpi_max):0;
    return{manager,name:managerName(manager),...s,plan,planPct,expected,pacePct,forecastSales,forecastPlanPct,growthPct,tm,planAdd,forecastPlanAdd,growthAdd,taskAdd,forecastTaskAdd,teamAdd,forecastTeamAdd,teamKnown:team.known,currentRate:num(motPolicy.base_rate)+personal+(team.known?teamAdd:0),forecastRate:num(motPolicy.base_rate)+forecastPersonal+(team.known?forecastTeamAdd:0),currentRateMax:num(motPolicy.base_rate)+personal+num(motPolicy.team_kpi_max),forecastRateMax:num(motPolicy.base_rate)+forecastPersonal+num(motPolicy.team_kpi_max)};
  }

  function teamMetrics(){
    const sales=MANAGERS.map(m=>salesFor(m)),plans=MANAGERS.map(m=>planFor(m)),factor=monthFactor(selectedMonth());
    const known=isLeader()&&plans.every(p=>p!=null&&p>0);
    const current=sales.reduce((a,x)=>a+x.current,0),plan=plans.reduce((a,x)=>a+(x||0),0),forecast=factor>0&&factor<1?current/factor:current;
    const criticalOverdue=MANAGERS.reduce((a,m)=>a+taskMetrics(m).criticalOverdue,0);
    return{known,current,plan,actualPlanPct:known&&plan>0?current/plan*100:0,forecastPlanPct:known&&plan>0?forecast/plan*100:0,criticalOverdue};
  }

  function progressClass(v){return v>=100?'tri-mot-good':v>=85?'tri-mot-warn':'tri-mot-bad';}

  function managerHtml(x){
    const mine=x.manager===email(),showMoney=isLeader()||mine,bar=Math.max(0,Math.min(100,x.planPct));
    const currentLabel=x.teamKnown?rateFmt(x.currentRate):(rateFmt(x.currentRate)+'–'+rateFmt(x.currentRateMax));
    const forecastLabel=x.teamKnown?rateFmt(x.forecastRate):(rateFmt(x.forecastRate)+'–'+rateFmt(x.forecastRateMax));
    return `<div class="tri-mot-manager ${mine?'me':''}"><div class="tri-mot-manager-head"><div><div style="font-size:17px;font-weight:900">${h(x.name)}${mine?' · мой результат':''}</div><div class="tri-mot-note">База ${rateFmt(motPolicy.base_rate)} · KPI максимум ${rateFmt(motPolicy.max_kpi_rate)}</div></div><div><div class="tri-mot-rate">${currentLabel}</div><div class="tri-mot-subrate">предварительно сейчас<br>прогноз ${forecastLabel}</div></div></div>
      <div class="tri-mot-planline"><div><b>План выполнен на <span class="${progressClass(x.planPct)}">${x.planPct.toFixed(1)}%</span></b><div class="tri-mot-bar"><span style="width:${bar}%"></span></div><div class="tri-mot-note">Темп на сегодня: <span class="tri-mot-pace ${progressClass(x.pacePct)}">${x.pacePct.toFixed(1)}%</span> · прогноз месяца: ${x.forecastPlanPct.toFixed(1)}%</div></div><div style="text-align:right">${showMoney?`<b>${money(x.current)}</b><div class="tri-mot-note">из ${x.plan==null?'план не задан':money(x.plan)}</div>`:`<b>${x.planPct.toFixed(1)}%</b><div class="tri-mot-note">план / факт</div>`}</div></div>
      <div class="tri-mot-breakdown"><div class="tri-mot-part"><span>План продаж</span><b>${rateFmt(x.planAdd)} / ${rateFmt(motPolicy.plan_kpi_max)}</b><small>факт ${x.planPct.toFixed(1)}%</small></div><div class="tri-mot-part"><span>Рост групп</span><b>${rateFmt(x.growthAdd)} / ${rateFmt(motPolicy.growth_kpi_max)}</b><small>${pctFmt(x.growthPct)} к аналогу</small></div><div class="tri-mot-part"><span>Задачи 21vek</span><b>${rateFmt(x.taskAdd)} / ${rateFmt(motPolicy.task_kpi_max)}</b><small>подтверждено ${x.tm.salaryRate.toFixed(1)}% · ход ${x.tm.progressRate.toFixed(1)}%</small></div><div class="tri-mot-part"><span>Общий Triovist</span><b>${x.teamKnown?rateFmt(x.teamAdd):'до '+rateFmt(motPolicy.team_kpi_max)}</b><small>${x.teamKnown?'общий план и просрочки':'финально по общему результату'}</small></div></div>
      <div class="tri-mot-foot"><div><b>Задачи:</b> ${x.tm.total} · подтверждено ${x.tm.verified} · частично ${x.tm.partial} · просрочено ${x.tm.overdue}</div><div>${x.tm.pending?`На согласовании: <b>${x.tm.pending}</b>`:'Все поставленные задачи согласованы'}</div></div>${!x.teamKnown?'<div class="tri-mot-team-unknown">Командные +0,05% показаны как возможный диапазон. Точный командный результат доступен после получения общего плана и факта обоих менеджеров.</div>':''}</div>`;
  }

  function render(){
    if(!canSee())return;injectUi();moveTasksHigher();
    const grid=document.getElementById('tri-mot-grid'),policyBox=document.getElementById('tri-mot-policy');if(!grid||!policyBox||!motPolicy)return;
    const team=teamMetrics(),visible=isLeader()?MANAGERS:[email()],results=visible.map(m=>managerResult(m,team));
    grid.innerHTML=results.map(managerHtml).join('');
    policyBox.innerHTML=`<b>Формула:</b> 1,50% база + до 0,25% за план + до 0,10% за рост закреплённых групп + до 0,10% за подтверждённые задачи + до 0,05% за общий результат Triovist = максимум 2,00%. Расчёт предварительный; финальный итог фиксируется после закрытия месяца и свежей проверки задач.`;
  }

  async function load(force=false){
    if(!canSee()||motLoading||(motLoaded&&!force))return;
    motLoading=true;injectUi();banner('Считаю план, задачи и мотивацию…');
    try{
      const month=selectedMonth();
      const [policy,tasks,sales]=await Promise.all([
        rpc('triovist_motivation_get_policy',{},30000),
        window.TRIOVIST_DATA_HUB_V227315.tasks({p_manager_email:null}),
        window.TRIOVIST_DATA_HUB_V227315.sales({p_end_month:month,p_mode:'month',p_start_month:null})
      ]);
      motPolicy=policy||null;motTasks=tasks||{tasks:[],managers:[]};motSales=sales||{items:[],period_plans:[],selected_month_plans:[]};motLoaded=true;banner('');render();
    }catch(e){console.error(e);banner('Мотивация пока недоступна: '+(e.message||e),'error');}
    finally{motLoading=false;}
  }

  window.triovistMotivationReload=async function(force=true){if(force)window.TRIOVIST_DATA_HUB_V227315?.invalidate('sales','tasks');motLoaded=false;await load(force);};
  window.triovistMotivationEnsureLoaded=async function(){await load(false);};

  const baseRender=window.renderTriovist;
  window.renderTriovist=function(){const out=baseRender?.apply(this,arguments);injectUi();moveTasksHigher();const pane=document.getElementById('tri-v22728-pane-motivation');if(pane?.classList.contains('active')){if(motLoaded)render();else setTimeout(()=>load(false),0);}return out;};
  const baseReload=window.triovistReload;
  window.triovistReload=async function(){const out=await baseReload?.apply(this,arguments);motLoaded=false;const pane=document.getElementById('tri-v22728-pane-motivation');if(pane?.classList.contains('active'))await load(true);return out;};
  const basePeriod=window.triovistPeriodChanged;
  if(typeof basePeriod==='function')window.triovistPeriodChanged=async function(){const out=await basePeriod.apply(this,arguments);const pane=document.getElementById('tri-v22728-pane-motivation');if(pane?.classList.contains('active')&&!motLoaded)await load(false);return out;};
  const baseSavePlans=window.triovistSavePlans;
  if(typeof baseSavePlans==='function')window.triovistSavePlans=async function(){const out=await baseSavePlans.apply(this,arguments);const pane=document.getElementById('tri-v22728-pane-motivation');if(pane?.classList.contains('active')&&!motLoaded)await load(false);return out;};
  const baseTaskAction=window.triovistTaskAction;
  if(typeof baseTaskAction==='function')window.triovistTaskAction=async function(){const out=await baseTaskAction.apply(this,arguments);motLoaded=false;const pane=document.getElementById('tri-v22728-pane-motivation');if(pane?.classList.contains('active'))await load(false);return out;};
  const baseContentUpload=window.triovistContentUpload;
  if(typeof baseContentUpload==='function')window.triovistContentUpload=async function(){const out=await baseContentUpload.apply(this,arguments);motLoaded=false;const pane=document.getElementById('tri-v22728-pane-motivation');if(pane?.classList.contains('active'))await load(false);return out;};
  const baseGo=window.goPage;
  window.goPage=function(page,title){return baseGo.apply(this,arguments);};

  injectUi();
  window.RESANTA_V2267=Object.freeze({version:VERSION,basePercent:1.5,maxKpiPercent:.5,totalPercentMax:2,planKpiMax:.25,growthKpiMax:.10,taskKpiMax:.10,teamKpiMax:.05,tasksPlacedHigher:true,provisionalLiveCalculation:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 27 ===== */
// ===== v22.6.8: ИИ-задачи только по реальному свободному остатку Витебска =====
(function(){
'use strict';
const V2268_POLICY='v22.6.8';
const V2268_MIN_AUTO_STOCK=4;
let v2268AuditBusy=false;
let v2268LastAuditSig='';
let v2268AbcCache=new Map();
let v2268BranchAbcCache=null;
const v2268OldWorkingPool=_workingPool;
const v2268OldPersonalize=_personalizeAIProposalItems;

function nSku(v){return _normSku(v);}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function activeAiTask(t){return !!t&&!t.done&&!isPendingTask(t)&&!isBacklogReviewTask(t)&&(t.auto_generated||t.source==='must_list'||t.source==='call'||Array.isArray(t.ai_stock_items));}
function priceMeta(sku){const key=nSku(sku);const p=(allPrice||[]).find(x=>nSku(x.sku)===key);return p?{category:p.category||'',subgroup:p.subgroup||'',product:p.product||''}:{category:'',subgroup:'',product:''};}
function taskItems(t){
  if(Array.isArray(t&&t.ai_stock_items)&&t.ai_stock_items.length)return t.ai_stock_items.map(x=>({...x,sku:String(x.sku||'').trim(),qty:Math.max(1,Math.floor(num(x.qty)||1))})).filter(x=>x.sku);
  const txt=String(t&&t.text||'');const out=[];
  const re=/\[([^\]]+)\]\s*([^\n—-]*?)(?:\s*[—-]\s*)?(\d+(?:[.,]\d+)?)\s*шт/gi;let m;
  while((m=re.exec(txt))){const meta=priceMeta(m[1]);out.push({sku:m[1].trim(),product:(m[2]||meta.product||'').trim(),qty:Math.max(1,Math.floor(num(String(m[3]).replace(',','.')))),category:meta.category,subgroup:meta.subgroup});}
  return out;
}
function reservedQty(sku,excludeTaskId){
  const key=nSku(sku);let q=0;
  (allTasks||[]).forEach(t=>{if(!activeAiTask(t)||String(t.id)===String(excludeTaskId||''))return;taskItems(t).forEach(x=>{if(nSku(x.sku)===key)q+=Math.max(0,num(x.qty));});});
  return q;
}
function stockPolicy(sku,excludeTaskId,extraReserved){
  const st=_availBySku(sku);const avail=st?Math.max(0,num(st.avail)):0;
  const reserved=reservedQty(sku,excludeTaskId)+Math.max(0,num(extraReserved));
  let safety=0;if(avail<=3)safety=avail;else if(avail<=10)safety=2;else safety=Math.max(3,Math.ceil(avail*.10));
  const free=Math.max(0,avail-reserved-safety);
  let maxQty=0;if(avail>=V2268_MIN_AUTO_STOCK&&free>0)maxQty=avail<=10?Math.min(2,free):Math.min(free,Math.max(1,Math.floor(free*.20)));
  return {stock:st,avail,reserved,safety,free,maxQty,ok:!!st&&maxQty>0};
}
function currentStockDate(){return (_stockStatus().latest||null);}

// Только явный склад Витебск. Пустые значения и Чехов исключены.
_isVitebskStockRow=function(s){const w=String(s&&s.warehouse||'').toLowerCase().replace(/ё/g,'е').trim();return !!w&&w.includes('витебск');};
const previousBuild=_buildStockPrice;
_buildStockPrice=function(){
  const stamp=(allStock||[]).filter(_isVitebskStockRow).map(_stockRowDate).sort().pop()||'';
  const sig=(allStock||[]).length+'|'+stamp+'|'+(allPrice||[]).length+'|strict-v2268';
  if(_stockIdx&&_stockIdx._sig===sig)return;
  _stockIdx={_sig:sig};_stockByProduct={};
  (allStock||[]).forEach(s=>{if(!_isVitebskStockRow(s))return;const sku=nSku(s.sku),a=num(s.qty_avail);if(!sku||a<=0)return;const row={sku:String(s.sku||'').trim(),product:String(s.product||'').trim(),avail:a,warehouse:s.warehouse,report_date:_stockRowDate(s)};_stockIdx[sku]=row;const np=_normProduct(row.product);if(np)_stockByProduct[np]=row;});
  _priceByCat={_sig:sig};(allPrice||[]).forEach(p=>{const c=p.category||'—',sku=nSku(p.sku),item={sku:String(p.sku||'').trim(),skuKey:sku,product:String(p.product||'').trim(),subgroup:p.subgroup,category:c};(_priceByCat[c]=_priceByCat[c]||[]).push(item);const st=_stockIdx[sku];if(st){const np=_normProduct(item.product);if(np&&!_stockByProduct[np])_stockByProduct[np]=st;}});
};
_stockIdx=null;_priceByCat=null;_stockByProduct=null;

function abcMapClient(c){
  const sig=(allPurchaseHistory||[]).length+'|'+TODAY.slice(0,7)+'|'+String(c&&c.id||'');
  if(v2268AbcCache.has(sig))return v2268AbcCache.get(sig);
  const map=new Map(),byProduct=new Map();
  try{
    const cur=abcAggregate(abcRowsFor('client','all',c.id,abcPeriodMonths('90',0),'all'));
    const prev=abcAggregate(abcRowsFor('client','all',c.id,abcPeriodMonths('90',1),'all'));
    const curKeys=new Set();
    cur.forEach(g=>g.items.forEach(x=>{const k=nSku(x.sku);if(k){map.set(k,x.class);curKeys.add(g.group+'|'+x.key);}byProduct.set(_normProduct(x.product),x.class);}));
    prev.forEach(g=>g.items.forEach(x=>{if(x.class!=='A'||curKeys.has(g.group+'|'+x.key))return;const k=nSku(x.sku);if(k)map.set(k,'A_LOST');byProduct.set(_normProduct(x.product),'A_LOST');}));
  }catch(e){console.warn('ABC клиента для ИИ-задачи не рассчитан',e);}
  const out={map,byProduct};v2268AbcCache.set(sig,out);return out;
}
function abcMapBranch(){
  const sig=(allPurchaseHistory||[]).length+'|'+TODAY.slice(0,7);
  if(v2268BranchAbcCache&&v2268BranchAbcCache.sig===sig)return v2268BranchAbcCache;
  const map=new Map(),byProduct=new Map();
  try{abcAggregate(abcRowsFor('branch','all','',abcPeriodMonths('90',0),'all')).forEach(g=>g.items.forEach(x=>{const k=nSku(x.sku);if(k)map.set(k,x.class);byProduct.set(_normProduct(x.product),x.class);}));}catch(e){console.warn('ABC филиала для ИИ-задачи не рассчитан',e);}
  return v2268BranchAbcCache={sig,map,byProduct};
}
function abcClassesFor(c,row){
  const cm=abcMapClient(c),bm=abcMapBranch(),key=nSku(row&&row.sku),np=_normProduct(row&&row.product);
  const clientClass=cm.map.get(key)||cm.byProduct.get(np)||'';
  const branchClass=bm.map.get(key)||bm.byProduct.get(np)||'';
  return {clientClass,branchClass,effective:clientClass||branchClass||''};
}
function abcClassFor(c,row){return abcClassesFor(c,row).effective;}
function autoClassAllowed(cls,kind){if(cls==='R')return false;if(cls==='N')return kind==='novelty';if(cls==='C')return kind==='season';return cls==='A'||cls==='B'||cls==='A_LOST';}
function enrichCandidate(c,x){
  const meta=priceMeta(x.sku),classes=abcClassesFor(c,x),cls=x.abc_class||classes.effective,pol=stockPolicy(x.sku,null,0);
  return {...x,cat:x.cat||meta.category,subgroup:x.subgroup||meta.subgroup,abc_class:cls,abc_client_class:x.abc_client_class||classes.clientClass||'',abc_branch_class:x.abc_branch_class||classes.branchClass||'',free_avail:pol.free,reserved_other:pol.reserved,safety_stock:pol.safety,max_task_qty:pol.maxQty,selection_reason:x.reason||''};
}

// Рабочий клиент: маст-лист + ABC клиента + ABC филиала. Новая группа по-прежнему
// не ставится автоматически, но подходящая новинка N внутри действующих/связанных
// направлений должна присутствовать в пуле и в итоговом товарном предложении.
_workingPool=function(c,hist,allCats){
  const base=v2268OldWorkingPool(c,hist,allCats);const rows=[];const seen=new Set(),banned=_recentTaskSkus(c,120);
  const add=(x,kind,reason,score)=>{if(!x||!x.sku)return;const k=nSku(x.sku);if(!k||seen.has(k)||banned.has(k))return;const row=enrichCandidate(c,{...x,growthKind:kind||x.growthKind,reason:reason||x.reason,score:score??x.score});if(!row.max_task_qty)return;if(!autoClassAllowed(row.abc_class,row.growthKind))return;if(row.growthKind==='group')return;seen.add(k);rows.push(row);};
  // 1) ABC самого клиента: потерянные A, действующие A, затем B.
  try{
    const rec=abcRecommendations(c,'90','all');
    (rec.lost||[]).forEach((x,i)=>{const st=x.sku&&x.sku!=='—'?_availBySku(x.sku):_stockForProduct(x.product);if(st)add({...x,...st,cat:x.group,abc_class:'A_LOST',abc_client_class:'A_LOST'},'lost','ABC клиента: потерянная A-позиция — была ключевой в предыдущем периоде.',2200000-i);});
    (rec.hold||[]).forEach((x,i)=>{const st=x.sku&&x.sku!=='—'?_availBySku(x.sku):_stockForProduct(x.product);if(st)add({...x,...st,cat:x.group,abc_class:'A',abc_client_class:'A'},'repeat','ABC клиента: действующая A-позиция маст-листа — удержать объём.',2000000-i);});
    (rec.develop||[]).forEach((x,i)=>{const st=x.sku&&x.sku!=='—'?_availBySku(x.sku):_stockForProduct(x.product);if(st)add({...x,...st,cat:x.group,abc_class:'B',abc_client_class:'B'},'repeat','ABC клиента: B-позиция — развить до класса A.',1800000-i);});
  }catch(e){console.warn('Рекомендации ABC клиента не добавлены в ИИ-пул',e);}

  // 2) ABC компании/филиала: сильные A/B, которых клиент ещё не покупает,
  // и НОВИНКИ N. Берём только направления, связанные с фактическим маст-листом клиента.
  try{
    const masterCats=(base.categories||[]).filter(Boolean),boughtSku=new Set(),boughtProd=new Set();
    (hist||[]).forEach(r=>{const sk=nSku(r.sku);if(sk)boughtSku.add(sk);const np=_normProduct(r.product);if(np)boughtProd.add(np);});
    const branch=abcAggregate(abcRowsFor('branch','all','',abcPeriodMonths('90',0),'all'));
    branch.forEach(g=>{
      const related=!masterCats.length||masterCats.some(mc=>_groupsRelated(g.group,mc));if(!related)return;
      g.items.forEach((x,i)=>{
        if(!['A','B','N'].includes(x.class))return;
        const sk=nSku(x.sku),np=_normProduct(x.product);if((sk&&boughtSku.has(sk))||(np&&boughtProd.has(np)))return;
        const st=x.sku&&x.sku!=='—'?_availBySku(x.sku):_stockForProduct(x.product);if(!st)return;
        if(x.class==='N')add({...x,...st,cat:g.group,abc_class:'N',abc_branch_class:'N'},'novelty','НОВИНКА по ABC филиала: недавно появилась в продажах компании, клиент ещё не покупал; направление соответствует его маст-листу.',1900000-i);
        else if(x.class==='A')add({...x,...st,cat:g.group,abc_class:'A',abc_branch_class:'A'},'branch_abc','ABC филиала A: сильная позиция компании, которую клиент ещё не покупает; направление соответствует его маст-листу.',1600000-i);
        else add({...x,...st,cat:g.group,abc_class:'B',abc_branch_class:'B'},'branch_abc','ABC филиала B: перспективная позиция компании для расширения матрицы клиента.',1400000-i);
      });
    });
  }catch(e){console.warn('ABC филиала/новинки не добавлены в ИИ-пул',e);}

  // 3) Текущая логика маст-листа: сезон, потерянные SKU, глубина и подгруппы.
  (base.items||[]).forEach(x=>add(x,x.growthKind,x.reason,x.score));
  const rank={A_LOST:0,A:1,N:2,B:3,C:4};
  rows.sort((a,b)=>(b.score||0)-(a.score||0)||(rank[a.abc_class]??9)-(rank[b.abc_class]??9));
  let selected=rows.slice(0,18);
  // Жёсткая гарантия: если подходящая новинка есть, хотя бы одна находится в разрешённом пуле.
  const novelty=rows.find(x=>x.growthKind==='novelty');
  if(novelty&&!selected.some(x=>x.growthKind==='novelty'))selected=selected.length>=18?[...selected.slice(0,17),novelty]:[...selected,novelty];
  const audit={...(base.audit||{}),relatedGroups:(base.audit&&base.audit.relatedGroups)||[],newGroupsRecommendationOnly:true,abcClientEnabled:true,abcBranchEnabled:true,noveltyRequiredWhenAvailable:!!novelty};
  return {...base,items:selected,audit,source:'v22.7.8: маст-лист + ABC клиента + ABC филиала + остаток только Витебска. Приоритет: потерянные A клиента → действующие A → B → подходящая новинка N филиала → A/B филиала внутри действующих направлений → сезон/глубина маст-листа. Если доступна релевантная новинка N, она обязательна к предложению. Новые несвязанные группы автоматически не ставятся.'};
};

_personalizeAIProposalItems=function(list){
  list=v2268OldPersonalize(list);const planned=new Map();
  (list||[]).forEach(p=>{
    const c=_aiClientForProposal(p);const pool=_poolForProposal(p);if(!c||!pool||_proposalIsNonProduct(p))return;
    const out=[];
    (p.items||[]).forEach(it=>{const src=(pool.items||[]).find(x=>nSku(x.sku)===nSku(it.sku))||it;const extra=planned.get(nSku(it.sku))||0;const pol=stockPolicy(it.sku,null,extra);const row=enrichCandidate(c,src);if(!pol.maxQty||!autoClassAllowed(row.abc_class,row.growthKind))return;const qty=Math.min(Math.max(1,num(it.qty)||1),pol.maxQty);if(qty<1)return;out.push({...it,...row,qty,avail:pol.avail,free_avail:pol.free,reserved_other:pol.reserved+extra,safety_stock:pol.safety,max_task_qty:pol.maxQty});planned.set(nSku(it.sku),extra+qty);});
    if(c.client_status==='Рабочий'&&!_proposalIsNonProduct(p)){
      const novelty=(pool.items||[]).find(x=>x.growthKind==='novelty');
      if(novelty&&!out.some(x=>x.growthKind==='novelty'||nSku(x.sku)===nSku(novelty.sku))){
        const extra=planned.get(nSku(novelty.sku))||0,pol=stockPolicy(novelty.sku,null,extra),row=enrichCandidate(c,novelty);
        if(pol.maxQty>0&&autoClassAllowed(row.abc_class,row.growthKind)){
          const forced={...row,sku:pol.stock.sku,product:pol.stock.product||novelty.product,qty:1,avail:pol.avail,free_avail:pol.free,reserved_other:pol.reserved+extra,safety_stock:pol.safety,max_task_qty:pol.maxQty};
          if(out.length>=12){
            const removed=out[out.length-1],rk=nSku(removed&&removed.sku),rq=Math.max(0,num(removed&&removed.qty));
            if(rk&&planned.has(rk))planned.set(rk,Math.max(0,(planned.get(rk)||0)-rq));
            out[out.length-1]=forced;
          }else out.push(forced);
          planned.set(nSku(novelty.sku),extra+1);
        }
      }
    }
    p.items=out;
    if(c.client_status==='Рабочий'&&!_proposalIsNonProduct(p)&&out.length===0){p._workingDataBlocked=true;p._workingDataIssue='Нет безопасных SKU после финальной проверки ABC/остатка Витебска.';}
  });
  return list;
};

_validateAIProposalStock=function(p){
  const st=_stockStatus(),errors=[];if(!st.ok)errors.push(st.reason);const pool=_poolForProposal(p);const allowed=pool?new Map((pool.items||[]).map(x=>[nSku(x.sku),x])):null;const raw=Array.isArray(p&&p.items)?p.items:[];const valid=[],seen=new Set();const c=_aiClientForProposal(p);
  raw.forEach(it=>{const sku=nSku(it&&it.sku);if(!sku){errors.push('У товара не указан SKU.');return;}if(seen.has(sku))return;seen.add(sku);const stock=_availBySku(sku);if(!stock){errors.push('SKU '+String(it.sku||'')+' отсутствует на складе Витебск.');return;}const src=allowed&&allowed.get(sku);if(allowed&&!src){errors.push('SKU '+stock.sku+' не входит в маст-лист/ABC-пул этого клиента.');return;}const row=enrichCandidate(c||{},src||it);if(!autoClassAllowed(row.abc_class,row.growthKind)){errors.push('SKU '+stock.sku+' исключён: ABC '+(row.abc_class||'не определён')+'. Автозадачи разрешены для A/B, потерянных A, сезонного C клиента и релевантной новинки N филиала.');return;}const pol=stockPolicy(sku,null,0);if(pol.avail<V2268_MIN_AUTO_STOCK||pol.maxQty<1){errors.push('SKU '+stock.sku+' не имеет свободного остатка: склад '+pol.avail+', другие задачи '+pol.reserved+', страховой запас '+pol.safety+'.');return;}let qty=Math.floor(num(it.qty));if(qty<1){errors.push('По SKU '+stock.sku+' не указано количество.');return;}if(qty>pol.maxQty){errors.push('По SKU '+stock.sku+' можно поставить максимум '+pol.maxQty+' шт: склад '+pol.avail+', уже в задачах '+pol.reserved+', страховой запас '+pol.safety+'.');return;}valid.push({...it,...row,sku:stock.sku,product:stock.product||it.product,qty,avail:pol.avail,free_avail:pol.free,reserved_other:pol.reserved,safety_stock:pol.safety,max_task_qty:pol.maxQty});});
  p.items=valid;const isWorking=c&&c.client_status==='Рабочий',isPotential=c&&c.client_status==='Потенциальный';if(pool&&pool.mode==='qualification'&&valid.length)errors.push('У потенциального клиента не определён товарный профиль.');if(isWorking&&!_proposalIsNonProduct(p)&&valid.length===0){errors.push('Рабочий клиент: нет подтверждённых безопасных SKU после проверки истории 1С, ABC клиента/филиала и свободного остатка Витебска. Задача менеджеру заблокирована.');p._workingDataBlocked=true;}_syncProposalSkuCount(p,c);p._stockErrors=errors;p._stockOk=!errors.length;return p;
};

function auditTask(t){
  const items=taskItems(t),st=_stockStatus();if(!items.length)return {status:'none',items:[],issue:'',exempt:false,replacements:[]};
  const c=allClients.find(x=>String(x.id)===String(t.client_id))||{};const checked=[];let worst='ok';const rank={ok:0,low:1,out_of_stock:2,stale:3};
  items.forEach(it=>{const pol=stockPolicy(it.sku,t.id,0),meta=priceMeta(it.sku),cls=it.abc_class||abcClassFor(c,it),need=Math.max(1,num(it.qty));let status='ok',note='';if(!st.ok){status='stale';note=st.reason;}else if(!pol.stock||pol.avail<=0){status='out_of_stock';note='На складе Витебск 0 шт.';}else if(pol.free<need){status='low';note='Свободно '+pol.free+' шт при задаче '+need+' шт (склад '+pol.avail+', другие задачи '+pol.reserved+', страховой запас '+pol.safety+').';}if(rank[status]>rank[worst])worst=status;checked.push({...it,category:it.category||meta.category,subgroup:it.subgroup||meta.subgroup,abc_class:cls,current_avail:pol.avail,current_free:pol.free,reserved_other:pol.reserved,safety_stock:pol.safety,status,note});});
  const bad=checked.filter(x=>x.status!=='ok');const replacements=bad.map(x=>({sku:x.sku,replacement:findReplacement(c,x,t.id)}));
  return {status:worst,items:checked,issue:bad.map(x=>x.sku+': '+x.note).join(' '),exempt:bad.length>0,replacements};
}
function findReplacement(c,item,taskId){
  const meta=priceMeta(item.sku),branch=abcMapBranch(),client=abcMapClient(c),cands=(allPrice||[]).filter(p=>nSku(p.sku)!==nSku(item.sku));
  cands.sort((a,b)=>{const sa=(String(a.subgroup||'')===String(meta.subgroup||''))?0:(String(a.category||'')===String(meta.category||'')?1:9),sb=(String(b.subgroup||'')===String(meta.subgroup||''))?0:(String(b.category||'')===String(meta.category||'')?1:9);return sa-sb;});
  for(const p of cands){if(String(p.category||'')!==String(meta.category||'')&&String(p.subgroup||'')!==String(meta.subgroup||''))continue;const key=nSku(p.sku),cls=client.map.get(key)||client.byProduct.get(_normProduct(p.product))||branch.map.get(key)||branch.byProduct.get(_normProduct(p.product))||'';if(cls!=='A'&&cls!=='B')continue;const pol=stockPolicy(p.sku,taskId,0);if(pol.maxQty<1)continue;return {sku:pol.stock.sku,product:pol.stock.product||p.product,qty:Math.min(Math.max(1,num(item.qty)),pol.maxQty),avail:pol.avail,free_avail:pol.free,reserved_other:pol.reserved,safety_stock:pol.safety,abc_class:cls,category:p.category||'',subgroup:p.subgroup||'',selection_reason:'Безопасная замена в той же группе/подгруппе, ABC '+cls+'.'};}
  return null;
}
function stockLabel(status){return status==='ok'?'🟢 Есть':status==='low'?'🟡 Остаток снизился':status==='out_of_stock'?'🔴 Нет в наличии':status==='stale'?'⚪ Остатки устарели':'—';}
function escapeHtml(v){return esc(String(v??''));}
function v2268SavedTaskAudit(t){
  const items=Array.isArray(t?.ai_stock_items)?t.ai_stock_items:[];
  if(!items.length)return {status:'none',items:[],issue:'',exempt:false,replacements:[],checked:false};
  const checked=!!(t.ai_stock_checked_at||t.ai_stock_status||t.ai_stock_snapshot_date);
  const status=checked?(t.ai_stock_status||'ok'):'not_checked';
  return {
    status,
    items,
    issue:t.ai_stock_issue||'',
    exempt:!!t.ai_stock_kpi_exempt,
    replacements:Array.isArray(t.ai_stock_replacements)?t.ai_stock_replacements:[],
    checked
  };
}
window.v2268TaskStockHtml=function(t,isBoss){
  if(!activeAiTask(t)&&!Array.isArray(t.ai_stock_items))return '';
  // CRITICAL PERFORMANCE RULE:
  // ordinary task rendering must be O(saved rows), never a fresh stock/price audit.
  const a=v2268SavedTaskAudit(t);if(a.status==='none')return '';
  const pending=!a.checked||a.status==='not_checked';
  const bg=pending?'#F8FAFC':(a.exempt?'#FEF2F2':'#F0FDF4');
  const border=pending?'#CBD5E1':(a.exempt?'#FCA5A5':'#86EFAC');
  const color=pending?'#475569':(a.exempt?'#991B1B':'#166534');
  const rows=a.items.map(x=>{
    const st=x.status||(pending?'not_checked':'ok');
    const avail=(x.current_avail??x.avail??'—');
    const free=(x.current_free??x.free_avail??'—');
    return '<div style="display:grid;grid-template-columns:90px minmax(150px,1fr) 100px 120px;gap:6px;padding:4px 0;border-top:1px solid rgba(0,0,0,.06);font-size:10px"><b>'+escapeHtml(x.sku)+'</b><span>'+escapeHtml(x.product||'')+' <b>ABC '+escapeHtml(x.abc_class||'—')+'</b></span><span>'+(st==='not_checked'?'⚪ Не проверено':stockLabel(st))+'</span><span>склад '+escapeHtml(avail)+' · свободно '+escapeHtml(free)+'</span></div>';
  }).join('');
  const buttons='<button onclick="event.stopPropagation();v2268RecheckTaskStock(\''+t.id+'\')" style="padding:4px 8px;border:1px solid '+border+';border-radius:6px;background:#fff;color:'+color+';cursor:pointer;font-size:10px">↻ Проверить наличие</button>'+(isBoss&&a.exempt?'<button onclick="event.stopPropagation();v2268ApplyTaskReplacements(\''+t.id+'\')" style="padding:4px 8px;border:none;border-radius:6px;background:var(--a);color:#fff;cursor:pointer;font-size:10px">Подобрать замену</button>':'');
  const title=pending?'не проверено':(a.exempt?'KPI не снижается':'подтверждено');
  return '<div style="margin:6px 0;padding:8px 9px;border:1px solid '+border+';border-radius:8px;background:'+bg+';color:'+color+'"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><b style="font-size:11px">📦 Контроль наличия · '+title+'</b><div style="display:flex;gap:5px">'+buttons+'</div></div>'+rows+(a.issue?'<div style="font-size:10px;margin-top:5px">'+escapeHtml(a.issue)+'</div>':'')+'</div>';
};

async function persistAudit(t,a){
  const upd={ai_stock_items:a.items,ai_stock_snapshot_date:currentStockDate(),ai_stock_checked_at:new Date().toISOString(),ai_stock_status:a.status,ai_stock_issue:a.issue||null,ai_stock_kpi_exempt:!!a.exempt,ai_stock_policy_version:V2268_POLICY,ai_stock_replacements:a.replacements};
  const {error}=await db.from('tasks').update(upd).eq('id',t.id);if(error){console.warn('Не удалось сохранить контроль остатков задачи',t.id,error);return false;}Object.assign(t,upd);return true;
}
window.v2268RecheckTaskStock=async function(id){
  const t=allTasks.find(x=>String(x.id)===String(id));if(!t)return;
  const btnPage=(typeof crmActivePage==='function'?crmActivePage():'');
  try{
    if(typeof v2273EnsureFeature==='function')await v2273EnsureFeature('tasks-stock');
    if(typeof crmActivePage==='function'&&crmActivePage()!==btnPage)return;
    await persistAudit(t,auditTask(t));
    if(typeof crmActivePage!=='function'||crmActivePage()==='tasks')renderTasks();
    if(typeof crmActivePage==='function'&&crmActivePage()==='dashboard')buildDashboard();
  }catch(e){console.warn('Проверка наличия не выполнена',e);alert('Не удалось проверить наличие: '+(e?.message||e));}
};
window.v2268AuditActiveTasks=async function(renderAfter){
  if(v2268AuditBusy)return;const sig=currentStockDate()+'|'+(allTasks||[]).length+'|'+(allStock||[]).length;if(sig===v2268LastAuditSig&&renderAfter)return;v2268AuditBusy=true;let changed=0;
  try{for(const t of (allTasks||[]).filter(activeAiTask)){const a=auditTask(t);const state=[a.status,a.issue,a.exempt,JSON.stringify(a.items)].join('|'),old=[t.ai_stock_status,t.ai_stock_issue,t.ai_stock_kpi_exempt,JSON.stringify(t.ai_stock_items||[])].join('|');if(state!==old){if(await persistAudit(t,a))changed++;}}v2268LastAuditSig=sig;}finally{v2268AuditBusy=false;if(renderAfter&&changed){renderTasks();buildDashboard();}}
};
function rewriteTaskText(t,items){const base=String(t.text||'').replace(/\nТовары к согласованию:\n[\s\S]*$/,'').trim();return base+'\nТовары к согласованию:\n'+items.map((x,i)=>(i+1)+'. ['+x.sku+'] '+x.product+' — '+x.qty+' шт').join('\n');}
window.v2268ApplyTaskReplacements=async function(id){
  if(currentProfile?.role!=='boss'){alert('Замену товара подтверждает руководитель.');return;}
  try{if(typeof v2273EnsureFeature==='function')await v2273EnsureFeature('tasks-stock');}catch(e){alert('Не удалось загрузить остатки/прайс: '+(e?.message||e));return;}
  const t=allTasks.find(x=>String(x.id)===String(id));if(!t)return;const a=auditTask(t),bad=new Set(a.items.filter(x=>x.status!=='ok').map(x=>nSku(x.sku)));if(!bad.size){alert('Все позиции сейчас есть в свободном остатке Витебска.');return;}const rep=new Map(a.replacements.filter(x=>x.replacement).map(x=>[nSku(x.sku),x.replacement]));const missing=[...bad].filter(k=>!rep.has(k));if(missing.length){alert('Подходящей A/B-замены в той же группе или подгруппе нет для: '+missing.join(', ')+'.\n\nЗадача остаётся без штрафа для менеджера.');return;}const next=a.items.map(x=>bad.has(nSku(x.sku))?rep.get(nSku(x.sku)):x);const msg=a.items.filter(x=>bad.has(nSku(x.sku))).map(x=>x.sku+' → '+rep.get(nSku(x.sku)).sku).join('\n');if(!confirm('Подтвердить замену товарных позиций?\n\n'+msg))return;const upd={text:rewriteTaskText(t,next),ai_stock_items:next,ai_stock_snapshot_date:currentStockDate(),ai_stock_checked_at:new Date().toISOString(),ai_stock_status:'ok',ai_stock_issue:null,ai_stock_kpi_exempt:false,ai_stock_policy_version:V2268_POLICY,ai_stock_replacements:[]};const {error}=await db.from('tasks').update(upd).eq('id',t.id);if(error){alert('Не удалось заменить товар: '+error.message);return;}Object.assign(t,upd);renderTasks();buildDashboard();alert('Замена подтверждена. Менеджер увидит обновлённые SKU.');
};

// v22.7.32.2.6:
 // Глобальный массовый аудит после входа УДАЛЁН.
 // Никаких UPDATE tasks без явного действия пользователя.
})();

/* ===== ORIGINAL INLINE SCRIPT 28 ===== */
// ===== v22.6.9: отсутствующие клиенты в маршрутах и честная просрочка =====
(function(){
'use strict';
const VERSION='v22.6.9';

function norm(v){
  return String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,' ').trim();
}
function clientForRoute(r){
  if(!r)return null;
  const byId=r.client_id?allClients.find(c=>String(c.id)===String(r.client_id)):null;
  if(byId)return byId;
  const linked=(r.linked_client_ids||[]).map(String);
  const byLinked=linked.length?allClients.find(c=>linked.includes(String(c.id))):null;
  if(byLinked)return byLinked;
  const direct=matchClientByName(r.client_name||'');
  if(direct)return direct;
  for(const n of (r.linked_client_names||[])){
    const c=matchClientByName(n);
    if(c)return c;
  }
  return null;
}
function activeBrokenRoutes(){
  return dedupeRoutePlansForTruth(routePlansForCurrentUser().filter(r=>!clientForRoute(r)));
}

const baseRouteTruth=routeTruthMetrics;
routeTruthMetrics=function(visits,plans){
  const source=(plans||[]).slice();
  const valid=source.filter(r=>!!clientForRoute(r));
  const broken=dedupeRoutePlansForTruth(source.filter(r=>!clientForRoute(r)));
  const out=baseRouteTruth(visits,valid);
  out.unresolvedRouteRows=broken;
  return out;
};

const baseSignalTruth=buildSignalTruth;
buildSignalTruth=function(includeDataQuality=true){
  const d=baseSignalTruth(includeDataQuality);
  if(includeDataQuality){
    d.routeDataIssues=activeBrokenRoutes();
    d.dataCount=(Number(d.dataCount)||0)+d.routeDataIssues.length;
  }else d.routeDataIssues=[];
  return d;
};

function routeDataCard(rows){
  if(!rows.length)return '';
  return '<div class="card" id="v2269-route-data-card" style="margin-bottom:12px;border:1px solid var(--amb)">'
    +'<div class="card-title" style="color:var(--w)">⚠️ Точки маршрута без карточки клиента ('+rows.length+')</div>'
    +'<div style="font-size:12px;color:var(--sub);margin:-4px 0 8px">Это проблема качества данных, а не просрочка менеджера. Такие точки исключены из KPI до привязки карточки.</div>'
    +rows.slice(0,50).map(r=>'<div class="alert-item" style="background:var(--amb);border:1px solid #f2d4a5">'
      +'<div class="ai-body"><div class="ai-title">'+esc(r.client_name||'Клиент не найден')+'</div>'
      +'<div class="ai-sub">👤 '+esc(r.manager_name||'—')+' · план '+esc(r.visit_date||'—')+' · '+esc(r.city||'')+' '+esc(r.address||'')+'</div></div>'
      +(currentProfile?.role==='boss'?'<button onclick="v2269RepairRouteClient(\''+escAttr(String(r.id||''))+'\')" style="padding:6px 9px;border:1px solid var(--w);color:var(--w);background:#fff;border-radius:7px;cursor:pointer;font-size:11px;font-weight:600">Связать клиента</button>':'<span class="tag tag-gray">не вина менеджера</span>')
      +'</div>').join('')
    +(rows.length>50?'<div style="font-size:12px;color:var(--sub);padding-top:6px">Показаны первые 50 из '+rows.length+'.</div>':'')
    +'</div>';
}

const baseRenderAlerts=renderAlerts;
renderAlerts=function(){
  // v22.7.32.2.8: route-data diagnostics were removed from Signals in v22.7.6.
  // Do not calculate them just to delete the card afterwards.
  return baseRenderAlerts.apply(this,arguments);
};

const baseRenderVisits=renderVisits;
renderVisits=function(){
  baseRenderVisits();
  const rows=activeBrokenRoutes();
  let block=document.getElementById('v2269-visits-route-data');
  if(!block){
    block=document.createElement('div');
    block.id='v2269-visits-route-data';
    const overdue=document.getElementById('overdue-visits-block');
    if(overdue&&overdue.parentNode)overdue.parentNode.insertBefore(block,overdue);
  }
  if(block)block.innerHTML=rows.length?routeDataCard(rows):'';
};

async function updateRouteRowsForClient(rows,c){
  for(const r of rows){
    const ids=[...new Set([...(r.linked_client_ids||[]).map(String),String(c.id)])];
    const names=[...new Set([...(r.linked_client_names||[]),c.name,r.client_name].map(x=>String(x||'').trim()).filter(Boolean))];
    const patch={client_id:c.id,linked_client_ids:ids,linked_client_names:names};
    const {error}=await db.from('route_plans').update(patch).eq('id',r.id);
    if(error)throw error;
    Object.assign(r,patch);
  }
}

window.v2269RepairRouteClient=async function(rowId){
  if(currentProfile?.role!=='boss'){alert('Связать карточку может только руководитель.');return;}
  const r=allRoutePlans.find(x=>String(x.id)===String(rowId));
  if(!r)return;
  let c=clientForRoute(r);
  if(!c){
    if(!confirm('Создать карточку клиента «'+(r.client_name||'—')+'» и связать с маршрутами?'))return;
    const {data,error}=await db.from('clients').insert({
      name:r.client_name,
      region:r.region||'',
      city:r.city||'',
      address:r.address||'',
      role_type:r.category||'C',
      manager_name:r.manager_name||'',
      client_status:'Рабочий',
      revenue_total:0
    }).select().single();
    if(error){alert('Не удалось создать клиента: '+error.message);return;}
    c=data;
    allClients.push(c);
  }else if(!confirm('Связать все строки маршрута «'+(r.client_name||'—')+'» с карточкой «'+c.name+'»?'))return;

  const same=allRoutePlans.filter(x=>norm(x.client_name)===norm(r.client_name)||nameLooseMatch(x.client_name,r.client_name));
  try{
    await updateRouteRowsForClient(same,c);
    const aliases=[...new Set(same.map(x=>x.client_name).concat([c.name]).filter(Boolean))].map(alias_name=>({client_id:c.id,alias_name}));
    if(aliases.length)await db.from('client_aliases').upsert(aliases,{onConflict:'client_id,alias_name',ignoreDuplicates:true});
    _clientNameMatchCache=null;_phClientMatchCache=null;_phNameSet=null;
    renderVisits();renderAlerts();buildDashboard();
    if(typeof renderRoutesBoss==='function')renderRoutesBoss();
    alert('Карточка связана с '+same.length+' строк(ами) маршрута.');
  }catch(e){alert('Не удалось связать маршрут: '+(e?.message||e));}
};

promoteRouteRowToClient=window.v2269RepairRouteClient;
window.RESANTA_V2269=Object.freeze({version:VERSION,missingRouteClientsAsDataQuality:true,overdueVisitButton:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 29 ===== */
// ===== v22.7.0: менеджер может только ДОБАВЛЯТЬ своих клиентов в маршрут =====
(function(){
'use strict';
const VERSION='v22.7.0';
const MAX_POINTS_WARNING=15;

function norm2270(v){return String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,' ').trim();}
function isFieldManager2270(){return currentProfile?.role==='manager'&&['руднев','ачинович','шкуран'].includes(norm2270(currentProfile?.name));}
function clientStatus2270(c){return norm2270(c?.client_status||c?.status);}
function isOwnRouteClient2270(c){
  if(!c||!isFieldManager2270())return false;
  if(norm2270(c.manager_name)!==norm2270(currentProfile?.name))return false;
  return ['рабочий','потенциальный'].includes(clientStatus2270(c));
}
function date2270(v){return String(v||'').slice(0,10);}
function activeDayRows2270(date){return (allRoutePlans||[]).filter(r=>norm2270(r.manager_name)===norm2270(currentProfile?.name)&&date2270(r.visit_date)===date&&!r.removed);}
function sameClient2270(r,c){
  return (r.client_id&&String(r.client_id)===String(c.id))
    ||(r.linked_client_ids||[]).map(String).includes(String(c.id))
    ||norm2270(r.client_name)===norm2270(c.name)
    ||(r.linked_client_names||[]).some(n=>norm2270(n)===norm2270(c.name));
}
function ensureReasonUi2270(){
  const modal=document.querySelector('#modal-add-route-stop .modal');
  if(!modal||document.getElementById('v2270-add-reason'))return;
  const search=modal.querySelector('.search-wrap');
  if(!search)return;
  const box=document.createElement('div');
  box.id='v2270-add-reason';
  box.style.cssText='margin:0 0 12px;padding:11px;border:1px solid var(--border);border-radius:10px;background:var(--bg)';
  box.innerHTML='<label style="display:block;font-size:12px;font-weight:700;margin-bottom:6px">Причина добавления <span style="color:var(--r)">*</span></label>'
    +'<textarea id="ars-reason" maxlength="300" rows="2" placeholder="Например: клиент позвонил, нужно срочно заехать; новая договорённость; дополнительная передача" style="width:100%;resize:vertical;border:1px solid var(--border);border-radius:8px;padding:9px;font:inherit;font-size:13px"></textarea>'
    +'<div style="font-size:11px;color:var(--sub);margin-top:5px">Руководитель увидит, кто, когда и почему добавил клиента. Удалять точки менеджер не может.</div>';
  modal.insertBefore(box,search);
}

window.openAddRouteStop=function(date){
  if(!isFieldManager2270()){alert('Добавлять клиентов в маршрут могут только полевые менеджеры.');return;}
  const d=date2270(date);
  if(!d||d<String(TODAY)){alert('Добавлять клиента можно только на сегодня или будущую дату.');return;}
  routeStopAddDate=d;
  ensureReasonUi2270();
  const label=document.getElementById('ars-date');
  if(label)label.innerHTML='<b>Добавление клиента в свой маршрут:</b> '+new Date(d+'T12:00:00').toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const search=document.getElementById('ars-search');if(search){search.value='';search.placeholder='Поиск среди моих рабочих и потенциальных клиентов...';}
  const reason=document.getElementById('ars-reason');if(reason)reason.value='';
  const res=document.getElementById('ars-results');if(res){res.innerHTML='<div style="padding:10px 12px;color:var(--sub);font-size:12px">Введите название клиента.</div>';res.style.display='block';}
  document.getElementById('modal-add-route-stop')?.classList.add('open');
  setTimeout(()=>search?.focus(),50);
};

window.filterRouteStopAdd=function(){
  const input=document.getElementById('ars-search'),res=document.getElementById('ars-results');
  if(!input||!res)return;
  const q=norm2270(input.value);
  const own=(allClients||[]).filter(isOwnRouteClient2270);
  if(!q){res.style.display='block';res.innerHTML='<div style="padding:10px 12px;color:var(--sub);font-size:12px">Введите название клиента.</div>';return;}
  const active=activeDayRows2270(routeStopAddDate);
  const filtered=own.filter(c=>norm2270(c.name).includes(q)&&!active.some(r=>sameClient2270(r,c))).slice(0,30);
  res.style.display='block';
  if(!filtered.length){res.innerHTML='<div style="padding:12px;color:var(--sub);font-size:12px">Среди ваших рабочих и потенциальных клиентов свободных совпадений не найдено.</div>';return;}
  res.innerHTML=filtered.map(c=>{
    const status=c.client_status||'—',addr=[c.city,c.address].filter(Boolean).join(' · ')||'адрес не указан';
    return '<button type="button" onmousedown="event.preventDefault();addRouteStop(\''+escAttr(String(c.id))+'\')" style="display:block;width:100%;padding:10px 12px;text-align:left;cursor:pointer;border:0;border-bottom:1px solid var(--border);background:#fff">'
      +'<div style="font-size:13px;font-weight:700">'+esc(c.name)+'</div>'
      +'<div style="font-size:11px;color:var(--sub);margin-top:3px">'+esc(status)+' · 📍 '+esc(addr)+'</div></button>';
  }).join('');
};

window.addRouteStop=async function(clientId){
  if(!isFieldManager2270()){alert('Недостаточно прав.');return;}
  const c=(allClients||[]).find(x=>String(x.id)===String(clientId));
  if(!isOwnRouteClient2270(c)){alert('Можно добавить только своего рабочего или потенциального клиента.');return;}
  const date=date2270(routeStopAddDate);
  if(!date||date<String(TODAY)){alert('Дата маршрута уже прошла.');return;}
  const reason=String(document.getElementById('ars-reason')?.value||'').trim();
  if(reason.length<3){alert('Укажите краткую причину добавления клиента.');document.getElementById('ars-reason')?.focus();return;}
  const day=activeDayRows2270(date);
  if(day.some(r=>sameClient2270(r,c))){alert('Этот клиент уже есть в маршруте на выбранную дату.');return;}
  if(day.length>=MAX_POINTS_WARNING&&!confirm('В маршруте уже '+day.length+' точек. Добавить ещё одного клиента?'))return;

  const search=document.getElementById('ars-search');if(search)search.disabled=true;
  try{
    const {data,error}=await db.rpc('crm_v2270_manager_add_route_stop',{
      p_client_id:c.id,
      p_visit_date:date,
      p_reason:reason
    });
    if(error)throw error;
    const result=data||{},row=result.row||result;
    if(row&&row.id){
      const idx=(allRoutePlans||[]).findIndex(r=>String(r.id)===String(row.id));
      if(idx>=0)allRoutePlans[idx]={...allRoutePlans[idx],...row};else allRoutePlans.push(row);
    }
    closeModal('modal-add-route-stop');
    window.renderMyRoutes?.();
    if(result.action==='merged')alert('Клиент добавлен к уже существующей физической точке маршрута. Отдельный дубль остановки не создан.');
    else alert('Клиент добавлен в маршрут. Руководитель увидит причину и время добавления.');
  }catch(e){
    const msg=String(e?.message||e||'').replace(/^.*?message[:=]\s*/i,'');
    alert('Не удалось добавить клиента: '+msg);
  }finally{if(search)search.disabled=false;}
};

// Менеджеру запрещено удалять или переносить утверждённые руководителем точки.
window.removeRouteStop=function(){alert('Удалять точки маршрута менеджеру нельзя. Для изменения свяжитесь с руководителем.');};

// После каждого открытия маршрута прячем старые кнопки удаления, если они остались в кеше DOM.
const renderMyRoutes2270=window.renderMyRoutes;
window.renderMyRoutes=function(){
  const out=renderMyRoutes2270?.apply(this,arguments);
  if(isFieldManager2270())document.querySelectorAll('#page-my-routes .route-stop-delete').forEach(x=>x.remove());
  return out;
};

ensureReasonUi2270();
window.RESANTA_V2270=Object.freeze({version:VERSION,managerCanAddOwnClients:true,managerCannotDelete:true,reasonRequired:true,approvedRouteAddition:true,maxPointsWarning:MAX_POINTS_WARNING});
})();

/* ===== ORIGINAL INLINE SCRIPT 30 ===== */
// ===== v22.7.2: адаптивное окно сетевой передачи для ПК и планшета =====
(function(){
'use strict';
const VERSION='v22.7.2';
let currentRouteId=null,geoBusy=false,ntrSaving=false,ntrSelectedResult='Информация передана';
const norm=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,' ').trim();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const RESULT_OPTIONS=['Информация передана','Договорились о размещении','Переданы материалы/прайс','Требуется повторный контакт'];
let savedHtmlOverflow='',savedBodyOverflow='';

function ensureStyle(){
  if(document.getElementById('v2272-network-transfer-style'))return;
  const style=document.createElement('style');
  style.id='v2272-network-transfer-style';
  style.textContent=`
#modal-network-transfer{position:fixed!important;left:0!important;right:0!important;top:var(--ntr-top,0px)!important;height:var(--ntr-height,100dvh)!important;z-index:2147483000!important;display:none!important;align-items:center!important;justify-content:center!important;padding:18px!important;background:rgba(15,23,42,.58)!important;backdrop-filter:blur(2px);overflow:hidden!important;overscroll-behavior:contain}
#modal-network-transfer.open{display:flex!important}
#modal-network-transfer .ntr-sheet{width:min(600px,100%)!important;max-width:600px!important;max-height:min(780px,calc(var(--ntr-height,100dvh) - 36px))!important;background:#fff!important;border-radius:18px!important;box-shadow:0 24px 70px rgba(15,23,42,.32)!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;position:relative!important;margin:0!important;padding:0!important}
#modal-network-transfer .ntr-header{display:flex;align-items:flex-start;gap:12px;padding:18px 20px 14px;border-bottom:1px solid var(--border);background:#fff;flex:0 0 auto}
#modal-network-transfer .ntr-back{display:none;width:42px;height:42px;border:1px solid var(--border);border-radius:12px;background:#fff;color:var(--text);font-size:23px;line-height:1;cursor:pointer;flex:0 0 auto}
#modal-network-transfer .ntr-heading{min-width:0;flex:1}
#modal-network-transfer .ntr-title{font-size:19px;line-height:1.25;font-weight:750;color:var(--text)}
#modal-network-transfer .ntr-point{margin-top:5px;font-size:12px;line-height:1.45;color:var(--sub);overflow-wrap:anywhere}
#modal-network-transfer .ntr-close{width:42px;height:42px;border:0;border-radius:12px;background:var(--bg);color:var(--sub);font-size:26px;line-height:1;cursor:pointer;flex:0 0 auto}
#modal-network-transfer .ntr-body{padding:18px 20px 20px;overflow-y:auto;overscroll-behavior:contain;flex:1 1 auto;min-height:0;background:#fff}
#modal-network-transfer .ntr-label{display:block;font-size:12px;font-weight:650;color:var(--sub);margin:0 0 6px}
#modal-network-transfer .ntr-input{width:100%;min-height:48px;padding:12px 13px;border:1.5px solid var(--border);border-radius:11px;font-size:16px;color:var(--text);background:#fff;box-sizing:border-box}
#modal-network-transfer .ntr-input:focus{outline:none;border-color:var(--a);box-shadow:0 0 0 3px rgba(29,78,216,.10)}
#modal-network-transfer textarea.ntr-input{min-height:112px;resize:vertical;line-height:1.45}
#modal-network-transfer .ntr-field{margin-bottom:16px}
#modal-network-transfer .ntr-results{display:grid;grid-template-columns:1fr 1fr;gap:8px}
#modal-network-transfer .ntr-result{min-height:44px;padding:9px 10px;border:1px solid var(--border);border-radius:10px;background:#fff;color:var(--text);font-size:12px;line-height:1.25;font-weight:650;text-align:left;cursor:pointer}
#modal-network-transfer .ntr-result.active{border-color:#2563EB;background:#EFF6FF;color:#1D4ED8;box-shadow:0 0 0 1px #2563EB inset}
#modal-network-transfer .ntr-gps{padding:11px 12px;border:1px solid #BFDBFE;border-radius:11px;background:#EFF6FF;color:#1D4ED8;font-size:12px;line-height:1.45}
#modal-network-transfer .ntr-footer{display:flex;gap:10px;justify-content:flex-end;padding:14px 20px calc(14px + env(safe-area-inset-bottom));border-top:1px solid var(--border);background:#fff;flex:0 0 auto;box-shadow:0 -8px 18px rgba(15,23,42,.05)}
#modal-network-transfer .ntr-footer button{min-height:48px;border-radius:11px;font-size:15px;font-weight:700}
#modal-network-transfer .ntr-cancel{min-width:120px;padding:10px 18px;background:#fff;color:var(--text);border:1px solid var(--border);cursor:pointer}
#modal-network-transfer .ntr-save{min-width:230px;padding:10px 20px;background:var(--a);color:#fff;border:0;cursor:pointer}
#modal-network-transfer .ntr-save:disabled,#modal-network-transfer .ntr-cancel:disabled,#modal-network-transfer .ntr-close:disabled,#modal-network-transfer .ntr-back:disabled{opacity:.55;cursor:wait}
@media(max-width:768px){
  #modal-network-transfer{padding:0!important;align-items:stretch!important;justify-content:stretch!important;background:#fff!important;backdrop-filter:none}
  #modal-network-transfer .ntr-sheet{width:100%!important;max-width:none!important;height:var(--ntr-height,100dvh)!important;max-height:none!important;border-radius:0!important;box-shadow:none!important}
  #modal-network-transfer .ntr-header{padding:calc(10px + env(safe-area-inset-top)) 12px 10px;align-items:center;position:relative;z-index:2}
  #modal-network-transfer .ntr-back{display:block}
  #modal-network-transfer .ntr-close{display:none}
  #modal-network-transfer .ntr-title{font-size:18px}
  #modal-network-transfer .ntr-point{font-size:11px;margin-top:3px}
  #modal-network-transfer .ntr-body{padding:16px 14px 22px}
  #modal-network-transfer .ntr-results{grid-template-columns:1fr}
  #modal-network-transfer .ntr-result{min-height:46px;font-size:13px}
  #modal-network-transfer .ntr-footer{display:grid;grid-template-columns:1fr;padding:10px 14px calc(10px + env(safe-area-inset-bottom));gap:8px}
  #modal-network-transfer .ntr-save{width:100%;min-width:0;grid-row:1}
  #modal-network-transfer .ntr-cancel{width:100%;min-width:0;grid-row:2}
}
@media(max-width:768px) and (orientation:landscape){
  #modal-network-transfer .ntr-header{padding-top:calc(6px + env(safe-area-inset-top));padding-bottom:6px}
  #modal-network-transfer .ntr-body{padding-top:10px;padding-bottom:12px}
  #modal-network-transfer .ntr-field{margin-bottom:10px}
  #modal-network-transfer textarea.ntr-input{min-height:78px}
}
`;
  document.head.appendChild(style);
}

function resultButtons(){
  return RESULT_OPTIONS.map((x,i)=>'<button type="button" class="ntr-result'+(i===0?' active':'')+'" data-ntr-result="'+x+'" onclick="selectNetworkTransferResult(this)">'+x+'</button>').join('');
}

function ensureModal(){
  ensureStyle();
  if(document.getElementById('modal-network-transfer'))return;
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-bg ntr-overlay" id="modal-network-transfer" role="dialog" aria-modal="true" aria-labelledby="ntr-title"><section class="ntr-sheet"><header class="ntr-header"><button type="button" class="ntr-back" aria-label="Назад" onclick="closeNetworkTransfer()">‹</button><div class="ntr-heading"><div class="ntr-title" id="ntr-title">🏬 Сетевая передача</div><div class="ntr-point" id="ntr-point"></div></div><button type="button" class="ntr-close" aria-label="Закрыть" onclick="closeNetworkTransfer()">×</button></header><div class="ntr-body"><div class="ntr-field"><label class="ntr-label">Результат передачи <span style="color:var(--r)">*</span></label><div class="ntr-results" id="ntr-results">${resultButtons()}</div></div><div class="ntr-field"><label class="ntr-label" for="ntr-recipient">Кому передано <span style="color:var(--r)">*</span></label><input id="ntr-recipient" class="ntr-input" maxlength="120" autocomplete="name" placeholder="ФИО или должность сотрудника сети"></div><div class="ntr-field"><label class="ntr-label" for="ntr-comment">Комментарий</label><textarea id="ntr-comment" class="ntr-input" maxlength="1000" rows="4" placeholder="Что передано, итог и договорённости"></textarea></div><div class="ntr-gps">📍 При подтверждении CRM запросит точную геолокацию. Координата с погрешностью более 200 м не принимается.</div></div><footer class="ntr-footer"><button type="button" class="ntr-cancel" onclick="closeNetworkTransfer()">Отмена</button><button type="button" class="ntr-save" id="ntr-save" onclick="submitNetworkTransfer()">Подтвердить передачу</button></footer></section></div>`);
  const overlay=document.getElementById('modal-network-transfer');
  overlay.addEventListener('click',e=>{if(e.target===overlay)window.closeNetworkTransfer();});
  new MutationObserver(()=>{if(!overlay.classList.contains('open')){if(ntrSaving){overlay.classList.add('open');return;}unlockNetworkTransferUi();}}).observe(overlay,{attributes:true,attributeFilter:['class']});
}

function syncNtrViewport(){
  const overlay=document.getElementById('modal-network-transfer');if(!overlay)return;
  const vv=window.visualViewport;
  overlay.style.setProperty('--ntr-height',Math.max(320,Math.round(vv?.height||window.innerHeight))+'px');
  overlay.style.setProperty('--ntr-top',Math.round(vv?.offsetTop||0)+'px');
}
function lockNetworkTransferUi(){
  savedHtmlOverflow=document.documentElement.style.overflow;savedBodyOverflow=document.body.style.overflow;
  document.documentElement.style.overflow='hidden';document.body.style.overflow='hidden';document.body.classList.add('ntr-dialog-open');
  syncNtrViewport();window.visualViewport?.addEventListener('resize',syncNtrViewport);window.visualViewport?.addEventListener('scroll',syncNtrViewport);window.addEventListener('resize',syncNtrViewport);
}
function unlockNetworkTransferUi(){
  document.documentElement.style.overflow=savedHtmlOverflow;document.body.style.overflow=savedBodyOverflow;document.body.classList.remove('ntr-dialog-open');
  window.visualViewport?.removeEventListener('resize',syncNtrViewport);window.visualViewport?.removeEventListener('scroll',syncNtrViewport);window.removeEventListener('resize',syncNtrViewport);
}
function setSavingState(on,label){
  ntrSaving=!!on;
  const overlay=document.getElementById('modal-network-transfer');if(!overlay)return;
  overlay.querySelectorAll('button,input,textarea').forEach(el=>{el.disabled=!!on;});
  const btn=document.getElementById('ntr-save');if(btn)btn.textContent=label||(on?'Сохраняю…':'Подтвердить передачу');
}
function setResult(value){
  ntrSelectedResult=RESULT_OPTIONS.includes(value)?value:RESULT_OPTIONS[0];
  document.querySelectorAll('#ntr-results .ntr-result').forEach(b=>b.classList.toggle('active',b.dataset.ntrResult===ntrSelectedResult));
}
window.selectNetworkTransferResult=function(btn){if(ntrSaving)return;setResult(btn?.dataset?.ntrResult||RESULT_OPTIONS[0]);};
window.closeNetworkTransfer=function(){
  if(ntrSaving)return;
  const overlay=document.getElementById('modal-network-transfer');if(overlay)overlay.classList.remove('open');
  currentRouteId=null;unlockNetworkTransferUi();
};

function parseStoredComment(raw){
  const text=String(raw||'');const m=text.match(/^Результат передачи:\s*([^\n]+)(?:\n([\s\S]*))?$/i);
  if(!m)return{result:RESULT_OPTIONS[0],comment:text};
  return{result:RESULT_OPTIONS.includes(m[1].trim())?m[1].trim():RESULT_OPTIONS[0],comment:String(m[2]||'')};
}

window.openNetworkTransfer=function(routeId){
  ensureModal();
  const row=(allRoutePlans||[]).find(r=>String(r.id)===String(routeId));
  if(!row||!row.is_network_point){alert('Сетевая точка маршрута не найдена.');return;}
  if(String(row.manager_name||'')!==String(currentProfile?.name||'')){alert('Эта точка закреплена за другим менеджером.');return;}
  if(String(row.visit_date||'').slice(0,10)!==String(TODAY)){alert('Передачу можно отметить только в дату маршрута.');return;}
  currentRouteId=String(routeId);
  const place=(row.network_name||row.client_name||'Сеть')+' · '+[row.city,row.address].filter(Boolean).join(', ')+' · '+String(row.visit_date||TODAY).slice(0,10);
  document.getElementById('ntr-point').textContent=place;
  document.getElementById('ntr-recipient').value=row.network_transfer_recipient||'';
  const saved=parseStoredComment(row.network_transfer_comment||'');
  document.getElementById('ntr-comment').value=saved.comment;setResult(saved.result);
  const overlay=document.getElementById('modal-network-transfer');overlay.classList.add('open');lockNetworkTransferUi();
  if(window.matchMedia?.('(min-width:769px)').matches)setTimeout(()=>document.getElementById('ntr-recipient')?.focus(),120);
};

function getPrecisePosition(){return new Promise((resolve,reject)=>{
  if(!navigator.geolocation){reject(new Error('На устройстве недоступна геолокация.'));return;}
  navigator.geolocation.getCurrentPosition(resolve,e=>reject(new Error(e.message||'Не удалось определить местоположение.')),{enableHighAccuracy:true,timeout:20000,maximumAge:0});
});}

window.submitNetworkTransfer=async function(){
  const recipient=String(document.getElementById('ntr-recipient')?.value||'').trim();
  const comment=String(document.getElementById('ntr-comment')?.value||'').trim();
  if(!RESULT_OPTIONS.includes(ntrSelectedResult)){alert('Выберите результат передачи.');return;}
  if(recipient.length<2){alert('Укажите, кому выполнена передача.');document.getElementById('ntr-recipient')?.focus();return;}
  if(ntrSelectedResult==='Требуется повторный контакт'&&comment.length<3){alert('Для повторного контакта кратко укажите причину и договорённость.');document.getElementById('ntr-comment')?.focus();return;}
  const storedComment='Результат передачи: '+ntrSelectedResult+(comment?'\n'+comment:'');
  setSavingState(true,'Определяю GPS…');
  try{
    const pos=await getPrecisePosition(),acc=Number(pos.coords.accuracy)||9999;
    if(acc>200)throw new Error('Погрешность GPS '+Math.round(acc)+' м. Выйдите ближе к открытому месту и повторите. Требуется не более 200 м.');
    setSavingState(true,'Сохраняю…');
    const {data,error}=await db.rpc('crm_v2271_complete_network_transfer',{p_route_plan_id:currentRouteId,p_recipient:recipient,p_comment:storedComment,p_lat:Number(pos.coords.latitude),p_lng:Number(pos.coords.longitude),p_accuracy:acc});
    if(error)throw error;
    const row=data?.row||data;
    const idx=(allRoutePlans||[]).findIndex(r=>String(r.id)===String(currentRouteId));if(idx>=0&&row)allRoutePlans[idx]={...allRoutePlans[idx],...row};
    const rc=(routeClients||[]).find(c=>String(c.route_plan_id)===String(currentRouteId));if(rc&&row){rc.network_transfer_status=row.network_transfer_status;rc.network_transfer_recipient=row.network_transfer_recipient;rc.network_transfer_completed_at=row.network_transfer_completed_at;rc.visited=!!row.visited;}
    setSavingState(false);window.closeNetworkTransfer();
    window.renderMyRoutes?.();if(document.getElementById('page-route')?.classList.contains('active'))window.renderRoute?.();
    alert('Передача сохранена.'+(data?.distance_m!=null?'\nРасстояние до точки: '+Math.round(Number(data.distance_m))+' м.':''));
  }catch(e){setSavingState(false);alert('Не удалось сохранить передачу:\n'+String(e?.message||e));}
};

document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.getElementById('modal-network-transfer')?.classList.contains('open'))window.closeNetworkTransfer();});

function addressNumber(v){const m=String(v||'').match(/(\d+[а-яa-z]?(?:[\/-]\d+[а-яa-z]?)?)/i);return m?norm(m[1]):'';}
function inBelarus(lat,lng){return lat>=51.1&&lat<=56.3&&lng>=23.0&&lng<=32.9;}
async function geocodeOne(n){
  const q=['Беларусь',n.region,n.city,n.address].filter(Boolean).join(', ');
  const response=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=by&accept-language=ru&q='+encodeURIComponent(q),{headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('Геокодер HTTP '+response.status);
  const data=await response.json(),city=norm(n.city),num=addressNumber(n.address);
  for(const x of Array.isArray(data)?data:[]){const lat=Number(x.lat),lng=Number(x.lon),label=String(x.display_name||'');if(!inBelarus(lat,lng))continue;const nl=norm(label);if(city&&!nl.includes(city))continue;if(num&&!nl.includes(num))continue;return{lat,lng,label};}
  return null;
}

window.v2271GeocodeNetworkPoints=async function(manager){
  if(geoBusy||currentProfile?.role!=='boss')return;
  let rows=[];try{rows=(await loadAllRows('route_network_points')||[]).filter(n=>n.active!==false&&norm(n.manager_name)===norm(manager)&&!(Number.isFinite(Number(n.lat))&&Number.isFinite(Number(n.lng))));}catch(e){alert('Сначала установите SQL v22.7.1.');return;}
  if(!rows.length){alert('У '+manager+' все сетевые точки уже имеют координаты.');return;}
  if(!confirm('Геокодировать сетевые точки '+manager+' без координат: '+rows.length+'?\n\nСохранённые координаты не изменяются.'))return;
  geoBusy=true;const btn=document.getElementById('mrl-network-geocode');let ok=0,miss=0;
  try{
    for(let i=0;i<rows.length;i++){
      if(btn){btn.disabled=true;btn.textContent='📍 '+(i+1)+'/'+rows.length;}
      try{const hit=await geocodeOne(rows[i]);if(hit){const patch={lat:hit.lat,lng:hit.lng,geocoded_at:new Date().toISOString(),geocode_status:'ok',geocode_label:'nominatim: '+hit.label,updated_at:new Date().toISOString()};const {error}=await db.from('route_network_points').update(patch).eq('id',rows[i].id);if(error)throw error;ok++;}else miss++;}catch(e){console.warn('network geocode',rows[i],e);miss++;}
      await sleep(1700);
    }
    window.dispatchEvent(new CustomEvent('resanta-network-points-updated'));
    alert('Геокодирование сетевых точек завершено.\n\nС координатами: '+ok+'\nНе распознано: '+miss+'.');
  }finally{geoBusy=false;if(btn){btn.disabled=false;btn.textContent='📍 Геокодировать сети';}}
};


ensureModal();
window.RESANTA_V2272=Object.freeze({version:VERSION,networkPointsSeparateFromClients:true,noSalesAnalytics:true,bossAddsToRoute:true,managerGpsTransfer:true,gpsAccuracyMaxMeters:200,responsiveFullScreenTablet:true,backgroundScrollLocked:true,stickyActions:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 31 ===== */
// ===== v22.7.3: отдельный раздел «Сети», быстрый вход, строгий товарный профиль =====
(function(){
'use strict';
const VERSION='v22.7.3';
let networkRows=[],networkLoaded=false,networkLoading=null;
const escN=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const normN=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,' ').trim();
const isBoss=()=>currentProfile?.role==='boss';
const myManager=()=>String(currentProfile?.name||'');
function visibleNetworks(){return (networkRows||[]).filter(x=>x.active!==false&&(isBoss()||normN(x.manager_name)===normN(myManager())));}
function routeRowsForNetwork(id){return (allRoutePlans||[]).filter(r=>r.is_network_point&&!r.removed&&String(r.network_point_id||'')===String(id));}
function latestTransfer(rows){return rows.filter(r=>r.network_transfer_status==='completed'||r.visited===true).sort((a,b)=>String(b.network_transfer_completed_at||b.visit_date||'').localeCompare(String(a.network_transfer_completed_at||a.visit_date||'')))[0]||null;}
function nextRoute(rows){return rows.filter(r=>String(r.visit_date||'')>=String(TODAY)&&!(r.network_transfer_status==='completed'||r.visited===true)).sort((a,b)=>String(a.visit_date||'').localeCompare(String(b.visit_date||'')))[0]||null;}

function ensureStatusBanner(){
  if(document.getElementById('v2273-status'))return;
  const b=document.createElement('div');b.id='v2273-status';b.style.cssText='display:none;margin:0 0 12px;padding:9px 12px;border:1px solid #BFDBFE;border-radius:10px;background:#EFF6FF;color:#1D4ED8;font-size:12px;line-height:1.4';
  const page=document.getElementById('page-dashboard');if(page)page.insertBefore(b,page.firstChild);
}
window.addEventListener('resanta-v2273-status',e=>{ensureStatusBanner();const b=document.getElementById('v2273-status'),d=e.detail||{};if(!d.text||d.kind==='done'){b.style.display='none';return;}b.style.display='block';b.textContent=(d.kind==='ok'?'✅ ':'⏳ ')+d.text;b.style.background=d.kind==='ok'?'#F0FDF4':'#EFF6FF';b.style.borderColor=d.kind==='ok'?'#BBF7D0':'#BFDBFE';b.style.color=d.kind==='ok'?'#166534':'#1D4ED8';});

function ensureNetworksUi(){
  if(document.getElementById('page-networks'))return;
  const style=document.createElement('style');style.id='v2273-networks-style';style.textContent=`
    .net-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px}.net-kpi{background:#fff;border:1px solid var(--border);border-radius:12px;padding:13px}.net-kpi b{display:block;font-size:21px}.net-kpi span{font-size:11px;color:var(--sub)}
    .net-toolbar{display:grid;grid-template-columns:170px 170px 170px minmax(220px,1fr);gap:8px;margin-bottom:12px}.net-card{background:#fff;border:1px solid var(--border);border-radius:12px;padding:13px;margin-bottom:8px}.net-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.net-title{font-size:14px;font-weight:750}.net-badge{display:inline-flex;padding:3px 8px;border-radius:99px;background:#DBEAFE;color:#1D4ED8;font-size:10px;font-weight:750}.net-meta{font-size:12px;color:var(--sub);line-height:1.5;margin-top:6px}.net-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.net-ok{color:#15803D}.net-warn{color:#B45309}.net-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px}.net-mini{background:var(--bg);border-radius:9px;padding:9px;font-size:11px;line-height:1.4}
    @media(max-width:900px){.net-kpis{grid-template-columns:1fr 1fr}.net-toolbar{grid-template-columns:1fr 1fr}.net-grid{grid-template-columns:1fr}}
    @media(max-width:560px){.net-kpis,.net-toolbar{grid-template-columns:1fr}.net-card{padding:11px}.net-head{display:block}.net-badge{margin-top:6px}}
  `;document.head.appendChild(style);
  const main=document.querySelector('.main');
  const page=document.createElement('div');page.className='page';page.id='page-networks';page.innerHTML=`
    <div class="page-header"><div><h1>🏬 Сети</h1><p>Сетевые торговые точки для передачи информации. Не входят в клиентскую базу, продажи, АКБ, ABC, планы и товарные ИИ-задачи.</p></div><button class="btn-secondary" onclick="refreshNetworks2273(true)">↻ Обновить</button></div>
    <div id="net-status" style="font-size:12px;color:var(--sub);margin-bottom:10px"></div>
    <div class="net-kpis" id="net-kpis"></div>
    <div class="net-toolbar"><select class="form-input" id="net-manager"></select><select class="form-input" id="net-network"></select><select class="form-input" id="net-status-filter"><option value="all">Все статусы</option><option value="planned">Запланированы</option><option value="completed">Есть передача</option><option value="no-coords">Без координат</option></select><input class="form-input" id="net-search" placeholder="Поиск сети, города или адреса"></div>
    <div id="net-list"></div>`;
  main?.appendChild(page);

  const sidebar=document.querySelector('.sidebar'),bossSec=document.getElementById('nav-section-boss');
  if(sidebar&&!document.getElementById('nav-networks')){const n=document.createElement('button');n.className='nav-item';n.id='nav-networks';n.setAttribute('onclick',"goPage('networks','Сети')");n.innerHTML='<span class="icon">🏬</span> Сети';sidebar.insertBefore(n,bossSec||null);}
  const bottom=document.querySelector('.bottom-nav');
  if(bottom&&!document.getElementById('bn-networks')){const n=document.createElement('button');n.className='bn-item';n.id='bn-networks';n.setAttribute('onclick',"goPage('networks','Сети')");n.innerHTML='<span>🏬</span><small>Сети</small>';bottom.appendChild(n);}
  ['net-manager','net-network','net-status-filter'].forEach(id=>document.getElementById(id)?.addEventListener('change',renderNetworks2273));document.getElementById('net-search')?.addEventListener('input',renderNetworks2273);
}

async function loadNetworks(force=false){
  if(networkLoaded&&!force)return networkRows;if(networkLoading&&!force)return networkLoading;
  networkLoading=(async()=>{const st=document.getElementById('net-status');if(st)st.textContent='Загружаю сетевые точки…';try{networkRows=(await loadAllRows('route_network_points')||[]).filter(x=>x.active!==false);networkLoaded=true;if(st)st.textContent='Загружено сетевых точек: '+networkRows.length+'.';return networkRows;}catch(e){networkRows=[];networkLoaded=false;if(st)st.innerHTML='<span style="color:var(--r)">Сети не загрузились: '+escN(e.message||e)+'. Проверьте установку SQL v22.7.1.</span>';throw e;}finally{networkLoading=null;}})();return networkLoading;
}
function fillFilters(rows){
  const mgr=document.getElementById('net-manager'),net=document.getElementById('net-network');if(!mgr||!net)return;
  const oldM=mgr.value,oldN=net.value;
  const managers=[...new Set(rows.map(x=>x.manager_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));mgr.innerHTML=(isBoss()?'<option value="all">Все менеджеры</option>':'')+managers.map(x=>'<option value="'+escN(x)+'">'+escN(x)+'</option>').join('');mgr.style.display=isBoss()?'block':'none';mgr.value=isBoss()&&(oldM==='all'||managers.includes(oldM))?oldM:(isBoss()?'all':myManager());
  const nets=[...new Set(rows.map(x=>x.network_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));net.innerHTML='<option value="all">Все сети</option>'+nets.map(x=>'<option value="'+escN(x)+'">'+escN(x)+'</option>').join('');net.value=oldN==='all'||nets.includes(oldN)?oldN:'all';
}
window.renderNetworks2273=function(){
  ensureNetworksUi();const base=visibleNetworks();fillFilters(base);
  const manager=document.getElementById('net-manager')?.value||'all',network=document.getElementById('net-network')?.value||'all',status=document.getElementById('net-status-filter')?.value||'all',q=normN(document.getElementById('net-search')?.value||'');
  let rows=base.filter(n=>(manager==='all'||n.manager_name===manager)&&(network==='all'||n.network_name===network));
  rows=rows.filter(n=>{const plans=routeRowsForNetwork(n.id),last=latestTransfer(plans),next=nextRoute(plans),coords=Number.isFinite(Number(n.lat))&&Number.isFinite(Number(n.lng));if(status==='planned'&&!next)return false;if(status==='completed'&&!last)return false;if(status==='no-coords'&&coords)return false;return !q||normN([n.network_name,n.manager_name,n.region,n.city,n.address].join(' ')).includes(q);});
  const all=base,withCoords=all.filter(n=>Number.isFinite(Number(n.lat))&&Number.isFinite(Number(n.lng))).length,planned=all.filter(n=>!!nextRoute(routeRowsForNetwork(n.id))).length,completed=all.filter(n=>!!latestTransfer(routeRowsForNetwork(n.id))).length;
  document.getElementById('net-kpis').innerHTML=`<div class="net-kpi"><b>${all.length}</b><span>сетевых точек</span></div><div class="net-kpi"><b>${withCoords}</b><span>с координатами</span></div><div class="net-kpi"><b>${planned}</b><span>запланировано</span></div><div class="net-kpi"><b>${completed}</b><span>с выполненной передачей</span></div>`;
  const list=document.getElementById('net-list');if(!rows.length){list.innerHTML='<div class="empty">По выбранным фильтрам сетевых точек нет.</div>';return;}
  list.innerHTML=rows.sort((a,b)=>String(a.manager_name||'').localeCompare(String(b.manager_name||''),'ru')||String(a.city||'').localeCompare(String(b.city||''),'ru')||String(a.network_name||'').localeCompare(String(b.network_name||''),'ru')).map(n=>{
    const plans=routeRowsForNetwork(n.id),last=latestTransfer(plans),next=nextRoute(plans),coords=Number.isFinite(Number(n.lat))&&Number.isFinite(Number(n.lng));
    return `<div class="net-card"><div class="net-head"><div><div class="net-title">🏬 ${escN(n.network_name||'Сетевая точка')}</div><div class="net-meta">📍 ${escN([n.city,n.address].filter(Boolean).join(', '))}<br>👤 ${escN(n.manager_name||'—')} · Категория ${escN(n.category||'AAA')}</div></div><span class="net-badge">передача · без продаж</span></div><div class="net-grid"><div class="net-mini"><b>Координаты:</b> <span class="${coords?'net-ok':'net-warn'}">${coords?'готовы':'не определены'}</span>${n.geocode_label?'<br>'+escN(n.geocode_label):''}</div><div class="net-mini"><b>Ближайший маршрут:</b> ${next?escN(next.visit_date)+' · '+escN(next.review_status||'отправлен'):'не запланирован'}<br><b>Последняя передача:</b> ${last?escN(String(last.network_transfer_completed_at||last.visit_date).slice(0,10))+' · '+escN(last.network_transfer_recipient||'—'):'ещё не выполнена'}</div></div><div class="net-actions">${isBoss()?'<button class="btn-secondary" onclick="goPage(\'routes-boss\',\'Маршруты\')">Добавить в маршрут</button>':''}${isBoss()&&!coords?'<button class="btn-secondary" onclick="v2271GeocodeNetworkPoints(\''+escN(n.manager_name)+'\')">📍 Геокодировать точки менеджера</button>':''}</div></div>`;
  }).join('');
};
window.refreshNetworks2273=async function(force=false){ensureNetworksUi();try{await loadNetworks(force);renderNetworks2273();}catch(_){}};
window.crmPrefetchNetworksV22734=()=>loadNetworks(false);
window.addEventListener('resanta-network-points-updated',()=>{networkLoaded=false;if(document.getElementById('page-networks')?.classList.contains('active'))refreshNetworks2273(true);});

const previousGo=window.goPage;
window.goPage=function(page,title){
  ensureNetworksUi();
  const out=previousGo.apply(this,arguments);
  if(page==='networks')crmSchedulePageHook('networks',()=>refreshNetworks2273(false),0);
  // Tasks are now a pure cached render. Stock/price are loaded ONLY after
  // an explicit "Проверить наличие" / "Подобрать замену" click.
  const feature=(page==='promotions'||page==='budgets')?'promotions':page==='debt'?'debt':page==='vip'?'vip':null;
  if(feature){
    const already=!!v2273FeatureState[feature]?.loaded;
    if(!already)crmSchedulePageHook(page,async()=>{
      try{
        await v2273EnsureFeature(feature);
        if(crmActivePage()!==page)return;
        try{window.crmSingleRenderMarkPageV227327?.(page);}catch(_){}
        if(typeof window.crmSingleRenderRequestV227327==='function')window.crmSingleRenderRequestV227327(page,{reason:'feature-ready',delay:20});
        else if(page==='promotions')renderPromotions();
        else if(page==='budgets')renderBudgetsPage();
        else if(page==='debt')renderDebt();
        else if(page==='vip')renderVip();
      }catch(e){console.warn('lazy page '+page,e);}
    },5);
  }
  return out;
};

const previousOpenClient=window.openClient;
if(typeof previousOpenClient==='function')window.openClient=async function(id){try{await Promise.race([v2273EnsureFeature('client-details'),new Promise(r=>setTimeout(r,900))]);}catch(_){}return previousOpenClient.apply(this,arguments);};

ensureNetworksUi();ensureStatusBanner();
window.RESANTA_V2273=Object.freeze({version:VERSION,fastCoreParallelLoad:true,purchaseHistoryIndexedDbCache:true,heavyAnalyticsLazy:true,triovistLazy:true,strictWholeWordCategoryProfile:true,sanitaryStoreDoesNotMatchGarden:true,networksDedicatedSection:true,networksNoSales:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 32 ===== */
// ============================================================================
// RESANTA CRM v22.7.4 · персональные ИИ-задачи для падающих клиентов.
// Только UI/index.html: данные продаж, маршрутов, GPS и Supabase-схема не меняются.
// ============================================================================
(function(){
'use strict';
const VERSION='v22.7.4';
let draft=null, saving=false;

function n(v){return String(v||'').trim();}
function money(v){return fmtMoney(Math.round((Number(v)||0)*100)/100)+' BYN';}
function dateOnly(v){return String(v||'').slice(0,10);}
function active(t){try{return isActiveTask(t);}catch(_){return !!t&&!t.done&&t.review_status!=='rejected';}}
function sameClient(t,c){return !!t&&!!c&&((t.client_id&&String(t.client_id)===String(c.id))||nameLooseMatch(t.client_name||'',c.name||''));}
function activeClientTask(c){return (allTasks||[]).find(t=>active(t)&&sameClient(t,c))||null;}
function fallingTask(t){return String(t?.source||'')==='falling_ai'||/\[ПАДЕНИЕ ПРОДАЖ\]|восстановить продажи клиента/i.test(String(t?.text||''));}
function leaderNote(c){return n(document.getElementById('fall-note-'+c.id)?.value);}
function futureRoute(c){
  if(typeof window.v22716FutureRoute==='function')return window.v22716FutureRoute(c);
  return (allRoutePlans||[]).filter(r=>{
    if(r.removed||dateOnly(r.visit_date)<TODAY)return false;
    const approved=r.approved===true||r.review_status==='approved';
    if(!approved)return false;
    if(c?.manager_name&&r.manager_name&&!managerLooseMatch(r.manager_name,c.manager_name))return false;
    return (r.client_id&&String(r.client_id)===String(c.id))||nameLooseMatch(r.client_name||'',c.name||'');
  }).sort((a,b)=>dateOnly(a.visit_date).localeCompare(dateOnly(b.visit_date)))[0]||null;
}
function recentNegotiation(c){
  return (allNegotiations||[]).filter(x=>nameLooseMatch(x.client_name||'',c.name||'')&&(!x.manager_name||!c.manager_name||managerLooseMatch(x.manager_name,c.manager_name)))
    .sort((a,b)=>String(b.date||b.created_at||'').localeCompare(String(a.date||a.created_at||'')))[0]||null;
}
function skuFromItem(p){
  const key=String(p?.key||'');const m=key.match(/\|sku:([^|]+)$/i);if(m)return m[1];
  const label=String(p?.label||'');const direct=label.match(/^([^·]+)\s*·/);return direct?n(direct[1]):'';
}
function productFromItem(p){const label=String(p?.label||'');return label.includes('·')?n(label.split('·').slice(1).join('·')):label;}
function reservedQty(sku){
  const k=_normSku(sku);let qty=0;
  (allTasks||[]).filter(active).forEach(t=>(Array.isArray(t.ai_stock_items)?t.ai_stock_items:[]).forEach(x=>{if(_normSku(x.sku)===k)qty+=Math.max(0,Number(x.qty)||0);}));
  return qty;
}
function stockPolicyLocal(sku){
  const st=_availBySku(sku),avail=st?Math.max(0,Number(st.avail)||0):0,reserved=reservedQty(sku);
  let safety=0;if(avail<=3)safety=avail;else if(avail<=10)safety=2;else safety=Math.max(3,Math.ceil(avail*.10));
  const free=Math.max(0,avail-reserved-safety);let maxQty=0;if(avail>=4&&free>0)maxQty=avail<=10?Math.min(2,free):Math.min(free,Math.max(1,Math.floor(free*.20)));
  return {stock:st,avail,reserved,safety,free,maxQty,ok:!!st&&maxQty>0};
}
function itemQtyStats(c,p,row){
  const current=new Set(row.period.current),previous=new Set(row.period.previous);let cur=0,prev=0;
  const target=_normSku(skuFromItem(p));
  const hist=(typeof window.v22716FallingHist==='function'?window.v22716FallingHist(c):getClientHistFast(c));
  hist.forEach(r=>{
    const g=abcCanonicalGroup(r.category)||String(r.category||'Без группы').trim();
    const rk=_normSku(abcResolveSku(r,g));
    const same=target?rk===target:abcNorm(r.product||'')===abcNorm(productFromItem(p));if(!same)return;
    const m=String(r.month||'').slice(0,7),q=Math.max(0,Number(r.qty)||0);if(current.has(m))cur+=q;if(previous.has(m))prev+=q;
  });
  return {cur,prev,gap:Math.max(0,prev-cur)};
}
function stockItems(c,row){
  let st;try{st=_stockStatus();}catch(_){st={ok:false,reason:'Остатки Витебска ещё не загружены.',latest:''};}
  if(!st.ok)return {status:st,items:[]};
  const ranked=(row.breakdown.items||[]).slice().sort((a,b)=>{
    const rank=x=>String(x.abc||'').toUpperCase()==='A'?0:String(x.abc||'').toUpperCase()==='B'?1:2;
    return rank(a)-rank(b)||b.loss-a.loss;
  });
  const out=[];
  for(const p of ranked){
    if(out.length>=5)break;
    const cls=String(p.abc||'').toUpperCase();
    if(cls&&cls!=='A'&&cls!=='B'&&out.length>=2)continue;
    let sku=skuFromItem(p),stock=sku?_availBySku(sku):null;
    if(!stock){const alt=_availableProductInfo(productFromItem(p));if(alt){sku=alt.sku;stock=alt;}}
    if(!stock||Number(stock.avail)<=0||out.some(x=>_normSku(x.sku)===_normSku(stock.sku)))continue;
    const pol=stockPolicyLocal(stock.sku);if(!pol.ok)continue;
    const qs=itemQtyStats(c,p,{period:row.period});
    const qty=Math.max(1,Math.min(pol.maxQty,Math.ceil(qs.gap||1)));
    out.push({sku:stock.sku,product:stock.product||productFromItem(p),qty,avail:pol.avail,free_avail:pol.free,reserved_other:pol.reserved,safety_stock:pol.safety,abc_class:cls||'—',category:p.group||'',loss:Number(p.loss)||0,selection_reason:'Потеря '+money(p.loss)+' · ABC '+(cls||'не определён')+' · свободно после резерва и страхового остатка '+pol.free+' шт.'});
  }
  return {status:st,items:out};
}
function priority(row){return row.severity==='critical'?'высокий':row.severity==='action'?'высокий':'средний';}
function targetRevenue(row){const share=row.severity==='critical'?0.30:row.severity==='action'?0.25:0.20;return Math.round(Math.min(row.loss,Math.max(Math.min(row.loss,300),row.loss*share))*100)/100;}
function buildDraft(row,note){
  const c=row.client,route=futureRoute(c),neg=recentNegotiation(c),stock=stockItems(c,row),groups=(row.breakdown.cats||[]).slice(0,4);
  const due=route?dateOnly(route.visit_date):'';
  const items=stock.items,target=targetRevenue(row),groupText=groups.map(x=>x.name+' (−'+money(x.loss)+')').join(', ')||'детализация по группам отсутствует';
  const itemText=items.length?'\nТовары к согласованию:\n'+items.map((x,i)=>(i+1)+'. ['+x.sku+'] '+x.product+' — '+x.qty+' шт. (ABC '+x.abc_class+', доступно '+x.free_avail+')').join('\n'):'';
  const visit=row.visit?dateOnly(row.visit.date||row.visit.created_at):'не было';
  const routeText=route?dateOnly(route.visit_date)+' · '+[route.city,route.address].filter(Boolean).join(', '):'не запланирован';
  const negText=neg?n(neg.notes||neg.text).slice(0,220):'нет записи';
  const task='[ПАДЕНИЕ ПРОДАЖ] Восстановить продажи клиента «'+c.name+'».\n'
    +'1. Отработать комментарий руководителя: '+note+'.\n'
    +'2. Выяснить и зафиксировать причины снижения по группам: '+groupText+'.\n'
    +(items.length?'3. Согласовать заказ по '+items.length+' приоритетным SKU из актуального свободного остатка Витебска.\n':'3. Уточнить фактическую потребность и согласовать конкретный товарный перечень; случайные SKU не подставлять.\n')
    +'4. Получить заказ/заявку либо зафиксировать причину отказа, ответственного ЛПР и конкретную дату следующего решения.'+itemText;
  const basis='Период '+row.period.label+' против '+row.period.previousLabel+'. Продажи с НДС: '+money(row.prev)+' → '+money(row.cur)+'. Потеря '+money(row.loss)+' (−'+row.pct.toFixed(1)+'%). Группы: '+groupText+'. Последний визит: '+visit+'. Следующий маршрут: '+routeText+'. Последние переговоры: '+negText+'. Комментарий руководителя: '+note+'. Остатки Витебска: '+(stock.status.ok?'от '+stock.status.latest+', подтверждено '+items.length+' SKU':'товарная часть не сформирована — '+stock.status.reason);
  const expected='Заказ или подтверждённая заявка не менее '+money(target)+(items.length?' и минимум по 1 позиции из согласованного перечня':'')+'; при отказе — зафиксированная причина и конкретная дата следующего решения.';
  const criteria='В CRM сохранены результат переговоров, заказ/заявка либо причина отказа, ЛПР и дата следующего шага. Выполнение подтверждается документом заказа или записью переговоров.';
  return {row,c,note,route,stock,items,due,title:'Восстановить продажи: '+c.name,text:task,basis,expected,criteria,priority:priority(row),target};
}
function installModal(){
  if(document.getElementById('modal-v2274-falling-ai'))return;
  document.body.insertAdjacentHTML('beforeend',`<div class="modal-bg" id="modal-v2274-falling-ai"><div class="modal v2274-ai-modal">
    <div class="v2274-ai-head"><div><div class="modal-title">🎯 ИИ-задача по падающему клиенту</div><div id="v2274-ai-client" style="font-size:12px;color:var(--sub);margin-top:3px"></div></div><button class="modal-close" onclick="v2274CloseFallingAi()">×</button></div>
    <div class="v2274-ai-body"><div id="v2274-ai-summary" class="v2274-summary"></div>
      <div class="form-field"><label class="form-label">Комментарий руководителя *</label><textarea class="form-input" id="v2274-ai-note" rows="2"></textarea></div>
      <div class="v2274-grid"><div class="form-field"><label class="form-label">Срок = согласованный маршрут *</label><input class="form-input" type="date" id="v2274-ai-date" readonly><div style="font-size:10px;color:var(--sub);margin-top:4px">Дата автоматически берётся из ближайшей будущей согласованной точки маршрута и вручную не меняется.</div></div><div class="form-field"><label class="form-label">Приоритет</label><select class="form-input" id="v2274-ai-priority"><option value="высокий">Высокий</option><option value="средний">Средний</option></select></div></div>
      <div class="form-field"><label class="form-label">Задача — руководитель проверяет и может отредактировать *</label><textarea class="form-input" id="v2274-ai-text" rows="9"></textarea></div>
      <div class="form-field"><label class="form-label">Ожидаемый результат *</label><textarea class="form-input" id="v2274-ai-expected" rows="3"></textarea></div>
      <div class="form-field"><label class="form-label">Критерий выполнения *</label><textarea class="form-input" id="v2274-ai-criteria" rows="3"></textarea></div>
      <div class="form-field"><label class="form-label">Основание расчёта</label><textarea class="form-input" id="v2274-ai-basis" rows="5" readonly></textarea></div>
      <div id="v2274-ai-stock"></div>
    </div>
    <div class="v2274-ai-foot"><button class="btn-secondary" onclick="v2274CloseFallingAi()">Отмена</button><button class="btn-primary" id="v2274-ai-save" onclick="v2274ApproveFallingAi()">Проверил — назначить менеджеру</button></div>
  </div></div>`);
  document.getElementById('modal-v2274-falling-ai').addEventListener('click',e=>{if(e.target.id==='modal-v2274-falling-ai')window.v2274CloseFallingAi();});
}
function stockHtml(d){
  const st=d.stock.status;if(!st.ok)return '<div class="v2274-stock warn">⚠️ '+esc(st.reason)+' Товарные SKU не включены, но задачу по выяснению причины падения можно назначить.</div>';
  if(!d.items.length)return '<div class="v2274-stock warn">⚠️ В свободном остатке Витебска не найдено подходящих потерянных SKU. CRM не подставляет случайный ассортимент.</div>';
  return '<div class="v2274-stock"><b>📦 Подтверждено по складу Витебска: '+esc(st.latest)+'</b>'+d.items.map(x=>'<div class="v2274-item"><b>'+esc(x.sku)+'</b><span>'+esc(x.product)+'<br><small>ABC '+esc(x.abc_class)+' · потеря '+money(x.loss)+'</small></span><span>'+x.qty+' шт.</span><span>свободно '+x.free_avail+'</span></div>').join('')+'</div>';
}
window.v2274OpenFallingAi=async function(id){
  if(currentProfile?.role!=='boss'){alert('ИИ-задачу формирует и подтверждает руководитель.');return;}
  const data=v20ComputeFalling(),row=data.rows.find(x=>String(x.client.id)===String(id));if(!row){alert('Клиент уже не находится в активном списке падения. Пересчитайте период.');return;}
  row.period=data.period;
  const existing=activeClientTask(row.client);if(existing){alert('У клиента уже есть активная задача:\n\n'+String(existing.text||'').slice(0,350)+'\n\nСначала завершите или скорректируйте её, чтобы не создавать дубль.');return;}
  const note=leaderNote(row.client);if(!note){alert('Сначала заполните комментарий руководителя под карточкой клиента. Он обязателен и будет главным приоритетом ИИ-задачи.');document.getElementById('fall-note-'+id)?.focus();return;}
  const route=futureRoute(row.client);if(!route){alert('У клиента нет будущей СОГЛАСОВАННОЙ точки маршрута. ИИ-задача по падению не назначается без маршрута. Сначала добавьте/согласуйте визит, затем сформируйте задачу.');return;}
  draft=buildDraft(row,note);installModal();
  document.getElementById('v2274-ai-client').textContent=draft.c.name+' · '+(draft.c.manager_name||'—');
  document.getElementById('v2274-ai-summary').innerHTML='<b>Падение '+draft.row.pct.toFixed(1)+'% · потеря '+money(draft.row.loss)+'</b><br>Срок <b>'+esc(draft.due)+'</b> · 100% привязан к ближайшей будущей согласованной точке маршрута.';
  document.getElementById('v2274-ai-note').value=draft.note;document.getElementById('v2274-ai-date').value=draft.due;document.getElementById('v2274-ai-priority').value=draft.priority;document.getElementById('v2274-ai-text').value=draft.text;document.getElementById('v2274-ai-expected').value=draft.expected;document.getElementById('v2274-ai-criteria').value=draft.criteria;document.getElementById('v2274-ai-basis').value=draft.basis;document.getElementById('v2274-ai-stock').innerHTML=stockHtml(draft);
  document.getElementById('modal-v2274-falling-ai').classList.add('open');document.body.style.overflow='hidden';
};
window.v2274CloseFallingAi=function(){document.getElementById('modal-v2274-falling-ai')?.classList.remove('open');document.body.style.overflow='';};
window.v2274ApproveFallingAi=async function(){
  if(saving||!draft)return;const c=draft.c;
  const currentRoute=futureRoute(c);if(!currentRoute){alert('Назначение остановлено: у клиента больше нет будущей согласованной точки маршрута. Сначала согласуйте маршрут.');return;}
  const due=dateOnly(currentRoute.visit_date);if(!due){alert('У согласованной точки маршрута нет корректной даты.');return;}
  const dateEl=document.getElementById('v2274-ai-date');if(dateEl)dateEl.value=due;
  const note=n(document.getElementById('v2274-ai-note')?.value),text=n(document.getElementById('v2274-ai-text')?.value),expected=n(document.getElementById('v2274-ai-expected')?.value),criteria=n(document.getElementById('v2274-ai-criteria')?.value),basis=n(document.getElementById('v2274-ai-basis')?.value),prio=n(document.getElementById('v2274-ai-priority')?.value)||'высокий';
  if(!note||!text||!expected||!criteria){alert('Заполните комментарий руководителя, задачу, ожидаемый результат и критерий выполнения.');return;}
  const duplicate=activeClientTask(c);if(duplicate){alert('Сохранение остановлено: у клиента уже появилась активная задача. Обновите раздел.');return;}
  if(!confirm('Назначить проверенную задачу менеджеру '+(c.manager_name||'—')+' со сроком '+due+'?'))return;
  saving=true;const btn=document.getElementById('v2274-ai-save');if(btn){btn.disabled=true;btn.textContent='Назначаю…';}
  try{
    const noteRow={client_id:String(c.id),client_name:c.name,note,updated_by:currentProfile?.name||null,updated_at:new Date().toISOString()};
    const noteRes=await db.from('falling_client_notes').upsert(noteRow,{onConflict:'client_id'});if(noteRes.error)throw new Error('Не удалось сохранить комментарий руководителя: '+noteRes.error.message);
    const st=draft.stock.status,items=draft.items||[];
    const approvedItems=items.map(x=>({sku:x.sku,product:x.product,qty:x.qty,warehouse:'Витебск',stock_at_approval:x.avail,free_at_approval:x.free_avail,reserved_other:x.reserved_other,safety_stock:x.safety_stock,abc_class:x.abc_class,selection_reason:x.selection_reason,category:x.category||null,subgroup:null,growth_kind:'falling_recovery'}));
    const payload={client_id:c.id,manager_name:c.manager_name||null,title:draft.title,text,due_date:due,done:false,auto_generated:true,review_status:'approved',reviewed_by:currentProfile?.name||null,reviewed_at:new Date().toISOString(),source:'falling_ai',priority:prio,basis,expected_result:expected,criteria,next_step:'Зафиксировать результат и следующую дату в CRM.',ai_reason:'Падение '+draft.row.pct.toFixed(1)+'%, потеря '+money(draft.row.loss)+'. Комментарий руководителя: '+note,ai_stock_items:approvedItems,ai_stock_snapshot_date:st.ok?st.latest:null,ai_stock_checked_at:new Date().toISOString(),ai_stock_status:items.length?'ok':'none',ai_stock_issue:st.ok?(items.length?null:'Подходящие потерянные SKU не найдены.'):st.reason,ai_stock_kpi_exempt:false,ai_stock_policy_version:'v22.6.8',ai_stock_replacements:[],ai_selection_context:{type:'falling_recovery',period:draft.row.period.start+'_'+draft.row.period.end,loss:draft.row.loss,pct:draft.row.pct,warehouse:'Витебск',leader_note:note}};
    const {data,error}=await db.from('tasks').insert(payload).select().single();if(error)throw new Error(error.message);if(data)allTasks.unshift(data);
    const sourceNote=document.getElementById('fall-note-'+c.id);if(sourceNote)sourceNote.value=note;
    window.v2274CloseFallingAi();renderFallingClients();setTimeout(()=>{const e=document.getElementById('fall-note-'+c.id);if(e)e.value=note;},0);try{renderTasks();buildDashboard();updateTasksAlertDot();}catch(_){ }
    alert('ИИ-задача проверена руководителем и назначена менеджеру. История сохранится после выполнения.');
  }catch(e){alert('Не удалось назначить задачу: '+(e.message||e));}
  finally{saving=false;if(btn){btn.disabled=false;btn.textContent='Проверил — назначить менеджеру';}}
};
function installRecoveryBlock(){
  if(currentProfile?.role!=='boss')return;const list=document.getElementById('falling-list');if(!list)return;document.getElementById('v2274-recovered')?.remove();
  const fallingIds=new Set((v20FallingRows||[]).map(x=>String(x.client.id)));
  const recovered=(allTasks||[]).filter(t=>fallingTask(t)&&active(t)&&t.client_id&&!fallingIds.has(String(t.client_id))).slice(0,20);
  if(!recovered.length)return;const box=document.createElement('div');box.id='v2274-recovered';box.className='card v2274-recovered';box.innerHTML='<div class="card-title">✅ Продажи восстановились — закрыть задачу с отчётом ('+recovered.length+')</div><div style="font-size:11px;color:var(--sub);margin-bottom:8px">Клиент уже вышел из активного падения. Задача не удаляется автоматически: менеджер должен сохранить фактический результат, после чего история останется в CRM.</div>'+recovered.map(t=>{const c=allClients.find(x=>String(x.id)===String(t.client_id));return '<div style="padding:7px 0;border-top:1px solid var(--border);font-size:12px"><b>'+esc(c?.name||t.client_name||'Клиент')+'</b> · '+esc(t.manager_name||'—')+' · срок '+esc(t.due_date||'—')+'</div>';}).join('')+'<button class="btn-secondary" style="margin-top:8px" onclick="goPage(\'tasks\',\'Задачи\')">Открыть задачи</button>';list.parentElement.insertBefore(box,list);
}
const baseCard=window.v20FallingCard;
window.v20FallingCard=function(x){
  let html=baseCard(x);if(currentProfile?.role!=='boss')return html;
  html=html.replace('📝 Комментарий руководителя для себя','📝 Комментарий руководителя для ИИ-задачи *')
    .replace('placeholder="Что обсудить, проверить или проконтролировать"','placeholder="Обязательное указание: что проверить, предложить или проконтролировать"');
  const old='<button class="btn-primary" onclick="v20OpenTaskForFalling(\''+x.client.id+'\')">Поставить задачу</button>';
  const replacement=x.task?'<button class="btn-secondary" disabled>Активная задача уже есть</button>':'<button class="btn-primary" onclick="v2274OpenFallingAi(\''+x.client.id+'\')">🎯 Сформировать ИИ-задачу</button>';
  html=html.replace(old,replacement);
  return html;
};
const baseRender=window.renderFallingClients;
window.renderFallingClients=function(){baseRender();setTimeout(installRecoveryBlock,0);};
installModal();
window.RESANTA_V2274=Object.freeze({version:VERSION,fallingAiTasks:true,leaderCommentRequired:true,duplicateProtection:true,vitebskStockOnly:true,recoveryHistory:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 33 ===== */
// ===== v22.7.6: чистые сигналы + восстановление маст-листа после объединений =====
(function(){
'use strict';
const VERSION='v22.7.6';
const MASTER_REFRESH_KEY='resanta_masterlist_full_refresh_v2276';
let masterRefreshBusy=false;

function refreshAlreadyDone(){
  try{return localStorage.getItem(MASTER_REFRESH_KEY)==='ok';}catch(_){return false;}
}
function markRefreshDone(){
  try{localStorage.setItem(MASTER_REFRESH_KEY,'ok');}catch(_){ }
}
window.RESANTA_MASTERLIST_REFRESH_PENDING=!refreshAlreadyDone();

// Сигналы теперь содержат только объективные блоки. Маршрут, качество текста
// визита и «выпал из плана» больше не используются для оценки менеджера.
const baseSignalTruth2276=buildSignalTruth;

// v22.7.32.2.8 — direct current Signals truth.
// The current product rules do NOT use route overdue, visit-quality or
// "fell out of plan" metrics in Signals, so the legacy heavy builder is never called.
let signalFastCache227328={full:null,dot:null};
function signalCacheSame227328(c,includeDataQuality){
  if(!c)return false;
  return c.includeDataQuality===includeDataQuality
    &&c.profile===currentProfile
    &&c.clients===allClients&&c.clientsLen===(allClients||[]).length
    &&c.tasks===allTasks&&c.tasksLen===(allTasks||[]).length
    &&c.promotions===allPromotions&&c.promotionsLen===(allPromotions||[]).length
    &&c.vipSales===allVipSales&&c.vipSalesLen===(allVipSales||[]).length
    &&c.history===allPurchaseHistory&&c.historyLen===(allPurchaseHistory||[]).length
    &&c.partial===allTaskPartialReviews&&c.partialLen===(allTaskPartialReviews||[]).length;
}
function signalCachePut227328(value,includeDataQuality){
  return {
    includeDataQuality,profile:currentProfile,
    clients:allClients,clientsLen:(allClients||[]).length,
    tasks:allTasks,tasksLen:(allTasks||[]).length,
    promotions:allPromotions,promotionsLen:(allPromotions||[]).length,
    vipSales:allVipSales,vipSalesLen:(allVipSales||[]).length,
    history:allPurchaseHistory,historyLen:(allPurchaseHistory||[]).length,
    partial:allTaskPartialReviews,partialLen:(allTaskPartialReviews||[]).length,
    value
  };
}
buildSignalTruth=function(includeDataQuality=true){
  const slot=includeDataQuality?'full':'dot';
  const cached=signalFastCache227328[slot];
  if(signalCacheSame227328(cached,includeDataQuality))return cached.value;

  const isBoss=currentProfile?.role==='boss';
  const myName=currentProfile?.name||'';
  const clients=isBoss?allClients:allClients.filter(c=>c.manager_name===myName);
  const clientIds=new Set(clients.map(c=>String(c.id)));

  let tasks=canonicalActiveTasks(allTasks);
  if(!isBoss)tasks=tasks.filter(t=>taskManagerName(t)===myName);
  const overdueTasks=tasks.filter(t=>{
    if(!isTaskOverdue(t))return false;
    const tc=t.client_id?(allClients||[]).find(c=>String(c.id)===String(t.client_id)):null;
    if(tc&&tc.client_status!=='Рабочий')return false;
    return !isBoss||daysDiff(t.due_date)<=-2;
  }).sort((a,b)=>String(a.due_date||'').localeCompare(String(b.due_date||'')));

  // Outside VIP, v22.7.32.2.7 supplies only cached/basic VIP summaries and
  // never starts the 40k-row VIP precompute.
  let vipDrops=[];
  try{
    const summary=(typeof window.crmSignalVipSummaryV227329==='function'?window.crmSignalVipSummaryV227329():(typeof getVipClientSummary==='function'?getVipClientSummary():[]))||[];
    vipDrops=summary.filter(g=>
      g?.matched&&g.matched.client_status==='Рабочий'
      &&g.growth_pct!=null&&g.growth_pct<=-30
      &&(Number(g.revenue_prev)||0)>=5000
      &&clientIds.has(String(g.matched.id))
    ).sort((a,b)=>(Number(a.growth_pct)||0)-(Number(b.growth_pct)||0));
  }catch(e){console.warn('Signals VIP fast path',e);}

  const promotionIssues=(allPromotions||[])
    .filter(p=>isBoss||p.manager_name===myName)
    .filter(p=>{const c=p.client_id?(allClients||[]).find(x=>String(x.id)===String(p.client_id)):promoClient(p);return !c||c.client_status==='Рабочий';})
    .map(p=>({promotion:p,metric:(typeof window.crmSignalPromoMetricV227329==='function'?window.crmSignalPromoMetricV227329(p):promoMetric(p))}))
    .filter(x=>['bad','attention'].includes(x.metric.level));

  const partialReviews=(allTaskPartialReviews||[])
    .filter(r=>r.status==='pending'&&(isBoss||r.manager_name===myName))
    .filter(r=>{const t=(allTasks||[]).find(x=>String(x.id)===String(r.task_id));const c=(allClients||[]).find(x=>String(x.id)===String(r.client_id||t?.client_id||''));return !c||c.client_status==='Рабочий';});

  let noMaster=[],unassigned=[];
  if(includeDataQuality){
    if(isBoss)unassigned=(allClients||[]).filter(c=>
      c.client_status==='Рабочий'&&(Number(c.revenue_total)||0)>0&&!c.manager_name
    ).sort((a,b)=>(Number(b.revenue_total)||0)-(Number(a.revenue_total)||0));

    if(!window.RESANTA_MASTERLIST_REFRESH_PENDING
      &&Array.isArray(allPurchaseHistory)&&allPurchaseHistory.length){
      noMaster=clients.filter(c=>
        c.client_status==='Рабочий'&&(Number(c.revenue_total)||0)>0
        &&getClientHistFast(c).length===0
      ).sort((a,b)=>(Number(b.revenue_total)||0)-(Number(a.revenue_total)||0));
    }
  }

  const d={
    isBoss,clients,tasks,overdueTasks,
    overdueRoutes:[],visitIssues:[],atRiskClients:[],routeDataIssues:[],
    vipDrops,promotionIssues,noMaster,unassigned,partialReviews,
    criticalCount:overdueTasks.length,
    actionCount:vipDrops.length+promotionIssues.length+partialReviews.length,
    dataCount:noMaster.length+unassigned.length
  };
  signalFastCache227328[slot]=signalCachePut227328(d,includeDataQuality);
  return d;
};
window.crmInvalidateSignalsFast227328=function(){signalFastCache227328={full:null,dot:null};};

// Старый технический блок «Точки маршрута без карточки клиента» больше не
// показываем ни в Сигналах, ни в Истории визитов. Данные маршрута не удаляются.
const baseRenderAlerts2276=renderAlerts;
renderAlerts=function(){
  return baseRenderAlerts2276.apply(this,arguments);
};
const baseRenderVisits2276=renderVisits;
renderVisits=function(){
  const out=baseRenderVisits2276.apply(this,arguments);
  document.getElementById('v2269-visits-route-data')?.remove();
  return out;
};

function clearMasterCaches2276(){
  try{Object.keys(_clientHistCache||{}).forEach(k=>delete _clientHistCache[k]);}catch(_){ }
  try{v2273ResetHistoryIndexes();}catch(_){
    try{_clientAliasesById=null;_phHistIndex=null;_phHistKeys=null;_phHistByClientId=null;_clientNameMatchCache=null;_phClientMatchCache=null;_phNameSet=null;}catch(__){ }
  }
}
async function refreshMasterListOnce2276(){
  // v22.7.22: отдельного фонового полного перечита больше нет. Если после
  // объединения карточек нужен свежий маст-лист, общий history-loader сделает
  // единственную загрузку по требованию и только тогда снимет этот флаг.
  if(masterRefreshBusy||!window.RESANTA_MASTERLIST_REFRESH_PENDING||!currentProfile)return;
  if(String(currentProfile?.access_scope||'').toLowerCase()==='triovist')return;
  masterRefreshBusy=true;
  try{
    if(typeof window.v22722EnsureHistory==='function')await window.v22722EnsureHistory({force:true,reason:'master-list'});
    if((allPurchaseHistory||[]).length){clearMasterCaches2276();markRefreshDone();window.RESANTA_MASTERLIST_REFRESH_PENDING=false;}
  }catch(e){console.warn('v22.7.22 master-list refresh',e);}
  finally{masterRefreshBusy=false;}
}
window.v2276RefreshMasterList=refreshMasterListOnce2276;

// Запускаем восстановление после основной загрузки данных, не блокируя вход в CRM.
const baseLoadData2276=loadData;
loadData=async function(){
  // Не запускаем 39k+ историю автоматически после входа.
  return await baseLoadData2276.apply(this,arguments);
};

window.RESANTA_V2276=Object.freeze({version:VERSION,cleanSignals:true,routeDataCardHidden:true,masterListFullRefreshOnce:true,mergePurchaseHistoryLinkRepair:true});
})();
