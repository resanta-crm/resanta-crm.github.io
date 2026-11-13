/* GPS first TT punctuality: inside existing GPS, owner-only, no writes. */
(function(w,d){
'use strict';if(w.crmGPSFirstTTv1)return;
const OWNER='544fb1e2-ef70-44de-bc62-e0e1596a4bfc',RPC='crm_gps_first_tt_lateness_v1';
const MONTHS=['2026-09','2026-10','2026-11'],LABELS=['Сентябрь','Октябрь','Ноябрь'];
const state={rows:null,error:'',busy:false,selected:'all',seq:0};
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const owner=()=>{try{return typeof currentUser!=='undefined'&&currentUser?.id===OWNER &&
 typeof currentProfile!=='undefined'&&currentProfile?.id===OWNER&&currentProfile.role==='boss'&&
 String(currentProfile.email||'').toLowerCase()==='payushin_ar@resanta.ru';}catch{return false;}};
const api=()=>typeof db!=='undefined'?db:w.db;
const root=()=>d.getElementById('gps-first-tt-v1');
const fmt=n=>Math.round(Number(n)||0).toLocaleString('ru-RU');
const duration=n=>n==null?'—':Math.floor(Math.round(Number(n)||0)/60)+' ч '+(Math.round(Number(n)||0)%60)+' мин';
const date=v=>/^\d{4}-\d\d-\d\d$/.test(String(v))?v.slice(8)+'.'+v.slice(5,7)+'.'+v.slice(0,4):String(v||'—');
const clock=v=>String(v||'').slice(0,5)||'—';
const arrival=v=>v?new Date(v).toLocaleTimeString('ru-RU',{timeZone:'Europe/Minsk',hour:'2-digit',minute:'2-digit'}):'—';
const reasons={no_approved_time:'Не задано утверждённое время',unfinished_or_missing_day:'Нет завершённого дня',
 stale_or_missing_gps_aggregate:'GPS-агрегат устарел или отсутствует',
 no_matched_physical_tt:'Нет стоянки на утверждённой первой ТТ',
 visit_gps_unverified:'GPS-отчёт не подтверждён',gps_distance_unverified:'Нет точного GPS',
 short_stop:'Стоянка менее двух минут',arrival_time_unverified:'Нет подтверждённого времени',
 confirmed_gps_evidence:'GPS-доказательство'};
function aggregate(rows){
 const names=[...new Set(rows.map(x=>String(x.manager_name||'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
 return names.map(name=>{
  const list=rows.filter(x=>x.manager_name===name);
  const each=MONTHS.map(month=>{
   const r=list.filter(x=>String(x.work_date||'').startsWith(month));
   return {month,days:r.length,verified:r.filter(x=>x.proof_status.startsWith('gps_confirmed_')).length,
    late:r.filter(x=>x.proof_status==='gps_confirmed_late').length,
    review:r.filter(x=>x.proof_status==='needs_review').length,
    total:r.filter(x=>x.proof_status==='gps_confirmed_late').reduce((n,x)=>n+Number(x.late_minutes||0),0)};
  });
  const sum=key=>each.reduce((n,x)=>n+x[key],0);
  return {name,each,days:sum('days'),verified:sum('verified'),late:sum('late'),review:sum('review'),total:sum('total')};
 });
}
function showLauncher(){
 if(!owner())return;
 const host=d.getElementById('page-gps-control');if(!host)return;
 if(d.getElementById('gps-first-tt-launch-v1'))return;
 const btn=d.createElement('button');btn.type='button';btn.id='gps-first-tt-launch-v1';
 btn.textContent='⏱ Опоздания на первую ТТ · сентябрь–ноябрь';
 btn.style.cssText='padding:10px 15px;margin:12px 0;border:1px solid #a6c8e6;background:#eaf5ff;color:#155987;border-radius:10px;font-weight:800;cursor:pointer';
 btn.addEventListener('click',()=>open());
 const before=d.getElementById('gps-director-view-v236427');
 if(before)before.before(btn);else host.prepend(btn);
}
function mount(){
 if(!owner())return null;
 const host=d.getElementById('page-gps-control');if(!host)return null;
 showLauncher();
 let el=root();if(el)return el;
 el=d.createElement('section');el.id='gps-first-tt-v1';
 el.setAttribute('aria-label','Опоздания на первую торговую точку');
 // Outside the legacy GPS director DOM: re-renders never hide or rearrange our report.
 host.appendChild(el);return el;
}
function draw(){
 const el=mount();if(!el)return;
 let html='<div class="gf-head"><div><h2>⏱ Первая торговая точка · время прибытия</h2>'+
 '<p class="gf-muted">Сентябрь, октябрь и ноябрь 2026 · только подтверждённые GPS-доказательства</p></div>'+
 '<div><button type="button" class="gf-btn" data-gf-refresh>↻ Пересчитать</button> <button type="button" class="gf-btn" data-gf-close>Свернуть</button></div></div>';
 if(state.busy){el.innerHTML=html+'<p class="gf-muted">Проверяю утверждённые маршруты и GPS…</p>';return;}
 if(state.error){el.innerHTML=html+'<p class="gf-warn">'+escape(state.error)+'</p>';return;}
 if(!state.rows){el.innerHTML=html+'<p class="gf-muted">Для проверки нажмите «Пересчитать». Никакие исходные GPS-данные не изменяются.</p>';return;}
 const rows=state.rows,managers=aggregate(rows);
 const sum=key=>managers.reduce((n,x)=>n+x[key],0);
 html+='<div class="gf-kpis">'+[['Дней с плановой первой ТТ','days'],
 ['GPS-доказательств','verified'],['Позже плана · GPS','late'],['Нужна сверка','review']].map(([label,key])=>
 '<div><small>'+label+'</small><strong>'+fmt(sum(key))+'</strong></div>').join('')+'</div>';
 html+='<p class="gf-warn">Не считайте эту сводку доказательством дисциплинарного проступка: требуется проверка согласованных переносов и причин. '+
 fmt(sum('review'))+' дней не включены в сумму, потому что GPS-доказательства отсутствуют либо устарели. Время — аналитическое отклонение, не «неотработанные часы».</p>';
 html+='<h3>Сравнение менеджеров</h3><div class="gf-scroll"><table><thead><tr><th>Менеджер</th>'+
 LABELS.map(label=>'<th>'+label+'<br><small>случаи / время</small></th>').join('')+
 '<th>Итого</th><th>Нужна сверка</th><th></th></tr></thead><tbody>'+
 managers.map(m=>'<tr><td><b>'+escape(m.name)+'</b><small>'+fmt(m.verified)+' из '+fmt(m.days)+' дней с GPS-доказательствами</small></td>'+
 m.each.map(x=>'<td>'+fmt(x.late)+' / '+duration(x.total)+'</td>').join('')+
 '<td><b>'+fmt(m.late)+'</b> / '+duration(m.total)+'</td><td>'+fmt(m.review)+'</td>'+
 '<td><button type="button" class="gf-btn" data-gf-manager="'+escape(m.name)+'">Детали</button></td></tr>').join('')+
 '</tbody></table></div>';
 const subset=state.selected==='all'?rows:rows.filter(x=>x.manager_name===state.selected);
 html+='<h3>Конкретные дни'+(state.selected==='all'?'':' · '+escape(state.selected))+'</h3>'+
 '<button type="button" class="gf-btn" data-gf-manager="all">Все менеджеры</button>'+
 '<div class="gf-scroll"><table><thead><tr><th>Дата</th><th>Менеджер</th><th>Первая ТТ</th>'+
 '<th>План</th><th>GPS</th><th>Отклонение</th><th>Статус</th></tr></thead><tbody>'+
 subset.map(x=>'<tr><td>'+escape(date(x.work_date))+'</td><td>'+escape(x.manager_name)+'</td>'+
 '<td>'+escape(x.first_tt_name||'—')+'</td><td>'+escape(clock(x.planned_time))+'</td>'+
 '<td>'+escape(arrival(x.actual_arrival))+'</td><td>'+duration(x.late_minutes)+'</td>'+
 '<td class="'+(x.proof_status==='needs_review'?'gf-review':'gf-proof')+'">'+
 escape(x.proof_status==='needs_review'?'Нужна сверка':x.proof_status==='gps_confirmed_late'?'GPS позже плана':'GPS вовремя')+
 '<small>'+escape(reasons[x.proof_reason]||x.proof_reason||'')+'</small></td></tr>').join('')+'</tbody></table></div>';
 html+='<p class="gf-muted">Источник: защищённый crm_gps_first_tt_lateness_v1. Строгая методика: утверждённый первый визит, завершённый день, свежий агрегат, GPS-отчёт подтверждён, точность до 35 м, стоянка не менее 2 минут. Только чтение.</p>';
 el.innerHTML=html;
}
async function refresh(){
 if(!owner()||state.busy||!mount())return false;
 state.busy=true;state.error='';draw();const seq=++state.seq;
 try{
  if(!api()?.rpc)throw Error('Нет подключения к CRM');
  const r=await api().rpc(RPC,{p_from:'2026-09-01',p_to:'2026-11-13'});
  if(r.error)throw r.error;
  if(seq!==state.seq||!owner())return false;
  if(!Array.isArray(r.data))throw Error('Некорректный ответ GPS');
  state.rows=r.data;return true;
 }catch(e){if(seq===state.seq)state.error=String(e?.message||e).slice(0,180);return false;}
 finally{if(seq===state.seq){state.busy=false;if(owner())draw();}}
}
function open(){
 const el=mount();if(!el)return false;el.hidden=false;draw();
 if(!state.rows&&!state.busy)void refresh();
 el.scrollIntoView?.({behavior:'smooth',block:'start'});return true;
}
function voiceHandle(text,ui){
 if(!owner()||!/опоздан|перв(?:ую|ой)\s+(?:торговую\s+)?точк|время\s+первого\s+визита/i.test(String(text||'')))return false;
 if(typeof goPage==='function')goPage('gps-control','GPS-контроль');
 if(typeof w.crmSchedulePageHook==='function')w.crmSchedulePageHook('gps-control',open,300);
 else setTimeout(open,350);
 // Answer only from confirmed RPC rows; never turn missing GPS into zero lateness.
 void (async()=>{
  const wasPending=w.__resantaAI360PendingV1===true;
  if(!wasPending)w.__resantaAI360PendingV1=true;
  try{
   // Navigation/own GPS panel mounts asynchronously. Never race the on-demand RPC.
   await new Promise(resolve=>setTimeout(resolve,420));
   if(!owner())return;
   if(!state.rows&&!state.busy)await refresh();
   for(let attempts=0;attempts<100&&state.busy&&owner();attempts++)
     await new Promise(resolve=>setTimeout(resolve,150));
   if(!owner()||!state.rows){
     ui?.answer?.('Открыла GPS-контроль, но достоверный расчёт пока недоступен. Цифры опозданий не придумываю.');
     return;
   }
   const lower=String(text||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
   const month=/сентябр/.test(lower)?'2026-09':/октябр/.test(lower)?'2026-10':/ноябр/.test(lower)?'2026-11':null;
   const manager=/руднев|александр.*руднев/.test(lower)?'Руднев':
    /шкуран|татьяна/.test(lower)?'Шкуран':
    /ачинович|коченович|екатерина/.test(lower)?'Ачинович':null;
   const scoped=state.rows.filter(x=>(!month||String(x.work_date).startsWith(month))&&
     (!manager||x.manager_name===manager));
   const summaries=aggregate(scoped);
   if(!summaries.length){ui?.answer?.('На выбранный период нет утверждённых первых визитов для расчёта.');return;}
   const where=month===null?'за сентябрь, октябрь и ноябрь':month==='2026-09'?'за сентябрь':month==='2026-10'?'за октябрь':'за ноябрь';
   const chunks=summaries.map(m=>m.name+': '+m.late+' GPS-подтверждённых прибытия позже плана, '+duration(m.total)+
       ', ещё '+m.review+' дней требуют проверки');
   ui?.answer?.('По первым торговым точкам '+where+'. '+chunks.join('; ')+
     '. Эти показатели предварительные до сверки согласованных переносов, а не основание для штрафа.');
  }catch{ui?.answer?.('Сейчас не могу подтвердить GPS-цифры. Открыла раздел для проверки.');}
  finally{if(!wasPending)w.__resantaAI360PendingV1=false;}
 })();
 return true;
}
d.addEventListener('click',e=>{
 if(e.target.closest?.('#nav-gps-control, #gps-tab-director-v236427, #bn-gps-control'))setTimeout(showLauncher,250);
 const b=e.target.closest?.('#gps-first-tt-v1 [data-gf-refresh],#gps-first-tt-v1 [data-gf-close],#gps-first-tt-v1 [data-gf-manager]');
 if(!b||!owner())return;
 if(b.hasAttribute('data-gf-refresh'))void refresh();
 else if(b.hasAttribute('data-gf-close'))root().hidden=true;
 else if(b.hasAttribute('data-gf-manager')){state.selected=b.dataset.gfManager;draw();}
});
w.crmGPSFirstTTv1=Object.freeze({open,refresh,voiceHandle,aggregate,version:'20261113-readonly-v1'});
})(window,document);
