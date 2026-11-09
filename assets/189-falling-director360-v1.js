/* RESANTA CRM · Falling clients / Recovery 360 · director UI v1
 * Read-only view on top of the established v20/v22716 falling-client engine.
 * Neither overwrites imported sales nor creates/updates tasks or visits.
 * Existing AI task approval, recovery notes, Excel, and route checks stay authoritative.
 */
(function(w,d){
'use strict';
if(w.RESANTA_FALLING360_V1)return;
const ID='falling360-root',CSS='falling360-style-v1',PAGE='page-falling';
const $=id=>d.getElementById(id);
const n=v=>Number(v)||0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>n(v).toLocaleString('ru-RU',{maximumFractionDigits:2,minimumFractionDigits:2});
const short=v=>Math.abs(n(v))>=1000000?(n(v)/1000000).toFixed(2).replace('.',',')+' млн':Math.abs(n(v))>=1000?(n(v)/1000).toFixed(1).replace('.',',')+' тыс.':fmt(v);
const norm=v=>String(v||'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/gi,' ').trim();
const ymd=v=>String(v||'').slice(0,7);
const monthName=v=>{try{return new Intl.DateTimeFormat('ru-RU',{month:'short',year:'2-digit'}).format(new Date(v+'-01T12:00:00'))}catch(_){return v}};
const shift=(v,delta)=>{const a=String(v||'').split('-').map(Number);if(a.length!==2||!a[0]||!a[1])return v;const d=new Date(Date.UTC(a[0],a[1]-1+delta,1));return d.toISOString().slice(0,7)};
const fromYear=v=>String(Number(v.slice(0,4))-1)+v.slice(4);
const money=v=>fmt(v)+' BYN';
const isBoss=()=>{try{return currentProfile?.role==='boss'}catch(_){return false}};
const asArray=v=>Array.isArray(v)?v:[];
let wrapped=false,root=null,legacyOpen=false,segment='all',showMore=false,focus='',rendering=false;
let lastPaintKey='',lastList=null;
let chartCache={source:null,length:0,rowsKey:'',end:'',data:null};
function sourceRows(){try{return Array.isArray(v20FallingRows)?v20FallingRows:[]}catch(_){return[]}}
function taskRows(){try{return asArray(allTasks)}catch(_){return[]}}
function salesRows(){try{return asArray(allPurchaseHistory)}catch(_){return[]}}
function period(){try{return typeof v20FallingPeriod==='function'?v20FallingPeriod():null}catch(_){return null}}
function isRecoveryTask(t){return String(t?.source||'')==='falling_ai'||/\[ПАДЕНИЕ ПРОДАЖ\]|восстановить продажи клиента/i.test(String(t?.text||''))}
function taskOpen(t){return !!t&&!t.done&&!['rejected','cancelled'].includes(String(t.review_status||''))}
function recoveryTask(row,all){
 const ids=row.entity?.ids||new Set([String(row.client?.id||'')]);
 const client=row.client||{},target=norm(client.name);
 return all.find(t=>{
  if(!taskOpen(t)||!isRecoveryTask(t))return false;
  if(t.client_id&&ids.has(String(t.client_id)))return true;
  return !t.client_id&&!!target&&norm(t.client_name)===target&&
   (!t.manager_name||!client.manager_name||norm(t.manager_name)===norm(client.manager_name));
 })||null;
}
function clientData(rows){
 const tasks=taskRows();
 return rows.map(x=>({
  ...x,
  recoveryTask:recoveryTask(x,tasks),
  relatedTask:!!x.task
 }));
}
function visible(rows){
 const sev=$('falling-severity')?.value||'all',search=norm($('falling-search')?.value||'');
 return rows.filter(x=>(sev==='all'||x.severity===sev)&&(!search||norm((x.client?.name||'')+' '+(x.client?.region||'')+' '+(x.client?.manager_name||'')).includes(search)));
}
function filtered(rows){
 if(segment==='critical')return rows.filter(x=>x.severity==='critical');
 if(segment==='no-recovery')return rows.filter(x=>!x.recoveryTask);
 if(segment==='with-recovery')return rows.filter(x=>!!x.recoveryTask);
 return rows;
}
function groupManagers(rows){
 const m=new Map();
 for(const x of rows){
  const k=x.client?.manager_name||'Без менеджера';
  let s=m.get(k);if(!s){s={name:k,count:0,loss:0,without:0};m.set(k,s)}
  s.count++;s.loss+=n(x.loss);if(!x.recoveryTask)s.without++;
 }
 return [...m.values()].sort((a,b)=>b.loss-a.loss);
}
function monthsFor(end){
 if(!/^\d{4}-\d{2}$/.test(end))return[];
 let start=end>='2026-08'?'2026-08':shift(end,-5),out=[];
 while(start<=end&&out.length<9){out.push(start);start=shift(start,1)}
 return out;
}
function trendFor(rows,end){
 const data=salesRows(),key=rows.map(r=>String(r.entity?.key||r.client?.id||'')).sort().join('|');
 if(chartCache.source===data&&chartCache.length===data.length&&chartCache.rowsKey===key&&chartCache.end===end&&chartCache.data)return chartCache.data;
 const months=monthsFor(end),set=new Set([...months,...months.map(fromYear)]);
 const map=new Map(months.map(m=>[m,{month:m,now:0,prev:0,nowRows:0,prevRows:0}]));
 if(data.length){
  for(const x of rows){
   let hist=[];
   try{hist=typeof w.v22716FallingHist==='function'?asArray(w.v22716FallingHist(x.client)):[]}catch(_){}
   for(const r of hist){
    const ym=ymd(r.month),keyMonth=map.has(ym)?ym:months.find(m=>fromYear(m)===ym);
    if(!keyMonth||!set.has(ym))continue;
    const cell=map.get(keyMonth),value=n(r.revenue);
    if(ym===keyMonth){cell.now+=value;cell.nowRows++}else{cell.prev+=value;cell.prevRows++}
   }
  }
 }
 const result=[...map.values()];
 chartCache={source:data,length:data.length,rowsKey:key,end,data:result};
 return result;
}
function status(row){
 if(row.recoveryTask)return{label:'Возврат в работе',kind:'work'};
 if(row.relatedTask)return{label:'Есть другая задача',kind:'other'};
 return{label:'Нет задачи возврата',kind:'gap'};
}
function allowedManager(value){
 const select=$('falling-manager');return !!select&&[...select.options].some(o=>o.value===value&&!o.disabled);
}
function openClient(id){if(typeof w.openClient==='function')w.openClient(id)}
function openABC(id){if(typeof w.openABCForClient==='function')w.openABCForClient(id)}
function openAI(id){
 if(typeof w.v2274OpenFallingAi==='function')w.v2274OpenFallingAi(id);
 else alert('Механизм согласования ИИ-задач недоступен.');
}
function mount(){
 const page=$(PAGE),pivot=$('falling-kpi'),list=$('falling-list');
 if(!page||!pivot||!list)return null;
 root=$(ID);
 if(!root){
  if(!$(CSS)){const style=d.createElement('style');style.id=CSS;style.textContent=styles;d.head.appendChild(style)}
  root=d.createElement('section');root.id=ID;root.setAttribute('aria-label','Возврат продаж 360°');
  pivot.parentElement.insertBefore(root,pivot);
  root.addEventListener('click',onClick);
 }
 return root;
}
function makeCard(label,value,subtitle,tone,filterMode){
 return '<button type="button" class="f360-kpi'+(segment===filterMode?' selected':'')+'"'+(filterMode?' data-f360-filter="'+filterMode+'"':'')+'>'+
  '<span>'+esc(label)+'</span><strong'+(tone?' class="'+tone+'"':'')+'>'+esc(value)+'</strong><small>'+esc(subtitle)+'</small></button>';
}
function trendChart(items){
 if(!items.length)return'<p class="f360-muted">Помесячная история не загружена.</p>';
 const max=Math.max(1,...items.flatMap(x=>[Math.max(x.now,0),Math.max(x.prev,0)]));
 const currentMonth=(typeof TODAY!=='undefined'?String(TODAY).slice(0,7):new Date().toISOString().slice(0,7));
 return '<div class="f360-bars" role="img" aria-label="Продажи клиентов в динамике: текущий и аналогичный год">'+items.map(x=>{
  const unfinished=x.month>=currentMonth;
  const currPct=Math.max(0,Math.min(100,x.now/max*100));
  const prevPct=Math.max(0,Math.min(100,x.prev/max*100));
  const hint=unfinished?' · неполный месяц':'';
  const empty=!x.nowRows&&!x.prevRows;
  return '<div class="f360-chartrow"><span class="f360-month">'+esc(monthName(x.month))+(unfinished?'*':'')+'</span>'+
   '<div class="f360-duobars"><div class="f360-bar previous" style="width:'+prevPct.toFixed(1)+'%"></div><div class="f360-bar current" style="width:'+currPct.toFixed(1)+'%"></div></div>'+
   '<div class="f360-chartvalue">'+(empty?'нет данных':esc(short(x.now))+' / '+esc(short(x.prev)))+(!empty&&unfinished?'<small>неполный</small>':'')+'</div></div>';
 }).join('')+'</div><div class="f360-legend"><span><i class="f360-swatch current"></i>2026 / выбранный год</span><span><i class="f360-swatch previous"></i>Аналог прошлого года</span></div>';
}
function managerBars(groups){
 if(!groups.length)return'<p class="f360-muted">Нет менеджеров в выбранной выборке.</p>';
 const top=Math.max(1,...groups.map(g=>g.loss));
 return groups.slice(0,8).map(g=>
  '<div class="f360-managerline"><button type="button" data-f360-manager="'+esc(g.name)+'"'+(!allowedManager(g.name)?' disabled title="Недоступен в текущем фильтре CRM"':'')+'>'+esc(g.name)+'</button>'+
  '<span class="f360-managertrack"><i style="width:'+Math.min(100,g.loss/top*100).toFixed(1)+'%"></i></span>'+
  '<span><b>'+esc(short(g.loss))+'</b><small>'+g.count+' клиентов</small></span></div>'
 ).join('');
}
function questionsFor(x){
 const top=asArray(x.breakdown?.cats)[0],items=asArray(x.breakdown?.items);
 const q=[
  'Почему снизились закупки'+(top?' группы «'+top.name+'»':'')+'? Подтверждена ли причина у ЛПР?',
  'Есть ли потребность в потерянных SKU класса A/B и доступный остаток на складе Витебск?',
  'Влияют ли цены, конкуренты, сезонность или ПДЗ? Подтвердить источником.',
  'Какое следующее действие и какую сумму заказа реально согласовал клиент?'
 ];
 if(!items.length)q[1]='В истории нет детализации товарного падения — проверить продажи и товарные группы перед рекомендацией.';
 return q;
}
function focusDetails(x,end){
 if(!x)return'';
 const cats=asArray(x.breakdown?.cats).slice(0,4),items=asArray(x.breakdown?.items).slice(0,4);
 const st=status(x),qs=questionsFor(x);
 const monthTrend=trendFor([x],end);
 return '<div class="f360-detail" id="f360-client-detail">'+
  '<div class="f360-detail-head"><div><b>'+esc(x.client?.name||'Клиент')+'</b><div class="f360-muted">'+esc(x.client?.manager_name||'—')+' · '+esc(x.client?.region||'—')+'</div></div>'+
  '<button class="f360-quiet" type="button" data-f360-close>Свернуть ×</button></div>'+
  '<div class="f360-detail-kpis"><div><span>Было год назад</span><b>'+esc(money(x.prev))+'</b></div><div><span>Текущий период</span><b>'+esc(money(x.cur))+'</b></div><div><span>Снижение</span><b class="f360-red">−'+esc(money(x.loss))+'</b></div></div>'+
  '<div class="f360-dual"><div><h4>Потерянные группы</h4>'+(cats.length?cats.map(g=>'<div class="f360-minirow"><span>'+esc(g.name)+'</span><b>−'+esc(short(g.loss))+'</b></div>').join(''):'<p class="f360-muted">Нет подтверждённой детализации</p>')+
  '<h4>Товары с потерей</h4>'+(items.length?items.map(it=>'<div class="f360-minirow"><span>'+esc(it.label||it.group)+'</span><b>−'+esc(short(it.loss))+'</b></div>').join(''):'<p class="f360-muted">Нет подтверждённых SKU</p>')+'</div>'+
  '<div><h4>ИИ · Мозговой штурм</h4><p class="f360-muted">Это вопросы и гипотезы для проверки, не установленные причины.</p>'+
  qs.map((q,i)=>'<div class="f360-question"><span>'+(i+1)+'.</span><span>'+esc(q)+'</span></div>').join('')+
  '<div class="f360-detailtrend"><h4>Продажи клиента по месяцам</h4>'+trendChart(monthTrend)+'</div></div></div>'+
  '<div class="f360-buttons"><button type="button" class="f360-btn" data-f360-client="'+esc(x.client?.id||'')+'">Открыть клиента</button>'+
  '<button type="button" class="f360-btn" data-f360-abc="'+esc(x.client?.id||'')+'">ABC клиента</button>'+
  (isBoss()?'<button type="button" class="f360-btn primary" data-f360-ai="'+esc(x.client?.id||'')+'">Сформировать ИИ-задачу</button>':'')+'</div>'+
  '<p class="f360-muted">'+esc(st.label)+'. Согласование задачи, комментарий руководителя, проверка маршрута и запрет дублей выполняются действующим механизмом CRM.</p></div>';
}
function clientsTable(rows,end){
 const ordered=[...rows].sort((a,b)=>n(b.loss)-n(a.loss));
 const shown=showMore?ordered:ordered.slice(0,7);
 if(!shown.length)return'<p class="f360-muted">Для выбранных условий клиентов нет.</p>';
 return '<div class="f360-clientlist">'+shown.map((x,i)=>{
  const st=status(x),selected=focus===String(x.client?.id||'');
  return '<div class="f360-clientrow'+(selected?' active':'')+'"><div class="f360-rank">'+(i+1)+'</div>'+
   '<div class="f360-clientlabel"><b>'+esc(x.client?.name||'—')+'</b><small>'+esc(x.client?.manager_name||'—')+' · '+esc(st.label)+'</small></div>'+
   '<div class="f360-loss"><strong>−'+esc(short(x.loss))+'</strong><small>−'+n(x.pct).toFixed(1)+'%</small></div>'+
   '<button type="button" class="f360-quiet" data-f360-focus="'+esc(x.client?.id||'')+'">'+(selected?'Скрыть':'Разобрать')+'</button></div>'+
   (selected?focusDetails(x,end):'');
 }).join('')+'</div>'+(!showMore&&ordered.length>shown.length?'<button class="f360-btn" data-f360-more type="button">Показать остальных ('+(ordered.length-shown.length)+')</button>':'');
}
function brief(rows,filteredRows){
 const critical=rows.filter(x=>x.severity==='critical');
 const noRecovery=rows.filter(x=>!x.recoveryTask);
 const unlinked=rows.filter(x=>x.relatedTask&&!x.recoveryTask);
 const largest=[...rows].sort((a,b)=>n(b.loss)-n(a.loss))[0];
 return '<div class="f360-brief"><div class="f360-sectiontitle"><span>✦ ИИ · Утренний директорский брифинг</span><small>Проверяемые сигналы по 1С и CRM</small></div>'+
 '<div class="f360-briefitem"><b>1. Приоритет возврата</b><p>'+critical.length+' критических клиентов;'+(largest?' наибольшее снижение у «'+esc(largest.client?.name||'')+'» — '+esc(money(largest.loss))+'.':' оцените размер потерь.')+'</p></div>'+
 '<div class="f360-briefitem"><b>2. Контроль поручений</b><p>'+noRecovery.length+' клиентов без подтверждённой активной задачи именно по возврату продаж.'+(unlinked.length?' У '+unlinked.length+' есть задачи другого типа — это не план восстановления.':'')+'</p></div>'+
 '<div class="f360-briefitem"><b>3. Что проверить менеджерам</b><p>Потерянные товарные группы A/B, доступность на складе Витебск, последнюю работу с ЛПР, ПДЗ и будущий согласованный маршрут. Причины не назначаются автоматически.</p></div>'+
 '<div class="f360-footnote">Брифинг сформирован правилами на подтверждённых данных CRM. ИИ-задачи создаются отдельно и только после согласования руководителем.</div></div>';
}
function render(){
 const container=mount();if(!container||rendering)return false;
 rendering=true;
 try{
  const all=clientData(sourceRows()),rows=visible(all),subset=filtered(rows),p=period()||{start:'',end:'',label:'—',previousLabel:'—'},end=p.end||'';
  const managers=groupManagers(rows),loss=rows.reduce((a,x)=>a+n(x.loss),0),critical=rows.filter(x=>x.severity==='critical').length;
  const without=rows.filter(x=>!x.recoveryTask).length,working=rows.filter(x=>!!x.recoveryTask).length;
  if(focus&&!rows.some(x=>String(x.client?.id||'')===focus))focus='';
  const trend=trendFor(rows,end),totalRows=sourceRows().length;
  const currentMonth=(typeof TODAY!=='undefined'?String(TODAY).slice(0,7):new Date().toISOString().slice(0,7));
  const partial=p.current?.includes(currentMonth) || p.end===currentMonth;
  const note=partial?'<span class="f360-pill warn">Текущий месяц неполный — не сравнивайте с полным прошлым</span>':'<span class="f360-pill">Сопоставимые календарные периоды</span>';
  container.innerHTML=
   '<div class="f360-head"><div><h2>Клиенты · Возврат продаж 360°</h2><div class="f360-muted">Директорский контроль · Юрлица и торговые точки · Продажи 1С с НДС</div></div>'+
   '<span class="f360-pill">По доступным данным CRM</span></div>'+
   '<div class="f360-period">Сравнение <b>'+esc(p.label||'—')+'</b> / <b>'+esc(p.previousLabel||'—')+'</b> '+note+'</div>'+
   '<div class="f360-kpis">'+makeCard('Падающие клиенты',String(rows.length),'Крупные и небольшие потери','','all')+
    makeCard('Снижение оборота',short(loss)+' BYN','Факт к аналогу прошлого года','f360-red','all')+
    makeCard('Критично',String(critical),'Падение от 30%','f360-red','critical')+
    makeCard('Без задачи возврата',String(without),'Проверить план действий','f360-amber','no-recovery')+
    makeCard('В работе по возврату',String(working),'Профильные задачи в CRM','f360-green','with-recovery')+'</div>'+
   '<div class="f360-topgrid">'+brief(rows,subset)+
   '<div class="f360-panel"><div class="f360-sectiontitle"><span>Динамика по месяцам</span><small>Текущие падающие юрлица</small></div>'+
   trendChart(trend)+'<div class="f360-footnote">Сравнение по одним и тем же клиентам. Показаны подтверждённые продажи текущего и прошлого года, а не прогноз возвращённой выручки.</div></div></div>'+
   '<div class="f360-bottomgrid"><div class="f360-panel"><div class="f360-sectiontitle"><span>Приоритетные клиенты</span><small>'+subset.length+' в выбранном списке</small></div>'+
   '<div class="f360-filterchips">'+[['all','Все'],['critical','Критические'],['no-recovery','Без задачи возврата'],['with-recovery','В работе']].map(([k,t])=>'<button class="f360-chip'+(segment===k?' active':'')+'" type="button" data-f360-filter="'+k+'">'+t+'</button>').join('')+'</div>'+
   clientsTable(subset,end)+'</div>'+
   '<div class="f360-panel"><div class="f360-sectiontitle"><span>Ответственность менеджеров</span><small>По текущему периоду</small></div>'+
   managerBars(managers)+'<div class="f360-footnote">Потери считаются по текущему фильтру. Нажатие на имя использует штатный фильтр менеджеров CRM.</div>'+
   '<div class="f360-safety"><b>Контроль возврата</b><p>Клиент, вышедший из списка падения, ещё не считается подтверждённо восстановленным. Для результата нужна проверка фактических отгрузок 1С и закрытие задачи.</p></div></div></div>'+
   '<div class="f360-footer"><span class="f360-muted">Источники: 1С, карточки юрлиц, действующие задачи и маршруты CRM. Без демонстрационных значений.</span>'+
   '<button type="button" class="f360-btn" data-f360-legacy aria-expanded="'+String(legacyOpen)+'">'+(legacyOpen?'Скрыть старые карточки':'Раскрыть прежние карточки и комментарии')+'</button></div>';
  const page=$(PAGE);
  page.classList.add('f360-installed');
  page.classList.toggle('f360-legacy-open',legacyOpen);
  lastPaintKey=[p.start,p.end,rows.length,totalRows,segment].join('|');lastList=rows;
  return true;
 }catch(e){console.warn('Falling360 view failed; existing cards retained',e);$(PAGE)?.classList.remove('f360-installed');return false}
 finally{rendering=false}
}
function onClick(event){
 const node=event.target.closest?.('button');if(!node)return;
 if(node.hasAttribute('data-f360-filter')){
  const next=node.getAttribute('data-f360-filter');if(['all','critical','no-recovery','with-recovery'].includes(next)){segment=next;showMore=false;focus='';render();}return;
 }
 if(node.hasAttribute('data-f360-manager')){
  const value=node.getAttribute('data-f360-manager'),select=$('falling-manager');
  if(!isBoss()||!allowedManager(value)||!select)return;
  select.value=value;segment='all';showMore=false;focus='';
  if(typeof w.renderFallingClients==='function')w.renderFallingClients();return;
 }
 if(node.hasAttribute('data-f360-focus')){
  const id=node.getAttribute('data-f360-focus');focus=focus===id?'':id;render();return;
 }
 if(node.hasAttribute('data-f360-close')){focus='';render();return}
 if(node.hasAttribute('data-f360-more')){showMore=true;render();return}
 if(node.hasAttribute('data-f360-client')){openClient(node.getAttribute('data-f360-client'));return}
 if(node.hasAttribute('data-f360-abc')){openABC(node.getAttribute('data-f360-abc'));return}
 if(node.hasAttribute('data-f360-ai')&&isBoss()){openAI(node.getAttribute('data-f360-ai'));return}
 if(node.hasAttribute('data-f360-legacy')){legacyOpen=!legacyOpen;$(PAGE)?.classList.toggle('f360-legacy-open',legacyOpen);node.setAttribute('aria-expanded',String(legacyOpen));node.textContent=legacyOpen?'Скрыть старые карточки':'Раскрыть прежние карточки и комментарии';}
}
function install(){
 if(wrapped)return true;
 const base=w.renderFallingClients;
 if(typeof base!=='function')return false;
 w.renderFallingClients=function(){
  const out=base.apply(this,arguments);
  try{render()}catch(e){console.warn('Falling360 remains optional',e)}
  return out;
 };
 wrapped=true;
 if($(PAGE)?.classList.contains('active'))render();
 return true;
}
const styles=[
'#'+ID+'{display:grid;gap:14px;margin:0 0 16px;color:var(--text);font-size:13px}',
'#'+ID+' *,#'+ID+' *:before,#'+ID+' *:after{box-sizing:border-box}',
'#'+ID+' .f360-head{display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap}',
'#'+ID+' h2{font-size:23px;letter-spacing:-.6px;font-weight:840;line-height:1.2;margin:0 0 5px}',
'#'+ID+' .f360-muted{font-size:11px;color:var(--sub);line-height:1.5}',
'#'+ID+' .f360-period{display:flex;align-items:center;flex-wrap:wrap;gap:7px;font-size:12px;color:var(--sub)}',
'#'+ID+' .f360-period b{color:var(--text)}',
'#'+ID+' .f360-pill{border:1px solid var(--border);border-radius:100px;padding:6px 10px;background:var(--card);font-size:11px;color:var(--sub)}',
'#'+ID+' .f360-pill.warn{background:var(--amb,#fffbeb);border-color:#fcd34d;color:var(--am,#92400e)}',
'#'+ID+' .f360-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}',
'#'+ID+' .f360-kpi{display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:left;min-width:0;background:var(--card);color:var(--text);border:1px solid var(--border);border-radius:12px;padding:14px;cursor:pointer}',
'#'+ID+' .f360-kpi.selected{border-color:var(--a);background:var(--ab)}',
'#'+ID+' .f360-kpi>span{font-size:11px;color:var(--sub)}',
'#'+ID+' .f360-kpi strong{font-size:25px;line-height:1.25;letter-spacing:-.4px;overflow-wrap:anywhere;font-weight:820}',
'#'+ID+' .f360-kpi small{font-size:10px;color:var(--sub);line-height:1.4}',
'#'+ID+' .f360-red{color:var(--r)}',
'#'+ID+' .f360-green{color:var(--g)}',
'#'+ID+' .f360-amber{color:var(--w,#b45309)}',
'#'+ID+' .f360-panel,#'+ID+' .f360-brief{padding:15px;border:1px solid var(--border);border-radius:13px;background:var(--card);min-width:0}',
'#'+ID+' .f360-topgrid,#'+ID+' .f360-bottomgrid{display:grid;grid-template-columns:1.1fr 1fr;gap:12px}',
'#'+ID+' .f360-bottomgrid{grid-template-columns:1.35fr 1fr}',
'#'+ID+' .f360-sectiontitle{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;font-weight:790;font-size:14px;margin:0 0 11px}',
'#'+ID+' .f360-sectiontitle small{font-size:10px;font-weight:500;color:var(--sub)}',
'#'+ID+' .f360-brief{background:linear-gradient(120deg,var(--card),var(--ab,#eff6ff))}',
'#'+ID+' .f360-briefitem{padding:9px 0;border-top:1px solid var(--border)}',
'#'+ID+' .f360-briefitem b{font-size:12px}',
'#'+ID+' .f360-briefitem p{font-size:12px;margin:5px 0 0;line-height:1.55}',
'#'+ID+' .f360-footnote{font-size:10px;line-height:1.5;color:var(--sub);margin-top:11px}',
'#'+ID+' .f360-bars{display:grid;gap:11px}',
'#'+ID+' .f360-chartrow{display:grid;grid-template-columns:66px minmax(70px,1fr) 108px;align-items:center;gap:10px}',
'#'+ID+' .f360-month{font-size:11px;font-weight:650}',
'#'+ID+' .f360-duobars{min-height:23px;display:grid;align-content:center;gap:3px}',
'#'+ID+' .f360-bar{height:9px;border-radius:3px;min-width:0}',
'#'+ID+' .f360-bar.current{background:var(--a,#2563eb)}',
'#'+ID+' .f360-bar.previous{background:#b1b7c8}',
'#'+ID+' .f360-chartvalue{font-size:10px;text-align:right;font-weight:650}',
'#'+ID+' .f360-chartvalue small{display:block;font-weight:500;color:var(--sub)}',
'#'+ID+' .f360-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:10px;margin-top:12px;color:var(--sub)}',
'#'+ID+' .f360-legend span{display:flex;align-items:center;gap:5px}',
'#'+ID+' .f360-swatch{display:inline-block;width:10px;height:10px;border-radius:2px}',
'#'+ID+' .f360-swatch.current{background:var(--a,#2563eb)}',
'#'+ID+' .f360-swatch.previous{background:#b1b7c8}',
'#'+ID+' .f360-filterchips,.f360-buttons{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}',
'#'+ID+' .f360-chip,#'+ID+' .f360-btn,#'+ID+' .f360-quiet{border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);font-size:11px;font-weight:660;padding:8px 10px;cursor:pointer}',
'#'+ID+' .f360-chip.active{border-color:var(--a);background:var(--ab);color:var(--at)}',
'#'+ID+' .f360-btn.primary{background:var(--a);color:#fff;border-color:var(--a)}',
'#'+ID+' button:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}',
'#'+ID+' .f360-clientrow{display:grid;grid-template-columns:28px minmax(100px,1fr) 95px 70px;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)}',
'#'+ID+' .f360-clientrow.active{background:var(--ab);padding-left:7px;padding-right:7px;border-radius:8px}',
'#'+ID+' .f360-rank{color:var(--sub);font-weight:700;font-size:11px;text-align:center}',
'#'+ID+' .f360-clientlabel b{display:block;font-size:12px;overflow-wrap:anywhere}',
'#'+ID+' .f360-clientlabel small{font-size:10px;color:var(--sub);line-height:1.4}',
'#'+ID+' .f360-loss{text-align:right}',
'#'+ID+' .f360-loss strong{display:block;color:var(--r);font-size:12px}',
'#'+ID+' .f360-loss small{display:block;color:var(--sub);font-size:10px}',
'#'+ID+' .f360-quiet{font-size:10px;padding:6px 8px}',
'#'+ID+' .f360-managerline{display:grid;grid-template-columns:105px minmax(60px,1fr) 85px;align-items:center;gap:8px;padding:10px 0;border-bottom:1px solid var(--border)}',
'#'+ID+' .f360-managerline button{font-size:11px;font-weight:650;text-align:left;cursor:pointer;color:var(--text);background:none;border:0;padding:0}',
'#'+ID+' .f360-managerline button:disabled{color:var(--sub);cursor:default}',
'#'+ID+' .f360-managertrack{height:10px;background:var(--bg);border-radius:4px;overflow:hidden}',
'#'+ID+' .f360-managertrack i{height:100%;background:var(--a);display:block;border-radius:4px}',
'#'+ID+' .f360-managerline>span:last-child{text-align:right;font-size:11px}',
'#'+ID+' .f360-managerline>span:last-child small{display:block;color:var(--sub);font-size:9px}',
'#'+ID+' .f360-safety{margin-top:16px;padding:12px;border-radius:9px;border:1px solid var(--border);background:var(--bg)}',
'#'+ID+' .f360-safety b{font-size:12px}',
'#'+ID+' .f360-safety p{font-size:11px;line-height:1.5;color:var(--sub);margin:5px 0 0}',
'#'+ID+' .f360-detail{padding:15px;border:1px solid var(--a);border-radius:9px;margin:11px 0;background:var(--card)}',
'#'+ID+' .f360-detail-head{display:flex;align-items:center;justify-content:space-between;gap:10px}',
'#'+ID+' .f360-detail-head b{font-size:15px}',
'#'+ID+' .f360-detail-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:10px 0}',
'#'+ID+' .f360-detail-kpis>div{padding:10px;background:var(--bg);border-radius:7px}',
'#'+ID+' .f360-detail-kpis span{display:block;color:var(--sub);font-size:10px}',
'#'+ID+' .f360-detail-kpis b{font-size:13px;overflow-wrap:anywhere}',
'#'+ID+' .f360-dual{display:grid;grid-template-columns:1fr 1fr;gap:13px}',
'#'+ID+' .f360-dual h4{font-size:12px;margin:12px 0 7px}',
'#'+ID+' .f360-minirow{display:flex;gap:10px;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:11px}',
'#'+ID+' .f360-minirow span{overflow-wrap:anywhere}',
'#'+ID+' .f360-minirow b{white-space:nowrap;color:var(--r)}',
'#'+ID+' .f360-question{display:flex;gap:7px;font-size:11px;padding:7px 0;border-bottom:1px solid var(--border)}',
'#'+ID+' .f360-question>span:first-child{font-weight:800;color:var(--a)}',
'#'+ID+' .f360-detailtrend{margin-top:10px}',
'#'+ID+' .f360-footer{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}',
'#page-falling.f360-installed #falling-kpi,#page-falling.f360-installed #falling-period-note{display:none}',
'#page-falling.f360-installed #falling-list{display:none}',
'#page-falling.f360-installed.f360-legacy-open #falling-list{display:block}',
'@media(max-width:1100px){#'+ID+' .f360-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}#'+ID+' .f360-topgrid,#'+ID+' .f360-bottomgrid{grid-template-columns:1fr}}',
'@media(max-width:650px){#'+ID+' .f360-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}#'+ID+' h2{font-size:19px}#'+ID+' .f360-chartrow{grid-template-columns:58px minmax(65px,1fr) 86px;gap:5px}#'+ID+' .f360-clientrow{grid-template-columns:19px minmax(90px,1fr) 68px;gap:5px}#'+ID+' .f360-clientrow .f360-quiet{grid-column:2 / 4;justify-self:start}#'+ID+' .f360-dual,#'+ID+' .f360-detail-kpis{grid-template-columns:1fr}}'
].join('\n');
w.RESANTA_FALLING360_V1=Object.freeze({version:'20261109.1',readOnly:true,usesLegacyFallingEngine:true,isRecoveryTask,monthsFor,taskOpen});
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})(window,document);
