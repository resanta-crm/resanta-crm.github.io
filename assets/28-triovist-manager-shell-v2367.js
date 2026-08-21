/* RESANTA CRM v23.6.7 · TRIOVIST MANAGER WORKSPACE
 * Manager-only navigation shell for Aleksandrenko / Krishtal.
 * Goal: one work task = one visible section; no giant vertical page.
 * Existing Triovist loaders, calculations and data remain the source of truth.
 * Leaders are not affected.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_MANAGER_SHELL_V2367)return;

const V='v23.6.7';
const KRISHTAL='krishtal_na@resanta.ru';
const STORE='resanta_triovist_manager_workspace_v2367';
const COMP_STORE='resanta_triovist_manager_comp_v2367';
let page=null,shell=null,budgetPanel=null,legacyHost=null,observer=null,installed=false,current='',applying=false;
const managedHidden=new Map(),exclusiveHidden=new Map();

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>v==null||v===''?'—':Number(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const ym=()=>String(window.TODAY||new Date().toISOString().slice(0,10)).slice(0,7);
const first=m=>String(m||ym()).slice(0,7)+'-01';
function profile(){try{return window.currentProfile||window.currentUser||{};}catch(_){return{};}}
function email(){return String(profile()?.email||'').trim().toLowerCase();}
function isTriManager(){return String(profile()?.role||'').toLowerCase()==='manager'&&String(profile()?.access_scope||'').toLowerCase()==='triovist';}
function isKrishtal(){return email()===KRISHTAL;}
function dbx(){try{return typeof db!=='undefined'?db:window.db;}catch(_){return window.db;}}
async function rpc(name,args){const d=dbx();if(!d)throw new Error('Соединение с базой ещё не готово');const {data,error}=await d.rpc(name,args||{});if(error)throw error;return data;}
function activePage(){return !!page?.classList.contains('active');}
function text(el){return String(el?.textContent||'').replace(/\s+/g,' ').trim();}

function injectCss(){
  if(document.getElementById('tri-manager-shell-v2367-style'))return;
  const s=document.createElement('style');s.id='tri-manager-shell-v2367-style';s.textContent=`
#tri-manager-shell-v2367{position:sticky;top:60px;z-index:65;background:rgba(249,250,251,.97);backdrop-filter:blur(8px);border:1px solid #DCE6F2;border-radius:14px;padding:10px 12px;margin:0 0 14px;box-shadow:0 5px 18px rgba(15,23,42,.06)}
.tri-ms-head{display:flex;align-items:center;gap:10px;justify-content:space-between;margin-bottom:8px}.tri-ms-title{font-size:12px;font-weight:800;color:#0C447C}.tri-ms-who{font-size:11px;color:var(--sub,#6B7280)}
.tri-ms-nav{display:flex;flex-wrap:wrap;gap:7px}.tri-ms-btn{border:1px solid #D8E0EA;background:#fff;color:#334155;border-radius:9px;padding:8px 11px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}.tri-ms-btn:hover{border-color:#93C5FD;background:#F8FBFF}.tri-ms-btn.active{background:#E6F1FB;border-color:#60A5FA;color:#0C447C;box-shadow:inset 0 0 0 1px rgba(96,165,250,.15)}
.tri-ms-sub{display:none;align-items:center;gap:7px;margin-top:9px;padding-top:9px;border-top:1px solid #E5E7EB}.tri-ms-sub.show{display:flex}.tri-ms-sub-label{font-size:11px;color:var(--sub,#6B7280);font-weight:700;margin-right:3px}.tri-ms-sub button{border:1px solid #D8E0EA;background:#fff;border-radius:8px;padding:7px 11px;font-size:12px;cursor:pointer}.tri-ms-sub button.active{background:#FFF7ED;border-color:#FDBA74;color:#9A3412;font-weight:800}
#tri-manager-budget-v2367{display:none;background:#fff;border:1px solid var(--border,#E5E7EB);border-radius:14px;padding:16px;margin-bottom:16px}.tri-ms-budget-head{display:flex;align-items:end;justify-content:space-between;gap:12px;flex-wrap:wrap}.tri-ms-budget-grid{display:grid;grid-template-columns:repeat(3,minmax(160px,1fr));gap:10px;margin:14px 0}.tri-ms-budget-kpi{background:#F8FAFC;border-radius:10px;padding:12px}.tri-ms-budget-kpi span{display:block;color:#6B7280;font-size:10px;text-transform:uppercase;font-weight:700}.tri-ms-budget-kpi b{display:block;font-size:20px;margin-top:5px}.tri-ms-budget-note{background:#EFF6FF;border:1px solid #BFDBFE;color:#1E3A8A;border-radius:10px;padding:11px 12px;font-size:12px;line-height:1.5}.tri-ms-loading{padding:26px;text-align:center;color:#6B7280}
#page-triovist.tri-manager-v2367 .tri-v2366-btn{display:none!important}
@media(max-width:700px){#tri-manager-shell-v2367{top:56px;padding:9px}.tri-ms-btn{font-size:11px;padding:8px 9px}.tri-ms-budget-grid{grid-template-columns:1fr}.tri-ms-who{display:none}}
`;
  document.head.appendChild(s);
}

function findLegacyHost(){
  if(!page)return null;
  const buttons=[...page.querySelectorAll('button')].filter(b=>!b.closest('#tri-manager-shell-v2367'));
  for(const b of buttons){
    if(!/^\s*(?:[^A-Za-zА-Яа-я0-9]*\s*)?Сводка\s*$/i.test(text(b)))continue;
    const p=b.parentElement;if(!p)continue;
    const all=[...p.querySelectorAll(':scope > button')].map(text).join('|');
    if(/Продажи/i.test(all)&&/Остатки/i.test(all))return p;
  }
  return null;
}
function topChild(node){let x=node;while(x?.parentElement&&x.parentElement!==page)x=x.parentElement;return x;}
function legacyButton(key){
  if(!page)return null;
  const rx={
    home:/Сводка/i,
    sales:/^.*Продажи\s*$/i,
    stock:/Остатки(?:\s+и\s+заказ)?/i,
    tasks:/Задачи\s*ИИ/i,
    motivation:/Мотивация/i,
    cards:/Карточки\s*21vek/i
  }[key];
  if(!rx)return null;
  return [...page.querySelectorAll('button')].find(b=>!b.closest('#tri-manager-shell-v2367')&&!b.dataset.triV2366&&rx.test(text(b)))||null;
}
function commercialButton(key){return page?.querySelector('[data-tri-v2366="'+key+'"]')||null;}

function createShell(){
  if(shell?.isConnected)return shell;
  legacyHost=findLegacyHost();
  const top=legacyHost?topChild(legacyHost):null;
  shell=document.createElement('div');shell.id='tri-manager-shell-v2367';
  const buttons=[
    ['home','🏠 Главная'],['sales','💰 Продажи'],['stock','📦 Остатки'],['tasks','🤖 Задачи ИИ'],['motivation','🏆 Мотивация'],['price','🧮 Расчёт цены'],['budget','💼 Бюджет'],['cards','🧩 Карточки 21vek']
  ];
  if(isKrishtal())buttons.splice(6,0,['comp','🧾 Компенсации']);
  shell.innerHTML='<div class="tri-ms-head"><div class="tri-ms-title">Рабочее меню Triovist</div><div class="tri-ms-who">'+esc(profile()?.name||'Менеджер')+'</div></div><div class="tri-ms-nav">'+buttons.map(x=>'<button type="button" class="tri-ms-btn" data-tri-ms="'+x[0]+'">'+x[1]+'</button>').join('')+'</div>'+(isKrishtal()?'<div class="tri-ms-sub" id="tri-ms-comp-sub"><span class="tri-ms-sub-label">Компенсации:</span><button type="button" data-tri-ms-comp="anp">АНП</button><button type="button" data-tri-ms-comp="si">Компенсация СИ</button></div>':'');
  shell.addEventListener('click',e=>{const b=e.target.closest('[data-tri-ms]');if(b)activate(b.dataset.triMs,true);const c=e.target.closest('[data-tri-ms-comp]');if(c)openComp(c.dataset.triMsComp,true);});
  if(top)page.insertBefore(shell,top);else page.insertBefore(shell,page.children[1]||null);
  budgetPanel=document.createElement('div');budgetPanel.id='tri-manager-budget-v2367';shell.insertAdjacentElement('afterend',budgetPanel);
  if(legacyHost)legacyHost.style.display='none';
  return shell;
}

function setActive(key){
  current=key;
  shell?.querySelectorAll('[data-tri-ms]').forEach(b=>b.classList.toggle('active',b.dataset.triMs===key));
  const sub=shell?.querySelector('#tri-ms-comp-sub');sub?.classList.toggle('show',key==='comp');
  try{localStorage.setItem(STORE+'|'+email(),key);}catch(_){}
}
function setCompActive(kind){
  shell?.querySelectorAll('[data-tri-ms-comp]').forEach(b=>b.classList.toggle('active',b.dataset.triMsComp===kind));
  try{localStorage.setItem(COMP_STORE+'|'+email(),kind);}catch(_){}
}
function savedTab(){try{const x=localStorage.getItem(STORE+'|'+email());return ['home','sales','stock','tasks','motivation','price','budget','cards','comp'].includes(x)?x:'home';}catch(_){return'home';}}
function savedComp(){try{return localStorage.getItem(COMP_STORE+'|'+email())==='si'?'si':'anp';}catch(_){return'anp';}}

function restoreManaged(){for(const [el,val] of managedHidden){if(el?.isConnected)el.style.display=val;}managedHidden.clear();}
function hideManaged(el){if(!el||!el.isConnected||managedHidden.has(el))return;managedHidden.set(el,el.style.display);el.style.display='none';}
function restoreExclusive(){for(const [el,val] of exclusiveHidden){if(el?.isConnected)el.style.display=val;}exclusiveHidden.clear();if(budgetPanel)budgetPanel.style.display='none';}
function hideExclusive(el){if(!el||!el.isConnected||exclusiveHidden.has(el))return;exclusiveHidden.set(el,el.style.display);el.style.display='none';}
function cardFor(id){return document.getElementById(id)?.closest('.card')||document.getElementById(id);}
function knownSections(){
  const arr=[
    document.getElementById('triovist-warning'),cardFor('tri-period-mode'),document.getElementById('tri-kpis'),document.getElementById('tri-manager-cards'),
    document.getElementById('tri-plans-card'),document.getElementById('tri-my-groups-card'),cardFor('tri-groups'),document.getElementById('tri-alerts'),cardFor('tri-details'),document.getElementById('tri-stock-card'),document.getElementById('tri-assignments-card'),
    document.getElementById('tri-ai-independent-root-v2348'),document.getElementById('tri-v22728-pane-tasks'),document.getElementById('tri-v22728-pane-motivation'),document.getElementById('tri-v22728-pane-cards'),document.getElementById('tri-motivation-card')
  ].filter(Boolean);
  return [...new Set(arr)];
}
function allowedFor(key){
  const ids={
    home:['triovist-warning','tri-kpis','tri-manager-cards'],
    sales:['triovist-warning','tri-kpis','tri-manager-cards','tri-groups','tri-alerts','tri-details','tri-period-mode'],
    stock:['tri-stock-card'],
    tasks:['tri-v22728-pane-tasks'],
    motivation:['tri-ai-independent-root-v2348','tri-v22728-pane-motivation','tri-motivation-card','tri-plans-card'],
    cards:['tri-v22728-pane-cards']
  }[key]||[];
  const out=new Set();
  for(const id of ids){const el=document.getElementById(id);if(!el)continue;out.add(el);const c=el.closest('.card');if(c)out.add(c);}
  return out;
}
function compactKnown(key){
  restoreManaged();
  const allow=allowedFor(key);
  for(const el of knownSections()){
    if(allow.has(el))continue;
    let keep=false;for(const a of allow){if(el.contains?.(a)||a.contains?.(el)){keep=true;break;}}
    if(!keep)hideManaged(el);
  }
}

function clickLegacy(key){
  const b=legacyButton(key);if(!b)return false;
  try{b.click();return true;}catch(_){return false;}
}
function leaveCommercial(){
  const b=legacyButton('home');if(b){try{b.click();}catch(_){}}
}
function activateLegacy(key){
  restoreExclusive();
  leaveCommercial();
  setTimeout(()=>{
    clickLegacy(key);
    setTimeout(()=>{compactKnown(key);if(activePage())window.scrollTo({top:0,behavior:'auto'});},35);
  },25);
}

function showBudgetExclusive(){
  restoreManaged();restoreExclusive();
  const header=page?.firstElementChild;
  for(const child of [...(page?.children||[])]){
    if(child===header||child===shell||child===budgetPanel)continue;
    hideExclusive(child);
  }
  if(budgetPanel)budgetPanel.style.display='block';
}
async function renderBudget(month){
  if(!budgetPanel)return;
  budgetPanel.style.display='block';budgetPanel.innerHTML='<div class="tri-ms-loading">Загружаю бюджет…</div>';
  try{
    const d=await rpc('triovist_commercial_get_month',{p_month:first(month)});
    const m=String(d?.month||first(month)).slice(0,7),amount=d?.budget_amount;
    budgetPanel.innerHTML='<div class="tri-ms-budget-head"><div><div class="card-title" style="margin-bottom:4px">💼 Бюджет Triovist</div><div style="font-size:12px;color:#6B7280">Бюджет на месяц, утверждённый руководителем. Менеджер видит сумму, но не меняет её.</div></div><div style="min-width:170px"><label class="form-label">Месяц</label><input id="tri-ms-budget-month" class="form-input" type="month" value="'+esc(m)+'"></div></div><div class="tri-ms-budget-grid"><div class="tri-ms-budget-kpi"><span>Бюджет месяца</span><b>'+(amount==null?'Не внесён':money(amount))+'</b></div><div class="tri-ms-budget-kpi"><span>Продажи месяца</span><b>'+money(d?.sales_revenue||0)+'</b></div><div class="tri-ms-budget-kpi"><span>Статус</span><b style="font-size:16px">'+(amount==null?'Ожидает руководителя':'Утверждён')+'</b></div></div><div class="tri-ms-budget-note"><b>Комментарий руководителя:</b><br>'+esc(d?.budget_comment||'Комментарий пока не добавлен.')+'</div>';
    document.getElementById('tri-ms-budget-month')?.addEventListener('change',e=>renderBudget(e.target.value));
  }catch(e){budgetPanel.innerHTML='<div class="tri-warning"><b>Бюджет пока не загрузился.</b><br>'+esc(e?.message||e)+'</div>';}
}
async function openBudget(){
  leaveCommercial();
  setTimeout(async()=>{showBudgetExclusive();await renderBudget(ym());},45);
}

function clickCommercial(kind){
  const b=commercialButton(kind);if(!b)return false;
  try{b.click();return true;}catch(_){return false;}
}
function openPrice(){
  restoreExclusive();restoreManaged();
  if(!clickCommercial('price'))setTimeout(()=>clickCommercial('price'),250);
}
function openComp(kind,save){
  if(!isKrishtal())return;
  const k=kind==='si'?'si':'anp';if(save)setCompActive(k);else setCompActive(k);
  restoreExclusive();restoreManaged();
  if(!clickCommercial(k))setTimeout(()=>clickCommercial(k),250);
}

async function activate(key,save){
  if(!isTriManager()||applying)return;
  if(key==='comp'&&!isKrishtal())key='home';
  applying=true;try{
    setActive(key);
    if(key==='budget')await openBudget();
    else if(key==='price')openPrice();
    else if(key==='comp')openComp(savedComp(),false);
    else activateLegacy(key);
  }finally{setTimeout(()=>{applying=false;},90);}
}

function hideLegacyNavigation(){
  const h=findLegacyHost();if(h){legacyHost=h;legacyHost.style.display='none';}
  // Old commercial buttons remain callable but should never compete with the workspace menu.
  page?.querySelectorAll('.tri-v2366-btn').forEach(b=>b.style.setProperty('display','none','important'));
}
function install(){
  if(installed)return true;
  if(!isTriManager())return false;
  page=document.getElementById('page-triovist');if(!page)return false;
  injectCss();page.classList.add('tri-manager-v2367');
  createShell();hideLegacyNavigation();
  installed=true;
  observer=new MutationObserver(()=>{
    if(!isTriManager()||!page?.isConnected)return;
    hideLegacyNavigation();
    if(!shell?.isConnected){installed=false;observer?.disconnect();observer=null;setTimeout(install,0);}
  });
  observer.observe(page,{childList:true,subtree:true});
  setTimeout(()=>activate(savedTab(),false),120);
  window.RESANTA_TRIOVIST_MANAGER_SHELL_V2367=Object.freeze({version:V,managerOnly:true,stickyMenu:true,oneSectionAtATime:true,budgetManagersReadOnly:true,compensationKrishtalOnly:true,lastTabMemory:true,leaderUiUntouched:true});
  console.info('RESANTA Triovist manager workspace '+V+' installed');
  return true;
}

if(!install()){
  let tries=0;const t=setInterval(()=>{tries++;if(install()||tries>100)clearInterval(t);},250);
}
})();
