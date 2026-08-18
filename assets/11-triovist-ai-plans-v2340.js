/* RESANTA CRM v23.4.0 · TRIOVIST AI PLANS
 * Only Triovist / 21vek.by: Александренко + Кришталь.
 * Adds AI recommendation, plan/fact/progress, pace forecast and "Где взять недостающее".
 * Reuses existing triovist_set_plan via the existing Save Plans button.
 * No SQL changes. No changes to field-manager plans, GPS, routes or payments.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_AI_PLANS_V2340)return;

const VERSION='v23.4.0';
const GROWTH=0.30;
const ALEKS='aleksandrenko_av@resanta.ru';
const KRISHTAL='krishtal_na@resanta.ru';
const MANAGERS=[ALEKS,KRISHTAL];
const NAMES={
  [ALEKS]:'Александренко',
  [KRISHTAL]:'Кришталь'
};
const BOSS_EMAILS=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
const calcCache=new Map();

const num=v=>Number(v)||0;
const email=()=>String(window.currentProfile?.email||window.currentUser?.email||'').trim().toLowerCase();
const isBoss=()=>window.currentProfile?.role==='boss'&&BOSS_EMAILS.has(email());
const isTriManager=()=>String(window.currentProfile?.access_scope||'').toLowerCase()==='triovist'&&MANAGERS.includes(email());
const money=v=>Math.round(num(v)).toLocaleString('ru-RU')+' BYN';
const money2=v=>num(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
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
function daysInMonth(month){
  if(!/^\d{4}-\d{2}$/.test(String(month||'')))return 30;
  return new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();
}
function dayOfMonth(){return Number(todayIso().slice(8,10))||1;}
function currentMonth(){return todayIso().slice(0,7);}
function ceilThousand(v){return Math.max(0,Math.ceil(num(v)/1000)*1000);}
function weighted3(values){
  const a=(values||[]).slice(-3);
  if(!a.length)return 0;
  if(a.length===1)return a[0];
  if(a.length===2)return a[0]*0.35+a[1]*0.65;
  return a[0]*0.20+a[1]*0.30+a[2]*0.50;
}
function average(values){return values.length?values.reduce((s,v)=>s+num(v),0)/values.length:0;}
function managerName(e){return NAMES[String(e||'').toLowerCase()]||String(e||'');}
function selectedMonth(){return ym(document.getElementById('tri-period-month')?.value||currentMonth());}
function selectedMode(){return String(document.getElementById('tri-period-mode')?.value||'month');}

function runtimeSnapshot(){
  try{return window.TRIOVIST_RUNTIME_STATE_V227324?.snapshot?.()||{};}catch(_){return {};}
}
function runtimeItems(){
  const snap=runtimeSnapshot();
  return Array.isArray(snap?.salesItems)?snap.salesItems:[];
}
function rowsFor(items,manager){
  const e=String(manager||'').toLowerCase();
  return (items||[]).filter(r=>String(r?.manager_email||'').toLowerCase()===e);
}
function sumRevenue(items,manager,field){
  return rowsFor(items,manager).reduce((s,r)=>s+num(r?.[field]),0);
}
function currentFact(manager){return sumRevenue(runtimeItems(),manager,'current_revenue');}
function samePeriodLastYear(manager){return sumRevenue(runtimeItems(),manager,'previous_revenue');}

function parseMoneyText(v){
  const s=String(v||'').replace(/\u00a0/g,' ').replace(/[^0-9,.-]/g,'').replace(',','.');
  const n=Number(s);return Number.isFinite(n)?n:null;
}
function planFromInput(manager){
  const input=[...document.querySelectorAll('.tri-plan-input')].find(x=>String(x.dataset.email||'').toLowerCase()===String(manager).toLowerCase());
  if(!input)return null;
  const raw=String(input.value||'').trim();
  if(!raw)return null;
  return parseMoneyText(raw);
}
function planFromManagerCard(manager){
  const e=String(manager||'').toLowerCase();
  const card=[...document.querySelectorAll('#tri-manager-cards .tri-manager-card')].find(x=>String(x.textContent||'').toLowerCase().includes(e));
  if(!card)return null;
  const metric=[...card.querySelectorAll('.tri-metric')].find(x=>String(x.querySelector('span')?.textContent||'').trim().toLowerCase()==='план');
  if(!metric)return null;
  const text=String(metric.querySelector('b')?.textContent||'');
  if(/не задан/i.test(text))return null;
  return parseMoneyText(text);
}
function currentPlan(manager){
  const fromInput=planFromInput(manager);
  return fromInput==null?planFromManagerCard(manager):fromInput;
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
    const g=map.get(group);
    g.cur+=num(r.current_revenue);g.prev+=num(r.previous_revenue);
    const sku=String(r.sku||'').trim(),product=String(r.product||'').trim();
    const key=sku||product;
    if(key){
      if(!g.skus.has(key))g.skus.set(key,{sku,product,cur:0,prev:0});
      const x=g.skus.get(key);x.cur+=num(r.current_revenue);x.prev+=num(r.previous_revenue);
    }
  });
  return [...map.values()].map(g=>({
    ...g,
    loss:Math.max(0,g.prev-g.cur),
    skuLoss:[...g.skus.values()].map(x=>({...x,loss:Math.max(0,x.prev-x.cur)})).filter(x=>x.loss>0).sort((a,b)=>b.loss-a.loss)
  })).filter(g=>g.loss>0).sort((a,b)=>b.loss-a.loss);
}
function gapSources(manager,gap){
  let left=Math.max(0,num(gap));
  const out=[];
  for(const g of aggregateGroups(runtimeItems(),manager)){
    if(left<=0)break;
    const use=Math.min(g.loss,left);left-=use;
    const sku=[];let skuLeft=use;
    for(const x of g.skuLoss){
      if(skuLeft<=0)break;
      const take=Math.min(x.loss,skuLeft);skuLeft-=take;
      sku.push({...x,use:take});
    }
    out.push({...g,use,sku});
  }
  return {items:out,covered:Math.max(0,num(gap)-left),uncovered:left};
}

function visibleManagers(){
  if(isBoss())return MANAGERS.slice();
  if(isTriManager())return [email()];
  return [];
}

function statusCard(manager){
  const month=selectedMonth(),fact=currentFact(manager),plan=currentPlan(manager);
  if(plan==null||plan<=0){
    return '<div class="tri-ai-card"><div class="tri-ai-head"><div><b>'+escHtml(managerName(manager))+'</b><div class="tri-ai-note">'+escHtml(month)+' · '+VERSION+'</div></div><span class="tri-ai-pill">План не задан</span></div><div class="tri-ai-note" style="margin-top:8px">После сохранения месячного плана здесь появятся факт, выполнение, прогноз и «Где взять недостающее».</div></div>';
  }
  const forecast=paceForecast(fact,month);
  const progress=plan>0?fact/plan:0;
  const gap=forecast==null?Math.max(0,plan-fact):Math.max(0,plan-forecast);
  const forecastText=forecast==null?'после начала месяца':money2(forecast);
  const src=gapSources(manager,gap);
  const gapHtml=gap<=0
    ?'<div class="tri-ai-ok">✅ Текущий прогноз покрывает план. Денежного разрыва нет.</div>'
    :'<div class="tri-ai-gap-head"><div><b>🎯 Где взять недостающее</b><div class="tri-ai-note">Разрыв план–прогноз: <b>'+money2(gap)+'</b>. Используются только группы и SKU '+escHtml(managerName(manager))+'.</div></div><div class="tri-ai-reserve"><span>Найдено</span><b>'+money2(src.covered)+'</b></div></div>'+
      (src.items.length?'<div class="tri-ai-source-list">'+src.items.slice(0,6).map(g=>'<details open class="tri-ai-source"><summary><span><b>'+escHtml(g.group)+'</b></span><b>+'+money2(g.use)+'</b></summary>'+(g.sku.length?'<div class="tri-ai-skus">'+g.sku.slice(0,4).map(x=>'<div><span>'+escHtml((x.sku?x.sku+' · ':'')+(x.product||'SKU'))+'</span><b>+'+money2(x.use)+'</b></div>').join('')+'</div>':'')+'</details>').join('')+'</div>':'<div class="tri-ai-warn">Подтверждённого резерва в текущих падающих/потерянных группах не найдено.</div>')+
      (src.uncovered>1?'<div class="tri-ai-warn"><b>Ещё не обеспечено текущими потерями: '+money2(src.uncovered)+'.</b> Эту часть нужно закрывать ростом действующих позиций или новым оборотом.</div>':'');

  return '<div class="tri-ai-card"><div class="tri-ai-head"><div><b>'+escHtml(managerName(manager))+'</b><div class="tri-ai-note">'+escHtml(month)+' · контроль месячного плана · '+VERSION+'</div></div><span class="tri-ai-pill">'+pct(progress)+' плана</span></div>'+
    '<div class="tri-ai-metrics"><div><span>План</span><b>'+money2(plan)+'</b></div><div><span>Факт</span><b>'+money2(fact)+'</b></div><div><span>Выполнение</span><b>'+pct(progress)+'</b></div><div><span>Прогноз</span><b>'+forecastText+'</b></div><div><span>Разрыв</span><b>'+(gap>0?money2(gap):'0,00 BYN')+'</b></div></div>'+
    (forecast!=null&&month===currentMonth()?'<div class="tri-ai-note" style="margin-top:7px">Прогноз рассчитан по текущему темпу продаж на '+dayOfMonth()+' число из '+daysInMonth(month)+' дней месяца.</div>':'')+
    '<div class="tri-ai-gap">'+gapHtml+'</div></div>';
}

function ensureCss(){
  if(document.getElementById('tri-ai-plans-css-v2340'))return;
  const s=document.createElement('style');s.id='tri-ai-plans-css-v2340';s.textContent=`
  .tri-ai-status-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0 0 12px}
  .tri-ai-card{background:#fff;border:1px solid var(--border);border-radius:12px;padding:14px;min-width:0}
  .tri-ai-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.tri-ai-head>b,.tri-ai-head b{font-size:15px}
  .tri-ai-note{font-size:11px;color:var(--sub);line-height:1.45}.tri-ai-pill{font-size:10px;font-weight:800;border-radius:99px;padding:4px 8px;background:var(--ab);color:var(--at);white-space:nowrap}
  .tri-ai-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-top:10px}.tri-ai-metrics>div{background:var(--bg);border-radius:8px;padding:8px}.tri-ai-metrics span{display:block;font-size:9px;text-transform:uppercase;color:var(--sub)}.tri-ai-metrics b{display:block;font-size:12px;margin-top:3px}
  .tri-ai-gap{margin-top:10px}.tri-ai-gap-head{display:flex;justify-content:space-between;gap:10px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:9px;padding:9px}.tri-ai-reserve{text-align:right;white-space:nowrap}.tri-ai-reserve span{display:block;font-size:9px;text-transform:uppercase;color:var(--sub)}.tri-ai-reserve b{font-size:14px}
  .tri-ai-source-list{display:grid;gap:6px;margin-top:7px}.tri-ai-source{border:1px solid var(--border);border-radius:8px;padding:7px 9px}.tri-ai-source summary{cursor:pointer;display:flex;justify-content:space-between;gap:8px;font-size:11px}.tri-ai-skus{display:grid;gap:4px;margin-top:6px}.tri-ai-skus>div{display:flex;justify-content:space-between;gap:10px;border-top:1px dashed var(--border);padding-top:4px;font-size:10px;color:var(--sub)}.tri-ai-skus b{color:var(--text);white-space:nowrap}
  .tri-ai-ok{background:#F0FDF4;border:1px solid #BBF7D0;color:#166534;border-radius:8px;padding:8px 9px;font-size:11px}.tri-ai-warn{background:#FFFBEB;border:1px solid #FDE68A;color:#92400E;border-radius:8px;padding:8px 9px;font-size:11px;margin-top:7px}
  .tri-ai-calc{margin-top:8px;display:flex;gap:7px;align-items:center;flex-wrap:wrap}.tri-ai-calc-result{font-size:10px;color:var(--sub);line-height:1.4;flex:1;min-width:150px}.tri-ai-calc-result b{color:var(--text)}
  @media(max-width:950px){.tri-ai-status-grid{grid-template-columns:1fr}.tri-ai-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;document.head.appendChild(s);
}

function renderStatus(){
  ensureCss();
  const cards=document.getElementById('tri-manager-cards');
  if(!cards)return;
  let root=document.getElementById('tri-ai-plan-status-v2340');
  const snap=runtimeSnapshot();
  if(snap.loading||!snap.loaded){if(root)root.remove();return;}
  if(selectedMode()!=='month'){
    if(!root){root=document.createElement('div');root.id='tri-ai-plan-status-v2340';cards.insertAdjacentElement('afterend',root);}
    root.className='card';
    root.innerHTML='<div class="tri-ai-note"><b>🤖 Контроль плана Triovist:</b> для корректного месячного плана выберите режим <b>«Месяц»</b>.</div>';
    return;
  }
  const managers=visibleManagers();
  if(!managers.length){root?.remove();return;}
  if(!root){root=document.createElement('div');root.id='tri-ai-plan-status-v2340';cards.insertAdjacentElement('afterend',root);}
  root.className='tri-ai-status-grid';
  root.innerHTML=managers.map(statusCard).join('');
}

async function monthDashboard(month){
  const key='month|'+month,now=Date.now(),cached=calcCache.get(key);
  if(cached&&now-cached.at<180000)return cached.data;
  const hub=window.TRIOVIST_DATA_HUB_V227315;
  if(!hub?.sales)throw new Error('Источник данных Triovist ещё не готов');
  const data=await hub.sales({p_end_month:month,p_mode:'month',p_start_month:null},{ttl:180000});
  calcCache.set(key,{at:Date.now(),data:data||{}});return data||{};
}
function revenueFromDashboard(d,manager,field='current_revenue'){
  const items=Array.isArray(d?.items)?d.items:[];
  return sumRevenue(items,manager,field);
}
async function calculateRecommendation(manager){
  const month=selectedMonth();
  if(!month)throw new Error('Не выбран месяц');
  const prevMonths=[shiftMonth(month,-3),shiftMonth(month,-2),shiftMonth(month,-1)];
  const [target,...previous]=await Promise.all([monthDashboard(month),...prevMonths.map(monthDashboard)]);
  const values=previous.map(d=>revenueFromDashboard(d,manager,'current_revenue'));
  const valid=values.filter(v=>v>0);
  if(valid.length<2)throw new Error('Недостаточно истории: нужны минимум 2 закрытых месяца продаж этого менеджера.');
  const avg3=average(valid),weighted=weighted3(values),operating=Math.max(avg3,weighted);
  const lastYear=revenueFromDashboard(target,manager,'previous_revenue');
  const base=Math.max(operating,lastYear);
  if(base<=0)throw new Error('Нет достаточной базы для расчёта плана.');
  const recommended=ceilThousand(base*(1+GROWTH));
  const fact=revenueFromDashboard(target,manager,'current_revenue');
  let forecast;
  if(month===currentMonth())forecast=paceForecast(fact,month);
  else if(month<currentMonth())forecast=fact;
  else forecast=weighted;
  return {manager,month,prevMonths,values,avg3,weighted,operating,lastYear,base,recommended,fact,forecast,gap:Math.max(0,recommended-num(forecast))};
}
function calcResultRoot(manager){
  return [...document.querySelectorAll('.tri-ai-calc-result')].find(x=>String(x.dataset.email||'').toLowerCase()===String(manager||'').toLowerCase())||null;
}
function inputFor(manager){return [...document.querySelectorAll('.tri-plan-input')].find(x=>String(x.dataset.email||'').toLowerCase()===String(manager).toLowerCase())||null;}

window.triovistAiCalculatePlanV2340=async function(manager){
  manager=String(manager||'').toLowerCase();
  if(!isBoss()||!MANAGERS.includes(manager))return;
  const btn=[...document.querySelectorAll('.tri-ai-calc-btn')].find(x=>String(x.dataset.email||'').toLowerCase()===manager)||null;
  const out=calcResultRoot(manager);
  if(btn){btn.disabled=true;btn.textContent='Считаю…';}
  if(out)out.innerHTML='Анализирую последние закрытые месяцы и аналогичный месяц прошлого года…';
  try{
    const r=await calculateRecommendation(manager);
    const input=inputFor(manager);
    if(input){input.value=r.recommended.toFixed(2).replace('.',',');input.dispatchEvent(new Event('input',{bubbles:true}));}
    if(out)out.innerHTML='<b>Рекомендация: '+money2(r.recommended)+'</b><br>База: '+money2(r.base)+' → минимум +30%. Среднее закрытых месяцев: '+money2(r.avg3)+'; взвешенный темп: '+money2(r.weighted)+'; аналогичный месяц прошлого года: '+money2(r.lastYear)+'.'+(r.forecast!=null?'<br>Прогноз: '+money2(r.forecast)+'; разрыв: '+money2(r.gap)+'.':'');
    renderStatus();
  }catch(e){if(out)out.innerHTML='<span style="color:var(--r)">Не удалось рассчитать: '+escHtml(e?.message||e)+'</span>';}
  finally{if(btn){btn.disabled=false;btn.textContent='🤖 Рассчитать ИИ';}}
};

function enhancePlanEditor(){
  if(!isBoss())return;
  document.querySelectorAll('#tri-plan-editor .tri-plan-box').forEach(box=>{
    const input=box.querySelector('.tri-plan-input');if(!input)return;
    const manager=String(input.dataset.email||'').toLowerCase();if(!MANAGERS.includes(manager))return;
    if(!box.querySelector('.tri-ai-calc')){
      const wrap=document.createElement('div');wrap.className='tri-ai-calc';
      const btn=document.createElement('button');btn.type='button';btn.className='btn-secondary tri-ai-calc-btn';btn.dataset.email=manager;btn.textContent='🤖 Рассчитать ИИ';btn.addEventListener('click',()=>window.triovistAiCalculatePlanV2340(manager));
      const result=document.createElement('div');result.className='tri-ai-calc-result';result.dataset.email=manager;result.textContent='ИИ рассчитает рекомендацию, но сам план не сохранит.';
      wrap.append(btn,result);box.appendChild(wrap);
    }
    if(input.dataset.triAiBoundV2340!=='1'){
      input.dataset.triAiBoundV2340='1';
      input.addEventListener('input',()=>renderStatus());
    }
  });
  const card=document.getElementById('tri-plans-card');
  const title=card?.querySelector('.card-title');
  if(title&&!title.querySelector('.tri-ai-version'))title.insertAdjacentHTML('beforeend',' <span class="tri-ai-version" style="font-size:9px;color:var(--sub);font-weight:600">· ИИ '+VERSION+'</span>');
}

function afterRender(){
  try{ensureCss();enhancePlanEditor();renderStatus();}catch(e){console.warn('Triovist AI plans '+VERSION,e);}
}
function boot(){
  if(typeof window.renderTriovist==='function'&&!window.renderTriovist.__triAiV2340){
    const base=window.renderTriovist;
    const wrapped=function(){const r=base.apply(this,arguments);afterRender();return r;};
    wrapped.__triAiV2340=true;window.renderTriovist=wrapped;
    try{renderTriovist=wrapped;}catch(_){}
  }
  afterRender();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.addEventListener('focus',()=>{if(document.getElementById('page-triovist')?.classList.contains('active'))afterRender();});
window.RESANTA_TRIOVIST_AI_PLANS_V2340=Object.freeze({version:VERSION,growthMin:GROWTH,managers:MANAGERS.slice(),noSqlChanges:true,fieldManagerLogicUntouched:true});
})();
