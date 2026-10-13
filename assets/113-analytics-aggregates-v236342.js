/* RESANTA CRM v23.6.342 · SERVER AGGREGATES FOR ABC / FALLING
 * Keeps the existing UI/business logic, but replaces the 44k-row purchase_history
 * download on ABC and Falling pages with narrow server aggregates.
 */
(function(){
'use strict';
if(window.RESANTA_ANALYTICS_AGGREGATES_V236342)return;
const V='v23.6.342', TTL=60000;
const baseEnsure=window.v22722EnsureHistory;
const cache=new Map();

function active(){try{return typeof crmActivePage==='function'?crmActivePage():(document.getElementById('app')?.dataset?.activePage||'')}catch(_){return''}}
function keyName(v){try{return typeof canonicalSalesClientName==='function'?canonicalSalesClientName(v):String(v||'').toLowerCase().replace(/[^a-zа-я0-9]+/gi,'')}catch(_){return String(v||'').toLowerCase()}}
function legalKey(v){
  let s=String(v||'').replace(/^\s*(?:тт|торговая\s+точка)\s*[,;:\-]?\s*/iu,'').replace(/\s*\([^)]*\)\s*$/u,'').trim();
  try{if(typeof vipLegalName22715==='function')s=vipLegalName22715(s)||s}catch(_){}
  return keyName(s);
}
function invalidate(){
  try{if(typeof v2273ResetHistoryIndexes==='function')v2273ResetHistoryIndexes()}catch(_){}
  try{if(typeof v204InvalidateFallingCaches==='function')v204InvalidateFallingCaches()}catch(_){}
  try{_abcGlobalFirstSig='';_abcGlobalFirstMonth=null}catch(_){}
  try{Object.keys(_clientHistCache||{}).forEach(k=>delete _clientHistCache[k])}catch(_){}
}
function setRows(rows,label){
  allPurchaseHistory=Array.isArray(rows)?rows:[];
  invalidate();
  console.info(V,label,allPurchaseHistory.length);
  return allPurchaseHistory;
}
async function cached(k,loader,force=false){
  const hit=cache.get(k);
  if(!force&&hit&&Date.now()-hit.at<TTL)return hit.data;
  const data=await loader();
  cache.set(k,{data,at:Date.now()});
  return data;
}
function abcParams(){
  const mode=document.getElementById('abc-period')?.value||'90';
  const scope=document.getElementById('abc-scope')?.value||'branch';
  let manager=document.getElementById('abc-manager')?.value||'all';
  if(currentProfile?.role!=='boss')manager=currentProfile?.name||manager;
  const clientId=document.getElementById('abc-client-id')?.value||null;
  const cur=typeof abcPeriodMonths==='function'?abcPeriodMonths(mode,0):[];
  const prev=typeof abcPeriodMonths==='function'?abcPeriodMonths(mode,1):[];
  return{mode,scope,manager,clientId,cur,prev};
}
function abcSynthetic(data,p){
  const out=[];
  (data?.rows||[]).forEach((x,i)=>{
    const common={client_id:x.client_id||null,client_name:x.client_name||'',category:x.category||'',subgroup:x.subgroup||'',product:x.product||'',sku:x.sku||''};
    const cm=x.last_current_month||p.cur[p.cur.length-1]||'';
    const pm=x.last_previous_month||p.prev[p.prev.length-1]||'';
    if(Number(x.current_revenue)||Number(x.current_qty))out.push({...common,id:'abc:c:'+i,month:cm+'-01',revenue:Number(x.current_revenue)||0,qty:Number(x.current_qty)||0});
    if(Number(x.previous_revenue)||Number(x.previous_qty))out.push({...common,id:'abc:p:'+i,month:pm+'-01',revenue:Number(x.previous_revenue)||0,qty:Number(x.previous_qty)||0});
    if(x.first_month&&x.first_month!==cm&&x.first_month!==pm)out.push({...common,id:'abc:f:'+i,month:x.first_month+'-01',revenue:0,qty:0,_first_marker:true});
  });
  return out;
}
async function prepareAbc(force=false){
  const p=abcParams();
  if(p.scope==='client'&&!p.clientId)return setRows([],'ABC no client');
  const k='abc|'+[p.scope,p.manager,p.clientId||'',p.cur.join(','),p.prev.join(',')].join('|');
  const data=await cached(k,async()=>{
    const {data,error}=await db.rpc('crm_abc_slice_v236342',{
      p_scope:p.scope,
      p_manager:p.scope==='manager'&&p.manager!=='all'?p.manager:null,
      p_client_id:p.scope==='client'?p.clientId:null,
      p_current_months:p.cur,
      p_previous_months:p.prev
    });
    if(error)throw error;return data||{};
  },force);
  setRows(abcSynthetic(data,p),'ABC aggregate');
  return true;
}
function fallingPeriod(){
  try{return v20FallingPeriod()}catch(_){
    const m=String(TODAY||new Date().toISOString()).slice(0,7);
    return{current:[m],previous:[String(Number(m.slice(0,4))-1)+m.slice(4)],start:m,end:m};
  }
}
function crmClientForSummary(r){
  const id=String(r?.client_id||'');
  if(id){const c=(allClients||[]).find(x=>String(x.id)===id);if(c)return c;}
  const k=keyName(r?.client_name);
  if(!k)return null;
  const matches=(allClients||[]).filter(c=>{
    if(keyName(c.name)===k)return true;
    try{return clientNameVariants(c).some(n=>keyName(n)===k)}catch(_){return false}
  });
  return matches.length===1?matches[0]:null;
}
async function prepareFalling(force=false){
  const p=fallingPeriod(), pk=p.current.join(',')+'|'+p.previous.join(',');
  const summary=await cached('fall:summary|'+pk,async()=>{
    const {data,error}=await db.rpc('crm_falling_summary_v236342',{p_current_months:p.current,p_previous_months:p.previous});
    if(error)throw error;return data||{};
  },force);
  const totals=new Map();
  (summary.rows||[]).forEach(r=>{
    const c=crmClientForSummary(r),k=legalKey(c?.name||r.client_name);
    if(!k)return;
    const x=totals.get(k)||{cur:0,prev:0};
    x.cur+=Number(r.current_revenue)||0;x.prev+=Number(r.previous_revenue)||0;totals.set(k,x);
  });
  const declining=new Set([...totals].filter(([,x])=>x.prev>0&&x.cur<x.prev-0.005).map(([k])=>k));
  let clients=(allClients||[]).filter(c=>declining.has(legalKey(c.name)));
  const mgr=currentProfile?.role==='boss'?(document.getElementById('falling-manager')?.value||'all'):(currentProfile?.name||'');
  if(mgr&&mgr!=='all')clients=clients.filter(c=>c.manager_name===mgr);
  const ids=[...new Set(clients.map(c=>String(c.id||'')).filter(Boolean))];
  const names=[...new Set(clients.flatMap(c=>{try{return clientNameVariants(c)}catch(_){return[c.name]}}).filter(Boolean))];
  if(!ids.length&&!names.length){setRows([],'Falling aggregate empty');return true;}
  const dk='fall:detail|'+pk+'|'+ids.sort().join(',');
  const detail=await cached(dk,async()=>{
    const {data,error}=await db.rpc('crm_falling_detail_v236342',{
      p_current_months:p.current,p_previous_months:p.previous,p_client_ids:ids,p_client_names:names
    });
    if(error)throw error;return data||{};
  },force);
  setRows(detail.rows||[],'Falling aggregate');
  return true;
}
window.crmFastAnalyticsEnsure=async function(page,force=false){
  if(page==='abc')return prepareAbc(force);
  if(page==='falling')return prepareFalling(force);
  return false;
};
window.v22722EnsureHistory=async function(options={}){
  const page=active(),force=!!options.force;
  if(page==='abc'){await prepareAbc(force);return allPurchaseHistory;}
  if(page==='falling'){await prepareFalling(force);return allPurchaseHistory;}
  if(typeof baseEnsure==='function')return baseEnsure(options);
  return allPurchaseHistory||[];
};
window.crmFastAnalyticsInvalidateV236342=function(){cache.clear();};
window.RESANTA_ANALYTICS_AGGREGATES_V236342=Object.freeze({version:V,abcServerAggregate:true,fallingServerAggregate:true,noFullHistoryOnAbc:true,noFullHistoryOnFalling:true,cacheTtlMs:TTL});
})();