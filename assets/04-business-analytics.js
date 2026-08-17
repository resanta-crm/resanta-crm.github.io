/* RESANTA CRM v23.0.0
 * VIP, falling, signals, ABC, commercial engines, absences
 * Extracted from v22.7.32.2.17 without business-logic changes.
 * Original inline script range: 34-54
 */

/* ===== ORIGINAL INLINE SCRIPT 34 ===== */
// ===== v22.7.7: оптимизация переходов между разделами =====
window.RESANTA_V2277=Object.freeze({version:'v22.7.7',singleFrameNavigation:true,cancelStaleRenders:true,clientLinearIndexes:true,routeReadCacheSeconds:60,bossDayRefreshCacheSeconds:30,duplicatePageRendersRemoved:true});

/* ===== ORIGINAL INLINE SCRIPT 35 ===== */
window.RESANTA_V2278=Object.freeze({version:'22.7.8',workingClientABC:true,branchABC:true,mandatoryRelevantNovelty:true,potentialLogicUnchanged:true});

/* ===== ORIGINAL INLINE SCRIPT 36 ===== */
// ===== v22.7.10: единый план/факт визитов + честный контроль визитов без маршрута =====
(function(){
'use strict';
const VERSION='v22.7.10';
let currentLedger22710=null;

function d22710(v){return String(v||'').slice(0,10);}
function dayDelta22710(a,b){
  const x=new Date(d22710(a)+'T00:00:00'),y=new Date(d22710(b)+'T00:00:00');
  if(Number.isNaN(x.getTime())||Number.isNaN(y.getTime()))return 0;
  return Math.round((y-x)/86400000);
}
function planKey22710(r){return String(r&&r.id||routeTruthIdentity(r)||'');}
function visitKey22710(v){
  if(v&&v.id)return String(v.id);
  return [visitManagerName(v),visitDate(v),String(v&&v.client_id||''),String(v&&v.created_at||''),String(v&&v.route_plan_id||'')].join('|');
}
function routeClient22710(r){
  if(!r)return null;
  const ids=[];
  if(r.client_id)ids.push(String(r.client_id));
  if(Array.isArray(r.linked_client_ids))r.linked_client_ids.forEach(x=>ids.push(String(x)));
  for(const id of ids){const c=(allClients||[]).find(x=>String(x.id)===id);if(c)return c;}
  const names=[r.client_name,...(Array.isArray(r.linked_client_names)?r.linked_client_names:[])].filter(Boolean);
  for(const name of names){const c=matchClientByName(name);if(c)return c;}
  return null;
}
function explicit22710(r,v){
  if(!r||!v||v.is_duplicate)return false;
  const rid=String(r.id||''),vrid=String(v.route_plan_id||'');
  if(rid&&vrid&&rid===vrid)return true;
  return !!(r.linked_visit_id&&v.id&&String(r.linked_visit_id)===String(v.id));
}
function identity22710(r,v){
  return !!(r&&v&&!v.is_duplicate&&managerLooseMatch(r.manager_name,visitManagerName(v))&&routeClientMatchesVisit(r,v));
}
function bind22710(ledger,r,v,kind){
  const pk=planKey22710(r),vk=visitKey22710(v);
  if(!pk||!vk||ledger.planMatches.has(pk)||ledger.visitMatches.has(vk))return false;
  const delta=dayDelta22710(r.visit_date,visitDate(v));
  const row={plan:r,visit:v,kind:delta===0?'on_time':(delta>0?'late':'early_explicit'),deviationDays:delta,matchKind:kind};
  ledger.planMatches.set(pk,row);
  ledger.visitMatches.set(vk,row);
  ledger.matches.push(row);
  return true;
}
function buildLedger22710(visits,plans){
  const source=dedupeRoutePlansForTruth(activeRouteRows(plans||[]));
  // Маршрут без текущей карточки клиента не обвиняет менеджера и не участвует в KPI.
  const validPlans=source.filter(r=>!!routeClient22710(r));
  const unresolvedRouteRows=source.filter(r=>!routeClient22710(r));
  const visitRows=(visits||[]).filter(v=>v&&!v.is_duplicate&&visitDate(v));
  const ledger={plans:validPlans,visits:visitRows,planKeys:new Set(validPlans.map(planKey22710)),visitKeys:new Set(visitRows.map(visitKey22710)),planMatches:new Map(),visitMatches:new Map(),matches:[],unresolvedRouteRows};

  // 1. Явная связь route_plan_id / linked_visit_id — источник истины.
  visitRows.forEach(v=>{
    const r=validPlans.find(p=>!ledger.planMatches.has(planKey22710(p))&&explicit22710(p,v));
    if(r)bind22710(ledger,r,v,'explicit');
  });

  // 2. Точный факт: дата + менеджер + тот же клиент/алиас.
  visitRows.slice().sort((a,b)=>visitDate(a).localeCompare(visitDate(b))).forEach(v=>{
    const vk=visitKey22710(v);
    if(ledger.visitMatches.has(vk))return;
    const vd=visitDate(v);
    const candidates=validPlans.filter(r=>!ledger.planMatches.has(planKey22710(r))&&d22710(r.visit_date)===vd&&identity22710(r,v));
    if(candidates.length)bind22710(ledger,candidates[0],v,'exact');
  });

  // 3. Поздний факт: закрываем только ближайшую предыдущую невыполненную точку.
  // Один визит закрывает ровно одну точку — старые пропуски не обнуляются пачкой.
  visitRows.slice().sort((a,b)=>visitDate(a).localeCompare(visitDate(b))).forEach(v=>{
    const vk=visitKey22710(v);
    if(ledger.visitMatches.has(vk))return;
    const vd=visitDate(v);
    const candidates=validPlans.filter(r=>!ledger.planMatches.has(planKey22710(r))&&d22710(r.visit_date)<vd&&identity22710(r,v))
      .sort((a,b)=>d22710(b.visit_date).localeCompare(d22710(a.visit_date)));
    if(candidates.length)bind22710(ledger,candidates[0],v,'late');
  });
  return ledger;
}

window.v22710RouteVisitLedger=buildLedger22710;
window.v22710RouteFactForVisit=function(v,plans){
  const vk=visitKey22710(v);
  if(currentLedger22710&&currentLedger22710.visitKeys&&currentLedger22710.visitKeys.has(vk))return currentLedger22710.visitMatches.get(vk)||null;
  const ps=plans||((typeof routePlansForCurrentUser==='function')?routePlansForCurrentUser():(allRoutePlans||[]));
  const vs=(typeof visibleVisitsForCurrentUser==='function'?visibleVisitsForCurrentUser():(allVisits||[]))
    .filter(x=>visitDate(x)>=VISIT_CONTROL_START_DATE&&visitDate(x)<=TODAY);
  return buildLedger22710(vs,ps).visitMatches.get(vk)||null;
};
window.visitRouteBadge22710=function(v,plans){
  const m=window.v22710RouteFactForVisit(v,plans);
  if(!m)return '<span class="tag tag-g">ℹ️ без точки маршрута</span>';
  if(m.deviationDays>0)return '<span class="tag" style="background:var(--amb);color:#8a4d00">🟡 по маршруту · +'+m.deviationDays+' дн.</span>';
  if(m.deviationDays<0)return '<span class="tag" style="background:var(--amb);color:#8a4d00">🟡 по маршруту · '+m.deviationDays+' дн.</span>';
  return '<span class="tag tag-m">✅ по маршруту</span>';
};

window.routePlanVerified=function(r,visits,plans){
  if(!r)return false;
  const pk=planKey22710(r);
  if(!visits&&!plans&&currentLedger22710&&currentLedger22710.planKeys&&currentLedger22710.planKeys.has(pk))return currentLedger22710.planMatches.has(pk);
  const ps=plans||((typeof routePlansForCurrentUser==='function')?routePlansForCurrentUser():(allRoutePlans||[]));
  const vs=visits||((typeof visibleVisitsForCurrentUser==='function')?visibleVisitsForCurrentUser():(allVisits||[]));
  return buildLedger22710(vs,ps).planMatches.has(pk);
};
window.visitIsRouteLinked=function(v,plans){
  if(!v||v.is_duplicate)return false;
  return !!window.v22710RouteFactForVisit(v,plans);
};
window.routeTruthMetrics=function(visits,plans){
  const rows=(visits||[]).filter(v=>v&&!v.is_duplicate);
  const routeRows=dedupeRoutePlansForTruth(activeRouteRows(plans||[]));
  const ledger=buildLedger22710(rows,routeRows);
  const wb=weekBounds(TODAY);
  const weekVisits=rows.filter(v=>visitDate(v)>=wb.start&&visitDate(v)<=wb.end);
  const weekPlans=ledger.plans.filter(r=>d22710(r.visit_date)>=wb.start&&d22710(r.visit_date)<=wb.end);
  const duePlans=weekPlans.filter(r=>d22710(r.visit_date)<=TODAY);
  const verifiedWeek=weekPlans.filter(r=>ledger.planMatches.has(planKey22710(r)));
  const verifiedDue=duePlans.filter(r=>ledger.planMatches.has(planKey22710(r)));
  const markedOnlyWeek=weekPlans.filter(r=>r.visited&&!ledger.planMatches.has(planKey22710(r)));
  const overdue=ledger.plans.filter(r=>d22710(r.visit_date)<TODAY&&!ledger.planMatches.has(planKey22710(r)));
  const offRouteWeek=weekVisits.filter(v=>!ledger.visitMatches.has(visitKey22710(v)));
  const deviations=ledger.matches.filter(x=>x.deviationDays!==0);
  return {wb,weekVisits,weekPlans,duePlans,verifiedWeek,verifiedDue,markedOnlyWeek,overdue,offRouteWeek,deviations,matches:ledger.matches,unresolvedRouteRows:ledger.unresolvedRouteRows,ledger};
};

function renderDeviation22710(ledger){
  const block=document.getElementById('deviation-visits-block');
  const list=document.getElementById('deviation-visits-list');
  if(!block||!list)return;
  const rows=(ledger?.matches||[])
    .filter(x=>x.deviationDays!==0&&d22710(x.plan.visit_date)>=VISIT_CONTROL_START_DATE)
    .sort((a,b)=>visitDate(b.visit).localeCompare(visitDate(a.visit)));
  block.style.display=rows.length?'block':'none';
  list.innerHTML=rows.slice(0,100).map(x=>{
    const c=routeClient22710(x.plan);
    const delta=x.deviationDays>0?('+'+x.deviationDays):String(x.deviationDays);
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--border);gap:8px">'
      +'<div><span style="font-weight:500;cursor:pointer" '+(c?'onclick="openClient(\''+c.id+'\')"':'')+'>'+esc(c?.name||x.plan.client_name||'Клиент')+'</span>'
      +(currentProfile?.role==='boss'?'<span class="tag tag-gray" style="margin-left:6px">👤 '+esc(x.plan.manager_name||visitManagerName(x.visit)||'—')+'</span>':'')
      +'<div style="font-size:11px;color:var(--sub)">план '+esc(d22710(x.plan.visit_date))+' · факт '+esc(visitDate(x.visit))+'</div></div>'
      +'<span class="tag" style="background:var(--amb);color:#8a4d00">отклонение '+delta+' дн.</span>'
    +'</div>';
  }).join('')+(rows.length>100?'<div style="font-size:12px;color:var(--sub);padding:6px 0">и ещё '+(rows.length-100)+'...</div>':'');
}

const baseRenderVisits22710=window.renderVisits;
window.renderVisits=function(){
  try{
    const visible=typeof visibleVisitsForCurrentUser==='function'?visibleVisitsForCurrentUser():(allVisits||[]);
    const control=visible.filter(v=>visitDate(v)>=VISIT_CONTROL_START_DATE&&visitDate(v)<=TODAY);
    const plans=typeof routePlansForCurrentUser==='function'?routePlansForCurrentUser():(allRoutePlans||[]);
    currentLedger22710=buildLedger22710(control,plans);
  }catch(e){
    currentLedger22710=null;
    console.warn('v22.7.10 precompute plan/fact',e);
  }
  const out=baseRenderVisits22710.apply(this,arguments);
  try{
    renderDeviation22710(currentLedger22710);
    const off=document.querySelector('#offroute-visits-block .card-title');
    if(off)off.textContent='ℹ️ Визиты без согласованной точки маршрута за последние 30 дней';
  }catch(e){console.warn('v22.7.10 visit UI',e);}
  return out;
};

window.RESANTA_V22710=Object.freeze({
  version:VERSION,
  oneVisitOnePlan:true,
  lateVisitClosesNearestPreviousPlan:true,
  offRouteUsesSameLedger:true,
  aliasesAndLinkedClientIds:true,
  deviationBlock:true
});
})();

/* ===== ORIGINAL INLINE SCRIPT 37 ===== */
// ===== v22.7.11: route_call — это дистанционный контакт, а не внеплановый полевой визит =====
(function(){
'use strict';
const VERSION='v22.7.11';

function d22711(v){return String(v||'').slice(0,10);}
function isRouteCallTask22711(t){return String(t&&t.source||'').trim().toLowerCase().startsWith('route_call');}
function visitClient22711(v){
  if(!v)return null;
  const id=String(v.client_id||'');
  if(id){const c=(allClients||[]).find(x=>String(x.id)===id);if(c)return c;}
  const byName=String(v.client_name||'').trim();
  if(byName){try{const c=matchClientByName(byName);if(c)return c;}catch(_){}}
  return null;
}
function taskMatchesVisitClient22711(t,v,c){
  const taskId=String(t&&t.client_id||''),visitId=String(v&&v.client_id||''),clientId=String(c&&c.id||'');
  if(taskId&&((visitId&&taskId===visitId)||(clientId&&taskId===clientId)))return true;
  const taskName=String(t&&t.client_name||'').trim();
  if(taskName&&c){
    try{if(clientNameVariants(c).some(n=>nameLooseMatch(taskName,n)))return true;}catch(_){}
  }
  return false;
}
function callTaskCoversVisit22711(t,v,c){
  if(!isRouteCallTask22711(t)||!v)return false;
  const vm=visitManagerName(v),tm=taskManagerName(t);
  if(vm&&tm&&!managerLooseMatch(tm,vm))return false;
  if(!taskMatchesVisitClient22711(t,v,c))return false;
  const vd=visitDate(v),ym=vd.slice(0,7),due=d22711(t.due_date),done=d22711(t.done_at);
  // Основное правило — режим прозвона действует в том месяце, на который создана задача.
  if(due&&due.slice(0,7)===ym)return true;
  // Если просроченный прозвон закрыли именно в день контакта, это тоже дистанционный факт,
  // а не самовольный полевой выезд.
  if(t.done&&done&&done===vd)return true;
  return false;
}
function visitIsCallMode22711(v){
  if(!v||v.is_duplicate)return false;
  const c=visitClient22711(v);
  return (allTasks||[]).some(t=>callTaskCoversVisit22711(t,v,c));
}
window.v22711VisitIsCallMode=visitIsCallMode22711;

// Не подменяем план/факт: route_call не закрывает маршрутную точку. Он лишь исключается
// из нарушения «внеплановый полевой визит».
const baseVisitIsRouteLinked22711=window.visitIsRouteLinked;
window.visitIsRouteLinked=function(v,plans){
  if(visitIsCallMode22711(v))return true;
  return typeof baseVisitIsRouteLinked22711==='function'?baseVisitIsRouteLinked22711(v,plans):false;
};

const baseRouteTruthMetrics22711=window.routeTruthMetrics;
window.routeTruthMetrics=function(visits,plans){
  const out=baseRouteTruthMetrics22711(visits,plans);
  out.offRouteWeek=(out.offRouteWeek||[]).filter(v=>!visitIsCallMode22711(v));
  out.callModeExcludedWeek=(visits||[]).filter(v=>{
    const d=visitDate(v),wb=out.wb||weekBounds(TODAY);
    return d>=wb.start&&d<=wb.end&&visitIsCallMode22711(v);
  });
  return out;
};

const baseVisitRouteBadge22711=window.visitRouteBadge22710;
window.visitRouteBadge22710=function(v,plans){
  try{
    const matched=typeof window.v22710RouteFactForVisit==='function'?window.v22710RouteFactForVisit(v,plans):null;
    if(matched&&typeof baseVisitRouteBadge22711==='function')return baseVisitRouteBadge22711(v,plans);
    if(visitIsCallMode22711(v))return '<span class="tag" style="background:#E6F1FB;color:#0C447C">📞 прозвон вместо полевого визита</span>';
  }catch(_){ }
  if(typeof baseVisitRouteBadge22711==='function'){
    const html=baseVisitRouteBadge22711(v,plans);
    return String(html||'').replace('ℹ️ без точки маршрута','ℹ️ внеплановый полевой визит');
  }
  return '<span class="tag tag-g">ℹ️ внеплановый полевой визит</span>';
};

// Заголовок меняем после каждого рендера, потому что v22.7.10 также обновляет его.
const baseRenderVisits22711=window.renderVisits;
window.renderVisits=function(){
  const out=baseRenderVisits22711.apply(this,arguments);
  try{
    const title=document.querySelector('#offroute-visits-block .card-title');
    if(title)title.textContent='ℹ️ Внеплановые полевые визиты за последние 30 дней';
  }catch(_){ }
  return out;
};

window.RESANTA_V22711=Object.freeze({
  version:VERSION,
  routeCallExcludedFromOffRoute:true,
  routeCallSourcesPrefix:'route_call',
  sameMonthCallMode:true,
  completedCallSameDayFallback:true,
  routePlanFactUnchanged:true,
  mergedClientSafe:true
});
})();

/* ===== ORIGINAL INLINE SCRIPT 38 ===== */
// ===== v22.7.12: внеплановый полевой визит — управленческий сигнал до явного разбора =====
(function(){
'use strict';
const VERSION='v22.7.12';
let archiveOpen22712=false;

function routeReview22712(v){
  const id=String(v&&v.id||'');
  if(!id)return null;
  return (allVisitRouteReviews||[]).find(r=>String(r.visit_id||'')===id&&String(r.status||'reviewed')==='reviewed')||null;
}
function routeReviewClosed22712(v){return !!routeReview22712(v);}
function visitClient22712(v){
  if(!v)return null;
  const id=String(v.client_id||'');
  if(id){const c=(allClients||[]).find(x=>String(x.id)===id);if(c)return c;}
  const nm=String(v.client_name||'').trim();
  if(nm){try{return matchClientByName(nm)||null;}catch(_){} }
  return null;
}
function reasonCode22712(text){
  const s=String(text||'').toLowerCase();
  if(/просьб|клиент.*попрос/.test(s))return 'client_request';
  if(/по пути|попут/.test(s))return 'on_the_way';
  if(/согласов|самоволь|без соглас/.test(s))return 'should_approve';
  if(/ошиб.*привяз|привяз.*ошиб|техническ/.test(s))return 'link_error';
  return 'other';
}
async function closeRouteReview22712(visitId){
  if(currentProfile?.role!=='boss'){alert('Разобрать внеплановый визит может только руководитель.');return;}
  const v=(allVisits||[]).find(x=>String(x.id)===String(visitId));if(!v)return;
  const comment=prompt('Итог разбора внепланового визита. Укажите причину и решение.\n\nПримеры: «по просьбе клиента», «заехал по пути», «визит нужно было согласовать», «ошибка привязки маршрута», либо свой комментарий:')||'';
  if(!comment.trim()){alert('Укажите итог разбора — без комментария сигнал не закрывается.');return;}
  const row={visit_id:String(v.id),status:'reviewed',reason_code:reasonCode22712(comment),resolution:comment.trim(),reviewer_name:currentProfile?.name||'Руководитель',reviewed_at:new Date().toISOString()};
  const {data,error}=await db.from('visit_route_reviews').upsert(row,{onConflict:'visit_id'}).select().single();
  if(error){alert('Не удалось закрыть разбор внепланового визита: '+error.message+'\n\nПроверьте, что SQL v22.7.12 выполнен в Supabase.');return;}
  allVisitRouteReviews=(allVisitRouteReviews||[]).filter(x=>String(x.visit_id)!==String(v.id));
  if(data)allVisitRouteReviews.unshift(data);else allVisitRouteReviews.unshift(row);
  renderVisits();buildDashboard();
}
async function reopenRouteReview22712(visitId){
  if(currentProfile?.role!=='boss'||!confirm('Вернуть этот внеплановый визит в активный разбор?'))return;
  const {error}=await db.from('visit_route_reviews').delete().eq('visit_id',String(visitId));
  if(error){alert('Не удалось вернуть в разбор: '+error.message);return;}
  allVisitRouteReviews=(allVisitRouteReviews||[]).filter(x=>String(x.visit_id)!==String(visitId));
  renderVisits();buildDashboard();
}
window.closeRouteReview22712=closeRouteReview22712;
window.reopenRouteReview22712=reopenRouteReview22712;
window.toggleRouteReviewArchive22712=function(){archiveOpen22712=!archiveOpen22712;renderVisits();};
window.routeReviewClosed22712=routeReviewClosed22712;

// Единый KPI: разобранный внеплановый визит остаётся в истории, но перестаёт быть активным сигналом.
const baseRouteTruthMetrics22712=window.routeTruthMetrics;
window.routeTruthMetrics=function(visits,plans){
  const out=baseRouteTruthMetrics22712(visits,plans);
  out.offRouteWeek=(out.offRouteWeek||[]).filter(v=>!routeReviewClosed22712(v));
  return out;
};

function ensureArchiveBlock22712(){
  let block=document.getElementById('offroute-reviewed-block');
  if(block)return block;
  const active=document.getElementById('offroute-visits-block');if(!active)return null;
  block=document.createElement('div');block.id='offroute-reviewed-block';block.className='card';block.style.display='none';
  active.insertAdjacentElement('afterend',block);return block;
}
function offRouteRows22712(){
  const visible=visibleVisitsForCurrentUser();
  const plans=routePlansForCurrentUser();
  // Активный управленческий сигнал не протухает через 30 дней: он живёт с начала честного периода,
  // пока руководитель явно не завершит разбор. Пилот до 20.07.2026 по-прежнему исключён.
  const candidate=visible.filter(v=>{
    const d=visitDate(v);
    return d>=VISIT_CONTROL_START_DATE&&d<=TODAY&&!isControlExcludedManager(visitManagerName(v))&&!visitIsRouteLinked(v,plans);
  });
  return {plans,candidate,active:candidate.filter(v=>!routeReviewClosed22712(v)),closed:visible.filter(v=>routeReviewClosed22712(v))};
}
function rowHtml22712(v,closed){
  const c=visitClient22712(v),review=routeReview22712(v),visitId=escAttr(String(v.id||'')),clientId=c?escAttr(String(c.id||'')):'';
  const manager=currentProfile?.role==='boss'?' <span class="tag tag-gray">👤 '+esc(visitManagerName(v))+'</span>':'';
  const reviewHtml=closed&&review?'<div style="font-size:11px;color:var(--g);margin-top:4px"><b>✅ Разобрано:</b> '+esc(review.resolution||'—')+' · '+esc(review.reviewer_name||'Руководитель')+' · '+crmDateTime(review.reviewed_at)+'</div>':'';
  const action=currentProfile?.role==='boss'
    ?(closed?'<button onclick="event.stopPropagation();reopenRouteReview22712(\''+visitId+'\')" class="btn-secondary" style="padding:6px 9px;font-size:11px">Вернуть в разбор</button>'
      :'<button onclick="event.stopPropagation();closeRouteReview22712(\''+visitId+'\')" style="padding:6px 10px;border:1px solid var(--g);color:var(--g);background:#fff;border-radius:7px;cursor:pointer;font-size:11px;font-weight:600">✓ Разобрано</button>')
    :'';
  return '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-top:1px solid var(--border);gap:10px">'
    +'<div style="min-width:0"><span style="font-weight:600;cursor:pointer" '+(c?'onclick="openClient(\''+clientId+'\')"':'')+'>'+esc(c?.name||v.client_name||'Клиент не найден')+'</span>'+manager
    +'<div style="font-size:11px;color:var(--sub);margin-top:3px">'+esc(v.result||v.text||'Результат не указан')+'</div>'+reviewHtml+'</div>'
    +'<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end">'+action+'<span class="tag tag-g">'+esc(visitDate(v))+'</span></div>'
    +'</div>';
}
function renderRouteReviewQueue22712(){
  const root=document.getElementById('offroute-visits-list'),block=document.getElementById('offroute-visits-block');if(!root||!block)return;
  const rows=offRouteRows22712(),active=rows.active.slice().sort((a,b)=>visitDate(b).localeCompare(visitDate(a)));
  const title=block.querySelector('.card-title');
  if(title)title.textContent='ℹ️ Внеплановые полевые визиты — требуют разбора ('+active.length+')';
  block.style.display=active.length?'block':'none';
  root.innerHTML=active.slice(0,100).map(v=>rowHtml22712(v,false)).join('')+(active.length>100?'<div style="font-size:12px;color:var(--sub);padding:6px 0">и ещё '+(active.length-100)+'...</div>':'');

  const archive=ensureArchiveBlock22712();if(!archive)return;
  const closed=rows.closed.slice().sort((a,b)=>String(routeReview22712(b)?.reviewed_at||'').localeCompare(String(routeReview22712(a)?.reviewed_at||'')));
  archive.style.display=(currentProfile?.role==='boss'&&closed.length)?'block':'none';
  if(currentProfile?.role==='boss'&&closed.length){
    archive.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap"><div class="card-title" style="margin:0;color:var(--g)">✅ Разобранные внеплановые визиты ('+closed.length+')</div><button class="btn-secondary" style="padding:6px 10px;font-size:11px" onclick="toggleRouteReviewArchive22712()">'+(archiveOpen22712?'Скрыть':'Показать')+'</button></div>'
      +(archiveOpen22712?'<div style="margin-top:8px">'+closed.slice(0,100).map(v=>rowHtml22712(v,true)).join('')+(closed.length>100?'<div style="font-size:12px;color:var(--sub);padding:6px 0">и ещё '+(closed.length-100)+'...</div>':'')+'</div>':'');
  }
}

const baseRenderVisits22712=window.renderVisits;
window.renderVisits=function(){
  const out=baseRenderVisits22712.apply(this,arguments);
  try{renderRouteReviewQueue22712();}catch(e){console.warn('v22.7.12 route review UI',e);}
  return out;
};

window.RESANTA_V22712=Object.freeze({
  version:VERSION,
  persistentReviewTable:'visit_route_reviews',
  activeUntilReviewed:true,
  reviewedExcludedFromKpi:true,
  reopenSupported:true,
  pilotPeriodStillExcluded:true
});
})();

/* ===== ORIGINAL INLINE SCRIPT 39 ===== */
// ===== v22.7.13: ВИП — честное сравнение год-к-году, текущий месяц на ту же дату =====
(function(){
'use strict';
const VERSION='v22.7.13';
let baselineRows22713=[];
let baselineRun22713=null;
let baselineTarget22713='';
let baselineAttempted22713=false;
let baselinePromise22713=null;
let baselineError22713='';

function iso22713(v){return String(v||'').slice(0,10);}
function ym22713(v){return String(v||'').slice(0,7);}
function sameMonthPrevYear22713(ym){
  if(!/^\d{4}-\d{2}$/.test(String(ym||'')))return null;
  return (Number(String(ym).slice(0,4))-1)+'-'+String(ym).slice(5,7);
}
function sameDatePrevYear22713(iso){
  const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return null;
  const y=Number(m[1])-1,mo=Number(m[2]),day=Number(m[3]);
  const max=new Date(y,mo,0).getDate();
  return y+'-'+String(mo).padStart(2,'0')+'-'+String(Math.min(day,max)).padStart(2,'0');
}
function ruDate22713(iso){
  const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+'.'+m[2]+'.'+m[1]:(iso||'—');
}
function monthToDateLabel22713(iso){
  const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?'01–'+m[3]+'.'+m[2]+'.'+m[1]:(iso||'—');
}
function sameQuarterPrevYear22713(code){return code?{year:Number(code.year)-1,q:Number(code.q)}:null;}
function quarterStartIso22713(code){
  if(!code)return null;const mo=(Number(code.q)-1)*3+1;return Number(code.year)+'-'+String(mo).padStart(2,'0')+'-01';
}
function quarterToDateLabel22713(code,asOf){
  const start=quarterStartIso22713(code);if(!start||!asOf)return vipQuarterLabel(code);
  const s=ruDate22713(start),e=ruDate22713(asOf);return s.slice(0,5)+'–'+e;
}
function salesReportAsOf22713(curMonth){
  const st=typeof crmImportStatus==='function'?crmImportStatus('sales'):null;
  const rd=iso22713(st&&st.report_date);
  if(rd&&ym22713(rd)===curMonth)return {date:rd,exact:true};
  // До установки v22.7.13 старая история не хранит конечную дату отчёта.
  // last_success_at — дата загрузки, но не доказательство, что отчёт сформирован именно по этот день.
  return {date:TODAY,exact:false};
}
function snapshotReady22713(target){return !!(target&&baselineRun22713&&iso22713(baselineRun22713.snapshot_date)===target);}

vipComparisonPeriod=function(){
  const months=[...new Set((allPurchaseHistory||[]).map(r=>ym22713(r.month)).filter(m=>/^\d{4}-\d{2}$/.test(m)))].sort();
  const currentMonth=TODAY.slice(0,7);
  if(!months.length)return {prev:null,cur:null,partial:false,currentMonth,missingCurrent:true,monthComparable:false,quarterComparable:false};
  const cur=months.includes(currentMonth)?currentMonth:months[months.length-1];
  const prev=sameMonthPrevYear22713(cur);
  const partial=cur===currentMonth;
  const curQ=vipQuarterCode(cur),prevQ=sameQuarterPrevYear22713(curQ);
  if(partial){
    const report=salesReportAsOf22713(cur),asOfCur=report.date,asOfPrev=sameDatePrevYear22713(asOfCur);
    const ready=report.exact&&snapshotReady22713(asOfPrev);
    return {prev,cur,partial:true,currentMonth,missingCurrent:false,reportDateExact:report.exact,asOfCur,asOfPrev,monthComparable:ready,quarterComparable:ready,quarterCur:curQ,quarterPrev:prevQ,baselineTarget:asOfPrev};
  }
  const prevAvailable=months.includes(prev);
  return {prev,cur,partial:false,currentMonth,missingCurrent:cur!==currentMonth,reportDateExact:true,asOfCur:null,asOfPrev:null,monthComparable:prevAvailable,quarterComparable:prevAvailable,quarterCur:curQ,quarterPrev:prevQ,baselineTarget:null};
};
window.vipComparisonPeriod=vipComparisonPeriod;

async function loadSnapshotPage22713(date){
  const out=[];let from=0;const page=1000;
  for(;;){
    const {data,error}=await db.from('vip_yoy_snapshots').select('*').eq('snapshot_date',date).range(from,from+page-1);
    if(error)throw error;const chunk=data||[];out.push(...chunk);if(chunk.length<page)break;from+=page;
  }
  return out;
}
async function ensureBaseline22713(){
  const p=vipComparisonPeriod();
  if(!p.partial||!p.reportDateExact||!p.baselineTarget)return false;
  const target=p.baselineTarget;
  if(baselineTarget22713===target&&baselineAttempted22713)return snapshotReady22713(target);
  if(baselinePromise22713)return baselinePromise22713;
  baselineTarget22713=target;baselineAttempted22713=true;baselineError22713='';baselineRun22713=null;baselineRows22713=[];
  baselinePromise22713=(async()=>{
    try{
      const {data,error}=await db.from('vip_yoy_snapshot_runs').select('*').eq('snapshot_date',target).limit(1);
      if(error)throw error;
      baselineRun22713=(data||[])[0]||null;
      if(baselineRun22713)baselineRows22713=await loadSnapshotPage22713(target);
      return !!baselineRun22713;
    }catch(e){baselineError22713=e&&e.message?e.message:String(e);console.warn('v22.7.13 VIP YoY baseline',e);return false;}
    finally{baselinePromise22713=null;}
  })();
  const ok=await baselinePromise22713;
  try{updateSignalsAlertDot(buildSignalTruth(false));}catch(_){}
  try{if(document.getElementById('page-vip')?.classList.contains('active'))renderVip();}catch(_){}
  return ok;
}
window.v22713EnsureVipYoYBaseline=ensureBaseline22713;

function rowsForMemberSource22713(source,def,matched){
  const rows=Array.isArray(source)?source:[];
  if(matched){
    const id=String(matched.id||''),variants=clientNameVariants(matched);
    return rows.filter(r=>(id&&String(r.client_id||'')===id)||variants.some(n=>nameLooseMatch(r.client_name,n)));
  }
  return rows.filter(r=>nameLooseMatch(r.client_name,def.client_name));
}
function addMonthRows22713(g,rows,isPrev,skuSet){
  (rows||[]).forEach(r=>{
    const rev=Number(r.revenue)||0,qty=Number(r.qty)||0,cat=r.category||'Без категории',sub=r.subgroup||'Прочее',product=r.product||'Без наименования',sku=String(r.sku||product||'').trim();
    if(isPrev){g.revenue_prev+=rev;if(qty||rev)skuSet.add(sku);}else{g.revenue_cur+=rev;if(qty||rev)skuSet.add(sku);}
    if(!g.categories[cat])g.categories[cat]={category:cat,revenue_prev:0,revenue_cur:0,subgroups:{}};
    const gc=g.categories[cat];if(isPrev)gc.revenue_prev+=rev;else gc.revenue_cur+=rev;
    if(!gc.subgroups[sub])gc.subgroups[sub]={subgroup:sub,revenue_prev:0,revenue_cur:0,items:{}};
    const gs=gc.subgroups[sub];if(isPrev)gs.revenue_prev+=rev;else gs.revenue_cur+=rev;
    const itemKey=(sku||product)+'|||'+product;
    if(!gs.items[itemKey])gs.items[itemKey]={product,sku,revenue_prev:0,revenue_cur:0,qty_prev:0,qty_cur:0};
    const it=gs.items[itemKey];if(isPrev){it.revenue_prev+=rev;it.qty_prev+=qty;}else{it.revenue_cur+=rev;it.qty_cur+=qty;}
  });
}

getVipClientSummary=function(){
  const period=vipComparisonPeriod();
  const growthOf=(prev,cur)=>prev>0?Math.round((cur-prev)/prev*100):(cur>0?100:0);
  return vipMemberDefinitions().map(def=>{
    const matched=vipMatchedClient(def.client_name),hist=vipRowsForMember(def,matched);
    const prevSource=period.partial&&period.monthComparable?rowsForMemberSource22713(baselineRows22713,def,matched):hist;
    const g={...def,matched,period_prev:period.prev,period_cur:period.cur,period_partial:period.partial,as_of_cur:period.asOfCur||null,as_of_prev:period.asOfPrev||null,month_comparable:!!period.monthComparable,quarter_comparable:!!period.quarterComparable,quarter_prev_code:period.quarterPrev||sameQuarterPrevYear22713(vipQuarterCode(period.cur)),quarter_cur_code:period.quarterCur||vipQuarterCode(period.cur),quarter_revenue_prev:0,quarter_revenue_cur:0,revenue_prev:0,revenue_cur:0,sku_prev:0,sku_cur:0,categories:{}};
    const curSku=new Set(),prevSku=new Set();
    const currentRows=hist.filter(r=>ym22713(r.month)===period.cur);
    const previousRows=g.month_comparable?prevSource.filter(r=>ym22713(r.month)===period.prev):[];
    addMonthRows22713(g,currentRows,false,curSku);addMonthRows22713(g,previousRows,true,prevSku);

    // QTD: текущий квартал — полные завершённые месяцы + текущий MTD.
    g.quarter_revenue_cur=hist.filter(r=>vipRowInQuarter(r,g.quarter_cur_code)).reduce((s,r)=>s+(Number(r.revenue)||0),0);
    if(g.quarter_comparable){
      if(period.partial){
        const earlier=hist.filter(r=>vipRowInQuarter(r,g.quarter_prev_code)&&ym22713(r.month)<period.prev);
        const snap=prevSource.filter(r=>ym22713(r.month)===period.prev);
        g.quarter_revenue_prev=earlier.reduce((s,r)=>s+(Number(r.revenue)||0),0)+snap.reduce((s,r)=>s+(Number(r.revenue)||0),0);
      }else{
        g.quarter_revenue_prev=hist.filter(r=>vipRowInQuarter(r,g.quarter_prev_code)).reduce((s,r)=>s+(Number(r.revenue)||0),0);
      }
    }
    g.sku_prev=prevSku.size;g.sku_cur=curSku.size;
    g.growth_pct=g.month_comparable?growthOf(g.revenue_prev,g.revenue_cur):null;
    Object.values(g.categories).forEach(gc=>{
      gc.growth_pct=g.month_comparable?growthOf(gc.revenue_prev,gc.revenue_cur):null;
      Object.values(gc.subgroups).forEach(gs=>{gs.items=Object.values(gs.items);gs.growth_pct=g.month_comparable?growthOf(gs.revenue_prev,gs.revenue_cur):null;});
    });
    return g;
  });
};
window.getVipClientSummary=getVipClientSummary;

function periodLabel22713(period,which){
  if(period.partial){const d=which==='prev'?period.asOfPrev:period.asOfCur;return monthToDateLabel22713(d);}
  return vipMonthLabel(which==='prev'?period.prev:period.cur);
}
function quarterLabel22713(period,which){
  const code=which==='prev'?period.quarterPrev:period.quarterCur;
  const d=which==='prev'?period.asOfPrev:period.asOfCur;
  return period.partial?quarterToDateLabel22713(code,d):vipQuarterLabel(code);
}

renderVip=function(){
  const isBoss=currentProfile?.role==='boss',myName=currentProfile?.name;
  const period=vipComparisonPeriod();
  if(period.partial&&period.reportDateExact&&!snapshotReady22713(period.baselineTarget)&&!baselinePromise22713){ensureBaseline22713();}
  let clients=getVipClientSummary();if(!isBoss)clients=clients.filter(g=>g.matched&&g.matched.manager_name===myName);clients.sort((a,b)=>b.revenue_cur-a.revenue_cur);

  const periodEl=document.getElementById('vip-period-info');
  if(periodEl){
    if(period.cur){
      const currentLabel=periodLabel22713(period,'cur'),prevLabel=periodLabel22713(period,'prev');
      let operative='';
      if(period.monthComparable)operative='<b>Оперативно год-к-году:</b> '+prevLabel+' → <b>'+currentLabel+'</b>';
      else if(period.partial)operative='<b>Оперативно:</b> '+currentLabel+' <span class="tag" style="background:var(--amb);color:var(--am)">точная база '+prevLabel+' пока не найдена</span>';
      else operative='<b>Оперативно:</b> '+vipMonthLabel(period.prev)+' → <b>'+vipMonthLabel(period.cur)+'</b>'+(period.monthComparable?'':' <span class="tag tag-r">нет данных прошлого года</span>');
      const qText=period.quarterComparable?('<b>Квартал год-к-году:</b> '+quarterLabel22713(period,'prev')+' → '+quarterLabel22713(period,'cur')):'<b>Квартал:</b> точное сравнение появится вместе с базой прошлого года';
      let note='';
      if(period.partial&&!period.reportDateExact)note='Для точного сравнения на ту же дату нужен первый импорт v22.7.13: он сохранит конечную дату отчёта 1С.';
      else if(period.partial&&!period.monthComparable)note=baselineError22713?'Историческая база недоступна: '+esc(baselineError22713):'Импорт автоматически ищет в почте прошлогодний отчёт за эту же дату. Пока его нет, CRM не рисует ложный процент падения.';
      else if(period.partial)note='Сравниваются одинаковые периоды до одной и той же календарной даты — без экстраполяции полного прошлого месяца.';
      periodEl.innerHTML='<div class="card-title">Как считается рост ВИП</div>'
        +'<div style="font-size:13px;line-height:1.65">'+operative+(period.missingCurrent?' <span class="tag tag-r">текущий месяц ещё не загружен</span>':'')+'</div>'
        +'<div style="font-size:12px;color:var(--sub);margin-top:4px">'+qText+'.</div>'
        +(note?'<div style="font-size:12px;color:var(--sub);margin-top:5px">'+note+'</div>':'')
        +'<div style="font-size:12px;color:var(--sub);margin-top:5px">Источник: purchase_history из 1С'+(period.partial?' + исторический MTD-снимок':'')+'. '+(crmImportStatus('sales')?'Последняя успешная загрузка: <b>'+crmDateTime(crmImportStatus('sales').last_success_at)+'</b>.':'')+'</div>';
    }else periodEl.innerHTML='<div class="card-title">Как считается рост ВИП</div><div style="font-size:12px;color:var(--sub)">История продаж ещё не загружена.</div>';
  }

  document.getElementById('vip-empty').style.display=clients.length?'none':'block';
  document.getElementById('vip-empty').textContent=allVipSales.length?'У вас пока нет ВИП-клиентов, привязанных к вашему имени.':'ВИП-отчёт ещё не загружен — нужна разовая заливка таблицы vip_sales.';
  const decliners=clients.filter(g=>g.month_comparable&&g.growth_pct<0).slice().sort((a,b)=>a.growth_pct-b.growth_pct).slice(0,5);
  document.getElementById('vip-decliners-block').style.display=decliners.length?'block':'none';
  document.getElementById('vip-decliners').innerHTML=decliners.map(g=>'<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--border)"><span style="cursor:pointer" onclick="toggleVipCard(\''+escAttr(g.client_name)+'\')">'+g.client_name+(g.matched?' <span class="tag tag-gray">👤 '+g.matched.manager_name+'</span>':'')+'</span><span class="tag tag-r">'+g.growth_pct+'%</span></div>').join('');

  const renderClientCard=(g,cardId)=>{
    const amount=(prev,cur)=>g.month_comparable?(fmt(prev)+' → '+fmt(cur)+' BYN'):(fmt(cur)+' BYN');
    const cats=Object.values(g.categories).sort((a,b)=>b.revenue_cur-a.revenue_cur);
    const catsHtml=cats.map((c,ci)=>{
      const subRowId=cardId+'_c'+ci,subs=Object.values(c.subgroups).sort((a,b)=>b.revenue_cur-a.revenue_cur);
      const subsHtml=subs.map(sg=>{
        const itemsHtml=sg.items.sort((a,b)=>(b.revenue_cur||0)-(a.revenue_cur||0)).map(it=>'<div style="display:flex;justify-content:space-between;padding:5px 0 5px 34px;border-bottom:1px solid var(--border);font-size:12px;color:var(--sub)"><span>'+it.product+'</span><span style="white-space:nowrap;margin-left:10px">'+amount(it.revenue_prev||0,it.revenue_cur||0)+'</span></div>').join('');
        const sgId=subRowId+'_'+sg.subgroup.replace(/[^a-zA-Zа-яА-Я0-9]+/g,'_'),sgDrop=g.month_comparable&&sg.growth_pct<0;
        return '<div style="'+(sgDrop?'background:var(--rb);border-radius:6px;':'')+'"><div style="display:flex;justify-content:space-between;padding:5px 8px 5px 18px;cursor:pointer" onclick="toggleMlCat(\''+sgId+'\',this)"><span style="font-size:12px"><span class="mlcat-arrow" style="display:inline-block;margin-right:6px;font-size:10px">▸</span>'+sg.subgroup+'</span><span style="font-size:12px;color:var(--sub);white-space:nowrap;display:flex;align-items:center;gap:6px">'+amount(sg.revenue_prev,sg.revenue_cur)+(g.month_comparable?vipGrowthTag(sg.growth_pct):'')+'</span></div><div id="'+sgId+'" style="display:none">'+itemsHtml+'</div></div>';
      }).join('');
      const cDrop=g.month_comparable&&c.growth_pct<0;
      return '<div style="border-bottom:1px solid var(--border);'+(cDrop?'background:var(--rb);border-radius:6px;':'')+'"><div style="display:flex;justify-content:space-between;padding:7px 8px 7px 0;cursor:pointer" onclick="toggleMlCat(\''+subRowId+'\',this)"><span style="font-size:13px"><span class="mlcat-arrow" style="display:inline-block;margin-right:6px;font-size:10px">▸</span>'+c.category+'</span><span style="font-size:13px;color:var(--sub);white-space:nowrap;display:flex;align-items:center;gap:6px">'+amount(c.revenue_prev,c.revenue_cur)+(g.month_comparable?vipGrowthTag(c.growth_pct):'')+'</span></div><div id="'+subRowId+'" style="display:none">'+subsHtml+'</div></div>';
    }).join('');
    const p=vipComparisonPeriod(),mLabel=g.month_comparable?(periodLabel22713(p,'prev')+' → '+periodLabel22713(p,'cur')):periodLabel22713(p,'cur');
    const qLabel=g.quarter_comparable?(quarterLabel22713(p,'prev')+': '+fmt(g.quarter_revenue_prev)+' → '+quarterLabel22713(p,'cur')+': '+fmt(g.quarter_revenue_cur)+' BYN'):('Квартал текущего года: '+fmt(g.quarter_revenue_cur)+' BYN · точная база прошлого года ожидается');
    return '<div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer" onclick="toggleVipCard(\''+cardId+'\')"><div><div style="font-size:14px;font-weight:600">'+g.client_name+'</div>'+(g.holding_name&&g.holding_name!==g.client_name?'<div style="font-size:11px;color:var(--sub)">Холдинг: '+g.holding_name+'</div>':'')+(g.matched?'<span class="tag tag-gray" style="margin-top:4px">👤 '+g.matched.manager_name+'</span>':'<span class="tag tag-gray" style="margin-top:4px">не привязан к карточке клиента</span>')+'</div><div style="text-align:right"><div style="font-size:11px;color:var(--sub)">'+mLabel+'</div><div style="font-size:13px;font-weight:600">'+amount(g.revenue_prev,g.revenue_cur)+'</div>'+(g.month_comparable?vipGrowthTag(g.growth_pct):'<span class="tag tag-gray">нет точной базы</span>')+'<div style="font-size:10px;color:var(--sub);margin-top:4px">'+qLabel+'</div></div></div><div id="'+cardId+'" style="display:none;margin-top:12px">'+vipCurrentSalesBlock(g.client_name,g.matched)+catsHtml+promotionVipLinkBlock(g.client_name)+'</div></div>';
  };

  const byDept={};clients.forEach(g=>{(byDept[g.department]=byDept[g.department]||[]).push(g);});const deptNames=Object.keys(byDept).sort((a,b)=>byDept[b].length-byDept[a].length);let gi=0;_vipCardIdByName={};
  document.getElementById('vip-list').innerHTML=deptNames.map(dept=>{const list=byDept[dept],gid='vipdept_'+dept.replace(/[^a-zA-Zа-яА-Я0-9]+/g,'_'),open=vipFoldersOpen.has(gid),cardsHtml=list.map(g=>{const cid='vipcard_'+gi;_vipCardIdByName[g.client_name]=cid;gi++;return renderClientCard(g,cid);}).join('');return '<div class="card" style="margin-bottom:10px"><div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="toggleVipFolder(\''+gid+'\')"><div style="font-size:14px;font-weight:600">📁 '+dept+' <span class="tag tag-gray">'+list.length+' клиент'+(list.length===1?'':list.length<5?'а':'ов')+'</span></div><span style="font-size:13px;color:var(--sub)" id="'+gid+'_arrow">'+(open?'▲':'▼')+'</span></div><div id="'+gid+'" style="display:'+(open?'block':'none')+';margin-top:10px">'+cardsHtml+'</div></div>';}).join('');
};
window.renderVip=renderVip;

window.RESANTA_V22713=Object.freeze({version:VERSION,vipYearOverYear:true,currentMonthSameDate:true,quarterSameDate:true,noProration:true,historicalSnapshotTable:'vip_yoy_snapshots',snapshotRunsTable:'vip_yoy_snapshot_runs',falsePartialDropSuppressed:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 40 ===== */
// ===== v22.7.14: ВИП — текущий месяц идёт к полному уровню того же месяца прошлого года =====
(function(){
'use strict';
const VERSION='v22.7.14';
function ym22714(v){return String(v||'').slice(0,7);}
function prevYearMonth22714(ym){
  if(!/^\d{4}-\d{2}$/.test(String(ym||'')))return null;
  return (Number(String(ym).slice(0,4))-1)+'-'+String(ym).slice(5,7);
}
function targetPct22714(prev,cur){
  prev=Number(prev)||0;cur=Number(cur)||0;
  if(prev<=0)return cur>0?null:0;
  return Math.round(cur/prev*100);
}
function targetTag22714(prev,cur){
  prev=Number(prev)||0;cur=Number(cur)||0;
  if(prev<0)return '<span class="tag tag-gray">возвраты в базе 2025</span>';
  if(prev===0&&cur>0)return '<span class="tag tag-m">новые продажи</span>';
  if(prev===0)return '<span class="tag tag-gray">нет базы 2025</span>';
  const pct=targetPct22714(prev,cur);
  if(pct>=100)return '<span class="tag tag-m">✅ '+pct+'% к 2025</span>';
  return '<span class="tag" style="background:var(--amb);color:var(--am)">🎯 '+pct+'% к 2025</span>';
}
function targetGap22714(prev,cur){return Math.max(0,(Number(prev)||0)-(Number(cur)||0));}
function vipTargetPeriod22714(){
  const months=[...new Set((allPurchaseHistory||[]).map(r=>ym22714(r.month)).filter(m=>/^\d{4}-\d{2}$/.test(m)))].sort();
  const currentMonth=TODAY.slice(0,7);
  if(!months.length)return {prev:null,cur:null,currentMonth,missingCurrent:true,comparable:false,partial:true};
  const cur=months.includes(currentMonth)?currentMonth:months[months.length-1];
  const prev=prevYearMonth22714(cur);
  return {prev,cur,currentMonth,missingCurrent:cur!==currentMonth,comparable:months.includes(prev),partial:cur===currentMonth};
}

vipComparisonPeriod=function(){
  const p=vipTargetPeriod22714();
  return {prev:p.prev,cur:p.cur,partial:p.partial,currentMonth:p.currentMonth,missingCurrent:p.missingCurrent,monthComparable:p.comparable,quarterComparable:false,targetMode:true};
};
window.vipComparisonPeriod=vipComparisonPeriod;

getVipClientSummary=function(){
  const period=vipTargetPeriod22714();
  const growthOf=(prev,cur)=>prev>0?Math.round((cur-prev)/prev*100):(cur>0?100:0);
  return vipMemberDefinitions().map(def=>{
    const matched=vipMatchedClient(def.client_name),rows=vipRowsForMember(def,matched);
    const g={...def,matched,period_prev:period.prev,period_cur:period.cur,period_partial:period.partial,month_comparable:!!period.comparable,target_mode:true,revenue_prev:0,revenue_cur:0,sku_prev:0,sku_cur:0,target_pct:null,target_gap:0,growth_pct:null,categories:{},quarter_revenue_prev:0,quarter_revenue_cur:0};
    const prevSku=new Set(),curSku=new Set();
    rows.forEach(r=>{
      const month=ym22714(r.month);if(month!==period.prev&&month!==period.cur)return;
      const isPrev=month===period.prev,rev=Number(r.revenue)||0,qty=Number(r.qty)||0,cat=r.category||'Без категории',sub=r.subgroup||'Прочее',product=r.product||'Без наименования',sku=String(r.sku||product||'').trim();
      if(isPrev){g.revenue_prev+=rev;if(qty||rev)prevSku.add(sku);}else{g.revenue_cur+=rev;if(qty||rev)curSku.add(sku);}
      if(!g.categories[cat])g.categories[cat]={category:cat,revenue_prev:0,revenue_cur:0,target_pct:null,target_gap:0,growth_pct:null,subgroups:{}};
      const gc=g.categories[cat];if(isPrev)gc.revenue_prev+=rev;else gc.revenue_cur+=rev;
      if(!gc.subgroups[sub])gc.subgroups[sub]={subgroup:sub,revenue_prev:0,revenue_cur:0,target_pct:null,target_gap:0,growth_pct:null,items:{}};
      const gs=gc.subgroups[sub];if(isPrev)gs.revenue_prev+=rev;else gs.revenue_cur+=rev;
      const itemKey=(sku||product)+'|||'+product;
      if(!gs.items[itemKey])gs.items[itemKey]={product,sku,revenue_prev:0,revenue_cur:0,qty_prev:0,qty_cur:0,target_pct:null,target_gap:0,growth_pct:null};
      const it=gs.items[itemKey];if(isPrev){it.revenue_prev+=rev;it.qty_prev+=qty;}else{it.revenue_cur+=rev;it.qty_cur+=qty;}
    });
    g.sku_prev=prevSku.size;g.sku_cur=curSku.size;
    if(period.comparable){
      g.target_pct=targetPct22714(g.revenue_prev,g.revenue_cur);g.target_gap=targetGap22714(g.revenue_prev,g.revenue_cur);
      // В незакрытом месяце это НЕ падение, а прогресс к прошлогоднему уровню.
      // growth_pct оставляем null, чтобы ранний месяц не создавал ложный красный сигнал ВИП.
      g.growth_pct=period.partial?null:growthOf(g.revenue_prev,g.revenue_cur);
    }
    Object.values(g.categories).forEach(gc=>{
      if(period.comparable){gc.target_pct=targetPct22714(gc.revenue_prev,gc.revenue_cur);gc.target_gap=targetGap22714(gc.revenue_prev,gc.revenue_cur);gc.growth_pct=period.partial?null:growthOf(gc.revenue_prev,gc.revenue_cur);}
      Object.values(gc.subgroups).forEach(gs=>{
        gs.items=Object.values(gs.items);
        if(period.comparable){gs.target_pct=targetPct22714(gs.revenue_prev,gs.revenue_cur);gs.target_gap=targetGap22714(gs.revenue_prev,gs.revenue_cur);gs.growth_pct=period.partial?null:growthOf(gs.revenue_prev,gs.revenue_cur);}
        gs.items.forEach(it=>{if(period.comparable){it.target_pct=targetPct22714(it.revenue_prev,it.revenue_cur);it.target_gap=targetGap22714(it.revenue_prev,it.revenue_cur);it.growth_pct=period.partial?null:growthOf(it.revenue_prev,it.revenue_cur);}});
      });
    });
    return g;
  });
};
window.getVipClientSummary=getVipClientSummary;

renderVip=function(){
  const isBoss=currentProfile?.role==='boss',myName=currentProfile?.name,period=vipTargetPeriod22714();
  let clients=getVipClientSummary();if(!isBoss)clients=clients.filter(g=>g.matched&&g.matched.manager_name===myName);clients.sort((a,b)=>b.revenue_cur-a.revenue_cur);
  const periodEl=document.getElementById('vip-period-info');
  if(periodEl){
    if(period.cur){
      const curLabel=vipMonthLabel(period.cur),prevLabel=vipMonthLabel(period.prev),asOf=TODAY.split('-').reverse().join('.');
      periodEl.innerHTML='<div class="card-title">Как считается ВИП</div>'
        +'<div style="font-size:13px;line-height:1.65"><b>Ориентир:</b> полный <b>'+prevLabel+'</b> → текущий <b>'+curLabel+'</b>'+(period.partial?' <span class="tag" style="background:var(--amb);color:var(--am)">факт на '+asOf+'</span>':'')+'</div>'
        +'<div style="font-size:12px;color:var(--sub);margin-top:5px">Процент показывает, сколько менеджер уже сделал от оборота этого же месяца прошлого года. Это <b>не падение</b> в незакрытом месяце, а прогресс к прошлогодней планке.</div>'
        +(!period.comparable?'<div style="font-size:12px;color:var(--r);margin-top:5px">В purchase_history нет данных за '+prevLabel+' — сравнение пока невозможно.</div>':'')
        +'<div style="font-size:12px;color:var(--sub);margin-top:5px">Источник: purchase_history из 1С. '+(crmImportStatus('sales')?'Последняя успешная загрузка: <b>'+crmDateTime(crmImportStatus('sales').last_success_at)+'</b>.':'')+'</div>';
    }else periodEl.innerHTML='<div class="card-title">Как считается ВИП</div><div style="font-size:12px;color:var(--sub)">История продаж ещё не загружена.</div>';
  }
  document.getElementById('vip-empty').style.display=clients.length?'none':'block';
  document.getElementById('vip-empty').textContent=allVipSales.length?'У вас пока нет ВИП-клиентов, привязанных к вашему имени.':'ВИП-отчёт ещё не загружен — нужна разовая заливка таблицы vip_sales.';

  const declBlock=document.getElementById('vip-decliners-block'),declRoot=document.getElementById('vip-decliners');
  const declTitle=declBlock?.querySelector('.card-title');
  if(declTitle)declTitle.textContent='🎯 Больше всего осталось до уровня '+vipMonthLabel(period.prev)+' (топ-5)';
  const targets=clients.filter(g=>g.month_comparable&&(Number(g.revenue_prev)||0)>0&&g.target_gap>0).slice().sort((a,b)=>b.target_gap-a.target_gap).slice(0,5);
  if(declBlock)declBlock.style.display=targets.length?'block':'none';
  if(declRoot)declRoot.innerHTML=targets.map(g=>'<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--border);gap:10px"><span style="cursor:pointer" onclick="toggleVipCard(\''+escAttr(g.client_name)+'\')">'+g.client_name+(g.matched?' <span class="tag tag-gray">👤 '+g.matched.manager_name+'</span>':'')+'</span><span style="display:flex;gap:7px;align-items:center;white-space:nowrap">'+targetTag22714(g.revenue_prev,g.revenue_cur)+'<b style="font-size:11px;color:var(--sub)">осталось '+fmt(g.target_gap)+' BYN</b></span></div>').join('');

  const amount=(prev,cur)=>period.comparable?(fmt(prev)+' → '+fmt(cur)+' BYN'):(fmt(cur)+' BYN');
  const renderClientCard=(g,cardId)=>{
    const cats=Object.values(g.categories).sort((a,b)=>b.revenue_cur-a.revenue_cur);
    const catsHtml=cats.map((c,ci)=>{
      const subRowId=cardId+'_c'+ci,subs=Object.values(c.subgroups).sort((a,b)=>b.revenue_cur-a.revenue_cur);
      const subsHtml=subs.map(sg=>{
        const itemsHtml=sg.items.sort((a,b)=>(b.revenue_cur||0)-(a.revenue_cur||0)).map(it=>'<div style="display:flex;justify-content:space-between;padding:5px 0 5px 34px;border-bottom:1px solid var(--border);font-size:12px;color:var(--sub);gap:10px"><span>'+it.product+'</span><span style="white-space:nowrap">'+amount(it.revenue_prev||0,it.revenue_cur||0)+' '+(period.comparable?targetTag22714(it.revenue_prev,it.revenue_cur):'')+'</span></div>').join('');
        const sgId=subRowId+'_'+sg.subgroup.replace(/[^a-zA-Zа-яА-Я0-9]+/g,'_');
        return '<div><div style="display:flex;justify-content:space-between;padding:5px 8px 5px 18px;cursor:pointer;gap:10px" onclick="toggleMlCat(\''+sgId+'\',this)"><span style="font-size:12px"><span class="mlcat-arrow" style="display:inline-block;margin-right:6px;font-size:10px">▸</span>'+sg.subgroup+'</span><span style="font-size:12px;color:var(--sub);white-space:nowrap;display:flex;align-items:center;gap:6px">'+amount(sg.revenue_prev,sg.revenue_cur)+(period.comparable?targetTag22714(sg.revenue_prev,sg.revenue_cur):'')+'</span></div><div id="'+sgId+'" style="display:none">'+itemsHtml+'</div></div>';
      }).join('');
      return '<div style="border-bottom:1px solid var(--border)"><div style="display:flex;justify-content:space-between;padding:7px 8px 7px 0;cursor:pointer;gap:10px" onclick="toggleMlCat(\''+subRowId+'\',this)"><span style="font-size:13px"><span class="mlcat-arrow" style="display:inline-block;margin-right:6px;font-size:10px">▸</span>'+c.category+'</span><span style="font-size:13px;color:var(--sub);white-space:nowrap;display:flex;align-items:center;gap:6px">'+amount(c.revenue_prev,c.revenue_cur)+(period.comparable?targetTag22714(c.revenue_prev,c.revenue_cur):'')+'</span></div><div id="'+subRowId+'" style="display:none">'+subsHtml+'</div></div>';
    }).join('');
    const mLabel=period.comparable?(vipMonthLabel(period.prev)+' → '+vipMonthLabel(period.cur)+(period.partial?' на '+TODAY.split('-').reverse().join('.'):'')):vipMonthLabel(period.cur);
    const gap=g.month_comparable&&g.revenue_prev>0?'<div style="font-size:10px;color:var(--sub);margin-top:4px">До уровня '+vipMonthLabel(period.prev)+': <b>'+fmt(g.target_gap)+' BYN</b></div>':'';
    return '<div class="card" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;gap:12px" onclick="toggleVipCard(\''+cardId+'\')"><div><div style="font-size:14px;font-weight:600">'+g.client_name+'</div>'+(g.holding_name&&g.holding_name!==g.client_name?'<div style="font-size:11px;color:var(--sub)">Холдинг: '+g.holding_name+'</div>':'')+(g.matched?'<span class="tag tag-gray" style="margin-top:4px">👤 '+g.matched.manager_name+'</span>':'<span class="tag tag-gray" style="margin-top:4px">не привязан к карточке клиента</span>')+'</div><div style="text-align:right"><div style="font-size:11px;color:var(--sub)">'+mLabel+'</div><div style="font-size:13px;font-weight:600">'+amount(g.revenue_prev,g.revenue_cur)+'</div>'+(g.month_comparable?targetTag22714(g.revenue_prev,g.revenue_cur):'<span class="tag tag-gray">нет базы прошлого года</span>')+gap+'</div></div><div id="'+cardId+'" style="display:none;margin-top:12px">'+vipCurrentSalesBlock(g.client_name,g.matched)+catsHtml+promotionVipLinkBlock(g.client_name)+'</div></div>';
  };
  const byDept={};clients.forEach(g=>{(byDept[g.department]=byDept[g.department]||[]).push(g);});const deptNames=Object.keys(byDept).sort((a,b)=>byDept[b].length-byDept[a].length);let gi=0;_vipCardIdByName={};
  document.getElementById('vip-list').innerHTML=deptNames.map(dept=>{const list=byDept[dept],gid='vipdept_'+dept.replace(/[^a-zA-Zа-яА-Я0-9]+/g,'_'),open=vipFoldersOpen.has(gid),cardsHtml=list.map(g=>{const cid='vipcard_'+gi;_vipCardIdByName[g.client_name]=cid;gi++;return renderClientCard(g,cid);}).join('');return '<div class="card" style="margin-bottom:10px"><div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="toggleVipFolder(\''+gid+'\')"><div style="font-size:14px;font-weight:600">📁 '+dept+' <span class="tag tag-gray">'+list.length+' клиент'+(list.length===1?'':list.length<5?'а':'ов')+'</span></div><span style="font-size:13px;color:var(--sub)" id="'+gid+'_arrow">'+(open?'▲':'▼')+'</span></div><div id="'+gid+'" style="display:'+(open?'block':'none')+';margin-top:10px">'+cardsHtml+'</div></div>';}).join('');
};
window.renderVip=renderVip;

window.RESANTA_V22714=Object.freeze({version:VERSION,vipTargetPreviousYearMonth:true,currentMonthToFullPreviousYearMonth:true,quarterRemovedFromVipTargetView:true,partialMonthIsProgressNotDrop:true,noSnapshotRequired:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 41 ===== */
// ===== v22.7.15: ВИП — одно юрлицо/холдинг = одна карточка, продажи всех ТТ суммируются =====
(function(){
'use strict';
const VERSION='v22.7.15.1';

// У ВИП-справочника исторически встречаются невидимые символы, NBSP, смешанные
// кириллица/латиница в «ООО» и служебное «(Головной)». Для юрлица всё это не
// должно создавать вторую карточку.
function vipCleanName22715(value){
  let s=String(value||'');
  try{s=s.normalize('NFKC');}catch(_){ }
  return s
    .replace(/\uFFFD/g,'')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g,'')
    .replace(/\u00A0/g,' ')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g,' ')
    .replace(/[‐‑‒–—―]/g,'-')
    .replace(/\s+/g,' ')
    .trim();
}
function vipLegalName22715(value){
  let s=vipCleanName22715(value);
  // Нормализуем смешанное кириллическое/латинское написание юрформы.
  s=s.replace(/(^|\s)[оo]{3}(?=\s|$|[([{])/giu,'$1ООО');
  s=s.replace(/(^|\s)[оo]д[оo](?=\s|$|[([{])/giu,'$1ОДО');
  // «Головной» — служебная подпись, а не часть названия юрлица. Удаляем её
  // независимо от вида скобок и даже если после неё были невидимые символы.
  s=s.replace(/\s*[([{]\s*головн(?:ой|ая|ое)\s*[)\]}]\s*/giu,' ');
  s=s.replace(/(^|\s)-?\s*головн(?:ой|ая|ое)(?=\s|$)/giu,'$1');
  return s.replace(/\s+/g,' ').trim();
}
function vipEntityKey22715(value){
  const clean=vipLegalName22715(value);
  const norm=normalizeClientName(clean).replace(/ё/g,'е');
  return norm.replace(/[^a-zа-я0-9]/giu,'')||clean.toLowerCase().replace(/\s+/g,'');
}
function vipEntityContains22715(candidate,legal){
  const a=normalizeClientName(vipCleanName22715(candidate));
  const b=normalizeClientName(vipLegalName22715(legal));
  if(!a||!b)return false;
  if(a===b)return true;
  return (' '+a+' ').includes(' '+b+' ');
}

let vipEntityCache22715={sig:'',defs:[]};
function vipDefinitions22715(){
  const src=allVipSales||[];
  const sig=src.length+'|'+src.map(r=>[r.client_name||'',r.holding_name||'',r.department||''].join('~')).join('||');
  if(vipEntityCache22715.sig===sig)return vipEntityCache22715.defs;

  const groups=new Map(),orphans=[];
  src.forEach((r,idx)=>{
    const rawClient=vipCleanName22715(r.client_name);
    if(!rawClient)return;
    const rawHolding=vipCleanName22715(r.holding_name);
    const legalHolding=vipLegalName22715(rawHolding);
    if(!legalHolding){orphans.push({r,idx,rawClient,rawHolding});return;}
    const key=vipEntityKey22715(legalHolding);
    if(!groups.has(key))groups.set(key,{key,client_name:legalHolding,legal_name:legalHolding,holding_name:'',department:r.department||'Без подразделения',member_names:[],source_rows:[],first_idx:idx});
    const g=groups.get(key);
    g.source_rows.push(r);
    [rawClient,r.client_name,rawHolding,legalHolding].forEach(n=>{n=String(n||'').trim();if(n&&!g.member_names.includes(n))g.member_names.push(n);});
    if((!g.department||g.department==='Без подразделения')&&r.department)g.department=r.department;
  });

  // Строки без holding_name присоединяем к уже известному юрлицу, если название
  // явно содержит его полное нормализованное имя. Иначе это самостоятельный ВИП.
  orphans.forEach(({r,idx,rawClient})=>{
    let g=[...groups.values()].find(x=>vipEntityContains22715(rawClient,x.legal_name));
    if(!g){
      const key=vipEntityKey22715(rawClient);
      g=groups.get(key);
      if(!g){g={key,client_name:rawClient,legal_name:rawClient,holding_name:'',department:r.department||'Без подразделения',member_names:[],source_rows:[],first_idx:idx};groups.set(key,g);}
    }
    g.source_rows.push(r);
    [rawClient,r.client_name].forEach(n=>{n=String(n||'').trim();if(n&&!g.member_names.includes(n))g.member_names.push(n);});
    if((!g.department||g.department==='Без подразделения')&&r.department)g.department=r.department;
  });

  // На случай старых битых дублей (например «Домич Строй ООО��») повторно
  // объединяем группы по очищенному каноническому имени.
  const merged=new Map();
  [...groups.values()].sort((a,b)=>a.first_idx-b.first_idx).forEach(g=>{
    const key=vipEntityKey22715(g.legal_name||g.client_name);
    if(!merged.has(key))merged.set(key,{...g,member_names:[...g.member_names],source_rows:[...g.source_rows]});
    else{
      const t=merged.get(key);
      g.member_names.forEach(n=>{if(n&&!t.member_names.includes(n))t.member_names.push(n);});
      t.source_rows.push(...g.source_rows);
      if((!t.department||t.department==='Без подразделения')&&g.department)t.department=g.department;
    }
  });
  const defs=[...merged.values()].map(g=>({
    client_name:vipLegalName22715(g.legal_name||g.client_name),
    legal_name:vipLegalName22715(g.legal_name||g.client_name),
    holding_name:'',
    department:g.department||'Без подразделения',
    member_names:[...new Set(g.member_names.map(vipCleanName22715).filter(Boolean))],
    source_rows:g.source_rows
  }));
  vipEntityCache22715={sig,defs};
  return defs;
}

function vipDefByName22715(name){
  const key=vipEntityKey22715(name);
  return vipDefinitions22715().find(d=>vipEntityKey22715(d.client_name)===key)||null;
}
function vipEntityClients22715(defOrName){
  const def=typeof defOrName==='object'&&defOrName?defOrName:(vipDefByName22715(defOrName)||{client_name:String(defOrName||''),legal_name:String(defOrName||''),member_names:[String(defOrName||'')]});
  const exact=new Set((def.member_names||[]).concat([def.client_name,def.legal_name]).map(vipEntityKey22715).filter(Boolean));
  const legal=def.legal_name||def.client_name;
  return (allClients||[]).filter(c=>{
    const variants=clientNameVariants(c);
    if(variants.some(v=>exact.has(vipEntityKey22715(v))))return true;
    return variants.some(v=>vipEntityContains22715(v,legal));
  });
}
function vipPreferredClient22715(def){
  const clients=vipEntityClients22715(def);
  if(!clients.length)return null;
  const legalKey=vipEntityKey22715(def.legal_name||def.client_name);
  return clients.slice().sort((a,b)=>{
    const ae=vipEntityKey22715(a.name)===legalKey?0:1,be=vipEntityKey22715(b.name)===legalKey?0:1;
    if(ae!==be)return ae-be;
    return normalizeClientName(a.name).length-normalizeClientName(b.name).length;
  })[0];
}

// Переопределяем три базовые функции ВИП. Остальная логика v22.7.14 (август 2025
// как ориентир для августа 2026) остаётся без изменений.
vipMemberDefinitions=function(){return vipDefinitions22715();};
window.vipMemberDefinitions=vipMemberDefinitions;

vipMatchedClient=function(name){
  const def=vipDefByName22715(name)||{client_name:name,legal_name:name,member_names:[name]};
  return vipPreferredClient22715(def);
};
window.vipMatchedClient=vipMatchedClient;

vipRowsForMember=function(def,matched){
  const realDef=(def&&def.member_names)?def:(vipDefByName22715(def?.client_name||matched?.name||'')||def||{});
  const clients=vipEntityClients22715(realDef);
  const groups=[];
  const ids=new Set();
  clients.forEach(c=>{
    if(c?.id)ids.add(String(c.id));
    try{groups.push(getClientHistFast(c));}catch(_){ }
  });
  const legal=realDef.legal_name||realDef.client_name||matched?.name||'';
  const exactNames=new Set((realDef.member_names||[]).concat([legal]).map(vipEntityKey22715).filter(Boolean));
  groups.push((allPurchaseHistory||[]).filter(r=>{
    if(r.client_id&&ids.has(String(r.client_id)))return true;
    const rk=vipEntityKey22715(r.client_name);
    if(rk&&exactNames.has(rk))return true;
    return vipEntityContains22715(r.client_name,legal);
  }));
  return _mergeRowsUnique(groups);
};
window.vipRowsForMember=vipRowsForMember;

// Раскрытый блок «Продажи текущего месяца» тоже должен показывать сумму всего
// юридического лица, а не только случайно найденной головной карточки.
vipCurrentSalesBlock=function(clientName){
  const curMonth=TODAY.slice(0,7),def=vipDefByName22715(clientName)||{client_name:clientName,legal_name:clientName,member_names:[clientName]};
  const rows=vipRowsForMember(def,vipPreferredClient22715(def)).filter(r=>String(r.month||'').startsWith(curMonth));
  if(!rows.length)return '<div style="background:var(--bg);border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:12px;color:var(--sub)">📊 Продаж в этом месяце пока нет</div>';
  const total=rows.reduce((s,r)=>s+(Number(r.revenue)||0),0),byCat={};
  rows.forEach(r=>{const cat=r.category||'Без категории';byCat[cat]=(byCat[cat]||0)+(Number(r.revenue)||0);});
  const cats=Object.keys(byCat).sort((a,b)=>byCat[b]-byCat[a]).slice(0,5),monthNames=['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'],mLabel=monthNames[parseInt(curMonth.slice(5,7),10)-1]+' '+curMonth.slice(0,4);
  return '<div style="background:var(--gb);border-radius:8px;padding:10px 12px;margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><span style="font-size:12px;font-weight:600;color:var(--sub);text-transform:uppercase">📊 Продажи юрлица · '+mLabel+'</span><span style="font-size:14px;font-weight:700;color:var(--g)">'+fmtMoney(total)+' BYN</span></div>'+cats.map(cat=>'<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span style="color:var(--text)">'+esc(cat)+'</span><span style="color:var(--sub)">'+fmtMoney(byCat[cat])+'</span></div>').join('')+'</div>';
};
window.vipCurrentSalesBlock=vipCurrentSalesBlock;

// v22.7.14 уже строит правильные суммы/ориентир. После его рендера добавляем
// прозрачную подпись, сколько CRM-карточек/ТТ вошло в одно юрлицо.
const baseRenderVip22715=window.renderVip;
window.renderVip=function(){
  const out=baseRenderVip22715.apply(this,arguments);
  try{
    const defs=vipDefinitions22715();
    defs.forEach(def=>{
      const cardId=_vipCardIdByName?.[def.client_name];
      const body=cardId?document.getElementById(cardId):null;
      const card=body?.parentElement;
      if(!card)return;
      const clients=vipEntityClients22715(def),count=clients.length;
      if(count<=1)return;
      const head=card.firstElementChild?.firstElementChild;
      if(!head||head.querySelector('.v22715-point-count'))return;
      const d=document.createElement('div');d.className='v22715-point-count';d.style.cssText='font-size:11px;color:var(--sub);margin-top:3px';d.textContent='Торговых точек / карточек в юрлице: '+count;head.appendChild(d);
    });
  }catch(e){console.warn('v22.7.15 VIP entity labels',e);}
  return out;
};
renderVip=window.renderVip;

window.RESANTA_V22715=Object.freeze({version:VERSION,oneLegalEntityOneVipCard:true,holdingAggregation:true,allTradePointsSales:true,corruptNameCleanup:true,unicodeAndHeadOfficeDedup:true,mixedLegalFormDedup:true,deduplicatedPurchaseRows:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 42 ===== */
// ===== v22.7.16: падающие по юрлицу + строгая привязка задачи к маршруту + точные BYN + галерея акций =====
(function(){
'use strict';
const VERSION='v22.7.16';

function cleanName(v){
  let s=String(v||'').replace(/[\u0000-\u001F\u007F-\u009F\uFFFD]/g,' ').replace(/[‐‑‒–—―]/g,'-').replace(/\s+/g,' ').trim();
  if(typeof vipLegalName22715==='function')s=vipLegalName22715(s);
  return s.replace(/\s+/g,' ').trim();
}
function rootName(v){
  let s=cleanName(v).replace(/^\s*(?:тт|торговая\s+точка)\s*[,;:\-]?\s*/iu,'').trim();
  s=s.replace(/\s*[([{]\s*головн(?:ой|ая|ое)\s*[)\]}]\s*/giu,' ').replace(/\s+/g,' ').trim();
  // Хвост в скобках у CRM-карточек — как правило адрес/точка/служебное уточнение,
  // а не новое юридическое лицо: «Витебская строительная база (Витебск, ...)».
  s=s.replace(/\s*\([^)]*\)\s*$/u,'').trim();
  const parts=s.split(',').map(x=>x.trim()).filter(Boolean);
  if(parts.length>1){
    const first=parts[0];
    if(/(?:ООО|ОДО|УП|ЧУП|ЧТУП|ЧПУП|ЧТПУП|ИП|ОАО|ЗАО|УЧП|ЧП)$/iu.test(first))s=first;
    else if(parts.slice(1).some(x=>/(?:Беларус|обл|район|р-н|^г\.?\s|ул\.?|улиц|просп|дом|д\.?\s*\d)/iu.test(x)))s=first;
  }
  const suffix=s.match(/^(.+?\s(?:ООО|ОДО|УП|ЧУП|ЧТУП|ЧПУП|ЧТПУП|ИП|ОАО|ЗАО|УЧП|ЧП))(?=$|[\s,;(])/iu);
  if(suffix&&suffix[1]&&!/^(?:ООО|ОДО|УП|ЧУП|ЧТУП|ЧПУП|ЧТПУП|ИП|ОАО|ЗАО|УЧП|ЧП)$/iu.test(suffix[1].trim()))s=suffix[1].trim();
  return s.replace(/\s+/g,' ').trim();
}
function entityKey(v){
  const root=rootName(v);return (typeof canonicalSalesClientName==='function'?canonicalSalesClientName(root):normalizeClientName(root).replace(/[^a-zа-я0-9]/giu,''))||root.toLowerCase().replace(/\s+/g,'');
}
let entityCache22716={src:null,sig:'',groups:[],byId:new Map()};
function entityGroups(){
  const src=allClients||[];
  const sig=src.length+'|'+src.map(c=>String(c.id||'')+'~'+String(c.name||'')+'~'+String(c.manager_name||'')).join('||');
  if(entityCache22716.src===src&&entityCache22716.sig===sig)return entityCache22716.groups;
  const map=new Map();
  src.filter(c=>!(typeof clientIsArchived==='function'&&clientIsArchived(c))).forEach((c,idx)=>{
    const variants=typeof clientNameVariants==='function'?clientNameVariants(c):[c.name];
    const keys=variants.map(entityKey).filter(Boolean),key=entityKey(c.name)||keys[0]||('id:'+c.id);
    // Если одна из алиасных форм совпадает с уже созданным юрлицом — присоединяемся к нему.
    let g=map.get(key);if(!g){const existing=[...map.values()].find(x=>keys.some(k=>x.keys.has(k)));if(existing)g=existing;}
    if(!g){g={key,keys:new Set(keys.concat(key)),members:[],first:idx};map.set(key,g);}else keys.forEach(k=>g.keys.add(k));
    g.members.push(c);
  });
  // Второй проход: ТТ могут встретиться раньше головной карточки. Склеиваем группы по общему ключу.
  const groups=[...new Set(map.values())],merged=[];
  groups.forEach(g=>{
    let t=merged.find(x=>[...g.keys].some(k=>x.keys.has(k)));
    if(!t){t={key:g.key,keys:new Set(g.keys),members:[...g.members],first:g.first};merged.push(t);}
    else{g.keys.forEach(k=>t.keys.add(k));g.members.forEach(c=>{if(!t.members.some(x=>String(x.id)===String(c.id)))t.members.push(c);});t.first=Math.min(t.first,g.first);}
  });
  merged.forEach(g=>{
    const key=g.key;
    g.members.sort((a,b)=>{
      const ah=/головн/iu.test(String(a.name||''))?0:1,bh=/головн/iu.test(String(b.name||''))?0:1;if(ah!==bh)return ah-bh;
      const ar=entityKey(a.name)===key?0:1,br=entityKey(b.name)===key?0:1;if(ar!==br)return ar-br;
      const at=/^\s*тт\b/iu.test(String(a.name||''))?1:0,bt=/^\s*тт\b/iu.test(String(b.name||''))?1:0;if(at!==bt)return at-bt;
      return String(a.name||'').length-String(b.name||'').length;
    });
    g.client=g.members[0]||null;g.ids=new Set(g.members.map(c=>String(c.id)).filter(Boolean));
    g.managerNames=new Set(g.members.map(c=>c.manager_name).filter(Boolean));
    g.keys.add(entityKey(g.client?.name||''));
  });
  const result=merged.filter(g=>g.client),byId=new Map();result.forEach(g=>g.ids.forEach(id=>byId.set(String(id),g)));
  entityCache22716={src,sig,groups:result,byId};return result;
}
function groupForClient(c){
  const id=String(c?.id||''),key=entityKey(c?.name||''),groups=entityGroups();
  if(id&&entityCache22716.byId.has(id))return entityCache22716.byId.get(id);
  return groups.find(g=>g.keys.has(key))||{client:c,members:[c],ids:new Set(id?[id]:[]),keys:new Set(key?[key]:[]),managerNames:new Set(c?.manager_name?[c.manager_name]:[])};
}
let histIndex22716={src:null,byName:new Map(),byId:new Map()};
function historyIndex(){
  const src=allPurchaseHistory||[];if(histIndex22716.src===src)return histIndex22716;
  const byName=new Map(),byId=new Map();
  src.forEach(r=>{const k=entityKey(r.client_name);if(k){if(!byName.has(k))byName.set(k,[]);byName.get(k).push(r);}const id=String(r.client_id||'');if(id){if(!byId.has(id))byId.set(id,[]);byId.get(id).push(r);}});
  histIndex22716={src,byName,byId};return histIndex22716;
}
function histForGroup(group){
  if(!group)return[];const lists=[],idx=historyIndex();
  (group.members||[]).forEach(c=>{try{lists.push(getClientHistFast(c));}catch(_){}});
  group.ids?.forEach(id=>{if(idx.byId.has(String(id)))lists.push(idx.byId.get(String(id)));});
  group.keys?.forEach(k=>{if(idx.byName.has(k))lists.push(idx.byName.get(k));});
  return _mergeRowsUnique(lists);
}
function histForClient(c){return histForGroup(groupForClient(c));}
window.v22716FallingHist=histForClient;

function breakdown(c,currentMonths,previousMonths){
  const hist=histForClient(c),curSet=new Set(currentMonths),prevSet=new Set(previousMonths),cat=new Map(),products=new Map();
  const addCat=(r,side)=>{const k=String(r.category||'Без группы').trim();if(!cat.has(k))cat.set(k,{name:k,cur:0,prev:0});cat.get(k)[side]+=Number(r.revenue)||0;};
  const addProd=(r,side)=>{const g=abcCanonicalGroup(r.category)||String(r.category||'Без группы').trim(),k=g+'|'+abcSkuKey(r,g);if(!products.has(k))products.set(k,{key:k,group:g,label:v20ProductLabel(r,g),cur:0,prev:0,abc:''});products.get(k)[side]+=Number(r.revenue)||0;};
  hist.forEach(r=>{const m=String(r.month||'').slice(0,7);if(curSet.has(m)){addCat(r,'cur');addProd(r,'cur');}if(prevSet.has(m)){addCat(r,'prev');addProd(r,'prev');}});
  try{
    const abcRows=hist.filter(r=>prevSet.has(String(r.month||'').slice(0,7))).map(r=>({...r,_abcGroup:abcCanonicalGroup(r.category)})).filter(r=>r._abcGroup);
    abcAggregate(abcRows).forEach(g=>g.items.forEach(x=>{const p=products.get(g.group+'|'+x.key);if(p)p.abc=x.class;}));
  }catch(e){console.warn('v22.7.16 ABC юрлица',e);}
  const cats=[...cat.values()].map(x=>({...x,loss:x.prev-x.cur})).filter(x=>x.prev>0&&x.loss>0.01).sort((a,b)=>b.loss-a.loss);
  const items=[...products.values()].map(x=>({...x,loss:x.prev-x.cur})).filter(x=>x.prev>0&&x.loss>0.01).sort((a,b)=>b.loss-a.loss);
  return {cats,items};
}
window.v20LostBreakdown=breakdown;v20LostBreakdown=breakdown;

function activeTaskForGroup(g){
  return (allTasks||[]).find(t=>{if(t.done||t.review_status==='rejected')return false;if(t.client_id&&g.ids.has(String(t.client_id)))return true;const k=entityKey(t.client_name);return !!(k&&g.keys.has(k));})||null;
}
function lastVisitForGroup(g){
  const rows=(allVisits||[]).filter(v=>{if(v.client_id&&g.ids.has(String(v.client_id)))return true;const k=entityKey(v.client_name);return !!(k&&g.keys.has(k));});
  return sortVisitsDesc(rows)[0]||null;
}
function compute(){
  const period=v20FallingPeriod(),boss=currentProfile?.role==='boss',me=currentProfile?.name||'',mgr=document.getElementById('falling-manager')?.value||'all',rows=[];
  entityGroups().forEach(g=>{
    const visible=boss?(mgr==='all'||g.managerNames.has(mgr)):g.managerNames.has(me);if(!visible)return;
    const hist=histForGroup(g),curSet=new Set(period.current),prevSet=new Set(period.previous);let cur=0,prev=0,last='';
    hist.forEach(r=>{const m=String(r.month||'').slice(0,7),rev=Number(r.revenue)||0;if(curSet.has(m)){cur+=rev;if(rev>0&&m>last)last=m;}if(prevSet.has(m))prev+=rev;});
    // В активном списке остаётся только реальное падение. Равенство/рост исчезают автоматически.
    if(prev<=0||cur>=prev-0.01)return;
    const c=g.client,loss=prev-cur,pct=loss/prev*100;
    rows.push({client:c,entity:g,cur,prev,loss,pct,severity:v20Severity(pct),breakdown:breakdown(c,period.current,period.previous),lastSale:last,task:activeTaskForGroup(g),visit:lastVisitForGroup(g)});
  });
  rows.sort((a,b)=>b.loss-a.loss||b.pct-a.pct);v20FallingRows=rows;return{period,rows};
}
window.v20ComputeFalling=compute;v20ComputeFalling=compute;

function routeMatchesGroup(r,g){
  if(!r||!g)return false;
  if(r.client_id&&g.ids.has(String(r.client_id)))return true;
  const linked=Array.isArray(r.linked_client_ids)?r.linked_client_ids.map(String):[];if(linked.some(id=>g.ids.has(id)))return true;
  const names=[];if(r.client_name)names.push(r.client_name);if(Array.isArray(r.linked_client_names))names.push(...r.linked_client_names);
  return names.some(name=>{const k=entityKey(name);return !!(k&&g.keys.has(k));});
}
window.v22716FutureRoute=function(c){
  const g=groupForClient(c),manager=c?.manager_name||g.client?.manager_name||'';
  return (allRoutePlans||[]).filter(r=>{
    if(r.removed||String(r.visit_date||'').slice(0,10)<TODAY)return false;
    if(!(r.approved===true||r.review_status==='approved'))return false;
    if(manager&&r.manager_name&&!managerLooseMatch(r.manager_name,manager))return false;
    return routeMatchesGroup(r,g);
  }).sort((a,b)=>String(a.visit_date||'').localeCompare(String(b.visit_date||'')))[0]||null;
};

window.promoPhotoFilePick22716=function(kind){
  const gallery=document.getElementById('promotion-photo-file'),camera=document.getElementById('promotion-photo-camera'),label=document.getElementById('promotion-photo-selected');
  const chosen=kind==='camera'?camera:gallery,other=kind==='camera'?gallery:camera;if(other)other.value='';
  const file=chosen?.files?.[0];if(label)label.textContent=file?'Выбрано: '+file.name:'Файл не выбран';
};

// После любой фоновой подгрузки продаж пересчёт использует новую агрегацию автоматически.
try{if(document.getElementById('page-falling')?.classList.contains('active'))renderFallingClients();}catch(_){ }
window.RESANTA_V22716=Object.freeze({version:VERSION,fallingByLegalEntity:true,allTradePointsAndAliases:true,exactByKopecks:true,fallingTaskRouteOnly:true,approvedRouteOnly:true,noSevenDayFallback:true,promotionCameraAndGallery:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 43 ===== */
// ===== v22.7.17: единый корень юрлица для ВИП/падающих + строгий маршрут + свежая 1С =====
(function(){
'use strict';
const VERSION='v22.7.17';
const LEGAL_FORMS=['ООО','ОДО','УП','ЧУП','ЧТУП','ЧПУП','ЧТПУП','ИП','ОАО','ЗАО','УЧП','ЧП'];
const LEGAL_RE='(?:'+LEGAL_FORMS.join('|')+')';

function c22717(v){
  let s=String(v||'');
  try{s=s.normalize('NFKC');}catch(_){ }
  s=s.replace(/\uFFFD/g,'').replace(/[\u200B-\u200D\u2060\uFEFF]/g,'').replace(/\u00A0/g,' ')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g,' ').replace(/[‐‑‒–—―]/g,'-').replace(/\s+/g,' ').trim();
  s=s.replace(/(^|[\s,;:])[оo0]{3}(?=$|[\s,;:()\[\]{}])/giu,'$1ООО');
  s=s.replace(/(^|[\s,;:])[оo0]д[оo0](?=$|[\s,;:()\[\]{}])/giu,'$1ОДО');
  return s;
}
function form22717(v){const m=c22717(v).match(new RegExp('(?:^|\\s)('+LEGAL_RE+')(?:$|\\s|[,;:()\\[\\]{}])','iu'));return m?String(m[1]).toUpperCase():'';}
function root22717(v){
  let s=c22717(v);
  s=s.replace(/^\s*(?:тт|торговая\s+точка)\s*[,;:\-]?\s*/iu,'').trim();
  s=s.replace(/\s*[([{]\s*головн(?:ой|ая|ое)\s*[)\]}]\s*/giu,' ').replace(/(^|\s)-?\s*головн(?:ой|ая|ое)(?=\s|$)/giu,'$1').replace(/\s+/g,' ').trim();
  const suffix=s.match(new RegExp('^(.+?\\s'+LEGAL_RE+')(?=$|[\\s,;(])','iu'));
  if(suffix&&suffix[1])return suffix[1].replace(/\s+/g,' ').trim();
  s=s.replace(/\s*\([^)]*(?:обл|район|р-н|г\.?\s|ул\.?|улиц|просп|дом|д\.?\s*\d|Беларус)[^)]*\)\s*$/iu,'').trim();
  const parts=s.split(',').map(x=>x.trim()).filter(Boolean);
  if(parts.length>1&&parts.slice(1).some(x=>/(?:Беларус|обл|район|р-н|^г\.?\s|ул\.?|улиц|просп|дом|д\.?\s*\d)/iu.test(x)))s=parts[0];
  return s.replace(/\s+/g,' ').trim();
}
function key22717(v){
  const r=root22717(v);if(!r)return'';
  const n=(typeof normalizeClientName==='function'?normalizeClientName(r):r.toLowerCase()).replace(/ё/g,'е');
  return n.replace(/[^a-zа-я0-9]/giu,'');
}
function lev22717(a,b,max){
  a=String(a||'');b=String(b||'');if(a===b)return 0;if(Math.abs(a.length-b.length)>max)return max+1;
  let prev=Array.from({length:b.length+1},(_,i)=>i),cur=new Array(b.length+1);
  for(let i=1;i<=a.length;i++){
    cur[0]=i;let rowMin=cur[0];
    for(let j=1;j<=b.length;j++){
      const cost=a[i-1]===b[j-1]?0:1;
      cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+cost);rowMin=Math.min(rowMin,cur[j]);
    }
    if(rowMin>max)return max+1;const t=prev;prev=cur;cur=t;
  }
  return prev[b.length];
}
function near22717(aName,bName){
  const a=key22717(aName),b=key22717(bName);if(!a||!b)return false;if(a===b)return true;
  const fa=form22717(aName),fb=form22717(bName);if(fa&&fb&&fa!==fb)return false;
  const min=Math.min(a.length,b.length),max=Math.max(a.length,b.length);if(min<8)return false;
  if(Math.abs(a.length-b.length)<=1&&lev22717(a,b,1)<=1)return true;
  if(min>=18&&Math.abs(a.length-b.length)<=2&&a.slice(0,6)===b.slice(0,6)&&lev22717(a,b,2)<=2)return true;
  return false;
}
function uniqueRows22717(groups){return typeof _mergeRowsUnique==='function'?_mergeRowsUnique(groups):(()=>{const out=[],seen=new Set();(groups||[]).flat().forEach(r=>{const k=r.id||[r.client_name,r.month,r.category,r.subgroup,r.product,r.sku,r.qty,r.revenue].join('|');if(!seen.has(k)){seen.add(k);out.push(r);}});return out;})();}
function clientVariants22717(c){try{return clientNameVariants(c);}catch(_){return [c?.name||''];}}

// ---------- ВИП: одна карточка на одно юрлицо, включая опечатки в 1 символ ----------
let vipCache22717={sig:'',defs:[]};
function vipDefs22717(){
  const src=allVipSales||[],sig=src.length+'|'+src.map(r=>[r.client_name||'',r.holding_name||'',r.department||''].join('~')).join('||');
  if(vipCache22717.sig===sig)return vipCache22717.defs;
  const nodes=src.map((r,i)=>{
    const names=[r.holding_name,r.client_name].filter(Boolean).map(c22717),roots=names.map(root22717).filter(Boolean),keys=new Set(roots.map(key22717).filter(Boolean));
    return {i,r,names,roots,keys,primary:root22717(r.holding_name||r.client_name),department:r.department||'Без подразделения'};
  }).filter(x=>x.primary);
  const p=nodes.map((_,i)=>i);const find=i=>p[i]===i?i:(p[i]=find(p[i]));const union=(a,b)=>{a=find(a);b=find(b);if(a!==b)p[b]=a;};
  const first=new Map();nodes.forEach((n,i)=>n.keys.forEach(k=>{if(first.has(k))union(i,first.get(k));else first.set(k,i);}));
  const buckets=new Map();nodes.forEach((n,i)=>{const k=key22717(n.primary),b=k.slice(0,6);if(!buckets.has(b))buckets.set(b,[]);buckets.get(b).push(i);});
  buckets.forEach(ids=>{for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++){const x=nodes[ids[a]],y=nodes[ids[b]];if(near22717(x.primary,y.primary))union(ids[a],ids[b]);}});
  const groups=new Map();nodes.forEach((n,i)=>{const r=find(i);if(!groups.has(r))groups.set(r,{nodes:[],names:new Set(),keys:new Set(),roots:[],department:n.department});const g=groups.get(r);g.nodes.push(n);n.names.forEach(x=>g.names.add(x));n.roots.forEach(x=>{g.roots.push(x);const k=key22717(x);if(k)g.keys.add(k);});if((!g.department||g.department==='Без подразделения')&&n.department)g.department=n.department;});
  const defs=[...groups.values()].map(g=>{
    const freq=new Map();g.roots.forEach(x=>{const k=key22717(x);freq.set(k,(freq.get(k)||0)+1);});
    const roots=[...new Set(g.roots.map(root22717).filter(Boolean))];
    roots.sort((a,b)=>{
      const ka=key22717(a),kb=key22717(b),fa=freq.get(ka)||0,fb=freq.get(kb)||0;if(fa!==fb)return fb-fa;
      const aa=/^\s*(?:тт|торговая\s+точка)\b/iu.test(a)?1:0,bb=/^\s*(?:тт|торговая\s+точка)\b/iu.test(b)?1:0;if(aa!==bb)return aa-bb;
      const af=form22717(a)?0:1,bf=form22717(b)?0:1;if(af!==bf)return af-bf;return b.length-a.length;
    });
    const legal=root22717(roots[0]||[...g.names][0]||'');const keys=new Set(g.keys);const lk=key22717(legal);if(lk)keys.add(lk);
    return {client_name:legal,legal_name:legal,holding_name:'',department:g.department||'Без подразделения',member_names:[...g.names],_v22717_keys:[...keys],source_rows:g.nodes.map(n=>n.r)};
  });
  vipCache22717={sig,defs};return defs;
}
function vipDef22717(name){const k=key22717(name);return vipDefs22717().find(d=>d._v22717_keys.includes(k)||near22717(d.client_name,name))||null;}
function vipClients22717(defOrName){
  const d=typeof defOrName==='object'&&defOrName?defOrName:(vipDef22717(defOrName)||{client_name:String(defOrName||''),member_names:[String(defOrName||'')],_v22717_keys:[key22717(defOrName)]});
  const keys=new Set((d._v22717_keys||[]).concat((d.member_names||[]).map(key22717)).filter(Boolean));
  return (allClients||[]).filter(c=>clientVariants22717(c).some(v=>{const k=key22717(v);if(k&&keys.has(k))return true;return near22717(v,d.client_name);}));
}
function vipPreferred22717(def){
  const rows=vipClients22717(def);if(!rows.length)return null;const target=key22717(def.client_name);
  return rows.slice().sort((a,b)=>{const ah=/головн/iu.test(a.name||'')?0:1,bh=/головн/iu.test(b.name||'')?0:1;if(ah!==bh)return ah-bh;const ae=key22717(a.name)===target?0:1,be=key22717(b.name)===target?0:1;if(ae!==be)return ae-be;const at=/^\s*тт\b/iu.test(a.name||'')?1:0,bt=/^\s*тт\b/iu.test(b.name||'')?1:0;if(at!==bt)return at-bt;return String(a.name||'').length-String(b.name||'').length;})[0];
}
function vipRows22717(def,matched){
  const d=(def&&def._v22717_keys)?def:(vipDef22717(def?.client_name||matched?.name||'')||def||{}),clients=vipClients22717(d),ids=new Set(clients.map(c=>String(c.id||'')).filter(Boolean)),keys=new Set((d._v22717_keys||[]).concat((d.member_names||[]).map(key22717)).filter(Boolean)),lists=[];
  clients.forEach(c=>{try{lists.push(getClientHistFast(c));}catch(_){ }});
  lists.push((allPurchaseHistory||[]).filter(r=>{if(r.client_id&&ids.has(String(r.client_id)))return true;const k=key22717(r.client_name);if(k&&keys.has(k))return true;return near22717(r.client_name,d.client_name);}));
  return uniqueRows22717(lists);
}
vipMemberDefinitions=function(){return vipDefs22717();};window.vipMemberDefinitions=vipMemberDefinitions;
vipMatchedClient=function(name){const d=vipDef22717(name)||{client_name:name,member_names:[name],_v22717_keys:[key22717(name)]};return vipPreferred22717(d);};window.vipMatchedClient=vipMatchedClient;
vipRowsForMember=function(def,matched){return vipRows22717(def,matched);};window.vipRowsForMember=vipRowsForMember;

// Финальная страховка: даже если старый справочник содержит две почти одинаковые строки,
// на экран выходит только одна карточка юридического лица.
const summaryBase22717=window.getVipClientSummary;
window.getVipClientSummary=function(){
  const rows=summaryBase22717();const out=[];
  rows.forEach(g=>{let hit=out.find(x=>key22717(x.client_name)===key22717(g.client_name)||((x.department===g.department)&&near22717(x.client_name,g.client_name)));if(!hit){out.push(g);return;}const hs=Math.abs(Number(hit.revenue_prev)||0)+Math.abs(Number(hit.revenue_cur)||0),gs=Math.abs(Number(g.revenue_prev)||0)+Math.abs(Number(g.revenue_cur)||0);if(gs>hs){const i=out.indexOf(hit);out[i]=g;}});
  return out;
};getVipClientSummary=window.getVipClientSummary;

// ---------- Падающие: одно юрлицо + вся история всех ТТ/алиасов ----------
let fallCache22717={clients:null,aliases:null,history:null,groups:[],byId:new Map(),histByGroup:new Map(),histIndex:null};
function reset22717(){vipCache22717={sig:'',defs:[]};fallCache22717={clients:null,aliases:null,history:null,groups:[],byId:new Map(),histByGroup:new Map(),histIndex:null};}
function fallingGroups22717(){
  if(fallCache22717.clients===allClients&&fallCache22717.aliases===allClientAliases&&fallCache22717.groups.length)return fallCache22717.groups;
  const cs=(allClients||[]).filter(c=>!(typeof clientIsArchived==='function'&&clientIsArchived(c))),nodes=cs.map((c,i)=>{const vars=clientVariants22717(c),roots=vars.map(root22717).filter(Boolean),keys=new Set(roots.map(key22717).filter(Boolean));return {c,i,vars,roots,keys,primary:root22717(c.name),manager:c.manager_name||'',region:c.region||''};});
  const p=nodes.map((_,i)=>i);const find=i=>p[i]===i?i:(p[i]=find(p[i]));const union=(a,b)=>{a=find(a);b=find(b);if(a!==b)p[b]=a;};const first=new Map();
  nodes.forEach((n,i)=>n.keys.forEach(k=>{if(first.has(k))union(i,first.get(k));else first.set(k,i);}));
  const buckets=new Map();nodes.forEach((n,i)=>{const k=key22717(n.primary),b=(n.manager||'')+'|'+k.slice(0,6);if(!buckets.has(b))buckets.set(b,[]);buckets.get(b).push(i);});
  buckets.forEach(ids=>{for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++){const x=nodes[ids[a]],y=nodes[ids[b]];if(near22717(x.primary,y.primary))union(ids[a],ids[b]);}});
  const gm=new Map();nodes.forEach((n,i)=>{const r=find(i);if(!gm.has(r))gm.set(r,{members:[],ids:new Set(),keys:new Set(),names:new Set(),managerNames:new Set(),roots:[]});const g=gm.get(r);g.members.push(n.c);g.ids.add(String(n.c.id));n.keys.forEach(k=>g.keys.add(k));n.vars.forEach(v=>g.names.add(v));n.roots.forEach(v=>g.roots.push(v));if(n.manager)g.managerNames.add(n.manager);});
  const groups=[...gm.values()].map(g=>{g.members.sort((a,b)=>{const ah=/головн/iu.test(a.name||'')?0:1,bh=/головн/iu.test(b.name||'')?0:1;if(ah!==bh)return ah-bh;const at=/^\s*тт\b/iu.test(a.name||'')?1:0,bt=/^\s*тт\b/iu.test(b.name||'')?1:0;if(at!==bt)return at-bt;return String(a.name||'').length-String(b.name||'').length;});g.client=g.members[0];g.primary=root22717(g.client?.name||g.roots[0]||'');g.key=key22717(g.primary);if(g.key)g.keys.add(g.key);return g;});
  const byId=new Map();groups.forEach(g=>g.ids.forEach(id=>byId.set(String(id),g)));fallCache22717={...fallCache22717,clients:allClients,aliases:allClientAliases,groups,byId,histByGroup:new Map(),histIndex:null};return groups;
}
function groupFor22717(c){const groups=fallingGroups22717(),id=String(c?.id||'');if(id&&fallCache22717.byId.has(id))return fallCache22717.byId.get(id);const k=key22717(c?.name);return groups.find(g=>g.keys.has(k)||near22717(g.primary,c?.name||''))||{client:c,members:[c],ids:new Set(id?[id]:[]),keys:new Set(k?[k]:[]),names:new Set([c?.name||'']),managerNames:new Set(c?.manager_name?[c.manager_name]:[]),primary:root22717(c?.name)};}
function histIndex22717(){
  if(fallCache22717.history===allPurchaseHistory&&fallCache22717.histIndex)return fallCache22717.histIndex;
  const byId=new Map(),byKey=new Map(),keyNames=new Map();(allPurchaseHistory||[]).forEach(r=>{const id=String(r.client_id||'');if(id){if(!byId.has(id))byId.set(id,[]);byId.get(id).push(r);}const k=key22717(r.client_name);if(k){if(!byKey.has(k))byKey.set(k,[]);byKey.get(k).push(r);if(!keyNames.has(k))keyNames.set(k,r.client_name||'');}});
  const idx={byId,byKey,keyNames,keys:[...byKey.keys()]};fallCache22717.history=allPurchaseHistory;fallCache22717.histIndex=idx;fallCache22717.histByGroup=new Map();return idx;
}
function histGroup22717(g){
  const idx=histIndex22717(),cacheKey=[...g.ids].sort().join(',')+'|'+[...g.keys].sort().join(',');if(fallCache22717.histByGroup.has(cacheKey))return fallCache22717.histByGroup.get(cacheKey);
  const lists=[];g.members.forEach(c=>{try{lists.push(getClientHistFast(c));}catch(_){ }});g.ids.forEach(id=>{if(idx.byId.has(String(id)))lists.push(idx.byId.get(String(id)));});g.keys.forEach(k=>{if(idx.byKey.has(k))lists.push(idx.byKey.get(k));});
  const prefixes=new Set([...g.keys].map(k=>k.slice(0,6)).filter(Boolean));idx.keys.forEach(k=>{if(!prefixes.has(k.slice(0,6))||g.keys.has(k))return;const nm=idx.keyNames.get(k)||k;if(near22717(g.primary,nm))lists.push(idx.byKey.get(k));});
  const rows=uniqueRows22717(lists);fallCache22717.histByGroup.set(cacheKey,rows);return rows;
}
window.v22717FallingHist=function(c){return histGroup22717(groupFor22717(c));};window.v22716FallingHist=window.v22717FallingHist;
function breakdown22717(c,currentMonths,previousMonths){
  const hist=window.v22717FallingHist(c),curSet=new Set(currentMonths),prevSet=new Set(previousMonths),cat=new Map(),products=new Map();
  const addCat=(r,side)=>{const k=String(r.category||'Без группы').trim();if(!cat.has(k))cat.set(k,{name:k,cur:0,prev:0});cat.get(k)[side]+=Number(r.revenue)||0;};
  const addProd=(r,side)=>{const gr=abcCanonicalGroup(r.category)||String(r.category||'Без группы').trim(),k=gr+'|'+abcSkuKey(r,gr);if(!products.has(k))products.set(k,{key:k,group:gr,label:v20ProductLabel(r,gr),cur:0,prev:0,abc:''});products.get(k)[side]+=Number(r.revenue)||0;};
  hist.forEach(r=>{const m=String(r.month||'').slice(0,7);if(curSet.has(m)){addCat(r,'cur');addProd(r,'cur');}if(prevSet.has(m)){addCat(r,'prev');addProd(r,'prev');}});
  try{const abcRows=hist.filter(r=>prevSet.has(String(r.month||'').slice(0,7))).map(r=>({...r,_abcGroup:abcCanonicalGroup(r.category)})).filter(r=>r._abcGroup);abcAggregate(abcRows).forEach(gr=>gr.items.forEach(x=>{const p=products.get(gr.group+'|'+x.key);if(p)p.abc=x.class;}));}catch(e){console.warn(VERSION+' ABC',e);}
  return {cats:[...cat.values()].map(x=>({...x,loss:x.prev-x.cur})).filter(x=>x.prev>0&&x.loss>0.01).sort((a,b)=>b.loss-a.loss),items:[...products.values()].map(x=>({...x,loss:x.prev-x.cur})).filter(x=>x.prev>0&&x.loss>0.01).sort((a,b)=>b.loss-a.loss)};
}
v20LostBreakdown=breakdown22717;window.v20LostBreakdown=v20LostBreakdown;
function taskForGroup22717(g){return (allTasks||[]).find(t=>{if(t.done||t.review_status==='rejected')return false;if(t.client_id&&g.ids.has(String(t.client_id)))return true;const k=key22717(t.client_name);return !!(k&&(g.keys.has(k)||near22717(g.primary,t.client_name||'')));})||null;}
function visitForGroup22717(g){const rows=(allVisits||[]).filter(v=>{if(v.client_id&&g.ids.has(String(v.client_id)))return true;const k=key22717(v.client_name);return !!(k&&(g.keys.has(k)||near22717(g.primary,v.client_name||'')));});return sortVisitsDesc(rows)[0]||null;}
function compute22717(){
  const period=v20FallingPeriod(),boss=currentProfile?.role==='boss',me=currentProfile?.name||'',mgr=document.getElementById('falling-manager')?.value||'all',rows=[];
  fallingGroups22717().forEach(g=>{const visible=boss?(mgr==='all'||g.managerNames.has(mgr)):g.managerNames.has(me);if(!visible)return;const hist=histGroup22717(g),curSet=new Set(period.current),prevSet=new Set(period.previous);let cur=0,prev=0,last='';hist.forEach(r=>{const m=String(r.month||'').slice(0,7),rev=Number(r.revenue)||0;if(curSet.has(m)){cur+=rev;if(rev>0&&m>last)last=m;}if(prevSet.has(m))prev+=rev;});if(prev<=0||cur>=prev-0.005)return;const c=g.client,loss=prev-cur,pct=loss/prev*100;rows.push({client:c,entity:g,cur,prev,loss,pct,severity:v20Severity(pct),breakdown:breakdown22717(c,period.current,period.previous),lastSale:last,task:taskForGroup22717(g),visit:visitForGroup22717(g)});});
  rows.sort((a,b)=>b.loss-a.loss||b.pct-a.pct);v20FallingRows=rows;return{period,rows};
}
v20ComputeFalling=compute22717;window.v20ComputeFalling=v20ComputeFalling;
v20Money=function(v){return (Number(v)||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';};window.v20Money=v20Money;

// Точная сумма до копейки даже поверх старых HTML-обёрток карточки.
const cardBase22717=window.v20FallingCard;
window.v20FallingCard=function(x){
  let html=cardBase22717(x),cur=fmtMoney(x.cur),prev=fmtMoney(x.prev),loss=fmtMoney(x.loss)+' BYN';
  html=html.replace(/(<div class="v20-money-bad">−)[^<]*(<\/div>)/,'$1'+loss+'$2');
  html=html.replace(/(<div class="kpi-label">Текущий период<\/div><div class="kpi-value"[^>]*>)[^<]*(<\/div>)/,'$1'+cur+'$2');
  html=html.replace(/(<div class="kpi-label">Прошлый год<\/div><div class="kpi-value"[^>]*>)[^<]*(<\/div>)/,'$1'+prev+'$2');
  return html;
};v20FallingCard=window.v20FallingCard;

function routeMatch22717(r,g){if(!r||!g)return false;if(r.client_id&&g.ids.has(String(r.client_id)))return true;const linked=Array.isArray(r.linked_client_ids)?r.linked_client_ids.map(String):[];if(linked.some(id=>g.ids.has(id)))return true;const names=[r.client_name,...(Array.isArray(r.linked_client_names)?r.linked_client_names:[])].filter(Boolean);return names.some(n=>{const k=key22717(n);return !!(k&&(g.keys.has(k)||near22717(g.primary,n)));});}
function futureRoute22717(c){const g=groupFor22717(c),manager=c?.manager_name||g.client?.manager_name||'';return (allRoutePlans||[]).filter(r=>{if(r.removed||String(r.visit_date||'').slice(0,10)<TODAY)return false;if(!(r.approved===true||r.review_status==='approved'))return false;if(manager&&r.manager_name&&!managerLooseMatch(r.manager_name,manager))return false;return routeMatch22717(r,g);}).sort((a,b)=>String(a.visit_date||'').localeCompare(String(b.visit_date||'')))[0]||null;}
window.v22717FutureApprovedRoute=futureRoute22717;window.v22716FutureRoute=futureRoute22717;

// Жёсткий стоп до открытия ИИ-модалки: без согласованной точки никакого +7 дней.
const openAiBase22717=window.v2274OpenFallingAi;
window.v2274OpenFallingAi=async function(id){
  const data=v20ComputeFalling(),row=data.rows.find(x=>String(x.client.id)===String(id));if(!row){alert('Клиент уже вышел из активного падения. Обновите раздел.');return;}
  const g=groupFor22717(row.client),dup=taskForGroup22717(g);if(dup){alert('У этого юридического лица уже есть активная задача. Сначала завершите или скорректируйте её.');return;}
  const route=futureRoute22717(row.client);if(!route){alert('У клиента нет будущей СОГЛАСОВАННОЙ точки маршрута. Задача по падению не назначается. Сначала добавьте и согласуйте визит в маршруте.');return;}
  const out=await openAiBase22717(id);setTimeout(()=>{const d=String(route.visit_date||'').slice(0,10),el=document.getElementById('v2274-ai-date');if(el){el.value=d;el.readOnly=true;}const s=document.getElementById('v2274-ai-summary');if(s)s.innerHTML=s.innerHTML.replace(/Срок\s*<b>[^<]*<\/b>/,'Срок <b>'+esc(d)+'</b>');const h=document.querySelector('#modal-v2274-falling-ai .v2274-ai-head');if(h&&!h.querySelector('.v22717-build'))h.insertAdjacentHTML('beforeend','<span class="tag tag-gray v22717-build">'+VERSION+'</span>');},0);return out;
};

// ---------- Свежая 1С: один принудительный фоновой перечит на аналитическую сессию ----------
let freshPromise22717=null,freshAt22717=0;
async function freshAnalytics22717(force){
  if(freshPromise22717)return freshPromise22717;
  freshPromise22717=(async()=>{try{
    if(typeof window.v22722EnsureHistory!=='function')return false;
    await window.v22722EnsureHistory({force:!!force,reason:'analytics'});freshAt22717=Date.now();return true;
  }catch(e){console.warn(VERSION+' fresh analytics',e);return false;}finally{freshPromise22717=null;}})();return freshPromise22717;
}
window.v22717RefreshAnalytics=freshAnalytics22717;

const renderVipBase22717=window.renderVip;
window.renderVip=function(){const out=renderVipBase22717.apply(this,arguments);setTimeout(()=>{const p=document.getElementById('vip-period-info');if(p&&!p.querySelector('.v22717-version'))p.insertAdjacentHTML('beforeend','<div class="v22717-version" style="font-size:10px;color:var(--sub);margin-top:5px">Расчёт юрлиц: <b>'+VERSION+'</b></div>');},0);return out;};renderVip=window.renderVip;
const renderFallBase22717=window.renderFallingClients;
window.renderFallingClients=function(){const out=renderFallBase22717.apply(this,arguments);setTimeout(()=>{const p=document.getElementById('falling-period-note');if(p&&!p.querySelector('.v22717-version'))p.insertAdjacentHTML('beforeend','<div class="v22717-version" style="font-size:10px;color:var(--sub);margin-top:4px">Расчёт юрлиц и маршрута: <b>'+VERSION+'</b></div>');},0);return out;};renderFallingClients=window.renderFallingClients;

const goBase22717=window.goPage||goPage;
// v22.7.32.2.7: analytics pages load themselves. Do not add a second
// click-time history load + rerender on top of their authoritative renderer.
window.goPage=function(p,title){return goBase22717.apply(this,arguments);};goPage=window.goPage;

window.RESANTA_V22717=Object.freeze({version:VERSION,universalLegalEntityKey:true,vipHardDedup:true,vipFuzzyTypoDedup:true,fallingAllTradePoints:true,fallingExactKopecks:true,approvedRouteOnly:true,noSevenDayFallback:true,freshPurchaseHistoryOnAnalytics:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 44 ===== */
// ============================================================================
// RESANTA CRM v22.7.22 · NON-BLOCKING DATA ARCHITECTURE
// Ядро CRM открывается без purchase_history. Большая история продаж загружается
// один раз по требованию и разделяется всеми аналитическими экранами.
// ============================================================================
(function(){
'use strict';
const VERSION='v22.7.22';
const state={historyPromise:null,ready:false,loadedStamp:'',statusCheckedAt:0,remotePromise:null};
const ANALYTICS=new Set(['vip','falling','abc','sales']);

function salesRow(){try{return typeof crmImportStatus==='function'?crmImportStatus('sales'):null;}catch(_){return null;}}
function repairRow(){try{return (allImportStatus||[]).find(r=>String(r.source||'').toLowerCase()==='sales_history_repair')||null;}catch(_){return null;}}
function salesStamp(row){try{return typeof v204StatusStamp==='function'?v204StatusStamp(row):String(row?.last_success_at||row?.updated_at||'');}catch(_){return String(row?.last_success_at||row?.updated_at||'');}}
function historyStamp(){return salesStamp(salesRow())+'|repair:'+salesStamp(repairRow());}
function allStamp(){try{return v2273ImportStamp(allImportStatus||[]);}catch(_){return '';}}
function currentPage(){try{return crmActivePage();}catch(_){return document.getElementById('app')?.dataset?.activePage||'';}}
function invalidate(){
  try{v2273ResetHistoryIndexes();}catch(_){ }
  try{v204InvalidateFallingCaches();}catch(_){ }
  try{if(typeof reset22717==='function')reset22717();}catch(_){ }
  try{Object.keys(_clientHistCache||{}).forEach(k=>delete _clientHistCache[k]);}catch(_){ }
  try{if(typeof _histIndex==='object'&&_histIndex){_histIndex.n=-1;_histIndex.byName=null;_histIndex.keys=null;}}catch(_){ }
  try{_abcGlobalFirstSig='';_abcGlobalFirstMonth=null;}catch(_){ }
}
function pageStatus(page,text){
  const root=document.getElementById('page-'+page);if(!root)return;
  let el=root.querySelector('.v22722-page-loading');
  if(!text){el?.remove();return;}
  if(!el){el=document.createElement('div');el.className='card v22722-page-loading';el.style.cssText='margin-bottom:12px;color:var(--sub);font-size:13px;padding:14px 16px';const title=root.querySelector('.page-title');if(title)title.insertAdjacentElement('afterend',el);else root.prepend(el);}
  el.textContent=text;
}
async function remoteStatus(){
  if(state.remotePromise)return state.remotePromise;
  if(Date.now()-state.statusCheckedAt<60000)return salesRow();
  state.remotePromise=(async()=>{try{
    state.statusCheckedAt=Date.now();
    if(typeof v204FetchSalesStatus==='function')return await v204FetchSalesStatus();
    const {data,error}=await db.from('crm_import_status').select('*').eq('source','sales').maybeSingle();if(error)throw error;return data||null;
  }catch(e){console.warn(VERSION+' status check',e);return null;}finally{state.remotePromise=null;}})();
  return state.remotePromise;
}
function applyRemoteStatus(row){if(!row)return;allImportStatus=(allImportStatus||[]).filter(x=>String(x.source||'').toLowerCase()!=='sales');allImportStatus.push(row);}

window.v22722EnsureHistory=async function(options={}){
  const force=!!options.force,reason=options.reason||'page';
  if(state.historyPromise)return state.historyPromise;
  const localStamp=historyStamp();
  if(state.ready&&!force&&state.loadedStamp===localStamp&&(allPurchaseHistory||[]).length)return allPurchaseHistory;
  state.historyPromise=(async()=>{
    try{
      let stamp=localStamp;
      if(force||Date.now()-state.statusCheckedAt>=60000){const remote=await remoteStatus();if(remote){applyRemoteStatus(remote);stamp=historyStamp()||stamp;}}
      const masterPending=!!window.RESANTA_MASTERLIST_REFRESH_PENDING;
      if(!force&&!masterPending){
        const cached=await v2273CacheGet('purchase_history');
        const valid=!!(cached&&Array.isArray(cached.rows)&&cached.rows.length&&stamp&&cached.historyStamp===stamp);
        if(valid){allPurchaseHistory=cached.rows;state.ready=true;state.loadedStamp=stamp;v2273HistoryNeedsRefresh=false;invalidate();console.info(VERSION,'history from IndexedDB',allPurchaseHistory.length,reason);return allPurchaseHistory;}
      }
      const rows=await loadAllRows('purchase_history');
      if(!Array.isArray(rows)||!rows.length)throw new Error('purchase_history вернулась пустой — текущие данные не заменены.');
      allPurchaseHistory=rows;state.ready=true;state.loadedStamp=stamp||historyStamp();v2273HistoryNeedsRefresh=false;invalidate();
      try{await v2273CacheSet('purchase_history',{rows,historyStamp:state.loadedStamp,salesStamp:salesStamp(salesRow()),repairStamp:salesStamp(repairRow()),stamp:allStamp(),savedAt:Date.now()});}catch(_){ }
      if(window.RESANTA_MASTERLIST_REFRESH_PENDING){try{localStorage.setItem('resanta_masterlist_full_refresh_v2276','ok');}catch(_){ }window.RESANTA_MASTERLIST_REFRESH_PENDING=false;}
      // Обороты обновляются порциями и не задерживают показ аналитики.
      try{v2273ApplyRevenueFromHistory();}catch(_){ }
      console.info(VERSION,'history from Supabase',rows.length,reason);
      return rows;
    }finally{state.historyPromise=null;}
  })();
  return state.historyPromise;
};
window.v22722HistoryReady=()=>state.ready&&(allPurchaseHistory||[]).length>0;

async function ensureForPage(page){
  if(!ANALYTICS.has(page))return true;
  pageStatus(page,'Загружаю аналитику 1С… Можно перейти в другой раздел — CRM не блокируется.');
  try{
    await window.v22722EnsureHistory({reason:page});
    if(page==='abc'&&!v2273FeatureState['tasks-stock']?.loaded)await v2273EnsureFeature('tasks-stock');
    pageStatus(page,'');
    return true;
  }catch(e){pageStatus(page,'Не удалось загрузить аналитику: '+(e.message||e));console.warn(VERSION+' '+page,e);return false;}
}

// Ни один аналитический render не запускает тяжёлый расчёт, пока общая история
// не готова. После готовности вызывается именно сохранённая исходная функция.
function guardRender(name,page,extra){
  const base=window[name]||globalThis[name];if(typeof base!=='function')return;
  const wrapped=function(){
    if(state.ready&&(allPurchaseHistory||[]).length)return base.apply(this,arguments);
    const args=arguments;pageStatus(page,'Загружаю аналитику 1С… Можно продолжать работу в других разделах.');
    ensureForPage(page).then(ok=>{if(ok&&currentPage()===page){try{base.apply(this,args);}catch(e){console.warn(VERSION+' render '+page,e);}}});
  };
  window[name]=wrapped;try{globalThis[name]=wrapped;}catch(_){ }
}
guardRender('renderVip','vip');
guardRender('renderFallingClients','falling');
guardRender('renderSales','sales');
guardRender('renderABC','abc');

// Старая проверка «Падающих» теперь читает только маленькую строку статуса.
// При новом импорте история помечается устаревшей, но не скачивается на Дашборде.
try{
  v204CheckFallingFreshness=async function(force){
    if(v204FallingRefreshBusy||!currentProfile)return;v204FallingRefreshBusy=true;
    try{
      const before=salesStamp(salesRow()),remote=await remoteStatus(),after=salesStamp(remote)||before;
      if(remote)applyRemoteStatus(remote);
      if(force||(after&&before&&after!==before)){state.ready=false;state.loadedStamp='';v2273HistoryNeedsRefresh=true;invalidate();if(currentPage()==='falling'){await window.v22722EnsureHistory({force:true,reason:'new-import'});renderFallingClients();}}
    }catch(e){console.warn(VERSION+' falling status',e);}finally{v204FallingRefreshBusy=false;}
  };
}catch(_){ }

// v22.7.17 больше не имеет собственного download purchase_history.
try{freshAnalytics22717=async function(force){try{await window.v22722EnsureHistory({force:!!force,reason:'v22717'});return true;}catch(_){return false;}};window.v22717RefreshAnalytics=freshAnalytics22717;}catch(_){ }

// Если после объединений стоит флаг маст-листа, не запускаем его на старте.
// Он автоматически снимается после первой востребованной загрузки истории.
try{refreshMasterListOnce2276=async function(){if(!window.RESANTA_MASTERLIST_REFRESH_PENDING)return true;await window.v22722EnsureHistory({force:true,reason:'master-list'});return true;};window.v2276RefreshMasterList=refreshMasterListOnce2276;}catch(_){ }

// Полноэкранный фон никогда не используется аналитикой.
try{v2273StartBackgroundLoad=async function(){return true;};window.v2273StartBackgroundLoad=v2273StartBackgroundLoad;}catch(_){ }

window.RESANTA_V22722=Object.freeze({version:VERSION,coreFirst:true,noHistoryOnStartup:true,singleSharedHistoryPromise:true,lazyPayments:true,lazyTriovistBoss:true,nonBlockingAnalytics:true,chunkedRevenueRebuild:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 45 ===== */
// ============================================================================
// RESANTA CRM v22.7.23 · SALES HISTORY AUDIT
// После восстановления 1С показывает руководителю, из каких месяцев реально
// сложились суммы «Падающих». Это не меняет расчёт — только делает его проверяемым.
// ============================================================================
(function(){
'use strict';
const VERSION='v22.7.23';
function monthlyAudit22723(x){
  try{
    const period=v20FallingPeriod();
    const hist=x?.entity&&typeof histGroup22717==='function'?histGroup22717(x.entity):(typeof window.v22717FallingHist==='function'?window.v22717FallingHist(x.client):[]);
    if(!Array.isArray(hist)||!hist.length)return '';
    const sums=new Map();
    hist.forEach(r=>{const m=String(r.month||'').slice(0,7);if(!/^\d{4}-\d{2}$/.test(m))return;sums.set(m,(sums.get(m)||0)+(Number(r.revenue)||0));});
    const rows=(period.current||[]).map((m,i)=>{const pm=(period.previous||[])[i]||'';return '<tr><td>'+esc(monthLabel(m))+'</td><td style="text-align:right">'+v20Money(sums.get(m)||0)+'</td><td>'+esc(monthLabel(pm))+'</td><td style="text-align:right">'+v20Money(sums.get(pm)||0)+'</td></tr>';}).join('');
    return '<details class="v22723-month-audit" style="margin-top:10px"><summary style="cursor:pointer;font-weight:700;color:var(--sub)">🔎 Проверить оборот по месяцам</summary><div style="margin-top:8px;overflow:auto"><table class="v20-mini-table"><thead><tr><th>Текущий период</th><th>BYN</th><th>Прошлый год</th><th>BYN</th></tr></thead><tbody>'+rows+'<tr style="font-weight:800"><td>ИТОГО</td><td style="text-align:right">'+v20Money(x.cur)+'</td><td>ИТОГО</td><td style="text-align:right">'+v20Money(x.prev)+'</td></tr></tbody></table><div style="font-size:10px;color:var(--sub);margin-top:5px">Источник: purchase_history из проверенных отчётов 1С · '+VERSION+'</div></div></details>';
  }catch(e){console.warn(VERSION+' month audit',e);return '';}
}
const baseCard=window.v20FallingCard||v20FallingCard;
if(typeof baseCard==='function'){
  window.v20FallingCard=function(x){
    let html=baseCard.apply(this,arguments),audit=monthlyAudit22723(x);
    if(!audit)return html;
    const marker='<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">';
    return html.includes(marker)?html.replace(marker,audit+marker):html;
  };
  try{v20FallingCard=window.v20FallingCard;}catch(_){ }
}
window.RESANTA_V22723=Object.freeze({version:VERSION,historyRepairAudit:true,fallingMonthlyProof:true,repairAwareHistoryCache:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 46 ===== */
// ============================================================================
// RESANTA CRM v22.7.25 · AI TASK DATA GUARD
// Рабочие клиенты: ИИ запускается только после полной истории 1С + ABC +
// актуального остатка/прайса. Ноль SKU больше не превращается в «заполнить профиль».
// ============================================================================
(function(){
'use strict';
const VERSION='v22.7.26';

function box(){return document.getElementById('aiweek-result');}
function showLoading(){const b=box();if(b)b.innerHTML='<div style="text-align:center;padding:38px 20px;color:var(--sub)"><div style="font-size:34px;margin-bottom:10px">🧠</div><div style="font-size:14px;font-weight:700">Подготавливаю данные для ИИ-задач…</div><div style="font-size:12px;margin-top:7px">История 1С → ABC клиента/филиала → остаток Витебска → персональный маст-лист</div></div>';}
function showError(title,details){const b=box();if(!b)return;b.innerHTML='<div style="padding:14px 16px;border:1px solid #FCA5A5;background:#FEF2F2;border-radius:10px;color:#991B1B"><b>⛔ '+esc(title)+'</b>'+(details?'<div style="font-size:12px;line-height:1.5;margin-top:7px">'+details+'</div>':'')+'<div style="font-size:11px;margin-top:8px;color:#7F1D1D">ИИ-задачи не сформированы и менеджерам ничего не отправлено.</div></div>';}
async function ensureData(){
  showLoading();
  try{
    if(typeof window.v22722EnsureHistory!=='function')throw new Error('общий загрузчик истории 1С недоступен');
    await window.v22722EnsureHistory({reason:'ai-planner-v22725'});
    if(typeof window.v2273EnsureFeature==='function')await window.v2273EnsureFeature('tasks-stock');
    if(!Array.isArray(allPurchaseHistory)||!allPurchaseHistory.length)throw new Error('purchase_history не загрузилась');
    if(!Array.isArray(allPrice)||!allPrice.length)throw new Error('прайс компании не загрузился');
    if(!Array.isArray(allStock)||!allStock.length)throw new Error('остаток Витебска не загрузился');
    try{_histRowsCache.clear();_histIndex.n=-1;_histIndex.byName=null;_histIndex.keys=null;}catch(_){ }
    return true;
  }catch(e){showError('Нельзя сформировать ИИ-задачи','Не готовы обязательные данные: '+esc(e&&e.message?e.message:String(e))+'. Обновите страницу или повторите после успешной загрузки 1С/остатков.');return false;}
}
function historyIssues(clients){
  const out=[];
  (clients||[]).forEach(c=>{
    if(!c||c.client_status!=='Рабочий'||!(Number(c.revenue_total)||0))return;
    let hist=[];try{hist=_clientHistRows(c.name)||[];}catch(_){ }
    if(!hist.length)out.push(c);
  });
  return out;
}
function blockHistoryIssues(clients){
  const bad=historyIssues(clients);if(!bad.length)return false;
  const rows=bad.slice(0,8).map(c=>'• <b>'+esc(c.name)+'</b> — оборот '+esc(fmtMoney(c.revenue_total||0))+' BYN, но purchase_history не сопоставилась').join('<br>');
  showError('Продажи рабочего клиента не сопоставились',rows+(bad.length>8?'<br>… ещё '+(bad.length-8):'')+'<br><br>Проверьте client_id/алиасы/объединение карточек. Рабочий клиент не будет ошибочно переведён в задачу «заполнить профиль».');
  return true;
}

const oldDay=window.runAIDayPlan||runAIDayPlan;
window.runAIDayPlan=async function(mgr,date){
  if(!(await ensureData()))return;
  const clients=[],seen=new Set();
  (allRoutePlans||[]).filter(r=>!r.removed&&!r.visited&&r.manager_name===mgr&&r.visit_date===date).forEach(r=>{const c=_aiClientForRoutePlan(r);if(c&&!seen.has(c.id)){seen.add(c.id);clients.push(c);}});
  if(blockHistoryIssues(clients))return;
  return await oldDay.apply(this,arguments);
};
try{runAIDayPlan=window.runAIDayPlan;}catch(_){ }

const oldCall=window.runAICallPlan||runAICallPlan;
window.runAICallPlan=async function(mgr){
  if(!(await ensureData()))return;
  let clients=[];try{clients=(_criticalCallClients(mgr)||[]).slice(0,10).map(x=>x.c).filter(Boolean);}catch(_){ }
  if(blockHistoryIssues(clients))return;
  return await oldCall.apply(this,arguments);
};
try{runAICallPlan=window.runAICallPlan;}catch(_){ }

// После построения персональных пулов не отправляем в ИИ рабочих клиентов,
// у которых после всех проверок нет безопасного SKU. Остальные клиенты дня
// продолжают обрабатываться нормально.
const oldRequest=_runAIPlanRequest;
_runAIPlanRequest=async function(header,system,mgr,date,mode,briefs){
  const blocked=[],safe=[];
  (briefs||[]).forEach(b=>{
    const probe={client:b.name,_client_id:b.client_id||''};
    const c=_aiClientForProposal(probe);
    const pool=_poolForProposal(probe);
    // Потенциальный клиент ОБЯЗАТЕЛЬНО идёт в ИИ даже при 0 SKU: в этом случае
    // его штатная логика формирует квалификацию/следующий коммерческий шаг.
    const potential=_aiPoolIsPotential(pool)||(c&&c.client_status==='Потенциальный');
    if(!potential&&c&&c.client_status==='Рабочий'&&(!pool||!(pool.items||[]).length)){blocked.push({c,pool});return;}
    safe.push(b);
  });
  if(!safe.length){
    showError('Нет готовых рабочих задач','После полной проверки истории 1С, ABC и остатка Витебска для клиентов этого списка не найден безопасный персональный товарный пул. Проверьте данные/остаток — профиль клиента автоматически не подменяется.');
    return;
  }
  const out=await oldRequest.call(this,header,system,mgr,date,mode,safe);
  if(blocked.length){
    const b=box();if(b){const names=blocked.map(x=>esc(x.c.name)).join(', ');b.insertAdjacentHTML('afterbegin','<div style="margin-bottom:10px;padding:9px 11px;border:1px solid #FDE68A;background:#FFFBEB;border-radius:8px;color:#92400E;font-size:11px"><b>⚠️ Не сформированы задачи для рабочих клиентов:</b> '+names+'. Причина: после полной проверки истории/ABC/остатка нет безопасного SKU. Менеджерам по этим клиентам ничего не отправлено.</div>');}
  }
  return out;
};
try{window._runAIPlanRequest=_runAIPlanRequest;}catch(_){ }

// Кеш ИИ-истории обязан сбрасываться вместе с общей purchase_history.
try{
  const oldInvalidate=window.v22725InvalidateAIHistory;
  window.v22725InvalidateAIHistory=function(){try{_histRowsCache.clear();_histIndex.n=-1;_histIndex.byName=null;_histIndex.keys=null;}catch(_){ }if(typeof oldInvalidate==='function')oldInvalidate();};
}catch(_){ }

window.RESANTA_V22725=Object.freeze({version:VERSION,historyBeforeAI:true,stockBeforeAI:true,workingNoProfileFallback:true,workingHistoryMismatchBlocked:true,robustClientIdAliasHistory:true});
window.RESANTA_V22726=Object.freeze({version:VERSION,potentialAlwaysGetsTask:true,routeClientIdFirst:true,proposalClientIdPinned:true,potentialZeroSkuQualification:true,workingZeroSkuStillBlocked:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 47 ===== */
// ============================================================================
// RESANTA CRM v22.7.27 · AI CLIENT IDENTITY ROOT FIX
// Одна идентичность клиента проходит всю цепочку: маршрут -> справка -> ИИ ->
// персональный пул -> валидация -> постановка задачи. Название используется
// только как аварийный fallback, и только если оно однозначно.
// ============================================================================
(function(){
'use strict';
const VERSION='v22.7.27';

const poolById=new Map();
const idsByName=new Map();
let activeBriefClient=null;
let routeWarnings=[];

function cid(v){return String(v==null?'':v).trim();}
function token(v){try{return _coreToken(String(v||''));}catch(_){return String(v||'').trim().toLowerCase();}}
function clientById(id){id=cid(id);return id?(allClients||[]).find(c=>cid(c.id)===id)||null:null;}
function uniqueClients(rows){const m=new Map();(rows||[]).forEach(c=>{if(c&&c.id&&!m.has(cid(c.id)))m.set(cid(c.id),c);});return [...m.values()];}
function clientIdsForName(name){const t=token(name);if(!t)return [];const exact=(allClients||[]).filter(c=>token(c.name)===t);return uniqueClients(exact).map(c=>cid(c.id));}

function resetIdentity(){poolById.clear();idsByName.clear();routeWarnings=[];_aiClientPools={};}

// Персональный пул больше не живёт по названию. Имя индексируем только для
// безопасного fallback, когда ровно одна карточка имеет такое точное имя.
_rememberClientPool=function(c,pool){
  if(!c)return pool;
  const id=cid(c.id),t=token(c.name);
  if(id){poolById.set(id,pool);_aiClientPools['id:'+id]=pool;}
  if(t){
    if(!idsByName.has(t))idsByName.set(t,new Set());
    if(id)idsByName.get(t).add(id);
    const ids=idsByName.get(t);
    if(ids.size===1)_aiClientPools['name:'+t]=pool; else delete _aiClientPools['name:'+t];
  }
  return pool;
};

_poolForProposal=function(p){
  if(!p)return null;
  const id=cid(p._client_id||p.client_id);
  if(id&&poolById.has(id))return poolById.get(id);
  const t=token(p.client);
  if(!t)return null;
  const ids=idsByName.get(t);
  if(ids&&ids.size===1){const only=[...ids][0];return poolById.get(only)||null;}
  // Fallback разрешён только при единственной точной карточке с этим именем.
  const real=clientIdsForName(p.client);
  if(real.length===1)return poolById.get(real[0])||null;
  return null;
};

_aiClientForProposal=function(p){
  if(!p)return null;
  const id=cid(p._client_id||p.client_id);
  if(id)return clientById(id);
  const ids=clientIdsForName(p.client);
  return ids.length===1?clientById(ids[0]):null;
};

// История при построении справки должна относиться к конкретной карточке, а не
// к первой карточке с похожим названием.
const baseHistRows=_clientHistRows;
_clientHistRows=function(clientOrName){
  const c=(clientOrName&&typeof clientOrName==='object')?clientOrName:activeBriefClient;
  if(c&&c.id){
    const key='id:'+cid(c.id);
    if(_histRowsCache.has(key))return _histRowsCache.get(key);
    let rows=[];
    try{if(typeof getClientHistFast==='function')rows=getClientHistFast(c)||[];}catch(e){console.warn(VERSION+' exact history',c.name,e);}
    _histRowsCache.set(key,rows);
    return rows;
  }
  return baseHistRows.apply(this,arguments);
};
const baseBrief=_aiClientBrief;
_aiClientBrief=function(c,allCats){activeBriefClient=c;try{return baseBrief.call(this,c,allCats);}finally{activeBriefClient=null;}};

// Квалификационная задача потенциального клиента — тоже SMART, но у неё по
// определению может не быть оборота/ABC. Измеримость: профиль + 1–3 направления
// + конкретная дата/решение, а не обязательная сумма продаж.
const baseConvertPotential=_convertPotentialTaskToQualification;
_convertPotentialTaskToQualification=function(p,c,pool){
  p=baseConvertPotential.call(this,p,c,pool);
  const missing=((pool&&pool.audit&&pool.audit.missing)||[]).join('; ');
  p.basis='Потенциальный клиент: 0 подтверждённых закупок в 1С. Нужно определить 1–3 приоритетных товарных направления, заполнить профиль и согласовать 1 конкретную дату следующего коммерческого шага.'+(missing?' Не заполнено: '+missing+'.':'');
  p._potentialQualification=true;
  return p;
};
function isPotentialQualification(p){
  const c=_aiClientForProposal(p),pool=_poolForProposal(p);
  return !!(c&&c.client_status==='Потенциальный'&&(p._potentialQualification||(pool&&pool.mode==='qualification')||(!(p.items||[]).length&&_aiPoolIsPotential(pool))));
}
const baseWatery=_isWateryTask;
_isWateryTask=function(p){
  if(isPotentialQualification(p)){
    const task=String(p&&p.task||''),exp=String(p&&p.expected_result||''),crit=String(p&&p.criteria||'');
    if(!task.trim()||!exp.trim()||!crit.trim())return true;
    if(!/1\s*[.–-]|1\./.test(task)||!/2\s*[.–-]|2\./.test(task))return true;
    if(!/1\s*[–-]\s*3|1-3|1–3|дата|решени|профил|перечень|направлен/i.test(exp))return true;
    return false;
  }
  return baseWatery.call(this,p);
};

// Возвращает ВСЕ карточки, реально связанные с физической точкой. Если ID в
// маршруте отсутствуют, по имени можно продолжить только при однозначном матче.
function targetsForRoute(r){
  const ids=[];
  if(r&&r.client_id)ids.push(cid(r.client_id));
  if(Array.isArray(r&&r.linked_client_ids))r.linked_client_ids.forEach(x=>ids.push(cid(x)));
  let rows=uniqueClients([...new Set(ids.filter(Boolean))].map(clientById).filter(Boolean));
  if(rows.length)return rows.map(c=>({client:c,route_plan_id:cid(r.id),route:r}));

  const names=[r&&r.client_name,...(Array.isArray(r&&r.linked_client_names)?r.linked_client_names:[])].filter(Boolean);
  const matches=uniqueClients((allClients||[]).filter(c=>names.some(n=>token(c.name)===token(n))));
  if(matches.length===1)return [{client:matches[0],route_plan_id:cid(r&&r.id),route:r}];
  if(matches.length>1){
    routeWarnings.push('«'+String(r&&r.client_name||'Точка маршрута')+'» — неоднозначная привязка: '+matches.map(c=>c.name+' ['+(c.client_status||'—')+']').join(' / '));
    return [];
  }
  routeWarnings.push('«'+String(r&&r.client_name||'Точка маршрута')+'» — карточка клиента не найдена по ID.');
  return [];
}
function dayTargets(mgr,date){
  const out=[],seen=new Set();
  (allRoutePlans||[]).filter(r=>!r.removed&&!r.visited&&r.manager_name===mgr&&r.visit_date===date).forEach(r=>{
    targetsForRoute(r).forEach(t=>{const id=cid(t.client.id);if(!seen.has(id)){seen.add(id);out.push(t);}});
  });
  return out;
}
function callTargets(mgr){
  const out=[],seen=new Set();
  let list=[];try{list=(_criticalCallClients(mgr)||[]).slice(0,10);}catch(_){ }
  list.forEach(x=>{const c=x&&x.c;if(c&&c.id&&!seen.has(cid(c.id))){seen.add(cid(c.id));out.push({client:c,route_plan_id:'',route:null,crit:x.crit||''});}});
  return out;
}

function plannerBox(){return document.getElementById('aiweek-result');}
function showDataLoading(){const b=plannerBox();if(b)b.innerHTML='<div style="text-align:center;padding:38px 20px;color:var(--sub)"><div style="font-size:34px;margin-bottom:10px">🧠</div><div style="font-size:14px;font-weight:700">Подготавливаю точные данные клиентов…</div><div style="font-size:12px;margin-top:7px">client_id → история 1С → ABC → остаток Витебска → ИИ</div></div>';}
function showPlannerError(title,details){const b=plannerBox();if(!b)return;b.innerHTML='<div style="padding:14px 16px;border:1px solid #FCA5A5;background:#FEF2F2;border-radius:10px;color:#991B1B"><b>⛔ '+esc(title)+'</b>'+(details?'<div style="font-size:12px;line-height:1.5;margin-top:7px">'+details+'</div>':'')+'<div style="font-size:11px;margin-top:8px;color:#7F1D1D">Менеджерам ничего не отправлено.</div></div>';}
async function ensurePlannerData(){
  showDataLoading();
  try{
    if(typeof window.v22722EnsureHistory!=='function')throw new Error('загрузчик истории 1С недоступен');
    await window.v22722EnsureHistory({reason:'ai-planner-v2273210'});
    if((!Array.isArray(allStock)||!allStock.length||!Array.isArray(allPrice)||!allPrice.length)&&typeof window.v2273EnsureFeature==='function'){
      try{if(typeof v2273FeatureState!=='undefined')v2273FeatureState['tasks-stock']={loaded:false,promise:null};}catch(_){}
      await window.v2273EnsureFeature('tasks-stock');
      try{_stockSig='';_priceSig='';_stockIdx={};_stockByProduct={};_priceByCat={};}catch(_){}
    }
    if(!Array.isArray(allPurchaseHistory)||!allPurchaseHistory.length)throw new Error('purchase_history не загрузилась');
    if(!Array.isArray(allPrice)||!allPrice.length)throw new Error('прайс компании не загрузился');
    if(!Array.isArray(allStock)||!allStock.length)throw new Error('остаток Витебска не загрузился');
    const st=_stockStatus();if(!st.ok)throw new Error(st.reason);
    try{_histRowsCache.clear();_histIndex.n=-1;_histIndex.byName=null;_histIndex.keys=null;}catch(_){ }
    return true;
  }catch(e){showPlannerError('Нельзя сформировать ИИ-задачи','Не готовы обязательные данные: '+esc(e&&e.message?e.message:String(e))+'<br><br>CRM обновлять через Ctrl+F5 не нужно.');return false;}
}
function exactHistory(c){activeBriefClient=c;try{return _clientHistRows(c)||[];}finally{activeBriefClient=null;}}
function makeBrief(t,allCats,mode){
  const c=t.client;
  let text='';
  try{text=_aiClientBrief(c,allCats);}catch(e){console.error(VERSION+' brief',c.name,e);text='  Статус клиента: '+(c.client_status||'—')+'\n  (часть данных клиента не построилась)';}
  const prefix='  CRM_CLIENT_ID: '+cid(c.id)+'\n  СТАТУС ИЗ КАРТОЧКИ ПО ID: '+(c.client_status||'Не указан')+(t.route_plan_id?'\n  ROUTE_PLAN_ID: '+t.route_plan_id:'');
  if(mode==='call'&&t.crit)text='  ⚡ ПРОБЛЕМА: '+t.crit+'\n'+text;
  return {name:c.name,client_id:cid(c.id),client_status:c.client_status||'',route_plan_id:t.route_plan_id||'',text:prefix+'\n'+text};
}
function splitBriefs(briefs){
  const safe=[],blocked=[];
  briefs.forEach(b=>{
    const c=clientById(b.client_id),pool=_poolForProposal({_client_id:b.client_id,client:b.name});
    if(c&&c.client_status==='Рабочий'&&(!pool||!(pool.items||[]).length)){blocked.push({c,pool});return;}
    // Потенциальный всегда проходит, в том числе при items=[] / qualification.
    safe.push(b);
  });
  return {safe,blocked};
}
function warningHtml(blocked,identity){
  let h='';
  if(blocked&&blocked.length){h+='<div style="margin-bottom:10px;padding:9px 11px;border:1px solid #FDE68A;background:#FFFBEB;border-radius:8px;color:#92400E;font-size:11px"><b>⚠️ Не сформированы задачи только для рабочих клиентов:</b> '+blocked.map(x=>esc(x.c.name)).join(', ')+'. Причина: после проверки истории/ABC/остатка нет безопасного SKU. Потенциальные клиенты этим правилом не блокируются.</div>';}
  if(identity&&identity.length){h+='<div style="margin-bottom:10px;padding:9px 11px;border:1px solid #FDBA74;background:#FFF7ED;border-radius:8px;color:#9A3412;font-size:11px"><b>⚠️ Неоднозначная привязка маршрута:</b><br>'+identity.map(x=>'• '+esc(x)).join('<br>')+'<br>CRM ничего не угадывает по похожему названию — исправьте связь карточки с маршрутом.</div>';}
  return h;
}
function prependWarnings(blocked,identity){const b=plannerBox(),h=warningHtml(blocked,identity);if(b&&h)b.insertAdjacentHTML('afterbegin',h);}

// Формат ответа теперь содержит машинный client_id. Это не пользовательское поле,
// а техническая гарантия, что модель не сможет перепутать две похожие карточки.
const baseSmartFormat=_smartFormat;
_smartFormat=function(type){
  let s=baseSmartFormat.call(this,type);
  if(!s.includes('"client_id"'))s=s.replace('[{"client":','[{"client_id":"точный CRM_CLIENT_ID из справки","client":');
  return s;
};

function bindProposal(p,chunk,index){
  if(!p)return {proposal:p,target:null,error:'пустой ответ ИИ'};
  let target=null;
  const id=cid(p.client_id||p._client_id);
  if(id)target=chunk.find(b=>cid(b.client_id)===id)||null;
  if(!target){
    const same=chunk.filter(b=>token(b.name)===token(p.client));
    if(same.length===1)target=same[0];
    else if(same.length>1)return {proposal:p,target:null,error:'ИИ не вернул client_id для нескольких одноимённых карточек «'+String(p.client||'')+'»'};
  }
  if(!target&&chunk.length===1)target=chunk[0];
  if(!target)return {proposal:p,target:null,error:'не удалось однозначно связать ответ ИИ «'+String(p.client||'без названия')+'» с client_id'};
  p._client_id=cid(target.client_id);p.client_id=cid(target.client_id);p._route_plan_id=cid(target.route_plan_id);p.client=target.name;
  return {proposal:p,target,error:''};
}

// Полностью заменяем старый name-based цикл. client_id прикрепляется сразу после
// каждой пачки — ДО SMART, персонализации и проверки остатков.
_runAIPlanRequest=async function(header,system,mgr,date,mode,briefs){
  const b=()=>plannerBox();
  const progress=(doneN,total,icon)=>{const el=b();if(!el)return;const pct=total?Math.round(doneN/total*100):100;el.innerHTML='<div style="text-align:center;padding:36px 20px;color:var(--sub)"><div style="font-size:36px;margin-bottom:12px">'+icon+'</div><div style="font-size:14px">Готовлю задачи: '+doneN+' из '+total+' клиентов</div><div style="margin:14px auto 0;max-width:260px;height:6px;background:var(--border);border-radius:99px;overflow:hidden"><div style="width:'+pct+'%;height:100%;background:var(--a)"></div></div><div style="font-size:11px;margin-top:10px">Каждая задача привязана к точному client_id</div></div>';};
  try{
    const icon=mode==='call'?'📞':'🎯',total=(briefs||[]).length;let list=[],identityErrors=[];
    const sys=system+'\n\nКРИТИЧЕСКОЕ ПРАВИЛО CRM: у каждого блока есть CRM_CLIENT_ID. В каждом объекте ответа ОБЯЗАТЕЛЬНО верни поле client_id без единого изменения. Не определяй статус по названию — статус уже дан в справке по client_id.';
    for(let i=0;i<total;i+=AI_BATCH_SIZE){
      const chunk=briefs.slice(i,i+AI_BATCH_SIZE);progress(i,total,icon);
      const block=chunk.map((x,k)=>(i+k+1)+'. CRM_CLIENT_ID: '+x.client_id+'\nКЛИЕНТ: '+x.name+'\n'+x.text).join('\n\n');
      try{
        const part=await _aiPlanCall(header+'\n\n'+block,sys),arr=Array.isArray(part)?part:[];
        arr.forEach((p,ix)=>{const r=bindProposal(p,chunk,ix);if(r.target)list.push(r.proposal);else identityErrors.push(r.error);});
        // Если модель пропустила клиента, добавляем ручную карточку именно по его ID.
        const got=new Set(list.filter(p=>chunk.some(x=>cid(x.client_id)===cid(p._client_id))).map(p=>cid(p._client_id)));
        chunk.forEach(x=>{if(!got.has(cid(x.client_id)))list.push({_client_id:cid(x.client_id),client_id:cid(x.client_id),_route_plan_id:cid(x.route_plan_id),client:x.name,type:mode==='call'?'звонок':'визит',task:'ИИ не вернул задачу по этой карточке — сформулируйте её вручную.',basis:'CRM_CLIENT_ID '+x.client_id,expected_result:'Конкретный результат и дата следующего шага.',criteria:'Результат зафиксирован в CRM.',priority:'средний',items:[],_weak:true});});
      }catch(err){
        console.error(VERSION+' batch',err);
        chunk.forEach(x=>list.push({_client_id:cid(x.client_id),client_id:cid(x.client_id),_route_plan_id:cid(x.route_plan_id),client:x.name,type:mode==='call'?'звонок':'визит',task:'ИИ не ответил по этому клиенту — сформулируйте задачу вручную.',basis:'CRM_CLIENT_ID '+x.client_id,expected_result:'Конкретный результат и дата следующего шага.',criteria:'Результат зафиксирован в CRM.',priority:'средний',items:[],_weak:true}));
      }
    }
    progress(total,total,icon);
    if(!list.length)throw new Error('ИИ не предложил задач.');

    // SMART-переделка только для реально слабых задач. Потенциальная квалификация
    // не обязана иметь оборот в BYN и потому не бракуется из-за отсутствия цифр продаж.
    const bad=list.filter(p=>_isWateryTask(p)&&!p._weak);
    if(bad.length){
      for(let i=0;i<bad.length;i+=AI_BATCH_SIZE){
        const redo=bad.slice(i,i+AI_BATCH_SIZE),ids=new Set(redo.map(p=>cid(p._client_id)));
        const ctx=briefs.filter(x=>ids.has(cid(x.client_id)));
        try{
          const fixPrompt='Эти задачи не прошли SMART. Перепиши только их. Для Потенциального без продаж измеримость — 1–3 направления, заполненный профиль и конкретная дата/решение; сумма BYN не обязательна. Сохрани client_id ТОЧНО.\n\nСПРАВКА:\n'+ctx.map(x=>'CRM_CLIENT_ID: '+x.client_id+'\n'+x.name+'\n'+x.text).join('\n\n')+'\n\nЗАДАЧИ:\n'+redo.map(p=>'client_id='+p._client_id+' · '+p.client+': '+String(p.task||'')).join('\n');
          const fixed=await _aiPlanCall(fixPrompt,sys),arr=Array.isArray(fixed)?fixed:[];
          redo.forEach(orig=>{
            const f=arr.find(x=>cid(x.client_id)===cid(orig._client_id))||arr.find(x=>token(x.client)===token(orig.client));
            if(f){const keep={_client_id:orig._client_id,client_id:orig._client_id,_route_plan_id:orig._route_plan_id,client:orig.client};Object.assign(orig,f,keep,{_fixed:true});}
          });
        }catch(e){console.warn(VERSION+' SMART redo',e);}
      }
    }
    list=list.map(p=>_isWateryTask(p)?Object.assign(p,{_weak:true}):p);
    list=_personalizeAIProposalItems(list);
    list=list.map(_validateAIProposalStock);
    // После штатной конвертации potential->qualification убираем старую weak-метку,
    // если итоговая задача уже проходит правильный SMART потенциального клиента.
    list.forEach(p=>{if(p._weak&&!_isWateryTask(p))delete p._weak;});
    _aiWeekProposals=list;
    _aiLastBlock=briefs.map((x,i)=>(i+1)+'. '+x.name+' [client_id '+x.client_id+']\n'+x.text).join('\n\n');
    renderAIWeekProposals(mgr,date,mode);
    if(identityErrors.length)prependWarnings([],identityErrors);
    return list;
  }catch(e){try{localStorage.setItem('crm_ai_usage',JSON.stringify({date:TODAY,count:Math.max(0,_aiUsageToday()-1)}));}catch(_){ }_aiShowPlanError(e,mgr);return [];}
};
try{window._runAIPlanRequest=_runAIPlanRequest;}catch(_){ }

window.runAIDayPlan=async function(mgr,date){
  if(!(await ensurePlannerData()))return;
  if(!_requireFreshStock(true))return;
  if(_aiUsageToday()>=AI_DAILY_LIMIT){alert('Дневной лимит ИИ исчерпан ('+AI_DAILY_LIMIT+').');return;}
  _bumpAiUsage();resetIdentity();
  const box=plannerBox();if(box)box.innerHTML='<div style="text-align:center;padding:40px;color:var(--sub)"><div style="font-size:36px;margin-bottom:12px">🎯</div><div style="font-size:14px">Готовлю задачи на '+dateLabel(date)+' для «'+esc(mgr)+'»...</div></div>';
  await new Promise(r=>setTimeout(r,50));
  try{
    const allCats=[...new Set(allPurchaseHistory.map(r=>r.category).filter(Boolean))],targets=dayTargets(mgr,date);
    if(!targets.length){if(routeWarnings.length)showPlannerError('Не удалось однозначно определить клиентов маршрута',routeWarnings.map(x=>'• '+esc(x)).join('<br>'));else showPlannerError('Нет клиентов','В этом дне нет клиентов, привязанных к карточкам CRM.');return;}
    const briefs=targets.map(t=>makeBrief(t,allCats,'day')),{safe,blocked}=splitBriefs(briefs),identity=[...routeWarnings];
    if(!safe.length){showPlannerError('Нет готовых задач для рабочих клиентов','Все найденные карточки имеют статус «Рабочий» и после проверки не имеют безопасного SKU. Потенциальные клиенты этим правилом никогда не блокируются.');prependWarnings(blocked,identity);return;}
    await _runAIPlanRequest('МАРШРУТ: '+mgr+', '+dateLabel(date)+' ('+date+')\nДай одну итоговую задачу по КАЖДОМУ CRM_CLIENT_ID ниже.',_aiPlanSystem('day'),mgr,date,'day',safe);
    prependWarnings(blocked,identity);
  }catch(e){_aiShowPlanError(e,mgr);}
};
try{runAIDayPlan=window.runAIDayPlan;}catch(_){ }

window.runAICallPlan=async function(mgr){
  if(!(await ensurePlannerData()))return;
  if(!_requireFreshStock(true))return;
  if(_aiUsageToday()>=AI_DAILY_LIMIT){alert('Дневной лимит ИИ исчерпан ('+AI_DAILY_LIMIT+').');return;}
  _bumpAiUsage();resetIdentity();
  const box=plannerBox();if(box)box.innerHTML='<div style="text-align:center;padding:40px;color:var(--sub)"><div style="font-size:36px;margin-bottom:12px">📞</div><div style="font-size:14px">Готовлю план обзвона для «'+esc(mgr)+'»...</div></div>';
  await new Promise(r=>setTimeout(r,50));
  try{
    const allCats=[...new Set(allPurchaseHistory.map(r=>r.category).filter(Boolean))],targets=callTargets(mgr);
    if(!targets.length){showPlannerError('Нет клиентов','Критичных клиентов вне маршрута нет.');return;}
    const briefs=targets.map(t=>makeBrief(t,allCats,'call')),{safe,blocked}=splitBriefs(briefs);
    if(!safe.length){showPlannerError('Нет готовых задач для рабочих клиентов','После полной проверки истории/ABC/остатка нет безопасного SKU.');prependWarnings(blocked,[]);return;}
    await _runAIPlanRequest('ОБЗВОН: менеджер '+mgr+'\nДай одну итоговую задачу по КАЖДОМУ CRM_CLIENT_ID ниже.',_aiPlanSystem('call'),mgr,null,'call',safe);
    prependWarnings(blocked,[]);
  }catch(e){_aiShowPlanError(e,mgr);}
};
try{runAICallPlan=window.runAICallPlan;}catch(_){ }

// Финальная страховка утверждения: client_id обязателен. Если его нет — CRM не
// угадывает карточку по похожему имени.
const baseApprove=approveAIWeekTask;
approveAIWeekTask=async function(idx,mgr,date,mode){
  const p=_aiWeekProposals[idx];if(!p||p._done)return;
  if(!cid(p._client_id||p.client_id)){alert('Задачу нельзя утвердить: отсутствует точный client_id клиента. Пересформируйте план.');return;}
  const c=clientById(p._client_id||p.client_id);if(!c){alert('Задачу нельзя утвердить: карточка client_id '+String(p._client_id||p.client_id)+' не найдена.');return;}
  p.client=c.name;p._client_id=cid(c.id);p.client_id=cid(c.id);
  return await baseApprove.call(this,idx,mgr,date,mode);
};
try{window.approveAIWeekTask=approveAIWeekTask;}catch(_){ }

window.RESANTA_V22727=Object.freeze({version:VERSION,clientIdEndToEnd:true,routeLinkedCardsSeparate:true,noNameGuessing:true,potentialAlwaysTask:true,potentialSmartQualification:true,ambiguousRouteBlocked:true,approvalClientIdRequired:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 48 ===== */
// ============================================================================
// RESANTA CRM v22.7.28 · TRIOVIST COMMERCIAL WORKSPACE
// 900 group excluded; tabs; 1C shipments; period presets; novelties; AI recommendations.
// ============================================================================
(function(){
'use strict';
const V='v22.7.28';
const TABS=[['summary','📊 Сводка'],['sales','💰 Продажи'],['stock','📦 Остатки и заказ'],['shipments','🚚 Отгрузки 1С'],['novelties','🆕 Новинки'],['cards','🧩 Карточки 21vek'],['tasks','🤖 Задачи ИИ'],['motivation','🏆 Мотивация'],['settings','⚙️ Настройки']];
let currentTab=localStorage.getItem('triovist_tab_v22728')||'summary',shipments=[],novelties=[],contentIssuesV227313=[],noveltyDays=localStorage.getItem('triovist_novelty_days_v227313')||'30',loadingExtra=false,extraLoadedAt=0;
const q=id=>document.getElementById(id), num=v=>Number(v)||0, norm=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
const esc2=v=>typeof esc==='function'?esc(v):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function is900(v){
 const vals=Array.isArray(v)?v:[v?.sku,v?.assigned_group,v?.category,v?.subgroup,v?.kind,v?.product,v?.product_name,v?.group_name];
 return vals.some(x=>/^900(?:\/|$)/i.test(String(x||'').trim())||/(^|[^0-9])900\s*(группа|гр\.?)([^0-9]|$)/i.test(String(x||'')));
}
function canSee(){try{const e=String(currentProfile?.email||currentUser?.email||'').trim().toLowerCase(),role=String(currentProfile?.role||'').toLowerCase(),scope=String(currentProfile?.access_scope||'').toLowerCase();return scope==='triovist'||(role==='boss'&&['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru'].includes(e));}catch(_){return false;}}
function triPageActiveV227324(){
  try{
    if(typeof crmActivePage==='function')return crmActivePage()==='triovist';
    return q('page-triovist')?.classList.contains('active')===true;
  }catch(_){return false;}
}
function triRuntimeV227324(){
  try{
    return window.TRIOVIST_RUNTIME_STATE_V227324?.snapshot?.()||{salesItems:[],stockItems:[],stockMeta:{}};
  }catch(_){
    return{salesItems:[],stockItems:[],stockMeta:{}};
  }
}
function isBoss(){try{return typeof triIsBoss==='function'&&triIsBoss();}catch(_){return currentProfile?.role==='boss';}}
function isManager(){try{return typeof triIsManager==='function'&&triIsManager();}catch(_){return String(currentProfile?.access_scope||'').toLowerCase()==='triovist';}}
function managerEmail(){try{return typeof triEmail==='function'?triEmail():String(currentProfile?.email||'').toLowerCase();}catch(_){return '';}}
function skuKey(v){return String(v||'').toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g,'');}
function money(v){return num(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';}
function dateRu(v){if(!v)return'—';const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'.'+m[2]+'.'+m[1]:String(v);}

function css(){if(q('tri-v22728-css'))return;const s=document.createElement('style');s.id='tri-v22728-css';s.textContent=`
.tri-v22728-tabs{display:flex;gap:7px;overflow:auto;padding:3px 0 10px;margin-bottom:10px;position:sticky;top:0;background:var(--bg,#f8fafc);z-index:8}.tri-v22728-tab{white-space:nowrap;border:1px solid var(--border);background:#fff;border-radius:9px;padding:9px 12px;font-weight:700;cursor:pointer}.tri-v22728-tab.active{background:#E6F1FA;border-color:#93C5FD;color:#075985}.tri-v22728-pane{display:none}.tri-v22728-pane.active{display:block}.tri-v22728-period{display:grid;grid-template-columns:220px 180px 180px minmax(220px,1fr);gap:9px}.tri-v22728-kpis{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:9px;margin:10px 0}.tri-v22728-kpi{background:var(--bg);border-radius:10px;padding:11px}.tri-v22728-kpi span{display:block;font-size:10px;color:var(--sub);text-transform:uppercase}.tri-v22728-kpi b{display:block;font-size:18px;margin-top:4px}.tri-v22728-badge{display:inline-flex;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:800}.tri-new{background:#DCFCE7;color:#166534}.tri-ship{background:#DBEAFE;color:#1D4ED8}.tri-warn2{background:#FEF3C7;color:#92400E}.tri-v22728-rec{border:1px solid var(--border);border-radius:10px;padding:11px;margin:8px 0;background:#fff}.tri-v22728-rec b{font-size:13px}.tri-v22728-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}.tri-v22728-table{min-width:1100px}.tri-v22728-info{font-size:11px;color:var(--sub);line-height:1.5}.tri-v22728-upload{display:flex;gap:8px;flex-wrap:wrap;align-items:end}.tri-v22728-empty{padding:24px;text-align:center;color:var(--sub)}
@media(max-width:900px){.tri-v22728-period,.tri-v22728-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.tri-v22728-period,.tri-v22728-kpis{grid-template-columns:1fr}}
`;document.head.appendChild(s);}
function ensurePanes(){
 if(!triPageActiveV227324())return false;
 const page=q('page-triovist');if(!page||!canSee())return false;css();
 if(!q('tri-v22728-tabs')){const tabs=document.createElement('div');tabs.id='tri-v22728-tabs';tabs.className='tri-v22728-tabs';tabs.innerHTML=TABS.map(([id,l])=>`<button class="tri-v22728-tab" data-tab="${id}" onclick="triovistV22728Tab('${id}')">${l}</button>`).join('');const warn=q('triovist-warning');warn?.parentNode.insertBefore(tabs,warn.nextSibling);TABS.forEach(([id])=>{const p=document.createElement('div');p.id='tri-v22728-pane-'+id;p.className='tri-v22728-pane';tabs.parentNode.insertBefore(p,tabs.nextSibling);});}
 moveSections();showTab(currentTab,false);return true;
}
function move(el,tab){if(!el)return;const p=q('tri-v22728-pane-'+tab);if(p&&el.parentNode!==p)p.appendChild(el);}
function closestCard(id){return q(id)?.closest('.card')||null;}
function moveSections(){
 const page=q('page-triovist');if(!page)return;
 // Base analytics controls/card: first card containing period controls.
 move(q('tri-period-mode')?.closest('.card'),'summary'); move(q('tri-kpis'),'summary');move(q('tri-manager-cards'),'summary');
 move(closestCard('tri-groups'),'sales');move(q('tri-alerts'),'sales');move(closestCard('tri-details'),'sales');
 move(q('tri-stock-card'),'stock');
 move(q('tri21-card'),'cards');move(q('tri-task-card'),'tasks');move(q('tri-motivation-card'),'motivation');
 move(q('tri-plans-card'),'settings');move(q('tri-my-groups-card'),'settings');move(q('tri-assignments-card'),'settings');
 ensureExtraCards();
}
function showTab(tab,save=true){
 if(!TABS.some(x=>x[0]===tab))tab='summary';
 currentTab=tab;if(save)localStorage.setItem('triovist_tab_v22728',tab);
 if(!triPageActiveV227324())return;
 TABS.forEach(([id])=>{q('tri-v22728-pane-'+id)?.classList.toggle('active',id===tab);document.querySelector(`.tri-v22728-tab[data-tab="${id}"]`)?.classList.toggle('active',id===tab);});
 if(['shipments','novelties','tasks'].includes(tab))loadExtra(true);
 if(tab==='cards')setTimeout(()=>{if(triPageActiveV227324())window.triovistContentEnsureLoaded?.();},0);
 if(tab==='tasks')setTimeout(()=>{if(triPageActiveV227324())window.triovistTasksEnsureLoaded?.();},0);
 if(tab==='motivation')setTimeout(()=>{if(triPageActiveV227324())window.triovistMotivationEnsureLoaded?.();},0);
}
window.triovistV22728Tab=showTab;

function ensureExtraCards(){
 const sp=q('tri-v22728-pane-shipments'),np=q('tri-v22728-pane-novelties');if(!sp||!np)return;
 if(!q('tri-v22728-ship-card')){const c=document.createElement('div');c.className='card';c.id='tri-v22728-ship-card';c.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><div class="card-title">🚚 Отгрузки в 21vek из 1С</div><div class="tri-v22728-info">Показывает, что фактически отгружено ООО «Триовист» после недельного снимка остатков 21vek. Эти количества уменьшают повторную рекомендацию на отгрузку.</div></div><div class="tri-v22728-upload"><button class="btn-secondary" onclick="document.getElementById('tri-v22728-ship-file').click()">⬆ Загрузить отчёт 1С</button><button class="btn-secondary" onclick="triovistV22728ExportShipments()">⬇ Excel</button><input hidden type="file" id="tri-v22728-ship-file" accept=".xlsx" onchange="triovistV22728ImportShipments(event)"></div></div><div id="tri-v22728-ship-status" class="tri-v22728-info" style="margin:9px 0"></div><div id="tri-v22728-ship-kpi" class="tri-v22728-kpis"></div><div id="tri-v22728-ship-list"></div>`;sp.appendChild(c);}
 if(!q('tri-v22728-new-card')){const c=document.createElement('div');c.className='card';c.id='tri-v22728-new-card';c.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><div class="card-title">🆕 Новинки склада Витебск</div><div class="tri-v22728-info">Новинка = первое в истории появление положительного свободного остатка Витебска &gt; 0. Повторный приход уже известного SKU новинкой не становится. Группа 900 исключена.</div></div><div><label class="form-label">Период</label><select class="form-input" id="tri-v227313-new-days" onchange="triovistV227313SetNoveltyDays(this.value)"><option value="30">30 дней</option><option value="60">60 дней</option><option value="90">90 дней</option><option value="all">Все</option></select></div></div><div id="tri-v22728-new-list" style="margin-top:10px"></div>`;np.appendChild(c);const s=q('tri-v227313-new-days');if(s)s.value=noveltyDays;}
 if(!q('tri-v22728-ai-recs')){const c=document.createElement('div');c.className='card';c.id='tri-v22728-ai-recs';c.style.marginBottom='12px';c.innerHTML=`<div class="card-title">💡 Коммерческие рекомендации по подгруппам</div><div class="tri-v22728-info">Это тот же движок, который формирует месячный план: сначала ранжируется подгруппа по денежному эффекту и реализуемости, затем внутри неё выбираются приоритетные SKU. Чехов только справочно.</div><div id="tri-v22728-ai-rec-list"></div>`;q('tri-v22728-pane-tasks')?.prepend(c);}
}

// 900 — one rule for every Triovist screen. Historical source is left untouched, UI/recommendations/tasks exclude it.
function filter900(){
 shipments=shipments.filter(x=>!is900(x));
 novelties=novelties.filter(x=>!is900(x));
 contentIssuesV227313=contentIssuesV227313.filter(x=>!is900(x));
}

function addPeriodPreset(){const mode=q('tri-period-mode');if(!mode||q('tri-v22728-preset'))return;const host=mode.closest('div');if(!host)return;host.style.display='none';const d=document.createElement('div');d.innerHTML=`<label class="form-label">Период отчёта</label><select class="form-input" id="tri-v22728-preset" onchange="triovistV22728Period()"><option value="month">Месяц</option><option value="quarter">Квартал</option><option value="half">Полугодие</option><option value="nine">9 месяцев</option><option value="year">Год</option><option value="ytd">С начала года</option><option value="custom">Произвольный</option></select>`;host.parentNode.insertBefore(d,host);}
function setYM(y,m){return y+'-'+String(m).padStart(2,'0');}
window.triovistV22728Period=async function(){const preset=q('tri-v22728-preset')?.value||'month',endEl=q('tri-period-month'),startEl=q('tri-period-start'),mode=q('tri-period-mode');if(!endEl||!mode)return;let end=endEl.value||new Date().toISOString().slice(0,7),[y,m]=end.split('-').map(Number),start=end;if(preset==='month'){mode.value='month';}
 else if(preset==='ytd'){mode.value='ytd';}
 else if(preset==='custom'){mode.value='custom';q('tri-start-wrap').style.display='block';return;}
 else{mode.value='custom';if(preset==='quarter')start=setYM(y,Math.floor((m-1)/3)*3+1);if(preset==='half')start=setYM(y,m<=6?1:7);if(preset==='nine')start=setYM(y,1);if(preset==='year')start=setYM(y,1);startEl.value=start;q('tri-start-wrap').style.display='none';}
 await window.triovistPeriodChanged?.();};

async function loadExtra(renderNow=false,force=false){
 if(!triPageActiveV227324())return;
 if(loadingExtra)return;
 if(!force&&extraLoadedAt&&Date.now()-extraLoadedAt<120000){if(renderNow&&triPageActiveV227324()){renderShipments();renderNovelties();renderRecommendations();}return;}
 loadingExtra=true;try{const since=new Date(Date.now()-365*86400000).toISOString().slice(0,10),hub=window.TRIOVIST_DATA_HUB_V227315;const [a,b,c]=await Promise.allSettled([db.from('triovist_shipments').select('*').gte('shipment_date',since).order('shipment_date',{ascending:false}).limit(10000),db.from('triovist_first_positive_stock').select('*').eq('is_legacy',false).order('first_positive_date',{ascending:false}).limit(5000),hub.content({p_manager_email:null})]);shipments=a.status==='fulfilled'?(a.value?.data||[]):[];novelties=b.status==='fulfilled'?(b.value?.data||[]):[];contentIssuesV227313=c.status==='fulfilled'?((c.value?.issues)||[]):[];extraLoadedAt=Date.now();}catch(e){console.warn(V,e);}finally{loadingExtra=false;if(renderNow&&triPageActiveV227324()){renderShipments();renderNovelties();renderRecommendations();}}}
function partnerSnapshot(){const rt=triRuntimeV227324();return rt.stockMeta?.partner?.snapshot_date||'';}
function afterSnapshotQty(sku){const snap=partnerSnapshot(),k=skuKey(sku);return shipments.filter(x=>skuKey(x.sku)===k&&(!snap||String(x.shipment_date)>snap)).reduce((a,x)=>a+num(x.qty),0);}
function renderShipments(){const root=q('tri-v22728-ship-list'),kpi=q('tri-v22728-ship-kpi'),status=q('tri-v22728-ship-status');if(!root)return;const snap=partnerSnapshot(),mgr=isManager()?managerEmail():'';let rows=shipments.filter(x=>!is900(x));if(status)status.textContent='Снимок 21vek: '+(snap||'не определён')+'. Отгрузки после снимка выделены отдельно.';const after=rows.filter(x=>!snap||String(x.shipment_date)>snap),qtyAll=rows.reduce((a,x)=>a+num(x.qty),0),qtyAfter=after.reduce((a,x)=>a+num(x.qty),0),amt=rows.reduce((a,x)=>a+num(x.amount),0);if(kpi)kpi.innerHTML=`<div class="tri-v22728-kpi"><span>Отгрузок строк</span><b>${rows.length}</b></div><div class="tri-v22728-kpi"><span>Количество</span><b>${qtyAll.toLocaleString('ru-RU')}</b></div><div class="tri-v22728-kpi"><span>После снимка 21vek</span><b>${qtyAfter.toLocaleString('ru-RU')}</b></div><div class="tri-v22728-kpi"><span>Сумма</span><b>${money(amt)}</b></div>`;root.innerHTML=rows.length?`<div class="tri-table-wrap"><table class="tri-table tri-v22728-table"><thead><tr><th>Дата</th><th>Документ</th><th>SKU</th><th>Товар</th><th>Количество</th><th>Сумма</th><th>Статус к снимку</th></tr></thead><tbody>${rows.slice(0,1000).map(x=>`<tr><td>${dateRu(x.shipment_date)}</td><td>${esc2(x.document_no||'—')}</td><td><b>${esc2(x.sku)}</b></td><td>${esc2(x.product||'')}</td><td>${num(x.qty).toLocaleString('ru-RU',{maximumFractionDigits:3})}</td><td>${money(x.amount)}</td><td>${(!snap||String(x.shipment_date)>snap)?'<span class="tri-v22728-badge tri-ship">после снимка</span>':'в снимке/раньше'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="tri-v22728-empty">Отгрузок пока нет. Загрузите Excel 1С или дождитесь автоматического импорта.</div>';}
function stockBySku(sku){
 const rows=triRuntimeV227324().stockItems||[];
 return rows.find(x=>!is900(x)&&skuKey(x.sku)===skuKey(sku))||null;
}
function noveltySalesV227313(sku){
 const rows=(triRuntimeV227324().salesItems||[]).filter(x=>!is900(x)&&skuKey(x.sku)===skuKey(sku));
 return{revenue:rows.reduce((a,x)=>a+num(x.current_revenue),0),qty:rows.reduce((a,x)=>a+num(x.current_qty),0)};
}
window.triovistV227313SetNoveltyDays=function(v){noveltyDays=['30','60','90','all'].includes(String(v))?String(v):'30';localStorage.setItem('triovist_novelty_days_v227313',noveltyDays);renderNovelties();};
function renderNovelties(){const root=q('tri-v22728-new-list');if(!root)return;const days=noveltyDays==='all'?null:Number(noveltyDays)||30,cutoff=days?new Date(Date.now()-days*86400000).toISOString().slice(0,10):null,rows=novelties.filter(x=>!is900(x)&&(!cutoff||String(x.first_positive_date||'')>=cutoff));root.innerHTML=rows.length?rows.map(x=>{const st=stockBySku(x.sku)||{},sh=shipments.filter(r=>skuKey(r.sku)===skuKey(x.sku)).sort((a,b)=>String(b.shipment_date).localeCompare(String(a.shipment_date)))[0],sl=noveltySalesV227313(x.sku);return `<div class="tri-v22728-rec"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>${esc2(x.sku)} · ${esc2(x.product||st.product||'')}</b><div class="tri-v22728-info">Первый положительный приход: ${dateRu(x.first_positive_date)} · первый остаток: ${num(x.first_positive_qty).toLocaleString('ru-RU')} шт. · сейчас Витебск: ${num(st.own_qty).toLocaleString('ru-RU')} шт. · 21vek: ${num(st.partner_total).toLocaleString('ru-RU')} шт.</div><div class="tri-v22728-info">${sh?'Отгрузка в Триовист: '+dateRu(sh.shipment_date)+' · '+num(sh.qty).toLocaleString('ru-RU')+' шт.':'Отгрузок в Триовист ещё нет'} · ${sl.revenue>0||sl.qty>0?'Продажи появились: '+money(sl.revenue)+' · '+num(sl.qty).toLocaleString('ru-RU')+' шт.':'Продаж пока нет'}</div></div>${sl.revenue>0||sl.qty>0?'<span class="tri-v22728-badge tri-new">✅ продажи есть</span>':sh?'<span class="tri-v22728-badge tri-ship">🚚 отгружено</span>':'<span class="tri-v22728-badge tri-new">🆕 запуск</span>'}</div></div>`;}).join(''):`<div class="tri-v22728-empty">Новинок за выбранный период (${noveltyDays==='all'?'все':noveltyDays+' дней'}) нет.</div>`;}
function renderRecommendations(){
 const root=q('tri-v22728-ai-rec-list');if(!root||!triPageActiveV227324())return;
 if(typeof window.triovistCommercialEngineV227313!=='function'){root.innerHTML='<div class="tri-v22728-empty">Коммерческий движок ещё не загрузился. Обновите страницу без кэша.</div>';return;}
 const rt=triRuntimeV227324();
 const stocks=(rt.stockItems||[]).filter(x=>!is900(x));
 const salesRows=(rt.salesItems||[]).filter(x=>!is900(x));
 const pack=window.triovistCommercialEngineV227313({salesData:{items:salesRows},stockData:{items:stocks},contentIssues:contentIssuesV227313,shipments,novelties,partnerSnapshotDate:rt.stockMeta?.partner?.snapshot_date||'',ownReportDate:rt.stockMeta?.own?.report_date||''});let rec=pack.candidates||[];if(isManager())rec=rec.filter(x=>String(x.manager_email||'').toLowerCase()===managerEmail());const d=pack.diagnostics||{};if(!rec.length){root.innerHTML=`<div class="tri-v22728-empty"><b>Сильных подгрупп сейчас нет.</b><div class="tri-v22728-info" style="margin-top:7px">Проверено ${num(d.scanned)} SKU: без остатка Витебска — ${num(d.no_vitebsk)}, уже заняты активными задачами — ${num(d.blocked_active)}, группа 900 — ${num(d.group_900)}, без коммерческого сигнала — ${num(d.no_signal)}.</div></div>`;return;}root.innerHTML='<div class="tri-v22728-info" style="margin:6px 0 9px">Движок нашёл '+rec.length+' коммерчески значимых подгрупп. Ниже первые '+Math.min(15,rec.length)+'.</div>'+rec.slice(0,15).map(r=>{const ctx=r.commercial_context||{};return `<div class="tri-v22728-rec"><div style="display:flex;justify-content:space-between;gap:8px"><div><b>📊 ${esc2(r.group_name||ctx.subgroup_name||'Подгруппа')} · ${num(ctx.selected_sku_count)} SKU</b><div class="tri-v22728-info">${esc2(r.basis||'')}</div></div><span class="tri-v22728-badge ${num(r.priority_score)>=90?'tri-warn2':'tri-ship'}">приоритет ${num(r.priority_score)}</span></div><div class="tri-v22728-info" style="margin-top:5px"><b>Рекомендация:</b> ${esc2(r.task_text||r.next_step||'Отработать приоритетные SKU подгруппы.')}</div></div>`;}).join('');}

async function xlsx(){if(window.XLSX)return window.XLSX;if(typeof window._loadSheetJS==='function')return window._loadSheetJS();throw new Error('Модуль Excel не загружен');}
function parseD(v){if(v instanceof Date&&!isNaN(v))return v.toISOString().slice(0,10);if(typeof v==='number'){const d=new Date(Math.round((v-25569)*86400000));return d.toISOString().slice(0,10);}const s=String(v||'').trim();let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return `${m[1]}-${m[2]}-${m[3]}`;m=s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/);return m?`${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`:'';}
function col(headers,names){const h=headers.map(norm);for(const n of names){const k=norm(n),i=h.findIndex(x=>x===k||x.startsWith(k));if(i>=0)return i;}return-1;}
async function parseShipmentFile(file){const X=await xlsx(),wb=X.read(await file.arrayBuffer(),{type:'array',cellDates:true});let best=null;for(const sn of wb.SheetNames){const a=X.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:'',raw:true});for(let i=0;i<Math.min(30,a.length);i++){const h=a[i]||[],sku=col(h,['Артикул','SKU']),qty=col(h,['Количество','Кол-во','Кол.','Количество товара']),dt=col(h,['Дата','Дата документа','Период']);if(sku>=0&&qty>=0){best={a,hr:i,h,sku,qty,dt,prod:col(h,['Номенклатура','Товар','Наименование']),doc:col(h,['Документ','Номер документа','Регистратор']),sum:col(h,['Сумма','Выручка','Сумма с НДС']),client:col(h,['Контрагент','Клиент'])};break;}}if(best)break;}if(!best)throw new Error('Не найдена таблица отгрузок. Нужны как минимум колонки Артикул и Количество.');const out=new Map();for(let i=best.hr+1;i<best.a.length;i++){const r=best.a[i]||[],sku=String(r[best.sku]||'').trim().replace(/^'/,'');if(!/^\d+(?:\/\d+){1,6}$/.test(sku)||is900({sku,product:r[best.prod]}))continue;if(best.client>=0&&!norm(r[best.client]).includes('триовист'))continue;const date=parseD(best.dt>=0?r[best.dt]:'')||new Date().toISOString().slice(0,10),doc=String(best.doc>=0?r[best.doc]:'').trim()||'без документа',key=[date,doc,sku].join('|'),old=out.get(key)||{shipment_date:date,document_no:doc,sku,product:String(best.prod>=0?r[best.prod]:'').trim(),qty:0,amount:0,source_file:file.name};old.qty+=num(r[best.qty]);old.amount+=num(best.sum>=0?r[best.sum]:0);out.set(key,old);}return [...out.values()].filter(x=>x.qty!==0);}
window.triovistV22728ImportShipments=async function(event){const f=event.target.files?.[0];event.target.value='';if(!f)return;const st=q('tri-v22728-ship-status');try{st.textContent='Читаю отчёт 1С…';const rows=await parseShipmentFile(f);if(!rows.length)throw new Error('В отчёте не найдено отгрузок Триовисту.');if(!confirm(`Загрузить ${rows.length} строк отгрузок из «${f.name}»?`))return;const user=managerEmail();for(let i=0;i<rows.length;i+=250){const batch=rows.slice(i,i+250).map(x=>({...x,imported_by:user,imported_at:new Date().toISOString()}));const r=await db.from('triovist_shipments').upsert(batch,{onConflict:'shipment_date,document_no,sku'});if(r.error)throw r.error;st.textContent='Загружено '+Math.min(i+250,rows.length)+' из '+rows.length+'…';}st.textContent='✅ Отгрузки загружены. Рекомендации пересчитаны с учётом отгруженного после недельного снимка.';extraLoadedAt=0;await loadExtra(true,true);try{await window.triovistTasksReload?.(true);}catch(_){}}catch(e){st.textContent='❌ '+(e.message||e);alert(st.textContent);}};
window.triovistV22728ExportShipments=async function(){if(!shipments.length)return alert('Нет отгрузок для выгрузки');try{const X=await xlsx(),wb=X.utils.book_new(),ws=X.utils.json_to_sheet(shipments.map(x=>({'Дата':x.shipment_date,'Документ':x.document_no,'Артикул':x.sku,'Товар':x.product,'Количество':x.qty,'Сумма BYN':x.amount,'Файл':x.source_file})));X.utils.book_append_sheet(wb,ws,'Отгрузки 1С');X.writeFile(wb,'Триовист_отгрузки_1С_'+new Date().toISOString().slice(0,10)+'.xlsx');}catch(e){alert(e.message||e);}};

function patchRender(){
 if(!triPageActiveV227324())return;
 filter900();if(!ensurePanes())return;addPeriodPreset();moveSections();
 if(currentTab==='shipments')renderShipments();
 if(currentTab==='novelties')renderNovelties();
 if(currentTab==='tasks')renderRecommendations();
}
const observer=new MutationObserver(()=>{if(typeof crmActivePage==='function'&&crmActivePage()!=='triovist')return;clearTimeout(window.__triV22728Timer);window.__triV22728Timer=setTimeout(patchRender,60);});const triObserverRoot=q('page-triovist');if(triObserverRoot)observer.observe(triObserverRoot,{childList:true,subtree:true});
const oldRender=window.renderTriovist;window.renderTriovist=function(){
 const r=oldRender?.apply(this,arguments);
 if(triPageActiveV227324())setTimeout(()=>{if(triPageActiveV227324())patchRender();},0);
 return r;
};try{renderTriovist=window.renderTriovist;}catch(_){ }
const oldReload=window.triovistReload;window.triovistReload=async function(){
 const r=await oldReload?.apply(this,arguments);
 if(!triPageActiveV227324())return r;
 filter900();if(['shipments','novelties','tasks'].includes(currentTab)){extraLoadedAt=0;await loadExtra(false,true);}
 patchRender();return r;
};
// Не запускаем 10k отгрузок + 5k новинок + карточки в фоне при старте всей CRM.
// Эти данные загружаются лениво только при открытии соответствующей вкладки Триовиста.
setTimeout(()=>{if(triPageActiveV227324()&&ensurePanes()){filter900();addPeriodPreset();patchRender();}},300);
window.RESANTA_TRIOVIST_V22728=Object.freeze({version:V,group900Excluded:true,tabs:true,shipments1C:true,periodPresets:true,novelties:true,aiVitebskOnly:true,chekhovReferenceOnly:true,noBuyerQuestionsTasks:true,noDeliveryTasks:true,hiddenPageNoWork:true,runtimeBridgeV227324:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 49 ===== */
// ============================================================================
// RESANTA CRM v22.7.31 · Triovist ROOT FIX
// 1) вкладки не зависят от lexical const другого <script>;
// 2) видимый аудит импорта продаж: источник -> CRM;
// 3) кнопка «Обновить экран» перечитывает Supabase, но не маскируется под импорт.
(function(){
'use strict';
const V='v22.7.31';
const TAB_IDS=['summary','sales','stock','shipments','novelties','cards','tasks','motivation','settings'];
function el(id){return document.getElementById(id);}
function profileEmail(){try{return String(currentProfile?.email||currentUser?.email||'').trim().toLowerCase();}catch(_){return'';}}
function canSeeTri(){try{const p=currentProfile||{};return String(p.access_scope||'').toLowerCase()==='triovist'||(String(p.role||'').toLowerCase()==='boss'&&['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru'].includes(profileEmail()));}catch(_){return false;}}
function triActive31(){
  try{
    if(typeof crmActivePage==='function')return crmActivePage()==='triovist';
    return el('page-triovist')?.classList.contains('active')===true;
  }catch(_){return false;}
}
function esc31(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function money31(v){const n=Number(v);return Number.isFinite(n)?n.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN':'—';}
function dt31(v){if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('ru-RU');}
function ensureTabs31(){
  if(!triActive31()||!canSeeTri())return false;
  const page=el('page-triovist'),warn=el('triovist-warning');if(!page||!warn)return false;
  // Старый блок v22.7.28 теперь уже видит профиль напрямую. Если вкладки ещё не
  // успели создатьcя, стимулируем штатный render и ждём один тик.
  if(!el('tri-v22728-tabs')){try{window.renderTriovist?.();}catch(_){} }
  const tabs=el('tri-v22728-tabs');if(!tabs)return false;
  tabs.style.position='sticky';tabs.style.top='0';tabs.style.zIndex='20';
  tabs.setAttribute('data-root-fix',V);
  TAB_IDS.forEach(id=>{const b=tabs.querySelector('[data-tab="'+id+'"]');if(b)b.type='button';});
  return true;
}
async function loadSalesAudit31(){
  if(!triActive31()||!canSeeTri()||typeof db==='undefined')return;
  try{
    const r=await db.from('triovist_sales_import_audit').select('*').order('checked_at',{ascending:false}).limit(20);
    if(r.error)throw r.error;
    window.__triSalesAudit31=Array.isArray(r.data)?r.data:[];
  }catch(e){
    console.warn(V+' sales audit',e);window.__triSalesAudit31=[];
  }
  renderSalesAudit31();
}
function statusText31(s){return({updated:'✅ обновлено',no_change:'✅ уже совпадает',regression_blocked:'⚠️ регрессия заблокирована',no_report:'⚠️ отчёт не найден',error:'❌ ошибка'})[s]||String(s||'—');}
function renderSalesAudit31(){
  if(!ensureTabs31())return;
  const pane=el('tri-v22728-pane-sales');if(!pane)return;
  let card=el('tri-v22731-sales-audit');
  if(!card){card=document.createElement('div');card.id='tri-v22731-sales-audit';card.className='card';card.style.marginBottom='12px';pane.prepend(card);}
  const rows=window.__triSalesAudit31||[],last=rows[0];
  if(!last){card.innerHTML='<div class="card-title">🔄 Контроль обновления продаж</div><div class="tri-note">Аудит ещё пуст. После первого запуска workflow v22.7.31 здесь появятся файл, время письма, сумма источника и сумма CRM.</div>';return;}
  const mismatch=last.source_revenue!=null&&last.crm_revenue_after!=null&&Math.abs(Number(last.source_revenue)-Number(last.crm_revenue_after))>0.01;
  card.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><div class="card-title">🔄 Контроль обновления продаж</div><div class="tri-note">Теперь видно не только время обновления, но и что именно было прочитано и записано.</div></div><b>${esc31(statusText31(last.status))}</b></div>
  <div class="tri-stock-grid" style="margin-top:10px">
    <div class="tri-stock-kpi"><span class="tri-note">Последняя проверка</span><b>${esc31(dt31(last.checked_at))}</b><span class="tri-note">период ${esc31(String(last.report_month||'').slice(0,7)||'—')}</span></div>
    <div class="tri-stock-kpi"><span class="tri-note">Источник</span><b>${esc31(last.source_file||'—')}</b><span class="tri-note">письмо ${esc31(dt31(last.email_sent_at))}</span></div>
    <div class="tri-stock-kpi"><span class="tri-note">Сумма источника</span><b>${money31(last.source_revenue)}</b><span class="tri-note">${Number(last.source_rows||0).toLocaleString('ru-RU')} SKU-строк</span></div>
    <div class="tri-stock-kpi"><span class="tri-note">Сумма CRM после</span><b style="color:${mismatch?'var(--r)':'var(--g)'}">${money31(last.crm_revenue_after)}</b><span class="tri-note">${mismatch?'НЕ СОВПАДАЕТ — workflow должен быть красным':'совпадает с источником'}</span></div>
  </div>${last.details?'<div class="tri-note" style="margin-top:8px">'+esc31(last.details)+'</div>':''}`;
}
function reinforce31(){
  if(!triActive31()||!canSeeTri())return;
  ensureTabs31();renderSalesAudit31();
  const page=el('page-triovist');if(page&&page.classList.contains('active'))setTimeout(ensureTabs31,80);
}
const oldReload31=window.triovistReload;
if(typeof oldReload31==='function')window.triovistReload=async function(){
 const r=await oldReload31.apply(this,arguments);
 if(triActive31()){await loadSalesAudit31();setTimeout(()=>{if(triActive31())reinforce31();},0);}
 return r;
};
// При входе в раздел/авторизации профиль может появиться позже DOM, поэтому не
// полагаемся на один таймер при старте.
const obs31=new MutationObserver(()=>{clearTimeout(window.__triRoot31Timer);window.__triRoot31Timer=setTimeout(reinforce31,80);});
const triRoot31=el('page-triovist');if(triRoot31)obs31.observe(triRoot31,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
window.addEventListener('focus',()=>{if(triActive31())setTimeout(()=>{if(triActive31())reinforce31();},60);});
setTimeout(async()=>{if(triActive31()){reinforce31();await loadSalesAudit31();}},500);
setTimeout(()=>{if(triActive31())reinforce31();},1600);
window.RESANTA_TRIOVIST_V22731=Object.freeze({version:V,tabsRootFix:true,salesAudit:true,taskConstraintAdaptive:true,hiddenPageNoWork:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 50 ===== */
// ============================================================================
// RESANTA CRM v22.7.31.3 · ONE COMMERCIAL ENGINE
// Same candidate logic for recommendations and AI task generation.
// ============================================================================
(function(){
'use strict';
const V='v22.7.31.3',ALEKS='aleksandrenko_av@resanta.ru',KRISHTAL='krishtal_na@resanta.ru',MANAGERS=[ALEKS,KRISHTAL];
const n=v=>Number(v)||0,skuKey=v=>String(v||'').toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g,''),norm=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ').trim();
const money=v=>n(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN',qty=v=>n(v).toLocaleString('ru-RU',{maximumFractionDigits:2});
const managerName=e=>String(e||'').toLowerCase()===ALEKS?'Александренко':String(e||'').toLowerCase()===KRISHTAL?'Кришталь':'—';
function is900(...vals){return vals.some(v=>/^900(?:\/|$)/i.test(String(v||'').trim())||/(^|[^0-9])900\s*(группа|гр\.?)([^0-9]|$)/i.test(String(v||'')));}
function ageDays(v){if(!v)return 9999;const d=new Date(String(v).length===10?String(v)+'T12:00:00':v);return Number.isNaN(d.getTime())?9999:Math.floor((Date.now()-d.getTime())/86400000);}
function plusDays(days){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+days);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function key(manager,sku,reason){return 'v227313|'+String(manager||'').toLowerCase()+'|'+skuKey(sku)+'|'+reason;}
function base(manager,group,sku,product,reason,score,ctx,fields={}){const p=Math.max(0,Math.min(100,Math.round(score)));return{candidate_key:key(manager,sku,reason),generator_version:V,reason_code:reason,manager_email:String(manager||'').toLowerCase(),manager_name:managerName(manager),group_name:group||'Не распределено',sku:String(sku||''),product_name:product||'',task_type:fields.task_type||'listing',priority_score:p,base_priority:p,due_date:fields.due_date||plusDays(5),title:fields.title||('Коммерческая задача '+sku),task_text:fields.task_text||'',basis:fields.basis||'',expected_result:fields.expected_result||'',criteria:fields.criteria||'',next_step:fields.next_step||'',commercial_context:{...(ctx||{}),candidate_key:key(manager,sku,reason),generator_version:V,reason_code:reason,sku:String(sku||''),product_name:product||'',group_name:group||'Не распределено'}};}
function contentType(issue){const t=String(issue?.issue_type||'');if(['question_unanswered','no_questions','delivery_minsk_slow'].includes(t))return null;if(['listing_outside_top60','listing_31_60'].includes(t))return'listing';if(t==='out_of_stock')return'availability';if(['no_reviews','low_product_rating','low_last_review','negative_review_unanswered'].includes(t))return'reputation';if(['no_video','video_available_not_uploaded','few_photos'].includes(t))return'media';if(['no_description','no_warranty'].includes(t))return'content';return null;}
window.triovistCommercialEngineV227313=function(input={}){
  const salesData=input.salesData||{},stockData=input.stockData||{},shipments=input.shipments||[],novelties=input.novelties||[],issues=input.contentIssues||[],partnerDate=String(input.partnerSnapshotDate||stockData?.imports?.partner?.snapshot_date||''),ownDate=String(input.ownReportDate||stockData?.imports?.own?.report_date||'');
  const d={scanned:0,no_vitebsk:0,already_shipped:0,group_900:0,no_signal:0,deduped:0,raw_candidates:0,candidates:0};
  const shipAfter=new Map();for(const x of shipments){if(partnerDate&&String(x.shipment_date||'')<=partnerDate)continue;const k=skuKey(x.sku);shipAfter.set(k,(shipAfter.get(k)||0)+n(x.qty));}
  const stocks=(stockData.items||[]),stockBy=new Map();for(const x of stocks){if(is900(x.sku,x.assigned_group,x.category,x.subgroup)){d.group_900++;continue;}const k=String(x.manager_email||'').toLowerCase()+'|'+skuKey(x.sku);if(x.manager_email)stockBy.set(k,x);if(!stockBy.has('|'+skuKey(x.sku)))stockBy.set('|'+skuKey(x.sku),x);}
  const salesMap=new Map();for(const x of (salesData.items||[])){const manager=String(x.manager_email||'').toLowerCase(),sku=String(x.sku||'');if(!MANAGERS.includes(manager)||!sku)continue;if(is900(sku,x.assigned_group,x.category)){d.group_900++;continue;}const k=manager+'|'+skuKey(sku);let a=salesMap.get(k);if(!a){a={manager_email:manager,sku,product:x.product||x.product_name||'',group:x.assigned_group||x.category||'Не распределено',cur:0,prev:0,qtyCur:0,qtyPrev:0};salesMap.set(k,a);}a.cur+=n(x.current_revenue);a.prev+=n(x.previous_revenue);a.qtyCur+=n(x.current_qty);a.qtyPrev+=n(x.previous_qty);if(!a.product)a.product=x.product||x.product_name||'';}
  const novMap=new Map(novelties.map(x=>[skuKey(x.sku),x]));
  const best=new Map();
  function put(c){if(!c)return;d.raw_candidates++;const own=n(c.commercial_context?.own_qty);if(own<=0){d.no_vitebsk++;return;}if(is900(c.sku,c.group_name)){d.group_900++;return;}const k=c.manager_email+'|'+skuKey(c.sku),old=best.get(k);if(!old||n(c.priority_score)>n(old.priority_score)){if(old)d.deduped++;best.set(k,c);}else d.deduped++;}
  for(const a of salesMap.values()){
    d.scanned++;const st=stockBy.get(a.manager_email+'|'+skuKey(a.sku))||stockBy.get('|'+skuKey(a.sku));if(!st||n(st.own_qty)<=0){d.no_vitebsk++;continue;}
    const own=n(st.own_qty),partner=n(st.partner_total),chekhov=n(st.chekhov_qty),sales90=n(st.sales_90),rawRec=n(st.recommended),shipped=n(shipAfter.get(skuKey(a.sku))),rec=Math.max(0,rawRec-shipped),loss=Math.max(0,a.prev-a.cur),nov=novMap.get(skuKey(a.sku));
    const firstDate=nov?.first_positive_date||nov?.first_seen_date||null,ctx={current_revenue:a.cur,previous_revenue:a.prev,loss,partner_total:partner,partner_orders:n(st.partner_orders),stock_days:st.stock_days==null?null:n(st.stock_days),own_qty:own,chekhov_qty:chekhov,sales_90:sales90,recommended_qty:rec,shipped_after_snapshot:shipped,partner_snapshot_date:partnerDate,own_report_date:ownDate,novelty_first_positive:firstDate};let signal=false;
    if(a.prev>0&&a.cur<=0.01){signal=true;put(base(a.manager_email,a.group,a.sku,a.product,'lost_sales',100,ctx,{task_type:'listing',due_date:plusDays(3),title:'Вернуть продажи SKU '+a.sku,task_text:'Проверить карточку и наличие SKU '+a.sku+' на 21vek, определить причину нулевых продаж и восстановить продажу позиции.'+(shipped>0?' После снимка уже отгружено '+qty(shipped)+' шт.; повторную отгрузку не ставить.':''),basis:'В аналогичном периоде '+money(a.prev)+', сейчас '+money(a.cur)+'. Потерянный оборот '+money(loss)+'. Витебск '+qty(own)+' шт., 21vek '+qty(partner)+' шт.',expected_result:'SKU снова получает подтверждённые продажи либо зафиксирована конкретная причина блокировки.',criteria:'Следующий свежий отчёт 21vek подтверждает продажи > 0 либо документированную причину.',next_step:'После появления продаж проверить динамику SKU.'}));}
    if(partner<=0){if(shipped>0){d.already_shipped++;}else{signal=true;const q=Math.min(own,Math.max(1,Math.ceil(rec>0?rec:(sales90>0?sales90/6:1))));put(base(a.manager_email,a.group,a.sku,a.product,'no_stock_21vek',95,ctx,{task_type:'availability',due_date:plusDays(3),title:'Восстановить наличие 21vek · '+a.sku,task_text:'Согласовать и провести отгрузку SKU '+a.sku+' из Витебска до '+qty(q)+' шт. и проверить появление товара на 21vek.',basis:'21vek 0 шт.; Витебск '+qty(own)+' шт.; продажи за 90 дней '+qty(sales90)+' шт.; рекомендация после отгрузок '+qty(rec)+' шт.',expected_result:'Товар появился в наличии 21vek без повторной лишней отгрузки.',criteria:'Отгрузка подтверждена 1С и свежий снимок 21vek показывает наличие.',next_step:'Проверить продажи после появления товара.'}));}}
    if(firstDate&&ageDays(firstDate)<=60){signal=true;put(base(a.manager_email,a.group,a.sku,a.product||nov?.product,'novelty',90,ctx,{task_type:'novelty',due_date:plusDays(5),title:'Запустить новинку · '+a.sku,task_text:shipped>0?'После снимка уже отгружено '+qty(shipped)+' шт. Повторную отгрузку не ставить. Проверить появление карточки/товара и запуск первых продаж.':'Проверить готовность карточки 21vek по новинке '+a.sku+', согласовать первую отгрузку только из Витебска и проконтролировать запуск продаж.',basis:'Первый положительный остаток Витебска '+String(firstDate)+': '+qty(nov?.first_positive_qty||own)+' шт. Сейчас Витебск '+qty(own)+' шт., 21vek '+qty(partner)+' шт.',expected_result:'Новинка выведена на 21vek и получает первые продажи.',criteria:'Свежий отчёт подтверждает карточку/наличие и первые продажи SKU.',next_step:'Оценить первые продажи и повторный заказ.'}));}
    if(a.prev>0&&a.cur>0&&a.cur<a.prev*.85){signal=true;const decline=(a.prev-a.cur)/a.prev*100;put(base(a.manager_email,a.group,a.sku,a.product,'falling_sales',85,ctx,{task_type:'listing',due_date:plusDays(5),title:'Остановить падение SKU '+a.sku,task_text:'Разобрать падение SKU '+a.sku+': проверить наличие, позицию карточки и коммерческую причину. Зафиксировать одно конкретное действие на восстановление продаж.',basis:'Продажи снизились с '+money(a.prev)+' до '+money(a.cur)+' (−'+decline.toFixed(1)+'%). Потеря '+money(loss)+'.',expected_result:'Падение остановлено, динамика SKU улучшается.',criteria:'Следующий сопоставимый отчёт продаж + подтверждение выполненного действия.',next_step:'Если падение сохраняется — вынести руководителю причину и следующий шаг.'}));}
    if(rec>0&&partner>0&&(st.stock_days==null||n(st.stock_days)<14)){if(shipped>0){d.already_shipped++;}else{signal=true;const q=Math.min(own,Math.max(1,Math.ceil(rec)));put(base(a.manager_email,a.group,a.sku,a.product,'low_stock_21vek',80,ctx,{task_type:'availability',due_date:plusDays(5),title:'Не допустить out-of-stock · '+a.sku,task_text:'Согласовать пополнение SKU '+a.sku+' с Витебска до '+qty(q)+' шт., чтобы не допустить обнуления 21vek.',basis:'21vek '+qty(partner)+' шт.; запас '+(st.stock_days==null?'не рассчитан':qty(st.stock_days)+' дн.')+'; рекомендация '+qty(rec)+' шт.; Витебск '+qty(own)+' шт.',expected_result:'Запас 21vek пополнен до снижения продаж из-за отсутствия.',criteria:'Отгрузка подтверждена 1С; следующий снимок показывает достаточный остаток.',next_step:'На следующем снимке пересчитать потребность.'}));}}
    if(!signal)d.no_signal++;
  }
  // Novelties with no sales rows are still commercial candidates.
  for(const nov of novelties){const sku=String(nov.sku||''),firstDate=nov.first_positive_date||nov.first_seen_date;if(!sku||!firstDate||ageDays(firstDate)>60)continue;if(is900(sku,nov.product)){d.group_900++;continue;}for(const manager of MANAGERS){const st=stockBy.get(manager+'|'+skuKey(sku));if(!st)continue;if(salesMap.has(manager+'|'+skuKey(sku)))continue;d.scanned++;const own=n(st.own_qty);if(own<=0){d.no_vitebsk++;continue;}const partner=n(st.partner_total),shipped=n(shipAfter.get(skuKey(sku))),ctx={current_revenue:0,previous_revenue:0,loss:0,partner_total:partner,partner_orders:n(st.partner_orders),stock_days:st.stock_days==null?null:n(st.stock_days),own_qty:own,chekhov_qty:n(st.chekhov_qty),sales_90:n(st.sales_90),recommended_qty:Math.max(0,n(st.recommended)-shipped),shipped_after_snapshot:shipped,partner_snapshot_date:partnerDate,own_report_date:ownDate,novelty_first_positive:firstDate};put(base(manager,st.assigned_group||'Не распределено',sku,nov.product||st.product||'','novelty',90,ctx,{task_type:'novelty',due_date:plusDays(5),title:'Запустить новинку · '+sku,task_text:shipped>0?'После снимка уже отгружено '+qty(shipped)+' шт. Повторную отгрузку не ставить. Проверить появление товара и первые продажи.':'Проверить карточку 21vek, согласовать первую отгрузку только из Витебска и запустить первые продажи.',basis:'Первый положительный остаток Витебска '+String(firstDate)+': '+qty(nov.first_positive_qty||own)+' шт. Сейчас Витебск '+qty(own)+' шт., 21vek '+qty(partner)+' шт.',expected_result:'Новинка доступна на 21vek и получает первые продажи.',criteria:'Свежий отчёт подтверждает наличие/карточку и первые продажи.',next_step:'Оценить первые продажи и повторный заказ.'}));}}
  // Significant card issues are the last priority tier.
  for(const issue of issues){if(!issue||!['open','needs_review'].includes(String(issue.status||'')))continue;const manager=String(issue.manager_email||'').toLowerCase(),sku=String(issue.sku||''),taskType=contentType(issue);if(!MANAGERS.includes(manager)||!sku||!taskType)continue;if(is900(sku,issue.category,issue.subgroup)){d.group_900++;continue;}const st=stockBy.get(manager+'|'+skuKey(sku))||stockBy.get('|'+skuKey(sku));if(!st||n(st.own_qty)<=0){d.no_vitebsk++;continue;}d.scanned++;const shipped=n(shipAfter.get(skuKey(sku)));if(taskType==='availability'&&shipped>0){d.already_shipped++;continue;}const sale=salesMap.get(manager+'|'+skuKey(sku)),cur=n(sale?.cur),prev=n(sale?.prev),severity=String(issue.severity||''),score=severity==='critical'?70:severity==='warning'?65:60,ctx={current_revenue:cur,previous_revenue:prev,loss:Math.max(0,prev-cur),partner_total:n(st.partner_total),partner_orders:n(st.partner_orders),stock_days:st.stock_days==null?null:n(st.stock_days),own_qty:n(st.own_qty),chekhov_qty:n(st.chekhov_qty),sales_90:n(st.sales_90),recommended_qty:Math.max(0,n(st.recommended)-shipped),shipped_after_snapshot:shipped,partner_snapshot_date:partnerDate,own_report_date:ownDate,content_issue_type:issue.issue_type,content_issue_title:issue.issue_title,product_url:issue.product_url||'',current_value:issue.current_value||'',target_value:issue.target_value||''};put(base(manager,issue.category||issue.subgroup||st.assigned_group||'Не распределено',sku,issue.product_name||st.product||'','card_issue',score,ctx,{task_type:taskType,due_date:plusDays(7),title:(issue.issue_title||'Исправить карточку')+' · '+sku,task_text:'Исправить существенную проблему карточки SKU '+sku+': '+String(issue.issue_title||issue.issue_type||'').trim()+'.',basis:'Свежий контроль карточек 21vek: '+String(issue.current_value||issue.issue_title||'проблема активна')+'. Витебск '+qty(st.own_qty)+' шт.; 21vek '+qty(st.partner_total)+' шт.',expected_result:String(issue.target_value||'Проблема карточки устранена и подтверждена свежим отчётом.'),criteria:'Следующий Excel контроля карточек переводит проблему в исправленную/подтверждённую.',next_step:'После исправления проверить влияние на позицию и продажи.'}));}
  const candidates=[...best.values()].sort((a,b)=>n(b.priority_score)-n(a.priority_score)||n(b.commercial_context?.loss)-n(a.commercial_context?.loss)||a.sku.localeCompare(b.sku,'ru'));d.candidates=candidates.length;return{candidates,diagnostics:d};
};
window.RESANTA_TRIOVIST_V227313=Object.freeze({version:V,oneCommercialEngine:true,firstPositiveNovelty:true,oneAiButton:true,priorityFromScore:true});
window.RESANTA_TRIOVIST_V227314=Object.freeze({version:'v22.7.31.4',timeoutRootFix:true,finalPoolMax10:true,oneShotTaskState:true,createdIdsOnlyAI:true});
window.RESANTA_TRIOVIST_V227315=Object.freeze({version:'v22.7.31.5',sharedDataHub:true,lazyExtraData:true,lazyCardsTasksAndMotivation:true,noGlobalTriovistBackgroundLoad:true,scopedMutationObserver:true,aiReusesLoadedSales:true});
window.RESANTA_TRIOVIST_V227324=Object.freeze({
  version:'v22.7.32.2.4',
  runtimeScopeFixed:true,
  triStockMetaReferenceErrorFixed:true,
  hiddenTriovistNoHeavyWork:true,
  noSqlChanges:true,
  gpsUntouched:true,
  performanceCoreUntouched:true
});
})();

/* ===== ORIGINAL INLINE SCRIPT 51 ===== */
// ============================================================================
// RESANTA CRM v22.7.31.6 · CRM PERFORMANCE CORE + VIP FREEZE ROOT FIX
// Цель: тяжёлая аналитика никогда не блокирует навигацию. Бизнес-логика не меняется.
// ============================================================================
(function(){
'use strict';
if(window.RESANTA_CRM_PERF_V227316)return;
const VERSION='v22.7.31.6';
const legacyVipSummary=window.getVipClientSummary;

// 1) Безопасный single-flight для одинаковых параллельных чтений больших таблиц.
// Никакого TTL-кэша: после завершения запроса следующий вызов снова читает свежие данные.
try{
  const baseLoadAllRows=window.loadAllRows||loadAllRows;
  const rowFlights=new Map();
  const fastLoadAllRows=async function(table){
    const key=String(table||'');
    if(rowFlights.has(key))return rowFlights.get(key);
    const p=Promise.resolve().then(()=>baseLoadAllRows.call(this,table)).finally(()=>{if(rowFlights.get(key)===p)rowFlights.delete(key);});
    rowFlights.set(key,p);return p;
  };
  window.loadAllRows=fastLoadAllRows;try{loadAllRows=fastLoadAllRows;}catch(_){ }
}catch(e){console.warn(VERSION+' loadAllRows single-flight',e);}

// 2) Не допускаем двух одновременных полных loadData-цепочек.
try{
  const baseLoadData=window.loadData||loadData;let loadFlight=null;
  const fastLoadData=function(){
    if(loadFlight)return loadFlight;
    const self=this,args=arguments;
    loadFlight=Promise.resolve().then(()=>baseLoadData.apply(self,args)).finally(()=>{loadFlight=null;});
    return loadFlight;
  };
  window.loadData=fastLoadData;try{loadData=fastLoadData;}catch(_){ }
}catch(e){console.warn(VERSION+' loadData single-flight',e);}

const waitTurn=()=>new Promise(resolve=>setTimeout(resolve,0));
const activePage=()=>{try{return typeof crmActivePage==='function'?crmActivePage():(document.getElementById('app')?.dataset?.activePage||'');}catch(_){return '';}};
const h=v=>{try{return typeof esc==='function'?esc(String(v??'')):String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}catch(_){return String(v??'');}};
const money=v=>{try{return typeof fmt==='function'?fmt(Number(v)||0):new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(Number(v)||0);}catch(_){return String(Number(v)||0);}};
const currentMonth=()=>String(window.TODAY||new Date().toISOString().slice(0,10)).slice(0,7);
const rowMonth=r=>String(r?.month||'').slice(0,7);
const prevYearMonth=ym=>/^\d{4}-\d{2}$/.test(String(ym||''))?(Number(String(ym).slice(0,4))-1)+'-'+String(ym).slice(5,7):null;
const canon=v=>{try{return typeof canonicalSalesClientName==='function'?canonicalSalesClientName(v):String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]/giu,'');}catch(_){return String(v||'').toLowerCase().replace(/[^a-zа-я0-9]/giu,'');}};
function oneEditNear(a,b){
  a=canon(a);b=canon(b);if(!a||!b)return false;if(a===b)return true;if(Math.min(a.length,b.length)<6||Math.abs(a.length-b.length)>1)return false;
  let i=0,j=0,d=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++d>1)return false;if(a.length>b.length)i++;else if(b.length>a.length)j++;else{i++;j++;}}
  if(i<a.length||j<b.length)d++;return d<=1;
}
function rowUniqueKey(r){return r?.id!=null?'id:'+String(r.id):[r?.client_id||'',r?.client_name||'',r?.month||'',r?.category||'',r?.subgroup||'',r?.sku||'',r?.product||'',r?.qty||'',r?.revenue||''].join('|');}
function variantsOf(c){try{return typeof clientNameVariants==='function'?clientNameVariants(c):[c?.name||''];}catch(_){return [c?.name||''];}}

const vipPerf={
  histRef:null,clientsRef:null,vipRef:null,ready:false,indexPromise:null,summaryPromise:null,
  byId:new Map(),byName:new Map(),nameKeys:[],months:[],monthSet:new Set(),entityCache:new Map(),summaries:null,
  renderToken:0,lastRenderSig:'',cards:new Map(),details:new Map(),detailFlights:new Map()
};
function resetVipPerf(){
  vipPerf.ready=false;vipPerf.indexPromise=null;vipPerf.summaryPromise=null;vipPerf.byId=new Map();vipPerf.byName=new Map();vipPerf.nameKeys=[];vipPerf.months=[];vipPerf.monthSet=new Set();vipPerf.entityCache=new Map();vipPerf.summaries=null;vipPerf.lastRenderSig='';vipPerf.cards=new Map();vipPerf.details=new Map();vipPerf.detailFlights=new Map();vipPerf.renderToken++;
}
function vipDataChanged(){return vipPerf.histRef!==allPurchaseHistory||vipPerf.clientsRef!==allClients||vipPerf.vipRef!==allVipSales;}
function setVipStatus(text){
  const root=document.getElementById('page-vip');if(!root)return;
  let el=root.querySelector('.v22722-page-loading');
  if(!text){el?.remove();return;}
  if(!el){el=document.createElement('div');el.className='card v22722-page-loading';el.style.cssText='margin-bottom:12px;color:var(--sub);font-size:13px;padding:14px 16px';const title=root.querySelector('.page-title');if(title)title.insertAdjacentElement('afterend',el);else root.prepend(el);}
  el.textContent=text;
}
async function buildVipIndex(){
  if(!vipDataChanged()&&vipPerf.ready)return true;
  if(vipPerf.indexPromise)return vipPerf.indexPromise;
  const hist=Array.isArray(allPurchaseHistory)?allPurchaseHistory:[],clients=Array.isArray(allClients)?allClients:[],vips=Array.isArray(allVipSales)?allVipSales:[];
  vipPerf.histRef=allPurchaseHistory;vipPerf.clientsRef=allClients;vipPerf.vipRef=allVipSales;resetVipPerf();
  // resetVipPerf очищает refs, фиксируем их снова как текущую версию данных.
  vipPerf.histRef=allPurchaseHistory;vipPerf.clientsRef=allClients;vipPerf.vipRef=allVipSales;
  const token=vipPerf.renderToken;
  vipPerf.indexPromise=(async()=>{
    const byId=new Map(),byName=new Map(),months=new Set();
    for(let i=0;i<hist.length;i++){
      if(token!==vipPerf.renderToken||activePage()!=='vip')return false;
      const r=hist[i],id=String(r?.client_id||''),k=canon(r?.client_name),m=rowMonth(r);
      if(id){let a=byId.get(id);if(!a)byId.set(id,a=[]);a.push(r);}
      if(k){let a=byName.get(k);if(!a)byName.set(k,a=[]);a.push(r);}
      if(/^\d{4}-\d{2}$/.test(m))months.add(m);
      if(i&&i%1500===0)await waitTurn();
    }
    vipPerf.byId=byId;vipPerf.byName=byName;vipPerf.nameKeys=[...byName.keys()];vipPerf.months=[...months].sort();vipPerf.monthSet=months;vipPerf.ready=true;
    return true;
  })().finally(()=>{vipPerf.indexPromise=null;});
  return vipPerf.indexPromise;
}
function targetPct(prev,cur){prev=Number(prev)||0;cur=Number(cur)||0;if(prev<=0)return cur>0?null:0;return Math.round(cur/prev*100);}
function targetGap(prev,cur){return Math.max(0,(Number(prev)||0)-(Number(cur)||0));}
function targetTag(prev,cur){
  prev=Number(prev)||0;cur=Number(cur)||0;
  if(prev<0)return '<span class="tag tag-gray">возвраты в базе 2025</span>';
  if(prev===0&&cur>0)return '<span class="tag tag-m">новые продажи</span>';
  if(prev===0)return '<span class="tag tag-gray">нет базы 2025</span>';
  const pct=targetPct(prev,cur);if(pct>=100)return '<span class="tag tag-m">✅ '+pct+'% к 2025</span>';
  return '<span class="tag" style="background:var(--amb);color:var(--am)">🎯 '+pct+'% к 2025</span>';
}
function vipPeriod(){
  const months=vipPerf.months,current=currentMonth();if(!months.length)return {prev:null,cur:null,currentMonth:current,missingCurrent:true,comparable:false,partial:true};
  const cur=vipPerf.monthSet.has(current)?current:months[months.length-1],prev=prevYearMonth(cur);
  return {prev,cur,currentMonth:current,missingCurrent:cur!==current,comparable:vipPerf.monthSet.has(prev),partial:cur===current};
}
function defAliases(def){return [...new Set([def?.client_name,def?.legal_name,...(def?.member_names||[])].filter(Boolean))];}
function matchedClientsFor(def){
  const aliases=defAliases(def),keys=new Set([...aliases.map(canon),...(def?._v22717_keys||[])].filter(Boolean)),cacheKey='clients:'+canon(def?.client_name||aliases[0]||'');
  if(vipPerf.entityCache.has(cacheKey))return vipPerf.entityCache.get(cacheKey);
  const rows=(allClients||[]).filter(c=>{
    const vars=variantsOf(c);for(const v of vars){const k=canon(v);if(k&&keys.has(k))return true;for(const a of aliases)if(oneEditNear(v,a))return true;}return false;
  });
  vipPerf.entityCache.set(cacheKey,rows);return rows;
}
function entityRows(def){
  const key='rows:'+canon(def?.client_name||'');if(vipPerf.entityCache.has(key))return vipPerf.entityCache.get(key);
  const clients=matchedClientsFor(def),ids=new Set(clients.map(c=>String(c?.id||'')).filter(Boolean)),aliases=defAliases(def),nameKeys=new Set([...aliases.map(canon),...(def?._v22717_keys||[])].filter(Boolean)),groups=[];
  ids.forEach(id=>{const a=vipPerf.byId.get(id);if(a)groups.push(a);});
  nameKeys.forEach(k=>{const a=vipPerf.byName.get(k);if(a)groups.push(a);});
  // Поддерживаем старую страховку от опечатки в 1 символ, но сравниваем только
  // уникальные имена, а не заново все 39k строк для каждого ВИП.
  for(const k of vipPerf.nameKeys){if(nameKeys.has(k))continue;let ok=false;for(const a of nameKeys){if(oneEditNear(k,a)){ok=true;break;}}if(ok)groups.push(vipPerf.byName.get(k));}
  const out=[],seen=new Set();for(const g of groups||[])for(const r of g||[]){const rk=rowUniqueKey(r);if(!seen.has(rk)){seen.add(rk);out.push(r);}}
  vipPerf.entityCache.set(key,out);return out;
}
function preferredClient(def){
  try{if(typeof vipMatchedClient==='function'){const c=vipMatchedClient(def.client_name);if(c)return c;}}catch(_){ }
  const rows=matchedClientsFor(def);return rows[0]||null;
}
async function buildVipSummaries(){
  if(vipPerf.summaries&&!vipDataChanged())return vipPerf.summaries;
  if(vipPerf.summaryPromise)return vipPerf.summaryPromise;
  vipPerf.summaryPromise=(async()=>{
    await buildVipIndex();if(!vipPerf.ready)return [];
    const period=vipPeriod(),defs=(typeof vipMemberDefinitions==='function'?vipMemberDefinitions():[])||[],list=[];
    for(let di=0;di<defs.length;di++){
      if(activePage()!=='vip')return [];
      const def=defs[di],rows=entityRows(def),matched=preferredClient(def),prevSku=new Set(),curSku=new Set();let prev=0,cur=0;
      for(let i=0;i<rows.length;i++){const r=rows[i],m=rowMonth(r);if(m!==period.prev&&m!==period.cur)continue;const rev=Number(r?.revenue)||0,sku=String(r?.sku||r?.product||'').trim();if(m===period.prev){prev+=rev;if(sku)prevSku.add(sku);}else{cur+=rev;if(sku)curSku.add(sku);}}
      list.push({...def,matched,period_prev:period.prev,period_cur:period.cur,period_partial:period.partial,month_comparable:!!period.comparable,target_mode:true,revenue_prev:prev,revenue_cur:cur,sku_prev:prevSku.size,sku_cur:curSku.size,target_pct:period.comparable?targetPct(prev,cur):null,target_gap:period.comparable?targetGap(prev,cur):0,growth_pct:period.comparable&&!period.partial?(prev>0?Math.round((cur-prev)/prev*100):(cur>0?100:0)):null,quarter_revenue_prev:0,quarter_revenue_cur:0,_perf_rows:rows,_perf_points:matchedClientsFor(def).length});
      if(di&&di%3===0)await waitTurn();
    }
    vipPerf.summaries=list;return list;
  })().finally(()=>{vipPerf.summaryPromise=null;});
  return vipPerf.summaryPromise;
}
function monthLabel(ym){try{return typeof vipMonthLabel==='function'?vipMonthLabel(ym):String(ym||'—');}catch(_){return String(ym||'—');}}
function amount(period,prev,cur){return period.comparable?(money(prev)+' → '+money(cur)+' BYN'):(money(cur)+' BYN');}
function vipRenderSignature(list,period){return [vipPerf.renderToken,period.prev,period.cur,currentProfile?.role||'',currentProfile?.name||'',list.length,(allVipSales||[]).length].join('|');}

async function makeDetail(summary,cardId){
  if(vipPerf.details.has(cardId))return vipPerf.details.get(cardId);
  if(vipPerf.detailFlights.has(cardId))return vipPerf.detailFlights.get(cardId);
  const p=(async()=>{
    const detailToken=vipPerf.renderToken,period=vipPeriod(),cats=new Map(),currentByCat=new Map();let currentTotal=0;const rows=summary?._perf_rows||[];
    for(let i=0;i<rows.length;i++){
      const r=rows[i],m=rowMonth(r),rev=Number(r?.revenue)||0,qty=Number(r?.qty)||0;
      if(m===currentMonth()){currentTotal+=rev;const cn=r?.category||'Без категории';currentByCat.set(cn,(currentByCat.get(cn)||0)+rev);}
      if(m!==period.prev&&m!==period.cur){if(i&&i%1200===0){await waitTurn();if(detailToken!==vipPerf.renderToken||activePage()!=='vip')return null;}continue;}
      const isPrev=m===period.prev,cat=r?.category||'Без категории',sub=r?.subgroup||'Прочее',product=r?.product||'Без наименования',sku=String(r?.sku||product||'').trim(),itemKey=(sku||product)+'|||'+product;
      if(!cats.has(cat))cats.set(cat,{category:cat,revenue_prev:0,revenue_cur:0,subgroups:new Map()});const c=cats.get(cat);if(isPrev)c.revenue_prev+=rev;else c.revenue_cur+=rev;
      if(!c.subgroups.has(sub))c.subgroups.set(sub,{subgroup:sub,revenue_prev:0,revenue_cur:0,items:new Map()});const s=c.subgroups.get(sub);if(isPrev)s.revenue_prev+=rev;else s.revenue_cur+=rev;
      if(!s.items.has(itemKey))s.items.set(itemKey,{product,sku,revenue_prev:0,revenue_cur:0,qty_prev:0,qty_cur:0});const it=s.items.get(itemKey);if(isPrev){it.revenue_prev+=rev;it.qty_prev+=qty;}else{it.revenue_cur+=rev;it.qty_cur+=qty;}
      if(i&&i%1200===0){await waitTurn();if(detailToken!==vipPerf.renderToken||activePage()!=='vip')return null;}
    }
    const detail={period,currentTotal,currentByCat,categories:[...cats.values()].sort((a,b)=>b.revenue_cur-a.revenue_cur)};vipPerf.details.set(cardId,detail);return detail;
  })().finally(()=>vipPerf.detailFlights.delete(cardId));
  vipPerf.detailFlights.set(cardId,p);return p;
}
function currentSalesHtml(detail){
  if(!detail.currentTotal)return '<div style="background:var(--bg);border-radius:8px;padding:10px 12px;margin-bottom:10px;font-size:12px;color:var(--sub)">📊 Продаж в этом месяце пока нет</div>';
  const cats=[...detail.currentByCat.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5),ym=currentMonth(),months=['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'],ml=months[parseInt(ym.slice(5,7),10)-1]+' '+ym.slice(0,4);
  return '<div style="background:var(--gb);border-radius:8px;padding:10px 12px;margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><span style="font-size:12px;font-weight:600;color:var(--sub);text-transform:uppercase">📊 Продажи юрлица · '+h(ml)+'</span><span style="font-size:14px;font-weight:700;color:var(--g)">'+money(detail.currentTotal)+' BYN</span></div>'+cats.map(([cat,v])=>'<div style="display:flex;justify-content:space-between;font-size:12px;padding:2px 0"><span style="color:var(--text)">'+h(cat)+'</span><span style="color:var(--sub)">'+money(v)+'</span></div>').join('')+'</div>';
}
function detailShell(summary,detail,cardId){
  const period=detail.period,cats=detail.categories;
  const catsHtml=cats.map((c,ci)=>'<div style="border-bottom:1px solid var(--border)"><div style="display:flex;justify-content:space-between;padding:7px 8px 7px 0;cursor:pointer;gap:10px" onclick="v227316ToggleVipCategory(\''+cardId+'\','+ci+',this)"><span style="font-size:13px"><span class="mlcat-arrow" style="display:inline-block;margin-right:6px;font-size:10px">▸</span>'+h(c.category)+'</span><span style="font-size:13px;color:var(--sub);white-space:nowrap;display:flex;align-items:center;gap:6px">'+amount(period,c.revenue_prev,c.revenue_cur)+(period.comparable?targetTag(c.revenue_prev,c.revenue_cur):'')+'</span></div><div id="'+cardId+'_cat_'+ci+'" style="display:none"></div></div>').join('');
  let promo='';try{promo=typeof promotionVipLinkBlock==='function'?promotionVipLinkBlock(summary.client_name):'';}catch(_){promo='';}
  return currentSalesHtml(detail)+catsHtml+promo;
}
window.v227316ToggleVipCategory=function(cardId,ci,head){
  const body=document.getElementById(cardId+'_cat_'+ci),detail=vipPerf.details.get(cardId),c=detail?.categories?.[ci];if(!body||!c)return;
  const open=body.style.display==='none';body.style.display=open?'block':'none';const ar=head?.querySelector('.mlcat-arrow');if(ar)ar.textContent=open?'▾':'▸';if(!open||body.dataset.loaded==='1')return;
  const subs=[...c.subgroups.values()].sort((a,b)=>b.revenue_cur-a.revenue_cur);body.innerHTML=subs.map((s,si)=>'<div><div style="display:flex;justify-content:space-between;padding:5px 8px 5px 18px;cursor:pointer;gap:10px" onclick="v227316ToggleVipSubgroup(\''+cardId+'\','+ci+','+si+',this)"><span style="font-size:12px"><span class="mlcat-arrow" style="display:inline-block;margin-right:6px;font-size:10px">▸</span>'+h(s.subgroup)+'</span><span style="font-size:12px;color:var(--sub);white-space:nowrap;display:flex;align-items:center;gap:6px">'+amount(detail.period,s.revenue_prev,s.revenue_cur)+(detail.period.comparable?targetTag(s.revenue_prev,s.revenue_cur):'')+'</span></div><div id="'+cardId+'_cat_'+ci+'_sub_'+si+'" style="display:none"></div></div>').join('');
  c._sortedSubs=subs;body.dataset.loaded='1';
};
window.v227316ToggleVipSubgroup=function(cardId,ci,si,head){
  const body=document.getElementById(cardId+'_cat_'+ci+'_sub_'+si),detail=vipPerf.details.get(cardId),c=detail?.categories?.[ci],s=c?._sortedSubs?.[si];if(!body||!s)return;
  const open=body.style.display==='none';body.style.display=open?'block':'none';const ar=head?.querySelector('.mlcat-arrow');if(ar)ar.textContent=open?'▾':'▸';if(!open||body.dataset.loaded==='1')return;
  const items=[...s.items.values()].sort((a,b)=>(b.revenue_cur||0)-(a.revenue_cur||0));body.innerHTML=items.map(it=>'<div style="display:flex;justify-content:space-between;padding:5px 0 5px 34px;border-bottom:1px solid var(--border);font-size:12px;color:var(--sub);gap:10px"><span>'+h(it.product)+'</span><span style="white-space:nowrap">'+amount(detail.period,it.revenue_prev||0,it.revenue_cur||0)+' '+(detail.period.comparable?targetTag(it.revenue_prev,it.revenue_cur):'')+'</span></div>').join('');body.dataset.loaded='1';
};
window.v227316ToggleVipCard=async function(cardId){
  const body=document.getElementById(cardId),summary=vipPerf.cards.get(cardId);if(!body||!summary)return;
  const open=body.style.display==='none';body.style.display=open?'block':'none';if(!open)return;
  if(body.dataset.loaded==='1')return;
  body.innerHTML='<div style="padding:10px 0;color:var(--sub);font-size:12px">Подготавливаю детализацию…</div>';
  const token=vipPerf.renderToken,detail=await makeDetail(summary,cardId);if(!detail||token!==vipPerf.renderToken||activePage()!=='vip'||!document.getElementById(cardId))return;
  body.innerHTML=detailShell(summary,detail,cardId);body.dataset.loaded='1';
};

// Совместимость со старой кнопкой из топ-5: имя клиента открывает нужную карточку.
try{
  window.toggleVipCard=toggleVipCard=function(id){
    const direct=document.getElementById(id);if(direct&&vipPerf.cards.has(id)){window.v227316ToggleVipCard(id);return;}
    const cardId=_vipCardIdByName?.[id]||id,body=document.getElementById(cardId);if(!body)return;
    let p=body.parentElement;while(p){if(p.id&&p.id.startsWith('vipdept_')){p.style.display='block';const ar=document.getElementById(p.id+'_arrow');if(ar)ar.textContent='▲';try{vipFoldersOpen.add(p.id);}catch(_){ }}p=p.parentElement;}
    if(vipPerf.cards.has(cardId))window.v227316ToggleVipCard(cardId);else body.style.display='block';body.scrollIntoView({behavior:'smooth',block:'center'});
  };
}catch(_){ }

window.v227316OpenVipTarget=function(el){const name=el?.dataset?.vipName||'';if(name)window.toggleVipCard?.(name);};

function renderVipFast(list,period){
  if(activePage()!=='vip')return;
  const isBoss=currentProfile?.role==='boss',myName=currentProfile?.name;let clients=list;if(!isBoss)clients=clients.filter(g=>g.matched&&g.matched.manager_name===myName);clients=clients.slice().sort((a,b)=>b.revenue_cur-a.revenue_cur);
  const sig=vipRenderSignature(clients,period),root=document.getElementById('vip-list');if(!root)return;
  if(vipPerf.lastRenderSig===sig&&root.childElementCount)return;vipPerf.lastRenderSig=sig;setVipStatus('');
  const periodEl=document.getElementById('vip-period-info');if(periodEl){
    if(period.cur){const curLabel=monthLabel(period.cur),prevLabel=monthLabel(period.prev),asOf=String(window.TODAY||'').split('-').reverse().join('.');periodEl.innerHTML='<div class="card-title">Как считается ВИП</div><div style="font-size:13px;line-height:1.65"><b>Ориентир:</b> полный <b>'+h(prevLabel)+'</b> → текущий <b>'+h(curLabel)+'</b>'+(period.partial?' <span class="tag" style="background:var(--amb);color:var(--am)">факт на '+h(asOf)+'</span>':'')+'</div><div style="font-size:12px;color:var(--sub);margin-top:5px">Процент показывает, сколько менеджер уже сделал от оборота этого же месяца прошлого года. Это <b>не падение</b> в незакрытом месяце, а прогресс к прошлогодней планке.</div>'+(!period.comparable?'<div style="font-size:12px;color:var(--r);margin-top:5px">В purchase_history нет данных за '+h(prevLabel)+' — сравнение пока невозможно.</div>':'')+'<div style="font-size:12px;color:var(--sub);margin-top:5px">Источник: purchase_history из 1С. '+(typeof crmImportStatus==='function'&&crmImportStatus('sales')?'Последняя успешная загрузка: <b>'+h(crmDateTime(crmImportStatus('sales').last_success_at))+'</b>.':'')+'</div><div style="font-size:10px;color:var(--sub);margin-top:5px">Расчёт юрлиц: <b>v22.7.17</b> · Performance core: <b>'+VERSION+'</b></div>';}else periodEl.innerHTML='<div class="card-title">Как считается рост ВИП</div><div style="font-size:12px;color:var(--sub)">История продаж ещё не загружена.</div>';
  }
  const empty=document.getElementById('vip-empty');if(empty){empty.style.display=clients.length?'none':'block';empty.textContent=(allVipSales||[]).length?'У вас пока нет ВИП-клиентов, привязанных к вашему имени.':'ВИП-отчёт ещё не загружен — нужна разовая заливка таблицы vip_sales.';}
  const declBlock=document.getElementById('vip-decliners-block'),declRoot=document.getElementById('vip-decliners'),declTitle=declBlock?.querySelector('.card-title');if(declTitle)declTitle.textContent='🎯 Больше всего осталось до уровня '+monthLabel(period.prev)+' (топ-5)';
  const targets=clients.filter(g=>g.month_comparable&&(Number(g.revenue_prev)||0)>0&&g.target_gap>0).slice().sort((a,b)=>b.target_gap-a.target_gap).slice(0,5);if(declBlock)declBlock.style.display=targets.length?'block':'none';if(declRoot)declRoot.innerHTML=targets.map(g=>'<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-top:1px solid var(--border);gap:10px"><span style="cursor:pointer" data-vip-name="'+h(g.client_name)+'" onclick="v227316OpenVipTarget(this)">'+h(g.client_name)+(g.matched?' <span class="tag tag-gray">👤 '+h(g.matched.manager_name)+'</span>':'')+'</span><span style="display:flex;gap:7px;align-items:center;white-space:nowrap">'+targetTag(g.revenue_prev,g.revenue_cur)+'<b style="font-size:11px;color:var(--sub)">осталось '+money(g.target_gap)+' BYN</b></span></div>').join('');
  const byDept={};clients.forEach(g=>{(byDept[g.department||'Без подразделения']=byDept[g.department||'Без подразделения']||[]).push(g);});const depts=Object.keys(byDept).sort((a,b)=>byDept[b].length-byDept[a].length);let seq=0;vipPerf.cards=new Map();_vipCardIdByName={};
  root.innerHTML=depts.map(dept=>{const arr=byDept[dept],gid='vipdept_perf_'+seq+'_'+canon(dept).slice(0,12),open=(()=>{try{return vipFoldersOpen.has(gid);}catch(_){return false;}})(),cards=arr.map(g=>{const cid='vipcard_perf_'+(seq++);_vipCardIdByName[g.client_name]=cid;vipPerf.cards.set(cid,g);const label=period.comparable?(monthLabel(period.prev)+' → '+monthLabel(period.cur)+(period.partial?' на '+String(window.TODAY||'').split('-').reverse().join('.'):'')):monthLabel(period.cur),gap=g.month_comparable&&g.revenue_prev>0?'<div style="font-size:10px;color:var(--sub);margin-top:4px">До уровня '+h(monthLabel(period.prev))+': <b>'+money(g.target_gap)+' BYN</b></div>':'',points=g._perf_points>1?'<div style="font-size:11px;color:var(--sub);margin-top:3px">Торговых точек / карточек в юрлице: '+g._perf_points+'</div>':'';return '<div class="card" style="margin-bottom:10px;content-visibility:auto;contain-intrinsic-size:96px"><div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;gap:12px" onclick="v227316ToggleVipCard(\''+cid+'\')"><div><div style="font-size:14px;font-weight:600">'+h(g.client_name)+'</div>'+(g.matched?'<span class="tag tag-gray" style="margin-top:4px">👤 '+h(g.matched.manager_name)+'</span>':'<span class="tag tag-gray" style="margin-top:4px">не привязан к карточке клиента</span>')+points+'</div><div style="text-align:right"><div style="font-size:11px;color:var(--sub)">'+h(label)+'</div><div style="font-size:13px;font-weight:600">'+amount(period,g.revenue_prev,g.revenue_cur)+'</div>'+(g.month_comparable?targetTag(g.revenue_prev,g.revenue_cur):'<span class="tag tag-gray">нет базы прошлого года</span>')+gap+'</div></div><div id="'+cid+'" data-loaded="0" style="display:none;margin-top:12px"></div></div>';}).join('');const id=gid;try{if(open)vipFoldersOpen.add(id);}catch(_){ }return '<div class="card" style="margin-bottom:10px"><div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="toggleVipFolder(\''+id+'\')"><div style="font-size:14px;font-weight:600">📁 '+h(dept)+' <span class="tag tag-gray">'+arr.length+' клиент'+(arr.length===1?'':arr.length<5?'а':'ов')+'</span></div><span style="font-size:13px;color:var(--sub)" id="'+id+'_arrow">'+(open?'▲':'▼')+'</span></div><div id="'+id+'" style="display:'+(open?'block':'none')+';margin-top:10px">'+cards+'</div></div>';}).join('');
}

// Финальный authoritative render VIP: сразу отдаёт управление браузеру, затем
// готовит историю/индекс/сводку порциями. Дублирующие старые rerender безопасны:
// одинаковая сигнатура не перестраивает DOM второй раз.
const renderVipFastEntry=function(){
  if(activePage()!=='vip')return;
  const token=vipPerf.renderToken;
  const run=async()=>{
    try{
      if(!(Array.isArray(allPurchaseHistory)&&allPurchaseHistory.length)){
        setVipStatus('Загружаю аналитику 1С… Навигация остаётся доступной.');
        if(typeof window.v22722EnsureHistory!=='function')throw new Error('общий загрузчик истории 1С недоступен');
        await window.v22722EnsureHistory({reason:'vip-v227316'});
      }
      if(activePage()!=='vip')return;
      if(vipDataChanged())resetVipPerf();
      setVipStatus('Подготавливаю ВИП-аналитику… Можно сразу перейти в другой раздел.');
      await buildVipIndex();if(activePage()!=='vip')return;
      const list=await buildVipSummaries();if(activePage()!=='vip')return;
      renderVipFast(list,vipPeriod());
    }catch(e){if(activePage()==='vip')setVipStatus('Не удалось загрузить ВИП-аналитику: '+(e?.message||e));console.warn(VERSION+' VIP',e);}
  };
  // Важно: не начинаем даже лёгкую агрегацию в том же task, где обработан клик меню.
  setTimeout(run,0);
};
window.renderVip=renderVipFastEntry;try{renderVip=renderVipFastEntry;}catch(_){ }

// Старый v22.7.17 может после общей загрузки истории попросить второй render.
// Он теперь дешёвый и идемпотентный, а force=false всегда использует общий promise.
try{if(typeof freshAnalytics22717==='function')freshAnalytics22717=async function(force){try{await window.v22722EnsureHistory({force:!!force,reason:'v227316-shared'});return true;}catch(_){return false;}};}catch(_){ }

// Если история была заменена импортом/обновлением — сбрасываем только локальный индекс.
window.addEventListener('resanta-v2273-status',()=>{if(vipDataChanged())resetVipPerf();});

window.RESANTA_CRM_PERF_V227316=Object.freeze({version:VERSION,priority:'navigation',vipChunkedIndex:true,vipLazyDetails:true,vipLazyCategories:true,vipLazySku:true,duplicateVipRenderSuppression:true,loadAllRowsSingleFlight:true,loadDataSingleFlight:true,noBusinessLogicChange:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 52 ===== */
// ============================================================================
// RESANTA CRM v22.7.31.8 · MONTHLY COMMERCIAL ENGINE
// Manager-specific monthly portfolio: money impact + feasibility + real action.
// Replaces the runtime candidate engine used by both recommendations and tasks.
// ============================================================================
(function(){
'use strict';
const V='v22.7.31.8',ALEKS='aleksandrenko_av@resanta.ru',KRISHTAL='krishtal_na@resanta.ru',MANAGERS=[ALEKS,KRISHTAL];
const n=v=>Number(v)||0,skuKey=v=>String(v||'').toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g,''),money=v=>n(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN',qty=v=>n(v).toLocaleString('ru-RU',{maximumFractionDigits:2});
const managerName=e=>String(e||'').toLowerCase()===ALEKS?'Александренко':String(e||'').toLowerCase()===KRISHTAL?'Кришталь':'—';
function is900(...vals){return vals.some(v=>/^900(?:\/|$)/i.test(String(v||'').trim())||/(^|[^0-9])900\s*(группа|гр\.?)([^0-9]|$)/i.test(String(v||'')));}
function ageDays(v){if(!v)return 9999;const d=new Date(String(v).length===10?String(v)+'T12:00:00':v);return Number.isNaN(d.getTime())?9999:Math.floor((Date.now()-d.getTime())/86400000);}
function monthNow(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
function monthEnd(){const d=new Date(),x=new Date(d.getFullYear(),d.getMonth()+1,0);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');}
function key(manager,sku,strategy,month){return 'v227318|'+String(manager||'').toLowerCase()+'|'+String(month||monthNow())+'|'+skuKey(sku)+'|'+strategy;}
function contentType(issue){const t=String(issue?.issue_type||'');if(['question_unanswered','no_questions','delivery_minsk_slow'].includes(t))return null;if(['listing_outside_top60','listing_31_60'].includes(t))return'listing';if(t==='out_of_stock')return'availability';if(['no_reviews','low_product_rating','low_last_review','negative_review_unanswered'].includes(t))return'reputation';if(['no_video','video_available_not_uploaded','few_photos'].includes(t))return'media';if(['no_description','no_warranty'].includes(t))return'content';return null;}
function lossPts(x){x=n(x);return x>=50000?32:x>=30000?28:x>=15000?24:x>=7000?20:x>=3000?15:x>=1000?10:x>0?5:0;}
function ownSupport(x){x=n(x);return x>=30?10:x>=10?8:x>=5?6:x>=2?3:x===1?-8:-20;}
function partnerSupport(x){x=n(x);return x>=30?12:x>=10?10:x>=5?7:x>0?4:0;}
function salesPts(x){x=n(x);return x>=60?10:x>=25?8:x>=10?5:x>0?2:0;}
function severityPts(v){return String(v||'')==='critical'?12:String(v||'')==='warning'?8:4;}
function issueStrength(issue){if(!issue)return 0;const t=String(issue.issue_type||'');return severityPts(issue.severity)+(t==='listing_outside_top60'?8:t==='listing_31_60'?5:t==='out_of_stock'?5:3);}
function round2(v){return Math.round(n(v)*100)/100;}
function bucketFor(reason){return ['lost_sales','falling_sales'].includes(reason)?'growth':['no_stock_21vek','low_stock_21vek'].includes(reason)?'availability':reason==='novelty'?'launch':'visibility';}
function rankCap(rank){if(rank===1)return 98;if(rank===2)return 95;if(rank===3)return 92;if(rank<=7)return 90-(rank-3)*2;if(rank<=12)return 81-(rank-8)*2;return Math.max(55,70-(rank-13));}
function base(manager,group,sku,product,reason,strategy,raw,ctx,fields={}){
  const month=fields.plan_month||monthNow(),score=Math.max(0,Math.min(100,Math.round(raw)));
  return{
    candidate_key:key(manager,sku,strategy,month),generator_version:V,reason_code:reason,strategy_code:strategy,portfolio_bucket:bucketFor(reason),
    manager_email:String(manager||'').toLowerCase(),manager_name:managerName(manager),group_name:group||'Не распределено',sku:String(sku||''),product_name:product||'',
    task_type:fields.task_type||'listing',priority_score:score,base_priority:score,commercial_score:score,due_date:fields.due_date||monthEnd(),
    title:fields.title||('Коммерческая задача '+sku),task_text:fields.task_text||'',basis:fields.basis||'',expected_result:fields.expected_result||'',criteria:fields.criteria||'',next_step:fields.next_step||'',
    commercial_context:{...(ctx||{}),candidate_key:key(manager,sku,strategy,month),generator_version:V,reason_code:reason,strategy_code:strategy,strategy_label:fields.strategy_label||'',portfolio_bucket:bucketFor(reason),sku:String(sku||''),product_name:product||'',group_name:group||'Не распределено',plan_month:month}
  };
}

function monthlyEngine(input={}){
  const salesData=input.salesData||{},stockData=input.stockData||{},shipments=input.shipments||[],novelties=input.novelties||[],issues=input.contentIssues||[],planMonth=input.planMonth||monthNow();
  const partnerDate=String(input.partnerSnapshotDate||stockData?.imports?.partner?.snapshot_date||''),ownDate=String(input.ownReportDate||stockData?.imports?.own?.report_date||'');
  const d={scanned:0,no_vitebsk:0,already_shipped:0,group_900:0,no_signal:0,deduped:0,raw_candidates:0,candidates:0};

  const shipAfter=new Map();
  for(const x of shipments){if(partnerDate&&String(x.shipment_date||'')<=partnerDate)continue;const k=skuKey(x.sku);shipAfter.set(k,(shipAfter.get(k)||0)+n(x.qty));}

  const stocks=stockData.items||[],stockBy=new Map();
  for(const x of stocks){
    if(is900(x.sku,x.assigned_group,x.category,x.subgroup)){d.group_900++;continue;}
    const sku=skuKey(x.sku),m=String(x.manager_email||'').toLowerCase();
    if(m)stockBy.set(m+'|'+sku,x);
    if(!stockBy.has('|'+sku))stockBy.set('|'+sku,x);
  }

  const salesMap=new Map();
  for(const x of (salesData.items||[])){
    const manager=String(x.manager_email||'').toLowerCase(),sku=String(x.sku||'');
    if(!MANAGERS.includes(manager)||!sku)continue;
    if(is900(sku,x.assigned_group,x.category)){d.group_900++;continue;}
    const k=manager+'|'+skuKey(sku);
    let a=salesMap.get(k);
    if(!a){a={manager_email:manager,sku,product:x.product||x.product_name||'',group:x.assigned_group||x.category||'Не распределено',cur:0,prev:0,qtyCur:0,qtyPrev:0};salesMap.set(k,a);}
    a.cur+=n(x.current_revenue);a.prev+=n(x.previous_revenue);a.qtyCur+=n(x.current_qty);a.qtyPrev+=n(x.previous_qty);if(!a.product)a.product=x.product||x.product_name||'';
  }

  const issueBy=new Map();
  for(const issue of issues){
    if(!issue||!['open','needs_review'].includes(String(issue.status||'')))continue;
    const manager=String(issue.manager_email||'').toLowerCase(),sku=String(issue.sku||''),type=contentType(issue);
    if(!MANAGERS.includes(manager)||!sku||!type||is900(sku,issue.category,issue.subgroup))continue;
    const k=manager+'|'+skuKey(sku),old=issueBy.get(k);
    if(!old||issueStrength(issue)>issueStrength(old))issueBy.set(k,issue);
  }

  const novMap=new Map(novelties.map(x=>[skuKey(x.sku),x]));
  const best=new Map();
  function put(c){
    if(!c)return;d.raw_candidates++;
    const own=n(c.commercial_context?.own_qty);
    if(own<=0){d.no_vitebsk++;return;}
    if(is900(c.sku,c.group_name)){d.group_900++;return;}
    const k=c.manager_email+'|'+skuKey(c.sku),old=best.get(k);
    if(!old||n(c.commercial_score)>n(old.commercial_score)){if(old)d.deduped++;best.set(k,c);}else d.deduped++;
  }

  for(const a of salesMap.values()){
    d.scanned++;
    const keyMS=a.manager_email+'|'+skuKey(a.sku),st=stockBy.get(keyMS)||stockBy.get('|'+skuKey(a.sku));
    if(!st||n(st.own_qty)<=0){d.no_vitebsk++;continue;}
    const own=n(st.own_qty),partner=n(st.partner_total),chekhov=n(st.chekhov_qty),sales90=n(st.sales_90),rawRec=n(st.recommended),shipped=n(shipAfter.get(skuKey(a.sku))),rec=Math.max(0,rawRec-shipped),loss=Math.max(0,a.prev-a.cur),issue=issueBy.get(keyMS),nov=novMap.get(skuKey(a.sku)),firstDate=nov?.first_positive_date||nov?.first_seen_date||null;
    const baseCtx={current_revenue:a.cur,previous_revenue:a.prev,current_qty:a.qtyCur,previous_qty:a.qtyPrev,loss,partner_total:partner,partner_orders:n(st.partner_orders),stock_days:st.stock_days==null?null:n(st.stock_days),own_qty:own,chekhov_qty:chekhov,sales_90:sales90,recommended_qty:rec,shipped_after_snapshot:shipped,partner_snapshot_date:partnerDate,own_report_date:ownDate,novelty_first_positive:firstDate,content_issue_type:issue?.issue_type||'',content_issue_title:issue?.issue_title||'',product_url:issue?.product_url||'',current_value:issue?.current_value||'',target_value:issue?.target_value||''};
    let signal=false;

    if(a.prev>0&&a.cur<=0.01){
      signal=true;
      if(partner>0){
        const targetRevenue=round2(Math.max(a.cur,a.prev*.50)),raw=52+lossPts(loss)+partnerSupport(partner)+ownSupport(own)+Math.min(8,issueStrength(issue));
        put(base(a.manager_email,a.group,a.sku,a.product,'lost_sales','sellout_recovery',raw,{...baseCtx,target_revenue:targetRevenue,target_recovery_pct:50,target_metric:'Выручка SKU не ниже '+money(targetRevenue)+' к концу месяца'},{
          plan_month:planMonth,task_type:'listing',strategy_label:'Sell-out: вернуть продажи без лишней отгрузки',title:'Вернуть sell-out · '+a.sku,
          task_text:'Дополнительную отгрузку не ставить: на 21vek уже '+qty(partner)+' шт. Проверить позицию в выдаче, цену/SALE и поисковую фразу относительно конкурирующих предложений; затем проверить карточку (фото, видео, описание, рейтинг) по доступным данным. Согласовать с 21vek одно конкретное действие, выполнить его и проконтролировать sell-out.',
          basis:'Потерянный оборот '+money(loss)+'. Аналог '+money(a.prev)+', сейчас '+money(a.cur)+'. На 21vek '+qty(partner)+' шт., Витебск '+qty(own)+' шт.'+(issue?' Активная проблема карточки: '+String(issue.issue_title||issue.issue_type)+'.':''),
          expected_result:'До конца месяца восстановить выручку SKU минимум до '+money(targetRevenue)+' (не менее 50% сопоставимого уровня).',
          criteria:'Свежие продажи подтверждают выручку SKU ≥ '+money(targetRevenue)+'. Наличие 21vek не является самоцелью: измеряется sell-out.',
          next_step:'Если target не достигнут — зафиксировать, какой рычаг уже изменён, и вынести руководителю следующий конкретный тест.'
        }));
      }else if(shipped<=0){
        const q=Math.min(own,Math.max(1,Math.ceil(rec>0?rec:(sales90>0?sales90/6:1)))),raw=58+lossPts(loss)+ownSupport(own)+salesPts(sales90);
        put(base(a.manager_email,a.group,a.sku,a.product,'no_stock_21vek','restore_availability',raw,{...baseCtx,target_partner_qty:q,target_metric:'Наличие 21vek > 0 после отгрузки до '+qty(q)+' шт.'},{
          plan_month:planMonth,task_type:'availability',strategy_label:'Восстановить наличие из Витебска',title:'Вернуть наличие и продажи · '+a.sku,
          task_text:'Согласовать отгрузку только из свободного остатка Витебска в объёме до '+qty(q)+' шт.; проконтролировать проведение в 1С и появление на 21vek; после появления товара проверить запуск sell-out.',
          basis:'21vek 0 шт.; Витебск '+qty(own)+' шт.; потерянный оборот '+money(loss)+'; продажи за 90 дней '+qty(sales90)+' шт.; рекомендация после учёта отгрузок '+qty(rec)+' шт.',
          expected_result:'Товар доступен на 21vek и возвращён в продажи без избыточной отгрузки.',
          criteria:'1С подтверждает отгрузку, свежий снимок 21vek показывает наличие > 0, далее контролируется sell-out.',
          next_step:'После появления товара оценить продажи; если продаж нет — перевести работу в sell-out, а не повторять отгрузку.'
        }));
      }else{
        d.already_shipped++;
        const raw=45+lossPts(loss)+ownSupport(own);
        put(base(a.manager_email,a.group,a.sku,a.product,'lost_sales','activate_after_shipment',raw,{...baseCtx,target_revenue:round2(a.prev*.4),target_metric:'Проверить появление отгрузки и восстановить sell-out'},{
          plan_month:planMonth,task_type:'listing',strategy_label:'Активировать продажи после уже сделанной отгрузки',title:'Запустить sell-out после отгрузки · '+a.sku,
          task_text:'Повторную отгрузку не делать. Проверить, что отгруженные '+qty(shipped)+' шт. появились на 21vek, затем проверить позицию/цену/SALE/поисковую фразу и карточку; согласовать одно действие на запуск продаж.',
          basis:'После снимка уже отгружено '+qty(shipped)+' шт.; ранее потерянный оборот '+money(loss)+'.',
          expected_result:'Отгрузка отражена на 21vek и SKU возвращается в sell-out.',
          criteria:'Свежий отчёт подтверждает наличие после отгрузки и измеримую выручку; повторной отгрузки нет.',
          next_step:'Если товар появился, но продаж нет — работать с видимостью/ценой/контентом.'
        }));
      }
    }

    if(a.prev>0&&a.cur>0&&a.cur<a.prev*.85){
      signal=true;const decline=(a.prev-a.cur)/a.prev*100,targetRevenue=round2(a.prev*.85);
      const raw=45+lossPts(loss)+Math.min(16,Math.round(decline/5))+partnerSupport(partner)+Math.max(-5,ownSupport(own));
      put(base(a.manager_email,a.group,a.sku,a.product,'falling_sales','recover_run_rate',raw,{...baseCtx,decline_pct:round2(decline),target_revenue:targetRevenue,target_recovery_pct:85,target_metric:'Выручка SKU ≥ '+money(targetRevenue)},{
        plan_month:planMonth,task_type:'listing',strategy_label:'Вернуть темп продаж',title:'Вернуть темп продаж · '+a.sku,
        task_text:'Разобрать падение по конкретным рычагам: наличие 21vek, позиция, цена/SALE, поисковая фраза и карточка; выбрать главный управляемый фактор, согласовать одно изменение с 21vek, внедрить и проверить динамику.',
        basis:'Продажи снизились с '+money(a.prev)+' до '+money(a.cur)+' (−'+decline.toFixed(1)+'%). Потерянный оборот '+money(loss)+'. 21vek '+qty(partner)+' шт., Витебск '+qty(own)+' шт.',
        expected_result:'До конца месяца вернуть выручку SKU минимум до '+money(targetRevenue)+' (85% сопоставимого уровня).',
        criteria:'Свежий сопоставимый отчёт подтверждает выручку SKU ≥ '+money(targetRevenue)+'.',
        next_step:'Если 85% не достигнуто — зафиксировать результат теста и согласовать следующий рычаг.'
      }));
    }

    if(partner<=0&&shipped<=0){
      signal=true;const q=Math.min(own,Math.max(1,Math.ceil(rec>0?rec:(sales90>0?sales90/6:1)))),raw=54+lossPts(loss)+ownSupport(own)+salesPts(sales90);
      put(base(a.manager_email,a.group,a.sku,a.product,'no_stock_21vek','restore_availability',raw,{...baseCtx,target_partner_qty:q,target_metric:'21vek > 0 после отгрузки до '+qty(q)+' шт.'},{
        plan_month:planMonth,task_type:'availability',strategy_label:'Восстановить наличие',title:'Восстановить наличие · '+a.sku,
        task_text:'Согласовать отгрузку из Витебска до '+qty(q)+' шт.; провести и проверить её в 1С; подтвердить появление товара на 21vek; после появления проверить первые продажи.',
        basis:'21vek 0 шт.; Витебск '+qty(own)+' шт.; продажи 90 дней '+qty(sales90)+' шт.; рекомендация '+qty(rec)+' шт.',
        expected_result:'SKU снова доступен для покупки на 21vek без лишнего запаса.',
        criteria:'Свежий снимок 21vek показывает наличие > 0; отгрузка подтверждена 1С.',
        next_step:'После появления товара оценить sell-out, не делать повторную отгрузку без новой потребности.'
      }));
    }

    if(rec>0&&partner>0&&(st.stock_days==null||n(st.stock_days)<14)&&shipped<=0){
      signal=true;const q=Math.min(own,Math.max(1,Math.ceil(rec))),raw=42+salesPts(sales90)+lossPts(loss)+ownSupport(own)+(n(st.stock_days)<7?8:4);
      put(base(a.manager_email,a.group,a.sku,a.product,'low_stock_21vek','protect_stock',raw,{...baseCtx,target_stock_days:14,target_partner_qty:q,target_metric:'Запас 21vek не ниже 14 дней'},{
        plan_month:planMonth,task_type:'availability',strategy_label:'Защитить sell-out от out-of-stock',title:'Защитить запас 21vek · '+a.sku,
        task_text:'Согласовать пополнение из Витебска до '+qty(q)+' шт. с учётом текущего остатка; провести отгрузку; проверить новый остаток и не допустить повторного пополнения без пересчёта.',
        basis:'21vek '+qty(partner)+' шт.; запас '+(st.stock_days==null?'не рассчитан':qty(st.stock_days)+' дн.')+'; Витебск '+qty(own)+' шт.; рекомендация '+qty(rec)+' шт.',
        expected_result:'Поддержать запас 21vek не ниже 14 дней без избыточного товарного остатка.',
        criteria:'Свежий расчёт показывает запас ≥ 14 дней либо подтверждён максимально возможный запас в пределах Витебска.',
        next_step:'Пересчитать потребность по следующему снимку и фактическому sell-out.'
      }));
    }

    if(firstDate&&ageDays(firstDate)<=60){
      signal=true;const targetQty=Math.max(1,Math.min(3,Math.floor(own+partner))),raw=44+ownSupport(own)+(partner>0?6:3)+(ageDays(firstDate)<=30?6:2);
      put(base(a.manager_email,a.group,a.sku,a.product||nov?.product,'novelty','launch_novelty',raw,{...baseCtx,target_qty:targetQty,target_metric:'Не менее '+targetQty+' продаж новинки'},{
        plan_month:planMonth,task_type:'novelty',strategy_label:'Запуск новинки',title:'Запустить новинку · '+a.sku,
        task_text:shipped>0?'Повторную отгрузку не делать: после снимка уже отгружено '+qty(shipped)+' шт. Проверить появление товара, готовность карточки и видимость; согласовать запуск и проконтролировать первые продажи.':'Проверить готовность карточки и видимость новинки; согласовать первую отгрузку только из Витебска в разумном объёме; проконтролировать появление товара и первые продажи.',
        basis:'Первый положительный остаток '+String(firstDate)+'. Сейчас Витебск '+qty(own)+' шт., 21vek '+qty(partner)+' шт.',
        expected_result:'Новинка доступна на 21vek и получает не менее '+targetQty+' подтверждённых продаж.',
        criteria:'Свежий отчёт подтверждает наличие/карточку и количество продаж ≥ '+targetQty+'.',
        next_step:'После первых продаж оценить темп и только затем решать вопрос повторного заказа.'
      }));
    }

    if(!signal)d.no_signal++;
  }

  // Novelties not yet present in sales rows.
  for(const nov of novelties){
    const sku=String(nov.sku||''),firstDate=nov.first_positive_date||nov.first_seen_date;
    if(!sku||!firstDate||ageDays(firstDate)>60||is900(sku,nov.product))continue;
    for(const manager of MANAGERS){
      if(salesMap.has(manager+'|'+skuKey(sku)))continue;
      const st=stockBy.get(manager+'|'+skuKey(sku));if(!st)continue;d.scanned++;
      const own=n(st.own_qty);if(own<=0){d.no_vitebsk++;continue;}
      const partner=n(st.partner_total),shipped=n(shipAfter.get(skuKey(sku))),targetQty=Math.max(1,Math.min(3,Math.floor(own+partner))),raw=44+ownSupport(own)+(partner>0?6:3)+(ageDays(firstDate)<=30?6:2);
      const ctx={current_revenue:0,previous_revenue:0,current_qty:0,previous_qty:0,loss:0,partner_total:partner,partner_orders:n(st.partner_orders),stock_days:st.stock_days==null?null:n(st.stock_days),own_qty:own,chekhov_qty:n(st.chekhov_qty),sales_90:n(st.sales_90),recommended_qty:Math.max(0,n(st.recommended)-shipped),shipped_after_snapshot:shipped,partner_snapshot_date:partnerDate,own_report_date:ownDate,novelty_first_positive:firstDate,target_qty:targetQty,target_metric:'Не менее '+targetQty+' продаж новинки'};
      put(base(manager,st.assigned_group||'Не распределено',sku,nov.product||st.product||'','novelty','launch_novelty',raw,ctx,{
        plan_month:planMonth,task_type:'novelty',strategy_label:'Запуск новинки',title:'Запустить новинку · '+sku,
        task_text:shipped>0?'Повторную отгрузку не делать. Проверить появление товара после уже сделанной отгрузки, готовность карточки и видимость, затем получить первые продажи.':'Проверить карточку и видимость, согласовать первую отгрузку только из Витебска и получить первые продажи.',
        basis:'Первый положительный остаток '+String(firstDate)+'. Витебск '+qty(own)+' шт., 21vek '+qty(partner)+' шт.',
        expected_result:'Не менее '+targetQty+' подтверждённых продаж новинки.',
        criteria:'Свежий отчёт 21vek подтверждает продажи ≥ '+targetQty+'.',
        next_step:'После первых продаж оценить темп и повторный заказ.'
      }));
    }
  }

  // Card issues only when the SKU has stock and commercial value.
  for(const issue of issues){
    if(!issue||!['open','needs_review'].includes(String(issue.status||'')))continue;
    const manager=String(issue.manager_email||'').toLowerCase(),sku=String(issue.sku||''),taskType=contentType(issue);
    if(!MANAGERS.includes(manager)||!sku||!taskType||is900(sku,issue.category,issue.subgroup))continue;
    const st=stockBy.get(manager+'|'+skuKey(sku))||stockBy.get('|'+skuKey(sku));if(!st||n(st.own_qty)<=0){d.no_vitebsk++;continue;}
    const sale=salesMap.get(manager+'|'+skuKey(sku)),cur=n(sale?.cur),prev=n(sale?.prev),loss=Math.max(0,prev-cur),own=n(st.own_qty),partner=n(st.partner_total),shipped=n(shipAfter.get(skuKey(sku)));
    if(taskType==='availability'&&shipped>0){d.already_shipped++;continue;}
    d.scanned++;
    const raw=30+lossPts(loss)+severityPts(issue.severity)+Math.min(12,Math.round(cur/3000))+ownSupport(own)+Math.min(8,partnerSupport(partner));
    if(raw<48)continue; // no large batch tasks for commercially insignificant cards
    const ctx={current_revenue:cur,previous_revenue:prev,loss,partner_total:partner,partner_orders:n(st.partner_orders),stock_days:st.stock_days==null?null:n(st.stock_days),own_qty:own,chekhov_qty:n(st.chekhov_qty),sales_90:n(st.sales_90),recommended_qty:Math.max(0,n(st.recommended)-shipped),shipped_after_snapshot:shipped,partner_snapshot_date:partnerDate,own_report_date:ownDate,content_issue_type:issue.issue_type,content_issue_title:issue.issue_title,product_url:issue.product_url||'',donor_article:issue.donor_article||'',current_value:issue.current_value||'',target_value:issue.target_value||'',target_metric:String(issue.target_value||'Проблема карточки устранена')};
    put(base(manager,issue.category||issue.subgroup||st.assigned_group||'Не распределено',sku,issue.product_name||st.product||'','card_issue','fix_card_lever',raw,ctx,{
      plan_month:planMonth,task_type:taskType,strategy_label:'Исправить коммерчески значимый рычаг карточки',title:'Усилить карточку · '+sku,
      task_text:'Исправить конкретную проблему карточки «'+String(issue.issue_title||issue.issue_type||'')+'»; согласовать изменение с 21vek; после публикации проверить карточку и влияние на позицию/продажи.',
      basis:'Свежий контроль 21vek: '+String(issue.current_value||issue.issue_title||'проблема активна')+'. Продажи '+money(cur)+', аналог '+money(prev)+', потеря '+money(loss)+'. Витебск '+qty(own)+' шт., 21vek '+qty(partner)+' шт.',
      expected_result:String(issue.target_value||'Проблема карточки устранена и подтверждена свежим отчётом.'),
      criteria:'Следующий свежий Excel 21vek подтверждает исправление конкретной проблемы; затем контролируется позиция/продажи.',
      next_step:'Если карточка исправлена, но коммерческий результат не изменился — перейти к следующему рычагу sell-out.'
    }));
  }

  const byManager=new Map(MANAGERS.map(m=>[m,[]]));
  for(const c of best.values())byManager.get(c.manager_email)?.push(c);
  const candidates=[];
  for(const manager of MANAGERS){
    const arr=(byManager.get(manager)||[]).sort((a,b)=>n(b.commercial_score)-n(a.commercial_score)||n(b.commercial_context?.loss)-n(a.commercial_context?.loss)||String(a.sku||'').localeCompare(String(b.sku||''),'ru'));
    arr.forEach((c,i)=>{
      const rank=i+1,cap=rankCap(rank),final=Math.max(0,Math.min(n(c.commercial_score),cap));
      c.priority_score=Math.round(final);c.base_priority=Math.round(final);c.portfolio_rank=rank;
      c.commercial_context={...(c.commercial_context||{}),portfolio_rank:rank,commercial_score:n(c.commercial_score),priority_score:Math.round(final)};
      candidates.push(c);
    });
  }
  candidates.sort((a,b)=>n(b.priority_score)-n(a.priority_score)||n(b.commercial_score)-n(a.commercial_score)||n(b.commercial_context?.loss)-n(a.commercial_context?.loss));
  d.candidates=candidates.length;
  return{candidates,diagnostics:d};
}

window.triovistCommercialEngineV227318=monthlyEngine;
window.triovistCommercialEngineV227313=monthlyEngine; // one engine for recommendations + plans
window.RESANTA_TRIOVIST_V227318=Object.freeze({version:V,managerMonthlyPlan:true,target15or20:true,monthEndDueDate:true,commercialImpactRanking:true,softPortfolioQuotas:true,safeRebuild:true,measurableTargets:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 53 ===== */
// RESANTA CRM v22.7.31.9 · SUBGROUP COMMERCIAL ENGINE
(function(){
'use strict';
const V='v22.7.31.9',ALEKS='aleksandrenko_av@resanta.ru',KRISHTAL='krishtal_na@resanta.ru',MANAGERS=[ALEKS,KRISHTAL];
const n=v=>Number(v)||0,skuKey=v=>String(v||'').toUpperCase().replace(/[^A-ZА-ЯЁ0-9]/g,''),norm=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,' ').trim().replace(/\s+/g,' '),money=v=>n(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN',qty=v=>n(v).toLocaleString('ru-RU',{maximumFractionDigits:2});
const managerName=e=>String(e||'').toLowerCase()===ALEKS?'Александренко':String(e||'').toLowerCase()===KRISHTAL?'Кришталь':'—';
function is900(...vals){return vals.some(v=>/^900(?:\/|$)/i.test(String(v||'').trim())||/(^|[^0-9])900\s*(группа|гр\.?)([^0-9]|$)/i.test(String(v||'')));}
function ageDays(v){if(!v)return 9999;const d=new Date(String(v).length===10?String(v)+'T12:00:00':v);return Number.isNaN(d.getTime())?9999:Math.floor((Date.now()-d.getTime())/86400000);}
function monthNow(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
function monthEnd(){const d=new Date(),x=new Date(d.getFullYear(),d.getMonth()+1,0);return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');}
function groupKey(v){return String(v||'').toUpperCase().replace(/Ё/g,'Е').replace(/[^A-ZА-Я0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,90)||'NO_SUBGROUP';}
function taskKey(manager,parent,subgroup,month){return 'v227319|'+String(manager||'').toLowerCase()+'|'+String(month||monthNow())+'|'+groupKey(parent+'_'+subgroup);}
function issueType(issue){const t=String(issue?.issue_type||'');if(['question_unanswered','no_questions','delivery_minsk_slow'].includes(t))return null;if(['listing_outside_top60','listing_31_60'].includes(t))return'listing';if(t==='out_of_stock')return'availability';if(['no_reviews','low_product_rating','low_last_review','negative_review_unanswered'].includes(t))return'reputation';if(['no_video','video_available_not_uploaded','few_photos'].includes(t))return'media';if(['no_description','no_warranty'].includes(t))return'content';return null;}
function issueStrength(issue){if(!issue)return 0;const sev=String(issue.severity||'')==='critical'?12:String(issue.severity||'')==='warning'?8:4,t=String(issue.issue_type||'');return sev+(t==='listing_outside_top60'?8:t==='listing_31_60'?5:t==='out_of_stock'?5:3);}
function lossPts(x){x=n(x);return x>=70000?42:x>=40000?36:x>=20000?31:x>=10000?26:x>=5000?20:x>=2000?14:x>=500?8:x>0?4:0;}
function rankCap(rank){if(rank===1)return 98;if(rank===2)return 95;if(rank===3)return 92;if(rank<=6)return 89-(rank-4)*3;if(rank<=10)return 79-(rank-7)*3;return Math.max(52,66-(rank-11)*2);}
function round2(v){return Math.round(n(v)*100)/100;}
function subgroupName(x){return String(x?.subgroup||x?.category||x?.assigned_group||'Не распределено').trim()||'Не распределено';}
function parentName(x){return String(x?.assigned_group||x?.category||x?.subgroup||'Не распределено').trim()||'Не распределено';}
function reasonLabel(r,issue){return r==='lost_sales'?'Потерянные продажи':r==='falling_sales'?'Падение продаж':r==='no_stock_21vek'?'Нет на 21vek':r==='low_stock_21vek'?'Риск out-of-stock':r==='novelty'?'Новинка':r==='card_issue'?(String(issue?.issue_title||'Проблема карточки')):'Коммерческий сигнал';}
function itemScore(reason,loss,own,partner,issue,sales90){let s=0;if(reason==='lost_sales')s=72+Math.min(20,lossPts(loss));else if(reason==='falling_sales')s=62+Math.min(18,lossPts(loss));else if(reason==='no_stock_21vek')s=64+Math.min(12,Math.round(n(sales90)/5));else if(reason==='low_stock_21vek')s=56+Math.min(12,Math.round(n(sales90)/5));else if(reason==='novelty')s=52;else if(reason==='card_issue')s=48+issueStrength(issue);if(n(own)>=10)s+=6;else if(n(own)>=3)s+=3;else if(n(own)===1)s-=7;if(n(partner)>=10&&['lost_sales','falling_sales'].includes(reason))s+=5;return Math.max(0,Math.min(100,s));}

function subgroupEngine(input={}){
  const salesData=input.salesData||{},stockData=input.stockData||{},issues=input.contentIssues||[],shipments=input.shipments||[],novelties=input.novelties||[],planMonth=input.planMonth||monthNow();
  const partnerDate=String(input.partnerSnapshotDate||stockData?.imports?.partner?.snapshot_date||''),ownDate=String(input.ownReportDate||stockData?.imports?.own?.report_date||'');
  const blockedRaw=input.blockedSkusByManager||{},blocked=new Map(MANAGERS.map(m=>[m,new Set((blockedRaw[m]||[]).map(skuKey))]));
  const d={scanned:0,no_vitebsk:0,blocked_active:0,already_shipped:0,group_900:0,no_signal:0,subgroups_total:0,candidates:0};
  const shipAfter=new Map();for(const x of shipments){if(partnerDate&&String(x.shipment_date||'')<=partnerDate)continue;const k=skuKey(x.sku);shipAfter.set(k,(shipAfter.get(k)||0)+n(x.qty));}
  const novelty=new Map(novelties.map(x=>[skuKey(x.sku),x]));
  const stockBy=new Map();for(const x of (stockData.items||[])){if(is900(x.sku,x.assigned_group,x.category,x.subgroup)){d.group_900++;continue;}const k=skuKey(x.sku),m=String(x.manager_email||'').toLowerCase();if(m)stockBy.set(m+'|'+k,x);if(!stockBy.has('|'+k))stockBy.set('|'+k,x);}
  const issueBy=new Map();for(const x of issues){if(!x||!['open','needs_review'].includes(String(x.status||''))||!issueType(x))continue;const m=String(x.manager_email||'').toLowerCase(),k=skuKey(x.sku);if(!MANAGERS.includes(m)||!k||is900(x.sku,x.category,x.subgroup))continue;const old=issueBy.get(m+'|'+k);if(!old||issueStrength(x)>issueStrength(old))issueBy.set(m+'|'+k,x);}
  const facts=new Map();
  function ensure(m,sku,src={}){const k=m+'|'+skuKey(sku);if(!MANAGERS.includes(m)||!skuKey(sku))return null;let f=facts.get(k);if(!f){f={manager_email:m,sku:String(sku||''),product:'',parent_group:'Не распределено',subgroup:'Не распределено',cur:0,prev:0,qtyCur:0,qtyPrev:0};facts.set(k,f);}if(src.product||src.product_name)f.product=src.product||src.product_name;if(src.assigned_group){f.parent_group=String(src.assigned_group).trim()||f.parent_group;}else if(f.parent_group==='Не распределено'&&src.category){f.parent_group=String(src.category).trim()||f.parent_group;}const explicitSub=String(src.subgroup||src.category||'').trim();if(explicitSub)f.subgroup=explicitSub;else if(f.subgroup==='Не распределено'&&src.assigned_group)f.subgroup=String(src.assigned_group).trim();return f;}
  for(const x of (salesData.items||[])){const m=String(x.manager_email||'').toLowerCase(),sku=String(x.sku||'');if(!MANAGERS.includes(m)||!sku)continue;if(is900(sku,x.assigned_group,x.category,x.subgroup)){d.group_900++;continue;}const f=ensure(m,sku,x);f.cur+=n(x.current_revenue);f.prev+=n(x.previous_revenue);f.qtyCur+=n(x.current_qty);f.qtyPrev+=n(x.previous_qty);}
  for(const x of (stockData.items||[])){const m=String(x.manager_email||'').toLowerCase(),sku=String(x.sku||'');if(!MANAGERS.includes(m)||!sku||is900(sku,x.assigned_group,x.category,x.subgroup))continue;ensure(m,sku,x);}
  for(const x of issues){const m=String(x.manager_email||'').toLowerCase(),sku=String(x.sku||'');if(!MANAGERS.includes(m)||!sku||is900(sku,x.category,x.subgroup))continue;ensure(m,sku,x);}

  const groups=new Map();
  function groupFor(f){const key=f.manager_email+'|'+norm(f.parent_group)+'|'+norm(f.subgroup);let g=groups.get(key);if(!g){g={manager_email:f.manager_email,manager_name:managerName(f.manager_email),parent_group:f.parent_group,subgroup:f.subgroup,total_cur:0,total_prev:0,total_qty_cur:0,total_qty_prev:0,total_sku_count:0,excluded_no_vitebsk:0,excluded_blocked:0,items:[]};groups.set(key,g);}return g;}
  for(const f of facts.values()){if(is900(f.sku,f.parent_group,f.subgroup)){d.group_900++;continue;}const g=groupFor(f);g.total_cur+=f.cur;g.total_prev+=f.prev;g.total_qty_cur+=f.qtyCur;g.total_qty_prev+=f.qtyPrev;g.total_sku_count++;}

  for(const f of facts.values()){
    d.scanned++;if(is900(f.sku,f.parent_group,f.subgroup))continue;const g=groupFor(f),k=skuKey(f.sku);
    if(blocked.get(f.manager_email)?.has(k)){g.excluded_blocked++;d.blocked_active++;continue;}
    const st=stockBy.get(f.manager_email+'|'+k)||stockBy.get('|'+k),own=n(st?.own_qty),partner=n(st?.partner_total),chekhov=n(st?.chekhov_qty),sales90=n(st?.sales_90),rawRec=n(st?.recommended),shipped=n(shipAfter.get(k)),rec=Math.max(0,rawRec-shipped),days=st?.stock_days==null?null:n(st.stock_days),issue=issueBy.get(f.manager_email+'|'+k),nov=novelty.get(k),first=nov?.first_positive_date||nov?.first_seen_date||null,loss=Math.max(0,f.prev-f.cur);
    if(own<=0){g.excluded_no_vitebsk++;d.no_vitebsk++;continue;}
    const options=[];
    if(f.prev>0&&f.cur<=0.01){if(partner>0)options.push({reason:'lost_sales',score:itemScore('lost_sales',loss,own,partner,issue,sales90),target_revenue:round2(f.prev*.5),target_value:'Выручка SKU ≥ '+money(f.prev*.5)});else if(shipped<=0)options.push({reason:'no_stock_21vek',score:itemScore('no_stock_21vek',loss,own,partner,issue,sales90),target_partner_qty:Math.min(own,Math.max(1,Math.ceil(rec||sales90/6||1))),target_value:'Наличие 21vek > 0 и запуск sell-out'});else{d.already_shipped++;options.push({reason:'lost_sales',score:itemScore('lost_sales',loss,own,partner,issue,sales90)-4,target_revenue:round2(f.prev*.4),target_value:'Проверить уже сделанную отгрузку и вернуть sell-out'});}}
    if(f.prev>0&&f.cur>0&&f.cur<f.prev*.85)options.push({reason:'falling_sales',score:itemScore('falling_sales',loss,own,partner,issue,sales90),target_revenue:round2(f.prev*.85),target_value:'Выручка SKU ≥ '+money(f.prev*.85)});
    if(partner<=0&&shipped<=0&&(f.prev>0||sales90>0||rec>0))options.push({reason:'no_stock_21vek',score:itemScore('no_stock_21vek',loss,own,partner,issue,sales90),target_partner_qty:Math.min(own,Math.max(1,Math.ceil(rec||sales90/6||1))),target_value:'Наличие 21vek > 0'});
    if(rec>0&&partner>0&&(days==null||days<14)&&shipped<=0)options.push({reason:'low_stock_21vek',score:itemScore('low_stock_21vek',loss,own,partner,issue,sales90),target_stock_days:14,target_partner_qty:Math.min(own,Math.max(1,Math.ceil(rec))),target_value:'Запас 21vek ≥ 14 дней'});
    if(first&&ageDays(first)<=60)options.push({reason:'novelty',score:itemScore('novelty',loss,own,partner,issue,sales90)+(ageDays(first)<=30?5:0),target_qty:Math.max(1,Math.min(3,Math.floor(own+partner))),target_value:'Первые подтверждённые продажи новинки'});
    if(issue&&issueType(issue)){const sc=itemScore('card_issue',loss,own,partner,issue,sales90);if(sc>=52)options.push({reason:'card_issue',score:sc,target_value:String(issue.target_value||'Проблема карточки устранена')});}
    if(!options.length){d.no_signal++;continue;}
    options.sort((a,b)=>b.score-a.score);const best=options[0],label=reasonLabel(best.reason,issue);
    g.items.push({sku:f.sku,product_name:f.product||st?.product||issue?.product_name||'',reason_code:best.reason,reason_label:label,issue_title:label,content_issue_title:issue?.issue_title||'',current_revenue:round2(f.cur),previous_revenue:round2(f.prev),loss:round2(loss),current_qty:round2(f.qtyCur),previous_qty:round2(f.qtyPrev),partner_total:partner,own_qty:own,chekhov_qty:chekhov,sales_90:sales90,recommended_qty:rec,stock_days:days,shipped_after_snapshot:shipped,item_score:Math.round(best.score),target_revenue:best.target_revenue||null,target_partner_qty:best.target_partner_qty||null,target_stock_days:best.target_stock_days||null,target_qty:best.target_qty||null,current_value:'Продажи '+money(f.cur)+' · 21vek '+qty(partner)+' · Витебск '+qty(own),target_value:best.target_value||'',donor_article:issue?.donor_article||'',product_url:issue?.product_url||'',item_status:'open'});
  }

  d.subgroups_total=groups.size;const byManager=new Map(MANAGERS.map(m=>[m,[]]));
  for(const g of groups.values()){
    if(!g.items.length)continue;g.items.sort((a,b)=>n(b.item_score)-n(a.item_score)||n(b.loss)-n(a.loss));
    const selected=g.items.slice(0,12),totalLoss=Math.max(0,g.total_prev-g.total_cur),actionableLoss=selected.reduce((a,x)=>a+n(x.loss),0),lost=selected.filter(x=>x.reason_code==='lost_sales').length,falling=selected.filter(x=>x.reason_code==='falling_sales').length,noStock=selected.filter(x=>x.reason_code==='no_stock_21vek').length,lowStock=selected.filter(x=>x.reason_code==='low_stock_21vek').length,content=selected.filter(x=>x.reason_code==='card_issue').length,noveltyCount=selected.filter(x=>x.reason_code==='novelty').length,ownTotal=selected.reduce((a,x)=>a+n(x.own_qty),0),partnerTotal=selected.reduce((a,x)=>a+n(x.partner_total),0),chekhovTotal=selected.reduce((a,x)=>a+n(x.chekhov_qty),0),recTotal=selected.reduce((a,x)=>a+n(x.recommended_qty),0),shippedCount=selected.filter(x=>n(x.shipped_after_snapshot)>0).length;
    const avgItem=selected.reduce((a,x)=>a+n(x.item_score),0)/selected.length;
    if(selected.length<2&&totalLoss<10000&&avgItem<78)continue;
    let strategy='subgroup_growth',taskType='listing',strategyLabel='Рост подгруппы';
    if(totalLoss>0&&(lost+falling)>0){strategy='subgroup_sales_recovery';taskType='listing';strategyLabel='Вернуть продажи подгруппы';}
    else if(noStock+lowStock>=Math.max(2,Math.ceil(selected.length*.4))){strategy='subgroup_availability';taskType='availability';strategyLabel='Восстановить наличие подгруппы';}
    else if(content>=Math.max(2,Math.ceil(selected.length*.4))){strategy='subgroup_visibility';taskType='content';strategyLabel='Усилить видимость подгруппы';}
    else if(noveltyCount>=Math.max(2,Math.ceil(selected.length*.4))){strategy='subgroup_launch';taskType='novelty';strategyLabel='Запустить новинки подгруппы';}
    const recoveryShare=actionableLoss>=30000?.65:.60,targetRevenue=round2(Math.min(g.total_prev>0?g.total_prev:Infinity,g.total_cur+actionableLoss*recoveryShare)),increment=round2(Math.max(0,targetRevenue-g.total_cur));
    let raw=28+lossPts(totalLoss)+Math.min(16,selected.length*2)+Math.min(12,lost*3+falling*2)+Math.min(10,noStock*2+lowStock)+Math.min(8,content*2)+Math.min(5,noveltyCount*2)+(ownTotal>=30?7:ownTotal>=10?4:0);
    raw=Math.max(0,Math.min(100,raw));
    const basis='Подгруппа «'+g.subgroup+'»: сейчас '+money(g.total_cur)+', аналог '+money(g.total_prev)+', потеря '+money(totalLoss)+'. В работу отобрано '+selected.length+' SKU из '+g.total_sku_count+': потерянные '+lost+', падающие '+falling+', без наличия 21vek '+noStock+', риск низкого запаса '+lowStock+', проблемы карточек '+content+', новинки '+noveltyCount+'.'+(g.excluded_no_vitebsk?' Без Витебска исключено '+g.excluded_no_vitebsk+' SKU.':'')+(g.excluded_blocked?' Уже занято согласованными задачами '+g.excluded_blocked+' SKU.':'');
    let expected,criteria,next;
    if(totalLoss>0&&actionableLoss>0){expected='До конца месяца увеличить выручку подгруппы минимум до '+money(targetRevenue)+' — вернуть '+money(increment)+' из доступной к восстановлению потери.';criteria='Свежие продажи 21vek подтверждают выручку подгруппы ≥ '+money(targetRevenue)+'; отдельно видно прогресс по '+selected.length+' приоритетным SKU.';next='Если цель не достигнута — по SKU без прогресса зафиксировать уже проверенный рычаг и согласовать следующий тест с 21vek.';}
    else if(noStock+lowStock>0){expected='Вернуть в устойчивое наличие приоритетные SKU подгруппы и не допустить повторного out-of-stock без избыточной отгрузки.';criteria='По следующему свежему остатку 21vek целевые SKU доступны, а низкий запас доведён к ориентиру 14 дней там, где это позволяет Витебск.';next='После восстановления наличия оценить sell-out и не повторять отгрузку без новой потребности.';}
    else if(noveltyCount>0){expected='Запустить приоритетные новинки подгруппы и получить первые подтверждённые продажи до конца месяца.';criteria='Свежий отчёт подтверждает первые продажи по приоритетным новинкам и доступность карточек.';next='После первых продаж оценить темп и сформировать повторную потребность только по факту sell-out.';}
    else{expected='Исправить коммерчески значимые проблемы карточек приоритетных SKU и улучшить видимость подгруппы.';criteria='Следующий свежий отчёт 21vek подтверждает исправление отмеченных проблем; далее контролируется позиция и выручка подгруппы.';next='Если карточки исправлены, но продажи не растут — перейти к цене/SALE, поисковой выдаче и ассортиментному покрытию.';}
    const taskText='1. Отработать '+selected.length+' приоритетных SKU из списка ниже в порядке коммерческого эффекта. 2. По SKU с товаром на 21vek и падением sell-out проверить выдачу, цену/SALE, поисковые фразы и карточку — дополнительную отгрузку без потребности не делать. 3. По SKU с 21vek=0 пополнять только из свободного остатка Витебска; уже сделанную после снимка отгрузку не повторять. 4. Исправить отмеченные проблемы карточек и отдельно запустить новинки. 5. Контролировать выручку всей подгруппы и прогресс по SKU до конца месяца.';
    const first=selected[0];const candidate={candidate_key:taskKey(g.manager_email,g.parent_group,g.subgroup,planMonth),generator_version:V,reason_code:'subgroup_growth',strategy_code:strategy,portfolio_bucket:'subgroup',manager_email:g.manager_email,manager_name:g.manager_name,group_name:g.subgroup,sku:first.sku,product_name:'Подгруппа: '+g.subgroup,task_type:taskType,priority_score:Math.round(raw),base_priority:Math.round(raw),commercial_score:Math.round(raw),due_date:monthEnd(),title:strategyLabel+' «'+g.subgroup+'»',task_text:taskText,basis,expected_result:expected,criteria,next_step:next,commercial_context:{task_scope:'subgroup',candidate_key:taskKey(g.manager_email,g.parent_group,g.subgroup,planMonth),generator_version:V,reason_code:'subgroup_growth',strategy_code:strategy,strategy_label:strategyLabel,parent_group:g.parent_group,subgroup_name:g.subgroup,plan_month:planMonth,subgroup_current_revenue:round2(g.total_cur),subgroup_previous_revenue:round2(g.total_prev),subgroup_loss:round2(totalLoss),actionable_loss:round2(actionableLoss),commercial_value:round2(actionableLoss),target_revenue:targetRevenue,target_recovery_increment:increment,target_recovery_pct:Math.round(recoveryShare*100),selected_sku_count:selected.length,total_sku_count:g.total_sku_count,excluded_no_vitebsk:g.excluded_no_vitebsk,excluded_blocked:g.excluded_blocked,lost_sku_count:lost,falling_sku_count:falling,no_stock_sku_count:noStock,low_stock_sku_count:lowStock,content_issue_count:content,novelty_count:noveltyCount,already_shipped_sku_count:shippedCount,partner_total:partnerTotal,own_qty:ownTotal,chekhov_qty:chekhovTotal,recommended_qty:recTotal,plan_items:selected,sku:first.sku}};
    byManager.get(g.manager_email)?.push(candidate);
  }
  const candidates=[];for(const manager of MANAGERS){const arr=(byManager.get(manager)||[]).sort((a,b)=>n(b.commercial_context?.commercial_value)-n(a.commercial_context?.commercial_value)||n(b.commercial_score)-n(a.commercial_score)||n(b.commercial_context?.selected_sku_count)-n(a.commercial_context?.selected_sku_count));arr.forEach((c,i)=>{const rank=i+1,cap=rankCap(rank),final=Math.min(n(c.commercial_score),cap);c.priority_score=Math.round(final);c.base_priority=Math.round(final);c.commercial_context={...c.commercial_context,portfolio_rank:rank,priority_score:Math.round(final)};candidates.push(c);});}
  candidates.sort((a,b)=>n(b.priority_score)-n(a.priority_score)||n(b.commercial_context?.commercial_value)-n(a.commercial_context?.commercial_value));d.candidates=candidates.length;return{candidates,diagnostics:d};
}
window.triovistSubgroupCommercialEngineV227319=subgroupEngine;
window.triovistCommercialEngineV227313=subgroupEngine;
window.RESANTA_TRIOVIST_V227319=Object.freeze({version:V,taskScope:'subgroup',planSizes:[8,10,12,15],maxItemsPerSubgroup:12,managerSpecific:true,monthEndDueDate:true,approvedTasksImmutable:true,blockedActiveSkuExcluded:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 54 ===== */
// ============================================================================
// RESANTA CRM v22.7.32 · ABSENCE / SUBSTITUTION COVERAGE
// Официальное отсутствие не меняет владельца клиента и не искажает KPI.
// Маршруты периода не становятся просроченными; заместитель может связать
// фактический визит/звонок с конкретной route_plan точкой.
// ============================================================================
(function(){
'use strict';
const V='v22.7.32';
let absLoading=false,absLoaded=false;

function absNorm(v){return normalizePersonName(v||'');}
function absFmt(d){if(!d)return'—';try{return new Date(String(d).slice(0,10)+'T12:00:00').toLocaleDateString('ru-RU');}catch(_){return d;}}
function absManagers(){return [...new Set((allClients||[]).map(c=>c.manager_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));}
function absSubstitutes(){return [...new Set((allUsers||[]).map(u=>u.name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));}
function absRoutes(a){return (allRoutePlans||[]).filter(r=>!r.removed&&absNorm(r.manager_name)===absNorm(a.manager_name)&&String(r.visit_date||'')>=String(a.date_from||'')&&String(r.visit_date||'')<=String(a.date_to||'')).sort((x,y)=>String(x.visit_date||'').localeCompare(String(y.visit_date||'')));}
function absTasks(a){return (allTasks||[]).filter(t=>isActiveTask(t)&&absNorm(taskManagerName(t))===absNorm(a.manager_name)&&String(t.due_date||'')>=String(a.date_from||'')&&String(t.due_date||'')<=String(a.date_to||'')).sort((x,y)=>String(x.due_date||'').localeCompare(String(y.due_date||'')));}
function absRouteCovered(r){return routePlanVerified(r,allVisits,allRoutePlans);}

async function loadAbsences(force=false){
  if(absLoading)return allManagerAbsences;
  if(absLoaded&&!force)return allManagerAbsences;
  absLoading=true;
  try{
    const {data,error}=await db.from('manager_absences').select('*').order('date_from',{ascending:false}).limit(500);
    if(error)throw error;
    allManagerAbsences=(data||[]).filter(x=>x.status!=='deleted');
    absLoaded=true;
    // Справочник отсутствий не перерисовывает скрытый Dashboard.
    if((typeof crmActivePage==='function'?crmActivePage():'')==='dashboard'){try{buildDashboard?.();}catch(_){ }}
    renderAbsenceDecorations();
    return allManagerAbsences;
  }catch(e){
    console.warn('Отсутствия/замещения пока недоступны',e);
    return allManagerAbsences;
  }finally{absLoading=false;}
}
window.loadManagerAbsencesV22732=loadAbsences;

function ensureAbsenceModal(){
  if(document.getElementById('modal-manager-absences'))return;
  const el=document.createElement('div');el.className='modal-bg';el.id='modal-manager-absences';
  el.innerHTML='<div class="modal" style="max-width:920px">'
    +'<div class="modal-head"><div class="modal-title">🏖 Отсутствия и замещения</div><button class="modal-close" onclick="closeModal(\'modal-manager-absences\')">×</button></div>'
    +'<div style="font-size:12px;line-height:1.55;color:var(--sub);margin-bottom:12px">Клиенты и продажи остаются закреплены за своим менеджером. На период отсутствия маршрут не считается просроченным. Заместитель закрывает только реально обработанные точки.</div>'
    +'<div id="absence-list"></div>'
    +'<div class="card" style="margin-top:12px;background:var(--bg)"><div class="card-title">Добавить отсутствие</div><div style="display:grid;grid-template-columns:1.2fr .9fr .9fr 1fr;gap:8px">'
      +'<div><label class="form-label">Менеджер</label><select id="absence-manager" class="form-input"></select></div>'
      +'<div><label class="form-label">С</label><input id="absence-from" type="date" class="form-input"></div>'
      +'<div><label class="form-label">По</label><input id="absence-to" type="date" class="form-input"></div>'
      +'<div><label class="form-label">Причина</label><select id="absence-reason" class="form-input"><option>Отпуск</option><option>Больничный</option><option>Командировка</option><option>Другое</option></select></div>'
    +'</div><div style="display:grid;grid-template-columns:1.2fr 1fr;gap:8px;margin-top:8px">'
      +'<div><label class="form-label">Замещает</label><select id="absence-substitute" class="form-input"><option value="">Без заместителя</option></select></div>'
      +'<div style="display:flex;align-items:end"><button class="btn-primary" style="width:100%" onclick="saveManagerAbsenceV22732()">Сохранить отсутствие</button></div>'
    +'</div></div>'
    +'<div id="absence-coverage" style="margin-top:12px"></div>'
  +'</div>';
  document.body.appendChild(el);
}

function fillAbsenceForm(){
  const m=document.getElementById('absence-manager'),sub=document.getElementById('absence-substitute');if(!m||!sub)return;
  m.innerHTML=absManagers().map(x=>'<option value="'+escAttr(x)+'">'+esc(x)+'</option>').join('');
  sub.innerHTML='<option value="">Без заместителя</option>'+absSubstitutes().map(x=>'<option value="'+escAttr(x)+'">'+esc(x)+'</option>').join('');
  const f=document.getElementById('absence-from'),t=document.getElementById('absence-to');if(f&&!f.value)f.value=TODAY;if(t&&!t.value)t.value=monthEndDate(TODAY);
}
function absenceState(a){if(a.status==='cancelled')return{txt:'Отменено',bg:'var(--bg)',c:'var(--sub)'};if(String(a.date_to)<TODAY)return{txt:'Завершено',bg:'var(--bg)',c:'var(--sub)'};if(String(a.date_from)>TODAY)return{txt:'Запланировано',bg:'#EFF6FF',c:'#1D4ED8'};return{txt:'Сейчас отсутствует',bg:'#FFF7ED',c:'#9A3412'};}
function renderAbsenceList(){
  const box=document.getElementById('absence-list');if(!box)return;
  const rows=(allManagerAbsences||[]).filter(a=>a.status!=='deleted');
  if(!rows.length){box.innerHTML='<div style="padding:12px;color:var(--sub);background:var(--bg);border-radius:10px">Отсутствий пока нет.</div>';return;}
  box.innerHTML=rows.map(a=>{const st=absenceState(a),routes=absRoutes(a),covered=routes.filter(absRouteCovered).length,tasks=absTasks(a).length;return '<div class="card" style="margin-bottom:8px;padding:10px 12px">'
    +'<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap"><div><b>'+esc(a.manager_name)+'</b> <span class="tag" style="background:'+st.bg+';color:'+st.c+'">'+st.txt+'</span><div style="font-size:12px;color:var(--sub);margin-top:4px">'+esc(a.reason||'Отсутствие')+' · '+absFmt(a.date_from)+' — '+absFmt(a.date_to)+' · замещает: <b>'+esc(a.substitute_name||'не назначен')+'</b></div><div style="font-size:11px;color:var(--sub);margin-top:3px">Маршрут периода: '+routes.length+' · покрыто: '+covered+' · открытых задач со сроком периода: '+tasks+'</div></div>'
    +'<div style="display:flex;gap:6px"><button class="btn-secondary" onclick="showAbsenceCoverageV22732(\''+escAttr(String(a.id))+'\')">Покрытие</button>'+(a.status!=='cancelled'&&String(a.date_to)>=TODAY?'<button class="btn-secondary" onclick="cancelManagerAbsenceV22732(\''+escAttr(String(a.id))+'\')">Отменить</button>':'')+'</div></div></div>';}).join('');
}

window.openManagerAbsences=async function(){
  if(currentProfile?.role!=='boss'){alert('Управление отсутствиями доступно руководителю.');return;}
  ensureAbsenceModal();fillAbsenceForm();document.getElementById('modal-manager-absences').classList.add('open');
  await loadAbsences(false);renderAbsenceList();
};
window.saveManagerAbsenceV22732=async function(){
  const manager=document.getElementById('absence-manager')?.value||'',date_from=document.getElementById('absence-from')?.value||'',date_to=document.getElementById('absence-to')?.value||'',reason=document.getElementById('absence-reason')?.value||'Отпуск',substitute_name=document.getElementById('absence-substitute')?.value||null;
  if(!manager||!date_from||!date_to){alert('Укажите менеджера и период.');return;}if(date_to<date_from){alert('Дата окончания раньше даты начала.');return;}if(substitute_name&&absNorm(substitute_name)===absNorm(manager)){alert('Менеджер не может замещать сам себя.');return;}
  const overlap=(allManagerAbsences||[]).find(a=>a.status!=='cancelled'&&absNorm(a.manager_name)===absNorm(manager)&&String(a.date_from)<=date_to&&String(a.date_to)>=date_from);
  if(overlap&&!confirm('У '+manager+' уже есть пересекающийся период '+absFmt(overlap.date_from)+' — '+absFmt(overlap.date_to)+'. Всё равно добавить?'))return;
  const row={manager_name:manager,date_from,date_to,reason,substitute_name,status:'active',created_by:currentProfile?.name||null};
  const {error}=await db.from('manager_absences').insert(row);if(error){alert('Не удалось сохранить отсутствие: '+error.message);return;}
  await loadAbsences(true);renderAbsenceList();renderAbsenceDecorations();
};
window.cancelManagerAbsenceV22732=async function(id){
  if(!confirm('Отменить этот период отсутствия? История сохранится.'))return;
  const {error}=await db.from('manager_absences').update({status:'cancelled',updated_at:new Date().toISOString()}).eq('id',id);if(error){alert(error.message);return;}await loadAbsences(true);renderAbsenceList();
};
window.showAbsenceCoverageV22732=function(id){
  const a=(allManagerAbsences||[]).find(x=>String(x.id)===String(id)),box=document.getElementById('absence-coverage');if(!a||!box)return;
  const routes=absRoutes(a),tasks=absTasks(a),covered=routes.filter(absRouteCovered).length;
  const canWork=currentProfile?.role==='boss'||absNorm(currentProfile?.name)===absNorm(a.substitute_name);
  box.innerHTML='<div class="card" style="border-color:#0F766E"><div class="card-title">🛟 Покрытие · '+esc(a.manager_name)+' → '+esc(a.substitute_name||'без заместителя')+'</div><div style="font-size:12px;color:var(--sub);margin-bottom:8px">Точки периода не создают просрочку. Реально обработанная заместителем точка фиксируется через обычную форму визита/звонка и связывается с исходным маршрутом.</div>'
    +'<div class="kpi-row" style="margin-bottom:10px"><div class="kpi"><div class="kpi-label">Точек периода</div><div class="kpi-value">'+routes.length+'</div></div><div class="kpi"><div class="kpi-label">Покрыто</div><div class="kpi-value ok">'+covered+'</div></div><div class="kpi"><div class="kpi-label">Освобождено отсутствием</div><div class="kpi-value">'+Math.max(0,routes.length-covered)+'</div></div><div class="kpi"><div class="kpi-label">Задач периода</div><div class="kpi-value">'+tasks.length+'</div></div></div>'
    +'<div style="max-height:330px;overflow:auto">'+(routes.length?routes.map(r=>{const done=absRouteCovered(r),c=r.client_id?(allClients||[]).find(x=>String(x.id)===String(r.client_id)):matchClientByName(r.client_name||'');return '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;padding:7px 0;border-top:1px solid var(--border)"><div><b>'+esc(r.client_name||'Клиент')+'</b><div style="font-size:11px;color:var(--sub)">'+esc(r.visit_date||'—')+' · '+esc([r.city,r.address].filter(Boolean).join(' · '))+' · '+(done?'✅ покрыто':'⏸ не считается просрочкой')+'</div></div>'+(canWork&&!done&&c?'<button class="btn-secondary" onclick="closeModal(\'modal-manager-absences\');openQuickVisit(\''+escAttr(String(c.id))+'\',null,\''+escAttr(String(r.id))+'\')">Визит / звонок</button>':'')+'</div>';}).join(''):'<div style="color:var(--sub)">Маршрутных точек в периоде нет.</div>')+'</div></div>';
};

function renderAbsenceDecorations(){
  // Личный маршрут: понятное объяснение, почему точки периода не краснеют.
  const my=currentProfile?.name||'',a=managerAbsenceCovering(my,TODAY),status=document.getElementById('mr-status-bar');
  if(status){const old=document.getElementById('mr-absence-banner');if(old)old.remove();if(a){const b=document.createElement('div');b.id='mr-absence-banner';b.className='card';b.style.cssText='margin-bottom:10px;background:#FFF7ED;border-color:#FDBA74';b.innerHTML='<b>🏖 Официальное отсутствие: '+absFmt(a.date_from)+' — '+absFmt(a.date_to)+'</b><div style="font-size:12px;color:var(--sub);margin-top:4px">Замещает: '+esc(a.substitute_name||'не назначен')+'. Точки этого периода не считаются просроченными.</div>';status.parentNode.insertBefore(b,status);}}
  // Руководительский маршрут: компактный список активных/будущих периодов.
  const rb=document.getElementById('rb-content');if(rb){let x=document.getElementById('rb-absence-summary');if(x)x.remove();const rows=(allManagerAbsences||[]).filter(a=>a.status!=='cancelled'&&String(a.date_to)>=TODAY).slice(0,8);if(rows.length){x=document.createElement('div');x.id='rb-absence-summary';x.className='card';x.style.cssText='margin-bottom:12px;border-color:#99F6E4';x.innerHTML='<div class="card-title">🏖 Отсутствия / замещения</div>'+rows.map(a=>'<div style="font-size:12px;padding:4px 0"><b>'+esc(a.manager_name)+'</b> · '+absFmt(a.date_from)+' — '+absFmt(a.date_to)+' · замещает '+esc(a.substitute_name||'не назначен')+'</div>').join('')+'<button class="btn-secondary" style="margin-top:7px" onclick="openManagerAbsences()">Открыть покрытие</button>';rb.parentNode.insertBefore(x,rb);}}
}
window.renderAbsenceDecorationsV22732=renderAbsenceDecorations;

// PERFORMANCE FINAL ROOT FIX: отсутствие не оборачивает глобальный loadData.
 // Справочник загружается только по требованию маршрутов/задач/дашборда
 // через Core Data Hub или при открытии окна отсутствий.
// Навигация/рендеры больше не оборачиваются этим модулем.
 // Core Data Hub вызывает загрузку и decoration только для активной страницы.
window.RESANTA_V22732=Object.freeze({version:V,monthlyAutoCallDeadline:true,assortmentMix:'70/30',routeClientSearch:true,absenceCoverage:true,substituteLinkedVisits:true});
})();
