/* RESANTA CRM v23.6.115 · TRIOVIST OWN 21VEK CONTROL CENTER
 * Lightweight status/control UI for the production own 21vek parser.
 * Managers get a prominent warning if data is stale, incomplete or the parser fails.
 * One cached status RPC; no card scans in browser; no MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_21VEK_CONTROL_V236107)return;
const VERSION='v23.6.220',TTL=15000;
let cache=null,cacheAt=0,flight=null,mrcCache=null,mrcCacheAt=0,mrcFlight=null;

function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function dt(v){if(!v)return'—';try{return new Date(v).toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(_){return String(v);}}
function n(v){return Number(v||0).toLocaleString('ru-RU');}
function ageText(v){
  if(!v)return'время не определено';
  const ms=Date.now()-new Date(v).getTime();if(!Number.isFinite(ms))return'время не определено';
  const m=Math.max(0,Math.floor(ms/60000));
  if(m<1)return'только что';if(m<60)return m+' мин назад';
  const h=Math.floor(m/60);if(h<24)return h+' ч '+(m%60)+' мин назад';
  return Math.floor(h/24)+' дн назад';
}
function parserError(d){
  const p=d?.parser||{};
  if(String(p.status||'')!=='failed'&&Number(p.errors||0)<=0)return'';
  return String(p.error_explain||p.error_text||'Сбор завершился не полностью. Рабочий снимок не заменён; используются последние проверенные данные.');
}
function activeTriovist(){return document.getElementById('page-triovist')?.classList.contains('active');}
function injectCss(){
  if(document.getElementById('tri21-control-css-v236107'))return;
  const s=document.createElement('style');s.id='tri21-control-css-v236107';s.textContent=`
  .tri21ctl{margin-bottom:12px;padding:14px 16px;transition:border-color .18s,box-shadow .18s,background .18s}.tri21ctl.state-green{border-color:#BBF7D0}.tri21ctl.state-amber{border:2px solid #F59E0B;background:#FFFBEB;box-shadow:0 0 0 3px rgba(245,158,11,.08)}.tri21ctl.state-red{border:2px solid #DC2626;background:#FFF7F7;box-shadow:0 0 0 3px rgba(220,38,38,.10)}.tri21ctl-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}.tri21ctl-title{font-size:15px;font-weight:800}.tri21ctl-sub{font-size:11px;color:var(--sub);margin-top:3px;line-height:1.45}.tri21ctl-badge{display:inline-flex;align-items:center;gap:6px;border-radius:99px;padding:5px 10px;font-size:11px;font-weight:800}.tri21ctl-green{background:#DCFCE7;color:#166534}.tri21ctl-amber,.tri21ctl-queued{background:#FEF3C7;color:#92400E}.tri21ctl-red{background:#FEE2E2;color:#B91C1C}.tri21ctl-running{background:#DBEAFE;color:#1D4ED8}.tri21ctl-alert{margin-top:11px;padding:11px 12px;border-radius:9px;font-size:12px;line-height:1.5;font-weight:650}.tri21ctl-alert strong{font-weight:850}.tri21ctl-alert.amber{background:#FEF3C7;border:1px solid #F59E0B;color:#92400E}.tri21ctl-alert.red{background:#FEE2E2;border:1px solid #EF4444;color:#991B1B}.tri21ctl-grid{display:grid;grid-template-columns:repeat(5,minmax(110px,1fr));gap:8px;margin-top:12px}.tri21ctl-kpi{background:var(--bg);border-radius:9px;padding:9px 10px}.tri21ctl-kpi b{display:block;font-size:16px}.tri21ctl-kpi span{font-size:9px;color:var(--sub);text-transform:uppercase}.tri21ctl-foot{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-top:11px;padding-top:10px;border-top:1px solid var(--border)}.tri21ctl-meta{font-size:11px;color:var(--sub);line-height:1.55}.tri21ctl-actions{display:flex;gap:7px;flex-wrap:wrap}.tri21ctl-actions button{white-space:nowrap}.tri21ctl-note{font-size:10px;color:var(--sub);margin-top:6px;max-width:900px}.tri21ctl-fresh{margin-top:10px;padding:9px 11px;border-radius:9px;font-size:11px;line-height:1.45}.tri21ctl-fresh.ok{background:#F0FDF4;border:1px solid #BBF7D0;color:#166534}.tri21ctl-fresh.warn{background:#FFFBEB;border:1px solid #FDE68A;color:#92400E}.tri21ctl-error{font-size:12px;color:var(--r);font-weight:700;padding:10px;background:var(--rb);border:1px solid #FECACA;border-radius:8px}.tri21mrc{margin-top:12px;padding-top:12px;border-top:1px solid var(--border)}.tri21mrc-head{display:flex;justify-content:space-between;gap:8px;align-items:flex-start}.tri21mrc-head>b,.tri21mrc-head b{font-size:13px}.tri21mrc-head div div{font-size:10px;color:var(--sub);margin-top:3px}.tri21mrc-kpi{display:grid;grid-template-columns:repeat(5,minmax(100px,1fr));gap:7px;margin-top:9px}.tri21mrc-kpi>div{background:#F8FAFC;border:1px solid #E5E7EB;border-radius:8px;padding:8px}.tri21mrc-kpi span{display:block;font-size:9px;color:var(--sub);text-transform:uppercase}.tri21mrc-kpi b{font-size:15px}.tri21mrc-details{margin-top:9px}.tri21mrc-details summary{cursor:pointer;font-size:11px;font-weight:800;color:#0C447C}.tri21mrc-table{overflow:auto;margin-top:7px;max-height:420px}.tri21mrc-table table{width:100%;border-collapse:collapse;font-size:10px;min-width:900px}.tri21mrc-table th,.tri21mrc-table td{padding:7px;border-bottom:1px solid #E5E7EB;text-align:left;vertical-align:top}.tri21mrc-table th{position:sticky;top:0;background:#F8FAFC;z-index:1}.tri21mrc-table td span{font-size:9px;color:var(--sub)}.tri21mrc-table a{color:#185FA5}.tri21mrc-badge{display:inline-block;border-radius:99px;padding:3px 6px;background:#F3F4F6;font-size:9px;font-weight:800}.tri21mrc-badge.good{background:#DCFCE7}.tri21mrc-badge.warn{background:#FEF3C7}.tri21mrc-badge.bad{background:#FEE2E2}.good{color:#166534!important}.warn{color:#92400E!important}.bad{color:#B91C1C!important}
  @media(max-width:900px){.tri21ctl-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.tri21mrc-kpi{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.tri21ctl-grid{grid-template-columns:1fr 1fr}.tri21ctl-actions{width:100%}.tri21ctl-actions button{flex:1}}
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
async function mrcStatus(force=false){
  if(!force&&mrcCache&&Date.now()-mrcCacheAt<TTL)return mrcCache;
  if(mrcFlight)return mrcFlight;
  mrcFlight=(async()=>{
    const r=await db.rpc('triovist_21vek_mrc_dashboard_v236220',{});if(r?.error)throw r.error;
    mrcCache=r?.data||{};mrcCacheAt=Date.now();return mrcCache;
  })().finally(()=>mrcFlight=null);
  return mrcFlight;
}
function money(v){const x=Number(v);return Number.isFinite(x)?x.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN':'—';}
function pct(v){const x=Number(v);return Number.isFinite(x)?(x>0?'+':'')+x.toFixed(2).replace('.',',')+'%':'—';}
function mrcBadge(row){
  const s=String(row?.status||'');
  if(s==='critical')return'<span class="tri21mrc-badge bad">🔴 ниже МРЦ</span>';
  if(s==='warning')return'<span class="tri21mrc-badge warn">🟠 ниже МРЦ</span>';
  if(s==='slight')return'<span class="tri21mrc-badge warn">🟡 ниже МРЦ</span>';
  if(s==='above')return'<span class="tri21mrc-badge good">выше МРЦ</span>';
  return'<span class="tri21mrc-badge">МРЦ</span>';
}
function mrcHtml(m){
  const s=m?.summary||{},rows=Array.isArray(m?.rows)?m.rows:[];
  const line=rows.length?rows.map(x=>`<tr>
    <td><b>${esc(x.sku||'—')}</b><br><span>${esc(x.product_name||'')}</span></td>
    <td>${money(x.mrc_byn)}</td>
    <td>${money(x.price)}</td>
    <td class="${Number(x.delta_pct)<0?'bad':'good'}"><b>${pct(x.delta_pct)}</b><br><span>${money(x.delta_byn)}</span></td>
    <td>${mrcBadge(x)}</td>
    <td>${esc(x.manager_name||'—')}</td>
    <td>${x.product_url?'<a target="_blank" rel="noopener" href="'+esc(x.product_url)+'">21vek ↗</a>':'—'}</td>
  </tr>`).join(''):'<tr><td colspan="7">Отклонений от МРЦ в текущем рабочем снимке нет.</td></tr>';
  return `<div class="tri21mrc">
    <div class="tri21mrc-head"><div><b>💰 МРЦ РБ / отклонения цены на 21vek</b><div>Источник: ${esc(m?.source_file||'РБ МРЦ')}, действует с ${esc(m?.effective_date||'—')}. Сравнение идёт строго по нашему артикулу.</div></div></div>
    <div class="tri21mrc-kpi">
      <div><span>МРЦ в файле</span><b>${n(s.mrc_rows)}</b></div>
      <div><span>Карточек с МРЦ</span><b>${n(s.with_mrc)}</b></div>
      <div><span>Ниже МРЦ</span><b class="${Number(s.below_mrc)>0?'bad':'good'}">${n(s.below_mrc)}</b></div>
      <div><span>Ниже МРЦ >5%</span><b class="${Number(s.critical_below_mrc)>0?'bad':'good'}">${n(s.critical_below_mrc)}</b></div>
      <div><span>Без МРЦ</span><b>${n(s.missing_mrc)}</b></div>
    </div>
    <details class="tri21mrc-details" ${Number(s.below_mrc)>0?'open':''}><summary>Показать отклонения от МРЦ · до 120 позиций</summary>
      <div class="tri21mrc-table"><table><thead><tr><th>SKU / товар</th><th>МРЦ</th><th>Цена 21vek</th><th>Отклонение</th><th>Статус</th><th>Менеджер</th><th>Карточка</th></tr></thead><tbody>${line}</tbody></table></div>
    </details>
  </div>`;
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
function render(d,mrc){
  const root=ensurePanel();if(!root)return;
  const w=d?.working||{},p=d?.parser||{},g=d?.last_good||{},t=d?.top||{},rq=d?.refresh_request||null,rg=d?.registry||{};
  const [label,cls]=healthMeta(d?.health);
  const state=dangerState(d);
  root.classList.remove('state-green','state-amber','state-red');root.classList.add('state-'+state);
  const errors=Number(p?.errors||0);
  const expected=Number(w.cards||0),success=Number(g?.success||0);
  const coverage=expected?n(expected):'—';
  const reqActive=rq&&['queued','claimed'].includes(String(rq.status));
  const can=!!d?.can_refresh;
  const btnText=rq?.status==='claimed'?'⏳ Сбор выполняется':rq?.status==='queued'?'⏱ В очереди':'↻ Запустить обновление 21vek';
  const workingAt=w.completed_at||t.finished_at||g.finished_at||null;
  const ageH=workingAt?Math.max(0,(Date.now()-new Date(workingAt).getTime())/3600000):999;
  const freshClass=ageH<=24?'ok':'warn';
  const freshIcon=ageH<=24?'✅':'⚠️';
  const errText=parserError(d);
  root.innerHTML=`
    <div class="tri21ctl-head"><div><div class="tri21ctl-title">🌐 21vek · собственный парсер</div><div class="tri21ctl-sub">Источник рабочих карточек: <b>${esc(d?.source_label||'Собственный парсер 21vek')}</b></div></div><span class="tri21ctl-badge ${cls}">${label}</span></div>
    ${warningHtml(d)}
    <div class="tri21ctl-fresh ${freshClass}">${freshIcon} <b>${workingAt?'Рабочий снимок собственного парсера: '+dt(workingAt):'Время рабочего снимка не определено'}</b>${workingAt?' · '+ageText(workingAt):''}. Карточки: ${n(w.cards)}; реестр целей: ${n(rg.targets)}${rg.changed_since_last_good?' · реестр изменился, нужен новый полный сбор':''}; TOP: ${t.finished_at?'проверен '+dt(t.finished_at):'нет подтверждённого полного запуска'}.</div>
    ${errText?`<div class="tri21ctl-alert red">❗ <strong>Что произошло:</strong> ${esc(errText)}<br><span style="font-weight:500">Рабочие данные не заменяются неполным запуском — CRM оставляет последний полностью проверенный снимок.</span></div>`:''}
    <div class="tri21ctl-grid">
      <div class="tri21ctl-kpi"><span>Карточки</span><b>${coverage}</b></div>
      <div class="tri21ctl-kpi"><span>В наличии</span><b>${n(w.in_stock)}</b></div>
      <div class="tri21ctl-kpi"><span>TOP-30</span><b>${n(w.top30)}</b></div>
      <div class="tri21ctl-kpi"><span>TOP-60</span><b>${n(w.top60)}</b></div>
      <div class="tri21ctl-kpi"><span>Ошибки текущего/последнего запуска</span><b>${n(errors)}</b></div>
    </div>
    ${mrcHtml(mrc)}
    <div class="tri21ctl-foot"><div class="tri21ctl-meta">
      Рабочий снимок: <b>${esc(w.snapshot_date||'—')}</b> · последний полный успешный сбор: <b>${dt(g.finished_at)}</b> · целей в нём: <b>${n(g.targets)}</b><br>
      TOP проверен: <b>${dt(t.finished_at)}</b>${rq?` · ручной запрос: <b>${rq.status==='claimed'?'выполняется':'в очереди'}</b>`:''}
    </div><div class="tri21ctl-actions">
      <button id="tri21-export-xlsx-v236109" class="btn-secondary" type="button" onclick="window.triovist21vekExportExcelV236109?window.triovist21vekExportExcelV236109():alert('Модуль Excel ещё загружается. Повторите через несколько секунд.')">📥 Выгрузить Excel</button>
      <button class="btn-secondary" type="button" onclick="triovist21vekRefreshStatusV236107()">↻ Проверить свежесть</button>
      ${can?`<button class="btn-primary" type="button" ${reqActive?'disabled':''} onclick="triovist21vekRequestRefreshV236107()">${btnText}</button>`:''}
    </div></div>
    ${can?'<div class="tri21ctl-note"><b>Как читать блок:</b> «Проверить свежесть» только перечитывает статус и время данных. «Запустить обновление 21vek» запускает новый полный сбор. «Выгрузить Excel» скачивает именно текущий рабочий проверенный снимок. При ошибке новый неполный сбор не подменяет рабочие данные.</div>':'<div class="tri21ctl-note"><b>Как читать блок:</b> зелёный — данные рабочие; время выше показывает, когда CRM получила последний проверенный снимок. «Выгрузить Excel» скачивает доступные вам текущие рабочие карточки. При красном/оранжевом статусе CRM сохраняет последний хороший снимок.</div>'}`;
}
async function load(force=false){
  const root=ensurePanel();if(!root)return;
  try{const [d,m]=await Promise.all([status(force),mrcStatus(force)]);render(d,m);}
  catch(e){console.error('21vek control',e);root.classList.remove('state-green','state-amber');root.classList.add('state-red');root.innerHTML='<div class="tri21ctl-error">🚨 Не удалось получить статус собственного парсера 21vek. Данные 21vek сейчас считать неподтверждёнными. Сообщите руководителю и приложите скрин. Техническая ошибка: '+esc(e?.message||e)+'</div>';}
}
window.triovist21vekRefreshStatusV236107=async function(){cache=null;cacheAt=0;mrcCache=null;mrcCacheAt=0;await load(true);};
window.triovist21vekRequestRefreshV236107=async function(){
  try{
    const d=await status(false);if(!d?.can_refresh)return;
    if(!confirm('Запустить полный сбор 21vek по всем карточкам и TOP? Текущий хороший снимок останется рабочим до успешного завершения.'))return;
    const r=await db.rpc('triovist_21vek_request_refresh_v236107',{});if(r?.error)throw r.error;
    cache=null;cacheAt=0;mrcCache=null;mrcCacheAt=0;await load(true);
    const msg=r?.data?.message||'Обновление поставлено в очередь';
    if(typeof showToast==='function')showToast('✅ '+msg);else alert('✅ '+msg);
  }catch(e){alert('Не удалось запустить обновление 21vek: '+(e?.message||e));}
};

const baseRender=window.renderTriovist;
window.renderTriovist=function(){const out=baseRender?.apply(this,arguments);ensurePanel();if(activeTriovist())setTimeout(()=>load(false),0);return out;};
const baseReload=window.triovistReload;
if(typeof baseReload==='function')window.triovistReload=async function(){const out=await baseReload.apply(this,arguments);cache=null;cacheAt=0;mrcCache=null;mrcCacheAt=0;if(activeTriovist())await load(true);return out;};

window.RESANTA_TRIOVIST_21VEK_CONTROL_V236107=Object.freeze({version:VERSION,refresh:()=>load(true),status:()=>status(false),mrc:()=>mrcStatus(false),registrySeparated:true,mrcControl:true});
setTimeout(()=>{if(activeTriovist()){ensurePanel();load(false);}},0);
})();
