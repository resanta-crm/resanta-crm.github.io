/* RESANTA CRM v23.6.434 · VIP exact date-range filter
 * Uses exact cumulative 1C VIP snapshots for partial months and purchase_history
 * for closed full months. Never extrapolates missing dates.
 */
(function(){
'use strict';
if(window.RESANTA_VIP_DATE_RANGE_V236434)return;

const V='v23.6.439';
const baseSummary=window.getVipClientSummary||globalThis.getVipClientSummary;
const basePeriod=window.vipComparisonPeriod||globalThis.vipComparisonPeriod;
const S={owner:'',started:false,active:false,data:null,from:'',to:'',compareFrom:'',compareTo:'',loading:false,revision:0};
const $=id=>document.getElementById(id);
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const K=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/giu,'');
const N=v=>Number.isFinite(Number(v))?Number(v):0;
const money=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
const day=v=>{const s=String(v||'');return /^\d{4}-\d{2}-\d{2}$/.test(s)?s.slice(8,10)+'.'+s.slice(5,7)+'.'+s.slice(0,4):s};
const monthStart=v=>String(v||'').slice(0,7)+'-01';
const monthEnd=v=>{const s=String(v||'').slice(0,7),y=+s.slice(0,4),m=+s.slice(5,7);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)};
const label=(from,to)=>day(from)+' — '+day(to);
const completeMonths=range=>range.from===monthStart(range.from)&&range.to===monthEnd(range.to);
const monthCount=range=>(Number(range.to.slice(0,4))-Number(range.from.slice(0,4)))*12+
  Number(range.to.slice(5,7))-Number(range.from.slice(5,7))+1;
function sameDuration(a,b){
  return completeMonths(a)&&completeMonths(b)?monthCount(a)===monthCount(b):
    Date.parse(a.to)-Date.parse(a.from)===Date.parse(b.to)-Date.parse(b.from);
}
function prof(){try{return typeof currentProfile!=='undefined'?currentProfile:null}catch(_){return null}}
function profileKey(){const p=prof();return String(p?.id||p?.name||'')+'|'+String(p?.role||'');}
function clients(){try{return Array.isArray(allClients)?allClients:[]}catch(_){return[]}}
function defs(){try{return typeof vipMemberDefinitions==='function'?vipMemberDefinitions():[]}catch(_){return[]}}
function matchClient(def,rows){
  const cid=rows.find(r=>r.client_id)?.client_id;
  if(cid){const c=clients().find(x=>String(x.id)===String(cid));if(c)return c;}
  return clients().find(c=>K(c.name)===K(def.client_name))||null;
}
function growth(prev,cur){return prev>0?Math.round((cur-prev)/prev*100):(cur>0?100:0)}
function addRows(g,rows,isPrev){
  const skuSet=isPrev?g._prevSku:g._curSku;
  for(const r of rows){
    const rev=N(r.revenue),qty=N(r.qty),cat=r.category||'Без категории',sub=r.subgroup||'Прочее',product=r.product||'Без наименования',sku=String(r.sku||product||'').trim();
    if(isPrev)g.revenue_prev+=rev;else g.revenue_cur+=rev;
    if(qty||rev)skuSet.add(sku);
    if(!g.categories[cat])g.categories[cat]={category:cat,revenue_prev:0,revenue_cur:0,subgroups:{}};
    const gc=g.categories[cat];if(isPrev)gc.revenue_prev+=rev;else gc.revenue_cur+=rev;
    if(!gc.subgroups[sub])gc.subgroups[sub]={subgroup:sub,revenue_prev:0,revenue_cur:0,items:{}};
    const gs=gc.subgroups[sub];if(isPrev)gs.revenue_prev+=rev;else gs.revenue_cur+=rev;
    const ik=(sku||product)+'|||'+product;
    if(!gs.items[ik])gs.items[ik]={product,sku,revenue_prev:0,revenue_cur:0,qty_prev:0,qty_cur:0};
    const it=gs.items[ik];
    if(isPrev){it.revenue_prev+=rev;it.qty_prev+=qty}else{it.revenue_cur+=rev;it.qty_cur+=qty}
  }
}
function rangeSummary(){
  if(!S.active||!S.data||S.owner!==profileKey())return typeof baseSummary==='function'?baseSummary():[];
  const curRows=Array.isArray(S.data.current?.rows)?S.data.current.rows:[];
  const prevRows=Array.isArray(S.data.previous?.rows)?S.data.previous.rows:[];
  const byCur=new Map(),byPrev=new Map();
  for(const r of curRows){const k=K(r.client_name);if(!byCur.has(k))byCur.set(k,[]);byCur.get(k).push(r)}
  for(const r of prevRows){const k=K(r.client_name);if(!byPrev.has(k))byPrev.set(k,[]);byPrev.get(k).push(r)}
  const definitions=new Map(defs().map(def=>[K(def.client_name),def]));
  for(const row of [...curRows,...prevRows]){
    const key=K(row.client_name);
    if(!definitions.has(key))definitions.set(key,{client_name:row.client_name,department:row.department});
  }
  return [...definitions].map(([key,def])=>{
    const cr=byCur.get(key)||[],pr=byPrev.get(key)||[],rows=[...cr,...pr];
    const matched=matchClient(def,rows);
    const exactManagers=[...new Set(rows.map(row=>row.manager_name).filter(Boolean))];
    const g={...def,matched,exactManagers,
      period_prev:String(S.data.previous?.from||'').slice(0,7),
      period_cur:String(S.data.current?.from||'').slice(0,7),
      period_partial:false,
      quarter_prev_code:'',quarter_cur_code:'',quarter_revenue_prev:0,quarter_revenue_cur:0,
      revenue_prev:0,revenue_cur:0,sku_prev:0,sku_cur:0,categories:{},
      _prevSku:new Set(),_curSku:new Set()
    };
    addRows(g,pr,true);addRows(g,cr,false);
    g.sku_prev=g._prevSku.size;g.sku_cur=g._curSku.size;delete g._prevSku;delete g._curSku;
    const compareOk=S.data.comparable;
    g.month_comparable=compareOk;
    g.target_gap=compareOk?Math.max(0,g.revenue_prev-g.revenue_cur):0;
    g.growth_pct=compareOk?growth(g.revenue_prev,g.revenue_cur):null;
    Object.values(g.categories).forEach(gc=>{
      gc.growth_pct=compareOk?growth(gc.revenue_prev,gc.revenue_cur):null;
      Object.values(gc.subgroups).forEach(gs=>{gs.items=Object.values(gs.items);gs.growth_pct=compareOk?growth(gs.revenue_prev,gs.revenue_cur):null});
    });
    return g;
  });
}
function rangePeriod(){
  if(!S.active||!S.data||S.owner!==profileKey())return typeof basePeriod==='function'?basePeriod():{};
  return{
    prev:String(S.data.previous?.from||'').slice(0,7),
    cur:String(S.data.current?.from||'').slice(0,7),
    partial:false,comparable:S.data.comparable,hasPrevious:!!S.data.previous,exact:true,
    currentLabel:label(S.data.current.from,S.data.current.to),
    previousLabel:S.data.previous?label(S.data.previous.from,S.data.previous.to):'',
    signature:String(S.revision),
    currentMonth:String(S.data.current?.to||'').slice(0,7),
    missingCurrent:false,
    compareMode:'custom'
  };
}
window.getVipClientSummary=rangeSummary;try{getVipClientSummary=rangeSummary}catch(_){}
window.vipComparisonPeriod=rangePeriod;try{vipComparisonPeriod=rangePeriod}catch(_){}

function salesCut(){
  try{
    const st=typeof crmImportStatus==='function'?crmImportStatus('sales'):null;
    const raw=st?.source_message_at;
    if(raw){
      const d=new Date(raw);
      return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
    }
  }catch(_){}
  try{return String(TODAY||'').slice(0,10)}catch(_){return new Date().toISOString().slice(0,10)}
}
function defaults(closed=false){
  const cut=salesCut();
  const from=closed?shiftedDate(monthStart(cut),-1):monthStart(cut);
  const to=closed?monthEnd(from):cut;
  const compareFrom=shiftedDate(from,-12);
  return {from,to,compareFrom,compareTo:monthEnd(compareFrom)};
}
function shiftedDate(value,months){
  const [year,month,dayNumber]=String(value).split('-').map(Number);
  const first=new Date(Date.UTC(year,month-1+months,1));
  const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  return first.getUTCFullYear()+'-'+String(first.getUTCMonth()+1).padStart(2,'0')+'-'+String(Math.min(dayNumber,last)).padStart(2,'0');
}
function ensureControls(){
  document.getElementById('vip-date-range-v236434')?.remove();
  const host=$('vip-range-host');
  if(!host)return;
  const d=defaults();
  const box=document.createElement('div');box.id='vip-date-range-v236434';
  box.innerHTML='<div class="vip-range-pair"><fieldset><legend>Период 1</legend>'+
    '<label>С<input id="vip-date-from-v236434" type="date" class="form-input" value="'+E(S.from||d.from)+'"></label>'+
    '<label>По<input id="vip-date-to-v236434" type="date" class="form-input" value="'+E(S.to||d.to)+'"></label></fieldset>'+
    '<fieldset><legend>Период 2</legend>'+
    '<label>С<input id="vip-date-compare-from-v236434" type="date" class="form-input" value="'+E(S.compareFrom||d.compareFrom)+'"></label>'+
    '<label>По<input id="vip-date-compare-to-v236434" type="date" class="form-input" value="'+E(S.compareTo||d.compareTo)+'"></label></fieldset></div>'+
    '<div class="vip-range-actions"><label>Быстрый выбор периода 2<select id="vip-date-preset-v236434" class="form-input"><option value="custom">Свои даты</option><option value="yoy">Те же даты год назад</option><option value="yoy-full">Полный месяц год назад</option><option value="mom">Предыдущий месяц</option></select></label>'+
    '<button id="vip-date-apply-v236434" class="btn-primary" type="button">Сравнить периоды</button>'+
    '<button id="vip-date-reset-v236434" class="btn-secondary" type="button">Последний закрытый месяц</button></div>'+
    '<div id="vip-date-status-v236434" role="status"></div>'+
    '<div id="vip-date-totals-v236434" class="vip-range-pair" hidden></div>';
  host.appendChild(box);
  box.querySelector('#vip-date-apply-v236434').addEventListener('click',apply);
  box.querySelector('#vip-date-reset-v236434').addEventListener('click',()=>{fill(defaults(true));void apply()});
  box.querySelector('#vip-date-preset-v236434').addEventListener('change',e=>{
    const preset=e.target.value;
    if(preset==='custom')return;
    const months=preset==='mom'?-1:-12;
    const from=$('vip-date-from-v236434')?.value,to=$('vip-date-to-v236434')?.value;
    if(!from||!to)return;
    const previousFrom=shiftedDate(from,months),previousTo=shiftedDate(to,months);
    $('vip-date-compare-from-v236434').value=preset==='yoy-full'?monthStart(previousFrom):previousFrom;
    $('vip-date-compare-to-v236434').value=preset==='yoy-full'?monthEnd(previousTo):previousTo;
  });
}
function fill(d){
  $('vip-date-from-v236434').value=d.from;
  $('vip-date-to-v236434').value=d.to;
  $('vip-date-compare-from-v236434').value=d.compareFrom;
  $('vip-date-compare-to-v236434').value=d.compareTo;
  $('vip-date-preset-v236434').value='custom';
}
function showResults(visible){
  $('page-vip')?.classList.toggle('vip-exact-results',visible);
  const totals=$('vip-date-totals-v236434');
  if(totals)totals.hidden=!visible;
}
function status(text,kind='info'){
  const el=$('vip-date-status-v236434');if(!el)return;
  el.textContent=text||'';el.style.color=kind==='bad'?'var(--r)':kind==='ok'?'var(--g)':'var(--sub)';
}
async function readRange(db,from,to,openMonth){
  const read=(p_from,p_to)=>db.rpc('vip_date_range_v236429',{p_from,p_to,p_compare_mode:'none'});
  const response=await read(from,to);
  if(response.error)throw response.error;
  if(response.data?.exact_current)return {range:response.data.current,adjusted:false};
  const missing=response.data?.current?.missing_snapshots||[];
  const fullFrom=monthStart(from),fullTo=monthEnd(to);
  // The 1C archive can provide exact full-month totals when the requested daily cut is missing.
  if(missing.length&&fullTo<openMonth&&(fullFrom!==from||fullTo!==to)&&Date.parse(fullTo)-Date.parse(fullFrom)<=730*86400000){
    const full=await read(fullFrom,fullTo);
    if(!full.error&&full.data?.exact_current)return {range:full.data.current,adjusted:true,missing};
  }
  return {range:null,missing};
}
function renderTotals(current,previous){
  const totals=$('vip-date-totals-v236434');
  if(!totals)return;
  const card=(name,range)=>'<div class="vip-range-total"><span>'+name+'</span><strong>'+
    (range?money.format(range.rows.reduce((sum,row)=>sum+N(row.revenue),0))+' BYN':'—')+'</strong>'+
    '<small>'+(range?label(range.from,range.to):'Нет данных 1С')+'</small></div>';
  totals.innerHTML=card('Оборот ВИП · период 1',current)+card('Оборот ВИП · период 2',previous);
}
async function apply(){
  if(S.loading)return;
  const from=$('vip-date-from-v236434')?.value||'',to=$('vip-date-to-v236434')?.value||'';
  const compareFrom=$('vip-date-compare-from-v236434')?.value||'',compareTo=$('vip-date-compare-to-v236434')?.value||'';
  const valid=(start,end)=>start&&end&&end>=start&&Date.parse(end)-Date.parse(start)<=730*86400000;
  if(!valid(from,to)||!valid(compareFrom,compareTo)){
    status('Укажите даты в правильном порядке. Каждый период может быть до 731 дня.','bad');
    return;
  }
  const owner=profileKey();
  S.loading=true;S.active=false;S.data=null;
  showResults(false);
  const buttons=[$('vip-date-apply-v236434'),$('vip-date-reset-v236434')];
  buttons.forEach(button=>{if(button)button.disabled=true});
  status('Загружаю продажи ВИП из 1С…');
  try{
    const database=typeof db!=='undefined'?db:window.db;
    const openMonth=monthStart(salesCut());
    const [first,second]=await Promise.allSettled([
      readRange(database,from,to,openMonth),readRange(database,compareFrom,compareTo,openMonth)
    ]);
    if(owner!==profileKey()||owner!==S.owner)return;
    if(first.status==='rejected')throw first.reason;
    const current=first.value?.range,previous=second.value?.range;
    if(!current){
      const missing=(first.value?.missing||[]).map(day).join(', ');
      status('Для периода 1 нет среза 1С'+(missing?' на '+missing:'')+'. Выберите другие даты или последний закрытый месяц.','bad');
      return;
    }
    const comparable=!!previous&&!first.value.adjusted&&!second.value.adjusted&&sameDuration(current,previous);
    S.active=true;S.data={current,previous,comparable};S.revision++;
    Object.assign(S,{from,to,compareFrom,compareTo});
    renderTotals(current,previous);
    const messages=[];
    for(const [number,outcome] of [[1,first],[2,second]]){
      const result=outcome.value,missing=(result?.missing||[]).map(day).join(', ');
      if(result?.adjusted)messages.push('Период '+number+' · нет среза на '+missing+'. Показан полный период '+label(result.range.from,result.range.to)+'.');
      else if(!result?.range)messages.push('Период '+number+' · '+(missing?'нет среза 1С на '+missing:'данные сейчас недоступны')+'.');
    }
    if(previous&&!comparable)messages.push('Обороты показаны за фактические даты. Изменение в процентах не рассчитывается.');
    status(messages.join(' '));
    showResults(true);
    window.renderVip?.();
  }catch(e){
    console.warn(V,e);
    status('Не удалось загрузить продажи ВИП. Нажмите «Сравнить периоды», чтобы повторить.','bad');
  }finally{
    if(S.owner===owner)S.loading=false;
    buttons.forEach(button=>{if(button)button.disabled=false});
  }
}
function enter(){
  const owner=profileKey();
  if(!prof()?.id&&!prof()?.name)return;
  if(S.owner!==owner){
    Object.assign(S,{owner,started:false,active:false,data:null,loading:false,from:'',to:'',compareFrom:'',compareTo:''});
  }
  if(!$('vip-date-range-v236434')||!S.started){
    ensureControls();
    if(!$('vip-date-range-v236434'))return;
    S.started=true;
    showResults(false);
    void apply();
  }
}
window.RESANTA_VIP_DATE_RANGE_V236434=Object.freeze({version:V,exactSnapshots:true,noExtrapolation:true,enter,
  snapshot:()=>S.active&&S.data&&S.owner===profileKey()?{list:rangeSummary(),period:rangePeriod()}:null});
})();
