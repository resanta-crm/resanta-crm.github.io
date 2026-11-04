/* Triovist · Summary 360 · Uni A / Uni X.
   Read-only display of the existing authorized 1C dashboard. No independent accounting.
   The Work and Commerce menu is owned by the existing Triovist router and is untouched.
 */
(function(w){
'use strict';
if(w.RESANTA_TRIOVIST_SUMMARY360_V1)return;
const ID='tri-overview-360',STYLE='tri-overview-360-css';
const state={mode:'groups',sources:null,loadedAt:0,busy:false,lastIdentity:'',closed:null,closedKey:'',closedAt:0,closedBusy:false,closedEpoch:0};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=x=>Number.isFinite(Number(x))?Number(x):0;
const fmt=x=>n(x).toLocaleString('ru-RU',{maximumFractionDigits:2,minimumFractionDigits:2})+' BYN';
const short=x=>Math.abs(n(x))>=1000000?(n(x)/1000000).toLocaleString('ru-RU',{maximumFractionDigits:2})+' млн':Math.abs(n(x))>=1000?(n(x)/1000).toLocaleString('ru-RU',{maximumFractionDigits:1})+' тыс.':n(x).toLocaleString('ru-RU');
const percent=x=>n(x).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%';
const page=()=>document.getElementById('page-triovist'),el=()=>document.getElementById(ID);
const user=()=>{try{return typeof currentProfile!=='undefined'?currentProfile||{}:w.currentProfile||{}}catch(_){return w.currentProfile||{}}};
const isManager=()=>user().role==='manager'&&user().access_scope==='triovist';
const norm=x=>String(x||'').trim().toLowerCase();
const email=()=>norm(user().email);
const currentYm=()=>{try{return String(TODAY||new Date().toISOString().slice(0,10)).slice(0,7)}catch(_){return new Date().toISOString().slice(0,7)}};
const home=()=>page()?.classList.contains('active')&&page()?.dataset.triovistView==='home';
const snap=()=>{try{return w.TRIOVIST_RUNTIME_STATE_V227324?.snapshot?.()}catch(_){return null}};
function age(x){const d=Date.parse(String(x||''));return Number.isFinite(d)?Math.max(0,Math.floor((Date.now()-d)/86400000)):null}
function priorMonth(ym){const y=Number(ym.slice(0,4)),m=Number(ym.slice(5,7));return y&&m>=1&&m<=12?new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,7):''}
function monthLabel(ym){const y=Number(ym.slice(0,4)),m=Number(ym.slice(5,7));return m>=1&&m<=12?new Date(Date.UTC(y,m-1,1)).toLocaleDateString('ru-RU',{timeZone:'UTC',month:'long',year:'numeric'}):ym}
function closedData(d){
 if(!d?.incomplete||d.mode!=='month')return null;
 const month=priorMonth(d.end),key=email()+'|'+month;
 if(!state.closed||state.closedKey!==key)return null;
 const mgr=isManager()?email():norm(document.getElementById('tri-manager-filter')?.value||'all'),q=norm(document.getElementById('tri-search')?.value);
 let a=0,b=0;
 for(const r of state.closed.items){
  if(mgr&&mgr!=='all'&&norm(r.manager_email)!==mgr)continue;
  if(q&&!norm([r.assigned_group,r.category,r.subgroup,r.sku,r.product].join(' ')).includes(q))continue;
  a+=Math.round(n(r.current_revenue)*100);b+=Math.round(n(r.previous_revenue)*100);
 }
 return {month,current:a/100,previous:b/100,pct:b>0?(a/b-1)*100:null};
}
async function loadClosed(force=false){
 const d=verified();if(!d?.incomplete||d.mode!=='month')return;
 const m=priorMonth(d.end),key=email()+'|'+m;
 if(!m||state.closedBusy)return;
 if(!force&&state.closed&&state.closedKey===key&&Date.now()-state.closedAt<300000)return;
 let client;try{client=typeof db!=='undefined'?db:w.db}catch(_){client=w.db}
 if(!client?.rpc)return;
 state.closedBusy=true;const epoch=++state.closedEpoch;
 try{
  const r=await client.rpc('triovist_get_dashboard',{p_end_month:m,p_mode:'month'});
  if(r.error)throw r.error;
  if(epoch!==state.closedEpoch||key!==email()+'|'+m)return;
  if(!r.data||r.data.end_month!==m||!Array.isArray(r.data.items))throw Error('Нет подтверждённых данных закрытого месяца');
  state.closed=r.data;state.closedKey=key;state.closedAt=Date.now();
 }catch(e){console.warn('Triovist Summary 360 last closed month:',e);state.closed=null;state.closedKey=key;state.closedAt=0}
 finally{state.closedBusy=false}
}
function verified(){
 const src=snap();if(!src?.loaded||!src.dashboard||!Array.isArray(src.salesItems))return null;
 const d=src.dashboard,end=String(d.end_month||document.getElementById('tri-period-month')?.value||'').slice(0,7);
 const incomplete=end===currentYm();
 const fMgr=isManager()?email():norm(document.getElementById('tri-manager-filter')?.value||'all');
 const q=norm(document.getElementById('tri-search')?.value);
 const rows=src.salesItems.filter(r=>(!fMgr||fMgr==='all'||norm(r.manager_email)===fMgr)&&(!q||norm([r.assigned_group,r.category,r.subgroup,r.sku,r.product].join(' ')).includes(q)));
 const mm=new Map(),gg=new Map();let currentC=0,previousC=0;
 for(const r of rows){
  const a=Math.round(n(r.current_revenue)*100),b=Math.round(n(r.previous_revenue)*100);
  const e=norm(r.manager_email),g=String(r.assigned_group||r.category||'Не распределено'),m=String(r.manager_name||'Менеджер');
  currentC+=a;previousC+=b;
  if(!mm.has(e))mm.set(e,{email:e,name:m,cur:0,prev:0});
  mm.get(e).cur+=a;mm.get(e).prev+=b;
  const key=e+'|'+g;if(!gg.has(key))gg.set(key,{name:g,manager:m,cur:0,prev:0});
  gg.get(key).cur+=a;gg.get(key).prev+=b;
 }
 const plans=new Map();
 for(const p of d.period_plans||[])if(p?.plan_amount!=null&&Number.isFinite(Number(p.plan_amount)))plans.set(norm(p.manager_email),Number(p.plan_amount));
 const managers=[...mm.values()].filter(x=>x.email).map(x=>({email:x.email,name:x.name,cur:x.cur/100,prev:x.prev/100,plan:plans.has(x.email)?plans.get(x.email):null}));
 const allPlan=managers.length&&managers.every(x=>x.plan!=null)?managers.reduce((s,x)=>s+x.plan,0):null;
 return {end,incomplete,mode:document.getElementById('tri-period-mode')?.value||'month',
  current:currentC/100,previous:previousC/100,pct:incomplete||previousC<=0?null:(currentC/previousC-1)*100,
  allPlan,managers,groups:[...gg.values()].map(x=>({name:x.name,manager:x.manager,cur:x.cur/100,prev:x.prev/100})),
  imported:d.last_import?.imported_at||'',history:d.history||{}};
}
function styles(){
 if(document.getElementById(STYLE))return;
 const s=document.createElement('style');s.id=STYLE;s.textContent=[
 '#page-triovist[data-triovist-view="home"].tri360-ready #tri-kpis,#page-triovist[data-triovist-view="home"].tri360-ready #tri-manager-cards{display:none!important}',
 '#'+ID+'{display:none;color:#14283f;margin:12px 0 18px;font-size:13px}',
 '#page-triovist[data-triovist-view="home"] #'+ID+'{display:block}',
 '#'+ID+' *{box-sizing:border-box}',
 '#'+ID+' .t360-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:12px}',
 '#'+ID+' .t360-kpi{min-width:0;border:1px solid #dfe5ef;background:linear-gradient(130deg,#f5faff,#fff);border-radius:13px;padding:14px}',
 '#'+ID+' .t360-kpi.good{background:linear-gradient(130deg,#e9faef,#fff)}#'+ID+' .t360-kpi.warn{background:linear-gradient(130deg,#fff4e6,#fff)}',
 '#'+ID+' .t360-kpi span{font-size:11px;color:#52637e;display:block;margin-bottom:8px;font-weight:650}',
 '#'+ID+' .t360-kpi strong{font-size:clamp(15px,1.65vw,22px);font-weight:800;display:block;overflow-wrap:anywhere}',
 '#'+ID+' .t360-kpi small{color:#64748b;font-size:10px;display:block;margin-top:6px;line-height:1.4}',
 '#'+ID+' .t360-grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(260px,1fr);gap:12px;margin-bottom:12px}',
 '#'+ID+' .t360-card{background:#fff;border:1px solid #e1e7f1;border-radius:14px;padding:15px;min-width:0}',
 '#'+ID+' .t360-head{display:flex;justify-content:space-between;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:12px}',
 '#'+ID+' h3{font-size:15px;font-weight:800;margin:0}#'+ID+' .t360-note{font-size:11px;color:#64748b;line-height:1.5}',
 '#'+ID+' button{border-radius:9px;border:1px solid #cbd9eb;background:#fff;color:#155799;padding:8px 10px;font-size:11px;font-weight:750;cursor:pointer}',
 '#'+ID+' button.on,#'+ID+' button.primary{background:#185fa5;border-color:#185fa5;color:white}',
 '#'+ID+' button:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}',
 '#'+ID+' .t360-actions{display:flex;flex-wrap:wrap;gap:6px}',
 '#'+ID+' .t360-bars{display:flex;flex-direction:column;gap:13px;max-height:350px;overflow-y:auto}',
 '#'+ID+' .t360-bar{display:grid;grid-template-columns:minmax(85px,150px) minmax(0,1fr) minmax(75px,110px);gap:8px;align-items:center}',
 '#'+ID+' .t360-bar b{font-size:11px;overflow-wrap:anywhere}#'+ID+' .t360-bar em{font-style:normal;font-size:11px;text-align:right}',
 '#'+ID+' .t360-tracks{display:grid;gap:4px}#'+ID+' .t360-track{height:11px;border-radius:20px;background:#f0f4fa;overflow:hidden}',
 '#'+ID+' .t360-track i{display:block;height:100%;border-radius:20px;background:#297cce}',
 '#'+ID+' .t360-track.prior i{background:#b9cee5}',
 '#'+ID+' .t360-summary{border:1px solid #ddd5fa;border-radius:12px;background:linear-gradient(145deg,#f4f0ff,#fff);padding:13px}',
 '#'+ID+' .t360-summary ul{padding:0 0 0 20px;line-height:1.55;margin:7px 0 12px}#'+ID+' .t360-summary li{margin:5px 0}',
 '#'+ID+' .t360-people{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}',
 '#'+ID+' .t360-person{border:1px solid #e2e9f2;border-radius:10px;background:#fafcff;padding:12px}',
 '#'+ID+' .t360-person b{font-size:13px}#'+ID+' .t360-person p{font-size:11px;margin:7px 0 0;color:#52637e}',
 '#'+ID+' .t360-source{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}',
 '#'+ID+' .t360-source div{background:#f8fafc;border:1px solid #e3eaf2;border-radius:9px;padding:9px;font-size:11px}',
 '#'+ID+' .t360-source small{display:block;font-size:10px;color:#52637e;margin-top:3px}',
 '#'+ID+' .t360-warning{border:1px solid #f0bc6d;border-radius:11px;padding:10px 12px;background:#fff7e9;color:#915113;margin:0 0 12px;font-size:12px}',
 '@media(max-width:1150px){#'+ID+' .t360-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}#'+ID+' .t360-grid{grid-template-columns:1fr}}',
 '@media(max-width:720px){#'+ID+' .t360-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}#'+ID+' .t360-people{grid-template-columns:1fr}#'+ID+' .t360-source{grid-template-columns:1fr}}'
 ].join('\n');document.head.appendChild(s);
}
function mount(){
 const p=page();if(!p)return null;styles();let box=el();
 if(!box){
  box=document.createElement('section');box.id=ID;box.setAttribute('aria-label','Триовист · Сводка 360°');
  const before=document.getElementById('tri-kpis');
  if(before?.parentElement===p)p.insertBefore(box,before);else p.appendChild(box);
  box.addEventListener('click',ev=>{
   const b=ev.target.closest('button[data-tri360]');if(!b)return;
   if(b.dataset.tri360==='mode'){state.mode=b.dataset.value==='managers'?'managers':'groups';render();return}
   if(b.dataset.tri360==='section'){const key=b.dataset.value;if(!['tasks','sales','groups','stock','parser','cards','competitors'].includes(key))return;
    document.querySelector('#tr14-shell [data-tr14="'+key+'"]')?.click();return}
   if(b.dataset.tri360==='refresh'){void loadSources(true).then(render)}
  });
 }
 return box;
}
function kpi(label,value,note,cl=''){return '<div class="t360-kpi '+cl+'"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></div>'}
function graph(d){
 const data=(state.mode==='managers'?d.managers.map(x=>({name:x.name,cur:x.cur,prev:x.prev})):d.groups.map(x=>({name:x.name+' · '+x.manager,cur:x.cur,prev:x.prev}))).sort((a,b)=>b.cur-a.cur||b.prev-a.prev).slice(0,10);
 const max=Math.max(1,...data.map(x=>d.incomplete?x.cur:Math.max(x.cur,x.prev)));
 const bars=data.map(x=>'<div class="t360-bar"><b>'+esc(x.name)+'</b><div class="t360-tracks">'+
 '<div class="t360-track" title="Продажи '+esc(fmt(x.cur))+'"><i style="width:'+Math.max(0,Math.min(100,x.cur/max*100)).toFixed(1)+'%"></i></div>'+
 (d.incomplete?'':'<div class="t360-track prior" title="Прошлый год '+esc(fmt(x.prev))+'"><i style="width:'+Math.max(0,Math.min(100,x.prev/max*100)).toFixed(1)+'%"></i></div>')+'</div>'+
 '<em>'+esc(short(x.cur))+'</em></div>').join('');
 return '<div class="t360-card"><div class="t360-head"><h3>📊 Продажи '+(state.mode==='managers'?'по менеджерам':'по группам')+'</h3>'+
 '<div class="t360-actions"><button data-tri360="mode" data-value="groups" class="'+(state.mode==='groups'?'on':'')+'">Группы</button><button data-tri360="mode" data-value="managers" class="'+(state.mode==='managers'?'on':'')+'">Менеджеры</button></div></div>'+
 '<div class="t360-note" style="margin-bottom:12px">'+(d.incomplete?'🔵 Только фактические продажи этого месяца. Полный прошлогодний месяц не сравниваем.':'🔵 Текущий период · ⚪ Тот же период прошлого года. Данные 1С.')+'</div>'+
 '<div class="t360-bars">'+(bars||'<div class="t360-note">По фильтру продаж нет.</div>')+'</div></div>';
}
function briefing(d){
 const tips=[];
 if(d.incomplete){tips.push('Текущий месяц не закрыт. Динамику смотрим за последний завершённый месяц.');const c=closedData(d);if(c?.pct!=null)tips.push(monthLabel(c.month)+' к прошлому году: '+(c.pct>=0?'+':'')+percent(c.pct)+'.')}
 else if(d.pct!=null)tips.push('Динамика к прошлому периоду: '+(d.pct>0?'+':'')+percent(d.pct)+'.');
 if(d.allPlan==null)tips.push('План задан не всем менеджерам либо отсутствует. Не подменяем его прогнозом.');
 else if(d.allPlan>0)tips.push('Общее выполнение плана: '+percent(d.current/d.allPlan*100)+'.');
 if(!d.incomplete){
  const drops=d.groups.map(x=>({...x,drop:x.prev-x.cur})).filter(x=>x.drop>0).sort((a,b)=>b.drop-a.drop);
  if(drops.length)tips.push('Основное падение по группам: '+drops.slice(0,2).map(x=>x.name).join(', ')+'.');
 }else{
  const leaders=[...d.groups].sort((a,b)=>b.cur-a.cur).slice(0,2);
  if(leaders.length)tips.push('Основные продажи сейчас: '+leaders.map(x=>x.name).join(', ')+'.');
 }
 const date=state.sources?.stock?.snapshot_date;
 if(date&&age(date)>10)tips.push('Остатки партнёра от '+String(date).slice(0,10)+'. Перед заказом запросите обновление.');
 if(!tips.length)tips.push('Уточните период или дождитесь подтверждённой загрузки продаж.');
 return '<div class="t360-summary"><div class="t360-head"><h3>✨ Короткий ИИ-брифинг</h3><span class="t360-note">Фактические данные CRM</span></div>'+
 '<ul>'+tips.slice(0,5).map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><div class="t360-actions">'+
 '<button class="primary" data-tri360="section" data-value="tasks">Перейти к задачам ИИ</button><button data-tri360="section" data-value="groups">Посмотреть группы</button></div></div>';
}
function managers(d){
 return '<div class="t360-card"><div class="t360-head"><h3>👥 Менеджеры и товарные группы</h3><button data-tri360="section" data-value="sales">Все продажи</button></div><div class="t360-people">'+
 (d.managers.length?d.managers.map(x=>'<div class="t360-person"><b>'+esc(x.name)+'</b><p>Продажи: <strong>'+esc(fmt(x.cur))+'</strong></p><p>План: <strong>'+esc(x.plan==null?'Не задан':fmt(x.plan))+'</strong></p>'+
 (d.incomplete?'<p>Ноябрь не завершён</p>':(x.prev>0?'<p>Динамика: '+(x.cur>x.prev?'+':'')+percent((x.cur/x.prev-1)*100)+'</p>':''))+'</div>').join(''):'<p class="t360-note">Нет данных менеджеров по выбранному фильтру.</p>')+'</div></div>';
}
function sourcePanel(d){
 const stock=String(state.sources?.stock?.snapshot_date||'').slice(0,10);
 const parser=state.sources?.parser?.working?.completed_at||'';
 return '<div class="t360-card"><div class="t360-head"><h3>🛡 Свежесть источников</h3><button data-tri360="refresh">Проверить</button></div><div class="t360-source">'+
 '<div>Продажи 1С<small>'+esc(String(d.imported||'Не определено').slice(0,16).replace('T',' '))+'</small></div>'+
 '<div>Остатки партнёра<small>'+esc(stock||'Дата недоступна')+(stock?' · '+age(stock)+' дн.':'')+'</small></div>'+
 '<div>21vek парсер<small>'+esc(parser?String(parser).slice(0,16).replace('T',' '):'Откройте раздел Парсер 21vek')+'</small></div></div>'+
 '<div class="t360-actions" style="margin-top:10px"><button data-tri360="section" data-value="stock">Остатки и заказ</button><button data-tri360="section" data-value="parser">Парсер 21vek</button><button data-tri360="section" data-value="cards">Карточки</button><button data-tri360="section" data-value="competitors">Конкуренты</button></div></div>';
}
function render(){
 const root=mount(),p=page();if(!root||!p)return false;
 const d=verified();
 if(!d){p.classList.remove('tri360-ready');root.innerHTML='';return false}
 const identity=email()+'|'+(isManager()?'manager':'boss');
 if(identity!==state.lastIdentity){state.lastIdentity=identity;state.sources=null;state.loadedAt=0;state.mode='groups';state.closed=null;state.closedKey='';state.closedAt=0;state.closedEpoch++}
 const isPartial=d.incomplete;
 const pct=d.pct==null?'Не рассчитываем':(d.pct>0?'+':'')+percent(d.pct);
 const periodLabel=d.mode==='month'?'Выбранный месяц':d.mode==='ytd'?'С начала года':'Выбранный период';
 const last=closedData(d);
 root.innerHTML='<div class="t360-head"><div><h3 style="font-size:20px">Триовист · Сводка 360°</h3><div class="t360-note">Сохранили меню «Работа» и «Коммерция». Все действия — в прежних разделах.</div></div><b>'+esc(d.end)+' · '+periodLabel+'</b></div>'+
 (isPartial?'<div class="t360-warning">ℹ️ Месяц продолжается. Факт за ноябрь показываем отдельно; сравнение год к году — за последний завершённый месяц.</div>':'')+
 '<div class="t360-kpis">'+(isPartial&&d.mode==='month'?
 kpi('💰 Факт '+monthLabel(d.end),fmt(d.current),'Источник: продажи 1С','good')+
 kpi('📅 Закрытый '+monthLabel(priorMonth(d.end)),last?fmt(last.current):'Загружаем…','Последний полный месяц')+
 kpi('📅 Год назад · '+monthLabel(String(Number(d.end.slice(0,4))-1)+'-'+priorMonth(d.end).slice(5,7)),last?fmt(last.previous):'Загружаем…','Тот же полный месяц предыдущего года')+
 kpi('📈 Год к году · '+monthLabel(priorMonth(d.end)),last&&last.pct!=null?(last.pct>=0?'+':'')+percent(last.pct):'Нет данных','Сравнение полных месяцев','good')+
 kpi('🎯 План '+monthLabel(d.end),d.allPlan==null?'Не задан':fmt(d.allPlan),d.allPlan==null?'План не заполнен для всех менеджеров':'Выполнение '+(d.allPlan>0?percent(d.current/d.allPlan*100):'нет расчёта'))
 :
 kpi('💰 Продажи',fmt(d.current),'Источник: 1С','good')+
 kpi('📉 Прошлый год',fmt(d.previous),'Тот же период предыдущего года')+
 kpi('📈 Динамика',pct,'Сопоставимые полные периоды','good')+
 kpi('🎯 План',d.allPlan==null?'Не задан':fmt(d.allPlan),d.allPlan==null?'Недостаточно планов':d.allPlan>0?'Выполнение '+percent(d.current/d.allPlan*100):'План равен нулю')+
 kpi('📦 Группы',d.groups.length,'В выбранном отчёте'))+'</div>'+
 '<div class="t360-grid">'+graph(d)+briefing(d)+'</div>'+
 '<div class="t360-grid">'+managers(d)+sourcePanel(d)+'</div>'+
 '<div class="t360-note">Данные берутся из действующего отчёта продаж; расчёты премии, планы и источники 1С не изменены. Подгруппы и SKU раскрываются в существующих разделах.</div>';
 p.classList.add('tri360-ready');return true;
}
async function loadSources(force=false){
 if(state.busy||(!force&&state.sources&&Date.now()-state.loadedAt<5*60*1000))return;
 let client;try{client=typeof db!=='undefined'?db:w.db}catch(_){client=w.db}
 if(!client?.rpc)return;state.busy=true;
 try{
  const [a,b]=await Promise.allSettled([client.rpc('triovist_partner_stock_state_v236207',{}),client.rpc('triovist_21vek_status_v236107',{})]);
  state.sources={stock:a.status==='fulfilled'&&!a.value.error?a.value.data:null,parser:b.status==='fulfilled'&&!b.value.error?b.value.data:null};
  state.loadedAt=Date.now();
 }finally{state.busy=false}
}
async function open(){
 mount();const ok=render();
 if(ok&&!state.busy)void loadSources(false).then(()=>{if(home())render()}).catch(()=>{});
 if(ok)void loadClosed().then(()=>{if(home())render()}).catch(()=>{});
 return ok;
}
const oldRender=w.renderTriovist;
if(typeof oldRender==='function')w.renderTriovist=function(){const result=oldRender.apply(this,arguments);if(home())Promise.resolve().then(render);return result};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
w.RESANTA_TRIOVIST_SUMMARY360_V1=Object.freeze({version:'1.0.0',open,render,readOnly:true,menuPreserved:true});
})(window);