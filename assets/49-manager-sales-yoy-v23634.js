/* RESANTA CRM v23.6.34 · MANAGER SALES YEAR-OVER-YEAR
 * Separate lazy sales comparison inside Sales · Analytics.
 * Month / quarter / YTD, all current field managers, client drilldown.
 * No polling, no observers, no writes.
 */
(function(){
'use strict';
if(window.RESANTA_MANAGER_SALES_YOY_V23634)return;

const VERSION='v23.6.34';
const ROOT_ID='manager-sales-yoy-v23634';
const CACHE_TTL=120000;
const cache=new Map();
let state={opened:false,mode:'month',year:new Date().getFullYear(),period:new Date().getMonth()+1,manager:null,trend:'all',search:'',summary:null,clients:[],loading:false};

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number.isFinite(Number(v))?Number(v):0;
function money(v){return Number(v||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';}
function signed(v){const n=num(v);return (n>0?'+':'')+money(n);}
function pct(v){if(v===null||v===undefined||v==='')return'—';const n=num(v);return(n>0?'+':'')+n.toLocaleString('ru-RU',{maximumFractionDigits:1})+'%';}
function trendMeta(t){return({fall:['🔴','Падение','var(--r)'],growth:['🟢','Рост','var(--g)'],new:['🆕','Новый','var(--at)'],lost:['❌','Потерян','var(--r)'],same:['⚪','Без изменений','var(--sub)']}[t]||['⚪','—','var(--sub)']);}
function monthName(m){return['','Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'][Number(m)]||String(m);}
function periodLabel(d){
  const y=d?.year||state.year,py=d?.previous_year||y-1;
  if((d?.period_type||state.mode)==='month')return monthName(d?.period||state.period)+' '+y+' ↔ '+monthName(d?.period||state.period)+' '+py;
  if((d?.period_type||state.mode)==='quarter')return (d?.period||state.period)+' квартал '+y+' ↔ '+(d?.period||state.period)+' квартал '+py;
  return 'Январь–'+monthName(d?.period||state.period)+' '+y+' ↔ тот же период '+py;
}
function currentRole(){try{return String(window.currentProfile?.role||currentProfile?.role||'');}catch(_){return String(window.currentProfile?.role||'');}}
function allowed(){return ['boss','manager'].includes(currentRole());}

function style(){
  if(document.getElementById('manager-sales-yoy-style-v23634'))return;
  const s=document.createElement('style');s.id='manager-sales-yoy-style-v23634';
  s.textContent=`
  #${ROOT_ID}{border:1px solid #BFDBFE;background:linear-gradient(180deg,#fff,#F8FBFF)}
  .msy-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
  .msy-title{font-size:15px;font-weight:800;color:var(--text)}.msy-sub{font-size:11px;color:var(--sub);line-height:1.5;margin-top:4px}
  .msy-filters{display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin:12px 0}.msy-filter{min-width:120px}.msy-filter label{display:block;font-size:10px;color:var(--sub);margin-bottom:4px;text-transform:uppercase;font-weight:700}
  .msy-mini{padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:#fff;font-size:12px;color:var(--text)}
  .msy-table-wrap{overflow:auto;border:1px solid var(--border);border-radius:10px;background:#fff}.msy-table{width:100%;border-collapse:collapse;min-width:900px}.msy-table th{font-size:10px;text-transform:uppercase;color:var(--sub);text-align:right;padding:8px;border-bottom:1px solid var(--border);background:#F8FAFC;white-space:nowrap}.msy-table th:first-child,.msy-table td:first-child{text-align:left}.msy-table td{font-size:12px;text-align:right;padding:9px 8px;border-bottom:1px solid var(--border);white-space:nowrap}.msy-table tr:last-child td{border-bottom:none}.msy-row{cursor:pointer}.msy-row:hover td{background:#F8FBFF}.msy-pos{color:var(--g);font-weight:700}.msy-neg{color:var(--r);font-weight:700}
  .msy-note{font-size:11px;color:var(--sub);line-height:1.5;margin-top:9px}.msy-detail{margin-top:14px;padding-top:14px;border-top:1px solid var(--border)}.msy-detail-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px}.msy-chips{display:flex;gap:6px;flex-wrap:wrap}.msy-chip{border:1px solid var(--border);background:#fff;border-radius:999px;padding:5px 9px;font-size:11px;cursor:pointer}.msy-chip.active{background:var(--ab);border-color:var(--a);color:var(--at);font-weight:700}.msy-search{padding:7px 10px;border:1px solid var(--border);border-radius:8px;font-size:12px;min-width:230px}.msy-loader{padding:20px;text-align:center;color:var(--sub);font-size:12px}.msy-error{padding:10px 12px;border-radius:8px;background:var(--rb);color:var(--r);font-size:12px;line-height:1.5}.msy-fresh{padding:8px 10px;border-radius:8px;background:var(--amb);color:var(--am);font-size:11px;line-height:1.45;margin-bottom:10px}
  @media(max-width:700px){.msy-filter{min-width:calc(50% - 4px)}.msy-filters .btn-secondary{width:100%}.msy-search{width:100%;min-width:0}}
  `;
  document.head.appendChild(s);
}

function rootHtml(){return `
  <div class="msy-head">
    <div><div class="msy-title">📊 Менеджеры · год к году</div><div class="msy-sub">Сравнение продаж по текущему закреплению клиентов. Месяц, квартал или с начала года. Нажмите на менеджера — увидите клиентов, которые дали рост или падение.</div></div>
    <button class="btn-primary" id="msy-open-v23634" onclick="window.msyOpenV23634()">Открыть сравнение</button>
  </div>
  <div id="msy-body-v23634" style="display:none"></div>`;}

function install(){
  if(!allowed())return;
  if(document.getElementById(ROOT_ID))return;
  const page=document.getElementById('page-sales');if(!page)return;
  style();
  const card=document.createElement('div');card.id=ROOT_ID;card.className='card';card.innerHTML=rootHtml();
  const kpi=page.querySelector('.kpi-row');
  if(kpi&&kpi.parentNode)kpi.insertAdjacentElement('afterend',card);else page.appendChild(card);
}

function periodOptions(){
  if(state.mode==='month')return Array.from({length:12},(_,i)=>`<option value="${i+1}" ${state.period===i+1?'selected':''}>${monthName(i+1)}</option>`).join('');
  if(state.mode==='quarter')return Array.from({length:4},(_,i)=>`<option value="${i+1}" ${state.period===i+1?'selected':''}>${i+1} квартал</option>`).join('');
  return'';
}
function years(){const now=new Date().getFullYear();return[...new Set([now,now-1,now-2,2026,2025])].sort((a,b)=>b-a).filter(y=>y>=2024&&y<=now+1);}
function controls(){return `<div class="msy-filters">
  <div class="msy-filter"><label>Сравнение</label><select class="msy-mini" id="msy-mode-v23634" onchange="window.msyModeV23634(this.value)"><option value="month" ${state.mode==='month'?'selected':''}>По месяцам</option><option value="quarter" ${state.mode==='quarter'?'selected':''}>По кварталам</option><option value="ytd" ${state.mode==='ytd'?'selected':''}>С начала года</option></select></div>
  <div class="msy-filter"><label>Год</label><select class="msy-mini" id="msy-year-v23634" onchange="window.msyYearV23634(this.value)">${years().map(y=>`<option value="${y}" ${state.year===y?'selected':''}>${y} vs ${y-1}</option>`).join('')}</select></div>
  ${state.mode==='ytd'?'':`<div class="msy-filter"><label>${state.mode==='quarter'?'Квартал':'Месяц'}</label><select class="msy-mini" id="msy-period-v23634" onchange="window.msyPeriodV23634(this.value)">${periodOptions()}</select></div>`}
  <button class="btn-secondary" onclick="window.msyRefreshV23634()">↻ Обновить</button>
  </div>`;}
function freshness(d){const f=d?.freshness||{};if(!f.report_date&&!f.last_success_at)return'';return `<div class="msy-fresh">🕒 Продажи 1С: ${esc(f.report_date||String(f.last_success_at||'').slice(0,10)||'—')} · ${esc(f.report_period||'')} · строк: ${Number(f.row_count||0).toLocaleString('ru-RU')}</div>`;}

function summaryTable(d){
  const rows=d?.managers||[];if(!rows.length)return'<div class="msy-error">За выбранный период нет привязанных продаж менеджеров.</div>';
  const cy=d.year,py=d.previous_year;
  return `<div class="msy-table-wrap"><table class="msy-table"><thead><tr><th>Менеджер</th><th>${py}</th><th>${cy}</th><th>Δ BYN</th><th>Δ %</th><th>Клиентов</th><th>Рост</th><th>Падение</th><th>Новые</th><th>Потеряны</th></tr></thead><tbody>${rows.map(r=>{
    const delta=num(r.delta),cls=delta>=0?'msy-pos':'msy-neg';return `<tr class="msy-row" onclick="window.msyManagerV23634('${String(r.manager_name||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'")}')"><td><b>${esc(r.manager_name)}</b><div style="font-size:10px;color:var(--sub);margin-top:2px">открыть клиентов →</div></td><td>${money(r.previous_revenue)}</td><td>${money(r.current_revenue)}</td><td class="${cls}">${signed(delta)}</td><td class="${cls}">${pct(r.growth_pct)}</td><td>${Number(r.clients_any||0)}</td><td class="msy-pos">${Number(r.growing||0)}</td><td class="msy-neg">${Number(r.falling||0)}</td><td>${Number(r.new_clients||0)}</td><td class="msy-neg">${Number(r.lost_clients||0)}</td></tr>`;
  }).join('')}</tbody></table></div>`;}

function bodyLoading(){const b=document.getElementById('msy-body-v23634');if(b)b.innerHTML=controls()+'<div class="msy-loader">Загружаю сравнение продаж…</div>';}
function renderSummary(){
  const b=document.getElementById('msy-body-v23634');if(!b)return;
  const d=state.summary;if(!d){b.innerHTML=controls();return;}
  b.innerHTML=controls()+freshness(d)+`<div style="font-size:12px;font-weight:700;margin:2px 0 9px">${esc(periodLabel(d))}</div>`+summaryTable(d)+`<div class="msy-note">Считаются продажи с НДС по текущему закреплению клиента за менеджером. Строки «Итого» из 1С исключены, чтобы не было двойного счёта. Процент не показывается, если база прошлого года ≤ 0.</div><div id="msy-detail-v23634"></div>`;
  if(state.manager)renderDetail();
}

function filteredClients(){
  let a=[...(state.clients||[])];
  if(state.trend!=='all')a=a.filter(x=>x.trend===state.trend);
  const q=state.search.trim().toLowerCase();if(q)a=a.filter(x=>[x.client_name,x.city,x.region,x.category].some(v=>String(v||'').toLowerCase().includes(q)));
  if(state.trend==='growth'||state.trend==='new')a.sort((a,b)=>num(b.delta)-num(a.delta));else a.sort((a,b)=>num(a.delta)-num(b.delta));
  return a;
}
function renderDetail(){
  const box=document.getElementById('msy-detail-v23634');if(!box||!state.manager)return;
  const d=state.summary||{},rows=filteredClients(),cy=d.year||state.year,py=d.previous_year||state.year-1;
  box.innerHTML=`<div class="msy-detail"><div class="msy-detail-head"><div><b>${esc(state.manager)}</b><div style="font-size:11px;color:var(--sub);margin-top:2px">Клиенты · ${esc(periodLabel(d))}</div></div><button class="btn-secondary" onclick="window.msyCloseManagerV23634()">Закрыть</button></div>
    <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px"><div class="msy-chips">${[['all','Все'],['fall','🔴 Падение'],['growth','🟢 Рост'],['new','🆕 Новые'],['lost','❌ Потеряны']].map(([k,l])=>`<button class="msy-chip ${state.trend===k?'active':''}" onclick="window.msyTrendV23634('${k}')">${l}</button>`).join('')}</div><input class="msy-search" placeholder="Поиск клиента…" value="${esc(state.search)}" oninput="window.msySearchV23634(this.value)"></div>
    <div style="font-size:11px;color:var(--sub);margin-bottom:7px">Показано клиентов: ${rows.length}</div>
    <div class="msy-table-wrap"><table class="msy-table" style="min-width:820px"><thead><tr><th>Клиент</th><th>Кат.</th><th>${py}</th><th>${cy}</th><th>Δ BYN</th><th>Δ %</th><th>Статус</th></tr></thead><tbody>${rows.map(r=>{const m=trendMeta(r.trend),delta=num(r.delta),cls=delta>=0?'msy-pos':'msy-neg';return `<tr><td>${r.client_id?`<span style="cursor:pointer;font-weight:600" onclick="window.msyClientV23634('${esc(r.client_id)}')">${esc(r.client_name)}</span>`:`<b>${esc(r.client_name)}</b>`}<div style="font-size:10px;color:var(--sub);margin-top:2px">${esc([r.city,r.region].filter(Boolean).join(' · '))}</div></td><td>${esc(r.category||'—')}</td><td>${money(r.previous_revenue)}</td><td>${money(r.current_revenue)}</td><td class="${cls}">${signed(delta)}</td><td class="${cls}">${pct(r.growth_pct)}</td><td style="color:${m[2]};font-weight:700">${m[0]} ${m[1]}</td></tr>`;}).join('')||'<tr><td colspan="7" style="text-align:center;color:var(--sub);padding:18px">Нет клиентов по выбранному фильтру</td></tr>'}</tbody></table></div></div>`;
}

function cacheKey(manager){return[state.mode,state.year,state.period,manager||'all'].join('|');}
async function fetchData(manager=null,force=false){
  const key=cacheKey(manager),hit=cache.get(key);if(!force&&hit&&Date.now()-hit.at<CACHE_TTL)return hit.data;
  const args={p_period_type:state.mode,p_year:Number(state.year),p_period:state.mode==='ytd'?null:Number(state.period),p_manager:manager||null};
  const {data,error}=await db.rpc('crm_manager_sales_yoy_v23634',args);if(error)throw error;
  cache.set(key,{at:Date.now(),data});return data;
}

window.msyOpenV23634=async function(){
  state.opened=true;const b=document.getElementById('msy-body-v23634');if(b)b.style.display='block';const btn=document.getElementById('msy-open-v23634');if(btn)btn.style.display='none';
  await window.msyRefreshV23634(false);
};
window.msyRefreshV23634=async function(force=true){
  if(state.loading)return;state.loading=true;bodyLoading();
  try{state.manager=null;state.clients=[];state.summary=await fetchData(null,force);renderSummary();}
  catch(e){const b=document.getElementById('msy-body-v23634');if(b)b.innerHTML=controls()+`<div class="msy-error">Не удалось загрузить сравнение: ${esc(e?.message||e)}</div>`;}
  finally{state.loading=false;}
};
window.msyModeV23634=function(v){state.mode=v;if(v==='quarter')state.period=Math.min(4,Math.ceil((new Date().getMonth()+1)/3));else if(v==='month')state.period=new Date().getMonth()+1;state.manager=null;state.clients=[];window.msyRefreshV23634(false);};
window.msyYearV23634=function(v){state.year=Number(v)||state.year;state.manager=null;state.clients=[];window.msyRefreshV23634(false);};
window.msyPeriodV23634=function(v){state.period=Number(v)||1;state.manager=null;state.clients=[];window.msyRefreshV23634(false);};
window.msyManagerV23634=async function(name){
  if(state.loading)return;state.loading=true;state.manager=name;state.trend='all';state.search='';
  const box=document.getElementById('msy-detail-v23634');if(box)box.innerHTML='<div class="msy-loader">Загружаю клиентов '+esc(name)+'…</div>';
  try{const d=await fetchData(name,false);state.clients=d?.clients||[];renderDetail();document.getElementById('msy-detail-v23634')?.scrollIntoView({behavior:'smooth',block:'nearest'});}
  catch(e){if(box)box.innerHTML=`<div class="msy-error">Не удалось загрузить клиентов: ${esc(e?.message||e)}</div>`;}
  finally{state.loading=false;}
};
window.msyCloseManagerV23634=function(){state.manager=null;state.clients=[];state.trend='all';state.search='';const b=document.getElementById('msy-detail-v23634');if(b)b.innerHTML='';};
window.msyTrendV23634=function(v){state.trend=v;renderDetail();};
window.msySearchV23634=function(v){state.search=v;renderDetail();const i=document.querySelector('#msy-detail-v23634 .msy-search');if(i){i.focus();try{i.setSelectionRange(i.value.length,i.value.length);}catch(_){}}};
window.msyClientV23634=function(id){try{if(typeof openClient==='function')openClient(id);}catch(e){console.warn('open client from manager yoy',e);}};

install();
window.RESANTA_MANAGER_SALES_YOY_V23634=Object.freeze({version:VERSION,lazy:true,month:true,quarter:true,ytd:true,allManagers:true,currentOwnership:true,noPolling:true,noWrites:true});
})();
