/* RESANTA CRM v23.6.154 · WAREHOUSE RECEIVING
 * Upload UПД -> expected shipment -> TSD receiving by SKU/barcode.
 * Access: Alexander Payushin manages; vitebsk/sidarovich receive.
 */
(function(){
'use strict';
if(window.RESANTA_WAREHOUSE_RECEIVING_V236154)return;
const V='v23.6.154';
let root=null,access=null,sessions=[],selectedId=null,summary=null,coverage=null,preview=null;
let mode='all',search='',offset=0,limit=100,busy=false;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number(v)||0;
const qty=v=>n(v).toLocaleString('ru-RU',{maximumFractionDigits:2});
function dbx(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
async function rpc(name,args={}){const d=dbx();if(!d)throw new Error('База ещё не готова');const {data,error}=await d.rpc(name,args);if(error)throw error;return data}
function stamp(v){if(!v)return'—';try{return new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Minsk',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(v)).replace(',','')}catch(_){return String(v)}}
function date(v){if(!v)return'—';try{return new Date(String(v)+'T00:00:00').toLocaleDateString('ru-RU')}catch(_){return String(v)}}
function css(){
 if($('wr-v236154-css'))return;
 const s=document.createElement('style');s.id='wr-v236154-css';s.textContent=`
#wr-v236154 .wr-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px}
#wr-v236154 .wr-card{background:#fff;border:1px solid var(--border);border-radius:11px;padding:14px;margin-bottom:12px}
#wr-v236154 .wr-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
#wr-v236154 .wr-kpis{display:grid;grid-template-columns:repeat(5,minmax(135px,1fr));gap:9px;margin-bottom:12px}
#wr-v236154 .wr-kpi{background:#fff;border:1px solid var(--border);border-radius:10px;padding:11px}
#wr-v236154 .wr-kpi small{display:block;font-size:10px;color:var(--sub);font-weight:700;text-transform:uppercase}
#wr-v236154 .wr-kpi b{display:block;font-size:20px;margin-top:4px}
#wr-v236154 .wr-muted{font-size:11px;color:var(--sub);line-height:1.45}
#wr-v236154 .wr-alert{padding:11px 13px;border-radius:9px;font-size:12px;line-height:1.5;margin-bottom:10px}
#wr-v236154 .blue{background:#EFF6FF;border:1px solid #BFDBFE;color:#1E3A8A}
#wr-v236154 .green{background:#ECFDF5;border:1px solid #A7F3D0;color:#166534}
#wr-v236154 .amber{background:#FFFBEB;border:1px solid #FDE68A;color:#92400E}
#wr-v236154 .red{background:#FEF2F2;border:1px solid #FECACA;color:#991B1B}
#wr-v236154 .wr-btn{padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer;font-weight:700}
#wr-v236154 .wr-btn.primary{background:var(--a);color:#fff;border-color:var(--a)}
#wr-v236154 .wr-btn.danger{color:#991B1B;border-color:#FCA5A5}
#wr-v236154 .wr-btn:disabled{opacity:.45;cursor:default}
#wr-v236154 .wr-tools{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
#wr-v236154 .wr-tools input{flex:1;min-width:180px;padding:9px 10px;border:1px solid var(--border);border-radius:8px}
#wr-v236154 .wr-filter.active{background:var(--ab);color:var(--at);border-color:#60A5FA}
#wr-v236154 .wr-table{overflow:auto;border:1px solid var(--border);border-radius:10px;background:#fff}
#wr-v236154 table{width:100%;border-collapse:collapse;min-width:850px}
#wr-v236154 th{background:#F8FAFC;color:var(--sub);font-size:11px;text-align:left;padding:8px;border-bottom:1px solid var(--border);white-space:nowrap}
#wr-v236154 td{font-size:12px;padding:8px;border-bottom:1px solid var(--border);vertical-align:top}
#wr-v236154 tr:last-child td{border-bottom:0}
#wr-v236154 .bad{color:#B91C1C;font-weight:800}.good{color:#166534;font-weight:800}.warn{color:#B45309;font-weight:800}
#wr-v236154 .wr-session{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--border);cursor:pointer}
#wr-v236154 .wr-session:first-child{border-top:0}.wr-session.active{background:#F8FAFC;margin:0 -8px;padding:10px 8px;border-radius:8px}
#wr-v236154 .wr-upload{border:2px dashed #BFDBFE;background:#F8FBFF;border-radius:12px;padding:18px}
#wr-v236154 .wr-upload input{width:100%;margin:8px 0}
@media(max-width:900px){#wr-v236154 .wr-grid{grid-template-columns:1fr}#wr-v236154 .wr-kpis{grid-template-columns:repeat(2,1fr)}}
@media(max-width:560px){#wr-v236154 .wr-kpis{grid-template-columns:1fr}}
`;document.head.appendChild(s)
}
function kpi(label,val,sub=''){return '<div class="wr-kpi"><small>'+esc(label)+'</small><b>'+esc(val)+'</b>'+(sub?'<div class="wr-muted">'+esc(sub)+'</div>':'')+'</div>'}
function statusText(s){return s==='draft'?'ожидает старта':s==='active'?'идёт приёмка':s==='completed'?'завершена':s==='cancelled'?'отменена':s}
function statusClass(s){return s==='active'?'green':s==='draft'?'blue':s==='completed'?'green':'red'}
async function loadAll(preferId=null){
 if(busy)return;busy=true;
 try{
  access=await rpc('warehouse_receiving_access_v1',{});
  sessions=await rpc('warehouse_receiving_list_v1',{p_limit:30})||[];
  if(preferId)selectedId=preferId;
  if(!selectedId||!sessions.some(x=>x.id===selectedId)){
   selectedId=(sessions.find(x=>x.status==='active')||sessions.find(x=>x.status==='draft')||sessions[0]||{}).id||null;
  }
  if(selectedId){
   summary=await rpc('warehouse_receiving_summary_v1',{p_session_id:selectedId,p_mode:mode,p_search:search,p_limit:limit,p_offset:offset});
   try{coverage=await rpc('warehouse_receiving_barcode_coverage_v1',{p_session_id:selectedId})}catch(_){coverage=null}
  }else{summary=null;coverage=null}
  render();
 }catch(e){if(root)root.innerHTML='<div class="wr-alert red"><b>Не удалось открыть приёмку.</b><br>'+esc(e?.message||e)+'</div>'}
 finally{busy=false}
}
function fileToBase64(file){
 return new Promise((resolve,reject)=>{
  const r=new FileReader();
  r.onerror=()=>reject(new Error('Не удалось прочитать файл'));
  r.onload=()=>{
   const a=new Uint8Array(r.result),chunk=0x8000;let bin='';
   for(let i=0;i<a.length;i+=chunk)bin+=String.fromCharCode.apply(null,a.subarray(i,Math.min(i+chunk,a.length)));
   resolve(btoa(bin));
  };
  r.readAsArrayBuffer(file);
 });
}
async function parseUpd(){
 const inp=$('wr-file'),file=inp?.files?.[0];if(!file)return alert('Выберите УПД .xls или .xlsx');
 const btn=$('wr-parse');btn.disabled=true;btn.textContent='Разбираю УПД…';
 try{
  const d=dbx();if(!d?.functions?.invoke)throw new Error('Модуль загрузки файлов ещё не готов');
  const base64=await fileToBase64(file);
  const {data,error}=await d.functions.invoke('warehouse-receiving-import-upd',{body:{filename:file.name,base64}});
  if(error)throw error;if(!data?.ok)throw new Error(data?.message||data?.error||'УПД не распознан');
  preview=data;render();
 }catch(e){alert('Не удалось разобрать УПД: '+(e?.message||e))}
 finally{if($('wr-parse')){$('wr-parse').disabled=false;$('wr-parse').textContent='Проверить УПД'}}
}
async function createReceipt(){
 if(!preview?.items?.length)return;
 if(!confirm('Создать приёмку по УПД '+(preview.document_no||'без номера')+'?\n\nSKU: '+preview.item_count+' · количество: '+qty(preview.total_qty)))return;
 const btn=$('wr-create');if(btn)btn.disabled=true;
 try{
  const r=await rpc('warehouse_receiving_create_v1',{
   p_document_no:preview.document_no||null,
   p_document_date:preview.document_date||null,
   p_filename:preview.filename||null,
   p_items:preview.items
  });
  if(!r?.ok)throw new Error(r?.reason||'Не удалось создать приёмку');
  preview=null;mode='all';search='';offset=0;await loadAll(r.session_id);
 }catch(e){alert('Не удалось создать приёмку: '+(e?.message||e))}
 finally{if(btn)btn.disabled=false}
}
async function startReceipt(){
 if(!summary?.session?.id)return;
 if(!confirm('Начать приёмку этой машины?\n\nПосле старта оба ТСД будут принимать товар именно по этому УПД.'))return;
 try{const r=await rpc('warehouse_receiving_start_v1',{p_session_id:summary.session.id});if(!r?.ok)throw new Error(r?.reason||'Не удалось начать');await loadAll(summary.session.id)}catch(e){alert('Ошибка старта: '+(e?.message||e))}
}
async function finishReceipt(){
 if(!summary?.session?.id)return;
 const k=summary.kpi||{};
 if(!confirm('Завершить приёмку?\n\nНедостача: '+String(k.short_sku_count||0)+' SKU · лишнее/перебор: '+String(k.extra_sku_count||0)+' SKU.\n\nВсе расхождения сохранятся в отчёте.'))return;
 try{const r=await rpc('warehouse_receiving_finish_v1',{p_session_id:summary.session.id,p_note:'Приёмка завершена из CRM'});if(!r?.ok)throw new Error(r?.reason||'Не удалось завершить');await loadAll(summary.session.id)}catch(e){alert('Ошибка завершения: '+(e?.message||e))}
}
async function cancelReceipt(){
 if(!summary?.session?.id)return;
 if(!confirm('Отменить эту приёмку? История сканов сохранится в отменённой сессии.'))return;
 try{const r=await rpc('warehouse_receiving_cancel_v1',{p_session_id:summary.session.id,p_note:'Приёмка отменена из CRM'});if(!r?.ok)throw new Error(r?.reason||'Не удалось отменить');await loadAll()}catch(e){alert('Ошибка отмены: '+(e?.message||e))}
}
function renderPreview(){
 if(!preview)return'';
 const rows=(preview.items||[]).slice(0,12).map(x=>'<tr><td><b>'+esc(x.sku)+'</b></td><td>'+esc(x.product||'')+'</td><td>'+qty(x.expected_qty)+'</td></tr>').join('');
 return '<div class="wr-card"><div class="wr-alert green"><b>УПД распознан.</b><br>Документ: '+esc(preview.document_no||'—')+' от '+esc(preview.document_date?date(preview.document_date):'—')+' · '+esc(preview.item_count)+' SKU · '+qty(preview.total_qty)+' шт.</div>'+
  '<div class="wr-table"><table style="min-width:650px"><thead><tr><th>Артикул</th><th>Товар</th><th>Количество</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
  ((preview.items||[]).length>12?'<div class="wr-muted" style="margin-top:6px">Показаны первые 12 позиций из '+preview.items.length+'.</div>':'')+
  '<button class="wr-btn primary" id="wr-create" style="margin-top:10px">Создать приёмку</button></div>';
}
function renderSessions(){
 if(!sessions.length)return'<div class="wr-muted">Загруженных УПД пока нет.</div>';
 return sessions.map(s=>'<div class="wr-session '+(s.id===selectedId?'active':'')+'" data-session="'+esc(s.id)+'"><div><b>'+
   esc(s.document_no||'УПД без номера')+'</b> · '+esc(date(s.document_date))+
   '<div class="wr-muted">'+esc(s.filename||'')+' · '+esc(s.expected_sku_count)+' SKU · '+qty(s.expected_qty)+' шт.</div></div>'+
   '<span class="tag '+(s.status==='active'?'tag-m':s.status==='draft'?'tag-v':s.status==='completed'?'tag-gray':'tag-r')+'">'+esc(statusText(s.status))+'</span></div>').join('');
}
function renderSummary(){
 if(!summary?.has_session)return'<div class="wr-card">Выберите УПД или загрузите новый.</div>';
 const s=summary.session,k=summary.kpi||{},rows=summary.rows||[];
 const body=rows.map(r=>{
  const diff=n(r.difference_qty),cls=diff<0?'bad':diff>0?'warn':'good';
  const state=!r.is_expected?'ЛИШНИЙ':diff<0?'НЕ ДОСТАЁТ':diff>0?'ПЕРЕБОР':'ГОТОВО';
  return '<tr><td><b>'+esc(r.sku)+'</b><div class="wr-muted">'+esc(r.product||'')+'</div></td><td>'+qty(r.expected_qty)+'</td><td><b>'+qty(r.received_qty)+'</b></td><td class="'+cls+'">'+(diff>0?'+':'')+qty(diff)+'</td><td class="'+cls+'">'+state+'</td><td>'+esc(stamp(r.last_received_at))+'</td><td>'+esc(r.last_actor_name||r.last_actor_email||'—')+'<div class="wr-muted">'+esc(r.last_device_label||'')+'</div></td></tr>'
 }).join('')||'<tr><td colspan="7" style="text-align:center;padding:18px;color:var(--sub)">Нет строк по фильтру.</td></tr>';
 const can=!!access?.can_manage;
 const cov=coverage||{};
 const covAlert=n(cov.missing_barcode_sku)>0
   ?'<div class="wr-alert amber"><b>Без штрихкода: '+esc(cov.missing_barcode_sku)+' SKU.</b> Их можно принять ручным вводом артикула на ТСД и при необходимости сразу привязать новый штрихкод.</div>'
   :'<div class="wr-alert green"><b>Штрихкоды готовы.</b> Для всех позиций УПД найден штрихкод в справочнике CRM.</div>';
 return '<div class="wr-head"><div><div style="font-size:17px;font-weight:800">📥 Приёмка '+esc(s.document_no||'УПД')+' <span class="tag '+(s.status==='active'?'tag-m':s.status==='draft'?'tag-v':'tag-gray')+'">'+esc(statusText(s.status))+'</span></div>'+
   '<div class="wr-muted">Документ: '+esc(date(s.document_date))+' · загружен: '+esc(stamp(s.created_at))+' · '+esc(s.filename||'')+'</div></div>'+
   '<div style="display:flex;gap:7px;flex-wrap:wrap"><button class="wr-btn" id="wr-refresh">↻ Обновить</button>'+
   (can&&s.status==='draft'?'<button class="wr-btn primary" id="wr-start">▶ Начать приёмку</button>':'')+
   (can&&s.status==='active'?'<button class="wr-btn primary" id="wr-finish">✓ Завершить</button><button class="wr-btn danger" id="wr-cancel">✕ Отменить</button>':'')+
   (can&&s.status==='draft'?'<button class="wr-btn danger" id="wr-cancel">✕ Отменить</button>':'')+'</div></div>'+
   covAlert+
   '<div class="wr-kpis">'+kpi('По УПД, SKU',s.expected_sku_count,'ожидаемые позиции')+kpi('По УПД, шт.',qty(s.expected_qty),'должно приехать')+kpi('Принято, шт.',qty(k.received_qty),'факт по ТСД')+kpi('Недостача',String(k.short_sku_count||0)+' SKU','ещё не добрали')+kpi('Лишнее / перебор',String(k.extra_sku_count||0)+' SKU','не в УПД или выше плана')+'</div>'+
   '<div class="wr-card"><div class="wr-tools"><button class="wr-btn wr-filter" data-mode="all">Все</button><button class="wr-btn wr-filter" data-mode="short">Недостача</button><button class="wr-btn wr-filter" data-mode="complete">Принято</button><button class="wr-btn wr-filter" data-mode="extra">Лишнее</button><button class="wr-btn wr-filter" data-mode="untouched">Не начинали</button><input id="wr-search" placeholder="Артикул или товар" value="'+esc(search)+'"><button class="wr-btn" id="wr-find">Найти</button></div>'+
   '<div class="wr-table"><table><thead><tr><th>Артикул / товар</th><th>По УПД</th><th>Принято</th><th>Разница</th><th>Статус</th><th>Последний скан</th><th>Кто / ТСД</th></tr></thead><tbody>'+body+'</tbody></table></div>'+
   '<div style="display:flex;justify-content:space-between;gap:8px;margin-top:8px"><span class="wr-muted">Показано '+rows.length+' из '+String(summary.total||0)+'</span><div><button class="wr-btn" id="wr-prev" '+(offset<=0?'disabled':'')+'>←</button> <button class="wr-btn" id="wr-next" '+(offset+limit>=n(summary.total)?'disabled':'')+'>→</button></div></div></div>'+
   '<div class="wr-card"><b>📱 ТСД для приёмки</b><div class="wr-muted" style="margin:6px 0 10px">На ТСД будет видно: сколько должно приехать по УПД, сколько уже принято двумя терминалами и сколько осталось. Повторный/лишний скан не блокируется — он помечается как перебор.</div><a class="wr-btn primary" href="./receiving.html" target="_blank" rel="noopener" style="display:inline-block;text-decoration:none">Открыть ТСД · Приёмка</a><div class="wr-muted" style="margin-top:7px">Доступ: Александр Паюшин, vitebsk@resanta.ru, sidarovich_kn@resanta.ru</div></div>';
}
function render(){
 if(!root)return;
 const can=!!access?.can_manage;
 root.innerHTML='<div class="wr-head"><div><div style="font-size:19px;font-weight:800">📥 Приёмка товара · Витебск</div><div class="wr-muted">УПД → артикулы → штрихкоды → приёмка двумя ТСД. Все сканы записываются с сотрудником и временем.</div></div></div>'+
   (can?'<div class="wr-card wr-upload"><b>Загрузить новый УПД</b><div class="wr-muted">Поддерживаются .xls и .xlsx. Система возьмёт артикул, товар и количество, затем свяжет их с нашим справочником штрихкодов.</div><input id="wr-file" type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"><button class="wr-btn primary" id="wr-parse">Проверить УПД</button></div>':'')+
   renderPreview()+
   '<div class="wr-grid"><div class="wr-card"><b>Документы приёмки</b><div style="margin-top:8px">'+renderSessions()+'</div></div><div><div id="wr-selected">'+renderSummary()+'</div></div></div>';
 if(can&&$('wr-parse'))$('wr-parse').onclick=parseUpd;
 if(preview&&$('wr-create'))$('wr-create').onclick=createReceipt;
 document.querySelectorAll('#wr-v236154 [data-session]').forEach(x=>x.onclick=async()=>{selectedId=x.dataset.session;mode='all';search='';offset=0;await loadAll(selectedId)});
 document.querySelectorAll('#wr-v236154 [data-mode]').forEach(x=>{x.classList.toggle('active',x.dataset.mode===mode);x.onclick=async()=>{mode=x.dataset.mode;offset=0;await loadAll(selectedId)}});
 if($('wr-refresh'))$('wr-refresh').onclick=()=>loadAll(selectedId);
 if($('wr-start'))$('wr-start').onclick=startReceipt;
 if($('wr-finish'))$('wr-finish').onclick=finishReceipt;
 if($('wr-cancel'))$('wr-cancel').onclick=cancelReceipt;
 if($('wr-find'))$('wr-find').onclick=()=>{search=$('wr-search').value.trim();offset=0;loadAll(selectedId)};
 if($('wr-search'))$('wr-search').onkeydown=e=>{if(e.key==='Enter')$('wr-find').click()};
 if($('wr-prev'))$('wr-prev').onclick=()=>{offset=Math.max(0,offset-limit);loadAll(selectedId)};
 if($('wr-next'))$('wr-next').onclick=()=>{offset+=limit;loadAll(selectedId)};
}
async function open(target){
 css();root=typeof target==='string'?document.querySelector(target):target;if(!root)return;
 root.innerHTML='<div id="wr-v236154"><div class="card">Загружаю приёмку…</div></div>';
 root=$('wr-v236154');await loadAll();
}
window.crmWarehouseReceivingV236154={open,refresh:loadAll};
window.RESANTA_WAREHOUSE_RECEIVING_V236154=Object.freeze({version:V,allowed:['payushin_ar@resanta.ru','vitebsk@resanta.ru','sidarovich_kn@resanta.ru'],manager:'payushin_ar@resanta.ru',barcodeReceiving:true,updUpload:true,twoTsd:true});
})();