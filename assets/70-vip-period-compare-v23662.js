/* RESANTA CRM v23.6.62 · VIP PERIOD COMPARISON
 * Additive analytics only. Does not change VIP membership, departments or base VIP render.
 * Modes:
 * - month to month: current month fact -> full previous month
 * - year to year: current month fact -> full same month previous year
 * - quarter to quarter: current quarter fact -> full previous quarter
 */
(function(){
'use strict';
if(window.RESANTA_VIP_PERIOD_COMPARE_V23662)return;
const V='v23.6.62',ROOT='vip-period-compare-v23662';
const cache=new Map();
let state={mode:'yoy',flight:null};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number(v)||0;
const money=v=>Math.round(num(v)).toLocaleString('ru-RU')+' BYN';
const ym=v=>String(v||'').slice(0,7);
function today(){try{return String(TODAY||'').slice(0,10)}catch(_){return new Date().toISOString().slice(0,10)}}
function monthName(m){return['','январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'][Number(m)]||String(m)}
function monthLabel(x){if(!/^\d{4}-\d{2}$/.test(String(x||'')))return String(x||'—');const [y,m]=x.split('-');return monthName(m)+' '+y}
function shiftMonth(x,delta){const [y,m]=String(x).split('-').map(Number),d=new Date(y,m-1+delta,1,12);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function prevYearMonth(x){return String(Number(String(x).slice(0,4))-1)+String(x).slice(4)}
function qCode(x){const [y,m]=String(x).split('-').map(Number);return{y,q:Math.floor((m-1)/3)+1}}
function prevQ(q){return q.q>1?{y:q.y,q:q.q-1}:{y:q.y-1,q:4}}
function qMonths(q){const s=(q.q-1)*3+1;return [0,1,2].map(i=>q.y+'-'+String(s+i).padStart(2,'0'))}
function qLabel(q){return q.q+' квартал '+q.y}
function currentMonth(){
  const cur=today().slice(0,7),months=[...new Set((allPurchaseHistory||[]).map(r=>ym(r.month)).filter(x=>/^\d{4}-\d{2}$/.test(x)))].sort();
  return months.includes(cur)?cur:(months[months.length-1]||cur);
}
function spec(mode){
  const cur=currentMonth(),partial=cur===today().slice(0,7),asof=today().split('-').reverse().join('.');
  if(mode==='mom'){
    const prev=shiftMonth(cur,-1);
    return{mode,curMonths:[cur],prevMonths:[prev],curLabel:monthLabel(cur)+(partial?' · факт на '+asof:''),prevLabel:'полный '+monthLabel(prev),note:'Текущий месяц сравнивается с полным предыдущим месяцем. Это ориентир для роста, а не финальная оценка незакрытого месяца.'};
  }
  if(mode==='qoq'){
    const cq=qCode(cur),pq=prevQ(cq);
    return{mode,curMonths:qMonths(cq).filter(x=>x<=cur),prevMonths:qMonths(pq),curLabel:qLabel(cq)+(partial?' · факт на '+asof:''),prevLabel:'полный '+qLabel(pq),note:'Текущий квартал — фактические продажи с начала квартала по текущую выгрузку; ориентир — полный предыдущий квартал.'};
  }
  const prev=prevYearMonth(cur);
  return{mode:'yoy',curMonths:[cur],prevMonths:[prev],curLabel:monthLabel(cur)+(partial?' · факт на '+asof:''),prevLabel:'полный '+monthLabel(prev),note:'По текущему сентябрю берём весь сентябрь прошлого года как планку. Процент показывает, сколько уже сделано к прошлогоднему уровню.'};
}
function pct(prev,cur){if(prev>0)return Math.round(cur/prev*100);if(cur>0)return null;return 0}
function deptOrder(d){return({'ВИП ДФ':1,'ВИП ДФС':2,'ВИП МПП':3})[d]||9}
function ensureCss(){if(document.getElementById(ROOT+'-css'))return;const s=document.createElement('style');s.id=ROOT+'-css';s.textContent=`
#${ROOT}{margin-top:10px}.vpc-tabs{display:flex;gap:7px;flex-wrap:wrap}.vpc-tab{border:1px solid var(--border);background:#fff;border-radius:9px;padding:7px 10px;cursor:pointer;font-size:12px}.vpc-tab.active{background:var(--ab);border-color:var(--a);color:var(--at);font-weight:800}.vpc-note{font-size:11px;color:var(--sub);line-height:1.45;margin-top:8px}.vpc-wrap{overflow:auto;margin-top:10px;border:1px solid var(--border);border-radius:10px}.vpc-table{width:100%;border-collapse:collapse;min-width:760px}.vpc-table th,.vpc-table td{padding:8px 9px;border-bottom:1px solid var(--border);font-size:11px;text-align:right;white-space:nowrap}.vpc-table th{background:#F8FAFC;color:var(--sub);text-transform:uppercase;font-size:9px}.vpc-table th:first-child,.vpc-table td:first-child,.vpc-table th:nth-child(2),.vpc-table td:nth-child(2){text-align:left}.vpc-good{color:var(--g);font-weight:800}.vpc-warn{color:var(--am);font-weight:800}.vpc-load{padding:14px;color:var(--sub);font-size:12px}
`;document.head.appendChild(s)}
function ensureRoot(){
  const page=document.getElementById('page-vip'),info=document.getElementById('vip-period-info');if(!page||!info)return null;
  ensureCss();
  let root=document.getElementById(ROOT);
  if(!root){root=document.createElement('div');root.id=ROOT;root.className='card';info.insertAdjacentElement('afterend',root)}
  return root;
}
function shell(){
  const root=ensureRoot();if(!root)return;
  root.innerHTML='<div class="card-title">📊 Дополнительное сравнение ВИП</div><div class="vpc-tabs">'+[
    ['yoy','Год к году'],['mom','Месяц к месяцу'],['qoq','Квартал к кварталу']
  ].map(x=>'<button class="vpc-tab '+(state.mode===x[0]?'active':'')+'" onclick="vipPeriodCompareV23662(\''+x[0]+'\')">'+x[1]+'</button>').join('')+'</div><div id="'+ROOT+'-body" class="vpc-load">Загружаю сравнение…</div>';
}
async function rowsFor(mode){
  const sp=spec(mode),stamp=[mode,sp.curMonths.join(','),sp.prevMonths.join(','),(allPurchaseHistory||[]).length,(allVipSales||[]).length].join('|');
  if(cache.has(stamp))return{sp,rows:cache.get(stamp)};
  const defs=typeof vipMemberDefinitions==='function'?vipMemberDefinitions():[],rows=[];
  for(let i=0;i<defs.length;i++){
    const d=defs[i],m=typeof vipMatchedClient==='function'?vipMatchedClient(d.client_name):null;
    let hist=[];try{hist=typeof vipRowsForMember==='function'?vipRowsForMember(d,m):[]}catch(_){hist=[]}
    let prev=0,cur=0;
    for(const r of hist){const mm=ym(r.month),v=num(r.revenue);if(sp.prevMonths.includes(mm))prev+=v;if(sp.curMonths.includes(mm))cur+=v}
    rows.push({name:d.client_name,department:d.department||'—',manager:m?.manager_name||'',prev,cur,ratio:pct(prev,cur),gap:Math.max(0,prev-cur)});
    if(i%4===3)await new Promise(resolve=>setTimeout(resolve,0));
  }
  rows.sort((a,b)=>deptOrder(a.department)-deptOrder(b.department)||b.gap-a.gap||a.name.localeCompare(b.name,'ru'));
  cache.set(stamp,rows);return{sp,rows};
}
function renderResult(sp,rows){
  const body=document.getElementById(ROOT+'-body');if(!body)return;
  body.className='';
  body.innerHTML='<div class="vpc-note"><b>Ориентир:</b> '+esc(sp.prevLabel)+' → <b>'+esc(sp.curLabel)+'</b><br>'+esc(sp.note)+'</div><div class="vpc-wrap"><table class="vpc-table"><thead><tr><th>Клиент</th><th>ВИП</th><th>Ориентир</th><th>Факт</th><th>Выполнение</th><th>До ориентира</th></tr></thead><tbody>'+rows.map(r=>'<tr><td><span style="cursor:pointer;font-weight:700" onclick="try{toggleVipCard(\''+esc(r.name).replace(/'/g,"\\'")+'\')}catch(_){}">'+esc(r.name)+'</span>'+(r.manager?'<div style="font-size:9px;color:var(--sub)">👤 '+esc(r.manager)+'</div>':'')+'</td><td>'+esc(r.department)+'</td><td>'+money(r.prev)+'</td><td>'+money(r.cur)+'</td><td class="'+(r.ratio!=null&&r.ratio>=100?'vpc-good':'vpc-warn')+'">'+(r.ratio==null?'новые продажи':r.ratio+'%')+'</td><td>'+money(r.gap)+'</td></tr>').join('')+'</tbody></table></div>';
}
async function run(mode){
  state.mode=mode;shell();const body=document.getElementById(ROOT+'-body');if(body)body.textContent='Считаю ВИП по данным 1С…';
  try{const out=await rowsFor(mode);if(state.mode===mode)renderResult(out.sp,out.rows)}catch(e){if(body)body.innerHTML='<span style="color:var(--r)">Не удалось посчитать сравнение: '+esc(e?.message||e)+'</span>'}
}
window.vipPeriodCompareV23662=function(mode){if(!['yoy','mom','qoq'].includes(mode))mode='yoy';if(state.flight)return;state.flight=run(mode).finally(()=>{state.flight=null})};
const base=window.renderVip;
if(typeof base==='function'){
  window.renderVip=function(){const out=base.apply(this,arguments);setTimeout(()=>{if(!document.getElementById(ROOT)){shell();window.vipPeriodCompareV23662(state.mode)}},0);return out};
  try{renderVip=window.renderVip}catch(_){}
}
setTimeout(()=>{if(document.getElementById('page-vip')?.classList.contains('active')){shell();window.vipPeriodCompareV23662(state.mode)}},0);
window.RESANTA_VIP_PERIOD_COMPARE_V23662=Object.freeze({version:V,changesVipMembership:false,modes:['yoy','mom','qoq'],currentPartialAgainstFullReference:true,noWrites:true,noPolling:true});
})();