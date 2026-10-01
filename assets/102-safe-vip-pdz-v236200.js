/* RESANTA CRM v23.6.200 · SAFE VIP + PDZ FILTERS */
(function(){
'use strict';
if(window.RESANTA_SAFE_VIP_PDZ_V236200)return;
const V='v23.6.201',KEY='resanta_vip_month_v236200',MODE='resanta_vip_mode_v236200';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ym=v=>String(v||'').slice(0,7),months=['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const label=v=>{const s=ym(v),m=+s.slice(5,7);return(months[m-1]||s)+' '+s.slice(0,4)};
const shift=(v,n)=>{const s=ym(v),d=new Date(+s.slice(0,4),+s.slice(5,7)-1+n,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
const active=id=>{const name=String(id||'').replace(/^page-/,'');return !!document.getElementById(id)?.classList.contains('active')||String(document.getElementById('app')?.dataset?.activePage||'')===name};
const historyMonths=()=>{try{return[...new Set((allPurchaseHistory||[]).map(x=>ym(x.month)).filter(x=>/^\d{4}-\d{2}$/.test(x)))].sort().reverse()}catch(_){return[]}};
let vipMonth='',vipMode='yoy';
try{vipMonth=localStorage.getItem(KEY)||'';vipMode=localStorage.getItem(MODE)||'yoy'}catch(_){}
if(!['yoy','mom'].includes(vipMode))vipMode='yoy';
function currentMonth(){try{return ym(TODAY)||new Date().toISOString().slice(0,7)}catch(_){return new Date().toISOString().slice(0,7)}}
function ensureVipMonth(){const a=historyMonths();if(!a.length)return'';if(!a.includes(vipMonth))vipMonth=a.includes(currentMonth())?currentMonth():a[0];return vipMonth}
function period(){const cur=ensureVipMonth();return{cur,prev:vipMode==='mom'?shift(cur,-1):shift(cur,-12),partial:cur===currentMonth(),currentMonth:currentMonth(),missingCurrent:false}}
function installVipPeriod(){window.vipComparisonPeriod=period;try{vipComparisonPeriod=period}catch(_){}}
function vipBar(){
 if(!active('page-vip'))return;installVipPeriod();
 const info=document.getElementById('vip-period-info');if(!info)return;
 document.getElementById('vip-period-controls-v236198')?.remove();
 let box=document.getElementById('vip-period-controls-v236200');
 if(!box){
   box=document.createElement('div');
   box.id='vip-period-controls-v236200';
   box.className='card';
   box.style.cssText='margin-bottom:12px;padding:12px 14px';
   info.insertAdjacentElement('beforebegin',box);
 }
 const arr=historyMonths(),cur=ensureVipMonth(),p=period();
 box.innerHTML='<div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap"><div><label class="form-label">Месяц ВИП</label><div style="display:flex;gap:5px"><button type="button" class="btn-secondary" data-vip-step="-1">←</button><select class="form-input" data-vip-month>'+arr.map(x=>'<option value="'+x+'" '+(x===cur?'selected':'')+'>'+E(label(x))+'</option>').join('')+'</select><button type="button" class="btn-secondary" data-vip-step="1">→</button></div></div><div><label class="form-label">Сравнение</label><select class="form-input" data-vip-mode><option value="yoy" '+(vipMode==='yoy'?'selected':'')+'>К прошлому году</option><option value="mom" '+(vipMode==='mom'?'selected':'')+'>К предыдущему месяцу</option></select></div><div style="font-size:11px;color:var(--sub);padding-bottom:8px"><b>'+E(label(cur))+'</b> ↔ '+E(label(p.prev))+'</div></div>';
}
function rerenderVip(){installVipPeriod();try{window.renderVip?.()}catch(e){console.warn(V,'VIP render',e)}setTimeout(vipBar,0)}
let debtDates=[],debtSelected='',debtFlight=null;
const dateRu=v=>{const s=String(v||'');return/^\d{4}-\d{2}-\d{2}$/.test(s)?s.slice(8,10)+'.'+s.slice(5,7)+'.'+s.slice(0,4):s};
const money=v=>Number(v||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
async function loadDebt(dateValue){
 if(dateValue&&typeof window.debtDate198==='function'){
   debtSelected=String(dateValue);window.debtDate198(debtSelected);setTimeout(debtBar,80);return;
 }
 if(debtFlight)return debtFlight;
 debtFlight=(async()=>{
   const client=typeof db!=='undefined'?db:window.db;if(!client?.rpc)return;
   const {data,error}=await client.rpc('crm_debt_history_v236198',{p_report_date:dateValue||null});if(error)throw error;
   debtDates=Array.isArray(data?.dates)?data.dates:[];debtSelected=String(data?.selected_date||'');
   if(typeof window.debtDate198==='function'&&debtSelected){
     window.debtDate198(debtSelected);
   }else{
     try{allClientDebt=Array.isArray(data?.rows)?data.rows:[]}catch(_){}
     try{window.renderDebt?.()}catch(_){}
   }
   setTimeout(debtBar,100);
 })().catch(e=>console.warn(V,'PDZ',e)).finally(()=>debtFlight=null);
 return debtFlight;
}
function debtBar(){
 if(!active('page-debt'))return;
 let box=document.getElementById('debt-period-filter-v236198');
 if(!box){box=document.createElement('div');box.id='debt-period-filter-v236198';box.className='card';box.style.cssText='margin-bottom:12px;padding:12px 14px';document.getElementById('debt-freshness')?.insertAdjacentElement('beforebegin',box)}
 const latest=String(debtDates[0]?.report_date||'');
 box.innerHTML='<div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap"><div><label class="form-label">Срез ПДЗ</label><select class="form-input" data-debt-date>'+debtDates.map(x=>{const d=String(x.report_date||'');return'<option value="'+d+'" '+(d===debtSelected?'selected':'')+'>'+dateRu(d)+' · '+Number(x.debtors||0)+' должн. · '+money(x.total)+'</option>'}).join('')+'</select></div><button type="button" class="btn-primary" data-debt-latest '+(debtSelected===latest?'disabled':'')+'>Свежий срез'+(latest?' · '+dateRu(latest):'')+'</button><button type="button" class="btn-secondary" data-debt-refresh>↻ Обновить просрочку</button><div style="font-size:11px;color:var(--sub);padding-bottom:8px">Обновление перечитывает последний уже импортированный отчёт 1С; история дат не стирается.</div></div>';
 const banner=document.getElementById('debt-freshness'),x=debtDates.find(z=>String(z.report_date)===debtSelected)||{};
 if(banner&&debtSelected){
   const hist=latest&&debtSelected!==latest;
   banner.innerHTML='<div style="background:'+(hist?'var(--ab)':'var(--gb)')+';border-radius:8px;padding:9px 12px;margin-bottom:12px;font-size:12px;color:'+(hist?'var(--at)':'var(--gt)')+'">'+(hist?'📅 Исторический':'✅ Свежий')+' срез ПДЗ на <b>'+dateRu(debtSelected)+'</b> · должников: <b>'+Number(x.debtors||0)+'</b> · просрочено: <b>'+money(x.total)+'</b>.'+(hist?' Это не текущая просрочка.':'')+'</div>';
 }
}
let vipSummaryBase=null,vipSummaryCache=null,vipSummaryKey='';
function installVipSummaryCache(){
 if(vipSummaryBase||typeof window.getVipClientSummary!=='function')return;
 vipSummaryBase=window.getVipClientSummary;
 const fast=function(){
   let h=null,v=null,cl=null,stamp='';
   try{h=allPurchaseHistory;v=allVipSales;cl=allClients;stamp=String(crmImportStatus?.('sales')?.last_success_at||'')}catch(_){}
   const p=period(),key=[p.prev,p.cur,vipMode,h?.length||0,v?.length||0,cl?.length||0,stamp].join('|');
   if(vipSummaryCache&&key===vipSummaryKey&&fast._h===h&&fast._v===v&&fast._c===cl)return vipSummaryCache;
   const t=performance?.now?.()||Date.now();
   const out=vipSummaryBase.apply(this,arguments);
   vipSummaryCache=out;vipSummaryKey=key;fast._h=h;fast._v=v;fast._c=cl;
   const spent=(performance?.now?.()||Date.now())-t;
   if(spent>80)console.info(V+' VIP summary cached in '+Math.round(spent)+' ms');
   return out;
 };
 window.getVipClientSummary=fast;
 try{getVipClientSummary=fast}catch(_){}
}
function clearVipSummaryCache(){vipSummaryCache=null;vipSummaryKey=''}
function init(){
 if(active('page-vip')){installVipPeriod();installVipSummaryCache();vipBar()}
 if(active('page-debt'))loadDebt(null);
}
document.addEventListener('change',e=>{
 const vm=e.target.closest?.('[data-vip-month]');if(vm){vipMonth=vm.value;clearVipSummaryCache();try{localStorage.setItem(KEY,vipMonth)}catch(_){};rerenderVip();return}
 const md=e.target.closest?.('[data-vip-mode]');if(md){vipMode=md.value;clearVipSummaryCache();try{localStorage.setItem(MODE,vipMode)}catch(_){};rerenderVip();return}
 const dd=e.target.closest?.('[data-debt-date]');if(dd){loadDebt(dd.value);return}
},true);
document.addEventListener('click',e=>{
 const st=e.target.closest?.('[data-vip-step]');if(st){const a=historyMonths(),i=a.indexOf(ensureVipMonth()),next=Math.max(0,Math.min(a.length-1,i-Number(st.dataset.vipStep||0)));if(a[next]){vipMonth=a[next];clearVipSummaryCache();try{localStorage.setItem(KEY,vipMonth)}catch(_){};rerenderVip()}return}
 if(e.target.closest?.('[data-debt-latest]')){const d=String(debtDates[0]?.report_date||'');if(d)loadDebt(d);return}
 if(e.target.closest?.('[data-debt-refresh]')){loadDebt(null);return}
 if(e.target.closest?.('.nav-item,.bn-item,[data-page]'))setTimeout(init,120);
},true);
setTimeout(init,0);
window.RESANTA_SAFE_VIP_PDZ_V236200=Object.freeze({version:V,noPolling:true});
})();