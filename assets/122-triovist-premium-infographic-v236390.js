/* Triovist · Infographic Factory 5.0
 * Compatibility export keeps the existing lazy route loader untouched.
 * This module is isolated to the Infographics route and replaces the visible legacy studios.
 */
(function(){
'use strict';
const COMPAT_VERSION='23.6.401',FACTORY_VERSION='5.0',FN='triovist-infographic-factory-v5';
if(window.RESANTA_TRIOVIST_PREMIUM_V236390?.factoryVersion===FACTORY_VERSION)return;
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const a=x=>Array.isArray(x)?x:[];
const dbx=()=>{try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}};
const pretty=x=>x==='Бетоносмесители'?'Бетономешалки':x;
const stateLabel={
 queued:'В очереди',researching:'Изучаю рынок',pilot_review:'Контрольные SKU готовы',
 processing:'Фабрика работает',completed:'Готово',completed_with_attention:'Готово · есть внимание',
 cancelled:'Остановлено',failed:'Требует внимания',
 planning:'Проектирование',generating:'Генерация',qa:'Проверка',remaking:'Автопеределка',
 attention:'Требует внимания',error:'Ошибка'
};
let root=null,ctx=null,config=null,groups=[],selected=new Set(),marketplaces=new Set(['21vek','wb','ozon']);
let batches=[],current=null,items=[],dna=[],busy=false,message='',isError=false,filter='',readyFilter='',timer=null,preview=null;

function css(){
 if(document.getElementById('tif5-css'))return;
 const s=document.createElement('style');s.id='tif5-css';s.textContent=[
 '#tif5{border:2px solid #b9d8f6;border-radius:16px;background:#f8fbff;color:#16324d;padding:18px;margin:0 0 18px;font:inherit}',
 '#tif5 *{box-sizing:border-box}#tif5 h3{margin:0 0 5px;font-size:22px}#tif5 h4{margin:12px 0 8px;font-size:15px}',
 '.tif5-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}',
 '.tif5-tag{background:#dff0ff;color:#0c5d96;font-weight:800;border-radius:22px;padding:7px 11px;font-size:12px}',
 '.tif5-muted{font-size:12px;color:#60758b;line-height:1.55}.tif5-note{font-size:12px;background:#e8f4ff;color:#175785;padding:10px 12px;border-radius:10px;margin:12px 0}',
 '.tif5-good{font-size:12px;background:#eaf8ef;color:#24613c;padding:10px 12px;border:1px solid #c4e7cf;border-radius:10px;margin:10px 0}',
 '.tif5-warn{font-size:12px;background:#fff5df;color:#805d1d;padding:10px 12px;border:1px solid #f5dca8;border-radius:10px;margin:10px 0}',
 '.tif5-err{font-size:12px;background:#fff0f0;color:#9c3131;padding:10px 12px;border:1px solid #f2c5c5;border-radius:10px;margin:10px 0}',
 '.tif5-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0}#tif5 button{border:1px solid #c7d7e6;border-radius:9px;background:#fff;color:#174d75;padding:9px 12px;font:inherit;font-size:12px;cursor:pointer}',
 '#tif5 button:disabled{opacity:.45;cursor:default}#tif5 button.primary{background:#145f9d;color:#fff;border-color:#145f9d;font-weight:800}#tif5 button.green{background:#187344;color:white;border-color:#187344;font-weight:800}#tif5 button.red{color:#a02c2c;border-color:#efbebe;background:#fff6f6}',
 '.tif5-market{display:flex;gap:8px;flex-wrap:wrap}.tif5-market label{display:flex;align-items:center;gap:6px;background:white;border:1px solid #d1deea;border-radius:9px;padding:8px 11px;font-size:12px;font-weight:700}',
 '.tif5-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:10px;margin:12px 0}.tif5-input{width:100%;border:1px solid #c7d7e6;border-radius:9px;padding:10px 12px;background:#fff;font:inherit}',
 '.tif5-groups{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;max-height:360px;overflow:auto;padding:2px}',
 '.tif5-group{width:100%;display:flex;justify-content:space-between;gap:12px;text-align:left;align-items:center;padding:11px!important}.tif5-group.picked{background:#e9f4ff!important;border-color:#4e9ddd!important;box-shadow:0 0 0 1px #4e9ddd inset}.tif5-group b{display:block;color:#183d5d}.tif5-group small{display:block;color:#6b7f92;margin-top:3px}',
 '.tif5-count{background:#eef5fb;border-radius:8px;padding:6px 8px;font-size:11px;white-space:nowrap}',
 '.tif5-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(135px,1fr));gap:8px;margin:12px 0}.tif5-kpi{background:#fff;border:1px solid #d6e2ec;border-radius:11px;padding:11px}.tif5-kpi small,.tif5-kpi b{display:block}.tif5-kpi b{font-size:19px;margin-top:3px}',
 '.tif5-progress{height:12px;border-radius:99px;background:#dfe8f1;overflow:hidden;margin:9px 0}.tif5-progress span{height:100%;display:block;background:#237db8;border-radius:99px;transition:width .3s}',
 '.tif5-batches{display:grid;gap:7px;max-height:210px;overflow:auto}.tif5-batches button{display:flex;justify-content:space-between;gap:12px;text-align:left;align-items:center}.tif5-batches button.on{background:#eaf5ff;border-color:#69a8da}',
 '.tif5-pilots{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:9px}.tif5-pilot{background:white;border:1px solid #d5e1eb;border-radius:11px;padding:12px}.tif5-pilot h4{margin:0 0 6px}',
 '.tif5-ready{display:grid;grid-template-columns:repeat(auto-fill,minmax(245px,1fr));gap:7px;max-height:300px;overflow:auto;margin:10px 0}.tif5-ready-card{background:white;border:1px solid #d7e3ed;border-radius:10px;padding:10px}.tif5-ready-card b,.tif5-ready-card small{display:block}.tif5-ready-card small{color:#6a7d8f;margin:3px 0 8px}',
 '.tif5-sep{border-top:1px solid #d7e4ef;margin:15px 0}',
 '.tif5-overlay{position:fixed;inset:0;z-index:1000000;background:rgba(7,20,37,.82);display:flex;align-items:center;justify-content:center;padding:14px}.tif5-modal{width:min(1180px,100%);max-height:95vh;overflow:auto;background:#fff;border-radius:15px;padding:18px;color:#17324d}.tif5-modal-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.tif5-slidegrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:12px}.tif5-slide{border:1px solid #d9e2eb;border-radius:10px;padding:7px;background:#f8fafc}.tif5-slide img{display:block;width:100%;aspect-ratio:4/5;object-fit:contain;border-radius:7px;background:#eef2f6}.tif5-slide b,.tif5-slide small{display:block;margin-top:5px}.tif5-slide small{color:#64748b}',
 '@media(max-width:650px){.tif5-toolbar{grid-template-columns:1fr}.tif5-groups{grid-template-columns:1fr}.tif5-slidegrid{grid-template-columns:repeat(2,minmax(0,1fr))}}'
 ].join('');document.head.appendChild(s);
}
async function invoke(action,args={}){
 const d=dbx();if(!d?.functions?.invoke)throw Error('CRM ещё подключается к базе');
 const {data,error}=await d.functions.invoke(FN,{body:{action,...args}});
 if(error){
  let reason='';try{const body=await error.context?.json?.();reason=body?.message||''}catch(_){}
  if(/429|limit|лимит/i.test(reason||error.message||''))throw Error('Временная нагрузка на ИИ. Фабрика сама продолжит работу позже.');
  throw Error(reason||'Сервис фабрики временно недоступен');
 }
 if(!data?.ok)throw Error(data?.message||'Не удалось выполнить действие');
 return data;
}
const pickedGroups=()=>groups.filter(g=>selected.has(g.name));
const pickedCount=()=>pickedGroups().reduce((s,g)=>s+Number(g.sku_count||0),0);
const hasNewStyle=()=>pickedGroups().some(g=>!g.bulk_approved);
function groupStatus(g){
 if(g.bulk_approved)return 'Стиль утверждён · массовый режим';
 if(g.dna_status==='ready')return 'Visual DNA готов · нужен контрольный SKU';
 if(g.dna_status==='researching')return 'Изучаю 21vek / WB / Ozon';
 return 'Новая группа · сначала контрольный SKU';
}
function statusClass(s){return ['completed'].includes(s)?'tif5-good':['failed','error'].includes(s)?'tif5-err':['completed_with_attention','pilot_review','attention'].includes(s)?'tif5-warn':'tif5-note'}
function currentCounts(){
 const done=items.filter(x=>x.status==='completed').length,attention=items.filter(x=>x.status==='attention').length,error=items.filter(x=>x.status==='error').length;
 const remaking=items.filter(x=>x.status==='remaking'||Number(x.remake_slides||0)>0).length;
 const active=items.filter(x=>['queued','waiting_group_dna','planning','generating','qa','remaking'].includes(x.status)).length;
 return {done,attention,error,remaking,active,total:items.length};
}
function selectionHtml(){
 const count=pickedCount(),tooMany=count>500;
 const visible=groups.filter(g=>!filter||String(g.name).toLowerCase().includes(filter.toLowerCase()));
 return '<div class="tif5-sep"></div>'+
  '<h4>1. Выбери группы товаров</h4>'+
  '<div class="tif5-toolbar"><input class="tif5-input" data-tif-filter placeholder="Найти группу…" value="'+h(filter)+'">'+
  '<div class="tif5-count"><b>'+count+'</b> SKU выбрано</div></div>'+
  '<div class="tif5-groups">'+visible.map(g=>'<button class="tif5-group '+(selected.has(g.name)?'picked':'')+'" data-tif-group="'+h(g.name)+'"><span><b>'+h(g.name)+'</b><small>'+h(groupStatus(g))+'</small></span><span class="tif5-count">'+Number(g.sku_count||0)+' SKU</span></button>').join('')+'</div>'+
  '<div class="tif5-actions"><button data-tif-clear>Снять выбор</button><span class="tif5-muted">До 500 SKU за один запуск.</span></div>'+
  '<h4>2. Визуальный анализ рынка</h4><div class="tif5-market">'+
  ['21vek','wb','ozon'].map(x=>'<label><input type="checkbox" data-tif-market="'+x+'" '+(marketplaces.has(x)?'checked':'')+'> '+(x==='wb'?'Wildberries':x==='ozon'?'Ozon':'21vek')+'</label>').join('')+'</div>'+
  '<p class="tif5-muted">21vek даёт точный товар, характеристики и конкурентный контекст. Wildberries и Ozon используются как визуальная школа категории. Чужие характеристики на наш SKU не переносятся.</p>'+
  (hasNewStyle()?'<div class="tif5-note"><b>Есть новые группы.</b> Фабрика сначала автоматически сделает по одному контрольному SKU. После твоего единственного утверждения стиля группы остальные товары будут обрабатываться фоном без участия.</div>':'')+
  (tooMany?'<div class="tif5-err">Выбрано больше 500 SKU. Убери одну или несколько групп.</div>':'')+
  '<div class="tif5-actions"><button class="primary" data-tif-start '+(!count||tooMany||busy?'disabled':'')+'>🚀 Запустить фабрику · '+count+' SKU</button><span class="tif5-muted">После запуска CRM можно закрыть — очередь просыпается автоматически и работа продолжается на сервере.</span></div>';
}
function batchListHtml(){
 if(!batches.length)return '';
 return '<div class="tif5-sep"></div><h4>Запуски фабрики</h4><div class="tif5-batches">'+batches.map(b=>{
  const groups=a(b.groups).map(pretty).join(' · '),on=current?.id===b.id?'on':'';
  return '<button class="'+on+'" data-tif-batch="'+h(b.id)+'"><span><b>'+h(groups||'Без групп')+'</b><small class="tif5-muted">'+new Date(b.created_at).toLocaleString('ru-RU')+'</small></span><span>'+h(stateLabel[b.status]||b.status)+'</span></button>';
 }).join('')+'</div>';
}
function pilotHtml(){
 if(!current)return '';
 const pending=a(current.selection_snapshot).filter(x=>!x.bulk_approved);
 if(!pending.length)return '';
 const cards=pending.map(sel=>{
  const item=items.find(x=>x.group_name===sel.group&&x.is_reference),ready=item?.status==='completed'&&Number(item.quality_score||0)>=Number(current.qa_threshold||90);
  return '<div class="tif5-pilot"><h4>'+h(pretty(sel.group))+'</h4>'+
   '<div class="'+statusClass(item?.status||'queued')+'">'+(item?'<b>'+h(item.sku)+'</b> · '+h(item.stage||stateLabel[item.status]||item.status)+(item.quality_score?' · QA '+Number(item.quality_score)+'/100':''):'Контрольный SKU готовится')+'</div>'+
   (item?'<div class="tif5-actions"><button data-tif-preview="'+h(item.sku)+'">👁 Посмотреть все слайды</button>'+
   '<button class="green" data-tif-approve="'+h(sel.group)+'" '+(!ready?'disabled':'')+'>✓ Утвердить стиль группы</button></div>':'')+
   '<p class="tif5-muted">'+(ready?'После утверждения фабрика сама добавит остальные SKU этой группы в очередь.':'Утверждение доступно только когда все слайды контрольного SKU прошли QA ≥ '+Number(current.qa_threshold||90)+'.')+'</p></div>';
 }).join('');
 return '<div class="tif5-warn"><b>Нужен только один контроль качества стиля.</b> Посмотри эталон каждой новой группы. После утверждения тебе больше не придётся выбирать концепции или следить за отдельными SKU.</div><div class="tif5-pilots">'+cards+'</div>';
}
function readyHtml(){
 if(!items.length)return '';
 const q=readyFilter.toLowerCase(),ready=items.filter(x=>['completed','attention','error'].includes(x.status)&&(!q||(x.sku+' '+x.product_name+' '+x.group_name).toLowerCase().includes(q))).slice(0,80);
 if(!ready.length)return '';
 return '<h4>Готовые и требующие внимания SKU</h4><input class="tif5-input" style="max-width:480px" data-tif-ready-filter placeholder="Найти артикул…" value="'+h(readyFilter)+'">'+
 '<div class="tif5-ready">'+ready.map(x=>'<div class="tif5-ready-card"><b>'+h(x.sku)+' · '+h(x.stage||stateLabel[x.status]||x.status)+'</b><small>'+h(x.group_name)+' · '+h(x.product_name)+(x.quality_score?' · QA '+Number(x.quality_score)+'/100':'')+'</small>'+
 (x.status!=='error'?'<button data-tif-preview="'+h(x.sku)+'">👁 Слайды</button>':'')+'</div>').join('')+'</div>';
}
function currentHtml(){
 if(!current)return '';
 const c=currentCounts(),resolved=c.done+c.attention+c.error,pct=c.total?Math.round(resolved/c.total*100):0;
 return '<div class="tif5-sep"></div><div class="tif5-head"><div><h3>'+h(a(current.groups).join(' · '))+'</h3><div class="tif5-muted">'+h(stateLabel[current.status]||current.status)+' · запрошено '+Number(current.requested_total_items||current.total_items||0)+' SKU</div></div><span class="tif5-tag">'+h(current.mode==='pilot'?'контрольный этап':'массовый режим')+'</span></div>'+
 '<div class="'+statusClass(current.status)+'"><b>'+h(current.stage||stateLabel[current.status]||current.status)+'</b></div>'+
 '<div class="tif5-kpis"><div class="tif5-kpi"><small>В текущей очереди</small><b>'+c.total+'</b></div><div class="tif5-kpi"><small>Готово</small><b>'+c.done+'</b></div><div class="tif5-kpi"><small>В работе</small><b>'+c.active+'</b></div><div class="tif5-kpi"><small>Автопеределка</small><b>'+c.remaking+'</b></div><div class="tif5-kpi"><small>Внимание</small><b>'+c.attention+'</b></div></div>'+
 '<div class="tif5-progress"><span style="width:'+pct+'%"></span></div><div class="tif5-muted">'+pct+'% текущей очереди завершено · слабые слайды переделываются автоматически, остальные SKU продолжают работу</div>'+
 pilotHtml()+
 (['completed','completed_with_attention'].includes(current.status)?'<div class="tif5-actions"><button class="green" data-tif-download>⬇ Скачать готовые архивы</button></div>':'')+
 (!['completed','completed_with_attention','cancelled','failed'].includes(current.status)?'<div class="tif5-actions"><button data-tif-refresh>↻ Обновить</button><button class="red" data-tif-stop>■ Остановить</button></div>':'<div class="tif5-actions"><button data-tif-refresh>↻ Обновить</button></div>')+
 readyHtml();
}
function draw(){
 if(!root)return;
 root.innerHTML='<div class="tif5-head"><div><h3>🎨 Triovist · Фабрика инфографики</h3><div class="tif5-muted">Группы → 21vek + WB + Ozon → Visual DNA → 5–9 сильных слайдов → независимый QA → автопеределка → готовый ZIP.</div></div><span class="tif5-tag">5.0 · background factory</span></div>'+
 '<div class="tif5-note"><b>Главное правило:</b> каждый слайд — как сильная обложка. Никаких «одна характеристика + товар + пустой фон». Временные ошибки ИИ обрабатываются автоматически и не останавливают остальные SKU.</div>'+
 (message?'<div class="'+(isError?'tif5-err':'tif5-good')+'">'+h(message)+'</div>':'')+
 selectionHtml()+currentHtml()+batchListHtml();
}
async function loadCatalog(){const d=await invoke('catalog');groups=a(d.groups)}
async function loadList(){const d=await invoke('list');batches=a(d.batches)}
async function loadCurrent(id){
 const d=await invoke('status',{batch_id:id});current=d.batch;items=a(d.items);dna=a(d.group_dna);
}
async function refreshAll(){
 if(busy)return;busy=true;try{
  const first=!config;
  if(first){config=(await invoke('config'));await loadCatalog()}
  await loadList();
  if(current?.id)await loadCurrent(current.id);
  else if(batches[0])await loadCurrent(batches[0].id);
  message='';isError=false;
 }catch(e){message=String(e.message||e);isError=true}
 finally{busy=false;draw();schedule()}
}
function schedule(){
 clearTimeout(timer);if(!root||!document.body.contains(root))return;
 if(current&&['queued','researching','processing'].includes(current.status))timer=setTimeout(()=>refreshAll(),30000);
}
async function start(){
 if(busy)return;const names=[...selected],count=pickedCount();if(!names.length||count>500)return;
 busy=true;message='Создаю фоновое задание…';isError=false;draw();
 try{
  const d=await invoke('start',{groups:names,marketplaces:[...marketplaces]});
  current=d.batch;message=d.message||'Фабрика запущена';await loadCatalog();await loadList();await loadCurrent(current.id);
 }catch(e){message=String(e.message||e);isError=true}
 finally{busy=false;draw();schedule()}
}
async function chooseBatch(id){busy=true;draw();try{await loadCurrent(id);message='';isError=false}catch(e){message=String(e.message||e);isError=true}finally{busy=false;draw();schedule()}}
async function approveGroup(group){
 if(!current||busy)return;if(!confirm('Утвердить стиль группы «'+group+'» и автоматически добавить остальные SKU этой группы в массовую очередь?'))return;
 busy=true;message='Добавляю остальные SKU группы…';draw();
 try{const d=await invoke('approve-group',{batch_id:current.id,group_name:group});message='Стиль утверждён. Добавлено в очередь: '+Number(d.added||0)+' SKU.';await loadCatalog();await loadCurrent(current.id);await loadList()}
 catch(e){message=String(e.message||e);isError=true}finally{busy=false;draw();schedule()}
}
async function stop(){if(!current||busy||!confirm('Остановить эту фабрику? Уже готовые комплекты сохранятся.'))return;busy=true;draw();try{await invoke('stop',{batch_id:current.id});await loadCurrent(current.id);await loadList();message='Задание остановлено.'}catch(e){message=String(e.message||e);isError=true}finally{busy=false;draw()}}
async function previewSku(sku){
 if(!current||busy)return;busy=true;message='Готовлю предпросмотр '+sku+'…';draw();
 try{
  const d=await invoke('preview-slides',{batch_id:current.id,sku});preview=d;message='';isError=false;drawPreview();
 }catch(e){message=String(e.message||e);isError=true}
 finally{busy=false;draw();schedule()}
}
function closePreview(){document.querySelector('.tif5-overlay')?.remove();preview=null}
function drawPreview(){
 closePreview();if(!preview)return;
 const shade=document.createElement('div');shade.className='tif5-overlay';
 shade.innerHTML='<div class="tif5-modal"><div class="tif5-modal-head"><div><h3 style="margin:0">'+h(preview.item?.sku)+' · '+h(preview.item?.product_name)+'</h3><div class="tif5-muted">QA комплекта: '+Number(preview.item?.quality_score||0)+'/100 · '+h(preview.item?.group_name)+'</div></div><button data-tif-close>✕ Закрыть</button></div>'+
 '<div class="tif5-slidegrid">'+a(preview.slides).map(s=>'<div class="tif5-slide"><img loading="lazy" src="'+h(s.url)+'"><b>'+Number(s.slide_no)+'. '+h(s.title)+'</b><small>QA '+Number(s.qa_score||0)+'/100 · '+h(stateLabel[s.status]||s.status)+'</small></div>').join('')+'</div></div>';
 shade.addEventListener('click',e=>{if(e.target===shade||e.target.closest('[data-tif-close]'))closePreview()});document.body.appendChild(shade);
}
async function download(){
 if(!current||busy)return;busy=true;message='Готовлю ссылки на архив…';draw();
 try{
  const d=await invoke('download',{batch_id:current.id}),files=a(d.files);if(!files.length)throw Error('Архив ещё не готов');
  files.forEach((f,i)=>{setTimeout(()=>{const x=document.createElement('a');x.href=f.url;x.download=f.name||('factory_part_'+(i+1)+'.zip');x.target='_blank';x.rel='noopener';document.body.appendChild(x);x.click();x.remove()},i*800)});
  message='Архив'+(files.length>1?'ы переданы браузеру частями.':' передан браузеру.');
 }catch(e){message=String(e.message||e);isError=true}finally{busy=false;draw()}
}
async function click(e){
 const b=e.target.closest('button');if(!b||!root?.contains(b))return;
 if(b.hasAttribute('data-tif-group')){const g=b.dataset.tifGroup;selected.has(g)?selected.delete(g):selected.add(g);draw();return}
 if(b.hasAttribute('data-tif-clear')){selected.clear();draw();return}
 if(b.hasAttribute('data-tif-start')){await start();return}
 if(b.hasAttribute('data-tif-batch')){await chooseBatch(b.dataset.tifBatch);return}
 if(b.hasAttribute('data-tif-refresh')){await refreshAll();return}
 if(b.hasAttribute('data-tif-approve')){await approveGroup(b.dataset.tifApprove);return}
 if(b.hasAttribute('data-tif-preview')){await previewSku(b.dataset.tifPreview);return}
 if(b.hasAttribute('data-tif-stop')){await stop();return}
 if(b.hasAttribute('data-tif-download')){await download();return}
}
function input(e){
 if(e.target.matches('[data-tif-filter]')){filter=e.target.value;const p=e.target.selectionStart;draw();const x=root.querySelector('[data-tif-filter]');if(x){x.focus();try{x.setSelectionRange(p,p)}catch(_){}};return}
 if(e.target.matches('[data-tif-ready-filter]')){readyFilter=e.target.value;const p=e.target.selectionStart;draw();const x=root.querySelector('[data-tif-ready-filter]');if(x){x.focus();try{x.setSelectionRange(p,p)}catch(_){}}}
}
function change(e){
 const m=e.target?.dataset?.tifMarket;if(!m)return;e.target.checked?marketplaces.add(m):marketplaces.delete(m);draw();
}
async function open(panel,context){
 if(!panel)return;ctx=context||{};css();clearTimeout(timer);window.RESANTA_TRIOVIST_FACTORY_V5_ACTIVE=true;
 root=document.createElement('section');root.id='tif5';panel.replaceChildren(root);
 root.addEventListener('click',click);root.addEventListener('input',input);root.addEventListener('change',change);
 config=null;groups=[];batches=[];current=null;items=[];dna=[];message='';isError=false;filter='';readyFilter='';selected=new Set();marketplaces=new Set(['21vek','wb','ozon']);
 draw();await refreshAll();
}
async function refresh(){await refreshAll()}
window.RESANTA_TRIOVIST_PREMIUM_V236390=Object.freeze({
 version:COMPAT_VERSION,factoryVersion:FACTORY_VERSION,open,refresh,
 isolated:true,backgroundFactory:true,maxSku:500,dynamicSlides:true,visualDNA:true,marketplaces:['21vek','wb','ozon'],autoQA:true,autoRegeneration:true
});
})();
