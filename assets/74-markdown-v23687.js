/* RESANTA CRM v23.6.95 · УЦЕНКА
 * Page-scoped module. No polling, no MutationObserver, no global data preload.
 * All users can view; all authenticated users can add photos/condition notes.
 * Only Alexander Payushin can approve price/discount and sales assignments.
 */
(function(){
'use strict';
if(window.RESANTA_MARKDOWN_V23687)return;
const V='v23.6.95';
const S={rows:[],stats:{},total:0,filter:'active',search:'',loadedAt:0,flight:null,gen:0,current:null,detail:null,managers:null,detailFlight:null,coverObserver:null,controlSummary:null,controlSummaryAt:0,controlSummaryFlight:null,controlRows:[],controlFilter:'alerts',controlFlight:null,saleAssignment:null,saleClient:null,clientSearchTimer:null,clientSearchSeq:0};
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attr=v=>esc(v).replace(/"/g,'&quot;');
const n=v=>Number(v)||0;
const money=v=>n(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const qty=v=>n(v).toLocaleString('ru-RU',{maximumFractionDigits:2});
const date=v=>{if(!v)return'—';const s=String(v).slice(0,10).split('-');return s.length===3?s.reverse().join('.'):String(v)};
const profile=()=>{try{return typeof currentProfile!=='undefined'?currentProfile:(window.currentProfile||null)}catch(_){return window.currentProfile||null}};
const dbx=()=>{try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}};
const active=()=>{try{return typeof crmActivePage==='function'?crmActivePage()==='markdown':$('page-markdown')?.classList.contains('active')}catch(_){return false}};
const isPayushin=()=>String(profile()?.email||'').toLowerCase()==='payushin_ar@resanta.ru';

async function rpc(name,args={}){
  const d=dbx();if(!d)throw new Error('База CRM ещё не готова');
  const {data,error}=await d.rpc(name,args);
  if(error)throw error;return data;
}
function injectStyle(){
 if($('markdown-style-v23687'))return;
 const st=document.createElement('style');st.id='markdown-style-v23687';st.textContent=`
 #page-markdown .md-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px}
 #page-markdown .md-stats{display:flex;gap:7px;overflow-x:auto;padding-bottom:3px;margin-bottom:10px}
 #page-markdown .md-chip{border:1px solid var(--border);background:#fff;border-radius:999px;padding:7px 10px;white-space:nowrap;font-size:11px;cursor:pointer}
 #page-markdown .md-chip.active{background:var(--ab);border-color:#93C5FD;color:var(--at);font-weight:800}
 #page-markdown .md-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
 #page-markdown .md-search{flex:1;min-width:230px;padding:10px 12px;border:1px solid var(--border);border-radius:9px;font-size:13px}
 #page-markdown .md-search-go{padding:10px 14px;white-space:nowrap;min-height:40px;font-weight:800}
 #page-markdown .md-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:10px}
 #page-markdown .md-card{background:#fff;border:1px solid var(--border);border-radius:12px;padding:12px;display:grid;grid-template-columns:92px minmax(0,1fr);gap:11px;cursor:pointer}
 #page-markdown .md-card:hover{border-color:#93C5FD;box-shadow:0 2px 10px rgba(15,23,42,.05)}
 #page-markdown .md-thumb{width:92px;height:92px;border-radius:9px;background:#F3F4F6;border:1px solid #E5E7EB;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:26px;color:#94A3B8}
 #page-markdown .md-thumb img{width:100%;height:100%;object-fit:cover;display:block}
 #page-markdown .md-name{font-size:13px;font-weight:800;line-height:1.35}
 #page-markdown .md-article{font-size:11px;color:var(--sub);margin-top:2px}
 #page-markdown .md-price{font-size:15px;font-weight:900;margin-top:7px;color:#166534}
 #page-markdown .md-old{text-decoration:line-through;color:var(--sub);font-size:11px;margin-right:5px}
 #page-markdown .md-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}
 #page-markdown .md-tag{font-size:9px;font-weight:700;padding:3px 6px;border-radius:999px;background:#F3F4F6;color:#475569}
 #page-markdown .md-tag.good{background:#ECFDF5;color:#166534}.md-tag.warn{background:#FFFBEB;color:#92400E}.md-tag.bad{background:#FEF2F2;color:#991B1B}.md-tag.blue{background:#EFF6FF;color:#1D4ED8}
 #page-markdown .md-note{font-size:10px;color:var(--sub);line-height:1.45;margin-top:7px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
 #markdown-modal-v23687{display:none;position:fixed;inset:0;z-index:12000;background:rgba(15,23,42,.55);padding:18px;overflow:auto}
 #markdown-modal-v23687.open{display:flex;align-items:flex-start;justify-content:center}
 #markdown-modal-v23687 .md-modal{width:min(980px,100%);background:#fff;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,.25);margin:auto;padding:16px}
 #markdown-modal-v23687 .md-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:12px}
 #markdown-modal-v23687 .md-x{border:0;background:#F3F4F6;border-radius:8px;width:34px;height:34px;font-size:20px;cursor:pointer}
 #markdown-modal-v23687 .md-sections{display:grid;grid-template-columns:1.15fr .85fr;gap:12px}
 #markdown-modal-v23687 .md-box{border:1px solid var(--border);border-radius:11px;padding:12px;margin-bottom:10px}
 #markdown-modal-v23687 .md-box h4{margin:0 0 8px;font-size:12px;color:var(--sub);text-transform:uppercase}
 #markdown-modal-v23687 input,#markdown-modal-v23687 textarea,#markdown-modal-v23687 select{width:100%;padding:9px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:#fff}
 #markdown-modal-v23687 textarea{min-height:82px;resize:vertical}
 #markdown-modal-v23687 .md-formgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
 #markdown-modal-v23687 .md-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}
 #markdown-modal-v23687 .md-btn{border:1px solid var(--border);background:#fff;border-radius:8px;padding:9px 11px;cursor:pointer;font-size:12px}
 #markdown-modal-v23687 .md-btn.primary{background:var(--a);color:#fff;border-color:var(--a)} #markdown-modal-v23687 .md-btn.green{background:#166534;color:#fff;border-color:#166534}
 #markdown-modal-v23687 .md-photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
 #markdown-modal-v23687 .md-photo{border:1px solid var(--border);border-radius:9px;overflow:hidden;background:#fff}.md-photo img{width:100%;height:120px;object-fit:cover;display:block;cursor:zoom-in}
 #markdown-modal-v23687 .md-photo-meta{font-size:9px;padding:6px;line-height:1.35;color:var(--sub)}
 #markdown-modal-v23687 .md-assignment{border-top:1px solid var(--border);padding:8px 0;font-size:11px;line-height:1.5}
 #markdown-image-v23687{display:none;position:fixed;inset:0;z-index:13000;background:rgba(0,0,0,.88);align-items:center;justify-content:center;padding:18px}
 #markdown-image-v23687.open{display:flex}#markdown-image-v23687 img{max-width:96vw;max-height:94vh;object-fit:contain;border-radius:8px}
 #markdown-sale-modal-v23691,#markdown-control-modal-v23691{display:none;position:fixed;inset:0;z-index:12500;background:rgba(15,23,42,.58);padding:14px;overflow:auto}
 #markdown-sale-modal-v23691.open,#markdown-control-modal-v23691.open{display:flex;align-items:flex-start;justify-content:center}
 .md91-dialog{width:min(720px,100%);background:#fff;border-radius:14px;padding:16px;margin:auto;box-shadow:0 20px 60px rgba(0,0,0,.28)}
 #markdown-control-modal-v23691 .md91-dialog{width:min(1100px,100%)}
 .md91-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:12px}
 .md91-close{border:0;background:#F3F4F6;border-radius:8px;width:34px;height:34px;font-size:20px;cursor:pointer}
 .md91-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
 .md91-field{display:block;font-size:11px;color:var(--sub)}
 .md91-field input,.md91-field select,.md91-field textarea{width:100%;margin-top:4px;padding:9px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:#fff}
 .md91-field textarea{min-height:78px;resize:vertical}
 .md91-results{border:1px solid var(--border);border-radius:8px;max-height:180px;overflow:auto;margin-top:6px}
 .md91-result{display:block;width:100%;border:0;border-bottom:1px solid var(--border);background:#fff;padding:8px 10px;text-align:left;cursor:pointer;font-size:11px}
 .md91-result:last-child{border-bottom:0}.md91-result:hover{background:#F8FAFC}
 .md91-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}
 .md91-btn{border:1px solid var(--border);background:#fff;border-radius:8px;padding:9px 11px;cursor:pointer;font-size:12px}
 .md91-btn.primary{background:var(--a);border-color:var(--a);color:#fff}.md91-btn.good{background:#166534;border-color:#166534;color:#fff}.md91-btn.bad{background:#991B1B;border-color:#991B1B;color:#fff}
 .md91-control-tabs{display:flex;gap:6px;overflow-x:auto;margin-bottom:10px;padding-bottom:3px}
 .md91-control-card{border:1px solid var(--border);border-radius:10px;padding:11px;margin-bottom:8px;font-size:11px;line-height:1.5;background:#fff}
 .md91-control-card.alert{border-color:#FCA5A5;background:#FFF7F7}
 .md91-control-card.pending{border-color:#FDE68A;background:#FFFCF2}
 .md91-status{font-size:10px;font-weight:800;padding:3px 7px;border-radius:999px;display:inline-block;background:#F3F4F6}
 .md91-status.red{background:#FEE2E2;color:#991B1B}.md91-status.green{background:#DCFCE7;color:#166534}.md91-status.amber{background:#FEF3C7;color:#92400E}
 .md91-sale-note{margin-top:6px;padding:7px 8px;border-radius:8px;background:#F8FAFC;font-size:10px;line-height:1.45}
 @media(max-width:760px){
   #page-markdown .md-grid{grid-template-columns:1fr}
   #page-markdown .md-card{grid-template-columns:78px minmax(0,1fr);padding:10px}.md-thumb{width:78px!important;height:78px!important}
   #markdown-modal-v23687{padding:8px}#markdown-modal-v23687 .md-modal{padding:12px;border-radius:12px}
   #markdown-modal-v23687 .md-sections{grid-template-columns:1fr}
   #markdown-modal-v23687 .md-formgrid{grid-template-columns:1fr}
   #markdown-modal-v23687 .md-btn{min-height:44px;font-size:13px}
   .md91-grid{grid-template-columns:1fr}.md91-btn{min-height:44px;font-size:13px}
   #page-markdown .md-search{min-width:0}.md-search-go{min-height:44px!important}
 }`;
 document.head.appendChild(st);
}
function ensureDom(){
 injectStyle();
 let modal=$('markdown-modal-v23687');
 if(!modal){
  modal=document.createElement('div');modal.id='markdown-modal-v23687';
  modal.innerHTML='<div class="md-modal"><div id="markdown-detail-v23687"></div></div>';
  modal.addEventListener('click',e=>{if(e.target===modal)closeDetail()});
  document.body.appendChild(modal);
 }
 let img=$('markdown-image-v23687');
 if(!img){
  img=document.createElement('div');img.id='markdown-image-v23687';img.innerHTML='<img alt="Фото уценки">';
  img.onclick=()=>img.classList.remove('open');document.body.appendChild(img);
 }
 if(!$('markdown-camera-v23687')){
  const cam=document.createElement('input');cam.type='file';cam.accept='image/*';cam.capture='environment';cam.id='markdown-camera-v23687';cam.style.display='none';cam.onchange=e=>uploadFiles(e.target.files);document.body.appendChild(cam);
  const gal=document.createElement('input');gal.type='file';gal.accept='image/*';gal.multiple=true;gal.id='markdown-gallery-v23687';gal.style.display='none';gal.onchange=e=>uploadFiles(e.target.files);document.body.appendChild(gal);
 }
}
function statusTabs(){
 const st=S.stats||{};
 return [
  ['active','Все позиции',st.active||0],
  ['needs_photo','Нужны фото',st.needs_photo||0],
  ['collecting','Подготовка',st.collecting||0],
  ['ready_for_pricing',isPayushin()?'Ждут моей цены':'Готово к оценке',st.ready_for_pricing||0],
  ['priced','В продаже',st.priced||0],
  ['assigned','Назначены',st.assigned||0],
  ['sold','Продано',st.sold||0]
 ];
}
function sourceLabel(v){
 const s=String(v||'').toLowerCase();
 if(s.includes('сервис'))return'Сервис';
 if(s.includes('клиент')||s.includes('возврат'))return'Возврат клиента';
 return v||'Уценка';
}
function card(r){
 const priced=!!r.discount_set_at,photos=n(r.photo_count),assigned=n(r.active_assignment_count)>0;
 const condition=r.condition_comment||r.source_comment||'Состояние ещё не описано';
 const price=priced?'<span class="md-old">'+money(r.base_price)+'</span><span>'+money(r.final_price)+'</span>':money(r.base_price);
 return '<div class="md-card" data-md-id="'+attr(r.id)+'" onclick="crmMarkdownOpenItemV23687(&quot;'+attr(r.id)+'&quot;)">'
  +'<div class="md-thumb" id="md-thumb-'+attr(r.id)+'" data-md-cover="'+attr(r.cover_path||'')+'">'+(r.cover_path?'📷':'📦')+'</div>'
  +'<div><div class="md-name">'+esc(r.nomenclature)+'</div><div class="md-article">Артикул: <b>'+esc(r.article)+'</b> · '+qty(r.quantity)+' шт. · '+esc(sourceLabel(r.source_type))+'</div>'
  +'<div class="md-price">'+price+(priced&&n(r.discount_pct)>0?' <span style="font-size:10px;color:#B91C1C">−'+n(r.discount_pct).toFixed(1)+'%</span>':'')+'</div>'
  +'<div class="md-tags"><span class="md-tag good">🛡 Гарантия'+(r.warranty_months?' '+r.warranty_months+' мес.':'')+'</span>'
  +(photos?'<span class="md-tag blue">📷 '+photos+'</span>':'<span class="md-tag bad">📷 нет фото</span>')
  +((r.review_status==='priced'||priced)?'<span class="md-tag good">✅ В продаже</span>':r.review_status==='ready_for_pricing'?'<span class="md-tag warn">⏳ На оценке</span>':'<span class="md-tag">🛠 Подготовка</span>')
  +(assigned?'<span class="md-tag blue">🎯 '+esc(r.assigned_managers||'назначено')+'</span>':'')+'</div>'
  +'<div class="md-note">'+esc(condition)+'</div></div></div>';
}
function render(){
 const root=$('markdown-root');if(!root)return;
 const tabs=statusTabs(),control=S.controlSummary||{};
 root.innerHTML='<div class="md-top"><div><div class="page-title" style="margin-bottom:3px">🏷️ Уценка</div><div style="font-size:12px;color:var(--sub)">Возвраты клиентов и сервиса · фото · гарантия · цена · задачи на продажу</div></div>'
  +'<div style="display:flex;gap:7px;flex-wrap:wrap">'+(isPayushin()?'<button class="btn-secondary" id="md-control-v23691">🛡 Контроль продаж'+(n(control.alerts)?' <b>🔴 '+n(control.alerts)+'</b>':'')+'</button>':'')+'<button class="btn-secondary" id="md-refresh-v23687">↻ Обновить</button></div></div>'
  +'<div class="card" style="margin-bottom:10px;padding:11px 13px;font-size:11px;line-height:1.5"><b>🛡 Уценённый товар сохраняет гарантию.</b> Фото и описание состояния видят все сотрудники. '+(isPayushin()?'<b>Скидку и план продажи утверждаете только вы.</b>':'Цена и скидка утверждаются Александром Паюшиным.')+'</div>'
  +'<div class="md-stats">'+tabs.map(x=>'<button class="md-chip '+(S.filter===x[0]?'active':'')+'" data-md-filter="'+x[0]+'">'+x[1]+' <b>'+x[2]+'</b></button>').join('')+'</div>'
  +'<div class="md-tools"><input class="md-search" id="md-search-v23687" enterkeyhint="search" value="'+attr(S.search)+'" placeholder="🔍 Поиск по артикулу, номенклатуре, серийному номеру..."><button type="button" class="btn-secondary md-search-go" id="md-search-go-v23695">🔍 Найти</button><span style="font-size:10px;color:var(--sub)">Найдено: '+S.total+'</span></div>'
  +(S.rows.length?'<div class="md-grid">'+S.rows.map(card).join('')+'</div>':'<div class="card" style="text-align:center;padding:28px;color:var(--sub)">По выбранному фильтру позиций нет.</div>');
 root.querySelectorAll('[data-md-filter]').forEach(b=>b.onclick=()=>{S.filter=b.dataset.mdFilter;load(true)});
 const inp=$('md-search-v23687');
 const runSearch=async()=>{
  if(!inp)return;
  const q=inp.value.trim();
  S.search=q;
  await load(true);
  const next=$('md-search-v23687');
  if(next){try{next.focus({preventScroll:true});next.setSelectionRange(next.value.length,next.value.length)}catch(_){}}
 };
 if(inp){
  inp.oninput=null;
  inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();runSearch()}};
 }
 const go=$('md-search-go-v23695');if(go)go.onclick=runSearch;
 const ref=$('md-refresh-v23687');if(ref)ref.onclick=()=>load(true);
 const ctl=$('md-control-v23691');if(ctl)ctl.onclick=()=>openSalesControl('alerts');
 updateNavDot();loadCovers();if(isPayushin())loadControlSummary(false);
}
function loadCovers(){
 const d=dbx();if(!d)return;
 try{S.coverObserver?.disconnect?.()}catch(_){}
 const loadOne=async el=>{
   if(!el||el.dataset.loaded==='1'||!el.dataset.mdCover)return;
   el.dataset.loaded='1';
   try{
     const {data,error}=await d.storage.from('markdown-photos').createSignedUrl(el.dataset.mdCover,3600);
     if(!error&&data?.signedUrl&&el.isConnected)el.innerHTML='<img alt="Фото уценки" src="'+attr(data.signedUrl)+'">';
   }catch(_){}
 };
 const els=[...document.querySelectorAll('#markdown-root .md-thumb[data-md-cover]:not([data-md-cover=""])')];
 if('IntersectionObserver' in window){
   S.coverObserver=new IntersectionObserver(entries=>{
     entries.forEach(e=>{if(e.isIntersecting){S.coverObserver.unobserve(e.target);loadOne(e.target)}});
   },{rootMargin:'240px 0px'});
   els.forEach(el=>S.coverObserver.observe(el));
 }else{
   els.slice(0,24).forEach(el=>loadOne(el));
 }
}
function updateNavDot(){
 const count=isPayushin()?n(S.stats?.ready_for_pricing)+n(S.controlSummary?.alerts):n(S.stats?.needs_photo);
 ['markdown-alert-dot','bn-markdown-dot'].forEach(id=>{const e=$(id);if(e)e.style.display=count?'inline-block':'none'});
}
async function loadControlSummary(force=false){
 if(!isPayushin())return null;
 const now=Date.now();
 if(!force&&S.controlSummary&&now-S.controlSummaryAt<30000)return S.controlSummary;
 if(S.controlSummaryFlight)return S.controlSummaryFlight;
 S.controlSummaryFlight=(async()=>{
  try{
   const data=await rpc('markdown_sales_summary_v1',{});
   if(data?.allowed){
    S.controlSummary=data;S.controlSummaryAt=Date.now();
    const b=$('md-control-v23691');
    if(b)b.innerHTML='🛡 Контроль продаж'+(n(data.alerts)?' <b>🔴 '+n(data.alerts)+'</b>':'');
    updateNavDot();
   }
   return data;
  }catch(e){console.warn(V,'control summary',e);return null}
  finally{S.controlSummaryFlight=null}
 })();
 return S.controlSummaryFlight;
}
async function load(force=false){
 ensureDom();
 if(S.flight)return S.flight;
 const now=Date.now();
 if(!force&&S.loadedAt&&now-S.loadedAt<60000){render();return true}
 const root=$('markdown-root');
 if(!S.loadedAt&&root)root.innerHTML='<div class="page-title">🏷️ Уценка</div><div class="card">Загружаю реестр уценки…</div>';
 const gen=++S.gen;
 S.flight=(async()=>{
  try{
   const data=await rpc('markdown_list_v1',{p_search:S.search||null,p_filter:S.filter,p_limit:60,p_offset:0});
   if(gen!==S.gen)return false;
   S.rows=Array.isArray(data?.rows)?data.rows:[];S.stats=data?.stats||{};S.total=n(data?.total);S.loadedAt=Date.now();
   if(active())render();else updateNavDot();
   return true;
  }catch(e){
   console.error(V,e);
   if(active()&&root)root.innerHTML='<div class="page-title">🏷️ Уценка</div><div class="card" style="color:#991B1B"><b>Не удалось загрузить уценку.</b><br>'+esc(e?.message||e)+'</div>';
   return false;
  }finally{S.flight=null}
 })();
 return S.flight;
}
function closeDetail(){const m=$('markdown-modal-v23687');if(m)m.classList.remove('open');S.current=null;S.detail=null}
async function signed(path){
 if(!path)return'';
 try{const {data,error}=await dbx().storage.from('markdown-photos').createSignedUrl(path,3600);return error?'':(data?.signedUrl||'')}catch(_){return''}
}
function photoTypeLabel(v){return({overall:'Общий вид',defect:'Дефект',label:'Шильдик/артикул',box:'Упаковка',other:'Другое'})[v]||v}
function saleEventStatus(e){
 if(!e)return'';
 if(e.event_type==='sale_claim'&&e.status==='pending')return'<div class="md91-sale-note"><b>⏳ Продажа заявлена — ждёт подтверждения 1С.</b><br>'+qty(e.reported_qty)+' шт. · '+esc(e.client_name||'—')+' · '+money(e.reported_revenue)+'</div>';
 if(e.event_type==='sale_claim'&&e.status==='discrepancy')return'<div class="md91-sale-note" style="background:#FEF2F2;color:#991B1B"><b>🔴 Расхождение с 1С.</b><br>'+esc(e.discrepancy_reason||'Остаток не подтвердил продажу')+'</div>';
 if(e.event_type==='sale_claim'&&e.status==='confirmed')return'<div class="md91-sale-note" style="background:#ECFDF5;color:#166534"><b>✅ Продажа подтверждена '+(e.confirmation_source==='manual'?'вручную':'1С')+'.</b><br>'+qty(e.confirmed_qty||e.reported_qty)+' шт. · '+esc(e.client_name||'—')+' · '+money(e.reported_revenue)+'</div>';
 return'';
}
async function detailHtml(data){
 const i=data.item||{},photos=Array.isArray(data.photos)?data.photos:[],assign=Array.isArray(data.assignments)?data.assignments:[],sales=Array.isArray(data.sale_events)?data.sale_events:[];
 const photoUrls=await Promise.all(photos.map(async p=>({...p,signed_url:await signed(p.storage_path)})));
 const stage=i.review_status||'collecting';
 const typeCounts={overall:0,defect:0,label:0};
 photos.forEach(p=>{if(Object.prototype.hasOwnProperty.call(typeCounts,p.photo_type))typeCounts[p.photo_type]++});
 const hasCondition=!!String(i.condition_comment||'').trim();
 const prepReady=typeCounts.overall>0&&typeCounts.defect>0&&typeCounts.label>0&&hasCondition;
 const workflowBox='<div class="md-box"><h4>✅ Подготовка к оценке</h4>'
  +'<div style="font-size:12px;line-height:1.9">'+(typeCounts.overall?'✅':'❌')+' Общий вид<br>'+(typeCounts.defect?'✅':'❌')+' Дефект / состояние<br>'+(typeCounts.label?'✅':'❌')+' Шильдик / артикул<br>'+(hasCondition?'✅':'❌')+' Описание состояния</div>'
  +(stage==='priced'?'<div style="margin-top:8px;font-weight:800;color:#166534">✅ Цена утверждена — товар в продаже</div>'
   :stage==='ready_for_pricing'?'<div style="margin-top:8px;font-weight:800;color:#92400E">⏳ Отправлено Александру Паюшину на оценку'+(i.submitted_for_pricing_by?' · '+esc(i.submitted_for_pricing_by):'')+'</div>'
   :prepReady?'<div class="md-actions"><button class="md-btn green" onclick="crmMarkdownSubmitPricingV23689()">✅ Готово — отправить Александру на оценку</button></div>'
   :'<div style="margin-top:8px;color:#991B1B;font-size:11px">Нужны 3 обязательных фото и описание состояния.</div>')+'</div>';
 const pricing=data.is_payushin&&['ready_for_pricing','priced'].includes(stage)?'<div class="md-box"><h4>💰 Цена · только Александр Паюшин</h4><div class="md-formgrid"><label>Скидка, %<input id="md-discount-v23687" type="number" min="0" max="90" step="0.1" value="'+(i.discount_pct??'')+'"></label><label>Финальная цена, BYN<input id="md-final-v23687" type="number" min="0" step="0.01" value="'+(i.discount_set_at?i.final_price:'')+'"></label></div><label style="display:block;margin-top:8px">Причина скидки<input id="md-price-reason-v23687" value="'+attr(i.discount_reason||'')+'" placeholder="Например: царапины корпуса, повреждена упаковка"></label><div class="md-actions"><button class="md-btn green" onclick="crmMarkdownSavePriceV23687()">Утвердить цену</button></div></div>':'';
 let assignBox='';
 if(data.is_payushin&&stage==='priced'){
  const managers=Array.isArray(S.managers)?S.managers:[];
  const tomorrow=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  assignBox='<div class="md-box"><h4>🎯 Поставить план менеджеру</h4><div class="md-formgrid"><label>Менеджер<select id="md-manager-v23687"><option value="">Выберите</option>'+managers.map(m=>'<option>'+esc(m.name)+'</option>').join('')+'</select></label><label>Срок<input id="md-due-v23687" type="date" value="'+tomorrow+'"></label><label>План, шт.<input id="md-target-v23687" type="number" min="1" step="1" value="1"></label><label>Мотивация за выполнение, BYN<input id="md-bonus-v23687" type="number" min="0" step="1" value="0"></label><label>Демотивация за просрочку, BYN<input id="md-penalty-v23687" type="number" min="0" step="1" value="0"></label><label>Комментарий<input id="md-plan-note-v23687" placeholder="Кому предложить / условия"></label></div><div class="md-actions"><button class="md-btn primary" onclick="crmMarkdownAssignV23687()">Создать/обновить задачу</button></div></div>';
 }
 const assHtml=assign.length?assign.map(a=>{
   const ownSales=sales.filter(e=>String(e.assignment_id||'')===String(a.id));
   const live=ownSales.find(e=>['pending','discrepancy'].includes(e.status))||ownSales.find(e=>e.status==='confirmed');
   const canReport=['assigned','in_work'].includes(a.status)&&(data.is_payushin||String(a.manager_name).toLowerCase()===String(data.current_name).toLowerCase())&&!ownSales.some(e=>['pending','discrepancy'].includes(e.status));
   return '<div class="md-assignment"><b>'+esc(a.manager_name)+'</b> · план '+qty(a.target_qty)+' шт. до '+date(a.due_date)+' · '+(a.overdue?'🔴 просрочено':esc(a.status))
     +(a.bonus_byn!=null?'<br>💚 мотивация +'+money(a.bonus_byn)+' · 🔻 демотивация '+money(a.penalty_byn):'')
     +(a.motivation_note?'<br>'+esc(a.motivation_note):'')
     +(live?saleEventStatus(live):'')
     +(canReport?'<div class="md-actions"><button class="md-btn green" onclick="crmMarkdownReportSaleV23687(&quot;'+attr(a.id)+'&quot;,&quot;'+attr(a.target_qty)+'&quot;)">🧾 Заявить продажу</button></div>':'')
     +'</div>';
  }).join(''):'<div style="font-size:11px;color:var(--sub)">Задачи менеджерам ещё не поставлены.</div>';
 const photosHtml=photoUrls.length?'<div class="md-photo-grid">'+photoUrls.map(p=>'<div class="md-photo">'+(p.signed_url?'<img src="'+attr(p.signed_url)+'" onclick="crmMarkdownZoomV23687(&quot;'+attr(p.signed_url)+'&quot;)">':'<div style="height:120px;display:flex;align-items:center;justify-content:center">📷</div>')+'<div class="md-photo-meta"><b>'+esc(photoTypeLabel(p.photo_type))+'</b><br>'+esc(p.uploaded_by)+' · '+date(p.created_at)+(p.comment?'<br>'+esc(p.comment):'')+(data.is_payushin?'<br><button class="md-btn" style="padding:4px 6px;margin-top:4px" onclick="crmMarkdownDeletePhotoV23687(&quot;'+attr(p.id)+'&quot;,&quot;'+attr(p.storage_path)+'&quot;)">Удалить</button>':'')+'</div></div>').join('')+'</div>':'<div style="font-size:11px;color:#991B1B">Фото ещё нет. Сотруднику нужно сфотографировать общий вид и дефекты.</div>';
 return '<div class="md-head"><div><div style="font-size:18px;font-weight:900">'+esc(i.nomenclature)+'</div><div style="font-size:12px;color:var(--sub)">Артикул <b>'+esc(i.article)+'</b> · '+qty(i.quantity)+' шт. · '+esc(sourceLabel(i.source_type))+'</div></div><button class="md-x" onclick="crmMarkdownCloseV23687()">×</button></div>'
 +'<div class="md-sections"><div>'
 +'<div class="md-box"><h4>📦 Состояние и гарантия</h4><div style="font-size:12px;line-height:1.55"><b>🛡 Гарантия: '+(i.warranty_active?'сохраняется':'уточнить')+'</b>'+(i.warranty_months?' · '+i.warranty_months+' мес.':'')+(i.warranty_note?'<br>'+esc(i.warranty_note):'')+(i.source_comment?'<br><br><b>Комментарий 1С:</b> '+esc(i.source_comment):'')+'</div><label style="display:block;margin-top:9px">Фактическое состояние<textarea id="md-condition-v23687" placeholder="Что с товаром: царапины, упаковка, комплектность...">'+esc(i.condition_comment||'')+'</textarea></label><div class="md-actions"><button class="md-btn primary" onclick="crmMarkdownSaveConditionV23687()">Сохранить описание</button></div></div>'
 +workflowBox
 +'<div class="md-box"><h4>📷 Фотографии</h4><div class="md-formgrid"><label>Тип фото<select id="md-photo-type-v23687"><option value="overall">Общий вид</option><option value="defect">Дефект / состояние</option><option value="label">Шильдик / артикул</option><option value="box">Упаковка</option><option value="other">Другое</option></select></label><label>Комментарий<input id="md-photo-comment-v23687" placeholder="Что видно на фото"></label></div><div class="md-actions"><button class="md-btn primary" onclick="crmMarkdownCameraV23687()">📷 Снять на телефон</button><button class="md-btn" onclick="crmMarkdownGalleryV23687()">🖼 Выбрать из галереи</button></div><div style="margin-top:9px">'+photosHtml+'</div></div>'
 +'</div><div>'
 +'<div class="md-box"><h4>💵 Цена</h4><div style="font-size:12px">Дилерская с НДС: <b>'+money(i.base_price)+'</b></div><div style="font-size:20px;font-weight:900;color:#166534;margin-top:5px">'+(i.discount_set_at?money(i.final_price):'Цена ещё не утверждена')+'</div>'+(i.discount_set_at?'<div style="font-size:11px;color:var(--sub)">Скидка '+n(i.discount_pct).toFixed(1)+'% · '+esc(i.discount_set_by||'')+'</div>':'')+'</div>'
 +pricing+assignBox
 +'<div class="md-box"><h4>✅ Задачи и продажи</h4>'+assHtml+'</div>'
 +'</div></div>';
}
async function openItem(id){
 ensureDom();S.current=id;
 const modal=$('markdown-modal-v23687'),body=$('markdown-detail-v23687');modal.classList.add('open');body.innerHTML='<div style="padding:30px;text-align:center">Загружаю карточку…</div>';
 if(isPayushin()&&!S.managers){try{S.managers=await rpc('markdown_get_managers_v1',{})}catch(e){console.warn(V,e);S.managers=[]}}
 const my=id;
 try{
  const [data,sales]=await Promise.all([
    rpc('markdown_item_detail_v1',{p_item_id:id}),
    rpc('markdown_item_sales_v1',{p_item_id:id})
  ]);
  if(S.current!==my)return;
  data.sale_events=Array.isArray(sales)?sales:[];
  S.detail=data;body.innerHTML=await detailHtml(data);
 }catch(e){body.innerHTML='<div style="color:#991B1B">Не удалось открыть карточку: '+esc(e?.message||e)+'</div>'}
}
async function refreshDetail(){if(S.current)await openItem(S.current)}
async function saveCondition(){
 if(!S.current)return;const val=$('md-condition-v23687')?.value||'';
 try{await rpc('markdown_update_condition_v1',{p_item_id:S.current,p_comment:val});await refreshDetail();await load(true)}catch(e){alert('Не удалось сохранить: '+(e?.message||e))}
}
async function submitPricing(){
 if(!S.current)return;
 try{
  await rpc('markdown_submit_for_pricing_v1',{p_item_id:S.current});
  alert('✅ Товар отправлен Александру Паюшину на оценку');
  await refreshDetail();await load(true);
 }catch(e){alert('Не удалось отправить на оценку: '+(e?.message||e))}
}
async function savePrice(){
 if(!S.current)return;
 const disc=$('md-discount-v23687')?.value,fin=$('md-final-v23687')?.value,reason=$('md-price-reason-v23687')?.value||'';
 try{
  await rpc('markdown_set_price_v1',{p_item_id:S.current,p_discount_pct:disc===''?null:Number(disc),p_final_price:fin===''?null:Number(fin),p_reason:reason||null});
  await refreshDetail();await load(true)
 }catch(e){alert('Не удалось утвердить цену: '+(e?.message||e))}
}
async function assign(){
 const manager=$('md-manager-v23687')?.value,due=$('md-due-v23687')?.value,target=Number($('md-target-v23687')?.value||0),bonus=Number($('md-bonus-v23687')?.value||0),penalty=Number($('md-penalty-v23687')?.value||0),note=$('md-plan-note-v23687')?.value||'';
 if(!manager||!due||target<=0){alert('Выберите менеджера, срок и план');return}
 try{
  await rpc('markdown_assign_v1',{p_item_id:S.current,p_manager_name:manager,p_target_qty:target,p_due_date:due,p_bonus_byn:bonus,p_penalty_byn:penalty,p_note:note||null});
  alert('✅ Задача по уценке поставлена менеджеру');await refreshDetail();await load(true)
 }catch(e){alert('Не удалось поставить задачу: '+(e?.message||e))}
}
function ensureSaleModal(){
 let m=$('markdown-sale-modal-v23691');
 if(!m){
  m=document.createElement('div');m.id='markdown-sale-modal-v23691';
  m.innerHTML='<div class="md91-dialog" id="markdown-sale-body-v23691"></div>';
  m.addEventListener('click',e=>{if(e.target===m)closeSaleModal()});
  document.body.appendChild(m);
 }
 return m;
}
function closeSaleModal(){
 const m=$('markdown-sale-modal-v23691');if(m)m.classList.remove('open');
 S.saleAssignment=null;S.saleClient=null;
}
function renderSaleClientResults(rows){
 const box=$('md-sale-client-results-v23691');if(!box)return;
 const list=Array.isArray(rows)?rows:[];
 box.innerHTML=list.length?list.map(r=>'<button type="button" class="md91-result" data-client-id="'+attr(r.id)+'" data-client-name="'+attr(r.name)+'"><b>'+esc(r.name)+'</b>'+(r.city?' · '+esc(r.city):'')+(r.manager_name?'<br><span style="color:var(--sub)">Менеджер: '+esc(r.manager_name)+'</span>':'')+'</button>').join(''):'<div style="padding:9px;font-size:11px;color:var(--sub)">Клиенты не найдены</div>';
 box.querySelectorAll('[data-client-id]').forEach(b=>b.onclick=()=>{
   S.saleClient={id:b.dataset.clientId,name:b.dataset.clientName};
   const inp=$('md-sale-client-search-v23691');if(inp)inp.value=S.saleClient.name;
   box.innerHTML='<div style="padding:9px;font-size:11px;color:#166534"><b>✅ Выбран:</b> '+esc(S.saleClient.name)+'</div>';
 });
}
async function searchSaleClients(q){
 const seq=++S.clientSearchSeq;
 if(String(q||'').trim().length<2){renderSaleClientResults([]);return}
 try{
  const rows=await rpc('markdown_search_clients_v1',{p_search:String(q).trim()});
  if(seq!==S.clientSearchSeq)return;
  renderSaleClientResults(rows);
 }catch(e){console.warn(V,'client search',e)}
}
function updateSaleChannel(){
 const ch=$('md-sale-channel-v23691')?.value||'crm_client';
 const crm=$('md-sale-client-block-v23691'),other=$('md-sale-other-block-v23691');
 if(crm)crm.style.display=ch==='crm_client'?'block':'none';
 if(other)other.style.display=ch==='retail_other'?'block':'none';
}
function updateSaleTotal(){
 const q=Math.max(0,Number($('md-sale-qty-v23691')?.value||0));
 const p=n(S.detail?.item?.final_price);
 const e=$('md-sale-total-v23691');if(e)e.textContent=money(q*p);
}
function reportSale(id,target){
 const a=(S.detail?.assignments||[]).find(x=>String(x.id)===String(id));
 const i=S.detail?.item;if(!a||!i)return;
 S.saleAssignment={id:a.id,target:n(target)||n(a.target_qty)||1};
 S.saleClient=null;
 const m=ensureSaleModal(),body=$('markdown-sale-body-v23691');
 const maxQty=Math.max(1,n(i.quantity)),defaultQty=Math.min(maxQty,Math.max(1,S.saleAssignment.target));
 body.innerHTML='<div class="md91-head"><div><div style="font-size:18px;font-weight:900">🧾 Заявить продажу</div><div style="font-size:11px;color:var(--sub)">'+esc(i.nomenclature)+' · '+esc(i.article)+'</div></div><button class="md91-close" type="button" id="md-sale-close-v23691">×</button></div>'
  +'<div class="card" style="padding:10px;margin-bottom:10px;font-size:11px"><b>Утверждённая цена:</b> '+money(i.final_price)+' / шт.<br><b>Текущий остаток 1С:</b> '+qty(i.quantity)+' шт.<br><span style="color:#92400E">Продажа станет окончательной только после уменьшения остатка в следующем отчёте 1С.</span></div>'
  +'<div class="md91-grid"><label class="md91-field">Количество<input id="md-sale-qty-v23691" type="number" min="1" max="'+attr(maxQty)+'" step="1" value="'+attr(defaultQty)+'"></label><label class="md91-field">Канал продажи<select id="md-sale-channel-v23691"><option value="crm_client">Клиент CRM</option><option value="retail_other">Розница / другой клиент</option></select></label></div>'
  +'<div id="md-sale-client-block-v23691" style="margin-top:9px"><label class="md91-field">Клиент CRM<input id="md-sale-client-search-v23691" placeholder="Начните вводить название клиента" autocomplete="off"></label><div class="md91-results" id="md-sale-client-results-v23691" style="display:none"></div></div>'
  +'<div id="md-sale-other-block-v23691" style="margin-top:9px;display:none"><label class="md91-field">Кому продали<input id="md-sale-other-name-v23691" placeholder="Например: розница, физлицо, другой клиент"></label></div>'
  +'<label class="md91-field" style="margin-top:9px">Комментарий<textarea id="md-sale-comment-v23691" placeholder="Номер заказа/накладной или пояснение. Для розницы/другого клиента обязательно."></textarea></label>'
  +'<div class="card" style="padding:10px;margin-top:9px;font-size:12px">Сумма по утверждённой цене: <b id="md-sale-total-v23691">'+money(defaultQty*n(i.final_price))+'</b></div>'
  +'<div class="md91-actions"><button class="md91-btn primary" type="button" id="md-sale-submit-v23691">Заявить продажу и ждать 1С</button><button class="md91-btn" type="button" id="md-sale-cancel-v23691">Отмена</button></div>';
 m.classList.add('open');
 $('md-sale-close-v23691').onclick=closeSaleModal;$('md-sale-cancel-v23691').onclick=closeSaleModal;
 $('md-sale-channel-v23691').onchange=()=>{S.saleClient=null;updateSaleChannel()};
 $('md-sale-qty-v23691').oninput=updateSaleTotal;
 const inp=$('md-sale-client-search-v23691'),results=$('md-sale-client-results-v23691');
 inp.oninput=()=>{S.saleClient=null;clearTimeout(S.clientSearchTimer);if(results)results.style.display='block';S.clientSearchTimer=setTimeout(()=>searchSaleClients(inp.value),250)};
 $('md-sale-submit-v23691').onclick=submitSaleClaim;
}
async function submitSaleClaim(){
 const a=S.saleAssignment;if(!a)return;
 const q=Number($('md-sale-qty-v23691')?.value||0),ch=$('md-sale-channel-v23691')?.value||'crm_client',comment=$('md-sale-comment-v23691')?.value||'';
 const other=$('md-sale-other-name-v23691')?.value||'';
 if(!Number.isFinite(q)||q<=0){alert('Укажите количество');return}
 if(ch==='crm_client'&&!S.saleClient){alert('Выберите клиента из найденных клиентов CRM');return}
 if(ch==='retail_other'&&!comment.trim()){alert('Для розницы/другого клиента обязательно укажите комментарий');return}
 const btn=$('md-sale-submit-v23691');if(btn){btn.disabled=true;btn.textContent='Сохраняю заявку…'}
 try{
  const out=await rpc('markdown_report_sale_v2',{
    p_assignment_id:a.id,p_actual_qty:q,
    p_client_id:ch==='crm_client'?S.saleClient.id:null,
    p_sale_channel:ch,p_client_name:ch==='retail_other'?(other.trim()||'Розница / другой клиент'):null,
    p_comment:comment.trim()||null
  });
  closeSaleModal();
  alert('⏳ Продажа заявлена. CRM подтвердит её по следующему отчёту 1С.');
  await refreshDetail();await load(true);await loadControlSummary(true);
 }catch(e){alert('Не удалось заявить продажу: '+(e?.message||e))}
 finally{if(btn){btn.disabled=false;btn.textContent='Заявить продажу и ждать 1С'}}
}
function ensureControlModal(){
 let m=$('markdown-control-modal-v23691');
 if(!m){
  m=document.createElement('div');m.id='markdown-control-modal-v23691';
  m.innerHTML='<div class="md91-dialog" id="markdown-control-body-v23691"></div>';
  m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open')});
  document.body.appendChild(m);
 }
 return m;
}
function controlStatusHtml(r){
 if(r.event_type==='sale_claim'&&r.status==='pending')return'<span class="md91-status amber">⏳ Ждёт 1С</span>';
 if(r.event_type==='sale_claim'&&r.status==='discrepancy')return'<span class="md91-status red">🔴 Расхождение</span>';
 if(r.event_type==='sale_claim'&&r.status==='confirmed')return'<span class="md91-status green">✅ Подтверждено '+(r.confirmation_source==='manual'?'вручную':'1С')+'</span>';
 if(r.event_type==='unreported_reduction')return'<span class="md91-status red">🔴 Уменьшилось без заявки</span>';
 if(r.event_type==='unreported_exit')return'<span class="md91-status red">🔴 Исчезло без заявки</span>';
 if(r.event_type==='reappeared')return'<span class="md91-status amber">🟠 Снова появилось</span>';
 if(r.status==='resolved')return'<span class="md91-status">Проверено / закрыто</span>';
 if(r.status==='cancelled')return'<span class="md91-status">Заявка отменена</span>';
 return'<span class="md91-status">'+esc(r.status||'')+'</span>';
}
function renderSalesControl(data){
 const body=$('markdown-control-body-v23691');if(!body)return;
 const rows=Array.isArray(data?.rows)?data.rows:[],st=data?.stats||{};
 const tabs=[['alerts','Требуют внимания',n(st.alerts)],['pending','Ждут 1С',n(st.pending)],['discrepancy','Расхождения',n(st.discrepancy)],['unreported','Без заявки',n(st.unreported)],['confirmed','Подтверждено',n(st.confirmed)],['resolved','Закрытые',0],['all','Все',0]];
 body.innerHTML='<div class="md91-head"><div><div style="font-size:19px;font-weight:900">🛡 Контроль продаж уценки</div><div style="font-size:11px;color:var(--sub)">Заявка менеджера ≠ продажа. Финальный факт сверяется с остатком 1С.</div></div><button class="md91-close" id="md-control-close-v23691">×</button></div>'
  +'<div class="md91-control-tabs">'+tabs.map(x=>'<button class="md-chip '+(S.controlFilter===x[0]?'active':'')+'" data-control-filter="'+x[0]+'">'+x[1]+(x[2]?' <b>'+x[2]+'</b>':'')+'</button>').join('')+'</div>'
  +(rows.length?rows.map(r=>{
    const alert=['discrepancy','open'].includes(r.status),pending=r.status==='pending';
    const stockLine=r.observed_qty_before!=null?'<b>Проверка 1С:</b> '+qty(r.observed_qty_before)+' → '+qty(r.observed_qty_after)+' шт.':('<b>Остаток при заявке:</b> '+qty(r.stock_qty_at_report)+' шт.');
    const manager=r.manager_name||r.reported_by||'—';
    const client=r.client_name||'—';
    let actions='';
    if(r.event_type==='sale_claim'&&r.status==='discrepancy')actions='<div class="md91-actions"><button class="md91-btn good" data-control-action="confirm_manual" data-event-id="'+attr(r.id)+'">Подтвердить вручную</button><button class="md91-btn bad" data-control-action="cancel_claim" data-event-id="'+attr(r.id)+'">Отменить заявку</button></div>';
    else if(r.event_type!=='sale_claim'&&r.status==='open')actions='<div class="md91-actions"><button class="md91-btn" data-control-action="resolve_anomaly" data-event-id="'+attr(r.id)+'">Закрыть после проверки</button></div>';
    return'<div class="md91-control-card '+(alert?'alert':pending?'pending':'')+'">'
      +'<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><b style="font-size:13px">'+esc(r.nomenclature)+'</b><br>Артикул: <b>'+esc(r.article)+'</b></div>'+controlStatusHtml(r)+'</div>'
      +'<div style="margin-top:7px"><b>Количество:</b> '+qty(r.reported_qty)+' шт. · <b>Менеджер:</b> '+esc(manager)+' · <b>Клиент:</b> '+esc(client)+'</div>'
      +(r.approved_unit_price!=null?'<div><b>Твоя утверждённая цена:</b> '+money(r.approved_unit_price)+' · <b>Сумма:</b> '+money(r.reported_revenue)+'</div>':'')
      +'<div>'+stockLine+' · <b>Текущий остаток:</b> '+qty(r.current_1c_qty)+' шт.</div>'
      +'<div><b>Заявлено:</b> '+date(r.reported_at)+(r.confirmed_at?' · <b>Подтверждено:</b> '+date(r.confirmed_at):'')+'</div>'
      +(r.comment?'<div><b>Комментарий:</b> '+esc(r.comment)+'</div>':'')
      +(r.discrepancy_reason?'<div style="margin-top:5px;color:#991B1B"><b>'+esc(r.discrepancy_reason)+'</b></div>':'')
      +(r.confirmation_report_date?'<div style="color:#166534"><b>Отчёт 1С:</b> '+date(r.confirmation_report_date)+'</div>':'')
      +actions+'</div>';
  }).join(''):'<div class="card" style="padding:24px;text-align:center;color:var(--sub)">По этому фильтру событий нет.</div>');
 $('md-control-close-v23691').onclick=()=>ensureControlModal().classList.remove('open');
 body.querySelectorAll('[data-control-filter]').forEach(b=>b.onclick=()=>{S.controlFilter=b.dataset.controlFilter;loadSalesControl(true)});
 body.querySelectorAll('[data-control-action]').forEach(b=>b.onclick=()=>resolveSalesControlEvent(b.dataset.eventId,b.dataset.controlAction));
}
async function loadSalesControl(force=false){
 if(!isPayushin())return;
 if(S.controlFlight)return S.controlFlight;
 const body=$('markdown-control-body-v23691');if(body&&!S.controlRows.length)body.innerHTML='<div style="padding:30px;text-align:center">Загружаю контроль продаж…</div>';
 S.controlFlight=(async()=>{
  try{
   const data=await rpc('markdown_sales_control_v1',{p_filter:S.controlFilter,p_limit:120,p_offset:0});
   S.controlRows=Array.isArray(data?.rows)?data.rows:[];renderSalesControl(data);return data;
  }catch(e){
   if(body)body.innerHTML='<div style="color:#991B1B;padding:20px">Не удалось загрузить контроль: '+esc(e?.message||e)+'</div>';
   return null;
  }finally{S.controlFlight=null}
 })();
 return S.controlFlight;
}
async function openSalesControl(filter='alerts'){
 if(!isPayushin())return;
 S.controlFilter=filter||'alerts';
 const m=ensureControlModal();m.classList.add('open');
 await loadSalesControl(true);
}
async function resolveSalesControlEvent(id,action){
 const title=action==='confirm_manual'?'Подтвердить продажу вручную?':action==='cancel_claim'?'Отменить заявку менеджера?':'Закрыть сигнал после проверки?';
 if(!confirm(title))return;
 const comment=prompt('Обязательный комментарий решения:','');
 if(comment===null||!comment.trim()){alert('Комментарий обязателен');return}
 try{
  await rpc('markdown_resolve_sale_event_v1',{p_event_id:id,p_action:action,p_comment:comment.trim()});
  await loadSalesControl(true);await loadControlSummary(true);if(S.current)await refreshDetail();
 }catch(e){alert('Не удалось сохранить решение: '+(e?.message||e))}
}
function camera(){const x=$('markdown-camera-v23687');if(x){x.value='';x.click()}}
function gallery(){const x=$('markdown-gallery-v23687');if(x){x.value='';x.click()}}
async function compress(file){
 if(!file||!file.type?.startsWith('image/'))return file;
 if(/heic|heif/i.test(file.type)||/\.heic$|\.heif$/i.test(file.name))return file;
 try{
  const bmp=await createImageBitmap(file),max=1600,scale=Math.min(1,max/Math.max(bmp.width,bmp.height)),w=Math.max(1,Math.round(bmp.width*scale)),h=Math.max(1,Math.round(bmp.height*scale));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvas.getContext('2d').drawImage(bmp,0,0,w,h);bmp.close?.();
  const blob=await new Promise(res=>canvas.toBlob(res,'image/jpeg',.82));return blob||file;
 }catch(_){return file}
}
async function uploadFiles(list){
 if(!S.current||!list?.length)return;
 const files=[...list].slice(0,8),type=$('md-photo-type-v23687')?.value||'overall',comment=$('md-photo-comment-v23687')?.value||'',d=dbx();
 if(!d)return;
 let ok=0;
 for(const f of files){
  try{
   const body=await compress(f),ext=(body===f?(f.name.split('.').pop()||'jpg'):'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg',path=S.current+'/'+Date.now()+'_'+Math.random().toString(36).slice(2)+'.'+ext;
   const {error}=await d.storage.from('markdown-photos').upload(path,body,{upsert:false,contentType:body.type||f.type||'image/jpeg'});
   if(error)throw error;
   await rpc('markdown_add_photo_v1',{p_item_id:S.current,p_storage_path:path,p_photo_type:type,p_comment:comment||null});ok++;
  }catch(e){alert('Фото '+esc(f.name)+' не загрузилось: '+(e?.message||e));break}
 }
 if(ok){alert('✅ Загружено фото: '+ok);await refreshDetail();await load(true)}
}
async function deletePhoto(id,path){
 if(!confirm('Удалить это фото?'))return;
 try{
  const out=await rpc('markdown_delete_photo_v1',{p_photo_id:id});
  const p=out?.storage_path||path;if(p)await dbx().storage.from('markdown-photos').remove([p]);
  await refreshDetail();await load(true)
 }catch(e){alert('Не удалось удалить фото: '+(e?.message||e))}
}
function zoom(url){const z=$('markdown-image-v23687');if(!z)return;z.querySelector('img').src=url;z.classList.add('open')}
function boot(){ensureDom();if(active())load(false)}
window.crmMarkdownOpenV23687=load;
window.crmMarkdownOpenSalesControlV23691=openSalesControl;
window.crmMarkdownOpenItemV23687=openItem;
window.crmMarkdownCloseV23687=closeDetail;
window.crmMarkdownSaveConditionV23687=saveCondition;
window.crmMarkdownSubmitPricingV23689=submitPricing;
window.crmMarkdownSavePriceV23687=savePrice;
window.crmMarkdownAssignV23687=assign;
window.crmMarkdownReportSaleV23687=reportSale;
window.crmMarkdownCameraV23687=camera;
window.crmMarkdownGalleryV23687=gallery;
window.crmMarkdownDeletePhotoV23687=deletePhoto;
window.crmMarkdownZoomV23687=zoom;
window.RESANTA_MARKDOWN_V23687=Object.freeze({
 version:V,priceBasis:'Дилерская с НДС',workflow:'photos->ready_for_pricing->priced->sale_claim->1c_confirmed',requiredPhotoTypes:['overall','defect','label'],pageScoped:true,visibleToAllUsers:true,payushinPricingOnly:true,salesVerifiedBy1C:true,salesControlPayushinOnly:true,
 mobilePhotoCapture:true,taskIntegration:true,motivationFields:true,
 noPolling:true,noMutationObserver:true,noGlobalPrefetch:true,cacheMs:60000
});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();