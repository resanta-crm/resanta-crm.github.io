/* RESANTA CRM v23.6.12 · TRIOVIST STABLE WORKSPACE
 * Root fix:
 * - managers no longer depend on the legacy Triovist tab bar (it does not exist in manager UI);
 * - server identity + browser profile fallback;
 * - manager sections are switched by existing DOM block IDs;
 * - full price is available with 50/100/ALL paging and anomaly-only filter;
 * - commercial permissions remain server-side.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_SINGLE_V23612)return;
const V='v23.6.12';
const STORE='resanta_triovist_v23612_tab';
const LEADERS=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
let ctx=null,page=null,legacyHost=null,legacyTop=null,insertBefore=null,shell=null,panel=null,observer=null;
let active='home',busy=false,hidden=new Map();
let priceState={q:'',only:false,offset:0,limit:50,last:null};

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>(Number(v)||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const ym=()=>String((typeof TODAY!=='undefined'&&TODAY)||new Date().toISOString().slice(0,10)).slice(0,7);
const first=m=>String(m||ym()).slice(0,7)+'-01';
function dbx(){try{return typeof db!=='undefined'?db:window.db;}catch(_){return window.db;}}
async function rpc(name,args){const d=dbx();if(!d)throw new Error('Соединение с базой ещё не готово');const {data,error}=await d.rpc(name,args||{});if(error)throw error;return data;}
function text(el){return String(el?.textContent||'').replace(/\s+/g,' ').trim();}
function topChild(n){let x=n;while(x?.parentElement&&x.parentElement!==page)x=x.parentElement;return x;}

function browserProfile(){
  try{if(typeof currentProfile!=='undefined'&&currentProfile)return currentProfile;}catch(_){}
  try{if(typeof currentUser!=='undefined'&&currentUser)return currentUser;}catch(_){}
  try{return window.currentProfile||window.currentUser||null;}catch(_){return null;}
}
function localContext(){
  const p=browserProfile(); if(!p)return null;
  const email=String(p.email||'').trim().toLowerCase(),role=String(p.role||'').toLowerCase(),scope=String(p.access_scope||'').toLowerCase();
  const isManager=role==='manager'&&scope==='triovist';
  const isLeader=role==='boss'&&LEADERS.has(email);
  if(!isManager&&!isLeader)return null;
  return {version:V,email,name:p.name||email,role:p.role,access_scope:p.access_scope,is_manager:isManager,is_leader:isLeader,can_write_expenses:isLeader||email==='krishtal_na@resanta.ru',can_view_price:true,source:'browser_fallback'};
}
async function loadContext(){
  try{
    const c=await rpc('triovist_ui_context',{});
    if(c&&(c.is_manager||c.is_leader))return c;
  }catch(e){console.warn('Triovist '+V+' server context waiting:',e?.message||e);}
  return localContext();
}

function injectCss(){
  if(document.getElementById('tri-v23612-style'))return;
  const s=document.createElement('style');s.id='tri-v23612-style';s.textContent=`
#tri-v23612-shell{position:sticky;top:60px;z-index:85;background:rgba(249,250,251,.98);backdrop-filter:blur(8px);border:1px solid #DCE6F2;border-radius:14px;padding:10px 12px;margin:0 0 14px;box-shadow:0 5px 18px rgba(15,23,42,.06)}
.tri-v23612-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px}.tri-v23612-title{font-size:13px;font-weight:800;color:#0C447C}.tri-v23612-user{font-size:11px;color:#64748B}
.tri-v23612-groups{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);gap:9px}.tri-v23612-group{border-radius:10px;padding:8px;min-width:0}.tri-v23612-work{background:#F8FAFC;border:1px solid #E5E7EB}.tri-v23612-commerce{background:#F5F3FF;border:1px solid #DDD6FE}.tri-v23612-label{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#64748B;margin:0 0 6px 2px}
.tri-v23612-row{display:flex;gap:6px;overflow-x:auto;scrollbar-width:thin;padding-bottom:2px}.tri-v23612-row button{flex:0 0 auto;border:1px solid #D8E0EA;background:#fff;color:#334155;border-radius:9px;padding:8px 10px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap}.tri-v23612-row button.active{background:#E6F1FB;border-color:#60A5FA;color:#0C447C}.tri-v23612-commerce .tri-v23612-row button.active{background:#EDE9FE;border-color:#A78BFA;color:#5B21B6}
#tri-v23612-panel{background:#fff;border:1px solid #E5E7EB;border-radius:14px;padding:16px;margin:0 0 16px}.tri-v23612-section{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap}.tri-v23612-section h3{margin:0;font-size:19px}.tri-v23612-note{font-size:11px;color:#64748B;line-height:1.5}.tri-v23612-kpis{display:grid;grid-template-columns:repeat(4,minmax(145px,1fr));gap:10px;margin:13px 0}.tri-v23612-kpi{background:#F8FAFC;border-radius:10px;padding:12px}.tri-v23612-kpi span{display:block;font-size:10px;color:#64748B;text-transform:uppercase;font-weight:700}.tri-v23612-kpi b{display:block;font-size:19px;margin-top:4px}
.tri-v23612-info{padding:10px 12px;border:1px solid #BFDBFE;background:#EFF6FF;color:#1E3A8A;border-radius:10px;font-size:12px;line-height:1.5;margin:10px 0}.tri-v23612-warn{padding:10px 12px;border:1px solid #FDBA74;background:#FFF7ED;color:#9A3412;border-radius:10px;font-size:12px;line-height:1.5;margin:10px 0}
.tri-v23612-form{display:grid;grid-template-columns:160px 180px minmax(230px,1fr) auto;gap:9px;align-items:end;margin:12px 0}.tri-v23612-search{display:grid;grid-template-columns:minmax(260px,1fr) auto;gap:8px;margin:12px 0}
.tri-v23612-price-tools{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}.tri-v23612-filter{border:1px solid #F59E0B;background:#FFF7ED;color:#9A3412;border-radius:9px;padding:8px 11px;font-size:12px;font-weight:800;cursor:pointer}.tri-v23612-filter.active{background:#FFEDD5;border-color:#EA580C;color:#9A3412}.tri-v23612-pagebtn{border:1px solid #D8E0EA;background:#fff;border-radius:8px;padding:7px 10px;cursor:pointer}.tri-v23612-pagebtn:disabled{opacity:.45;cursor:default}.tri-v23612-select{border:1px solid #D8E0EA;border-radius:8px;padding:7px 9px;background:#fff}
.tri-v23612-table{width:100%;border-collapse:collapse;font-size:12px}.tri-v23612-table th{text-align:left;background:#F8FAFC;color:#64748B;padding:9px;border-bottom:1px solid #E5E7EB;white-space:nowrap}.tri-v23612-table td{padding:9px;border-bottom:1px solid #E5E7EB;vertical-align:top}.tri-v23612-table tr[data-v23612-sku]{cursor:pointer}.tri-v23612-table tr[data-v23612-sku]:hover{background:#F8FAFC}.tri-v23612-suspect{background:#FEF2F2!important;color:#B91C1C;font-weight:800}.tri-v23612-smallbad{font-size:10px;color:#B91C1C;margin-top:3px;line-height:1.25}
.tri-v23612-private{border:1px solid #C4B5FD;background:#F5F3FF;border-radius:12px;padding:13px;margin-top:12px}.tri-v23612-private-grid{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:8px;margin-top:10px}.tri-v23612-private-cell{background:#fff;border:1px solid #DDD6FE;border-radius:9px;padding:9px}.tri-v23612-private-cell span{display:block;font-size:9px;color:#6D28D9;text-transform:uppercase;font-weight:800}.tri-v23612-private-cell b{display:block;margin-top:3px;font-size:15px}.tri-v23612-good{color:#166534}.tri-v23612-bad{color:#B91C1C}.tri-v23612-doc{display:inline-flex;align-items:center;gap:5px;margin:2px 4px 2px 0}
#tri-v23611-shell,#tri-v23611-panel,#tri-v2369-shell,#tri-v2369-panel,#tri-manager-shell-v2367,#tri-manager-budget-v2367,#tri-commercial-panel-v2366{display:none!important}.tri-v2366-btn,.tri-v2369-tab{display:none!important}
@media(max-width:1000px){.tri-v23612-groups{grid-template-columns:1fr}.tri-v23612-kpis,.tri-v23612-private-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:620px){#tri-v23612-shell{top:56px;padding:9px}.tri-v23612-user{display:none}.tri-v23612-kpis,.tri-v23612-private-grid,.tri-v23612-form,.tri-v23612-search{grid-template-columns:1fr}.tri-v23612-row button{font-size:10.5px;padding:7px 9px}}
`;document.head.appendChild(s);
}

function findPeriodTop(){
  if(!page)return null;
  for(const el of page.children){
    const t=text(el);
    if(/Период/i.test(t)&&/Месяц окончания/i.test(t)&&/Поиск/i.test(t))return el;
  }
  return null;
}
function locate(){
  page=document.getElementById('page-triovist');if(!page)return false;
  legacyHost=null;legacyTop=null;
  for(const b of page.querySelectorAll('button')){
    if(b.closest('#tri-v23612-shell'))continue;
    if(!/Сводка/i.test(text(b)))continue;
    const p=b.parentElement;if(!p)continue;
    const all=[...p.querySelectorAll(':scope > button')].map(text).join('|');
    if(/Продажи/i.test(all)&&/Остатки/i.test(all)){legacyHost=p;legacyTop=topChild(p);break;}
  }
  insertBefore=legacyTop||findPeriodTop()||[...page.children].find(el=>/ПРОДАЖИ ПЕРИОДА/i.test(text(el)))||page.children[1]||null;
  return !!insertBefore;
}
function legacyButton(key){
  const rx={home:/Сводка/i,sales:/^.*Продажи\s*$/i,stock:/Остатки(?:\s+и\s+заказ)?/i,tasks:/Задачи\s*ИИ/i,motivation:/Мотивация/i,cards:/Карточки\s*21vek/i}[key];
  if(!rx||!page)return null;
  return [...page.querySelectorAll('button')].find(b=>!b.closest('#tri-v23612-shell')&&!b.dataset.v2369&&!b.dataset.triV2366&&rx.test(text(b)))||null;
}
function hideLegacy(){
  if(legacyTop)legacyTop.style.setProperty('display','none','important');
  page?.querySelectorAll('button').forEach(b=>{
    if(b.closest('#tri-v23612-shell'))return;
    const t=text(b);if(/Отгрузки\s*1С/i.test(t)||/Новинки/i.test(t))b.style.setProperty('display','none','important');
  });
}

function ensureShell(){
  if(shell?.isConnected)return;
  shell=document.createElement('div');shell.id='tri-v23612-shell';
  const work=[['home','📊 Сводка'],['sales','💰 Продажи'],['stock','📦 Остатки и заказ'],['tasks','🤖 Задачи ИИ'],['motivation','🏆 Мотивация'],['cards','🧩 Карточки 21vek']];
  const comm=[['anp','🧾 АНП'],['si','🛠 Компенсация СИ'],['budget','💼 Бюджет'],['price','🧮 Расчёт цены']];
  const row=a=>a.map(([k,l])=>'<button type="button" data-v23612-tab="'+k+'">'+l+'</button>').join('');
  shell.innerHTML='<div class="tri-v23612-head"><div class="tri-v23612-title">Triovist · рабочее меню</div><div class="tri-v23612-user">'+esc(ctx?.name||ctx?.email||'')+'</div></div><div class="tri-v23612-groups"><div class="tri-v23612-group tri-v23612-work"><div class="tri-v23612-label">Работа</div><div class="tri-v23612-row">'+row(work)+'</div></div><div class="tri-v23612-group tri-v23612-commerce"><div class="tri-v23612-label">Коммерция</div><div class="tri-v23612-row">'+row(comm)+'</div></div></div>';
  shell.addEventListener('click',e=>{const b=e.target.closest('[data-v23612-tab]');if(b)activate(b.dataset.v23612Tab,true);});
  page.insertBefore(shell,insertBefore);
  panel=document.createElement('div');panel.id='tri-v23612-panel';panel.style.display='none';shell.insertAdjacentElement('afterend',panel);bindPanel();
}
function ensurePanel(){if(panel?.isConnected)return;panel=document.createElement('div');panel.id='tri-v23612-panel';panel.style.display='none';shell?.insertAdjacentElement('afterend',panel);bindPanel();}
function setActive(k){active=k;shell?.querySelectorAll('[data-v23612-tab]').forEach(b=>b.classList.toggle('active',b.dataset.v23612Tab===k));try{localStorage.setItem(STORE+'|'+(ctx?.email||''),k);}catch(_){}}
function saved(){try{const k=localStorage.getItem(STORE+'|'+(ctx?.email||''));return ['home','sales','stock','tasks','motivation','cards','anp','si','budget','price'].includes(k)?k:'home';}catch(_){return'home';}}
function restoreHidden(){for(const [el,val] of hidden){if(el?.isConnected)el.style.display=val;}hidden.clear();if(panel)panel.style.display='none';hideLegacy();}
function hideNode(el){if(!el||!el.isConnected||hidden.has(el))return;hidden.set(el,el.style.display);el.style.display='none';}
function directNode(el){return el?topChild(el):null;}
function idNode(id){return directNode(document.getElementById(id));}
function managerKnownNodes(){
  const ids=['triovist-warning','tri-period-mode','tri-kpis','tri-manager-cards','tri-plans-card','tri-my-groups-card','tri-groups','tri-alerts','tri-details','tri-stock-card','tri-assignments-card','tri-ai-independent-root-v2348','tri-v22728-pane-tasks','tri-v22728-pane-motivation','tri-v22728-pane-cards','tri-motivation-card'];
  const out=[]; for(const id of ids){const n=idNode(id);if(n&&!out.includes(n))out.push(n);} const period=findPeriodTop();if(period&&!out.includes(period))out.push(period);return out;
}
function allowedManager(k){
  const map={
    home:['triovist-warning','tri-kpis','tri-manager-cards','tri-plans-card'],
    sales:['triovist-warning','tri-period-mode','tri-kpis','tri-manager-cards','tri-groups','tri-alerts','tri-details'],
    stock:['tri-stock-card'],
    tasks:['tri-v22728-pane-tasks','tri-assignments-card'],
    motivation:['tri-ai-independent-root-v2348','tri-v22728-pane-motivation','tri-motivation-card','tri-plans-card'],
    cards:['tri-v22728-pane-cards']
  };
  const set=new Set();
  for(const id of map[k]||[]){const n=idNode(id);if(n)set.add(n);}
  if(k==='sales'){const p=findPeriodTop();if(p)set.add(p);}
  return set;
}
function showManagerWork(k){
  restoreHidden();setActive(k);
  const allow=allowedManager(k),known=managerKnownNodes();
  for(const n of known)if(!allow.has(n))hideNode(n);
  if(!allow.size&&k!=='home')console.warn('Triovist '+V+' no known manager section for',k);
  window.scrollTo({top:0,behavior:'auto'});
}
function showLeaderWork(k){
  restoreHidden();setActive(k);const b=legacyButton(k);if(b){try{b.click();}catch(_){}}window.scrollTo({top:0,behavior:'auto'});
}
function showWork(k){if(ctx?.is_manager&&!legacyHost)showManagerWork(k);else showLeaderWork(k);}

function concealForCommercial(){
  restoreHidden();ensurePanel();
  const children=[...page.children],idx=children.indexOf(shell);
  for(let i=idx+1;i<children.length;i++){const el=children[i];if(el===panel)continue;hideNode(el);}
  panel.style.display='block';
}

async function getMonth(m){return await rpc('triovist_commercial_get_month',{p_month:first(m)});}
function monthPicker(k,m){return '<div style="min-width:170px"><label class="form-label">Месяц</label><input class="form-input" type="month" data-v23612-month="'+k+'" value="'+esc(String(m||ym()).slice(0,7))+'"></div>';}
function docsHtml(r,write){const ds=(r.documents||[]).map(d=>'<button type="button" class="btn-secondary tri-v23612-doc" data-v23612-doc="'+esc(d.storage_path)+'">📎 '+esc(d.file_name)+'</button>').join('')||'<span class="tri-v23612-note">нет документа</span>';return ds+(write?'<label class="btn-secondary tri-v23612-doc" style="cursor:pointer">＋ документ<input type="file" hidden data-v23612-attach="'+esc(r.id)+'"></label>':'');}
async function renderExpense(kind,m){
  const d=await getMonth(m||ym()),rows=(d.expenses||[]).filter(x=>x.expense_type===kind),total=rows.reduce((s,x)=>s+Number(x.amount||0),0),write=!!d.can_write_expenses;
  panel.innerHTML='<div class="tri-v23612-section"><div><h3>'+(kind==='anp'?'🧾 АНП':'🛠 Компенсация СИ')+'</h3><div class="tri-v23612-note">Фактические затраты по месяцам. '+(write?'Можно вносить расходы и прикладывать документы.':'Режим просмотра.')+'</div></div>'+monthPicker(kind,d.month)+'</div><div class="tri-v23612-kpis"><div class="tri-v23612-kpi"><span>'+(kind==='anp'?'АНП':'СИ')+' за месяц</span><b>'+money(total)+'</b></div><div class="tri-v23612-kpi"><span>АНП + СИ факт</span><b>'+money(d.expenses_total)+'</b></div><div class="tri-v23612-kpi"><span>Документов</span><b>'+Number(d.documents_count||0)+'</b></div><div class="tri-v23612-kpi"><span>Доступ</span><b style="font-size:15px">'+(write?'Внесение':'Просмотр')+'</b></div></div>'+(write?'<div class="tri-v23612-form"><div><label class="form-label">Дата</label><input id="tri-v23612-exp-date" class="form-input" type="date" value="'+esc(String(d.month||first()).slice(0,7)+'-01')+'"></div><div><label class="form-label">Сумма, BYN</label><input id="tri-v23612-exp-amount" class="form-input" type="number" min="0" step="0.01" placeholder="0,00"></div><div><label class="form-label">Комментарий / основание</label><input id="tri-v23612-exp-comment" class="form-input" placeholder="Что компенсировали / на что АНП"></div><button type="button" class="btn-primary" data-v23612-save-exp="'+kind+'">Сохранить</button></div>':'<div class="tri-v23612-info">Просмотр без права изменения.</div>')+'<div style="overflow:auto"><table class="tri-v23612-table"><thead><tr><th>Дата</th><th>Сумма</th><th>Комментарий</th><th>Кто внёс</th><th>Документы</th></tr></thead><tbody>'+(rows.length?rows.map(r=>'<tr><td><b>'+esc(r.expense_date)+'</b></td><td><b>'+money(r.amount)+'</b></td><td>'+esc(r.comment||'—')+'</td><td>'+esc(r.created_by||'—')+'</td><td>'+docsHtml(r,write)+'</td></tr>').join(''):'<tr><td colspan="5">За выбранный месяц расходов ещё нет.</td></tr>')+'</tbody></table></div>';
}
async function renderBudget(m){
  const d=await getMonth(m||ym()),gross=Number(d.sales_revenue||0),net=Number(d.sales_revenue_ex_vat||gross/1.2),norm=Math.round(net*0.015*100)/100;
  panel.innerHTML='<div class="tri-v23612-section"><div><h3>💼 Бюджет Triovist</h3><div class="tri-v23612-note">Норматив считается от продаж без НДС 20%. Менеджеры видят бюджет, меняет сумму только руководитель.</div></div>'+monthPicker('budget',d.month)+'</div><div class="tri-v23612-kpis"><div class="tri-v23612-kpi"><span>Бюджет месяца</span><b>'+money(d.budget_amount)+'</b></div><div class="tri-v23612-kpi"><span>Продажи с НДС</span><b>'+money(gross)+'</b></div><div class="tri-v23612-kpi"><span>Продажи без НДС 20%</span><b>'+money(net)+'</b></div><div class="tri-v23612-kpi"><span>Норматив 1,5%</span><b>'+money(norm)+'</b></div></div><div class="tri-v23612-info"><b>Комментарий руководителя:</b><br>'+esc(d.budget_comment||'Комментарий пока не добавлен.')+'</div>'+(d.is_leader?'<div class="tri-v23612-form" style="grid-template-columns:190px minmax(250px,1fr) auto"><div><label class="form-label">Сумма бюджета, BYN</label><input id="tri-v23612-budget-amount" class="form-input" type="number" min="0" step="0.01" value="'+Number(d.budget_amount||0).toFixed(2)+'"></div><div><label class="form-label">Комментарий</label><input id="tri-v23612-budget-comment" class="form-input" value="'+esc(d.budget_comment||'')+'"></div><button class="btn-primary" type="button" data-v23612-save-budget>Сохранить бюджет</button></div>':'');
}

function priceRange(d){
  const total=Number(d.total_filtered||0),off=Number(d.offset||0),n=(d.items||[]).length;
  return total?(off+1)+'–'+(off+n)+' из '+total:'0 из 0';
}
async function renderPrice(opts={}){
  priceState={...priceState,...opts};
  const d=await rpc('triovist_price_search_v23612',{p_query:priceState.q||'',p_only_suspect:!!priceState.only,p_offset:Number(priceState.offset||0),p_limit:Number(priceState.limit||50)});
  priceState.last=d;priceState.offset=Number(d.offset||0);priceState.limit=Number(d.limit||priceState.limit);const rows=d.items||[];
  const prev=priceState.offset>0,next=priceState.offset+rows.length<Number(d.total_filtered||0);
  panel.innerHTML='<div class="tri-v23612-section"><div><h3>🧮 Расчёт цены Triovist</h3><div class="tri-v23612-note">Источник: 1С «Мелкий опт 2 с НДС». Скидка Triovist — 5%. Все '+Number(d.total_all||0)+' SKU доступны.</div></div></div>'
    +'<div class="tri-v23612-search"><input id="tri-v23612-price-q" class="form-input" placeholder="Введите артикул или название товара" value="'+esc(priceState.q||'')+'"><button type="button" class="btn-primary" data-v23612-price-search>Найти</button></div>'
    +'<div class="tri-v23612-price-tools"><button type="button" class="tri-v23612-filter '+(priceState.only?'active':'')+'" data-v23612-only>⚠ Только сильные отклонения ('+Number(d.suspect_count||0)+')</button><span class="tri-v23612-note">Показывать:</span><select class="tri-v23612-select" data-v23612-limit><option value="50" '+(priceState.limit===50?'selected':'')+'>50</option><option value="100" '+(priceState.limit===100?'selected':'')+'>100</option><option value="500" '+(priceState.limit>=500?'selected':'')+'>Все</option></select><button class="tri-v23612-pagebtn" data-v23612-prev '+(!prev?'disabled':'')+'>← Назад</button><span class="tri-v23612-note"><b>'+priceRange(d)+'</b></span><button class="tri-v23612-pagebtn" data-v23612-next '+(!next?'disabled':'')+'>Вперёд →</button></div>'
    +(Number(d.suspect_count||0)?'<div class="tri-v23612-warn">⚠ Во всём прайсе найдено <b>'+Number(d.suspect_count)+'</b> цен 21vek, которые резко отличаются от истории или находятся существенно ниже закупочной цены Triovist. Используй фильтр выше.</div>':'')
    +'<div class="tri-v23612-note">'+(d.import?'Прайс: '+esc(d.import.source_file||'')+' · '+Number(d.import.row_count||0)+' SKU':'Прайс ещё не импортирован')+'</div>'
    +'<div style="overflow:auto"><table class="tri-v23612-table"><thead><tr><th>Артикул</th><th>Товар</th><th>Мелкий опт 2 с НДС</th><th>Triovist −5%</th><th>Цена 21vek</th></tr></thead><tbody>'+rows.map(r=>'<tr data-v23612-sku="'+esc(r.sku)+'"><td><b>'+esc(r.sku)+'</b></td><td>'+esc(r.product)+'</td><td><b>'+money(r.list_price)+'</b></td><td>'+money(r.triovist_price)+'</td><td class="'+(r.price_21vek_suspect?'tri-v23612-suspect':'')+'">'+(r.price_21vek==null?'—':(r.price_21vek_suspect?'⚠ ':'')+money(r.price_21vek))+(r.price_21vek_suspect&&r.price_21vek_previous!=null?'<div class="tri-v23612-smallbad">ранее '+money(r.price_21vek_previous)+'</div>':'')+'</td></tr>').join('')+'</tbody></table></div><div id="tri-v23612-price-detail"></div>';
}
async function renderPriceDetail(sku){
  const root=document.getElementById('tri-v23612-price-detail');if(!root)return;
  const d=await rpc('triovist_price_search_v23612',{p_query:sku,p_only_suspect:false,p_offset:0,p_limit:20}),r=(d.items||[]).find(x=>String(x.sku)===String(sku));if(!r)return;
  let priv='';
  if(ctx?.is_leader){
    const p=await rpc('triovist_price_calc_private',{p_sku:sku,p_point_zero:null});const has=Number(p.point_zero||0)>0,diff=Number(p.difference_to_required||0),status=!has?'Точка 0 не сохранена':diff>=0?'🟢 Цена безопасна':'🔴 Цена ниже допустимой';
    priv='<div class="tri-v23612-private"><b>🔒 Закрытая экономика — только руководитель</b><div class="tri-v23612-private-grid"><div class="tri-v23612-private-cell"><span>Точка 0</span><b>'+(has?money(p.point_zero):'—')+'</b></div><div class="tri-v23612-private-cell"><span>Минимальная отпускная</span><b>'+(p.required_list_price==null?'—':money(p.required_list_price))+'</b></div><div class="tri-v23612-private-cell"><span>Фактическая отпускная</span><b>'+money(p.list_price)+'</b></div><div class="tri-v23612-private-cell"><span>Отклонение</span><b class="'+(has?(diff>=0?'tri-v23612-good':'tri-v23612-bad'):'')+'">'+(!has?'—':(diff>=0?'+':'−')+money(Math.abs(diff)))+'</b></div></div><div style="margin-top:9px;font-weight:800" class="'+(has?(diff>=0?'tri-v23612-good':'tri-v23612-bad'):'')+'">'+status+'</div><div class="tri-v23612-form" style="grid-template-columns:200px auto minmax(240px,1fr)"><div><label class="form-label">Точка 0, BYN</label><input id="tri-v23612-point-zero" class="form-input" type="number" min="0" step="0.01" value="'+(has?Number(p.point_zero).toFixed(2):'')+'"></div><button type="button" class="btn-secondary" data-v23612-save-zero="'+esc(sku)+'">💾 Сохранить точку 0</button><div class="tri-v23612-note">Обязательства: 9,5%; скидка Triovist: 5%.</div></div></div>';
  }
  root.innerHTML='<div style="border:1px solid #E5E7EB;border-radius:12px;padding:13px;margin-top:12px"><div style="font-size:16px;font-weight:800">'+esc(r.sku)+' · '+esc(r.product)+'</div><div class="tri-v23612-kpis"><div class="tri-v23612-kpi"><span>Мелкий опт 2 с НДС</span><b>'+money(r.list_price)+'</b></div><div class="tri-v23612-kpi"><span>Скидка Triovist</span><b>5%</b></div><div class="tri-v23612-kpi"><span>Цена Triovist</span><b>'+money(r.triovist_price)+'</b></div><div class="tri-v23612-kpi"><span>21vek</span><b>'+(r.price_21vek==null?'—':money(r.price_21vek))+'</b></div></div></div>'+priv;
  root.scrollIntoView({block:'nearest',behavior:'smooth'});
}

async function showCommercial(k){
  concealForCommercial();setActive(k);panel.innerHTML='<div class="tri-v23612-note">Загрузка…</div>';
  try{if(k==='anp'||k==='si')await renderExpense(k,ym());else if(k==='budget')await renderBudget(ym());else{priceState={q:'',only:false,offset:0,limit:50,last:null};await renderPrice();}}
  catch(e){panel.innerHTML='<div class="tri-v23612-warn"><b>Не удалось открыть раздел.</b><br>'+esc(e?.message||e)+'</div>';}
}
async function activate(k,saveIt){if(['anp','si','budget','price'].includes(k))await showCommercial(k);else showWork(k);if(saveIt)try{localStorage.setItem(STORE+'|'+(ctx?.email||''),k);}catch(_){}}

async function saveExpense(kind){const d=document.getElementById('tri-v23612-exp-date')?.value,a=Number(document.getElementById('tri-v23612-exp-amount')?.value),c=document.getElementById('tri-v23612-exp-comment')?.value||'';if(!d||!(a>=0))throw new Error('Укажите дату и сумму');await rpc('triovist_commercial_save_expense',{p_id:null,p_type:kind,p_expense_date:d,p_amount:a,p_comment:c});await renderExpense(kind,document.querySelector('[data-v23612-month="'+kind+'"]')?.value||ym());}
async function attachDoc(id,input){const f=input.files?.[0];if(!f)return;if(f.size>25*1024*1024)throw new Error('Файл больше 25 МБ');const safe=String(f.name||'document').replace(/[^a-zA-Zа-яА-Я0-9._-]+/g,'_').slice(-120),path=id+'/'+Date.now()+'-'+safe,d=dbx();const up=await d.storage.from('triovist-expense-docs').upload(path,f,{upsert:false,contentType:f.type||'application/octet-stream'});if(up.error)throw up.error;await rpc('triovist_commercial_attach_document',{p_expense_id:id,p_storage_path:path,p_file_name:f.name||safe,p_mime_type:f.type||null,p_size_bytes:f.size});await renderExpense(active,document.querySelector('[data-v23612-month="'+active+'"]')?.value||ym());}
async function openDoc(path){const {data,error}=await dbx().storage.from('triovist-expense-docs').createSignedUrl(path,900);if(error)throw error;if(!data?.signedUrl)throw new Error('Ссылка не создана');window.open(data.signedUrl,'_blank','noopener');}
async function saveBudget(){const a=Number(document.getElementById('tri-v23612-budget-amount')?.value),c=document.getElementById('tri-v23612-budget-comment')?.value||'',m=document.querySelector('[data-v23612-month="budget"]')?.value||ym();if(!(a>=0))throw new Error('Проверьте сумму');await rpc('triovist_commercial_set_budget',{p_month:first(m),p_amount:a,p_comment:c});await renderBudget(m);}
async function saveZero(sku){const z=Number(document.getElementById('tri-v23612-point-zero')?.value);if(!(z>0))throw new Error('Укажите Точку 0 больше нуля');await rpc('triovist_price_set_point_zero',{p_sku:sku,p_point_zero:z});await renderPriceDetail(sku);}

function bindPanel(){
  if(!panel||panel.dataset.bound23612)return;panel.dataset.bound23612='1';
  panel.addEventListener('change',async e=>{try{
    const m=e.target.closest('[data-v23612-month]');if(m){if(m.dataset.v23612Month==='budget')await renderBudget(m.value);else await renderExpense(m.dataset.v23612Month,m.value);return;}
    const a=e.target.closest('[data-v23612-attach]');if(a){await attachDoc(a.dataset.v23612Attach,a);a.value='';return;}
    const lim=e.target.closest('[data-v23612-limit]');if(lim){priceState.limit=Number(lim.value);priceState.offset=0;await renderPrice();return;}
  }catch(err){alert(err.message||err);}});
  panel.addEventListener('click',async e=>{try{
    const s=e.target.closest('[data-v23612-save-exp]');if(s){await saveExpense(s.dataset.v23612SaveExp);return;}
    const d=e.target.closest('[data-v23612-doc]');if(d){await openDoc(d.dataset.v23612Doc);return;}
    if(e.target.closest('[data-v23612-save-budget]')){await saveBudget();return;}
    if(e.target.closest('[data-v23612-price-search]')){priceState.q=document.getElementById('tri-v23612-price-q')?.value||'';priceState.offset=0;await renderPrice();return;}
    if(e.target.closest('[data-v23612-only]')){priceState.only=!priceState.only;priceState.offset=0;await renderPrice();return;}
    if(e.target.closest('[data-v23612-prev]')){priceState.offset=Math.max(0,priceState.offset-priceState.limit);await renderPrice();return;}
    if(e.target.closest('[data-v23612-next]')){priceState.offset=priceState.offset+priceState.limit;await renderPrice();return;}
    const r=e.target.closest('[data-v23612-sku]');if(r){await renderPriceDetail(r.dataset.v23612Sku);return;}
    const z=e.target.closest('[data-v23612-save-zero]');if(z){await saveZero(z.dataset.v23612SaveZero);return;}
  }catch(err){alert(err.message||err);}});
  panel.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='tri-v23612-price-q'){e.preventDefault();priceState.q=e.target.value||'';priceState.offset=0;renderPrice().catch(err=>alert(err.message||err));}});
}

async function ensure(){
  if(busy)return false;busy=true;
  try{
    injectCss();
    if(!ctx){ctx=await loadContext();if(!ctx)return false;}
    if(!locate())return false;
    ensureShell();ensurePanel();hideLegacy();
    return true;
  }finally{busy=false;}
}
async function refreshAfterMutation(){
  const oldInsert=insertBefore,oldShell=shell;
  if(!await ensure())return;
  if(!oldShell?.isConnected){shell=null;panel=null;ensureShell();ensurePanel();}
  hideLegacy();
  if(oldInsert!==insertBefore&&shell?.isConnected&&shell.nextElementSibling!==panel){}
  if(ctx?.is_manager&&!legacyHost&&['home','sales','stock','tasks','motivation','cards'].includes(active))showManagerWork(active);
}
async function start(){
  if(!await ensure())return false;
  setTimeout(()=>activate(saved(),false),120);
  if(!observer){
    let t=null;observer=new MutationObserver(()=>{clearTimeout(t);t=setTimeout(refreshAfterMutation,100);});
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }
  window.RESANTA_TRIOVIST_SINGLE_V23612=Object.freeze({version:V,rootManagerAnchorFix:true,serverIdentityWithFallback:true,managerSectionsById:true,fullPricePaging:true,priceAllMode:true,anomalyFilter:true,budgetExVat:true});
  console.info('RESANTA Triovist '+V+' installed',ctx);
  return true;
}
let tries=0;const timer=setInterval(async()=>{tries++;if(await start()||tries>240)clearInterval(timer);},250);
})();