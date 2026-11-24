/* RESANTA CRM ABC 360 v1 · isolated read-only director dashboard */
(function(){
'use strict';
if(window.RESANTA_ABC360_V1)return;
const el=id=>document.getElementById(id), fmt=n=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(Number(n)||0);
const html=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const percent=n=>(Number(n)||0).toFixed(1).replace('.',',')+'%';
const colors={A:'#315cb6',B:'#6f8dc4',C:'#aab8cd',N:'#d4dfef'};
let seq=0,searchTimer=null,filterTimer=null,leraContext=null;
// The core rebuild helper sorts every price/stock timestamp on every SKU
// lookup. Memoize its *check*, not the SKU resolution, within an unchanged
// catalogue generation; invalidate on reference/length/signature changes.
function installCatalogGenerationGuard(){
 const original=window.abcBuildCatalogSkuMap;
 if(typeof original!=='function'||original.__abc360GenerationGuard)return;
 let price=null,stock=null,priceLen=-1,stockLen=-1,lastSig='',lastCheck=0;
 const wrapper=function(){
  const p=typeof allPrice!=='undefined'?(allPrice||[]):[];
  const w=typeof allStock!=='undefined'?(allStock||[]):[];
  const sig=typeof _abcCatalogSkuSig!=='undefined'?_abcCatalogSkuSig:'';
  const stable=price===p&&stock===w&&priceLen===p.length&&stockLen===w.length&&
    lastSig===sig&&!!sig&&Date.now()-lastCheck<30000;
  if(stable)return;
  const result=original.apply(this,arguments);
  price=p;stock=w;priceLen=p.length;stockLen=w.length;
  lastSig=typeof _abcCatalogSkuSig!=='undefined'?_abcCatalogSkuSig:'';
  lastCheck=Date.now();
  return result;
 };
 wrapper.__abc360GenerationGuard=true;
 window.abcBuildCatalogSkuMap=wrapper;
}
const styles=[
'#page-abc.abc360-on #abc-kpi{display:none}',
'#page-abc .abc360{display:grid;gap:12px;margin-bottom:15px}',
'#page-abc .abc360-sub{font-size:11px;color:var(--sub);line-height:1.5}',
'#page-abc .abc360-panel h3{font-size:14px;font-weight:800;margin:0 0 12px}',
'#page-abc .abc360-stack{display:flex;height:17px;overflow:hidden;border-radius:5px;background:var(--bg);margin:13px 0}',
'#page-abc .abc360-stack div{height:100%}',
'#page-abc .abc360-classhelp{display:inline-block;margin:0 0 6px 6px;vertical-align:middle}',
'#page-abc .abc360-classhelp>summary{display:inline-flex;align-items:center;justify-content:center;min-width:25px;min-height:25px;border:1px solid var(--border);border-radius:7px;color:var(--a);cursor:pointer;font-weight:800;list-style:none}',
'#page-abc .abc360-classhelp .abc360-legend{padding:9px;margin-top:5px;border:1px solid var(--border);border-radius:8px;background:var(--card)}',
'#page-abc .abc360-legend{display:flex;flex-wrap:wrap;gap:11px}',
'#page-abc .abc360-legend span{font-size:13px}',
'#page-abc .abc360-legend i{display:inline-block;width:9px;height:9px;border-radius:3px;margin-right:5px}',
'#page-abc .abc360-gr{display:grid;grid-template-columns:minmax(110px,1fr) 2fr 90px;gap:8px;align-items:center;margin:9px 0}',
'#page-abc .abc360-gr button{border:0;background:none;text-align:left;color:var(--text);font-size:13px;cursor:pointer}',
'#page-abc .abc360-gr .track{height:9px;background:var(--bg);border-radius:4px;overflow:hidden}',
'#page-abc .abc360-gr .track div{height:100%;background:#315cb6}',
'#page-abc .abc360-gr b{font-size:13px;text-align:right}',
'#page-abc .abc360-btn{padding:9px 12px;border-radius:8px;background:var(--card);border:1px solid var(--border);font-size:12px;font-weight:700;color:var(--text);cursor:pointer}',
'#page-abc .abc360-btn.primary{background:#315cb6;color:white;border-color:#315cb6}',
'#page-abc .abc360-warn{background:#fffbeb;color:#854d0e;border:1px solid #fde68a;border-radius:8px;padding:10px;font-size:11px}',
'#page-abc .abc360-more{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px}',
'#page-abc .abc360-more>summary{cursor:pointer;color:var(--a);font-weight:700}',
'#page-abc .abc360-client-opportunity{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px}',
'#page-abc .abc360-client-opportunity h3{font-size:16px;margin:0 0 6px}',
'#page-abc .abc-A{background:#e8eef9;color:#315cb6}#page-abc .abc-B{background:#edf2fa;color:#4c6fae}#page-abc .abc-C{background:#eef1f5;color:#62718b}#page-abc .abc-N{background:#f3f6fb;color:#526d96}',
].join('');
function mount(){
 const page=el('page-abc'),kpi=el('abc-kpi');if(!page||!kpi)return null;
 let root=el('abc360-root');
 if(!root){
  root=document.createElement('div');root.id='abc360-root';root.className='abc360';
  root.setAttribute('aria-label','ABC-анализ — директорский контроль');
  kpi.parentNode.insertBefore(root,kpi);
  const style=document.createElement('style');style.id='abc360-css';style.textContent=styles;document.head.appendChild(style);
  root.addEventListener('click',event=>{
   const button=event.target.closest('button[data-abc-action]');
   if(!button)return;
   if(button.dataset.abcAction==='group'){
    el('abc-group').value=button.dataset.value;
    renderABC();
   }
   if(button.dataset.abcAction==='lera')openLeraWithClientContext();
  });
  el('abc-quality')?.addEventListener('click',event=>{
   if(event.target.closest('[data-abc-retry]'))refresh(true);
  });
 }
 page.classList.add('abc360-on');
 return root;
}
function openLeraWithClientContext(){
 const context=leraContext;
 if(!context||el('abc-scope')?.value!=='client'||String(el('abc-client-id')?.value||'')!==String(context.clientId))return;
 const launch=document.querySelector('.rva-ai360-safe-launch:not([hidden]),.rva-launch:not([hidden]),.rsa-branch-launch:not([hidden])');
 const status=el('abc360-lera-status');
 if(!launch){if(status)status.textContent='Лера недоступна для этой учётной записи.';return;}
 const names=arr=>arr.map(x=>(x.sku&&x.sku!=='—'?x.sku+' · ':'')+x.product+(x.avail>0?' · '+x.avail+' шт.':'')).join('; ')||'не выявлены';
 const prompt='Проведи аудит клиента «'+context.clientName+'» за '+context.period+' в группе «'+context.group+'». '+
  'Аудит полки ('+context.shelfBasis+') — '+names(context.shelf)+'. SKU с полным возвратом за период: '+context.returned+'. '+
  'Покупал ранее — '+names(context.lost)+'. Расширение, товары A филиала — '+names(context.items)+'; товары B клиента — '+names(context.develop)+'. '+
  'Предложи до трёх действий. Для аудита проверь физическую выкладку. В расширение включай только указанные товары с подтверждённым положительным остатком, учитывай ограничения и сезонность. Ничего не создавай и не записывай.';
 launch.click();
 const started=Date.now();
 const timer=setInterval(()=>{
  if(leraContext!==context||el('abc-scope')?.value!=='client'||String(el('abc-client-id')?.value||'')!==String(context.clientId)){clearInterval(timer);return;}
  const field=document.querySelector('.rva-window:not([hidden]) .rva-input');
  if(field){clearInterval(timer);field.value=prompt.slice(0,2400);field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();if(status)status.textContent='Вопрос подготовлен в Лере. Проверьте его и нажмите отправку.';}
  else if(Date.now()-started>10000){clearInterval(timer);if(status)status.textContent='Лера открыта без готового вопроса. Выберите клиента и спросите о товарах класса A.';}
 },150);
}
function fieldManagerAllowed(x){
 const product=String(x.product||'');
 return !(/свароч/i.test(product)&&(/инвертор/i.test(product)||/(^|[^а-я])саи([^а-я]|$)/i.test(product)));
}
function render(info){
 const root=mount();
 if(!root)return;
 leraContext=null;
 const {groups,mode,group,subgroup,client,identity,advice}=info;
 const subgroupName=subgroup?el('abc-subgroup')?.selectedOptions[0]?.textContent:'';
 const help=el('abc360-help-extra');
 if(help)help.textContent=client&&identity?.ids.size>1
  ? 'Продажи по связанным карточкам клиента. Карточек в расчёте: '+identity.ids.size+'.'
  : '';
 if(client&&advice){
  const suggestions=advice.potential.filter(fieldManagerAllowed).slice(0,3);
  leraContext={clientId:client.id,clientName:identity?.name||client.name,group:[group==='all'?'все группы':group,subgroupName].filter(Boolean).join(' / '),
   items:suggestions,shelf:advice.shelf.slice(0,3),develop:advice.availableDevelop.filter(fieldManagerAllowed).slice(0,3),
   shelfBasis:advice.historicalShelf?'история '+abcPeriodText(mode,1):'выбранный период',returned:advice.returned,
   lost:advice.lost.slice(0,3),period:abcPeriodText(mode,0)};
  root.innerHTML='<div class="abc360-client-opportunity"><button type="button" class="abc360-btn" data-abc-action="lera">Подготовить аудит с Лерой</button><div id="abc360-lera-status" role="status" class="abc360-sub"></div></div>';
  return;
 }
 if(!groups.length){root.replaceChildren();return;}
 const detailsOpen=root.querySelector('details.abc360-more')?.open;
 const classes=['A','B','C','N'];
 const counts={A:0,B:0,C:0,N:0,R:0},revenue={A:0,B:0,C:0,N:0,R:0};
 for(const g of groups)for(const item of abcWithinSubgroup(g.items,subgroup)){
  counts[item.class]++;
  revenue[item.class]+=Number(item.revenue)||0;
 }
 const positive=classes.reduce((sum,k)=>sum+revenue[k],0);
 const shares=classes.map(k=>({k,share:positive?100*revenue[k]/positive:0}));
 const bars=shares.map(({k,share})=>'<div style="width:'+share+'%;background:'+colors[k]+'" title="'+k+': '+percent(share)+'"></div>').join('');
 const legend=shares.map(({k,share})=>'<span><i style="background:'+colors[k]+'"></i>'+k+' · '+percent(share)+' · '+fmt(counts[k])+' SKU</span>').join('');
 const legendText=shares.map(({k,share})=>k+' · '+percent(share)+' · '+fmt(counts[k])+' SKU').join(' | ');
 const top=groups.slice().sort((a,b)=>b.netTotal-a.netTotal).filter(g=>g.netTotal>0).slice(0,5);
 const positiveGroups=groups.reduce((sum,g)=>sum+Math.max(0,g.netTotal),0);
 const links=group==='all'&&top.length?'<div class="abc360-sub">Доли товарных групп</div>'+top.map(g=>
  '<div class="abc360-gr"><button type="button" data-abc-action="group" data-value="'+html(g.group)+'">'+html(g.group)+'</button><div class="track"><div style="width:'+100*g.netTotal/top[0].netTotal+'%"></div></div><b>'+percent(100*g.netTotal/positiveGroups)+'</b></div>'
 ).join(''):'';
 root.innerHTML='<details class="abc360-more"'+(detailsOpen?' open':'')+'><summary>Доли классов'+
  (group==='all'?'':' · '+html(subgroupName||group))+'</summary><div class="abc360-stack" role="img" aria-label="Доли классов A, B, C и N по продажам">'+bars+
  '</div><details class="abc360-classhelp"><summary title="'+html(legendText)+'" aria-label="Доли и количество SKU по классам">*</summary><div class="abc360-legend">'+legend+'</div></details>'+links+'</details>';
}
async function refresh(force){
 const page=el('page-abc'),request=++seq;
 if(!page?.classList.contains('active')||typeof window.crmFastAnalyticsEnsure!=='function')return;
 const root=mount(),results=el('abc-results'),quality=el('abc-quality');
 leraContext=null;
 root?.replaceChildren();
 const actions=el('abc-client-actions');
 if(actions){actions.style.display='none';actions.replaceChildren();}
 if(results)results.replaceChildren();
 if(quality)quality.replaceChildren();
 const diagnostic=el('abc-quality-details');
 if(diagnostic)diagnostic.textContent='';
 if(el('abc-period')?.value==='range'&&!abcPeriodMonths('range',0).length){
  if(quality)quality.innerHTML='<div class="abc360-warn" role="alert">Выберите период с января 2023 года по текущий месяц. Начало должно быть не позже конца.</div>';
  return;
 }
 const group=el('abc-group')?.value;
 if(results)results.innerHTML='<div class="card" role="status">Загружаем ABC'+(group&&group!=='all'?' · '+html(group):'')+'…</div>';
 results?.setAttribute('aria-busy','true');
 try{
  const stock=typeof window.v2273EnsureFeature==='function'
    ? Promise.resolve().then(()=>window.v2273EnsureFeature('tasks-stock')).catch(()=>{})
    : null;
  const [loaded]=await Promise.all([window.crmFastAnalyticsEnsure('abc',!!force),stock]);
  if(request===seq&&page.classList.contains('active')&&loaded!==false)renderABC();
 }catch(error){
  if(request!==seq)return;
  results?.replaceChildren();
  if(quality)quality.innerHTML='<div class="abc360-warn" role="alert">Не удалось загрузить ABC. <button type="button" class="abc360-btn" data-abc-retry>Повторить</button></div>';
  if(diagnostic)diagnostic.textContent=String(error?.message||error);
 }finally{
  if(request===seq)results?.removeAttribute('aria-busy');
 }
}
function bind(){
 installCatalogGenerationGuard();
 mount();
 document.addEventListener('change',event=>{
  const id=event.target.id;
  if(!el('page-abc')?.contains(event.target)||
     !['abc-period','abc-period-from','abc-period-to','abc-scope','abc-manager','abc-group','abc-subgroup','abc-client-search','abc-class'].includes(id))return;
  event.stopPropagation();
  clearTimeout(filterTimer);
  if(id==='abc-period')abcInitPeriodOptions();
  if(id==='abc-scope')abcScopeChanged(false);
  if(id==='abc-manager'){
   el('abc-client-id').value='';
   el('abc-client-search').value='';
   abcRefreshClientDatalist();
  }
  if(id==='abc-client-search')abcResolveClient(false);
  if(window.crmFastAbcCurrentReady?.()){renderABC();return;}
  filterTimer=setTimeout(()=>refresh(false),100);
 },true);
}
window.abc360DebouncedSearch=function(){
 clearTimeout(searchTimer);
 if(window.crmFastAbcCurrentReady?.())searchTimer=setTimeout(()=>renderABC(),150);
};
window.RESANTA_ABC360={render,refresh,eligibleRecommendation:fieldManagerAllowed};
window.RESANTA_ABC360_V1=Object.freeze({version:'20261123.5',readOnly:true,source:'existing ABC + 1C'});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
