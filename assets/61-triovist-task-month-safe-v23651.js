/* RESANTA CRM v23.6.380 · TRIOVIST AI TASK MONTHS — isolated result truth
 * ONLY inside #tri-task-card. No DATA_HUB wrapping. No polling / MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_TASK_MONTH_SAFE_V23651)return;
const V='v23.6.382-decisions360-fact-v1',ALEKS='aleksandrenko_av@resanta.ru',KRIS='krishtal_na@resanta.ru';
const MANAGERS=[ALEKS,KRIS],LEADERS=['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru'];
const EXCLUDED=new Set(['cancelled','not_relevant']);
const FINAL=new Set(['verified','partial','not_achieved','cancelled','not_relevant']);
const WORKING=new Set(['new','accepted','in_progress','waiting_21vek']);
const CHECKING=new Set(['awaiting_check','submitted']);
const QUEUE_LABELS={work:'В работе (все этапы)',approval:'На согласовании',checking:'На проверке',late:'Просрочено'};
const QUEUE_STATUSES=new Set(['pending_approval',...CHECKING,'overdue']);
const STATUS={pending_approval:'На согласовании',new:'Новая',accepted:'Принята',in_progress:'В работе',waiting_21vek:'Ожидает 21vek',awaiting_check:'Ожидает проверки',partial:'Частично выполнена',verified:'Выполнена и подтверждена',not_achieved:'Не выполнена',overdue:'Просрочена',cancelled:'Отменена / заменена',not_relevant:'Неактуальна'};
let renderSeq=0,monthNotice=null;
let selected='',busy=false,lastKey='',lastAt=0,lastPack=null,packFlight=null,packFlightKey='',extrasFlight=null,extrasKey='',privateLogic=null,privateLogicOpen=false;
const profile=()=>{try{return window.currentProfile||currentProfile}catch(_){return window.currentProfile}};
const email=()=>String(profile()?.email||'').trim().toLowerCase();
const isLeader=()=>String(profile()?.role||'').toLowerCase()==='boss'&&LEADERS.includes(email());
const isPayushin=()=>email()==='payushin_ar@resanta.ru';
const isManager=()=>String(profile()?.access_scope||'').toLowerCase()==='triovist'&&MANAGERS.includes(email());
const canUse=()=>isLeader()||isManager();
const dbx=()=>{try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number(v)||0;
const money=v=>num(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const curMonth=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
const storageKey=()=>`triovist_task_month_safe_v23651|${email()}`;
function getMonth(){if(selected)return selected;try{selected=localStorage.getItem(storageKey())||curMonth()}catch(_){selected=curMonth()}if(!/^\d{4}-\d{2}$/.test(selected)||selected>curMonth())selected=curMonth();return selected}
function setMonth(m){selected=String(m||curMonth()).slice(0,7);if(!/^\d{4}-\d{2}$/.test(selected)||selected>curMonth())selected=curMonth();try{localStorage.setItem(storageKey(),selected)}catch(_){}lastKey='';lastPack=null}
function shift(m,n){const a=String(m).split('-').map(Number),d=new Date(a[0],a[1]-1+n,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
function monthLabel(m){const a=String(m).split('-').map(Number);return new Date(a[0],a[1]-1,1).toLocaleDateString('ru-RU',{month:'long',year:'numeric'}).replace(/^./,x=>x.toUpperCase())}
function dateLabel(v){const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?`${m[3]}.${m[2]}.${m[1]}`:'—'}
function businessDate(){
 const parts=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts();
 return ['year','month','day'].map(type=>parts.find(part=>part.type===type).value).join('-');
}
function taskBucket(task,today){
 const status=String(task.status||'');
 if(status==='pending_approval')return 'approval';
 if(CHECKING.has(status))return 'checking';
 if(status==='overdue')return 'late';
 if(!WORKING.has(status))return '';
 const due=String(task.due_date||'').slice(0,10);
 return /^\d{4}-\d{2}-\d{2}$/.test(due)&&due<today?'late':'work';
}
function managerName(e){return String(e||'').toLowerCase()===ALEKS?'Александренко':String(e||'').toLowerCase()===KRIS?'Кришталь':'—'}
async function rpc(name,args){const d=dbx();if(!d)throw new Error('Соединение с базой ещё не готово');const r=await d.rpc(name,args);if(r.error)throw r.error;return r.data}
function card(){return document.getElementById('tri-task-card')}
function isTaskTab(){const b=document.querySelector('#tr14-shell [data-tr14="tasks"]');return !!b?.classList.contains('on')}
function injectCss(){if(document.getElementById('tri-month-safe51-css'))return;const s=document.createElement('style');s.id='tri-month-safe51-css';s.textContent=`
#tri-month-safe-v23651{margin:0 0 14px;padding:13px 14px;border:1px solid var(--border);background:var(--card);border-radius:12px}.tm51-top{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.tm51-nav,.tm51-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.tm51-nav button,.tm51-actions button{border:1px solid var(--border);background:var(--card);border-radius:8px;padding:7px 10px;font-weight:700;cursor:pointer}.tm51-nav button:disabled{opacity:.45;cursor:not-allowed}.tm51-nav .primary,.tm51-actions .primary{background:var(--a);color:#fff;border-color:var(--a)}.tm51-month{min-width:170px;text-align:center;font-weight:900;color:var(--at)}.tm51-note{font-size:13px;color:var(--sub);line-height:1.45}.tm51-info{margin-top:8px;padding:9px 11px;border-radius:9px;background:var(--card);border:1px solid var(--border);font-size:12px;line-height:1.5}.tm51-filters{display:grid;grid-template-columns:190px 220px minmax(220px,1fr);gap:8px;margin-top:12px}.tm51-filters select,.tm51-filters input{width:100%;border:1px solid var(--border);border-radius:8px;padding:8px 10px;background:var(--card)}.tm51-task{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:11px;margin-top:8px}.tm51-task-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.tm51-title{font-weight:900}.tm51-pills{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.tm51-pill{display:inline-flex;padding:3px 7px;border-radius:99px;background:var(--bg);font-size:10px;font-weight:800}.tm51-status-verified{background:var(--gb);color:var(--g)}.tm51-status-partial{background:var(--amb);color:var(--am)}.tm51-status-not_achieved,.tm51-status-overdue{background:var(--rb);color:var(--r)}.tm51-result{margin-top:8px;padding:8px 10px;border-radius:8px;background:var(--bg);font-size:12px}.tm51-result b{font-weight:900}.tm51-listing{margin-top:8px;padding:9px 10px;border-radius:8px;background:var(--gb);border:1px solid var(--border);font-size:12px;line-height:1.5;color:var(--g)}.tm51-listing b{font-weight:900}.tm51-listing-mini{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.tm51-listing-chip{display:inline-flex;padding:3px 7px;border-radius:999px;background:var(--card);border:1px solid var(--border);font-size:10px;font-weight:800}.tm51-listing-table{margin-top:7px;border:1px solid var(--border);border-radius:8px;overflow:hidden}.tm51-listing-row{display:grid;grid-template-columns:110px 90px 90px minmax(170px,1fr);gap:8px;padding:6px 8px;border-top:1px solid var(--gb);font-size:11px}.tm51-listing-row:first-child{border-top:0}.tm51-listing-row.head{background:var(--gb);font-weight:800}.tm51-details{margin-top:8px;font-size:12px;line-height:1.5;color:var(--text)}.tm51-empty{padding:18px;text-align:center;color:var(--sub);background:var(--card);border:1px dashed var(--border);border-radius:10px;margin-top:10px}
.tm51-stock-list{margin-top:7px;border:1px solid var(--border);border-radius:9px;overflow:hidden}.tm51-stock-row{display:grid;grid-template-columns:minmax(120px,1.35fr) 88px 76px 90px 88px minmax(150px,1.4fr);gap:8px;align-items:center;padding:7px 9px;border-top:1px solid var(--border);font-size:11px}.tm51-stock-row:first-child{border-top:0}.tm51-stock-row.head{background:var(--bg);font-weight:800;color:var(--sub)}.tm51-stock-ok{color:var(--g);font-weight:800}.tm51-stock-low{color:var(--am);font-weight:800}.tm51-stock-zero{color:var(--r);font-weight:800}.tm51-stock-unknown{color:var(--sub);font-weight:800}@media(max-width:760px){.tm51-stock-row{grid-template-columns:1fr 70px 70px}.tm51-stock-row>*:nth-child(4),.tm51-stock-row>*:nth-child(5),.tm51-stock-row>*:nth-child(6){grid-column:1/-1}}
.tm51-private{margin-top:10px;padding:11px 12px;border:1px solid var(--border);background:var(--bg);border-radius:10px;font-size:12px;line-height:1.5}.tm51-private h4{margin:0 0 7px;color:var(--text)}.tm51-private ul{margin:6px 0 0 18px;padding:0}.tm51-private li{margin:4px 0}.tm51-private .missing{margin-top:10px;padding:8px 10px;background:var(--amb);border:1px solid var(--border);border-radius:8px;color:var(--am)}
#tri-task-card.tri-month-safe51>.tri-task-kpis,#tri-task-card.tri-month-safe51>.tri-task-filters,#tri-task-card.tri-month-safe51>.card-title,#tri-task-card.tri-month-safe51>#tri-task-list,#tri-task-card.tri-month-safe51>#tri-task-ranking,#tri-task-card.tri-month-safe51>#tri-task-groups{display:none!important}@media(max-width:760px){.tm51-filters{grid-template-columns:1fr}.tm51-month{min-width:135px}}

#tri-month-safe-v23651 .tm51-heading{position:relative;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#tri-month-safe-v23651 .tm51-heading h3{margin:0;font-size:21px;font-weight:700}
#tri-month-safe-v23651 .tm51-nav{width:100%}
#tri-month-safe-v23651 .tm51-nav button{min-height:36px;color:var(--a);font:inherit;font-weight:600}
#tri-month-safe-v23651 .tm51-nav button.primary{color:white}
#tri-month-safe-v23651 .tm51-month{font-weight:700;min-width:0;padding:0 5px}
#tri-month-safe-v23651 .tm51-help{display:inline-flex}
#tri-month-safe-v23651 .tm51-help button{width:28px;height:28px;border:1px solid var(--border);border-radius:8px;color:var(--a);background:var(--card);font:inherit;font-size:17px;font-weight:700;cursor:pointer}
#tri-month-safe-v23651 .tm51-help .tm51-tip{display:none;pointer-events:none;position:absolute;z-index:6;inset:100% auto auto 0;width:min(351px,100%);border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:13px;line-height:1.45;background:var(--card);color:var(--text);box-shadow:0 4px 14px #11182720}
#tri-month-safe-v23651 .tm51-help:is(:hover,:focus-within) .tm51-tip{display:block}
#tri-month-safe-v23651 .tm51-month-feedback:empty{display:none}
#tri-month-safe-v23651 .tm51-month-feedback{margin:9px 0;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg);font-size:13px}
#tri-month-safe-v23651 .tm51-month-feedback[data-kind="success"]{background:var(--gb);color:var(--g)}
#tri-month-safe-v23651 .tm51-month-feedback[data-kind="error"]{background:var(--rb);color:var(--r)}
#tri-task-card.tri-month-safe51 > :is(.tri-task-head,.tri-task-note,#tri-task-banner,div:has(> #tri-task-manager-wrap)){display:none!important}
#tri-month-safe-v23651 .tm51-brain-step{position:relative;margin-top:9px;padding:10px 12px;border-radius:9px;background:var(--bg);font-size:13px;line-height:1.5}
#tri-month-safe-v23651 .tm51-step-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px}
#tri-month-safe-v23651 .tm51-step-head b{font-size:14px}
#tri-month-safe-v23651 .tm51-metrics,#tri-month-safe-v23651 .tm51-listing-mini{display:flex;flex-wrap:wrap;gap:4px 16px}
#tri-month-safe-v23651 .tm51-tip span{display:block;margin:4px 0}
#tri-month-safe-v23651 .tm51-brain-step>.tm51-step-head .tm51-tip{inset:42px 10px auto auto;width:min(390px,calc(100% - 20px))}
#tri-month-safe-v23651 .tm51-sku-check{display:inline-flex;align-items:center;gap:5px;color:var(--am);font-size:12px;font-weight:700}
#tri-month-safe-v23651 .tm51-sku-check .tm51-tip{inset:auto 10px 5px auto;width:min(390px,calc(100% - 20px));transform:translateY(100%)}
#tri-month-safe-v23651 .tm51-sku-check .tm51-help button{width:23px;height:23px}
#tri-month-safe-v23651 .tm51-listing-examples>summary{padding:6px 0}
#tri-month-safe-v23651 .tm51-listing-snapshot{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:9px 0 5px}
#tri-month-safe-v23651 .tm51-snapshot-result:not(:empty){margin-top:8px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--card)}
#tri-month-safe-v23651 .tm51-snapshot-result ul{margin:4px 0 0;padding-inline-start:18px}
#tri-month-safe-v23651 .tm51-snapshot-result li{margin:3px 0}
#tri-month-safe-v23651 .tm51-matches[hidden]{display:none!important}
`;document.head.appendChild(s)}
function ensureRoot(){if(!canUse())return null;injectCss();const c=card();if(!c)return null;if(isTaskTab())c.style.setProperty('display','block','important');c.classList.add('tri-month-safe51');document.getElementById('tri-month-safe-v23650')?.remove();c.classList.remove('tri-month-safe50','tri-month-safe50-past');let r=document.getElementById('tri-month-safe-v23651');if(!r){r=document.createElement('div');r.id='tri-month-safe-v23651';
 const assignment=c.querySelector(':scope > #tri-ai179');
 if(assignment)assignment.after(r);else c.prepend(r);
 }return r}
async function loadExtras(key,m,mgr){
 if(extrasFlight&&extrasKey===key)return extrasFlight;
 extrasKey=key;
 extrasFlight=(async()=>{
   let summary=null,policy=null,facts=null;
   const extra=await Promise.allSettled([
     rpc('triovist_month_summary_v23647',{p_month:m+'-01',p_manager_email:mgr}),
     rpc('triovist_motivation_get_policy',{}),
     rpc('triovist_decisions360_task_facts_v1',{p_month:m+'-01',p_manager_email:mgr})
   ]);
   if(extra[0].status==='fulfilled')summary=extra[0].value;
   if(extra[1].status==='fulfilled')policy=extra[1].value;
   if(extra[2].status==='fulfilled')facts=extra[2].value;
   else facts={error:String(extra[2].reason?.message||extra[2].reason),facts:[]};
   if(lastKey!==key||getMonth()!==m||!lastPack)return;
   if(summary)lastPack.summary=summary;
   if(policy)lastPack.policy=policy;
   if(facts)lastPack.facts=facts;
   lastAt=Date.now();
   if(isTaskTab())setTimeout(()=>render(false),0);
 })().finally(()=>{extrasFlight=null;extrasKey=''});
 return extrasFlight;
}
async function loadPack(force=false){
 const m=getMonth(),mgr=isLeader()?null:email(),key=m+'|'+(mgr||'all');
 if(!force&&lastPack&&lastKey===key&&Date.now()-lastAt<60000)return lastPack;
 if(packFlight&&packFlightKey===key)return packFlight;
 packFlightKey=key;
 const flight=(async()=>{
   const dash=await rpc('triovist_tasks_get_dashboard_month_v23648',{p_manager_email:mgr,p_month:m+'-01'});
   if(getMonth()!==m)return {dash:dash||{tasks:[]}};
   const previous=lastKey===key&&lastPack?lastPack:null;
   lastKey=key;lastAt=Date.now();
   lastPack={dash:dash||{tasks:[]},summary:previous?.summary||{managers:[]},policy:previous?.policy||{},
    listingChecks:previous?.listingChecks||new Map()};
   loadExtras(key,m,mgr).catch(()=>{});
   return lastPack;
 })().finally(()=>{if(packFlight===flight){packFlight=null;packFlightKey=''}});
 packFlight=flight;
 return flight;
}
function taskCtx(t){const snap=t?.task_snapshot?.commercial_context||{},ctx=t?.commercial_context||{};return Object.keys(ctx).length?ctx:snap}
function taskItems(t){const ctx=taskCtx(t),a=Array.isArray(t?.items)&&t.items.length?t.items:null;return a||(Array.isArray(ctx.plan_items)?ctx.plan_items:[])}
function listingItems(items){return (items||[]).filter(x=>Number(x?.listing_risk||0)>0&&String(x?.listing_target||'').trim())}
function listingActions(t,items){const ctx=taskCtx(t),a=Array.isArray(ctx?.listing_actions)?ctx.listing_actions:null;if(a&&a.length)return a;return listingItems(items).slice(0,10).map(x=>({sku:x.sku,product_name:x.product_name,action_label:x.listing_target,current_position:x.listing_position,previous_reference_position:x.previous_listing_position,target_position:String(x.listing_target||'').includes('TOP-30')?30:String(x.listing_target||'').includes('TOP-60')?60:x.previous_listing_position,keyword:x.listing_keyword}))}

function isBrainstormTask(t){return String(t?.generator_version||'')==='uni-brainstorm-subgroup-v2'}
function cardHelp(id,label,lines){
 return `<span class="tm51-help"><button type="button" aria-label="${esc(label)}" aria-describedby="${esc(id)}">*</button>
 <span class="tm51-tip" id="${esc(id)}" role="tooltip">${lines.filter(Boolean).map(line=>'<span>'+esc(line)+'</span>').join('')}</span></span>`;
}
function listingRankHtml(x,id){
 const sku=x.sku||'—',position=Number(x.position);
 if(position>0)return `<span class="tm51-listing-chip">${esc(sku)} · №${esc(position)}</span>`;
 const context=x.listing_state==='not_in_fresh_registry'?'В последнем реестре 21vek этой позиции не было.'
  :x.listing_state==='out_of_stock'?'В сохранённом реестре карточка отмечена как отсутствующая в наличии.'
  :x.registered&&x.card_in_stock===true?'В сохранённом реестре 21vek товар указан в наличии.':'';
 const query=x.keyword?' по запросу «'+x.keyword+'»':'';
 const history=x.position_last_exact>0?'Ранее зафиксировано место №'+x.position_last_exact+
  (x.position_last_seen?' от '+dateLabel(x.position_last_seen):'')+'.':'';
 return `<span class="tm51-sku-check">${esc(sku)} · Проверить позицию${cardHelp(id,'Что проверить для SKU '+sku,[
  context,'В снимке задачи номер позиции'+query+' в выдаче 21vek не зафиксирован. Место в TOP-60 неизвестно.',
  history,'Откройте выдачу 21vek'+query+', найдите карточку по артикулу и запишите результат.'
 ])}</span>`;
}
const listingKeyword=value=>String(value||'').trim().toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ');
function listingSnapshotLabel(row,depth){
 if(!row)return 'Нет данных в снимке парсера';
 if(row.current_error||row.current_label==='Ошибка')return 'Парсер сообщил об ошибке';
 const position=Number(row.current_position);
 if(row.current_exact===true&&Number.isInteger(position)&&position>0)return '№'+position;
 if(row.current_top60===false&&row.current_label==='>60'&&depth===60)return 'Не найден в TOP-60';
 return 'Место не подтверждено';
}
async function readListingGroup(manager,search,samples){
 const read=term=>rpc('triovist_own_listing_positions_v236351',{
  p_manager_email:manager,p_search:term,p_limit:300,p_offset:0,p_movement:null
 });
 const select=(result,sample)=>{
  const matches=(result.rows||[]).filter(row=>String(row.sku||'').trim()===sample.sku&&
   String(row.manager_email||'').toLowerCase()===manager&&
   (!sample.keyword||listingKeyword(row.keyword)===listingKeyword(sample.keyword)));
  return {row:matches.length===1?matches[0]:null,depth:result.position_depth,ambiguous:matches.length>1};
 };
 const result=await read(search);
 if(!Array.isArray(result?.rows))throw Error('Не получен снимок парсера');
 return Promise.all(samples.map(async sample=>{
  let match=select(result,sample);
  if(!match.row&&!match.ambiguous&&result.has_more&&search!==sample.sku){
   try{match=select(await read(sample.sku),sample)}
   catch(_){return {sku:sample.sku,keyword:sample.keyword,unavailable:true}}
  }
  return {sku:sample.sku,keyword:sample.keyword,...match};
 }));
}
function listingCheckHtml(result){
 if(!result)return '';
 if(result.loading)return 'Читаю последний сохранённый снимок парсера…';
 if(result.error)return 'Не удалось сверить позиции. Повторите проверку.';
 return '<b>Последний сохранённый снимок парсера</b><ul>'+result.rows.map(({sku,keyword,row,depth,ambiguous,unavailable})=>{
  const label=unavailable?'Сверка недоступна':ambiguous?'Есть несколько совпадений':listingSnapshotLabel(row,depth);
  const date=row?.current_observed_at?dateLabel(row.current_observed_at):'';
  const query=row?.keyword||keyword;
  return '<li><b>'+esc(sku)+'</b> · '+esc(label)+(date?' · '+esc(date):'')+(query?' · «'+esc(query)+'»':'')+'</li>';
 }).join('')+'</ul>';
}
async function verifyListingSnapshot(button){
 const id=button.dataset.tm51ListingCheck,pack=lastPack,checks=pack?.listingChecks;
 const task=pack?.dash?.tasks?.find(row=>String(row.id)===id);
 if(!task||!checks||checks.get(id)?.loading)return;
 const manager=String(task.manager_email||'').toLowerCase();
 if(!MANAGERS.includes(manager)||(!isLeader()&&manager!==email()))return;
 const samples=new Map(),examples=taskCtx(task).listing_samples;
 if(!Array.isArray(examples))return;
 for(const row of examples){
  const sku=String(row.sku||'').trim();
  if(sku)samples.set(sku,{sku,keyword:String(row.keyword||'').trim()});
 }
 if(!samples.size)return;
 const update=result=>{
  checks.set(id,result);
  if(lastPack?.listingChecks!==checks)return;
  const panel=document.getElementById('tm51-snapshot-'+id);
  if(!panel)return;
  panel.innerHTML=listingCheckHtml(result);
  const control=panel.previousElementSibling?.querySelector('[data-tm51-listing-check]');
  if(control)control.disabled=!!result.loading;
 };
 update({loading:true});
 try{
  const groups=new Map();
  for(const sample of samples.values()){
   const search=sample.keyword||sample.sku;
   if(!groups.has(search))groups.set(search,[]);
   groups.get(search).push(sample);
  }
  const entries=[...groups];
  const results=await Promise.allSettled(entries.map(([search,group])=>readListingGroup(manager,search,group)));
  if(results.every(result=>result.status==='rejected')){update({error:true});return}
  const bySku=new Map(results.flatMap((result,i)=>result.status==='fulfilled'?result.value:
   entries[i][1].map(sample=>({...sample,unavailable:true}))).map(row=>[row.sku,row]));
  update({rows:[...samples.keys()].map(sku=>bySku.get(sku))});
 }catch(_){update({error:true})}
}
function brainListingHtml(t){
 const ctx=taskCtx(t),examples=Array.isArray(ctx.listing_samples)?ctx.listing_samples:[],id='tm51-listing-'+t.id;
 const ranks=(items,start)=>items.map((row,i)=>listingRankHtml(row,id+'-'+(start+i))).join('');
 const help=cardHelp(id,'Правила проверки листинга',[
  ctx.listing_text,'Менеджер направляет отчёт. Паюшин подтверждает результат. Если место не зафиксировано, проверьте выдачу вручную. Денежный объём проверяется отдельно.'
 ]);
 const verified=!!ctx.listing_verified_by;
 const result=lastPack?.listingChecks?.get(String(t.id));
 return `<section class="tm51-brain-step">
  <div class="tm51-step-head"><b>2. ${verified?'Листинг подтверждён':'Проверить листинг'}</b>${help}</div>
  ${verified?'':'<div>Сверьте позиции в выдаче 21vek, наличие, цены и карточки. Запишите результат и отправьте отчёт.</div>'}
  ${examples.length?`<div class="tm51-listing-snapshot"><span class="tm51-note">Позиции при постановке задачи${t.created_at?' · '+dateLabel(t.created_at):''}</span>
   <div class="tm51-actions"><button type="button" data-tm51-listing-check="${esc(t.id)}"${result?.loading?' disabled':''}>Сверить со снимком парсера</button></div>
  </div><div id="tm51-snapshot-${esc(t.id)}" class="tm51-snapshot-result" role="status">${listingCheckHtml(result)}</div>
  <div class="tm51-listing-mini">${ranks(examples.slice(0,8),0)}</div>`:''}
  ${examples.length>8?`<details class="tm51-listing-examples"><summary>Ещё SKU (${examples.length-8})</summary><div class="tm51-listing-mini">${ranks(examples.slice(8),8)}</div></details>`:''}
 </section>`;
}
function brainResultHtml(t){
 const ctx=taskCtx(t)||{},data=lastPack?.facts||null;
 const live=(data?.facts||[]).find(x=>String(x.task_id)===String(t.id));
 const hasSource=live?.fact_by_task!=null&&data?.source_rows>0;
 const fact=hasSource?Number(live.fact_by_task):null;
 const moneyProgress=hasSource&&Number(t.target_revenue)>0
   ?Math.min(100,Math.max(0,fact/Number(t.target_revenue)*100)):null;
 const sourceStatus=!data?'Проверка факта загружается из 1С…'
   :data.error?'Сверка 1С недоступна: '+String(data.error)
   :!hasSource?'Сопоставимый факт не определён — не подменяем его нулём.'
   :live.fact_status==='no_matched_sales'?'В загруженных продажах 1С совпадений по этой подгруппе и бренду пока нет.'
   :'Подгруппа и бренд сопоставлены с первичными строками продаж 1С.';
 const listing=ctx.listing_verified_by?'Отчёт по листингу подтверждён Паюшиным.':'Листинг требует проверки.';
 const check=t.result_checked_at?'Результат задачи проверен '+dateLabel(t.result_checked_at)
   :'Продажи — текущий факт; итог задачи и премию подтверждает руководитель.';
 const progress=moneyProgress==null?'—':moneyProgress.toLocaleString('ru-RU',{maximumFractionDigits:1})+'%';
 const source='Источник: '+(data?.source||'продажи 1С')+' · обновлено '+dateLabel(data?.sales_imported_at)+
  ' · совпавших строк: '+(live?.matched_lines??'—')+'.';
 const help=cardHelp('tm51-sales-'+t.id,'Источник продаж и правила подтверждения',[
  sourceStatus,source,'Факты нескольких задач не суммировать: одна отгрузка может относиться к нескольким поручениям.',listing,check
 ]);
 return `<section class="tm51-brain-step"><div class="tm51-step-head"><b>1. Выполнить план продаж</b>${help}</div>
  <div class="tm51-metrics"><span>Цель <strong>${t.target_revenue==null?'—':money(t.target_revenue)}</strong></span>
  <span>Факт 1С <strong>${hasSource?money(fact):'Не определён'}</strong></span><span>Выполнение <strong>${progress}</strong></span></div></section>`;
}

function listingProgressActions(t){const p=taskCtx(t)?.listing_progress;return Array.isArray(p?.actions)?p.actions:[]}
function posLabel(v){const n=Number(v);return Number.isFinite(n)&&n>0?String(n):'вне TOP-60'}
function taskListingHtml(t,items){
 if(isBrainstormTask(t))return brainListingHtml(t);
 const ctx=taskCtx(t),xs=listingActions(t,items),p=ctx?.listing_progress||{},total=Number(ctx?.listing_action_total||xs.length||0),problem=Number(ctx?.listing_problem_total||ctx?.listing_problem_count||total||0),done=Number(p?.completed||ctx?.listing_completed_count||0);
 if(!total)return'';
 const chips=xs.slice(0,4).map(x=>'<span class="tm51-listing-chip">'+esc(x.sku||'—')+': '+esc(posLabel(x.current_position))+' → '+esc(x.action_label||'цель листинга')+'</span>').join('');
 const progress=Number.isFinite(done)&&done>0?(' · уже выполнено <b>'+done+'/'+total+'</b>'): '';
 return '<div class="tm51-listing"><b>📈 Конкретная задача по листингу:</b> отработать <b>'+total+' SKU</b> из '+problem+' проблемных'+progress+'.<div style="margin-top:5px"><b>'+esc(ctx?.listing_action_summary||'')+'</b></div>'+(chips?'<div class="tm51-listing-mini">'+chips+'</div>':'')+'<div class="tm51-note" style="color:#166534;margin-top:5px">Источник — наш парсер 21vek. Текущая позиция свежая до 72 часов; «вернуть» определяется по истории до 30 дней.</div></div>';
}
function taskListingDetails(t,items){
 if(isBrainstormTask(t))return '';
 const ctx=taskCtx(t),base=listingActions(t,items),live=listingProgressActions(t),liveBySku=new Map(live.map(x=>[String(x.sku||''),x])),xs=base.map(x=>Object.assign({},x,liveBySku.get(String(x.sku||''))||{}));if(!xs.length)return'';
 return '<div style="margin-top:9px"><b>📈 Что конкретно сделать по листингу:</b><div class="tm51-listing-table"><div class="tm51-listing-row head"><span>SKU</span><span>Сейчас</span><span>Цель</span><span>Действие</span></div>'+xs.slice(0,10).map(x=>'<div class="tm51-listing-row"><span><b>'+esc(x.sku||'—')+'</b><br><span class="tm51-note">'+esc(x.keyword||x.keyword_now||'')+'</span></span><span>'+esc(posLabel(x.current_position_now!=null?x.current_position_now:x.current_position))+(x.completed===true?' ✅':'')+'</span><span><b>≤ '+esc(x.target_position==null?'—':String(x.target_position))+'</b></span><span><b>'+esc(x.action_label||'—')+'</b></span></div>').join('')+'</div></div>';
}
function stockStateLabel(x){
 const s=String(x?.stock_strategy||'unknown');
 if(x?.partner_stock_available===false||x?.partner_total==null)return['Неизвестно','tm51-stock-unknown'];
 if(s==='zero')return['Нет свободного остатка','tm51-stock-zero'];
 if(s==='low')return['Низкий запас','tm51-stock-low'];
 if(s==='overstock')return['Высокий запас','tm51-stock-ok'];
 return['Сбалансирован','tm51-stock-ok']
}
function stockNum(v,d=1){if(v==null||v==='')return'—';const x=Number(v);return Number.isFinite(x)?x.toLocaleString('ru-RU',{maximumFractionDigits:d}):'—'}
function taskStockHtml(items){
 if(!items?.length)return'';
 return '<div style="margin-top:9px"><b>Наличие 21vek по приоритетным SKU:</b><div class="tm51-note">Источник для ИИ — колонка 10 «Свободно». «В пути» показано отдельно и не прибавляется к доступному остатку.</div><div class="tm51-stock-list">'
  +'<div class="tm51-stock-row head"><span>SKU / товар</span><span>Свободно</span><span>В пути</span><span>Темп / мес.</span><span>Покрытие</span><span>Статус</span></div>'
  +items.slice(0,12).map(x=>{const st=stockStateLabel(x),eligible=x?.sales_priority_eligible!==false;return '<div class="tm51-stock-row"><span><b>'+esc(x.sku||'—')+'</b><br><span class="tm51-note">'+esc(x.product_name||'')+'</span></span><span><b>'+stockNum(x.partner_total,0)+'</b> шт.</span><span>'+stockNum(x.partner_in_transit,0)+' шт.</span><span>'+stockNum(x.partner_sales_velocity,1)+'</span><span>'+stockNum(x.stock_cover_months,2)+' мес.</span><span class="'+st[1]+'">'+esc(st[0])+(eligible?' · приоритет':' · не приоритет продаж')+'</span></div>'}).join('')
  +'</div></div>'
}
function resultBox(t){if(isBrainstormTask(t))return brainResultHtml(t);if(t.target_revenue==null&&t.result_revenue==null)return '<div class="tm51-result">Автопроверка результата ещё не выполнялась.</div>';const ratio=t.result_ratio==null?'—':num(t.result_ratio).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%',ctx=taskCtx(t),lp=ctx?.listing_progress||{},lt=Number(ctx?.listing_action_total||lp?.total||0),ld=Number(ctx?.listing_completed_count||lp?.completed||0),lu=Number(ctx?.listing_unknown_count||lp?.unknown||0),listing=lt?(' · листинг <b>'+ld+'/'+lt+'</b>'+(lu?' · без свежего снимка '+lu:'')):'',rule=lt?'<div class="tm51-note"><b>Полное выполнение:</b> денежная цель + все '+lt+' зафиксированных SKU по листингу. На закрытии месяца берётся последний снимок парсера в финальные 72 часа.</div>':'';return `<div class="tm51-result"><b>Автоматическая проверка:</b> старт ${money(t.baseline_revenue)} → факт <b>${money(t.result_revenue)}</b> → цель ${money(t.target_revenue)} · продажи <b>${ratio}</b>${listing}<div class="tm51-note">${esc(t.result_source||'Продажи 21vek')}${t.result_checked_at?' · проверено '+new Date(t.result_checked_at).toLocaleString('ru-RU'):''}</div>${rule}</div>`}
function taskButtons(t){const s=String(t.status||''),past=getMonth()<curMonth(),out=[];if(isLeader()){if(s==='pending_approval'&&isPayushin())out.push(['approve','✅ Согласовать','primary']);if(isPayushin()&&isBrainstormTask(t)&&s==='awaiting_check')out.push(['verify_listing','✅ Проверить объём и листинг','primary']);if(past&&s!=='verified'&&s!=='cancelled'&&s!=='not_relevant')out.push(['not_relevant','Исключить как неактуальную','']);else if(!past&&!FINAL.has(s)){out.push(['not_relevant','Неактуальна','']);out.push(['cancel','Отменить',''])}}else if(!past&&String(t.manager_email||'').toLowerCase()===email()){if(s==='new')out.push(['accept','Принять','primary']);if(s==='accepted')out.push(['start','Начать','primary']);if(['in_progress','partial','overdue'].includes(s))out.push(['waiting_21vek','Ожидаю 21vek','']);if(['in_progress','waiting_21vek','partial','overdue'].includes(s))out.push(['submit_check','Отправить на проверку','primary']);if(!FINAL.has(s))out.push(['comment','Комментарий',''])}return out.map(x=>`<button class="${x[2]}" data-tm51-action="${x[0]}" data-task-id="${esc(t.id)}">${x[1]}</button>`).join('')}
function taskHtml(t,today){
 const items=taskItems(t),s=String(t.status||''),bucket=taskBucket(t,today);
 const samples=taskCtx(t).listing_samples;
 const listingSkus=Array.isArray(samples)?samples.map(x=>x.sku):[];
 const hasListing=listingItems(items).length>0||Number(taskCtx(t)?.listing_problem_count||0)>0;return `<div class="tm51-task" data-manager="${esc(String(t.manager_email||'').toLowerCase())}" data-status="${esc(s)}" data-bucket="${bucket}" data-excluded="${EXCLUDED.has(s)?'1':'0'}" data-search="${esc([t.title,t.group_name,t.manager_name,t.task_text,...listingSkus,...items.flatMap(x=>[x.sku,x.product_name,x.listing_target])].join(' ').toLowerCase())}"><div class="tm51-task-head"><div><div class="tm51-title">${esc(t.title||'Задача')}</div><div class="tm51-pills"><span class="tm51-pill tm51-status-${esc(s)}">${esc(STATUS[s]||s)}</span><span class="tm51-pill">${esc(t.manager_name||managerName(t.manager_email))}</span><span class="tm51-pill">${esc(t.group_name||'Без группы')}</span>${hasListing?'<span class="tm51-pill" style="background:#dcfce7;color:#166534">📈 Листинг ↑</span>':''}<span class="tm51-pill${bucket==='late'?' tm51-status-overdue':''}">${bucket==='late'?'Срок истёк ':'до '}${dateLabel(t.due_date)}</span></div></div></div>${resultBox(t)}${taskListingHtml(t,items)}<details class="tm51-details"><summary style="cursor:pointer;font-weight:800">Подробности задачи и комментарии</summary><div style="margin-top:7px"><b>Что сделать:</b><br>${esc(t.task_text||'—').replace(/\n/g,'<br>')}</div>${t.expected_result?`<div style="margin-top:7px"><b>Ожидаемый результат:</b><br>${esc(t.expected_result)}</div>`:''}${t.result_summary?`<div style="margin-top:7px"><b>Последняя проверка:</b><br>${esc(t.result_summary)}</div>`:''}${t.manager_comment?`<div style="margin-top:7px"><b>Комментарий менеджера:</b><br>${esc(t.manager_comment)}</div>`:''}${t.leader_comment?`<div style="margin-top:7px"><b>Комментарий руководителя:</b><br>${esc(t.leader_comment)}</div>`:''}${items.length?`<div style="margin-top:7px"><b>Приоритетные SKU:</b> ${items.slice(0,12).map(x=>esc(x.sku||x.product_name||'—')).join(', ')}</div>`:''}${taskListingDetails(t,items)}${taskStockHtml(items)}</details><div class="tm51-actions" style="margin-top:8px">${taskButtons(t)}</div></div>`}
function applyFilters(root){
 const manager=root.querySelector('#tm51-manager')?.value||'all';
 const status=root.querySelector('#tm51-status')?.value||'work';
 const search=String(root.querySelector('#tm51-search')?.value||'').trim().toLowerCase();
 let hasMatches=false;
 root.querySelectorAll('.tm51-task').forEach(row=>{
  const statusOk=status==='all'||(status==='work'&&row.dataset.excluded!=='1')||
   (status==='archive'&&row.dataset.excluded==='1')||status==='bucket:'+row.dataset.bucket||row.dataset.status===status;
  const visible=(manager==='all'||row.dataset.manager===manager)&&statusOk&&(!search||String(row.dataset.search||'').includes(search));
  row.style.display=visible?'block':'none';
  if(visible)hasMatches=true;
 });
 const empty=root.querySelector('#tm51-no-matches');
 if(empty)empty.hidden=hasMatches;
}
function readMonthView(r){
 const controls=['manager','status','search'].map(key=>r.querySelector('#tm51-'+key));
 const focused=controls.findIndex(el=>el&&el===document.activeElement);
 const search=focused===2?controls[2]:null;
 return {filters:controls.map(el=>el?.value??null),focused,selection:search?[search.selectionStart,search.selectionEnd]:null,
  details:r.querySelector('.tm360-detail')?.open};
}
function restoreMonthView(r,view){
 if(!view)return;
 ['manager','status','search'].forEach((key,i)=>{
  const element=r.querySelector('#tm51-'+key),value=view.filters[i];
  if(!element||value===null)return;
  if(key==='search'||[...element.options].some(option=>option.value===value))element.value=value;
  if(i===view.focused){
   element.focus({preventScroll:true});
   if(view.selection)element.setSelectionRange(...view.selection);
  }
 });
 const details=r.querySelector('.tm360-detail');
 if(details&&view.details!==undefined)details.open=view.details;
}
function showMonthNotice(r,m){
 const notice=monthNotice?.month===m?monthNotice:null;
 const line=r?.querySelector('.tm51-month-feedback');
 if(line){line.dataset.kind=notice?.kind||'';line.textContent=notice?.text||'';}
 const button=r?.querySelector('[data-tm51="refresh"]');
 if(button){
  const waiting=notice?.kind==='pending';
  button.disabled=waiting;
  button.setAttribute('aria-busy',String(waiting));
  button.textContent=waiting?'Обновляю задачи…':'Обновить задачи месяца';
 }
}
async function render(force=false){
 if(!canUse())return false;
 const r=ensureRoot();if(!r)return false;
 const m=getMonth(),seq=++renderSeq;
 if(r.dataset.tm51Month!==m){
  delete r.dataset.tm51Month;
  r.innerHTML='<div class="tm51-note" role="status">Загружаю задачи · '+esc(monthLabel(m))+'…</div>';
 }
 let pack;
 try{pack=await loadPack(force)}
 catch(e){
  if(seq===renderSeq&&getMonth()===m){
   const text='Не удалось загрузить задачи за месяц. '+String(e?.message||e);
   if(r.dataset.tm51Month===m){monthNotice={month:m,kind:'error',text};showMonthNotice(r,m);}
   else r.innerHTML='<div class="tm51-info" role="alert">'+esc(text)+'</div><div class="tm51-nav"><button data-tm51="retry">Повторить загрузку</button><button data-tm51="now">Текущий месяц</button></div>';
  }
  return false;
 }
 if(getMonth()!==m||!r.isConnected)return false;
 if(seq!==renderSeq)return true;
 const view=r.dataset.tm51Month===m?readMonthView(r):null;
 const tasks=Array.isArray(pack.dash?.tasks)?pack.dash.tasks:[];

 const visible=tasks.filter(t=>isLeader()||String(t.manager_email||'').toLowerCase()===email());
 const past=m<curMonth();
 const close=isLeader()&&past?(pack.summary?.managers||[]).filter(row=>!row.closed&&num(row.open)===0):[];
 const today=businessDate();
 const states=[...new Set(visible.map(t=>String(t.status||'')).filter(Boolean))].sort();
 r.innerHTML=`<div class="tm51-top">
  <div class="tm51-heading"><h3>Задачи ИИ · ${esc(monthLabel(m))}</h3><span class="tm51-help"><button type="button" aria-label="Какие задачи видны за месяц" aria-describedby="tm51-visibility-tip">*</button><span id="tm51-visibility-tip" class="tm51-tip" role="tooltip">Руководитель видит задачи обоих менеджеров. Менеджер видит только свои задачи.</span></span></div>
  <div class="tm51-nav"><button data-tm51="prev" aria-label="Предыдущий месяц">‹</button><span class="tm51-month">${esc(monthLabel(m))}</span><button data-tm51="next" aria-label="Следующий месяц" ${m>=curMonth()?'disabled':''}>›</button><button data-tm51="now">Текущий месяц</button><button class="primary" data-tm51="refresh">Обновить задачи месяца</button></div>
 </div>
 <div class="tm51-month-feedback" role="status" aria-live="polite"></div>
 ${close.length?`<div class="tm51-actions">${close.map(row=>`<button type="button" data-tm51-close="${esc(row.manager_email)}">Закрыть месяц · ${esc(row.manager_name||managerName(row.manager_email))}</button>`).join('')}</div>`:''}
 <div class="tm51-filters">${isLeader()?`<select id="tm51-manager"><option value="all">Оба менеджера</option>${MANAGERS.map(x=>`<option value="${x}">${managerName(x)}</option>`).join('')}</select>`:'<div></div>'}<select id="tm51-status"><option value="work">Рабочие задачи</option><option value="all">Все статусы</option><option value="archive">Отменённые / неактуальные</option>${Object.entries(QUEUE_LABELS).map(([key,label])=>`<option value="bucket:${key}">${label}</option>`).join('')}${states.filter(x=>!EXCLUDED.has(x)&&!QUEUE_STATUSES.has(x)).map(x=>`<option value="${esc(x)}">${esc(STATUS[x]||x)}</option>`).join('')}</select>
  <input id="tm51-search" placeholder="Поиск: задача, подгруппа, SKU">
 </div>
 ${visible.map(task=>taskHtml(task,today)).join('')}
 <div class="tm51-empty tm51-matches" id="tm51-no-matches" role="status" hidden>${visible.length?'По выбранным условиям задач нет.':'В этом месяце задач пока нет.'}</div>`;
 r.dataset.tm51Month=m;
 for(const [key,event] of [['manager','change'],['status','change'],['search','input']]){
  r.querySelector('#tm51-'+key)?.addEventListener(event,()=>applyFilters(r));
 }
 applyFilters(r);window.RESANTA_TRIOVIST_TASKS360_V1?.enhance?.();
 restoreMonthView(r,view);
 if(view)applyFilters(r);
 showMonthNotice(r,m);
 return true;
}

function privateLogicHtml(p){
 if(!p)return '<div class="tm51-private">Загружаю внутреннюю логику…</div>';
 const cur=Array.isArray(p.current_logic)?p.current_logic:[];
 const miss=Array.isArray(p.previously_agreed_but_missing)?p.previously_agreed_but_missing:[];
 return '<div class="tm51-private"><h4>🔒 Внутренняя логика генератора · видит только Александр Паюшин</h4>'
  +'<div><b>Текущий движок:</b> '+esc(p.engine_version||'—')+' · <b>статус:</b> '+esc(p.status==='active'?'активна':(p.status||'—'))+' · <b>уровень:</b> подгруппа</div>'
  +'<div style="margin-top:6px"><b>Разрешённое количество задач:</b> '+esc((p.allowed_task_counts||[]).join(' / '))+' · <b>срок:</b> '+esc(p.deadline_rule||'—')+'</div>'
  +'<ul>'+cur.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>'
  +(miss.length?'<div class="missing"><b>⚠️ Ранее согласовано, но сейчас отсутствует в генераторе:</b><ul>'+miss.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul></div>':'')
  +'<div class="tm51-note" style="margin-top:8px">После согласования этот блок должен обновляться вместе с серверной логикой.</div></div>';
}
async function togglePrivateLogic(){
 if(!isPayushin())return;
 privateLogicOpen=!privateLogicOpen;
 const box=document.getElementById('tm51-private-logic');if(!box)return;
 if(!privateLogicOpen){box.innerHTML='';return}
 box.innerHTML='<div class="tm51-private">Загружаю внутреннюю логику…</div>';
 try{
  if(!privateLogic)privateLogic=await rpc('triovist_ai_logic_private_v236245',{});
  if(privateLogicOpen&&box.isConnected)box.innerHTML=privateLogicHtml(privateLogic);
 }catch(e){box.innerHTML='<div class="tm51-private" style="border-color:#fecaca;background:#fef2f2;color:#991b1b"><b>Не удалось получить закрытую логику.</b> '+esc(e?.message||e)+'</div>'}
}
async function refreshMonth(){
 if(busy)return false;
 const m=getMonth(),mgr=isLeader()?null:email();
 const show=(kind,text)=>{
  monthNotice={month:m,kind,text};
  if(getMonth()===m)showMonthNotice(document.getElementById('tri-month-safe-v23651'),m);
 };
 busy=true;show('pending','Проверяю результаты и обновляю список задач…');
 try{
  await rpc('triovist_tasks_reconcile_sales_v23651',{p_month:m+'-01',p_finalize:m<curMonth(),p_manager_email:mgr});
  if(getMonth()!==m){monthNotice=null;return true;}
  lastKey='';lastPack=null;
  if(!await render(true)){if(getMonth()===m)show('error','Результаты проверены, но список не загрузился. Повторите обновление.');return false;}
  show('success','Задачи за месяц обновлены.');
  return true;
 }catch(e){show('error','Не удалось обновить задачи. '+String(e?.message||e));return false}
 finally{busy=false}
}
async function taskAction(id,action,button){if(busy)return;busy=true;const oldText=button?.textContent||'',oldDisabled=!!button?.disabled;try{const payload={};
 if(action==='approve'&&!isPayushin())throw Error('Согласование доступно только Паюшину');
 if(action==='verify_listing'){
  if(!isPayushin())throw Error('Проверка листинга доступна только Паюшину');
  const comment=prompt('Проверь отчёт менеджера и фактические действия по листингу. Укажи итог проверки (минимум 15 символов):','');
  if(comment===null)return;
  await rpc('triovist_ai_brainstorm_verify_v20261105',{p_task_id:id,p_comment:comment});
  lastKey='';lastPack=null;await render(true);return;
 }
 if(action==='cancel'&&!confirm('Отменить эту задачу?'))return;if(action==='not_relevant'&&!confirm('Исключить задачу как неактуальную? Она не будет участвовать в KPI месяца.'))return;if(action==='approve'&&button){button.disabled=true;button.textContent='⏳ Согласовываю…';button.setAttribute('aria-busy','true')}if(['comment','waiting_21vek','submit_check'].includes(action)){const c=prompt(action==='submit_check'?'Коротко: что сделано и чем подтверждается?':'Комментарий по задаче:','');if(c===null)return;payload.comment=c;if(action==='submit_check'){const p=prompt('Ссылка на подтверждение или документ (необязательно):','');if(p!==null)payload.proof_url=p}}await rpc('triovist_tasks_action',{p_task_id:id,p_action:action,p_payload:payload});lastKey='';lastPack=null;await render(true)}catch(e){if(button){button.disabled=oldDisabled;button.textContent=oldText;button.removeAttribute('aria-busy')}alert('Не удалось изменить задачу: '+(e?.message||e))}finally{busy=false}}
async function closeMonth(manager){if(!isLeader()||getMonth()>=curMonth())return;if(!confirm(`Закрыть ${monthLabel(getMonth())} для ${managerName(manager)}? KPI задач будет зафиксирован.`))return;try{await rpc('triovist_month_close_v23647',{p_month:getMonth()+'-01',p_manager_email:manager});lastKey='';lastPack=null;await render(true)}catch(e){alert(e?.message||e)}}
function choose(a){if(a==='refresh'){refreshMonth();return}if(a==='retry'){render(true);return}const m=getMonth();setMonth(a==='prev'?shift(m,-1):a==='next'?shift(m,1):curMonth());render(true)}
function bind(){if(window.__TRIOVIST_TASK_MONTH_SAFE51_BOUND)return;window.__TRIOVIST_TASK_MONTH_SAFE51_BOUND=true;document.addEventListener('click',e=>{const listing=e.target.closest('#tri-month-safe-v23651 [data-tm51-listing-check]');if(listing){verifyListingSnapshot(listing);return}const p=e.target.closest('#tri-month-safe-v23651 [data-tm51-private]');if(p){e.preventDefault();e.stopPropagation();togglePrivateLogic();return}const n=e.target.closest('#tri-month-safe-v23651 [data-tm51]');if(n){e.preventDefault();e.stopPropagation();choose(n.dataset.tm51);return}const a=e.target.closest('#tri-month-safe-v23651 [data-tm51-action]');if(a){e.preventDefault();e.stopPropagation();taskAction(a.dataset.taskId,a.dataset.tm51Action,a);return}const c=e.target.closest('#tri-month-safe-v23651 [data-tm51-close]');if(c){e.preventDefault();e.stopPropagation();closeMonth(c.dataset.tm51Close)}},true)}
function mount(){if(!isTaskTab()||!canUse()||!card())return;ensureRoot();render(false)}
const oldRenderTri=window.renderTriovist;if(typeof oldRenderTri==='function')window.renderTriovist=function(){const out=oldRenderTri.apply(this,arguments);if(isTaskTab())setTimeout(mount,0);return out};
const oldTaskRender=window.triovistTasksRender;if(typeof oldTaskRender==='function')window.triovistTasksRender=function(){const out=oldTaskRender.apply(this,arguments);if(isTaskTab())setTimeout(mount,0);return out};
const legacyTaskReload=window.triovistTasksReload;
window.triovistTasksReload=async function(force=true){lastKey='';lastPack=null;if(isTaskTab())return await render(!!force);return true};
window.triovistTasksEnsureLoaded=async function(){if(isTaskTab())return await render(false);return true};
bind();if(isTaskTab())setTimeout(mount,0);window.RESANTA_TRIOVIST_TASK_MONTH_SAFE_V23651=Object.freeze({version:V,getMonth,setMonth,render,mount,refreshMonth,readOnlySnapshot:()=>({month:getMonth(),pack:lastPack}),isolated:true,lazyByActiveTab:true,legacyHeavyReloadDisabled:true,singleFlight:true,nonBlockingSummaryPolicy:true,summaryPolicyFallback:true,noHubWrap:true,noPolling:true,noObserver:true,mountPoint:'#tri-task-card'});
})();
