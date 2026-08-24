/* RESANTA CRM v23.6.9 · TRIOVIST ACCESS + STABLE WORKSPACE
 * One source of truth for Triovist commercial UI.
 * - both Triovist managers see ANP / SI / Budget / Price;
 * - Krishtal + leaders may write ANP/SI; Aleksandrenko is read-only;
 * - Budget is visible to both managers; only leaders may edit;
 * - private pricing economics remains leader-only (server-side RPC);
 * - legacy Shipments 1C / Novelties tabs are hidden from UI, data stays intact;
 * - profile detection works with lexical currentProfile/currentUser, not only window.*.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_ACCESS_V2369)return;
const V='v23.6.9';
const KRISHTAL='krishtal_na@resanta.ru';
const LEADERS=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
const STORE='resanta_triovist_workspace_v2369';
let page=null,legacyHost=null,topBlock=null,shell=null,panel=null,observer=null,hidden=new Map(),active='',monthData=null,priceData=null,selectedPrice=null,installBusy=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>(Number(v)||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const pct=v=>(Number(v)||0).toLocaleString('ru-RU',{minimumFractionDigits:0,maximumFractionDigits:2})+'%';
const ym=()=>String((typeof TODAY!=='undefined'&&TODAY)||new Date().toISOString().slice(0,10)).slice(0,7);
const first=m=>String(m||ym()).slice(0,7)+'-01';
function profile(){
  try{if(typeof currentProfile!=='undefined'&&currentProfile)return currentProfile;}catch(_){}
  try{if(typeof currentUser!=='undefined'&&currentUser)return currentUser;}catch(_){}
  try{return window.currentProfile||window.currentUser||{};}catch(_){return{};}
}
function syncProfile(){const p=profile();try{if(p&&Object.keys(p).length)window.currentProfile=p;}catch(_){}return p;}
function email(){return String(profile()?.email||'').trim().toLowerCase();}
function isLeader(){const p=profile();return String(p?.role||'').toLowerCase()==='boss'&&LEADERS.has(email());}
function isTriManager(){const p=profile();return String(p?.role||'').toLowerCase()==='manager'&&String(p?.access_scope||'').toLowerCase()==='triovist';}
function isTriUser(){return isLeader()||isTriManager();}
function dbx(){try{return typeof db!=='undefined'?db:window.db;}catch(_){return window.db;}}
async function rpc(name,args){const d=dbx();if(!d)throw new Error('Соединение с базой ещё не готово');const {data,error}=await d.rpc(name,args||{});if(error)throw error;return data;}
function text(el){return String(el?.textContent||'').replace(/\s+/g,' ').trim();}
function activePage(){return !!page?.classList.contains('active');}
function injectCss(){
  if(document.getElementById('tri-v2369-style'))return;
  const s=document.createElement('style');s.id='tri-v2369-style';s.textContent=`
#tri-v2369-shell{position:sticky;top:60px;z-index:70;background:rgba(249,250,251,.97);backdrop-filter:blur(8px);border:1px solid #DCE6F2;border-radius:14px;padding:10px 12px;margin:0 0 14px;box-shadow:0 5px 18px rgba(15,23,42,.06)}
.tri-v2369-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px}.tri-v2369-title{font-size:12px;font-weight:800;color:#0C447C}.tri-v2369-who{font-size:11px;color:var(--sub,#6B7280)}
.tri-v2369-nav{display:flex;gap:7px;flex-wrap:wrap}.tri-v2369-nav button,.tri-v2369-tab{border:1px solid #D8E0EA;background:#fff;color:#334155;border-radius:9px;padding:8px 11px;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}.tri-v2369-nav button.active,.tri-v2369-tab.active{background:#E6F1FB;border-color:#60A5FA;color:#0C447C}
#tri-v2369-panel{background:#fff;border:1px solid var(--border,#E5E7EB);border-radius:14px;padding:16px;margin:0 0 16px}.tri-v2369-section-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap}.tri-v2369-section-head h3{margin:0;font-size:18px}.tri-v2369-note{font-size:11px;color:var(--sub,#6B7280);line-height:1.5}.tri-v2369-info{padding:10px 12px;border:1px solid #BFDBFE;background:#EFF6FF;color:#1E3A8A;border-radius:10px;font-size:12px;line-height:1.5;margin:10px 0}
.tri-v2369-kpis{display:grid;grid-template-columns:repeat(4,minmax(145px,1fr));gap:10px;margin:13px 0}.tri-v2369-kpi{background:#F8FAFC;border-radius:10px;padding:12px}.tri-v2369-kpi span{display:block;font-size:10px;color:#6B7280;text-transform:uppercase;font-weight:700}.tri-v2369-kpi b{display:block;font-size:19px;margin-top:4px}.tri-v2369-form{display:grid;grid-template-columns:160px 180px minmax(230px,1fr) auto;gap:9px;align-items:end;margin:12px 0}.tri-v2369-search{display:grid;grid-template-columns:minmax(240px,1fr) auto;gap:8px;margin:12px 0}.tri-v2369-table{width:100%;border-collapse:collapse;font-size:12px}.tri-v2369-table th{text-align:left;background:#F8FAFC;color:#6B7280;padding:9px;border-bottom:1px solid #E5E7EB;white-space:nowrap}.tri-v2369-table td{padding:9px;border-bottom:1px solid #E5E7EB;vertical-align:top}.tri-v2369-table tr[data-price-sku]{cursor:pointer}.tri-v2369-table tr[data-price-sku]:hover{background:#F8FAFC}.tri-v2369-doc{display:inline-flex;align-items:center;gap:5px;padding:6px 9px;margin:2px 4px 2px 0;font-size:11px}.tri-v2369-private{border:1px solid #C4B5FD;background:#F5F3FF;border-radius:12px;padding:13px;margin-top:12px}.tri-v2369-components{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:8px;margin-top:9px}.tri-v2369-component{background:#fff;border:1px solid #DDD6FE;border-radius:9px;padding:9px}.tri-v2369-component span{font-size:10px;color:#6D28D9}.tri-v2369-component b{display:block;margin-top:3px}.tri-v2369-good{color:#166534;font-weight:800}.tri-v2369-bad{color:#B91C1C;font-weight:800}
#tri-manager-shell-v2367,#tri-manager-budget-v2367,#tri-commercial-panel-v2366{display:none!important}.tri-v2366-btn{display:none!important}
@media(max-width:900px){.tri-v2369-kpis,.tri-v2369-components{grid-template-columns:repeat(2,1fr)}.tri-v2369-form{grid-template-columns:1fr 1fr}.tri-v2369-form>div:nth-child(3){grid-column:1/-1}}
@media(max-width:620px){#tri-v2369-shell{top:56px;padding:9px}.tri-v2369-who{display:none}.tri-v2369-kpis,.tri-v2369-components,.tri-v2369-form,.tri-v2369-search{grid-template-columns:1fr}.tri-v2369-nav button{font-size:11px;padding:8px 9px}}
`;
  document.head.appendChild(s);
}
function locateHost(){
  page=document.getElementById('page-triovist');if(!page)return null;
  for(const b of page.querySelectorAll('button')){
    if(b.closest('#tri-v2369-shell'))continue;
    if(!/Сводка/i.test(text(b)))continue;
    const p=b.parentElement;if(!p)continue;
    const t=[...p.querySelectorAll(':scope > button')].map(text).join('|');
    if(/Продажи/i.test(t)&&/Остатки/i.test(t))return p;
  }
  return null;
}
function topChild(node){let x=node;while(x?.parentElement&&x.parentElement!==page)x=x.parentElement;return x;}
function hideLegacyTabs(){
  if(!page)return;
  page.querySelectorAll('button').forEach(b=>{
    if(b.closest('#tri-v2369-shell')||b.dataset.triV2369)return;
    const t=text(b);
    if(/Отгрузки\s*1С/i.test(t)||/Новинки/i.test(t))b.style.setProperty('display','none','important');
  });
}
function legacyButton(key){
  if(!page)return null;
  const rx={home:/Сводка/i,sales:/^.*Продажи\s*$/i,stock:/Остатки(?:\s+и\s+заказ)?/i,tasks:/Задачи\s*ИИ/i,motivation:/Мотивация/i,cards:/Карточки\s*21vek/i}[key];
  if(!rx)return null;
  return [...page.querySelectorAll('button')].find(b=>!b.closest('#tri-v2369-shell')&&!b.dataset.triV2369&&!b.dataset.triV2366&&rx.test(text(b)))||null;
}
function ensurePanel(){
  if(panel?.isConnected)return panel;
  panel=document.createElement('div');panel.id='tri-v2369-panel';panel.style.display='none';
  if(topBlock)topBlock.insertAdjacentElement('afterend',panel);else page?.appendChild(panel);
  return panel;
}
function restoreHidden(){for(const [el,val] of hidden){if(el?.isConnected)el.style.display=val;}hidden.clear();}
function concealForCommercial(){
  restoreHidden();ensurePanel();
  if(!page||!topBlock)return;
  const children=[...page.children],idx=children.indexOf(topBlock);
  for(let i=idx+1;i<children.length;i++){
    const el=children[i];if(el===panel)continue;
    hidden.set(el,el.style.display);el.style.display='none';
  }
  panel.style.display='block';
}
function setActive(key){
  active=key;
  page?.querySelectorAll('[data-tri-v2369]').forEach(b=>b.classList.toggle('active',b.dataset.triV2369===key));
  try{localStorage.setItem(STORE+'|'+email(),key);}catch(_){}
}
function saved(){try{const k=localStorage.getItem(STORE+'|'+email());return ['home','sales','stock','anp','si','budget','price','tasks','motivation','cards'].includes(k)?k:'home';}catch(_){return'home';}}
function managerShell(){
  if(!isTriManager())return;
  if(shell?.isConnected)return;
  shell=document.createElement('div');shell.id='tri-v2369-shell';
  const buttons=[['home','🏠 Главная'],['sales','💰 Продажи'],['stock','📦 Остатки'],['anp','🧾 АНП'],['si','🛠 Компенсация СИ'],['budget','💼 Бюджет'],['price','🧮 Расчёт цены'],['tasks','🤖 Задачи ИИ'],['motivation','🏆 Мотивация'],['cards','🧩 Карточки 21vek']];
  shell.innerHTML='<div class="tri-v2369-head"><div class="tri-v2369-title">Рабочее меню Triovist</div><div class="tri-v2369-who">'+esc(profile()?.name||'Менеджер')+'</div></div><div class="tri-v2369-nav">'+buttons.map(x=>'<button type="button" data-tri-v2369="'+x[0]+'">'+x[1]+'</button>').join('')+'</div>';
  shell.addEventListener('click',e=>{const b=e.target.closest('[data-tri-v2369]');if(b)activate(b.dataset.triV2369,true);});
  if(topBlock)page.insertBefore(shell,topBlock);else page.insertBefore(shell,page.children[1]||null);
  if(legacyHost)legacyHost.style.setProperty('display','none','important');
}
function leaderTabs(){
  if(!isLeader()||!legacyHost)return;
  const defs=[['anp','🧾 АНП'],['si','🛠 Компенсация СИ'],['budget','💼 Бюджет'],['price','🧮 Расчёт цены']];
  const before=[...legacyHost.querySelectorAll(':scope > button')].find(b=>/Карточки\s*21vek/i.test(text(b)))||null;
  defs.forEach(([k,label])=>{
    let b=legacyHost.querySelector('[data-tri-v2369="'+k+'"]');if(b)return;
    b=document.createElement('button');const sample=legacyHost.querySelector('button:not([style*="display: none"])');b.className=(sample?.className||'btn-secondary')+' tri-v2369-tab';b.type='button';b.dataset.triV2369=k;b.textContent=label;b.addEventListener('click',()=>activate(k,true));legacyHost.insertBefore(b,before);
  });
}
function monthPicker(key,m){return '<div style="min-width:170px"><label class="form-label">Месяц</label><input class="form-input" type="month" data-v2369-month="'+key+'" value="'+esc(String(m||ym()).slice(0,7))+'"></div>';}
async function getMonth(m){monthData=await rpc('triovist_commercial_get_month',{p_month:first(m)});return monthData;}
function docsHtml(row,write){
  const docs=(row.documents||[]).map(d=>'<button type="button" class="btn-secondary tri-v2369-doc" data-v2369-doc="'+esc(d.storage_path)+'">📎 '+esc(d.file_name)+'</button>').join('')||'<span class="tri-v2369-note">нет документа</span>';
  return docs+(write?'<label class="btn-secondary tri-v2369-doc" style="cursor:pointer">＋ документ<input type="file" hidden data-v2369-attach="'+esc(row.id)+'"></label>':'');
}
async function renderExpense(kind,m){
  const d=await getMonth(m||ym()),rows=(d.expenses||[]).filter(x=>x.expense_type===kind),total=rows.reduce((s,x)=>s+Number(x.amount||0),0),write=!!d.can_write_expenses;
  panel.innerHTML='<div class="tri-v2369-section-head"><div><h3>'+(kind==='anp'?'🧾 АНП':'🛠 Компенсация СИ')+'</h3><div class="tri-v2369-note">Фактические затраты Triovist по месяцам. '+(write?'Можно вносить расходы и прикладывать документы.':'Режим просмотра. Вносить и изменять расходы может Кришталь или руководитель.')+'</div></div>'+monthPicker(kind,d.month)+'</div>'
    +'<div class="tri-v2369-kpis"><div class="tri-v2369-kpi"><span>'+(kind==='anp'?'АНП':'СИ')+' за месяц</span><b>'+money(total)+'</b></div><div class="tri-v2369-kpi"><span>АНП + СИ факт</span><b>'+money(d.expenses_total)+'</b></div><div class="tri-v2369-kpi"><span>Документов</span><b>'+Number(d.documents_count||0)+'</b></div><div class="tri-v2369-kpi"><span>Доступ</span><b style="font-size:15px">'+(write?'Внесение':'Просмотр')+'</b></div></div>'
    +(write?'<div class="tri-v2369-form"><div><label class="form-label">Дата</label><input class="form-input" type="date" id="tri-v2369-exp-date" value="'+esc(String(d.month||first()).slice(0,7)+'-01')+'"></div><div><label class="form-label">Сумма, BYN</label><input class="form-input" type="number" min="0" step="0.01" id="tri-v2369-exp-amount" placeholder="0,00"></div><div><label class="form-label">Комментарий / основание</label><input class="form-input" id="tri-v2369-exp-comment" placeholder="Что компенсировали / на что АНП"></div><button class="btn-primary" type="button" data-v2369-save-exp="'+kind+'">Сохранить</button></div>':'<div class="tri-v2369-info">Александренко видит суммы, комментарии и документы, но не может менять записи.</div>')
    +'<div style="overflow:auto"><table class="tri-v2369-table"><thead><tr><th>Дата</th><th>Сумма</th><th>Комментарий</th><th>Кто внёс</th><th>Документы</th></tr></thead><tbody>'+(rows.length?rows.map(r=>'<tr><td><b>'+esc(r.expense_date)+'</b></td><td><b>'+money(r.amount)+'</b></td><td>'+esc(r.comment||'—')+'</td><td>'+esc(r.created_by||'—')+'</td><td>'+docsHtml(r,write)+'</td></tr>').join(''):'<tr><td colspan="5" class="tri-v2369-note">За выбранный месяц расходов ещё нет.</td></tr>')+'</tbody></table></div>';
}
async function renderBudget(m){
  const d=await getMonth(m||ym()),leader=!!d.is_leader,p=d.private_pricing||{};
  panel.innerHTML='<div class="tri-v2369-section-head"><div><h3>💼 Бюджет Triovist</h3><div class="tri-v2369-note">Менеджеры видят утверждённый бюджет и комментарий. Изменять сумму может только руководитель.</div></div>'+monthPicker('budget',d.month)+'</div>'
    +'<div class="tri-v2369-kpis"><div class="tri-v2369-kpi"><span>Бюджет месяца</span><b>'+money(d.budget_amount)+'</b></div><div class="tri-v2369-kpi"><span>Продажи месяца</span><b>'+money(d.sales_revenue)+'</b></div><div class="tri-v2369-kpi"><span>Статус</span><b style="font-size:15px">Утверждён</b></div>'+(leader?'<div class="tri-v2369-kpi"><span>Расчётный норматив</span><b>'+money(p.budget_norm)+'</b><div class="tri-v2369-note">'+pct(p.budget_pct)+' в цене</div></div>':'<div class="tri-v2369-kpi"><span>Режим</span><b style="font-size:15px">Просмотр</b></div>')+'</div>'
    +'<div class="tri-v2369-info"><b>Комментарий руководителя:</b><br>'+esc(d.budget_comment||'Комментарий пока не добавлен.')+'</div>'
    +(leader?'<div class="tri-v2369-form" style="grid-template-columns:190px minmax(250px,1fr) auto"><div><label class="form-label">Сумма бюджета, BYN</label><input class="form-input" id="tri-v2369-budget-amount" type="number" min="0" step="0.01" value="'+Number(d.budget_amount||0).toFixed(2)+'"></div><div><label class="form-label">Комментарий</label><input class="form-input" id="tri-v2369-budget-comment" value="'+esc(d.budget_comment||'')+'"></div><button type="button" class="btn-primary" data-v2369-save-budget>Сохранить бюджет</button></div>':'');
}
async function renderPrice(q){
  const data=await rpc('triovist_price_search',{p_query:q||'',p_limit:q?40:15});priceData=data||{};selectedPrice=null;
  panel.innerHTML='<div class="tri-v2369-section-head"><div><h3>🧮 Расчёт цены Triovist</h3><div class="tri-v2369-note">Источник: автоматический прайс 1С «Мелкий опт 2 с НДС». Скидка Triovist — 5%.</div></div></div><div class="tri-v2369-search"><input id="tri-v2369-price-q" class="form-input" placeholder="Введите артикул или название товара" value="'+esc(q||'')+'"><button type="button" class="btn-primary" data-v2369-price-search>Найти</button></div><div class="tri-v2369-note">'+(data?.import?'Прайс: '+esc(data.import.source_file||'')+' · '+Number(data.import.row_count||0)+' SKU':'Актуальный прайс ещё не импортирован.')+'</div><div id="tri-v2369-price-list"></div><div id="tri-v2369-price-selected"></div>';
  const rows=data.items||[],root=document.getElementById('tri-v2369-price-list');
  root.innerHTML=rows.length?'<div style="overflow:auto"><table class="tri-v2369-table"><thead><tr><th>Артикул</th><th>Товар</th><th>Мелкий опт 2 с НДС</th><th>Triovist −5%</th><th>Цена 21vek</th></tr></thead><tbody>'+rows.map(r=>'<tr data-price-sku="'+esc(r.sku)+'"><td><b>'+esc(r.sku)+'</b></td><td>'+esc(r.product)+'</td><td><b>'+money(r.list_price)+'</b></td><td>'+money(r.triovist_price)+'</td><td>'+(r.price_21vek==null?'—':money(r.price_21vek))+'</td></tr>').join('')+'</tbody></table></div>':'<div class="tri-v2369-info">Ничего не найдено.</div>';
  if(rows.length===1)selectPrice(rows[0].sku);
}
async function selectPrice(sku){
  selectedPrice=(priceData?.items||[]).find(x=>String(x.sku)===String(sku));if(!selectedPrice)return;
  paintSelected(null);
  if(isLeader()){
    try{const priv=await rpc('triovist_price_calc_private',{p_sku:selectedPrice.sku,p_point_zero:null});paintSelected(priv);}catch(e){console.warn('Private Triovist price:',e);}
  }
}
function paintSelected(priv){
  const r=selectedPrice,root=document.getElementById('tri-v2369-price-selected');if(!r||!root)return;
  let privateHtml='';
  if(isLeader())privateHtml='<div class="tri-v2369-private"><b>🔒 Закрытая экономика — только руководитель</b>'+(priv?'<div class="tri-v2369-components">'+(priv.components||[]).map(x=>'<div class="tri-v2369-component"><span>'+esc(x.label)+'</span><b>'+pct(x.pct)+'</b></div>').join('')+'</div><div class="tri-v2369-kpis"><div class="tri-v2369-kpi"><span>Всего обязательств</span><b>'+pct(priv.obligations_pct)+'</b></div><div class="tri-v2369-kpi"><span>Коэффициент Зрячева</span><b>'+Number(priv.zryachev_coeff||0).toFixed(6)+'</b></div><div class="tri-v2369-kpi"><span>Чистая цена</span><b>'+money(priv.net_after_obligations)+'</b></div><div class="tri-v2369-kpi"><span>С учётом −5%</span><b>'+Number(priv.total_coeff_with_discount||0).toFixed(6)+'</b></div></div>':'<div class="tri-v2369-note" style="margin-top:8px">Загружаю внутренний расчёт…</div>')+'<div class="tri-v2369-form" style="grid-template-columns:200px auto minmax(240px,1fr)"><div><label class="form-label">Точка 0, BYN</label><input id="tri-v2369-point-zero" class="form-input" type="number" min="0" step="0.01"></div><button type="button" class="btn-secondary" data-v2369-private>Рассчитать минимум</button><div id="tri-v2369-private-result">'+(priv?.required_list_price!=null?'<b>Минимальная отпускная: '+money(priv.required_list_price)+'</b>':'Введите точку 0')+'</div></div></div>';
  root.innerHTML='<div style="border:1px solid #E5E7EB;border-radius:12px;padding:13px;margin-top:12px"><div style="font-size:16px;font-weight:800">'+esc(r.sku)+' · '+esc(r.product)+'</div><div class="tri-v2369-kpis"><div class="tri-v2369-kpi"><span>Мелкий опт 2 с НДС</span><b>'+money(r.list_price)+'</b></div><div class="tri-v2369-kpi"><span>Скидка Triovist</span><b>5%</b></div><div class="tri-v2369-kpi"><span>Цена Triovist</span><b>'+money(r.triovist_price)+'</b></div><div class="tri-v2369-kpi"><span>Розница 21vek</span><b>'+(r.price_21vek==null?'—':money(r.price_21vek))+'</b></div></div></div>'+privateHtml;
}
async function calcPrivate(){
  if(!isLeader()||!selectedPrice)return;
  const z=document.getElementById('tri-v2369-point-zero'),point=z?.value?Number(z.value):null;
  const priv=await rpc('triovist_price_calc_private',{p_sku:selectedPrice.sku,p_point_zero:point});paintSelected(priv);
  if(point!=null){const n=document.getElementById('tri-v2369-point-zero');if(n)n.value=point;const rr=document.getElementById('tri-v2369-private-result');if(rr&&priv.required_list_price!=null){const diff=Number(priv.difference_to_required||0);rr.innerHTML='<b>Минимальная отпускная: '+money(priv.required_list_price)+'</b><div class="'+(diff>=0?'tri-v2369-good':'tri-v2369-bad')+'">Текущая цена '+(diff>=0?'выше на ':'ниже на ')+money(Math.abs(diff))+'</div>';}}
}
async function showCommercial(key){
  concealForCommercial();setActive(key);panel.innerHTML='<div class="tri-v2369-note">Загрузка…</div>';
  try{if(key==='anp'||key==='si')await renderExpense(key,ym());else if(key==='budget')await renderBudget(ym());else await renderPrice('');}catch(e){panel.innerHTML='<div class="tri-v2369-info"><b>Не удалось открыть раздел.</b><br>'+esc(e?.message||e)+'</div>';}
}
function showLegacy(key){
  restoreHidden();if(panel)panel.style.display='none';setActive(key);
  const b=legacyButton(key);if(b){try{b.click();}catch(_){}}
  if(activePage())window.scrollTo({top:0,behavior:'auto'});
}
async function activate(key,saveIt){
  if(!isTriUser())return;
  if(['anp','si','budget','price'].includes(key))await showCommercial(key);else showLegacy(key);
  if(saveIt)try{localStorage.setItem(STORE+'|'+email(),key);}catch(_){}
}
async function saveExpense(kind){
  const d=document.getElementById('tri-v2369-exp-date')?.value,a=Number(document.getElementById('tri-v2369-exp-amount')?.value),c=document.getElementById('tri-v2369-exp-comment')?.value||'';
  if(!d||!(a>=0))throw new Error('Укажите дату и сумму');
  await rpc('triovist_commercial_save_expense',{p_id:null,p_type:kind,p_expense_date:d,p_amount:a,p_comment:c});await renderExpense(kind,document.querySelector('[data-v2369-month="'+kind+'"]')?.value||ym());
}
async function attachDoc(id,input){
  const f=input.files?.[0];if(!f)return;if(f.size>25*1024*1024)throw new Error('Файл больше 25 МБ');
  const safe=String(f.name||'document').replace(/[^a-zA-Zа-яА-Я0-9._-]+/g,'_').slice(-120),path=id+'/'+Date.now()+'-'+safe,d=dbx();
  const up=await d.storage.from('triovist-expense-docs').upload(path,f,{upsert:false,contentType:f.type||'application/octet-stream'});if(up.error)throw up.error;
  await rpc('triovist_commercial_attach_document',{p_expense_id:id,p_storage_path:path,p_file_name:f.name||safe,p_mime_type:f.type||null,p_size_bytes:f.size});await renderExpense(active,document.querySelector('[data-v2369-month="'+active+'"]')?.value||ym());
}
async function openDoc(path){const {data,error}=await dbx().storage.from('triovist-expense-docs').createSignedUrl(path,900);if(error)throw error;if(!data?.signedUrl)throw new Error('Ссылка не создана');window.open(data.signedUrl,'_blank','noopener');}
async function saveBudget(){const a=Number(document.getElementById('tri-v2369-budget-amount')?.value),c=document.getElementById('tri-v2369-budget-comment')?.value||'',m=document.querySelector('[data-v2369-month="budget"]')?.value||ym();if(!(a>=0))throw new Error('Проверьте сумму');await rpc('triovist_commercial_set_budget',{p_month:first(m),p_amount:a,p_comment:c});await renderBudget(m);}
function bindPanel(){
  if(panel?.dataset.v2369Bound)return;panel.dataset.v2369Bound='1';
  panel.addEventListener('change',async e=>{
    try{const m=e.target.closest('[data-v2369-month]');if(m){const k=m.dataset.v2369Month;if(k==='budget')await renderBudget(m.value);else await renderExpense(k,m.value);return;}const a=e.target.closest('[data-v2369-attach]');if(a){await attachDoc(a.dataset.v2369Attach,a);a.value='';}}
    catch(err){alert(err.message||err);}
  });
  panel.addEventListener('click',async e=>{
    try{const save=e.target.closest('[data-v2369-save-exp]');if(save){await saveExpense(save.dataset.v2369SaveExp);return;}const doc=e.target.closest('[data-v2369-doc]');if(doc){await openDoc(doc.dataset.v2369Doc);return;}if(e.target.closest('[data-v2369-save-budget]')){await saveBudget();return;}if(e.target.closest('[data-v2369-price-search]')){await renderPrice(document.getElementById('tri-v2369-price-q')?.value||'');return;}const row=e.target.closest('[data-price-sku]');if(row){await selectPrice(row.dataset.priceSku);return;}if(e.target.closest('[data-v2369-private]')){await calcPrivate();}}
    catch(err){alert(err.message||err);}
  });
  panel.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='tri-v2369-price-q'){e.preventDefault();renderPrice(e.target.value||'').catch(err=>alert(err.message||err));}});
}
function ensureUi(){
  if(installBusy)return false;installBusy=true;
  try{
    syncProfile();if(!isTriUser())return false;
    injectCss();const h=locateHost();if(!h)return false;legacyHost=h;topBlock=topChild(h);hideLegacyTabs();
    ensurePanel();bindPanel();
    if(isTriManager()){managerShell();if(legacyHost)legacyHost.style.setProperty('display','none','important');}
    else leaderTabs();
    return true;
  }finally{installBusy=false;}
}
function start(){
  if(!ensureUi())return false;
  let once=false;setTimeout(()=>{if(!once){once=true;activate(saved(),false);}},180);
  if(!observer){let timer=null;observer=new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!document.getElementById('page-triovist'))return;const oldHost=legacyHost;ensureUi();hideLegacyTabs();if(isTriManager()&&legacyHost)legacyHost.style.setProperty('display','none','important');if(oldHost!==legacyHost&&active&&['anp','si','budget','price'].includes(active))activate(active,false);},80);});observer.observe(document.documentElement,{childList:true,subtree:true});}
  window.RESANTA_TRIOVIST_ACCESS_V2369=Object.freeze({version:V,managersCommercialAccess:true,aleksandrenkoExpensesReadOnly:true,krishtalExpensesWrite:true,budgetManagersReadOnly:true,priceManagers:true,privatePricingLeadersOnly:true,shipmentsAndNoveltiesHidden:true,stableProfileBinding:true});
  console.info('RESANTA Triovist '+V+' installed');return true;
}
if(!start()){let tries=0;const t=setInterval(()=>{tries++;if(start()||tries>120)clearInterval(t);},250);}
})();
