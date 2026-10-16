/* RESANTA CRM v23.6.374 · SALES ANALYTICS SERVER-FIRST
 * Fixes Sales page zeroes/slowdown caused by legacy local purchase_history scan.
 * Uses server aggregates only; no full purchase_history download.
 * Rebuilds manager YoY comparison to show full active AKB + unallocated legal entities.
 */
(function(){
'use strict';
if(window.RESANTA_SALES_ANALYTICS_V236374)return;
const V='v23.6.374',TTL=60000;
const monthCache=new Map(),yoyCache=new Map();
const monthFlights=new Map();
const MGRS=['Руднев','Ачинович','Шкуран'];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const money=v=>num(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const signed=v=>(num(v)>0?'+':'')+money(v);
const pct=v=>(v===null||v===undefined||v==='')?'—':((num(v)>0?'+':'')+num(v).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%');
const active=()=>{try{return typeof crmActivePage==='function'?crmActivePage():(document.getElementById('app')?.dataset?.activePage||'')}catch(_){return''}};
const dbx=()=>{try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}};
const boss=()=>{try{return currentProfile?.role==='boss'}catch(_){return false}};
const me=()=>{try{return String(currentProfile?.name||'').trim()}catch(_){return''}};
const ymNow=()=>{try{return String(TODAY||'').slice(0,7)||new Date().toISOString().slice(0,7)}catch(_){return new Date().toISOString().slice(0,7)}};
const monthLabel=ym=>{const n=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];const s=String(ym||'');const m=Number(s.slice(5,7));return (n[m-1]||s)+' '+s.slice(0,4)};
const dateArg=ym=>/^\d{4}-\d{2}$/.test(String(ym||''))?String(ym)+'-01':null;
function loadLocal(k,d=''){try{return localStorage.getItem(k)||d}catch(_){return d}}
function saveLocal(k,v){try{localStorage.setItem(k,v)}catch(_){}}
function profileManager(){return boss()?null:me()}

/* ---------- Sales month dashboard ---------- */
const monthState={
  month:loadLocal('resanta_sales_period_month_v236198',''),
  manager:boss()?loadLocal('resanta_sales_manager_v236198','all'):me(),
  months:[],
  data:null,
  loading:false
};
function effectiveManager(){return boss()?(monthState.manager==='all'?null:monthState.manager):me()}
function monthKey(){return [monthState.month||'latest',effectiveManager()||'all'].join('|')}
function setFreshness(){
  try{const e=document.getElementById('sales-freshness');if(e&&typeof salesFreshnessBanner==='function')e.innerHTML=salesFreshnessBanner()}catch(_){}
}
function ensureFilter(){
  let r=document.getElementById('sales-global-filter-v236198');
  if(!r){
    r=document.createElement('div');r.id='sales-global-filter-v236198';r.className='card';r.style.cssText='margin-bottom:12px;padding:12px 14px';
    document.getElementById('sales-freshness')?.insertAdjacentElement('beforebegin',r);
  }
  const months=monthState.months.length?monthState.months:[monthState.month||ymNow()];
  const cur=monthState.month||months[0]||ymNow(),mgr=effectiveManager()||'all';
  r.innerHTML='<div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap">'
    +'<div><label class="form-label">Месяц продаж</label><div style="display:flex;gap:5px"><button class="btn-secondary" onclick="salesStep374(-1)">←</button><select class="form-input" onchange="salesMonth374(this.value)">'+months.map(x=>'<option value="'+esc(x)+'" '+(x===cur?'selected':'')+'>'+esc(monthLabel(x))+'</option>').join('')+'</select><button class="btn-secondary" onclick="salesStep374(1)">→</button></div></div>'
    +(boss()?'<div><label class="form-label">Менеджер</label><select class="form-input" onchange="salesMgr374(this.value)"><option value="all" '+(mgr==='all'?'selected':'')+'>Все менеджеры</option>'+MGRS.map(x=>'<option value="'+esc(x)+'" '+(mgr===x?'selected':'')+'>'+esc(x)+'</option>').join('')+'</select></div>':'<div><label class="form-label">Менеджер</label><div class="form-input" style="background:var(--bg)">'+esc(me())+'</div></div>')
    +'<div style="font-size:11px;color:var(--sub);padding-bottom:8px">Данные считаются на сервере из 1С. Полная история продаж в браузер не загружается.</div>'
    +'</div><div id="sales-server-diag-v236374" style="margin-top:8px"></div>';
  const y=document.getElementById('sh-year-chips');if(y)y.style.display='none';
  const m=document.getElementById('sh-mgr-chips');if(m)m.style.display='none';
}
function renderDiag(d){
  const e=document.getElementById('sales-server-diag-v236374');if(!e)return;
  const x=d?.diagnostics||{},u=num(x.unallocated_revenue),entities=num(x.unallocated_entities);
  if(u>0){
    e.innerHTML='<div style="padding:8px 10px;border-radius:8px;background:#FFF7ED;color:#9A3412;font-size:11px;line-height:1.45">ℹ️ В обороте учтено <b>'+money(u)+'</b>, которые 1С относит к менеджеру/юрлицу, но не к конкретной торговой точке CRM. Юрлиц: <b>'+entities+'</b>. Эти продажи не теряются и отдельно помечены в ТОПе и сравнении.</div>';
  }else e.innerHTML='<div style="font-size:11px;color:var(--sub)">Все продажи выбранного периода распределены по карточкам клиентов.</div>';
}
function renderMonth(d){
  if(active()!=='sales'||!d)return;
  monthState.data=d;
  if(Array.isArray(d.available_months)&&d.available_months.length)monthState.months=d.available_months;
  if(!monthState.month||!monthState.months.includes(monthState.month)){
    monthState.month=String(d.month||monthState.months[0]||ymNow());
    saveLocal('resanta_sales_period_month_v236198',monthState.month);
  }
  ensureFilter();setFreshness();renderDiag(d);
  const a=document.getElementById('s-total'),b=document.getElementById('s-rev'),c=document.getElementById('s-active');
  if(a)a.textContent=String(num(d.clients_total));
  if(b)b.textContent=num(d.total_revenue).toLocaleString('ru-RU',{maximumFractionDigits:2});
  if(c)c.textContent=String(num(d.active_clients));
  const rr=document.getElementById('sales-regions'),rt=document.getElementById('sales-regions-title');
  if(rt)rt.textContent='По регионам · '+monthLabel(d.month)+' · '+(d.manager||'все менеджеры');
  const regs=Array.isArray(d.regions)?d.regions:[],mr=Math.max(1,...regs.map(x=>num(x.revenue)));
  if(rr)rr.innerHTML=regs.map(x=>'<div class="bar-row"><div class="bar-head"><span>'+esc(x.region||'Не определён')+' · '+num(x.clients)+' клиентов</span><span style="font-weight:600">'+money(x.revenue)+'</span></div><div class="bar-bg"><div class="bar-fill" style="width:'+Math.round(num(x.revenue)/mr*100)+'%"></div></div></div>').join('')||'<div style="font-size:12px;color:var(--sub)">Нет продаж за выбранный месяц.</div>';
  const cats=Array.isArray(d.categories)?d.categories:[],mc=Math.max(1,...cats.map(x=>num(x.revenue)));
  const cr=document.getElementById('sh-categories');
  if(cr)cr.innerHTML=cats.map(x=>'<div class="bar-row"><div class="bar-head"><span>'+esc(x.category||'Без категории')+'</span><span style="font-weight:600">'+money(x.revenue)+'</span></div><div class="bar-bg"><div class="bar-fill" style="width:'+Math.round(num(x.revenue)/mc*100)+'%"></div></div></div>').join('')||'<div style="font-size:12px;color:var(--sub)">Нет продаж по группам.</div>';
  const body=document.getElementById('sh-body'),empty=document.getElementById('sh-empty'),mrw=document.getElementById('sh-months');
  if(empty)empty.style.display='none';if(body)body.style.display='block';
  if(mrw)mrw.innerHTML='<div class="bar-row"><div class="bar-head"><span><b>'+esc(monthLabel(d.month))+'</b> · активных клиентов '+num(d.active_clients)+'</span><span style="font-weight:700">'+money(d.total_revenue)+'</span></div><div class="bar-bg"><div class="bar-fill" style="width:'+(num(d.total_revenue)?100:0)+'%"></div></div></div>';
  const hc=body?.closest('.card'),ht=hc?.querySelector('.card-title');if(ht)ht.textContent='Продажи выбранного месяца (из 1С)';
  const top=document.getElementById('sales-top'),rows=Array.isArray(d.top_clients)?d.top_clients:[];
  if(top)top.innerHTML=rows.map((x,i)=>'<tr '+(x.client_id?'class="tbl-tap" onclick="openClient(\''+esc(x.client_id)+'\')"':'')+'><td>'+(i+1)+'</td><td>'+esc(x.client_name||'—')+(x.is_unallocated?'<div style="font-size:10px;color:#9A3412">не распределено по ТТ</div>':'')+'</td><td>'+esc(x.region||'—')+'</td><td style="font-weight:600">'+money(x.revenue)+'</td></tr>').join('')||'<tr><td colspan="4" style="color:var(--sub);text-align:center">Нет продаж за выбранный месяц</td></tr>';
}
function setMonthLoading(){
  ensureFilter();
  const a=document.getElementById('s-rev'),c=document.getElementById('s-active');
  if(a)a.textContent='…';if(c)c.textContent='…';
}
async function fetchMonth(force=false){
  const d=dbx();if(!d)return null;
  const k=monthKey(),hit=monthCache.get(k);
  if(!force&&hit&&Date.now()-hit.at<TTL){renderMonth(hit.data);return hit.data}
  if(monthFlights.has(k))return monthFlights.get(k);
  setMonthLoading();monthState.loading=true;
  const flight=(async()=>{
    const {data,error}=await d.rpc('crm_sales_month_dashboard_v236374',{p_month:dateArg(monthState.month),p_manager:effectiveManager()});
    if(error)throw error;
    const out=data||{};monthCache.set(k,{at:Date.now(),data:out});
    if((!monthState.month||!(out.available_months||[]).includes(monthState.month))&&out.month){
      monthState.month=String(out.month);saveLocal('resanta_sales_period_month_v236198',monthState.month);
    }
    renderMonth(out);return out;
  })().catch(e=>{
    console.error(V+' sales month',e);
    const x=document.getElementById('sales-server-diag-v236374');
    if(x)x.innerHTML='<div style="padding:8px 10px;border-radius:8px;background:var(--rb);color:var(--r);font-size:12px">Не удалось загрузить аналитику продаж: '+esc(e?.message||e)+'</div>';
    return null;
  }).finally(()=>{monthFlights.delete(k);monthState.loading=false});
  monthFlights.set(k,flight);
  return flight;
}
function renderSales374(){setFreshness();ensureFilter();setTimeout(()=>fetchMonth(false),0)}
window.renderSales=renderSales374;try{renderSales=renderSales374}catch(_){}
window.salesMonth374=v=>{if(!/^\d{4}-\d{2}$/.test(String(v||'')))return;monthState.month=String(v);saveLocal('resanta_sales_period_month_v236198',monthState.month);fetchMonth(true)};
window.salesMgr374=v=>{monthState.manager=boss()?(v||'all'):me();saveLocal('resanta_sales_manager_v236198',monthState.manager);fetchMonth(true)};
window.salesStep374=d=>{const a=monthState.months||[],i=a.indexOf(monthState.month);if(i<0)return;const ni=Math.max(0,Math.min(a.length-1,i-Number(d||0)));window.salesMonth374(a[ni])};
// Replace legacy public handlers too, so old cached markup cannot trigger local-history scans.
window.salesMonth198=window.salesMonth374;try{salesMonth198=window.salesMonth374}catch(_){}
window.salesMgr198=window.salesMgr374;try{salesMgr198=window.salesMgr374}catch(_){}
window.salesStep198=window.salesStep374;try{salesStep198=window.salesStep374}catch(_){}

/* ---------- Manager YoY ---------- */
const yoy={
  opened:false,mode:'month',year:Number((monthState.month||ymNow()).slice(0,4))||new Date().getFullYear(),
  period:Number((monthState.month||ymNow()).slice(5,7))||new Date().getMonth()+1,
  manager:null,trend:'all',search:'',summary:null,clients:[],unallocated:[],loading:false
};
function yoyKey(manager){return[yoy.mode,yoy.year,yoy.period,manager||'all'].join('|')}
function trendMeta(t){return({fall:['🔴','Падение'],growth:['🟢','Рост'],new:['🆕','Новый'],lost:['❌','Потерян'],adjustment:['🟠','Корректировка'],no_sales:['⚪','Нет продаж'],same:['⚪','Без изменений']}[t]||['⚪','—'])}
function periodText(d){
  const y=d?.year||yoy.year,py=d?.previous_year||y-1,p=d?.period||yoy.period;
  if((d?.period_type||yoy.mode)==='month')return monthLabel(String(y)+'-'+String(p).padStart(2,'0'))+' ↔ '+monthLabel(String(py)+'-'+String(p).padStart(2,'0'));
  if((d?.period_type||yoy.mode)==='quarter')return p+' квартал '+y+' ↔ '+p+' квартал '+py;
  return 'Январь–'+monthLabel(String(y)+'-'+String(p).padStart(2,'0'))+' ↔ тот же период '+py;
}
function yoyYears(){const n=new Date().getFullYear();return[...new Set([n,n-1,n-2,2026,2025])].filter(x=>x>=2024&&x<=n+1).sort((a,b)=>b-a)}
function periodOptions(){
  if(yoy.mode==='month')return Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'" '+(yoy.period===i+1?'selected':'')+'>'+esc(monthLabel('2026-'+String(i+1).padStart(2,'0')).split(' ')[0])+'</option>').join('');
  if(yoy.mode==='quarter')return Array.from({length:4},(_,i)=>'<option value="'+(i+1)+'" '+(yoy.period===i+1?'selected':'')+'>'+(i+1)+' квартал</option>').join('');
  return'';
}
function yoyControls(){
  return '<div class="msy-filters">'
   +'<div class="msy-filter"><label>Сравнение</label><select class="msy-mini" onchange="msyMode374(this.value)"><option value="month" '+(yoy.mode==='month'?'selected':'')+'>По месяцам</option><option value="quarter" '+(yoy.mode==='quarter'?'selected':'')+'>По кварталам</option><option value="ytd" '+(yoy.mode==='ytd'?'selected':'')+'>С начала года</option></select></div>'
   +'<div class="msy-filter"><label>Год</label><select class="msy-mini" onchange="msyYear374(this.value)">'+yoyYears().map(y=>'<option value="'+y+'" '+(yoy.year===y?'selected':'')+'>'+y+' vs '+(y-1)+'</option>').join('')+'</select></div>'
   +(yoy.mode==='ytd'?'':'<div class="msy-filter"><label>'+(yoy.mode==='quarter'?'Квартал':'Месяц')+'</label><select class="msy-mini" onchange="msyPeriod374(this.value)">'+periodOptions()+'</select></div>')
   +'<button class="btn-secondary" onclick="msyRefresh374(true)">↻ Обновить</button></div>';
}
function ensureYoyRoot(){
  const root=document.getElementById('manager-sales-yoy-v23634');if(!root)return null;
  if(root.dataset.v236374==='1')return root;
  root.dataset.v236374='1';
  root.innerHTML='<div class="msy-head"><div><div class="msy-title">📊 Менеджеры · год к году</div><div class="msy-sub">Показывается вся действующая АКБ менеджера. Продажи, которые нельзя точно распределить по торговой точке, не теряются и идут отдельным блоком.</div></div><button class="btn-primary" id="msy-open-v236374" onclick="msyOpen374()">Открыть сравнение</button></div><div id="msy-body-v236374" style="display:none"></div>';
  return root;
}
function yoyFresh(d){const f=d?.freshness||{};if(!f.last_success_at&&!f.report_date)return'';return '<div class="msy-fresh">🕒 Продажи 1С: '+esc(String(f.last_success_at||'').replace('T',' ').slice(0,16))+' · '+esc(f.report_period||'')+' · строк: '+num(f.row_count).toLocaleString('ru-RU')+'</div>'}
function renderYoySummary(){
  const body=document.getElementById('msy-body-v236374');if(!body)return;
  const d=yoy.summary;if(!d){body.innerHTML=yoyControls();return}
  const rows=Array.isArray(d.managers)?d.managers:[];
  body.innerHTML=yoyControls()+yoyFresh(d)+'<div style="font-size:12px;font-weight:700;margin:2px 0 9px">'+esc(periodText(d))+'</div>'
   +'<div class="msy-table-wrap"><table class="msy-table"><thead><tr><th>Менеджер</th><th>'+(d.previous_year||yoy.year-1)+'</th><th>'+(d.year||yoy.year)+'</th><th>Δ BYN</th><th>Δ %</th><th>АКБ</th><th>С движением</th><th>Без продаж</th><th>Не распределено</th></tr></thead><tbody>'
   +rows.map(r=>'<tr class="msy-row" onclick="msyManager374(\''+esc(String(r.manager_name)).replace(/'/g,'&#39;')+'\')"><td><b>'+esc(r.manager_name)+'</b><div style="font-size:10px;color:var(--sub);margin-top:2px">открыть всех клиентов →</div></td><td>'+money(r.previous_revenue)+'</td><td>'+money(r.current_revenue)+'</td><td class="'+(num(r.delta)>=0?'msy-pos':'msy-neg')+'">'+signed(r.delta)+'</td><td class="'+(num(r.delta)>=0?'msy-pos':'msy-neg')+'">'+pct(r.growth_pct)+'</td><td><b>'+num(r.clients_total)+'</b></td><td>'+num(r.clients_any)+'</td><td>'+num(r.no_sales_both)+'</td><td class="msy-adj">'+money(num(r.unallocated_current_revenue))+'</td></tr>').join('')
   +'</tbody></table></div><div class="msy-note">АКБ — все действующие клиенты текущего закрепления. «Без продаж» — нет движения ни в выбранном периоде, ни в аналогичном периоде прошлого года. Итоги менеджера включают нераспределённые по ТТ продажи 1С.</div><div id="msy-detail-v236374"></div>';
  if(yoy.manager)renderYoyDetail();
}
function filteredClients(){
  let a=[...(yoy.clients||[])];
  if(yoy.trend!=='all')a=a.filter(x=>x.trend===yoy.trend);
  const q=String(yoy.search||'').trim().toLowerCase();
  if(q)a=a.filter(x=>[x.client_name,x.city,x.region,x.category].some(v=>String(v||'').toLowerCase().includes(q)));
  if(yoy.trend==='growth'||yoy.trend==='new')a.sort((a,b)=>num(b.delta)-num(a.delta));
  else if(yoy.trend==='no_sales')a.sort((a,b)=>String(a.client_name).localeCompare(String(b.client_name),'ru'));
  else a.sort((a,b)=>num(a.delta)-num(b.delta));
  return a;
}
function renderYoyDetail(){
  const box=document.getElementById('msy-detail-v236374');if(!box||!yoy.manager)return;
  const rows=filteredClients(),u=Array.isArray(yoy.unallocated)?yoy.unallocated:[],d=yoy.summary||{},cy=d.year||yoy.year,py=d.previous_year||yoy.year-1;
  const un='<div style="margin:10px 0;padding:10px;border:1px solid #FDBA74;background:#FFF7ED;border-radius:10px"><b style="color:#9A3412">Продажи 1С, не распределённые по конкретной ТТ</b>'
    +(u.length?'<div class="msy-table-wrap" style="margin-top:8px"><table class="msy-table" style="min-width:720px"><thead><tr><th>Юрлицо / строка 1С</th><th>'+py+'</th><th>'+cy+'</th><th>Δ BYN</th><th>Δ %</th></tr></thead><tbody>'+u.map(x=>'<tr><td><b>'+esc(x.client_name)+'</b></td><td>'+money(x.previous_revenue)+'</td><td>'+money(x.current_revenue)+'</td><td>'+signed(x.delta)+'</td><td>'+pct(x.growth_pct)+'</td></tr>').join('')+'</tbody></table></div>':'<div style="font-size:11px;color:var(--sub);margin-top:5px">Нет нераспределённых продаж.</div>')+'</div>';
  const chips=[['all','Все'],['fall','🔴 Падение'],['growth','🟢 Рост'],['new','🆕 Новые'],['lost','❌ Потеряны'],['adjustment','🟠 Корректировки'],['no_sales','⚪ Без продаж']];
  box.innerHTML='<div class="msy-detail"><div class="msy-detail-head"><div><b>'+esc(yoy.manager)+'</b><div style="font-size:11px;color:var(--sub);margin-top:2px">Вся действующая АКБ · '+esc(periodText(d))+'</div></div><button class="btn-secondary" onclick="msyCloseManager374()">Закрыть</button></div>'
    +un
    +'<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px"><div class="msy-chips">'+chips.map(([k,l])=>'<button class="msy-chip '+(yoy.trend===k?'active':'')+'" onclick="msyTrend374(\''+k+'\')">'+l+'</button>').join('')+'</div><input type="search" class="msy-search" autocomplete="off" placeholder="Поиск клиента…" value="'+esc(yoy.search)+'" oninput="msySearch374(this.value)"></div>'
    +'<div style="font-size:11px;color:var(--sub);margin-bottom:7px">Показано клиентов: <b>'+rows.length+'</b> из <b>'+yoy.clients.length+'</b></div>'
    +'<div class="msy-table-wrap"><table class="msy-table" style="min-width:820px"><thead><tr><th>Клиент</th><th>Кат.</th><th>'+py+'</th><th>'+cy+'</th><th>Δ BYN</th><th>Δ %</th><th>Статус</th></tr></thead><tbody>'
    +rows.map(r=>{const m=trendMeta(r.trend),delta=num(r.delta),cls=r.trend==='adjustment'?'msy-adj':(delta>=0?'msy-pos':'msy-neg');return '<tr><td><span style="cursor:pointer;font-weight:600" onclick="openClient(\''+esc(r.client_id)+'\')">'+esc(r.client_name)+'</span><div style="font-size:10px;color:var(--sub);margin-top:2px">'+esc([r.city,r.region].filter(Boolean).join(' · '))+'</div></td><td>'+esc(r.category||'—')+'</td><td>'+money(r.previous_revenue)+'</td><td>'+money(r.current_revenue)+'</td><td class="'+cls+'">'+signed(delta)+'</td><td class="'+cls+'">'+pct(r.growth_pct)+'</td><td style="font-weight:700">'+m[0]+' '+m[1]+'</td></tr>'}).join('')
    +'</tbody></table></div></div>';
}
async function fetchYoy(manager=null,force=false){
  const d=dbx();if(!d)return null;
  const k=yoyKey(manager),hit=yoyCache.get(k);
  if(!force&&hit&&Date.now()-hit.at<TTL)return hit.data;
  const {data,error}=await d.rpc('crm_manager_sales_yoy_v236374',{p_period_type:yoy.mode,p_year:Number(yoy.year),p_period:yoy.mode==='ytd'?null:Number(yoy.period),p_manager:manager||null});
  if(error)throw error;yoyCache.set(k,{at:Date.now(),data:data||{}});return data||{};
}
window.msyOpen374=async()=>{ensureYoyRoot();yoy.opened=true;const b=document.getElementById('msy-body-v236374');if(b)b.style.display='block';const btn=document.getElementById('msy-open-v236374');if(btn)btn.style.display='none';await window.msyRefresh374(false)};
window.msyRefresh374=async(force=true)=>{
  if(yoy.loading)return;yoy.loading=true;const b=document.getElementById('msy-body-v236374');if(b)b.innerHTML=yoyControls()+'<div class="msy-loader">Загружаю сравнение продаж…</div>';
  try{yoy.manager=null;yoy.clients=[];yoy.unallocated=[];yoy.summary=await fetchYoy(null,force);renderYoySummary()}
  catch(e){if(b)b.innerHTML=yoyControls()+'<div class="msy-error">Не удалось загрузить сравнение: '+esc(e?.message||e)+'</div>'}
  finally{yoy.loading=false}
};
window.msyMode374=v=>{yoy.mode=v;if(v==='quarter')yoy.period=Math.min(4,Math.ceil((Number((monthState.month||ymNow()).slice(5,7))||1)/3));else if(v==='month')yoy.period=Number((monthState.month||ymNow()).slice(5,7))||1;yoy.manager=null;yoy.clients=[];window.msyRefresh374(false)};
window.msyYear374=v=>{yoy.year=Number(v)||yoy.year;yoy.manager=null;yoy.clients=[];window.msyRefresh374(false)};
window.msyPeriod374=v=>{yoy.period=Number(v)||1;yoy.manager=null;yoy.clients=[];window.msyRefresh374(false)};
window.msyManager374=async name=>{if(yoy.loading)return;yoy.loading=true;yoy.manager=name;yoy.trend='all';yoy.search='';const box=document.getElementById('msy-detail-v236374');if(box)box.innerHTML='<div class="msy-loader">Загружаю всю АКБ '+esc(name)+'…</div>';try{const d=await fetchYoy(name,false);yoy.clients=Array.isArray(d.clients)?d.clients:[];yoy.unallocated=Array.isArray(d.unallocated)?d.unallocated:[];renderYoyDetail();document.getElementById('msy-detail-v236374')?.scrollIntoView({behavior:'smooth',block:'nearest'})}catch(e){if(box)box.innerHTML='<div class="msy-error">'+esc(e?.message||e)+'</div>'}finally{yoy.loading=false}};
window.msyCloseManager374=()=>{yoy.manager=null;yoy.clients=[];yoy.unallocated=[];yoy.trend='all';yoy.search='';const b=document.getElementById('msy-detail-v236374');if(b)b.innerHTML=''};
window.msyTrend374=v=>{yoy.trend=v;renderYoyDetail()};
window.msySearch374=v=>{yoy.search=String(v||'');renderYoyDetail()};

function install(){
  ensureYoyRoot();
  renderSales374();
}
install();
window.RESANTA_SALES_ANALYTICS_V236374=Object.freeze({
 version:V,serverOnly:true,noFullHistory:true,fullActiveAkb:true,unallocatedVisible:true,cacheTtlMs:TTL,
 refreshSales:()=>fetchMonth(true),refreshYoy:()=>window.msyRefresh374(true)
});
})();