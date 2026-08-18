/* RESANTA CRM v23.4.5 · TRIOVIST AI PLANS · LOCAL CALC · LEADER APPROVAL */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_AI_PLANS_V2345)return;

const V='v23.4.5';
const A='aleksandrenko_av@resanta.ru',K='krishtal_na@resanta.ru',M=[A,K];
const N={[A]:'Александренко',[K]:'Кришталь'};
const B=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
const R=new Map(),D=new Map();
let timer=0,obs=null,obsPage=null,busy=false,saving=false;

const n=v=>Number(v)||0;
const email=()=>String(window.currentProfile?.email||window.currentUser?.email||'').trim().toLowerCase();
const boss=()=>window.currentProfile?.role==='boss'&&B.has(email());
const manager=()=>M.includes(email());
const managerName=m=>N[String(m||'').toLowerCase()]||String(m||'');
const money=v=>n(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const qty=v=>n(v).toLocaleString('ru-RU',{maximumFractionDigits:1});
const pct=v=>(n(v)*100).toFixed(1)+'%';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const skuKey=v=>String(v||'').trim().replace(/^'/,'').toLowerCase();

function ym(v){return String(v||'').slice(0,7)}
function today(){const x=String(window.TODAY||new Date().toISOString().slice(0,10));return /^\d{4}-\d{2}-\d{2}$/.test(x)?x:new Date().toISOString().slice(0,10)}
function currentMonth(){return today().slice(0,7)}
function daysInMonth(m){return new Date(+m.slice(0,4),+m.slice(5,7),0).getDate()}
function dayOfMonth(){return +today().slice(8,10)||1}
function selectedMonth(){return ym(document.getElementById('tri-period-month')?.value||currentMonth())}
function mode(){return document.getElementById('tri-period-mode')?.value||'month'}
function snap(){try{return window.TRIOVIST_RUNTIME_STATE_V227324?.snapshot?.()||{}}catch(_){return{}}}
function sales(){const s=snap();return Array.isArray(s.salesItems)?s.salesItems:[]}
function stocks(){const s=snap();return Array.isArray(s.stockItems)?s.stockItems:[]}
function meta(){return snap().stockMeta||{}}
function rows(a,m){m=String(m).toLowerCase();return(a||[]).filter(x=>String(x?.manager_email||'').toLowerCase()===m)}
function sum(a,m,f){return rows(a,m).reduce((s,x)=>s+n(x?.[f]),0)}
function fact(m){return sum(sales(),m,'current_revenue')}
function lastYear(m){return sum(sales(),m,'previous_revenue')}
function forecast(f,m){if(m<currentMonth())return f;if(m>currentMonth())return null;return f/Math.min(dayOfMonth(),daysInMonth(m))*daysInMonth(m)}
function visibleManagers(){return boss()?M.slice():(manager()?[email()]:[])}
function parse(v){const x=String(v||'').replace(/\u00a0/g,' ').replace(/\s+/g,'').replace(',','.').replace(/[^0-9.-]/g,'');const z=Number(x);return Number.isFinite(z)?z:null}

function motivationCard(m){const q=managerName(m).toLowerCase();return[...document.querySelectorAll('#tri-mot-grid .tri-mot-manager')].find(x=>String(x.textContent||'').toLowerCase().includes(q))||null}
function settingsInput(m){return[...document.querySelectorAll('.tri-plan-input')].find(x=>String(x.dataset.email||'').toLowerCase()===m)||null}
function approvedPlan(m){
  let x=settingsInput(m),v=x&&String(x.value||'').trim()?parse(x.value):null;if(v!=null)return v;
  const c=[...document.querySelectorAll('#tri-manager-cards .tri-manager-card')].find(x=>String(x.textContent||'').toLowerCase().includes(m));
  if(c){const q=[...c.querySelectorAll('.tri-metric')].find(x=>String(x.querySelector('span')?.textContent||'').trim().toLowerCase()==='план');if(q&&!/не задан/i.test(q.textContent||'')){v=parse(q.querySelector('b')?.textContent);if(v!=null)return v}}
  const mc=motivationCard(m),r=String(mc?.textContent||'').replace(/\u00a0/g,' ').match(/из\s+([\d\s.,]+)\s*BYN/i);return r?parse(r[1]):null;
}
function workingPlan(m){return boss()&&D.has(m)?n(D.get(m)):n(approvedPlan(m))}

function prices(m){
  const z=new Map();
  rows(sales(),m).forEach(r=>{const k=skuKey(r.sku);if(!k)return;if(!z.has(k))z.set(k,{r:0,q:0});const x=z.get(k);x.r+=n(r.current_revenue)+n(r.previous_revenue);x.q+=n(r.current_qty)+n(r.previous_qty)});
  const out=new Map();z.forEach((x,k)=>{if(x.q>0&&x.r>0)out.set(k,x.r/x.q)});return out;
}
function opportunities(m){
  const p=prices(m),a=[];let noPrice=0;
  rows(stocks(),m).forEach(r=>{
    const k=skuKey(r.sku),u=p.get(k),need=Math.max(0,n(r.recommended)),own=Math.max(0,n(r.own_qty)),ch=Math.max(0,n(r.chekhov_qty)),q=Math.min(need,own+ch);
    if(q<=0)return;if(!(u>0)){noPrice++;return}
    a.push({g:String(r.assigned_group||'Не распределено'),sku:String(r.sku||''),product:String(r.product||''),need,own,ch,q,value:q*u});
  });
  a.sort((x,y)=>y.value-x.value);return{a,total:a.reduce((s,x)=>s+x.value,0),noPrice};
}
function allocate(m,gap){
  const o=opportunities(m),gm=new Map();
  o.a.forEach(x=>{if(!gm.has(x.g))gm.set(x.g,{g:x.g,total:0,a:[]});const q=gm.get(x.g);q.total+=x.value;q.a.push(x)});
  let left=Math.max(0,gap),out=[];
  for(const q of [...gm.values()].sort((x,y)=>y.total-x.total)){
    if(left<=.01)break;const use=Math.min(q.total,left);left-=use;let l=use,aa=[];
    for(const x of q.a){if(l<=.01)break;const u=Math.min(x.value,l);l-=u;aa.push({...x,use:u})}
    out.push({...q,use,aa});
  }
  return{out,covered:Math.max(0,gap-left),left,total:o.total,noPrice:o.noPrice};
}
function stockDates(){const x=meta(),p=x.partner||{},o=x.own||{},c=x.chekhov||{};return `21vek <b>${esc(p.snapshot_date||'нет даты')}</b> · Витебск <b>${esc(o.report_date||'нет даты')}</b> · Чехов <b>${esc(c.snapshot_date||'нет даты')}</b>`}

/* v23.4.5: calculation uses data already loaded on the Triovist screen.
   No extra triovist_get_dashboard RPCs => no statement timeout from four heavy parallel calls. */
function calculateLocal(m){
  const month=selectedMonth(),f=fact(m),ly=lastYear(m),fc=forecast(f,month);
  if(!(ly>0)&&!(n(fc)>0))throw Error('Нет базы для расчёта: отсутствуют продажи прошлого года и текущий темп.');
  const floor30=ly>0?ly*1.30:0;
  const recommendation=Math.ceil(Math.max(floor30,n(fc),1)/1000)*1000;
  const stock=opportunities(m);
  const supported=Math.min(recommendation,Math.ceil((n(fc)+stock.total)/1000)*1000);
  return{m,month,f,last:ly,fc,floor30,recommendation,stock:stock.total,supported,unsupported:Math.max(0,recommendation-n(fc)-stock.total),at:Date.now()};
}

function css(){
  let s=document.getElementById('tri-ai-plans-css-v2345');if(!s){s=document.createElement('style');s.id='tri-ai-plans-css-v2345';document.head.appendChild(s)}
  s.textContent=`.tri-ai-motivation:not([data-ai-version="${V}"]){display:none!important}.tri-ai-motivation[data-ai-version="${V}"]{margin-top:12px;border:1px solid #93c5fd;background:#f8fbff;border-radius:11px;padding:11px}.tri-ai-h{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.tri-ai-t{font-weight:900;color:var(--at)}.tri-ai-n{font-size:10px;color:var(--sub);line-height:1.45}.tri-ai-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;margin-top:8px}.tri-ai-grid>div,.tri-ai-three>div{background:#fff;border:1px solid var(--border);border-radius:8px;padding:7px}.tri-ai-grid span,.tri-ai-three span{display:block;font-size:8px;color:var(--sub);text-transform:uppercase}.tri-ai-grid b,.tri-ai-three b{display:block;margin-top:3px}.tri-ai-three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:8px}.tri-ai-gap{margin-top:8px}.tri-ai-box{border:1px solid #bfdbfe;background:#eff6ff;border-radius:8px;padding:8px}.tri-ai-row{display:flex;justify-content:space-between;gap:10px;border-top:1px dashed var(--border);padding-top:4px;margin-top:4px;font-size:10px}.tri-ai-ok{background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;border-radius:8px;padding:7px;font-size:10px}.tri-ai-warn{background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:8px;padding:7px;font-size:10px;margin-top:6px}.tri-ai-meta{font-size:9px;color:var(--sub);margin-top:6px}.tri-ai-leader{margin-top:8px;padding:9px;border:1px solid #dbeafe;background:#fff;border-radius:9px}.tri-ai-leader-row{display:grid;grid-template-columns:minmax(180px,1fr) auto auto;gap:7px;align-items:end}.tri-ai-leader .form-input{margin:0}@media(max-width:1000px){.tri-ai-grid{grid-template-columns:repeat(3,1fr)}.tri-ai-three{grid-template-columns:1fr}}@media(max-width:700px){.tri-ai-leader-row{grid-template-columns:1fr}}`;
}
function gapHtml(m,gap){
  if(gap<=.01)return `<div class="tri-ai-ok">✅ Прогноз покрывает выбранный план.</div><div class="tri-ai-meta">Остатки: ${stockDates()}</div>`;
  if(!stocks().length)return'<div class="tri-ai-warn"><b>Остатки ещё не загружены в расчёт.</b> Обновите экран после загрузки 21vek/Чехова.</div>';
  const x=allocate(m,gap);let s=`<div class="tri-ai-box"><b>🎯 Где взять недостающее</b><div class="tri-ai-n">Разрыв: <b>${money(gap)}</b>. Только позиции, которые нужны 21vek и реально есть на Витебске/Чехове.</div><div style="margin-top:4px"><b>Подтверждено товаром: ${money(x.covered)}</b></div></div><div class="tri-ai-meta">Остатки: ${stockDates()}</div>`;
  x.out.forEach(g=>{s+=`<details style="margin-top:5px;background:#fff;border:1px solid var(--border);border-radius:8px;padding:6px"><summary style="cursor:pointer;display:flex;justify-content:space-between"><b>${esc(g.g)}</b><b>+${money(g.use)}</b></summary>`;let shown=0;g.aa.slice(0,8).forEach(q=>{shown+=q.use;s+=`<div class="tri-ai-row"><span><b>${esc(q.sku)}</b> · ${esc(q.product)}<br>21vek нужно ${qty(q.need)} шт. · Витебск ${qty(q.own)} · Чехов ${qty(q.ch)}</span><b>+${money(q.use)}</b></div>`});const rest=g.use-shown;if(rest>.01)s+=`<div class="tri-ai-row"><span>Остальные позиции</span><b>+${money(rest)}</b></div>`;s+='</details>'});
  if(x.left>.01)s+=`<div class="tri-ai-warn"><b>Не обеспечено остатками: ${money(x.left)}.</b> Эта сумма не включена в «где взять».</div>`;
  if(x.noPrice)s+=`<div class="tri-ai-n" style="margin-top:5px">Не включено ${x.noPrice} SKU без надёжной цены из истории продаж.</div>`;
  return s;
}
function leaderEditor(m,r){
  if(!boss()||!r||r.err||r.month!==selectedMonth())return'';
  const cur=D.has(m)?n(D.get(m)):n(approvedPlan(m));
  return `<div class="tri-ai-leader"><div style="font-weight:800;margin-bottom:5px">✍️ План утверждает руководитель</div><div class="tri-ai-n" style="margin-bottom:7px">ИИ только рекомендует <b>${money(r.recommendation)}</b>. Если не согласны — введите свою сумму и сохраните.</div><div class="tri-ai-leader-row"><div><label class="form-label">План руководителя, BYN</label><input class="form-input" type="number" min="0" step="0.01" value="${cur>0?cur.toFixed(2):''}" onchange="triovistAiDraftPlanV2345('${m}',this.value)" placeholder="Введите план"></div><button class="btn-secondary" onclick="triovistAiUseRecommendationV2345('${m}')">Взять рекомендацию</button><button class="btn-primary" onclick="triovistAiSaveLeaderPlanV2345('${m}')">Сохранить мой план</button></div><div class="tri-ai-meta">До нажатия «Сохранить мой план» данные в CRM не меняются.</div></div>`;
}
function html(m){
  const p=workingPlan(m),approved=n(approvedPlan(m)),f=fact(m),fc=forecast(f,selectedMonth()),pr=p>0?f/p:0,gap=p>0?Math.max(0,p-n(fc)):0,o=opportunities(m),r=R.get(m),b=boss();
  let top='';
  if(r?.err)top=`<div class="tri-ai-warn">${esc(r.err)}</div>`;
  else if(r&&r.month===selectedMonth())top=`<div class="tri-ai-three"><div><span>Текущий утверждённый план</span><b>${approved>0?money(approved):'Не задан'}</b></div><div><span>Рекомендация ИИ</span><b>${money(r.recommendation)}</b></div><div><span>Обеспечено темпом + товаром</span><b>${money(Math.min(r.recommendation,n(r.fc)+r.stock))}</b></div></div><div class="tri-ai-meta">Аналогичный месяц прошлого года ${money(r.last)} · минимум +30% = ${money(r.floor30)} · текущий прогноз ${r.fc==null?'—':money(r.fc)}.<br>Товарный резерв ${money(r.stock)} · не обеспечено для рекомендации ИИ ${money(r.unsupported)} · ${stockDates()}</div>${leaderEditor(m,r)}`;
  else top=`<div class="tri-ai-n" style="margin-top:5px">${b?'Нажмите «Рассчитать ИИ». Расчёт идёт по уже загруженным данным: прошлый год, текущий темп, остаток 21vek и наличие Витебск + Чехов.':'Ниже показан ваш утверждённый план, прогноз и только подтверждённые товаром точки роста.'}</div>`;
  const draftNote=b&&D.has(m)?'<div class="tri-ai-meta">Для расчёта ниже используется <b>черновик руководителя</b>. Менеджер увидит его только после сохранения.</div>':'';
  return `<div class="tri-ai-h"><div><div class="tri-ai-t">🤖 ИИ-план · ${esc(managerName(m))} · ${V}</div><div class="tri-ai-n">${esc(selectedMonth())} · без дополнительных тяжёлых запросов · остатки Витебск + Чехов · спрос/остаток 21vek</div></div>${b?`<button class="btn-secondary" onclick="triovistAiCalculatePlanV2345('${m}')">🤖 Рассчитать ИИ</button>`:''}</div>${top}${p>0?`<div class="tri-ai-grid"><div><span>${D.has(m)&&b?'План (черновик)':'План'}</span><b>${money(p)}</b></div><div><span>Факт</span><b>${money(f)}</b></div><div><span>Выполнение</span><b>${pct(pr)}</b></div><div><span>Прогноз</span><b>${fc==null?'—':money(fc)}</b></div><div><span>Разрыв</span><b>${money(gap)}</b></div><div><span>Товарный резерв</span><b>${money(o.total)}</b></div></div>${draftNote}<div class="tri-ai-gap">${gapHtml(m,gap)}</div>`:'<div class="tri-ai-warn">План не задан.</div>'}`;
}
function mark(){const t=document.querySelector('#tri-motivation-card .card-title');if(!t)return;let x=t.querySelector('.tri-ai-mot-version');if(!x){x=document.createElement('span');x.className='tri-ai-mot-version';x.style.cssText='font-size:9px;color:var(--sub);margin-left:5px';t.appendChild(x)}x.textContent='· ИИ '+V}
function render(){
  if(busy)return;busy=true;
  try{
    css();mark();const g=document.getElementById('tri-mot-grid');if(!g)return;
    if(mode()!=='month'){g.querySelectorAll('.tri-ai-motivation').forEach(x=>x.remove());return}
    const set=new Set(visibleManagers());
    g.querySelectorAll('.tri-ai-motivation').forEach(x=>{if(x.dataset.aiVersion!==V||!set.has(x.dataset.email))x.remove()});
    set.forEach(m=>{
      const c=motivationCard(m);if(!c)return;
      let p=c.querySelector(`.tri-ai-motivation[data-ai-version="${V}"][data-email="${m}"]`);
      if(!p){p=document.createElement('div');p.className='tri-ai-motivation';p.dataset.email=m;p.dataset.aiVersion=V;(c.querySelector('.tri-mot-planline')||c.lastElementChild)?.insertAdjacentElement('afterend',p)}
      const mt=meta(),r=R.get(m),sig=[V,selectedMonth(),approvedPlan(m),D.get(m),fact(m),sales().length,stocks().length,mt?.partner?.snapshot_date,mt?.own?.report_date,mt?.chekhov?.snapshot_date,r?.at,r?.err].join('|');
      if(p.dataset.sig!==sig){p.innerHTML=html(m);p.dataset.sig=sig}
    });
  }catch(x){console.warn(V,x)}finally{busy=false}
}
function schedule(d=40){clearTimeout(timer);timer=setTimeout(()=>{render();watch()},d)}
function watch(){const p=document.getElementById('page-triovist');if(!p||p===obsPage)return;obs?.disconnect();obsPage=p;obs=new MutationObserver(()=>{if(p.classList.contains('active'))schedule(80)});obs.observe(p,{childList:true,subtree:true})}

window.triovistAiCalculatePlanV2345=m=>{
  m=String(m).toLowerCase();if(!boss()||!M.includes(m))return;
  try{R.set(m,calculateLocal(m))}catch(x){R.set(m,{month:selectedMonth(),err:'Не удалось рассчитать: '+String(x?.message||x),at:Date.now()})}
  schedule(0);
};
window.triovistAiDraftPlanV2345=(m,v)=>{m=String(m).toLowerCase();if(!boss()||!M.includes(m))return;const z=parse(v);if(z==null||z<0)D.delete(m);else D.set(m,z);schedule(0)};
window.triovistAiUseRecommendationV2345=m=>{m=String(m).toLowerCase();if(!boss())return;const r=R.get(m);if(!r||r.err)return;D.set(m,r.recommendation);schedule(0)};
window.triovistAiSaveLeaderPlanV2345=async m=>{
  m=String(m).toLowerCase();if(!boss()||saving)return;
  const v=D.has(m)?n(D.get(m)):n(approvedPlan(m));if(!(v>=0))return alert('Введите корректный план.');
  saving=true;
  try{
    const r=await db.rpc('triovist_set_plan',{p_manager_email:m,p_period_month:selectedMonth(),p_plan_amount:Math.round(v*100)/100});
    if(r.error)throw r.error;
    D.delete(m);alert('✅ План '+managerName(m)+' сохранён: '+money(v));
    if(typeof window.triovistReload==='function')await window.triovistReload();else schedule(0);
  }catch(x){alert('Не удалось сохранить план: '+String(x?.message||x))}finally{saving=false}
};

/* Compatibility aliases: old buttons cannot trigger heavy RPC calculation anymore. */
window.triovistAiCalculatePlanV2343=window.triovistAiCalculatePlanV2345;
window.triovistAiCalculatePlanV2341=window.triovistAiCalculatePlanV2345;
window.triovistAiCalculatePlanV2340=window.triovistAiCalculatePlanV2345;
window.triovistAiApplyRecommendationV2343=m=>window.triovistAiUseRecommendationV2345(m);
window.triovistAiApplyRecommendationV2341=m=>window.triovistAiUseRecommendationV2345(m);

function boot(){
  document.querySelectorAll('.tri-ai-motivation').forEach(x=>x.remove());
  const base=window.renderTriovist;
  if(typeof base==='function'&&!base.__ai2345){const w=function(){const r=base.apply(this,arguments);schedule(0);return r};w.__ai2345=true;window.renderTriovist=w;try{renderTriovist=w}catch(_){}}
  watch();schedule(0);
  document.addEventListener('click',x=>{if(x.target?.closest?.('[data-tab="motivation"]'))schedule(120)});
  window.addEventListener('focus',()=>{if(document.getElementById('page-triovist')?.classList.contains('active'))schedule(30)});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
window.RESANTA_TRIOVIST_AI_PLANS_V2345=Object.freeze({version:V,directRoot:true,localCalculation:true,noHeavyAiRpc:true,leaderManualApproval:true,stockAware:true,managerGapVisible:true,exactGapArithmetic:true,noAutoSave:true,noSqlChanges:true});
})();
