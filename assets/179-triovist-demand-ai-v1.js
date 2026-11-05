/* RESANTA / Triovist · Uni AI Brainstorm v2. Only Payushin clicks to form proposals.
 * Preview is read-only; approved leader action creates a single monthly SUBGROUP task.
 */
(function(w,d){
'use strict';
if(w.RESANTA_TRIOVIST_DEMAND_AI_V1)return;
const VERSION='2026.11.05.brainstorm-v2',ID='tri-ai179',STYLE='tri-ai179-style';
const A='aleksandrenko_av@resanta.ru',K='krishtal_na@resanta.ru';
let selected=A,snapshot=null,loadedMonth='',busy=false,message='',expanded=new Set(),rejected=new Set(),drafts=new Map();
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
 s.textContent=[
 '#tri-ai179{border:1px solid #c9dcee;background:#f4f8ff;padding:15px;border-radius:14px;margin:11px 0 15px;color:#163b60}',
 '#tri-ai179 *{box-sizing:border-box}#tri-ai179 h3{margin:0 0 5px;font-size:19px;color:#144e7f}',
 '#tri-ai179 .ab-note{font-size:11px;line-height:1.6;color:#657b92}',
 '#tri-ai179 .ab-row{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin:10px 0}',
 '#tri-ai179 select,#tri-ai179 input,#tri-ai179 textarea{padding:9px 10px;border:1px solid #c9d8e9;background:white;border-radius:8px;color:#1a3a5b;font-size:12px;font-family:inherit}',
 '#tri-ai179 input,#tri-ai179 textarea{width:100%}#tri-ai179 textarea{resize:vertical;min-height:70px}',
 '#tri-ai179 button{cursor:pointer;background:#f5faff;border:1px solid #bdd2e7;border-radius:8px;padding:9px 12px;font-size:11px;font-weight:800;color:#205989}',
 '#tri-ai179 button.primary{background:#215fe2;border-color:#215fe2;color:white}',
 '#tri-ai179 button.approve{background:#136f53;border-color:#136f53;color:white}',
 '#tri-ai179 button:disabled{opacity:.55;cursor:not-allowed}',
 '#tri-ai179 .ab-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:13px 0}',
 '#tri-ai179 .ab-stat,#tri-ai179 .ab-panel{background:white;border:1px solid #dce6f2;padding:12px;border-radius:10px;min-width:0}',
 '#tri-ai179 .ab-stat small,#tri-ai179 .ab-stat span{display:block;font-size:10px;color:#6b7e93}#tri-ai179 .ab-stat strong{font-size:20px;color:#154b79}',
 '#tri-ai179 .ab-panel{margin:9px 0}#tri-ai179 .ab-panel h4{font-size:13px;color:#134f82;margin:0 0 5px}',
 '#tri-ai179 .ab-tag{font-size:10px;border-radius:999px;padding:4px 8px;background:#edf4fc;color:#205781;font-weight:750}',
 '#tri-ai179 .ab-tag.bad{background:#fff1ee;color:#bd4b38}',
 '#tri-ai179 .ab-cols{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:10px 0}',
 '#tri-ai179 .ab-sect{background:#f7fafe;border:1px solid #e0e8f1;border-radius:9px;padding:11px;font-size:11px;line-height:1.6}',
 '#tri-ai179 .ab-sect b{color:#154d7d}#tri-ai179 .ab-sect p{margin:5px 0;color:#496783}',
 '#tri-ai179 .ab-skus{display:flex;flex-wrap:wrap;gap:5px;margin:5px 0}',
 '#tri-ai179 .ab-skus span{background:white;border:1px solid #d7e3ee;border-radius:7px;padding:5px 7px;font-size:10px}',
 '#tri-ai179 .ab-edit{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px;border:1px solid #c9d8e8;border-radius:9px;background:#f9fcff}',
 '#tri-ai179 .ab-edit label{font-size:11px;font-weight:750;color:#254965;display:block}',
 '#tri-ai179 .ab-edit input,#tri-ai179 .ab-edit textarea{margin-top:5px}',
 '#tri-ai179 .ab-wide{grid-column:1/-1}#tri-ai179 .ab-warn{border:1px solid #edca9a;background:#fffaeb;padding:10px;border-radius:8px;color:#825f28;font-size:11px;line-height:1.5;margin:11px 0}',
 '#tri-ai179 .ab-success{border:1px solid #a3ddc5;background:#effcf6;padding:9px;border-radius:8px;color:#16704b;font-size:11px}',
 '@media(max-width:800px){#tri-ai179 .ab-cols,#tri-ai179 .ab-edit{grid-template-columns:1fr}#tri-ai179 .ab-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}'
 ].join('\n');
 d.head.appendChild(s);
}
function host(){
 if(!director()||!active())return null;
 const parent=d.getElementById('tri-task-card');if(!parent)return null;
 styles();let el=d.getElementById(ID);
 if(!el){el=d.createElement('section');el.id=ID;el.setAttribute('aria-label','Мозговой штурм ИИ');parent.prepend(el)}
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
 const id=key(x),edit=expanded.has(id),draft=draftOf(x);
 const sku=(x.listing_skus||[]).slice(0,8).map(t=>'<span>'+esc(t.sku)+' · '+(t.position==null?'позиция неизвестна':'№'+esc(t.position))+'</span>').join('');
 let editor='';
 if(edit){
  editor='<div class="ab-edit" data-ab-card="'+esc(id)+'">'+
  '<label class="ab-wide">Название поручения<input type="text" maxlength="350" data-ab-field="title" value="'+esc(draft.title)+'"></label>'+
  '<label>Цель по объёму, BYN<input type="number" min="1" max="100000000" step="0.01" data-ab-field="target" value="'+esc(draft.target)+'"></label>'+
  '<label>Срок<input type="date" data-ab-field="due" value="'+esc(draft.due)+'"></label>'+
  '<label class="ab-wide">Обязательная часть «Листинг»<textarea rows="3" maxlength="1800" data-ab-field="listing">'+esc(draft.listing)+'</textarea></label>'+
  '<label class="ab-wide">Обоснование твоей корректировки денежной цели<textarea rows="2" maxlength="2000" data-ab-field="note" placeholder="Особенно важно при повышенной или ручной цели">'+esc(draft.note)+'</textarea></label></div>';
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
 '<div class="ab-skus">'+sku+'</div>'+
 '<p>Менеджер документирует проверку, руководитель подтверждает. Непроверенная позиция — не доказанное выпадение.</p></section></div>'+
 editor+
 '<div class="ab-row"><button type="button" data-ab-edit="'+esc(id)+'">'+(edit?'Свернуть':'✎ Изменить')+'</button>'+
 '<button type="button" class="approve" data-ab-approve="'+esc(id)+'" '+(busy?'disabled':'')+'>✓ Согласовать и назначить</button>'+
 '<button type="button" data-ab-reject="'+esc(id)+'">Отклонить</button></div></article>';
}
function render(){
 const root=host();if(!root)return false;
 const m=month(),archive=!current();
 if(loadedMonth&&loadedMonth!==m){
  snapshot=null;loadedMonth='';message='';expanded.clear();rejected.clear();drafts.clear();
 }
 const arr=(snapshot?.proposals||[]).filter(x=>!rejected.has(key(x)));
 const summary=snapshot?.managers||[],q=snapshot?.quality||{};
 const opts='<option value="'+A+'" '+(selected===A?'selected':'')+'>Александренко</option>'+
 '<option value="'+K+'" '+(selected===K?'selected':'')+'>Кришталь</option>'+
 '<option value="all" '+(selected==='all'?'selected':'')+'>Оба менеджера</option>';
 root.innerHTML='<h3>🧠 Мозговой штурм ИИ</h3>'+
 '<p class="ab-note">Ты запускаешь анализ, читаешь и редактируешь предложения <b>по товарным подгруппам</b>. До 30 на менеджера, но не заполняем количество искусственно. Только ты утверждаешь задачи.</p>'+
 '<div class="ab-row"><label>Менеджер <select data-ab-manager '+(busy?'disabled':'')+'>'+opts+'</select></label>'+
 '<button class="primary" type="button" data-ab-start '+(busy||archive?'disabled':'')+'>'+(busy?'Сравниваю продажи…':'🧠 Сформировать задачи ИИ')+'</button>'+
 '<span class="ab-note">Месяц: '+esc(m)+(archive?' · архив (только просмотр)':'')+'</span></div>'+
 (archive?'<div class="ab-warn">Архивный месяц: новые задачи не создаются. Вернись к текущему месяцу.</div>':'')+
 (message?'<div role="status" class="'+(message.startsWith('✓')?'ab-success':'ab-warn')+'">'+esc(message)+'</div>':'')+
 (!snapshot?'<p class="ab-note">До нажатия «Сформировать задачи ИИ» ничего не формируется и не назначается.</p>':
 '<div class="ab-stats">'+stat('Предложений',arr.length,'Только падающие подгруппы')+
 stat('Сумма потерь',money(arr.reduce((s,x)=>s+n(x.loss),0)),'Потери по предложенным подгруппам')+
 stat('Лимит','30','Максимум на одного менеджера')+
 stat('В работе',summary.map(x=>esc(x.name)+': '+n(x.active_tasks)).join(' · '),'С учётом существующих задач')+'</div>'+
 '<div class="ab-warn"><b>Сравнимые продажи:</b> '+esc(snapshot.timeframe?.last_year_start)+' — '+esc(snapshot.timeframe?.last_year_end)+
 ' против '+esc(snapshot.timeframe?.current_start)+' — '+esc(snapshot.timeframe?.current_end)+
 '. Ноябрь не планируется прямым переносом октября. Ориентир суммы — ноябрь прошлого года ×1,15, с твоей корректировкой.'+
 ' <b>Остатки:</b> 21vek '+esc(q.partner_date)+'; Витебск '+esc(q.vitebsk_date)+'; Чехов справочно '+esc(q.chekhov_date)+'. '+esc(q.transit_note||'')+'</div>'+
 '<div class="ab-row"><b>Предложения на твоё утверждение</b>'+
 (rejected.size?'<button type="button" data-ab-undo>Вернуть отклонённые</button>':'')+'</div>'+
 (arr.length?arr.map(proposalHtml).join(''):'<p class="ab-note">Подтверждённых новых проблемных подгрупп нет.</p>')+
 '<p class="ab-note">Мозговой штурм — только чтение данных. Только твоё отдельное подтверждение создаёт одну рабочую задачу. Полное выполнение: денежный результат + проверенный тобой отчёт по листингу.</p>');
 d.querySelector('.tm360-generator-pause')?.style?.setProperty?.('display','none');
 return true;
}
async function brainstorm(){
 if(!director()||busy||!current()||!active())return false;
 const cli=dbx();if(!cli?.rpc){message='Соединение с CRM недоступно';render();return false}
 const m=month(),owner=selected;
 busy=true;message='ИИ сверяет продажи, подгруппы, листинг и остатки…';render();
 try{
  const r=await cli.rpc('triovist_ai_brainstorm_preview_v20261105',{p_month:m+'-01',p_manager_email:owner==='all'?null:owner});
  if(r?.error)throw r.error;
  if(!r?.data||r.data.version!=='uni-brainstorm-subgroup-v2'||r.data.month!==m)throw Error('Неверный период или версия ИИ');
  if(!Array.isArray(r.data.proposals)||[A,K].some(email=>r.data.proposals.filter(x=>x.manager_email===email).length>30))throw Error('Превышен лимит 30 предложений');
  if(month()!==m||selected!==owner)return false;
  snapshot=r.data;loadedMonth=m;expanded.clear();rejected.clear();drafts.clear();
  message='✓ Мозговой штурм готов. Задачи ещё не назначены.';
  return true;
 }catch(e){message='Мозговой штурм не завершён: '+String(e?.message||e);return false}
 finally{busy=false;render()}
}
async function approve(id){
 if(!director()||busy||!snapshot||!current())return false;
 const x=snapshot.proposals.find(p=>key(p)===id);if(!x||rejected.has(id))return false;
 const f=draftOf(x),target=Number(String(f.target).replace(',','.'));
 if(!Number.isFinite(target)||target<=0||target>100000000){message='Для '+x.subgroup+' нужна положительная денежная цель.';expanded.add(id);render();return false}
 if(String(f.listing).trim().length<15){message='Заполни действия по листингу, минимум 15 символов.';expanded.add(id);render();return false}
 if((x.suggested_target==null||n(x.suggested_target)<=0||target>n(x.suggested_target)*1.5)&&String(f.note).trim().length<15){
  message='Повышенная или ручная цель требует твоего объяснения минимум из 15 символов.';expanded.add(id);render();return false;
 }
 if(!w.confirm?.('СОГЛАСОВАТЬ И НАЗНАЧИТЬ одну задачу?\n'+x.manager_name+' · '+x.group+' / '+x.subgroup+
 '\nОбъём '+money(target)+'\nЛистинг: '+f.listing.slice(0,170)))return false;
 busy=true;message='Проверяю данные и записываю только эту задачу…';render();
 try{
  const r=await dbx().rpc('triovist_ai_brainstorm_approve_v20261105',{
   p_month:month()+'-01',p_manager_email:x.manager_email,
   p_group:x.group,p_subgroup:x.subgroup,p_target_revenue:target,
   p_listing_text:f.listing,p_task_note:f.note,p_title:f.title,p_due_date:f.due
  });
  if(r?.error)throw r.error;if(!r?.data?.ok||r.data.status!=='new')throw Error('Утверждение не подтверждено базой');
  snapshot.proposals=snapshot.proposals.filter(y=>key(y)!==id);
  const row=snapshot.managers?.find(y=>y.email===x.manager_email);if(row)row.active_tasks=n(row.active_tasks)+1;
  expanded.delete(id);drafts.delete(id);
  message='✓ Утверждено: '+x.subgroup+' · '+money(target)+'. Назначена одна рабочая задача.';
  w.TRIOVIST_DATA_HUB_V227315?.invalidate?.('tasks');
  await w.RESANTA_TRIOVIST_TASK_MONTH_SAFE_V23651?.render?.(true);
  w.RESANTA_TRIOVIST_TASKS360_V1?.enhance?.();
  return true;
 }catch(e){message='Задача не назначена: '+String(e?.message||e);return false}
 finally{busy=false;render()}
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
  selected=t.value;snapshot=null;message='Выбран другой менеджер. Нажми «Сформировать задачи ИИ».';
  expanded.clear();rejected.clear();drafts.clear();render();return;
 }
 if(!t.matches?.('[data-ab-field]'))return;
 const box=t.closest?.('[data-ab-card]');if(!box)return;
 const obj=snapshot?.proposals?.find(x=>key(x)===box.dataset.abCard);if(obj)draftOf(obj)[t.dataset.abField]=t.value;
}
d.addEventListener('click',e=>{
 if(e.target.closest?.('#'+ID))click(e);
 if(e.target.closest?.('[data-tm51],[data-tr14="tasks"]'))setTimeout(open,160);
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
