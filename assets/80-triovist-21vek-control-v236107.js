/* RESANTA CRM v23.6.108 · TRIOVIST OWN 21VEK CONTROL CENTER
 * Lightweight status/control UI for the production own 21vek parser.
 * Managers get a prominent warning if data is stale, incomplete or the parser fails.
 * One cached status RPC; no card scans in browser; no MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_21VEK_CONTROL_V236107)return;
const VERSION='v23.6.108',TTL=30000;
let cache=null,cacheAt=0,flight=null;

function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function dt(v){if(!v)return'—';try{return new Date(v).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(_){return String(v);}}
function n(v){return Number(v||0).toLocaleString('ru-RU');}
function activeTriovist(){return document.getElementById('page-triovist')?.classList.contains('active');}
function injectCss(){
  if(document.getElementById('tri21-control-css-v236107'))return;
  const s=document.createElement('style');s.id='tri21-control-css-v236107';s.textContent=`
  .tri21ctl{margin-bottom:12px;padding:14px 16px;transition:border-color .18s,box-shadow .18s,background .18s}.tri21ctl.state-green{border-color:#BBF7D0}.tri21ctl.state-amber{border:2px solid #F59E0B;background:#FFFBEB;box-shadow:0 0 0 3px rgba(245,158,11,.08)}.tri21ctl.state-red{border:2px solid #DC2626;background:#FFF7F7;box-shadow:0 0 0 3px rgba(220,38,38,.10)}.tri21ctl-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}.tri21ctl-title{font-size:15px;font-weight:800}.tri21ctl-sub{font-size:11px;color:var(--sub);margin-top:3px;line-height:1.45}.tri21ctl-badge{display:inline-flex;align-items:center;gap:6px;border-radius:99px;padding:5px 10px;font-size:11px;font-weight:800}.tri21ctl-green{background:#DCFCE7;color:#166534}.tri21ctl-amber,.tri21ctl-queued{background:#FEF3C7;color:#92400E}.tri21ctl-red{background:#FEE2E2;color:#B91C1C}.tri21ctl-running{background:#DBEAFE;color:#1D4ED8}.tri21ctl-alert{margin-top:11px;padding:11px 12px;border-radius:9px;font-size:12px;line-height:1.5;font-weight:650}.tri21ctl-alert strong{font-weight:850}.tri21ctl-alert.amber{background:#FEF3C7;border:1px solid #F59E0B;color:#92400E}.tri21ctl-alert.red{background:#FEE2E2;border:1px solid #EF4444;color:#991B1B}.tri21ctl-grid{display:grid;grid-template-columns:repeat(5,minmax(110px,1fr));gap:8px;margin-top:12px}.tri21ctl-kpi{background:var(--bg);border-radius:9px;padding:9px 10px}.tri21ctl-kpi b{display:block;font-size:16px}.tri21ctl-kpi span{font-size:9px;color:var(--sub);text-transform:uppercase}.tri21ctl-foot{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-top:11px;padding-top:10px;border-top:1px solid var(--border)}.tri21ctl-meta{font-size:11px;color:var(--sub);line-height:1.55}.tri21ctl-actions{display:flex;gap:7px;flex-wrap:wrap}.tri21ctl-actions button{white-space:nowrap}.tri21ctl-note{font-size:10px;color:var(--sub);margin-top:6px;max-width:740px}.tri21ctl-error{font-size:12px;color:var(--r);font-weight:700;padding:10px;background:var(--rb);border:1px solid #FECACA;border-radius:8px}
  @media(max-width:900px){.tri21ctl-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.tri21ctl-grid{grid-template-columns:1fr 1fr}.tri21ctl-actions{width:100%}.tri21ctl-actions button{flex:1}}
  `;document.head.appendChild(s);
}
function ensurePanel(){
  injectCss();
  const page=document.getElementById('page-triovist');if(!page)return null;
  let root=document.getElementById('tri21-control-v236107');
  if(!root){
    root=document.createElement('div');root.id='tri21-control-v236107';root.className='card tri21ctl';
    root.innerHTML='<div class="tri21ctl-sub">Загружаю состояние собственного парсера 21vek…</div>';
    const anchor=document.getElementById('triovist-warning');
    if(anchor?.parentNode===page)page.insertBefore(root,anchor);else page.insertBefore(root,page.firstChild?.nextSibling||null);
  }
  return root;
}
async function status(force=false){
  if(!force&&cache&&Date.now()-cacheAt<TTL)return cache;
  if(flight)return flight;
  flight=(async()=>{
    const r=await db.rpc('triovist_21vek_status_v236107',{});if(r?.error)throw r.error;
    cache=r?.data||{};cacheAt=Date.now();return cache;
  })().finally(()=>flight=null);
  return flight;
}
function healthMeta(h){
  const x=String(h||'red');
  if(x==='green')return['🟢 Работает','tri21ctl-green'];
  if(x==='queued')return['🟡 Обновление в очереди','tri21ctl-queued'];
  if(x==='running')return['🔵 Идёт полный сбор','tri21ctl-running'];
  if(x==='amber')return['🟠 Нужна проверка','tri21ctl-amber'];
  return['🔴 Ошибка / данные устарели','tri21ctl-red'];
}
function dangerState(d){
  const h=String(d?.health||'red');
  if(h==='red')return'red';
  if(h==='amber')return'amber';
  return'green';
}
function warningHtml(d){
  const st=dangerState(d);
  if(st==='red')return '<div class="tri21ctl-alert red">🚨 <strong>21vek сейчас не обновляется корректно.</strong> Не принимайте решение по остаткам, наличию и TOP на основании этого блока до восстановления. Используйте последний хороший снимок и сразу сообщите руководителю, приложив скрин этого статуса.</div>';
  if(st==='amber')return '<div class="tri21ctl-alert amber">⚠️ <strong>Данные 21vek требуют проверки.</strong> Можно видеть последний хороший снимок, но новые решения по остаткам и TOP лучше не принимать до зелёного статуса. Сообщите руководителю и приложите скрин.</div>';
  return'';
}
function render(d){
  const root=ensurePanel();if(!root)return;
  const w=d?.working||{},p=d?.parser||{},g=d?.last_good||{},t=d?.top||{},rq=d?.refresh_request||null;
  const [label,cls]=healthMeta(d?.health);
  const state=dangerState(d);
  root.classList.remove('state-green','state-amber','state-red');root.classList.add('state-'+state);
  const errors=Number(p?.errors||0);
  const expected=Number(w.cards||0),success=Number(g?.success||0);
  const coverage=expected?`${n(success||expected)} / ${n(expected)}`:'—';
  const reqActive=rq&&['queued','claimed'].includes(String(rq.status));
  const can=!!d?.can_refresh;
  const btnText=rq?.status==='claimed'?'⏳ Сбор выполняется':rq?.status==='queued'?'⏱ В очереди':'↻ Запустить обновление 21vek';
  root.innerHTML=`
    <div class="tri21ctl-head"><div><div class="tri21ctl-title">🌐 21vek · собственный парсер</div><div class="tri21ctl-sub">Источник рабочих карточек: <b>${esc(d?.source_label||'Собственный парсер 21vek')}</b></div></div><span class="tri21ctl-badge ${cls}">${label}</span></div>
    ${warningHtml(d)}
    <div class="tri21ctl-grid">
      <div class="tri21ctl-kpi"><span>Карточки</span><b>${coverage}</b></div>
      <div class="tri21ctl-kpi"><span>В наличии</span><b>${n(w.in_stock)}</b></div>
      <div class="tri21ctl-kpi"><span>TOP-30</span><b>${n(w.top30)}</b></div>
      <div class="tri21ctl-kpi"><span>TOP-60</span><b>${n(w.top60)}</b></div>
      <div class="tri21ctl-kpi"><span>Ошибки последнего запуска</span><b>${n(errors)}</b></div>
    </div>
    <div class="tri21ctl-foot"><div class="tri21ctl-meta">
      Рабочий снимок: <b>${esc(w.snapshot_date||'—')}</b> · последний полный успешный сбор: <b>${dt(g.finished_at)}</b><br>
      TOP проверен: <b>${dt(t.finished_at)}</b>${rq?` · ручной запрос: <b>${rq.status==='claimed'?'выполняется':'в очереди'}</b>`:''}
    </div><div class="tri21ctl-actions">
      <button class="btn-secondary" type="button" onclick="triovist21vekRefreshStatusV236107()">↻ Статус</button>
      ${can?`<button class="btn-primary" type="button" ${reqActive?'disabled':''} onclick="triovist21vekRequestRefreshV236107()">${btnText}</button>`:''}
    </div></div>
    ${can?'<div class="tri21ctl-note">Ручной запрос подхватывается сервером максимум примерно за 10 минут. Рабочий снимок меняется только после полного успешного сбора карточек и TOP; при ошибке остаётся последний хороший снимок.</div>':'<div class="tri21ctl-note">Менеджеру ничего запускать вручную не нужно. Контролируйте цвет статуса: зелёный — работаем; оранжевый/красный — сообщить руководителю со скриншотом.</div>'}`;
}
async function load(force=false){
  const root=ensurePanel();if(!root)return;
  try{render(await status(force));}
  catch(e){console.error('21vek control',e);root.classList.remove('state-green','state-amber');root.classList.add('state-red');root.innerHTML='<div class="tri21ctl-error">🚨 Не удалось получить статус собственного парсера 21vek. Данные 21vek сейчас считать неподтверждёнными. Сообщите руководителю и приложите скрин. Техническая ошибка: '+esc(e?.message||e)+'</div>';}
}
window.triovist21vekRefreshStatusV236107=async function(){cache=null;cacheAt=0;await load(true);};
window.triovist21vekRequestRefreshV236107=async function(){
  try{
    const d=await status(false);if(!d?.can_refresh)return;
    if(!confirm('Запустить полный сбор 21vek по всем карточкам и TOP? Текущий хороший снимок останется рабочим до успешного завершения.'))return;
    const r=await db.rpc('triovist_21vek_request_refresh_v236107',{});if(r?.error)throw r.error;
    cache=null;cacheAt=0;await load(true);
    const msg=r?.data?.message||'Обновление поставлено в очередь';
    if(typeof showToast==='function')showToast('✅ '+msg);else alert('✅ '+msg);
  }catch(e){alert('Не удалось запустить обновление 21vek: '+(e?.message||e));}
};

const baseRender=window.renderTriovist;
window.renderTriovist=function(){const out=baseRender?.apply(this,arguments);ensurePanel();if(activeTriovist())setTimeout(()=>load(false),0);return out;};
const baseReload=window.triovistReload;
if(typeof baseReload==='function')window.triovistReload=async function(){const out=await baseReload.apply(this,arguments);cache=null;cacheAt=0;if(activeTriovist())await load(true);return out;};

window.RESANTA_TRIOVIST_21VEK_CONTROL_V236107=Object.freeze({version:VERSION,refresh:()=>load(true),status:()=>status(false)});
setTimeout(()=>{if(activeTriovist()){ensurePanel();load(false);}},0);
})();
