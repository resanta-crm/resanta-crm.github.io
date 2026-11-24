/* RESANTA CRM v23.6.342 · SERVER AGGREGATES FOR ABC / FALLING
 * Keeps the existing UI/business logic, but replaces the 44k-row purchase_history
 * download on ABC and Falling pages with narrow server aggregates.
 */
(function(){
'use strict';
if(window.RESANTA_ANALYTICS_AGGREGATES_V236342)return;
const V='v23.6.342-abc360-20261109-speed3', TTL=90000, ABC_TTL=300000;
const baseEnsure=window.v22722EnsureHistory;
const cache=new Map(),pending=new Map(),abcCompiled=new Map();
let abcRequestVersion=0,lastAbcKey='',lastAbcRows=null;
let lastAbcScope=null;

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
  if(!force&&hit&&Date.now()-hit.at<(k.startsWith('abc|')?ABC_TTL:TTL))return hit.data;
  // Deduplicate overlapping filter/refresh requests to avoid a Postgres RPC storm.
  if(pending.has(k))return pending.get(k);
  const run=Promise.resolve().then(loader).then(data=>{
    cache.set(k,{data,at:Date.now()});
    return data;
  }).finally(()=>{if(pending.get(k)===run)pending.delete(k);});
  pending.set(k,run);
  return run;
}
function abcParams(){
  const mode=document.getElementById('abc-period')?.value||'90';
  const scope=document.getElementById('abc-scope')?.value||'branch';
  let manager=document.getElementById('abc-manager')?.value||'all';
  if(currentProfile?.role!=='boss')manager=currentProfile?.name||manager;
  const clientId=document.getElementById('abc-client-id')?.value||null;
  const cur=typeof abcPeriodMonths==='function'?abcPeriodMonths(mode,0):[];
  // Previous-period rows are used only for a selected client's lost-SKU advice.
  const prev=scope==='client'&&typeof abcPeriodMonths==='function'?abcPeriodMonths(mode,1):[];
  return{mode,scope,manager,clientId,cur,prev};
}
function abcAddressParent(card){
  const match=String(card?.name||'').match(/^(.+?)\s*\(([^()]*)\)\s*$/);
  if(!match||!card.city||!card.address)return '';
  return keyName(match[2])===keyName(card.city+' '+card.address)?match[1].trim():'';
}
function abcIdentity(selected,registry,detail){
  const members=detail?.members?.length?detail.members:[selected];
  const ids=new Set(members.map(card=>String(card.id)));
  const base=abcAddressParent(selected)||selected.name;
  if(!selected.entity_id&&!detail?.entity){
    const sameManager=registry.filter(card=>card.manager_name===selected.manager_name);
    const parents=sameManager.filter(card=>keyName(card.name)===keyName(base));
    if(parents.length===1&&!parents[0].entity_id){
      ids.add(String(parents[0].id));
      for(const card of sameManager){
        if(!card.entity_id&&keyName(abcAddressParent(card))===keyName(base))ids.add(String(card.id));
      }
    }
  }
  const candidates=new Map();
  const excluded=new Set();
  for(const card of [...allClients,...members,...registry]){
    const names=[card.name,...clientNameVariants(card)];
    for(const name of names){
      const key=keyName(name);
      if(!key)continue;
      if(ids.has(String(card.id))){
        if(!candidates.has(key))candidates.set(key,new Set());
        candidates.get(key).add(name);
      }
      else excluded.add(key);
    }
  }
  if(detail?.entity?.name&&!detail.partial_scope){
    const key=keyName(detail.entity.name);
    if(!candidates.has(key))candidates.set(key,new Set());
    candidates.get(key).add(detail.entity.name);
  }
  const keys=new Set([...candidates.keys()].filter(key=>key&&!excluded.has(key)));
  const names=[...keys].flatMap(key=>[...candidates.get(key)]);
  return {ids,keys,names,name:detail?.entity?.name||(ids.size>1?base:selected.name)};
}
async function abcClientIdentity(p,viewer,stamp,force){
  return cached('abc|identity|'+[viewer,stamp,p.clientId].join('|'),async()=>{
    const selected=allClients.find(card=>String(card.id)===String(p.clientId));
    if(!selected)throw new Error('Карточка клиента отсутствует в доступном списке');
    let registry=[];
    if(currentProfile?.role==='boss'){
      const {data,error}=await db.rpc('client360_catalog_v1',{p_query:(abcAddressParent(selected)||selected.name).slice(0,120)});
      if(error)throw error;
      registry=data?.clients||[];
    }
    const card=registry.find(row=>String(row.id)===String(selected.id))||selected;
    let detail;
    if(card.entity_id||!registry.some(row=>String(row.id)===String(selected.id))){
      const {data,error}=await db.rpc('crm_clients_detail_v1',{p_client_id:p.clientId,p_month:TODAY.slice(0,7)});
      if(error)throw error;
      if(!Array.isArray(data?.members))throw new Error('Не получен состав карточек клиента');
      detail=data;
    }
    return abcIdentity(card,registry,detail);
  },force);
}
async function abcClientRows(p,identity){
  const {data,error}=await db.rpc('crm_falling_detail_v236342',{
    p_current_months:p.cur,p_previous_months:p.prev,
    p_client_ids:[...identity.ids],p_client_names:identity.names
  });
  if(error)throw error;
  if(!Array.isArray(data?.rows))throw new Error('Не получены продажи клиента');
  return data.rows.filter(row=>row.client_id?identity.ids.has(String(row.client_id)):identity.keys.has(keyName(row.client_name)));
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
function abcMergeSlices(parts){
  const merged=new Map();
  for(const part of parts)for(const row of part?.rows||[]){
    const key=JSON.stringify([row.client_id||'',row.client_name||'',row.category||'',row.subgroup||'',row.product||'',row.sku||'']);
    let item=merged.get(key);
    if(!item){item={...row,current_revenue:0,current_qty:0,previous_revenue:0,previous_qty:0,last_current_month:null,last_previous_month:null};merged.set(key,item);}
    for(const name of ['current_revenue','current_qty','previous_revenue','previous_qty'])item[name]+=Number(row[name])||0;
    for(const name of ['last_current_month','last_previous_month'])if(row[name]&&(!item[name]||row[name]>item[name]))item[name]=row[name];
    if(row.first_month&&(!item.first_month||row.first_month<item.first_month))item.first_month=row.first_month;
  }
  return {ok:true,rows:[...merged.values()]};
}
async function abcSlice(p,cur,prev){
  const {data,error}=await db.rpc('crm_abc_slice_v20261109',{
    p_scope:p.scope,p_manager:p.scope==='manager'&&p.manager!=='all'?p.manager:null,
    p_client_id:p.scope==='client'?p.clientId:null,
    p_current_months:cur,p_previous_months:prev
  });
  if(error)throw error;
  if(data?.ok===false)throw new Error('Сервер не подтвердил расчёт ABC');
  return data||{rows:[]};
}
async function abcScopeData(p,viewer,stamp,force){
  const managerKey=p.scope==='branch'?'all':p.manager;
  const parts=[];
  for(let i=0;i<p.cur.length;i+=3){
    const cur=p.cur.slice(i,i+3),prev=p.prev.slice(i,i+3);
    const partKey='abc|slice|'+[viewer,stamp,p.scope,managerKey,p.clientId||'',cur.join(','),prev.join(',')].join('|');
    parts.push(await cached(partKey,()=>abcSlice(p,cur,prev),force));
  }
  return abcMergeSlices(parts);
}
function abcDatasetKey(p,viewer,stamp){
  const manager=p.scope==='branch'?'all':p.manager;
  return 'abc|'+[viewer,stamp,p.scope,manager,p.clientId||'',p.cur.join(','),p.prev.join(',')].join('|');
}
async function prepareAbc(force=false){
  const requestId=++abcRequestVersion,p=abcParams();
  const viewer=String(currentProfile?.id||currentProfile?.email||currentProfile?.name||'');
  let importStamp='';
  try{importStamp=String(crmImportStatus('sales')?.last_success_at||'')}catch(_){}
  const k=abcDatasetKey(p,viewer,importStamp);
  if(p.scope==='client'&&!p.clientId){
    if(lastAbcKey!=='abc:empty'||allPurchaseHistory!==lastAbcRows){
      lastAbcRows=[];lastAbcKey='abc:empty';lastAbcScope=null;setRows(lastAbcRows,'ABC no client');
    }
    return true;
  }
  // Reopening ABC or changing group/class/search never needs to rebuild history.
  if(!force&&k===lastAbcKey&&allPurchaseHistory===lastAbcRows)return true;
  const data=await cached(k,async()=>{
    if(p.scope!=='client')return abcScopeData(p,viewer,importStamp,force);
    const branch={...p,scope:'branch',clientId:null,prev:[]};
    const [customer,branchData]=await Promise.all([
      abcClientIdentity(p,viewer,importStamp,force).then(async identity=>({identity,rows:await abcClientRows(p,identity)})),
      abcScopeData(branch,viewer,importStamp,force)
    ]);
    return {
      identity:customer.identity,
      clientRows:customer.rows,
      branchRows:abcSynthetic(branchData,branch).map(row=>({...row,_abcBranchOnly:true}))
    };
  },force);
  const currentViewer=String(currentProfile?.id||currentProfile?.email||currentProfile?.name||'');
  if(requestId!==abcRequestVersion||active()!=='abc'||viewer!==currentViewer||abcDatasetKey(abcParams(),viewer,importStamp)!==k)return false;
  const prior=abcCompiled.get(k);
  const rows=!force&&prior&&prior.data===data?prior.rows:
    p.scope==='client'?[...data.clientRows,...data.branchRows]:abcSynthetic(data,p);
  if(!prior||prior.data!==data){
    abcCompiled.delete(k);abcCompiled.set(k,{data,rows});
    while(abcCompiled.size>8)abcCompiled.delete(abcCompiled.keys().next().value);
  }
  lastAbcKey=k;lastAbcRows=rows;lastAbcScope={scope:p.scope,clientId:p.clientId,identity:data.identity};
  if(allPurchaseHistory!==rows)setRows(rows,'ABC aggregate');
  return true;
}
window.crmFastAbcSnapshot=function(){
  if(allPurchaseHistory!==lastAbcRows||!window.crmFastAbcCurrentReady())return null;
  return lastAbcScope;
};
window.crmFastAbcCurrentReady=function(){
  const p=abcParams(),viewer=String(currentProfile?.id||currentProfile?.email||currentProfile?.name||'');
  let stamp='';try{stamp=String(crmImportStatus('sales')?.last_success_at||'')}catch(_){}
  const key=abcDatasetKey(p,viewer,stamp);
  return (p.scope==='client'&&!p.clientId)||key===lastAbcKey&&allPurchaseHistory===lastAbcRows;
};
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
window.crmFastAnalyticsInvalidateV236342=function(){cache.clear();pending.clear();abcCompiled.clear();lastAbcKey='';lastAbcRows=null;abcRequestVersion++;};
window.RESANTA_ANALYTICS_AGGREGATES_V236342=Object.freeze({version:V,abcServerAggregate:true,fallingServerAggregate:true,noFullHistoryOnAbc:true,noFullHistoryOnFalling:true,cacheTtlMs:TTL});
})();
