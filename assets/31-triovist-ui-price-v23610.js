/* RESANTA CRM v23.6.10 · TRIOVIST UI + PRICE SAFETY
 * - manager workspace is split into two clear single-line groups;
 * - budget norm is shown as 1.5% from sales excluding VAT 20%;
 * - suspicious 21vek prices are flagged against history;
 * - leaders can persist Point Zero per SKU and see minimum safe list price/status.
 * Existing v23.6.9 remains the functional source; this module only improves UI/control.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_UI_PRICE_V23610)return;
const V='v23.6.10';
const LEADERS=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
let observer=null,priceTimer=null,privateBusy=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>(Number(v)||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
function profile(){
  try{if(typeof currentProfile!=='undefined'&&currentProfile)return currentProfile;}catch(_){}
  try{if(typeof currentUser!=='undefined'&&currentUser)return currentUser;}catch(_){}
  try{return window.currentProfile||window.currentUser||{};}catch(_){return{};}
}
function email(){return String(profile()?.email||'').trim().toLowerCase();}
function isLeader(){return String(profile()?.role||'').toLowerCase()==='boss'&&LEADERS.has(email());}
function isTriManager(){const p=profile();return String(p?.role||'').toLowerCase()==='manager'&&String(p?.access_scope||'').toLowerCase()==='triovist';}
function dbx(){try{return typeof db!=='undefined'?db:window.db;}catch(_){return window.db;}}
async function rpc(name,args){const d=dbx();if(!d)throw new Error('Соединение с базой ещё не готово');const {data,error}=await d.rpc(name,args||{});if(error)throw error;return data;}
function injectCss(){
  if(document.getElementById('tri-v23610-style'))return;
  const s=document.createElement('style');s.id='tri-v23610-style';s.textContent=`
#tri-v2369-shell{padding:9px 11px!important}
#tri-v2369-shell .tri-v2369-head{margin-bottom:7px!important}
#tri-v2369-shell .tri-v2369-nav{display:block!important}
.tri-v23610-group{border-radius:10px;padding:7px 8px;margin-top:6px;min-width:0}
.tri-v23610-group-main{background:#F8FAFC;border:1px solid #E5E7EB}
.tri-v23610-group-commerce{background:#F5F3FF;border:1px solid #DDD6FE}
.tri-v23610-group-head{display:flex;align-items:center;gap:7px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#64748B;margin:0 0 6px 2px}
.tri-v23610-row{display:flex;align-items:center;gap:6px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin;padding-bottom:1px}
.tri-v23610-row button{flex:0 0 auto!important;padding:7px 10px!important;font-size:11px!important}
.tri-v23610-group-commerce .tri-v2369-nav button.active,.tri-v23610-group-commerce button.active{background:#EDE9FE!important;border-color:#A78BFA!important;color:#5B21B6!important}
.tri-v23610-suspect{background:#FEF2F2!important}
.tri-v23610-suspect strong{color:#B91C1C}
.tri-v23610-suspect-note{font-size:10px;color:#B91C1C;margin-top:3px;line-height:1.3}
.tri-v23610-alert{margin:10px 0;padding:10px 12px;border-radius:10px;background:#FFF7ED;border:1px solid #FDBA74;color:#9A3412;font-size:12px;font-weight:700}
.tri-v23610-status{margin-top:10px;border-radius:10px;padding:11px 12px;border:1px solid #E5E7EB;background:#fff}
.tri-v23610-status-grid{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr));gap:8px}
.tri-v23610-status-cell{background:#F8FAFC;border-radius:8px;padding:9px}.tri-v23610-status-cell span{display:block;font-size:9px;color:#64748B;text-transform:uppercase;font-weight:800}.tri-v23610-status-cell b{display:block;margin-top:3px;font-size:15px}
.tri-v23610-ok{color:#166534}.tri-v23610-bad{color:#B91C1C}.tri-v23610-warn{color:#B45309}
@media(max-width:700px){#tri-v2369-shell{position:sticky;top:56px}.tri-v23610-group{padding:6px}.tri-v23610-row button{font-size:10.5px!important;padding:7px 9px!important}.tri-v23610-status-grid{grid-template-columns:repeat(2,1fr)}}
`;
  document.head.appendChild(s);
}
function groupManagerMenu(){
  if(!isTriManager())return;
  const shell=document.getElementById('tri-v2369-shell'),nav=shell?.querySelector('.tri-v2369-nav');if(!shell||!nav||nav.dataset.v23610Grouped)return;
  const get=k=>nav.querySelector('[data-tri-v2369="'+k+'"]');
  const mainKeys=['home','sales','stock','tasks','motivation','cards'];
  const commerceKeys=['anp','si','budget','price'];
  const make=(title,cls,keys)=>{const box=document.createElement('div');box.className='tri-v23610-group '+cls;const h=document.createElement('div');h.className='tri-v23610-group-head';h.textContent=title;const row=document.createElement('div');row.className='tri-v23610-row';keys.forEach(k=>{const b=get(k);if(b)row.appendChild(b);});box.append(h,row);return box;};
  const frag=document.createDocumentFragment();frag.append(make('Работа','tri-v23610-group-main',mainKeys),make('Коммерция','tri-v23610-group-commerce',commerceKeys));
  nav.innerHTML='';nav.appendChild(frag);nav.dataset.v23610Grouped='1';
  const title=shell.querySelector('.tri-v2369-title');if(title&&title.textContent!=='Triovist · рабочее меню')title.textContent='Triovist · рабочее меню';
}
function parseMoney(s){let x=String(s||'').replace(/[\s\u00a0]/g,'').replace(/BYN/gi,'').replace(',','.').replace(/[^0-9.-]/g,'');return Number(x)||0;}
function decorateBudget(){
  const p=document.getElementById('tri-v2369-panel');if(!p||!/^💼?\s*Бюджет Triovist/i.test(String(p.querySelector('h3')?.textContent||'')))return;
  const cards=[...p.querySelectorAll('.tri-v2369-kpi')];
  const sales=cards.find(c=>/Продажи месяца/i.test(c.querySelector('span')?.textContent||''));
  if(sales){const lab=sales.querySelector('span');if(lab&&lab.textContent!=='Продажи месяца с НДС')lab.textContent='Продажи месяца с НДС';const b=sales.querySelector('b');const gross=parseMoney(b?.textContent);let n=sales.querySelector('.tri-v23610-exvat');if(!n){n=document.createElement('div');n.className='tri-v2369-note tri-v23610-exvat';sales.appendChild(n);}const txt='Без НДС 20%: '+money(gross/1.20);if(n.textContent!==txt)n.textContent=txt;}
  const norm=cards.find(c=>/Расчётный норматив/i.test(c.querySelector('span')?.textContent||''));
  if(norm){let n=norm.querySelector('.tri-v2369-note');if(!n){n=document.createElement('div');n.className='tri-v2369-note';norm.appendChild(n);}const txt='1,5% от продаж без НДС 20%';if(n.textContent!==txt)n.textContent=txt;}
}
async function decoratePriceList(){
  const p=document.getElementById('tri-v2369-panel');if(!p||!/Расчёт цены Triovist/i.test(String(p.querySelector('h3')?.textContent||'')))return;
  const rows=[...p.querySelectorAll('tr[data-price-sku]')];if(!rows.length)return;
  const q=document.getElementById('tri-v2369-price-q')?.value||'';
  try{
    const data=await rpc('triovist_price_search',{p_query:q,p_limit:q?40:15}),map=new Map((data?.items||[]).map(x=>[String(x.sku),x]));let bad=0;
    rows.forEach(row=>{const x=map.get(String(row.dataset.priceSku));if(!x)return;const td=row.querySelector('td:last-child');if(!td)return;const sig=[x.price_21vek,x.price_21vek_previous,x.price_21vek_suspect].join('|');if(x.price_21vek_suspect)bad++;if(td.dataset.v23610Sig===sig)return;td.dataset.v23610Sig=sig;if(x.price_21vek_suspect){td.classList.add('tri-v23610-suspect');td.innerHTML='<strong>⚠ '+money(x.price_21vek)+'</strong><div class="tri-v23610-suspect-note">Требует проверки'+(x.price_21vek_previous!=null?' · ранее '+money(x.price_21vek_previous):'')+'</div>';}else{td.classList.remove('tri-v23610-suspect');td.innerHTML=x.price_21vek==null?'—':money(x.price_21vek);}});
    let a=p.querySelector('#tri-v23610-price-alert');
    if(bad){if(!a){a=document.createElement('div');a.id='tri-v23610-price-alert';a.className='tri-v23610-alert';const search=p.querySelector('.tri-v2369-search');search?.insertAdjacentElement('afterend',a);}const msg='⚠ '+bad+' цен 21vek резко отличаются от истории или ниже закупочной цены Triovist. Они помечены и требуют проверки источника.';if(a.textContent!==msg)a.textContent=msg;}else a?.remove();
  }catch(e){console.warn('Triovist '+V+' price decoration:',e);}
}
function selectedSku(){const h=document.querySelector('#tri-v2369-price-selected > div:first-child > div:first-child');const t=String(h?.textContent||'').trim();return t.includes(' · ')?t.split(' · ')[0].trim():'';}
function renderPrivateStatus(priv){
  const root=document.getElementById('tri-v2369-price-selected'),block=root?.querySelector('.tri-v2369-private');if(!block||!priv)return;
  const input=block.querySelector('#tri-v2369-point-zero');if(input&&priv.point_zero!=null)input.value=Number(priv.point_zero).toFixed(2);
  const btn=block.querySelector('[data-v2369-private]');if(btn&&btn.textContent!=='💾 Сохранить точку 0')btn.textContent='💾 Сохранить точку 0';
  let status=block.querySelector('#tri-v23610-price-status');if(!status){status=document.createElement('div');status.id='tri-v23610-price-status';status.className='tri-v23610-status';block.appendChild(status);}
  const has=priv.point_zero!=null&&Number(priv.point_zero)>0,diff=Number(priv.difference_to_required||0),cls=!has?'tri-v23610-warn':diff>=0?'tri-v23610-ok':'tri-v23610-bad',label=!has?'Точка 0 не сохранена':diff>=0?'🟢 Цена безопасна':'🔴 Цена ниже допустимой';
  status.innerHTML='<div class="tri-v23610-status-grid"><div class="tri-v23610-status-cell"><span>Точка 0</span><b>'+(!has?'—':money(priv.point_zero))+'</b></div><div class="tri-v23610-status-cell"><span>Минимальная отпускная</span><b>'+(priv.required_list_price==null?'—':money(priv.required_list_price))+'</b></div><div class="tri-v23610-status-cell"><span>Фактическая отпускная</span><b>'+money(priv.list_price)+'</b></div><div class="tri-v23610-status-cell"><span>Отклонение</span><b class="'+cls+'">'+(!has?'—':(diff>=0?'+':'−')+money(Math.abs(diff)))+'</b></div></div><div class="'+cls+'" style="font-weight:800;margin-top:9px">'+label+'</div>';
  const old=block.querySelector('#tri-v2369-private-result');if(old&&has){const txt='<b>Минимальная отпускная: '+money(priv.required_list_price)+'</b>';if(old.innerHTML!==txt)old.innerHTML=txt;}
}
async function decoratePrivate(){
  if(!isLeader()||privateBusy)return;
  const p=document.getElementById('tri-v2369-panel');if(!p||!/Расчёт цены Triovist/i.test(String(p.querySelector('h3')?.textContent||'')))return;
  const sku=selectedSku(),block=document.querySelector('#tri-v2369-price-selected .tri-v2369-private');if(!sku||!block)return;
  if(block.querySelector('#tri-v23610-price-status'))return;
  privateBusy=true;try{const priv=await rpc('triovist_price_calc_private',{p_sku:sku,p_point_zero:null});renderPrivateStatus(priv);}catch(e){console.warn('Triovist '+V+' private:',e);}finally{privateBusy=false;}
}
async function savePointZero(){
  const sku=selectedSku(),input=document.getElementById('tri-v2369-point-zero');if(!sku||!input)throw new Error('Сначала выберите товар');const point=Number(input.value);if(!(point>0))throw new Error('Укажите Точку 0 больше нуля');
  await rpc('triovist_price_set_point_zero',{p_sku:sku,p_point_zero:point});const priv=await rpc('triovist_price_calc_private',{p_sku:sku,p_point_zero:null});renderPrivateStatus(priv);
}
function refresh(){injectCss();groupManagerMenu();decorateBudget();clearTimeout(priceTimer);priceTimer=setTimeout(()=>{decoratePriceList();decoratePrivate();},120);}
function bind(){
  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('[data-v2369-private]');if(btn&&isLeader()){
      e.preventDefault();e.stopImmediatePropagation();savePointZero().catch(err=>alert(err.message||err));return;
    }
    if(e.target.closest?.('tr[data-price-sku]'))setTimeout(()=>{const s=document.querySelector('#tri-v23610-price-status');s?.remove();decoratePrivate();},180);
  },true);
}
function start(){
  injectCss();bind();refresh();
  observer=new MutationObserver(()=>refresh());observer.observe(document.documentElement,{childList:true,subtree:true});
  window.RESANTA_TRIOVIST_UI_PRICE_V23610=Object.freeze({version:V,managerMenuGrouped:true,budgetVatExcluded:true,pointZeroPersistent:true,price21vekAnomalyFlag:true,repeatRenderGuard:true});
  console.info('RESANTA Triovist '+V+' UI installed');return true;
}
start();
})();
