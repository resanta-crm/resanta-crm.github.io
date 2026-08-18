/* RESANTA CRM v23.4.1 · TRIOVIST AI PLANS — MOTIVATION ROOT
 * Only Triovist / 21vek.by: Александренко + Кришталь.
 * AI recommendation lives inside the existing "Мотивация" manager cards.
 * Uses existing triovist_set_plan storage through the existing plan editor.
 * AI never saves a plan automatically.
 * No SQL changes. Field-manager plans, GPS, routes and payments are untouched.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_AI_PLANS_V2341)return;

const VERSION='v23.4.1';
const GROWTH=0.30;
const ALEKS='aleksandrenko_av@resanta.ru';
const KRISHTAL='krishtal_na@resanta.ru';
const MANAGERS=[ALEKS,KRISHTAL];
const NAMES={[ALEKS]:'Александренко',[KRISHTAL]:'Кришталь'};
const BOSS_EMAILS=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
const calcCache=new Map();
const recommendations=new Map();
let renderTimer=0,pageObserver=null,observedPage=null,renderBusy=false;

const num=v=>Number(v)||0;
const email=()=>String(window.currentProfile?.email||window.currentUser?.email||'').trim().toLowerCase();
const isBoss=()=>window.currentProfile?.role==='boss'&&BOSS_EMAILS.has(email());
const isTriManager=()=>String(window.currentProfile?.access_scope||'').toLowerCase()==='triovist'&&MANAGERS.includes(email());
const money=v=>num(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const pct=v=>(num(v)*100).toFixed(1)+'%';
const escHtml=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

function ym(v){return String(v||'').slice(0,7);}
function shiftMonth(month,delta){
  if(!/^\d{4}-\d{2}$/.test(String(month||'')))return '';
  const d=new Date(Number(month.slice(0,4)),Number(month.slice(5,7))-1+delta,1);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function todayIso(){
  const t=String(window.TODAY||new Date().toISOString().slice(0,10));
  return /^\d{4}-\d{2}-\d{2}$/.test(t)?t:new Date().toISOString().slice(0,10);
}
function currentMonth(){return todayIso().slice(0,7);}
function dayOfMonth(){return Number(todayIso().slice(8,10))||1;}
function daysInMonth(month){
  if(!/^\d{4}-\d{2}$/.test(String(month||'')))return 30;
  return new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();
}
function selectedMonth(){return ym(document.getElementById('tri-period-month')?.value||currentMonth());}
function selectedMode(){return String(document.getElementById('tri-period-mode')?.value||'month');}
function ceilThousand(v){return Math.max(0,Math.ceil(num(v)/1000)*1000);}
function average(a){return a.length?a.reduce((s,v)=>s+num(v),0)/a.length:0;}
function weighted3(values){
  const a=(values||[]).slice(-3);
  if(!a.length)return 0;
  if(a.length===1)return a[0];
  if(a.length===2)return a[0]*0.35+a[1]*0.65;
  return a[0]*0.20+a[1]*0.30+a[2]*0.50;
}
function managerName(e){return NAMES[String(e||'').toLowerCase()]||String(e||'');}
function visibleManagers(){if(isBoss())return MANAGERS.slice();if(isTriManager())return [email()];return [];}

function runtimeSnapshot(){try{return window.TRIOVIST_RUNTIME_STATE_V227324?.snapshot?.()||{};}catch(_){return {};}}
function runtimeItems(){const s=runtimeSnapshot();return Array.isArray(s.salesItems)?s.salesItems:[];}
function rowsFor(items,manager){const e=String(manager||'').toLowerCase();return (items||[]).filter(r=>String(r?.manager_email||'').toLowerCase()===e);}
function sumRevenue(items,manager,field){return rowsFor(items,manager).reduce((s,r)=>s+num(r?.[field]),0);}
function currentFact(manager){return sumRevenue(runtimeItems(),manager,'current_revenue');}

function parseMoneyText(v){
  const s=String(v||'').replace(/\u00a0/g,' ').replace(/\s+/g,'').replace(',','.').replace(/[^0-9.-]/g,'');
  const n=Number(s);return Number.isFinite(n)?n:null;
}
function planInputFor(manager){
  return [...document.querySelectorAll('.tri-plan-input')].find(x=>String(x.dataset.email||'').toLowerCase()===String(manager||'').toLowerCase())||null;
}
function planFromInput(manager){
  const input=planInputFor(manager);if(!input)return null;
  const raw=String(input.value||'').trim();return raw?parseMoneyText(raw):null;
}
function planFromSummaryCard(manager){
  const e=String(manager||'').toLowerCase();
  const card=[...document.querySelectorAll('#tri-manager-cards .tri-manager-card')].find(x=>String(x.textContent||'').toLowerCase().includes(e));
  if(!card)return null;
  const metric=[...card.querySelectorAll('.tri-metric')].find(x=>String(x.querySelector('span')?.textContent||'').trim().toLowerCase()==='план');
  if(!metric)return null;
  const text=String(metric.querySelector('b')?.textContent||'');
  return /не задан/i.test(text)?null:parseMoneyText(text);
}
function currentPlan(manager){
  const p=planFromInput(manager);return p==null?planFromSummaryCard(manager):p;
}
function paceForecast(fact,month){
  const cur=currentMonth();
  if(month<cur)return fact;
  if(month>cur)return null;
  const elapsed=Math.min(dayOfMonth(),daysInMonth(month));
  return elapsed>0?fact/elapsed*daysInMonth(month):fact;
}

function aggregateGroups(items,manager){
  const map=new Map();
  rowsFor(items,manager).forEach(r=>{
    const group=String(r.assigned_group||r.category||'Не распределено').trim()||'Не распределено';
    if(!map.has(group))map.set(group,{group,cur:0,prev:0,skus:new Map()});
    const g=map.get(group);g.cur+=num(r.current_revenue);g.prev+=num(r.previous_revenue);
    const sku=String(r.sku||'').trim(),product=String(r.product||'').trim(),key=sku||product;
    if(!key)return;
    if(!g.skus.has(key))g.skus.set(key,{sku,product,cur:0,prev:0});
    const x=g.skus.get(key);x.cur+=num(r.current_revenue);x.prev+=num(r.previous_revenue);
  });
  return [...map.values()].map(g=>({...g,loss:Math.max(0,g.prev-g.cur),skuLoss:[...g.skus.values()].map(x=>({...x,loss:Math.max(0,x.prev-x.cur)})).filter(x=>x.loss>0).sort((a,b)=>b.loss-a.loss)})).filter(g=>g.loss>0).sort((a,b)=>b.loss-a.loss);
}
function gapSources(manager,gap){
  let left=Math.max(0,num(gap));const out=[];
  for(const g of aggregateGroups(runtimeItems(),manager)){
    if(left<=0)break;
    const use=Math.min(g.loss,left);left-=use;
    const sku=[];let skuLeft=use;
    for(const x of g.skuLoss){if(skuLeft<=0)break;const take=Math.min(x.loss,skuLeft);skuLeft-=take;sku.push({...x,use:take});}
    out.push({...g,use,sku});
  }
  return {items:out,covered:Math.max(0,num(gap)-left),uncovered:left};
}

async function monthDashboard(month){
  const key='month|'+month,now=Date.now(),cached=calcCache.get(key);
  if(cached&&now-cached.at<180000)return cached.data;
  const hub=window.TRIOVIST_DATA_HUB_V227315;if(!hub?.sales)throw new Error('Источник данных Triovist ещё не готов');
  const data=await hub.sales({p_end_month:month,p_mode:'month',p_start_month:null},{ttl:180000});
  calcCache.set(key,{at:Date.now(),data:data||{}});return data||{};
}
function revenueFromDashboard(d,manager,field='current_revenue'){return sumRevenue(Array.isArray(d?.items)?d.items:[],manager,field);}
async function calculateRecommendation(manager){
  const month=selectedMonth();if(!month)throw new Error('Не выбран месяц');
  const prevMonths=[shiftMonth(month,-3),shiftMonth(month,-2),shiftMonth(month,-1)];
  const [target,...previous]=await Promise.all([monthDashboard(month),...prevMonths.map(monthDashboard)]);
  const values=previous.map(d=>revenueFromDashboard(d,manager,'current_revenue'));
  const valid=values.filter(v=>v>0);if(valid.length<2)throw new Error('Недостаточно истории: нужны минимум 2 закрытых месяца продаж этого менеджера.');
  const avg3=average(valid),weighted=weighted3(values),operating=Math.max(avg3,weighted);
  const lastYear=revenueFromDashboard(target,manager,'previous_revenue');
  const base=Math.max(operating,lastYear);if(base<=0)throw new Error('Нет достаточной базы для расчёта плана.');
  const recommended=ceilThousand(base*(1+GROWTH));
  const fact=revenueFromDashboard(target,manager,'current_revenue');
  const forecast=month===currentMonth()?paceForecast(fact,month):(month<currentMonth()?fact:weighted);
  return {manager,month,prevMonths,values,avg3,weighted,operating,lastYear,base,recommended,fact,forecast,gap:Math.max(0,recommended-num(forecast)),calculatedAt:Date.now()};
}

function ensureCss(){
  let s=document.getElementById('tri-ai-plans-css-v2340');
  if(!s){s=document.createElement('style');s.id='tri-ai-plans-css-v2340';document.head.appendChild(s);}
  s.textContent=`
  .tri-ai-motivation{margin-top:12px;border:1px solid #BFDBFE;background:#F8FBFF;border-radius:11px;padding:11px 12px}
  .tri-ai-mot-head{display:flex;justify-content:space-between;align-items:flex-start;gap:9px;flex-wrap:wrap}.tri-ai-mot-title{font-weight:900;color:var(--at);font-size:13px}.tri-ai-version{font-size:9px;font-weight:700;color:var(--sub)}
  .tri-ai-note{font-size:10px;color:var(--sub);line-height:1.45}.tri-ai-mot-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.tri-ai-mot-actions button{padding:7px 10px;font-size:11px}
  .tri-ai-compare{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:9px}.tri-ai-compare>div{background:#fff;border:1px solid var(--border);border-radius:8px;padding:8px}.tri-ai-compare span{display:block;font-size:9px;color:var(--sub);text-transform:uppercase}.tri-ai-compare b{display:block;font-size:14px;margin-top:3px}
  .tri-ai-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-top:9px}.tri-ai-metrics>div{background:#fff;border-radius:8px;padding:7px;border:1px solid var(--border)}.tri-ai-metrics span{display:block;font-size:8px;text-transform:uppercase;color:var(--sub)}.tri-ai-metrics b{display:block;font-size:11px;margin-top:3px}
  .tri-ai-gap{margin-top:9px}.tri-ai-gap-head{display:flex;justify-content:space-between;gap:9px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:8px}.tri-ai-reserve{text-align:right;white-space:nowrap}.tri-ai-reserve span{display:block;font-size:8px;text-transform:uppercase;color:var(--sub)}.tri-ai-reserve b{font-size:13px}
  .tri-ai-source-list{display:grid;gap:5px;margin-top:6px}.tri-ai-source{border:1px solid var(--border);background:#fff;border-radius:8px;padding:6px 8px}.tri-ai-source summary{cursor:pointer;display:flex;justify-content:space-between;gap:8px;font-size:10px}.tri-ai-skus{display:grid;gap:3px;margin-top:5px}.tri-ai-skus>div{display:flex;justify-content:space-between;gap:9px;border-top:1px dashed var(--border);padding-top:3px;font-size:9px;color:var(--sub)}.tri-ai-skus b{color:var(--text);white-space:nowrap}
  .tri-ai-ok{background:#F0FDF4;border:1px solid #BBF7D0;color:#166534;border-radius:8px;padding:7px 8px;font-size:10px}.tri-ai-warn{background:#FFFBEB;border:1px solid #FDE68A;color:#92400E;border-radius:8px;padding:7px 8px;font-size:10px;margin-top:6px}.tri-ai-error{color:var(--r);font-size:10px;margin-top:6px}
  @media(max-width:900px){.tri-ai-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.tri-ai-compare{grid-template-columns:1fr}}
  `;
}

function motivationCardFor(manager){
  const needle=managerName(manager).toLowerCase();
  return [...document.querySelectorAll('#tri-mot-grid .tri-mot-manager')].find(c=>String(c.textContent||'').toLowerCase().includes(needle))||null;
}
function gapHtml(manager,gap){
  if(gap<=0)return '<div class="tri-ai-ok">✅ Текущий прогноз уже покрывает утверждённый план.</div>';
  const src=gapSources(manager,gap);
  return '<div class="tri-ai-gap-head"><div><b>🎯 Где взять недостающее</b><div class="tri-ai-note">Разрыв план–прогноз: <b>'+money(gap)+'</b>. Только группы и SKU '+escHtml(managerName(manager))+'.</div></div><div class="tri-ai-reserve"><span>Найдено</span><b>'+money(src.covered)+'</b></div></div>'+
    (src.items.length?'<div class="tri-ai-source-list">'+src.items.slice(0,6).map(g=>'<details class="tri-ai-source"><summary><span><b>'+escHtml(g.group)+'</b></span><b>+'+money(g.use)+'</b></summary>'+(g.sku.length?'<div class="tri-ai-skus">'+g.sku.slice(0,5).map(x=>'<div><span>'+escHtml((x.sku?x.sku+' · ':'')+(x.product||'SKU'))+'</span><b>+'+money(x.use)+'</b></div>').join('')+'</div>':'')+'</details>').join('')+'</div>':'<div class="tri-ai-warn">В текущих падающих/потерянных позициях подтверждённый резерв не найден.</div>')+
    (src.uncovered>1?'<div class="tri-ai-warn"><b>Ещё не обеспечено: '+money(src.uncovered)+'.</b> Эту часть нужно закрывать дополнительным ростом действующих позиций или новым оборотом.</div>':'');
}
function panelHtml(manager){
  const month=selectedMonth(),plan=currentPlan(manager),fact=currentFact(manager),forecast=paceForecast(fact,month);
  const progress=plan&&plan>0?fact/plan:0,gap=plan&&plan>0?(forecast==null?Math.max(0,plan-fact):Math.max(0,plan-forecast)):0;
  const rec=recommendations.get(manager),boss=isBoss();
  const btn=boss?'<button type="button" class="btn-secondary tri-ai-calc-btn" data-email="'+manager+'" onclick="triovistAiCalculatePlanV2341(\''+manager+'\')">🤖 Рассчитать ИИ</button>':'';
  let recBlock='';
  if(rec?.error){recBlock='<div class="tri-ai-error">'+escHtml(rec.error)+'</div>';}
  else if(rec&&rec.month===month){
    recBlock='<div class="tri-ai-compare"><div><span>Текущий утверждённый план</span><b>'+(plan&&plan>0?money(plan):'Не задан')+'</b></div><div><span>Рекомендация ИИ</span><b>'+money(rec.recommended)+'</b></div></div>'+
      '<div class="tri-ai-note" style="margin-top:6px">База: <b>'+money(rec.base)+'</b> → минимум <b>+30%</b>. Среднее закрытых месяцев: '+money(rec.avg3)+'; взвешенный темп: '+money(rec.weighted)+'; аналогичный месяц прошлого года: '+money(rec.lastYear)+'.</div>'+
      (boss?'<div class="tri-ai-mot-actions" style="margin-top:7px"><button type="button" class="btn-primary" onclick="triovistAiApplyRecommendationV2341(\''+manager+'\')">Применить рекомендацию к плану</button><span class="tri-ai-note">Это только подставит сумму. Сам ИИ план не сохраняет.</span></div>':'');
  }else{
    recBlock='<div class="tri-ai-note" style="margin-top:6px">'+(boss?'Нажмите «Рассчитать ИИ»: CRM сравнит последние закрытые месяцы и аналогичный месяц прошлого года, затем предложит план с ростом минимум +30%.':'Рекомендацию ИИ рассчитывает и утверждает руководитель.')+'</div>';
  }
  const metrics=plan&&plan>0?'<div class="tri-ai-metrics"><div><span>План</span><b>'+money(plan)+'</b></div><div><span>Факт</span><b>'+money(fact)+'</b></div><div><span>Выполнение</span><b>'+pct(progress)+'</b></div><div><span>Прогноз месяца</span><b>'+(forecast==null?'после старта':money(forecast))+'</b></div><div><span>Разрыв</span><b>'+money(gap)+'</b></div></div><div class="tri-ai-gap">'+gapHtml(manager,gap)+'</div>':'<div class="tri-ai-warn">Месячный план ещё не задан. После утверждения здесь появятся прогноз и «Где взять недостающее».</div>';
  return '<div class="tri-ai-mot-head"><div><div class="tri-ai-mot-title">🤖 ИИ-план · '+escHtml(managerName(manager))+' <span class="tri-ai-version">'+VERSION+'</span></div><div class="tri-ai-note">'+escHtml(month)+' · рекомендация руководителю, без автоматического сохранения</div></div><div class="tri-ai-mot-actions">'+btn+'</div></div>'+recBlock+metrics;
}

function cleanupOldUi(){
  document.getElementById('tri-ai-plan-status-v2340')?.remove();
  document.querySelectorAll('#tri-plan-editor .tri-ai-calc').forEach(x=>x.remove());
  document.querySelectorAll('#tri-plans-card .tri-ai-version').forEach(x=>x.remove());
}
function markMotivationVersion(){
  const card=document.getElementById('tri-motivation-card'),title=card?.querySelector('.card-title');if(!title)return;
  let tag=title.querySelector('.tri-ai-mot-version');
  if(!tag){tag=document.createElement('span');tag.className='tri-ai-mot-version';tag.style.cssText='font-size:9px;color:var(--sub);font-weight:700;margin-left:5px';title.appendChild(tag);}
  tag.textContent='· ИИ '+VERSION;
}
function renderMotivationAi(){
  if(renderBusy)return;renderBusy=true;
  try{
    cleanupOldUi();ensureCss();markMotivationVersion();
    const grid=document.getElementById('tri-mot-grid');if(!grid)return;
    if(selectedMode()!=='month'){grid.querySelectorAll('.tri-ai-motivation').forEach(x=>x.remove());return;}
    const visible=new Set(visibleManagers());
    grid.querySelectorAll('.tri-ai-motivation').forEach(p=>{if(!visible.has(String(p.dataset.email||'').toLowerCase()))p.remove();});
    visible.forEach(manager=>{
      const card=motivationCardFor(manager);if(!card)return;
      let panel=card.querySelector('.tri-ai-motivation[data-email="'+manager+'"]');
      if(!panel){panel=document.createElement('div');panel.className='tri-ai-motivation';panel.dataset.email=manager;const anchor=card.querySelector('.tri-mot-planline');if(anchor)anchor.insertAdjacentElement('afterend',panel);else card.appendChild(panel);}
      const html=panelHtml(manager);if(panel.innerHTML!==html)panel.innerHTML=html;
    });
  }catch(e){console.warn('Triovist AI plans '+VERSION,e);}finally{renderBusy=false;}
}
function scheduleRender(delay=40){clearTimeout(renderTimer);renderTimer=setTimeout(()=>{renderMotivationAi();watchPage();},delay);}
function watchPage(){
  const page=document.getElementById('page-triovist');if(!page||page===observedPage)return;
  pageObserver?.disconnect();observedPage=page;
  pageObserver=new MutationObserver(()=>{if(document.getElementById('page-triovist')?.classList.contains('active'))scheduleRender(50);});
  pageObserver.observe(page,{childList:true,subtree:true});
}

window.triovistAiCalculatePlanV2341=async function(manager){
  manager=String(manager||'').toLowerCase();if(!isBoss()||!MANAGERS.includes(manager))return;
  const card=motivationCardFor(manager),btn=card?.querySelector('.tri-ai-calc-btn');
  if(btn){btn.disabled=true;btn.textContent='Считаю…';}
  try{const r=await calculateRecommendation(manager);recommendations.set(manager,r);}
  catch(e){recommendations.set(manager,{manager,month:selectedMonth(),error:'Не удалось рассчитать: '+String(e?.message||e)});}
  finally{if(btn){btn.disabled=false;btn.textContent='🤖 Рассчитать ИИ';}scheduleRender(0);}
};
window.triovistAiCalculatePlanV2340=window.triovistAiCalculatePlanV2341;

window.triovistAiApplyRecommendationV2341=function(manager){
  manager=String(manager||'').toLowerCase();if(!isBoss()||!MANAGERS.includes(manager))return;
  const r=recommendations.get(manager);if(!r||r.error||r.month!==selectedMonth())return;
  const input=planInputFor(manager);
  if(!input){alert('Поле месячного плана ещё не готово. Откройте вкладку «Настройки» один раз и повторите.');return;}
  input.value=num(r.recommended).toFixed(2).replace('.',',');input.dispatchEvent(new Event('input',{bubbles:true}));scheduleRender(0);
  alert('Рекомендация '+money(r.recommended)+' подставлена в план '+managerName(manager)+'.\n\nИИ ничего не сохранил автоматически. Для фиксации используйте существующую кнопку «Сохранить планы».');
};

function wrapRenderTriovist(){
  const base=window.renderTriovist;if(typeof base!=='function'||base.__triAiMotV2341)return;
  const wrapped=function(){const r=base.apply(this,arguments);scheduleRender(0);return r;};
  wrapped.__triAiMotV2341=true;window.renderTriovist=wrapped;try{renderTriovist=wrapped;}catch(_){}
}
function boot(){
  wrapRenderTriovist();watchPage();scheduleRender(0);
  document.addEventListener('click',e=>{const tab=e.target?.closest?.('[data-tab="motivation"]');if(tab)scheduleRender(120);});
  window.addEventListener('focus',()=>{if(document.getElementById('page-triovist')?.classList.contains('active'))scheduleRender(30);});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();

window.RESANTA_TRIOVIST_AI_PLANS_V2340=Object.freeze({version:VERSION,compat:true});
window.RESANTA_TRIOVIST_AI_PLANS_V2341=Object.freeze({version:VERSION,growthMin:GROWTH,managers:MANAGERS.slice(),motivationRoot:true,noAutoSave:true,noSqlChanges:true,fieldManagerLogicUntouched:true});
})();
