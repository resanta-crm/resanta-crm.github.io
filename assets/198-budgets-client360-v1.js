/* Budgets 360 / Uni AI · 2026-11-11.
 * Read-only view over existing promotion budgets, movements, approved promotions and audit.
 * Never recomputes authoritative balances, mutates data or changes permissions.
 */
(function(w,d){
'use strict';
if(w.RESANTA_BUDGETS360_V1)return;
const TOP='budgets360-top',LIST='budgets360-list',STYLE='budgets360-style';
const openManagers=new Set();let wrapped=false,baseRender=null,baseDetail=null,renderBusy=false,hooksReady=false,lastRenderError='',renderCount=0;
let leraDraft='',leraLastQuestion='',leraLastClientId='',leraUserKey='';
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
 '#page-budgets .b360-ask-form{display:flex;align-items:stretch;gap:7px;margin:13px 0 9px}',
 '#page-budgets .b360-ask-form input{flex:1;min-width:0;border:1px solid var(--border,#d1d5db);border-radius:9px;padding:10px;font-size:13px;background:var(--card,#fff);color:inherit}',
 '#page-budgets .b360-ask-form button{border:0;background:#2563eb;color:#fff;border-radius:9px;padding:10px 15px;cursor:pointer;font-size:12px;font-weight:800}',
 '#page-budgets .b360-ask-samples{display:flex;gap:6px;flex-wrap:wrap;margin:7px 0}',
 '#page-budgets .b360-ask-samples button{border:1px solid var(--border,#d1d5db);background:var(--card,#fff);border-radius:999px;padding:6px 9px;font-size:11px;cursor:pointer;color:inherit}',
 '#page-budgets .b360-answer{background:var(--bg,#f8fafc);border:1px solid var(--border,#e2e8f0);border-radius:10px;padding:12px;margin-top:10px;font-size:12px;line-height:1.55;max-height:365px;overflow:auto}',
 '#page-budgets .b360-answer b{font-weight:800}#page-budgets .b360-answer ul{margin:7px 0;padding-left:18px}#page-budgets .b360-answer li{margin:4px 0}',
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
 if(!top.__b360Click){
  top.addEventListener('click',e=>{
   const btn=e.target.closest?.('[data-b360-ask]');
   if(btn){e.preventDefault();askLera(btn.dataset.b360Ask);return}
   onOpen(e);
  });
  top.addEventListener('submit',e=>{
   if(!e.target?.matches?.('[data-b360-ask-form]'))return;
   e.preventDefault();const field=e.target.querySelector('[data-b360-question]');askLera(field?.value||'');
  });
  top.addEventListener('input',e=>{if(e.target?.matches?.('[data-b360-question]'))leraDraft=String(e.target.value||'').slice(0,160)});
  top.__b360Click=true
 }
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

function questionContext(data){
 const key=String(current()?.email||current()?.name||'').toLowerCase();
 if(key!==leraUserKey){leraDraft='';leraLastQuestion='';leraLastClientId='';leraUserKey=key}
 return data;
}
function metricName(q){
 if(/(свободн|остаток|остал|доступн|можно потрат)/.test(q))return 'free';
 if(/(потрач|расход|списан)/.test(q))return 'spent';
 if(/(резерв|зарезервир)/.test(q))return 'reserved';
 if(/(начислен|начисл)/.test(q))return 'accrued';
 return 'total';
}
const metricLabels={free:'Свободный остаток',spent:'Потрачено',reserved:'Резерв',accrued:'Начислено',total:'Общий бюджет'};
function metricValue(entry,key){
 const m=entry.metrics;
 return key==='accrued'?num(m.accrued)+num(m.adjustments):num(m[key]);
}
function summaryRows(rows){
 const metrics={total:0,spent:0,reserved:0,free:0,accrued:0};
 rows.forEach(row=>Object.keys(metrics).forEach(key=>metrics[key]+=metricValue(row,key)));
 return metrics;
}
function clientAnswer(entry,key){
 const m=entry.metrics;
 const detail='<div class="b360-muted" style="margin-top:6px">Бюджет '+esc(money(m.total))+' · потрачено '+esc(money(m.spent))+
  ' · резерв '+esc(money(m.reserved))+' · свободно '+esc(money(m.free))+'</div>';
 return '<b>'+esc(entry.budget.client_name)+'</b> · '+esc(entry.manager)+
  '<div><b>'+esc(metricLabels[key])+': '+esc(money(metricValue(entry,key)))+'</b></div>'+detail;
}
function matchingEntries(q,rows){
 // Require a substantial name token; never match generic "ООО", "ЧТУП", etc.
 const ignored=new Set(['ооо','чтуп','одо','учп','ип','оао','зао','торговый','дом','компания','клиент']);
 return rows.map(entry=>{
  const name=normalize(entry.budget.client_name);
  const tokens=name.split(/[^а-яa-z0-9]+/).filter(t=>t.length>=4&&!ignored.has(t));
  const longest=tokens.filter(t=>q.includes(t)).sort((a,b)=>b.length-a.length)[0]||'';
  return{entry,score:longest.length+(q.includes(name)?100:0)};
 }).filter(x=>x.score>=4).sort((a,b)=>b.score-a.score);
}
function answerBudgetQuestion(raw,data){
 const q=normalize(String(raw||'').replace(/[?!,.;:()]/g,' ')),rows=data.rows;
 if(!q||q.length<3)return 'Спроси, например: «Какой бюджет у Бензоленд?» или «У каких клиентов перерасход?»';
 if(!rows.length)return 'В доступной тебе выборке нет бюджетов клиентов. Проверь фильтр менеджера или поиск.';
 const metric=metricName(q);
 const bad=/перерасход|отрицательн|минус|превысили|перерасходовал/.test(q);
 const low=/менее|меньше|заканчива|маленьк|не хватает/.test(q)&&!/клиент.{0,5}сколько/.test(q);
 const explicit=matchingEntries(q,rows);
 const managerNames=[...new Set(rows.map(x=>x.manager))];
 const manager=managerNames.filter(n=>normalize(n).length>=4&&q.includes(normalize(n))).sort((a,b)=>b.length-a.length)[0];
 // Follow-up "А сколько у него потрачено?" refers only to a client still in the authorized scope.
 let target=explicit[0]?.entry||null;
 if(!target&&leraLastClientId&&/(у него|у нее|у неё|у этого клиента|а сколько|его резерв|его расход|остаток)/.test(q))
  target=rows.find(x=>String(x.budget.id)===leraLastClientId)||null;
 if(target){
  if(explicit.length>1&&explicit[1].score===explicit[0].score&&target.budget.id!==explicit[1].entry.budget.id){
   leraLastClientId='';
   return 'Нашла несколько похожих клиентов: '+explicit.filter(x=>x.score===explicit[0].score).slice(0,5).map(x=>'<b>'+esc(x.entry.budget.client_name)+'</b>').join(', ')+'. Уточни название.';
  }
  leraLastClientId=String(target.budget.id);
  return clientAnswer(target,metric);
 }
 if(/у него|у нее|у неё|этого клиента/.test(q))return 'Уточни, о каком клиенте идёт речь, например: «Бюджет Бензоленд».';
 if(!manager&&!/всех клиентов|клиентов|каждого клиента|по клиентам/.test(q)&&/бюджет у (?!клиент)|(?:сколько|какой|остаток|расход|резерв).{0,30} у (?!клиент)/.test(q))return 'Не нашла клиента с таким названием среди доступных тебе бюджетов. Уточни название или проверь фильтр менеджера.';
 leraLastClientId='';
 let selected=manager?rows.filter(x=>x.manager===manager):rows;
 const scope=manager?' бюджетам менеджера '+esc(manager):' бюджетам доступных клиентов';
 const totals=summaryRows(selected);
 if(bad||low){
  const filtered=selected.filter(x=>bad?num(x.metrics.free)<-0.005:num(x.metrics.free)>=0&&num(x.metrics.free)<500)
   .sort((a,b)=>num(a.metrics.free)-num(b.metrics.free));
  if(!filtered.length)return 'По'+scope+(bad?' перерасхода бюджета нет.':' нет остатков от 0 до 500 BYN.');
  return '<b>'+esc(bad?'Перерасход бюджета':'Остаток менее 500 BYN')+': '+filtered.length+' клиент(ов)</b><ul>'+
   filtered.slice(0,30).map(x=>'<li><b>'+esc(x.budget.client_name)+'</b> · '+esc(x.manager)+' · свободно '+esc(money(x.metrics.free))+'</li>').join('')+'</ul>';
 }
 // For a plural question, list client-by-client budgets, not only a grand total.
 const plural=/клиент|все бюджеты|по клиентам|список|покажи всех/.test(q)&&!/(сколько всего|общая сумма|общий объем|в сумме)/.test(q);
 if(plural){
  return '<b>'+esc(metricLabels[metric])+' по'+scope+' · '+selected.length+' клиентов</b>'+
   '<div style="margin:5px 0">Итого: <b>'+esc(money(totals[metric]))+'</b></div><ul>'+
   selected.slice().sort((a,b)=>a.budget.client_name.localeCompare(b.budget.client_name,'ru')).slice(0,30).map(x=>
    '<li><b>'+esc(x.budget.client_name)+'</b> · '+esc(x.manager)+' — '+esc(money(metricValue(x,metric)))+'</li>').join('')+
   '</ul>'+(selected.length>30?'<div class="b360-muted">Показаны первые 30 клиентов, уточни менеджера или название.</div>':'');
 }
 return '<b>'+esc(metricLabels[metric])+' по'+scope+': '+esc(money(totals[metric]))+'</b>'+
  '<div class="b360-muted">Клиентов в выборке: '+selected.length+'. Могу показать суммы по каждому клиенту или объяснить, у кого перерасход.</div>';
}
function leraAskHtml(data){
 questionContext(data);
 const suggestion=['Какие бюджеты у клиентов?','У кого перерасход?','Сколько свободно?'];
 const response=leraLastQuestion?'<div class="b360-answer" role="status" aria-live="polite">'+
  '<div class="b360-muted">Твой вопрос: '+esc(leraLastQuestion)+'</div>'+
  answerBudgetQuestion(leraLastQuestion,data)+'</div>':'';
 return '<form class="b360-ask-form" data-b360-ask-form><input name="budgetQuestion" data-b360-question maxlength="160" autocomplete="off" aria-label="Спроси Леру о бюджете клиента" placeholder="Спроси Леру: какой бюджет у Бензоленд?" value="'+esc(leraDraft)+'"><button type="submit">Спросить</button></form>'+
  '<div class="b360-ask-samples">'+suggestion.map(s=>'<button type="button" data-b360-ask="'+esc(s)+'">'+esc(s)+'</button>').join('')+'</div>'+response;
}
function askLera(text){
 const q=String(text||'').trim().slice(0,160);
 if(!q)return;
 leraLastQuestion=q;leraDraft=q;
 render();
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
 '<section class="b360-panel"><h3>✦ Лера · Спроси про бюджет</h3>'+leraAskHtml(data)+'<h3 style="font-size:13px;margin:15px 0 8px">Что требует внимания</h3><div class="b360-brief">'+brief+'</div>'+
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
 return '<section class="b360-history"><h3>История доступных операций · '+events.length+' событий</h3>'+
  '<p class="b360-muted">Движения по датам операций, журнальные изменения — по времени фиксации. Показаны сохранённые движения и журнал изменений карточки. Ранее удалённые движения могут отсутствовать, поскольку отдельный неизменяемый журнал движений пока не внедрён.</p>'+
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
 let root=null;
 try{
  // Avoid a silent blank upgrade: always leave the old finance view intact on failure.
  const scope=records();if(!scope)return;
  root=mount();if(!root)return;
  renderBusy=true;
  const topHtml=buildTop(scope),bottomHtml=buildBottom(scope);
  root.top.innerHTML=topHtml;root.bottom.innerHTML=bottomHtml;
  if(!root.page.classList.contains('budgets360-installed'))root.page.classList.add('budgets360-installed');
  lastRenderError='';renderCount++;
 }catch(e){
  lastRenderError=String(e?.message||e);
  console.warn('Budgets360 optional presentation failed, original budget controls preserved',e);
  root?.page?.classList?.remove('budgets360-installed');
 }finally{renderBusy=false}
}
function schedule(delay){
 const run=()=>{if(!isActive())return;install();if(wrapped)render()};
 if(typeof w.setTimeout==='function')w.setTimeout(run,delay||0);
 else run();
}
function hookNavigation(){
 if(hooksReady)return;hooksReady=true;
 // The CRM lazy feature loader can render the original budgets view after a route change.
 // Listen to actual route and filter actions rather than relying only on a global wrapper.
 d.addEventListener('click',e=>{
  const btn=e.target.closest?.('#nav-budgets,#bn-budgets');
  if(btn){schedule(80);schedule(750)}
 },true);
 d.addEventListener('change',e=>{
  if(e.target?.matches?.('#budgets-manager-filter'))schedule(0);
 },true);
 d.addEventListener('input',e=>{
  if(e.target?.matches?.('#budgets-search'))schedule(0);
 },true);
 if(typeof w.addEventListener==='function')w.addEventListener('pageshow',()=>schedule(80));
 // Also responds when navigation is programmatic, e.g. restoring a tab after an auth refresh.
 const page=d.getElementById('page-budgets');
 if(page&&typeof w.MutationObserver==='function'){
  const obs=new w.MutationObserver(mutations=>{
   if(mutations.some(m=>m.attributeName==='class')&&isActive()){schedule(80);schedule(800)}
  });
  obs.observe(page,{attributes:true,attributeFilter:['class']});
 }
}
function install(){
 hookNavigation();
 if(wrapped){if(isActive())render();return}
 baseRender=w.renderBudgetsPage;
 baseDetail=w.openBudgetDetail;
 if(typeof baseRender!=='function'||typeof baseDetail!=='function'){
  lastRenderError='Базовый модуль бюджетов ещё не загружен';
  return; // Route events try again without polling.
 }
 const renderWrapper=function(){const out=baseRender.apply(this,arguments);render();return out};
 const detailWrapper=function(id){const out=baseDetail.apply(this,arguments);try{enhanceDetail(id)}catch(e){console.warn('Budgets360 history optional',e)}return out};
 w.renderBudgetsPage=renderWrapper;
 w.openBudgetDetail=detailWrapper;
 // Explicitly rebind the classic-script global identifier; async CRM routers can use it directly.
 try{renderBudgetsPage=renderWrapper}catch(_){}
 try{openBudgetDetail=detailWrapper}catch(_){}
 wrapped=true;
 if(isActive())render();
}
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',install,{once:true});else install();
w.RESANTA_BUDGETS360_V1=Object.freeze({version:'20261111.3-lera-ask',readOnly:true,existingFinanceMath:true,historyFromExistingAudit:true,install,refresh:()=>{install();render()},diagnostics:()=>({wrapped,active:isActive(),root:!!d.getElementById(TOP),renders:renderCount,error:lastRenderError})});
})(window,document);
