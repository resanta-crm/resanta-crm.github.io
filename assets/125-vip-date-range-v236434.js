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
const baseRender=window.renderVip||globalThis.renderVip;
const S={owner:'',active:false,data:null,from:'',to:'',compareFrom:'',compareTo:'',mode:'yoy',loading:false,summary:new Map()};
const $=id=>document.getElementById(id);
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const K=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/giu,'');
const N=v=>Number.isFinite(Number(v))?Number(v):0;
const day=v=>{const s=String(v||'');return /^\d{4}-\d{2}-\d{2}$/.test(s)?s.slice(8,10)+'.'+s.slice(5,7)+'.'+s.slice(0,4):s};
const monthStart=v=>String(v||'').slice(0,7)+'-01';
const monthEnd=v=>{const s=String(v||'').slice(0,7),y=+s.slice(0,4),m=+s.slice(5,7);return new Date(y,m,0).toISOString().slice(0,10)};
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
      period_partial:true,
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
    partial:false,comparable:true,exact:true,
    signature:[S.from,S.to,S.compareFrom,S.compareTo].join('|'),
    currentMonth:String(S.data.current?.to||'').slice(0,7),
    missingCurrent:false,
    compareMode:S.mode
  };
}
window.getVipClientSummary=rangeSummary;try{getVipClientSummary=rangeSummary}catch(_){}
window.vipComparisonPeriod=rangePeriod;try{vipComparisonPeriod=rangePeriod}catch(_){}

function selectedMonth(){
  const p=typeof basePeriod==='function'?basePeriod():{};
  return String(p?.cur||'').slice(0,7);
}
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
function defaults(){
  const m=selectedMonth()||salesCut().slice(0,7),cut=salesCut();
  const from=m+'-01';
  const to=m===cut.slice(0,7)?cut:monthEnd(m);
  return{from,to,compareFrom:String(Number(m.slice(0,4))-1)+m.slice(4)+'-01',
    compareTo:String(Number(to.slice(0,4))-1)+to.slice(4)};
}
function shiftedDate(value,months){
  const [year,month,dayNumber]=String(value).split('-').map(Number);
  const first=new Date(Date.UTC(year,month-1+months,1));
  const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  return first.getUTCFullYear()+'-'+String(first.getUTCMonth()+1).padStart(2,'0')+'-'+String(Math.min(dayNumber,last)).padStart(2,'0');
}
function compareMode(){
  const el=document.querySelector('#vip-period-controls-v236198 select[onchange*="vipMode198"]');
  const v=String(el?.value||'yoy');return ['yoy','mom'].includes(v)?v:'yoy';
}
function ensureControls(){
  if(document.getElementById('vip-date-range-v236434'))return;
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
    '<button id="vip-date-reset-v236434" class="btn-secondary" type="button">Обычный месяц</button></div>'+
    '<div id="vip-date-status-v236434" role="status"></div>';
  host.appendChild(box);
  box.querySelector('#vip-date-apply-v236434').addEventListener('click',apply);
  box.querySelector('#vip-date-reset-v236434').addEventListener('click',()=>reset(true));
  box.querySelector('#vip-date-preset-v236434').addEventListener('change',e=>{
    const months=e.target.value==='yoy'?-12:e.target.value==='mom'?-1:null;
    if(months===null)return;
    const from=$('vip-date-from-v236434')?.value,to=$('vip-date-to-v236434')?.value;
    if(from&&to){$('vip-date-compare-from-v236434').value=shiftedDate(from,months);$('vip-date-compare-to-v236434').value=shiftedDate(to,months)}
  });
  if(S.active&&S.owner===profileKey())status('Точный период активен: '+day(S.from)+' — '+day(S.to),'ok');
}
function status(text,kind='info'){
  const el=$('vip-date-status-v236434');if(!el)return;
  el.textContent=text||'';el.style.color=kind==='bad'?'var(--r)':kind==='ok'?'var(--g)':'var(--sub)';
}
async function apply(){
  if(S.loading)return;
  const from=$('vip-date-from-v236434')?.value||'',to=$('vip-date-to-v236434')?.value||'';
  const compareFrom=$('vip-date-compare-from-v236434')?.value||'',compareTo=$('vip-date-compare-to-v236434')?.value||'';
  if(!from||!to||to<from||!compareFrom||!compareTo||compareTo<compareFrom){status('Проверьте даты обоих периодов.','bad');return}
  const owner=profileKey();
  S.loading=true;const b=$('vip-date-apply-v236434');if(b)b.disabled=true;status('Считаю точный период по срезам 1С…');
  try{
    const d=typeof db!=='undefined'?db:window.db;
    const [first,second]=await Promise.all([
      d.rpc('vip_date_range_v236429',{p_from:from,p_to:to,p_compare_mode:'yoy'}),
      d.rpc('vip_date_range_v236429',{p_from:compareFrom,p_to:compareTo,p_compare_mode:'yoy'})
    ]);
    if(owner!==profileKey())return;
    if(first.error||second.error)throw first.error||second.error;
    if(!first.data?.exact_current||!second.data?.exact_current){
      const missing=[...(first.data?.current?.missing_snapshots||[]),...(second.data?.current?.missing_snapshots||[])].map(day).join(', ');
      status('Для одного из периодов нет точного среза 1С'+(missing?' на '+missing:'')+'. Сравнение не изменено.','bad');return;
    }
    S.owner=owner;S.active=true;S.data={current:first.data.current,previous:second.data.current,exact_previous:true};
    S.from=from;S.to=to;S.compareFrom=compareFrom;S.compareTo=compareTo;S.mode='custom';
    window.renderVip?.();
  }catch(e){console.warn(V,e);status('Не удалось применить даты: '+String(e?.message||e),'bad')}
  finally{S.loading=false;if(b)b.disabled=false}
}
function reset(rerender){
  S.active=false;S.data=null;S.summary.clear();S.from='';S.to='';S.compareFrom='';S.compareTo='';
  status('');
  try{localStorage.removeItem('resanta_vip_date_range_v236434')}catch(_){}
  if(rerender)window.renderVip?.();
}
function afterRender(){
  ensureControls();
  if(!S.active||!S.data||S.owner!==profileKey())return;
  const cur=S.data.current,prev=S.data.previous;
  const info=$('vip-period-info');
  const compareOk=!!S.data.exact_previous;
  if(info)info.innerHTML='<div class="card-title">Как считается ВИП</div>'+
    '<div style="font-size:13px;line-height:1.65"><b>Точный период:</b> '+E(day(cur.from))+'—'+E(day(cur.to))+
    (compareOk?' · сравнение: '+E(day(prev.from))+'—'+E(day(prev.to)):'')+'</div>'+
    '<div style="font-size:12px;color:var(--sub);margin-top:4px">Источник: точные накопительные срезы продаж 1С. Никакой экстраполяции по дням.</div>'+
    (!compareOk?'<div style="font-size:12px;color:var(--am);margin-top:5px">За сопоставимый период прошлого года точного дневного среза 1С нет — текущий период показан точно, процент сравнения не рассчитывается.</div>':'');
  const dtitle=document.querySelector('#vip-decliners-block .card-title');
  if(dtitle)dtitle.textContent='⚠️ Сильнее всего просели за выбранный период (топ-5)';
  document.querySelectorAll('#vip-list [id^="vipdept_"] > .card').forEach(card=>{
    const head=card.firstElementChild,right=head?.lastElementChild;
    if(!right)return;
    const ch=[...right.children];
    const left=head?.firstElementChild;
    const name=left?.firstElementChild?.textContent||'';
    const sum=S.summary.get(K(name));
    if(ch[0])ch[0].textContent=compareOk?(day(prev.from)+'—'+day(prev.to)+' → '+day(cur.from)+'—'+day(cur.to)):('Точный период '+day(cur.from)+'—'+day(cur.to));
    if(!compareOk&&ch[1]&&sum)ch[1].textContent='— → '+N(sum.revenue_cur).toLocaleString('ru-RU',{maximumFractionDigits:2})+' BYN';
    const last=ch[ch.length-1];
    if(last&&/кв\.|квартал/i.test(last.textContent||''))last.style.display='none';
    const body=card.querySelector('[id^="vipcard_"]');
    if(body){
      [...body.children].forEach(x=>{if(/📊 Продажи ·/i.test(x.textContent||''))x.style.display='none'});
    }
  });
  status('Точный период активен: '+day(S.from)+' — '+day(S.to)+(compareOk?'':' · без точного YoY'),'ok');
}
if(typeof baseRender==='function'){
  const wrapped=function(){
    if(S.active){window.vipComparisonPeriod=rangePeriod;try{vipComparisonPeriod=rangePeriod}catch(_){}}
    const out=baseRender.apply(this,arguments);setTimeout(afterRender,0);return out;
  };
  window.renderVip=wrapped;try{renderVip=wrapped}catch(_){}
}
document.addEventListener('change',e=>{
  if(e.target.closest?.('#vip-period-controls-v236198 select, #vip-period-controls-native-v236202 select')&&S.active)reset(false);
},true);
function mount(){
  ensureControls();
  const list=$('vip-list');
  if(list)new MutationObserver(()=>afterRender()).observe(list,{childList:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();

window.RESANTA_VIP_DATE_RANGE_V236434=Object.freeze({version:'v23.6.437',exactSnapshots:true,noExtrapolation:true,
  snapshot:()=>S.active&&S.data&&S.owner===profileKey()?{list:rangeSummary(),period:rangePeriod()}:null});
})();
