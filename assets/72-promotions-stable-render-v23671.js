/* RESANTA CRM v23.6.105 · PROMOTIONS FINAL TRUTH
 * Final promotions guard loaded after the complete stack.
 * - keeps duplicate full-page paints suppressed;
 * - uses tolerant group/subgroup/SKU matching consistent with server snapshots;
 * - prevents completed/rejected rows leaking back into ordinary work filters;
 * - final DFS may explicitly approve a negative client budget after confirmation.
 * No polling. No MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_STABLE_RENDER_V23671)return;
const V='v23.6.105';
const base=window.renderPromotions;
if(typeof base!=='function')return;

let busy=false,pending=false,lastSig='',lastAt=0,lastResult;
const num=v=>Number(v)||0;
const safe=v=>String(v??'');
const norm=v=>safe(v).toLowerCase().replace(/ё/g,'е').replace(/[^0-9a-zа-я]+/g,'');
const money=v=>num(v).toLocaleString('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:2})+' BYN';
function maxStamp(rows){
  let m='';
  for(const r of rows||[]){
    const s=safe(r?.updated_at||r?.created_at||r?.source_message_at||r?.report_date||'');
    if(s>m)m=s;
  }
  return m;
}
function promoDigest(){
  try{
    return (allPromotions||[]).map(p=>[
      p?.id,p?.status,p?.updated_at,p?.start_date,p?.end_date,p?.budget_id,
      p?.confirmed_sales,p?.sales_plan,p?.manager_name,p?.client_id,p?.client_name
    ].map(safe).join('~')).sort().join('|');
  }catch(_){return''}
}
function filterSig(){
  const g=id=>safe(document.getElementById(id)?.value);
  return [
    g('promo-status-filter'),
    g('promo-manager-filter'),
    g('promo-search'),
    g('promo54-month'),
    safe(window.promoApprovalStageFilter||'all')
  ].join('|');
}
function salesStamp(){
  let st='';
  try{
    const x=typeof crmImportStatus==='function'?crmImportStatus('sales'):null;
    st=[x?.source_message_at,x?.report_date,x?.last_success_at].map(safe).join('|');
  }catch(_){}
  let h=0;try{h=(allPurchaseHistory||[]).length}catch(_){}
  return st+'|'+h;
}
function signature(){
  let budgets=[],moves=[];
  try{budgets=allPromotionBudgets||[]}catch(_){}
  try{moves=allPromotionBudgetMovements||[]}catch(_){}
  return [
    promoDigest(),
    budgets.length,maxStamp(budgets),
    moves.length,maxStamp(moves),
    salesStamp(),
    filterSig()
  ].join('§');
}
function hasRenderedDom(){
  return !!document.getElementById('promo-kpi')?.children?.length &&
         !!document.getElementById('promo-list');
}

/* ===== v23.6.105 · one sales-scope truth in browser ===== */
function scopeTokens(p){
  const f=p?.product_filters||{};
  return ['categories','subgroups','skus'].flatMap(k=>Array.isArray(f[k])?f[k]:[]).map(x=>safe(x).trim()).filter(Boolean);
}
function allToken(v){
  const s=safe(v).trim().toLowerCase().replace(/ё/g,'е');
  return ['все','всё','all','весь ассортимент','все товары','все sku','все группы','все подгруппы'].includes(s)||/^все\s/.test(s)||/^весь\s/.test(s);
}
function semanticPartMatch(n,cat,sub,prod){
  if(!n)return false;
  if(n.includes('электроинструмент')||n==='инструмент')return cat.includes('инструмент')||sub.includes('инструмент')||prod.includes('инструмент');
  if(n.includes('садов'))return cat.includes('садов')||sub.includes('садов')||prod.includes('садов');
  if(n.includes('свароч'))return cat.includes('свароч')||sub.includes('свароч')||prod.includes('свароч');
  if(n.includes('насос'))return cat.includes('насос')||sub.includes('насос')||prod.includes('насос');
  if(n.includes('пил'))return cat.includes('пил')||sub.includes('пил')||prod.includes('пил');
  if(n.includes('ушм'))return sub.includes('углошлиф')||prod.includes('ушм');
  return false;
}
function robustScopeMatch(r,p){
  const tokens=scopeTokens(p);if(!tokens.length)return true;
  const sku=safe(r?.sku).trim().toLowerCase(),cat=norm(r?.category),sub=norm(r?.subgroup),prod=norm(r?.product);
  for(const raw of tokens){
    if(allToken(raw))return true;
    const low=safe(raw).toLowerCase().replace(/ё/g,'е');
    const exact=(low.match(/([0-9]{2,3}\/[0-9]+\/[0-9]+)/)||[])[1];
    if(exact&&sku===exact)return true;
    const pref=(low.match(/([0-9]{2,3}(?:\/[0-9]+)?)\/\.\.\./)||[])[1];
    if(pref&&sku.startsWith(pref+'/'))return true;
    const parts=low.split(/\s+(?:и|или)\s+|[,;|·]+/).map(x=>x.trim()).filter(Boolean);
    for(const part of parts){
      const n=norm(part);if(n.length<3)continue;
      if((cat&&(cat.includes(n)||n.includes(cat)))||(sub&&(sub.includes(n)||n.includes(sub)))||(prod&&(prod.includes(n)||n.includes(prod))))return true;
      if(semanticPartMatch(n,cat,sub,prod))return true;
    }
  }
  return false;
}
function robustSalesForMonths(p,months){
  try{
    const set=new Set(months||[]),rows=typeof promoRowsForClient==='function'?promoRowsForClient(p):[];
    return (rows||[]).filter(r=>set.has(typeof promoMonthKey==='function'?promoMonthKey(r.month):safe(r.month).slice(0,7))&&robustScopeMatch(r,p)).reduce((s,r)=>s+num(r.revenue),0);
  }catch(_){return 0}
}
function robustAutoSales(p){
  try{return robustSalesForMonths(p,promoMonthKeys(p.start_date,p.end_date))}catch(_){return 0}
}
window.promoRowMatchesScope=robustScopeMatch;try{promoRowMatchesScope=robustScopeMatch}catch(_){}
window.promoSalesForMonths=robustSalesForMonths;try{promoSalesForMonths=robustSalesForMonths}catch(_){}
window.promoAutoSales=robustAutoSales;try{promoAutoSales=robustAutoSales}catch(_){}

/* ===== v23.6.105 · completed rows never leak into work/current filters ===== */
function promoIdFromCard(card){
  const el=card?.querySelector?.('[data-v2368-id]')||[...(card?.querySelectorAll?.('button')||[])].find(b=>/Открыть/i.test(safe(b.textContent)));
  const d=safe(el?.dataset?.v2368Id);if(d)return d;
  const m=safe(el?.getAttribute?.('onclick')).match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);return m?m[0]:'';
}
function closedRowGuard(){
  const list=document.getElementById('promo-list');if(!list)return;
  const sf=safe(document.getElementById('promo-status-filter')?.value||'current');
  if(sf==='all'||sf==='completed')return;
  let rows=[];try{rows=allPromotions||[]}catch(_){}
  const byId=new Map(rows.map(p=>[safe(p.id),p]));
  list.querySelectorAll('.promo-card').forEach(card=>{
    const p=byId.get(promoIdFromCard(card));if(!p)return;
    if(['completed','rejected'].includes(safe(p.status)))card.style.display='none';
  });
}

/* ===== v23.6.105 · final DFS over-budget decision wins over legacy wrappers ===== */
function promotion(id){try{return (allPromotions||[]).find(x=>safe(x.id)===safe(id))||null}catch(_){return null}}
async function budgetSnapshot(id){
  const {data,error}=await db.rpc('crm_promotion_budget_snapshot_v23630',{p_promotion_id:safe(id)});
  if(error)throw error;return data&&typeof data==='object'?data:null;
}
async function refreshPromotion(id){
  const {data,error}=await db.from('promotions').select('*').eq('id',id).single();
  if(error)throw error;
  try{allPromotions=allPromotions.map(x=>safe(x.id)===safe(id)?data:x)}catch(_){}
  return data;
}
function lockFinal(id,on){
  [...document.querySelectorAll('button')].forEach(b=>{
    const hit=(safe(b.dataset?.v2368Id)===safe(id)&&b.dataset?.v2368Action==='approve_dfs')||(safe(b.getAttribute('onclick')).includes(safe(id))&&safe(b.getAttribute('onclick')).includes('approve_dfs'));
    if(!hit)return;
    if(on){b.dataset.v236105Text=b.textContent;b.disabled=true;b.textContent='⏳ Проверяю бюджет…';}
    else{b.disabled=false;if(b.dataset.v236105Text)b.textContent=b.dataset.v236105Text;delete b.dataset.v236105Text;}
  });
}
function installFinalDecision(){
  const current=window.quickPromotionDecision;if(typeof current!=='function')return false;
  if(current.__promoFinalDecisionV236105)return true;
  const baseDecision=current;
  const wrapped=async function(id,action){
    if(action!=='approve_dfs')return baseDecision.apply(this,arguments);
    const p=promotion(id);if(!p)return;
    try{if(typeof promoCanFinalApprove==='function'&&!promoCanFinalApprove(p)){alert('Финальное согласование может выполнить только ДФС Александр Паюшин после согласования ДФ.');return;}}catch(_){}
    lockFinal(id,true);
    try{
      const s=await budgetSnapshot(id);
      if(!s?.has_budget){alert('У клиента '+(p.client_name||'—')+' бюджет не заведён. Согласовать за счёт другого клиента нельзя.');return;}
      const shortage=num(s.shortage);let allowOver=false;
      if(shortage>0){
        allowOver=confirm('Бюджет клиента '+(p.client_name||'—')+' будет превышен.\n\nСвободно: '+money(s.free)+'\nДля акции требуется: '+money(s.requested)+'\nПревышение: '+money(shortage)+'\nПосле согласования: '+money(s.after_approval)+'\n\nВсё равно финально согласовать?');
        if(!allowOver)return;
      }
      const comment=prompt('Комментарий ДФС к финальному согласованию (можно оставить пустым):')||'';
      const {data,error}=await db.rpc('crm_promotion_final_approve_v23631',{p_promotion_id:safe(id),p_comment:comment,p_allow_over_budget:allowOver});
      if(error)throw error;
      await refreshPromotion(id);
      try{renderPromotions()}catch(_){}
      try{openPromotionDetail(id)}catch(_){}
      return data;
    }catch(e){alert(e?.message||String(e));}
    finally{lockFinal(id,false);}
  };
  wrapped.__promoFinalDecisionV236105=true;
  wrapped.__promoBudgetTruthV23630=true;
  wrapped.__promoBudgetDfsOverrideV23631=true;
  wrapped.__base=baseDecision;
  window.quickPromotionDecision=wrapped;try{quickPromotionDecision=wrapped}catch(_){}
  return true;
}

function run(){
  const sig=signature();
  if(sig===lastSig&&hasRenderedDom()){setTimeout(closedRowGuard,0);return lastResult;}
  if(busy){pending=true;return lastResult}
  busy=true;
  try{
    lastResult=base.apply(this,arguments);
    lastSig=signature();
    lastAt=Date.now();
    setTimeout(closedRowGuard,10);setTimeout(closedRowGuard,120);
    return lastResult;
  }finally{
    busy=false;
    if(pending){
      pending=false;
      const next=signature();
      if(next!==lastSig){
        queueMicrotask(()=>{try{window.renderPromotions()}catch(e){console.warn(V+' coalesced render',e)}});
      }
    }
  }
}
run.__promotionsStableRenderV23671=true;
run.__base=base;
window.renderPromotions=run;try{renderPromotions=run}catch(_){}

installFinalDecision();setTimeout(installFinalDecision,50);setTimeout(installFinalDecision,350);setTimeout(installFinalDecision,1200);setTimeout(installFinalDecision,6500);
window.crmPromotionsRenderSignatureV23671=signature;
window.RESANTA_PROMOTIONS_STABLE_RENDER_V23671=Object.freeze({
  version:V,
  duplicateFullPaintsSuppressed:true,
  dataAware:true,
  filterAware:true,
  salesAware:true,
  tolerantScopeMatching:true,
  completedRowsGuarded:true,
  explicitOverBudgetApproval:true,
  coalescesReentrantCalls:true,
  noPolling:true,
  noMutationObserver:true
});
})();
