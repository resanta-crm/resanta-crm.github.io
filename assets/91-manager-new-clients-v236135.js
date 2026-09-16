/* RESANTA CRM v23.6.135 · MANAGER NEW CLIENTS / REACTIVATION DYNAMICS
 * Business rule: client counts as new KPI fact when it ships in selected month
 * after 6 full calendar months without positive shipments. Truly first-ever
 * shipment is included by the same rule. Server is source of truth.
 * One RPC per selected month. No polling. No MutationObserver. No writes.
 */
(function(){
'use strict';
if(window.RESANTA_MANAGER_NEW_CLIENTS_V236135)return;
const V='v23.6.135',ID='manager-new-clients-v236135';
let flight=null,lastSig='',lastData=null,wrapped=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const money=v=>num(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const ym=v=>String(v||'').slice(0,7);
const curYm=()=>{try{return ym(TODAY)||new Date().toISOString().slice(0,7)}catch(_){return new Date().toISOString().slice(0,7)}};
const monthNames=['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
function monthLabel(v){const s=ym(v),m=Number(s.slice(5,7));return (monthNames[m-1]||s)+' '+s.slice(0,4)}
function active(){return document.getElementById('page-managers')?.classList.contains('active')}
function dbc(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
function selectedMonth(){return ym(document.getElementById('manager-kpi-month')?.value)||curYm()}
function root(){
  const page=document.getElementById('page-managers');if(!page)return null;
  let r=document.getElementById(ID);if(r)return r;
  r=document.createElement('div');r.id=ID;r.className='card';r.style.cssText='margin-top:14px;padding:14px';
  const table=document.getElementById('managers-table');const card=table?.closest('.card');
  if(card?.parentElement)card.insertAdjacentElement('afterend',r);else page.appendChild(r);
  return r;
}
function style(){if(document.getElementById(ID+'-style'))return;const s=document.createElement('style');s.id=ID+'-style';s.textContent=`
#${ID} .mnc-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}.mnc-title{font-size:14px;font-weight:800}.mnc-note{font-size:10px;color:var(--sub);margin-top:3px;line-height:1.45}.mnc-group{margin-top:12px}.mnc-group-title{font-size:12px;font-weight:800;margin-bottom:5px}.mnc-row{display:grid;grid-template-columns:minmax(210px,1.3fr) 150px 130px minmax(260px,1.6fr);gap:9px;align-items:center;border-top:1px solid var(--border);padding:9px 2px;font-size:11px}.mnc-name{font-weight:750}.mnc-sub{font-size:10px;color:var(--sub);margin-top:2px}.mnc-badge{display:inline-flex;padding:3px 7px;border-radius:99px;font-size:10px;font-weight:700;background:var(--ab);color:var(--at)}.mnc-badge.return{background:var(--amb);color:var(--am)}.mnc-rev b{display:block;font-size:12px}.mnc-dyn{display:flex;gap:5px;flex-wrap:wrap}.mnc-month{border:1px solid var(--border);border-radius:7px;background:#fff;padding:5px 7px;min-width:72px}.mnc-month span{display:block;color:var(--sub);font-size:9px}.mnc-month b{font-size:10px}.mnc-empty{padding:12px 0;color:var(--sub);font-size:11px}.mnc-load{padding:10px 0;color:var(--sub);font-size:11px}@media(max-width:800px){#${ID} .mnc-row{grid-template-columns:1fr 120px}.mnc-dyn{grid-column:1/3}.mnc-rev{grid-column:2}.mnc-type{grid-column:1}}`;
  document.head.appendChild(s)}
function futureRevenue(month,value){return month>curYm()?'—':money(value)}
function render(data){
  if(!active())return;style();const r=root();if(!r)return;
  const rows=Array.isArray(data?.rows)?data.rows:[];
  const by=new Map();rows.forEach(x=>{const k=String(x.manager_name||'—');if(!by.has(k))by.set(k,[]);by.get(k).push(x)});
  r.innerHTML='<div class="mnc-head"><div><div class="mnc-title">🆕 Новые / возвращённые клиенты · '+esc(monthLabel(data?.month||selectedMonth()))+'</div><div class="mnc-note">Правило KPI: клиент отгрузился в выбранном месяце и до этого 6 полных календарных месяцев не имел положительных отгрузок. Первая отгрузка в истории тоже считается.</div></div></div>'+
    (rows.length?[...by.entries()].map(([mgr,a])=>'<div class="mnc-group"><div class="mnc-group-title">'+esc(mgr)+' · '+a.length+'</div>'+a.map(x=>{
      const re=x.type==='reactivated';const last=x.last_sale_month?monthLabel(x.last_sale_month):'раньше не грузился';
      const label=re?'Возвращён после '+Math.max(6,Number(x.inactive_months)||6)+' мес.':'Новый клиент';
      const dyn=[[x.current_month,x.current_revenue],[x.next1_month,x.next1_revenue],[x.next2_month,x.next2_revenue],[x.next3_month,x.next3_revenue]];
      return '<div class="mnc-row"><div><div class="mnc-name">'+esc(x.client_name||'Клиент')+'</div><div class="mnc-sub">Последняя отгрузка до входа: '+esc(last)+'</div></div><div class="mnc-type"><span class="mnc-badge '+(re?'return':'')+'">'+esc(label)+'</span></div><div class="mnc-rev"><span>Отгрузка в месяц входа</span><b>'+money(x.current_revenue)+'</b></div><div class="mnc-dyn">'+dyn.map(d=>'<div class="mnc-month"><span>'+esc(monthLabel(d[0]))+'</span><b>'+esc(futureRevenue(d[0],d[1]))+'</b></div>').join('')+'</div></div>';
    }).join('')+'</div>').join(''):'<div class="mnc-empty">В выбранном месяце клиентов, подходящих под правило 6 месяцев, нет.</div>');
}
async function load(force=false){
  if(!active())return;const m=selectedMonth(),sig=m+'|'+String(currentProfile?.id||currentProfile?.name||'');
  if(!force&&lastSig===sig&&lastData){render(lastData);return}
  if(flight)return flight;style();const r=root();if(r)r.innerHTML='<div class="mnc-load">Загружаю новых и возвращённых клиентов…</div>';
  flight=(async()=>{const d=dbc();if(!d)throw Error('Нет подключения к базе');const {data,error}=await d.rpc('crm_manager_new_clients_detail_v236135',{p_month:m,p_manager:null});if(error)throw error;lastSig=sig;lastData=data||{month:m,rows:[]};render(lastData);return lastData})().catch(e=>{console.warn(V,e);const x=root();if(x)x.innerHTML='<div class="mnc-empty">Не удалось загрузить детализацию новых клиентов: '+esc(e?.message||e)+'</div>';return null}).finally(()=>flight=null);
  return flight;
}
function install(){
  style();
  if(typeof window.renderManagers==='function'&&!window.renderManagers.__mnc135){const base=window.renderManagers;const fn=function(){const out=base.apply(this,arguments);Promise.resolve(out).finally(()=>setTimeout(()=>load(true),0));return out};fn.__mnc135=true;fn.__base=base;window.renderManagers=fn;try{renderManagers=fn}catch(_){}}
  if(!wrapped&&typeof window.goPage==='function'){const base=window.goPage;const fn=function(p){const out=base.apply(this,arguments);if(String(p)==='managers')setTimeout(()=>load(false),80);return out};fn.__mnc135=true;window.goPage=fn;wrapped=true}
  const inp=document.getElementById('manager-kpi-month');if(inp&&!inp.dataset.mnc135){inp.dataset.mnc135='1';inp.addEventListener('change',()=>setTimeout(()=>load(true),50));}
  if(active())setTimeout(()=>load(false),0);
}
install();[250,700,1500,3000].forEach(ms=>setTimeout(install,ms));
window.RESANTA_MANAGER_NEW_CLIENTS_V236135=Object.freeze({version:V,rule:'6_full_inactive_months',noPolling:true,noMutationObserver:true,noWrites:true,reload:()=>load(true)});
})();
