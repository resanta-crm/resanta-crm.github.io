// AI360 server-only read catalog. Every field is explicit and every result has a hard cap.
// Never import this file in a browser, expose a service-role key, or accept table/field names from an LLM.
// Stage 1: broad domain availability; deep factual analysis uses dedicated snapshots/RPCs.
export const CRM_AI360_TOOLS = Object.freeze([
 {id:'clients',label:'Клиенты и падающие клиенты',table:'clients',columns:'name,manager_name,region,client_status,sku_count,vip_growth_pct,created_at',sort:'created_at',limit:6,managerColumn:'manager_name'},
 {id:'visits',label:'Посещения и переговоры',table:'visits',columns:'date,manager_name,goal,result,goal_achieved,order_received,next_contact_date',sort:'date',limit:6,managerColumn:'manager_name'},
 {id:'routes',label:'Маршруты',table:'route_plans',columns:'visit_date,manager_name,client_name,city,status,approved,visited',sort:'visit_date',limit:8,managerColumn:'manager_name'},
 {id:'tasks',label:'Задачи ИИ',table:'tasks',columns:'title,manager_name,priority,due_date,done,review_status,created_at',sort:'created_at',limit:6,managerColumn:'manager_name',where:[['done','eq',false]]},
 {id:'debt',label:'ПДЗ',table:'client_debt',columns:'client_name,manager_name,debt_overdue,debt_overdue_days,report_date',sort:'debt_overdue',limit:6,managerColumn:'manager_name'},
 {id:'gps',label:'GPS-контроль',table:'gps_workday_aggregates',columns:'work_date,manager_name,physical_stops,planned_count,visited_count,missed_count,distance_m,aggregation_status',sort:'work_date',limit:8,managerColumn:'manager_name'},
 {id:'imports',label:'Свежесть загрузок',table:'crm_import_status',columns:'source,status,last_success_at,report_date,row_count,updated_at',sort:'updated_at',limit:12},
 {id:'stock',label:'Остатки склада',table:'stock_balances',columns:'sku,product,warehouse,qty_onhand,qty_reserve,qty_avail,report_date',sort:'updated_at',limit:6},
 {id:'stock_freshness',label:'Склад — дата обновления',table:'warehouse_stock_import_state',columns:'warehouse,report_date,row_count,updated_at,checked_at',sort:'updated_at',limit:5},
 {id:'markdown',label:'Уценка',table:'markdown_items',columns:'article,nomenclature,quantity,discount_pct,status,review_status,updated_at',sort:'updated_at',limit:6,where:[['is_active','eq',true]]},
 {id:'stands',label:'Стенды',table:'stand_assets_v236346',columns:'asset_code,branch_region,status,condition_status,current_manager_name,updated_at',sort:'updated_at',limit:6},
 {id:'warehouse_orders',label:'ТСД — комплектация',table:'warehouse_pick_orders_v1',columns:'document_no,document_date,customer_display,status,line_count,total_qty,updated_at',sort:'updated_at',limit:6},
 {id:'warehouse_receiving',label:'ТСД — приёмка',table:'warehouse_receiving_sessions',columns:'document_no,warehouse,status,expected_sku_count,expected_qty,created_at',sort:'created_at',limit:6},
 {id:'warehouse_inventory',label:'ТСД — инвентаризация',table:'warehouse_inventory_sessions',columns:'warehouse,status,stock_sku_count,started_at,completed_at',sort:'started_at',limit:6},
 {id:'competitors',label:'Конкуренты 21vek',table:'triovist_competitor_analysis_current',columns:'our_sku,our_price,competitor_price,price_delta_pct,status,computed_at',sort:'computed_at',limit:6},
 {id:'cards_21vek',label:'Карточки 21vek',table:'triovist_content_cards',columns:'sku,product_name,in_stock,photo_count,review_count,unanswered_questions,negative_reviews,created_at',sort:'created_at',limit:6},
 {id:'card_issues',label:'Ошибки карточек 21vek',table:'triovist_content_issues',columns:'issue_title,issue_type,severity,status,last_seen_at',sort:'last_seen_at',limit:6},
 {id:'triovist_stock',label:'Триовист — остатки',table:'triovist_partner_stock',columns:'sku,product,qty_free,qty_orders,snapshot_date,excluded',sort:'snapshot_date',limit:6},
 {id:'triovist_tasks',label:'Триовист — ИИ задачи',table:'triovist_ai_tasks',columns:'manager_name,title,status,priority_score,due_date,updated_at',sort:'updated_at',limit:6},
 {id:'vip_actions',label:'VIP — рекомендации',table:'vip_action_recommendations',columns:'client_name,vip_department,loss_revenue,drop_pct,recommendation_type,status,updated_at',sort:'updated_at',limit:6,where:[['is_active','eq',true]]},
 {id:'cash',label:'Поступления денег 1С',table:'cash_receipts_1c',columns:'manager_name,client_name,document_at,amount,source_message_at',sort:'document_at',limit:6,managerColumn:'manager_name'},
 {id:'promotion_budgets',label:'Бюджеты акций',table:'promotion_budgets',columns:'client_name,manager_name,period_start,period_end,budget_total,balance_as_of',sort:'period_end',limit:6,managerColumn:'manager_name'},
 {id:'mrc',label:'МРЦ и цены Триовиста',table:'triovist_mrc_current',columns:'sku,product_name,mrc_byn,effective_date,imported_at',sort:'imported_at',limit:6},
 {id:'infographics',label:'Статус инфографики',table:'triovist_infographic_factory_batches_v5',columns:'status,stage,total_items,completed_items,failed_items,attention_items,created_at',sort:'created_at',limit:5},
 {id:'parser',label:'Обновление парсера 21vek',table:'triovist_market_position_watch_runs_v236352',columns:'status,tracked_count,success_count,error_count,started_at,finished_at',sort:'started_at',limit:6}
]);
export const CRM_AI360_MANAGED_DOMAINS=Object.freeze(['sales','operations','promotions','triovist','vip','payments','client_schedule','client_detail']);
export const CRM_AI360_ALL_DOMAINS=Object.freeze([...CRM_AI360_MANAGED_DOMAINS,...CRM_AI360_TOOLS.map(x=>x.id)]);
export function getTool(id){return CRM_AI360_TOOLS.find(x=>x.id===id)||null;}
export function clampDomains(names,max=4){
 const out=[],allowed=new Set(CRM_AI360_ALL_DOMAINS);
 for(const name of Array.isArray(names)?names:[]){if(typeof name==='string'&&allowed.has(name)&&!out.includes(name))out.push(name);if(out.length>=max)break;}
 return out;
}
/** @param {any} svc @param {string} id @param {{manager?:string|null,signal?:AbortSignal|null}} [options] */
export async function collectTool(svc,id,{manager=null,signal=null}={}){
 const tool=getTool(id);
 if(!tool)return {domain:id,error:'unknown_domain'};
 try{
  let query=svc.from(tool.table).select(tool.columns);
  for(const [column,op,value] of tool.where||[])if(op==='eq')query=query.eq(column,value);
  if(manager&&tool.managerColumn)query=query.eq(tool.managerColumn,manager);
  if(tool.sort)query=query.order(tool.sort,{ascending:false});
  query=query.limit(Math.min(12,tool.limit));
  if(signal)query=query.abortSignal(signal);
  const {data,error}=await query;
  if(error)return {domain:id,error:'source_unavailable'};
  return {domain:id,source:tool.table,limited:true,max_rows:tool.limit,rows:(data||[]).slice(0,tool.limit)};
 }catch{return {domain:id,error:'source_unavailable'};}
}


// The voice capability registry is generated from the existing explicit safe allowlist.
// Adding a reviewed CRM_AI360_TOOLS entry automatically enables discovery and routing;
// arbitrary new public tables are NEVER readable without explicit registration.
const MANAGED_VOICE_LABELS=Object.freeze({
 sales:'Продажи и KPI',operations:'Сводка и аналитика',promotions:'Акции',
 triovist:'Триовист',vip:'VIP-клиенты',payments:'Реестр оплат',
 client_schedule:'Поручения и маршруты клиента',client_detail:'Группы, подгруппы и SKU клиента'
});
const VOICE_ALIASES=Object.freeze([
 ['warehouse_inventory',/инвентаризац|пересч[её]т.*склад/i],
 ['warehouse_receiving',/при[её]мк|поступлени.*склад|тсд.*приход/i],
 ['warehouse_orders',/комплектац|сборк.*накладн|тсд.*отгруз/i],
 ['stock_freshness',/свежест.*остатк|обновлени.*склад/i],
 ['triovist_stock',/остатк.*триовист|остатк.*21\s*век/i],
 ['triovist_tasks',/задач.*триовист|триовист.*задач/i],
 ['promotion_budgets',/бюджет.*акци|расход.*акци/i],
 ['card_issues',/ошибк.*карточ|проблем.*карточ/i],
 ['cards_21vek',/карточк.*21\s*век|карточк.*21vek/i],
 ['competitors',/конкурент|ценов.*паритет/i],
 ['infographics',/инфографик/i],
 ['parser',/парсер|парсинг/i],
 ['mrc',/мрц|минимальн.*цен/i],
 ['gps',/gps|джипиэс|геолокац|достоверност.*визит/i],
 ['routes',/маршрут|план.*посещен/i],
 ['visits',/визит|посещен|переговор/i],
 ['debt',/пдз|просроч.*долг|дебиторк|задолженност/i],
 ['cash',/поступлени.*ден|кассов.*поступлен/i],
 ['payments',/реестр.*оплат|плат[её]жн.*реестр/i],
 ['markdown',/уценк/i],
 ['stands',/стенд/i],
 ['vip_actions',/vip.*рекомендац|вип.*рекомендац/i],
 ['vip',/вип.*клиент|vip.*клиент/i],
 ['promotions',/акци|промо/i],
 ['stock',/остатк|наличи.*склад/i],
 ['tasks',/поручен|задач/i],
 ['clients',/падающ.*клиент|клиентск.*баз/i],
 ['sales',/продаж|выручк|оборот|kpi|план.*факт/i],
 ['operations',/сводк|итог.*филиал/i],
 ['triovist',/триовист|тривист|21\s*век/i]
]);
const normalizeLabel=x=>String(x||'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^а-яa-z0-9]+/g,' ').trim();
export function getVoiceCapabilities(){
 return CRM_AI360_ALL_DOMAINS.map(id=>({
  id,label:getTool(id)?.label||MANAGED_VOICE_LABELS[id]||id,
  scope:'registered_read_only',requires_owner:true
 }));
}
export function inferVoiceDomain(question){
 const raw=String(question||'').slice(0,400);
 if(!raw.trim())return null;
 for(const [domain,re] of VOICE_ALIASES)if(CRM_AI360_ALL_DOMAINS.includes(domain)&&re.test(raw))return domain;
 const query=normalizeLabel(raw);
 const hits=getVoiceCapabilities().filter(x=>{
  const name=normalizeLabel(x.label);
  return name.length>=5&&query.includes(name);
 });
 return hits.length===1?hits[0].id:null;
}
