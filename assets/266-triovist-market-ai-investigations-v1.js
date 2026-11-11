/* Resanta 21vek: evidence-grounded AI ranking investigations.
 * Additive, lazy, server-authorized. No parser mutations, no automatic price/task changes.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_MARKET_AI_V1)return;
const VERSION='market-ai-investigations-v1';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const N=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const A=v=>Array.isArray(v)?v:[];
const dt=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':d.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Minsk'})};
const leaders=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
let state={root:null,feed:null,saved:[],scope:'',focus:null,busy:false,error:'',loadedAt:0,seq:0};
let observer=null;
function leader(){
 let mail='';
 try{mail=String((typeof currentUser!=='undefined'&&currentUser?.email)||window.currentUser?.email||'').toLowerCase()}catch(_){}
 return leaders.has(mail);
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
 '.tm266{margin:14px 0;border:1px solid #cadcee;background:#f5f9ff;border-radius:14px;padding:15px;color:#183b5e;font-family:inherit}',
 '.tm266 *{box-sizing:border-box}.tm266 h3{margin:0;font-size:18px;color:#174c7d}.tm266 h4{font-size:13px;color:#21466c;margin:0 0 9px}',
 '.tm266 header{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px}',
 '.tm266 small,.tm266 .note{font-size:11px;color:#607990;line-height:1.5}',
 '.tm266 button,.tm266 select,.tm266 textarea,.tm266 input{font:inherit;font-size:12px;border:1px solid #b9d0e6;border-radius:9px;padding:8px 10px;min-height:35px;background:white;color:#174e80}',
 '.tm266 button{cursor:pointer;font-weight:750}.tm266 button:hover{background:#e8f3ff}.tm266 button:disabled{opacity:.55;cursor:wait}',
 '.tm266 .tm266-mainbtn{background:#185b94;color:white}.tm266 .tm266-mainbtn:hover{background:#124c80}',
 '.tm266 .tm266-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:12px 0}',
 '.tm266 .tm266-kpi{border:1px solid #dfebf7;background:white;border-radius:11px;padding:11px}',
 '.tm266 .tm266-kpi span{display:block;font-size:11px;color:#667c93}.tm266 .tm266-kpi strong{font-size:22px;color:#1d4f7c}',
 '.tm266 .tm266-layout{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(280px,1fr);gap:12px;margin-top:12px}',
 '.tm266 .tm266-panel{background:white;border:1px solid #dbe6f2;border-radius:11px;padding:13px;min-width:0}',
 '.tm266 .tm266-tools{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:12px 0}',
 '.tm266 .tm266-case{border:1px solid #e2eaf2;border-left:3px solid #4782b5;border-radius:9px;padding:10px;margin:8px 0}',
 '.tm266 .tm266-case.down{border-left-color:#d06b67}.tm266 .tm266-case.up{border-left-color:#2c9977}',
 '.tm266 .tm266-case b{font-size:12px}.tm266 .tm266-case p{font-size:11px;color:#496680;margin:6px 0}',
 '.tm266 .tm266-hyp{padding:9px 10px;background:#f4f8fc;border-radius:8px;margin:7px 0;font-size:12px;line-height:1.5}',
 '.tm266 .tm266-hyp small{display:block;margin-top:4px}',
 '.tm266 .tm266-strong{font-size:13px;font-weight:750;color:#183f64}',
 '.tm266 .tm266-notice{margin:8px 0;font-size:12px;background:#fffaf0;border:1px solid #f0e3c2;border-radius:9px;padding:10px}',
 '.tm266 .tm266-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}',
 '.tm266 textarea{display:block;width:100%;min-height:68px;resize:vertical;margin:7px 0}',
 '.tm266 label{font-size:11px;font-weight:750;display:block;margin-top:8px}',
 '.tm266 details{border:1px solid #e1eaf3;border-radius:9px;padding:9px;margin:10px 0}.tm266 summary{cursor:pointer;font-size:12px;font-weight:750}',
 '.tm266 .tm266-error{background:#fff1f0;color:#a83e38;padding:9px;border-radius:9px;font-size:12px}',
 '@media(max-width:980px){.tm266 .tm266-layout{grid-template-columns:1fr}.tm266 .tm266-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}',
 '@media(max-width:620px){.tm266{padding:11px}.tm266 .tm266-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.tm266 button,.tm266 select,.tm266 textarea{font-size:16px}}'
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
 return '<article class="tm266-case '+(down?'down':'up')+'"><b>'+E(r.title||r.entity_key)+'</b>'+
  '<p>'+E(r.kind==='own'?'Наш SKU':'Конкурент')+' · '+E(movement(r))+' · '+E(dt(r.observed_at))+'</p>'+
  '<div class="tm266-actions"><button type="button" data-tm266-investigate="'+E(r.entity_key)+'" data-tm266-kind="'+E(r.kind)+'" data-tm266-scope="'+E(r.scope_key)+'">Исследовать причины ↗</button></div></article>';
}
function hypotheticals(v){
 const list=A(v?.hypotheses);
 if(!list.length)return '<div class="note">Подтверждённых объяснений пока нет.</div>';
 return list.map(x=>'<div class="tm266-hyp"><b>'+E(x.cause||'Возможная причина')+'</b> · '+E(x.confidence||'низкая')+
 '<small>Основание: '+E(x.evidence||'не подтверждено')+'</small></div>').join('');
}
function caseDetail(c){
 if(!c)return '<div class="note">Выберите изменение позиции и запустите расследование. ИИ проверит факты, сравнит историю и задаст менеджеру конкретный вопрос.</div>';
 const v=c.ai_result||{},o=c.evidence||{},cur=o.current||{};
 const now=Number.isFinite(N(c.position_at_start))?'№'+E(c.position_at_start):'вне TOP-120 / неизвестно';
 const old=Number.isFinite(N(c.position_before))?'№'+E(c.position_before):'неизвестно';
 const conf=v.kind==='hypotheses_not_causal_proof';
 const date3=c.checked_3d_at?('№'+E(c.checked_3d_position)+' · '+E(dt(c.checked_3d_at))):'Ожидаем сопоставимый снимок после 3 суток';
 const date7=c.checked_7d_at?('№'+E(c.checked_7d_position)+' · '+E(dt(c.checked_7d_at))):'Ожидаем сопоставимый снимок после 7 суток';
 let html='<h4>Расследование · '+E(c.title)+'</h4>'+
  '<div class="tm266-notice"><b>Доказанный факт:</b> было '+old+', стало '+now+'. Цена в снимке: '+(cur.price==null?'неизвестна':E(cur.price)+' BYN')+
  '. Проверено '+E(dt(cur.observed_at||c.observed_at))+'.</div>';
 if(!conf){
  html+='<div class="tm266-notice">AI-проверка сейчас недоступна: '+E(v.error||'источник не подтверждён')+
    '. Ни скидки, ни рекламные кампании не объявляются доказанной причиной.</div>';
 }else{
  html+='<div class="tm266-strong">'+E(v.finding)+'</div>'+
    '<h4 style="margin-top:12px">Версии причин · с доказательствами</h4>'+hypotheticals(v)+
    '<div class="tm266-notice"><b>Граница вывода:</b> '+E(v.limits||'Связь событий с причиной не доказана.')+'</div>'+
    '<div class="tm266-hyp"><b>Что предлагается:</b> '+E(v.action)+'</div>'+
    '<div class="tm266-strong" style="margin-top:10px">Вопрос менеджеру</div><p class="note">'+E(v.manager_question)+'</p>';
 }
 html+='<details><summary>Показать факты и источники</summary><div class="note">Источник: '+E(o.source||'Supabase')+
  '. История позиций: '+E(A(o.history).map(r=>dt(r.date)+' '+(r.position==null?'>120':'№'+r.position)).join(' · '))+
  '. Сведения по конкурентам: '+E(A(o.competitors_rising).length)+' позиций. Сведения о рекламе конкурентов недоступны.</div></details>';
 if(c.manager_email)html+='<p class="note"><b>Ответственный:</b> '+E(c.manager_email)+'</p>';
 if(leader()){
  html+='<div class="tm266-actions"><select data-tm266-assignee aria-label="Назначить менеджеру">'+
   '<option value="">Назначить ответственного</option>'+
   ['aleksandrenko_av@resanta.ru','krishtal_na@resanta.ru'].map(x=>'<option value="'+x+'"'+(c.manager_email===x?' selected':'')+'>'+E(x.split('_')[0])+'</option>').join('')+
   '</select><button type="button" data-tm266-assign>Назначить</button></div>';
 }
 if(c.manager_answer){
  html+='<div class="tm266-hyp"><b>Ответ менеджера (непроверенное утверждение):</b> '+E(c.manager_answer)+
  '<small>Источник: '+E(c.manager_source||'не указан')+' · '+E(dt(c.manager_answer_at))+'</small></div>';
 }
 if(c.manager_email||leader()){
  html+='<label>Ответ менеджера и источник доказательства</label><textarea data-tm266-answer maxlength="1600" placeholder="Что реально проверено, какие изменения подтверждены?"></textarea>'+
  '<input data-tm266-source placeholder="Ссылка/отчёт/дата подтверждения" maxlength="350" style="width:100%"/>'+
  '<div class="tm266-actions"><button type="button" data-tm266-save-answer>Отправить на проверку</button></div>';
 }
 if(leader()){
  html+='<label>Решение руководителя</label><textarea data-tm266-note maxlength="950" placeholder="Какое действие согласовано и какой результат проверить"></textarea>'+
  '<div class="tm266-actions"><button type="button" data-tm266-review="approved">Утвердить действие</button>'+
  '<button type="button" data-tm266-review="need_evidence">Запросить доказательства</button>'+
  '<button type="button" data-tm266-review="rejected">Отклонить</button></div>';
 }
 html+='<div class="tm266-notice"><b>Контроль эффективности:</b><div>Через 3 дня: '+E(date3)+'</div>'+
  '<div>Через 7 дней: '+E(date7)+'</div><small>Изменение позиции после действия не доказывает причинность — только корреляцию.</small></div>';
 return html;
}
function render(){
 const root=state.root;if(!root||!root.isConnected)return;
 css();
 const f=state.feed||{},groups=A(f.groups),cases=A(f.cases);
 const selected=state.scope?cases.filter(x=>x.scope_key===state.scope):cases;
 const visible=selected.slice(0,14);
 const record=state.focus;
 root.innerHTML='<header><div><h3>✦ ИИ · Мозговой штурм 21vek</h3>'+
 '<div class="note">Все действующие группы · факты → гипотезы → ответ менеджера → решение → контроль 3/7 дней</div></div>'+
 '<button type="button" data-tm266-refresh '+(state.busy?'disabled':'')+'>↻ Проверить данные</button></header>'+
 '<div class="tm266-kpis">'+
 [['Подключено групп',f.scopes_total??'—'],['Сигналов изменений',f.signals_total??'—'],
 ['Групп с сигналами',f.scopes_with_signals??'—'],['AI-проверок в сутки',f.limits?.deep_ai_per_day??24]].map(x=>'<div class="tm266-kpi"><span>'+E(x[0])+'</span><strong>'+E(x[1])+'</strong></div>').join('')+
 '</div>'+
 '<div class="tm266-tools"><select data-tm266-filter aria-label="Фильтр подгруппы"><option value="">Все подключённые подгруппы</option>'+
 groups.map(g=>'<option value="'+E(g.scope_key)+'"'+(state.scope===g.scope_key?' selected':'')+'>'+E(g.subgroup||g.scope_key)+' · '+E(g.signals)+' сигналов</option>').join('')+
 '</select><button type="button" data-tm266-list>Мои расследования / контроль</button><small>Снимок '+E(dt(f.source_at))+'</small></div>'+
 (state.error?'<div class="tm266-error">'+E(state.error)+'</div>':'')+
 (state.busy?'<div class="note">Проверяю факты и историю…</div>':'')+
 '<div class="tm266-layout"><section class="tm266-panel"><h4>Приоритетные изменения</h4>'+
 (visible.length?visible.map(caseItem).join(''):'<div class="note">'+(state.feed?'В этой подгруппе пока нет значимых подтверждённых перемещений. Выберите другую.':'Загрузка подтверждённых сигналов…')+'</div>')+
 '<details><summary>Сохранённые расследования ('+E(state.saved.length)+')</summary>'+
 A(state.saved).map(c=>'<div class="tm266-case"><b>'+E(c.title)+'</b><p>'+E(c.status)+' · '+E(dt(c.created_at))+
 '</p><button type="button" data-tm266-saved="'+E(c.id)+'">Открыть вывод и ответы</button></div>').join('')+
 '</details></section><section class="tm266-panel">'+caseDetail(record)+'</section></div>'+
 '<div class="note">Анализ использует только существующие источники CRM. ИИ не подтверждает причины без доказательств и не меняет цены, задачи, планы или данные парсера.</div>';
}
async function refresh(){
 const root=document.querySelector('[data-tm266]');if(!root)return;
 state.root=root;
 if(state.busy)return;
 state.busy=true;state.error='';render();const ticket=++state.seq;
 try{
  const [feed,records]=await Promise.all([call({action:'feed'}),call({action:'list'})]);
  if(ticket!==state.seq)return;
  state.feed=feed;state.saved=A(records.cases);state.loadedAt=Date.now();
  if(state.focus){const found=state.saved.find(x=>x.id===state.focus.id);if(found)state.focus=found}
 }catch(e){if(ticket===state.seq)state.error=String(e.message||e)}
 finally{if(ticket===state.seq){state.busy=false;render()}}
}
function mount(){
 const anchor=document.querySelector('#tr14-panel [data-tm225]');
 if(!anchor)return;
 let el=document.querySelector('[data-tm266]');
 if(!el){
  el=document.createElement('section');
  el.className='tm266';el.setAttribute('data-tm266','');
  el.setAttribute('aria-label','Расследования позиций 21vek');
  anchor.insertAdjacentElement('afterend',el);
 }
 if(state.root!==el){state.root=el;state.loadedAt=0;state.focus=null;render()}
 if(!state.loadedAt&&!state.busy)refresh();
}
async function action(body){
 if(state.busy)return;
 state.busy=true;state.error='';render();
 try{
  const data=await call(body);
  if(data.case){state.focus=data.case;
   state.saved=[data.case,...state.saved.filter(x=>x.id!==data.case.id)].slice(0,40);
   if(data.ai_error)state.error='Факты сохранены, но AI недоступен: '+data.ai_error;
  }
 }catch(e){state.error=String(e.message||e)}
 finally{state.busy=false;render()}
}
document.addEventListener('click',e=>{
 if(e.target.closest?.('#tr14-shell [data-tr14="competitors"]')){[200,800,1700].forEach(ms=>setTimeout(mount,ms));return}
 if(!e.target.closest?.('[data-tm266]'))return;
 if(e.target.closest?.('[data-tm266-refresh]')){state.loadedAt=0;refresh();return}
 if(e.target.closest?.('[data-tm266-list]')){const d=state.root?.querySelector('details');if(d){d.open=true;d.scrollIntoView?.({behavior:'smooth',block:'nearest'})}return}
 const pick=e.target.closest?.('[data-tm266-investigate]');
 if(pick){action({action:'investigate',entity_key:pick.dataset.tm266Investigate,kind:pick.dataset.tm266Kind,scope_key:pick.dataset.tm266Scope});return}
 const saved=e.target.closest?.('[data-tm266-saved]');
 if(saved){state.focus=state.saved.find(x=>x.id===saved.dataset.tm266Saved)||null;render();return}
 if(e.target.closest?.('[data-tm266-assign]')){action({action:'assign',case_id:state.focus?.id,manager_email:state.root?.querySelector('[data-tm266-assignee]')?.value});return}
 if(e.target.closest?.('[data-tm266-save-answer]')){
  action({action:'answer',case_id:state.focus?.id,answer:state.root?.querySelector('[data-tm266-answer]')?.value,
   source:state.root?.querySelector('[data-tm266-source]')?.value});return}
 const approve=e.target.closest?.('[data-tm266-review]');
 if(approve){action({action:'review',case_id:state.focus?.id,status:approve.dataset.tm266Review,note:state.root?.querySelector('[data-tm266-note]')?.value});return}
},true);
document.addEventListener('change',e=>{
 if(!e.target.matches?.('[data-tm266-filter]'))return;
 state.scope=e.target.value||'';render();
},true);
if(typeof MutationObserver==='function'){
 observer=new MutationObserver(()=>{if(document.querySelector('[data-tm266]')!==state.root)mount()});
 const root=document.getElementById('page-triovist');
 if(root)observer.observe(root,{childList:true,subtree:true});
}
[250,1000,2400].forEach(ms=>setTimeout(mount,ms));
window.RESANTA_TRIOVIST_MARKET_AI_V1=Object.freeze({version:VERSION,mount,refresh,readOnlyParser:true,allActiveGroups:true});
})();
