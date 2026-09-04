/* RESANTA CRM v23.6.61 · SALES FRESHNESS + LEGACY VIP MASTER + DYNAMIC TIERS */
(function(){
'use strict';
if(window.RESANTA_DATA_FRESHNESS_V23660)return;
const VERSION='v23.6.61';
const legacyVipMemberDefinitions=typeof window.vipMemberDefinitions==='function'?window.vipMemberDefinitions:null;
const legacyVipMatchedClient=typeof window.vipMatchedClient==='function'?window.vipMatchedClient:null;
let channel=null,salesFlight=null,triFlight=null,vipCache={sig:'',defs:[],month:''};

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
  vipCache={sig:'',defs:[],month:''};
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

/* ---------- VIP tiers: last fully closed month ---------- */
function clean(v){
  let s=String(v||'');
  try{s=s.normalize('NFKC');}catch(_){}
  return s.replace(/\uFFFD/g,'').replace(/[\u200B-\u200D\u2060\uFEFF]/g,'')
    .replace(/\u00A0/g,' ').replace(/[\u0000-\u001F\u007F-\u009F]/g,' ')
    .replace(/[‐-‒–—―]/g,'-').replace(/\s+/g,' ').trim();
}
function legalRoot(v){
  let s=clean(v).replace(/^\s*(?:тт|торговая\s+точка)\s*[,;:\-]?\s*/iu,'').trim();
  s=s.replace(/\s*[([{]\s*головн(?:ой|ая|ое)\s*[)\]}]\s*/giu,' ').replace(/\s+/g,' ').trim();
  s=s.replace(/\s*\([^)]*\)\s*$/u,'').trim();
  const m=s.match(/^(.+?\s(?:ООО|ОДО|УП|ЧУП|ЧТУП|ЧПУП|ЧТПУП|ИП|ОАО|ЗАО|УЧП|ЧП))(?=$|[\s,;(])/iu);
  if(m&&m[1])s=m[1].trim();
  else{
    const parts=s.split(',').map(x=>x.trim()).filter(Boolean);
    if(parts.length>1&&parts.slice(1).some(x=>/(?:Беларус|обл|район|р-н|^г\.?\s|ул\.?|улиц|просп|дом|д\.?\s*\d)/iu.test(x)))s=parts[0];
  }
  return s.replace(/\s+/g,' ').trim();
}
function key(v){
  const s=legalRoot(v);
  try{
    if(typeof normalizeClientName==='function')return normalizeClientName(s).replace(/ё/g,'е').replace(/[^a-zа-я0-9]/giu,'');
  }catch(_){}
  return s.toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]/giu,'');
}
function ym(v){const m=String(v||'').match(/^(\d{4})-(\d{2})/);return m?m[1]+'-'+m[2]:'';}
function currentYm(){let raw='';try{raw=(typeof TODAY!=='undefined'&&TODAY)?TODAY:'';}catch(_){}return String(raw||new Date().toISOString().slice(0,10)).slice(0,7);}
function lastClosedMonth(){
  const cur=currentYm();
  const months=[...new Set((allPurchaseHistory||[]).map(r=>ym(r.month)).filter(m=>m&&m<cur))].sort();
  return months[months.length-1]||'';
}
function preferredName(g){
  const rows=(g.clients||[]).slice().sort((a,b)=>{
    const at=/^\s*тт\b/iu.test(String(a.name||''))?1:0,bt=/^\s*тт\b/iu.test(String(b.name||''))?1:0;
    if(at!==bt)return at-bt;
    return String(a.name||'').length-String(b.name||'').length;
  });
  return legalRoot(rows[0]?.name||g.names?.[0]||g.root||'');
}
function buildVipDefs(){
  const month=lastClosedMonth(),hist=allPurchaseHistory||[],clients=allClients||[];
  let baseDefs=[];
  try{baseDefs=legacyVipMemberDefinitions?legacyVipMemberDefinitions():[];}catch(e){console.warn(VERSION+' legacy VIP master',e);baseDefs=[];}
  const salesStatus=(typeof crmImportStatus==='function'?crmImportStatus('sales'):null);
  const sig=[month,hist.length,clients.length,(allVipSales||[]).length,salesStatus?.source_message_at||''].join('|');
  if(vipCache.sig===sig)return vipCache.defs;
  if(!baseDefs.length){vipCache={sig,defs:[],month};return [];}

  // Источник состава VIP — только прежний утверждённый справочник vip_sales.
  // Новые обычные покупатели сюда автоматически не попадают.
  if(!month||!hist.length){
    const fallback=baseDefs.map(d=>({...d,vip_rank:null,vip_basis_month:month||'',vip_basis_revenue:0,vip_master_source:'vip_sales'}));
    vipCache={sig,defs:fallback,month};return fallback;
  }

  // Строим соответствия за один проход, чтобы не возвращать старый O(VIP × purchase_history).
  const defs=baseDefs.map((d,i)=>({...d,_rank_index:i,_rank_revenue:0}));
  const keyToDef=new Map();
  defs.forEach((d,i)=>{
    const names=[d.client_name,d.legal_name,...(Array.isArray(d.member_names)?d.member_names:[])].filter(Boolean);
    names.forEach(n=>{const k=key(n);if(k&&!keyToDef.has(k))keyToDef.set(k,i);});
  });

  const byClientId=new Map();
  clients.forEach(c=>{
    let idx=null;
    let vars=[c?.name||''];
    try{if(typeof clientNameVariants==='function')vars=clientNameVariants(c)||vars;}catch(_){}
    for(const v of vars){const k=key(v);if(k&&keyToDef.has(k)){idx=keyToDef.get(k);break;}}
    if(idx!=null&&c?.id!=null)byClientId.set(String(c.id),idx);
  });

  hist.forEach(r=>{
    if(ym(r.month)!==month)return;
    let idx=r.client_id!=null?byClientId.get(String(r.client_id)):null;
    if(idx==null){const k=key(r.client_name);if(k&&keyToDef.has(k))idx=keyToDef.get(k);}
    if(idx==null)return;
    defs[idx]._rank_revenue+=(Number(r.revenue)||0);
  });

  defs.sort((a,b)=>b._rank_revenue-a._rank_revenue||String(a.client_name||'').localeCompare(String(b.client_name||''),'ru'));
  const ranked=defs.map((d,i)=>{
    const department=i<10?'ВИП МПП':i<30?'ВИП ДФ':'ВИП ДФС';
    const out={...d,department,vip_rank:i+1,vip_basis_month:month,vip_basis_revenue:Math.round(d._rank_revenue*100)/100,vip_master_source:'vip_sales'};
    delete out._rank_index;delete out._rank_revenue;
    return out;
  });
  vipCache={sig,defs:ranked,month};return ranked;
}
function matchedVip(name){
  try{if(legacyVipMatchedClient)return legacyVipMatchedClient(name);}catch(_){}
  const k=key(name),def=buildVipDefs().find(d=>key(d.client_name)===k);
  const names=new Set((def?.member_names||[]).map(key).filter(Boolean));
  const candidates=(allClients||[]).filter(c=>key(c.name)===k||names.has(key(c.name)));
  if(!candidates.length)return null;
  return candidates.slice().sort((a,b)=>{
    const at=/^\s*тт\b/iu.test(String(a.name||''))?1:0,bt=/^\s*тт\b/iu.test(String(b.name||''))?1:0;
    if(at!==bt)return at-bt;
    return String(a.name||'').length-String(b.name||'').length;
  })[0];
}
function vipDefs(){return buildVipDefs();}
try{vipMemberDefinitions=vipDefs;}catch(_){}
window.vipMemberDefinitions=vipDefs;
try{vipMatchedClient=matchedVip;}catch(_){}
window.vipMatchedClient=matchedVip;

const baseVipRender=window.renderVip;
if(typeof baseVipRender==='function'){
  window.renderVip=function(){
    const out=baseVipRender.apply(this,arguments);
    try{
      const info=document.getElementById('vip-period-info'),month=vipCache.month||lastClosedMonth();
      if(info&&month&&!info.querySelector('.v23660-vip-tier-note')){
        const d=document.createElement('div');d.className='v23660-vip-tier-note';
        d.style.cssText='font-size:12px;color:var(--sub);margin-top:6px';
        let label=month;try{label=new Date(month+'-01T12:00:00').toLocaleDateString('ru-RU',{month:'long',year:'numeric'});}catch(_){}
        d.innerHTML='<b>Состав VIP:</b> прежний утверждённый список · <b>уровень по '+label+':</b> ТОП-10 = ВИП МПП · места 11–30 = ВИП ДФ · остальные = ВИП ДФС.';
        info.appendChild(d);
      }
    }catch(e){console.warn(VERSION+' vip note',e);}
    return out;
  };
  try{renderVip=window.renderVip;}catch(_){}
}

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
  version:VERSION,hourlySourceChecks:true,realtimeActivePageOnly:true,noPolling:true,dynamicVipTiers:true,
  vipTierRule:'top10_mpp_11to30_df_rest_dfs',vipBasis:'legacy_vip_master_last_closed_month',vipMaster:'vip_sales_legacy_only'
});
})();