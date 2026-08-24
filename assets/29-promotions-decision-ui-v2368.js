/* RESANTA CRM v23.6.8 · PROMOTIONS: DIRECTOR DECISION UI
 * UI-only safety layer:
 * - does NOT change 1C import, promotion rows, budget movements or approval transitions;
 * - makes the current approver / requested budget / budget after approval explicit;
 * - hides execution-only blocks while a promotion is still being approved;
 * - does not present future or unfinished-period sales as a final negative result;
 * - adds a compact director budget overview including pending requests.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_DECISION_UI_V2368)return;
const VERSION='v23.6.8';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0;};
const money=v=>num(v).toLocaleString('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:2})+' BYN';
const today=()=>String((typeof TODAY!=='undefined'&&TODAY)||new Date().toISOString().slice(0,10));
const isBoss=()=>{try{return typeof promoIsBoss==='function'&&promoIsBoss();}catch(_){return false;}};
function actualStatus(p){try{return promoActualStatus(p);}catch(_){return String(p?.status||'');}}
function periodState(p){const d=today(),s=String(p?.start_date||''),e=String(p?.end_date||'');return !s||!e?'unknown':d<s?'future':d>e?'ended':'running';}
function metric(p){try{return promoMetric(p);}catch(_){return{sales:0,base:0,plan:num(p?.sales_plan),completion:0,additional:0};}}
function budgetRow(p){try{return promoBudgetRow(p);}catch(_){return null;}}
function budgetSummary(b,exclude){try{return promoBudgetSummary(b,exclude);}catch(_){return null;}}
function canAct(p){try{return (typeof promoCanSubmitManager==='function'&&promoCanSubmitManager(p))||(typeof promoCanFirstApprove==='function'&&promoCanFirstApprove(p))||(typeof promoCanFinalApprove==='function'&&promoCanFinalApprove(p))||(typeof promoCanAcceptWork==='function'&&promoCanAcceptWork(p));}catch(_){return false;}}
function actionMeta(p){
  try{if(typeof promoCanSubmitManager==='function'&&promoCanSubmitManager(p))return{action:'submit_manager',label:'✅ Подтвердить заявку',stage:'Менеджер'};}catch(_){}
  try{if(typeof promoCanFirstApprove==='function'&&promoCanFirstApprove(p))return{action:'approve_df',label:'✅ Согласовать ДФ',stage:'Сидорович'};}catch(_){}
  try{if(typeof promoCanFinalApprove==='function'&&promoCanFinalApprove(p))return{action:'approve_dfs',label:'✅ Финально согласовать',stage:'Паюшин'};}catch(_){}
  try{if(typeof promoCanAcceptWork==='function'&&promoCanAcceptWork(p))return{action:'accept',label:'▶ Взять в работу',stage:'Менеджер'};}catch(_){}
  return null;
}
function currentStageCode(p){const s=actualStatus(p);return s==='draft_manager'?1:s==='pending_df'?2:s==='pending_dfs'?3:(s==='approved'||s==='waiting_manager')?4:0;}
function chainHtml(p){
  const current=currentStageCode(p);
  const stages=[
    {n:1,title:'Менеджер',done:!!p.manager_submitted_at,who:p.manager_submitted_by},
    {n:2,title:'Сидорович',done:!!p.df_approved_at,who:p.df_approved_by},
    {n:3,title:'Паюшин',done:!!p.dfs_approved_at,who:p.dfs_approved_by},
    {n:4,title:'В работу',done:!!p.manager_accepted_at,who:p.manager_accepted_by}
  ];
  return '<div class="promo-v2368-chain">'+stages.map(x=>{
    const active=x.n===current&&!x.done,cls=x.done?'done':active?'active':'wait';
    return '<div class="promo-v2368-stage '+cls+'"><div class="promo-v2368-stage-icon">'+(x.done?'✓':x.n)+'</div><div><b>'+esc(x.title)+'</b><div>'+(x.done?esc(x.who||'Согласовано'):active?'ВАШ ХОД':'Ожидает')+'</div></div></div>';
  }).join('')+'</div>';
}
function salesDecisionHtml(p){
  const m=metric(p),state=periodState(p),plan=num(p.sales_plan);
  let title='Итог акции',note='',delta='';
  if(state==='future'){
    title='Акция ещё не началась';
    note='Историческая база: '+money(m.base)+'. Факт начнёт считаться после старта акции.';
  }else if(state==='running'){
    title='Промежуточный факт 1С: '+money(m.sales);
    note='Период акции ещё не завершён. Историческая база всей акции: '+money(m.base)+'. Итоговую эффективность сейчас не считаем.';
  }else{
    title='Факт продаж: '+money(m.sales);
    const d=num(m.sales)-num(m.base);delta='<div class="'+(d>=0?'promo-v2368-good':'promo-v2368-bad')+'">Изменение к базе: '+(d>=0?'+':'')+money(d)+'</div>';
    note='Историческая база: '+money(m.base)+'.';
  }
  return '<div class="promo-v2368-box"><div class="promo-v2368-kicker">ПРОДАЖИ</div><div class="promo-v2368-main">'+esc(title)+'</div>'+delta+'<div class="promo-v2368-note">'+esc(note)+'</div><div class="promo-v2368-plan">'+(plan>0?'План: <b>'+money(plan)+'</b> · выполнение '+Math.round(num(m.completion))+'%':'<b>План продаж не задан</b>')+'</div></div>';
}
function budgetDecisionHtml(p){
  const requested=num(p.requested_budget),b=budgetRow(p);
  if(!b)return '<div class="promo-v2368-box"><div class="promo-v2368-kicker">БЮДЖЕТ</div><div class="promo-v2368-main">Запрос: '+money(requested)+'</div><div class="promo-v2368-note">Бюджет клиента к акции не привязан.</div></div>';
  const s=budgetSummary(b,p.id);
  if(!s)return '';
  const before=num(s.free),after=before-requested;
  return '<div class="promo-v2368-box"><div class="promo-v2368-kicker">ЧТО СТАНЕТ С БЮДЖЕТОМ</div><div class="promo-v2368-budget-grid">'
    +'<div><span>Всего</span><b>'+money(s.total)+'</b></div>'
    +'<div><span>Потрачено</span><b>'+money(s.spent)+'</b></div>'
    +'<div><span>Уже резерв</span><b>'+money(s.reserved)+'</b></div>'
    +'<div class="request"><span>Эта заявка</span><b>− '+money(requested)+'</b></div>'
    +'<div class="after"><span>Останется</span><b>'+money(after)+'</b></div>'
    +'</div>'+(after<0?'<div class="promo-v2368-bad">⚠ Заявка превышает свободный бюджет на '+money(Math.abs(after))+'</div>':'')+'</div>';
}
function scopeText(p){try{return typeof promoScopeLabel==='function'?promoScopeLabel(p):'';}catch(_){return '';}}
function approvalDecisionHtml(p){
  const a=actionMeta(p),status=actualStatus(p);
  const approval=['draft_manager','pending_df','pending_dfs','approved','waiting_manager'].includes(status);
  if(!approval)return '';
  return '<div class="promo-v2368-decision">'
    +'<div class="promo-v2368-title">'+(a?'Сейчас нужно решение: '+esc(a.stage):'Маршрут согласования')+'</div>'
    +chainHtml(p)
    +'<div class="promo-v2368-what"><div><span>Клиент</span><b>'+esc(p.client_name||'—')+'</b></div><div><span>Менеджер</span><b>'+esc(p.manager_name||'—')+'</b></div><div><span>Период</span><b>'+esc(p.start_date||'—')+' → '+esc(p.end_date||'—')+'</b></div><div><span>Запрашиваемый бюджет</span><b>'+money(p.requested_budget)+'</b></div></div>'
    +(p.mechanics?'<div class="promo-v2368-line"><b>Механика:</b> '+esc(p.mechanics)+'</div>':'')
    +(scopeText(p)?'<div class="promo-v2368-line"><b>Товары:</b> '+esc(scopeText(p))+'</div>':'')
    +'<div class="promo-v2368-two">'+salesDecisionHtml(p)+budgetDecisionHtml(p)+'</div>'
    +(a?'<div class="promo-v2368-actions"><button class="btn-primary" data-v2368-action="'+esc(a.action)+'" data-v2368-id="'+esc(p.id)+'">'+esc(a.label)+'</button>'
      +((a.action==='approve_df'||a.action==='approve_dfs')?'<button class="btn-secondary" data-v2368-action="reject" data-v2368-id="'+esc(p.id)+'">❌ Отклонить</button>':'')
      +'<button class="btn-secondary" data-v2368-edit="'+esc(p.id)+'">✏️ Изменить</button></div>':'')
    +'</div>';
}
function hideApprovalNoise(body,p){
  const st=actualStatus(p);if(!['draft_manager','pending_df','pending_dfs','approved','waiting_manager'].includes(st))return;
  body.querySelectorAll('.promo-grid').forEach((x,i)=>{if(i===0)x.style.display='none';});
  body.querySelectorAll('.card').forEach(c=>{const t=String(c.textContent||'').trim();if(/^Оценка:/i.test(t)||/Фотографии/i.test(t)||/^Итоговый отчёт/i.test(t))c.style.display='none';});
  body.querySelectorAll('button').forEach(btn=>{const t=String(btn.textContent||'').trim();if(/Добавить расход|Итоговый отчёт|Финально согласовать|Согласовать ДФ|Взять в работу|Отклонить/i.test(t)){const wrap=btn.parentElement;if(wrap&&wrap.querySelectorAll('button').length>=2)wrap.style.display='none';}});
}
function decorateDetail(id){
  const p=(window.allPromotions||[]).find?.(x=>String(x.id)===String(id))||(typeof allPromotions!=='undefined'?allPromotions.find(x=>String(x.id)===String(id)):null);if(!p)return;
  const body=document.getElementById('promotion-detail-body');if(!body)return;
  body.querySelector('#promo-v2368-decision')?.remove();
  hideApprovalNoise(body,p);
  const html=approvalDecisionHtml(p);
  if(html){const host=document.createElement('div');host.id='promo-v2368-decision';host.innerHTML=html;body.insertBefore(host,body.firstChild);}
  if(periodState(p)!=='ended'){
    body.querySelectorAll('.promo-stat').forEach(s=>{const t=String(s.textContent||'');if(/Продажи аналогичного периода прошлого года/i.test(t)){s.innerHTML='<div class="promo-stat-label">Историческая база</div><div class="promo-stat-value">'+money(metric(p).base)+'</div><div style="font-size:10px;color:var(--sub);line-height:1.35;margin-top:4px">'+(periodState(p)==='future'?'Акция ещё не началась — падение не рассчитывается.':'Период ещё не завершён — итоговое изменение не рассчитывается.')+'</div>';}});
  }
  if(num(p.sales_plan)<=0)body.querySelectorAll('.promo-stat').forEach(s=>{if(/План \/ выполнение/i.test(String(s.textContent||'')))s.innerHTML='<div class="promo-stat-label">План</div><div class="promo-stat-value">Не задан</div>';});
}
function pendingForBudget(b){
  const promos=typeof allPromotions!=='undefined'?allPromotions:[];
  return promos.filter(p=>String(p.budget_id)===String(b.id)&&['draft_manager','pending_df','pending_dfs'].includes(actualStatus(p))).reduce((s,p)=>s+num(p.requested_budget),0);
}
function directorPanel(){
  if(!isBoss())return;
  const page=document.getElementById('page-promotions')||document.querySelector('[data-page="promotions"]');if(!page)return;
  let host=document.getElementById('promo-v2368-director');
  if(!host){host=document.createElement('div');host.id='promo-v2368-director';const anchor=document.getElementById('promo-list')||page.firstElementChild;anchor?.parentNode?.insertBefore(host,anchor);}
  const promos=typeof allPromotions!=='undefined'?allPromotions:[];
  const actionable=promos.filter(canAct),inWork=promos.filter(p=>['approved','in_work'].includes(String(p.status||''))).length;
  const budgets=typeof allPromotionBudgets!=='undefined'?allPromotionBudgets:[];
  const rows=budgets.map(b=>{const s=budgetSummary(b);if(!s)return null;const pending=pendingForBudget(b),after=num(s.free)-pending;return{b,s,pending,after};}).filter(Boolean).sort((a,b)=>(b.pending>0)-(a.pending>0)||String(a.b.client_name||'').localeCompare(String(b.b.client_name||''),'ru'));
  host.innerHTML='<div class="promo-v2368-dashboard"><button class="promo-v2368-tab primary" data-v2368-open-action>✅ Нужно моё решение <b>'+actionable.length+'</b></button><button class="promo-v2368-tab" data-v2368-work>🚀 В работе <b>'+inWork+'</b></button><button class="promo-v2368-tab" data-v2368-budget-toggle>💰 Бюджеты</button></div>'
    +(actionable.length?'<div class="promo-v2368-action-list">'+actionable.map(p=>'<button data-v2368-open="'+esc(p.id)+'"><b>'+esc(p.client_name||'Клиент')+'</b><span>'+esc(p.title||'Акция')+' · '+money(p.requested_budget)+'</span></button>').join('')+'</div>':'')
    +'<div id="promo-v2368-budgets" class="promo-v2368-budgets" style="display:none"><div class="promo-v2368-budget-head"><b>Бюджеты клиентов</b><span>Всего → потрачено → резерв → на согласовании → останется</span></div>'+(rows.length?rows.map(x=>'<div class="promo-v2368-budget-row"><div><b>'+esc(x.b.client_name||'Клиент')+'</b></div><div>'+money(x.s.total)+'</div><div>'+money(x.s.spent)+'</div><div>'+money(x.s.reserved)+'</div><div class="pending">'+money(x.pending)+'</div><div class="'+(x.after<0?'bad':'free')+'">'+money(x.after)+'</div></div>').join(''):'<div class="promo-v2368-note">Бюджетов нет.</div>')+'</div>';
}
function decorateList(){
  const list=document.getElementById('promo-list');if(!list)return;
  list.querySelectorAll('.promo-card').forEach(card=>{
    const btn=[...card.querySelectorAll('button')].find(b=>/Открыть/i.test(b.textContent||''));const oc=btn?.getAttribute('onclick')||'';const m=oc.match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);if(!m)return;
    const p=(typeof allPromotions!=='undefined'?allPromotions:[]).find(x=>String(x.id)===m[0]);if(!p)return;
    if(periodState(p)!=='ended')card.querySelectorAll('.promo-stat').forEach(s=>{if(/Продажи аналогичного периода прошлого года/i.test(String(s.textContent||'')))s.innerHTML='<div class="promo-stat-label">Историческая база</div><div class="promo-stat-value">'+money(metric(p).base)+'</div><div style="font-size:10px;color:var(--sub);margin-top:4px">'+(periodState(p)==='future'?'Акция ещё не началась':'Период ещё не завершён — без итогового падения')+'</div>';});
    if(num(p.sales_plan)<=0)card.querySelectorAll('.promo-stat').forEach(s=>{if(/^План/i.test(String(s.textContent||'').trim()))s.innerHTML='<div class="promo-stat-label">План</div><div class="promo-stat-value">Не задан</div>';});
  });
}
function bindClicks(){
  document.addEventListener('click',e=>{
    const action=e.target?.closest?.('[data-v2368-action]');if(action){const id=action.dataset.v2368Id,a=action.dataset.v2368Action;if(typeof quickPromotionDecision==='function')quickPromotionDecision(id,a);return;}
    const edit=e.target?.closest?.('[data-v2368-edit]');if(edit){try{closeModal('modal-promotion-detail');openPromotionEditor(edit.dataset.v2368Edit);}catch(_){}return;}
    const open=e.target?.closest?.('[data-v2368-open]');if(open){try{openPromotionDetail(open.dataset.v2368Open);}catch(_){}return;}
    if(e.target?.closest?.('[data-v2368-open-action]')){const p=(typeof allPromotions!=='undefined'?allPromotions:[]).find(canAct);if(p)openPromotionDetail(p.id);return;}
    if(e.target?.closest?.('[data-v2368-budget-toggle]')){const x=document.getElementById('promo-v2368-budgets');if(x)x.style.display=x.style.display==='none'?'block':'none';return;}
    if(e.target?.closest?.('[data-v2368-work]')){const f=document.getElementById('promo-status-filter');if(f){f.value='active_now';try{renderPromotions();}catch(_){}}}
  },true);
}
function css(){if(document.getElementById('promo-v2368-css'))return;const s=document.createElement('style');s.id='promo-v2368-css';s.textContent=`
#promo-v2368-director{margin:0 0 16px}.promo-v2368-dashboard{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px}.promo-v2368-tab{border:1px solid var(--border);background:#fff;border-radius:12px;padding:12px 16px;font-size:14px;cursor:pointer}.promo-v2368-tab.primary{background:#EFF6FF;border-color:#93C5FD;color:#1D4ED8}.promo-v2368-tab b{margin-left:8px}.promo-v2368-action-list{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.promo-v2368-action-list button{display:flex;flex-direction:column;align-items:flex-start;gap:3px;border:1px solid #93C5FD;background:#fff;border-radius:10px;padding:10px 12px;cursor:pointer}.promo-v2368-action-list span{font-size:11px;color:var(--sub)}.promo-v2368-budgets{background:#fff;border:1px solid var(--border);border-radius:14px;padding:12px;margin-bottom:14px}.promo-v2368-budget-head{display:flex;justify-content:space-between;gap:10px;margin-bottom:8px;color:var(--sub);font-size:11px}.promo-v2368-budget-head b{color:var(--text);font-size:14px}.promo-v2368-budget-row{display:grid;grid-template-columns:minmax(220px,1.4fr) repeat(5,minmax(100px,.7fr));gap:8px;padding:9px 4px;border-top:1px solid var(--border);align-items:center;font-size:12px}.promo-v2368-budget-row .pending{color:#B45309;font-weight:700}.promo-v2368-budget-row .free{color:#166534;font-weight:800}.promo-v2368-budget-row .bad{color:#B91C1C;font-weight:800}.promo-v2368-decision{border:2px solid #93C5FD;background:#F8FBFF;border-radius:16px;padding:16px;margin-bottom:14px}.promo-v2368-title{font-size:18px;font-weight:800;margin-bottom:12px}.promo-v2368-chain{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}.promo-v2368-stage{display:flex;gap:8px;align-items:center;padding:10px;border:1px solid var(--border);border-radius:11px;background:#fff}.promo-v2368-stage-icon{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;background:#F3F4F6}.promo-v2368-stage div:last-child div{font-size:10px;color:var(--sub);margin-top:2px}.promo-v2368-stage.done{border-color:#BBF7D0;background:#F0FDF4}.promo-v2368-stage.done .promo-v2368-stage-icon{background:#DCFCE7;color:#166534}.promo-v2368-stage.active{border-color:#60A5FA;background:#EFF6FF}.promo-v2368-stage.active .promo-v2368-stage-icon{background:#2563EB;color:#fff}.promo-v2368-stage.active div:last-child div{color:#1D4ED8;font-weight:800}.promo-v2368-what{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px}.promo-v2368-what>div{background:#fff;border:1px solid var(--border);border-radius:10px;padding:10px}.promo-v2368-what span{display:block;font-size:10px;color:var(--sub);margin-bottom:4px}.promo-v2368-what b{font-size:13px}.promo-v2368-line{font-size:12px;margin:6px 0}.promo-v2368-two{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.promo-v2368-box{background:#fff;border:1px solid var(--border);border-radius:12px;padding:12px}.promo-v2368-kicker{font-size:10px;color:var(--sub);font-weight:800;letter-spacing:.04em}.promo-v2368-main{font-size:17px;font-weight:800;margin:5px 0}.promo-v2368-note{font-size:11px;color:var(--sub);line-height:1.45}.promo-v2368-plan{font-size:12px;margin-top:8px}.promo-v2368-good{color:#166534;font-weight:800;margin-top:4px}.promo-v2368-bad{color:#B91C1C;font-weight:800;margin-top:4px}.promo-v2368-budget-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:7px}.promo-v2368-budget-grid>div{padding:8px;background:#F9FAFB;border-radius:8px}.promo-v2368-budget-grid span{display:block;font-size:9px;color:var(--sub);margin-bottom:4px}.promo-v2368-budget-grid b{font-size:12px}.promo-v2368-budget-grid .request{background:#FFF7ED}.promo-v2368-budget-grid .after{background:#F0FDF4}.promo-v2368-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}.promo-v2368-actions button{min-height:44px;padding:10px 16px}
@media(max-width:800px){.promo-v2368-chain,.promo-v2368-what,.promo-v2368-two{grid-template-columns:1fr 1fr}.promo-v2368-budget-row{grid-template-columns:1fr 1fr}.promo-v2368-budget-head span{display:none}.promo-v2368-budget-grid{grid-template-columns:1fr 1fr}}@media(max-width:520px){.promo-v2368-chain,.promo-v2368-what,.promo-v2368-two{grid-template-columns:1fr}.promo-v2368-budget-grid{grid-template-columns:1fr 1fr}}
`;document.head.appendChild(s);}
function install(){
  if(window.RESANTA_PROMOTIONS_DECISION_UI_V2368)return true;
  if(typeof window.renderPromotions!=='function'||typeof window.openPromotionDetail!=='function'||typeof window.quickPromotionDecision!=='function')return false;
  css();bindClicks();
  const baseRender=window.renderPromotions;window.renderPromotions=function(){const r=baseRender.apply(this,arguments);setTimeout(()=>{try{directorPanel();decorateList();}catch(e){console.warn(VERSION+' render decorate',e);}},0);return r;};try{renderPromotions=window.renderPromotions;}catch(_){}
  const baseOpen=window.openPromotionDetail;window.openPromotionDetail=function(id){const r=baseOpen.apply(this,arguments);setTimeout(()=>{try{decorateDetail(id);}catch(e){console.warn(VERSION+' detail decorate',e);}},0);return r;};try{openPromotionDetail=window.openPromotionDetail;}catch(_){}
  window.RESANTA_PROMOTIONS_DECISION_UI_V2368=Object.freeze({version:VERSION,uiOnly:true,oneCImportUntouched:true,budgetDataUntouched:true,approvalTransitionsUntouched:true,unfinishedPeriodNoFalseNegative:true,directorBudgetAfterApproval:true});
  try{window.renderPromotions();}catch(_){}
  console.info('RESANTA promotions decision UI '+VERSION+' installed');return true;
}
if(!install()){let tries=0;const t=setInterval(()=>{tries++;if(install()||tries>=60)clearInterval(t);},250);}
})();
