/* RESANTA CRM v23.1.0 · AI MANAGER PLANS V1
 * Field managers only: deterministic data-driven plan recommendation.
 * No automatic DB writes. Boss reviews -> applies -> existing save confirms.
 */
(function(){
'use strict';
if(window.RESANTA_AI_MANAGER_PLANS_V2310)return;

const VERSION='v23.1.0-ai-manager-plans-v1';
const BUSINESS_GROWTH_TARGET=0.30;
let lastRecommendation=null;

const n=v=>Number(v)||0;
const money=v=>Math.round(n(v)).toLocaleString('ru-RU')+' BYN';
const pct=v=>(v>=0?'+':'')+(v*100).toFixed(1)+'%';
const escLocal=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const roundPlan=v=>Math.max(0,Math.round(n(v)/1000)*1000);
const avg=a=>a.length?a.reduce((s,x)=>s+n(x),0)/a.length:0;

function ym(v){return String(v||'').slice(0,7);}
function shiftMonth(month,delta){
  if(!/^\d{4}-\d{2}$/.test(month))return '';
  const d=new Date(Number(month.slice(0,4)),Number(month.slice(5,7))-1+delta,1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function sameManager(a,b){
  try{return typeof managerLooseMatch==='function'?managerLooseMatch(a,b):norm(a)===norm(b);}catch(_){return norm(a)===norm(b);}
}
function norm(v){return String(v||'').trim().toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,' ').replace(/\s+/g,' ').trim();}
function clientKey(v){
  try{if(typeof canonicalSalesClientName==='function')return canonicalSalesClientName(v)||norm(v);}catch(_){}
  return norm(v);
}
function positiveSale(r){return n(r?.revenue)>0||n(r?.qty)>0;}

function managerRows(manager){
  return (allPurchaseHistory||[]).filter(r=>sameManager(r.manager_name,manager));
}
function revenueByMonth(rows){
  const out=new Map();
  rows.forEach(r=>{const m=ym(r.month);if(/^\d{4}-\d{2}$/.test(m))out.set(m,(out.get(m)||0)+n(r.revenue));});
  return out;
}
function activeClientsForMonth(rows,month){
  return new Set(rows.filter(r=>ym(r.month)===month&&positiveSale(r)).map(r=>clientKey(r.client_name)).filter(Boolean));
}
function activeClientsForMonths(rows,months){
  const set=new Set(months);
  return new Set(rows.filter(r=>set.has(ym(r.month))&&positiveSale(r)).map(r=>clientKey(r.client_name)).filter(Boolean));
}
function clientRevenueForMonth(rows,month){
  const out=new Map();
  rows.filter(r=>ym(r.month)===month).forEach(r=>{
    const k=clientKey(r.client_name);if(k)out.set(k,(out.get(k)||0)+n(r.revenue));
  });
  return out;
}
function clientAvgForMonths(rows,months){
  const out=new Map(),set=new Set(months),den=Math.max(1,months.length);
  rows.filter(r=>set.has(ym(r.month))).forEach(r=>{
    const k=clientKey(r.client_name);if(k)out.set(k,(out.get(k)||0)+n(r.revenue));
  });
  for(const [k,v] of out)out.set(k,v/den);
  return out;
}
function assignedClients(manager){
  return (allClients||[]).filter(c=>sameManager(c.manager_name,manager));
}

function calcRecommendation(manager,targetMonth){
  const rows=managerRows(manager);
  if(!rows.length)throw new Error('По менеджеру нет истории продаж 1С.');

  const revMap=revenueByMonth(rows);
  const lastYearMonth=shiftMonth(targetMonth,-12);
  const lastYear=n(revMap.get(lastYearMonth));
  // Current month can be partial. For a next-month plan we use only fully closed months.
  const lastClosed=shiftMonth(String(typeof TODAY!=='undefined'?TODAY:new Date().toISOString()).slice(0,7),-1);
  const closedBeforeTarget=[...Array(18)].map((_,i)=>shiftMonth(targetMonth,-1-i)).filter(m=>m&&m<=lastClosed);
  const prev3=closedBeforeTarget.slice(0,3);
  const prev6=closedBeforeTarget.slice(0,6);
  const prev12=closedBeforeTarget.slice(0,12);
  const avg3=avg(prev3.map(m=>n(revMap.get(m))));
  const avg6=avg(prev6.map(m=>n(revMap.get(m))));

  const yoyPairs=prev6.map(m=>({cur:n(revMap.get(m)),prev:n(revMap.get(shiftMonth(m,-12))) })).filter(x=>x.prev>0);
  const recentYoy=yoyPairs.slice(0,3).map(x=>x.cur/x.prev-1);
  const recentYoyTrend=recentYoy.length?clamp(avg(recentYoy),-0.45,0.80):0;
  const yearCurrent=prev12.reduce((s,m)=>s+n(revMap.get(m)),0);
  const yearPrevious=prev12.reduce((s,m)=>s+n(revMap.get(shiftMonth(m,-12))),0);
  const annualTrend=yearPrevious>0?clamp(yearCurrent/yearPrevious-1,-0.45,0.80):recentYoyTrend;
  const yoyTrend=clamp(recentYoyTrend*0.70+annualTrend*0.30,-0.45,0.80);
  const momentum=avg6>0?clamp(avg3/avg6-1,-0.30,0.45):0;

  const lyPrev3=[-13,-14,-15].map(d=>shiftMonth(targetMonth,d));
  const lyPrevAvg=avg(lyPrev3.map(m=>n(revMap.get(m))));
  const seasonal=lastYear>0&&lyPrevAvg>0?clamp(lastYear/lyPrevAvg,0.65,1.55):1;

  const trendBase=lastYear>0?lastYear*(1+yoyTrend):0;
  const momentumBase=avg3>0?avg3*seasonal*(1+momentum*0.35):0;
  let realistic=0;
  if(trendBase>0&&momentumBase>0)realistic=trendBase*0.55+momentumBase*0.45;
  else realistic=Math.max(trendBase,momentumBase,avg3,avg6);

  // Conservative recoverable reserve: only part of the turnover that existed
  // in the same month last year but is currently below the recent monthly pace.
  const lyClient=clientRevenueForMonth(rows,lastYearMonth);
  const recentClient=clientAvgForMonths(rows,prev3);
  let recoverableReserve=0,lostClientCount=0;
  for(const [k,lyRev] of lyClient){
    const cur=n(recentClient.get(k));
    if(lyRev>0&&cur<lyRev){recoverableReserve+=(lyRev-cur)*0.25;if(cur<=0)lostClientCount++;}
  }
  recoverableReserve=Math.min(recoverableReserve,Math.max(lastYear,avg3,1)*0.12);
  realistic+=recoverableReserve;

  if(lastYear>0){
    const lower=Math.min(lastYear,avg3||lastYear)*0.70;
    const upper=Math.max(lastYear,avg3,avg6,1)*1.80;
    realistic=clamp(realistic,lower,upper);
  }

  const target30=lastYear>0?lastYear*(1+BUSINESS_GROWTH_TARGET):0;
  const targetConfirmed=target30>0&&realistic>=target30;
  const recommendedShipment=roundPlan(targetConfirmed?Math.max(target30,realistic):realistic);
  const recommendedGrowth=lastYear>0?recommendedShipment/lastYear-1:null;
  const gap30=target30>0?Math.max(0,target30-realistic):0;

  const sameLyAkb=activeClientsForMonth(rows,lastYearMonth).size;
  const akb3=prev3.map(m=>activeClientsForMonth(rows,m).size);
  const avgAkb3=avg(akb3);
  const maxAkb3=Math.max(0,...akb3);
  const active12Months=[...Array(12)].map((_,i)=>shiftMonth(targetMonth,-1-i));
  const active12=activeClientsForMonths(rows,active12Months);
  const activeRecent=activeClientsForMonths(rows,prev3);
  let returnable=0;active12.forEach(k=>{if(!activeRecent.has(k))returnable++;});

  const assigned=assignedClients(manager);
  const knownBuyers=active12;
  const potentialAssigned=assigned.filter(c=>String(c.client_status||'').toLowerCase()==='потенциальный'&&!knownBuyers.has(clientKey(c.name))).length;
  const akbBase=Math.max(sameLyAkb,avgAkb3,maxAkb3);
  const akbReserve=Math.ceil(returnable*0.25+potentialAssigned*0.20);
  let recommendedAkb=Math.ceil(akbBase+akbReserve);
  if(assigned.length)recommendedAkb=Math.min(assigned.length,recommendedAkb);
  recommendedAkb=Math.max(maxAkb3,recommendedAkb);

  const monthsWithData=prev6.filter(m=>revMap.has(m)).length;
  const confidence=lastYear>0&&monthsWithData>=5?'высокая':monthsWithData>=3?'средняя':'низкая';

  return {
    manager,targetMonth,lastYearMonth,lastYear,avg3,avg6,yoyTrend,recentYoyTrend,annualTrend,yearCurrent,yearPrevious,momentum,seasonal,
    realistic,recoverableReserve,lostClientCount,target30,targetConfirmed,recommendedShipment,recommendedGrowth,gap30,
    sameLyAkb,avgAkb3,maxAkb3,returnable,potentialAssigned,assignedCount:assigned.length,recommendedAkb,confidence,monthsWithData
  };
}

function injectPanel(){
  if(currentProfile?.role!=='boss')return null;
  const modal=document.querySelector('#modal-manager-plan .modal');
  if(!modal)return null;
  let root=document.getElementById('manager-ai-plan-v2310');
  if(!root){
    root=document.createElement('div');root.id='manager-ai-plan-v2310';
    const note=document.getElementById('manager-plan-note')?.closest('.form-field');
    (note||modal.querySelector('.modal-head'))?.insertAdjacentElement(note?'beforebegin':'afterend',root);
  }
  root.innerHTML='<div style="border:1px solid #BFDBFE;background:#F8FBFF;border-radius:12px;padding:12px 13px;margin-bottom:14px">'
    +'<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap">'
      +'<div><div style="font-size:13px;font-weight:800;color:var(--at)">🤖 ИИ-план · черновик руководителя</div>'
      +'<div style="font-size:11px;color:var(--sub);line-height:1.5;margin-top:3px">Цель бизнеса — минимум +30% год к году. Если история не подтверждает +30%, CRM покажет разрыв, а решение остаётся за руководителем.</div></div>'
      +'<button type="button" class="btn-secondary" style="padding:7px 10px;white-space:nowrap" onclick="crmCalculateManagerAiPlanV2310()">Рассчитать</button>'
    +'</div><div id="manager-ai-plan-result-v2310" style="margin-top:10px;font-size:12px;color:var(--sub)">Нажмите «Рассчитать». Существующий утверждённый план ИИ сам не изменяет.</div></div>';
  const save=[...modal.querySelectorAll('button')].find(b=>String(b.getAttribute('onclick')||'').includes('saveManagerKpiPlan'));
  if(save)save.textContent='✅ Утвердить и зафиксировать';
  return root;
}

function currentExistingPlan(){
  const manager=document.getElementById('manager-plan-name')?.value||'';
  const month=ym(document.getElementById('manager-plan-month')?.value||'');
  return (allManagerKpiPlans||[]).find(p=>sameManager(p.manager_name,manager)&&ym(p.period_month)===month)||null;
}
function resetPanelMessage(){
  injectPanel();lastRecommendation=null;
  const out=document.getElementById('manager-ai-plan-result-v2310');if(!out)return;
  const p=currentExistingPlan();
  out.innerHTML=p?'<span style="color:var(--g);font-weight:700">✅ На этот месяц план уже сохранён.</span> ИИ может пересчитать рекомендацию для сравнения, но ничего не поменяет без вашего действия.'
    :'План ещё не утверждён. Нажмите «Рассчитать» — CRM проверит историю 1С, цель +30% и АКБ.';
}

async function calculate(){
  if(currentProfile?.role!=='boss')return;
  injectPanel();
  const out=document.getElementById('manager-ai-plan-result-v2310');
  const manager=document.getElementById('manager-plan-name')?.value||'';
  const month=ym(document.getElementById('manager-plan-month')?.value||'');
  if(!manager||!month){if(out)out.textContent='Выберите менеджера и месяц.';return;}
  if(out)out.innerHTML='<span style="color:var(--a);font-weight:700">⏳ Загружаю историю продаж 1С и считаю потенциал…</span>';
  try{
    if(typeof window.v22722EnsureHistory!=='function')throw new Error('общий загрузчик истории продаж недоступен');
    await window.v22722EnsureHistory({reason:'manager-ai-plan-v2310'});
    if(!Array.isArray(allPurchaseHistory)||!allPurchaseHistory.length)throw new Error('история продаж 1С не загрузилась');
    const r=calcRecommendation(manager,month);lastRecommendation=r;
    const existing=currentExistingPlan();
    const targetLine=r.lastYear>0
      ?'<div><b>Цель +30%:</b> '+money(r.target30)+' · прошлый год '+money(r.lastYear)+'</div>'
      :'<div style="color:var(--am)"><b>Нет базы аналогичного месяца прошлого года.</b> Цель +30% проверить невозможно — рекомендация строится по последним месяцам.</div>';
    const stateLine=r.lastYear<=0?''
      :(r.targetConfirmed
        ?'<div style="margin-top:7px;padding:8px 10px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;color:#166534"><b>✅ Рост +30% подтверждается данными.</b></div>'
        :'<div style="margin-top:7px;padding:8px 10px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;color:#92400E"><b>⚠️ Рост +30% сейчас не подтверждается.</b> Необеспеченный разрыв: <b>'+money(r.gap30)+'</b>. Руководитель может всё равно утвердить бизнес-цель +30% вручную.</div>');
    out.innerHTML=targetLine
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px">'
        +'<div style="background:#fff;border:1px solid var(--border);border-radius:9px;padding:9px"><div style="font-size:10px;text-transform:uppercase;color:var(--sub)">Рекомендация продаж</div><div style="font-size:19px;font-weight:800;margin-top:3px">'+money(r.recommendedShipment)+'</div><div style="font-size:11px;color:var(--sub)">'+(r.recommendedGrowth==null?'без годовой базы':pct(r.recommendedGrowth)+' к прошлому году')+'</div></div>'
        +'<div style="background:#fff;border:1px solid var(--border);border-radius:9px;padding:9px"><div style="font-size:10px;text-transform:uppercase;color:var(--sub)">Рекомендация АКБ</div><div style="font-size:19px;font-weight:800;margin-top:3px">'+r.recommendedAkb+' клиентов</div><div style="font-size:11px;color:var(--sub)">прошлый год '+r.sameLyAkb+' · среднее 3 мес. '+r.avgAkb3.toFixed(1)+'</div></div>'
      +'</div>'+stateLine
      +'<div style="margin-top:9px;line-height:1.6"><b>На чём основано:</b><br>'
        +'• среднее продаж последних 3 мес.: '+money(r.avg3)+'<br>'
        +'• среднее последних 6 мес.: '+money(r.avg6)+'<br>'
        +'• тренд последних месяцев год к году: '+pct(r.recentYoyTrend)+'<br>'
        +'• тренд за 12 закрытых месяцев: '+pct(r.annualTrend)+' ('+money(r.yearCurrent)+' против '+money(r.yearPrevious)+')<br>'
        +'• резерв восстановления просевших клиентов: '+money(r.recoverableReserve)+' ('+r.lostClientCount+' полностью выпавших)<br>'
        +'• резерв АКБ: '+r.returnable+' клиентов можно возвращать, '+r.potentialAssigned+' потенциальных без продаж<br>'
        +'• надёжность расчёта: <b>'+escLocal(r.confidence)+'</b> ('+r.monthsWithData+'/6 последних месяцев есть в истории)'
      +'</div>'
      +(existing?'<div style="margin-top:8px;color:var(--g)"><b>Сейчас сохранённый план:</b> '+money(existing.shipment_plan)+' · АКБ '+n(existing.akb_plan)+'. Он не изменится, пока вы явно не нажмёте кнопку ниже и затем не утвердите.</div>':'')
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button type="button" class="btn-primary" style="padding:8px 12px" onclick="crmApplyManagerAiPlanV2310()">↳ Подставить рекомендацию</button>'
      +(r.target30>0&&!r.targetConfirmed?'<button type="button" class="btn-secondary" style="padding:8px 12px" onclick="crmApplyManagerGrowth30V2310()">Поставить всё равно +30%</button>':'')
      +'</div><div style="font-size:10px;color:var(--sub);margin-top:6px">Подстановка ещё ничего не сохраняет. План фиксируется только кнопкой «Утвердить и зафиксировать».</div>';
  }catch(e){
    console.error(VERSION,e);lastRecommendation=null;
    if(out)out.innerHTML='<span style="color:var(--r);font-weight:700">Не удалось рассчитать план:</span> '+escLocal(e?.message||e)+'. Ничего в плане не изменено.';
  }
}
function applyRecommendation(useTarget30=false){
  const r=lastRecommendation;if(!r)return;
  const ship=document.getElementById('manager-plan-shipment'),akb=document.getElementById('manager-plan-akb');
  if(ship)ship.value=String(Math.round(useTarget30&&r.target30>0?r.target30:r.recommendedShipment));
  if(akb)akb.value=String(r.recommendedAkb);
  const out=document.getElementById('manager-ai-plan-result-v2310');
  if(out)out.insertAdjacentHTML('beforeend','<div style="margin-top:8px;color:var(--a);font-weight:700">✓ Значения подставлены в форму. Проверьте их и нажмите «Утвердить и зафиксировать».</div>');
}

window.crmCalculateManagerAiPlanV2310=calculate;
window.crmApplyManagerAiPlanV2310=()=>applyRecommendation(false);
window.crmApplyManagerGrowth30V2310=()=>applyRecommendation(true);

const baseOpen=window.openManagerPlanEditor;
if(typeof baseOpen==='function'){
  window.openManagerPlanEditor=function(){
    const out=baseOpen.apply(this,arguments);
    injectPanel();resetPanelMessage();
    const sel=document.getElementById('manager-plan-name');if(sel)sel.onchange=window.loadManagerPlanEditor;
    return out;
  };
  try{openManagerPlanEditor=window.openManagerPlanEditor;}catch(_){}
}
const baseLoad=window.loadManagerPlanEditor;
if(typeof baseLoad==='function'){
  window.loadManagerPlanEditor=function(){const out=baseLoad.apply(this,arguments);resetPanelMessage();return out;};
  try{loadManagerPlanEditor=window.loadManagerPlanEditor;}catch(_){}
}

window.RESANTA_AI_MANAGER_PLANS_V2310=Object.freeze({
  version:VERSION,
  fieldManagersOnly:true,
  targetGrowthPct:30,
  historySource:'purchase_history',
  managerKpiTableReused:true,
  managerKpiSaveReused:true,
  recommendationNeverAutoWrites:true,
  bossApprovalRequired:true,
  savedPlanNeverAutoChanges:true,
  akbRecommendation:true,
  newClientsPlanUntouched:true,
  triovistUntouched:true,
  sqlChanges:false
});
})();
