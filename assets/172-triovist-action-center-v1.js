/* Triovist Uni X · read-only action center / evidence-first daily briefing.
 * Reuses authoritative work modules; never mutates CRM or starts a parser.
 */
(function(w){
'use strict';
if(w.RESANTA_TRIOVIST_ACTION_CENTER_V1)return;
const V='2026.11.04.1',ID='tr14-action-center',CSS='tr14-action-center-css';
const SECTIONS={home:'Утренние приоритеты',groups:'Группы и категории',stock:'Остатки и заказ',tasks:'Задачи ИИ',cards:'Карточки 21vek',parser:'Наш листинг 21vek',competitors:'Конкуренты 21vek',sales:'Детализация продаж'};
const s={ctx:null,tab:'home',seq:0,own:null,ownKey:'',cards:null,cardsKey:'',showAll:false,flightOwn:null,flightCards:null};
const E=x=>String(x==null?'':x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const N=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const norm=x=>String(x||'').trim().toLowerCase();
const fmt=x=>N(x)===null?'—':N(x).toLocaleString('ru-RU',{maximumFractionDigits:1});
const money=x=>N(x)===null?'—':N(x).toLocaleString('ru-RU',{maximumFractionDigits:2})+' BYN';
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const curMonth=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit'}).format(new Date());
const age=x=>{const t=Date.parse(String(x||''));return Number.isFinite(t)?Math.max(0,Math.floor((Date.now()-t)/86400000)):null};
const isTri=()=>!!document.getElementById('page-triovist')?.classList.contains('active');
const authorized=c=>!!(c&&(c.is_leader===true||c.is_manager===true)&&c.email);
const myEmail=()=>norm(s.ctx?.email);
const manager=()=>s.ctx?.is_manager===true;
function api(){try{return typeof db!=='undefined'?db:w.db}catch(_){return w.db}}
async function rpc(name,args){const d=api();if(!d?.rpc)throw Error('Нет подключения к данным Triovist');const r=await d.rpc(name,args||{});if(r?.error)throw r.error;return r?.data||{}}
function style(){
 if(document.getElementById(CSS))return;
 const el=document.createElement('style');el.id=CSS;el.textContent=
 '#'+ID+'{display:none;background:#f8fbff;border:1px solid #d2e3fa;border-radius:15px;padding:14px;margin:12px 0;color:#1e354f;font-size:12px;box-shadow:0 4px 16px #16395e0a}'+
 '#'+ID+'[data-open="true"]{display:block}#'+ID+' *{box-sizing:border-box}'+
 '#'+ID+' .ta-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:11px}'+
 '#'+ID+' .ta-title{font-size:19px;font-weight:850;color:#0c447c;letter-spacing:-.02em}'+
 '#'+ID+' .ta-note{color:#64748b;line-height:1.5;font-size:11px;margin-top:3px}'+
 '#'+ID+' .ta-actions{display:flex;gap:7px;flex-wrap:wrap}'+
 '#'+ID+' button{background:#fff;color:#185fa5;border:1px solid #c9daee;border-radius:9px;padding:8px 11px;font-size:11px;cursor:pointer;font-weight:750}'+
 '#'+ID+' button:hover{background:#edf5ff}#'+ID+' button:focus-visible{outline:2px solid #60a5fa;outline-offset:2px}'+
 '#'+ID+' .ta-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:8px 0 12px}'+
 '#'+ID+' .ta-kpi{border:1px solid #e0e8f2;background:#fff;border-radius:11px;padding:10px;min-width:0}'+
 '#'+ID+' .ta-kpi span{display:block;color:#687c91;font-size:10px;font-weight:700}'+
 '#'+ID+' .ta-kpi b{display:block;font-size:19px;margin:5px 0 2px;overflow-wrap:anywhere}'+
 '#'+ID+' .ta-kpi small{display:block;color:#72839a;font-size:10px;line-height:1.4}'+
 '#'+ID+' .ta-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}'+
 '#'+ID+' .ta-card{border:1px solid #e0e8f2;border-radius:11px;background:#fff;padding:12px;min-width:0}'+
 '#'+ID+' .ta-card.critical{border-left:4px solid #dc2626}#'+ID+' .ta-card.warning{border-left:4px solid #d97706}'+
 '#'+ID+' .ta-card.ok{border-left:4px solid #16a34a}#'+ID+' .ta-card h4{margin:0 0 6px;font-size:13px;color:#163c5d;overflow-wrap:anywhere}'+
 '#'+ID+' .ta-card p{font-size:11px;line-height:1.45;margin:4px 0;color:#475569;overflow-wrap:anywhere}'+
 '#'+ID+' .ta-evidence{color:#64748b!important;font-size:10px!important}'+
 '#'+ID+' .ta-foot{font-size:10px;color:#6b7c90;margin-top:11px;line-height:1.4}'+
 '#'+ID+' .ta-empty{padding:13px;background:#fff;border:1px dashed #d0deef;border-radius:10px;color:#64748b}'+
 '#'+ID+' .ta-bar{background:#edf2fa;height:7px;border-radius:6px;margin-top:8px;overflow:hidden}'+
 '#'+ID+' .ta-bar i{background:#c57c39;display:block;height:100%;border-radius:6px}'+
 '#tr14-shell [data-tr14="sales"]{display:none!important}'+
 '@media(max-width:1000px){#'+ID+' .ta-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}'+
 '@media(max-width:700px){#'+ID+' .ta-cards{grid-template-columns:1fr}#'+ID+' .ta-title{font-size:17px}}';
 document.head.appendChild(el);
}
function root(){
 const shell=document.getElementById('tr14-shell');if(!shell||!shell.parentElement)return null;
 style();
 let el=document.getElementById(ID);
 if(!el){
  el=document.createElement('section');el.id=ID;el.dataset.open='false';el.setAttribute('aria-label','Приоритеты и рекомендации Triovist');
  el.addEventListener('click',event=>{
   const b=event.target.closest?.('[data-ta-go],[data-ta-refresh],[data-ta-more],[data-ta-detail]');
   if(!b||!el.contains(b))return;
   if(b.dataset.taGo){document.querySelector('#tr14-shell [data-tr14="'+b.dataset.taGo+'"]')?.click();return}
   if(b.dataset.taMore!==undefined){s.showAll=!s.showAll;void update();return}
   if(b.dataset.taRefresh!==undefined){s.ownKey='';s.cardsKey='';void update(true);return}
   if(b.dataset.taDetail!==undefined){
    const target=s.tab==='cards'?'tri21-card':s.tab==='tasks'?'tri-task-card':s.tab==='stock'?'tri-stock-card':s.tab==='parser'?'tri21-control-v236107':'tr14-panel';
    document.getElementById(target)?.scrollIntoView?.({block:'start',behavior:'smooth'});
   }
  });
 }
 const motivation=document.getElementById('tri-mot-compare-v236200');
 const anchor=motivation?.parentElement===shell.parentElement?motivation:shell;
 if(el.previousElementSibling!==anchor)anchor.insertAdjacentElement('afterend',el);
 return el;
}
function snapshot(){return w.RESANTA_TRIOVIST_UNIX_DIRECTOR_V1?.readOnlySnapshot?.()||{}}
function groupSnapshot(){return w.RESANTA_TRIOVIST_GROUP_DYNAMICS_V236120?.readOnlySnapshot?.()||null}
function taskSnapshot(){return w.RESANTA_TRIOVIST_TASK_MONTH_SAFE_V23651?.readOnlySnapshot?.()||null}
function competitorSnapshot(){return w.RESANTA_TRIOVIST_COMPETITORS_V236218?.readOnlySummary?.()||null}
const authorizedRows=rows=>(Array.isArray(rows)?rows:[]).filter(x=>!manager()||norm(x.manager_email)===myEmail());
function ownKey(){return myEmail()+'|'+day()}
async function own(force){
 if(!authorized(s.ctx))return null;
 const key=ownKey();if(s.own&&s.ownKey===key&&!force)return s.own;
 if(s.flightOwn)return s.flightOwn;
 s.flightOwn=rpc('triovist_own_listing_positions_v236351',{p_manager_email:manager()?myEmail():null,p_search:null,p_movement:null,p_offset:0,p_limit:40}).then(x=>{
  if(key!==ownKey())return null;s.own=x;s.ownKey=key;return x;
 }).catch(e=>{console.warn('Triovist listing briefing unavailable',e?.message||e);return null}).finally(()=>{s.flightOwn=null});
 return s.flightOwn;
}
async function contentIssues(force){
 const hub=w.TRIOVIST_DATA_HUB_V227315;
 if(!hub?.content)return null;
 const key=myEmail()+'|'+day();
 if(s.cards&&s.cardsKey===key&&!force)return s.cards;
 if(s.flightCards)return s.flightCards;
 s.flightCards=hub.content({p_manager_email:manager()?myEmail():null},{force:!!force}).then(x=>{
  if(key!==myEmail()+'|'+day())return null;
  s.cards=x;s.cardsKey=key;return x;
 }).catch(e=>{console.warn('Triovist card briefing unavailable',e?.message||e);return null}).finally(()=>{s.flightCards=null});
 return s.flightCards;
}
function item(title,why,action,section,kind,source,width){
 return {title:String(title||''),why:String(why||''),action:String(action||''),section:section||'',kind:kind||'warning',source:source||'Данные CRM',width:Number(width)||0};
}
function groupRows(snap){
 const gs=groupSnapshot();
 if(s.tab==='groups'&&gs?.groups?.length){
  const rows=authorizedRows(gs.groups);
  const active=!!gs.projection?.active;
  return rows.filter(x=>N(x.delta_revenue)!==null&&N(x.delta_revenue)<0)
   .sort((a,b)=>N(a.delta_revenue)-N(b.delta_revenue)).slice(0,5).map(r=>item(
    (r.manager_name||'')+' · '+(r.group||'Без группы'),
    'Снижение '+money(Math.abs(N(r.delta_revenue)))+'. '+(active?'Сопоставление по темпу неполного месяца, не окончательный факт.':'Сравнение выбранных периодов по 1С.'),
    'Открыть подгруппы и SKU; проверить наличие, матрицу и спрос. Причина падения пока не установлена.',
    'groups','critical','Группы и категории · 1С',Math.abs(N(r.delta_revenue))));
 }
 const sales=snap.sales;
 if(!sales||!Array.isArray(sales.items))return [];
 const sm=snap.month||'';
 if(sm===curMonth())return [];
 const compute=w.RESANTA_TRIOVIST_UNIX_DIRECTOR_V1?.compute;
 const m=typeof compute==='function'?compute(sales,s.ctx):null;
 return (m?.groups||[]).filter(x=>N(x.prev)!==null&&x.prev>x.cur)
  .sort((a,b)=>(a.cur-a.prev)-(b.cur-b.prev)).slice(0,4).map(r=>item(
   (r.manager||'')+' · '+r.name,
   'Оборот '+money(r.cur)+' против '+money(r.prev)+' в аналогичном периоде предыдущего года.',
   'Раскрыть подгруппы и SKU, проверить позиции и наличие. Причина не подтверждена.',
   'groups','critical','Продажи 1С · '+sm,Math.abs(r.cur-r.prev)));
}
function taskRows(snap){
 const active=s.tab==='tasks'?taskSnapshot():null;
 const pack=active?.pack?.dash;
 const tasks=authorizedRows(pack?.tasks||((snap.month===active?.month||s.tab!=='tasks')?snap.tasks?.tasks:[]));
 const pending=new Set(['pending_approval','overdue','awaiting_check','new','accepted','in_progress','waiting_21vek']);
 return tasks.filter(t=>pending.has(String(t.status||'')))
  .sort((a,b)=>(a.status==='overdue'?-2:0)-(b.status==='overdue'?-2:0)||
    Number(b.priority_score||0)-Number(a.priority_score||0))
  .slice(0,3).map(t=>item(
   t.title||t.task_text||'Задача по категории',
   'Статус: '+String(t.status||'—')+(t.due_date?' · срок '+String(t.due_date).slice(0,10):''),
   t.next_step||'Проверить задачу, основание и ожидаемый результат.',
   'tasks',t.status==='overdue'?'critical':'warning','Задачи ИИ · '+(active?.month||snap.month||''),0));
}
function stockRows(snap){
 const d=snap.stock?.snapshot_date||snap.stock?.partner?.snapshot_date;
 const diff=age(d);
 const domText=document.getElementById('tri-stock-card')?.textContent||'';
 const result=[];
 if(diff===null)result.push(item('Свежесть остатков не подтверждена','Нет даты последнего подтверждённого снимка 21vek.','Проверьте источник прежде чем формировать заказ.','stock','warning','Остатки CRM'));
 else if(diff>10)result.push(item('Остатки 21vek устарели','Последний снимок: '+String(d).slice(0,10)+' ('+diff+' дней назад).','Обновить подтверждённый файл 21vek; не формировать окончательный заказ по старому снимку.','stock','critical','Остатки CRM'));
 if(s.tab==='stock'&&/Рекомендации временно не считать окончательными|старым парсером/i.test(domText))
  result.push(item('Рекомендации по заказу требуют проверки','На экране указан старый формат снимка 21vek, который мог учитывать «в пути» некорректно.','Повторно загрузить актуальный файл и проверить колонку «Свободно»; в пути не суммировать с доступным запасом.','stock','critical','Предупреждение модуля остатков'));
 return result;
}
function ownRows(data){
 const rows=authorizedRows(data?.rows||[]);
 return rows.filter(x=>String(x.movement||'').toLowerCase()==='down'||(N(x.position_delta)!==null&&N(x.position_delta)>0)||String(x.current_label||'').includes('>120'))
  .slice(0,3).map(r=>item(
   'Листинг '+String(r.sku||r.card_key||'SKU'),
   'Позиция: '+String(r.previous_label||'—')+' → '+String(r.current_label||'—')+(r.keyword?' · запрос «'+r.keyword+'»':''),
   'Сравнить наличие, цену и карточку с датами изменения позиции; первопричина не установлена.',
   'parser','warning','История собственного листинга 21vek · до 30 дней'));
}
function cardRows(data){
 const issues=authorizedRows(data?.issues||[]).filter(x=>x.status==='open'||x.status==='needs_review');
 const by=new Map();
 for(const x of issues){
  const key=norm(x.manager_email)+'|'+(x.card_key||x.sku||x.donor_article||x.id);
  let g=by.get(key);if(!g){g={sku:x.sku||x.donor_article||'SKU',manager:x.manager_name||'',critical:0,all:0,titles:[]};by.set(key,g)}
  g.all++;if(x.severity==='critical')g.critical++;
  if(g.titles.length<3&&!g.titles.includes(x.issue_title))g.titles.push(x.issue_title||x.issue_type||'Проблема');
 }
 const cards=[...by.values()].sort((a,b)=>b.critical-a.critical||b.all-a.all);
 return {count:issues.length,critical:issues.filter(x=>x.severity==='critical').length,cards:cards.slice(0,5).map(g=>item(
  g.sku+' · '+(g.manager||''),
  g.critical+' критических, '+g.all+' открытых замечаний. '+g.titles.join('; ')+'.',
  'Открыть карточку, исправить подтверждённые нарушения и проверить повторным снимком.',
  'cards',g.critical?'critical':'warning','Контроль карточек · последнее подтверждённое Excel'))};
}
function competitorRows(d){
 const ss=d?.summary||{};
 const gaps=N(ss.confirmed_gaps??ss.gaps),stronger=N(ss.competitor_stronger);
 const arr=[];
 if(gaps>0)arr.push(item('Есть подтверждённые пробелы ассортимента','Найдено '+gaps+' пробелов по сопоставленным конкурентным товарам.','Открыть категорию, проверить прямого аналога и согласовать расширение матрицы.','competitors','critical','Контроль конкурентов 21vek'));
 if(stronger>0)arr.push(item('Конкуренты сильнее в части сравнений','Таких сравнений: '+stronger+'. Это оценка товарных характеристик, не доказательство причины роста в поиске.','Сверить динамику позиций по одному запросу, цену, наличие и характеристики.','competitors','warning','Сопоставление конкурентов 21vek'));
 return arr;
}
function cardsHtml(items){
 const rows=s.showAll?items:items.slice(0,5);
 if(!rows.length)return '<div class="ta-empty">Новых подтверждённых приоритетов из доступных источников пока нет. Отсутствие сигнала не означает отсутствие проблем — проверьте свежесть снимков.</div>';
 const max=Math.max(1,...rows.map(x=>x.width||0));
 return '<div class="ta-cards">'+rows.map((x,i)=>
  '<article class="ta-card '+E(x.kind)+'"><h4>'+(i+1)+'. '+E(x.title)+'</h4><p>'+E(x.why)+'</p><p><b>Что делать:</b> '+E(x.action)+'</p><p class="ta-evidence">'+E(x.source)+(x.kind==='critical'?' · требует внимания':' · для проверки')+'</p>'+
  (x.width?'<div class="ta-bar"><i style="width:'+Math.min(100,Math.round(x.width/max*100))+'%"></i></div>':'')+
  (x.section?'<div class="ta-actions"><button type="button" data-ta-go="'+E(x.section)+'">Открыть раздел</button></div>':'')+
  '</article>').join('')+'</div>';
}
function tile(name,value,foot){return '<div class="ta-kpi"><span>'+E(name)+'</span><b>'+E(value)+'</b><small>'+E(foot)+'</small></div>'}
function paint(extra={}){
 const el=root();if(!el||!authorized(s.ctx)||!isTri()){if(el)el.dataset.open='false';return}
 const k=s.tab;
 if(k==='motivation'||!SECTIONS[k]){el.dataset.open='false';return}
 el.dataset.open='true';
 const snap=snapshot(),group=groupSnapshot(),ts=taskSnapshot(),comp=competitorSnapshot();
 let rows=[],kpis=[],note='';
 if(k==='home'||k==='sales'){
  rows=[...taskRows(snap),...groupRows(snap),...stockRows(snap),...ownRows(s.own),...competitorRows(comp)];
  const m=w.RESANTA_TRIOVIST_UNIX_DIRECTOR_V1?.compute?.(snap.sales,s.ctx);
  kpis=[
   tile('Снимок продаж',snap.month||'—','Последний выбранный период 1С'),
   tile('Факт 1С',money(m?.current),'По подтверждённым данным'),
   tile('Задачи в источнике',Array.isArray(snap.tasks?.tasks)?String(authorizedRows(snap.tasks.tasks).length):'—','Месяц '+(snap.month||'—')),
   tile('Позиции листинга',s.own?.summary?.total??'—','Свежесть проверяется отдельно')
  ];
  note='Сигналы формируются при открытии из подтверждённых данных. Сравнения продаж относятся к выбранному периоду, а листинг — к последним доступным снимкам.';
 }else if(k==='groups'){
  rows=groupRows(snap);
  const gs=group?.groups||[];
  kpis=[tile('Групп в выборке',gs.length||'—','Учитываются действующие фильтры'),tile('Падения',rows.length,'Группы с отрицательной динамикой'),tile('Период',group?.from||snap.month||'—','Сравнение в модуле ниже'),tile('Источник','1С','Исторические несопоставленные SKU отдельно')];
  note='Динамика показывает следствие, не доказывает причину. Раскройте группу, подгруппу и конкретные SKU.';
 }else if(k==='stock'){
  rows=stockRows(snap);
  kpis=[tile('Снимок 21vek',String(snap.stock?.snapshot_date||snap.stock?.partner?.snapshot_date||'—').slice(0,10),'Данные склада партнёра'),tile('Наш склад',snap.stock?.own_snapshot_date||'—','Проверить актуальность'),tile('Заказ','45 дней','Настраивается в действующем разделе'),tile('Рекомендации',rows.length?'Проверка':'По данным','Не подтверждать по старому файлу')];
  note='Доступный остаток 21vek берётся из колонки «Свободно». «В пути» не прибавляем автоматически. Расчёт заказа остаётся в действующем модуле.';
 }else if(k==='tasks'){
  const pack=ts?.pack?.dash,all=authorizedRows(pack?.tasks||[]);
  rows=taskRows(snap);
  kpis=[tile('Задачи месяца',pack?all.filter(x=>!['cancelled','not_relevant'].includes(x.status)).length:'—',ts?.month||'Ждём загрузку'),tile('На проверке',pack?all.filter(x=>x.status==='awaiting_check').length:'—','Требуют подтверждения'),tile('Просрочено',pack?all.filter(x=>x.status==='overdue').length:'—','Отдельный контроль'),tile('Результат','По 1С','Не равен нажатию «Выполнено»')];
  note='Результат и KPI определяет действующая проверка задач. Брифинг не создаёт и не подтверждает задачи автоматически.';
 }else if(k==='cards'){
  const res=cardRows(s.cards);
  rows=res.cards;
  kpis=[tile('Открытые проблемы',s.cards?res.count:'—','Только доступные менеджеру'),tile('Критических',s.cards?res.critical:'—','Сначала проверять их'),tile('Карточек в TOP',s.cards?.managers?.reduce((a,x)=>a+Number(x.summary?.top60||0),0)??'—','Последний Excel'),tile('Приоритет','По SKU','Замечания сгруппированы')];
  note='Список составлен из последнего загруженного Excel, а не из непроверенных гипотез. Исправление подтверждается повторным снимком.';
 }else if(k==='parser'){
  rows=[...ownRows(s.own)];
  const parser=snap.parser||{},stamp=parser.working?.completed_at||parser.last_good?.completed_at||null;
  if(age(stamp)>3)rows.unshift(item('Снимок 21vek требует обновления','Последний полный успешный сбор: '+String(stamp||'нет даты').slice(0,16)+'.','Проверить состояние штатного парсера и ручные ошибки; старый снимок не считать свежим.','parser','critical','Журнал парсера'));
  kpis=[tile('Собственный листинг',s.own?.summary?.total??'—','Проверено до 40 позиций'),tile('Падения',ownRows(s.own).length,'Подтверждённые наблюдения'),tile('Последний сбор',String(stamp||'—').slice(0,10),'Валидный снимок'),tile('Глубина истории','30 дней','Детали открываются ниже')];
  note='Позиции наблюдаются парсером. Изменение места — факт; влияние цены/остатка/контента нужно проверять отдельно.';
 }else if(k==='competitors'){
  rows=competitorRows(comp);
  const cs=comp?.summary||{};
  kpis=[tile('Категорий',cs.scopes??'—','По последнему анализу'),tile('Конкуренты сильнее',cs.competitor_stronger??'—','Коммерческие сравнения'),tile('Подтв. пробелы',cs.confirmed_gaps??cs.gaps??'—','Прямые аналоги'),tile('Позиции','Каждые 3 ч','Проверить дату последнего сбора')];
  note='Рост конкурента и падение нашего SKU должны сравниваться на одной поисковой фразе и в сопоставимое время. Без таких данных причина отмечается как неподтверждённая.';
 }
 if(k==='home'){
  const order={critical:0,warning:1,ok:2};
  rows.sort((a,b)=>(order[a.kind]??2)-(order[b.kind]??2)||b.width-a.width);
 }
 const stamp=day();
 el.innerHTML='<div class="ta-head"><div><div class="ta-title">✨ '+E(SECTIONS[k])+' · Uni X</div><div class="ta-note">'+E(k==='home'?'План на сегодня · '+stamp:note)+'</div></div>'+
 '<div class="ta-actions"><button data-ta-refresh>↻ Пересчитать приоритеты</button><button data-ta-detail>Показать исходные данные</button></div></div>'+
 '<div class="ta-kpis">'+kpis.join('')+'</div>'+
 (k==='home'?'<div class="ta-note" style="margin-bottom:9px">До 5 главных сигналов из CRM. Причины не выдаются за доказанные, пока не сопоставлены источники.</div>':'')+
 cardsHtml(rows)+(rows.length>5?'<div class="ta-actions" style="margin-top:9px"><button data-ta-more>'+(s.showAll?'Свернуть':'Показать остальные ('+(rows.length-5)+')')+'</button></div>':'')+
 '<div class="ta-foot">'+E(note||'Подробная аналитика и действия сохранены в действующих разделах ниже.')+' · Аналитические правила, без автоматических правок карточек, заказов или задач.</div>';
}
async function update(force=false){
 const seq=++s.seq,k=s.tab,me=myEmail();
 paint();
 if(!authorized(s.ctx)||!isTri())return;
 const jobs=[];
 if(k==='home'||k==='parser')jobs.push(own(force));
 if(k==='cards')jobs.push(contentIssues(force));
 if(!jobs.length)return;
 await Promise.allSettled(jobs);
 if(seq!==s.seq||k!==s.tab||me!==myEmail())return;
 paint();
}
function show(k,ctx){
 if(ctx&&authorized(ctx)){
  if(myEmail()&&myEmail()!==norm(ctx.email)){s.own=s.cards=null;s.ownKey=s.cardsKey='';s.flightCards=s.flightOwn=null}
  s.ctx=ctx;
 }
 s.tab=k||'home';s.showAll=false;
 const el=root();
 if(el)el.dataset.open=authorized(s.ctx)&&isTri()&&s.tab!=='motivation'?'true':'false';
 void update();
}
function sourceUpdated(k){
 if(k&&k!==s.tab)return;
 if(!authorized(s.ctx)||!isTri())return;
 // The upstream authoritative module has refreshed; avoid additional RPC calls.
 paint();
}
w.RESANTA_TRIOVIST_ACTION_CENTER_V1=Object.freeze({version:V,show,sourceUpdated,refresh:()=>update(true),readOnly:true,noCrmWrites:true,noParserRuns:true,scopedManagerData:true});
})(window);
