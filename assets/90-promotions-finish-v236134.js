/* RESANTA CRM v23.6.134 · PROMOTIONS FINISH LAYER
 * - reason badges + negative-sales explanation in boss dashboard;
 * - safe SKU-only refinement for legacy/current promotions;
 * - no polling / no MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_FINISH_V236134)return;
const V='v23.6.134';
const safe=v=>String(v??'');
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const esc=v=>safe(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let prices=null,priceFlight=null,chosen=new Map(),activePromotionId='';
function dbc(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
function promotions(){try{return typeof allPromotions!=='undefined'?allPromotions:(window.allPromotions||[])}catch(_){return window.allPromotions||[]}}
function promotion(id){return promotions().find(x=>safe(x.id)===safe(id))||null}
function boss(){try{return typeof promoIsBoss==='function'?promoIsBoss():currentProfile?.role==='boss'}catch(_){return false}}
function owner(p){return !!p&&safe(p.manager_name).trim().toLowerCase()===safe(currentProfile?.name).trim().toLowerCase()}
function canRefine(p){return !!p&&!['completed','rejected'].includes(safe(p.status))&&(boss()||owner(p))}
function effRow(id){try{return window.RESANTA_PROMOTIONS_EFFECTIVENESS_V236132?.getRow?.(id)||null}catch(_){return null}}
function css(){
 if(document.getElementById('promo-finish-style-v236134'))return;
 const s=document.createElement('style');s.id='promo-finish-style-v236134';s.textContent=`
 .pbd134-reason{display:inline-flex;align-items:center;border-radius:999px;padding:3px 7px;margin:0 6px 3px 0;font-size:9px;font-weight:800;white-space:nowrap}.pbd134-photo,.pbd134-close{background:#FCEBEB;color:#A32D2D}.pbd134-sales{background:#FAEEDA;color:#854F0B}.pbd134-time,.pbd134-start{background:#E6F1FB;color:#0C447C}.pbd134-approval{background:#F3E8FF;color:#6B21A8}.pbd134-negative{color:#A32D2D!important}.pbd134-neg-note{display:block;margin-top:2px;color:#A32D2D;font-size:9px;font-weight:700}
 .promo-sku-refine-v236134{margin-top:10px;border:1px solid #BFDBFE;background:#F8FBFF;border-radius:10px;padding:10px;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.promo-sku-refine-v236134 b{font-size:11px}.promo-sku-refine-v236134 small{display:block;color:var(--sub);font-size:9px;margin-top:3px}.promo-sku-refine-v236134 button{white-space:nowrap}
 #promo-sku-modal-v236134{position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px}.psm134-card{width:min(980px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:14px;box-shadow:0 20px 70px rgba(0,0,0,.25);padding:16px}.psm134-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.psm134-head h3{margin:0;font-size:17px}.psm134-note{font-size:10px;color:var(--sub);line-height:1.4;margin-top:4px}.psm134-x{border:0;background:none;font-size:22px;cursor:pointer}.psm134-filters{display:grid;grid-template-columns:1fr 1fr 1.3fr;gap:7px;margin-top:12px}.psm134-filters select,.psm134-filters input,.psm134-list{width:100%;border:1px solid var(--border);border-radius:8px;padding:8px;background:#fff}.psm134-list{min-height:150px;font-size:11px}.psm134-tools{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:8px 0}.psm134-count{font-size:10px;color:var(--sub)}.psm134-table{overflow:auto;max-height:290px;border:1px solid var(--border);border-radius:8px}.psm134-table table{width:100%;border-collapse:collapse;font-size:10px}.psm134-table th,.psm134-table td{padding:6px;border-bottom:1px solid #eee;text-align:left}.psm134-table th{position:sticky;top:0;background:#f8fafc}.psm134-table input{width:70px;padding:4px}.psm134-del{border:0;background:none;color:var(--r);font-size:18px;cursor:pointer}.psm134-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}.psm134-warn{background:#FFFBEB;border:1px solid #FDE68A;color:#92400E;padding:8px 10px;border-radius:8px;font-size:10px;margin-top:10px}
 @media(max-width:700px){.psm134-filters{grid-template-columns:1fr}.psm134-card{padding:12px}.promo-sku-refine-v236134{align-items:flex-start}}
 `;document.head.appendChild(s);
}
function reason(action){
 const a=safe(action).toLowerCase().replace(/ё/g,'е');
 if(a.includes('фото'))return['🔴 Фото / подтверждение','photo'];
 if(a.includes('отстав'))return['🟠 Отставание продаж','sales'];
 if(a.includes('до окончания'))return['🔵 Заканчивается','time'];
 if(a.includes('согласовать')||a.includes('финальное согласование'))return['🟣 Согласование','approval'];
 if(a.includes('итоговый отчет')||a.includes('закрыть акцию')||a.includes('проверить и закрыть'))return['🔴 Закрытие','close'];
 if(a.includes('взять акцию в работу')||a.includes('отправить на согласование'))return['🔵 Запуск','start'];
 return null;
}
function decorateDashboard(){
 const root=document.getElementById('promo-boss-dash-v236133');if(!root)return;
 root.querySelectorAll('.pbd133-row').forEach(row=>{
   const act=row.querySelector('.pbd133-action');if(act&&!act.querySelector('.pbd134-reason')){const r=reason(act.textContent);if(r){const b=document.createElement('span');b.className='pbd134-reason pbd134-'+r[1];b.textContent=r[0];act.prepend(b)}}
   const first=row.querySelector('.pbd133-metric b');if(first&&/^\s*-/.test(first.textContent||'')){first.classList.add('pbd134-negative');if(!first.parentElement.querySelector('.pbd134-neg-note')){const n=document.createElement('span');n.className='pbd134-neg-note';n.textContent='Нетто-возврат по данным 1С';first.insertAdjacentElement('afterend',n)}}
 });
}
async function loadPrices(){
 if(prices)return prices;if(priceFlight)return priceFlight;const d=dbc();if(!d)throw Error('Нет подключения к базе');
 priceFlight=(async()=>{const out=[];for(let a=0;;a+=1000){const {data,error}=await d.from('promotion_price_list').select('sku,product_name,category,subgroup,price_vat,valid_from').eq('active',true).order('category').order('subgroup').order('sku').range(a,a+999);if(error)throw error;out.push(...(data||[]));if(!data||data.length<1000)break}prices=out;return out})().finally(()=>priceFlight=null);return priceFlight;
}
async function savedItems(id){const {data,error}=await dbc().from('promotion_items').select('sku,discount_pct').eq('promotion_id',id);if(error)throw error;return data||[]}
function groups(){return[...new Set((prices||[]).map(x=>safe(x.category)||'Без группы'))].sort((a,b)=>a.localeCompare(b,'ru'))}
function subgroups(g){return[...new Set((prices||[]).filter(x=>(safe(x.category)||'Без группы')===g).map(x=>safe(x.subgroup)||'Без подгруппы'))].sort((a,b)=>a.localeCompare(b,'ru'))}
function modal(){return document.getElementById('promo-sku-modal-v236134')}
function filterState(){const m=modal();return{g:m?.querySelector('[data-psm-g]')?.value||'',s:m?.querySelector('[data-psm-s]')?.value||'',q:safe(m?.querySelector('[data-psm-q]')?.value).trim().toLowerCase()}}
function candidates(){const f=filterState();return(prices||[]).filter(x=>{const g=safe(x.category)||'Без группы',s=safe(x.subgroup)||'Без подгруппы',q=(safe(x.sku)+' '+safe(x.product_name)).toLowerCase();return(!f.g||g===f.g)&&(!f.s||s===f.s)&&(!f.q||q.includes(f.q))})}
function renderList(){const m=modal(),sel=m?.querySelector('[data-psm-list]');if(!sel)return;const a=candidates(),shown=a.slice(0,180);sel.innerHTML=shown.map(x=>'<option value="'+esc(x.sku)+'">'+esc(x.sku)+' · '+esc(x.product_name)+' · '+num(x.price_vat).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN</option>').join('');const c=m.querySelector('[data-psm-found]');if(c)c.textContent='Найдено '+a.length+(a.length>180?' · показаны первые 180':'')}
function renderChosen(){const m=modal(),box=m?.querySelector('[data-psm-selected]');if(!box)return;const a=[...chosen.values()];if(!a.length){box.innerHTML='<div class="psm134-warn">Выберите конкретные SKU. Пустой список сохранить нельзя.</div>';return}box.innerHTML='<div class="psm134-count"><b>Выбрано '+a.length+' SKU</b></div><div class="psm134-table"><table><thead><tr><th>SKU</th><th>Товар</th><th>МО2</th><th>Скидка %</th><th></th></tr></thead><tbody>'+a.map(x=>'<tr><td><b>'+esc(x.sku)+'</b></td><td>'+esc(x.product_name)+'</td><td>'+num(x.price_vat).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+'</td><td><input type="number" min="0" max="99.99" step="0.01" data-psm-disc="'+esc(x.sku)+'" value="'+num(x.discount_pct)+'"></td><td><button class="psm134-del" type="button" data-psm-del="'+esc(x.sku)+'">×</button></td></tr>').join('')+'</tbody></table></div>'}
function addSku(sku){const x=(prices||[]).find(v=>safe(v.sku)===safe(sku));if(x&&!chosen.has(safe(sku)))chosen.set(safe(sku),{...x,discount_pct:0})}
async function openPicker(id){
 const p=promotion(id);if(!canRefine(p)){alert('Уточнение SKU для этой акции недоступно.');return}activePromotionId=safe(id);chosen=new Map();css();
 let m=modal();if(!m){m=document.createElement('div');m.id='promo-sku-modal-v236134';m.innerHTML='<div class="psm134-card"><div class="psm134-head"><div><h3>Уточнить SKU акции</h3><div class="psm134-note">Меняется только товарный охват акции. Клиент, сроки, план, бюджет, механика и согласования остаются без изменений.</div></div><button type="button" class="psm134-x" data-psm-close>×</button></div><div class="psm134-warn">После сохранения продажи этой акции будут считаться строго по выбранным артикулам, а не по всей группе / подгруппе.</div><div class="psm134-filters"><select data-psm-g></select><select data-psm-s><option value="">Все подгруппы</option></select><input data-psm-q placeholder="Поиск по SKU / названию"></div><div class="psm134-count" data-psm-found></div><select multiple size="8" class="psm134-list" data-psm-list></select><div class="psm134-tools"><button type="button" class="btn-secondary" data-psm-add>Добавить выбранные</button></div><div data-psm-selected></div><div class="psm134-foot"><button type="button" class="btn-secondary" data-psm-close>Отмена</button><button type="button" class="btn-primary" data-psm-save>Сохранить точные SKU</button></div></div>';document.body.appendChild(m)}else m.style.display='flex';
 m.querySelector('h3').textContent='Уточнить SKU · '+safe(p.client_name||'')+' — '+safe(p.title||'');
 try{await loadPrices();const saved=await savedItems(id);saved.forEach(v=>{const x=(prices||[]).find(z=>safe(z.sku)===safe(v.sku));if(x)chosen.set(safe(v.sku),{...x,discount_pct:num(v.discount_pct)})});const gs=groups(),g=gs[0]||'';m.querySelector('[data-psm-g]').innerHTML=gs.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');m.querySelector('[data-psm-g]').value=g;m.querySelector('[data-psm-s]').innerHTML='<option value="">Все подгруппы</option>'+subgroups(g).map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');renderList();renderChosen()}catch(e){alert('Не удалось загрузить Прайс МО2: '+(e?.message||e));m.style.display='none'}
}
function closePicker(){const m=modal();if(m)m.style.display='none';activePromotionId='';chosen.clear()}
async function savePicker(){
 const p=promotion(activePromotionId);if(!canRefine(p))return alert('Нет доступа к уточнению SKU.');if(!chosen.size)return alert('Выберите хотя бы один SKU.');
 if(!confirm('После сохранения продажи акции будут считаться только по '+chosen.size+' выбранным SKU. Продолжить?'))return;
 const btn=modal()?.querySelector('[data-psm-save]');if(btn){btn.disabled=true;btn.textContent='Сохраняю…'}
 try{const items=[...chosen.values()].map(x=>({sku:x.sku,discount_pct:num(x.discount_pct)}));const {error}=await dbc().rpc('crm_promotion_refine_items_v236134',{p_promotion_id:activePromotionId,p_items:items});if(error)throw error;const id=activePromotionId;const {data,error:e}=await dbc().from('promotions').select('*').eq('id',id).single();if(e)throw e;try{allPromotions=allPromotions.map(x=>safe(x.id)===safe(id)?data:x)}catch(_){window.allPromotions=(window.allPromotions||[]).map(x=>safe(x.id)===safe(id)?data:x)}closePicker();try{await window.RESANTA_PROMOTIONS_EFFECTIVENESS_V236132?.refresh?.()}catch(_){}try{renderPromotions()}catch(_){}setTimeout(()=>{try{openPromotionDetail(id)}catch(_){}},80);alert('Готово. Акция теперь считается строго по '+items.length+' SKU.')}catch(e){alert(e?.message||String(e))}finally{if(btn){btn.disabled=false;btn.textContent='Сохранить точные SKU'}}
}
function decorateDetail(id){
 const p=promotion(id),root=document.getElementById('promotion-detail-body');if(!root||!canRefine(p))return;root.querySelector('.promo-sku-refine-v236134')?.remove();const e=effRow(id),exact=e?.scope_mode==='exact_sku';const box=document.createElement('div');box.className='promo-sku-refine-v236134';box.innerHTML='<div><b>'+(exact?'Товарный охват: точные SKU':'Товарный охват: исторический / широкий')+'</b><small>'+(exact?'Можно скорректировать только список SKU, не меняя согласованные условия.':'Уточните конкретные артикулы, чтобы продажи считались не по всей группе или подгруппе.')+'</small></div><button type="button" class="btn-secondary" data-psm-open="'+esc(id)+'">'+(exact?'Изменить SKU акции':'Уточнить SKU акции')+'</button>';const eff=root.querySelector('#promo-eff-detail-v236132')||root.querySelector('.promo-control-v236125');eff?eff.insertAdjacentElement('afterend',box):root.prepend(box)
}
function installDetailHook(){const f=window.openPromotionDetail;if(typeof f!=='function'||f.__pfinish134)return;const base=f,fn=function(id){const out=base.apply(this,arguments);setTimeout(()=>decorateDetail(id),0);return out};fn.__pfinish134=true;fn.__base=base;window.openPromotionDetail=fn;try{openPromotionDetail=fn}catch(_){}}
function delegated(e){
 const open=e.target.closest?.('[data-psm-open]');if(open){e.preventDefault();openPicker(open.dataset.psmOpen);return}
 if(e.target.closest?.('[data-psm-close]')){e.preventDefault();closePicker();return}
 if(e.target.closest?.('[data-psm-add]')){e.preventDefault();const s=modal()?.querySelector('[data-psm-list]');[...(s?.selectedOptions||[])].forEach(o=>addSku(o.value));renderChosen();return}
 const del=e.target.closest?.('[data-psm-del]');if(del){chosen.delete(safe(del.dataset.psmDel));renderChosen();return}
 if(e.target.closest?.('[data-psm-save]')){e.preventDefault();savePicker();return}
 if(e.target.closest?.('#promo-boss-dash-v236133'))setTimeout(decorateDashboard,0)
}
function changed(e){if(e.target?.matches?.('[data-psm-g]')){const g=e.target.value,sub=modal().querySelector('[data-psm-s]');sub.innerHTML='<option value="">Все подгруппы</option>'+subgroups(g).map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join('');renderList();return}if(e.target?.matches?.('[data-psm-s]')){renderList();return}if(e.target?.matches?.('[data-psm-disc]')){const x=chosen.get(safe(e.target.dataset.psmDisc));if(x)x.discount_pct=Math.max(0,Math.min(99.99,num(e.target.value)));return}if(e.target?.closest?.('#promo-boss-dash-v236133'))setTimeout(decorateDashboard,0)}
function typed(e){if(e.target?.matches?.('[data-psm-q]')){renderList();return}if(e.target?.closest?.('#promo-boss-dash-v236133'))setTimeout(decorateDashboard,0)}
css();document.addEventListener('click',delegated,true);document.addEventListener('change',changed,true);document.addEventListener('input',typed,true);window.addEventListener('resanta:promotions-effectiveness',()=>{setTimeout(decorateDashboard,0);try{if(typeof promotionDetailId!=='undefined'&&promotionDetailId)decorateDetail(promotionDetailId)}catch(_){}});installDetailHook();[150,500,1200,3000].forEach(ms=>setTimeout(()=>{installDetailHook();decorateDashboard();try{if(typeof promotionDetailId!=='undefined'&&promotionDetailId)decorateDetail(promotionDetailId)}catch(_){}},ms));
window.RESANTA_PROMOTIONS_FINISH_V236134=Object.freeze({version:V,noPolling:true,noMutationObserver:true,safeSkuRefinement:true,decorateDashboard,decorateDetail});
})();
