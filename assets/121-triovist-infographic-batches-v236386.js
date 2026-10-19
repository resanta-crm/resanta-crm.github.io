/* RESANTA CRM v23.6.386 - isolated Triovist batch infographic UX.
   Separate from the single-SKU editor. No global polling and no source-table writes. */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_INFOGRAPHIC_BATCH_V236386)return;
const VERSION='23.6.386',FN='triovist-infographic-ai-v236385';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const list=x=>Array.isArray(x)?x:[];
const dbx=()=>{try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}};
const pretty=x=>x==='Бетоносмесители'?'Бетономешалки':x;
const stateLabels={queued:'В очереди',processing:'В работе',completed:'Готово',completed_with_errors:'Готово с замечаниями',failed:'Ошибка',cancelled:'Остановлено'};
let root=null,groups=[],selected=new Set(),jobs=[],current=null,filter='',readyFilter='',working=false,downloading=false,timer=null,banner='',bannerError=false;
let previewOverlay=null,previewUrls=[],previewZipBlob=null,previewSku='',previewSequence=0;
async function invoke(action,args={}){
 const d=dbx();if(!d?.functions)throw Error('База CRM пока не подключена');
 const {data,error}=await d.functions.invoke(FN,{body:{action,...args}});
 if(error){
  let reason='';
  try{const x=await error.context?.json?.();reason=x?.message||x?.error||''}catch(_){}
  throw Error(reason||error.message||'Ошибка сервера инфографики');
 }
 if(!data?.ok)throw Error(data?.message||data?.error||'Ошибка обработки задания');
 return data;
}
function css(){
 if(document.getElementById('tib386-css'))return;
 const tag=document.createElement('style');tag.id='tib386-css';
 tag.textContent=[
 '#tib386{border:2px solid #b6d4f1;background:#fff;border-radius:14px;padding:17px;margin:0 0 18px;color:#19334c}',
 '#tib386 *{box-sizing:border-box}',
 '.tib386-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}',
 '.tib386-head h3{margin:0 0 5px;font-size:20px}',
 '.tib386-muted{font-size:12px;color:#64748b;line-height:1.55}',
 '.tib386-controls{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:12px;margin:16px 0}',
 '.tib386-controls input{width:100%;border:1px solid #cbd5e1;border-radius:9px;padding:10px;font:inherit;min-height:42px}',
 '.tib386-counter{background:#eff6ff;border:1px solid #bfdbfe;border-radius:9px;padding:10px 13px;white-space:nowrap;font-size:13px}',
 '.tib386-items{display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:8px;max-height:285px;overflow:auto;margin-bottom:13px}',
 '#tib386 button{border:1px solid #cbd5e1;color:#334155;background:#fff;border-radius:9px;padding:9px 12px;cursor:pointer;font:inherit;font-size:12px}',
 '#tib386 button:disabled{opacity:.45;cursor:default}',
 '#tib386 button.blue{background:#165da3;color:#fff;border-color:#165da3;font-weight:800}',
 '#tib386 button.picked{background:#e9f3ff;border-color:#60a5fa;color:#164e80;font-weight:800}',
 '.tib386-choice{display:flex;justify-content:space-between;gap:14px;align-items:center;text-align:left;width:100%}',
 '.tib386-choice span{min-width:0}.tib386-choice small{white-space:nowrap;opacity:.7}',
 '.tib386-actions{display:flex;gap:9px;flex-wrap:wrap;align-items:center}',
 '.tib386-sep{border-top:1px solid #e2e8f0;margin:14px 0}',
 '.tib386-progress{height:12px;background:#e2e8f0;border-radius:99px;overflow:hidden;margin:8px 0}',
 '.tib386-progress span{display:block;background:#2379b5;height:100%;transition:width .2s}',
 '.tib386-note{margin-top:12px;border-radius:9px;background:#eff6ff;color:#155487;padding:10px;font-size:12px}',
 '.tib386-note.err{color:#9b2d27;background:#fff1f2}',
 '.tib386-jobs{display:grid;gap:7px;max-height:190px;overflow:auto}',
 '.tib386-jobs button{display:flex;align-items:center;justify-content:space-between;gap:14px;text-align:left}',
 '.tib386-ready{display:grid;grid-template-columns:repeat(auto-fill,minmax(245px,1fr));gap:7px;max-height:250px;overflow:auto;margin:9px 0}',
 '.tib386-ready button{display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left}',
 '.tib386-ready button b{color:#176343}.tib386-ready button small{color:#64748b}',
 '.tib386-ready-filter{width:100%;max-width:460px;border:1px solid #cbd5e1;border-radius:9px;padding:9px 12px;font:inherit;margin:8px 0}',
 '.tib386-modal-shade{position:fixed;inset:0;background:rgba(8,23,44,.78);z-index:1000000;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box}',
 '.tib386-modal{background:#fff;color:#1e293b;width:min(1120px,100%);max-height:95vh;overflow:auto;border-radius:15px;box-sizing:border-box;padding:18px 20px;font:inherit}',
 '.tib386-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}',
 '.tib386-modal button{background:#fff;border:1px solid #cbd5e1;border-radius:9px;padding:8px 12px;cursor:pointer;font:inherit;font-size:12px}',
 '.tib386-modal .tib386-primary{background:#1765ac;color:#fff;border-color:#1765ac}',
 '.tib386-preview-main{display:flex;justify-content:center;align-items:center;background:#eef2f6;padding:9px;border-radius:11px;margin:10px 0;min-height:160px}',
 '.tib386-preview-main img{width:auto;max-width:100%;max-height:53vh;object-fit:contain;border-radius:8px}',
 '.tib386-thumbs{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin:10px 0}',
 '.tib386-thumbs button{padding:4px;border:2px solid transparent;border-radius:8px;background:#eef2f6;min-width:0}',
 '.tib386-thumbs button.active{border-color:#2f83bf}',
 '.tib386-thumbs img{display:block;width:100%;aspect-ratio:4/5;object-fit:contain}',
 '.tib386-preview-warning{background:#fff5dc;color:#855d10;padding:8px;border-radius:8px;margin:6px 0;font-size:12px}',
 '@media(max-width:650px){.tib386-thumbs{grid-template-columns:repeat(4,minmax(0,1fr))}}',
 '#tib386 h4{margin:6px 0 9px;font-size:14px}',
 '@media(max-width:650px){.tib386-controls{grid-template-columns:1fr}.tib386-counter{white-space:normal}}'
 ].join('');
 document.head.appendChild(tag);
}
function calc(){
 const chosen=groups.filter(x=>selected.has(x.name));
 return {count:chosen.length,sku:chosen.reduce((n,x)=>n+Number(x.sku_count||0),0)};
}
function cardsHtml(){
 const rows=groups.filter(x=>pretty(x.name).toLowerCase().includes(filter.toLowerCase())||x.name.toLowerCase().includes(filter.toLowerCase()));
 return rows.length?rows.map(x=>
 '<button type="button" class="tib386-choice '+(selected.has(x.name)?'picked':'')+'" data-tib-group="'+esc(x.name)+'">'+
 '<span>'+(selected.has(x.name)?'☑ ':'☐ ')+esc(pretty(x.name))+'</span><small>'+Number(x.sku_count)+' SKU</small></button>').join(''):
 '<p class="tib386-muted">'+(groups.length?'По вашему запросу групп нет.':'Каталог групп загружается…')+'</p>';
}
function readyHtml(){
 if(!current)return '';
 const all=list(current.items).filter(x=>x.status==='completed');
 if(!all.length)return '';
 const q=readyFilter.toLowerCase().trim();
 const matches=all.filter(x=>!q||String(x.sku).toLowerCase().includes(q)||String(x.group_name).toLowerCase().includes(q));
 return '<div class="tib386-sep"></div><h4>✅ Готовые товары — посмотреть прямо сейчас ('+all.length+')</h4>'+
 '<p class="tib386-muted">Можно открыть все 7 слайдов любого готового SKU и скачать его ZIP, пока другие продолжают обрабатываться. Открытие не останавливает очередь.</p>'+
 '<input class="tib386-ready-filter" data-tib-ready-filter placeholder="Найти готовый артикул или группу…" value="'+esc(readyFilter)+'">'+
 '<div class="tib386-ready">'+
 (matches.length?matches.map(x=>'<button data-tib-preview="'+esc(x.sku)+'"><span><b>'+esc(x.sku)+'</b><br><small>'+esc(pretty(x.group_name))+'</small></span><span>👁 Посмотреть</span></button>').join(''):
 '<p class="tib386-muted">В готовых пока нет совпадений.</p>')+'</div>';
}
function jobHtml(){
 if(!current)return '';
 const j=current,done=Number(j.completed_items||0)+Number(j.failed_items||0);
 const pct=j.total_items?Math.round(done/Number(j.total_items)*100):0;
 const failures=list(j.items).filter(x=>x.status==='error').slice(0,8);
 return '<div class="tib386-sep"></div><h4>Текущее задание · '+esc(stateLabels[j.status]||j.status)+'</h4>'+
 '<p class="tib386-muted">'+list(j.groups).map(pretty).map(esc).join(' · ')+'</p>'+
 '<div class="tib386-progress"><span style="width:'+Math.max(0,Math.min(pct,100))+'%"></span></div>'+
 '<div class="tib386-actions"><b>'+done+'/'+Number(j.total_items||0)+' SKU обработано</b>'+
 '<span class="tib386-muted">Готово: '+Number(j.completed_items||0)+' · Проверка: '+Number(j.failed_items||0)+'</span>'+
 '<button data-tib-status="'+esc(j.id)+'">↻ Проверить статус</button>'+ (['queued','processing'].includes(j.status)?'<button data-tib-stop="'+esc(j.id)+'">⏹ Остановить</button>':'')+
 (['completed','completed_with_errors'].includes(j.status)?
 '<button class="blue" data-tib-download="'+esc(j.id)+'" '+(downloading?'disabled':'')+'>📦 Скачать все группы одним ZIP</button>':'')+'</div>'+
 (j.error_summary?'<div class="tib386-note err">'+esc(j.error_summary)+'</div>':'')+
 (failures.length?'<p class="tib386-muted">SKU на проверку: '+failures.map(x=>esc(x.sku)).join(', ')+'</p>':'');
}
function draw(){
 if(!root?.isConnected)return;
 root.innerHTML='<div class="tib386-head"><div><h3>📁 История предыдущей инфографики (V1)</h3>'+
 '<p class="tib386-muted">Старый шаблонный генератор отключён для новых партий. Здесь сохранены уже созданные слайды, включая остановленное задание. Новую профессиональную генерацию запускай в разделе «Инфографика 2.0» выше.</p></div>'+
 '<button data-tib-refresh>↻ Обновить историю</button></div>'+
 jobHtml()+readyHtml()+
 (jobs.length?'<div class="tib386-sep"></div><h4>Предыдущие задания</h4><div class="tib386-jobs">'+jobs.slice(0,8).map(j=>
 '<button data-tib-status="'+esc(j.id)+'" class="'+(current?.id===j.id?'picked':'')+'"><span>'+list(j.groups).map(pretty).slice(0,3).map(esc).join(' · ')+'</span>'+
 '<small>'+esc(stateLabels[(current?.id===j.id?current:j).status]||(current?.id===j.id?current:j).status)+' · '+Number((current?.id===j.id?current:j).completed_items||0)+'/'+Number(j.total_items||0)+'</small></button>').join('')+'</div>':'')+
 (banner?'<div class="tib386-note '+(bannerError?'err':'')+'">'+esc(banner)+'</div>':'')+
 '<p class="tib386-muted" style="margin-top:11px">Все старые товары и их ZIP остались на сервере. Остановка задания не удаляет готовые материалы.</p>';
}
function schedule(){
 clearTimeout(timer);timer=null;
 if(!root?.isConnected||!current||!['queued','processing'].includes(current.status))return;
 timer=setTimeout(async()=>{
  if(!root?.isConnected||!current||!['queued','processing'].includes(current.status))return;
  const id=current.id;
  try{
   const d=await invoke('batch-status',{batch_id:id});
   if(root?.isConnected&&current?.id===id){current={...d.batch,items:d.items};draw()}
  }catch(e){console.warn('Infographic batch status',e)}
  schedule();
 },15000);
}
async function refresh(){
 const el=root;
 const bs=await invoke('batch-list');
 if(el!==root||!el?.isConnected)return;
 jobs=list(bs.batches);
 if(!current&&jobs.length)current=jobs[0];
 else if(current){const x=jobs.find(j=>j.id===current.id);if(x)current={...current,...x}}
 if(current?.id){
  try{const d=await invoke('batch-status',{batch_id:current.id});if(el===root)current={...d.batch,items:d.items}}catch(e){console.warn('Batch status',e)}
 }
 draw();schedule();
}
async function showJob(id){
 const d=await invoke('batch-status',{batch_id:id});
 current={...d.batch,items:d.items};draw();schedule();
}
async function start(){
 const x=calc();
 if(working||x.count===0||x.count>10||x.sku>300)throw Error('Выбери 1–10 групп общим объёмом не более 300 SKU');
 working=true;banner='Сохраняю задание. Генерация продолжится в фоне.';bannerError=false;draw();
 try{
  const result=await invoke('batch-start',{groups:[...selected]});
  selected.clear();await refresh();await showJob(result.batch.id);
  banner='Задание принято. Можно закрыть вкладку и вернуться за архивом.';draw();
 }finally{working=false;draw()}
}
function downloadBlob(name,blob){
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;
 document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
}
let zipLibPromise=null;
async function zipLib(){
 if(window.JSZip)return window.JSZip;
 if(zipLibPromise)return zipLibPromise;
 zipLibPromise=new Promise((resolve,reject)=>{
  const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
  s.onload=()=>window.JSZip?resolve(window.JSZip):reject(Error('ZIP-библиотека не загружена'));
  s.onerror=()=>reject(Error('Не удалось загрузить библиотеку ZIP'));
  document.head.appendChild(s);
 }).finally(()=>{zipLibPromise=null});
 return zipLibPromise;
}
function closePreview(){
 previewSequence++;
 for(const url of previewUrls){try{URL.revokeObjectURL(url)}catch(_){}}
 previewUrls=[];previewZipBlob=null;previewSku='';
 if(previewOverlay){previewOverlay.remove();previewOverlay=null;}
 document.removeEventListener('keydown',previewOnEscape);
}
function previewOnEscape(e){if(e.key==='Escape')closePreview()}
function previewShell(sku){
 closePreview();
 previewSku=sku;
 const shade=document.createElement('div');
 shade.className='tib386-modal-shade';
 shade.innerHTML='<div class="tib386-modal" role="dialog" aria-modal="true" aria-label="Предпросмотр готового SKU">'+
 '<div class="tib386-modal-head"><div><h3 style="margin:0">👁 Предпросмотр '+esc(sku)+'</h3><p class="tib386-muted">Готовая инфографика из фоновой очереди</p></div>'+
 '<button data-tib-preview-close aria-label="Закрыть предпросмотр">✕ Закрыть</button></div>'+
 '<div id="tib386-preview-body" class="tib386-muted" aria-live="polite">Открываю сохранённые PNG…</div></div>';
 shade.addEventListener('click',async e=>{
   if(e.target===shade||e.target.closest('[data-tib-preview-close]')){closePreview();return}
   const button=e.target.closest('button');
   if(!button)return;
   if(button.hasAttribute('data-tib-preview-slide')){
     const no=Number(button.dataset.tibPreviewSlide),img=shade.querySelector('#tib386-main-img');
     if(!img||!previewUrls[no])return;
     img.src=previewUrls[no];
     shade.querySelectorAll('[data-tib-preview-slide]').forEach(x=>x.classList.toggle('active',Number(x.dataset.tibPreviewSlide)===no));
   }else if(button.hasAttribute('data-tib-preview-zip')&&previewZipBlob){
     downloadBlob('21vek_'+previewSku.replace(/[^a-zA-Z0-9_-]/g,'_')+'_7slides.zip',previewZipBlob);
   }
 });
 document.body.appendChild(shade);previewOverlay=shade;
 document.addEventListener('keydown',previewOnEscape);
}
async function previewSkuNow(sku){
 const batchId=current?.id;
 if(!batchId||!list(current.items).some(x=>x.status==='completed'&&x.sku===sku))throw Error('Нужный SKU ещё не готов');
 previewShell(sku);
 const epoch=previewSequence;
 const body=previewOverlay?.querySelector('#tib386-preview-body');
 try{
   const [meta,JSZip]=await Promise.all([invoke('batch-preview',{batch_id:batchId,sku}),zipLib()]);
   if(epoch!==previewSequence||!previewOverlay)return;
   const response=await fetch(meta.url);
   if(!response.ok)throw Error('Не удалось открыть сохранённые файлы: HTTP '+response.status);
   const buffer=await response.arrayBuffer();
   if(buffer.byteLength>50*1024*1024)throw Error('Комплект слишком велик для просмотра в браузере');
   const zip=await JSZip.loadAsync(buffer);
   if(epoch!==previewSequence||!previewOverlay)return;
   const slides=Object.keys(zip.files).filter(x=>/^slide_\d{2}\.png$/i.test(x)).sort();
   if(!slides.length)throw Error('В сохранённом комплекте пока нет PNG');
   const urls=[];
   for(const file of slides.slice(0,7)){
     const blob=await zip.files[file].async('blob');
     const url=URL.createObjectURL(new Blob([blob],{type:'image/png'}));
     urls.push(url);
   }
   if(epoch!==previewSequence||!previewOverlay){urls.forEach(x=>URL.revokeObjectURL(x));return}
   previewUrls=urls;previewZipBlob=new Blob([buffer],{type:'application/zip'});
   let audit=null;
   try{if(zip.files['audit.json'])audit=JSON.parse(await zip.files['audit.json'].async('string'))}catch(_){}
   if(epoch!==previewSequence||!previewOverlay)return;
   const auditInfo=audit&&Array.isArray(audit.warnings)?audit.warnings.slice(0,5):[];
   const trustedUrl=typeof meta.product_url==='string'&&/^https:\/\/(?:www\.)?21vek\.by\//i.test(meta.product_url)?meta.product_url:'';
   body.innerHTML='<div class="tib386-actions"><b>'+esc(meta.product_name||meta.sku)+'</b>'+
   '<button class="tib386-primary" data-tib-preview-zip>↓ Скачать 7 слайдов (ZIP)</button>'+
   (trustedUrl?'<a href="'+esc(trustedUrl)+'" target="_blank" rel="noopener noreferrer">Карточка 21vek ↗</a>':'')+'</div>'+
   '<div class="tib386-preview-main"><img id="tib386-main-img" src="'+urls[0]+'" alt="Слайд 1"></div>'+
   '<div class="tib386-thumbs">'+urls.map((url,i)=>'<button data-tib-preview-slide="'+i+'" class="'+(i===0?'active':'')+'" title="Слайд '+(i+1)+'"><img src="'+url+'" alt="Слайд '+(i+1)+'"></button>').join('')+'</div>'+
   '<p class="tib386-muted">Слайды отображаются из готового ZIP, который уже сохранил сервер. Это не повторная генерация.</p>'+
   (auditInfo.length?auditInfo.map(w=>'<div class="tib386-preview-warning">⚠ '+esc(w)+'</div>').join(''):'')+
   '<div class="tib386-preview-warning">Перед публикацией проверь, что характеристики и модель на всех слайдах правильные.</div>';
 }catch(err){
   if(epoch===previewSequence&&previewOverlay&&body)body.innerHTML='<div class="tib386-note err">'+esc(err?.message||err)+'</div>';
 }
}
async function download(id){
 if(downloading)return;
 downloading=true;banner='Готовлю архив для скачивания…';bannerError=false;draw();
 try{
  const info=await invoke('batch-download',{batch_id:id}),files=list(info.files);
  if(!files.length)throw Error('Архив ещё не готов');
  if(files.length===1){
   const response=await fetch(files[0].url);
   if(!response.ok)throw Error('Архив недоступен: HTTP '+response.status);
   downloadBlob('21vek_all_infographics.zip',await response.blob());
  }else{
   const JSZip=await zipLib(),out=new JSZip();
   for(let i=0;i<files.length;i++){
    banner='Собираю единый ZIP, часть '+(i+1)+' из '+files.length;draw();
    const r=await fetch(files[i].url);if(!r.ok)throw Error('Архивная часть '+(i+1)+' недоступна');
    const part=await JSZip.loadAsync(await r.arrayBuffer());
    for(const [name,item] of Object.entries(part.files)){
     if(item.dir)continue;
     out.file(name,await item.async('uint8array'),{binary:true});
    }
   }
   banner='Формирую итоговый файл. Большой архив может собираться несколько минут…';draw();
   const blob=await out.generateAsync({type:'blob',compression:'STORE',streamFiles:true});
   downloadBlob('21vek_all_infographics.zip',blob);
  }
  banner='Архив создан и передан браузеру для скачивания.';bannerError=false;
 }catch(e){banner=String(e.message||e);bannerError=true}
 finally{downloading=false;draw()}
}
async function click(e){
 const b=e.target.closest('button');if(!b||!root?.contains(b))return;
 try{
  if(b.hasAttribute('data-tib-group')){
   const x=b.dataset.tibGroup;if(selected.has(x))selected.delete(x);else selected.add(x);draw();return;
  }
  if(b.hasAttribute('data-tib-preview')){await previewSkuNow(b.dataset.tibPreview);return}
  if(b.hasAttribute('data-tib-stop')){if(window.confirm('Остановить старую партию и сохранить готовые SKU?')){await invoke('batch-stop',{batch_id:b.dataset.tibStop});await showJob(b.dataset.tibStop)}return}
  if(b.hasAttribute('data-tib-start')){throw Error('Старый шаблонный генератор отключён. Используйте Инфографику 2.0.');}
  if(b.hasAttribute('data-tib-refresh')){await refresh();return}
  if(b.hasAttribute('data-tib-status')){await showJob(b.dataset.tibStatus);return}
  if(b.hasAttribute('data-tib-download')){await download(b.dataset.tibDownload);return}
 }catch(err){banner=String(err.message||err);bannerError=true;draw()}
}
function input(e){
 if(e.target.matches('[data-tib-ready-filter]')){
  readyFilter=e.target.value;const caret=e.target.selectionStart;
  draw();const next=root?.querySelector('[data-tib-ready-filter]');
  if(next){next.focus();try{next.setSelectionRange(caret,caret)}catch(_){}}
  return;
 }
 if(!e.target.matches('[data-tib-filter]'))return;
 filter=e.target.value;
 const caret=e.target.selectionStart;
 draw();
 const next=root?.querySelector('[data-tib-filter]');
 if(next){next.focus();try{next.setSelectionRange(caret,caret)}catch(_){}}
}
async function open(parent){
 if(window.RESANTA_TRIOVIST_FACTORY_V5_ACTIVE)return;
 if(!parent)return;
 closePreview();
 css();clearTimeout(timer);
 root=parent.querySelector('#tib386');
 if(!root){root=document.createElement('section');root.id='tib386';parent.insertBefore(root,parent.firstChild);}
 if(!root.dataset.bound){
  root.dataset.bound='1';root.addEventListener('click',click);root.addEventListener('input',input);
 }
 draw();
 try{await refresh()}catch(e){banner=String(e.message||e);bannerError=true;draw()}
}
window.RESANTA_TRIOVIST_INFOGRAPHIC_BATCH_V236386=Object.freeze({version:VERSION,open,refresh,backgroundJobs:true,sourceMatched:true,archiveDownload:true});
})();