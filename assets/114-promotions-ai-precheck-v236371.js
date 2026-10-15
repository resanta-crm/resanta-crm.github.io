/* RESANTA CRM v23.6.371 · PROMOTIONS AI PRECHECK
 * Draft -> server forecast -> manager review -> submit.
 * Keeps newly created promotions visible and works responsively on tablet/mobile.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_AI_PRECHECK_V236371)return;
const V='v23.6.371';
const safe=v=>String(v??'');
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const esc=v=>safe(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>num(v).toLocaleString('ru-RU',{maximumFractionDigits:0})+' BYN';
function dbc(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
function promos(){try{return typeof allPromotions!=='undefined'?allPromotions:(window.allPromotions||[])}catch(_){return window.allPromotions||[]}}
function promotion(id){return promos().find(x=>safe(x.id)===safe(id))||null}
function profile(){try{return typeof currentProfile!=='undefined'?currentProfile:(window.currentProfile||{})}catch(_){return window.currentProfile||{}}}
function isManager(){return safe(profile()?.role).toLowerCase()==='manager'}
function setLocal(id,patch){
 try{allPromotions=allPromotions.map(x=>safe(x.id)===safe(id)?{...x,...patch}:x)}
 catch(_){window.allPromotions=(window.allPromotions||[]).map(x=>safe(x.id)===safe(id)?{...x,...patch}:x)}
}
function tone(v){return v==='green'?'good':v==='yellow'?'warn':v==='unknown'?'neutral':'bad'}
function salesText(v){return v==='green'?'Высокий шанс выполнения':v==='yellow'?'Есть риск':'Высокий риск невыполнения'}
function econText(v){return v==='green'?'Экономика выглядит приемлемо':v==='yellow'?'Экономика пограничная':v==='unknown'?'Недостаточно данных':'Экономика рискованная'}
function pct(v){return v==null||v===''?'—':num(v).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%'}
function assessmentHtml(a){
 if(!a)return '<div class="pai345-empty">ИИ-анализ пока не рассчитан.</div>';
 const reasons=Array.isArray(a.reasons)?a.reasons:[];
 const recs=Array.isArray(a.recommendations)?a.recommendations:[];
 return '<div class="pai345-head"><div><b>ИИ-прогноз перед согласованием</b><small>Расчёт на фактической истории 1С, выбранных SKU, плане, бюджете и механике акции</small></div><div class="pai345-score '+tone(a.sales_verdict)+'">'+esc(a.chance_pct)+'/100</div></div>'
  +'<div class="pai345-badges"><span class="'+tone(a.sales_verdict)+'">Продажи · '+esc(salesText(a.sales_verdict))+'</span><span class="'+tone(a.economics_verdict)+'">Экономика · '+esc(econText(a.economics_verdict))+'</span><span>Уверенность данных · '+esc(a.confidence_pct)+'/100</span></div>'
  +'<div class="pai345-grid">'
   +'<div><small>Расчётная база</small><b>'+money(a.baseline_sales)+'</b><em>'+esc(a.baseline_label||'История выбранных SKU')+'</em></div>'
   +'<div><small>Прогноз</small><b>'+money(a.predicted_sales)+'</b><em>'+money(a.predicted_low)+' — '+money(a.predicted_high)+'</em></div>'
   +'<div><small>План менеджера</small><b>'+money(a.sales_plan)+'</b><em>нужен рост '+pct(a.required_growth_pct)+'</em></div>'
   +'<div><small>Рекомендуемый ориентир</small><b>'+money(a.recommended_plan)+'</b></div>'
   +'<div><small>Бюджет</small><b>'+money(a.requested_budget)+'</b><em>'+pct(a.budget_pct_of_plan)+' от плана</em></div>'
   +'<div><small>Мин. доп. валовая маржа</small><b>'+pct(a.required_margin_pct)+'</b><em>для покрытия бюджета</em></div>'
  +'</div>'
  +(reasons.length?'<div class="pai345-section"><b>Почему такой прогноз</b><ul>'+reasons.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div>':'')
  +(recs.length?'<div class="pai345-section rec"><b>Что рекомендует ИИ</b><ul>'+recs.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div>':'')
  +'<div class="pai345-note">'+esc(a.financial_note||'')+'</div>';
}
function css(){
 if(document.getElementById('pai345-style'))return;
 const s=document.createElement('style');s.id='pai345-style';s.textContent=`
 .pai345-box{border:1px solid #cbd5e1;border-radius:12px;padding:12px;background:#fff;margin:10px 0}
 .pai345-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.pai345-head b{font-size:14px}.pai345-head small{display:block;color:var(--sub);font-size:10px;margin-top:3px;line-height:1.4}
 .pai345-score{min-width:64px;text-align:center;border-radius:10px;padding:8px 10px;font-size:18px;font-weight:900}.pai345-score.good,.pai345-badges .good{background:#dcfce7;color:#166534}.pai345-score.warn,.pai345-badges .warn{background:#fef3c7;color:#92400e}.pai345-score.neutral,.pai345-badges .neutral{background:#f1f5f9;color:#475569}.pai345-score.bad,.pai345-badges .bad{background:#fee2e2;color:#991b1b}
 .pai345-badges{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.pai345-badges span{background:#f1f5f9;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:800}
 .pai345-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.pai345-grid>div{border:1px solid #e2e8f0;border-radius:9px;padding:8px;min-width:0}.pai345-grid small,.pai345-grid em{display:block;color:var(--sub);font-size:9px;font-style:normal}.pai345-grid b{display:block;font-size:13px;margin:2px 0;overflow-wrap:anywhere}
 .pai345-section{margin-top:10px;font-size:11px;line-height:1.45}.pai345-section>b{font-size:11px}.pai345-section ul{margin:5px 0 0;padding-left:18px}.pai345-section li{margin:3px 0}.pai345-section.rec{border-left:3px solid var(--a);padding-left:9px}
 .pai345-note{margin-top:9px;font-size:9px;color:var(--sub);line-height:1.4}.pai345-empty{font-size:11px;color:var(--sub)}
 #pai345-modal{position:fixed;inset:0;z-index:10150;background:rgba(15,23,42,.48);display:none;align-items:center;justify-content:center;padding:14px}
 #pai345-modal.open{display:flex}.pai345-card{width:min(900px,96vw);max-height:94dvh;overflow:auto;background:#fff;border-radius:15px;box-shadow:0 24px 80px rgba(0,0,0,.28);padding:15px}
 .pai345-title{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.pai345-title h3{margin:0;font-size:17px}.pai345-title p{margin:4px 0 0;color:var(--sub);font-size:10px}.pai345-x{border:0;background:none;font-size:24px;cursor:pointer;min-width:44px;min-height:44px}
 .pai345-actions{position:sticky;bottom:-15px;background:#fff;border-top:1px solid #e5e7eb;margin:14px -15px -15px;padding:11px 15px;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}.pai345-actions button{min-height:44px}
 .pai345-detail{margin:10px 0}.pai345-detail-tools{display:flex;justify-content:flex-end;margin-top:8px}.pai345-detail-tools button{min-height:40px}
 @media(max-width:900px){
   #modal-promotion-edit .modal{width:min(96vw,780px)!important;max-height:94dvh!important;overflow:auto!important}
   #modal-promotion-edit .modal>div[style*="grid-template-columns"]{grid-template-columns:1fr!important}
   #modal-promotion-edit .form-input,#modal-promotion-edit select,#modal-promotion-edit textarea{font-size:16px!important;min-height:44px}
   #modal-promotion-edit button{min-height:44px}
   .pai345-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
 }
 @media(max-width:620px){
   #pai345-modal{padding:0}.pai345-card{width:100vw;max-height:100dvh;height:100dvh;border-radius:0;padding:12px}
   .pai345-grid{grid-template-columns:1fr}.pai345-head{align-items:center}.pai345-actions{bottom:-12px;margin:12px -12px -12px;padding:10px 12px}.pai345-actions button{flex:1 1 100%}
 }
 `;document.head.appendChild(s);
}
function modal(){
 let m=document.getElementById('pai345-modal');if(m)return m;
 m=document.createElement('div');m.id='pai345-modal';
 m.innerHTML='<div class="pai345-card"><div class="pai345-title"><div><h3>ИИ-анализ акции готов</h3><p data-pai345-sub></p></div><button class="pai345-x" type="button" data-pai345-close>×</button></div><div data-pai345-body></div><div class="pai345-actions"><button class="btn-secondary" type="button" data-pai345-edit>Изменить акцию</button><button class="btn-secondary" type="button" data-pai345-close>Оставить черновиком</button><button class="btn-primary" type="button" data-pai345-submit>Отправить на согласование</button></div></div>';
 document.body.appendChild(m);return m;
}
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
async function waitItemsReady(id){
 const d=dbc();if(!d)return false;
 const delays=[0,120,280,550,900];
 for(const ms of delays){
   if(ms)await wait(ms);
   const {data:p,error:pe}=await d.from('promotions').select('product_filters,updated_at').eq('id',id).maybeSingle();
   if(pe||!p)continue;
   const skus=Array.isArray(p?.product_filters?.skus)?p.product_filters.skus.map(x=>safe(x).trim()).filter(Boolean):[];
   if(!skus.length)return true;
   const {data:items,error:ie}=await d.from('promotion_items').select('sku,updated_at').eq('promotion_id',id);
   if(ie)continue;
   const bySku=new Map((items||[]).map(x=>[safe(x.sku).trim(),x]));
   const promoTs=Date.parse(p.updated_at||0)||0;
   const ready=skus.every(s=>{
     const row=bySku.get(s);if(!row)return false;
     const itemTs=Date.parse(row.updated_at||0)||0;
     return !promoTs||itemTs>=promoTs-1000;
   });
   if(ready)return true;
 }
 return false;
}
async function analyze(id){
 const d=dbc();if(!d)throw Error('Нет подключения к базе');
 await waitItemsReady(id);
 const {data,error}=await d.rpc('crm_promotion_ai_precheck_v236371',{p_promotion_id:id});
 if(error)throw error;
 setLocal(id,{ai_precheck:data,ai_precheck_at:new Date().toISOString(),ai_precheck_version:'v23.6.371'});
 return data;
}
function openResult(id,a){
 css();const m=modal(),p=promotion(id);m.dataset.promotionId=safe(id);
 m.querySelector('[data-pai345-sub]').textContent=safe(p?.client_name||'')+' · '+safe(p?.title||'');
 m.querySelector('[data-pai345-body]').innerHTML='<div class="pai345-box">'+assessmentHtml(a)+'</div>';
 const submit=m.querySelector('[data-pai345-submit]');
 submit.style.display=isManager()&&safe(p?.status)==='draft_manager'?'':'none';
 if(submit.style.display!=='none')submit.textContent=a?.sales_verdict==='red'?'Всё равно отправить на согласование':'Отправить на согласование';
 m.classList.add('open');
}
function closeResult(){document.getElementById('pai345-modal')?.classList.remove('open')}
function switchView(v){try{window.RESANTA_PROMOTIONS_CONTROL_CENTER_V236203?.setView?.(v,{scroll:true})}catch(_){}}
async function makeDraft(id){
 const patch={status:'draft_manager',manager_submitted_by:null,manager_submitted_at:null,df_approved_by:null,df_approved_at:null,df_comment:null,dfs_approved_by:null,dfs_approved_at:null,dfs_comment:null,approved_by:null,approved_at:null,budget_reserved:0};
 const {error}=await dbc().from('promotions').update(patch).eq('id',id);if(error)throw error;setLocal(id,patch);
}
async function submit(id){
 const fn=window.quickPromotionDecision||(()=>null);await fn(id,'submit_manager');
 if(safe(promotion(id)?.status)==='pending_df'){closeResult();switchView('pending')}
}
function bind(){
 document.addEventListener('click',async e=>{
   if(e.target.closest?.('[data-pai345-close]')){closeResult();return}
   if(e.target.closest?.('[data-pai345-edit]')){const id=modal().dataset.promotionId;closeResult();try{openPromotionEditor(id)}catch(_){}return}
   if(e.target.closest?.('[data-pai345-submit]')){const b=e.target.closest('[data-pai345-submit]'),id=modal().dataset.promotionId;b.disabled=true;b.textContent='Отправляю…';try{await submit(id)}finally{b.disabled=false;b.textContent='Отправить на согласование'}return}
   const r=e.target.closest?.('[data-pai345-recalc]');if(r){const id=r.dataset.pai345Recalc;r.disabled=true;r.textContent='Считаю…';try{const a=await analyze(id);decorateDetail(id,a)}catch(err){alert('Не удалось пересчитать ИИ-анализ: '+safe(err?.message||err))}finally{r.disabled=false;r.textContent='Пересчитать ИИ'}return}
 },true);
}
function decorateDetail(id,a){
 const root=document.getElementById('promotion-detail-body');if(!root)return;
 root.querySelector('.pai345-detail')?.remove();
 const p=promotion(id),data=a||p?.ai_precheck;
 const box=document.createElement('div');box.className='pai345-detail';
 box.innerHTML='<div class="pai345-box">'+assessmentHtml(data)+'<div class="pai345-detail-tools"><button type="button" class="btn-secondary" data-pai345-recalc="'+esc(id)+'">Пересчитать ИИ</button></div></div>';
 root.prepend(box);
}
function patchDetail(){
 const f=window.openPromotionDetail;if(typeof f!=='function'||f.__pai345)return;
 const base=f,fn=function(id){const r=base.apply(this,arguments);setTimeout(()=>decorateDetail(id),60);return r};fn.__pai345=true;fn.__base=base;window.openPromotionDetail=fn;try{openPromotionDetail=fn}catch(_){}
}
function patchSave(){
 const f=window.savePromotion;if(typeof f!=='function'||f.__pai345)return false;
 const base=f,fn=async function(){
   const idBefore=safe(document.getElementById('promotion-id')?.value),old=idBefore?promotion(idBefore):null;
   const before=new Set(promos().map(x=>safe(x.id)));
   const managerDraft=isManager()&&(!idBefore||safe(old?.status)==='draft_manager');
   const r=await base.apply(this,arguments);
   if(document.getElementById('modal-promotion-edit')?.classList.contains('open'))return r;
   let id=idBefore;if(!id){const n=promos().find(x=>!before.has(safe(x.id)));id=safe(n?.id)}
   if(!id)return r;
   try{
     if(managerDraft)await makeDraft(id);
     const a=await analyze(id);
     if(managerDraft)switchView('decision');
     openResult(id,a);
   }catch(err){
     console.error(V,err);
     if(managerDraft){switchView('decision');alert('Акция сохранена как черновик, но ИИ-анализ не рассчитался: '+safe(err?.message||err));}
   }
   return r;
 };
 fn.__pai345=true;fn.__base=base;window.savePromotion=fn;try{savePromotion=fn}catch(_){};return true;
}
function polishEditor(){
 const b=document.getElementById('promotion-save-btn'),id=safe(document.getElementById('promotion-id')?.value),p=id?promotion(id):null;
 if(b&&isManager()&&(!id||safe(p?.status)==='draft_manager'))b.textContent='Сохранить и проверить ИИ';
}
function patchEditor(){
 const f=window.openPromotionEditor;if(typeof f!=='function'||f.__pai345)return;
 const base=f,fn=function(){const r=base.apply(this,arguments);setTimeout(polishEditor,0);return r};fn.__pai345=true;fn.__base=base;window.openPromotionEditor=fn;try{openPromotionEditor=fn}catch(_){}
}
function install(){css();bind();patchDetail();patchEditor();patchSave()}
install();
window.RESANTA_PROMOTIONS_AI_PRECHECK_V236371=Object.freeze({version:V,analyze,openResult,decorateDetail,tabletReady:true,draftBeforeApproval:true,waitsForPromotionItems:true,fallbackHistory:true});
})();