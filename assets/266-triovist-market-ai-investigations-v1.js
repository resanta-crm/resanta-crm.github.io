/* Resanta 21vek: evidence-grounded AI ranking investigations.
 * Additive, lazy, server-authorized. Isolated marketplace follow-up, with read-only parser access.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_MARKET_AI_V1)return;
const VERSION='market-ai-position-work-v1';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const N=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const A=v=>Array.isArray(v)?v:[];
const dt=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Minsk'})};
const managerNames={'aleksandrenko_av@resanta.ru':'Александренко','krishtal_na@resanta.ru':'Кришталь'};
const workLabels={awaiting_reply:'Ждёт ответа',awaiting_analysis:'Ждёт анализа',awaiting_take:'Новая задача',
 in_progress:'В работе',submitted:'На проверке',verified:'Проверено по снимку',reviewed_report:'Отчёт разобран'};
let summary=null,summaryTimer=null,summaryOwner='',summaryFlight=null,summaryData=null,summaryError=false,opening=null;
const leaders=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
let state={root:null,feed:null,saved:[],savedLoaded:false,scope:'',focus:null,busy:false,error:'',feedError:'',listError:'',loadedAt:0,seq:0,progress:'',draft:null,poll:null,preview:null,nextCase:null};
function userEmail(){
 return String((typeof currentUser!=='undefined'&&currentUser?.email)||window.currentUser?.email||'').toLowerCase();
}
function leader(){return leaders.has(userEmail())}
function canAnswer(c){return leader()||c.manager_email===userEmail()}
function replyPending(c){
 const review=c?.evidence?.manager_reply_review;
 return review?.status==='pending'&&Date.now()-Date.parse(review.started_at)<90000;
}
async function call(body){
 if(typeof db==='undefined'||!db.functions?.invoke)throw Error('Авторизованная сессия CRM недоступна.');
 const invoke=()=>db.functions.invoke('triovist-market-investigate-v1',{body});
 const r=typeof window.crmAuthRetryV236166==='function'?await window.crmAuthRetryV236166(invoke):await invoke();
 if(r?.error){
  let reason=r.error.message||'AI сервис временно недоступен';
  try{const context=await r.error.context?.json?.();reason=context?.error||reason}catch(_){}
  throw Error(String(reason).slice(0,160));
 }
 if(r?.data?.error)throw Error(String(r.data.error).slice(0,160));
 return r?.data||{};
}
function css(){
 if(document.getElementById('tm266-css'))return;
 const s=document.createElement('style');s.id='tm266-css';s.textContent=[
 '.tm266{margin:12px 0 0;border:1px solid var(--border);background:var(--bg);border-radius:12px;padding:14px;color:var(--text);font-family:inherit}',
 '.tm266 *{box-sizing:border-box}.tm266 h3{margin:0;font-size:16px;color:var(--text)}.tm266 h4{font-size:15px;color:var(--text);margin:0 0 9px}',
 '.tm266 header{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px}',
 '.tm266 small,.tm266 .note{font-size:13px;color:var(--sub);line-height:1.5}',
 '.tm266 button,.tm266 select,.tm266 textarea,.tm266 input{font:inherit;font-size:14px;border:1px solid var(--border);border-radius:8px;padding:8px 10px;min-height:44px;background:var(--card);color:var(--a)}',
 '.tm266 .tm224-help button{min-height:32px;padding:0}',
 '.tm266 button{cursor:pointer;font-weight:750}.tm266 button:hover{background:#e8f3ff}.tm266 button:disabled{opacity:.55;cursor:wait}',
 '.tm266 .tm266-mainbtn{background:#185b94;color:white}.tm266 .tm266-mainbtn:hover{background:#124c80}',
 '.tm266 .tm266-layout{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(280px,1fr);gap:12px;margin-top:12px}',
 '.tm266 .tm266-panel{background:white;border:1px solid #dbe6f2;border-radius:11px;padding:13px;min-width:0}',
 '.tm266 .tm266-tools{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:12px 0}',
 '.tm266 .tm266-case{border:1px solid #e2eaf2;border-left:3px solid #4782b5;border-radius:9px;padding:10px;margin:8px 0}',
 '.tm266 .tm266-case.down{border-left-color:#d06b67}.tm266 .tm266-case.up{border-left-color:#2c9977}',
 '.tm266 .tm266-case b{font-size:14px}.tm266 .tm266-case p{font-size:13px;color:var(--sub);margin:6px 0}',
 '.tm266 .tm266-hyp{padding:9px 10px;background:#f4f8fc;border-radius:8px;margin:7px 0;font-size:12px;line-height:1.5}',
 '.tm266 .tm266-hyp small{display:block;margin-top:4px}',
 '.tm266 .tm266-strong{font-size:13px;font-weight:750;color:#183f64}',
 '.tm266 .tm266-notice{margin:8px 0;font-size:12px;background:#fffaf0;border:1px solid #f0e3c2;border-radius:9px;padding:10px}',
 '.tm266 .tm266-question,.tm266 .tm266-result{padding:12px;border-radius:9px;margin:10px 0;background:#f0f6fc;line-height:1.5}',
 '.tm266 .tm266-work{border:1px solid var(--border);border-radius:9px;padding:12px;margin:10px 0;background:var(--card);line-height:1.5}',
 '.tm266 .tm266-work p{margin:6px 0}.tm266 .tm266-work .overdue{color:var(--r);font-weight:700}',
 '.tm266-summary{background:var(--card);margin:12px 0}.tm266-summary h3{margin:0 0 9px}',
 '.tm266-summary-row{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding:8px 0;border-top:1px solid var(--border)}',
 '.tm266-summary-row small{display:block}.tm266-counts{display:flex;gap:8px 18px;flex-wrap:wrap;padding:0;margin:8px 0 12px;list-style:none}',
 '.tm266 .tm266-result{background:#edf7f1}.tm266 .tm266-result p,.tm266 .tm266-question p{margin:5px 0}',
 '.tm266 .tm266-result ol{padding-left:21px;margin:6px 0}.tm266 .tm266-result li+li{margin-top:5px}',
 '.tm266 .tm266-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}',
 '.tm266 textarea{display:block;width:100%;min-height:68px;resize:vertical;margin:7px 0}',
 '.tm266 label{font-size:11px;font-weight:750;display:block;margin-top:8px}',
 '.tm266 details{border:1px solid #e1eaf3;border-radius:9px;padding:9px;margin:10px 0}.tm266 summary{cursor:pointer;font-size:12px;font-weight:750}',
 '.tm266 .tm266-error{background:#fff1f0;color:#a83e38;padding:9px;border-radius:9px;font-size:12px}',
 '@media(max-width:980px){.tm266 .tm266-layout{grid-template-columns:1fr}}',
 '@media(max-width:620px){.tm266{padding:11px}.tm266 button,.tm266 select,.tm266 textarea{font-size:16px}}'
 ].join('\n');document.head.appendChild(s);
}
function movement(r){
 const n=N(r.delta);
 const dir=r.movement==='down'||r.movement==='exited'?'down':'up';
 if(n===null)return r.movement==='exited'?'Вышел из TOP-120':'Вошёл в TOP-120';
 return (dir==='down'?'↓ ':'↑ ')+Math.abs(n)+' мест';
}
function caseItem(r){
 const down=r.movement==='down'||r.movement==='exited';
 const before=N(r.previous_position),after=N(r.position);
 const transition=before!==null&&after!==null?'№'+before+' → №'+after+' · ':'';
 return '<article class="tm266-case '+(down?'down':'up')+'"><b>'+E(r.title||r.entity_key)+'</b>'+
  '<p>'+E('Наш SKU '+r.entity_key)+' · '+E(transition+movement(r))+' · '+E(dt(r.observed_at))+'</p>'+
  '<div class="tm266-actions"><button type="button" data-tm266-investigate="'+E(r.entity_key)+'" data-tm266-scope="'+E(r.scope_key)+'"'+(state.busy?' disabled':'')+'>Разобрать позицию</button></div></article>';
}
function hypotheticals(v){
 const list=A(v?.hypotheses);
 if(!list.length)return '<div class="note">Подтверждённых объяснений пока нет.</div>';
 return list.map(x=>'<div class="tm266-hyp"><b>'+E(x.cause||'Возможная причина')+'</b> · '+E(x.confidence||'низкая')+
 '<small>Основание: '+E(x.evidence||'не подтверждено')+'</small></div>').join('');
}
function recommendation(review,title){
 if(!review)return '';
 const task=review.task;
 return '<section class="tm266-result" tabindex="-1" aria-label="'+E(title)+'"><h4>'+E(title)+'</h4><p>'+E(review.assessment)+'</p>'+
  (task?'<p><b>Следующий шаг</b><br>'+E(task.action)+'</p><p><b>Ожидаемый результат</b><br>'+E(task.result)+'</p>'
       :'<ol>'+A(review.actions).map(x=>'<li>'+E(x)+'</li>').join('')+'</ol>')+
  (review.missing_evidence?'<p class="note">'+E(review.missing_evidence)+'</p>':'')+'</section>';
}
function workPanel(c){
 const evidence=c.evidence||{},work=evidence.market_work,disabled=state.busy?' disabled':'';
 if(!work){
  if(c.manager_answer||!c.manager_email||evidence.reply_taken_at)return '';
  if(leader())return evidence.work_enabled?'<p class="note">Ответ запрошен · '+E(managerNames[c.manager_email]||c.manager_email)+'</p>':
   '<button type="button" data-tm266-request'+disabled+'>Запросить ответ менеджера</button>';
  return canAnswer(c)?'<button type="button" data-tm266-take'+disabled+'>Взять разбор в работу</button>':'';
 }
 const check=work.verification||{};
 const status=workLabels[work.status==='queued'?'awaiting_take':work.status]||'Задача ИИ';
 const overdue=['queued','in_progress'].includes(work.status)&&Date.now()>=Date.parse(work.due_at);
 let html='<section class="tm266-work" tabindex="-1" aria-label="Задача по позиции"><h4>Задача ИИ · '+E(status)+'</h4>'+
  '<p>'+E(work.action)+'</p><p><b>Результат</b> · '+E(work.result)+'</p>'+
  '<p class="'+(overdue?'overdue':'note')+'">'+(overdue?'Напоминание · срок прошёл ':'Срок · ')+E(dt(work.due_at))+'</p>';
 if(work.status==='queued'&&canAnswer(c))html+='<button type="button" class="tm266-mainbtn" data-tm266-take'+disabled+'>Взять задачу в работу</button>';
 if(work.status==='in_progress'||work.status==='submitted'){
  const form='<form data-tm266-report><label for="tm266-report">Что сделано и какой результат</label>'+
   '<textarea id="tm266-report" name="report" required minlength="4" maxlength="1600">'+E((state.draft?.caseId===c.id?state.draft.report:null)??work.report??'')+'</textarea>'+
   '<button class="tm266-mainbtn" type="submit"'+disabled+'>Отправить результат</button></form>';
  if(canAnswer(c))html+=work.report?'<details><summary>Уточнить результат</summary>'+form+'</details>':form;
 }
 if(work.report)html+='<p class="note">Отчёт · '+E(work.report)+'</p>';
 if(work.report){
  const rank=N(check.rank)===null?'':' · №'+check.rank;
  const availability=typeof check.available==='boolean'?(check.available?' · в наличии':' · нет в наличии'):'';
  const verification=check.state==='verified'?'Результат подтверждён снимком':check.state==='not_met'?'Снимок пока не подтверждает результат':
   work.metric==='manual'?'По этому результату нет автоматического подтверждения':'Ждём свежий снимок 21vek';
  html+='<p><b>'+E(verification)+'</b>'+E(check.observed_at?' · '+dt(check.observed_at)+rank+availability:'')+'</p>';
 }
 if(work.report&&!work.report_review&&canAnswer(c)){
  const pending=Date.now()-Date.parse(work.report_review_started_at)<90000;
  html+=pending?'<p role="status" class="note">ИИ анализирует результат…</p>':
   '<button type="button" data-tm266-analyze-report'+disabled+'>Повторить анализ результата</button>';
 }
 return html+recommendation(work.report_review,'Рекомендация по результату')+'</section>';
}
function replyResult(c){
 const review=c.evidence?.manager_reply_review;
 if(!c.manager_answer)return '';
 let html='<details><summary>Отправленный ответ</summary><p>'+E(c.manager_answer)+'</p>'+
  (c.manager_source?'<p class="note">'+E(c.manager_source)+'</p>':'')+'</details>';
 if(review?.status==='ready'){
  html+=c.evidence?.market_work?'<p class="note">'+E(review.assessment)+'</p>':recommendation(review,'Что сделать дальше');
 }else if(replyPending(c)){
  html+='<p class="note" role="status">Ответ сохранён. ИИ анализирует его.</p>';
 }else{
  html+='<p class="note" role="status">'+(review?'Ответ сохранён. Анализ сейчас недоступен.':'Ответ сохранён. Анализ ещё не запускался.')+'</p>';
  if(canAnswer(c))html+='<button type="button" data-tm266-analyze'+(state.busy?' disabled':'')+'>'+
   (review?'Повторить анализ':'Проанализировать ответ')+'</button>';
 }
 return html;
}
function caseDetail(c){
 if(!c)return '<p class="note">Выберите товар, чтобы открыть изменение позиции и вопрос для проверки.</p>';
 const v=c.ai_result||{},o=c.evidence||{},cur=o.current||{};
 const now=N(c.position_at_start)===null?'нет данных':'№'+E(c.position_at_start);
 const old=N(c.position_before)===null?'нет данных':'№'+E(c.position_before);
 const from=o.history?.[1],to=o.history?.[0];
 const oldStock=from?.in_stock,newStock=to?.in_stock;
 const priceChanged=N(from?.price)!==null&&N(to?.price)!==null&&N(from.price)!==N(to.price);
 const question=typeof oldStock==='boolean'&&typeof newStock==='boolean'&&oldStock!==newStock
  ?'Что произошло с наличием SKU '+c.entity_key+' между '+dt(from.date)+' и '+dt(to.date)+'?'
  :priceChanged?'Что изменило цену SKU '+c.entity_key+' с '+from.price+' до '+to.price+' BYN?'
  :v.manager_question&&!/реклам|источник|доказательств/i.test(v.manager_question)?v.manager_question
  :'Что изменилось у SKU '+c.entity_key+' между проверками? Напишите, что заметили по этому товару.';
 const draft=state.draft?.caseId===c.id?state.draft:null;
 const canEdit=canAnswer(c)&&!replyPending(c);
 const disabled=state.busy?' disabled':'';
 let html='<h4>'+E(c.title||c.entity_key)+'</h4>'+
  '<p class="tm266-strong">Позиция '+old+' → '+now+' · '+E(dt(cur.observed_at||c.observed_at))+'</p>'+
  '<section class="tm266-question"><h4>Что проверить</h4><p>'+E(question)+'</p></section>';
 html+=workPanel(c);
 if(canEdit&&(!c.manager_answer||draft?.answer))html+=answerForm(draft,disabled);
 if(state.preview?.caseId===c.id)html+=recommendation(state.preview.result,'Пробный разбор');
 html+=replyResult(c);
 if(canEdit&&c.manager_answer&&!draft?.answer)html+='<details><summary>Уточнить ответ</summary>'+
  answerForm({answer:c.manager_answer},disabled)+'</details>';
 html+='<details><summary>Снимки и версии причин</summary><p class="note">Цена в снимке · '+
  (cur.price==null?'нет данных':E(cur.price)+' BYN')+'. Источник · '+E(o.source||'Supabase')+'</p>'+
  '<p class="note">История позиций · '+E(A(o.history).map(r=>dt(r.date)+' '+(r.position==null?'нет позиции':'№'+r.position)).join(' · '))+'</p>'+
  hypotheticals(v)+'<p class="note">'+E(v.limits||'Изменение места само по себе не доказывает причинность.')+'</p></details>';
 if(c.director_note)html+='<details><summary>Прежнее решение руководителя</summary><p>'+E(c.director_note)+'</p></details>';
 if(leader()&&!c.manager_email){
  html+='<details data-tm266-director><summary>Указать ответственного</summary>'+
   '<div class="tm266-actions"><select data-tm266-assignee aria-label="Назначить менеджеру"><option value="">Выберите менеджера</option>'+
   Object.entries(managerNames).map(([mail,name])=>'<option value="'+mail+'">'+name+'</option>').join('')+
   '</select><button type="button" data-tm266-assign'+disabled+'>Назначить</button></div></details>';
 }
 return html;
}
function answerForm(draft,disabled){
 return '<form data-tm266-form><label for="tm266-answer">Что выяснили</label>'+
  '<textarea id="tm266-answer" name="answer" required minlength="4" maxlength="1600" placeholder="Что изменилось у этого товара">'+E(draft?.answer||'')+'</textarea>'+
  '<div class="tm266-actions"><button class="tm266-mainbtn" type="submit"'+disabled+'>Отправить ответ</button>'+
  '<button type="submit" value="preview"'+disabled+'>Пробный разбор</button></div>'+
  '<small>В пробном режиме ответ и задача не сохраняются.</small></form>';
}
function render(){
 const root=state.root;if(!root||!root.isConnected)return;
 css();
 const f=state.feed||{},groups=A(f.groups),cases=A(f.cases).filter(x=>x.kind==='own');
 const selected=state.scope?cases.filter(x=>x.scope_key===state.scope):cases;
 const visible=selected.slice(0,14);
 const record=state.focus;
 const savedOpen=root.querySelector('[data-tm266-saved-list]')?.open??(!leader()&&state.saved.length>0);
 const savedList=state.savedLoaded?'<details data-tm266-saved-list'+(savedOpen?' open':'')+'><summary>'+
  (leader()?'Сохранённые разборы':'Мои разборы')+' ('+E(state.saved.length)+')</summary>'+
  (state.saved.length?state.saved.map(c=>'<div class="tm266-case"><b>'+E(c.title)+'</b><p>'+E(dt(c.created_at))+
   '</p><button type="button" data-tm266-saved="'+E(c.id)+'">Открыть разбор</button></div>').join(''):'<p class="note">Сохранённых разборов пока нет.</p>')+
  '</details>':'';
 const previous=root.querySelector('[data-tm266-outcome]');
 const directorOpen=record?.id===previous?.dataset.tm266CaseId&&previous?.querySelector('[data-tm266-director]')?.open;
 const errors=[state.feedError,state.listError,state.error].filter(Boolean);
 root.innerHTML='<header><div class="tm224-heading"><h3>Разбор позиций наших товаров</h3>'+
 '<span class="tm224-help"><button type="button" aria-label="Как работает разбор с ИИ" aria-describedby="tm266-tip">*</button>'+
 '<span class="tm224-tip" role="tooltip" id="tm266-tip"><span>Снимок: '+E(dt(f.source_at))+'. Лимит AI-проверок в сутки: '+E(f.limits?.deep_ai_per_day??24)+'.</span>'+
 '<span>Ответьте по товару. ИИ поставит задачу ответственному. Сводка напомнит, если ответа или действия нет к сроку.</span></span></span></div>'+
 '<button type="button" data-tm266-refresh '+(state.busy?'disabled':'')+'>Обновить данные</button></header>'+
 (state.feed?'<div class="tm266-tools"><select data-tm266-filter aria-label="Фильтр подгруппы"><option value="">Все подключённые подгруппы</option>'+
 groups.map(g=>'<option value="'+E(g.scope_key)+'"'+(state.scope===g.scope_key?' selected':'')+'>'+E(g.subgroup||g.scope_key)+' · '+E(g.signals)+'</option>').join('')+
 '</select><small>Групп с сигналами: '+E(f.scopes_with_signals??'—')+' из '+E(f.scopes_total??'—')+'</small></div>':'')+
 (errors.length?'<div class="tm266-error" role="alert">'+errors.map(e=>'<div>'+E(e)+'</div>').join('')+'</div>':'')+
 (state.busy?'<p class="note" role="status">'+E(state.progress||'Загружаю данные…')+'</p>':'')+
 (leader()?'':savedList)+
 ((state.feed||record)?'<div class="tm266-layout"><section class="tm266-panel"><h4>Изменения позиций</h4>'+
 (visible.length?visible.map(caseItem).join(''):'<p class="note">'+(state.scope?'В этой подгруппе пока нет подтверждённых значимых изменений позиций наших SKU.':'Пока нет подтверждённых значимых изменений позиций наших SKU.')+'</p>')+
 '</section>'+(visible.length||record?'<section class="tm266-panel" data-tm266-outcome data-tm266-case-id="'+E(record?.id||'')+'" tabindex="-1">'+caseDetail(record)+'</section>':'')+'</div>':'')+
 (leader()?savedList:'');
 if(directorOpen&&root.querySelector('[data-tm266-director]'))root.querySelector('[data-tm266-director]').open=true;
 clearTimeout(state.poll);
 if(!state.busy&&replyPending(record))state.poll=setTimeout(()=>{
  if(root.isConnected&&root.closest('[data-tm266-container]')?.open)refresh();
 },5000);
}
function requestError(error,fallback){
 const code=String(error?.message||error||'');
 if(/(?:invalid_session|not_authorized|profile_mismatch|wrong_role|unauthorized|jwt)/i.test(code))
  return 'Не удалось подтвердить доступ. Войдите в CRM и обновите данные.';
 if(code==='not_assigned')return 'Разбор доступен назначенному менеджеру или руководителю.';
 if(code==='trial_ai_unavailable')return 'Пробный анализ временно недоступен. Можно повторить.';
 if(code==='missing_assignee')return 'Сначала укажите ответственного за этот товар.';
 if(code==='case_changed')return 'Разбор изменился. Обновите данные перед повторной отправкой.';
 return fallback;
}
async function refresh(){
 const root=document.querySelector('[data-tm266]');if(!root||state.busy)return;
 state.root=root;
 state.busy=true;state.error='';state.feedError='';state.listError='';render();
 const ticket=++state.seq;
 const [feed,records]=await Promise.allSettled([call({action:'feed',kind:'own'}),call({action:'list',kind:'own'})]);
 if(ticket!==state.seq)return;
 if(feed.status==='fulfilled')state.feed=feed.value;
 else state.feedError=requestError(feed.reason,'Не удалось загрузить изменения позиций. Нажмите «Обновить данные».');
 if(records.status==='fulfilled'){
  state.saved=A(records.value.cases).filter(x=>x.kind==='own');
  state.savedLoaded=true;
  if(state.focus){const found=state.saved.find(x=>x.id===state.focus.id);if(found)state.focus=found}
 }else state.listError=requestError(records.reason,'Не удалось загрузить сохранённые расследования.');
 if(feed.status==='fulfilled'||records.status==='fulfilled')state.loadedAt=Date.now();
 state.busy=false;render();
 if(state.nextCase){const id=state.nextCase;state.nextCase=null;void action({action:'case',case_id:id})}
}
function mount(){
 const el=document.querySelector('#tr14-panel [data-tm266-container][open] [data-tm266]');
 if(!el)return;
 if(state.root!==el){state.root=el;state.loadedAt=0;state.focus=null;render()}
 if(!state.loadedAt&&!state.busy)refresh();
}
async function action(body){
 if(state.busy)return;
 const answerAction=['answer','analyze_answer','preview_answer','report_work','analyze_report'].includes(body.action);
 state.busy=true;state.error='';
 state.progress=answerAction?'ИИ анализирует ответ…':'';
 render();
 try{
  const data=await call(body);
  if(data.preview)state.preview={caseId:body.case_id,result:data.preview};
  if(data.case){state.focus=data.case;state.preview=null;
   if(['answer','report_work'].includes(body.action))state.draft=null;
   state.saved=[data.case,...state.saved.filter(x=>x.id!==data.case.id)].slice(0,40);
   state.savedLoaded=true;
   if(data.ai_error)state.error='Факты сохранены. Разбор ИИ временно недоступен.';
  }
 }catch(e){
  const code=String(e.message||e);
  state.error=code==='insufficient_rank_evidence'||code==='rank_history_not_comparable'
   ?'По этому товару пока нет двух сопоставимых подтверждённых позиций. ИИ не будет придумывать причину. Выберите другой сигнал или дождитесь нового снимка.'
   :requestError(e,'Не удалось выполнить действие. Повторите попытку.');
 }
 finally{state.busy=false;state.progress='';render()}
 if((body.action==='investigate'&&state.focus?.entity_key===body.entity_key)||body.action==='case'||answerAction)showOutcome(answerAction);
 if(['answer','analyze_answer','assign','take_work','report_work','request_reply','analyze_report'].includes(body.action))summaryData=null;
 if(state.nextCase){const id=state.nextCase;state.nextCase=null;void action({action:'case',case_id:id})}
}
function showOutcome(reply=false){
 const result=(reply&&state.root?.querySelector('.tm266-result,.tm266-work'))||state.root?.querySelector('[data-tm266-outcome]');
 result?.focus({preventScroll:true});
 result?.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function renderSummary(){
 if(!summary?.isConnected)return;
 const counts=summaryData?.counts||{},entries=A(summaryData?.entries);
 const labels=[['awaiting_reply','Без ответа'],['awaiting_take','Взять в работу'],['in_progress','В работе'],
  ['awaiting_analysis','Анализ ответа'],['submitted','На проверке'],['overdue','Напоминания']];
 const wasOpen=summary.querySelector('details')?.open;
 const rows=items=>items.map(item=>'<div class="tm266-summary-row"><div><strong>'+E(item.title||item.sku)+'</strong><small>'+
  E(workLabels[item.stage]||'В работе')+(leader()?' · '+E(managerNames[item.manager_email]||'Менеджер'):'')+
  (item.overdue?' · срок прошёл':item.due_at?' · до '+E(dt(item.due_at)):'')+
  '</small></div><button type="button" data-tm266-queue-case="'+E(item.id)+'">Открыть</button></div>').join('');
 summary.innerHTML='<h3>Работа по позициям 21vek</h3>'+
  (summaryError?'<p role="status">Не удалось обновить задачи 21vek.</p><button type="button" data-tm266-queue-retry>Повторить</button>':
   !summaryData?'<p role="status">Загружаю задачи 21vek…</p>':
   !entries.length?'<p class="note">Открытых разборов и задач нет.</p>':
   '<ul class="tm266-counts">'+labels.filter(([key])=>counts[key]).map(([key,label])=>'<li>'+label+' <b>'+E(counts[key])+'</b></li>').join('')+
   '</ul>'+rows(entries.slice(0,4))+(entries.length>4?'<details'+(wasOpen?' open':'')+'><summary>Ещё '+E(entries.length-4)+'</summary>'+rows(entries.slice(4))+'</details>':''));
}
async function refreshSummary(){
 const owner=userEmail();
 if(!summary?.isConnected||!owner||summary.closest('[data-visible="false"]')||document.hidden)return;
 if(summaryFlight?.owner===owner)return;
 const ticket={owner};summaryFlight=ticket;
 try{
  const data=await call({action:'queue'});
  if(userEmail()===owner&&summaryFlight===ticket){summaryData=data;summaryError=false;renderSummary()}
 }catch(_){
  if(userEmail()===owner&&summaryFlight===ticket){summaryError=true;renderSummary()}
 }finally{if(summaryFlight===ticket)summaryFlight=null}
}
function mountSummary(host){
 clearInterval(summaryTimer);summaryTimer=null;
 summary=host||null;
 if(!summary)return;
 const owner=userEmail();
 if(owner!==summaryOwner){summaryOwner=owner;summaryData=null;summaryError=false}
 css();renderSummary();void refreshSummary();
 summaryTimer=setInterval(()=>{
  if(!summary?.isConnected){clearInterval(summaryTimer);summaryTimer=null;return}
  void refreshSummary();
 },60000);
}
function openQueueCase(id){
 const route=document.querySelector('#tr14-shell [data-tr14="competitors"]');
 if(!route)return;
 opening?.();
 let observer,timer;
 const cancel=()=>{observer?.disconnect();clearTimeout(timer);opening=null};
 const tryOpen=()=>{
  const section=document.querySelector('#tr14-panel [data-tm266-container]');
  if(!section)return;
  cancel();
  section.open=true;
  state.nextCase=id;
  mount();
  if(!state.busy){state.nextCase=null;void action({action:'case',case_id:id})}
 };
 opening=cancel;
 observer=new MutationObserver(tryOpen);
 observer.observe(document.body,{childList:true,subtree:true});
 timer=setTimeout(cancel,12000);
 route.click();
 tryOpen();
}
document.addEventListener('click',e=>{
 const queue=e.target.closest?.('[data-tm266-queue-case]');
 if(queue){openQueueCase(queue.dataset.tm266QueueCase);return}
 if(e.target.closest?.('[data-tm266-queue-retry]')){void refreshSummary();return}
 if(!e.target.closest?.('[data-tm266]'))return;
 if(e.target.closest?.('[data-tm266-refresh]')){state.loadedAt=0;refresh();return}
 const pick=e.target.closest?.('[data-tm266-investigate]');
 if(pick){action({action:'investigate',entity_key:pick.dataset.tm266Investigate,kind:'own',scope_key:pick.dataset.tm266Scope});return}
 const saved=e.target.closest?.('[data-tm266-saved]');
 if(saved){state.focus=state.saved.find(x=>x.id===saved.dataset.tm266Saved)||null;render();showOutcome();return}
 if(e.target.closest?.('[data-tm266-assign]')){action({action:'assign',case_id:state.focus?.id,manager_email:state.root?.querySelector('[data-tm266-assignee]')?.value});return}
 if(e.target.closest?.('[data-tm266-analyze]')){action({action:'analyze_answer',case_id:state.focus?.id});return}
 if(e.target.closest?.('[data-tm266-request]')){action({action:'request_reply',case_id:state.focus?.id});return}
 if(e.target.closest?.('[data-tm266-analyze-report]')){action({action:'analyze_report',case_id:state.focus?.id});return}
 if(e.target.closest?.('[data-tm266-take]'))action({action:'take_work',case_id:state.focus?.id});
},true);
document.addEventListener('submit',e=>{
 const form=e.target;
 if(!form.matches?.('[data-tm266-form],[data-tm266-report]')||!state.focus)return;
 e.preventDefault();
 if(state.busy)return;
 const isReport=form.matches('[data-tm266-report]');
 const field=isReport?form.elements.report:form.elements.answer;
 const value=field.value.trim();
 if(value.length<4){field.setCustomValidity('Добавьте немного деталей.');field.reportValidity();return}
 const id=state.focus.id;
 state.draft={caseId:id,...(isReport?{report:value}:{answer:value})};
 if(isReport)action({action:'report_work',case_id:id,report:value});
 else action({action:e.submitter?.value==='preview'?'preview_answer':'answer',case_id:id,answer:value});
},true);
document.addEventListener('input',e=>{
 if(e.target.closest?.('[data-tm266-form],[data-tm266-report]'))e.target.setCustomValidity('');
},true);
document.addEventListener('toggle',e=>{
 if(!e.target.matches?.('[data-tm266-container]'))return;
 if(e.target.open){
  mount();
  if(!state.busy&&replyPending(state.focus))refresh();
 }else clearTimeout(state.poll);
},true);
document.addEventListener('change',e=>{
 if(!e.target.matches?.('[data-tm266-filter]'))return;
 state.scope=e.target.value||'';render();
},true);
window.RESANTA_TRIOVIST_MARKET_AI_V1=Object.freeze({version:VERSION,mount,refresh,mountSummary,readOnlyParser:true,allActiveGroups:true});
})();
