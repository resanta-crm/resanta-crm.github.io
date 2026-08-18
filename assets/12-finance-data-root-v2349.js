/* RESANTA CRM v23.4.9 · FINANCE DATA ROOT
 * Permanent truth controller for PDZ and 1C payments.
 * - first page open always gets a fresh server read
 * - single-flight, no duplicate heavy reads
 * - failed refresh never turns last good data into a false zero
 * - active finance page self-refreshes quietly
 * - does not touch Triovist, GPS, routes, sales or manager plans
 */
(function(){
'use strict';
if(window.RESANTA_FINANCE_DATA_ROOT_V2349)return;

const V='v23.4.9';
const S={
  payments:{flight:null,lastOk:0,lastTry:0,error:'',loaded:false},
  debt:{flight:null,lastOk:0,lastTry:0,error:'',loaded:false}
};
const ACTIVE_REFRESH_MS=30000;
const MIN_REFRESH_GAP_MS=12000;

function activePage(){
  try{return typeof crmActivePage==='function'?crmActivePage():(document.getElementById('app')?.dataset?.activePage||'');}
  catch(_){return'';}
}
function dbClient(){
  try{if(typeof db!=='undefined'&&db)return db}catch(_){}
  return window.db||null;
}
async function strictRows(table){
  if(typeof window.loadAllRows==='function')return await window.loadAllRows(table);
  try{if(typeof loadAllRows==='function')return await loadAllRows(table)}catch(_){}
  const client=dbClient();
  if(!client)throw new Error('Соединение с базой ещё не готово');
  const out=[];const page=1000;
  for(let from=0;;from+=page){
    const {data,error}=await client.from(table).select('*').range(from,from+page-1);
    if(error)throw error;
    const rows=data||[];out.push(...rows);
    if(rows.length<page)break;
    if(out.length>100000)throw new Error('Слишком большой ответ '+table);
  }
  return out;
}
function getPayments(){try{return Array.isArray(allCashReceipts)?allCashReceipts:[]}catch(_){return Array.isArray(window.allCashReceipts)?window.allCashReceipts:[]}}
function setPayments(rows){try{allCashReceipts=rows}catch(_){}try{window.allCashReceipts=rows}catch(_){}}
function getDebt(){try{return Array.isArray(allClientDebt)?allClientDebt:[]}catch(_){return Array.isArray(window.allClientDebt)?window.allClientDebt:[]}}
function setDebt(rows){try{allClientDebt=rows}catch(_){}try{window.allClientDebt=rows}catch(_){}}
function getDebtComments(){try{return Array.isArray(allDebtComments)?allDebtComments:[]}catch(_){return Array.isArray(window.allDebtComments)?window.allDebtComments:[]}}
function setDebtComments(rows){try{allDebtComments=rows}catch(_){}try{window.allDebtComments=rows}catch(_){}}
function getImports(){try{return Array.isArray(allImportStatus)?allImportStatus:[]}catch(_){return Array.isArray(window.allImportStatus)?window.allImportStatus:[]}}
function setImports(rows){try{allImportStatus=rows}catch(_){}try{window.allImportStatus=rows}catch(_){}}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function importStatus(source){
  const rows=getImports().filter(r=>String(r?.source||r?.import_type||'').toLowerCase()===String(source).toLowerCase());
  return rows.sort((a,b)=>String(b?.updated_at||b?.last_attempt_at||b?.created_at||'').localeCompare(String(a?.updated_at||a?.last_attempt_at||a?.created_at||'')))[0]||null;
}
function pageRoot(page){return document.getElementById('page-'+page)||document.querySelector('.page.active');}
function statusBox(page){
  const root=pageRoot(page);if(!root)return null;
  let box=root.querySelector('.finance-root-status-v2349');
  if(!box){
    box=document.createElement('div');box.className='finance-root-status-v2349';
    const title=root.querySelector('.page-title');
    if(title)title.insertAdjacentElement('afterend',box);else root.prepend(box);
  }
  return box;
}
function paintStatus(page,state,source){
  const box=statusBox(page);if(!box)return;
  const st=importStatus(source);
  if(state.error){
    box.style.cssText='margin:0 0 12px;padding:10px 12px;border-radius:9px;background:#FEF2F2;border:1px solid #FECACA;color:#991B1B;font-size:12px;line-height:1.5';
    box.innerHTML='<b>⚠️ Свежие данные не удалось получить.</b> Показывается последний хороший срез, если он был.<br>'+esc(state.error)
      +(st?.error_text?'<br><b>Импорт 1С:</b> '+esc(st.error_text):'');
    return;
  }
  if(state.flight){
    box.style.cssText='margin:0 0 12px;padding:8px 11px;border-radius:9px;background:#EFF6FF;border:1px solid #BFDBFE;color:#1E3A8A;font-size:12px';
    box.textContent='⏳ Проверяю свежие данные 1С…';return;
  }
  if(st&&String(st.status||'').toLowerCase()==='error'){
    box.style.cssText='margin:0 0 12px;padding:10px 12px;border-radius:9px;background:#FEF2F2;border:1px solid #FECACA;color:#991B1B;font-size:12px;line-height:1.5';
    box.innerHTML='<b>⚠️ Последний импорт 1С завершился ошибкой.</b> Последний хороший срез не удалён.'+(st.error_text?'<br>'+esc(st.error_text):'');return;
  }
  box.remove();
}
function safeRender(page){
  try{
    if(page==='payments'&&typeof window.renderPayments==='function')window.renderPayments();
    else if(page==='debt'&&typeof window.renderDebt==='function')window.renderDebt();
  }catch(e){console.warn('Finance root render '+page,e);}
}
function markReady(resource){
  try{window.crmSingleRenderMarkResourceV227327?.(resource)}catch(_){}
  try{window.crmResponsiveMarkDirtyV227325?.(resource)}catch(_){}
}

async function refreshPayments(force=false){
  const st=S.payments;if(st.flight)return st.flight;
  const now=Date.now();if(!force&&st.lastTry&&now-st.lastTry<MIN_REFRESH_GAP_MS)return true;
  st.lastTry=now;st.error='';paintStatus('payments',st,'payments');
  const old=getPayments().slice(),oldImports=getImports().slice();
  st.flight=(async()=>{
    try{
      const [rows,imports]=await Promise.all([strictRows('cash_receipts_1c'),strictRows('crm_import_status')]);
      setPayments(rows);setImports(imports);st.loaded=true;st.lastOk=Date.now();st.error='';
      markReady('payments');markReady('imports');safeRender('payments');return true;
    }catch(e){
      if(old.length)setPayments(old);if(oldImports.length)setImports(oldImports);
      st.error=String(e?.message||e);st.loaded=true;console.warn('Finance payments refresh failed',e);safeRender('payments');return false;
    }finally{st.flight=null;paintStatus('payments',st,'payments');}
  })();
  paintStatus('payments',st,'payments');return st.flight;
}

async function refreshDebt(force=false){
  const st=S.debt;if(st.flight)return st.flight;
  const now=Date.now();if(!force&&st.lastTry&&now-st.lastTry<MIN_REFRESH_GAP_MS)return true;
  st.lastTry=now;st.error='';paintStatus('debt',st,'pdz');
  const old=getDebt().slice(),oldComments=getDebtComments().slice(),oldImports=getImports().slice();
  st.flight=(async()=>{
    try{
      const [rows,comments,imports]=await Promise.all([strictRows('client_debt'),strictRows('debt_comments'),strictRows('crm_import_status')]);
      setDebt(rows);setDebtComments(comments.sort((a,b)=>String(b?.created_at||'').localeCompare(String(a?.created_at||''))));setImports(imports);
      st.loaded=true;st.lastOk=Date.now();st.error='';
      try{if(typeof v2273FeatureState!=='undefined')v2273FeatureState.debt={loaded:true,promise:null}}catch(_){}
      markReady('debt');markReady('imports');safeRender('debt');return true;
    }catch(e){
      if(old.length)setDebt(old);if(oldComments.length)setDebtComments(oldComments);if(oldImports.length)setImports(oldImports);
      st.error=String(e?.message||e);st.loaded=true;console.warn('Finance debt refresh failed',e);safeRender('debt');return false;
    }finally{st.flight=null;paintStatus('debt',st,'pdz');}
  })();
  paintStatus('debt',st,'pdz');return st.flight;
}

window.crmPrefetchPaymentsV22734=function(){return refreshPayments(false)};
const baseEnsure=window.v2273EnsureFeature;
if(typeof baseEnsure==='function'&&!baseEnsure.__finance2349){
  const wrapped=async function(feature){
    if(feature==='debt')return await refreshDebt(false);
    return await baseEnsure.apply(this,arguments);
  };
  wrapped.__finance2349=true;window.v2273EnsureFeature=wrapped;
  try{v2273EnsureFeature=wrapped}catch(_){}
}

window.crmFinanceRefreshV2349=function(kind,force=true){
  return kind==='debt'||kind==='pdz'?refreshDebt(force):refreshPayments(force);
};

document.addEventListener('click',e=>{
  const btn=e.target?.closest?.('button');if(!btn||!/обновить/i.test(String(btn.textContent||'')))return;
  const p=activePage();
  if(p==='payments')setTimeout(()=>refreshPayments(true),0);
  else if(p==='debt')setTimeout(()=>refreshDebt(true),0);
},true);

function refreshActive(force=false){
  if(document.visibilityState==='hidden')return;
  const p=activePage();
  if(p==='payments')refreshPayments(force);
  else if(p==='debt')refreshDebt(force);
}
window.addEventListener('focus',()=>setTimeout(()=>refreshActive(false),100));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(()=>refreshActive(false),100)});
setInterval(()=>refreshActive(false),ACTIVE_REFRESH_MS);
setTimeout(()=>refreshActive(true),400);

window.RESANTA_FINANCE_DATA_ROOT_V2349=Object.freeze({
  version:V,
  paymentsFirstOpenFresh:true,
  debtFirstOpenFresh:true,
  singleFlight:true,
  keepLastGoodOnError:true,
  activePageAutoRefreshSeconds:ACTIVE_REFRESH_MS/1000,
  noFalseZeroOnLoadError:true,
  noSqlChanges:true,
  triovistUntouched:true,
  gpsUntouched:true,
  routesUntouched:true
});
})();
