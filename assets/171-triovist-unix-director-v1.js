/* RESANTA CRM · Triovist Uni X Director · SINGLE workspace.
   Presentation only. Existing commercial operations, approvals, task actions,
   parser and competitor modules remain authoritative and unchanged.
*/
(function(w){
'use strict';
if(w.RESANTA_TRIOVIST_UNIX_DIRECTOR_V1)return;
const ID='tr14-unix-home',CSS='tr14-unix-css',VERSION='2026.11.23.3';
const S={ctx:null,month:'',sales:null,error:'',seq:0,loadedAt:0};
const get=id=>document.getElementById(id);
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const N=v=>Number.isFinite(Number(v))?Number(v):0;
const valid=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
const norm=v=>String(v??'').trim().toLowerCase();
const money=v=>valid(v)?Number(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN':'Нет данных';
const formatPercent=v=>Number(v).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%';
const execution=(sales,plan)=>plan>0?formatPercent(sales/plan*100):'—';
const percent=v=>valid(v)?(Number(v)>0?'+':'')+formatPercent(v):'Нет данных';
function thisMonth(){
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Minsk',month:'2-digit',year:'numeric'}).formatToParts(new Date());
 return (parts.find(x=>x.type==='year')?.value||new Date().getUTCFullYear())+'-'+(parts.find(x=>x.type==='month')?.value||String(new Date().getUTCMonth()+1).padStart(2,'0'));
}
const isYm=v=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v||''));
function label(ym){if(!isYm(ym))return ym||'—';return new Date(Date.UTC(+ym.slice(0,4),+ym.slice(5,7)-1,1)).toLocaleDateString('ru-RU',{timeZone:'UTC',month:'long',year:'numeric'})}
const date=v=>String(v||'').slice(0,10)||'Нет даты';
const email=()=>norm(S.ctx?.email);
const triActive=()=>!!get('page-triovist')?.classList.contains('active');
function client(){try{return typeof db!=='undefined'?db:w.db}catch(_){return w.db}}
async function rpc(name,args={}){const d=client();if(!d?.rpc)throw Error('Соединение с CRM недоступно');const r=await d.rpc(name,args);if(r?.error)throw r.error;return r?.data}
function scopedRows(data,ctx=S.ctx){return (Array.isArray(data?.items)?data.items:[]).filter(x=>!ctx?.is_manager||norm(x.manager_email)===norm(ctx.email))}
function compute(data,ctx=S.ctx){
 if(!data||!Array.isArray(data.items))return null;
 const rows=scopedRows(data,ctx),byGroup=new Map(),byManager=new Map();let curr=0,prev=0;
 for(const x of rows){
  const a=Math.round(N(x.current_revenue)*100),b=Math.round(N(x.previous_revenue)*100);curr+=a;prev+=b;
  const mail=norm(x.manager_email),who=String(x.manager_name||'Менеджер'),group=String(x.assigned_group||x.category||'Не распределено');
  const id=mail+'|'+group;
  if(!byGroup.has(id))byGroup.set(id,{name:group,manager:who,email:mail,cur:0,prev:0});
  byGroup.get(id).cur+=a;byGroup.get(id).prev+=b;
  if(!byManager.has(mail))byManager.set(mail,{name:who,email:mail,cur:0,prev:0});
  byManager.get(mail).cur+=a;byManager.get(mail).prev+=b;
 }
 const plans=new Map();
 for(const p of data.period_plans||[])if(valid(p?.plan_amount))plans.set(norm(p.manager_email),Number(p.plan_amount));
 const managers=[...byManager.values()].filter(x=>x.email).map(x=>({...x,cur:x.cur/100,prev:x.prev/100,plan:plans.has(x.email)?plans.get(x.email):null}));
 return {current:curr/100,previous:prev/100,yoy:prev>0?(curr/prev-1)*100:null,
  groups:[...byGroup.values()].map(x=>({...x,cur:x.cur/100,prev:x.prev/100})),managers,
  plan:managers.length&&managers.every(x=>x.plan!==null)?managers.reduce((a,b)=>a+b.plan,0):null,
  imported:data.last_import?.imported_at||null};
}
function css(){
 if(get(CSS))return;
 const style=document.createElement('style');style.id=CSS;
 style.textContent=`
#tr14-shell.ux-director-shell{padding:0 0 12px;border:1px solid var(--border);background:var(--bg);border-radius:12px;box-shadow:none}
#tr14-shell.ux-director-shell>.tr14-head{padding:12px 16px;margin:0;border-bottom:1px solid var(--border);background:var(--card);border-radius:12px 12px 0 0}
#tr14-shell.ux-director-shell .tr14-head b{color:var(--text);font-size:16px}
#tr14-shell.ux-director-shell .tr14-head span,#tr14-shell.ux-director-shell .tr14-label{color:var(--sub);font-size:12px}
#tr14-shell.ux-director-shell .tr14-refresh,#tr14-shell.ux-director-shell .tr14-row button{color:var(--text);border-color:var(--border);background:var(--card);font-size:14px;font-weight:600}
#tr14-shell.ux-director-shell .tr14-refresh:hover,#tr14-shell.ux-director-shell .tr14-row button:hover{background:var(--bg)}
#tr14-shell.ux-director-shell .tr14-row button.on{background:var(--ab);border-color:var(--a);color:var(--at)}
#tr14-shell.ux-director-shell>.tr14-g{padding:10px 13px 2px;grid-template-columns:minmax(0,1.65fr) minmax(260px,1fr)}
#tr14-shell.ux-director-shell .tr14-box{background:var(--card);border-color:var(--border)}
#tr14-shell.ux-director-shell [data-tr14="infographics"]{display:none!important}
#tr14-shell.ux-director-shell :is(button,input):focus-visible{outline:3px solid var(--a);outline-offset:3px}
#${ID}{display:none;padding:14px 13px 3px;color:var(--text);font:inherit}
#${ID}[data-visible="true"]{display:block}
#${ID} *{box-sizing:border-box}
#${ID} .ux-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
#${ID} .ux-brand{margin:0;font-size:24px;line-height:1.2;font-weight:700;letter-spacing:-.4px}
#${ID} .ux-meta{position:relative;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#${ID} .ux-meta input{max-width:100%;min-height:40px;border:1px solid var(--border);border-radius:8px;background:var(--card);padding:7px 10px;color:var(--text);font:inherit}
#${ID} .ux-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:12px}
#${ID} .ux-tile,#${ID} .ux-card{padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--card);min-width:0}
#${ID} .ux-tile-label{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:7px;color:var(--sub);font-size:14px}
#${ID} .ux-tile strong{display:block;font-size:clamp(19px,1.8vw,28px);line-height:1.2;font-weight:650;letter-spacing:-.4px;font-variant-numeric:tabular-nums}
#${ID} .ux-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px}
#${ID} .ux-card h3{margin:0;font-size:16px;font-weight:650}
#${ID} .ux-sales-link{min-height:38px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--a);font:inherit;cursor:pointer}
#${ID} .ux-sales-link:hover{background:var(--bg)}
#${ID} .ux-manager-table{width:100%;border-collapse:collapse;font-size:14px;font-variant-numeric:tabular-nums}
#${ID} .ux-manager-table th,#${ID} .ux-manager-table td{text-align:right;padding:9px 8px}
#${ID} .ux-manager-table th:first-child{text-align:left;padding-inline-start:0}
#${ID} .ux-manager-table :is(th,td):last-child{padding-inline-end:0}
#${ID} .ux-manager-table thead th{font-weight:500;color:var(--sub)}
#${ID} .ux-manager-table tbody tr{border-top:1px solid var(--border)}
#${ID} .ux-manager-table tbody th,#${ID} .ux-manager-table strong{font-weight:650}
#${ID} .ux-execution{color:var(--a)}
#${ID} .ux-manager-result{display:inline-flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:wrap}
#${ID} .ux-help{position:relative;display:inline-flex;align-items:center;vertical-align:middle;flex:none}
#${ID} .ux-help button{display:grid;place-items:center;width:28px;height:28px;padding:0;border:1px solid var(--border);border-radius:7px;background:var(--card);color:var(--a);font:700 18px/1 system-ui;cursor:pointer}
#${ID} .ux-help:hover button,#${ID} .ux-help button:focus{background:var(--ab)}
#${ID} .ux-tooltip{display:none;position:absolute;z-index:3;inset-block-start:100%;inset-inline-end:0;width:max-content;max-width:min(250px,calc(100vw - 40px));padding:9px 11px;border:1px solid var(--border);border-radius:8px;background:var(--card);box-shadow:0 4px 14px #11182720;color:var(--text);font-size:13px;line-height:1.5;text-align:left;font-weight:400}
#${ID} .ux-meta .ux-help{position:static}
#${ID} .ux-meta .ux-tooltip{width:250px;max-width:100%}
#${ID} .ux-help:is(:hover,:focus-within) .ux-tooltip{display:block}
#${ID} .ux-state{padding:16px;text-align:center;color:var(--sub);font-size:14px}
#tr14-unix-back{display:none;background:var(--card);border:1px solid var(--border);border-radius:8px;padding:9px 12px;margin:8px 13px 0;cursor:pointer;color:var(--a);font-weight:600}
#tr14-unix-back[data-visible="true"]{display:block}
@media(max-width:990px){#tr14-shell.ux-director-shell>.tr14-g{grid-template-columns:1fr}}
@media(max-width:700px){#tr14-shell.ux-director-shell>.tr14-head{flex-wrap:wrap}#${ID} .ux-kpis{grid-template-columns:1fr}#${ID} .ux-manager-table th,#${ID} .ux-manager-table td{padding-inline:4px}#${ID} .ux-manager-table tbody th{overflow-wrap:anywhere}}
`;
 document.head.appendChild(style);
}
function mount(){
 const shell=get('tr14-shell');if(!shell)return null;css();if(!shell.classList.contains('ux-director-shell'))shell.classList.add('ux-director-shell');
 let r=get(ID);
 if(!r){
  r=document.createElement('section');r.id=ID;r.setAttribute('aria-label','Сводка Триовист');r.dataset.visible='false';r.innerHTML='<div class="ux-state">Загружаю аналитику…</div>';
  shell.appendChild(r);
  r.addEventListener('click',e=>{
   if(e.target.closest('[data-ux-sales]'))shell.querySelector('[data-tr14="sales"]')?.click();
   else e.target.closest('.ux-help button')?.focus();
  });
  r.addEventListener('change',e=>{if(e.target?.dataset?.uxMonth===undefined)return;const ym=e.target.value;if(!isYm(ym)||ym>thisMonth()){e.target.value=S.month;return}S.month=ym;void refresh()});
 }
 let back=get('tr14-unix-back');
 if(!back){back=document.createElement('button');back.type='button';back.id='tr14-unix-back';back.textContent='К сводке';back.dataset.visible='false';back.addEventListener('click',()=>shell.querySelector('[data-tr14="home"]')?.click());shell.insertBefore(back,r)}
 return r;
}
function show(v){
 const root=mount();
 const visible=String(!!v);
 if(root&&root.dataset.visible!==visible){root.dataset.visible=visible;mountMarketWork(v?root:null)}
 const back=get('tr14-unix-back');
 if(back)back.dataset.visible=String(triActive()&&!v);
}
function help(key,name,note){
 const id=ID+'-hint-'+key;
 return '<span class="ux-help"><button type="button" aria-label="'+E(name)+'" aria-describedby="'+id+'">*</button>'+
 '<span class="ux-tooltip" id="'+id+'" role="tooltip">'+E(note)+'</span></span>';
}
function tile(title,value,hint){
 return '<div class="ux-tile"><div class="ux-tile-label"><span>'+E(title)+'</span>'+hint+'</div><strong>'+E(value)+'</strong></div>';
}
function people(m){
 const rows=m.managers.map((x,index)=>'<tr><th scope="row">'+E(x.name)+'</th><td><strong>'+E(money(x.cur))+
 '</strong></td><td><span class="ux-manager-result"><strong class="ux-execution">'+E(execution(x.cur,x.plan))+'</strong>'+
 help('manager-'+index,'План на месяц · '+x.name,x.plan===null?'План на месяц не задан':'План на месяц · '+money(x.plan))+
 '</span></td></tr>').join('');
 return '<section class="ux-card" aria-labelledby="tr14-managers"><div class="ux-card-head"><h3 id="tr14-managers">Работа категорийных менеджеров</h3>'+
 '<button class="ux-sales-link" type="button" data-ux-sales>Детали продаж</button></div>'+
 (rows?'<table class="ux-manager-table"><thead><tr><th scope="col">Менеджер</th><th scope="col">Продажи</th><th scope="col">Выполнение</th></tr></thead><tbody>'+
 rows+'</tbody></table>':'<p class="ux-state">Нет продаж менеджеров за выбранный месяц.</p>')+'</section>';
}
function mountMarketWork(root){
 window.RESANTA_TRIOVIST_MARKET_AI_V1?.mountSummary(root?.querySelector('[data-ux-market-work]'));
}
function render(){
 const root=mount();if(!root)return false;
 const marketWork='<section class="tm266 tm266-summary" data-ux-market-work aria-label="Работа по позициям 21vek"></section>';
 const m=compute(S.sales),current=S.month===thisMonth();
 const toolbar='<div class="ux-toolbar"><h2 class="ux-brand">Триовист</h2><div class="ux-meta">'+
 '<input aria-label="Месяц отчёта" type="month" data-ux-month max="'+E(thisMonth())+'" value="'+E(S.month)+'">'+
 (current?help('period','О сравнении текущего месяца','Текущий месяц не завершён. С полным прошлогодним месяцем его можно сравнить только справочно.'):'')+
 '</div></div>';
 if(!m){
  root.innerHTML=toolbar+'<div class="ux-state" role="status">Продажи 1С пока не подтверждены. '+E(S.error)+'</div>'+marketWork;
  mountMarketWork(root);
  return false;
 }
 const planNote=m.plan>0?'Выполнение '+execution(m.current,m.plan):'Выполнение плана недоступно';
 root.innerHTML=toolbar+'<div class="ux-kpis">'+
 tile('Продажи · '+label(S.month),money(m.current),help('source','Источник продаж','Факт 1С · импорт: '+date(m.imported)))+
 tile('Год к году',current?'Не считаем':percent(m.yoy),help('yoy','О сравнении год к году',
  current?'Месяц ещё не закрыт':'Сопоставимые полные месяцы · '+S.month.slice(0,4)+' и '+(Number(S.month.slice(0,4))-1)))+
 tile('План месяца',m.plan===null?'Не задан':money(m.plan),help('plan','Выполнение плана месяца',planNote))+
 '</div>'+marketWork+people(m);
 mountMarketWork(root);
 return true;
}
// A single-flight key includes the user identity and report month: never share data across scopes.
let pendingLoad=null,pendingLoadKey='';
async function load(){
 const key=email()+'|'+S.month;
 if(pendingLoad&&pendingLoadKey===key)return pendingLoad;
 const job=loadOnce();
 pendingLoad=job;pendingLoadKey=key;
 try{return await job}
 finally{if(pendingLoad===job){pendingLoad=null;pendingLoadKey=''}}
}
async function loadOnce(){
 const root=mount();if(!root)return false;
 const seq=++S.seq,month=S.month;
 S.error='';S.sales=null;
 root.innerHTML='<div class="ux-state" role="status">Загружаю продажи 1С…</div>';
 try{
  const sales=await rpc('triovist_get_dashboard',{p_end_month:month,p_mode:'month'});
  if(seq!==S.seq)return false;
  S.sales=sales;S.loadedAt=Date.now();
  return render();
 }catch(e){
  if(seq!==S.seq)return false;
  S.sales=null;S.loadedAt=0;
  S.error=String(e?.message||'Данные недоступны').slice(0,180);
  return render();
 }
}
async function open(ctx){
 if(!ctx||(!ctx.is_manager&&!ctx.is_leader))return false;
 const a=norm(S.ctx?.email),b=norm(ctx.email);
 if(a&&a!==b){S.sales=null;S.month='';S.seq++}
 S.ctx=ctx;show(true);
 if(!S.month)S.month=thisMonth();
 if(S.sales&&Date.now()-S.loadedAt<120000)return render()
 return load();
}
async function refresh(){if(!S.ctx)return false;S.sales=null;return load()}
w.RESANTA_TRIOVIST_UNIX_DIRECTOR_V1=Object.freeze({version:VERSION,open,refresh,show,render,compute,scopedRows,readOnly:true,unified:true,commercePersistent:true,parsersUntouched:true});
})(window);
