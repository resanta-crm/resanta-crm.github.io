/* RESANTA CRM v23.1.4 · AI MANAGER PLANS · FRESH HISTORY + NET REVENUE TRUTH
 * FIELD MANAGERS ONLY.
 * Ownership truth = clients currently assigned to selected field manager.
 * purchase_history.manager_name is NEVER used for ownership.
 * Triovist / 21vek is excluded from field-manager calculations.
 * Every calculation forces a fresh Supabase purchase_history read.
 * Historical comparison is blocked when active clients exist but monthly net revenue <= 0.
 * No automatic DB writes. Boss explicitly applies and saves a plan.
 */
(function(){
'use strict';
if(window.RESANTA_AI_MANAGER_PLANS_V2314)return;

const VERSION='v23.1.4-ai-manager-plans-fresh-net-truth';
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
function strictManager(a,b){
  const x=norm(a),y=norm(b);
  return !!x&&!!y&&x===y;
}
function clientKey(v){
  try{if(typeof canonicalSalesClientName==='function')return canonicalSalesClientName(v)||norm(v);}catch(_){}
  try{if(typeof normalizeClientName==='function')return normalizeClientName(v)||norm(v);}catch(_){}
  return norm(v);
}
function clientVariants(c){
  const out=new Set();
  if(!c)return out;
  [c.name,c.code_1c,c.client_code].filter(Boolean).forEach(v=>out.add(clientKey(v)));
  try{(clientNameVariants(c)||[]).forEach(v=>out.add(clientKey(v)));}catch(_){}
  try{
    (allClientAliases||[]).filter(a=>String(a.client_id||'')===String(c.id||'')).forEach(a=>{
      [a.alias,a.alias_name,a.name].filter(Boolean).forEach(v=>out.add(clientKey(v)));
    });
  }catch(_){}
  return out;
}
function assignedClients(manager){
  return (allClients||[]).filter(c=>{
    if(!strictManager(c.manager_name,manager)||c.is_archived)return false;
    const text=String(c.name||'')+' '+String(c.region||'');
    return !/(триовист|21vek)/i.test(text);
  });
}
function buildOwnership(manager){
  const clients=assignedClients(manager);
  const ids=new Set(clients.map(c=>String(c.id||'')).filter(Boolean));
  const names=new Set();
  clients.forEach(c=>clientVariants(c).forEach(v=>v&&names.add(v)));
  return {clients,ids,names};
}
function rowOwnedBy(r,o){
  if(!r)return false;
  if(r.client_id&&o.ids.has(String(r.client_id)))return true;
  const k=clientKey(r.client_name);
  return !!(k&&o.names.has(k));
}
function managerRows(manager){
  const ownership=buildOwnership(manager);
  if(!ownership.clients.length)return {ownership,rows:[]};
  return {ownership,rows:(allPurchaseHistory||[]).filter(r=>rowOwnedBy(r,ownership))};
}
function revenueByMonth(rows){
  const out=new Map();
  rows.forEach(r=>{const m=ym(r.month);if(/^\d{4}-\d{2}$/.test(m))out.set(m,(out.get(m)||0)+num(r.revenue));});
  return out;
}
function clientNetMap(rows,months){
  const wanted=new Set(Array.isArray(months)?months:[months]);
  const out=new Map();
  rows.forEach(r=>{
    if(!wanted.has(ym(r.month)))return;
    const k=clientKey(r.client_name);if(!k)return;
    out.set(k,(out.get(k)||0)+num(r.revenue));
  });
  return out;
}
function activeClientsForMonth(rows,month){
  return new Set([...clientNetMap(rows,month)].filter(([,v])=>v>0.000001).map(([k])=>k));
}
function activeClientsForMonths(rows,months){
  return new Set([...clientNetMap(rows,months)].filter(([,v])=>v>0.000001).map(([k])=>k));
}
function clientAvgForMonths(rows,months){
  const out=clientNetMap(rows,months),den=Math.max(1,months.length);
  for(const [k,v] of out)out.set(k,v/den);
  return out;
}
function monthDiagnostics(rows,month){
  const mr=rows.filter(r=>ym(r.month)===month);
  let positiveRevenue=0,negativeRevenue=0,positiveRows=0,negativeRows=0,qtyRows=0;
  const clientNet=new Map();
  mr.forEach(r=>{
    const rev=num(r.revenue),qty=num(r.qty),k=clientKey(r.client_name)||String(r.client_name||'—');
    if(rev>0){positiveRevenue+=rev;positiveRows++;}
    else if(rev<0){negativeRevenue+=rev;negativeRows++;}
    if(Math.abs(qty)>0.000001)qtyRows++;
    clientNet.set(k,(clientNet.get(k)||0)+rev);
  });
  const netRevenue=positiveRevenue+negativeRevenue;
  const positiveClients=[...clientNet].filter(([,v])=>v>0.000001).sort((a,b)=>b[1]-a[1]);
  const negativeClients=[...clientNet].filter(([,v])=>v<-0.000001).sort((a,b)=>a[1]-b[1]);
  return {
    month,rows:mr.length,positiveRevenue,negativeRevenue,netRevenue,positiveRows,negativeRows,qtyRows,
    activeClients:positiveClients.length,negativeClientCount:negativeClients.length,
    topNegative:negativeClients.slice(0,6),topPositive:positiveClients.slice(0,3)
  };
}
function brokenHistoricalMonth(d){
  if(!d.rows)return false;
  if(d.positiveRows===0&&d.qtyRows>0)return true;
  return d.netRevenue<=0&&(d.positiveRows>0||d.qtyRows>0||d.activeClients>0);
}

function calcRecommendation(manager,targetMonth){
  const pack=managerRows(manager),ownership=pack.ownership,rows=pack.rows;
  if(!ownership.clients.length)throw new Error('У менеджера нет закреплённых клиентов в CRM.');
  if(!rows.length)throw new Error('По закреплённым клиентам менеджера нет истории продаж 1С.');

  const revMap=revenueByMonth(rows);
  const lastYearMonth=shiftMonth(targetMonth,-12);
  const lastYearDiag=monthDiagnostics(rows,lastYearMonth);
  if(brokenHistoricalMonth(lastYearDiag)){
    const e=new Error('Исторический месяц имеет активность, но не имеет положительной чистой выручки.');
    e.code='BROKEN_HISTORY_NET_REVENUE';
    e.diag=lastYearDiag;e.ownershipCount=ownership.clients.length;e.rowsCount=rows.length;
    throw e;
  }

  const lastYear=num(revMap.get(lastYearMonth));
  const currentMonth=String(typeof TODAY!=='undefined'?TODAY:new Date().toISOString()).slice(0,7);
  const lastClosed=shiftMonth(currentMonth,-1);
  const closedBeforeTarget=[...Array(18)].map((_,i)=>shiftMonth(targetMonth,-1-i)).filter(m=>m&&m<=lastClosed);
  const prev3=closedBeforeTarget.slice(0,3),prev6=closedBeforeTarget.slice(0,6),prev12=closedBeforeTarget.slice(0,12);
  const avg3=avg(prev3.map(m=>num(revMap.get(m)))),avg6=avg(prev6.map(m=>num(revMap.get(m))));

  const yoyPairs=prev6.map(m=>({cur:num(revMap.get(m)),prev:num(revMap.get(shiftMonth(m,-12)))})).filter(x=>x.prev>0);
  const recentYoyValues=yoyPairs.slice(0,3).map(x=>x.cur/x.prev-1);
  const recentYoy=recentYoyValues.length?clamp(avg(recentYoyValues),-0.45,0.80):0;
  const yearCurrent=prev12.reduce((s,m)=>s+num(revMap.get(m)),0);
  const yearPrevious=prev12.reduce((s,m)=>s+num(revMap.get(shiftMonth(m,-12))),0);
  const annualTrend=yearPrevious>0?clamp(yearCurrent/yearPrevious-1,-0.45,0.80):recentYoy;
  const blendedTrend=clamp(recentYoy*0.65+annualTrend*0.35,-0.45,0.80);

  const lyPrev3=[-13,-14,-15].map(d=>shiftMonth(targetMonth,d));
  const lyPrevAvg=avg(lyPrev3.map(m=>num(revMap.get(m))));
  const seasonal=lastYear>0&&lyPrevAvg>0?clamp(lastYear/lyPrevAvg,0.70,1.45):1;
  const historyExpected=lastYear>0?lastYear*(1+blendedTrend):0;
  const recentExpected=avg3>0?avg3*seasonal:0;
  let supported=historyExpected>0&&recentExpected>0?historyExpected*0.60+recentExpected*0.40:Math.max(historyExpected,recentExpected,avg3,avg6);

  const lyClient=clientNetMap(rows,lastYearMonth),recentClient=clientAvgForMonths(rows,prev3);
  let recoverableReserve=0,lostClientCount=0;
  for(const [k,lyRev] of lyClient){
    if(lyRev<=0)continue;
    const cur=num(recentClient.get(k));
    if(cur<lyRev){recoverableReserve+=(lyRev-Math.max(0,cur))*0.20;if(cur<=0)lostClientCount++;}
  }
  recoverableReserve=Math.min(recoverableReserve,Math.max(lastYear,avg3,1)*0.10);
  supported+=recoverableReserve;
  if(lastYear>0){
    const floor=Math.min(lastYear,avg3||lastYear)*0.75;
    const ceiling=Math.max(lastYear,avg3,avg6,1)*1.65;
    supported=clamp(supported,floor,ceiling);
  }

  const target30=lastYear>0?lastYear*(1+BUSINESS_GROWTH_TARGET):0;
  const targetConfirmed=target30>0&&supported>=target30;
  const recommendedShipment=roundPlan(targetConfirmed?Math.max(target30,supported):supported);
  const recommendedGrowth=lastYear>0?recommendedShipment/lastYear-1:null;
  const gap30=target30>0?Math.max(0,target30-supported):0;

  const sameLyAkb=activeClientsForMonth(rows,lastYearMonth).size;
  const akb3=prev3.map(m=>activeClientsForMonth(rows,m).size);
  const avgAkb3=avg(akb3),maxAkb3=Math.max(0,...akb3);
  const active12Months=[...Array(12)].map((_,i)=>shiftMonth(targetMonth,-1-i));
  const active12=activeClientsForMonths(rows,active12Months),activeRecent=activeClientsForMonths(rows,prev3);
  let returnable=0;active12.forEach(k=>{if(!activeRecent.has(k))returnable++;});
  const potentialAssigned=ownership.clients.filter(c=>String(c.client_status||'').toLowerCase()==='потенциальный'&&!active12.has(clientKey(c.name))).length;
  const akbBase=Math.max(sameLyAkb,avgAkb3,maxAkb3);
  const salesGrowthForAkb=recommendedGrowth==null?0.15:Math.max(0,recommendedGrowth);
  const akbGrowth=clamp(0.05+salesGrowthForAkb*0.20,0.05,0.12);
  let recommendedAkb=Math.ceil(akbBase*(1+akbGrowth));
  const feasibleExtra=Math.ceil(returnable*0.35+potentialAssigned*0.15);
  const feasibleCeiling=Math.max(maxAkb3,Math.ceil(maxAkb3+feasibleExtra));
  recommendedAkb=Math.min(recommendedAkb,feasibleCeiling||recommendedAkb,ownership.clients.length);
  recommendedAkb=Math.max(maxAkb3,recommendedAkb);

  const monthsWithData=prev6.filter(m=>revMap.has(m)).length;
  const confidence=lastYear>0&&monthsWithData>=5?'высокая':monthsWithData>=3?'средняя':'низкая';
  return {manager,targetMonth,ownershipCount:ownership.clients.length,rowsCount:rows.length,lastYearMonth,lastYear,lastYearDiag,target30,targetConfirmed,gap30,
    avg3,avg6,recentYoy,annualTrend,yearCurrent,yearPrevious,seasonal,historyExpected,recentExpected,supported,recoverableReserve,lostClientCount,
    recommendedShipment,recommendedGrowth,sameLyAkb,avgAkb3,maxAkb3,returnable,potentialAssigned,recommendedAkb,akbGrowth,confidence,monthsWithData};
}

function currentExistingPlan(){
  const manager=document.getElementById('manager-plan-name')?.value||'';
  const month=ym(document.getElementById('manager-plan-month')?.value||'');
  return (allManagerKpiPlans||[]).find(p=>strictManager(p.manager_name,manager)&&ym(p.period_month)===month)||null;
}
function injectPanel(){
  if(currentProfile?.role!=='boss')return null;
  const modal=document.querySelector('#modal-manager-plan .modal');if(!modal)return null;
  ['2310','2311','2312','2313'].forEach(v=>document.getElementById('manager-ai-plan-v'+v)?.remove());
  let root=document.getElementById('manager-ai-plan-v2314');
  if(!root){
    root=document.createElement('div');root.id='manager-ai-plan-v2314';
    const note=document.getElementById('manager-plan-note')?.closest('.form-field');
    (note||modal.querySelector('.modal-head'))?.insertAdjacentElement(note?'beforebegin':'afterend',root);
  }
  root.innerHTML='<div style="border:1px solid #BFDBFE;background:#F8FBFF;border-radius:12px;padding:12px 13px;margin-bottom:14px">'
    +'<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap"><div><div style="font-size:13px;font-weight:800;color:var(--at)">🤖 ИИ-план · черновик руководителя <span style="font-size:10px;color:var(--sub)">v23.1.4</span></div>'
    +'<div style="font-size:11px;color:var(--sub);line-height:1.5;margin-top:3px">Только закреплённая база полевого менеджера. При расчёте CRM перечитывает свежую историю 1С и проверяет чистую выручку прошлого года.</div></div>'
    +'<button type="button" class="btn-secondary" style="padding:7px 10px" onclick="crmCalculateManagerAiPlanV2314()">Рассчитать</button></div>'
    +'<div id="manager-ai-plan-result-v2314" style="margin-top:10px;font-size:12px;color:var(--sub)">Нажмите «Рассчитать». Никаких автоматических записей в план нет.</div></div>';
  const save=[...modal.querySelectorAll('button')].find(b=>String(b.getAttribute('onclick')||'').includes('saveManagerKpiPlan'));
  if(save)save.textContent='✅ Утвердить и зафиксировать';
  return root;
}
function resetPanel(){
  const root=injectPanel();if(!root)return;
  lastRecommendation=null;
  const out=document.getElementById('manager-ai-plan-result-v2314');if(!out)return;
  const p=currentExistingPlan();
  out.innerHTML=p?'<b style="color:var(--g)">✅ План на этот месяц уже сохранён.</b> Пересчёт ничего сам не изменит.':'Нажмите «Рассчитать» — CRM сначала перечитает свежую историю 1С.';
}
function renderBrokenHistory(out,e){
  const d=e.diag||{};
  const negatives=(d.topNegative||[]).length
    ?'<div style="margin-top:7px"><b>Крупнейший отрицательный чистый оборот:</b><br>'+(d.topNegative||[]).map(([k,v])=>'• '+escLocal(k)+': <b>'+money(v)+'</b>').join('<br>')+'</div>':'';
  out.innerHTML='<div style="padding:10px 12px;border:1px solid #FCA5A5;background:#FEF2F2;border-radius:10px;color:#991B1B">'
    +'<b>⛔ Расчёт остановлен: история за '+escLocal(d.month||'нужный месяц')+' не даёт валидной положительной базы.</b>'
    +'<div style="font-size:12px;line-height:1.65;margin-top:7px">Строк: <b>'+num(d.rows)+'</b> · плюс: <b>'+money(d.positiveRevenue)+'</b> ('+num(d.positiveRows)+' строк) · минус/возвраты: <b>'+money(d.negativeRevenue)+'</b> ('+num(d.negativeRows)+' строк) · <b>чистый итог: '+money(d.netRevenue)+'</b>.</div>'
    +'<div style="font-size:12px;line-height:1.65;margin-top:4px">Клиентов с положительным чистым оборотом: <b>'+num(d.activeClients)+'</b> · клиентов с отрицательным итогом: <b>'+num(d.negativeClientCount)+'</b>.</div>'
    +negatives
    +'<div style="font-size:12px;line-height:1.6;margin-top:8px"><b>Рекомендация намеренно заблокирована.</b> Закреплённая база: '+num(e.ownershipCount)+' клиентов · всего строк истории менеджера: '+num(e.rowsCount)+'.</div>'
    +'</div>';
}
async function calculate(){
  if(currentProfile?.role!=='boss')return;
  injectPanel();
  const out=document.getElementById('manager-ai-plan-result-v2314');
  const manager=document.getElementById('manager-plan-name')?.value||'',month=ym(document.getElementById('manager-plan-month')?.value||'');
  if(!manager||!month){if(out)out.textContent='Выберите менеджера и месяц.';return;}
  if(out)out.innerHTML='<b style="color:var(--a)">⏳ Перечитываю свежую purchase_history из Supabase и считаю закреплённую базу…</b>';
  try{
    if(typeof window.v22722EnsureHistory!=='function')throw new Error('загрузчик истории продаж недоступен');
    await window.v22722EnsureHistory({force:true,reason:'manager-ai-plan-v2314'});
    const r=calcRecommendation(manager,month);lastRecommendation=r;
    const existing=currentExistingPlan();
    const targetLine=r.lastYear>0?'<b>Аналогичный месяц прошлого года:</b> '+money(r.lastYear)+' → <b>бизнес-цель +30%:</b> '+money(r.target30)
      :'<b style="color:var(--am)">За аналогичный месяц прошлого года нет продаж закреплённой базы — +30% год к году проверить нельзя.</b>';
    const verdict=r.lastYear<=0?'':(r.targetConfirmed
      ?'<div style="margin-top:8px;padding:8px 10px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;color:#166534"><b>✅ +30% подтверждается текущими данными.</b></div>'
      :'<div style="margin-top:8px;padding:8px 10px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;color:#92400E"><b>⚠️ +30% сейчас не подтверждается.</b> До бизнес-цели не обеспечено <b>'+money(r.gap30)+'</b>.</div>');
    out.innerHTML='<div>'+targetLine+'</div>'
      +'<div style="font-size:11px;color:var(--sub);margin-top:5px">Свежий расчёт: <b>'+r.ownershipCount+'</b> закреплённых клиентов · '+r.rowsCount+' строк истории 1С. Чужие менеджеры и Триовист не используются.</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">'
        +'<div style="background:#fff;border:1px solid var(--border);border-radius:9px;padding:9px"><div style="font-size:10px;color:var(--sub);text-transform:uppercase">Рекомендация продаж</div><div style="font-size:19px;font-weight:800;margin-top:3px">'+money(r.recommendedShipment)+'</div><div style="font-size:11px;color:var(--sub)">'+(r.recommendedGrowth==null?'нет годовой базы':pct(r.recommendedGrowth)+' к прошлому году')+'</div></div>'
        +'<div style="background:#fff;border:1px solid var(--border);border-radius:9px;padding:9px"><div style="font-size:10px;color:var(--sub);text-transform:uppercase">Рекомендация АКБ</div><div style="font-size:19px;font-weight:800;margin-top:3px">'+r.recommendedAkb+' клиентов</div><div style="font-size:11px;color:var(--sub)">прошлый год '+r.sameLyAkb+' · среднее 3 мес. '+r.avgAkb3.toFixed(1)+'</div></div>'
      +'</div>'+verdict
      +'<div style="margin-top:10px;line-height:1.6"><b>Как получена цифра:</b><br>'
        +'• среднее последних 3 закрытых месяцев: '+money(r.avg3)+'<br>'
        +'• среднее последних 6 месяцев: '+money(r.avg6)+'<br>'
        +'• тренд последних месяцев год к году: '+pct(r.recentYoy)+'<br>'
        +'• тренд 12 закрытых месяцев: '+pct(r.annualTrend)+'<br>'
        +'• расчёт по годовому тренду: '+money(r.historyExpected)+'<br>'
        +'• расчёт по текущему темпу с сезонностью: '+money(r.recentExpected)+'<br>'
        +'• осторожный резерв возврата просевших закреплённых клиентов: '+money(r.recoverableReserve)+' ('+r.lostClientCount+' полностью выпавших)<br>'
        +'• АКБ: вернуть можно '+r.returnable+' · потенциальных закреплено '+r.potentialAssigned+' · рекомендуемый рост АКБ '+pct(r.akbGrowth)+'<br>'
        +'• надёжность: <b>'+r.confidence+'</b> ('+r.monthsWithData+'/6 последних месяцев есть в истории)'
      +'</div>'
      +(existing?'<div style="margin-top:8px;color:var(--g)"><b>Сохранённый план:</b> '+money(existing.shipment_plan)+' · АКБ '+num(existing.akb_plan)+'. Он не меняется автоматически.</div>':'')
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button type="button" class="btn-primary" onclick="crmApplyManagerAiPlanV2314()">↳ Подставить рекомендацию</button>'
      +(r.target30>0&&!r.targetConfirmed?'<button type="button" class="btn-secondary" onclick="crmApplyManagerGrowth30V2314()">Поставить всё равно +30%</button>':'')+'</div>'
      +'<div style="font-size:10px;color:var(--sub);margin-top:6px">Подстановка не сохраняет план. Сохранение только после явного подтверждения руководителя.</div>';
  }catch(e){
    lastRecommendation=null;console.error(VERSION,e);
    if(!out)return;
    if(e?.code==='BROKEN_HISTORY_NET_REVENUE'){renderBrokenHistory(out,e);return;}
    out.innerHTML='<b style="color:var(--r)">Расчёт остановлен:</b> '+escLocal(e?.message||e)+'. План не изменён.';
  }
}
function apply(use30){
  const r=lastRecommendation;if(!r)return;
  const ship=document.getElementById('manager-plan-shipment'),akb=document.getElementById('manager-plan-akb');
  if(ship)ship.value=String(Math.round(use30&&r.target30>0?r.target30:r.recommendedShipment));
  if(akb)akb.value=String(r.recommendedAkb);
  const out=document.getElementById('manager-ai-plan-result-v2314');
  if(out)out.insertAdjacentHTML('beforeend','<div style="margin-top:8px;color:var(--a);font-weight:700">✓ Значения только подставлены. Проверьте перед сохранением.</div>');
}
window.crmCalculateManagerAiPlanV2314=calculate;
window.crmApplyManagerAiPlanV2314=()=>apply(false);
window.crmApplyManagerGrowth30V2314=()=>apply(true);

function hookModal(){
  const modal=document.getElementById('modal-manager-plan');if(!modal)return;
  if(modal.dataset.aiPlansHook2314==='1')return;
  modal.dataset.aiPlansHook2314='1';
  let wasOpen=modal.classList.contains('open');
  const sync=()=>{
    const open=modal.classList.contains('open');
    if(open&&!wasOpen)setTimeout(resetPanel,0);
    wasOpen=open;
  };
  new MutationObserver(sync).observe(modal,{attributes:true,attributeFilter:['class']});
  modal.addEventListener('change',e=>{if(e.target?.id==='manager-plan-name'||e.target?.id==='manager-plan-month')setTimeout(resetPanel,0);});
  if(wasOpen)setTimeout(resetPanel,0);
}
function bootHook(){hookModal();if(!document.getElementById('modal-manager-plan'))setTimeout(bootHook,500);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootHook,{once:true});else bootHook();

window.RESANTA_AI_MANAGER_PLANS_V2314=Object.freeze({
  version:VERSION,
  ownershipSource:'clients.manager_name',
  purchaseHistoryManagerFieldIgnored:true,
  strictManagerOwnership:true,
  triovistExcluded:true,
  forceFreshHistoryOnEveryCalculation:true,
  clientMonthlyNetRevenueForAkb:true,
  nonPositiveHistoricalNetBlocksRecommendation:true,
  bossApprovalRequired:true,
  savedPlanNeverAutoChanges:true,
  targetGrowthPct:30,
  sqlChanges:false
});
})();
