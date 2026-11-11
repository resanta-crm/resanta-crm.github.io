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
