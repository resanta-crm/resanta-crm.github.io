/* RESANTA CRM v23.0.0
 * Mobile/Capacitor/GPS base + falling/payments foundation
 * Extracted from v22.7.32.2.17 without business-logic changes.
 * Original inline script range: 4-8
 */

/* ===== ORIGINAL INLINE SCRIPT 4 ===== */
(function(){
  'use strict';
  const cap=window.Capacitor||null;
  const native=Boolean(cap&&typeof cap.isNativePlatform==='function'&&cap.isNativePlatform());
  if(native){document.documentElement.classList.add('native-app');document.documentElement.dataset.platform=cap.getPlatform?.()||'android';}
  const net=document.getElementById('mobile-net-banner');
  const upd=document.getElementById('crm-update-banner');
  const setNet=(ok=navigator.onLine)=>net&&net.classList.toggle('show',!ok);
  addEventListener('online',()=>setNet(true)); addEventListener('offline',()=>setNet(false)); setNet();
  let checking=false,lastCheck=0;
  async function checkLiveVersion(force=false){
    const now=Date.now(); if(checking||(!force&&now-lastCheck<60000)||!navigator.onLine)return;
    checking=true;lastCheck=now;
    try{
      const url=new URL(location.href); url.searchParams.set('_crm_version_check',String(now));
      const text=await fetch(url.toString(),{cache:'no-store',headers:{'Cache-Control':'no-cache'}}).then(r=>r.ok?r.text():'');
      const m=text.match(/const APP_VERSION\s*=\s*'([^']+)'/);
      if(m&&m[1]&&m[1]!==APP_VERSION){
        if(upd)upd.classList.add('show');
        try{localStorage.setItem('crm_app_version',m[1]);}catch(_e){}
        setTimeout(()=>location.replace(url.origin+url.pathname+'?_crm_updated='+Date.now()),450);
      }
    }catch(e){console.warn('Проверка обновления CRM не выполнена',e);}
    finally{checking=false;}
  }
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkLiveVersion(true);});
  addEventListener('focus',()=>checkLiveVersion(false));
  setInterval(()=>checkLiveVersion(false),300000);
  setTimeout(()=>checkLiveVersion(true),1500);
  window.RESANTA_LIVE_APP=Object.freeze({version:'3.0.0',native,liveUrl:location.origin});
})();


// ===== V18: единая мобильная геолокация, планы, частичное выполнение и контроль =====
function v18IsNativeApp(){
  try{return !!(window.Capacitor&&typeof window.Capacitor.getPlatform==='function'&&window.Capacitor.getPlatform()!=='web');}catch(_){return false;}
}
function v18NativeGeo(){
  try{return window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.Geolocation;}catch(_){return null;}
}
async function getGeoNow(timeout){
  const wait=Math.max(5000,Number(timeout)||12000), native=v18NativeGeo();
  if(native&&v18IsNativeApp()){
    try{
      let ps=await native.checkPermissions();
      if(ps.location!=='granted')ps=await native.requestPermissions({permissions:['location']});
      if(ps.location!=='granted'&&ps.coarseLocation!=='granted')throw new Error('Доступ к геолокации запрещён в настройках приложения');
      const pos=await native.getCurrentPosition({enableHighAccuracy:true,timeout:wait,maximumAge:0,enableLocationFallback:true});
      return {lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy==null?null:Math.round(pos.coords.accuracy),speed:pos.coords.speed};
    }catch(e){
      window._lastGeoError=String(e&&e.message||e||'GPS недоступен');
      console.error('Native GPS',e);
      return null;
    }
  }
  return new Promise(resolve=>{
    if(!navigator.geolocation){window._lastGeoError='Устройство не поддерживает геолокацию';resolve(null);return;}
    let done=false;const finish=v=>{if(!done){done=true;resolve(v);}};
    navigator.geolocation.getCurrentPosition(p=>finish({lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy==null?null:Math.round(p.coords.accuracy),speed:p.coords.speed}),e=>{window._lastGeoError=e&&e.message||'Браузер не дал координаты';finish(null);},{enableHighAccuracy:true,timeout:wait,maximumAge:0});
    setTimeout(()=>{window._lastGeoError='Превышено время ожидания GPS';finish(null);},wait+1200);
  });
}
async function promoGetCoords(){const g=await getGeoNow(12000);return g?{latitude:g.lat,longitude:g.lng}:{};}

// Более точное сопоставление визита с маршрутом: любой фактически сохранённый визит
// (в том числе «Переговоры») подтверждает точку, если совпали дата, менеджер и клиент/алиас.
function routeClientMatchesVisit(r,v){
  if(!r||!v)return false;
  if(r.client_id&&v.client_id&&String(r.client_id)===String(v.client_id))return true;
  const rc=r.client_id?allClients.find(c=>String(c.id)===String(r.client_id)):matchClientByName(r.client_name||'');
  const vc=v.client_id?allClients.find(c=>String(c.id)===String(v.client_id)):null;
  if(rc&&vc&&String(rc.id)===String(vc.id))return true;
  const rv=new Set((rc?clientNameVariants(rc):[r.client_name]).map(canonicalSalesClientName).filter(Boolean));
  const vv=new Set((vc?clientNameVariants(vc):[]).map(canonicalSalesClientName).filter(Boolean));
  for(const k of rv)if(vv.has(k))return true;
  return false;
}
function routePlanVerified(r,visits,plans){
  if(!r)return false;
  const rows=(visits||allVisits).filter(v=>!v.is_duplicate);
  if(r.linked_visit_id&&rows.some(v=>String(v.id)===String(r.linked_visit_id)))return true;
  if(rows.some(v=>routePlanExplicitlyLinked(r,v)))return true;
  return rows.some(v=>visitDate(v)===String(r.visit_date||'').slice(0,10)&&managerLooseMatch(r.manager_name,visitManagerName(v))&&routeClientMatchesVisit(r,v));
}
async function v18RepairRouteLinks(){
  if(currentProfile?.role!=='boss')return;
  const fixes=[];
  for(const r of activeRouteRows(allRoutePlans).filter(x=>(x.visit_date||'')<=TODAY&&!x.visited)){
    const v=allVisits.find(v=>!v.is_duplicate&&visitDate(v)===String(r.visit_date||'').slice(0,10)&&managerLooseMatch(r.manager_name,visitManagerName(v))&&routeClientMatchesVisit(r,v));
    if(v)fixes.push({r,v});
  }
  for(const x of fixes){
    const upd={visited:true,linked_visit_id:String(x.v.id),link_status:'verified_visit',linked_at:new Date().toISOString()};
    const {error}=await db.from('route_plans').update(upd).eq('id',x.r.id);
    if(!error)Object.assign(x.r,upd);
  }
}
async function v18RepairTransferredTasks(){
  if(currentProfile?.role!=='boss')return;
  const future=allRoutePlans.filter(r=>!r.removed&&(r.visit_date||'')>=TODAY&&r.review_status!=='rejected');
  for(const r of future){
    const c=r.client_id?allClients.find(x=>String(x.id)===String(r.client_id)):matchClientByName(r.client_name);
    if(!c)continue;
    const ids=allTasks.filter(t=>String(t.client_id)===String(c.id)&&isActiveTask(t)&&(t.due_date||'')<TODAY&&(t.auto_generated||['route','ai','visit'].includes(String(t.source||''))||/планов|маршрут|получить подписан|первая отгруз/i.test(String(t.text||'')))).map(t=>t.id);
    if(!ids.length)continue;
    const {error}=await db.from('tasks').update({due_date:r.visit_date}).in('id',ids);
    if(!error)allTasks=allTasks.map(t=>ids.includes(t.id)?{...t,due_date:r.visit_date}:t);
  }
}

// Фактический визит в дату маршрутной/автозадачи подтверждает, что менеджер был у клиента.
// Коммерческая цель остаётся открытой, но ложная просрочка по факту посещения не создаётся.
function v18TaskHasVisitEvidence(t){
  if(!t||!t.due_date||!(t.auto_generated||['route','visit','ai'].includes(String(t.source||''))||t.visit_id))return false;
  const c=t.client_id?allClients.find(x=>String(x.id)===String(t.client_id)):null;
  if(!c)return false;
  return allVisits.some(v=>!v.is_duplicate&&visitDate(v)===String(t.due_date).slice(0,10)&&managerLooseMatch(taskManagerName(t),visitManagerName(v))&&routeClientMatchesVisit({client_id:c.id,client_name:c.name,manager_name:taskManagerName(t),visit_date:t.due_date},v));
}
const _v18IsTaskOverdueBase=isTaskOverdue;
isTaskOverdue=function(t){return _v18IsTaskOverdueBase(t)&&!v18TaskHasVisitEvidence(t);};

// Маршрут дня использует ту же нативную геолокацию, что и кнопка «На точке».
async function requestGeolocation(){if(geoRequested)return;geoRequested=true;const g=await getGeoNow(10000);if(g){currentGeo={lat:g.lat,lng:g.lng};renderRoute();}}

// Частичное выполнение: задача закрыта, но ДФ получает отдельный сигнал.
function doneTask(id){
  const t=allTasks.find(x=>x.id===id);if(!t)return;
  document.getElementById('td-task-id').value=id;document.getElementById('td-task-text').textContent=t.text||'';
  const plan=document.getElementById('td-plan');if(plan)plan.innerHTML=(t.expected_result||t.criteria)?(t.expected_result?'<div>🎯 <b>Ожидался результат:</b> '+esc(t.expected_result)+'</div>':'')+(t.criteria?'<div style="margin-top:3px">✔️ <b>Подтверждение:</b> '+esc(t.criteria)+'</div>':''):'<span style="color:var(--sub)">По этой задаче плановый результат не задавался.</span>';
  ['td-comment','td-proof','td-reason','td-next','td-next-date'].forEach(k=>{const e=document.getElementById(k);if(e)e.value='';});const a=document.getElementById('td-achieved');if(a)a.value='';tdToggleReason();document.getElementById('modal-task-done').classList.add('open');
}
async function confirmDoneTask(){
  const id=document.getElementById('td-task-id').value,t=allTasks.find(x=>String(x.id)===String(id));
  const g=k=>String(document.getElementById(k)?.value||'').trim(),fact=g('td-comment'),achieved=g('td-achieved'),proof=g('td-proof'),reason=g('td-reason');
  if(!fact){alert('Опишите фактический результат.');return;}if(!achieved){alert('Укажите результат выполнения.');return;}if(achieved!=='no'&&!proof){alert('Укажите подтверждение результата.');return;}if((achieved==='no'||achieved==='partial')&&!reason){alert('Укажите причину полного или частичного невыполнения.');return;}
  const upd={done:true,done_comment:fact,fact_result:fact,result_achieved:achieved,proof:achieved==='no'?null:proof,fail_reason:(achieved==='no'||achieved==='partial')?reason:null,next_action:null,next_contact_date:null,closed_by:currentProfile?.name||null,done_at:new Date().toISOString()};
  const {error}=await db.from('tasks').update(upd).eq('id',id);if(error){alert('Не удалось сохранить отчёт: '+error.message);return;}allTasks=allTasks.map(x=>String(x.id)===String(id)?{...x,...upd}:x);
  if(achieved==='partial'){
    const row={task_id:id,client_id:t?.client_id||null,manager_name:taskManagerName(t),reason,fact_result:fact,proof:proof||null,status:'pending',created_at:new Date().toISOString()};
    const old=allTaskPartialReviews.find(x=>String(x.task_id)===String(id));
    let data,err;if(old){({data,error:err}=await db.from('task_partial_reviews').update(row).eq('id',old.id).select().single());}else{({data,error:err}=await db.from('task_partial_reviews').insert(row).select().single());}
    if(err)console.error('partial review',err);else if(data){allTaskPartialReviews=old?allTaskPartialReviews.map(x=>x.id===old.id?data:x):[data,...allTaskPartialReviews];}
  }
  closeModal('modal-task-done');renderTasks();buildDashboard();updateTasksAlertDot();updateSignalsAlertDot();
}
function v18PendingPartialReviews(){return (allTaskPartialReviews||[]).filter(r=>r.status==='pending'&&(currentProfile?.role==='boss'||r.manager_name===currentProfile?.name));}
async function acknowledgePartialReview(id){
  if(currentProfile?.role!=='boss'){alert('Закрыть разбор может только руководитель.');return;}const comment=prompt('Итог разбора с менеджером:')||'';if(!comment.trim())return;
  const upd={status:'reviewed',reviewed_by:currentProfile?.name||null,reviewed_at:new Date().toISOString(),review_comment:comment};const {error}=await db.from('task_partial_reviews').update(upd).eq('id',id);if(error){alert(error.message);return;}allTaskPartialReviews=allTaskPartialReviews.map(x=>x.id===id?{...x,...upd}:x);renderAlerts();
}
const _v18BuildSignalTruthBase=buildSignalTruth;
buildSignalTruth=function(includeDataQuality=true){const d=_v18BuildSignalTruthBase(includeDataQuality);d.partialReviews=v18PendingPartialReviews();d.actionCount+=d.partialReviews.length;return d;};
const _v18RenderAlertsBase=renderAlerts;
renderAlerts=function(){
  _v18RenderAlertsBase();
  const partialReviews=v18PendingPartialReviews();
  if(!signalShowSection('action')||!partialReviews.length)return;
  const root=document.getElementById('alerts-content');if(!root)return;
  const card=document.createElement('div');card.className='card';card.style.marginBottom='12px';
  card.innerHTML='<div class="card-title" style="color:var(--am)">🟡 Частично выполненные задачи — разбор ДФ ('+partialReviews.length+')</div>'+partialReviews.map(r=>{const t=allTasks.find(x=>String(x.id)===String(r.task_id)),c=allClients.find(x=>String(x.id)===String(r.client_id));return '<div class="alert-item amber"><div class="ai-body"><div class="ai-title">'+esc(c?.name||'Клиент')+' · '+esc(r.manager_name||'—')+'</div><div class="ai-sub">'+esc(t?.text||'Задача')+'</div><div style="font-size:12px;margin-top:4px"><b>Сделано:</b> '+esc(r.fact_result||'—')+'<br><b>Почему частично:</b> '+esc(r.reason||'—')+'</div></div>'+(currentProfile?.role==='boss'?'<button class="btn-secondary" onclick="acknowledgePartialReview(\''+r.id+'\')">Разобрано</button>':'')+'</div>';}).join('');
  root.appendChild(card);
};

// KPI руководителя: только планы отгрузки и АКБ; факт — из 1С.
function v18ManagerMonth(){const e=document.getElementById('manager-kpi-month');if(e&&!e.value)e.value=TODAY.slice(0,7);return e?.value||TODAY.slice(0,7);}
function v18RowsForManagerMonth(name,month){return allPurchaseHistory.filter(r=>String(r.month||'').slice(0,7)===month&&managerLooseMatch(r.manager_name||(matchPHClient(r.client_name)?.manager_name||''),name));}
function v226FirstSaleMonth(clientName){const key=canonicalSalesClientName(clientName);const months=allPurchaseHistory.filter(r=>canonicalSalesClientName(r.client_name)===key&&(promoNum(r.revenue)>0||promoNum(r.qty)>0)).map(r=>String(r.month||'').slice(0,7)).filter(Boolean).sort();return months[0]||'';}
function v18ManagerKpi(name,month){const rows=v18RowsForManagerMonth(name,month),shipment=rows.reduce((s,r)=>s+promoNum(r.revenue),0),names=[...new Set(rows.filter(r=>promoNum(r.revenue)>0||promoNum(r.qty)>0).map(r=>canonicalSalesClientName(r.client_name)).filter(Boolean))],akb=names.length,newClients=names.filter(n=>v226FirstSaleMonth(n)===month).length,plan=allManagerKpiPlans.find(p=>managerLooseMatch(p.manager_name,name)&&String(p.period_month||'').slice(0,7)===month);return{shipment,akb,newClients,plan};}
function v18Pct(f,p){return p>0?Math.round(f/p*100):null;}
function renderManagers(){
  const month=v18ManagerMonth();
  const managerRows=allUsers.filter(u=>isFieldManagerUser(u)).filter(u=>currentProfile?.role==='boss'||managerLooseMatch(u.name,currentProfile?.name));
  const rows=managerRows.map(u=>{const uv=sortVisitsDesc(allVisits.filter(v=>(v.manager_id===u.id||managerLooseMatch(visitManagerName(v),u.name))&&visitDate(v).startsWith(month))),ut=canonicalTasksForManager(u.name),uo=ut.filter(isTaskOverdue),uc=allClients.filter(c=>managerLooseMatch(c.manager_name,u.name)),k=v18ManagerKpi(u.name,month),sp=promoNum(k.plan?.shipment_plan),ap=promoNum(k.plan?.akb_plan),ps=v18Pct(k.shipment,sp),pa=v18Pct(k.akb,ap),np=promoNum(k.plan?.new_clients_plan),pn=v18Pct(k.newClients,np),tag=x=>x==null?'<span class="tag tag-gray">план не задан</span>':'<span class="tag '+(x>=100?'tag-m':x>=70?'':'tag-r')+'">'+x+'%</span>';return '<tr><td><strong style="cursor:pointer;color:var(--a)" onclick="openManagerSales(\''+escAttr(u.name)+'\')">'+esc(u.name)+'</strong></td><td>'+esc(u.region||'—')+'</td><td>'+uv.length+'</td><td>'+ut.length+'</td><td>'+(uo.length?'<span class="tag tag-r">'+uo.length+'</span>':'<span class="tag tag-m">0</span>')+'</td><td>'+uc.length+'</td><td>'+fmt(sp)+' / <b>'+fmt(k.shipment)+'</b> BYN</td><td>'+tag(ps)+'</td><td>'+fmt(ap)+' / <b>'+k.akb+'</b></td><td>'+tag(pa)+'</td><td>'+fmt(np)+' / <b>'+k.newClients+'</b></td><td>'+tag(pn)+'</td><td><button class="btn-secondary" onclick="openManagerSales(\''+escAttr(u.name)+'\')">Продажи</button></td></tr>';}).join('');document.getElementById('managers-table').innerHTML=rows||'<tr><td colspan="13">Нет данных</td></tr>';const b=document.querySelector('#page-managers button[onclick="openManagerPlanEditor()"]');if(b)b.style.display=currentProfile?.role==='boss'?'inline-flex':'none';
}
function openManagerPlanEditor(){const sel=document.getElementById('manager-plan-name');sel.innerHTML=allUsers.filter(u=>isFieldManagerUser(u)).map(u=>'<option>'+esc(u.name)+'</option>').join('');document.getElementById('manager-plan-month').value=v18ManagerMonth();sel.onchange=loadManagerPlanEditor;loadManagerPlanEditor();document.getElementById('modal-manager-plan').classList.add('open');}
function loadManagerPlanEditor(){const n=document.getElementById('manager-plan-name').value,m=document.getElementById('manager-plan-month').value,p=allManagerKpiPlans.find(x=>managerLooseMatch(x.manager_name,n)&&String(x.period_month||'').slice(0,7)===m);document.getElementById('manager-plan-shipment').value=p?.shipment_plan??'';document.getElementById('manager-plan-akb').value=p?.akb_plan??'';document.getElementById('manager-plan-new-clients').value=p?.new_clients_plan??'';document.getElementById('manager-plan-note').value=p?.note||'';}
function managerKpiCanonicalPeriod(raw){const month=String(raw||'').slice(0,7);return /^\d{4}-(0[1-9]|1[0-2])$/.test(month)?month+'-01':'';}
async function saveManagerKpiPlan(){
  if(currentProfile?.role!=='boss')return;
  const manager_name=document.getElementById('manager-plan-name').value;
  const month_key=String(document.getElementById('manager-plan-month').value||'').slice(0,7);
  const period_month=managerKpiCanonicalPeriod(month_key);
  const shipment_plan=promoNum(document.getElementById('manager-plan-shipment').value);
  const akb_plan=Math.round(promoNum(document.getElementById('manager-plan-akb').value));
  const new_clients_plan=Math.round(promoNum(document.getElementById('manager-plan-new-clients').value));
  const note=document.getElementById('manager-plan-note').value.trim()||null;
  if(!manager_name||!period_month){alert('Выберите корректного менеджера и месяц');return;}
  const row={manager_name,period_month,shipment_plan,akb_plan,new_clients_plan,note,updated_by:currentProfile?.name||null,updated_at:new Date().toISOString()};
  const old=allManagerKpiPlans.find(x=>managerLooseMatch(x.manager_name,manager_name)&&String(x.period_month||'').slice(0,7)===month_key);
  let data,error;
  if(old)({data,error}=await db.from('manager_kpi_plans').update(row).eq('id',old.id).select().single());
  else({data,error}=await db.from('manager_kpi_plans').insert({...row,created_by:currentProfile?.name||null}).select().single());
  if(error){alert('Не удалось сохранить план: '+error.message);return;}
  allManagerKpiPlans=old?allManagerKpiPlans.map(x=>x.id===old.id?data:x):[data,...allManagerKpiPlans];
  closeModal('modal-manager-plan');renderManagers();
}
let v18ManagerSalesName='';
function openManagerSales(name){v18ManagerSalesName=name;document.getElementById('manager-sales-title').textContent='Продажи · '+name;const years=[...new Set(allPurchaseHistory.map(r=>String(r.month||'').slice(0,4)).filter(x=>/^\d{4}$/.test(x)))].sort().reverse();const ys=document.getElementById('manager-sales-year');ys.innerHTML=years.map(y=>'<option value="'+y+'">'+y+'</option>').join('');ys.value=years.includes(TODAY.slice(0,4))?TODAY.slice(0,4):(years[0]||TODAY.slice(0,4));const ms=document.getElementById('manager-sales-month');ms.innerHTML='<option value="all">Весь год</option>'+Array.from({length:12},(_,i)=>'<option value="'+String(i+1).padStart(2,'0')+'">'+['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'][i]+'</option>').join('');renderManagerSalesDetail();document.getElementById('modal-manager-sales').classList.add('open');}
function renderManagerSalesDetail(){const y=document.getElementById('manager-sales-year').value,m=document.getElementById('manager-sales-month').value,prefix=y+(m==='all'?'':'-'+m),rows=allPurchaseHistory.filter(r=>String(r.month||'').startsWith(prefix)&&managerLooseMatch(r.manager_name||(matchPHClient(r.client_name)?.manager_name||''),v18ManagerSalesName));const by={};rows.forEach(r=>{const k=canonicalSalesClientName(r.client_name)||r.client_name;if(!by[k])by[k]={name:r.client_name,revenue:0,qty:0,last:'',client:matchPHClient(r.client_name)};by[k].revenue+=promoNum(r.revenue);by[k].qty+=promoNum(r.qty);if(String(r.month||'')>by[k].last)by[k].last=String(r.month||'').slice(0,7);});const list=Object.values(by).sort((a,b)=>b.revenue-a.revenue),sum=list.reduce((s,x)=>s+x.revenue,0);document.getElementById('manager-sales-kpi').innerHTML='<div class="kpi"><div class="kpi-label">Отгрузка</div><div class="kpi-value">'+fmt(sum)+'</div><div class="kpi-sub">BYN</div></div><div class="kpi"><div class="kpi-label">АКБ</div><div class="kpi-value">'+list.length+'</div><div class="kpi-sub">клиентов с продажами</div></div>';document.getElementById('manager-sales-body').innerHTML='<div class="card" style="overflow-x:auto"><table class="tbl"><thead><tr><th>#</th><th>Клиент</th><th>Последний месяц</th><th>Количество</th><th>Оборот, BYN</th></tr></thead><tbody>'+list.map((x,i)=>'<tr class="tbl-tap" '+(x.client?'onclick="openClient(\''+x.client.id+'\')"':'')+'><td>'+(i+1)+'</td><td>'+esc(x.name)+'</td><td>'+esc(x.last||'—')+'</td><td>'+fmt(x.qty)+'</td><td><b>'+fmt(x.revenue)+'</b></td></tr>').join('')+'</tbody></table></div>';}

// ABC филиала доступен менеджерам; собственный клиент/менеджер остаётся ограничен своей зоной.
function abcInitUI(){if(_abcUiReady)return;_abcUiReady=true;const gs=document.getElementById('abc-group');ABC_GROUPS.forEach(g=>gs.insertAdjacentHTML('beforeend','<option value="'+escAttr(g)+'">'+esc(g)+'</option>'));const ms=document.getElementById('abc-manager');abcManagerNames().forEach(n=>ms.insertAdjacentHTML('beforeend','<option value="'+escAttr(n)+'">'+esc(n)+'</option>'));if(currentProfile?.role!=='boss'){ms.value=currentProfile?.name||'';ms.disabled=true;const note=document.getElementById('abc-period-note');if(note)note.dataset.managerBranch='1';}abcRefreshClientDatalist();abcScopeChanged(false);}
function abcScopeChanged(rerender){abcInitUI();const scope=document.getElementById('abc-scope').value;document.getElementById('abc-manager-wrap').style.display=scope==='branch'?'none':'';document.getElementById('abc-client-wrap').style.display=scope==='client'?'':'none';if(scope==='manager'&&currentProfile?.role!=='boss')document.getElementById('abc-manager').value=currentProfile?.name||'';abcRefreshClientDatalist();if(rerender!==false)renderABC();}
function v18AbcTaskBrief(c){try{const r=abcRecommendations(c,'90','all'),f=x=>(x.sku&&x.sku!=='—'?x.sku:x.product);return 'ABC: удержать A — '+r.hold.slice(0,5).map(f).join(', ')+'; вернуть A — '+r.lost.slice(0,5).map(f).join(', ')+'; развить B — '+r.develop.slice(0,5).map(f).join(', ')+'; предложить A со склада — '+r.potential.slice(0,5).map(f).join(', ')+'.';}catch(_){return 'ABC: данных недостаточно.';}}
const _v18AiClientBriefBase=_aiClientBrief;_aiClientBrief=function(c,allCats){return _v18AiClientBriefBase(c,allCats)+'\n  🅰️ '+v18AbcTaskBrief(c);};
const _v18TaskRecBase=generateTaskRecommendation;generateTaskRecommendation=function(c){return _v18TaskRecBase(c)+' '+v18AbcTaskBrief(c);};

// Бюджет акции: расходы всегда вычитаются, перерасход финально согласовать нельзя.
function promoBudgetSummary(b,excludePromotionId){const moves=promoBudgetMovements(b),accrued=moves.filter(x=>x.movement_type==='accrual').reduce((s,x)=>s+promoNum(x.amount),0),adjustments=moves.filter(x=>x.movement_type==='adjustment').reduce((s,x)=>s+promoNum(x.amount),0),spent=moves.filter(x=>x.movement_type==='expense').reduce((s,x)=>s+promoNum(x.amount),0);const promos=allPromotions.filter(p=>String(p.budget_id)===String(b.id)&&String(p.id)!==String(excludePromotionId||'')&&!['rejected'].includes(p.status));const legacy=promos.reduce((s,p)=>{const linked=promoPromotionExpenseMovements(p).reduce((a,x)=>a+promoNum(x.amount),0);return s+(linked?0:promoNum(p.actual_spend));},0),realSpent=spent+legacy;const reserved=promos.filter(p=>['approved','in_work'].includes(p.status)).reduce((s,p)=>{const linked=promoPromotionExpenseMovements(p).reduce((a,x)=>a+promoNum(x.amount),0);return s+Math.max(0,promoNum(p.budget_reserved)-linked);},0);const total=promoBudgetOpening(b)+accrued+adjustments;return{opening:promoBudgetOpening(b),accrued,adjustments,total,spent:realSpent,reserved,free:total-realSpent-reserved,movements:moves};}
function promotionBudgetChanged(){const el=document.getElementById('promotion-budget-available'),id=document.getElementById('promotion-budget-id')?.value,b=allPromotionBudgets.find(x=>String(x.id)===String(id));if(!el)return;if(!b){el.innerHTML='<span style="color:var(--r)">Выберите действующий бюджет клиента</span>';return;}const x=promoBudgetSummary(b,document.getElementById('promotion-id')?.value);el.innerHTML='<div class="promo-warning"><b>'+esc(b.client_name)+'</b> · '+esc(b.period_start)+' — '+esc(b.period_end)+'<br>Текущий бюджет: <b>'+fmt(x.total)+'</b> · потрачено: <b>'+fmt(x.spent)+'</b> · резерв: <b>'+fmt(x.reserved)+'</b> · свободно: <b style="color:'+(x.free<0?'var(--r)':'var(--g)')+'">'+fmt(x.free)+' BYN</b></div>';}
const _v18QuickPromoBase=quickPromotionDecision;
quickPromotionDecision=async function(id,action){const p=allPromotions.find(x=>String(x.id)===String(id));if(action==='approve_dfs'&&p){if(!p.budget_id){alert('Сначала выберите действующий бюджет клиента в условиях акции.');return;}const b=allPromotionBudgets.find(x=>String(x.id)===String(p.budget_id));if(!b){alert('Выбранный бюджет не найден.');return;}const free=promoBudgetSummary(b,p.id).free,amount=promoNum(p.requested_budget);if(amount>free){alert('Нельзя согласовать: запрошено '+fmt(amount)+' BYN, свободно только '+fmt(free)+' BYN. Уменьшите бюджет акции или внесите начисление.');return;}}return _v18QuickPromoBase(id,action);};

// Очередь согласований маршрутов: день + менеджер + конкретные клиенты.
function v18PendingRouteRows(){const q=String(document.getElementById('rb-approval-client')?.value||'').toLowerCase(),date=document.getElementById('rb-date-filter')?.value||'',mgr=(typeof rbMgrFilter!=='undefined'?rbMgrFilter:'all');return allRoutePlans.filter(r=>!r.removed&&r.review_status==='pending'&&(!date||r.visit_date===date)&&(mgr==='all'||r.manager_name===mgr)&&(!q||String(r.client_name||'').toLowerCase().includes(q)));}
async function v18ApproveRouteGroup(manager,date,ok){if(currentProfile?.role!=='boss')return;const rows=allRoutePlans.filter(r=>r.manager_name===manager&&r.visit_date===date&&r.review_status==='pending');if(!rows.length)return;let upd;if(ok)upd={approved:true,review_status:'approved',approved_by:currentProfile?.name||null,approved_at:new Date().toISOString()};else{const reason=prompt('Причина отклонения:')||'';if(!reason.trim())return;upd={approved:false,review_status:'rejected',rejection_reason:reason};}const ids=rows.map(r=>r.id),{error}=await db.from('route_plans').update(upd).in('id',ids);if(error){alert(error.message);return;}allRoutePlans=allRoutePlans.map(r=>ids.includes(r.id)?{...r,...upd}:r);renderRoutesBoss();}
function v18RenderRouteApprovalQueue(){const sel=document.getElementById('rb-approval-filter'),pending=sel?.value==='pending',root=document.getElementById('rb-content');if(!root)return;if(!pending){root.style.display='';return;}const rows=v18PendingRouteRows(),groups={};rows.forEach(r=>{const k=r.manager_name+'|'+r.visit_date;(groups[k]=groups[k]||[]).push(r);});root.style.display='block';root.innerHTML=Object.entries(groups).map(([k,list])=>{const [m,d]=k.split('|');return '<div class="card" style="margin-bottom:10px;border-color:var(--am)"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><b>⚠ '+esc(m)+'</b> · '+esc(d)+'<div style="font-size:12px;color:var(--sub);margin-top:4px">'+list.map(r=>esc(r.client_name)).join(' · ')+'</div></div><div style="display:flex;gap:6px"><button class="btn-primary" onclick="v18ApproveRouteGroup(\''+escAttr(m)+'\',\''+d+'\',true)">Согласовать</button><button class="btn-secondary" onclick="v18ApproveRouteGroup(\''+escAttr(m)+'\',\''+d+'\',false)">Отклонить</button></div></div></div>';}).join('')||'<div class="card" style="color:var(--sub)">Нет маршрутов, требующих согласования.</div>';}
const _v18RenderRoutesBossBase=renderRoutesBoss;renderRoutesBoss=function(){const pending=document.getElementById('rb-approval-filter')?.value==='pending';if(pending){v18RenderRouteApprovalQueue();const n=v18PendingRouteRows().length;document.getElementById('rb-kpi').innerHTML='<div class="kpi"><div class="kpi-label">Требуют согласования</div><div class="kpi-value warn">'+n+'</div><div class="kpi-sub">день и клиенты показаны ниже</div></div>';return;}_v18RenderRoutesBossBase();};

// Переносы: сохраняем происхождение и сразу двигаем связанную задачу.
async function moveSinglePoint(rowId){if(currentProfile?.role!=='boss'){alert('Перенос доступен только руководителю.');return;}const r=allRoutePlans.find(x=>x.id===rowId);if(!r)return;const oldDate=r.visit_date,newDate=_askNewDate('Перенести «'+r.client_name+'» с '+oldDate+' на дату:',oldDate);if(!newDate||newDate===oldDate)return;const upd={visit_date:newDate,rescheduled_from:oldDate,rescheduled_at:new Date().toISOString(),rescheduled_by:currentProfile?.name||null};const {error}=await db.from('route_plans').update(upd).eq('id',rowId);if(error){alert(error.message);return;}Object.assign(r,upd);await _shiftClientOverdueTasks(r.client_name,newDate);renderRoutesBoss();buildDashboard();updateTasksAlertDot();updateRoutesAlertDot();}
async function v18MoveRouteRows(points,newDate){if(!points.length)return false;const now=new Date().toISOString();for(const r of points){const oldDate=r.visit_date,upd={visit_date:newDate,rescheduled_from:oldDate,rescheduled_at:now,rescheduled_by:currentProfile?.name||null};const {error}=await db.from('route_plans').update(upd).eq('id',r.id);if(error){alert('Не удалось перенести '+r.client_name+': '+error.message);return false;}Object.assign(r,upd);await _shiftClientOverdueTasks(r.client_name,newDate);}return true;}
async function moveSelectedPoints(date){if(currentProfile?.role!=='boss'){alert('Перенос доступен только руководителю.');return;}const ids=_pickedRoutes(date),points=allRoutePlans.filter(r=>ids.includes(String(r.id)));if(!points.length){alert('Не выбрано ни одной точки.');return;}const nd=_askNewDate('Перенести '+points.length+' выбранных точек с '+date+' на дату:',date);if(!nd||nd===date)return;if(!confirm('Перенести '+points.length+' точек на '+nd+'?'))return;if(await v18MoveRouteRows(points,nd)){renderRoutesBoss();buildDashboard();updateTasksAlertDot();updateRoutesAlertDot();}}
async function moveWholeDay(date,mgr){if(currentProfile?.role!=='boss'){alert('Перенос доступен только руководителю.');return;}const points=allRoutePlans.filter(r=>r.visit_date===date&&r.manager_name===mgr&&!r.removed&&!routePlanVerified(r));if(!points.length){alert('Нет непосещённых точек для переноса.');return;}const nd=_askNewDate('Перенести '+points.length+' точек менеджера «'+mgr+'» с '+date+' на дату:',date);if(!nd||nd===date)return;if(!confirm('Перенести маршрут «'+mgr+'» на '+nd+'?'))return;if(await v18MoveRouteRows(points,nd)){renderRoutesBoss();buildDashboard();updateTasksAlertDot();updateRoutesAlertDot();}}

// Инициализация после загрузки данных.
const _v18LoadDataBase=loadData;loadData=async function(){await _v18LoadDataBase();const run=()=>Promise.allSettled([v18RepairRouteLinks(),v18RepairTransferredTasks()]);if(typeof requestIdleCallback==='function')requestIdleCallback(()=>run(),{timeout:6000});else setTimeout(()=>run(),4500);};
(function v18UiInit(){const e=document.getElementById('manager-kpi-month');if(e)e.value=TODAY.slice(0,7);})();

// ============================================================================
// RESANTA CRM v19 · рабочий день, фоновый GPS-маршрут и пробег
// Менеджер видит только состояние записи. Карта и километры доступны только
// руководителям с отдельным разрешением GPS-контроля.
// ============================================================================
let v19GpsControllerAccess=false;
let v19MyWorkday=null;
let v19GpsControlRows=[];
let v19SelectedWorkdayId=null;
let v19GpsMap=null;
let v19GpsMapLayer=null;
let v19GpsRefreshBusy=false;

function v19NativeTracker(){
  try{return window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.WorkdayTracker||null;}catch(_){return null;}
}
function v19IsNativeAndroid(){
  try{return !!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()&&window.Capacitor.getPlatform&&window.Capacitor.getPlatform()==='android');}catch(_){return false;}
}
function v19DateTime(v){if(!v)return '—';try{return new Date(v).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});}catch(_){return String(v);}}
function v19Time(v){if(!v)return '—';try{return new Date(v).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});}catch(_){return String(v);}}
function v19Duration(a,b){if(!a)return '—';const x=new Date(a),y=b?new Date(b):new Date(),m=Math.max(0,Math.round((y-x)/60000));return Math.floor(m/60)+' ч '+(m%60)+' мин';}
function v19Age(v){if(!v)return 'точек ещё нет';const sec=Math.max(0,Math.round((Date.now()-new Date(v).getTime())/1000));if(sec<60)return sec+' сек назад';if(sec<3600)return Math.round(sec/60)+' мин назад';return Math.round(sec/3600)+' ч назад';}
function v19Km(m){return ((Number(m)||0)/1000).toLocaleString('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1})+' км';}
function v19RpcRow(data){return Array.isArray(data)?(data[0]||null):(data||null);}

const V2273223_GPS_CONTROLLERS=new Set([
  'payushin_ar@resanta.ru',
  'sidarovich_kn@resanta.ru'
]);
function v2273223GpsControllerAllowed(){
  const email=String(currentProfile?.email||currentUser?.email||'').trim().toLowerCase();
  return currentProfile?.role==='boss'&&V2273223_GPS_CONTROLLERS.has(email);
}
async function v19LoadGpsAccess(){
  // UI access is deterministic for the two approved directors.
  // The server RPC is still called as an authorization/diagnostic check,
  // but a slow RPC can no longer hide the GPS menu.
  v19GpsControllerAccess=v2273223GpsControllerAllowed();
  if(!currentUser||currentProfile?.role!=='boss')return false;
  try{
    const {data,error}=await db.rpc('gps_has_control_access');
    if(error)throw error;
    if(data===true)v19GpsControllerAccess=true;
    else if(v19GpsControllerAccess)console.warn('GPS RPC returned false for an approved controller; frontend access remains visible, protected Supabase reads still enforce server permissions.');
  }catch(e){
    console.warn('GPS access check failed without blocking CRM/GPS menu',e);
  }
  return v19GpsControllerAccess;
}
async function v19LoadMyWorkday(){
  v19MyWorkday=null;
  if(!currentUser||currentProfile?.role!=='manager')return null;
  try{const {data,error}=await db.rpc('gps_get_my_active_workday');if(error)throw error;v19MyWorkday=v19RpcRow(data);}catch(e){console.warn('Active workday unavailable',e);}
  return v19MyWorkday;
}
function v19ApplyGpsMenus(){
  const isManager=currentProfile?.role==='manager';
  const workNav=document.getElementById('nav-workday'),workBottom=document.getElementById('bn-workday');
  if(workNav)workNav.style.display=isManager?'flex':'none';if(workBottom)workBottom.style.display=isManager?'flex':'none';
  const ctlNav=document.getElementById('nav-gps-control'),ctlBottom=document.getElementById('bn-gps-control');
  const canControl=currentProfile?.role==='boss'&&(v19GpsControllerAccess||v2273223GpsControllerAllowed());
  if(canControl)v19GpsControllerAccess=true;
  if(ctlNav)ctlNav.style.display=canControl?'flex':'none';if(ctlBottom)ctlBottom.style.display=canControl?'flex':'none';
  const card=document.getElementById('manager-workday-card');if(card)card.style.display=isManager?'block':'none';
}
async function v19NativeStatus(){
  const tracker=v19NativeTracker();if(!tracker||typeof tracker.status!=='function')return {active:false,native:false};
  try{
    const status={...await tracker.status(),native:true};
    // Нативный сервис может обновить Supabase refresh-token, пока WebView спит.
    // При возврате синхронизируем сессию, чтобы приложение не разлогинилось.
    if(status.accessToken&&status.refreshToken&&currentProfile?.role==='manager'){
      try{await db.auth.setSession({access_token:status.accessToken,refresh_token:status.refreshToken});}catch(_e){}
    }
    return status;
  }catch(e){return {active:false,native:true,lastError:e.message||String(e)};}
}
async function v19Session(){
  let {data:{session}}=await db.auth.getSession();
  if(!session){const r=await db.auth.refreshSession();session=r.data?.session||null;}
  return session;
}
async function v19EnsureNativePermissions(){
  const tracker=v19NativeTracker();if(!tracker)throw new Error('Фоновый GPS доступен только в Android-приложении Ресанта CRM');
  if(typeof tracker.requestPermissions==='function'){
    const state=await tracker.requestPermissions();
    if(state&&state.notifications&&state.notifications!=='granted')throw new Error('Разрешите уведомления Ресанта CRM. Без постоянного уведомления рабочий GPS-маршрут не запускается.');
  }
}
async function v19StartNativeFor(workday){
  const tracker=v19NativeTracker();if(!tracker)throw new Error('Фоновый GPS доступен только в Android-приложении Ресанта CRM');
  const session=await v19Session();if(!session)throw new Error('Сессия CRM истекла — войдите заново');
  const result=await tracker.start({
    workdayId:String(workday.id),userId:String(currentUser.id),managerName:currentProfile?.name||currentUser.email,
    supabaseUrl:SUPABASE_URL,anonKey:SUPABASE_KEY,accessToken:session.access_token,refreshToken:session.refresh_token||'',
    intervalMs:30000,minDistanceM:50
  });
  await db.rpc('gps_set_my_native_state',{p_workday_id:workday.id,p_active:true,p_error:null});
  if(result&&result.notificationPermissionGranted===false){
    alert('Маршрут запущен. Разрешите уведомления: Настройки Android → Приложения → Ресанта CRM → Уведомления. Постоянное уведомление подтверждает, что GPS работает.');
  }
  return result;
}
async function v19StartWorkday(){
  if(currentProfile?.role!=='manager')return;
  if(!v19IsNativeAndroid()||!v19NativeTracker()){alert('Запись пробега работает только в установленном Android-приложении. Через браузер можно оформлять визиты, но фоновый маршрут не записывается.');return;}
  if(!confirm('Начать рабочий день и запись служебного GPS-маршрута?\n\nЗапись будет идти до нажатия «Завершить рабочий день».'))return;
  const btn=document.getElementById('workday-start-btn');if(btn){btn.disabled=true;btn.textContent='Запускаю GPS…';}
  try{
    const geo=await getGeoNow(15000);if(!geo)throw new Error(window._lastGeoError||'Не удалось получить стартовую координату. Разрешите точное местоположение.');
    await v19EnsureNativePermissions();
    const {data,error}=await db.rpc('gps_start_my_workday',{p_manager_name:currentProfile?.name||'',p_lat:geo.lat,p_lng:geo.lng,p_accuracy:geo.accuracy,p_device_info:navigator.userAgent.slice(0,500)});
    if(error)throw error;v19MyWorkday=v19RpcRow(data);if(!v19MyWorkday)throw new Error('CRM не создала рабочий день');
    await v19StartNativeFor(v19MyWorkday);await v19LoadMyWorkday();await v19RenderManagerWorkday();v19RenderWorkdayCard();
    alert('Рабочий день начат. В шторке Android должно быть постоянное уведомление «Ресанта CRM · рабочий день».');
  }catch(e){
    if(v19MyWorkday?.id)await db.rpc('gps_set_my_native_state',{p_workday_id:v19MyWorkday.id,p_active:false,p_error:e.message||String(e)}).catch?.(()=>{});
    alert('Не удалось начать рабочий день:\n'+(e.message||e));
  }finally{if(btn){btn.disabled=false;btn.textContent='▶ Начать рабочий день';}}
}
async function v19ResumeWorkday(){
  if(!v19MyWorkday)return v19StartWorkday();
  try{await v19EnsureNativePermissions();await v19StartNativeFor(v19MyWorkday);await v19LoadMyWorkday();await v19RenderManagerWorkday();v19RenderWorkdayCard();alert('Запись маршрута возобновлена.');}
  catch(e){alert('Не удалось возобновить GPS: '+(e.message||e));}
}
async function v19StopWorkday(){
  if(!v19MyWorkday?.id)return;
  if(!confirm('Завершить рабочий день и остановить запись маршрута?'))return;
  const btn=document.getElementById('workday-stop-btn');if(btn){btn.disabled=true;btn.textContent='Завершаю…';}
  try{
    const geo=await getGeoNow(12000);
    const tracker=v19NativeTracker();if(tracker&&typeof tracker.stop==='function')await tracker.stop();
    await new Promise(r=>setTimeout(r,1200));
    const {error}=await db.rpc('gps_finish_my_workday',{p_workday_id:v19MyWorkday.id,p_lat:geo?.lat||null,p_lng:geo?.lng||null,p_accuracy:geo?.accuracy||null,p_reason:'manager_finished'});
    if(error)throw error;v19MyWorkday=null;await v19RenderManagerWorkday();v19RenderWorkdayCard();alert('Рабочий день завершён. Запись GPS остановлена.');
  }catch(e){alert('Не удалось завершить рабочий день: '+(e.message||e));}
  finally{if(btn){btn.disabled=false;btn.textContent='■ Завершить рабочий день';}}
}
async function v19RenderManagerWorkday(){
  const root=document.getElementById('workday-manager-status');if(!root||currentProfile?.role!=='manager')return;
  const native=await v19NativeStatus();
  if(!v19MyWorkday){
    root.innerHTML='<div class="gps-workday-status"><span class="gps-workday-dot"></span><div style="flex:1"><div style="font-weight:700">Рабочий день не начат</div><div style="font-size:12px;color:var(--sub);margin-top:4px">Перед первым выездом запустите запись маршрута.</div></div><button id="workday-start-btn" class="btn-primary" onclick="v19StartWorkday()">▶ Начать рабочий день</button></div>'+(native.native?'':'<div class="promo-warning" style="margin-top:12px">Фоновая запись недоступна в браузере. Откройте установленное Android-приложение.</div>');
    return;
  }
  const running=!!native.active&&String(native.workdayId||'')===String(v19MyWorkday.id);
  root.innerHTML='<div class="gps-workday-status"><span class="gps-workday-dot '+(running?'active':'error')+'"></span><div style="flex:1;min-width:220px"><div style="font-weight:700">'+(running?'Рабочий маршрут записывается':'Рабочий день активен, но GPS остановлен')+'</div><div style="font-size:12px;color:var(--sub);margin-top:4px">Начало: '+v19DateTime(v19MyWorkday.started_at)+' · последняя точка: '+v19Age(native.lastPointAt||v19MyWorkday.last_point_at)+'</div>'+(native.queueSize?'<div style="font-size:11px;color:var(--am);margin-top:3px">Без связи: '+native.queueSize+' точек ждут отправки</div>':'')+(native.lastError?'<div style="font-size:11px;color:var(--r);margin-top:3px">'+esc(native.lastError)+'</div>':'')+'</div><div style="display:flex;gap:8px;flex-wrap:wrap">'+(!running?'<button class="btn-primary" onclick="v19ResumeWorkday()">↻ Возобновить GPS</button>':'')+'<button id="workday-stop-btn" class="btn-secondary" style="border-color:var(--r);color:var(--r)" onclick="v19StopWorkday()">■ Завершить рабочий день</button></div></div>';
}
async function v19RenderWorkdayCard(){
  const root=document.getElementById('manager-workday-card');if(!root||currentProfile?.role!=='manager')return;
  const native=await v19NativeStatus(),running=v19MyWorkday&&native.active&&String(native.workdayId||'')===String(v19MyWorkday.id);
  root.innerHTML='<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="gps-workday-dot '+(running?'active':v19MyWorkday?'error':'')+'"></span><div style="flex:1"><div class="card-title" style="margin:0">🚗 Рабочий день</div><div style="font-size:12px;color:var(--sub);margin-top:3px">'+(running?'GPS-маршрут записывается с '+v19Time(v19MyWorkday.started_at):v19MyWorkday?'GPS требует возобновления':'Перед выездом включите запись маршрута')+'</div></div><button class="btn-primary" onclick="goPage(\'workday\',\'Рабочий день\')">Открыть</button></div>';
}

function v19PlanStats(w){
  const plans=allRoutePlans.filter(r=>!r.removed&&String(r.visit_date||'').slice(0,10)===String(w.work_date||'').slice(0,10)&&managerLooseMatch(r.manager_name,w.manager_name));
  const visited=plans.filter(r=>{try{return routePlanVerified(r);}catch(_){return !!r.visited;}});
  return {plans,visited,missed:plans.filter(r=>!visited.includes(r))};
}
async function v19RenderGpsControl(force){
  if(!v19GpsControllerAccess){alert('Детальный GPS-контроль доступен только руководителям с разрешением.');return;}
  if(v19GpsRefreshBusy)return;v19GpsRefreshBusy=true;
  try{
    const dateEl=document.getElementById('gps-control-date'),managerEl=document.getElementById('gps-control-manager'),statusEl=document.getElementById('gps-control-status');
    if(dateEl&&!dateEl.value)dateEl.value=TODAY;
    if(managerEl&&managerEl.options.length<=1){allUsers.filter(u=>isFieldManagerUser(u)&&u.name).forEach(u=>managerEl.insertAdjacentHTML('beforeend','<option value="'+escAttr(u.name)+'">'+esc(u.name)+'</option>'));}
    const date=dateEl?.value||TODAY,mgr=managerEl?.value||'all',status=statusEl?.value||'all';
    let q=db.from('gps_workdays').select('*').eq('work_date',date).order('started_at',{ascending:false});
    if(mgr!=='all')q=q.eq('manager_name',mgr);if(status!=='all')q=q.eq('status',status);
    const {data,error}=await q;if(error)throw error;
    const fieldManagerNames=new Set(allUsers.filter(u=>isFieldManagerUser(u)&&u.name).map(u=>String(u.name).trim().toLowerCase()));
    v19GpsControlRows=(data||[]).filter(w=>fieldManagerNames.has(String(w.manager_name||'').trim().toLowerCase()));
    const active=v19GpsControlRows.filter(w=>w.status==='active'),completed=v19GpsControlRows.filter(w=>w.status==='completed'),km=v19GpsControlRows.reduce((s,w)=>s+(Number(w.total_distance_m)||0),0);
    const stale=active.filter(w=>!w.last_point_at||Date.now()-new Date(w.last_point_at).getTime()>10*60000);
    document.getElementById('gps-control-kpi').innerHTML='<div class="kpi"><div class="kpi-label">Сейчас в пути</div><div class="kpi-value '+(active.length?'ok':'')+'">'+active.length+'</div></div><div class="kpi"><div class="kpi-label">Завершили день</div><div class="kpi-value">'+completed.length+'</div></div><div class="kpi"><div class="kpi-label">Пробег за дату</div><div class="kpi-value">'+v19Km(km)+'</div></div><div class="kpi"><div class="kpi-label">Нет точки >10 мин</div><div class="kpi-value '+(stale.length?'bad':'')+'">'+stale.length+'</div></div>';
    const list=document.getElementById('gps-control-list');
    list.innerHTML=v19GpsControlRows.length?'<table class="gps-route-table"><thead><tr><th>Менеджер</th><th>Статус</th><th>Начало / конец</th><th>Последняя точка</th><th>Пробег</th><th>Маршрут</th><th></th></tr></thead><tbody>'+v19GpsControlRows.map(w=>{const ps=v19PlanStats(w),live=w.status==='active',stalePoint=live&&(!w.last_point_at||Date.now()-new Date(w.last_point_at).getTime()>10*60000);return '<tr><td><b>'+esc(w.manager_name)+'</b></td><td>'+(live?'<span class="gps-live-pill">в пути</span>':'<span class="tag tag-m">завершён</span>')+(stalePoint?'<div class="bad" style="font-size:10px;margin-top:4px">GPS давно не обновлялся</div>':'')+'</td><td>'+v19Time(w.started_at)+' — '+(w.ended_at?v19Time(w.ended_at):'сейчас')+'<div style="font-size:10px;color:var(--sub)">'+v19Duration(w.started_at,w.ended_at)+'</div></td><td>'+v19Age(w.last_point_at)+'</td><td><b>'+v19Km(w.total_distance_m)+'</b><div style="font-size:10px;color:var(--sub)">'+(w.valid_points||0)+' точек</div></td><td>'+ps.visited.length+' / '+ps.plans.length+' посещено'+(ps.missed.length?'<div class="bad" style="font-size:10px">'+ps.missed.length+' не подтверждено</div>':'')+'</td><td><button class="btn-secondary" onclick="v19OpenGpsWorkday(\''+w.id+'\')">Карта</button></td></tr>';}).join('')+'</tbody></table>':'<div style="padding:18px;color:var(--sub);text-align:center">За выбранную дату рабочие дни не найдены.</div>';
    if(v19SelectedWorkdayId&&v19GpsControlRows.some(w=>String(w.id)===String(v19SelectedWorkdayId)))await v19OpenGpsWorkday(v19SelectedWorkdayId,true);
    else if(v19GpsControlRows.length&&(force||!v19SelectedWorkdayId))await v19OpenGpsWorkday(v19GpsControlRows[0].id,true);
  }catch(e){alert('Не удалось загрузить GPS-контроль: '+(e.message||e));}
  finally{v19GpsRefreshBusy=false;}
}
function v19LoadLeaflet(){
  if(window.L)return Promise.resolve(window.L);if(window._v19LeafletPromise)return window._v19LeafletPromise;
  window._v19LeafletPromise=new Promise((resolve,reject)=>{if(!document.getElementById('v19-leaflet-css')){const l=document.createElement('link');l.id='v19-leaflet-css';l.rel='stylesheet';l.href='https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(l);}const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js';s.onload=()=>resolve(window.L);s.onerror=()=>reject(new Error('Не загрузилась карта'));document.head.appendChild(s);});return window._v19LeafletPromise;
}
function v19DetectStops(points){
  const p=(points||[]).filter(x=>Number(x.accuracy)<=200&&Number.isFinite(Number(x.lat))&&Number.isFinite(Number(x.lng))).sort((a,b)=>String(a.recorded_at).localeCompare(String(b.recorded_at))),out=[];
  let i=0;while(i<p.length){let j=i+1;while(j<p.length&&gpsDistance(Number(p[i].lat),Number(p[i].lng),Number(p[j].lat),Number(p[j].lng))<=100)j++;const mins=(new Date(p[j-1].recorded_at)-new Date(p[i].recorded_at))/60000;if(j-i>=3&&mins>=10)out.push({start:p[i].recorded_at,end:p[j-1].recorded_at,mins:Math.round(mins),lat:Number(p[i].lat),lng:Number(p[i].lng)});i=Math.max(j,i+1);}return out;
}
function v206GpsBool(v){return v===true||v==='true'||v===1||v==='1';}
let v207LastGpsFilterStats={raw:0,usable:0,onMap:0,removedAccuracy:0,removedSpike:0,removedMotion:0,breaks:0};
function v207GpsAccuracy(p){const a=Number(p?.accuracy);return Number.isFinite(a)&&a>0?a:null;}
function v207GpsRouteDistance(segments){
  return (segments||[]).reduce((total,seg)=>total+(seg||[]).reduce((sum,p,i)=>i?sum+gpsDistance(seg[i-1].lat,seg[i-1].lng,p.lat,p.lng):sum,0),0);
}
function v206GpsSegments(points){
  const stats={raw:(points||[]).length,usable:0,onMap:0,removedAccuracy:0,removedSpike:0,removedMotion:0,breaks:0};
  let rows=(points||[]).map(p=>{
    const lat=Number(p.lat),lng=Number(p.lng),time=new Date(p.recorded_at).getTime(),accuracy=v207GpsAccuracy(p);
    return {...p,lat,lng,time,accuracy};
  }).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Number.isFinite(p.time)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180)
    .sort((a,b)=>a.time-b.time);

  // Для линии берём только координаты с нормальной точностью. Точки с погрешностью
  // более 100 м полезны как «последний сигнал», но рисовать по ним путь нельзя:
  // именно они создавали треугольники через кварталы и здания.
  rows=rows.filter(p=>{
    if(p.accuracy!=null&&p.accuracy>100){stats.removedAccuracy++;return false;}
    return true;
  });

  // Убираем точные дубли, которые Android иногда присылает после восстановления связи.
  rows=rows.filter((p,i,a)=>!i||p.time!==a[i-1].time||gpsDistance(a[i-1].lat,a[i-1].lng,p.lat,p.lng)>2);
  stats.usable=rows.length;

  // Тройной локальный фильтр «вылетел и сразу вернулся». Он удаляет одиночный
  // GPS-выброс, но не режет настоящий поворот или разворот автомобиля.
  for(let pass=0;pass<3&&rows.length>2;pass++){
    const out=[rows[0]];
    for(let i=1;i<rows.length-1;i++){
      const a=out[out.length-1],b=rows[i],c=rows[i+1];
      const dt1=Math.max(1,(b.time-a.time)/1000),dt2=Math.max(1,(c.time-b.time)/1000);
      const ab=gpsDistance(a.lat,a.lng,b.lat,b.lng),bc=gpsDistance(b.lat,b.lng,c.lat,c.lng),ac=gpsDistance(a.lat,a.lng,c.lat,c.lng);
      const detour=ab+bc,fastOut=ab/dt1*3.6,fastBack=bc/dt2*3.6;
      const returnedQuickly=dt1<=180&&dt2<=180&&ab>=120&&bc>=120&&ac<=Math.max(90,Math.min(ab,bc)*0.28)&&detour>ac*4+220;
      const impossibleBounce=dt1<=120&&dt2<=120&&fastOut>150&&fastBack>150&&ac<350;
      const badMiddleAccuracy=b.accuracy!=null&&b.accuracy>55&&
        b.accuracy>Math.max(a.accuracy||15,c.accuracy||15)*1.8&&detour>ac*3+180;
      if(returnedQuickly||impossibleBounce||badMiddleAccuracy){stats.removedSpike++;continue;}
      out.push(b);
    }
    out.push(rows[rows.length-1]);
    if(out.length===rows.length)break;
    rows=out;
  }

  const segments=[];let current=[];
  for(const row of rows){
    if(current.length){
      const prev=current[current.length-1],seconds=Math.max(1,(row.time-prev.time)/1000),meters=gpsDistance(prev.lat,prev.lng,row.lat,row.lng),speedKmh=meters/seconds*3.6;
      // Не принимаем физически невозможный скачок как движение машины.
      if((seconds<=300&&speedKmh>160)||(seconds<=120&&meters>3500)){
        stats.removedMotion++;continue;
      }
      // При длительном отсутствии достоверных координат не соединяем точки
      // прямой через весь город: на карте будет честный разрыв, а не выдуманный путь.
      if(seconds>600||(seconds>240&&meters>600)||(seconds>120&&meters>2200)){
        if(current.length)segments.push(current);
        current=[];stats.breaks++;
      }else if(meters<3&&seconds<20){
        continue;
      }
    }
    current.push(row);
  }
  if(current.length)segments.push(current);
  v207LastGpsFilterStats={...stats,onMap:segments.reduce((n,seg)=>n+seg.length,0)};
  return segments;
}
function v206AddGpsLegend(L,map){
  const legend=L.control({position:'bottomleft'});legend.onAdd=function(){const d=L.DomUtil.create('div','v206-gps-legend');d.innerHTML='<div><i class="v206-line"></i> очищенный GPS-путь</div><div><i class="v206-dot start"></i> начало</div><div><i class="v206-dot now"></i> МПП сейчас / последняя точка</div><div><i class="v206-dot stop"></i> остановка ≥10 мин</div><div><i class="v206-dot client"></i> точка клиента</div>';L.DomEvent.disableClickPropagation(d);return d;};legend.addTo(map);
}

function v2273213GpsClientForPlan(r){
  return r?.client_id?(allClients||[]).find(x=>String(x.id)===String(r.client_id)):matchClientByName(r?.client_name||'');
}
function v2273213GpsVisitClient(v){
  return v?.client_id?(allClients||[]).find(x=>String(x.id)===String(v.client_id)):null;
}
function v2273213GpsPointTime(p){return new Date(p?.recorded_at||0).getTime();}
function v2273213GpsNearWindows(points,gf){
  if(!gf||!Number.isFinite(Number(gf.lat))||!Number.isFinite(Number(gf.lng)))return [];
  const radius=Math.max(100,Number(gf.radius)||150);
  const near=(points||[]).map(p=>({
    p,
    t:v2273213GpsPointTime(p),
    d:gpsDistance(Number(gf.lat),Number(gf.lng),Number(p.lat),Number(p.lng))
  })).filter(x=>Number.isFinite(x.t)&&Number.isFinite(x.d)&&x.d<=radius).sort((a,b)=>a.t-b.t);
  if(!near.length)return [];
  const groups=[];let cur=[near[0]];
  for(let i=1;i<near.length;i++){
    const gap=(near[i].t-near[i-1].t)/60000;
    if(gap<=7)cur.push(near[i]);
    else{groups.push(cur);cur=[near[i]];}
  }
  groups.push(cur);
  return groups.map(g=>{
    const start=g[0].p.recorded_at,end=g[g.length-1].p.recorded_at;
    const mins=Math.max(0,(new Date(end)-new Date(start))/60000);
    return {
      start,end,mins:Math.round(mins),
      points:g.length,
      minDistance:Math.round(Math.min(...g.map(x=>x.d))),
      lat:Number(gf.lat),lng:Number(gf.lng),
      radius,verified:!!gf.verified,source:gf.source||''
    };
  }).filter(x=>x.points>=3&&x.mins>=5);
}
function v2273213BestWindow(points,gf){
  const arr=v2273213GpsNearWindows(points,gf);
  if(!arr.length)return null;
  return arr.sort((a,b)=>b.mins-a.mins||new Date(a.start)-new Date(b.start))[0];
}
function v2273213VisitForPlan(plan,visits){
  const direct=(visits||[]).filter(v=>!v.is_duplicate&&routeClientMatchesVisit(plan,v));
  if(plan?.linked_visit_id){
    const x=direct.find(v=>String(v.id)===String(plan.linked_visit_id));
    if(x)return x;
  }
  return direct[0]||null;
}
function v2273213TaskSummary(clientId,tasks,workDate){
  if(!clientId)return {open:0,done:0,dueOpen:0};
  const rows=(tasks||[]).filter(t=>String(t.client_id||'')===String(clientId));
  const done=rows.filter(t=>!!t.done).length;
  const open=rows.filter(t=>!t.done).length;
  const dueOpen=rows.filter(t=>!t.done&&String(t.due_date||'').slice(0,10)<=String(workDate||'')).length;
  return {open,done,dueOpen};
}
function v2273213StopClass(stop){
  if(stop.gpsWindow&&stop.visitSaved){
    return stop.geofence?.verified?'ok':'info';
  }
  if(stop.gpsWindow&&!stop.visitSaved)return 'warn';
  if(!stop.gpsWindow&&stop.visitSaved&&stop.geofence?.verified)return 'bad';
  return 'info';
}
function v2273213StopStatus(stop){
  if(stop.gpsWindow&&stop.visitSaved){
    return stop.geofence?.verified
      ?'✅ GPS + визит подтверждены'
      :'🔵 Визит сохранён, GPS рядом; координата клиента ещё не выверена';
  }
  if(stop.gpsWindow&&!stop.visitSaved){
    return stop.geofence?.verified
      ?'⚠️ GPS подтверждает присутствие, но визит не сохранён'
      :'⚠️ GPS был рядом, визит не сохранён; координата клиента ещё не выверена';
  }
  if(!stop.gpsWindow&&stop.visitSaved&&stop.geofence?.verified)return '❗ Визит сохранён, но GPS геозону не подтвердил';
  if(stop.visitSaved)return 'ℹ️ Визит сохранён; GPS-проверка ненадёжна из-за координаты клиента';
  return 'Плановая точка без подтверждённого приезда';
}
function v2273213Popup(stop){
  const w=stop.gpsWindow,ts=stop.taskSummary||{open:0,done:0,dueOpen:0};
  return '<b>'+esc(stop.clientName||'Клиент')+'</b>'
    +(stop.actualNo?'<br><b>Фактическая точка №'+stop.actualNo+'</b>':'')
    +(w?'<br>Прибыл: '+v19Time(w.start)+' · уехал: '+v19Time(w.end)+'<br>У клиента: <b>'+w.mins+' мин</b> · минимум '+w.minDistance+' м':'')
    +'<br>'+esc(v2273213StopStatus(stop))
    +(ts.dueOpen?'<br><span style="color:#b45309">Открытых задач со сроком до этой даты: '+ts.dueOpen+'</span>':'')
    +(stop.geofence&&!stop.geofence.verified?'<br><span style="color:#64748b">GPS точки клиента: '+esc(stop.geofence.source||'не выверены')+'</span>':'');
}
function v2273213DetailHtml(stops,unmatchedStops,ps,w,displayDistance,points,valid,routeRows,lastAt,lastLat,lastLng,stale){
  const actual=stops.filter(x=>x.gpsWindow).sort((a,b)=>new Date(a.gpsWindow.start)-new Date(b.gpsWindow.start));
  const review=stops.filter(x=>(x.gpsWindow&&!x.visitSaved)||(!x.gpsWindow&&x.visitSaved&&x.geofence?.verified));
  const actualHtml=actual.length
    ?'<div class="v2273213-stop-list">'+actual.map(x=>{
       const cls=v2273213StopClass(x),gw=x.gpsWindow,ts=x.taskSummary||{};
       return '<div class="v2273213-stop-row '+((x.gpsWindow&&!x.visitSaved)?'v2273213-review':'')+'">'
         +'<div class="v2273213-stop-head"><span class="v2273213-stop-num '+cls+'">'+x.actualNo+'</span><div style="min-width:0;flex:1">'
         +'<div class="v2273213-stop-title">'+esc(x.clientName)+'</div>'
         +'<div class="v2273213-stop-meta">'+v19Time(gw.start)+'–'+v19Time(gw.end)+' · <b>'+gw.mins+' мин</b> · минимум '+gw.minDistance+' м<br>'+v2273213StopStatus(x)
         +(ts.dueOpen?'<br>⚠️ Открытых задач со сроком до этой даты: '+ts.dueOpen:'')
         +(!x.geofence?.verified?'<br>ℹ️ Геоточка клиента не подтверждена окончательно: '+esc(x.geofence?.source||'нет эталона'):'')
         +'</div></div></div></div>';
     }).join('')+'</div>'
    :'<div style="font-size:12px;color:var(--sub);margin-top:6px">Клиентских остановок длительностью от 5 минут GPS не подтвердил.</div>';

  const reviewHtml=review.length
    ?'<div class="gps-detail-row"><b>⚠️ Требуют разбора: '+review.length+'</b><br>'
      +review.map(x=>esc(x.clientName)+' — '+esc(v2273213StopStatus(x))).join('<br>')+'</div>'
    :'';

  const unmatchedHtml=unmatchedStops.length
    ?'<div class="gps-detail-row"><b>Прочие остановки ≥10 минут:</b> '+unmatchedStops.length+'<br><span class="v2273213-unmatched-stop">'
      +unmatchedStops.map(x=>v19Time(x.start)+'–'+v19Time(x.end)+' · '+x.mins+' мин').join('<br>')+'</span></div>'
    :'';

  return '<div class="gps-detail-row"><b>Рабочий день:</b><br>'+v19DateTime(w.started_at)+' — '+(w.ended_at?v19DateTime(w.ended_at):'сейчас')+' ('+v19Duration(w.started_at,w.ended_at)+')</div>'
    +'<div class="gps-detail-row"><b>Очищенный GPS-пробег:</b> '+v19Km(displayDistance)+'<br><span style="color:var(--sub)">Сырых точек: '+(w.raw_points||points.length)+' · сервер принял: '+(w.valid_points||valid.length)+' · на карте: '+routeRows.length+' · убрано шумных: '+Math.max(0,valid.length-routeRows.length)+'</span></div>'
    +'<div class="gps-detail-row"><b>План / сохранённые визиты:</b> '+ps.visited.length+' / '+ps.plans.length+'<br>'+(ps.missed.length?'<span class="bad">Не подтверждены визитом: '+ps.missed.map(r=>esc(r.client_name)).join(', ')+'</span>':'<span class="ok">Все плановые точки имеют сохранённый визит</span>')+'</div>'
    +reviewHtml
    +'<div class="gps-detail-row"><b>Фактические клиентские остановки по GPS: '+actual.length+'</b>'+actualHtml+'</div>'
    +unmatchedHtml
    +'<div class="gps-detail-row"><b>'+(w.status==='active'?'Где МПП сейчас:':'Последняя координата:')+'</b><br><span class="'+(stale?'bad':'ok')+'">'+v19Age(lastAt)+(stale&&w.status==='active'?' · данные устарели':'')+'</span>'
      +(Number.isFinite(lastLat)&&Number.isFinite(lastLng)?' · '+lastLat.toFixed(5)+', '+lastLng.toFixed(5)+'<br><a target="_blank" href="https://yandex.ru/maps/?pt='+lastLng+','+lastLat+'&z=16&l=map">Открыть точное место в Яндекс Картах</a>':'')+'</div>';
}
window.v2273213GpsFitAll=function(){
  try{
    const b=window._v2273213GpsBounds;
    if(v19GpsMap&&b&&b.length>1)v19GpsMap.fitBounds(b,{padding:[35,35],maxZoom:16});
    else if(v19GpsMap&&b&&b.length===1)v19GpsMap.setView(b[0],16);
  }catch(e){console.warn(e);}
};
window.v2273213GpsGoCurrent=function(){
  try{
    const p=window._v2273213GpsLast;
    if(v19GpsMap&&p)v19GpsMap.setView([p.lat,p.lng],17,{animate:false});
  }catch(e){console.warn(e);}
};


function v2273214Median(values){
  const a=(values||[]).filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length)return null;
  const n=a.length,m=Math.floor(n/2);
  return n%2?a[m]:(a[m-1]+a[m])/2;
}
function v2273214StopInput(points){
  return (points||[]).map(p=>({
    ...p,
    lat:Number(p.lat),lng:Number(p.lng),
    acc:Number.isFinite(Number(p.accuracy))?Number(p.accuracy):null,
    t:new Date(p.recorded_at).getTime()
  })).filter(p=>
    v206GpsBool(p.is_valid)&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&
    Number.isFinite(p.t)&&(!p.acc||p.acc<=180)
  ).sort((a,b)=>a.t-b.t)
   .filter((p,i,a)=>!i||p.t!==a[i-1].t||gpsDistance(a[i-1].lat,a[i-1].lng,p.lat,p.lng)>2);
}
function v2273214Center(rows){
  return {
    lat:v2273214Median(rows.map(x=>x.lat)),
    lng:v2273214Median(rows.map(x=>x.lng))
  };
}
function v2273214PhysicalStops(points){
  const p=v2273214StopInput(points),out=[];
  let i=0;
  while(i<p.length-2){
    const cluster=[p[i]];
    let lastGood=i,misses=0,j=i+1;
    for(;j<p.length;j++){
      const row=p[j],last=p[lastGood];
      if((row.t-last.t)>12*60000)break;
      const c=v2273214Center(cluster);
      const tol=130+Math.min(45,Math.max(0,(row.acc||30)-20));
      const d=gpsDistance(c.lat,c.lng,row.lat,row.lng);
      if(d<=tol){
        cluster.push(row);lastGood=j;misses=0;
      }else{
        // One or two bad GPS samples must not cut a 40-60 minute real stop.
        const gap=(row.t-last.t)/60000;
        if(gap<=4&&misses<2){misses++;continue;}
        break;
      }
    }

    if(cluster.length>=3){
      const first=cluster[0],last=cluster[cluster.length-1];
      const mins=(last.t-first.t)/60000;
      const c=v2273214Center(cluster);
      const ds=cluster.map(x=>gpsDistance(c.lat,c.lng,x.lat,x.lng)).sort((a,b)=>a-b);
      const p80=ds[Math.min(ds.length-1,Math.floor(ds.length*.80))]||0;
      let path=0;
      for(let k=1;k<cluster.length;k++)path+=gpsDistance(cluster[k-1].lat,cluster[k-1].lng,cluster[k].lat,cluster[k].lng);
      const avgSpeed=mins>0?(path/1000)/(mins/60):0;
      // A physical stop is a time/spatial cluster, not a client geofence.
      if(mins>=5&&p80<=155&&avgSpeed<=9){
        out.push({
          id:'stop-'+first.t+'-'+last.t,
          start:first.recorded_at,end:last.recorded_at,
          startMs:first.t,endMs:last.t,mins:Math.round(mins),
          lat:c.lat,lng:c.lng,points:cluster,
          pointCount:cluster.length,
          spread80:Math.round(p80),
          medianAccuracy:Math.round(v2273214Median(cluster.map(x=>x.acc).filter(Number.isFinite))||0),
          avgSpeedKmh:Math.round(avgSpeed*10)/10
        });
        i=lastGood+1;
        continue;
      }
    }
    i++;
  }

  // Merge adjacent stationary clusters when GPS briefly disappeared but both
  // clusters are at the same physical place.
  const merged=[];
  out.forEach(st=>{
    const prev=merged[merged.length-1];
    if(prev){
      const gap=(st.startMs-prev.endMs)/60000;
      const d=gpsDistance(prev.lat,prev.lng,st.lat,st.lng);
      if(gap>=0&&gap<=8&&d<=120){
        const rows=[...(prev.points||[]),...(st.points||[])];
        const c=v2273214Center(rows);
        prev.end=st.end;prev.endMs=st.endMs;prev.mins=Math.round((prev.endMs-prev.startMs)/60000);
        prev.lat=c.lat;prev.lng=c.lng;prev.points=rows;prev.pointCount=rows.length;
        const ds=rows.map(x=>gpsDistance(c.lat,c.lng,x.lat,x.lng)).sort((a,b)=>a-b);
        prev.spread80=Math.round(ds[Math.min(ds.length-1,Math.floor(ds.length*.80))]||0);
        return;
      }
    }
    merged.push({...st});
  });
  return merged;
}
function v2273214ClientPool(manager,plans,visits){
  const map=new Map();
  const ensure=(c)=>{
    if(!c?.id)return null;
    const k=String(c.id);
    if(!map.has(k))map.set(k,{client:c,plans:[],visits:[]});
    return map.get(k);
  };

  // Planned / visited clients are strongest candidates.
  (plans||[]).forEach(r=>{
    const c=r.client_id?(allClients||[]).find(x=>String(x.id)===String(r.client_id)):matchClientByName(r.client_name||'');
    const x=ensure(c);if(x)x.plans.push(r);
  });
  (visits||[]).forEach(v=>{
    const c=v.client_id?(allClients||[]).find(x=>String(x.id)===String(v.client_id)):null;
    const x=ensure(c);if(x)x.visits.push(v);
  });

  // Also allow an unplanned client of this manager to be recognised by GPS.
  (allClients||[]).filter(c=>managerLooseMatch(c.manager_name,manager)).forEach(c=>ensure(c));
  return [...map.values()].map(x=>({...x,geofence:clientGeofence(x.client)}))
    .filter(x=>x.geofence&&Number.isFinite(Number(x.geofence.lat))&&Number.isFinite(Number(x.geofence.lng)));
}
function v2273214MinDistance(stop,gf){
  return Math.round(Math.min(...(stop.points||[]).map(p=>gpsDistance(Number(gf.lat),Number(gf.lng),p.lat,p.lng))));
}
function v2273214VisitMatchesClient(client,visits){
  if(!client)return [];
  return (visits||[]).filter(v=>{
    if(v.client_id&&String(v.client_id)===String(client.id))return true;
    try{
      return routeClientMatchesVisit({client_id:client.id,client_name:client.name},v);
    }catch(_){return false;}
  });
}
function v2273214PlanMatchesClient(client,plans){
  if(!client)return [];
  return (plans||[]).filter(r=>{
    if(r.client_id&&String(r.client_id)===String(client.id))return true;
    try{
      const rc=r.client_id?(allClients||[]).find(c=>String(c.id)===String(r.client_id)):matchClientByName(r.client_name||'');
      return rc&&String(rc.id)===String(client.id);
    }catch(_){return false;}
  });
}
function v2273214AssignStop(stop,pool,visits,plans){
  const candidates=[];
  (pool||[]).forEach(x=>{
    const gf=x.geofence;if(!gf)return;
    const verified=!!gf.verified;
    // Never use giant geocoder circles as proof. Unverified points are only
    // hypotheses within a tighter 180 m maximum.
    const base=verified
      ?Math.min(250,Math.max(100,Number(gf.radius)||150))
      :Math.min(180,Math.max(100,Number(gf.radius)||150));
    const extra=Math.min(35,Math.max(0,(stop.medianAccuracy||0)-25));
    const minDistance=v2273214MinDistance(stop,gf);
    if(minDistance>base+extra)return;

    const client=x.client;
    const clientVisits=v2273214VisitMatchesClient(client,visits);
    const clientPlans=v2273214PlanMatchesClient(client,plans);
    const linked=clientPlans.some(r=>r.linked_visit_id&&clientVisits.some(v=>String(v.id)===String(r.linked_visit_id)));
    let score=1000-minDistance;
    if(verified)score+=120;
    if(clientPlans.length)score+=90;
    if(clientVisits.length)score+=520;
    if(linked)score+=180;

    candidates.push({
      ...x,verified,minDistance,baseRadius:base,score,
      clientVisits,clientPlans,linked
    });
  });
  candidates.sort((a,b)=>b.score-a.score||a.minDistance-b.minDistance);
  if(!candidates.length)return {...stop,kind:'technical',candidates:[]};

  const a=candidates[0],b=candidates[1];
  let confident=!b;
  if(b){
    const advantage=a.score-b.score;
    if(a.clientVisits.length&&!b.clientVisits.length)confident=true;
    else if(a.linked&&!b.linked)confident=true;
    else if(a.verified&&!b.verified&&a.minDistance<=b.minDistance+35)confident=true;
    else if(a.minDistance+80<b.minDistance)confident=true;
    else if(advantage>=190)confident=true;
  }

  if(!confident){
    return {
      ...stop,kind:'ambiguous',candidates:candidates.slice(0,3),
      client:null,clientName:'Неоднозначная торговая точка',
      confidence:'ambiguous',visitSaved:false
    };
  }

  const confidence=a.verified?'high':'medium';
  return {
    ...stop,kind:'client',candidates:candidates.slice(0,3),
    assigned:a,client:a.client,clientName:a.client.name,
    geofence:a.geofence,minDistance:a.minDistance,
    confidence,visitSaved:a.clientVisits.length>0,
    visit:a.clientVisits[0]||null,plans:a.clientPlans
  };
}
function v2273214TaskSummary(clientId,tasks,workDate){
  if(!clientId)return {open:0,done:0,dueOpen:0};
  const rows=(tasks||[]).filter(t=>String(t.client_id||'')===String(clientId));
  return {
    open:rows.filter(t=>!t.done).length,
    done:rows.filter(t=>!!t.done).length,
    dueOpen:rows.filter(t=>!t.done&&String(t.due_date||'').slice(0,10)<=String(workDate||'')).length
  };
}
function v2273214Status(x){
  if(x.kind==='ambiguous')return '⚠️ Остановка одна, но рядом несколько ТТ — CRM не дублирует её и требует уточнения.';
  if(x.kind!=='client')return 'Прочая физическая остановка.';
  if(x.confidence==='medium'){
    if(x.visitSaved)return '🔵 GPS-остановка рядом + визит сохранён, но координата клиента ещё не выверена.';
    return '🟡 GPS-остановка рядом; координата клиента не выверена, визит не сохранён.';
  }
  if(x.visitSaved)return '✅ GPS + сохранённый визит подтверждают торговую точку.';
  return '⚠️ GPS уверенно подтверждает остановку у ТТ, но визит в CRM не сохранён.';
}
function v2273214StopHeading(x){
  if(x.kind==='ambiguous')return 'Возможные ТТ: '+x.candidates.map(c=>c.client.name+' ('+c.minDistance+' м)').join(' / ');
  if(x.kind==='client')return x.clientName;
  return 'Прочая остановка';
}
function v2273214StopTimeLabel(x){
  if(x.kind==='client'&&x.confidence==='high')return 'У клиента: '+x.mins+' мин';
  return 'GPS-остановка: '+x.mins+' мин';
}
function v2273214SelectedHtml(x){
  if(!x)return '<div class="v2273214-selected"><div class="v2273214-selected-title">Нажмите на номер ТТ</div><div class="v2273214-selected-meta">Карта не будет менять масштаб или центр. Здесь появится расшифровка выбранной остановки.</div></div>';
  const tasks=x.taskSummary||{};
  let detail='<div class="v2273214-selected"><div class="v2273214-selected-title">№'+x.actualNo+' · '+esc(v2273214StopHeading(x))+'</div>'
    +'<div class="v2273214-selected-meta">'
    +'Прибыл: <b>'+v19Time(x.start)+'</b> · уехал: <b>'+v19Time(x.end)+'</b><br>'
    +v2273214StopTimeLabel(x)
    +' · GPS точек: '+x.pointCount
    +' · разброс 80%: '+x.spread80+' м';
  if(x.kind==='client')detail+=' · минимум до ТТ: <b>'+x.minDistance+' м</b>';
  detail+='<br>'+esc(v2273214Status(x));
  if(x.kind==='client'&&x.confidence==='medium')detail+='<br>Координата: '+esc(x.geofence?.source||'геокодер/мало замеров')+'. Это предположение, а не обвинительный факт.';
  if(x.kind==='ambiguous')detail+='<br>CRM намеренно НЕ засчитывает эту же остановку нескольким клиентам.';
  if(tasks.dueOpen)detail+='<br>⚠️ Открытых задач со сроком до этой даты: '+tasks.dueOpen;
  detail+='</div></div>';
  return detail;
}
window.v2273214SelectStop=function(key){
  window._v2273214SelectedStopKey=String(key||'');
  const x=window._v2273214StopIndex?.[window._v2273214SelectedStopKey]||null;
  const box=document.getElementById('gps-selected-stop-2273214');
  if(box)box.innerHTML=v2273214SelectedHtml(x);
  // Intentionally NO setView / panTo / openPopup.
};
window.v2273214GpsFitAll=function(){
  try{
    const b=window._v2273214GpsBounds||[];
    if(v19GpsMap&&b.length>1)v19GpsMap.fitBounds(b,{padding:[35,35],maxZoom:16});
    else if(v19GpsMap&&b.length===1)v19GpsMap.setView(b[0],16);
  }catch(e){console.warn(e);}
};
window.v2273214GpsGoCurrent=function(){
  try{
    const p=window._v2273214GpsLast;
    if(v19GpsMap&&p)v19GpsMap.setView([p.lat,p.lng],17,{animate:false});
  }catch(e){console.warn(e);}
};
function v2273214DetailHtml(business,technical,ps,w,displayDistance,points,valid,routeRows,lastAt,lastLat,lastLng,stale,visits){
  const reviews=business.filter(x=>
    x.kind==='ambiguous'||
    (x.kind==='client'&&x.confidence==='high'&&!x.visitSaved)
  );
  const cards=business.length
    ?'<div class="v2273213-stop-list">'+business.map(x=>{
      const cls=x.kind==='ambiguous'?'warn':(x.confidence==='high'?(x.visitSaved?'ok':'warn'):'info');
      return '<div class="v2273213-stop-row v2273214-stop '+(x.kind==='ambiguous'?'v2273214-ambiguous':'')+'" onclick="v2273214SelectStop(\''+escAttr(x.id)+'\')">'
        +'<div class="v2273213-stop-head"><span class="v2273213-stop-num '+cls+'">'+x.actualNo+'</span>'
        +'<div style="min-width:0;flex:1"><div class="v2273213-stop-title">'+esc(v2273214StopHeading(x))+'</div>'
        +'<div class="v2273213-stop-meta">'+v19Time(x.start)+'–'+v19Time(x.end)+' · <b>'+v2273214StopTimeLabel(x)+'</b>'
        +(x.kind==='client'?' · минимум '+x.minDistance+' м':'')
        +'<br>'+esc(v2273214Status(x))+'</div></div></div></div>';
    }).join('')+'</div>'
    :'<div style="font-size:12px;color:var(--sub);margin-top:6px">Клиентских физических остановок пока не найдено.</div>';

  const reviewHtml=reviews.length
    ?'<div class="gps-detail-row"><b>⚠️ Требуют разбора: '+reviews.length+'</b><br>'
      +reviews.map(x=>'№'+x.actualNo+' '+esc(v2273214StopHeading(x))+' — '+esc(v2273214Status(x))).join('<br>')+'</div>'
    :'';

  const technicalHtml=technical.length
    ?'<div class="gps-detail-row"><b>Прочие физические остановки ≥5 мин:</b> '+technical.length+'<br><span class="v2273214-technical">'
      +technical.map(x=>v19Time(x.start)+'–'+v19Time(x.end)+' · '+x.mins+' мин').join('<br>')+'</span></div>'
    :'';

  return '<div id="gps-selected-stop-2273214">'+v2273214SelectedHtml(window._v2273214StopIndex?.[window._v2273214SelectedStopKey]||null)+'</div>'
    +'<div class="gps-detail-row"><b>Рабочий день:</b><br>'+v19DateTime(w.started_at)+' — '+(w.ended_at?v19DateTime(w.ended_at):'сейчас')+' ('+v19Duration(w.started_at,w.ended_at)+')</div>'
    +'<div class="gps-detail-row"><b>Очищенный GPS-пробег:</b> '+v19Km(displayDistance)+'<br><span style="color:var(--sub)">Сырых точек: '+(w.raw_points||points.length)+' · сервер принял: '+(w.valid_points||valid.length)+' · линия карты: '+routeRows.length+' · для остановок используются серверные GPS-точки отдельно.</span></div>'
    +'<div class="gps-detail-row"><b>План / сохранённые визиты:</b> '+ps.visited.length+' / '+ps.plans.length+'<br>'+(ps.missed.length?'<span class="bad">Не подтверждены визитом: '+ps.missed.map(r=>esc(r.client_name)).join(', ')+'</span>':'<span class="ok">Все плановые точки имеют сохранённый визит</span>')+'</div>'
    +reviewHtml
    +'<div class="gps-detail-row"><b>Фактические клиентские остановки: '+business.length+'</b>'+cards+'</div>'
    +technicalHtml
    +'<div class="gps-detail-row"><b>'+(w.status==='active'?'Где МПП сейчас:':'Последняя координата:')+'</b><br><span class="'+(stale?'bad':'ok')+'">'+v19Age(lastAt)+(stale&&w.status==='active'?' · данные устарели':'')+'</span>'
      +(Number.isFinite(lastLat)&&Number.isFinite(lastLng)?' · '+lastLat.toFixed(5)+', '+lastLng.toFixed(5)+'<br><a target="_blank" href="https://yandex.ru/maps/?pt='+lastLng+','+lastLat+'&z=16&l=map">Открыть точное место в Яндекс Картах</a>':'')+'</div>';
}
async function v2273214EnsureMap(L,mapRoot,center){
  if(!v19GpsMap){
    v19GpsMap=L.map(mapRoot,{preferCanvas:true}).setView(center,13);
    v19GpsMap.attributionControl.setPrefix(false);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(v19GpsMap);
    window._v2273214GpsLayer=L.layerGroup().addTo(v19GpsMap);
  }else{
    try{v19GpsMap.invalidateSize();}catch(_){}
    if(!window._v2273214GpsLayer)window._v2273214GpsLayer=L.layerGroup().addTo(v19GpsMap);
  }
  window._v2273214GpsLayer.clearLayers();
  return window._v2273214GpsLayer;
}

async function v19OpenGpsWorkday(id,silent){
  if(!v19GpsControllerAccess)return;
  const previousId=v19SelectedWorkdayId;
  const sameWorkday=String(previousId||'')===String(id);
  v19SelectedWorkdayId=id;
  const w=v19GpsControlRows.find(x=>String(x.id)===String(id));if(!w)return;

  try{
    const workDate=String(w.work_date||'').slice(0,10);
    const manager=String(w.manager_name||'');
    const [gpsRes,plansRes,visitsRes]=await Promise.all([
      db.from('gps_track_points').select('*').eq('workday_id',id).order('recorded_at',{ascending:true}),
      db.from('route_plans').select('*').eq('visit_date',workDate).eq('manager_name',manager),
      db.from('visits').select('*').eq('date',workDate).eq('manager_name',manager)
    ]);
    if(gpsRes.error)throw gpsRes.error;
    if(plansRes.error)console.warn('GPS route plans',plansRes.error);
    if(visitsRes.error)console.warn('GPS visits',visitsRes.error);

    const points=gpsRes.data||[];
    const valid=points.filter(p=>v206GpsBool(p.is_valid));
    const segments=v206GpsSegments(valid);           // only for the drawn route
    const routeRows=segments.flat();
    const physical=v2273214PhysicalStops(points);    // independent physical-stop truth
    const cleanDistance=v207GpsRouteDistance(segments);
    const displayDistance=routeRows.length>1?cleanDistance:(Number(w.total_distance_m)||0);

    let plans=(plansRes.data||[]).filter(r=>!r.removed);
    if(typeof dedupeRoutePlansForTruth==='function')plans=dedupeRoutePlansForTruth(plans);
    const visits=(visitsRes.data||[]).filter(v=>!v.is_duplicate);
    const ps={
      plans,
      visited:plans.filter(r=>{
        try{
          if(r.linked_visit_id&&visits.some(v=>String(v.id)===String(r.linked_visit_id)))return true;
          return visits.some(v=>routeClientMatchesVisit(r,v));
        }catch(_){return !!r.visited;}
      })
    };
    ps.missed=plans.filter(r=>!ps.visited.includes(r));

    const pool=v2273214ClientPool(manager,plans,visits);
    const assigned=physical.map(st=>v2273214AssignStop(st,pool,visits,plans));
    const business=assigned.filter(x=>x.kind==='client'||x.kind==='ambiguous')
      .sort((a,b)=>a.startMs-b.startMs);
    business.forEach((x,i)=>x.actualNo=i+1);
    const technical=assigned.filter(x=>x.kind==='technical').sort((a,b)=>a.startMs-b.startMs);

    // Tasks are loaded only for clients actually shown + planned clients.
    const taskIds=[...new Set([
      ...business.filter(x=>x.client?.id).map(x=>String(x.client.id)),
      ...plans.map(r=>String(r.client_id||'')).filter(Boolean)
    ])];
    let tasks=[];
    for(let i=0;i<taskIds.length;i+=80){
      const part=taskIds.slice(i,i+80);
      if(!part.length)continue;
      const {data,error}=await db.from('tasks').select('id,client_id,text,due_date,done,done_at,manager_name,source').in('client_id',part);
      if(error){console.warn('GPS tasks',error);break;}
      tasks.push(...(data||[]));
    }
    business.forEach(x=>x.taskSummary=v2273214TaskSummary(x.client?.id,tasks,workDate));

    window._v2273214StopIndex={};
    business.forEach(x=>window._v2273214StopIndex[x.id]=x);
    if(window._v2273214SelectedStopKey&&!window._v2273214StopIndex[window._v2273214SelectedStopKey]){
      window._v2273214SelectedStopKey='';
    }

    const stopInput=v2273214StopInput(points);
    const lastRow=stopInput.length?stopInput[stopInput.length-1]:(routeRows.length?routeRows[routeRows.length-1]:null);
    const lastLat=lastRow?Number(lastRow.lat):Number(w.last_lat);
    const lastLng=lastRow?Number(lastRow.lng):Number(w.last_lng);
    const lastAt=lastRow?.recorded_at||w.last_point_at;
    const stale=!lastAt||Date.now()-new Date(lastAt).getTime()>10*60000;

    document.getElementById('gps-map-title').innerHTML=
      esc(w.manager_name)+' · '+esc(String(w.work_date))+(w.status==='active'?' <span class="gps-live-pill">в пути</span>':'')
      +'<div class="v206-map-note">1, 2, 3… — уникальные физические остановки по времени. Одна остановка никогда не засчитывается двум ТТ. Нажатие на номер не двигает карту.</div>'
      +'<div class="v2273213-gps-actions"><button class="btn-secondary" onclick="v2273214GpsFitAll()">🗺 Весь маршрут</button>'
      +'<button class="btn-secondary" onclick="v2273214GpsGoCurrent()">📍 Где менеджер сейчас</button></div>';

    document.getElementById('gps-control-detail').innerHTML=
      v2273214DetailHtml(business,technical,ps,w,displayDistance,points,valid,routeRows,lastAt,lastLat,lastLng,stale,visits);

    const L=await v19LoadLeaflet();
    const mapRoot=document.getElementById('gps-control-map');
    const routeCoords=routeRows.map(p=>[Number(p.lat),Number(p.lng)]);
    const center=routeCoords.length?routeCoords[routeCoords.length-1]:(Number.isFinite(lastLat)&&Number.isFinite(lastLng)?[lastLat,lastLng]:[55.19,30.20]);
    const layer=await v2273214EnsureMap(L,mapRoot,center);
    const routeBounds=[];

    segments.forEach(seg=>{
      const coords=seg.map(p=>[Number(p.lat),Number(p.lng)]);
      if(coords.length>1){
        L.polyline(coords,{color:'#ffffff',weight:9,opacity:.92,lineCap:'round',lineJoin:'round',interactive:false}).addTo(layer);
        L.polyline(coords,{color:'#1666d3',weight:5,opacity:.95,lineCap:'round',lineJoin:'round',interactive:false}).addTo(layer);
      }
      coords.forEach(c=>routeBounds.push(c));
    });

    if(routeCoords.length){
      const first=routeRows[0],last=routeRows[routeRows.length-1];
      L.circleMarker([Number(first.lat),Number(first.lng)],{radius:7,color:'#ffffff',weight:3,fillColor:'#16a34a',fillOpacity:1})
        .addTo(layer).bindPopup('<b>Начало рабочего дня</b><br>'+v19Time(first.recorded_at||w.started_at),{autoPan:false});
      const lm=L.circleMarker([Number(last.lat),Number(last.lng)],{radius:9,color:'#ffffff',weight:3,fillColor:w.status==='active'?(stale?'#dc2626':'#ef4444'):'#111827',fillOpacity:1})
        .addTo(layer).bindPopup('<b>'+(w.status==='active'?'МПП сейчас':'Завершение маршрута')+'</b><br>'+v19Age(last.recorded_at),{autoPan:false});
      lm.bindTooltip(w.status==='active'?(stale?'Последняя точка · GPS не обновлялся':'МПП сейчас'):'Конец маршрута',{permanent:true,direction:'top',offset:[0,-9],className:'v206-now-label'});
    }else if(Number.isFinite(lastLat)&&Number.isFinite(lastLng)){
      L.circleMarker([lastLat,lastLng],{radius:9,color:'#ffffff',weight:3,fillColor:'#ef4444',fillOpacity:1})
        .addTo(layer).bindTooltip('Последняя известная точка',{permanent:true,direction:'top',className:'v206-now-label'});
      routeBounds.push([lastLat,lastLng]);
    }

    // Business marker is placed at the REAL physical GPS stop, not at a client's guessed coordinate.
    business.forEach(x=>{
      let cls='warn';
      if(x.kind==='client')cls=x.confidence==='high'?(x.visitSaved?'high':'warn'):'medium';
      const icon=L.divIcon({
        className:'',
        html:'<div class="v2273214-marker '+cls+'">'+x.actualNo+'</div>',
        iconSize:[34,34],iconAnchor:[17,17]
      });
      const marker=L.marker([x.lat,x.lng],{icon,zIndexOffset:900+x.actualNo}).addTo(layer);
      marker.bindTooltip('№'+x.actualNo+' · '+v2273214StopHeading(x),{direction:'top',offset:[0,-11],sticky:true});
      marker.on('click',()=>v2273214SelectStop(x.id)); // NO popup, NO pan
      routeBounds.push([x.lat,x.lng]);
    });

    // Planned but not physically assigned points stay small and secondary.
    const assignedClientIds=new Set(business.filter(x=>x.client?.id).map(x=>String(x.client.id)));
    plans.forEach(r=>{
      const c=r.client_id?(allClients||[]).find(x=>String(x.id)===String(r.client_id)):matchClientByName(r.client_name||'');
      if(!c||assignedClientIds.has(String(c.id)))return;
      const gf=clientGeofence(c);if(!gf)return;
      const icon=L.divIcon({className:'',html:'<div class="v2273214-plan-marker">П</div>',iconSize:[22,22],iconAnchor:[11,11]});
      L.marker([Number(gf.lat),Number(gf.lng)],{icon,zIndexOffset:150}).addTo(layer)
        .bindTooltip('План: '+c.name,{direction:'top',sticky:true});
    });

    // Technical physical stops are secondary and never numbered.
    technical.filter(x=>x.mins>=5).forEach(x=>{
      L.circle([x.lat,x.lng],{radius:35,color:'#94a3b8',weight:1,fillColor:'#94a3b8',fillOpacity:.08,interactive:false}).addTo(layer);
    });

    window._v2273214GpsBounds=routeBounds.slice();
    window._v2273214GpsLast=Number.isFinite(lastLat)&&Number.isFinite(lastLng)?{lat:lastLat,lng:lastLng}:null;

    // First open / another workday: fit once. 30-second refresh: never change viewport.
    const changedWorkday=String(window._v2273214MapWorkdayId||'')!==String(id);
    window._v2273214MapWorkdayId=String(id);
    if(changedWorkday||!silent){
      if(routeBounds.length>1)v19GpsMap.fitBounds(routeBounds,{padding:[35,35],maxZoom:16});
      else if(routeBounds.length===1)v19GpsMap.setView(routeBounds[0],16);
    }
    setTimeout(()=>{try{v19GpsMap?.invalidateSize();}catch(_){ }},80);

    // Preserve selected TT card after refresh without touching map.
    if(window._v2273214SelectedStopKey)window.v2273214SelectStop(window._v2273214SelectedStopKey);

  }catch(e){
    console.error('GPS physical stops truth error',e);
    if(!silent)alert('Не удалось открыть маршрут: '+(e.message||e));
  }
}

const _v19GoPageBase=goPage;
goPage=function(p,title){
  if(p==='gps-control'&&v2273223GpsControllerAllowed())v19GpsControllerAccess=true;
  if(p==='gps-control'&&!v19GpsControllerAccess){alert('Детальный GPS-контроль доступен только Паюшину и Сидаровичу.');return;}
  _v19GoPageBase(p,title);
  if(p==='workday')crmSchedulePageHook('workday',()=>v19RenderManagerWorkday(),0);
  if(p==='gps-control')crmSchedulePageHook('gps-control',()=>v19RenderGpsControl(true),0);
};
const _v19BuildDashboardBase=buildDashboard;
buildDashboard=function(){
  _v19BuildDashboardBase();

  // GPS initializes INSIDE its original module only.
  // No wrapping of ULTRA FAST loadData/goPage/Data Hub is added.
  if(currentProfile?.role==='boss'){
    if(v2273223GpsControllerAllowed()){
      v19GpsControllerAccess=true;
      v19ApplyGpsMenus(); // show immediately
      setTimeout(async()=>{
        try{await v19LoadGpsAccess();v19ApplyGpsMenus();}catch(_){}
      },0);
    }else{
      v19GpsControllerAccess=false;
      v19ApplyGpsMenus();
    }
  }else if(currentProfile?.role==='manager'){
    v19ApplyGpsMenus();
    setTimeout(async()=>{
      try{
        await v19LoadMyWorkday();
        v19ApplyGpsMenus();
        v19RenderWorkdayCard();
      }catch(_){}
    },0);
  }
};
const _v19LoadDataBase=loadData;
loadData=async function(){await _v19LoadDataBase();await Promise.all([v19LoadGpsAccess(),v19LoadMyWorkday()]);v19ApplyGpsMenus();};
const _v19DoLogoutBase=doLogout;
doLogout=async function(){if(currentProfile?.role==='manager'&&v19MyWorkday){alert('Сначала завершите рабочий день, чтобы GPS-маршрут корректно остановился.');return;}return _v19DoLogoutBase();};

document.addEventListener('visibilitychange',async()=>{if(document.visibilityState==='visible'&&currentProfile?.role==='manager'){await v19NativeStatus();await v19LoadMyWorkday();v19RenderWorkdayCard();}});
setInterval(async()=>{
  if(!currentProfile)return;
  if(currentProfile.role==='manager'&&v19MyWorkday){await v19RenderManagerWorkday();v19RenderWorkdayCard();}
  if(v19GpsControllerAccess&&document.getElementById('page-gps-control')?.classList.contains('active'))await v19RenderGpsControl(false);
},30000);
window.RESANTA_WORKDAY_GPS=Object.freeze({
  version:'19.0.1-v22.7.32.2.3',
  intervalSeconds:30,
  minDistanceMeters:50,
  controllers:['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru'],
  gpsInitScopedToNativeModule:true
});

/* ===== ORIGINAL INLINE SCRIPT 5 ===== */
// ============================================================================
// RESANTA CRM v20 · падающие клиенты + поступления денег из 1С
// Все суммы продаж и падения считаются С НДС.
// ============================================================================
let allCashReceipts=[];
let v20FallingRows=[];
let v20UiReady=false;

function v20InstallUi(){
  if(v20UiReady)return;v20UiReady=true;
  const salesNav=document.getElementById('nav-sales');
  if(salesNav&&!document.getElementById('nav-falling')){
    salesNav.insertAdjacentHTML('afterend','<button class="nav-item" id="nav-falling" onclick="goPage(\'falling\',\'Падающие клиенты\')"><span class="icon">📉</span> Падающие клиенты <span class="alert-dot" id="falling-alert-dot" style="display:none"></span></button><button class="nav-item" id="nav-payments" onclick="goPage(\'payments\',\'Поступления денег\')"><span class="icon">💳</span> Поступления</button>');
  }
  const salesPage=document.getElementById('page-sales');
  if(salesPage&&!document.getElementById('page-falling')){
    salesPage.insertAdjacentHTML('afterend',`<div class="page" id="page-falling">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px"><div><div class="page-title" style="margin-bottom:3px">📉 Падающие клиенты</div><div style="font-size:12px;color:var(--sub)">Сравнение одинаковых календарных периодов текущего и прошлого года. Продажи — с НДС.</div></div><button class="btn-primary" onclick="renderFallingClients()">↻ Пересчитать</button></div>
      <div id="falling-freshness"></div>
      <div class="card" style="margin-bottom:12px"><div class="v20-filter-grid">
        <div><label class="form-label">Период</label><select id="falling-period-mode" class="form-input" onchange="v20FallingPeriodChanged()"><option value="ytd_full">С начала года по последний полный месяц</option><option value="ytd_selected">С начала года включая выбранный месяц</option><option value="month">Один выбранный месяц</option></select></div>
        <div><label class="form-label">До месяца / месяц</label><input id="falling-end-month" type="month" class="form-input" onchange="renderFallingClients()"></div>
        <div id="falling-manager-wrap"><label class="form-label">Менеджер</label><select id="falling-manager" class="form-input" onchange="renderFallingClients()"><option value="all">Все менеджеры</option></select></div>
        <div><label class="form-label">Снижение</label><select id="falling-severity" class="form-input" onchange="renderFallingClients()"><option value="all">Любое падение</option><option value="critical">Критично: от 30%</option><option value="action">15–29,9%</option><option value="watch">до 15%</option></select></div>
        <div><label class="form-label">Поиск клиента</label><input id="falling-search" class="form-input" placeholder="Название, регион" oninput="renderFallingClients()"></div>
      </div></div>
      <div class="kpi-row" id="falling-kpi"></div><div id="falling-period-note"></div><div id="falling-list"></div>
    </div>
    <div class="page" id="page-payments">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px"><div><div class="page-title" style="margin-bottom:3px">💳 Поступления денег</div><div style="font-size:12px;color:var(--sub)">Только поступления менеджеров из отчёта 1С.</div></div><button class="btn-primary" onclick="renderPayments()">↻ Обновить</button></div>
      <div id="payments-freshness"></div>
      <div class="card" style="margin-bottom:12px"><div class="v20-filter-grid" style="grid-template-columns:repeat(3,minmax(180px,1fr))">
        <div><label class="form-label">Месяц платежа</label><select id="payments-month" class="form-input" onchange="v2273212PaymentMonthChanged()"></select></div>
        <div><label class="form-label">Период отчёта 1С</label><select id="payments-period" class="form-input" onchange="renderPayments()"></select></div>
        <div id="payments-manager-wrap"><label class="form-label">Менеджер</label><select id="payments-manager" class="form-input" onchange="renderPayments()"><option value="all">Все менеджеры</option></select></div>
        <div><label class="form-label">Поиск</label><input id="payments-search" class="form-input" placeholder="Клиент или документ" oninput="renderPayments()"></div>
      </div></div>
      <div class="kpi-row" id="payments-kpi"></div><div id="payments-list"></div>
    </div>`);
  }
  const bnSales=document.getElementById('bn-sales');
  if(bnSales&&!document.getElementById('bn-falling')){
    bnSales.insertAdjacentHTML('afterend','<button class="bn-item" id="bn-falling" onclick="goPage(\'falling\',\'Падающие клиенты\')">📉<span>Падение</span></button><button class="bn-item" id="bn-payments" onclick="goPage(\'payments\',\'Поступления денег\')">💳<span>Оплаты</span></button>');
  }
}

function v20Months(){return [...new Set((allPurchaseHistory||[]).map(r=>String(r.month||'').slice(0,7)).filter(m=>/^\d{4}-\d{2}$/.test(m)))].sort();}
function v20MonthMinusYear(m){const x=String(m||'').match(/^(\d{4})-(\d{2})$/);return x?(Number(x[1])-1)+'-'+x[2]:'';}
function v20MonthRange(start,end){const out=[];let cur=start;while(cur&&cur<=end&&out.length<24){out.push(cur);cur=abcMonthShift(cur,1);}return out;}
function v20DefaultEndMonth(){const months=v20Months();return months.length?months[months.length-1]:TODAY.slice(0,7);}
function v20FallingPeriod(){
  const mode=document.getElementById('falling-period-mode')?.value||'ytd_full';
  let end=document.getElementById('falling-end-month')?.value||v20DefaultEndMonth();
  if(mode==='ytd_full'&&end===TODAY.slice(0,7))end=abcMonthShift(end,-1);
  const start=mode==='month'?end:end.slice(0,4)+'-01';
  const current=v20MonthRange(start,end),previous=current.map(v20MonthMinusYear);
  return {mode,start,end,current,previous,label:(mode==='month'?monthLabel(end):monthLabel(start)+' — '+monthLabel(end)),previousLabel:(mode==='month'?monthLabel(v20MonthMinusYear(end)):monthLabel(v20MonthMinusYear(start))+' — '+monthLabel(v20MonthMinusYear(end)))};
}
function v20FallingPeriodChanged(){renderFallingClients();}
function v20Money(v){return fmtMoney(Math.round((Number(v)||0)*100)/100)+' BYN';}
function v20Severity(pct){return pct>=30?'critical':pct>=15?'action':'watch';}
function v20SeverityText(s){return s==='critical'?'Критично':s==='action'?'Требует действия':'Наблюдение';}
function v20ClientTask(c){return allTasks.find(t=>!t.done&&((t.client_id&&String(t.client_id)===String(c.id))||nameLooseMatch(t.client_name,c.name)))||null;}
function v20LastVisit(c){return sortVisitsDesc(allVisits.filter(v=>(v.client_id&&String(v.client_id)===String(c.id))||nameLooseMatch(v.client_name,c.name)))[0]||null;}
function v20ProductLabel(r,g){const sku=abcDisplaySku(r,g);return (sku&&sku!=='—'?sku+' · ':'')+(r.product||'Без наименования');}
function v20LostBreakdown(c,currentMonths,previousMonths){
  const hist=getClientHistFast(c),curSet=new Set(currentMonths),prevSet=new Set(previousMonths),cat=new Map(),products=new Map();
  const addCat=(r,side)=>{const k=String(r.category||'Без группы').trim();if(!cat.has(k))cat.set(k,{name:k,cur:0,prev:0});cat.get(k)[side]+=Number(r.revenue)||0;};
  const addProd=(r,side)=>{const g=abcCanonicalGroup(r.category)||String(r.category||'Без группы').trim(),k=g+'|'+abcSkuKey(r,g);if(!products.has(k))products.set(k,{key:k,group:g,label:v20ProductLabel(r,g),cur:0,prev:0,abc:''});products.get(k)[side]+=Number(r.revenue)||0;};
  hist.forEach(r=>{const m=String(r.month||'').slice(0,7);if(curSet.has(m)){addCat(r,'cur');addProd(r,'cur');}if(prevSet.has(m)){addCat(r,'prev');addProd(r,'prev');}});
  try{abcAggregate(abcRowsFor('client',c.manager_name||'all',c.id,previousMonths,'all')).forEach(g=>g.items.forEach(x=>{const p=products.get(g.group+'|'+x.key);if(p)p.abc=x.class;}));}catch(e){console.warn('ABC потерянных товаров не рассчитан',e);}
  const cats=[...cat.values()].map(x=>({...x,loss:x.prev-x.cur})).filter(x=>x.prev>0&&x.loss>0.01).sort((a,b)=>b.loss-a.loss);
  const items=[...products.values()].map(x=>({...x,loss:x.prev-x.cur})).filter(x=>x.prev>0&&x.loss>0.01).sort((a,b)=>b.loss-a.loss);
  return {cats,items};
}
function v20ComputeFalling(){
  const period=v20FallingPeriod(),boss=currentProfile?.role==='boss',me=currentProfile?.name||'',mgr=document.getElementById('falling-manager')?.value||'all';
  const clients=allClients.filter(c=>boss?(mgr==='all'||c.manager_name===mgr):c.manager_name===me),rows=[];
  clients.forEach(c=>{const hist=getClientHistFast(c),curSet=new Set(period.current),prevSet=new Set(period.previous);let cur=0,prev=0,last='';hist.forEach(r=>{const m=String(r.month||'').slice(0,7),rev=Number(r.revenue)||0;if(curSet.has(m)){cur+=rev;if(rev>0&&m>last)last=m;}if(prevSet.has(m))prev+=rev;});if(prev<=0||cur>=prev-0.01)return;const loss=prev-cur,pct=loss/prev*100,breakdown=v20LostBreakdown(c,period.current,period.previous);rows.push({client:c,cur,prev,loss,pct,severity:v20Severity(pct),breakdown,lastSale:last,task:v20ClientTask(c),visit:v20LastVisit(c)});});
  rows.sort((a,b)=>b.loss-a.loss||b.pct-a.pct);v20FallingRows=rows;return {period,rows};
}
function v20AbcPill(c){if(!c)return'';const cls=String(c).toUpperCase();return '<span class="v20-pill v20-pill-'+(cls==='A'?'a':cls==='B'?'b':cls==='R'?'r':'c')+'">'+esc(cls)+'</span>';}
function v20OpenTaskForFalling(id){if(currentProfile?.role!=='boss')return;const row=v20FallingRows.find(x=>String(x.client.id)===String(id));if(!row)return;openAddTask();selectTaskClient(String(row.client.id),row.client.name);const el=document.getElementById('nt-text');if(el)el.value='Восстановить продажи клиента. Текущий период: '+v20Money(row.cur)+', аналогичный период прошлого года: '+v20Money(row.prev)+', падение: '+row.pct.toFixed(1)+'% ('+v20Money(row.loss)+'). Проработать потерянные группы и позиции A/B по ABC.';}
function v20FallingCard(x){const c=x.client,sev=x.severity,cats=x.breakdown.cats.slice(0,8),items=x.breakdown.items.slice(0,12);return '<div class="card v20-fall-card '+sev+'" style="margin-bottom:12px"><div class="v20-fall-head"><div><div style="font-size:16px;font-weight:800;cursor:pointer" onclick="openClient(\''+c.id+'\')">'+esc(c.name)+'</div><div style="font-size:11px;color:var(--sub);margin-top:4px">👤 '+esc(c.manager_name||'—')+' · '+esc(c.region||'—')+' · '+v20SeverityText(sev)+'</div></div><div style="text-align:right"><div class="v20-money-bad">−'+v20Money(x.loss)+'</div><div style="font-size:12px;color:var(--r)">−'+x.pct.toFixed(1)+'%</div></div></div><div class="kpi-row" style="margin-top:10px"><div class="kpi"><div class="kpi-label">Текущий период</div><div class="kpi-value" style="font-size:18px">'+fmtMoney(x.cur)+'</div><div class="kpi-sub">BYN с НДС</div></div><div class="kpi"><div class="kpi-label">Прошлый год</div><div class="kpi-value" style="font-size:18px">'+fmtMoney(x.prev)+'</div><div class="kpi-sub">BYN · тот же период</div></div><div class="kpi"><div class="kpi-label">Последняя продажа</div><div class="kpi-value" style="font-size:17px">'+(x.lastSale?monthLabel(x.lastSale):'—')+'</div></div><div class="kpi"><div class="kpi-label">Последний визит</div><div class="kpi-value" style="font-size:17px">'+(x.visit?esc(String(x.visit.date||x.visit.created_at||'').slice(0,10)):'—')+'</div></div></div><details style="margin-top:10px"><summary style="cursor:pointer;font-weight:700;color:var(--a)">Показать потерянные группы и товары</summary><div class="v20-detail-grid" style="margin-top:10px"><div><div class="card-title">Группы с падением</div><table class="v20-mini-table"><thead><tr><th>Группа</th><th>Было</th><th>Стало</th><th>Потеря</th></tr></thead><tbody>'+cats.map(g=>'<tr><td>'+esc(g.name)+'</td><td>'+fmtMoney(g.prev)+'</td><td>'+fmtMoney(g.cur)+'</td><td class="bad">−'+fmtMoney(g.loss)+'</td></tr>').join('')+'</tbody></table></div><div><div class="card-title">Товары с потерей</div><table class="v20-mini-table"><thead><tr><th>ABC</th><th>Товар</th><th>Потеря</th></tr></thead><tbody>'+items.map(p=>'<tr><td>'+v20AbcPill(p.abc)+'</td><td>'+esc(p.label)+'<div style="font-size:10px;color:var(--sub)">'+esc(p.group)+'</div></td><td class="bad">−'+fmtMoney(p.loss)+'</td></tr>').join('')+'</tbody></table></div></div></details><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn-secondary" onclick="openClient(\''+c.id+'\')">Открыть клиента</button><button class="btn-secondary" onclick="openABCForClient(\''+c.id+'\')">Открыть ABC</button>'+(currentProfile?.role==='boss'?'<button class="btn-primary" onclick="v20OpenTaskForFalling(\''+c.id+'\')">Поставить задачу</button>':'')+(x.task?'<span class="tag tag-v" style="align-self:center">Задача уже есть: '+esc(String(x.task.text||'').slice(0,70))+'</span>':'<span class="tag tag-r" style="align-self:center">Активной задачи нет</span>')+'</div></div>';}
function renderFallingClients(){
  v20InitFilters();const fresh=document.getElementById('falling-freshness');if(fresh)fresh.innerHTML=salesFreshnessBanner();const data=v20ComputeFalling(),sev=document.getElementById('falling-severity')?.value||'all',q=abcNorm(document.getElementById('falling-search')?.value||'');let rows=data.rows.filter(x=>(sev==='all'||x.severity===sev)&&(!q||abcNorm(x.client.name+' '+x.client.region+' '+x.client.manager_name).includes(q)));const loss=rows.reduce((s,x)=>s+x.loss,0),without=rows.filter(x=>!x.task).length,critical=rows.filter(x=>x.severity==='critical').length;document.getElementById('falling-kpi').innerHTML='<div class="kpi"><div class="kpi-label">Падающих клиентов</div><div class="kpi-value bad">'+rows.length+'</div></div><div class="kpi"><div class="kpi-label">Потеря оборота</div><div class="kpi-value bad" style="font-size:18px">'+fmtMoney(loss)+'</div><div class="kpi-sub">BYN с НДС</div></div><div class="kpi"><div class="kpi-label">Критичных</div><div class="kpi-value bad">'+critical+'</div></div><div class="kpi"><div class="kpi-label">Без активной задачи</div><div class="kpi-value '+(without?'warn':'ok')+'">'+without+'</div></div>';document.getElementById('falling-period-note').innerHTML='<div class="v20-period-warning">Сравнение: <b>'+esc(data.period.label)+'</b> против <b>'+esc(data.period.previousLabel)+'</b>. История 1С хранится по календарным месяцам. Если клиент восстановил продажи или вышел в рост, он автоматически исчезает из активного списка.</div>';document.getElementById('falling-list').innerHTML=rows.length?rows.map(v20FallingCard).join(''):'<div class="card" style="text-align:center;color:var(--sub);padding:24px">По выбранным фильтрам падающих клиентов нет. Клиенты с ростом автоматически не показываются.</div>';v20UpdateFallingDot();}
function v20UpdateFallingDot(){const dot=document.getElementById('falling-alert-dot');if(!dot||!currentProfile)return;try{const count=v20ComputeFalling().rows.length;dot.style.display=count?'inline-block':'none';}catch(e){dot.style.display='none';}}
function v20DashboardFalling(){const root=document.getElementById('dash-kpi');if(!root||!currentProfile)return;document.getElementById('v20-dash-falling')?.remove();try{const d=v20ComputeFalling(),loss=d.rows.reduce((s,x)=>s+x.loss,0);root.insertAdjacentHTML('beforeend','<div class="kpi" id="v20-dash-falling" style="cursor:pointer" onclick="goPage(\'falling\',\'Падающие клиенты\')"><div class="kpi-label">📉 Падающие клиенты</div><div class="kpi-value '+(d.rows.length?'bad':'ok')+'">'+d.rows.length+'</div><div class="kpi-sub">потеря '+fmtMoney(loss)+' BYN</div></div>');}catch(e){console.warn(e);}}

function v20ReceiptPeriods(){const map=new Map();(allCashReceipts||[]).forEach(r=>{const k=String(r.period_start||'').slice(0,10)+'|'+String(r.period_end||'').slice(0,10);if(!map.has(k))map.set(k,{key:k,start:String(r.period_start||'').slice(0,10),end:String(r.period_end||'').slice(0,10)});});return [...map.values()].sort((a,b)=>b.start.localeCompare(a.start));}
function v20InitFilters(){
  v20InstallUi();const end=document.getElementById('falling-end-month');if(end&&!end.value)end.value=v20DefaultEndMonth();
  const mgrs=[...new Set(allUsers.filter(u=>isFieldManagerUser(u)&&u.name).map(u=>u.name))].sort((a,b)=>a.localeCompare(b,'ru'));
  ['falling-manager','payments-manager'].forEach(id=>{const el=document.getElementById(id);if(el&&el.options.length<=1)mgrs.forEach(n=>el.insertAdjacentHTML('beforeend','<option value="'+escAttr(n)+'">'+esc(n)+'</option>'));});
  const boss=currentProfile?.role==='boss';const fw=document.getElementById('falling-manager-wrap'),pw=document.getElementById('payments-manager-wrap');if(fw)fw.style.display=boss?'block':'none';if(pw)pw.style.display=boss?'block':'none';if(!boss){const f=document.getElementById('falling-manager'),p=document.getElementById('payments-manager');if(f)f.value=currentProfile?.name||'all';if(p)p.value=currentProfile?.name||'all';}
  const periods=v20ReceiptPeriods(),sel=document.getElementById('payments-period');if(sel){const old=sel.value;sel.innerHTML=periods.map(p=>'<option value="'+escAttr(p.key)+'">'+esc(p.start)+' — '+esc(p.end)+'</option>').join('');if(old&&periods.some(p=>p.key===old))sel.value=old;}
}
function v20PaymentsFreshness(){const st=crmImportStatus('payments');if(!st)return '<div class="v20-period-warning">Поступления ещё не загружены. Настройте отправку отчёта 1С с темой «Поступление денег для CRM» и запустите GitHub Action.</div>';const bad=st.status==='error';return '<div style="padding:10px 12px;border-radius:9px;background:'+(bad?'var(--rb)':'var(--gb)')+';color:'+(bad?'var(--r)':'var(--g)')+';font-size:12px;margin-bottom:12px">'+(bad?'⚠️':'✅')+' Последняя загрузка поступлений: <b>'+crmDateTime(st.last_success_at)+'</b> · период: <b>'+esc(st.report_period||'—')+'</b> · документов: <b>'+(st.row_count??'—')+'</b>'+(bad?'<br>'+esc(st.error_text||'Ошибка импорта'):'')+'</div>';}
function v20ReceiptDate(v){if(!v)return'—';try{return new Date(v).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(e){return esc(String(v));}}
function renderPayments(){
  v20InitFilters();const fresh=document.getElementById('payments-freshness');if(fresh)fresh.innerHTML=v20PaymentsFreshness();const period=document.getElementById('payments-period')?.value||'',mgr=document.getElementById('payments-manager')?.value||'all',q=abcNorm(document.getElementById('payments-search')?.value||'');let rows=(allCashReceipts||[]).filter(r=>(!period||(String(r.period_start).slice(0,10)+'|'+String(r.period_end).slice(0,10))===period)&&(mgr==='all'||r.manager_name===mgr)&&(!q||abcNorm(r.client_name+' '+r.document_number+' '+r.manager_name).includes(q)));rows.sort((a,b)=>String(b.document_at||'').localeCompare(String(a.document_at||'')));const total=rows.reduce((s,r)=>s+(Number(r.amount)||0),0),clients=new Set(rows.map(r=>r.client_id||abcNorm(r.client_name))),docs=new Set(rows.map(r=>r.manager_name+'|'+r.client_name+'|'+r.document_number+'|'+r.document_at)),latest=rows[0]?.document_at;document.getElementById('payments-kpi').innerHTML='<div class="kpi"><div class="kpi-label">Поступило</div><div class="kpi-value ok">'+fmt(total)+'</div><div class="kpi-sub">BYN</div></div><div class="kpi"><div class="kpi-label">Клиентов оплатили</div><div class="kpi-value">'+clients.size+'</div></div><div class="kpi"><div class="kpi-label">Документов</div><div class="kpi-value">'+docs.size+'</div></div><div class="kpi"><div class="kpi-label">Последний платёж</div><div class="kpi-value" style="font-size:16px">'+v20ReceiptDate(latest)+'</div></div>';
  const byMgr=new Map();rows.forEach(r=>{if(!byMgr.has(r.manager_name))byMgr.set(r.manager_name,[]);byMgr.get(r.manager_name).push(r);});const html=[...byMgr.entries()].sort((a,b)=>a[0].localeCompare(b[0],'ru')).map(([manager,mrows])=>{const byClient=new Map();mrows.forEach(r=>{const k=r.client_id||abcNorm(r.client_name);if(!byClient.has(k))byClient.set(k,{name:r.client_name,id:r.client_id,rows:[]});byClient.get(k).rows.push(r);});const mtotal=mrows.reduce((s,r)=>s+(Number(r.amount)||0),0);return '<div class="card v20-payment-manager"><div class="v20-fall-head"><div class="card-title" style="margin:0">👤 '+esc(manager)+'</div><div style="font-size:18px;font-weight:800;color:var(--g)">'+fmt(mtotal)+' BYN</div></div>'+[...byClient.values()].sort((a,b)=>b.rows.reduce((s,r)=>s+Number(r.amount||0),0)-a.rows.reduce((s,r)=>s+Number(r.amount||0),0)).map(c=>{const ctotal=c.rows.reduce((s,r)=>s+(Number(r.amount)||0),0);return '<details class="v20-payment-client"><summary><span><b>'+esc(c.name)+'</b><span style="font-size:10px;color:var(--sub);margin-left:6px">'+c.rows.length+' док.</span></span><span style="font-weight:800;color:var(--g)">'+fmt(ctotal)+' BYN</span></summary><div class="v20-payment-docs"><table class="v20-mini-table"><thead><tr><th>Дата</th><th>Документ</th><th>Сумма</th></tr></thead><tbody>'+c.rows.map(r=>'<tr><td>'+v20ReceiptDate(r.document_at)+'</td><td>'+esc(r.document_number)+'<div style="font-size:10px;color:var(--sub)">'+esc(r.document_type||'Поступление')+'</div></td><td style="font-weight:700">'+fmt(r.amount)+' BYN</td></tr>').join('')+'</tbody></table>'+(c.id?'<button class="btn-secondary" style="margin-top:8px" onclick="openClient(\''+c.id+'\')">Открыть клиента</button>':'')+'</div></details>';}).join('')+'</div>';}).join('');document.getElementById('payments-list').innerHTML=html||'<div class="card" style="text-align:center;color:var(--sub);padding:24px">За выбранный период поступлений менеджеров нет.</div>';}

let v22722PaymentsLoaded=false,v22722PaymentsPromise=null;async function v22722EnsurePayments(){if(v22722PaymentsLoaded)return true;if(v22722PaymentsPromise)return v22722PaymentsPromise;v22722PaymentsPromise=(async()=>{try{allCashReceipts=await loadAllRows('cash_receipts_1c');v22722PaymentsLoaded=true;return true;}catch(e){console.warn('Поступления не загрузились',e);allCashReceipts=[];return false;}finally{v22722PaymentsPromise=null;}})();return v22722PaymentsPromise;}
window.crmPrefetchPaymentsV22734=()=>v22722EnsurePayments();
const _v20LoadDataBase=loadData;loadData=async function(){await _v20LoadDataBase();allCashReceipts=[];v22722PaymentsLoaded=false;v20InitFilters();v20UpdateFallingDot();};
const _v20GoPageBase=goPage;goPage=function(p,title){_v20GoPageBase(p,title);if(p==='falling')crmSchedulePageHook('falling',()=>renderFallingClients(),0);if(p==='payments')crmSchedulePageHook('payments',async()=>{const root=document.getElementById('payments-list');if(root&&!v22722PaymentsLoaded)root.innerHTML='<div class="card" style="color:var(--sub);padding:18px">Загружаю поступления…</div>';await v22722EnsurePayments();if(crmActivePage()==='payments')renderPayments();},0);};
const _v20BuildDashboardBase=buildDashboard;buildDashboard=function(){_v20BuildDashboardBase();v20DashboardFalling();};
v20InstallUi();
window.RESANTA_FALLING_PAYMENTS=Object.freeze({version:'20.0.0',salesWithVat:true});


// ============================================================================
// RESANTA CRM v20.3 · единый бюджет клиента и корректное финальное согласование
// Исправляет две причины ложной блокировки:
// 1) бюджет одного клиента мог быть разбит на несколько записей;
// 2) расход текущей акции вычитался из остатка, а затем её бюджет проверялся повторно.
function v203BudgetClientKey(x){
  const id=String(x?.client_id||'').trim();
  return id?'id:'+id:'name:'+promoNorm(x?.client_name||'');
}
function v203BudgetRowsForClient(clientId,clientName){
  const probe={client_id:clientId,client_name:clientName};
  const key=v203BudgetClientKey(probe);
  return allPromotionBudgets.filter(b=>v203BudgetClientKey(b)===key);
}
function v203PromotionLinkedExpense(promotionId){
  return allPromotionBudgetMovements
    .filter(x=>x.movement_type==='expense'&&String(x.promotion_id||'')===String(promotionId||''))
    .reduce((s,x)=>s+promoNum(x.amount),0);
}
function v203PromotionSpent(p){
  if(!p)return 0;
  const linked=v203PromotionLinkedExpense(p.id);
  return linked>0?linked:Math.max(0,promoNum(p.actual_spend));
}

// Итог конкретной записи бюджета. При excludePromotionId полностью исключаем
// и расход, и резерв текущей акции, чтобы узнать остаток ДО этой акции.
promoBudgetSummary=function(b,excludePromotionId){
  if(!b)return{opening:0,accrued:0,adjustments:0,total:0,spent:0,reserved:0,free:0,movements:[]};
  const bid=String(b.id),excluded=String(excludePromotionId||'');
  const moves=allPromotionBudgetMovements.filter(x=>String(x.budget_id)===bid);
  const accrued=moves.filter(x=>x.movement_type==='accrual').reduce((s,x)=>s+promoNum(x.amount),0);
  const adjustments=moves.filter(x=>x.movement_type==='adjustment').reduce((s,x)=>s+promoNum(x.amount),0);
  const movementSpent=moves
    .filter(x=>x.movement_type==='expense'&&(!excluded||String(x.promotion_id||'')!==excluded))
    .reduce((s,x)=>s+promoNum(x.amount),0);
  const promos=allPromotions.filter(p=>String(p.budget_id)===bid&&String(p.id)!==excluded&&p.status!=='rejected');
  const legacySpent=promos.reduce((sum,p)=>{
    const linked=v203PromotionLinkedExpense(p.id);
    return sum+(linked>0?0:Math.max(0,promoNum(p.actual_spend)));
  },0);
  const spent=movementSpent+legacySpent;
  const reserved=promos.filter(p=>['approved','in_work'].includes(p.status)).reduce((sum,p)=>{
    const already=v203PromotionSpent(p);
    return sum+Math.max(0,promoNum(p.budget_reserved)-already);
  },0);
  const opening=promoBudgetOpening(b),total=opening+accrued+adjustments;
  return{opening,accrued,adjustments,total,spent,reserved,free:total-spent-reserved,movements:moves};
};

// Общий кошелёк клиента: все его бюджетные записи считаются вместе.
function promoClientBudgetSummary(clientId,excludePromotionId,clientName){
  const rows=v203BudgetRowsForClient(clientId,clientName);
  const parts=rows.map(b=>promoBudgetSummary(b,excludePromotionId));
  return{
    rows,
    opening:parts.reduce((s,x)=>s+x.opening,0),
    accrued:parts.reduce((s,x)=>s+x.accrued,0),
    adjustments:parts.reduce((s,x)=>s+x.adjustments,0),
    total:parts.reduce((s,x)=>s+x.total,0),
    spent:parts.reduce((s,x)=>s+x.spent,0),
    reserved:parts.reduce((s,x)=>s+x.reserved,0),
    free:parts.reduce((s,x)=>s+x.free,0),
    movements:parts.flatMap(x=>x.movements)
  };
}
function v203CanonicalBudget(p){
  const rows=v203BudgetRowsForClient(p?.client_id,p?.client_name);
  return rows.find(b=>String(b.id)===String(p?.budget_id||''))||rows.sort((a,b)=>String(b.period_end||'').localeCompare(String(a.period_end||'')))[0]||null;
}

fillPromotionBudgetOptions=function(clientId,selected){
  const sel=document.getElementById('promotion-budget-id');if(!sel)return;
  const client=allClients.find(c=>String(c.id)===String(clientId));
  const rows=v203BudgetRowsForClient(clientId,client?.name||'');
  const chosen=rows.find(b=>String(b.id)===String(selected||''))||rows[0]||null;
  if(!chosen){sel.innerHTML='<option value="">Бюджет клиента не внесён</option>';promotionBudgetChanged();return;}
  const x=promoClientBudgetSummary(clientId,document.getElementById('promotion-id')?.value,client?.name||chosen.client_name);
  const start=rows.map(b=>b.period_start).filter(Boolean).sort()[0]||chosen.period_start;
  const end=rows.map(b=>b.period_end).filter(Boolean).sort().slice(-1)[0]||chosen.period_end;
  sel.innerHTML='<option value="'+chosen.id+'" selected>'+start+' — '+end+' · общий остаток '+fmt(x.free)+' BYN</option>';
  promotionBudgetChanged();
};

promotionBudgetChanged=function(){
  const el=document.getElementById('promotion-budget-available'),id=document.getElementById('promotion-budget-id')?.value;
  const b=allPromotionBudgets.find(x=>String(x.id)===String(id));if(!el)return;
  if(!b){el.innerHTML='<span style="color:var(--r)">У клиента ещё нет бюджета</span>';return;}
  const currentId=document.getElementById('promotion-id')?.value||null;
  const x=promoClientBudgetSummary(b.client_id,currentId,b.client_name);
  el.innerHTML='<div class="promo-warning"><b>'+esc(b.client_name)+'</b><br>Общий бюджет клиента: <b>'+fmt(x.total)+' BYN</b> · другие расходы: <b>'+fmt(x.spent)+' BYN</b> · другой резерв: <b>'+fmt(x.reserved)+' BYN</b> · свободно до этой акции: <b style="color:'+(x.free<0?'var(--r)':'var(--g)')+'">'+fmt(x.free)+' BYN</b></div>';
};

// Не создаём вторую карточку бюджета одного клиента. Дополнительные суммы
// вносятся через «Начисление», а стартовый остаток редактируется в существующей карточке.
const _v203SavePromotionBudgetBase=savePromotionBudget;
savePromotionBudget=async function(){
  const id=document.getElementById('promotion-budget-edit-id')?.value||'';
  const clientId=document.getElementById('promotion-budget-client')?.value||'';
  if(!id&&clientId){
    const c=allClients.find(x=>String(x.id)===String(clientId));
    const existing=v203BudgetRowsForClient(clientId,c?.name||'')[0];
    if(existing){
      alert('У этого клиента уже есть единый бюджет. Для увеличения используйте «Начисление», для исправления стартового остатка — откройте существующую карточку.');
      closeModal('modal-promotion-budget');
      openBudgetDetail(existing.id);
      return;
    }
  }
  return _v203SavePromotionBudgetBase();
};

// Одна карточка на одного клиента, даже если до запуска SQL ещё остались старые дубли.
renderBudgetsPage=function(){
  const boss=promoIsBoss(),btn=document.getElementById('budgets-create-btn');if(btn)btn.style.display=boss?'inline-flex':'none';
  const q=promoNorm(document.getElementById('budgets-search')?.value||''),mf=document.getElementById('budgets-manager-filter');
  const groupsMap=new Map();
  allPromotionBudgets.forEach(b=>{
    const c=promoClient({client_id:b.client_id,client_name:b.client_name});
    if(!boss&&c?.manager_name!==currentProfile?.name&&b.manager_name!==currentProfile?.name)return;
    const key=v203BudgetClientKey(b);
    if(!groupsMap.has(key))groupsMap.set(key,{key,client_id:b.client_id,client_name:b.client_name,manager_name:b.manager_name||c?.manager_name||'Не назначен',rows:[]});
    groupsMap.get(key).rows.push(b);
  });
  let clients=[...groupsMap.values()];
  if(mf){
    mf.style.display=boss?'inline-block':'none';
    if(boss&&mf.options.length<=1)[...new Set(clients.map(x=>x.manager_name).filter(Boolean))].sort().forEach(n=>mf.insertAdjacentHTML('beforeend','<option value="'+escAttr(n)+'">'+esc(n)+'</option>'));
  }
  const managerFilter=mf?.value||'all';
  clients=clients.filter(x=>(managerFilter==='all'||x.manager_name===managerFilter)&&(!q||promoNorm(x.client_name+' '+x.manager_name).includes(q)));
  clients.forEach(x=>{x.summary=promoClientBudgetSummary(x.client_id,null,x.client_name);x.canonical=x.rows[0];});
  const total=clients.reduce((s,x)=>s+x.summary.total,0),spent=clients.reduce((s,x)=>s+x.summary.spent,0),reserved=clients.reduce((s,x)=>s+x.summary.reserved,0),free=clients.reduce((s,x)=>s+x.summary.free,0);
  document.getElementById('budgets-kpi').innerHTML='<div class="kpi"><div class="kpi-label">Клиентов с бюджетом</div><div class="kpi-value">'+clients.length+'</div></div><div class="kpi"><div class="kpi-label">Общий бюджет</div><div class="kpi-value">'+fmt(total)+'</div><div class="kpi-sub">BYN</div></div><div class="kpi"><div class="kpi-label">Потрачено</div><div class="kpi-value">'+fmt(spent)+'</div></div><div class="kpi"><div class="kpi-label">Зарезервировано</div><div class="kpi-value">'+fmt(reserved)+'</div></div><div class="kpi"><div class="kpi-label">Свободно</div><div class="kpi-value" style="color:'+(free<0?'var(--r)':'var(--g)')+'">'+fmt(free)+'</div></div>';
  const byManager={};clients.forEach(x=>(byManager[x.manager_name]=byManager[x.manager_name]||[]).push(x));
  const names=Object.keys(byManager).sort();
  document.getElementById('budgets-list').innerHTML=names.length?names.map(mn=>{
    const list=byManager[mn],gf=list.reduce((s,x)=>s+x.summary.free,0);
    return '<div class="card" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;align-items:center"><div class="card-title" style="margin:0">👤 '+esc(mn)+' · '+list.length+' клиент(ов)</div><b style="color:'+(gf<0?'var(--r)':'var(--g)')+'">Свободно '+fmt(gf)+' BYN</b></div><div style="margin-top:8px">'+list.sort((a,b)=>String(a.client_name).localeCompare(String(b.client_name),'ru')).map(x=>'<div class="budget-card" onclick="openBudgetDetail(&quot;'+x.canonical.id+'&quot;)" style="cursor:pointer"><div style="display:flex;justify-content:space-between;gap:8px"><b>'+esc(x.client_name)+'</b><span style="color:'+(x.summary.free<0?'var(--r)':'var(--g)')+'">остаток '+fmt(x.summary.free)+' BYN</span></div><div class="budget-metrics"><div class="budget-metric"><div class="budget-metric-label">Общий бюджет</div><div class="budget-metric-value">'+fmt(x.summary.total)+'</div></div><div class="budget-metric"><div class="budget-metric-label">Потрачено</div><div class="budget-metric-value">'+fmt(x.summary.spent)+'</div></div><div class="budget-metric"><div class="budget-metric-label">Резерв</div><div class="budget-metric-value">'+fmt(x.summary.reserved)+'</div></div><div class="budget-metric"><div class="budget-metric-label">Свободно</div><div class="budget-metric-value">'+fmt(x.summary.free)+'</div></div></div>'+(x.rows.length>1?'<div style="font-size:10px;color:var(--am);margin-top:6px">Старые записи бюджета объединяются в один баланс</div>':'')+'</div>').join('')+'</div></div>';
  }).join(''):'<div class="card" style="text-align:center;color:var(--sub);padding:28px">Бюджеты пока не внесены</div>';
};

// Финальное согласование проверяет общий бюджет клиента и не считает расход
// текущей акции второй раз. Уже внесённый расход становится минимальным
// согласованным бюджетом этой акции.
quickPromotionDecision=async function(id,action){
  const p=allPromotions.find(x=>String(x.id)===String(id));if(!p)return;
  const now=new Date().toISOString(),upd={};let stage='',comment='';
  if(action==='submit_manager'){
    if(!promoCanSubmitManager(p)){alert('Подтвердить заявку может только назначенный менеджер.');return;}
    Object.assign(upd,{status:'pending_df',manager_submitted_by:promoActorName(),manager_submitted_at:now,budget_reserved:0,df_approved_by:null,df_approved_at:null,df_comment:null,dfs_approved_by:null,dfs_approved_at:null,dfs_comment:null,approved_by:null,approved_at:null,rejected_by:null,rejected_at:null});stage='manager_submit';
  }else if(action==='approve_df'){
    if(!promoCanFirstApprove(p)){alert('Первый этап может согласовать только ДФ Сидарович.');return;}
    comment=prompt('Комментарий ДФ к согласованию (можно оставить пустым):')||'';
    Object.assign(upd,{status:'pending_dfs',df_approved_by:promoActorName(),df_approved_at:now,df_comment:comment||null,rejected_by:null,rejected_at:null});stage='df';
  }else if(action==='approve_dfs'){
    if(!promoCanFinalApprove(p)){alert('Финальное согласование может выполнить только ДФС Александр Паюшин после согласования ДФ.');return;}
    const b=v203CanonicalBudget(p);
    if(!b){alert('У клиента не внесён бюджет. Сначала внесите общий бюджет клиента.');return;}
    const pool=promoClientBudgetSummary(p.client_id,p.id,p.client_name);
    const requested=Math.max(0,promoNum(p.requested_budget));
    const alreadySpent=v203PromotionSpent(p);
    const approvedAmount=Math.max(requested,alreadySpent);
    if(approvedAmount>pool.free+0.005){
      const shortage=approvedAmount-pool.free;
      alert('Нельзя согласовать: свободно до этой акции '+fmt(pool.free)+' BYN, для акции требуется '+fmt(approvedAmount)+' BYN (запрошено '+fmt(requested)+' BYN, уже внесено расходов '+fmt(alreadySpent)+' BYN). Не хватает '+fmt(shortage)+' BYN.');
      return;
    }
    const correction=alreadySpent>requested?'\nПо акции уже внесено расходов '+fmt(alreadySpent)+' BYN, поэтому согласованный бюджет будет автоматически установлен '+fmt(approvedAmount)+' BYN.':'';
    comment=prompt('Комментарий ДФС к финальному согласованию (можно оставить пустым):'+correction)||'';
    const autoNote=alreadySpent>requested?'Согласованный бюджет увеличен с '+fmt(requested)+' до '+fmt(approvedAmount)+' BYN по уже внесённым расходам.':'';
    const finalComment=[comment.trim(),autoNote].filter(Boolean).join(' ');
    Object.assign(upd,{status:'approved',budget_id:b.id,budget_reserved:approvedAmount,actual_spend:alreadySpent,dfs_approved_by:promoActorName(),dfs_approved_at:now,dfs_comment:finalComment||null,approved_by:promoActorName(),approved_at:now,rejected_by:null,rejected_at:null,manager_accepted_by:null,manager_accepted_at:null});stage='dfs';comment=finalComment;
  }else if(action==='reject'){
    const allowed=promoCanFirstApprove(p)||promoCanFinalApprove(p);if(!allowed){alert('Отклонить заявку может только текущий согласующий.');return;}
    comment=prompt('Причина отклонения:')||'';if(!comment.trim()){alert('Укажите причину отклонения.');return;}
    Object.assign(upd,{status:'rejected',rejected_by:promoActorName(),rejected_at:now,boss_comment:comment,budget_reserved:0});stage=promoCanFirstApprove(p)?'df':'dfs';
  }else if(action==='accept'){
    if(!promoCanAcceptWork(p)){alert('Взять акцию в работу может только назначенный менеджер после финального согласования.');return;}
    Object.assign(upd,{status:'in_work',manager_accepted_by:promoActorName(),manager_accepted_at:now});stage='manager';
  }else{return;}
  const {error}=await db.from('promotions').update(upd).eq('id',id);if(error){alert(error.message);return;}
  await promoApprovalAudit(p,stage,action,comment);
  allPromotions=allPromotions.map(x=>String(x.id)===String(id)?{...x,...upd}:x);
  openPromotionDetail(id);renderPromotions();renderBudgetsPage();
};

window.RESANTA_BUDGET_APPROVAL=Object.freeze({version:'20.3.0',pooledClientBudget:true,excludeCurrentPromotion:true});

/* ===== ORIGINAL INLINE SCRIPT 6 ===== */
// ============================================================================
// RESANTA CRM v20.4 · автообновление падающих клиентов + смена МПП в карточке
// 1) После объединения дублей и изменения закрепления пересчитывает список и KPI.
// 2) При новом импорте продаж проверяет отметку crm_import_status и подгружает
//    свежую purchase_history только когда импорт реально изменился.
// 3) Руководитель может назначить/сменить менеджера в любой карточке клиента.

let v204FallingRefreshBusy=false;
let v204LastSalesStamp='';

function v204StatusStamp(st){
  if(!st)return'';
  return [st.last_success_at||'',st.report_period||'',st.row_count??'',st.status||''].join('|');
}
function v204PageActive(name){
  return !!document.getElementById('page-'+name)?.classList.contains('active');
}
function v204InvalidateFallingCaches(){
  _clientAliasesById=null;
  _phHistIndex=null;_phHistKeys=null;_phHistByClientId=null;
  _clientNameMatchCache=null;_phClientMatchCache=null;_phNameSet=null;
  v20FallingRows=[];
}
function v204RefreshFallingViews(invalidate){
  if(invalidate)v204InvalidateFallingCaches();
  if(!currentProfile)return;
  try{
    if(v204PageActive('falling'))renderFallingClients();
    else v20UpdateFallingDot();
    if(v204PageActive('dashboard'))v20DashboardFalling();
  }catch(e){console.warn('Не удалось обновить показатели падающих клиентов',e);}
}

function v204ManagerOptions(selected){
  const names=[...new Set((allUsers||[])
    .filter(u=>isFieldManagerUser(u)&&String(u.name||'').trim())
    .map(u=>String(u.name).trim()))].sort((a,b)=>a.localeCompare(b,'ru'));
  if(selected&&!names.includes(selected))names.push(selected);
  return '<option value="">Не назначен</option>'+names.map(n=>
    '<option value="'+escAttr(n)+'" '+(n===selected?'selected':'')+'>'+esc(n)+'</option>'
  ).join('');
}

function v204InjectManagerControl(clientId){
  if(currentProfile?.role!=='boss')return;
  const c=allClients.find(x=>String(x.id)===String(clientId));
  const root=document.getElementById('modal-client-content');
  const head=root?.querySelector('.modal-head');
  if(!c||!root||!head)return;
  root.querySelector('[data-v204-manager-control]')?.remove();
  const box=document.createElement('div');
  box.setAttribute('data-v204-manager-control','1');
  box.style.cssText='background:var(--ab);border:1px solid rgba(37,99,235,.22);border-radius:10px;padding:10px 12px;margin:0 0 12px';
  box.innerHTML='<div style="font-size:11px;font-weight:700;color:var(--at);text-transform:uppercase;margin-bottom:6px">👤 Закреплённый менеджер</div>'
    +'<select style="width:100%;padding:9px 10px;border:1px solid var(--a);border-radius:8px;background:#fff;font-size:13px" '
    +'onchange="v204ChangeClientManager(\''+escAttr(String(c.id))+'\',this.value,this)">'+v204ManagerOptions(c.manager_name||'')+'</select>'
    +'<div style="font-size:10px;color:var(--sub);margin-top:6px">При смене МПП открытые задачи и будущие непосещённые маршруты клиента переходят новому менеджеру. История визитов сохраняется.</div>';
  head.insertAdjacentElement('afterend',box);

  // В старом блоке авто-созданной карточки был ещё один селект менеджера.
  // Скрываем его, чтобы руководитель видел одно понятное место управления.
  [...root.querySelectorAll('select')].forEach(sel=>{
    const handler=sel.getAttribute('onchange')||'';
    if(!sel.closest('[data-v204-manager-control]')&&handler.includes('assignClientToManager')){
      const holder=sel.parentElement;if(holder)holder.style.display='none';
    }
  });
}

async function v204ChangeClientManager(clientId,managerName,control){
  if(currentProfile?.role!=='boss'){
    alert('Изменять закреплённого менеджера может только руководитель.');
    if(control){const c=allClients.find(x=>String(x.id)===String(clientId));control.value=c?.manager_name||'';}
    return;
  }
  const c=allClients.find(x=>String(x.id)===String(clientId));
  if(!c)return;
  const previous=String(c.manager_name||'').trim();
  const next=String(managerName||'').trim();
  if(previous===next)return;
  const question=next
    ?'Закрепить клиента «'+c.name+'» за менеджером «'+next+'»?\n\nОткрытые задачи и будущие непосещённые маршруты клиента также будут переданы новому менеджеру.'
    :'Снять закрепление клиента «'+c.name+'» с менеджера?';
  if(!confirm(question)){if(control)control.value=previous;return;}
  if(control)control.disabled=true;

  const mgr=(allUsers||[]).find(u=>isFieldManagerUser(u)&&u.name===next);
  const patch={manager_name:next||null};
  if(next&&(!c.region||c.region==='—')&&mgr?.region)patch.region=mgr.region;
  const {error}=await db.from('clients').update(patch).eq('id',clientId);
  if(error){
    alert('Не удалось изменить менеджера: '+error.message);
    if(control){control.disabled=false;control.value=previous;}
    return;
  }

  const warnings=[];
  try{
    const taskRes=await db.from('tasks').update({manager_name:next||null}).eq('client_id',clientId).eq('done',false);
    if(taskRes.error)warnings.push('открытые задачи: '+taskRes.error.message);
  }catch(e){warnings.push('открытые задачи: '+(e.message||e));}

  const futureRouteIds=(allRoutePlans||[]).filter(r=>
    !r.removed&&!r.visited&&String(r.visit_date||'')>=TODAY&&nameLooseMatch(r.client_name,c.name)
  ).map(r=>r.id).filter(Boolean);
  if(futureRouteIds.length){
    try{
      const routeRes=await db.from('route_plans').update({manager_name:next||null}).in('id',futureRouteIds);
      if(routeRes.error)warnings.push('будущие маршруты: '+routeRes.error.message);
    }catch(e){warnings.push('будущие маршруты: '+(e.message||e));}
  }

  Object.assign(c,patch);
  allTasks=allTasks.map(t=>String(t.client_id)===String(clientId)&&!t.done?{...t,manager_name:next||null}:t);
  allRoutePlans=allRoutePlans.map(r=>futureRouteIds.some(id=>String(id)===String(r.id))?{...r,manager_name:next||null}:r);
  _clientNameMatchCache=null;
  renderClients();
  if(v204PageActive('tasks'))renderTasks();
  if(v204PageActive('routes-boss'))renderRoutesBoss();
  if(v204PageActive('route'))renderRoute();
  if(v204PageActive('my-routes'))renderMyRoutes();
  v204RefreshFallingViews(true);
  if(document.getElementById('modal-client')?.classList.contains('open'))await openClient(clientId);
  if(warnings.length)alert('Менеджер изменён, но часть связанных данных не обновилась:\n• '+warnings.join('\n• '));
}

// Все старые места назначения менеджера используют ту же новую логику.
assignClientToManager=async function(clientId,managerName){
  return v204ChangeClientManager(clientId,managerName,null);
};

// Добавляем управление МПП в каждую карточку, а не только в новые карточки 1С.
const _v204OpenClientBase=openClient;
openClient=async function(id){
  await _v204OpenClientBase(id);
  v204InjectManagerControl(id);
};

// После объединения дублей немедленно пересчитываем список и верхние KPI.
const _v204MergeClientIntoBase=mergeClientInto;
mergeClientInto=async function(sourceId,targetId){
  const result=await _v204MergeClientIntoBase(sourceId,targetId);
  // После объединения дополнительно переносим прямую связь purchase_history на
  // главную карточку. Алиасы остаются запасным способом сопоставления.
  try{
    const phRes=await db.from('purchase_history').update({client_id:targetId}).eq('client_id',sourceId);
    if(phRes.error)console.warn('purchase_history client_id merge repair',phRes.error);
    else{
      allPurchaseHistory=allPurchaseHistory.map(r=>String(r.client_id||'')===String(sourceId)?{...r,client_id:targetId}:r);
      Object.keys(_clientHistCache).forEach(k=>delete _clientHistCache[k]);
      v204InvalidateFallingCaches();
      try{
        const refreshed=await refreshClientRevenueFromServer(targetId);
        const target=allClients.find(x=>String(x.id)===String(targetId));
        if(target)target.revenue_total=refreshed;
      }catch(e){console.warn('revenue refresh after purchase_history merge repair',e);}
    }
  }catch(e){console.warn('purchase_history merge repair skipped',e);}
  v204RefreshFallingViews(true);
  return result;
};

async function v204FetchSalesStatus(){
  const {data,error}=await db.from('crm_import_status').select('*').ilike('source','sales').limit(1);
  if(error)throw error;
  return data?.[0]||null;
}
async function v204ReloadFallingSource(statusRow){
  // Большую историю продаж грузим только после фактического нового импорта.
  const freshHistory=(typeof window.v22722EnsureHistory==='function')?await window.v22722EnsureHistory({force:true,reason:'falling-import'}):await loadAllRows('purchase_history');
  const freshClients=await loadAllRows('clients');
  let freshAliases=[];
  let freshTasks=[];
  try{freshAliases=await loadAllRows('client_aliases');}catch(e){console.warn(e);freshAliases=allClientAliases||[];}
  try{freshTasks=await loadAllRows('tasks');}catch(e){console.warn(e);freshTasks=allTasks||[];}

  allPurchaseHistory=freshHistory;
  allClients=(freshClients||[]).filter(c=>!clientIsArchived(c));
  const activeClientIds=new Set(allClients.map(c=>String(c.id)));
  allClientAliases=freshAliases;
  allTasks=(freshTasks||[]).filter(t=>!t.client_id||activeClientIds.has(String(t.client_id)));
  allTasks.sort((a,b)=>(a.due_date||'').localeCompare(b.due_date||''));
  v204InvalidateFallingCaches();
  allClients.forEach(c=>{
    const hist=getClientHistFast(c);
    if(hist.length){
      const actual=hist.reduce((sum,r)=>sum+(Number(r.revenue)||0),0);
      if(actual>0)c.revenue_total=actual;
    }else c.revenue_total=Number(c.revenue_total)||0;
  });
  allClients.sort((a,b)=>(Number(b.revenue_total)||0)-(Number(a.revenue_total)||0));
  if(statusRow){
    allImportStatus=(allImportStatus||[]).filter(x=>String(x.source||'').toLowerCase()!=='sales');
    allImportStatus.push(statusRow);
  }
  v204LastSalesStamp=v204StatusStamp(statusRow||crmImportStatus('sales'));
}
async function v204CheckFallingFreshness(force){
  if(v204FallingRefreshBusy||!currentProfile)return;
  v204FallingRefreshBusy=true;
  try{
    const remote=await v204FetchSalesStatus();
    const remoteStamp=v204StatusStamp(remote);
    if(!v204LastSalesStamp)v204LastSalesStamp=v204StatusStamp(crmImportStatus('sales'));
    if(force||(remoteStamp&&remoteStamp!==v204LastSalesStamp)){
      await v204ReloadFallingSource(remote);
      v204RefreshFallingViews(false);
    }
  }catch(e){console.warn('Автообновление падающих клиентов временно недоступно',e);}
  finally{v204FallingRefreshBusy=false;}
}

// Запоминаем версию импорта после обычной загрузки CRM.
const _v204LoadDataBase=loadData;
loadData=async function(){
  await _v204LoadDataBase();
  v204LastSalesStamp=v204StatusStamp(crmImportStatus('sales'));
  v204InvalidateFallingCaches();
};

// При открытии раздела сразу проверяем, не пришёл ли новый отчёт 1С.
const _v204GoPageBase=goPage;
goPage=function(p,title){
  _v204GoPageBase(p,title);
  if(p==='falling')crmSchedulePageHook('falling',()=>v204CheckFallingFreshness(false),20);
};

// Пока раздел открыт, проверяем только маленькую служебную строку импорта.
// Полная история продаж перезагружается исключительно при изменившейся отметке.
setInterval(()=>{
  if(v204PageActive('falling')||v204PageActive('dashboard'))v204CheckFallingFreshness(false);
},60000);
window.addEventListener('focus',()=>{
  if(v204PageActive('falling')||v204PageActive('dashboard'))v204CheckFallingFreshness(false);
});
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&(v204PageActive('falling')||v204PageActive('dashboard')))v204CheckFallingFreshness(false);
});

window.RESANTA_FALLING_MANAGER_FIX=Object.freeze({version:'20.4.0',autoRefresh:true,bossManagerChange:true});

/* ===== ORIGINAL INLINE SCRIPT 7 ===== */
// ============================================================================
// RESANTA CRM v20.8 · Android GPS watchdog and honest native-service status
// ============================================================================
(function(){
  const v208Sleep=ms=>new Promise(r=>setTimeout(r,ms));
  let v208RepairBusy=false;
  let v208WatchdogBusy=false;

  function v208Tracker(){try{return v19NativeTracker();}catch(_){return null;}}
  async function v208RawNativeStatus(){
    const tracker=v208Tracker();
    if(!tracker||typeof tracker.status!=='function')return {active:false,serviceAlive:false,requestedActive:false,native:false};
    try{
      const raw=await tracker.status();
      const modern=Object.prototype.hasOwnProperty.call(raw||{},'serviceAlive');
      return {...raw,native:true,legacyNative:!modern,serviceAlive:modern?!!raw.serviceAlive:!!raw.active,requestedActive:modern?!!raw.requestedActive:!!raw.active};
    }
    catch(e){return {active:false,serviceAlive:false,requestedActive:false,native:true,lastError:e.message||String(e)};}
  }
  async function v208AdoptNativeSession(status){
    if(!status?.accessToken||!status?.refreshToken||currentProfile?.role!=='manager')return null;
    try{
      const current=(await db.auth.getSession()).data?.session||null;
      if(current?.access_token===status.accessToken)return current;
      const result=await db.auth.setSession({access_token:status.accessToken,refresh_token:status.refreshToken});
      return result?.data?.session||null;
    }catch(_){return null;}
  }
  async function v208PushWebSession(session){
    const tracker=v208Tracker();
    if(!tracker||typeof tracker.updateSession!=='function'||!session?.access_token)return;
    try{await tracker.updateSession({accessToken:session.access_token,refreshToken:session.refresh_token||''});}catch(_){ }
  }

  v19Session=async function(){
    let session=null;
    try{session=(await db.auth.getSession()).data?.session||null;}catch(_){ }
    if(!session){
      const native=await v208RawNativeStatus();
      session=await v208AdoptNativeSession(native);
    }
    if(!session){
      try{session=(await db.auth.refreshSession()).data?.session||null;}catch(_){ }
    }
    if(session)await v208PushWebSession(session);
    return session;
  };

  v19NativeStatus=async function(){
    let status=await v208RawNativeStatus();
    if(status.native&&currentProfile?.role==='manager'){
      await v208AdoptNativeSession(status);
      // A live workday must never be shown as running only because a stale flag
      // remains in storage. The APK heartbeat is the source of truth.
      if(status.requestedActive&&!status.serviceAlive){
        const tracker=v208Tracker();
        if(tracker&&typeof tracker.ensureRunning==='function'){
          try{
            await tracker.ensureRunning();
            await v208Sleep(900);
            status=await v208RawNativeStatus();
            await v208AdoptNativeSession(status);
          }catch(e){status.lastError=e.message||String(e);}
        }
      }
      try{
        const session=(await db.auth.getSession()).data?.session||null;
        if(session)await v208PushWebSession(session);
      }catch(_){ }
    }
    return status;
  };

  const v208StartNativeBase=v19StartNativeFor;
  v19StartNativeFor=async function(workday){
    const result=await v208StartNativeBase(workday);
    await v208Sleep(900);
    const status=await v208RawNativeStatus();
    if(!status.serviceAlive){
      throw new Error(status.lastError||'Android не подтвердил запуск GPS-службы. Проверьте уведомления, геолокацию и ограничения батареи.');
    }
    return result;
  };

  function v208IssueLines(native){
    const issues=[];
    if(native.native===false)return issues;
    if(native.legacyNative)issues.push('Установите новый APK GPS v19.2 — старая версия не умеет подтверждать работу службы.');
    if(native.locationProviderEnabled===false)issues.push('На устройстве выключена геолокация Android.');
    if(native.fineLocationGranted===false)issues.push('Не разрешено точное местоположение.');
    if(native.notificationsEnabled===false||native.notificationChannelEnabled===false)issues.push('Отключено постоянное уведомление «Рабочий GPS-маршрут».');
    if(native.backgroundLocationGranted===false)issues.push('Не выдана геолокация «Разрешать всегда» — автоматический перезапуск может быть ограничен.');
    if(native.batteryUnrestricted===false)issues.push('Android ограничивает работу приложения в фоне — установите батарею «Без ограничений».');
    if(native.authNeedsLogin)issues.push('Нужно открыть CRM и войти заново; накопленные точки не потеряны.');
    if(native.requestedActive&&!native.serviceAlive)issues.push('GPS-служба Android не отвечает и восстанавливается.');
    return issues;
  }

  window.v208OpenGpsSetting=async function(kind){
    const tracker=v208Tracker();if(!tracker)return;
    const method={app:'openAppSettings',notifications:'openNotificationSettings',battery:'openBatterySettings',location:'openLocationSettings'}[kind]||'openAppSettings';
    try{if(typeof tracker[method]==='function')await tracker[method]();}catch(e){alert(e.message||e);}
  };

  window.v208RepairGps=async function(){
    if(v208RepairBusy)return;v208RepairBusy=true;
    try{
      if(!v19MyWorkday?.id){alert('Активный рабочий день не найден.');return;}
      const tracker=v208Tracker();if(!tracker)throw new Error('Откройте установленное Android-приложение Ресанта CRM.');
      const session=await v19Session();
      if(!session)throw new Error('Войдите в CRM заново. Накопленные GPS-точки останутся на устройстве.');
      await v208PushWebSession(session);
      let status=await v208RawNativeStatus();
      if(!status.requestedActive||String(status.workdayId||'')!==String(v19MyWorkday.id)){
        await v19StartNativeFor(v19MyWorkday);
      }else if(typeof tracker.ensureRunning==='function'){
        await tracker.ensureRunning();
      }
      if(typeof tracker.flush==='function')await tracker.flush().catch?.(()=>{});
      await v208Sleep(1200);
      status=await v208RawNativeStatus();
      await v19RenderManagerWorkday();v19RenderWorkdayCard();
      if(status.serviceAlive){
        alert('GPS-служба восстановлена. В шторке Android должно быть постоянное уведомление «Ресанта CRM · рабочий день».');
      }else{
        throw new Error(status.lastError||'Android не запустил GPS-службу. Откройте настройки приложения и снимите ограничения.');
      }
    }catch(e){alert('Не удалось восстановить GPS:\n'+(e.message||e));}
    finally{v208RepairBusy=false;}
  };

  v19RenderManagerWorkday=async function(){
    const root=document.getElementById('workday-manager-status');if(!root||currentProfile?.role!=='manager')return;
    const native=await v19NativeStatus();
    if(!v19MyWorkday){
      root.innerHTML='<div class="gps-workday-status"><span class="gps-workday-dot"></span><div style="flex:1"><div style="font-weight:700">Рабочий день не начат</div><div style="font-size:12px;color:var(--sub);margin-top:4px">Перед первым выездом запустите запись маршрута.</div></div><button id="workday-start-btn" class="btn-primary" onclick="v19StartWorkday()">▶ Начать рабочий день</button></div>'+(native.native?'':'<div class="promo-warning" style="margin-top:12px">Фоновая запись недоступна в браузере. Откройте установленное Android-приложение.</div>');
      return;
    }
    const running=!!native.serviceAlive&&String(native.workdayId||'')===String(v19MyWorkday.id);
    const issues=v208IssueLines(native);
    const issueHtml=issues.length?'<div style="margin-top:8px;padding:8px 10px;border-radius:8px;background:#FEF2F2;color:#991B1B;font-size:11px;line-height:1.45">'+issues.map(x=>'• '+esc(x)).join('<br>')+'</div>':'';
    const q=Number(native.queueSize)||0;
    const heartbeat=native.heartbeatAgeSec>=0?' · контроль службы: '+(native.heartbeatAgeSec<60?native.heartbeatAgeSec+' сек назад':Math.round(native.heartbeatAgeSec/60)+' мин назад'):'';
    root.innerHTML='<div class="gps-workday-status"><span class="gps-workday-dot '+(running?'active':'error')+'"></span><div style="flex:1;min-width:220px"><div style="font-weight:700">'+(running?'Рабочий маршрут записывается':'Рабочий день активен, но GPS-служба не подтверждена')+'</div><div style="font-size:12px;color:var(--sub);margin-top:4px">Начало: '+v19DateTime(v19MyWorkday.started_at)+' · последняя точка: '+v19Age(native.lastPointAt||v19MyWorkday.last_point_at)+heartbeat+'</div>'+(q?'<div style="font-size:11px;color:var(--am);margin-top:3px">На устройстве: '+q+' точек ждут отправки. Они не потеряны.</div>':'')+(native.lastError?'<div style="font-size:11px;color:var(--r);margin-top:3px">'+esc(native.lastError)+'</div>':'')+issueHtml+'</div><div style="display:flex;gap:8px;flex-wrap:wrap">'+(!running?'<button class="btn-primary" onclick="v208RepairGps()">↻ Восстановить GPS</button>':'')+'<button class="btn-secondary" onclick="v208OpenGpsSetting(\'app\')">⚙ Настройки</button><button id="workday-stop-btn" class="btn-secondary" style="border-color:var(--r);color:var(--r)" onclick="v19StopWorkday()">■ Завершить рабочий день</button></div></div>';
  };

  v19RenderWorkdayCard=async function(){
    const root=document.getElementById('manager-workday-card');if(!root||currentProfile?.role!=='manager')return;
    const native=await v19NativeStatus(),running=v19MyWorkday&&native.serviceAlive&&String(native.workdayId||'')===String(v19MyWorkday.id);
    const waiting=Number(native.queueSize)||0;
    root.innerHTML='<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span class="gps-workday-dot '+(running?'active':v19MyWorkday?'error':'')+'"></span><div style="flex:1"><div class="card-title" style="margin:0">🚗 Рабочий день</div><div style="font-size:12px;color:var(--sub);margin-top:3px">'+(running?'GPS-служба подтверждена'+(waiting?' · '+waiting+' точек в очереди':''):v19MyWorkday?'GPS-службу нужно восстановить':'Перед выездом включите запись маршрута')+'</div></div><button class="btn-primary" onclick="goPage(\'workday\',\'Рабочий день\')">Открыть</button></div>';
  };

  async function v208GpsWatchdog(){
    if(v208WatchdogBusy||document.hidden||currentProfile?.role!=='manager'||!v19MyWorkday?.id)return;
    v208WatchdogBusy=true;
    try{
      const tracker=v208Tracker();if(!tracker)return;
      let status=await v19NativeStatus();
      if((status.legacyNative||!status.requestedActive||String(status.workdayId||'')!==String(v19MyWorkday.id))&&navigator.onLine){
        try{await v19StartNativeFor(v19MyWorkday);status=await v19NativeStatus();}catch(_){ }
      }
      if(typeof tracker.flush==='function'&&navigator.onLine)await tracker.flush().catch?.(()=>{});
      if(document.getElementById('page-workday')?.classList.contains('active'))await v19RenderManagerWorkday();
      await v19RenderWorkdayCard();
    }finally{v208WatchdogBusy=false;}
  }

  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(v208GpsWatchdog,300);});
  window.addEventListener('focus',()=>setTimeout(v208GpsWatchdog,300));
  window.addEventListener('online',()=>setTimeout(v208GpsWatchdog,300));
  setInterval(v208GpsWatchdog,60000);

  window.RESANTA_WORKDAY_GPS=Object.freeze({version:'19.2.0',intervalSeconds:20,minDistanceMeters:10,heartbeatSeconds:30,durableQueue:true,watchdog:true});
})();

/* ===== ORIGINAL INLINE SCRIPT 8 ===== */
// ============================================================================
// RESANTA CRM v20.9 · Надёжная кнопка «На точке» при слабой связи
// Координата сначала получает постоянный локальный идентификатор и время.
// Если Supabase временно недоступен, замер остаётся на устройстве и
// автоматически отправляется после восстановления интернета/сессии.
// ============================================================================
(function(){
  'use strict';

  const QUEUE_KEY='resanta_client_gps_pending_v209';
  const QUEUE_LIMIT=1000;
  const RETRY_DELAYS=[0,700];
  let flushBusy=false;

  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const errorText=e=>String(e&&e.message||e&&e.error_description||e||'Неизвестная ошибка');
  const makeLocalId=()=>{
    try{if(crypto&&typeof crypto.randomUUID==='function')return crypto.randomUUID();}catch(_){ }
    return 'gps-'+Date.now()+'-'+Math.random().toString(36).slice(2,12);
  };

  function isTransientError(error){
    const text=errorText(error).toLowerCase();
    const status=Number(error&&error.status||0);
    const code=String(error&&error.code||'').toLowerCase();
    return !navigator.onLine
      || status===0 || status===408 || status===425 || status===429 || status>=500
      || /failed to fetch|network|load failed|fetch failed|timeout|time.?out|превышено время|нет интернета|offline|connection|соединени|socket|gateway|temporar/.test(text)
      || /pgrst301|jwt|token.*expired|сессия crm истекла|refresh token|invalid refresh|auth session missing/.test(code+' '+text);
  }

  function readQueue(){
    try{
      const raw=JSON.parse(localStorage.getItem(QUEUE_KEY)||'[]');
      return Array.isArray(raw)?raw.filter(x=>x&&x.client_id&&Number.isFinite(Number(x.lat))&&Number.isFinite(Number(x.lng))):[];
    }catch(e){console.warn('Очередь координат повреждена и очищена',e);return [];}
  }
  function writeQueue(queue){
    localStorage.setItem(QUEUE_KEY,JSON.stringify(queue||[]));
    try{window.dispatchEvent(new CustomEvent('resanta-client-gps-queue',{detail:{count:(queue||[]).length}}));}catch(_){ }
  }
  function queueItem(item,lastError){
    const queue=readQueue();
    const exists=queue.some(x=>x.local_id===item.local_id);
    const stored={...item,last_error:lastError?errorText(lastError):null,queued_at:item.queued_at||new Date().toISOString()};
    if(!exists){
      if(queue.length>=QUEUE_LIMIT)throw new Error('Локальная очередь GPS переполнена. Откройте CRM с интернетом и войдите заново.');
      queue.push(stored);
    }
    else queue.splice(queue.findIndex(x=>x.local_id===item.local_id),1,stored);
    writeQueue(queue);
    return queue.length;
  }

  async function ensureFreshSession(){
    if(typeof v19Session==='function'){
      const nativeAware=await v19Session();
      if(nativeAware)return nativeAware;
    }
    let result=await db.auth.getSession();
    let session=result&&result.data&&result.data.session;
    const expires=Number(session&&session.expires_at||0);
    if(!session||(expires&&expires<Date.now()/1000+90)){
      result=await db.auth.refreshSession();
      if(result&&result.error)throw result.error;
      session=result&&result.data&&result.data.session;
    }
    if(!session)throw new Error('Сессия CRM истекла. Откройте приложение и войдите заново.');
    return session;
  }

  async function runRequest(operation,label,attempts=RETRY_DELAYS.length){
    let lastError=null;
    for(let i=0;i<attempts;i++){
      if(RETRY_DELAYS[i])await sleep(RETRY_DELAYS[i]);
      try{
        if(!navigator.onLine)throw new Error('Нет интернета');
        await ensureFreshSession();
        const response=await withTimeout(Promise.resolve().then(operation),9000,label);
        if(response&&response.error)throw response.error;
        return response;
      }catch(e){
        lastError=e;
        console.warn(label+': попытка '+(i+1)+' не выполнена',e);
        if(i===attempts-1||!isTransientError(e))break;
        try{await db.auth.refreshSession();}catch(_){ }
      }
    }
    throw lastError||new Error('Запрос не выполнен');
  }

  async function sampleAlreadyExists(item){
    const response=await runRequest(
      ()=>db.from('client_gps_samples').select('client_id').eq('client_id',item.client_id).eq('taken_at',item.taken_at).limit(1),
      'проверка сохранённого GPS-замера'
    );
    return !!(response.data&&response.data.length);
  }

  async function recalcClientCoordinates(item,clientObject){
    const response=await runRequest(
      ()=>db.from('client_gps_samples').select('lat,lng,taken_at').eq('client_id',item.client_id),
      'пересчёт координат клиента'
    );
    const samples=response.data||[];
    const valid=samples.filter(s=>Number.isFinite(Number(s.lat))&&Number.isFinite(Number(s.lng)));
    if(!valid.length)throw new Error('После записи замер не найден');

    const median=arr=>{
      const sorted=arr.slice().sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
      return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
    };
    const days=new Set(valid.map(s=>String(s.taken_at||'').slice(0,10)).filter(Boolean)).size;
    const verified=days>=GPS_MIN_SAMPLES;
    const update={
      gps_lat:median(valid.map(s=>Number(s.lat))),
      gps_lng:median(valid.map(s=>Number(s.lng))),
      gps_samples_cnt:days,
      gps_source:'samples',
      gps_radius:verified?GPS_RADIUS_VERIFIED:GPS_RADIUS_PARTIAL,
      gps_verified_at:verified?new Date().toISOString():null
    };
    await runRequest(
      ()=>db.from('clients').update(update).eq('id',item.client_id),
      'обновление координат клиента'
    );
    if(clientObject)Object.assign(clientObject,update);
    return {days,verified};
  }

  async function syncOne(item,clientObject){
    const exists=await sampleAlreadyExists(item);
    if(!exists){
      const row={
        client_id:item.client_id,
        lat:item.lat,
        lng:item.lng,
        accuracy:item.accuracy,
        source:item.source||'visit',
        taken_by:item.taken_by||null,
        taken_at:item.taken_at
      };
      await runRequest(()=>db.from('client_gps_samples').insert(row),'сохранение GPS-замера');
    }
    return recalcClientCoordinates(item,clientObject);
  }

  async function flushPendingClientGps(silent=true){
    if(flushBusy||!navigator.onLine)return {sent:0,left:readQueue().length};
    const queue=readQueue();
    if(!queue.length)return {sent:0,left:0};
    flushBusy=true;
    let sent=0;
    const left=[];
    try{
      for(let i=0;i<queue.length;i++){
        const item=queue[i];
        const clientObject=Array.isArray(allClients)?allClients.find(c=>String(c.id)===String(item.client_id)):null;
        try{
          await syncOne(item,clientObject);
          sent++;
        }catch(e){
          left.push({...item,last_error:errorText(e),last_attempt_at:new Date().toISOString()});
          // При потере связи не мучаем сервер следующими запросами. При
          // серверной/правовой ошибке сохраняем остальные замеры и пробуем их.
          if(isTransientError(e))left.push(...queue.slice(i+1));
          else continue;
          break;
        }
      }
      writeQueue(left);
      if(sent&&!silent)alert('✅ Отправлено сохранённых GPS-замеров: '+sent+'.');
      return {sent,left:left.length};
    }finally{flushBusy=false;}
  }

  // Полностью заменяем старую запись замера. Теперь «Failed to fetch» не
  // уничтожает координату: она попадает в локальную очередь.
  gpsSaveSample=async function(client,geo,source){
    if(!client||!geo)return {ok:false,error:'Нет клиента или координат'};
    if(geo.accuracy!=null&&geo.accuracy>500)return {ok:false,error:'Точность GPS хуже 500 м'};

    const item={
      local_id:makeLocalId(),
      client_id:client.id,
      lat:Number(geo.lat),
      lng:Number(geo.lng),
      accuracy:geo.accuracy==null?null:Number(geo.accuracy),
      source:source||'visit',
      taken_by:currentProfile&&currentProfile.name||null,
      taken_at:new Date().toISOString()
    };

    if(!navigator.onLine){
      try{return {ok:true,pending:true,queuedCount:queueItem(item,'Нет интернета')};}
      catch(e){return {ok:false,error:'Нет связи, и телефон не смог сохранить очередь: '+errorText(e)};}
    }

    try{
      const result=await syncOne(item,client);
      // Заодно отправляем старые отложенные замеры, но не задерживаем кнопку.
      setTimeout(()=>flushPendingClientGps(true),250);
      return {ok:true,...result,pending:false};
    }catch(e){
      if(isTransientError(e)){
        try{return {ok:true,pending:true,queuedCount:queueItem(item,e),error:errorText(e)};}
        catch(storageError){return {ok:false,error:'Сервер недоступен, и телефон не смог сохранить очередь: '+errorText(storageError)};}
      }
      return {ok:false,error:errorText(e)};
    }
  };

  // Обновлённая кнопка «На точке»: при слабой связи пользователь получает
  // честное сообщение «сохранено на устройстве», а не пугающий Failed to fetch.
  checkinHere=async function(clientId,sourceBtn,returnMode){
    const c=allClients.find(x=>String(x.id)===String(clientId));
    if(!c)return;
    const btn=sourceBtn||document.getElementById('checkin-btn');
    const oldText=btn?btn.textContent:'📍 Я на точке';
    if(btn){btn.disabled=true;btn.textContent='📍 Определяю...';}

    const geo=await getGeoNow(12000);
    if(btn){btn.disabled=false;btn.textContent=oldText||'📍 Я на точке';}
    if(!geo){
      alert('Не удалось получить координаты.\n\n'+(window._lastGeoError?'Причина: '+window._lastGeoError+'\n\n':'')+'Android: Настройки → Приложения → Ресанта CRM → Разрешения → Местоположение → Разрешить при использовании и включить точное местоположение.');
      return;
    }
    if(geo.accuracy!=null&&geo.accuracy>200){
      alert('Точность GPS слишком низкая (±'+geo.accuracy+' м) — замер не засчитан.\n\nВыйдите на открытое место и попробуйте ещё раз.');
      return;
    }

    const chk=gpsCheckAgainstClient(c,geo);
    const saved=await gpsSaveSample(c,geo,'checkin');
    if(!saved.ok){
      alert('Координаты телефона получены, но CRM не смогла сохранить замер.\n\n'+saved.error+'\n\nСообщите руководителю.');
      return;
    }

    if(saved.pending){
      alert('✅ Координата сохранена на телефоне.\n\nСвязь с сервером нестабильна. CRM отправит замер автоматически после восстановления интернета или повторного входа.\n\nОжидает отправки: '+(saved.queuedCount||readQueue().length)+'.');
    }else{
      // Дополнительная точка движения не должна ломать успешный чекин.
      runRequest(()=>db.from('gps_points').insert({
        manager_name:c.manager_name||currentProfile&&currentProfile.name||null,
        lat:geo.lat,lng:geo.lng,accuracy:geo.accuracy,source:'checkin'
      }),'сохранение точки движения',2).catch(e=>console.warn('Точка движения не сохранена',e));

      const gf=clientGeofence(c);
      const left=Math.max(0,GPS_MIN_SAMPLES-(c.gps_samples_cnt||0));
      alert('✅ Замер записан (точность ±'+(geo.accuracy||'?')+' м).\n\n'
        +(gf&&gf.verified?'Координаты ТТ выверены.':'Осталось замеров с других дней: '+left+'.')
        +(chk.distance!=null?'\n\nРасстояние до текущей точки клиента: '+chk.distance+' м.':''));
    }

    if(returnMode==='my-routes')renderMyRoutes();
    else if(returnMode==='route')renderRoute();
    else openClient(clientId);
  };

  window.addEventListener('online',()=>setTimeout(()=>flushPendingClientGps(true),500));
  window.addEventListener('focus',()=>setTimeout(()=>flushPendingClientGps(true),700));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(()=>flushPendingClientGps(true),700);});
  setInterval(()=>flushPendingClientGps(true),60000);
  setTimeout(()=>flushPendingClientGps(true),4000);
  try{db.auth.onAuthStateChange((_event,session)=>{if(session)setTimeout(()=>flushPendingClientGps(true),500);});}catch(_){ }

  window.RESANTA_CLIENT_GPS_SYNC=Object.freeze({
    version:'20.9.0',
    durableQueue:true,
    retry:true,
    getPendingCount:()=>readQueue().length,
    flush:()=>flushPendingClientGps(false)
  });
})();
