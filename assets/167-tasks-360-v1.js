/* RESANTA CRM · Tasks 360 · Uni A / Uni X · 2026-11-02
 * Read-only presentation over existing task workflows.
 * Existing server policies, approval, reporting and voice are reused.
 * No task cleanup, update, deletion, background jobs or auto speech.
 */
(function(root){
'use strict';
if(root.RESANTA_TASKS_360_V1)return;
const ID='tasks360-view',CSS='tasks360-style',P='page-tasks';
const S={tab:'all',q:'',selected:'',show:40,legacy:false,closedManagers:new Set()};
const text=v=>String(v==null?'':v);
const h=v=>text(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>text(v).toLocaleLowerCase('ru-RU').replace(/\s+/g,' ').trim();
const cut=(v,n=150)=>{let x=text(v).replace(/\s+/g,' ').trim();return x.length>n?x.slice(0,n).replace(/\s+\S*$/,'')+'…':x};
const role=()=>{try{return currentProfile?.role||''}catch(_){return ''}};
const me=()=>{try{return text(currentProfile?.name)}catch(_){return ''}};
const allowed=()=>['boss','manager'].includes(role());
const boss=()=>role()==='boss';
const arr=name=>{try{return name==='tasks'?allTasks||[]:name==='clients'?allClients||[]:[]}catch(_){return []}};
const today=()=>{try{return TODAY||new Date().toISOString().slice(0,10)}catch(_){return new Date().toISOString().slice(0,10)}};
const page=()=>document.getElementById(P),box=()=>document.getElementById(ID);
function manager(t,clients){
 if(t.manager_name)return text(t.manager_name);
 const c=clients.get(text(t.client_id));return text(c?.manager_name||'');
}
function isPending(t){return !t.done&&t.review_status==='pending'}
function isArchive(t){return !t.done&&t.review_status==='stale_review'}
function isActive(t){return !t.done&&!isPending(t)&&!isArchive(t)}
function deadline(t){return text(t.due_date).slice(0,10)}
function lane(t){
 const s=norm((t.source||'')+' '+(t.text||'')+' '+(t.title||''));
 if(t.source==='visit'||t.source==='call'||/^📞/.test(s))return 'contact';
 if(/просроч|задолж|погаш|оплат/.test(s))return 'debt';
 if(/акци|мерч|выклад/.test(s))return 'promo';
 return 'main';
}
function validTasks(rows){
 // Same canonical worklist as the current CRM; never change stored task rows.
 try{if(typeof canonicalActiveTasks==='function')return canonicalActiveTasks(rows)}catch(_){}
 const active=rows.filter(isActive),keys=new Map(),noClient=[];
 active.forEach(t=>{if(!t.client_id){noClient.push(t);return;}
  const k=text(t.client_id)+'|'+lane(t),p=keys.get(k);
  const time=x=>text(x.updated_at||x.reviewed_at||x.created_at||x.due_date||x.id);
  if(!p||time(t)>time(p))keys.set(k,t);
 });
 return noClient.concat([...keys.values()]);
}
function status(t){
 if(t.done)return 'done';
 if(isArchive(t))return 'archive';
 if(isPending(t))return 'pending';
 const d=deadline(t);
 if(d&&d<today()){
  try{if(typeof isTaskOverdue==='function')return isTaskOverdue(t)?'overdue':'upcoming'}catch(_){}
  return t.auto_generated?'upcoming':'overdue';
 }
 return d===today()?'today':'upcoming';
}
function critical(t){return /высок|критич/.test(norm(t.priority))||(/сроч/.test(norm(t.text))&&!t.auto_generated)}
function scope(){
 if(!allowed())return {clients:new Map(),visible:[],active:[],counts:{all:0,today:0,critical:0,route:0,overdue:0,pending:0,done:0,archive:0},rows:[],selected:null};
 const clients=new Map(arr('clients').map(c=>[text(c.id),c]));
 const all=arr('tasks');
 const visible=boss()?all:all.filter(t=>manager(t,clients)===me());
 const active=validTasks(visible),pending=visible.filter(isPending),archive=visible.filter(isArchive),done=visible.filter(t=>t.done);
 const counts={all:active.length,today:active.filter(t=>status(t)==='today').length,
 critical:active.filter(critical).length,route:active.filter(t=>t.source==='route_call_monthly'||t.route_plan_id||t.source==='route' || /маршрут|визит/.test(norm(t.source))).length,
 overdue:active.filter(t=>status(t)==='overdue').length,pending:pending.length,done:done.length,archive:archive.length};
 let rows=S.tab==='pending'?pending:S.tab==='archive'?archive:S.tab==='done'?done:active;
 if(S.tab==='today')rows=rows.filter(t=>status(t)==='today');
 if(S.tab==='overdue')rows=rows.filter(t=>status(t)==='overdue');
 if(S.tab==='critical')rows=rows.filter(critical);
 if(S.tab==='route')rows=rows.filter(t=>t.source==='route_call_monthly'||t.route_plan_id||t.source==='route'||/маршрут|визит/.test(norm(t.source)));
 if(S.q){const q=norm(S.q);rows=rows.filter(t=>norm([t.title,t.text,t.client_name,clients.get(text(t.client_id))?.name,t.manager_name,t.basis].join(' ')).includes(q))}
 const rank=t=>({overdue:0,today:1,pending:2,upcoming:3,done:4,archive:5})[status(t)]??9;
 rows=rows.slice().sort((a,b)=>rank(a)-rank(b)||deadline(a).localeCompare(deadline(b))||text(a.id).localeCompare(text(b.id)));
 if(!rows.some(t=>text(t.id)===S.selected))S.selected=text(rows[0]?.id||'');
 return {clients,visible,active,counts,rows,selected:rows.find(t=>text(t.id)===S.selected)||null};
}
function title(t){
 const raw=text(t.title).trim();
 if(raw)return cut(raw,95);
 const x=text(t.text).split(/\n/).map(s=>s.trim()).find(x=>x&&!/^\[(Основной|Доп)/i.test(x))||'Задача';
 return cut(x.replace(/^[🤖📞🎯📌\s]+/u,''),87);
}
function lines(t){
 const raw=text(t.text).replace(/\r/g,'');
 const out=raw.split(/\n/).map(x=>x.trim()).filter(Boolean);
 return out;
}
function description(t){
 const raw=lines(t);
 const item=raw.find(x=>/^(?:🛠|действия:|задача:|цель:)/i.test(x))||raw[0]||text(t.next_step)||'';
 return cut(item.replace(/^(?:🛠\s*)?(?:Действия|Задача|Цель)\s*:\s*/i,''),180);
}
function steps(t){
 const hint=text(t.next_step).trim();
 const raw=text(t.text);
 // Numbered instructions after "Действия" take precedence.
 const section=raw.match(/(?:🛠\s*)?Действия\s*:\s*([\s\S]*?)(?=\n\s*(?:📌|✔️|🎯|⏰|📊|Плановый результат|Подтверждение|Почему)\b|$)/i);
 const from=(section?.[1]||hint||description(t)).replace(/\s+/g,' ').trim();
 let chunks=from.split(/(?:^|\s)(?:[1-9][.)]\s*)/).map(x=>x.trim()).filter(Boolean);
 if(chunks.length<2)chunks=from.split(/;\s*|(?<=\.)\s+(?=[А-ЯЁ])/).map(x=>x.trim()).filter(Boolean);
 return chunks.slice(0,4).map(x=>cut(x.replace(/^[⚙️🛠\s]+/u,''),145)).filter(Boolean);
}
function reason(t){
 const basis=text(t.basis||t.why||'').trim();if(basis)return cut(basis,260);
 const s=text(t.text);
 const m=s.match(/(?:📊\s*)?Почему ИИ (?:предлагает|рекомендует)\s*:\s*([^\n]{8,})/i);
 return m?cut(m[1],260):'Основание хранится в полной карточке задачи.';
}
function products(t){
 const raw=lines(t).filter(x=>/SKU|артикул|\[\d{2}\/|товар|ассортимент|климат|лампы/i.test(x));
 return raw.slice(0,3).map(x=>cut(x,120));
}
function dateRu(v){const d=deadline({due_date:v});if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return 'Без срока';const x=new Date(d+'T12:00:00Z');return x.toLocaleDateString('ru-RU',{day:'numeric',month:'short',timeZone:'UTC'})}
const icons={overdue:'🔴',today:'🟡',upcoming:'🔵',done:'✅',pending:'🕒',archive:'🗂'};
function badge(t){const s=status(t);return {overdue:'Просрочено',today:'Сегодня',upcoming:'В работе',done:'Выполнено',pending:'На согласовании',archive:'Архив'}[s]}
function style(){
 if(document.getElementById(CSS))return;
 const el=document.createElement('style');el.id=CSS;
 el.textContent=[
 '#page-tasks.t360-active>.chips,#page-tasks.t360-active>#tasks-list{display:none!important}',
 '#page-tasks.t360-active.t360-legacy>.chips,#page-tasks.t360-active.t360-legacy>#tasks-list{display:flex!important}',
 '#page-tasks.t360-active.t360-legacy>#tasks-list{display:block!important}',
 '#page-tasks.t360-legacy #tasks360-view .t360-dashboard{display:none!important}',
 '#tasks360-view{font-size:13px;color:var(--text,#132543);max-width:1600px;margin:0 auto 16px}',
 '#tasks360-view *{box-sizing:border-box}#tasks360-view button,#tasks360-view input{font:inherit}',
 '#tasks360-view button{cursor:pointer;border:1px solid #dce5f2;border-radius:10px;padding:9px 11px;background:#fff;color:#23558e;font-weight:650}',
 '#tasks360-view button:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}',
 '#tasks360-view button.t360-current,#tasks360-view button.t360-primary{background:#1d65b6;border-color:#1d65b6;color:#fff}',
 '#tasks360-view .t360-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:10px 0 12px}',
 '#tasks360-view .t360-kpi{background:linear-gradient(135deg,#fff,#f5f9ff);border:1px solid #e2e8f3;border-radius:14px;padding:12px 14px;text-align:left;min-width:0}',
 '#tasks360-view .t360-kpi span{font-size:12px;line-height:1.45;display:block;color:#536477}',
 '#tasks360-view .t360-kpi b{font-size:25px;line-height:1.3;display:block;color:#152a45;margin-top:4px}',
 '#tasks360-view .t360-filterbar{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-bottom:12px}',
 '#tasks360-view .t360-filterbar button{padding:8px 13px;font-size:12px}',
 '#tasks360-view .t360-filterbar small{opacity:.72;margin-left:5px}',
 '#tasks360-view .t360-grid{display:grid;grid-template-columns:minmax(285px,44%) minmax(0,56%);gap:12px;align-items:start}',
 '#tasks360-view .t360-panel{min-width:0;background:#fff;border:1px solid #e1e7f2;border-radius:14px;box-shadow:0 2px 12px rgba(22,46,82,.04);padding:14px}',
 '#tasks360-view .t360-search{display:flex;gap:8px;margin-bottom:12px}#tasks360-view .t360-search input{min-width:0;flex:1;padding:11px;border-radius:10px;border:1px solid #dce5f2;background:#fafcff}',
 '#tasks360-view .t360-scroll{max-height:660px;overflow-y:auto;overscroll-behavior:contain}',
 '#tasks360-view .t360-mgr{width:100%;display:flex;align-items:center;justify-content:space-between;margin:9px 0 6px;background:#f1f5fa!important;color:#263e61!important;font-weight:800;text-align:left}',
 '#tasks360-view .t360-item{width:100%;display:grid;grid-template-columns:1fr auto;align-items:center;gap:7px;text-align:left;margin-bottom:7px;border:1px solid #e5eaf2!important;padding:11px!important;border-radius:11px!important;color:#152a45!important}',
 '#tasks360-view .t360-item.t360-selected{background:#eaf3ff!important;border-color:#84b5ff!important}',
 '#tasks360-view .t360-item-title{font-weight:750;font-size:13px;display:block;line-height:1.35}#tasks360-view .t360-muted{color:#6c7b90;font-size:11px;line-height:1.5}',
 '#tasks360-view .t360-tag{display:inline-block;padding:3px 7px;background:#f1f5fa;border-radius:20px;font-size:10px;font-weight:650;color:#436088}',
 '#tasks360-view .t360-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:start;margin-bottom:10px}',
 '#tasks360-view .t360-head h3{font-size:17px;margin:0;font-weight:800;color:#162b45}',
 '#tasks360-view .t360-one-line{background:#eef2ff;border-radius:10px;padding:12px;line-height:1.55;font-size:13px;color:#213874;margin:10px 0}',
 '#tasks360-view .t360-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}',
 '#tasks360-view .t360-detail{border:1px solid #e2e9f5;border-radius:11px;padding:12px;margin-bottom:10px;min-width:0}',
 '#tasks360-view .t360-detail h4{font-size:13px;margin:0 0 9px;color:#152a45}',
 '#tasks360-view .t360-detail p{line-height:1.55;margin:4px 0;color:#475569}',
 '#tasks360-view .t360-steps{margin:0;padding:0 0 0 20px;line-height:1.5}#tasks360-view .t360-steps li{margin:0 0 6px}',
 '#tasks360-view details{border:1px solid #e1e8f3;border-radius:9px;padding:10px 12px;margin-top:7px}',
 '#tasks360-view details summary{cursor:pointer;color:#1e538f;font-weight:650}',
 '#tasks360-view .t360-actions{position:sticky;bottom:0;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;padding:12px 0 0;background:#fff;z-index:2}',
 '#tasks360-view .t360-actions button{flex:1;min-height:40px}',
 '#tasks360-view .t360-section-title{font-weight:800;margin:4px 0 10px}',
 '#tasks360-view .t360-empty{border:1px dashed #bed2e8;border-radius:10px;padding:18px;color:#65768c}',
 '@media(max-width:1050px){#tasks360-view .t360-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}#tasks360-view .t360-grid{grid-template-columns:minmax(230px,42%) minmax(0,58%)}}',
 '@media(max-width:780px){#tasks360-view .t360-grid{grid-template-columns:1fr}#tasks360-view .t360-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}#tasks360-view .t360-scroll{max-height:300px}#tasks360-view .t360-two{grid-template-columns:1fr}#tasks360-view .t360-panel{padding:12px}}',
 '@media(max-width:440px){#tasks360-view .t360-kpi b{font-size:21px}#tasks360-view .t360-actions{padding-bottom:calc(4px + env(safe-area-inset-bottom,0px))}}'
 ].join('\n');document.head.appendChild(el);
}
function metric(icon,name,value,tab){
 return '<button type="button" class="t360-kpi" data-action="tab" data-tab="'+tab+'"><span>'+icon+' '+h(name)+'</span><b>'+value+'</b></button>';
}
function taskRow(t,s){
 const c=s.clients.get(text(t.client_id)),name=c?.name||t.client_name||'Без привязки к клиенту';
 const selected=text(t.id)===S.selected;
 return '<button class="t360-item'+(selected?' t360-selected':'')+'" data-action="select" data-id="'+h(t.id)+'"><span><span class="t360-item-title">'+h(icons[status(t)])+' '+h(name)+'</span><span class="t360-muted">'+h(title(t))+'</span><span class="t360-muted" style="display:block;margin-top:5px">'+h(boss()?manager(t,s.clients)+' · ':'')+h(dateRu(t.due_date))+' · '+h(badge(t))+'</span></span><span class="t360-tag">'+h(t.auto_generated?'ИИ':lane(t)==='contact'?'Звонок':'Задача')+'</span></button>';
}
function groupedRows(rows,s){
 if(!boss())return rows.map(t=>taskRow(t,s)).join('');
 const groups=new Map();
 rows.forEach(t=>{const name=manager(t,s.clients)||'Не закреплено';if(!groups.has(name))groups.set(name,[]);groups.get(name).push(t)});
 return [...groups].sort((a,b)=>b[1].length-a[1].length||a[0].localeCompare(b[0],'ru')).map(([name,items])=>{
  const collapsed=S.closedManagers.has(name);
  return '<button type="button" class="t360-mgr" data-action="group" data-group="'+h(name)+'"><span>👤 '+h(name)+' · '+items.length+'</span><span>'+(collapsed?'▾':'▴')+'</span></button>'+
  (collapsed?'':items.map(t=>taskRow(t,s)).join(''));
 }).join('');
}
function taskDetail(t,s){
 if(!t)return '<div class="t360-empty">Выберите задачу в списке слева.</div>';
 const c=s.clients.get(text(t.client_id)),name=c?.name||t.client_name||'Без привязки к клиенту',st=steps(t),proof=t.criteria||t.proof||'',expected=t.expected_result||'';
 const note=description(t),why=reason(t),items=products(t);
 const stepHtml=st.length?'<ol class="t360-steps">'+st.map(x=>'<li>'+h(x)+'</li>').join('')+'</ol>':'<p>Откройте полное описание задачи: конкретные действия не выделены.</p>';
 const resultBlock=expected||proof?'<p>'+h(expected||'Результат указан в полном описании')+'</p>'+(proof?'<p>✔ '+h(cut(proof,220))+'</p>':''):'<p>Ожидаемый результат не указан в отдельном поле. Откройте полную задачу.</p>';
 const statusText=h(badge(t));
 let buttons='';
 if(isPending(t)&&boss())buttons='<button class="t360-primary" data-action="approve">✓ В работу</button><button data-action="edit">✎ Изменить</button>';
 else if(isArchive(t)&&boss())buttons='<button class="t360-primary" data-action="restore">↩ Вернуть в работу</button>';
 else if(!t.done&&!isPending(t)&&!isArchive(t))buttons='<button class="t360-primary" data-action="done">✓ Отчёт о выполнении</button>'+(boss()?'<button data-action="edit">↔ Перенести / изменить</button>':'<button data-action="transfer-info">↔ Перенос</button>');
 else if(t.done)buttons='<button data-action="history">✓ Посмотреть результат</button>';
 return '<article><div class="t360-head"><div><h3>'+h(title(t))+' · '+h(name)+'</h3><div class="t360-muted" style="margin-top:6px">'+statusText+' · '+h(dateRu(t.due_date))+' · '+h(manager(t,s.clients))+'</div></div>'+
 '<button data-action="voice">🔊 Кратко озвучить</button></div>'+
 '<div class="t360-one-line">✨ <b>Коротко:</b> '+h(note)+'</div>'+
 '<div class="t360-two"><section class="t360-detail"><h4>Что сделать</h4>'+stepHtml+'</section><section class="t360-detail"><h4>Что подтвердить</h4>'+resultBlock+'</section></div>'+
 '<div class="t360-two"><section class="t360-detail" style="background:#f6f4ff"><h4>✨ Почему ИИ рекомендует</h4><p>'+h(why)+'</p></section><section class="t360-detail" style="background:#f1f7ff"><h4>📦 Подсказки по товару</h4>'+(items.length?items.map(x=>'<p>• '+h(x)+'</p>').join(''):'<p>Товарные позиции — в полном описании, если предусмотрены задачей.</p>')+'</section></div>'+
 '<details><summary>Показать полную аналитику и исходный текст</summary><div style="white-space:pre-wrap;overflow-wrap:anywhere;margin-top:9px;line-height:1.5">'+h(t.text||'')+'</div>'+
 (t.basis?'<p><b>Основание:</b> '+h(t.basis)+'</p>':'')+(t.criteria?'<p><b>Подтверждение:</b> '+h(t.criteria)+'</p>':'')+'</details>'+
 '<details><summary>История клиента и дополнительные сведения</summary><p class="t360-muted">История открывается в существующей карточке клиента без изменения данных.</p>'+(c?'<button data-action="client">Открыть клиента</button>':'')+'</details>'+
 (t.done?'<details><summary>Результат закрытия</summary><p>'+h(t.fact_result||t.done_comment||'Нет комментария')+'</p><p>'+h(t.proof||'')+'</p></details>':'')+
 '<div class="t360-actions">'+buttons+'</div></article>';
}
function render(){
 if(!allowed())return;
 const p=page();if(!p||!box())return;
 const s=scope();let rootNode=box();
 const tabs=[['all','Все',s.counts.all],['today','Сегодня',s.counts.today],['critical','Критичные',s.counts.critical],['route','Маршрут',s.counts.route],['overdue','Просрочено',s.counts.overdue],['pending','Согласование',s.counts.pending],['done','Выполнено',s.counts.done],['archive','Архив',s.counts.archive]];
 const filters=tabs.map(([k,n,count])=>'<button class="'+(S.tab===k?'t360-current':'')+'" data-action="tab" data-tab="'+k+'">'+n+'<small>'+count+'</small></button>').join('');
 const rows=s.rows.slice(0,S.show);
 const kpis='<div class="t360-metrics">'+metric('🔥','Критичные',s.counts.critical,'critical')+metric('⏰','Просрочено',s.counts.overdue,'overdue')+metric('▶','В работе',s.counts.all,'all')+metric('👥','На согласовании',s.counts.pending,'pending')+metric('✅','Выполнено',s.counts.done,'done')+'</div>';
 rootNode.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:9px">'+
 '<div class="t360-muted">Uni '+(boss()?'A · обзор всех назначенных менеджеров':'X · только мои задачи')+' · '+h(today())+' · исходные данные CRM</div>'+
 '<button data-action="legacy">'+(S.legacy?'← Новый интерфейс':'Таблица / старые фильтры')+'</button></div>'+
 '<div class="t360-dashboard">'+kpis+'<div class="t360-filterbar">'+filters+'</div>'+
 '<div class="t360-grid"><section class="t360-panel"><div class="t360-search"><input data-input="search" placeholder="Поиск клиента, задачи, товара…" value="'+h(S.q)+'" aria-label="Поиск задач"></div>'+
 '<div class="t360-section-title">'+(boss()?'Задачи менеджеров':'Мои задачи')+' · '+s.rows.length+'</div><div class="t360-scroll">'+
 (rows.length?groupedRows(rows,s):'<div class="t360-empty">По этому фильтру задач нет.</div>')+
 '</div>'+(s.rows.length>S.show?'<button style="margin-top:9px;width:100%" data-action="more">Показать ещё · '+(s.rows.length-S.show)+'</button>':'')+'</section>'+
 '<section class="t360-panel">'+taskDetail(s.selected,s)+'</section></div>'+
 '<div class="t360-muted" style="margin-top:10px">Архив и несогласованные рекомендации не входят в рабочую очередь. Действующие отчёты, согласования и история сохранены.</div></div>';
 p.classList.add('t360-active');p.classList.toggle('t360-legacy',S.legacy);
 const name=p.querySelector('.page-title');if(name&&/^\s*Задачи\s*$/.test(name.textContent))name.textContent='Задачи · 360°';
}
async function voice(t){
 const msg=[(t.client_name||arr('clients').find(c=>text(c.id)===text(t.client_id))?.name||'Задача'),title(t),cut(description(t),150),'Срок '+dateRu(t.due_date)].join('. ');
 try{
  if(!root.crmAI360BranchVoicePilotV1?.allowed?.()&&root.crmAI360MobileStaff139?.activate)await root.crmAI360MobileStaff139.activate();
  else if(root.crmAI360BranchVoicePilotV1?.open)await root.crmAI360BranchVoicePilotV1.open();
  if(root.crmAI360BranchPremiumVoiceV1?.speak)await root.crmAI360BranchPremiumVoiceV1.speak(msg);
  else alert('Лера для этой учётной записи ещё не подключена. Откройте её штатной кнопкой CRM.');
 }catch(e){console.warn('Task summary voice:',e);alert('Не удалось озвучить задачу через Леру. Текст доступен на экране.')}
}
function selected(){return arr('tasks').find(t=>text(t.id)===S.selected)}
function safeSelected(){
 if(!allowed())return null;
 const s=scope();return s.selected;
}
function handle(action,extra={}){
 if(action==='legacy'){S.legacy=!S.legacy;render();return}
 if(action==='tab'){S.tab=extra.tab;S.show=40;S.selected='';render();return}
 if(action==='select'){S.selected=extra.id;render();return}
 if(action==='group'){const n=extra.group;if(S.closedManagers.has(n))S.closedManagers.delete(n);else S.closedManagers.add(n);render();return}
 if(action==='more'){S.show+=40;render();return}
 const t=safeSelected();if(!t)return;
 if(action==='voice'){void voice(t);return}
 if(action==='done'&&isActive(t)){if(typeof doneTask==='function')doneTask(t.id);return}
 if(action==='approve'&&boss()&&isPending(t)){if(confirm('Согласовать задачу и передать менеджеру?'))void approveAutoTask(t.id);return}
 if(action==='restore'&&boss()&&isArchive(t)){void restoreBacklogTask(t.id);return}
 if(action==='edit'&&boss()){openEditTask(t.id);return}
 if(action==='transfer-info'){alert('Перенос срока согласует руководитель. Обратитесь к ДФ через чат CRM, чтобы не менять дату без согласования.');return}
 if(action==='history'){const p=box()?.querySelector('details:last-of-type');if(p)p.open=true;return}
 if(action==='client'&&t.client_id&&typeof openClient==='function')openClient(t.client_id);
}
function install(){
 if(!allowed()){const p=page();p?.classList.remove('t360-active','t360-legacy');const el=box();if(el)el.innerHTML='';return false;}
 const p=page();if(!p)return false;
 style();
 let el=box();
 if(!el){
  el=document.createElement('section');el.id=ID;
  const list=p.querySelector('.chips');
  if(list)list.insertAdjacentElement('beforebegin',el);
  else p.appendChild(el);
 }
 if(!el.dataset.bound){
  el.dataset.bound='1';
  el.addEventListener('click',event=>{const button=event.target.closest('[data-action]');if(!button||!el.contains(button))return;handle(button.dataset.action,button.dataset)});
  el.addEventListener('input',event=>{if(event.target.dataset.input==='search'){
   const pos=event.target.selectionStart;
   S.q=event.target.value;
   // Do not recreate a focused input while typing: refresh only its sibling panels.
   const s=scope(),list=el.querySelector('.t360-scroll');
   if(list)list.innerHTML=groupedRows(s.rows.slice(0,S.show),s)||'<div class="t360-empty">Ничего не найдено</div>';
   const detail=el.querySelector('.t360-grid>.t360-panel:last-child');
   if(detail)detail.innerHTML=taskDetail(s.selected,s);
  }});
 }
 try{render();return true}catch(e){
  // Fail open: legacy CRM remains usable even if this presentation module fails.
  console.error('Tasks 360 render:',e);
  p.classList.remove('t360-active','t360-legacy');
  return false;
 }
}
let scheduled=false;function schedule(){
 if(scheduled)return;scheduled=true;
 setTimeout(()=>{scheduled=false;if(page()?.classList.contains('active'))install()},35);
}
const oldRender=root.renderTasks;
if(typeof oldRender==='function')root.renderTasks=function(){const result=oldRender.apply(this,arguments);schedule();return result};
const oldGo=root.goPage;
if(typeof oldGo==='function')root.goPage=function(){const result=oldGo.apply(this,arguments);if(arguments[0]==='tasks')schedule();return result};
const oldLoad=root.loadData;
if(typeof oldLoad==='function')root.loadData=async function(){const result=await oldLoad.apply(this,arguments);schedule();return result};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
root.RESANTA_TASKS_360_V1=Object.freeze({version:'1.0.0',presentationOnly:true,noWrites:true,install,refresh:render,snapshot:scope,handle});
})(window);