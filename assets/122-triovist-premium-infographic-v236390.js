/* Resanta CRM v23.6.400 · TRIOVIST INFOGRAPHIC PROFESSIONAL STUDIO
 * Strategy-first: analysis -> 3 concepts -> director choice -> 8 proof-first scenes -> automatic QA -> director visual approval.
 * Fully isolated from legacy bulk and single-SKU editors.
 */
(function(){
'use strict';
const MOD_VERSION='23.6.401';
if(window.RESANTA_TRIOVIST_PREMIUM_V236390?.version===MOD_VERSION)return;
if(window.RESANTA_TRIOVIST_PREMIUM_V236390){try{delete window.RESANTA_TRIOVIST_PREMIUM_V236390}catch(_){window.RESANTA_TRIOVIST_PREMIUM_V236390=null}}
const FN='triovist-infographic-v3-v236401';
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const a=x=>Array.isArray(x)?x:[];
const dbx=()=>{try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}};
let root=null,config=null,pilots=[],active=null,slides=[],images=[],message='',busy=false,timer=null,preview=false,selectedSku='',loading=false,view='analysis',selectedConcept='',directorNote='';
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
 '.tiv2390-nav{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0}.tiv2390-nav button.on{background:#155e9b;color:#fff;border-color:#155e9b;font-weight:750}',
 '.tiv2390-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:8px;margin:10px 0}.tiv2390-kpi{padding:10px;border:1px solid #d8e4ef;background:#fff;border-radius:10px}.tiv2390-kpi small,.tiv2390-kpi b{display:block}.tiv2390-kpi b{font-size:18px;margin-top:3px}',
 '.tiv2390-concepts{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:9px}.tiv2390-concept{border:1px solid #d7e3ef;background:#fff;border-radius:12px;padding:12px}.tiv2390-concept.on{border:2px solid #3489ca;background:#edf7ff}.tiv2390-concept h4{margin:4px 0}.tiv2390-score{font-size:20px;font-weight:800;color:#155e9b}',
 '.tiv2390-chips{display:flex;flex-wrap:wrap;gap:5px;margin:7px 0}.tiv2390-chip{font-size:10px;padding:4px 7px;border-radius:7px;background:#edf2f7;color:#42566a}',
 '.tiv2390-plan{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:9px}.tiv2390-plan-card{border:1px solid #d7e3ef;background:white;border-radius:11px;padding:11px}.tiv2390-plan-card h4{margin:0 0 6px}.tiv2390-plan-card p{margin:5px 0}',
 '.tiv2390-good{background:#eaf8ef;color:#21613b;border:1px solid #bfe6ca;padding:9px;border-radius:9px;font-size:12px;margin:9px 0}.tiv2390-bad{background:#fff0f0;color:#982f2f;border:1px solid #f3c1c1;padding:9px;border-radius:9px;font-size:12px;margin:9px 0}',
 '.tiv2390-notearea{width:100%;min-height:76px;box-sizing:border-box;border:1px solid #bfd2e4;border-radius:9px;padding:9px;font:inherit;font-size:12px;resize:vertical}',
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
 if(!config.text_provider_ready)return '<div class="tiv2390-warn">Нет текстового ИИ для анализа товара и трёх концепций. Анализ заблокирован.</div>';
 return '<div class="tiv2390-note"><b>Строго по фактам: ВКЛ 🔒</b> · 4 независимых ИИ-прохода: Аналитик → Стратег → Арт-директор → QA. После генерации каждый PNG отдельно сравнивается с исходным товаром.</div>'+
 (!config.image_provider_ready?'<div class="tiv2390-warn">Анализ и 3 концепции доступны, но графический провайдер сейчас не настроен. Генерация изображений останется заблокированной.</div>':'');
}
const pack=()=>active?.strategy_pack&&typeof active.strategy_pack==='object'?active.strategy_pack:{};
const concepts=()=>a(pack().concepts);
function chosen(){
 const id=selectedConcept||active?.selected_concept||concepts().find(x=>x.recommended)?.id||concepts()[0]?.id||'';
 return concepts().find(x=>x.id===id)||concepts()[0]||null;
}
function linkedFacts(ids){
 const wanted=new Set(a(ids).map(String));
 return a(active?.facts).filter(f=>wanted.has(String(f.id)));
}
function chips(values){
 const xs=a(values).filter(x=>String(x??'').trim());
 return xs.length?'<div class="tiv2390-chips">'+xs.map(x=>'<span class="tiv2390-chip">'+h(x)+'</span>').join('')+'</div>':'<span class="tiv2390-caption">—</span>';
}
function strategyTabs(){
 if(!concepts().length)return '';
 const tabs=[['analysis','Анализ'],['concepts','Концепции'],['slides','Слайды'],['qa','Проверка']];
 return '<div class="tiv2390-nav">'+tabs.map(x=>'<button class="'+(view===x[0]?'on':'')+'" data-v2-view="'+x[0]+'">'+x[1]+'</button>').join('')+'</div>';
}
function analysisHtml(){
 const p=pack(),q=p.data_quality||{},m=p.market_analysis||{},aud=p.audience||{},st=p.recommended_strategy||{};
 const state=q.status==='ready'?'Готово':q.status==='caution'?'Есть предупреждения':'Заблокировано';
 return '<div>'+
 '<div class="tiv2390-kpis">'+
 '<div class="tiv2390-kpi"><small>Качество исходных данных</small><b>'+Number(q.score||0)+'/100</b><span>'+h(state)+'</span></div>'+
 '<div class="tiv2390-kpi"><small>Подтверждённых фактов</small><b>'+Number(q.verified_fact_count||0)+'</b><span>exact-SKU</span></div>'+
 '<div class="tiv2390-kpi"><small>Сравнений рынка</small><b>'+Number(m.comparisons||0)+'</b><span>парсер 21vek</span></div>'+
 '<div class="tiv2390-kpi"><small>Строгий режим</small><b>ВКЛ 🔒</b><span>нельзя отключить</span></div>'+
 '</div>'+
 '<div class="tiv2390-card"><h4>Покупатель и задача</h4><p><b>'+h(aud.primary_buyer||'—')+'</b></p>'+chips(aud.jobs_to_be_done)+'</div>'+
 '<div class="tiv2390-card"><h4>Рекомендуемая стратегия</h4><p><b>'+h(st.main_message||'—')+'</b></p><p>'+h(st.reason||'')+'</p></div>'+
 '<div class="tiv2390-card"><h4>Что реально можно вынести в инфографику</h4>'+
 '<p><b>Подтверждённые рыночные преимущества</b></p>'+chips(m.confirmed_advantages)+
 '<p><b>Слабые / нейтральные моменты — не акцентировать</b></p>'+chips(m.weak_points)+
 '<p><b>Нельзя заявлять</b></p>'+chips(m.do_not_claim)+'</div>'+
 (a(q.missing_fields).length?'<div class="tiv2390-bad"><b>Не хватает:</b> '+h(a(q.missing_fields).join(' · '))+'</div>':'')+
 (a(q.warnings).length?'<div class="tiv2390-warn">'+h(a(q.warnings).join(' · '))+'</div>':'')+
 '</div>';
}
function conceptsHtml(){
 const list=concepts();if(!list.length)return '<p>Концепции ещё формируются.</p>';
 return '<div><p>Выбери один подход. Метка <b>«Рекомендую»</b> — подсказка ИИ; окончательное решение остаётся за директором.</p>'+
 '<div class="tiv2390-concepts">'+list.map(c=>{
  const on=chosen()?.id===c.id;
  return '<div class="tiv2390-concept '+(on?'on':'')+'">'+
   '<div class="tiv2390-header"><span class="tiv2390-score">'+Number(c.score||0)+'/100</span>'+(c.recommended?'<span class="tiv2390-tag">Рекомендую</span>':'')+'</div>'+
   '<h4>'+h(c.name||c.id)+'</h4><p><b>'+h(c.hero_message||'')+'</b></p><p>'+h(c.idea||'')+'</p>'+
   '<button '+(on?'disabled':'')+' data-v2-concept="'+h(c.id)+'">'+(on?'Выбрано':'Выбрать концепцию')+'</button>'+
  '</div>';
 }).join('')+'</div></div>';
}
function slideFactsEditor(sl){
 const current=new Set(a(sl.fact_ids).map(String)),all=a(active?.facts);
 const linked=all.filter(f=>current.has(String(f.id)));
 const options=all.filter(f=>!current.has(String(f.id))).map(f=>'<option value="'+h(f.id)+'">'+h(f.label+': '+f.value)+'</option>').join('');
 return '<div class="tiv2390-chips">'+linked.map(f=>'<span class="tiv2390-chip">'+h(f.label+': '+f.value)+' <button type="button" data-v4-remove-fact="'+h(sl.number)+'" data-fact="'+h(f.id)+'" title="Убрать факт">×</button></span>').join('')+'</div>'+
 '<div class="tiv2390-actions"><select class="tiv2390-input" style="width:min(360px,100%)" data-v4-add-fact-select="'+h(sl.number)+'"><option value="">Добавить обязательную характеристику…</option>'+options+'</select>'+
 '<button type="button" data-v4-add-fact="'+h(sl.number)+'">＋ Добавить</button></div>';
}
function slidesHtml(){
 const c=chosen();if(!c)return '<p>Сначала выбери концепцию.</p>';
 return '<div><p><b>'+h(c.name||'')+'</b> · <b>Редактор ДО генерации.</b> Можно менять тексты, порядок экранов и подтверждённые факты. На каждом экране остаётся минимум 3 exact-SKU факта.</p>'+
 '<div class="tiv2390-plan">'+a(c.slides).map((sl,idx)=>{
  return '<div class="tiv2390-plan-card" data-v4-plan-card="'+h(sl.number)+'"><div class="tiv2390-header"><h4>'+Number(sl.number||0)+'. '+h(sl.title||'')+'</h4><div class="tiv2390-actions">'+
   '<button type="button" data-v4-move="'+h(sl.number)+'" data-dir="-1" '+(idx===0?'disabled':'')+'>↑ Раньше</button>'+
   '<button type="button" data-v4-move="'+h(sl.number)+'" data-dir="1" '+(idx===a(c.slides).length-1?'disabled':'')+'>↓ Позже</button></div></div>'+
   '<label class="tiv2390-caption">Заголовок</label><input class="tiv2390-input" style="width:100%" maxlength="95" data-v4-plan-title="'+h(sl.number)+'" value="'+h(sl.title||'')+'">'+
   '<label class="tiv2390-caption">Подзаголовок</label><input class="tiv2390-input" style="width:100%" maxlength="120" data-v4-plan-subtitle="'+h(sl.number)+'" value="'+h(sl.subtitle||'')+'">'+
   '<label class="tiv2390-caption">Вывод / польза</label><input class="tiv2390-input" style="width:100%" maxlength="150" data-v4-plan-takeaway="'+h(sl.number)+'" value="'+h(sl.takeaway||'')+'">'+
   slideFactsEditor(sl)+
   '<p class="tiv2390-caption"><b>Визуальная постановка:</b> '+h(sl.composition_note||sl.scene||'')+'</p></div>';
 }).join('')+'</div>'+
 '<div class="tiv2390-actions"><button class="prime" data-v4-save-plan>💾 Сохранить структуру и перепроверить QA</button><span class="tiv2390-caption">Сохранение не вызывает Image API.</span></div>'+
 '<label class="tiv2390-label">Комментарий директора к генерации</label>'+
 '<textarea class="tiv2390-notearea" data-v2-note maxlength="500" placeholder="Например: на первом экране обязательно крупно показать объём и материал венца">'+h(directorNote||active?.director_note||'')+'</textarea>'+
 '</div>';
}
function qaHtml(){
 const q=pack().data_quality||{},planQa=pack().planning_qa||{},qr=active?.quality_report||{},after=Number(active?.completed_slides||0)===8;
 if(!after)return '<div>'+
  '<div class="'+(q.generation_allowed&&planQa.approved?'tiv2390-good':'tiv2390-bad')+'"><b>Предгенерационный контроль: '+(q.generation_allowed&&planQa.approved?'ПРОЙДЕН':'НЕ ПРОЙДЕН')+'</b></div>'+
  '<div class="tiv2390-kpis"><div class="tiv2390-kpi"><small>Данные</small><b>'+Number(q.score||0)+'/100</b></div><div class="tiv2390-kpi"><small>Независимый planning QA</small><b>'+Number(planQa.score||0)+'/100</b></div></div>'+
  (a(planQa.problems).length?'<div class="tiv2390-warn">'+h(a(planQa.problems).join(' · '))+'</div>':'')+
  '<p>ANALYST, STRATEGIST, ART DIRECTOR и QA CONTROLLER выполняются отдельными проходами. Image API заблокирован до их прохождения и выбора директора.</p></div>';
 const visual=qr.visual_slides||{},keys=Object.keys(visual).sort((x,y)=>Number(x)-Number(y));
 return '<div>'+
  '<div class="'+(qr.automatic_gate_passed?'tiv2390-good':'tiv2390-bad')+'"><b>Итоговый QA: '+Number(qr.score||0)+'/100</b> · визуальный AI-QA '+(qr.visual_qa_all_passed?'8/8 ПРОЙДЕН':'ТРЕБУЕТ ИСПРАВЛЕНИЙ')+'</div>'+
  '<div class="tiv2390-kpis">'+Object.entries(qr.scores||{}).map(([k,v])=>'<div class="tiv2390-kpi"><small>'+h(String(k).replace(/_/g,' '))+'</small><b>'+Number(v||0)+'</b></div>').join('')+'</div>'+
  (a(qr.problems).length?'<div class="tiv2390-warn">'+h(a(qr.problems).join(' · '))+'</div>':'')+
  (keys.length?'<div class="tiv2390-plan">'+keys.map(k=>{const r=visual[k]||{};return '<div class="tiv2390-plan-card"><h4>Слайд '+h(k)+' · '+Number(r.score||0)+'/100 '+(r.approved?'✅':'❌')+'</h4>'+
    '<p>'+h(a(r.problems).join(' · ')||'Проблем не найдено')+'</p>'+
    (!r.approved?'<p class="tiv2390-caption"><b>Что исправить:</b> '+h(a(r.required_changes).join(' · '))+'</p><button class="danger" data-v4-regenerate="'+h(k)+'">↻ Переделать только этот слайд</button>':'')+
    '</div>'}).join('')+'</div>':'')+
  '<p><b>После AI-QA финальное решение всё равно остаётся за директором.</b> Автопубликации нет.</p></div>';
}
function strategyBody(){
 if(!concepts().length)return '';
 if(view==='concepts')return conceptsHtml();
 if(view==='slides')return slidesHtml();
 if(view==='qa')return qaHtml();
 return analysisHtml();
}
function currentHtml(){
 if(!active)return '<p>Пока нет нового проекта. Введи точный артикул: сначала система сформирует анализ и 3 концепции без платной генерации изображений.</p>';
 const x=active,ready=Number(x.completed_slides||0),status=x.status;
 const state={queued:'Анализ в очереди',processing:x.generation_approved?'Генерация':'Анализ',concept_review:'Концепции готовы',needs_review:'Готово к проверке',approved:'Утверждено',cancelled:'Остановлено',failed:'Ошибка'};
 const done=ready===8&&['needs_review','approved'].includes(status);
 const q=pack().data_quality||{},canGenerate=status==='concept_review'&&q.generation_allowed===true&&pack().planning_qa?.approved===true&&config?.image_provider_ready;
 const mimeRepair=status==='failed'&&!x.recovery_approved&&Number(x.paid_images_started||0)===1&&/mime type image\/png is not supported/i.test(x.error_message||'');
 const legacyReview=status==='needs_review'&&!['2.2','2.3','2.4'].includes(String(x.audit?.editorial_version||''));
 return '<div style="border-top:1px solid #cbdcec;margin-top:12px;padding-top:12px">'+
 '<div class="tiv2390-header"><div><h4>SKU: '+h(x.sku)+'</h4><p>'+h(x.product_name)+'</p></div><span class="tiv2390-tag">'+h(state[status]||status)+'</span></div>'+
 (status==='concept_review'?strategyTabs()+strategyBody():'')+
 (['queued','processing','needs_review','approved'].includes(status)?'<div class="tiv2390-progress"><span style="width:'+(ready/8*100)+'%"></span></div>':'')+
 '<div class="tiv2390-actions">'+
 (['processing','needs_review','approved'].includes(status)?'<b>'+ready+'/8 слайдов</b>':'')+
 '<span class="tiv2390-caption">Платных Image API запросов: '+Number(x.paid_images_started||0)+' / '+Number(x.max_paid_images||8)+'</span>'+
 '<button data-v2-status>↻ Проверить результат</button>'+
 (['queued','processing','concept_review'].includes(status)?'<button class="danger" data-v2-cancel>⏹ Остановить</button>':'')+
 (canGenerate?'<button class="prime" data-v2-generate>🚀 Создать 8 слайдов по выбранной концепции</button>':'')+
 (mimeRepair?'<button class="prime" data-v2-recover>↻ Продолжить после исправления PNG</button>':'')+
 (done?'<button class="prime" data-v2-download-all>↓ Скачать 8 PNG одним ZIP</button>':'')+
 (status==='needs_review'&&['2.2','2.3','2.4'].includes(String(x.audit?.editorial_version||''))&&x.audit?.all_slide_proofs_verified&&!a(x.audit?.pending_recompose).length&&x.audit?.hero_verified&&x.audit?.scene_layers_preserved&&x.quality_report?.automatic_gate_passed===true&&x.quality_report?.visual_qa_all_passed===true?'<button data-v2-approve>✓ Утвердить образец</button>':'')+
 '</div>'+
 '<p class="tiv2390-caption">'+h(status==='queued'&&!x.generation_approved?'Фоновый сервер собирает exact-SKU, фото, рынок и три концепции. Image API ещё не вызывается.':x.stage||'')+'</p>'+
 (status==='needs_review'&&concepts().length?strategyTabs()+strategyBody():'')+
 (legacyReview?'<div class="tiv2390-warn">Этот комплект создан до стандарта 4-pass + independent visual QA. Архив сохраняется, но для нового утверждения требуется версия 2.4.</div>':'')+
 (a(x.audit?.pending_recompose).length?'<div class="tiv2390-note">Текстовые исправления ожидают фоновой пересборки PNG без нового Image API запроса.</div>':'')+
 (mimeRepair?'<div class="tiv2390-warn">Исправлена настройка PNG. Восстановление потребует отдельного подтверждения дополнительного платного вызова.</div>':'')+
 (x.error_message&&!mimeRepair?'<div class="tiv2390-warn">'+h(x.error_message)+'</div>':'')+
 (status==='approved'?'<div class="tiv2390-note">Комплект утверждён директором. Автопубликации нет.</div>':'')+
 previews()+'</div>';
}
function previews(){
 if(!images.length)return '';
 const canEdit=['2.1','2.2','2.3','2.4'].includes(String(active?.audit?.editorial_version||''))&&active?.audit?.scene_layers_preserved&&active?.status==='needs_review';
 const story=a(active?.storyboard),visual=active?.quality_report?.visual_slides||{};
 return '<h4>Предпросмотр готовых PNG</h4><p>Каждый финальный PNG независимо сравнивается с исходным exact-SKU изображением.</p>'+
 '<div class="tiv2390-grid">'+images.map(im=>{
 const slide=story[im.slide_no-1]||{},qa=visual[String(im.slide_no)]||visual[im.slide_no]||{};
 return '<div class="tiv2390-thumb">'+
 '<a href="'+h(im.url)+'" target="_blank" rel="noopener noreferrer"><img loading="lazy" src="'+h(im.url)+'" alt="Слайд '+im.slide_no+'"></a>'+
 '<b>Слайд '+im.slide_no+' из 8 · '+(qa.approved?'QA ✅':qa.score?'QA ❌ '+Number(qa.score||0)+'/100':'QA …')+'</b>'+
 '<a href="'+h(im.url)+'" target="_blank" rel="noopener noreferrer">Открыть полностью ↗</a>'+
 (!qa.approved&&qa.score?'<div class="tiv2390-warn">'+h(a(qa.problems).join(' · '))+'</div><button class="danger" data-v4-regenerate="'+im.slide_no+'">↻ Переделать только этот слайд</button>':'')+
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
 const activeBusy=active&&['queued','processing','concept_review'].includes(active.status);
 root.innerHTML='<div class="tiv2390"><div class="tiv2390-header"><div><h3>✨ Триовист · Инфографика 21vek</h3>'+
 '<p>Exact-SKU → отдельный ANALYST → STRATEGIST → ART DIRECTOR → QA → 8 сильных слайдов → независимый визуальный QA.</p></div>'+
 '<span class="tiv2390-tag">4.0 · v23.6.401</span></div>'+banner()+
 '<div class="tiv2390-actions"><input class="tiv2390-input" data-v2-sku value="'+h(selectedSku)+'" placeholder="Точный артикул, например 74/1/20" aria-label="Артикул для инфографики">'+
 '<button class="prime" data-v2-start '+(busy||!config?.text_provider_ready||!config?.can_start||activeBusy?'disabled':'')+'>🔎 Проанализировать товар и создать 3 концепции</button></div>'+
 '<p class="tiv2390-caption">Первый этап не вызывает Image API. Платные 8 изображений запускаются только отдельной кнопкой после выбора концепции.</p>'+
 currentHtml()+
 (pilots.length>1?'<h4>Предыдущие проекты</h4><div class="tiv2390-list">'+pilots.slice(0,12).map(p=>'<button data-v2-load="'+h(p.id)+'"><b>'+h(p.sku)+'</b> · V'+Number(p.strategy_pack?.project_version||1)+' · '+h(p.status)+'</button>').join('')+'</div>':'')+
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
 active=data.pilot;slides=a(data.slides);message='';selectedConcept=selectedConcept||active?.selected_concept||a(active?.strategy_pack?.concepts).find(x=>x.recommended)?.id||'';directorNote=active?.director_note||directorNote;if(active?.status==='needs_review'&&a(active?.strategy_pack?.concepts).length&&view==='analysis')view='qa';
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
 if(!window.confirm('Запустить анализ SKU '+sku+'? Сначала будут собраны exact-SKU данные, рынок и 3 концепции. Платная генерация изображений на этом этапе НЕ запускается.'))return;
 busy=true;message='Создаю аналитический проект…';draw();
 try{
  const d=await req('start',{sku});active=d.pilot;images=[];slides=[];selectedConcept='';directorNote='';view='analysis';selectedSku='';
  message='Анализ поставлен в очередь. Image API заблокирован до выбора концепции.';
  await refresh();
 }finally{busy=false;draw()}
}
async function generate(){
 if(!active||active.status!=='concept_review'||busy)return;
 const c=chosen();if(!c)throw Error('Выбери концепцию');
 const q=pack().data_quality||{};if(q.generation_allowed!==true)throw Error('Строгий контроль фактов не разрешает генерацию');
 if(!window.confirm('Запустить 8 профессиональных слайдов по концепции «'+String(c.name||c.id)+'»? Только сейчас будут разрешены до 8 платных Image API запросов.'))return;
 busy=true;message='Фиксирую концепцию и разрешаю графическую генерацию…';draw();
 try{
  const d=await req('generate',{pilot_id:active.id,concept_id:c.id,director_note:directorNote});
  active=d.pilot;view='slides';message='Концепция утверждена. Генерация поставлена в очередь.';
  await status();
 }finally{busy=false;draw()}
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
 if(!active||!['2.1','2.2','2.3','2.4'].includes(String(active.audit?.editorial_version||'')))throw Error('Редактор доступен только для комплектов с сохранёнными исходными сценами');
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
async function savePlan(){
 if(!active||active.status!=='concept_review')throw Error('Редактор структуры доступен до запуска изображений');
 const concept=chosen();if(!concept)throw Error('Выбери концепцию');
 busy=true;message='Сохраняю структуру и запускаю независимый planning QA…';draw();
 try{
  const d=await req('save-plan',{pilot_id:active.id,concept_id:concept.id,slides:a(concept.slides)});
  active.strategy_pack=d.strategy_pack;active.storyboard=d.storyboard;selectedConcept=concept.id;message=d.message||'Структура сохранена';view='qa';
 }finally{busy=false;draw()}
}
function moveSlide(n,dir){
 const c=chosen();if(!c)return;const list=a(c.slides),i=list.findIndex(x=>Number(x.number)===Number(n)),j=i+Number(dir);
 if(i<0||j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];list.forEach((x,k)=>x.number=k+1);draw();
}
function addFact(n){
 const c=chosen();if(!c)return;const sl=a(c.slides).find(x=>Number(x.number)===Number(n));if(!sl)return;
 const sel=root?.querySelector('[data-v4-add-fact-select="'+n+'"]'),id=sel?.value;if(!id)return;
 const ids=[...new Set([...a(sl.fact_ids).map(String),String(id)])];if(ids.length>4)throw Error('На одном экране максимум 4 подтверждённых факта');
 sl.fact_ids=ids;draw();
}
function removeFact(n,id){
 const c=chosen();if(!c)return;const sl=a(c.slides).find(x=>Number(x.number)===Number(n));if(!sl)return;
 const ids=a(sl.fact_ids).map(String).filter(x=>x!==String(id));if(ids.length<3)throw Error('На каждом экране должно остаться минимум 3 подтверждённых факта');
 sl.fact_ids=ids;draw();
}
async function regenerateSlide(n){
 if(!active||active.status!=='needs_review')throw Error('Точечная переделка доступна после готовности комплекта');
 const qa=active.quality_report?.visual_slides?.[String(n)]||active.quality_report?.visual_slides?.[n]||{};
 const why=a(qa.required_changes).join(' · ');
 if(!window.confirm('Переделать только слайд '+n+'? Остальные 7 останутся без изменений. Это один дополнительный платный Image API запрос.'+(why?'\n\nПричина QA: '+why:'')))return;
 busy=true;message='Ставлю слайд '+n+' на точечную переделку…';draw();
 try{const d=await req('regenerate-slide',{pilot_id:active.id,slide_no:n,reason:why,confirm_extra_paid_image:true});message=d.message||'Слайд поставлен в очередь';await status();}finally{busy=false;draw()}
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
  if(button.hasAttribute('data-v2-generate')){await generate();return}
  if(button.hasAttribute('data-v2-view')){view=button.dataset.v2View||'analysis';draw();return}
  if(button.hasAttribute('data-v2-concept')){selectedConcept=button.dataset.v2Concept||'';view='slides';draw();return}
  if(button.hasAttribute('data-v2-status')){await status();return}
  if(button.hasAttribute('data-v2-cancel')){await cancel();return}
  if(button.hasAttribute('data-v2-recover')){await recover();return}
  if(button.hasAttribute('data-v2-approve')){await approve();return}
  if(button.hasAttribute('data-v4-save-plan')){await savePlan();return}
  if(button.hasAttribute('data-v4-move')){moveSlide(Number(button.dataset.v4Move),Number(button.dataset.dir));return}
  if(button.hasAttribute('data-v4-add-fact')){addFact(Number(button.dataset.v4AddFact));return}
  if(button.hasAttribute('data-v4-remove-fact')){removeFact(Number(button.dataset.v4RemoveFact),button.dataset.fact);return}
  if(button.hasAttribute('data-v4-regenerate')){await regenerateSlide(Number(button.dataset.v4Regenerate));return}
  if(button.hasAttribute('data-v2-save-copy')){await saveCopy(Number(button.dataset.v2SaveCopy));return}
  if(button.hasAttribute('data-v2-download-all')){await downloadAll();return}
  if(button.hasAttribute('data-v2-load')){
   const p=pilots.find(x=>x.id===button.dataset.v2Load);
   if(p){active=p;images=[];slides=[];selectedConcept='';directorNote='';view='analysis';await status()}
   return;
  }
 }catch(e){message=String(e.message||e);draw()}
}
function entered(event){
 if(event.target?.matches('[data-v2-sku]'))selectedSku=event.target.value;
 if(event.target?.matches('[data-v2-note]'))directorNote=event.target.value;
 const concept=chosen();if(!concept)return;
 const set=(attr,key)=>{if(!event.target?.hasAttribute(attr))return;const n=Number(event.target.getAttribute(attr));const sl=a(concept.slides).find(x=>Number(x.number)===n);if(sl)sl[key]=event.target.value};
 set('data-v4-plan-title','title');set('data-v4-plan-subtitle','subtitle');set('data-v4-plan-takeaway','takeaway');
}
async function open(parent){
 if(!parent)return;
 styles();clearTimeout(timer);
 root=parent.querySelector('#tiv2390');
 if(!root){root=document.createElement('section');root.id='tiv2390';parent.prepend(root)}
 if(!root.dataset.bound){root.dataset.bound='1';root.addEventListener('click',clicked);root.addEventListener('input',entered)}
 message='';draw();try{await refresh()}catch(e){message=e.message;draw()}
}
window.RESANTA_TRIOVIST_PREMIUM_V236390=Object.freeze({version:MOD_VERSION,open,refresh,isolated:true,requiresManualQA:true,strategyFirst:true,fourPass:true,threeConcepts:true,strictFactsLocked:true,proofFirstEight:true,independentVisualQA:true,preGenerationEditor:true,revisionHistory:true,maxPilotSku:1});
})();