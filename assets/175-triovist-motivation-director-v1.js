/* Triovist Motivation Director 360: source-backed UI and approval-only AI sales plan.
 * Existing RPCs triovist_motivation_compare_v236199, triovist_get_dashboard and triovist_set_plan are authoritative.
 * No AI model/LLM call: deterministic legacy 21vek AI-plan recommendation (LY x 1.30, current pace).
 * No automatic writes, policy changes, parser calls, 1C import, or new RPC definitions.
 */
(function(w){
'use strict';
if(w.RESANTA_TRIOVIST_MOTIVATION_DIRECTOR_V1)return;
const VERSION='2026.11.05.1',ID='trmot175-css';
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
let reportMonth='',planMonth='',last=null,nonce=0,saving=false,loading=false,status='',error='';
const key=(month,manager)=>month+'|'+manager;
function css(){
 if(document.getElementById(ID))return;
 const st=document.createElement('style');st.id=ID;st.textContent=[
 '#tri-mot-compare-v236200.trmot175{background:#f8fafd!important;border:1px solid #dce6f1!important;border-radius:14px!important;padding:15px!important}',
 '#tri-mot-compare-v236200 .trmot-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:11px 0}',
 '#tri-mot-compare-v236200 .trmot-kpi{padding:12px;border:1px solid #dbe5f0;background:white;border-radius:11px;min-width:0}',
 '#tri-mot-compare-v236200 .trmot-kpi small{display:block;font-size:10px;color:#71849b;line-height:1.4;min-height:28px}',
 '#tri-mot-compare-v236200 .trmot-kpi b{display:block;font-size:20px;margin:6px 0;color:#1a557f;overflow-wrap:anywhere}',
 '#tri-mot-compare-v236200 .trmot-kpi p{font-size:10px;color:#8594a7;margin:0}',
 '#tri-mot-compare-v236200 .trmot-panel{border:1px solid #dce6f0;background:white;border-radius:11px;padding:14px;margin:11px 0}',
 '#tri-mot-compare-v236200 .trmot-panel h4{font-size:14px;color:#164b78;margin:0 0 9px}',
 '#tri-mot-compare-v236200 .trmot-brief{border-color:#cbdcf3;background:linear-gradient(125deg,#edf5ff,#fff)}',
 '#tri-mot-compare-v236200 .trmot-brief p{font-size:11px;color:#4e6680;line-height:1.6;margin:5px 0}',
 '#tri-mot-compare-v236200 .trmot-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:11px 0}',
 '#tri-mot-compare-v236200 .trmot-manager{border:1px solid #dce5ef;background:white;border-radius:12px;padding:13px;min-width:0}',
 '#tri-mot-compare-v236200 .trmot-manager-head{display:flex;justify-content:space-between;align-items:start;gap:8px;flex-wrap:wrap}',
 '#tri-mot-compare-v236200 .trmot-manager h4{font-size:14px;color:#254461;margin:0}',
 '#tri-mot-compare-v236200 .trmot-rate{font-size:25px;color:#176aab;font-weight:850}',
 '#tri-mot-compare-v236200 .trmot-parts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:11px 0}',
 '#tri-mot-compare-v236200 .trmot-part{background:#f5f8fc;padding:10px;border-radius:9px}',
 '#tri-mot-compare-v236200 .trmot-part small{font-size:10px;color:#75869d;display:block}',
 '#tri-mot-compare-v236200 .trmot-part b{font-size:13px;color:#294763;display:block;margin-top:6px}',
 '#tri-mot-compare-v236200 .trmot-note{font-size:10px;color:#70839c;line-height:1.55;margin:5px 0}',
 '#tri-mot-compare-v236200 .trmot-warn{border:1px solid #eed4ab;background:#fff8ed;border-radius:9px;color:#8f5d24;padding:10px;font-size:11px;line-height:1.55;margin:9px 0}',
 '#tri-mot-compare-v236200 .trmot-error{border:1px solid #f0a9af;background:#fff4f4;border-radius:9px;color:#9c2a34;padding:10px;font-size:11px;line-height:1.6;margin:9px 0}',
 '#tri-mot-compare-v236200 .trmot-success{border:1px solid #a4d7bd;background:#ecfaf3;border-radius:9px;color:#176b48;padding:10px;font-size:11px;line-height:1.5;margin:9px 0}',
 '#tri-mot-compare-v236200 .trmot-track{height:10px;border-radius:9px;background:#e9eef5;margin:6px 0 11px;overflow:hidden}',
 '#tri-mot-compare-v236200 .trmot-fill{height:100%;background:#3689c8;border-radius:9px}',
 '#tri-mot-compare-v236200 .trmot-fill.previous{background:#9aafc6}',
 '#tri-mot-compare-v236200 .trmot-barlabel{display:flex;justify-content:space-between;gap:8px;color:#59728b;font-size:11px}',
 '#tri-mot-compare-v236200 .trmot-editor{border:1px solid #cbdff2;border-radius:12px;background:#f2f7ff;padding:13px;margin:12px 0}',
 '#tri-mot-compare-v236200 .trmot-editor h4{font-size:14px;color:#174a78;margin:0 0 9px}',
 '#tri-mot-compare-v236200 .trmot-options{display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin:10px 0}',
 '#tri-mot-compare-v236200 .trmot-options label{font-size:10px;color:#627c94;display:block;margin-bottom:4px}',
 '#tri-mot-compare-v236200 .trmot-options input{border:1px solid #c9d8e7;border-radius:8px;padding:8px;background:white;color:#29455f;font-size:11px}',
 '#tri-mot-compare-v236200 .trmot-editor input[data-trmot-input]{display:block;border:1px solid #cbd9e9;border-radius:8px;padding:9px 10px;font-size:13px;max-width:100%;width:100%;background:white;margin:7px 0}',
 '#tri-mot-compare-v236200 .trmot-editor input:disabled{background:#eef0f5;color:#8291a5}',
 '#tri-mot-compare-v236200 .trmot-btn{border:1px solid #a9cbe9;border-radius:8px;background:white;color:#175d9a;padding:9px 12px;font-size:11px;font-weight:800;cursor:pointer}',
 '#tri-mot-compare-v236200 .trmot-btn.primary{background:#1d6eae;color:white;border-color:#1d6eae}',
 '#tri-mot-compare-v236200 .trmot-btn:disabled{opacity:.5;cursor:not-allowed}',
 '#tri-mot-compare-v236200 .trmot-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:11px 0}',
 '#tri-mot-compare-v236200 details.trmot-details{margin:10px 0;border:1px solid #cbdff1;background:#f1f7ff;padding:12px;border-radius:10px}',
 '#tri-mot-compare-v236200 details.trmot-details summary{cursor:pointer;font-size:11px;font-weight:800;color:#175b97}',
 '#tri-mot-compare-v236200 details.trmot-details>div{font-size:11px;line-height:1.6;padding-top:9px;color:#526c86}',
 '@media(max-width:950px){#tri-mot-compare-v236200 .trmot-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}',
 '@media(max-width:680px){#tri-mot-compare-v236200 .trmot-grid{grid-template-columns:1fr}}'
 ].join('\n');document.head.appendChild(st);
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
  if(hub?.sales)data=await hub.sales(args);
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
 const rows=(data.items||[]).filter(x=>String(x.manager_email||'').toLowerCase()===manager);
 const current=rows.reduce((sum,r)=>sum+Math.max(0,num(r.current_revenue)),0);
 const prior=rows.reduce((sum,r)=>sum+Math.max(0,num(r.previous_revenue)),0);
 const monthsLoaded=new Set(data.available_months||[]);
 const priorMonth=shift(month,-12),prevReliable=monthsLoaded.has(priorMonth)&&prior>0;
 const today=String(w.TODAY||new Date().toISOString().slice(0,10));
 const day=Math.max(1,Math.min(31,Number(today.slice(8,10))||1));
 const totalDays=new Date(+month.slice(0,4),+month.slice(5,7),0).getDate();
 // The historical AI-plan rule was max(last-year-same-month * 1.30, current month run-rate), rounded to 1,000 BYN.
 const currentMonthEvidence=month===currentMonth()&&monthsLoaded.has(month)&&current>0;
 const pace=currentMonthEvidence?current/Math.min(day,totalDays)*totalDays:null;
 const floor=prevReliable?prior*1.30:null;
 if(floor===null&&pace===null)return null;
 const amount=Math.ceil(Math.max(floor||0,pace||0)/1000)*1000;
 if(!(amount>0))return null;
 return {manager,month,amount,current,prior:prevReliable?prior:null,floor,pace,
  monthsUsed:[...(prevReliable?[priorMonth]:[]),...(currentMonthEvidence?[month]:[])],
  recentImport:ym(data.last_import?.month||''),
  reliable:prevReliable&&currentMonthEvidence?'два источника сравнения':'ограниченная история'};
}
function recommendationCards(month){
 const rec=recommendations.get(month);
 if(!rec)return '<div class="trmot-note">ИИ ещё не рассчитал предложение. Начисления и планы не изменяются автоматически.</div>';
 if(rec.loading)return '<div class="trmot-note">Анализирую загруженную историю продаж и сезонность…</div>';
 if(rec.error)return '<div class="trmot-error">'+esc(rec.error)+'</div>';
 return '<div class="trmot-grid">'+MANAGERS.map(m=>{
  const r=rec.data?.[m.email];
  return '<div class="trmot-manager"><h4>'+esc(m.name)+'</h4>'+
   (r?'<div class="trmot-rate">'+money(r.amount)+'</div><p class="trmot-note">Аналогичный месяц: '+(r.prior===null?'нет подтверждённых данных':money(r.prior))+
   ' · ориентир +30%: '+(r.floor===null?'нет данных':money(r.floor))+
   ' · прогноз текущего месяца: '+(r.pace===null?'нет данных':money(r.pace))+'.</p>'+
   '<p class="trmot-note">Источники: '+esc(r.monthsUsed.join(', '))+'. Достоверность: '+esc(r.reliable)+'.</p>':
   '<p class="trmot-note">Недостаточно подтверждённой истории для расчёта. Установите план вручную после анализа данных.</p>')+'</div>';
 }).join('')+'</div><div class="trmot-warn">Это алгоритмическая ИИ-рекомендация по прежней методике CRM, а не утверждённый план и не гарантия продаж. Не учитывает автоматически будущие договорённости с клиентом и ограничения по товару.</div>';
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
 return '<section class="trmot-editor"><h4>🤖 ИИ · Рассчитать план продаж</h4>'+
 '<p class="trmot-note">ИИ предлагает суммы по истории, сезонности и темпу продаж. Ты проверяешь, при необходимости меняешь и только потом утверждаешь.</p>'+
 '<div class="trmot-options"><div><label for="trmot-plan-month">Месяц плана (не месяц отчёта)</label>'+
 '<input type="month" id="trmot-plan-month" data-trmot-month value="'+esc(month)+'" min="2026-08" max="'+esc(shift(currentMonth(),2))+'"/></div>'+
 '<div class="trmot-note">'+esc(snapshotStatus(month))+'</div></div>'+
 (locked?'<div class="trmot-warn">Прошлый месяц — только просмотр: архивные планы не переписываются из этого экрана.</div>':'')+
 '<div class="trmot-grid">'+form+'</div>'+
 '<div class="trmot-actions">'+
 '<button type="button" class="trmot-btn" data-trmot-calc '+(locked||saving||!allow?'disabled':'')+'>✨ ИИ · Рассчитать планы</button>'+
 '<button type="button" class="trmot-btn" data-trmot-use '+(!recommendations.get(month)?.data||locked||saving?'disabled':'')+'>Подставить предложение ИИ</button>'+
 '<button type="button" class="trmot-btn primary" data-trmot-save '+(locked||saving||!s||!allow?'disabled':'')+'>'+(saving?'Сохраняю…':'Утвердить и сохранить')+'</button></div>'+
 recommendationCards(month)+(error?'<div class="trmot-error">'+esc(error)+'</div>':'')+
 (status?'<div class="trmot-success">'+esc(status)+'</div>':'')+'</section>';
}
function managerCard(row,previous,planSnapshot){
 const amount=planSnapshot? snapshotAmount(planSnapshot,String(row.manager_email||'').toLowerCase()):null;
 const known=!!planSnapshot;
 const planStatus=!known?'Проверяю план…':amount===null?'План не задан':money(amount);
 const planPercent=!known?'Проверяется':amount===null?'Не задан':amount>0?pct(num(row.fact)/amount*100):'План 0 BYN';
 const ratePart=(label,val,sub)=>'<div class="trmot-part"><small>'+label+'</small><b>'+rate(val)+'</b><div class="trmot-note">'+esc(sub)+'</div></div>';
 const delta=pp(row.total_rate,previous?.total_rate);
 return '<article class="trmot-manager"><div class="trmot-manager-head"><div><h4>'+esc(row.manager_name||'Менеджер')+'</h4><p class="trmot-note">Продажи: '+money(row.fact)+' · план: '+planStatus+'</p></div><div style="text-align:right"><div class="trmot-rate">'+rate(row.total_rate)+'</div><div class="trmot-note">К прошлому месяцу: '+delta+'</div></div></div>'+
 '<p class="trmot-note">Выполнение плана: <b>'+planPercent+'</b> · динамика г/г: <b>'+pct(row.growth_pct)+'</b>. '+(ym(row.month)===currentMonth()?'Месяц не завершён: сравнение с полным прошлым годом предварительное.':'Фактический закрытый период.')+'</p>'+
 '<div class="trmot-parts">'+ratePart('Выполнение плана',row.plan_rate,planPercent)+ratePart('Рост к прошлому году',row.growth_rate,pct(row.growth_pct))+
 ratePart('Подтверждённые задачи',row.task_rate,pct(row.task_score))+ratePart('Общий результат',row.team_rate,pct(row.team_pct))+'</div>'+
 '<details class="trmot-details"><summary>▤ Расшифровка премии и сравнение</summary><div>Базовая ставка: '+rate(row.base_rate)+'. Надбавки рассчитывает штатная функция CRM; экран их не пересчитывает. Текущий итог: '+rate(row.total_rate)+'. Предыдущий месяц: '+(previous?rate(previous.total_rate):'нет данных')+'. Изменение: '+delta+'.</div></details></article>';
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
 const kpi=(label,v,sub)=>'<div class="trmot-kpi"><small>'+label+'</small><b>'+v+'</b><p>'+sub+'</p></div>';
 const cards='<div class="trmot-kpis">'+
 kpi('Базовая ставка',rate(cur[0].base_rate),'Не уменьшается')+
 kpi('Дополнительный KPI','до 0,50%','По действующей политике')+
 kpi('Текущая ставка',rmin===rmax?rate(rmin):rate(rmin)+' – '+rate(rmax),'Предварительно')+
 kpi('Планы на месяц',approved===null?'Проверяю…':approved+' / '+cur.length,'Сохранённые суммы')+'</div>';
 const missing=source?cur.filter(x=>snapshotAmount(source,String(x.manager_email||'').toLowerCase())===null):[];
 const brief='<section class="trmot-panel trmot-brief"><h4>✨ Короткий директорский брифинг</h4><p>'+
 (source&&missing.length?'Планы не установлены: '+missing.map(x=>esc(x.manager_name||'менеджер')).join(', ')+'. ':'')+
 (ym(month)===currentMonth()?'Месяц ещё не завершён. Годовую динамику не считать окончательным итогом. ':'')+
 'Проверьте выполнение плана, подтверждённые задачи и общий результат. Основание каждой надбавки показано в карточках менеджеров.</p>'+
 '<p>Ставки и четыре составляющие премии — из действующей функции расчёта CRM. ИИ предлагает только сумму плана и не влияет на премию до утверждения.</p></section>';
 const owner=planMonth||month;
 const editorHtml=isBoss()?editor(owner):'<div class="trmot-panel"><h4>План продаж</h4><p class="trmot-note">Утверждённые суммы видны в карточке. Изменять планы могут только руководители.</p></div>';
 area.innerHTML=cards+brief+editorHtml+'<div class="trmot-grid">'+cur.map(x=>managerCard(x,previous.find(y=>y.manager_email===x.manager_email),source)).join('')+'</div>'+
 comparisonChart(cur,previous)+
 '<details class="trmot-details"><summary>▤ Методика начисления премии и источник данных</summary><div>1,50% базовая ставка + четыре KPI в пределах действующего лимита 0,50%. Подтверждённые задачи, продажи и командные показатели рассчитывает штатная серверная функция. Изменение ставки — в п.п. План создаёт руководитель после проверки рекомендации. Никаких автоматических корректировок закрытых месяцев.</div></details>';
 bind(host);
 const c=sourceCache.get(month);
 if(!c?.data&&!c?.flight)loadSource(month);
 if(isBoss()&&owner!==month&&!sourceCache.get(owner)?.data&&!sourceCache.get(owner)?.flight)loadSource(owner);
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
  if(ev.target.closest?.('[data-trmot-calc]')){generate();return}
  if(ev.target.closest?.('[data-trmot-use]')){apply();return}
  if(ev.target.closest?.('[data-trmot-save]')){save();return}
 });
}
async function generate(){
 if(!isBoss()||!active()||saving||loading||planMonth<currentMonth()||planMonth>shift(currentMonth(),2))return false;
 const month=planMonth,token=++nonce;loading=true;recommendations.set(month,{loading:true});error='';status='';refresh();
 try{
  const data=await fetchSnapshot(month,true);
  if(token!==nonce||month!==planMonth)return false;
  const rec=Object.fromEntries(MANAGERS.map(x=>[x.email,forecast(data,month,x.email)]));
  const count=Object.values(rec).filter(Boolean).length;
  if(!count)throw Error('Недостаточно подтверждённой истории продаж для обоих менеджеров. Укажите планы вручную или проверьте загрузки 1С.');
  recommendations.set(month,{data:rec,calculatedAt:Date.now()});status='ИИ подготовил '+count+' рекомендации. Ничего не сохранено.';
  return true;
 }catch(e){if(token===nonce&&month===planMonth){recommendations.set(month,{error:e?.message||String(e)})}return false}
 finally{loading=false;if(token===nonce)refresh()}
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
 version:VERSION,paint:render,forecast,parseAmount,sourcePlan:snapshotAmount,readOnlyPayroll:true,
 existingPlanRpc:true,manualApproval:true,noAutoSave:true,noNewDatabaseObjects:true,
 getState:()=>({reportMonth,planMonth,saving,error,status})
});
})(window);
