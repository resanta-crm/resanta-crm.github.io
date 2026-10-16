/* Resanta CRM V2 premium infographic pilot - one SKU and director QA required.
 * Fully isolated from legacy bulk and single-SKU editors.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_PREMIUM_V236390)return;
const FN='triovist-infographic-v2-v236390';
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const a=x=>Array.isArray(x)?x:[];
const dbx=()=>{try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}};
let root=null,config=null,pilots=[],active=null,slides=[],images=[],message='',busy=false,timer=null,preview=false,selectedSku='',loading=false;
function styles(){
 if(document.getElementById('tiv2390-css'))return;
 const sheet=document.createElement('style');sheet.id='tiv2390-css';
 sheet.textContent=[
 '.tiv2390{border:2px solid #b6d5fa;border-radius:15px;padding:16px 18px;background:#f8fbff;color:#15304b;margin-bottom:14px;font:inherit}',
 '.tiv2390-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}',
 '.tiv2390 h3{margin:0 0 5px;font-size:20px}.tiv2390 h4{margin:12px 0;font-size:15px}',
 '.tiv2390 p{font-size:12px;line-height:1.5;color:#546778;margin:5px 0}',
 '.tiv2390-label{font-weight:700}.tiv2390-caption{font-size:11px;color:#61758a}',
 '.tiv2390-tag{display:inline-block;border-radius:20px;background:#e4f2ff;color:#0d558c;padding:5px 9px;font-size:12px;font-weight:700}',
 '.tiv2390-input{width:min(350px,100%);padding:10px 12px;border:1px solid #bfd2e4;border-radius:9px;background:white;box-sizing:border-box;font:inherit}',
 '.tiv2390 button{border:1px solid #bfd2e4;border-radius:9px;padding:8px 12px;background:white;color:#124c75;cursor:pointer;font:inherit;font-size:12px}',
 '.tiv2390 button:disabled{opacity:.46;cursor:default}.tiv2390 .prime{background:#155e9b;color:white;border-color:#155e9b;font-weight:750}',
 '.tiv2390 .danger{background:#fff4f4;color:#ac3131;border-color:#ffc3c3}',
 '.tiv2390-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:9px 0}',
 '.tiv2390-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(178px,1fr));gap:10px;margin:11px 0}',
 '.tiv2390-thumb{min-width:0;padding:6px;background:white;border:1px solid #d4e2ed;border-radius:10px;overflow:hidden}',
 '.tiv2390-thumb img{display:block;width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:7px}',
 '.tiv2390-thumb b,.tiv2390-thumb small{display:block;margin:5px 0;font-size:11px}',
 '.tiv2390-progress{height:10px;background:#e2e8f0;border-radius:99px;overflow:hidden;margin:9px 0}',
 '.tiv2390-progress span{display:block;height:100%;background:#237ec1;border-radius:99px}',
 '.tiv2390-note{border-radius:9px;background:#e8f3ff;padding:9px 11px;color:#1b507d;font-size:12px;margin:9px 0}',
 '.tiv2390-warn{background:#fff4dd;color:#85601d;border:1px solid #ffe0a7;padding:10px;border-radius:9px;font-size:12px;margin:10px 0}',
 '.tiv2390-list{display:flex;gap:5px;flex-wrap:wrap;margin:9px 0}',
 '.tiv2390-list button{padding:7px 10px!important}',
 '@media(max-width:600px){.tiv2390{padding:12px}.tiv2390-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}'
 ].join('');
 document.head.appendChild(sheet);
}
async function req(action,args={}){
 const d=dbx();
 if(!d?.functions?.invoke)throw Error('Сначала дождитесь подключения CRM к базе');
 const {data,error}=await d.functions.invoke(FN,{body:{action,...args}});
 if(error){
  let detail='';
  try{const body=await error.context?.json?.();detail=body?.message||body?.error||''}catch(_){}
  throw Error(detail||error.message||'Сервер недоступен');
 }
 if(!data?.ok)throw Error(data?.message||data?.error||'Ошибка обработки');
 return data;
}
function banner(){
 if(!config)return '<p>Проверяем ИИ-провайдеров и доступ…</p>';
 if(!config.image_provider_ready)return '<div class="tiv2390-warn">Новый графический ИИ ещё не подключён: на сервере нет OPENAI_API_KEY. Запуск заблокирован — старый шаблон вместо профессиональной инфографики не используется.</div>';
 if(!config.text_provider_ready)return '<div class="tiv2390-warn">Нет ключа текстового ИИ для создания восьми сценариев. Запуск заблокирован.</div>';
 return '<div class="tiv2390-note">Премиальный генератор подключён. Сначала создаём только один комплект из 8 изображений, проверяем качество и стоимость. Массовая очередь до 300 SKU пока заблокирована.</div>';
}
function currentHtml(){
 if(!active)return '<p>Пока нет тестовых комплектов. Выбери точный артикул для первой проверки.</p>';
 const x=active,ready=Number(x.completed_slides||0),status=x.status;
 const state={queued:'В очереди',processing:'Генерация',needs_review:'Готово к проверке',approved:'Утверждено',cancelled:'Остановлено',failed:'Ошибка'};
 const done=ready===8&&['needs_review','approved'].includes(status);
 const mimeRepair=status==='failed'&&!x.recovery_approved&&Number(x.paid_images_started||0)===1&&
   /mime type image\/png is not supported/i.test(x.error_message||'');
 return '<div style="border-top:1px solid #cbdcec;margin-top:12px;padding-top:12px">'+
 '<div class="tiv2390-header"><div><h4>Тестовый SKU: '+h(x.sku)+'</h4><p>'+h(x.product_name)+'</p></div>'+
 '<span class="tiv2390-tag">'+h(state[status]||status)+'</span></div>'+
 '<div class="tiv2390-progress"><span style="width:'+(ready/8*100)+'%"></span></div>'+
 '<div class="tiv2390-actions"><b>'+ready+'/8 слайдов</b><span class="tiv2390-caption">Платных запросов: '+Number(x.paid_images_started||0)+' / '+Number(x.max_paid_images||8)+'</span>'+
 '<button data-v2-status>↻ Проверить результат</button>'+
 (['queued','processing'].includes(status)?'<button class="danger" data-v2-cancel>⏹ Остановить тест</button>':'')+
 (mimeRepair?'<button class="prime" data-v2-recover>↻ Продолжить после исправления PNG</button>':'')+
 (done?'<button class="prime" data-v2-download-all>↓ Скачать 8 PNG одним ZIP</button>':'')+
 (status==='needs_review'&&x.audit?.editorial_version==='2.1'&&!a(x.audit?.pending_recompose).length&&x.audit?.hero_verified&&x.audit?.scene_layers_preserved?'<button data-v2-approve>✓ Утвердить образец</button>':'')+'</div>'+
 '<p class="tiv2390-caption">'+h(x.stage||'')+'</p>'+
 (status==='needs_review'&&x.audit?.editorial_version!=='2.1'?
   '<div class="tiv2390-warn">Этот комплект был создан старым движком 2.0. Сохраняем изображения и ZIP, но не утверждаем их по новому стандарту: в них нет гарантированной редакционной проверки и отдельных исходных сцен.</div>':'')+
 (a(x.audit?.pending_recompose).length?
   '<div class="tiv2390-note">Текстовые исправления ожидают фоновую пересборку PNG (без платных запросов к графическому ИИ).</div>':'')+
 (mimeRepair?'<div class="tiv2390-warn">Исправлена настройка PNG в хранилище. Первая платная картинка не сохранилась. Для полного комплекта из 8 PNG потребуется ещё до 8 платных запросов (до 9 всего). Повтор будет только после твоего подтверждения.</div>':'')+
 (x.error_message&&!mimeRepair?'<div class="tiv2390-warn">'+h(x.error_message)+'</div>':'')+
 (status==='approved'?'<div class="tiv2390-note">Образец утверждён директором. Автоматическая массовая генерация всё ещё закрыта до отдельного включения производственного конвейера.</div>':'')+
 previews()+'</div>';
}
function previews(){
 if(!images.length)return '';
 const canEdit=active?.audit?.editorial_version==='2.1'&&active?.audit?.scene_layers_preserved&&
       active?.status==='needs_review';
 const story=a(active?.storyboard);
 return '<h4>Предпросмотр готовых PNG</h4><p>Точные характеристики на обложке и независимые рекламные сцены. Для нового комплекта 2.1 можно исправить русские подписи без платной генерации изображений.</p>'+
 '<div class="tiv2390-grid">'+images.map(im=>{
 const slide=story[im.slide_no-1]||{};
 return '<div class="tiv2390-thumb">'+
 '<a href="'+h(im.url)+'" target="_blank" rel="noopener noreferrer"><img loading="lazy" src="'+h(im.url)+'" alt="Слайд '+im.slide_no+'"></a>'+
 '<b>Слайд '+im.slide_no+' из 8</b><a href="'+h(im.url)+'" target="_blank" rel="noopener noreferrer">Открыть полностью ↗</a>'+
 (canEdit&&im.slide_no>1?'<details style="margin-top:9px"><summary style="cursor:pointer;color:#145c96;font-size:12px">Редактировать подпись</summary>'+
 '<label class="tiv2390-caption">Заголовок</label>'+
 '<input class="tiv2390-input" maxlength="95" style="width:100%" data-v2-copy-title="'+im.slide_no+'" value="'+h(slide.title||'')+'">'+
 '<label class="tiv2390-caption">Подзаголовок</label>'+
 '<input class="tiv2390-input" maxlength="120" style="width:100%" data-v2-copy-subtitle="'+im.slide_no+'" value="'+h(slide.subtitle||'')+'">'+
 '<button style="margin-top:6px" data-v2-save-copy="'+im.slide_no+'">Сохранить текст без оплаты</button>'+
 '</details>':'')+'</div>';
 }).join('')+'</div>';
}
function draw(){
 if(!root?.isConnected)return;
 root.innerHTML='<div class="tiv2390"><div class="tiv2390-header"><div><h3>✨ Инфографика 2.1 — премиальная студия</h3>'+
 '<p>Теперь: 4–5 проверенных характеристик на главной обложке, разные композиции, редактура русского текста и отдельное сохранение чистых сцен.</p></div>'+
 '<span class="tiv2390-tag">2.1 · Пилот 1 SKU</span></div>'+banner()+
 '<div class="tiv2390-actions"><input class="tiv2390-input" data-v2-sku value="'+h(selectedSku)+'" placeholder="Введите точный артикул, например 74/1/20" aria-label="Артикул для премиального пилота">'+
 '<button class="prime" data-v2-start '+(busy||!config?.image_provider_ready||!config?.text_provider_ready||!config?.can_start||['queued','processing'].includes(active?.status)?'disabled':'')+'>🚀 Создать 8 профессиональных слайдов</button></div>'+
 '<p class="tiv2390-caption">Запуск одного SKU потребует до 8 платных операций генерации изображений. Автоповторы отключены. Ни одна карточка не публикуется автоматически.</p>'+
 currentHtml()+
 (pilots.length>1?'<h4>Предыдущие пилоты</h4><div class="tiv2390-list">'+pilots.slice(0,8).map(p=>'<button data-v2-load="'+h(p.id)+'">'+h(p.sku)+' · '+h(p.status)+'</button>').join('')+'</div>':'')+
 (message?'<div class="tiv2390-warn">'+h(message)+'</div>':'')+'</div>';
}
function schedule(){
 clearTimeout(timer);timer=null;
 if(!root?.isConnected||!active||!
    (['queued','processing'].includes(active.status)||
     (active.status==='needs_review'&&a(active.audit?.pending_recompose).length)))return;
 timer=setTimeout(async()=>{try{await status()}catch(e){message=e.message;draw()}schedule()},19000);
}
async function status(){
 if(!active)return;
 const id=active.id;
 let data;
 try{
   data=await req('status',{pilot_id:id});
 }catch(err){
   // The status endpoint may temporarily fail even while the saved project exists.
   // Reconcile against the canonical list; NEVER create a replacement paid pilot.
   const l=await req('list');
   if(!root?.isConnected)return;
   pilots=a(l.pilots);
   const actual=pilots.find(p=>p.id===id)||pilots.find(p=>p.sku===active?.sku);
   if(!actual){
     message='Текущий тест не найден в списке проектов. Обновите страницу; новый платный запуск не создавайте.';
     draw();return;
   }
   active=actual;
   slides=[];
   images=[];
   message='Тест сохранён. Подробный статус временно не получен ('+String(err?.message||err).slice(0,130)+'). Повторите проверку немного позже.';
   draw();schedule();return;
 }
 if(!root?.isConnected||active?.id!==id)return;
 active=data.pilot;slides=a(data.slides);message='';
 if(slides.some(s=>s.status==='completed')){
  try{const p=await req('preview',{pilot_id:id});if(active?.id===id)images=a(p.images)}catch(e){message='Предпросмотр временно недоступен: '+e.message}
 }
 draw();schedule();
}
async function refresh(){
 const parent=root;
 const [c,list]=await Promise.all([req('config'),req('list')]);
 if(parent!==root||!root?.isConnected)return;
 config=c;pilots=a(list.pilots);
 // Always restore a full current row instead of retaining a partial object from start().
 const persisted=active?pilots.find(p=>p.id===active.id):null;
 active=persisted||pilots[0]||null;
 if(active)await status();else draw();
}
async function start(){
 if(busy)return;
 const sku=selectedSku.trim();
 if(!sku)throw Error('Укажи артикул товара');
 if(!window.confirm('Запустить пробную премиальную генерацию для SKU '+sku+'? Это до 8 платных изображений через Image API. Массовая генерация останется выключенной.'))return;
 busy=true;message='Сохраняю тестовый проект…';draw();
 try{const d=await req('start',{sku});active=d.pilot;images=[];selectedSku='';message='Тест сохранён. Дожидаемся фонового запуска — повторно создавать его не требуется.';await refresh()}
 finally{busy=false;draw()}
}
async function recover(){
 if(!active||busy)return;
 if(!window.confirm('Хранилище PNG исправлено. Первый платный запрос уже был выполнен, но результат потерялся при сохранении. Восстановление этого же теста означает до 8 НОВЫХ платных генераций (всего до 9 платных вызовов за 8 слайдов). Подтверждаешь дополнительный платный запрос?'))return;
 busy=true;message='Восстанавливаю существующее задание, новый SKU не создаю…';draw();
 try{
  const d=await req('recover',{pilot_id:active.id,confirm_extra_paid_image:true});
  active=d.pilot;
  message='Тот же тест снова в очереди. Хранилище PNG исправлено, ожидаем фоновый запуск.';
  await status();
 }finally{busy=false;draw()}
}
async function cancel(){
 if(!active||!window.confirm('Остановить пилот? Готовые слайды сохранятся, новые платные запросы не будут запускаться.'))return;
 const d=await req('cancel',{pilot_id:active.id});
 active.status=d.status;message='Пилот остановлен';await status();
}
async function saveCopy(n){
 if(!active||active.audit?.editorial_version!=='2.1')throw Error('Текстовый редактор доступен только для новых комплектов 2.1');
 const title=root?.querySelector('[data-v2-copy-title="'+n+'"]')?.value||'';
 const subtitle=root?.querySelector('[data-v2-copy-subtitle="'+n+'"]')?.value||'';
 if(!title.trim())throw Error('Введи заголовок слайда');
 if(!window.confirm('Сохранить исправленный русский текст на слайде '+n+'? Фоновый сервер перерисует PNG из сохранённой сцены без платной генерации новой картинки.'))return;
 busy=true;message='Сохраняю редактуру слайда '+n+'…';
 try{await req('save-copy',{pilot_id:active.id,slide_no:n,title,subtitle});
 message='Текст принят. Графический ИИ повторно НЕ вызывается. Ожидаем фоновую пересборку PNG.';
 await status();
 }finally{busy=false;draw()}
}
async function approve(){
 if(!active||!window.confirm('Подтверждаешь, что все 8 изображений визуально соответствуют реальной модели, характеристики верны, комплектация не придумана и качество устраивает?'))return;
 await req('approve',{pilot_id:active.id});await status();
}
async function downloadAll(){
 if(images.length!==8)throw Error('Все 8 изображений ещё не сохранены');
 let JSZip=window.JSZip;
 if(!JSZip){
  JSZip=await new Promise((ok,no)=>{const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';sc.onload=()=>window.JSZip?ok(window.JSZip):no(Error('Нет ZIP-библиотеки'));sc.onerror=()=>no(Error('Не удалось загрузить ZIP'));document.head.appendChild(sc)});
 }
 const z=new JSZip();
 for(const im of images){
  const res=await fetch(im.url);if(!res.ok)throw Error('Слайд '+im.slide_no+' ещё не доступен');
  z.file('slide_'+String(im.slide_no).padStart(2,'0')+'.png',await res.arrayBuffer());
 }
 const blob=await z.generateAsync({type:'blob',compression:'STORE'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='Triovist_Premium_'+String(active.sku).replace(/[^a-zA-Z0-9_-]/g,'_')+'_8slides.zip';
 document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),15000);
}
async function clicked(event){
 const button=event.target.closest('button');if(!button||!root?.contains(button)||busy)return;
 try{
  if(button.hasAttribute('data-v2-start')){await start();return}
  if(button.hasAttribute('data-v2-status')){await status();return}
  if(button.hasAttribute('data-v2-cancel')){await cancel();return}
  if(button.hasAttribute('data-v2-recover')){await recover();return}
  if(button.hasAttribute('data-v2-approve')){await approve();return}
  if(button.hasAttribute('data-v2-save-copy')){await saveCopy(Number(button.dataset.v2SaveCopy));return}
  if(button.hasAttribute('data-v2-download-all')){await downloadAll();return}
  if(button.hasAttribute('data-v2-load')){const p=pilots.find(x=>x.id===button.dataset.v2Load);if(p){active=p;images=[];await status()}return}
 }catch(e){message=String(e.message||e);draw()}
}
function entered(event){if(event.target?.matches('[data-v2-sku]'))selectedSku=event.target.value}
async function open(parent){
 if(!parent)return;
 styles();clearTimeout(timer);
 root=parent.querySelector('#tiv2390');
 if(!root){root=document.createElement('section');root.id='tiv2390';parent.prepend(root)}
 if(!root.dataset.bound){root.dataset.bound='1';root.addEventListener('click',clicked);root.addEventListener('input',entered)}
 message='';draw();try{await refresh()}catch(e){message=e.message;draw()}
}
window.RESANTA_TRIOVIST_PREMIUM_V236390=Object.freeze({version:'23.6.395',open,refresh,isolated:true,requiresManualQA:true,maxPilotSku:1});
})();