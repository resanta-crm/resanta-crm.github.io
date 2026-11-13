/* RESANTA CRM · approved home / control center · 2026-11-13.
 * Presentation and authenticated reads only. Existing dashboard/GPS hooks,
 * route truth, task canonicalization and all other sections remain intact.
 * No new permissions, migrations, imports, model calls or automatic actions.
 */
(function(w,d){
'use strict';
if(w.RESANTA_CONTROL_CENTER_V1)return;
const ID='control-center-v1',TTL=180000,MAX_AGE=86400000,TIMEOUT=12000,FIELD=['Ачинович','Руднев','Шкуран'];
const arr=x=>Array.isArray(x)?x:[];
const n=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=x=>n(x)===null?'—':Number(x).toLocaleString('ru-RU',{maximumFractionDigits:2})+' BYN';
const compact=x=>n(x)===null?'—':Math.abs(x)>=1e6?(x/1e6).toLocaleString('ru-RU',{maximumFractionDigits:2})+' млн':Math.abs(x)>=1000?(x/1000).toLocaleString('ru-RU',{maximumFractionDigits:1})+' тыс.':Number(x).toLocaleString('ru-RU',{maximumFractionDigits:2});
const pct=(a,b)=>n(b)>0?(n(a)===null?'Нет факта':(a/b*100).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%'):'План не задан';
const day=()=>{try{return String(TODAY).slice(0,10)}catch(_){return new Date().toLocaleDateString('en-CA')}};
const monthNow=()=>day().slice(0,7);
const profile=()=>{try{return currentProfile||{}}catch(_){return{}}};
const user=()=>{try{return currentUser||{}}catch(_){return{}}};
const actor=()=>[user().id,profile().id,profile().role,profile().name,profile().email,profile().access_scope,profile().region].join('|');
const boss=()=>profile().role==='boss';
const allowed=()=>Boolean(user().id&&profile().id===user().id&&['boss','manager'].includes(profile().role)&&!['triovist','service_manager','payment_executor'].includes(String(profile().access_scope||'').toLowerCase())&&(boss()||FIELD.includes(profile().name)));
const triAllowed=()=>boss()&&arr(w.RESANTA_TRIOVIST?.fullAccessEmails).includes(String(profile().email||'').trim().toLowerCase());
const active=()=>d.getElementById('page-dashboard')?.classList.contains('active')&&allowed();
const dbc=()=>{try{return typeof db!=='undefined'?db:w.db}catch(_){return w.db}};
const stamp=x=>{if(!x)return'дата не подтверждена';const z=new Date(x);return Number.isNaN(z.getTime())?esc(x):z.toLocaleString('ru-RU',{timeZone:'Europe/Minsk',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});};
const dateLabel=x=>/^\d{4}-\d\d-\d\d$/.test(String(x))?x.slice(8)+'.'+x.slice(5,7)+'.'+x.slice(0,4):String(x||'—');
const monthLabel=x=>new Date(x+'-01T12:00:00').toLocaleDateString('ru-RU',{month:'long',year:'numeric'});
let state={actor:'',month:monthNow(),slots:{},legacy:false,coreRequested:false},installed=false,actions=new Map(),legacyBuild=null,nativeActor='',renderQueued=false;
let operationCache=null;
let checks={status:'idle',snapshot:null,error:'',run:0};
const memoryCache=new Map(),painted=new Map();
const slots=()=>state.slots;
const cacheKey=()=>actor()+'|'+state.month;
function restore(){
 const hit=memoryCache.get(cacheKey());if(hit){state.slots=hit;return;}
 try{const saved=JSON.parse(w.sessionStorage?.getItem('crm_control_center_v2:'+user().id)||'null');
  if(saved?.version===2&&saved.actor===actor()&&saved.month===state.month&&Date.now()-saved.savedAt<MAX_AGE){
   for(const key of ['sales','triovist','pdz','receipts']){const v=saved.slots?.[key];if(v?.data&&Number.isFinite(v.at)&&Date.now()-v.at<MAX_AGE&&(key!=='triovist'||triAllowed()))state.slots[key]={data:v.data,at:v.at,error:'',loading:false};}
  }
 }catch(_){}
 memoryCache.set(cacheKey(),state.slots);
}
function persist(){
 memoryCache.set(cacheKey(),slots());while(memoryCache.size>8)memoryCache.delete(memoryCache.keys().next().value);
 const safe={};for(const key of ['sales','triovist','pdz','receipts'])if(slots()[key]?.data&&(key!=='triovist'||triAllowed()))safe[key]={data:slots()[key].data,at:slots()[key].at};
 try{const encoded=JSON.stringify({version:2,actor:actor(),month:state.month,savedAt:Date.now(),slots:safe});if(encoded.length<32000)w.sessionStorage?.setItem('crm_control_center_v2:'+user().id,encoded);}catch(_){}
}
function resetActor(){if(state.actor===actor())return;state={actor:actor(),month:monthNow(),slots:{},legacy:false,coreRequested:false};checks={status:'idle',snapshot:null,error:'',run:checks.run+1};actions=new Map();operationCache=null;painted.clear();restore();}
async function loadChecks(){
 if(!active()||checks.status==='loading')return;resetActor();
 const owner=actor(),run=++checks.run;checks.status='loading';checks.error='';scheduleRender();
 let timer;
 try{
  if(typeof w.crmControlCenterChecksV1!=='function')throw Error('unavailable');
  const result=await Promise.race([w.crmControlCenterChecksV1(),new Promise((_,reject)=>{timer=w.setTimeout(()=>reject(Error('timeout')),22000);})]);
  if(owner!==actor()||run!==checks.run)return;
  checks.snapshot=result;checks.status='ready';
 }catch(_){if(owner!==actor()||run!==checks.run)return;checks.status='error';checks.error='Не удалось проверить дополнительные источники. Повторите проверку.';}
 finally{w.clearTimeout(timer);if(owner===actor()&&run===checks.run)scheduleRender();}
}
function checksBlock(){
 const snap=checks.snapshot,truth=snap?.truth;
 const ready=keys=>keys.every(k=>snap?.sources?.[k]?.status==='ready');
 const groups=[
  {label:'Падение продаж ВИП',keys:['vip','sales'],rows:arr(truth?.vipDrops),page:'vip',row:x=>({title:x.matched?.name||x.client_name,note:[x.period_cur,'к '+x.period_prev,'изменение '+x.growth_pct+'%'].filter(Boolean).join(' · '),client:x.matched?.id})},
  {label:'Отклонения по акциям',keys:['promotions','photos','sales'],rows:arr(truth?.promotionIssues),page:'promotions',row:x=>({title:x.promotion?.name||x.promotion?.client_name||'Акция',note:x.metric?.reason,client:x.promotion?.client_id})},
  {label:'Частично выполненные задачи',keys:['partial'],rows:arr(truth?.partialReviews),page:'tasks',row:x=>({title:x.manager_name||'Задача',note:[x.fact_result,x.reason].filter(Boolean).join(' · '),review:x.id})},
  {label:'Качество данных',keys:[],rows:[...arr(truth?.unassigned).map(x=>({...x,checkNote:'Клиент с оборотом не закреплён за менеджером'})),...arr(truth?.noMaster).map(x=>({...x,checkNote:'Строки маст-листа не сопоставились; требуется проверить 1С'}))],page:'clients',row:x=>({title:x.name,note:x.checkNote,client:x.id})}
 ];
 const header='<div class="cc-panel-head"><h4>Дополнительные проверки</h4><button type="button" class="cc-btn" data-cc-checks'+(checks.status==='loading'?' disabled':'')+'>'+(checks.status==='loading'?'Проверяю…':snap?'Повторить проверку':'Проверить ВИП, акции и разборы')+'</button></div>';
 const notice=checks.status==='error'?checks.error:checks.status==='loading'?'Проверяю источники. Это не мешает работе с главной.':snap?'Проверено '+stamp(snap.at)+'. Текущие обязательства; ВИП — за последний закрытый месяц.':'Проверки из прежнего раздела «Сигналы». Загружаются по кнопке, отдельно от главной.';
 const html=groups.map(g=>{
  const checked=Boolean(snap)&&ready(g.keys),confirmed=checked&&(g.page!=='clients'||snap.historyChecked),rows=checked?g.rows:[],limit=checks.limits?.[g.page]||10;
  const count=!snap?'Не проверено':confirmed?String(rows.length):'Проверено частично';
  const items=rows.slice(0,limit).map(x=>{const r=g.row(x);return '<div class="cc-check-row"><div><strong>'+esc(r.title)+'</strong><p class="cc-muted">'+esc(r.note)+'</p></div>'+action(r.review&&boss()?'Разобрать задачу':'Открыть',g.page,{...r,review:boss()?r.review:null})+'</div>';}).join('');
  return '<details class="cc-check-group"'+(limit>10?' open':'')+'><summary>'+esc(g.label)+' <span>'+esc(count)+'</span></summary>'+(items||'<p class="cc-muted">'+esc(!snap?'Нажмите «Проверить».':confirmed?'По проверенным источникам отклонений не найдено.':'Источник недоступен. Отсутствие замечаний не подтверждено.')+'</p>')+(rows.length>limit?'<button type="button" class="cc-btn" data-cc-more="'+g.page+'">Показать ещё · '+limit+' из '+rows.length+'</button>':'')+(snap?action('Открыть раздел',g.page):'')+'</details>';
 }).join('');
 return '<div class="cc-checks" id="cc-extra-checks">'+header+'<p class="cc-muted" role="status">'+esc(notice)+'</p>'+html+'<p class="cc-muted">Качество данных — не оценка менеджера. '+(snap&&!snap.historyChecked?'Сопоставление маст-листа не проверено: история продаж не загружена. ':'')+'Просроченные задачи и маршруты уже показаны выше и повторно не добавляются.</p></div>';
}
function syncSignalsNav(){for(const id of ['nav-alerts','bn-alerts'])d.getElementById(id)?.classList.toggle('cc-merged-signals',allowed());}
function scheduleRender(){if(renderQueued)return;renderQueued=true;const run=()=>{renderQueued=false;if(active())render();};if(typeof w.requestAnimationFrame==='function')w.requestAnimationFrame(run);else Promise.resolve().then(run);}
function coreStatus(name){return w.crmCoreResourceStatusV1?.(name)||{status:'idle',error:''};}
function coreReady(names){return names.every(k=>{const s=coreStatus(k);return s.status==='ready'&&!s.error;});}
function coreMessage(names){const error=state.coreTimedOut||names.some(k=>coreStatus(k).error||coreStatus(k).status==='error');return error?'Не удалось обновить данные. Повторите загрузку.':'Данные загружаются…';}
function localData(){
 const version=[actor(),day(),...['tasks','visits','routes','absences'].map(k=>{const s=coreStatus(k);return [s.status,s.loadedAt,s.error].join(':')})].join('|');
 if(operationCache?.version===version)return operationCache.data;
 let tasks=[],routes=null;
 const tasksReady=coreReady(['tasks','absences']);
 const routesReady=coreReady(['visits','routes','absences']);
 if(tasksReady){try{tasks=boss()?canonicalActiveTasks(allTasks):canonicalTasksForManager(profile().name)}catch(_){return{tasks:[],tasksReady:false,routesReady:false,routes:null};}}
 if(routesReady){try{routes=routeTruthMetrics(visibleVisitsForCurrentUser(),routePlansForCurrentUser());}catch(_){routes=null;}}
 const data={tasks,tasksReady,routesReady:routesReady&&Boolean(routes),routes};operationCache={version,data};return data;
}
function overdueTasks(data){return data.tasksReady?data.tasks.filter(t=>{try{return isTaskOverdue(t)}catch(_){return false}}):[];}
function salesRows(kpi,tri,month,manager=''){
 const list=arr(kpi?.sales).filter(x=>FIELD.includes(x.manager_name)&&(!manager||x.manager_name===manager)).map(x=>({name:x.manager_name,actual:kpi.latest_sales_month&&month<=kpi.latest_sales_month?n(x.shipment):null,plan:n(x.shipment_plan)>0?n(x.shipment_plan):null,kind:'field'}));
 if(tri){
  const hasMonth=arr(tri.available_months).includes(month);
  const plans=arr(tri.selected_month_plans);
  list.push({name:'Триовист',actual:hasMonth?arr(tri.items).reduce((s,x)=>s+(n(x.current_revenue)||0),0):null,plan:plans.length?plans.reduce((s,x)=>s+(n(x.plan_amount)||0),0)||null:null,kind:'triovist'});
 }
 return list;
}
function totals(rows){
 return {actual:rows.length&&rows.every(x=>n(x.actual)!==null)?rows.reduce((s,x)=>s+x.actual,0):null,plan:rows.length&&rows.every(x=>n(x.plan)>0)?rows.reduce((s,x)=>s+x.plan,0):null};
}
function loadSlot(key,job,force=false){
 const old=slots()[key];
 if(old?.loading||!force&&old&&Date.now()-(old.failedAt||old.at)<TTL)return old?.promise||Promise.resolve();
 const entry={data:old?.data||null,error:'',loading:true,at:old?.at||0};slots()[key]=entry;
 const owner=actor(),month=state.month;
 const controller=typeof AbortController==='function'?new AbortController():null;let timer;
 const deadline=new Promise((_,reject)=>{timer=w.setTimeout(()=>{controller?.abort();reject(Error('Источник не ответил за 12 секунд'));},TIMEOUT);});
 entry.promise=(async()=>{try{const data=await Promise.race([Promise.resolve().then(()=>job(controller?.signal)),deadline]);if(actor()!==owner||state.month!==month||slots()[key]!==entry)return;entry.data=data;entry.at=Date.now();entry.failedAt=0;persist();}
 catch(e){if(actor()!==owner||state.month!==month||slots()[key]!==entry)return;entry.error=String(e?.message||e);entry.failedAt=Date.now();if(['42501','401','403'].includes(String(e?.code||e?.status||''))||/not.authoriz|нет доступа|требуется авторизац|необходима авторизац/i.test(entry.error)){entry.data=null;entry.at=0;persist();}}
 finally{w.clearTimeout(timer);entry.loading=false;if(actor()===owner&&state.month===month&&slots()[key]===entry&&active())scheduleRender();}})();
 return entry.promise;
}
async function rpc(name,args,signal){const client=dbc();if(!client?.rpc)throw Error('Соединение с CRM недоступно');let query=client.rpc(name,args);if(signal&&typeof query.abortSignal==='function')query=query.abortSignal(signal);const r=await query;if(r.error)throw r.error;if(!r.data)throw Error('Источник не вернул данные');return r.data;}
async function receipts(month,signal){
 const client=dbc(),start=month+'-01',endDate=new Date(start+'T12:00:00');endDate.setMonth(endDate.getMonth()+1);const end=endDate.getFullYear()+'-'+String(endDate.getMonth()+1).padStart(2,'0')+'-01';
 const rows=[];
 for(let offset=0;offset<50000;offset+=1000){
  let query=client.from('cash_receipts_1c').select('id,manager_name,document_at,amount,imported_at').gte('document_at',start+'T00:00:00+03:00').lt('document_at',end+'T00:00:00+03:00').order('id').range(offset,offset+999);
  if(!boss())query=query.eq('manager_name',profile().name);
  if(signal?.aborted)throw Error('Загрузка отменена');if(signal&&typeof query.abortSignal==='function')query=query.abortSignal(signal);
  const r=await query;if(r.error)throw r.error;rows.push(...arr(r.data));if(arr(r.data).length<1000)return {amount:rows.length?rows.reduce((s,x)=>s+(n(x.amount)||0),0):null,count:rows.length,importedAt:rows.map(x=>x.imported_at).filter(Boolean).sort().at(-1),latest:rows.map(x=>x.document_at).filter(Boolean).sort().at(-1)};
 }
 throw Error('Слишком много документов для краткого обзора; откройте Поступления');
}
function load(force=false){
 if(!active())return;resetActor();const month=state.month,owner=actor();
 // Core loader is unchanged and coalesces requests already started by navigation.
 if(!state.coreRequested||force){state.coreRequested=true;state.coreTimedOut=false;const owner=actor();
  const timer=w.setTimeout(()=>{if(owner===actor()&&!coreReady(['tasks','visits','routes','absences'])){state.coreTimedOut=true;scheduleRender();}},TIMEOUT);
  Promise.resolve(force?w.crmCoreRefreshV22733?.(['tasks','visits','routes','absences']):w.crmEnsurePageDataV22733?.('dashboard')).finally(()=>{w.clearTimeout(timer);if(owner===actor()&&active()){state.coreTimedOut=false;scheduleRender();}}).catch(()=>{});
 }
 const kpi=()=>loadSlot('sales',async signal=>{const x=await rpc('crm_manager_kpi360_dashboard_v2',{p_month:month},signal);if(x.version!=='kpi360-visual-v2'||x.month!==month||!Array.isArray(x.sales))throw Error('Ответ плана продаж не подтверждён');return {version:x.version,month:x.month,latest_sales_month:x.latest_sales_month,sales:x.sales.filter(r=>FIELD.includes(r.manager_name)&&(boss()||r.manager_name===profile().name))};},force);
 const tri=()=>triAllowed()?loadSlot('triovist',async signal=>{const x=await rpc('triovist_get_dashboard',{p_end_month:month,p_mode:'month',p_start_month:null},signal);if(x.end_month!==month||!Array.isArray(x.items)||!Array.isArray(x.available_months))throw Error('Ответ Триовиста не подтверждён');return {end_month:x.end_month,available_months:x.available_months,selected_month_plans:x.selected_month_plans,items:[{current_revenue:x.items.reduce((s,r)=>s+(n(r.current_revenue)||0),0)}],last_import:x.last_import?{imported_at:x.last_import.imported_at,month:x.last_import.month}:null};},force):Promise.resolve();
 // Two small lanes: no background polling, no parser, stock or broad prefetch.
 const stillHere=()=>owner===actor()&&month===state.month&&active();
 void kpi().then(()=>stillHere()?loadSlot('pdz',async signal=>{const x=await rpc('crm_pdz360_daily_v1',{p_manager:null,p_days:30},signal);if(x.version!=='pdz360.daily.1'||!Array.isArray(x.rows)||!Array.isArray(x.series))throw Error('Ответ ПДЗ не подтверждён');return {...x,rows:x.rows.slice(0,2)};},force):null);
 void tri().then(()=>stillHere()?loadSlot('receipts',signal=>receipts(month,signal),force):null);
 scheduleRender();
}
function slotMessage(name){const s=slots()[name];return s?.error?'Данные недоступны · повторите загрузку':s?.loading?'Загружаю данные…':'Данные пока не загружены';}
function actionId(label,page,extra={}){const key=encodeURIComponent(JSON.stringify([page,label,extra.client||'',extra.filter||'',extra.scroll||'',extra.review||'']));actions.set(key,{page,...extra});return key;}
function action(label,page,extra={}){return '<button type="button" class="cc-btn" data-cc-action="'+actionId(label,page,extra)+'">'+esc(label)+'</button>';}
function card(label,value,note,page){return '<button type="button" class="cc-stat" data-cc-action="'+actionId(label,page)+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></button>';}
function planChart(rows){
 if(!rows.length)return '<p class="cc-muted">'+esc(slotMessage('sales'))+'</p>';
 const max=Math.max(1,...rows.flatMap(x=>[x.actual||0,x.plan||0]));
 return '<div class="cc-legend"><span><i class="cc-key"></i>Факт</span><span><i class="cc-key cc-key-plan"></i>План месяца</span><span>BYN</span></div><div class="cc-bars" role="img" aria-label="План и факт продаж по менеджерам и Триовисту">'+rows.map(x=>'<div class="cc-bar-row"><span>'+esc(x.name)+'</span><div><div class="cc-track cc-chart-track"><i style="width:'+Math.max(0,Math.min(100,100*(x.actual||0)/max))+'%"></i></div><div class="cc-track cc-chart-track"><i class="cc-plan-fill" style="width:'+Math.max(0,Math.min(100,100*(x.plan||0)/max))+'%"></i></div></div><span>'+esc(compact(x.actual))+' / '+esc(compact(x.plan))+'</span></div>').join('')+'</div>';
}
function debtChart(data){
 const rows=arr(data?.series).filter(x=>n(x.total)!==null&&/^\d{4}-\d\d-\d\d$/.test(x.report_date)).sort((a,b)=>a.report_date.localeCompare(b.report_date));
 if(!rows.length)return '<p class="cc-muted">'+esc(data?.no_data?'Подтверждённых отчётов ПДЗ пока нет':slotMessage('pdz'))+'</p>';
 if(rows.length===1)return '<p class="cc-muted">Один подтверждённый срез: '+esc(dateLabel(rows[0].report_date))+' · '+esc(money(rows[0].total))+'. Для динамики нужен следующий отчёт.</p>';
 const first=Date.parse(rows[0].report_date),last=Date.parse(rows.at(-1).report_date),max=Math.max(1,...rows.map(x=>x.total)),W=520,H=190;
 const px=x=>58+(Date.parse(x.report_date)-first)/(last-first)*442,py=x=>145-x.total/max*111;
 return '<svg class="cc-line" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Динамика просроченной задолженности по подтверждённым датам отчётов, BYN"><text x="0" y="17">BYN</text>'+[0,.5,1].map(t=>'<line x1="58" x2="505" y1="'+(145-111*t)+'" y2="'+(145-111*t)+'"/><text x="0" y="'+(149-111*t)+'">'+esc(compact(max*t))+'</text>').join('')+'<polyline fill="none" points="'+rows.map(x=>px(x)+','+py(x)).join(' ')+'"/>'+rows.map(x=>'<circle cx="'+px(x)+'" cy="'+py(x)+'" r="3"><title>'+esc(dateLabel(x.report_date)+': '+money(x.total))+'</title></circle>').join('')+'<text x="58" y="177">'+esc(dateLabel(rows[0].report_date))+'</text><text x="505" y="177" text-anchor="end">'+esc(dateLabel(rows.at(-1).report_date))+'</text></svg><p class="cc-muted">Только даты отчётов 1С. Изменение ПДЗ не считается поступлением денег.</p>';
}
function routeBlock(data){
 const r=data.routes,ok=data.routesReady,done=ok?r.verifiedDue.length:null,total=ok?r.duePlans.length:null,pending=ok?Math.max(0,total-done):null;
 const wb=ok?r.wb:null;
 return '<section class="cc-panel"><div class="cc-panel-head"><h3>Маршруты недели</h3><span class="cc-muted">'+(wb?esc(dateLabel(wb.start)+' — '+dateLabel(wb.end)):'Текущая неделя')+'</span></div>'+
 '<div class="cc-between"><span>Выполнено к текущей дате</span><strong>'+esc(ok?done+' / '+total:'— / —')+'</strong></div>'+
 (ok&&total>0?'<div class="cc-track" role="progressbar" aria-label="Выполнение маршрутов" aria-valuemin="0" aria-valuemax="'+total+'" aria-valuenow="'+done+'"><i style="width:'+Math.min(100,done/total*100)+'%"></i></div>':'')+
 '<p class="cc-muted">'+esc(ok?(total?pending+' точек требуют проверки. Будущие дни не включены.':'На текущую дату согласованных точек нет. Будущие дни не включены.'):coreMessage(['visits','routes','absences']))+'</p>'+
 '<div class="cc-panel-head cc-lower">'+action('Открыть маршруты',boss()?'routes-boss':'my-routes')+(ok?'<span class="cc-muted">Внеплановых за неделю: '+r.offRouteWeek.length+'</span>':'')+'</div>'+
 '<details><summary>Как считается · дополнительные сведения</summary><p class="cc-muted">Согласованные точки текущей недели до сегодняшней даты. Подтверждение — по действующим связям визитов с маршрутами. Отпуска и больничные учитываются по действующему регламенту.</p>'+(ok?'<p class="cc-muted">Отмечено «Был» без подтверждения за неделю: '+r.markedOnlyWeek.length+'. Исторических пропусков с '+esc(typeof ROUTE_CONTROL_START_LABEL!=='undefined'?ROUTE_CONTROL_START_LABEL:'начала контроля')+': '+r.overdue.length+'.</p>':'')+'</details></section>';
}
function problems(data,rows,pdz){
 const list=[];
 arr(pdz?.rows).filter(x=>n(x.overdue)>0).slice(0,2).forEach(x=>list.push({title:'Проверить погашение: '+x.client_name,note:[x.manager_name,dateLabel(pdz.report_date),x.days_overdue+' дней просрочки'].join(' · '),amount:money(x.overdue),page:'debt',client:x.client_id}));
 const tri=rows.find(x=>x.kind==='triovist');
 if(tri){
  if(tri.actual===null)list.push({title:'Триовист: нет продаж за выбранный месяц',note:'План '+money(tri.plan)+' · требуется проверить импорт в исходном разделе',amount:'Нет факта',page:'triovist'});
  else if(!tri.plan)list.push({title:'Триовист: план месяца не задан',note:'Факт '+money(tri.actual)+' · проверьте сохранённые планы',amount:'Без плана',page:'triovist'});
  else if(tri.actual<tri.plan)list.push({title:'Триовист: проверить выполнение плана',note:'Интернет-магазин · '+pct(tri.actual,tri.plan)+' месячного плана. Причина не установлена.',amount:'До плана '+money(tri.plan-tri.actual),page:'triovist'});
 }
 const overdue=overdueTasks(data);
 if(overdue.length)list.push({title:'Разобрать просроченные обязательства',note:'Действующие рабочие задачи · на '+dateLabel(day()),amount:overdue.length+' задач',page:'tasks',filter:'overdue'});
 if(data.routesReady&&data.routes.duePlans.length>data.routes.verifiedDue.length)list.push({title:'Проверить незакрытые точки маршрута',note:'Текущая неделя, только до сегодняшней даты',amount:(data.routes.duePlans.length-data.routes.verifiedDue.length)+' точек',page:boss()?'routes-boss':'my-routes'});
 return list;
}
function sourceNotes(){return '<details class="cc-sources"><summary>Источники и актуальность данных</summary>'+['sales','triovist','pdz','receipts'].filter(k=>k!=='triovist'||triAllowed()).map(k=>{const s=slots()[k],names={sales:'План продаж · KPI 360°',triovist:'Триовист · сохранённые продажи и планы',pdz:'ПДЗ · отчёты 1С',receipts:'Поступления · документы 1С'};return '<p class="cc-muted">'+names[k]+': '+esc(s?.error?'не удалось прочитать':s?.loading?'обновляется':s?.data?'прочитано '+stamp(s.at):'ожидание загрузки')+'</p>';}).join('')+'<p class="cc-muted">Продажи — по действующей методике KPI 360°. Триовист — отдельный источник, одна строка в плане. ПДЗ и маршруты всегда показывают свой текущий период независимо от выбранного месяца продаж. Дневной план не рассчитывается.</p></details>';}
function paint(root,html){
 // Patch only changed top-level blocks (and the two chart panels). Keep the
 // month picker, focus and opened route details when unrelated data arrives.
 if(!root.children?.length||state.legacy||!painted.size){root.innerHTML=html;painted.clear();if(root.children?.length)Array.from(root.children).forEach((el,i)=>painted.set(String(i),el.outerHTML));return;}
 const next=d.createElement('div');next.innerHTML=html;
 if(root.children.length!==next.children.length){root.innerHTML=html;painted.clear();return;}
 Array.from(next.children).forEach((el,i)=>{const key=String(i),target=root.children[i],markup=el.outerHTML;if(painted.get(key)===markup)return;
  if(el.classList.contains('cc-columns')&&target.children.length===el.children.length){Array.from(el.children).forEach((panel,j)=>{const pk=key+':'+j;if(painted.get(pk)!==panel.outerHTML){target.children[j].innerHTML=panel.innerHTML;painted.set(pk,panel.outerHTML);}});}
  else target.innerHTML=el.innerHTML;
  painted.set(key,markup);
 });
}
function refreshNotice(){
 const stale=Object.keys(slots()).filter(k=>slots()[k].data&&(slots()[k].loading||slots()[k].error||Date.now()-slots()[k].at>=TTL));
 const errors=Object.keys(slots()).filter(k=>slots()[k].error);
 const names={sales:'Продажи',triovist:'Триовист',pdz:'ПДЗ',receipts:'Поступления'};
 if(!stale.length&&!errors.length&&!state.coreTimedOut)return '';
 const at=stale.map(k=>slots()[k].at).filter(Boolean).sort((a,b)=>a-b)[0];
 return '<div class="cc-panel cc-refresh-note" role="status">'+(stale.length?'<span>Показаны последние данные · прочитано '+esc(stamp(at))+(errors.length?'. Обновить не удалось.':'. Обновляю…')+'</span>':'')+(errors.length||state.coreTimedOut?'<span>'+esc(errors.map(k=>names[k]).concat(state.coreTimedOut?['Задачи и маршруты']:[]).join(', '))+': источник временно недоступен. </span><button type="button" class="cc-btn" data-cc-refresh>Повторить загрузку</button>':'')+'</div>';
}
function render(){
 if(!active())return;resetActor();const root=mount();if(!root)return;
 const page=d.getElementById('page-dashboard');page.classList.toggle('cc-installed',!state.legacy);
 if(state.legacy){const notice=d.getElementById('cc-refresh-status');if(notice)notice.hidden=true;root.innerHTML='<div class="cc-panel cc-panel-head"><h3>Исходная сводка</h3><button type="button" class="cc-btn" data-cc-legacy>Вернуться в Центр управления</button></div>';return;}
 actions=new Map();
 const data=localData(),kpi=slots().sales?.data,tri=triAllowed()?slots().triovist?.data:null,pdz=slots().pdz?.data,receipt=slots().receipts?.data;
 const rows=salesRows(kpi,tri,state.month,boss()?'':profile().name),sum=totals(rows),allSalesReady=Boolean(kpi)&&(!triAllowed()||Boolean(tri));
 const overdue=overdueTasks(data),issues=problems(data,rows,pdz);
 const amount=allSalesReady?sum.actual:null,plan=allSalesReady?sum.plan:null;
 const coverage=triAllowed()?'Команда Витебска и Триовист':'Команда Витебска · в пределах ваших прав';
 const dates=Array.from({length:12},(_,i)=>{const dt=new Date(monthNow()+'-01T12:00:00');dt.setMonth(dt.getMonth()-i);return dt.getFullYear()+'-'+String(dt.getMonth()+1).padStart(2,'0');});
 const metrics=card('Продажи · план / факт',compact(amount),allSalesReady?(plan?'План '+money(plan)+' · '+pct(amount,plan):'План задан не для всех строк'):'Загружаю / проверяю источники','sales')+
 card('Поступления · '+monthLabel(state.month),compact(receipt?.amount),receipt?(receipt.count?'BYN · последний документ '+dateLabel(String(receipt.latest).slice(0,10)):'За выбранный месяц документов нет'):slotMessage('receipts'),'payments')+
 card('Просроченная задолженность',compact(pdz?.report_date?pdz.metrics?.amount:null),pdz?.report_date?'BYN · отчёт '+dateLabel(pdz.report_date):pdz?.no_data?'Отчётов ПДЗ пока нет':slotMessage('pdz'),'debt')+
 card('Просроченные задачи',data.tasksReady?String(overdue.length):'—',data.tasksReady?'Рабочие задачи на '+dateLabel(day()):coreMessage(['tasks','absences']),'tasks');
 const brief=[];
 if(allSalesReady&&n(amount)!==null&&plan)brief.push('Продажи: '+pct(amount,plan)+' месячного плана.');
 if(pdz?.report_date)brief.push('ПДЗ: '+money(pdz.metrics?.amount)+' по отчёту '+dateLabel(pdz.report_date)+'.');
 if(issues.length)brief.push('Внимания требуют '+issues.length+' вопросов — ниже собраны подтверждённые отклонения.');
 if(!brief.length)brief.push('Проверяю источники. Сводка появится по мере загрузки данных.');
 const salesTable=rows.length?'<div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Продажи</th><th>Факт / план, BYN</th><th>Выполнение</th></tr></thead><tbody>'+rows.map(x=>'<tr><td><strong>'+esc(x.name)+'</strong>'+(x.kind==='triovist'?'<div class="cc-muted">Интернет-магазин</div>':'')+'</td><td>'+esc(money(x.actual)+' / '+money(x.plan))+'</td><td>'+esc(pct(x.actual,x.plan))+'</td></tr>').join('')+'<tr><td><strong>Всего'+(!allSalesReady?' · неполные данные':'')+'</strong></td><td>'+esc(money(amount)+' / '+money(plan))+'</td><td>'+esc(pct(amount,plan))+'</td></tr></tbody></table></div>':'';
 const issuesHTML=issues.length?issues.map((x,i)=>'<div class="cc-issue"><span class="cc-rank">'+String(i+1).padStart(2,'0')+'</span><div><h4>'+esc(x.title)+'</h4><p class="cc-muted">'+esc(x.note)+'</p></div><div><strong>'+esc(x.amount)+'</strong>'+action('Разобрать →',x.page,x)+'</div></div>').join(''):'<p class="cc-muted">'+esc(data.tasksReady&&kpi&&pdz&&(!triAllowed()||tri)?'Подтверждённых вопросов по доступным источникам нет.':'Проверяю доступные источники…')+'</p>';
 const team=arr(kpi?.sales).filter(x=>FIELD.includes(x.manager_name)&&(boss()||x.manager_name===profile().name));
 const teamHTML=team.length?'<div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Менеджер</th><th>План продаж</th><th>Просрочено задач</th></tr></thead><tbody>'+team.map(x=>'<tr><td>'+esc(x.manager_name)+'</td><td>'+esc(pct(rows.find(r=>r.name===x.manager_name)?.actual,x.shipment_plan))+'</td><td>'+(data.tasksReady?overdue.filter(t=>{let client;try{client=allClients.find(c=>c.id===t.client_id)}catch(_){}return (t.manager_name||client?.manager_name)===x.manager_name;}).length:'—')+'</td></tr>').join('')+'</tbody></table></div>':'<p class="cc-muted">'+esc(slotMessage('sales'))+'</p>';
 const html='<header class="cc-head"><div><div class="cc-kicker">Обзор работы</div><h2>Центр управления</h2><p class="cc-muted">'+esc(coverage)+'</p></div><div class="cc-controls"><label for="cc-month">Продажи и поступления<select id="cc-month" data-cc-month>'+dates.map(m=>'<option value="'+m+'"'+(m===state.month?' selected':'')+'>'+esc(monthLabel(m))+'</option>').join('')+'</select></label><button class="cc-btn" type="button" data-cc-refresh>Обновить</button></div></header>'+
 '<div class="cc-metrics">'+metrics+'</div>'+routeBlock(data)+'<section class="cc-brief"><strong>✦ Брифинг Леры</strong><p>'+esc(brief.join(' '))+'</p>'+action('Открыть разбор','dashboard',{scroll:'cc-issues'})+'<span class="cc-muted">Сводка по данным CRM · без автоматических действий</span></section>'+
 '<div class="cc-columns"><section class="cc-panel"><div class="cc-panel-head"><h3>План и факт продаж</h3><span class="cc-muted">'+esc(monthLabel(state.month))+'</span></div>'+planChart(rows)+salesTable+'<p class="cc-muted">План месяца, не дневной. '+esc(kpi?.latest_sales_month&&state.month>kpi.latest_sales_month?'Продажи команды за выбранный месяц ещё не загружены.':'Действующая методика KPI 360°. При отсутствии плана процент не рассчитывается.')+'</p>'+action('Открыть продажи','sales')+'</section>'+
 '<section class="cc-panel"><div class="cc-panel-head"><h3>Просроченная задолженность</h3><span class="cc-muted">Последние 30 отчётных дней</span></div>'+debtChart(pdz)+action('Открыть задолженность','debt')+'</section></div>'+
 '<section class="cc-panel" id="cc-issues"><div class="cc-panel-head"><h3>Требует решения</h3><span class="cc-muted">'+issues.length+' вопросов · текущие обязательства и выбранный месяц</span></div>'+issuesHTML+checksBlock()+'</section>'+
 '<section class="cc-panel"><div class="cc-panel-head"><h3>'+(boss()?'Команда':'Мои результаты')+'</h3>'+action('Открыть KPI','managers')+'</div>'+teamHTML+'</section>'+sourceNotes()+'<div class="cc-bottom"><button type="button" class="cc-link" data-cc-legacy>Исходная сводка и подробные списки</button><span class="cc-muted">Центр управления · v1</span></div>';
 paint(root,html);let notice=d.getElementById('cc-refresh-status');if(!notice){notice=d.createElement('div');notice.id='cc-refresh-status';notice.addEventListener('click',onClick);root.insertAdjacentElement?.('beforebegin',notice);}notice.hidden=false;notice.innerHTML=refreshNotice();
 const tt=d.getElementById('topbar-title');if(tt)tt.textContent='Центр управления';
}
function mount(){
 const page=d.getElementById('page-dashboard');if(!page)return null;
 let root=d.getElementById(ID);
 if(!root){root=d.createElement('section');root.id=ID;root.setAttribute('aria-label','Центр управления');page.prepend(root);root.addEventListener('click',onClick);root.addEventListener('change',onChange);}
 return root;
}
function onClick(e){
 const b=e.target.closest?.('button');if(!b||!active())return;
 if(b.hasAttribute('data-cc-refresh')){load(true);return;}
 if(b.hasAttribute('data-cc-checks')){void loadChecks();return;}
 if(b.hasAttribute('data-cc-more')){const key=b.dataset.ccMore;if(!['vip','promotions','tasks','clients'].includes(key))return;checks.limits=checks.limits||{};checks.limits[key]=(checks.limits[key]||10)+10;scheduleRender();return;}
 if(b.hasAttribute('data-cc-legacy')){state.legacy=!state.legacy;painted.clear();if(state.legacy)legacyBuild?.();render();return;}
 if(!b.hasAttribute('data-cc-action'))return;
 const a=actions.get(b.dataset.ccAction);if(!a)return;
 if(a.scroll){d.getElementById(a.scroll)?.scrollIntoView({behavior:'smooth',block:'start'});return;}
 if(a.page==='tasks'&&a.filter==='overdue'&&typeof w.goToTasksFiltered==='function'){w.goToTasksFiltered('overdue');return;}
 if(a.review&&boss()&&typeof w.acknowledgePartialReview==='function'){
  void Promise.resolve(w.acknowledgePartialReview(a.review)).then(()=>loadChecks()).catch(()=>loadChecks());return;
 }
 // All destinations pass through existing authorization/navigation wrappers.
 const titles={clients:'Клиенты',vip:'ВИП клиенты',promotions:'Акции',sales:'Продажи',payments:'Поступления 1С',debt:'Задолженность',tasks:'Задачи',managers:'KPI менеджеров',triovist:'Триовист / 21vek.by','routes-boss':'Согласование маршрутов','my-routes':'Мои маршруты'};
 if(a.page==='triovist'&&!triAllowed())return;
 w.goPage?.(a.page,titles[a.page]||a.page);
}
function onChange(e){if(!active()||!e.target.matches?.('[data-cc-month]'))return;const m=String(e.target.value);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)||m>monthNow())return;persist();state.month=m;state.slots={};restore();load();}
function prepareAgentRequest(question,memory={}){
 const unchanged={question,memory};if(!active()||state.legacy||state.actor!==actor())return unchanged;
 const q=String(question||'');
 const months=['январ','феврал','март','апрел','мая','июн','июл','август','сентябр','октябр','ноябр','декабр'];
 const iso=q.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/),named=months.findIndex(x=>q.toLowerCase().includes(x)),year=q.match(/\b20\d{2}\b/);
 const month=iso?iso[0]:named>=0?(year?year[0]:state.month.slice(0,4))+'-'+String(named+1).padStart(2,'0'):state.month;
 const next={...memory,month};
 if(/^(?:лера[, ]+)?(?:создай|создать|поставь|назначь|отправь|удали|измени|утверди|согласуй|напомни|запланируй|открой|перейди|вернись|покажи раздел)(?:\s|$)/i.test(q))return {question,memory:next};
 const deictic=/здесь|на этом экране|этот процент|эти цифры|центр(?:е|а)? управления|этой сводк/i.test(q);
 if(!deictic||!/процент|цифр|план|выручк|продаж|задач|маршрут|пдз|задолж|поступлен|проблем|экран|сводк|центр(?:е|а)? управления|что\s+(?:у нас\s+)?здесь/i.test(q))return {question,memory:next};
 // No browser-provided amounts, names of clients or claims of freshness. The
 // existing server reauthorizes and rereads every financial/operational fact.
 const context={screen:'Центр управления',sales_month:month,sales_scope:triAllowed()?'План команды Витебска и интернет-магазина Триовист, Триовист учтён один раз':boss()?'Команда Витебска в пределах прав доступа':'Только мои показатели',routes_period:'Текущая неделя, точки до сегодняшнего дня',debt_period:'Последний подтверждённый отчёт'};
 const hint='\nКонтекст интерфейса, не подтверждение цифр: '+JSON.stringify(context);
 return {question:q.length+hint.length<=2400?q+hint:q,memory:{...next,...(boss()?{branch:'Витебск',manager:'',subject:'network'}:{})}};
}
function install(){
 if(installed)return;installed=true;
 syncSignalsNav();
 const navigate=w.goPage;
 if(typeof navigate==='function'){w.goPage=function(page,title){
  syncSignalsNav();if(page!=='alerts'||!allowed())return navigate.apply(this,arguments);
  state.legacy=false;const out=navigate.call(this,'dashboard','Центр управления');
  Promise.resolve(out).then(()=>{if(!active())return;resetActor();render();
   d.getElementById('cc-extra-checks')?.scrollIntoView({behavior:'smooth',block:'start'});
   if(checks.status==='idle')void loadChecks();
  });return out;
 };}
 const base=w.buildDashboard;
 legacyBuild=typeof base==='function'?()=>base.call(w):null;
 if(typeof base==='function'){
  const fn=function(){syncSignalsNav();if(!allowed()){d.getElementById('page-dashboard')?.classList.remove('cc-installed');return base.apply(this,arguments);}resetActor();
   if(nativeActor!==actor()){nativeActor=actor();w.crmDashboardNativeHooksV1?.();}
   operationCache=null;w.crmSingleRenderMarkPageV227327?.('dashboard');
   if(state.legacy)return base.apply(this,arguments);
   if(active()){render();load();}
  };
  fn.__controlCenterV1=true;fn.__base=base;w.buildDashboard=fn;
 }
 // Only the home menu label changes; page ID and routing contracts are stable.
 const nav=d.getElementById('nav-dashboard');if(nav){const icon=nav.querySelector('.icon');nav.textContent=' Центр управления';if(icon)nav.prepend(icon);nav.setAttribute('aria-label','Центр управления');}
 const page=d.getElementById('page-dashboard');
 if(page&&typeof w.MutationObserver==='function'){let was=Boolean(active());const observer=new w.MutationObserver(()=>{const now=Boolean(active());if(now&&!was){resetActor();render();load();}was=now;});observer.observe(page,{attributes:true,attributeFilter:['class']});}
 if(active()){resetActor();render();load();}
 if(allowed()&&d.getElementById('page-alerts')?.classList.contains('active'))w.goPage?.('alerts','Сигналы');
}
w.RESANTA_CONTROL_CENTER_V1=Object.freeze({version:'20261113.3',readOnly:true,signalsMerged:allowed,install,salesRows,totals,prepareAgentRequest,refresh:()=>load(true)});
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(window,document);
