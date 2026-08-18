/* RESANTA CRM v23.4.8 · TRIOVIST AI PLANS · CACHE-SAFE MANAGER ROOT */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_AI_PLANS_V2348)return;

const V='v23.4.8';
const A='aleksandrenko_av@resanta.ru',K='krishtal_na@resanta.ru',M=[A,K];
const N={[A]:'Александренко',[K]:'Кришталь'};
const B=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
const D=new Map();
let timer=0,saving=false,bootObserver=null,lastSig='',probeTimer=null,probeTicks=0;

const n=v=>Number(v)||0;
function profile(){try{if(typeof currentProfile!=='undefined'&&currentProfile)return currentProfile}catch(_){}return window.currentProfile||null}
function user(){try{if(typeof currentUser!=='undefined'&&currentUser)return currentUser}catch(_){}return window.currentUser||null}
function email(){return String(profile()?.email||user()?.email||'').trim().toLowerCase()}
function boss(){return profile()?.role==='boss'&&B.has(email())}
function manager(){return M.includes(email())}
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

function settingsInput(m){return[...document.querySelectorAll('.tri-plan-input')].find(x=>String(x.dataset.email||'').toLowerCase()===m)||null}
function approvedPlan(m){
  const i=settingsInput(m);let v=i&&String(i.value||'').trim()?parse(i.value):null;if(v!=null)return v;
  const cards=[...document.querySelectorAll('#tri-manager-cards .tri-manager-card')];
  const c=cards.find(x=>String(x.textContent||'').toLowerCase().includes(m)||String(x.textContent||'').toLowerCase().includes(managerName(m).toLowerCase()));
  if(c){const q=[...c.querySelectorAll('.tri-metric')].find(x=>String(x.querySelector('span')?.textContent||'').trim().toLowerCase()==='план');if(q&&!/не задан/i.test(q.textContent||'')){v=parse(q.querySelector('b')?.textContent);if(v!=null)return v}}
  const mot=[...document.querySelectorAll('#tri-mot-grid .tri-mot-manager')].find(x=>String(x.textContent||'').toLowerCase().includes(managerName(m).toLowerCase()));
  const r=String(mot?.textContent||'').replace(/\u00a0/g,' ').match(/из\s+([\d\s.,]+)\s*BYN/i);return r?parse(r[1]):null;
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
function recommendation(m){
  const month=selectedMonth(),f=fact(m),ly=lastYear(m),fc=forecast(f,month),floor30=ly>0?ly*1.30:0;
  if(!(floor30>0)&&!(n(fc)>0))return null;
  const amount=Math.ceil(Math.max(floor30,n(fc),1)/1000)*1000,stock=opportunities(m);
  return{month,f,ly,fc,floor30,amount,stock:stock.total,supported:Math.min(amount,Math.ceil((n(fc)+stock.total)/1000)*1000),uncovered:Math.max(0,amount-n(fc)-stock.total)};
}

function css(){
  let s=document.getElementById('tri-ai-independent-css-v2348');if(!s){s=document.createElement('style');s.id='tri-ai-independent-css-v2348';document.head.appendChild(s)}
  s.textContent=`#tri-ai-independent-root-v2348{margin-bottom:12px}.tri-ai48-title{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.tri-ai48-note{font-size:10px;color:var(--sub);line-height:1.45}.tri-ai48-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:10px}.tri-ai48-card{border:1px solid #93c5fd;background:#f8fbff;border-radius:12px;padding:13px}.tri-ai48-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.tri-ai48-name{font-size:17px;font-weight:900}.tri-ai48-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-top:9px}.tri-ai48-kpi{background:#fff;border:1px solid var(--border);border-radius:8px;padding:7px}.tri-ai48-kpi span{display:block;color:var(--sub);font-size:8px;text-transform:uppercase}.tri-ai48-kpi b{display:block;margin-top:3px;font-size:13px}.tri-ai48-box{margin-top:8px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:9px;padding:8px}.tri-ai48-row{display:flex;justify-content:space-between;gap:10px;border-top:1px dashed var(--border);padding-top:5px;margin-top:5px;font-size:10px}.tri-ai48-warn{margin-top:7px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;border-radius:8px;padding:7px;font-size:10px}.tri-ai48-ok{margin-top:7px;background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;border-radius:8px;padding:7px;font-size:10px}.tri-ai48-leader{margin-top:9px;background:#fff;border:1px solid #dbeafe;border-radius:9px;padding:9px}.tri-ai48-editor{display:grid;grid-template-columns:minmax(160px,1fr) auto auto;gap:7px;align-items:end}.tri-ai48-editor .form-input{margin:0}.tri-ai48-loading{padding:12px;border:1px dashed #93c5fd;background:#f8fbff;border-radius:10px;color:var(--sub);font-size:11px}@media(max-width:1100px){.tri-ai48-grid{grid-template-columns:1fr}}@media(max-width:800px){.tri-ai48-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.tri-ai48-editor{grid-template-columns:1fr}}`;
}
function gapHtml(m,gap){
  if(gap<=.01)return `<div class="tri-ai48-ok">✅ Текущий прогноз покрывает утверждённый план.</div><div class="tri-ai48-note">Остатки: ${stockDates()}</div>`;
  if(!stocks().length)return `<div class="tri-ai48-loading">Остатки 21vek / Витебск / Чехов ещё загружаются. Блок «Где взять» появится автоматически.</div>`;
  const x=allocate(m,gap);let s=`<div class="tri-ai48-box"><b>🎯 Где взять недостающее</b><div class="tri-ai48-note">Разрыв: <b>${money(gap)}</b>. Только позиции, которые нужны 21vek и реально есть на Витебске/Чехове.</div><div style="margin-top:4px"><b>Подтверждено товаром: ${money(x.covered)}</b></div></div><div class="tri-ai48-note" style="margin-top:5px">Остатки: ${stockDates()}</div>`;
  x.out.forEach(g=>{s+=`<details style="margin-top:5px;background:#fff;border:1px solid var(--border);border-radius:8px;padding:6px"><summary style="cursor:pointer;display:flex;justify-content:space-between;gap:10px"><b>${esc(g.g)}</b><b>+${money(g.use)}</b></summary>`;let shown=0;g.aa.slice(0,8).forEach(q=>{shown+=q.use;s+=`<div class="tri-ai48-row"><span><b>${esc(q.sku)}</b> · ${esc(q.product)}<br>21vek нужно ${qty(q.need)} шт. · Витебск ${qty(q.own)} · Чехов ${qty(q.ch)}</span><b>+${money(q.use)}</b></div>`});const rest=g.use-shown;if(rest>.01)s+=`<div class="tri-ai48-row"><span>Остальные позиции</span><b>+${money(rest)}</b></div>`;s+='</details>'});
  if(x.left>.01)s+=`<div class="tri-ai48-warn"><b>Пока не найден подтверждённый источник продаж: ${money(x.left)}.</b> Эта сумма не включается в «Где взять».</div>`;
  if(x.noPrice)s+=`<div class="tri-ai48-note" style="margin-top:5px">Не включено ${x.noPrice} SKU без надёжной цены из истории продаж.</div>`;
  return s;
}
function leaderHtml(m,rec){
  if(!boss()||!rec)return'';
  const current=D.has(m)?n(D.get(m)):n(approvedPlan(m));
  return `<div class="tri-ai48-leader"><div style="font-weight:900">🤖 Рекомендация ИИ: ${money(rec.amount)}</div><div class="tri-ai48-note">Аналогичный месяц прошлого года ${money(rec.ly)} · минимум +30% = ${money(rec.floor30)} · текущий прогноз ${money(rec.fc)}.<br>Товарный резерв ${money(rec.stock)} · пока не найден подтверждённый источник ${money(rec.uncovered)} · ${stockDates()}</div><div style="margin-top:7px;font-weight:800">✍️ План утверждает руководитель</div><div class="tri-ai48-note">ИИ только рекомендует. Можно поставить свою сумму — до сохранения CRM не меняется.</div><div class="tri-ai48-editor" style="margin-top:7px"><div><label class="form-label">План руководителя, BYN</label><input class="form-input" type="number" min="0" step="0.01" value="${current>0?current.toFixed(2):''}" onchange="triovistAiDraftPlanV2348('${m}',this.value)" placeholder="Введите план"></div><button class="btn-secondary" onclick="triovistAiUseRecommendationV2348('${m}')">Взять рекомендацию</button><button class="btn-primary" onclick="triovistAiSaveLeaderPlanV2348('${m}')">Сохранить мой план</button></div></div>`;
}
function managerCardHtml(m){
  const p=workingPlan(m),approved=n(approvedPlan(m)),f=fact(m),fc=forecast(f,selectedMonth()),pr=p>0?f/p:0,gap=p>0?Math.max(0,p-n(fc)):0,rec=recommendation(m),isBoss=boss();
  if(!(p>0)&&!sales().length)return `<div class="tri-ai48-card"><div class="tri-ai48-name">🎯 ${esc(managerName(m))}</div><div class="tri-ai48-loading">Продажи и план ещё загружаются. Расчёт появится автоматически.</div></div>`;
  return `<div class="tri-ai48-card"><div class="tri-ai48-head"><div><div class="tri-ai48-name">🎯 ${esc(managerName(m))}</div><div class="tri-ai48-note">${esc(selectedMonth())} · план / факт / прогноз / товарный резерв</div></div><div class="tri-ai48-note">ИИ ${V}</div></div>${isBoss?leaderHtml(m,rec):''}<div class="tri-ai48-kpis"><div class="tri-ai48-kpi"><span>Утверждённый план</span><b>${approved>0?money(approved):'Не задан'}</b></div><div class="tri-ai48-kpi"><span>Факт</span><b>${money(f)}</b></div><div class="tri-ai48-kpi"><span>Выполнение</span><b>${p>0?pct(pr):'—'}</b></div><div class="tri-ai48-kpi"><span>Прогноз</span><b>${fc==null?'—':money(fc)}</b></div><div class="tri-ai48-kpi"><span>Разрыв</span><b>${p>0?money(gap):'—'}</b></div></div>${p>0?gapHtml(m,gap):'<div class="tri-ai48-warn">План ещё не задан руководителем.</div>'}</div>`;
}
function motivationHost(){return document.getElementById('tri-v22728-pane-motivation')||document.getElementById('tri-motivation-card')?.parentElement||null}
function ensureRoot(){
  const host=motivationHost();if(!host)return null;
  document.getElementById('tri-ai-independent-root-v2347')?.remove();
  document.querySelectorAll('.tri-ai-motivation').forEach(x=>x.remove());
  let root=document.getElementById('tri-ai-independent-root-v2348');
  if(!root){root=document.createElement('div');root.id='tri-ai-independent-root-v2348';root.className='card'}
  const mot=document.getElementById('tri-motivation-card');
  if(root.parentElement!==host){if(mot&&mot.parentNode===host)host.insertBefore(root,mot);else host.insertBefore(root,host.firstChild)}
  return root;
}
function render(){
  css();const root=ensureRoot();if(!root)return;
  if(mode()!=='month'){root.innerHTML='<div class="card-title">🤖 Планы ИИ · '+V+'</div><div class="tri-ai48-warn">ИИ-планы доступны для режима «Месяц».</div>';return}
  const set=visibleManagers();if(!set.length){root.style.display='none';return}root.style.display='block';
  const s=snap(),mt=meta(),sig=[V,email(),selectedMonth(),s.loaded,s.loading,sales().length,stocks().length,mt?.partner?.snapshot_date,mt?.own?.report_date,mt?.chekhov?.snapshot_date,...set.map(m=>[m,approvedPlan(m),D.get(m),fact(m),lastYear(m)].join(':'))].join('|');
  if(sig===lastSig&&root.innerHTML)return;lastSig=sig;
  root.innerHTML=`<div class="tri-ai48-title"><div><div class="card-title">🤖 Планы по менеджерам — ИИ · ${V}</div><div class="tri-ai48-note">Менеджер видит только свой утверждённый план, прогноз и «Где взять недостающее». Расчёт не ждёт загрузку задач и зарплатной мотивации.</div></div>${s.loading?'<div class="tri-ai48-note">Данные обновляются…</div>':''}</div><div class="tri-ai48-grid">${set.map(managerCardHtml).join('')}</div>`;
}
function schedule(d=0){clearTimeout(timer);timer=setTimeout(render,d)}
function startProbe(){
  if(probeTimer)return;probeTicks=0;
  probeTimer=setInterval(()=>{
    probeTicks++;const active=document.getElementById('page-triovist')?.classList.contains('active');
    if(active){lastSig='';schedule(0)}
    if(probeTicks>=40){clearInterval(probeTimer);probeTimer=null}
  },500);
}

window.triovistAiDraftPlanV2348=(m,v)=>{m=String(m).toLowerCase();if(!boss()||!M.includes(m))return;const z=parse(v);if(z==null||z<0)D.delete(m);else D.set(m,z);lastSig='';schedule(0)};
window.triovistAiUseRecommendationV2348=m=>{m=String(m).toLowerCase();if(!boss()||!M.includes(m))return;const r=recommendation(m);if(!r)return alert('Пока нет базы для рекомендации ИИ.');D.set(m,r.amount);lastSig='';schedule(0)};
window.triovistAiSaveLeaderPlanV2348=async m=>{
  m=String(m).toLowerCase();if(!boss()||saving||!M.includes(m))return;
  const v=D.has(m)?n(D.get(m)):n(approvedPlan(m));if(!(v>=0))return alert('Введите корректный план.');
  saving=true;
  try{
    let database=null;try{if(typeof db!=='undefined')database=db}catch(_){}database=database||window.db;
    if(!database?.rpc)throw Error('Соединение с базой ещё не готово.');
    const r=await database.rpc('triovist_set_plan',{p_manager_email:m,p_period_month:selectedMonth(),p_plan_amount:Math.round(v*100)/100});if(r.error)throw r.error;
    D.delete(m);alert('✅ План '+managerName(m)+' сохранён: '+money(v));
    if(typeof window.triovistReload==='function')await window.triovistReload();lastSig='';schedule(0);startProbe();
  }catch(x){alert('Не удалось сохранить план: '+String(x?.message||x))}finally{saving=false}
};

function hook(){
  document.getElementById('tri-ai-independent-root-v2347')?.remove();
  document.querySelectorAll('.tri-ai-motivation').forEach(x=>x.remove());
  const baseRender=window.renderTriovist;
  if(typeof baseRender==='function'&&!baseRender.__ai2348){const w=function(){const out=baseRender.apply(this,arguments);lastSig='';schedule(0);startProbe();return out};w.__ai2348=true;window.renderTriovist=w;try{renderTriovist=w}catch(_){}}
  const baseReload=window.triovistReload;
  if(typeof baseReload==='function'&&!baseReload.__ai2348){const w=async function(){const out=await baseReload.apply(this,arguments);lastSig='';schedule(0);startProbe();return out};w.__ai2348=true;window.triovistReload=w;try{triovistReload=w}catch(_){}}
  document.addEventListener('click',e=>{if(e.target?.closest?.('[data-tab="motivation"],#tri-v22728-tab-motivation')){lastSig='';schedule(0);startProbe()}});
  window.addEventListener('focus',()=>{if(document.getElementById('page-triovist')?.classList.contains('active')){lastSig='';schedule(0);startProbe()}});
  if(!motivationHost()){
    bootObserver=new MutationObserver(()=>{if(motivationHost()){bootObserver?.disconnect();bootObserver=null;lastSig='';schedule(0);startProbe()}});bootObserver.observe(document.body,{childList:true,subtree:true});
  }
  schedule(0);startProbe();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',hook,{once:true});else hook();
window.RESANTA_TRIOVIST_AI_PLANS_V2348=Object.freeze({version:V,cacheSafeRoot:true,directLexicalAuth:true,managerGapAlwaysVisible:true,localStateProbe:true,localCalculation:true,noHeavyAiRpc:true,leaderManualApproval:true,stockAware:true,noAutoSave:true,noSqlChanges:true});
})();