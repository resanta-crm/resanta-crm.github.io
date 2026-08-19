/* RESANTA CRM · TRIOVIST STOCK TRUTH v23.5.5
 * Root fix for 21vek stock input, seasonal demand and recommendation math.
 * Permanent business rules:
 *   - "Продажи за 3 мес." is the ONLY 90-day sales input from the current 21vek file.
 *     "Статистика продаж1/2" are diagnostics and are never summed into demand.
 *   - available 21vek = free now + free in transit. Reserved or non-free in-transit units do not cover demand.
 *   - demand forecast = 90-day sales pace × future/past seasonality. No dependency on the Sales tab month filter.
 *   - SKU seasonality is used only with enough evidence for the target months; otherwise subgroup/category fallback.
 *   - replenish 21vek from Vitebsk first, then Chekhov only above the permanent 50-unit reserve.
 *   - old partner snapshots are explicitly marked unsafe until re-uploaded with this parser.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_SEASONAL_STOCK_V2350?.truthVersion==='v23.5.5')return;

const VERSION='v23.5.5';
const PROFILE_URL='./data/triovist_seasonality.json?v=23.5.0';
const PROFILE_VERSION='v23.5.0';
const SOURCE_MARK='[truth-v23.5.5]';
const CHEKHOV_RESERVE=50;
const LEADERS=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
const TRIO_MANAGERS=new Set(['aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru']);
const SKU_RE=/\d+(?:\/\d+){1,6}/g;
let profile=null,profilePromise=null,baseRender=null,baseExport=null,installed=false;

const num=v=>Number(v)||0;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const norm=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,' ').replace(/\s+/g,' ').trim();
const compact=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,'');
const qty=v=>(Number(v)||0).toLocaleString('ru-RU',{maximumFractionDigits:3});
const one=v=>(Number(v)||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function currentProfileSafe(){try{return window.currentProfile||window.currentUser||{};}catch(_){return{};}}
function currentEmail(){return String(currentProfileSafe()?.email||'').trim().toLowerCase();}
function canUpload(){const p=currentProfileSafe(),email=currentEmail();return (p?.role==='boss'&&LEADERS.has(email))||(String(p?.access_scope||'').toLowerCase()==='triovist'&&TRIO_MANAGERS.has(email));}
function snapshot(){try{return window.TRIOVIST_RUNTIME_STATE_V227324?.snapshot?.()||{};}catch(_){return{};}}

function parseDate(value){const s=String(value||'').slice(0,10),m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12):null;}
function addDays(d,n){const x=new Date(d.getTime());x.setDate(x.getDate()+n);return x;}
function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function referenceDate(state){
  const m=state?.stockMeta||{},c=[m?.partner?.snapshot_date,m?.own?.report_date,m?.chekhov?.snapshot_date,window.TODAY,new Date().toISOString().slice(0,10)];
  for(const v of c){const d=parseDate(v);if(d)return d;}return new Date();
}
async function ensureProfile(){
  if(profile)return profile;if(profilePromise)return profilePromise;
  profilePromise=fetch(PROFILE_URL,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Профиль сезонности HTTP '+r.status);return r.json();}).then(p=>{
    if(!p||p.version!==PROFILE_VERSION||!p.levels)throw new Error('Некорректный профиль сезонности');profile=p;return p;
  }).finally(()=>{profilePromise=null;});
  return profilePromise;
}

function targetMonthWeights(asOf,days){
  const out=new Map(),n=Math.max(1,Math.round(days||1));
  for(let i=0;i<n;i++){const m=addDays(asOf,i).getMonth();out.set(m,(out.get(m)||0)+1);}return out;
}
function observationEvidence(entry,asOf,days){
  if(!entry)return{minObs:0,weightedObs:0};
  const weights=targetMonthWeights(asOf,days),obs=Array.isArray(entry.observations)?entry.observations:[];
  let minObs=Infinity,sum=0,total=0;
  for(const [m,w] of weights){const o=num(obs[m]);minObs=Math.min(minObs,o);sum+=o*w;total+=w;}
  return{minObs:Number.isFinite(minObs)?minObs:0,weightedObs:total?sum/total:0};
}
function qualifies(entry,level,asOf,days){
  if(!entry)return false;const e=observationEvidence(entry,asOf,days),conf=num(entry.confidence),active=num(entry.active_months),total=num(entry.total_qty);
  if(level==='SKU')return conf>=0.70&&active>=18&&total>=24&&e.minObs>=2;
  if(level==='подгруппа')return conf>=0.60&&active>=18&&e.minObs>=2;
  return active>=12&&e.minObs>=1;
}
function chooseSeason(item,asOf,days){
  if(!profile)return{entry:null,level:'нет истории',evidence:{minObs:0,weightedObs:0}};
  const l=profile.levels||{},sku=l.sku?.[norm(item?.sku)],sub=l.subgroup?.[norm(item?.subgroup)],cat=l.category?.[norm(item?.category)]||l.category?.[norm(item?.assigned_group)];
  if(qualifies(sku,'SKU',asOf,days))return{entry:sku,level:'SKU',evidence:observationEvidence(sku,asOf,days)};
  if(qualifies(sub,'подгруппа',asOf,days))return{entry:sub,level:'подгруппа',evidence:observationEvidence(sub,asOf,days)};
  if(qualifies(cat,'группа',asOf,days))return{entry:cat,level:'группа',evidence:observationEvidence(cat,asOf,days)};
  return{entry:null,level:'нет достаточной истории',evidence:{minObs:0,weightedObs:0}};
}
function factorFor(entry,date){if(!entry||!Array.isArray(entry.factors))return 1;return clamp(num(entry.factors[date.getMonth()])||1,0.35,2.5);}
function averageFactor(entry,start,days){const n=Math.max(1,Math.round(days||1));let s=0;for(let i=0;i<n;i++)s+=factorFor(entry,addDays(start,i));return s/n;}
function seasonMetrics(item,asOf,targetDays){
  const p=chooseSeason(item,asOf,targetDays);if(!p.entry)return{ratio:1,rawRatio:1,level:p.level,confidence:0,minObs:0};
  const future=averageFactor(p.entry,asOf,targetDays),past=averageFactor(p.entry,addDays(asOf,-89),90),raw=past>0?future/past:1;
  const reliability=clamp(num(p.entry.confidence),0,1)*clamp(num(p.evidence.minObs)/3,0,1);
  const ratio=clamp(1+(raw-1)*reliability,0.50,1.80);
  return{ratio,rawRatio:raw,level:p.level,confidence:num(p.entry.confidence),minObs:num(p.evidence.minObs)};
}
function parseTruthNote(value){
  const s=String(value||'').trim();if(!s.startsWith('{'))return null;
  try{const x=JSON.parse(s);return x?.truth_version==='v23.5.5'?x:null;}catch(_){return null;}
}
function calculate(item,state,targetDays){
  const asOf=referenceDate(state),season=seasonMetrics(item,asOf,targetDays),sales90=Math.max(0,num(item?.sales_90));
  const forecastRaw=(sales90/90)*targetDays*season.ratio,forecast=Math.max(0,Math.ceil(forecastRaw-1e-9));
  const partnerAvailable=Math.max(0,num(item?.partner_total)),partnerOrders=Math.max(0,num(item?.partner_orders));
  const recommended=Math.max(0,Math.ceil(forecastRaw+partnerOrders-partnerAvailable-1e-9));
  const ownAvailable=Math.max(0,Math.floor(num(item?.own_qty)+1e-9)),chekhovRaw=Math.max(0,Math.floor(num(item?.chekhov_qty)+1e-9)),chekhovAvailable=Math.max(0,chekhovRaw-CHEKHOV_RESERVE);
  const shipOwn=Math.min(recommended,ownAvailable),afterOwn=Math.max(0,recommended-shipOwn),orderChekhov=Math.min(afterOwn,chekhovAvailable),uncovered=Math.max(0,afterOwn-orderChekhov);
  const net21=Math.max(0,partnerAvailable-partnerOrders),perDay=forecastRaw>0?forecastRaw/targetDays:0,stockDays=perDay>0?net21/perDay:null,raw=parseTruthNote(item?.match_note);
  const explanation='Продажи 3 мес. '+qty(sales90)+' → сезон ×'+season.ratio.toFixed(2)+' ('+season.level+') → прогноз CRM '+qty(forecast)+' → доступно 21vek '+qty(partnerAvailable)+' → заказы '+qty(partnerOrders)+' → потребность '+qty(recommended)+' → Витебск '+qty(shipOwn)+' → Чехов '+qty(orderChekhov)+' → не покрыто '+qty(uncovered)+'.';
  return{asOf:ymd(asOf),targetDays,sales90,forecast,forecastRaw,seasonRatio:season.ratio,seasonLevel:season.level,seasonConfidence:season.confidence,seasonMinObs:season.minObs,partnerAvailable,partnerOrders,recommended,ownAvailable,chekhovRaw,chekhovAvailable,shipOwn,orderChekhov,uncovered,stockDays,raw,explanation};
}
function stockBySku(state){const m=new Map();for(const x of Array.isArray(state?.stockItems)?state.stockItems:[]){const k=norm(x?.sku);if(k&&!m.has(k))m.set(k,x);}return m;}
function truthSnapshot(state){return String(state?.stockMeta?.partner?.source_file||'').includes(SOURCE_MARK);}
function removeLegacyBoxes(root){root?.querySelector('#tri-seasonal-stock-note-v2350')?.remove();root?.querySelector('#tri-seasonal-stock-error-v2350')?.remove();}
function putNote(root,state,targetDays){
  if(!root)return;removeLegacyBoxes(root);let box=document.getElementById('tri-stock-truth-note-v2355');if(!box){box=document.createElement('div');box.id='tri-stock-truth-note-v2355';root.prepend(box);}
  if(!truthSnapshot(state)){
    box.className='tri-warning';box.innerHTML='<b>⚠ Рекомендации временно не считать окончательными.</b> Снимок 21vek загружен старым парсером, который смешивал «Статистика продаж» с «Продажи за 3 мес.» и мог учитывать весь товар в пути. <b>Загрузите файл 21vek заново один раз.</b> После загрузки источник будет отмечен '+esc(SOURCE_MARK)+'.';return false;
  }
  const m=state?.stockMeta||{};box.className='tri-ok';box.innerHTML='<b>Рекомендация '+VERSION+' · проверенный снимок 21vek.</b> Продажи = только колонка «Продажи за 3 мес.». Доступно 21vek = свободно сейчас + свободно в пути. Прогноз CRM = темп 90 дней × сезонность будущего периода. Чехов: первые <b>'+CHEKHOV_RESERVE+' шт.</b> не учитываются. Горизонт: <b>'+targetDays+' дней</b>.<div class="tri-note" style="margin-top:4px">Снимки: 21vek '+esc(m?.partner?.snapshot_date||'—')+' · '+esc(m?.partner?.source_file||'—')+'; Витебск '+esc(m?.own?.report_date||'—')+'; Чехов '+esc(m?.chekhov?.snapshot_date||'—')+'.</div>';return true;
}
function applyTruth(){
  if(!profile)return;const root=document.getElementById('tri-stock-table'),table=root?.querySelector('table.tri-stock-table');if(!root||!table)return;
  const state=snapshot(),targetDays=Math.max(1,Number(document.getElementById('tri-stock-days')?.value)||45),safe=putNote(root,state,targetDays);if(!safe)return;
  const th=table.querySelectorAll('thead th');if(th.length>=14){th[3].textContent='Продажи 3 мес.';th[4].textContent='Доступно 21vek';th[6].textContent='Дней запаса';th[9].textContent='Рекоменд. заказ';th[12].textContent='Не покрыто';}
  const bySku=stockBySku(state),tbody=table.querySelector('tbody');if(!tbody)return;const rows=[...tbody.querySelectorAll('tr')];
  for(const tr of rows){const cells=tr.children;if(cells.length<14)continue;const skuText=cells[2]?.querySelector('b')?.textContent||cells[2]?.textContent||'',item=bySku.get(norm(skuText));if(!item)continue;const c=calculate(item,state,targetDays);
    cells[3].innerHTML='<b>'+qty(c.sales90)+'</b>';
    cells[4].innerHTML='<b>'+qty(c.partnerAvailable)+'</b>'+(c.raw?'<div class="tri-note">свободно '+qty(c.raw.free_now)+' + свободно в пути '+qty(c.raw.free_in_transit)+'</div>':'<div class="tri-note">свободно сейчас + свободно в пути</div>');
    cells[6].innerHTML=c.stockDays==null?'—':one(c.stockDays);
    cells[8].innerHTML=qty(c.chekhovRaw)+'<div class="tri-note">доступно сверх 50: <b>'+qty(c.chekhovAvailable)+'</b></div>';
    cells[9].innerHTML='<b>'+qty(c.recommended)+'</b><div class="tri-note">CRM прогноз '+qty(c.forecast)+' · сезон ×'+c.seasonRatio.toFixed(2)+' ('+c.seasonLevel+', наблюдений ≥'+qty(c.seasonMinObs)+')'+(c.raw&&c.raw.partner_forecast!=null?' · прогноз 21vek '+qty(c.raw.partner_forecast):'')+'</div><details class="tri-note"><summary style="cursor:pointer">Почему столько?</summary>'+esc(c.explanation)+'</details>';
    cells[10].innerHTML=qty(c.shipOwn);cells[11].innerHTML=qty(c.orderChekhov)+'<div class="tri-note">из доступных '+qty(c.chekhovAvailable)+'</div>';cells[12].innerHTML='<b>'+qty(c.uncovered)+'</b>';cells[12].className=c.uncovered>0?'tri-uncovered':'';tr.dataset.truthRecommended=String(c.recommended);
  }
  rows.sort((a,b)=>num(b.dataset.truthRecommended)-num(a.dataset.truthRecommended));for(const tr of rows)tbody.appendChild(tr);
}
function showProfileError(e){const root=document.getElementById('tri-stock-table');if(!root)return;let b=document.getElementById('tri-stock-truth-error-v2355');if(!b){b=document.createElement('div');b.id='tri-stock-truth-error-v2355';b.className='tri-warning';root.prepend(b);}b.textContent='Сезонность не применена: '+(e?.message||String(e));}

function filteredStock(state){let mgr=String(document.getElementById('tri-manager-filter')?.value||'all').toLowerCase();const p=currentProfileSafe(),email=currentEmail();if(String(p?.access_scope||'').toLowerCase()==='triovist'&&!LEADERS.has(email))mgr=email;const q=norm(document.getElementById('tri-stock-search')?.value||'');return (Array.isArray(state?.stockItems)?state.stockItems:[]).filter(x=>(mgr==='all'||String(x?.manager_email||'').toLowerCase()===mgr)&&(!q||norm([x?.sku,x?.product,x?.assigned_group,x?.brand].join(' ')).includes(q)));}
function exportTruth(){
  if(!profile||!window.XLSX)return baseExport?.();const state=snapshot();if(!truthSnapshot(state)){alert('Сначала загрузите актуальный файл 21vek заново. Текущий снимок создан старым парсером, экспорт рекомендации заблокирован.');return;}
  const targetDays=Math.max(1,Number(document.getElementById('tri-stock-days')?.value)||45),meta=state?.stockMeta||{};
  const rows=filteredStock(state).map(item=>{const c=calculate(item,state,targetDays);return{
    'Менеджер':item.manager_name,'Группа':item.assigned_group,'Артикул':item.sku,'Товар':item.product,'Продажи 3 мес.':c.sales90,
    'Прогноз 21vek':c.raw?.partner_forecast??'','Сезонность CRM':Number(c.seasonRatio.toFixed(3)),'Уровень сезонности':c.seasonLevel,'Мин. наблюдений сезона':c.seasonMinObs,'Прогноз CRM':c.forecast,
    'Доступно 21vek':c.partnerAvailable,'Свободно сейчас':c.raw?.free_now??'','В пути всего':c.raw?.in_transit??'','Свободно в пути':c.raw?.free_in_transit??'','Резерв 21vek':c.raw?.reserve??'',
    'Заказы 21vek':c.partnerOrders,'Рекомендуемый заказ':c.recommended,'Наш остаток Витебск':item.own_qty,'Отгрузить с Витебска':c.shipOwn,
    'Остаток Чехов':c.chekhovRaw,'Резерв Чехов':CHEKHOV_RESERVE,'Доступно Чехов сверх 50':c.chekhovAvailable,'Заказать из Чехова':c.orderChekhov,'Не покрыто':c.uncovered,
    'Почему рекомендовано':c.explanation,'Снимок 21vek':meta?.partner?.snapshot_date||'','Файл 21vek':meta?.partner?.source_file||'','Последняя отгрузка (месяц)':item.last_shipment_month,'Количество последней отгрузки':item.last_shipment_qty
  };}).sort((a,b)=>num(b['Рекомендуемый заказ'])-num(a['Рекомендуемый заказ']));
  const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(rows);XLSX.utils.book_append_sheet(wb,ws,'Рекомендация truth');XLSX.writeFile(wb,'Триовист_рекомендация_truth_'+new Date().toISOString().slice(0,10)+'.xlsx');
}

function skuFromCell(v){const s=String(v||'').trim().replace(/^'/,'');return /^\d+(?:\/\d+){1,6}$/.test(s)?s:'';}
function articleFromProduct(v){const a=String(v||'').match(SKU_RE);return a?.length?a[a.length-1]:'';}
function cellNum(v){if(v==null||v==='')return 0;if(typeof v==='number')return Number.isFinite(v)?v:0;const n=Number(String(v).replace(/\s/g,'').replace(',','.'));return Number.isFinite(n)?n:0;}
function findHeaderRow(aoa,source){
  for(let i=0;i<Math.min(source==='partner'?35:25,aoa.length);i++){const h=(aoa[i]||[]).map(compact);if(source==='partner'){if(h.some(x=>x==='номенклатура'||x.startsWith('номенклатура')||x.startsWith('наименование'))&&h.some(x=>x==='всего'||x.startsWith('всего')))return i;}else if(h.includes('номенклатура')&&h.includes('артикул'))return i;}return-1;
}
function parsePartner(aoa){
  const hr=findHeaderRow(aoa,'partner');if(hr<0)throw new Error('Не найдена шапка 21vek');const raw=aoa[hr]||[],h=raw.map(compact);
  const find=(...names)=>{for(const name of names){const k=compact(name),i=h.findIndex(v=>v===k||v.startsWith(k));if(i>=0)return i;}throw new Error('Нет колонки «'+names.join(' / ')+'»');};
  const opt=(...names)=>{for(const name of names){const k=compact(name),i=h.findIndex(v=>v===k||v.startsWith(k));if(i>=0)return i;}return-1;};
  const product= find('Номенклатура','Наименование'), partnerSku=opt('Артикул','Артикул 21vek','Код товара','ID товара','SKU'), kind=opt('Вид','Категория'), brand=opt('Производитель','Бренд');
  const sales3=opt('Продажи за 3 мес.','Продажи за 3 месяца','Продажи 3 мес.');
  const legacySales=h.map((v,i)=>(v.startsWith('продажиза')&&!v.startsWith('продажиза3мес'))?i:-1).filter(i=>i>=0).slice(-3);
  if(sales3<0&&legacySales.length<3)throw new Error('Не найдены продажи 21vek: нужна колонка «Продажи за 3 мес.» либо три старые колонки «Продажи за ...». «Статистика продаж» намеренно не используется.');
  const salesMode=sales3>=0?'three_month_total':'legacy_three_months';
  const stat2=opt('Статистика продаж2'),stat1=opt('Статистика продаж1'),total=find('Всего','Остаток всего'),reserve=opt('Резерв'),inTransit=opt('В пути'),orders=opt('Заказ','Заказы','В заказах'),partnerForecast=opt('Прогноз');
  const freeExact=[];h.forEach((v,i)=>{if(v==='свободно')freeExact.push(i);});let freeNow=-1,freeTransit=-1;
  const namedFreeTransit=opt('Свободно в пути','Свободно в пути и резерве');
  if(namedFreeTransit>=0)freeTransit=namedFreeTransit;
  if(inTransit>=0){freeNow=[...freeExact].reverse().find(i=>i<inTransit)??-1;if(freeTransit<0)freeTransit=freeExact.find(i=>i>inTransit)??-1;}else freeNow=freeExact[0]??opt('Доступно');
  if(freeNow<0)freeNow=opt('Доступно');
  const ownSkuCols=[];['Наш артикул','Артикул поставщика','Артикул производителя','SKU поставщика','SKU производителя','Код поставщика','Код производителя','Наш SKU'].forEach(n=>{const i=opt(n);if(i>=0&&!ownSkuCols.includes(i))ownSkuCols.push(i);});
  const rows=[],diag={header_row:hr+1,sales_mode:salesMode,sales_column:sales3>=0?String(raw[sales3]||''):legacySales.map(i=>String(raw[i]||'')).join(' + '),stat1_column:stat1>=0?String(raw[stat1]||''):null,stat2_column:stat2>=0?String(raw[stat2]||''):null,forecast_column:partnerForecast>=0?String(raw[partnerForecast]||''):null,free_now_column:freeNow>=0?String(raw[freeNow]||''):null,free_transit_column:freeTransit>=0?String(raw[freeTransit]||''):null,accepted:0,skipped:0,samples:[]};
  for(let i=hr+1;i<aoa.length;i++){
    const r=aoa[i]||[],p=String(r[product]||'').trim();if(!p)continue;const k=kind>=0?String(r[kind]||''):'',packed=compact(k+' '+p),excluded=p.includes('+')||packed.includes('комплект')||compact(p).includes('невыводить');let sku='';
    for(const c of ownSkuCols){sku=skuFromCell(r[c]);if(sku)break;}if(!sku&&partnerSku>=0)sku=skuFromCell(r[partnerSku]);if(!sku)sku=articleFromProduct(p);
    if(!sku){diag.skipped++;if(excluded)continue;continue;}if(/^900(?:\/|$)/i.test(sku)||/(^|[^0-9])900\s*(группа|гр\.?)([^0-9]|$)/i.test(k+' '+p)){diag.skipped++;continue;}
    const rawTotal=Math.max(0,cellNum(r[total])),rawReserve=Math.max(0,reserve>=0?cellNum(r[reserve]):0),freeCurrent=Math.max(0,freeNow>=0?cellNum(r[freeNow]):Math.max(0,rawTotal-rawReserve));
    const transitTotal=Math.max(0,inTransit>=0?cellNum(r[inTransit]):0),transitFree=Math.max(0,freeTransit>=0?cellNum(r[freeTransit]):0),available=freeCurrent+transitFree,s90=Math.max(0,sales3>=0?cellNum(r[sales3]):legacySales.reduce((a,c)=>a+cellNum(r[c]),0)),ord=Math.max(0,orders>=0?cellNum(r[orders]):0),pf=partnerForecast>=0?cellNum(r[partnerForecast]):null;
    const ps=partnerSku>=0?String(r[partnerSku]||'').trim():sku,note={truth_version:'v23.5.5',sales_3m:s90,stat_sales_2:stat2>=0?cellNum(r[stat2]):null,stat_sales_1:stat1>=0?cellNum(r[stat1]):null,total:rawTotal,free_now:freeCurrent,reserve:rawReserve,in_transit:transitTotal,free_in_transit:transitFree,partner_forecast:pf};
    rows.push({row_key:(ps||sku)+'|'+sku+'|'+p,partner_sku:ps||sku,sku,kind:k,brand:brand>=0?String(r[brand]||''):'',product:p,
      sales_m1:'0',sales_m2:'0',sales_m3:String(s90),sales_m1_label:'CRM truth: не используется',sales_m2_label:'CRM truth: не используется',sales_m3_label:sales3>=0?String(raw[sales3]||'Продажи за 3 мес.'):'CRM truth: сумма 3 старых месяцев',
      qty_total:String(available),qty_free:String(available),qty_transit_reserve:String(transitFree+rawReserve),qty_orders:String(ord),excluded,match_note:JSON.stringify(note)});
    if(diag.samples.length<8||['70/1/65','72/17/1','72/11/6','65/60'].includes(sku)){diag.samples.push({sku,sales3:s90,stat2:note.stat_sales_2,stat1:note.stat_sales_1,freeNow,transitTotal,transitFree,available,orders:ord,forecast:pf});if(diag.samples.length>12)diag.samples=diag.samples.slice(-12);}
  }
  diag.accepted=rows.length;if(rows.length<100)throw new Error('Слишком мало корректных SKU 21vek: '+rows.length);Object.defineProperty(rows,'_truthDiag',{value:diag,enumerable:false});return rows;
}
function parseChekhov(aoa){
  const hr=findHeaderRow(aoa,'chekhov');if(hr<0)throw new Error('Не найдена шапка Чехова');const raw=aoa[hr]||[],h=raw.map(compact),find=n=>{const k=compact(n),i=h.findIndex(v=>v===k||v.startsWith(k));if(i<0)throw new Error('Нет колонки «'+n+'»');return i;};
  const c={p:find('Номенклатура'),sku:find('Артикул'),box:find('Количество в коробке'),stock:find('Остаток'),near:find('Остаток рядом'),total:find('Сумма')},rows=[],seen=new Set();
  for(let i=hr+1;i<aoa.length;i++){const r=aoa[i]||[],sku=String(r[c.sku]||'').trim().replace(/^'/,'');if(!/^\d+(?:\/\d+){1,6}$/.test(sku)||/^900(?:\/|$)/i.test(sku))continue;if(seen.has(sku))throw new Error('Дубль Чехова: '+sku);seen.add(sku);rows.push({sku,product:String(r[c.p]||''),box_qty:String(cellNum(r[c.box])),qty_stock:String(cellNum(r[c.stock])),qty_nearby:String(cellNum(r[c.near])),qty_total:String(cellNum(r[c.total]))});}
  if(rows.length<100)throw new Error('Слишком мало строк Чехова: '+rows.length);return rows;
}
async function ensureXlsx(){
  if(window.XLSX)return window.XLSX;const existing=document.querySelector('script[data-triovist-xlsx-v2355]');if(existing){await new Promise((res,rej)=>{if(window.XLSX)return res();existing.addEventListener('load',res,{once:true});existing.addEventListener('error',rej,{once:true});});return window.XLSX;}
  await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';s.dataset.triovistXlsxV2355='1';s.onload=res;s.onerror=()=>rej(new Error('Не удалось загрузить модуль Excel'));document.head.appendChild(s);});if(!window.XLSX)throw new Error('Модуль Excel не инициализировался');return window.XLSX;
}
function status(msg){const e=document.getElementById('tri-stock-upload-status');if(e){e.style.display='block';e.style.whiteSpace='pre-wrap';e.textContent=msg;}}
function busy(v,source,done=0,total=0){document.querySelectorAll('.tri-stock-upload').forEach(b=>{b.disabled=v;if(!b.dataset.truthText)b.dataset.truthText=b.textContent;if(!v)b.textContent=b.dataset.truthText;else if(b.dataset.source===source)b.textContent=total?'Загрузка '+done+' из '+total+'…':'Проверка файла…';});}
function withTimeout(p,ms,label){let t;const q=new Promise((_,rej)=>t=setTimeout(()=>rej(new Error((label||'Операция')+' не завершена вовремя')),ms));return Promise.race([p,q]).finally(()=>clearTimeout(t));}
async function rpc(name,args,ms,label){const r=await withTimeout(db.rpc(name,args),ms,label);if(r?.error)throw r.error;return r?.data||{};}
function importId(source){try{return source+'-'+crypto.randomUUID();}catch(_){return source+'-'+Date.now()+'-'+Math.random().toString(36).slice(2);}}
function diagText(d){if(!d)return'';let s='Продажи 90 дней: только «'+d.sales_column+'». «Статистика продаж1/2» в продажи не складываются.\nДоступно 21vek: «'+(d.free_now_column||'расчёт из Всего−Резерв')+'» + «'+(d.free_transit_column||'нет свободного в пути')+'».';const samples=(d.samples||[]).filter(x=>['70/1/65','72/17/1','72/11/6','65/60'].includes(x.sku)).slice(0,4);if(samples.length)s+='\nКонтроль: '+samples.map(x=>x.sku+' продажи3м='+qty(x.sales3)+'; доступно='+qty(x.available)+(x.forecast!=null?'; прогноз21='+qty(x.forecast):'')).join(' | ');return s;}
async function uploadTruth(source,event){
  if(!canUpload()){alert('Загрузка остатков недоступна для этой учётной записи.');return;}const file=event?.target?.files?.[0];if(event?.target)event.target.value='';if(!file)return;const name=source==='partner'?'21vek':'Чехов';let id='';
  try{busy(true,source);status('Проверяю файл '+name+' по правилам '+VERSION+'…');const X=await ensureXlsx(),wb=X.read(await file.arrayBuffer(),{type:'array'});if(!wb.SheetNames?.length)throw new Error('В Excel нет листов');const aoa=X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:null,raw:true}),rows=source==='partner'?parsePartner(aoa):parseChekhov(aoa),d=rows._truthDiag||null;
    const text=(d?diagText(d):'Принято '+rows.length+' строк.')+'\n\nРабочий снимок заменится только после полной серверной проверки.';status('Файл проверен.\n'+text);if(!confirm('Загрузить '+rows.length+' строк из «'+file.name+'»?\n\n'+text))return;
    id=importId(source);await rpc('triovist_stock_stage_begin',{p_source:source,p_import_id:id},30000,'Начало загрузки');const batch=250;for(let off=0;off<rows.length;off+=batch){const part=rows.slice(off,off+batch),done=Math.min(off+part.length,rows.length);busy(true,source,done,rows.length);status(name+': '+done+' / '+rows.length+' строк…');await rpc('triovist_stock_stage_batch',{p_source:source,p_import_id:id,p_rows:part},45000,'Пакет остатков');}
    const sourceFile=(source==='partner'?SOURCE_MARK+' ':'')+file.name,result=await rpc('triovist_stock_stage_commit',{p_source:source,p_import_id:id,p_expected_rows:rows.length,p_source_file:sourceFile,p_snapshot_date:new Date().toISOString().slice(0,10)},90000,'Завершение загрузки');status('✅ '+name+': '+Number(result.rows||rows.length)+' строк. '+(d?'\n'+diagText(d):''));window.TRIOVIST_DATA_HUB_V227315?.invalidate?.('stock');alert('✅ Остатки '+name+' загружены корректно ('+VERSION+').');if(typeof window.triovistReload==='function')await window.triovistReload();else if(typeof window.renderTriovistStock==='function')window.renderTriovistStock();
  }catch(e){if(id){try{await db.rpc('triovist_stock_stage_abort',{p_source:source,p_import_id:id});}catch(_){}}status('❌ '+name+': '+(e?.message||e)+'\nСтарый рабочий снимок сохранён.');alert('Остатки '+name+' не загружены.\n\n'+(e?.message||e));}finally{busy(false,source);}
}

function selfTest(){
  const header=['Артикул','Вид','Производитель','Номенклатура','Статистика продаж2','Статистика продаж1','Продажи за 3 мес.','Всего','Свободно','Резерв','В пути','Свободно','Заказ','Прогноз'];
  const fixture=[header,['9044527','','Huter','Триммер Huter GET-12M-2Li (70/1/65)',126,42,14,193,191,0,0,0,2,23]];
  try{const r=parsePartner([...fixture,...Array.from({length:100},(_,i)=>['x'+i,'','','Товар '+i+' (71/2/'+(100+i)+')',0,0,1,1,1,0,0,0,0,1])]);const x=r.find(z=>z.sku==='70/1/65'),n=parseTruthNote(x?.match_note);if(!x||num(x.sales_m3)!==14||num(x.qty_total)!==191||num(n?.partner_forecast)!==23)throw new Error('fixture mismatch');return true;}catch(e){console.error('Triovist truth self-test failed',e);return false;}
}

function install(){
  if(installed)return true;if(typeof window.renderTriovistStock!=='function')return false;installed=true;baseRender=window.renderTriovistStock;baseExport=typeof window.triovistExportStock==='function'?window.triovistExportStock:null;
  window.renderTriovistStock=function(){const r=baseRender.apply(this,arguments);ensureProfile().then(()=>setTimeout(applyTruth,0)).catch(showProfileError);return r;};
  window.triovistExportStock=exportTruth;window.triovistUploadStock=uploadTruth;
  ensureProfile().then(()=>{if(document.getElementById('tri-stock-table'))window.renderTriovistStock();}).catch(showProfileError);
  return true;
}
let attempts=0;if(!install()){const timer=setInterval(()=>{attempts++;if(install()||attempts>80)clearInterval(timer);},125);}
window.RESANTA_TRIOVIST_SEASONAL_STOCK_V2350=Object.freeze({version:VERSION,truthVersion:VERSION,profile:PROFILE_VERSION,sourceMark:SOURCE_MARK,chekhovReserve:CHEKHOV_RESERVE,sales90Source:'Продажи за 3 мес.',partnerAvailable:'free_now + free_in_transit',noSalesTabTrend:true,seasonEvidenceFallback:true,selfTest:selfTest()});
})();
