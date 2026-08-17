/* RESANTA CRM v23.0.0
 * Final root fixes: promo, signals, payments, GPS, routes, page memory
 * Extracted from v22.7.32.2.17 without business-logic changes.
 * Original inline script range: 58-68
 */

/* ===== ORIGINAL INLINE SCRIPT 58 ===== */
(function(){
'use strict';
if(window.RESANTA_PROMO_PHOTO_VIEWER_V227329)return;
let currentId='',viewerIds=[];
function ensureViewer(){
  let m=document.getElementById('modal-promotion-photo-viewer-227329');
  if(m)return m;
  m=document.createElement('div');m.id='modal-promotion-photo-viewer-227329';
  m.style.cssText='display:none;position:fixed;inset:0;z-index:100000;background:rgba(15,23,42,.92);align-items:center;justify-content:center;padding:18px';
  m.innerHTML='<button id="ppv-close-227329" style="position:absolute;right:18px;top:14px;border:none;background:rgba(255,255,255,.15);color:#fff;font-size:30px;width:46px;height:46px;border-radius:50%;cursor:pointer">×</button>'
    +'<button id="ppv-prev-227329" style="position:absolute;left:16px;top:50%;transform:translateY(-50%);border:none;background:rgba(255,255,255,.14);color:#fff;font-size:30px;width:50px;height:64px;border-radius:12px;cursor:pointer">‹</button>'
    +'<div style="max-width:min(1200px,92vw);max-height:92vh;text-align:center"><img id="ppv-img-227329" alt="Фото акции" style="max-width:92vw;max-height:82vh;object-fit:contain;border-radius:10px;box-shadow:0 15px 55px rgba(0,0,0,.35)"><div id="ppv-caption-227329" style="color:#fff;font-size:13px;line-height:1.5;margin-top:10px"></div></div>'
    +'<button id="ppv-next-227329" style="position:absolute;right:16px;top:50%;transform:translateY(-50%);border:none;background:rgba(255,255,255,.14);color:#fff;font-size:30px;width:50px;height:64px;border-radius:12px;cursor:pointer">›</button>';
  document.body.appendChild(m);
  m.onclick=e=>{if(e.target===m)closePromotionPhotoViewer227329();};
  m.querySelector('#ppv-close-227329').onclick=closePromotionPhotoViewer227329;
  m.querySelector('#ppv-prev-227329').onclick=()=>movePromotionPhotoViewer227329(-1);
  m.querySelector('#ppv-next-227329').onclick=()=>movePromotionPhotoViewer227329(1);
  return m;
}
async function showPhoto(id){
  const ph=(allPromotionPhotos||[]).find(x=>String(x.id)===String(id));if(!ph)return;
  currentId=String(id);const m=ensureViewer(),img=m.querySelector('#ppv-img-227329'),cap=m.querySelector('#ppv-caption-227329');
  m.style.display='flex';img.removeAttribute('src');cap.textContent='Загрузка фотографии…';
  try{
    const {data,error}=await db.storage.from('promotion-photos').createSignedUrl(ph.storage_path,3600);
    if(error)throw error;if(currentId!==String(id))return;
    img.src=data?.signedUrl||'';cap.textContent=[promoStageLabel(ph.stage),ph.manager_name||'—',crmDateTime(ph.created_at),ph.comment||''].filter(Boolean).join(' · ');
  }catch(e){cap.textContent='Не удалось открыть фотографию: '+(e?.message||e);}
}
window.openPromotionPhotoViewer227329=function(id){
  const ph=(allPromotionPhotos||[]).find(x=>String(x.id)===String(id));if(!ph)return;
  viewerIds=(allPromotionPhotos||[]).filter(x=>String(x.promotion_id)===String(ph.promotion_id)).sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||''))).map(x=>String(x.id));
  showPhoto(id);
};
window.closePromotionPhotoViewer227329=function(){const m=document.getElementById('modal-promotion-photo-viewer-227329');if(m)m.style.display='none';currentId='';};
window.movePromotionPhotoViewer227329=function(delta){if(!viewerIds.length||!currentId)return;let i=viewerIds.indexOf(currentId);if(i<0)i=0;i=(i+delta+viewerIds.length)%viewerIds.length;showPhoto(viewerIds[i]);};
document.addEventListener('keydown',e=>{const m=document.getElementById('modal-promotion-photo-viewer-227329');if(!m||m.style.display==='none')return;if(e.key==='Escape')closePromotionPhotoViewer227329();else if(e.key==='ArrowLeft')movePromotionPhotoViewer227329(-1);else if(e.key==='ArrowRight')movePromotionPhotoViewer227329(1);});
window.RESANTA_PROMO_PHOTO_VIEWER_V227329=Object.freeze({version:'v22.7.32.2.9',fullscreen:true,navigation:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 59 ===== */
(function(){
'use strict';
if(window.RESANTA_SIGNALS_RESILIENT_V2273211)return;

// v22.7.32.2.11
// Signals are NEVER allowed to stay on an endless "checking" screen.
// Every source is independent. A failed optional source is shown as
// "not checked", while all other signals remain usable.
const state={
  status:'idle',promise:null,loadedAt:0,generation:0,
  sources:{
    promotions:{status:'idle',error:''},
    photos:{status:'idle',error:''},
    vip:{status:'idle',error:''},
    partial:{status:'idle',error:''},
    sales:{status:'idle',error:''}
  },
  salesRows:[],months:[]
};
const TTL=60000;
const SOURCE_TIMEOUT=9000;

function src(name,status,error=''){
  if(state.sources[name]){state.sources[name].status=status;state.sources[name].error=String(error||'').slice(0,220);}
}
function sourceSummary(){
  const names={promotions:'акции',photos:'фото акций',vip:'ВИП',partial:'частичные задачи',sales:'продажи'};
  const loading=[],errors=[];
  Object.entries(state.sources).forEach(([k,v])=>{
    if(v.status==='loading'||v.status==='idle')loading.push(names[k]||k);
    if(v.status==='error')errors.push((names[k]||k)+(v.error?' — '+v.error:''));
  });
  return {loading,errors};
}
async function timedQuery(label,query,ms=SOURCE_TIMEOUT){
  const res=await withTimeout(query,ms,label);
  if(res?.error)throw res.error;
  return res?.data||[];
}
function shiftYm(ym,delta){
  if(!/^\d{4}-\d{2}$/.test(String(ym||'')))return null;
  const d=new Date(Number(ym.slice(0,4)),Number(ym.slice(5,7))-1+delta,1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function relevantPromotions(){
  return (allPromotions||[]).filter(p=>{
    const st=promoActualStatus(p);
    if(['active','awaiting','waiting_manager','planned','pending_df','pending_dfs','draft_manager'].includes(st))return true;
    if(st==='completed'){
      const end=String(p.end_date||'');
      return !end||daysDiff(end)>=-120;
    }
    return false;
  });
}
function neededMonths(){
  const set=new Set(),current=TODAY.slice(0,7),closed=shiftYm(current,-1);
  [current,shiftYm(current,-12),closed,shiftYm(closed,-12)].filter(Boolean).forEach(x=>set.add(x));
  relevantPromotions().forEach(p=>{
    const cur=promoMonthKeys(p.start_date,p.end_date);
    cur.forEach(x=>set.add(x));
    const base=promoUsesPreviousYear(p)?promoShiftMonths(cur,-12):(p.baseline_method==='manual'?[]:promoShiftMonths(cur,-cur.length));
    base.forEach(x=>set.add(x));
  });
  return [...set].filter(Boolean).sort();
}
function relevantClientKeys(){
  const ids=new Set(),names=new Set();
  const add=(c,name)=>{
    if(c?.id)ids.add(String(c.id));
    if(c?.name)names.add(String(c.name));
    if(name)names.add(String(name));
  };
  try{
    (vipMemberDefinitions?.()||[]).forEach(def=>add(vipMatchedClient(def.client_name),def.client_name));
  }catch(_){}
  relevantPromotions().forEach(p=>add(promoClient(p),p.client_name));
  return {ids:[...ids],names:[...names]};
}
function chunk(arr,n){const out=[];for(let i=0;i<arr.length;i+=n)out.push(arr.slice(i,i+n));return out;}
async function queryHistoryPage(base,monthValues,from,to){
  return timedQuery('Сигналы: продажи',
    base.in('month',monthValues).range(from,to),
    10000
  );
}
async function queryHistoryForFilter(kind,values,months){
  if(!values.length||!months.length)return [];
  const out=[],page=1000;
  // purchase_history.month exists in installations both as YYYY-MM text and
  // as a date-like YYYY-MM-01. Try the native format first, then date-month.
  const variants=[months,months.map(m=>m+'-01')];
  for(const vals of chunk(values,60)){
    let variantWorked=false,lastError=null;
    for(const monthValues of variants){
      try{
        for(let from=0;;from+=page){
          let q=db.from('purchase_history')
            .select('id,client_id,client_name,manager_name,month,revenue,qty,category,subgroup,product,sku');
          q=kind==='id'?q.in('client_id',vals):q.in('client_name',vals);
          const rows=await queryHistoryPage(q,monthValues,from,from+page-1);
          out.push(...rows);
          if(rows.length<page)break;
          if(out.length>=12000)break;
        }
        variantWorked=true;break;
      }catch(e){lastError=e;}
    }
    if(!variantWorked&&lastError)throw lastError;
    if(out.length>=12000)break;
  }
  const seen=new Set();
  return out.filter(r=>{const k=String(r.id||[r.client_id,r.client_name,r.month,r.sku,r.product,r.revenue].join('|'));if(seen.has(k))return false;seen.add(k);return true;});
}

async function loadPromotions(){
  src('promotions','loading');
  try{
    const rows=await timedQuery('Сигналы: акции',
      db.from('promotions').select('*').order('start_date',{ascending:false}).limit(2000)
    );
    allPromotions=dedupePromotionRows(rows||[]);
    src('promotions','ready');return true;
  }catch(e){src('promotions','error',e?.message||e);return false;}
}
async function loadVip(){
  src('vip','loading');
  try{
    allVipSales=await timedQuery('Сигналы: ВИП',db.from('vip_sales').select('*').limit(2000));
    src('vip','ready');return true;
  }catch(e){src('vip','error',e?.message||e);return false;}
}
async function loadPartial(){
  src('partial','loading');
  try{
    allTaskPartialReviews=await timedQuery('Сигналы: частичные задачи',
      db.from('task_partial_reviews').select('*').eq('status','pending').order('created_at',{ascending:false}).limit(2000)
    );
    src('partial','ready');return true;
  }catch(e){src('partial','error',e?.message||e);return false;}
}
async function loadPhotos(){
  src('photos','loading');
  try{
    const ids=relevantPromotions().map(p=>String(p.id)).filter(Boolean);
    if(!ids.length){allPromotionPhotos=[];src('photos','ready');return true;}
    const rows=[];
    for(const part of chunk(ids,80)){
      const x=await timedQuery('Сигналы: фото акций',
        db.from('promotion_photos').select('*').in('promotion_id',part).order('created_at',{ascending:false}).limit(3000)
      );
      rows.push(...x);
    }
    allPromotionPhotos=rows.sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
    src('photos','ready');return true;
  }catch(e){src('photos','error',e?.message||e);return false;}
}
async function loadSales(){
  src('sales','loading');
  try{
    const months=neededMonths(),keys=relevantClientKeys();
    state.months=months;
    const [byId,byName]=await Promise.all([
      queryHistoryForFilter('id',keys.ids,months),
      queryHistoryForFilter('name',keys.names,months)
    ]);
    const seen=new Set();
    state.salesRows=[...byId,...byName].filter(r=>{const k=String(r.id||[r.client_id,r.client_name,r.month,r.sku,r.product,r.revenue].join('|'));if(seen.has(k))return false;seen.add(k);return true;});
    src('sales','ready');return true;
  }catch(e){state.salesRows=[];src('sales','error',e?.message||e);return false;}
}

async function loadSignals(force=false){
  if(state.promise)return state.promise;
  if(!force&&state.status==='ready'&&Date.now()-state.loadedAt<TTL)return true;
  const gen=++state.generation;state.status='loading';
  Object.keys(state.sources).forEach(k=>src(k,'idle'));
  state.promise=(async()=>{
    // First wave is deliberately small and independent.
    await Promise.allSettled([loadPromotions(),loadVip(),loadPartial()]);
    if(gen!==state.generation)return false;

    // Photos need the relevant promotion ids. Sales needs VIP/promotion clients.
    await Promise.allSettled([loadPhotos(),loadSales()]);
    if(gen!==state.generation)return false;

    state.loadedAt=Date.now();
    state.status='ready'; // ready means "checks finished", including explicit errors.
    try{window.crmInvalidateSignalsFast227328?.();}catch(_){}
    return true;
  })().finally(()=>{state.promise=null;});
  return state.promise;
}

function rowsForClient(c,name){
  return state.salesRows.filter(r=>{
    if(c&&r.client_id&&String(r.client_id)===String(c.id))return true;
    if(c&&clientNameVariants(c).some(v=>nameLooseMatch(v,r.client_name||'')))return true;
    return !!(name&&nameLooseMatch(r.client_name||'',name));
  });
}
function signalVipSummary(){
  if(state.sources.sales.status!=='ready'||state.sources.vip.status!=='ready')return [];
  const current=TODAY.slice(0,7),cur=shiftYm(current,-1),prev=shiftYm(cur,-12);
  const growth=(a,b)=>a>0?Math.round((b-a)/a*100):(b>0?100:0);
  return (vipMemberDefinitions?.()||[]).map(def=>{
    const matched=vipMatchedClient(def.client_name),rows=rowsForClient(matched,def.client_name);
    let a=0,b=0;
    rows.forEach(r=>{const m=String(r.month||'').slice(0,7),rev=Number(r.revenue)||0;if(m===prev)a+=rev;else if(m===cur)b+=rev;});
    return {...def,matched,period_prev:prev,period_cur:cur,revenue_prev:a,revenue_cur:b,growth_pct:a>0?growth(a,b):null};
  });
}
function signalPromoRows(p){
  const c=promoClient(p);
  return rowsForClient(c,p.client_name).filter(r=>promoRowMatchesScope(r,p));
}
function salesForMonths(p,months){
  const set=new Set(months);
  return signalPromoRows(p).filter(r=>set.has(String(r.month||'').slice(0,7))).reduce((z,r)=>z+(Number(r.revenue)||0),0);
}
function signalPromoMetric(p){
  const status=promoActualStatus(p),spend=promoNum(p.actual_spend),reserved=promoNum(p.budget_reserved);
  const photos=promoPhotoProgress(p),report=String(p.manager_report||'').trim(),plan=promoNum(p.sales_plan);
  const months=promoMonthKeys(p.start_date,p.end_date);
  const salesReady=state.sources.sales.status==='ready';
  let sales=(p.confirmed_sales!==null&&p.confirmed_sales!==undefined&&p.confirmed_sales!=='')
    ?promoNum(p.confirmed_sales):(salesReady?salesForMonths(p,months):0);
  let base=p.baseline_method==='manual'?promoNum(p.baseline_manual):
    (salesReady?salesForMonths(p,promoUsesPreviousYear(p)?promoShiftMonths(months,-12):promoShiftMonths(months,-months.length)):0);
  const additional=sales-base,completion=plan>0?sales/plan*100:0;
  let level='neutral',reason=salesReady?'Акция ещё не оценена':'Продажи по акции ещё не проверены';

  // Non-sales problems are still authoritative even if sales failed.
  if(status==='rejected')reason='Акция отклонена';
  else if(['draft_manager','pending_df','pending_dfs','waiting_manager','planned'].includes(status))reason='Акция ещё проходит согласование/ожидает старта';
  else if(spend>reserved&&reserved>0){level='bad';reason='Фактические расходы выше согласованного бюджета';}
  else if((status==='completed'||status==='awaiting')&&!report){level='bad';reason='Нет итогового отчёта';}
  else if((status==='completed'||status==='awaiting')&&photos.missing.length){level='bad';reason='Не хватает обязательных фотографий';}
  else if(!salesReady){level='neutral';reason='Продажи по акции не проверены';}
  else if(status==='completed'||status==='awaiting'){
    if(promoIsPartialDates(p)&&p.confirmed_sales==null){level='attention';reason='Нужны подтверждённые продажи за неполный период';}
    else if(promoIsPartialDates(p)&&p.baseline_method!=='manual'){level='attention';reason='Для неполного периода нужна точная база сравнения';}
    else if(plan<=0){level='attention';reason='Не задан план продаж';}
    else if(completion<70){level='bad';reason='Выполнено менее 70% плана';}
    else if(additional<=0){level='bad';reason='Нет роста относительно выбранной базы';}
    else if(completion<100){level='attention';reason='План выполнен не полностью';}
    else{level='good';reason='План выполнен, бюджет не превышен';}
  }else if(status==='active'){
    const a=new Date(p.start_date+'T12:00:00'),z=new Date(p.end_date+'T12:00:00'),n=new Date(TODAY+'T12:00:00');
    const elapsed=Math.max(0,Math.min(1,(n-a)/Math.max(1,z-a))),pace=plan>0?completion/100:0;
    if(plan>0&&elapsed>.25&&pace+0.15<elapsed){level='attention';reason='Продажи отстают от темпа акции';}
    else{level='good';reason='Акция идёт без критических отклонений';}
  }
  return {sales,base,additional,plan,completion,spend,reserved,photos,level,reason,costPerAdditional:additional>0?spend/additional:null};
}
function statusBanner(){
  const q=sourceSummary();
  if(state.status==='loading'){
    const tail=q.loading.length?' Сейчас: '+q.loading.join(', ')+'.':'';
    return '<div class="card" id="signals-source-status-2273211" style="padding:12px 14px;margin-bottom:12px;border-color:#BFDBFE;background:#EFF6FF;color:#1E3A8A"><b>⏳ Сигналы уже доступны, дополнительные источники проверяются.</b><div style="font-size:11px;margin-top:4px">'+esc(tail)+'</div></div>';
  }
  if(q.errors.length){
    return '<div class="card" id="signals-source-status-2273211" style="padding:12px 14px;margin-bottom:12px;border-color:#FCD34D;background:#FFFBEB;color:#92400E"><b>⚠️ Сигналы проверены частично.</b><div style="font-size:11px;margin-top:4px">Не удалось проверить: '+q.errors.map(esc).join(' · ')+'</div><button class="btn-secondary" style="margin-top:8px;padding:5px 10px" onclick="crmSignalsRefreshV227329()">↻ Повторить проверку</button></div>';
  }
  return '<div class="card" id="signals-source-status-2273211" style="padding:10px 14px;margin-bottom:12px;border-color:#86EFAC;background:#F0FDF4;color:#166534"><b>✅ Все источники коммерческих сигналов проверены.</b></div>';
}

window.crmSignalVipSummaryV227329=signalVipSummary;
window.crmSignalPromoMetricV227329=signalPromoMetric;
window.crmSignalsRefreshV227329=async function(){
  state.loadedAt=0;state.status='idle';
  const ok=await loadSignals(true);
  if(typeof crmActivePage==='function'&&crmActivePage()==='alerts'){
    try{
      window.crmSingleRenderMarkPageV227327?.('alerts');
      window.crmSingleRenderRequestV227327?.('alerts',{reason:'signals-resilient-refresh',force:true,delay:10});
    }catch(_){}
  }
  return ok;
};

const baseRender=window.renderAlerts||renderAlerts;
const wrapped=function(){
  // Render immediately from whatever is already known. Never blank the page.
  const out=baseRender.apply(this,arguments);
  const root=document.getElementById('alerts-content');
  if(root){
    const old=document.getElementById('signals-source-status-2273211');if(old)old.remove();
    root.insertAdjacentHTML('afterbegin',statusBanner());
  }
  if(state.status==='idle'||(state.status==='ready'&&Date.now()-state.loadedAt>TTL)){
    loadSignals(false).then(()=>{
      if(typeof crmActivePage==='function'&&crmActivePage()==='alerts'){
        try{
          window.crmSingleRenderMarkPageV227327?.('alerts');
          window.crmSingleRenderRequestV227327?.('alerts',{reason:'signals-resilient-ready',force:true,delay:10});
        }catch(_){}
      }
    });
  }
  return out;
};
window.renderAlerts=wrapped;try{renderAlerts=wrapped;}catch(_){}

window.RESANTA_SIGNALS_COMMERCIAL_TRUTH_V227329=Object.freeze({
  version:'v22.7.32.2.11',
  noFakeZero:true,
  workingClientsOnly:true,
  targetedHistoryMonths:true,
  targetedClientsOnly:true,
  fullPurchaseHistoryLoad:false,
  partialReviewsLoaded:true,
  resilientSources:true,
  neverEndlessLoading:true
});
window.RESANTA_SIGNALS_RESILIENT_V2273211=Object.freeze({
  version:'v22.7.32.2.11',
  independentSources:true,
  sourceTimeoutMs:SOURCE_TIMEOUT,
  errorVisibleInUi:true,
  renderImmediately:true
});
})();

/* ===== ORIGINAL INLINE SCRIPT 60 ===== */
window.RESANTA_COMMERCIAL_TRUTH_V227329=Object.freeze({
  version:'v22.7.32.2.9',
  signalsTruthHub:true,
  signalsWorkingClientsOnly:true,
  workingHistoryFirst:true,
  potentialExplicitProfileOnly:true,
  potentialMaxSku:5,
  strictAccessoryCrossSell:true,
  true7030:true,
  photoViewer:true,
  salesRegionsFromFilteredHistory:true,
  noSqlChanges:true,
  navigationPerformanceUntouched:true,
  gpsUntouched:true,
  triovistUntouched:true,
  absencesUntouched:true
});

/* ===== ORIGINAL INLINE SCRIPT 61 ===== */
window.RESANTA_AI_STOCK_LAZY_BOSS_ACCESS_V2273210=Object.freeze({
  version:'v22.7.32.2.10',
  aiPlannerStockLazyLoad:true,
  aiPlannerStockFreshReadOnOpen:true,
  noCtrlF5:true,
  bossPlannerAccess:true,
  bossTaskInsertUpdatePolicy:true,
  kirillSidarovichSupported:true,
  commercialTruthV227329Preserved:true,
  navigationPerformanceUntouched:true
});

/* ===== ORIGINAL INLINE SCRIPT 62 ===== */
window.RESANTA_V2273211=Object.freeze({
  version:'v22.7.32.2.11',
  signalsNeverBlockScreen:true,
  signalsIndependentSources:true,
  signalsErrorVisible:true,
  sidarovichCanCreatePromotion:true,
  sidarovichCreatedPromotionGoesToPayushin:true,
  noNavigationChanges:true,
  noGpsChanges:true,
  noTriovistChanges:true,
  commercialTruth227329Preserved:true
});

/* ===== ORIGINAL INLINE SCRIPT 63 ===== */
// ============================================================================
// RESANTA CRM v22.7.32.2.12 · PAYMENTS CALENDAR MONTH ROOT FIX
//
// Root cause:
// v22.6.4 called the old v22.6.3 v20InitFilters(), and v22.6.3 rebuilt the
// payment-month selector only from months that already contained documents.
// Therefore choosing August with zero August documents was immediately reset
// to July before v22.6.4 could preserve the user's choice.
//
// This final controller keeps calendar months independent of document presence.
// ============================================================================
(function(){
'use strict';
if(window.RESANTA_PAYMENTS_CALENDAR_ROOT_V2273212)return;

const baseInit=window.v20InitFilters;
const baseRender=window.renderPayments;

function monthKey(v){
  const m=String(v||'').match(/^(\d{4})-(\d{2})/);
  return m?m[1]+'-'+m[2]:'';
}
function addMonths(m,n){
  const x=String(m||'').match(/^(\d{4})-(\d{2})$/);
  if(!x)return '';
  const d=new Date(Number(x[1]),Number(x[2])-1+n,1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function monthLabel(m){
  const a=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const x=String(m||'').match(/^(\d{4})-(\d{2})$/);
  return x?(a[Number(x[2])-1]+' '+x[1]):m;
}
function calendarMonths(){
  const actual=(allCashReceipts||[])
    .flatMap(r=>[monthKey(r.document_at),monthKey(r.period_start),monthKey(r.period_end)])
    .filter(Boolean).sort();
  const current=monthKey(typeof TODAY!=='undefined'?TODAY:new Date().toISOString());
  let start=actual[0]||current;
  let end=addMonths(current,12);
  if(actual.length&&actual[actual.length-1]>end)end=actual[actual.length-1];
  const out=[];let x=start,guard=0;
  while(x&&x<=end&&guard++<72){out.push(x);x=addMonths(x,1);}
  return out;
}
function escLocal(v){
  return typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[ch]));
}
function restoreMonth(wanted){
  const sel=document.getElementById('payments-month');if(!sel)return;
  const months=calendarMonths();
  const current=monthKey(typeof TODAY!=='undefined'?TODAY:new Date().toISOString());
  sel.innerHTML='<option value="all">Все месяцы</option>'
    +months.map(m=>'<option value="'+m+'">'+escLocal(monthLabel(m))+'</option>').join('');
  if(wanted&&(['all',...months].includes(wanted)))sel.value=wanted;
  else if(months.includes(current))sel.value=current;
  else sel.value=months[months.length-1]||'all';
  sel.dataset.v2273212Ready='1';
}

window.v20InitFilters=function(){
  // Read the user's choice BEFORE any old initializer runs.
  const before=document.getElementById('payments-month')?.value||'';
  if(typeof baseInit==='function')baseInit.apply(this,arguments);
  restoreMonth(before);
};

window.v2273212PaymentMonthChanged=function(){
  // "Месяц платежа" is the main business filter. A report-period left on July
  // must not hide August documents when the first August import arrives.
  const period=document.getElementById('payments-period');
  if(period&&[...period.options].some(o=>o.value==='all'))period.value='all';
  if(typeof window.renderPayments==='function')window.renderPayments();
};

window.renderPayments=function(){
  const wanted=document.getElementById('payments-month')?.value||'';
  const out=typeof baseRender==='function'?baseRender.apply(this,arguments):undefined;
  restoreMonth(wanted);

  const sel=document.getElementById('payments-month');
  const chosen=sel?.value||'all';
  if(chosen!=='all'){
    const has=(allCashReceipts||[]).some(r=>monthKey(r.document_at)===chosen);
    if(!has){
      const list=document.getElementById('payments-list');
      const current=monthKey(typeof TODAY!=='undefined'?TODAY:new Date().toISOString());
      const latestReport=typeof crmImportStatus==='function'?crmImportStatus('payments'):null;
      const report=latestReport?.report_period||'—';
      if(list)list.innerHTML=
        '<div class="card" style="text-align:center;padding:26px">'
        +'<div style="font-size:18px;font-weight:700">За '+escLocal(monthLabel(chosen))+' поступлений пока нет</div>'
        +'<div style="font-size:12px;color:var(--sub);margin-top:7px">Выбранный месяц сохранён и не будет переключаться на предыдущий.</div>'
        +(chosen===current?'<div style="font-size:12px;color:var(--sub);margin-top:5px">Последний загруженный период 1С: <b>'+escLocal(report)+'</b>. Августовские документы появятся здесь автоматически после первого отчёта за август.</div>':'')
        +'</div>';
    }
  }
  return out;
};

// One-time correction if the page is already open when this build loads.
try{
  const sel=document.getElementById('payments-month');
  if(sel)restoreMonth(sel.value||monthKey(typeof TODAY!=='undefined'?TODAY:new Date().toISOString()));
}catch(_){}

window.RESANTA_PAYMENTS_CALENDAR_ROOT_V2273212=Object.freeze({
  version:'v22.7.32.2.12',
  calendarMonthIndependentOfDocuments:true,
  selectedMonthNeverFallsBack:true,
  paymentMonthPrimaryFilter:true,
  reportPeriodResetToAllOnMonthChange:true,
  augustVisibleBeforeFirstDocument:true,
  noSqlChanges:true,
  importsUntouched:true,
  navigationUntouched:true
});
})();

/* ===== ORIGINAL INLINE SCRIPT 64 ===== */
window.RESANTA_GPS_BUSINESS_STOPS_V2273213=Object.freeze({
  version:'v22.7.32.2.13',
  preserveManualZoomOnRefresh:true,
  actualStopsNumbered:true,
  factualArrivalOrder:true,
  clientArrivalDepartureTime:true,
  clientDwellMinutes:true,
  minDistanceMeters:true,
  gpsWithoutVisitReview:true,
  visitWithoutGpsReview:true,
  unverifiedClientCoordinatesAreCautionOnly:true,
  routeRecordingUntouched:true,
  managerWorkflowUntouched:true,
  noSqlChanges:true
});

/* ===== ORIGINAL INLINE SCRIPT 65 ===== */
window.RESANTA_GPS_PHYSICAL_STOPS_TRUTH_V2273214=Object.freeze({
  version:'v22.7.32.2.14',
  physicalStopsBeforeClientMatching:true,
  onePhysicalStopOneAssignment:true,
  noDuplicateTimeAcrossClients:true,
  rawServerGpsUsedForDwell:true,
  cleanedGpsUsedOnlyForRouteLine:true,
  unverifiedGeocoderMaxRadiusMeters:180,
  ambiguityIsExplicit:true,
  savedVisitIsStrongEvidence:true,
  markerAtPhysicalGpsStop:true,
  markerClickNeverMovesMap:true,
  leafletMapReusedOnRefresh:true,
  autoRefreshNeverChangesViewport:true,
  noSqlChanges:true,
  gpsRecordingUntouched:true,
  visitSavingUntouched:true,
  managerRouteUntouched:true
});

/* ===== ORIGINAL INLINE SCRIPT 66 ===== */
// ============================================================================
// RESANTA CRM v22.7.32.2.15 · ROUTE TASK DEADLINE TRUTH ROOT FIX
//
// Business truth:
//   Route AI task (must_list) follows the actual active route date.
//   A director's route reschedule must never create a false overdue task.
//   Debt / promotions / visit promises / manual tasks are NEVER moved here.
// ============================================================================
(function(){
'use strict';
if(window.RESANTA_ROUTE_TASK_DEADLINE_TRUTH_V2273215)return;

function v2273215RouteTask(t){
  if(!t||!isActiveTask(t))return false;
  const source=String(t.source||'').trim().toLowerCase();
  return source==='must_list'
    || source==='route'
    || (t.ai_selection_context&&t.ai_selection_context.master_list===true);
}
function v2273215RouteClient(r){
  if(!r)return null;
  if(r.client_id){
    const c=(allClients||[]).find(x=>String(x.id)===String(r.client_id));
    if(c)return c;
  }
  try{return matchClientByName(r.client_name||'');}catch(_){return null;}
}
function v2273215TaskClient(t){
  if(!t?.client_id)return null;
  return (allClients||[]).find(x=>String(x.id)===String(t.client_id))||null;
}
function v2273215RouteMatchesTask(r,t){
  if(!r||!t||r.removed||r.review_status==='rejected'||r.review_status==='pending')return false;
  const c=v2273215TaskClient(t),rc=v2273215RouteClient(r);
  if(c&&rc&&String(c.id)===String(rc.id)){
    const tm=taskManagerName(t);
    return !r.manager_name||!tm||managerLooseMatch(r.manager_name,tm);
  }
  if(c&&r.client_name&&clientNameVariants(c).some(n=>nameLooseMatch(n,r.client_name))){
    const tm=taskManagerName(t);
    return !r.manager_name||!tm||managerLooseMatch(r.manager_name,tm);
  }
  return false;
}
function v2273215ActiveTaskRoutes(t){
  return (allRoutePlans||[])
    .filter(r=>v2273215RouteMatchesTask(r,t))
    .slice()
    .sort((a,b)=>String(a.visit_date||'').localeCompare(String(b.visit_date||'')));
}
function v2273215RemovedOldRouteExists(t,due){
  return (allRoutePlans||[]).some(r=>{
    if(!r?.removed||String(r.visit_date||'').slice(0,10)!==String(due||'').slice(0,10))return false;
    const c=v2273215TaskClient(t),rc=v2273215RouteClient(r);
    if(!(c&&rc&&String(c.id)===String(rc.id)))return false;
    const tm=taskManagerName(t);
    return !r.manager_name||!tm||managerLooseMatch(r.manager_name,tm);
  });
}
function v2273215EffectiveRouteDate(t){
  if(!v2273215RouteTask(t)||!t.due_date)return null;
  const due=String(t.due_date).slice(0,10);
  const rows=v2273215ActiveTaskRoutes(t);
  if(!rows.length)return null;

  // If the original route point is still active on its original day,
  // the task is genuinely due there and must not be hidden.
  if(rows.some(r=>String(r.visit_date||'').slice(0,10)===due))return due;

  // Strongest proof: route row itself records where it was moved from.
  const direct=rows
    .filter(r=>String(r.rescheduled_from||'').slice(0,10)===due)
    .sort((a,b)=>String(a.visit_date||'').localeCompare(String(b.visit_date||'')))[0];
  if(direct?.visit_date)return String(direct.visit_date).slice(0,10);

  // Full route-day editor removes the old row and creates/activates a new one.
  // That is also explicit reschedule evidence.
  if(v2273215RemovedOldRouteExists(t,due)){
    const future=rows.find(r=>String(r.visit_date||'').slice(0,10)>=TODAY);
    if(future)return String(future.visit_date).slice(0,10);
  }

  // Safety repair for already-created false overdue items:
  // only route tasks, only when old due date has NO active route anymore,
  // and the same client/manager has an active point today or later.
  if(due<TODAY){
    const future=rows.find(r=>String(r.visit_date||'').slice(0,10)>=TODAY);
    if(future)return String(future.visit_date).slice(0,10);
  }
  return null;
}
async function v2273215UpdateTaskIds(ids,newDate){
  ids=[...new Set((ids||[]).map(String))];
  if(!ids.length||!newDate)return 0;
  let done=0;
  for(let i=0;i<ids.length;i+=80){
    const part=ids.slice(i,i+80);
    const {error}=await db.from('tasks').update({due_date:newDate}).in('id',part);
    if(error){console.warn('Route task deadline sync',newDate,error);continue;}
    const set=new Set(part);
    allTasks=allTasks.map(t=>set.has(String(t.id))?{...t,due_date:newDate}:t);
    done+=part.length;
  }
  return done;
}
async function v2273215SyncClientRouteTasks(clientName,newDate,oldDate){
  let c=null;
  try{c=matchClientByName(clientName||'');}catch(_){}
  if(!c||!newDate)return 0;
  const ids=(allTasks||[]).filter(t=>{
    if(!v2273215RouteTask(t)||String(t.client_id)!==String(c.id))return false;
    const due=String(t.due_date||'').slice(0,10);
    if(oldDate)return due===String(oldDate).slice(0,10);
    // Legacy postponement helper has no oldDate: move ONLY stale route tasks.
    return due&&due<newDate;
  }).map(t=>t.id);
  return v2273215UpdateTaskIds(ids,newDate);
}
async function v2273215SyncPlans(plans,newDate,oldDates){
  let moved=0;
  for(const r of (plans||[])){
    const old=oldDates?.get(String(r.id))||String(r.rescheduled_from||'').slice(0,10)||null;
    moved+=await v2273215SyncClientRouteTasks(r.client_name,newDate||r.visit_date,old);
  }
  return moved;
}
async function v2273215RepairRouteTaskDeadlines(){
  if(currentProfile?.role!=='boss')return 0;
  const byDate=new Map();
  (allTasks||[]).filter(v2273215RouteTask).forEach(t=>{
    const effective=v2273215EffectiveRouteDate(t);
    const due=String(t.due_date||'').slice(0,10);
    if(!effective||effective===due)return;
    // Automatic background repair never brings a task backwards unexpectedly.
    // Earlier moves are handled synchronously by the actual route-move action.
    if(effective<TODAY&&due<TODAY)return;
    if(!byDate.has(effective))byDate.set(effective,[]);
    byDate.get(effective).push(t.id);
  });
  let fixed=0;
  for(const [date,ids] of byDate)fixed+=await v2273215UpdateTaskIds(ids,date);
  if(fixed){
    try{buildDashboard();renderTasks();updateTasksAlertDot();updateSignalsAlertDot();}catch(_){}
    console.info('v22.7.32.2.15 route task deadlines repaired:',fixed);
  }
  return fixed;
}

// Replace the dangerous old helper: it used to move EVERY active client task.
// From now on it can move route AI tasks only.
window._shiftClientOverdueTasks=async function(clientName,newDate){
  return v2273215SyncClientRouteTasks(clientName,newDate,null);
};
try{_shiftClientOverdueTasks=window._shiftClientOverdueTasks;}catch(_){}

// Route-move engine: remember the exact old route day, then align only the
// corresponding route task after the existing route update succeeds.
const baseMoveRows=window.v18MoveRouteRows||v18MoveRouteRows;
window.v18MoveRouteRows=async function(points,newDate){
  const oldDates=new Map((points||[]).map(r=>[String(r.id),String(r.visit_date||'').slice(0,10)]));
  const ok=await baseMoveRows.apply(this,arguments);
  if(ok)await v2273215SyncPlans(points,newDate,oldDates);
  return ok;
};
try{v18MoveRouteRows=window.v18MoveRouteRows;}catch(_){}

// Single-point move has its own implementation and therefore gets the same
// exact-date guarantee.
const baseMoveSingle=window.moveSinglePoint||moveSinglePoint;
window.moveSinglePoint=async function(rowId){
  const r=(allRoutePlans||[]).find(x=>String(x.id)===String(rowId));
  const oldDate=String(r?.visit_date||'').slice(0,10);
  await baseMoveSingle.apply(this,arguments);
  const after=(allRoutePlans||[]).find(x=>String(x.id)===String(rowId));
  if(after&&oldDate&&String(after.visit_date||'').slice(0,10)!==oldDate){
    await v2273215SyncClientRouteTasks(after.client_name,String(after.visit_date).slice(0,10),oldDate);
    try{buildDashboard();renderTasks();updateTasksAlertDot();}catch(_){}
  }
};
try{moveSinglePoint=window.moveSinglePoint;}catch(_){}

// Full director day editor previously changed route_plans only.
// After save, align stale route tasks of the clients that are actually in
// this director-approved/draft route day.
const baseSaveBossDay=window.saveBossRouteDay||saveBossRouteDay;
window.saveBossRouteDay=async function(){
  const manager=document.getElementById('erd-manager')?.value||'';
  const date=document.getElementById('erd-date')?.value||'';
  await baseSaveBossDay.apply(this,arguments);
  if(!manager||!date)return;
  const plans=(allRoutePlans||[]).filter(r=>
    !r.removed&&r.review_status!=='rejected'&&r.review_status!=='pending'&&
    r.manager_name===manager&&String(r.visit_date||'').slice(0,10)===date
  );
  // Day-editor additions do not carry old route ids. Only stale route tasks
  // are pulled forward to the edited route date.
  for(const r of plans)await v2273215SyncClientRouteTasks(r.client_name,date,null);
  try{buildDashboard();renderTasks();updateTasksAlertDot();updateRoutesAlertDot();}catch(_){}
};
try{saveBossRouteDay=window.saveBossRouteDay;}catch(_){}

// Replace the old broad background repair (auto_generated/visit/ai regex).
// Background repair is now strict route-deadline truth only.
window.v18RepairTransferredTasks=v2273215RepairRouteTaskDeadlines;
try{v18RepairTransferredTasks=window.v18RepairTransferredTasks;}catch(_){}

// UI safety net: even before the database repair finishes, an old due_date
// cannot appear as overdue when the same route task has been explicitly moved
// to today/future and its old route point is no longer active.
const baseIsOverdue=isTaskOverdue;
isTaskOverdue=function(t){
  if(!baseIsOverdue(t))return false;
  if(!v2273215RouteTask(t))return true;
  const effective=v2273215EffectiveRouteDate(t);
  return !(effective&&effective>=TODAY&&effective>String(t.due_date||'').slice(0,10));
};
window.isTaskOverdue=isTaskOverdue;

// Run once after the normal data bootstrap. Boss RLS already permits the task
// update; managers still benefit from the UI safety net.
const baseLoadData=loadData;
loadData=async function(){
  const out=await baseLoadData.apply(this,arguments);
  const run=()=>v2273215RepairRouteTaskDeadlines().catch(e=>console.warn('route deadline repair',e));
  if(typeof requestIdleCallback==='function')requestIdleCallback(run,{timeout:3500});
  else setTimeout(run,1200);
  return out;
};
window.loadData=loadData;

// Backup for builds where data were already hydrated before this patch loaded.
setTimeout(()=>{
  if(currentProfile?.role==='boss'&&(allTasks||[]).length&&(allRoutePlans||[]).length){
    v2273215RepairRouteTaskDeadlines().catch(()=>{});
  }
},5000);

window.RESANTA_ROUTE_TASK_DEADLINE_TRUTH_V2273215=Object.freeze({
  version:'v22.7.32.2.15',
  routeTaskSources:['must_list','route'],
  masterListContextSupported:true,
  routeDateIsDeadlineTruth:true,
  bossDayEditorSyncsDeadlines:true,
  routeMoveSyncsExactOldDate:true,
  falseOverdueSuppressedBeforeDbRepair:true,
  existingFalseOverduesAutoRepairedForBoss:true,
  debtTasksUntouched:true,
  promotionTasksUntouched:true,
  visitPromiseTasksUntouched:true,
  manualTasksUntouched:true,
  gpsUntouched:true,
  noSqlChanges:true
});
})();

/* ===== ORIGINAL INLINE SCRIPT 67 ===== */
window.RESANTA_ROUTE_CONTROL_RESET_V2273216=Object.freeze({
  version:'v22.7.32.2.16',
  routeControlStart:'2026-08-13',
  oldRouteMissesIgnored:true,
  oldRouteDataPreserved:true,
  futureRouteMissesStillTracked:true,
  visitHistoryUntouched:true,
  taskDeadlinesV2273215Preserved:true,
  gpsV2273214Preserved:true,
  noSqlChanges:true
});

/* ===== ORIGINAL INLINE SCRIPT 68 ===== */
window.RESANTA_INSTANT_PAGE_MEMORY_V2273217=Object.freeze({
  version:'v22.7.32.2.17',
  readyDomReusedOnEveryNavigation:true,
  vipReopensWithoutRebuild:true,
  salesReopensWithoutRebuild:true,
  fallingReopensWithoutRebuild:true,
  abcReopensWithoutRebuild:true,
  paymentsReopensWithoutRebuild:true,
  promotionsReopensWithoutRebuild:true,
  budgetsReopensWithoutRebuild:true,
  debtReopensWithoutRebuild:true,
  networksReopensWithoutRebuild:true,
  triovistReopensWithoutRebuild:true,
  dirtyPagesUseStaleWhileRevalidate:true,
  resourceRefreshWaitsForUserIdle:true,
  explicitButtonsStillRefreshImmediately:true,
  gpsControlRemainsLive:true,
  workdayRemainsLive:true,
  businessLogicUntouched:true,
  noSqlChanges:true
});


// ============================================================================
// RESANTA CRM v23.0.0 · MODULAR PERFORMANCE CORE
// ============================================================================
window.RESANTA_V23_MODULAR_PERFORMANCE_CORE = Object.freeze({
  version: 'v23.0.0',
  externalJavascriptBundles: 6,
  inlineBusinessJavascript: false,
  preservedExecutionOrder: true,
  browserParallelDownload: true,
  browserHttpCacheEnabled: true,
  queryVersionedAssets: true,
  instantPageMemoryV2273217Preserved: true,
  gpsPhysicalStopsV2273214Preserved: true,
  routeControlResetV2273216Preserved: true,
  businessLogicChanged: false,
  sqlChanges: false
});
