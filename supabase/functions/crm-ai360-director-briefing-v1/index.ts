// AI360 director proactive daily briefing, v1. Rules + verified CRM snapshots, no LLM.
// On-demand by director action ONLY; no cron, mutations, emails or task creation.
import {createClient} from 'npm:@supabase/supabase-js@2.56.0';
const OWNER_ID='544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
const ORIGINS=new Set(['https://resanta-crm.by','https://www.resanta-crm.by']);
const headers=req=>({'Access-Control-Allow-Origin':ORIGINS.has(req.headers.get('Origin')||'')?req.headers.get('Origin')!:'https://resanta-crm.by','Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'});
const reply=(req,data,status=200)=>new Response(JSON.stringify(data),{status,headers:headers(req)});
const tzDay=()=>{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const value=k=>parts.find(p=>p.type===k)?.value||'';
 return value('year')+'-'+value('month')+'-'+value('day');
};
const n=x=>Number.isFinite(Number(x))?Number(x):0;
const rub=x=>n(x).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const stamp=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)?x:null;
const daysOld=(today,when)=>{
 if(!stamp(when))return null;
 return Math.round((Date.parse(today+'T12:00:00Z')-Date.parse(when+'T12:00:00Z'))/86400000);
};
function card(id,level,title,fact,action,source,as_of,attention){
 return {id,level,title,fact,action,source,as_of,attention:!!attention,kind:'director_recommendation_not_task'};
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers(req)});
 if(req.method!=='POST')return reply(req,{error:'method_not_allowed'},405);
 const origin=req.headers.get('Origin');
 if(origin&&!ORIGINS.has(origin))return reply(req,{error:'origin_not_allowed'},403);
 const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
 if(!token||token.length>6000)return reply(req,{error:'not_authorized'},401);
 let body:any;
 try{body=await req.json()}catch{return reply(req,{error:'invalid_json'},400)}
 if(body?.kind!=='director_brief'||Object.keys(body).length!==1)return reply(req,{error:'invalid_request'},400);
 const url=Deno.env.get('SUPABASE_URL'),service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!service)return reply(req,{error:'service_unavailable'},503);
 const svc=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
 const auth=await svc.auth.getUser(token).catch(()=>null);
 const user=auth?.data?.user;
 if(!user?.id||user.id!==OWNER_ID)return reply(req,{error:'not_authorized'},403);
 const profile=await svc.from('users').select('id,name,role').eq('id',user.id).maybeSingle();
 if(profile.error||profile.data?.role!=='boss'||
  String(profile.data?.name||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU')!=='александр паюшин')
   return reply(req,{error:'not_authorized'},403);
 const today=tzDay(),month=today.slice(0,7)+'-01';
 // Two existing director snapshots and a service_role-only Triovist RPC.
 // Select status counts independently so stale_review is not misrepresented.
 const [salesRes,opsRes,triRes,approvedRes,staleRes]=await Promise.all([
   svc.rpc('crm_ai360_sales_kpi_snapshot_v1',{p_month:month}),
   svc.rpc('crm_ai360_operations_snapshot_v1',{p_manager:null,p_month:month}),
   svc.rpc('crm_ai360_triovist_brief_v1',{p_month:month}),
   svc.from('tasks').select('id',{head:true,count:'exact'}).or('done.eq.false,done.is.null').eq('review_status','approved').lt('due_date',today),
   svc.from('tasks').select('id',{head:true,count:'exact'}).or('done.eq.false,done.is.null').eq('review_status','stale_review').lt('due_date',today)
 ]);
 if(salesRes.error||opsRes.error||!salesRes.data||!opsRes.data||
   opsRes.data?.period?.as_of!==today)
   return reply(req,{error:'source_unavailable',details:'CRM sales or operations snapshot unavailable'},503);
 const sales=salesRes.data,ops=opsRes.data,tri=triRes.error?null:triRes.data;
 const warnings:string[]=[];
 if(Array.isArray(sales.warnings))warnings.push(...sales.warnings.filter((x:any)=>typeof x==='string').slice(0,3));
 if(Array.isArray(ops.warnings))warnings.push(...ops.warnings.filter((x:any)=>typeof x==='string').slice(0,2));
 const importDay=stamp(sales.freshness?.report_date);
 if(!importDay||importDay>today)warnings.unshift('Дата отчёта импорта продаж позже текущего дня либо неизвестна. Октябрьский факт считать предварительным; продаж за конкретный день здесь нет.');
 const managers=(Array.isArray(sales.managers)?sales.managers:[])
  .filter((x:any)=>x&&typeof x.manager_name==='string'&&n(x.plan)>0&&n(x.to_plan)>0)
  .sort((a:any,b:any)=>n(a.plan_pct)-n(b.plan_pct));
 const m=managers[0];
 const items:any[]=[];
 items.push(m?
   card('sales','high','Отставание от плана: '+m.manager_name,
     'Октябрь: '+rub(m.actual)+' из '+rub(m.plan)+' ('+n(m.plan_pct).toFixed(1)+'%). До плана '+rub(m.to_plan)+'.',
     'Проверить сделки и ближайшие отгрузки; запросить у менеджера подтверждённый план закрытия остатка. Не считать это прогнозом.',
     'CRM: crm_ai360_sales_kpi_snapshot_v1; KPI-панель',sales.freshness?.last_success_at||today,true):
   card('sales','info','Продажи: нет подтверждённого отставания',
     'В актуальном KPI-снимке нет менеджера с подтверждённым положительным остатком к плану.',
     'Проверить полноту утверждённых планов.', 'CRM: KPI-снимок',today,false));
 const debts=(Array.isArray(ops.overdue_debtors)?ops.overdue_debtors:[])
  .filter((x:any)=>n(x.debt_overdue)>0).sort((a:any,b:any)=>n(b.debt_overdue)-n(a.debt_overdue));
 const debtor=debts[0], debtDay=stamp(ops.debt_summary?.report_date);
 const debtAge=daysOld(today,debtDay);
 items.push(debtor?
   card('debt','high','ПДЗ: проверить крупнейшую просрочку',
     String(debtor.client_name||'Клиент')+' — '+rub(debtor.debt_overdue)+
       ', просрочка '+n(debtor.debt_overdue_days)+' дней; менеджер '+String(debtor.manager_name||'не определён')+
       '. Последний отчёт '+(debtDay||'неизвестен')+'.',
     'Проверить оплату, претензии и комментарии по клиенту; связаться с ответственным. Не создавать повторное поручение автоматически.',
     'CRM: crm_ai360_operations_snapshot_v1 / client_debt',debtDay||today,debtAge!==null&&debtAge>2):
   card('debt','info','ПДЗ: проверка данных','Крупных подтверждённых просроченных сумм в доступной выборке нет.',
     'Открыть реестр ПДЗ и проверить актуальность отчёта.','CRM: client_debt',debtDay||today,false));
 const all=n(ops.task_summary?.open_tasks),due=n(ops.task_summary?.overdue_tasks);
 const taskCountsOk=!approvedRes.error&&!staleRes.error&&
    Number.isSafeInteger(approvedRes.count)&&Number.isSafeInteger(staleRes.count)&&
    approvedRes.count+staleRes.count<=due;
 const counts=taskCountsOk?' Из них согласованных '+approvedRes.count+
     ', требуют пересмотра статуса '+staleRes.count+
     (due-approvedRes.count-staleRes.count>0?', прочие статусы '+(due-approvedRes.count-staleRes.count):'')+'.':
     ' Разделение по статусам сейчас не подтверждено.';
 items.push(card('tasks',due>0?'high':'info','Открытые и просроченные задачи',
     all+' открытых, '+due+' с прошедшим сроком.'+counts,
     'Сначала перепроверить задачи со статусом «требует пересмотра». Просрочку по дате не считать доказанным неисполнением.',
     'CRM: tasks / operations snapshot',today,due>0));
 const clients=(Array.isArray(ops.declining_clients)?ops.declining_clients:[]);
 const opportunity=clients.find((x:any)=>n(x.loss)>0&&n(x.open_tasks)===0&&!x.next_route&&typeof x.manager_name==='string');
 items.push(opportunity?
   card('routes','medium','Клиент с падением закупок без маршрута',
     String(opportunity.client_name||'Клиент')+' · '+String(opportunity.manager_name)+
      ': спад связанных закупок '+rub(opportunity.loss)+' (сентябрь к сентябрю прошлого года); будущий маршрут отсутствует.',
     'Предложить менеджеру проверить потребность и включение клиента в маршрут. Сначала проверить, не появилось ли новое поручение.',
     'CRM: declining_clients + routes + tasks',today,true):
   card('routes','info','Маршруты: нужен контроль выборки',
    'План на ближайшие 30 дней: '+n(ops.route_summary?.planned_next30)+
      ', согласованных '+n(ops.route_summary?.approved_next30)+'.',
    'Проверить забытых клиентов и фактические визиты; маршрут не доказывает посещение.',
    'CRM: route_plans snapshot',today,false));
 if(!tri){
   warnings.push('Триовист: серверный источник не ответил; продажи и остатки не оцениваю.');
   items.push(card('triovist','unknown','Триовист: данных недостаточно',
    'Продажи, план или остатки не удалось проверить.',
    'Открыть раздел Триовист и проверить импорт.', 'CRM: triovist aggregate unavailable',today,false));
 }else{
   const revenue=n(tri.revenue),plan=n(tri.plan),gap=Math.max(0,plan-revenue);
   const stockDay=stamp(tri.partner_stock_date),stockAge=daysOld(today,stockDay);
   const stockWarn=stockAge===null?'дата остатков неизвестна':stockAge>10?
     'остатки партнёра устарели на '+stockAge+' дней':'остатки от '+stockDay;
   const actualInfo=n(tri.revenue_positions)>0?
     ('Октябрь '+rub(revenue)+(plan>0?' из плана '+rub(plan)+' ('+(100*revenue/plan).toFixed(1)+'%). Недобор '+rub(gap)+'.':' — план не найден.') ):
     'Подтверждённые октябрьские продажи пока не найдены.';
   items.push(card('triovist',stockAge===null||stockAge>10?'high':gap>0?'medium':'info',
    'Триовист / 21vek: продажи и свежесть остатков',
    actualInfo+' Партнёр: '+stockWarn+'.',
    'Проверить актуальный остаток и пополнение 21vek, затем категории с отставанием; не обещать отгрузку по устаревшему снимку.',
    'CRM: triovist_sales_resolved_cache / triovist_plans / stock imports',stockDay||today,
    stockAge===null||stockAge>10||gap>0));
   if(stockAge===null||stockAge>10)warnings.push('Триовист: остатки партнёра не свежие; рекомендация о пополнении требует нового импорта.');
 }
 if(items.length!==5||items.some(x=>!x.title||!x.fact||!x.action||!x.source))
    return reply(req,{error:'briefing_incomplete'},503);
 return reply(req,{kind:'director_daily_brief',mode:'readonly',as_of:today,
   generated_at:new Date().toISOString(),month:today.slice(0,7),
   cards:items,items_count:5,warnings:warnings.slice(0,7),
   speech_summary:'Брифинг директора готов. Пять направлений: продажи, дебиторская задолженность, задачи, маршруты и Триовист. Подробные цифры и действия на экране. Ни одно поручение не создано.',
   disclaimer:'Предложения для проверки директором. Без создания задач, без рассылки, без изменения данных CRM.'});
});
