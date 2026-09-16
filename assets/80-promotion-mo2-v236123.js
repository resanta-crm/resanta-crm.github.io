/* RESANTA CRM v23.6.123 · Акции 2.0 — Прайс МО2
 * Безопасный слой над действующими Акциями:
 * - старые акции без promotion_items остаются в старом редакторе;
 * - новые акции выбирают товар из Прайс МО2: группа -> подгруппа -> SKU;
 * - в legacy product_filters пишутся только точные SKU, чтобы старый расчёт продаж не расширял выбор через OR;
 * - цена МО2 и скидка сохраняются отдельным снимком в promotion_items.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTION_MO2_V236123)return;

const VERSION='v23.6.123';
let installed=false;
let oldOpenPromotionEditor=null;
let oldSavePromotion=null;
let priceCache=null;
let priceLoadPromise=null;
let selected=new Map();
let editorMode='legacy'; // legacy | structured
let legacyCard=null;
let picker=null;

function h(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function a(v){return h(v).replace(/`/g,'&#96;');}
function n(v){const x=Number(v);return Number.isFinite(x)?x:0;}
function money(v){return n(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});}
function promoPrice(base,discount){return Math.round(n(base)*(1-n(discount)/100)*100)/100;}
function norm(v){return String(v||'').trim().toLowerCase().replace(/ё/g,'е');}

function styleOnce(){
  if(document.getElementById('promotion-mo2-style'))return;
  const st=document.createElement('style');
  st.id='promotion-mo2-style';
  st.textContent=`
  #promotion-mo2-picker{border:1px solid var(--border);border-radius:12px;padding:12px;margin:2px 0 12px;background:#fff}
  .pmo2-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px;flex-wrap:wrap}
  .pmo2-title{font-size:13px;font-weight:700}.pmo2-help{font-size:11px;color:var(--sub);line-height:1.4;margin-top:3px}
  .pmo2-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.pmo2-grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
  .pmo2-results{border:1px solid var(--border);border-radius:9px;max-height:270px;overflow:auto;margin-top:8px;background:#fff}
  .pmo2-result{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 10px;border-bottom:1px solid var(--border)}
  .pmo2-result:last-child{border-bottom:none}.pmo2-name{font-size:12px;font-weight:600}.pmo2-meta{font-size:10px;color:var(--sub);margin-top:2px;line-height:1.35}
  .pmo2-add{padding:6px 10px;border:1px solid var(--border);border-radius:7px;background:#fff;color:var(--a);font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap}
  .pmo2-add:disabled{opacity:.45;cursor:default}.pmo2-empty{padding:14px;font-size:12px;color:var(--sub);text-align:center}
  .pmo2-selected{margin-top:12px}.pmo2-selected-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:7px}
  .pmo2-chip{font-size:11px;background:var(--ab);color:var(--at);padding:3px 8px;border-radius:99px;font-weight:600}
  .pmo2-table-wrap{overflow-x:auto;border:1px solid var(--border);border-radius:9px}.pmo2-table{width:100%;border-collapse:collapse;min-width:650px}
  .pmo2-table th{font-size:10px;color:var(--sub);text-align:left;padding:7px 8px;background:var(--bg);border-bottom:1px solid var(--border)}
  .pmo2-table td{font-size:11px;padding:7px 8px;border-bottom:1px solid var(--border);vertical-align:middle}.pmo2-table tr:last-child td{border-bottom:none}
  .pmo2-disc{width:76px;padding:6px 7px;border:1px solid var(--border);border-radius:7px;font-size:12px}.pmo2-remove{border:none;background:none;color:var(--r);cursor:pointer;font-size:16px}
  .pmo2-bulk{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.pmo2-bulk input{width:74px;padding:6px 7px;border:1px solid var(--border);border-radius:7px;font-size:12px}
  .pmo2-note{padding:9px 10px;border-radius:8px;background:var(--amb);color:var(--am);font-size:11px;line-height:1.4;margin-bottom:8px}
  @media(max-width:700px){.pmo2-grid,.pmo2-grid3{grid-template-columns:1fr}.pmo2-result{grid-template-columns:minmax(0,1fr) auto}}
  `;
  document.head.appendChild(st);
}

function ensurePicker(){
  styleOnce();
  if(picker&&document.body.contains(picker))return picker;
  const cat=document.getElementById('promotion-categories');
  legacyCard=cat?.closest('.card')||null;
  if(!legacyCard)return null;
  picker=document.createElement('div');
  picker.id='promotion-mo2-picker';
  picker.style.display='none';
  picker.innerHTML=`
    <div class="pmo2-head">
      <div><div class="pmo2-title">Товары акции · Прайс МО2 с НДС</div><div class="pmo2-help">Только товар, который сейчас есть в наличии. Цена МО2 берётся из последнего письма 1С.</div></div>
      <span class="pmo2-chip" id="promotion-mo2-count">0 SKU</span>
    </div>
    <div id="promotion-mo2-note" class="pmo2-note" style="display:none"></div>
    <div class="pmo2-grid">
      <div class="form-field" style="margin-bottom:8px"><label class="form-label">Группа</label><select class="form-input" id="promotion-mo2-category"><option value="">Выберите группу</option></select></div>
      <div class="form-field" style="margin-bottom:8px"><label class="form-label">Подгруппа</label><select class="form-input" id="promotion-mo2-subgroup" disabled><option value="">Все подгруппы</option></select></div>
    </div>
    <div class="pmo2-grid">
      <div class="form-field" style="margin-bottom:0"><label class="form-label">Поиск SKU / товара</label><input class="form-input" id="promotion-mo2-search" placeholder="Например 75/9/1 или Лобзик"></div>
      <div class="form-field" style="margin-bottom:0"><label class="form-label">Быстрое действие</label><button type="button" class="btn-secondary" id="promotion-mo2-add-subgroup" style="width:100%" disabled>Добавить всю подгруппу</button></div>
    </div>
    <div class="pmo2-results" id="promotion-mo2-results"><div class="pmo2-empty">Выберите группу или введите SKU / название.</div></div>
    <div class="pmo2-selected">
      <div class="pmo2-selected-head"><b style="font-size:12px">Выбрано для акции</b><div class="pmo2-bulk"><span style="font-size:11px;color:var(--sub)">Скидка всем</span><input type="number" min="0" max="100" step="0.01" id="promotion-mo2-bulk-discount" placeholder="%"><button type="button" class="btn-secondary" id="promotion-mo2-apply-discount" style="padding:6px 9px;font-size:11px">Применить</button></div></div>
      <div id="promotion-mo2-selected"><div class="pmo2-empty">Товары пока не выбраны.</div></div>
    </div>`;
  legacyCard.parentNode.insertBefore(picker,legacyCard);

  picker.querySelector('#promotion-mo2-category').addEventListener('change',()=>{fillSubgroups();renderResults();});
  picker.querySelector('#promotion-mo2-subgroup').addEventListener('change',()=>{updateAddSubgroup();renderResults();});
  picker.querySelector('#promotion-mo2-search').addEventListener('input',renderResults);
  picker.querySelector('#promotion-mo2-add-subgroup').addEventListener('click',addWholeSubgroup);
  picker.querySelector('#promotion-mo2-apply-discount').addEventListener('click',applyBulkDiscount);
  picker.querySelector('#promotion-mo2-results').addEventListener('click',e=>{
    const b=e.target.closest('[data-mo2-add]'); if(!b)return;
    addSku(decodeURIComponent(b.dataset.mo2Add||''));
  });
  picker.querySelector('#promotion-mo2-selected').addEventListener('click',e=>{
    const b=e.target.closest('[data-mo2-remove]'); if(!b)return;
    selected.delete(decodeURIComponent(b.dataset.mo2Remove||'')); renderSelected(); renderResults();
  });
  picker.querySelector('#promotion-mo2-selected').addEventListener('input',e=>{
    const inp=e.target.closest('[data-mo2-discount]'); if(!inp)return;
    const sku=decodeURIComponent(inp.dataset.mo2Discount||''); const item=selected.get(sku); if(!item)return;
    let d=Math.max(0,Math.min(100,n(inp.value))); item.discount_pct=Math.round(d*100)/100; item.promo_price_vat=promoPrice(item.base_price_vat,item.discount_pct);
    const out=picker.querySelector(`[data-mo2-price="${cssEscape(sku)}"]`); if(out)out.textContent=money(item.promo_price_vat);
  });
  return picker;
}

function cssEscape(v){
  if(window.CSS&&typeof CSS.escape==='function')return CSS.escape(String(v));
  return String(v).replace(/["\\]/g,'\\$&');
}

async function loadPrice(){
  if(priceCache)return priceCache;
  if(priceLoadPromise)return priceLoadPromise;
  priceLoadPromise=(async()=>{
    const rows=[]; let from=0; const page=1000;
    while(true){
      const {data,error}=await db.from('promotion_price_list')
        .select('sku,product_name,category,subgroup,price_vat,valid_from,active')
        .eq('active',true)
        .order('category',{ascending:true})
        .order('subgroup',{ascending:true,nullsFirst:false})
        .order('product_name',{ascending:true})
        .range(from,from+page-1);
      if(error)throw error;
      const batch=data||[]; rows.push(...batch);
      if(batch.length<page)break;
      from+=page;
      if(from>10000)throw new Error('Слишком большой прайс МО2');
    }
    priceCache=rows;
    return rows;
  })();
  try{return await priceLoadPromise;}finally{priceLoadPromise=null;}
}

function fillCategories(){
  if(!picker||!priceCache)return;
  const el=picker.querySelector('#promotion-mo2-category'); const old=el.value;
  const cats=[...new Set(priceCache.map(x=>x.category).filter(Boolean))].sort((x,y)=>x.localeCompare(y,'ru'));
  el.innerHTML='<option value="">Выберите группу</option>'+cats.map(x=>`<option value="${a(x)}">${h(x)}</option>`).join('');
  if(cats.includes(old))el.value=old;
  fillSubgroups();
}

function fillSubgroups(){
  if(!picker||!priceCache)return;
  const cat=picker.querySelector('#promotion-mo2-category').value;
  const el=picker.querySelector('#promotion-mo2-subgroup'); const old=el.value;
  const subs=[...new Set(priceCache.filter(x=>!cat||x.category===cat).map(x=>x.subgroup||'Без подгруппы'))].sort((x,y)=>x.localeCompare(y,'ru'));
  el.innerHTML='<option value="">Все подгруппы</option>'+subs.map(x=>`<option value="${a(x)}">${h(x)}</option>`).join('');
  el.disabled=!cat;
  if(subs.includes(old))el.value=old;
  updateAddSubgroup();
}

function updateAddSubgroup(){
  if(!picker)return;
  const cat=picker.querySelector('#promotion-mo2-category').value;
  const sub=picker.querySelector('#promotion-mo2-subgroup').value;
  const b=picker.querySelector('#promotion-mo2-add-subgroup');
  b.disabled=!(cat&&sub);
  b.textContent='Добавить всю подгруппу';
}

function filteredRows(){
  if(!priceCache||!picker)return[];
  const cat=picker.querySelector('#promotion-mo2-category').value;
  const sub=picker.querySelector('#promotion-mo2-subgroup').value;
  const q=norm(picker.querySelector('#promotion-mo2-search').value);
  if(!cat&&q.length<2)return[];
  return priceCache.filter(x=>{
    if(cat&&x.category!==cat)return false;
    if(sub&&(x.subgroup||'Без подгруппы')!==sub)return false;
    if(q){const hay=norm(`${x.sku} ${x.product_name} ${x.category} ${x.subgroup||''}`);if(!hay.includes(q))return false;}
    return true;
  });
}

function renderResults(){
  if(!picker)return;
  const box=picker.querySelector('#promotion-mo2-results');
  if(!priceCache){box.innerHTML='<div class="pmo2-empty">Загрузка прайса МО2…</div>';return;}
  const rows=filteredRows();
  if(!rows.length){box.innerHTML='<div class="pmo2-empty">Выберите группу или введите минимум 2 символа для поиска.</div>';return;}
  const show=rows.slice(0,120);
  box.innerHTML=show.map(x=>{
    const has=selected.has(x.sku);
    return `<div class="pmo2-result"><div><div class="pmo2-name">${h(x.product_name)}</div><div class="pmo2-meta">${h(x.sku)} · ${h(x.category)}${x.subgroup?' → '+h(x.subgroup):''} · МО2 <b>${money(x.price_vat)} BYN</b></div></div><button type="button" class="pmo2-add" data-mo2-add="${encodeURIComponent(x.sku)}" ${has?'disabled':''}>${has?'Добавлено':'Добавить'}</button></div>`;
  }).join('')+(rows.length>show.length?`<div class="pmo2-empty">Показано ${show.length} из ${rows.length}. Уточните подгруппу или поиск.</div>`:'');
}

function snapshotFromPrice(x,discount=0){
  const d=Math.max(0,Math.min(100,n(discount)));
  return {category:x.category||null,subgroup:x.subgroup||null,sku:String(x.sku||'').trim(),product_name:x.product_name||null,base_price_vat:Math.round(n(x.price_vat)*100)/100,discount_pct:Math.round(d*100)/100,promo_price_vat:promoPrice(x.price_vat,d),price_source:'small_wholesale_2_vat',price_valid_from:x.valid_from||null};
}

function addSku(sku){
  const x=priceCache?.find(r=>String(r.sku)===String(sku)); if(!x)return;
  if(!selected.has(x.sku))selected.set(x.sku,snapshotFromPrice(x,0));
  renderSelected();renderResults();
}

function addWholeSubgroup(){
  if(!picker||!priceCache)return;
  const cat=picker.querySelector('#promotion-mo2-category').value;
  const sub=picker.querySelector('#promotion-mo2-subgroup').value;
  if(!cat||!sub)return;
  priceCache.filter(x=>x.category===cat&&(x.subgroup||'Без подгруппы')===sub).forEach(x=>{if(!selected.has(x.sku))selected.set(x.sku,snapshotFromPrice(x,0));});
  renderSelected();renderResults();
}

function applyBulkDiscount(){
  if(!picker)return;
  const raw=picker.querySelector('#promotion-mo2-bulk-discount').value;
  if(raw==='')return;
  const d=Math.max(0,Math.min(100,n(raw)));
  selected.forEach(item=>{item.discount_pct=Math.round(d*100)/100;item.promo_price_vat=promoPrice(item.base_price_vat,item.discount_pct);});
  renderSelected();
}

function renderSelected(){
  if(!picker)return;
  picker.querySelector('#promotion-mo2-count').textContent=`${selected.size} SKU`;
  const box=picker.querySelector('#promotion-mo2-selected');
  if(!selected.size){box.innerHTML='<div class="pmo2-empty">Товары пока не выбраны.</div>';return;}
  const rows=[...selected.values()].sort((x,y)=>(x.category||'').localeCompare(y.category||'','ru')||(x.subgroup||'').localeCompare(y.subgroup||'','ru')||(x.product_name||'').localeCompare(y.product_name||'','ru'));
  box.innerHTML=`<div class="pmo2-table-wrap"><table class="pmo2-table"><thead><tr><th>SKU / товар</th><th>МО2 с НДС</th><th>Скидка</th><th>Цена акции</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${h(x.sku)}</b><div style="font-size:10px;color:var(--sub);margin-top:2px">${h(x.product_name||'')}</div><div style="font-size:9px;color:var(--sub);margin-top:1px">${h(x.category||'')}${x.subgroup?' → '+h(x.subgroup):''}</div></td><td>${money(x.base_price_vat)} BYN</td><td><input class="pmo2-disc" type="number" min="0" max="100" step="0.01" value="${n(x.discount_pct)}" data-mo2-discount="${encodeURIComponent(x.sku)}"> %</td><td><b data-mo2-price="${a(x.sku)}">${money(x.promo_price_vat)}</b> BYN</td><td><button type="button" class="pmo2-remove" title="Убрать" data-mo2-remove="${encodeURIComponent(x.sku)}">×</button></td></tr>`).join('')}</tbody></table></div>`;
}

function setMode(mode,note=''){
  editorMode=mode;
  ensurePicker();
  if(!picker||!legacyCard)return;
  const noteEl=picker.querySelector('#promotion-mo2-note');
  if(mode==='structured'){
    picker.style.display='block'; legacyCard.style.display='none';
    noteEl.style.display=note?'block':'none'; noteEl.textContent=note||'';
  }else{
    picker.style.display='none'; legacyCard.style.display='block';
  }
}

async function configureEditor(id){
  const p=ensurePicker(); if(!p)return;
  selected=new Map();renderSelected();
  if(id){
    const {data,error}=await db.from('promotion_items').select('*').eq('promotion_id',id).order('created_at',{ascending:true});
    if(error){console.warn('promotion_items load',error);setMode('legacy');return;}
    if(!data?.length){setMode('legacy');return;}
    data.forEach(x=>selected.set(String(x.sku),{category:x.category||null,subgroup:x.subgroup||null,sku:String(x.sku),product_name:x.product_name||null,base_price_vat:n(x.base_price_vat),discount_pct:n(x.discount_pct),promo_price_vat:n(x.promo_price_vat),price_source:x.price_source||'small_wholesale_2_vat',price_valid_from:x.price_valid_from||null}));
    setMode('structured','Новая структура Акций 2.0. Сохранённые цены — снимок условий этой акции.');
  }else{
    setMode('structured');
  }
  try{
    await loadPrice(); fillCategories(); fillSubgroups(); renderResults(); renderSelected();
  }catch(e){
    console.error('MO2 price load',e);
    const box=picker.querySelector('#promotion-mo2-results');
    if(box)box.innerHTML='<div class="pmo2-empty" style="color:var(--r)">Не удалось загрузить Прайс МО2. Старые акции не затронуты.</div>';
  }
}

function syncLegacyExactSkus(){
  const cats=document.getElementById('promotion-categories');
  const subs=document.getElementById('promotion-subgroups');
  const skus=document.getElementById('promotion-skus');
  if(cats)cats.value='';
  if(subs)subs.value='';
  if(skus)skus.value=[...selected.keys()].join('\n');
}

function rowsForSave(){
  return [...selected.values()].map(x=>({category:x.category||null,subgroup:x.subgroup||null,sku:x.sku,product_name:x.product_name||null,base_price_vat:Math.round(n(x.base_price_vat)*100)/100,discount_pct:Math.round(n(x.discount_pct)*100)/100,promo_price_vat:promoPrice(x.base_price_vat,x.discount_pct),price_source:'small_wholesale_2_vat',price_valid_from:x.price_valid_from||null}));
}

async function resolveNewPromotionId(beforeIds,form){
  try{
    const added=(typeof allPromotions!=='undefined'?allPromotions:[]).filter(x=>x?.id&&!beforeIds.has(String(x.id)));
    if(added.length===1)return added[0].id;
    const exact=added.find(x=>String(x.client_id||'')===form.clientId&&String(x.title||'')===form.title&&String(x.start_date||'')===form.start&&String(x.end_date||'')===form.end);
    if(exact)return exact.id;
  }catch(_){}
  try{
    let q=db.from('promotions').select('id,created_at').eq('client_id',form.clientId).eq('start_date',form.start).eq('end_date',form.end);
    if(form.title)q=q.eq('title',form.title);
    const {data,error}=await q.order('created_at',{ascending:false}).limit(1);
    if(!error&&data?.[0]?.id)return data[0].id;
  }catch(_){}
  return null;
}

async function saveStructuredItems(promotionId){
  const rows=rowsForSave();
  const {data,error}=await db.rpc('promotion_items_replace_v1',{p_promotion_id:promotionId,p_rows:rows});
  if(error)throw error;
  return data;
}

function captureForm(){
  return {id:String(document.getElementById('promotion-id')?.value||''),clientId:String(document.getElementById('promotion-client')?.value||''),title:String(document.getElementById('promotion-title')?.value||'').trim(),start:String(document.getElementById('promotion-start')?.value||''),end:String(document.getElementById('promotion-end')?.value||'')};
}

function install(){
  if(installed)return;
  ensurePicker();
  if(typeof window.openPromotionEditor!=='function'||typeof window.savePromotion!=='function'){
    setTimeout(install,80);return;
  }
  oldOpenPromotionEditor=window.openPromotionEditor;
  oldSavePromotion=window.savePromotion;

  window.openPromotionEditor=function(id){
    const r=oldOpenPromotionEditor.apply(this,arguments);
    Promise.resolve(r).finally(()=>configureEditor(id||'')).catch(e=>console.warn('MO2 editor',e));
    return r;
  };

  window.savePromotion=async function(){
    if(editorMode!=='structured')return oldSavePromotion.apply(this,arguments);
    if(!selected.size){alert('Выберите хотя бы один товар из Прайс МО2.');return;}
    const form=captureForm();
    const beforeIds=new Set((typeof allPromotions!=='undefined'?allPromotions:[]).map(x=>String(x.id)));
    syncLegacyExactSkus();
    const result=await oldSavePromotion.apply(this,arguments);
    const modal=document.getElementById('modal-promotion-edit');
    if(modal?.classList.contains('open'))return result;

    let promotionId=form.id||await resolveNewPromotionId(beforeIds,form);
    if(!promotionId){
      alert('Акция сохранена, но не удалось определить её ID для записи цен МО2. Старое согласование работает; сообщите руководителю.');
      return result;
    }
    try{
      await saveStructuredItems(promotionId);
    }catch(e){
      console.error('promotion_items save',e);
      alert('Акция сохранена, но снимок товаров МО2 не записался: '+(e?.message||e)+'. Старая логика акции сохранена и не повреждена.');
    }
    return result;
  };

  installed=true;
  window.RESANTA_PROMOTION_MO2_V236123=Object.freeze({version:VERSION,structuredNewPromotions:true,legacyPromotionsPreserved:true,exactSkuCompatibility:true});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();