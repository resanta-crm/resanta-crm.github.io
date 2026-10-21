/* RESANTA CRM · Monthly route AI audit, stage 1.
 * Runs ONLY when the director clicks "ИИ-анализ маршрута".
 * Never modifies route_plans, visits, tasks, clients, or GPS data.
 */
(function(){
'use strict';
if(window.RESANTA_ROUTE_MONTH_AI_AUDIT_V1)return;
const VERSION='route-ai-1.0.0',PAGE='page-routes-boss',ROOT_ID='route-month-ai-audit-v1';
const state={busy:false,month:'',items:[],reviews:new Map(),shown:50,warnings:[],period:null};
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const key=v=>String(v||'').trim().toLowerCase().replace(/\s+/g,' ');
const ymNext=ym=>{const [y,m]=ym.split('-').map(Number);return new Date(Date.UTC(y,m,1)).toISOString().slice(0,7)};
const fmt=v=>n(v).toLocaleString('ru-RU',{maximumFractionDigits:0});
const boss=()=>{try{return currentProfile?.role==='boss'}catch(_){return false}};
const managerFilter=()=>{try{return typeof rbMgrFilter!=='undefined'?rbMgrFilter:'all'}catch(_){return'all'}};
const ymToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit'}).format(new Date());
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const asOf=ym=>ym<ymToday()?ym+'-01':today();
const days=(a,b)=>Math.max(0,Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000));
const reviewKey=f=>[f.manager,f.kind,f.itemKey].join('\u001f');
const statusName={approve:'Согласовано ДФ',reject:'Отклонено ДФ',discuss:'На обсуждении'};
const kindName={sales_drop:'Падение продаж',stale_visit:'Давно не посещался',potential_near:'Потенциальный рядом',repeat_visit:'Повторное посещение',route_detour:'Лишние переезды'};
function root(){return document.getElementById(ROOT_ID)}
function month(){const x=document.getElementById('rb-coverage-month')?.value||'';return /^\d{4}-(0[1-9]|1[0-2])$/.test(x)?x:ymToday()}
function visible(){return boss()&&!!document.getElementById(PAGE)?.classList.contains('active')}
function install(){
 const page=document.getElementById(PAGE),anchor=document.getElementById('rb-coverage-card');
 if(!page||!anchor||!boss())return false;
 if(root())return true;
 const panel=document.createElement('section');panel.id=ROOT_ID;panel.className='card';
 panel.style.cssText='margin:0 0 16px;border:1px solid #c7d9ef;';
 panel.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">'
  +'<div><div class="card-title" style="margin:0">🤖 ИИ-аудит месячного маршрута</div>'
  +'<div style="font-size:12px;color:var(--sub);margin-top:5px">Помощник ДФ: анализ рисков по клиентам и логистике, без изменения маршрута</div></div>'
  +'<button id="route-ai-run-v1" class="btn-primary" type="button">🔎 ИИ-анализ маршрута</button></div>'
  +'<div id="route-ai-audit-result-v1" style="margin-top:11px;font-size:12px;color:var(--sub)">Месяц берётся из поля «Покрытие клиентской базы» выше. Анализ запускается только вручную.</div>';
 anchor.insertAdjacentElement('afterend',panel);
 panel.addEventListener('click',async e=>{
  const run=e.target.closest('#route-ai-run-v1');
  if(run){await audit();return}
  const more=e.target.closest('[data-route-ai-more]');
  if(more){state.shown+=50;render();return}
  const action=e.target.closest('[data-route-ai-decision]');
  if(action){const idx=Number(action.dataset.aiIndex);if(Number.isInteger(idx)&&state.items[idx])await decide(state.items[idx],action.dataset.routeAiDecision)}
 });
 return true;
}
function message(t,error=false){const out=document.getElementById('route-ai-audit-result-v1');if(out)out.innerHTML='<div style="padding:11px;background:'+(error?'#fef2f2':'#eff6ff')+';border-radius:8px;color:'+(error?'#991b1b':'#1e40af')+'">'+esc(t)+'</div>'}
async function rows(table,columns,configure,maxPages=12){
 let out=[];
 for(let i=0;i<maxPages;i++){
  let q=db.from(table).select(columns);
  q=configure(q);
  const {data,error}=await q.order('id',{ascending:true}).range(i*1000,i*1000+999);
  if(error)throw new Error(table+': '+error.message);
  const batch=data||[];out.push(...batch);
  if(batch.length<1000)return out;
 }
 state.warnings.push(table+': достигнут предел чтения, часть данных могла не войти');
 return out;
}
function coord(o){
 const lat=Number(o.route_lat ?? o.lat),lng=Number(o.route_lng ?? o.lng);
 return Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)>0.00001&&Math.abs(lng)>0.00001?{lat,lng}:null;
}
function hav(a,b){
 const rad=Math.PI/180,la=(b.lat-a.lat)*rad,lo=(b.lng-a.lng)*rad;
 const x=Math.sin(la/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(lo/2)**2;
 return 6371*2*Math.asin(Math.min(1,Math.sqrt(x)));
}
function routeLen(arr){return arr.slice(1).reduce((acc,x,i)=>acc+hav(arr[i],x),0)}
function nearestLen(arr){
 const free=arr.slice(1),chain=[arr[0]];
 while(free.length){let best=0,dist=Infinity;for(let i=0;i<free.length;i++){const d=hav(chain[chain.length-1],free[i]);if(d<dist){best=i;dist=d}}chain.push(free.splice(best,1)[0]);}
 return routeLen(chain);
}
function clientLinkIds(row,byManagerName){
 const found=[];
 if(row.client_id)found.push(String(row.client_id));
 let ids=row.linked_client_ids;
 if(typeof ids==='string'){try{ids=JSON.parse(ids)}catch(_){ids=[]}}
 if(Array.isArray(ids))ids.forEach(id=>{if(id)found.push(String(id))});
 if(!found.length){
  const m=byManagerName.get(key(row.manager_name)+'|'+key(row.client_name))||[];
  if(m.length===1)found.push(String(m[0].id));
 }
 return [...new Set(found)];
}
function finding(manager,kind,itemKey,client,reason,proof,advice,weight,details={}){
 return{manager,kind,itemKey,clientId:client?.id||null,clientName:client?.name||'',reason,proof,advice,weight,details};
}
async function audit(){
 if(!boss()||state.busy)return;
 if(!install())return;
 state.busy=true;state.warnings=[];
 const btn=document.getElementById('route-ai-run-v1');
 if(btn)btn.disabled=true;
 const ym=month(),filter=managerFilter();
 message('Анализирую месяц '+ym+': маршруты, визиты, прозвоны и сопоставимую выручку…');
 try{
  const next=ymNext(ym),cutoff=asOf(ym);
  const [routes,visits,calls,salesResp,reviews]=await Promise.all([
   rows('route_plans','id,manager_name,visit_date,client_id,client_name,linked_client_ids,city,route_lat,route_lng,sort_order,planned_start,removed,is_office_day,is_network_point',q=>q.gte('visit_date',ym+'-01').lt('visit_date',next+'-01')),
   rows('visits','id,client_id,date',q=>q.lte('date',cutoff)),
   rows('tasks','id,client_id,source,title,done,review_status,manager_name,due_date',q=>q.gte('due_date',ym+'-01').lt('due_date',next+'-01')),
   db.rpc('crm_route_audit_sales_v1',{p_month:ym+'-01'}),
   rows('route_month_ai_reviews','id,audit_month,manager_name,item_key,kind,decision,director_note',q=>q.eq('audit_month',ym))
  ]);
  if(salesResp.error)throw new Error('Расчёт выручки: '+salesResp.error.message);
  const sales=new Map((salesResp.data||[]).map(s=>[String(s.client_id),s]));
  const clients=typeof allClients!=='undefined'&&Array.isArray(allClients)?allClients:[];
  if(!clients.length)throw new Error('Список клиентов ещё не загружен. Обновите данные CRM и повторите.');
  state.reviews=new Map(reviews.map(x=>[[x.manager_name,x.kind,x.item_key].join('\u001f'),x]));
  const active=clients.filter(c=>c&&!c.is_archived&&c.manager_name&&
   ['рабочий','потенциальный'].includes(key(c.client_status))&&
   (filter==='all'||c.manager_name===filter));
  const byManagerName=new Map();
  for(const c of active){const k=key(c.manager_name)+'|'+key(c.name);if(!byManagerName.has(k))byManagerName.set(k,[]);byManagerName.get(k).push(c)}
  const byId=new Map(active.map(c=>[String(c.id),c]));
  const plans=routes.filter(r=>!r.removed&&!r.is_office_day&&!r.is_network_point&&(!filter||filter==='all'||r.manager_name===filter));
  const planned=new Map(),visitsByClient=new Map(),callsById=new Set();
  for(const r of plans)for(const id of clientLinkIds(r,byManagerName)){
   if(!planned.has(id))planned.set(id,[]);
   planned.get(id).push(r);
  }
  for(const v of visits)if(v.client_id&&v.date){
   const id=String(v.client_id),last=visitsByClient.get(id);
   if(!last||v.date>last)visitsByClient.set(id,v.date);
  }
  for(const t of calls)if(t.client_id&&t.review_status!=='stale_review'&&t.review_status!=='rejected'){
   if(key(t.source)==='route_call_monthly'||/прозвон|позвон|созвон/i.test(t.title||''))callsById.add(String(t.client_id));
  }
  const cityPlan=new Map();
  for(const r of plans)if(r.city){
   const k=key(r.manager_name)+'|'+key(r.city);
   if(!cityPlan.has(k))cityPlan.set(k,[]);
   cityPlan.get(k).push(r);
  }
  const linked=active.filter(c=>sales.has(String(c.id))).length;
  if(active.length&&linked<active.length)state.warnings.push('Выручка за сравниваемые периоды привязана к '+linked+' из '+active.length+' активных клиентов. Остальным нельзя достоверно посчитать падение продаж.');
  const findings=[];
  for(const c of active){
   const id=String(c.id),scheduled=planned.get(id)||[],s=sales.get(id),prev=n(s?.sales_last_year),curr=n(s?.sales_recent),gap=Math.max(0,prev-curr);
   const hasCall=callsById.has(id),last=visitsByClient.get(id),age=last?days(cutoff,last):null;
   if(!scheduled.length&&prev>=500&&gap>=500&&curr<=prev*.8){
    const pct=Math.round((prev-curr)/prev*100);
    findings.push(finding(c.manager_name,'sales_drop',id,c,
      'Закупки снизились на '+pct+'%, клиент отсутствует в физическом маршруте '+ym+'.',
      'Продажи за 3 завершённых месяца: '+fmt(curr)+' BYN против '+fmt(prev)+' BYN годом ранее. Разница: '+fmt(gap)+' BYN.'+(hasCall?' Прозвон назначен.':''),
      'Обсудить причины падения и необходимость визита вместо/в дополнение к прозвону.',100000+gap,
      {sales_recent:curr,sales_last_year:prev,sales_gap:gap,pct,has_call:hasCall,period_start:s.period_start,period_end:s.period_end}));
   }
   if(!scheduled.length&&age!==null&&age>=45){
    findings.push(finding(c.manager_name,'stale_visit',id,c,
      'Последний подтверждённый визит '+last+' ('+age+' дн. назад). В маршруте '+ym+' клиента нет.',
      (hasCall?'Прозвон на месяц предусмотрен. ':'')+'Давность считается только по внесённым фактическим визитам.',
      'Проверить необходимость личного визита с учётом важности клиента и результата прозвона.',20000+age,{last_visit:last,days_since_visit:age,has_call:hasCall}));
   }
   if(!scheduled.length&&key(c.client_status)==='потенциальный'&&c.city){
    const nearby=cityPlan.get(key(c.manager_name)+'|'+key(c.city))||[];
    if(nearby.length){
     const d=nearby.slice().sort((a,b)=>a.visit_date.localeCompare(b.visit_date))[0];
     findings.push(finding(c.manager_name,'potential_near',id,c,
       'Потенциальный клиент в городе '+c.city+' не внесён в маршрут; '+d.visit_date+' там уже запланирован выезд.',
       'Совпадает город и менеджер. Близость адресов и дорожное время не подтверждены.',
       'Проверить адрес и возможность добавить встречу без лишнего переезда.',5000,{city:c.city,near_date:d.visit_date}));
    }
   }
  }
  const perClient=new Map();
  for(const [id,arr] of planned){
   const c=byId.get(id);if(!c||arr.length<2)continue;
   const dates=[...new Set(arr.map(x=>x.visit_date))].sort();
   const close=dates.slice(1).some((d,i)=>days(d,dates[i])<=3);
   if(close)perClient.set(id,finding(c.manager_name,'repeat_visit',id,c,
    'У одного клиента есть повторные выезды с интервалом до 3 дней.',
    'Плановые даты: '+dates.join(', ')+'. Служебная необходимость пока неизвестна.',
    'Обсудить цель каждого визита; не отменять автоматически.',3000,{planned_dates:dates}));
  }
  findings.push(...perClient.values());
  const groups=new Map();
  for(const r of plans){
   const k=r.manager_name+'|'+r.visit_date;
   if(!groups.has(k))groups.set(k,[]);
   groups.get(k).push(r);
  }
  for(const [group,rs] of groups){
   const points=rs.map(r=>({...r,_coord:coord(r)})).filter(r=>r._coord);
   const hasOrdering=points.length>=4&&points.every(r=>r.sort_order!==null&&r.sort_order!==undefined&&Number.isFinite(Number(r.sort_order)))&&new Set(points.map(r=>Number(r.sort_order))).size>=4;
   const hasTimes=points.length>=4&&points.every(r=>!!r.planned_start)&&new Set(points.map(r=>String(r.planned_start))).size>=4;
   if(!hasOrdering&&!hasTimes)continue;
   const unique=new Map();
   for(const p of points){const k=p._coord.lat.toFixed(5)+'|'+p._coord.lng.toFixed(5);if(!unique.has(k))unique.set(k,p);}
   const ordered=[...unique.values()].sort((a,b)=>hasOrdering?(n(a.sort_order)-n(b.sort_order)):String(a.planned_start).localeCompare(String(b.planned_start)));
   if(ordered.length<4)continue;
   const xy=ordered.map(r=>r._coord),actual=routeLen(xy),efficient=nearestLen(xy),difference=actual-efficient;
   if(actual>0&&difference>=25&&actual/Math.max(efficient,1)>1.35){
    const [manager,date]=group.split('|');
    findings.push(finding(manager,'route_detour',date,null,
     'Возможен нерациональный порядок '+ordered.length+' точек на '+date+'.',
     'По прямой между точками: текущая последовательность ~'+fmt(actual)+' км; ориентир перестановки ~'+fmt(efficient)+' км. Это НЕ дорожный километраж.',
     'Проверить очерёдность и реальные дороги на карте перед корректировкой.',12000+difference,
     {date,points:ordered.length,straight_current_km:Math.round(actual),straight_alternative_km:Math.round(efficient)}));
   }
  }
  state.items=findings.sort((a,b)=>b.weight-a.weight||a.manager.localeCompare(b.manager,'ru'));
  state.month=ym;state.shown=50;
  state.period=(salesResp.data||[])[0]||null;
  if(!sales.size)state.warnings.push('Не получены привязанные к клиентам продажи: финансовые выводы ограничены.');
  if(visits.length===0)state.warnings.push('Нет подтверждённых визитов в доступных данных: сигналы по давности визита недоступны.');
  render();
 }catch(e){console.error(VERSION,e);message('Анализ не завершён: '+(e?.message||String(e)),true)}
 finally{state.busy=false;if(btn)btn.disabled=false}
}
function render(){
 const out=document.getElementById('route-ai-audit-result-v1');if(!out||!boss())return;
 const all=state.items,reviewed=all.filter(x=>state.reviews.has(reviewKey(x))).length;
 const drops=all.filter(x=>x.kind==='sales_drop');
 const gap=drops.reduce((a,x)=>a+n(x.details.sales_gap),0);
 const rows=all.slice(0,state.shown).map((f,i)=>{
  const rev=state.reviews.get(reviewKey(f)),decision=rev?.decision||'';
  const actions=['approve','reject','discuss'].map(d=>'<button type="button" data-ai-index="'+i+'" data-route-ai-decision="'+d+'" class="chip" style="font-size:12px;'+(decision===d?'background:#dbeafe;border-color:#60a5fa;':'')+'">'+({approve:'✓ Согласовать',reject:'✕ Отклонить',discuss:'💬 Обсудить'}[d])+'</button>').join('');
  return '<div style="border:1px solid #e2e8f0;padding:11px;border-radius:9px;margin-top:9px;background:#fff">'
   +'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>'+esc(f.clientName||'Маршрут '+f.details.date)+'</b>'
   +'<span class="tag tag-gray">'+esc(kindName[f.kind])+'</span><span style="color:#64748b">'+esc(f.manager)+'</span></div>'
   +'<div style="margin-top:6px"><b>Причина:</b> '+esc(f.reason)+'</div>'
   +'<div style="margin-top:5px;color:#475569"><b>Данные:</b> '+esc(f.proof)+'</div>'
   +'<div style="margin-top:5px"><b>Рекомендация:</b> '+esc(f.advice)+'</div>'
   +'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:9px">'+actions
   +(decision?'<small>Решение: <b>'+esc(statusName[decision]||decision)+'</b>'+(rev.director_note?' · '+esc(rev.director_note):'')+'</small>':'')+'</div></div>';
 }).join('');
 let html='<div style="display:flex;gap:7px;flex-wrap:wrap">'
  +'<span class="tag tag-gray">Месяц: '+esc(state.month)+'</span>'
  +'<span class="tag tag-gray">Рекомендаций: <b>'+all.length+'</b></span>'
  +'<span class="tag tag-gray">Решений ДФ: <b>'+reviewed+'</b></span>'
  +'<span class="tag tag-gray">Падение продаж вне маршрута: <b>'+drops.length+'</b></span></div>'
  +'<div style="margin-top:9px;font-size:13px"><b>Историческая разница в продажах по клиентам с падением:</b> '+fmt(gap)+' BYN. Это не прогноз и не гарантированная выручка.</div>'
  +'<div style="color:#64748b;font-size:11px;margin-top:5px">Сравниваются 3 полных месяца и тот же период прошлого года. Маршрут, задачи и GPS автоматически не меняются.</div>';
 if(state.warnings.length)html+='<div style="margin-top:8px;color:#9a3412;font-size:11px">Ограничения: '+esc(state.warnings.join(' · '))+'</div>';
 html+=rows||'<div style="padding:15px 0;color:#64748b">По доступным данным сигналов с заданными порогами нет. Это не заменяет совещание и проверку качества данных.</div>';
 if(all.length>state.shown)html+='<button type="button" data-route-ai-more="1" class="chip" style="margin-top:12px">Показать ещё ('+(all.length-state.shown)+')</button>';
 out.innerHTML=html;
}
async function decide(f,decision){
 if(!boss()||state.busy||!['approve','reject','discuss'].includes(decision))return;
 let note='';
 if(decision==='discuss'){const s=prompt('Что обсудить на совещании? Комментарий ДФ (можно оставить пустым):','');if(s===null)return;note=s.trim().slice(0,900);}
 try{
  const user=(()=>{try{return String(currentProfile?.email||currentProfile?.name||currentUser?.email||'ДФ')}catch(_){return'ДФ'}})();
  const data={
   audit_month:state.month,manager_name:f.manager,item_key:f.itemKey,kind:f.kind,
   client_id:f.clientId,client_name:f.clientName||null,reason:f.reason,basis:f.details,
   decision,director_note:note||null,updated_by:user,updated_at:new Date().toISOString()
  };
  const {data:saved,error}=await db.from('route_month_ai_reviews').upsert(data,{onConflict:'audit_month,manager_name,item_key,kind'}).select().single();
  if(error)throw error;
  state.reviews.set(reviewKey(f),saved);render();
 }catch(e){console.error(VERSION+' decision',e);alert('Не удалось сохранить решение ДФ: '+(e.message||e))}
}
window.RESANTA_ROUTE_MONTH_AI_AUDIT_V1=Object.freeze({version:VERSION,manualOnly:true,originalRoutesUnchanged:true,bossOnly:true,run:audit});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();