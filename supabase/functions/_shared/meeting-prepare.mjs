import {CRM_AI360_TOOLS,CRM_AI360_MANAGED_DOMAINS} from '../crm-ai360-meeting-coverage-v1/catalog.mjs';
import {buildMeetingBrief} from './meeting-brief.mjs';
import {allowedManagers} from './meeting-access.mjs';
const ownDomains=new Set(['clients','visits','routes','tasks','debt','lpr']);
const SOURCES=[...CRM_AI360_TOOLS,{id:'lpr',label:'ЛПР и дни рождения · полнота карточек',table:'crm_lpr_contacts_v1',managerColumn:'responsible_user_id'}];
export async function prepareMeeting(svc,access,context,today){
 const managers=allowedManagers(access,context.manager);
 const canRead=access.network||(!access.category&&managers.length>0);
 const list=managers===null?[null]:managers;
 const safe=async(name,args)=>{try{const r=await svc.rpc(name,args);return r.error?null:r.data;}catch{return null;}};
 const taskMetrics=[];const entries=[];let cursor=0;
 await Promise.all(Array.from({length:3},async()=>{
  while(cursor<SOURCES.length){
   const t=SOURCES[cursor++];
   const categoryAllowed=access.category&&['cards_21vek','card_issues','triovist_tasks','lpr'].includes(t.id);
   if(!access.network&&(access.category?!categoryAllowed:(!ownDomains.has(t.id)||!t.managerColumn||!list.length))){
    entries.push({id:t.id,label:t.label,status:'restricted',reason:'Подготовка не расширяет действующие права. Используйте разрешённый профильный раздел Леры.'});continue;
   }
   const parts=await Promise.all(list.map(manager=>safe('crm_meeting_source_metrics_v2',{p_source:t.id,p_month:context.month+'-01',p_manager:manager})));
   if(parts.some(x=>!x)){entries.push({id:t.id,label:t.label,status:'unavailable',reason:'Профильные показатели источника не получены. Остальные источники проверяются независимо.'});continue;}
   const metrics={};for(const p of parts)for(const [k,v] of Object.entries(p.metrics||{}))if(v!==null)metrics[k]=(metrics[k]||0)+Number(v);
   const reports=parts.map(x=>x.report_date).filter(Boolean).sort();
   const e={id:t.id,label:t.label,status:'aggregated',coverage:'complete_metric_scope',source:t.table,metrics,as_of:reports.at(-1)||null,period_mode:parts[0]?.period_mode,check_label:parts[0]?.check_label||null,
    reason:'Показатели посчитаны по всему набору в указанной области. Это не полная проверка всех бизнес-правил раздела.'};
   entries.push(e);if(t.id==='tasks')taskMetrics.push(...parts);
  }
 }));
 const [rawSales,operations,tri]=await Promise.all([
  canRead?safe('crm_ai360_sales_kpi_snapshot_v1',{p_month:context.month+'-01'}):null,
  Promise.all((canRead?list:[]).map(manager=>safe('crm_ai360_operations_snapshot_v1',{p_manager:manager,p_month:context.month+'-01'}))),
  access.network&&!context.manager?safe('crm_ai360_triovist_brief_v1',{p_month:context.month+'-01'}):null
 ]);
 // Discard network totals when the caller requested a manager or has narrower scope.
 const sales=rawSales?(managers===null?rawSales:{managers:(rawSales.managers||[]).filter(x=>list.includes(x.manager_name)),freshness:rawSales.freshness,warnings:rawSales.warnings}):null;
 const briefing=buildMeetingBrief({today,month:context.month,sales,operations:operations.filter(Boolean),tri,taskMetrics,scope:context.manager||access.scope});
 entries.push({id:'chats',label:'Чаты',status:'restricted',reason:'Личные переписки не анализируются автоматически. Для совещания используйте явно выбранный рабочий чат CONNECT.'});
 if(!canRead)briefing.cards=[];
 briefing.items_count=briefing.cards.length;
 const managed=CRM_AI360_MANAGED_DOMAINS.map(id=>({id,label:id,status:((id==='sales'&&sales)||(id==='operations'&&operations.some(Boolean))||(id==='triovist'&&tri))?'profiled':'partial',
  reason:['sales','operations','triovist'].includes(id)?'Профильный расчёт: ограничения исходного расчёта указаны в рекомендациях.':'Отдельные бизнес-правила требуют профильного разбора; агрегаты связанных источников приведены ниже.'}));
 entries.sort((a,b)=>a.id.localeCompare(b.id));
 const signals=entries.filter(x=>Number(x.metrics?.risk_count)>0&&!['tasks','debt','routes'].includes(x.id)).map(x=>({id:x.id,domain:x.id,priority:'medium',title:x.label+' · требует проверки',
  fact:(x.check_label||({clients:'Отсутствует адрес или ответственный: ',gps:'Устаревшие GPS-агрегаты: ',cards_21vek:'Карточки с неотвеченными негативными отзывами или вопросами: ',triovist_tasks:'Активные поручения с прошедшим сроком: ',lpr:'Карточки с незаполненными датой рождения или ответственным: '}[x.id]||'Контрольный признак')).replace(/:\s*$/u,'')+': '+x.metrics.risk_count+' записей по контрольному признаку из '+x.metrics.rows+'.',
  action:'Проверить причину в профильном разделе; контрольный признак не является доказанным нарушением.',source:x.source,as_of:x.as_of,reason:x.reason,scope:'aggregate_metric'}));
 return {briefing,coverage:{kind:'meeting_coverage',mode:'readonly',as_of:today,generated_at:new Date().toISOString(),context,scope:context.manager||access.scope,
  registered:entries.length+managed.length,entries:[...managed,...entries],signals,
  aggregate_sources:entries.filter(x=>x.status==='aggregated').length,sample_sources:0,
  unavailable:entries.filter(x=>x.status==='unavailable').length,restricted:entries.filter(x=>x.status==='restricted').length,
  managed_pending:managed.filter(x=>x.status==='partial').length,
  warnings:['Агрегаты охватывают весь разрешённый набор, но не заменяют все бизнес-правила раздела.','Личные чаты не анализируются автоматически.','Транзакционные показатели относятся к выбранному месяцу; current_state — текущее состояние, не исторический снимок.']}};
}
