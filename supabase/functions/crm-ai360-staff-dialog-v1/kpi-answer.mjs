const norm=x=>String(x||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е');
const number=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const fmt=x=>Math.round(x).toLocaleString('ru-RU');
export function kpiMetric(question){
 const q=norm(question);
 if(/товар|артикул|sku|аккумулятор|вольт|подгрупп|категори|почему|причин|сравн|прогноз|прошл.*год/.test(q))return null;
 if(/(?:^|[^а-яa-z])акб(?:$|[^а-яa-z])|активн[а-я]* клиентск[а-я]* баз/.test(q))return 'akb';
 if(/клиент|триовист|21\s*век|мотивац|преми|задач|маршрут/.test(q))return null;
 return /продаж|отгруз|выруч|оборот|выполн.*план|план.*выполн|факт.*план|план.*факт/.test(q)?'sales':null;
}
export function questionMonth(question,fallback,day){
 const q=norm(question),months=['январ','феврал','март','апрел','ма[йяе]','июн','июл','август','сентябр','октябр','ноябр','декабр'];
 const iso=q.match(/20\d{2}[-.](?:0[1-9]|1[0-2])/);
 let chosen=iso?iso[0].replace('.','-'):fallback;
 const idx=months.findIndex(m=>new RegExp(m).test(q));
 if(!iso&&idx>=0)chosen=(q.match(/20\d{2}/)?.[0]||day.slice(0,4))+'-'+String(idx+1).padStart(2,'0');
 if(/прошл[а-я]* месяц/.test(q)){const d=new Date(day.slice(0,7)+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);chosen=d.toISOString().slice(0,7);}
 return /^20\d{2}-(0[1-9]|1[0-2])$/.test(chosen)&&chosen>='2025-01'&&chosen<=day.slice(0,7)?chosen:fallback;
}
export function kpiAnswer(evidence,managers,month,metric){
 if(evidence?.answer_verified!==true||evidence.read_only!==true||evidence.domain!=='sales'||
  evidence.data?.source!=='crm_ai360_sales_kpi_snapshot_v1'||evidence.data.month!==month||
  !Array.isArray(evidence.scope?.managers)||!Array.isArray(evidence.data?.managers)||
  evidence.scope.managers.length!==managers.length||evidence.scope.managers.some(x=>!managers.includes(x))||
  evidence.data.managers.some(x=>!managers.includes(x.manager_name)))return null;
 if(evidence.data.freshness_status&&evidence.data.freshness_status!=='ok')return 'В CRM нет свежего подтверждённого отчёта за выбранный месяц. Показатели пока не называю.';
 const lines=[];
 for(const name of managers){
  const matches=evidence.data.managers.filter(x=>x.manager_name===name);
  if(matches.length!==1)return null;
  const r=matches[0],plan=number(metric==='akb'?r.akb_plan:r.plan),fact=number(metric==='akb'?r.akb:r.actual);
  if(plan===null||plan<0||fact===null||fact<0)return null;
  if(metric==='akb'&&(!Number.isInteger(plan)||!Number.isInteger(fact)))return null;
  const pct=plan>0?(fact/plan*100).toLocaleString('ru-RU',{maximumFractionDigits:1})+'%':'процент не рассчитывается при нулевом плане';
  lines.push(name+': '+(metric==='akb'?'АКБ — '+fmt(fact)+' клиентов при плане '+fmt(plan):'план продаж '+fmt(plan)+' белорусских рублей, факт '+fmt(fact)+' белорусских рублей')+', выполнение '+pct+'.');
 }
 return 'За '+month+': '+lines.join(' ')+(metric==='akb'?' АКБ — активная клиентская база, число клиентов с покупками за месяц.':'');
}
