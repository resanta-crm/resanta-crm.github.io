/* RESANTA CRM v23.6.60 · SALES FRESHNESS + DYNAMIC VIP TIERS */
(function(){
'use strict';
if(window.RESANTA_DATA_FRESHNESS_V23660)return;
const VERSION='v23.6.60';
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
function currentYm(){return String(window.TODAY||new Date().toISOString().slice(0,10)).slice(0,7);}
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
  const salesStatus=(typeof crmImportStatus==='function'?crmImportStatus('sales'):null);
  const sig=[month,hist.length,clients.length,salesStatus?.source_message_at||''].join('|');
  if(vipCache.sig===sig)return vipCache.defs;
  if(!month||!hist.length){vipCache={sig,defs:[],month};return [];}

  const groups=new Map(),byClientId=new Map();
  function ensure(k,root){
    if(!groups.has(k))groups.set(k,{key:k,root:root||'',clients:[],names:[],revenue:0});
    return groups.get(k);
  }
  clients.forEach(c=>{
    const k=key(c.name);if(!k)return;
    const g=ensure(k,legalRoot(c.name));g.clients.push(c);if(c.name&&!g.names.includes(c.name))g.names.push(c.name);
    if(c.id!=null)byClientId.set(String(c.id),k);
  });
  hist.forEach(r=>{
    if(ym(r.month)!==month)return;
    let k=r.client_id!=null?byClientId.get(String(r.client_id)):null;
    if(!k)k=key(r.client_name);
    if(!k)return;
    const g=ensure(k,legalRoot(r.client_name));const rev=Number(r.revenue)||0;g.revenue+=rev;
    if(r.client_name&&!g.names.includes(r.client_name))g.names.push(r.client_name);
  });
  const ranked=[...groups.values()].filter(g=>g.revenue>0).sort((a,b)=>b.revenue-a.revenue||preferredName(a).localeCompare(preferredName(b),'ru'));
  const defs=ranked.map((g,i)=>{
    const department=i<10?'ВИП МПП':i<30?'ВИП ДФ':'ВИП ДФС';
    const name=preferredName(g);
    return{
      client_name:name,legal_name:name,holding_name:'',department,
      member_names:[...new Set((g.names||[]).concat((g.clients||[]).map(c=>c.name)).map(clean).filter(Boolean))],
      source_rows:[],vip_rank:i+1,vip_basis_month:month,vip_basis_revenue:Math.round(g.revenue*100)/100
    };
  });
  vipCache={sig,defs,month};return defs;
}
function matchedVip(name){
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
        d.innerHTML='<b>Уровень VIP:</b> '+label+' · ТОП-10 = ВИП МПП · места 11–30 = ВИП ДФ · остальные клиенты с продажами = ВИП ДФС.';
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
  vipTierRule:'top10_mpp_11to30_df_rest_dfs',vipBasis:'last_closed_month'
});
})();