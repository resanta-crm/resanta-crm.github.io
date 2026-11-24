/* RESANTA CRM v23.6.434 · VIP exact date-range filter
 * Uses exact cumulative 1C VIP snapshots for partial months and purchase_history
 * for closed full months. Never extrapolates missing dates.
 */
(function(){
'use strict';
if(window.RESANTA_VIP_DATE_RANGE_V236434)return;

const V='v23.6.437';
const baseSummary=window.getVipClientSummary||globalThis.getVipClientSummary;
const basePeriod=window.vipComparisonPeriod||globalThis.vipComparisonPeriod;
const S={owner:'',started:false,active:false,data:null,from:'',to:'',compareFrom:'',compareTo:'',loading:false,summary:new Map()};
const $=id=>document.getElementById(id);
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const K=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/giu,'');
const N=v=>Number.isFinite(Number(v))?Number(v):0;
const day=v=>{const s=String(v||'');return /^\d{4}-\d{2}-\d{2}$/.test(s)?s.slice(8,10)+'.'+s.slice(5,7)+'.'+s.slice(0,4):s};
const monthStart=v=>String(v||'').slice(0,7)+'-01';
const monthEnd=v=>{const s=String(v||'').slice(0,7),y=+s.slice(0,4),m=+s.slice(5,7);return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)};
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
  S.summary.clear();
  const out=defs().map(def=>{
    const k=K(def.client_name),cr=byCur.get(k)||[],pr=byPrev.get(k)||[],matched=matchClient(def,[...cr,...pr]);
    const g={...def,matched,
      period_prev:String(S.data.previous?.from||'').slice(0,7),
      period_cur:String(S.data.current?.from||'').slice(0,7),
      period_partial:false,
      quarter_prev_code:'',quarter_cur_code:'',quarter_revenue_prev:0,quarter_revenue_cur:0,
      revenue_prev:0,revenue_cur:0,sku_prev:0,sku_cur:0,categories:{},
      _prevSku:new Set(),_curSku:new Set()
    };
    addRows(g,pr,true);addRows(g,cr,false);
    g.sku_prev=g._prevSku.size;g.sku_cur=g._curSku.size;delete g._prevSku;delete g._curSku;
    const compareOk=!!S.data?.exact_previous;
    g.month_comparable=compareOk;
    g.target_gap=compareOk?Math.max(0,g.revenue_prev-g.revenue_cur):0;
    g.growth_pct=compareOk?growth(g.revenue_prev,g.revenue_cur):null;
    Object.values(g.categories).forEach(gc=>{
      gc.growth_pct=compareOk?growth(gc.revenue_prev,gc.revenue_cur):null;
      Object.values(gc.subgroups).forEach(gs=>{gs.items=Object.values(gs.items);gs.growth_pct=compareOk?growth(gs.revenue_prev,gs.revenue_cur):null});
    });
    S.summary.set(k,g);return g;
  });
  return out;
}
function rangePeriod(){
  if(!S.active||!S.data||S.owner!==profileKey())return typeof basePeriod==='function'?basePeriod():{};
  return{
    prev:String(S.data.previous?.from||'').slice(0,7),
    cur:String(S.data.current?.from||'').slice(0,7),
    partial:false,comparable:S.data.exact_previous,exact:true,
    currentLabel:day(S.from)+' — '+day(S.to), previousLabel:day(S.compareFrom)+' — '+day(S.compareTo),
    signature:[S.from,S.to,S.compareFrom,S.compareTo].join('|'),
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
  return {from,to,compareFrom,compareTo:closed?monthEnd(compareFrom):shiftedDate(to,-12)};
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
    '<div class="vip-range-actions"><label>Быстрый выбор периода 2<select id="vip-date-preset-v236434" class="form-input"><option value="custom">Свои даты</option><option value="yoy">Год назад</option><option value="mom">Предыдущий месяц</option></select></label>'+
    '<button id="vip-date-apply-v236434" class="btn-primary" type="button">Сравнить периоды</button>'+
    '<button id="vip-date-reset-v236434" class="btn-secondary" type="button">Последний закрытый месяц</button></div>'+
    '<div id="vip-date-status-v236434" role="status"></div>';
  host.appendChild(box);
  box.querySelector('#vip-date-apply-v236434').addEventListener('click',apply);
  box.querySelector('#vip-date-reset-v236434').addEventListener('click',()=>{fill(defaults(true));void apply()});
  box.querySelector('#vip-date-preset-v236434').addEventListener('change',e=>{
    const months=e.target.value==='yoy'?-12:e.target.value==='mom'?-1:null;
    if(months===null)return;
    const from=$('vip-date-from-v236434')?.value,to=$('vip-date-to-v236434')?.value;
    if(from&&to){$('vip-date-compare-from-v236434').value=shiftedDate(from,months);$('vip-date-compare-to-v236434').value=shiftedDate(to,months)}
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
}
function status(text,kind='info'){
  const el=$('vip-date-status-v236434');if(!el)return;
  el.textContent=text||'';el.style.color=kind==='bad'?'var(--r)':kind==='ok'?'var(--g)':'var(--sub)';
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
  S.loading=true;S.active=false;S.data=null;S.summary.clear();
  showResults(false);
  const buttons=[$('vip-date-apply-v236434'),$('vip-date-reset-v236434')];
  buttons.forEach(button=>{if(button)button.disabled=true});
  status('Загружаю продажи ВИП из 1С…');
  try{
    const d=typeof db!=='undefined'?db:window.db;
    const read=(p_from,p_to)=>d.rpc('vip_date_range_v236429',{p_from,p_to,p_compare_mode:'none'});
    const [first,second]=await Promise.allSettled([read(from,to),read(compareFrom,compareTo)]);
    if(owner!==profileKey()||owner!==S.owner)return;
    const current=first.value?.data,previous=second.value?.data;
    if(first.value?.error||first.status==='rejected'||!current)throw first.value?.error||first.reason||Error('Нет ответа 1С');
    if(!current.exact_current){
      const missing=(current.current?.missing_snapshots||[]).map(day).join(', ');
      status('Для периода 1 нет среза 1С'+(missing?' на '+missing:'')+'. Выберите другие даты или последний закрытый месяц.','bad');
      return;
    }
    const exact=previous?.exact_current===true;
    S.active=true;S.data={current:current.current,previous:exact?previous.current:{from:compareFrom,to:compareTo,rows:[]},exact_previous:exact};
    Object.assign(S,{from,to,compareFrom,compareTo});
    const dates=day(from)+' — '+day(to);
    const missing=(previous?.current?.missing_snapshots||[]).map(day).join(', ');
    status(exact?'Факт за '+dates+' · сравнение с '+day(compareFrom)+' — '+day(compareTo):
      'Факт за '+dates+'. '+(missing?'Для периода 2 нет среза 1С на '+missing+'.':'Период 2 сейчас недоступен.')+
      ' Для сравнения выберите другие даты или последний закрытый месяц.',exact?'ok':'info');
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
    S.summary.clear();
  }
  if(!$('vip-date-range-v236434')||!S.started){
    ensureControls();
    if(!$('vip-date-range-v236434'))return;
    S.started=true;
    showResults(false);
    void apply();
  }
}
window.RESANTA_VIP_DATE_RANGE_V236434=Object.freeze({version:'v23.6.438',exactSnapshots:true,noExtrapolation:true,enter,
  snapshot:()=>S.active&&S.data&&S.owner===profileKey()?{list:rangeSummary(),period:rangePeriod()}:null});
})();
