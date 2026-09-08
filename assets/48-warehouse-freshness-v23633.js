/* RESANTA CRM v23.6.80 · WAREHOUSE ORDER PREPARE + FRESHNESS
 * - stale 1C/Vitebsk/sales can be requested from CRM with one button;
 * - a lightweight GitHub worker checks the queue every 5 minutes;
 * - while a request is active, only this warehouse page polls status every 15 sec;
 * - order export stays blocked until automatic sources are fresh;
 * - after readiness the order is recalculated automatically and the current snapshot is shown;
 * - if newer source data appears later, CRM warns before silently changing the order.
 */
(function(){
'use strict';
if(window.RESANTA_WAREHOUSE_FRESHNESS_V23633)return;

const VERSION='v23.6.80';
const $=id=>document.getElementById(id);
let lastFreshness=null,lastRequest=null,lastMeta=null,busy=false,pollTimer=null,readyReloadedId=null,captureInstalled=false;

function dbx(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
async function rpc(name,args={}){
  const d=dbx();if(!d)throw new Error('База ещё не готова');
  const {data,error}=await d.rpc(name,args);if(error)throw error;return data
}
function active(){return !!$('page-warehouse-control')?.classList.contains('active')}
function dmy(v){if(!v)return'—';const s=String(v).slice(0,10).split('-');return s.length===3?`${s[2]}.${s[1]}.${s[0]}`:String(v)}
function hm(v){if(!v)return'—';try{return new Date(v).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}catch(_){return'—'}}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function pill(label,date,ok,manual=false,loadedAt=null){
  const bg=manual?'#EFF6FF':ok?'#ECFDF5':'#FEF2F2',bd=manual?'#BFDBFE':ok?'#A7F3D0':'#FECACA',fg=manual?'#1E40AF':ok?'#166534':'#991B1B',icon=manual?'📦':ok?'✅':'⚠️';
  return `<div style="padding:8px 10px;border:1px solid ${bd};background:${bg};border-radius:9px;color:${fg};font-size:11px;line-height:1.35"><b>${icon} ${label}</b><br>${dmy(date)}${loadedAt?' · '+hm(loadedAt):''}${manual?' · ручная загрузка':''}</div>`
}
function ensureBox(){
  const root=$('wc-v23620');if(!root)return null;
  let box=$('wc-freshness-v23633');
  if(!box){
    box=document.createElement('div');box.id='wc-freshness-v23633';
    const head=root.querySelector('.wc-head');
    (head?.parentNode||root).insertBefore(box,head?.nextSibling||root.firstChild)
  }
  return box
}
function requestStatusHtml(){
  const r=lastRequest,m=lastMeta||{};
  if(!r){
    if(lastFreshness?.auto_sources_fresh)return '';
    return `<div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap"><button id="wc-prepare-order-v23680" class="primary" style="min-height:42px">🔄 Обновить данные и подготовить заказ</button><span style="font-size:10px;color:var(--sub)">CRM сама запросит свежую себестоимость 1С, остаток Витебска и продажи.</span></div>`
  }
  const st=String(r.status||'');
  if(['pending','running','waiting'].includes(st)){
    const icon=st==='running'?'⏳':'🟡';
    return `<div style="margin-top:10px;padding:9px 10px;border:1px solid #FDE68A;background:#FFFBEB;border-radius:9px;font-size:11px;line-height:1.45"><b>${icon} Подготавливаю заказ</b> · попытка ${Number(r.attempt_count)||0}<br>${esc(r.message||'Проверяю свежие отчёты 1С.')}<div style="color:var(--sub);margin-top:3px">Статус обновляется автоматически. Повторно нажимать не нужно.</div></div>`
  }
  if(st==='ready'){
    const newer=!!m.new_data_after_ready;
    return `<div style="margin-top:10px;padding:9px 10px;border:1px solid ${newer?'#FDE68A':'#A7F3D0'};background:${newer?'#FFFBEB':'#F0FDF4'};border-radius:9px;font-size:11px;line-height:1.45"><b>${newer?'🟡 После расчёта появились новые данные':'✅ Заказ готов по свежим данным'}</b><br>${esc(r.message||'Данные подготовлены.')}${newer?'<div style="margin-top:7px"><button id="wc-prepare-order-v23680" class="primary">↻ Пересчитать заказ по новым данным</button></div>':''}</div>`
  }
  if(st==='error'){
    return `<div style="margin-top:10px;padding:9px 10px;border:1px solid #FECACA;background:#FEF2F2;border-radius:9px;font-size:11px;line-height:1.45"><b>❌ Не удалось получить свежие данные</b><br>${esc(r.message||r.last_error||'Попробуйте ещё раз.')}<div style="margin-top:7px"><button id="wc-prepare-order-v23680" class="primary">🔄 Повторить подготовку заказа</button></div></div>`
  }
  return ''
}
function bindPrepare(){
  const b=$('wc-prepare-order-v23680');if(b&&!b.dataset.boundV23680){b.dataset.boundV23680='1';b.onclick=prepareOrder}
}
function decorate(f){
  if(!f)return;lastFreshness=f;
  const box=ensureBox();if(!box)return;
  const ok=!!f.auto_sources_fresh;
  box.style.cssText=`margin:0 0 12px;padding:12px;border:1px solid ${ok?'#A7F3D0':'#FECACA'};background:${ok?'#F0FDF4':'#FFF7F7'};border-radius:11px`;
  box.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:9px"><div><b style="font-size:13px">${ok?'✅ Данные для расчёта свежие':'⚠️ Для заказа нужны свежие данные'}</b><div style="font-size:10px;color:var(--sub);margin-top:2px">${ok?'Автозаказ можно пересчитывать и выгружать.':'Одной кнопкой CRM запросит новые данные 1С, Витебска и продаж. Чехов остаётся отдельным источником.'}</div></div><div style="font-size:10px;color:var(--sub)">Сегодня: ${dmy(f.today)}</div></div><div style="display:grid;grid-template-columns:repeat(4,minmax(145px,1fr));gap:7px">${pill('Себестоимость 1С',f.cost_date,!!f.cost_fresh,false,f.cost_loaded_at)}${pill('Остаток Витебск',f.vitebsk_stock_date,!!f.vitebsk_stock_fresh,false,f.vitebsk_stock_loaded_at)}${pill('Продажи',f.sales_date,!!f.sales_fresh,false,f.sales_loaded_at)}${pill('Чехов',f.chekhov_date,true,true,f.chekhov_loaded_at)}</div>${requestStatusHtml()}`;
  const refresh=$('wc-refresh');
  if(refresh){
    refresh.textContent=ok?'↻ Обновить расчёт':'🔄 Обновить данные и расчёт';
    refresh.title=ok?'Перечитать уже загруженные данные':'Запросить свежие данные 1С/Витебск/продажи и после готовности пересчитать заказ'
  }
  bindPrepare();applyOrderGuard()
}
function applyOrderGuard(){
  const ex=$('wc-export');if(!ex)return;
  const ok=!!lastFreshness?.auto_sources_fresh;
  if(ok){ex.disabled=false;ex.style.opacity='';ex.title='';return}
  ex.disabled=true;ex.style.opacity='.45';
  ex.title='Сначала нажмите «Обновить данные и подготовить заказ»'
}
async function checkFreshness(){
  try{const f=await rpc('warehouse_control_get_freshness_v1',{});decorate(f);return f}
  catch(e){console.warn('Warehouse freshness '+VERSION,e);return null}
}
function clearPoll(){if(pollTimer){clearTimeout(pollTimer);pollTimer=null}}
function schedulePoll(ms){
  clearPoll();
  if(!active())return;
  pollTimer=setTimeout(()=>{pollTimer=null;checkRequestStatus()},ms)
}
async function recalcReady(rid){
  if(!rid||readyReloadedId===rid)return;
  readyReloadedId=rid;
  try{
    const api=window.crmWarehouseControlV1;
    if(api&&typeof api.__freshnessOriginalOpen==='function')await api.__freshnessOriginalOpen(true);
    else if(api&&typeof api.open==='function')await api.open(true);
    await checkFreshness();
    setTimeout(()=>{
      const tab=document.querySelector('#wc-v23620 .wc-tab[data-mode="order"]');
      if(tab)tab.click()
    },80)
  }catch(e){console.warn(VERSION+' order recalc',e)}
}
async function checkRequestStatus(){
  if(!active())return null;
  try{
    const data=await rpc('warehouse_order_refresh_status_v23680',{});
    lastRequest=data?.request||null;lastMeta=data||null;
    if(data?.freshness)decorate(data.freshness);else await checkFreshness();
    const st=String(lastRequest?.status||'');
    if(st==='ready'&&data?.freshness?.auto_sources_fresh)await recalcReady(lastRequest.id);
    if(['pending','running','waiting'].includes(st))schedulePoll(15000);
    else schedulePoll(60000);
    return data
  }catch(e){
    console.warn(VERSION+' request status',e);
    schedulePoll(60000);return null
  }
}
async function prepareOrder(){
  if(busy)return;busy=true;
  const btn=$('wc-prepare-order-v23680');
  if(btn){btn.disabled=true;btn.textContent='⏳ Запрашиваю обновление…'}
  try{
    const data=await rpc('warehouse_order_refresh_request_v23680',{});
    lastRequest=data?.request||null;lastMeta={...(lastMeta||{}),freshness:data?.freshness||lastFreshness,new_data_after_ready:false};
    if(data?.freshness)decorate(data.freshness);
    const st=String(lastRequest?.status||'');
    if(st==='ready'){
      readyReloadedId=null;
      await recalcReady(lastRequest.id)
    }else{
      schedulePoll(3000)
    }
  }catch(e){alert('Не удалось запустить обновление данных: '+(e?.message||e))}
  finally{busy=false;bindPrepare()}
}
async function manualRefresh(){
  if(busy)return;
  if(lastFreshness&&!lastFreshness.auto_sources_fresh){await prepareOrder();return}
  busy=true;const btn=$('wc-refresh');
  if(btn){btn.disabled=true;btn.textContent='⏳ Обновляю расчёт…'}
  try{
    const api=window.crmWarehouseControlV1;
    if(api&&typeof api.__freshnessOriginalOpen==='function')await api.__freshnessOriginalOpen(true);
    else if(api&&typeof api.open==='function'&&!api.open.__freshnessWrapped)await api.open(true);
    await checkFreshness();await checkRequestStatus()
  }catch(e){alert('Не удалось обновить расчёт: '+(e?.message||e))}
  finally{busy=false;const b=$('wc-refresh');if(b)b.disabled=false}
}
function bindRefresh(){
  const b=$('wc-refresh');
  if(b&&!b.dataset.freshnessV23680){b.dataset.freshnessV23680='1';b.onclick=manualRefresh}
}
function installCapture(){
  if(captureInstalled)return;
  const page=$('page-warehouse-control');if(!page)return;
  captureInstalled=true;
  page.addEventListener('click',e=>{
    const refresh=e.target.closest?.('#wc-refresh');
    if(refresh&&lastFreshness&&!lastFreshness.auto_sources_fresh){
      e.preventDefault();e.stopImmediatePropagation();prepareOrder()
    }
  },true)
}
function hook(){
  const api=window.crmWarehouseControlV1;if(!api)return false;
  if(!api.__freshnessV23680){
    const origOpen=typeof api.open==='function'?api.open.bind(api):null,origSwitch=typeof api.switchMode==='function'?api.switchMode.bind(api):null;
    if(origOpen){
      api.__freshnessOriginalOpen=origOpen;
      const w=async function(...args){
        const r=await origOpen(...args);
        bindRefresh();setTimeout(checkFreshness,30);setTimeout(checkRequestStatus,80);return r
      };
      w.__freshnessWrapped=true;api.open=w
    }
    if(origSwitch){
      api.switchMode=async function(...args){
        const r=await origSwitch(...args);
        setTimeout(()=>{bindRefresh();applyOrderGuard();bindPrepare()},20);return r
      }
    }
    api.__freshnessV23680=true
  }
  bindRefresh();installCapture();
  if(active()){setTimeout(checkFreshness,60);setTimeout(checkRequestStatus,120)}
  return true
}
function install(){hook()}
install();[250,700,1400,2600,5000].forEach(ms=>setTimeout(install,ms));
window.addEventListener('focus',()=>{if(active()){checkFreshness();checkRequestStatus()}},{passive:true});
window.crmWarehousePrepareOrderV23680=prepareOrder;
window.RESANTA_WAREHOUSE_FRESHNESS_V23633=Object.freeze({
  version:VERSION,
  orderPrepareQueue:true,
  workerIntervalMinutes:5,
  activeRequestPollSeconds:15,
  blocksStaleOrder:true,
  autoSources:['warehouse_cost','vitebsk_stock','sales'],
  chekhovManual:true,
  noMutationObserver:true
});
console.info('RESANTA warehouse freshness '+VERSION+' installed')
})();

(function(){try{if(window.RESANTA_WAREHOUSE_COMPACT_V23637||document.getElementById('warehouse-compact-loader-v23637'))return;const s=document.createElement('script');s.id='warehouse-compact-loader-v23637';s.src='./assets/51-warehouse-compact-days-v23637.js?_='+Date.now();s.async=true;document.head.appendChild(s)}catch(e){console.warn('warehouse compact loader',e)}})();
(function(){try{if(window.RESANTA_WAREHOUSE_STOCK_TRUTH_V23641||document.getElementById('warehouse-stock-truth-loader-v23641'))return;const s=document.createElement('script');s.id='warehouse-stock-truth-loader-v23641';s.src='./assets/54-warehouse-stock-truth-v23641.js?_='+Date.now();s.async=true;document.head.appendChild(s)}catch(e){console.warn('warehouse stock truth loader',e)}})();
(function(){try{if(window.RESANTA_WAREHOUSE_SMART_EXCESS_V23643||document.getElementById('warehouse-smart-excess-loader-v23643'))return;const s=document.createElement('script');s.id='warehouse-smart-excess-loader-v23643';s.src='./assets/55-warehouse-smart-excess-v23642.js?_='+Date.now();s.async=true;document.head.appendChild(s)}catch(e){console.warn('warehouse smart excess v23.6.43 loader',e)}})();
