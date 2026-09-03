/* RESANTA CRM v23.6.55 · PROMOTIONS CLOSE FLOW
 * Local fix for leader closing flow only.
 * - one-screen close control
 * - add expense directly from close dialog and return back automatically
 * - explicit "no more expenses" confirmation before releasing unused reserve
 * - keeps expense ledger as the only financial source of truth
 * No polling. No MutationObserver. No changes outside Promotions.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_CLOSE_V23655)return;
const V='v23.6.55';
const noMoreExpense=new Set();
let expenseReturn=null;
const num=v=>{try{return promoNum(v)}catch(_){const n=Number(v);return Number.isFinite(n)?n:0}};
const boss=()=>{try{return promoIsBoss()}catch(_){return currentProfile?.role==='boss'}};
const escSafe=v=>{try{return esc(String(v??''))}catch(_){return String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]))}};
const fmtSafe=v=>{try{return fmt(v)}catch(_){return num(v).toLocaleString('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:2})}};
function promotionById(id){return (allPromotions||[]).find(x=>String(x.id)===String(id))||null}
function currentPromotion(){return promotionById(document.getElementById('promotion-result-id')?.value)}
function expenseTotal(p){const rows=(allPromotionBudgetMovements||[]).filter(x=>x.movement_type==='expense'&&String(x.promotion_id||'')===String(p?.id||''));return rows.length?rows.reduce((s,x)=>s+num(x.amount),0):num(p?.actual_spend)}
function budgetFor(p){if(!p)return null;const exact=(allPromotionBudgets||[]).find(b=>String(b.id)===String(p.budget_id||''));if(exact)return exact;const rows=(allPromotionBudgets||[]).filter(b=>String(b.client_id||'')===String(p.client_id||'')||String(b.client_name||'').trim().toLowerCase()===String(p.client_name||'').trim().toLowerCase());return rows.sort((a,b)=>(String(b.balance_as_of||'')+'|'+String(b.updated_at||'')).localeCompare(String(a.balance_as_of||'')+'|'+String(a.updated_at||'')))[0]||null}
function salesTruth(p){try{return window.RESANTA_PROMOTIONS_MANAGEMENT_V23654?.salesTruth?.(p)||null}catch(_){return null}}
function isPartial(p){try{return promoIsPartialDates(p)}catch(_){return false}}
function ensureCss(){if(document.getElementById('promo55-css'))return;const s=document.createElement('style');s.id='promo55-css';s.textContent=`
#modal-promotion-result .promo55-control{border:1px solid #fecaca;background:#fff8f7;border-radius:12px;padding:12px;margin:4px 0 14px}.promo55-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}.promo55-cell{background:#fff;border:1px solid #eee;border-radius:9px;padding:9px}.promo55-label{font-size:10px;color:var(--sub);text-transform:uppercase}.promo55-value{font-size:16px;font-weight:700;margin-top:3px}.promo55-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.promo55-actions button{padding:8px 11px;border-radius:8px;border:1px solid var(--border);background:#fff;cursor:pointer;font-weight:600}.promo55-actions .ok{border-color:#86efac;background:#f0fdf4;color:#166534}.promo55-help{font-size:11px;color:var(--sub);line-height:1.45;margin-top:7px}.promo55-warn{font-size:11px;color:#9a3412;font-weight:600;margin-top:7px}@media(max-width:620px){.promo55-grid{grid-template-columns:1fr}.promo55-actions button{flex:1 1 100%}}
`;document.head.appendChild(s)}
function patchModal(p){if(!p||!boss())return;ensureCss();const modal=document.querySelector('#modal-promotion-result .modal'),closeBtn=document.getElementById('promotion-close-btn');if(!modal||!closeBtn)return;const footer=closeBtn.parentElement;const spent=expenseTotal(p),reserved=num(p.budget_reserved),release=Math.max(0,reserved-spent),t=salesTruth({...p,actual_spend:spent});const spendInput=document.getElementById('promotion-actual-spend');if(spendInput)spendInput.value=spent;let block=document.getElementById('promo55-close-control');if(!block){block=document.createElement('div');block.id='promo55-close-control';block.className='promo55-control';footer?.parentElement?.insertBefore(block,footer)}const old=document.getElementById('promo54-close-budget-note');if(old)old.style.display='none';const hasNoMore=noMoreExpense.has(String(p.id)),budget=budgetFor(p),sales=t?num(t.sales):num(p.confirmed_sales);block.innerHTML='<b>Контроль перед закрытием</b><div class="promo55-grid">'
 +'<div class="promo55-cell"><div class="promo55-label">План</div><div class="promo55-value">'+(num(p.sales_plan)>0?fmtSafe(p.sales_plan)+' BYN':'Без плана продаж')+'</div></div>'
 +'<div class="promo55-cell"><div class="promo55-label">Факт продаж</div><div class="promo55-value">'+fmtSafe(sales)+' BYN</div><div class="promo55-help">'+escSafe(t?.label||'по данным акции')+'</div></div>'
 +'<div class="promo55-cell"><div class="promo55-label">Резерв</div><div class="promo55-value">'+fmtSafe(reserved)+' BYN</div></div>'
 +'<div class="promo55-cell"><div class="promo55-label">Фактически потрачено</div><div class="promo55-value">'+fmtSafe(spent)+' BYN</div></div>'
 +'<div class="promo55-cell"><div class="promo55-label">Вернётся в свободный бюджет</div><div class="promo55-value">'+fmtSafe(release)+' BYN</div></div>'
 +'<div class="promo55-cell"><div class="promo55-label">Финансовая фиксация</div><div class="promo55-value" style="font-size:13px">'+(spent>0?'Расход внесён':hasNoMore?'Подтверждено: расходов больше нет':'Нужно подтвердить')+'</div></div></div>'
 +'<div class="promo55-actions"><button type="button" data-promo55-expense '+(!budget?'disabled title="У клиента не найден бюджет"':'')+'>💸 Внести расход</button><button type="button" data-promo55-no-more class="'+(hasNoMore?'ok':'')+'">'+(hasNoMore?'✅ Расходов больше не было':'Расходов больше не было')+'</button></div>'
 +'<div class="promo55-help">Расход вводится только через операцию бюджета и сразу попадает в фактические затраты акции. Потраченные деньги не возвращаются; при закрытии освобождается только неиспользованный резерв.</div>'
 +(spent>reserved&&reserved>0?'<div class="promo55-warn">⚠️ Фактический расход выше согласованного резерва на '+fmtSafe(spent-reserved)+' BYN.</div>':'');
 if(isPartial(p)){const cs=document.getElementById('promotion-confirmed-sales');if(cs&&cs.value===''&&t?.exact)cs.value=num(t.sales);}
 closeBtn.textContent='🔒 Закрыть акцию';
 closeBtn.style.minWidth='170px';
}
function openExpenseFor(p){const b=budgetFor(p);if(!b){alert('У клиента не найден бюджет. Сначала внесите бюджет клиента.');return}expenseReturn={promotionId:p.id};closeModal('modal-promotion-result');openBudgetMovement(b.id,'expense');setTimeout(()=>{const sel=document.getElementById('budget-movement-promotion');if(sel)sel.value=String(p.id);const d=document.getElementById('budget-movement-description');if(d&&!d.value)d.value='Расход по акции «'+String(p.title||'')+'»';const title=document.getElementById('budget-movement-title');if(title)title.textContent='Добавить расход по акции';},0)}
function markNoMore(p){if(!p)return;noMoreExpense.add(String(p.id));patchModal(p)}
const oldOpen=window.openPromotionResult||openPromotionResult;
const wrappedOpen=function(id){const out=oldOpen.apply(this,arguments);const p=promotionById(id);setTimeout(()=>patchModal(p),0);setTimeout(()=>patchModal(p),120);return out};
window.openPromotionResult=wrappedOpen;try{openPromotionResult=wrappedOpen}catch(_){}
const oldSaveBudget=window.saveBudgetMovement||saveBudgetMovement;
const wrappedSaveBudget=async function(){const ctx=expenseReturn?{...expenseReturn}:null;const out=await oldSaveBudget.apply(this,arguments);if(ctx){const movementModal=document.getElementById('modal-budget-movement');const saved=!movementModal?.classList.contains('open');if(saved){expenseReturn=null;try{closeModal('modal-budget-detail')}catch(_){}const p=promotionById(ctx.promotionId);if(p){noMoreExpense.delete(String(p.id));setTimeout(()=>openPromotionResult(p.id),0)}}}return out};
window.saveBudgetMovement=wrappedSaveBudget;try{saveBudgetMovement=wrappedSaveBudget}catch(_){}
const oldSaveResult=window.savePromotionResult||savePromotionResult;
const wrappedSaveResult=async function(closeIt){if(closeIt&&boss()){const p=currentPromotion();if(p){const spent=expenseTotal(p),reserved=num(p.budget_reserved);if(reserved>0&&spent<=0&&!noMoreExpense.has(String(p.id))){alert('Перед закрытием подтвердите финансовый итог: либо нажмите «💸 Внести расход», либо «Расходов больше не было». Это защищает бюджет от случайного возврата всего резерва.');return}const input=document.getElementById('promotion-actual-spend');if(input)input.value=spent;p.actual_spend=spent}}const id=currentPromotion()?.id;const out=await oldSaveResult.apply(this,arguments);if(closeIt&&id){const p=promotionById(id);if(p?.status==='completed')noMoreExpense.delete(String(id))}return out};
window.savePromotionResult=wrappedSaveResult;try{savePromotionResult=wrappedSaveResult}catch(_){}
document.addEventListener('click',e=>{const ex=e.target.closest('[data-promo55-expense]');if(ex){e.preventDefault();const p=currentPromotion();if(p)openExpenseFor(p);return}const nm=e.target.closest('[data-promo55-no-more]');if(nm){e.preventDefault();markNoMore(currentPromotion());return}},true);
window.RESANTA_PROMOTIONS_CLOSE_V23655=Object.freeze({version:V,noPolling:true,noObserver:true,oneScreenClose:true,expenseLedgerTruth:true,patchModal});
})();