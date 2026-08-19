/* RESANTA CRM v23.5.2.1 · AUTO ROUTE PILOT / READ-ONLY RETROTEST
 * Pilot only: Aчинович, 2026-08-10..2026-08-14.
 * Absolutely no writes to route_plans or any other table.
 * Reads current client/physical-point assignments and historical GPS/visits,
 * then builds a deterministic regulation-based draft for comparison.
 */
(function(){
'use strict';
if(window.RESANTA_ROUTE_PILOT_V2352)return;

const VERSION='v23.5.2.1';
const PILOT_MANAGER='Ачинович';
const PILOT_START='2026-08-10';
const PILOT_END='2026-08-14';
const PILOT_MONTH='2026-08';
const HOME={city:'Бобруйск',lat:53.1384,lng:29.2214};
const PANEL_ID='route-auto-pilot-v2352';
const RESULT_ID='route-auto-pilot-result-v2352';
const MAX_POINTS_PER_DAY=15;
const TARGET_POINTS_PER_DAY=8;
const ROAD_FACTOR=1.22; // estimate only, never shown as exact road distance
const AVG_ROAD_SPEED_KMH=58; // estimate only, never shown as exact travel time
const BAHUS_MATCH=/бахус/i;
let runPromise=null;
let installTimer=null;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v||'').trim().toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9%]+/gi,' ').replace(/\s+/g,' ').trim();
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const finite=v=>Number.isFinite(Number(v));
const dateOnly=v=>String(v||'').slice(0,10);
function role(){try{return String(window.currentProfile?.role||currentProfile?.role||'');}catch(_){return String(window.currentProfile?.role||'');}}
function clientsGlobal(){try{return Array.isArray(allClients)?allClients:[];}catch(_){return[];}}
function tasksGlobal(){try{return Array.isArray(allTasks)?allTasks:[];}catch(_){return[];}}
function isBoss(){return role()==='boss';}
function localDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function addDays(s,n){const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return localDate(d);}
function dow(s){return new Date(s+'T12:00:00').getDay();}
function mondayOf(s){const d=new Date(s+'T12:00:00'),x=d.getDay()||7;d.setDate(d.getDate()-x+1);return localDate(d);}
function fmtKm(v){return (Math.round((Number(v)||0)*10)/10).toLocaleString('ru-RU',{maximumFractionDigits:1})+' км';}
function fmtMin(v){const m=Math.max(0,Math.round(Number(v)||0));return m<60?m+' мин':Math.floor(m/60)+' ч '+String(m%60).padStart(2,'0')+' мин';}
function hash(s){let h=2166136261;for(const ch of String(s||'')){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function haversine(a,b){if(!a||!b)return 0;const R=6371,toRad=x=>x*Math.PI/180,dLat=toRad(b.lat-a.lat),dLng=toRad(b.lng-a.lng);const q=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(q));}
function roadKm(a,b){return haversine(a,b)*ROAD_FACTOR;}
function travelMinutes(km){return km<=0?0:Math.max(4,Math.round(km/AVG_ROAD_SPEED_KMH*60));}
function coordOf(x){
  if(finite(x?.lat)&&finite(x?.lng)&&Math.abs(Number(x.lat))>.000001&&Math.abs(Number(x.lng))>.000001)return{lat:Number(x.lat),lng:Number(x.lng)};
  if(finite(x?.gps_lat)&&finite(x?.gps_lng)&&Math.abs(Number(x.gps_lat))>.000001&&Math.abs(Number(x.gps_lng))>.000001)return{lat:Number(x.gps_lat),lng:Number(x.gps_lng)};
  return null;
}

function category(c){
  const raw=String(c?.role_type||c?.category||'C').toUpperCase().replace(/Ё/g,'Е').replace(/\s+/g,'');
  if(raw.includes('ПЕРЕДАН'))return'Передан на 3%';
  if(raw.includes('ОПТОВ'))return'Оптовик';
  if(raw.includes('ИНТЕРНЕТ'))return'Интернет';
  if(raw==='AAA'||raw==='ААА')return'AAA';
  if(raw==='A'||raw==='А')return'A';
  if(raw==='B'||raw==='В')return'B';
  return'C';
}
function categoryRank(cat){return{AAA:6,A:5,B:4,'Передан на 3%':3,C:2,Оптовик:1,Интернет:1}[cat]||0;}
function standardVisits(cat){if(cat==='AAA'||cat==='A')return 4;if(cat==='B'||cat==='Передан на 3%')return 2;return 1;}
function isPotential(c){return norm(c?.client_status)==='потенциальный';}
function isWorking(c){const s=norm(c?.client_status);return s==='рабочий'||s==='потенциальный'||(!s&&!c?.is_archived);}
function sku(c){return Math.max(0,Math.round(num(c?.sku_count)));}
function clientName(c){return String(c?.name||c?.client_name||'Клиент').trim();}
function isBahus(c){return BAHUS_MATCH.test(norm(clientName(c)));}
function profileVisitOverride(p){
  const keys=['visits_per_month','monthly_visits','required_visits','visit_frequency','route_visits_per_month'];
  for(const k of keys){const v=Number(p?.[k]);if(Number.isFinite(v)&&v>0&&v<=8)return Math.round(v);}
  return null;
}
function requiredVisits(c,p){
  if(isBahus(c))return{count:1,source:'Индивидуально согласовано: 1 визит/месяц (пилот Бахус)'};
  const override=profileVisitOverride(p);
  if(override)return{count:override,source:'Индивидуальная частота из маршрутного профиля'};
  if(isPotential(c))return{count:1,source:'Потенциальная ТТ: первичный визит'};
  const cat=category(c);return{count:standardVisits(cat),source:'Регламент категории '+cat};
}
function routeMode(p){return String(p?.route_mode||'auto').toLowerCase();}
function eligibility(c,p,hasExplicitProfile){
  const mode=routeMode(p),cat=category(c),s=norm(c?.client_status);
  if(c?.is_archived===true||s==='закрыт'||mode==='exclude')return{kind:'exclude',reason:'Закрыт/архив/исключён из маршрута'};
  if(mode==='call')return{kind:'exclude',reason:'Маршрутный профиль: прозвон вместо визита'};
  if(mode==='manual')return{kind:'manual',reason:p?.manager_note||'Маршрутный профиль требует решения руководителя'};
  if(!isWorking(c))return{kind:'exclude',reason:'Не рабочий и не потенциальный клиент'};
  if(!isPotential(c)&&cat==='C'&&sku(c)<10)return{kind:'manual',reason:'Регламент: C с менее 10 SKU — только по согласованию с ДФ'};
  if(!isPotential(c)&&(cat==='Оптовик'||cat==='Интернет')&&!hasExplicitProfile)return{kind:'manual',reason:'Регламент: '+cat+' — посещение по согласованию с ДФ'};
  return{kind:'eligible',reason:'Готов к автоматическому черновику'};
}

async function loadAllSafe(table){
  try{
    if(typeof loadAllRows==='function')return await loadAllRows(table);
  }catch(e){console.warn('pilot loadAllRows '+table,e);}
  const out=[];let from=0;
  for(let i=0;i<20;i++){
    const {data,error}=await db.from(table).select('*').range(from,from+999);
    if(error)throw error;const rows=data||[];out.push(...rows);if(rows.length<1000)break;from+=1000;
  }
  return out;
}
async function queryFiltered(table,build){
  try{let q=db.from(table).select('*');q=build(q);const {data,error}=await q;if(error)throw error;return data||[];}
  catch(e){console.warn('route pilot '+table,e);return[];}
}
async function loadPilotData(){
  const freshClients=await queryFiltered('clients',q=>q.eq('manager_name',PILOT_MANAGER));
  const clients=freshClients.length?freshClients:clientsGlobal().filter(c=>norm(c?.manager_name)===norm(PILOT_MANAGER));
  const [points,links,profiles,gps,visits,plans]=await Promise.all([
    loadAllSafe('route_physical_points').catch(e=>{console.warn(e);return[];}),
    loadAllSafe('route_physical_point_clients').catch(e=>{console.warn(e);return[];}),
    loadAllSafe('client_route_profiles').catch(e=>{console.warn(e);return[];}),
    queryFiltered('gps_workdays',q=>q.eq('manager_name',PILOT_MANAGER).gte('work_date',PILOT_START).lte('work_date',PILOT_END).order('work_date',{ascending:true})),
    queryFiltered('visits',q=>q.eq('manager_name',PILOT_MANAGER).gte('date',PILOT_START).lte('date',PILOT_END).order('date',{ascending:true})),
    queryFiltered('route_plans',q=>q.eq('manager_name',PILOT_MANAGER).gte('visit_date',PILOT_START).lte('visit_date',PILOT_END).order('visit_date',{ascending:true}))
  ]);
  return{clients,points:(points||[]).filter(p=>p?.active!==false),links:links||[],profiles:profiles||[],gps,visits,plans,tasks:tasksGlobal()};
}

function buildPhysicalModel(data){
  const cMap=new Map(data.clients.map(c=>[String(c.id),c]));
  const pMap=new Map(data.profiles.map(p=>[String(p.client_id),p]));
  const linksByPoint=new Map(),linkedClientIds=new Set();
  for(const l of data.links){const k=String(l.point_id);if(!linksByPoint.has(k))linksByPoint.set(k,[]);linksByPoint.get(k).push(l);}
  const auto=[],manual=[],excluded=[];
  function pushClientDecision(c,pointLabel){
    const p=pMap.get(String(c.id))||{},hasProfile=pMap.has(String(c.id)),d=eligibility(c,p,hasProfile);
    const row={client:c,profile:p,decision:d,pointLabel};
    if(d.kind==='manual')manual.push(row);else if(d.kind==='exclude')excluded.push(row);
    return row;
  }
  for(const point of data.points){
    const linked=(linksByPoint.get(String(point.id))||[]).map(l=>({link:l,client:cMap.get(String(l.client_id))})).filter(x=>x.client);
    if(!linked.length)continue;
    if(point.manager_name&&norm(point.manager_name)!==norm(PILOT_MANAGER)&&!linked.some(x=>norm(x.client.manager_name)===norm(PILOT_MANAGER)))continue;
    const eligible=[];const allNames=[];
    for(const x of linked){
      if(norm(x.client.manager_name)!==norm(PILOT_MANAGER))continue;
      linkedClientIds.add(String(x.client.id));allNames.push(clientName(x.client));
      const row=pushClientDecision(x.client,point.address||point.city||'физическая ТТ');
      if(row.decision.kind==='eligible')eligible.push(row);
    }
    if(!eligible.length)continue;
    const primary=eligible.find(x=>linked.find(l=>String(l.client.id)===String(x.client.id))?.link?.is_primary)||eligible[0];
    const cat=eligible.map(x=>category(x.client)).sort((a,b)=>categoryRank(b)-categoryRank(a))[0]||'C';
    const freqRows=eligible.map(x=>({x,...requiredVisits(x.client,x.profile)}));
    const maxFreq=Math.max(...freqRows.map(x=>x.count),1);
    const coord=coordOf(point)||coordOf(primary.client);
    const city=String(point.city||primary.client.city||primary.profile.route_city||primary.client.region||'').trim();
    const region=String(point.region||primary.profile.route_region||primary.client.region||'').trim();
    if(!coord){
      manual.push({
        client:primary.client,
        profile:primary.profile,
        decision:{kind:'manual',reason:'Нет подтверждённых координат физической ТТ'},
        pointLabel:String(point.address||point.city||primary.client.address||city||'физическая ТТ').trim()
      });
      continue;
    }
    auto.push({
      key:'point:'+String(point.id),pointId:String(point.id),clientIds:eligible.map(x=>String(x.client.id)),
      label:allNames.length>1?clientName(primary.client)+' + ещё '+(allNames.length-1)+' юрлиц':clientName(primary.client),
      names:allNames.length?allNames:[clientName(primary.client)],category:cat,visits:maxFreq,
      freqReasons:[...new Set(freqRows.filter(x=>x.count===maxFreq).map(x=>x.source))],
      city,region,address:String(point.address||primary.client.address||'').trim(),coord,
      zone:[region,city].filter(Boolean).join(' / ')||'Без города',
      priority:Math.max(...eligible.map(x=>categoryRank(category(x.client)))),potential:eligible.some(x=>isPotential(x.client)),
      bahus:eligible.some(x=>isBahus(x.client)),source:'physical_point'
    });
  }
  for(const c of data.clients){
    if(linkedClientIds.has(String(c.id)))continue;
    const p=pMap.get(String(c.id))||{},hasProfile=pMap.has(String(c.id)),d=eligibility(c,p,hasProfile);
    if(d.kind==='manual'){manual.push({client:c,profile:p,decision:d,pointLabel:'нет физической связи'});continue;}
    if(d.kind==='exclude'){excluded.push({client:c,profile:p,decision:d,pointLabel:'нет физической связи'});continue;}
    const f=requiredVisits(c,p),coord=coordOf(c),city=String(p.route_city||c.city||c.region||'').trim(),region=String(p.route_region||c.region||'').trim();
    if(!coord){manual.push({client:c,profile:p,decision:{kind:'manual',reason:'Нет подтверждённых координат физической ТТ'},pointLabel:city||c.address||''});continue;}
    auto.push({key:'client:'+String(c.id),pointId:null,clientIds:[String(c.id)],label:clientName(c),names:[clientName(c)],category:category(c),visits:f.count,freqReasons:[f.source],city,region,address:String(c.address||'').trim(),coord,zone:[region,city].filter(Boolean).join(' / ')||'Без города',priority:categoryRank(category(c)),potential:isPotential(c),bahus:isBahus(c),source:'client_fallback'});
  }
  return{auto,manual,excluded,pMap,linksByPoint};
}

function monthWeeks(ym){
  const y=Number(ym.slice(0,4)),m=Number(ym.slice(5,7));
  const last=new Date(y,m,0),lastStr=localDate(last);
  let first=ym+'-01',mon=mondayOf(first),out=[];
  while(mon<=lastStr){
    const field=[];for(let i=0;i<5;i++){const d=addDays(mon,i);if(d.startsWith(ym))field.push(d);}
    if(field.length)out.push({monday:mon,field,weight:field.length});
    mon=addDays(mon,7);
  }
  return out;
}
function targetWeeksFor(point,weeks){
  const full=weeks.map((w,i)=>({w,i})).filter(x=>x.w.weight>=4).map(x=>x.i);
  const usable=full.length?full:weeks.map((_,i)=>i),freq=Math.max(1,Math.min(4,point.visits));
  if(freq>=4)return usable.slice(0,Math.min(4,usable.length));
  if(freq===2){
    if(usable.length<=2)return usable.slice(0,2);
    const offset=hash(point.zone)%2;
    const a=usable[Math.min(offset,usable.length-1)],b=usable[Math.min(offset+2,usable.length-1)];
    return [...new Set([a,b])];
  }
  const base=hash(point.zone||point.key)%usable.length;return[usable[base]];
}
function activeWeekIndex(weeks){const mon=mondayOf(PILOT_START);return Math.max(0,weeks.findIndex(w=>w.monday===mon));}
function openTaskCount(point,data){
  const end=PILOT_END+'T23:59:59';
  return (data.tasks||[]).filter(t=>point.clientIds.includes(String(t.client_id))&&!t.done&&String(t.manager_name||PILOT_MANAGER)===PILOT_MANAGER&&(!t.created_at||String(t.created_at)<=end)).length;
}
function dueForPilotWeek(points,data){
  const weeks=monthWeeks(PILOT_MONTH),wi=activeWeekIndex(weeks),due=[];
  for(const p of points){const tw=targetWeeksFor(p,weeks);if(tw.includes(wi)){due.push({...p,targetWeekIndexes:tw,openTasks:openTaskCount(p,data),dueReason:p.freqReasons.join('; ')});}}
  due.sort((a,b)=>b.openTasks-a.openTasks||b.priority-a.priority||a.zone.localeCompare(b.zone,'ru')||a.label.localeCompare(b.label,'ru'));
  return{due,weeks,weekIndex:wi};
}

function validCoordItem(x){return !!(x?.coord&&finite(x.coord.lat)&&finite(x.coord.lng));}
function centroid(items){
  const valid=(items||[]).filter(validCoordItem);
  if(!valid.length)return HOME;
  return{lat:valid.reduce((s,x)=>s+x.coord.lat,0)/valid.length,lng:valid.reduce((s,x)=>s+x.coord.lng,0)/valid.length};
}
function clusterPoints(items,k){
  items=(items||[]).filter(validCoordItem);
  if(!items.length)return[];k=Math.max(1,Math.min(k,items.length));
  const seeds=[];let first=items.slice().sort((a,b)=>haversine(HOME,b.coord)-haversine(HOME,a.coord))[0];seeds.push({...first.coord});
  while(seeds.length<k){let best=null;for(const x of items){const d=Math.min(...seeds.map(s=>haversine(s,x.coord)));if(!best||d>best.d)best={d,x};}seeds.push({...best.x.coord});}
  let groups=[];
  for(let iter=0;iter<5;iter++){
    groups=Array.from({length:k},()=>[]);
    for(const x of items){let bi=0,bd=Infinity;seeds.forEach((s,i)=>{const d=haversine(s,x.coord);if(d<bd){bd=d;bi=i;}});groups[bi].push(x);}
    groups.forEach((g,i)=>{if(g.length)seeds[i]=centroid(g);});
  }
  return groups.filter(Boolean).filter(g=>g.length);
}
function pathFromStart(items,startIndex){
  items=(items||[]).filter(validCoordItem);
  if(!items.length)return[];
  startIndex=Math.max(0,Math.min(Number(startIndex)||0,items.length-1));
  const left=items.slice(),out=[];let current=left.splice(startIndex,1)[0];out.push(current);
  while(left.length){let bi=0,bd=Infinity;left.forEach((x,i)=>{const d=roadKm(current.coord,x.coord);if(d<bd){bd=d;bi=i;}});current=left.splice(bi,1)[0];out.push(current);}
  return out;
}
function pathKm(path){let km=0;for(let i=1;i<path.length;i++)km+=roadKm(path[i-1].coord,path[i].coord);return km;}
function orderCluster(items){
  items=(items||[]).filter(validCoordItem);
  if(items.length<2)return{items:items.slice(),km:0,mode:'одна зона'};
  let near=0,far=0,nearD=Infinity,farD=-1;
  items.forEach((x,i)=>{const d=haversine(HOME,x.coord);if(d<nearD){nearD=d;near=i;}if(d>farD){farD=d;far=i;}});
  const a=pathFromStart(items,far),b=pathFromStart(items,near),ak=pathKm(a),bk=pathKm(b);
  if(ak<=bk)return{items:a,km:ak,mode:'начать с дальней части и двигаться по кластеру'};
  return{items:b,km:bk,mode:'начать с ближней части и двигаться по кластеру'};
}
function inferOfficeDate(plans){
  const office=(plans||[]).find(r=>r?.is_office_day===true||norm(r?.client_name)==='офисный день'||norm(r?.category)==='офис');
  if(office&&dateOnly(office.visit_date)>=PILOT_START&&dateOnly(office.visit_date)<=PILOT_END)return dateOnly(office.visit_date);
  return PILOT_END; // Friday in pilot week
}
function makeDraft(due,data){
  const officeDate=inferOfficeDate(data.plans),fieldDays=[];
  for(let d=PILOT_START;d<=PILOT_END;d=addDays(d,1))if(dow(d)!==0&&dow(d)!==6&&d!==officeDate)fieldDays.push(d);
  const targetK=Math.min(fieldDays.length,Math.max(1,Math.ceil(due.length/TARGET_POINTS_PER_DAY)));
  let groups=clusterPoints(due,targetK),split=[];
  for(const g of groups){if(g.length<=MAX_POINTS_PER_DAY){split.push(g);continue;}for(let i=0;i<g.length;i+=MAX_POINTS_PER_DAY)split.push(g.slice(i,i+MAX_POINTS_PER_DAY));}
  while(split.length<fieldDays.length&&split.some(g=>g.length>=6)){
    let idx=0;for(let i=1;i<split.length;i++)if(split[i].length>split[idx].length)idx=i;
    const g=split.splice(idx,1)[0],half=Math.ceil(g.length/2);split.push(g.slice(0,half),g.slice(half));
  }
  split=split.sort((a,b)=>haversine(HOME,centroid(b))-haversine(HOME,centroid(a)));
  const days=fieldDays.map(date=>({date,office:false,items:[],km:0,minutes:0,mode:'',zone:''}));
  const overflow=[];
  split.forEach((g,i)=>{
    if(i>=days.length){overflow.push(...g);return;}
    const ordered=orderCluster(g),day=days[i];day.items=ordered.items;day.km=ordered.km;day.minutes=travelMinutes(ordered.km);day.mode=ordered.mode;
    day.zone=[...new Set(g.map(x=>x.city||x.zone).filter(Boolean))].slice(0,3).join(' → ');
  });
  days.push({date:officeDate,office:true,items:[],km:0,minutes:0,mode:'Офисный день',zone:'Офис'});days.sort((a,b)=>a.date.localeCompare(b.date));
  return{days,overflow,officeDate};
}

function actualVisitLabel(v,cMap){const c=cMap.get(String(v.client_id));return String(c?.name||v.client_name||v.client||'Визит').trim();}
function visitTime(v){for(const k of ['check_in_at','entered_at','started_at','created_at','done_at'])if(v?.[k])return String(v[k]);return dateOnly(v?.date)+'T12:00:00';}
function buildActual(data,model){
  const cMap=new Map(data.clients.map(c=>[String(c.id),c])),pointByClient=new Map();
  for(const p of model.auto)for(const id of p.clientIds)pointByClient.set(String(id),p.key);
  const byDate={};
  for(let d=PILOT_START;d<=PILOT_END;d=addDays(d,1))byDate[d]={date:d,visits:[],gpsKm:0,gpsPoints:0,workdays:[],planRows:[]};
  for(const v of data.visits){const d=dateOnly(v.date||v.created_at);if(!byDate[d])continue;byDate[d].visits.push({...v,_label:actualVisitLabel(v,cMap),_pointKey:pointByClient.get(String(v.client_id))||('client:'+String(v.client_id||v._label))});}
  Object.values(byDate).forEach(x=>x.visits.sort((a,b)=>visitTime(a).localeCompare(visitTime(b))));
  for(const w of data.gps){const d=dateOnly(w.work_date||w.started_at);if(!byDate[d])continue;byDate[d].workdays.push(w);byDate[d].gpsKm+=(num(w.total_distance_m)/1000);byDate[d].gpsPoints+=Math.round(num(w.points_count||w.track_points_count||w.total_points));}
  for(const r of data.plans){const d=dateOnly(r.visit_date);if(byDate[d]&&!r.removed)byDate[d].planRows.push(r);}
  return{byDate,cMap,pointByClient};
}
function comparison(draft,actual){
  const suggested=new Map();for(const d of draft.days)for(const p of d.items)suggested.set(p.key,p);
  const visited=new Set();let actualVisits=0,actualKm=0;
  Object.values(actual.byDate).forEach(d=>{actualKm+=d.gpsKm;for(const v of d.visits){actualVisits++;visited.add(v._pointKey);}});
  const missed=[...suggested.values()].filter(p=>!visited.has(p.key));
  const extras=[];for(const d of Object.values(actual.byDate))for(const v of d.visits)if(!suggested.has(v._pointKey))extras.push(v);
  const suggestedKm=draft.days.reduce((s,d)=>s+d.km,0),suggestedCount=[...suggested.keys()].length;
  return{suggestedCount,actualVisits,actualKm,suggestedKm,missed,extras,visited};
}

function styles(){
  if(document.getElementById('route-auto-pilot-style-v2352'))return;
  const s=document.createElement('style');s.id='route-auto-pilot-style-v2352';s.textContent=`
  #${PANEL_ID}{border:2px solid #0F766E;background:#F0FDFA;border-radius:14px;padding:14px;margin:14px 0}
  .rap-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.rap-title{font-size:19px;font-weight:850;color:#115E59}.rap-sub{font-size:12px;color:var(--sub);line-height:1.5;margin-top:4px}.rap-badge{display:inline-flex;padding:4px 8px;border-radius:999px;background:#CCFBF1;color:#115E59;font-size:11px;font-weight:800}.rap-grid{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:8px;margin:12px 0}.rap-kpi{background:#fff;border:1px solid #CCFBF1;border-radius:10px;padding:10px}.rap-kpi span{font-size:10px;color:var(--sub);text-transform:uppercase}.rap-kpi b{display:block;font-size:18px;margin-top:4px}.rap-day{background:#fff;border:1px solid var(--border);border-radius:12px;padding:12px;margin-top:10px}.rap-day-head{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.rap-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px}.rap-list{font-size:12px;line-height:1.45}.rap-row{padding:7px 0;border-top:1px solid var(--border)}.rap-note{font-size:11px;color:var(--sub);margin-top:2px}.rap-warn{background:#FFF7ED;border:1px solid #FDBA74;color:#9A3412;border-radius:10px;padding:9px 11px;font-size:12px;margin-top:8px}.rap-ok{background:#ECFDF5;border:1px solid #86EFAC;color:#166534;border-radius:10px;padding:9px 11px;font-size:12px;margin-top:8px}.rap-readonly{background:#EFF6FF;border:1px solid #BFDBFE;color:#1E3A8A;border-radius:10px;padding:9px 11px;font-size:12px;margin-top:8px}.rap-details{margin-top:10px;background:#fff;border:1px solid var(--border);border-radius:10px;padding:10px}.rap-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}@media(max-width:900px){.rap-grid{grid-template-columns:repeat(2,1fr)}.rap-cols{grid-template-columns:1fr}}
  `;document.head.appendChild(s);
}
function panelHtml(){return `<div id="${PANEL_ID}">
  <div class="rap-head"><div><div class="rap-title">🧠 Автоматический черновик маршрута · ПИЛОТ</div><div class="rap-sub">Ретротест: <b>${esc(PILOT_MANAGER)}</b> · ${PILOT_START} — ${PILOT_END} · стартовая база <b>${HOME.city}</b>. Сравнивает предложение алгоритма с фактическими визитами/GPS.</div></div><span class="rap-badge">READ ONLY · ничего не сохраняет</span></div>
  <div class="rap-readonly"><b>Безопасный режим.</b> Пилот выполняет только SELECT-запросы. Он не создаёт, не меняет и не удаляет route_plans, задачи, визиты, GPS или клиентов. «Ручной маршрут руководителя» остаётся без изменений.</div>
  <div class="rap-actions"><button class="btn-primary" id="rap-run-v2352">▶ Запустить ретротест 10–14 августа</button><button class="btn-secondary" id="rap-clear-v2352">Очистить результат</button></div>
  <div id="${RESULT_ID}" style="margin-top:10px"><div class="rap-sub">Расчёт запускается только по кнопке и не выполняется при обычном открытии раздела.</div></div>
</div>`;}
function installPanel(){
  if(!isBoss())return false;styles();const host=document.getElementById('manual-route-lite');if(!host)return false;
  let panel=document.getElementById(PANEL_ID);if(!panel){host.insertAdjacentHTML('afterend',panelHtml());panel=document.getElementById(PANEL_ID);}
  const run=document.getElementById('rap-run-v2352'),clear=document.getElementById('rap-clear-v2352');
  if(run&&!run.dataset.bound){run.dataset.bound='1';run.addEventListener('click',runPilot);}
  if(clear&&!clear.dataset.bound){clear.dataset.bound='1';clear.addEventListener('click',()=>{const r=document.getElementById(RESULT_ID);if(r)r.innerHTML='<div class="rap-sub">Результат очищен. Данные в CRM не менялись.</div>';});}
  return true;
}

function renderLoading(){const r=document.getElementById(RESULT_ID);if(r)r.innerHTML='<div class="rap-readonly"><b>Считаю черновик…</b> Читаю закреплённых клиентов, физические ТТ, профили маршрутов и факт GPS/визитов за неделю. Никаких записей в базу.</div>';}
function renderError(e){const r=document.getElementById(RESULT_ID);if(r)r.innerHTML='<div class="rap-warn"><b>Пилот не построен.</b> '+esc(e?.message||e)+'</div>';}
function pointReason(p){const parts=[p.dueReason];if(p.openTasks)parts.push('открытых задач на историческом срезе: '+p.openTasks);if(p.bahus)parts.push('Бахус: индивидуально 1/месяц');return parts.filter(Boolean).join(' · ');}
function renderDay(day,actualDay){
  if(day.office){return `<div class="rap-day"><div class="rap-day-head"><b>${esc(day.date)} · ОФИСНЫЙ ДЕНЬ</b><span class="rap-badge">не строим дальний маршрут</span></div><div class="rap-cols"><div><div class="rap-note">Авточерновик</div><div class="rap-row">Офис 09:00–18:00. В пилоте дата взята из существующего офисного маршрута, если он был; иначе пятница.</div></div><div><div class="rap-note">Факт</div>${renderActual(actualDay)}</div></div></div>`;}
  const sugg=day.items.length?day.items.map((p,i)=>`<div class="rap-row"><b>${i+1}. ${esc(p.label)}</b> <span class="rap-badge">${esc(p.category)}</span><div class="rap-note">${esc([p.city,p.address].filter(Boolean).join(', '))}</div><div class="rap-note">${esc(pointReason(p))}</div></div>`).join(''):'<div class="rap-row">Для этого дня пилот не распределил обязательные точки.</div>';
  return `<div class="rap-day"><div class="rap-day-head"><b>${esc(day.date)} · ${esc(day.zone||'маршрут')}</b><span>${day.items.length} ТТ · внутренняя оценка ${fmtKm(day.km)} / ${fmtMin(day.minutes)}</span></div><div class="rap-note">Порядок: ${esc(day.mode)}. Это географическая оценка между ТТ, не точный дорожный маршрут.</div><div class="rap-cols"><div><div class="rap-note"><b>АВТОЧЕРНОВИК</b></div>${sugg}</div><div><div class="rap-note"><b>ФАКТ CRM/GPS</b></div>${renderActual(actualDay)}</div></div></div>`;
}
function renderActual(d){
  if(!d)return'<div class="rap-row">Фактических данных дня не найдено.</div>';
  const head=`<div class="rap-row"><b>GPS:</b> ${d.workdays.length?fmtKm(d.gpsKm):'рабочий день GPS не найден'}${d.gpsPoints?' · '+d.gpsPoints+' точек':''}<br><b>Сохранённых визитов:</b> ${d.visits.length} · <b>плановых строк:</b> ${d.planRows.length}</div>`;
  const rows=d.visits.length?d.visits.map((v,i)=>`<div class="rap-row">${i+1}. ${esc(v._label)}</div>`).join(''):'<div class="rap-row">Сохранённых клиентских визитов нет.</div>';
  return head+rows;
}
function renderResult(data,model,dueState,draft,actual,cmp){
  const root=document.getElementById(RESULT_ID);if(!root)return;
  const missingCoord=model.manual.filter(x=>/координат/i.test(x.decision.reason)).length;
  const manualRows=model.manual.slice(0,30).map(x=>`<div class="rap-row"><b>${esc(clientName(x.client))}</b> — ${esc(x.decision.reason)}</div>`).join('');
  const missed=cmp.missed.slice(0,30).map(x=>`<div class="rap-row"><b>${esc(x.label)}</b> — ${esc(x.city||x.zone)} · ${esc(x.dueReason)}</div>`).join('');
  const extras=cmp.extras.slice(0,30).map(v=>`<div class="rap-row"><b>${esc(v._label)}</b> — был фактический визит, но эта ТТ не попала в недельный черновик</div>`).join('');
  const bahus=data.clients.find(isBahus);
  root.innerHTML=`
  <div class="rap-grid">
    <div class="rap-kpi"><span>Закреплено клиентов</span><b>${data.clients.length}</b></div>
    <div class="rap-kpi"><span>Авто-ТТ с координатами</span><b>${model.auto.length}</b></div>
    <div class="rap-kpi"><span>Нужно этой неделе</span><b>${dueState.due.length}</b></div>
    <div class="rap-kpi"><span>Ручная проверка</span><b>${model.manual.length}</b></div>
    <div class="rap-kpi"><span>Изменено записей</span><b style="color:var(--g)">0</b></div>
  </div>
  <div class="rap-ok"><b>Пилот построен без сохранения.</b> Стартовая база: ${HOME.city}. Правило C: порог <b>10 SKU</b> по присланному регламенту, а не старые 15 SKU.${bahus?' Бахус найден среди закреплённых клиентов: для пилота применено <b>1 посещение в месяц</b>.':' ⚠ Бахус среди текущего снимка закреплённых клиентов не найден — индивидуальное правило не применялось.'}</div>
  <div class="rap-readonly"><b>Сравнение метрик:</b> фактический GPS-пробег за найденные рабочие дни — <b>${fmtKm(cmp.actualKm)}</b>. Авточерновик считает только оценочное перемещение <b>между предложенными ТТ</b> — <b>${fmtKm(cmp.suggestedKm)}</b>. Эти две цифры пока нельзя называть «экономией»: у GPS и расчётного пути разный состав.</div>
  ${draft.overflow.length?'<div class="rap-warn"><b>Не вместилось в 4 полевых дня:</b> '+draft.overflow.length+' ТТ. Это сигнал, что месячное распределение/частота требует следующей настройки.</div>':''}
  ${missingCoord?'<div class="rap-warn"><b>Без точных координат:</b> '+missingCoord+' клиентов. Они намеренно не угадывались и не попали в автоматический путь.</div>':''}
  ${draft.days.map(d=>renderDay(d,actual.byDate[d.date])).join('')}
  <div class="rap-details"><b>Итог недели</b><div class="rap-grid" style="grid-template-columns:repeat(4,minmax(120px,1fr))">
    <div class="rap-kpi"><span>Предложено ТТ</span><b>${cmp.suggestedCount}</b></div><div class="rap-kpi"><span>Фактических визитов</span><b>${cmp.actualVisits}</b></div><div class="rap-kpi"><span>Предложены, но не посещены</span><b>${cmp.missed.length}</b></div><div class="rap-kpi"><span>Факт вне предложения</span><b>${cmp.extras.length}</b></div>
  </div></div>
  <details class="rap-details" ${cmp.missed.length?'open':''}><summary><b>Обязательные по пилоту, которых нет в фактических визитах (${cmp.missed.length})</b></summary>${missed||'<div class="rap-row">Нет.</div>'}</details>
  <details class="rap-details"><summary><b>Фактические визиты вне недельного предложения (${cmp.extras.length})</b></summary>${extras||'<div class="rap-row">Нет.</div>'}</details>
  <details class="rap-details"><summary><b>Требуют решения руководителя (${model.manual.length})</b></summary>${manualRows||'<div class="rap-row">Нет.</div>'}</details>
  <div class="rap-readonly"><b>Что пилот намеренно пока НЕ делает:</b> не утверждает маршруты, не меняет ручной блок, не задаёт выдуманные нормы 60/45/30/20 минут на визит, не считает прямую GPS-цифру «экономией», не использует Яндекс Routing API и не пересчитывает весь месяц при открытии страницы.</div>`;
}

async function runPilot(){
  if(runPromise)return runPromise;if(!isBoss())return;
  const btn=document.getElementById('rap-run-v2352');if(btn){btn.disabled=true;btn.textContent='Считаю…';}renderLoading();
  runPromise=(async()=>{
    const data=await loadPilotData();
    if(!data.clients.length)throw new Error('Не удалось получить закреплённых клиентов Ачинович. Ничего не сохранялось.');
    const model=buildPhysicalModel(data);
    if(!model.auto.length)throw new Error('Нет автоматически пригодных ТТ с координатами для пилота. Ничего не сохранялось.');
    const dueState=dueForPilotWeek(model.auto,data),draft=makeDraft(dueState.due,data),actual=buildActual(data,model),cmp=comparison(draft,actual);
    renderResult(data,model,dueState,draft,actual,cmp);
    window.RESANTA_ROUTE_PILOT_LAST_RESULT_V2352={manager:PILOT_MANAGER,start:PILOT_START,end:PILOT_END,clientCount:data.clients.length,autoPoints:model.auto.length,duePoints:dueState.due.length,manualReview:model.manual.length,suggested:cmp.suggestedCount,actualVisits:cmp.actualVisits,actualGpsKm:cmp.actualKm,estimatedInternalKm:cmp.suggestedKm,writes:0};
  })().catch(renderError).finally(()=>{runPromise=null;if(btn){btn.disabled=false;btn.textContent='▶ Запустить ретротест 10–14 августа';}});
  return runPromise;
}

function install(){if(installPanel())return;clearTimeout(installTimer);installTimer=setTimeout(install,700);}
const mo=new MutationObserver(()=>{if(isBoss()&&!document.getElementById(PANEL_ID)&&document.getElementById('manual-route-lite'))installPanel();});
try{mo.observe(document.documentElement,{childList:true,subtree:true});}catch(_){}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
window.RESANTA_ROUTE_PILOT_V2352=Object.freeze({version:VERSION,manager:PILOT_MANAGER,start:PILOT_START,end:PILOT_END,readOnly:true,writes:false,manualRouteUntouched:true,bahusOverrideVisitsPerMonth:1,regulationCSkuThreshold:10,run:runPilot});
})();
