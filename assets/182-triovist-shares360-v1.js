/* RESANTA CRM · Triovist Shares 360 · isolated 21vek category baseline and research */
(function(w){
"use strict";
if(w.RESANTA_TRIOVIST_SHARES360_V1)return;
const ID="tri-shares360-v1",CSS="tri-shares360-css",ALEKS="aleksandrenko_av@resanta.ru",KRIS="krishtal_na@resanta.ru";
const OWN=new Set(["ресанта","huter","вихрь","eurolux"]);
const N=x=>Number.isFinite(Number(x))?Number(x):0;
const E=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const usd=x=>"$"+N(x).toLocaleString("ru-RU",{maximumFractionDigits:0});
const compact=x=>Math.abs(N(x))>=1000000?"$"+(N(x)/1e6).toLocaleString("ru-RU",{maximumFractionDigits:2})+" млн":Math.abs(N(x))>=1000?"$"+(N(x)/1e3).toLocaleString("ru-RU",{maximumFractionDigits:1})+" тыс.":usd(x);
const pct=x=>N(x).toLocaleString("ru-RU",{maximumFractionDigits:2})+"%";
const pp=x=>N(x).toLocaleString("ru-RU",{maximumFractionDigits:2})+" п. п.";
const S={host:null,ctx:null,categories:[],brands:[],assignments:[],goals:[],tasks:[],answers:[],selected:"",brand:"all",owner:"all",view:"shares",taskId:"",loading:false,error:"",last:0,evidence:{},evidenceLoading:{}};
const ownerName=e=>e===ALEKS?"Александренко":e===KRIS?"Кришталь":"Не закреплена";
const boss=()=>S.ctx?.is_leader===true;
const me=()=>String(S.ctx?.email||"").toLowerCase();
function database(){try{return typeof db!=="undefined"?db:w.db}catch(_){return w.db}}
function node(){return S.host?.querySelector("#"+ID)}
function css(){
 if(document.getElementById(CSS))return;
 const e=document.createElement("style");e.id=CSS;e.textContent=
 "#"+ID+"{font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#141a32;background:#f9faff;padding:12px;border-radius:16px;font-size:13px}"+
 "#"+ID+" *{box-sizing:border-box}#"+ID+" button,#"+ID+" select,#"+ID+" input,#"+ID+" textarea{font:inherit}"+
 "#"+ID+" button{cursor:pointer}#"+ID+" .sh-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px}"+
 "#"+ID+" h2{font-size:24px;line-height:1.2;margin:0;color:#181630}#"+ID+" .sh-muted{font-size:11px;color:#77829c;line-height:1.5}"+
 "#"+ID+" .sh-tabs{display:flex;gap:6px;flex-wrap:wrap}#"+ID+" .sh-tabs button{border:1px solid #e1dcf7;border-radius:9px;background:white;padding:8px 12px;color:#5a4e84;font-weight:750}"+
 "#"+ID+" .sh-tabs button.on{background:#7351de;color:white;border-color:#7351de}"+
 "#"+ID+" .sh-filters{display:grid;grid-template-columns:repeat(4,minmax(145px,1fr));gap:9px;margin:8px 0 14px}"+
 "#"+ID+" label{display:block;font-size:10px;font-weight:750;color:#66718d;margin-bottom:4px}"+
 "#"+ID+" select,#"+ID+" input,#"+ID+" textarea{width:100%;border:1px solid #dcdff0;background:white;border-radius:9px;padding:8px;color:#253052}"+
 "#"+ID+" textarea{min-height:70px;resize:vertical;line-height:1.45}#"+ID+" select:disabled{opacity:.6}"+
 "#"+ID+" .sh-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin-bottom:12px}"+
 "#"+ID+" .sh-kpi,#"+ID+" .sh-panel{background:white;border:1px solid #e4e7f2;border-radius:14px;box-shadow:0 4px 16px #1a21500a;min-width:0}"+
 "#"+ID+" .sh-kpi{padding:15px;background:linear-gradient(130deg,#faf7ff,#ffffff)}#"+ID+" .sh-kpi:nth-child(2){background:linear-gradient(130deg,#edf9f2,#fff)}#"+ID+" .sh-kpi:nth-child(3){background:linear-gradient(130deg,#f0f5ff,#fff)}"+
 "#"+ID+" .sh-kpi:nth-child(4){background:linear-gradient(130deg,#fff8e8,#fff)}#"+ID+" .sh-kpi strong{display:block;font-size:22px;color:#191934;margin-top:7px;line-height:1.25}"+
 "#"+ID+" .sh-kpi small{display:block;font-size:10px;color:#7d8298;margin-top:5px;line-height:1.3}#"+ID+" .sh-kpi b{font-size:11px;color:#4c3cb2}"+
 "#"+ID+" .sh-grid{display:grid;grid-template-columns:1fr 1.5fr 1.38fr;gap:11px}#"+ID+" .sh-panel{padding:15px}"+
 "#"+ID+" h3{font-size:15px;margin:0 0 11px;color:#28254b}#"+ID+" .sh-ai{background:linear-gradient(150deg,#f5efff,#fcfaff)}"+
 "#"+ID+" .sh-brief{padding:11px;margin:8px 0;background:white;border-radius:12px;border:1px solid #e8e5f5;cursor:pointer;line-height:1.45}#"+ID+" .sh-brief:hover,#"+ID+" .sh-op:hover,#"+ID+" .sh-bar:hover{border-color:#9b8bdf;background:#faf7ff}"+
 "#"+ID+" .sh-brief .num{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:#e8ddff;color:#6941ba;font-weight:800;margin-right:6px}"+
 "#"+ID+" .sh-bar{display:grid;grid-template-columns:minmax(115px,150px) minmax(60px,1fr) 55px;gap:8px;align-items:center;padding:5px;border:1px solid transparent;border-radius:7px;cursor:pointer;font-size:11px}"+
 "#"+ID+" .sh-track{height:12px;border-radius:5px;background:#eeeaf9;overflow:hidden}#"+ID+" .sh-track i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#c8afff,#865ce5)}"+
 "#"+ID+" .sh-op{border:1px solid #edf0f6;border-radius:10px;padding:10px 9px;margin:7px 0;cursor:pointer}"+
 "#"+ID+" .sh-op strong{display:block;font-size:12px}#"+ID+" .sh-op-body{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;margin-top:6px}"+
 "#"+ID+" .sh-op-body span{font-size:10px;color:#6b7489}#"+ID+" .sh-op-body b{display:block;font-size:12px;color:#222341}"+
 "#"+ID+" .sh-bottom{display:grid;grid-template-columns:1.1fr 1fr;gap:11px;margin-top:12px}#"+ID+" .sh-status{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}"+
 "#"+ID+" .sh-state{padding:11px;border-radius:10px;background:#eef6ff}#"+ID+" .sh-state:nth-child(2){background:#fff8e6}#"+ID+" .sh-state:nth-child(3){background:#ebf9ed}#"+ID+" .sh-state:nth-child(4){background:#fff0ef}#"+ID+" .sh-state b{display:block;font-size:20px;margin:4px 0}"+
 "#"+ID+" .sh-note{background:#f7f4ff;border:1px solid #ddd2fc;border-radius:10px;padding:11px;margin:9px 0;line-height:1.55}"+
 "#"+ID+" .sh-evidence{margin:10px 0;background:#f7fbff;border-color:#c7dff4}#"+ID+" .sh-evidence h3{color:#215b87}#"+ID+" .sh-sku-list{max-height:410px;overflow:auto;border:1px solid #dae8f6;border-radius:9px;margin:8px 0}#"+ID+" .sh-sku-row{display:grid;grid-template-columns:minmax(125px,1.6fr) 90px 90px 80px minmax(130px,1.5fr);gap:8px;border-top:1px solid #e5edf6;align-items:start;padding:8px;font-size:11px}#"+ID+" .sh-sku-row:first-child{border-top:0}#"+ID+" .sh-sku-row small{display:block;font-size:10px;color:#667b91;line-height:1.4;margin-top:3px}#"+ID+" .sh-sku-row>span{min-width:0;overflow-wrap:anywhere}@media(max-width:720px){#"+ID+" .sh-sku-row{grid-template-columns:1fr 1fr}#"+ID+" .sh-sku-row>span:last-child{grid-column:1/-1}}"+
 "#"+ID+" .sh-green{color:#217844}#"+ID+" .sh-red{color:#a53232}#"+ID+" .sh-pill{display:inline-block;border-radius:99px;padding:4px 9px;background:#efe8ff;color:#633cb6;font-size:10px;font-weight:800}"+
 "#"+ID+" .sh-primary{background:#7653dc;border-color:#7653dc;color:white}#"+ID+" .sh-button{border:1px solid #cfc9eb;border-radius:9px;padding:9px 13px;font-weight:800;background:white;color:#5f46ac}#"+ID+" .sh-button.sh-primary{background:#7653dc;color:white;border-color:#7653dc}"+
 "#"+ID+" .sh-actions{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0}#"+ID+" .sh-detail{display:grid;grid-template-columns:1.1fr 1fr;gap:10px}#"+ID+" .sh-field{margin:9px 0}"+
 "#"+ID+" .sh-task{border:1px solid #e5e4f4;border-radius:11px;padding:12px;margin:9px 0;background:#fff}#"+ID+" .sh-task.on{border-color:#9477e8;background:#faf8ff}"+
 "#"+ID+" .sh-row{display:flex;justify-content:space-between;gap:9px;flex-wrap:wrap;align-items:center}#"+ID+" .sh-empty{padding:18px;border:1px dashed #c5cfe6;border-radius:11px;color:#64748b;text-align:center;background:white}"+
 "#"+ID+" .sh-message{padding:10px 12px;border-radius:10px;margin:8px 0;background:#fff6e8;border:1px solid #f1d3a3}"+
 "@media(max-width:1330px){#"+ID+" .sh-grid{grid-template-columns:1fr 1.4fr}#"+ID+" .sh-grid>.sh-panel:last-child{grid-column:1/-1}}"+
 "@media(max-width:920px){#"+ID+" .sh-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}#"+ID+" .sh-filters{grid-template-columns:repeat(2,minmax(0,1fr))}#"+ID+" .sh-detail,#"+ID+" .sh-bottom{grid-template-columns:1fr}}"+
 "@media(max-width:620px){#"+ID+" .sh-grid{grid-template-columns:1fr}#"+ID+" .sh-grid>.sh-panel:last-child{grid-column:auto}#"+ID+" .sh-status{grid-template-columns:repeat(2,1fr)}#"+ID+" .sh-kpi strong{font-size:19px}#"+ID+" .sh-bar{grid-template-columns:110px minmax(40px,1fr) 50px}}";
 document.head.appendChild(e);
}
function currentRows(){
 const as=new Map(S.assignments.map(x=>[x.category,x]));
 const by=new Map();
 S.brands.forEach(x=>{if(!by.has(x.category))by.set(x.category,[]);by.get(x.category).push(x)});
 return S.categories.map(x=>{
  const brandRows=by.get(x.category)||[];
  const allOwn=brandRows.filter(b=>OWN.has(String(b.brand).toLowerCase())).reduce((s,b)=>s+N(b.revenue_usd),0);
  const chosenOwn=S.brand==="all"?allOwn:brandRows.filter(b=>String(b.brand).toLowerCase()===S.brand).reduce((s,b)=>s+N(b.revenue_usd),0);
  const market=N(x.market_usd);
  const competitors=brandRows.filter(b=>!OWN.has(String(b.brand).toLowerCase())).sort((a,b)=>N(b.revenue_usd)-N(a.revenue_usd));
  return {category:x.category,market,ours:chosenOwn,allOwn,share:market>0?100*chosenOwn/market:0,assignment:as.get(x.category)||{},competitors,brands:brandRows};
 }).filter(x=>S.owner==="all"||String(x.assignment.manager_email||"")===S.owner)
  .filter(x=>!S.selected||x.category===S.selected);
}
const selectedTask=()=>S.tasks.find(x=>x.id===S.taskId)||null;
const detailTask=t=>t?'<div class="sh-task '+(S.taskId===t.id?'on':'')+'" data-task="'+E(t.id)+'"><div class="sh-row"><strong>'+E(t.title)+'</strong><span class="sh-pill">'+E(statusText(t.status))+'</span></div><div class="sh-muted">'+E(t.category)+' · Срок: '+E(t.due_date||"не задан")+' · '+E(ownerName(t.manager_email))+'</div><div style="margin-top:5px">'+E(t.research_question)+'</div></div>':"";
const statusText=x=>({research:"Исследование",answered:"Ответ менеджера",review:"На проверке",approved:"Согласовано",in_progress:"В работе",effect_check:"Контроль эффекта",done:"Завершено",cancelled:"Отменено"})[x]||x||"—";
function header(){return '<div class="sh-top"><div><h2>Триовист 360° · Доли 21vek</h2><div class="sh-muted">Данные: январь–сентябрь 2026 · USD без НДС · 1 п. п. = 1 процентный пункт</div></div><div class="sh-tabs"><button data-view="shares" class="'+(S.view==="shares"?"on":"")+'">◉ Доли 360°</button><button data-view="tasks" class="'+(S.view==="tasks"?"on":"")+'">◎ Задачи по долям</button><button data-action="reload">↻ Обновить</button></div></div>'}
function filters(){return '<div class="sh-filters"><div><label>Период</label><select disabled><option>Январь–сентябрь 2026</option></select></div><div><label>Бренд</label><select data-filter="brand"><option value="all">Все наши бренды</option>'+["ресанта","huter","вихрь","eurolux"].map(x=>'<option value="'+E(x)+'" '+(S.brand===x?"selected":"")+'>'+E(x==="ресанта"?"Ресанта":x==="вихрь"?"Вихрь":x==="eurolux"?"Eurolux":"Huter")+'</option>').join("")+'</select></div><div><label>Ответственный</label><select data-filter="owner"><option value="all">Все доступные</option>'+[[ALEKS,"Александренко"],[KRIS,"Кришталь"]].map(x=>'<option value="'+x[0]+'" '+(S.owner===x[0]?"selected":"")+'>'+x[1]+'</option>').join("")+'</select></div><div><label>Категория</label><select data-filter="selected"><option value="">Все доступные категории</option>'+S.categories.map(x=>'<option value="'+E(x.category)+'" '+(S.selected===x.category?"selected":"")+'>'+E(x.category)+'</option>').join("")+'</select></div></div>'}
function tiles(rows){
 const market=rows.reduce((a,x)=>a+x.market,0),ours=rows.reduce((a,x)=>a+x.ours,0),share=market?100*ours/market:0;
 const g=S.goals.find(x=>x.category===S.selected&&x.quarter==="2026-Q4");
 const bits=[["Оборот категорий 21vek",compact(market),"9 месяцев · без НДС"],
 ["Наши продажи брендов",compact(ours),S.brand==="all"?"Ресанта · Huter · Вихрь · Eurolux":"Фильтр по выбранному бренду"],
 ["Наша доля",pct(share),"Базовая доля за 9 месяцев"],
 ["Потенциал +1 п. п.",compact(market/100),"Дополнительные продажи 21vek при том же объёме"],
 ["Цель квартала",g?("+"+pp(g.target_pp)):"Не утверждена",g?"Только после согласования":"Не показываем вымышленный план"]];
 return '<div class="sh-kpis">'+bits.map(x=>'<div class="sh-kpi"><b>'+E(x[0])+'</b><strong>'+E(x[1])+'</strong><small>'+E(x[2])+'</small></div>').join("")+'</div>';
}
function briefing(rows){
 const tasks=S.tasks.filter(t=>!["done","cancelled"].includes(t.status)).slice(0,3);
 const ranked=[...rows].sort((a,b)=>(b.market-b.allOwn)-(a.market-a.allOwn)).slice(0,3);
 let items=tasks.length?tasks.map(t=>({category:t.category,title:t.title,desc:t.research_question})):ranked.map(x=>({category:x.category,title:x.category+" · "+pct(x.share),desc:"Проверить подгруппы, цены, листинг и ассортимент. Доля рассчитана по данным Excel."}));
 return '<div class="sh-panel sh-ai"><h3>✦ ИИ · Утренний брифинг</h3><div class="sh-muted">Три приоритета · факты из выгрузки · поручения в отдельных задачах</div>'+items.map((x,i)=>'<div class="sh-brief" data-cat="'+E(x.category)+'"><span class="num">'+(i+1)+'</span><b>'+E(x.title)+'</b><div class="sh-muted" style="padding-left:30px">'+E(x.desc)+'</div></div>').join("")+(items.length?"":'<div class="sh-empty">Новых исследований нет.</div>')+'</div>';
}
function chart(rows){
 const display=[...rows].sort((a,b)=>a.share-b.share);const max=Math.max(40,...display.map(x=>x.share));
 return '<div class="sh-panel"><h3>Доля по категориям</h3><div class="sh-muted">Нажми на группу для брендов, задач и ответственного</div><div style="max-height:410px;overflow-y:auto;margin-top:12px">'+display.map(x=>'<div class="sh-bar" data-cat="'+E(x.category)+'"><b>'+E(x.category)+'</b><span class="sh-track"><i style="width:'+Math.max(0.8,100*x.share/max).toFixed(2)+'%"></i></span><strong>'+E(pct(x.share))+'</strong></div>').join("")+'</div></div>';
}
function opportunities(rows){
 const ranked=[...rows].filter(x=>x.market>0).sort((a,b)=>(b.market-b.allOwn)-(a.market-a.allOwn)).slice(0,5);
 return '<div class="sh-panel"><h3>▥ ТОП возможностей роста</h3><div class="sh-muted">Рейтинг по незанятому обороту категории, не прогноз прибыли</div>'+ranked.map((x,i)=>{
  const goal=S.goals.find(g=>g.category===x.category&&g.quarter==="2026-Q4");
  return '<div class="sh-op" data-cat="'+E(x.category)+'"><div class="sh-row"><strong>'+(i+1)+'. '+E(x.category)+'</strong><span class="sh-muted">'+E(ownerName(x.assignment.manager_email))+'</span></div><div class="sh-op-body"><span>Наша доля<b>'+E(pct(x.share))+'</b></span><span>Цель Q4<b>'+(goal?"+"+E(pp(goal.target_pp)):"Не задана")+'</b></span><span>+1 п. п.<b class="sh-green">'+E(compact(x.market/100))+'</b></span></div></div>'}).join("")+'</div>';
}
function statusBoard(){
 const counts={research:0,review:0,in_progress:0,effect_check:0};
 S.tasks.forEach(t=>{if(["research","answered"].includes(t.status))counts.research++;if(t.status==="review")counts.review++;if(["approved","in_progress"].includes(t.status))counts.in_progress++;if(t.status==="effect_check")counts.effect_check++});
 const arr=[["Исследование",counts.research],["На согласовании",counts.review],["В работе",counts.in_progress],["Контроль эффекта",counts.effect_check]];
 return '<div class="sh-panel"><h3>◈ Категории под контролем</h3><div class="sh-status">'+arr.map(x=>'<div class="sh-state"><div class="sh-muted">'+E(x[0])+'</div><b>'+x[1]+'</b><div class="sh-muted">Исследования / решения</div></div>').join("")+'</div><div class="sh-actions"><button class="sh-button" data-view="tasks">Открыть контроль задач →</button></div></div>';
}
function overview(rows){
 const market=rows.reduce((s,x)=>s+x.market,0);
 return tiles(rows)+'<div class="sh-grid">'+briefing(rows)+chart(rows)+opportunities(rows)+'</div>'+
 '<div class="sh-bottom"><div class="sh-panel"><h3>◎ План / факт доли</h3><div class="sh-note"><b>База: январь–сентябрь 2026.</b> Величина доли подтверждена файлом. Для фактического роста в IV квартале требуется новый срез продаж категорий 21vek. Без него прогресс не рисуем.</div><div class="sh-row"><span>Оборот категорий: <b>'+E(compact(market))+'</b></span><span class="sh-pill">Контрольная дата 15.12.2026</span></div></div>'+statusBoard()+'</div>';
}
const sourceDay=x=>x?String(x).slice(0,10).split("-").reverse().join("."):"—";
const problemLabel={
 partner_stock_gap_with_chekhov:"21vek: нет свободного остатка; Чехов: есть",
 listing_not_freshly_verified:"Нет свежей подтверждённой позиции",
 weak_exact_position:"Позиция хуже TOP-60",
 not_in_last_price_import:"SKU отсутствует в последнем загруженном прайсе",
 check_commercial_decision:"Возможность для коммерческого решения"
};
function currentEvidence(cat){return S.evidence[cat]?.data||null;}
async function loadEvidence(cat,force=false){
 if(!cat)return;
 const key=String(cat),old=S.evidence[key];
 if(!force&&old&&Date.now()-old.at<90000)return;
 if(S.evidenceLoading[key])return S.evidenceLoading[key];
 S.evidenceLoading[key]=(async()=>{
  try{
   const r=await database().rpc("triovist_decisions360_category_evidence_v1",{p_category:key});
   if(r.error)throw r.error;
   S.evidence[key]={data:r.data,at:Date.now()};
  }catch(err){S.evidence[key]={data:{error:String(err?.message||err)},at:Date.now()}}
  finally{delete S.evidenceLoading[key];if(S.host)render()}
 })();
 return S.evidenceLoading[key];
}
function evidenceHtml(cat){
 const ev=currentEvidence(cat);
 if(!ev)return '<div class="sh-note">✦ Загружаем обзор CRM: доли, прайс, Чехов, 21vek и конкуренты…</div>';
 if(ev.error)return '<div class="sh-message">Не удалось получить подтверждённые данные: '+E(ev.error)+'</div>';
 const brands=(ev.brands||[]).filter(x=>!OWN.has(String(x.brand||"").toLowerCase())).slice(0,5);
 const sku=(ev.sku_evidence||[]),competitors=(ev.competitor_evidence||[]);
 const goal=N(ev.q4_target_delta_pp),hasGoal=ev.q4_target_delta_pp!=null;
 const products=sku.slice(0,16).map(x=>
   '<div class="sh-sku-row"><span><b>'+E(x.sku)+'</b><small>'+E(x.subgroup||"")+'</small></span>'+
   '<span>'+E(x.price_list??"—")+'<small>прайс '+E(sourceDay(x.price_list_at))+'</small></span>'+
   '<span>'+E(x.partner_free??"—")+'<small>своб. 21vek '+E(sourceDay(x.partner_date))+'</small></span>'+
   '<span>'+E(x.chekhov_total??"—")+'<small>Чехов '+E(sourceDay(x.chekhov_date))+'</small></span>'+
   '<span>'+(x.position_verified?'№'+E(x.position):'Не подтверждена')+
   '<small>'+E(problemLabel[x.opportunity]||"Проверить")+'</small></span></div>').join("");
 const rivalLines=competitors.slice(0,8).map(x=>'<div class="sh-sku-row"><span><b>'+E(x.brand)+'</b><small>'+E(x.model||"")+'</small></span>'+
   '<span>№'+E(x.position||"—")+'<small>листинг</small></span>'+
   '<span>'+E(x.price??"—")+'<small>цена парсера</small></span>'+
   '<span>'+E(x.in_stock===true?"Есть":x.in_stock===false?"Нет":"—")+'<small>наличие</small></span>'+
   '<span>'+E(sourceDay(x.observed_at))+'<small>дата сбора</small></span></div>').join("");
 return '<div class="sh-panel sh-evidence"><h3>✦ CRM изучила источники вместо менеджера</h3>'+
 '<div class="sh-muted">Выверенные данные 21vek за январь–сентябрь 2026, USD без НДС. Обороты брендов могут быть неполными; позиции — не объёмы продаж.</div>'+
 '<div class="sh-note"><b>Наша доля '+E(pct(ev.our_share_pct))+'.</b> Категория: '+E(usd(ev.market_usd))+
 '; наши бренды: '+E(usd(ev.our_usd))+' за 9 месяцев. <b>+1 п. п. = '+E(usd(ev.one_pp_usd_9m))+
 '</b> дополнительного оборота на той же девятимесячной базе и неизменном рынке. Это модель, а не факт Q4 или прибыль.</div>'+
 (hasGoal?'<div class="sh-note" style="background:#fff8ea;border-color:#f0d3a4"><b>Утверждённая цель Q4: +'+E(pp(goal))+
 '.</b> Это изменение доли в пунктах, итоговая целевая доля ≈'+E(pct(ev.q4_target_final_share_pct))+
 (ev.goal_requires_review?'. <b>ВНИМАНИЕ: высокая цель, перепроверить реалистичность.</b>':'.')+'</div>':'')+
 '<details><summary><b>Подтверждённые обороты брендов-конкурентов · 9 месяцев</b></summary>'+
 brands.map(x=>'<div class="sh-row" style="border-top:1px solid #edf1f6;padding:6px"><span>'+E(x.brand)+'</span><b>'+E(usd(x.usd_9m))+' · '+E(pct(x.share_pct))+'</b></div>').join("")+
 '<p class="sh-muted">Оборот отдельного товара из этих данных неизвестен.</p></details>'+
 '<h3 style="margin-top:13px">Наши SKU: цены, остатки и листинг</h3>'+
 '<div class="sh-muted">Сопоставлено '+E(sku.length)+' SKU из задач по категории. Прайс датирован '+E(sourceDay(ev.price_imported_at))+
 '; если он старый — цену нельзя считать актуальной. Свободный остаток 21vek ≠ товар в пути.</div>'+
 (sku.length?'<div class="sh-sku-list">'+products+'</div>':
 '<div class="sh-note">Для этой категории пока нет надёжной связи SKU с парсером. Автоматически не объявляем товары отсутствующими.</div>')+
 (sku.length>16?'<div class="sh-muted">Показаны первые 16 приоритетных SKU из '+E(sku.length)+'. При подготовке ответа используются данные всей выборки.</div>':'')+
 '<details><summary><b>Конкуренты из нашего парсера 21vek</b> · '+E(competitors.length)+' примеров</summary>'+
 (competitors.length?'<div class="sh-sku-list">'+rivalLines+'</div>':'<p class="sh-muted">Нет проверенных совпадений поисковых запросов.</p>')+
 '<div class="sh-muted">Позиции, цены и наличие — из парсера, подтверждённые объёмы отдельных конкурентных SKU не доступны.</div></details></div>';
}
function automaticAnswer(cat){
 const e=currentEvidence(cat);
 if(!e||e.error)throw Error("Источники CRM для категории пока недоступны. Обновите экран и повторите.");
 const brands=(e.brands||[]).filter(x=>!OWN.has(String(x.brand||"").toLowerCase())).slice(0,8);
 const comps=(e.competitor_evidence||[]).slice(0,10);
 const sku=(e.sku_evidence||[]).slice(0,40);
 const competitor_evidence=brands.map(x=>x.brand+" — "+usd(x.usd_9m)+" за 9 месяцев; доля "+pct(x.share_pct)).join("; ")+
  "\nПозиции конкурентов (не продажи SKU): "+(comps.length?comps.map(x=>x.brand+" "+x.model+
   " · "+x.search_query+" · №"+x.position+" · цена "+(x.price??"—")+" · "+sourceDay(x.observed_at)).join("; "):"не подтверждены")+
  "\nОтдельные объёмы продаж конкурирующих SKU не подтверждены.";
 const own_assortment_gap=sku.length?sku.map(x=>x.sku+" · "+x.subgroup+
   " · прайс "+(x.price_list??"—")+" ("+sourceDay(x.price_list_at)+")"+
   " · свободно 21vek "+(x.partner_free??"—")+
   " · Чехов "+(x.chekhov_total??"—")+
   " · позиция "+(x.position_verified?"№"+x.position:"не подтверждена")+
   " · "+(problemLabel[x.opportunity]||"проверить")).join("; "):
   "Привязка SKU к категории в действующей CRM не подтверждена. Не заявляем об отсутствии товаров.";
 const evidence_source="21vek 01–09.2026, USD без НДС (категория и бренды); прайс "+
   sourceDay(e.price_imported_at)+"; 21vek TOP и конкуренты: датированные снимки парсера; "+
   "остатки 21vek и Чехова: даты на карточках. 1 п. п. рассчитан от исторического рынка.";
 return {competitor_evidence:competitor_evidence.slice(0,5000),own_assortment_gap:own_assortment_gap.slice(0,5000),evidence_source};
}
function managerForm(t,ans){
 if(!t)return '<div class="sh-empty">Выбери исследование, чтобы увидеть источники и принять решение.</div>';
 const canRespond=!boss()&&me()===String(t.manager_email||"").toLowerCase()&&["research","answered","review"].includes(t.status);
 const ev=currentEvidence(t.category),subgroups=[...new Set((ev?.sku_evidence||[]).map(x=>x.subgroup).filter(Boolean))].sort();
 const chosen=ans?.subgroup||subgroups[0]||t.category;
 const select=subgroups.length
  ?'<select data-answer="subgroup" '+(canRespond?'':'disabled')+'>'+subgroups.map(x=>'<option value="'+E(x)+'" '+(x===chosen?'selected':'')+'>'+E(x)+'</option>').join("")+'</select>'
  :'<input data-answer="subgroup" value="'+E(chosen)+'" '+(canRespond?'':'disabled')+' placeholder="Приоритетная подгруппа">';
 return '<div class="sh-panel"><div class="sh-row"><h3>Коммерческое решение · '+E(t.category)+'</h3><span class="sh-pill">'+E(statusText(t.status))+'</span></div>'+
 '<div class="sh-note"><b>Данные ИИ уже собрал:</b> доли брендов, доступный прайс, остатки Чехова и 21vek, позиции парсера. Выберите подгруппу и предложите действие — повторно вводить источники не требуется.</div>'+
 '<div class="sh-field"><label>Приоритетная подгруппа</label>'+select+'</div>'+
 '<div class="sh-field"><label>Ваше решение: ассортимент, цена, поставка или продвижение</label>'+
 '<textarea data-answer="recommendation" '+(canRespond?'':'disabled')+' placeholder="Какое действие предлагаете и почему?">'+E(ans?.recommendation||"")+'</textarea></div>'+
 (canRespond?'<div class="sh-actions"><button class="sh-button sh-primary" data-action="save-answer">Передать решение и доказательства CRM на анализ ИИ</button></div>':
  '<div class="sh-muted">'+(boss()?"Решение вводит закреплённый категорийный менеджер.":"Задача закреплена за другим менеджером.")+'</div>')+
 (t.ai_analyst_note?'<div class="sh-note"><b>ИИ · Анализ:</b> '+E(t.ai_analyst_note)+'</div>':'')+
 (t.proposed_next_step?'<div class="sh-note"><b>Следующее действие:</b> '+E(t.proposed_next_step)+'</div>':'')+
 (boss()?'<div class="sh-field"><label>Решение директора</label><select id="sh-task-status">'+["research","review","approved","in_progress","effect_check","done","cancelled"].map(x=>'<option value="'+x+'" '+(x===t.status?'selected':'')+'>'+E(statusText(x))+'</option>').join("")+'</select></div><div class="sh-field"><label>Комментарий руководителя</label><textarea id="sh-task-director">'+E(t.director_note||"")+'</textarea></div><button class="sh-button sh-primary" data-action="save-status">Сохранить решение</button>':'')+'</div>';
}
function categoryDetail(rows){
 const c=rows.find(x=>x.category===S.selected);
 if(!c)return '<div class="sh-empty">Выбери категорию на графике.</div>';
 const max=Math.max(1,...c.brands.map(x=>N(x.revenue_usd)));
 const goal=S.goals.find(g=>g.category===c.category&&g.quarter==="2026-Q4");
 const assigned=String(c.assignment.manager_email||"");
 const task=S.tasks.filter(t=>t.category===c.category).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
 const chosen=task.find(x=>x.id===S.taskId)||task[0]||null;
 if(chosen)S.taskId=chosen.id;
 const answer=S.answers.find(a=>a.task_id===chosen?.id);
 return '<div class="sh-row"><h3 style="margin:0">▣ '+E(c.category)+'</h3><button class="sh-button" data-action="back">← Все категории</button></div>'+
 '<div class="sh-kpis" style="grid-template-columns:repeat(4,minmax(0,1fr));margin-top:12px">'+
 [["Оборот 21vek",compact(c.market)],["Наши бренды",compact(c.allOwn)],["Наша доля",pct(c.market?100*c.allOwn/c.market:0)],["+1 п. п.",compact(c.market/100)]].map(x=>'<div class="sh-kpi"><b>'+E(x[0])+'</b><strong>'+E(x[1])+'</strong></div>').join("")+'</div>'+
 '<div class="sh-detail"><div class="sh-panel"><h3>Бренды и конкуренты · Данные 9 мес. 2026</h3><div class="sh-muted">Показаны только бренды из Excel. Их сумма может быть меньше всего рынка категории.</div>'+
 c.brands.slice().sort((a,b)=>N(b.revenue_usd)-N(a.revenue_usd)).map(b=>'<div class="sh-bar" style="grid-template-columns:125px minmax(50px,1fr) 90px;cursor:default"><b>'+E(b.brand)+'</b><span class="sh-track"><i style="width:'+(100*N(b.revenue_usd)/max).toFixed(1)+'%"></i></span><b>'+E(compact(b.revenue_usd))+'</b></div>').join("")+
 '<div class="sh-note"><b>Ответственный:</b> '+E(ownerName(assigned))+'<br><span class="sh-muted">'+E(c.assignment.note||"")+'</span></div>'+
 (boss()?'<div class="sh-field"><label>Закрепить категорию за менеджером</label><select id="sh-owner"><option value="">Не закреплена</option><option value="'+ALEKS+'" '+(assigned===ALEKS?"selected":"")+'>Александренко</option><option value="'+KRIS+'" '+(assigned===KRIS?"selected":"")+'>Кришталь</option></select></div><button class="sh-button" data-action="save-owner">Сохранить закрепление</button>'+
 '<div class="sh-field"><label>Цель роста Q4 2026 (процентные пункты)</label><input type="number" id="sh-goal" min="0" max="100" step="0.25" value="'+(goal?E(goal.target_pp):"")+'" placeholder="Не утверждена"></div><button class="sh-button" data-action="save-goal">Утвердить квартальную цель</button>':'<div class="sh-note"><b>Цель Q4:</b> '+(goal?"+"+E(pp(goal.target_pp)):"Не утверждена")+'</div>')+'</div>'+
 '<div><div class="sh-panel"><h3>Задачи по доле</h3>'+task.map(x=>detailTask(x)).join("")+(task.length?"":'<div class="sh-empty">Исследование ещё не поставлено. Новые задачи формируются автоматически по рабочим дням.</div>')+'</div><div style="margin-top:11px">'+managerForm(chosen,answer)+'</div></div></div>';
}
function tasksView(){
 const rows=currentRows();const count=S.tasks.filter(x=>!["done","cancelled"].includes(x.status)).length;
 let html='<div class="sh-row"><h3>Задачи по долям · Контроль исследований</h3><span class="sh-pill">Активных: '+count+'</span></div><div class="sh-detail"><div class="sh-panel"><h3>Очередь исследований</h3>'+
 S.tasks.map(t=>detailTask(t)).join("")+(S.tasks.length?"":'<div class="sh-empty">Новых задач пока нет.</div>')+'</div><div>'+managerForm(selectedTask(),S.answers.find(a=>a.task_id===S.taskId))+'</div></div>';
 return html;
}
function render(){
 if(!S.host)return;
 css();let r=node();
 if(!r){r=document.createElement("div");r.id=ID;S.host.replaceChildren(r)}
 const rows=currentRows(); const isDetail=S.view==="shares"&&!!S.selected;
 r.innerHTML=header()+filters()+(S.loading?'<div class="sh-empty">Загружаю данные долей…</div>':S.error?'<div class="sh-message">'+E(S.error)+'</div>':S.view==="tasks"?tasksView():isDetail?categoryDetail(rows):overview(rows))+
 '<div class="sh-muted" style="margin-top:12px">Источник: файл «Доли 21 век 9 месяцев» · без НДС, USD. В сравнении с CRM закупки/отгрузки учитываются отдельно. Нет данных 2025 года и квартального факта 2026 года.</div>';
}
async function load(){
 if(S.loading)return;
 S.loading=true;S.error="";render();
 try{
  const d=database();if(!d?.from)throw Error("Подключение к базе CRM недоступно");
  const res=await Promise.all([
   d.from("triovist_share_categories_v1").select("period_end,category,market_usd,source_notes").eq("period_end","2026-09-30"),
   d.from("triovist_share_brands_v1").select("category,brand,revenue_usd,quantity").eq("period_end","2026-09-30").limit(300),
   d.from("triovist_share_assignments_v1").select("category,manager_email,manager_name,note"),
   d.from("triovist_share_goals_v1").select("category,quarter,target_pp"),
   d.from("triovist_share_tasks_v1").select("*").order("created_at",{ascending:false}).limit(150),
   d.from("triovist_share_answers_v1").select("*").limit(150)
  ]);
  const bad=res.find(x=>x.error);if(bad)throw bad.error;
  [S.categories,S.brands,S.assignments,S.goals,S.tasks,S.answers]=res.map(x=>x.data||[]);
  S.last=Date.now();
  if(S.selected&&!S.categories.some(x=>x.category===S.selected))S.selected="";
  if(!S.taskId&&S.tasks.length)S.taskId=S.tasks[0].id;
 }catch(e){S.error="Доли 21vek не загрузились: "+(e?.message||e);console.warn("Shares360",e)}
 finally{S.loading=false;render()}
}
function message(m){const r=node();if(!r)return;let n=r.querySelector("[data-share-notice]");if(!n){n=document.createElement("div");n.className="sh-message";n.dataset.shareNotice="1";r.insertBefore(n,r.children[2]||null)}n.textContent=m}
async function writeTaskStatus(){
 const t=selectedTask();if(!t||!boss())return;
 const d=database();const status=node().querySelector("#sh-task-status")?.value||t.status;
 const note=node().querySelector("#sh-task-director")?.value||"";
 const r=await d.from("triovist_share_tasks_v1").update({status,director_note:note,updated_at:new Date().toISOString()}).eq("id",t.id);
 if(r.error)throw r.error;await load()
}
async function saveAnswer(){
 const t=selectedTask();if(!t||boss()||me()!==String(t.manager_email).toLowerCase())return;
 const ans={task_id:t.id,manager_email:me()};
 node().querySelectorAll("[data-answer]").forEach(x=>ans[x.dataset.answer]=String(x.value||"").trim().slice(0,5000));
 if(!ans.recommendation||ans.recommendation.length<10)throw Error("Укажите конкретное предложение (не менее 10 символов).");
 Object.assign(ans,automaticAnswer(t.category));
 if(!ans.subgroup)ans.subgroup=t.category;
 const d=database();const r=await d.from("triovist_share_answers_v1").upsert(ans,{onConflict:"task_id"});
 if(r.error)throw r.error;
 message("Ответ сохранён. ИИ проверяет доказательства и готовит следующий шаг…");
 const ai=await d.functions.invoke("triovist-share-brainstorm-v1",{body:{task_id:t.id}});
 if(ai.error)message("Ответ сохранён. Анализ ИИ временно недоступен: "+String(ai.error.message||ai.error));
 await load();
}
async function saveOwner(){
 if(!boss()||!S.selected)return;
 const email=node().querySelector("#sh-owner")?.value||null;
 const r=await database().from("triovist_share_assignments_v1").update({manager_email:email,manager_name:email?ownerName(email):null,updated_by:me(),updated_at:new Date().toISOString(),note:"Назначено руководителем через Доли 360°"}).eq("category",S.selected);
 if(r.error)throw r.error;await load();
}
async function saveGoal(){
 if(!boss()||!S.selected)return;
 const raw=node().querySelector("#sh-goal")?.value;
 const value=Number(raw);
 if(!raw||!Number.isFinite(value)||value<=0||value>100)throw Error("Укажи цель роста больше 0 и не больше 100 п. п.");
 const r=await database().from("triovist_share_goals_v1").upsert({category:S.selected,quarter:"2026-Q4",target_pp:value,approved_by:me(),approved_at:new Date().toISOString()},{onConflict:"category,quarter"});
 if(r.error)throw r.error;await load();
}
function events(r){
 r.addEventListener("click",e=>{
  const b=e.target.closest("[data-view],[data-cat],[data-task],[data-action]");if(!b||!r.contains(b))return;
  if(b.dataset.view){S.view=b.dataset.view;S.selected="";S.taskId=S.tasks[0]?.id||"";render();return}
  if(b.dataset.cat){S.selected=b.dataset.cat;S.view="shares";S.taskId=S.tasks.find(t=>t.category===S.selected)?.id||"";render();return}
  if(b.dataset.task){S.taskId=b.dataset.task;S.view="tasks";render();return}
  const a=b.dataset.action;
  if(a==="back"){S.selected="";S.view="shares";render();return}
  if(a==="reload"){void load();return}
  const work={ "save-answer":saveAnswer,"save-status":writeTaskStatus,"save-owner":saveOwner,"save-goal":saveGoal}[a];
  if(work){b.disabled=true;Promise.resolve().then(work).catch(err=>{message("Не удалось сохранить: "+String(err?.message||err));console.warn("Shares360 write",err)}).finally(()=>{if(b.isConnected)b.disabled=false})}
 });
 r.addEventListener("change",e=>{const el=e.target;if(!el.dataset.filter)return;S[el.dataset.filter]=el.value;if(el.dataset.filter==="selected")S.view="shares";render()});
}
async function open(host,ctx){
 if(!host||!ctx||(ctx.is_leader!==true&&ctx.is_manager!==true))return false;
 S.host=host;S.ctx=ctx;css();let r=node();
 if(!r){r=document.createElement("div");r.id=ID;host.replaceChildren(r);events(r)}
 if(!S.last||Date.now()-S.last>90000)await load();else render();
 return true;
}
w.RESANTA_TRIOVIST_SHARES360_V1={version:"2026.11.06.1",open,refresh:load};
})(window);