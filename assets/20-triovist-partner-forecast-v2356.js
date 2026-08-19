/* RESANTA CRM · TRIOVIST CLIENT FORECAST TRUTH v23.5.6
 * Primary recommendation follows 21vek's own RZ from the uploaded file.
 * If RZ is unavailable, fallback = max(0, partner forecast - free now - free in transit).
 * CRM seasonal forecast remains an independent control signal only.
 * Existing 21vek orders are NOT added again because they are already reflected in free stock.
 * Vitebsk covers first, then Chekhov only above the permanent 50-unit reserve.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_PARTNER_FORECAST_V2356)return;

const VERSION='v23.5.6';
const TRUTH_VERSION='v23.5.5';
const SOURCE_MARK='[truth-v23.5.5]';
const FORECAST_MARK='[forecast-v23.5.6]';
const OLD_CACHE_KEY='resanta_triovist_partner_raw_v23552';
const PROFILE_URL='./data/triovist_seasonality.json?v=23.5.0';
const PROFILE_VERSION='v23.5.0';
const CHEKHOV_RESERVE=50;
const LEADERS=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
const MANAGERS=new Set(['aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru']);
const SKU_RE=/\d+(?:\/\d+){1,6}/g;
let profile=null,profilePromise=null,baseRender=null,installedRender=null;

const num=v=>Number(v)||0;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const norm=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,' ').replace(/\s+/g,' ').trim();
const compact=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,'');
const skuKey=v=>String(v||'').trim().replace(/^'/,'').toLowerCase();
const qty=v=>(Number(v)||0).toLocaleString('ru-RU',{maximumFractionDigits:3});
const one=v=>(Number(v)||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function currentProfileSafe(){try{return window.currentProfile||window.currentUser||{};}catch(_){return{};}}
function currentEmail(){return String(currentProfileSafe()?.email||'').trim().toLowerCase();}
function canUpload(){const p=currentProfileSafe(),e=currentEmail();return(p?.role==='boss'&&LEADERS.has(e))||(String(p?.access_scope||'').toLowerCase()==='triovist'&&MANAGERS.has(e));}
function snapshot(){try{return window.TRIOVIST_RUNTIME_STATE_V227324?.snapshot?.()||{};}catch(_){return{};}}
function parseDate(value){const s=String(value||'').slice(0,10),m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12):null;}
function addDays(d,n){const x=new Date(d.getTime());x.setDate(x.getDate()+n);return x;}
function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function referenceDate(state){const m=state?.stockMeta||{},c=[m?.partner?.snapshot_date,m?.own?.report_date,m?.chekhov?.snapshot_date,window.TODAY,new Date().toISOString().slice(0,10)];for(const v of c){const d=parseDate(v);if(d)return d;}return new Date();}
function cellNum(v){if(v==null||v==='')return 0;if(typeof v==='number')return Number.isFinite(v)?v:0;const n=Number(String(v).replace(/\s/g,'').replace(',','.'));return Number.isFinite(n)?n:0;}
function finiteOrNull(v){if(v==null||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function skuCell(v){const s=String(v||'').trim().replace(/^'/,'');return /^\d+(?:\/\d+){1,6}$/.test(s)?s:'';}
function skuProduct(v){const a=String(v||'').match(SKU_RE);return a?.length?a[a.length-1]:'';}

async function ensureProfile(){if(profile)return profile;if(profilePromise)return profilePromise;profilePromise=fetch(PROFILE_URL,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('Профиль сезонности HTTP '+r.status);return r.json();}).then(p=>{if(!p||p.version!==PROFILE_VERSION||!p.levels)throw new Error('Некорректный профиль сезонности');profile=p;return p;}).finally(()=>{profilePromise=null;});return profilePromise;}
function targetMonthWeights(asOf,days){const out=new Map(),n=Math.max(1,Math.round(days||1));for(let i=0;i<n;i++){const m=addDays(asOf,i).getMonth();out.set(m,(out.get(m)||0)+1);}return out;}
function observationEvidence(entry,asOf,days){if(!entry)return{minObs:0,weightedObs:0};const weights=targetMonthWeights(asOf,days),obs=Array.isArray(entry.observations)?entry.observations:[];let minObs=Infinity,sum=0,total=0;for(const [m,w] of weights){const o=num(obs[m]);minObs=Math.min(minObs,o);sum+=o*w;total+=w;}return{minObs:Number.isFinite(minObs)?minObs:0,weightedObs:total?sum/total:0};}
function qualifies(entry,level,asOf,days){if(!entry)return false;const e=observationEvidence(entry,asOf,days),conf=num(entry.confidence),active=num(entry.active_months),total=num(entry.total_qty);if(level==='SKU')return conf>=0.70&&active>=18&&total>=24&&e.minObs>=2;if(level==='подгруппа')return conf>=0.60&&active>=18&&e.minObs>=2;return active>=12&&e.minObs>=1;}
function chooseSeason(item,asOf,days){if(!profile)return{entry:null,level:'нет истории',evidence:{minObs:0,weightedObs:0}};const l=profile.levels||{},sku=l.sku?.[norm(item?.sku)],sub=l.subgroup?.[norm(item?.subgroup)],cat=l.category?.[norm(item?.category)]||l.category?.[norm(item?.assigned_group)];if(qualifies(sku,'SKU',asOf,days))return{entry:sku,level:'SKU',evidence:observationEvidence(sku,asOf,days)};if(qualifies(sub,'подгруппа',asOf,days))return{entry:sub,level:'подгруппа',evidence:observationEvidence(sub,asOf,days)};if(qualifies(cat,'группа',asOf,days))return{entry:cat,level:'группа',evidence:observationEvidence(cat,asOf,days)};return{entry:null,level:'нет достаточной истории',evidence:{minObs:0,weightedObs:0}};}
function factorFor(entry,date){if(!entry||!Array.isArray(entry.factors))return 1;return clamp(num(entry.factors[date.getMonth()])||1,0.35,2.5);}
function averageFactor(entry,start,days){const n=Math.max(1,Math.round(days||1));let s=0;for(let i=0;i<n;i++)s+=factorFor(entry,addDays(start,i));return s/n;}
function seasonMetrics(item,asOf,targetDays){const p=chooseSeason(item,asOf,targetDays);if(!p.entry)return{ratio:1,level:p.level,confidence:0,minObs:0};const future=averageFactor(p.entry,asOf,targetDays),past=averageFactor(p.entry,addDays(asOf,-89),90),raw=past>0?future/past:1,reliability=clamp(num(p.entry.confidence),0,1)*clamp(num(p.evidence.minObs)/3,0,1),ratio=clamp(1+(raw-1)*reliability,0.50,1.80);return{ratio,level:p.level,confidence:num(p.entry.confidence),minObs:num(p.evidence.minObs)};}

function parseTruthNote(v){if(v&&typeof v==='object'&&v.truth_version===TRUTH_VERSION)return v;const s=String(v||'').trim();if(!s.startsWith('{'))return null;try{const x=JSON.parse(s);return x?.truth_version===TRUTH_VERSION?x:null;}catch(_){return null;}}
function readRawCache(){try{const live=window.RESANTA_TRIOVIST_PARTNER_RAW_CACHE_V23552;if(live?.rows)return live;const x=JSON.parse(localStorage.getItem(OLD_CACHE_KEY)||'null');return x?.rows?x:null;}catch(_){return null;}}
function sourceMatches(cache,state){const sf=String(state?.stockMeta?.partner?.source_file||'');if(!cache||!sf||!sf.includes(SOURCE_MARK))return false;const cf=String(cache.source_file||'');return sf===cf||(!cf&&sf.endsWith(String(cache.file_name||'')))||sf.endsWith(String(cache.file_name||''));}
function ensureRawOnStockItems(state=snapshot()){
  const items=Array.isArray(state.stockItems)?state.stockItems:[],cache=readRawCache();if(!cache||!sourceMatches(cache,state))return{ok:false,reason:'cache_missing',cache,items};let injected=0,missing=0,mismatch=[];
  for(const item of items){let raw=parseTruthNote(item?.match_note);if(!raw){raw=cache.rows?.[skuKey(item?.sku)]||null;if(raw){const available=cellNum(raw.free_now)+cellNum(raw.free_in_transit),dashboard=cellNum(item?.partner_total);if(Math.abs(available-dashboard)<=0.011){item.match_note=JSON.stringify(raw);injected++;}else{mismatch.push({sku:item?.sku,available,dashboard});raw=null;}}}if(!raw)missing++;}
  return{ok:missing===0,reason:missing?(mismatch.length?'mismatch':'missing_sku'):'',missing,injected,mismatch,cache,items};
}

function calculate(item,state,targetDays){
  const raw=parseTruthNote(item?.match_note),asOf=referenceDate(state),season=seasonMetrics(item,asOf,targetDays),sales90=Math.max(0,num(item?.sales_90));
  const crmForecastRaw=(sales90/90)*targetDays*season.ratio,crmForecast=Math.max(0,Math.ceil(crmForecastRaw-1e-9));
  const partnerForecast=raw?.partner_forecast==null?null:Math.max(0,num(raw.partner_forecast)),partnerRz=raw?.partner_rz==null?null:Math.max(0,num(raw.partner_rz));
  const partnerAvailable=Math.max(0,num(item?.partner_total)),partnerOrders=Math.max(0,num(item?.partner_orders));
  const forecastNeed=partnerForecast==null?null:Math.max(0,Math.ceil(partnerForecast-partnerAvailable-1e-9));
  const recommended=partnerRz!=null?Math.max(0,Math.round(partnerRz)):forecastNeed!=null?forecastNeed:Math.max(0,Math.ceil(crmForecastRaw-partnerAvailable-1e-9));
  const basis=partnerRz!=null?'РЗ 21vek':partnerForecast!=null?'Прогноз 21vek − доступно':'CRM-контроль';
  const ownAvailable=Math.max(0,Math.floor(num(item?.own_qty)+1e-9)),chekhovRaw=Math.max(0,Math.floor(num(item?.chekhov_qty)+1e-9)),chekhovAvailable=Math.max(0,chekhovRaw-CHEKHOV_RESERVE);
  const shipOwn=Math.min(recommended,ownAvailable),afterOwn=Math.max(0,recommended-shipOwn),orderChekhov=Math.min(afterOwn,chekhovAvailable),uncovered=Math.max(0,afterOwn-orderChekhov);
  const demandForDays=partnerForecast!=null?partnerForecast:crmForecastRaw,perDay=targetDays>0?demandForDays/targetDays:0,stockDays=perDay>0?partnerAvailable/perDay:null;
  const divergence=partnerForecast!=null&&crmForecast>0?partnerForecast/crmForecast:partnerForecast!=null&&crmForecast===0?(partnerForecast>0?Infinity:1):null;
  let explanation='';
  if(partnerRz!=null){explanation='21vek: прогноз '+qty(partnerForecast)+' → свободно сейчас '+qty(raw?.free_now)+' + свободно в пути '+qty(raw?.free_in_transit)+' → РЗ из файла '+qty(partnerRz)+'. Заказы '+qty(partnerOrders)+' уже отражены в свободном остатке и второй раз не прибавляются.';}
  else if(partnerForecast!=null){explanation='21vek: прогноз '+qty(partnerForecast)+' − доступно '+qty(partnerAvailable)+' = потребность '+qty(recommended)+'. Заказы '+qty(partnerOrders)+' уже отражены в свободном остатке и второй раз не прибавляются.';}
  else{explanation='В файле 21vek нет прогноза/RЗ: временный fallback CRM '+qty(crmForecast)+' − доступно '+qty(partnerAvailable)+' = '+qty(recommended)+'.';}
  explanation+=' CRM-контроль: продажи 3 мес. '+qty(sales90)+' × сезон '+season.ratio.toFixed(2)+' ('+season.level+') → '+qty(crmForecast)+'. Покрытие: Витебск '+qty(shipOwn)+' → Чехов сверх 50 '+qty(orderChekhov)+' → не покрыто '+qty(uncovered)+'.';
  return{asOf:ymd(asOf),targetDays,sales90,crmForecast,crmForecastRaw,seasonRatio:season.ratio,seasonLevel:season.level,seasonMinObs:season.minObs,partnerForecast,partnerRz,partnerAvailable,partnerOrders,forecastNeed,recommended,basis,ownAvailable,chekhovRaw,chekhovAvailable,shipOwn,orderChekhov,uncovered,stockDays,divergence,raw,explanation};
}

function decorateItems(state,targetDays){const r=ensureRawOnStockItems(state);for(const item of Array.isArray(state?.stockItems)?state.stockItems:[]){const c=calculate(item,state,targetDays);item.recommended=c.recommended;item.ship_own=c.shipOwn;item.order_chekhov=c.orderChekhov;item.uncovered=c.uncovered;item.stock_days=c.stockDays;item.partner_forecast=c.partnerForecast;item.partner_rz=c.partnerRz;item.recommendation_basis=c.basis;}return r;}
function divergenceText(c){if(c.partnerForecast==null)return'нет прогноза 21vek';if(!Number.isFinite(c.divergence))return c.partnerForecast>0?'⚠ CRM=0':'совпадает';const d=c.divergence;return d>=1.8||d<=0.55?'⚠ ×'+d.toFixed(2):'×'+d.toFixed(2);}

function applyUi(){
  if(!profile)return;const root=document.getElementById('tri-stock-table'),table=root?.querySelector('table.tri-stock-table');if(!root||!table)return;const state=snapshot(),targetDays=Math.max(1,Number(document.getElementById('tri-stock-days')?.value)||45),rawState=decorateItems(state,targetDays);
  let note=document.getElementById('tri-partner-forecast-note-v2356');if(!note){note=document.createElement('div');note.id='tri-partner-forecast-note-v2356';root.prepend(note);}note.className='tri-ok';note.innerHTML='<b>Рекомендация '+VERSION+' · логика 21vek.</b> Основная потребность = <b>РЗ из файла 21vek</b>. Если РЗ нет — прогноз 21vek минус свободно сейчас и свободно в пути. Колонка «Заказы» повторно не прибавляется. CRM-прогноз и сезонность — независимый контроль. Витебск покрывает первым, Чехов — только остаток сверх 50.'+(rawState.ok?'':'<div class="tri-note" style="margin-top:4px">⚠ Для точного РЗ загрузите текущий файл 21vek один раз после обновления.</div>');
  const th=table.querySelectorAll('thead th');if(th.length>=14){th[4].textContent='Доступно 21vek';th[5].textContent='Заказы 21vek';th[9].textContent='Рекоменд. заказ';}
  const bySku=new Map((state.stockItems||[]).map(x=>[norm(x?.sku),x])),tbody=table.querySelector('tbody');if(!tbody)return;const rows=[...tbody.querySelectorAll('tr')];
  for(const tr of rows){const cells=tr.children;if(cells.length<14)continue;const skuText=cells[2]?.querySelector('b')?.textContent||cells[2]?.textContent||'',item=bySku.get(norm(skuText));if(!item)continue;const c=calculate(item,state,targetDays);
    cells[4].innerHTML='<b>'+qty(c.partnerAvailable)+'</b>'+(c.raw?'<div class="tri-note">свободно '+qty(c.raw.free_now)+' + свободно в пути '+qty(c.raw.free_in_transit)+'</div>':'');
    cells[6].innerHTML=c.stockDays==null?'—':one(c.stockDays);
    cells[9].innerHTML='<b>'+qty(c.recommended)+'</b><div class="tri-note"><b>'+esc(c.basis)+'</b>'+(c.partnerForecast!=null?' · прогноз 21vek '+qty(c.partnerForecast):'')+(c.partnerRz!=null?' · РЗ '+qty(c.partnerRz):'')+' · CRM-контроль '+qty(c.crmForecast)+' · '+esc(divergenceText(c))+'</div><details class="tri-note"><summary style="cursor:pointer">Почему столько?</summary>'+esc(c.explanation)+'</details>';
    cells[10].innerHTML=qty(c.shipOwn);cells[11].innerHTML=qty(c.orderChekhov)+'<div class="tri-note">из доступных '+qty(c.chekhovAvailable)+'</div>';cells[12].innerHTML='<b>'+qty(c.uncovered)+'</b>';cells[12].className=c.uncovered>0?'tri-uncovered':'';tr.dataset.truthRecommended=String(c.recommended);
  }
  rows.sort((a,b)=>num(b.dataset.truthRecommended)-num(a.dataset.truthRecommended));for(const tr of rows)tbody.appendChild(tr);
}

function installRender(){const fn=window.renderTriovistStock;if(typeof fn!=='function')return false;if(fn.__partnerForecastV2356)return true;baseRender=fn;const wrapped=function(){const state=snapshot();ensureRawOnStockItems(state);const out=baseRender.apply(this,arguments);Promise.resolve(ensureProfile()).then(()=>applyUi()).catch(e=>console.warn('Triovist v23.5.6 profile',e));return out;};wrapped.__partnerForecastV2356=true;window.renderTriovistStock=wrapped;installedRender=wrapped;return true;}

function filteredStock(state){let mgr=String(document.getElementById('tri-manager-filter')?.value||'all').toLowerCase();const p=currentProfileSafe(),email=currentEmail();if(String(p?.access_scope||'').toLowerCase()==='triovist'&&!LEADERS.has(email))mgr=email;const q=norm(document.getElementById('tri-stock-search')?.value||'');return(Array.isArray(state?.stockItems)?state.stockItems:[]).filter(x=>(mgr==='all'||String(x?.manager_email||'').toLowerCase()===mgr)&&(!q||norm([x?.sku,x?.product,x?.assigned_group,x?.brand].join(' ')).includes(q)));}
async function ensureXlsx(){if(window.XLSX)return window.XLSX;await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';s.onload=res;s.onerror=()=>rej(new Error('Не удалось загрузить модуль Excel'));document.head.appendChild(s);});if(!window.XLSX)throw new Error('Модуль Excel не загрузился');return window.XLSX;}
async function exportV2356(){
  await ensureProfile();const X=await ensureXlsx(),state=snapshot(),rawState=ensureRawOnStockItems(state);if(!rawState.ok){alert('Для точного файла клиенту один раз заново загрузите актуальный Excel 21vek после обновления. Это сохранит колонку РЗ и исходные остатки.');return;}const targetDays=Math.max(1,Number(document.getElementById('tri-stock-days')?.value)||45),meta=state.stockMeta||{};decorateItems(state,targetDays);
  const rows=filteredStock(state).map(item=>{const c=calculate(item,state,targetDays),raw=c.raw||{};return{
    'Менеджер':item.manager_name,'Группа':item.assigned_group,'Артикул':item.sku,'Товар':item.product,'Продажи 3 мес.':c.sales90,
    'Прогноз 21vek':c.partnerForecast??'','РЗ 21vek':c.partnerRz??'','Прогноз CRM (контроль)':c.crmForecast,'Сезонность CRM':Number(c.seasonRatio.toFixed(3)),'Уровень сезонности':c.seasonLevel,'Расхождение 21vek / CRM':c.partnerForecast==null?'':(Number.isFinite(c.divergence)?Number(c.divergence.toFixed(3)):'∞'),
    'Доступно 21vek':c.partnerAvailable,'Свободно сейчас':raw.free_now??'','В пути всего':raw.in_transit??'','Свободно в пути':raw.free_in_transit??'','Резерв 21vek':raw.reserve??'','Заказы 21vek (справочно)':c.partnerOrders,
    'Рекомендуемый заказ':c.recommended,'Основание рекомендации':c.basis,'Наш остаток Витебск':item.own_qty,'Отгрузить с Витебска':c.shipOwn,'Остаток Чехов':c.chekhovRaw,'Резерв Чехов':CHEKHOV_RESERVE,'Доступно Чехов сверх 50':c.chekhovAvailable,'Заказать из Чехова':c.orderChekhov,'Не покрыто':c.uncovered,
    'Почему рекомендовано':c.explanation,'Снимок 21vek':meta?.partner?.snapshot_date||'','Файл 21vek':meta?.partner?.source_file||'','Последняя отгрузка (месяц)':item.last_shipment_month,'Количество последней отгрузки':item.last_shipment_qty
  };}).sort((a,b)=>num(b['Рекомендуемый заказ'])-num(a['Рекомендуемый заказ']));
  const wb=X.utils.book_new(),ws=X.utils.json_to_sheet(rows);X.utils.book_append_sheet(wb,ws,'Рекомендация 21vek');X.writeFile(wb,'Триовист_рекомендация_21vek_'+new Date().toISOString().slice(0,10)+'.xlsx');
}
function installExport(){const fn=window.triovistExportStock;if(typeof fn!=='function')return false;if(fn.__partnerForecastV2356)return true;const wrapped=function(){exportV2356().catch(e=>{console.error(e);alert('Не удалось выгрузить рекомендацию: '+(e?.message||e));});};wrapped.__partnerForecastV2356=true;window.triovistExportStock=wrapped;return true;}

function findHeader(aoa){for(let i=0;i<Math.min(35,aoa.length);i++){const h=(aoa[i]||[]).map(compact),p=h.some(v=>v==='номенклатура'||v.startsWith('номенклатура')||v.startsWith('наименование')),t=h.some(v=>v==='всего'||v.startsWith('всего'));if(p&&t)return i;}return-1;}
function cols(raw){const h=raw.map(compact);return{h,find:(...names)=>{for(const n of names){const k=compact(n),i=h.findIndex(v=>v===k||v.startsWith(k));if(i>=0)return i;}throw new Error('Нет колонки «'+names.join(' / ')+'»');},opt:(...names)=>{for(const n of names){const k=compact(n),i=h.findIndex(v=>v===k||v.startsWith(k));if(i>=0)return i;}return-1;}};}
function aggregateRaw(map,sku,note){const k=skuKey(sku);if(!k)return;let x=map[k];if(!x)x=map[k]={truth_version:TRUTH_VERSION,sales_3m:0,stat_sales_2:0,stat_sales_1:0,total:0,free_now:0,reserve:0,in_transit:0,free_in_transit_raw:0,free_in_transit:0,partner_forecast:null,partner_rz:null,source_rows:0};x.sales_3m+=cellNum(note.sales_3m);x.total+=cellNum(note.total);x.free_now+=cellNum(note.free_now);x.reserve+=cellNum(note.reserve);x.in_transit+=cellNum(note.in_transit);x.free_in_transit_raw+=cellNum(note.free_in_transit_raw);x.free_in_transit+=cellNum(note.free_in_transit);x.source_rows++;if(note.stat_sales_2!=null)x.stat_sales_2+=cellNum(note.stat_sales_2);if(note.stat_sales_1!=null)x.stat_sales_1+=cellNum(note.stat_sales_1);if(note.partner_forecast!=null)x.partner_forecast=(x.partner_forecast==null?0:x.partner_forecast)+cellNum(note.partner_forecast);if(note.partner_rz!=null)x.partner_rz=(x.partner_rz==null?0:x.partner_rz)+cellNum(note.partner_rz);}
function parsePartner(aoa){
  const hr=findHeader(aoa);if(hr<0)throw new Error('Не найдена шапка 21vek');const raw=aoa[hr]||[],c=cols(raw),h=c.h,product=c.find('Номенклатура','Наименование'),partnerSku=c.opt('Артикул','Артикул 21vek','Код товара','ID товара','SKU'),kind=c.opt('Вид','Категория'),brand=c.opt('Производитель','Бренд'),sales3=c.opt('Продажи за 3 мес.','Продажи за 3 месяца','Продажи 3 мес.'),legacy=h.map((v,i)=>(v.startsWith('продажиза')&&!v.startsWith('продажиза3мес'))?i:-1).filter(i=>i>=0).slice(-3);if(sales3<0&&legacy.length<3)throw new Error('Не найдена колонка «Продажи за 3 мес.»');
  const stat2=c.opt('Статистика продаж2'),stat1=c.opt('Статистика продаж1'),total=c.find('Всего','Остаток всего'),reserve=c.opt('Резерв'),transit=c.opt('В пути'),orders=c.opt('Заказ','Заказы','В заказах'),forecast=c.opt('Прогноз'),rz=c.opt('РЗ','Рекомендованный заказ','Рекомендация заказа');
  const freeExact=[];h.forEach((v,i)=>{if(v==='свободно')freeExact.push(i);});let freeNow=-1,freeTransit=-1;const named=c.opt('Свободно в пути','Свободно в пути и резерве');if(named>=0)freeTransit=named;if(transit>=0){const before=freeExact.filter(i=>i<transit),after=freeExact.filter(i=>i>transit);freeNow=before.length?before[before.length-1]:-1;if(freeTransit<0&&after.length)freeTransit=after[0];}else if(freeExact.length)freeNow=freeExact[0];if(freeNow<0)freeNow=c.opt('Доступно');
  const own=[];['Наш артикул','Артикул поставщика','Артикул производителя','SKU поставщика','SKU производителя','Код поставщика','Код производителя','Наш SKU'].forEach(n=>{const i=c.opt(n);if(i>=0&&!own.includes(i))own.push(i);});const rows=[],rawBySku={};
  for(let i=hr+1;i<aoa.length;i++){const r=aoa[i]||[],p=String(r[product]||'').trim();if(!p)continue;const k=kind>=0?String(r[kind]||''):'',packed=compact(k+' '+p),excluded=p.includes('+')||packed.includes('комплект')||compact(p).includes('невыводить');let sku='';for(const x of own){sku=skuCell(r[x]);if(sku)break;}if(!sku&&partnerSku>=0)sku=skuCell(r[partnerSku]);if(!sku)sku=skuProduct(p);if(!sku||/^900(?:\/|$)/i.test(sku))continue;
    const rawTotal=Math.max(0,cellNum(r[total])),rawReserve=Math.max(0,reserve>=0?cellNum(r[reserve]):0),freeCurrent=Math.max(0,freeNow>=0?cellNum(r[freeNow]):Math.max(0,rawTotal-rawReserve)),transitTotal=Math.max(0,transit>=0?cellNum(r[transit]):0),transitFreeRaw=Math.max(0,freeTransit>=0?cellNum(r[freeTransit]):0),transitFree=transit>=0?Math.min(transitFreeRaw,transitTotal):transitFreeRaw,available=freeCurrent+transitFree,sales90=Math.max(0,sales3>=0?cellNum(r[sales3]):legacy.reduce((a,x)=>a+cellNum(r[x]),0)),ord=Math.max(0,orders>=0?cellNum(r[orders]):0),pf=forecast>=0?finiteOrNull(r[forecast]):null,prz=rz>=0?finiteOrNull(r[rz]):null,ps=partnerSku>=0?String(r[partnerSku]||'').trim():sku;
    const note={truth_version:TRUTH_VERSION,sales_3m:sales90,stat_sales_2:stat2>=0?cellNum(r[stat2]):null,stat_sales_1:stat1>=0?cellNum(r[stat1]):null,total:rawTotal,free_now:freeCurrent,reserve:rawReserve,in_transit:transitTotal,free_in_transit_raw:transitFreeRaw,free_in_transit:transitFree,partner_forecast:pf,partner_rz:prz};
    rows.push({row_key:(ps||sku)+'|'+sku+'|'+p,partner_sku:ps||sku,sku,kind:k,brand:brand>=0?String(r[brand]||''):'',product:p,sales_m1:'0',sales_m2:'0',sales_m3:String(sales90),sales_m1_label:'CRM truth: не используется',sales_m2_label:'CRM truth: не используется',sales_m3_label:sales3>=0?String(raw[sales3]||'Продажи за 3 мес.'):'CRM truth: сумма 3 старых месяцев',qty_total:String(available),qty_free:String(available),qty_transit_reserve:String(transitFree+rawReserve),qty_orders:String(ord),excluded,match_note:JSON.stringify(note)});if(!excluded)aggregateRaw(rawBySku,sku,note);
  }
  if(rows.length<100)throw new Error('Файл 21vek распознан, но корректных SKU слишком мало: '+rows.length);Object.defineProperty(rows,'_rawBySku',{value:rawBySku,enumerable:false});return rows;
}
function status(s){const e=document.getElementById('tri-stock-upload-status');if(e){e.style.display='block';e.style.whiteSpace='pre-wrap';e.textContent=s;}}
function busy(v,source,done=0,total=0){document.querySelectorAll('.tri-stock-upload').forEach(b=>{b.disabled=v;if(!b.dataset.v2356Text)b.dataset.v2356Text=b.textContent;if(!v)b.textContent=b.dataset.v2356Text;else if(b.dataset.source===source)b.textContent=total?'Загрузка '+done+' из '+total+'…':'Проверка файла…';});}
function timeout(p,ms,label){let t;const q=new Promise((_,rej)=>t=setTimeout(()=>rej(new Error(label+' не завершено вовремя')),ms));return Promise.race([p,q]).finally(()=>clearTimeout(t));}
async function rpc(name,args,ms,label){const r=await timeout(db.rpc(name,args),ms,label);if(r?.error)throw r.error;return r?.data||{};}
function iid(source){try{return source+'-'+crypto.randomUUID();}catch(_){return source+'-'+Date.now()+'-'+Math.random().toString(36).slice(2);}}
function saveRawCache(file,sourceFile,rows){try{const payload={version:'v23.5.5.2',truth_version:TRUTH_VERSION,source_file:sourceFile,file_name:file?.name||'',snapshot_date:new Date().toISOString().slice(0,10),saved_at:new Date().toISOString(),rows:rows?._rawBySku||{},row_count:Object.keys(rows?._rawBySku||{}).length,forecast_version:VERSION};localStorage.setItem(OLD_CACHE_KEY,JSON.stringify(payload));window.RESANTA_TRIOVIST_PARTNER_RAW_CACHE_V23552=payload;return payload;}catch(e){console.warn('Triovist v23.5.6 raw cache save failed',e);return null;}}
async function uploadPartner(event){
  if(!canUpload()){alert('Загрузка остатков недоступна для этой учётной записи.');return;}const file=event?.target?.files?.[0];if(event?.target)event.target.value='';if(!file)return;let id='';try{busy(true,'partner');status('Проверяю 21vek по правилам '+VERSION+'…');const X=await ensureXlsx(),wb=X.read(await file.arrayBuffer(),{type:'array'});if(!wb.SheetNames?.length)throw new Error('В Excel нет листов');const aoa=X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,defval:null,raw:true}),rows=parsePartner(aoa);if(!confirm('Загрузить '+rows.length+' строк из «'+file.name+'»?\n\nБудут сохранены Прогноз и РЗ 21vek. Рекомендация CRM будет повторять РЗ клиента, а наша сезонность останется контрольной.'))return;id=iid('partner');await rpc('triovist_stock_stage_begin',{p_source:'partner',p_import_id:id},30000,'Начало загрузки');for(let off=0;off<rows.length;off+=250){const batch=rows.slice(off,off+250),done=Math.min(off+batch.length,rows.length);busy(true,'partner',done,rows.length);status('21vek: '+done+' / '+rows.length+' строк…');await rpc('triovist_stock_stage_batch',{p_source:'partner',p_import_id:id,p_rows:batch},45000,'Пакет загрузки');}const sourceFile=SOURCE_MARK+' '+FORECAST_MARK+' '+file.name,r=await rpc('triovist_stock_stage_commit',{p_source:'partner',p_import_id:id,p_expected_rows:rows.length,p_source_file:sourceFile,p_snapshot_date:new Date().toISOString().slice(0,10)},90000,'Финальная проверка');saveRawCache(file,sourceFile,rows);status('✅ 21vek: '+Number(r.rows||rows.length)+' строк. Прогноз и РЗ сохранены.');window.TRIOVIST_DATA_HUB_V227315?.invalidate?.('stock');alert('✅ 21vek загружен по логике '+VERSION+'.');if(typeof window.triovistReload==='function')await window.triovistReload();else window.renderTriovistStock?.();}catch(e){if(id){try{await db.rpc('triovist_stock_stage_abort',{p_source:'partner',p_import_id:id});}catch(_){}}status('❌ 21vek: '+(e?.message||e)+'\nСтарый рабочий снимок сохранён.');alert('21vek не загружен.\n\n'+(e?.message||e));}finally{busy(false,'partner');}}
function installUpload(){const fn=window.triovistUploadStock;if(typeof fn!=='function')return false;if(fn.__partnerForecastV2356)return true;const base=fn,wrapped=function(source,event){if(source==='partner')return uploadPartner(event);return base.call(this,source,event);};wrapped.__partnerForecastV2356=true;window.triovistUploadStock=wrapped;return true;}

function installHub(){try{const hub=window.TRIOVIST_DATA_HUB_V227315;if(!hub||typeof hub.stock!=='function'||hub.stock.__partnerForecastV2356)return false;const base=hub.stock.bind(hub),wrapped=async function(args){const data=await base(args);try{await ensureProfile();const state={stockItems:Array.isArray(data?.items)?data.items:[],stockMeta:data?.imports||{}},targetDays=Math.max(1,Number(args?.p_target_days)||45);ensureRawOnStockItems(state);decorateItems(state,targetDays);}catch(e){console.warn('Triovist hub v23.5.6 decorate failed',e);}return data;};wrapped.__partnerForecastV2356=true;hub.stock=wrapped;return true;}catch(_){return false;}}

function installAll(){installUpload();installRender();installExport();installHub();}
ensureProfile().catch(e=>console.warn('Triovist v23.5.6 profile load',e));installAll();let tries=0;const timer=setInterval(()=>{tries++;installAll();if(tries>80)clearInterval(timer);},250);
window.RESANTA_TRIOVIST_PARTNER_FORECAST_V2356=Object.freeze({version:VERSION,primaryRecommendation:'partner RZ',fallback:'partner forecast - free now - free in transit',orders:'diagnostic only; not added twice',crmForecast:'control only',chekhovReserve:CHEKHOV_RESERVE,requiresReuploadForExactRz:true});
})();
