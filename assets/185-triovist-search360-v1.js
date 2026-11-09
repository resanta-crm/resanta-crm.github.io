/* RESANTA CRM · Triovist / 21vek Search360 v1.
 * Isolated search requests, exact deep positions and last *negative* reviews.
 * Read-only current cards/TOP data; no production parser or task mutations.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_SEARCH360_V1)return;
const V='20261109-1',ROOT_ID='triovist-search360-v1',MAX_RESULTS=600,TTL=120000;
const state={requests:[],selected:null,rows:[],negatives:[],loadedAt:0,busy:false,filter:'ours',error:'',sending:false};
let refreshFlight=null,lastRole='';
function dbx(){try{return typeof db!=='undefined'?db:(window.db||null)}catch(_){return window.db||null}}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const dt=v=>{if(!v)return'—';const x=new Date(v);return Number.isFinite(x.getTime())?x.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}):String(v).slice(0,19)};
function profile(){try{return typeof currentProfile!=='undefined'?currentProfile:window.currentProfile}catch(_){return window.currentProfile||null}}
function allowed(){const p=profile();return !!p&&(String(p.role||'')==='boss'||String(p.access_scope||'')==='triovist')}
function active(){return !!document.querySelector('#tr14-shell [data-tr14="cards"].on')}
function currentRequest(){return state.requests.find(x=>x.id===state.selected)||state.requests[0]||null}
function productRow(r){
 const hasSku=!!String(r.sku||'').trim();
 const url=String(r.product_url||'');
 const validUrl=/^https:\/\/(?:www\.)?21vek\.by\//i.test(url);
 return '<div class="ts360-product"><div class="ts360-position">№'+esc(r.position??'—')+'</div><div class="ts360-product-name"><b>'+esc(r.product_name||'Товар 21vek')+'</b><small>'+esc(r.brand||'Бренд не указан')+(hasSku?' · Наш SKU '+esc(r.sku):'')+'</small></div>'
  +(hasSku?'<span class="ts360-ours">Наш товар</span>':'')+
  (validUrl?'<a target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">Карточка 21vek</a>':'')+'</div>';
}
function negativesHtml(){
 const list=state.negatives;
 if(!list.length)return '<div class="ts360-empty">Негативные отзывы в доступных публичных данных не найдены.</div>';
 return list.slice(0,40).map(x=>{
   const url=String(x.product_url||'');
   const good=/^https:\/\/(?:www\.)?21vek\.by\//i.test(url);
   return '<div class="ts360-negative"><div class="ts360-neg-head"><b>'+esc(x.product_name||x.sku||'Карточка 21vek')+'</b><span class="'+(x.last_negative_answered?'ts360-done':'ts360-alert')+'">'+(x.last_negative_answered?'Есть ответ':'Без ответа')+'</span></div>'
    +'<div class="ts360-muted">SKU '+esc(x.sku||'—')+' · '+esc(x.last_negative_date||'—')+' · оценка '+esc(x.last_negative_rating||'—')+'/5</div>'
    +'<div class="ts360-review">'+esc(x.last_negative_text||'Текст недоступен в публичных данных')+'</div>'
    +'<div class="ts360-muted">Последний негативный среди доступных публичных отзывов · снимок '+esc(dt(x.source_observed_at))+'</div>'
    +(good?'<a target="_blank" rel="noopener noreferrer" href="'+esc(url)+'">Открыть карточку</a>':'')+'</div>';
 }).join('');
}
function statusText(q){
 if(!q)return'Введите поисковую фразу для глубокой проверки.';
 const names={queued:'Запрос в очереди',running:'Проверка выполняется',complete:'Проверка завершена',partial:'Частично проверено',failed:'Проверка не удалась'};
 return (names[q.status]||esc(q.status))+' · '+esc(dt(q.requested_at));
}
function suggestionText(q){
 if(!q)return'';
 if(q.suggestion_status==='first_text_suggestion')
   return 'Первая текстовая подсказка 21vek: '+esc(q.suggestion_text)+' · по ней проверен листинг.';
 if(q.status==='queued'||q.status==='running')return 'Получаем первую поисковую подсказку 21vek…';
 return 'Первая подсказка 21vek не подтверждена. Поиск выполнен по исходной фразе; это обозначено в результате.';
}
function summary(){
 const req=currentRequest();
 const own=state.rows.filter(r=>r.sku).length;
 const bad=state.negatives.filter(n=>!n.last_negative_answered).length;
 const found=state.rows.length;
 const depth=req?.pages_checked?req.pages_checked*60:0;
 return [['Товаров в выдаче',found],['Наших SKU',own],['Негатив без ответа',bad],['Проверено позиций',depth||'—']]
   .map(([label,value])=>'<div class="ts360-kpi"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>').join('');
}
function render(){
 const root=document.getElementById(ROOT_ID);if(!root)return;
 const q=currentRequest(),filter=state.filter,records=filter==='ours'?state.rows.filter(r=>r.sku):state.rows;
 const shown=records.slice(0,80);
 const locked=state.sending||!allowed();
 root.innerHTML='<div class="ts360-header"><div><h3>Поиск и листинг 21vek 360°</h3><div class="ts360-muted">Точное место в поиске · последняя отрицательная оценка · отдельный безопасный сбор</div></div><button type="button" data-ts360-refresh class="ts360-button">Обновить данные</button></div>'
  +'<div class="ts360-kpis">'+summary()+'</div>'
  +'<form data-ts360-form class="ts360-form"><label for="ts360-phrase">Ключевая фраза</label><div class="ts360-formrow"><input type="search" id="ts360-phrase" maxlength="120" minlength="2" required placeholder="Например: сварочный инвертор" autocomplete="off"><button type="submit" class="ts360-primary" '+(locked?'disabled':'')+'>Проверить листинг</button></div>'
  +'<div class="ts360-muted">Проверяем реальный порядок сортировки 21vek и до первых 600 позиций. Запросы обрабатываются в безопасной очереди.</div></form>'
  +(state.error?'<div class="ts360-error">'+esc(state.error)+'</div>':'')
  +'<div class="ts360-query-panel"><div class="ts360-querybar"><div><b>'+esc(statusText(q))+'</b><div class="ts360-muted">'+esc(q?.query_text||'Поисковый запрос пока не выбран')+'</div></div><select data-ts360-history aria-label="История запросов">'
  +state.requests.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===state.selected?'selected':'')+'>'+esc(x.query_text)+' · '+esc(x.status)+'</option>').join('')
  +'</select></div>'
  +(q?'<div class="ts360-note">'+suggestionText(q)+'</div><div class="ts360-muted">Фактический запрос: '+esc(q.resolved_query||'—')+' · найдено 21vek: '+esc(q.search_total??'—')+' · проверено страниц: '+esc(q.pages_checked??0)
  +(q.error_text?' · Ошибка: '+esc(q.error_text):'')+'</div>':'')
  +'<div class="ts360-filters"><button type="button" data-ts360-filter="ours" class="'+(filter==='ours'?'is-active':'')+'">Наши SKU</button><button type="button" data-ts360-filter="all" class="'+(filter==='all'?'is-active':'')+'">Вся выдача</button></div>'
  +(!q?'<div class="ts360-empty">Введите поисковую фразу и отправьте запрос.</div>':q.status==='queued'||q.status==='running'?'<div class="ts360-empty">Сбор выполняется отдельно. Данные появятся после завершения проверки.</div>':
   shown.length?'<div class="ts360-list">'+shown.map(productRow).join('')+'</div>'+'<div class="ts360-muted">Показано '+shown.length+' из '+records.length+'. Номера — позиции только в проверенном листинге. Не найдено в первых '+esc(q.pages_checked*60||0)+' не означает отсутствие товара на 21vek.</div>'
   :'<div class="ts360-empty">В проверенных результатах '+(filter==='ours'?'наши SKU не обнаружены':'товары не получены')+'. Это не означает, что товара нет в каталоге.</div>')
  +'</div>'
  +'<div class="ts360-neg-title"><b>Последние отрицательные отзывы</b><span class="ts360-muted">Сортировка по дате · оценка 1–3 звезды</span></div>'
  +'<div class="ts360-negatives">'+negativesHtml()+'</div>';
 root.querySelector('[data-ts360-refresh]')?.addEventListener('click',()=>load(true));
 root.querySelector('[data-ts360-form]')?.addEventListener('submit',submit);
 root.querySelector('[data-ts360-history]')?.addEventListener('change',e=>{state.selected=e.target.value;loadResults(state.selected)});
 root.querySelectorAll('[data-ts360-filter]').forEach(b=>b.addEventListener('click',()=>{state.filter=b.dataset.ts360Filter;render()}));
}
function mount(){
 if(!allowed()||!active())return false;
 const card=document.getElementById('tri21-card');
 if(!card)return false;
 let root=document.getElementById(ROOT_ID);
 if(!root){
   root=document.createElement('section');root.id=ROOT_ID;
   root.setAttribute('aria-label','Поиск и листинг 21vek 360');
   root.innerHTML='<div class="ts360-empty">Загружаю поиск и отзывы 21vek…</div>';
   card.insertBefore(root,card.querySelector('#tri21-meta')||card.firstChild);
 }
 const cssId='ts360-style';
 if(!document.getElementById(cssId)){
   const x=document.createElement('style');x.id=cssId;
   x.textContent=String.raw`
   #triovist-search360-v1{border:1px solid #d9e4ef;border-radius:14px;padding:15px;margin:12px 0;background:#fff;color:#14283c}
   #triovist-search360-v1 *{box-sizing:border-box}
   #triovist-search360-v1 .ts360-header,#triovist-search360-v1 .ts360-neg-title,#triovist-search360-v1 .ts360-querybar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
   #triovist-search360-v1 h3{margin:0 0 5px;font-size:19px}#triovist-search360-v1 .ts360-muted{font-size:11px;color:#64748b;line-height:1.5}
   #triovist-search360-v1 .ts360-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:13px 0}
   #triovist-search360-v1 .ts360-kpi{background:#f6f9fd;border:1px solid #dce7f2;border-radius:11px;padding:13px}#triovist-search360-v1 .ts360-kpi span{font-size:10px;color:#667b8f;display:block}#triovist-search360-v1 .ts360-kpi strong{font-size:24px;margin-top:4px;display:block}
   #triovist-search360-v1 .ts360-form{display:block;padding:12px;background:#f8fbff;border:1px solid #dce6f1;border-radius:11px}#triovist-search360-v1 .ts360-form label{font-weight:700;font-size:12px;display:block;margin-bottom:6px}
   #triovist-search360-v1 .ts360-formrow{display:flex;gap:8px;margin-bottom:5px}
   #triovist-search360-v1 input,#triovist-search360-v1 select{min-height:38px;border:1px solid #cbd5e1;padding:8px 11px;border-radius:8px;background:#fff;min-width:0}
   #triovist-search360-v1 .ts360-formrow input{flex:1}
   #triovist-search360-v1 button{border-radius:8px;border:1px solid #b7cbe0;padding:8px 12px;font-weight:650;font-size:12px;cursor:pointer;background:white;color:#185fa5;min-height:36px}
   #triovist-search360-v1 .ts360-primary{background:#185fa5;color:#fff;border-color:#185fa5}#triovist-search360-v1 button:disabled{opacity:.55;cursor:not-allowed}
   #triovist-search360-v1 .ts360-query-panel{border:1px solid #dce6f1;border-radius:11px;padding:12px;margin-top:12px}#triovist-search360-v1 .ts360-query-panel select{max-width:310px}
   #triovist-search360-v1 .ts360-note{background:#eef6ff;border-radius:8px;padding:10px;margin:10px 0;font-size:12px;color:#164a78}
   #triovist-search360-v1 .ts360-filters{display:flex;gap:7px;margin:10px 0}#triovist-search360-v1 .ts360-filters .is-active{background:#185fa5;color:#fff}
   #triovist-search360-v1 .ts360-list{max-height:370px;overflow:auto;border-top:1px solid #eef2f7}
   #triovist-search360-v1 .ts360-product{display:flex;align-items:center;gap:10px;padding:9px 3px;border-bottom:1px solid #edf1f5}
   #triovist-search360-v1 .ts360-position{font-size:17px;font-weight:800;color:#0c447c;min-width:60px}
   #triovist-search360-v1 .ts360-product-name{flex:1;min-width:0}#triovist-search360-v1 .ts360-product-name b{display:block;font-size:12px}#triovist-search360-v1 .ts360-product-name small{display:block;color:#64748b;font-size:10px}
   #triovist-search360-v1 .ts360-ours{font-size:10px;padding:4px 7px;border:1px solid #a9dfc3;border-radius:6px;background:#f0fff6;color:#116440;white-space:nowrap}
   #triovist-search360-v1 a{font-size:11px;color:#185fa5;font-weight:650}
   #triovist-search360-v1 .ts360-neg-title{margin:15px 0 9px}
   #triovist-search360-v1 .ts360-negatives{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
   #triovist-search360-v1 .ts360-negative{padding:11px;border:1px solid #f2d3d3;border-radius:10px;background:#fffcfa;min-width:0}
   #triovist-search360-v1 .ts360-neg-head{display:flex;justify-content:space-between;gap:6px;align-items:start;font-size:12px}#triovist-search360-v1 .ts360-review{font-size:12px;line-height:1.5;margin:7px 0;overflow-wrap:anywhere}
   #triovist-search360-v1 .ts360-done{color:#166534;font-size:10px;white-space:nowrap}#triovist-search360-v1 .ts360-alert{color:#b91c1c;font-size:10px;white-space:nowrap}
   #triovist-search360-v1 .ts360-empty{padding:13px;font-size:12px;color:#64748b;background:#f8fafc;border-radius:8px}
   #triovist-search360-v1 .ts360-error{padding:10px;background:#fff1f1;color:#a32929;border-radius:8px;margin:8px 0}
   @media(max-width:780px){#triovist-search360-v1 .ts360-kpis{grid-template-columns:repeat(2,1fr)}#triovist-search360-v1 .ts360-negatives{grid-template-columns:1fr}#triovist-search360-v1 .ts360-formrow{flex-wrap:wrap}#triovist-search360-v1 .ts360-formrow button{width:100%}}
   `;
   document.head.appendChild(x);
 }
 return true;
}
async function fetchNegatives(d){
 const {data,error}=await d.rpc('triovist_search360_negative_reviews_v1',{p_limit:80});
 if(error)throw error;
 return Array.isArray(data?.rows)?data.rows:[];
}
async function loadResults(id){
 const d=dbx();if(!d||!id)return;
 try{
   const {data,error}=await d.from('triovist_search360_results_v1').select('product_id,product_name,product_url,brand,sku,manager_email,position,page_no,position_state')
     .eq('request_id',id).order('position',{ascending:true}).limit(MAX_RESULTS);
   if(error)throw error;
   if(state.selected===id){state.rows=data||[];state.error='';render()}
 }catch(e){state.error='Результаты поиска сейчас недоступны: '+(e.message||e);render()}
}
async function load(force=false){
 if(!allowed()||!mount())return;
 if(refreshFlight)return refreshFlight;
 if(!force&&Date.now()-state.loadedAt<TTL){render();return;}
 const d=dbx();if(!d)return;
 refreshFlight=(async()=>{
   try{
     const [q,n]=await Promise.all([
       d.from('triovist_search360_requests_v1')
        .select('id,query_text,resolved_query,suggestion_text,suggestion_source,suggestion_status,status,search_total,pages_checked,rows_found,error_text,requested_at,finished_at')
        .order('requested_at',{ascending:false}).limit(12),
       fetchNegatives(d)]);
     if(q.error)throw q.error;
     state.requests=q.data||[];state.negatives=n;
     if(!state.requests.some(x=>x.id===state.selected))state.selected=state.requests[0]?.id||null;
     state.rows=[];state.error='';state.loadedAt=Date.now();
     render();
     if(state.selected)await loadResults(state.selected);
   }catch(e){state.error='Не удалось загрузить 21vek: '+(e.message||e);render()}
 })().finally(()=>{refreshFlight=null});
 return refreshFlight;
}
async function submit(event){
 event.preventDefault();
 if(state.sending||!allowed())return;
 const root=document.getElementById(ROOT_ID),input=root?.querySelector('#ts360-phrase');
 const phrase=String(input?.value||'').trim().replace(/\s+/g,' ');
 if(phrase.length<2||phrase.length>120){state.error='Укажите поисковую фразу от 2 до 120 символов.';render();return}
 state.sending=true;
 const d=dbx();
 try{
   const {data,error}=await d.from('triovist_search360_requests_v1')
     .insert({query_text:phrase,max_depth:600})
     .select('id').single();
   if(error)throw error;
   state.selected=data?.id||null;state.loadedAt=0;state.error='';
 }catch(e){state.error='Не удалось поставить запрос в очередь: '+(e.message||e)}
 finally{state.sending=false;await load(true)}
}
function install(){
 if(!allowed()||!active())return;
 if(!mount())return;
 load(false);
}
const oldRender=window.renderTriovist;
if(typeof oldRender==='function')window.renderTriovist=function(){const r=oldRender.apply(this,arguments);setTimeout(install,0);return r};
document.addEventListener('DOMContentLoaded',()=>setTimeout(install,100),{once:true});
setTimeout(install,500);setTimeout(install,2200);
window.RESANTA_TRIOVIST_SEARCH360_V1=Object.freeze({version:V,refresh:()=>load(true),state:()=>({requestCount:state.requests.length,negativeCount:state.negatives.length,selected:state.selected}),isolated:true});
})();