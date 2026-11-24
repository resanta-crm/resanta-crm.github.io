/* RESANTA CRM v23.6.403 · TRIOVIST OWN 21VEK CONTROL CENTER
 * Lightweight status/control UI for the production own 21vek parser.
 * Managers get a prominent warning if data is stale, incomplete or the parser fails.
 * One cached status RPC; no card scans in browser; no MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_21VEK_CONTROL_V236403)return;
const VERSION='v23.6.403-parser-workspace',TTL=15000;
let cache=null,cacheAt=0,flight=null,mrcCache=null,mrcCacheAt=0,mrcFlight=null;

function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function dt(v){if(!v)return'—';try{return new Date(v).toLocaleString('ru-RU',{timeZone:'Europe/Minsk',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(_){return String(v);}}
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
  const promotion=d?.promotion||{};
  if(promotion.pending){
    const cardAt=Date.parse(d?.parser?.finished_at||'');
    const topAt=Date.parse(d?.top?.finished_at||'');
    const pairedTopMissing=Number.isFinite(cardAt)&&
      (!Number.isFinite(topAt)||topAt<cardAt);
    if(pairedTopMissing){
      return 'Карточки 21vek собраны, но новый поисковый TOP ещё не прошёл полную проверку. '+
       'Временные ошибки запросов автоматически повторяются с ограничением числа попыток. '+
       'Рабочими остаются последние полностью проверенные данные. '+
       'Карточки: '+dt(d.parser.finished_at)+'; последний успешный TOP: '+dt(d?.top?.finished_at)+'.';
    }
    return String(promotion.error_explain||'Сбор 21vek завершён, но свежий снимок ещё не применён в CRM.');
  }
  const p=d?.parser||{};
  if(String(p.status||'')!=='failed'&&Number(p.errors||0)<=0)return'';
  return String(p.error_explain||p.error_text||'Сбор завершился не полностью. Рабочий снимок не заменён; используются последние проверенные данные.');
}
function activeTriovist(){return document.getElementById('page-triovist')?.classList.contains('active');}
function activeParser(){const b=document.querySelector('#tr14-shell [data-tr14="parser"]');return activeTriovist()&&!!b?.classList.contains('on');}
function injectCss(){
  if(document.getElementById('tri21-control-css-v236107'))return;
  const s=document.createElement('style');s.id='tri21-control-css-v236107';s.textContent=`
  #tri21-control-v236107{margin-bottom:12px;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text)}
  #tri21-control-v236107 *{box-sizing:border-box}
  #tri21-control-v236107 .tri21-workspace-title{font-size:25px;font-weight:700;line-height:1.2;letter-spacing:-.6px;margin:0 0 12px}
  #tri21-control-v236107 [data-tri21-daily]{padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--card)}
  #tri21-control-v236107 .tri21-title{position:relative;display:flex;align-items:center;gap:8px;max-width:100%}
  #tri21-control-v236107 :is(.tri21ctl-head,.tri21ctl-foot,.tri21mrc-head){display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
  #tri21-control-v236107 :is(.tri21ctl-head,.tri21mrc-head) h3{margin:0;font-size:16px;font-weight:650}
  #tri21-control-v236107 .tri21ctl-sub,#tri21-control-v236107 .tri21ctl-note{font-size:14px;color:var(--sub);line-height:1.5}
  #tri21-control-v236107 .tri21ctl-badge,#tri21-control-v236107 .tri21mrc-badge{display:inline-block;border-radius:20px;padding:4px 8px;font-size:13px;font-weight:600;background:var(--bg)}
  #tri21-control-v236107 .tri21ctl-green{background:var(--gb);color:var(--g)}
  #tri21-control-v236107 :is(.tri21ctl-amber,.tri21ctl-queued){background:var(--amb);color:var(--am)}
  #tri21-control-v236107 .tri21ctl-red{background:var(--rb);color:var(--r)}
  #tri21-control-v236107 .tri21ctl-running{background:var(--ab);color:var(--at)}
  #tri21-control-v236107 :is(.tri21ctl-alert,.tri21ctl-error){margin-top:10px;padding:9px 11px;border-radius:8px;font-size:14px;line-height:1.5}
  #tri21-control-v236107 :is(.tri21ctl-alert.red,.tri21ctl-error){background:var(--rb);color:var(--r)}
  #tri21-control-v236107 .tri21ctl-alert.amber{background:var(--amb);color:var(--am)}
  #tri21-control-v236107 :is(.tri21ctl-grid,.tri21mrc-kpi){display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:10px}
  #tri21-control-v236107 :is(.tri21ctl-kpi,.tri21mrc-kpi>div){border:1px solid var(--border);background:var(--bg);border-radius:9px;padding:9px 10px;min-width:0}
  #tri21-control-v236107 :is(.tri21ctl-kpi,.tri21mrc-kpi) b{display:block;font-size:18px;font-variant-numeric:tabular-nums}
  #tri21-control-v236107 :is(.tri21ctl-kpi,.tri21mrc-kpi) span{font-size:13px;color:var(--sub)}
  #tri21-control-v236107 .tri21ctl-foot{margin-top:12px}
  #tri21-control-v236107 .tri21ctl-actions{display:flex;gap:7px;flex-wrap:wrap}
  #tri21-control-v236107 .tri21ctl-actions button{min-height:44px;border-radius:8px;font-size:14px}
  #tri21-control-v236107 .tri21ctl-actions .btn-secondary{border:1px solid var(--border);background:var(--card);color:var(--text)}
  #tri21-control-v236107 .tri21ctl-actions .btn-secondary:hover{background:var(--bg)}
  #tri21-control-v236107 .tri21mrc{margin-top:14px;padding-top:12px;border-top:1px solid var(--border)}
  #tri21-control-v236107 .tri21mrc-details{margin-top:10px}
  #tri21-control-v236107 .tri21mrc-details summary{cursor:pointer;font-size:14px;font-weight:600;color:var(--a)}
  #tri21-control-v236107 .tri21mrc-table{overflow:auto;margin-top:7px;max-height:420px}
  #tri21-control-v236107 .tri21mrc-table table{width:100%;border-collapse:collapse;font-size:14px;min-width:770px}
  #tri21-control-v236107 .tri21mrc-table :is(th,td){padding:8px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top}
  #tri21-control-v236107 .tri21mrc-table th{position:sticky;top:0;background:var(--bg);z-index:1}
  #tri21-control-v236107 .tri21mrc-table td span{font-size:13px;color:var(--sub)}
  #tri21-control-v236107 .tri21mrc-table a{color:var(--a)}
  #tri21-control-v236107 .tri21mrc .good{color:var(--g)}
  #tri21-control-v236107 .tri21mrc .warn{color:var(--am)}
  #tri21-control-v236107 .tri21mrc .bad{color:var(--r)}
  #tri21-control-v236107 .tri21-help{display:inline-flex;flex:none}
  #tri21-control-v236107 .tri21-help button{width:32px;height:32px;border:1px solid var(--border);border-radius:8px;color:var(--a);background:var(--card);font:inherit;font-weight:700;cursor:pointer}
  #tri21-control-v236107 .tri21-tip{box-sizing:border-box;display:none;pointer-events:none;position:absolute;top:calc(100% + 5px);left:0;z-index:8;width:min(440px,calc(100vw - 64px));padding:10px 12px;border:1px solid var(--border);border-radius:9px;background:var(--card);color:var(--text);font-size:14px;line-height:1.5;box-shadow:0 6px 18px #17212f1a}
  #tri21-control-v236107 .tri21-tip>span{display:block;margin:5px 0}
  #tri21-control-v236107 .tri21-help:is(:hover,:focus-within) .tri21-tip{display:block}
  #tri21-control-v236107 :is(button,select,input,summary):focus-visible{outline:2px solid var(--a);outline-offset:2px}
  @media(max-width:900px){#tri21-control-v236107 :is(.tri21ctl-grid,.tri21mrc-kpi){grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;document.head.appendChild(s);
}
function ensurePanel(){
  injectCss();
  const page=document.getElementById('page-triovist');if(!page)return null;
  let root=document.getElementById('tri21-control-v236107');
  if(!root){
    root=document.createElement('div');root.id='tri21-control-v236107';root.className='card tri21ctl';
    const title=document.createElement('h2');title.className='tri21-workspace-title';title.textContent='Парсер 21vek';root.appendChild(title);

    const anchor=document.getElementById('triovist-warning');
    if(anchor?.parentNode===page)page.insertBefore(root,anchor);else page.insertBefore(root,page.firstChild?.nextSibling||null);
  }
  dailyBody(root);
  return root;
}
function dailyBody(root){
  let body=root.querySelector('[data-tri21-daily]');
  if(!body){
    body=document.createElement('section');body.dataset.tri21Daily='';
    body.innerHTML='<p class="tri21ctl-sub" role="status">Загружаю состояние полного сбора…</p>';
    root.insertBefore(body,root.querySelector(':scope > #p176'));
  }
  return body;
}
function help(id,label,lines){
  return '<span class="tri21-help"><button type="button" aria-label="'+esc(label)+'" aria-describedby="'+id+'">*</button>'+
   '<span class="tri21-tip" id="'+id+'" role="tooltip">'+lines.filter(Boolean).map(line=>'<span>'+esc(line)+'</span>').join('')+'</span></span>';
}
async function status(force=false){
  if(!force&&cache&&Date.now()-cacheAt<TTL)return cache;
  if(flight)return flight;
  flight=(async()=>{
    const call=()=>db.rpc('triovist_21vek_status_v236107',{});
    const r=typeof window.crmAuthRetryV236166==='function'?await window.crmAuthRetryV236166(call):await call();
    if(r?.error)throw r.error;
    cache=r?.data||{};cacheAt=Date.now();return cache;
  })().finally(()=>flight=null);
  return flight;
}
async function mrcStatus(force=false){
  if(!force&&mrcCache&&Date.now()-mrcCacheAt<TTL)return mrcCache;
  if(mrcFlight)return mrcFlight;
  mrcFlight=(async()=>{
    const call=()=>db.rpc('triovist_21vek_mrc_dashboard_v236220',{});
    const r=typeof window.crmAuthRetryV236166==='function'?await window.crmAuthRetryV236166(call):await call();
    if(r?.error)throw r.error;
    mrcCache=r?.data||{};mrcCacheAt=Date.now();return mrcCache;
  })().finally(()=>mrcFlight=null);
  return mrcFlight;
}
function money(v){const x=Number(v);return Number.isFinite(x)?x.toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN':'—';}
function pct(v){const x=Number(v);return Number.isFinite(x)?(x>0?'+':'')+x.toFixed(2).replace('.',',')+'%':'—';}
function mrcBadge(row){
  const s=String(row?.status||'');
  if(s==='inactive_below')return'<span class="tri21mrc-badge">⚪ ниже МРЦ, нет в наличии</span>';
  if(s==='critical')return'<span class="tri21mrc-badge bad">🔴 ниже МРЦ</span>';
  if(s==='warning')return'<span class="tri21mrc-badge warn">🟠 ниже МРЦ</span>';
  if(s==='slight')return'<span class="tri21mrc-badge warn">🟡 ниже МРЦ</span>';
  if(s==='above')return'<span class="tri21mrc-badge good">выше МРЦ</span>';
  if(s==='missing_mrc')return'<span class="tri21mrc-badge">⚪ нет МРЦ в файле</span>';
  return'<span class="tri21mrc-badge">МРЦ</span>';
}
function mrcHtml(m){
  const s=m?.summary||{},rows=Array.isArray(m?.rows)?m.rows:[],missing=Array.isArray(m?.missing_mrc_rows)?m.missing_mrc_rows:[];
  const line=rows.length?rows.map(x=>`<tr>
    <td><b>${esc(x.sku||'—')}</b><br><span>${esc(x.product_name||'')}</span></td>
    <td>${money(x.mrc_byn)}</td>
    <td>${money(x.price)}</td>
    <td class="${Number(x.delta_pct)<0?'bad':'good'}"><b>${pct(x.delta_pct)}</b><br><span>${money(x.delta_byn)}</span></td>
    <td>${mrcBadge(x)}</td>
    <td>${esc(x.manager_name||'—')}</td>
    <td>${x.product_url?'<a target="_blank" rel="noopener" href="'+esc(x.product_url)+'">21vek ↗</a>':'—'}</td>
  </tr>`).join(''):'<tr><td colspan="7">Отклонений от МРЦ в последнем полном успешном сборе нет.</td></tr>';
  const missingLine=missing.length?missing.map(x=>`<tr>
    <td><b>${esc(x.sku||'—')}</b><br><span>${esc(x.product_name||'')}</span></td>
    <td>${money(x.price)}</td>
    <td>${x.in_stock===true?'да':x.in_stock===false?'нет':'—'}</td>
    <td>${esc(x.manager_name||'—')}</td>
    <td>${x.product_url?'<a target="_blank" rel="noopener" href="'+esc(x.product_url)+'">21vek ↗</a>':'—'}</td>
  </tr>`).join(''):'';
  const priceSource=m?.price_source==='latest_complete_own_parser'
    ?'цена и наличие — из последнего полного успешного собственного парсера '+dt(m?.price_observed_at)
    :'цена и наличие — из текущего рабочего снимка';
  return `<div class="tri21mrc">
    <div class="tri21mrc-head"><div class="tri21-title"><h3>Отклонения от МРЦ</h3>${help('tri21-mrc-tip','Источник МРЦ и цен',[
      'МРЦ: '+(m?.source_file||'РБ МРЦ')+', действует с '+(m?.effective_date||'—')+'.',
      priceSource+'. Сравнение строго по нашему артикулу.'
    ])}</div></div>
    <div class="tri21mrc-kpi">
      <div><span>МРЦ в файле</span><b>${n(s.mrc_rows)}</b></div>
      <div><span>Карточек с МРЦ</span><b>${n(s.with_mrc)}</b></div>
      <div><span>Ниже МРЦ · в наличии</span><b class="${Number(s.below_mrc_in_stock)>0?'bad':'good'}">${n(s.below_mrc_in_stock)}</b></div>
      <div><span>Ниже МРЦ >5% · в наличии</span><b class="${Number(s.critical_below_mrc)>0?'bad':'good'}">${n(s.critical_below_mrc)}</b></div>
      <div><span>Без МРЦ</span><b>${n(s.missing_mrc)}</b></div>
    </div>
    <details class="tri21mrc-details" data-tri21-mrc-list><summary>Товары с отклонениями · до 120 позиций</summary>
      <div class="tri21mrc-table"><table><thead><tr><th>SKU / товар</th><th>МРЦ</th><th>Цена 21vek</th><th>Отклонение</th><th>Статус</th><th>Менеджер</th><th>Карточка</th></tr></thead><tbody>${line}</tbody></table></div>
    </details>
    ${Number(s.missing_mrc)>0?`<details class="tri21mrc-details" data-tri21-mrc-missing><summary>Без МРЦ в действующем файле: ${n(s.missing_mrc)} · показать первые ${n(missing.length)}</summary>
      <div class="tri21ctl-note" style="margin:7px 0">Эти позиции не считаются нарушением автоматически: сначала нужно подтвердить МРЦ в утверждённом файле.</div>
      <div class="tri21mrc-table"><table><thead><tr><th>SKU / товар</th><th>Цена 21vek</th><th>В наличии</th><th>Менеджер</th><th>Карточка</th></tr></thead><tbody>${missingLine}</tbody></table></div>
    </details>`:''}
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
  const st=dangerState(d),promotion=d?.promotion||{};
  if(promotion.pending)return '<div class="tri21ctl-alert red" role="status">Новый сбор ещё не применён. В CRM доступны данные последнего проверенного снимка.</div>';
  if(st==='red')return '<div class="tri21ctl-alert red" role="status">Последний полный сбор завершился с ошибкой или устарел. Проверьте свежесть перед работой с ценами и остатками.</div>';
  if(st==='amber')return '<div class="tri21ctl-alert amber" role="status">Снимок требует проверки. Сверьте дату сбора перед работой с ценами и остатками.</div>';
  return'';
}
function render(d,mrc){
  const root=ensurePanel();if(!root)return;
  const w=d?.working||{},p=d?.parser||{},g=d?.last_good||{},t=d?.top||{},rq=d?.refresh_request||null,rg=d?.registry||{};
  const [baseLabel,cls]=healthMeta(d?.health);
  const label=d?.promotion?.pending?'🔴 Сбор выполнен · данные не применены':baseLabel;
  const state=dangerState(d);
  root.classList.remove('state-green','state-amber','state-red');root.classList.add('state-'+state);
  const errors=Number(p?.errors||0);
  const verifiedRemoved=Number(w?.verified_removed_urls||0);
  const actualPriceIssues=Number(w?.blocking_price_issues||0);
  const expected=Number(w.cards||0);
  const coverage=expected?n(expected):'—';
  const reqActive=rq&&['queued','claimed'].includes(String(rq.status));
  const can=!!d?.can_refresh;
  const btnText=rq?.status==='claimed'?'⏳ Сбор выполняется':rq?.status==='queued'?'⏱ В очереди':'Запустить полный сбор';
  const workingAt=w.completed_at||null;
  const errText=parserError(d);
  const body=dailyBody(root),opened=['list','missing'].filter(key=>body.querySelector('[data-tri21-mrc-'+key+']')?.open);
  const snapshotHelp=help('tri21-snapshot-tip','Источник и состав рабочего снимка',[
    'Источник рабочих карточек: '+(d?.source_label||'Собственный парсер 21vek')+'.',
    workingAt?'Рабочий снимок собственного парсера: '+dt(workingAt)+' · '+ageText(workingAt)+'.':'Время рабочего снимка не определено.',
    'Карточки: '+n(w.cards)+'; реестр целей: '+n(rg.targets)+'. TOP: '+(t.finished_at?'проверен '+dt(t.finished_at):'нет подтверждённого полного запуска')+'.',
    g.finished_at?'Последний полный успешный сбор: '+dt(g.finished_at)+' · целей: '+n(g.targets)+'.':'',
    verifiedRemoved>0?'Удалённые страницы товаров: '+n(verifiedRemoved)+'. 21vek подтвердил HTTP 404/410. Текущая цена и наличие неизвестны. Эти страницы исключены из проверки действующей цены и не считаются ошибками полного сбора.':'',
    w.blocking_price_issues!=null?'Ошибок цены по рабочим карточкам: '+n(actualPriceIssues)+'.':'',
    errText,
    'Ежедневный сбор карточек и почасовой поиск используют разные снимки и могут охватывать разное число SKU.',
    '«Проверить свежесть» перечитывает статус. Excel выгружает рабочий проверенный снимок.'+(can?' «Запустить полный сбор» ставит новый сбор карточек и TOP в очередь.':'')
  ]);
  body.innerHTML=`
    <div class="tri21ctl-head"><div class="tri21-title"><h3>Ежедневный сбор карточек</h3>${snapshotHelp}</div><span class="tri21ctl-badge ${cls}">${label}</span></div>
    ${warningHtml(d)}
    ${rg.changed_since_last_good?'<div class="tri21ctl-alert amber">Реестр товаров изменился. Для обновления данных нужен полный сбор.</div>':''}
    <div class="tri21ctl-grid">
      <div class="tri21ctl-kpi"><span>Карточки</span><b>${coverage}</b></div>
      <div class="tri21ctl-kpi"><span>В наличии</span><b>${n(w.in_stock)}</b></div>
      <div class="tri21ctl-kpi"><span>В первых 30</span><b>${n(w.top30)}</b></div>
      <div class="tri21ctl-kpi"><span>В первых 60</span><b>${n(w.top60)}</b></div>
      <div class="tri21ctl-kpi"><span>Ошибки текущего/последнего запуска</span><b>${n(errors)}</b></div>
    </div>
    ${mrc?mrcHtml(mrc):'<p class="tri21ctl-alert amber" role="status">Сведения по МРЦ не загрузились. Повторите проверку свежести.</p>'}
    <div class="tri21ctl-foot"><div class="tri21ctl-actions">
      <button id="tri21-export-xlsx-v236109" class="btn-secondary" type="button" onclick="window.triovist21vekExportExcelV236109?window.triovist21vekExportExcelV236109():alert('Модуль Excel ещё загружается. Повторите через несколько секунд.')">Выгрузить Excel</button>
      <button class="btn-secondary" type="button" onclick="triovist21vekRefreshStatusV236107()">Проверить свежесть</button>
      ${can?`<button class="btn-primary" type="button" ${reqActive?'disabled':''} onclick="triovist21vekRequestRefreshV236107()">${btnText}</button>`:''}
    </div></div>`;
  for(const key of opened){
    const details=body.querySelector('[data-tri21-mrc-'+key+']');
    if(details)details.open=true;
  }
}
async function load(force=false){
  const root=ensurePanel();if(!root)return;
  try{
    const [d,m]=await Promise.allSettled([status(force),mrcStatus(force)]);
    if(d.status==='rejected')throw d.reason;
    render(d.value,m.status==='fulfilled'?m.value:null);
  }
  catch(e){console.error('21vek control',e);root.classList.remove('state-green','state-amber');root.classList.add('state-red');dailyBody(root).innerHTML='<div class="tri21ctl-error" role="alert">🚨 Не удалось получить статус собственного парсера 21vek. Данные 21vek сейчас считать неподтверждёнными. Сообщите руководителю и приложите скрин. Техническая ошибка: '+esc(e?.message||e)+'</div>';}
}
window.triovist21vekRefreshStatusV236107=async function(){cache=null;cacheAt=0;mrcCache=null;mrcCacheAt=0;await load(true);};
window.triovist21vekRequestRefreshV236107=async function(){
  try{
    const d=await status(false);if(!d?.can_refresh)return;
    if(!confirm('Запустить полный сбор 21vek по всем карточкам и TOP? Текущий хороший снимок останется рабочим до успешного завершения.'))return;
    const call=()=>db.rpc('triovist_21vek_request_refresh_v236107',{});
    const r=typeof window.crmAuthRetryV236166==='function'?await window.crmAuthRetryV236166(call):await call();
    if(r?.error)throw r.error;
    cache=null;cacheAt=0;mrcCache=null;mrcCacheAt=0;await load(true);
    const msg=r?.data?.message||'Обновление поставлено в очередь';
    if(typeof showToast==='function')showToast('✅ '+msg);else alert('✅ '+msg);
  }catch(e){alert('Не удалось запустить обновление 21vek: '+(e?.message||e));}
};

const baseRender=window.renderTriovist;
window.renderTriovist=function(){const out=baseRender?.apply(this,arguments);ensurePanel();if(activeParser())setTimeout(()=>load(false),0);return out;};
const baseReload=window.triovistReload;
if(typeof baseReload==='function')window.triovistReload=async function(){const out=await baseReload.apply(this,arguments);cache=null;cacheAt=0;mrcCache=null;mrcCacheAt=0;if(activeParser())await load(true);return out;};

const API=Object.freeze({version:VERSION,refresh:()=>load(true),status:()=>status(false),mrc:()=>mrcStatus(false),lazyByActiveTab:true,registrySeparated:true,mrcControl:true,freshMrcFromCompleteRun:true,safePromotionStatus:true});
window.RESANTA_TRIOVIST_21VEK_CONTROL_V236403=API;
window.RESANTA_TRIOVIST_21VEK_CONTROL_V236107=API;
setTimeout(()=>{if(activeParser()){ensurePanel();load(false);}},0);
})();
