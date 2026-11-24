/* RESANTA CRM v23.6.120 · TRIOVIST · ГРУППЫ И ДИНАМИКА
 * Read-only analytics. Server-side aggregation, lazy subgroup/SKU drilldown.
 * No polling. No MutationObserver. No writes to business data.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_GROUP_DYNAMICS_V236120)return;
const V='v23.6.125',UNASSIGNED='Не распределено',MISSING_PRICE='Нет в прайс-листе';
// Exact SKU hierarchy verified against the 1C sales cache. The 23.11.2026
// price attachment contains the first two SKUs with "Деление на 0" in column M.
const salesHierarchy=new Map([
 ['64/1/183',['Электрогенераторы','Бензиновые',true]],
 ['67/2/50',['Климатическое оборудование','Тепловентиляторы',true]],
 ['72/14/10',['Инструмент','Дрели-шуруповерты аккумуляторные',false]],
 ['72/14/31',['Инструмент','Дрели-шуруповерты аккумуляторные',false]],
 ['72/8/5',['Инструмент','Дрели',false]],
 ['72/8/9',['Инструмент','Дрели',false]]
]);
const aggregateFields=['current_revenue','basis_revenue','compare_revenue','current_qty','basis_qty','compare_qty'];
let host=null,ctx=null,meta=null,state=null,flight=null,cache=new Map(),loadEpoch=0,selection=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number(v)||0;
const money=v=>num(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const qty=v=>num(v).toLocaleString('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:3});
const pct=v=>v==null?'—':(num(v)>0?'+':'')+num(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
function dbx(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
async function rpc(n,a={}){const d=dbx();if(!d)throw Error('Соединение с базой ещё не готово');const r=await d.rpc(n,a);if(r.error)throw r.error;return r.data||{}}
function ymAdd(ym,delta){const [y,m]=String(ym).split('-').map(Number),d=new Date(Date.UTC(y,m-1+delta,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`}
function ymDate(ym){return String(ym||'').slice(0,7)+'-01'}
function monthsBetween(a,b){const [ay,am]=a.split('-').map(Number),[by,bm]=b.split('-').map(Number);return (by-ay)*12+(bm-am)+1}
function defaultState(){const end=meta?.last_month||new Date().toISOString().slice(0,7);return{manager:'',quick:'month',from:end,to:end,compareMode:'year',cfrom:ymAdd(end,-12),cto:ymAdd(end,-12),sort:'revenue',groups:[],projection:null,lastImport:null}}
const MONTHS=['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
const PRESETS=[['month','Месяц'],['prevmonth','Прошлый месяц'],['quarter','Квартал'],['year','Год']];
const monthLabel=ym=>MONTHS[Number(ym.slice(5,7))-1]+' '+ym.slice(0,4);
const rangeLabel=(from,to)=>from===to?monthLabel(from):monthLabel(from)+' — '+monthLabel(to);
const validMonth=v=>/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const q=s=>host?.querySelector(s);
function css(){
 if(document.getElementById('trgd120-css-v5'))return;
 const s=document.createElement('style');s.id='trgd120-css-v5';s.textContent=`
.trgd{color:var(--text);font-size:14px}
.trgd *{box-sizing:border-box}
.trgd-head,.trgd-tools,.trgd-manager-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.trgd-head{position:relative;margin-bottom:14px}
.trgd-head h3{margin:0;font-size:24px;line-height:1.2;font-weight:700;letter-spacing:-.4px}
.trgd-note,.trgd-field label,.trgd-field>span,.trgd-kpi span,.trgd-kpi small,.trgd-sub,.trgd-metric small,.trgd-loading,.trgd-empty{color:var(--sub);font-size:13px;line-height:1.45}
.trgd button,.trgd select{min-height:38px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);font:inherit}
.trgd button{cursor:pointer}
.trgd button:not(:disabled):hover{background:var(--bg)}
.trgd :is(button,select,summary):focus-visible{outline:3px solid var(--a);outline-offset:2px}
.trgd button:disabled{opacity:.45;cursor:default}
.trgd button:is(.trgd-apply,.trgd-retry){background:var(--a);border-color:var(--a);color:#fff;font-weight:600}
.trgd button:is(.trgd-apply,.trgd-retry):not(:disabled):hover{background:var(--at)}
.trgd-help{display:inline-flex}
.trgd-help button{width:28px;min-height:28px;padding:0;color:var(--a);font-size:18px;font-weight:700}
.trgd-tooltip{display:none;position:absolute;inset-block-start:100%;inset-inline-start:0;z-index:4;width:min(330px,100%);padding:10px 12px;border:1px solid var(--border);border-radius:8px;background:var(--card);box-shadow:0 4px 14px #11182720;font-size:13px;line-height:1.55}
.trgd-help:is(:hover,:focus-within) .trgd-tooltip{display:block}
.trgd-tooltip p{margin:0}
.trgd-tooltip p{margin-top:6px;color:var(--sub)}
.trgd-controls{display:flex;align-items:end;flex-wrap:wrap;gap:10px;margin:12px 0;padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:12px}
.trgd-field{flex:1 1 140px;min-width:0;display:grid;gap:5px}
.trgd-field.range{flex-basis:175px}
.trgd-field :is(select,button){width:100%;min-width:0;min-height:42px;text-align:left}
.trgd-field .trgd-period-button{color:var(--a)}
.trgd .trgd-apply{min-height:42px}
.trgd-dialog{margin:auto;width:min(560px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;padding:18px;border:1px solid var(--border);border-radius:12px;background:var(--card);color:var(--text)}
.trgd-dialog::backdrop{background:#11182766}
.trgd-dialog h4{margin:0;font-size:18px}
.trgd-period-preview{margin:8px 0 3px;color:var(--a);font-weight:650}
.trgd-calendar-nav,.trgd-calendar-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.trgd-calendar-nav{margin:12px 0 8px}
.trgd-calendar-footer{justify-content:flex-end;margin-top:14px}
.trgd-years{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.trgd-year h5{margin:4px 0 8px;text-align:center;font-size:15px}
.trgd-months{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px}
.trgd-months button{padding:7px 3px}
.trgd button:is(.on,[aria-pressed="true"]){background:var(--ab);color:var(--at);border-color:var(--a);font-weight:600}
.trgd button[data-trgd-month].edge{background:var(--a);color:#fff}
.trgd-presets{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}
.trgd-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(185px,100%),1fr));gap:10px;margin:12px 0}
.trgd-kpi,.trgd-chart,.trgd-details,.trgd-manager{min-width:0;border:1px solid var(--border);border-radius:12px;background:var(--card);padding:14px}
.trgd-kpi-label{position:relative;display:flex;align-items:center;justify-content:space-between;gap:8px}
.trgd-kpi-label .trgd-tooltip{inset-block-start:auto;inset-block-end:100%;inset-inline:auto 0;color:var(--text)}
.trgd-kpi b{display:block;font-size:clamp(18px,1.65vw,25px);font-weight:650;margin-top:7px;overflow-wrap:anywhere}
.trgd-kpi b,.trgd-cell,.trgd-chart-value{font-variant-numeric:tabular-nums}
.trgd-pos{color:var(--g)}.trgd-neg{color:var(--r)}.trgd-neutral{color:var(--sub)}
.trgd-chart,.trgd-details{margin:12px 0}
.trgd-chart h4{margin:0;font-size:17px;font-weight:650}
.trgd-chart h4{margin-bottom:8px}
.trgd-tools{margin:12px 0}
.trgd button.trgd-change-row,.trgd-change-head{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(60px,2fr) minmax(120px,1fr);gap:12px;align-items:center;width:100%;text-align:left}
.trgd-change-head{color:var(--sub);font-size:13px;padding:4px 10px}
.trgd-change-scale{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:6px}
.trgd-change-scale b{font-weight:500}
.trgd-change-scale b:last-child{text-align:right}
.trgd button.trgd-change-row{border:0;border-radius:0;border-top:1px solid var(--border);padding:8px 10px}
.trgd-change-name{overflow-wrap:anywhere}
.trgd-change-name small,.trgd-chart-value small{display:block;margin-top:2px;color:var(--sub);font-size:12px}
.trgd-change-track{position:relative;min-width:0;height:15px;border-radius:4px;background:var(--bg)}
.trgd-change-track::after{position:absolute;inset-block:0;inset-inline-start:50%;width:1px;background:var(--sub);content:""}
.trgd-change-fill{position:absolute;inset-block:2px;inline-size:var(--trgd-bar);border-radius:3px;background:var(--g)}
.trgd-change-fill.up{inset-inline-start:50%}
.trgd-change-fill.down{inset-inline-end:50%;background:var(--r)}
.trgd-chart-value{text-align:right;overflow-wrap:anywhere}
.trgd-chart-value b{font-weight:650}
.trgd-details summary{cursor:pointer;font-weight:650;color:var(--a);padding:4px 0}
.trgd-details summary .close,.trgd-details[open] summary .open{display:none}
.trgd-details[open] summary .close{display:inline}
#main-content:has(#page-triovist.active):has(#tr14-shell [data-tr14="groups"].on){overflow:visible}
.trgd-manager{margin:10px 0;padding:0;overflow:clip}
.trgd-manager-title{justify-content:space-between;margin:0;padding:10px 12px;background:var(--bg);font-weight:650}
.trgd-row{display:grid;grid-template-columns:minmax(0,2fr) repeat(2,minmax(0,1fr)) minmax(0,1.15fr) minmax(0,.6fr);gap:10px;align-items:center;padding:10px 12px;border-top:1px solid var(--border)}
.trgd-table-head{position:sticky;top:calc(56px + var(--safe-top,0px));z-index:1;font-size:13px;color:var(--sub);background:var(--bg);box-shadow:0 1px var(--border)}
.trgd-row :is(.trgd-cell,.trgd-table-number){text-align:right;min-width:0;overflow-wrap:anywhere}
.trgd-row .trgd-cell b{font-weight:650}
.trgd-row .trgd-delta-pct{display:block;font-size:12px}
.trgd-cell-label{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.trgd-row[data-trgd-group]{scroll-margin-top:calc(100px + var(--safe-top,0px))}
.trgd-main,.trgd-name{min-width:0;overflow-wrap:anywhere}
.trgd-name{font-weight:650}
.trgd button.trgd-expand{display:flex;align-items:baseline;gap:6px;min-height:24px;border:0;background:transparent;text-align:left;padding:0;font-weight:650}
.trgd-expand:hover{text-decoration:underline}
.trgd-expand[aria-expanded="true"] .trgd-arrow{transform:rotate(90deg)}
.trgd-nested{box-shadow:inset 3px 0 var(--ab);background:var(--bg)}
.trgd-nested .trgd-main{padding-inline-start:8px}
.trgd-nested.sku .trgd-main{padding-inline-start:16px}
.trgd-loading,.trgd-empty,.trgd-error{padding:12px}
.trgd-error{border:1px solid var(--r);background:var(--rb);color:var(--r);border-radius:10px}
.trgd-badge{display:inline-block;padding:2px 6px;border-radius:6px;margin-left:5px;background:var(--amb);color:var(--am);font-size:12px}
.trgd-arrow{display:inline-block;width:16px;color:var(--sub)}
@media(max-width:820px){.trgd-row{grid-template-columns:repeat(2,minmax(0,1fr))}.trgd-table-head{display:none}.trgd-main{grid-column:1/-1}.trgd-row .trgd-cell{text-align:left}.trgd-cell-label{position:static;display:block;width:auto;height:auto;clip-path:none;color:var(--sub);font-size:12px}}
@media(max-width:600px){.trgd button.trgd-change-row,.trgd-change-head{grid-template-columns:minmax(0,1fr) minmax(85px,auto);gap:6px}.trgd-change-track{grid-column:1/-1;grid-row:2}.trgd-change-scale{display:none}}
`;document.head.appendChild(s)
}
function managerOptions(){const full=meta?.access==='full',list=meta?.managers||[];if(!full&&list.length===1)return `<option value="${esc(list[0].email)}">${esc(list[0].name)}</option>`;return `<option value="">Все менеджеры</option>`+list.map(x=>`<option value="${esc(x.email)}">${esc(x.name)}</option>`).join('')}
function renderShell(){
 css();state=state||defaultState();
 host.innerHTML='<div class="trgd trgd-v2">'+
  '<div class="trgd-head"><h3>Группы и категории</h3><div class="trgd-help"><button type="button" aria-label="О разделе и данных" aria-describedby="trgd-source-tooltip">*</button>'+
  '<div class="trgd-tooltip" id="trgd-source-tooltip" role="tooltip"><span>Где меняется оборот, что проверить менеджерам и какие SKU дают основной результат.</span><p data-trgd-status>Загружаю…</p></div></div></div>'+
  '<div class="trgd-controls">'+
  '<div class="trgd-field"><label for="trgd-manager">Менеджер</label><select id="trgd-manager" data-trgd-manager '+(meta?.access==='full'?'':'disabled')+'>'+managerOptions()+'</select></div>'+
  '<div class="trgd-field range"><span id="trgd-range-label">Период</span><button class="trgd-period-button" type="button" data-trgd-open-period="main" aria-haspopup="dialog" aria-labelledby="trgd-range-label trgd-main-range"><span id="trgd-main-range"></span></button></div>'+
  '<div class="trgd-field"><label for="trgd-compare-mode">Сравнить с</label><select id="trgd-compare-mode" data-trgd-compare-mode><option value="year">Год назад</option><option value="previous">Предыдущий период</option><option value="custom">Свой период</option></select></div>'+
  '<div class="trgd-field range"><span id="trgd-compare-label">Диапазон сравнения</span><button class="trgd-period-button" type="button" data-trgd-open-period="compare" aria-haspopup="dialog" aria-labelledby="trgd-compare-label trgd-compare-range"><span id="trgd-compare-range"></span></button></div>'+
  '<button type="button" class="trgd-apply" data-trgd-apply>Показать</button>'+
  '<input type="hidden" data-trgd-quick><input type="hidden" data-trgd-from><input type="hidden" data-trgd-to><input type="hidden" data-trgd-cfrom><input type="hidden" data-trgd-cto></div>'+
  '<dialog class="trgd-dialog" data-trgd-dialog aria-labelledby="trgd-dialog-title"></dialog>'+
  '<div data-trgd-message role="status"></div><div data-trgd-kpis></div>'+
  '<section class="trgd-chart" aria-labelledby="trgd-chart-title"><h4 id="trgd-chart-title">Изменение продаж по группам</h4>'+
  '<div data-trgd-graph></div></section>'+
  '<details class="trgd-details" data-trgd-details><summary><span class="open">Показать детализацию по группам, подгруппам и SKU</span><span class="close">Скрыть детализацию</span></summary>'+
  '<div class="trgd-tools"><label class="trgd-note" for="trgd-sort-v2">Сортировка таблицы</label><select id="trgd-sort-v2" data-trgd-sort><option value="revenue">По продажам</option><option value="growth">По росту %</option><option value="fall">По падению %</option><option value="delta">По разнице BYN</option><option value="qty">По количеству</option></select></div><div data-trgd-list></div></details></div>';
 const set=(q,v)=>{const e=host.querySelector(q);if(e)e.value=v};
 set('[data-trgd-manager]',state.manager);set('[data-trgd-quick]',state.quick);set('[data-trgd-from]',state.from);set('[data-trgd-to]',state.to);
 set('[data-trgd-compare-mode]',state.compareMode);set('[data-trgd-cfrom]',state.cfrom);set('[data-trgd-cto]',state.cto);set('[data-trgd-sort]',state.sort);
 bind();updateRangeLabels();
}
function presetRange(quick){
 const end=meta?.last_month||state.to;
 if(quick==='prevmonth'){const previous=ymAdd(end,-1);return [previous,previous]}
 if(quick==='quarter'){const quarter=Math.floor((Number(end.slice(5,7))-1)/3)*3+1;return [end.slice(0,4)+'-'+String(quarter).padStart(2,'0'),end]}
 if(quick==='year')return [end.slice(0,4)+'-01',end];
 return [end,end];
}
function compareRange(from,to,mode){
 if(mode==='year')return [ymAdd(from,-12),ymAdd(to,-12)];
 return [ymAdd(from,-monthsBetween(from,to)),ymAdd(from,-1)];
}
function readRange(compare){
 return compare?[q('[data-trgd-cfrom]').value,q('[data-trgd-cto]').value]:[q('[data-trgd-from]').value,q('[data-trgd-to]').value];
}
function writeRange(compare,from,to){
 const [a,b]=compare?['cfrom','cto']:['from','to'];
 q('[data-trgd-'+a+']').value=from;q('[data-trgd-'+b+']').value=to;
}
function updateRangeLabels(){
 for(const [selector,compare] of [['#trgd-main-range',false],['#trgd-compare-range',true]]){
  const label=q(selector);if(label)label.textContent=rangeLabel(...readRange(compare));
 }
}
function syncComparison(){
 const mode=q('[data-trgd-compare-mode]').value;
 if(mode!=='custom')writeRange(true,...compareRange(...readRange(false),mode));
 updateRangeLabels();
}
function readControls(){
 const [from,to]=readRange(false),[cfrom,cto]=readRange(true);
 if(![from,to,cfrom,cto].every(validMonth)||from>to||cfrom>cto)return false;
 Object.assign(state,{manager:q('[data-trgd-manager]').value,quick:q('[data-trgd-quick]').value,from,to,
  compareMode:q('[data-trgd-compare-mode]').value,cfrom,cto,sort:q('[data-trgd-sort]').value});
 updateRangeLabels();
 return true;
}
function paintCalendar(focusMonth){
 const dialog=q('[data-trgd-dialog]'),{compare,from,to,year}=selection;
 const grid=y=>'<section class="trgd-year"><h5>'+y+'</h5><div class="trgd-months">'+MONTHS.map((month,i)=>{
  const ym=y+'-'+String(i+1).padStart(2,'0'),inside=ym>=from&&ym<=to;
  return '<button type="button" data-trgd-month="'+ym+'" aria-label="'+monthLabel(ym)+'" aria-pressed="'+inside+'"'+(ym===from||ym===to?' class="edge"':'')+'>'+month+'</button>';
 }).join('')+'</div></section>';
 dialog.innerHTML='<h4 id="trgd-dialog-title">'+(compare?'Выберите период сравнения':'Выберите период')+'</h4>'+
  '<p class="trgd-period-preview" aria-live="polite">'+rangeLabel(from,to)+'</p>'+
  '<div class="trgd-note">'+(selection.anchor?'Выберите последний месяц или подтвердите один месяц.':'Нажмите на первый и последний месяцы диапазона.')+'</div>'+
  '<div class="trgd-calendar-nav"><button type="button" data-trgd-year="-1" aria-label="Предыдущий год">‹</button><button type="button" data-trgd-year="1" aria-label="Следующий год">›</button></div>'+
  '<div class="trgd-years">'+grid(year)+grid(year+1)+'</div>'+
  (compare?'':'<div class="trgd-presets">'+PRESETS.map(([key,label])=>'<button type="button" data-trgd-preset="'+key+'">'+label+'</button>').join('')+'</div>')+
  '<div class="trgd-calendar-footer"><form method="dialog"><button type="submit">Отмена</button></form><button type="button" class="trgd-apply" data-trgd-period-confirm>Выбрать</button></div>';
 if(focusMonth)dialog.querySelector('[data-trgd-month="'+focusMonth+'"]')?.focus();
}
function openCalendar(compare){
 const [from,to]=readRange(compare),latest=Number((meta?.last_month||state.to).slice(0,4));
 selection={compare,from,to,year:Math.min(Number(from.slice(0,4)),latest-1),anchor:'',quick:compare?'custom':q('[data-trgd-quick]').value};
 paintCalendar();
 const dialog=q('[data-trgd-dialog]');dialog.showModal();
 dialog.querySelector('[data-trgd-month="'+from+'"]')?.focus();
}
function selectCalendarMonth(ym){
 const anchor=selection.anchor;
 const [from,to]=anchor?[anchor,ym].sort():[ym,ym];
 Object.assign(selection,{from,to,anchor:anchor?'':ym,quick:'custom'});
 paintCalendar(ym);
}
function bind(){
 host.onclick=e=>{
  const opener=e.target.closest('[data-trgd-open-period]');
  if(opener){openCalendar(opener.dataset.trgdOpenPeriod==='compare');return}
  const month=e.target.closest('[data-trgd-month]');
  if(month){selectCalendarMonth(month.dataset.trgdMonth);return}
  const year=e.target.closest('[data-trgd-year]');
  if(year){
   const direction=year.dataset.trgdYear;
   selection.year=Math.min(9998,Math.max(1000,selection.year+Number(direction)));
   paintCalendar();q('[data-trgd-year="'+direction+'"]')?.focus();return;
  }
  const preset=e.target.closest('[data-trgd-preset]');
  if(preset){
   const quick=preset.dataset.trgdPreset,[from,to]=presetRange(quick);
   Object.assign(selection,{from,to,quick,year:Number(from.slice(0,4))-1,anchor:''});
   paintCalendar(from);return;
  }
  if(e.target.closest('[data-trgd-period-confirm]')){
   const {compare,from,to,quick}=selection;
   writeRange(compare,from,to);
   if(compare)q('[data-trgd-compare-mode]').value='custom';
   else q('[data-trgd-quick]').value=quick;
   syncComparison();q('[data-trgd-dialog]').close();return;
  }
  e.target.closest('.trgd-help button')?.focus();
  const a=e.target.closest('[data-trgd-apply]');
  if(a){
   if(readControls()){cache.clear();loadGroups(true)}
   else if(q('[data-trgd-message]'))q('[data-trgd-message]').textContent='Укажите корректные периоды.';
   return;
  }
  const direct=e.target.closest('[data-trgd-inspect]');
  if(direct){
   const box=q('[data-trgd-details]');if(!box)return;
   const row=[...host.querySelectorAll('[data-trgd-group]')].find(x=>x.dataset.manager===direct.dataset.manager&&x.dataset.trgdGroup===direct.dataset.trgdInspect);
   if(row){
    box.open=true;
    toggleGroup(row,true);
    row.querySelector('.trgd-expand')?.focus({preventScroll:true});
    row.scrollIntoView?.({block:'nearest'});
   }
   return;
  }
  const g=e.target.closest('[data-trgd-group]');if(g){toggleGroup(g);return}
  const sg=e.target.closest('[data-trgd-subgroup]');if(sg){toggleSubgroup(sg);return}
  const r=e.target.closest('[data-trgd-retry]');if(r){loadGroups(true);return}
 };
 host.onchange=e=>{
  if(e.target.matches('[data-trgd-compare-mode]'))syncComparison();
  else if(e.target.matches('[data-trgd-sort]')){state.sort=e.target.value;if(!flight)renderGroups()}
 };
}
function signature(){return [state.manager,state.from,state.to,state.cfrom,state.cto].join('|')}
async function getLevel(level,manager,group=null,subgroup=null){const key=[signature(),level,manager||'',group||'',subgroup||''].join('¦');if(cache.has(key))return cache.get(key);const p=rpc('triovist_group_dynamics_v1',{p_from_month:ymDate(state.from),p_to_month:ymDate(state.to),p_compare_from_month:ymDate(state.cfrom),p_compare_to_month:ymDate(state.cto),p_manager_email:manager||null,p_level:level,p_group:group,p_subgroup:subgroup});cache.set(key,p);try{const d=await p;cache.set(key,d);return d}catch(e){cache.delete(key);throw e}}
function classifyUnmatchedSku(row){
 const hierarchy=salesHierarchy.get(row.sku);
 if(!hierarchy||row.catalog_match!==false||row.group!==UNASSIGNED||row.subgroup!==MISSING_PRICE)return row;
 const [group,subgroup,sourcePriceError]=hierarchy;
 return {...row,group,subgroup,sourcePriceError};
}
function periodSku(row){return num(row.current_qty)!==0||num(row.current_revenue)!==0?1:0}
function correctedAggregates(rows,corrections,level,manager=null,group=null){
 if(!corrections.length)return rows;
 const isSubgroup=level==='subgroup';
 const key=(email,groupName,subgroup)=>JSON.stringify([email||'',groupName,isSubgroup?subgroup:null]);
 const result=new Map(rows.map(row=>[key(row.manager_email,row.group,row.subgroup),row]));
 const changed=new Set();
 for(const sku of corrections){
  if(manager&&sku.manager_email!==manager)continue;
  for(const [groupName,subgroup,direction] of [[UNASSIGNED,MISSING_PRICE,-1],[sku.group,sku.subgroup,1]]){
   if(isSubgroup&&groupName!==group)continue;
   const id=key(sku.manager_email,groupName,subgroup),original=result.get(id);
   if(!original&&direction<0)continue;
   const row={...original,manager_email:sku.manager_email,manager_name:sku.manager_name,group:groupName};
   if(isSubgroup)row.subgroup=subgroup;
   for(const field of aggregateFields){
    const precision=field.endsWith('_qty')?3:2;
    row[field]=Number((num(original?.[field])+direction*num(sku[field])).toFixed(precision));
   }
   row.sku_count=Math.max(0,num(original?.sku_count)+direction*periodSku(sku));
   row.delta_revenue=Number((row.basis_revenue-row.compare_revenue).toFixed(2));
   row.growth_pct=row.compare_revenue?Number(((row.basis_revenue/row.compare_revenue-1)*100).toFixed(2)):null;
   result.set(id,row);changed.add(id);
  }
 }
 return [...result].filter(([id,row])=>!changed.has(id)||row.sku_count||aggregateFields.some(field=>row[field])).map(([,row])=>row);
}
async function loadClassifications(rows){
 if(!rows.some(row=>row.group===UNASSIGNED))return [];
 try{
  const data=await getLevel('sku',state.manager||null,UNASSIGNED,MISSING_PRICE);
  return (data.items||[]).flatMap(row=>{
   const classified=classifyUnmatchedSku(row);
   return classified===row?[]:[classified];
  });
 }catch(e){console.warn('Triovist SKU classification',e);return []}
}
function correctedDetails(rows,level,manager,group,subgroup){
 const corrections=state.corrections||[];
 if(level==='subgroup')return correctedAggregates(rows,corrections,level,manager,group);
 const scoped=corrections.filter(row=>(!manager||row.manager_email===manager)&&
  (group===UNASSIGNED&&subgroup===MISSING_PRICE||row.group===group&&row.subgroup===subgroup));
 const moved=new Set(scoped.map(row=>row.manager_email+'|'+row.sku));
 return [...rows.filter(row=>!moved.has(row.manager_email+'|'+row.sku)),...scoped.filter(row=>row.group===group&&row.subgroup===subgroup)]
  .sort((a,b)=>num(b.current_revenue)-num(a.current_revenue)||String(a.sku).localeCompare(String(b.sku)));
}
async function loadGroups(force=false){
 if(flight&&!force)return flight;
 for(const name of ['list','graph','kpis']){const section=q('[data-trgd-'+name+']');if(section)section.innerHTML=''}
 const graph=q('[data-trgd-graph]');if(graph)graph.innerHTML='<div class="trgd-loading" role="status">Загружаю продажи по группам…</div>';
 const status=q('[data-trgd-status]');if(status)status.textContent='Обновляю аналитику…';
 const message=q('[data-trgd-message]');if(message)message.textContent='';
 const request=++loadEpoch;
 flight=(async()=>{
  const d=await getLevel('group',state.manager||null);
  if(request!==loadEpoch)return;
  const rows=Array.isArray(d.items)?d.items:[];
  const corrections=await loadClassifications(rows);
  if(request!==loadEpoch)return;
  state.corrections=corrections;
  state.groups=correctedAggregates(rows,corrections,'group');
  state.projection=d.projection||null;
  state.lastImport=d.last_import||null;
  renderKpis();renderChart();renderGroups();renderStatus();
 })().catch(e=>{if(request===loadEpoch)showError(e)}).finally(()=>{if(request===loadEpoch)flight=null});
 return flight;
}
function renderStatus(){
 const e=host?.querySelector('[data-trgd-status]');if(!e)return;
 const p=state.projection||{},li=state.lastImport||{};
 const fact=p.active?'Факт 1С по '+(p.as_of||'текущую дату')+' · прогноз отдельно':'Закрытый/полный период';
 e.textContent=rangeLabel(state.from,state.to)+' · '+fact+(li.month?' · Месяц загрузки 1С: '+li.month:'');
}
function visibleRows(){
 const rows=Array.isArray(state.groups)?state.groups:[];
 const manager=(ctx?.is_manager||meta?.access!=='full')?ctx?.email:state.manager;
 const email=String(manager||'').trim().toLowerCase();
 return email?rows.filter(r=>String(r.manager_email||'').trim().toLowerCase()===email):rows;
}
const signedMoney=v=>v==null?'—':(num(v)>0?'+':'')+money(v);
function kpi(key,title,value,details,color=''){
 const id='trgd-kpi-'+key;
 return '<div class="trgd-kpi"><div class="trgd-kpi-label"><span>'+esc(title)+'</span>'+
  '<div class="trgd-help"><button type="button" aria-label="'+esc('Подробнее: '+title)+'" aria-describedby="'+id+'">*</button>'+
  '<div class="trgd-tooltip" id="'+id+'" role="tooltip">'+esc(details)+'</div></div></div>'+
  '<b class="'+color+'">'+esc(value)+'</b></div>';
}
function renderKpis(){
 const e=q('[data-trgd-kpis]');if(!e)return;
 const a=visibleRows().reduce((total,r)=>{
  total.fact+=num(r.current_revenue);total.basis+=num(r.basis_revenue);total.comp+=num(r.compare_revenue);return total;
 },{fact:0,basis:0,comp:0});
 const forecast=!!state.projection?.active,delta=(forecast?a.basis:a.fact)-a.comp,p=a.comp?delta/a.comp*100:null;
 const selected=rangeLabel(state.from,state.to),reference=rangeLabel(state.cfrom,state.cto);
 const cutoff=forecast&&state.projection.as_of?' по '+state.projection.as_of:'';
 e.innerHTML='<div class="trgd-kpis">'+
  kpi('sales','Продажи периода',money(a.fact),selected+' · подтверждённые продажи 1С'+cutoff)+
  (forecast?kpi('forecast','Прогноз периода',money(a.basis),selected+' · оценка продаж к концу периода по текущему темпу'):'')+
  kpi('compare','Сравнение',money(a.comp),'Сравниваемый период · '+reference)+
  kpi('delta',forecast?'Изменение по прогнозу':'Изменение',pct(p),signedMoney(delta)+' · '+(forecast?'предварительная разница к сравниваемому периоду':'разница по факту к сравниваемому периоду'),growthClass(p))+
  '</div>';
}
function renderChart(){
 const e=q('[data-trgd-graph]');if(!e)return;
 const rows=[...visibleRows()].sort((a,b)=>Math.abs(num(b.delta_revenue))-Math.abs(num(a.delta_revenue)));
 const title=q('#trgd-chart-title');
 if(title)title.textContent=state.projection?.active?'Изменение продаж по группам · прогноз':'Изменение продаж по группам';
 if(!rows.length){e.innerHTML='<div class="trgd-empty">Нет групп по выбранному фильтру.</div>';return}
 const max=Math.max(1,...rows.map(r=>Math.abs(num(r.delta_revenue))));
 e.innerHTML='<div class="trgd-change-head" aria-hidden="true"><span>Товарная группа</span><div class="trgd-change-scale"><b>Падение</b><b>0</b><b>Рост</b></div><span class="trgd-chart-value">Изменение</span></div>'+
  rows.map(r=>{
   const diff=num(r.delta_revenue),side=diff<0?'down':'up',length=(Math.abs(diff)/max*50).toFixed(2)+'%';
   return '<button type="button" class="trgd-change-row" data-trgd-inspect="'+encodeURIComponent(r.group||'')+'" data-manager="'+encodeURIComponent(r.manager_email||'')+'">'+
    '<span class="trgd-change-name">'+esc(r.group||'Без группы')+(state.manager||!r.manager_name?'':'<small>'+esc(r.manager_name)+'</small>')+'</span>'+
    '<span class="trgd-change-track" aria-hidden="true">'+(diff?'<span class="trgd-change-fill '+side+'" style="--trgd-bar:'+length+'"></span>':'')+'</span>'+
    '<span class="trgd-chart-value"><b class="'+growthClass(r.delta_revenue)+'">'+signedMoney(r.delta_revenue)+'</b><small>'+pct(r.growth_pct)+'</small></span></button>';
  }).join('');
}
function sortedRows(){
 const rows=[...visibleRows()];
 const sort=state.sort||'revenue';
 if(sort==='growth')rows.sort((a,b)=>num(b.growth_pct)-num(a.growth_pct));
 else if(sort==='fall')rows.sort((a,b)=>num(a.growth_pct)-num(b.growth_pct));
 else if(sort==='delta')rows.sort((a,b)=>Math.abs(num(b.delta_revenue))-Math.abs(num(a.delta_revenue)));
 else if(sort==='qty')rows.sort((a,b)=>num(b.current_qty)-num(a.current_qty));
 else rows.sort((a,b)=>num(b.current_revenue)-num(a.current_revenue));
 return rows;
}
function growthClass(v){return v==null?'trgd-neutral':num(v)>0?'trgd-pos':num(v)<0?'trgd-neg':'trgd-neutral'}
const DETAIL_LABELS=['Группа, подгруппа или SKU','Продажи, BYN','Сравнение, BYN','Изменение','Штук'];
function detailCells(r){
 const cell=(label,value)=>'<div class="trgd-cell"><small class="trgd-cell-label">'+label+'</small>'+value+'</div>';
 const amount=v=>'<b>'+money(v).replace(' BYN','')+'</b>';
 const delta='<b class="'+growthClass(r.delta_revenue)+'">'+signedMoney(r.delta_revenue)+'</b>'+
  '<span class="trgd-delta-pct '+growthClass(r.growth_pct)+'">'+pct(r.growth_pct)+'</span>';
 return cell(DETAIL_LABELS[1],amount(r.current_revenue))+cell(DETAIL_LABELS[2],amount(r.compare_revenue))+
  cell(DETAIL_LABELS[3],delta)+cell(DETAIL_LABELS[4],'<b>'+qty(r.current_qty)+'</b>');
}
function drillRow(r,manager,group){
 const subgroup=group!==undefined;
 const m=encodeURIComponent(manager||''),g=encodeURIComponent((subgroup?group:r.group)||''),sub=encodeURIComponent(r.subgroup||'');
 const attrs=subgroup?'data-trgd-subgroup="'+sub+'" data-group="'+g+'"':'data-trgd-group="'+g+'"';
 const child=subgroup?'data-trgd-skuhost="'+m+'|'+g+'|'+sub+'"':'data-trgd-subhost="'+m+'|'+g+'"';
 const name=subgroup?(r.subgroup||'Прочее'):(r.group||'Без группы');
 return '<div class="trgd-row" '+attrs+' data-manager="'+m+'"><div class="trgd-main">'+
  '<button type="button" class="trgd-expand" aria-expanded="false"><span class="trgd-arrow" aria-hidden="true">▸</span>'+esc(name)+'</button>'+
  '<div class="trgd-sub">'+qty(r.sku_count)+' SKU</div></div>'+detailCells(r)+'</div>'+
  '<div class="trgd-nested'+(subgroup?' sku':'')+'" '+child+' hidden></div>';
}
function renderGroups(){
 const e=q('[data-trgd-list]');if(!e)return;
 const rows=sortedRows();
 if(!rows.length){e.innerHTML='<div class="trgd-empty">По выбранному фильтру данных нет.</div>';return}
 const by=new Map();
 for(const r of rows){
  const key=r.manager_email||'';
  if(!by.has(key))by.set(key,{name:r.manager_name||'Не распределено',rows:[]});
  by.get(key).rows.push(r);
 }
 const head='<div class="trgd-row trgd-table-head">'+DETAIL_LABELS.map((label,i)=>'<span'+(i?' class="trgd-table-number"':'')+'>'+label+'</span>').join('')+'</div>';
 e.innerHTML=[...by.entries()].map(([manager,bucket])=>'<div class="trgd-manager"><div class="trgd-manager-title"><span>'+esc(bucket.name)+'</span><span>'+
  money(bucket.rows.reduce((sum,r)=>sum+num(r.current_revenue),0))+'</span></div>'+head+
  bucket.rows.map(r=>drillRow(r,manager)).join('')+'</div>').join('');
}
function toggleGroup(row,show=false){
 const {manager,trgdGroup}=row.dataset;
 return toggleDrill(row,'subgroup',manager,trgdGroup,undefined,show);
}
function toggleSubgroup(row){
 const {manager,group,trgdSubgroup}=row.dataset;
 return toggleDrill(row,'sku',manager,group,trgdSubgroup);
}
async function toggleDrill(row,level,managerEnc,groupEnc,subEnc,show=false){
 const box=row.nextElementSibling;if(!box)return;
 const button=row.querySelector('.trgd-expand'),isSku=level==='sku';
 const open=show||box.hidden;
 box.hidden=!open;
 button?.setAttribute('aria-expanded',String(open));
 if(!open||box.dataset.loaded||box.dataset.loading)return;
 const manager=decodeURIComponent(managerEnc||''),group=decodeURIComponent(groupEnc||'');
 const subgroup=isSku?decodeURIComponent(subEnc||''):null;
 box.dataset.loading='1';
 box.innerHTML='<div class="trgd-loading">Загружаю '+(isSku?'SKU':'подгруппы')+'…</div>';
 try{
  const d=await getLevel(level,manager||null,group,subgroup);
  if(box.isConnected===false)return;
  const rows=correctedDetails(Array.isArray(d.items)?d.items:[],level,manager,group,subgroup);
  box.dataset.loaded='1';
  box.innerHTML=rows.length?(isSku?rows.map(skuRow):rows.map(r=>drillRow(r,manager,group))).join(''):
   '<div class="trgd-empty">'+(isSku?'SKU нет.':'Подгрупп нет.')+'</div>';
 }catch(e){box.innerHTML='<div class="trgd-error">'+esc(e?.message||e)+'</div>'}
 finally{delete box.dataset.loading}
}
function skuRow(r){
 const catalog=r.sourcePriceError?'<span class="trgd-badge" title="Прайс 1С от 23.11.2026, Мелкий опт 2 с НДС: Деление на 0">Цена не выгружена</span>':
  r.catalog_match===false?'<span class="trgd-badge">нет в прайс-листе</span>':'';
 return '<div class="trgd-row"><div class="trgd-main"><div class="trgd-name">'+esc(r.product||r.sku||'—')+'</div><div class="trgd-sub">SKU '+esc(r.sku||'—')+catalog+'</div></div>'+detailCells(r)+'</div>';
}
function showError(e){
 if(state){state.groups=[];state.projection=null}
 const area=q('[data-trgd-graph]')||q('[data-trgd-list]');
 if(area)area.innerHTML='<div class="trgd-error"><b>Группы и динамика не загрузились.</b><br>'+esc(e?.message||e)+'<br><button type="button" class="trgd-retry" data-trgd-retry>Повторить</button></div>';
 const status=q('[data-trgd-status]');if(status)status.textContent='Не удалось загрузить отчёт';
 console.error('TRIOVIST GROUP DYNAMICS '+V,e);
}
async function open(nextHost,nextCtx){host=nextHost||host;ctx=nextCtx||ctx;if(!host)return false;try{if(!meta)meta=await rpc('triovist_group_dynamics_context_v1');if(!state){state=defaultState();if(meta?.access!=='full'&&meta?.managers?.[0])state.manager=meta.managers[0].email}renderShell();await loadGroups(true);return true}catch(e){if(host){css();host.innerHTML='<div class="trgd"><div data-trgd-list></div></div>';showError(e)}return false}}
async function refresh(){if(!host)return false;cache.clear();meta=await rpc('triovist_group_dynamics_context_v1');return loadGroups(true)}
window.RESANTA_TRIOVIST_GROUP_DYNAMICS_V236120=Object.freeze({version:V,open,refresh,classifyUnmatchedSku,readOnlySnapshot:()=>({groups:[...(state?.groups||[])],projection:state?.projection||null,from:state?.from||'',to:state?.to||''}),readOnly:true,noPolling:true,noMutationObserver:true,serverAggregated:true,lazyDrilldown:true});
})();
