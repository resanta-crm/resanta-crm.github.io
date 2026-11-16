// Preserve every SKU/month and net quantities/revenue; do not resend transaction IDs,
// repeated names or three copies of the same purchase evidence to the model.
export function compactTaskFacts(facts){
 if(!facts||typeof facts!=='object'||!Array.isArray(facts.purchase_history))return facts;
 const monthly=new Map();
 for(const r of facts.purchase_history){
  const month=String(r.month||'').slice(0,7),key=JSON.stringify([r.sku,month]);
  const row=monthly.get(key)||[r.sku,month,0,0];
  row[2]+=Number(r.qty)||0;row[3]+=Number(r.revenue)||0;monthly.set(key,row);
 }
 const {purchase_history,purchase_analysis,candidates,...rest}=facts;
 const analysis=purchase_analysis?{...purchase_analysis,items:purchase_analysis.items.map(({recent,...item})=>item)}:null;
 return {...rest,purchase_analysis:analysis,
  purchase_history:{columns:['sku','month','net_qty','net_revenue'],rows:[...monthly.values()],note:'Все доступные месяцы, суммы с учётом возвратов. Названия и ABC — в purchase_analysis.items. Отсутствующий месяц не означает нулевые продажи.'},
  ...(candidates?{candidates:candidates.map(({purchase_evidence,...item})=>item)}:{})};
}

// Direction selection is a broad assortment step, not the final SKU/quantity
// proposal. The final proposal still receives every available SKU/month below.
// Keep the profile, negotiations, restrictions, shelf and task outcomes here;
// do not pay to send the complete monthly ledger in both model calls.
export function directionFacts(facts,winterProducts=[],subgroups=[]){
 const groups=new Map();
 for(const row of facts.purchase_history||[]){
  if(!row.sku)continue;
  const values=groups.get(row.sku)||new Set();
  for(const value of [row.category,row.subgroup])if(value)values.add(value);
  groups.set(row.sku,values);
 }
 const analysis=facts.purchase_analysis;
 return {
  client:facts.client,season:facts.season,purchase_restriction:facts.purchase_restriction,
  route:facts.route?{visit_date:facts.route.visit_date,address:facts.route.address}:undefined,
  visits:facts.visits,tasks:facts.tasks,shelf:facts.shelf,
  field_policy:facts.field_policy,request:facts.request,
  purchase_analysis:analysis?{
   basis:analysis.basis,from:analysis.from,to:analysis.to,
   previous_season_year:analysis.previous_season_year,
   history_rows:analysis.history_rows,coverage_months:analysis.coverage_months,
   items:analysis.items.map(item=>({
    sku:item.sku,product:item.product,abc:item.abc,revenue:item.revenue,qty:item.qty,last_purchase:item.last_purchase,
    purchase_months:item.purchase_months,previous_autumn:item.previous_autumn,
    historical_groups:[...(groups.get(item.sku)||[])].sort()
   }))
  }:null,
  winter_products:winterProducts,subgroups
 };
}

const hasOwn=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const table=rows=>{
 const columns=[...new Set(rows.flatMap(x=>Object.keys(x)))].sort();
 return {columns,rows:rows.map(x=>columns.map(k=>x[k]??null))};
};

// Repeated product names and group names are dictionary references; SKU values
// remain their original strings so the model returns actual articles, not IDs.
// Each SKU's complete monthly ledger is encoded once, with a shared month list.
export function denseTaskFacts(facts){
 const compact=compactTaskFacts(facts);
 if(!compact||typeof compact!=='object')return compact;
 const sourceRows=[...(compact.purchase_analysis?.items||[]),...(compact.candidates||[]),...(compact.winter_products||[])];
 // Stable dictionaries also protect the paid cache from order-only changes in
 // imported rows. Ref numbers must not depend on which row arrived first.
 const products=[...new Set(sourceRows.map(item=>item.product).filter(value=>typeof value==='string'))].sort();
 const groups=[...new Set(sourceRows.flatMap(item=>[item.category,item.subgroup,...(Array.isArray(item.historical_groups)?item.historical_groups:[])]).filter(value=>typeof value==='string'))].sort();
 const productIds=new Map(products.map((value,index)=>[value,index])),groupIds=new Map(groups.map((value,index)=>[value,index]));
 const row=item=>Object.fromEntries(Object.entries(item).map(([key,value])=>{
  if(key==='product'&&typeof value==='string')return ['product_ref',productIds.get(value)];
  if((key==='category'||key==='subgroup')&&typeof value==='string')return [key+'_ref',groupIds.get(value)];
  if(key==='historical_groups'&&Array.isArray(value))return ['historical_group_refs',value.map(x=>groupIds.get(x))];
  if(key==='previous_autumn'&&value&&['october','november','december'].every(k=>hasOwn(value,k))&&Object.keys(value).length===3)return ['previous_autumn_october_november_december',[value.october,value.november,value.december]];
  return [key,value];
 }));
 const dense={...compact};
 if(compact.purchase_analysis?.items)dense.purchase_analysis={...compact.purchase_analysis,items:table(compact.purchase_analysis.items.map(row))};
 for(const key of ['candidates','winter_products'])if(Array.isArray(compact[key]))dense[key]=table(compact[key].map(row));
 if(compact.purchase_history?.rows){
  const months=[...new Set(compact.purchase_history.rows.map(x=>x[1]))].sort();
  const monthIds=new Map(months.map((month,index)=>[month,index])),bySku=new Map();
  for(const [sku,month,qty,revenue] of compact.purchase_history.rows){
   const values=bySku.get(sku)||[];values.push([monthIds.get(month),qty,revenue]);bySku.set(sku,values);
  }
  dense.purchase_history={
   months,columns:['sku','monthly_rows'],monthly_columns:['month_ref','net_qty','net_revenue'],
   rows:[...bySku],note:compact.purchase_history.note
  };
 }
 if(products.length||groups.length)dense.dictionaries={products,groups};
 return dense;
}

// GPT-5.4 mini has a 400k-token window. This is a conservative runaway guard,
// NOT a 90k-character business/client limit: UTF-8 bytes bound text token count
// from above and leave room for instructions and the response. Never truncate.
export const MAX_TASK_INPUT_BYTES=350000;

export function taskModelInput(facts){
 const dense=denseTaskFacts(facts);
 const text='Верни JSON. columns/rows — таблицы по порядку колонок, null — нет данных. product_ref и category_ref/subgroup_ref/historical_group_refs — индексы с нуля в dictionaries.products/groups. SKU остаются исходными строками: возвращай именно их. previous_autumn_october_november_december — количества за октябрь/ноябрь/декабрь previous_season_year. purchase_history: каждая строка [sku,monthly_rows]; строки месяцев [индекс в months,net_qty,net_revenue]. Сохранены все доступные SKU и месяцы, возвраты учтены; отсутствующий месяц не доказывает нулевую продажу. Данные для обработки:\n'+JSON.stringify(dense);
 if(new TextEncoder().encode(text).length>MAX_TASK_INPUT_BYTES)throw Error('TASK_CONTEXT_TOO_LARGE: объём данных превышает технический предел подготовки; сохраните остальные проекты и обратитесь в техподдержку');
 return text;
}
