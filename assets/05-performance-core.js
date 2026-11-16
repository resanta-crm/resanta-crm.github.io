/* RESANTA CRM v23.6.341
 * Ultra-fast core, data-version watcher, single-render navigation
 * Extracted from v22.7.32.2.17 without business-logic changes.
 * Original inline script range: 55-57
 */

/* ===== ORIGINAL INLINE SCRIPT 55 ===== */
// ============================================================================
// RESANTA CRM · CRM ULTRA FAST FINAL
// v22.7.34-ultra
//
// Fast shell + user-scoped persistent cache + RAM cache + stale-while-revalidate
// + controlled prefetch + single-flight + user-priority page opening.
//
// Business rules are untouched. This layer changes only WHEN/HOW data is read.
// ============================================================================
(function(){
'use strict';
if(window.RESANTA_CRM_ULTRA_FAST_FINAL)return;

const VERSION='v22.7.34-ultra';
const legacyFullLoad=window.loadData;
const states=new Map();
const perfLog=[];
const CACHE_DB='resanta_crm_ultra_cache_v22734';
const CACHE_STORE='datasets';
const CACHE_SCHEMA=1;
const PERSIST_MAX_AGE=12*60*60*1000;
const TTL={
  tasks:5*60*1000,
  visits:5*60*1000,
  routes:5*60*1000,
  absences:3*60*1000,
  negotiations:5*60*1000,
  aliases:30*60*1000,
  quality:5*60*1000,
  routeReviews:5*60*1000,
  partial:5*60*1000,
  kpi:5*60*1000,
  imports:60*1000,
  vips:5*60*1000
};
const PERSIST=new Set(['tasks','visits','routes','absences','negotiations','aliases','kpi','imports','vips']);
let bootFlight=null,bootReady=false,warmStarted=false,optionalStarted=false;
let bootOwner='',bootFlightOwner='',bootAbort=null,coreEpoch=0,coreActor='';
let bgBusy=false,lastInteractionAt=0,hoverTimer=0,lastPageOpenAt=0;
const bgQueue=[],queuedKeys=new Set();

function now(){return (typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();}
function log(name,phase,extra){
  const row={name,phase,at:Date.now(),ms:Math.round(now()),...(extra||{})};
  perfLog.push(row);if(perfLog.length>400)perfLog.splice(0,perfLog.length-400);
  try{console.debug('[CRM ULTRA]',name,phase,extra||'');}catch(_){}
}
window.CRM_PERF_LOG=perfLog;

function state(name){
  if(!states.has(name))states.set(name,{status:'idle',promise:null,data:null,loadedAt:0,error:null,hydrated:false,refreshing:false});
  return states.get(name);
}
function activePage(){try{return typeof crmActivePage==='function'?crmActivePage():(document.getElementById('app')?.dataset?.activePage||'');}catch(_){return '';}}
function activeClientIds(){return new Set((allClients||[]).map(c=>String(c.id)));}
function waitTurn(ms=0){return new Promise(r=>setTimeout(r,ms));}
function age(s){return s?.loadedAt?Date.now()-s.loadedAt:Number.POSITIVE_INFINITY;}
function ttl(name){return TTL[name]||5*60*1000;}
function isFresh(name){const s=state(name);return s.status==='ready'&&age(s)<=ttl(name);}
function currentUserCacheKey(){
  const id=String(currentUser?.id||currentProfile?.email||currentProfile?.name||'anonymous').replace(/[^a-zA-Z0-9_.@-]/g,'_');
  const scope=String((currentProfile?.access_scope||currentProfile?.role||'user')+'|'+(currentProfile?.region||'')).replace(/[^a-zA-Z0-9_.@-]/g,'_');
  return id+'|'+scope;
}
function cacheKey(name){return 'core|'+CACHE_SCHEMA+'|'+currentUserCacheKey()+'|'+name;}
function actorKey(){return String(currentUser?.id||currentProfile?.id||'')+'|'+String(currentProfile?.access_scope||currentProfile?.role||'')+'|'+String(currentProfile?.region||'');}
function sameActor(scope){return scope.actor===actorKey()&&scope.actor===coreActor&&scope.epoch===coreEpoch;}
function clearCoreData(){allClients=[];allUsers=[];allTasks=[];allVisits=[];allRoutePlans=[];allNegotiations=[];allClientAliases=[];allVisitQualityReviews=[];allVisitRouteReviews=[];allTaskPartialReviews=[];allManagerKpiPlans=[];allImportStatus=[];allVipSales=[];allVipPromotions=[];allPurchaseHistory=[];allPurchases=[];allPurchaseItems=[];allClientPhotos=[];allPromotions=[];allPromotionBudgets=[];allPromotionBudgetMovements=[];allPromotionPhotos=[];allPromotionBudgetAudit=[];allClientDebt=[];allDebtComments=[];allStock=[];allPrice=[];try{allManagerAbsences=[];}catch(_){} }
function resetCoreActor(next=''){coreEpoch++;coreActor=next;bootAbort?.abort(new Error('bootstrap_session_changed'));bootAbort=null;bootFlight=null;bootFlightOwner='';bootReady=false;bootOwner='';states.clear();bgQueue.length=0;queuedKeys.clear();bgBusy=false;warmStarted=false;optionalStarted=false;clearCoreData();}
function actorScope(){const actor=actorKey();if(coreActor!==actor)resetCoreActor(actor);return {actor,epoch:coreEpoch};}
function assertActor(scope,signal){signal?.throwIfAborted();if(!sameActor(scope))throw new Error('bootstrap_session_changed');}
// Follow the existing signed-out UI/local logout path; do not add an early
// auth listener before Android's initial session recovery.
for(const name of ['crmLocalSignOutV236258','crmShowSignedOutUiV236258']){const previous=window[name];if(typeof previous==='function')window[name]=function(){resetCoreActor();return previous.apply(this,arguments);};}

async function coreDeadline(factory,ms,parent,code){const controller=new AbortController();let timer,onAbort,onParent;
 const stopped=new Promise((_,reject)=>{onAbort=()=>reject(controller.signal.reason||new Error(code));controller.signal.addEventListener('abort',onAbort,{once:true});onParent=()=>controller.abort(parent.reason||new Error('bootstrap_session_changed'));if(parent?.aborted)onParent();else parent?.addEventListener('abort',onParent,{once:true});timer=setTimeout(()=>controller.abort(new Error(code)),ms);});
 try{return await Promise.race([stopped,Promise.resolve().then(()=>{controller.signal.throwIfAborted();return factory(controller.signal);})]);}finally{clearTimeout(timer);controller.signal.removeEventListener('abort',onAbort);parent?.removeEventListener('abort',onParent);}}
function requestWithSignal(request,signal){return typeof request?.abortSignal==='function'?request.abortSignal(signal):request;}
function coreAuthError(error){return [401,403].includes(Number(error?.status||error?.statusCode))||/^PGRST30[123]$/.test(String(error?.code||''))||/^core_http_(401|403)$/.test(String(error?.message||error||''));}
async function nativeCorePlugin(scope,signal){if(!(window.Capacitor?.isNativePlatform?.()===true&&window.Capacitor?.getPlatform?.()==='android'))return null;const plugin=window.Capacitor?.Plugins?.Air3Voice;if(typeof plugin?.capabilities!=='function')return null;try{const caps=await coreDeadline(()=>plugin.capabilities(),2000,signal,'bootstrap_capability_timeout');assertActor(scope,signal);return caps?.bootstrapCore===true?plugin:null;}catch(error){assertActor(scope,signal);return null;}}
async function nativeCoreData(plugin,scope,signal){const auth=await coreDeadline(()=>db.auth.getSession(),5000,signal,'bootstrap_auth_timeout');assertActor(scope,signal);const session=auth?.data?.session;if(auth?.error||!session?.access_token||session.user?.id&&session.user.id!==String(currentUser?.id||currentProfile?.id||''))throw new Error('bootstrap_auth_required');
 return coreDeadline(async requestSignal=>{const requestId='core-'+(window.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(16).slice(2));const cancel=()=>{try{Promise.resolve(plugin.cancel({requestId})).catch(()=>{});}catch(_){}};requestSignal.addEventListener('abort',cancel,{once:true});try{requestSignal.throwIfAborted();const response=await plugin.bootstrapCore({requestId,accessToken:session.access_token,apiKey:SUPABASE_KEY});assertActor(scope,requestSignal);return response?.result;}finally{requestSignal.removeEventListener('abort',cancel);}},25000,signal,'bootstrap_native_timeout');}
function validCore(data){return !!data&&typeof data==='object'&&Array.isArray(data.clients)&&Array.isArray(data.users);}
function bootstrapError(error){const code=String(error?.message||error||'');let message=code;if(code==='bootstrap_session_changed')message='Учётная запись изменилась. Выполните вход снова.';else if(code==='bootstrap_auth_required'||coreAuthError(error))message='Сессия CRM не подтверждена. Выполните вход снова.';else if(code==='bootstrap_auth_timeout')message='Не удалось проверить сессию за 5 секунд. Нажмите «Повторить загрузку».';else if(/bootstrap_.*timeout|core_native_.*failed|core_http_\d+/.test(code))message='Основные данные не загрузились вовремя. Нажмите «Повторить загрузку».';else if(code==='bootstrap_response_invalid')message='Сервер вернул неполные основные данные. Нажмите «Повторить загрузку».';const result=new Error(message);result.code=code;return result;}

function openCache(){
  return new Promise((resolve,reject)=>{
    if(!window.indexedDB){resolve(null);return;}
    const req=indexedDB.open(CACHE_DB,1);
    req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains(CACHE_STORE))d.createObjectStore(CACHE_STORE);};
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
  });
}
async function cacheGet(name){
  if(!PERSIST.has(name))return null;const scope=actorScope(),key=cacheKey(name);
  try{
    const d=await openCache();if(!d||!sameActor(scope))return null;
    return await new Promise((resolve,reject)=>{
      const tx=d.transaction(CACHE_STORE,'readonly'),r=tx.objectStore(CACHE_STORE).get(key);
      r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);
    });
  }catch(e){log(name,'cache-read-error',{error:String(e?.message||e)});return null;}
}
async function cacheSet(name,data,scope=actorScope()){
  if(!PERSIST.has(name)||!Array.isArray(data)||!sameActor(scope))return false;const key=cacheKey(name);
  try{
    const d=await openCache();if(!d||!sameActor(scope))return false;
    const payload={schema:CACHE_SCHEMA,savedAt:Date.now(),rows:data};
    await new Promise((resolve,reject)=>{
      const tx=d.transaction(CACHE_STORE,'readwrite');
      tx.objectStore(CACHE_STORE).put(payload,key);
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    });
    return true;
  }catch(e){log(name,'cache-write-error',{error:String(e?.message||e)});return false;}
}
function persistSnapshot(){
  const scope=actorScope();
  for(const name of PERSIST){
    let data=null;
    if(name==='tasks')data=allTasks;
    else if(name==='visits')data=allVisits;
    else if(name==='routes')data=allRoutePlans;
    else if(name==='absences')data=(typeof allManagerAbsences!=='undefined'?allManagerAbsences:null);
    else if(name==='negotiations')data=allNegotiations;
    else if(name==='aliases')data=allClientAliases;
    else if(name==='kpi')data=allManagerKpiPlans;
    else if(name==='imports')data=allImportStatus;
    else if(name==='vips')data=allVipSales;
    if(Array.isArray(data)&&data.length)cacheSet(name,data,scope);
  }
}

async function fullRows(table){return await (window.loadAllRows||loadAllRows)(table);}
async function coreRpcRows(fn){
  const {data,error}=await db.rpc(fn);
  if(error)throw error;
  return Array.isArray(data)?data:[];
}
function sortTasks(rows){
  const ids=activeClientIds();
  return (rows||[]).filter(t=>!t.client_id||ids.has(String(t.client_id))).sort((a,b)=>String(a.due_date||'').localeCompare(String(b.due_date||'')));
}
function apply(name,data){
  if(name==='tasks')allTasks=sortTasks(data);
  else if(name==='visits')allVisits=(data||[]).filter(v=>!v.is_duplicate).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
  else if(name==='routes')allRoutePlans=(data||[]).sort((a,b)=>String(a.visit_date||'').localeCompare(String(b.visit_date||'')));
  else if(name==='negotiations')allNegotiations=data||[];
  else if(name==='aliases'){allClientAliases=data||[];try{_clientAliasesById=null;}catch(_){}}
  else if(name==='quality')allVisitQualityReviews=data||[];
  else if(name==='routeReviews')allVisitRouteReviews=data||[];
  else if(name==='partial')allTaskPartialReviews=data||[];
  else if(name==='kpi')allManagerKpiPlans=data||[];
  else if(name==='imports')allImportStatus=data||[];
  else if(name==='vips'){allVipSales=data||[];allVipPromotions=[];try{v2273FeatureState.vip={loaded:true,promise:null};}catch(_){}}
  else if(name==='absences'){try{allManagerAbsences=data||[];}catch(_){}}
  return data;
}
const resourceLoaders={
  tasks:()=>coreRpcRows('crm_core_tasks_v236341'),
  visits:()=>coreRpcRows('crm_core_visits_v236341'),
  routes:()=>coreRpcRows('crm_core_routes_v236341'),
  negotiations:()=>fullRows('negotiations'),
  aliases:()=>fullRows('client_aliases'),
  quality:()=>fullRows('visit_quality_reviews'),
  routeReviews:()=>fullRows('visit_route_reviews'),
  partial:()=>fullRows('task_partial_reviews'),
  kpi:()=>fullRows('manager_kpi_plans'),
  imports:()=>fullRows('crm_import_status'),
  vips:()=>fullRows('vip_sales'),
  absences:async()=>{
    if(typeof window.loadManagerAbsencesV22732==='function')return await window.loadManagerAbsencesV22732(true);
    return [];
  }
};

function pageNeeds(page){
  if(page==='dashboard')return['tasks','visits','routes','absences'];
  if(page==='tasks')return['tasks','absences'];
  if(page==='visits')return['visits','routes','tasks','absences'];
  if(page==='my-routes'||page==='route'||page==='routes-boss')return['routes','visits','tasks','absences'];
  if(page==='alerts')return['tasks','partial','absences'];
  if(page==='control')return['tasks','visits','routes','absences'];
  if(page==='managers')return['tasks','visits','absences','kpi','imports'];
  if(page==='vip')return['vips'];
  if(page==='falling'||page==='sales'||page==='abc'||page==='payments')return['imports'];
  return[];
}
function activePageUses(name){
  return pageNeeds(activePage()).includes(name);
}
function rerenderActiveFor(name){
  const page=activePage();if(!page||!pageNeeds(page).includes(name))return;
  const epoch=window.__crmNavEpoch;
  setTimeout(()=>{
    if(page!==activePage()||(epoch!=null&&window.__crmNavEpoch!=null&&Number(epoch)!==Number(window.__crmNavEpoch)))return;
    try{if(typeof crmRenderPage==='function')crmRenderPage(page);}catch(e){console.warn('CRM ultra rerender '+page,e);}
    try{updateRoutesAlertDot?.();updateTasksAlertDot?.();updateSignalsAlertDot?.();}catch(_){}
    try{window.renderAbsenceDecorationsV22732?.();}catch(_){}
  },0);
}

async function hydrate(name){
  const scope=actorScope(),s=state(name);
  if(s.status==='ready'||s.hydrated)return s.status==='ready';
  s.hydrated=true;
  const cached=await cacheGet(name);
  if(!sameActor(scope))return false;
  if(!cached||cached.schema!==CACHE_SCHEMA||!Array.isArray(cached.rows)||!cached.rows.length)return false;
  if(Date.now()-Number(cached.savedAt||0)>PERSIST_MAX_AGE)return false;
  apply(name,cached.rows);
  s.data=cached.rows;s.loadedAt=Number(cached.savedAt)||0;s.status='ready';s.error=null;
  try{window.crmSingleRenderMarkResourceV227327?.(name);}catch(_){}
  log(name,'cache-ready',{rows:cached.rows.length,age_ms:Date.now()-s.loadedAt});
  return true;
}
async function fetchFresh(name){
  const scope=actorScope(),s=state(name);
  if(s.promise)return s.promise;
  const fn=resourceLoaders[name];if(!fn)return null;
  const started=now();s.refreshing=true;s.error=null;log(name,'network-start');
  const promise=(async()=>{
    try{
      const data=await fn();assertActor(scope);apply(name,data);
      s.data=data;s.loadedAt=Date.now();s.status='ready';s.error=null;
      log(name,'network-ready',{duration_ms:Math.round(now()-started),rows:Array.isArray(data)?data.length:undefined});
      cacheSet(name,data,scope);
      // SINGLE RENDER: data resources only mark dependants dirty.
      try{window.crmSingleRenderMarkResourceV227327?.(name);}catch(_){}
      return data;
    }catch(e){
      if(!sameActor(scope))throw e;
      s.error=e;if(s.status!=='ready')s.status='error';
      log(name,'network-error',{duration_ms:Math.round(now()-started),error:String(e?.message||e)});
      console.warn('CRM resource '+name+' refresh failed; cached UI stays usable',e);
      return s.data||[];
    }finally{s.promise=null;s.refreshing=false;}
  })();
  s.promise=promise;return promise;
}
async function get(name,force=false){
  const scope=actorScope(),s=state(name);
  if(!force){
    if(s.status==='ready'){
      if(!isFresh(name)&&!s.refreshing)queueResource(name,70);
      return s.data;
    }
    await hydrate(name);assertActor(scope);
    if(state(name).status==='ready'){
      if(!isFresh(name))queueResource(name,70);
      return state(name).data;
    }
  }
  return await fetchFresh(name);
}
window.crmCoreGetV22733=get;

function queueJob(key,priority,fn,delay=0){
  const nextPriority=Number(priority)||0,nextAt=Date.now()+Math.max(0,delay);
  if(queuedKeys.has(key)){
    const existing=bgQueue.find(x=>x.key===key);
    if(existing){
      existing.priority=Math.max(existing.priority,nextPriority);
      existing.notBefore=Math.min(existing.notBefore,nextAt);
      if(fn)existing.fn=fn;
      bgQueue.sort((a,b)=>b.priority-a.priority||a.notBefore-b.notBefore);
    }
    return;
  }
  queuedKeys.add(key);
  bgQueue.push({key,priority:nextPriority,fn,notBefore:nextAt});
  bgQueue.sort((a,b)=>b.priority-a.priority||a.notBefore-b.notBefore);
  pump();
}
function queueResource(name,priority=50,delay=0){
  const s=state(name);
  if(s.promise||s.refreshing||(s.status==='ready'&&isFresh(name)))return;
  queueJob('res:'+name,priority,()=>fetchFresh(name),delay);
}
async function waitForCalm(){
  while(Date.now()-lastInteractionAt<450)await waitTurn(120);
}
async function pump(){
  const scope=actorScope();if(bgBusy)return;bgBusy=true;
  try{
    while(bgQueue.length&&sameActor(scope)){
      bgQueue.sort((a,b)=>b.priority-a.priority||a.notBefore-b.notBefore);
      const job=bgQueue.shift();queuedKeys.delete(job.key);
      const wait=Math.max(0,job.notBefore-Date.now());if(wait)await waitTurn(wait);
      if(job.priority<80)await waitForCalm();
      if(!sameActor(scope))break;try{await job.fn();}catch(e){console.warn('CRM ultra prefetch '+job.key,e);}
      await waitTurn(0);
    }
  }finally{if(sameActor(scope))bgBusy=false;}
}

function pageLoading(page,text){
  const root=document.getElementById('page-'+page);if(!root)return;
  let el=root.querySelector('.crm-core-page-loader-v22733');
  if(!text){el?.remove();return;}
  if(!el){
    el=document.createElement('div');el.className='card crm-core-page-loader-v22733';
    el.style.cssText='margin-bottom:12px;padding:10px 12px;color:var(--sub);font-size:12px;border-style:dashed';
    const title=root.querySelector('.page-title');if(title)title.insertAdjacentElement('afterend',el);else root.prepend(el);
  }
  el.textContent='⏳ '+text+' Интерфейс работает — можно перейти в другой раздел.';
}
async function ensurePage(page,epoch){
  const needs=pageNeeds(page);if(!needs.length)return;
  const before=needs.filter(n=>state(n).status!=='ready');
  if(before.length){
    const hydrated=await Promise.all(before.map(hydrate));
    if(hydrated.some(Boolean)&&activePage()===page){
      try{window.crmSingleRenderRequestV227327?.(page,{reason:'cache-hydrated',delay:25});}catch(_){}
    }
  }
  const missing=needs.filter(n=>state(n).status!=='ready');
  // Cached/stale data is shown immediately; freshness never blocks the page.
  needs.filter(n=>state(n).status==='ready'&&!isFresh(n)).forEach(n=>queueResource(n,95));
  if(!missing.length){
    pageLoading(page,'');
    setTimeout(()=>{if(activePage()===page){try{window.renderAbsenceDecorationsV22732?.();}catch(_){}}},0);
    return;
  }
  pageLoading(page,'Подтягиваю свежие данные…');
  // User request bypasses low-priority queue. Background worker is max one,
  // therefore user data gets its own immediate network slot.
  await Promise.allSettled(missing.map(n=>fetchFresh(n)));
  if(epoch!=null&&window.__crmNavEpoch!=null&&Number(epoch)!==Number(window.__crmNavEpoch))return;
  if(activePage()!==page)return;
  pageLoading(page,'');
  try{window.crmSingleRenderRequestV227327?.(page,{reason:'page-data-ready',delay:35});}catch(e){console.warn('page render request '+page,e);}
  try{window.renderAbsenceDecorationsV22732?.();}catch(_){}
}
window.crmEnsurePageDataV22733=ensurePage;
// Read-only readiness for the home screen. Never infer an empty resource from
// the initial global [] or from fetchFresh's deliberately cached fallback.
window.crmCoreResourceStatusV1=function(name){
  const s=states.get(String(name));
  return s?{status:s.status,loadedAt:s.loadedAt,refreshing:s.refreshing,error:s.error?String(s.error.message||s.error):''}:{status:'idle',loadedAt:0,refreshing:false,error:''};
};

async function bootstrap(force=false){
  if(String(currentProfile?.access_scope||'').toLowerCase()==='triovist')return await legacyFullLoad.apply(this,arguments);
  const scope=actorScope();
  if(!currentUser?.id&&!currentProfile?.id)throw bootstrapError(new Error('bootstrap_auth_required'));
  if(bootReady&&bootOwner===scope.actor&&!force)return true;
  if(bootFlight&&bootFlightOwner===scope.actor)return bootFlight;
  const controller=new AbortController(),started=now();bootAbort=controller;bootReady=false;bootFlightOwner=scope.actor;log('bootstrap','start');
  let flight;
  flight=(async()=>{
    try{
      assertActor(scope,controller.signal);
      try{v2273ResetHistoryIndexes?.();}catch(_){}
      try{_clientNameMatchCache=null;}catch(_){}
      const plugin=await nativeCorePlugin(scope,controller.signal);assertActor(scope,controller.signal);
      let core=null,coreError=null;
      if(plugin){
        // Once native dispatch starts, an error is shown for an explicit retry.
        // Never issue an automatic WebView duplicate after a native request.
        core=await nativeCoreData(plugin,scope,controller.signal);
        if(!validCore(core))throw new Error('bootstrap_response_invalid');
      }else{
        try{
          const res=await coreDeadline(signal=>requestWithSignal(db.rpc('crm_bootstrap_core_v236316'),signal),15000,controller.signal,'bootstrap_rpc_timeout');
          core=res?.data;coreError=res?.error?Object.assign(new Error(res.error.message||'bootstrap_rpc_failed'),res.error,{status:res.status||res.error.status}):null;
          if(!coreError&&!validCore(core))coreError=new Error('bootstrap_response_invalid');
        }catch(e){coreError=e;}
        assertActor(scope,controller.signal);
        if(coreError){
          if(coreAuthError(coreError))throw coreError;
          console.warn(VERSION+' bounded bootstrap fallback',String(coreError.message||coreError));
          core=await coreDeadline(async signal=>{
            const clientsReq=requestWithSignal(db.from('clients').select('*').order('revenue_total',{ascending:false}).limit(1000),signal);
            const usersReq=requestWithSignal(db.from('users').select('*'),signal);
            const [clientsRes,usersRes]=await Promise.all([clientsReq,usersReq]);
            if(clientsRes?.error)throw clientsRes.error;if(usersRes?.error)throw usersRes.error;
            const value={clients:clientsRes?.data,users:usersRes?.data};if(!validCore(value))throw new Error('bootstrap_response_invalid');return value;
          },25000,controller.signal,'bootstrap_fallback_timeout');
        }
      }
      assertActor(scope,controller.signal);
      const clients=core.clients.filter(c=>!clientIsArchived(c)),users=core.users.length?core.users:(currentProfile?[currentProfile]:[]);
      // Validate both datasets and actor before applying either one.
      allClients=clients;allUsers=users;
      allTasks=[];allVisits=[];allRoutePlans=[];allNegotiations=[];allClientAliases=[];
      allVisitQualityReviews=[];allVisitRouteReviews=[];allTaskPartialReviews=[];allManagerKpiPlans=[];allImportStatus=[];allVipSales=[];allVipPromotions=[];
      try{allManagerAbsences=[];}catch(_){}try{_clientAliasesById=null;}catch(_){}
      allPurchaseHistory=[];try{v2273HistoryNeedsRefresh=true;}catch(_){}
      allPurchases=[];allPurchaseItems=[];allClientPhotos=[];allPromotions=[];allPromotionBudgets=[];allPromotionBudgetMovements=[];allPromotionPhotos=[];allPromotionBudgetAudit=[];allClientDebt=[];allDebtComments=[];allStock=[];allPrice=[];
      bootOwner=scope.actor;bootReady=true;log('bootstrap','ready',{duration_ms:Math.round(now()-started),clients:allClients.length,users:allUsers.length});return true;
    }catch(error){if(sameActor(scope))bootReady=false;throw bootstrapError(error);}
    finally{if(bootFlight===flight){bootFlight=null;bootFlightOwner='';if(bootAbort===controller)bootAbort=null;}}
  })();
  bootFlight=flight;return flight;
}
window.crmFastBootstrapV22733=bootstrap;

async function hydrateCore(){
  const names=['tasks','visits','routes','absences'];
  const got=await Promise.all(names.map(hydrate));
  if(got.some(Boolean)&&activePage()==='dashboard'){
    try{window.crmSingleRenderRequestV227327?.('dashboard',{reason:'core-cache-hydrate',delay:20});window.renderAbsenceDecorationsV22732?.();}catch(_){}
  }
}
function featureJob(key,priority,fn,delay=0){queueJob('feature:'+key,priority,fn,delay);}
function prefetchFeatureForPage(page,priority=65){
  if(page==='tasks'){
    featureJob('tasks-stock',priority,async()=>{if(typeof window.v2273EnsureFeature==='function')await window.v2273EnsureFeature('tasks-stock');});
  }else if(page==='promotions'||page==='budgets'){
    featureJob('promotions',priority,async()=>{if(typeof window.v2273EnsureFeature==='function')await window.v2273EnsureFeature('promotions');});
  }else if(page==='debt'){
    featureJob('debt',priority,async()=>{if(typeof window.v2273EnsureFeature==='function')await window.v2273EnsureFeature('debt');});
  }else if(page==='vip'){
    queueResource('vips',priority);
    featureJob('history',priority-2,async()=>{if(typeof window.v22722EnsureHistory==='function')await window.v22722EnsureHistory({reason:'ultra-prefetch-vip'});});
  }else if(page==='sales'){
    featureJob('sales-fast',priority,async()=>{await window.crmFastSalesReloadV236338?.();});
  }else if(page==='falling'){
    featureJob('history',priority,async()=>{if(typeof window.v22722EnsureHistory==='function')await window.v22722EnsureHistory({reason:'ultra-prefetch-'+page});});
  }else if(page==='abc'){
    featureJob('history',priority,async()=>{if(typeof window.v22722EnsureHistory==='function')await window.v22722EnsureHistory({reason:'ultra-prefetch-abc'});});
    featureJob('abc-stock',priority-1,async()=>{if(typeof window.v2273EnsureFeature==='function')await window.v2273EnsureFeature('tasks-stock');});
  }else if(page==='payments'){
    featureJob('payments',priority,async()=>{await window.crmPrefetchPaymentsV22734?.();});
  }else if(page==='routes-boss'||page==='my-routes'||page==='route'){
    featureJob('route-workflow',priority,async()=>{await window.crmPrefetchRouteWorkflowV22734?.();});
    featureJob('route-physical',priority-1,async()=>{await window.crmPrefetchPhysicalRoutesV22734?.();});
  }else if(page==='networks'){
    featureJob('networks',priority,async()=>{await window.crmPrefetchNetworksV22734?.();});
  }else if(page==='triovist'){
    // v23.6.379: Triovist owns its section-level lazy loader. Do not prefetch heavy dashboards.
  }
}
window.crmUltraPrefetchPageV22734=function(page,reason='manual'){
  const needs=pageNeeds(page);
  needs.forEach(n=>{
    const s=state(n);
    if(s.status!=='ready')hydrate(n).then(ok=>{if(!ok)queueResource(n,reason==='open'?100:85);else if(!isFresh(n))queueResource(n,reason==='open'?95:75);});
    else if(!isFresh(n))queueResource(n,reason==='open'?95:75);
  });
  prefetchFeatureForPage(page,reason==='open'?100:reason==='hover'?85:60);
};
window.crmUltraPageOpenedV22734=function(page,epoch){
  lastPageOpenAt=Date.now();
  window.crmUltraPrefetchPageV22734(page,'open');
};

async function warmDashboard(){
  const scope=actorScope();
  if(String(currentProfile?.access_scope||'').toLowerCase()==='triovist')return;
  if(warmStarted)return;warmStarted=true;

  // SINGLE RENDER CORE: persisted snapshot first, then one fresh batch.
  await hydrateCore();if(!sameActor(scope))return;
  if(activePage()==='dashboard')try{window.crmSingleRenderRequestV227327?.('dashboard',{reason:'core-cache',delay:20});}catch(_){}
  // Reduce simultaneous dashboard RPC pressure on PostgREST after login.
  for(const name of ['tasks','visits','routes','absences']){
    if(!sameActor(scope))return;await fetchFresh(name);
    await waitTurn(120);
  }
  if(activePage()==='dashboard')try{window.crmSingleRenderRequestV227327?.('dashboard',{reason:'core-fresh-batch',delay:40});}catch(_){}

  // Small version watcher starts independently. It never loads heavy data by itself.
  setTimeout(()=>{try{window.crmResponsiveStartV227325?.();}catch(_){}},900);
}
window.crmWarmDashboardV22733=warmDashboard;

function warmOptional(){
  // Deliberately empty. Hidden pages do zero background work.
  optionalStarted=true;
  return true;
}
window.crmWarmOptionalV22733=warmOptional;

window.crmCoreRefreshV22733=async function(names){
  const arr=Array.isArray(names)?names:[names],result=await Promise.allSettled(arr.filter(Boolean).map(n=>fetchFresh(n)));
  const p=activePage();
  try{if(p)window.crmSingleRenderRequestV227327?.(p,{reason:'core-refresh-batch',delay:40});}catch(_){}
  return result;
};
window.crmUltraInvalidateV22734=function(...names){
  names.flat().filter(Boolean).forEach(name=>{
    const s=state(name);s.loadedAt=0;s.status=s.data?'ready':'idle';
  });
};

// RESPONSIVE CORE: mouse hover/touch NEVER starts data loading.
// User click first switches the page; the page itself then requests what it needs.
document.addEventListener('pointerdown',()=>{lastInteractionAt=Date.now();},true);
document.addEventListener('keydown',()=>{lastInteractionAt=Date.now();},true);
document.addEventListener('scroll',()=>{lastInteractionAt=Date.now();},{passive:true,capture:true});
window.addEventListener('pagehide',persistSnapshot);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persistSnapshot();});

window.RESANTA_CRM_PERFORMANCE_FINAL=Object.freeze({
  version:'v22.7.32.2.5-responsive',fastBootstrap:true,startupTables:['clients','users'],singleFlight:true,
  pagePriority:true,staleRenderGuard:true,coreOnlyBackground:true,persistentCache:true,
  staleWhileRevalidate:true,hoverPrefetch:false,heavyAutoPrefetch:false,purchaseHistoryOnDemandOnly:true,
  backgroundConcurrency:1,noFullLoadOnStartup:true,preservesV22732:true
});
window.RESANTA_CRM_ULTRA_FAST_FINAL=Object.freeze({
  version:'v22.7.32.2.5-responsive',
  fastShell:true,
  ramCache:true,
  userScopedIndexedDbCache:true,
  staleWhileRevalidate:true,
  coreOnlyBackground:true,
  hoverPrefetch:false,
  heavyAutoPrefetch:false,
  purchaseHistoryOnDemandOnly:true,
  pagePriority:true,
  noBusinessLogicChanges:true
});
})();

/* ===== ORIGINAL INLINE SCRIPT 56 ===== */
// ============================================================================
// RESANTA CRM v22.7.32.2.5 · RESPONSIVE DATA VERSION WATCHER
//
// No full-page reloads. No Ctrl+Shift+F5 for business data.
// A tiny version table is polled; only changed + currently needed resources
// are re-read. Heavy purchase_history stays strictly on-demand.
// ============================================================================
(function(){
'use strict';
if(window.RESANTA_CRM_RESPONSIVE_CORE_V227325)return;

const VERSION='v22.7.32.2.5';
const POLL_MS=0;
const versions=new Map();
const dirty=new Set();
const flights=new Map();
let started=false,timer=null,baselineReady=false,disabled=false,realtimeChannel=null,realtimeRetry=0;

function page(){
  try{return typeof crmActivePage==='function'?crmActivePage():document.getElementById('app')?.dataset?.activePage||'';}
  catch(_){return'';}
}
function pageKeys(p){
  const map={
    dashboard:['clients','tasks','visits','routes','absences'],
    clients:['clients','aliases'],
    tasks:['tasks','absences','stock'],
    visits:['visits','routes','tasks'],
    'my-routes':['routes','visits','tasks','absences'],
    'routes-boss':['routes','visits','tasks','absences'],
    route:['routes','visits','tasks'],
    control:['tasks','visits','routes','absences'],
    alerts:['tasks','promotions','sales','vips'],
    managers:['tasks','visits','absences','users','kpi','imports','sales'],
    users:['users'],
    vip:['vips','sales'],
    sales:['sales'],
    falling:['sales','tasks','visits'],
    abc:['sales','stock'],
    payments:['payments','imports'],
    promotions:['promotions'],
    budgets:['promotions'],
    debt:['debt'],
    networks:['networks','routes'],
    triovist:[],
    'gps-control':['gps','users'],
    workday:['gps']
  };
  return map[p]||[];
}
function renderActive(){
  const p=page();
  try{
    if(['dashboard','clients','tasks','visits','vip','promotions','budgets','debt','managers','control','users','route','routes-boss','my-routes','sales','abc'].includes(p)){
      if(typeof window.crmSingleRenderRequestV227327==='function')window.crmSingleRenderRequestV227327(p,{reason:'version-watcher',delay:45});
      else if(typeof crmRenderPage==='function')crmRenderPage(p);
    }else if(p==='falling'&&typeof renderFallingClients==='function')renderFallingClients();
    else if(p==='payments'&&typeof renderPayments==='function')renderPayments();
    else if(p==='networks'&&typeof renderNetworks2273==='function')renderNetworks2273();
    else if(p==='triovist'){/* section router owns Triovist rendering */}
    else if(p==='gps-control'&&typeof v19RenderGpsControl==='function')v19RenderGpsControl(false);
    else if(p==='workday'&&typeof v19RenderManagerWorkday==='function')v19RenderManagerWorkday();
  }catch(e){console.warn(VERSION+' render active',e);}
}
async function freshClients(){
  const {data,error}=await db.from('clients').select('*').order('revenue_total',{ascending:false}).limit(1000);
  if(error)throw error;
  allClients=(data||[]).filter(c=>!clientIsArchived(c));
  try{_clientNameMatchCache=null;}catch(_){}
  return allClients;
}
async function freshUsers(){
  const {data,error}=await db.from('users').select('*');
  if(error)throw error;allUsers=data||[];return allUsers;
}
async function refreshKey(key){
  if(flights.has(key))return flights.get(key);
  const active=page();
  let coreRendered=false;
  const promise=(async()=>{
    try{
      if(['tasks','visits','routes','absences','negotiations','aliases','kpi','imports','vips'].includes(key)){
        // Core refresh marks data dirty; the single render controller coalesces paint.
        await window.crmCoreRefreshV22733?.(key);
        if(active==='alerts'&&key==='vips'&&typeof window.crmSignalsRefreshV227329==='function')await window.crmSignalsRefreshV227329('vips');
      }else if(key==='clients'){
        await freshClients();
      }else if(key==='users'){
        await freshUsers();
      }else if(key==='sales'){
        if(active==='sales'&&typeof window.crmFastSalesReloadV236338==='function'){
          await window.crmFastSalesReloadV236338();
          dirty.delete(key);
          return true;
        }
        if(active==='managers'){
          dirty.delete(key);
          renderActive();
          return true;
        }
        if(active==='alerts'&&typeof window.crmSignalsRefreshV227329==='function'){
          await window.crmSignalsRefreshV227329('sales');
        }else if(['falling','abc','vip'].includes(active)&&typeof window.v22722EnsureHistory==='function'){
          await window.v22722EnsureHistory({force:true,reason:'responsive-version'});
        }else return false;
      }else if(key==='payments'){
        if(active!=='payments')return false;
        allCashReceipts=await loadAllRows('cash_receipts_1c');
      }else if(key==='promotions'){
        if(active==='alerts'&&typeof window.crmSignalsRefreshV227329==='function'){
          await window.crmSignalsRefreshV227329('promotions');
        }else{
          if(!['promotions','budgets'].includes(active))return false;
          try{v2273FeatureState.promotions={loaded:false,promise:null};}catch(_){}
          await window.v2273EnsureFeature?.('promotions');
        }
      }else if(key==='debt'){
        if(active!=='debt')return false;
        try{v2273FeatureState.debt={loaded:false,promise:null};}catch(_){}
        await window.v2273EnsureFeature?.('debt');
      }else if(key==='stock'){
        if(!['tasks','abc'].includes(active))return false;
        try{v2273FeatureState['tasks-stock']={loaded:false,promise:null};}catch(_){}
        await window.v2273EnsureFeature?.('tasks-stock');
      }else if(key==='networks'){
        if(active!=='networks')return false;
        await window.refreshNetworks2273?.(true);
      }else if(key==='triovist'){
        // v23.6.379: never launch a whole-Triovist refresh from the global CRM watcher.
        return false;
      }else if(key==='gps'){
        if(active==='gps-control'){
          try{await v19LoadGpsAccess?.();}catch(_){}
          await v19RenderGpsControl?.(true);
        }else if(active==='workday'){
          try{await v19LoadMyWorkday?.();}catch(_){}
          v19RenderManagerWorkday?.();
        }else return false;
      }else{
        return false;
      }
      dirty.delete(key);
      if(page()===active&&!coreRendered)renderActive();
      return true;
    }catch(e){
      console.warn(VERSION+' refresh '+key,e);
      return false;
    }finally{
      flights.delete(key);
    }
  })();
  flights.set(key,promise);
  return promise;
}
async function refreshDirtyForPage(p){
  const needed=pageKeys(p);
  for(const key of needed){
    if(dirty.has(key))await refreshKey(key);
  }
}
let responsiveRefreshTimer=0,responsiveRefreshSeq=0,versionPollFlight=null,lastVersionPollAt=0;
function scheduleDirtyRefresh(p,delay=650){
  const seq=++responsiveRefreshSeq;
  if(responsiveRefreshTimer)clearTimeout(responsiveRefreshTimer);
  const attempt=()=>{
    responsiveRefreshTimer=0;
    if(seq!==responsiveRefreshSeq||page()!==p)return;
    const last=Number(window.__crmInstantLastInteraction||0);
    const quiet=Date.now()-last;
    if(last&&quiet<900){
      responsiveRefreshTimer=setTimeout(attempt,Math.max(180,950-quiet));
      return;
    }
    const run=()=>{if(seq===responsiveRefreshSeq&&page()===p)refreshDirtyForPage(p);};
    if(typeof requestIdleCallback==='function')requestIdleCallback(run,{timeout:2600});
    else responsiveRefreshTimer=setTimeout(run,80);
  };
  responsiveRefreshTimer=setTimeout(attempt,Math.max(0,delay));
}

async function poll(force=false){
  if(disabled||document.visibilityState!=='visible'||typeof db==='undefined'||!currentProfile)return;
  const now=Date.now();
  if(versionPollFlight)return versionPollFlight;
  if(!force&&now-lastVersionPollAt<5000)return;
  versionPollFlight=(async()=>{
  try{
    lastVersionPollAt=Date.now();
    const {data,error}=await db.from('crm_data_versions').select('resource_key,version,changed_at');
    if(error)throw error;
    const rows=data||[];
    if(!baselineReady){
      rows.forEach(r=>versions.set(String(r.resource_key),Number(r.version)||0));
      baselineReady=true;return;
    }
    const changed=[];
    rows.forEach(r=>{
      const k=String(r.resource_key||''),v=Number(r.version)||0,old=versions.get(k);
      if(old!=null&&v!==old){dirty.add(k);changed.push(k);try{window.crmSingleRenderMarkResourceV227327?.(k);}catch(_){}}
      versions.set(k,v);
    });
    if(changed.length){
      console.debug('[CRM DATA VERSION]',changed.join(', '));
      scheduleDirtyRefresh(page(),850);
    }
  }catch(e){
    const msg=String(e?.message||e);
    if(/crm_data_versions|42P01|does not exist/i.test(msg)){
      disabled=true;
      console.warn(VERSION+' version watcher disabled: run the package SQL first.',e);
    }else console.warn(VERSION+' version watcher',e);
  }finally{versionPollFlight=null;}
  })();
  return versionPollFlight;
}
function acceptRealtimeVersion(row){
  const k=String(row?.resource_key||''),v=Number(row?.version)||0;
  if(!k)return;
  const old=versions.get(k);
  versions.set(k,v);
  if(old==null){return;}
  if(v!==old){
    dirty.add(k);
    try{window.crmSingleRenderMarkResourceV227327?.(k);}catch(_){}
    scheduleDirtyRefresh(page(),500);
  }
}
function startRealtime(){
  if(disabled||realtimeChannel)return true;
  let client=null;try{client=(typeof db!=='undefined'&&db)||window.db}catch(_){client=window.db}
  if(!client||typeof client.channel!=='function'){
    if(realtimeRetry++<12)setTimeout(startRealtime,1000);
    return false;
  }
  try{
    realtimeChannel=client.channel('crm-data-versions-v23657')
      .on('postgres_changes',{event:'*',schema:'public',table:'crm_data_versions'},payload=>acceptRealtimeVersion(payload?.new||payload?.old||{}))
      .subscribe(status=>{
        if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){
          try{client.removeChannel?.(realtimeChannel)}catch(_){}
          realtimeChannel=null;
          if(realtimeRetry++<12)setTimeout(startRealtime,1500);
        }
      });
    return true;
  }catch(e){
    realtimeChannel=null;
    if(realtimeRetry++<12)setTimeout(startRealtime,1500);
    console.warn(VERSION+' realtime watcher',e);
    return false;
  }
}
window.crmResponsivePageOpenedV227325=function(p){
  // Navigation stays instant. One tiny version check on page entry is the
  // fallback if realtime was temporarily unavailable.
  scheduleDirtyRefresh(p,700);
  setTimeout(()=>poll(false),120);
};
window.crmResponsiveMarkDirtyV227325=function(...keys){
  keys.flat().filter(Boolean).forEach(k=>dirty.add(String(k)));
  scheduleDirtyRefresh(page(),850);
};
window.crmResponsiveStartV227325=function(){
  if(disabled)return;
  if(!started){started=true;setTimeout(()=>poll(false),900);}
  startRealtime();
};
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible'){window.crmResponsiveStartV227325();setTimeout(()=>poll(false),120);}
});
window.addEventListener('focus',()=>{window.crmResponsiveStartV227325();setTimeout(()=>poll(false),120)});
setTimeout(()=>window.crmResponsiveStartV227325(),1800);

window.RESANTA_CRM_RESPONSIVE_CORE_V227325=Object.freeze({
  version:'v23.6.57',
  versionPollSeconds:0,
  realtimeVersions:true,
  focusAndPageFallback:true,
  addressableRefresh:true,
  fullPageReloadForData:false,
  purchaseHistoryBackgroundLoad:false,
  hoverPrefetch:false,
  oldUltraPagePrefetch:false,
  globalTaskStockAudit:false,
  taskStockAuditOnExplicitClickOnly:true,
  duplicateCoreRender:false,
  stalePageRenderGuard:true,
  coreBackgroundOnly:['tasks','visits','routes','absences']
});
window.RESANTA_CRM_NAV_BACKGROUND_ROOT_FIX_V227326=Object.freeze({
  version:'v22.7.32.2.6',
  navigationFirst:true,
  noGlobalBusinessAudit:true,
  noTaskStockCalculationDuringRender:true,
  explicitStockCheckOnly:true,
  promotionsContractGate:true,promotionsSingleFinalRender:true,noSqlChanges:true
});
window.RESANTA_SIGNALS_FAST_PATH_V227328=Object.freeze({
  version:'v22.7.32.2.8',
  currentRulesDirect:true,
  legacyRouteCalculations:false,
  legacyVisitCalculations:false,
  duplicateSignalTruthCalculation:false,
  obsoleteRouteDataCardCalculation:false,
  memoizedTruth:true,
  navigationCoreUntouched:true,
  noSqlChanges:true
});
})();

/* ===== ORIGINAL INLINE SCRIPT 57 ===== */
// ============================================================================
// RESANTA CRM v22.7.32.2.7 · SINGLE RENDER NAVIGATION ROOT FIX
//
// One navigation click -> one authoritative page-render queue.
// Data loaders may only mark pages dirty. They cannot paint by themselves.
// Already-built clean pages reuse their existing DOM instantly.
// ============================================================================
(function(){
'use strict';
if(window.RESANTA_SINGLE_RENDER_NAV_V227327)return;
const VERSION='v22.7.32.2.7-v23.6.71';
const rawRender=window.crmRenderPage||globalThis.crmRenderPage;
const state=new Map(),stats=[];
const CACHEABLE=new Set([
  'dashboard','alerts','clients','tasks','visits','vip',
  'promotions','budgets','debt','managers','control',
  'sales','falling','abc','payments','users',
  'route','routes-boss','my-routes','networks'
]);
const RESOURCE_PAGES={
  clients:['dashboard','clients','vip','falling','managers','control','routes-boss','my-routes'],
  users:['managers','users','gps-control'],
  tasks:['dashboard','tasks','visits','managers','control','falling','routes-boss','my-routes'],
  visits:['dashboard','visits','managers','control','falling','routes-boss','my-routes'],
  routes:['dashboard','visits','managers','control','routes-boss','my-routes','route','networks'],
  absences:['dashboard','tasks','managers','control','routes-boss','my-routes'],
  aliases:['clients'],negotiations:['clients'],kpi:['managers'],imports:['dashboard','payments','sales','falling','abc'],
  vips:['vip'],sales:['vip','sales','falling','abc'],payments:['payments'],promotions:['promotions','budgets'],
  debt:['debt'],stock:['tasks','abc'],networks:['networks'],gps:['gps-control','workday']
};
function active(){try{return typeof crmActivePage==='function'?crmActivePage():(document.getElementById('app')?.dataset?.activePage||'');}catch(_){return'';}}
function pageState(p){if(!state.has(p))state.set(p,{built:false,dirty:true,rendering:false,pending:false,timer:0,raf:0,idleTimer:0,idleHandle:0,seq:0,lastMs:0,lastAt:0});return state.get(p);}
function markPage(p){if(!p)return;pageState(p).dirty=true;}
function markResource(key){(RESOURCE_PAGES[String(key)]||[]).forEach(markPage);try{if(['tasks','visits','routes','clients','users','kpi'].includes(String(key)))window.crmInvalidateManagerKpiV227327?.();}catch(_){}}
function log(p,reason,ms){stats.push({page:p,reason:reason||'',ms:Math.round(ms),at:new Date().toISOString()});if(stats.length>200)stats.splice(0,stats.length-200);}

const LIVE_PAGES=new Set(['gps-control','workday']);
let instantLastInteraction=Date.now();
window.__crmInstantLastInteraction=instantLastInteraction;
function instantTouch(){
  instantLastInteraction=Date.now();
  window.__crmInstantLastInteraction=instantLastInteraction;
}
['pointerdown','keydown','wheel','touchstart'].forEach(ev=>{
  window.addEventListener(ev,instantTouch,{capture:true,passive:true});
});
function cancelIdleRefresh(st){
  if(!st)return;
  if(st.idleTimer){clearTimeout(st.idleTimer);st.idleTimer=0;}
  if(st.idleHandle&&typeof cancelIdleCallback==='function'){
    try{cancelIdleCallback(st.idleHandle);}catch(_){}
    st.idleHandle=0;
  }
}
function scheduleIdleRefresh(p,reason){
  const st=pageState(p);
  cancelIdleRefresh(st);
  const epoch=window.__crmNavEpoch;
  const attempt=()=>{
    st.idleTimer=0;
    if(active()!==p||(epoch!=null&&window.__crmNavEpoch!=null&&Number(epoch)!==Number(window.__crmNavEpoch)))return;
    const quietFor=Date.now()-instantLastInteraction;
    if(quietFor<850){
      st.idleTimer=setTimeout(attempt,Math.max(160,900-quietFor));
      return;
    }
    const commit=()=>{
      st.idleHandle=0;
      if(active()!==p||(epoch!=null&&window.__crmNavEpoch!=null&&Number(epoch)!==Number(window.__crmNavEpoch)))return;
      request(p,{reason:'idle-memory-refresh:'+String(reason||''),idleCommit:true,delay:0});
    };
    if(typeof requestIdleCallback==='function')st.idleHandle=requestIdleCallback(commit,{timeout:2400});
    else st.idleTimer=setTimeout(commit,80);
  };
  st.idleTimer=setTimeout(attempt,520);
}
let promotionsGateFlightV23671=null;
function request(p,opts={}){
  if(!p||active()!==p)return false;
  if(p==='promotions'&&!opts.promoContractReady){
    const ready=typeof window.crmPromotionsReadyV23671==='function'&&window.crmPromotionsReadyV23671();
    const ensure=window.crmEnsurePromotionsReadyV23671;
    if(!ready&&typeof ensure==='function'){
      try{window.crmPromotionGateOverlayV23671?.(true,'Загружаю актуальные акции, бюджеты и продажи из 1С…')}catch(_){}
      if(!promotionsGateFlightV23671){
        const gateEpoch=window.__crmNavEpoch;
        promotionsGateFlightV23671=Promise.resolve(ensure(gateEpoch)).then(ok=>{
          if(!ok||active()!=='promotions')return false;
          if(gateEpoch!=null&&window.__crmNavEpoch!=null&&Number(gateEpoch)!==Number(window.__crmNavEpoch))return false;
          return request('promotions',{reason:'promotions-contract-ready',force:true,promoContractReady:true,delay:0});
        }).catch(e=>{
          console.warn(VERSION+' promotions contract gate',e);
          return false;
        }).finally(()=>{promotionsGateFlightV23671=null});
      }
      return true;
    }
  }
  const st=pageState(p),force=!!opts.force,idleCommit=!!opts.idleCommit,
        reason=opts.reason||'request',delay=Math.max(0,Number(opts.delay)||0),
        cacheable=CACHEABLE.has(p)&&!LIVE_PAGES.has(p);

  // INSTANT PAGE MEMORY:
  // navigation never destroys/rebuilds an already-rendered business page.
  // If data changed while hidden, old DOM is shown immediately and the
  // refresh is committed only when the browser/user is calm.
  if(cacheable&&st.built&&!force&&!idleCommit){
    if(!st.dirty)return true;

    // These complete a first-time lazy page load and should not leave the
    // initial loading skeleton visible.
    const firstLoadCompletion=
      (Date.now()-Number(st.lastAt||0)<5000)&&
      ['feature-ready','page-data-ready','cache-hydrated'].includes(String(reason));

    if(!firstLoadCompletion){
      scheduleIdleRefresh(p,reason);
      return true;
    }
  }

  cancelIdleRefresh(st);
  st.seq++;const seq=st.seq,epoch=window.__crmNavEpoch;
  if(st.timer)clearTimeout(st.timer);
  if(st.raf&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(st.raf);
  const schedule=()=>{st.timer=setTimeout(async()=>{
    st.timer=0;
    if(seq!==st.seq||active()!==p||(epoch!=null&&window.__crmNavEpoch!=null&&Number(epoch)!==Number(window.__crmNavEpoch)))return;
    if(st.rendering){st.pending=true;return;}
    st.rendering=true;st.pending=false;
    const t0=performance.now?performance.now():Date.now();
    try{if(typeof rawRender==='function')await Promise.resolve(rawRender(p));}
    catch(e){console.warn(VERSION+' render '+p,e);}
    finally{
      const ms=(performance.now?performance.now():Date.now())-t0;
      st.lastMs=ms;st.lastAt=Date.now();st.rendering=false;
      if(active()===p&&(epoch==null||window.__crmNavEpoch==null||Number(epoch)===Number(window.__crmNavEpoch))){
        st.built=true;st.dirty=false;log(p,reason,ms);
      }
      if(p==='promotions'&&typeof window.crmPromotionsReadyV23671==='function'&&window.crmPromotionsReadyV23671()){
        try{window.crmPromotionGateOverlayV23671?.(false)}catch(_){}
      }
      if(st.pending&&active()===p){
        st.pending=false;
        scheduleIdleRefresh(p,'coalesced-pending');
      }
    }
  },delay);};
  if(typeof requestAnimationFrame==='function')st.raf=requestAnimationFrame(schedule);
  else schedule();
  return true;
}
window.crmSingleRenderIsBuiltV227317=p=>!!pageState(p).built;
window.crmSingleRenderIsDirtyV227317=p=>!!pageState(p).dirty;
window.crmSingleRenderPageStateV227317=p=>({...pageState(p)});
window.crmSingleRenderRefreshIdleV227317=p=>scheduleIdleRefresh(p||active(),'manual-idle');
window.crmSingleRenderMarkPageV227327=markPage;
window.crmSingleRenderMarkResourceV227327=markResource;
window.crmSingleRenderRequestV227327=request;
window.CRM_RENDER_STATS_V227327=stats;

// Replace the global dispatcher seen by the original goPage and all later callers.
window.crmRenderPage=function(p){return request(p,{reason:'navigation',delay:0});};
try{globalThis.crmRenderPage=window.crmRenderPage;}catch(_){}

// Manager KPI: never allow duplicate RPCs caused by repeated render requests.
try{
  const managerBase=window.renderManagers||globalThis.renderManagers;let managerFlight=null,managerFlightMonth='';let kpiGeneration=0;
  window.crmInvalidateManagerKpiV227327=()=>{kpiGeneration++;};
  if(typeof managerBase==='function'){
    const wrappedManagers=function(){
      const month=(document.getElementById('manager-kpi-month')?.value||String(window.TODAY||'').slice(0,7)).slice(0,7),gen=kpiGeneration;
      if(managerFlight&&managerFlightMonth===month)return managerFlight;
      const self=this,args=arguments;
      managerFlightMonth=month;
      managerFlight=Promise.resolve().then(()=>{
        if(active()!=='managers')return;
        return managerBase.apply(self,args);
      }).finally(()=>{if(managerFlightMonth===month&&gen===kpiGeneration){managerFlight=null;managerFlightMonth='';}else{managerFlight=null;managerFlightMonth='';}});
      return managerFlight;
    };
    window.renderManagers=wrappedManagers;try{globalThis.renderManagers=wrappedManagers;}catch(_){}
  }
}catch(e){console.warn(VERSION+' manager KPI single-flight',e);}

// A real navigation always has visual priority. Already-built clean DOM is reused;
// first/dirty entry gets exactly one controller request from the original goPage.


window.RESANTA_SINGLE_RENDER_NAV_V227327=Object.freeze({
  version:VERSION,
  oneRenderController:true,
  resourcesCannotRender:true,
  cleanDomReuse:true,
  managerKpiSingleFlight:true,
  hiddenVipPrecompute:false,
  allBusinessPagesDomMemory:true,
  dirtyNavigationRefreshOnIdle:true,
  livePages:['gps-control','workday'],
  stalePageGuard:true,
  noSqlChanges:true
});
})();
