/* RESANTA CRM v23.6.185 · Orders: isolated office invoice import.
 * Warehouse never receives prices, totals, VAT, UNP or the original Excel.
 * Phase 2 intentionally creates PRIVATE DRAFT only: no TSD dispatch or Telegram yet.
 */
(function(){
'use strict';
if(window.crmWarehouseOrdersV1)return;
const V='v23.6.185',BUCKET='warehouse-order-sources-v1';
let mount=null,role=null,orders=[],preview=null,selected=null,selectedFinance=null,working=false,checking=false,selectedFile=null,uploadStatus='',uploadStatusKind='mut';
let devices=[],devicesError='',pairing=null,notificationStatus=null,busyAction=false,actionMessage='',actionTone='mut';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>(Number(v)||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const n=v=>{const s=String(v??'').replace(/[\s\u00a0]/g,'').replace(',','.').replace(/BYN/ig,'');return s===''?NaN:Number(s)};
const round2=v=>Math.round((v+Number.EPSILON)*100)/100;
const dbx=()=>{try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}};
async function rpc(fn,args={}){const d=dbx();if(!d)throw Error('Нет соединения с CRM');const {data,error}=await d.rpc(fn,args);if(error)throw error;return data}
const $=id=>mount?.querySelector('#'+id);
const statusText=x=>({'draft':'Загружен · склад ещё не уведомлён','device_setup_pending':'Назначен ТСД · требуется подключение терминала','waiting_pick':'Ожидает сборки в ТСД','picking':'В сборке','shortage':'Недостача','ready':'Готов к отгрузке','realized':'Реализован','shipped':'Отгружен','cancelled':'Отменён'})[x]||x||'—';
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
function findBuyerText(grid){
 // The supplier and buyer can be in merged cells. Locate the label in the
 // header, then read the first actual value to its right, regardless of column.
 const matches=[];
 for(const row of grid.slice(0,Math.min(grid.length,80))){
   if(!Array.isArray(row))continue;
   for(let j=0;j<row.length;j++){
     const label=String(row[j]??'').replace(/\s+/g,' ').trim();
     const m=/^покупатель\s*(?::\s*(.*))?$/i.exec(label);
     if(!m)continue;
     let value=String(m[1]||'').trim();
     if(!value){
       for(let k=j+1;k<row.length;k++){
         const candidate=String(row[k]??'').trim();
         if(candidate){value=candidate;break}
       }
     }
     if(value)matches.push(value);
   }
 }
 const unique=[...new Set(matches)];
 if(unique.length!==1)throw Error(unique.length?'В шапке обнаружено несколько разных покупателей. Проверьте исходный Excel.':'Покупатель не найден: проверьте строку «Покупатель» и соседнюю ячейку с названием организации.');
 return unique[0];
}
function absoluteInvoiceGrid(X,sheet){
 // SheetJS may expose a sheet range starting at B1 rather than A1. Explicitly
 // rebuild it from A1 so index 1 always means B, 5 means F and 78 means CA.
 const cells=Object.keys(sheet||{}).filter(k=>/^[A-Z]{1,3}[1-9]\d{0,6}$/i.test(k));
 if(!cells.length)throw Error('Excel не содержит заполненных ячеек счёта.');
 let maxR=0,maxC=0;
 for(const addr of cells){
   const p=X.utils.decode_cell(addr);
   if(p.r>2000||p.c>180)throw Error('Лист счёта слишком велик для безопасной проверки.');
   maxR=Math.max(maxR,p.r);maxC=Math.max(maxC,p.c);
 }
 const absRange=X.utils.encode_range({s:{r:0,c:0},e:{r:maxR,c:maxC}});
 return X.utils.sheet_to_json(sheet,{
   header:1,raw:true,defval:'',blankrows:true,range:absRange
 });
}
function parseInvoice(grid){
 const title=grid.flatMap(r=>(r||[]).slice(0,4)).map(x=>String(x||'')).find(x=>/сч[её]т\s+на\s+оплату\s*№/i.test(x));
 const doc=dateParts(title);
 const buyer=findBuyerText(grid);
 const customer=buyer.split(/[,;]?\s*(?:УНП|ИНН)\s*[:№]?\s*\d{8,12}\b/i)[0].replace(/[,;\s]+$/g,'').trim();
 const unp=buyer.match(/(?:^|[,;\s])УНП\s*[:№]?\s*(\d{8,12})\b/i)?.[1]||'';
 if(!customer||/\b(?:УНП|ИНН)\b/i.test(customer)||/\d{9,12}/.test(customer))
   throw Error('Не удалось безопасно отделить название покупателя от УНП. Счёт не сохранён.');
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
function status(message,kind='mut'){
 uploadStatus=String(message||'');uploadStatusKind=kind;
 const box=$('wp1-upload-status');if(box){
   box.className=kind==='error'?'wp1-error':kind==='ok'?'wp1-good':'wp1-mut';
   box.textContent=uploadStatus;box.style.display=uploadStatus?'block':'none';
 }
 const btn=$('wp1-check');
 if(btn){btn.disabled=checking||working;btn.textContent=checking?'Проверяю…':'Проверить счёт';}
}
async function loadSheetSource(url,waitMs){
 return await new Promise((resolve,reject)=>{
  if(window.XLSX)return resolve(window.XLSX);
  const s=document.createElement('script');let settled=false;
  const finish=(err)=>{if(settled)return;settled=true;clearTimeout(timer);
    s.onload=null;s.onerror=null;
    if(err)reject(err);else if(window.XLSX)resolve(window.XLSX);
    else reject(Error('Библиотека Excel не инициализировалась'));
  };
  const timer=setTimeout(()=>{s.remove();finish(Error('Истекло время загрузки библиотеки Excel'));},waitMs);
  s.src=url;s.async=true;s.crossOrigin='anonymous';
  s.onload=()=>finish(null);s.onerror=()=>finish(Error('Сервер библиотеки Excel недоступен'));
  document.head.appendChild(s);
 });
}
async function sheetjs(){
 if(window.XLSX)return window.XLSX;
 const sources=[
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
 ];
 for(let i=0;i<sources.length;i++){
   if(window.XLSX)return window.XLSX;
   status(i?'Первый источник Excel недоступен. Пробую резервный…':'Загружаю модуль чтения Excel…');
   try{return await loadSheetSource(sources[i],8000)}catch(e){
      if(window.XLSX)return window.XLSX;
      if(i===sources.length-1)throw Error('Не удалось загрузить модуль Excel. Проверьте доступ к CDN или передайте скрин руководителю. '+String(e.message||e));
   }
 }
 throw Error('Не удалось запустить модуль Excel');
}
async function hashHex(buf){
 if(!window.crypto?.subtle)throw Error('Браузер не поддерживает безопасную проверку документа SHA-256. Откройте CRM по HTTPS.');
 const b=await crypto.subtle.digest('SHA-256',buf);
 return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function readPreview(file=selectedFile||$('wp1-file')?.files?.[0]){
 if(checking||working)return;
 if(!file){status('Сначала выберите Excel-файл счёта.','error');return;}
 selectedFile=file;preview=null;checking=true;
 status('Читаю выбранный файл '+file.name+'…');
 try{
  if(!/\.xlsx$/i.test(file.name)||file.size<100||file.size>10*1024*1024)
    throw Error('Нужен счёт в формате .xlsx размером до 10 МБ.');
  const buf=await file.arrayBuffer();
  status('Проверяю контрольную сумму оригинала…');
  const sha=await hashHex(buf);
  const X=await sheetjs();
  status('Разбираю номер счёта, товары, количество и суммы…');
  await new Promise(resolve=>requestAnimationFrame(resolve));
  const book=X.read(buf,{type:'array'});
  if(!book.SheetNames?.length)throw Error('Excel не содержит листа');
  const grid=absoluteInvoiceGrid(X,book.Sheets[book.SheetNames[0]]);
  const parsed=parseInvoice(grid);
  status('Проверяю, не загружен ли этот счёт ранее…');
  const dupe=await bounded(rpc('warehouse_pick_duplicate_check_v1',{
    p_document_no:parsed.document_no,p_document_date:parsed.document_date,p_original_sha256:sha
  }),15000,'Проверка дубля на сервере заняла более 15 секунд. Повторите проверку файла.');
  if(dupe?.duplicate)throw Error('Этот счёт уже зарегистрирован (ID '+dupe.order_id+'). Повторная запись не создаётся.');
  preview={...parsed,file,sha};
  uploadStatus='Счёт №'+parsed.document_no+' проверен: '+parsed.items.length+' позиций, '+parsed.items.reduce((s,x)=>s+x.qty,0)+' шт. Проверьте предпросмотр и подтвердите черновик.';
  uploadStatusKind='ok';
 }catch(e){
  preview=null;uploadStatus='Проверка счёта не завершена: '+String(e?.message||e);
  uploadStatusKind='error';
 }finally{
  checking=false;render();
 }
}
async function bounded(promise,ms,message){
 let timer;
 try{return await Promise.race([
   Promise.resolve(promise),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms)})
 ])}finally{clearTimeout(timer)}
}
async function confirmImport(){
 if(!preview||working||checking)return;
 if(!confirm('Создать ЗАКРЫТЫЙ черновик счёта №'+preview.document_no+'?\nНа склад пока НЕ передаётся, Telegram НЕ отправляется.'))return;
 working=true;
 let createdId=null,step='auth';
 status('Проверяю авторизацию офис-менеджера…');render();
 try{
  const d=dbx();if(!d?.auth?.getUser)throw Error('Сессия CRM недоступна. Обновите страницу.');
  const response=await bounded(d.auth.getUser(),12000,'Проверка авторизации заняла более 12 секунд');
  const user=response?.data?.user;
  if(response?.error||!user?.id)throw Error('Авторизация истекла. Войдите в CRM заново.');
  if(!window.crypto?.randomUUID)throw Error('Браузер не поддерживает создание защищённого ID файла.');
  step='duplicate';
  status('Проверяю, не создан ли этот счёт ранее…');
  const dupe=await bounded(rpc('warehouse_pick_duplicate_check_v1',{
    p_document_no:preview.document_no,p_document_date:preview.document_date,p_original_sha256:preview.sha
  }),15000,'Сервер не ответил при проверке повторной загрузки за 15 секунд');
  if(dupe?.duplicate)throw Error('Этот счёт уже был загружен. ID: '+dupe.order_id+'. Повторно сохранять не нужно.');
  step='storage';
  const path=user.id+'/'+crypto.randomUUID()+'.xlsx';
  status('Сохраняю оригинальный Excel в закрытое хранилище…');
  const uploaded=await bounded(d.storage.from(BUCKET).upload(path,preview.file,{
    contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    upsert:false,cacheControl:'0'
  }),35000,'Хранилище не подтвердило загрузку за 35 секунд');
  if(uploaded?.error)throw Error('Закрытое хранилище отклонило файл: '+uploaded.error.message);
  step='create';
  status('Создаю закрытый черновик и проверяю артикулы/штрихкоды…');
  const created=await bounded(rpc('warehouse_pick_create_draft_v1',{
    p_document_no:preview.document_no,p_document_date:preview.document_date,
    p_customer_display:preview.customer_display,p_buyer_unp:preview.buyer_unp,
    p_original_path:path,p_original_sha256:preview.sha,p_report_total:preview.total,
    p_report_vat:preview.vat,p_items:preview.items
  }),25000,'Сервер не подтвердил создание черновика за 25 секунд');
  if(!created?.ok||!created?.order_id)throw Error('Создание черновика не подтверждено.');
  createdId=created.order_id;
  preview=null;selectedFile=null;selected=null;selectedFinance=null;
  status('Черновик создан (ID '+createdId+'). Обновляю список заказов…','ok');
  try{
    await bounded(loadList(createdId),15000,'Список заказов не обновился за 15 секунд');
    status('Готово: закрытый черновик создан. Он НЕ отправлен складу. Счёт не нужно загружать повторно.','ok');
  }catch(e){
    status('Черновик создан (ID '+createdId+'), но список не обновился: '+String(e?.message||e)+'. Нажмите «Обновить». Не загружайте счёт повторно.','ok');
  }
 }catch(e){
  const reason=String(e?.message||e);
  const uncertain=step==='storage'||step==='create';
  status('Не удалось завершить сохранение: '+reason+(uncertain?' Если ожидание закончилось, сначала нажмите «Обновить» и проверьте список заказов; не отправляйте счёт повторно вслепую.':''),'error');
 }finally{working=false;render();}
}

async function loadDevices(){
 if(!['office','supervisor'].includes(role)){devices=[];devicesError='';return;}
 try{
  const x=await bounded(rpc('warehouse_pick_devices_list_v1'),12000,'Не удалось получить список ТСД за 12 секунд');
  devices=Array.isArray(x?.rows)?x.rows:[];devicesError='';
 }catch(e){devices=[];devicesError=String(e?.message||e)}
}
async function startPairing(key){
 if(busyAction||!['office','supervisor'].includes(role))return;
 const device=devices.find(x=>x.key===key);
 if(!device)throw Error('ТСД не найден');
 if(!confirm((device.ready?'Создать новый код переподключения для ':'Подключить ')+device.label+'?\nСтарое подключение отключится только после успешного ввода нового кода на ТСД.'))return;
 busyAction=true;actionMessage='Создаю временный код для '+device.label+'…';actionTone='mut';render();
 try{
  const x=await bounded(rpc('warehouse_pick_pair_start_v1',{p_device_key:key}),12000,'Сервер не выдал код за 12 секунд');
  if(!x?.ok||!x.pair_code)throw Error('Код подключения не получен');
  pairing=x;actionMessage='Код создан. Введите его на соответствующем ТСД в течение 10 минут.';actionTone='ok';
 }catch(e){pairing=null;actionMessage='Код не создан: '+String(e?.message||e);actionTone='error'}
 finally{busyAction=false;render()}
}
async function assignDevice(){
 if(busyAction||selected?.status!=='draft'||!['office','supervisor'].includes(role))return;
 const key=String($('wp1-device')?.value||'');
 const device=devices.find(x=>x.key===key);
 if(!device)throw Error('Выберите ТСД');
 const pending=!device.ready;
 const msg='Назначить счёт №'+selected.document_no+' на '+device.label+'?\n'+
   (pending?'Терминал ещё не подключён к отдельному безопасному входу. Задание сохранится, но склад его пока НЕ ПОЛУЧИТ.':
    'Задание появится внутри ТСД. Telegram по заказам НЕ подключён.')+
   '\nПосле назначения повторная передача блокируется.';
 if(!confirm(msg))return;
 busyAction=true;actionMessage='Сохраняю назначение ТСД…';actionTone='mut';render();
 const id=selected.id;
 try{
  const x=await bounded(rpc('warehouse_pick_assign_device_v1',{
    p_order_id:id,p_device_key:key
  }),18000,'Сервер не подтвердил назначение за 18 секунд');
  if(!x?.ok)throw Error('Сервер не подтвердил назначение');
  actionMessage=x.status==='device_setup_pending'
    ?'Заказ закреплён за '+device.label+'. Терминал ещё не подключён: задание НЕ ДОСТАВЛЕНО. Telegram не настроен.'
    :'Заказ закреплён за '+device.label+'. Задание доступно в экране ТСД. Telegram не настроен.';
  actionTone=x.status==='device_setup_pending'?'error':'ok';
 }catch(e){
  actionMessage='Не удалось подтвердить назначение: '+String(e?.message||e)+'. Проверьте статус перед повторной попыткой.';
  actionTone='error';
 }finally{
  busyAction=false;
  try{await loadList(id)}catch(_){render()}
 }
}
async function unassignPending(){
 if(busyAction||selected?.status!=='device_setup_pending'||!['office','supervisor'].includes(role))return;
 if(!confirm('Отменить назначение заказа №'+selected.document_no+' на ТСД и вернуть в черновик? Заказ ещё НЕ доставлен терминалу.'))return;
 const id=selected.id;busyAction=true;actionMessage='Отменяю недоставленное назначение…';actionTone='mut';render();
 try{
  const x=await bounded(rpc('warehouse_pick_unassign_pending_v1',{p_order_id:id}),15000,'Нет ответа сервера за 15 секунд');
  if(!x?.ok||x.status!=='draft')throw Error('Отмена не подтверждена');
  actionMessage='Назначение отменено. Заказ снова черновик. ОМ может выбрать нужный ТСД.';actionTone='ok';
 }catch(e){actionMessage='Не удалось подтвердить отмену: '+String(e?.message||e);actionTone='error'}
 finally{busyAction=false;try{await loadList(id)}catch(_){render()}}
}
async function loadList(prefer=null){
 const x=await rpc('warehouse_pick_list_v1',{p_limit:60,p_offset:0});
 role=x?.role||null;orders=Array.isArray(x?.rows)?x.rows:[];
 await loadDevices();
 if(prefer)await openOrder(prefer);
 else if(!selected&&orders.length)await openOrder(orders[0].id);
 else render();
}
async function openOrder(id){
 selected=await rpc('warehouse_pick_detail_v1',{p_order_id:id});
 selectedFinance=null;
 if(['office','supervisor'].includes(role))selectedFinance=await rpc('warehouse_pick_finance_v1',{p_order_id:id});
 try{notificationStatus=(await rpc('warehouse_pick_notification_status_v1',{p_order_id:id}))?.notification_status||null}catch(_){notificationStatus=null}
 render();
}
function render(){
 if(!mount)return;
 const finAllowed=['office','supervisor'].includes(role);
 let devicePanel='';
 if(finAllowed){
  const cards=devices.map(d=>'<div class="wp1-box" style="margin:0"><b>'+esc(d.label)+'</b><div class="'+(d.ready?'wp1-good':'wp1-error')+'" style="margin:8px 0">'+(d.ready?'✅ Подключён к безопасной сборке':'⚠ Не подключён')+'</div><div class="wp1-mut">'+(d.last_seen_at?'Последняя связь: '+esc(new Date(d.last_seen_at).toLocaleString('ru-RU')):'Терминал ещё не выходил на связь')+'</div><button type="button" data-wp1-pair="'+esc(d.key)+'" '+(busyAction?'disabled':'')+' style="margin-top:8px">'+(d.ready?'Новый код / переподключить':'Получить код подключения')+'</button></div>').join('');
  const pair=pairing?'<div class="wp1-good" style="margin-top:12px"><b>'+esc(pairing.label)+'</b><br>Код подключения: <span style="font-size:24px;font-weight:900;letter-spacing:2px">'+esc(pairing.pair_code)+'</span><br><span class="wp1-mut">Действует '+esc(pairing.expires_in_minutes)+' мин. На ТСД откройте <b>/picking.html</b>, выберите нужный терминал и введите этот код.</span></div>':'';
  devicePanel='<section class="wp1-box"><h3>📱 ТСД для сборки</h3><p class="wp1-mut">ОМ сама распределяет заказы между двумя терминалами. Почта и пароль сотрудника не нужны. Telegram по заказам пока не подключён.</p>'+(devicesError?'<div class="wp1-error">'+esc(devicesError)+'</div>':'')+'<div class="wp1-grid">'+cards+'</div>'+pair+'</section>';
 }
 const upload=finAllowed?'<section class="wp1-box"><h3>🔒 Загрузка счёта офис-менеджером</h3><p class="wp1-mut">После выбора файла проверка запускается автоматически. Оригинал и финансы доступны только ОМ и руководителю; пока создаётся лишь черновик.</p><input id="wp1-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"> '+(selectedFile?'<div class="wp1-mut" style="margin:5px 0">Выбранный файл: '+esc(selectedFile.name)+'</div>':'')+' <button id="wp1-check" type="button" '+(checking||working?'disabled':'')+'>'+(checking?'Проверяю…':'Проверить счёт')+'</button><div id="wp1-upload-status" role="status" aria-live="polite" class="'+(uploadStatusKind==='error'?'wp1-error':uploadStatusKind==='ok'?'wp1-good':'wp1-mut')+'" style="margin-top:10px;'+(uploadStatus?'':'display:none;')+'">'+esc(uploadStatus)+'</div></section>':'';
 const pr=preview&&finAllowed?'<section class="wp1-box"><div class="wp1-finance"><b>Предпросмотр для ОМ / руководителя</b><br>Счёт №'+esc(preview.document_no)+' от '+esc(preview.document_date)+' · '+esc(preview.customer_display)+'<br>УНП: '+esc(preview.buyer_unp||'—')+' · Итого с НДС: <b>'+money(preview.total)+'</b> · НДС: '+money(preview.vat)+'</div><div class="wp1-table"><table><thead><tr><th>Артикул / Штрихкод</th><th>Товар</th><th>Кол.</th><th>Всего с НДС</th></tr></thead><tbody>'+preview.items.map(x=>'<tr><td>'+esc(x.sku)+'<br>'+esc(x.barcode)+'</td><td>'+esc(x.product)+'</td><td>'+esc(x.qty)+'</td><td>'+money(x.total_with_vat)+'</td></tr>').join('')+'</tbody></table></div><button type="button" class="wp1-primary" id="wp1-confirm" '+(working?'disabled':'')+'>Создать закрытый черновик</button></section>':'';
 const list='<section class="wp1-box"><h3>Заказы</h3><div class="wp1-list">'+(orders.length?orders.map(x=>'<button data-wp1-id="'+esc(x.id)+'" type="button" class="'+(selected?.id===x.id?'active':'')+'"><b>№'+esc(x.document_no)+'</b> · '+esc(x.document_date)+' · '+esc(x.customer_display)+'<br><span class="wp1-mut">'+esc(statusText(x.status))+' · '+esc(x.line_count)+' поз. / '+esc(x.total_qty)+' шт.</span></button>').join(''):'<div class="wp1-mut">Заказов пока нет.</div>')+'</div></section>';
 let detail='';
 if(selected){
  let f='';
  let extra='';
  const note=actionMessage?'<div role="status" class="'+(actionTone==='error'?'wp1-error':actionTone==='ok'?'wp1-good':'wp1-mut')+'" style="margin-top:10px">'+esc(actionMessage)+'</div>':'';
  if(finAllowed&&selected.status==='draft'){
   const opts=devices.map(x=>'<option value="'+esc(x.key)+'">'+esc(x.label)+(x.ready?' · Подключён':' · Требуется подключение')+'</option>').join('');
   extra='<div class="wp1-box"><h4>📦 ОМ назначает заказ на ТСД</h4><p class="wp1-mut">Без ввода почт и без согласования с руководителем. Два фиксированных терминала склада.</p>'+
     (devicesError?'<div class="wp1-error">'+esc(devicesError)+'</div>':'')+
     '<p class="wp1-mut">Telegram по заказам НЕ подключён. Назначение фиксируется в CRM; до подключения технического входа ТСД статус будет «Не доставлено».</p>'+
     (devices.length?'<select id="wp1-device" style="max-width:100%;padding:8px;border:1px solid #cbd5e1">'+opts+'</select> <button type="button" class="wp1-primary" id="wp1-assign-device" '+(busyAction?'disabled':'')+'>Назначить на ТСД</button>':
      '<p class="wp1-error">Список терминалов временно недоступен — назначение не выполнено.</p>')+note+'</div>';
  }else if(finAllowed&&['device_setup_pending','waiting_pick','picking','ready'].includes(selected.status)){
   const label=devices.find(x=>x.key===selected.device_key)?.label||selected.device_key||'—';
   const isPending=selected.status==='device_setup_pending';
   extra='<div class="wp1-box"><h4>📦 Назначение заказа</h4><p><b>'+esc(label)+'</b></p>'+
     (isPending?'<div class="wp1-error">Терминал пока не подключён к отдельному входу сборки. Заказ закреплён, но НЕ доставлен. Сборку не начинать.</div><button type="button" id="wp1-unassign-pending" '+(busyAction?'disabled':'')+'>Отменить недоставленное назначение</button>':
       '<div class="wp1-good">Заказ находится в рабочем списке назначенного ТСД. Статус: '+esc(statusText(selected.status))+'.</div>')+
      '<p class="wp1-mut">Telegram: не подключён. Уведомления «отправлено» нет.</p>'+note+'</div>';
  }else if(role==='warehouse'){
   extra='<p class="wp1-good">Это назначенный вашему терминалу заказ. Цены и УНП недоступны.</p>';
  }

  if(finAllowed&&selectedFinance)f='<div class="wp1-finance">🔒 Только ОМ и руководитель · УНП '+esc(selectedFinance.buyer_unp||'—')+' · Сумма с НДС '+money(selectedFinance.total_with_vat)+' · НДС '+money(selectedFinance.vat_total)+'</div>';
  detail='<section class="wp1-box"><h3>Счёт №'+esc(selected.document_no)+' · '+esc(statusText(selected.status))+'</h3>'+f+'<div class="wp1-table"><table><thead><tr><th>Артикул / Штрихкод</th><th>Товар</th><th>Нужно</th><th>Собрано</th></tr></thead><tbody>'+(selected.items||[]).map(x=>'<tr><td>'+esc(x.sku)+'<br>'+esc(x.barcode)+'</td><td>'+esc(x.product)+'</td><td>'+esc(x.expected_qty)+'</td><td>'+esc(x.picked_qty)+'</td></tr>').join('')+'</tbody></table></div>'+extra+'</section>';
 }
 mount.innerHTML='<div id="wp1"><div class="wp1-head"><div><h3>📦 Заказы · защищённый контур</h3><div class="wp1-mut">Склад не получает цены, НДС, суммы, УНП или оригинальный Excel.</div></div><button type="button" id="wp1-refresh">↻ Обновить</button></div>'+devicePanel+upload+pr+'<div class="wp1-grid">'+list+detail+'</div></div>';
 mount.querySelector('#wp1-refresh')?.addEventListener('click',()=>{pairing=null;loadList().catch(showError)});
 mount.querySelectorAll('[data-wp1-pair]').forEach(b=>b.addEventListener('click',()=>startPairing(b.dataset.wp1Pair).catch(showError)));
 mount.querySelector('#wp1-file')?.addEventListener('change',e=>{const file=e.target.files?.[0];if(file){selectedFile=file;readPreview(file).catch(showError)}});
 mount.querySelector('#wp1-check')?.addEventListener('click',()=>readPreview().catch(showError));
 mount.querySelector('#wp1-confirm')?.addEventListener('click',()=>confirmImport().catch(showError));
 mount.querySelector('#wp1-assign-device')?.addEventListener('click',()=>assignDevice().catch(showError));
 mount.querySelector('#wp1-unassign-pending')?.addEventListener('click',()=>unassignPending().catch(showError));
 mount.querySelectorAll('[data-wp1-id]').forEach(b=>b.addEventListener('click',()=>openOrder(b.dataset.wp1Id).catch(showError)));
}
function showError(e){alert('Заказы: '+String(e?.message||e));}
async function open(target){
 css();mount=typeof target==='string'?document.querySelector(target):target;
 if(!mount)return;
 mount.innerHTML='<div class="wp1-box">Проверяю доступ к разделу «Заказы»…</div>';
 try{
   const r=await rpc('warehouse_pick_list_v1',{p_limit:60,p_offset:0});
   role=r.role;orders=r.rows||[];selected=null;selectedFinance=null;preview=null;selectedFile=null;uploadStatus='';uploadStatusKind='mut';checking=false;
   await loadDevices();
   if(orders.length)await openOrder(orders[0].id);else render();
 }catch(e){mount.innerHTML='<div class="wp1-error">Нет доступа к разделу «Заказы» или не удалось связаться с сервером. '+esc(e.message||e)+'</div>'}
}
window.crmWarehouseOrdersV1={open,refresh:loadList};
window.RESANTA_WAREHOUSE_ORDERS_V1=Object.freeze({version:V,privateInvoicePreview:true,financeIsolated:true,deviceAssignment:true,securePairing:true,barcodePicking:true,undoUndelivered:true,telegramConnected:false,autoCheck:true,excelLoadTimeout:true});
})();