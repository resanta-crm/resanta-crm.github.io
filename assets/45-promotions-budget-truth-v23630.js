/* RESANTA CRM v23.6.30 · PROMOTIONS BUDGET SINGLE TRUTH
 * Root fix:
 * - every promotion uses only the budget register of its own client;
 * - final DFS approval is atomic on the server;
 * - detail view shows the same server-calculated total/spent/reserved/free values;
 * - budgets of other clients are never treated as available for this promotion.
 * Performance: no polling, no MutationObserver, requests only when promotion detail/approval is used.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_BUDGET_TRUTH_V23630)return;
const VERSION='v23.6.30';
const cache=new Map();
const flights=new Map();
const CACHE_MS=15000;
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
const money=v=>num(v).toLocaleString('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:2})+' BYN';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
function promotions(){try{return Array.isArray(allPromotions)?allPromotions:[]}catch(_){return[]}}
function findPromotion(id){return promotions().find(x=>String(x.id)===String(id))||null;}
function clearSnapshot(id){cache.delete(String(id));}
async function snapshot(id,force=false){
  id=String(id||'');if(!id||typeof db==='undefined')return null;
  const c=cache.get(id);if(!force&&c&&Date.now()-c.at<CACHE_MS)return c.data;
  if(flights.has(id))return flights.get(id);
  const f=(async()=>{
    const {data,error}=await db.rpc('crm_promotion_budget_snapshot_v23630',{p_promotion_id:id});
    if(error)throw error;
    const out=(data&&typeof data==='object')?data:null;
    if(out)cache.set(id,{at:Date.now(),data:out});
    return out;
  })().finally(()=>flights.delete(id));
  flights.set(id,f);return f;
}
function budgetBox(){
  const host=document.getElementById('promo-v2368-decision');if(!host)return null;
  return [...host.querySelectorAll('.promo-v2368-box')].find(x=>/БЮДЖЕТ|ЧТО СТАНЕТ С БЮДЖЕТОМ/i.test(String(x.textContent||'')))||null;
}
function budgetHtml(s){
  if(!s)return '';
  const client=esc(s.client_name||'Клиент');
  if(!s.has_budget){
    return '<div class="promo-v2368-kicker">БЮДЖЕТ ИМЕННО ЭТОГО КЛИЕНТА</div>'
      +'<div class="promo-v2368-main">'+client+': бюджет не заведён</div>'
      +'<div class="promo-v2368-bad">Бюджеты других клиентов использовать нельзя.</div>'
      +'<div class="promo-v2368-note">Сначала руководитель должен внести фактический бюджет этого клиента.</div>';
  }
  const shortage=num(s.shortage),after=num(s.after_approval);
  return '<div class="promo-v2368-kicker">БЮДЖЕТ ИМЕННО ЭТОГО КЛИЕНТА</div>'
    +'<div class="promo-v2368-main">'+client+'</div>'
    +'<div class="promo-v2368-budget-grid">'
    +'<div><span>Всего</span><b>'+money(s.total)+'</b></div>'
    +'<div><span>Потрачено</span><b>'+money(s.spent)+'</b></div>'
    +'<div><span>Уже резерв</span><b>'+money(s.reserved)+'</b></div>'
    +'<div class="request"><span>Эта заявка</span><b>− '+money(s.requested)+'</b></div>'
    +'<div class="after"><span>После согласования</span><b>'+money(after)+'</b></div>'
    +'</div>'
    +(shortage>0?'<div class="promo-v2368-bad">⚠ Не хватает '+money(shortage)+'. Свободно сейчас '+money(s.free)+'.</div>'
      :'<div class="promo-v2368-good">✅ Свободно сейчас '+money(s.free)+'. После согласования останется '+money(after)+'.</div>')
    +'<div class="promo-v2368-note" style="margin-top:6px">Бюджет другого клиента не участвует в этом расчёте.</div>';
}
async function decorateDetail(id){
  try{
    const s=await snapshot(id,false);if(!s)return;
    const p=findPromotion(id);if(p&&s.budget_id&&!p.budget_id){p.budget_id=s.budget_id;}
    const box=budgetBox();if(box)box.innerHTML=budgetHtml(s);
    const safeId=window.CSS&&typeof CSS.escape==='function'?CSS.escape(String(id)):String(id).replace(/"/g,'\\"');
    const btn=document.querySelector('[data-v2368-action="approve_dfs"][data-v2368-id="'+safeId+'"]');
    if(btn){
      const blocked=!s.has_budget||num(s.shortage)>0;
      btn.dataset.budgetTruthBlocked=blocked?'1':'0';
      btn.title=blocked?(s.has_budget?'Недостаточно бюджета именно этого клиента':'У этого клиента бюджет не заведён'):'';
    }
  }catch(e){console.warn('Promotions budget '+VERSION+' detail',e);}
}
async function refreshPromotionLocal(id){
  try{
    const {data,error}=await db.from('promotions').select('*').eq('id',id).single();
    if(error)throw error;
    try{allPromotions=allPromotions.map(x=>String(x.id)===String(id)?data:x);}catch(_){}
    return data;
  }catch(e){console.warn('Promotions budget '+VERSION+' refresh promotion',e);return null;}
}
function lockApproveButtons(id,locked){
  const buttons=[...document.querySelectorAll('button')].filter(b=>{
    const d=b.dataset?.v2368Id;const oc=String(b.getAttribute('onclick')||'');
    return (String(d||'')===String(id)&&b.dataset?.v2368Action==='approve_dfs')||(oc.includes(String(id))&&oc.includes("'approve_dfs'"));
  });
  buttons.forEach(b=>{if(locked){b.dataset.oldDisabled=b.disabled?'1':'0';b.disabled=true;b.dataset.oldText=b.textContent;b.textContent='⏳ Проверяю бюджет…';}else{b.disabled=b.dataset.oldDisabled==='1';if(b.dataset.oldText)b.textContent=b.dataset.oldText;delete b.dataset.oldDisabled;delete b.dataset.oldText;}});
  return buttons;
}
function wrapDecision(){
  const base=window.quickPromotionDecision;
  if(typeof base!=='function')return false;
  if(base.__promoBudgetTruthV23630)return true;
  const wrapped=async function(id,action){
    if(action!=='approve_dfs')return base.apply(this,arguments);
    const p=findPromotion(id);if(!p)return;
    try{if(typeof promoCanFinalApprove==='function'&&!promoCanFinalApprove(p)){alert('Финальное согласование может выполнить только ДФС Александр Паюшин после согласования ДФ.');return;}}catch(_){}
    lockApproveButtons(id,true);
    try{
      const s=await snapshot(id,true);
      if(!s?.has_budget){alert('Нельзя согласовать: у клиента '+(p.client_name||'—')+' не заведён бюджет. Бюджет другого клиента использовать нельзя.');await decorateDetail(id);return;}
      if(num(s.shortage)>0){alert('Нельзя согласовать: бюджет клиента '+(p.client_name||'—')+' — свободно '+money(s.free)+', для акции требуется '+money(s.requested)+'. Не хватает '+money(s.shortage)+'.');await decorateDetail(id);return;}
      const comment=prompt('Комментарий ДФС к финальному согласованию (можно оставить пустым):')||'';
      const {data,error}=await db.rpc('crm_promotion_final_approve_v23630',{p_promotion_id:String(id),p_comment:comment});
      if(error)throw error;
      clearSnapshot(id);
      await refreshPromotionLocal(id);
      try{if(typeof renderPromotions==='function')renderPromotions();}catch(_){}
      try{if(typeof openPromotionDetail==='function')openPromotionDetail(id);}catch(_){}
      setTimeout(()=>decorateDetail(id),80);
      return data;
    }catch(e){
      alert(e?.message||String(e));
      clearSnapshot(id);setTimeout(()=>decorateDetail(id),50);
      return;
    }finally{lockApproveButtons(id,false);}
  };
  wrapped.__promoBudgetTruthV23630=true;wrapped.__base=base;
  window.quickPromotionDecision=wrapped;try{quickPromotionDecision=wrapped}catch(_){}
  return true;
}
function wrapOpen(){
  const base=window.openPromotionDetail;
  if(typeof base!=='function')return false;
  if(base.__promoBudgetTruthV23630)return true;
  const wrapped=function(id){const r=base.apply(this,arguments);setTimeout(()=>decorateDetail(id),90);setTimeout(()=>decorateDetail(id),260);return r;};
  wrapped.__promoBudgetTruthV23630=true;wrapped.__base=base;
  window.openPromotionDetail=wrapped;try{openPromotionDetail=wrapped}catch(_){}
  return true;
}
function css(){
  if(document.getElementById('promo-budget-truth-v23630-css'))return;
  const st=document.createElement('style');st.id='promo-budget-truth-v23630-css';st.textContent='.promo-v2368-good{color:#166534;font-weight:800;margin-top:6px}.promo-v2368-bad{color:#B91C1C;font-weight:800;margin-top:6px}';document.head.appendChild(st);
}
function install(){css();wrapDecision();wrapOpen();}
install();[250,700,1500,3000,6000].forEach(ms=>setTimeout(install,ms));
window.addEventListener('pageshow',()=>setTimeout(install,0));
window.RESANTA_PROMOTIONS_BUDGET_TRUTH_V23630=Object.freeze({version:VERSION,clientBudgetOnly:true,serverAtomicFinalApproval:true,autoLinkByClient:true,noCrossClientBudget:true,noPolling:true});
console.info('RESANTA promotions budget truth '+VERSION+' installed');
})();
