/* RESANTA CRM v23.6.131 · PROMOTIONS ROOT CLOSE FLOW
 * Promotions-only root fix:
 * - expense entry is performed directly inside close dialog
 * - old unlinked budget expenses can be explicitly linked to the promotion
 * - unused reserve is not presented as final until finance is confirmed
 * - manager report/photo problems are shown inline; leader comment resolves forced close
 * - expense ledger remains the financial source of truth
 * No polling. No MutationObserver. No changes outside Promotions.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_CLOSE_V23656)return;
const V='v23.6.213';
const financeConfirmed=new Set();
const ignoredByPromotion=new Map();
const discountCalcByPromotion=new Map();
const discountCalcFlight=new Map();
const num=v=>{try{return promoNum(v)}catch(_){const n=Number(v);return Number.isFinite(n)?n:0}};
const fmtSafe=v=>{try{return fmt(v)}catch(_){return num(v).toLocaleString('ru-RU',{maximumFractionDigits:2})}};
const escSafe=v=>{try{return esc(String(v??''))}catch(_){return String(v??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]))}};
const boss=()=>{try{return promoIsBoss()}catch(_){return currentProfile?.role==='boss'}};
const today=()=>{try{return String(TODAY||'').slice(0,10)}catch(_){return new Date().toISOString().slice(0,10)}};
function promotionById(id){return (allPromotions||[]).find(x=>String(x.id)===String(id))||null}
function currentPromotion(){return promotionById(document.getElementById('promotion-result-id')?.value)}
function budgetFor(p){if(!p)return null;const exact=(allPromotionBudgets||[]).find(b=>String(b.id)===String(p.budget_id||''));if(exact)return exact;const rows=(allPromotionBudgets||[]).filter(b=>String(b.client_id||'')===String(p.client_id||'')||String(b.client_name||'').trim().toLowerCase()===String(p.client_name||'').trim().toLowerCase());return rows.sort((a,b)=>(String(b.balance_as_of||'')+'|'+String(b.updated_at||'')).localeCompare(String(a.balance_as_of||'')+'|'+String(a.updated_at||'')))[0]||null}
function linkedExpenses(p){return (allPromotionBudgetMovements||[]).filter(x=>x.movement_type==='expense'&&String(x.promotion_id||'')===String(p?.id||''))}
function expenseTotal(p){return linkedExpenses(p).reduce((s,x)=>s+num(x.amount),0)}
function salesTruth(p){try{return window.RESANTA_PROMOTIONS_MANAGEMENT_V23654?.salesTruth?.(p)||null}catch(_){return null}}
function isPartial(p){try{return promoIsPartialDates(p)}catch(_){return false}}
function addDays(s,n){const d=new Date(String(s||'')+'T12:00:00');if(Number.isNaN(d.getTime()))return String(s||'');d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)}
function ignoredSet(p){const k=String(p?.id||'');if(!ignoredByPromotion.has(k))ignoredByPromotion.set(k,new Set());return ignoredByPromotion.get(k)}
function candidateUnlinked(p){const b=budgetFor(p);if(!b)return[];const min=addDays(p.start_date,-14),max=addDays(p.end_date,14),ignored=ignoredSet(p);return (allPromotionBudgetMovements||[]).filter(x=>x.movement_type==='expense'&&!x.promotion_id&&String(x.budget_id||'')===String(b.id)&&String(x.occurred_on||'')>=min&&String(x.occurred_on||'')<=max&&!ignored.has(String(x.id))).sort((a,b)=>String(a.occurred_on||'').localeCompare(String(b.occurred_on||''))).slice(0,8)}
function photoWarnings(p,report){const warnings=[];if(!report)warnings.push('нет итогового отчёта менеджера');try{const ph=promoPhotoProgress(p);if(ph?.missing?.length)warnings.push('не хватает фотографий: '+ph.missing.map(promoStageLabel).join(', '))}catch(_){}return warnings}
function manualExpenseTotal(p){return linkedExpenses(p).filter(x=>!['promotion_discount','promotion_discount_manual'].includes(String(x.source_type||''))&&!String(x.source_key||'').startsWith('promotion_discount:')).reduce((s,x)=>s+num(x.amount),0)}
function calcReasonText(x){const r=String(x?.reason||'');return r||'Автоматический расчёт скидки недоступен'}
function discountItemsHtml(x){
  const rows=Array.isArray(x?.items)?x.items:[];
  if(!rows.length)return'';
  return '<details class="promo56-discount-details"><summary>Расчёт скидки по SKU · '+rows.length+'</summary><div style="overflow:auto"><table><thead><tr><th>SKU</th><th>Кол-во</th><th>Цена до</th><th>Цена акции</th><th>Скидка/шт.</th><th>Стоимость скидки</th></tr></thead><tbody>'
    +rows.map(r=>'<tr><td><b>'+escSafe(r.sku||'—')+'</b></td><td>'+fmtSafe(r.sold_qty)+'</td><td>'+fmtSafe(r.base_price_vat)+'</td><td>'+fmtSafe(r.promo_price_vat)+'</td><td>'+fmtSafe(r.discount_per_unit)+'</td><td><b>'+fmtSafe(r.discount_cost)+' BYN</b></td></tr>').join('')
    +'</tbody></table></div></details>';
}
async function loadDiscountCalc(p,force=false){
  if(!p)return null;const key=String(p.id);
  if(!force&&discountCalcByPromotion.has(key))return discountCalcByPromotion.get(key);
  if(discountCalcFlight.has(key))return discountCalcFlight.get(key);
  const flight=(async()=>{
    const {data,error}=await db.rpc('crm_promotion_close_cost_v236213',{p_promotion_id:p.id});
    if(error)throw error;
    discountCalcByPromotion.set(key,data||{ok:false,reason:'Нет ответа расчёта'});
    return discountCalcByPromotion.get(key);
  })().catch(e=>{
    const x={ok:false,reason:e?.message||String(e)};discountCalcByPromotion.set(key,x);return x;
  }).finally(()=>{
    discountCalcFlight.delete(key);
    if(String(document.getElementById('promotion-result-id')?.value||'')===key)setTimeout(()=>patchModal(currentPromotion()||p),0);
  });
  discountCalcFlight.set(key,flight);return flight;
}
async function applyDiscountCost(p,calc,manualDiscount){
  const args={p_promotion_id:p.id,p_manual_discount:calc?.exact?null:manualDiscount};
  const {data,error}=await db.rpc('crm_promotion_apply_discount_cost_v236213',args);
  if(error)throw error;
  if(!data?.ok)throw new Error(data?.reason||'Не удалось зафиксировать стоимость скидки');
  const key='promotion_discount:'+String(p.id);
  if(data.movement){
    const mv=data.movement;
    const idx=(allPromotionBudgetMovements||[]).findIndex(x=>String(x.source_key||'')===key||String(x.id||'')===String(mv.id||''));
    if(idx>=0)allPromotionBudgetMovements[idx]=mv;else allPromotionBudgetMovements.unshift(mv);
  }else{
    allPromotionBudgetMovements=allPromotionBudgetMovements.filter(x=>String(x.source_key||'')!==key);
  }
  allPromotions=allPromotions.map(x=>String(x.id)===String(p.id)?{...x,actual_spend:num(data.total_actual_spend)}:x);
  return data;
}
function ensureCss(){if(document.getElementById('promo56-css'))return;const s=document.createElement('style');s.id='promo56-css';s.textContent=`
#modal-promotion-result #promo55-close-control,#modal-promotion-result #promo54-close-budget-note{display:none!important}
#modal-promotion-result .promo56-control{border:1px solid #fdba74;background:#fffaf3;border-radius:12px;padding:13px;margin:8px 0 14px}
.promo56-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:9px}.promo56-cell{background:#fff;border:1px solid #e5e7eb;border-radius:9px;padding:9px}.promo56-label{font-size:10px;color:var(--sub);text-transform:uppercase}.promo56-value{font-size:17px;font-weight:800;margin-top:3px}.promo56-sub{font-size:10px;color:var(--sub);line-height:1.35;margin-top:4px}.promo56-expense{display:grid;grid-template-columns:120px 145px minmax(220px,1fr) auto;gap:8px;align-items:end;margin-top:12px}.promo56-expense label{font-size:10px;color:var(--sub);display:block;margin-bottom:4px}.promo56-expense input{width:100%;height:38px;border:1px solid var(--border);border-radius:8px;padding:0 9px}.promo56-expense button,.promo56-actions button,.promo56-candidate button{height:38px;border:1px solid var(--border);background:#fff;border-radius:8px;padding:0 11px;font-weight:700;cursor:pointer}.promo56-expense button{background:#2563eb;color:#fff;border-color:#2563eb}.promo56-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.promo56-actions .ok{background:#f0fdf4;border-color:#86efac;color:#166534}.promo56-candidates{margin-top:11px;border-top:1px solid #fed7aa;padding-top:9px}.promo56-candidate{display:grid;grid-template-columns:90px 90px minmax(180px,1fr) auto auto;gap:7px;align-items:center;border-top:1px solid #f3f4f6;padding:7px 0;font-size:11px}.promo56-candidate .link{color:#166534;border-color:#86efac;background:#f0fdf4}.promo56-inline{display:none;margin-top:9px;padding:9px 10px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;color:#b42318;font-size:11px;font-weight:700;line-height:1.4}.promo56-warn{margin-top:9px;padding:8px 9px;border-radius:8px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:11px;line-height:1.4}
.promo56-total{border-color:#86efac!important;background:#f0fdf4!important}.promo56-total .promo56-value{color:#166534}.promo56-over{border-color:#fca5a5!important;background:#fef2f2!important}.promo56-over .promo56-value{color:#b42318}.promo56-discount-details{margin-top:10px;border-top:1px solid #fed7aa;padding-top:9px}.promo56-discount-details summary{cursor:pointer;font-size:11px;font-weight:800}.promo56-discount-details table{width:100%;border-collapse:collapse;margin-top:7px;background:#fff}.promo56-discount-details th,.promo56-discount-details td{padding:6px;border-bottom:1px solid #eee;text-align:left;font-size:10px;white-space:nowrap}.promo56-manual{margin-top:10px;padding:9px;border:1px solid #fde68a;background:#fffbeb;border-radius:9px}.promo56-manual label{display:block;font-size:10px;color:#92400e;margin-bottom:4px}.promo56-manual input{height:38px;width:180px;border:1px solid #f59e0b;border-radius:8px;padding:0 9px}
@media(max-width:760px){.promo56-grid{grid-template-columns:1fr}.promo56-expense{grid-template-columns:1fr}.promo56-candidate{grid-template-columns:1fr}.promo56-expense button,.promo56-actions button{width:100%}}
`;document.head.appendChild(s)}
function showInline(msg,focusId){const el=document.getElementById('promo56-inline');if(el){el.textContent=msg;el.style.display='block';el.scrollIntoView({behavior:'smooth',block:'center'})}if(focusId)setTimeout(()=>document.getElementById(focusId)?.focus(),50)}
function clearInline(){const el=document.getElementById('promo56-inline');if(el){el.textContent='';el.style.display='none'}}
function patchModal(p){
 if(!p||!boss())return;ensureCss();
 document.getElementById('promo55-close-control')?.remove();
 const old54=document.getElementById('promo54-close-budget-note');if(old54)old54.style.display='none';
 const legacySpend=document.getElementById('promotion-actual-spend-wrap');if(legacySpend)legacySpend.style.display='none';
 const closeBtn=document.getElementById('promotion-close-btn');if(!closeBtn)return;
 const footer=closeBtn.parentElement;let block=document.getElementById('promo56-close-control');
 if(!block){block=document.createElement('div');block.id='promo56-close-control';block.className='promo56-control';footer?.parentElement?.insertBefore(block,footer)}
 const calc=discountCalcByPromotion.get(String(p.id))||null;
 const loading=!calc&&discountCalcFlight.has(String(p.id));
 const reserved=num(p.budget_reserved),candidateRows=candidateUnlinked(p),confirmed=financeConfirmed.has(String(p.id)),t=salesTruth(p),sales=t?num(t.sales):num(p.confirmed_sales),report=String(document.getElementById('promotion-manager-report')?.value||'').trim(),warnings=photoWarnings(p,report),b=budgetFor(p);
 const otherSpend=calc?.ok?num(calc.other_spend):manualExpenseTotal(p);
 const discountExact=!!(calc?.ok&&calc.exact);
 const discountCost=discountExact?num(calc.discount_cost):num(calc?.existing_discount_movement);
 const projected=discountCost+otherSpend;
 const release=Math.max(0,reserved-projected),over=Math.max(0,projected-reserved);
 const legacy=document.getElementById('promotion-actual-spend');if(legacy)legacy.value=projected;
 const discountValue=loading?'Считаю…':(!calc?'Считаю…':(discountExact?fmtSafe(discountCost)+' BYN':'Нужно подтвердить'));
 const discountSub=loading?'Сверяю количество продаж 1С и цены SKU':(discountExact?('автоматически: '+fmtSafe(calc.sold_qty)+' шт. × разница цены до/по акции'):escSafe(calcReasonText(calc)));
 block.innerHTML='<b>Контроль перед закрытием</b><div class="promo56-grid">'
  +'<div class="promo56-cell"><div class="promo56-label">Факт продаж</div><div class="promo56-value">'+fmtSafe(sales)+' BYN</div><div class="promo56-sub">'+escSafe(t?.label||'по данным акции')+'</div></div>'
  +'<div class="promo56-cell"><div class="promo56-label">Согласованный резерв</div><div class="promo56-value">'+fmtSafe(reserved)+' BYN</div></div>'
  +'<div class="promo56-cell"><div class="promo56-label">Стоимость предоставленной скидки</div><div class="promo56-value">'+discountValue+'</div><div class="promo56-sub">'+discountSub+'</div></div>'
  +'<div class="promo56-cell"><div class="promo56-label">Дополнительные расходы</div><div class="promo56-value">'+fmtSafe(otherSpend)+' BYN</div><div class="promo56-sub">подарки, реклама, компенсации и другие привязанные расходы</div></div>'
  +'<div class="promo56-cell '+(over>0?'promo56-over':'promo56-total')+'"><div class="promo56-label">Итого к списанию</div><div class="promo56-value">'+(calc?.ok&&(discountExact||num(calc.existing_discount_movement)>=0)?fmtSafe(projected)+' BYN':'—')+'</div><div class="promo56-sub">скидка + дополнительные расходы</div></div>'
  +'<div class="promo56-cell '+(over>0?'promo56-over':'')+'"><div class="promo56-label">'+(over>0?'Перерасход сверх резерва':'Вернётся в свободный бюджет')+'</div><div class="promo56-value">'+fmtSafe(over>0?over:release)+' BYN</div><div class="promo56-sub">'+(over>0?'потребуется подтверждение руководителя':'неиспользованный остаток резерва')+'</div></div>'
  +'<div class="promo56-cell"><div class="promo56-label">Финансовая фиксация</div><div class="promo56-value" style="font-size:13px">'+(confirmed?'✅ Доп. расходы подтверждены':'Нужно подтвердить')+'</div></div></div>'
  +(!loading&&calc?.ok&&!discountExact?'<div class="promo56-manual"><label>Подтверждённая стоимость скидки, BYN</label><input id="promo56-manual-discount" inputmode="decimal" placeholder="0"><div class="promo56-sub">Автоматически по 1С посчитать нельзя: '+escSafe(calcReasonText(calc))+'. Введите сумму скидки после проверки.</div></div>':'')
  +(discountExact?discountItemsHtml(calc):'')
  +'<div class="promo56-expense"><div><label>Дополнительный расход, BYN</label><input id="promo56-expense-amount" inputmode="decimal" placeholder="0"></div><div><label>Дата расхода</label><input id="promo56-expense-date" type="date" value="'+today()+'"></div><div><label>За что</label><input id="promo56-expense-description" placeholder="Например: подарок, компенсация, выкладка"></div><button type="button" data-promo56-add-expense '+(!b?'disabled title="У клиента не найден бюджет"':'')+'>💸 Добавить расход</button></div>'
  +(candidateRows.length?'<div class="promo56-candidates"><b>Найдены старые расходы бюджета без привязки к акции</b><div class="promo56-sub">Проверьте их. Если расход относится к этой акции — привяжите. Если нет — отметьте «Не относится».</div>'+candidateRows.map(m=>'<div class="promo56-candidate"><span>'+escSafe(m.occurred_on||'—')+'</span><b>'+fmtSafe(m.amount)+' BYN</b><span>'+escSafe(m.description||'—')+'</span><button type="button" class="link" data-promo56-link="'+escSafe(m.id)+'">Привязать к акции</button><button type="button" data-promo56-ignore="'+escSafe(m.id)+'">Не относится</button></div>').join('')+'</div>':'')
  +'<div class="promo56-actions"><button type="button" data-promo56-confirm class="'+(confirmed?'ok':'')+'">'+(confirmed?'✅ Все дополнительные расходы указаны':'☑ Все дополнительные расходы указаны')+'</button></div>'
  +(warnings.length?'<div class="promo56-warn"><b>Для принудительного закрытия:</b> '+escSafe(warnings.join('; '))+'. Заполните «Комментарий руководителя», если закрываете без этих материалов.</div>':'')
  +'<div id="promo56-inline" class="promo56-inline"></div>'
  +'<div class="promo56-sub" style="margin-top:8px">CRM списывает стоимость скидки автоматически по фактически проданному количеству SKU и согласованным ценам акции. Дополнительные расходы учитываются отдельно. В бюджет возвращается только неиспользованный остаток резерва.</div>';
 if(isPartial(p)){const cs=document.getElementById('promotion-confirmed-sales');if(cs&&cs.value===''&&t?.exact)cs.value=num(t.sales)}
 closeBtn.textContent='🔒 Закрыть акцию';closeBtn.style.minWidth='170px';
 if(!calc&&!discountCalcFlight.has(String(p.id)))loadDiscountCalc(p,false);
}
async function addExpense(p){clearInline();const b=budgetFor(p);if(!b){showInline('У клиента не найден бюджет. Сначала внесите бюджет клиента.');return}const amount=num(document.getElementById('promo56-expense-amount')?.value),occurred=document.getElementById('promo56-expense-date')?.value||today(),description=String(document.getElementById('promo56-expense-description')?.value||'').trim();if(amount<=0){showInline('Укажите сумму расхода больше нуля.','promo56-expense-amount');return}if(!description){showInline('Укажите, за что был расход.','promo56-expense-description');return}const row={budget_id:b.id,client_id:b.client_id,manager_name:b.manager_name||p.manager_name||null,movement_type:'expense',amount,occurred_on:occurred,period_start:null,period_end:null,turnover_base:null,budget_percent:null,vat_rate:null,description,promotion_id:p.id,created_by:currentProfile?.name||null};const {data,error}=await db.from('promotion_budget_movements').insert(row).select().single();if(error){showInline('Не удалось сохранить расход: '+error.message);return}if(data)allPromotionBudgetMovements.unshift(data);try{await refreshPromotionSpend(p.id)}catch(_){}financeConfirmed.delete(String(p.id));discountCalcByPromotion.delete(String(p.id));await loadDiscountCalc(currentPromotion()||p,true)}
async function linkExpense(p,movementId){clearInline();const m=(allPromotionBudgetMovements||[]).find(x=>String(x.id)===String(movementId));if(!m||m.promotion_id)return;const {data,error}=await db.from('promotion_budget_movements').update({promotion_id:p.id}).eq('id',m.id).select().single();if(error){showInline('Не удалось привязать расход: '+error.message);return}allPromotionBudgetMovements=allPromotionBudgetMovements.map(x=>String(x.id)===String(m.id)?{...x,...(data||{promotion_id:p.id})}:x);try{await refreshPromotionSpend(p.id)}catch(_){}financeConfirmed.delete(String(p.id));discountCalcByPromotion.delete(String(p.id));await loadDiscountCalc(currentPromotion()||p,true)}
function ignoreExpense(p,movementId){ignoredSet(p).add(String(movementId));financeConfirmed.delete(String(p.id));patchModal(p)}
function confirmFinance(p){clearInline();const candidates=candidateUnlinked(p);if(candidates.length){showInline('Сначала разберите найденные непривязанные расходы: привяжите их к акции или отметьте «Не относится».');return}financeConfirmed.add(String(p.id));patchModal(p)}
const oldOpen=window.openPromotionResult||openPromotionResult;
const wrappedOpen=function(id){const out=oldOpen.apply(this,arguments);const p=promotionById(id);discountCalcByPromotion.delete(String(id));setTimeout(()=>patchModal(p),0);setTimeout(()=>patchModal(p),140);return out};window.openPromotionResult=wrappedOpen;try{openPromotionResult=wrappedOpen}catch(_){}
async function saveResult56(closeIt){
 const p=currentPromotion();if(!p)return;
 const isBoss=boss(),report=String(document.getElementById('promotion-manager-report')?.value||'').trim(),upd={manager_report:report||null};
 if(isBoss){const cs=document.getElementById('promotion-confirmed-sales')?.value??'';upd.confirmed_sales=cs===''?null:num(cs);upd.boss_comment=String(document.getElementById('promotion-boss-comment')?.value||'').trim()||null}
 if(closeIt){
   if(!isBoss){showInline('Закрыть акцию может руководитель. Менеджер сохраняет итоговый отчёт.');return}
   clearInline();
   const truth=salesTruth({...p,...upd});
   if(isPartial(p)&&upd.confirmed_sales==null){if(truth?.exact)upd.confirmed_sales=num(truth.sales);else{showInline('Для неполного периода нет точного снимка продаж. Укажите подтверждённые продажи по акции.','promotion-confirmed-sales');return}}
   const warnings=photoWarnings({...p,...upd},report);
   if(warnings.length&&!upd.boss_comment){showInline('Для принудительного закрытия заполните «Комментарий руководителя»: '+warnings.join('; ')+'.','promotion-boss-comment');return}
   if(candidateUnlinked(p).length){showInline('Есть непривязанные расходы бюджета. Сначала разберите их в блоке контроля.');return}
   if(!financeConfirmed.has(String(p.id))){showInline('Подтвердите, что все дополнительные расходы указаны.');return}

   const manualRaw=String(document.getElementById('promo56-manual-discount')?.value??'').trim();
   const calc=await loadDiscountCalc(p,true);
   if(!calc?.ok){showInline('Не удалось рассчитать стоимость скидки: '+calcReasonText(calc));return}
   let discountCost;
   if(calc.exact)discountCost=num(calc.discount_cost);
   else{
     if(manualRaw===''){showInline('Автоматически стоимость скидки не определяется. Введите подтверждённую стоимость скидки.','promo56-manual-discount');return}
     discountCost=num(manualRaw);
     if(discountCost<0){showInline('Стоимость скидки не может быть отрицательной.','promo56-manual-discount');return}
   }
   const additional=num(calc.other_spend),reserved=num(p.budget_reserved),projected=discountCost+additional,release=Math.max(0,reserved-projected),over=Math.max(0,projected-reserved);
   const sales=upd.confirmed_sales!=null?upd.confirmed_sales:num(truth?.sales);
   const msg='Закрыть акцию?\n\nФакт продаж: '+fmtSafe(sales)+' BYN'
     +'\nСтоимость скидки: '+fmtSafe(discountCost)+' BYN'
     +'\nДополнительные расходы: '+fmtSafe(additional)+' BYN'
     +'\nИТОГО К СПИСАНИЮ: '+fmtSafe(projected)+' BYN'
     +'\nСогласованный резерв: '+fmtSafe(reserved)+' BYN'
     +(over>0?'\nПЕРЕРАСХОД: +'+fmtSafe(over)+' BYN':'\nВернётся в свободный бюджет: '+fmtSafe(release)+' BYN')
     +'\n\nСтоимость скидки будет зафиксирована отдельным расходом один раз.';
   if(!confirm(msg))return;

   let applied;
   try{applied=await applyDiscountCost(p,calc,calc.exact?null:discountCost)}
   catch(e){showInline('Не удалось зафиксировать стоимость скидки: '+(e?.message||e));return}
   upd.actual_spend=num(applied.total_actual_spend);
   upd.status='completed';upd.closed_by=currentProfile?.name||null;upd.closed_at=new Date().toISOString();
 }
 const {error}=await db.from('promotions').update(upd).eq('id',p.id);
 if(error){showInline('Не удалось сохранить акцию: '+error.message);return}
 allPromotions=allPromotions.map(x=>String(x.id)===String(p.id)?{...x,...upd}:x);
 if(closeIt){financeConfirmed.delete(String(p.id));ignoredByPromotion.delete(String(p.id));discountCalcByPromotion.delete(String(p.id));try{await promoApprovalAudit(p,'close','boss_close',upd.boss_comment||'')}catch(_){}}
 closeModal('modal-promotion-result');try{openPromotionDetail(p.id)}catch(_){}renderPromotions();
}
window.savePromotionResult=saveResult56;try{savePromotionResult=saveResult56}catch(_){}
document.addEventListener('click',e=>{const add=e.target.closest('[data-promo56-add-expense]');if(add){e.preventDefault();const p=currentPromotion();if(p)addExpense(p);return}const link=e.target.closest('[data-promo56-link]');if(link){e.preventDefault();const p=currentPromotion();if(p)linkExpense(p,link.dataset.promo56Link);return}const ign=e.target.closest('[data-promo56-ignore]');if(ign){e.preventDefault();const p=currentPromotion();if(p)ignoreExpense(p,ign.dataset.promo56Ignore);return}const cf=e.target.closest('[data-promo56-confirm]');if(cf){e.preventDefault();const p=currentPromotion();if(p)confirmFinance(p);return}},true);
window.RESANTA_PROMOTIONS_CLOSE_V23656=Object.freeze({version:V,noPolling:true,noObserver:true,directExpense:true,linkLegacyExpense:true,financeConfirm:true,automaticDiscountCost:true,patchModal});
})();