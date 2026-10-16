/* RESANTA CRM v23.6.385 · TRIOVIST INFOGRAPHIC STUDIO
 * Isolated, on-demand UI. No polling, no mutation of legacy cards/parser.
 * AI produces evidence-indexed storyboard; SVG/PNG uses an original photo provided by the operator.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_INFOGRAPHICS_V236385)return;
const VERSION='23.6.385',FUNCTION='triovist-infographic-ai-v236385';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=(x,n=200)=>String(x??'').replace(/\s+/g,' ').trim().slice(0,n);
const arr=x=>Array.isArray(x)?x:[];
const getDb=()=>{try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}};
let mount=null,context=null,project=null,mode='professional',concept='rational',photo='',photoName='',items=[],saved=[],busy=false,searchTimer=null,epoch=0,started=false;
const brandStyle=name=>{
 const n=String(name||'').toLowerCase();
 if(n.includes('huter'))return {brand:'HUTER',primary:'#f0a300',dark:'#29230c',pale:'#fff8e6'};
 if(n.includes('вихр'))return {brand:'ВИХРЬ',primary:'#e43839',dark:'#162c46',pale:'#fdf0f0'};
 if(n.includes('eurolux'))return {brand:'EUROLUX',primary:'#246bc4',dark:'#122236',pale:'#edf5ff'};
 return {brand:'РЕСАНТА',primary:'#dd3333',dark:'#162a3e',pale:'#fef0f0'};
};
function installCss(){
 if(document.getElementById('tig385-css'))return;
 const style=document.createElement('style');style.id='tig385-css';
 style.textContent=[
 '.tig385{font:inherit;color:#1e293b}.tig385 h3{font-size:20px;margin:0}.tig385 h4{font-size:14px;margin:0}.tig385 p{margin:4px 0 10px}',
 '.tig385-head{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:16px}',
 '.tig385-sub{color:#64748b;font-size:12px;line-height:1.5}',
 '.tig385-tabs{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0 14px}',
 '.tig385 button,.tig385 select{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:9px;padding:9px 12px;cursor:pointer;font:inherit;font-size:12px}',
 '.tig385 button:disabled{opacity:.45;cursor:default}.tig385 button.primary{background:#165da3;color:#fff;border-color:#165da3;font-weight:800}',
 '.tig385 button.sel{background:#e9f3ff;color:#0c4a7a;border-color:#93c5fd;font-weight:800}',
 '.tig385 input{width:100%;box-sizing:border-box;min-height:40px;padding:8px 12px;border:1px solid #cbd5e1;border-radius:9px;font:inherit}',
 '.tig385-search{display:grid;grid-template-columns:minmax(160px,1fr) auto;gap:8px;margin:9px 0}',
 '.tig385-results{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:7px;margin-bottom:12px;max-height:270px;overflow:auto}',
 '.tig385-item{display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:3px;min-width:0}',
 '.tig385-item b{color:#0f4d86}.tig385-item small{color:#64748b;font-size:10px}',
 '.tig385-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:12px 0}',
 '.tig385-card{border:1px solid #dfe6ef;border-radius:12px;padding:12px;background:white;min-width:0}',
 '.tig385-card p{font-size:12px;color:#475569}.tig385-card .tiny{font-size:10px;color:#64748b}',
 '.tig385-note{background:#eff6ff;border:1px solid #bfdbfe;color:#164e80;border-radius:10px;padding:10px 12px;font-size:12px;margin:10px 0;line-height:1.5}',
 '.tig385-alert{background:#fff8e8;border:1px solid #f8ce7e;color:#88540b;border-radius:10px;padding:10px 12px;font-size:12px;margin:10px 0;line-height:1.5}',
 '.tig385-error{background:#fff1f2;color:#991b1b;border:1px solid #fecdd3;padding:12px;border-radius:10px;margin-top:10px}',
 '.tig385-concept{display:flex;flex-direction:column;gap:8px;min-height:120px}.tig385-concept.sel{border:2px solid #60a5fa;background:#eff6ff}',
 '.tig385-facts{display:flex;gap:5px;flex-wrap:wrap;margin:7px 0}.tig385-facts span{font-size:11px;border-radius:7px;background:#eef2f7;padding:5px 7px}',
 '.tig385-stage{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;margin:14px 0}',
 '.tig385-slide{border:1px solid #e1e8f1;border-radius:12px;background:#fff;padding:8px;min-width:0}',
 '.tig385-slide img{display:block;width:100%;aspect-ratio:4/5;object-fit:contain;border-radius:8px;background:#e2e8f0}',
 '.tig385-slide h4{font-size:12px;line-height:1.3;margin:8px 0 5px}.tig385-slide small{font-size:10px;color:#64748b}',
 '.tig385-small-btn{padding:5px 9px!important;font-size:11px!important;margin-top:7px}',
 '.tig385-list{display:flex;flex-wrap:wrap;gap:7px;margin-top:8px}.tig385-list button{text-align:left}',
 '.tig385-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
 '.tig385-photo{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px;border:1px dashed #94a3b8;border-radius:11px;background:#f8fafc}',
 '@media(max-width:640px){.tig385-search{grid-template-columns:1fr}.tig385-stage{grid-template-columns:repeat(2,minmax(0,1fr))}}'
 ].join('');
 document.head.appendChild(style);
}
function errorMessage(err){
 const msg=text(err?.context?.message||err?.message||err,220);
 return msg||'Неизвестная ошибка';
}
async function invoke(action,extras={}){
 const d=getDb();if(!d?.functions)throw Error('Подключение к CRM ещё не готово');
 const {data,error}=await d.functions.invoke(FUNCTION,{body:{action,...extras}});
 if(error)throw Error('Сервер инфографики не ответил: '+errorMessage(error));
 if(!data?.ok)throw Error(data?.message||data?.error||'Сервер вернул ошибку');
 return data;
}
const factById=id=>arr(project?.fact_snapshot).find(f=>f.id===id);
const specsForSlide=slide=>arr(slide.fact_ids).map(factById).filter(Boolean);
function sectionIntro(){
 return '<div class="tig385-head"><div><h3>🎨 Триовист · Инфографика 21vek</h3><p class="tig385-sub">Анализ товара → конкуренты → 3 концепции → слайды → проверка фактов. Генерация только по данным 21vek.</p></div><div class="tig385-actions"><button data-ig-reload>↻ Обновить проекты</button><span class="tig385-sub">v'+VERSION+'</span></div></div>';
}
function toolbar(){
 return '<div class="tig385-tabs"><button class="'+(mode==='fast'?'sel':'')+'" data-ig-mode="fast">⚡ Быстрый · 5 слайдов</button>'+
 '<button class="'+(mode==='professional'?'sel':'')+'" data-ig-mode="professional">★ Профессиональный · 7 слайдов</button>'+
 '<button class="'+(mode==='ab'?'sel':'')+'" data-ig-mode="ab">A/B · 3 концепции</button></div>';
}
function resultsHtml(){
 if(!items.length)return '<p class="tig385-sub">Поиск по артикулу или названию. Выберите товар из базы 21vek.</p>';
 return items.map((r,i)=>'<button class="tig385-item" data-ig-sku="'+esc(r.sku)+'"><b>'+esc(r.sku)+'</b><span>'+esc(r.product_name)+'</span><small>'+esc(r.subgroup||r.category||'')+' · '+(r.manager_email||'').includes('krishtal')?'':'').join('');
}
function searchHtml(){
 return '<div class="tig385-card"><h4>1. Выберите товар</h4><div class="tig385-search"><input id="tig385-q" placeholder="Артикул 67/1/44 или название товара" autocomplete="off"><button data-ig-search>Поиск</button></div><div id="tig385-results" class="tig385-results"></div><div id="tig385-current"></div></div>';
}
function renderResults(){
 const el=mount?.querySelector('#tig385-results');if(!el)return;
 if(!items.length){el.innerHTML='<p class="tig385-sub">Введите артикул или название товара.</p>';return}
 el.innerHTML=items.map(r=>'<button class="tig385-item" data-ig-sku="'+esc(r.sku)+'"><b>'+esc(r.sku)+'</b><span>'+esc(r.product_name||'')+'</span><small>'+esc(r.subgroup||r.category||'')+'</small></button>').join('');
}
async function search(q){
 const target=mount,seq=++epoch;
 const d=await invoke('search',{query:text(q,100)});
 if(target!==mount||seq!==epoch)return;
 items=d.items||[];renderResults();
}
function createIntro(sku){
 const selected=items.find(r=>String(r.sku)===String(sku));
 const area=mount?.querySelector('#tig385-current');
 if(!area||!selected)return;
 area.innerHTML='<div class="tig385-note"><b>Выбрано: '+esc(selected.sku)+'</b> · '+esc(selected.product_name)+
 '</div><button class="primary" data-ig-generate="'+esc(selected.sku)+'">🤖 Анализ + 3 концепции + слайды</button>'+
 '<p class="tig385-sub">ИИ использует фактические характеристики и сравнения с конкурентами. Результат сохраняется отдельным черновиком, существующую карточку не изменяет.</p>';
}
function savedHtml(){
 const list=saved.slice(0,15);
 return '<div class="tig385-card" style="margin-top:12px"><h4>Сохранённые проекты</h4><div class="tig385-list">'+
 (list.length?list.map(x=>'<button data-ig-open="'+esc(x.id)+'"><b>'+esc(x.sku)+'</b> · '+esc(x.product_snapshot?.product_name||'')+
  '<br><small>'+esc(x.mode||'')+' · '+esc(x.state||'черновик')+' · '+esc((x.updated_at||'').slice(0,10))+'</small></button>').join(''):'<span class="tig385-sub">Пока нет проектов.</span>')+'</div></div>';
}
function factsHtml(facts){
 return '<div class="tig385-facts">'+facts.map(f=>'<span title="'+esc(f.source||'21vek')+'">'+esc(f.label)+': <b>'+esc(f.value)+'</b></span>').join('')+'</div>';
}
function conceptsHtml(){
 const d=project.design||{};
 return '<h4 style="margin-top:16px">2. Выбор концепции первого экрана</h4>'+
 '<div class="tig385-grid">'+arr(d.concepts).map(c=>
 '<div class="tig385-card tig385-concept '+(concept===c.key?'sel':'')+'"><b>'+esc(c.name)+'</b><p>'+esc(c.headline||'')+'</p>'+
 '<p class="tig385-sub">'+esc(c.rationale||'')+'</p>'+
 '<button class="'+(concept===c.key?'sel':'')+'" data-ig-concept="'+esc(c.key)+'">'+(concept===c.key?'✓ Выбрано':'Выбрать концепцию')+'</button></div>'
 ).join('')+'</div>';
}
function qaHtml(){
 const d=project.design||{},p=project.product_snapshot||{};
 const warns=[...arr(d.warnings),...arr(d.missing_data).map(x=>'Не хватает данных: '+x)];
 if(!photo)warns.unshift('Для экспорта готовых PNG необходимо добавить оригинальное фото именно этого товара.');
 if(p.stale_specs)warns.unshift('Характеристики старше 10 дней или не получены. Перепроверьте перед публикацией.');
 return '<div class="tig385-card"><h4>4. Контроль достоверности</h4>'+
 (warns.length?warns.map(w=>'<div class="tig385-alert">⚠ '+esc(w)+'</div>').join(''):'<div class="tig385-note">Заявления привязаны к источникам. Перед публикацией проверьте визуальный результат и карточку.</div>')+
 '<p class="tig385-sub">Источники цифр: нормализованные характеристики нашего товара 21vek. Слабые или неподтверждённые отличия не включены в продающие заявления.</p>'+
 '<div class="tig385-actions"><button data-ig-brief>↓ Скачать ТЗ / JSON</button>'+
 (context?.is_leader&&project.state!=='approved'?'<button data-ig-approve>✓ Утвердить структуру</button>':'')+
 '<span class="tig385-sub">'+(project.state==='approved'?'Структура утверждена':'Черновик · не опубликовано')+'</span></div></div>';
}
function photoHtml(){
 return '<div class="tig385-photo"><div><b>3. Оригинальное фото товара</b><p class="tig385-sub">Загрузите фото с правильной моделью и артикулом. Фото остаётся в браузере — CRM не подменяет товар и не использует снимки конкурентов.</p></div>'+
 '<label style="display:inline-block;background:#165da3;color:#fff;padding:9px 12px;border-radius:8px;cursor:pointer">＋ Добавить фото<input id="tig385-photo" type="file" accept="image/png,image/jpeg,image/webp" style="display:none"></label>'+
 '<span class="tig385-sub">'+esc(photoName||'Фото не загружено')+'</span></div>';
}
function letters(s,max=24,maxRows=3){
 const words=text(s,180).split(/\s+/).filter(Boolean),lines=[],current=[];
 for(const word of words){
  if((current.join(' ')+' '+word).trim().length>max&&current.length){lines.push(current.join(' '));current.length=0}
  current.push(word);
 }if(current.length)lines.push(current.join(' '));
 if(lines.length>maxRows){lines.splice(maxRows);lines[maxRows-1]=lines[maxRows-1].slice(0,max-1)+'…'}
 return lines;
}
function svgSlide(slide){
 const p=project?.product_snapshot||{},style=brandStyle(p.product_name),currentConcept=arr(project?.design?.concepts).find(x=>x.key===concept),isCover=slide.number===1;
 const title=isCover?(currentConcept?.headline||slide.title):slide.title;
 const label=style.brand+'  ·  21VEK';
 const facts=specsForSlide(slide).slice(0,isCover?3:4);
 const header=letters(title,27,3).map((line,i)=>'<text x="75" y="'+(268+i*79)+'" font-family="Arial, sans-serif" font-size="65" font-weight="800" fill="'+style.dark+'">'+esc(line)+'</text>').join('');
 const subtitle=letters(slide.subtitle||'',52,2).map((line,i)=>'<text x="75" y="'+(440+i*35)+'" font-family="Arial, sans-serif" font-size="27" fill="#475569">'+esc(line)+'</text>').join('');
 const productImage=photo?'<image x="170" y="510" width="860" height="625" href="'+photo+'" preserveAspectRatio="xMidYMid meet"/>':
 '<rect x="175" y="568" width="850" height="506" rx="34" fill="#fff" stroke="#d4dce8" stroke-dasharray="16 16"/>'+
 '<text x="600" y="840" fill="#64748b" font-size="35" text-anchor="middle" font-family="Arial">Оригинальное фото товара</text>';
 const badges=facts.map((fact,i)=>{
   const w=facts.length===1?1020:facts.length===2?494:Math.floor((1020-20*(facts.length-1))/facts.length);
   const x=75+i*(w+20),y=1205;
   return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="176" rx="22" fill="#fff" stroke="#dce4ef" stroke-width="2"/>'+
   '<text x="'+(x+22)+'" y="'+(y+46)+'" font-family="Arial" font-size="21" fill="#64748b">'+esc(text(fact.label,23))+'</text>'+
   '<text x="'+(x+22)+'" y="'+(y+110)+'" font-family="Arial" font-weight="800" font-size="'+(fact.value.length>15?28:39)+'" fill="'+style.dark+'">'+esc(text(fact.value,22))+'</text>';
 }).join('');
 return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500">'+
 '<rect width="1200" height="1500" fill="'+style.pale+'"/>'+
 '<rect x="0" y="0" width="1200" height="158" fill="'+style.primary+'"/>'+
 '<text x="75" y="104" font-size="49" font-weight="900" font-family="Arial, sans-serif" fill="'+(style.brand==='HUTER'?'#201d14':'#fff')+'">'+esc(label)+'</text>'+
 '<circle cx="1115" cy="410" r="170" fill="'+style.primary+'" opacity=".11"/>'+
 '<circle cx="-40" cy="1000" r="250" fill="'+style.primary+'" opacity=".07"/>'+
 header+subtitle+productImage+badges+
 '<rect x="0" y="1450" width="1200" height="50" fill="'+style.dark+'"/>'+
 '<text x="75" y="1482" font-size="21" font-family="Arial" fill="#fff">Артикул: '+esc(p.sku||'')+'</text>'+
 '<text x="1125" y="1482" text-anchor="end" font-size="21" font-family="Arial" fill="#fff">'+slide.number+'/'+arr(project?.design?.slides).length+'</text>'+
 '</svg>';
}
function preview(slide){
 const content=svgSlide(slide);return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(content);
}
function slidesHtml(){
 return '<h4 style="margin-top:16px">5. Слайды для 21vek</h4>'+
 '<p class="tig385-sub">Тексты и фактологию подготовил ИИ. Для итоговых PNG требуется оригинальное фото. Размер макетов: 1200 × 1500.</p>'+
 '<div class="tig385-stage">'+arr(project?.design?.slides).map(s=>
 '<div class="tig385-slide"><img src="'+preview(s)+'" alt="Слайд '+s.number+'"><h4>'+esc(s.number+'. '+s.title)+'</h4>'+
 factsHtml(specsForSlide(s).slice(0,3))+'<small>'+esc(s.visual_brief||'')+'</small>'+
 '<button class="tig385-small-btn" data-ig-png="'+s.number+'" '+(photo?'':'disabled title="Добавьте оригинальное фото"')+'>↓ Скачать PNG</button></div>'
 ).join('')+'</div>';
}
function projectHtml(){
 const p=project?.product_snapshot||{},d=project?.design||{};
 return '<div class="tig385-card" style="margin-top:14px">'+
 '<div class="tig385-head"><div><h4>'+esc(p.product_name||'')+'</h4><p class="tig385-sub">Артикул '+esc(p.sku||'')+' · '+esc(p.subgroup||p.category||'')+'</p>'+
 '<p class="tig385-sub">Стратегия: '+esc(d.strategy||'')+'. '+esc(d.rationale||'')+'</p></div>'+
 (p.product_url?'<a target="_blank" rel="noopener" href="'+esc(p.product_url)+'">Карточка 21vek ↗</a>':'')+'</div>'+
 '<div class="tig385-note">Подтверждено характеристик: <b>'+arr(project?.fact_snapshot).length+'</b> · '+esc(d.summary||'')+'</div>'+
 factsHtml(arr(project?.fact_snapshot).slice(0,18))+
 conceptsHtml()+photoHtml()+qaHtml()+slidesHtml()+'</div>';
}
function render(){
 if(!mount)return;
 mount.innerHTML='<div class="tig385">'+sectionIntro()+toolbar()+searchHtml()+savedHtml()+(project?projectHtml():'')+
 '<div id="tig385-status" aria-live="polite"></div></div>';
 renderResults();
}
function status(message,isError=false){
 const el=mount?.querySelector('#tig385-status');
 if(el)el.innerHTML='<div class="'+(isError?'tig385-error':'tig385-note')+'">'+esc(message)+'</div>';
}
function fileDownload(name,blob){
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
async function png(number){
 if(!photo)throw Error('Сначала загрузите оригинальное фото товара');
 const slide=arr(project?.design?.slides).find(x=>x.number===number);if(!slide)throw Error('Слайд не найден');
 const svg=svgSlide(slide),blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob);
 try{
  const image=await new Promise((ok,no)=>{const im=new Image();im.onload=()=>ok(im);im.onerror=()=>no(Error('Не удалось подготовить PNG'));im.src=url});
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1500;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Браузер не поддерживает экспорт');
  ctx.drawImage(image,0,0);
  const out=await new Promise((ok,no)=>canvas.toBlob(b=>b?ok(b):no(Error('PNG не создан')),'image/png',1));
  fileDownload('21vek_'+text(project.sku,80).replace(/[^a-zA-Z0-9_-]/g,'_')+'_slide_'+number+'.png',out);
 }finally{URL.revokeObjectURL(url)}
}
async function loadPhoto(file){
 if(!file||!/^image\/(png|jpeg|webp)$/.test(file.type))throw Error('Фото должно быть JPG, PNG или WebP');
 if(file.size>8*1024*1024)throw Error('Размер фото больше 8 МБ');
 const result=await new Promise((ok,no)=>{
   const reader=new FileReader();reader.onload=()=>ok(String(reader.result||''));reader.onerror=()=>no(Error('Не удалось прочитать фото'));
   reader.readAsDataURL(file);
 });
 const im=await new Promise((ok,no)=>{const img=new Image();img.onload=()=>ok(img);img.onerror=()=>no(Error('Файл не является изображением'));img.src=result});
 if(im.naturalWidth<650||im.naturalHeight<650)throw Error('Слишком маленькое фото: необходимо хотя бы 650 × 650');
 photo=result;photoName=file.name;render();
}
async function doGenerate(sku){
 if(busy)return;busy=true;status('Анализируем подтверждённые характеристики и конкурентов…');
 const button=mount?.querySelector('[data-ig-generate]');if(button)button.disabled=true;
 try{
  const d=await invoke('generate',{sku,mode});project=d.project;concept=project.concept_key||'rational';photo='';photoName='';saved.unshift(project);
  render();status('Черновик создан и сохранён. Для экспорта загрузите официальное фото товара.');
 }catch(e){status(errorMessage(e),true)}finally{busy=false;if(button?.isConnected)button.disabled=false}
}
async function doOpen(id){
 if(busy)return;
 try{const d=await invoke('get',{id});project=d.project;concept=project.concept_key||'rational';photo='';photoName='';render();}
 catch(e){status(errorMessage(e),true)}
}
async function chooseConcept(key){
 if(!project||busy)return;const prev=concept;concept=key;render();
 try{const d=await invoke('select',{id:project.id,concept_key:key});project=d.project;render()}
 catch(e){concept=prev;render();status(errorMessage(e),true)}
}
async function approve(){
 if(!project||!context?.is_leader)return;
 if(!confirm('Утвердить структуру? Это не публикует материалы на 21vek.'))return;
 try{const d=await invoke('approve',{id:project.id});project=d.project;render()}
 catch(e){status(errorMessage(e),true)}
}
function brief(){
 if(!project)return;
 const data={version:VERSION,marketplace:'21vek.by',product:project.product_snapshot,mode:project.mode,
   selected_concept:concept,concepts:project.design?.concepts,slides:project.design?.slides,
   verified_facts:project.fact_snapshot,warnings:project.design?.warnings,missing_data:project.design?.missing_data,
   technical_spec:'Размер 1200x1500, оригинальное фото SKU, без замены модели. Один тезис на слайд. Проверить данные перед публикацией.',
   prompt:'Создай чистую инфографику строго по verified_facts и slides, не добавляй неизвестные характеристики, используйте фирменный стиль бренда, не копируй конкурентов.'};
 fileDownload('21vek_infographic_'+text(project.sku).replace(/[^a-zA-Z0-9_-]/g,'_')+'.json',new Blob([JSON.stringify(data,null,2)],{type:'application/json;charset=utf-8'}));
}
async function reload(){
 try{const r=await invoke('list');saved=r.items||[];render()}
 catch(e){status(errorMessage(e),true)}
}
async function handleClick(e){
 const b=e.target.closest('button');if(!b||!mount?.contains(b))return;
 try{
  if(b.hasAttribute('data-ig-mode')){mode=b.dataset.igMode;render();return}
  if(b.hasAttribute('data-ig-search')){await search(mount.querySelector('#tig385-q')?.value||'');return}
  if(b.hasAttribute('data-ig-sku')){createIntro(b.dataset.igSku);return}
  if(b.hasAttribute('data-ig-generate')){await doGenerate(b.dataset.igGenerate);return}
  if(b.hasAttribute('data-ig-open')){await doOpen(b.dataset.igOpen);return}
  if(b.hasAttribute('data-ig-concept')){await chooseConcept(b.dataset.igConcept);return}
  if(b.hasAttribute('data-ig-png')){await png(Number(b.dataset.igPng));return}
  if(b.hasAttribute('data-ig-brief')){brief();return}
  if(b.hasAttribute('data-ig-approve')){await approve();return}
  if(b.hasAttribute('data-ig-reload')){await reload();return}
 }catch(x){status(errorMessage(x),true)}
}
async function handleChange(e){
 if(e.target?.id==='tig385-photo'){
  try{await loadPhoto(e.target.files?.[0])}catch(x){status(errorMessage(x),true)}
 }
}
function handleInput(e){
 if(e.target?.id!=='tig385-q')return;
 const val=e.target.value;
 clearTimeout(searchTimer);
 searchTimer=setTimeout(()=>search(val).catch(x=>status(errorMessage(x),true)),330);
}
async function open(el,ctx){
 if(!el)return;installCss();mount=el;context=ctx||{};project=null;photo='';photoName='';mode='professional';concept='rational';epoch++;
 if(!el.__tig385Bound){
  el.__tig385Bound=true;
  el.addEventListener('click',handleClick);
  el.addEventListener('change',handleChange);
  el.addEventListener('input',handleInput);
  el.addEventListener('keydown',e=>{if(e.target?.id==='tig385-q'&&e.key==='Enter'){e.preventDefault();search(e.target.value).catch(x=>status(errorMessage(x),true))}});
 }
 render();try{const d=await invoke('list');if(mount!==el)return;saved=d.items||[];render()}catch(e){status(errorMessage(e),true)}
}
window.RESANTA_TRIOVIST_INFOGRAPHICS_V236385=Object.freeze({version:VERSION,open,refresh:reload,isolated:true,aiServerValidated:true,sourcePhotosOnly:true,photoLocalOnly:true});
})();