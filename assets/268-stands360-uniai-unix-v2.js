/* РЕСАНТА CRM · Стенды 360° Uni AI/Uni X · директорский экран v2.
 * Owned asset decisions, exact SKU checks, photo without GPS. No original records overwritten.
 */
(function(){
'use strict';
if(window.RESANTA_STANDS_360_V1)return;
const state={data:null,loading:false,error:'',view:'overview',filter:'all',manager:'all',brand:'all',
 search:'',photos:new Map(),detailId:null,skuRows:[],matchRow:null,selectedSkus:new Set(),clientCandidate:null,photoPaths:[]};
function dbclient(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
const el=id=>document.getElementById(id);
const str=x=>String(x??'');
const esc=x=>str(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rows=x=>Array.isArray(x)?x:[];
const money=x=>Number(x||0).toLocaleString('ru-RU',{maximumFractionDigits:0})+' BYN';
const date=x=>x?str(x).slice(0,10).split('-').reverse().join('.'):'—';
const low=x=>str(x).toLocaleLowerCase('ru-RU');
const photo=p=>p.last_control_photo_path||p.installation_photo_path||'';
const dataOk=p=>p.sales_confidence==='verified_monthly_client_shipments';
const standRows=()=>rows(state.data?.stands);
const messages={
 asset_check:['Учёт имущества','warn','Инвентарный номер не привязан. Ответственный руководитель может сверить оборудование с реестром ОС.'], 
 photo_missing:['Получить фото','warn','Попросить актуальное фото у продавца или сделать при визите — GPS не нужен.'],
 client_id_check:['Сверить ID клиента','warn','По ID торговой точки не найдены данные 1С. Сверить связь с юридическим лицом.'],
 sku_check:['Уточнить SKU','warn','Есть неподтверждённые артикулы. Сверить их с каталогом, затем пересчитать отгрузки.'],
 photo_stale:['Обновить фото','warn','Обновить фотоподтверждение использования нашего оборудования.'],
 vision_pending:['Проверить Vision','warn','Запустить оценку по актуальному фото стенда.'],
 use_check:['Проверить использование','warn','Сверить замечания Vision с фактическим состоянием стенда.'],
 shipments_check:['Провести работу','warn','Разобраться со снижением отгрузок по подтверждённым SKU; проверить потребность клиента.'],
 maintain:['Оставить под контролем','good','Нет подтверждённых причин рекомендовать возврат. Продолжать контроль.']
};
const stateOf=p=>messages[p.priority_code]||messages.maintain;
function attachCSS(){
 if(el('s268-css-link'))return;
 const l=document.createElement('link');l.id='s268-css-link';l.rel='stylesheet';
 l.href='./assets/268-stands360-uniai-unix-v2.css?v=20261111-uni-v2';
 document.head.appendChild(l);
 const extra=document.createElement('link');extra.rel='stylesheet';extra.href='./assets/269-stands360-feedback-v3.css?v=20261112-v3';document.head.appendChild(extra);
}
async function rpc(fn,args){
 const d=dbclient();if(!d)throw new Error('Нет подключения к CRM');
 const {data,error}=await d.rpc(fn,args||{});if(error)throw error;return data;
}
function nav(){
 const mode=x=>'<button data-s268-view="'+x[0]+'" class="s268-tab '+(state.view===x[0]?'active':'')+'">'+x[1]+'</button>';
 const old=[['placements','Действующие / ОС'],['requests','Заявки'],['history','История и архив']];
 if(['df','dfs'].includes(state.data?.actor_role))old.push(['os','Реестр имущества'],['recommendations','Кандидаты']);
 if(state.data?.actor_role==='dfs')old.push(['internal','Внутренняя логика']);
 return '<nav class="s268-nav"><div class="s268-tabs">'+
 [['overview','⌂ Обзор'],['all','▣ Все стенды'],['decisions','◎ Решения']].map(mode).join('')+
 '</div><details class="s268-docs"><summary>▱ Учёт и документы ▾</summary>'+
 '<div class="s268-docsmenu">'+old.map(x=>'<button data-st346-tab="'+x[0]+'">'+x[1]+'</button>').join('')+'</div></details></nav>';
}
function hero(){
 const d=state.data||{};
 const metrics=[['▤','Записей о стендах',d.total,'В действующем реестре'],
 ['▱','Не сверены с ОС',d.asset_issues,'Требуют проверки'],
 ['▧','Нет фото',d.photo_issues,'Нужно получить актуальное фото']];
 return '<section class="s268-hero"><div class="s268-identity"><div class="s268-symbol">▤</div>'+
 '<div><h2>Стенды 360°</h2><p>Имущество компании · Эффективность · Решения</p></div></div>'+
 '<div class="s268-kpis">'+metrics.map(x=>'<div class="s268-kpi"><span class="s268-kpiicon">'+x[0]+'</span>'+
 '<div><small>'+x[1]+'</small><b>'+esc(x[2]??'—')+'</b><em>'+x[3]+'</em></div></div>').join('')+'</div></section>';
}
function pipeline(){
 const blocks=[['▤','Данные','Стенд, ID клиента, SKU, отгрузки, история'],
 ['▣','Vision','Фото: наличие, состояние, использование'],
 ['✧','Причины и варианты','Лера объясняет факты, риски и действия'],
 ['✓','Решение руководителя','Оставить, исправить, перенести или вернуть']];
 return '<section class="s268-pipeline"><div class="s268-pipetitle"><span>✦</span><div><b>Лера анализирует</b>'+
 '<small>Как принимаются решения по стендам</small></div></div>'+
 blocks.map(x=>'<div class="s268-pipe"><span>'+x[0]+'</span><div><b>'+x[1]+'</b><small>'+x[2]+'</small></div></div>').join('')+'</section>';
}
function evidence(p){
 const found=[];
 // ОС учитывается отдельно — не смешиваем имущество и эффективность торговой выкладки.
 if(!photo(p))found.push('Нет фотографии стенда');else if(p.photo_days>45)found.push('Фото требует обновления');
 if(p.client_history_rows===0)found.push('Отгрузки 1С не связаны с ID клиента');
 else if(p.unresolved_skus>0)found.push('Не сопоставлено '+p.unresolved_skus+' из '+p.registered_skus+' SKU');
 else if(p.registered_skus===0)found.push('Список SKU пуст');
 else found.push('Сверено '+p.validated_skus+' SKU по каталогу');
 if(p.vision_status==='review')found.push('Vision выявил замечания');
 if(!p.vision_checked_at)found.push('Vision не подтверждён');
 return found;
}
function priority(p){
 let n=0;
 if(!p.asset_id)n+=5;
 if(p.client_history_rows===0)n+=35;
 if(p.unresolved_skus>0)n+=30;
 if(!photo(p))n+=25;else if(p.photo_days>45)n+=12;
 if(p.vision_status==='review')n+=10;
 if(p.priority_code==='shipments_check')n+=8;
 return n;
}
function thumb(p){
 return photo(p)?'<img class="s268-thumb" alt="Стенд клиента" data-s268-path="'+esc(photo(p))+'">':
 '<span class="s268-thumb s268-thumbempty" aria-hidden="true">▤</span>';
}
async function loadThumbs(){
 const list=[...document.querySelectorAll('img[data-s268-path]')];
 await Promise.all(list.map(async img=>{
  const path=img.dataset.s268Path;if(!path)return;
  try{
   if(!state.photos.has(path)){
    const storage=dbclient().storage.from('stand-files');
    const v=await storage.createSignedUrl(path,600,{transform:{width:360,height:240,resize:'contain',quality:75}});
    if(v.error||!v.data?.signedUrl){const plain=await storage.createSignedUrl(path,600);if(plain.error)throw plain.error;state.photos.set(path,plain.data.signedUrl)}
    else state.photos.set(path,v.data.signedUrl);
   }
   if(img.isConnected)img.src=state.photos.get(path);
  }catch(_){img.alt='Фото временно недоступно'}
 }));
}
function briefs(){
 const cases=standRows().filter(x=>x.priority_code!=='maintain')
  .sort((x,y)=>priority(y)-priority(x)||str(x.client_name).localeCompare(str(y.client_name),'ru'));
 const selected=state.view==='decisions'?cases:cases.slice(0,3);
 const title=state.view==='decisions'?'Лера · Очередь решений':'Лера · Что требует решения сегодня';
 return '<section class="s268-panel"><div class="s268-panelhead"><h3>◫ '+title+'</h3>'+
 '<p>Основано на фото, данных 1С и истории работы со стендами</p></div>'+
 (selected.length?selected.map(p=>{
  const s=stateOf(p),bits=evidence(p);
  const status=p.client_history_rows===0?'Требует сверки ID':p.unresolved_skus>0?'SKU не сопоставлены':!p.asset_id?'Проверка ОС':'Данные доступны';
  return '<div class="s268-issue" role="button" tabindex="0" data-s268-detail="'+esc(p.id)+'">'+
  '<div class="s268-issueid">'+thumb(p)+'<div><b>'+esc(p.client_name)+'</b>'+
  '<small>♙ '+esc(p.manager_name)+' · ID '+esc(p.client_code||p.client_id)+'</small></div></div>'+
  '<div><small class="s268-issuelabel">Причина</small><p class="s268-issuetext">'+esc(bits.slice(0,2).join('. ')||s[2])+'</p></div>'+
  '<div><small class="s268-issuelabel">Статус данных</small>'+
  '<span class="s268-pill '+(dataOk(p)?'good':'warn')+'">'+esc(status)+'</span>'+
  '<small class="s268-muted" style="display:block;margin-top:5px">'+esc(s[0])+'</small></div>'+
  '<div><small class="s268-issuelabel">Действие</small><p class="s268-issuetask">'+esc(s[2])+'</p></div></div>';
 }).join(''):'<p class="s268-muted">Нет подтверждённых проблем, требующих решения.</p>')+
 (state.view!=='decisions'&&cases.length>3?'<div class="s268-briefmore"><button class="s268-secondary" data-s268-view="decisions">Все задачи · '+cases.length+' →</button></div>':'')+
 '</section>';
}
function filteredRows(){
 const search=low(state.search.trim());
 return standRows().filter(p=>{
  if(state.filter==='issues'&&p.priority_code==='maintain')return false;
  if(state.filter==='data'&&dataOk(p))return false;
  if(state.filter==='photo'&&photo(p)&&p.photo_days<=45)return false;
  if(state.manager!=='all'&&p.manager_name!==state.manager)return false;
  if(state.brand!=='all'&&p.stand_brand!==state.brand)return false;
  if(search&&![p.client_name,p.client_code,p.client_id,p.asset_code,p.manager_name,p.stand_brand,p.address].some(s=>low(s).includes(search)))return false;
  return true;
 }).sort((x,y)=>priority(y)-priority(x)||str(x.client_name).localeCompare(str(y.client_name),'ru'));
}
function quickScore(p){
 const photoOk=p.vision_photo_evidence_path===photo(p)&&p.vision_checked_at;
 let sum=0,available=0;
 if(photoOk&&typeof p.vision_stand_present==='boolean'){available+=25;sum+=p.vision_stand_present?25:0}
 if(photoOk&&p.vision_fill_pct!=null&&p.vision_own_brand_pct!=null&&p.vision_photo_quality_score!=null){
  available+=25;sum+=25*(.35*Number(p.vision_fill_pct)+.45*Number(p.vision_own_brand_pct)+.20*Number(p.vision_photo_quality_score))/100;
 }
 if(dataOk(p)&&p.sku_expected>0&&p.client_history_rows>0){
  const six=Number(p.ship_6m||0),prev=Number(p.ship_prev_6m||0);
  available+=35;sum+=prev>0?35*Math.min(1.2,six/prev)/1.2:six>0?31:7;
 }
 if(photo(p)&&p.photo_days!=null){available+=15;sum+=p.photo_days<=30?15:p.photo_days<=60?9:3}
 return {score:available>=50?Math.round(sum/available*100):null,coverage:available};
}

function table(){
 const all=standRows(),selected=filteredRows();
 const managers=[...new Set(all.map(x=>x.manager_name).filter(Boolean))].sort();
 const brands=[...new Set(all.map(x=>x.stand_brand).filter(Boolean))].sort();
 const select=(key,opts)=>'<select aria-label="'+key+'" data-s268-select="'+key+'">'+opts.map(o=>
  '<option value="'+esc(o[0])+'" '+(state[key]===o[0]?'selected':'')+'>'+esc(o[1])+'</option>').join('')+'</select>';
 return '<section class="s268-panel"><div class="s268-panelhead"><h3>▤ Управление стендами <span class="s268-pill info">'+all.length+' записей</span></h3>'+
 '<div class="s268-tools">'+
 select('filter',[['all','Все статусы'],['issues','Требуют действий'],['data','Неполные данные'],['photo','Без актуального фото']])+
 select('manager',[['all','Все менеджеры'],...managers.map(x=>[x,x])])+
 select('brand',[['all','Все бренды'],...brands.map(x=>[x,x])])+
 '<input id="s268-search" aria-label="Поиск" placeholder="Клиент, ID или ОС" value="'+esc(state.search)+'">'+
 '<button class="s268-secondary" data-s268-search>Найти</button></div></div>'+
 '<div class="s268-tablewrap"><table class="s268-table"><thead><tr><th>Клиент / ID</th><th>Наш стенд / ОС</th><th>Бренд</th><th>Установлен</th>'+
 '<th>Последнее фото</th><th>Отгрузки SKU · 6 мес.</th><th>Оценка Леры</th><th>Достоверность</th><th>Рекомендация Леры</th></tr></thead><tbody>'+
 selected.map(p=>{
  const s=stateOf(p),valid=dataOk(p);
  return '<tr data-s268-detail="'+esc(p.id)+'" tabindex="0">'+
  '<td><b>'+esc(p.client_name)+'</b><small>ID '+esc(p.client_code||p.client_id)+' · '+esc(p.manager_name)+'</small></td>'+
  '<td><b>'+esc(p.asset_code||'ОС не сверено')+'</b><small>'+esc(p.stand_type||'Стенд')+'</small></td>'+
  '<td>'+esc(p.stand_brand||'—')+'</td><td>'+esc(date(p.installed_at))+'</td>'+
  '<td>'+esc(photo(p)?date(p.last_control_at||p.installed_at):'Нет фото')+
  '<small>'+esc(p.photo_origin==='seller'?'От продавца':p.photo_origin==='manager'?'От МПП':'Источник не установлен')+'</small></td>'+
  '<td><b>'+(valid?esc(money(p.ship_6m)):'Не сопоставлено')+'</b>'+
  '<small>'+(valid?'Подтверждённые SKU':'Отгрузки клиента — отдельно')+'</small></td>'+
  '<td><b>'+esc(quickScore(p).score==null?'—':quickScore(p).score+'/100')+'</b><small>'+esc(quickScore(p).coverage===100?'Данные подтверждены':'Предварительно · полнота '+quickScore(p).coverage+'%')+'</small></td>'+ 
  '<td><span class="s268-pill '+(valid?'good':'warn')+'">'+(valid?'Сверено':'Нужна проверка')+'</span></td>'+
  '<td><span class="s268-action">'+esc(s[0])+'</span></td></tr>';
 }).join('')+'</tbody></table></div>'+
 '<p class="s268-muted" style="margin:10px 0 0">Данные 1С — отгрузки клиенту по подтверждённым SKU, с точностью до месяца. Не сопоставленные данные не обозначаются нулевыми продажами. Решение о возврате принимает только ДФ.</p></section>';
}
function paint(){
 const root=el('st360-root');if(!root)return;attachCSS();
 if(state.loading){root.innerHTML='<div class="s268-panel">Загружаю стенды 360°…</div>';return}
 if(state.error){root.innerHTML='<div class="s268-panel">Новый обзор временно недоступен: '+esc(state.error)+
 '. Прежний реестр и документы сохранены. <button class="s268-secondary" data-s268-refresh>Повторить</button></div>';return}
 root.innerHTML='<div class="s268">'+nav()+hero()+(state.view==='overview'?pipeline()+briefs()+table():
 state.view==='decisions'?briefs()+table():table())+'</div>';
 loadThumbs();
}
async function refresh(){
 if(state.loading)return;state.loading=true;paint();
 try{state.data=await rpc('crm_stands_360_v3',{p_limit:150});state.error=''}
 catch(e){state.error=str(e?.message||e);state.data=null}
 finally{state.loading=false;paint()}
}

function modal(title,subtitle,body,footer){
 el('s268-overlay')?.remove();const node=document.createElement('div');
 node.id='s268-overlay';node.className='s268-backdrop';
 node.innerHTML='<section class="s268 s268-modal" role="dialog" aria-modal="true" aria-labelledby="s268-modal-title">'+
 '<div class="s268-modalhead"><div><h2 id="s268-modal-title">'+esc(title)+'</h2><p>'+esc(subtitle)+'</p></div>'+
 '<button class="s268-close" data-s268-close aria-label="Закрыть">×</button></div>'+
 '<div id="s268-modalbody">'+body+'</div><div class="s268-buttongroup">'+(footer||'')+'</div></section>';
 document.body.appendChild(node);return node;
}
function explain(p){
 const items=evidence(p),m=stateOf(p);
 const clientInfo=p.client_history_rows>0?'Есть история отгрузок по ID клиента.':
  'Нет истории отгрузок 1С по этому ID. Нужно сверить юридическое лицо и торговую точку.';
 const skuInfo=p.unresolved_skus>0?'Не определено '+p.unresolved_skus+' из '+p.registered_skus+' SKU.':
  p.registered_skus===0?'Точный список SKU стенда пока пуст.':
  'Сверено '+p.validated_skus+' SKU с каталогом.';
 return '<div class="s268-ai"><h3>✦ Лера · Заключение по нашему стенду</h3>'+
 '<p><b>'+esc(m[0])+'.</b> '+esc(m[2])+'</p>'+
 '<p><b>Основания:</b> '+esc(clientInfo)+' '+esc(skuInfo)+'</p>'+
 '<ul>'+items.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>'+
 '<p class="s268-muted">Vision отвечает за наблюдения по фото; отгрузки считаются из 1С по ID и подтверждённым SKU. Директор утверждает дальнейшую судьбу оборудования, никакого автоматического возврата нет.</p></div>';
}
function photoHTML(p,source){
 const pic=rows(source).slice(0,2);
 if(!pic.length&&photo(p))pic.push({storage_path:photo(p),captured_at:p.last_control_at||p.installed_at});
 state.photoPaths=pic.map(x=>x.storage_path).filter(Boolean);
 return '<div class="s268-photos">'+pic.map((x,i)=>'<div class="s268-photo"><b>'+
 (i?'Предыдущее фото':'Актуальное фото')+'</b><img alt="Фото стенда" data-s268-path="'+esc(x.storage_path)+'" data-s268-full="'+esc(x.storage_path)+'" title="Нажмите для увеличения">'+
 '<button class="s268-secondary" data-s268-full="'+esc(x.storage_path)+'">⛶ Увеличить</button><small>'+date(x.captured_at)+'</small></div>').join('')+
 (pic.length===1?'<div class="s268-photo"><b>Сравнение до / после</b><p class="s268-muted">Для сравнения нужно новое фото. Его можно получить от продавца, без маршрута и GPS.</p></div>':'')+
 (pic.length===0?'<div class="s268-muted">Фото пока не предоставлено.</div>':'')+'</div>';
}
async function detail(id){
 const p=standRows().find(x=>x.id===id);if(!p)return;
 state.detailId=id;
 modal('Стенд 360° · '+p.client_name,'ID '+(p.client_code||p.client_id)+' · '+(p.asset_code||'ОС не сверено')+
 ' · '+p.manager_name,'<div class="s268-panel">Сверяю фотографии, SKU и историю 1С…</div>',
 '<button class="s268-primary" data-s268-photo="'+esc(id)+'">📷 Новое фото</button>'+
 '<button class="s268-secondary" data-s268-request="'+esc(id)+'">Запросить фото у продавца</button>'+ 
 '<button class="s268-secondary" data-s268-vision="'+esc(id)+'">✦ Проверить фото с ИИ</button>'+ 
 '<button class="s268-secondary" data-s268-client="'+esc(id)+'">Юрлицо / торговая точка</button>'+ 
 (['dfs','df'].includes(state.data?.actor_role)?'<button class="s268-secondary" data-s268-asset="'+esc(id)+'">Учёт ОС</button>':'')+
 '<button class="s268-secondary" data-s268-close>Закрыть</button>');
 try{
  const [s,ph,vr]=await Promise.all([
   rpc('crm_stands_360_skus_v3',{p_placement_id:id}),
   dbclient().from('stand_photos_v236346').select('storage_path,captured_at')
    .eq('placement_id',id).order('captured_at',{ascending:false}).limit(2),
   dbclient().from('stand_vision_checks_v236347').select('stand_present,fill_pct,own_brand_share_pct,photo_quality_score,summary,created_at,storage_path').eq('placement_id',id).order('created_at',{ascending:false}).limit(1).maybeSingle()
  ]);
  if(ph.error)throw ph.error;
  const host=el('s268-modalbody');if(!host)return;
  state.skuRows=rows(s?.rows);
  const metric=[
   ['Наше оборудование',p.asset_code||'Не сверено'],
   ['Фото',photo(p)?p.photo_days+' дн. назад':'Нет фото'],
   ['Подтверждённые SKU',p.sku_selected+' / '+p.sku_expected],
   ['Отгрузки SKU · 6 мес.',dataOk(p)?money(p.ship_6m):'Не сопоставлено']];
  const rowsHTML=state.skuRows.map((x,i)=>{
   const isValid=!['unresolved','partial'].includes(x.sku_state);
   const multi=/[2-9][0-9]*\s*скю/i.test(str(x.raw_sku));
   return '<tr><td><b>'+esc(x.raw_sku)+'</b>'+(x.chosen?'<div class="s268-muted">'+esc(x.chosen)+' из '+esc(x.expected)+' подтверждено</div>':'')+
    (rows(x.multi_skus).length?'<div class="s268-muted">'+esc(x.multi_skus.join(', '))+'</div>':'')+'</td>'+
    '<td><span class="s268-pill '+(isValid?'good':'warn')+'">'+
    esc(isValid?'Артикулы подтверждены':x.sku_state==='partial'?'Сверка не завершена':multi?'Несколько SKU':'SKU не определён')+'</span></td>'+
    '<td>'+esc(x.chosen?money(x.ship_6m):'Неизвестно')+'</td>'+
    '<td>'+(isValid&&x.sku_state==='exact_catalog'?'✓':
    '<button class="s268-secondary" data-s268-match="'+i+'">'+
    (multi?'Выбрать несколько':x.sku_state==='verified_multi'?'Изменить состав':'Уточнить SKU')+'</button>')+'</td></tr>';
  }).join('');
  host.innerHTML='<div class="s268-detailkpis">'+metric.map(x=>'<div><small>'+esc(x[0])+'</small><b>'+esc(x[1])+'</b></div>').join('')+'</div>'+
   '<div class="s268-detailcols"><section class="s268-detailsection"><h3>📷 Наш стенд · до / после</h3>'+
   photoHTML(p,ph.data)+
   '<div class="s268-reviewtools"><button class="s268-secondary" data-s268-vision="'+esc(p.id)+'">✦ Проверить фото с ИИ</button><button class="s268-secondary" data-s268-photo="'+esc(p.id)+'">Добавить фото</button></div>'+
   '<p class="s268-muted">Источник фото: '+esc(p.photo_origin==='seller'?'продавец':p.photo_origin==='manager'?'МПП':'не установлен для старых фото')+
   '. GPS не требуется.</p>'+
   '<details><summary style="font-size:11px;cursor:pointer;font-weight:750">Что Vision обнаружил?</summary>'+
   '<p class="s268-muted">'+esc(p.vision_summary||'Актуальное заключение Vision отсутствует')+'</p></details></section>'+
   '<section class="s268-detailsection"><h3>▤ Продажи и артикулы</h3>'+
   '<div class="s268-detailkpis" style="grid-template-columns:1fr 1fr">'+
   '<div><small>Отгрузки по SKU стенда</small><b>'+esc(dataOk(p)?money(p.ship_6m):'Не сопоставлено')+'</b></div>'+
   '<div><small>Весь клиент · 6 мес.</small><b>'+esc(p.client_history_rows?money(p.client_ship_6m):'Нет данных по ID')+'</b></div></div>'+
   '<p class="s268-muted">Общий оборот юрлица — справочно, не является розничными продажами со стенда. Привязка: '+esc(p.legal_client_name||'не подтверждена')+'. <button class="s268-secondary" data-s268-client="'+esc(id)+'">Изменить</button></p>'+
   '<div class="s268-skus"><table><thead><tr><th>Запись в стенде</th><th>Достоверность</th><th>Отгрузки · 6 мес.</th><th>Действие</th></tr></thead><tbody>'+
   rowsHTML+'</tbody></table></div></section></div>'+
   scoreCard(p,vr?.data||{stand_present:p.vision_stand_present,fill_pct:p.vision_fill_pct,own_brand_share_pct:p.vision_own_brand_pct,photo_quality_score:p.vision_photo_quality_score,storage_path:p.vision_photo_evidence_path})+explain(p)+
   '<p class="s268-muted">Учёт ОС и договоров — отдельно от коммерческой оценки. Сверка оборудования доступна руководителю через «Учёт ОС».</p>';
  loadThumbs();
 }catch(e){const host=el('s268-modalbody');if(host)host.innerHTML='<div class="s268-ai">Ошибка открытия: '+esc(e?.message||e)+'</div>'}
}

function scoreCard(p,v){
 const usable=!!v&&v.storage_path===photo(p)&&Boolean(p.vision_checked_at);
 const metrics=[];
 let total=0,available=0;
 const add=(name,weight,earned,why)=>{
  if(earned==null||!Number.isFinite(Number(earned)))metrics.push({name,weight,earned:null,why});
  else{const e=Math.max(0,Math.min(weight,Number(earned)));available+=weight;total+=e;metrics.push({name,weight,earned:Math.round(e),why})}
 };
 add('Наличие нашего стенда',25,usable&&typeof v.stand_present==='boolean'?(v.stand_present?25:0):null,'По последнему подтверждённому Vision');
 const fill=Number(v?.fill_pct),own=Number(v?.own_brand_share_pct),quality=Number(v?.photo_quality_score);
 const photoCondition=usable&&v.fill_pct!=null&&v.own_brand_share_pct!=null&&v.photo_quality_score!=null?
  25*(.35*fill+.45*own+.20*quality)/100:null;
 add('Состояние и бренд',25,photoCondition,'Заполненность, доля целевого бренда, качество фото');
 const current=Number(p.ship_6m),previous=Number(p.ship_prev_6m);
 let sales=null;
 if(dataOk(p)&&Number(p.sku_expected)>0&&Number(p.client_history_rows)>0){
  sales=previous>0?35*Math.min(1.2,current/previous)/1.2:current>0?31:7;
 }
 add('Отгрузки SKU · 1С',35,sales,'Косвенный коммерческий сигнал, не розничные продажи со стенда');
 const days=Number(p.photo_days);
 add('Актуальность контроля',15,photo(p)&&p.photo_days!=null?(days<=30?15:days<=60?9:3):null,'Дата последнего контрольного снимка');
 const coverage=available;
 const score=available>=50?Math.round(total/available*100):null;
 const stateLabel=coverage===100?'Оценка по доступным подтверждённым данным':coverage<50?'Недостаточно данных для оценки':'Предварительная оценка · не все данные подтверждены';
 return '<section class="s268-score"><div class="s268-scoremain"><b>✦ Лера · Эффективность стенда</b>'+
 '<strong class="s268-scorenum">'+(score==null?'—':score)+'/100</strong>'+
 '<span class="s268-scorestatus">'+stateLabel+' · полнота '+coverage+'%</span></div>'+
 '<div class="s268-scoregrid">'+metrics.map(x=>'<div class="s268-scorefactor"><span>'+esc(x.name)+'</span><b>'+
 (x.earned==null?'Нужны данные':x.earned+' / '+x.weight+' баллов')+'</b><span>'+esc(x.why)+'</span></div>').join('')+'</div>'+
 '<p class="s268-muted">Весовые категории: наличие 25, состояние 25, отгрузки 35, контроль 15. Отсутствующие данные не получают ноль; балл предварительный при неполной доказательной базе. Предыдущая оценка CRM: '+esc(p.ai_score??'—')+' (архивный расчёт).</p></section>';
}
async function rerunVision(id,btn){
 const p=standRows().find(x=>x.id===id);if(!p)return;
 if(!photo(p))return alert('Нет фото. Сначала загрузите или получите фотографию от продавца.');
 if(btn){btn.disabled=true;btn.textContent='Vision анализирует фото…'}
 try{
  const {data,error}=await dbclient().functions.invoke('crm-stands-vision-v236347',{body:{placement_id:id,force:true}});
  if(error||data?.ok!==true)throw error||new Error(data?.message||data?.error||'Vision не завершился');
  await refresh();await detail(id);
  alert('Vision завершён. Заключение Леры и оценка обновлены с учётом актуальных доказательств.');
 }catch(e){alert('Vision: '+str(e?.message||e))}
 finally{if(btn?.isConnected){btn.disabled=false;btn.textContent='✦ Проверить фото с ИИ'}}
}
async function openOriginalPhoto(path){
 if(!path)return;
 let paths=state.photoPaths.filter(Boolean);if(!paths.includes(path))paths=[path,...paths];
 el('s268-photo-overlay')?.remove();
 const node=document.createElement('div');node.id='s268-photo-overlay';node.className='s268-photo-overlay';
 node.innerHTML='<div class="s268-photo-toolbar"><small id="s268-photo-count">Фотография стенда · оригинал</small>'+
 '<div class="s268-buttongroup"><button data-s268-photo-prev>← До</button><button data-s268-photo-next>После →</button>'+
 '<button data-s268-zoom-out>−</button><button data-s268-zoom-reset>100%</button>'+
 '<button data-s268-zoom-in>+</button><button data-s268-photo-close>Закрыть ×</button></div></div>'+
 '<div class="s268-photo-stage" id="s268-photo-stage"><img alt="Оригинал фотографии стенда" id="s268-original" draggable="false"></div>'+
 '<div class="s268-photo-help">Колесо мыши / кнопки + − / движение пальцами для увеличения. Фотографии доступны только с учётной записью CRM.</div>';
 document.body.appendChild(node);
 const img=el('s268-original'),stage=el('s268-photo-stage'),pointers=new Map();
 let index=paths.indexOf(path),scale=1,offsetX=0,offsetY=0,lastDist=0,lastPoint=null;
 const update=()=>img.style.transform='translate('+offsetX+'px,'+offsetY+'px) scale('+scale+')';
 const resize=delta=>{const next=Math.min(8,Math.max(1,scale*delta));scale=next;if(scale===1){offsetX=0;offsetY=0}update()};
 const show=async()=>{
  const current=paths[index];scale=1;offsetX=0;offsetY=0;update();img.removeAttribute('src');
  el('s268-photo-count').textContent='Фото '+(index+1)+' из '+paths.length+' · оригинал';
  const signed=await dbclient().storage.from('stand-files').createSignedUrl(current,600);
  if(signed.error||!signed.data?.signedUrl){el('s268-photo-count').textContent='Ошибка доступа к оригиналу';return}
  if(node.isConnected)img.src=signed.data.signedUrl;
 };
 node.querySelector('[data-s268-photo-close]').onclick=()=>node.remove();
 node.querySelector('[data-s268-photo-prev]').onclick=()=>{index=(index+paths.length-1)%paths.length;show()};
 node.querySelector('[data-s268-photo-next]').onclick=()=>{index=(index+1)%paths.length;show()};
 node.querySelector('[data-s268-zoom-in]').onclick=()=>resize(1.35);
 node.querySelector('[data-s268-zoom-out]').onclick=()=>resize(1/1.35);
 node.querySelector('[data-s268-zoom-reset]').onclick=()=>{scale=1;offsetX=0;offsetY=0;update()};
 stage.addEventListener('wheel',e=>{e.preventDefault();resize(e.deltaY<0?1.2:1/1.2)},{passive:false});
 stage.addEventListener('pointerdown',e=>{stage.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});lastDist=0;lastPoint=null;stage.classList.add('dragging')});
 stage.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId))return;
  const before=pointers.get(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size>=2){
   const v=[...pointers.values()],dist=Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y);
   if(lastDist>0)resize(dist/lastDist);
   lastDist=dist;lastPoint=null;
  }else if(scale>1&&before){offsetX+=e.clientX-before.x;offsetY+=e.clientY-before.y;update()}
 });
 for(const ev of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(ev,e=>{
  pointers.delete(e.pointerId);lastDist=0;lastPoint=null;if(!pointers.size)stage.classList.remove('dragging');
 });
 show();
}
async function assetForm(id){
 const p=standRows().find(x=>x.id===id);if(!p||!['dfs','df'].includes(state.data?.actor_role))return;
 modal('Сверка имущества · '+p.client_name,'Не влияет на коммерческую оценку стенда',
 '<p class="s268-muted">Выбирайте только ОС, уже закреплённые в учёте за этим клиентом, типом стенда и менеджером. Свободное имущество и чужие ОС нельзя назначить автоматически.</p>'+
 '<div id="s268-asset-results">Ищу подходящие ОС…</div>',
 '<button class="s268-secondary" data-s268-detail="'+esc(id)+'">Назад к стенду</button>');
 try{
  const candidates=rows(await rpc('crm_stands_assets_find_v3',{p_placement_id:id}));
  const host=el('s268-asset-results');if(!host)return;
  host.innerHTML=candidates.length?candidates.map(x=>'<div class="s268-catalogrow"><b>'+esc(x.asset_code)+'</b>'+
   '<button class="s268-secondary" data-s268-asset-confirm="'+esc(x.id)+'">Привязать ОС</button></div>').join(''):
   '<p class="s268-verify-row">По реестру нет свободной подходящей записи, уже числящейся установленной у этого клиента. Требуется ручная инвентаризация руководителем — автоматически подменять имущество нельзя.</p>';
 }catch(e){el('s268-asset-results').textContent=e.message||String(e)}
}
async function assetConfirm(assetId){
 const id=state.detailId,p=standRows().find(x=>x.id===id);
 if(!p||!confirm('Подтвердить связь ОС с этим стендом?'))return;
 try{
  const saved=await rpc('crm_stands_asset_confirm_v3',{p_placement_id:id,p_asset_id:assetId});
  await refresh();await detail(id);alert('ОС '+saved.asset_code+' подтверждена. Запись внесена в аудит.');
 }catch(e){alert('Не удалось сверить ОС: '+str(e.message||e))}
}
function clientForm(id){
 const p=standRows().find(x=>x.id===id);if(!p)return;
 state.clientCandidate=null;
 modal('Юридическое лицо 1С · '+p.client_name,'Выбор из базы CRM · связь с физической ТТ',
 '<p class="s268-verify-row">Исходный ID торговой точки не меняем. Выбираем юрлицо только для корректного сопоставления отгрузок 1С. Связи не создаются автоматически.</p>'+
 '<p class="s268-muted">Сейчас привязано: '+esc(p.legal_client_name||'не подтверждено')+'</p>'+
 '<div class="s268-field"><label>Найти юрлицо по названию или коду</label>'+
 '<input class="s268-input" id="s268-client-query" placeholder="Введите от трёх символов"></div>'+
 '<div class="s268-buttongroup"><button class="s268-secondary" data-s268-client-find>Найти в клиентах</button></div>'+
 '<div id="s268-client-results" class="s268-cataloglist"></div>'+
 '<div id="s268-client-selected"></div>',
 '<button class="s268-primary" data-s268-client-save>Подтвердить связь</button>'+
 '<button class="s268-secondary" data-s268-detail="'+esc(id)+'">Назад</button>');
 el('s268-client-query')?.focus();
}
async function findClients(){
 const p=standRows().find(x=>x.id===state.detailId),host=el('s268-client-results');
 if(!p||!host)return;
 const q=str(el('s268-client-query')?.value).trim();
 if(q.length<3){host.textContent='Введите минимум три символа.';return}
 host.textContent='Проверяю базу клиентов…';
 try{
  const clients=rows(await rpc('crm_stands_client_find_v3',{p_placement_id:p.id,p_query:q}));
  host.innerHTML=clients.length?clients.map(x=>'<div class="s268-catalogrow"><div><b>'+esc(x.name)+'</b><small>'+
   esc(x.code||x.id)+' · '+esc(x.manager_name||'')+' · история 1С: '+esc(x.history_rows)+' строк</small></div>'+
   '<button class="s268-secondary" data-s268-client-pick="'+esc(x.id)+'">Выбрать</button></div>').join(''):'<p class="s268-muted">Совпадений для вашей роли не найдено.</p>';
  state.clientOptions=clients;
 }catch(e){host.textContent='Поиск клиента: '+str(e.message||e)}
}
async function chooseClient(id){
 const p=standRows().find(x=>x.id===state.detailId);
 const c=rows(state.clientOptions).find(x=>x.id===id);
 if(!p||!c)return;
 state.clientCandidate=c;
 const host=el('s268-client-selected');host.innerHTML='<p class="s268-verify-row"><b>Выбрано юрлицо:</b> '+esc(c.name)+'</p>'+
 '<label>Торговая точка (если есть подтверждённая связь)</label><select class="s268-input" id="s268-point-select"><option value="">ТТ не подтверждена — оставить пустой</option></select>';
 try{
  const points=rows(await rpc('crm_stands_points_find_v3',{p_placement_id:p.id,p_legal_client_id:c.id}));
  const sel=el('s268-point-select');if(sel)sel.innerHTML+=[...points].map(x=>
   '<option value="'+esc(x.id)+'">'+esc([x.city,x.address].filter(Boolean).join(', '))+'</option>').join('');
 }catch(e){host.innerHTML+='<p class="s268-muted">Точки недоступны: '+esc(e.message||e)+'</p>'}
}
async function saveClient(){
 const p=standRows().find(x=>x.id===state.detailId),c=state.clientCandidate;
 if(!p||!c)return alert('Сначала выберите юридическое лицо из базы клиентов.');
 if(!confirm('Подтвердить связь стенда с юридическим лицом «'+c.name+'» для анализа 1С?'))return;
 try{
  await rpc('crm_stands_client_bind_v3',{p_placement_id:p.id,p_legal_client_id:c.id,p_point_id:el('s268-point-select')?.value||null});
  await refresh();await detail(p.id);alert('Связь подтверждена. Исходный клиент и история стенда сохранены.');
 }catch(e){alert('Ошибка привязки: '+str(e.message||e))}
}

function photoForm(id){
 const p=standRows().find(x=>x.id===id);if(!p)return;
 modal('Актуальное фото нашего стенда',p.client_name+' · '+(p.asset_code||'ОС не сверено'),
 '<p class="s268-muted">Маршрут и GPS не обязательны. Продавец может прислать фотографию, а менеджер загрузит её с указанием источника. SKU не изменяются.</p>'+
 '<div style="margin:12px 0"><label>Фотография целого стенда</label>'+
 '<input class="s268-input" id="s268-file" type="file" accept="image/jpeg,image/png,image/webp"></div>'+
 '<div style="margin:12px 0"><label>Источник</label><select class="s268-input" id="s268-origin"><option value="manager">МПП сделал фото</option><option value="seller">Прислал продавец</option></select></div>'+
 '<div style="margin:12px 0"><label>От кого фото / комментарий</label><textarea class="s268-input" id="s268-note" rows="3" placeholder="Для продавца укажите от кого и дату получения"></textarea></div>',
 '<button class="s268-primary" data-s268-upload="'+esc(id)+'">Сохранить и запустить Vision</button>'+
 '<button class="s268-secondary" data-s268-close>Отмена</button>');
}
async function upload(id,btn){
 const file=el('s268-file')?.files?.[0],origin=el('s268-origin')?.value,note=str(el('s268-note')?.value).trim();
 if(!file)return alert('Выберите новое фото');
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5500000)return alert('JPEG, PNG или WEBP, до 5,5 МБ');
 if(origin==='seller'&&note.length<5)return alert('Укажите, кто прислал фото и когда');
 btn.disabled=true;btn.textContent='Сохраняю…';
 try{
  const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
  const path='control/'+id+'/'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.'+ext;
  const response=await dbclient().storage.from('stand-files').upload(path,file,{upsert:false,contentType:file.type});
  if(response.error)throw response.error;
  await rpc('crm_stands_photo_control_v1',{p_placement_id:id,p_photo_path:path,p_origin:origin,p_source_note:note||null});
  btn.textContent='Vision анализирует…';
  const vision=await dbclient().functions.invoke('crm-stands-vision-v236347',{body:{placement_id:id,force:true}});
  el('s268-overlay')?.remove();await refresh();window.RESANTA_STANDS_V236367?.reload?.();
  alert(vision.error||!vision.data?.ok?'Фото сохранено. Vision пока не завершён, его можно повторить. SKU не изменены.':
   'Фото сохранено и проверено Vision. Исходные SKU остались без изменений.');
 }catch(e){alert('Ошибка сохранения фото: '+str(e?.message||e))}
 finally{btn.disabled=false;btn.textContent='Сохранить и запустить Vision'}
}
async function request(id){
 const p=standRows().find(x=>x.id===id);if(!p)return;
 const message='Здравствуйте! Просим прислать актуальную фотографию нашего стенда '+(p.stand_brand||'РЕСАНТА')+
 ' в вашей торговой точке. В кадре нужен стенд целиком, с видимыми товарами и фирменным оформлением. Спасибо!';
 try{
  await rpc('crm_stands_photo_request_v1',{p_placement_id:id,p_request_to:'seller',p_note:'Актуальное фото стенда от продавца'});
  await refresh();
  try{await navigator.clipboard.writeText(message);alert('Запрос зарегистрирован. Текст скопирован — отправьте продавцу в мессенджере.')}
  catch(_){prompt('Запрос зарегистрирован. Скопируйте текст:',message)}
 }catch(e){alert('Ошибка запроса: '+str(e?.message||e))}
}
function skuForm(index){
 const p=standRows().find(x=>x.id===state.detailId),item=state.skuRows[index];
 if(!p||!item)return;
 state.matchRow=item;
 state.selectedSkus=new Map(rows(item.effective_skus).filter(Boolean).map(s=>[str(s),str(s)]));
 const expected=Number(item.expected)||1;
 modal('Артикулы стенда · '+p.client_name,'Исходная запись: '+item.raw_sku,
 '<p class="s268-verify-row">Добавляйте несколько точных SKU прямо здесь — без перехода в старый раздел. Исходная запись сохраняется, все изменения фиксируются в истории.</p>'+
 '<div id="s268-selected-summary"></div>'+
 '<label>Найти артикул или модель в каталоге</label>'+
 '<input id="s268-catalog-query" class="s268-input" placeholder="Например: УШМ, ВИХРЬ, 73/12…">'+
 '<div class="s268-buttongroup"><button class="s268-secondary" data-s268-find>Найти в каталоге</button></div>'+
 '<div id="s268-catalog-list" class="s268-cataloglist">Введите название, модель или артикул. Можно искать повторно — выбранные позиции останутся в списке.</div>',
 '<button class="s268-primary" data-s268-save-group>Сохранить выбранные SKU</button>'+
 '<button class="s268-secondary" data-s268-detail="'+esc(p.id)+'">Назад</button>');
 renderSelectedSku();
 el('s268-catalog-query')?.focus();
}
function renderSelectedSku(){
 const host=el('s268-selected-summary');if(!host)return;
 const expected=Math.max(1,Number(state.matchRow?.expected)||1),got=state.selectedSkus.size;
 host.innerHTML='<div class="s268-verify-row"><b>Выбрано '+got+' из '+expected+
 ' заявленных SKU.</b> '+(got<expected?'Можно сохранить частично, но оценка продаж останется предварительной до полной сверки.':'Группа готова к подтверждению.')+'</div>'+
 '<div class="s268-sku-selected">'+[...state.selectedSkus.keys()].map(s=>
 '<span class="s268-sku-tag">'+esc(s)+' <button data-s268-drop="'+esc(s)+'" aria-label="Удалить SKU">×</button></span>').join('')+'</div>';
}
async function findCatalog(){
 const p=standRows().find(x=>x.id===state.detailId),host=el('s268-catalog-list');
 if(!p||!host)return;
 const q=str(el('s268-catalog-query')?.value).trim();
 if(q.length<3){host.textContent='Введите минимум три символа.';return}
 host.textContent='Ищу точные позиции в каталоге…';
 try{
  const result=await rpc('crm_stands_catalog_v236350',{p_placement_id:p.id,p_category:null,
   p_subgroup:null,p_search:q,p_brand_only:false,p_mo2_only:false,p_limit:80});
  const options=rows(result?.rows).filter(x=>x.sku);
  state.catalogOptions=options;
  host.innerHTML=options.length?options.map(x=>'<div class="s268-catalogrow"><div><b>'+
   esc(x.product_name||x.sku)+'</b><small>Артикул: '+esc(x.sku)+' · '+esc(x.category||'')+'</small></div>'+
   '<button class="s268-secondary" data-s268-add="'+esc(x.sku)+'">'+
   (state.selectedSkus.has(x.sku)?'Добавлено ✓':'Добавить +')+'</button></div>').join(''):
   '<p class="s268-muted">Ничего не найдено. Уточните модель по фото или у продавца.</p>';
 }catch(e){host.textContent='Каталог: '+str(e.message||e)}
}
function selectCatalogSku(sku){
 const row=rows(state.catalogOptions).find(x=>str(x.sku)===sku);
 if(!row)return;
 if(state.selectedSkus.size>=100&&!state.selectedSkus.has(sku))return alert('За один раз можно сверить не более 100 SKU.');
 state.selectedSkus.set(sku,row.product_name||sku);
 renderSelectedSku();
 const button=[...document.querySelectorAll('[data-s268-add]')].find(x=>x.dataset.s268Add===sku);
 if(button)button.textContent='Добавлено ✓';
}
async function saveSkuGroup(btn){
 const p=standRows().find(x=>x.id===state.detailId),item=state.matchRow;
 if(!p||!item)return;
 const values=[...state.selectedSkus.keys()];
 if(!values.length)return alert('Выберите хотя бы один артикул из каталога.');
 const target=Number(item.expected)||1;
 if(values.length<target&&!confirm('Сверено '+values.length+' из '+target+' позиций. Сохранить как частичную сверку?'))return;
 btn.disabled=true;btn.textContent='Проверяю артикулы…';
 try{
  const out=await rpc('crm_stands_multi_sku_save_v3',{p_placement_id:p.id,p_raw_sku:item.raw_sku,p_catalog_skus:values});
  await refresh();await detail(p.id);
  alert('Сохранено '+out.selected+' SKU. Исходная запись осталась в истории. '+
   (out.complete?'Сверка группы завершена.':'Остальные SKU ещё нужно уточнить.'));
 }catch(e){alert('Не удалось сохранить SKU: '+str(e.message||e));btn.disabled=false;btn.textContent='Сохранить выбранные SKU'}
}

document.addEventListener('click',e=>{
 const close=e.target.closest?.('[data-s268-close]');if(close){el('s268-overlay')?.remove();return}
 const view=e.target.closest?.('[data-s268-view]');if(view){state.view=view.dataset.s268View;paint();return}
 const refreshBtn=e.target.closest?.('[data-s268-refresh]');if(refreshBtn){refresh();return}
 const link=e.target.closest?.('[data-s268-detail]');if(link){detail(link.dataset.s268Detail);return}
 const photoBtn=e.target.closest?.('[data-s268-photo]');if(photoBtn){photoForm(photoBtn.dataset.s268Photo);return}
 const requestBtn=e.target.closest?.('[data-s268-request]');if(requestBtn){request(requestBtn.dataset.s268Request);return}
 const uploadBtn=e.target.closest?.('[data-s268-upload]');if(uploadBtn){upload(uploadBtn.dataset.s268Upload,uploadBtn);return}
 const match=e.target.closest?.('[data-s268-match]');if(match){skuForm(Number(match.dataset.s268Match));return}
 const find=e.target.closest?.('[data-s268-find]');if(find){findCatalog();return}
 const full=e.target.closest?.('[data-s268-full]');if(full){openOriginalPhoto(full.dataset.s268Full);return}
 const v=e.target.closest?.('[data-s268-vision]');if(v){rerunVision(v.dataset.s268Vision,v);return}
 const legal=e.target.closest?.('[data-s268-client]');if(legal){clientForm(legal.dataset.s268Client);return}
 const cf=e.target.closest?.('[data-s268-client-find]');if(cf){findClients();return}
 const choice=e.target.closest?.('[data-s268-client-pick]');if(choice){chooseClient(choice.dataset.s268ClientPick);return}
 if(e.target.closest?.('[data-s268-client-save]')){saveClient();return}
 const ar=e.target.closest?.('[data-s268-asset]');if(ar){assetForm(ar.dataset.s268Asset);return}
 const ac=e.target.closest?.('[data-s268-asset-confirm]');if(ac){assetConfirm(ac.dataset.s268AssetConfirm);return}
 const add=e.target.closest?.('[data-s268-add]');if(add){selectCatalogSku(add.dataset.s268Add);return}
 const drop=e.target.closest?.('[data-s268-drop]');if(drop){state.selectedSkus.delete(drop.dataset.s268Drop);renderSelectedSku();return}
 const saveGroup=e.target.closest?.('[data-s268-save-group]');if(saveGroup){saveSkuGroup(saveGroup);return}
 if(e.target.closest?.('[data-s268-search]')){state.search=str(el('s268-search')?.value);paint();return}
},true);
document.addEventListener('change',e=>{
 const input=e.target.closest?.('[data-s268-select]');
 if(input){state[input.dataset.s268Select]=input.value;paint()}
},true);
document.addEventListener('keydown',e=>{
 if(e.key==='Enter'&&e.target?.id==='s268-search'){e.preventDefault();state.search=e.target.value;paint()}
 if(e.key==='Enter'&&e.target?.id==='s268-catalog-query'){e.preventDefault();findCatalog()}
 if((e.key==='Enter'||e.key===' ')&&e.target?.matches?.('[data-s268-detail]')){e.preventDefault();detail(e.target.dataset.s268Detail)}
 if(e.key==='Enter'&&e.target?.id==='s268-client-query'){e.preventDefault();findClients()}
 if(e.key==='Escape'){if(el('s268-photo-overlay')){el('s268-photo-overlay').remove();e.stopImmediatePropagation();return}el('s268-overlay')?.remove();}
},true);
function render(){
 attachCSS();if(!el('st360-root'))return;
 if(!state.data&&!state.loading&&!state.error)refresh();else paint();
}
window.RESANTA_STANDS_360_V1=Object.freeze({render,refresh,version:'stands360-feedback-v3',
 gpsRequired:false, skuVerified:true, originalDataUntouched:true});
if(el('st360-root'))render();
})();
