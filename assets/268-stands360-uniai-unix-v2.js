/* РЕСАНТА CRM · Стенды 360° Uni AI/Uni X · директорский экран v2.
 * Owned asset decisions, exact SKU checks, photo without GPS. No original records overwritten.
 */
(function(){
'use strict';
if(window.RESANTA_STANDS_360_V1)return;
const state={data:null,loading:false,error:'',view:'overview',filter:'all',manager:'all',brand:'all',
 search:'',photos:new Map(),detailId:null,skuRows:[],matchRow:null};
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
 asset_check:['Сверить ОС','bad','Подтвердить инвентарный номер стенда и принадлежность оборудования.'],
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
 if(!p.asset_id)found.push('Не сверено с ОС');
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
 if(!p.asset_id)n+=40;
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
 '<th>Последнее фото</th><th>Отгрузки SKU · 6 мес.</th><th>Достоверность</th><th>Рекомендация Леры</th></tr></thead><tbody>'+
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
 try{state.data=await rpc('crm_stands_360_v2',{p_limit:150});state.error=''}
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
 return '<div class="s268-photos">'+pic.map((x,i)=>'<div class="s268-photo"><b>'+
 (i?'Предыдущее фото':'Актуальное фото')+'</b><img alt="Фото стенда" data-s268-path="'+esc(x.storage_path)+'">'+
 '<small>'+date(x.captured_at)+'</small></div>').join('')+
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
 '<button class="s268-secondary" data-s268-close>Закрыть</button>');
 try{
  const [s,ph]=await Promise.all([
   rpc('crm_stands_360_skus_v2',{p_placement_id:id}),
   dbclient().from('stand_photos_v236346').select('storage_path,captured_at')
    .eq('placement_id',id).order('captured_at',{ascending:false}).limit(2)
  ]);
  if(ph.error)throw ph.error;
  const host=el('s268-modalbody');if(!host)return;
  state.skuRows=rows(s?.rows);
  const metric=[
   ['Наше оборудование',p.asset_code||'Не сверено'],
   ['Фото',photo(p)?p.photo_days+' дн. назад':'Нет фото'],
   ['Подтверждённые SKU',p.validated_skus+' / '+p.registered_skus],
   ['Отгрузки SKU · 6 мес.',dataOk(p)?money(p.ship_6m):'Не сопоставлено']];
  const rowsHTML=state.skuRows.map((x,i)=>{
   const isValid=x.sku_state!=='unresolved';
   const multi=/[2-9][0-9]*\s*скю/i.test(str(x.raw_sku));
   return '<tr><td><b>'+esc(x.raw_sku)+'</b>'+
    (x.mapped_sku?'<div class="s268-muted">↳ '+esc(x.mapped_sku)+'</div>':'')+'</td>'+
    '<td><span class="s268-pill '+(isValid?'good':'warn')+'">'+
    esc(isValid?'Артикул подтверждён':multi?'Список из нескольких SKU':'SKU не определён')+'</span></td>'+
    '<td>'+esc(x.effective_sku?money(x.ship_6m):'Неизвестно')+'</td>'+
    '<td>'+(isValid&&x.sku_state==='exact_catalog'?'✓':
    '<button class="s268-secondary" data-s268-match="'+i+'">'+
    (multi?'Указать поштучно':x.sku_state==='verified_mapping'?'Изменить':'Уточнить SKU')+'</button>')+'</td></tr>';
  }).join('');
  host.innerHTML='<div class="s268-detailkpis">'+metric.map(x=>'<div><small>'+esc(x[0])+'</small><b>'+esc(x[1])+'</b></div>').join('')+'</div>'+
   '<div class="s268-detailcols"><section class="s268-detailsection"><h3>📷 Наш стенд · до / после</h3>'+
   photoHTML(p,ph.data)+
   '<p class="s268-muted">Источник фото: '+esc(p.photo_origin==='seller'?'продавец':p.photo_origin==='manager'?'МПП':'не установлен для старых фото')+
   '. GPS не требуется.</p>'+
   '<details><summary style="font-size:11px;cursor:pointer;font-weight:750">Что Vision обнаружил?</summary>'+
   '<p class="s268-muted">'+esc(p.vision_summary||'Актуальное заключение Vision отсутствует')+'</p></details></section>'+
   '<section class="s268-detailsection"><h3>▤ Продажи и артикулы</h3>'+
   '<div class="s268-detailkpis" style="grid-template-columns:1fr 1fr">'+
   '<div><small>Отгрузки по SKU стенда</small><b>'+esc(dataOk(p)?money(p.ship_6m):'Не сопоставлено')+'</b></div>'+
   '<div><small>Весь клиент · 6 мес.</small><b>'+esc(p.client_history_rows?money(p.client_ship_6m):'Нет данных по ID')+'</b></div></div>'+
   '<p class="s268-muted">Общий оборот клиента — справочно, не является продажами со стенда.</p>'+
   '<div class="s268-skus"><table><thead><tr><th>Запись в стенде</th><th>Достоверность</th><th>Отгрузки · 6 мес.</th><th>Действие</th></tr></thead><tbody>'+
   rowsHTML+'</tbody></table></div></section></div>'+
   explain(p)+
   '<p class="s268-muted">Для движения ОС, договора и истории установки используйте меню «Учёт и документы». Существующие документы не менялись.</p>';
  loadThumbs();
 }catch(e){const host=el('s268-modalbody');if(host)host.innerHTML='<div class="s268-ai">Ошибка открытия: '+esc(e?.message||e)+'</div>'}
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
 if(/[2-9][0-9]*\s*скю/i.test(str(item.raw_sku))){
  alert('В записи перечислены несколько товаров. Нужно добавить точные артикулы поштучно через «Учёт и документы → Действующие / ОС». Один артикул не заменяет несколько SKU.');
  return;
 }
 state.matchRow=item;
 modal('Уточнить артикул · '+p.client_name,'Исходная запись: '+item.raw_sku,
 '<p class="s268-muted">Выберите точную модель из каталога. Оригинальная запись сохранится. После подтверждения обновятся отгрузки 1С.</p>'+
 '<input id="s268-catalog-query" class="s268-input" placeholder="Поиск по модели, названию или артикулу">'+
 '<div class="s268-buttongroup"><button class="s268-primary" data-s268-find>Поиск по каталогу</button></div>'+
 '<div class="s268-cataloglist" id="s268-catalog-list">Введите не менее трёх символов. Если модель по фото не читается, запросите у продавца крупный план.</div>',
 '<button class="s268-secondary" data-s268-detail="'+esc(p.id)+'">Назад к карточке</button>');
 el('s268-catalog-query')?.focus();
}
async function findCatalog(){
 const p=standRows().find(x=>x.id===state.detailId),host=el('s268-catalog-list');
 if(!p||!host)return;
 const term=str(el('s268-catalog-query')?.value).trim();
 if(term.length<3){host.textContent='Введите минимум три символа.';return}
 host.textContent='Ищу по каталогу РЕСАНТА…';
 try{
  const result=await rpc('crm_stands_catalog_v236350',{p_placement_id:p.id,p_category:null,p_subgroup:null,
   p_search:term,p_brand_only:false,p_mo2_only:false,p_limit:80});
  const candidates=rows(result?.rows).filter(x=>x.sku);
  host.innerHTML=candidates.length?candidates.map(x=>'<div class="s268-catalogrow"><div><b>'+
   esc(x.product_name||x.sku)+'</b><small>SKU: '+esc(x.sku)+' · '+esc(x.category||'')+'</small></div>'+
   '<button class="s268-secondary" data-s268-apply="'+esc(x.sku)+'">Подтвердить</button></div>').join(''):
   '<div class="s268-muted">Не найдено. Проверьте название и полноту каталога.</div>';
 }catch(e){host.textContent='Каталог недоступен: '+str(e?.message||e)}
}
async function applySku(sku,btn){
 const p=standRows().find(x=>x.id===state.detailId),item=state.matchRow;if(!p||!item)return;
 btn.disabled=true;btn.textContent='Сверяю…';
 try{
  await rpc('crm_stands_sku_link_v2',{p_placement_id:p.id,p_raw_sku:item.raw_sku,p_catalog_sku:sku});
  await refresh();await detail(p.id);
 }catch(e){alert('Сверка не сохранена: '+str(e?.message||e));btn.disabled=false;btn.textContent='Подтвердить'}
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
 const apply=e.target.closest?.('[data-s268-apply]');if(apply){applySku(apply.dataset.s268Apply,apply);return}
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
 if(e.key==='Escape')el('s268-overlay')?.remove();
},true);
function render(){
 attachCSS();if(!el('st360-root'))return;
 if(!state.data&&!state.loading&&!state.error)refresh();else paint();
}
window.RESANTA_STANDS_360_V1=Object.freeze({render,refresh,version:'stands360-uni-ai-v2',
 gpsRequired:false, skuVerified:true, originalDataUntouched:true});
if(el('st360-root'))render();
})();
