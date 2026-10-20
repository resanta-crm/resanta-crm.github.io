/* RESANTA CRM v23.6.434 · VIP exact date-range filter
 * Uses exact cumulative 1C VIP snapshots for partial months and purchase_history
 * for closed full months. Never extrapolates missing dates.
 */
(function(){
'use strict';
if(window.RESANTA_VIP_DATE_RANGE_V236434)return;

const V='v23.6.434';
const baseSummary=window.getVipClientSummary||globalThis.getVipClientSummary;
const basePeriod=window.vipComparisonPeriod||globalThis.vipComparisonPeriod;
const baseRender=window.renderVip||globalThis.renderVip;
const S={active:false,data:null,from:'',to:'',mode:'yoy',loading:false,summary:new Map()};
const $=id=>document.getElementById(id);
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const K=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/giu,'');
const N=v=>Number.isFinite(Number(v))?Number(v):0;
const day=v=>{const s=String(v||'');return /^\d{4}-\d{2}-\d{2}$/.test(s)?s.slice(8,10)+'.'+s.slice(5,7)+'.'+s.slice(0,4):s};
const monthStart=v=>String(v||'').slice(0,7)+'-01';
const monthEnd=v=>{const s=String(v||'').slice(0,7),y=+s.slice(0,4),m=+s.slice(5,7);return new Date(y,m,0).toISOString().slice(0,10)};
function prof(){try{return typeof currentProfile!=='undefined'?currentProfile:null}catch(_){return null}}
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
  if(!S.active||!S.data)return typeof baseSummary==='function'?baseSummary():[];
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
  if(!S.active||!S.data)return typeof basePeriod==='function'?basePeriod():{};
  return{
    prev:String(S.data.previous?.from||'').slice(0,7),
    cur:String(S.data.current?.from||'').slice(0,7),
    partial:true,
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
  return{from,to};
}
function compareMode(){
  const el=document.querySelector('#vip-period-controls-v236198 select[onchange*="vipMode198"]');
  const v=String(el?.value||'yoy');return ['yoy','mom'].includes(v)?v:'yoy';
}
function ensureControls(){
  if(document.getElementById('vip-date-range-v236434'))return;
  const host=document.getElementById('vip-period-controls-v236198')||document.getElementById('vip-period-controls-v236200');
  if(!host)return;
  const d=defaults();
  const box=document.createElement('div');box.id='vip-date-range-v236434';
  box.style.cssText='display:flex;gap:7px;align-items:end;flex-wrap:wrap;margin-left:6px;padding-left:10px;border-left:1px solid var(--border)';
  box.innerHTML='<div><label class="form-label">Дата с</label><input id="vip-date-from-v236434" type="date" class="form-input" style="width:auto" value="'+E(S.from||d.from)+'"></div>'+
    '<div><label class="form-label">Дата по</label><input id="vip-date-to-v236434" type="date" class="form-input" style="width:auto" value="'+E(S.to||d.to)+'"></div>'+
    '<button id="vip-date-apply-v236434" class="btn-primary" type="button">Применить даты</button>'+
    '<button id="vip-date-reset-v236434" class="btn-secondary" type="button">Весь месяц</button>'+
    '<div id="vip-date-status-v236434" style="font-size:11px;color:var(--sub);padding-bottom:8px;max-width:360px"></div>';
  host.appendChild(box);
  box.querySelector('#vip-date-apply-v236434').addEventListener('click',apply);
  box.querySelector('#vip-date-reset-v236434').addEventListener('click',()=>reset(true));
  if(S.active)status('Точный период активен: '+day(S.from)+' — '+day(S.to),'ok');
}
function status(text,kind='info'){
  const el=$('vip-date-status-v236434');if(!el)return;
  el.textContent=text||'';el.style.color=kind==='bad'?'var(--r)':kind==='ok'?'var(--g)':'var(--sub)';
}
async function apply(){
  if(S.loading)return;
  const from=$('vip-date-from-v236434')?.value||'',to=$('vip-date-to-v236434')?.value||'';
  if(!from||!to||to<from){status('Проверьте даты периода.','bad');return}
  S.loading=true;const b=$('vip-date-apply-v236434');if(b)b.disabled=true;status('Считаю точный период по срезам 1С…');
  try{
    const d=typeof db!=='undefined'?db:window.db;
    const mode=compareMode();
    const {data,error}=await d.rpc('vip_date_range_v236429',{p_from:from,p_to:to,p_compare_mode:mode});
    if(error)throw error;
    if(!data?.exact_current){
      const miss=(data?.current?.missing_snapshots||[]).map(day).join(', ');
      status('Нет точного среза 1С на '+(miss||'выбранную дату')+'. Месячные данные не подменяю.','bad');return;
    }
    S.active=true;S.data=data;S.from=from;S.to=to;S.mode=mode;
    try{localStorage.setItem('resanta_vip_date_range_v236434',JSON.stringify({from,to,mode}))}catch(_){}
    window.renderVip?.();
  }catch(e){console.warn(V,e);status('Не удалось применить даты: '+String(e?.message||e),'bad')}
  finally{S.loading=false;if(b)b.disabled=false}
}
function reset(rerender){
  S.active=false;S.data=null;S.summary.clear();
  try{localStorage.removeItem('resanta_vip_date_range_v236434')}catch(_){}
  if(rerender)window.renderVip?.();
}
function afterRender(){
  ensureControls();
  if(!S.active||!S.data)return;
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
  const wrapped=function(){const out=baseRender.apply(this,arguments);setTimeout(afterRender,0);return out};
  window.renderVip=wrapped;try{renderVip=wrapped}catch(_){}
}
document.addEventListener('change',e=>{
  if(e.target.closest?.('#vip-period-controls-v236198 select[onchange*="vipMonth198"]')&&S.active)reset(false);
  if(e.target.closest?.('#vip-period-controls-v236198 select[onchange*="vipMode198"]')&&S.active){setTimeout(apply,0)}
},true);
document.addEventListener('click',e=>{
  if(e.target.closest?.('#nav-vip,#bn-vip,[onclick*="goPage(\'vip\'"]'))setTimeout(()=>{ensureControls();afterRender()},220);
},true);
setTimeout(()=>{if(document.getElementById('page-vip')?.classList.contains('active')){ensureControls();afterRender()}},800);

window.RESANTA_VIP_DATE_RANGE_V236434=Object.freeze({version:V,exactSnapshots:true,noExtrapolation:true});
})();