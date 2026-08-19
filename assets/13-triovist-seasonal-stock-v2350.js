/* RESANTA CRM · TRIOVIST SEASONAL STOCK v23.5.0
 * Adds seasonality to the existing stock recommendation without new Supabase RPCs.
 * Source: current stock dashboard + verified static 1C history profile.
 * Agreed rules:
 *   demand = recent 90-day sales adjusted for future seasonality and current pace;
 *   recommended = demand + 21vek orders - current 21vek stock;
 *   fulfil from Vitebsk first;
 *   Chekhov has a permanent 50-unit reserve, only stock ABOVE 50 is available;
 *   uncovered = demand not covered by Vitebsk + available Chekhov.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_SEASONAL_STOCK_V2350)return;

const VERSION='v23.5.0';
const PROFILE_URL='./data/triovist_seasonality.json?v=23.5.0';
const CHEKHOV_RESERVE=50;
const LEADERS=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
let profile=null,profilePromise=null,originalRender=null,originalExport=null;

const num=v=>Number(v)||0;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const norm=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,' ').replace(/\s+/g,' ').trim();
const qty=v=>(Number(v)||0).toLocaleString('ru-RU',{maximumFractionDigits:3});
const one=v=>(Number(v)||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});

function parseDate(value){
  const s=String(value||'').slice(0,10);
  const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return null;
  return new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12,0,0,0);
}
function addDays(d,n){const x=new Date(d.getTime());x.setDate(x.getDate()+n);return x;}
function ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function ym(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
function daysInMonth(d){return new Date(d.getFullYear(),d.getMonth()+1,0).getDate();}

function snapshot(){
  try{return window.TRIOVIST_RUNTIME_STATE_V227324?.snapshot?.()||{};}catch(_){return{};}
}
function currentProfileSafe(){
  try{return window.currentProfile||window.currentUser||{};}catch(_){return{};}
}
function currentEmail(){return String(currentProfileSafe()?.email||'').trim().toLowerCase();}

function referenceDate(state){
  const meta=state?.stockMeta||{};
  const candidates=[meta?.partner?.snapshot_date,meta?.own?.report_date,meta?.chekhov?.snapshot_date,window.TODAY,new Date().toISOString().slice(0,10)];
  for(const value of candidates){const d=parseDate(value);if(d)return d;}
  return new Date();
}

async function ensureProfile(){
  if(profile)return profile;
  if(profilePromise)return profilePromise;
  profilePromise=fetch(PROFILE_URL,{cache:'no-store'})
    .then(r=>{if(!r.ok)throw new Error('Профиль сезонности HTTP '+r.status);return r.json();})
    .then(data=>{
      if(!data||data.version!=='v23.5.0'||!data.levels)throw new Error('Некорректный профиль сезонности');
      profile=data;return data;
    })
    .finally(()=>{profilePromise=null;});
  return profilePromise;
}

function chooseSeason(item){
  if(!profile)return{entry:null,level:'нет истории'};
  const levels=profile.levels||{};
  const sku=levels.sku?.[norm(item?.sku)];
  if(sku&&num(sku.confidence)>=0.55)return{entry:sku,level:'SKU'};
  const subgroup=levels.subgroup?.[norm(item?.subgroup)];
  if(subgroup&&num(subgroup.confidence)>=0.55)return{entry:subgroup,level:'подгруппа'};
  const category=levels.category?.[norm(item?.category)]||levels.category?.[norm(item?.assigned_group)];
  if(category)return{entry:category,level:'группа'};
  return{entry:null,level:'нет истории'};
}
function factorFor(entry,date){
  if(!entry||!Array.isArray(entry.factors))return 1;
  return clamp(num(entry.factors[date.getMonth()])||1,0.35,2.5);
}
function averageFactor(entry,start,days){
  const n=Math.max(1,Math.round(days||1));let sum=0;
  for(let i=0;i<n;i++)sum+=factorFor(entry,addDays(start,i));
  return sum/n;
}
function seasonMetrics(item,asOf,targetDays){
  const picked=chooseSeason(item);
  if(!picked.entry)return{ratio:1,future:1,past:1,level:picked.level,confidence:0};
  const future=averageFactor(picked.entry,asOf,targetDays);
  const past=averageFactor(picked.entry,addDays(asOf,-89),90);
  const ratio=clamp(past>0?future/past:1,0.55,1.80);
  return{ratio,future,past,level:picked.level,confidence:num(picked.entry.confidence)};
}
function salesPaceMap(state){
  const m=new Map();
  for(const r of Array.isArray(state?.salesItems)?state.salesItems:[]){
    const key=norm(r?.sku);if(!key)continue;
    if(!m.has(key))m.set(key,{cur:0,prev:0});
    const x=m.get(key);x.cur+=num(r?.current_qty);x.prev+=num(r?.previous_qty);
  }
  return m;
}
function trendFactor(item,asOf,pace){
  const selected=String(document.getElementById('tri-period-month')?.value||'').slice(0,7);
  if(selected&&selected!==ym(asOf))return 1;
  const x=pace.get(norm(item?.sku));if(!x)return 1;
  const progress=clamp(asOf.getDate()/daysInMonth(asOf),0.05,1);
  const expected=x.prev*progress;
  let raw=1;
  if(expected>0)raw=x.cur/expected;
  else if(x.cur>0)raw=1.15;
  raw=clamp(raw,0.40,1.80);
  const volume=x.cur+expected;
  const weight=0.35*clamp(volume/10,0,1); // current pace can move forecast by max ~35%
  return clamp(1+(raw-1)*weight,0.75,1.30);
}

function calculate(item,state,targetDays,pace){
  const asOf=referenceDate(state);
  const season=seasonMetrics(item,asOf,targetDays);
  const trend=trendFactor(item,asOf,pace);
  const sales90=Math.max(0,num(item?.sales_90));
  const forecastRaw=(sales90/90)*targetDays*season.ratio*trend;
  const forecast=Math.max(0,Math.ceil(forecastRaw-1e-9));
  const partnerTotal=Math.max(0,num(item?.partner_total));
  const partnerOrders=Math.max(0,num(item?.partner_orders));
  const recommended=Math.max(0,Math.ceil(forecastRaw+partnerOrders-partnerTotal-1e-9));

  const ownAvailable=Math.max(0,Math.floor(num(item?.own_qty)+1e-9));
  const chekhovRaw=Math.max(0,Math.floor(num(item?.chekhov_qty)+1e-9));
  const chekhovAvailable=Math.max(0,chekhovRaw-CHEKHOV_RESERVE);
  const shipOwn=Math.min(recommended,ownAvailable);
  const afterOwn=Math.max(0,recommended-shipOwn);
  const orderChekhov=Math.min(afterOwn,chekhovAvailable);
  const uncovered=Math.max(0,afterOwn-orderChekhov);
  const partnerNet=Math.max(0,partnerTotal-partnerOrders);
  const forecastPerDay=forecastRaw>0?forecastRaw/targetDays:0;
  const stockDays=forecastPerDay>0?partnerNet/forecastPerDay:null;

  return{
    asOf:ymd(asOf),targetDays,sales90,forecast,forecastRaw,
    seasonRatio:season.ratio,seasonFuture:season.future,seasonPast:season.past,seasonLevel:season.level,
    trend,partnerTotal,partnerOrders,recommended,ownAvailable,chekhovRaw,chekhovAvailable,
    shipOwn,orderChekhov,uncovered,stockDays
  };
}

function stockBySku(state){
  const m=new Map();
  for(const item of Array.isArray(state?.stockItems)?state.stockItems:[]){const k=norm(item?.sku);if(k&&!m.has(k))m.set(k,item);}
  return m;
}
function insertLogicNote(root,state,targetDays){
  if(!root)return;
  let note=document.getElementById('tri-seasonal-stock-note-v2350');
  if(!note){note=document.createElement('div');note.id='tri-seasonal-stock-note-v2350';note.className='tri-ok';root.prepend(note);}
  const meta=state?.stockMeta||{};
  note.innerHTML='<b>Сезонная рекомендация '+VERSION+'</b> · продажи 21vek за 90 дней × сезонность истории '+
    String(profile?.history_from||'')+'–'+String(profile?.history_to||'')+' × текущий темп. '+
    'Горизонт: <b>'+targetDays+' дней</b>. Чехов: резерв <b>'+CHEKHOV_RESERVE+' шт.</b>, учитывается только остаток сверх резерва. '+
    '<b>«Не покрыто» = дефицит после Витебска и доступного Чехова.</b>'+
    '<div class="tri-note" style="margin-top:4px">Даты остатков: 21vek '+String(meta?.partner?.snapshot_date||'—')+
    ' · Витебск '+String(meta?.own?.report_date||'—')+' · Чехов '+String(meta?.chekhov?.snapshot_date||'—')+'.</div>';
}
function applyToDom(){
  if(!profile)return;
  const root=document.getElementById('tri-stock-table');if(!root)return;
  const table=root.querySelector('table.tri-stock-table');if(!table)return;
  const state=snapshot();
  const targetDays=Math.max(1,Number(document.getElementById('tri-stock-days')?.value)||30);
  const bySku=stockBySku(state),pace=salesPaceMap(state);
  insertLogicNote(root,state,targetDays);
  const tbody=table.querySelector('tbody');if(!tbody)return;
  const rows=[...tbody.querySelectorAll('tr')];
  for(const tr of rows){
    const cells=tr.children;if(cells.length<14)continue;
    const skuText=cells[2]?.querySelector('b')?.textContent||cells[2]?.textContent||'';
    const item=bySku.get(norm(skuText));if(!item)continue;
    const c=calculate(item,state,targetDays,pace);
    cells[6].innerHTML=c.stockDays==null?'—':one(c.stockDays);
    cells[8].innerHTML=qty(c.chekhovRaw)+'<div class="tri-note">доступно сверх 50: <b>'+qty(c.chekhovAvailable)+'</b></div>';
    cells[9].innerHTML='<b>'+qty(c.recommended)+'</b><div class="tri-note">прогноз '+qty(c.forecast)+' · сезон ×'+c.seasonRatio.toFixed(2)+
      ' ('+c.seasonLevel+') · темп ×'+c.trend.toFixed(2)+'</div>';
    cells[10].innerHTML=qty(c.shipOwn);
    cells[11].innerHTML=qty(c.orderChekhov)+'<div class="tri-note">из доступных '+qty(c.chekhovAvailable)+'</div>';
    cells[12].innerHTML='<b>'+qty(c.uncovered)+'</b>';
    cells[12].className=c.uncovered>0?'tri-uncovered':'';
    tr.dataset.seasonRecommended=String(c.recommended);
  }
  // Keep ranking consistent with the new recommendation rather than the old RPC recommendation.
  rows.sort((a,b)=>num(b.dataset.seasonRecommended)-num(a.dataset.seasonRecommended));
  for(const tr of rows)tbody.appendChild(tr);
}
function showProfileError(error){
  const root=document.getElementById('tri-stock-table');if(!root)return;
  if(document.getElementById('tri-seasonal-stock-error-v2350'))return;
  const box=document.createElement('div');box.id='tri-seasonal-stock-error-v2350';box.className='tri-warning';
  box.textContent='Сезонность временно не применена: '+(error?.message||String(error));root.prepend(box);
}

function filteredStockForExport(state){
  let mgr=String(document.getElementById('tri-manager-filter')?.value||'all').toLowerCase();
  const p=currentProfileSafe(),email=currentEmail();
  if(String(p?.access_scope||'').toLowerCase()==='triovist'&&!LEADERS.has(email))mgr=email;
  const q=norm(document.getElementById('tri-stock-search')?.value||'');
  return (Array.isArray(state?.stockItems)?state.stockItems:[]).filter(x=>(mgr==='all'||String(x?.manager_email||'').toLowerCase()===mgr)&&(!q||norm([x?.sku,x?.product,x?.assigned_group,x?.brand].join(' ')).includes(q)));
}
function exportSeasonal(){
  if(!profile||!window.XLSX)return originalExport?.();
  const state=snapshot(),targetDays=Math.max(1,Number(document.getElementById('tri-stock-days')?.value)||30),pace=salesPaceMap(state);
  const rows=filteredStockForExport(state).map(item=>{
    const c=calculate(item,state,targetDays,pace);
    return{
      'Менеджер':item.manager_name,'Группа':item.assigned_group,'Артикул':item.sku,'Товар':item.product,
      'Продажи 90 дней':item.sales_90,'Сезонность':Number(c.seasonRatio.toFixed(3)),'Уровень сезонности':c.seasonLevel,
      'Текущий темп':Number(c.trend.toFixed(3)),'Прогноз спроса':c.forecast,'Остаток 21vek':item.partner_total,
      'Заказы 21vek':item.partner_orders,'Рекомендуемый заказ':c.recommended,'Наш остаток Витебск':item.own_qty,
      'Отгрузить с Витебска':c.shipOwn,'Остаток Чехов':c.chekhovRaw,'Резерв Чехов':CHEKHOV_RESERVE,
      'Доступно Чехов сверх 50':c.chekhovAvailable,'Заказать из Чехова':c.orderChekhov,'Не покрыто':c.uncovered,
      'Последняя отгрузка (месяц)':item.last_shipment_month,'Количество последней отгрузки':item.last_shipment_qty
    };
  }).sort((a,b)=>num(b['Рекомендуемый заказ'])-num(a['Рекомендуемый заказ']));
  const wb=XLSX.utils.book_new();const ws=XLSX.utils.json_to_sheet(rows);XLSX.utils.book_append_sheet(wb,ws,'Сезонный заказ');
  XLSX.writeFile(wb,'Триовист_сезонный_заказ_'+new Date().toISOString().slice(0,10)+'.xlsx');
}

function install(){
  if(window.RESANTA_TRIOVIST_SEASONAL_STOCK_V2350)return true;
  if(typeof window.renderTriovistStock!=='function')return false;
  originalRender=window.renderTriovistStock;
  originalExport=typeof window.triovistExportStock==='function'?window.triovistExportStock:null;
  window.renderTriovistStock=function(){
    const result=originalRender.apply(this,arguments);
    if(profile){queueMicrotask(applyToDom);}else{ensureProfile().then(()=>applyToDom()).catch(showProfileError);}
    return result;
  };
  if(originalExport){window.triovistExportStock=function(){if(profile)return exportSeasonal();ensureProfile().then(exportSeasonal).catch(()=>originalExport());};}
  window.RESANTA_TRIOVIST_SEASONAL_STOCK_V2350=Object.freeze({version:VERSION,chekhovReserve:CHEKHOV_RESERVE,reapply:applyToDom});
  ensureProfile().then(()=>{if(document.getElementById('page-triovist')?.classList.contains('active'))applyToDom();}).catch(()=>{});
  return true;
}

if(!install()){
  let attempts=0;const timer=setInterval(()=>{attempts++;if(install()||attempts>=40)clearInterval(timer);},250);
}
})();
