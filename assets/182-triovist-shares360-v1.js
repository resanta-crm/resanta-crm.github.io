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
const S={host:null,ctx:null,categories:[],brands:[],assignments:[],snapshots:[],periods:[],period:"",preferredPeriod:"",tasks:[],answers:[],selected:"",brand:"all",owner:"all",view:"shares",taskId:"",loading:false,error:"",last:0,evidence:{},evidenceLoading:{}};
const ownerName=e=>e===ALEKS?"Александренко":e===KRIS?"Кришталь":"Не закреплена";
const boss=()=>S.ctx?.is_leader===true;
const me=()=>String(S.ctx?.email||"").toLowerCase();
function database(){try{return typeof db!=="undefined"?db:w.db}catch(_){return w.db}}
function node(){return S.host?.querySelector("#"+ID)}
function css(){
 if(document.getElementById(CSS))return;
 const e=document.createElement("style");
 e.id=CSS;
 e.textContent=`
#${ID}{color:var(--text);background:var(--bg);padding:14px;border-radius:12px;font-size:14px}
#${ID} *{box-sizing:border-box}
#${ID} :is(button,select,input,textarea){font:inherit;color:inherit}
#${ID} button{cursor:pointer}
#${ID} button:disabled{cursor:default;opacity:.55}
#${ID} :is(button,select,input,textarea,summary):focus-visible{outline:2px solid var(--a);outline-offset:2px}
#${ID} :is(.sh-top,.sh-heading,.sh-row,.sh-tabs,.sh-actions){display:flex;align-items:center;gap:8px;flex-wrap:wrap}
#${ID} :is(.sh-top,.sh-row){justify-content:space-between}
#${ID} .sh-top{margin-bottom:14px}
#${ID} h2{font-size:24px;line-height:1.2;margin:0}
#${ID} h3{font-size:17px;line-height:1.3;margin:0 0 10px}
#${ID} .sh-muted{font-size:12px;color:var(--sub);line-height:1.5}
#${ID} :is(.sh-tabs button,.sh-button,.sh-help button){min-height:36px;padding:7px 12px;border:1px solid var(--border);border-radius:8px;background:var(--card);color:var(--a);font-weight:600}
#${ID} :is(.sh-tabs button,.sh-button,.sh-help button):not(:disabled):hover{background:var(--ab)}
#${ID} .sh-tabs button.on{background:var(--ab);border-color:var(--a);color:var(--at)}
#${ID} .sh-button.sh-primary{background:var(--a);border-color:var(--a);color:#fff}
#${ID} .sh-button.sh-primary:hover{background:var(--at)}
#${ID} .sh-help{position:relative;display:inline-flex;flex:none}
#${ID} .sh-help button{width:28px;min-height:28px;padding:0;font-size:17px}
#${ID} .sh-tip{display:none;position:absolute;z-index:5;inset-block-start:100%;inset-inline-end:0;width:min(270px,72vw);padding:9px 11px;border:1px solid var(--border);border-radius:8px;background:var(--card);box-shadow:0 4px 14px #11182720;color:var(--text);font-size:13px;line-height:1.5;font-weight:400}
#${ID} .sh-heading,#${ID} .sh-kpi{position:relative}
#${ID} :is(.sh-heading,.sh-kpi) .sh-help{position:static}
#${ID} .sh-heading .sh-tip{inset-inline:0 auto}
#${ID} .sh-kpi .sh-tip{inset-block-start:44px;inset-inline:auto 8px;width:min(270px,calc(100% - 16px))}
#${ID} .sh-help:is(:hover,:focus-within) .sh-tip{display:block}
#${ID} .sh-filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:12px;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--card)}
#${ID} label{display:block;font-size:13px;color:var(--sub)}
#${ID} :is(select,input,textarea){width:100%;margin-top:4px;border:1px solid var(--border);background:var(--card);border-radius:8px;min-height:38px;padding:7px 10px;color:var(--text)}
#${ID} textarea{min-height:70px;resize:vertical;line-height:1.45}
#${ID} .sh-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(175px,100%),1fr));gap:10px;margin:12px 0}
#${ID} :is(.sh-kpi,.sh-panel){background:var(--card);border:1px solid var(--border);border-radius:12px;min-width:0;padding:14px}
#${ID} .sh-kpi .sh-row{flex-wrap:nowrap;color:var(--sub);font-size:13px}
#${ID} .sh-kpi strong{display:block;font-size:clamp(19px,2vw,26px);margin-top:6px;line-height:1.2}
#${ID} :is(.sh-kpi strong,.sh-value){font-variant-numeric:tabular-nums}
#${ID} :is(.sh-chart-head,.sh-bar){display:grid;grid-template-columns:minmax(0,1fr) minmax(80px,2fr) minmax(68px,auto);gap:12px;align-items:center;width:100%;text-align:left;padding:8px 10px}
#${ID} .sh-chart-head{color:var(--sub);font-size:12px}
#${ID} .sh-scale{display:flex;justify-content:space-between;gap:4px}
#${ID} :is(.sh-bar,.sh-chart-head) >.sh-value{text-align:right}
#${ID} .sh-bar{min-height:40px;border:0;border-top:1px solid var(--border);border-radius:0;background:var(--card)}
#${ID} button.sh-bar:hover{background:var(--ab)}
#${ID} .sh-bar>span:first-child{overflow-wrap:anywhere}
#${ID} .sh-value{white-space:nowrap}
#${ID} .sh-track{height:9px;border-radius:5px;background:var(--ab);overflow:hidden}
#${ID} .sh-track i{display:block;height:100%;border-radius:5px;background:var(--a)}
#${ID} .sh-brand-bar{grid-template-columns:minmax(0,1fr) minmax(45px,1.1fr) minmax(75px,auto)}
#${ID} .sh-note{background:var(--bg);border:1px solid var(--border);border-radius:9px;padding:10px;margin:9px 0;line-height:1.5}
#${ID} .sh-evidence{margin:10px 0}
#${ID} .sh-sku-list{max-height:410px;overflow:auto;border:1px solid var(--border);border-radius:9px;margin:8px 0}
#${ID} .sh-sku-row{display:grid;grid-template-columns:minmax(90px,1.5fr) repeat(3,minmax(48px,1fr)) minmax(85px,1.5fr);gap:8px;border-top:1px solid var(--border);padding:8px;font-size:12px}
#${ID} .sh-sku-row:first-child{border-top:0}
#${ID} .sh-sku-row small{display:block;font-size:11px;color:var(--sub);line-height:1.4;margin-top:3px}
#${ID} .sh-sku-row>span{min-width:0;overflow-wrap:anywhere}
#${ID} .sh-pill{display:inline-block;border-radius:99px;padding:4px 9px;background:var(--ab);color:var(--at);font-size:12px;font-weight:600}
#${ID} .sh-actions{margin:10px 0}
#${ID} .sh-detail{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:start}
#${ID} .sh-field{margin:9px 0}
#${ID} .sh-task{border:1px solid var(--border);border-radius:9px;padding:11px;margin:8px 0;width:100%;text-align:left;background:var(--card)}
#${ID} .sh-task:is(:hover,.on){border-color:var(--a);background:var(--ab)}
#${ID} .sh-empty{padding:16px;border:1px solid var(--border);border-radius:9px;color:var(--sub);text-align:center;background:var(--card)}
#${ID} .sh-message{padding:10px 12px;border-radius:9px;margin:8px 0;background:var(--amb);color:var(--am)}
@media(max-width:940px){#${ID} .sh-filters{grid-template-columns:repeat(2,minmax(0,1fr))}#${ID} .sh-detail{grid-template-columns:1fr}}
@media(max-width:580px){
 #${ID}{padding:8px}
 #${ID} :is(.sh-chart-head,.sh-bar){grid-template-columns:minmax(0,1fr) minmax(46px,.65fr) 62px;gap:6px;padding:8px 4px;font-size:12px}
 #${ID} .sh-scale :not(:first-child,:last-child){display:none}
 #${ID} .sh-sku-row{grid-template-columns:1fr 1fr}
 #${ID} .sh-sku-row>span:last-child{grid-column:1/-1}
}
`;
 document.head.appendChild(e);
}
const byCategory=(a,b)=>a.category.localeCompare(b.category,"ru");
function assignedCategories(){
 return S.categories.filter(x=>S.owner==="all"||S.assignments.some(a=>a.category===x.category&&a.manager_email===S.owner));
}
function currentRows(){
 const brandGroups=new Map();
 for(const row of S.brands){
  if(!brandGroups.has(row.category))brandGroups.set(row.category,[]);
  brandGroups.get(row.category).push(row);
 }
 return assignedCategories().filter(x=>!S.selected||x.category===S.selected).map(x=>{
  const brands=brandGroups.get(x.category)||[];
  const ours=brands.length?brands.filter(b=>{
   const brand=String(b.brand).toLowerCase();
   return S.brand==="all"?OWN.has(brand):brand===S.brand;
  }).reduce((sum,b)=>sum+N(b.revenue_usd),0):null;
  const market=N(x.market_usd);
  return {category:x.category,market,ours,share:market>0&&ours!==null?100*ours/market:null,brands};
 });
}
const selectedTask=()=>S.tasks.find(x=>x.id===S.taskId)||null;
const detailTask=t=>t?'<button type="button" class="sh-task '+(S.taskId===t.id?'on':'')+'" data-task="'+E(t.id)+'"><span class="sh-row"><strong>'+E(t.title)+'</strong><span class="sh-pill">'+E(statusText(t.status))+'</span></span><span class="sh-muted">'+E(t.category)+' · Срок: '+E(t.due_date||"не задан")+' · '+E(ownerName(t.manager_email))+'</span><span style="display:block;margin-top:5px">'+E(t.research_question)+'</span></button>':"";
const statusText=x=>({research:"Исследование",answered:"Ответ менеджера",review:"На проверке",approved:"Согласовано",in_progress:"В работе",effect_check:"Контроль эффекта",done:"Завершено",cancelled:"Отменено"})[x]||x||"—";
const periodName=end=>end==="2026-09-30"?"Январь–сентябрь 2026":"По "+sourceDay(end);
const brandName=key=>({"ресанта":"Ресанта",huter:"Huter","вихрь":"Вихрь",eurolux:"Eurolux"})[key];
const option=(key,label,selected)=>'<option value="'+E(key)+'"'+(key===selected?' selected':'')+'>'+E(label)+'</option>';
function help(key,label,description){
 const id=ID+"-tip-"+key;
 return '<span class="sh-help"><button type="button" aria-label="'+E(label)+'" aria-describedby="'+id+'">*</button>'+
 '<span class="sh-tip" id="'+id+'" role="tooltip">'+E(description)+'</span></span>';
}
function header(){
 const info=S.categories[0]?.source_label;
 const note=(info?info+". ":"Данные выгрузок 21vek в USD без НДС. ")+"1 п. п. — один процентный пункт.";
 return '<header class="sh-top"><div class="sh-heading"><h2>Доли 21vek</h2>'+
  (S.view==="shares"?help("report","Об источнике и единицах",note):"")+'</div>'+
  '<div class="sh-tabs">'+[["shares","Доли"],["tasks","Задачи по долям"]].map(([key,label])=>
   '<button type="button" data-view="'+key+'" class="'+(S.view===key?"on":"")+'" aria-pressed="'+(S.view===key)+'">'+label+'</button>').join("")+
  '<button type="button" data-action="reload"'+(S.loading?' disabled':'')+'>Обновить</button></div></header>';
}
function filters(){
 const filter=(label,key,options)=>'<label>'+label+'<select data-filter="'+key+'"'+(S.loading?' disabled':'')+'>'+options+'</select></label>';
 return '<div class="sh-filters">'+
  filter("Период","period",S.periods.length?S.periods.map(x=>option(x,periodName(x),S.period)).join(""):option("","Нет выгрузок",""))+
  filter("Бренд","brand",option("all","Все наши бренды",S.brand)+[...OWN].map(x=>option(x,brandName(x),S.brand)).join(""))+
  filter("Ответственный","owner",option("all","Все доступные",S.owner)+[ALEKS,KRIS].map(x=>option(x,ownerName(x),S.owner)).join(""))+
  filter("Категория","selected",option("","Все категории",S.selected)+assignedCategories().slice().sort(byCategory).map(x=>option(x.category,x.category,S.selected)).join(""))+'</div>';
}
function tiles(rows){
 const market=rows.reduce((sum,x)=>sum+x.market,0);
 const hasBrandTotals=rows.every(x=>x.ours!==null);
 const ours=hasBrandTotals?rows.reduce((sum,x)=>sum+x.ours,0):null;
 const bits=[
  ["market","Оборот 21vek",compact(market),"Оборот выбранных категорий 21vek за период. USD без НДС."],
  ["sales","Наши продажи",ours===null?"—":compact(ours),"Продажи в выбранных категориях 21vek, USD без НДС. "+(S.brand==="all"?"Бренды: Ресанта, Huter, Вихрь и Eurolux.":"Бренд: "+brandName(S.brand)+".")],
  ["share","Наша доля",market>0&&ours!==null?pct(100*ours/market):"—","Продажи выбранных брендов, делённые на общий оборот выбранных категорий 21vek."]
 ];
 return '<div class="sh-kpis">'+bits.map(([key,label,value,note])=>'<div class="sh-kpi"><div class="sh-row"><span>'+label+'</span>'+
  help(key,label+" — пояснение",note)+'</div><strong>'+E(value)+'</strong></div>').join("")+'</div>';
}
function bar(width){
 return '<span class="sh-track" aria-hidden="true"><i style="width:'+Math.min(100,Math.max(0,width)).toFixed(2)+'%"></i></span>';
}
function chart(rows){
 const display=[...rows].sort((a,b)=>(b.share??-Infinity)-(a.share??-Infinity)||byCategory(a,b));
 return '<section class="sh-panel" aria-labelledby="sh-category-chart"><h3 id="sh-category-chart">Доля по категориям</h3>'+
  '<div class="sh-chart-head"><span>Категория</span><span class="sh-scale" aria-hidden="true"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></span><span class="sh-value">Доля</span></div>'+
  display.map(x=>'<button type="button" class="sh-bar" data-cat="'+E(x.category)+'"><span>'+E(x.category)+'</span>'+
   bar(x.share??0)+'<strong class="sh-value">'+(x.share===null?"—":E(pct(x.share)))+'</strong></button>').join("")+'</section>';
}
function overview(rows){
 return rows.length?tiles(rows)+chart(rows):'<div class="sh-empty">За выбранный период по этим фильтрам данных нет.</div>';
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
 const c=rows[0];
 if(!c)return overview(rows);
 const brands=[...c.brands].sort((a,b)=>N(b.revenue_usd)-N(a.revenue_usd));
 const max=Math.max(1,...brands.map(x=>N(x.revenue_usd)));
 return '<div class="sh-row"><h3 style="margin:0">'+E(c.category)+'</h3><button type="button" class="sh-button" data-action="back">← Все категории</button></div>'+
 tiles(rows)+'<section class="sh-panel"><h3>Продажи по брендам</h3>'+
 (brands.length?brands.map(b=>'<div class="sh-bar sh-brand-bar"><span>'+E(b.brand)+'</span>'+
 bar(100*N(b.revenue_usd)/max)+'<b class="sh-value">'+E(compact(b.revenue_usd))+'</b></div>').join(""):
 '<div class="sh-empty">Продажи по брендам за этот период отсутствуют в выгрузке.</div>')+
 '</section>';
}
function tasksView(){
 const activeCount=S.tasks.filter(x=>!["done","cancelled"].includes(x.status)).length;
 const task=selectedTask();
 return '<div class="sh-row"><h3>Задачи по долям</h3><span class="sh-pill">Активных: '+activeCount+'</span></div><div class="sh-detail"><div class="sh-panel"><h3>Очередь исследований</h3>'+
 S.tasks.map(detailTask).join("")+(S.tasks.length?"":'<div class="sh-empty">Новых задач пока нет.</div>')+'</div><div>'+
 (task?evidenceHtml(task.category):"")+managerForm(task,S.answers.find(a=>a.task_id===S.taskId))+'</div></div>';
}
function render(focusFilter){
 const r=node();
 if(!r)return;
 const rows=currentRows();
 const body=S.view==="tasks"?tasksView():S.selected?categoryDetail(rows):overview(rows);
 r.innerHTML=header()+(S.view==="shares"?filters():"")+
  (S.loading?'<div class="sh-empty" role="status">Загружаю данные…</div>':S.error?'<div class="sh-message" role="alert">'+E(S.error)+'</div>':body);
 if(focusFilter)r.querySelector('[data-filter="'+focusFilter+'"]')?.focus();
}
async function allRows(query){
 const rows=[];
 const pageSize=500;
 for(let offset=0;;offset+=pageSize){
  const {data,error}=await query().range(offset,offset+pageSize-1);
  if(error)throw error;
  rows.push(...(data||[]));
  if(!data||data.length<pageSize)return rows;
 }
}
function loadBrands(d,period){
 return period?allRows(()=>d.from("triovist_share_brands_v1").select("category,brand,revenue_usd")
   .eq("period_end",period).order("category").order("brand")):Promise.resolve([]);
}
function keepCategory(){
 if(S.selected&&!assignedCategories().some(x=>x.category===S.selected))S.selected="";
}
async function load(focusFilter){
 if(S.loading)return;
 S.loading=true;S.error="";render();
 try{
  const d=database();if(!d?.from)throw Error("Подключение к базе CRM недоступно");
  const [snapshots,...results]=await Promise.all([
   allRows(()=>d.from("triovist_share_categories_v1").select("period_end,category,market_usd,source_label")
    .order("period_end",{ascending:false}).order("category")),
   d.from("triovist_share_assignments_v1").select("category,manager_email"),
   d.from("triovist_share_tasks_v1").select("*").order("created_at",{ascending:false}).limit(150),
   d.from("triovist_share_answers_v1").select("*").limit(150)
  ]);
  const bad=results.find(x=>x.error);if(bad)throw bad.error;
  const periods=[...new Set(snapshots.map(x=>x.period_end))];
  const period=periods.includes(S.preferredPeriod)?S.preferredPeriod:periods[0]||"";
  const brands=await loadBrands(d,period);
  [S.assignments,S.tasks,S.answers]=results.map(x=>x.data||[]);
  S.snapshots=snapshots;
  setPeriod(period,brands);
  S.periods=periods;
  S.last=Date.now();
  if(!selectedTask())S.taskId=S.tasks[0]?.id||"";
 }catch(e){S.error="Доли 21vek не загрузились: "+(e?.message||e);console.warn("Shares360",e)}
 finally{S.loading=false;render(focusFilter)}
}
function setPeriod(period,brands){
 S.period=period;
 S.categories=S.snapshots.filter(x=>x.period_end===period);
 S.brands=brands;
 keepCategory();
}
async function changePeriod(period){
 if(!S.periods.includes(period)||S.loading)return;
 S.preferredPeriod=period;
 if(S.error){await load("period");return;}
 if(period===S.period)return;
 S.loading=true;render();
 try{
  const brands=await loadBrands(database(),period);
  setPeriod(period,brands);
 }catch(e){S.error="Не удалось загрузить выбранный период: "+(e?.message||e);console.warn("Shares360",e)}
 finally{S.loading=false;render("period")}
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
function events(r){
 r.addEventListener("click",e=>{
  const b=e.target.closest("[data-view],[data-cat],[data-task],[data-action]");if(!b||!r.contains(b))return;
  if(b.dataset.view){S.view=b.dataset.view;S.selected="";render();if(S.view==="tasks")void loadEvidence(selectedTask()?.category);return}
  if(b.dataset.cat){S.selected=b.dataset.cat;S.view="shares";render();return}
  if(b.dataset.task){S.taskId=b.dataset.task;S.view="tasks";render();void loadEvidence(selectedTask()?.category);return}
  const a=b.dataset.action;
  if(a==="back"){S.selected="";S.view="shares";render();return}
  if(a==="reload"){void load();return}
  const work={ "save-answer":saveAnswer,"save-status":writeTaskStatus}[a];
  if(work){b.disabled=true;Promise.resolve().then(work).catch(err=>{message("Не удалось сохранить: "+String(err?.message||err));console.warn("Shares360 write",err)}).finally(()=>{if(b.isConnected)b.disabled=false})}
 });
 r.addEventListener("change",e=>{
  const {filter}=e.target.dataset;
  if(!filter||!["period","brand","owner","selected"].includes(filter))return;
  if(filter==="period"){void changePeriod(e.target.value);return;}
  S[filter]=e.target.value;
  keepCategory();
  render(filter);
 });
}
async function open(host,ctx){
 if(!host||!ctx||(ctx.is_leader!==true&&ctx.is_manager!==true))return false;
 S.host=host;S.ctx=ctx;css();let r=node();
 if(!r){r=document.createElement("div");r.id=ID;host.replaceChildren(r);events(r)}
 if(!S.last||Date.now()-S.last>90000)await load();else render();
 if(S.view==="tasks")void loadEvidence(selectedTask()?.category);
 return true;
}
w.RESANTA_TRIOVIST_SHARES360_V1={version:"2026.11.23.2-shares-card",open,refresh:load};
})(window);