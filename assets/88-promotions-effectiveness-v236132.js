/* RESANTA CRM v23.6.132 · PROMOTIONS SERVER EFFECTIVENESS
 * One lightweight server RPC instead of loading full purchase_history into browser.
 * New promotions: exact promotion_items SKU scope.
 * Legacy promotions: historical tolerant scope on server.
 * No polling. Refreshes only on Promotions render/open with a short cache.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_EFFECTIVENESS_V236132)return;
const V='v23.6.203',TTL=60000,S={rows:new Map(),loaded:false,flight:null,at:0};
const safe=v=>String(v??'');
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const money=v=>num(v).toLocaleString('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:2})+' BYN';
const esc=v=>safe(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function active(){return document.getElementById('page-promotions')?.classList.contains('active')}
function row(p){return S.rows.get(safe(p?.id))||null}
function promotion(id){try{return (allPromotions||[]).find(x=>safe(x.id)===safe(id))||null}catch(_){return null}}
function confirmed(p){return p?.confirmed_sales!==null&&p?.confirmed_sales!==undefined&&p?.confirmed_sales!==''}
function actualSales(p,e){return confirmed(p)?num(p.confirmed_sales):num(e?.current_sales_1c)}
function cardId(card){
  const d=card?.querySelector?.('[data-v2368-id]')?.dataset?.v2368Id;if(d)return safe(d);
  const b=[...(card?.querySelectorAll?.('button')||[])].find(x=>/Открыть/i.test(safe(x.textContent)));
  const m=safe(b?.getAttribute?.('onclick')).match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);return m?m[0]:'';
}
function deltaInfo(e,p){
  if(!e)return{html:'',tone:'muted',value:null};
  if(!e.baseline_comparable)return{html:'База: несопоставима с точным периодом — доп. оборот не считаем',tone:'muted',value:null};
  const d=e.incremental_sales==null?(actualSales(p,e)-num(e.baseline_sales)):num(e.incremental_sales);
  return{html:'Доп. оборот: '+(d>=0?'+':'')+money(d),tone:d<0?'bad':'good',value:d};
}
function qualityInfo(e){
  const q=safe(e?.data_quality),m=safe(e?.client_match_mode);
  if(q==='client_match_ambiguous')return{html:'🔴 Неоднозначное сопоставление клиента 1С',tone:'bad'};
  if(m==='name_unique_fallback'||m==='name_only')return{html:'🟠 Клиент сопоставлен по названию',tone:'warn'};
  if(q==='exact_closed_month')return{html:'✅ Точный закрытый месяц 1С',tone:'good'};
  if(q==='exact_snapshots')return{html:'✅ Точный период по снимкам 1С',tone:'good'};
  if(q==='snapshot_live')return{html:'🟢 Текущий период по снимкам 1С',tone:'good'};
  if(q==='live_month')return{html:'🟢 Текущий накопительный месяц 1С',tone:'good'};
  if(q==='future')return{html:'Акция ещё не началась',tone:'muted'};
  return{html:'🟡 Предварительно по календарному месяцу',tone:'warn'};
}
function financeInfo(e){
  if(!e)return{html:'Финансовая окупаемость: нет данных',tone:'muted'};
  if(e.required_margin_pct!=null)return{html:'Для окупаемости нужна маржа ≥ '+num(e.required_margin_pct).toFixed(1)+'%',tone:'warn'};
  if(e.baseline_comparable&&num(e.incremental_sales)<=0&&num(e.evaluation_cost)>0)return{html:'Затраты есть, доп. оборот не подтверждён',tone:'bad'};
  return{html:'ROI: нужна себестоимость / валовая прибыль',tone:'muted'};
}
function style(){if(document.getElementById('promo-eff-style-v236132'))return;const s=document.createElement('style');s.id='promo-eff-style-v236132';s.textContent=`
.promo-eff-v236132{margin-top:7px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;font-size:10px;color:var(--sub)}
.promo-eff-chip-v236132{border:1px solid var(--border);background:#fff;border-radius:999px;padding:4px 7px;white-space:nowrap}
.promo-eff-chip-v236132.good{color:var(--g);border-color:#bbf7d0;background:#f0fdf4}.promo-eff-chip-v236132.bad{color:var(--r);border-color:#fecaca;background:#fef2f2}.promo-eff-chip-v236132.warn{color:var(--am);border-color:#fde68a;background:#fffbeb}.promo-eff-chip-v236132.muted{color:var(--sub);background:#f8fafc}
.promo-eff-detail-v236132{margin-top:12px;border:1px solid #dbe7f3;background:#fbfdff;border-radius:11px;padding:11px}.promo-eff-detail-grid-v236132{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:8px}.promo-eff-detail-cell-v236132{background:#fff;border:1px solid var(--border);border-radius:8px;padding:8px}.promo-eff-detail-cell-v236132 small{display:block;color:var(--sub);font-size:9px;text-transform:uppercase}.promo-eff-detail-cell-v236132 b{display:block;margin-top:3px;font-size:13px}.promo-eff-table-v236132{width:100%;border-collapse:collapse;margin-top:9px;font-size:10px}.promo-eff-table-v236132 th,.promo-eff-table-v236132 td{padding:6px;border-top:1px solid var(--border);text-align:left;vertical-align:top}.promo-eff-note-v236132{font-size:10px;color:var(--sub);line-height:1.4;margin-top:7px}
@media(max-width:700px){.promo-eff-detail-grid-v236132{grid-template-columns:1fr}.promo-eff-table-v236132{font-size:9px}}
`;document.head.appendChild(s)}
function patchBridges(){
  try{
    const cur=window.promoAutoSales||promoAutoSales;
    if(typeof cur==='function'&&!cur.__serverEffV236132){const base=cur,fn=function(p){const e=row(p);return e?num(e.current_sales_1c):base.apply(this,arguments)};fn.__serverEffV236132=true;fn.__base=base;window.promoAutoSales=fn;try{promoAutoSales=fn}catch(_){}}
  }catch(_){}
  try{
    const cur=window.promoEffectiveSales||promoEffectiveSales;
    if(typeof cur==='function'&&!cur.__serverEffV236132){const base=cur,fn=function(p){const e=row(p);return e?actualSales(p,e):base.apply(this,arguments)};fn.__serverEffV236132=true;fn.__base=base;window.promoEffectiveSales=fn;try{promoEffectiveSales=fn}catch(_){}}
  }catch(_){}
  try{
    const cur=window.promoMetric||promoMetric;
    if(typeof cur==='function'&&!cur.__serverEffV236132){const base=cur,fn=function(p){const m=base.apply(this,arguments)||{},e=row(p);if(!e)return m;const sales=actualSales(p,e),plan=num(p?.sales_plan);return{...m,sales,plan,completion:plan>0?sales/plan*100:0}};fn.__serverEffV236132=true;fn.__base=base;window.promoMetric=fn;try{promoMetric=fn}catch(_){}}
  }catch(_){}
  try{
    const old=window.RESANTA_PROMOTIONS_MANAGEMENT_V23654;
    if(old&&!old.serverEffectivenessV236132){const baseTruth=old.salesTruth;const truth=function(p){const e=row(p);if(!e)return typeof baseTruth==='function'?baseTruth(p):null;if(confirmed(p))return{kind:'confirmed',sales:num(p.confirmed_sales),label:'подтверждено руководителем',exact:true};const exact=['exact_closed_month','exact_snapshots'].includes(safe(e.data_quality));return{kind:exact?'server_exact':'server_preliminary',sales:num(e.current_sales_1c),label:safe(e.sales_label),exact}};window.RESANTA_PROMOTIONS_MANAGEMENT_V23654=Object.freeze({...old,salesTruth:truth,serverEffectivenessV236132:true});}
  }catch(_){}
}
function patchCard(card,p,e){
  if(!card||!p||!e)return;
  const stats=[...card.querySelectorAll('.promo-grid .promo-stat')];
  if(stats[0]){
    const val=stats[0].querySelector('.promo-stat-value');if(val)val.textContent=money(actualSales(p,e));
    let sub=stats[0].querySelector('.promo54-truth');if(!sub){sub=document.createElement('div');sub.className='promo54-truth';stats[0].appendChild(sub)}
    const q=qualityInfo(e);sub.className='promo54-truth '+((q.tone==='good')?'promo54-exact':'promo54-prelim');sub.textContent=safe(e.sales_label)||q.html;
  }
  if(stats[1]&&num(p.sales_plan)<=0){
    const lab=stats[1].querySelector('.promo-stat-label'),val=stats[1].querySelector('.promo-stat-value'),prog=stats[1].querySelector('.promo-progress');
    if(lab)lab.textContent='План продаж';if(val)val.textContent='Не задан';if(prog)prog.style.display='none';
  }
  if(stats[2]){
    const lab=stats[2].querySelector('.promo-stat-label'),val=stats[2].querySelector('.promo-stat-value');
    if(lab)lab.textContent=e.baseline_comparable?'База: тот же период прошлого года':'База / прошлый год';
    if(val)val.textContent=money(e.baseline_sales);
    const old=[...stats[2].querySelectorAll('div')].filter(x=>x!==lab&&x!==val);
    old.forEach(x=>{if(x!==lab&&x!==val)x.style.display='none'});
    let note=stats[2].querySelector('.promo-eff-base-note-v236203');
    if(!note){note=document.createElement('div');note.className='promo-eff-base-note-v236203';note.style.cssText='font-size:10px;color:var(--sub);line-height:1.35;margin-top:4px';stats[2].appendChild(note)}
    note.style.display='block';note.textContent=e.baseline_comparable?'Сопоставимый полный календарный период.':'Справочная база: точного сопоставимого периода для этой акции нет.';
  }
  card.querySelector('.promo-eff-v236132')?.remove();
  const d=deltaInfo(e,p),q=qualityInfo(e),fin=financeInfo(e),box=document.createElement('div');box.className='promo-eff-v236132';
  box.innerHTML='<span class="promo-eff-chip-v236132">'+(e.scope_mode==='exact_sku'?'Точные SKU · '+num(e.item_count):'Исторический охват')+'</span>'
    +'<span class="promo-eff-chip-v236132 '+esc(q.tone)+'">'+esc(q.html)+'</span>'
    +'<span class="promo-eff-chip-v236132 '+esc(d.tone)+'">'+esc(d.html)+'</span>'
    +'<span class="promo-eff-chip-v236132 '+esc(fin.tone)+'">'+esc(fin.html)+'</span>';
  const ctrl=card.querySelector('.promo-control-v236125');if(ctrl)ctrl.insertAdjacentElement('afterend',box);else card.appendChild(box);
}
function patchCards(){
  const list=document.getElementById('promo-list');if(!list)return;
  list.querySelectorAll('.promo-card').forEach(card=>{const p=promotion(cardId(card)),e=row(p);if(p&&e)patchCard(card,p,e)});
  try{window.RESANTA_PROMOTIONS_CONTROL_V236125?.repaint?.()}catch(_){}
  // Control repaint rebuilds its block, so keep our compact efficiency strip after it.
  list.querySelectorAll('.promo-card').forEach(card=>{const p=promotion(cardId(card)),e=row(p);if(p&&e)patchCard(card,p,e)});
}
function detailHtml(p,e){
  const sales=actualSales(p,e),plan=num(p.sales_plan),completion=plan>0?sales/plan*100:null,d=deltaInfo(e,p),q=qualityInfo(e),fin=financeInfo(e),exact=e.scope_mode==='exact_sku';
  let h='<div class="promo-eff-detail-v236132" id="promo-eff-detail-v236132"><b>📈 Эффективность акции</b><div class="promo-eff-detail-grid-v236132">'
   +'<div class="promo-eff-detail-cell-v236132"><small>Оборот акции</small><b>'+money(sales)+'</b></div>'
   +'<div class="promo-eff-detail-cell-v236132"><small>База</small><b>'+money(e.baseline_sales)+'</b></div>'
   +'<div class="promo-eff-detail-cell-v236132"><small>Доп. оборот</small><b>'+(d.value==null?'Не считается':((d.value>=0?'+':'')+money(d.value)))+'</b></div>'
   +'<div class="promo-eff-detail-cell-v236132"><small>Расход / резерв</small><b>'+money(e.actual_spend)+' / '+money(e.reserved_budget)+'</b></div>'
   +'<div class="promo-eff-detail-cell-v236132"><small>План</small><b>'+(completion==null?'Не задан':completion.toFixed(1)+'%')+'</b></div>'
   +'<div class="promo-eff-detail-cell-v236132"><small>Охват</small><b>'+(exact?num(e.item_count)+' точных SKU':'Исторический')+'</b></div></div>'
   +'<div class="promo-eff-note-v236132"><b>'+esc(q.html)+'</b> · '+esc(e.sales_label)+'</div>'
   +'<div class="promo-eff-note-v236132"><b>'+esc(d.html)+'</b></div>'
   +'<div class="promo-eff-note-v236132"><b>'+esc(fin.html)+'</b></div>'
   +'<div class="promo-eff-note-v236132">'+esc(e.financial_note||'Для точного ROI нужна себестоимость или валовая прибыль.')+'</div>';
  const items=Array.isArray(e.items)?e.items:[];
  if(exact&&items.length){
    h+='<details style="margin-top:8px"><summary style="cursor:pointer;font-weight:700">SKU акции · '+items.length+'</summary><div style="overflow:auto"><table class="promo-eff-table-v236132"><thead><tr><th>SKU</th><th>Товар</th><th>Цена до</th><th>Скидка</th><th>Цена акции</th><th>Продажи календарного месяца</th></tr></thead><tbody>'
      +items.map(x=>'<tr><td><b>'+esc(x.sku)+'</b></td><td>'+esc(x.product_name||'—')+'</td><td>'+money(x.base_price_vat)+'</td><td>'+num(x.discount_pct).toLocaleString('ru-RU',{maximumFractionDigits:2})+'%</td><td>'+money(x.promo_price_vat)+'</td><td><b>'+money(x.current_sales_calendar_month)+'</b></td></tr>').join('')
      +'</tbody></table></div></details>';
  }else if(!exact){h+='<div class="promo-eff-note-v236132">Старая акция: товарный охват сохранён по историческим фильтрам. Новые акции считаются строго по выбранным SKU.</div>'}
  return h+'</div>';
}
function patchDetail(id){
  const p=promotion(id),e=row(p),root=document.getElementById('promotion-detail-body');if(!p||!e||!root)return;
  root.querySelector('#promo-eff-detail-v236132')?.remove();
  const tmp=document.createElement('div');tmp.innerHTML=detailHtml(p,e);const node=tmp.firstElementChild;
  const ctrl=root.querySelector('.promo-control-v236125');if(ctrl)ctrl.insertAdjacentElement('afterend',node);else root.prepend(node);
}
function patchAll(){if(!active())return;style();patchBridges();patchCards();try{if(typeof promotionDetailId!=='undefined'&&promotionDetailId)patchDetail(promotionDetailId)}catch(_){}}
async function load(force=false){
  if(!active())return null;
  if(!force&&S.loaded&&Date.now()-S.at<TTL){patchAll();return S.rows}
  if(S.flight)return S.flight;
  S.flight=(async()=>{const d=typeof db!=='undefined'?db:window.db;if(!d)return null;const {data,error}=await d.rpc('crm_promotions_effectiveness_v236203');if(error)throw error;S.rows.clear();(Array.isArray(data)?data:[]).forEach(x=>S.rows.set(safe(x.promotion_id),x));S.loaded=true;S.at=Date.now();patchAll();try{window.dispatchEvent(new CustomEvent('resanta:promotions-effectiveness',{detail:{version:V}}))}catch(_){}return S.rows})().catch(e=>console.warn(V+' effectiveness RPC',e)).finally(()=>{S.flight=null});
  return S.flight;
}
function installHooks(){
  style();patchBridges();
  const rr=window.renderPromotions;
  if(typeof rr==='function'&&!rr.__promoEffectivenessV236132){const base=rr,fn=function(){const out=base.apply(this,arguments);setTimeout(()=>{patchAll();load(false)},0);return out};fn.__promoEffectivenessV236132=true;fn.__base=base;window.renderPromotions=fn;try{renderPromotions=fn}catch(_){}}
  const od=window.openPromotionDetail;
  if(typeof od==='function'&&!od.__promoEffectivenessV236132){const base=od,fn=function(id){const out=base.apply(this,arguments);setTimeout(()=>{patchDetail(id);load(false)},0);return out};fn.__promoEffectivenessV236132=true;fn.__base=base;window.openPromotionDetail=fn;try{openPromotionDetail=fn}catch(_){}}
}
installHooks();[100,400,1000,2500].forEach(ms=>setTimeout(()=>{installHooks();if(active())load(false)},ms));
window.RESANTA_PROMOTIONS_EFFECTIVENESS_V236132=Object.freeze({version:V,server:true,exactNewSku:true,legacySafe:true,noPolling:true,ensure:()=>load(false),getRows:()=>S.rows,getRow:id=>S.rows.get(safe(id))||null,refresh:()=>load(true),repaint:patchAll});
})();
