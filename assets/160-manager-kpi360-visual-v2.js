/* RESANTA CRM KPI360 visual v2: director overview / manager personal view.
 * Read-only dashboard; existing plan editor is reused; scoped server RPC is mandatory.
 * No eager AI loading, no writes, no copies of customer records in localStorage. */
(function(w){
'use strict';
if(w.RESANTA_KPI360_VISUAL_V2)return;
const ID='kpi360-visual-v2', months=['','Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
let generation=0,shown=null,selectedManager='',clientFilter='bonus',manuallySelected=false;
const n=x=>Number.isFinite(Number(x))?Number(x):0;
const money=x=>n(x).toLocaleString('ru-RU',{maximumFractionDigits:0});
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=x=>String(x||'').trim().toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ');
const percent=(x,y)=>n(y)>0?Math.round(n(x)/n(y)*100):null;
const pc=(x,y)=>percent(x,y)==null?'—':percent(x,y)+'%';
const shift=(v,by)=>{const [y,m]=v.split('-').map(Number);let d=new Date(Date.UTC(y,m-1+by,1));return d.toISOString().slice(0,7)};
const month=()=>String(document.getElementById('manager-kpi-month')?.value||'').slice(0,7);
const active=()=>document.getElementById('page-managers')?.classList.contains('active');
const role=()=>w.currentProfile?.role, isBoss=()=>role()==='boss';
const nameMonth=v=>months[Number(String(v).slice(5,7))]+' '+String(v).slice(0,4);
const db=()=>{try{return typeof window.db!=='undefined'?window.db:globalThis.db}catch(_){return null}};
const icon=(x)=>({sales:'↗',bonus:'◎',akb:'▣'}[x]||'•');
function latestData(v){return !!v?.latest_sales_month&&v.month<=v.latest_sales_month}
function mapped(v){
 const s=Array.isArray(v.sales)?v.sales:[],m=Array.isArray(v.managers)?v.managers:[],p=Array.isArray(v.prior_sales)?v.prior_sales:[];
 return s.map(r=>{
  const o=m.find(x=>norm(x.manager_name)===norm(r.manager_name))||{};
  const ly=p.find(x=>norm(x.manager_name)===norm(r.manager_name))||{};
  return {...r,...o,sales_2025:ly.sales_2025??null};
 });
}
function totals(v){
 const rows=mapped(v),sum=k=>rows.reduce((s,r)=>s+n(r[k]),0),s=v.summary||{};
 return {sales:sum('shipment'),sales_plan:sum('shipment_plan'),
  prev_sales:rows.some(r=>r.sales_2025!==null)?sum('sales_2025'):null,
  bonus:n(s.bonus),bonus_plan:sum('new_clients_plan'),
  first:n(s.first),returned:n(s.returned),bonus_previous:n(s.bonus_previous),
  akb:n(s.akb),akb_previous:n(s.akb_previous),akb_plan:sum('akb_plan')};
}
function growth(x,y){if(y===null||y===undefined||!Number.isFinite(Number(y)))return 'нет данных';if(n(y)===0)return n(x)===0?'0%':'нет базы';const p=(n(x)-n(y))/Math.abs(n(y))*100;return (p>=0?'+':'')+p.toLocaleString('ru-RU',{maximumFractionDigits:1})+'%'}
function root(){
 const page=document.getElementById('page-managers');if(!page)return null;
 const olderCard=document.getElementById('managers-table')?.closest('.card');if(olderCard)olderCard.style.display='none';
 const olderDashboard=document.getElementById('manager-kpi360-v1');if(olderDashboard)olderDashboard.style.display='none';
 let el=document.getElementById(ID);
 if(!el){el=document.createElement('section');el.id=ID;const legacy=document.getElementById('manager-kpi360-v1');if(legacy)legacy.insertAdjacentElement('beforebegin',el);else page.appendChild(el);}
 page.querySelector('.page-title')?.replaceChildren(document.createTextNode(isBoss()?'Менеджеры · KPI 360°':'Мои показатели · KPI 360°'));
 const plans=page.querySelector('button[onclick="openManagerPlanEditor()"]');if(plans)plans.style.display=isBoss()?'inline-flex':'none';
 return el;
}
function styles(){
 if(document.getElementById(ID+'-css'))return;
 const el=document.createElement('style');el.id=ID+'-css';
 el.textContent=[
 '#manager-kpi360-v1,#manager-kpi-leaderboard-v2263,#manager-new-clients-v236135,#page-managers #managers-table{display:none!important}',
 '#page-managers #managers-table{display:none!important}',
 '#page-managers #managers-table~*{display:none!important}',
 '#kpi360-visual-v2{font-size:13px;color:var(--text,#172033);max-width:1560px}',
 '#kpi360-visual-v2 .kv-top{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:3px 0 12px}',
 '#kpi360-visual-v2 .kv-note{font-size:11px;color:var(--sub,#667085);line-height:1.5}',
 '#kpi360-visual-v2 .kv-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}',
 '#kpi360-visual-v2 .kv-card{border:1px solid var(--border,#e1e6ee);background:#fff;border-radius:13px;padding:15px;box-shadow:0 2px 8px rgba(15,35,60,.035);min-width:0}',
 '#kpi360-visual-v2 .kv-metric{font-size:25px;font-weight:830;letter-spacing:-.5px;margin:7px 0 4px}',
 '#kpi360-visual-v2 .kv-label{font-size:12px;font-weight:750}',
 '#kpi360-visual-v2 .kv-green{color:#15803d}#kpi360-visual-v2 .kv-red{color:#b42318}#kpi360-visual-v2 .kv-blue{color:#1669c5}',
 '#kpi360-visual-v2 .kv-track{height:8px;background:#e8edf4;border-radius:99px;overflow:hidden;margin:12px 0 6px}',
 '#kpi360-visual-v2 .kv-track>i{height:100%;display:block;background:#2073dd;border-radius:99px}',
 '#kpi360-visual-v2 .kv-charts{display:grid;grid-template-columns:1.25fr 1fr;gap:12px;margin-top:12px}',
 '#kpi360-visual-v2 h3{font-size:14px;font-weight:800;margin:0 0 12px}',
 '#kpi360-visual-v2 .kv-bar{display:grid;grid-template-columns:75px minmax(0,1fr) 78px;gap:8px;align-items:center;padding:9px 0}',
 '#kpi360-visual-v2 .kv-bg{height:16px;border-radius:5px;background:#e8edf4;position:relative;overflow:hidden}',
 '#kpi360-visual-v2 .kv-bg>i{position:absolute;height:100%;left:0;top:0;background:#2479e6;border-radius:5px}',
 '#kpi360-visual-v2 .kv-bg>.kv-warn{background:#f28a44}',
 '#kpi360-visual-v2 .kv-stack{display:flex;height:15px;border-radius:99px;overflow:hidden;background:#e8edf4;margin:16px 0}',
 '#kpi360-visual-v2 .kv-stack .kv-first{background:#1669dd}#kpi360-visual-v2 .kv-stack .kv-return{background:#ac76ee}',
 '#kpi360-visual-v2 .kv-hint{border-radius:12px;padding:15px;margin-top:12px;background:#edf4ff;border:1px solid #d4e3fb}',
 '#kpi360-visual-v2 .kv-risk{margin-top:12px;background:#fffbf3;border-color:#f6ddb2}',
 '#kpi360-visual-v2 .kv-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}',
 '#kpi360-visual-v2 button{cursor:pointer;border-radius:8px;padding:8px 11px;font-size:12px;font-weight:650;border:1px solid #d7e0eb;background:#fff;color:#1c3f6b}',
 '#kpi360-visual-v2 button.kv-primary{background:#1767c8;border-color:#1767c8;color:#fff}',
 '#kpi360-visual-v2 button.kv-active{background:#e6f0ff;border-color:#87b8f1}',
 '#kpi360-visual-v2 .kv-table{width:100%;border-collapse:collapse;font-size:12px}',
 '#kpi360-visual-v2 .kv-table th{text-align:left;color:#667085;font-size:11px;border-bottom:1px solid #e5eaf1;padding:9px 7px}',
 '#kpi360-visual-v2 .kv-table td{padding:10px 7px;border-bottom:1px solid #edf0f6;vertical-align:top}',
 '#kpi360-visual-v2 .kv-down{color:#b42318}#kpi360-visual-v2 .kv-up{color:#16803c}',
 '#kpi360-visual-v2 .kv-details{margin-top:12px}#kpi360-visual-v2 .kv-row{display:flex;justify-content:space-between;gap:12px;border-top:1px solid #edf0f6;padding:9px 0}',
 '#kpi360-visual-v2 .kv-legend{display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:11px;color:#667085;margin-bottom:9px}',
 '#kpi360-visual-v2 .kv-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;background:#1669dd}',
 '@media(max-width:850px){#kpi360-visual-v2 .kv-charts{grid-template-columns:1fr}#kpi360-visual-v2 .kv-grid{grid-template-columns:1fr}}',
 '@media(max-width:600px){#kpi360-visual-v2 .kv-table{font-size:10px}#kpi360-visual-v2 .kv-card{padding:11px}#kpi360-visual-v2 .kv-bar{grid-template-columns:66px minmax(0,1fr) 58px}}'
 ].join('\n');document.head.appendChild(el);
}
function card(title,value,sub,foot,kind,completion){
 return '<article class="kv-card"><div class="kv-label">'+icon(kind)+' '+esc(title)+'</div><div class="kv-metric">'+esc(value)+'</div>'+
 '<div class="kv-note">'+esc(sub)+'</div><div class="kv-track"><i style="width:'+Math.max(0,Math.min(100,n(completion)))+'%"></i></div>'+
 '<div style="margin-top:8px;font-weight:750" class="'+(String(foot).startsWith('-')?'kv-red':'kv-green')+'">'+esc(foot)+'</div></article>';
}
function chartBars(rows){
 const scale=Math.max(...rows.map(x=>Math.max(n(x.shipment),n(x.shipment_plan))),1);
 return '<div class="kv-card"><h3>Продажи по менеджерам</h3>'+
 rows.map(r=>'<div class="kv-bar"><span>'+esc(r.manager_name)+'</span><div class="kv-bg" title="План: '+esc(money(r.shipment_plan))+'">'+
 '<i class="'+(percent(r.shipment,r.shipment_plan)<60?'kv-warn':'')+'" style="width:'+Math.min(100,100*n(r.shipment)/scale)+'%"></i></div>'+
 '<span style="text-align:right;font-weight:800">'+esc(pc(r.shipment,r.shipment_plan))+'</span></div>').join('')+
 '<div class="kv-note">Синие полосы — факт, серая шкала — единая шкала продаж. Планы и факты указаны в деталях.</div></div>';
}
function clientChart(x){
 const total=n(x.first)+n(x.returned),firstWidth=total?100*n(x.first)/total:0;
 return '<div class="kv-card"><h3>Клиенты для KPI · премия</h3>'+
 '<div style="font-size:30px;font-weight:850">'+total+'</div>'+
 '<div class="kv-stack"><span class="kv-first" style="width:'+firstWidth+'%"></span><span class="kv-return" style="width:'+(100-firstWidth)+'%"></span></div>'+
 '<div class="kv-legend"><span><i class="kv-dot"></i>Впервые в истории: <b>'+n(x.first)+'</b></span>'+
 '<span><i class="kv-dot" style="background:#ac76ee"></i>Вернулись после 6 мес.: <b>'+n(x.returned)+'</b></span></div>'+
 '<div class="kv-note">Обе категории учитываются в премиальном KPI. Проверено по доступной истории с февраля 2023 года.</div></div>';
}
function trendChart(data){
 const items=(data.trend||[]).slice(-6);if(!items.length)return '';
 const vals=items.flatMap(x=>[n(x.current),n(x.previous)]),max=Math.max(...vals,1)*1.1;
 const pos=(key)=>items.map((r,i)=>(24+i*91)+','+(140-125*n(r[key])/max).toFixed(1)).join(' ');
 return '<div class="kv-card" style="margin-top:12px"><h3>Динамика продаж · последние 6 месяцев</h3>'+
 '<div class="kv-legend"><span><i class="kv-dot"></i>Выбранный год</span><span><i class="kv-dot" style="background:#a3a1ef"></i>Предыдущий год</span></div>'+
 '<svg viewBox="0 0 525 175" role="img" aria-label="Продажи: выбранный год и предыдущий год" style="width:100%;max-height:210px">'+
 '<line x1="20" y1="145" x2="505" y2="145" stroke="#dce4ee"/>'+
 '<polyline points="'+pos('previous')+'" fill="none" stroke="#aca6eb" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'+
 '<polyline points="'+pos('current')+'" fill="none" stroke="#1769d8" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>'+
 items.map((r,i)=>'<text x="'+(24+i*91)+'" y="168" font-size="12" text-anchor="middle" fill="#68788d">'+esc(months[Number(r.month.slice(5,7))])+'</text>').join('')+
 '</svg><div class="kv-note">Динамика по закреплённым клиентам из истории 1С. Для KPI используются утверждённые месячные факты.</div></div>';
}
function summaryText(data,rows,t){
 const worst=[...rows].filter(x=>n(x.shipment_plan)>0).sort((a,b)=>n(a.shipment)/n(a.shipment_plan)-n(b.shipment)/n(b.shipment_plan))[0];
 return 'Продажи: '+pc(t.sales,t.sales_plan)+' от плана, изменение к прошлому году '+growth(t.sales,t.prev_sales)+'. '+
 'Клиентов для премиального KPI: '+t.bonus+' из '+money(t.bonus_plan)+
 ' ('+t.first+' первых в истории и '+t.returned+' вернувшихся). '+
 'Уникальная АКБ: '+t.akb+(t.akb_previous?' против '+t.akb_previous+' год назад. ':'. ')+
 (worst?'Зона внимания — '+worst.manager_name+': '+pc(worst.shipment,worst.shipment_plan)+' продажного плана.':'');
}
function renderDetails(data,rows){
 const host=document.getElementById(ID+'-detail');if(!host)return;
 const target=selectedManager||(!isBoss()?rows[0]?.manager_name:'');
 const list=(data.clients||[]).filter(x=>!target||norm(x.manager_name)===norm(target))
  .filter(x=>clientFilter==='all'||clientFilter==='bonus'&&x.type!=='active'||clientFilter===x.type);
 const all=(data.clients||[]).filter(x=>!target||norm(x.manager_name)===norm(target));
 const buttons=[['bonus','Для KPI'],['first','Впервые'],['returned','Вернувшиеся'],['all','Вся АКБ']];
 host.innerHTML='<div class="kv-card kv-details"><div class="kv-top"><h3 style="margin:0">'+
 (target?'Клиенты · '+esc(target):'Клиенты менеджеров')+'</h3><span class="kv-note">'+all.length+' активных клиентов</span></div>'+
 '<div class="kv-actions">'+buttons.map(([k,label])=>'<button data-filter="'+k+'" class="'+(clientFilter===k?'kv-active':'')+'">'+label+'</button>').join('')+
 (isBoss()&&target?'<button data-allmgr>Все менеджеры</button>':'')+'</div>'+
 (list.length?'<div style="overflow-x:auto"><table class="kv-table"><thead><tr><th>Клиент</th><th>Статус</th><th>Отгрузка</th><th>Предыдущая</th></tr></thead><tbody>'+
 list.map(c=>'<tr><td>'+esc(c.client_name)+'</td><td>'+esc(c.type==='first'?'Первая в истории':c.type==='returned'?'Вернувшийся':'Активный')+'</td><td>'+esc(money(c.shipment))+'</td><td>'+esc(c.last_sale||'—')+'</td></tr>').join('')+
 '</tbody></table></div>':'<div class="kv-note" style="padding:15px 0">По этому фильтру клиентов нет.</div>')+'</div>';
 host.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{clientFilter=b.dataset.filter;renderDetails(data,rows)});
 host.querySelector('[data-allmgr]')?.addEventListener('click',()=>{selectedManager='';renderDetails(data,rows)});
}
function exportCsv(data,rows,t){
 const head=['Месяц','Менеджер','Продажи','План','2025 продажи','АКБ','АКБ год назад','Премиальные','Новые','Вернувшиеся','План премиальных'];
 const arr=[head,...rows.map(r=>[data.month,r.manager_name,r.shipment,r.shipment_plan,r.sales_2025,r.akb,r.akb_previous,r.bonus,r.first,r.returned,r.new_clients_plan]),
 [data.month,'ИТОГО',t.sales,t.sales_plan,t.prev_sales,t.akb,t.akb_previous,t.bonus,t.first,t.returned,t.bonus_plan],
 [],['Клиент','Менеджер','Категория','Отгрузка','Последняя прежняя отгрузка'],...(data.clients||[]).map(r=>[r.client_name,r.manager_name,r.type,r.shipment,r.last_sale])];
 const csv='\uFEFF'+arr.map(row=>row.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='KPI360_'+data.month+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function launchLera(){
 const b=document.querySelector('.rva-launch')||document.querySelector('.rva-ai360-safe-launch');
 if(b&&!b.hidden){b.click();return}
 const target=document.querySelector('.rva-ai360-safe-launch');if(target){target.click();return}
 alert('Лера запускается в CRM по кнопке «РЕСАНТА AI 360°» в верхней панели. Брифинг KPI уже показан на экране.');
}
function render(data){
 if(!active()||month()!==data.month)return;const el=root();if(!el)return;
 if(!latestData(data)){el.innerHTML='<div class="kv-card">За '+esc(nameMonth(data.month))+' данные 1С ещё не поступили. Последний месяц: '+esc(nameMonth(data.latest_sales_month||''))+'.</div>';return}
 const rows=mapped(data),t=totals(data);
 const header='<div class="kv-top"><div><strong style="font-size:17px">KPI 360° · '+esc(nameMonth(data.month))+'</strong>'+
 '<div class="kv-note">Проверенный расчёт · 2025 по текущему закреплению · месяц предварительный до закрытия</div></div>'+
 '<div class="kv-actions" style="margin:0"><button data-refresh>↻ Обновить</button><button data-export>Excel</button></div></div>';
 const cards='<div class="kv-grid">'+card('Продажи',money(t.sales)+' бел. руб.','План '+money(t.sales_plan)+' · '+pc(t.sales,t.sales_plan),
 'К прошлому году '+growth(t.sales,t.prev_sales),'sales',percent(t.sales,t.sales_plan))+
 card('Клиенты для KPI',t.bonus+' / '+money(t.bonus_plan),t.first+' первых · '+t.returned+' вернувшихся',
 'Выполнение '+pc(t.bonus,t.bonus_plan),'bonus',percent(t.bonus,t.bonus_plan))+
 card('Уникальная АКБ',money(t.akb),isBoss()?'Год назад: '+money(t.akb_previous):'Моя активная база',
 'К прошлому году '+growth(t.akb,t.akb_previous),'akb',percent(t.akb,t.akb_plan))+'</div>';
 const chart='<div class="kv-charts">'+chartBars(rows)+clientChart(t)+'</div>';
 const narr='<div class="kv-hint"><h3>◉ Коротко за месяц</h3><div>'+esc(summaryText(data,rows,t))+'</div>'+
 '<div class="kv-actions">'+(isBoss()?'<button class="kv-primary" data-lera>✦ Спросить Леру</button>':'')+
 '<button data-scroll>Клиенты и детализация ↓</button></div></div>';
 const mgr=isBoss()?'<div class="kv-card kv-details"><h3>Менеджеры · детализация по нажатию</h3><div style="overflow-x:auto"><table class="kv-table"><thead>'+
 '<tr><th>Менеджер</th><th>Продажи / план</th><th>АКБ</th><th>Для KPI</th><th></th></tr></thead><tbody>'+
 rows.map(r=>'<tr><td><b>'+esc(r.manager_name)+'</b></td><td>'+money(r.shipment)+' / '+money(r.shipment_plan)+' · '+pc(r.shipment,r.shipment_plan)+
 '</td><td>'+n(r.akb)+'</td><td>'+n(r.bonus)+' ('+n(r.first)+' + '+n(r.returned)+')</td>'+
 '<td><button data-manager="'+esc(r.manager_name)+'">Клиенты</button></td></tr>').join('')+
 '<tr style="background:#edf4ff;font-weight:800"><td>ИТОГО</td><td>'+money(t.sales)+' / '+money(t.sales_plan)+
 '</td><td>'+n(t.akb)+'</td><td>'+n(t.bonus)+'</td><td>—</td></tr></tbody></table></div></div>':'';
 el.innerHTML=header+cards+chart+trendChart(data)+narr+mgr+'<section id="'+ID+'-detail"></section>'+
 '<div class="kv-note" style="margin:12px 0">Правило премии: первая отгрузка либо 6 полных месяцев без положительных отгрузок. АКБ филиала — уникальные клиенты, не сумма АКБ менеджеров. Клиенты с неоднозначными связями не объединяются автоматически.</div>';
 el.querySelector('[data-refresh]')?.addEventListener('click',()=>load(true));
 el.querySelector('[data-export]')?.addEventListener('click',()=>exportCsv(data,rows,t));
 el.querySelector('[data-lera]')?.addEventListener('click',launchLera);
 el.querySelector('[data-scroll]')?.addEventListener('click',()=>el.querySelector('#'+ID+'-detail')?.scrollIntoView({behavior:'smooth',block:'start'}));
 el.querySelectorAll('[data-manager]').forEach(b=>b.onclick=()=>{selectedManager=b.dataset.manager;clientFilter='bonus';renderDetails(data,rows);el.querySelector('#'+ID+'-detail')?.scrollIntoView({behavior:'smooth',block:'start'})});
 renderDetails(data,rows);
}
async function load(force=false){
 if(!active()||!['boss','manager'].includes(role()))return;
 styles();let el=root();if(!el)return;
 const m=month(),serial=++generation;
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m))return;
 el.innerHTML='<div class="kv-card kv-note">Загружаю KPI за '+esc(nameMonth(m))+'…</div>';
 try{
  const client=db();if(!client)throw Error('Нет подключения к Supabase');
  let response;for(let i=0;i<2;i++){try{response=await client.rpc('crm_manager_kpi360_dashboard_v2',{p_month:m});if(response.error)throw response.error;break}catch(e){if(i===1||!/fetch|network|timeout/i.test(String(e?.message||e)))throw e;await new Promise(done=>setTimeout(done,450));}}
  if(serial!==generation||!active()||month()!==m)return;
  const data=response.data;
  if(!data||data.version!=='kpi360-visual-v2'||!Array.isArray(data.sales))throw Error('Неверный ответ сервиса KPI');
  if(!manuallySelected&&m>data.latest_sales_month&&data.latest_sales_month){manuallySelected=true;document.getElementById('manager-kpi-month').value=data.latest_sales_month;void load();return;}
  shown=data;selectedManager='';clientFilter='bonus';render(data);
 }catch(e){if(serial===generation&&active())el.innerHTML='<div class="kv-card" style="color:#b42318">Не удалось загрузить KPI: '+esc(e?.message||e)+'. <button data-retry>Повторить</button></div>';
 el.querySelector('[data-retry]')?.addEventListener('click',()=>load(true));}
}
function boot(){
 if(!document.getElementById('page-managers'))return;
 styles();
 const inp=document.getElementById('manager-kpi-month');
 if(inp&&!inp.dataset.k2){inp.dataset.k2='1';inp.addEventListener('change',()=>{manuallySelected=true;selectedManager='';load(true)})}
 // The page uses this stable legacy entry point. Hide the older dashboard only after this module loads.
 w.renderManagers=()=>load();try{renderManagers=w.renderManagers}catch(_){}
 if(active())load();
}
w.RESANTA_KPI360_VISUAL_V2={load:()=>load(true),mapped,totals,version:'2.0'};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
