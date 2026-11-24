/* RESANTA CRM KPI360 visual v2: director overview / manager personal view.
 * Read-only dashboard; existing plan editor is reused; scoped server RPC is mandatory.
 * No eager AI loading, no writes, no copies of customer records in localStorage. */
(function(w){
'use strict';
if(w.RESANTA_KPI360_VISUAL_V2)return;
const ID='kpi360-visual-v2', months=['','Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
let generation=0,flight=null,shown=null,shownKey='',comparison=null,profileKey='';
const comparisonMonths=new Map();
let selectedManager='',clientFilter='bonus',historyMetric='sales';
const n=x=>Number.isFinite(Number(x))?Number(x):0;
const money=x=>n(x).toLocaleString('ru-RU',{maximumFractionDigits:0});
const amount=new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2});
const byn=x=>amount.format(n(x))+' BYN';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=x=>String(x||'').trim().toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ');
const percent=(x,y)=>n(y)>0?Math.round(n(x)/n(y)*100):null;
const pc=(x,y)=>percent(x,y)==null?'—':percent(x,y)+'%';
const month=()=>String(document.getElementById('manager-kpi-month')?.value||'').slice(0,7);
const compareInput=()=>document.getElementById('manager-kpi-compare');
const baseInput=()=>document.getElementById('manager-kpi-base');
function dateRange(value){
 const [from,to=from]=String(value||'').split('|');
 return validMonth(from)&&validMonth(to)&&from<=to?{from,to}:null;
}
const rangeValue=range=>range?range.from+'|'+range.to:'';
const rangeLabel=range=>range.from===range.to?nameMonth(range.from):nameMonth(range.from)+' — '+nameMonth(range.to);
const currentRange=()=>dateRange(baseInput()?.value)||dateRange(month());
const comparisonRange=()=>dateRange(compareInput()?.value);
const validMonth=value=>/^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const active=()=>document.getElementById('page-managers')?.classList.contains('active');
const role=()=>w.currentProfile?.role, isBoss=()=>role()==='boss';
const actorKey=()=>{const p=w.currentProfile;return JSON.stringify([w.currentUser?.id,p?.id,p?.email,p?.role,p?.region,p?.access_scope,p?.name]);};
const requestKey=()=>actorKey()+'|'+month();
const nameMonth=v=>months[Number(String(v).slice(5,7))]+' '+String(v).slice(0,4);
const dbc=()=>{try{return typeof db!=='undefined'?db:w.db}catch(_){return w.db||null}};
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
function help(id,label,content){
 const tipId='kv-help-'+id;
 return '<span class="kv-help"><button type="button" class="kv-star" aria-label="'+esc(label)+'" aria-describedby="'+tipId+'">✱</button>'+
 '<span class="kv-tooltip" id="'+tipId+'" role="tooltip">'+esc(content)+'</span></span>';
}
function positionHelp(item){
 const tip=item.querySelector('.kv-tooltip');
 tip.style.removeProperty('--kv-shift');
 const rect=tip.getBoundingClientRect();
 const right=document.documentElement.clientWidth-12;
 const shift=rect.left<12?12-rect.left:Math.min(0,right-rect.right);
 if(shift)tip.style.setProperty('--kv-shift',shift+'px');
}
function bindHelp(page){
 page.addEventListener('pointerover',event=>{
  const item=event.target.closest('.kv-help');
  if(item&&!item.contains(event.relatedTarget))positionHelp(item);
 });
 page.addEventListener('click',event=>{
  const button=event.target.closest('.kv-star');
  const open=button?.parentElement;
  page.querySelectorAll('.kv-help[data-open]').forEach(other=>{
   if(other!==open)delete other.dataset.open;
  });
  if(!open)return;
  if(open.hasAttribute('data-open')){
   delete open.dataset.open;
   open.dataset.dismissed='';
  }else{
   delete open.dataset.dismissed;
   open.dataset.open='';
   positionHelp(open);
  }
 });
 page.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  page.querySelectorAll('.kv-help:is([data-open],:hover,:focus-within)').forEach(item=>{
   delete item.dataset.open;
   item.dataset.dismissed='';
  });
 });
 page.addEventListener('focusin',event=>{
  const item=event.target.closest('.kv-help');
  if(item){
   delete item.dataset.dismissed;
   positionHelp(item);
  }
 });
 page.addEventListener('pointerout',event=>{
  const item=event.target.closest('.kv-help');
  if(item&&!item.contains(event.relatedTarget))delete item.dataset.dismissed;
 });
}
function comparisonTone(current,previous){
 if(!Number.isFinite(Number(previous))||!n(previous)||n(current)===n(previous))return 'kv-note';
 return n(current)<n(previous)?'kv-red':'kv-green';
}
function bindMonthPicker(page,input){
 const dialog=page.querySelector('[data-kv-month-dialog]');
 if(typeof dialog?.showModal!=='function')return;
 const fullMonth=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric',timeZone:'UTC'});
 const fullName=value=>fullMonth.format(new Date(value+'-01T12:00:00Z'));
 let target=input,draft,firstYear=0,anchor='';
 function paint(){
  const rangeMode=target!==input;
  dialog.querySelector('[data-kv-month-preview]').textContent=rangeMode?rangeLabel(draft):fullName(draft.from);
  const note=dialog.querySelector('[data-kv-range-note]');
  note.hidden=!rangeMode;
  note.textContent=anchor?'Выберите последний месяц или подтвердите один месяц.':'Нажмите на первый и последний месяцы диапазона.';
  dialog.querySelector('[data-kv-years]').innerHTML=[firstYear,firstYear+1].map(year=>
   '<section><h4>'+year+'</h4><div class="kv-months">'+months.slice(1).map((name,index)=>{
    const value=year+'-'+String(index+1).padStart(2,'0'),edge=value===draft.from||value===draft.to;
    return '<button type="button" data-kv-month="'+value+'" aria-label="'+esc(fullName(value))+'" aria-pressed="'+
     (value>=draft.from&&value<=draft.to)+'"'+(edge?' class="kv-month-edge"':'')+'>'+name+'</button>';
   }).join('')+'</div></section>').join('');
  dialog.querySelector('[data-kv-year="-1"]').disabled=firstYear===1000;
  dialog.querySelector('[data-kv-year="1"]').disabled=firstYear===9998;
 }
 const configs=[
  [input,'main','Месяц KPI','Выберите месяц KPI'],
  [compareInput(),'compare','Сравнить с','Выберите период сравнения'],
  [baseInput(),'base','Основной период','Выберите основной период']
 ];
 for(const [field,selector,caption,label] of configs){
  const trigger=page.querySelector('[data-kv-month-open="'+selector+'"]');
  if(!field||!trigger)continue;
  const text=trigger.querySelector('span');
  const sync=()=>{
   const range=dateRange(field.value);
   text.textContent=field===input?(range?fullName(range.from):caption):
    (range?caption+' · '+rangeLabel(range):caption);
   trigger.setAttribute('aria-label',text.textContent);
   trigger.hidden=selector==='base'&&!comparisonRange();
  };
  field.addEventListener('change',sync);
  if(selector==='base')compareInput()?.addEventListener('change',sync);
  trigger.addEventListener('click',()=>{
   target=field;
   anchor='';
   draft=dateRange(field.value)||dateRange(month()||new Date().toISOString().slice(0,7));
   const start=Number(draft.from.slice(0,4)),end=Number(draft.to.slice(0,4));
   firstYear=Math.min(9998,Math.max(1000,start<end?start:start-1));
   dialog.querySelector('h3').textContent=label;
   paint();
   dialog.showModal();
   dialog.querySelector('.kv-month-edge')?.focus();
  });
  sync();
  field.hidden=true;
 }
 dialog.addEventListener('click',event=>{
  const selected=event.target.closest('[data-kv-month]');
  const step=event.target.closest('[data-kv-year]');
  if(selected){
   const value=selected.dataset.kvMonth;
   draft=anchor?{from:anchor<value?anchor:value,to:anchor>value?anchor:value}:{from:value,to:value};
   anchor=target!==input&&!anchor?value:'';
   paint();
   dialog.querySelector('[data-kv-month="'+value+'"]')?.focus();
  }else if(step){
   firstYear+=Number(step.dataset.kvYear);
   paint();
  }else if(event.target.closest('[data-kv-confirm]')){
   dialog.close();
   const value=target===input?draft.from:rangeValue(draft);
   if(target.value===value)return;
   target.value=value;
   target.dispatchEvent(new Event('change',{bubbles:true}));
  }
 });
}
function root(){
 const page=document.getElementById('page-managers');if(!page)return null;
 const olderCard=document.getElementById('managers-table')?.closest('.card');if(olderCard)olderCard.style.display='none';
 const olderDashboard=document.getElementById('manager-kpi360-v1');if(olderDashboard)olderDashboard.style.display='none';
 let el=document.getElementById(ID);
 if(!el){el=document.createElement('section');el.id=ID;const legacy=document.getElementById('manager-kpi360-v1');if(legacy)legacy.insertAdjacentElement('beforebegin',el);else page.appendChild(el);}
 page.querySelector('.page-title')?.replaceChildren(document.createTextNode(isBoss()?'Менеджеры · KPI':'Мои KPI'));
 if(active()&&role()==='manager'&&w.crmAI360StaffIdentityV1?.()?.tier==='field_manager'){
  const title=document.getElementById('topbar-title');if(title)title.textContent='Мои KPI';
 }
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
 '#page-managers .kv-page-head{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:16px}',
 '#page-managers .kv-page-head .page-title{font-size:25px;line-height:1.2;font-weight:700;letter-spacing:-.6px;margin:0}',
 '#page-managers .kv-page-controls,#page-managers .kv-heading{display:flex;align-items:center;gap:8px;min-width:0}',
 '#page-managers .kv-page-controls{flex-wrap:wrap}',
 '#page-managers .kv-page-controls input,#page-managers .kv-page-controls button{min-height:38px;border-radius:8px}',
 '#page-managers .kv-page-controls input{width:auto;max-width:100%;background:var(--card,#fff);color:var(--text,#172033)}',
 '#page-managers .kv-page-controls .btn-primary{background:var(--a,#185fa5);border-color:var(--a,#185fa5);font-weight:600}',
 '#page-managers .kv-lera-status{margin:-7px 0 10px;color:var(--sub);font-size:13px}',
 '#page-managers .kv-page-controls [data-kv-lera]{min-height:38px;padding:8px 12px;background:var(--ab);color:var(--a);border:1px solid var(--border);font:inherit;font-weight:650;cursor:pointer}',
 '#kpi360-visual-v2 .kv-compare{margin:14px 0 0}',
 '#kpi360-visual-v2 :is([data-kv-monthly],[data-kv-period-rankings],[data-kv-comparison])[hidden]{display:none!important}',
 '#kpi360-visual-v2 .kv-work-table.kv-compare-table :is(td,th):first-child{width:31%;text-align:left;overflow-wrap:normal}',
 '#kpi360-visual-v2 .kv-work-table.kv-compare-table th:nth-child(2){width:auto}',
 '#kpi360-visual-v2 .kv-compare-table td{overflow-wrap:anywhere}',
 '#kpi360-visual-v2 .kv-period-value{display:grid;gap:3px;text-align:right;line-height:1.3}',
 '#kpi360-visual-v2 .kv-period-value small{font-size:11px;font-weight:500;color:var(--sub)}',
 '#kpi360-visual-v2 .kv-period-rank{display:grid;justify-items:center;gap:3px}',
 '#kpi360-visual-v2 .kv-period-rank small{font-size:11px;color:var(--sub)}',
 '#kpi360-visual-v2 .kv-period-note{margin:0 0 10px}',
 '#page-managers .kv-page-controls [hidden]{display:none!important}',
 '#page-managers button[data-kv-month-open]{min-width:155px;padding:8px 14px;text-align:left;text-transform:capitalize}',
 '#page-managers :is(button[data-kv-month-open],.kv-month-dialog button){background:var(--card);color:var(--text);border:1px solid var(--border);border-radius:8px;font:inherit;min-height:38px;cursor:pointer}',
 '#page-managers :is(button[data-kv-month-open],.kv-month-dialog button):focus-visible{outline:2px solid var(--a);outline-offset:2px}',
 '#page-managers .kv-month-dialog{margin:auto;width:min(560px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;padding:18px;border:1px solid var(--border);border-radius:12px;background:var(--card);color:var(--text)}',
 '#page-managers .kv-month-dialog::backdrop{background:#11182766}',
 '#page-managers .kv-month-dialog h3{margin:0;font-size:18px}',
 '#page-managers .kv-month-preview{margin:8px 0 4px;color:var(--a);font-weight:650;text-transform:capitalize}',
 '#page-managers .kv-range-note{margin:0 0 12px;color:var(--sub);font-size:13px}',
 '#page-managers .kv-calendar-nav,#page-managers .kv-calendar-footer{display:flex;justify-content:space-between;gap:8px}',
 '#page-managers .kv-calendar-nav button{width:38px;font-size:20px}',
 '#page-managers .kv-calendar-nav button:disabled{opacity:.45;cursor:default}',
 '#page-managers .kv-calendar-footer{justify-content:flex-end;margin-top:14px}',
 '#page-managers .kv-calendar-footer button{padding:7px 12px}',
 '#page-managers .kv-years{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:8px}',
 '#page-managers .kv-years h4{margin:4px 0 8px;text-align:center;font-size:15px}',
 '#page-managers .kv-months{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}',
 '#page-managers .kv-months button{padding:5px 1px}',
 '#page-managers .kv-month-dialog button[aria-pressed="true"]:not(.kv-month-edge){background:var(--ab);border-color:var(--a);color:var(--at,#0c447c);font-weight:650}',
 '#page-managers .kv-month-dialog button:is(.kv-month-edge,[data-kv-confirm]){background:var(--a);border-color:var(--a);color:#fff;font-weight:650}',
 '#page-managers .kv-help{position:relative;display:inline-flex;flex:none;vertical-align:middle}',
 '#page-managers .kv-help .kv-star{display:grid;place-items:center;min-width:28px;min-height:28px;padding:2px 6px;border:1px solid var(--border,#d9e0e8);border-radius:8px;background:var(--card,#fff);color:var(--a,#185fa5);font-family:inherit;font-size:15px;font-weight:600;line-height:1;cursor:pointer}',
 '#page-managers .kv-help .kv-star:hover{background:var(--ab,#e6f1fc)}',
 '#page-managers .kv-star:focus-visible,#kpi360-visual-v2 button:focus-visible{outline:2px solid var(--a,#185fa5);outline-offset:2px}',
 '#page-managers .kv-tooltip{visibility:hidden;opacity:0;position:absolute;z-index:8;top:100%;left:0;transform:translateX(var(--kv-shift,0px));width:max-content;max-width:min(290px,calc(100vw - 48px));padding:10px 12px;border:1px solid var(--border,#d9e0e8);border-radius:8px;background:var(--card,#fff);color:var(--text,#172033);box-shadow:0 4px 14px #17212f1a;font-size:12px;font-weight:400;line-height:1.5;overflow-wrap:anywhere}',
 '#page-managers .kv-help:not([data-dismissed]):is(:hover,:focus-within,[data-open])>.kv-tooltip{visibility:visible;opacity:1}',
 '#kpi360-visual-v2 .kv-stat-head .kv-tooltip,#kpi360-visual-v2 .kv-charts>.kv-card:nth-child(2) .kv-tooltip{left:auto;right:0}',
 '#kpi360-visual-v2 .kv-heading h3{margin:0}',
 '#kpi360-visual-v2 .kv-card>.kv-heading{margin-bottom:12px}',
 '#kpi360-visual-v2 .kv-stat-head{justify-content:space-between}',
 '#kpi360-visual-v2 .kv-chart-head{justify-content:space-between}',
 '#kpi360-visual-v2 .kv-subhead{font-size:16px;font-weight:650}',
 '#kpi360-visual-v2{font-size:14px;color:var(--text,#172033);min-width:0}',
 '#kpi360-visual-v2 .kv-top{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:3px 0 12px}',
 '#kpi360-visual-v2 .kv-note{font-size:14px;color:var(--sub,#667085);line-height:1.5}',
 '#kpi360-visual-v2 .kv-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}',
 '#kpi360-visual-v2 .kv-grid.kv-plan-grid{grid-template-columns:repeat(4,minmax(0,1fr))}',
 '#kpi360-visual-v2 .kv-card{border:1px solid var(--border,#e1e6ee);background:var(--card,#fff);border-radius:12px;padding:16px 14px;min-width:0}',
 '#kpi360-visual-v2 .kv-metric{font-size:25px;font-weight:650;letter-spacing:-.5px;margin:7px 0 4px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}',
 '#kpi360-visual-v2 .kv-label{font-size:14px;font-weight:600;color:var(--sub,#667085)}',
 '#kpi360-visual-v2 .kv-green{color:var(--g,#27500a)}#kpi360-visual-v2 .kv-red{color:var(--r,#a32d2d)}#kpi360-visual-v2 .kv-blue{color:var(--a,#185fa5)}',
 '#kpi360-visual-v2 .kv-track{height:8px;background:var(--bg,#e8edf4);border-radius:6px;overflow:hidden;margin:9px 0 10px}',
 '#kpi360-visual-v2 .kv-track>i{height:100%;display:block;background:var(--a,#185fa5);border-radius:5px}',
 '#kpi360-visual-v2 .kv-charts{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:14px;margin-top:14px}',
 '#kpi360-visual-v2 h3{font-size:16px;font-weight:650;margin:0 0 12px}',
 '#kpi360-visual-v2 .kv-bar{display:grid;grid-template-columns:85px minmax(0,1fr) 78px;gap:8px;align-items:center;padding:9px 0;border-radius:7px;cursor:pointer}',
 '#kpi360-visual-v2 .kv-bar-static{cursor:default}',
 '#kpi360-visual-v2 .kv-bar[role=button]:hover,#kpi360-visual-v2 .kv-bar[role=button]:focus{background:#edf4ff;outline:2px solid #bedbff;outline-offset:1px}',
 '#kpi360-visual-v2 .kv-bg{height:16px;border-radius:5px;background:#e8edf4;position:relative;overflow:hidden}',
 '#kpi360-visual-v2 .kv-bg>i{position:absolute;height:100%;left:0;top:0;background:var(--a,#185fa5);border-radius:5px}',
 '#kpi360-visual-v2 .kv-score{display:grid;align-content:start;gap:7px;padding:16px 14px}',
 '#kpi360-visual-v2 .kv-score .kv-metric{font-size:clamp(22px,2vw,30px);line-height:1.15;margin:0}',
 '#kpi360-visual-v2 .kv-sales-score{border-color:#b7cbe7}',
 '#kpi360-visual-v2 .kv-sales-score .kv-metric{font-size:clamp(34px,4vw,48px);letter-spacing:-.045em;color:var(--a,#185fa5)}',
 '#kpi360-visual-v2 .kv-sales-score .kv-metric.kv-no-plan{font-size:24px;letter-spacing:-.02em}',
 '#kpi360-visual-v2 .kv-fact{font-size:15px;color:var(--text);font-weight:650;font-variant-numeric:tabular-nums}',
 '#kpi360-visual-v2 .kv-score .kv-track{margin:3px 0}',
 '#kpi360-visual-v2 .kv-score .kv-foot{font-weight:600;font-size:13px}',
 '#kpi360-visual-v2 .kv-work{display:grid;gap:14px;margin-top:14px}',
 '#kpi360-visual-v2 .kv-work .kv-card{padding:18px}',
 '#kpi360-visual-v2 .kv-work-table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;table-layout:fixed}',
 '#kpi360-visual-v2 .kv-work-table th{color:var(--sub);font-weight:500;font-size:13px;text-align:left;padding:9px 8px}',
 '#kpi360-visual-v2 .kv-work-table td{border-top:1px solid var(--border);padding:11px 8px;font-weight:650}',
 '#kpi360-visual-v2 .kv-work-table :is(td,th).kv-number{text-align:right}',
 '#kpi360-visual-v2 .kv-work-table :is(td,th):first-child{width:64px;text-align:center}',
 '#kpi360-visual-v2 .kv-work-table th:nth-child(2){width:32%}',
 '#kpi360-visual-v2 .kv-work-table.kv-work-table-personal :is(th,td):first-child{width:34%;text-align:left}',
 '#kpi360-visual-v2 .kv-row-value{display:flex;justify-content:flex-end;align-items:center;gap:7px}',
 '#kpi360-visual-v2 .kv-row-value .kv-tooltip{left:auto;right:0}',
 '#kpi360-visual-v2 .kv-place{display:inline-flex;align-items:center;gap:2px;color:var(--sub)}',
 '#kpi360-visual-v2 .kv-place strong{color:var(--text);font-weight:600}',
 '@media(max-width:620px){#kpi360-visual-v2 .kv-work .kv-card{padding:12px}#kpi360-visual-v2 .kv-work-table :is(td,th){padding:8px 2px;font-size:12px;overflow-wrap:anywhere}#kpi360-visual-v2 .kv-work-table th:nth-child(2){width:24%}#kpi360-visual-v2 .kv-work-table :is(td,th):first-child{width:35px}#kpi360-visual-v2 .kv-row-value{gap:4px}}',
 '#kpi360-visual-v2 .kv-hint{border-radius:12px;padding:15px;margin-top:12px;background:var(--ab,#edf4ff);border:1px solid var(--border,#d9e0e8)}',
 '#kpi360-visual-v2 .kv-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}',
 '#kpi360-visual-v2 button{cursor:pointer;min-height:38px;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:600;border:1px solid var(--border,#d9e0e8);background:var(--card,#fff);color:var(--a,#185fa5)}',
 '#kpi360-visual-v2 button.kv-active{background:var(--ab,#e6f0ff);border-color:var(--a,#185fa5)}',
 '#kpi360-visual-v2 .kv-row{display:flex;justify-content:space-between;gap:12px;border-top:1px solid #edf0f6;padding:9px 0}',
 '@media(min-width:851px){#kpi360-visual-v2 .kv-grid>.kv-card:first-child .kv-tooltip{right:auto;left:0}}',
 '@media(max-width:850px){#kpi360-visual-v2 .kv-charts{grid-template-columns:1fr}#kpi360-visual-v2 .kv-grid.kv-plan-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}',
 '@media(max-width:540px){#kpi360-visual-v2 .kv-grid,#kpi360-visual-v2 .kv-grid.kv-plan-grid{grid-template-columns:1fr}#kpi360-visual-v2 .kv-bar{grid-template-columns:70px minmax(0,1fr) 64px}}',
 '@media(max-width:600px){#kpi360-visual-v2 .kv-card{padding:11px}#kpi360-visual-v2 .kv-bar{grid-template-columns:66px minmax(0,1fr) 58px}}'
,
 '#kpi360-visual-v2 .kv-rank-strip{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;margin:10px 0}',
 '#kpi360-visual-v2 .kv-rank{border:1px solid #e5eaf2;border-radius:8px;padding:9px 5px;text-align:center;font-size:11px;background:#f9fbfe}',
 '#kpi360-visual-v2 .kv-rank b{display:block;font-size:15px;margin-top:5px;color:#1357b2}',
 '#kpi360-visual-v2 .kv-rank.kv-current{background:#e4f0ff;border-color:#8ebaff}',
 '#kpi360-visual-v2 .kv-panel{background:#f9fbff;border-color:#c5ddfa;margin-top:12px}',
 '#kpi360-visual-v2 .kv-rank-desc{color:#667085;font-size:11px;line-height:1.5}',
 '#kpi360-visual-v2 .kv-table{width:100%;border-collapse:collapse;font-size:12px}',
 '#kpi360-visual-v2 .kv-table th{text-align:left;color:#667085;font-size:11px;border-bottom:1px solid #e5eaf1;padding:9px 7px}',
 '#kpi360-visual-v2 .kv-table td{padding:10px 7px;border-bottom:1px solid #edf0f6;vertical-align:top}',
 '#kpi360-visual-v2 .kv-details{margin-top:12px}#kpi360-visual-v2 .kv-row{display:flex;justify-content:space-between;gap:12px;border-top:1px solid #edf0f6;padding:9px 0}',
 '#kpi360-visual-v2 .kv-legend{display:flex;gap:12px;align-items:center;flex-wrap:wrap;font-size:11px;color:#667085;margin-bottom:9px}',
 '#kpi360-visual-v2 .kv-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;background:#1669dd}',
 '#kpi360-visual-v2 .kv-manager-link{border:0;padding:0;min-height:auto;background:none;font:inherit;color:var(--a);text-align:left}',
 ].join('\n');document.head.appendChild(el);
}
function card({title,value,sub,foot,kind,completion,explanation,tone}){
 const sales=kind==='sales'?' kv-sales-score':'';
 return '<article class="kv-card kv-score'+sales+'"><div class="kv-heading kv-stat-head"><div class="kv-label">'+esc(title)+'</div>'+
 help(kind,'Пояснение к показателю «'+title+'»',explanation)+'</div><strong class="kv-metric'+(sales&&completion===null?' kv-no-plan':'')+'">'+esc(value)+'</strong>'+
 '<div class="'+(sales?'kv-fact':'kv-note')+'">'+esc(sub)+'</div>'+
 (completion===null?'':'<div class="kv-track" aria-hidden="true"><i style="width:'+Math.max(0,Math.min(100,n(completion)))+'%"></i></div>')+
 (foot?'<div class="kv-foot '+tone+'">'+esc(foot)+'</div>':'')+'</article>';
}
function medal(rank){
 const icon=['🥇','🥈','🥉'][rank-1];
 return rank>0?(icon?'<span aria-hidden="true">'+icon+'</span>':'')+
  '<strong aria-label="'+rank+' место">'+rank+'</strong>':'—';
}
function placeCell(row){
 return '<td><span class="kv-place" data-kv-place="'+esc(norm(row.manager_name))+'">—</span></td>';
}
function planRanking(rows,fact,plan,executionFact=fact){
 return rows.map(row=>({row,completion:percent(row[executionFact]??row[fact],row[plan])}))
  .sort((a,b)=>(b.completion??-Infinity)-(a.completion??-Infinity)||
   n(b.row[fact])-n(a.row[fact])||a.row.manager_name.localeCompare(b.row.manager_name,'ru'));
}
const salesRanking=rows=>planRanking(rows,'shipment','shipment_plan');
const akbRanking=rows=>planRanking(rows,'akb','akb_plan','akb_for_plan');
function planText(plan,format){
 return n(plan)>0?'План на месяц — '+format(plan)+'.':'План на месяц не задан.';
}
const planTableMetrics={
 sales:{
  title:'Продажи по менеджерам',column:'Продажи',planLabel:'План продаж',
  fact:'shipment',plan:'shipment_plan',format:byn,rank:salesRanking,
  tieBreak:'с большей суммой продаж',source:'Сумма продаж берётся из отгрузок 1С.'
 },
 akb:{
  title:'АКБ по менеджерам',column:'АКБ',planLabel:'План АКБ',
  fact:'akb',plan:'akb_plan',format:money,rank:akbRanking,
  tieBreak:'с большим числом активных клиентов',source:'АКБ показывает число уникальных активных клиентов менеджера за выбранный месяц.'
 }
};
function planTable(rows,kind){
 const metric=planTableMetrics[kind];
 const showRank=isBoss(),ordered=metric.rank(rows);
 const explanation=showRank?'Места определяются по проценту выполнения плана. При равном проценте выше менеджер '+
  metric.tieBreak+'. Без плана место не присваивается. ':'';
 return '<div class="kv-card"><div class="kv-heading kv-chart-head"><h3>'+metric.title+'</h3>'+
 help(kind+'-chart','Как читать таблицу «'+metric.title+'»',explanation+metric.source)+'</div>'+
 '<table class="kv-work-table'+(showRank?'':' kv-work-table-personal')+'" aria-label="'+metric.title+'" data-kv-plan-table="'+kind+'">'+
 '<thead><tr>'+(showRank?'<th scope="col">Место</th>':'')+'<th scope="col">Менеджер</th><th scope="col" class="kv-number">'+
 metric.column+'</th><th scope="col" class="kv-number">Выполнение</th></tr></thead><tbody>'+
 ordered.map(({row,completion},i)=>'<tr>'+(showRank?'<td><span class="kv-place">'+medal(completion===null?null:i+1)+'</span></td>':'')+
 '<td><button type="button" class="kv-manager-link" data-manager="'+esc(row.manager_name)+'">'+esc(row.manager_name)+'</button></td><td class="kv-number">'+esc(metric.format(row[metric.fact]))+'</td>'+
 '<td class="kv-number"><div class="kv-row-value"><strong class="kv-blue">'+(completion===null?'—':completion+'%')+'</strong>'+
 help(kind+'-plan-'+i,metric.planLabel+' · '+row.manager_name,planText(row[metric.plan],metric.format))+'</div></td></tr>').join('')+
 '</tbody></table></div>';
}
function clientsTable(rows){
 const ordered=[...rows].sort((a,b)=>n(b.bonus)-n(a.bonus)||n(b.shipment)-n(a.shipment)||a.manager_name.localeCompare(b.manager_name,'ru'));
 return '<div class="kv-card"><div class="kv-heading kv-chart-head"><h3>Новые и вернувшиеся клиенты по менеджерам</h3>'+
 help('client-chart','Как определяются места по клиентам','Место берётся из рейтинга CRM по сумме новых и вернувшихся клиентов. При равном числе клиентов выше менеджер с большей суммой продаж.')+'</div>'+
 '<table class="kv-work-table" aria-label="Новые и вернувшиеся клиенты по менеджерам" data-kv-rank="rank_bonus">'+
 '<thead><tr><th scope="col">Место</th><th scope="col">Менеджер</th><th scope="col" class="kv-number">Новые</th><th scope="col" class="kv-number">Вернулись</th><th scope="col" class="kv-number">Всего</th></tr></thead><tbody>'+
 ordered.map((row,i)=>'<tr>'+placeCell(row)+'<td><button type="button" class="kv-manager-link" data-manager="'+esc(row.manager_name)+'">'+esc(row.manager_name)+'</button></td><td class="kv-number">'+money(row.first)+'</td>'+
 '<td class="kv-number">'+money(row.returned)+'</td><td class="kv-number"><div class="kv-row-value"><strong class="kv-blue">'+money(row.bonus)+'</strong>'+
 help('client-plan-'+i,'План по клиентам · '+row.manager_name,planText(row.new_clients_plan,money))+'</div></td></tr>').join('')+
 '</tbody></table></div>';
}
function showPlaces(el,data){
 const ranks=new Map(histRows(data).filter(row=>row.month===data.month).map(row=>[norm(row.manager_name),row]));
 el.querySelectorAll('[data-kv-rank]').forEach(table=>{
  table.querySelectorAll('[data-kv-place]').forEach(cell=>{
   const rank=n(ranks.get(cell.dataset.kvPlace)?.[table.dataset.kvRank]);
   cell.innerHTML=medal(rank);
  });
 });
}
function histRows(data){return Array.isArray(data.history?.rows)?data.history.rows:[]}
function lineSvg(monthly,series,unit){
 if(!monthly.length)return '<div class="kv-note">Нет истории для построения графика.</div>';
 const max=Math.max(1,...series.flatMap(s=>monthly.map(m=>n(s.at(m)?.value))))*1.12;
 const x=i=>54+i*100, y=v=>185-140*n(v)/max;
 const grids=[0,0.25,0.5,0.75,1].map(fr=>{
  const yy=y(max*fr);
  return '<line x1="52" y1="'+yy+'" x2="570" y2="'+yy+'" stroke="#e7edf6"/>'+
   '<text x="43" y="'+(yy+4)+'" fill="#718096" font-size="10" text-anchor="end">'+
    esc(money(max*fr))+'</text>';
 }).join('');
 return '<svg viewBox="0 0 620 224" role="img" aria-label="'+esc('Динамика '+unit+' за шесть месяцев')+'" style="width:100%;height:auto;max-height:250px">'+
 grids+
 series.map(s=>{
  const points=monthly.map((m,i)=>x(i)+','+y(s.at(m)?.value)).join(' ');
  return '<polyline points="'+points+'" stroke="'+s.color+'" stroke-width="3" fill="none" stroke-linejoin="round" stroke-linecap="round"/>'+
   monthly.map((m,i)=>'<circle cx="'+x(i)+'" cy="'+y(s.at(m)?.value)+'" r="4.2" fill="'+s.color+'" stroke="white" stroke-width="1.5">'+
   '<title>'+esc(s.name+' · '+nameMonth(m)+' · '+money(s.at(m)?.value)+' '+unit)+'</title></circle>').join('');
 }).join('')+
 monthly.map((m,i)=>'<text x="'+x(i)+'" y="211" font-size="12" text-anchor="middle" fill="#65768c">'+esc(months[Number(m.slice(5,7))])+'</text>').join('')+
 '</svg>';
}
function trendChart(data){
 const history=histRows(data);
 if(!history.length)return '<div class="kv-card" style="margin-top:12px"><h3>Динамика за шесть месяцев</h3><div class="kv-note">История мест и графиков пока недоступна. Основные KPI и клиенты остаются доступными.</div></div>';
 const metric=dimension[historyMetric],monthly=[...new Set(history.map(r=>r.month))].sort();
 const names=[...new Set(history.map(r=>r.manager_name))];
 const palette=['#1969e8','#8a5cf6','#119467'];
 const series=names.map((name,i)=>({
  name,color:palette[i%palette.length],
  at:m=>({value:n(history.find(r=>r.month===m&&norm(r.manager_name)===norm(name))?.[metric.key])})
 }));
 const tabs=Object.entries(dimension).map(([key,d])=>'<button type="button" data-metric="'+key+'" class="'+(key===historyMetric?'kv-active':'')+'">'+esc(d.label)+'</button>').join('');
 return '<div class="kv-card" style="margin-top:12px"><div class="kv-top"><div><h3 style="margin:0">Динамика продаж, АКБ и клиентов KPI · 6 месяцев</h3>'+
 '<div class="kv-note">Нажми на менеджера в графике выше, чтобы увидеть его историю мест</div></div>'+
 '<div class="kv-tabs" style="margin:0">'+tabs+'</div></div>'+
 '<div class="kv-legend">'+series.map(s=>'<span><i class="kv-dot" style="background:'+s.color+'"></i>'+esc(s.name)+'</span>').join('')+'</div>'+
 lineSvg(monthly,series,metric.unit)+
 '<div class="kv-note">Данные по менеджерам показаны только в пределах разрешённого доступа. Рейтинг по факту «'+metric.label+'» можно посмотреть в детализации.</div></div>';
}
function managerPanel(data,rows){
 const host=document.getElementById(ID+'-manager-panel');if(!host)return;
 const manager=selectedManager||(!isBoss()?rows[0]?.manager_name:'');
 if(!manager){host.innerHTML='';return}
 const own=histRows(data).filter(r=>norm(r.manager_name)===norm(manager)).sort((a,b)=>a.month.localeCompare(b.month));
 const current=rows.find(r=>norm(r.manager_name)===norm(manager));
 if(!current){host.innerHTML='<div class="kv-note">Показатели выбранного менеджера недоступны.</div>';return}
 const rankBlock=own.length?own.map((r,i)=>{
   const rank=r.rank_overall==null?'—':r.rank_overall+' место';
   return '<div class="kv-rank'+(i===own.length-1?' kv-current':'')+'"><div>'+esc(nameMonth(r.month))+'</div>'+
    '<b>'+esc(rank)+'</b><div class="kv-note">'+(r.overall_score==null?'нет плана':money(r.overall_score)+'% по KPI')+'</div></div>'
 }).join(''):'<div class="kv-note">Пока нет истории мест.</div>';
 const salesSeries=[
  {name:'Факт',color:'#1969e8',at:m=>({value:n(own.find(r=>r.month===m)?.sales)})},
  {name:'План',color:'#8a5cf6',at:m=>({value:n(own.find(r=>r.month===m)?.sales_plan)})}
 ];
 const ly=(data.prior_sales||[]).find(r=>norm(r.manager_name)===norm(manager));
 const prev=ly?.sales_2025;
 const summary=(current.shipment_plan?pc(current.shipment,current.shipment_plan):'план не задан')+
   ' от плана · АКБ '+n(current.akb)+' · клиентов для KPI '+n(current.bonus)+
   ' ('+n(current.first)+' впервые, '+n(current.returned)+' вернувшихся)';
 host.innerHTML='<div class="kv-card kv-panel"><div class="kv-top"><div><h3 style="font-size:17px;margin:0">'+esc(manager)+' · подробный анализ</h3>'+
  '<div class="kv-note">'+esc(summary)+'</div></div>'+
  (isBoss()?'<button data-close-manager>Закрыть</button>':'')+'</div>'+
  '<h3>Места в команде · предыдущие 6 месяцев</h3>'+
  '<div class="kv-rank-strip">'+rankBlock+'</div>'+
  '<div class="kv-rank-desc">Место рассчитано по среднему выполнению трёх планов (продажи, АКБ, премиальные клиенты). Если план на месяц отсутствовал — показываем «—», а не выдуманный рейтинг.</div>'+
  '<div style="margin-top:15px"><h3>Продажи · план и факт по месяцам</h3>'+
   '<div class="kv-legend"><span><i class="kv-dot"></i>Факт</span>'+
   '<span><i class="kv-dot" style="background:#8a5cf6"></i>План</span></div>'+
   lineSvg(own.map(r=>r.month),salesSeries,'бел. руб.')+'</div>'+
  '<div class="kv-note">Выбранный месяц: факт '+money(current.shipment)+' бел. руб. · план '+money(current.shipment_plan)+
   ' бел. руб. · факт '+esc(data.previous_month||'прошлого года')+': '+(prev==null?'нет данных':money(prev)+' бел. руб.')+'</div>'+
  '<h3 style="margin-top:15px">Места по конкретным показателям</h3>'+
  '<div style="overflow-x:auto"><table class="kv-table"><thead><tr><th>Месяц</th><th>Продажи</th><th>АКБ</th><th>Клиенты KPI</th></tr></thead><tbody>'+
  own.map(r=>'<tr><td>'+esc(nameMonth(r.month))+'</td><td>'+n(r.rank_sales)+' из '+n(r.team_size)+'</td>'+
    '<td>'+n(r.rank_akb)+' из '+n(r.team_size)+'</td><td>'+n(r.rank_bonus)+' из '+n(r.team_size)+'</td></tr>').join('')+
  '</tbody></table></div>'+
  '<div class="kv-actions"><button data-view-clients class="kv-primary">Клиенты '+esc(manager)+'</button>'+
  (isBoss()?'<button data-choose-another>Другой менеджер</button>':'')+'</div></div>';
 host.querySelector('[data-close-manager]')?.addEventListener('click',()=>{selectedManager='';host.innerHTML='';renderDetails(data,rows)});
 host.querySelector('[data-choose-another]')?.addEventListener('click',()=>{selectedManager='';host.innerHTML='';renderDetails(data,rows)});
 host.querySelector('[data-view-clients]')?.addEventListener('click',()=>document.getElementById(ID+'-detail')?.scrollIntoView({behavior:'smooth',block:'start'}));
}
function openManager(data,rows,name){
 if(!isBoss()&&!rows.some(r=>norm(r.manager_name)===norm(name)))return;
 selectedManager=name;clientFilter='bonus';
 managerPanel(data,rows);renderDetails(data,rows);
 document.getElementById(ID+'-manager-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
}
function renderDetails(data,rows){
 const host=document.getElementById(ID+'-detail');if(!host)return;
 if(isBoss()&&!selectedManager){
  host.innerHTML='<div class="kv-card kv-details"><h3>Клиенты менеджеров</h3><div class="kv-note">Списки скрыты, чтобы не перегружать экран. Выберите менеджера в таблице.</div></div>';
  return;
 }
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
 [],['Клиент','Менеджер','Категория','Отгрузка','Последняя прежняя отгрузка'],...(data.clients||[]).map(r=>[r.client_name,r.manager_name,r.type,r.shipment,r.last_sale]),
 [],['ИСТОРИЯ KPI ЗА 6 МЕСЯЦЕВ'],['Месяц','Менеджер','Продажи','План продаж','АКБ','План АКБ','Клиенты для премии','План KPI','Первые','Вернувшиеся','Место по 3 планам','Место по сумме продаж','Место по АКБ','Место по клиентам KPI'],
 ...histRows(data).map(r=>[r.month,r.manager_name,r.sales,r.sales_plan,r.akb,r.akb_plan,r.bonus,r.bonus_plan,r.first,r.returned,r.rank_overall??'',r.rank_sales,r.rank_akb,r.rank_bonus])];
 const csv='\uFEFF'+arr.map(row=>row.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='KPI360_'+data.month+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function kpiFacts(data){
 const title=nameMonth(data.month);
 if(!latestData(data))return title+' — факт ожидает выгрузки 1С.';
 const t=totals(data);
 return title+' — продажи '+byn(t.sales)+', выполнение плана '+pc(t.sales,t.sales_plan)+
  ', АКБ '+t.akb+', новых '+t.first+', вернувшихся '+t.returned+'.';
}
function launchLera(){
 const status=document.querySelector('[data-kv-lera-status]');
 const setStatus=text=>{if(status){status.textContent=text;status.hidden=!text;}};
 const key=requestKey(),data=shownKey===key?shown:null;
 const compared=comparison?.key===comparisonKey()?comparison:null;
 const scope=isBoss()?'моей команды':'моей работы';
 const question=data?
   (compared?'Сравни показатели '+scope+' и предложи, что проверить в первую очередь. '+periodFacts(compared.main)+' '+periodFacts(compared.baseline):
    'Разбери показатели '+scope+' и предложи до трёх рабочих действий. '+kpiFacts(data))+' Отдели факты от предположений.':
   'Помоги разобраться с KPI за '+nameMonth(month())+'.';
 const field=()=>document.querySelector('.rva-window:not([hidden]) .rva-input,.rsa-branch-panel:not([hidden]) input[aria-label="Вопрос Лере"]');
 const starter=document.querySelector('.rva-ai360-safe-launch:not([hidden]),.rva-launch:not([hidden]),.rsa-branch-launch:not([hidden])');
 if(!field()&&!starter){
  setStatus('Лера недоступна для этой учётной записи.');
  return;
 }
 setStatus('');
 if(!field())starter.click();
 let attempts=0;
 function prefill(){
  if(!active()||requestKey()!==key)return;
  const input=field();
  if(input){
   if(!input.value.trim()){
    input.value=question;
    input.dispatchEvent(new Event('input',{bubbles:true}));
    input.select();
   }
   input.focus();
   return;
  }
  if(++attempts<=28)window.setTimeout(prefill,250);
  else setStatus('Лера не открылась. Попробуйте ещё раз.');
 }
 prefill();
}
const monthIndex=value=>Number(value.slice(0,4))*12+Number(value.slice(5))-1;
function monthsInRange({from,to}){
 const first=monthIndex(from),last=monthIndex(to);
 return Array.from({length:last-first+1},(_,i)=>{
  const m=first+i;
  return String(Math.floor(m/12)).padStart(4,'0')+'-'+String(m%12+1).padStart(2,'0');
 });
}
function countPeriodClients(clients){
 if(!clients)return {akb:null,first:null,returned:null,bonus:null};
 const active=new Set(),first=new Set(),returned=new Set();
 for(const client of clients){
  if(!client.client_key)continue;
  active.add(client.client_key);
  if(client.type==='first')first.add(client.client_key);
  if(client.type==='returned')returned.add(client.client_key);
 }
 for(const key of first)returned.delete(key);
 return {akb:active.size,first:first.size,returned:returned.size,bonus:first.size+returned.size};
}
function summarizePeriod(range,snapshots){
 const label=rangeLabel(range),monthCount=monthIndex(range.to)-monthIndex(range.from)+1;
 if(snapshots.length!==monthCount||snapshots.some(s=>!latestData(s)))return {label,monthCount,available:false,rows:[],totals:null};
 const rowsByManager=new Map(),monthly=snapshots.map(mapped);
 for(const rows of monthly)for(const row of rows){
  const key=norm(row.manager_name);
  if(!rowsByManager.has(key))rowsByManager.set(key,[]);
  rowsByManager.get(key).push(row);
 }
 const agrees=(counts,expected)=>['akb','first','returned','bonus']
  .every(field=>expected[field]==null||counts[field]===n(expected[field]));
 const allClients=snapshots.every((snapshot,i)=>{
  const clients=snapshot.clients;
  return Array.isArray(clients)&&clients.every(client=>client.client_key)&&
   agrees(countPeriodClients(clients),snapshot.summary||{})&&monthly[i].every(row=>
    agrees(countPeriodClients(clients.filter(client=>norm(client.manager_name)===norm(row.manager_name))),row));
 })?snapshots.flatMap(snapshot=>snapshot.clients):null;
 const sum=(rows,field)=>rows.reduce((total,row)=>total+n(row[field]),0);
 const completePlan=(rows,field)=>rows.length===snapshots.length&&rows.every(row=>n(row[field])>0)?sum(rows,field):null;
 const rows=[...rowsByManager].map(([key,list])=>{
  const counts=snapshots.length===1?list[0]:countPeriodClients(allClients?.filter(c=>norm(c.manager_name)===key));
  return {manager_name:list[0].manager_name,shipment:sum(list,'shipment'),shipment_plan:completePlan(list,'shipment_plan'),
   akb:counts.akb??null,akb_for_plan:sum(list,'akb'),akb_plan:completePlan(list,'akb_plan'),
   first:counts.first??null,returned:counts.returned??null,bonus:counts.bonus??null,
   new_clients_plan:completePlan(list,'new_clients_plan')};
 });
 const clientTotals=snapshots.length===1?totals(snapshots[0]):countPeriodClients(allClients);
 const teamPlan=rows.length&&rows.every(r=>r.shipment_plan!==null)?sum(rows,'shipment_plan'):null;
 return {label,monthCount,available:true,rows,totals:{...clientTotals,sales:sum(rows,'shipment'),sales_plan:teamPlan}};
}
function periodFacts(period){
 if(!period.available)return period.label+' — факт 1С за весь период недоступен.';
 const t=period.totals;
 return period.label+' — продажи '+byn(t.sales)+', выполнение плана '+pc(t.sales,t.sales_plan)+
  ', АКБ '+(t.akb??'нет данных')+', новых '+(t.first??'нет данных')+', вернувшихся '+(t.returned??'нет данных')+'.';
}
function comparisonKey(){
 return actorKey()+'|'+rangeValue(currentRange())+'|'+rangeValue(comparisonRange());
}
function deltaText(a,b,format){
 if(a===null||b===null)return '—';
 const delta=Math.round((a-b)*100)/100;
 const tone=delta>0?'kv-green':delta<0?'kv-red':'';
 return '<span class="'+tone+'">'+(delta>0?'+':'')+esc(format(delta))+'</span>';
}
function comparisonMarkup(main,baseline){
 const fields=[
  ['Продажи','sales',byn,byn],
  ['Выполнение плана','completion',x=>x+'%',x=>x+' п. п.'],
  ['АКБ','akb',money,money],['Новые клиенты','first',money,money],['Вернувшиеся клиенты','returned',money,money]
 ];
 const value=(period,key)=>key==='completion'?percent(period.totals?.sales,period.totals?.sales_plan):period.totals?.[key]??null;
 const unavailable=[...new Set([main,baseline].filter(p=>!p.available).map(p=>p.label))];
 const incompleteClients=[main,baseline].some(p=>p.available&&p.totals.akb===null);
 return '<table class="kv-work-table kv-compare-table" aria-label="Сравнение периодов">'+
  '<thead><tr><th scope="col">Показатель</th><th scope="col" class="kv-number">'+esc(main.label)+'</th>'+
  '<th scope="col" class="kv-number">'+esc(baseline.label)+'</th><th scope="col" class="kv-number">Основной − сравнение</th></tr></thead><tbody>'+
  fields.map(([label,key,format,deltaFormat])=>{
   const a=value(main,key),b=value(baseline,key);
   return '<tr><td>'+label+'</td><td class="kv-number">'+(a===null?'—':esc(format(a)))+'</td>'+
    '<td class="kv-number">'+(b===null?'—':esc(format(b)))+'</td><td class="kv-number">'+deltaText(a,b,deltaFormat)+'</td></tr>';
  }).join('')+'</tbody></table>'+
  (main.monthCount!==baseline.monthCount?'<div class="kv-note">Разная длительность периодов · '+main.monthCount+' и '+baseline.monthCount+' мес.</div>':'')+
  (unavailable.length?'<div class="kv-note">Факт 1С за весь период недоступен · '+esc(unavailable.join(', '))+'</div>':'')+
  (incompleteClients?'<div class="kv-note">Данные об уникальных клиентах за весь период недоступны.</div>':'');
}
function monthlyTables(rows){
 return planTable(rows,'sales')+planTable(rows,'akb')+clientsTable(rows);
}
function periodManagersTable(main,baseline,kind){
 const metric=planTableMetrics[kind];
 const title=metric?.title||'Новые и вернувшиеся клиенты по менеджерам';
 const indexed=rows=>new Map(rows.map(row=>[norm(row.manager_name),row]));
 const current=indexed(main.rows),previous=indexed(baseline.rows);
 const keys=[...new Set([...current.keys(),...previous.keys()])];
 keys.sort((a,b)=>(current.get(a)||previous.get(a)).manager_name.localeCompare((current.get(b)||previous.get(b)).manager_name,'ru'));
 const completion=row=>row&&metric?percent(row[kind==='akb'?'akb_for_plan':metric.fact],row[metric.plan]):null;
 const showCompletion=metric&&[...current.values(),...previous.values()].some(row=>completion(row)!==null);
 const fields=metric?[[metric.column,metric.fact,metric.format,metric.format],
  ...(showCompletion?[['Выполнение','completion',x=>x+'%',x=>x+' п. п.']]:[])]
  :[['Новые','first',money,money],['Вернулись','returned',money,money],['Всего','bonus',money,money]];
 const explanation=kind==='akb'
  ? 'АКБ — уникальные активные клиенты за период. Выполнение учитывает сумму месячных фактов и планов.'
  : kind==='sales'?'Продажи — сумма отгрузок за период.'
  :'Новые и вернувшиеся считаются по первой и повторной отгрузке из 1С. Каждый клиент учитывается один раз за период. Первая покупка имеет приоритет.';
 return '<div class="kv-card"><div class="kv-heading kv-chart-head"><h3>'+title+'</h3>'+
  help('range-'+kind,'Как читать сравнение «'+title+'»',explanation)+'</div>'+
  '<p class="kv-note kv-period-note">'+esc(main.label)+' · сравнение с '+esc(baseline.label)+'</p>'+
  '<table class="kv-work-table kv-work-table-personal" aria-label="'+title+'"><thead><tr><th scope="col">Менеджер</th>'+
  fields.map(([label])=>'<th scope="col" class="kv-number">'+label+'</th>').join('')+'</tr></thead><tbody>'+
  keys.map(key=>{
   const a=current.get(key),b=previous.get(key);
   const cells=fields.map(([,field,format,deltaFormat])=>{
    const now=(field==='completion'?completion(a):a?.[field])??null;
    const before=(field==='completion'?completion(b):b?.[field])??null;
    return '<td class="kv-number"><div class="kv-period-value"><strong>'+(now===null?'—':esc(format(now)))+'</strong>'+
     (before===null?'':'<small>Было '+esc(format(before))+'</small>')+
     (now!==null&&before!==null?'<small>'+deltaText(now,before,deltaFormat)+'</small>':'')+'</div></td>';
   }).join('');
   return '<tr><td>'+esc((a||b).manager_name)+'</td>'+cells+'</tr>';
  }).join('')+'</tbody></table></div>';
}
async function readComparisonMonth(client,actor,period){
 const key=actor+'|'+period;
 let entry=comparisonMonths.get(key);
 if(!entry||Date.now()-entry.started>60000){
  entry={started:Date.now(),promise:fetchDashboard(client,period)};
  comparisonMonths.set(key,entry);
  if(comparisonMonths.size>24)comparisonMonths.delete(comparisonMonths.keys().next().value);
 }
 try{return await entry.promise;}
 catch(error){
  if(comparisonMonths.get(key)===entry)comparisonMonths.delete(key);
  throw error;
 }
}
async function renderComparison(data,el){
 const host=el.querySelector('[data-kv-comparison]');
 const rankings=el.querySelector('[data-kv-period-rankings]');
 const monthly=el.querySelector('[data-kv-monthly]');
 const base=currentRange(),baseline=comparisonRange();
 if(!host||!rankings||!monthly)return;
 host.hidden=!baseline;
 monthly.hidden=false;
 rankings.hidden=true;
 rankings.innerHTML='';
 if(!baseline){comparison=null;host.innerHTML='';return;}
 host.innerHTML='<div class="kv-heading kv-chart-head"><h3>Сравнение периодов</h3><button type="button" data-kv-clear-compare>Убрать сравнение</button></div>'+
  '<div data-kv-compare-result aria-live="polite"></div>';
 host.querySelector('[data-kv-clear-compare]').addEventListener('click',()=>{
  for(const input of [compareInput(),baseInput()]){
   if(input){input.value='';input.dispatchEvent(new Event('change',{bubbles:true}));}
  }
  document.querySelector('[data-kv-month-open="compare"]')?.focus();
 });
 const result=host.querySelector('[data-kv-compare-result]');
 const key=comparisonKey(),actor=actorKey();
 const isCurrent=()=>comparisonKey()===key&&shown===data&&host.contains(result);
 try{
  const client=dbc();
  if(!client)throw Error('Нет подключения к Supabase');
  const complete=period=>data.latest_sales_month&&period.to<=data.latest_sales_month?monthsInRange(period):[];
  const first=complete(base),second=complete(baseline),needed=[...new Set([...first,...second])];
  const loaded=new Map([[data.month,data]]);
  const remaining=needed.filter(m=>!loaded.has(m));
  for(let i=0;i<remaining.length;i+=2){
   if(!isCurrent())return;
   result.textContent='Загружается сравнение · '+i+' из '+remaining.length+' мес.';
   const batch=await Promise.all(remaining.slice(i,i+2).map(m=>readComparisonMonth(client,actor,m)));
   for(const snapshot of batch)loaded.set(snapshot.month,snapshot);
  }
  if(!isCurrent())return;
  const main=summarizePeriod(base,first.map(m=>loaded.get(m)));
  const previous=summarizePeriod(baseline,second.map(m=>loaded.get(m)));
  comparison={key,main,baseline:previous};
  result.innerHTML=comparisonMarkup(main,previous);
  if(main.available||previous.available){
   rankings.innerHTML=['sales','akb','clients'].map(kind=>periodManagersTable(main,previous,kind)).join('');
   monthly.hidden=true;
   rankings.hidden=false;
  }
 }catch(error){
  if(!isCurrent())return;
  comparison=null;
  result.innerHTML='<span>Не удалось загрузить период сравнения.</span> <button type="button" data-kv-retry-compare>Повторить</button>';
  result.querySelector('[data-kv-retry-compare]').addEventListener('click',()=>renderComparison(data,el));
 }
}
// Pre-import months are still a useful PLANNING workspace. Do not turn missing 1C facts into zero KPIs.
function planSnapshot(data){
 const rows=mapped(data),sum=key=>rows.reduce((total,r)=>total+n(r[key]),0);
 return {rows,sales:sum('shipment_plan'),akb:sum('akb_plan'),
   bonus:sum('new_clients_plan'),
   hasPlans:rows.some(r=>n(r.shipment_plan)>0||n(r.akb_plan)>0||n(r.new_clients_plan)>0)};
}
function renderAwaitingImport(data,el){
 const plans=planSnapshot(data),recent=data.latest_sales_month||'';
 const rows=plans.rows, max=Math.max(1,...rows.map(r=>n(r.shipment_plan)));
 const cells=[
  ['План продаж',money(plans.sales)+' бел. руб.','Факт: ожидаем импорт 1С'],
  ['План АКБ',money(plans.akb)+' клиентов','','Показана сумма планов по активной клиентской базе.'],
  ['План по новым и вернувшимся',money(plans.bonus)+' клиентов','','Клиенты с первой отгрузкой или вернувшиеся после 6 полных месяцев без положительных отгрузок.'],
  ['Статус периода','Ожидаем 1С','Последние данные: '+(recent?nameMonth(recent):'нет отметки')]
 ];
 const cards=cells.map(([title,value,detail,explanation],index)=>
  '<article class="kv-card"><div class="kv-heading kv-stat-head"><div class="kv-label">'+esc(title)+'</div>'+
  (explanation?help('plan-stat-'+index,title,explanation):'')+'</div>'+
  '<div class="kv-metric" style="font-size:21px">'+esc(value)+'</div>'+
  (detail?'<div class="kv-note">'+esc(detail)+'</div>':'')+'</article>').join('');
 const names=rows.map(r=>'<div class="kv-bar kv-bar-static"><span>'+esc(r.manager_name)+'</span>'+
   '<div class="kv-bg"><i style="width:'+Math.min(100,100*n(r.shipment_plan)/max)+'%;background:#1769d8"></i></div>'+
   '<span style="text-align:right"><b>'+money(r.shipment_plan)+'</b></span></div>').join('');
 const header='<div class="kv-top"><div class="kv-heading"><strong class="kv-subhead">KPI 360° · '+esc(nameMonth(data.month))+'</strong>'+
  help('period','Откуда берутся данные за выбранный месяц','Фактические показатели, проценты, рейтинг и клиенты появятся после первой выгрузки 1С за выбранный месяц. Менеджеру доступны его планы и история, руководителю — показатели подчинённой команды.')+'</div>'+
  '<div class="kv-actions" style="margin:0"><button data-refresh>↻ Обновить</button>'+
  (recent?'<button data-lastmonth>Открыть '+esc(nameMonth(recent))+'</button>':'')+
  '</div></div>';
 el.innerHTML=header+
 '<div class="kv-hint" style="margin:0 0 12px"><b>Планы на '+esc(nameMonth(data.month))+' доступны.</b> '+
 'Последняя выгрузка 1С — '+esc(recent?nameMonth(recent):'ещё не определена')+
 '. Факт продаж за выбранный месяц ожидает выгрузки.</div>'+
 '<div class="kv-grid kv-plan-grid">'+cards+'</div><section class="kv-card kv-compare" data-kv-comparison hidden></section><section data-kv-league></section>'+
 '<div class="kv-charts" data-kv-monthly><div class="kv-card"><div class="kv-heading kv-chart-head"><h3>План продаж по менеджерам · '+esc(nameMonth(data.month))+'</h3>'+
 help('plan-chart','Как читать график планов','Синие полосы показывают утверждённые планы продаж.')+'</div>'+
 (rows.length?names:'<div class="kv-note">Планы по сотрудникам не установлены.</div>')+'</div>'+
 '<div class="kv-card"><div class="kv-heading kv-chart-head"><h3>Планы по клиентам</h3>'+
 help('client-plans','Как меняются планы','Руководитель может изменить планы через кнопку «Внести планы» вверху.')+'</div>'+
 (rows.length?rows.map(r=>'<div class="kv-row"><b>'+esc(r.manager_name)+'</b><div>'+
 'АКБ: '+money(r.akb_plan)+' · Новые и вернувшиеся: '+money(r.new_clients_plan)+'</div></div>').join(''):
 '<div class="kv-note">Планы отсутствуют.</div>')+'</div></div><div class="kv-work" data-kv-period-rankings hidden></div>';
 el.querySelector('[data-refresh]')?.addEventListener('click',()=>load(true));
 el.querySelector('[data-lastmonth]')?.addEventListener('click',()=>{
   const picker=document.getElementById('manager-kpi-month');
   if(!picker||!recent)return;
   picker.value=recent;picker.dispatchEvent(new Event('change',{bubbles:true}));
 });
 renderHistory(data);
 void renderComparison(data,el);
}

function renderHistory(data){
 const el=document.getElementById(ID),league=el?.querySelector('[data-kv-league]');
 if(!league)return;
 league.innerHTML=data.history?.pending?'':(w.RESANTA_KPI360_LEAGUE_V1?.markup(data,w.currentProfile,help)||'');
 showPlaces(el,data);
 const trends=el.querySelector('[data-kv-trend]');
 if(trends){
  trends.innerHTML=trendChart(data);
  trends.querySelectorAll('[data-metric]').forEach(button=>button.addEventListener('click',()=>{
   historyMetric=button.dataset.metric;
   renderHistory(data);
  }));
 }
 if(selectedManager)managerPanel(data,mapped(data));
}
function render(data){
 if(month()!==data.month)return;const el=root();if(!el)return;
 if(!latestData(data)){renderAwaitingImport(data,el);return}
 const rows=mapped(data),t=totals(data);
 const header='<div class="kv-top"><div class="kv-heading"><strong class="kv-subhead">KPI 360° · '+esc(nameMonth(data.month))+'</strong>'+
 help('period','Как читать показатели периода','Показатели открытого месяца предварительные. Данные за 2025 год сгруппированы по текущему закреплению клиентов за менеджерами.')+'</div>'+
 '<div class="kv-actions" style="margin:0"><button data-refresh>↻ Обновить</button><button data-export>Excel</button></div></div>';
 const salesCompletion=percent(t.sales,t.sales_plan);
 const cards='<div class="kv-grid">'+card({
  title:'Выполнение плана продаж',value:salesCompletion===null?'План не задан':salesCompletion+'%',sub:byn(t.sales),
  foot:'К прошлому году '+growth(t.sales,t.prev_sales),kind:'sales',completion:salesCompletion,
  explanation:planText(t.sales_plan,byn)+' Факт продаж берётся из отгрузок 1С.',
  tone:comparisonTone(t.sales,t.prev_sales)
 })+card({
  title:'Новые и вернувшиеся клиенты',value:money(t.bonus),sub:'Новые '+t.first+' · Вернувшиеся '+t.returned,
  kind:'bonus',completion:null,
  explanation:planText(t.bonus_plan,money)+(t.bonus_plan>0?' Выполнение '+pc(t.bonus,t.bonus_plan)+'.':'')+
   ' Учитываются клиенты с первой отгрузкой и вернувшиеся после 6 полных месяцев без положительных отгрузок.'
 })+card({
  title:'АКБ',value:money(t.akb),sub:isBoss()?'Год назад '+money(t.akb_previous):'Моя активная база',
  foot:'К прошлому году '+growth(t.akb,t.akb_previous),kind:'akb',completion:percent(t.akb,t.akb_plan),
  explanation:'В активной клиентской базе филиала каждый клиент учитывается один раз. Клиенты с неоднозначными связями учитываются отдельно. '+planText(t.akb_plan,money),
  tone:comparisonTone(t.akb,t.akb_previous)
 })+'</div>';
 const chart='<div class="kv-work" data-kv-monthly>'+monthlyTables(rows)+
  '<section id="'+ID+'-manager-panel"></section><section id="'+ID+'-detail"></section>'+
  '<details class="kv-card"><summary>Динамика за 6 месяцев</summary><div data-kv-trend></div></details></div>';
 el.innerHTML=header+cards+'<section class="kv-card kv-compare" data-kv-comparison hidden></section><section data-kv-league></section>'+chart+'<div class="kv-work" data-kv-period-rankings hidden></div>';
 el.querySelector('[data-refresh]')?.addEventListener('click',()=>load(true));
 el.querySelector('[data-export]')?.addEventListener('click',()=>exportCsv(data,rows,t));
 el.querySelectorAll('[data-manager]').forEach(button=>button.addEventListener('click',()=>openManager(data,rows,button.dataset.manager)));
 renderDetails(data,rows);
 renderHistory(data);
 void renderComparison(data,el);
}
async function loadHistory(client,data,isCurrent){
 const m=data.month;
 const historyPeriod=data.latest_sales_month&&m>data.latest_sales_month?data.latest_sales_month:m;
 try{
  let response=await client.rpc('crm_manager_kpi360_history_v4',{p_month:historyPeriod});
  if(!isCurrent())return;
  if(response.error)response=await client.rpc('crm_manager_kpi360_history_v3',{p_month:historyPeriod});
  if(response.error)throw response.error;
  if(!['kpi360-history-v4','kpi360-history-v3'].includes(response.data?.version)||!Array.isArray(response.data.rows))
   throw Error('Некорректный ответ истории KPI');
  data.history=response.data;
 }catch(error){
  console.warn('KPI360 manager rank history unavailable',error);
  data.history={rows:[],unavailable:true};
 }
 if(!isCurrent())return;
 renderHistory(data);
}
async function fetchDashboard(client,m){
 for(let attempt=0;attempt<2;attempt++){
  try{
   const {data,error}=await client.rpc('crm_manager_kpi360_dashboard_v2',{p_month:m});
   if(error)throw error;
   if(!data||data.version!=='kpi360-visual-v2'||data.month!==m||!Array.isArray(data.sales))throw Error('Неверный ответ сервиса KPI');
   return data;
  }catch(error){
   if(attempt||!/fetch|network|timeout/i.test(String(error?.message||error)))throw error;
   await new Promise(done=>setTimeout(done,450));
  }
 }
}
function load(force=false,restart=false){
 if(!active()||!['boss','manager'].includes(role()))return;
 const m=month();
 if(!validMonth(m))return;
 const actor=actorKey();
 if(profileKey&&profileKey!==actor){
  for(const field of [baseInput(),compareInput()]){
   if(field){field.value='';field.dispatchEvent(new Event('change',{bubbles:true}));}
  }
  comparison=null;
  comparisonMonths.clear();
 }
 profileKey=actor;
 const key=requestKey();
 if(flight?.key===key&&!restart)return flight.promise;
 if(!force&&shownKey===key)return;
 styles();
 const el=root();if(!el)return;
 const sameView=shownKey===key;
 if(force){comparison=null;comparisonMonths.clear();}
 if(!sameView){
  shown=null;shownKey='';selectedManager='';clientFilter='bonus';historyMetric='sales';
  el.innerHTML='<div class="kv-card kv-note" role="status">Загружаю KPI за '+esc(nameMonth(m))+'…</div>';
 }else{
  el.querySelector('[data-kv-refresh-error]')?.remove();
 }
 const serial=++generation,isCurrent=()=>serial===generation&&requestKey()===key;
 const promise=(async()=>{
  try{
   const client=dbc();if(!client)throw Error('Нет подключения к Supabase');
   const snapshot=await fetchDashboard(client,m);
   if(!isCurrent())return;
   const data={...snapshot,history:{rows:[],pending:true}};
   shown=data;shownKey=key;
   render(data);
   void loadHistory(client,data,()=>shown===data&&requestKey()===key);
  }catch(error){
   if(!isCurrent())return;
   const notice='<div class="kv-card" data-kv-refresh-error role="status" style="color:#b42318">Не удалось загрузить KPI: '+esc(error?.message||error)+'. <button data-retry>Повторить</button></div>';
   if(sameView)el.insertAdjacentHTML('afterbegin',notice);else el.innerHTML=notice;
   el.querySelector('[data-retry]')?.addEventListener('click',()=>load(true));
  }
 })().finally(()=>{if(flight?.promise===promise)flight=null});
 flight={key,promise};
 return promise;
}
function syncStaffKpiNavigation(){
 const staff=w.crmAI360StaffIdentityV1?.()?.tier==='field_manager';
 const desktop=document.getElementById('nav-managers');
 const mobile=document.getElementById('bn-managers');
 if(desktop?.lastChild?.nodeType===3)desktop.lastChild.nodeValue=staff?' Мои KPI':' Менеджеры';
 const caption=mobile?.querySelector('span');
 if(caption)caption.textContent=staff?'Мои KPI':'Менеджеры';
 if(isBoss())return;
 for(const button of [desktop,mobile])if(button)button.style.display=staff?'flex':'none';
}
function boot(){
 const page=document.getElementById('page-managers');
 if(!page)return;
 styles();
 bindHelp(page);
 const start=w.startApp;
 if(typeof start==='function')w.startApp=function(...args){
  const result=start.apply(this,args);
  syncStaffKpiNavigation();
  return result;
 };
 syncStaffKpiNavigation();
 const inp=document.getElementById('manager-kpi-month');
 if(inp){
  bindMonthPicker(page,inp);
  inp.addEventListener('change',()=>load());
  for(const field of [compareInput(),baseInput()])field?.addEventListener('change',()=>{
   const el=document.getElementById(ID);
   if(el&&shownKey===requestKey())void renderComparison(shown,el);
  });
 }
 page.querySelector('[data-kv-lera]')?.addEventListener('click',launchLera);
 // The page uses this stable legacy entry point. Hide the older dashboard only after this module loads.
 w.renderManagers=()=>load();try{renderManagers=w.renderManagers}catch(_){}
 if(active())load();
}
w.RESANTA_KPI360_VISUAL_V2={load:()=>load(true),planSaved:()=>load(true,true),mapped,totals,planSnapshot,salesRanking,akbRanking,summarizePeriod,monthsInRange,version:'2.1'};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})(window);
