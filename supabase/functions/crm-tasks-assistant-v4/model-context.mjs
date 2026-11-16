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

export function taskModelInput(facts){
 const compact=compactTaskFacts(facts);
 // Lossless tabular encoding: field names occur once, every row is retained.
 const table=rows=>{const columns=[...new Set(rows.flatMap(x=>Object.keys(x)))];return {columns,rows:rows.map(x=>columns.map(k=>x[k]??null))};};
 const dense=compact===facts?compact:{...compact,
  purchase_analysis:compact.purchase_analysis?{...compact.purchase_analysis,items:table(compact.purchase_analysis.items)}:null,
  ...(compact.candidates?{candidates:table(compact.candidates)}:{}),
  ...(compact.winter_products?{winter_products:table(compact.winter_products)}:{})};
 const text='Верни JSON. Таблицы columns/rows читаются по порядку колонок, null означает отсутствие данных. История и ABC находятся в purchase_analysis и purchase_history; кандидаты ссылаются на них по sku. Данные для обработки:\n'+JSON.stringify(dense);
 // Fail before a paid call rather than silently truncating evidence.
 if(text.length>90000)throw Error('TASK_CONTEXT_TOO_LARGE: слишком большой объём данных для экономного формирования; требуется уточнить задачу');
 return text;
}
