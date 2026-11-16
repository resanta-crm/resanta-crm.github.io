// Route tasks belong to field managers. Policy is enforced again in the database.
export const inverterWelder=p=>/свароч/i.test(String(p||''))&&(/инвертор/i.test(String(p||''))||/(?:^|[^а-я])саи(?:[^а-я]|$)/i.test(String(p||'')));
export const seasonalProduct=x=>/теплов.{0,45}(?:пушк|завес)|тепловентилятор|конвектор|масляный радиатор|обогреватель|снегоубор|бензопил|дровокол|циркуляцион|увлажнит|сварочн(?:ый|ого) (?:аппарат|полуавтомат)/i.test(String(x.product||''))&&!inverterWelder(x.product);
export function purchaseAnalysis(rows,date){
 const year=Number(date.slice(0,4)),month=date.slice(0,7),bySku=new Map();
 const valid=rows.filter(x=>x.sku&&/^\d{4}-\d{2}/.test(String(x.month))&&String(x.month).slice(0,7)<=month);
 const start=new Date(date+'T12:00:00Z');start.setUTCMonth(start.getUTCMonth()-11,1);
 const from=start.toISOString().slice(0,7);
 for(const x of valid){
  let a=bySku.get(x.sku);if(!a){a={sku:x.sku,product:x.product,revenue:0,qty:0,last_purchase:null,months:new Set(),previous_autumn:{october:0,november:0,december:0},recent:[]};bySku.set(x.sku,a);}
  const m=String(x.month).slice(0,7),q=Number(x.qty)||0;
  if(q>0&&(!a.last_purchase||m>a.last_purchase))a.last_purchase=m;
  if(m>=from){a.revenue+=Number(x.revenue)||0;a.qty+=q;if(q>0)a.months.add(m);}
  if(m.startsWith(String(year-1))&&['10','11','12'].includes(m.slice(5)))a.previous_autumn[({'10':'october','11':'november','12':'december'})[m.slice(5)]]+=q;
  if(m>=from)a.recent.push({month:m,qty:q,revenue:Number(x.revenue)||0});
 }
 const ranked=[...bySku.values()].sort((a,b)=>b.revenue-a.revenue||a.sku.localeCompare(b.sku));
 const total=ranked.reduce((n,x)=>n+Math.max(0,x.revenue),0);let cumulative=0;
 for(const a of ranked){a.abc=total&&a.revenue>0?(cumulative/total<.8?'A':cumulative/total<.95?'B':'C'):null;cumulative+=Math.max(0,a.revenue);a.purchase_months=a.months.size;delete a.months;a.recent.sort((a,b)=>b.month.localeCompare(a.month));}
 return {basis:'ABC по выручке клиента: A до 80%, B до 95%, C остаток; пограничный SKU относится к начатой группе. Возвраты учтены. Прибыли в источнике нет.',from,to:month,previous_season_year:year-1,history_rows:valid.length,coverage_months:[...new Set(valid.map(x=>String(x.month).slice(0,7)))].sort(),items:ranked};
}
