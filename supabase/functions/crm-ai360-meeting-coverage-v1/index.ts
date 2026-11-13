/* Lera meeting coverage. Read-only, owner-only, on demand.
 * Reuses the reviewed AI360 domain catalog; samples are NOT full audits.
 * Missing, stale and unsupported sources are never claimed as checked. */
import {createClient} from 'npm:@supabase/supabase-js@2.56.0';
import {CRM_AI360_TOOLS,CRM_AI360_MANAGED_DOMAINS,CRM_AI360_ALL_DOMAINS,collectTool} from './catalog.mjs';
const OWNER='544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
const ORIGINS=new Set(['https://resanta-crm.by','https://www.resanta-crm.by']);
const hdr=req=>({'Access-Control-Allow-Origin':ORIGINS.has(req.headers.get('Origin')||'')?req.headers.get('Origin'):'https://resanta-crm.by',
 'Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type',
 'Access-Control-Allow-Methods':'POST,OPTIONS','Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'private, no-store','Vary':'Origin'});
const reply=(req,body,status=200)=>new Response(JSON.stringify(body),{status,headers:hdr(req)});
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const num=x=>Number.isFinite(Number(x))?Number(x):0;
const cash=n=>num(n).toLocaleString('ru-RU',{maximumFractionDigits:2})+' BYN';
const limited=(s,max=170)=>String(s??'').replace(/[\r\n\t]+/g,' ').trim().slice(0,max);
const dates=['report_date','snapshot_date','computed_at','updated_at','last_success_at','finished_at','created_at','last_seen_at','document_at','date','visit_date','work_date','period_start'];
function latest(rows){
 let out='';
 for(const row of rows)for(const key of dates){
   const value=String(row?.[key]||'');
   if(/^20\d\d-\d\d-\d\d/.test(value) && (!out||out<value))out=value.slice(0,10);
 }
 return out||null;
}
function evidence(tool,rows,asOf){
 if(!rows.length)return null;
 const name=tool.id;
 // Statements are bounded by the observed short sample; never extend them to all CRM.
 if(name==='debt'){
  const relevant=rows.filter(x=>num(x.debt_overdue)>0);
  if(relevant.length)return {id:'debt_sample',domain:name,priority:'medium',title:'ПДЗ · подтверждённая просрочка в выборке',
   fact:'В ограниченной выборке '+relevant.length+' записей с просрочкой; сумма выбранных записей '+cash(relevant.reduce((a,x)=>a+num(x.debt_overdue),0))+'.',
   action:'Открыть ПДЗ и проверить весь актуальный отчёт, ответственных и обещанные оплаты.'};
 }
 if(name==='tasks'||name==='triovist_tasks'){
  const late=rows.filter(x=>x.due_date&&String(x.due_date)<asOf&&x.done!==true&&x.status!=='done');
  if(late.length)return {id:name+'_sample',domain:name,priority:'medium',title:'Задачи · сроки в ограниченной выборке',
   fact:'Среди последних доступных записей '+late.length+' имеют прошедший срок. Это НЕ итоговое количество просроченных задач.',
   action:'Открыть раздел задач и проверить полный список и ответственных.'};
 }
 if(name==='gps'){
  const stale=rows.filter(x=>x.aggregation_status==='stale');
  if(stale.length)return {id:'gps_sample',domain:name,priority:'medium',title:'GPS · устаревшие агрегаты',
   fact:'В ограниченной выборке '+stale.length+' GPS-агрегатов отмечены как stale. Это не нарушение менеджеров.',
   action:'Проверить GPS-доказательства и исключить неподтверждённые выводы.'};
 }
 if(name==='parser'){
  const failures=rows.filter(x=>num(x.error_count)>0);
  if(failures.length)return {id:'parser_sample',domain:name,priority:'medium',title:'Парсер 21vek · ошибки запусков',
   fact:'В ограниченной выборке '+failures.length+' запусков содержат ошибки.',
   action:'Открыть журнал парсера и проверить причину и охват товарных групп.'};
 }
 if(name==='cards_21vek'){
  const negatives=rows.filter(x=>num(x.negative_reviews)>0||num(x.unanswered_questions)>0);
  if(negatives.length)return {id:'cards_sample',domain:name,priority:'medium',title:'21vek · карточки требуют проверки',
   fact:'В ограниченной выборке '+negatives.length+' карточек с негативными отзывами или вопросами.',
   action:'Открыть карточки, оценить свежесть и назначить проверку менеджеру.'};
 }
 return null;
}
function formatResult(tool,result,asOf){
 if(result?.error)return {id:tool.id,label:tool.label,status:'unavailable',
  source:tool.table,reason:'Источник '+tool.table+' не удалось прочитать.',sample_count:0,
  as_of:null,coverage:'none'};
 const rows=Array.isArray(result?.rows)?result.rows:[];
 return {id:tool.id,label:tool.label,
  status:'partial',source:tool.table,sample_count:rows.length,
  as_of:latest(rows),has_more:result?.has_more===true,
  reason:rows.length?
   'Прочитана ограниченная выборка '+rows.length+' строк. Для полного вывода нужны профильные расчёты и проверка свежести.':
   'Источник ответил, но выбранная выборка пустая. Отсутствие проблем не доказано.',
  coverage:'sample_only',signal:evidence(tool,rows,asOf)};
}
Deno.serve(async req=>{
 const origin=req.headers.get('Origin')||'';
 if(origin&&!ORIGINS.has(origin))return reply(req,{error:'origin_not_allowed'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:hdr(req)});
 if(req.method!=='POST')return reply(req,{error:'method_not_allowed'},405);
 const token=String(req.headers.get('Authorization')||'').replace(/^Bearer /,'');
 if(token.length<15||token.length>6000)return reply(req,{error:'not_authorized'},401);
 let body=null;try{body=await req.json();}catch{return reply(req,{error:'invalid_request'},400);}
 if(!body||body.kind!=='meeting_coverage'||Object.keys(body).length!==1)
  return reply(req,{error:'invalid_request'},400);
 const url=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
 if(!url||!key)return reply(req,{error:'service_unavailable'},503);
 const svc=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const auth=await svc.auth.getUser(token).catch(()=>null);
 if(auth?.data?.user?.id!==OWNER||String(auth?.data?.user?.email||'').toLowerCase()!=='payushin_ar@resanta.ru')
  return reply(req,{error:'not_authorized'},403);
 const profile=await svc.from('users').select('id,email,role').eq('id',OWNER).maybeSingle();
 if(profile.error||profile.data?.role!=='boss'||
   String(profile.data?.email||'').toLowerCase()!=='payushin_ar@resanta.ru')
  return reply(req,{error:'not_authorized'},403);
 const asOf=today(),entries=Array(CRM_AI360_TOOLS.length);
 let cursor=0;
 // On-demand, fixed low concurrency: never fetch full datasets or launch a
 // browser-side avalanche of 34 parallel queries.
 await Promise.all(Array.from({length:3},async()=>{
  while(cursor<CRM_AI360_TOOLS.length){
   const i=cursor++,tool=CRM_AI360_TOOLS[i];
   try{entries[i]=formatResult(tool,await collectTool(svc,tool.id),asOf);}
   catch{entries[i]=formatResult(tool,{error:'source_unavailable'},asOf);}
  }
 }));
 const managed=CRM_AI360_MANAGED_DOMAINS.map(id=>({id,label:id,
  status:'separate_brief',coverage:'not_scanned_here',source:null,sample_count:0,as_of:null,
  reason:'Нужен отдельный профильный расчёт. Наличие раздела или предыдущего брифинга не доказывает полную проверку.'}));
 const all=[...managed,...entries],signals=all.filter(x=>x.signal).map(x=>({
  ...x.signal,source:x.source,as_of:x.as_of,scope:'limited_sample'
 })).slice(0,12);
 return reply(req,{kind:'meeting_coverage',mode:'readonly',as_of:asOf,
  registered:CRM_AI360_ALL_DOMAINS.length,examined:all.length,
  sample_sources:entries.filter(x=>x.status==='partial').length,
  unavailable:entries.filter(x=>x.status==='unavailable').length,
  managed_pending:managed.length,entries:all.map(({signal,...x})=>x),
  signals,warnings:[
   'Ограниченная выборка НЕ является полным анализом раздела.',
   'Нет данных — не означает отсутствие проблем.',
   'Ни одна задача, встреча или санкция не создана.']
 });
});
