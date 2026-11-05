/* Triovist Uni AI demand v2: approved-only, evidence-based suggestions.
 * Never creates tasks automatically; uses existing authenticated stock RPC.
 */
(function(w,d){
'use strict';
if(w.RESANTA_TRIOVIST_DEMAND_AI_V1)return;
const V='2026.11.05.1',A='aleksandrenko_av@resanta.ru',K='krishtal_na@resanta.ru';
const OWNERS=new Set([A,K]),BOSSES=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
const ID='tri-ai179',STYLE='tri-ai179-style';
let flight=null,cache=null,loadedAt=0,state='',busy=false,renderEpoch=0;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const money=v=>num(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const qty=v=>num(v).toLocaleString('ru-RU',{maximumFractionDigits:2});
const profile=()=>{try{return typeof currentProfile!=='undefined'?currentProfile||{}:w.currentProfile||{}}catch(_){return w.currentProfile||{}}};
const email=()=>String(profile()?.email||'').trim().toLowerCase();
const boss=()=>profile()?.role==='boss'&&BOSSES.has(email());
const manager=()=>profile()?.access_scope==='triovist'&&OWNERS.has(email());
const allowed=()=>boss()||manager();
const active=()=>d.getElementById('page-triovist')?.classList?.contains('active')&&d.querySelector('#tr14-shell [data-tr14="tasks"]')?.classList?.contains('on');
const month=()=>{const t=new Date();return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')};
const dbx=()=>{try{return typeof db!=='undefined'?db:w.db}catch(_){return w.db}};
function style(){
 if(d.getElementById(STYLE))return;
 const s=d.createElement('style');s.id=STYLE;s.textContent=[
 '#tri-ai179{margin:10px 0 15px;padding:15px;border-radius:13px;border:1px solid #ccdaea;background:linear-gradient(125deg,#eff6ff,#fff);color:#183d61}',
 '#tri-ai179 *{box-sizing:border-box}#tri-ai179 h3{font-size:17px;color:#164c7b;margin:0 0 5px}#tri-ai179 h4{font-size:12px;color:#1e527f;margin:10px 0}',
 '#tri-ai179 .ai179-intro,#tri-ai179 .ai179-note{font-size:11px;line-height:1.5;color:#657b91}',
 '#tri-ai179 .ai179-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}',
 '#tri-ai179 .ai179-kpi{background:white;padding:11px;border:1px solid #dce6f1;border-radius:10px}',
 '#tri-ai179 .ai179-kpi small{display:block;font-size:10px;color:#667d96}',
 '#tri-ai179 .ai179-kpi strong{display:block;font-size:19px;color:#20567e;margin:4px 0}',
 '#tri-ai179 .ai179-grid,#tri-ai179 .ai179-tasks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}',
 '#tri-ai179 .ai179-card,#tri-ai179 .ai179-task{min-width:0;background:#fff;border:1px solid #dce6f1;border-radius:10px;padding:12px}',
 '#tri-ai179 .ai179-card b,#tri-ai179 .ai179-task b{font-size:12px;color:#194b79}',
 '#tri-ai179 .ai179-card p,#tri-ai179 .ai179-task p,#tri-ai179 .ai179-task small{font-size:11px;color:#566f89;line-height:1.5;margin:6px 0}',
 '#tri-ai179 .ai179-warning{padding:10px 12px;border:1px solid #f0d09f;background:#fffbeb;color:#845c1b;border-radius:9px;font-size:11px;line-height:1.5;margin:10px 0}',
 '#tri-ai179 .ai179-actions{display:flex;gap:7px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:10px 0}',
 '#tri-ai179 button{padding:8px 10px;border-radius:8px;border:1px solid #aac7e2;background:#f5faff;color:#185d94;font-weight:700;cursor:pointer;font-size:11px}',
 '#tri-ai179 button:disabled{opacity:.55;cursor:default}',
 '#tri-ai179 details{margin-top:10px;border:1px solid #dce6f1;border-radius:8px;background:white;padding:10px}',
 '#tri-ai179 summary{font-size:11px;font-weight:800;color:#1a5c96;cursor:pointer}',
 '#tri-ai179 table{font-size:11px;border-collapse:collapse;width:100%}#tri-ai179 td,#tri-ai179 th{padding:6px;text-align:left;border-bottom:1px solid #edf1f6}',
 '@media(max-width:900px){#tri-ai179 .ai179-grid,#tri-ai179 .ai179-tasks{grid-template-columns:1fr}}',
 '@media(max-width:600px){#tri-ai179 .ai179-kpis{grid-template-columns:1fr}}'
 ].join('\n');
 d.head.appendChild(s);
}
function host(){
 const c=d.getElementById('tri-task-card');if(!c||!allowed())return null;
 style();let e=d.getElementById(ID);
 if(!e){e=d.createElement('section');e.id=ID;e.setAttribute('aria-label','Uni AI · планы и приоритеты');c.prepend(e)}
 return e;
}
function pickCandidates(items,groups){
 const valid=new Map((groups||[]).map(g=>[String(g.manager_email||'').toLowerCase()+'|'+String(g.group||'').toLocaleLowerCase('ru'),g]));
 const picked=[],seen=new Set();
 for(const r of items||[]){
  const manager=String(r.manager_email||'').toLowerCase(),group=String(r.assigned_group||'');
  if(!valid.has(manager+'|'+group.toLocaleLowerCase('ru')))continue;
  const sku=String(r.sku||'').trim();
  if(!/^[0-9]+(?:\/[0-9]+){1,6}$/.test(sku)||/^900(?:\/|$)/.test(sku))continue;
  const prior=num(r.sales_90),free=num(r.partner_free),vitebsk=num(r.own_qty);
  if(prior<=0||(free<=0&&vitebsk<=0))continue;
  const action=free<1&&vitebsk>0?'replenishment_review':'listing_review';
  const k=manager+'|'+sku+'|'+action;if(seen.has(k))continue;seen.add(k);
  const priority=(action==='replenishment_review'?100000:0)+Math.min(10000,prior*120)+Math.min(5000,num(r.recommended)*5);
  picked.push({sku,group,manager,product:r.product||sku,action,priority,
   sales90:prior,free,vitebsk,chekhov:num(r.chekhov_qty),
   note:action==='replenishment_review'?'Проверить возможность и сроки пополнения с Витебска':
    'Проверить цену, карточку и фактическую позицию. Без гарантированного TOP-60'});
 }
 return picked.sort((a,b)=>b.priority-a.priority||a.sku.localeCompare(b.sku,'ru'));
}
function groupTable(groups){
 return '<details><summary>Подробный расчёт по всем группам ('+groups.length+')</summary>'+
 '<div style="overflow-x:auto"><table><thead><tr><th>Группа</th><th>Прошлый год</th><th>Прошлый месяц</th><th>Сезон</th><th>Предложение</th><th>Ограничение</th></tr></thead><tbody>'+
 groups.map(g=>'<tr><td>'+esc(g.group)+'</td><td>'+money(g.last_year)+'</td><td>'+money(g.previous_month)+
 '</td><td>'+(g.season_ratio==null?'—':num(g.season_ratio).toFixed(2))+'</td>'+
 '<td>'+(g.proposed==null?'не рассчитано':money(g.proposed))+'</td>'+
 '<td>'+esc(g.readiness||'')+': '+esc(g.action||'')+'</td></tr>').join('')+'</tbody></table></div></details>';
}
function render(){
 const el=host();if(!el||!active())return false;
 const data=cache?.preview,stock=cache?.stock;
 if(!data){
  el.innerHTML='<h3>✦ Uni AI · обоснованный план</h3><p class="ai179-note">'+esc(state||'Проверяю продажи, сезонность и реальные остатки…')+
   '</p><button type="button" data-ai179-refresh>↻ Проверить заново</button>';return true;
 }
 const managers=Array.isArray(data.managers)?data.managers:[],groups=Array.isArray(data.groups)?data.groups:[],
       sources=data.sources||{},candidates=pickCandidates(stock?.items||[],groups);
 const total=managers.reduce((a,x)=>a+num(x.suggested),0),problems=groups.filter(x=>x.proposed==null||x.readiness!=='review').length;
 const kpi=(name,value,sub)=>'<div class="ai179-kpi"><small>'+esc(name)+'</small><strong>'+esc(value)+'</strong><small>'+esc(sub)+'</small></div>';
 const cards=managers.map(m=>'<article class="ai179-card"><b>'+esc(m.name)+'</b>'+
  '<div style="font-size:23px;font-weight:850;margin:8px 0">'+money(m.suggested)+'</div>'+
  '<p>Аналогичный месяц прошлого года: '+money(m.last_year)+' · предыдущий месяц: '+money(m.previous_month)+'</p>'+
  '<p>Обоснованных товарных групп: '+m.included_groups+' из '+m.total_groups+
  '. '+(m.requires_review?'Есть группы, требующие проверки.':'Все исторические группы рассчитаны.')+'</p>'+
  '<p>Не утверждённый план. Решение — после согласования руководителем.</p></article>').join('');
 const selected=candidates.slice(0,8);
 const taskCards=selected.map(x=>'<article class="ai179-task"><b>'+esc(x.sku)+' · '+esc(x.product)+'</b>'+
  '<p>'+esc(x.group)+' · продажи за 3 месяца '+qty(x.sales90)+' шт. · свободно 21vek '+qty(x.free)+
  ' · Витебск '+qty(x.vitebsk)+' · Чехов справочно '+qty(x.chekhov)+'</p>'+
  '<small>'+esc(x.note)+'</small>'+
  (boss()?'<div class="ai179-actions"><button type="button" data-ai179-draft="'+esc(x.sku)+'" data-ai179-manager="'+esc(x.manager)+'" data-ai179-action="'+esc(x.action)+'" '+(busy?'disabled':'')+'>Подготовить черновик на согласование</button></div>':'')+
  '</article>').join('');
 el.innerHTML='<h3>✦ Uni AI · интеллектуальное планирование</h3>'+
  '<p class="ai179-intro">Сопоставимые продажи прошлого года и прошлого месяца, сезонность и целевой рост +15%. Никаких случайных 8/10/12/15 задач или обязательного TOP-60.</p>'+
  '<div class="ai179-kpis">'+kpi('Рассчитанный потенциал',money(total),'Не утверждённые планы')+
  kpi('Группы требуют проверки',String(problems),'История, сезонность, товарная обеспеченность')+
  kpi('SKU-кандидаты',String(candidates.length),'Руководитель выбирает вручную')+'</div>'+
  '<div class="ai179-grid">'+cards+'</div>'+
  '<p class="ai179-warning">Остатки: 21vek '+esc(sources.partner_date||'—')+', Витебск '+esc(sources.vitebsk_date||'—')+
  ', Чехов справочно '+esc(sources.chekhov_date||'—')+'. '+esc(sources.transit_warning||'Товар в пути требует отдельного подтверждения')+
  '. Группа 900 исключена, свободный товар в пути не прибавляется повторно. Ничего автоматически не назначается.</p>'+
  '<div class="ai179-actions"><b>Товарные приоритеты</b>'+
  (boss()?'<button type="button" data-ai179-go-plan>Перейти к утверждению денежного плана</button>':'')+
  '<button type="button" data-ai179-refresh>↻ Пересчитать</button></div>'+
  (selected.length?'<div class="ai179-tasks">'+taskCards+'</div>':'<p class="ai179-note">Нет надёжных SKU-кандидатов по загруженным данным — новых задач не предлагаем.</p>')+
  groupTable(groups)+(state?'<p class="ai179-note" role="status">'+esc(state)+'</p>':'')+
  '<p class="ai179-note">Каждое поручение создаётся только после отдельного подтверждения руководителем и попадает на согласование. Месяцы до ноября, утверждённые планы и премии не меняются.</p>';
 const old=d.querySelector('.tm360-generator-pause');if(old)old.style.display='none';
 return true;
}
async function open(force=false){
 if(!allowed()||!active())return false;
 const node=host(),target=month();
 if(!force&&cache?.month===target&&Date.now()-loadedAt<240000){render();return true}
 if(flight)return flight;
 const client=dbx();if(!client?.rpc){state='Связь с CRM недоступна';render();return false}
 state='';if(force)cache=null;render();const epoch=++renderEpoch;
 flight=(async()=>{
  const [a,b]=await Promise.all([
   client.rpc('triovist_ai_demand_preview_v20261105',{p_month:target+'-01'}),
   client.rpc('triovist_get_stock_dashboard',{p_target_days:30})
  ]);
  if(a?.error)throw a.error;if(b?.error)throw b.error;
  if(a.data?.version!=='uni-demand-20261105-v1'||a.data?.month!==target)throw Error('Неверная версия или период Uni AI');
  if(!Array.isArray(a.data?.groups)||!Array.isArray(b.data?.items))throw Error('Неполные исходные данные');
  if(epoch!==renderEpoch||!node?.isConnected)return false;
  cache={month:target,preview:a.data,stock:b.data};loadedAt=Date.now();render();return true;
 })().catch(e=>{state='Ошибка расчёта: '+String(e?.message||e);render();return false}).finally(()=>{flight=null});
 return flight;
}
async function draft(sku,managerEmail,action){
 if(!boss()||busy||!active())return false;
 const item=pickCandidates(cache?.stock?.items||[],cache?.preview?.groups||[]).find(x=>x.sku===sku&&x.manager===managerEmail&&x.action===action);
 if(!item){state='SKU требует обновления данных — создаваемый черновик отменён.';render();return false}
 if(!w.confirm?.('Создать ОДИН черновик для '+sku+' ('+item.group+')?\n'+item.note+'\nОн ещё должен пройти согласование руководителя.'))return false;
 busy=true;state='Проверяю SKU и создаю черновик…';render();
 try{
  const client=dbx(),r=await client.rpc('triovist_ai_task_draft_v20261105',{
   p_month:month()+'-01',p_manager_email:managerEmail,p_sku:sku,p_action:action
  });
  if(r?.error)throw r.error;
  if(!r.data?.ok)throw Error('Сервер не подтвердил создание черновика');
  state=r.data.created?'Черновик '+sku+' создан, ожидает согласования.':'Такой черновик уже существует, дублирование исключено.';
  w.TRIOVIST_DATA_HUB_V227315?.invalidate?.('tasks');
  await w.RESANTA_TRIOVIST_TASK_MONTH_SAFE_V23651?.render?.(true);
  w.RESANTA_TRIOVIST_TASKS360_V1?.enhance?.();
  return true;
 }catch(e){state='Создать черновик не удалось: '+String(e?.message||e);return false}
 finally{busy=false;render()}
}
d.addEventListener('click',ev=>{
 if(ev.target.closest?.('[data-ai179-refresh]')){open(true);return}
 const item=ev.target.closest?.('[data-ai179-draft]');
 if(item){draft(item.dataset.ai179Draft||'',item.dataset.ai179Manager||'',item.dataset.ai179Action||'');return}
 if(ev.target.closest?.('[data-ai179-go-plan]')){d.querySelector('#tr14-shell [data-tr14="motivation"]')?.click?.();return}
 if(ev.target.closest?.('[data-tr14="tasks"]'))setTimeout(()=>open(false),120);
},true);
d.addEventListener('visibilitychange',()=>{if(!d.hidden&&active()&&cache)render()});
w.RESANTA_TRIOVIST_DEMAND_AI_V1=Object.freeze({version:V,open,pickCandidates,manualDraftOnly:true,noAutoTasks:true,excludeGroup900:true,neverCountsChekhovAsAvailable:true});
})(window,document);
