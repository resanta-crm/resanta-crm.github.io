/* RESANTA CRM v23.6.74 · ROUTE COVERAGE
 * Boss route editor sees every active client: Working + Potential, A/B/C/uncategorized.
 * Daily route stays capped at 15 stops.
 * Monthly coverage truth: each assigned client is either in a physical route or has one monthly call task.
 * No polling. No MutationObserver. No schema changes.
 */
(function(){
'use strict';
if(window.RESANTA_ROUTE_COVERAGE_V23674)return;

const V='v23.6.74',MAX_DAY=15;

function boss(){try{return currentProfile?.role==='boss'}catch(_){return false}}
function activeClient(c){return !!c&&!c.is_archived}
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
  (allRoutePlans||[]).filter(r=>!r.removed&&String(r.visit_date||'').startsWith(ym)).forEach(r=>{
    try{
      const c=matchClientByName(r.client_name);
      if(c&&activeClient(c))ids.add(String(c.id));
    }catch(_){}
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
    +'<button '+(s.missing?'':'disabled ')+'onclick="generateRouteCallCoverageV23674()" class="btn-primary" style="font-size:12px;'+(s.missing?'':'opacity:.55;cursor:default')+'">📞 Сформировать прозвон для остальных'+(s.missing?' ('+s.missing+')':'')+'</button>'
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
    reviewed_by:'route_coverage_v23674',
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
    const rest=rows.find(t=>!t.done&&t.review_status==='stale_review'&&t.reviewed_by==='route_coverage_v23674');
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

const baseOpen=window.openBossRouteDayEditor;
if(typeof baseOpen==='function'){
  const wrapped=function(date,manager){
    const st=document.getElementById('erd-status'),cat=document.getElementById('erd-category'),city=document.getElementById('erd-city');
    if(st)st.value='';if(cat)cat.value='';if(city)city.value='';
    const out=baseOpen.apply(this,arguments);
    try{if(city)city.value='';renderBossRouteDayClients()}catch(_){}
    return out;
  };
  window.openBossRouteDayEditor=wrapped;try{openBossRouteDayEditor=wrapped}catch(_){}
}

window.reloadBossRouteDayEditor=function(preserveCity){
  const citySel=document.getElementById('erd-city');
  const oldCity=preserveCity?(citySel?.value||''):'';
  bossRouteEditSelected=new Set();
  bossRouteEditUnmatched=[];
  const rows=bossRouteEditorRows();
  rows.forEach(r=>{
    const c=matchClientByName(r.client_name);
    if(c)bossRouteEditSelected.add(String(c.id));
    else bossRouteEditUnmatched.push(r);
  });
  const cities=[...new Set((allClients||[]).filter(activeClient).map(routeCityOfClient).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
  citySel.innerHTML='<option value="">Все города</option>'+cities.map(city=>'<option value="'+escAttr(city)+'">'+esc(city)+'</option>').join('');
  citySel.value=(oldCity&&cities.some(c=>routeCityKey(c)===routeCityKey(oldCity)))?oldCity:'';
  const unmatched=document.getElementById('erd-unmatched');
  if(bossRouteEditUnmatched.length){
    unmatched.style.display='block';
    unmatched.innerHTML='⚠️ В этом дне есть '+bossRouteEditUnmatched.length+' точк(а/и), которые не сопоставлены с карточками клиентов: <b>'+bossRouteEditUnmatched.map(r=>esc(r.client_name)).join(', ')+'</b>. Они будут сохранены и не удалятся автоматически.';
  }else unmatched.style.display='none';
  renderBossRouteDayClients();
};
try{reloadBossRouteDayEditor=window.reloadBossRouteDayEditor}catch(_){}

window.bossRouteVisibleClients=function(){
  const city=document.getElementById('erd-city')?.value||'';
  const status=document.getElementById('erd-status')?.value||'';
  const category=document.getElementById('erd-category')?.value||'';
  const q=(document.getElementById('erd-search')?.value||'').trim().toLowerCase();
  return (allClients||[]).filter(c=>{
    if(!activeClient(c))return false;
    if(city&&routeCityKey(routeCityOfClient(c))!==routeCityKey(city))return false;
    if(status&&String(c.client_status||'')!==status)return false;
    const cat=String(c.role_type||'').trim().toUpperCase();
    if(category==='__none__'&&cat)return false;
    if(category&&category!=='__none__'&&!cat.startsWith(category))return false;
    if(q){
      const hay=[c.name,c.address,c.city,c.region,c.manager_name,c.client_status,c.role_type].filter(Boolean).join(' ').toLowerCase();
      if(!hay.includes(q))return false;
    }
    return true;
  }).sort((a,b)=>{
    const sa=bossRouteEditSelected.has(String(a.id))?0:1,sb=bossRouteEditSelected.has(String(b.id))?0:1;
    return sa-sb||String(a.name||'').localeCompare(String(b.name||''),'ru');
  });
};
try{bossRouteVisibleClients=window.bossRouteVisibleClients}catch(_){}

window.renderBossRouteDayClients=function(){
  const rows=bossRouteVisibleClients(),manager=document.getElementById('erd-manager')?.value||'',out=document.getElementById('erd-results');
  const count=document.getElementById('erd-selected-count');
  if(count)count.textContent='В маршруте выбрано: '+bossRouteEditSelected.size+' / '+MAX_DAY;
  if(!out)return;
  if(!rows.length){out.innerHTML='<div style="padding:18px;color:var(--sub);font-size:13px">Клиенты не найдены</div>';return;}
  out.innerHTML=rows.map(c=>{
    const checked=bossRouteEditSelected.has(String(c.id)),noAddress=!String(c.address||'').trim(),foreign=c.manager_name&&c.manager_name!==manager;
    const potential=c.client_status==='Потенциальный';
    return '<label style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer">'
      +'<input type="checkbox" '+(checked?'checked ':'')+'onchange="toggleBossRouteClient(\''+c.id+'\',this.checked,this)" style="width:17px;height:17px;margin-top:2px;flex-shrink:0">'
      +'<span style="flex:1;min-width:0"><span style="font-size:13px;font-weight:600">'+catTag(c.role_type)+' '+esc(c.name)+'</span>'
      +(potential?'<span class="tag" style="margin-left:6px;background:#F3E8FF;color:#7C3AED">Потенциальный</span>':'<span class="tag tag-m" style="margin-left:6px">Рабочий</span>')
      +(foreign?'<span class="tag tag-gray" style="margin-left:6px">закреплён: '+esc(c.manager_name)+'</span>':'')
      +'<span style="display:block;font-size:11px;color:'+(noAddress?'var(--am)':'var(--sub)')+';margin-top:3px">📍 '+esc(c.address||'адрес не указан — добавить можно, навигация появится после заполнения адреса')+' · '+esc(routeCityOfClient(c))+'</span></span></label>';
  }).join('');
};
try{renderBossRouteDayClients=window.renderBossRouteDayClients}catch(_){}

window.toggleBossRouteClient=function(clientId,checked,el){
  const id=String(clientId);
  if(checked&&!bossRouteEditSelected.has(id)&&bossRouteEditSelected.size>=MAX_DAY){
    if(el)el.checked=false;
    alert('В один день можно поставить максимум '+MAX_DAY+' торговых точек. Остальных клиентов назначьте на другой день или на прозвон.');
    return;
  }
  if(checked)bossRouteEditSelected.add(id);else bossRouteEditSelected.delete(id);
  const count=document.getElementById('erd-selected-count');if(count)count.textContent='В маршруте выбрано: '+bossRouteEditSelected.size+' / '+MAX_DAY;
};
try{toggleBossRouteClient=window.toggleBossRouteClient}catch(_){}

window.selectAllBossRouteCity=function(){
  let added=0;
  for(const c of bossRouteVisibleClients()){
    if(bossRouteEditSelected.has(String(c.id)))continue;
    if(bossRouteEditSelected.size>=MAX_DAY)break;
    bossRouteEditSelected.add(String(c.id));added++;
  }
  renderBossRouteDayClients();
  if(bossRouteVisibleClients().some(c=>!bossRouteEditSelected.has(String(c.id))))alert('Выбрано максимум '+MAX_DAY+' точек на день. Остальные остаются доступными для другого дня или прозвона.');
};
try{selectAllBossRouteCity=window.selectAllBossRouteCity}catch(_){}

const baseSave=window.saveBossRouteDay;
if(typeof baseSave==='function'){
  const wrapped=async function(){
    if(bossRouteEditSelected.size>MAX_DAY){alert('В маршруте '+bossRouteEditSelected.size+' точек. Максимум на один день — '+MAX_DAY+'.');return;}
    const date=document.getElementById('erd-date')?.value||'',modal=document.getElementById('modal-edit-route-day'),wasOpen=!!modal?.classList.contains('open');
    const out=await baseSave.apply(this,arguments);
    const saved=wasOpen&&!modal?.classList.contains('open');
    if(saved&&date){
      try{await archiveCoveredCalls(String(date).slice(0,7))}catch(e){console.warn(V+' archive covered calls',e)}
      try{renderCoverage()}catch(_){}
    }
    return out;
  };
  window.saveBossRouteDay=wrapped;try{saveBossRouteDay=wrapped}catch(_){}
}

window.renderRouteCoverageV23674=renderCoverage;
window.generateRouteCallCoverageV23674=()=>generateCalls().catch(e=>{console.error(V,e);alert('Не удалось сформировать прозвон: '+(e?.message||e))});
window.syncRouteCoverageCallsV23674=ym=>archiveCoveredCalls(ym);

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(renderCoverage,0),{once:true});
else setTimeout(renderCoverage,0);

window.RESANTA_ROUTE_COVERAGE_V23674=Object.freeze({
  version:V,
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