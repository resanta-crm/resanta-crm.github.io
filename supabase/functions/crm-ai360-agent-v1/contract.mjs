// RESANTA AI Agent 360 - phase 1 contract. NOT an authorization mechanism on the client.
// Exact role / user checks are inherited from the existing server-side AI360 pilots.
// No generic database tools or CRM write operations are exposed here.
import {CRM_AI360_ALL_DOMAINS} from './catalog.mjs';
import {staffPermission} from './permissions.mjs';

export const AGENT360_OWNER_ID='544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
export const AGENT360_PETROVICHEV_ID='a24954b8-2fe1-4852-b629-d8f351e1bd36';
// User-requested address forms are presentation only, never access-control inputs.
const GREETINGS=Object.freeze({
 [AGENT360_OWNER_ID]:'Александр',
 [AGENT360_PETROVICHEV_ID]:'Виталий',
 'ba55dfe5-7e48-4f1f-b40e-674c7752fe1a':'Кирилл',
 '19dd9943-99ae-47c4-a39c-4f82a11059a6':'Александр',
 '3d935a76-c6fe-44b6-b248-fcbe58c6bf1c':'Екатерина',
 '4fd79fa0-232d-4768-8099-25f47923cc4f':'Татьяна',
 '6efa656e-45c6-473b-a853-89eccb9ee43a':'Александр',
 '9076ccde-a8cc-47e3-b71e-c31170b693ff':'Наталья'
});
export function agentGreeting(principal){
 return principal&&GREETINGS[principal.user_id]||'';
}
const normalize=x=>String(x||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU').replaceAll('ё','е');

// These are UI/navigation capabilities, not proof that every dataset in a page is wired.
// Every item explicitly lists its existing verified backend read domains, where available.
// This list must be extended whenever a CRM navigation section is introduced.
export const AGENT360_SURFACES=Object.freeze([
 {id:'nav-dashboard',name:'Сводка',domains:['operations','sales']},
 {id:'nav-alerts',name:'Сигналы',domains:['operations','clients','tasks']},
 {id:'nav-clients',name:'Клиенты 360°',domains:['clients','client_detail','client_schedule']},
 {id:'nav-connect',name:'Чаты и видеозвонки',domains:[]},
 {id:'nav-meeting-planner',name:'Календарь и совещания (персональный пилот)',domains:[]},
 {id:'nav-tasks',name:'Задачи',domains:['tasks','triovist_tasks']},
 {id:'nav-markdown',name:'Уценка',domains:['markdown']},
 {id:'nav-visits',name:'Визиты',domains:['visits']},
 {id:'nav-vip',name:'ВИП клиенты',domains:['vip','vip_actions']},
 {id:'nav-promotions',name:'Акции 360°',domains:['promotions','promotion_budgets']},
 {id:'nav-stands',name:'Стенды',domains:['stands']},
 {id:'nav-vip-actions',name:'Акции VIP',domains:['vip_actions','promotions']},
 {id:'nav-budgets',name:'Бюджеты клиентов',domains:['promotion_budgets']},
 {id:'nav-debt',name:'Задолженность',domains:['debt']},
 {id:'nav-sales',name:'Продажи 360°',domains:['sales']},
 {id:'nav-abc',name:'ABC-анализ',domains:['sales','clients']},
 {id:'nav-my-routes',name:'Мой маршрут',domains:['routes']},
 {id:'nav-route',name:'Маршрут дня',domains:['routes']},
 {id:'nav-workday',name:'Рабочий день',domains:['visits','routes']},
 {id:'nav-control',name:'Контроль руководителя',domains:['operations','tasks','gps']},
 {id:'nav-gps-control',name:'GPS-контроль',domains:['gps']},
 {id:'nav-managers',name:'Менеджеры · KPI 360°',domains:['sales','motivation']},
 {id:'nav-routes-boss',name:'Маршруты · согласование',domains:['routes']},
 {id:'nav-users',name:'Пользователи и права',domains:[]},
 // Nested modules in Triovist 360 that must not be collapsed into one feature.
 {id:'triovist-summary',name:'Триовист · Сводка',domains:['triovist']},
 {id:'triovist-groups',name:'Триовист · Группы и категории',domains:['triovist','triovist_groups']},
 {id:'triovist-stock',name:'Триовист · Остатки и заказ',domains:['triovist_stock']},
 {id:'triovist-tasks',name:'Триовист · Задачи ИИ',domains:['triovist_tasks']},
 {id:'triovist-motivation',name:'Триовист · Бонусы и план',domains:['motivation']},
 {id:'triovist-cards',name:'Карточки 21vek',domains:['cards_21vek','triovist_cards','card_issues','triovist_issues']},
 {id:'triovist-parser',name:'Парсер 21vek',domains:['parser']},
 {id:'triovist-competitors',name:'Конкуренты 21vek',domains:['competitors','triovist_positions']},
 {id:'triovist-infographics',name:'Инфографика 21vek',domains:['infographics','triovist_infographics']},
 {id:'triovist-shares',name:'Доли 21vek',domains:[]},
 // Secondary modules not necessarily present in main left navigation.
 {id:'warehouse-stock',name:'Склад и остатки',domains:['stock','stock_freshness']},
 {id:'warehouse-tsd',name:'ТСД · комплектация, приёмка, инвентаризация',domains:['warehouse_orders','warehouse_receiving','warehouse_inventory']},
 {id:'payment-register',name:'Реестр оплат',domains:['payments','cash']},
 {id:'data-imports',name:'Поступления и свежесть данных',domains:['imports','cash']},
 {id:'pricing-mrc',name:'Цены МРЦ',domains:['mrc']}
].map(x=>Object.freeze({...x,domains:Object.freeze(x.domains)})));

export const AGENT360_NAV_IDS=Object.freeze(AGENT360_SURFACES.filter(x=>x.id.startsWith('nav-')).map(x=>x.id));

export function agentPrincipal(userId,profile,authUser=null){
 if(!userId||!profile||profile.id!==userId)return null;
 // The director endpoint has its own immutable owner and role checks as well.
 if(userId===AGENT360_OWNER_ID && profile.role==='boss' &&
    normalize(profile.name)==='александр паюшин')
  return Object.freeze({user_id:userId,tier:'network_director',endpoint:'crm-ai360-dialog-v4',
    domains:CRM_AI360_ALL_DOMAINS,read_only:true});
 // Specific executive account authenticated AND email-confirmed in Supabase Auth.
 // Its role, region, access scope and email are verified a second time by
 // crm-ai360-director-peer-v1; never impersonate the owner's JWT.
 if(userId===AGENT360_PETROVICHEV_ID &&
    authUser?.id===userId && normalize(authUser?.email)==='petrovichev@resanta.ru' &&
    !!authUser?.email_confirmed_at &&
    profile.role==='boss' && profile.region==='Все филиалы' &&
    profile.access_scope==='standard' &&
    normalize(profile.name)==='руководство компании' &&
    normalize(profile.email)==='petrovichev@resanta.ru')
   return Object.freeze({user_id:userId,tier:'network_director',
     endpoint:'crm-ai360-director-peer-v1',
     domains:CRM_AI360_ALL_DOMAINS,read_only:true});
 const staff=staffPermission(userId,profile);
 if(!staff)return null;
 return Object.freeze({user_id:userId,tier:staff.tier,endpoint:'crm-ai360-staff-dialog-v1',
  domains:staff.domains,read_only:true});
}

// A registered page does NOT imply a complete answer to arbitrary questions.
// The status is "partial" if at least one server-allowed dataset exists; never "fully covered".
export function agentCapabilities(principal){
 if(!principal)return null;
 const allowed=new Set(principal.domains);
 return {
  mode:'ai_agent360_foundation_v1',read_only:true,can_execute_writes:false,
  tier:principal.tier,greeting:agentGreeting(principal),
  supported_domains:[...principal.domains],
  surfaces:AGENT360_SURFACES.map(x=>{
   const ready=x.domains.filter(d=>allowed.has(d));
   return {id:x.id,name:x.name,available_read_domains:ready,
    coverage:ready.length?'partial':'not_connected_or_not_authorized'};
  })
 };
}

const text=(value,limit)=>typeof value==='string'?value.trim().slice(0,limit):'';
export function normalizeAgentRequest(input,principal){
 if(!principal||!input||typeof input!=='object'||Array.isArray(input))
  return {error:'not_authorized'};
 const action=input.action===undefined?'ask':input.action;
 if(action==='capabilities')return {action};
 // Never route "create", "update", "delete", "approve", "send", or arbitrary tools.
 if(action!=='ask')return {error:'action_not_available'};
 if(typeof input.question!=='string'||input.question.trim().length<2||
    input.question.length>2400)return {error:'question_invalid'};
 const question=text(input.question,2400);
 const history=(Array.isArray(input.history)?input.history:[]).slice(-6)
  .filter(x=>x&&typeof x==='object'&&['user','assistant'].includes(x.role))
  .map(x=>({role:x.role,content:text(x.content,250)}));
 const raw=input.memory&&typeof input.memory==='object'&&!Array.isArray(input.memory)?input.memory:{};
 const memory={
  manager:text(raw.manager,90),month:text(raw.month,7),client:text(raw.client,160),
  group:text(raw.group,120),subgroup:text(raw.subgroup,120),
  level:['groups','subgroups','sku'].includes(raw.level)?raw.level:'',
  offset:Number.isSafeInteger(raw.offset)?Math.max(0,Math.min(200,raw.offset)):0,
  subject:['client','manager','network'].includes(raw.subject)?raw.subject:'',
  domain:text(raw.domain,40)
 };
 // Each existing backend reauthorizes all names, months, domains, entities and scopes.
 const payload=principal.tier==='network_director'
  ?{message:question,history,memory}
  :{question,history,memory,month:memory.month||null};
 return {action:'ask',endpoint:principal.endpoint,payload};
}
