/* RESANTA CRM v23.6.177 · Orders: isolated office invoice import.
 * Warehouse never receives prices, totals, VAT, UNP or the original Excel.
 * Phase 2 intentionally creates PRIVATE DRAFT only: no TSD dispatch or Telegram yet.
 */
(function(){
'use strict';
if(window.crmWarehouseOrdersV1)return;
const V='v23.6.177',BUCKET='warehouse-order-sources-v1';
let mount=null,role=null,orders=[],preview=null,selected=null,selectedFinance=null,working=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>(Number(v)||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const n=v=>{const s=String(v??'').replace(/[\s\u00a0]/g,'').replace(',','.').replace(/BYN/ig,'');return s===''?NaN:Number(s)};
const round2=v=>Math.round((v+Number.EPSILON)*100)/100;
const dbx=()=>{try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}};
async function rpc(fn,args={}){const d=dbx();if(!d)throw Error('Нет соединения с CRM');const {data,error}=await d.rpc(fn,args);if(error)throw error;return data}
const $=id=>mount?.querySelector('#'+id);
const statusText=x=>({'draft':'Загружен · склад ещё не уведомлён','waiting_pick':'Ожидает сборки','picking':'В сборке','shortage':'Недостача','ready':'Готов к отгрузке','realized':'Реализован','shipped':'Отгружен','cancelled':'Отменён'})[x]||x||'—';
function css(){
 if(document.getElementById('wp1-css'))return;
 const s=document.createElement('style');s.id='wp1-css';
 s.textContent='#wp1 .wp1-box{background:#fff;border:1px solid #dbe3ec;border-radius:11px;padding:13px;margin:10px 0}#wp1 .wp1-head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}#wp1 .wp1-mut{font-size:12px;color:#64748b;line-height:1.5}#wp1 .wp1-error{color:#9f1239;background:#fff1f2;border:1px solid #fecdd3;padding:10px;border-radius:8px}#wp1 .wp1-good{color:#166534;background:#f0fdf4;border:1px solid #bbf7d0;padding:10px;border-radius:8px}#wp1 button{border:1px solid #cbd5e1;border-radius:8px;background:white;padding:8px 12px;cursor:pointer}#wp1 button.wp1-primary{background:#185fa5;color:white;border-color:#185fa5;font-weight:700}#wp1 button:disabled{opacity:.5;cursor:default}#wp1 .wp1-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}#wp1 .wp1-table{overflow-x:auto}#wp1 table{border-collapse:collapse;width:100%;font-size:12px}#wp1 th,#wp1 td{text-align:left;padding:9px;border-bottom:1px solid #e2e8f0}#wp1 th{background:#f8fafc}#wp1 .wp1-list button{width:100%;text-align:left;margin:4px 0}#wp1 .wp1-list button.active{background:#eff6ff;border-color:#60a5fa}#wp1 input[type=file]{max-width:100%}#wp1 .wp1-finance{background:#fffbeb;border:1px solid #fcd34d;padding:10px;border-radius:8px}';
 document.head.appendChild(s);
}
function dateParts(txt){
 const months={'января':'01','февраля':'02','марта':'03','апреля':'04','мая':'05','июня':'06','июля':'07','августа':'08','сентября':'09','октября':'10','ноября':'11','декабря':'12'};
 const m=String(txt).match(/(?:сч[её]т\s+на\s+оплату)\s*№\s*([^\s]+)\s+от\s+(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
 if(!m||!months[m[3].toLowerCase()])throw Error('Не удалось прочитать номер/дату счёта. Поддерживается формат приложенного образца.');
 return{number:m[1],date:m[4]+'-'+months[m[3].toLowerCase()]+'-'+m[2].padStart(2,'0')};
}
function parseInvoice(grid){
 const title=grid.flatMap(r=>(r||[]).slice(0,4)).map(x=>String(x||'')).find(x=>/сч[её]т\s+на\s+оплату\s*№/i.test(x));
 const doc=dateParts(title);
 const customerRow=grid.find(r=>String(r?.[1]||'').trim().toLowerCase().startsWith('покупатель'));
 const buyer=String(customerRow?.[5]||'').trim();
 const customer=buyer.split(/,\s*УНП\b/i)[0].trim();
 const unp=buyer.match(/\bУНП\s*(\d{8,12})\b/i)?.[1]||'';
 if(!customer)throw Error('Покупатель не найден в строке счёта.');
 const h=grid.findIndex(r=>String(r?.[3]||'').includes('Артикул')&&String(r?.[78]||'').includes('Штрихкод'));
 if(h<0)throw Error('Не найдена таблица счёта (Артикул / Штрихкод). Нужен согласованный формат.');
 const items=[];
 for(let i=h+1;i<grid.length;i++){
  const r=grid[i]||[];
  const rowLabel=String(r[1]||'').trim();
  if(!/^\d+$/.test(rowLabel))continue;
  const sku=String(r[3]||'').trim(),product=String(r[6]||'').trim();
  const qty=n(r[16]),net_amount=n(r[36]),vat_amount=n(r[54]),total_with_vat=n(r[64]);
  const barcode=String(r[78]||'').replace(/[\s\u00a0]/g,'').trim();
  const unit=String(r[22]||'шт').trim()||'шт';
  const vat_rate=n(String(r[47]||'').replace('%',''));
  if(!sku||!product||!/^(\d{7,30})$/.test(barcode)
     ||![qty,net_amount,vat_amount,total_with_vat,vat_rate].every(Number.isFinite)
     ||qty<=0||total_with_vat<=0||Math.abs(round2(net_amount+vat_amount)-round2(total_with_vat))>.011
     ||vat_rate!==20)throw Error('Ошибка в товарной строке №'+rowLabel+'. Проверьте количество, штрихкод, цену и НДС.');
  items.push({line_no:items.length+1,sku,product,barcode,qty,unit,net_amount:round2(net_amount),vat_amount:round2(vat_amount),total_with_vat:round2(total_with_vat)});
 }
 if(!items.length||items.length>300)throw Error('Счёт не содержит допустимого количества товарных позиций (1–300).');
 const footer=grid.find(r=>(r||[]).some(x=>String(x||'').includes('Итого с НДС:')));
 const footerTotal=n(footer?.[64]);
 const vatLine=grid.flatMap(r=>(r||[]).slice(0,3)).map(x=>String(x||'')).find(x=>/Сумма НДС:/i.test(x));
 const vatMatch=vatLine?.match(/Сумма НДС:\s*([\d\s.,]+)/i);
 const footerVat=vatMatch?n(vatMatch[1]):NaN;
 const lineTotal=round2(items.reduce((s,r)=>s+r.total_with_vat,0));
 const lineVat=round2(items.reduce((s,r)=>s+r.vat_amount,0));
 if(!Number.isFinite(footerTotal)||!Number.isFinite(footerVat)||Math.abs(lineTotal-footerTotal)>.011||Math.abs(lineVat-footerVat)>.011)
   throw Error('Суммы позиций не совпадают с ИТОГО и Суммой НДС счёта. Импорт заблокирован.');
 return {document_no:doc.number,document_date:doc.date,customer_display:customer,buyer_unp:unp,items,total:lineTotal,vat:lineVat};
}
async function sheetjs(){
 if(window.XLSX)return window.XLSX;
 if(typeof window._loadSheetJS==='function')return window._loadSheetJS();
 return new Promise((ok,no)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=()=>window.XLSX?ok(window.XLSX):no(Error('Модуль Excel не загрузился'));s.onerror=()=>no(Error('Не удалось открыть библиотеку Excel'));document.head.appendChild(s)});
}
async function hashHex(buf){
 const b=await crypto.subtle.digest('SHA-256',buf);
 return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function readPreview(){
 const input=$('wp1-file'),file=input?.files?.[0];if(!file)throw Error('Выберите Excel-файл счёта.');
 if(!/\.xlsx$/i.test(file.name)||file.size<100||file.size>10*1024*1024)throw Error('Принимается .xlsx до 10 МБ.');
 const buf=await file.arrayBuffer(),sha=await hashHex(buf),X=await sheetjs(),book=X.read(buf,{type:'array'});
 if(!book.SheetNames?.length)throw Error('Excel не содержит листа');
 const sheet=X.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1,raw:false,defval:'',blankrows:false});
 const parsed=parseInvoice(sheet);
 const dupe=await rpc('warehouse_pick_duplicate_check_v1',{p_document_no:parsed.document_no,p_document_date:parsed.document_date,p_original_sha256:sha});
 if(dupe?.duplicate)throw Error('Такой счёт уже зарегистрирован (ID '+dupe.order_id+'). Повторный заказ не создан.');
 preview={...parsed,file,sha};render();
}
async function confirmImport(){
 if(!preview||working)return;
 if(!confirm('Создать ЗАКРЫТЫЙ черновик счёта №'+preview.document_no+'?\nНа склад пока НЕ передаётся, Telegram НЕ отправляется.'))return;
 const d=dbx(),{data:{user}={},error:e}=await d.auth.getUser();if(e||!user?.id)throw Error('Авторизация истекла.');
 if(!crypto?.randomUUID)throw Error('Не удалось создать ID оригинала.');
 working=true;render();
 try{
  const dupe=await rpc('warehouse_pick_duplicate_check_v1',{p_document_no:preview.document_no,p_document_date:preview.document_date,p_original_sha256:preview.sha});
  if(dupe?.duplicate)throw Error('Счёт уже был загружен. ID '+dupe.order_id);
  const path=user.id+'/'+crypto.randomUUID()+'.xlsx';
  const uploaded=await d.storage.from(BUCKET).upload(path,preview.file,{contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',upsert:false,cacheControl:'0'});
  if(uploaded.error)throw Error('Оригинал не загружен в закрытое хранилище: '+uploaded.error.message);
  const created=await rpc('warehouse_pick_create_draft_v1',{
    p_document_no:preview.document_no,p_document_date:preview.document_date,
    p_customer_display:preview.customer_display,p_buyer_unp:preview.buyer_unp,
    p_original_path:path,p_original_sha256:preview.sha,p_report_total:preview.total,
    p_report_vat:preview.vat,p_items:preview.items
  });
  if(!created?.ok)throw Error('Не удалось создать заказ.');
  preview=null;selected=null;selectedFinance=null;
  await loadList(created.order_id);
  alert('Закрытый черновик счёта создан. На склад НЕ передан. Передачу и Telegram добавим отдельным этапом.');
 }finally{working=false;render();}
}
async function loadList(prefer=null){
 const x=await rpc('warehouse_pick_list_v1',{p_limit:60,p_offset:0});
 role=x?.role||null;orders=Array.isArray(x?.rows)?x.rows:[];
 if(prefer)await openOrder(prefer);
 else if(!selected&&orders.length)await openOrder(orders[0].id);
 else render();
}
async function openOrder(id){
 selected=await rpc('warehouse_pick_detail_v1',{p_order_id:id});
 selectedFinance=null;
 if(['office','supervisor'].includes(role))selectedFinance=await rpc('warehouse_pick_finance_v1',{p_order_id:id});
 render();
}
function render(){
 if(!mount)return;
 const finAllowed=['office','supervisor'].includes(role);
 const upload=finAllowed?'<section class="wp1-box"><h3>🔒 Загрузка счёта офис-менеджером</h3><p class="wp1-mut">Оригинал и финансы сохраняются в закрытой части. Склад их не видит. Сейчас создаётся только черновик — без запуска сборки.</p><input id="wp1-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"> <button id="wp1-check" type="button" '+(working?'disabled':'')+'>Проверить счёт</button></section>':'';
 const pr=preview&&finAllowed?'<section class="wp1-box"><div class="wp1-finance"><b>Предпросмотр для ОМ / руководителя</b><br>Счёт №'+esc(preview.document_no)+' от '+esc(preview.document_date)+' · '+esc(preview.customer_display)+'<br>УНП: '+esc(preview.buyer_unp||'—')+' · Итого с НДС: <b>'+money(preview.total)+'</b> · НДС: '+money(preview.vat)+'</div><div class="wp1-table"><table><thead><tr><th>Артикул / Штрихкод</th><th>Товар</th><th>Кол.</th><th>Всего с НДС</th></tr></thead><tbody>'+preview.items.map(x=>'<tr><td>'+esc(x.sku)+'<br>'+esc(x.barcode)+'</td><td>'+esc(x.product)+'</td><td>'+esc(x.qty)+'</td><td>'+money(x.total_with_vat)+'</td></tr>').join('')+'</tbody></table></div><button type="button" class="wp1-primary" id="wp1-confirm" '+(working?'disabled':'')+'>Создать закрытый черновик</button></section>':'';
 const list='<section class="wp1-box"><h3>Заказы</h3><div class="wp1-list">'+(orders.length?orders.map(x=>'<button data-wp1-id="'+esc(x.id)+'" type="button" class="'+(selected?.id===x.id?'active':'')+'"><b>№'+esc(x.document_no)+'</b> · '+esc(x.document_date)+' · '+esc(x.customer_display)+'<br><span class="wp1-mut">'+esc(statusText(x.status))+' · '+esc(x.line_count)+' поз. / '+esc(x.total_qty)+' шт.</span></button>').join(''):'<div class="wp1-mut">Заказов пока нет.</div>')+'</div></section>';
 let detail='';
 if(selected){
  let f='';
  if(finAllowed&&selectedFinance)f='<div class="wp1-finance">🔒 Только ОМ и руководитель · УНП '+esc(selectedFinance.buyer_unp||'—')+' · Сумма с НДС '+money(selectedFinance.total_with_vat)+' · НДС '+money(selectedFinance.vat_total)+'</div>';
  detail='<section class="wp1-box"><h3>Счёт №'+esc(selected.document_no)+' · '+esc(statusText(selected.status))+'</h3>'+f+'<div class="wp1-table"><table><thead><tr><th>Артикул / Штрихкод</th><th>Товар</th><th>Нужно</th><th>Собрано</th></tr></thead><tbody>'+(selected.items||[]).map(x=>'<tr><td>'+esc(x.sku)+'<br>'+esc(x.barcode)+'</td><td>'+esc(x.product)+'</td><td>'+esc(x.expected_qty)+'</td><td>'+esc(x.picked_qty)+'</td></tr>').join('')+'</tbody></table></div><p class="wp1-mut">Этап 2: только защищённая загрузка. Запуск сборки, ТСД и Telegram подключаются после следующей проверки.</p></section>';
 }
 mount.innerHTML='<div id="wp1"><div class="wp1-head"><div><h3>📦 Заказы · защищённый контур</h3><div class="wp1-mut">Склад не получает цены, НДС, суммы, УНП или оригинальный Excel.</div></div><button type="button" id="wp1-refresh">↻ Обновить</button></div>'+upload+pr+'<div class="wp1-grid">'+list+detail+'</div></div>';
 mount.querySelector('#wp1-refresh')?.addEventListener('click',()=>loadList().catch(showError));
 mount.querySelector('#wp1-check')?.addEventListener('click',()=>readPreview().catch(showError));
 mount.querySelector('#wp1-confirm')?.addEventListener('click',()=>confirmImport().catch(showError));
 mount.querySelectorAll('[data-wp1-id]').forEach(b=>b.addEventListener('click',()=>openOrder(b.dataset.wp1Id).catch(showError)));
}
function showError(e){alert('Заказы: '+String(e?.message||e));}
async function open(target){
 css();mount=typeof target==='string'?document.querySelector(target):target;
 if(!mount)return;
 mount.innerHTML='<div class="wp1-box">Проверяю доступ к разделу «Заказы»…</div>';
 try{
   const r=await rpc('warehouse_pick_list_v1',{p_limit:60,p_offset:0});
   role=r.role;orders=r.rows||[];selected=null;selectedFinance=null;preview=null;
   if(orders.length)await openOrder(orders[0].id);else render();
 }catch(e){mount.innerHTML='<div class="wp1-error">Нет доступа к разделу «Заказы» или не удалось связаться с сервером. '+esc(e.message||e)+'</div>'}
}
window.crmWarehouseOrdersV1={open,refresh:loadList};
window.RESANTA_WAREHOUSE_ORDERS_V1=Object.freeze({version:V,privateInvoicePreview:true,financeIsolated:true,draftOnly:true});
})();