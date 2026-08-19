/* RESANTA CRM · TRIOVIST 21VEK UPLOAD TRUTH GUARD v23.5.5.1
 * Final manual-upload guard layered after v23.5.5.
 * The second «Свободно» is counted as free-in-transit only up to «В пути».
 * This prevents a reused/ambiguous second «Свободно» column from inflating 21vek availability.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_STOCK_UPLOAD_TRUTH_V23551)return;

const VERSION='v23.5.5.1';
const SOURCE_MARK='[truth-v23.5.5]';
const LEADERS=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
const MANAGERS=new Set(['aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru']);
const SKU_RE=/\d+(?:\/\d+){1,6}/g;
const compact=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,'');
const qty=v=>(Number(v)||0).toLocaleString('ru-RU',{maximumFractionDigits:3});

function profile(){try{return window.currentProfile||window.currentUser||{};}catch(_){return{};}}
function canUpload(){const p=profile(),e=String(p?.email||'').trim().toLowerCase();return(p?.role==='boss'&&LEADERS.has(e))||(String(p?.access_scope||'').toLowerCase()==='triovist'&&MANAGERS.has(e));}
function cellNum(v){if(v==null||v==='')return 0;if(typeof v==='number')return Number.isFinite(v)?v:0;const n=Number(String(v).replace(/\s/g,'').replace(',','.'));return Number.isFinite(n)?n:0;}
function skuCell(v){const s=String(v||'').trim().replace(/^'/,'');return /^\d+(?:\/\d+){1,6}$/.test(s)?s:'';}
function skuProduct(v){const a=String(v||'').match(SKU_RE);return a?.length?a[a.length-1]:'';}
function findHeader(aoa,partner){for(let i=0;i<Math.min(partner?35:25,aoa.length);i++){const h=(aoa[i]||[]).map(compact);if(partner){const p=h.some(v=>v==='номенклатура'||v.startsWith('номенклатура')||v.startsWith('наименование')),t=h.some(v=>v==='всего'||v.startsWith('всего'));if(p&&t)return i;}else if(h.includes('номенклатура')&&h.includes('артикул'))return i;}return-1;}
function cols(raw){const h=raw.map(compact);return{h,find:(...names)=>{for(const n of names){const k=compact(n),i=h.findIndex(v=>v===k||v.startsWith(k));if(i>=0)return i;}throw new Error('Нет колонки «'+names.join(' / ')+'»');},opt:(...names)=>{for(const n of names){const k=compact(n),i=h.findIndex(v=>v===k||v.startsWith(k));if(i>=0)return i;}return-1;}};}

function parsePartner(aoa){
  const hr=findHeader(aoa,true);if(hr<0)throw new Error('Не найдена шапка 21vek');const raw=aoa[hr]||[],c=cols(raw),h=c.h;
  const product=c.find('Номенклатура','Наименование'),partnerSku=c.opt('Артикул','Артикул 21vek','Код товара','ID товара','SKU'),kind=c.opt('Вид','Категория'),brand=c.opt('Производитель','Бренд');
  const sales3=c.opt('Продажи за 3 мес.','Продажи за 3 месяца','Продажи 3 мес.'),legacy=h.map((v,i)=>(v.startsWith('продажиза')&&!v.startsWith('продажиза3мес'))?i:-1).filter(i=>i>=0).slice(-3);
  if(sales3<0&&legacy.length<3)throw new Error('Не найдена колонка «Продажи за 3 мес.» и нет трёх старых колонок продаж. «Статистика продаж» в продажи не складывается.');
  const stat2=c.opt('Статистика продаж2'),stat1=c.opt('Статистика продаж1'),total=c.find('Всего','Остаток всего'),reserve=c.opt('Резерв'),transit=c.opt('В пути'),orders=c.opt('Заказ','Заказы','В заказах'),forecast=c.opt('Прогноз');
  const freeExact=[];h.forEach((v,i)=>{if(v==='свободно')freeExact.push(i);});let freeNow=-1,freeTransit=-1;const named=c.opt('Свободно в пути','Свободно в пути и резерве');if(named>=0)freeTransit=named;
  if(transit>=0){const before=freeExact.filter(i=>i<transit),after=freeExact.filter(i=>i>transit);freeNow=before.length?before[before.length-1]:-1;if(freeTransit<0&&after.length)freeTransit=after[0];}else if(freeExact.length)freeNow=freeExact[0];if(freeNow<0)freeNow=c.opt('Доступно');
  const own=[];['Наш артикул','Артикул поставщика','Артикул производителя','SKU поставщика','SKU производителя','Код поставщика','Код производителя','Наш SKU'].forEach(n=>{const i=c.opt(n);if(i>=0&&!own.includes(i))own.push(i);});
  const rows=[],diag={salesColumn:sales3>=0?String(raw[sales3]||'Продажи за 3 мес.'):'сумма трёх старых месяцев',freeNowColumn:freeNow>=0?String(raw[freeNow]||'Свободно'):'Всего−Резерв',transitColumn:transit>=0?String(raw[transit]||'В пути'):'нет',freeTransitColumn:freeTransit>=0?String(raw[freeTransit]||'Свободно'):'нет',forecastColumn:forecast>=0?String(raw[forecast]||'Прогноз'):null,samples:[]};
  for(let i=hr+1;i<aoa.length;i++){
    const r=aoa[i]||[],p=String(r[product]||'').trim();if(!p)continue;const k=kind>=0?String(r[kind]||''):'',packed=compact(k+' '+p),excluded=p.includes('+')||packed.includes('комплект')||compact(p).includes('невыводить');let sku='';for(const x of own){sku=skuCell(r[x]);if(sku)break;}if(!sku&&partnerSku>=0)sku=skuCell(r[partnerSku]);if(!sku)sku=skuProduct(p);if(!sku)continue;if(/^900(?:\/|$)/i.test(sku)||/(^|[^0-9])900\s*(группа|гр\.?)([^0-9]|$)/i.test(k+' '+p))continue;
    const rawTotal=Math.max(0,cellNum(r[total])),rawReserve=Math.max(0,reserve>=0?cellNum(r[reserve]):0),freeCurrent=Math.max(0,freeNow>=0?cellNum(r[freeNow]):Math.max(0,rawTotal-rawReserve));
    const transitTotal=Math.max(0,transit>=0?cellNum(r[transit]):0),transitFreeRaw=Math.max(0,freeTransit>=0?cellNum(r[freeTransit]):0),transitFree=transit>=0?Math.min(transitFreeRaw,transitTotal):transitFreeRaw,available=freeCurrent+transitFree;
    const sales90=Math.max(0,sales3>=0?cellNum(r[sales3]):legacy.reduce((a,x)=>a+cellNum(r[x]),0)),ord=Math.max(0,orders>=0?cellNum(r[orders]):0),pf=forecast>=0?cellNum(r[forecast]):null,ps=partnerSku>=0?String(r[partnerSku]||'').trim():sku;
    const note={truth_version:'v23.5.5',sales_3m:sales90,stat_sales_2:stat2>=0?cellNum(r[stat2]):null,stat_sales_1:stat1>=0?cellNum(r[stat1]):null,total:rawTotal,free_now:freeCurrent,reserve:rawReserve,in_transit:transitTotal,free_in_transit_raw:transitFreeRaw,free_in_transit:transitFree,partner_forecast:pf};
    rows.push({row_key:(ps||sku)+'|'+sku+'|'+p,partner_sku:ps||sku,sku,kind:k,brand:brand>=0?String(r[brand]||''):'',product:p,sales_m1:'0',sales_m2:'0',sales_m3:String(sales90),sales_m1_label:'CRM truth: не используется',sales_m2_label:'CRM truth: не используется',sales_m3_label:sales3>=0?String(raw[sales3]||'Продажи за 3 мес.'):'CRM truth: сумма 3 старых месяцев',qty_total:String(available),qty_free:String(available),qty_transit_reserve:String(transitFree+rawReserve),qty_orders:String(ord),excluded,match_note:JSON.stringify(note)});
    if(diag.samples.length<5||['70/1/65','72/17/1','72/11/6','65/60'].includes(sku)){diag.samples.push({sku,sales90,freeCurrent,transitTotal,transitFreeRaw,transitFree,available,forecast:pf});if(diag.samples.length>9)diag.samples=diag.samples.slice(-9);}
  }
  if(rows.length<100)throw new Error('Файл 21vek распознан, но корректных SKU слишком мало: '+rows.length);Object.defineProperty(rows,'_truthDiag',{value:diag,enumerable:false});return rows;
}
function parseChekhov(aoa){const hr=findHeader(aoa,false);if(hr<0)throw new Error('Не найдена шапка Чехова');const raw=aoa[hr]||[],c=cols(raw),p=c.find('Номенклатура'),skuCol=c.find('Артикул'),box=c.find('Количество в коробке'),stock=c.find('Остаток'),near=c.find('Остаток рядом'),total=c.find('Сумма'),rows=[],seen=new Set();for(let i=hr+1;i<aoa.length;i++){const r=aoa[i]||[],sku=String(r[skuCol]||'').trim().replace(/^'/,'');if(!/^\d+(?:\/\d+){1,6}$/.test(sku)||/^900(?:\/|$)/i.test(sku))continue;if(seen.has(sku))throw new Error('Дубль Чехова: '+sku);seen.add(sku);rows.push({sku,product:String(r[p]||''),box_qty:String(cellNum(r[box])),qty_stock:String(cellNum(r[stock])),qty_nearby:String(cellNum(r[near])),qty_total:String(cellNum(r[total]))});}if(rows.length<100)throw new Error('Слишком мало строк Чехова: '+rows.length);return rows;}
async function ensureXlsx(){if(window.XLSX)return window.XLSX;await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';s.onload=res;s.onerror=()=>rej(new Error('Не удалось загрузить модуль Excel'));document.head.appendChild(s);});if(!window.XLSX)throw new Error('Модуль Excel не загрузился');return window.XLSX;}
function status(s){const e=document.getElementById('tri-stock-upload-status');if(e){e.style.display='block';e.style.whiteSpace='pre-wrap';e.textContent=s;}}
function busy(v,source,done=0,total=0){document.querySelectorAll('.tri-stock-upload').forEach(b=>{b.disabled=v;if(!b.dataset.truthGuardText)b.dataset.truthGuardText=b.textContent;if(!v)b.textContent=b.dataset.truthGuardText;else if(b.dataset.source===source)b.textContent=total?'Загрузка '+done+' из '+total+'…':'Проверка файла…';});}
function timeout(p,ms,label){let t;const q=new Promise((_,rej)=>t=setTimeout(()=>rej(new Error(label+' не завершено вовремя')),ms));return Promise.race([p,q]).finally(()=>clearTimeout(t));}
async function rpc(name,args,ms,label){const r=await timeout(db.rpc(name,args),ms,label);if(r?.error)throw r.error;return r?.data||{};}
function iid(source){try{return source+'-'+crypto.randomUUID();}catch(_){return source+'-'+Date.now()+'-'+Math.random().toString(36).slice(2);}}
function diagText(d){if(!d)return'';let s='Продажи 90 дней: только «'+d.salesColumn+'».\nДоступно 21vek = «'+d.freeNowColumn+'» + свободное в пути, но свободное в пути ограничено фактическим «'+d.transitColumn+'».';const x=d.samples.filter(a=>['70/1/65','72/17/1','72/11/6','65/60'].includes(a.sku)).slice(0,4);if(x.length)s+='\nКонтроль: '+x.map(a=>a.sku+' продажи='+qty(a.sales90)+'; В пути='+qty(a.transitTotal)+'; свободно в пути сырьё='+qty(a.transitFreeRaw)+'; зачтено='+qty(a.transitFree)+'; доступно='+qty(a.available)).join(' | ');return s;}

window.triovistUploadStock=async function(source,event){
  if(!canUpload()){alert('Загрузка остатков недоступна для этой учётной записи.');return;}const file=event?.target?.files?.[0];if(event?.target)event.target.value='';if(!file)return;const label=source==='partner'?'21vek':'Чехов';let id='';
  try{busy(true,source);status('Проверяю '+label+' по правилам '+VERSION+'…');const X=await ensureXlsx(),wb=X.read(await file.arrayBuffer(),{type:'array'});if(!wb.SheetNames?.length)throw new Error('В Excel нет листов');const aoa=X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:null,raw:true}),rows=source==='partner'?parsePartner(aoa):parseChekhov(aoa),d=rows._truthDiag||null,text=(d?diagText(d):'Принято '+rows.length+' строк.')+'\n\nСтарый снимок заменится только после полной серверной проверки.';status('Файл проверен.\n'+text);if(!confirm('Загрузить '+rows.length+' строк из «'+file.name+'»?\n\n'+text))return;
    id=iid(source);await rpc('triovist_stock_stage_begin',{p_source:source,p_import_id:id},30000,'Начало загрузки');for(let off=0;off<rows.length;off+=250){const batch=rows.slice(off,off+250),done=Math.min(off+batch.length,rows.length);busy(true,source,done,rows.length);status(label+': '+done+' / '+rows.length+' строк…');await rpc('triovist_stock_stage_batch',{p_source:source,p_import_id:id,p_rows:batch},45000,'Пакет загрузки');}
    const sourceFile=(source==='partner'?SOURCE_MARK+' ':'')+file.name,r=await rpc('triovist_stock_stage_commit',{p_source:source,p_import_id:id,p_expected_rows:rows.length,p_source_file:sourceFile,p_snapshot_date:new Date().toISOString().slice(0,10)},90000,'Финальная проверка');status('✅ '+label+': '+Number(r.rows||rows.length)+' строк.\n'+(d?diagText(d):''));window.TRIOVIST_DATA_HUB_V227315?.invalidate?.('stock');alert('✅ '+label+' загружен корректно ('+VERSION+').');if(typeof window.triovistReload==='function')await window.triovistReload();else window.renderTriovistStock?.();
  }catch(e){if(id){try{await db.rpc('triovist_stock_stage_abort',{p_source:source,p_import_id:id});}catch(_){}}status('❌ '+label+': '+(e?.message||e)+'\nСтарый рабочий снимок сохранён.');alert(label+' не загружен.\n\n'+(e?.message||e));}finally{busy(false,source);}
};

window.RESANTA_TRIOVIST_STOCK_UPLOAD_TRUTH_V23551=Object.freeze({version:VERSION,sourceMark:SOURCE_MARK,freeTransitInvariant:'counted <= total in transit',sales90Source:'Продажи за 3 мес.',manualUploadOverride:true});
})();
