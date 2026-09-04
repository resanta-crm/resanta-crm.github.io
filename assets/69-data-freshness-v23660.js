/* RESANTA CRM v23.6.62 · SALES FRESHNESS ONLY */
(function(){
'use strict';
if(window.RESANTA_DATA_FRESHNESS_V23660)return;
const VERSION='v23.6.62';
let channel=null,salesFlight=null,triFlight=null;

function page(){return document.getElementById('app')?.dataset?.activePage||'';}
function statusReplace(row){
  if(!row)return;
  try{
    allImportStatus=(allImportStatus||[]).filter(x=>String(x.source||'').toLowerCase()!==String(row.source||'').toLowerCase());
    allImportStatus.push(row);
  }catch(_){}
}
function renderSalesPage(p){
  try{
    if(p==='vip'&&typeof window.renderVip==='function')window.renderVip();
    else if(p==='falling'&&typeof window.renderFallingClients==='function')window.renderFallingClients();
    else if(p==='sales'&&typeof window.renderSales==='function')window.renderSales();
    else if(p==='abc'&&typeof window.renderABC==='function')window.renderABC();
    else if(p==='managers'&&typeof window.renderManagers==='function')window.renderManagers();
    else if(p==='promotions'&&typeof window.renderPromotions==='function')window.renderPromotions();
  }catch(e){console.warn(VERSION+' active sales render',e);}
}
async function onSales(row){
  statusReplace(row);
  try{v2273HistoryNeedsRefresh=true;}catch(_){}
  const p=page(),targets=new Set(['vip','falling','sales','abc','managers','promotions']);
  if(!targets.has(p)||typeof window.v22722EnsureHistory!=='function')return;
  if(salesFlight)return salesFlight;
  salesFlight=(async()=>{
    try{
      await window.v22722EnsureHistory({force:true,reason:'realtime-v23660'});
      if(page()===p)renderSalesPage(p);
    }catch(e){console.warn(VERSION+' sales realtime refresh',e);}
    finally{salesFlight=null;}
  })();
  return salesFlight;
}
async function onTriovist(row){
  statusReplace(row);
  try{window.TRIOVIST_DATA_HUB_V227315?.invalidate('sales');}catch(_){}
  if(page()!=='triovist'||typeof window.triovistReload!=='function')return;
  if(triFlight)return triFlight;
  triFlight=(async()=>{
    try{await window.triovistReload();}
    catch(e){console.warn(VERSION+' triovist realtime refresh',e);}
    finally{triFlight=null;}
  })();
  return triFlight;
}
function onImport(payload){
  const row=payload?.new||payload?.record||null;
  if(!row||String(row.status||'')!=='ok')return;
  const src=String(row.source||'').toLowerCase();
  if(src==='sales')onSales(row);
  else if(src==='triovist_sales')onTriovist(row);
}
function installRealtime(){
  const client=(typeof db!=='undefined'&&db&&typeof db.channel==='function')?db:null;
  if(channel||!client)return false;
  try{
    channel=client.channel('crm-import-status-v23660')
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'crm_import_status'},onImport)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'crm_import_status'},onImport)
      .subscribe();
    return true;
  }catch(e){channel=null;console.warn(VERSION+' realtime install',e);return false;}
}

/* VIP composition and VIP grouping are intentionally left to the stable v22.7.17/v22.7.14 logic in 04-business-analytics.js. */

/* Install after authenticated data load, without polling. */
const baseLoad=window.loadData;
if(typeof baseLoad==='function'){
  window.loadData=async function(){
    const out=await baseLoad.apply(this,arguments);
    installRealtime();
    return out;
  };
  try{loadData=window.loadData;}catch(_){}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{try{if(typeof currentProfile!=='undefined'&&currentProfile)installRealtime();}catch(_){}},{once:true});
else{try{if(typeof currentProfile!=='undefined'&&currentProfile)installRealtime();}catch(_){}}

window.RESANTA_DATA_FRESHNESS_V23660=Object.freeze({
  version:VERSION,hourlySourceChecks:true,realtimeActivePageOnly:true,noPolling:true,dynamicVipTiers:false,
  vipComposition:'stable_1c_vip_sales_departments',vipGrouping:'stable_v22_7_17'
});
})();