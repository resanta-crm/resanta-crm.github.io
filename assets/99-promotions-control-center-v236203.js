/* RESANTA CRM v23.6.217 · PROMOTIONS CONTROL CENTER ROOT
 * Single source of truth for Promotions views and filters.
 * Owns operational filtering. Legacy work/close/status overlays must not decide card visibility.
 * No polling. No MutationObserver. No business-data writes.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_CONTROL_CENTER_V236203)return;

const V='v23.6.217';
const safe=v=>String(v??'');
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const esc=v=>safe(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>safe(v).trim().toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ');
const today=()=>{try{return safe(TODAY).slice(0,10)||new Date().toISOString().slice(0,10)}catch(_){return new Date().toISOString().slice(0,10)}};
const currentMonth=()=>today().slice(0,7);
const state={view:'active',manager:'all',client:'',group:'',sku:'',month:currentMonth(),bound:false,rendering:false};
const views=[
  ['decision','Нужно моё решение','decision'],
  ['needs_close','Нужно закрыть','bad'],
  ['attention','Требуют внимания','warn'],
  ['active','Идут сейчас','good'],
  ['planned','Запланированы',''],
  ['completed','Завершённые',''],
  ['rejected','Архив · отклонённые','']
];

function active(){return document.getElementById('page-promotions')?.classList.contains('active')}
function promos(){try{return Array.isArray(allPromotions)?allPromotions:(window.allPromotions||[])}catch(_){return window.allPromotions||[]}}
function actor(){try{return typeof currentProfile!=='undefined'?currentProfile:(window.currentProfile||{})}catch(_){return window.currentProfile||{}}}
function actualStatus(p){try{return typeof promoActualStatus==='function'?promoActualStatus(p):safe(p?.status)}catch(_){return safe(p?.status)}}
function effRow(id){try{return window.RESANTA_PROMOTIONS_EFFECTIVENESS_V236132?.getRow?.(id)||null}catch(_){return null}}
function progress(p){
  const s=new Date(safe(p?.start_date)+'T12:00:00'),e=new Date(safe(p?.end_date)+'T12:00:00'),t=new Date(today()+'T12:00:00');
  if(!Number.isFinite(s.getTime())||!Number.isFinite(e.getTime()))return{elapsed:0,left:null};
  const total=Math.max(1,Math.round((e-s)/86400000)+1);
  const done=t<s?0:t>e?total:Math.max(0,Math.round((t-s)/86400000)+1);
  return{elapsed:Math.min(100,done/total*100),left:t>e?0:Math.max(0,Math.round((e-t)/86400000))};
}
function photoMissing(p,st,elapsed){
  try{
    const m=promoPhotoProgress(p)?.missing||[];
    if(!m.length)return false;
    if(st==='planned')return m.includes('before');
    if(st==='active'){
      if(m.includes('before')||m.includes('start'))return true;
      return elapsed>=35&&m.includes('during');
    }
    if(st==='awaiting')return m.length>0;
  }catch(_){}
  return false;
}
function isDecisionForMe(st){
  const n=norm(actor()?.name);
  const role=safe(actor()?.role).toLowerCase();
  if(role!=='boss')return st==='draft_manager'||st==='waiting_manager';
  if(n.includes('паюш'))return st==='pending_dfs';
  if(n.includes('сидорович')||n.includes('сидарович'))return st==='pending_df';
  return st==='pending_df'||st==='pending_dfs';
}
function rowMeta(p){
  const st=actualStatus(p),raw=safe(p?.status),pr=progress(p),e=effRow(p?.id);
  const sales=p?.confirmed_sales!==null&&p?.confirmed_sales!==undefined&&p?.confirmed_sales!==''?num(p.confirmed_sales):num(e?.current_sales_1c);
  const plan=num(p?.sales_plan),completion=plan>0?sales/plan*100:null,pace=completion==null?null:completion-pr.elapsed;
  const ended=safe(p?.end_date)<today();
  const needsClose=!['completed','rejected'].includes(raw)&&(st==='awaiting'||(ended&&['approved','in_work'].includes(raw)));
  const badData=['client_match_ambiguous'].includes(safe(e?.data_quality));
  const attention=!needsClose&&!['completed','rejected'].includes(raw)&&(
    ((st==='active'||st==='planned')&&photoMissing(p,st,pr.elapsed))||
    (st==='active'&&pace!=null&&pace<=-15)||
    badData
  );
  return{p,e,st,raw,pr,sales,plan,completion,pace,needsClose,attention,decision:isDecisionForMe(st)};
}
function monthEnd(ym){if(!/^\d{4}-\d{2}$/.test(safe(ym)))return'';const [y,m]=ym.split('-').map(Number);return new Date(y,m,0).toISOString().slice(0,10)}
function overlaps(p,ym){if(!ym||ym==='all')return true;return safe(p.start_date)<=monthEnd(ym)&&safe(p.end_date)>=ym+'-01'}
function hayGroup(x){const f=x.p?.product_filters||{},it=Array.isArray(x.e?.items)?x.e.items:[];return norm([...(f.categories||[]),...(f.subgroups||[]),...it.flatMap(i=>[i.category,i.subgroup,i.product_name])].join(' '))}
function haySku(x){const f=x.p?.product_filters||{},it=Array.isArray(x.e?.items)?x.e.items:[];return norm([...(f.skus||[]),...it.map(i=>i.sku)].join(' '))}
function passesCommon(x,view=state.view){
  const p=x.p;
  if(state.manager!=='all'&&safe(p.manager_name)!==state.manager)return false;
  if(state.client&&!norm(safe(p.client_name)+' '+safe(p.title)).includes(norm(state.client)))return false;
  if(state.group&&!hayGroup(x).includes(norm(state.group)))return false;
  if(state.sku&&!haySku(x).includes(norm(state.sku)))return false;
  if(!['decision','needs_close'].includes(view)&&!overlaps(p,state.month))return false;
  return true;
}
function inView(x,view=state.view){
  if(view==='decision')return x.decision;
  if(view==='needs_close')return x.needsClose;
  if(view==='attention')return x.attention;
  if(view==='active')return x.st==='active'&&!x.needsClose&&!['rejected','completed'].includes(x.raw);
  if(view==='planned')return x.st==='planned'&&!['rejected','completed'].includes(x.raw);
  if(view==='completed')return x.raw==='completed';
  if(view==='rejected')return x.raw==='rejected';
  return false;
}
function matches(p){const x=rowMeta(p);return passesCommon(x,state.view)&&inView(x)}
function sortRows(rows){
  const a=[...(rows||[])];
  if(state.view==='needs_close')return a.sort((x,y)=>safe(x.end_date).localeCompare(safe(y.end_date)));
  if(state.view==='completed'||state.view==='rejected')return a.sort((x,y)=>safe(y.end_date).localeCompare(safe(x.end_date)));
  return a.sort((x,y)=>safe(x.start_date).localeCompare(safe(y.start_date)));
}
function filteredBase(view=state.view){return promos().map(rowMeta).filter(x=>passesCommon(x,view))}
function counts(){const rows=promos().map(rowMeta),o={};views.forEach(([k])=>o[k]=rows.filter(x=>passesCommon(x,k)&&inView(x,k)).length);return o}
function globalViewCount(view){return promos().map(rowMeta).filter(x=>inView(x,view)).length}
function syncLegacyDirectorButtons(){
  const host=document.getElementById('promo-v2368-director');if(!host)return;
  const work=host.querySelector('[data-v2368-work]');
  if(work){const b=work.querySelector('b');if(b)b.textContent=String(globalViewCount('active'));work.title='Показать реально идущие сейчас акции';}
  const decision=host.querySelector('[data-v2368-open-action]');
  if(decision){const b=decision.querySelector('b');if(b)b.textContent=String(globalViewCount('decision'));decision.title='Показать акции, где требуется моё решение';}
}
function months(){
  const set=new Set([currentMonth()]);
  promos().forEach(p=>{const a=safe(p.start_date).slice(0,7),b=safe(p.end_date).slice(0,7);if(/^\d{4}-\d{2}$/.test(a))set.add(a);if(/^\d{4}-\d{2}$/.test(b))set.add(b)});
  return[...set].sort().reverse();
}
function monthLabel(ym){if(ym==='all')return'Все месяцы';const n=['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'],[y,m]=safe(ym).split('-');return(n[Number(m)-1]||m)+' '+y}
function managers(){return[...new Set(promos().map(p=>safe(p.manager_name)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'))}
function toneClass(t){return t?(' pcc203-'+t):''}
function qualitySummary(){
  const rows=filteredBase(state.view).filter(x=>inView(x));
  const warn=rows.filter(x=>x.e?.client_match_warning||['preliminary_month','client_match_ambiguous'].includes(safe(x.e?.data_quality))).length;
  return warn?(' · '+warn+' с предупреждением по данным'):'';
}
function style(){
  if(document.getElementById('promo-control-center-style-v236203'))return;
  const s=document.createElement('style');s.id='promo-control-center-style-v236203';s.textContent=`
#promo-control-center-v236203{margin:0 0 14px;border:1px solid #dbe7f3;background:#fbfdff;border-radius:13px;padding:12px}
.pcc203-head{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}.pcc203-title{font-size:15px;font-weight:800}.pcc203-note{font-size:10px;color:var(--sub);margin-top:2px}
.pcc203-filters{display:grid;grid-template-columns:150px minmax(170px,1fr) minmax(170px,1fr) 125px 125px;gap:7px;margin-top:10px}
.pcc203-filters select,.pcc203-filters input{height:36px;border:1px solid var(--border);border-radius:8px;background:#fff;padding:0 9px;min-width:0;font-size:11px}
.pcc203-tabs{display:grid;grid-template-columns:repeat(7,minmax(110px,1fr));gap:7px;margin-top:10px}
.pcc203-tab{border:1px solid var(--border);background:#fff;border-radius:10px;padding:9px;cursor:pointer;text-align:left;min-width:0}
.pcc203-tab.active{border-color:#60a5fa;box-shadow:0 0 0 1px #60a5fa inset;background:#eff6ff}.pcc203-tab b{display:block;font-size:19px}.pcc203-tab span{display:block;font-size:9px;color:var(--sub);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pcc203-bad b{color:var(--r)}.pcc203-warn b{color:var(--am)}.pcc203-good b{color:var(--g)}
.pcc203-current{margin-top:9px;font-size:11px;color:var(--sub)}.pcc203-current b{color:var(--text)}
@media(max-width:1100px){.pcc203-tabs{grid-template-columns:repeat(4,minmax(120px,1fr))}.pcc203-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:600px){.pcc203-tabs{grid-template-columns:repeat(2,minmax(0,1fr))}.pcc203-filters{grid-template-columns:1fr}}
`;document.head.appendChild(s);
}
function prepareDom(){
  const page=document.getElementById('page-promotions');if(!page)return;
  const k=document.getElementById('promo-kpi');if(k)k.style.display='none';
  const a=document.getElementById('promo-approval-overview');if(a)a.style.display='none';
  const b=document.getElementById('promo-budget-overview');if(b){b.style.display='none';b.innerHTML=''}
  const sf=document.getElementById('promo-status-filter');const legacy=sf?.closest?.('.card');if(legacy)legacy.style.display='none';
  document.getElementById('promo54-close-reminder')?.remove();
  document.getElementById('promo54-tools')?.remove();
  document.getElementById('promo-boss-dash-v236133')?.remove();
  syncLegacyDirectorButtons();
  page.querySelectorAll('.promo-toolbar button').forEach(btn=>{
    const oc=safe(btn.getAttribute('onclick'));
    if(btn.id==='promo-budget-btn'||oc.includes("goPage('budgets'")||oc.includes('goPage("budgets"'))btn.style.display='none';
  });
}
function root(){
  const page=document.getElementById('page-promotions');if(!page)return null;
  let r=document.getElementById('promo-control-center-v236203');if(r)return r;
  r=document.createElement('div');r.id='promo-control-center-v236203';
  const fresh=document.getElementById('promo-sales-freshness');
  if(fresh?.parentElement)fresh.insertAdjacentElement('afterend',r);else page.prepend(r);
  return r;
}
function renderCenter(){
  if(!active())return;prepareDom();style();if(state.rendering)return;state.rendering=true;
  try{
    syncLegacyDirectorButtons();
    const r=root();if(!r)return;const c=counts(),ms=months(),selected=c[state.view]||0;
    r.innerHTML='<div class="pcc203-head"><div><div class="pcc203-title">🎯 Центр управления акциями</div><div class="pcc203-note">Один фильтр управляет всем списком ниже. Отклонённые не смешиваются с рабочими акциями.</div></div></div>'
      +'<div class="pcc203-filters"><select data-pcc203="manager"><option value="all">Все менеджеры</option>'+managers().map(m=>'<option value="'+esc(m)+'" '+(state.manager===m?'selected':'')+'>'+esc(m)+'</option>').join('')+'</select>'
      +'<input data-pcc203="client" placeholder="Клиент / название" value="'+esc(state.client)+'">'
      +'<input data-pcc203="group" placeholder="Группа / подгруппа" value="'+esc(state.group)+'">'
      +'<input data-pcc203="sku" placeholder="SKU" value="'+esc(state.sku)+'">'
      +'<select data-pcc203="month"><option value="all" '+(state.month==='all'?'selected':'')+'>Все месяцы</option>'+ms.map(m=>'<option value="'+m+'" '+(state.month===m?'selected':'')+'>'+monthLabel(m)+'</option>').join('')+'</select></div>'
      +'<div class="pcc203-tabs">'+views.map(([k,label,t])=>'<button type="button" class="pcc203-tab'+toneClass(t)+(state.view===k?' active':'')+'" data-pcc203-view="'+k+'"><b>'+c[k]+'</b><span>'+label+'</span></button>').join('')+'</div>'
      +'<div class="pcc203-current">Сейчас показано: <b>'+esc(views.find(x=>x[0]===state.view)?.[1]||state.view)+' · '+selected+'</b>'+qualitySummary()+'</div>';
  }finally{state.rendering=false}
}
function rerender(scroll=false){
  prepareDom();renderCenter();
  try{window.promoApprovalStageFilter='all'}catch(_){}
  try{renderPromotions()}catch(e){console.warn(V+' render',e)}
  setTimeout(()=>{prepareDom();renderCenter();if(scroll)root()?.scrollIntoView({behavior:'smooth',block:'start'})},0);
}
function setView(v,{scroll=true}={}){
  if(!views.some(x=>x[0]===v))return;
  state.view=v;
  if(v==='needs_close'||v==='decision')state.month='all';
  rerender(scroll);
}
function setClient(v){state.client=safe(v);rerender(true)}
function bind(){
  if(state.bound)return;state.bound=true;
  document.addEventListener('click',e=>{
    const legacyWork=e.target.closest?.('[data-v2368-work]');
    if(legacyWork){e.preventDefault();e.stopPropagation();state.manager='all';state.client='';state.group='';state.sku='';state.month='all';setView('active');return}
    const legacyDecision=e.target.closest?.('[data-v2368-open-action]');
    if(legacyDecision){e.preventDefault();e.stopPropagation();state.manager='all';state.client='';state.group='';state.sku='';state.month='all';setView('decision');return}
    const b=e.target.closest?.('[data-pcc203-view]');if(b){e.preventDefault();setView(b.dataset.pcc203View);return}
    if(e.target?.id==='promo54-close-filter'||e.target?.id==='promo54-show-ended'){e.preventDefault();e.stopPropagation();setView('needs_close');return}
  },true);
  document.addEventListener('change',e=>{
    const k=e.target?.dataset?.pcc203;if(!k)return;
    if(k==='manager')state.manager=e.target.value;
    if(k==='month')state.month=e.target.value;
    rerender(false);
  },true);
  document.addEventListener('input',e=>{
    const k=e.target?.dataset?.pcc203;if(!['client','group','sku'].includes(k))return;
    state[k]=e.target.value;rerender(false);
  },true);
}
function installRenderHook(){
  const f=window.renderPromotions;if(typeof f!=='function'||f.__pcc203)return;
  const base=f,fn=function(){prepareDom();renderCenter();const out=base.apply(this,arguments);setTimeout(()=>{prepareDom();renderCenter()},0);return out};
  fn.__pcc203=true;fn.__base=base;window.renderPromotions=fn;try{renderPromotions=fn}catch(_){}
}
function install(){
  bind();style();prepareDom();installRenderHook();if(active())renderCenter();
}
window.RESANTA_PROMOTIONS_CONTROL_CENTER_V236203=Object.freeze({
  version:V,enabled:true,state,matches,sort:sortRows,setView,setClient,repaint:renderCenter,
  views:views.map(x=>x[0]),singleSourceOfTruth:true,noPolling:true,noMutationObserver:true,noDataWrites:true
});
window.addEventListener('resanta:promotions-effectiveness',()=>{if(active()){renderCenter();try{renderPromotions()}catch(_){}}});
install();[100,400,1000,2500].forEach(ms=>setTimeout(install,ms));
})();