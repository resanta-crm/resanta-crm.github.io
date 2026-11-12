/* RESANTA Promotions 360 · approved director screen (Uni AI/Uni X)
 * New view reads one scoped server RPC. Legacy approvals, photos and financial
 * workflows remain accessible via explicit "Учёт и документы" switch.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS360_V1)return;
const state={loaded:false,loading:false,enabled:null,showLegacy:false,data:null,error:'',
 mode:'active',manager:'all',search:'',selected:null,photos:[],tasks:[],photoError:''};
const rootId='promotions360-root';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const str=x=>String(x??'');
const num=x=>Number.isFinite(Number(x))?Number(x):0;
const money=x=>num(x).toLocaleString('ru-RU',{maximumFractionDigits:2})+' BYN';
const fmtDate=x=>x?new Date(x+'T12:00:00').toLocaleDateString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric'}):'—';
const stageLabel={before:'До начала',start:'Запуск',during:'В процессе',after:'После завершения'};
const stageOrder={before:0,start:1,during:2,after:3};
const actionStatus={open:'Открыто',working:'В работе',review:'На проверке',closed:'Завершено',escalated:'Просрочено'};
const fmtDateTime=x=>x?new Date(x).toLocaleString('ru-RU',{timeZone:'Europe/Minsk',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const isActive=()=>document.getElementById('page-promotions')?.classList.contains('active')===true;
const client=()=>typeof db!=='undefined'?db:window.db;
const rpc=async (fn,args={})=>{const {data,error}=await client().rpc(fn,args);if(error)throw error;return data};
const rows=x=>Array.isArray(x)?x:[];
const el=id=>document.getElementById(id);
const view=()=>document.getElementById('page-promotions');
function prepare(){
 const page=view();if(!page)return null;
 let root=el(rootId);
 if(!root){root=document.createElement('div');root.id=rootId;page.prepend(root)}
 if(!el('promo360-css')){
  const l=document.createElement('link');l.id='promo360-css';l.rel='stylesheet';
  l.href='./assets/211-promotions360-uniai-v1.css?v=20261112-uniai1';document.head.appendChild(l)
 }
 return root;
}
function legacy(){
 state.showLegacy=true;
 const page=view();page?.classList.remove('p360-active');page?.classList.add('p360-legacy');
 const root=el(rootId);if(root)root.hidden=true;
 try{window.renderPromotions?.()}catch(e){console.warn('Legacy promotions',e)}
 const old=el('p360-legacy-back');old?.remove();
 const back=document.createElement('div');back.id='p360-legacy-back';
 back.style.cssText='display:flex;justify-content:space-between;gap:8px;margin:0 0 12px;padding:11px;border:1px solid #e5e7eb;background:white;border-radius:10px;align-items:center';
 back.innerHTML='<b style="font-size:12px">Учёт и документы · прежние рабочие действия</b><button class="p360-btn" data-p360-back>← Вернуться к обзору 360°</button>';
 page?.prepend(back);
}
function restore(){
 state.showLegacy=false;view()?.classList.remove('p360-legacy');el('p360-legacy-back')?.remove();
 const r=prepare();if(r)r.hidden=false;draw();
}
function stateText(p){
 if(p.verification==='confirmed')return {text:'1С подтверждено',cls:'good'};
 const labels={sku_missing:'Уточнить SKU',client_id_check:'Связать клиента 1С',period_unverified:'Проверить границы периода',import_stale:'Импорт 1С устарел'};
 return {text:labels[p.verification]||'Нужна сверка',cls:'warn'};
}
function currentRows(){
 const list=rows(state.data?.rows);
 return list.filter(p=>(state.manager==='all'||p.manager_name===state.manager)&&
  (!state.search||(p.client_name+' '+p.title+' '+p.manager_name).toLowerCase().includes(state.search.toLowerCase())));
}
function filteredManagers(){return [...new Set(rows(state.data?.rows).map(x=>x.manager_name).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'))}
function briefing(){
 const list=rows(state.data?.rows),unverified=list.filter(x=>!x.confirmed_1c);
 const confirmedZero=list.filter(x=>x.confirmed_1c&&Number(x.verified_sales)===0&&Number(x.elapsed_days)>=7);
 const due=list.filter(x=>x.remaining_days<=7&&x.time_status==='active');
 const urgent=list.filter(x=>Number(x.open_actions)>0);
 const first=confirmedZero[0];
 return '<div class="p360-brief"><div class="p360-brief-head"><h3 style="margin:0;font-size:15px">✦ Лера · Утренний брифинг</h3><span class="p360-chip">Рекомендации по данным CRM</span></div>'+
 '<div class="p360-brief-body"><div><p class="p360-brief-note">Действуют '+num(state.data?.active)+
 ' акций. Подтверждены отгрузки по '+num(state.data?.verified_count)+' из '+num(state.data?.total)+
 '. По остальным необходимо сверить SKU, ID клиента или границы периода. '+
 'Поручения привязаны к конкретным акциям и ответственным.</p>'+
 '<div class="p360-muted">Лера не считает отсутствующие данные доказательством нулевых продаж.</div></div>'+
 '<div><div class="p360-brief-item">📌 '+unverified.length+' акций требуют сверки 1С</div>'+
 '<div class="p360-brief-item">⚠ '+confirmedZero.length+' акций с подтверждённым нулём после 7 дней'+
 (first?' · '+esc(first.client_name):'')+'</div>'+
 '<div class="p360-brief-item">📅 '+due.length+' акций скоро завершаются</div>'+
 '<div class="p360-brief-item">✅ '+urgent.length+' акций с открытыми действиями</div></div></div></div>';
}
function graph(){
 const groups=new Map();
 for(const r of rows(state.data?.rows)){
  const k=r.manager_name||'—',v=groups.get(k)||{name:k,plan:0,fact:0,confirmed:0,total:0};
  v.plan+=num(r.sales_plan);v.total++;
  if(r.confirmed_1c){v.fact+=num(r.verified_sales);v.confirmed++}
  groups.set(k,v);
 }
 const v=[...groups.values()].sort((a,b)=>b.plan-a.plan),max=Math.max(1,...v.map(x=>x.plan));
 return '<div class="p360-panel"><h3>📊 План акций по менеджерам</h3><div class="p360-muted">Планы из CRM; подтверждённый факт показываем только по сверенным акциям.</div>'+
 '<div class="p360-bars">'+v.map(x=>
  '<div class="p360-barline"><b>'+esc(x.name)+'</b><div><div class="p360-track"><div style="width:'+Math.max(1,x.plan/max*100)+'%"></div></div>'+
  '<div class="p360-track" style="height:6px;margin-top:3px"><div class="confirmed" style="width:'+Math.min(100,x.fact/max*100)+'%"></div></div></div>'+
  '<span class="p360-chartlabel">'+esc(money(x.plan))+'<span style="display:block;font-size:9px;color:var(--sub)">Факт: '+x.confirmed+'/'+x.total+'</span></span></div>').join('')+
 '</div><div class="p360-legend"><span><i></i>Планы</span><span><i class="verified"></i>Подтверждённый факт (частичный охват)</span></div></div>';
}
function confidenceChart(){
 const list=rows(state.data?.rows),confirmed=list.filter(p=>p.confirmed_1c).length;
 const uncertain=list.length-confirmed,zero=list.filter(p=>p.confirmed_1c&&num(p.verified_sales)===0).length;
 return '<div class="p360-panel"><h3>📈 Эффективность · доверие к данным</h3>'+
 '<div class="p360-brief-item"><b>'+confirmed+'</b> · точные клиент и SKU, проверенный период</div>'+
 '<div class="p360-brief-item"><b>'+uncertain+'</b> · требуется подтверждение 1С</div>'+
 '<div class="p360-brief-item"><b>'+zero+'</b> · подтверждённый нулевой факт</div>'+
 '<div style="display:flex;height:19px;background:#edf1f7;border-radius:20px;overflow:hidden;margin:16px 0 10px">'+
 '<span style="width:'+(list.length?confirmed/list.length*100:0)+'%;background:#20a46e"></span>'+
 '<span style="width:'+(list.length?uncertain/list.length*100:0)+'%;background:#f6ba63"></span></div>'+
 '<div class="p360-muted">ROI не показываем без подтверждённой дополнительной валовой прибыли и фактических затрат. Бюджет, зарезервированный под акцию, не равен расходам.</div></div>';
}
function cards(){
 const data=currentRows();
 return '<div class="p360-promoheader"><h3 style="margin:0;font-size:16px">Действующие акции · '+data.length+'</h3>'+
 '<div class="p360-filters"><select id="p360-mode">'+[['active','Идут сейчас'],['planned','Запланированы'],['pending','На согласовании'],['completed','Завершены'],['all','Все акции']].map(([v,t])=>'<option value="'+v+'" '+(v===state.mode?'selected':'')+'>'+t+'</option>').join('')+'</select>'+
 '<select id="p360-manager"><option value="all">Все менеджеры</option>'+filteredManagers().map(x=>'<option value="'+esc(x)+'" '+(x===state.manager?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select>'+
 '<input id="p360-search" placeholder="Клиент, название…" value="'+esc(state.search)+'"></div></div>'+
 '<div class="p360-cards">'+(data.length?data.map(p=>{
  const q=stateText(p),selected=state.selected===p.id;
  return '<button class="p360-card '+(selected?'selected':'')+'" data-p360-detail="'+esc(p.id)+'">'+
  '<div class="p360-card-title">'+esc(p.client_name)+'</div>'+
  '<div class="p360-card-sub">'+esc(p.title)+'</div><div class="p360-muted">'+esc(p.manager_name||'—')+' · '+fmtDate(p.start_date)+' — '+fmtDate(p.end_date)+'</div>'+
  '<div class="p360-card-stat"><span>План <b>'+money(p.sales_plan)+'</b></span>'+
  '<span>'+(p.confirmed_1c?'Факт <b>'+money(p.verified_sales)+'</b>':'Факт <b>—</b>')+'</span></div>'+
  '<div class="p360-actions" style="justify-content:space-between"><span class="p360-chip '+q.cls+'">'+esc(q.text)+'</span>'+
  '<span class="p360-muted">'+esc(p.photo_count)+' фото · открыть →</span></div></button>';
 }).join(''):'<div class="p360-panel p360-muted">По выбранным фильтрам акций нет.</div>')+'</div>';
}
function formatMonths(p){
 const m=rows(p.months).filter(x=>x?.month);if(!m.length)return '<p class="p360-muted">Динамика 1С ещё не подтверждена.</p>';
 const max=Math.max(1,...m.map(x=>num(x.sales)));
 return '<div class="p360-monthly">'+m.map(x=>'<div class="p360-monthlyrow"><span>'+esc(str(x.month).slice(5,7))+'.'+esc(str(x.month).slice(2,4))+'</span>'+
 '<div class="p360-monthlytrack"><i style="width:'+(num(x.sales)<=0?0:Math.max(3,num(x.sales)/max*100))+'%"></i></div>'+
 '<strong>'+money(x.sales)+'</strong></div>').join('')+'</div>'+
 '<p class="p360-muted">Справочно: помесячные отгрузки из 1С. Это не факт за точные даты акции. Точный план/факт показывается выше только после сверки клиента, SKU и периода.</p>';
}
function forecast(p){
 const duration=Math.max(1,Math.round((Date.parse(p.end_date+'T12:00:00Z')-Date.parse(p.start_date+'T12:00:00Z'))/86400000)+1);
 if(!p.confirmed_1c||Number(p.elapsed_days)<3)return null;
 return Math.max(0,Math.round(num(p.verified_sales)*duration/Math.max(1,Number(p.elapsed_days))));
}
function detail(){
 const p=rows(state.data?.rows).find(x=>x.id===state.selected);if(!p)return '';
 const q=stateText(p),taskRows=rows(state.tasks);
 const actions='<div class="p360-panel"><h3>✦ Лера · Причина и конкретное действие</h3><div class="p360-info">'+
 esc(p.confirmed_1c&&num(p.verified_sales)===0&&p.elapsed_days>=7?'По подтверждённым данным 1С отгрузок нет. Менеджер должен выяснить причину, предпринять действие и зафиксировать результат.':p.lera_action||'Проверить данные и назначить следующее действие.')+'</div>'+
 (p.confirmed_1c&&num(p.verified_sales)===0&&p.elapsed_days>=7?'<p class="p360-muted">Отгрузки по точным SKU и клиенту подтверждены, но нулевые. Лера запросит причину и конкретное действие.</p>':
 '<p class="p360-muted">До оценки нулевых продаж нужно подтвердить правильность загрузки 1С, ID клиента и период акции.</p>')+
 '<div><h4>Поручения по акции</h4>'+
 (taskRows.length?taskRows.map(t=>'<div class="p360-task"><b>Проверка после '+t.milestone+' дней</b> · '+esc(actionStatus[t.status]||t.status)+
 '<div class="p360-muted">Ответственный: '+esc(p.manager_name||'—')+' · ответ до '+esc(fmtDateTime(t.due_at))+'</div>'+
 (t.reason?'<div>Причина: '+esc(t.reason)+'</div>':'')+
 (t.action_plan?'<div>Действие: '+esc(t.action_plan)+'</div>':'')+
 ((t.status==='open'||t.status==='working')?'<button class="p360-btn" data-p360-action="'+esc(t.id)+'">Зафиксировать результат</button>':'')+'</div>').join(''):'<div class="p360-muted">Открытых поручений по этой акции пока нет.</div>')+'</div>'+
 '<p class="p360-muted">Контрольные точки: 7-й и 14-й день, затем повторная проверка через 48 часов. Лера предлагает действия; цены, условия и бюджет изменяет только уполномоченный руководитель.</p></div>';
 return '<div class="p360-detail" id="p360-detail-panel"><div class="p360-detail-top"><div>'+
 '<h3 style="font-size:18px;margin:0">'+esc(p.title)+'</h3><div class="p360-muted">'+esc(p.client_name)+' · '+esc(p.manager_name)+
 ' · '+fmtDate(p.start_date)+'–'+fmtDate(p.end_date)+'</div></div>'+
 '<button class="p360-btn" data-p360-close>← К списку акций</button></div>'+
 '<div class="p360-detail-kpis">'+[
 ['План акции',money(p.sales_plan)],
 ['Факт 1С',p.confirmed_1c?money(p.verified_sales):'Нужно сверить'],
 ['Выполнение',p.confirmed_1c&&p.completion_pct!=null?num(p.completion_pct)+'%':'—'],
 ['Запрошен бюджет',money(p.requested_budget)],
 ['Прогноз по текущему темпу',forecast(p)==null?'Не рассчитан':money(forecast(p))]
 ].map(([k,v])=>'<div class="p360-mini"><span>'+k+'</span><b>'+esc(v)+'</b></div>').join('')+'</div>'+
 '<p class="p360-muted">Прогноз по текущему темпу отгрузок — сценарий, а не гарантированный результат. При неполных данных прогноз скрыт.</p><div class="p360-info">'+esc(p.sales_label||q.text)+
 (p.confirmed_1c?' · Источник: 1С по подтверждённому client_id и SKU.':' · До сверки расчёт предварительный.')+
 '</div>'+
 '<div class="p360-columns" style="margin-top:10px"><div class="p360-panel"><h3>📊 Продажи по месяцам</h3>'+formatMonths(p)+
 '<h4>Артикулы в акции · '+num(p.sku_count)+'</h4>'+
 (rows(p.items).length?rows(p.items).map(x=>'<div class="p360-brief-item"><b>'+esc(x.sku||'—')+'</b> · '+esc(x.product_name||'')+'</div>').join(''):'<div class="p360-muted">Точный каталог SKU нужно подтвердить.</div>')+
 '<h4>📷 Фотоотчёт · этапы акции</h4><div id="p360-photoarea"><span class="p360-muted">'+
 (state.photoError?esc(state.photoError):'Нажмите «Обновить фото» для загрузки превью')+'</span></div>'+
 '<button class="p360-btn" data-p360-photos>Обновить фото</button></div>'+actions+'</div>'+
 '<div class="p360-actions" style="justify-content:flex-end;margin-top:12px">'+
 '<button class="p360-btn strong" data-p360-operate="'+esc(p.id)+'">Согласование, документы и отчёт →</button></div></div>';
}
function draw(){
 const root=prepare();if(!root||state.showLegacy)return;
 if(state.enabled===false){legacy();return}
 const page=view();page?.classList.add('p360-active');root.hidden=false;
 const d=state.data;if(!d){root.innerHTML='<div class="p360-panel">Загружаю сводку акций с сервера…</div>';return}
 const selected=rows(d.rows).find(x=>x.id===state.selected);
 root.innerHTML='<div class="p360-top"><div><h2>🎯 Акции 360°</h2><div class="p360-muted">РЕСАНТА CRM · единый директорский обзор · данные на '+esc(d.as_of)+'</div></div>'+
 '<div class="p360-actions"><button class="p360-btn" data-p360-refresh>↻ Обновить</button><button class="p360-btn" data-p360-pending>На согласовании</button><button class="p360-btn" data-p360-budgets>Бюджеты</button>'+
 ((typeof promoIsBoss==='function'&&!promoIsBoss())||(typeof promoIsDF==='function'&&promoIsDF())?'<button class="p360-btn strong" data-p360-create>+ Новая акция</button>':'')+'</div></div>'+
 (state.error?'<div class="p360-error">'+esc(state.error)+'</div>':'')+
 '<div class="p360-grid">'+[
 ['Действуют',num(d.active),'Акций из CRM'],
 ['План',money(d.plan_total),'Заявленные планы'],
 ['Запрошенный бюджет',money(d.requested_budget_total),'Не факт затрат'],
 ['Сверены 1С',num(d.verified_count)+' / '+num(d.total),'Только точные данные'],
 ['Поручения Леры',num(d.action_count),'Открытые действия']
 ].map(([label,val,note])=>'<div class="p360-kpi"><small>'+label+'</small><strong>'+val+'</strong><span>'+note+'</span></div>').join('')+'</div>'+
 (selected?detail():briefing()+'<div class="p360-layout">'+graph()+confidenceChart()+'</div>'+cards());
 if(selected){if(rows(state.photos).length)renderPhotos();else if(!state.photoError){loadPhotos(selected.id)}}
}
function renderPhotos(){
 const host=el('p360-photoarea');if(!host)return;
 host.innerHTML='<div class="p360-photogrid">'+rows(state.photos).slice().sort((a,b)=>(stageOrder[a.stage]??9)-(stageOrder[b.stage]??9)).map(p=>
 '<button class="p360-photo" data-p360-photo="'+esc(p.id)+'"><img alt="'+esc(stageLabel[p.stage]||'Фото')+'" id="p360-photo-'+esc(p.id)+'">'+
 esc(stageLabel[p.stage]||'Фото')+'</button>').join('')+'</div>';
 for(const p of rows(state.photos)){
  client().storage.from('promotion-photos').createSignedUrl(p.storage_path,180).then(({data,error})=>{
   const img=el('p360-photo-'+p.id);if(img&&data?.signedUrl&&!error)img.src=data.signedUrl
  }).catch(()=>{});
 }
}
async function loadPhotos(id){
 const {data,error}=await client().from('promotion_photos').select('id,storage_path,stage,captured_at,approved').eq('promotion_id',id)
   .order('created_at',{ascending:false}).limit(24);
 if(state.selected!==id)return;
 if(error){state.photoError='Фото недоступны для вашей роли';return}
 state.photos=rows(data);if(el('p360-photoarea'))renderPhotos();
}
async function loadTasks(id){
 try{const result=await rpc('crm_promotion360_actions_v1',{p_promotion_id:id});
 if(state.selected!==id)return;state.tasks=rows(result);
 const panel=el('p360-detail-panel');if(panel)draw();
 }catch(e){console.warn('promo360 tasks',e)}
}
async function selectPromo(id){
 state.selected=id;state.photos=[];state.photoError='';state.tasks=[];
 draw();
 await Promise.allSettled([loadPhotos(id),loadTasks(id)]);
 el(rootId)?.scrollIntoView({behavior:'smooth',block:'start'});
}
async function refresh(){
 if(state.loading)return;
 state.loading=true;const root=prepare();if(!root)return;
 if(!state.loaded)root.innerHTML='<div class="p360-panel">Загружаю «Акции 360°»…</div>';
 try{
  const data=await rpc('crm_promotions360_overview_v1',{p_mode:state.mode});
  state.data=data;state.enabled=data?.enabled===true;state.loaded=true;state.error='';
  if(!state.enabled){legacy();return}
  draw()
 }catch(e){state.error='Не удалось обновить сводку акций: '+str(e.message||e);
  state.enabled=null;root.hidden=false;
  view()?.classList.add('p360-active');
  root.innerHTML='<div class="p360-error">'+esc(state.error)+'</div><button class="p360-btn" data-p360-refresh>Повторить</button> <button class="p360-btn" data-p360-legacy-recovery>Восстановить старый раздел</button>';
 }finally{state.loading=false}
}
function render(){
 if(state.showLegacy||state.enabled===false)return false;
 if(!state.loading)refresh();else if(state.loaded)draw();
 return true
}
async function photoViewer(id){
 const row=rows(state.photos).find(x=>x.id===id);if(!row)return;
 const signed=await client().storage.from('promotion-photos').createSignedUrl(row.storage_path,600);
 if(signed.error||!signed.data?.signedUrl)return alert('Нет доступа к оригиналу фото');
 el('p360-lightbox')?.remove();
 const box=document.createElement('div');box.id='p360-lightbox';box.className='p360-lightbox';
 box.innerHTML='<div class="toolbar">Фото акции · '+esc(row.stage||'')+' <div><button data-p360-zout>−</button> <button data-p360-zin>+</button> <button data-p360-lightclose>Закрыть ×</button></div></div><div class="stage" id="p360-stage"><img id="p360-original" alt="Фото акции, оригинал" draggable="false"></div>';
 document.body.appendChild(box);
 const img=el('p360-original');img.src=signed.data.signedUrl;
 let scale=1,x=0,y=0,point=null;
 const update=()=>img.style.transform='translate('+x+'px,'+y+'px) scale('+scale+')';
 const zoom=delta=>{scale=Math.max(1,Math.min(8,scale*delta));if(scale===1){x=0;y=0}update()};
 box.querySelector('[data-p360-zin]').onclick=()=>zoom(1.3);
 box.querySelector('[data-p360-zout]').onclick=()=>zoom(1/1.3);
 box.querySelector('[data-p360-lightclose]').onclick=()=>box.remove();
 const stage=el('p360-stage');
 stage.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?1.2:1/1.2)},{passive:false});
 stage.addEventListener('pointerdown',e=>{stage.setPointerCapture(e.pointerId);point={x:e.clientX,y:e.clientY}});
 stage.addEventListener('pointermove',e=>{if(!point||scale===1)return;x+=e.clientX-point.x;y+=e.clientY-point.y;point={x:e.clientX,y:e.clientY};update()});
 ['pointerup','pointercancel'].forEach(e=>stage.addEventListener(e,()=>point=null));
}
async function updateAction(id){
 const task=rows(state.tasks).find(x=>x.id===id);if(!task)return;
 el('p360-edit-shade')?.remove();
 const cover=document.createElement('div');cover.id='p360-edit-shade';cover.className='p360-edit-shade';
 cover.innerHTML='<form id="p360-edit-form" class="p360-edit" autocomplete="off">'+
 '<h3>✦ Лера · Результат поручения</h3>'+
 '<p class="p360-muted">Опиши реальную причину и конкретное действие. Лера вернётся к проверке через 48 часов.</p>'+
 '<label>Причина отклонения</label><select class="p360-field" id="p360-reason" required>'+
 ['','Нет товара в ТТ','Неверная цена','Продавцы не информированы','Нет выкладки','Нет заказа клиента','Нет подтверждённых данных 1С','Другая причина'].map(x=>'<option>'+esc(x||'Выберите причину')+'</option>').join('')+'</select>'+
 '<label>Что конкретно сделали или сделаете?</label>'+
 '<textarea id="p360-action-plan" class="p360-field" rows="4" placeholder="Например: согласовал заказ, срок и ответственного; запросил фото выкладки" required></textarea>'+
 '<label>Комментарий или доказательство</label>'+
 '<textarea id="p360-action-note" class="p360-field" rows="2" placeholder="Результат звонка, подтверждение клиента…"></textarea>'+
 '<div class="p360-actions" style="justify-content:flex-end"><button type="button" class="p360-btn" data-p360-edit-close>Отмена</button>'+
 '<button type="submit" class="p360-btn strong" id="p360-edit-submit">Сохранить и проверить через 48 ч</button></div>'+
 '<p class="p360-error" id="p360-edit-error" hidden></p></form>';
 document.body.appendChild(cover);
 const reasons=el('p360-reason');
 if(task.reason&&[...reasons.options].some(x=>x.value===task.reason))reasons.value=task.reason;
 el('p360-action-plan').value=task.action_plan||'';
 cover.addEventListener('click',e=>{if(e.target===cover||e.target.closest?.('[data-p360-edit-close]'))cover.remove()});
 el('p360-edit-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const reason=el('p360-reason').value,plan=el('p360-action-plan').value.trim(),note=el('p360-action-note').value.trim();
  if(reason==='Выберите причину'||plan.length<8){const err=el('p360-edit-error');err.hidden=false;err.textContent='Выберите причину и опишите конкретное действие.';return}
  const save=el('p360-edit-submit');save.disabled=true;save.textContent='Сохраняю…';
  try{await rpc('crm_promotion360_action_update_v1',{p_action_id:id,p_reason:reason,p_plan:plan,p_comment:note});
   cover.remove();await loadTasks(state.selected);alert('Действие сохранено. Повторная проверка через 48 часов.')}
  catch(err){const item=el('p360-edit-error');item.hidden=false;item.textContent=str(err.message||err)}
  finally{save.disabled=false;save.textContent='Сохранить и проверить через 48 ч'}
 });
}
document.addEventListener('click',e=>{
 const target=e.target.closest?.('[data-p360-detail]');if(target){selectPromo(target.dataset.p360Detail);return}
 if(e.target.closest?.('[data-p360-refresh]')){refresh();return}
 if(e.target.closest?.('[data-p360-legacy-recovery]')){legacy();return}
 if(e.target.closest?.('[data-p360-pending]')){state.mode='pending';state.selected=null;state.loaded=false;refresh();return}
 if(e.target.closest?.('[data-p360-create]')){if(typeof openPromotionEditor==='function')openPromotionEditor();else alert('Форма создания акции недоступна');return}
 if(e.target.closest?.('[data-p360-budgets]')){if(typeof goPage==='function')goPage('budgets','Бюджеты');return}
 const operate=e.target.closest?.('[data-p360-operate]');if(operate){if(typeof openPromotionDetail==='function')openPromotionDetail(operate.dataset.p360Operate);else alert('Карточка согласований недоступна');return}
 if(e.target.closest?.('[data-p360-back]')){restore();return}
 if(e.target.closest?.('[data-p360-close]')){state.selected=null;state.photos=[];state.tasks=[];draw();return}
 if(e.target.closest?.('[data-p360-photos]')){loadPhotos(state.selected);return}
 const photo=e.target.closest?.('[data-p360-photo]');if(photo){photoViewer(photo.dataset.p360Photo);return}
 const task=e.target.closest?.('[data-p360-action]');if(task){updateAction(task.dataset.p360Action);return}
 if(e.target.closest?.('[data-p360-lightclose]'))el('p360-lightbox')?.remove();
});
document.addEventListener('change',e=>{
 if(e.target.id==='p360-mode'){state.mode=e.target.value;state.loaded=false;state.manager='all';state.selected=null;refresh()}
 if(e.target.id==='p360-manager'){state.manager=e.target.value;draw()}
});
document.addEventListener('input',e=>{if(e.target.id==='p360-search'){
 const cursor=e.target.selectionStart;state.search=e.target.value;
 // Rebuild cards, preserve search focus and selection without rewriting full dashboard.
 const holder=el('p360-search');
 if(holder){const start=holder.selectionStart;const cardsContainer=document.querySelector('#promotions360-root .p360-cards');
 if(cardsContainer){const template=cards();const div=document.createElement('div');div.innerHTML=template;
 cardsContainer.innerHTML=div.querySelector('.p360-cards')?.innerHTML||'';}
 holder.focus();holder.setSelectionRange(start,start)} }
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')el('p360-lightbox')?.remove()});
window.RESANTA_PROMOTIONS360_V1=Object.freeze({render,refresh,legacy,restore,version:'promotions360-uniai-v1',get enabled(){return state.enabled},get showLegacy(){return state.showLegacy}});
})();
