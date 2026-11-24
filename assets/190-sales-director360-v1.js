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
const state={year:currentYear(),manager:boss()?'all':managerMe(),view:'months',category:'all',detail:'clients',expanded:false,legacy:false,fallbackReason:'',loading:false,error:'',data:null,selectedMonth:'',period1Start:'',period1End:'',period2Start:'',period2End:'',comparisonData:null,comparisonError:'',comparisonLoading:false,draft:false,chartExpanded:false,clientsOpen:true,clientSearch:'',clientOffset:0,clientKey:'',clientTab:'overview',clientFocusMonth:'',clientData:null,clientError:'',clientLoading:false,focusClientOnLoad:false,recoveryPeriod:'last3',recoveryTab:'subgroups',recoveryExpanded:false,recoveryData:null,recoveryLoading:false,recoveryError:'',recoveryFocusCat:'',recoveryFocusSub:'',recoveryFocusData:null,recoveryFocusLoading:false,recoveryFocusError:'',clientRecoveryFilter:'',clientRecoveryData:null,clientRecoveryLoading:false,clientRecoveryError:'',clientListScroll:0,analysisOpen:false};
let mounted=false,wrapped=false,requestVersion=0,clientVersion=0,recoveryVersion=0,clientRecoveryVersion=0,recoveryFocusVersion=0,sourceRender=null;
let salesScope='',annualLoadingKey='',comparisonKey='';
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
const kpiMonths=new Map(),kpiPeriods=new Map();
const kpiManagerKey=name=>String(name||'').trim().toLowerCase();
const fieldManagers=['Руднев','Ачинович','Шкуран'];
const recoveryCache=new Map(),recoveryPending=new Map(),RECOVERY_TTL=300000;
// Drill responses are aggregate-only; repeat navigation should never rescan 1C.
const drillCache=new Map(),drillPending=new Map(),DRILL_TTL=300000,DRILL_MAX=60;
function drillKey(scope,st){return JSON.stringify([viewer(),state.year,boss()?state.manager:managerMe(),scope,st.clientKey||'',st.category,st.level,st.subgroup,st.search,st.offset]);}
function invalidateDrillCache(){drillCache.clear();drillPending.clear();}
function paintDrill(scope){
 // Replace the product section in place: no client list remount and no scroll jump.
 const target=scope==='client' ? $('s360-client-product-container') : $('s360-drill-global-container');
 if(target){
  target.innerHTML=scope==='client'?clientProductsHtml(state.clientData?.detail):drillView('global');
  return;
 }
 render();
}

function clearClientRecovery(){clientRecoveryVersion++;state.clientRecoveryData=null;state.clientRecoveryLoading=false;state.clientRecoveryError='';state.clientRecoveryFilter='';}
function clearRecovery(){
 recoveryVersion++;state.recoveryData=null;state.recoveryLoading=false;state.recoveryError='';
 recoveryFocusVersion++;state.recoveryFocusCat='';state.recoveryFocusSub='';state.recoveryFocusData=null;state.recoveryFocusLoading=false;state.recoveryFocusError='';
 clearClientRecovery();
}
function clearClientState(){clientVersion++;state.clientOffset=0;state.clientKey='';state.clientTab='overview';state.clientFocusMonth='';state.clientData=null;state.clientError='';state.clientLoading=false;state.focusClientOnLoad=false;clearClientRecovery();resetDrill('client');}
const monthRows=d=>arr(d?.months).filter(x=>x?.has_current||(state.year<currentYear()&&x?.has_previous));
const focusedMonth=d=>{const a=monthRows(d);return a.find(x=>x.month===state.selectedMonth)||a.filter(x=>x.closed&&x.has_current).slice(-1)[0]||a.filter(x=>x.has_current).slice(-1)[0]||a.slice(-1)[0]||null};
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
 '<div class="s360-muted" style="margin-top:8px">'+(p.partial?'Текущий месяц':'Завершённый месяц')+'</div>';
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
 return '<div class="s360-panel s360-primary-filters"><div class="s360-filters">'+
 periodFiltersHtml(d)+showSelectorOptions(d)+
 '<button type="button" class="s360-btn" data-s360-refresh>Обновить</button></div></div>';
}
function headerHtml(d){
 return '<div class="s360-head"><div><h2>Продажи филиала</h2></div></div>';
}
function monthKpi(d){
 const planned=arr(d?.kpi).filter(row=>num(row.plan)>0);
 return {plan:planned.reduce((total,row)=>total+num(row.plan),0),actual:planned.reduce((total,row)=>total+num(row.actual),0),count:planned.length};
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
 scope+' .s360-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}',
 scope+' .s360-advanced,'+scope+' .s360-annual-detail{border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--card)}',
 scope+' .s360-advanced summary,'+scope+' .s360-annual-detail summary{font-size:16px;font-weight:700;cursor:pointer;color:var(--a)}',
 scope+' .s360-advanced .s360-filters{margin-top:12px}',
 scope+' .s360-annual-detail>*:not(summary){margin-top:12px}',
 scope+' .s360-compare-filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:10px 0}',
 scope+' .s360-compare-filters fieldset{display:flex;gap:10px;min-width:0;border:1px solid var(--border);border-radius:9px;padding:10px}',
 scope+' .s360-compare-filters legend{font-size:15px;font-weight:700;padding:0 4px}',
 scope+' .s360-compare-filters label{flex:1;font-size:14px}',
 scope+' .s360-compare-filters input{width:100%;min-width:0;border:1px solid var(--border);border-radius:7px;padding:8px;font:inherit}',
 scope+' .s360-compare-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}',
 scope+' .s360-compare-card{display:grid;gap:6px;padding:10px;border:1px solid var(--border);border-radius:9px}',
 scope+' .s360-compare-card span{font-size:14px;color:var(--sub)}',
 scope+' .s360-compare-card strong{font-size:20px;overflow-wrap:anywhere}',
 scope+' .s360-compare-bars{display:grid;grid-template-columns:20px 1fr;gap:7px;align-items:center;margin:12px 0}',
 scope+' .s360-compare-bars>div{height:14px;background:var(--bg);border-radius:7px;overflow:hidden}',
 scope+' .s360-compare-bars i{display:block;height:100%;background:var(--a,#185FA5);border-radius:7px}',
 scope+' .s360-compare-bars i.previous{background:#94a3b8}',
 scope+' .s360-compare-result{display:flex;gap:16px;flex-wrap:wrap;font-size:16px}',
 scope+' .s360-period-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}',
 scope+' .s360-period-value{display:grid;gap:5px;padding:12px;border:1px solid var(--border);border-radius:10px;min-width:0}',
 scope+' .s360-period-value small{font-size:12px;color:var(--sub)}',
 scope+' .s360-period-value strong{font-size:22px;overflow-wrap:anywhere}',
 scope+' .s360-period-value span{font-size:12px;color:var(--sub);line-height:1.4}',
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
 scope+' .s360-client-month{display:grid;grid-template-columns:52px minmax(100px,1fr) 160px 85px;gap:10px;align-items:center;font-size:14px}',
 scope+' .s360-client-tracks,.s360-client-month-values{display:grid;gap:5px;min-width:0}',
 scope+' .s360-client-month-values{font-variant-numeric:tabular-nums}',
 scope+' .s360-client-month-percent{text-align:right;white-space:nowrap}',
 scope+' .s360-client-track{height:10px;border-radius:7px;background:var(--bg);display:flex;overflow:hidden}',
 scope+' .s360-client-track i{height:10px;display:block;background:var(--a,#185FA5)}',
 scope+' .s360-client-track.previous i{background:#94a3b8}',
 scope+' .s360-client-split{display:grid;grid-template-columns:minmax(260px,0.83fr) minmax(430px,1.35fr);gap:12px;margin-top:14px;align-items:start}',
 scope+' .s360-client-left{border:1px solid var(--border);border-radius:10px;padding:10px;max-height:75vh;overflow:auto;min-width:0}',
 scope+' .s360-client-right{border:1px solid var(--border);border-radius:10px;padding:12px;min-height:220px;max-height:75vh;overflow-y:auto;min-width:0;scroll-margin-top:16px}',
 scope+' .s360-client-right .s360-client-detail{border:0;background:transparent;margin:0;padding:0}',
 scope+' .s360-client-empty{color:var(--sub);padding:25px 15px;text-align:center;line-height:1.7}',
 scope+' .s360-client-split .s360-client-item{grid-template-columns:minmax(120px,1fr) minmax(128px,auto);padding:10px;gap:8px}',
 scope+' .s360-client-item-amount{text-align:right;display:grid;gap:4px;white-space:nowrap}',
 scope+' .s360-client-item-amount small{font-size:10px;color:var(--sub)}',
 scope+' .s360-recovery-scroll{max-height:380px;overflow:auto;display:grid;gap:6px;overscroll-behavior:contain}',
 scope+' .s360-recovery-tabs{margin-top:14px;margin-bottom:9px}',
 scope+' .s360-recovery-spotlight{padding:14px;background:var(--bg);border:1px solid var(--border);border-radius:11px;display:grid;gap:9px}',
 scope+' .s360-recovery-list{display:grid;gap:5px;margin-top:9px}',
 scope+' .s360-recovery-row{width:100%;background:var(--card);color:var(--text);border:1px solid var(--border);border-radius:9px;padding:11px;display:grid;grid-template-columns:minmax(135px,2fr) minmax(100px,1fr) minmax(105px,1.1fr) 16px;gap:10px;align-items:center;text-align:left;font:inherit;cursor:pointer}',
 scope+' .s360-recovery-row:hover{background:var(--bg)}',
 scope+' .s360-recovery-name{display:grid;gap:4px;min-width:0}',
 scope+' .s360-recovery-name b{font-size:12px;overflow-wrap:anywhere}',
 scope+' .s360-recovery-name small, '+scope+' .s360-recovery-values small, '+scope+' .s360-recovery-delta small{font-size:11px;color:var(--sub)}',
 scope+' .s360-recovery-values, '+scope+' .s360-recovery-delta{display:grid;gap:3px;font-size:12px}',
 scope+' .s360-recovery-delta small{color:inherit}',
 scope+' .s360-recovery-foot{margin-top:10px;font-size:11px}',
 scope+' .s360-client-recovery{margin-top:14px;padding:12px;border:1px solid var(--border);border-radius:10px}',
 scope+' .s360-client-recovery .s360-recovery-row{grid-template-columns:minmax(120px,1fr) auto 16px}',
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
 scope+' .s360-drill-row{width:100%;display:grid;grid-template-columns:minmax(210px,2fr) minmax(100px,.85fr) minmax(100px,.85fr) minmax(115px,.9fr);gap:12px;align-items:center;text-align:right;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);padding:12px;font:inherit;font-size:14px}',
 scope+' button.s360-drill-row{cursor:pointer}',
 scope+' button.s360-drill-row:hover{background:var(--bg)}',
 scope+' .s360-drill-row>:first-child{text-align:left;overflow-wrap:anywhere}',
 scope+' .s360-drill-row b{font-size:14px}',
 scope+' .s360-drill-row small{font-size:12px;color:var(--sub);display:block;margin-top:3px}',
 scope+' .s360-drill-year{display:none!important}',
 scope+' .s360-drill-row .s360-drill-change strong{font-size:16px}',
 scope+' .s360-annual-detail[hidden]{display:none!important}',
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
 scope+' .s360-primary-filters .s360-compare-filters{flex:1 1 100%;margin:0}',
 scope+' .s360-primary-filters .s360-field{min-width:180px}',
 scope+' .s360-kpi-detail summary{cursor:pointer;color:var(--a);font-size:13px}',
 scope+' .s360-kpi-detail p{font-size:14px;line-height:1.5;margin:8px 0 0}',
 scope+' .s360-explain{margin-top:8px;font-size:13px}',
 scope+' .s360-explain summary{cursor:pointer;color:var(--a)}',
 scope+' .s360-explain p{margin:7px 0 0;line-height:1.5}',
 scope+' .s360-compare-months{display:grid;gap:2px;margin-top:10px}',
 scope+' .s360-compare-month{display:grid;grid-template-columns:70px minmax(0,1fr) 85px;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--border);font-size:14px}',
 scope+' .s360-compare-month-bars{display:grid;gap:4px;min-width:0}',
 scope+' .s360-compare-month-bars>div{height:19px;background:var(--bg);border-radius:6px;position:relative;overflow:hidden}',
 scope+' .s360-compare-month-bars i{display:block;height:100%;background:var(--a,#185FA5);border-radius:6px}',
 scope+' .s360-compare-month-bars i.previous{background:#94a3b8}',
 scope+' .s360-compare-month-bars span{position:absolute;right:6px;top:1px;font-size:12px;font-weight:700;text-shadow:0 1px white}',
 scope+' .s360-compare-month strong{text-align:right}',
 scope+' .s360-compare-month details{grid-column:2 / -1;font-size:13px}',
 scope+' .s360-compare-month details summary{color:var(--a);cursor:pointer}',
 scope+' .s360-client-list-full{margin-top:10px}',
 scope+' .s360-client-full .s360-client-detail{padding:0;margin:0;border:0;background:transparent}',
 scope+' .s360-client-full .s360-client-detail>.s360-head-actions{margin-bottom:14px}',
 scope+' .s360-client-item{font-size:15px}',
 scope+' .s360-client-item-amount small{font-size:13px}',
 scope+' button.s360-client-month{width:100%;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);padding:9px;text-align:left;cursor:pointer;font:inherit;font-size:13px}',
 scope+' button.s360-client-month.active{border-color:var(--a);background:var(--ab)}',
 scope+' .s360-client-month-focus{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px;padding:12px;background:var(--bg);border-radius:9px;font-size:14px}',
 scope+' .s360-client-action{display:grid;gap:5px;margin-top:12px;padding:14px;border:1px solid var(--border);border-radius:9px;font-size:14px;line-height:1.5}',
 scope+' .s360-product-level{border:1px solid var(--border);border-radius:9px;margin-top:8px;padding:10px}',
 scope+' .s360-product-level summary{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;cursor:pointer;font-size:14px}',
 scope+' .s360-product-level summary span{color:var(--sub)}',
 scope+' .s360-product-item{display:grid;grid-template-columns:minmax(150px,1fr) minmax(240px,1.6fr);gap:12px;border-top:1px solid var(--border);padding:12px 0;font-size:14px}',
 scope+' .s360-product-item>div{display:grid;gap:4px}',
 scope+' .s360-product-item small{font-size:12px;color:var(--sub)}',
 '@media(max-width:1050px){'+scope+' .s360-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}'+scope+' .s360-grid{grid-template-columns:1fr}}',
 '@media(max-width:640px){'+scope+' .s360-compare-month{grid-template-columns:45px minmax(0,1fr) 65px;gap:6px;font-size:12px}'+scope+' .s360-compare-month-bars span{font-size:11px}'+scope+' .s360-product-item{grid-template-columns:1fr}'+scope+' .s360-client-month{grid-template-columns:42px minmax(0,1fr) 72px;gap:7px}'+scope+' .s360-client-month-values{grid-column:2 / -1;grid-row:2;display:flex;justify-content:space-between;flex-wrap:wrap;font-size:13px}'+scope+' .s360-client-month-percent{grid-column:3;grid-row:1;font-size:13px}}',
 '@media(max-width:640px){'+scope+' .s360-period-grid,'+scope+' .s360-compare-grid,'+scope+' .s360-compare-filters{grid-template-columns:1fr}'+scope+' .s360-compare-filters fieldset{flex-wrap:wrap}'+scope+' .s360-period-value strong{font-size:20px}}',
 '@media(max-width:1030px){'+scope+' .s360-client-split{grid-template-columns:1fr}'+scope+' .s360-client-left{max-height:330px}'+scope+' .s360-client-right{max-height:none;scroll-margin-top:12px}}',
 '@media(max-width:640px){'+scope+' .s360-focus{grid-template-columns:1fr 1fr}'+scope+' .s360-load-kpis{grid-template-columns:repeat(2,1fr)}'+scope+' .s360-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}'+scope+' h2{font-size:19px}'+scope+' .s360-tile strong{font-size:19px}'+scope+' .s360-row{grid-template-columns:1fr 85px 85px}'+scope+' .s360-row span:last-child{grid-column:2 / 4;text-align:right}'+scope+' .s360-client-item{grid-template-columns:1fr 1fr}'+scope+' .s360-client-item span:first-child{grid-column:1 / -1}'+scope+' .s360-client-split .s360-client-item span:first-child{grid-column:auto}'+scope+' .s360-drill-row{grid-template-columns:1fr 1fr}'+scope+' .s360-drill-row>:first-child{grid-column:1 / -1}'+scope+' .s360-drill-header{display:none}'+scope+' .s360-drill-row .s360-drill-year{display:block!important}'+scope+' .s360-drill-change{grid-column:1 / -1;text-align:left;border-top:1px solid var(--border);padding-top:7px}'+scope+' .s360-brief-overview{grid-template-columns:1fr 1fr}'+scope+' .s360-recovery-row{grid-template-columns:1fr auto 16px}'+scope+' .s360-recovery-values{display:none}}'
 ].join('\n');
}
function mount(){
 const page=$(PAGE);if(!page)return null;
 let root=$(ID);
 if(!root){
  const st=d.createElement('style');st.id=CSS;st.textContent=styles();d.head.appendChild(st);
  root=d.createElement('section');root.id=ID;root.setAttribute('aria-label','Продажи · директорский контроль');
  page.insertAdjacentElement('afterbegin',root);
  root.addEventListener('click',onClick);
  root.addEventListener('toggle',event=>{
   if(event.target.matches?.('[data-s360-analysis]')&&root.contains(event.target))state.analysisOpen=event.target.open;
  },true);
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
 for(const [key,color] of [['previous','#94a3b8'],['current','#185FA5']]){
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
   svg+='<text x="'+px+'" y="'+ty.toFixed(1)+'" text-anchor="middle" fill="'+(above?'#185FA5':'#64748b')+'" font-size="12" font-weight="700">'+esc(chartValue(a[key]))+'</text>';
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
function planKpiCard(kpi){
 const plan=kpi?.plan;
 const known=plan?.total>0;
 const value=known?(plan.actual/plan.total*100).toFixed(1).replace('.',',')+'%':'—';
 const scope=known&&plan.months.length<kpi.selectedCount
  ? 'По утверждённым месяцам · '+plan.months.length+' из '+kpi.selectedCount
  : 'Период 1 · план отгрузок';
 const status=kpi?.status==='loading'?'Загружаю план…':kpi?.status==='error'?'Не удалось загрузить план':
  'Для выбранного периода план не подтверждён';
 return '<div class="s360-tile"><small>Выполнение плана</small><strong>'+esc(value)+'</strong>'+(
  known?'<em>'+esc(scope)+'</em><details class="s360-kpi-detail"><summary>План, факт и остаток</summary><p>'+
   esc(plan.months.map(monthLabel).join(', '))+'<br>План '+esc(money(plan.total))+' · факт '+esc(money(plan.actual))+
   ' · осталось '+esc(money(Math.max(0,plan.total-plan.actual)))+'</p></details>':
  '<em>'+esc(status)+'</em>')+'</div>';
}
function akbKpiCard(kpi){
 const known=kpi?.akb!==null&&kpi?.akb!==undefined;
 const description=known?'Уникальные клиенты с отгрузками · период 1':
  kpi?.status==='loading'?'Загружаю отгрузки…':kpi?.status==='error'?'Не удалось загрузить АКБ':'Нет подтверждённых данных';
 return kpiCard('АКБ',known?fmt(kpi.akb):'—',description);
}
function monthDashboard(month,actor){
 const key=JSON.stringify([actor,month]),now=Date.now();
 const hit=kpiMonths.get(key);
 if(hit&&(hit.loading||now-hit.at<TTL))return hit.promise;
 const entry={at:now,loading:true,promise:null};
 entry.promise=Promise.resolve().then(()=>{
  if(viewer()!==actor)throw Error('Сменилась учётная запись');
  return dbx().rpc('crm_manager_kpi360_dashboard_v2',{p_month:month});
 }).then(({data,error})=>{
  if(error)throw error;
  if(data?.version!=='kpi360-visual-v2'||data.month!==month||!Array.isArray(data.clients)||
     !Array.isArray(data.managers)||!Array.isArray(data.sales))throw Error('Неполный ответ KPI за '+month);
  entry.loading=false;
  entry.at=Date.now();
  return data;
 }).catch(error=>{
  if(kpiMonths.get(key)===entry)kpiMonths.delete(key);
  throw error;
 });
 kpiMonths.set(key,entry);
 while(kpiMonths.size>48)kpiMonths.delete(kpiMonths.keys().next().value);
 return entry.promise;
}
function summarizePeriodKpis(months,responses,manager){
 const keys=new Set();
 const expected=manager==='all'?fieldManagers.map(kpiManagerKey):[kpiManagerKey(manager)];
 const plan={months:[],total:0,actual:0};
 let available=0,failed=0;
 for(const [index,data] of responses.entries()){
  const month=months[index];
  if(!data){failed++;continue;}
  if(!data.latest_sales_month||month>data.latest_sales_month)continue;
  const permitted=new Set(data.managers.map(row=>kpiManagerKey(row.manager_name)));
  if(!expected.every(name=>permitted.has(name))){failed++;continue;}
  available++;
  for(const row of data.clients){
   if(expected.includes(kpiManagerKey(row.manager_name))&&row.client_key)keys.add(row.client_key);
  }
  const byManager=new Map(data.sales.map(row=>[kpiManagerKey(row.manager_name),row]));
  const rows=expected.map(name=>byManager.get(name));
  if(rows.some(row=>!(num(row?.shipment_plan)>0)))continue;
  plan.months.push(month);
  for(const row of rows){plan.total+=num(row.shipment_plan);plan.actual+=num(row.shipment);}
 }
 return {status:failed?'error':'ready',akb:available===months.length?keys.size:null,plan,selectedCount:months.length};
}
function periodKpis(comparison){
 const months=comparison.one?.complete?comparison.one.rows.map(row=>row.month):[];
 const manager=boss()?state.manager:managerMe(),actor=viewer();
 if(!months.length||manager!=='all'&&!fieldManagers.some(name=>kpiManagerKey(name)===kpiManagerKey(manager)))return null;
 const key=JSON.stringify([actor,manager,months]);
 const hit=kpiPeriods.get(key);
 if(hit&&(hit.status==='loading'||Date.now()-hit.at<TTL))return hit;
 const loading={status:'loading'};
 kpiPeriods.set(key,loading);
 while(kpiPeriods.size>20)kpiPeriods.delete(kpiPeriods.keys().next().value);
 const read=async()=>{
  const responses=[];
  for(let i=0;i<months.length;i+=2){
   if(viewer()!==actor||active()!=='sales'||kpiPeriods.get(key)!==loading)break;
   const pair=await Promise.allSettled(months.slice(i,i+2).map(month=>monthDashboard(month,actor)));
   for(const result of pair)responses.push(result.status==='fulfilled'?result.value:null);
  }
  if(kpiPeriods.get(key)!==loading)return;
  if(responses.length!==months.length){kpiPeriods.delete(key);return;}
  kpiPeriods.set(key,{...summarizePeriodKpis(months,responses,manager),at:Date.now()});
  if(active()==='sales'&&viewer()===actor&&state.data)render();
 };
 read().catch(error=>{
  console.warn('Sales 360 period KPI',error);
  if(kpiPeriods.get(key)===loading)kpiPeriods.set(key,{status:'error',at:Date.now()});
  if(active()==='sales'&&viewer()===actor&&state.data)render();
 });
 return loading;
}
function selectedSalesPeriods(d){
 const last=String(Math.max(1,num(d?.closed_month)||1)).padStart(2,'0');
 const firstYear=String(d?.year||state.year),secondYear=String((d?.year||state.year)-1);
 const p1={from:state.period1Start||firstYear+'-01',to:state.period1End||firstYear+'-'+last};
 const p2={from:state.period2Start||secondYear+'-01',to:state.period2End||secondYear+'-'+last};
 return {p1,p2};
}
function selectedMonths(data,from,to,side='current'){
 if(!data||!/^\d{4}-\d{2}$/.test(from)||!/^\d{4}-\d{2}$/.test(to)||from>to||from.slice(0,4)!==to.slice(0,4))return null;
 const year=Number(from.slice(0,4)),expected=side==='previous'?Number(data.previous_year):Number(data.year);
 if(year!==expected)return null;
 const rows=arr(data.months).filter(x=>{
  const month=String(x.month||'').slice(5,7),ym=from.slice(0,4)+'-'+month;
  return ym>=from&&ym<=to;
 });
 if(!rows.length)return null;
 const has=side==='previous'?'has_previous':'has_current',amount=side==='previous'?'previous':'current';
 const usable=rows.filter(x=>x[has]);
 const expectedCount=Number(to.slice(5,7))-Number(from.slice(5,7))+1;
 return {rows,usable,total:rows.reduce((sum,x)=>sum+num(x[amount]),0),
  complete:usable.length===expectedCount,partial:side==='current'&&rows.some(x=>x.partial),
  closed:side==='previous'||rows.every(x=>x.closed&&!x.partial)};
}
function selectedComparison(d){
 const {p1,p2}=selectedSalesPeriods(d);
 const one=selectedMonths(d,p1.from,p1.to,'current');
 const y2=Number(p2.from.slice(0,4));
 const source=y2===Number(d.year)?d:y2===Number(d.previous_year)?d:state.comparisonData;
 const side=y2===Number(d.previous_year)?'previous':'current';
 const two=selectedMonths(source,p2.from,p2.to,side);
 const complete=!!(one?.complete&&two?.complete);
 const sameSpan=!!(complete&&one.closed&&two.closed&&!one.partial&&!two.partial&&one.rows.length===two.rows.length);
 const comparable=sameSpan&&two.total>0;
 const delta=complete?one.total-two.total:null;
 return {p1,p2,one,two,side2:side,complete,comparable,delta,pct:comparable?delta/two.total*100:null};
}
function periodFiltersHtml(d){
 const {p1,p2}=selectedSalesPeriods(d),max=currentYear()+'-12';
 const input=(key,label,value)=>'<label class="s360-field"><span>'+label+'</span><input type="month" data-s360-period="'+key+'" min="2023-01" max="'+max+'" value="'+esc(value)+'"></label>';
 return '<div class="s360-compare-filters"><fieldset><legend>Период 1</legend>'+input('p1-from','С',p1.from)+input('p1-to','По',p1.to)+'</fieldset>'+
 '<fieldset><legend>Период 2</legend>'+input('p2-from','С',p2.from)+input('p2-to','По',p2.to)+'</fieldset></div>';
}
function selectedComparisonHtml(d){
 const x=selectedComparison(d),pct=x.pct===null?'—':(x.pct>0?'+':'')+x.pct.toFixed(1).replace('.',',')+'%';
 const label=p=>p.from===p.to?monthLabel(p.from):monthLabel(p.from)+' — '+monthLabel(p.to);
 const card=(title,period,part)=>'<div class="s360-compare-card"><span>'+esc(title)+' · '+esc(label(period))+'</span><strong>'+esc(part?.complete?money(part.total):'Нет подтверждённых данных')+'</strong></div>';
 const direction=x.pct===null?'Нет сравнения':x.pct>0?'Рост':x.pct<0?'Падение':'Без изменений';
 return '<div class="s360-panel s360-selected-comparison"><h3>Сравнение продаж</h3>'+
 (state.comparisonLoading?'<p role="status">Загружаю второй период…</p>':'')+
 (state.comparisonError?'<p role="alert">'+esc(state.comparisonError)+'</p>':'')+
 '<div class="s360-compare-grid">'+card('Период 1',x.p1,x.one)+card('Период 2',x.p2,x.two)+
 '<div class="s360-compare-card" title="'+esc(x.delta===null?'Точная разница не подтверждена':(x.delta>0?'+':'')+money(x.delta))+'"><span>'+direction+'</span><strong class="'+(x.pct<0?'s360-negative':x.pct>0?'s360-positive':'')+'">'+esc(pct)+'</strong></div></div>'+
 (x.one?.partial||x.two?.partial?'<span class="s360-badge">Текущий месяц неполный</span>':'')+
 '</div>';
}
function selectedChartHtml(d){
 const x=selectedComparison(d),first=x.one?.rows||[],second=x.two?.rows||[];
 if(!first.length||!second.length)return '';
 const amount2=x.side2==='previous'?'previous':'current';
 const both=first.map((row,i)=>({row,other:second[i]})).filter(x=>x.other);
 const max=Math.max(1,...both.flatMap(({row,other})=>[Math.max(0,num(row.current)),Math.max(0,num(other[amount2]))]));
 const card=({row,other})=>{
  const a=num(row.current),b=num(other[amount2]),full=!!(row.closed&&!row.partial&&(x.side2==='previous'||other.closed&&!other.partial));
  const secondaryMonth=x.side2==='previous'?x.p2.from.slice(0,4)+other.month.slice(4):other.month;
  const pct=full&&b>0?(a-b)/b*100:null,mark=pct===null?'—':(pct>0?'+':'')+pct.toFixed(1).replace('.',',')+'%';
  return '<div class="s360-compare-month" title="'+esc(monthLabel(row.month)+' / '+monthLabel(secondaryMonth)+': '+money(a)+' / '+money(b)+' · разница '+money(a-b))+'">'+
   '<b>'+esc(monthLabel(row.month).split(' ')[0])+'</b><div class="s360-compare-month-bars">'+
   '<div><i style="width:'+Math.max(0,a/max*100).toFixed(1)+'%"></i><span>'+esc(short(a))+'</span></div>'+
   '<div><i class="previous" style="width:'+Math.max(0,b/max*100).toFixed(1)+'%"></i><span>'+esc(short(b))+'</span></div></div>'+
   '<strong>'+esc(mark)+'</strong><details><summary>Точные суммы</summary><span>Период 1: '+esc(money(a))+' · период 2: '+esc(money(b))+' · разница: '+esc(money(a-b))+'</span></details></div>';
 };
 return '<div class="s360-panel"><h3>Динамика выбранных периодов</h3><div class="s360-legend"><span><i style="background:var(--a,#185FA5)"></i>Период 1</span><span><i style="background:#94a3b8"></i>Период 2</span></div><div class="s360-compare-months">'+both.map(card).join('')+'</div></div>';
}
function ensureSelectedSources(d){
 const x=selectedSalesPeriods(d),otherYear=Number(x.p2.from.slice(0,4));
 const expected=[viewer(),otherYear,boss()?state.manager:managerMe()].join('|');
 if(comparisonKey!==expected){
  comparisonKey=expected;
  state.comparisonData=null;state.comparisonLoading=false;state.comparisonError='';
 }
 if(otherYear!==Number(d.year)&&otherYear!==Number(d.previous_year)&&!state.comparisonError&&
   (!state.comparisonData||Number(state.comparisonData.year)!==otherYear)&&!state.comparisonLoading){
  const key=[viewer(),otherYear,boss()?state.manager:managerMe()].join('|');
  const hit=cache.get(key);
  if(hit&&Date.now()-hit.at<TTL){state.comparisonData=hit.data;state.comparisonError='';return}
  state.comparisonLoading=true;state.comparisonError='';
  const requested=otherYear,manager=boss()&&state.manager!=='all'?state.manager:null;
  Promise.resolve().then(()=>dbx().rpc('crm_sales360_annual_v2',{p_year:requested,p_manager:manager,p_exclude_triovist:false}))
   .then(({data,error})=>{if(error)throw error;if(!Array.isArray(data?.months))throw Error('Неполный ответ сервера');
    cache.set(key,{at:Date.now(),data});if(comparisonKey===key)state.comparisonData=data;
   }).catch(e=>{if(comparisonKey===key){state.comparisonError=String(e?.message||e);state.comparisonData=null;}})
   .finally(()=>{if(comparisonKey===key){state.comparisonLoading=false;if(active()==='sales')render()}});
 }
}
function periodComparison(d){
 const rows=monthRows(d),selected=focusedMonth(d);
 if(!selected)return null;
 const index=rows.findIndex(x=>x.month===selected.month);
 let before=rows[index-1];
 if(!before&&selected.month.endsWith('-01')){
  const december=arr(d?.months).find(x=>x.month===d.year+'-12');
  if(december?.has_previous)before={month:(d.year-1)+'-12',current:december.previous,has_current:true,closed:true,partial:false};
 }
 const closed=!!(selected.closed&&selected.has_current&&!selected.partial);
 const yearReady=closed&&selected.has_previous&&num(selected.previous)>0;
 const monthReady=closed&&before?.closed&&before.has_current&&!before.partial&&num(before.current)>0;
 const pct=(value,base)=>(num(value)-num(base))/num(base)*100;
 return {selected,before,yearPct:yearReady?pct(selected.current,selected.previous):null,
  monthPct:monthReady?pct(selected.current,before.current):null};
}
function periodComparisonHtml(d){
 const comparison=periodComparison(d);
 if(!comparison)return'';
 const {selected,before,yearPct,monthPct}=comparison;
 const choices=monthRows(d).filter(x=>x.has_current);
 const percent=value=>value===null?'—':(value>0?'+':'')+value.toFixed(1).replace('.',',')+'%';
 const card=(label,value,detail)=>'<div class="s360-period-value"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong><span>'+esc(detail)+'</span></div>';
 return '<div class="s360-panel s360-period" id="s360-period"><div class="s360-head-actions"><div><h3>Выбранный месяц · продажи</h3><div class="s360-muted">'+esc(selected.partial?'Текущий месяц':'Завершённый месяц')+'</div></div>'+
 '<div class="s360-field"><label for="s360-card-month">Период в карточке</label><select id="s360-card-month" data-s360-select="month">'+choices.map(x=>'<option value="'+esc(x.month)+'"'+(selected.month===x.month?' selected':'')+'>'+esc(monthLabel(x.month))+(x.partial?' · текущий':'')+'</option>').join('')+'</select></div></div>'+
 '<div class="s360-period-grid">'+card('Факт '+d.year,money(selected.current),monthLabel(selected.month))+
 card('К '+d.previous_year,percent(yearPct),selected.has_previous?money(selected.previous):'Нет данных прошлого года')+
 card('К предыдущему месяцу',percent(monthPct),before?.has_current?monthLabel(before.month)+' · '+money(before.current):'Нет сопоставимого месяца')+'</div>'+
 '</div>';
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
function recoveryStatus(row){
 const p=num(row?.delta_pct);
 return row?.status==='stopped'?'Продажи прекратились':
        row?.status==='new'?'Новое направление':
        row?.status==='growth'?'+'+p.toFixed(1).replace('.',',')+'%':
        row?.status==='decline'?p.toFixed(1).replace('.',',')+'%':'—';
}
function recoveryPeriodName(r){
 if(!r)return'Последние 3 закрытых месяца';
 const months=r.period==='ytd'?'С января':r.period==='quarter'?'Последний закрытый квартал':'Последние 3 закрытых месяца';
 return months+' · '+MONTHS[num(r.from_month)-1]+'–'+MONTHS[num(r.to_month)-1]+' '+r.year+' / '+r.previous_year;
}
function recoveryRow(row,tab){
 const positive=tab==='growth',isClient=tab==='clients'||(tab==='growth'&&row?.kind==='client');
 const item=isClient?row.client_name:row.kind==='sku'?(row.product||row.sku):row.subgroup||row.category;
 const sub=isClient?(row.manager_name||'Менеджер не определён'):
     [row.category,row.kind==='sku'?row.subgroup:null,row.sku?'SKU '+row.sku:null].filter(Boolean).join(' · ');
 const attrs=isClient?(' data-s360-rec-client="'+esc(row.client_key)+'"'):
   (' data-s360-rec-group="'+esc(row.category||'')+'" data-s360-rec-subgroup="'+esc(row.subgroup||'')+'" data-s360-rec-sku="'+esc(row.sku||'')+'"');
 const fall=row.delta_byn<0;
 return '<button type="button" class="s360-recovery-row"'+attrs+'>'+
  '<span class="s360-recovery-name"><b>'+esc(item||'Без названия')+'</b><small>'+esc(sub)+'</small></span>'+
  '<span class="s360-recovery-values"><small>'+row.previous_revenue.toLocaleString?.('ru-RU')+'</small><b>'+esc(whole(row.current_revenue))+'</b></span>'+
  '<span class="s360-recovery-delta '+(fall?'s360-negative':'s360-positive')+'"><b>'+(num(row.delta_byn)>0?'+':'')+esc(whole(row.delta_byn))+'</b><small>'+esc(recoveryStatus(row))+'</small></span>'+
  '<span class="s360-recovery-chevron">›</span></button>';
}
function recoveryFocusHtml(){
 if(!state.recoveryFocusCat)return'';
 const d=state.recoveryFocusData;
 const title=esc(state.recoveryFocusCat+(state.recoveryFocusSub?' · '+state.recoveryFocusSub:''));
 const close='<button type="button" class="s360-btn" data-s360-rec-focus-close>Закрыть</button>';
 const head='<div class="s360-head-actions"><div><h4>Разбор потерь · '+title+'</h4><div class="s360-muted">Тот же закрытый период, что в брифинге. Ниже — SKU и затронутые клиенты.</div></div>'+close+'</div>';
 if(state.recoveryFocusLoading||!d)return '<div class="s360-recovery-spotlight" id="s360-rec-focus">'+head+
 (state.recoveryFocusError?'<div class="s360-warn">'+esc(state.recoveryFocusError)+'</div>':
 '<div role="status" class="s360-muted">Получаю подробности из 1С…</div>')+'</div>';
 const skus=arr(d.skus).slice(0,60),clients=arr(d.clients).slice(0,60);
 const srows=skus.map(x=>'<div class="s360-recovery-row s360-recovery-static">'+
 '<span class="s360-recovery-name"><b>'+esc(x.product||x.sku||'Без артикула')+'</b><small>'+esc(x.sku?'SKU '+x.sku:'SKU не указан')+'</small></span>'+
 '<span>'+esc(whole(x.previous_revenue))+' → '+esc(whole(x.current_revenue))+'</span>'+
 '<span class="s360-negative">−'+esc(whole(x.loss_byn))+' · '+esc(recoveryStatus(x))+'</span></div>').join('');
 const crows=clients.map(x=>'<button type="button" class="s360-recovery-row" data-s360-rec-client="'+esc(x.client_key)+'">'+
 '<span class="s360-recovery-name"><b>'+esc(x.client_name||'—')+'</b><small>'+esc(x.manager_name||'Не распределён')+'</small></span>'+
 '<span>'+esc(whole(x.previous_revenue))+' → '+esc(whole(x.current_revenue))+'</span>'+
 '<span class="s360-negative">−'+esc(whole(x.loss_byn))+' · '+esc(recoveryStatus(x))+'</span><span>›</span></button>').join('');
 return '<div class="s360-recovery-spotlight" id="s360-rec-focus">'+head+
 '<h4>Падающие SKU ('+skus.length+')</h4>'+
 (srows||'<div class="s360-muted">По выбранной подгруппе SKU со снижением не найдено.</div>')+
 '<h4>Клиенты с падением ('+clients.length+')</h4>'+
 '<div class="s360-recovery-scroll">'+(crows||'<div class="s360-muted">По выбранной подгруппе клиентов со снижением нет.</div>')+'</div>'+
 '<div class="s360-muted">Числа — изменение выручки за сопоставимые месяцы, а не подтверждённые причины.</div>'+
 '<button type="button" class="s360-btn" data-s360-rec-open-full>Полная товарная детализация с января</button></div>';
}
function paintRecoveryFocus(){
 const target=$('s360-rec-focus-container');
 if(target)target.innerHTML=recoveryFocusHtml();
 else render();
}
async function loadRecoveryFocus(category,subgroup){
 if(!category||active()!=='sales')return;
 state.recoveryFocusCat=String(category).slice(0,200);
 state.recoveryFocusSub=String(subgroup||'').slice(0,250);
 state.recoveryFocusData=null;state.recoveryFocusError='';state.recoveryFocusLoading=true;
 const serial=++recoveryFocusVersion,cat=state.recoveryFocusCat,sub=state.recoveryFocusSub;
 paintRecoveryFocus();
 try{
  const database=dbx();if(!database?.rpc)throw Error('Источник Supabase недоступен');
  const {data,error}=await database.rpc('crm_sales360_recovery_v4',{
   ...recoveryArgs(),p_category:cat,p_subgroup:sub||null
  });
  if(error)throw error;
  if(serial!==recoveryFocusVersion||active()!=='sales')return;
  if(data?.version!=='sales360.recovery.4'||!Array.isArray(data.skus)||!Array.isArray(data.clients))
   throw Error('Неполный серверный разбор группы');
  state.recoveryFocusData=data;
 }catch(err){
  if(serial===recoveryFocusVersion)state.recoveryFocusError=String(err?.message||err);
 }finally{
  if(serial===recoveryFocusVersion){state.recoveryFocusLoading=false;paintRecoveryFocus();}
 }
}
function recoveryBrief(d){
 const r=state.recoveryData,loading=state.recoveryLoading;
 const periods=[['last3','3 месяца'],['quarter','Квартал'],['ytd','С января']];
 const selectors=periods.map(([key,label])=>'<button type="button" class="s360-btn'+(state.recoveryPeriod===key?' active':'')+'" data-s360-rec-period="'+key+'">'+label+'</button>').join('');
 const head='<div class="s360-head-actions"><div><h3>✦ Директорский брифинг · Где теряем и растём</h3>'+
 '<div class="s360-muted">Подгруппы, SKU, клиенты · одинаковые полностью закрытые месяцы двух лет</div></div>'+
 '<div class="s360-tabs">'+selectors+'</div></div>';
 if(loading||!r){
  const message=state.recoveryError?
   'Не удалось прочитать проверенную аналитику: '+esc(state.recoveryError)+'. <button type="button" class="s360-btn" data-s360-rec-retry>Повторить</button>':
   'Проверяю рост и падение по подгруппам, SKU и клиентам в 1С…';
  return '<div class="s360-panel" id="s360-director-brief">'+head+'<div role="status" class="s360-loading">'+message+'</div></div>';
 }
 const loss=arr(r.subgroups),clients=arr(r.clients),skus=arr(r.skus),growth=arr(r.growing_subgroups);
 const count=num(r.client_drop_30_count),gap=num(r.client_drop_30_gap);
 const title='<div class="s360-muted">'+esc(recoveryPeriodName(r))+' · обновление: '+esc(freshLabel({last_success_at:r.sales_imported_at}))+'</div>';
 const summary='<div class="s360-brief-overview">'+
 '<div><small>Подгрупп с заметным снижением</small><strong>'+loss.length+'</strong></div>'+
 '<div><small>Клиентов со снижением ≥30%*</small><strong>'+count+'</strong></div>'+
 '<div><small>Отрицательное отклонение этих клиентов</small><strong class="s360-negative">'+esc(whole(gap))+'</strong></div></div>';
 const first=loss[0],second=skus[0];
 const spotlight=first?'<div class="s360-recovery-spotlight"><div class="s360-head-actions"><b>Приоритет: '+esc(first.category+' · '+first.subgroup)+'</b>'+
 '<strong class="s360-negative">−'+esc(whole(first.loss_byn))+' · '+esc(recoveryStatus(first))+'</strong></div>'+
 '<div class="s360-muted">'+r.previous_year+': '+esc(whole(first.previous_revenue))+' → '+r.year+': '+esc(whole(first.current_revenue))+
 '. Проверь, какие SKU и какие клиенты дали снижение, наличие на складе, историю предложений, возвраты и сезонность. Причина не установлена.</div>'+
 (second&&second.category===first.category&&second.subgroup===first.subgroup?
 '<div class="s360-muted">Самое заметное снижение SKU: '+esc(second.product||second.sku||'—')+' · −'+esc(whole(second.loss_byn))+'</div>':'')+
 '<button type="button" class="s360-btn" data-s360-rec-group="'+esc(first.category)+'" data-s360-rec-subgroup="'+esc(first.subgroup)+'" data-s360-rec-sku="">Разобрать подгруппу и SKU</button></div>':
 '<div class="s360-note">Снижений подгрупп выше заданного порога в выбранном периоде не обнаружено. Проверь клиентов и SKU отдельно.</div>';
 const tabs=[['subgroups','Подгруппы',loss.length],['skus','SKU',skus.length],['clients','Клиенты',clients.length],['growth','Точки роста',growth.length]];
 const nav='<div class="s360-tabs s360-recovery-tabs">'+tabs.map(([key,name,n])=>
 '<button type="button" class="s360-btn'+(state.recoveryTab===key?' active':'')+'" data-s360-rec-tab="'+key+'">'+name+' · '+n+'</button>').join('')+'</div>';
 const current=state.recoveryTab==='skus'?skus:state.recoveryTab==='clients'?clients:state.recoveryTab==='growth'?growth:loss;
 const visible=state.recoveryExpanded?current:current.slice(0,7);
 const list=visible.length?visible.map(x=>recoveryRow(x,state.recoveryTab)).join(''):'<div class="s360-muted" style="padding:12px">По установленным порогам сигналов нет. Это не означает отсутствия проблем.</div>';
 const more=current.length>7?'<button type="button" class="s360-btn" data-s360-rec-more>'+
  (state.recoveryExpanded?'Показать меньше':'Показать все '+current.length)+'</button>':'';
 const note='<div class="s360-muted s360-recovery-foot">* Клиенты: база от 5 000 BYN, падение ≥30%. Подгруппы: база от 5 000 BYN, отклонение от 2 500 BYN. Новые и сезонные позиции проверяются отдельно. Ноябрь без подтверждённой ежедневной детализации не сравнивается. Сигналы — не доказанные причины и не автоматически назначенные задачи.</div>';
 return '<div class="s360-panel" id="s360-director-brief">'+head+title+
 (r.baseline_complete===false?'<div class="s360-warn">'+esc(r.data_quality_note||'История прошлого года неполная — сравнение условное')+'</div>':'')+
 summary+spotlight+nav+
 '<div class="s360-recovery-list">'+list+'</div><div class="s360-tabs">'+more+'</div>'+
 '<div id="s360-rec-focus-container" aria-live="polite">'+recoveryFocusHtml()+'</div>'+note+'</div>';
}
function paintClientRecovery(){
 const target=$('s360-client-recovery-container');
 if(target)target.innerHTML=clientRecoveryHtml();
 else render();
}
function clientRecoveryHtml(){
 const r=state.clientRecoveryData;
 const base='<div class="s360-client-recovery"><div class="s360-head-actions"><h3>Динамика клиента · где падение</h3>'+
 '<span class="s360-badge">'+esc(state.recoveryPeriod==='last3'?'Последние 3 месяца':state.recoveryPeriod==='ytd'?'С января':'Квартал')+'</span></div>';
 if(state.clientRecoveryLoading)return base+'<div class="s360-muted">Проверяю подгруппы и SKU клиента…</div></div>';
 if(state.clientRecoveryError)return base+'<div class="s360-warn">'+esc(state.clientRecoveryError)+'</div></div>';
 if(!r)return base+'<div class="s360-muted">Аналитика выбранного клиента ещё не загружена.</div></div>';
 const categories=arr(r.subgroups),skus=arr(r.skus);
 if(!categories.length&&!skus.length)return base+'<div class="s360-muted">Значимых падений по порогам за сопоставимый период не выявлено.</div></div>';
 const selected=state.clientRecoveryFilter;
 const selectedSkus=selected?skus.filter(x=>x.subgroup===selected):[];
 const rows=categories.map(x=>
 '<button type="button" class="s360-recovery-row" data-s360-rec-client-group="'+esc(x.category)+'" data-s360-rec-client-subgroup="'+esc(x.subgroup)+'">'+
 '<span class="s360-recovery-name"><b>'+esc(x.subgroup)+'</b><small>'+esc(x.category)+'</small></span>'+
 '<span class="s360-recovery-delta s360-negative"><b>−'+esc(whole(x.loss_byn))+'</b><small>'+esc(recoveryStatus(x))+'</small></span><span>›</span></button>').join('');
 return base+'<div class="s360-muted">Выберите подгруппу — появятся SKU именно этого клиента за тот же сопоставимый период. Причины падения ещё проверяются.</div>'+
 '<div class="s360-recovery-list">'+rows+'</div>'+
 (selected?'<div class="s360-recovery-spotlight"><div class="s360-head-actions"><b>SKU в подгруппе '+esc(selected)+'</b><button type="button" class="s360-btn" data-s360-rec-client-back>← Подгруппы</button></div>'+
 (selectedSkus.length?selectedSkus.map(x=>'<div class="s360-head-actions"><span>'+esc(x.product||x.sku||'Без артикула')+
  '<small class="s360-muted"> '+esc(x.sku||'SKU не указан')+'</small></span><strong class="s360-negative">−'+esc(whole(x.loss_byn))+'</strong></div>').join(''):
 '<div class="s360-muted">По выбранной подгруппе падающих SKU выше порога не найдено.</div>')+
 '<button type="button" class="s360-btn" data-s360-rec-client-full>Полная история SKU с января</button></div>':'')+'</div>';
}
function brief(d){
 return recoveryBrief(d);
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
  '<div class="s360-muted">С января по '+esc(period)+'</div></div>'+
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
 const signal=directorSignals(d).issues.find(s=>s.category===state.category);
 const owner=signal?.manager||(state.manager==='all'?'Назначить директору филиала':state.manager);
 const evidence=signal?.kind==='decline'?
  ('Факт '+d.year+': '+whole(signal.current)+', '+d.previous_year+': '+whole(signal.previous)+', отклонение −'+whole(signal.loss)+' ('+signal.pct.toFixed(1).replace('.',',')+'%).'):
  signal?.kind==='opportunity'?
  ('Нет продаж группы у '+signal.manager+', при продажах коллег '+whole(signal.peerRevenue)+'. Причина не установлена.'):
  'Зафиксировать оборот группы в сопоставимых закрытых периодах и определить проблему.';
 const content=[
  'ЧЕРНОВИК · НЕ НАЗНАЧЕНО',
  'Тема: Проверить продажи товарной группы «'+state.category+'».',
  'Ответственный (предложение): '+owner+'.',
  'Основание: '+evidence,
  'Проверить: 1) подгруппы и SKU с наибольшим снижением;',
  '2) наличие товара на складе Витебск и в пути; 3) историю продаж и активность покупателей;',
  '4) возвраты, сезонность, коммерческие предложения и переуступку клиентов.',
  'Результат: подтвердить или отвергнуть гипотезу, назвать причины с источниками,',
  'предложить конкретные действия по группам и клиентам, зафиксировать проверяемый результат.',
  'Любое обучение/тест — только после выявления пробела и решения руководителя.',
  'Поручение создаётся только после утверждения директором.'
 ].join('\n');
 return'<label class="s360-muted" for="s360-draft-text">Проект для руководителя · автоматически не создаётся</label>'+
 '<textarea class="s360-copy" id="s360-draft-text">'+esc(content)+'</textarea>'+
 '<button type="button" class="s360-btn" data-s360-copy>Копировать черновик</button>';
}
function drillView(scope){
 const st=drillStates[scope];
 if(!st?.category){
  if(scope==='client')return'';
  return '<div class="s360-panel" id="s360-drill-global"><div class="s360-head-actions"><h3>Товарная детализация · Группа → Подгруппа → SKU</h3></div>'+
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
  const pct=num(x.previous_revenue)>0?
    (amount/num(x.previous_revenue)*100).toFixed(1).replace('.',',')+'%':
    num(x.current_revenue)>0?'Новый':'—';
  const columns='<span title="'+esc(money(x.current_revenue))+'"><small class="s360-drill-year">'+state.year+'</small>'+esc(whole(x.current_revenue))+'<small>'+esc(fmt(x.current_qty))+' шт.</small></span>'+
   '<span title="'+esc(money(x.previous_revenue))+'"><small class="s360-drill-year">'+(state.year-1)+'</small>'+esc(whole(x.previous_revenue))+'<small>'+esc(fmt(x.previous_qty))+' шт.</small></span>'+
   '<span class="s360-drill-change '+(amount<0?'s360-negative':'s360-positive')+'"><strong>'+esc(pct)+'</strong>'+
   '<small title="'+esc(money(amount))+'">'+esc((amount>0?'+':'')+whole(amount))+'</small></span>';
  return st.level==='subgroups'?
   '<button type="button" class="s360-drill-row" data-s360-drill-subgroup="'+esc(x.item_name)+'" data-s360-drill-scope="'+context+'">'+nameCell+columns+'</button>':
   '<div class="s360-drill-row">'+nameCell+columns+'</div>';
 }).join('');
 return '<div class="s360-drill" id="s360-drill-'+context+'">'+
 '<div class="s360-head-actions"><div><h3>'+esc(title)+'</h3><div class="s360-muted">'+esc(parent)+'</div></div>'+
 '<button type="button" class="s360-btn" data-s360-drill-close data-s360-drill-scope="'+context+'">'+(scope==='client'?'← К товарным группам':'Закрыть детализацию')+'</button></div>'+
 '<div class="s360-drill-nav">'+
 (st.level==='sku'?'<button type="button" class="s360-btn" data-s360-drill-back data-s360-drill-scope="'+context+'">← К подгруппам</button>':'')+
 '<span class="s360-badge">'+(st.level==='subgroups'?'Подгруппы':'Конкретные SKU')+'</span>'+
 '<span class="s360-badge">Закрытые месяцы · '+state.year+' / '+(state.year-1)+'</span></div>'+
 '<div class="s360-client-search"><input id="s360-drill-search-'+context+'" data-s360-drill-input="'+context+'" value="'+esc(st.search)+'" placeholder="'+(st.level==='sku'?'Название товара или SKU':'Поиск подгруппы')+'" aria-label="Поиск товаров">'+
 '<button type="button" class="s360-btn" data-s360-drill-find data-s360-drill-scope="'+context+'">Найти</button></div>'+
 (st.error?'<div class="s360-warn">'+esc(st.error)+'</div>':'')+
 (st.loading?'<div class="s360-loading" role="status">Загружаю детализацию из 1С…</div>':
 '<div class="s360-drill-rows"><div class="s360-drill-row s360-drill-header" style="background:var(--bg);font-weight:700"><span>Товар</span><span>'+state.year+'</span><span>'+(state.year-1)+'</span><span>К '+(state.year-1)+'</span></div>'+
 (rows||'<div class="s360-muted">По этому уровню подтверждённых продаж нет.</div>')+'</div>')+
 (total>0?'<div class="s360-drill-footer"><span class="s360-muted">Позиций: '+total+' · страница '+page+' из '+pages+'</span>'+
 '<div class="s360-tabs"><button type="button" class="s360-btn" data-s360-drill-page="-1" data-s360-drill-scope="'+context+'"'+(page===1?' disabled':'')+'>← Назад</button>'+
 '<button type="button" class="s360-btn" data-s360-drill-page="1" data-s360-drill-scope="'+context+'"'+(page>=pages?' disabled':'')+'>Далее →</button></div></div>':'')+
 '</div>';
}
function openDrill(scope,category,subgroup='',skuSearch=''){
 if(!['client','global'].includes(scope)||!String(category||'').trim())return;
 resetDrill(scope);
 const st=drillStates[scope];
 st.category=String(category).slice(0,200);
 if(scope==='global'&&$('s360-category'))$('s360-category').value=st.category;
 st.subgroup=String(subgroup||'').slice(0,250);
 st.level=subgroup?'sku':'subgroups';
 st.search=skuSearch?String(skuSearch).slice(0,100):'';
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
function clientProductsHtml(detail){
 const cats=arr(detail?.categories),yr=state.year,prev=yr-1;
 if(drillStates.client.category)return drillView('client');
 return '<h3 style="margin-top:16px">Товарные группы клиента · выберите группу</h3>'+
  '<div class="s360-tablewrap"><table><thead><tr><th>Группа</th><th>'+yr+', BYN</th><th>'+prev+', BYN</th><th>Рост / падение</th></tr></thead><tbody>'+
  cats.map(x=>{const delta=num(x.current_revenue)-num(x.previous_revenue);
   const pct=num(x.previous_revenue)>0?(delta/num(x.previous_revenue)*100).toFixed(1).replace('.',',')+'%':num(x.current_revenue)>0?'Новый':'—';
   return '<tr><td><button type="button" data-s360-drill-group="'+esc(x.category)+'" data-s360-drill-scope="client">'+esc(x.category)+' →</button></td>'+
    '<td>'+esc(whole(x.current_revenue))+'</td><td>'+esc(whole(x.previous_revenue))+'</td>'+
    '<td class="'+(delta<0?'s360-negative':'s360-positive')+'">'+esc((delta>0?'+':'')+whole(delta)+' · '+pct)+'</td></tr>';
  }).join('')+
  '</tbody></table></div>';
}
function clientAnnualProductsAvailable(detail,first,second){
 const year=state.year,closed=Number(state.data?.closed_month||0),p=selectedSalesPeriods(state.data);
 if(closed<1||closed>12||!first?.complete||!second?.complete)return false;
 const end=String(closed).padStart(2,'0'),cats=arr(detail?.categories);
 if(!cats.length||p.p1.from!==year+'-01'||p.p1.to!==year+'-'+end||
    p.p2.from!==(year-1)+'-01'||p.p2.to!==(year-1)+'-'+end)return false;
 return Math.abs(cats.reduce((s,x)=>s+num(x.current_revenue),0)-first.total)<=.02&&
  Math.abs(cats.reduce((s,x)=>s+num(x.previous_revenue),0)-second.total)<=.02;
}
function verifiedClientHistory(client,annual){
 if(!client?.client_id||!w.v22722HistoryReady?.())return null;
 let candidate=null,history=[];
 try{
  candidate=allClients.find(x=>String(x.id)===String(client.client_id));
  if(candidate&&typeof getClientHistFast==='function')history=arr(getClientHistFast(candidate));
 }catch(_){return null}
 if(!candidate)return null;
 const closed=Number(state.data?.closed_month||0),year=Number(annual.year);
 const sum=y=>history.reduce((total,row)=>{
  const month=String(row.month||'').slice(0,7);
  return Number(month.slice(0,4))===y&&Number(month.slice(5,7))<=closed?total+num(row.revenue):total;
 },0);
 if(Math.abs(sum(year)-num(client.current_revenue))>.02||Math.abs(sum(year-1)-num(client.previous_revenue))>.02)return null;
 return history;
}
function historyPeriod(history,from,to){
 return history.filter(row=>{const month=String(row.month||'').slice(0,7);return month>=from&&month<=to});
}
function selectedProductHtml(client,annual){
 const history=verifiedClientHistory(client,annual),chosen=selectedSalesPeriods(state.data);
 if(!history||![annual.year,annual.previous_year].includes(Number(chosen.p2.from.slice(0,4))))
  return '<div class="s360-warn">Товарная детализация выбранных периодов не подтверждена. Годовые данные доступны в прежнем отчёте.</div>';
 const groups=new Map(),add=(row,side)=>{
  const group=String(row.category||'Без группы').trim(),sub=String(row.subgroup||'Без подгруппы').trim(),sku=String(row.sku||'').trim(),product=String(row.product||'Без наименования').trim();
  const key=group+'\u0000'+sub+'\u0000'+(sku?'sku:'+sku:'product:'+product);
  if(!groups.has(key))groups.set(key,{group,sub,sku,product,one:0,two:0,qtyOne:0,qtyTwo:0});
  const item=groups.get(key);item[side]+=num(row.revenue);item[side==='one'?'qtyOne':'qtyTwo']+=num(row.qty);
 };
 historyPeriod(history,chosen.p1.from,chosen.p1.to).forEach(row=>add(row,'one'));
 historyPeriod(history,chosen.p2.from,chosen.p2.to).forEach(row=>add(row,'two'));
 const items=[...groups.values()],first=items.reduce((s,x)=>s+x.one,0),second=items.reduce((s,x)=>s+x.two,0);
 const months=annual.months||[],source={year:annual.year,previous_year:annual.previous_year,months};
 const p1=selectedMonths(source,chosen.p1.from,chosen.p1.to,'current');
 const side2=Number(chosen.p2.from.slice(0,4))===Number(annual.year)?'current':'previous';
 const p2=selectedMonths(source,chosen.p2.from,chosen.p2.to,side2);
 if(!p1?.complete||!p2?.complete||Math.abs(first-p1.total)>.02||Math.abs(second-p2.total)>.02)
  return '<div class="s360-warn">Сумма SKU не совпала с подтверждённым оборотом выбранных периодов. Детализация скрыта до сверки источника.</div>';
 const tree=new Map();for(const item of items){
  if(!tree.has(item.group))tree.set(item.group,new Map());
  const subs=tree.get(item.group);if(!subs.has(item.sub))subs.set(item.sub,[]);subs.get(item.sub).push(item);
 }
 const metric=(a,b)=>{
  const delta=a-b,pct=b>0?(delta/b*100).toFixed(1).replace('.',',')+'%':'—';
  return esc(money(a))+' / '+esc(money(b))+' · '+esc((delta>0?'+':'')+money(delta))+' · '+esc(pct);
 };
 const comparable=!!(p1.closed&&p2.closed&&p1.rows.length===p2.rows.length);
 const status=item=>!comparable?'Сравнение не завершено':item.two>0&&item.one<=0?'Перестал продаваться':item.two<=0&&item.one>0?'Новый':item.two>0&&item.one>0?'Продолжается':'Корректировка';
 const content=[...tree].map(([group,subs])=>{
  const all=[...subs.values()].flat(),a=all.reduce((s,x)=>s+x.one,0),b=all.reduce((s,x)=>s+x.two,0);
  return '<details class="s360-product-level"><summary><b>'+esc(group)+'</b><span>'+metric(a,b)+'</span></summary>'+
   [...subs].map(([sub,list])=>{
    const ca=list.reduce((s,x)=>s+x.one,0),cb=list.reduce((s,x)=>s+x.two,0);
    return '<details class="s360-product-level"><summary><b>'+esc(sub)+'</b><span>'+metric(ca,cb)+'</span></summary>'+
     list.sort((x,y)=>Math.abs(y.one-y.two)-Math.abs(x.one-x.two)).map(item=>
      '<div class="s360-product-item"><div><b>'+esc(item.product)+'</b><small>SKU: '+esc(item.sku||'не указан')+' · '+esc(status(item))+'</small></div>'+
      '<div><span>Период 1: '+esc(money(item.one))+' · '+esc(fmt(item.qtyOne))+' шт.</span><span>Период 2: '+esc(money(item.two))+' · '+esc(fmt(item.qtyTwo))+' шт.</span><strong>'+metric(item.one,item.two)+'</strong></div></div>'
     ).join('')+'</details>';
   }).join('')+'</details>';
 }).join('');
 return '<div class="s360-products"><h3>Группы → подгруппы → SKU · было / стало</h3>'+content+'</div>';
}
function clientDetailHtml(detail){
 if(!detail?.client)return'';
 const c=detail.client,rows=arr(detail.months),cats=arr(detail.categories),yr=state.year,prev=yr-1;
 const chosen=selectedSalesPeriods(state.data),clientSource={year:yr,previous_year:prev,months:rows};
 const first=selectedMonths(clientSource,chosen.p1.from,chosen.p1.to,'current');
 const secondSide=Number(chosen.p2.from.slice(0,4))===yr?'current':'previous';
 const second=selectedMonths(clientSource,chosen.p2.from,chosen.p2.to,secondSide);
 const secondSupported=Number(chosen.p2.from.slice(0,4))===(secondSide==='current'?yr:prev);
 const ready=!!(first?.complete&&second?.complete&&secondSupported&&first.closed&&second.closed&&first.rows.length===second.rows.length&&second.total>0);
 const delta=first&&secondSupported&&second?first.total-second.total:null;
 const tabs=[['overview','Обзор'],['months','По месяцам'],['products','Группы и SKU'],['tasks','Задачи']];
 const tabbar='<div class="s360-tabs s360-client-tabs" role="tablist" aria-label="Разделы клиента">'+tabs.map(([key,label])=>
  '<button type="button" role="tab" aria-selected="'+(state.clientTab===key)+'" class="s360-btn'+(state.clientTab===key?' active':'')+'" data-s360-client-tab="'+key+'">'+label+'</button>').join('')+'</div>';
 const pairs=(first?.rows||[]).map((row,i)=>({row,other:second?.rows?.[i]})).filter(x=>x.other);
 const focus=pairs.find(x=>x.row.month===state.clientFocusMonth)||pairs.at(-1);
 const amount2=secondSide==='previous'?'previous':'current';
 const limit=Math.max(1,...pairs.flatMap(x=>[Math.max(0,num(x.row.current)),Math.max(0,num(x.other[amount2]))]));
 const bars=pairs.map(({row,other})=>{
  const a=num(row.current),b=num(other[amount2]);
  const comparable=row.closed&&!row.partial&&other.closed&&!other.partial;
  const pct=comparable&&b>0?(a-b)/b*100:null;
  const mark=pct===null?(comparable&&b===0&&a>0?'Новый':'—'):(pct>0?'+':'')+pct.toFixed(1).replace('.',',')+'%';
  return '<button type="button" class="s360-client-month'+(row===focus?.row?' active':'')+'" data-s360-client-month="'+esc(row.month)+'" title="'+esc(monthLabel(row.month)+' / '+monthLabel(other.month)+': '+money(a)+' / '+money(b))+'"><b>'+esc(monthLabel(row.month).split(' ')[0])+(row.partial?'*':'')+'</b>'+
   '<span class="s360-client-tracks"><span class="s360-client-track"><i style="width:'+Math.min(100,Math.max(0,a)/limit*100)+'%"></i></span><span class="s360-client-track previous"><i style="width:'+Math.min(100,Math.max(0,b)/limit*100)+'%"></i></span></span>'+
   '<span class="s360-client-month-values"><span>'+esc(short(a))+'</span><span>'+esc(short(b))+'</span></span>'+
   '<strong class="s360-client-month-percent '+(pct<0?'s360-negative':pct>0?'s360-positive':'')+'">'+esc(mark)+'</strong></button>';
 }).join('');
 const focusValue=focus?(()=>{
  const a=num(focus.row.current),b=num(focus.other[amount2]),delta=a-b;
  const comparable=focus.row.closed&&!focus.row.partial&&focus.other.closed&&!focus.other.partial&&b>0;
  const pct=comparable?delta/b*100:null;
  return '<div class="s360-client-month-focus"><b>'+esc(monthLabel(focus.row.month))+' / '+esc(monthLabel(focus.other.month))+'</b><span>'+esc(money(a))+' / '+esc(money(b))+'</span><strong>'+
   esc(comparable?(delta>0?'Рост ':delta<0?'Падение ':'Без изменений '):'Разница ')+esc((delta>0?'+':'')+money(delta))+
   (pct===null?'':' · '+esc((pct>0?'+':'')+pct.toFixed(1).replace('.',',')+'%'))+'</strong></div>';
 })():'';
 const comparison='<div class="s360-focus"><b>Оборот клиента</b><div><small>Период 1</small><strong>'+esc(first?.complete?money(first.total):'—')+'</strong></div>'+
  '<div><small>Период 2</small><strong>'+esc(secondSupported&&second?.complete?money(second.total):'—')+'</strong></div>'+
  '<div><small>Разница</small><strong>'+esc(delta===null?'—':(delta>0?'+':'')+money(delta))+'</strong></div><div><small>'+esc(ready?(delta>0?'Рост':delta<0?'Падение':'Без изменений'):'Сравнение')+'</small><strong>'+esc(ready?(delta>0?'+':'')+(delta/second.total*100).toFixed(1).replace('.',',')+'%':'—')+'</strong></div></div>';
 const action=ready&&delta<0?'<div class="s360-client-action"><b>Лера · Рекомендации</b><span>Покупки сократились на '+esc(money(-delta))+'. Причина не подтверждена. Проверить потерянные SKU и обсудить следующий заказ. Ответственный: '+esc(c.manager_name||'не определён')+'.</span></div>':'';
 const overview=comparison+action+'<div class="s360-tabs" style="margin-top:10px"><button type="button" class="s360-btn" data-s360-client-tab="months">По месяцам</button><button type="button" class="s360-btn" data-s360-client-tab="products">Группы и SKU</button></div>';
 const monthly='<div class="s360-head-actions" style="margin-top:14px"><h3>История продаж клиента</h3><span class="s360-badge">Период 1 / Период 2</span></div><div class="s360-client-graph">'+(bars||'<span>Нет данных для выбранных периодов</span>')+'</div>'+focusValue;
 const annualProducts=clientAnnualProductsAvailable(detail,first,second);
 const products=(annualProducts?'<div id="s360-client-product-container" aria-live="polite">'+clientProductsHtml(detail)+'</div>':selectedProductHtml(c,clientSource))+
  '<details class="s360-annual-detail"><summary>Другие данные клиента</summary><div id="s360-client-recovery-container" aria-live="polite">'+clientRecoveryHtml()+'</div>'+
  (annualProducts?'':'<div id="s360-client-product-container" aria-live="polite">'+clientProductsHtml(detail)+'</div>')+'</details>';
 const tasks='<div class="s360-head-actions"><p>Задачи и история клиента открываются в действующей карточке CRM.</p>'+
  (c.client_id?'<button type="button" class="s360-btn primary" data-s360-client-card="'+esc(c.client_id)+'">Открыть карточку CRM</button>':'<span class="s360-muted">Точная карточка клиента не определена.</span>')+'</div>';
 return '<div class="s360-client-detail"><div class="s360-head-actions"><div><h3>'+esc(c.client_name)+'</h3>'+
  '<div class="s360-muted">Ответственный: '+esc(c.manager_name||'не определён')+'</div></div>'+
  '<div class="s360-tabs">'+(c.client_id?'<button type="button" class="s360-btn" data-s360-client-card="'+esc(c.client_id)+'">Карточка CRM</button>':'')+
  '<button type="button" class="s360-btn" data-s360-client-close>К списку клиентов</button></div></div>'+
  tabbar+
  '<div role="tabpanel">'+({overview,months:monthly,products,tasks}[state.clientTab]||overview)+'</div></div>';
}
function clientsPanel(d){
 const preview=arr(d.top_clients).slice(0,7);
 if(state.clientKey){
  const detail=state.clientData?.detail;
  return '<div class="s360-panel s360-client-full" id="s360-clients"><div id="s360-client-detail-anchor">'+
   (detail?clientDetailHtml(detail):state.clientLoading?'<div role="status">Загружаю клиента…</div>':
    '<div class="s360-warn">'+esc(state.clientError||'Не удалось открыть выбранного клиента')+'</div><button type="button" class="s360-btn" data-s360-client-close>К списку клиентов</button>')+
   '</div></div>';
 }
 if(!state.clientsOpen){
 return '<div class="s360-panel" id="s360-clients"><div class="s360-head-actions"><h3>Клиенты · Продажи с начала года</h3></div>'+
  (preview.length?preview.map(x=>'<div class="s360-row"><button type="button" data-s360-client-key="'+esc(x.client_key)+'"><b>'+esc(x.client_name||'—')+'</b>'+
  (x.is_unallocated?'<span class="s360-muted"> · без точной ТТ</span>':'')+'</button><b>'+esc(whole(x.revenue))+'</b>'+
  '<span>'+esc(x.manager_name||'—')+'</span><span>Детали</span></div>').join(''):'<div class="s360-muted">Подтверждённых продаж нет.</div>')+
  '<div class="s360-tabs" style="margin-top:12px"><button type="button" class="s360-btn primary" data-s360-all-clients>Все клиенты · Поиск и детализация</button></div></div>';
 }
 const result=state.clientData||{},rows=arr(result.items),total=num(result.total),pages=Math.max(1,Math.ceil(total/20)),page=Math.floor(state.clientOffset/20)+1;
 const list=rows.map(x=>{
  const history=verifiedClientHistory(x,d),periods=selectedSalesPeriods(d);
  const supported=!!history&&[d.year,d.previous_year].includes(Number(periods.p2.from.slice(0,4)));
  const current=supported?historyPeriod(history,periods.p1.from,periods.p1.to).reduce((s,r)=>s+num(r.revenue),0):num(x.current_revenue);
  const previous=supported?historyPeriod(history,periods.p2.from,periods.p2.to).reduce((s,r)=>s+num(r.revenue),0):num(x.previous_revenue);
  const delta=current-previous;
  const comparison=selectedComparison(d),valid=!!(comparison.one?.closed&&comparison.two?.closed&&comparison.one.rows.length===comparison.two.rows.length);
  const trend=!valid?'Без итогового %':previous>0?(delta/previous*100).toFixed(1).replace('.',',')+'%':current>0?'Новый клиент':'—';
  return '<button type="button" class="s360-client-item'+(state.clientKey===x.client_key?' active':'')+'" data-s360-client-key="'+esc(x.client_key)+'" aria-current="'+(state.clientKey===x.client_key?'true':'false')+'">'+
  '<span><b>'+esc(x.client_name||'—')+'</b><small class="s360-muted" style="display:block">'+esc(x.manager_name||'Менеджер не определён')+'</small></span>'+
  '<span class="s360-client-item-amount"><b class="'+(delta<0?'s360-negative':'s360-positive')+'">'+esc(supported?trend:'Годовой срез')+'</b>'+
  '<small>'+esc(short(current))+' / '+esc(short(previous))+' BYN</small></span></button>';
 }).join('');
 const search='<div class="s360-client-search">'+
 '<input id="s360-client-search" data-s360-client-search value="'+esc(state.clientSearch)+'" placeholder="Название клиента или менеджер" aria-label="Поиск клиентов">'+
 '<button type="button" class="s360-btn primary" data-s360-client-find>Найти</button></div>';
 const paginator=(total>0?'<div class="s360-head-actions" style="margin-top:12px"><span class="s360-muted">Найдено '+total+' · страница '+page+' из '+pages+'</span>'+
 '<div class="s360-tabs"><button type="button" class="s360-btn" data-s360-client-page="-1"'+(page===1?' disabled':'')+'>←</button>'+
 '<button type="button" class="s360-btn" data-s360-client-page="1"'+(page>=pages?' disabled':'')+'>→</button></div></div>':'');
 return '<div class="s360-panel" id="s360-clients"><div class="s360-head-actions"><h3>Клиенты</h3><span class="s360-badge">'+esc(selectedSalesPeriods(d).p1.from)+' — '+esc(selectedSalesPeriods(d).p1.to)+'</span></div>'+
 '<div class="s360-client-list-full" id="s360-client-left">'+search+
 (state.clientError?'<div class="s360-warn" role="alert">'+esc(state.clientError)+' <button type="button" class="s360-btn" data-s360-client-find>Повторить</button></div>':
 state.clientLoading?'<div class="s360-loading" role="status">Загружаю клиентов из 1С…</div>':
 '<div class="s360-client-list">'+(list||(state.clientData?'<div class="s360-muted">По запросу клиентов нет.</div>':''))+'</div>')+
 paginator+'</div></div>';
}
function render(){
 const root=mount();if(!root)return;
 if(state.legacy){
  root.innerHTML='<div class="s360-panel s360-head-actions"'+(state.fallbackReason?' role="alert"':'')+'><div><h2>Исходные отчёты продаж</h2>'+
   (state.fallbackReason?'<p class="s360-muted">Годовая аналитика сейчас не ответила. Показан действующий отчёт продаж.</p>':'')+'</div>'+
   '<button type="button" class="s360-btn primary" data-s360-legacy>Вернуться к продажам</button></div>';
  return;
 }
 if(!state.data){
  root.innerHTML=headerHtml(null)+filtersHtml(null)+
   (state.error?'<div class="s360-loading" role="alert">Годовая аналитика сейчас недоступна.<div style="margin-top:10px"><button type="button" class="s360-btn" data-s360-refresh>Повторить загрузку</button><button type="button" class="s360-btn" data-s360-legacy>Открыть исходный отчёт</button></div></div>':
   '<div role="status" class="s360-loading">Загружаю продажи… <button type="button" class="s360-btn" data-s360-legacy>Открыть прежний отчёт</button></div><div class="s360-load-kpis" aria-hidden="true">'+Array.from({length:5},()=>'<div></div>').join('')+'</div>');
  return;
 }
 const focus=focusedMonth(state.data);if(focus)state.selectedMonth=focus.month;
 const d=state.data;
 ensureSelectedSources(d);
 const chosen=selectedComparison(d),kpi=periodKpis(chosen);
 const comparison=chosen.pct===null?'—':(chosen.pct>0?'+':'')+chosen.pct.toFixed(1).replace('.',',')+'%';
 const colors=chosen.pct===null?'':chosen.pct<0?'s360-negative':'s360-positive';
 root.innerHTML=headerHtml(d)+filtersHtml(d)+
 '<div class="s360-kpis">'+
 kpiCard('Продажи',chosen.one?.complete?money(chosen.one.total):'—','Период 1')+
 kpiCard(chosen.pct===null?'Сравнение':chosen.pct>0?'Рост':chosen.pct<0?'Падение':'Без изменений',comparison,chosen.delta===null?'Нет сопоставимых периодов':(chosen.delta>0?'+':'')+money(chosen.delta),colors)+
 akbKpiCard(kpi)+
 planKpiCard(kpi)+'</div>'+
 selectedComparisonHtml(d)+
 selectedChartHtml(d)+
 (num(d.unallocated_client_revenue)>0?'<p class="s360-muted">Без точной ТТ: '+esc(money(d.unallocated_client_revenue))+' · включено в оборот с начала года.</p>':'')+
 clientsPanel(d)+
 '<details class="s360-advanced" data-s360-analysis'+(state.analysisOpen?' open':'')+'><summary>Разбор потерь и товарных групп</summary>'+
 brief(d)+matrix(d)+'<div id="s360-drill-global-container" aria-live="polite">'+drillView('global')+'</div></details>';
 if(state.clientsOpen&&$('s360-client-left'))$('s360-client-left').scrollTop=state.clientListScroll;
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
 const periodInput=e.target.closest?.('[data-s360-period]');
 if(periodInput){
  const value=String(periodInput.value||'');
  if(!/^\d{4}-\d{2}$/.test(value))return;
  const field={ 'p1-from':'period1Start','p1-to':'period1End','p2-from':'period2Start','p2-to':'period2End'}[periodInput.dataset.s360Period];
  if(!field)return;
  const pair=field.startsWith('period1')?'period1':'period2',other=field.endsWith('Start')?pair+'End':pair+'Start';
  if(state[other]&&state[other].slice(0,4)!==value.slice(0,4))state[other]=value.slice(0,4)+state[other].slice(4);
  state[field]=value;state.comparisonData=null;state.comparisonError='';
  if(field==='period1Start'||field==='period1End'){
   const year=Number(value.slice(0,4));
   if(year!==state.year&&year>=2023&&year<=currentYear()){
    const selectedClient=state.clientKey,wasOpen=state.clientsOpen;
    state.year=year;state.selectedMonth='';clearClientState();state.clientsOpen=wasOpen;state.clientKey=selectedClient;
    clearRecovery();resetDrill('global');invalidateDrillCache();load(false);return;
   }
  }
  render();return;
 }
 const t=e.target.closest?.('[data-s360-select]');if(!t)return;
 const v=t.value,k=t.dataset.s360Select;
 if(k==='year'){
  const y=Number(v);if(y>=2023&&y<=currentYear()){
   state.year=y;state.period1Start='';state.period1End='';state.period2Start='';state.period2End='';
   state.comparisonData=null;state.comparisonError='';
   state.selectedMonth='';state.category='all';state.expanded=false;state.draft=false;clearClientState();clearRecovery();resetDrill('global');invalidateDrillCache();load(false);
  }
 }
 if(k==='manager'){
  if(!boss())return;
  state.manager=v;state.comparisonData=null;state.comparisonError='';
  state.category='all';state.expanded=false;state.draft=false;clearClientState();clearRecovery();resetDrill('global');invalidateDrillCache();load(false);
 }
 if(k==='month'){
  const choices=state.data?monthRows(state.data).map(x=>x.month):[];
  if(choices.includes(v)){state.selectedMonth=v;render()}
 }
 if(k==='client-month'){
  const choices=arr(state.clientData?.detail?.months).filter(x=>x.has_current||x.has_previous).map(x=>x.month);
  if(choices.includes(v)){state.clientFocusMonth=v;render()}
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
 if(a.s360ClientMonth!==undefined){state.clientFocusMonth=a.s360ClientMonth;render();return;}
 if(a.s360ClientTab!==undefined){
  if(['overview','months','products','tasks'].includes(a.s360ClientTab)){state.clientTab=a.s360ClientTab;render()}
  return;
 }
 if(a.s360Refresh!==undefined){kpiMonths.clear();kpiPeriods.clear();state.comparisonData=null;state.comparisonError='';clearClientState();clearRecovery();recoveryCache.clear();resetDrill('global');invalidateDrillCache();load(true);return}
 if(a.s360ChartExpand!==undefined){state.chartExpanded=!state.chartExpanded;render();return}
 if(a.s360Step!==undefined){
  const months=monthRows(state.data).map(x=>x.month),i=months.indexOf(focusedMonth(state.data)?.month);
  const next=i+Number(a.s360Step);
  if(next>=0&&next<months.length){state.selectedMonth=months[next];render()}
  return;
 }
 if(a.s360Mgr!==undefined&&boss()){state.manager=a.s360Mgr;state.category='all';state.draft=false;clearClientState();clearRecovery();resetDrill('global');invalidateDrillCache();load(false);return}
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
 if(a.s360RecPeriod!==undefined){
  const p=String(a.s360RecPeriod);
  if(!['last3','quarter','ytd'].includes(p)||p===state.recoveryPeriod)return;
  state.recoveryPeriod=p;state.recoveryExpanded=false;clearRecovery();
  void fetchRecovery();
  if(state.clientKey&&state.clientData?.detail)void fetchRecovery(state.clientKey);
  return;
 }
 if(a.s360RecTab!==undefined){
  if(!['subgroups','skus','clients','growth'].includes(a.s360RecTab))return;
  state.recoveryTab=a.s360RecTab;state.recoveryExpanded=false;render();return;
 }
 if(a.s360RecMore!==undefined){state.recoveryExpanded=!state.recoveryExpanded;render();return;}
 if(a.s360RecRetry!==undefined){clearRecovery();void fetchRecovery();return;}
 if(a.s360RecClient!==undefined){
  const key=String(a.s360RecClient||'').slice(0,300);
  if(!key)return;
  state.clientsOpen=true;state.clientSearch='';state.clientOffset=0;state.clientListScroll=0;
  clearClientRecovery();resetDrill('client');state.clientKey=key;state.focusClientOnLoad=true;
  loadClients();return;
 }
 if(a.s360RecClientGroup!==undefined){
  state.clientRecoveryFilter=String(a.s360RecClientSubgroup||'').slice(0,250);
  paintClientRecovery();return;
 }
 if(a.s360RecClientBack!==undefined){state.clientRecoveryFilter='';paintClientRecovery();return;}
 if(a.s360RecClientFull!==undefined){
  const x=arr(state.clientRecoveryData?.subgroups).find(y=>y.subgroup===state.clientRecoveryFilter);
  if(x&&state.clientKey)openDrill('client',x.category,x.subgroup);
  return;
 }
 if(a.s360RecGroup!==undefined){
  const category=String(a.s360RecGroup||'').slice(0,200);
  const subgroup=String(a.s360RecSubgroup||'').slice(0,250);
  if(!category)return;
  void loadRecoveryFocus(category,subgroup);
  $('s360-rec-focus-container')?.scrollIntoView?.({behavior:'smooth',block:'nearest'});
  return;
 }
 if(a.s360RecFocusClose!==undefined){
  recoveryFocusVersion++;state.recoveryFocusCat='';state.recoveryFocusSub='';
  state.recoveryFocusData=null;state.recoveryFocusLoading=false;state.recoveryFocusError='';
  paintRecoveryFocus();return;
 }
 if(a.s360RecOpenFull!==undefined){
  openDrill('global',state.recoveryFocusCat,state.recoveryFocusSub);
  $('s360-drill-global-container')?.scrollIntoView?.({behavior:'smooth',block:'nearest'});
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
  state.clientListScroll=$('s360-client-left')?.scrollTop||0;
  state.clientsOpen=true;clearClientRecovery();resetDrill('client');
  if(state.clientKey!==a.s360ClientKey){state.clientFocusMonth='';state.clientTab='overview'}
  state.clientKey=String(a.s360ClientKey).slice(0,300);state.clientOffset=0;
  state.focusClientOnLoad=true;loadClients();return;
 }
 if(a.s360ClientFind!==undefined){
  state.clientsOpen=true;state.clientSearch=String($('s360-client-search')?.value??state.clientSearch).slice(0,120);
  state.clientOffset=0;state.clientKey='';state.clientFocusMonth='';clearClientRecovery();resetDrill('client');loadClients();return;
 }
 if(a.s360ClientPage!==undefined){
  const count=num(state.clientData?.total);
  const next=state.clientOffset+Number(a.s360ClientPage)*20;
  if(next>=0&&next<count){state.clientOffset=next;state.clientKey='';state.clientFocusMonth='';clearClientRecovery();resetDrill('client');loadClients()}
  return;
 }
 if(a.s360ClientClose!==undefined){state.clientKey='';state.clientFocusMonth='';clearClientRecovery();resetDrill('client');loadClients();return;}
 if(a.s360Legacy!==undefined){
  if(state.legacy){state.legacy=false;state.fallbackReason='';mount();if(state.data)render();else load(true)}
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
 // The six-entry Sales menu is a navigation screen, not a hidden annual query.
 if($(PAGE)?.classList?.contains?.('crm290-sales-entry-open')||(state.legacy&&!force))return;
 const root=mount();if(!root||active()!=='sales')return;
 if(boss()&&!state.manager)state.manager='all';
 const key=[viewer(),state.year,boss()?state.manager:managerMe()].join('|');
 if(!force&&annualLoadingKey===key)return;
 if(salesScope!==key){salesScope=key;comparisonKey='';state.comparisonData=null;}
 const serial=++requestVersion;
 const hit=cache.get(key);
 if(!force&&hit&&Date.now()-hit.at<TTL){state.data=hit.data;state.error='';state.fallbackReason='';state.loading=false;render();if(state.clientsOpen&&!state.clientData)loadClients();return}
 annualLoadingKey=key;state.data=null;state.error='';state.loading=true;render();
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
  state.data=result;state.error='';state.fallbackReason='';cache.set(key,{at:Date.now(),data:result});
  while(cache.size>16)cache.delete(cache.keys().next().value);
 }catch(err){
  if(serial===requestVersion){state.error=String(err?.message||err);state.data=null;
   console.warn('Sales360 annual read-only request',err)}
 }finally{if(serial===requestVersion){annualLoadingKey='';state.loading=false;render();if(state.clientsOpen&&state.data&&!state.clientData)loadClients()}}
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
  if(serial===clientVersion){state.clientError=state.clientKey?'Не удалось открыть клиента.':'Не удалось загрузить список клиентов.';state.clientData=null;console.warn('Sales360 client scoped RPC',err)}
 }finally{if(serial===clientVersion){state.clientLoading=false;render();if(state.clientData?.detail){loadClientRecovery();focusSelectedClient();}else if(state.clientData)loadRecovery();}}
}
function recoveryArgs(clientKey=null){
 return {
  p_year:state.year,
  p_manager:boss()&&state.manager!=='all'?state.manager:null,
  p_period:state.recoveryPeriod,
  p_client_key:clientKey||null,p_category:null,p_subgroup:null
 };
}
function recoveryKey(clientKey=null){
 return JSON.stringify([viewer(),state.year,boss()?state.manager:managerMe(),state.recoveryPeriod,clientKey||'']);
}
async function fetchRecovery(clientKey=null){
 const isClient=Boolean(clientKey),serial=isClient?++clientRecoveryVersion:++recoveryVersion;
 if(isClient){
  state.clientRecoveryLoading=true;state.clientRecoveryError='';state.clientRecoveryData=null;
 }else{
  state.recoveryLoading=true;state.recoveryError='';state.recoveryData=null;
 }
 render();
 const key=recoveryKey(clientKey),hit=recoveryCache.get(key);
 try{
  let result;
  if(hit&&Date.now()-hit.at<RECOVERY_TTL)result=hit.data;
  else{
   const database=dbx();if(!database?.rpc)throw Error('Источник Supabase недоступен');
   let work=recoveryPending.get(key);
   if(!work){
    work=Promise.resolve().then(()=>database.rpc('crm_sales360_recovery_v4',recoveryArgs(clientKey)))
     .then(({data,error})=>{if(error)throw error;return data});
    recoveryPending.set(key,work);
    work.finally(()=>{if(recoveryPending.get(key)===work)recoveryPending.delete(key)}).catch(()=>{});
   }
   result=await work;
   if(result?.version==='sales360.recovery.4'){
    recoveryCache.set(key,{at:Date.now(),data:result});
    while(recoveryCache.size>24)recoveryCache.delete(recoveryCache.keys().next().value);
   }
  }
  if(active()!=='sales')return;
  if(isClient?(serial!==clientRecoveryVersion||clientKey!==state.clientKey):serial!==recoveryVersion)return;
  if(result?.version!=='sales360.recovery.4'||!Array.isArray(result.subgroups)||!Array.isArray(result.clients))
   throw Error('Неполный ответ аналитики продаж 1С');
  if(isClient)state.clientRecoveryData=result;else state.recoveryData=result;
 }catch(err){
  if(isClient?(serial===clientRecoveryVersion&&clientKey===state.clientKey):serial===recoveryVersion){
   if(isClient)state.clientRecoveryError=String(err?.message||err);
   else state.recoveryError=String(err?.message||err);
   console.warn('Sales360 recovery read-only source',err);
  }
 }finally{
  if(isClient?(serial===clientRecoveryVersion&&clientKey===state.clientKey):serial===recoveryVersion){
   if(isClient)state.clientRecoveryLoading=false;else state.recoveryLoading=false;
   render();
  }
 }
}
function loadRecovery(){
 if(!state.data||active()!=='sales')return;
 if(state.recoveryData?.version==='sales360.recovery.4')return;
 if(state.recoveryLoading)return;
 void fetchRecovery();
}
function loadClientRecovery(){
 if(!state.clientKey||!state.clientData?.detail||active()!=='sales')return;
 if(state.clientRecoveryData?.client_key===state.clientKey)return;
 if(state.clientRecoveryLoading)return;
 void fetchRecovery(state.clientKey);
}
function focusSelectedClient(){
 if(!state.focusClientOnLoad)return;
 state.focusClientOnLoad=false;
 if(typeof w.requestAnimationFrame==='function')w.requestAnimationFrame(()=>{
  const el=$('s360-client-detail-anchor')||$('s360-clients');
  el?.scrollIntoView?.({behavior:'smooth',block: w.innerWidth<950?'start':'nearest'});
 });
}
function install(){
 if(wrapped)return;
 const original=w.renderSales;
 if(typeof original!=='function')return;
 sourceRender=original;
 w.renderSales=function(){
  if(active()!=='sales'||state.legacy)return sourceRender.apply(this,arguments);
  return load(false);
 };
 try{renderSales=w.renderSales}catch(_){}
 const app=$('app');
 if(app&&w.MutationObserver)new w.MutationObserver(()=>{
  if(active()==='sales'&&!mounted)load(false);
 }).observe(app,{attributes:true,attributeFilter:['data-active-page']});
 wrapped=true;
 if(active()==='sales')load(false);
}
w.RESANTA_SALES360_V1=Object.freeze({version:'20261123.sales.3',readOnly:true,show:()=>load(false),annualRpc:'crm_sales360_annual_v2',clientsRpc:'crm_sales360_clients_v2',productRpc:'crm_sales360_product_drill_v3',ytd,chartData,categoryMatrix,managerGaps,monthKpi,periodComparison,directorSignals});
if(d.readyState==='loading')d.addEventListener('DOMContentLoaded',install,{once:true});
else install();
})(window,document);
