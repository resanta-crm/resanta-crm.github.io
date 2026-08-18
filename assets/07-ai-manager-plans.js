/* RESANTA CRM v23.2.0 · AI MANAGER PLANS · CURRENT-YEAR FIRST
 * FIELD MANAGERS ONLY.
 * Sales fact uses the same month ownership logic as existing Managers · KPI.
 * Main planning base = CURRENT YEAR dynamics (YTD + recent 3 months + trend).
 * Same month last year is a reference only. If it is positive/valid it defines
 * the +30% YoY business target; if it is non-positive/missing, +30% is applied
 * to the current-year operating baseline instead.
 * AKB / recoverable potential = currently assigned CRM client base.
 * No automatic DB writes. Boss explicitly applies and saves a plan.
 */
(function(){
'use strict';
if(window.RESANTA_AI_MANAGER_PLANS_V2320)return;

const VERSION='v23.2.0-current-year-first';
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
const MONTHS=['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];

function ym(v){return String(v||'').slice(0,7);}
function shiftMonth(month,delta){
  if(!/^\d{4}-\d{2}$/.test(String(month||'')))return '';
  const d=new Date(Number(month.slice(0,4)),Number(month.slice(5,7))-1+delta,1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function monthLabelShort(m){const mm=Number(String(m||'').slice(5,7));return MONTHS[mm-1]||m;}
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
function matchedClientByRow(r){
  try{return typeof matchPHClient==='function'?matchPHClient(r?.client_name||''):null;}catch(_){return null;}
}
function inferredManager(r){
  const direct=String(r?.manager_name||'').trim();
  if(direct)return {name:direct,kind:'1c'};
  const c=matchedClientByRow(r),fallback=String(c?.manager_name||'').trim();
  if(fallback)return {name:fallback,kind:'client'};
  return {name:'',kind:'none'};
}
function fallbackKpiRowsForMonth(manager,month){
  return (allPurchaseHistory||[]).filter(r=>{
    if(ym(r.month)!==month)return false;
    const src=inferredManager(r);
    return !!src.name&&sameManager(src.name,manager);
  });
}
function kpiRowsForMonth(manager,month){
  try{
    if(typeof v18RowsForManagerMonth==='function'){
      // Existing KPI function may treat a fully empty source too loosely in legacy data.
      // Keep only rows that have either direct manager or a matched client manager.
      return (v18RowsForManagerMonth(manager,month)||[]).filter(r=>!!inferredManager(r).name);
    }
  }catch(_){}
  return fallbackKpiRowsForMonth(manager,month);
}
function monthRevenue(manager,month){return kpiRowsForMonth(manager,month).reduce((s,r)=>s+num(r.revenue),0);}
function monthHasRows(manager,month){return kpiRowsForMonth(manager,month).length>0;}
function sourceStats(rows){
  let direct=0,fallback=0,unknown=0;
  rows.forEach(r=>{const s=inferredManager(r);if(s.kind==='1c')direct++;else if(s.kind==='client')fallback++;else unknown++;});
  return {rows:rows.length,direct,fallback,unknown};
}
function yearMonthsBefore(targetMonth,lastClosed){
  const y=String(targetMonth).slice(0,4),out=[];
  for(let i=1;i<=12;i++){
    const m=y+'-'+String(i).padStart(2,'0');
    if(m>=targetMonth||m>lastClosed)break;
    out.push(m);
  }
  return out;
}
function weightedRecent(values){
  const a=values.slice(-3);
  if(!a.length)return 0;
  if(a.length===1)return a[0];
  if(a.length===2)return a[1]*0.65+a[0]*0.35;
  return a[2]*0.50+a[1]*0.30+a[0]*0.20;
}
function linearSlope(values){
  if(values.length<2)return 0;
  const n=values.length,meanX=(n-1)/2,meanY=avg(values);
  let top=0,bot=0;
  values.forEach((y,i)=>{top+=(i-meanX)*(y-meanY);bot+=(i-meanX)*(i-meanX);});
  return bot?top/bot:0;
}
function currentYearSales(manager,targetMonth){
  const currentMonth=String(typeof TODAY!=='undefined'?TODAY:new Date().toISOString()).slice(0,7);
  const lastClosed=shiftMonth(currentMonth,-1);
  const months=yearMonthsBefore(targetMonth,lastClosed);
  const rowsByMonth=months.map(m=>({month:m,rows:kpiRowsForMonth(manager,m)}));
  const usable=rowsByMonth.filter(x=>x.rows.length>0);
  const values=usable.map(x=>x.rows.reduce((s,r)=>s+num(r.revenue),0));
  const usableMonths=usable.map(x=>x.month);
  return {months,usable,values,usableMonths,lastClosed};
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
  const out=new Set();if(!c)return out;
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
function clientNetMap(rows,months){
  const wanted=new Set(Array.isArray(months)?months:[months]),out=new Map();
  rows.forEach(r=>{if(!wanted.has(ym(r.month)))return;const k=clientKey(r.client_name);if(k)out.set(k,(out.get(k)||0)+num(r.revenue));});
  return out;
}
function activeClients(rows,months){return new Set([...clientNetMap(rows,months)].filter(([,v])=>v>0.000001).map(([k])=>k));}

function calcRecommendation(manager,targetMonth){
  const cy=currentYearSales(manager,targetMonth);
  if(cy.usable.length<2)throw new Error('Недостаточно закрытых месяцев текущего года для нормального плана. Нужны минимум 2 месяца фактических продаж.');

  const values=cy.values;
  const ytdTotal=values.reduce((s,v)=>s+v,0);
  const ytdAvg=avg(values);
  const recentValues=values.slice(-3);
  const avg3=avg(recentValues);
  const recentWeighted=weightedRecent(values);
  const slope=linearSlope(values);
  const slopePct=ytdAvg?clamp(slope/ytdAvg,-0.35,0.35):0;
  let trendForecast=recentWeighted+slope*0.70;
  const lower=Math.max(0,Math.min(ytdAvg,recentWeighted)*0.70);
  const upper=Math.max(ytdAvg,recentWeighted,1)*1.40;
  trendForecast=clamp(trendForecast,lower,upper);

  // Last year is NOT the main engine. It may only softly adjust seasonality
  // and/or define a true YoY +30% business target when the base is positive.
  const lastYearMonth=shiftMonth(targetMonth,-12);
  const lastYear=monthRevenue(manager,lastYearMonth);
  const lastYearRows=monthHasRows(manager,lastYearMonth);
  const lyPrev=[shiftMonth(lastYearMonth,-1),shiftMonth(lastYearMonth,-2),shiftMonth(lastYearMonth,-3)];
  const lyPrevVals=lyPrev.filter(m=>monthHasRows(manager,m)).map(m=>monthRevenue(manager,m));
  const lyPrevAvg=avg(lyPrevVals);
  const seasonalRaw=lastYear>0&&lyPrevAvg>0?lastYear/lyPrevAvg:1;
  const seasonal=clamp(seasonalRaw,0.80,1.25);

  // Current-year first supported potential.
  let supported=(trendForecast*0.70+ytdAvg*0.30);
  if(lastYear>0&&lyPrevAvg>0)supported*=1+(seasonal-1)*0.15;

  const currentPack=currentBaseRows(manager),ownership=currentPack.ownership,currentRows=currentPack.rows;
  if(!ownership.clients.length)throw new Error('У менеджера нет закреплённых клиентов в CRM.');
  const recentMonths=cy.usableMonths.slice(-3);
  const last6Months=cy.usableMonths.slice(-6);
  const recentNet=clientNetMap(currentRows,recentMonths);
  const sixNet=clientNetMap(currentRows,last6Months);
  let recoverableReserve=0,lostClientCount=0;
  for(const [k,sixTotal] of sixNet){
    const sixAvg=sixTotal/Math.max(1,last6Months.length);
    const curAvg=num(recentNet.get(k))/Math.max(1,recentMonths.length);
    if(sixAvg>0&&curAvg<sixAvg){
      recoverableReserve+=(sixAvg-Math.max(0,curAvg))*0.18;
      if(curAvg<=0)lostClientCount++;
    }
  }
  recoverableReserve=Math.min(recoverableReserve,Math.max(ytdAvg,recentWeighted,1)*0.08);
  supported=Math.max(0,supported+recoverableReserve);

  const currentOperatingBase=Math.max(ytdAvg,recentWeighted,avg3);
  const target30Base=lastYear>0?lastYear:currentOperatingBase;
  const target30=target30Base*(1+BUSINESS_GROWTH_TARGET);
  const target30Source=lastYear>0?'last_year':'current_year';
  const targetConfirmed=supported>=target30;
  const recommendedShipment=roundPlan(targetConfirmed?Math.max(target30,supported):supported);
  const gap30=Math.max(0,target30-supported);
  const growthVsCurrent=currentOperatingBase>0?recommendedShipment/currentOperatingBase-1:null;
  const growthVsLastYear=lastYear>0?recommendedShipment/lastYear-1:null;

  // AKB = current assigned base, current-year activity, recoverable customers.
  const recentAkb=recentMonths.map(m=>activeClients(currentRows,m).size);
  const avgAkb3=avg(recentAkb),maxAkb3=Math.max(0,...recentAkb);
  const active12Months=[...Array(12)].map((_,i)=>shiftMonth(targetMonth,-1-i));
  const active12=activeClients(currentRows,active12Months),activeRecent=activeClients(currentRows,recentMonths);
  let returnable=0;active12.forEach(k=>{if(!activeRecent.has(k))returnable++;});
  const potentialAssigned=ownership.clients.filter(c=>String(c.client_status||'').toLowerCase()==='потенциальный'&&!active12.has(clientKey(c.name))).length;
  const supportedGrowth=currentOperatingBase>0?Math.max(0,supported/currentOperatingBase-1):0;
  const akbGrowth=clamp(0.05+supportedGrowth*0.18,0.05,0.12);
  let recommendedAkb=Math.ceil(Math.max(avgAkb3,maxAkb3)*(1+akbGrowth));
  const feasibleExtra=Math.ceil(returnable*0.35+potentialAssigned*0.15);
  const feasibleCeiling=Math.max(maxAkb3,Math.ceil(maxAkb3+feasibleExtra));
  recommendedAkb=Math.min(recommendedAkb,feasibleCeiling||recommendedAkb,ownership.clients.length);
  recommendedAkb=Math.max(maxAkb3,recommendedAkb);

  const allManagerRows=(allPurchaseHistory||[]).filter(r=>{
    const src=inferredManager(r);return !!src.name&&sameManager(src.name,manager);
  });
  const stats=sourceStats(allManagerRows);
  const confidence=cy.usable.length>=6?'высокая':cy.usable.length>=4?'средняя':'низкая';

  return {
    manager,targetMonth,lastYearMonth,lastYear,lastYearRows,target30,target30Source,targetConfirmed,gap30,
    recommendedShipment,growthVsCurrent,growthVsLastYear,currentOperatingBase,supported,
    ytdTotal,ytdAvg,avg3,recentWeighted,slope,slopePct,trendForecast,seasonal,recoverableReserve,lostClientCount,
    months:cy.usableMonths,values,confidence,
    currentClients:ownership.clients.length,currentRowsCount:currentRows.length,
    avgAkb3,maxAkb3,returnable,potentialAssigned,recommendedAkb,akbGrowth,stats
  };
}

function currentExistingPlan(){
  const manager=document.getElementById('manager-plan-name')?.value||'',month=ym(document.getElementById('manager-plan-month')?.value||'');
  return (allManagerKpiPlans||[]).find(p=>sameManager(p.manager_name,manager)&&ym(p.period_month)===month)||null;
}
function injectPanel(){
  if(currentProfile?.role!=='boss')return null;
  const modal=document.querySelector('#modal-manager-plan .modal');if(!modal)return null;
  ['2310','2311','2312','2313','2314','2315','2316'].forEach(v=>document.getElementById('manager-ai-plan-v'+v)?.remove());
  let root=document.getElementById('manager-ai-plan-v2320');
  if(!root){
    root=document.createElement('div');root.id='manager-ai-plan-v2320';
    const note=document.getElementById('manager-plan-note')?.closest('.form-field');
    (note||modal.querySelector('.modal-head'))?.insertAdjacentElement(note?'beforebegin':'afterend',root);
  }
  root.innerHTML='<div style="border:1px solid #BFDBFE;background:#F8FBFF;border-radius:12px;padding:12px 13px;margin-bottom:14px">'
    +'<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><div style="font-size:13px;font-weight:800;color:var(--at)">🤖 ИИ-план · черновик руководителя <span style="font-size:10px;color:var(--sub)">v23.2.0</span></div>'
    +'<div style="font-size:11px;color:var(--sub);line-height:1.5;margin-top:3px">Главная база плана — динамика текущего года. Прошлый год используется только как дополнительное сравнение и не тянет план вниз, если база была минусовой/невалидной.</div></div>'
    +'<button type="button" class="btn-secondary" style="padding:7px 10px" onclick="crmCalculateManagerAiPlanV2320()">Рассчитать</button></div>'
    +'<div id="manager-ai-plan-result-v2320" style="margin-top:10px;font-size:12px;color:var(--sub)">Нажмите «Рассчитать». План автоматически не сохраняется.</div></div>';
  const save=[...modal.querySelectorAll('button')].find(b=>String(b.getAttribute('onclick')||'').includes('saveManagerKpiPlan'));
  if(save)save.textContent='✅ Утвердить и зафиксировать';
  return root;
}
function resetPanel(){
  if(!injectPanel())return;
  lastRecommendation=null;
  const out=document.getElementById('manager-ai-plan-result-v2320');if(!out)return;
  const p=currentExistingPlan();
  out.innerHTML=p?'<b style="color:var(--g)">✅ План на этот месяц уже сохранён.</b> ИИ его сам не меняет.':'Нажмите «Рассчитать» — CRM сначала перечитает свежую историю и построит план от текущего года.';
}
function dynamicLine(r){
  return r.months.slice(-6).map((m,i)=>{
    const idx=r.months.indexOf(m),v=r.values[idx];
    return monthLabelShort(m)+' '+Math.round(v/1000)+'K';
  }).join(' → ');
}
async function calculate(){
  if(currentProfile?.role!=='boss')return;
  injectPanel();
  const out=document.getElementById('manager-ai-plan-result-v2320');
  const manager=document.getElementById('manager-plan-name')?.value||'',month=ym(document.getElementById('manager-plan-month')?.value||'');
  if(!manager||!month){if(out)out.textContent='Выберите менеджера и месяц.';return;}
  if(out)out.innerHTML='<b style="color:var(--a)">⏳ Перечитываю свежую историю 1С и анализирую динамику текущего года…</b>';
  try{
    if(typeof window.v22722EnsureHistory!=='function')throw new Error('загрузчик истории продаж недоступен');
    await window.v22722EnsureHistory({force:true,reason:'manager-ai-plan-v2320'});
    const r=calcRecommendation(manager,month);lastRecommendation=r;
    const existing=currentExistingPlan();

    const lyText=r.lastYear>0
      ?'<b>Аналогичный месяц прошлого года:</b> '+money(r.lastYear)+' · цель +30% к нему: <b>'+money(r.target30)+'</b>'
      :'<b>Прошлый год:</b> '+money(r.lastYear)+' — <b>в базу плана не используется</b>. Цель +30% считается от рабочей базы текущего года '+money(r.currentOperatingBase)+' → <b>'+money(r.target30)+'</b>';
    const verdict=r.targetConfirmed
      ?'<div style="margin-top:8px;padding:8px 10px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;color:#166534"><b>✅ Цель +30% подтверждается текущей динамикой.</b></div>'
      :'<div style="margin-top:8px;padding:8px 10px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;color:#92400E"><b>⚠️ Цель +30% сейчас не подтверждается.</b> Реально подтверждённый потенциал ниже на <b>'+money(r.gap30)+'</b>. Решение остаётся за руководителем.</div>';

    out.innerHTML='<div>'+lyText+'</div>'
      +'<div style="font-size:11px;color:var(--sub);margin-top:5px">Источник продаж совпадает с логикой Managers · KPI. Текущая закреплённая база: <b>'+r.currentClients+'</b> клиентов.</div>'
      +'<div style="margin-top:9px;padding:9px 10px;background:#fff;border:1px solid var(--border);border-radius:9px"><b>Динамика текущего года:</b> '+escLocal(dynamicLine(r))+'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">'
        +'<div style="background:#fff;border:1px solid var(--border);border-radius:9px;padding:9px"><div style="font-size:10px;color:var(--sub);text-transform:uppercase">Рекомендация продаж</div><div style="font-size:19px;font-weight:800;margin-top:3px">'+money(r.recommendedShipment)+'</div><div style="font-size:11px;color:var(--sub)">'+(r.growthVsCurrent==null?'':'к текущей рабочей базе '+pct(r.growthVsCurrent))+'</div></div>'
        +'<div style="background:#fff;border:1px solid var(--border);border-radius:9px;padding:9px"><div style="font-size:10px;color:var(--sub);text-transform:uppercase">Рекомендация АКБ</div><div style="font-size:19px;font-weight:800;margin-top:3px">'+r.recommendedAkb+' клиентов</div><div style="font-size:11px;color:var(--sub)">среднее 3 мес. '+r.avgAkb3.toFixed(1)+' · максимум '+r.maxAkb3+'</div></div>'
      +'</div>'+verdict
      +'<div style="margin-top:10px;line-height:1.65"><b>Почему такая цифра:</b><br>'
        +'• оборот текущего года по закрытым месяцам: '+money(r.ytdTotal)+' · среднемесячно '+money(r.ytdAvg)+'<br>'
        +'• последние 3 месяца: среднее '+money(r.avg3)+' · взвешенный темп '+money(r.recentWeighted)+'<br>'
        +'• направление тренда: '+(r.slope>=0?'рост ':'снижение ')+money(Math.abs(r.slope))+' на месяц ('+pct(r.slopePct)+')<br>'
        +'• прогноз по текущей динамике: '+money(r.trendForecast)+'<br>'
        +(r.lastYear>0?'• прошлогодняя сезонность учитывается мягко: коэффициент '+r.seasonal.toFixed(2)+'<br>':'• прошлогодняя отрицательная/нулевая база в расчёт потенциала не включена<br>')
        +'• резерв возврата текущей закреплённой базы: '+money(r.recoverableReserve)+' ('+r.lostClientCount+' просевших до нуля)<br>'
        +'• АКБ: вернуть можно '+r.returnable+' · потенциальных закреплено '+r.potentialAssigned+' · рекомендуемый рост '+pct(r.akbGrowth)+'<br>'
        +'• качество данных: <b>'+r.confidence+'</b> · строк менеджера '+r.stats.rows+' (1С '+r.stats.direct+', восстановлено по карточке '+r.stats.fallback+')'
      +'</div>'
      +(existing?'<div style="margin-top:8px;color:var(--g)"><b>Сохранённый план:</b> '+money(existing.shipment_plan)+' · АКБ '+num(existing.akb_plan)+'. Он не меняется автоматически.</div>':'')
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button type="button" class="btn-primary" onclick="crmApplyManagerAiPlanV2320(false)">↳ Подставить рекомендацию</button>'
      +(!r.targetConfirmed?'<button type="button" class="btn-secondary" onclick="crmApplyManagerAiPlanV2320(true)">Поставить бизнес-цель +30%</button>':'')+'</div>'
      +'<div style="font-size:10px;color:var(--sub);margin-top:6px">Подстановка ничего не сохраняет. План фиксируется только после явного подтверждения руководителя.</div>';
  }catch(e){
    lastRecommendation=null;console.error(VERSION,e);
    if(out)out.innerHTML='<b style="color:var(--r)">Расчёт остановлен:</b> '+escLocal(e?.message||e)+'. План не изменён.';
  }
}
function apply(useBusinessTarget){
  const r=lastRecommendation;if(!r)return;
  const ship=document.getElementById('manager-plan-shipment'),akb=document.getElementById('manager-plan-akb');
  if(ship)ship.value=String(Math.round(useBusinessTarget?r.target30:r.recommendedShipment));
  if(akb)akb.value=String(r.recommendedAkb);
  const out=document.getElementById('manager-ai-plan-result-v2320');
  if(out)out.insertAdjacentHTML('beforeend','<div style="margin-top:8px;color:var(--a);font-weight:700">✓ Значения только подставлены. Проверьте перед сохранением.</div>');
}
window.crmCalculateManagerAiPlanV2320=calculate;
window.crmApplyManagerAiPlanV2320=apply;

function hookModal(){
  const modal=document.getElementById('modal-manager-plan');if(!modal)return;
  if(modal.dataset.aiPlansHook2320==='1')return;
  modal.dataset.aiPlansHook2320='1';
  let wasOpen=modal.classList.contains('open');
  const sync=()=>{const open=modal.classList.contains('open');if(open&&!wasOpen)setTimeout(resetPanel,0);wasOpen=open;};
  new MutationObserver(sync).observe(modal,{attributes:true,attributeFilter:['class']});
  modal.addEventListener('change',e=>{if(e.target?.id==='manager-plan-name'||e.target?.id==='manager-plan-month')setTimeout(resetPanel,0);});
  if(wasOpen)setTimeout(resetPanel,0);
}
function bootHook(){hookModal();if(!document.getElementById('modal-manager-plan'))setTimeout(bootHook,500);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootHook,{once:true});else bootHook();

window.RESANTA_AI_MANAGER_PLANS_V2320=Object.freeze({
  version:VERSION,
  currentYearIsPrimaryPlanBase:true,
  lastYearOnlyReference:true,
  negativeLastYearNeverPullsPlanDown:true,
  kpiSalesTruth:true,
  currentAssignedBaseForAkb:true,
  bossApprovalRequired:true,
  savedPlanNeverAutoChanges:true,
  targetGrowthPct:30,
  sqlChanges:false
});
})();
