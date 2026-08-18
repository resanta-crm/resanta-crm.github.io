/* RESANTA CRM v23.1.6 · AI MANAGER PLANS · KPI SALES TRUTH
 * FIELD MANAGERS ONLY.
 * Sales history uses the SAME ownership truth as existing Managers · KPI:
 *   1) purchase_history.manager_name when present;
 *   2) for legacy rows without manager_name, manager of matched CRM client;
 *   3) rows with neither source are excluded from every manager.
 * Current AKB potential uses currently assigned CRM clients.
 * No automatic DB writes. Boss explicitly applies and saves a plan.
 */
(function(){
'use strict';
if(window.RESANTA_AI_MANAGER_PLANS_V2316)return;

const VERSION='v23.1.6-ai-manager-plans-kpi-sales-truth';
const BUSINESS_GROWTH_TARGET=0.30;
let lastRecommendation=null;

const num=v=>Number(v)||0;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const avg=a=>a.length?a.reduce((s,x)=>s+num(x),0)/a.length:0;
const money=v=>Math.round(num(v)).toLocaleString('ru-RU')+' BYN';
const pct=v=>(v>=0?'+':'')+(num(v)*100).toFixed(1)+'%';
const roundPlan=v=>Math.max(0,Math.round(num(v)/1000)*1000);
const norm=v=>String(v||'').trim().toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,' ').replace(/\s+/g,' ').trim();
const escLocal=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

function ym(v){return String(v||'').slice(0,7);}
function shiftMonth(month,delta){
  if(!/^\d{4}-\d{2}$/.test(String(month||'')))return '';
  const d=new Date(Number(month.slice(0,4)),Number(month.slice(5,7))-1+delta,1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function sameManager(a,b){
  const x=String(a||'').trim(),y=String(b||'').trim();
  if(!x||!y)return false;
  try{return typeof managerLooseMatch==='function'?managerLooseMatch(x,y):norm(x)===norm(y);}catch(_){return norm(x)===norm(y);}
}
function clientKey(v){
  try{if(typeof canonicalSalesClientName==='function')return canonicalSalesClientName(v)||norm(v);}catch(_){}
  try{if(typeof normalizeClientName==='function')return normalizeClientName(v)||norm(v);}catch(_){}
  return norm(v);
}
function matchedClient(r){
  try{return typeof matchPHClient==='function'?matchPHClient(r?.client_name||''):null;}catch(_){return null;}
}
function rowManagerSource(r){
  const direct=String(r?.manager_name||'').trim();
  if(direct)return {name:direct,kind:'1c'};
  const c=matchedClient(r),fallback=String(c?.manager_name||'').trim();
  if(fallback)return {name:fallback,kind:'client'};
  return {name:'',kind:'none'};
}
function rowBelongsToManager(r,manager){
  const src=rowManagerSource(r);
  return !!src.name&&sameManager(src.name,manager);
}
function managerSalesRows(manager){
  return (allPurchaseHistory||[]).filter(r=>rowBelongsToManager(r,manager));
}
function sourceStats(rows,month){
  const srcRows=month?rows.filter(r=>ym(r.month)===month):rows;
  let direct=0,fallback=0;
  srcRows.forEach(r=>{const s=rowManagerSource(r);if(s.kind==='1c')direct++;else if(s.kind==='client')fallback++;});
  return {rows:srcRows.length,direct,fallback};
}
function assignedClients(manager){
  return (allClients||[]).filter(c=>{
    if(c?.is_archived)return false;
    const mgr=String(c?.manager_name||'').trim();
    if(!mgr||!sameManager(mgr,manager))return false;
    const text=String(c?.name||'')+' '+String(c?.region||'');
    return !/(триовист|21vek)/i.test(text);
  });
}
function clientVariants(c){
  const out=new Set();
  if(!c)return out;
  [c.name,c.code_1c,c.client_code].filter(Boolean).forEach(v=>out.add(clientKey(v)));
  try{(clientNameVariants(c)||[]).forEach(v=>out.add(clientKey(v)));}catch(_){}
  try{(allClientAliases||[]).filter(a=>String(a.client_id||'')===String(c.id||'')).forEach(a=>[a.alias,a.alias_name,a.name].filter(Boolean).forEach(v=>out.add(clientKey(v))));}catch(_){}
  return out;
}
function currentOwnership(manager){
  const clients=assignedClients(manager),ids=new Set(),names=new Set();
  clients.forEach(c=>{if(c.id)ids.add(String(c.id));clientVariants(c).forEach(v=>v&&names.add(v));});
  return {clients,ids,names};
}
function rowOwnedByCurrentBase(r,o){
  if(r?.client_id&&o.ids.has(String(r.client_id)))return true;
  const k=clientKey(r?.client_name);return !!(k&&o.names.has(k));
}
function currentBaseRows(manager){
  const ownership=currentOwnership(manager);
  return {ownership,rows:(allPurchaseHistory||[]).filter(r=>rowOwnedByCurrentBase(r,ownership))};
}
function revenueByMonth(rows){
  const out=new Map();
  rows.forEach(r=>{const m=ym(r.month);if(/^\d{4}-\d{2}$/.test(m))out.set(m,(out.get(m)||0)+num(r.revenue));});
  return out;
}
function clientNetMap(rows,months){
  const wanted=new Set(Array.isArray(months)?months:[months]),out=new Map();
  rows.forEach(r=>{
    if(!wanted.has(ym(r.month)))return;
    const k=clientKey(r.client_name);if(!k)return;
    out.set(k,(out.get(k)||0)+num(r.revenue));
  });
  return out;
}
function activeClientsForMonth(rows,month){return new Set([...clientNetMap(rows,month)].filter(([,v])=>v>0.000001).map(([k])=>k));}
function activeClientsForMonths(rows,months){return new Set([...clientNetMap(rows,months)].filter(([,v])=>v>0.000001).map(([k])=>k));}
function clientAvgForMonths(rows,months){const out=clientNetMap(rows,months),den=Math.max(1,months.length);for(const [k,v] of out)out.set(k,v/den);return out;}

function calcRecommendation(manager,targetMonth){
  const salesRows=managerSalesRows(manager);
  if(!salesRows.length)throw new Error('CRM не нашла историю продаж этого менеджера тем же способом, которым считает KPI.');

  const currentPack=currentBaseRows(manager),ownership=currentPack.ownership,currentRows=currentPack.rows;
  if(!ownership.clients.length)throw new Error('У менеджера нет закреплённых клиентов в CRM.');

  const revMap=revenueByMonth(salesRows);
  const lastYearMonth=shiftMonth(targetMonth,-12);
  const lastYear=num(revMap.get(lastYearMonth));
  const lyRows=salesRows.filter(r=>ym(r.month)===lastYearMonth);
  const lyStats=sourceStats(salesRows,lastYearMonth);
  if(!lyRows.length||lastYear<=0){
    const e=new Error('За '+lastYearMonth+' нет положительной базы продаж менеджера в том же источнике, который использует KPI CRM.');
    e.code='NO_KPI_YEAR_BASE';e.manager=manager;e.month=lastYearMonth;e.stats=lyStats;e.totalStats=sourceStats(salesRows);e.currentClients=ownership.clients.length;
    throw e;
  }

  const currentMonth=String(typeof TODAY!=='undefined'?TODAY:new Date().toISOString()).slice(0,7);
  const lastClosed=shiftMonth(currentMonth,-1);
  const closedBeforeTarget=[...Array(18)].map((_,i)=>shiftMonth(targetMonth,-1-i)).filter(m=>m&&m<=lastClosed);
  const prev3=closedBeforeTarget.slice(0,3),prev6=closedBeforeTarget.slice(0,6),prev12=closedBeforeTarget.slice(0,12);
  const avg3=avg(prev3.map(m=>num(revMap.get(m)))),avg6=avg(prev6.map(m=>num(revMap.get(m))));

  const yoyPairs=prev6.map(m=>({m,cur:num(revMap.get(m)),prev:num(revMap.get(shiftMonth(m,-12)))})).filter(x=>x.cur>0&&x.prev>0);
  const recentYoyValues=yoyPairs.slice(0,3).map(x=>x.cur/x.prev-1);
  const recentYoy=recentYoyValues.length?clamp(avg(recentYoyValues),-0.45,0.80):0;
  const yearCurrent=prev12.reduce((s,m)=>s+num(revMap.get(m)),0);
  const yearPrevious=prev12.reduce((s,m)=>s+num(revMap.get(shiftMonth(m,-12))),0);
  const annualTrend=yearPrevious>0?clamp(yearCurrent/yearPrevious-1,-0.45,0.80):recentYoy;
  const blendedTrend=clamp(recentYoy*0.65+annualTrend*0.35,-0.45,0.80);

  const lyPrev3=[-13,-14,-15].map(d=>shiftMonth(targetMonth,d));
  const lyPrevAvg=avg(lyPrev3.map(m=>num(revMap.get(m))));
  const seasonal=lastYear>0&&lyPrevAvg>0?clamp(lastYear/lyPrevAvg,0.70,1.45):1;
  const historyExpected=lastYear*(1+blendedTrend);
  const recentExpected=avg3>0?avg3*seasonal:historyExpected;
  let supported=historyExpected*0.60+recentExpected*0.40;

  // Recoverable reserve is CURRENT-base only; it never changes historical manager sales.
  const recentClient=clientAvgForMonths(currentRows,prev3);
  const active12Months=[...Array(12)].map((_,i)=>shiftMonth(targetMonth,-1-i));
  const active12=activeClientsForMonths(currentRows,active12Months),activeRecent=activeClientsForMonths(currentRows,prev3);
  let returnable=0;active12.forEach(k=>{if(!activeRecent.has(k))returnable++;});
  const potentialAssigned=ownership.clients.filter(c=>String(c.client_status||'').toLowerCase()==='потенциальный'&&!active12.has(clientKey(c.name))).length;
  let recoverableReserve=0,lostClientCount=0;
  const recent6Client=clientNetMap(currentRows,prev6);
  for(const [k,sixTotal] of recent6Client){
    const sixAvg=sixTotal/Math.max(1,prev6.length),cur=num(recentClient.get(k));
    if(sixAvg>0&&cur<sixAvg){recoverableReserve+=(sixAvg-Math.max(0,cur))*0.18;if(cur<=0)lostClientCount++;}
  }
  recoverableReserve=Math.min(recoverableReserve,Math.max(lastYear,avg3,1)*0.08);
  supported+=recoverableReserve;

  const target30=lastYear*(1+BUSINESS_GROWTH_TARGET);
  const targetConfirmed=supported>=target30;
  const recommendedShipment=roundPlan(targetConfirmed?Math.max(target30,supported):supported);
  const recommendedGrowth=recommendedShipment/lastYear-1;
  const gap30=Math.max(0,target30-supported);

  // Historical AKB uses the SAME KPI-compatible manager rows as sales.
  const sameLyAkb=activeClientsForMonth(salesRows,lastYearMonth).size;
  const akb3=prev3.map(m=>activeClientsForMonth(salesRows,m).size);
  const avgAkb3=avg(akb3),maxAkb3=Math.max(0,...akb3);
  const akbBase=Math.max(sameLyAkb,avgAkb3,maxAkb3);
  const akbGrowth=clamp(0.05+Math.max(0,recommendedGrowth)*0.20,0.05,0.12);
  let recommendedAkb=Math.ceil(akbBase*(1+akbGrowth));
  const feasibleExtra=Math.ceil(returnable*0.35+potentialAssigned*0.15);
  const feasibleCeiling=Math.max(maxAkb3,Math.ceil(maxAkb3+feasibleExtra));
  recommendedAkb=Math.min(recommendedAkb,feasibleCeiling||recommendedAkb,ownership.clients.length);
  recommendedAkb=Math.max(maxAkb3,recommendedAkb);

  const monthsWithData=prev6.filter(m=>num(revMap.get(m))>0).length;
  const confidence=monthsWithData>=5&&lastYear>0?'высокая':monthsWithData>=3?'средняя':'низкая';
  return {
    manager,targetMonth,lastYearMonth,lastYear,target30,targetConfirmed,gap30,recommendedShipment,recommendedGrowth,
    avg3,avg6,recentYoy,annualTrend,yearCurrent,yearPrevious,historyExpected,recentExpected,recoverableReserve,lostClientCount,
    sameLyAkb,avgAkb3,maxAkb3,returnable,potentialAssigned,recommendedAkb,akbGrowth,confidence,monthsWithData,
    salesRowsCount:salesRows.length,currentClients:ownership.clients.length,currentRowsCount:currentRows.length,
    totalSourceStats:sourceStats(salesRows),lastYearSourceStats:lyStats
  };
}

function currentExistingPlan(){
  const manager=document.getElementById('manager-plan-name')?.value||'',month=ym(document.getElementById('manager-plan-month')?.value||'');
  return (allManagerKpiPlans||[]).find(p=>sameManager(p.manager_name,manager)&&ym(p.period_month)===month)||null;
}
function injectPanel(){
  if(currentProfile?.role!=='boss')return null;
  const modal=document.querySelector('#modal-manager-plan .modal');if(!modal)return null;
  ['2310','2311','2312','2313','2314','2315'].forEach(v=>document.getElementById('manager-ai-plan-v'+v)?.remove());
  let root=document.getElementById('manager-ai-plan-v2316');
  if(!root){
    root=document.createElement('div');root.id='manager-ai-plan-v2316';
    const note=document.getElementById('manager-plan-note')?.closest('.form-field');
    (note||modal.querySelector('.modal-head'))?.insertAdjacentElement(note?'beforebegin':'afterend',root);
  }
  root.innerHTML='<div style="border:1px solid #BFDBFE;background:#F8FBFF;border-radius:12px;padding:12px 13px;margin-bottom:14px">'
    +'<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><div style="font-size:13px;font-weight:800;color:var(--at)">🤖 ИИ-план · черновик руководителя <span style="font-size:10px;color:var(--sub)">v23.1.6</span></div>'
    +'<div style="font-size:11px;color:var(--sub);line-height:1.5;margin-top:3px">Продажи считаются тем же способом, что и существующий KPI CRM. Старые строки без менеджера берут владельца только из сопоставленной карточки клиента; полностью неопределённые строки исключаются.</div></div>'
    +'<button type="button" class="btn-secondary" style="padding:7px 10px" onclick="crmCalculateManagerAiPlanV2316()">Рассчитать</button></div>'
    +'<div id="manager-ai-plan-result-v2316" style="margin-top:10px;font-size:12px;color:var(--sub)">Нажмите «Рассчитать». План автоматически не сохраняется.</div></div>';
  const save=[...modal.querySelectorAll('button')].find(b=>String(b.getAttribute('onclick')||'').includes('saveManagerKpiPlan'));
  if(save)save.textContent='✅ Утвердить и зафиксировать';
  return root;
}
function resetPanel(){
  const root=injectPanel();if(!root)return;
  lastRecommendation=null;
  const out=document.getElementById('manager-ai-plan-result-v2316');if(!out)return;
  const p=currentExistingPlan();
  out.innerHTML=p?'<b style="color:var(--g)">✅ План на этот месяц уже сохранён.</b> Пересчёт его не изменит.':'Нажмите «Рассчитать» — CRM перечитает свежую историю 1С и применит тот же источник, что в KPI.';
}
function renderNoYearBase(out,e){
  const s=e.stats||{},t=e.totalStats||{};
  out.innerHTML='<div style="padding:10px 12px;border:1px solid #FCA5A5;background:#FEF2F2;border-radius:10px;color:#991B1B">'
    +'<b>⛔ Расчёт остановлен: KPI-источник не даёт положительной базы '+escLocal(e.manager||'')+' за '+escLocal(e.month||'')+'.</b>'
    +'<div style="font-size:12px;line-height:1.6;margin-top:7px">За этот месяц найдено '+num(s.rows)+' строк: напрямую по manager_name 1С — '+num(s.direct)+', через сопоставленную карточку старой строки — '+num(s.fallback)+'.</div>'
    +'<div style="font-size:12px;line-height:1.6;margin-top:5px">Всего история менеджера: '+num(t.rows)+' строк (1С '+num(t.direct)+' · fallback '+num(t.fallback)+'). Текущая закреплённая база: '+num(e.currentClients)+' клиентов.</div>'
    +'<div style="font-size:12px;margin-top:7px"><b>Рекомендация намеренно не строится.</b> Сначала нужна валидная годовая база.</div></div>';
}
async function calculate(){
  if(currentProfile?.role!=='boss')return;
  injectPanel();
  const out=document.getElementById('manager-ai-plan-result-v2316');
  const manager=document.getElementById('manager-plan-name')?.value||'',month=ym(document.getElementById('manager-plan-month')?.value||'');
  if(!manager||!month){if(out)out.textContent='Выберите менеджера и месяц.';return;}
  if(out)out.innerHTML='<b style="color:var(--a)">⏳ Перечитываю свежую историю 1С и считаю тем же способом, что KPI…</b>';
  try{
    if(typeof window.v22722EnsureHistory!=='function')throw new Error('загрузчик истории продаж недоступен');
    await window.v22722EnsureHistory({force:true,reason:'manager-ai-plan-v2316'});
    const r=calcRecommendation(manager,month);lastRecommendation=r;
    const existing=currentExistingPlan();
    const verdict=r.targetConfirmed
      ?'<div style="margin-top:8px;padding:8px 10px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;color:#166534"><b>✅ +30% подтверждается текущими данными.</b></div>'
      :'<div style="margin-top:8px;padding:8px 10px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;color:#92400E"><b>⚠️ +30% сейчас не подтверждается.</b> До бизнес-цели не обеспечено <b>'+money(r.gap30)+'</b>.</div>';
    out.innerHTML='<div><b>Аналогичный месяц прошлого года:</b> '+money(r.lastYear)+' → <b>бизнес-цель +30%:</b> '+money(r.target30)+'</div>'
      +'<div style="font-size:11px;color:var(--sub);margin-top:5px"><b>Источник как в KPI:</b> всего '+r.salesRowsCount+' строк менеджера. За '+escLocal(r.lastYearMonth)+': '+r.lastYearSourceStats.rows+' строк (manager_name 1С '+r.lastYearSourceStats.direct+' · старые строки через карточку клиента '+r.lastYearSourceStats.fallback+').</div>'
      +'<div style="font-size:11px;color:var(--sub);margin-top:3px">Текущая база для АКБ/потенциала: '+r.currentClients+' закреплённых клиентов · '+r.currentRowsCount+' строк их истории.</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">'
        +'<div style="background:#fff;border:1px solid var(--border);border-radius:9px;padding:9px"><div style="font-size:10px;color:var(--sub);text-transform:uppercase">Рекомендация продаж</div><div style="font-size:19px;font-weight:800;margin-top:3px">'+money(r.recommendedShipment)+'</div><div style="font-size:11px;color:var(--sub)">'+pct(r.recommendedGrowth)+' к прошлому году</div></div>'
        +'<div style="background:#fff;border:1px solid var(--border);border-radius:9px;padding:9px"><div style="font-size:10px;color:var(--sub);text-transform:uppercase">Рекомендация АКБ</div><div style="font-size:19px;font-weight:800;margin-top:3px">'+r.recommendedAkb+' клиентов</div><div style="font-size:11px;color:var(--sub)">прошлый год '+r.sameLyAkb+' · среднее 3 мес. '+r.avgAkb3.toFixed(1)+'</div></div>'
      +'</div>'+verdict
      +'<div style="margin-top:10px;line-height:1.6"><b>Как получена цифра продаж:</b><br>'
        +'• среднее KPI-продаж последних 3 закрытых месяцев: '+money(r.avg3)+'<br>'
        +'• среднее последних 6 месяцев: '+money(r.avg6)+'<br>'
        +'• тренд последних сопоставимых месяцев год к году: '+pct(r.recentYoy)+'<br>'
        +'• тренд 12 закрытых месяцев: '+pct(r.annualTrend)+'<br>'
        +'• расчёт по годовому тренду: '+money(r.historyExpected)+'<br>'
        +'• расчёт по текущему темпу с сезонностью: '+money(r.recentExpected)+'<br>'
        +'• осторожный резерв текущей закреплённой базы: '+money(r.recoverableReserve)+' ('+r.lostClientCount+' просевших до нуля)<br>'
        +'• АКБ: вернуть можно '+r.returnable+' · потенциальных закреплено '+r.potentialAssigned+' · рекомендуемый рост '+pct(r.akbGrowth)+'<br>'
        +'• надёжность: <b>'+r.confidence+'</b> ('+r.monthsWithData+'/6 последних месяцев имеют положительные продажи)'
      +'</div>'
      +(existing?'<div style="margin-top:8px;color:var(--g)"><b>Сохранённый план:</b> '+money(existing.shipment_plan)+' · АКБ '+num(existing.akb_plan)+'. Он не меняется автоматически.</div>':'')
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button type="button" class="btn-primary" onclick="crmApplyManagerAiPlanV2316()">↳ Подставить рекомендацию</button>'
      +(!r.targetConfirmed?'<button type="button" class="btn-secondary" onclick="crmApplyManagerGrowth30V2316()">Поставить всё равно +30%</button>':'')+'</div>'
      +'<div style="font-size:10px;color:var(--sub);margin-top:6px">Подстановка ничего не сохраняет. План фиксируется только после явного подтверждения руководителя.</div>';
  }catch(e){
    lastRecommendation=null;console.error(VERSION,e);if(!out)return;
    if(e?.code==='NO_KPI_YEAR_BASE'){renderNoYearBase(out,e);return;}
    out.innerHTML='<b style="color:var(--r)">Расчёт остановлен:</b> '+escLocal(e?.message||e)+'. План не изменён.';
  }
}
function apply(use30){
  const r=lastRecommendation;if(!r)return;
  const ship=document.getElementById('manager-plan-shipment'),akb=document.getElementById('manager-plan-akb');
  if(ship)ship.value=String(Math.round(use30?r.target30:r.recommendedShipment));
  if(akb)akb.value=String(r.recommendedAkb);
  const out=document.getElementById('manager-ai-plan-result-v2316');if(out)out.insertAdjacentHTML('beforeend','<div style="margin-top:8px;color:var(--a);font-weight:700">✓ Значения только подставлены. Проверьте перед сохранением.</div>');
}
window.crmCalculateManagerAiPlanV2316=calculate;
window.crmApplyManagerAiPlanV2316=()=>apply(false);
window.crmApplyManagerGrowth30V2316=()=>apply(true);

function hookModal(){
  const modal=document.getElementById('modal-manager-plan');if(!modal)return;
  if(modal.dataset.aiPlansHook2316==='1')return;
  modal.dataset.aiPlansHook2316='1';
  let wasOpen=modal.classList.contains('open');
  const sync=()=>{const open=modal.classList.contains('open');if(open&&!wasOpen)setTimeout(resetPanel,0);wasOpen=open;};
  new MutationObserver(sync).observe(modal,{attributes:true,attributeFilter:['class']});
  modal.addEventListener('change',e=>{if(e.target?.id==='manager-plan-name'||e.target?.id==='manager-plan-month')setTimeout(resetPanel,0);});
  if(wasOpen)setTimeout(resetPanel,0);
}
function bootHook(){hookModal();if(!document.getElementById('modal-manager-plan'))setTimeout(bootHook,500);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootHook,{once:true});else bootHook();

window.RESANTA_AI_MANAGER_PLANS_V2316=Object.freeze({
  version:VERSION,
  salesTruth:'same-as-existing-manager-kpi-with-empty-source-guard',
  directOneCManagerPreferred:true,
  legacyRowsFallbackToMatchedClientManager:true,
  unassignedBlankRowsExcluded:true,
  currentBaseUsedForPotential:true,
  bossApprovalRequired:true,
  savedPlanNeverAutoChanges:true,
  targetGrowthPct:30,
  sqlChanges:false
});
})();
