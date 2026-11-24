/* Triovist Motivation Director 360: source-backed UI and approval-only AI sales plan.
 * Existing RPCs triovist_motivation_compare_v236199, triovist_get_dashboard and triovist_set_plan are authoritative.
 * Demand preview is calculated by the existing server RPC from closed sales periods and seasonality.
 * No automatic writes, policy changes, parser calls, 1C import, or new RPC definitions.
 */
(function(w){
'use strict';
if(w.RESANTA_TRIOVIST_MOTIVATION_DIRECTOR_V1)return;
const VERSION='2026.11.23.2-closed-baseline',ID='trmot175-css';
const MANAGERS=[{email:'aleksandrenko_av@resanta.ru',name:'Александренко'},{email:'krishtal_na@resanta.ru',name:'Кришталь'}];
const BOSSES=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const num=v=>finite(v)??0;
const money=v=>finite(v)==null?'—':num(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const rate=v=>finite(v)==null?'—':(num(v)*100).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+'%';
const pct=v=>finite(v)==null?'—':num(v).toLocaleString('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
const pp=(a,b)=>b==null?'Нет сравнения':(num(a)-num(b)>=0?'+':'')+((num(a)-num(b))*100).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' п.п.';
const ym=v=>String(v||'').slice(0,7);
const currentMonth=()=>ym(String(w.TODAY||new Date().toISOString().slice(0,10)));
const shift=(m,n)=>{const y=+m.slice(0,4),mm=+m.slice(5,7);const d=new Date(y,mm-1+n,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')};
const months=['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
const mlabel=m=>months[(+m.slice(5,7)||1)-1]+' '+m.slice(0,4);
const profile=()=>{try{return typeof currentProfile!=='undefined'&&currentProfile?currentProfile:w.currentProfile||{}}catch(_){return w.currentProfile||{}}};
const email=()=>String(profile().email||'').toLowerCase().trim();
const isBoss=()=>profile().role==='boss'&&BOSSES.has(email());
const isManager=()=>profile().access_scope==='triovist'&&profile().role==='manager'&&MANAGERS.some(x=>x.email===email());
const active=()=>document.getElementById('page-triovist')?.classList.contains('active')&&document.querySelector('#tr14-shell [data-tr14].on')?.dataset?.tr14==='motivation';
const dbx=()=>{try{return typeof db!=='undefined'?db:w.db}catch(_){return w.db}};
const sourceCache=new Map(),drafts=new Map(),recommendations=new Map();
let reportMonth='',planMonth='',last=null,nonce=0,saving=false,loading=false,status='',error='',actor='';
const key=(month,manager)=>month+'|'+manager;
function css(){
 if(document.getElementById(ID))return;
 const st=document.createElement('style');st.id=ID;st.textContent=[
 '#tri-mot-compare-v236200.trmot175{background:var(--bg)!important;border:1px solid var(--border)!important;border-radius:12px!important;padding:16px!important;color:var(--text)}',
 '#tri-mot-compare-v236200 .trmot-head,#tri-mot-compare-v236200 .trmot-manager-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}',
 '#tri-mot-compare-v236200 .trmot-head h2{margin:0;font-size:25px;line-height:1.2;font-weight:700;letter-spacing:-.6px}',
 '#tri-mot-compare-v236200 .trmot-title{display:flex;gap:8px;align-items:center;position:relative;max-width:100%}',
 '#tri-mot-compare-v236200 .trmot-controls,#tri-mot-compare-v236200 .trmot-options,#tri-mot-compare-v236200 .trmot-actions{display:flex;align-items:end;gap:8px;flex-wrap:wrap}',
 '#tri-mot-compare-v236200 :is(.trmot-controls,.trmot-options) label{display:grid;gap:5px;color:var(--sub);font-size:14px}',
 '#tri-mot-compare-v236200 :is(select,input){box-sizing:border-box;max-width:100%;min-height:44px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);font:inherit;font-size:15px}',
 '#tri-mot-compare-v236200 .trmot-editor input[data-trmot-input]{display:block;width:100%;margin:6px 0 0}',
 '#tri-mot-compare-v236200 :is(button,select,input,summary):focus-visible{outline:2px solid var(--a);outline-offset:2px}',
 '#tri-mot-compare-v236200 :is(.trmot-panel,.trmot-editor,.trmot-manager){border:1px solid var(--border);background:var(--card);border-radius:12px;padding:16px;min-width:0}',
 '#tri-mot-compare-v236200 :is(.trmot-panel,.trmot-editor){margin:12px 0}',
 '#tri-mot-compare-v236200 :is(.trmot-panel,.trmot-editor,.trmot-manager) h4{font-size:16px;color:var(--text);margin:0}',
 '#tri-mot-compare-v236200 .trmot-panel h4{margin-bottom:12px}',
 '#tri-mot-compare-v236200 .trmot-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:12px 0}',
 '#tri-mot-compare-v236200 .trmot-rate{font-size:25px;color:var(--a);font-weight:650;font-variant-numeric:tabular-nums}',
 '#tri-mot-compare-v236200 .trmot-note{font-size:14px;color:var(--sub);line-height:1.5}',
 '#tri-mot-compare-v236200 .trmot-note{margin:5px 0}',
 '#tri-mot-compare-v236200 .trmot-warn,#tri-mot-compare-v236200 .trmot-error,#tri-mot-compare-v236200 .trmot-success{border:1px solid var(--border);border-radius:9px;padding:10px 12px;font-size:14px;line-height:1.5;margin:9px 0}',
 '#tri-mot-compare-v236200 .trmot-warn{background:var(--amb);color:var(--am)}',
 '#tri-mot-compare-v236200 .trmot-error{background:var(--rb);color:var(--r)}',
 '#tri-mot-compare-v236200 .trmot-success{background:var(--gb);color:var(--g)}',
 '#tri-mot-compare-v236200 .trmot-track{height:8px;border-radius:6px;background:var(--bg);margin:6px 0 11px;overflow:hidden}',
 '#tri-mot-compare-v236200 .trmot-fill{height:100%;background:var(--a);border-radius:6px}',
 '#tri-mot-compare-v236200 .trmot-fill.previous{background:var(--sub);opacity:.5}',
 '#tri-mot-compare-v236200 .trmot-barlabel{display:flex;justify-content:space-between;gap:8px;color:var(--sub);font-size:14px}',
 '#tri-mot-compare-v236200 .trmot-editor .trmot-manager{background:var(--bg)}',
 '#tri-mot-compare-v236200 .trmot-options,#tri-mot-compare-v236200 .trmot-actions{margin-top:12px}',
 '#tri-mot-compare-v236200 .trmot-btn{min-height:44px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--text);padding:8px 12px;font:inherit;font-size:14px;font-weight:550;cursor:pointer}',
 '#tri-mot-compare-v236200 .trmot-btn:not(:disabled):hover{background:var(--bg)}',
 '#tri-mot-compare-v236200 .trmot-btn.primary,#tri-mot-compare-v236200 .trmot-btn.primary:not(:disabled):hover{background:var(--a);color:white;border-color:var(--a)}',
 '#tri-mot-compare-v236200 :is(button,input):disabled{opacity:.55;cursor:not-allowed}',
 '#tri-mot-compare-v236200 details.trmot-details{margin:10px 0;border:1px solid var(--border);background:var(--card);padding:11px 14px;border-radius:10px}',
 '#tri-mot-compare-v236200 details.trmot-details summary{cursor:pointer;font-size:14px;font-weight:600;color:var(--a)}',
 '#tri-mot-compare-v236200 details.trmot-details>div{font-size:14px;line-height:1.55;padding-top:9px;color:var(--sub)}',
 '#tri-mot-compare-v236200 .trmot-help{display:inline-flex}',
 '#tri-mot-compare-v236200 .trmot-help button{width:32px;height:32px;border:1px solid var(--border);border-radius:8px;color:var(--a);background:var(--card);font:inherit;font-size:17px;font-weight:700;cursor:pointer}',
 '#tri-mot-compare-v236200 .trmot-tip{display:none;pointer-events:none;position:absolute;top:calc(100% + 5px);left:0;z-index:8;width:min(380px,calc(100vw - 64px));box-sizing:border-box;padding:10px 12px;border:1px solid var(--border);border-radius:9px;background:var(--card);color:var(--text);font-size:13px;line-height:1.5;box-shadow:0 6px 18px #17212f1a}',
 '#tri-mot-compare-v236200 .trmot-tip span{display:block;margin-top:4px}',
 '#tri-mot-compare-v236200 .trmot-manager{position:relative}',
 '#tri-mot-compare-v236200 .trmot-manager-head .trmot-title{position:static}',
 '#tri-mot-compare-v236200 .trmot-manager-head .trmot-tip{top:calc(100% - 8px);left:16px;width:min(380px,calc(100% - 32px))}',
 '#tri-mot-compare-v236200 .trmot-help:is(:hover,:focus-within) .trmot-tip{display:block}',
 '@media(max-width:680px){#tri-mot-compare-v236200 .trmot-grid{grid-template-columns:1fr}#tri-mot-compare-v236200 .trmot-head h2{font-size:22px}}'
 ].join('\n');document.head.appendChild(st);
}
function help(id,label,content){
 return '<span class="trmot-help"><button type="button" aria-label="'+esc(label)+'" aria-describedby="'+id+'">*</button>'+
 '<span class="trmot-tip" id="'+id+'" role="tooltip">'+content+'</span></span>';
}
function reportHelp(){
 css();
 return help('trmot-report-tip','Как считаются бонусы и планы',
  'Месяц и сравнение с предыдущим месяцем. Расчёт 1,5% + KPI до 0,5%.<span data-trmot-rates></span>');
}
function snapshotAmount(s,manager){
 const row=(s?.selected_month_plans||[]).find(x=>String(x.manager_email||'').toLowerCase()===manager);
 return row&&finite(row.plan_amount)!==null?num(row.plan_amount):null;
}
function snapshotState(month){const c=sourceCache.get(month);return c?.data||null}
function snapshotStatus(month){const c=sourceCache.get(month);return c?.error?'Ошибка загрузки':c?.data?'Данные проверены':'Проверяю сохранённые планы…'}
async function fetchSnapshot(month,force=false){
 if(!/^\d{4}-\d{2}$/.test(month))throw Error('Некорректный месяц');
 const cached=sourceCache.get(month);
 if(!force&&cached?.data&&Date.now()-cached.at<60000)return cached.data;
 if(!force&&cached?.flight)return cached.flight;
 const flight=(async()=>{
  const hub=w.TRIOVIST_DATA_HUB_V227315;
  const args={p_end_month:month,p_mode:'month',p_start_month:null};
  let data;
  if(!force&&hub?.sales)data=await hub.sales(args);
  else{
   const client=dbx();if(!client?.rpc)throw Error('Соединение с CRM пока недоступно');
   const out=await client.rpc('triovist_get_dashboard',args);
   if(out?.error)throw out.error;data=out?.data;
  }
  if(!data||!Array.isArray(data.items)||ym(data.end_month)!==month)throw Error('Нет достоверной аналитики за '+month);
  sourceCache.set(month,{data,at:Date.now()});return data;
 })();
 sourceCache.set(month,{flight,error:null});
 try{return await flight}
 catch(e){sourceCache.set(month,{error:e?.message||String(e),at:Date.now()});throw e}
}
function parseAmount(v){
 const s=String(v||'').replace(/[\s\u00a0\u202f]/g,'').replace(',','.');
 if(!/^\d+(?:\.\d{1,2})?$/.test(s))return null;
 const x=Number(s);return Number.isSafeInteger(Math.round(x*100))&&x>0&&x<=999999999999?Math.round(x*100)/100:null;
}
function forecast(data,month,manager){
 const row=(data?.managers||[]).find(x=>String(x.email||'').toLowerCase()===manager);
 if(!row||!data?.sources?.history_complete)return null;
 const amount=finite(row.suggested);
 if(amount===null||amount<=0)return null;
 const groups=(data.groups||[]).filter(x=>String(x.manager_email||'').toLowerCase()===manager);
 return {manager,month,amount,
  prior:finite(row.last_year),previousMonth:finite(row.previous_month),
  included:finite(row.included_groups),total:finite(row.total_groups),
  groups,growth:0.15,
  reliable:row.requires_review?'есть неподтверждённые группы':'история и сезонность подтверждены'};
}
function recommendationCards(month){
 const rec=recommendations.get(month);
 if(!rec)return '';
 if(rec.loading)return '<div class="trmot-note" role="status">Проверяю продажи 21vek, свободный остаток, Витебск и сезонность…</div>';
 if(rec.error)return '<div class="trmot-error">'+esc(rec.error)+'</div>';
 const source=rec.sources||{};
 const history=ym(source.last_year_month),baseline=ym(source.baseline_month),calendar=ym(source.calendar_previous_month);
 const fromLastClosed=baseline&&calendar&&baseline!==calendar;
 const periodNote=fromLastClosed?'<p class="trmot-note">База расчёта · '+esc(mlabel(history))+' и '+esc(mlabel(baseline))+
  '. '+esc(mlabel(baseline).replace(/^./,c=>c.toUpperCase()))+' — последний закрытый месяц с данными для расчёта.</p>':'';
 return periodNote+'<div class="trmot-grid">'+MANAGERS.map(m=>{
  const r=rec.data?.[m.email];
  return '<div class="trmot-manager"><h4>'+esc(m.name)+'</h4>'+
   (r?'<div class="trmot-rate">'+money(r.amount)+'</div>'+
   '<p class="trmot-note">'+esc(history?mlabel(history):'Аналогичный месяц прошлого года')+': '+money(r.prior)+
   ' · '+esc(baseline?mlabel(baseline):'предыдущий закрытый месяц')+': '+money(r.previousMonth)+
   ' · рост к прогнозному спросу: +15%.</p>'+
   '<p class="trmot-note">Проверено групп: '+r.included+' из '+r.total+'. '+esc(r.reliable)+'.</p>'+
   '<details class="trmot-details"><summary>Показать формулу, группы и ограничения</summary><div>'+
   'Сезонно скорректированный прогноз = (60% × продажи аналогичного месяца прошлого года + 40% × продажи базового закрытого месяца × сезонный коэффициент) × 1,15. Коэффициент — отношение сезонности планового месяца к базовому, в интервале 0,20–2,50. Чехов указан справочно.'+
   r.groups.map(g=>'<p>'+esc(g.group)+': '+(g.proposed==null?'не хватает данных':money(g.proposed))+
    ' · коэффициент '+(g.season_ratio==null?'—':Number(g.season_ratio).toFixed(2))+
    ' · 21vek свободно '+Number(g.partner_free||0).toLocaleString('ru-RU')+' шт.'+
    ' · Витебск '+Number(g.vitebsk_qty||0).toLocaleString('ru-RU')+' шт.'+
    ' · Чехов справочно '+Number(g.chekhov_qty_reference||0).toLocaleString('ru-RU')+' шт.'+
    ' · '+esc(g.action||'')+'</p>').join('')+'</div></details>':
   '<p class="trmot-note">Для расчёта не хватает подтверждённой истории или сезонного спроса. Никакая сумма автоматически не назначена.</p>')+'</div>';
 }).join('')+'</div>'+
 '<div class="trmot-warn">Это предложение, а не утверждённый план. Даты: 21vek '+esc(source.partner_date||'—')+
 ', Витебск '+esc(source.vitebsk_date||'—')+', Чехов '+esc(source.chekhov_date||'—')+
 '. '+esc(source.transit_warning||'Товар в пути не подтверждён отдельно')+
 '. Неполные группы и отсутствие цены отмечены отдельно. Подстановка не создаёт задач; сохранение только после согласия руководителя.</div>';
}
function editor(month){
 if(!isBoss())return '<div class="trmot-panel"><h4>Утверждённый план продаж</h4><p class="trmot-note">Менеджеру доступен просмотр своего плана. Ввод и утверждение выполняет руководитель.</p></div>';
 const s=snapshotState(month),locked=month<currentMonth(),allow=month>=currentMonth()&&month<=shift(currentMonth(),2);
 const form=MANAGERS.map(m=>{
  const k=key(month,m.email),v=drafts.has(k)?drafts.get(k):snapshotAmount(s,m.email);
  const value=v==null?'':typeof v==='number'?v.toFixed(2):String(v);
  const source=s? snapshotAmount(s,m.email):null;
  return '<div class="trmot-manager"><h4>'+m.name+'</h4><p class="trmot-note">Утверждённый план: '+(s?(source===null?'Не задан':money(source)):'Проверяю…')+'</p>'+
   '<label for="trmot-input-'+m.email.split('@')[0]+'">План руководителя, BYN</label>'+
   '<input id="trmot-input-'+m.email.split('@')[0]+'" data-trmot-input="'+m.email+'" type="text" inputmode="decimal" autocomplete="off" placeholder="Введите сумму, BYN" value="'+esc(value)+'" '+(locked||!allow||saving?'disabled':'')+'/></div>';
 }).join('');
 const rec=recommendations.get(month);
 const explanation='ИИ предлагает суммы по аналогичному месяцу прошлого года и закрытому месяцу с учётом сезонности и целевого роста +15%. Остатки помогают проверить, насколько предложение выполнимо. Руководитель утверждает суммы.'+
  '<span>Месяц плана выбирается отдельно от месяца отчёта. '+esc(snapshotStatus(month))+'.</span>'+
  '<span>'+(rec?'':'ИИ ещё не рассчитал предложение. ')+'Планы и премии не изменяются автоматически.</span>';
 return '<section class="trmot-editor"><div class="trmot-title"><h4>Рассчитать план продаж</h4>'+
 help('trmot-plan-tip','Как рассчитывается и утверждается план',explanation)+'</div>'+
 '<div class="trmot-options"><div><label for="trmot-plan-month">Месяц плана</label>'+
 '<input type="month" id="trmot-plan-month" data-trmot-month value="'+esc(month)+'" min="2026-08" max="'+esc(shift(currentMonth(),2))+'"/></div></div>'+
 (locked?'<div class="trmot-warn">Прошлый месяц — только просмотр: архивные планы не переписываются из этого экрана.</div>':'')+
 '<div class="trmot-grid">'+form+'</div>'+
 '<div class="trmot-actions">'+
 (sourceCache.get(month)?.error?'<button type="button" class="trmot-btn" data-trmot-retry>↻ Повторить проверку планов</button>':'')+
 '<button type="button" class="trmot-btn" data-trmot-calc '+(locked||saving||loading||!allow?'disabled':'')+'>✨ ИИ · Рассчитать планы</button>'+
 '<button type="button" class="trmot-btn" data-trmot-use '+(!recommendations.get(month)?.data||locked||saving?'disabled':'')+'>Подставить предложение ИИ</button>'+
 '<button type="button" class="trmot-btn primary" data-trmot-save '+(locked||saving||loading||!s||!allow?'disabled':'')+'>'+(saving?'Сохраняю…':'Утвердить и сохранить')+'</button></div>'+
 recommendationCards(month)+(error?'<div class="trmot-error">'+esc(error)+'</div>':'')+
 (status?'<div class="trmot-success">'+esc(status)+'</div>':'')+'</section>';
}
function managerCard(row,previous,planSnapshot){
 const amount=planSnapshot? snapshotAmount(planSnapshot,String(row.manager_email||'').toLowerCase()):null;
 const known=!!planSnapshot,failed=!known&&!!sourceCache.get(ym(row.month))?.error;
 const planStatus=failed?'Не удалось проверить план':!known?'Проверяю план…':amount===null?'План не задан':money(amount);
 const planPercent=failed?'Проверка недоступна':!known?'Проверяется':amount===null?'Не задан':amount>0?pct(num(row.fact)/amount*100):'План 0 BYN';
 const delta=pp(row.total_rate,previous?.total_rate);
 const name=row.manager_name||'Менеджер';
 const tip=[
  'Базовая ставка · '+rate(row.base_rate),
  'Выполнение плана · '+planPercent+' · надбавка '+rate(row.plan_rate),
  'Рост к прошлому году · '+pct(row.growth_pct)+' · надбавка '+rate(row.growth_rate),
  'Ход работы по задачам · '+pct(row.task_score)+' · надбавка '+rate(row.task_rate),
  'Общий результат · '+pct(row.team_pct)+' · надбавка '+rate(row.team_rate),
  'К прошлому месяцу · '+delta,
  ym(row.month)===currentMonth()?'Ставка и сравнение за открытый месяц предварительные.':''
 ].filter(Boolean).map(line=>'<span>'+esc(line)+'</span>').join('');
 return '<article class="trmot-manager"><div class="trmot-manager-head"><div><div class="trmot-title"><h4>'+esc(name)+'</h4>'+
 help('trmot-manager-tip-'+MANAGERS.findIndex(manager=>manager.email===String(row.manager_email||'').toLowerCase()),'Расшифровка премии · '+name,tip)+
 '</div><p class="trmot-note">Продажи: '+money(row.fact)+' · план: '+planStatus+'</p></div><div class="trmot-rate">'+rate(row.total_rate)+'</div></div></article>';
}
function comparisonChart(rows,previousRows){
 const max=.02;
 return '<div class="trmot-panel"><h4>Сравнение итоговой ставки с предыдущим месяцем</h4>'+rows.map(r=>{
  const prior=previousRows.find(p=>p.manager_email===r.manager_email),two=(label,val,cls)=>'<div class="trmot-barlabel"><span>'+label+'</span><b>'+rate(val)+'</b></div><div class="trmot-track"><div class="trmot-fill '+cls+'" style="width:'+Math.min(100,Math.max(0,num(val)/max*100)).toFixed(2)+'%"></div></div>';
  return '<div style="margin-bottom:12px"><b>'+esc(r.manager_name||'Менеджер')+'</b>'+
   (prior?two('Предыдущий месяц',prior.total_rate,'previous'):'<p class="trmot-note">Нет данных предыдущего месяца</p>')+
   two('Выбранный месяц',r.total_rate,'')+'</div>';
 }).join('')+'<p class="trmot-note">Шкала от 0 до 2,00%. Разница показана в процентных пунктах.</p></div>';
}
function render(host,month,data){
 if(!active()||!(isBoss()||isManager()))return false;
 const area=host?.querySelector('[data-mbody]');if(!area)return false;
 css();host.classList.add('trmot175');
 if(actor!==email()){
  actor=email();sourceCache.clear();drafts.clear();recommendations.clear();planMonth=month;reportMonth='';error='';status='';nonce++;
 }
 if(reportMonth!==month){reportMonth=month;planMonth=month;error='';status='';nonce++; }
 last={host,month,data};
 const all=Array.isArray(data?.rows)?data.rows:[];
 const cur=all.filter(r=>ym(r.month)===month&&(isBoss()||String(r.manager_email||'').toLowerCase()===email()));
 const priorM=ym(data?.compare_month||shift(month,-1));
 const previous=all.filter(r=>ym(r.month)===priorM&&(isBoss()||String(r.manager_email||'').toLowerCase()===email()));
 if(!cur.length){area.innerHTML='<div class="trmot-warn">Нет подтверждённых данных мотивации для выбранного периода.</div>';return true}
 const source=snapshotState(month);
 const approved=source?cur.filter(x=>snapshotAmount(source,String(x.manager_email||'').toLowerCase())!==null).length:null;
 const rmin=Math.min(...cur.map(x=>num(x.total_rate))),rmax=Math.max(...cur.map(x=>num(x.total_rate)));
 const rates=host.querySelector('[data-trmot-rates]');
 if(rates)rates.innerHTML=[
  ['Базовая ставка',rate(cur[0].base_rate),'Не уменьшается'],
  ['Дополнительный KPI','до 0,50%','По действующей политике'],
  ['Текущая ставка',rmin===rmax?rate(rmin):rate(rmin)+' – '+rate(rmax),month===currentMonth()?'Предварительно':''],
  ['Планы на месяц',approved===null?'Проверяю…':approved+' / '+cur.length,'Сохранённые суммы']
 ].map(([label,value,note])=>'<span>'+esc(label)+' · <b>'+esc(value)+'</b>'+(note?'. '+esc(note):'')+'</span>').join('');
 const owner=planMonth||month;
 const editorHtml=isBoss()?editor(owner):'<div class="trmot-panel"><h4>План продаж</h4><p class="trmot-note">Утверждённые суммы видны в карточке. Изменять планы могут только руководители.</p></div>';
 area.innerHTML=editorHtml+'<div class="trmot-grid">'+cur.map(x=>managerCard(x,previous.find(y=>y.manager_email===x.manager_email),source)).join('')+'</div>'+
 comparisonChart(cur,previous)+
 '<details class="trmot-details"><summary>▤ Методика начисления премии и источник данных</summary><div>1,50% базовая ставка + четыре KPI в пределах действующего лимита 0,50%. Продажи, ход работы по задачам и командные показатели рассчитывает штатная серверная функция. Изменение ставки — в п.п. План создаёт руководитель после проверки рекомендации. Никаких автоматических корректировок закрытых месяцев.</div></details>';
 bind(host);
 const c=sourceCache.get(month);
 if(!c?.data&&!c?.flight&&!c?.error)loadSource(month);
 if(isBoss()&&owner!==month&&!sourceCache.get(owner)?.data&&!sourceCache.get(owner)?.flight&&!sourceCache.get(owner)?.error)loadSource(owner);
 return true;
}
function refresh(){if(last&&active())render(last.host,last.month,last.data)}
function loadSource(month){
 return fetchSnapshot(month).then(()=>{if(last&&(month===last.month||month===planMonth))refresh()})
 .catch(e=>{if(month===planMonth){error='Не удалось проверить сохранённые планы: '+(e?.message||e);refresh()}});
}
function bind(host){
 if(host.dataset.trmot175Bound==='1')return;
 host.dataset.trmot175Bound='1';
 host.addEventListener('input',ev=>{
  const t=ev.target.closest?.('[data-trmot-input]');if(!t||!isBoss())return;
  drafts.set(key(planMonth,t.dataset.trmotInput),t.value);error='';status='';
 });
 host.addEventListener('change',ev=>{
  const t=ev.target.closest?.('[data-trmot-month]');
  if(!t||!isBoss()||!/^\d{4}-\d{2}$/.test(t.value))return;
  if(t.value>shift(currentMonth(),2))return;
  planMonth=t.value;error='';status='';nonce++;refresh();
 });
 host.addEventListener('click',ev=>{
  if(ev.target.closest?.('[data-trmot-retry]')){sourceCache.delete(planMonth);error='';loadSource(planMonth);refresh();return}
  if(ev.target.closest?.('[data-trmot-calc]')){generate();return}
  if(ev.target.closest?.('[data-trmot-use]')){apply();return}
  if(ev.target.closest?.('[data-trmot-save]')){save();return}
 });
}
async function generate(){
 if(!isBoss()||!active()||saving||loading||planMonth<currentMonth()||planMonth>shift(currentMonth(),2))return false;
 const month=planMonth,token=++nonce;loading=true;recommendations.set(month,{loading:true});error='';status='';refresh();
 try{
  await fetchSnapshot(month,true);
  const client=dbx();if(!client?.rpc)throw Error('Нет соединения с CRM');
  const res=await client.rpc('triovist_ai_demand_preview_v20261105',{p_month:month+'-01'});
  if(res?.error)throw res.error;
  const preview=res?.data;
  if(!preview||preview.version!=='uni-demand-20261105-v1'||ym(preview.month)!==month)throw Error('Сервер не подтвердил источник и период предложения Uni AI');
  if(token!==nonce||month!==planMonth)return false;
  const rec=Object.fromEntries(MANAGERS.map(x=>[x.email,forecast(preview,month,x.email)]));
  const count=Object.values(rec).filter(Boolean).length;
  if(!count){
   const src=preview.sources||{};
   const missing=[
    src.last_year_imported===false?ym(src.last_year_month):'',
    src.baseline_imported===false?ym(src.baseline_month):''
   ].filter(Boolean).map(mlabel);
   throw Error(missing.length?'Нет подтверждённых продаж за '+missing.join(' и ')+'.':
    'Для выбранного месяца не хватает подтверждённых продаж или коэффициентов сезонности.');
  }
  recommendations.set(month,{data:rec,sources:preview.sources,calculatedAt:Date.now()});
  status='Uni AI подготовил '+count+' рекомендации по продажам, сезонности и остаткам. Ничего не сохранено.';
  return true;
 }catch(e){if(token===nonce&&month===planMonth){recommendations.set(month,{error:e?.message||String(e)})}return false}
 finally{loading=false;if(recommendations.get(month)?.loading)recommendations.delete(month);refresh()}
}
function apply(){
 if(!isBoss()||saving||planMonth<currentMonth())return false;
 const data=recommendations.get(planMonth)?.data;if(!data)return false;
 for(const m of MANAGERS){const r=data[m.email];if(r)drafts.set(key(planMonth,m.email),r.amount.toFixed(2))}
 error='';status='Рекомендованные суммы подставлены в поля. Можно изменить их. Пока ничего не сохранено.';refresh();return true;
}
async function save(){
 if(!isBoss()||!active()||saving||loading||planMonth<currentMonth()||planMonth>shift(currentMonth(),2))return false;
 const month=planMonth;
 const source=snapshotState(month);
 if(!source){error='Сначала загрузите сведения об утверждённых планах.';refresh();return false}
 const entries=[];
 for(const m of MANAGERS){
  const raw=drafts.has(key(month,m.email))?drafts.get(key(month,m.email)):snapshotAmount(source,m.email);
  const value=parseAmount(raw);
  if(value===null){error='Для '+m.name+' нужно указать положительную сумму BYN (до 2 знаков после запятой).';refresh();return false}
  entries.push({...m,amount:value,expected:snapshotAmount(source,m.email)});
 }
 const changed=entries.filter(x=>x.expected!==x.amount);
 if(!changed.length){status='Планы уже совпадают с сохранёнными. Изменений нет.';error='';refresh();return true}
 if(!w.confirm('Утвердить и сохранить планы на '+month+'?\n'+entries.map(x=>x.name+': '+money(x.amount)+(x.expected!==null?' (было '+money(x.expected)+')':' (новый план)')).join('\n')+'\n\nИИ не сохраняет планы автоматически; эта операция окончательно запишет согласованные суммы.'))return false;
 saving=true;status='';error='';refresh();
 const saved=[];
 try{
  // Fresh read prevents silent overwrite if another leader edited the same period while the form was open.
  const latest=await fetchSnapshot(month,true);
  for(const x of entries)if(snapshotAmount(latest,x.email)!==x.expected)throw Error('План '+x.name+' изменился другим пользователем. Обновите экран и проверьте сумму перед повторным сохранением.');
  const client=dbx();if(!client?.rpc)throw Error('Нет соединения с базой CRM');
  for(const x of changed){
   const result=await client.rpc('triovist_set_plan',{p_manager_email:x.email,p_period_month:month,p_plan_amount:x.amount});
   if(result?.error)throw result.error;
   if(!result?.data?.ok||ym(result.data.period_month)!==month||String(result.data.manager_email||'').toLowerCase()!==x.email)throw Error('Сервер не подтвердил сохранение плана '+x.name);
   saved.push(x.name);
  }
  for(const x of entries)drafts.delete(key(month,x.email));
  sourceCache.delete(month);
  w.TRIOVIST_DATA_HUB_V227315?.invalidate?.('sales');
  status='✅ Планы подтверждены: '+saved.join(', ')+'. '+mlabel(month)+'.';
  // Existing comparison RPC recalculates official KPI; no local payroll formula is introduced.
  await w.RESANTA_SAFE_TRIOVIST_V236200?.refresh?.();
  return true;
 }catch(e){
  error=(saved.length?'Частично сохранено: '+saved.join(', ')+'. ':'Ничего не сохранено. ')+(e?.message||e);
  sourceCache.delete(month);
  return false;
 }finally{saving=false;refresh()}
}
w.RESANTA_TRIOVIST_MOTIVATION_DIRECTOR_V1=Object.freeze({
 version:VERSION,paint:render,reportHelp,forecast,parseAmount,sourcePlan:snapshotAmount,readOnlyPayroll:true,
 existingPlanRpc:true,manualApproval:true,noAutoSave:true,approvedOnly:true,sourceBasedDemand:true,noNewDatabaseObjects:false,
 getState:()=>({reportMonth,planMonth,saving,error,status})
});
})(window);
