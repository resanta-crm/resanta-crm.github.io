/* RESANTA CRM · Sales 360 director, v2.
 * Isolated read-only UX. Server: crm_sales360_annual_v2, crm_sales360_clients_v2.
 * Native sales, manager YoY, client detail, imports and approvals are unchanged.
 */
(function(w,d){
'use strict';
if(w.RESANTA_SALES360_V1)return;
const ID='sales360-root',CSS='sales360-css',PAGE='page-sales';
const $=id=>d.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const fmt=v=>num(v).toLocaleString('ru-RU',{maximumFractionDigits:2});
const money=v=>num(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const whole=v=>Math.round(num(v)).toLocaleString('ru-RU',{maximumFractionDigits:0})+' BYN';
const short=v=>Math.abs(num(v))>=1e6?(num(v)/1e6).toFixed(2).replace('.',',')+' млн':Math.abs(num(v))>=1000?(num(v)/1000).toFixed(1).replace('.',',')+' тыс.':fmt(v);
const MONTHS=['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
const arr=v=>Array.isArray(v)?v:[];
const boss=()=>{try{return currentProfile?.role==='boss'}catch(_){return false}};
const managerMe=()=>{try{return String(currentProfile?.name||'').trim()}catch(_){return''}};
const viewer=()=>{try{return String(currentProfile?.id||currentProfile?.email||managerMe())}catch(_){return managerMe()}};
const active=()=>{try{return typeof crmActivePage==='function'?crmActivePage():$('app')?.dataset?.activePage}catch(_){return''}};
const dbx=()=>{try{return typeof db!=='undefined'?db:w.db}catch(_){return w.db}};
const currentYear=()=>{try{return Number(String(TODAY||'').slice(0,4))||new Date().getFullYear()}catch(_){return new Date().getFullYear()}};
const state={year:currentYear(),manager:boss()?'all':managerMe(),view:'months',category:'all',detail:'clients',expanded:false,legacy:false,loading:false,error:'',data:null,selectedMonth:'',draft:false,chartExpanded:false,clientsOpen:false,clientSearch:'',clientOffset:0,clientKey:'',clientData:null,clientError:'',clientLoading:false};
let mounted=false,wrapped=false,requestVersion=0,clientVersion=0,sourceRender=null;
const newDrill=()=>({category:'',subgroup:'',level:'subgroups',search:'',offset:0,loading:false,error:'',data:null,clientKey:''});
const drillStates={global:newDrill(),client:newDrill()};
const drillVersions={global:0,client:0};
function resetDrill(scope){
 if(!drillStates[scope])return;
 drillVersions[scope]++;
 drillStates[scope]=newDrill();
}
function resetAllDrills(){resetDrill('global');resetDrill('client')}

const cache=new Map(),pending=new Map(),TTL=180000;
// Drill responses are aggregate-only; repeat navigation should never rescan 1C.
const drillCache=new Map(),drillPending=new Map(),DRILL_TTL=300000,DRILL_MAX=60;
function drillKey(scope,st){return JSON.stringify([viewer(),state.year,boss()?state.manager:managerMe(),scope,st.clientKey||'',st.category,st.level,st.subgroup,st.search,st.offset]);}
function invalidateDrillCache(){drillCache.clear();drillPending.clear();}
function paintDrill(scope){
 // Keep client list, selected client, focus and page position intact when drilling.
 const target=$('s360-drill-'+scope+'-container');
 if(target){target.innerHTML=drillView(scope);return;}
 render();
}

function clearClientState(){clientVersion++;state.clientOffset=0;state.clientKey='';state.clientData=null;state.clientError='';state.clientLoading=false;resetDrill('client');}
const monthRows=d=>arr(d?.months).filter(x=>x?.has_current||(state.year<currentYear()&&x?.has_previous));
const focusedMonth=d=>{const a=monthRows(d);return a.find(x=>x.month===state.selectedMonth)||a.filter(x=>x.has_current).slice(-1)[0]||a.slice(-1)[0]||null};
function monthLabel(ym){const m=Number(String(ym||'').slice(5,7));return(MONTHS[m-1]||'—')+' '+String(ym||'').slice(0,4)}
function freshLabel(f){
 if(!f?.last_success_at)return f?.report_date?String(f.report_date).slice(0,10):'дата не подтверждена';
 const raw=String(f.last_success_at).trim(),iso=/Z$|[+-]\d\d:?\d\d$/.test(raw)?raw:raw+'Z';
 const date=new Date(iso);
 if(Number.isNaN(date.getTime()))return 'дата не подтверждена';
 return new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Minsk',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date)+' (Минск)';
}
const periodKey=()=>state.view==='quarters'?'Q'+Math.ceil(Number(state.selectedMonth.slice(5,7)||1)/3):state.selectedMonth;
function chartValue(v){
 const n=num(v);
 if(Math.abs(n)>=1e6)return(n/1e6).toFixed(1).replace('.',',')+'м';
 if(Math.abs(n)>=1000)return Math.round(n/1000)+'тыс';
 return Math.round(n).toLocaleString('ru-RU');
}
function focusedHtml(d,periods){
 const p=periods.find(x=>x.key===periodKey())||periods.find(x=>x.hasCurrent);
 if(!p)return'<div class="s360-muted">Нет выбранного периода для детализации.</div>';
 const comparable=p.hasCurrent&&p.hasPrevious&&!p.partial&&num(p.previous)>0;
 const difference=num(p.current)-num(p.previous);
 const pct=comparable?((difference/p.previous)*100).toFixed(1).replace('.',','):'—';
 const change=comparable?(difference>=0?'+':'')+whole(difference)+' · '+(difference>=0?'+':'')+pct+'%':'Без итогового сравнения';
 return '<div class="s360-focus"><b>'+esc(p.label)+'</b>'+
 '<div><small>'+esc(d.year+' · оборот')+'</small><strong>'+esc(p.hasCurrent?whole(p.current):'Нет данных')+'</strong></div>'+
 '<div><small>'+esc(d.previous_year+' · оборот')+'</small><strong>'+esc(p.hasPrevious?whole(p.previous):'Нет данных')+'</strong></div>'+
 '<div><small>Разница</small><strong>'+esc(change)+'</strong></div></div>'+
 '<div class="s360-muted" style="margin-top:8px">'+(p.partial?'Период не закрыт. Нельзя сравнивать его с полным аналогичным периодом прошлого года.':'Сопоставимые закрытые периоды.')+' Нажмите на точку графика или выберите месяц.</div>';
}
function monthControls(d){
 const list=monthRows(d),months=list.length?list.map(x=>x.month):Array.from({length:12},(_,i)=>state.year+'-'+String(i+1).padStart(2,'0'));
 const ym=focusedMonth(d)?.month||state.selectedMonth||months[months.length-1],selected=months.includes(ym)?ym:months[months.length-1],index=months.indexOf(selected);
 return '<div class="s360-field s360-month"><label for="s360-month">Месяц · фокус графика</label><div class="s360-month-nav">'+
 '<button type="button" class="s360-btn" data-s360-step="-1"'+(index<=0?' disabled':'')+' aria-label="Предыдущий месяц">←</button>'+
 '<select id="s360-month" data-s360-select="month">'+months.map(x=>'<option value="'+esc(x)+'"'+(selected===x?' selected':'')+'>'+esc(monthLabel(x))+'</option>').join('')+'</select>'+
 '<button type="button" class="s360-btn" data-s360-step="1"'+(index===months.length-1?' disabled':'')+' aria-label="Следующий месяц">→</button></div></div>';
}
function filtersHtml(d){
 const years=[currentYear(),currentYear()-1,currentYear()-2,currentYear()-3].filter(x=>x>=2023);
 return '<div class="s360-filters">'+
 '<div class="s360-field"><label for="s360-year">Год сравнения</label><select id="s360-year" data-s360-select="year">'+years.map(x=>'<option value="'+x+'"'+(state.year===x?' selected':'')+'>'+x+' / '+(x-1)+'</option>').join('')+'</select></div>'+
 monthControls(d)+showSelectorOptions(d)+
 '<div class="s360-field"><label for="s360-view">График</label><select id="s360-view" data-s360-select="view"><option value="months"'+(state.view==='months'?' selected':'')+'>Месяцы</option><option value="quarters"'+(state.view==='quarters'?' selected':'')+'>Кварталы</option></select></div>'+
 '<button type="button" class="s360-btn" data-s360-refresh>↻ Обновить</button></div>';
}
function headerHtml(d){
 return '<div class="s360-head"><div><h2>Продажи 360° · Управление ростом</h2><div class="s360-muted">1С · менеджеры · товарные группы · клиенты · с НДС</div></div>'+
 '<div class="s360-muted">Обновление 1С: '+esc(freshLabel(d?.freshness))+'</div></div>';
}
function monthKpi(d){
 const k=arr(d?.kpi).filter(x=>num(x.plan)>0);
 return {plan:k.reduce((s,x)=>s+num(x.plan),0),actual:k.reduce((s,x)=>s+num(x.actual),0),count:k.length};
}
function closedRows(d){
 return arr(d?.months).filter(x=>x.closed&&x.has_current);
}
function ytd(d){
 const months=closedRows(d);
 const comparable=months.filter(x=>x.has_previous);
 const current=months.reduce((s,x)=>s+num(x.current),0);
 const prev=comparable.reduce((s,x)=>s+num(x.previous),0);
 const like=comparable.reduce((s,x)=>s+num(x.current),0);
 return {current,prev,like,months:months.length,comparable:comparable.length,delta:prev>0?(like-prev)/prev*100:null};
}
function chartData(d,view){
 const months=arr(d?.months);
 if(view==='quarters'){
  return Array.from({length:4},(_,q)=>{
   const a=months.slice(q*3,q*3+3);
   const actual=a.filter(x=>x.has_current);
   const prev=a.filter(x=>x.has_previous);
   return{label:'Q'+(q+1)+(a.some(x=>x.partial)||actual.length>0&&actual.length<3?'*':''),key:'Q'+(q+1),
    current:actual.reduce((s,x)=>s+num(x.current),0),previous:prev.reduce((s,x)=>s+num(x.previous),0),
    hasCurrent:actual.length>0,hasPrevious:prev.length>0,partial:a.some(x=>x.partial)||actual.length>0&&actual.length<3};
  });
 }
 return months.map((x,i)=>({label:MONTHS[i]+(x.partial?'*':''),key:x.month,
   current:num(x.current),previous:num(x.previous),hasCurrent:!!x.has_current,hasPrevious:!!x.has_previous,partial:!!x.partial}));
}
function categoryMatrix(d,category){
 return arr(d?.matrix).filter(x=>x.category===category).sort((a,b)=>num(b.revenue)-num(a.revenue));
}
function managerGaps(d){
 const field=arr(d?.managers).map(x=>x.name).filter(x=>x&&x!=='Не распределено');
 const matrix=arr(d?.matrix);
 const cats=arr(d?.categories).filter(x=>num(x.current_revenue)>0);
 let proposals=[];
 for(const c of cats){
  const by=categoryMatrix(d,c.category);
  const peers=by.filter(x=>field.includes(x.manager_name)&&num(x.revenue)>0);
  if(peers.length<1)continue;
  for(const name of field){
   if(state.manager!=='all'&&name!==state.manager)continue;
   const item=by.find(x=>x.manager_name===name);
   const revenue=num(item?.revenue);
   const other=peers.filter(x=>x.manager_name!==name);
   if(revenue===0&&other.length&&other.reduce((s,x)=>s+num(x.revenue),0)>=3000){
    proposals.push({manager:name,category:c.category,peerRevenue:other.reduce((s,x)=>s+num(x.revenue),0)});
   }
  }
 }
 return proposals.sort((a,b)=>b.peerRevenue-a.peerRevenue).slice(0,5);
}
function styles(){
 const scope='#'+ID;
 return [
 scope+'{color:var(--text);display:grid;gap:13px;margin:0 0 16px;font-size:13px}',
 scope+' *{box-sizing:border-box}',
 '#page-sales.s360-installed>:not(#'+ID+'){display:none!important}',
 scope+' .s360-head, '+scope+' .s360-head-actions{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px}',
 scope+' h2{font-size:23px;line-height:1.25;font-weight:840;letter-spacing:-.5px;margin:0}',
 scope+' h3{font-size:14px;font-weight:760;margin:0 0 10px}',
 scope+' .s360-muted{font-size:11px;color:var(--sub);line-height:1.5}',
 scope+' .s360-field{display:grid;gap:4px;min-width:135px}',
 scope+' .s360-field label{font-size:10px;color:var(--sub);font-weight:600}',
 scope+' .s360-field select{background:var(--card);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:9px 11px;font:inherit;font-size:12px}',
 scope+' .s360-filters{display:flex;flex-wrap:wrap;gap:9px;align-items:end}',
 scope+' .s360-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px}',
 scope+' .s360-tile,'+scope+' .s360-panel{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px;min-width:0}',
 scope+' .s360-tile small{display:block;font-size:11px;color:var(--sub)}',
 scope+' .s360-tile strong{display:block;font-size:23px;letter-spacing:-.6px;overflow-wrap:anywhere;margin:6px 0}',
 scope+' .s360-tile em{display:block;color:var(--sub);font-style:normal;font-size:10px}',
 scope+' .s360-grid{display:grid;grid-template-columns:1.05fr 1fr;gap:12px}',
 scope+' .s360-note{border-top:1px solid var(--border);padding:10px 0;font-size:12px;line-height:1.5}',
 scope+' .s360-note b{display:block;margin-bottom:4px}',
 scope+' .s360-note small{display:block;font-size:10px;color:var(--sub);margin-top:4px}',
 scope+' .s360-badge{border:1px solid var(--border);border-radius:100px;padding:5px 9px;color:var(--sub);font-size:10px}',
 scope+' .s360-warn{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:9px;padding:10px;font-size:11px}',
 scope+' .s360-tabs{display:flex;gap:6px;flex-wrap:wrap}',
 scope+' .s360-btn{cursor:pointer;background:var(--card);color:var(--text);border:1px solid var(--border);padding:8px 11px;border-radius:8px;font-weight:650;font-size:11px}',
 scope+' .s360-btn.active{background:var(--ab);color:var(--at);border-color:var(--a)}',
 scope+' .s360-btn.primary{background:var(--a);border-color:var(--a);color:#fff}',
 scope+' button:focus-visible, '+scope+' select:focus-visible{outline:3px solid #93c5fd;outline-offset:2px}',
 scope+' .s360-chart-wrap{overflow-x:auto;max-width:100%}',
 scope+' .s360-chart{width:100%;height:auto;min-width:850px;display:block}',
 scope+' .s360-chart-panel{width:100%}',
 scope+' .s360-chart-panel.expanded .s360-chart{min-width:1380px}',
 scope+' .s360-client-search{display:flex;gap:8px;flex-wrap:wrap;align-items:center}',
 scope+' .s360-client-search input{flex:1;min-width:200px;border:1px solid var(--border);background:var(--card);color:var(--text);border-radius:8px;padding:10px;font:inherit}',
 scope+' .s360-client-list{display:grid;gap:4px;margin-top:12px}',
 scope+' .s360-client-item{display:grid;grid-template-columns:minmax(140px,1.5fr) minmax(100px,.8fr) minmax(100px,.8fr);gap:12px;align-items:center;border:1px solid var(--border);border-radius:9px;padding:11px;background:var(--card);text-align:left;color:var(--text);cursor:pointer;width:100%;font:inherit}',
 scope+' .s360-client-item.active{border-color:var(--a);background:var(--ab)}',
 scope+' .s360-client-detail{border:1px solid var(--border);background:var(--bg);border-radius:11px;padding:14px;margin-top:12px}',
 scope+' .s360-client-graph{display:grid;gap:6px;margin-top:10px}',
 scope+' .s360-client-month{display:grid;grid-template-columns:46px minmax(60px,1fr) 100px 100px;gap:8px;align-items:center;font-size:11px}',
 scope+' .s360-client-track{height:11px;border-radius:7px;background:var(--card);display:flex;overflow:hidden}',
 scope+' .s360-client-track i{height:11px;display:block;background:#2563eb}',
 scope+' .s360-brief-overview{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}',
 scope+' .s360-brief-overview>div{background:var(--bg);padding:12px;border-radius:9px;min-width:0}',
 scope+' .s360-brief-overview small{font-size:10px;color:var(--sub);display:block}',
 scope+' .s360-brief-overview strong{font-size:15px;line-height:1.3;display:block;margin-top:5px;overflow-wrap:anywhere}',
 scope+' .s360-brief-item{padding:13px 0;border-top:1px solid var(--border);display:grid;gap:7px;line-height:1.5}',
 scope+' .s360-brief-item>b{font-size:12px}',
 scope+' .s360-brief-evidence{font-weight:730;font-size:12px}',
 scope+' .s360-brief-next{font-size:12px}',
 scope+' .s360-drill{margin-top:14px;border:1px solid var(--border);border-radius:11px;padding:14px;background:var(--card)}',
 scope+' .s360-drill-nav{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-bottom:12px}',
 scope+' .s360-drill-rows{display:grid;gap:6px;margin-top:10px}',
 scope+' .s360-drill-row{width:100%;display:grid;grid-template-columns:minmax(170px,2fr) minmax(90px,.85fr) minmax(90px,.85fr) minmax(90px,.85fr) minmax(50px,.5fr);gap:9px;align-items:center;text-align:right;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);padding:11px 10px;font:inherit}',
 scope+' button.s360-drill-row{cursor:pointer}',
 scope+' button.s360-drill-row:hover{background:var(--bg)}',
 scope+' .s360-drill-row>:first-child{text-align:left;overflow-wrap:anywhere}',
 scope+' .s360-drill-row b{font-size:12px}',
 scope+' .s360-drill-row small{font-size:10px;color:var(--sub);display:block}',
 scope+' .s360-drill-footer{margin-top:10px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}',

 scope+' .s360-month{min-width:220px}',
 scope+' .s360-month-nav{display:flex;align-items:center;gap:5px}',
 scope+' .s360-month-nav select{min-width:130px;flex:1}',
 scope+' .s360-btn:disabled{opacity:.45;cursor:not-allowed}',
 scope+' .s360-focus{display:grid;grid-template-columns:90px repeat(3,minmax(0,1fr));gap:12px;padding:12px;background:var(--bg);border-radius:9px;margin-top:10px}',
 scope+' .s360-focus small{display:block;color:var(--sub);font-size:10px}',
 scope+' .s360-focus strong{display:block;font-size:13px;overflow-wrap:anywhere;margin-top:4px}',
 scope+' .s360-legend{display:flex;gap:15px;align-items:center;font-size:11px;color:var(--sub);flex-wrap:wrap}',
 scope+' .s360-legend i{display:inline-block;width:11px;height:11px;border-radius:2px;margin-right:5px}',
 scope+' .s360-minirows{display:grid;gap:9px}',
 scope+' .s360-manager{display:grid;grid-template-columns:95px minmax(60px,1fr) 85px;gap:8px;align-items:center}',
 scope+' .s360-manager .s360-track{background:var(--bg);height:10px;overflow:hidden;border-radius:5px}',
 scope+' .s360-manager .s360-track i{display:block;height:100%;background:var(--a);border-radius:5px}',
 scope+' .s360-manager button{background:none;border:0;padding:0;text-align:left;color:var(--text);font-weight:680;font-size:11px;cursor:pointer;overflow-wrap:anywhere}',
 scope+' .s360-manager b{font-size:11px;text-align:right}',
 scope+' .s360-row{display:grid;grid-template-columns:minmax(120px,1fr) 100px 100px 70px;gap:8px;align-items:center;padding:10px 2px;border-top:1px solid var(--border)}',
 scope+' .s360-row button{font:inherit;color:var(--text);text-align:left;border:0;background:none;cursor:pointer;padding:0}',
 scope+' .s360-row b{font-size:11px;text-align:right}',
 scope+' .s360-row span{font-size:10px;color:var(--sub)}',
 scope+' .s360-tablewrap{overflow-x:auto}',
 scope+' table{border-collapse:collapse;width:100%;min-width:430px;font-size:11px}',
 scope+' th{font-size:10px;color:var(--sub);font-weight:700;text-align:right;border-bottom:1px solid var(--border);padding:9px 7px;white-space:nowrap}',
 scope+' th:first-child{text-align:left}',
 scope+' td{padding:9px 7px;border-bottom:1px solid var(--border);text-align:right}',
 scope+' td:first-child{text-align:left;min-width:110px}',
 scope+' td button{background:none;border:0;color:var(--text);font:inherit;cursor:pointer;text-align:left}',
 scope+' .s360-zero{color:var(--sub);font-style:italic}',
 scope+' .s360-positive{color:var(--g)}',
 scope+' .s360-negative{color:var(--r)}',
 scope+' .s360-detail{padding:12px;border-radius:9px;background:var(--bg);display:grid;gap:9px;margin-top:10px}',
 scope+' .s360-copy{width:100%;min-height:92px;padding:10px;background:var(--card);border:1px solid var(--border);border-radius:8px;color:var(--text);font:inherit;font-size:11px;resize:vertical}',
 scope+' .s360-foot{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center}',
 scope+' .s360-loading{padding:35px 15px;border:1px solid var(--border);border-radius:12px;text-align:center;color:var(--sub)}',
 scope+' .s360-load-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:9px}',
 scope+' .s360-load-kpis>div{border:1px solid var(--border);border-radius:12px;background:var(--card);min-height:88px;opacity:.6}',
 '@media(max-width:1050px){'+scope+' .s360-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}'+scope+' .s360-grid{grid-template-columns:1fr}}',
 '@media(max-width:640px){'+scope+' .s360-focus{grid-template-columns:1fr 1fr}'+scope+' .s360-load-kpis{grid-template-columns:repeat(2,1fr)}'+scope+' .s360-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}'+scope+' h2{font-size:19px}'+scope+' .s360-tile strong{font-size:19px}'+scope+' .s360-row{grid-template-columns:1fr 85px 85px}'+scope+' .s360-row span:last-child{grid-column:2 / 4;text-align:right}'+scope+' .s360-client-item{grid-template-columns:1fr 1fr}'+scope+' .s360-client-item span:first-child{grid-column:1 / -1}'+scope+' .s360-client-month{grid-template-columns:42px 1fr 70px 70px}'+scope+' .s360-drill-row{grid-template-columns:1fr 1fr}'+scope+' .s360-drill-row>:first-child{grid-column:1 / -1}'+scope+' .s360-brief-overview{grid-template-columns:1fr 1fr}}'
 ].join('\n');
}
function mount(){
 const page=$(PAGE);if(!page)return null;
 let root=$(ID);
 if(!root){
  const st=d.createElement('style');st.id=CSS;st.textContent=styles();d.head.appendChild(st);
  root=d.createElement('section');root.id=ID;root.setAttribute('aria-label','Продажи 360° · директорский контроль');
  page.insertAdjacentElement('afterbegin',root);
  root.addEventListener('click',onClick);
  root.addEventListener('change',onChange);
  root.addEventListener('keydown',onKeyDown);
  root.addEventListener('input',onInput);
  mounted=true;
 }
 page.classList.toggle('s360-installed',!state.legacy);
 return root;
}
function trendSvg(items){
 const shown=items.filter(x=>x.hasCurrent||x.hasPrevious);
 if(!shown.length)return'<div class="s360-muted">За выбранный период нет данных.</div>';
 const values=shown.flatMap(x=>[x.hasCurrent?num(x.current):0,x.hasPrevious?num(x.previous):0]);
 const hi=Math.max(1,...values),lo=Math.min(0,...values),range=Math.max(1,hi-lo);
 const w=1200,h=390,l=85,t=56,plotW=1065,plotH=267;
 const x=i=>l+(items.length===1?plotW/2:i*plotW/(items.length-1));
 const y=v=>t+(hi-num(v))/range*plotH;
 const selected=periodKey();
 let svg='';
 for(const k of [0,.25,.5,.75,1]){
  const val=lo+range*k,cy=y(val).toFixed(1);
  svg+='<path d="M'+l+' '+cy+'H'+(l+plotW)+'" stroke="#cbd5e1" stroke-dasharray="3 6" opacity=".65"/>'+
  '<text x="'+(l-10)+'" y="'+(Number(cy)+4)+'" text-anchor="end" font-size="12" fill="currentColor">'+esc(chartValue(val))+'</text>';
 }
 const si=items.findIndex(a=>a.key===selected);
 if(si>=0)svg+='<rect x="'+(x(si)-plotW/items.length/2).toFixed(1)+'" y="'+t+'" width="'+(plotW/items.length).toFixed(1)+'" height="'+plotH+'" fill="#dbeafe" opacity=".38"/>';
 for(const [key,color] of [['previous','#94a3b8'],['current','#2563eb']]){
  let seg=[];
  items.forEach((a,i)=>{
   const has=key==='current'?a.hasCurrent:a.hasPrevious;
   if(!has){if(seg.length)svg+='<polyline points="'+seg.join(' ')+'" fill="none" stroke="'+color+'" stroke-width="3"/>';seg=[];return}
   seg.push(x(i).toFixed(1)+','+y(a[key]).toFixed(1));
  });
  if(seg.length)svg+='<polyline points="'+seg.join(' ')+'" fill="none" stroke="'+color+'" stroke-width="3"/>';
  items.forEach((a,i)=>{
   const has=key==='current'?a.hasCurrent:a.hasPrevious;
   if(!has)return;
   const chosen=a.key===selected;
   const description=a.label+' · '+(key==='current'?'выбранный':'предыдущий')+' год: '+whole(a[key])+(a.partial?' (неполный период)':'');
   const px=x(i).toFixed(1),py=y(a[key]).toFixed(1);
   svg+='<g data-s360-point="'+esc(a.key)+'" tabindex="0" role="button" aria-label="'+esc(description)+'" style="cursor:pointer">'+
    '<circle cx="'+px+'" cy="'+py+'" r="15" fill="transparent"/>'+
    '<circle cx="'+px+'" cy="'+py+'" r="'+(chosen?'6.5':'5')+'" fill="'+color+'" stroke="#fff" stroke-width="1"/>'+
    '<title>'+esc(description)+'</title></g>';
   // Keep the value labels on opposite sides of the line, even when they nearly touch.
   const above=key==='current';
   const ty=above?Math.max(16,y(a[key])-17):Math.min(h-42,y(a[key])+22);
   svg+='<text x="'+px+'" y="'+ty.toFixed(1)+'" text-anchor="middle" fill="'+(above?'#1d4ed8':'#64748b')+'" font-size="12" font-weight="700">'+esc(chartValue(a[key]))+'</text>';
  });
 }
 svg+=items.map((a,i)=>'<text x="'+x(i).toFixed(1)+'" y="365" text-anchor="middle" fill="currentColor" font-size="13">'+esc(a.label)+'</text>').join('');
 return '<div class="s360-chart-wrap"><svg class="s360-chart" viewBox="0 0 '+w+' '+h+'" role="group" aria-label="Большой график продаж двух лет с подписями оборота 2026 и 2025 в BYN" preserveAspectRatio="xMidYMid meet">'+
 '<text x="'+l+'" y="23" fill="currentColor" font-size="13">Оборот BYN · подписи обоих годов округлены до целого рубля</text>'+svg+'</svg></div>';
}
function showSelectorOptions(d){
 const available=arr(d?.managers).map(x=>x.name).filter(x=>x&&x!=='Не распределено');
 const allowed=['Руднев','Ачинович','Шкуран'];
 const names=[...new Set([...allowed,...available])];
 if(!boss())return'<div class="s360-field"><label>Менеджер</label><strong>'+esc(managerMe())+'</strong></div>';
 return'<div class="s360-field"><label for="s360-manager">Менеджер</label><select id="s360-manager" data-s360-select="manager"><option value="all"'+(state.manager==='all'?' selected':'')+'>Все менеджеры</option>'+
 names.map(x=>'<option value="'+esc(x)+'"'+(state.manager===x?' selected':'')+'>'+esc(x)+'</option>').join('')+'</select></div>';
}
function kpiCard(label,value,desc,color=''){
 return'<div class="s360-tile"><small>'+esc(label)+'</small><strong'+(color?' class="'+color+'"':'')+'>'+esc(value)+'</strong><em>'+esc(desc)+'</em></div>';
}
function getKpi(d){
 const k=monthKpi(d);
 const actual=k.actual,plan=k.plan;
 return{k,display:plan>0?(actual/plan*100).toFixed(1).replace('.',',')+'%':'—',description:plan>0?'Факт '+short(actual)+' / план '+short(plan)+' BYN · '+(d.kpi_month||''):'План не подтверждён в KPI 360°'};
}
// Director signals are evidence-backed, deterministic recommendations; not orders or AI diagnoses.
function directorSignals(d){
 const summary=ytd(d),rows=arr(d?.categories),matrix=arr(d?.matrix);
 const relevant=rows.map(c=>{
  const current=num(c.current_revenue),previous=num(c.previous_revenue);
  const loss=previous-current,pct=previous>0?100*loss/previous:null;
  return {...c,current,previous,loss,pct};
 }).filter(c=>c.previous>=10000&&c.loss>=5000&&c.pct>=10)
   .sort((a,b)=>b.loss-a.loss||b.pct-a.pct);
 const issues=relevant.slice(0,3).map(c=>{
  const peers=matrix.filter(m=>m.category===c.category&&m.manager_name&&m.manager_name!=='Не распределено');
  const drop=peers.map(m=>({name:m.manager_name,
   loss:num(m.previous_revenue)-num(m.revenue),previous:num(m.previous_revenue)}))
   .filter(x=>x.loss>0&&x.previous>0).sort((a,b)=>b.loss-a.loss)[0];
  const priority=c.loss>=20000&&c.pct>=15?'Высокий':'Контроль';
  const action='Проверить подгруппы и SKU: где именно снизился оборот, затем сопоставить остатки Витебска, активность клиентов, возвраты и предложения менеджера.';
  return {kind:'decline',category:c.category,priority,loss:c.loss,pct:c.pct,
   current:c.current,previous:c.previous,
   manager:drop?.name||null,
   title:'Снижение: '+c.category,
   action,source:'1С · сопоставимые закрытые месяцы',
   signal_key:['sales360','decline',d.year,c.category].join(':')};
 });
 const gaps=managerGaps(d);
 if(issues.length<3&&gaps.length){
  const g=gaps[0];
  issues.push({kind:'opportunity',category:g.category,manager:g.manager,
   priority:'Возможность',peerRevenue:g.peerRevenue,
   title:'Проверить потенциал: '+g.category,
   action:'Уточнить клиентский спрос, наличие товара, проведённые предложения и потребность в обучении. Отсутствие продаж само по себе не доказывает нехватку знаний.',
   source:'1С · сравнение менеджеров',
   signal_key:['sales360','opportunity',d.year,g.manager,g.category].join(':')});
 }
 return {summary,issues,declineCount:relevant.length,closedMonth:num(d?.closed_month)};
}
function brief(d){
 const report=directorSignals(d),y=report.summary,issues=report.issues;
 const delta=y.delta===null?'Недостаточно данных для сравнения':
   (y.delta>=0?'+':'')+y.delta.toFixed(1).replace('.',',')+'% к сопоставимому периоду '+d.previous_year;
 const period=report.closedMonth?MONTHS[Math.min(11,report.closedMonth-1)]+' '+d.year:'Нет закрытых месяцев';
 const blocks=issues.map((s,i)=>{
  const evidence=s.kind==='decline'?
   esc(d.year+': '+whole(s.current)+' · '+d.previous_year+': '+whole(s.previous)+
    ' · снижение '+whole(s.loss)+' ('+s.pct.toFixed(1).replace('.',',')+'%)'):
   esc('У '+s.manager+' нет продаж выбранной группы, хотя коллеги отгрузили '+whole(s.peerRevenue)+'.');
  const responsibility=s.manager?' · менеджер для проверки: '+esc(s.manager):' · ответственный определяется руководителем';
  return '<div class="s360-brief-item">'+
   '<div class="s360-head-actions"><b>'+(i+1)+'. '+esc(s.title)+'</b><span class="s360-badge">'+esc(s.priority)+'</span></div>'+
   '<div class="s360-brief-evidence">'+evidence+'</div>'+
   '<div class="s360-brief-next"><b>Что сделать:</b> '+esc(s.action)+'</div>'+
   '<small class="s360-muted">'+esc(s.source)+responsibility+' · причина ещё не установлена</small>'+
   '<div class="s360-tabs"><button type="button" class="s360-btn" data-s360-brief-group="'+esc(s.category)+'">Разобрать подгруппы и SKU</button>'+
   (boss()?'<button type="button" class="s360-btn" data-s360-brief-draft="'+esc(s.category)+'">Черновик поручения</button>':'')+
   '</div></div>';
 }).join('');
 const empty='<div class="s360-note"><b>Критичных падений по установленным порогам не найдено.</b>'+
  'Продолжить контроль крупных товарных групп, маржи и активности клиентов. Отсутствие сигнала не означает отсутствие проблем.'+
  '<small>Порог: не менее 5 000 BYN и 10% снижения при прошлогоднем обороте от 10 000 BYN.</small></div>';
 return '<div class="s360-panel" id="s360-director-brief">'+
  '<div class="s360-head-actions"><div><h3>✦ Директорский брифинг · Что требует решения</h3>'+
  '<div class="s360-muted">По данным 1С · с января по '+esc(period)+' · только закрытые месяцы</div></div>'+
  '<span class="s360-badge">Проверенные цифры, гипотезы отдельно</span></div>'+
  '<div class="s360-brief-overview"><div><small>Оборот</small><strong>'+esc(whole(y.current))+'</strong></div>'+
   '<div><small>Динамика</small><strong>'+esc(delta)+'</strong></div>'+
   '<div><small>Групп со снижением*</small><strong>'+report.declineCount+'</strong></div></div>'+
  (issues.length?blocks:empty)+
  '<div class="s360-muted">* Пороги: снижение ≥5 000 BYN и ≥10% при базе ≥10 000 BYN. Сигналы — не причины падения и не готовые поручения. Действия согласует руководитель; экзамены автоматически не назначаются.</div></div>';
}
function managerBars(d){
 const rows=arr(d.managers).filter(x=>x.name&&x.name!=='Не распределено');
 if(!rows.length)return'<div class="s360-muted">Данные менеджеров за период не найдены.</div>';
 const max=Math.max(1,...rows.map(x=>Math.max(0,num(x.current_revenue))));
 return'<div class="s360-minirows">'+rows.map(x=>
  '<div class="s360-manager"><button type="button" data-s360-mgr="'+esc(x.name)+'">'+esc(x.name)+'</button><span class="s360-track"><i style="width:'+Math.max(0,num(x.current_revenue))/max*100+'%"></i></span><b>'+esc(short(x.current_revenue))+'</b></div>'
 ).join('')+'</div>';
}
function categoryTable(d){
 const cats=arr(d.categories).sort((a,b)=>num(b.current_revenue)-num(a.current_revenue));
 if(!cats.length)return'<div class="s360-muted">Категории продаж не найдены.</div>';
 const shown=state.expanded?cats:cats.slice(0,7);
 const max=Math.max(1,...cats.map(x=>num(x.current_revenue)));
 return shown.map(x=>
  '<div class="s360-manager"><button type="button" data-s360-category="'+esc(x.category)+'">'+esc(x.category)+'</button>'+
  '<span class="s360-track"><i style="width:'+Math.max(0,num(x.current_revenue))/max*100+'%"></i></span><b>'+esc(short(x.current_revenue))+'</b></div>'
 ).join('')+(shown.length<cats.length?'<button type="button" class="s360-btn" data-s360-expand>Все группы ('+cats.length+')</button>':'');
}
function matrix(d){
 const categories=arr(d.categories).map(x=>x.category);
 if(!categories.length)return'<div class="s360-muted">Матрица не заполнена.</div>';
 if(!categories.includes(state.category))state.category=categories[0];
 const rows=categoryMatrix(d,state.category).filter(x=>x.manager_name!=='Не распределено');
 const managers=arr(d.managers).map(x=>x.name).filter(x=>x&&x!=='Не распределено');
 const peersTotal=rows.reduce((s,x)=>s+Math.max(0,num(x.revenue)),0);
 const gaps=managerGaps(d);
 const gap=gaps.find(x=>x.category===state.category);
 return '<div id="s360-matrix" class="s360-panel"><div class="s360-head-actions"><h3>Товарные группы · Потенциал менеджеров</h3><span class="s360-badge">С января по закрытый месяц</span></div>'+
  '<div class="s360-field" style="max-width:330px;margin-bottom:10px"><label for="s360-category">Группа товара</label><select id="s360-category" data-s360-select="category">'+categories.map(x=>'<option value="'+esc(x)+'"'+(state.category===x?' selected':'')+'>'+esc(x)+'</option>').join('')+'</select></div>'+
  '<div class="s360-tablewrap"><table><thead><tr><th>Менеджер</th><th>Продажи</th><th>Год назад</th><th>Клиенты</th></tr></thead><tbody>'+
  managers.map(name=>{
   const x=rows.find(r=>r.manager_name===name);
   const cur=num(x?.revenue),prev=num(x?.previous_revenue);
   const no=cur<=0&&peersTotal>0;
   return'<tr><td><button type="button" data-s360-mgr="'+esc(name)+'">'+esc(name)+'</button></td>'+
    '<td'+(no?' class="s360-zero"':'')+'>'+esc(cur>0?money(cur):'Нет продаж')+'</td>'+
    '<td>'+esc(prev?money(prev):'—')+'</td><td>'+num(x?.clients)+'</td></tr>';
  }).join('')+
  '</tbody></table></div><div class="s360-detail"><b>ИИ · Что проверить</b>'+
  '<span>'+(gap?'У '+esc(gap.manager)+' нет продаж выбранной группы, при этом коллеги продали её на '+esc(short(gap.peerRevenue))+' BYN.':'Сопоставьте ассортимент, сезонность и продажи с прошлым годом. Нулевая выручка сама по себе не означает отсутствие знаний.')+'</span>'+
  '<span class="s360-muted">Проверить: потребность клиентов → наличие Витебска → предложения и визиты → при необходимости обучение и тест по продукту.</span>'+
  (boss()?'<div class="s360-tabs"><button type="button" class="s360-btn" data-s360-draft>Подготовить поручение на проверку</button><button type="button" class="s360-btn" data-s360-tasks>Открыть задачи</button></div>':'')+
  (state.draft?draft(d):'')+'</div></div>';
}
function draft(d){
 const focus=state.manager==='all'?'Выбранный менеджер':state.manager;
 const content='Проверить возможность роста продаж группы «'+state.category+'». Ответственный: '+focus+'. Проверить спрос клиентов, наличие на складе Витебск, историю предложений и визитов. При выявленном пробеле знаний: согласовать обучение, затем тест на 10 вопросов (порог 80%) по утверждённым материалам производителя. Представить подтверждённые действия и факт отгрузок из 1С. Задача создаётся только после согласования руководителем.';
 return'<label class="s360-muted" for="s360-draft-text">Черновик поручения · автоматически не создаётся</label><textarea class="s360-copy" id="s360-draft-text">'+esc(content)+'</textarea><button type="button" class="s360-btn" data-s360-copy>Копировать черновик</button>';
}
function drillView(scope){
 const st=drillStates[scope];
 if(!st?.category){
  if(scope==='client')return'';
  return '<div class="s360-panel" id="s360-drill-global"><div class="s360-head-actions"><h3>Товарная детализация · Группа → Подгруппа → SKU</h3><span class="s360-badge">1С · только реальные данные</span></div>'+
   '<div class="s360-muted">Выберите товарную группу в рейтинге или матрице выше, чтобы открыть подгруппы и конкретные SKU, сравнить оборот двух лет.</div></div>';
 }
 const result=st.data||{},items=arr(result.items),total=num(result.total),limit=50,page=Math.floor(st.offset/limit)+1,pages=Math.max(1,Math.ceil(total/limit));
 const context=scope==='client'?'client':'global';
 const title=scope==='client'?'Товары выбранного клиента':'Все клиенты · Товарная детализация';
 const parent=st.category+(st.level==='sku'?' › '+st.subgroup:'');
 const noSku=v=>v?.sku?('SKU '+v.sku):'SKU не указан · позиция по названию';
 const rows=items.map(x=>{
  const name=st.level==='sku'?(x.product||x.item_name):x.item_name;
  const amount=(num(x.current_revenue)-num(x.previous_revenue));
  const nameCell='<span><b>'+esc(name||'—')+'</b><small>'+(st.level==='sku'?esc(noSku(x)):'Открыть конкретные SKU →')+'</small></span>';
  const columns='<span>'+esc(whole(x.current_revenue))+'</span><span>'+esc(whole(x.previous_revenue))+'</span>'+
   '<span class="'+(amount<0?'s360-negative':'s360-positive')+'">'+esc((amount>0?'+':'')+whole(amount))+'</span>'+
   '<span>'+esc(fmt(x.current_qty))+' шт.</span>';
  return st.level==='subgroups'?
   '<button type="button" class="s360-drill-row" data-s360-drill-subgroup="'+esc(x.item_name)+'" data-s360-drill-scope="'+context+'">'+nameCell+columns+'</button>':
   '<div class="s360-drill-row">'+nameCell+columns+'</div>';
 }).join('');
 return '<div class="s360-drill" id="s360-drill-'+context+'">'+
 '<div class="s360-head-actions"><div><h3>'+esc(title)+'</h3><div class="s360-muted">'+esc(parent)+'</div></div>'+
 '<button type="button" class="s360-btn" data-s360-drill-close data-s360-drill-scope="'+context+'">Закрыть детализацию</button></div>'+
 '<div class="s360-drill-nav">'+
 (st.level==='sku'?'<button type="button" class="s360-btn" data-s360-drill-back data-s360-drill-scope="'+context+'">← К подгруппам</button>':'')+
 '<span class="s360-badge">'+(st.level==='subgroups'?'Подгруппы':'Конкретные SKU')+'</span>'+
 '<span class="s360-badge">Закрытые месяцы · '+state.year+' / '+(state.year-1)+'</span></div>'+
 '<div class="s360-client-search"><input id="s360-drill-search-'+context+'" data-s360-drill-input="'+context+'" value="'+esc(st.search)+'" placeholder="'+(st.level==='sku'?'Название товара или SKU':'Поиск подгруппы')+'" aria-label="Поиск товаров">'+
 '<button type="button" class="s360-btn" data-s360-drill-find data-s360-drill-scope="'+context+'">Найти</button></div>'+
 (st.error?'<div class="s360-warn">'+esc(st.error)+'</div>':'')+
 (st.loading?'<div class="s360-loading" role="status">Загружаю детализацию из 1С…</div>':
 '<div class="s360-drill-rows"><div class="s360-drill-row" style="background:var(--bg);font-weight:700"><span>Подгруппа / товар</span><span>'+state.year+'</span><span>'+(state.year-1)+'</span><span>Разница</span><span>Количество</span></div>'+
 (rows||'<div class="s360-muted">По этому уровню подтверждённых продаж нет.</div>')+'</div>')+
 (total>0?'<div class="s360-drill-footer"><span class="s360-muted">Позиций: '+total+' · страница '+page+' из '+pages+'</span>'+
 '<div class="s360-tabs"><button type="button" class="s360-btn" data-s360-drill-page="-1" data-s360-drill-scope="'+context+'"'+(page===1?' disabled':'')+'>← Назад</button>'+
 '<button type="button" class="s360-btn" data-s360-drill-page="1" data-s360-drill-scope="'+context+'"'+(page>=pages?' disabled':'')+'>Далее →</button></div></div>':'')+
 (st.level==='sku'?'<div class="s360-muted" style="margin-top:10px">При отсутствии артикула SKU товар группируется по наименованию, чтобы оборот не терялся. Количество — суммарные штуки по данным 1С (с учётом возвратов).</div>':'')+'</div>';
}
function openDrill(scope,category,subgroup=''){
 if(!['client','global'].includes(scope)||!String(category||'').trim())return;
 resetDrill(scope);
 const st=drillStates[scope];
 st.category=String(category).slice(0,200);
 st.subgroup=String(subgroup||'').slice(0,250);
 st.level=subgroup?'sku':'subgroups';
 st.clientKey=scope==='client'?state.clientKey:'';
 loadDrill(scope);
}
async function loadDrill(scope){
 const st=drillStates[scope];
 if(!st?.category||active()!=='sales')return;
 const serial=++drillVersions[scope];
 const key=drillKey(scope,st),hit=drillCache.get(key);
 if(hit&&Date.now()-hit.at<DRILL_TTL){
  st.data=hit.data;st.error='';st.loading=false;paintDrill(scope);return;
 }
 st.loading=true;st.error='';st.data=null;
 paintDrill(scope);
 try{
  const database=dbx();if(!database?.rpc)throw Error('Источник Supabase недоступен');
  let work=drillPending.get(key);
  if(!work){
   work=Promise.resolve().then(()=>database.rpc('crm_sales360_product_drill_v3',{
    p_year:state.year,p_manager:boss()&&state.manager!=='all'?state.manager:null,
    p_client_key:scope==='client'?st.clientKey:null,
    p_category:st.category,p_subgroup:st.level==='sku'?st.subgroup:null,p_level:st.level,
    p_search:st.search.slice(0,120),p_limit:50,p_offset:st.offset
   })).then(({data,error})=>{if(error)throw error;return data});
   drillPending.set(key,work);
   work.finally(()=>{if(drillPending.get(key)===work)drillPending.delete(key)}).catch(()=>{});
  }
  const result=await work;
  if(serial!==drillVersions[scope]||active()!=='sales')return;
  if(!result||!Array.isArray(result.items))throw Error('Неполный ответ сервера по товарным группам');
  st.data=result;
  drillCache.set(key,{at:Date.now(),data:result});
  while(drillCache.size>DRILL_MAX)drillCache.delete(drillCache.keys().next().value);
 }catch(err){
  if(serial===drillVersions[scope]){st.error=String(err?.message||err);st.data=null;console.warn('Sales360 SKU drill read-only',err)}
 }finally{
  if(serial===drillVersions[scope]){st.loading=false;paintDrill(scope);}
 }
}
function clientDetailHtml(detail){
 if(!detail?.client)return'';
 const c=detail.client,rows=arr(detail.months),cats=arr(detail.categories),yr=state.year,prev=yr-1;
 const limit=Math.max(1,...rows.flatMap(x=>[Math.max(0,num(x.current)),Math.max(0,num(x.previous))]));
 const bars=rows.filter(x=>x.has_current||x.has_previous).map(x=>
  '<div class="s360-client-month"><b>'+esc(monthLabel(x.month).split(' ')[0])+(x.partial?'*':'')+'</b>'+
  '<span class="s360-client-track" title="'+esc(whole(x.current))+'"><i style="width:'+Math.min(100,Math.max(0,num(x.current))/limit*100)+'%"></i></span>'+
  '<span style="color:#2563eb">'+esc(x.has_current?whole(x.current):'—')+'</span>'+
  '<span style="color:#64748b">'+esc(x.has_previous?whole(x.previous):'—')+'</span></div>'
 ).join('');
 return '<div class="s360-client-detail"><div class="s360-head-actions"><div><h3>'+esc(c.client_name)+'</h3>'+
  '<div class="s360-muted">'+esc(c.manager_name||'Менеджер не определён')+' · Из 1С, с НДС</div></div>'+
  '<div class="s360-tabs">'+(c.client_id?'<button type="button" class="s360-btn" data-s360-client-card="'+esc(c.client_id)+'">Карточка CRM</button>':'')+
  '<button type="button" class="s360-btn" data-s360-client-close>Закрыть детали</button></div></div>'+
  '<div class="s360-focus"><b>Оборот по клиенту</b><div><small>'+yr+' · закрытые месяцы</small><strong>'+esc(whole(c.current_revenue))+'</strong></div>'+
  '<div><small>'+prev+' · сопоставимые месяцы</small><strong>'+esc(whole(c.previous_revenue))+'</strong></div>'+
  '<div><small>Изменение, BYN</small><strong>'+esc(whole(num(c.current_revenue)-num(c.previous_revenue)))+'</strong></div></div>'+
  '<div class="s360-head-actions" style="margin-top:14px"><h3>История продаж клиента по месяцам</h3><span class="s360-badge">'+yr+' · синий / '+prev+' · серый</span></div>'+
  '<div class="s360-client-graph">'+bars+'</div>'+
  '<h3 style="margin-top:16px">Товарные группы клиента</h3>'+
  '<div class="s360-tablewrap"><table><thead><tr><th>Группа</th><th>'+yr+', BYN</th><th>'+prev+', BYN</th></tr></thead><tbody>'+
  cats.map(x=>'<tr><td><button type="button" data-s360-drill-group="'+esc(x.category)+'" data-s360-drill-scope="client">'+esc(x.category)+' →</button></td><td>'+esc(whole(x.current_revenue))+'</td><td>'+esc(whole(x.previous_revenue))+'</td></tr>').join('')+'</tbody></table></div><div id="s360-drill-client-container" aria-live="polite">'+drillView('client')+'</div>'+
  '<div class="s360-muted" style="margin-top:10px">* Текущий месяц неполный и не включён в итоговое сравнение с начала года.</div></div>';
}
function clientsPanel(d){
 const preview=arr(d.top_clients).slice(0,7);
 if(!state.clientsOpen){
  return '<div class="s360-panel" id="s360-clients"><div class="s360-head-actions"><h3>Клиенты 360° · Продажи с начала года</h3>'+
  '<span class="s360-badge">1С · закрытые месяцы</span></div>'+
  (preview.length?preview.map(x=>'<div class="s360-row"><button type="button" data-s360-client-key="'+esc(x.client_key)+'"><b>'+esc(x.client_name||'—')+'</b>'+
  (x.is_unallocated?'<span class="s360-muted"> · без точной ТТ</span>':'')+'</button><b>'+esc(whole(x.revenue))+'</b>'+
  '<span>'+esc(x.manager_name||'—')+'</span><span>Детали</span></div>').join(''):'<div class="s360-muted">Подтверждённых продаж нет.</div>')+
  '<div class="s360-tabs" style="margin-top:12px"><button type="button" class="s360-btn primary" data-s360-all-clients>Все клиенты · Поиск и детализация</button></div></div>';
 }
 const result=state.clientData||{},rows=arr(result.items),total=num(result.total),pages=Math.max(1,Math.ceil(total/20)),page=Math.floor(state.clientOffset/20)+1;
 const list=rows.map(x=>
  '<button type="button" class="s360-client-item'+(state.clientKey===x.client_key?' active':'')+'" data-s360-client-key="'+esc(x.client_key)+'">'+
  '<span><b>'+esc(x.client_name||'—')+'</b><small class="s360-muted" style="display:block">'+esc(x.manager_name||'Менеджер не определён')+'</small></span>'+
  '<span>'+esc(whole(x.current_revenue))+'<small class="s360-muted" style="display:block">'+d.year+'</small></span>'+
  '<span>'+esc(whole(x.previous_revenue))+'<small class="s360-muted" style="display:block">'+d.previous_year+'</small></span></button>'
 ).join('');
 return '<div class="s360-panel" id="s360-clients"><div class="s360-head-actions"><div><h3>Клиенты 360° · Поиск и детализация</h3>'+
 '<div class="s360-muted">Серверный поиск по данным 1С · год и менеджер синхронизированы</div></div>'+
 '<button type="button" class="s360-btn" data-s360-all-clients>Свернуть список</button></div>'+
 '<div class="s360-client-search" style="margin-top:12px">'+
 '<input id="s360-client-search" data-s360-client-search value="'+esc(state.clientSearch)+'" placeholder="Название клиента или менеджер" aria-label="Поиск клиентов">'+
 '<button type="button" class="s360-btn primary" data-s360-client-find>Найти</button></div>'+
 (state.clientError?'<div class="s360-warn">'+esc(state.clientError)+' <button type="button" class="s360-btn" data-s360-client-find>Повторить</button></div>':'')+
 (state.clientLoading?'<div class="s360-loading" role="status">Загружаю клиентов из 1С…</div>':
 '<div class="s360-client-list">'+(list||'<div class="s360-muted">По запросу клиентов нет.</div>')+'</div>')+
 (total>0?'<div class="s360-head-actions" style="margin-top:12px"><span class="s360-muted">Найдено '+total+' · страница '+page+' из '+pages+'</span>'+
 '<div class="s360-tabs"><button type="button" class="s360-btn" data-s360-client-page="-1"'+(page===1?' disabled':'')+'>← Предыдущие</button>'+
 '<button type="button" class="s360-btn" data-s360-client-page="1"'+(page>=pages?' disabled':'')+'>Следующие →</button></div></div>':'')+
 clientDetailHtml(result.detail)+'</div>';
}
function render(){
 const root=mount();if(!root)return;
 if(state.legacy){
  root.innerHTML='<div class="s360-panel s360-head-actions"><div><h2>Исходные отчёты продаж</h2><div class="s360-muted">Режим подробных отчётов, новый директорский экран скрыт.</div></div>'+
   '<button type="button" class="s360-btn primary" data-s360-legacy>← Вернуться к Продажи 360°</button></div>';
  return;
 }
 if(!state.data){
  root.innerHTML=headerHtml(null)+filtersHtml(null)+
   (state.error?'<div class="s360-loading">Не удалось получить годовую аналитику: '+esc(state.error)+'<div style="margin-top:10px"><button type="button" class="s360-btn" data-s360-refresh>Повторить загрузку</button><button type="button" class="s360-btn" data-s360-legacy>Открыть исходный отчёт</button></div></div>':
   '<div role="status" class="s360-loading">Загружаю данные выбранного менеджера из 1С. Старые отчёты скрыты.</div><div class="s360-load-kpis" aria-hidden="true">'+Array.from({length:5},()=>'<div></div>').join('')+'</div>');
  return;
 }
 const focus=focusedMonth(state.data);if(focus)state.selectedMonth=focus.month;
 const d=state.data,y=ytd(d),kpi=getKpi(d);
 const periods=chartData(d,state.view);
 const comparison=y.delta===null?'—':(y.delta>=0?'+':'')+y.delta.toFixed(1).replace('.',',')+'%';
 const colors=y.delta===null?'':y.delta<0?'s360-negative':'s360-positive';
 root.innerHTML=headerHtml(d)+filtersHtml(d)+
 '<div class="s360-kpis">'+
 kpiCard('Продажи · всего',whole(y.current),y.months+' закрытых месяцев · 1С, с НДС')+
 kpiCard('К прошлому году',comparison,'Сопоставимые закрытые месяцы',colors)+
 kpiCard('Покупателей',fmt(d.active_clients_ytd),'Уникальных с продажами по 1С')+
 kpiCard('План/факт месяца',kpi.display,kpi.description+' · KPI без фильтра Триовиста')+
 kpiCard('Без точной ТТ',whole(d.unallocated_client_revenue),'Включено в общий оборот')+'</div>'+

 '<div class="s360-panel s360-chart-panel'+(state.chartExpanded?' expanded':'')+'"><div class="s360-head-actions">'+
 '<div><h3>Динамика с января · '+d.year+' / '+d.previous_year+'</h3>'+
 '<div class="s360-muted">Все продажи · с НДС · сумма без копеек</div></div>'+
 '<button type="button" class="s360-btn" data-s360-chart-expand>'+(state.chartExpanded?'Обычный размер':'Увеличить график')+'</button></div>'+
 trendSvg(periods)+
 '<div class="s360-legend"><span><i style="background:#2563eb"></i>'+d.year+'</span>'+
 '<span><i style="background:#94a3b8"></i>'+d.previous_year+'</span></div>'+
 focusedHtml(d,periods)+
 '<div class="s360-muted" style="margin-top:10px">* Незакрытые периоды показаны справочно и исключены из годового процента роста.</div></div>'+
 brief(d)+
 '<div class="s360-grid"><div class="s360-panel" id="s360-managers"><h3>Менеджеры · Отгрузки с января</h3>'+managerBars(d)+
 '<p class="s360-muted" style="margin-top:12px">График использует текущее закрепление клиентской базы. Не распределённый по менеджеру оборот не приписывается сотруднику.</p></div>'+
 '<div class="s360-panel" id="s360-categories"><h3>Товарные группы · Рейтинг продаж</h3><div class="s360-minirows">'+categoryTable(d)+'</div></div></div>'+
 matrix(d)+'<div id="s360-drill-global-container" aria-live="polite">'+drillView('global')+'</div>'+clientsPanel(d)+
 '<div class="s360-foot"><span class="s360-muted">ИИ-сигналы — гипотезы для проверки. Нельзя считать нулевые продажи доказательством незнания товара. Никакие задачи и экзамены автоматически не создаются.</span>'+
 '<button type="button" class="s360-btn" data-s360-legacy aria-expanded="'+String(state.legacy)+'">'+(state.legacy?'Скрыть прежние отчёты':'Раскрыть исходные отчёты и все фильтры')+'</button></div>';
}
function activatePeriod(key){
 if(!state.data)return;
 const rows=monthRows(state.data);
 let month=rows.find(x=>x.month===key);
 if(/^Q[1-4]$/.test(String(key))){
  const quarter=Number(String(key).slice(1));
  month=rows.filter(x=>Math.ceil(Number(x.month.slice(5,7))/3)===quarter&&x.has_current).slice(-1)[0]||
   rows.find(x=>Math.ceil(Number(x.month.slice(5,7))/3)===quarter);
 }
 if(month){state.selectedMonth=month.month;render()}
}
function onInput(e){
 const search=e.target.closest?.('[data-s360-client-search]');
 if(search)state.clientSearch=String(search.value||'').slice(0,120);
 const drill=e.target.closest?.('[data-s360-drill-input]');
 const scope=drill?.dataset?.s360DrillInput;
 if(drill&&drillStates[scope])drillStates[scope].search=String(drill.value||'').slice(0,120);
}
function onKeyDown(e){
 const search=e.target.closest?.('[data-s360-client-search]');
 if(search&&e.key==='Enter'){e.preventDefault();state.clientSearch=String(search.value||'').slice(0,120);state.clientOffset=0;state.clientKey='';resetDrill('client');loadClients();return}
 const drill=e.target.closest?.('[data-s360-drill-input]');
 const scope=drill?.dataset?.s360DrillInput;
 if(drill&&e.key==='Enter'&&drillStates[scope]){e.preventDefault();drillStates[scope].search=String(drill.value||'').slice(0,120);drillStates[scope].offset=0;loadDrill(scope);return}
 if(e.key!=='Enter'&&e.key!==' ')return;
 const p=e.target.closest?.('[data-s360-point]');
 if(!p)return;
 e.preventDefault();activatePeriod(p.dataset.s360Point);
}
function onChange(e){
 const t=e.target.closest?.('[data-s360-select]');if(!t)return;
 const v=t.value,k=t.dataset.s360Select;
 if(k==='year'){
  const y=Number(v);if(y>=2023&&y<=currentYear()){
   state.year=y;state.selectedMonth='';state.category='all';state.expanded=false;state.draft=false;clearClientState();resetDrill('global');invalidateDrillCache();load(false);
  }
 }
 if(k==='manager'){
  if(!boss())return;
  state.manager=v;state.category='all';state.expanded=false;state.draft=false;clearClientState();resetDrill('global');invalidateDrillCache();load(false);
 }
 if(k==='month'){
  const choices=state.data?monthRows(state.data).map(x=>x.month):[];
  if(choices.includes(v)){state.selectedMonth=v;render()}
 }
 if(k==='view'&&['months','quarters'].includes(v)){state.view=v;render()}
 if(k==='category'){state.category=v;state.draft=false;openDrill('global',v)}
}
function jump(section){$(ID)?.querySelector?.('#s360-'+section)?.scrollIntoView?.({behavior:'smooth',block:'nearest'})}
function originalReports(openCompare){
 state.legacy=true;mount();render();
 // Native report is synchronized only when explicitly opened, never while changing Sales360 filters.
 if(boss()&&typeof w.salesMgr374==='function')w.salesMgr374(state.manager);
 if(state.selectedMonth&&typeof w.salesMonth374==='function')w.salesMonth374(state.selectedMonth);
 if(openCompare&&typeof w.msyOpen374==='function')w.msyOpen374();
 setTimeout(()=>$('manager-sales-yoy-v23634')?.scrollIntoView?.({behavior:'smooth',block:'start'}),70);
}
function onClick(e){
 const point=e.target.closest?.('[data-s360-point]');
 if(point){activatePeriod(point.dataset.s360Point);return}
 const t=e.target.closest?.('button');if(!t)return;
 const a=t.dataset;
 if(a.s360Refresh!==undefined){clearClientState();resetDrill('global');invalidateDrillCache();load(true);return}
 if(a.s360ChartExpand!==undefined){state.chartExpanded=!state.chartExpanded;render();return}
 if(a.s360Step!==undefined){
  const months=monthRows(state.data).map(x=>x.month),i=months.indexOf(focusedMonth(state.data)?.month);
  const next=i+Number(a.s360Step);
  if(next>=0&&next<months.length){state.selectedMonth=months[next];render()}
  return;
 }
 if(a.s360Mgr!==undefined&&boss()){state.manager=a.s360Mgr;state.category='all';state.draft=false;clearClientState();resetDrill('global');invalidateDrillCache();load(false);return}
 if(a.s360Category!==undefined){state.category=a.s360Category;state.draft=false;openDrill('global',a.s360Category);return}
 if(a.s360BriefGroup!==undefined){
  const category=String(a.s360BriefGroup).slice(0,200);
  state.category=category;
  openDrill('global',category);
  $('s360-drill-global-container')?.scrollIntoView?.({behavior:'smooth',block:'nearest'});
  return;
 }
 if(a.s360BriefDraft!==undefined&&boss()){
  state.category=String(a.s360BriefDraft).slice(0,200);
  state.draft=true;render();
  $('s360-matrix')?.scrollIntoView?.({behavior:'smooth',block:'nearest'});
  return;
 }
 if(a.s360DrillGroup!==undefined){
  const scope=a.s360DrillScope==='client'?'client':'global';
  openDrill(scope,a.s360DrillGroup);return;
 }
 if(a.s360DrillSubgroup!==undefined){
  const scope=a.s360DrillScope==='client'?'client':'global',st=drillStates[scope];
  if(st?.category){st.level='sku';st.subgroup=String(a.s360DrillSubgroup).slice(0,250);st.offset=0;st.search='';st.data=null;loadDrill(scope)}return;
 }
 if(a.s360DrillBack!==undefined){
  const scope=a.s360DrillScope==='client'?'client':'global',st=drillStates[scope];
  if(st?.category){st.level='subgroups';st.subgroup='';st.offset=0;st.search='';st.data=null;loadDrill(scope)}return;
 }
 if(a.s360DrillClose!==undefined){
  const scope=a.s360DrillScope==='client'?'client':'global';resetDrill(scope);paintDrill(scope);return;
 }
 if(a.s360DrillFind!==undefined){
  const scope=a.s360DrillScope==='client'?'client':'global',st=drillStates[scope];
  if(st?.category){st.search=String($('s360-drill-search-'+scope)?.value??st.search).slice(0,120);st.offset=0;loadDrill(scope)}return;
 }
 if(a.s360DrillPage!==undefined){
  const scope=a.s360DrillScope==='client'?'client':'global',st=drillStates[scope];
  if(st?.category){
   const next=st.offset+Number(a.s360DrillPage)*50;
   if(next>=0&&next<num(st.data?.total)){st.offset=next;loadDrill(scope)}
  }return;
 }
 if(a.s360Jump!==undefined){jump(a.s360Jump);return}
 if(a.s360Expand!==undefined){state.expanded=true;render();return}
 if(a.s360Month!==undefined){activatePeriod(a.s360Month);return}
 if(a.s360ClientCard!==undefined){if(typeof w.openClient==='function')w.openClient(a.s360ClientCard);return}
 if(a.s360AllClients!==undefined){
  state.clientsOpen=!state.clientsOpen;
  if(state.clientsOpen){clearClientState();loadClients()}
  else{clearClientState();render()}
  return;
 }
 if(a.s360ClientKey!==undefined){
  state.clientsOpen=true;resetDrill('client');state.clientKey=String(a.s360ClientKey).slice(0,300);state.clientOffset=0;loadClients();return;
 }
 if(a.s360ClientFind!==undefined){
  state.clientsOpen=true;state.clientSearch=String($('s360-client-search')?.value??state.clientSearch).slice(0,120);
  state.clientOffset=0;state.clientKey='';resetDrill('client');loadClients();return;
 }
 if(a.s360ClientPage!==undefined){
  const count=num(state.clientData?.total);
  const next=state.clientOffset+Number(a.s360ClientPage)*20;
  if(next>=0&&next<count){state.clientOffset=next;state.clientKey='';resetDrill('client');loadClients()}
  return;
 }
 if(a.s360ClientClose!==undefined){state.clientKey='';resetDrill('client');loadClients();return;}
 if(a.s360Legacy!==undefined){
  if(state.legacy){state.legacy=false;mount();render()}
  else originalReports(false);
  return;
 }
 if(a.s360Draft!==undefined&&boss()){state.draft=!state.draft;render();return}
 if(a.s360Copy!==undefined&&boss()){
  const value=$('s360-draft-text')?.value||'';
  if(!value)return;
  const clipboard=w.navigator?.clipboard;
  if(clipboard?.writeText){clipboard.writeText(value).then(()=>{t.textContent='Скопировано';},()=>{t.textContent='Скопируйте текст вручную';});}
  else{t.textContent='Выделите и скопируйте текст';$('s360-draft-text')?.select?.();}
  return;
 }
 if(a.s360Tasks!==undefined&&boss()&&typeof w.goPage==='function')w.goPage('tasks','Задачи ИИ');
}
async function load(force=false){
 const root=mount();if(!root||active()!=='sales')return;
 const serial=++requestVersion;
 const key=[viewer(),state.year,boss()?state.manager:managerMe()].join('|');
 const hit=cache.get(key);
 if(!force&&hit&&Date.now()-hit.at<TTL){state.data=hit.data;state.error='';state.loading=false;render();if(state.clientsOpen&&!state.clientData)loadClients();return}
 state.data=null;state.error='';state.loading=true;render();
 try{
  let work=pending.get(key);
  if(!work||force){
   const database=dbx();if(!database?.rpc)throw Error('Источник Supabase недоступен');
   work=Promise.resolve().then(()=>database.rpc('crm_sales360_annual_v2',{
    p_year:state.year,p_manager:boss()&&state.manager!=='all'?state.manager:null,p_exclude_triovist:false
   })).then(({data,error})=>{if(error)throw error;return data;});
   pending.set(key,work);
   work.finally(()=>{if(pending.get(key)===work)pending.delete(key)}).catch(()=>{});
  }
  const result=await work;
  if(serial!==requestVersion||active()!=='sales')return;
  if(!result||!Array.isArray(result.months))throw Error('Сервер вернул неполную годовую аналитику');
  state.data=result;state.error='';cache.set(key,{at:Date.now(),data:result});
  while(cache.size>16)cache.delete(cache.keys().next().value);
 }catch(err){
  if(serial===requestVersion){state.error=String(err?.message||err);state.data=null;console.warn('Sales360 annual read-only request',err)}
  }finally{if(serial===requestVersion){state.loading=false;render();if(state.clientsOpen&&state.data&&!state.clientData)loadClients()}}
}
async function loadClients(){
 if(!state.clientsOpen||!state.data||active()!=='sales')return;
 const serial=++clientVersion;
 state.clientError='';state.clientLoading=true;render();
 try{
  const database=dbx();if(!database?.rpc)throw Error('Источник Supabase недоступен');
  const {data,error}=await database.rpc('crm_sales360_clients_v2',{
   p_year:state.year,
   p_manager:boss()&&state.manager!=='all'?state.manager:null,
   p_exclude_triovist:false,
   p_search:state.clientSearch.trim().slice(0,120),
   p_limit:20,p_offset:state.clientOffset,p_client_key:state.clientKey||null
  });
  if(error)throw error;
  if(serial!==clientVersion||active()!=='sales')return;
  if(!data||!Array.isArray(data.items))throw Error('Неполный ответ сервера по клиентам');
  state.clientData=data;
 }catch(err){
  if(serial===clientVersion){state.clientError=String(err?.message||err);state.clientData=null;console.warn('Sales360 client scoped RPC',err)}
 }finally{if(serial===clientVersion){state.clientLoading=false;render()}}
}
function install(){
 if(wrapped)return;
 const original=w.renderSales;
 if(typeof original!=='function')return;
 sourceRender=original;
 w.renderSales=function(){
  const out=sourceRender.apply(this,arguments);
  if(active()==='sales'){if(!mounted)mount();load(false);}
  return out;
 };
 wrapped=true;
 if(active()==='sales')load(false);
}
w.RESANTA_SALES360_V1=Object.freeze({version:'20261110.5',readOnly:true,annualRpc:'crm_sales360_annual_v2',clientsRpc:'crm_sales360_clients_v2',productRpc:'crm_sales360_product_drill_v3',ytd,chartData,categoryMatrix,managerGaps,monthKpi,directorSignals});
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})(window,document);
