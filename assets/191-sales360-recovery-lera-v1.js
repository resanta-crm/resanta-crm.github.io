/* RESANTA AI360 Sales Recovery bridge v1 (read-only).
 * Unifies Lera's spoken responses and Sales360 director brief via ONE authenticated
 * crm_sales360_recovery_v4 RPC. No LLM fabrication, raw 1C downloads, or task writes.
 * Loaded at explicit director launch or with staff voice UI; no startup requests.
 */
(function(root){
'use strict';
if(root.crmAI360SalesRecoveryHandleV1)return;
const RPC='crm_sales360_recovery_v4',VERSION='sales360.recovery.4';
const noGo=/(триовист|тривист|21\s*век|21vek|конкурент|джипиэс|gps|маршрут|уценк|пдз|долг|складск.*остатк|парсер|музык)/i;
const commercial=/(продаж|выручк|отгруз|оборот|клиент|подгрупп|sku|артикул|ассортимент|сезон|категори|бензопил|генератор)/i;
const recover=/(паден|сниж|просел|просад|потер|теря|где|прибав|вырос|рост|сравн|рис[кк]|приоритет|брифинг|какие|кто|чем заняться|что проверить|возможност|sku|подгрупп|динамик)/i;
const managerNames=['Руднев','Ачинович','Шкуран','Сидорович','Александренко','Кришталь'];
let pending=false;
const normalize=s=>String(s||'').toLocaleLowerCase('ru-RU').replaceAll('ё','е').trim();
const money=v=>Math.round(Number(v)||0).toLocaleString('ru-RU',{maximumFractionDigits:0})+' BYN';
const pct=v=>v===null||v===undefined?'—':(Number(v)>0?'+':'')+Number(v).toFixed(1).replace('.',',')+'%';
const label=r=>['last3','quarter','ytd'].includes(r.period)?
 (r.period==='last3'?'последние три закрытых месяца':r.period==='quarter'?'последний полностью закрытый квартал':'с начала года по закрытый месяц'):
 'проверенный закрытый период';
const containsName=(question,name)=>{
 const q=normalize(question),n=normalize(name);
 return q.includes(n);
};
function detect(q){
 const str=normalize(q);
 return str.length>0&&!noGo.test(str)&&commercial.test(str)&&recover.test(str);
}
function who(){
 try{
  const u=typeof currentUser!=='undefined'?currentUser:null;
  const p=typeof currentProfile!=='undefined'?currentProfile:null;
  if(!u?.id||!['boss','manager'].includes(String(p?.role||'')))return null;
  return {id:String(u.id),role:String(p.role),name:String(p.name||'')};
 }catch{return null;}
}
function determineManager(query,role){
 if(role!=='boss')return null;
 const names=managerNames.filter(n=>containsName(query,n));
 return names.length===1?names[0]:null;
}
function summarize(r,q){
 const sub=Array.isArray(r.subgroups)?r.subgroups:[],clients=Array.isArray(r.clients)?r.clients:[],
  skus=Array.isArray(r.skus)?r.skus:[],growth=Array.isArray(r.growing_subgroups)?r.growing_subgroups:[];
 const year=Number(r.year),prev=Number(r.previous_year);
 const scope=r.manager?'по менеджеру '+r.manager:'по филиалу';
 let out='Проверила продажи '+scope+' за '+label(r)+': '+year+' в сравнении с '+prev+'. ';
 out+='Текущий неполный месяц исключён. ';
 if(!sub.length)out+='По заданному порогу значимых падений подгрупп не обнаружено. ';
 else out+='Падения подгрупп: '+sub.slice(0,4).map(x=>
  x.category+', '+x.subgroup+': −'+money(x.loss_byn)+' ('+pct(x.delta_pct)+')').join('; ')+'. ';
 if(!clients.length)out+='Падений клиентов выше порога не найдено. ';
 else out+='Клиенты со снижением: '+clients.slice(0,3).map(x=>
  x.client_name+(x.manager_name?' ('+x.manager_name+')':'')+': −'+money(x.loss_byn)).join('; ')+'. ';
 if(skus.length)out+='SKU с наибольшим снижением: '+skus.slice(0,2).map(x=>
  (x.sku||x.product||'Без артикула')+' — '+x.product+': −'+money(x.loss_byn)).join('; ')+'. ';
 if(/(рост|вырос|увелич|прибав|сезон)/i.test(q)){
  out+=growth.length?'Зоны роста: '+growth.slice(0,3).map(x=>x.subgroup+' +'+money(x.delta_byn)).join('; ')+'. ':
  'Подгрупп с ростом выше порога не обнаружено. ';
 }
 out+='Причины снижения ещё не установлены. Проверь остатки, клиентов, возвраты, ассортимент и сезонность. Задачи без утверждения руководителя не создаются.';
 return out;
}
function audioSummary(r){
 const sub=Array.isArray(r.subgroups)?r.subgroups:[],c=Number(r.client_drop_30_count)||0;
 return sub.length?'По продажам за закрытый период: основное падение '+sub[0].subgroup+' на '+money(sub[0].loss_byn)+'. Клиентов со снижением не менее тридцати процентов: '+c+'. Подробности на экране.':
 'По подтверждённым данным крупных падений подгрупп не найдено. Я проверила также клиентов и позиции SKU. Подробности на экране.';
}
function period(q){
 if(/(квартал|за\s+квартал)/i.test(q))return 'quarter';
 if(/(с\s+январ|с\s+начала\s+года|годов|за\s+год)/i.test(q))return 'ytd';
 return 'last3';
}
async function run(question,respond,status,live){
 const user=who();
 if(!user||!live())throw Error('not_authorized');
 const database=(typeof db!=='undefined'?db:root.db);
 if(!database?.rpc)throw Error('database_unavailable');
 const session=typeof root.crmEnsureFreshSessionV236166==='function'?
  await root.crmEnsureFreshSessionV236166(false):
  await database.auth.getSession().then(r=>r?.data?.session);
 if(!session?.access_token||!live())throw Error('not_authorized');
 const names=managerNames.filter(n=>containsName(question,n));
 if(user.role==='boss'&&names.length>1){
  respond('Назови одного менеджера для сравнения: '+names.join(' или ')+'.');
  return;
 }
 if(user.role==='manager'&&names.some(n=>normalize(n)!==normalize(user.name))){
  respond('Продажи другого менеджера недоступны по вашим правам. Могу проверить вашу закреплённую клиентскую базу.');
  return;
 }
 const explicitYear=/(?:^|\s)(20(?:2[4-9]|3[0-9]))(?:\s|$)/.exec(question);
 const args={
  p_year:explicitYear?Number(explicitYear[1]):null,
  p_manager:determineManager(question,user.role),
  p_period:period(question),p_client_key:null,p_category:null,p_subgroup:null
 };
 status?.('Проверяю закрытые месяцы по подтверждённым данным 1С…');
 const {data,error}=await database.rpc(RPC,args);
 if(error)throw error;
 if(!live())return;
 if(!data||data.version!==VERSION||!Array.isArray(data.subgroups)||!Array.isArray(data.clients))
  throw Error('unverified_sales_snapshot');
 if(user.role==='manager'&&normalize(data.manager)!==normalize(user.name))
  throw Error('manager_scope_mismatch');
 respond(summarize(data,question),audioSummary(data));
}
function handle(question,ui,mode){
 if(!detect(question))return false;
 const user=who();if(!user)return false;
 const ok=mode==='staff'?
  user.role==='manager'||user.role==='boss':
  user.role==='boss';
 if(!ok||mode==='staff'&&typeof ui?.authorized==='function'&&!ui.authorized())return false;
 const live=()=>Boolean(who()?.id===user.id)&&
  (mode!=='staff'||typeof ui?.authorized!=='function'||ui.authorized());
 const respond=(full,speech)=>{
  if(!live())return;
  if(mode==='staff')ui?.show?.(full);
  else ui?.answer?.(full,speech&&speech.length<=230?{speechSummary:speech}:undefined);
 };
 const status=m=>mode==='staff'?ui?.setStatus?.(m):ui?.textStatus?.(m);
 if(pending){respond('Предыдущий запрос по продажам ещё обрабатывается.');return true;}
 pending=true;
 void run(String(question).slice(0,350),respond,status,live)
  .catch(err=>{
   if(live())respond('Не удалось получить проверенные данные продаж ('+String(err?.message||'недоступно').slice(0,85)+'). Цифры не придумываю.');
  }).finally(()=>{pending=false;});
 return true;
}
root.crmAI360SalesRecoveryHandleV1=(q,ui)=>handle(q,ui,'director');
root.crmAI360BranchRecoveryHandleV1=(q,ui)=>handle(q,ui,'staff');
root.RESANTA_SALES_RECOVERY_LERA=Object.freeze({version:'20261110.1',rpc:RPC,detect,period,summarize,readOnly:true});
})(window);
