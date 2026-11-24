/* RESANTA / Triovist · Uni AI Brainstorm v2. Only Payushin clicks to form proposals.
 * Preview is read-only; approved leader action creates a single monthly SUBGROUP task.
 */
(function(w,d){
'use strict';
if(w.RESANTA_TRIOVIST_DEMAND_AI_V1)return;
const VERSION='2026.11.23-task-assignment',ID='tri-ai179',STYLE='tri-ai179-style';
const A='aleksandrenko_av@resanta.ru',K='krishtal_na@resanta.ru';
let selected=A,snapshot=null,loadedMonth='',busy=false,message='',messageKind='',messageTarget='',expanded=new Set(),rejected=new Set(),drafts=new Map();
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=x=>Number.isFinite(Number(x))?Number(x):0;
const money=x=>n(x).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const qty=x=>n(x).toLocaleString('ru-RU',{maximumFractionDigits:0});
const profile=()=>{try{return typeof currentProfile!=='undefined'?currentProfile||{}:w.currentProfile||{}}catch(_){return w.currentProfile||{}}};
const director=()=>String(profile()?.role||'').toLowerCase()==='boss'&&String(profile()?.email||'').toLowerCase()==='payushin_ar@resanta.ru';
const active=()=>d.getElementById('page-triovist')?.classList?.contains('active')&&d.querySelector('#tr14-shell [data-tr14="tasks"]')?.classList?.contains('on');
const nowMonth=()=>{const t=new Date();return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')};
const month=()=>w.RESANTA_TRIOVIST_TASK_MONTH_SAFE_V23651?.getMonth?.()||nowMonth();
const current=()=>month()===nowMonth();
const due=m=>{const [y,mm]=m.split('-').map(Number);return m+'-'+String(new Date(y,mm,0).getDate()).padStart(2,'0')};
const dbx=()=>{try{return typeof db!=='undefined'?db:w.db}catch(_){return w.db}};
const key=x=>[x.manager_email,x.group,x.subgroup].map(z=>String(z||'').toLocaleLowerCase('ru')).join('|');
function styles(){
 if(d.getElementById(STYLE))return;
 const s=d.createElement('style');s.id=STYLE;
 s.textContent=`
#tri-ai179{border:1px solid var(--border);background:var(--card);padding:15px;border-radius:12px;margin:0 0 12px;color:var(--text)}
#tri-ai179 *{box-sizing:border-box}
#tri-ai179 h3{margin:0;font-size:22px;line-height:1.25}
#tri-ai179 .ab-note{font-size:13px;line-height:1.5;color:var(--sub)}
#tri-ai179 :is(.ab-heading,.ab-row){display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#tri-ai179 .ab-heading{position:relative;margin-bottom:12px}
#tri-ai179 .ab-row{margin:10px 0}
#tri-ai179 .ab-form{padding:10px;background:var(--bg);border:1px solid var(--border);border-radius:10px}
#tri-ai179 .ab-form label{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:var(--sub)}
#tri-ai179 :is(select,input,textarea,button){min-height:36px;padding:7px 10px;border:1px solid var(--border);background:var(--card);border-radius:8px;color:var(--text);font:inherit}
#tri-ai179 :is(button,select,input,textarea,summary):focus-visible{outline:2px solid var(--a);outline-offset:2px}
#tri-ai179 :is(input,textarea){width:100%}
#tri-ai179 textarea{resize:vertical;min-height:64px}
#tri-ai179 button{cursor:pointer;font-weight:600;color:var(--a)}
#tri-ai179 button:not(:disabled):hover{background:var(--ab)}
#tri-ai179 button:is(.primary,.approve){background:var(--a);border-color:var(--a);color:#fff}
#tri-ai179 button:is(.primary,.approve):not(:disabled):hover{background:var(--at)}
#tri-ai179 button:disabled{opacity:.55;cursor:default}
#tri-ai179 .ab-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(145px,100%),1fr));gap:8px;margin:12px 0}
#tri-ai179 :is(.ab-stat,.ab-panel){background:var(--card);border:1px solid var(--border);padding:12px;border-radius:10px;min-width:0}
#tri-ai179 .ab-stat small,#tri-ai179 .ab-stat span{display:block;font-size:12px;color:var(--sub)}
#tri-ai179 .ab-stat strong{font-size:clamp(16px,2vw,22px);overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
#tri-ai179 .ab-panel{margin:9px 0;scroll-margin-top:70px}
#tri-ai179 .ab-panel h4{font-size:16px;margin:0}
#tri-ai179 .ab-tag{font-size:12px;border-radius:99px;padding:3px 8px;background:var(--ab);color:var(--at);font-weight:600}
#tri-ai179 .ab-tag.bad{background:var(--rb);color:var(--r)}
#tri-ai179 .ab-cols,#tri-ai179 .ab-edit{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:10px 0}
#tri-ai179 :is(.ab-sect,.ab-edit){background:var(--bg);border:1px solid var(--border);border-radius:9px;padding:11px;font-size:13px;line-height:1.5}
#tri-ai179 .ab-sect p{margin:5px 0}
#tri-ai179 .ab-sect summary{cursor:pointer;color:var(--a);font-weight:600}
#tri-ai179 .ab-skus{display:flex;flex-wrap:wrap;gap:5px;margin:5px 0}
#tri-ai179 .ab-skus span{background:var(--card);border:1px solid var(--border);border-radius:7px;padding:5px 7px;font-size:12px}
#tri-ai179 .ab-edit label{font-weight:600;display:block}
#tri-ai179 .ab-edit :is(input,textarea){margin-top:4px}
#tri-ai179 .ab-wide{grid-column:1/-1}
#tri-ai179 .ab-status{padding:8px 10px;border:1px solid var(--border);border-radius:8px;margin:9px 0;background:var(--bg);font-size:13px}
#tri-ai179 .ab-success{background:var(--gb);color:var(--g)}
#tri-ai179 .ab-warn{background:var(--amb);color:var(--am)}
#tri-ai179 .ab-error{background:var(--rb);color:var(--r)}
#tri-ai179 .ab-help{display:inline-flex}
#tri-ai179 .ab-help button{width:28px;min-height:28px;padding:0;font-size:17px}
#tri-ai179 .ab-tip{display:none;pointer-events:none;position:absolute;inset:100% auto auto 0;z-index:6;width:min(440px,100%);padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--card);box-shadow:0 4px 14px #11182720;color:var(--text);font-size:13px;line-height:1.5;font-weight:400}
#tri-ai179 .ab-help:is(:hover,:focus-within) .ab-tip{display:block}
#tri-ai179 .ab-tip p{margin:0}
#tri-ai179 .ab-tip p+p{margin-top:6px}
#tri-ai179 :is([data-ab-result],[data-ab-status]){scroll-margin-top:75px}
@media(max-width:800px){#tri-ai179 :is(.ab-cols,.ab-edit){grid-template-columns:1fr}}
`;
 d.head.appendChild(s);
}
function host(){
 if(!director()||!active())return null;
 const parent=d.getElementById('tri-task-card');if(!parent)return null;
 styles();let el=d.getElementById(ID);
 if(!el){el=d.createElement('section');el.id=ID;el.setAttribute('aria-label','Выставление задач');parent.prepend(el)}
 return el;
}
function listingText(x){
 return 'Проверить листинг подгруппы '+x.subgroup+': SKU '+n(x.sku_count)+
 ', подтверждённые позиции '+n(x.positions_known)+', без позиции '+n(x.rank_unknown)+
 ', ниже TOP-60 '+n(x.outside_top60)+', проблемы карточек '+n(x.card_issues)+
 '. Сверить актуальные позиции, наличие, цену и содержание карточек; зафиксировать действия. Не считать неизвестную позицию выпадением из TOP-60.';
}
function initial(x){
 return {title:month().slice(5)+'.'+month().slice(0,4)+' · '+x.subgroup+' · объём и листинг',
  target:x.suggested_target==null?'':String(x.suggested_target),listing:listingText(x),note:'',due:due(month())};
}
function draftOf(x){let k=key(x);if(!drafts.has(k))drafts.set(k,initial(x));return drafts.get(k)}
function stat(name,value,detail){
 return '<div class="ab-stat"><small>'+esc(name)+'</small><strong>'+esc(value)+'</strong><span>'+esc(detail)+'</span></div>';
}
function proposalHtml(x){
 const id=key(x),edit=expanded.has(id),draft=draftOf(x),pending=busy&&messageTarget===id;
 const samples=Array.isArray(x.listing_skus)?x.listing_skus:[],
       known=samples.filter(t=>t.position!=null),
       unknown=samples.filter(t=>t.position==null);
 const skuReason=t=>t.listing_state==='out_of_stock'?'21vek: нет в наличии':
  t.listing_state==='not_in_fresh_registry'?'Нет в свежем реестре 21vek':
  'Позиция не подтверждена текущей проверкой';
 const dated=t=>t.position_last_seen?String(t.position_last_seen).slice(0,10).split('-').reverse().join('.'):'';
 const knownHtml=known.map(t=>'<span>'+esc(t.sku)+' · №'+esc(t.position)+'</span>').join('');
 const unknownHtml=unknown.map(t=>'<span>'+esc(t.sku)+' · '+esc(skuReason(t))+
   (t.position_last_exact!=null?' · ранее №'+esc(t.position_last_exact)+' ('+esc(dated(t))+')':' · точной истории нет')+'</span>').join('');
 const sku='<div class="ab-note"><b>Подтверждённые позиции ('+known.length+')</b></div>'+
    '<div class="ab-skus">'+knownHtml+'</div>'+
    '<div class="ab-note" style="margin-top:9px"><b>Требуют проверки ('+unknown.length+')</b> — историческая позиция не является текущей</div>'+
    '<div class="ab-skus">'+unknownHtml+'</div>';
 let editor='';
 if(edit){
  editor='<div class="ab-edit" data-ab-card="'+esc(id)+'">'+
  '<label class="ab-wide">Название поручения<input type="text" maxlength="350" data-ab-field="title" value="'+esc(draft.title)+'"></label>'+
  '<label>Цель по объёму, BYN<input type="number" min="1" max="100000000" step="0.01" data-ab-field="target" value="'+esc(draft.target)+'"></label>'+
  '<label>Срок<input type="date" data-ab-field="due" value="'+esc(draft.due)+'"></label>'+
  '<label class="ab-wide">Обязательная часть «Листинг»<textarea rows="3" maxlength="1800" data-ab-field="listing">'+esc(draft.listing)+'</textarea></label>'+
  '<label class="ab-wide">Комментарий руководителя (необязательно)<textarea rows="2" maxlength="2000" data-ab-field="note" placeholder="Можно оставить пустым: личное утверждение и отличие от рекомендации будут сохранены автоматически">'+esc(draft.note)+'</textarea></label></div>';
 }
 return '<article class="ab-panel" data-ab-proposal="'+esc(id)+'"><h4>'+esc(x.subgroup)+' · '+esc(x.group)+'</h4>'+
 '<div class="ab-row"><span class="ab-tag">'+esc(x.manager_name)+'</span><span class="ab-tag bad">Падение '+esc(x.change_pct)+'%</span>'+
 '<span class="ab-tag">Потери '+money(x.loss)+'</span><span class="ab-tag">Приоритет №'+esc(x.priority_rank)+'</span></div>'+
 '<div class="ab-cols"><section class="ab-sect"><b>1 · Объём продаж</b>'+
 '<p>Сопоставимый период 2025: '+money(x.sales_previous_year)+'</p>'+
 '<p>Сопоставимый период 2026: <b>'+money(x.sales_current_year)+'</b></p>'+
 '<p>Аналогичный месяц 2025: '+money(x.analogous_month_last_year)+'</p>'+
 '<p>Первичный ориентир: <b>'+(x.suggested_target==null?'не определён — укажи вручную':money(x.suggested_target))+'</b></p>'+
 '<p>'+esc(x.target_note||'')+'</p>'+
 '<p>Свободно 21vek: '+qty(x.partner_free)+'; Витебск: '+qty(x.vitebsk_qty)+
 '; Чехов справочно: '+qty(x.chekhov_reference)+' шт.</p></section>'+
 '<section class="ab-sect"><b>2 · Обязательный листинг 21vek</b>'+
 '<p>SKU '+qty(x.sku_count)+', известные позиции '+qty(x.positions_known)+
 ', ниже TOP-60 '+qty(x.outside_top60)+', без подтверждения '+qty(x.rank_unknown)+
 ', замечания карточек '+qty(x.card_issues)+'.</p>'+
 '<details><summary>Позиции по SKU</summary>'+sku+'</details>'+
 '<p>Менеджер документирует проверку. Нет товара, отсутствие в свежем реестре и неподтверждённая позиция — разные причины; историческую позицию нельзя считать текущей.</p></section></div>'+
 editor+(messageTarget===id?statusHtml():'')+
 '<div class="ab-row"><button type="button" data-ab-edit="'+esc(id)+'">'+(edit?'Свернуть':'✎ Изменить')+'</button>'+
 '<button type="button" class="approve" data-ab-approve="'+esc(id)+'" '+(busy?'disabled':'')+'>'+(pending?'Назначаю…':'Согласовать и назначить')+'</button>'+
 '<button type="button" data-ab-reject="'+esc(id)+'">Отклонить</button></div></article>';
}
function help(id,label,body){
 const tip='ab-tip-'+id;
 return '<span class="ab-help"><button type="button" aria-label="'+esc(label)+'" aria-describedby="'+tip+'">*</button>'+
 '<span id="'+tip+'" class="ab-tip" role="tooltip">'+body+'</span></span>';
}
function setMessage(kind,text='',target=''){
 message=text;messageKind=kind;messageTarget=target;
}
function statusHtml(){
 return '<div data-ab-status tabindex="-1" role="'+(messageKind==='error'?'alert':'status')+
  '" class="ab-status ab-'+messageKind+'">'+esc(message)+'</div>';
}
function resultHelp(data){
 const period=data.timeframe||{},q=data.quality||{};
 return help('basis','Сравнимые продажи и остатки',
 '<p><b>Сравнимые продажи.</b> '+esc(period.last_year_start||'—')+' — '+esc(period.last_year_end||'—')+
 ' против '+esc(period.current_start||'—')+' — '+esc(period.current_end||'—')+
 '.</p><p>Ориентир на выбранный месяц — продажи того же месяца прошлого года ×1,15. Сумму можно откорректировать перед утверждением.</p>'+
 '<p><b>Остатки.</b> 21vek '+esc(q.partner_date||'—')+' · Витебск '+esc(q.vitebsk_date||'—')+
 ' · Чехов справочно '+esc(q.chekhov_date||'—')+'. '+esc(q.transit_note||'')+'</p>');
}
function reveal(selector,region){
 const root=host();
 const scope=region?Array.from(root?.querySelectorAll?.('[data-ab-proposal]')||[]).find(el=>el.dataset.abProposal===region):root;
 const node=scope?.querySelector?.(selector);
 node?.focus?.({preventScroll:true});
 node?.scrollIntoView?.({block:'nearest'});
}
function render(){
 const root=host();if(!root)return false;
 const m=month(),archive=!current();
 if(loadedMonth&&loadedMonth!==m){
  snapshot=null;loadedMonth='';setMessage('');expanded.clear();rejected.clear();drafts.clear();
 }
 const arr=(snapshot?.proposals||[]).filter(x=>!rejected.has(key(x)));
 const summary=snapshot?.managers||[];
 const opts='<option value="'+A+'" '+(selected===A?'selected':'')+'>Александренко</option>'+
 '<option value="'+K+'" '+(selected===K?'selected':'')+'>Кришталь</option>'+
 '<option value="all" '+(selected==='all'?'selected':'')+'>Оба менеджера</option>';
 root.innerHTML='<div class="ab-heading"><h3>Выставление задач</h3>'+
 help('workflow','Как выставлять задачи',
  '<p><b>Месяц.</b> '+esc(m)+'</p><p>После нажатия «Сформировать задачи ИИ» CRM проанализирует товарные подгруппы и предложит до 30 обоснованных задач на менеджера. Предложения можно отредактировать. Для назначения каждой задачи нужно отдельное утверждение руководителя.</p>')+'</div>'+
 '<div class="ab-row ab-form"><label>Менеджер <select data-ab-manager '+(busy?'disabled':'')+'>'+opts+'</select></label>'+
 '<button class="primary" type="button" data-ab-start aria-busy="'+(busy&&!messageTarget)+'" '+(busy||archive?'disabled':'')+'>'+
 (busy&&!messageTarget?'Анализирую данные…':'Сформировать задачи ИИ')+'</button></div>'+
 (archive?'<p class="ab-note">Архивный месяц. Для выставления задач откройте текущий месяц.</p>':'')+
 (message&&!messageTarget?statusHtml():'')+
 (snapshot?'<div class="ab-stats">'+stat('Предложений',arr.length,'Падающие подгруппы')+
 stat('Сумма потерь',money(arr.reduce((sum,x)=>sum+n(x.loss),0)),'По предложенным подгруппам')+
 stat('Лимит','30','На одного менеджера')+
 stat('В работе',summary.map(x=>x.name+': '+n(x.active_tasks)).join(' · '),'Существующие задачи')+'</div>'+
 '<div class="ab-heading"><h3 data-ab-result tabindex="-1">Предложения к утверждению</h3>'+resultHelp(snapshot)+
 (rejected.size?'<button type="button" data-ab-undo>Вернуть отклонённые</button>':'')+'</div>'+
 (arr.length?arr.map(proposalHtml).join(''):'<p class="ab-note">Предложений к утверждению нет.</p>'):'');
 d.querySelector('.tm360-generator-pause')?.style?.setProperty?.('display','none');
 return true;
}
async function brainstorm(){
 if(!director()||busy||!current()||!active())return false;
 const cli=dbx();if(!cli?.rpc){setMessage('error','Соединение с CRM недоступно');render();return false}
 const m=month(),owner=selected;
 busy=true;setMessage('pending','Сверяю продажи, подгруппы, листинг и остатки…');render();
 try{
  const r=await cli.rpc('triovist_ai_brainstorm_preview_v20261105',{p_month:m+'-01',p_manager_email:owner==='all'?null:owner});
  if(r?.error)throw r.error;
  if(!r?.data||r.data.version!=='uni-brainstorm-subgroup-v2'||r.data.month!==m)throw Error('Неверный период или версия ИИ');
  if(!Array.isArray(r.data.proposals)||[A,K].some(email=>r.data.proposals.filter(x=>x.manager_email===email).length>30))throw Error('Превышен лимит 30 предложений');
  if(month()!==m||selected!==owner)return false;
  snapshot=r.data;loadedMonth=m;expanded.clear();rejected.clear();drafts.clear();
  setMessage('success','Предложения готовы: '+qty(snapshot.proposals.length)+'. '+(snapshot.proposals.length?'Проверьте предложения и согласуйте нужные задачи.':'Подходящих подгрупп для новых задач нет.'));
  return true;
 }catch(e){if(month()===m)setMessage('error','Не удалось подготовить предложения: '+String(e?.message||e));return false}
 finally{busy=false;if(month()!==m)setMessage('');render();if(month()===m)reveal(messageKind==='success'&&snapshot?.proposals?.length?'[data-ab-result]':'[data-ab-status]')}
}
async function approve(id){
 if(!director()||busy||!snapshot||!current())return false;
 const m=month(),approvedSnapshot=snapshot;
 const x=snapshot.proposals.find(p=>key(p)===id);if(!x||rejected.has(id))return false;
 const f=draftOf(x),target=Number(String(f.target).replace(',','.'));
 if(!Number.isFinite(target)||target<=0||target>100000000){setMessage('error','Укажите положительную денежную цель до 100 000 000 BYN.',id);expanded.add(id);render();reveal('[data-ab-status]',id);return false}
 if(String(f.listing).trim().length<15){setMessage('error','Опишите действия по листингу, минимум 15 символов.',id);expanded.add(id);render();reveal('[data-ab-status]',id);return false}
 // An explicit leader confirmation is the decision; a second typed note is optional.
 // Server records AI baseline, actual approved amount and automatic audit explanation.
 if(String(f.note).length>2000){setMessage('error','Комментарий слишком длинный (максимум 2000 символов).',id);expanded.add(id);render();reveal('[data-ab-status]',id);return false;}
 const baseline=x.suggested_target==null?null:Number(x.suggested_target),
  raised=baseline>0&&target>baseline*1.5;
 const warning=raised?'\n⚠ Цель выше предложения ИИ в '+(target/baseline).toFixed(1)+' раза ('+money(baseline)+' → '+money(target)+'). Решение будет сохранено в истории.':'';
 if(!w.confirm?.('СОГЛАСОВАТЬ И НАЗНАЧИТЬ одну задачу?\n'+x.manager_name+' · '+x.group+' / '+x.subgroup+
 '\nОбъём '+money(target)+warning+'\nЛистинг: '+f.listing.slice(0,170)))return false;
 busy=true;setMessage('pending','Проверяю и назначаю задачу…',id);render();
 try{
  const r=await dbx().rpc('triovist_ai_brainstorm_approve_v20261105',{
   p_month:m+'-01',p_manager_email:x.manager_email,
   p_group:x.group,p_subgroup:x.subgroup,p_target_revenue:target,
   p_listing_text:f.listing,p_task_note:f.note,p_title:f.title,p_due_date:f.due
  });
  if(r?.error)throw r.error;if(!r?.data?.ok||r.data.status!=='new')throw Error('Утверждение не подтверждено базой');
  approvedSnapshot.proposals=approvedSnapshot.proposals.filter(y=>key(y)!==id);
  const row=approvedSnapshot.managers?.find(y=>y.email===x.manager_email);if(row)row.active_tasks=n(row.active_tasks)+1;
  expanded.delete(id);drafts.delete(id);
  setMessage('success','Задача назначена. '+x.manager_name+' · '+x.subgroup+' · '+money(target)+'.');
  w.TRIOVIST_DATA_HUB_V227315?.invalidate?.('tasks');
  if(month()!==m)return true;
  try{
   const refreshed=await w.RESANTA_TRIOVIST_TASK_MONTH_SAFE_V23651?.render?.(true);
   if(refreshed===false)setMessage('warn',message+' Список месяца пока не обновился.');
   w.RESANTA_TRIOVIST_TASKS360_V1?.enhance?.();
  }catch(_){setMessage('warn',message+' Список месяца пока не обновился.')}
  return true;
 }catch(e){if(month()===m)setMessage('error','Задача не назначена: '+String(e?.message||e),id);return false}
 finally{busy=false;if(month()!==m)setMessage('');render();if(month()===m)reveal('[data-ab-status]',messageTarget)}
}
function click(e){
 const t=e.target;
 if(t.closest?.('[data-ab-start]')){brainstorm();return}
 if(t.closest?.('[data-ab-undo]')){rejected.clear();render();return}
 const a=t.closest?.('[data-ab-approve]');if(a){approve(a.dataset.abApprove);return}
 const ed=t.closest?.('[data-ab-edit]');if(ed){const id=ed.dataset.abEdit;if(expanded.has(id))expanded.delete(id);else expanded.add(id);render();return}
 const r=t.closest?.('[data-ab-reject]');if(r){rejected.add(r.dataset.abReject);render()}
}
function updateField(e){
 const t=e.target;
 if(t.matches?.('[data-ab-manager]')){
  if(t.value===selected)return;
  selected=t.value;snapshot=null;setMessage('');
  expanded.clear();rejected.clear();drafts.clear();render();return;
 }
 if(!t.matches?.('[data-ab-field]'))return;
 const box=t.closest?.('[data-ab-card]');if(!box)return;
 const obj=snapshot?.proposals?.find(x=>key(x)===box.dataset.abCard);if(obj)draftOf(obj)[t.dataset.abField]=t.value;
}
d.addEventListener('click',e=>{
 if(e.target.closest?.('#'+ID))click(e);
 if(e.target.closest?.('[data-tm51="prev"],[data-tm51="next"],[data-tm51="now"],[data-tr14="tasks"]'))setTimeout(open,160);
},true);
d.addEventListener('input',e=>{if(e.target.closest?.('#'+ID))updateField(e)},true);
d.addEventListener('change',e=>{if(e.target.closest?.('#'+ID))updateField(e)},true);
function open(){if(!director())return false;return render()}
w.RESANTA_TRIOVIST_DEMAND_AI_V1=Object.freeze({
 version:VERSION,open,brainstorm,maxPerManager:30,onDemandOnly:true,
 groupAndSubgroup:true,noSkuTasks:true,onlyPayushinApproves:true,
 noAutoTasks:true,manualEdit:true,excludeGroup900:true
});
})(window,document);
