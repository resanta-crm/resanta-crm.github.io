/* RESANTA CRM v23.6.139 · WAREHOUSE INVENTORY
 * Boss UI for physical inventory. Scanner lives in /inventory.html.
 * No direct table access: all reads/writes through protected RPCs.
 */
(function(){
'use strict';
if(window.RESANTA_WAREHOUSE_INVENTORY_V236139)return;
const V='v23.6.147';
let root=null,summary=null,refreshState=null,mode='all',search='',offset=0,limit=100,busy=false;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number(v)||0;
const qty=v=>n(v).toLocaleString('ru-RU',{maximumFractionDigits:2});
function dbx(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
async function rpc(name,args={}){const d=dbx();if(!d)throw new Error('База ещё не готова');const {data,error}=await d.rpc(name,args);if(error)throw error;return data}
function dateRu(v){if(!v)return'—';try{return new Date(String(v).length===10?String(v)+'T00:00:00':String(v)).toLocaleDateString('ru-RU',{timeZone:'Europe/Minsk'})}catch(_){return String(v)}}
function stampRu(v){if(!v)return'—';try{return new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Minsk',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(v)).replace(',','')}catch(_){return String(v)}}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function css(){
 if($('inventory-v236139-css'))return;
 const s=document.createElement('style');s.id='inventory-v236139-css';
 s.textContent='#wc-inventory-v236139 .iv-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px}#wc-inventory-v236139 .iv-kpis{display:grid;grid-template-columns:repeat(5,minmax(140px,1fr));gap:9px;margin-bottom:12px}#wc-inventory-v236139 .iv-kpi{border:1px solid var(--border);background:#fff;border-radius:10px;padding:11px}#wc-inventory-v236139 .iv-kpi small{display:block;font-size:10px;color:var(--sub);font-weight:700;text-transform:uppercase}#wc-inventory-v236139 .iv-kpi b{display:block;font-size:19px;margin-top:4px}.iv-tools{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.iv-tools input,.iv-tools select{padding:9px 10px;border:1px solid var(--border);border-radius:8px;background:#fff}.iv-tools input{flex:1;min-width:190px}.iv-btn{padding:9px 12px;border:1px solid var(--border);border-radius:8px;background:#fff;cursor:pointer;font-weight:700}.iv-btn.primary{background:var(--a);border-color:var(--a);color:#fff}.iv-btn.danger{color:#991B1B;border-color:#FCA5A5}.iv-filter.active{background:var(--ab);color:var(--at);border-color:#60A5FA}.iv-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:12px}.iv-card{background:#fff;border:1px solid var(--border);border-radius:11px;padding:13px}.iv-table{overflow:auto;border:1px solid var(--border);border-radius:10px}.iv-table table{width:100%;border-collapse:collapse;min-width:720px}.iv-table th{font-size:10px;color:var(--sub);background:#F8FAFC;padding:8px;text-align:left;border-bottom:1px solid var(--border);white-space:nowrap}.iv-table td{font-size:12px;padding:8px;border-bottom:1px solid var(--border)}.iv-diff-neg{color:#B91C1C;font-weight:800}.iv-diff-pos{color:#166534;font-weight:800}.iv-ok{color:#166534}.iv-muted{font-size:10px;color:var(--sub)}.iv-qr{display:block;width:180px;height:180px;max-width:100%;margin:8px auto;background:#fff}.iv-alert{padding:11px 13px;border-radius:9px;font-size:12px;line-height:1.5;margin-bottom:10px}.iv-blue{background:#EFF6FF;border:1px solid #BFDBFE;color:#1E3A8A}.iv-red{background:#FEF2F2;border:1px solid #FECACA;color:#991B1B}.iv-green{background:#ECFDF5;border:1px solid #A7F3D0;color:#166534}@media(max-width:900px){#wc-inventory-v236139 .iv-kpis{grid-template-columns:repeat(2,1fr)}.iv-grid{grid-template-columns:1fr}}@media(max-width:560px){#wc-inventory-v236139 .iv-kpis{grid-template-columns:1fr}}';
 document.head.appendChild(s);
}
function kpi(label,value,sub=''){return '<div class="iv-kpi"><small>'+esc(label)+'</small><b>'+esc(value)+'</b>'+(sub?'<div class="iv-muted">'+esc(sub)+'</div>':'')+'</div>'}
async function load(){
 if(busy)return;busy=true;
 try{
  summary=await rpc('warehouse_inventory_summary_v1',{p_session_id:null,p_mode:mode,p_search:search,p_limit:limit,p_offset:offset});
  if(!summary?.has_session){try{refreshState=await rpc('warehouse_inventory_refresh_status_v1',{})}catch(_){refreshState=null}}
  render()
 }
 catch(e){if(root)root.innerHTML='<div class="iv-alert iv-red"><b>Не удалось открыть инвентаризацию.</b><br>'+esc(e?.message||e)+'</div>'}
 finally{busy=false}
}
function refreshProgress(state){
 const r=state?.request||{},s=state?.stock||{};
 const st=r.status||'pending';
 const msg=r.message||'Проверяю самый свежий остаток Витебска…';
 if(root)root.innerHTML='<div class="iv-alert iv-blue"><b>↻ Перед стартом обновляю остаток отдельно от автозаказа.</b><br>'+esc(msg)+'</div>'+
  '<div class="iv-card" style="margin-bottom:10px"><b>Источник остатка</b><div style="font-size:12px;line-height:1.7;margin-top:7px">Отчёт 1С: <b>'+esc(stampRu(s.source_message_at))+'</b><br>Загружен в CRM: <b>'+esc(stampRu(s.imported_at))+'</b><br>Последняя проверка почты CRM: <b>'+esc(stampRu(s.checked_at))+'</b><br>Статус: <b>'+esc(st)+'</b></div></div>';
}
async function waitFreshStock(requestId){
 const deadline=Date.now()+600000;
 while(Date.now()<deadline){
  const state=await rpc('warehouse_inventory_refresh_status_v1',{});
  refreshState=state;refreshProgress(state);
  const r=state?.request||{};
  if(r.id===requestId&&r.status==='ready')return state;
  if(r.id===requestId&&r.status==='error')throw new Error(r.last_error||r.message||'Не удалось обновить остаток');
  await sleep(3000);
 }
 throw new Error('Проверка свежего остатка не завершилась за 10 минут. Текущий запрос сохранён — нажмите кнопку ещё раз, CRM продолжит с него.');
}
async function start(){
 if(!confirm('Начать новую инвентаризацию?\n\nСначала CRM отдельно от автозаказа проверит самый свежий остаток Витебска, покажет точное время до секунды и только потом зафиксирует снимок.'))return;
 let ok=false;busy=true;
 try{
  const req=await rpc('warehouse_inventory_refresh_request_v1',{});
  refreshState=req;refreshProgress(req);
  const requestId=req?.request?.id;
  if(!requestId)throw new Error('Не создан запрос обновления остатка');
  await waitFreshStock(requestId);
  const started=await rpc('warehouse_inventory_start_v1',{p_warehouse:'Витебск',p_note:'Инвентаризация из CRM после свежей проверки остатка'});
  if(started?.ok===false)throw new Error(started?.message||started?.reason||'Не удалось зафиксировать снимок');
  offset=0;mode='all';search='';ok=true;
 }catch(e){alert('Не удалось начать: '+(e?.message||e))}
 finally{busy=false}
 if(ok)await load();
}
async function finish(){
 const u=n(summary?.kpi?.uncounted_sku);
 if(u>0){alert('Нельзя завершить: ещё не пересчитано '+u+' SKU. Сначала откройте фильтр «Не пересчитано» и проверьте остаток.');return}
 if(!confirm('Завершить инвентаризацию?\n\nCRM зафиксирует итог. Остатки 1С автоматически НЕ изменяются.'))return;
 try{const r=await rpc('warehouse_inventory_finish_v1',{p_session_id:summary.session.id,p_note:'Завершено из CRM'});if(!r?.ok)throw new Error(r?.reason||'Не удалось завершить');await load()}catch(e){alert('Ошибка завершения: '+(e?.message||e))}
}
async function cancelSession(){
 if(!summary?.session?.id)return;
 if(!confirm('Отменить текущий пересчёт?\n\nИспользуйте это для тестовой или ошибочно запущенной инвентаризации. Результат будет помечен как отменённый и не попадёт в завершённые.'))return;
 try{
  const r=await rpc('warehouse_inventory_cancel_v1',{p_session_id:summary.session.id,p_note:'Пересчёт отменён руководителем из CRM'});
  if(!r?.ok)throw new Error(r?.reason||'Не удалось отменить');
  summary=null;offset=0;mode='all';search='';
  await load();
 }catch(e){alert('Ошибка отмены: '+(e?.message||e))}
}
async function ensureXlsx(){
 if(window.XLSX)return window.XLSX;
 await new Promise((resolve,reject)=>{
  const old=document.getElementById('iv-sheetjs');
  if(old){old.addEventListener('load',resolve,{once:true});old.addEventListener('error',()=>reject(new Error('Не загрузился модуль Excel')),{once:true});return}
  const s=document.createElement('script');s.id='iv-sheetjs';s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';s.onload=resolve;s.onerror=()=>reject(new Error('Не загрузился модуль Excel'));document.head.appendChild(s);
 });
 if(!window.XLSX)throw new Error('Модуль Excel недоступен');
 return window.XLSX;
}
async function exportExcel(){
 if(!summary?.session?.id)return alert('Нет активной инвентаризации');
 const btn=$('iv-export');if(btn)btn.disabled=true;
 try{
  const rows=[];let off=0;
  for(let i=0;i<20;i++){
   const d=await rpc('warehouse_inventory_summary_v1',{p_session_id:summary.session.id,p_mode:'all',p_search:'',p_limit:500,p_offset:off});
   const part=Array.isArray(d?.rows)?d.rows:[];
   rows.push(...part);off+=part.length;
   if(part.length<500||off>=n(d?.total))break;
  }
  const XLSX=await ensureXlsx();
  const data=rows.map(r=>({
   'Артикул':r.sku||'',
   'Товар':r.product||'',
   'Остаток 1С':n(r.system_qty_onhand),
   'Факт':r.last_counted_at?n(r.counted_qty):'',
   'Разница':r.last_counted_at?n(r.difference):'',
   'Статус':r.last_counted_at?'Пересчитано':'Не пересчитано',
   'Последний счёт':r.last_counted_at?stampRu(r.last_counted_at):''
  }));
  const ws=XLSX.utils.json_to_sheet(data);
  ws['!cols']=[{wch:18},{wch:55},{wch:13},{wch:10},{wch:10},{wch:18},{wch:22}];
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Инвентаризация');
  const d=new Date(),pad=x=>String(x).padStart(2,'0');
  const name='Инвентаризация_Витебск_'+d.getFullYear()+pad(d.getMonth()+1)+pad(d.getDate())+'_'+pad(d.getHours())+pad(d.getMinutes())+'.xlsx';
  XLSX.writeFile(wb,name);
 }catch(e){alert('Не удалось выгрузить Excel: '+(e?.message||e))}
 finally{if(btn)btn.disabled=false}
}

async function grant(){
 const sel=$('iv-access-user');if(!sel||!sel.value)return alert('Выберите сотрудника');
 try{await rpc('warehouse_inventory_set_access_v1',{p_email:sel.value,p_can_count:true,p_can_manage:false,p_active:true});alert('Доступ к ТСД выдан: '+sel.value);await renderAccess()}catch(e){alert('Не удалось выдать доступ: '+(e?.message||e))}
}
async function revoke(email){
 if(!confirm('Отключить доступ к инвентаризации для '+email+'?'))return;
 try{await rpc('warehouse_inventory_set_access_v1',{p_email:email,p_can_count:false,p_can_manage:false,p_active:false});await renderAccess()}catch(e){alert('Не удалось отключить: '+(e?.message||e))}
}
async function renderAccess(){
 const box=$('iv-access-list');if(!box)return;
 try{
  const rows=await rpc('warehouse_inventory_access_list_v1',{});
  box.innerHTML=(rows||[]).filter(x=>x.active&&x.can_count).map(x=>'<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-top:1px solid var(--border)"><span style="font-size:11px">'+esc(x.email)+'</span><button class="iv-btn" data-revoke="'+esc(x.email)+'" style="padding:4px 7px;font-size:10px">Отключить</button></div>').join('')||'<div class="iv-muted">Отдельные сотрудники пока не добавлены. Руководители имеют доступ автоматически.</div>';
  box.querySelectorAll('[data-revoke]').forEach(b=>b.onclick=()=>revoke(b.dataset.revoke));
 }catch(e){box.textContent='Не удалось загрузить доступы: '+(e?.message||e)}
}
function userOptions(){
 let arr=[];try{arr=typeof allUsers!=='undefined'&&Array.isArray(allUsers)?allUsers:[]}catch(_){}
 return arr.filter(u=>u&&u.email).map(u=>'<option value="'+esc(u.email)+'">'+esc((u.name||u.email)+' · '+u.email)+'</option>').join('');
}
function render(){
 if(!root)return;
 const has=!!summary?.has_session;
 if(!has){
  const st=refreshState?.stock||{};
  root.innerHTML='<div class="iv-alert iv-blue"><b>Инвентаризация сейчас не запущена.</b><br>Инвентаризация работает отдельно от автозаказа. При старте CRM сначала заново проверит почту 1С, затем зафиксирует самый свежий доступный остаток Витебска.</div>'+
  '<div class="iv-card" style="margin-bottom:10px"><b>Последний доступный остаток</b><div style="font-size:12px;line-height:1.7;margin-top:7px">Отчёт 1С: <b>'+esc(stampRu(st.source_message_at))+'</b><br>Загружен в CRM: <b>'+esc(stampRu(st.imported_at))+'</b><br>Проверен CRM: <b>'+esc(stampRu(st.checked_at))+'</b></div></div>'+
  '<button class="iv-btn primary" id="iv-start">↻ Обновить остаток и начать инвентаризацию</button><div style="margin-top:14px" class="iv-grid"><div class="iv-card"><b>Как работаем</b><div style="font-size:12px;line-height:1.65;margin-top:7px">1. Останавливаем движения по складу на время пересчёта.<br>2. Нажимаем «Обновить остаток и начать» — CRM отдельно проверяет свежий файл 1С и показывает время до секунды.<br>3. После проверки фиксируется контрольный снимок.<br>4. ТСД показывает остаток 1С и уже насчитанное количество, чтобы два терминала работали по одному общему факту.<br>5. После проверки завершаем. CRM сама 1С не корректирует.</div></div>'+scannerCard()+'</div>';
  $('iv-start').onclick=start;renderAccessSoon();return;
 }
 const s=summary.session,k=summary.kpi||{},rows=Array.isArray(summary.rows)?summary.rows:[];
 const status=s.status==='active'?'<span class="tag tag-m">идёт пересчёт</span>':'<span class="tag tag-gray">'+esc(s.status)+'</span>';
 const body=rows.map(r=>{
  const d=n(r.difference),dc=d<0?'iv-diff-neg':d>0?'iv-diff-pos':'iv-ok';
  return '<tr><td><b>'+esc(r.sku)+'</b><div class="iv-muted">'+esc(r.product||'')+'</div></td><td><b>'+qty(r.system_qty_onhand)+'</b></td><td><b>'+qty(r.counted_qty)+'</b></td><td class="'+dc+'">'+(r.last_counted_at?((d>0?'+':'')+qty(d)):'не считали')+'</td><td>'+esc(stampRu(r.last_counted_at))+'</td></tr>'
 }).join('')||'<tr><td colspan="5" style="text-align:center;padding:18px;color:var(--sub)">Нет строк по фильтру.</td></tr>';
 root.innerHTML='<div class="iv-head"><div><div style="font-size:15px;font-weight:800">📋 Инвентаризация Витебск '+status+'</div><div class="iv-muted">Отчёт 1С: '+esc(stampRu(s.stock_source_message_at))+' · проверен CRM: '+esc(stampRu(s.stock_checked_at))+' · старт пересчёта: '+esc(stampRu(s.started_at))+' · '+esc(s.started_by_name||'')+'</div><div class="iv-muted" style="margin-top:3px">Для инвентаризации используем только физическое наличие товара по 1С на момент старта. Резерв и отгрузки здесь не участвуют.</div></div><div style="display:flex;gap:7px;flex-wrap:wrap"><button class="iv-btn" id="iv-refresh">↻ Обновить</button><button class="iv-btn" id="iv-export">⬇ Excel</button>'+(s.status==='active'?'<button class="iv-btn danger" id="iv-cancel">✕ Отменить пересчёт</button><button class="iv-btn primary" id="iv-finish">✓ Завершить</button>':'')+'</div></div>'+
 '<div class="iv-kpis">'+kpi('SKU по снимку',String(s.stock_sku_count||0),'Контрольный снимок 1С')+kpi('Пересчитано SKU',String(k.counted_sku||0),'Осталось '+String(k.uncounted_sku||0))+kpi('Расхождений',String(k.diff_sku||0),'Только уже пересчитанные')+kpi('Учёт, шт.',qty(k.system_qty),'Снимок на старт')+kpi('Факт, шт.',qty(k.fact_qty),'Разница '+((n(k.difference_qty)>0?'+':'')+qty(k.difference_qty)))+'</div>'+
 '<div class="iv-grid"><div><div class="iv-tools"><button class="iv-btn iv-filter" data-mode="all">Все</button><button class="iv-btn iv-filter" data-mode="diff">Расхождения</button><button class="iv-btn iv-filter" data-mode="uncounted">Не пересчитано</button><button class="iv-btn iv-filter" data-mode="counted">Пересчитано</button><input id="iv-search" placeholder="Артикул или товар" value="'+esc(search)+'"><button class="iv-btn" id="iv-find">Найти</button></div><div class="iv-table"><table><thead><tr><th>Артикул / товар</th><th>Остаток 1С</th><th>Факт</th><th>Разница</th><th>Последний счёт</th></tr></thead><tbody>'+body+'</tbody></table></div><div style="display:flex;justify-content:space-between;gap:8px;margin-top:8px"><span class="iv-muted">Показано '+rows.length+' из '+String(summary.total||0)+'</span><div><button class="iv-btn" id="iv-prev" '+(offset<=0?'disabled':'')+'>←</button> <button class="iv-btn" id="iv-next" '+(offset+limit>=n(summary.total)?'disabled':'')+'>→</button></div></div></div>'+scannerCard()+'</div>';
 document.querySelectorAll('#wc-inventory-v236139 [data-mode]').forEach(b=>{b.classList.toggle('active',b.dataset.mode===mode);b.onclick=()=>{mode=b.dataset.mode;offset=0;load()}});
 $('iv-refresh').onclick=load;if($('iv-export'))$('iv-export').onclick=exportExcel;if($('iv-cancel'))$('iv-cancel').onclick=cancelSession;if($('iv-finish'))$('iv-finish').onclick=finish;
 $('iv-find').onclick=()=>{search=$('iv-search').value.trim();offset=0;load()};$('iv-search').onkeydown=e=>{if(e.key==='Enter')$('iv-find').click()};
 $('iv-prev').onclick=()=>{offset=Math.max(0,offset-limit);load()};$('iv-next').onclick=()=>{offset+=limit;load()};
 renderAccessSoon();
}
function scannerCard(){
 return '<div class="iv-card"><div style="font-weight:800;margin-bottom:6px">📱 ТСД · Resanta Склад</div><div class="iv-muted">Оба ТСД работают с одной инвентаризацией. После каждого скана они видят остаток 1С и общий уже насчитанный факт; если факт выше учёта, ТСД покажет предупреждение.</div><img class="iv-qr" src="./inventory-qr.svg" alt="QR для ТСД"><div style="display:grid;gap:7px"><a class="iv-btn primary" style="text-align:center;text-decoration:none" href="./inventory.html" target="_blank" rel="noopener">Открыть приложение ТСД</a><div style="font-size:10px;color:var(--sub);word-break:break-all;text-align:center">https://resanta-crm.by/inventory.html</div></div><hr style="border:0;border-top:1px solid var(--border);margin:13px 0"><div class="iv-alert iv-green" style="margin:10px 0"><b>ТСД:</b> вход под <b>vitebsk@resanta.ru</b>. Ваша личная учётка CRM остаётся отдельно на компьютере.</div><div style="font-weight:700;font-size:12px;margin-bottom:6px">Кому разрешён пересчёт</div><div style="display:flex;gap:6px"><select id="iv-access-user" style="min-width:0;flex:1;padding:8px;border:1px solid var(--border);border-radius:8px"><option value="">Выберите сотрудника…</option>'+userOptions()+'</select><button class="iv-btn" id="iv-grant">Разрешить</button></div><div id="iv-access-list" style="margin-top:8px"></div></div>'
}
function renderAccessSoon(){setTimeout(()=>{const b=$('iv-grant');if(b)b.onclick=grant;renderAccess()},20)}
async function open(target){
 css();root=typeof target==='string'?document.querySelector(target):target;if(!root)return;
 root.innerHTML='<div id="wc-inventory-v236139"><div class="card">Загружаю инвентаризацию…</div></div>';
 root=$('wc-inventory-v236139');await load();
}
window.crmWarehouseInventoryV236139={open,refresh:load};
window.RESANTA_WAREHOUSE_INVENTORY_V236139=Object.freeze({version:V,blindScanner:false,serverRpcOnly:true,noDirectTables:true,noPublicDataFiles:true,showsSystemStockOnTsd:true,excelExport:true,cancellableRun:true});
})();