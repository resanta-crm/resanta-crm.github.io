/* Budgets 360 / Uni AI · 2026-11-11.
 * Read-only view over existing promotion budgets, movements, approved promotions and audit.
 * Never recomputes authoritative balances, mutates data or changes permissions.
 */
(function(w,d){
'use strict';
if(w.RESANTA_BUDGETS360_V1)return;
const TOP='budgets360-top',LIST='budgets360-list',STYLE='budgets360-style';
const openManagers=new Set();let wrapped=false,baseRender=null,baseDetail=null,renderBusy=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const money=v=>num(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const compact=v=>Math.round(num(v)).toLocaleString('ru-RU')+' BYN';
const date=v=>{const s=String(v||'').slice(0,10);return /^\d{4}-\d\d-\d\d$/.test(s)?s.slice(8)+'.'+s.slice(5,7)+'.'+s.slice(0,4):'—'};
const dateTime=v=>{if(!v)return'—';const t=new Date(v);return Number.isNaN(t.getTime())?date(v):t.toLocaleString('ru-RU',{timeZone:'Europe/Minsk',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})};
const normalize=v=>String(v||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
const current=()=>{try{return typeof currentProfile==='undefined'?w.currentProfile:currentProfile}catch(_){return w.currentProfile}};
const arrays=()=>{try{return{budgets:allPromotionBudgets||[],movements:allPromotionBudgetMovements||[],audits:allPromotionBudgetAudit||[],promotions:allPromotions||[],clients:allClients||[]}}catch(_){return null}};
const isActive=()=>!!d.getElementById('page-budgets')?.classList.contains('active');
const summaryFor=b=>{try{return typeof promoBudgetSummary==='function'?promoBudgetSummary(b):null}catch(e){console.warn('Budgets360 summary unavailable',e);return null}};
const nameFor=(b,clients)=>b.manager_name||clients.find(c=>String(c.id)===String(b.client_id))?.manager_name||'Не назначен';
function records(){
 const p=current(),a=arrays();
 if(!p||!a||!['boss','manager'].includes(String(p.role||'')))return null;
 const isBoss=p.role==='boss';
 // Keep the EXACT existing client membership rule: never reveal another manager's budget.
 const clientIds=new Set(a.clients.filter(c=>isBoss||c.manager_name===p.name).map(c=>String(c.id)));
 const selection=d.getElementById('budgets-manager-filter')?.value||'all';
 const query=normalize(d.getElementById('budgets-search')?.value||'');
 const rows=a.budgets.filter(b=>clientIds.has(String(b.client_id||''))).map(b=>({
   budget:b, manager:nameFor(b,a.clients),metrics:summaryFor(b)
 })).filter(x=>x.metrics&&(selection==='all'||x.manager===selection)&&(!query||normalize(x.budget.client_name+' '+x.manager).includes(query)));
 return {rows,context:a,isBoss,selection};
}
function css(){
 if(d.getElementById(STYLE))return;
 const el=d.createElement('style');el.id=STYLE;
 el.textContent=[
 '#page-budgets.budgets360-installed #budgets-kpi,#page-budgets.budgets360-installed #budgets-list{display:none!important}',
 '#page-budgets #'+TOP+'{display:grid;gap:12px;margin-bottom:12px}',
 '#page-budgets .b360-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px}',
 '#page-budgets .b360-kpi{border:1px solid var(--border,#dae1ea);background:var(--card,#fff);border-radius:14px;padding:16px;min-width:0;display:grid;gap:8px}',
 '#page-budgets .b360-kpi small{color:var(--sub,#64748b);font-size:11px}',
 '#page-budgets .b360-kpi strong{font-size:clamp(17px,1.55vw,27px);letter-spacing:-.4px;overflow-wrap:anywhere}',
 '#page-budgets .b360-muted{font-size:11px;line-height:1.5;color:var(--sub,#64748b)}',
 '#page-budgets .b360-top{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(310px,1fr);gap:11px}',
 '#page-budgets .b360-panel{border:1px solid var(--border,#dae1ea);background:var(--card,#fff);border-radius:14px;padding:17px;min-width:0}',
 '#page-budgets .b360-panel h3{font-size:16px;font-weight:800;margin:0 0 11px}',
 '#page-budgets .b360-bar{height:18px;background:#e2e8f0;border-radius:999px;overflow:hidden;display:flex;margin:14px 0}',
 '#page-budgets .b360-bar span{display:block;height:100%}',
 '#page-budgets .b360-grid-legend{display:flex;gap:12px;flex-wrap:wrap;font-size:12px}',
 '#page-budgets .b360-brief{display:grid;gap:8px}',
 '#page-budgets .b360-brief button{width:100%;text-align:left;display:flex;justify-content:space-between;align-items:center;gap:8px;border:1px solid var(--border,#dae1ea);background:var(--bg,#f8fafc);padding:10px;border-radius:9px;color:inherit;cursor:pointer;font:inherit}',
 '#page-budgets .b360-brief button small{display:block;color:var(--sub,#64748b);margin-top:3px}',
 '#page-budgets .b360-red{color:#b91c1c!important}#page-budgets .b360-green{color:#15803d!important}',
 '#page-budgets .b360-months{display:grid;gap:9px}',
 '#page-budgets .b360-month-row{display:grid;grid-template-columns:70px 1fr 110px;gap:8px;align-items:center;font-size:11px}',
 '#page-budgets .b360-month-track{display:grid;gap:3px}',
 '#page-budgets .b360-month-track span{height:7px;display:block;border-radius:4px}',
 '#page-budgets #'+LIST+'{display:grid;gap:12px;margin-bottom:12px}',
 '#page-budgets .b360-manager{border:1px solid var(--border,#dae1ea);border-radius:12px;overflow:hidden;background:var(--card,#fff)}',
 '#page-budgets .b360-manager>summary{cursor:pointer;list-style:none;padding:13px 15px;display:flex;align-items:center;justify-content:space-between;gap:10px}',
 '#page-budgets .b360-manager>summary::-webkit-details-marker{display:none}',
 '#page-budgets .b360-manager>summary b{font-weight:800}#page-budgets .b360-manager>summary small{color:var(--sub,#64748b)}',
 '#page-budgets .b360-clients{display:grid;gap:7px;padding:0 12px 12px}',
 '#page-budgets .b360-client{display:grid;grid-template-columns:minmax(160px,2fr) repeat(4,minmax(85px,1fr)) auto;gap:9px;align-items:center;padding:11px;border-radius:9px;border:1px solid var(--border,#dae1ea)}',
 '#page-budgets .b360-client small{display:block;color:var(--sub,#64748b);font-size:10px;margin-top:4px}',
 '#page-budgets .b360-client button{border:1px solid var(--border,#dae1ea);background:var(--card,#fff);border-radius:8px;padding:8px 10px;cursor:pointer;color:inherit;font:inherit;font-size:12px;font-weight:750}',
 '#page-budgets .b360-client.b360-alert{border-left:4px solid #dc2626}',
 '#modal-budget-detail .b360-history{margin-top:13px;border:1px solid var(--border,#dae1ea);border-radius:11px;padding:13px}',
 '#modal-budget-detail .b360-history h3{font-size:15px;margin:0 0 10px}',
 '#modal-budget-detail .b360-event{border-left:2px solid #bfdbfe;padding:0 0 13px 13px;margin-left:5px;font-size:12px;line-height:1.55}',
 '#modal-budget-detail .b360-event strong{display:block}#modal-budget-detail .b360-event small{display:block;color:var(--sub,#64748b)}',
 '#modal-budget-detail .b360-reserves{font-size:12px;display:grid;gap:6px;margin-top:8px}',
 '@media(max-width:1300px){#page-budgets .b360-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}#page-budgets .b360-client{grid-template-columns:minmax(160px,2fr) repeat(2,minmax(90px,1fr)) auto}#page-budgets .b360-client .b360-secondary{display:none}}',
 '@media(max-width:800px){#page-budgets .b360-top{grid-template-columns:1fr}#page-budgets .b360-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}#page-budgets .b360-client{grid-template-columns:1fr 1fr}#page-budgets .b360-client>div:first-child{grid-column:1/-1}#page-budgets .b360-client button{grid-column:1/-1}}'
 ].join('\n');d.head.appendChild(el);
}
function mount(){
 const page=d.getElementById('page-budgets'),kpi=d.getElementById('budgets-kpi'),list=d.getElementById('budgets-list');
 if(!page||!kpi||!list)return null;
 css();
 let top=d.getElementById(TOP),bottom=d.getElementById(LIST);
 if(!top){top=d.createElement('section');top.id=TOP;kpi.insertAdjacentElement('beforebegin',top)}
 if(!bottom){bottom=d.createElement('section');bottom.id=LIST;list.insertAdjacentElement('beforebegin',bottom);bottom.addEventListener('click',onOpen);bottom.addEventListener('toggle',onToggle,true)}
 if(!top.__b360Click){top.addEventListener('click',onOpen);top.__b360Click=true}
 page.classList.add('budgets360-installed');
 return {top,bottom,page};
}
function kpi(label,value,detail,cls=''){
 return '<div class="b360-kpi"><small>'+esc(label)+'</small><strong class="'+esc(cls)+'">'+esc(value)+'</strong><span class="b360-muted">'+esc(detail)+'</span></div>';
}
function monthRows(rows,context){
 const budgetIds=new Set(rows.map(x=>String(x.budget.id))),byMonth=new Map();
 context.movements.filter(m=>budgetIds.has(String(m.budget_id||''))&&/^\d{4}-\d{2}/.test(String(m.occurred_on||''))).forEach(m=>{
  const month=String(m.occurred_on).slice(0,7),v=byMonth.get(month)||{accrual:0,expense:0,adjustment:0};
  if(['accrual','expense','adjustment'].includes(m.movement_type))v[m.movement_type]+=num(m.amount);
  byMonth.set(month,v);
 });
 const arr=[...byMonth.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-6);
 if(!arr.length)return '<div class="b360-muted">В выбранной выборке пока нет датированных движений для графика.</div>';
 const max=Math.max(1,...arr.map(([,v])=>Math.max(v.accrual,v.expense)));
 return '<div class="b360-months">'+arr.map(([m,v])=>'<div class="b360-month-row"><b>'+esc(m.slice(5)+'.'+m.slice(0,4))+'</b>'+
  '<div class="b360-month-track"><span style="width:'+Math.max(0,v.accrual/max*100)+'%;background:#16a34a" title="Начислено: '+esc(money(v.accrual))+'"></span>'+
  '<span style="width:'+Math.max(0,v.expense/max*100)+'%;background:#2563eb" title="Расходы: '+esc(money(v.expense))+'"></span></div>'+
  '<span style="text-align:right">'+esc(compact(v.accrual))+' / '+esc(compact(v.expense))+'</span></div>').join('')+'</div>';
}
function buildTop(data){
 const rows=data.rows,items=rows.map(x=>x.metrics),total=items.reduce((s,x)=>s+num(x.total),0),spent=items.reduce((s,x)=>s+num(x.spent),0),reserved=items.reduce((s,x)=>s+num(x.reserved),0),free=items.reduce((s,x)=>s+num(x.free),0),
 bad=rows.filter(x=>num(x.metrics.free)<-0.005).sort((a,b)=>num(a.metrics.free)-num(b.metrics.free)),
 danger=bad.reduce((s,x)=>s-Math.min(0,num(x.metrics.free)),0),low=rows.filter(x=>num(x.metrics.free)>=0&&num(x.metrics.free)<500).sort((a,b)=>num(a.metrics.free)-num(b.metrics.free));
 const big=total>0?total:1;
 // Not a historical snapshot: this is a current budget allocation only.
 const percent=v=>Math.max(0,Math.min(100,v/big*100));
 const bar='<div class="b360-bar" aria-label="Текущие суммы расходов и резервов"><span style="width:'+percent(Math.max(0,spent))+'%;background:#2563eb"></span><span style="width:'+Math.min(100-percent(Math.max(0,spent)),percent(Math.max(0,reserved)))+'%;background:#f59e0b"></span></div>';
 const priorities=bad.slice(0,3).map(x=>'<button type="button" data-b360-open="'+esc(x.budget.id)+'"><span><b>'+esc(x.budget.client_name)+'</b><small>'+esc(x.manager)+' · перерасход бюджета</small></span><b class="b360-red">'+esc(money(x.metrics.free))+'</b></button>').join('');
 const lowRows=low.slice(0,2).map(x=>'<button type="button" data-b360-open="'+esc(x.budget.id)+'"><span><b>'+esc(x.budget.client_name)+'</b><small>'+esc(x.manager)+' · свободно менее 500 BYN</small></span><b>'+esc(money(x.metrics.free))+'</b></button>').join('');
 const brief=priorities+lowRows||'<div class="b360-muted">Отрицательных остатков и бюджетов со свободным остатком менее 500 BYN в выбранной выборке нет.</div>';
 return '<div class="b360-kpis">'+
  kpi('Клиентов с бюджетом',String(rows.length),'Подтверждённые записи CRM')+
  kpi('Всего бюджета',money(total),'Стартовый остаток + начисления + корректировки')+
  kpi('Потрачено',money(spent),'Включая расходы по акциям')+
  kpi('В резерве',money(reserved),'По действующим согласованным акциям')+
  kpi('Свободно',money(free),'После расходов и резерва',free<0?'b360-red':'b360-green')+
  kpi('Перерасход',money(danger),bad.length+' клиент(ов) с отрицательным остатком',bad.length?'b360-red':'')+
 '</div><div class="b360-top"><section class="b360-panel"><h3>Движения бюджета по месяцам</h3>'+monthRows(rows,data.context)+
 '<div class="b360-grid-legend"><span>🟢 Начисления</span><span>🔵 Расходы</span></div>'+
 '<div class="b360-muted" style="margin-top:10px">Даты из реальных операций. Стартовые остатки и текущие резервы в помесячный график не включены. Начисления и расходы не равны свободному остатку.</div></section>'+
 '<section class="b360-panel"><h3>✦ Лера · Что требует внимания</h3><div class="b360-brief">'+brief+'</div>'+
 '<div class="b360-muted" style="margin-top:11px">Подсказки рассчитаны из текущих данных CRM. Лера не меняет бюджеты и не создаёт поручения автоматически.</div></section></div>';
}
function buildBottom(data){
 const groups=new Map();
 data.rows.forEach(x=>{if(!groups.has(x.manager))groups.set(x.manager,[]);groups.get(x.manager).push(x)});
 const ordered=[...groups.entries()].sort((a,b)=>a[0].localeCompare(b[0],'ru'));
 if(!ordered.length)return '<div class="b360-panel">По выбранным фильтрам клиентских бюджетов нет.</div>';
 return '<div class="b360-muted" style="padding:0 4px">Менеджеры и клиенты · нажмите на группу, затем «История и операции» у нужного клиента.</div>'+
 ordered.map(([manager,rows],i)=>{
  const sum=rows.reduce((s,x)=>s+num(x.metrics.free),0),bad=rows.filter(x=>x.metrics.free<0),isOpen=openManagers.has(manager)||(!openManagers.size&&(bad.length>0||data.selection!=='all'||i===0));
  return '<details class="b360-manager" data-b360-manager="'+esc(manager)+'"'+(isOpen?' open':'')+'><summary><div><b>👤 '+esc(manager)+'</b><small> · '+rows.length+' клиентов · '+bad.length+' с перерасходом</small></div>'+
  '<b class="'+(sum<0?'b360-red':'b360-green')+'">'+esc(money(sum))+'</b></summary>'+
  '<div class="b360-clients">'+rows.slice().sort((a,b)=>num(a.metrics.free)-num(b.metrics.free)||a.budget.client_name.localeCompare(b.budget.client_name,'ru')).map(x=>{
   const s=x.metrics;return '<div class="b360-client'+(s.free<0?' b360-alert':'')+'"><div><b>'+esc(x.budget.client_name)+'</b><small>'+esc(x.manager)+(s.free<0?' · ⚠ перерасход':'')+'</small></div>'+
    '<div><small>Бюджет</small><b>'+esc(compact(s.total))+'</b></div>'+
    '<div class="b360-secondary"><small>Потрачено</small><b>'+esc(compact(s.spent))+'</b></div>'+
    '<div class="b360-secondary"><small>Резерв</small><b>'+esc(compact(s.reserved))+'</b></div>'+
    '<div><small>Свободно</small><b class="'+(s.free<0?'b360-red':'b360-green')+'">'+esc(money(s.free))+'</b></div>'+
    '<button type="button" data-b360-open="'+esc(x.budget.id)+'">История и операции</button></div>';
  }).join('')+'</div></details>';
 }).join('');
}
function onOpen(e){
 const btn=e.target.closest?.('[data-b360-open]');if(!btn)return;
 const id=String(btn.dataset.b360Open||''),scope=records();if(!scope?.rows.some(x=>String(x.budget.id)===id))return;
 if(typeof w.openBudgetDetail==='function')w.openBudgetDetail(id);
}
function onToggle(e){
 const det=e.target;if(det?.matches?.('[data-b360-manager]')){
  const name=det.dataset.b360Manager;if(det.open)openManagers.add(name);else openManagers.delete(name);
 }
}
function changeSummary(a){
 const fields=[['opening_balance','Стартовый остаток'],['budget_total','Бюджет карточки'],['period_start','Начало периода'],['period_end','Конец периода'],['balance_as_of','Дата остатка'],['budget_percent','Процент начисления'],['manager_name','Менеджер'],['note','Примечание']];
 const old=a.old_data||{},next=a.new_data||{};
 if(a.action==='insert')return 'Карточка создана';
 if(a.action==='delete')return 'Запись карточки удалена';
 const changes=fields.filter(([key])=>JSON.stringify(old[key]??null)!==JSON.stringify(next[key]??null)).slice(0,5);
 return changes.length?changes.map(([key,label])=>label+': '+String(old[key]??'—')+' → '+String(next[key]??'—')).join('; '):'Технические или служебные поля карточки обновлены';
}
function history(b,context){
 const info=summaryFor(b),a=context.audits.filter(x=>String(x.budget_id)===String(b.id)),
  moves=context.movements.filter(x=>String(x.budget_id)===String(b.id)),promos=context.promotions.filter(p=>String(p.budget_id)===String(b.id)&&['approved','in_work'].includes(p.status));
 const events=[];
 if(b.balance_as_of||b.created_at)events.push({at:b.created_at||b.balance_as_of,dateLabel:date(b.balance_as_of||b.created_at),title:'Стартовый остаток',detail:money(info?.opening),actor:b.created_by||'Исторический остаток',priority:0});
 moves.forEach(m=>events.push({at:m.created_at||m.occurred_on,dateLabel:date(m.occurred_on),title:({accrual:'Начисление',expense:'Расход',adjustment:'Корректировка'})[m.movement_type]||m.movement_type||'Операция',
  detail:(m.movement_type==='expense'?'−':m.movement_type==='adjustment'&&num(m.amount)<0?'':'+')+money(m.amount)+(m.description?' · '+m.description:'')+
     (m.movement_type==='accrual'&&m.turnover_base!=null?' · база '+money(m.turnover_base)+' × '+num(m.budget_percent)+'% × 1,20':'')+
     (m.promotion_id?' · привязано к акции':''),
  actor:m.created_by||'Не указан',priority:1}));
 a.forEach(x=>events.push({at:x.changed_at,dateLabel:dateTime(x.changed_at),title:'Журнал изменений: '+({insert:'создание',update:'редактирование',delete:'удаление'})[x.action]||'изменение',
   detail:changeSummary(x),actor:x.changed_by||'Не указан',priority:2}));
 events.sort((x,y)=>String(y.at||'').localeCompare(String(x.at||''))||x.priority-y.priority);
 const reservations=promos.map(p=>{const amount=Math.max(0,num(p.budget_reserved)-num(p.actual_spend));return amount>0?'<div>'+esc(p.title||'Акция')+' · '+esc(money(amount))+' · '+esc(p.status)+'</div>':''}).filter(Boolean);
 return '<section class="b360-history"><h3>Полная история бюджета · '+events.length+' событий</h3>'+
  '<p class="b360-muted">Движения по датам операций, журнальные изменения — по времени фиксации. Исходная информация сохранена; отсутствие события не заменяется предположением.</p>'+
  (events.length?events.map(x=>'<div class="b360-event"><strong>'+esc(x.title)+'</strong><small>'+esc(x.dateLabel)+' · '+esc(x.actor)+'</small><div>'+esc(x.detail)+'</div></div>').join(''):'<div class="b360-muted">Исторических событий пока нет.</div>')+
  '<h3 style="margin-top:12px">Текущий резерв по акциям</h3><div class="b360-reserves">'+(reservations.join('')||'<div>Активных резервов не найдено.</div>')+'</div>'+
  '<p class="b360-muted">Резерв — текущий расчёт, а не историческое движение. Начисления, расходы и корректировки отражены выше.</p></section>';
}
function enhanceDetail(id){
 const scope=records(),entry=scope?.rows.find(x=>String(x.budget.id)===String(id)),body=d.getElementById('budget-detail-body');
 if(!entry||!body)return;
 const old=body.querySelector?.(':scope > .card');if(old)old.style.display='none';
 const wrap=d.createElement('div');wrap.innerHTML=history(entry.budget,scope.context);wrap.className='b360-history-wrapper';body.appendChild(wrap);
}
function render(){
 if(renderBusy||!isActive())return;
 const scope=records(),root=mount();if(!scope||!root)return;
 renderBusy=true;
 try{root.top.innerHTML=buildTop(scope);root.bottom.innerHTML=buildBottom(scope);}
 catch(e){console.warn('Budgets360 optional presentation failed, original budget controls preserved',e);root.page.classList.remove('budgets360-installed');}
 finally{renderBusy=false}
}
function install(){
 if(wrapped)return;
 baseRender=w.renderBudgetsPage;
 baseDetail=w.openBudgetDetail;
 if(typeof baseRender!=='function'||typeof baseDetail!=='function')return;
 w.renderBudgetsPage=function(){const out=baseRender.apply(this,arguments);render();return out};
 w.openBudgetDetail=function(id){const out=baseDetail.apply(this,arguments);try{enhanceDetail(id)}catch(e){console.warn('Budgets360 history optional',e)}return out};
 wrapped=true;
 if(isActive())w.renderBudgetsPage();
}
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',install,{once:true});else install();
w.RESANTA_BUDGETS360_V1=Object.freeze({version:'20261111.1',readOnly:true,existingFinanceMath:true,historyFromExistingAudit:true,install,refresh:render});
})(window,document);
