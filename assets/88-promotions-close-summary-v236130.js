/* RESANTA CRM v23.6.130 · PROMOTION CLOSE SUMMARY
 * Read-only closing dashboard.
 * New promotions with promotion_items use exact SKU scope from server RPC.
 * Legacy promotions keep their historical scope/metrics unchanged.
 * No writes. No polling. No MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_CLOSE_SUMMARY_V236130)return;
const V='v23.6.130';
const safe=v=>String(v??'');
const num=v=>Number(v)||0;
const esc=v=>safe(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>v===null||v===undefined||v===''?'—':num(v).toLocaleString('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:2})+' BYN';
const pct=v=>v===null||v===undefined||v===''?'—':num(v).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%';
const stageLabel=s=>({before:'До акции',start:'Старт',during:'В процессе',after:'После'})[s]||safe(s);

function style(){
  if(document.getElementById('promo-close-summary-style-v236130'))return;
  const s=document.createElement('style');s.id='promo-close-summary-style-v236130';s.textContent=`
#promo-close-summary-v236130{margin-bottom:14px}.pcs-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:9px}.pcs-title{font-size:13px;font-weight:800}.pcs-badge{font-size:10px;padding:3px 7px;border-radius:999px;background:var(--ab);color:var(--at);font-weight:700}.pcs-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.pcs-stat{border:1px solid var(--border);border-radius:9px;padding:9px;background:#fff;min-width:0}.pcs-l{font-size:9px;color:var(--sub);text-transform:uppercase;letter-spacing:.04em}.pcs-v{font-size:16px;font-weight:800;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pcs-sub{font-size:10px;color:var(--sub);margin-top:3px;line-height:1.3}.pcs-line{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}.pcs-pill{font-size:10px;padding:4px 7px;border-radius:7px;background:var(--bg);border:1px solid var(--border)}.pcs-warn{margin-top:9px;padding:8px 9px;border-radius:8px;background:var(--amb);color:var(--am);font-size:11px;line-height:1.4}.pcs-ok{background:var(--gb);color:var(--g)}.pcs-bad{background:var(--rb);color:var(--r)}.pcs-items{margin-top:9px;border-top:1px solid var(--border);padding-top:8px}.pcs-items summary{cursor:pointer;font-size:11px;font-weight:700;color:var(--at)}.pcs-table{width:100%;border-collapse:collapse;margin-top:7px}.pcs-table th,.pcs-table td{font-size:10px;padding:6px 5px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top}.pcs-table th{color:var(--sub);font-weight:600}.pcs-sku{font-weight:800;white-space:nowrap}.pcs-product{max-width:230px}.pcs-note{font-size:10px;color:var(--sub);line-height:1.4;margin-top:7px}
@media(max-width:700px){.pcs-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.pcs-v{font-size:14px}.pcs-table th:nth-child(2),.pcs-table td:nth-child(2){display:none}}
`;
  document.head.appendChild(s);
}
function promotion(id){try{return (allPromotions||[]).find(x=>safe(x.id)===safe(id))||null}catch(_){return null}}
function metric(p){try{return typeof promoMetric==='function'?promoMetric(p):null}catch(_){return null}}
function ensureHost(){
  const modal=document.getElementById('modal-promotion-result');if(!modal)return null;
  let h=document.getElementById('promo-close-summary-v236130');
  if(h)return h;
  const hidden=document.getElementById('promotion-result-id');if(!hidden)return null;
  h=document.createElement('div');h.id='promo-close-summary-v236130';h.className='card';h.style.padding='12px';
  hidden.insertAdjacentElement('afterend',h);
  return h;
}
function tuneForm(){
  const report=document.getElementById('promotion-manager-report');
  const field=report?.closest('.form-field');const label=field?.querySelector('.form-label');
  if(label)label.textContent='Короткий итог менеджера';
  if(report)report.placeholder='Что сделали; что сработало / не сработало; что рекомендуете дальше';
  if(field&&!field.querySelector('[data-v236130-help]')){
    const d=document.createElement('div');d.dataset.v236130Help='1';d.className='search-help';d.textContent='Коротко по факту: результат, причина отклонения от плана и следующий шаг. Без повторения цифр — они уже выше.';field.appendChild(d);
  }
  const b=document.getElementById('promotion-close-btn');if(b)b.textContent='Финально закрыть';
}
function legacySummary(p,s){
  const m=metric(p)||{};
  return {
    exact:false,
    fact:num(m.sales),plan:num(m.plan||p.sales_plan),completion:num(m.completion),base:num(m.base),delta:num(m.additional),elapsed:num(s?.elapsed_pct),pace:(num(m.completion)-num(s?.elapsed_pct)),items:[],fullMonth:!!s?.full_month_period,confirmed:p.confirmed_sales
  };
}
function exactSummary(p,s){
  const partial=!s?.full_month_period;
  const noConfirmed=partial&&(s?.confirmed_sales===null||s?.confirmed_sales===undefined||s?.confirmed_sales==='');
  const fact=noConfirmed?null:num(s?.sales_fact);
  const completion=fact===null||num(s?.sales_plan)<=0?null:fact/num(s.sales_plan)*100;
  return {exact:true,fact,auto:num(s?.auto_sales),plan:num(s?.sales_plan),completion,base:num(s?.previous_year_sales),delta:fact===null?null:fact-num(s?.previous_year_sales),elapsed:num(s?.elapsed_pct),pace:completion===null?null:completion-num(s?.elapsed_pct),items:Array.isArray(s?.items)?s.items:[],fullMonth:!!s?.full_month_period,confirmed:s?.confirmed_sales};
}
function stat(label,value,sub){return '<div class="pcs-stat"><div class="pcs-l">'+esc(label)+'</div><div class="pcs-v">'+value+'</div>'+(sub?'<div class="pcs-sub">'+sub+'</div>':'')+'</div>'}
function itemsHtml(rows){
  if(!rows?.length)return'';
  const body=rows.map(r=>'<tr><td class="pcs-sku">'+esc(r.sku||'—')+'</td><td class="pcs-product">'+esc(r.product_name||'—')+'</td><td>'+money(r.sales)+'</td><td>'+money(r.previous_year_sales)+'</td><td>'+(r.discount_pct===null||r.discount_pct===undefined?'—':pct(r.discount_pct))+'</td></tr>').join('');
  return '<details class="pcs-items"><summary>SKU акции · '+rows.length+' поз.</summary><div style="overflow:auto"><table class="pcs-table"><thead><tr><th>SKU</th><th>Товар</th><th>Продажи</th><th>Прошлый год</th><th>Скидка</th></tr></thead><tbody>'+body+'</tbody></table></div></details>';
}
function renderSummary(p,s){
  const h=ensureHost();if(!h)return;
  const q=s?.scope_mode==='exact_sku'?exactSummary(p,s):legacySummary(p,s);
  const photosMissing=Array.isArray(s?.missing_photo_stages)?s.missing_photo_stages:[];
  const photosReq=Array.isArray(s?.required_photo_stages)?s.required_photo_stages:[];
  const factText=q.fact===null?'Требует подтверждения':money(q.fact);
  const compText=q.completion===null?'—':pct(q.completion);
  const deltaText=q.delta===null?'—':(q.delta>=0?'+':'')+money(q.delta);
  const paceText=q.pace===null?'—':(q.pace>=0?'+':'')+num(q.pace).toLocaleString('ru-RU',{maximumFractionDigits:1})+' п.п.';
  const badge=q.exact?'Точные SKU':'Историческая акция';
  const photoClass=photosMissing.length?'pcs-pill pcs-bad':'pcs-pill pcs-ok';
  const photoText=photosReq.length?(photosMissing.length?'Фото: не хватает '+photosMissing.map(stageLabel).join(', '):'Фото: комплект полный'):'Фото не требуются';
  let warn='';
  if(q.exact&&!q.fullMonth&&q.confirmed===null){warn='<div class="pcs-warn">Период акции не равен полному календарному месяцу. 1С хранит продажи помесячно, поэтому точный факт за даты акции должен подтвердить руководитель в поле ниже. Автоматически по затронутым месяцам сейчас: <b>'+money(q.auto)+'</b>.</div>'}
  else if(q.exact&&!q.fullMonth){warn='<div class="pcs-warn">Для неполного периода итоговый факт взят из подтверждённой суммы руководителя. Сравнение с прошлым годом ниже остаётся помесячным — CRM не выдаёт ложную точность по дням.</div>'}
  else if(!q.exact){warn='<div class="pcs-warn">Это старая акция. Её товарный охват и исторические правила не переписываем. Для новых акций итог будет считаться строго по SKU, выбранным из Прайса МО2.</div>'}
  h.innerHTML='<div class="pcs-head"><div><div class="pcs-title">Итог акции</div><div class="pcs-note">Готовая картина перед отчётом и финальным закрытием</div></div><span class="pcs-badge">'+badge+'</span></div>'+
    '<div class="pcs-grid">'+
      stat('План',money(q.plan),'согласованный план продаж')+
      stat('Факт',factText,q.exact?'по товарам акции':'по историческому охвату')+
      stat('Выполнение',compText,'план = 100%')+
      stat('К прошлому году',deltaText,'база: '+money(q.base))+
    '</div>'+
    '<div class="pcs-line"><span class="pcs-pill">Прошло срока: '+pct(q.elapsed)+'</span><span class="pcs-pill">Темп: '+paceText+'</span><span class="'+photoClass+'">'+esc(photoText)+'</span></div>'+
    warn+itemsHtml(q.items)+
    '<div class="pcs-note">Расходы бюджета не используются как показатель эффективности акции. Они остаются отдельным учётом ниже.</div>';
}
async function loadSummary(id){
  const p=promotion(id),h=ensureHost();if(!p||!h)return;
  h.innerHTML='<div class="pcs-title">Итог акции</div><div class="pcs-note">Считаю результат…</div>';
  try{
    const {data,error}=await db.rpc('crm_promotion_close_summary_v1',{p_promotion_id:id});
    if(error)throw error;
    if(safe(document.getElementById('promotion-result-id')?.value)!==safe(id))return;
    renderSummary(p,data||{});
  }catch(e){
    console.warn(V,e);h.innerHTML='<div class="pcs-title">Итог акции</div><div class="pcs-warn">Не удалось получить итоговый расчёт. Старое закрытие не заблокировано: '+esc(e?.message||e)+'</div>';
  }
}
function install(){
  style();tuneForm();
  const cur=window.openPromotionResult;if(typeof cur!=='function'||cur.__promoCloseSummaryV236130)return;
  const base=cur;
  const wrapped=function(id){
    const out=base.apply(this,arguments);
    try{style();tuneForm();setTimeout(()=>loadSummary(id),0)}catch(e){console.warn(V,e)}
    return out;
  };
  wrapped.__promoCloseSummaryV236130=true;wrapped.__base=base;
  window.openPromotionResult=wrapped;try{openPromotionResult=wrapped}catch(_){}
}
install();setTimeout(install,50);setTimeout(install,350);
window.RESANTA_PROMOTIONS_CLOSE_SUMMARY_V236130=Object.freeze({version:V,readOnly:true,exactSkuForNew:true,legacyPreserved:true,noPolling:true,noMutationObserver:true});
})();
