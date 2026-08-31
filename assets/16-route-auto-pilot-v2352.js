/* RESANTA CRM v23.6.34 · AUTO ROUTE MONTH DRAFT / READ-ONLY
 * Pilot manager: Ачинович. Draft month: September 2026.
 * READ ONLY: only SELECT queries. No writes to route_plans, tasks, visits, GPS or clients.
 * Priority rule: commercial priority is protected BEFORE geography.
 * Geography decides only the day/order of already selected mandatory visits.
 */
(function(){
'use strict';
if(window.RESANTA_ROUTE_MONTH_DRAFT_V23634)return;

const VERSION='v23.6.34';
const PILOT_MANAGER='Ачинович';
const MONTH='2026-09';
const MONTH_START='2026-09-01';
const MONTH_END='2026-09-30';
const HOME={city:'Бобруйск',lat:53.1384,lng:29.2214};
const FALLBACK_OFFICE_DOW=1; // Monday. Historical route rows are used first when available.
const MAX_POINTS_PER_DAY=15;
const TARGET_POINTS_PER_DAY=10;
const ROAD_FACTOR=1.22; // estimate only, not exact routing
const AVG_ROAD_SPEED_KMH=58;
const BAHUS_MATCH=/бахус/i;
const PANEL_ID='route-auto-pilot-v2352';
const RESULT_ID='route-auto-pilot-result-v2352';
let runPromise=null;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v||'').trim().toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9%]+/gi,' ').replace(/\s+/g,' ').trim();
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const finite=v=>Number.isFinite(Number(v));
function role(){try{return String(window.currentProfile?.role||currentProfile?.role||'');}catch(_){return String(window.currentProfile?.role||'');}}
function isBoss(){return role()==='boss';}
function tasksGlobal(){try{return Array.isArray(allTasks)?allTasks:[];}catch(_){return[];}}
function localDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function addDays(s,n){const d=new Date(s+'T12:00:00');d.setDate(d.getDate()+n);return localDate(d);}
function dow(s){return new Date(s+'T12:00:00').getDay();}
function monthDayLabel(s){const d=new Date(s+'T12:00:00');return d.toLocaleDateString('ru-RU',{weekday:'short',day:'2-digit',month:'2-digit'}).replace('.','');}
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
function clientName(c){return String(c?.name||c?.client_name||'Клиент').trim();}
function isPotential(c){return norm(c?.client_status)==='потенциальный';}
function isWorking(c){const s=norm(c?.client_status);return s==='рабочий'||s==='потенциальный'||(!s&&!c?.is_archived);}
function sku(c){return Math.max(0,Math.round(num(c?.sku_count)));}
function isBahus(c){return BAHUS_MATCH.test(norm(clientName(c)));}

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
function requiredVisits(c){
  if(isBahus(c))return{count:1,source:'Индивидуально: Бахус — 1 визит в месяц'};
  if(isPotential(c))return{count:1,source:'Потенциальная ТТ — первичный визит'};
  const cat=category(c);return{count:standardVisits(cat),source:'Регламент категории '+cat};
}
function routeMode(p){return String(p?.route_mode||'auto').toLowerCase();}
function eligibility(c,p,hasExplicitProfile){
  const mode=routeMode(p),cat=category(c),s=norm(c?.client_status);
  if(c?.is_archived===true||s==='закрыт'||mode==='exclude')return{kind:'exclude',reason:'Закрыт / архив / исключён из маршрута'};
  if(mode==='call')return{kind:'exclude',reason:'Маршрутный профиль: прозвон вместо визита'};
  if(mode==='manual')return{kind:'manual',reason:p?.manager_note||'Маршрутный профиль требует решения руководителя'};
  if(!isWorking(c))return{kind:'exclude',reason:'Не рабочий и не потенциальный клиент'};
  if(!isPotential(c)&&cat==='C'&&sku(c)<10)return{kind:'manual',reason:'Регламент C: менее 10 SKU — только по согласованию с ДФ'};
  if(!isPotential(c)&&(cat==='Оптовик'||cat==='Интернет')&&!hasExplicitProfile)return{kind:'manual',reason:'Регламент '+cat+': визит по согласованию с ДФ'};
  return{kind:'eligible',reason:'Готов к автоматическому черновику'};
}

async function loadAllSafe(table){
  try{if(typeof loadAllRows==='function')return await loadAllRows(table);}catch(e){console.warn('month draft loadAllRows '+table,e);}
  const out=[];let from=0;
  for(let i=0;i<20;i++){
    const {data,error}=await db.from(table).select('*').range(from,from+999);
    if(error)throw error;const rows=data||[];out.push(...rows);if(rows.length<1000)break;from+=1000;
  }
  return out;
}
async function queryFiltered(table,build){
  try{let q=db.from(table).select('*');q=build(q);const {data,error}=await q;if(error)throw error;return data||[];}
  catch(e){console.warn('route month draft '+table,e);return[];}
}
async function loadDraftData(){
  const [clients,points,links,profiles,plans]=await Promise.all([
    queryFiltered('clients',q=>q.eq('manager_name',PILOT_MANAGER)),
    loadAllSafe('route_physical_points').catch(e=>{console.warn(e);return[];}),
    loadAllSafe('route_physical_point_clients').catch(e=>{console.warn(e);return[];}),
    loadAllSafe('client_route_profiles').catch(e=>{console.warn(e);return[];}),
    queryFiltered('route_plans',q=>q.eq('manager_name',PILOT_MANAGER).gte('visit_date','2026-08-01').lte('visit_date',MONTH_END).order('visit_date',{ascending:true}))
  ]);
  return{clients:clients||[],points:(points||[]).filter(p=>p?.active!==false),links:links||[],profiles:profiles||[],plans:plans||[],tasks:tasksGlobal()};
}

function openTaskCount(point,data){
  return (data.tasks||[]).filter(t=>point.clientIds.includes(String(t.client_id))&&!t.done&&norm(t.manager_name||PILOT_MANAGER)===norm(PILOT_MANAGER)).length;
}
function buildPhysicalModel(data){
  const cMap=new Map(data.clients.map(c=>[String(c.id),c]));
  const pMap=new Map(data.profiles.map(p=>[String(p.client_id),p]));
  const linksByPoint=new Map(),linkedClientIds=new Set();
  for(const l of data.links){const k=String(l.point_id);if(!linksByPoint.has(k))linksByPoint.set(k,[]);linksByPoint.get(k).push(l);}
  const auto=[],manual=[],excluded=[];
  function decision(c,label){
    const p=pMap.get(String(c.id))||{},hasProfile=pMap.has(String(c.id)),d=eligibility(c,p,hasProfile),row={client:c,profile:p,decision:d,pointLabel:label};
    if(d.kind==='manual')manual.push(row);else if(d.kind==='exclude')excluded.push(row);
    return row;
  }
  for(const point of data.points){
    const linked=(linksByPoint.get(String(point.id))||[]).map(l=>({link:l,client:cMap.get(String(l.client_id))})).filter(x=>x.client&&norm(x.client.manager_name)===norm(PILOT_MANAGER));
    if(!linked.length)continue;
    if(point.manager_name&&norm(point.manager_name)!==norm(PILOT_MANAGER)&&!linked.some(x=>norm(x.client.manager_name)===norm(PILOT_MANAGER)))continue;
    const eligible=[],allNames=[];
    for(const x of linked){linkedClientIds.add(String(x.client.id));allNames.push(clientName(x.client));const r=decision(x.client,point.address||point.city||'физическая ТТ');if(r.decision.kind==='eligible')eligible.push(r);}
    if(!eligible.length)continue;
    const primary=eligible.find(x=>linked.find(l=>String(l.client.id)===String(x.client.id))?.link?.is_primary)||eligible[0];
    const cat=eligible.map(x=>category(x.client)).sort((a,b)=>categoryRank(b)-categoryRank(a))[0]||'C';
    const freqRows=eligible.map(x=>({x,...requiredVisits(x.client)}));
    const visits=Math.max(...freqRows.map(x=>x.count),1);
    const coord=coordOf(point)||coordOf(primary.client);
    const city=String(point.city||primary.profile.route_city||primary.client.city||primary.client.region||'').trim();
    const region=String(point.region||primary.profile.route_region||primary.client.region||'').trim();
    if(!coord){manual.push({client:primary.client,profile:primary.profile,decision:{kind:'manual',reason:'Нет подтверждённых координат физической ТТ'},pointLabel:String(point.address||city||primary.client.address||'').trim()});continue;}
    const row={
      key:'point:'+String(point.id),pointId:String(point.id),clientIds:eligible.map(x=>String(x.client.id)),
      label:allNames.length>1?clientName(primary.client)+' + ещё '+(allNames.length-1)+' юрлиц':clientName(primary.client),names:allNames,
      category:cat,priority:Math.max(...eligible.map(x=>categoryRank(category(x.client)))),visits,
      freqReasons:[...new Set(freqRows.filter(x=>x.count===visits).map(x=>x.source))],
      city,region,address:String(point.address||primary.client.address||'').trim(),coord,
      zone:[region,city].filter(Boolean).join(' / ')||'Без города',potential:eligible.some(x=>isPotential(x.client)),bahus:eligible.some(x=>isBahus(x.client)),source:'physical_point'
    };
    row.openTasks=openTaskCount(row,data);auto.push(row);
  }
  for(const c of data.clients){
    if(linkedClientIds.has(String(c.id)))continue;
    const p=pMap.get(String(c.id))||{},hasProfile=pMap.has(String(c.id)),d=eligibility(c,p,hasProfile);
    if(d.kind==='manual'){manual.push({client:c,profile:p,decision:d,pointLabel:'нет физической связи'});continue;}
    if(d.kind==='exclude'){excluded.push({client:c,profile:p,decision:d,pointLabel:'нет физической связи'});continue;}
    const f=requiredVisits(c),coord=coordOf(c),city=String(p.route_city||c.city||c.region||'').trim(),region=String(p.route_region||c.region||'').trim();
    if(!coord){manual.push({client:c,profile:p,decision:{kind:'manual',reason:'Нет подтверждённых координат физической ТТ'},pointLabel:city||c.address||''});continue;}
    const row={key:'client:'+String(c.id),pointId:null,clientIds:[String(c.id)],label:clientName(c),names:[clientName(c)],category:category(c),priority:categoryRank(category(c)),visits:f.count,freqReasons:[f.source],city,region,address:String(c.address||'').trim(),coord,zone:[region,city].filter(Boolean).join(' / ')||'Без города',potential:isPotential(c),bahus:isBahus(c),source:'client_fallback'};
    row.openTasks=openTaskCount(row,data);auto.push(row);
  }
  return{auto,manual,excluded};
}

function inferOfficeDow(plans){
  const counts=new Map();
  for(const r of plans||[]){
    if(!r?.is_office_day||!r.visit_date)continue;
    const d=dow(String(r.visit_date).slice(0,10));counts.set(d,(counts.get(d)||0)+1);
  }
  let best=FALLBACK_OFFICE_DOW,bestN=-1;for(const [d,n] of counts){if(n>bestN){best=d;bestN=n;}}
  return best;
}
function buildWeeks(officeDow){
  const weeks=[];let cursor=MONTH_START,seen=new Set();
  while(cursor<=MONTH_END){
    const d=new Date(cursor+'T12:00:00'),weekday=d.getDay(),delta=(weekday+6)%7,monday=addDays(cursor,-delta);
    if(!seen.has(monday)){
      seen.add(monday);const fieldDays=[],officeDays=[];
      for(let i=0;i<7;i++){
        const date=addDays(monday,i);if(date<MONTH_START||date>MONTH_END)continue;const wd=dow(date);if(wd===0||wd===6)continue;if(wd===officeDow)officeDays.push(date);else fieldDays.push(date);
      }
      weeks.push({index:weeks.length,monday,fieldDays,officeDays,capacity:fieldDays.length*MAX_POINTS_PER_DAY,items:[],overflow:[]});
    }
    cursor=addDays(cursor,7);
  }
  return weeks.filter(w=>w.fieldDays.length||w.officeDays.length);
}
function monthPrioritySort(a,b){return b.priority-a.priority||b.openTasks-a.openTasks||b.visits-a.visits||a.zone.localeCompare(b.zone,'ru')||a.label.localeCompare(b.label,'ru');}
function assignVisitsToWeeks(points,weeks){
  const overflow=[],allInstances=[],loads=weeks.map(()=>0),sorted=points.slice().sort(monthPrioritySort);
  for(const p of sorted){
    const used=[];
    for(let seq=0;seq<p.visits;seq++){
      const candidates=weeks.filter(w=>!used.includes(w.index)&&w.capacity>loads[w.index]);
      if(!candidates.length){overflow.push({...p,visitSeq:seq+1,reason:'Не осталось ёмкости месяца'});continue;}
      candidates.sort((a,b)=>{
        const ratioA=loads[a.index]/Math.max(1,a.capacity),ratioB=loads[b.index]/Math.max(1,b.capacity);
        const minA=used.length?Math.min(...used.map(u=>Math.abs(u-a.index))):9,minB=used.length?Math.min(...used.map(u=>Math.abs(u-b.index))):9;
        const spacingA=(p.visits<=2&&used.length&&minA<2?0.35:0)+(p.visits>=3&&used.length&&minA<1?1:0);
        const spacingB=(p.visits<=2&&used.length&&minB<2?0.35:0)+(p.visits>=3&&used.length&&minB<1?1:0);
        const jitterA=(hash(p.key+'|'+a.index)%100)/100000,jitterB=(hash(p.key+'|'+b.index)%100)/100000;
        return (ratioA+spacingA+jitterA)-(ratioB+spacingB+jitterB);
      });
      const w=candidates[0],instance={...p,visitSeq:seq+1,visitTotal:p.visits,weekIndex:w.index};
      w.items.push(instance);loads[w.index]++;used.push(w.index);allInstances.push(instance);
    }
  }
  return{weeks,overflow,allInstances};
}

function centroid(items){
  const valid=(items||[]).filter(x=>x?.coord&&finite(x.coord.lat)&&finite(x.coord.lng));
  if(!valid.length)return HOME;return{lat:valid.reduce((s,x)=>s+x.coord.lat,0)/valid.length,lng:valid.reduce((s,x)=>s+x.coord.lng,0)/valid.length};
}
function farthestSeeds(items,k){
  if(!items.length||k<=0)return[];const seeds=[],pool=items.slice();
  let first=pool.slice().sort((a,b)=>haversine(HOME,b.coord)-haversine(HOME,a.coord))[0];seeds.push(first);
  while(seeds.length<k){let best=null;for(const x of pool){if(seeds.includes(x))continue;const d=Math.min(...seeds.map(s=>haversine(s.coord,x.coord)));if(!best||d>best.d)best={d,x};}if(!best)break;seeds.push(best.x);}
  return seeds;
}
function orderDay(items){
  const left=items.slice(),ordered=[];let cur=HOME,km=0;
  while(left.length){let bi=0,bd=Infinity;left.forEach((x,i)=>{const d=roadKm(cur,x.coord);if(d<bd){bd=d;bi=i;}});const x=left.splice(bi,1)[0];if(ordered.length)km+=bd;ordered.push(x);cur=x.coord;}
  return{items:ordered,km,minutes:travelMinutes(km),mode:'от ближайшей ТТ по географическому кластеру'};
}
function assignWeekToDays(week){
  const fieldDays=week.fieldDays.slice(),items=week.items.slice().sort(monthPrioritySort),capacity=fieldDays.length*MAX_POINTS_PER_DAY;
  const kept=items.slice(0,capacity),overflow=items.slice(capacity).map(x=>({...x,reason:'Недельная ёмкость исчерпана'}));
  if(!fieldDays.length)return{...week,days:[],overflow:[...week.overflow,...overflow]};
  const activeCount=Math.min(fieldDays.length,Math.max(1,Math.ceil(kept.length/TARGET_POINTS_PER_DAY)));
  const activeDates=fieldDays.slice(0,activeCount),buckets=activeDates.map(date=>({date,items:[]}));
  const seeds=farthestSeeds(kept,Math.min(activeCount,kept.length));
  for(let i=0;i<seeds.length;i++)buckets[i].items.push(seeds[i]);
  const seeded=new Set(seeds.map(x=>x.key+'#'+x.visitSeq));
  for(const x of kept){
    const instanceKey=x.key+'#'+x.visitSeq;if(seeded.has(instanceKey))continue;
    const candidates=buckets.filter(b=>b.items.length<MAX_POINTS_PER_DAY);
    if(!candidates.length){overflow.push({...x,reason:'Дневные лимиты заполнены'});continue;}
    candidates.sort((a,b)=>{
      const ca=centroid(a.items),cb=centroid(b.items),da=haversine(ca,x.coord),db=haversine(cb,x.coord);
      const loadA=a.items.length/TARGET_POINTS_PER_DAY,loadB=b.items.length/TARGET_POINTS_PER_DAY;
      return (da+loadA*8)-(db+loadB*8);
    });
    candidates[0].items.push(x);
  }
  const days=fieldDays.map(date=>{
    const b=buckets.find(x=>x.date===date);if(!b)return{date,items:[],km:0,minutes:0,zone:'Резерв / свободный полевой день',mode:'резерв'};
    const ordered=orderDay(b.items),cities=[...new Set(b.items.map(x=>x.city||x.zone).filter(Boolean))];
    return{date,items:ordered.items,km:ordered.km,minutes:ordered.minutes,zone:cities.slice(0,4).join(' → ')||'маршрут',mode:ordered.mode};
  });
  return{...week,days,overflow:[...week.overflow,...overflow]};
}
function buildMonthDraft(model,data){
  const officeDow=inferOfficeDow(data.plans),weeks=buildWeeks(officeDow),assigned=assignVisitsToWeeks(model.auto,weeks),built=assigned.weeks.map(assignWeekToDays);
  const existingSeptember=(data.plans||[]).filter(r=>String(r.visit_date||'').slice(0,7)===MONTH&&coalesceRemoved(r)===false);
  return{officeDow,weeks:built,monthOverflow:assigned.overflow,instances:assigned.allInstances,existingSeptember};
}
function coalesceRemoved(r){return r?.removed===true;}
function categoryCounts(items){const out={AAA:0,A:0,B:0,'Передан на 3%':0,C:0,Оптовик:0,Интернет:0};for(const x of items||[])out[x.category]=(out[x.category]||0)+1;return out;}
function totalScheduled(draft){return draft.weeks.reduce((s,w)=>s+w.days.reduce((z,d)=>z+d.items.length,0),0);}
function totalOverflow(draft){return draft.monthOverflow.length+draft.weeks.reduce((s,w)=>s+w.overflow.length,0);}
function criticalOverflow(draft){const all=[...draft.monthOverflow,...draft.weeks.flatMap(w=>w.overflow)];return all.filter(x=>x.priority>=5);}

function styles(){
  if(document.getElementById('route-auto-pilot-style-v2352'))return;
  const s=document.createElement('style');s.id='route-auto-pilot-style-v2352';s.textContent=`
  #${PANEL_ID}{border:2px solid #0F766E;background:#F0FDFA;border-radius:14px;padding:14px;margin:14px 0}
  .rap-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.rap-title{font-size:19px;font-weight:850;color:#115E59}.rap-sub{font-size:12px;color:var(--sub);line-height:1.5;margin-top:4px}.rap-badge{display:inline-flex;padding:4px 8px;border-radius:999px;background:#CCFBF1;color:#115E59;font-size:11px;font-weight:800}.rap-grid{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:8px;margin:12px 0}.rap-kpi{background:#fff;border:1px solid #CCFBF1;border-radius:10px;padding:10px}.rap-kpi span{font-size:10px;color:var(--sub);text-transform:uppercase}.rap-kpi b{display:block;font-size:18px;margin-top:4px}.rap-week{background:#fff;border:1px solid #99F6E4;border-radius:12px;padding:12px;margin-top:12px}.rap-day{background:#fff;border:1px solid var(--border);border-radius:10px;padding:10px;margin-top:8px}.rap-day-head{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.rap-row{padding:7px 0;border-top:1px solid var(--border);font-size:12px;line-height:1.45}.rap-note{font-size:11px;color:var(--sub);margin-top:2px}.rap-warn{background:#FFF7ED;border:1px solid #FDBA74;color:#9A3412;border-radius:10px;padding:9px 11px;font-size:12px;margin-top:8px}.rap-danger{background:#FEF2F2;border:1px solid #FCA5A5;color:#991B1B;border-radius:10px;padding:9px 11px;font-size:12px;margin-top:8px}.rap-ok{background:#ECFDF5;border:1px solid #86EFAC;color:#166534;border-radius:10px;padding:9px 11px;font-size:12px;margin-top:8px}.rap-readonly{background:#EFF6FF;border:1px solid #BFDBFE;color:#1E3A8A;border-radius:10px;padding:9px 11px;font-size:12px;margin-top:8px}.rap-details{margin-top:10px;background:#fff;border:1px solid var(--border);border-radius:10px;padding:10px}.rap-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.rap-cat{display:inline-flex;padding:2px 7px;border-radius:999px;background:#CCFBF1;color:#115E59;font-size:10px;font-weight:800}.rap-cat.a{background:#FEE2E2;color:#991B1B}.rap-cat.aaa{background:#EDE9FE;color:#6D28D9}.rap-cat.b{background:#DBEAFE;color:#1D4ED8}.rap-cat.c{background:#E5E7EB;color:#4B5563}@media(max-width:900px){.rap-grid{grid-template-columns:repeat(2,1fr)}}
  `;document.head.appendChild(s);
}
function panelHtml(){return `<div id="${PANEL_ID}">
  <div class="rap-head"><div><div class="rap-title">🧠 Автоматический черновик маршрута · СЕНТЯБРЬ · ПИЛОТ</div><div class="rap-sub">Менеджер: <b>${esc(PILOT_MANAGER)}</b> · ${MONTH_START} — ${MONTH_END} · стартовая база <b>${HOME.city}</b>. Приоритет клиентов защищён до географической раскладки.</div></div><span class="rap-badge">READ ONLY · 0 записей</span></div>
  <div class="rap-readonly"><b>Безопасный режим.</b> Кнопка только читает актуальные закрепления, категории, SKU, физические ТТ и координаты. Черновик <b>не сохраняется</b> в route_plans и не меняет реальные маршруты руководителя.</div>
  <div class="rap-ok"><b>Новая логика приоритета:</b> сначала AAA → A → B → C и обязательная частота; только потом география решает, в какой день и в каком порядке ехать. Если ёмкости не хватает, первыми уходят низшие приоритеты, а AAA/A получают отдельный красный сигнал.</div>
  <div class="rap-actions"><button class="btn-primary" id="rap-run-v2352">▶ Построить черновик сентября</button><button class="btn-secondary" id="rap-clear-v2352">Очистить результат</button></div>
  <div id="${RESULT_ID}" style="margin-top:10px"><div class="rap-sub">Расчёт запускается только по кнопке. Никаких фоновых пересчётов и тяжёлого polling.</div></div>
</div>`;}
function installPanel(){
  if(!isBoss())return false;styles();const host=document.getElementById('manual-route-lite');if(!host)return false;
  let panel=document.getElementById(PANEL_ID);if(!panel){host.insertAdjacentHTML('afterend',panelHtml());panel=document.getElementById(PANEL_ID);}
  const run=document.getElementById('rap-run-v2352'),clear=document.getElementById('rap-clear-v2352');
  if(run&&!run.dataset.bound){run.dataset.bound='1';run.addEventListener('click',runDraft);}
  if(clear&&!clear.dataset.bound){clear.dataset.bound='1';clear.addEventListener('click',()=>{const r=document.getElementById(RESULT_ID);if(r)r.innerHTML='<div class="rap-sub">Результат очищен. Реальные маршруты не менялись.</div>';});}
  return true;
}
function catClass(c){return String(c||'').toLowerCase().replace('aaa','aaa').replace('a','a').replace('b','b').replace('c','c');}
function pointReason(p){const parts=[...(p.freqReasons||[])];if(p.openTasks)parts.push('открытых задач: '+p.openTasks);if(p.potential)parts.push('потенциальная ТТ');return parts.join(' · ');}
function renderLoading(){const r=document.getElementById(RESULT_ID);if(r)r.innerHTML='<div class="rap-readonly"><b>Считаю сентябрьский черновик…</b> Только SELECT: закрепления → обязательная частота → недельная ёмкость → география → порядок ТТ.</div>';}
function renderError(e){const r=document.getElementById(RESULT_ID);if(r)r.innerHTML='<div class="rap-danger"><b>Черновик не построен.</b> '+esc(e?.message||e)+'</div>';}
function renderDay(day){
  const rows=day.items.length?day.items.map((p,i)=>`<div class="rap-row"><b>${i+1}. ${esc(p.label)}</b> <span class="rap-cat ${esc(catClass(p.category))}">${esc(p.category)}</span><div class="rap-note">${esc([p.city,p.address].filter(Boolean).join(', '))}</div><div class="rap-note">${esc(pointReason(p))}</div></div>`).join(''):'<div class="rap-row"><b>Резервный полевой день.</b> Обязательные точки этой недели уже распределены.</div>';
  return `<div class="rap-day"><div class="rap-day-head"><b>${esc(monthDayLabel(day.date))} · ${esc(day.zone)}</b><span>${day.items.length} ТТ${day.items.length?' · оценка между ТТ '+fmtKm(day.km)+' / '+fmtMin(day.minutes):''}</span></div>${rows}</div>`;
}
function renderWeek(w){
  const scheduled=w.days.reduce((s,d)=>s+d.items.length,0),cats=categoryCounts(w.items),office=w.officeDays.length?'<div class="rap-note"><b>Офис:</b> '+w.officeDays.map(monthDayLabel).join(', ')+'</div>':'';
  return `<div class="rap-week"><div class="rap-day-head"><b>Неделя ${w.index+1}</b><span>требуется ${w.items.length} · поставлено ${scheduled} · ёмкость ${w.capacity}</span></div>${office}<div class="rap-note">AAA ${cats.AAA||0} · A ${cats.A||0} · B ${cats.B||0} · C ${cats.C||0}</div>${w.overflow.length?'<div class="rap-warn"><b>Не вместилось в неделю:</b> '+w.overflow.length+' ТТ.</div>':''}${w.days.map(renderDay).join('')}</div>`;
}
function renderResult(data,model,draft){
  const root=document.getElementById(RESULT_ID);if(!root)return;
  const scheduled=totalScheduled(draft),overflowN=totalOverflow(draft),critical=criticalOverflow(draft),cats=categoryCounts(draft.instances),missingCoord=model.manual.filter(x=>/координат/i.test(x.decision.reason)),criticalManual=missingCoord.filter(x=>categoryRank(category(x.client))>=5),bahus=data.clients.find(isBahus);
  const manualRows=model.manual.slice().sort((a,b)=>categoryRank(category(b.client))-categoryRank(category(a.client))||clientName(a.client).localeCompare(clientName(b.client),'ru')).slice(0,50).map(x=>`<div class="rap-row"><b>${esc(clientName(x.client))}</b> <span class="rap-cat ${esc(catClass(category(x.client)))}">${esc(category(x.client))}</span> — ${esc(x.decision.reason)}</div>`).join('');
  const overflowRows=[...draft.monthOverflow,...draft.weeks.flatMap(w=>w.overflow)].slice(0,50).map(x=>`<div class="rap-row"><b>${esc(x.label)}</b> <span class="rap-cat ${esc(catClass(x.category))}">${esc(x.category)}</span> — ${esc(x.reason||'не вместилось')}</div>`).join('');
  root.innerHTML=`
    <div class="rap-grid"><div class="rap-kpi"><span>Закреплено клиентов</span><b>${data.clients.length}</b></div><div class="rap-kpi"><span>Авто-ТТ</span><b>${model.auto.length}</b></div><div class="rap-kpi"><span>Визитов по регламенту</span><b>${draft.instances.length}</b></div><div class="rap-kpi"><span>Поставлено в черновик</span><b>${scheduled}</b></div><div class="rap-kpi"><span>Изменено записей</span><b style="color:var(--g)">0</b></div></div>
    <div class="rap-ok"><b>Приоритет защищён.</b> В месячную ёмкость сначала попадают AAA/A, затем B и только потом C. География больше не может выбросить целый кластер с клиентом A.</div>
    <div class="rap-readonly"><b>Частота в сентябре:</b> AAA/A — 4 визита, B — 2, C — 1; потенциальная ТТ — 1 первичный визит.${bahus?' Для Бахуса сохранено индивидуальное исключение: <b>1 визит в месяц</b>.':''} Офисный день определён по фактическому шаблону предыдущих маршрутов: <b>${['вс','пн','вт','ср','чт','пт','сб'][draft.officeDow]}</b>.</div>
    <div class="rap-details"><b>Состав обязательных визитов:</b> AAA ${cats.AAA||0} · A ${cats.A||0} · B ${cats.B||0} · Передан на 3% ${cats['Передан на 3%']||0} · C ${cats.C||0}</div>
    ${draft.existingSeptember.length?'<div class="rap-warn"><b>В CRM уже есть '+draft.existingSeptember.length+' строк сентября.</b> Пилот их видит, но не изменяет и не смешивает с черновиком.</div>':''}
    ${critical.length?'<div class="rap-danger"><b>КРИТИЧНО:</b> '+critical.length+' обязательных AAA/A не вместились. Такой черновик нельзя утверждать.</div>':'<div class="rap-ok"><b>AAA/A не потеряны:</b> ни один обязательный клиент высшего приоритета не выпал из-за лимита/географии.</div>'}
    ${criticalManual.length?'<div class="rap-danger"><b>AAA/A требуют ручного решения:</b> '+criticalManual.length+' клиентов без достаточных маршрутных данных.</div>':''}
    ${overflowN?'<div class="rap-warn"><b>Всего не вместилось:</b> '+overflowN+' визитов. Ниже видно, какие именно приоритеты пришлось отложить.</div>':'<div class="rap-ok"><b>Месячная ёмкость достаточна:</b> все обязательные визиты помещены в сентябрьский черновик.</div>'}
    ${missingCoord.length?'<div class="rap-warn"><b>Без точных координат:</b> '+missingCoord.length+' клиентов оставлены на ручную проверку и не угадывались.</div>':''}
    ${draft.weeks.map(renderWeek).join('')}
    <details class="rap-details" ${overflowN?'open':''}><summary><b>Не вместилось / требуется перенос (${overflowN})</b></summary>${overflowRows||'<div class="rap-row">Нет.</div>'}</details>
    <details class="rap-details"><summary><b>Ручная проверка (${model.manual.length})</b></summary>${manualRows||'<div class="rap-row">Нет.</div>'}</details>
    <div class="rap-readonly"><b>Важно:</b> это пока только расчёт на экране. Никакой кнопки «сохранить/утвердить» здесь нет. После твоей проверки отдельно договоримся, что именно переносить в реальные route_plans.</div>`;
}

async function runDraft(){
  if(runPromise)return runPromise;if(!isBoss())return;
  const btn=document.getElementById('rap-run-v2352');if(btn){btn.disabled=true;btn.textContent='Считаю сентябрь…';}renderLoading();
  runPromise=(async()=>{
    const data=await loadDraftData();if(!data.clients.length)throw new Error('Не удалось получить закреплённых клиентов Ачиновича. Ничего не сохранялось.');
    const model=buildPhysicalModel(data);if(!model.auto.length)throw new Error('Нет ТТ, которые можно безопасно поставить в автоматический черновик.');
    const draft=buildMonthDraft(model,data);renderResult(data,model,draft);
    window.RESANTA_ROUTE_MONTH_DRAFT_LAST_V23634={version:VERSION,manager:PILOT_MANAGER,month:MONTH,clients:data.clients.length,autoPoints:model.auto.length,requiredVisits:draft.instances.length,scheduled:totalScheduled(draft),overflow:totalOverflow(draft),criticalOverflow:criticalOverflow(draft).length,manualReview:model.manual.length,writes:0};
  })().catch(renderError).finally(()=>{runPromise=null;if(btn){btn.disabled=false;btn.textContent='▶ Построить черновик сентября';}});
  return runPromise;
}

function install(){installPanel();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
// No MutationObserver and no polling. A route-page click gets one cheap deferred install attempt.
document.addEventListener('click',()=>{if(isBoss()&&!document.getElementById(PANEL_ID))setTimeout(installPanel,0);},true);
window.RESANTA_ROUTE_MONTH_DRAFT_V23634=Object.freeze({version:VERSION,manager:PILOT_MANAGER,month:MONTH,readOnly:true,writes:false,priorityBeforeGeography:true,maxPointsPerDay:MAX_POINTS_PER_DAY,targetPointsPerDay:TARGET_POINTS_PER_DAY,bahusOverrideVisitsPerMonth:1,regulationCSkuThreshold:10,run:runDraft});
window.RESANTA_ROUTE_PILOT_V2352=window.RESANTA_ROUTE_MONTH_DRAFT_V23634;
})();
