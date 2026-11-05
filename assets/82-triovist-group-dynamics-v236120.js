/* RESANTA CRM v23.6.120 · TRIOVIST · ГРУППЫ И ДИНАМИКА
 * Read-only analytics. Server-side aggregation, lazy subgroup/SKU drilldown.
 * No polling. No MutationObserver. No writes to business data.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_GROUP_DYNAMICS_V236120)return;
const V='v23.6.121';
let host=null,ctx=null,meta=null,state=null,flight=null,cache=new Map(),loadEpoch=0;
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
function defaultState(){const end=meta?.last_month||new Date().toISOString().slice(0,7);return{manager:'',quick:'month',from:end,to:end,compareMode:'year',cfrom:ymAdd(end,-12),cto:ymAdd(end,-12),view:'all',sort:'revenue',groups:[],projection:null,classification:null,lastImport:null}}
function css(){if(document.getElementById('trgd120-css-v2'))return;const s=document.createElement('style');s.id='trgd120-css-v2';s.textContent=`
.trgd{font-size:13px;color:#0f172a}.trgd-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}.trgd-head h3{margin:0;color:#0c447c;font-size:20px}.trgd-note{font-size:11px;color:#64748b;line-height:1.45}.trgd-status{padding:7px 10px;border-radius:9px;background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;font-size:11px}.trgd-warn{padding:9px 11px;border-radius:9px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412;margin:10px 0}.trgd-error{padding:14px;border-radius:10px;background:#fef2f2;border:1px solid #fca5a5;color:#991b1b}.trgd-controls{display:grid;grid-template-columns:180px 160px 145px 145px 180px 145px 145px auto;gap:8px;align-items:end;margin:14px 0;padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px}.trgd-field label{display:block;font-size:10px;font-weight:800;color:#64748b;margin:0 0 5px;text-transform:uppercase}.trgd-field select,.trgd-field input{width:100%;border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:8px 9px;font-size:12px;min-height:35px}.trgd-apply{border:0;border-radius:8px;background:#185fa5;color:#fff;padding:9px 14px;font-weight:800;cursor:pointer;min-height:35px}.trgd-kpis{display:grid;grid-template-columns:repeat(7,minmax(120px,1fr));gap:8px;margin:12px 0}.trgd-kpi{background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:10px;min-width:0}.trgd-kpi span{display:block;font-size:9px;text-transform:uppercase;color:#64748b}.trgd-kpi b{display:block;font-size:16px;margin-top:4px;overflow-wrap:anywhere}.trgd-kpi small{display:block;font-size:10px;color:#64748b;margin-top:3px}.trgd-pos{color:#15803d!important}.trgd-neg{color:#b91c1c!important}.trgd-neutral{color:#475569!important}.trgd-impact{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:10px 0}.trgd-impact>div{border:1px solid #e5e7eb;border-radius:10px;padding:10px;background:#fff}.trgd-impact h4{margin:0 0 7px;font-size:12px}.trgd-impact-line{display:flex;justify-content:space-between;gap:10px;padding:3px 0;font-size:11px}.trgd-tools{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:12px 0}.trgd-tools button,.trgd-tools select{border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:7px 9px;font-size:11px}.trgd-tools button.on{background:#e6f1fb;border-color:#60a5fa;color:#0c447c;font-weight:800}.trgd-manager{border:1px solid #dbe3ed;border-radius:12px;margin:10px 0;overflow:hidden;background:#fff}.trgd-manager-title{padding:10px 12px;background:#f8fafc;border-bottom:1px solid #e5e7eb;font-weight:800;color:#334155;display:flex;justify-content:space-between;gap:8px}.trgd-row{display:grid;grid-template-columns:minmax(220px,2.2fr) minmax(115px,1fr) minmax(115px,1fr) minmax(125px,1fr) minmax(90px,.7fr) minmax(80px,.6fr);gap:8px;align-items:center;padding:9px 11px;border-bottom:1px solid #eef2f7}.trgd-row:last-child{border-bottom:0}.trgd-row.clickable{cursor:pointer}.trgd-row.clickable:hover{background:#f8fbff}.trgd-main{min-width:0}.trgd-name{font-weight:800;overflow-wrap:anywhere}.trgd-sub{font-size:10px;color:#64748b;margin-top:3px}.trgd-metric small{display:block;color:#94a3b8;font-size:9px;text-transform:uppercase}.trgd-metric b{display:block;margin-top:2px}.trgd-nested{margin:0 10px 10px 30px;border-left:3px solid #dbeafe;background:#fbfdff}.trgd-nested.sku{border-left-color:#ddd6fe;margin-left:45px}.trgd-loading{padding:12px;color:#64748b;font-size:11px}.trgd-empty{padding:20px;text-align:center;color:#64748b}.trgd-badge{display:inline-block;padding:2px 6px;border-radius:999px;font-size:9px;font-weight:800;background:#e2e8f0;color:#475569;margin-left:5px}.trgd-badge.warn{background:#ffedd5;color:#9a3412}.trgd-arrow{display:inline-block;width:16px;color:#64748b}.trgd-retry{margin-top:8px;border:0;border-radius:8px;background:#185fa5;color:#fff;padding:7px 10px;font-weight:700;cursor:pointer}
@media(max-width:1200px){.trgd-controls{grid-template-columns:repeat(4,minmax(145px,1fr))}.trgd-kpis{grid-template-columns:repeat(4,1fr)}}
@media(max-width:820px){.trgd-controls{grid-template-columns:1fr 1fr}.trgd-kpis{grid-template-columns:1fr 1fr}.trgd-impact{grid-template-columns:1fr}.trgd-row{grid-template-columns:1fr 1fr}.trgd-main{grid-column:1/-1}.trgd-nested,.trgd-nested.sku{margin-left:10px}.trgd-hide-mobile{display:none}}

/* Focused single-screen groups dashboard, built into the native group module */
.trgd-v2{max-width:100%;font-size:13px;color:#243954}
.trgd-v2 .trgd-head{align-items:center;margin-bottom:12px}
.trgd-v2 .trgd-head h3{font-size:23px;color:#143d6b;letter-spacing:-.35px}
.trgd-v2 .trgd-status{max-width:100%;white-space:normal}
.trgd-v2 .trgd-controls{display:flex;flex-wrap:wrap;align-items:end;gap:9px;margin:13px 0;padding:12px;background:#f5f8fc}
.trgd-v2 .trgd-controls .trgd-field{flex:1 1 135px;min-width:128px}
.trgd-v2 .trgd-controls .trgd-field.manager{flex:1.4 1 175px}
.trgd-v2 .trgd-controls .trgd-field.period{flex:1.1 1 148px}
.trgd-v2 .trgd-controls .trgd-field.advanced{flex:0 1 165px}
.trgd-v2 .trgd-controls .trgd-apply{flex:0 0 auto}
.trgd-v2 .trgd-controls details{flex:1 1 100%;color:#4c6581;padding:4px 0}
.trgd-v2 .trgd-controls details summary{cursor:pointer;font-weight:750;font-size:11px;color:#215e9b}
.trgd-v2 .trgd-controls .trgd-advance-grid{display:flex;gap:9px;flex-wrap:wrap;padding-top:8px}
.trgd-v2 .trgd-controls .trgd-advance-grid .trgd-field{flex:1 1 155px}
.trgd-v2 .trgd-catalog-mini{margin:8px 0 12px;background:#fff9ec;border:1px solid #f2d9aa;border-radius:9px;padding:9px 12px;color:#95561a;font-size:11px}
.trgd-v2 .trgd-catalog-mini button{border:0;background:none;color:inherit;text-decoration:underline;cursor:pointer;font-size:11px;font-weight:750}
.trgd-v2 .trgd-catalog-mini [data-trgd-catalog-detail]{margin-top:8px;border-top:1px solid #f1dcb8;padding-top:7px;line-height:1.6}
.trgd-v2 .trgd-kpis{grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:12px 0}
.trgd-v2 .trgd-kpi{padding:14px;background:white;border:1px solid #dbe5f0;border-radius:12px;min-height:92px}
.trgd-v2 .trgd-kpi span{font-size:10px;font-weight:750}
.trgd-v2 .trgd-kpi b{font-size:20px;color:#243954}
.trgd-v2 .trgd-kpi small{font-size:10px;line-height:1.4}
.trgd-v2 .trgd-brief{padding:15px;border:1px solid #cadcf2;background:linear-gradient(120deg,#eef5ff,#fff);border-radius:12px;margin:12px 0}
.trgd-v2 .trgd-brief h4{font-size:15px;color:#184978;margin:0 0 7px}
.trgd-v2 .trgd-brief p{font-size:12px;line-height:1.6;color:#485d73;margin:0}
.trgd-v2 .trgd-manager-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}
.trgd-v2 .trgd-manager-tile{border:1px solid #dce5ef;border-radius:11px;background:white;padding:13px;text-align:left;cursor:pointer;color:#223c59}
.trgd-v2 .trgd-manager-tile:hover,.trgd-v2 .trgd-manager-tile:focus-visible{background:#eef6ff;border-color:#81b7f4}
.trgd-v2 .trgd-manager-tile b{font-size:13px;display:block}
.trgd-v2 .trgd-manager-tile p{font-size:11px;color:#647991;margin:6px 0 0}
.trgd-v2 .trgd-chart{background:white;border:1px solid #dbe5f0;border-radius:12px;padding:14px;margin:11px 0}
.trgd-v2 .trgd-chart h4{margin:0 0 10px;font-size:13px;color:#23496f}
.trgd-v2 .trgd-bar-row{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:11px;margin:10px 0 5px}
.trgd-v2 .trgd-bar-track{height:10px;border-radius:10px;background:#e7edf5;overflow:hidden}
.trgd-v2 .trgd-bar-fill{height:100%;background:#93aec9;border-radius:10px}
.trgd-v2 .trgd-bar-fill.now{background:#2884c7}
.trgd-v2 .trgd-tools{margin:13px 0 10px}
.trgd-v2 .trgd-priorities{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-bottom:12px}
.trgd-v2 .trgd-priority{border:1px solid #dde6f0;border-left:3px solid #de8b39;border-radius:10px;background:white;padding:13px}
.trgd-v2 .trgd-priority.pos{border-left-color:#159765}
.trgd-v2 .trgd-priority h4{font-size:12px;margin:0 0 6px;color:#24415e;line-height:1.5}
.trgd-v2 .trgd-priority .value{font-size:16px;font-weight:850;margin:5px 0}
.trgd-v2 .trgd-priority p{font-size:11px;line-height:1.55;color:#65788f;margin:7px 0}
.trgd-v2 .trgd-priority button{border:1px solid #b5cbe6;border-radius:8px;padding:7px 10px;background:#f3f8ff;color:#185a94;cursor:pointer;font-weight:800;font-size:11px}
.trgd-v2 .trgd-details{background:#f2f7ff;border:1px solid #cfdff3;border-radius:12px;padding:12px 14px;margin:11px 0}
.trgd-v2 .trgd-details summary{cursor:pointer;font-weight:800;color:#195283;font-size:12px;padding:5px}
.trgd-v2 .trgd-details summary .close{display:none}
.trgd-v2 .trgd-details[open] summary .open{display:none}
.trgd-v2 .trgd-details[open] summary .close{display:inline}
.trgd-v2 .trgd-details .trgd-manager{background:white}
@media(max-width:950px){.trgd-v2 .trgd-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:730px){.trgd-v2 .trgd-manager-grid,.trgd-v2 .trgd-priorities{grid-template-columns:1fr}.trgd-v2 .trgd-controls .trgd-field{flex:1 1 145px}}

`;document.head.appendChild(s)}
function managerOptions(){const full=meta?.access==='full',list=meta?.managers||[];if(!full&&list.length===1)return `<option value="${esc(list[0].email)}">${esc(list[0].name)}</option>`;return `<option value="">Все менеджеры</option>`+list.map(x=>`<option value="${esc(x.email)}">${esc(x.name)}</option>`).join('')}
function renderShell(){
 css();state=state||defaultState();
 host.innerHTML='<div class="trgd trgd-v2">'+
  '<div class="trgd-head"><div><h3>📈 Группы и категории</h3><div class="trgd-note">Где меняется оборот, что проверить менеджерам и какие SKU дают основной результат</div></div><div class="trgd-status" data-trgd-status>Загружаю…</div></div>'+
  '<div class="trgd-controls">'+
  '<div class="trgd-field manager"><label>Менеджер</label><select data-trgd-manager '+(meta?.access==='full'?'':'disabled')+'>'+managerOptions()+'</select></div>'+
  '<div class="trgd-field period"><label>Период</label><select data-trgd-quick><option value="month">Месяц</option><option value="prevmonth">Прошлый месяц</option><option value="quarter">Квартал</option><option value="year">Год</option><option value="custom">Свой период</option></select></div>'+
  '<div class="trgd-field"><label>С</label><input type="month" data-trgd-from></div><div class="trgd-field"><label>По</label><input type="month" data-trgd-to></div>'+
  '<div class="trgd-field"><label>Сравнить с</label><select data-trgd-compare-mode><option value="year">Год назад</option><option value="previous">Предыдущий период</option><option value="custom">Свой период</option></select></div>'+
  '<button type="button" class="trgd-apply" data-trgd-apply>Показать</button>'+
  '<details class="trgd-advanced"><summary>Точные месяцы для сравнения</summary><div class="trgd-advance-grid"><div class="trgd-field"><label>Сравнение с</label><input type="month" data-trgd-cfrom></div><div class="trgd-field"><label>Сравнение по</label><input type="month" data-trgd-cto></div></div></details></div>'+
  '<div data-trgd-catalog></div><div data-trgd-kpis></div><div data-trgd-brief></div>'+
  '<div data-trgd-managers></div><div data-trgd-graph></div>'+
  '<div class="trgd-tools"><button type="button" data-trgd-view="all" class="on">Все</button><button type="button" data-trgd-view="down">Падение</button><button type="button" data-trgd-view="up">Рост</button><button type="button" data-trgd-view="topmoney">ТОП потерь, BYN</button><button type="button" data-trgd-view="toppercent">ТОП падения, %</button><button type="button" data-trgd-view="topup">ТОП роста</button></div>'+
  '<div data-trgd-priorities></div>'+
  '<details class="trgd-details" data-trgd-details><summary><span class="open">▤ Показать детализацию: группа → подгруппа → SKU</span><span class="close">▤ Скрыть детализацию</span></summary>'+
  '<div class="trgd-tools"><label class="trgd-note" for="trgd-sort-v2">Сортировка таблицы</label><select id="trgd-sort-v2" data-trgd-sort><option value="revenue">По продажам</option><option value="growth">По росту %</option><option value="fall">По падению %</option><option value="delta">По разнице BYN</option><option value="qty">По количеству</option></select></div><div data-trgd-list></div></details></div>';
 const set=(q,v)=>{const e=host.querySelector(q);if(e)e.value=v};
 set('[data-trgd-manager]',state.manager);set('[data-trgd-quick]',state.quick);set('[data-trgd-from]',state.from);set('[data-trgd-to]',state.to);
 set('[data-trgd-compare-mode]',state.compareMode);set('[data-trgd-cfrom]',state.cfrom);set('[data-trgd-cto]',state.cto);set('[data-trgd-sort]',state.sort);
 bind();catalogLine();
}
function catalogLine(){
 const e=host?.querySelector('[data-trgd-catalog]');if(!e)return;
 const c={...(meta?.catalog||{}),...(state?.classification||{})};
 const bad=Number(c.unmatched_skus||0),matched=Number(c.matched_skus||0),all=Number(c.sales_skus||0);
 const ratio=all?matched/all*100:null;
 e.innerHTML='<div class="trgd-catalog-mini">'+
  '<button type="button" data-trgd-catalog-toggle aria-expanded="false">'+(bad?'⚠ '+qty(bad)+' SKU без сопоставления · подробнее':'✓ Контроль сопоставления · подробнее')+'</button>'+
  '<div data-trgd-catalog-detail hidden>'+((all||matched)?'Сопоставлено: '+qty(matched)+' из '+qty(all)+' SKU'+(ratio!=null?' ('+pct(ratio).replace('+','')+')':'')+'. ':'')+
  (bad?'Не сопоставлено '+qty(bad)+' SKU'+(c.unmatched_revenue!=null?', оборот '+money(c.unmatched_revenue):'')+'. Проверьте исходный прайс-лист. Соответствия не подбираются автоматически.':'Нет подтверждённых проблем с сопоставлением в доступном отчёте.')+
  '</div></div>';
}
function applyQuick(){const end=meta?.last_month||state.to;let from=end,to=end;if(state.quick==='prevmonth'){from=to=ymAdd(end,-1)}else if(state.quick==='quarter'){const [y,m]=end.split('-').map(Number),q=Math.floor((m-1)/3)*3+1;from=`${y}-${String(q).padStart(2,'0')}`;to=end}else if(state.quick==='year'){from=end.slice(0,4)+'-01';to=end}else if(state.quick==='custom'){from=state.from;to=state.to}state.from=from;state.to=to;applyCompare()}
function applyCompare(){if(state.compareMode==='year'){state.cfrom=ymAdd(state.from,-12);state.cto=ymAdd(state.to,-12)}else if(state.compareMode==='previous'){const n=monthsBetween(state.from,state.to);state.cto=ymAdd(state.from,-1);state.cfrom=ymAdd(state.cto,-(n-1))}}
function readControls(){const q=s=>host.querySelector(s);state.manager=q('[data-trgd-manager]')?.value||'';state.quick=q('[data-trgd-quick]')?.value||'month';state.from=q('[data-trgd-from]')?.value||state.from;state.to=q('[data-trgd-to]')?.value||state.to;state.compareMode=q('[data-trgd-compare-mode]')?.value||'year';state.cfrom=q('[data-trgd-cfrom]')?.value||state.cfrom;state.cto=q('[data-trgd-cto]')?.value||state.cto;state.sort=q('[data-trgd-sort]')?.value||'revenue'}
function syncControls(){const set=(q,v)=>{const e=host.querySelector(q);if(e)e.value=v};set('[data-trgd-from]',state.from);set('[data-trgd-to]',state.to);set('[data-trgd-cfrom]',state.cfrom);set('[data-trgd-cto]',state.cto)}
function bind(){
 host.onclick=e=>{
  const t=e.target.closest('[data-trgd-catalog-toggle]');
  if(t){const detail=host.querySelector('[data-trgd-catalog-detail]');if(detail){detail.hidden=!detail.hidden;t.setAttribute('aria-expanded',String(!detail.hidden))}return}
  const a=e.target.closest('[data-trgd-apply]');
  if(a){readControls();cache.clear();loadGroups(true);return}
  const v=e.target.closest('[data-trgd-view]');
  if(v){state.view=v.dataset.trgdView;host.querySelectorAll('[data-trgd-view]').forEach(x=>x.classList.toggle('on',x===v));renderPriorities();renderGroups();return}
  const m=e.target.closest('[data-trgd-select-manager]');
  if(m){
   if(meta?.access!=='full')return;
   const email=decodeURIComponent(m.dataset.trgdSelectManager||'');
   const known=(meta?.managers||[]).some(x=>x.email===email);
   if(!known)return;
   const selected=state.manager===email?'':email;
   state.manager=selected;
   const sel=host.querySelector('[data-trgd-manager]');if(sel)sel.value=selected;
   cache.clear();loadGroups(true);return;
  }
  const direct=e.target.closest('[data-trgd-inspect]');
  if(direct){
   const box=host.querySelector('[data-trgd-details]');if(!box)return;
   box.open=true;
   const row=[...host.querySelectorAll('[data-trgd-group]')].find(x=>x.dataset.manager===direct.dataset.manager&&x.dataset.trgdGroup===direct.dataset.trgdInspect);
   if(row){row.click();row.scrollIntoView?.({block:'nearest',behavior:'auto'})}
   return;
  }
  const g=e.target.closest('[data-trgd-group]');if(g){toggleGroup(g.dataset.manager,g.dataset.trgdGroup);return}
  const sg=e.target.closest('[data-trgd-subgroup]');if(sg){toggleSubgroup(sg.dataset.manager,sg.dataset.group,sg.dataset.trgdSubgroup);return}
  const r=e.target.closest('[data-trgd-retry]');if(r){loadGroups(true);return}
 };
 host.onchange=e=>{
  if(e.target.matches('[data-trgd-quick]')){readControls();state.quick=e.target.value;applyQuick();syncControls()}
  else if(e.target.matches('[data-trgd-compare-mode]')){readControls();state.compareMode=e.target.value;applyCompare();syncControls()}
  else if(e.target.matches('[data-trgd-sort]')){state.sort=e.target.value;renderGroups()}
 };
}
function signature(){return [state.manager,state.from,state.to,state.cfrom,state.cto].join('|')}
async function getLevel(level,manager,group=null,subgroup=null){const key=[signature(),level,manager||'',group||'',subgroup||''].join('¦');if(cache.has(key))return cache.get(key);const p=rpc('triovist_group_dynamics_v1',{p_from_month:ymDate(state.from),p_to_month:ymDate(state.to),p_compare_from_month:ymDate(state.cfrom),p_compare_to_month:ymDate(state.cto),p_manager_email:manager||null,p_level:level,p_group:group,p_subgroup:subgroup});cache.set(key,p);try{const d=await p;cache.set(key,d);return d}catch(e){cache.delete(key);throw e}}
async function loadGroups(force=false){
 if(flight&&!force)return flight;
 const list=host?.querySelector('[data-trgd-list]');if(list)list.innerHTML='<div class="trgd-loading">Загружаю агрегаты групп…</div>';
 const status=host?.querySelector('[data-trgd-status]');if(status)status.textContent='Обновляю аналитику…';
 const request=++loadEpoch;
 flight=(async()=>{
  const d=await getLevel('group',state.manager||null);
  if(request!==loadEpoch)return;
  state.groups=Array.isArray(d.items)?d.items:[];
  state.projection=d.projection||null;
  state.classification=d.classification||null;
  state.lastImport=d.last_import||null;
  catalogLine();renderKpis();renderImpact();renderManagers();renderChart();renderPriorities();renderGroups();renderStatus();
 })().catch(e=>{if(request===loadEpoch)showError(e)}).finally(()=>{if(request===loadEpoch)flight=null});
 return flight;
}
function renderStatus(){
 const e=host?.querySelector('[data-trgd-status]');if(!e)return;
 const p=state.projection||{},li=state.lastImport||{};
 const fact=p.active?'Факт 1С по '+(p.as_of||'текущую дату')+' · прогноз отдельно':'Закрытый/полный период';
 e.textContent=state.from+' → '+state.to+' · '+fact+(li.month?' · 1С: '+li.month:'');
}
function visibleRows(){
 const rows=Array.isArray(state.groups)?state.groups:[];
 if((ctx?.is_manager||meta?.access!=='full')&&ctx?.email)return rows.filter(r=>String(r.manager_email||'').trim().toLowerCase()===String(ctx.email).trim().toLowerCase());
 return rows;
}
function aggregate(rows){
 return rows.reduce((a,r)=>{
  a.fact+=num(r.current_revenue);a.basis+=num(r.basis_revenue);a.comp+=num(r.compare_revenue);a.qty+=num(r.current_qty);
  if(r.growth_pct!=null){if(num(r.growth_pct)>0)a.up++;else if(num(r.growth_pct)<0)a.down++}
  return a
 },{fact:0,basis:0,comp:0,qty:0,up:0,down:0});
}
function renderKpis(){
 const e=host?.querySelector('[data-trgd-kpis]');if(!e)return;
 const a=aggregate(visibleRows()),isForecast=!!state.projection?.active;
 const delta=a.basis-a.comp,p= a.comp ? delta/a.comp*100:null;
 const range=state.from===state.to?state.from:state.from+' → '+state.to;
 const reference=state.cfrom===state.cto?state.cfrom:state.cfrom+' → '+state.cto;
 e.innerHTML='<div class="trgd-kpis">'+
  '<div class="trgd-kpi"><span>Продажи · факт 1С</span><b>'+money(a.fact)+'</b><small>'+esc(range)+' · подтверждённые</small></div>'+
  '<div class="trgd-kpi"><span>'+(isForecast?'Прогноз периода':'Продажи периода')+'</span><b>'+money(a.basis)+'</b><small>'+(isForecast?'Оценка по темпу, не факт':'Фактическая база')+'</small></div>'+
  '<div class="trgd-kpi"><span>Сравниваемый период</span><b>'+money(a.comp)+'</b><small>'+esc(reference)+'</small></div>'+
  '<div class="trgd-kpi"><span>'+(isForecast?'Прогноз к прошлому периоду':'Изменение к сравнению')+'</span><b class="'+(delta<0?'trgd-neg':delta>0?'trgd-pos':'trgd-neutral')+'">'+pct(p)+'</b><small>'+(delta>0?'+':'')+money(delta)+' · '+(isForecast?'предварительно':'по факту')+'</small></div></div>';
}
function renderImpact(){
 const e=host?.querySelector('[data-trgd-brief]');if(!e)return;
 const rows=visibleRows().filter(r=>r.delta_revenue!=null),down=rows.filter(r=>num(r.delta_revenue)<0).sort((a,b)=>num(a.delta_revenue)-num(b.delta_revenue));
 const up=rows.filter(r=>num(r.delta_revenue)>0).sort((a,b)=>num(b.delta_revenue)-num(a.delta_revenue));
 const top=down[0],growth=up[0],forecast=!!state.projection?.active;
 const headline=down.length+' групп в снижении, '+up.length+' — в росте.';
 const main=top?' Главный риск: '+esc(top.manager_name||'')+' · '+esc(top.group||'Без группы')+' ('+money(top.delta_revenue)+').':' Нет подтверждённых групп с падением.';
 const pos=growth?' Рост: '+esc(growth.group||'Без группы')+' (+'+money(growth.delta_revenue)+').':'';
 e.innerHTML='<section class="trgd-brief"><h4>✨ Короткий директорский брифинг</h4><p>'+headline+main+pos+
  ' Сначала проверьте подгруппы и SKU, затем остатки, цены и позиции 21vek. Причины падения пока не установлены.</p>'+
  '<div class="trgd-note" style="margin-top:8px">'+(forecast?'Сравнение рассчитано по прогнозному темпу текущего периода, не по фактическим продажам за полный месяц.':'Сравниваются фактические закрытые периоды.')+'</div></section>';
}
function renderManagers(){
 const e=host?.querySelector('[data-trgd-managers]');if(!e)return;
 const buckets=new Map();
 for(const r of visibleRows()){
  const key=r.manager_email||'';
  if(!buckets.has(key))buckets.set(key,{name:r.manager_name||'Менеджер',email:key,rows:[]});
  buckets.get(key).rows.push(r);
 }
 const data=[...buckets.values()];
 e.innerHTML=data.length?'<div class="trgd-manager-grid">'+data.map(x=>{
  const sorted=x.rows.filter(r=>r.delta_revenue!=null&&num(r.delta_revenue)<0).sort((a,b)=>num(a.delta_revenue)-num(b.delta_revenue));
  const best=x.rows.filter(r=>r.delta_revenue!=null&&num(r.delta_revenue)>0).sort((a,b)=>num(b.delta_revenue)-num(a.delta_revenue))[0];
  const loss=sorted[0];
  const hint=loss?'Сначала проверить: '+esc(loss.group||'Без группы')+' · '+money(loss.delta_revenue):'Нет групп с подтверждённым падением';
  const good=best?'Рост: '+esc(best.group||'Без группы')+' · +'+money(best.delta_revenue):'';
  return '<button type="button" class="trgd-manager-tile" data-trgd-select-manager="'+encodeURIComponent(x.email)+'"><b>'+esc(x.name)+'</b><p>'+hint+'</p><p class="trgd-pos">'+good+'</p><p>Факт: '+money(aggregate(x.rows).fact)+' · '+x.rows.length+' групп</p><p style="color:#185fa5">'+(meta?.access==='full'?'Показать группы менеджера':'Ваши показатели')+'</p></button>';
 }).join('')+'</div>':'';
}
function renderChart(){
 const e=host?.querySelector('[data-trgd-graph]');if(!e)return;
 const a=aggregate(visibleRows()),max=Math.max(1,a.basis,a.comp),forecast=!!state.projection?.active;
 const bar=(label,value,cls)=>'<div class="trgd-bar-row"><span>'+esc(label)+'</span><b>'+money(value)+'</b></div><div class="trgd-bar-track"><div class="trgd-bar-fill '+cls+'" style="width:'+Math.max(0,Math.min(100,value/max*100)).toFixed(2)+'%"></div></div>';
 e.innerHTML='<section class="trgd-chart"><h4>Сравнение оборота</h4>'+
 bar('Сравниваемый период '+state.cfrom+' → '+state.cto,a.comp,'')+
 bar((forecast?'Прогноз':'Факт')+' '+state.from+' → '+state.to,a.basis,'now')+
 '<p class="trgd-note" style="margin-top:8px">'+(forecast?'Прогноз полного периода сравнивается с полным прошлым периодом. Не смешиваем факт неполного месяца и полный прошлый месяц.':'Сравниваются сопоставимые периоды.')+'</p></section>';
}
function renderPriorities(){
 const e=host?.querySelector('[data-trgd-priorities]');if(!e)return;
 const all=filtered();
 let rows=all;
 if(state.view==='all'){
  const loss=all.filter(r=>r.delta_revenue!=null&&num(r.delta_revenue)<0).sort((a,b)=>num(a.delta_revenue)-num(b.delta_revenue));
  const rise=all.filter(r=>r.delta_revenue!=null&&num(r.delta_revenue)>0).sort((a,b)=>num(b.delta_revenue)-num(a.delta_revenue));
  rows=[...loss.slice(0,4),...rise.slice(0,2)];
  if(!rows.length)rows=all.slice(0,6);
 }else rows=all.slice(0,10);
 e.innerHTML=rows.length?'<div class="trgd-priorities">'+rows.map(r=>{
  const diff=num(r.delta_revenue),isDown=diff<0,fore=!!state.projection?.active;
  const tag=isDown?'Приоритет: проверить':'Рост: закрепить';
  const reason=fore?'Разница по прогнозному темпу, причина не установлена.':'Разница к сравниваемому периоду, причина не установлена.';
  return '<article class="trgd-priority '+(isDown?'':'pos')+'"><h4>'+esc(r.manager_name||'')+' · '+esc(r.group||'Без группы')+'</h4>'+
   '<div class="value '+(isDown?'trgd-neg':'trgd-pos')+'">'+(diff>0?'+':'')+money(diff)+'</div>'+
   '<div class="trgd-note">'+tag+' · '+pct(r.growth_pct)+' · '+qty(r.sku_count)+' SKU</div>'+
   '<p>'+reason+' Проверить реальные SKU, остатки и историю продаж.</p>'+
   '<button type="button" data-trgd-inspect="'+encodeURIComponent(r.group||'')+'" data-manager="'+encodeURIComponent(r.manager_email||'')+'">Открыть группу и SKU</button></article>';
 }).join('')+'</div>':'<div class="trgd-empty">Нет групп для выбранного фильтра. Выберите другой режим или период.</div>';
}
function filtered(){
 let rows=[...visibleRows()];
 if(state.view==='up'||state.view==='topup')rows=rows.filter(r=>r.growth_pct!=null&&num(r.growth_pct)>0);
 if(state.view==='down'||state.view==='topmoney'||state.view==='toppercent')rows=rows.filter(r=>r.growth_pct!=null&&num(r.growth_pct)<0);
 if(state.view==='topmoney')return rows.sort((a,b)=>num(a.delta_revenue)-num(b.delta_revenue)).slice(0,10);
 if(state.view==='toppercent')return rows.sort((a,b)=>num(a.growth_pct)-num(b.growth_pct)).slice(0,10);
 if(state.view==='topup')return rows.sort((a,b)=>num(b.delta_revenue)-num(a.delta_revenue)).slice(0,10);
 if(state.view==='down')return rows.sort((a,b)=>num(a.delta_revenue)-num(b.delta_revenue));
 if(state.view==='up')return rows.sort((a,b)=>num(b.delta_revenue)-num(a.delta_revenue));
 const sort=state.sort||'revenue';
 if(sort==='growth')rows.sort((a,b)=>num(b.growth_pct)-num(a.growth_pct));
 else if(sort==='fall')rows.sort((a,b)=>num(a.growth_pct)-num(b.growth_pct));
 else if(sort==='delta')rows.sort((a,b)=>Math.abs(num(b.delta_revenue))-Math.abs(num(a.delta_revenue)));
 else if(sort==='qty')rows.sort((a,b)=>num(b.current_qty)-num(a.current_qty));
 else rows.sort((a,b)=>num(b.current_revenue)-num(a.current_revenue));
 return rows;
}
function growthClass(v){return v==null?'trgd-neutral':num(v)>0?'trgd-pos':num(v)<0?'trgd-neg':'trgd-neutral'}
function groupRow(r){const key=encodeURIComponent(r.group||''),m=encodeURIComponent(r.manager_email||'');return `<div class="trgd-row clickable" data-trgd-group="${key}" data-manager="${m}"><div class="trgd-main"><div class="trgd-name"><span class="trgd-arrow">▸</span>${esc(r.group||'Без группы')}${r.group==='Не распределено'?'<span class="trgd-badge warn">контроль</span>':''}</div><div class="trgd-sub">${Number(r.sku_count||0)} SKU · доля ${pct(r.share_pct)}</div></div><div class="trgd-metric"><small>Факт</small><b>${money(r.current_revenue)}</b></div><div class="trgd-metric"><small>Сравнение</small><b>${money(r.compare_revenue)}</b></div><div class="trgd-metric"><small>Δ / динамика</small><b class="${growthClass(r.growth_pct)}">${num(r.delta_revenue)>0?'+':''}${money(r.delta_revenue)} · ${pct(r.growth_pct)}</b></div><div class="trgd-metric"><small>Штук</small><b>${qty(r.current_qty)}</b></div><div class="trgd-metric trgd-hide-mobile"><small>Доля</small><b>${pct(r.share_pct)}</b></div></div><div class="trgd-nested" data-trgd-subhost="${m}|${key}" style="display:none"></div>`}
function renderGroups(){const e=host?.querySelector('[data-trgd-list]');if(!e)return;const rows=filtered();if(!rows.length){e.innerHTML='<div class="trgd-empty">По выбранному фильтру данных нет.</div>';return}const by=new Map();for(const r of rows){const k=r.manager_email||'';if(!by.has(k))by.set(k,{name:r.manager_name||'Не распределено',rows:[]});by.get(k).rows.push(r)}e.innerHTML=[...by.entries()].map(([m,x])=>`<div class="trgd-manager"><div class="trgd-manager-title"><span>${esc(x.name)}</span><span>${money(x.rows.reduce((s,r)=>s+num(r.current_revenue),0))}</span></div>${x.rows.map(groupRow).join('')}</div>`).join('')}
async function toggleGroup(managerEnc,groupEnc){const manager=decodeURIComponent(managerEnc||''),group=decodeURIComponent(groupEnc||''),key=`${managerEnc}|${groupEnc}`,box=host.querySelector(`[data-trgd-subhost="${CSS.escape(key)}"]`);if(!box)return;if(box.dataset.loaded==='1'){box.style.display=box.style.display==='none'?'block':'none';return}box.style.display='block';box.innerHTML='<div class="trgd-loading">Загружаю подгруппы…</div>';try{const d=await getLevel('subgroup',manager||null,group,null),rows=Array.isArray(d.items)?d.items:[];box.dataset.loaded='1';box.innerHTML=rows.length?rows.map(r=>subgroupRow(r,manager,group)).join(''):'<div class="trgd-empty">Подгрупп нет.</div>'}catch(e){box.innerHTML=`<div class="trgd-error">${esc(e?.message||e)}</div>`}}
function subgroupRow(r,manager,group){const m=encodeURIComponent(manager),g=encodeURIComponent(group),s=encodeURIComponent(r.subgroup||'');return `<div class="trgd-row clickable" data-trgd-subgroup="${s}" data-manager="${m}" data-group="${g}"><div class="trgd-main"><div class="trgd-name"><span class="trgd-arrow">▸</span>${esc(r.subgroup||'Прочее')}</div><div class="trgd-sub">${Number(r.sku_count||0)} SKU · доля группы ${pct(r.share_pct)}</div></div><div class="trgd-metric"><small>Факт</small><b>${money(r.current_revenue)}</b></div><div class="trgd-metric"><small>Сравнение</small><b>${money(r.compare_revenue)}</b></div><div class="trgd-metric"><small>Δ / динамика</small><b class="${growthClass(r.growth_pct)}">${num(r.delta_revenue)>0?'+':''}${money(r.delta_revenue)} · ${pct(r.growth_pct)}</b></div><div class="trgd-metric"><small>Штук</small><b>${qty(r.current_qty)}</b></div><div class="trgd-metric trgd-hide-mobile"><small>Доля</small><b>${pct(r.share_pct)}</b></div></div><div class="trgd-nested sku" data-trgd-skuhost="${m}|${g}|${s}" style="display:none"></div>`}
async function toggleSubgroup(managerEnc,groupEnc,subEnc){const manager=decodeURIComponent(managerEnc||''),group=decodeURIComponent(groupEnc||''),sub=decodeURIComponent(subEnc||''),key=`${managerEnc}|${groupEnc}|${subEnc}`,box=host.querySelector(`[data-trgd-skuhost="${CSS.escape(key)}"]`);if(!box)return;if(box.dataset.loaded==='1'){box.style.display=box.style.display==='none'?'block':'none';return}box.style.display='block';box.innerHTML='<div class="trgd-loading">Загружаю SKU…</div>';try{const d=await getLevel('sku',manager||null,group,sub),rows=Array.isArray(d.items)?d.items:[];box.dataset.loaded='1';box.innerHTML=rows.length?rows.map(skuRow).join(''):'<div class="trgd-empty">SKU нет.</div>'}catch(e){box.innerHTML=`<div class="trgd-error">${esc(e?.message||e)}</div>`}}
function skuRow(r){return `<div class="trgd-row"><div class="trgd-main"><div class="trgd-name">${esc(r.sku||'—')} · ${esc(r.product||'')}</div><div class="trgd-sub">${r.catalog_match===false?'<span class="trgd-badge warn">нет в прайс-листе</span>':'прайс-лист ✓'}</div></div><div class="trgd-metric"><small>Факт</small><b>${money(r.current_revenue)}</b></div><div class="trgd-metric"><small>Сравнение</small><b>${money(r.compare_revenue)}</b></div><div class="trgd-metric"><small>Δ / динамика</small><b class="${growthClass(r.growth_pct)}">${num(r.delta_revenue)>0?'+':''}${money(r.delta_revenue)} · ${pct(r.growth_pct)}</b></div><div class="trgd-metric"><small>Штук</small><b>${qty(r.current_qty)}</b></div><div></div></div>`}
function showError(e){const list=host?.querySelector('[data-trgd-list]');if(list)list.innerHTML=`<div class="trgd-error"><b>Группы и динамика не загрузились.</b><br>${esc(e?.message||e)}<br><button class="trgd-retry" data-trgd-retry>Повторить</button></div>`;const s=host?.querySelector('[data-trgd-status]');if(s)s.textContent='Ошибка аналитики — остальные разделы Triovist продолжают работать';const p=host?.querySelector('[data-trgd-priorities]');if(p)p.innerHTML='<div class="trgd-error">Не удалось загрузить приоритеты. Проверьте период и повторите запрос.</div>';console.error('TRIOVIST GROUP DYNAMICS '+V,e)}
async function open(nextHost,nextCtx){host=nextHost||host;ctx=nextCtx||ctx;if(!host)return false;try{if(!meta)meta=await rpc('triovist_group_dynamics_context_v1');if(!state){state=defaultState();if(meta?.access!=='full'&&meta?.managers?.[0])state.manager=meta.managers[0].email}renderShell();applyQuick();syncControls();await loadGroups(true);return true}catch(e){if(host){css();host.innerHTML='<div class="trgd"><div data-trgd-list></div></div>';showError(e)}return false}}
async function refresh(){if(!host)return false;cache.clear();meta=await rpc('triovist_group_dynamics_context_v1');return loadGroups(true)}
window.RESANTA_TRIOVIST_GROUP_DYNAMICS_V236120=Object.freeze({version:V,open,refresh,readOnlySnapshot:()=>({groups:[...(state?.groups||[])],projection:state?.projection||null,from:state?.from||'',to:state?.to||''}),readOnly:true,noPolling:true,noMutationObserver:true,serverAggregated:true,lazyDrilldown:true});
})();