/* RESANTA CRM v23.6.75 · ROUTE COVERAGE
 * Boss route editor sees every active client: Working + Potential, A/B/C/uncategorized.
 * Daily route stays capped at 15 stops.
 * Monthly coverage truth: each assigned client is either in a physical route or has one monthly call task.
 * No polling. No MutationObserver. No schema changes.
 */
(function(){
'use strict';
if(window.RESANTA_ROUTE_COVERAGE_V23675)return;

const V='v23.6.75',MAX_DAY=15;

function boss(){try{return currentProfile?.role==='boss'}catch(_){return false}}
function activeClient(c){const s=String(c?.client_status||'').trim().toLowerCase();return !!c&&!c.is_archived&&(s==='рабочий'||s==='потенциальный')}
function ymNow(){try{return TODAY.slice(0,7)}catch(_){return new Date().toISOString().slice(0,7)}}
function monthInput(){
  const el=document.getElementById('rb-coverage-month');
  if(el&&!el.value)el.value=ymNow();
  return el?.value||ymNow();
}
function monthLabelRu(ym){
  const [y,m]=String(ym||'').split('-').map(Number);
  if(!y||!m)return ym||'';
  return new Date(y,m-1,1,12).toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
}
function monthEnd(ym){
  try{return monthEndForYm(ym)}catch(_){
    const [y,m]=String(ym).split('-').map(Number);
    return y+'-'+String(m).padStart(2,'0')+'-'+String(new Date(y,m,0).getDate()).padStart(2,'0');
  }
}
function fieldManagers(){
  try{return routeManagerNames()}catch(_){
    return [...new Set((allClients||[]).map(c=>c.manager_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
  }
}
function coverageClients(filterMgr='all'){
  const managers=new Set(fieldManagers());
  return (allClients||[]).filter(c=>activeClient(c)&&c.manager_name&&managers.has(c.manager_name)&&(filterMgr==='all'||c.manager_name===filterMgr));
}
function routeClientIds(ym){
  const ids=new Set();
  (allRoutePlans||[]).filter(r=>!r.removed&&String(r.visit_date||'').startsWith(ym)&&!r.is_network_point).forEach(r=>{
    const add=v=>{const s=String(v||'').trim();if(s)ids.add(s);};
    add(r.client_id);
    let linked=r.linked_client_ids;
    if(typeof linked==='string'){try{linked=JSON.parse(linked)}catch(_){linked=[]}}
    if(Array.isArray(linked))linked.forEach(add);
    if(!r.client_id&&(!Array.isArray(linked)||!linked.length)){
      try{const c=matchClientByName(r.client_name);if(c&&activeClient(c))add(c.id)}catch(_){}
    }
  });
  return ids;
}

function localMonthCalls(ym){
  return (allTasks||[]).filter(t=>String(t.source||'')==='route_call_monthly'&&String(t.due_date||'').startsWith(ym));
}
function activeCallClientIds(ym){
  const ids=new Set();
  localMonthCalls(ym).forEach(t=>{
    if(t.done||t.review_status!=='stale_review')ids.add(String(t.client_id||''));
  });
  return ids;
}
function snapshot(ym,filterMgr='all'){
  const clients=coverageClients(filterMgr),routes=routeClientIds(ym),calls=activeCallClientIds(ym);
  const rows=clients.map(c=>({
    client:c,
    kind:routes.has(String(c.id))?'route':calls.has(String(c.id))?'call':'missing'
  }));
  const groups={};
  rows.forEach(x=>{
    const m=x.client.manager_name||'Без менеджера';
    const g=groups[m]||(groups[m]={manager:m,total:0,route:0,call:0,missing:0,potential:0,catC:0});
    g.total++;g[x.kind]++;
    if(x.client.client_status==='Потенциальный')g.potential++;
    if(String(x.client.role_type||'').trim().toUpperCase().startsWith('C'))g.catC++;
  });
  return {
    ym,rows,groups:Object.values(groups).sort((a,b)=>a.manager.localeCompare(b.manager,'ru')),
    total:rows.length,
    route:rows.filter(x=>x.kind==='route').length,
    call:rows.filter(x=>x.kind==='call').length,
    missing:rows.filter(x=>x.kind==='missing').length
  };
}
function renderCoverage(){
  if(!boss())return;
  const out=document.getElementById('rb-coverage');if(!out)return;
  const ym=monthInput(),filter=typeof rbMgrFilter!=='undefined'?rbMgrFilter:'all',s=snapshot(ym,filter);
  const missingRows=s.rows.filter(x=>x.kind==='missing');
  const scope=filter==='all'?'все менеджеры':filter;
  const cards=[
    ['Всего клиентов',s.total,'закреплённые активные карточки'],
    ['🚗 В маршруте',s.route,'хотя бы 1 визит в месяце'],
    ['📞 На прозвон',s.call,'месячная задача уже есть'],
    ['⚠ Без покрытия',s.missing,s.missing?'нужно назначить прозвон':'цель выполнена']
  ];
  let html='<div style="display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:8px;margin-bottom:10px">'
    +cards.map((x,i)=>'<div style="padding:10px 12px;border:1px solid var(--border);border-radius:9px;background:'+(i===3&&x[1]?'var(--yb)':'#fff')+'"><div style="font-size:11px;color:var(--sub)">'+x[0]+'</div><div style="font-size:22px;font-weight:700;margin-top:2px">'+x[1]+'</div><div style="font-size:10px;color:var(--sub)">'+x[2]+'</div></div>').join('')
    +'</div>';
  html+='<div style="overflow:auto"><table class="tbl"><thead><tr><th>Менеджер</th><th>Всего</th><th>🚗 Маршрут</th><th>📞 Прозвон</th><th>⚠ Без покрытия</th><th>Потенциальные</th><th>Кат. C</th></tr></thead><tbody>'
    +(s.groups.length?s.groups.map(g=>'<tr><td><b>'+esc(g.manager)+'</b></td><td>'+g.total+'</td><td>'+g.route+'</td><td>'+g.call+'</td><td style="font-weight:700;color:'+(g.missing?'var(--r)':'var(--g)')+'">'+g.missing+'</td><td>'+g.potential+'</td><td>'+g.catC+'</td></tr>').join(''):'<tr><td colspan="7" style="color:var(--sub)">Нет клиентов в выбранном фильтре</td></tr>')
    +'</tbody></table></div>';
  if(missingRows.length){
    const names=missingRows.slice(0,10).map(x=>esc(x.client.name)+(x.client.client_status==='Потенциальный'?' <span class="tag" style="background:#F3E8FF;color:#7C3AED">Потенциальный</span>':'')+(String(x.client.role_type||'').toUpperCase().startsWith('C')?' <span class="tag tag-gray">C</span>':'')).join(' · ');
    html+='<div style="font-size:11px;color:var(--sub);margin-top:8px">Без покрытия: '+names+(missingRows.length>10?' · ещё '+(missingRows.length-10):'')+'</div>';
  }
  html+='<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px">'
    +'<div style="font-size:11px;color:var(--sub)">Период: <b>'+esc(monthLabelRu(ym))+'</b> · область расчёта: <b>'+esc(scope)+'</b>. Физический маршрут имеет приоритет над прозвоном.</div>'
    +'<button '+(s.missing?'':'disabled ')+'onclick="generateRouteCallCoverageV23675()" class="btn-primary" style="font-size:12px;'+(s.missing?'':'opacity:.55;cursor:default')+'">📞 Сформировать прозвон для остальных'+(s.missing?' ('+s.missing+')':'')+'</button>'
    +'</div>';
  out.innerHTML=html;
}

async function fetchMonthCalls(ym){
  const end=monthEnd(ym);
  const {data,error}=await db.from('tasks').select('*').eq('source','route_call_monthly').gte('due_date',ym+'-01').lte('due_date',end);
  if(error)throw error;
  return data||[];
}
function mergeTasks(rows){
  const byId=new Map((allTasks||[]).map(t=>[String(t.id),t]));
  (rows||[]).forEach(t=>byId.set(String(t.id),t));
  allTasks=[...byId.values()];
}
async function archiveCoveredCalls(ym){
  if(!boss())return 0;
  const routes=routeClientIds(ym);
  if(!routes.size)return 0;
  const dbRows=await fetchMonthCalls(ym);
  mergeTasks(dbRows);
  const ids=dbRows.filter(t=>!t.done&&t.review_status!=='stale_review'&&routes.has(String(t.client_id||''))).map(t=>t.id);
  if(!ids.length)return 0;
  const upd={
    review_status:'stale_review',
    review_comment:'Снят с прозвона: клиент включён в физический маршрут на '+ym+'.',
    reviewed_by:'route_coverage_v23675',
    reviewed_at:new Date().toISOString()
  };
  const {error}=await db.from('tasks').update(upd).in('id',ids);
  if(error)throw error;
  allTasks=(allTasks||[]).map(t=>ids.includes(t.id)?{...t,...upd}:t);
  return ids.length;
}
async function generateCalls(){
  if(!boss()){alert('Формирование прозвона доступно только руководителю.');return;}
  const ym=monthInput();
  if(ym<ymNow()){alert('Прозвон формируется только на текущий или будущий месяц. Историю прошлых месяцев задним числом не меняем.');return;}
  const filter=typeof rbMgrFilter!=='undefined'?rbMgrFilter:'all';
  await archiveCoveredCalls(ym);
  const dbRows=await fetchMonthCalls(ym);mergeTasks(dbRows);
  const routes=routeClientIds(ym);
  const clients=coverageClients(filter);
  const existingByClient=new Map();
  dbRows.forEach(t=>{
    const id=String(t.client_id||'');if(!id)return;
    if(!existingByClient.has(id))existingByClient.set(id,[]);
    existingByClient.get(id).push(t);
  });
  const missing=clients.filter(c=>{
    if(routes.has(String(c.id)))return false;
    const rows=existingByClient.get(String(c.id))||[];
    return !rows.some(t=>t.done||t.review_status!=='stale_review');
  });
  if(!missing.length){renderCoverage();alert('Все клиенты уже покрыты маршрутом или прозвоном.');return;}

  const countByMgr={};missing.forEach(c=>countByMgr[c.manager_name]=(countByMgr[c.manager_name]||0)+1);
  const detail=Object.entries(countByMgr).map(([m,n])=>m+': '+n).join('\n');
  if(!confirm('Создать месячный прозвон для клиентов, которые не попали ни в один физический маршрут '+ym+'?\n\n'+detail+'\n\nВсего задач: '+missing.length+'\nСрок: '+monthEnd(ym)))return;

  const restoreIds=[];
  const toCreate=[];
  missing.forEach(c=>{
    const rows=existingByClient.get(String(c.id))||[];
    const rest=rows.find(t=>!t.done&&t.review_status==='stale_review'&&t.reviewed_by==='route_coverage_v23675');
    if(rest){restoreIds.push(rest.id);return;}
    toCreate.push({
      client_id:c.id,
      manager_name:c.manager_name,
      title:'Плановый прозвон клиента',
      text:'📞 Прозвон вместо полевого визита: клиент не включён в физический маршрут на '+ym+'. Уточнить продажи, остатки, потребность и зафиксировать следующее действие.',
      basis:'Клиент не включён ни в один физический маршрут за '+ym+'.',
      expected_result:'Связаться с ЛПР, понять текущую потребность и зафиксировать конкретное следующее действие.',
      criteria:'Факт контакта + содержательный результат разговора + следующее действие и дата.',
      priority:'обычный',
      source:'route_call_monthly',
      due_date:monthEnd(ym),
      done:false,
      auto_generated:false,
      review_status:'approved'
    });
  });

  let restored=0,created=0;
  if(restoreIds.length){
    const upd={review_status:'approved',review_comment:null,reviewed_by:null,reviewed_at:null,due_date:monthEnd(ym),auto_generated:false};
    const {error}=await db.from('tasks').update(upd).in('id',restoreIds);
    if(error)throw error;
    allTasks=(allTasks||[]).map(t=>restoreIds.includes(t.id)?{...t,...upd}:t);
    restored=restoreIds.length;
  }
  for(let i=0;i<toCreate.length;i+=100){
    const batch=toCreate.slice(i,i+100);
    const {data,error}=await db.from('tasks').insert(batch).select();
    if(error)throw error;
    mergeTasks(data||[]);created+=(data||[]).length;
  }
  try{renderTasks()}catch(_){}
  try{updateTasksAlertDot()}catch(_){}
  renderCoverage();
  alert('Готово.\n\nСоздано задач на прозвон: '+created+(restored?'\nВозвращено из архива после снятия маршрута: '+restored:'')+'\nПериод: '+ym+'\nБез покрытия после формирования: '+snapshot(ym,filter).missing);
}

const baseRender=window.renderRoutesBoss;
if(typeof baseRender==='function'){
  const wrapped=function(){
    const out=baseRender.apply(this,arguments);
    try{renderCoverage()}catch(e){console.warn(V+' coverage render',e)}
    return out;
  };
  window.renderRoutesBoss=wrapped;try{renderRoutesBoss=wrapped}catch(_){}
}

// Редактор маршрута намеренно не перехватываем: единственный рабочий редактор — фиолетовый manual-route-lite из 03-triovist-routes.js.

window.renderRouteCoverageV23675=renderCoverage;
window.generateRouteCallCoverageV23675=()=>generateCalls().catch(e=>{console.error(V,e);alert('Не удалось сформировать прозвон: '+(e?.message||e))});
window.syncRouteCoverageCallsV23675=ym=>archiveCoveredCalls(ym);
// Совместимость со старым именем v23.6.74 без второго редактора.
window.renderRouteCoverageV23674=renderCoverage;
window.generateRouteCallCoverageV23674=window.generateRouteCallCoverageV23675;
window.syncRouteCoverageCallsV23674=window.syncRouteCoverageCallsV23675;

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(renderCoverage,0),{once:true});
else setTimeout(renderCoverage,0);

window.RESANTA_ROUTE_COVERAGE_V23675=Object.freeze({
  version:V,
  singleBossRouteEditor:true,
  coverageOnlyModule:true,
  allActiveClientsInBossEditor:true,
  includesPotential:true,
  includesCategoryC:true,
  defaultAllCities:true,
  dailyRouteLimit:MAX_DAY,
  monthlyVisitOrCallCoverage:true,
  oneMonthlyCallPerClient:true,
  routeBeatsOpenCall:true,
  completedCallHistoryPreserved:true,
  noSchemaChanges:true,
  noPolling:true,
  noMutationObserver:true
});
})();
window.RESANTA_ROUTE_COVERAGE_V23674=window.RESANTA_ROUTE_COVERAGE_V23675;
