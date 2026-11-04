/* RESANTA CRM · Triovist Uni X Director · SINGLE workspace.
   Presentation only. Existing commercial operations, approvals, task actions,
   parser and competitor modules remain authoritative and unchanged.
*/
(function(w){
'use strict';
if(w.RESANTA_TRIOVIST_UNIX_DIRECTOR_V1)return;
const ID='tr14-unix-home',CSS='tr14-unix-css',VERSION='2026.11.04.1';
const EXCLUDED=new Set(['cancelled','not_relevant']);
const S={ctx:null,month:'',sales:null,tasks:null,stock:null,parser:null,errors:{},busy:false,seq:0,shown:false,mode:'groups',loadedAt:0};
const get=id=>document.getElementById(id);
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const N=v=>Number.isFinite(Number(v))?Number(v):0;
const valid=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const norm=v=>String(v??'').trim().toLowerCase();
const money=v=>valid(v)?Number(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN':'Нет данных';
const short=v=>{if(!valid(v))return'—';const x=Number(v);return Math.abs(x)>=1e6?(x/1e6).toLocaleString('ru-RU',{maximumFractionDigits:2})+' млн':Math.abs(x)>=1e3?(x/1e3).toLocaleString('ru-RU',{maximumFractionDigits:1})+' тыс.':x.toLocaleString('ru-RU',{maximumFractionDigits:0})};
const percent=v=>valid(v)?(Number(v)>0?'+':'')+Number(v).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%':'Нет данных';
function thisMonth(){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Minsk',month:'2-digit',year:'numeric'}).formatToParts(new Date());
 return (parts.find(x=>x.type==='year')?.value||new Date().getUTCFullYear())+'-'+(parts.find(x=>x.type==='month')?.value||String(new Date().getUTCMonth()+1).padStart(2,'0'));
}
const isYm=v=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v||''));
function shift(ym,k){if(!isYm(ym))return'';return new Date(Date.UTC(+ym.slice(0,4),+ym.slice(5,7)-1+k,1)).toISOString().slice(0,7)}
function label(ym){if(!isYm(ym))return ym||'—';return new Date(Date.UTC(+ym.slice(0,4),+ym.slice(5,7)-1,1)).toLocaleDateString('ru-RU',{timeZone:'UTC',month:'long',year:'numeric'})}
const date=v=>String(v||'').slice(0,10)||'Нет даты';
const age=v=>{const t=Date.parse(String(v||''));return Number.isFinite(t)?Math.max(0,Math.floor((Date.now()-t)/86400000)):null};
const manager=()=>S.ctx?.is_manager===true;
const email=()=>norm(S.ctx?.email);
const triActive=()=>!!get('page-triovist')?.classList.contains('active');
function client(){try{return typeof db!=='undefined'?db:w.db}catch(_){return w.db}}
async function rpc(name,args={}){const d=client();if(!d?.rpc)throw Error('Соединение с CRM недоступно');const r=await d.rpc(name,args);if(r?.error)throw r.error;return r?.data}
function scopedRows(data,ctx=S.ctx){return (Array.isArray(data?.items)?data.items:[]).filter(x=>!ctx?.is_manager||norm(x.manager_email)===norm(ctx.email))}
function compute(data,ctx=S.ctx){
 if(!data||!Array.isArray(data.items))return null;
 const rows=scopedRows(data,ctx),byGroup=new Map(),byManager=new Map();let curr=0,prev=0;
 for(const x of rows){
  const a=Math.round(N(x.current_revenue)*100),b=Math.round(N(x.previous_revenue)*100);curr+=a;prev+=b;
  const mail=norm(x.manager_email),who=String(x.manager_name||'Менеджер'),group=String(x.assigned_group||x.category||'Не распределено');
  const id=mail+'|'+group;
  if(!byGroup.has(id))byGroup.set(id,{name:group,manager:who,email:mail,cur:0,prev:0});
  byGroup.get(id).cur+=a;byGroup.get(id).prev+=b;
  if(!byManager.has(mail))byManager.set(mail,{name:who,email:mail,cur:0,prev:0});
  byManager.get(mail).cur+=a;byManager.get(mail).prev+=b;
 }
 const plans=new Map();
 for(const p of data.period_plans||[])if(valid(p?.plan_amount))plans.set(norm(p.manager_email),Number(p.plan_amount));
 const managers=[...byManager.values()].filter(x=>x.email).map(x=>({...x,cur:x.cur/100,prev:x.prev/100,plan:plans.has(x.email)?plans.get(x.email):null}));
 return {current:curr/100,previous:prev/100,yoy:prev>0?(curr/prev-1)*100:null,
  groups:[...byGroup.values()].map(x=>({...x,cur:x.cur/100,prev:x.prev/100})),managers,
  plan:managers.length&&managers.every(x=>x.plan!==null)?managers.reduce((a,b)=>a+b.plan,0):null,
  imported:data.last_import?.imported_at||null};
}
function css(){
 if(get(CSS))return;const style=document.createElement('style');style.id=CSS;
 style.textContent=[
 '#tr14-shell.ux-director-shell{padding:0 0 12px;border:1px solid #d9e3f1;background:#f6f9fe;border-radius:15px;overflow:hidden;box-shadow:0 5px 18px #14263c0c}',
 '#tr14-shell.ux-director-shell>.tr14-head{background:linear-gradient(110deg,#0b1830,#183354);padding:12px 16px;margin:0;color:#fff}',
 '#tr14-shell.ux-director-shell>.tr14-head b{color:#fff;font-size:16px}',
 '#tr14-shell.ux-director-shell>.tr14-head span{color:#d3e4f6}',
 '#tr14-shell.ux-director-shell>.tr14-head button{color:#fff;border-color:#406283;background:#20466e}',
 '#tr14-shell.ux-director-shell>.tr14-g{padding:10px 13px 2px;grid-template-columns:minmax(0,1.65fr) minmax(330px,1fr)}',
 '#tr14-shell.ux-director-shell .tr14-box{background:#fff;border-color:#dfe6f1}',
 '#tr14-shell.ux-director-shell .tr14-box.c{background:#f3efff;border-color:#ded5fa}',
 '#tr14-shell.ux-director-shell .tr14-row button{font-size:11px;padding:8px 10px}',
 '#tr14-shell.ux-director-shell [data-tr14="infographics"]{display:none!important}',
 '#'+ID+'{display:none;padding:11px 13px 3px;color:#1d3450;font-size:12px}',
 '#'+ID+'[data-visible="true"]{display:block}',
 '#'+ID+' *{box-sizing:border-box}',
 '#'+ID+' .ux-toolbar{display:flex;align-items:center;justify-content:space-between;gap:9px;flex-wrap:wrap;margin-bottom:12px}',
 '#'+ID+' .ux-brand{font-weight:850;font-size:19px;letter-spacing:-.03em}',
 '#'+ID+' .ux-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
 '#'+ID+' .ux-meta input{border:1px solid #cad9eb;border-radius:8px;background:white;padding:7px;color:#1b385b}',
 '#'+ID+' button{border:1px solid #cbd9eb;background:white;border-radius:9px;color:#175b9c;font-weight:750;padding:7px 10px;cursor:pointer}',
 '#'+ID+' button:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}',
 '#'+ID+' button:hover{background:#edf5ff}',
 '#'+ID+' .ux-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin-bottom:10px}',
 '#'+ID+' .ux-tile{padding:13px;border:1px solid #e0e8f3;border-radius:12px;background:#fff;min-width:0}',
 '#'+ID+' .ux-tile.green{background:linear-gradient(120deg,#e9faed,#fff)}',
 '#'+ID+' .ux-tile.blue{background:linear-gradient(120deg,#e9f3ff,#fff)}',
 '#'+ID+' .ux-tile.violet{background:linear-gradient(120deg,#f2edff,#fff)}',
 '#'+ID+' .ux-tile.amber{background:linear-gradient(120deg,#fff2e4,#fff)}',
 '#'+ID+' .ux-tile span{display:block;font-weight:700;color:#63748a;font-size:11px;margin-bottom:8px}',
 '#'+ID+' .ux-tile strong{display:block;font-size:clamp(15px,1.7vw,22px);font-weight:850;letter-spacing:-.02em;overflow-wrap:anywhere}',
 '#'+ID+' .ux-tile small{display:block;font-size:10px;color:#667991;line-height:1.45;margin-top:7px}',
 '#'+ID+' .ux-grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(230px,1fr) minmax(230px,.9fr);gap:10px;margin-bottom:10px}',
 '#'+ID+' .ux-bottom{display:grid;grid-template-columns:1.35fr 1fr 1fr;gap:10px}',
 '#'+ID+' .ux-card{min-width:0;border:1px solid #e0e8f2;border-radius:12px;background:white;padding:13px}',
 '#'+ID+' .ux-card h3{font-size:14px;margin:0 0 9px;font-weight:800}',
 '#'+ID+' .ux-head{display:flex;justify-content:space-between;align-items:center;gap:7px;flex-wrap:wrap;margin-bottom:8px}',
 '#'+ID+' .ux-head h3{margin:0}',
 '#'+ID+' .ux-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #edf2f8}',
 '#'+ID+' .ux-row:last-child{border-bottom:0}',
 '#'+ID+' .ux-row span{overflow-wrap:anywhere}',
 '#'+ID+' .ux-row strong{white-space:nowrap}',
 '#'+ID+' .ux-brief{background:linear-gradient(130deg,#f3edff,#fff);border-color:#e2d8fc}',
 '#'+ID+' .ux-brief ol{margin:4px 0;padding-left:20px;line-height:1.55}',
 '#'+ID+' .ux-brief li{margin:6px 0}',
 '#'+ID+' .ux-note{color:#67788f;font-size:11px;line-height:1.5}',
 '#'+ID+' .ux-warning{padding:10px 12px;background:#fff7e8;border:1px solid #efd29a;color:#924c15;border-radius:10px;margin-bottom:11px}',
 '#'+ID+' .ux-tabs{display:flex;gap:5px}',
 '#'+ID+' .ux-tabs button{font-size:11px;padding:5px 8px}',
 '#'+ID+' .ux-tabs button.on{background:#1769b7;border-color:#1769b7;color:#fff}',
 '#'+ID+' .ux-trends{display:grid;gap:11px;max-height:230px;overflow-y:auto}',
 '#'+ID+' .ux-trend{display:grid;grid-template-columns:minmax(85px,130px) minmax(0,1fr) 65px;gap:8px;align-items:center}',
 '#'+ID+' .ux-trend b{font-size:11px;overflow-wrap:anywhere}',
 '#'+ID+' .ux-track{height:10px;border-radius:20px;background:#eef2f8;overflow:hidden;margin:3px 0}',
 '#'+ID+' .ux-track i{display:block;height:100%;background:#237cd1;border-radius:20px}',
 '#'+ID+' .ux-track.prev i{background:#b8cfe7}',
 '#'+ID+' .ux-legend{font-size:10px;color:#64748b;margin-bottom:10px}',
 '#'+ID+' .ux-people{border:1px solid #e5ecf5;border-radius:10px;padding:9px;background:#fbfdff;margin:8px 0}',
 '#'+ID+' .ux-people b{font-size:12px}',
 '#'+ID+' .ux-people p{font-size:11px;margin:6px 0;color:#5c7089}',
 '#'+ID+' .ux-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:7px;margin-top:10px}',
 '#'+ID+' .ux-actions button{font-size:11px;background:#edf5ff}',
 '#'+ID+' .ux-empty{background:#fff;border:1px dashed #d2e0ef;padding:19px;text-align:center;border-radius:10px;color:#687d94}',
 '#'+ID+' .ux-loading{padding:26px;text-align:center;color:#61748b}',
 '#'+ID+' .ux-warn{color:#a94417;font-weight:800}',
 '#tr14-unix-back{display:none;background:#edf5ff;border:1px solid #bdd2ed;border-radius:10px;padding:9px 12px;margin:8px 0;cursor:pointer;color:#1761aa;font-weight:750}',
 '#tr14-unix-back[data-visible="true"]{display:block}',
 '@media(max-width:1280px){#'+ID+' .ux-grid{grid-template-columns:1.5fr 1fr}#'+ID+' .ux-grid>.ux-card:last-child{grid-column:1/-1}#'+ID+' .ux-bottom{grid-template-columns:1fr 1fr}#'+ID+' .ux-bottom>.ux-card:last-child{grid-column:1/-1}}',
 '@media(max-width:990px){#tr14-shell.ux-director-shell>.tr14-g{grid-template-columns:1fr}#'+ID+' .ux-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}',
 '@media(max-width:700px){#'+ID+' .ux-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}#'+ID+' .ux-grid,#'+ID+' .ux-bottom{grid-template-columns:1fr}#'+ID+' .ux-grid>.ux-card:last-child,#'+ID+' .ux-bottom>.ux-card:last-child{grid-column:auto}}'
 ].join('\n');document.head.appendChild(style);
}
function mount(){
 const shell=get('tr14-shell');if(!shell)return null;css();shell.classList.add('ux-director-shell');
 let r=get(ID);
 if(!r){
  r=document.createElement('section');r.id=ID;r.setAttribute('aria-label','Триовист · Сводка 360° · Uni X');r.dataset.visible='false';r.innerHTML='<div class="ux-loading">Загружаю аналитику…</div>';
  shell.appendChild(r);
  r.addEventListener('click',e=>{
   const b=e.target.closest('[data-ux-go],[data-ux-mode],[data-ux-reload]');if(!b||!r.contains(b))return;
   if(b.dataset.uxGo){const k=b.dataset.uxGo;if(['sales','groups','stock','cards','tasks','competitors','parser','motivation','anp','si','budget','price'].includes(k))shell.querySelector('[data-tr14="'+k+'"]')?.click();return}
   if(b.dataset.uxMode){S.mode=b.dataset.uxMode==='managers'?'managers':'groups';render();return}
   if(b.dataset.uxReload!==undefined)void refresh();
  });
  r.addEventListener('change',e=>{if(e.target?.dataset?.uxMonth===undefined)return;const ym=e.target.value;if(!isYm(ym)||ym>thisMonth()){e.target.value=S.month;return}S.month=ym;void refresh()});
 }
 let back=get('tr14-unix-back');
 if(!back){back=document.createElement('button');back.type='button';back.id='tr14-unix-back';back.textContent='← Назад в Сводку 360°';back.dataset.visible='false';back.addEventListener('click',()=>shell.querySelector('[data-tr14="home"]')?.click());shell.insertBefore(back,r)}
 return r;
}
function show(v){S.shown=!!v;const r=mount();if(r)r.dataset.visible=v?'true':'false';const b=get('tr14-unix-back');if(b)b.dataset.visible=triActive()&&!v?'true':'false'}
function tile(label,value,note,color=''){return '<div class="ux-tile '+color+'"><span>'+E(label)+'</span><strong>'+E(value)+'</strong><small>'+E(note)+'</small></div>'}
function button(label,section){return '<button data-ux-go="'+E(section)+'">'+E(label)+' →</button>'}
function chart(m){
 const partial=S.month===thisMonth();
 const rows=(S.mode==='managers'?m.managers.map(x=>({name:x.name,cur:x.cur,prev:x.prev})):m.groups.map(x=>({name:x.name+(manager()?'':' · '+x.manager),cur:x.cur,prev:x.prev}))).sort((a,b)=>b.cur-a.cur).slice(0,9);
 const max=Math.max(1,...rows.map(x=>partial?x.cur:Math.max(x.cur,x.prev)));
 const bars=rows.map(x=>{
  const current='<div class="ux-track"><i style="width:'+Math.max(0,Math.min(100,x.cur/max*100)).toFixed(1)+'%"></i></div>';
  const prev=partial?'':'<div class="ux-track prev"><i style="width:'+Math.max(0,Math.min(100,x.prev/max*100)).toFixed(1)+'%"></i></div>';
  return '<div class="ux-trend"><b>'+E(x.name)+'</b><div>'+current+prev+'</div><span style="text-align:right;font-size:11px">'+E(short(x.cur))+'</span></div>';
 }).join('');
 const legend=partial?'🔵 Факт текущего месяца · без несопоставимых прошлогодних столбцов':'🔵 '+E(S.month.slice(0,4))+' · ⚪ '+E(String(Number(S.month.slice(0,4))-1))+' · по данным 1С';
 return '<div class="ux-card"><div class="ux-head"><h3>📊 Продажи по '+(S.mode==='managers'?'менеджерам':'товарным группам')+'</h3><div class="ux-tabs"><button data-ux-mode="groups" class="'+(S.mode==='groups'?'on':'')+'">Группы</button><button data-ux-mode="managers" class="'+(S.mode==='managers'?'on':'')+'">Менеджеры</button></div></div>'+
 '<div class="ux-legend">'+legend+'</div><div class="ux-trends">'+(bars||'<div class="ux-empty">Нет продаж в выбранном периоде</div>')+'</div><div class="ux-actions">'+button('Подгруппы и SKU','groups')+'</div></div>';
}
function categories(m){
 const top=[...m.groups].sort((a,b)=>b.cur-a.cur).slice(0,5),max=Math.max(1,...top.map(x=>x.cur));
 return '<div class="ux-card"><h3>🎯 Товарные группы · '+E(label(S.month))+'</h3>'+
 (top.length?top.map(x=>'<div class="ux-row"><span>'+E(x.name)+'</span><div style="width:37%;min-width:55px"><div class="ux-track"><i style="width:'+Math.min(100,x.cur/max*100).toFixed(1)+'%"></i></div></div><strong>'+E(short(x.cur))+'</strong></div>').join(''):'<div class="ux-note">Группы без продаж</div>')+
 '<div class="ux-note">Планы Q4 и бонусы — только по подтверждённому источнику; нет придуманных процентов.</div><div class="ux-actions">'+button('Бонусы и план','motivation')+'</div></div>';
}
function briefing(m){
 const list=[];
 if(S.month===thisMonth())list.push('Текущий месяц ещё идёт. Динамика к полному прошлогоднему месяцу не считается.');
 else list.push('Изменение к аналогичному месяцу прошлого года: '+(m.yoy===null?'нет базы':percent(m.yoy))+'.');
 if(m.plan===null)list.push('План месяца не заполнен для всех менеджеров. Выполнение не рассчитываем.');
 else if(m.plan>0)list.push('Выполнение плана месяца: '+percent(m.current/m.plan*100)+'.');
 const sd=S.stock?.snapshot_date||S.stock?.partner?.snapshot_date,days=age(sd);
 if(days!==null&&days>10)list.push('Остатки 21vek от '+date(sd)+' устарели. Перед заказом нужно обновление.');
 if(!list.length)list.push('Проверьте выбранный период и данные из 1С.');
 return '<div class="ux-card ux-brief"><h3>✨ Короткий ИИ-брифинг</h3><ol>'+list.map(x=>'<li>'+E(x)+'</li>').join('')+'</ol><div class="ux-actions">'+button('К задачам ИИ','tasks')+'</div></div>';
}
function people(m){
 return '<div class="ux-card"><h3>👥 Работа категорийных менеджеров</h3>'+
 (m.managers.length?m.managers.map(x=>'<div class="ux-people"><b>'+E(x.name)+'</b><p>Продажи: <strong>'+E(money(x.cur))+'</strong> · Год к году: '+E(x.prev>0&&S.month!==thisMonth()?percent((x.cur/x.prev-1)*100):'—')+'</p><p>План: '+E(x.plan===null?'Не задан':money(x.plan))+'</p></div>').join(''):'<div class="ux-note">Нет продаж менеджеров</div>')+
 '<div class="ux-actions">'+button('Детали продаж','sales')+'</div></div>';
}
function cards(){
 const stamp=S.parser?.working?.completed_at||S.parser?.last_good?.completed_at||null;
 return '<div class="ux-card"><h3>🧩 Карточки 21vek · TOP-60</h3><div class="ux-note">Последний подтверждённый снимок: <b>'+E(date(stamp))+'</b></div>'+
 '<div class="ux-note" style="margin-top:8px">Проблемные позиции и карточки показываются в подробном контроле. Старый успешный снимок не подменяется неудачным.</div><div class="ux-actions">'+button('Карточки 21vek','cards')+'</div></div>';
}
function competitors(){
 return '<div class="ux-card"><h3>⚔️ Конкуренты 21vek</h3><div class="ux-note">Мы сильнее / паритет / конкурент сильнее.</div>'+
 '<div class="ux-note" style="margin-top:8px">Точный конкурентный баланс загружается в деталях. Тяжёлый парсер не запускается с главного экрана.</div><div class="ux-actions">'+button('Конкурентный анализ','competitors')+'</div></div>';
}
function tasks(){
 const all=(Array.isArray(S.tasks?.tasks)?S.tasks.tasks:[]).filter(x=>!EXCLUDED.has(x.status)&&(!manager()||norm(x.manager_email)===email()));
 const priority={pending_approval:0,overdue:1,awaiting_check:2,new:3,accepted:4,in_progress:5};
 const ordered=[...all].sort((a,b)=>(priority[a.status]??20)-(priority[b.status]??20)||String(a.due_date||'').localeCompare(String(b.due_date||''))).slice(0,3);
 return '<div class="ux-card"><div class="ux-head"><h3>📋 Ключевые задачи</h3><span class="ux-note">'+(S.tasks?'Рабочие: '+all.length:'Нет данных')+'</span></div>'+
 (S.tasks?(ordered.length?ordered.map(t=>'<div class="ux-row"><span>'+E(t.title||t.task_text||'Задача')+'</span><span class="ux-note">'+E(date(t.due_date))+'</span></div>').join(''):'<div class="ux-note">Активных задач в этом месяце нет.</div>'):'<div class="ux-note">Источник задач пока недоступен. '+E(S.errors.tasks||'')+'</div>')+
 '<div class="ux-actions">'+button('Все задачи ИИ','tasks')+'</div></div>';
}
function finance(m){
 return '<div class="ux-card"><h3>🏆 Финансовый итог и бонусы</h3><div class="ux-row"><span>План месяца</span><strong>'+E(m.plan===null?'Не задан':money(m.plan))+'</strong></div>'+
 '<div class="ux-row"><span>Факт 1С</span><strong>'+E(money(m.current))+'</strong></div>'+
 '<div class="ux-note">Премии и бонусы Q3/Q4 не пересчитываем здесь: подробности — в действующем разделе «Мотивация».</div>'+
 '<div class="ux-actions">'+button('Бонусы и план','motivation')+'</div></div>';
}
function stock(){
 const snap=S.stock?.snapshot_date||S.stock?.partner?.snapshot_date||null,days=age(snap);
 return '<div class="ux-card"><h3>📦 Заказы и остатки</h3><div class="ux-row"><span>Последний снимок 21vek</span><strong>'+E(date(snap))+'</strong></div>'+
 '<div class="ux-row"><span>Состояние</span><strong class="'+(days!==null&&days>10?'ux-warn':'')+'">'+(days===null?'Не проверено':days>10?'Обновить данные':'Актуально')+'</strong></div>'+
 '<div class="ux-note">Рекомендации и остатки по SKU — по нажатию; старый снимок не выдаётся за свежий.</div>'+
 '<div class="ux-actions">'+button('Остатки и заказ','stock')+'</div></div>';
}
function render(){
 const root=mount();if(!root)return false;const m=compute(S.sales);
 if(!m){
 root.innerHTML='<div class="ux-toolbar"><div class="ux-brand">Триовист · 360° · Uni X</div><div class="ux-meta"><input aria-label="Выбранный месяц" data-ux-month type="month" value="'+E(S.month)+'"><button data-ux-reload>↻ Обновить</button></div></div><div class="ux-empty">Продажи 1С пока не подтверждены. '+E(S.errors.sales||'')+'</div>';return false}
 const current=S.month===thisMonth(),sd=S.stock?.snapshot_date||S.stock?.partner?.snapshot_date||null;
 const pdate=S.parser?.working?.completed_at||S.parser?.last_good?.completed_at||null;
 const activeTasks=S.tasks?.tasks?.filter(x=>!EXCLUDED.has(x.status)&&(!manager()||norm(x.manager_email)===email())).length;
 root.innerHTML='<div class="ux-toolbar"><div><div class="ux-brand">Триовист (21vek.by) · Сводка 360°</div><div class="ux-note">Uni X Director · единый рабочий экран · проверенные данные</div></div>'+
 '<div class="ux-meta"><span class="ux-note">👑 VIP</span><input aria-label="Месяц отчёта" type="month" data-ux-month max="'+E(thisMonth())+'" value="'+E(S.month)+'"><span class="ux-note">Сравнение '+E(String(Number(S.month.slice(0,4))-1))+'</span><button data-ux-reload>↻ Обновить</button></div></div>'+
 (current?'<div class="ux-warning">Текущий месяц не завершён. С полным прошлогодним месяцем его можно сравнить только справочно.</div>':'')+
 '<div class="ux-kpis">'+tile('💰 Продажи · '+label(S.month),money(m.current),'Факт 1С · импорт: '+date(m.imported),'green')+
 tile('📈 Год к году',current?'Не считаем':percent(m.yoy),current?'Месяц ещё не закрыт':'Сопоставимые полные месяцы','blue')+
 tile('🎯 План месяца',m.plan===null?'Не задан':money(m.plan),m.plan>0?'Выполнение '+percent(m.current/m.plan*100):'Без недостоверных прогнозов','violet')+
 tile('📋 Задачи ИИ',activeTasks===undefined?'Нет данных':String(activeTasks),'Подробности по нажатию')+
 tile('🛡 Свежесть',date(sd),'TOP: '+date(pdate)+(sd&&age(sd)>10?' · Остатки устарели':''),'amber')+'</div>'+
 '<div class="ux-grid">'+chart(m)+categories(m)+briefing(m)+'</div>'+
 '<div class="ux-grid">'+people(m)+cards()+competitors()+'</div>'+
 '<div class="ux-bottom">'+tasks()+finance(m)+stock()+'</div>'+
 '<div class="ux-note" style="margin-top:10px">Детали открываются вместо сводки. Старые рабочие функции доступны только в деталях. Инфографика скрыта из меню; парсеры и их настройки не изменены.</div>';
 return true;
}
async function load(){
 const root=mount();if(!root)return false;
 const seq=++S.seq,month=S.month,actor=manager()?email():null;S.busy=true;S.errors={};
 root.innerHTML='<div class="ux-loading">Загружаю данные 1С, задачи и статусы источников…</div>';
 try{
  const rs=await Promise.allSettled([
   rpc('triovist_get_dashboard',{p_end_month:month,p_mode:'month'}),
   rpc('triovist_tasks_get_dashboard_month_v23648',{p_month:month+'-01',p_manager_email:actor}),
   rpc('triovist_partner_stock_state_v236207',{}),
   w.RESANTA_TRIOVIST_21VEK_CONTROL_V236107?.status?.()||rpc('triovist_21vek_status_v236107',{})
  ]);
  if(seq!==S.seq)return false;
  ['sales','tasks','stock','parser'].forEach((k,i)=>{const r=rs[i];if(r.status==='fulfilled')S[k]=r.value;else{S[k]=null;S.errors[k]=String(r.reason?.message||'Данные недоступны').slice(0,180)}});
  S.loadedAt=Date.now();return render();
 }finally{if(seq===S.seq)S.busy=false}
}
async function open(ctx){
 if(!ctx||(!ctx.is_manager&&!ctx.is_leader))return false;
 const a=norm(S.ctx?.email),b=norm(ctx.email);
 if(a&&a!==b){S.sales=S.tasks=S.stock=S.parser=null;S.month='';S.seq++}
 S.ctx=ctx;show(true);
 if(!S.month)S.month=shift(thisMonth(),-1);
 if(S.sales&&Date.now()-S.loadedAt<120000){render();return true}
 return load();
}
async function refresh(){if(!S.ctx)return false;S.sales=null;return load()}
w.RESANTA_TRIOVIST_UNIX_DIRECTOR_V1=Object.freeze({version:VERSION,open,refresh,show,render,compute,scopedRows,readOnly:true,unified:true,commercePersistent:true,parsersUntouched:true});
})(window);