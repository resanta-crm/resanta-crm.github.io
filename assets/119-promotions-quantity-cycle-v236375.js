/* RESANTA CRM v23.6.375 · PROMOTIONS QUANTITY LIFE-CYCLE
 * - quantity plan/fact for active and completed promotions;
 * - safe quantity-only backfill for already running promotions;
 * - portrait-tablet SKU quantity editor;
 * - common legal-entity budget across several retail outlets;
 * - historical completed promotions are not retroactively judged by quantity;
 * - removes legacy ROI/margin hints from Promotions UI.
 * No polling / no MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_QUANTITY_CYCLE_V236375)return;
const V='v23.6.375',TTL=30000,cache=new Map();
const safe=v=>String(v??'');
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const esc=v=>safe(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>num(v).toLocaleString('ru-RU',{maximumFractionDigits:2})+' BYN';
const qty=v=>num(v).toLocaleString('ru-RU',{maximumFractionDigits:2})+' шт.';
function dbc(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
function promos(){try{return typeof allPromotions!=='undefined'?allPromotions:(window.allPromotions||[])}catch(_){return window.allPromotions||[]}}
function budgets(){try{return typeof allPromotionBudgets!=='undefined'?allPromotionBudgets:(window.allPromotionBudgets||[])}catch(_){return window.allPromotionBudgets||[]}}
function clients(){try{return typeof allClients!=='undefined'?allClients:(window.allClients||[])}catch(_){return window.allClients||[]}}
function profile(){try{return typeof currentProfile!=='undefined'?currentProfile:(window.currentProfile||{})}catch(_){return window.currentProfile||{}}}
function promo(id){return promos().find(x=>safe(x.id)===safe(id))||null}
function isBoss(){return safe(profile()?.role).toLowerCase()==='boss'}
function isOwner(p){return !!p&&safe(p.manager_name).trim().toLowerCase()===safe(profile()?.name).trim().toLowerCase()}
function legalKey(v){return safe(v).trim().toLowerCase().replace(/ё/g,'е').replace(/\s*\([^)]*\)\s*$/,'').replace(/[^a-zа-я0-9]+/g,' ').trim()}
function setLocal(id,patch){try{allPromotions=allPromotions.map(x=>safe(x.id)===safe(id)?{...x,...patch}:x)}catch(_){window.allPromotions=(window.allPromotions||[]).map(x=>safe(x.id)===safe(id)?{...x,...patch}:x)}}
function active(){return document.getElementById('page-promotions')?.classList.contains('active')}
function cardId(card){
 const d=card?.querySelector?.('[data-v2368-id]')?.dataset?.v2368Id;if(d)return safe(d);
 const all=[...(card?.querySelectorAll?.('button')||[])];
 for(const b of all){const m=safe(b.getAttribute('onclick')).match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);if(m)return m[0]}
 return '';
}
function css(){
 if(document.getElementById('pqc375-style'))return;
 const s=document.createElement('style');s.id='pqc375-style';s.textContent=`
 .pqc375-box{margin:10px 0;border:1px solid #bfdbfe;background:#f8fbff;border-radius:12px;padding:11px}
 .pqc375-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap}.pqc375-head b{font-size:13px}.pqc375-head small{display:block;color:var(--sub);font-size:10px;margin-top:3px;line-height:1.4}
 .pqc375-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:9px}.pqc375-kpi{background:#fff;border:1px solid var(--border);border-radius:8px;padding:8px}.pqc375-kpi small{display:block;color:var(--sub);font-size:9px}.pqc375-kpi b{display:block;margin-top:3px;font-size:13px}
 .pqc375-good{color:#166534}.pqc375-warn{color:#92400e}.pqc375-bad{color:#b91c1c}.pqc375-note{font-size:10px;line-height:1.45;margin-top:8px;color:var(--sub)}
 .pqc375-table{overflow:auto;margin-top:9px;border:1px solid var(--border);border-radius:8px;background:#fff}.pqc375-table table{width:100%;border-collapse:collapse;font-size:10px}.pqc375-table th,.pqc375-table td{padding:6px;border-bottom:1px solid #eee;text-align:left;vertical-align:middle}.pqc375-table th{background:#f8fafc}
 .pqc375-cardstrip{margin-top:7px;padding-top:7px;border-top:1px solid #e5e7eb;font-size:10px;font-weight:700;display:flex;gap:7px;flex-wrap:wrap}.pqc375-cardstrip span{padding:3px 7px;border-radius:999px;background:#f1f5f9}
 #pqc375-modal{position:fixed;inset:0;z-index:10300;background:rgba(15,23,42,.48);display:none;align-items:center;justify-content:center;padding:14px}#pqc375-modal.open{display:flex}.pqc375-modal-card{width:min(760px,96vw);max-height:94dvh;overflow:auto;background:#fff;border-radius:15px;padding:15px;box-shadow:0 24px 80px rgba(0,0,0,.28)}.pqc375-modal-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.pqc375-modal-head h3{margin:0;font-size:17px}.pqc375-x{border:0;background:none;font-size:24px;cursor:pointer;min-width:44px;min-height:44px}.pqc375-edit-row{display:grid;grid-template-columns:120px 1fr 120px;gap:8px;align-items:center;border-top:1px solid #eee;padding:9px 0}.pqc375-edit-row input{width:100%;min-height:42px;font-size:16px;padding:8px;border:1px solid var(--border);border-radius:8px}.pqc375-actions{display:flex;justify-content:flex-end;gap:8px;position:sticky;bottom:-15px;background:#fff;border-top:1px solid #eee;margin:12px -15px -15px;padding:10px 15px}
 .pqc375-result{margin:0 0 12px;border:1px solid #bfdbfe;background:#f8fbff;border-radius:10px;padding:10px}.pqc375-result input{width:90px;min-height:38px;padding:6px;border:1px solid var(--border);border-radius:7px;font-size:15px}
 @media(max-width:1100px){
   #mo2-promo-v236123 .mo2-table{max-height:none!important;overflow:visible!important;border:0!important;background:transparent!important}
   #mo2-promo-v236123 .mo2-table table,#mo2-promo-v236123 .mo2-table tbody,#mo2-promo-v236123 .mo2-table tr,#mo2-promo-v236123 .mo2-table td{display:block!important;width:100%!important}
   #mo2-promo-v236123 .mo2-table thead{display:none!important}
   #mo2-promo-v236123 .mo2-table tr{border:1px solid var(--border);border-radius:10px;background:#fff;margin:0 0 9px;padding:8px}
   #mo2-promo-v236123 .mo2-table td{display:grid!important;grid-template-columns:120px minmax(0,1fr)!important;gap:8px;align-items:center;border:0!important;padding:6px!important}
   #mo2-promo-v236123 .mo2-table td:nth-child(1):before{content:'SKU'}
   #mo2-promo-v236123 .mo2-table td:nth-child(2):before{content:'Наименование'}
   #mo2-promo-v236123 .mo2-table td:nth-child(3):before{content:'МО2'}
   #mo2-promo-v236123 .mo2-table td:nth-child(4):before{content:'Скидка, %'}
   #mo2-promo-v236123 .mo2-table td:nth-child(5):before{content:'Цена акции'}
   #mo2-promo-v236123 .mo2-table td:nth-child(6):before{content:'Количество, шт.';font-weight:800;color:#0c447c}
   #mo2-promo-v236123 .mo2-table td:nth-child(7):before{content:'Сумма'}
   #mo2-promo-v236123 .mo2-table td:nth-child(8):before{content:'Удалить'}
   #mo2-promo-v236123 .mo2-table td:before{font-size:10px;color:var(--sub);font-weight:700}
   #mo2-promo-v236123 .mo2-table input[data-qty]{width:100%!important;min-width:110px;min-height:46px;font-size:18px!important;padding:8px!important;border:2px solid #60a5fa!important;background:#eff6ff!important}
   #mo2-promo-v236123 .mo2-table input[data-disc]{width:100%!important;min-height:42px;font-size:16px!important;padding:7px!important}
   .pqc375-kpis{grid-template-columns:1fr 1fr}
 }
 @media(max-width:700px){
   #mo2-promo-v236123 .mo2-table td{grid-template-columns:100px minmax(0,1fr)!important}
   .pqc375-kpis{grid-template-columns:1fr}.pqc375-edit-row{grid-template-columns:1fr}.pqc375-modal-card{width:100vw;height:100dvh;max-height:100dvh;border-radius:0;padding:12px}.pqc375-actions{margin:12px -12px -12px}
 }
 `;document.head.appendChild(s)
}
async function loadQty(id,force=false){
 id=safe(id);if(!id)return null;
 const c=cache.get(id);if(!force&&c&&Date.now()-c.at<TTL)return c.row;
 const d=dbc();if(!d)return null;
 const {data,error}=await d.rpc('crm_promotions_quantity_control_v236375',{p_promotion_id:id});
 if(error)throw error;
 const row=Array.isArray(data)?data[0]:null;cache.set(id,{at:Date.now(),row});return row;
}
async function loadAll(force=false){
 const k='*',c=cache.get(k);if(!force&&c&&Date.now()-c.at<TTL)return c.rows||[];
 const d=dbc();if(!d)return[];
 const {data,error}=await d.rpc('crm_promotions_quantity_control_v236375',{p_promotion_id:null});
 if(error)throw error;
 const rows=Array.isArray(data)?data:[];cache.set(k,{at:Date.now(),rows});
 rows.forEach(r=>cache.set(safe(r.promotion_id),{at:Date.now(),row:r}));
 return rows;
}
function invalidate(id){cache.delete('*');if(id)cache.delete(safe(id))}
function qualityLabel(q){
 if(q?.historical_mode)return['Историческая акция','pqc375-warn'];
 if(q?.quantity_exact)return['Факт 1С точный','pqc375-good'];
 return['Факт предварительный','pqc375-warn'];
}
function canQtyEdit(p){
 return !!p&&!['completed','rejected'].includes(safe(p.status))&&(isBoss()||isOwner(p));
}
function summaryHtml(q,p,detail=true){
 if(!q)return'';
 const hist=!!q.historical_mode,lab=qualityLabel(q),comp=q.completion_pct==null?'—':num(q.completion_pct).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%';
 const target=q.target_qty_30==null?'—':qty(q.target_qty_30),targetComp=q.target_completion_pct==null?'—':num(q.target_completion_pct).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%';
 const missing=Math.max(0,num(q.item_count)-num(q.quantity_filled_count));
 const edit=canQtyEdit(p)?'<button type="button" class="btn-secondary" data-pqc375-edit="'+esc(q.promotion_id)+'">'+(missing?'Заполнить количество, шт.':'Количество, шт.')+'</button>':'';
 let h='<div class="pqc375-box" data-pqc375-box="'+esc(q.promotion_id)+'"><div class="pqc375-head"><div><b>📦 План / факт в штуках</b><small>'+esc(lab[0])+(hist?' · старые акции не пересчитываются задним числом по правилу +30%':' · подготовительная отгрузка после финального согласования входит в факт')+'</small></div>'+edit+'</div>';
 h+='<div class="pqc375-kpis"><div class="pqc375-kpi"><small>План количества</small><b>'+(q.quantity_complete?qty(q.planned_qty_total):'Не заполнено')+'</b></div><div class="pqc375-kpi"><small>Факт</small><b class="'+lab[1]+'">'+qty(q.fact_qty_total)+'</b></div><div class="pqc375-kpi"><small>Выполнение плана</small><b>'+comp+'</b></div><div class="pqc375-kpi"><small>Цель +30%</small><b>'+(hist?'Не применяется':target)+'</b><small>'+(hist?'исторический режим':('выполнение цели '+targetComp))+'</small></div></div>';
 if(missing&&!hist)h+='<div class="pqc375-note pqc375-warn"><b>Нужно заполнить количество по '+missing+' SKU.</b> Для уже идущей акции это меняет только количество и не запускает согласование заново.</div>';
 if(!q.quantity_exact&&!hist)h+='<div class="pqc375-note pqc375-warn">Точный факт в штуках пока нельзя отделить от продаж до начала/согласования. CRM показывает календарный факт как ориентир. При закрытии ДФС подтвердит количество вручную, если точных снимков 1С недостаточно.</div>';
 if(hist)h+='<div class="pqc375-note">Акция создана до внедрения количественного контроля. История сохранена как есть: отсутствие плановых штук не считается ошибкой и цель +30% не применяется задним числом.</div>';
 if(detail&&Array.isArray(q.items)&&q.items.length){
   h+='<div class="pqc375-table"><table><thead><tr><th>SKU</th><th>Товар</th><th>План, шт.</th><th>Факт, шт.</th><th>Выполнение</th><th>Источник</th></tr></thead><tbody>'
    +q.items.map(x=>'<tr><td><b>'+esc(x.sku)+'</b></td><td>'+esc(x.product_name||'—')+'</td><td>'+(x.planned_qty==null?'—':esc(x.planned_qty))+'</td><td><b>'+esc(num(x.fact_qty).toLocaleString('ru-RU',{maximumFractionDigits:2}))+'</b></td><td>'+(x.completion_pct==null?'—':esc(num(x.completion_pct).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%'))+'</td><td>'+(x.quantity_exact?'1С точно':'предварительно')+'</td></tr>').join('')
    +'</tbody></table></div>';
 }
 return h+'</div>';
}
async function decorateDetail(id){
 const root=document.getElementById('promotion-detail-body');if(!root)return;
 root.querySelector('[data-pqc375-box]')?.remove();
 try{
   const q=await loadQty(id),p=promo(id);if(!q)return;
   const wrap=document.createElement('div');wrap.innerHTML=summaryHtml(q,p,true);const node=wrap.firstElementChild;
   const ai=root.querySelector('.pai345-detail');if(ai)ai.insertAdjacentElement('afterend',node);else root.prepend(node);
   stripFinance(root);
   await decorateBudget(id);
 }catch(e){console.warn(V+' detail',e)}
}
function stripFinance(root=document){
 [...root.querySelectorAll('.promo-eff-chip-v236132,.promo-eff-note-v236132')].forEach(n=>{
   if(/ROI|марж|окупаемост|себестоимост|валов/i.test(safe(n.textContent)))n.remove();
 });
}
async function decorateCards(){
 if(!active())return;
 try{
  const rows=await loadAll(false),map=new Map(rows.map(x=>[safe(x.promotion_id),x]));
  document.querySelectorAll('#promo-list .promo-card').forEach(card=>{
    card.querySelector('.pqc375-cardstrip')?.remove();
    const id=cardId(card),q=map.get(id);if(!q)return;
    const p=promo(id),d=document.createElement('div');d.className='pqc375-cardstrip';
    if(q.historical_mode)d.innerHTML='<span>📦 Историческая акция · план в штуках не требовался</span>';
    else d.innerHTML='<span>📦 План: '+(q.quantity_complete?esc(qty(q.planned_qty_total)):'не заполнен')+'</span><span>Факт: '+esc(qty(q.fact_qty_total))+(q.quantity_exact?' ✅':' 🟡')+'</span>'+(q.completion_pct==null?'':'<span>Выполнение: '+esc(num(q.completion_pct).toLocaleString('ru-RU',{maximumFractionDigits:1}))+'%</span>');
    if(canQtyEdit(p)&&!q.quantity_complete)d.innerHTML+='<button type="button" class="btn-secondary" style="padding:4px 7px;font-size:10px" data-pqc375-edit="'+esc(id)+'">Заполнить шт.</button>';
    card.appendChild(d);
  });
  stripFinance(document.getElementById('promo-list')||document);
 }catch(e){console.warn(V+' cards',e)}
}
function editorModal(){
 let m=document.getElementById('pqc375-modal');if(m)return m;
 m=document.createElement('div');m.id='pqc375-modal';m.innerHTML='<div class="pqc375-modal-card"><div class="pqc375-modal-head"><div><h3>Количество по акции</h3><div data-pqc375-sub style="font-size:10px;color:var(--sub);margin-top:4px"></div></div><button class="pqc375-x" type="button" data-pqc375-close>×</button></div><div data-pqc375-body></div><div class="pqc375-actions"><button type="button" class="btn-secondary" data-pqc375-close>Отмена</button><button type="button" class="btn-primary" data-pqc375-save>Сохранить количество</button></div></div>';document.body.appendChild(m);return m;
}
async function openQtyEditor(id){
 const p=promo(id);if(!canQtyEdit(p)){alert('Количество этой акции сейчас нельзя изменить.');return}
 try{
  const q=await loadQty(id,true);if(!q||!Array.isArray(q.items)||!q.items.length){alert('В акции нет сохранённых SKU.');return}
  const m=editorModal();m.dataset.promotionId=id;m.querySelector('[data-pqc375-sub]').textContent=safe(p.client_name)+' · '+safe(p.title);
  m.querySelector('[data-pqc375-body]').innerHTML='<div class="pqc375-note">Укажите, сколько штук по каждому SKU входит в акцию. Для уже согласованной/идущей старой акции менеджер может заполнить только ранее пустое количество; согласование заново не запускается.</div>'
   +q.items.map(x=>'<div class="pqc375-edit-row"><div><b>'+esc(x.sku)+'</b></div><div><b>'+esc(x.product_name||'—')+'</b></div><div><input type="number" min="1" step="1" inputmode="numeric" data-pqc375-qty="'+esc(x.sku)+'" value="'+(x.planned_qty==null?'':esc(Math.round(num(x.planned_qty))))+'" placeholder="шт."></div></div>').join('');
  m.classList.add('open');
 }catch(e){alert('Не удалось загрузить количество: '+safe(e?.message||e))}
}
async function saveQtyEditor(){
 const m=editorModal(),id=safe(m.dataset.promotionId),inputs=[...m.querySelectorAll('[data-pqc375-qty]')],items=[];
 for(const x of inputs){const v=Math.round(num(x.value));if(v<=0){x.focus();alert('Заполните количество в штуках по каждому SKU.');return}items.push({sku:x.dataset.pqc375Qty,planned_qty:v})}
 const b=m.querySelector('[data-pqc375-save]');b.disabled=true;b.textContent='Сохраняю…';
 try{
  const {error}=await dbc().rpc('crm_promotion_update_planned_qty_v236375',{p_promotion_id:id,p_items:items});if(error)throw error;
  try{
   const {data:a}=await dbc().rpc('crm_promotion_ai_precheck_v236373',{p_promotion_id:id});
   if(a)setLocal(id,{ai_precheck:a,ai_precheck_at:new Date().toISOString(),ai_precheck_version:'v23.6.373'});
  }catch(e){console.warn(V+' AI recalc',e)}
  invalidate(id);m.classList.remove('open');await decorateDetail(id);await decorateCards();
 }catch(e){alert('Не удалось сохранить количество: '+safe(e?.message||e))}
 finally{b.disabled=false;b.textContent='Сохранить количество'}
}
function resultHost(){
 const modal=document.getElementById('modal-promotion-result');if(!modal)return null;
 let h=modal.querySelector('[data-pqc375-result]');if(h)return h;
 h=document.createElement('div');h.dataset.pqc375Result='1';h.className='pqc375-result';
 const report=document.getElementById('promotion-manager-report')?.closest('.form-field');
 if(report)report.insertAdjacentElement('afterend',h);else modal.querySelector('.modal')?.prepend(h);
 return h;
}
async function decorateResult(id){
 const h=resultHost();if(!h)return;
 h.innerHTML='<div class="pqc375-note">Загружаю план/факт в штуках…</div>';
 try{
  const q=await loadQty(id,true);if(!q){h.innerHTML='';return}
  if(q.historical_mode){h.innerHTML='<b>📦 Историческая акция</b><div class="pqc375-note">Создана до учёта количества. Плановые штуки и цель +30% при закрытии не требуются.</div>';return}
  const exact=q.quantity_exact;
  h.innerHTML='<b>📦 Закрытие по количеству</b><div class="pqc375-note">План '+(q.quantity_complete?qty(q.planned_qty_total):'не заполнен')+' · факт '+qty(q.fact_qty_total)+' · '+(exact?'✅ точный факт 1С':'🟡 требуется подтверждение ДФС')+'</div>'
   +'<div class="pqc375-table"><table><thead><tr><th>SKU</th><th>План</th><th>Факт</th></tr></thead><tbody>'
   +(q.items||[]).map(x=>'<tr><td><b>'+esc(x.sku)+'</b><div style="font-size:9px;color:var(--sub)">'+esc(x.product_name||'')+'</div></td><td>'+(x.planned_qty==null?'—':esc(x.planned_qty))+'</td><td>'+(exact?'<b>'+esc(num(x.fact_qty).toLocaleString('ru-RU',{maximumFractionDigits:2}))+' шт.</b>':'<input type="number" min="0" step="1" inputmode="numeric" data-pqc375-confirm="'+esc(x.sku)+'" value="'+esc(Math.max(0,Math.round(num(x.fact_qty))))+'">')+'</td></tr>').join('')
   +'</tbody></table></div>'
   +(exact?'':'<div class="pqc375-note pqc375-warn"><b>Проверьте и подтвердите фактическое количество.</b> Предварительное значение подставлено из календарного отчёта 1С, потому что для старта/окончания этой акции не хватает точных количественных снимков.</div>');
 }catch(e){h.innerHTML='<div class="pqc375-note pqc375-bad">Не удалось проверить количество: '+esc(e?.message||e)+'</div>'}
}
async function guardClose(id){
 let q=await loadQty(id,true);if(!q||q.historical_mode)return true;
 if(!q.quantity_complete){alert('Нельзя закрыть акцию: сначала заполните плановое количество в штуках по каждому SKU.');return false}
 if(q.quantity_exact)return true;
 const h=resultHost(),inputs=[...h.querySelectorAll('[data-pqc375-confirm]')];
 if(!inputs.length){await decorateResult(id);alert('Факт в штуках требует подтверждения. Проверьте значения в блоке «Закрытие по количеству» и нажмите «Закрыть акцию» ещё раз.');return false}
 const items=[];
 for(const x of inputs){if(x.value===''){x.focus();alert('Укажите фактическое количество по каждому SKU.');return false}const v=num(x.value);if(v<0){x.focus();alert('Количество не может быть отрицательным.');return false}items.push({sku:x.dataset.pqc375Confirm,confirmed_qty:v})}
 const {error}=await dbc().rpc('crm_promotion_confirm_quantity_v236375',{p_promotion_id:id,p_items:items,p_note:'Подтверждено при закрытии акции v23.6.375'});
 if(error){alert('Не удалось подтвердить фактическое количество: '+safe(error.message));return false}
 invalidate(id);q=await loadQty(id,true);
 return !!q;
}
async function decorateBudget(id){
 try{
  const {data:s,error}=await dbc().rpc('crm_promotion_budget_snapshot_v23630',{p_promotion_id:id});if(error||!s)return;
  const root=document.getElementById('promotion-detail-body');if(!root)return;
  const box=[...root.querySelectorAll('.promo-v2368-box')].find(x=>/БЮДЖЕТ/i.test(safe(x.textContent)));
  if(!box)return;
  if(s.has_budget){
    const owner=safe(s.budget_owner_client_name||s.client_name);
    const shared=!!s.shared_legal_entity_budget;
    const kicker=box.querySelector('.promo-v2368-kicker');if(kicker)kicker.textContent='БЮДЖЕТ ЮРЛИЦА';
    const note=[...box.querySelectorAll('.promo-v2368-note')].pop();
    if(note)note.textContent=shared?('Бюджет заведён на '+owner+' и доступен для всех ТТ этого же юрлица. Бюджеты других юрлиц не используются.'):'Бюджет общий для ТТ этого юрлица. Бюджеты других юрлиц не используются.';
  }
 }catch(e){console.warn(V+' budget detail',e)}
}
function patchBudgetOptions(){
 const f=window.fillPromotionBudgetOptions;
 if(typeof f!=='function'||f.__legalEntity375)return false;
 const fn=function(clientId,selected){
  const sel=document.getElementById('promotion-budget-id');if(!sel)return;
  const c=clients().find(x=>safe(x.id)===safe(clientId)),key=legalKey(c?.name||'');
  const rows=budgets().filter(b=>safe(b.client_id)===safe(clientId)||(key&&legalKey(b.client_name)===key)).sort((a,b)=>safe(b.period_start).localeCompare(safe(a.period_start)));
  sel.innerHTML='<option value="">Не выбран</option>'+rows.map(b=>{let x={free:0};try{x=typeof promoBudgetSummary==='function'?promoBudgetSummary(b):x}catch(_){}
    const shared=safe(b.client_id)!==safe(clientId);
    return '<option value="'+esc(b.id)+'" '+(safe(b.id)===safe(selected)?'selected':'')+'>'+esc(b.period_start)+' — '+esc(b.period_end)+' · свободно '+esc(num(x.free).toLocaleString('ru-RU',{maximumFractionDigits:2}))+' BYN'+(shared?' · общий бюджет юрлица':'')+'</option>';
  }).join('');
  try{promotionBudgetChanged()}catch(_){}
 };
 fn.__legalEntity375=true;fn.__base=f;window.fillPromotionBudgetOptions=fn;try{fillPromotionBudgetOptions=fn}catch(_){}
 return true;
}
function patchFunctions(){
 const od=window.openPromotionDetail;if(typeof od==='function'&&!od.__pqc375){const base=od,fn=function(id){const r=base.apply(this,arguments);setTimeout(()=>decorateDetail(id),100);setTimeout(()=>decorateDetail(id),350);return r};fn.__pqc375=true;fn.__base=base;window.openPromotionDetail=fn;try{openPromotionDetail=fn}catch(_){}}
 const rp=window.renderPromotions;if(typeof rp==='function'&&!rp.__pqc375){const base=rp,fn=function(){const r=base.apply(this,arguments);setTimeout(decorateCards,80);setTimeout(()=>stripFinance(document),120);return r};fn.__pqc375=true;fn.__base=base;window.renderPromotions=fn;try{renderPromotions=fn}catch(_){}}
 const or=window.openPromotionResult;if(typeof or==='function'&&!or.__pqc375){const base=or,fn=function(id){const r=base.apply(this,arguments);setTimeout(()=>decorateResult(id),80);return r};fn.__pqc375=true;fn.__base=base;window.openPromotionResult=fn;try{openPromotionResult=fn}catch(_){}}
 const sr=window.savePromotionResult;if(typeof sr==='function'&&!sr.__pqc375){const base=sr,fn=async function(closeIt){const id=safe(document.getElementById('promotion-result-id')?.value);if(closeIt&&id){const ok=await guardClose(id);if(!ok)return}const r=await base.apply(this,arguments);invalidate(id);setTimeout(decorateCards,100);return r};fn.__pqc375=true;fn.__base=base;window.savePromotionResult=fn;try{savePromotionResult=fn}catch(_){}}
 patchBudgetOptions();
}
function bind(){
 document.addEventListener('click',e=>{
  const edit=e.target.closest?.('[data-pqc375-edit]');if(edit){e.preventDefault();e.stopPropagation();openQtyEditor(edit.dataset.pqc375Edit);return}
  if(e.target.closest?.('[data-pqc375-close]')){editorModal().classList.remove('open');return}
  if(e.target.closest?.('[data-pqc375-save]')){saveQtyEditor();return}
  if(e.target.closest?.('[data-v2368-action="approve_dfs"]')){const id=e.target.closest('[data-v2368-id]')?.dataset?.v2368Id;if(id)setTimeout(()=>decorateBudget(id),80)}
 },true);
 window.addEventListener('resanta:promotions-effectiveness',()=>{stripFinance(document);setTimeout(decorateCards,60)});
}
function install(){
 css();patchFunctions();stripFinance(document);if(active())setTimeout(decorateCards,80);
}
bind();install();[150,500,1200,2500].forEach(ms=>setTimeout(install,ms));
window.RESANTA_PROMOTIONS_QUANTITY_CYCLE_V236375=Object.freeze({version:V,loadQty,loadAll,openQtyEditor,decorateDetail,portraitTablet:true,legalEntityBudget:true,historicalSafe:true,noPolling:true,noMutationObserver:true});
})();