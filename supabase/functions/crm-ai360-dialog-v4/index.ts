import { createClient } from 'npm:@supabase/supabase-js@2.56.0';
import { CRM_AI360_ALL_DOMAINS, CRM_AI360_TOOLS, getTool, collectTool, inferVoiceDomain, getVoiceCapabilities } from './catalog.mjs';
import { runToolCore } from './core.mjs';
import { readTasks } from './task-read.mjs';
import { requestContext, effectiveManager, guardVoicePair } from './context.mjs';
import { resolveClient } from './client-identity.mjs';
import { resolveAnyClient } from './client-universal.mjs';
import {isManagerSalesQuestion,resolveSalesMonth,formatManagerSales} from './manager-sales.mjs';

// Isolated read-only director pilot. v3 is NOT imported, replaced or modified.
const ORIGINS = new Set(['https://resanta-crm.by', 'https://www.resanta-crm.by']);
const OWNER_ID = '544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
const DOMAINS = [...new Set(['debt', ...CRM_AI360_ALL_DOMAINS])];
const normalize = v => String(v ?? '').trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е');
const short = v => String(v ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, 180);
const originHeaders = origin => ({
  'Access-Control-Allow-Origin': origin && ORIGINS.has(origin) ? origin : 'https://resanta-crm.by',
  'Access-Control-Allow-Headers': 'authorization,apikey,x-client-info,content-type',
  'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Vary': 'Origin'
});
const respond = (req, data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...originHeaders(req.headers.get('Origin')), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});
function localDay() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Minsk', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(new Date());
  const get = x => parts.find(p => p.type === x)?.value || '';
  return get('year') + '-' + get('month') + '-' + get('day');
}
function period(input, fallback, today) {
  const month = typeof input === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(input) ? input : fallback;
  return month <= today.slice(0, 7) && month >= '2025-01' ? month : today.slice(0, 7);
}
async function resolveManager(svc, name) {
  if (!name) return null;
  const search = normalize(name);
  if (!search || search.length > 90) throw new Error('manager_invalid');
  const { data, error } = await svc.from('users').select('name').eq('role', 'manager').limit(100);
  if (error) throw new Error('directory_unavailable');
  const matches = (data || []).filter(u => {
    const n = normalize(u.name);
    return n === search || n.split(/\s+/).some(part =>
      part === search || (search.startsWith(part) && /^(?:а|у|е|ом|ым|ой|ей)$/.test(search.slice(part.length))));
  });
  if (matches.length !== 1) throw new Error('manager_not_unique');
  return String(matches[0].name);
}
async function managedRead(svc, domain, manager, month, day) {
  if (domain === 'sales') {
    const r = await svc.rpc('crm_ai360_sales_kpi_snapshot_v1', { p_month: month + '-01' });
    if (r.error || !r.data) throw new Error('sales_unavailable');
    const d = r.data;
    const managers = Array.isArray(d.managers) ? d.managers : [];
    const selected = manager ? managers.filter(x => normalize(x.manager_name) === normalize(manager)) : managers.slice(0, 15);
    return { domain, source: 'crm_ai360_sales_kpi_snapshot_v1', month,
      scope: manager?'manager':'network', manager:manager||null, currency:'BYN',
      as_of: d.freshness?.last_success_at || null,
      network_revenue: manager?null:d.network_revenue,
      managers:selected, partial:!manager&&managers.length>selected.length,
      note:manager?'Only this manager; network turnover intentionally excluded':'Network totals and individual managers are separate measurements' };
  }
  if (domain === 'debt') {
    const r = await svc.rpc('crm_ai360_debt_snapshot_v1', { p_manager: manager });
    if (r.error || !r.data) throw new Error('debt_unavailable');
    if (manager && normalize(r.data.scope) !== normalize(manager)) throw new Error('manager_scope_mismatch');
    return { domain, source: 'crm_ai360_debt_snapshot_v1',
      debt_summary: r.data.debt_summary, manager_totals: (r.data.manager_totals || []).slice(0, 10),
      overdue_debtors: (r.data.overdue_debtors || []).slice(0, 8), warnings: r.data.warnings || [],
      partial: true };
  }
  if (domain === 'operations') {
    const r = await svc.rpc('crm_ai360_operations_snapshot_v1', { p_manager: manager, p_month: month + '-01' });
    if (r.error || !r.data) throw new Error('operations_unavailable');
    if (manager && normalize(r.data.scope) !== normalize(manager)) throw new Error('manager_scope_mismatch');
    const d = r.data;
    return { domain, source: 'crm_ai360_operations_snapshot_v1', month,
      period: d.period, scope: d.scope, task_summary: d.task_summary,
      client_summary: d.client_summary, debt_summary: d.debt_summary,
      route_summary: d.route_summary, visit_summary: d.visit_summary,
      declining_clients: (d.declining_clients || []).slice(0, 5), partial: true };
  }
  if (domain === 'triovist') {
    const r = await svc.rpc('crm_ai360_triovist_brief_v1', { p_month: month + '-01' });
    if (r.error || !r.data) throw new Error('triovist_unavailable');
    return { domain, source:'crm_ai360_triovist_brief_v1',
      scope:'client_all',owner:'Триовист',currency:'BYN',month,
      as_of:r.data.sales_import_at,plan:r.data.plan,revenue:r.data.revenue,
      new_tasks:r.data.new_tasks,pending_approval:r.data.pending_approval,
      partner_stock_date:r.data.partner_stock_date,chekhov_stock_date:r.data.chekhov_stock_date,
      partial:false,warning:'TOTAL TRIOVIST CLIENT ONLY; never attribute revenue or plan to Rudnev, Shkuran or any manager; Belarusian rubles (BYN), not RUB' };
  }
  if (domain === 'promotions') {
    const r = await svc.from('promotions').select('title,client_name,start_date,end_date,sales_plan,confirmed_sales,actual_spend,status', { count: 'exact' })
      .eq('status', 'in_work').lte('start_date', day).gte('end_date', day).order('end_date').limit(12);
    if (r.error) throw new Error('promotions_unavailable');
    return { domain, source: 'promotions', as_of: day, count: r.count, rows: r.data,
      partial: (r.count ?? 0) > (r.data || []).length };
  }
  if (domain === 'payments') {
    const r = await svc.from('payment_registry').select('description,amount,currency,status,due_date', { count: 'exact' })
      .in('status', ['submitted', 'approved']).order('created_at', { ascending: false }).limit(12);
    if (r.error) throw new Error('payments_unavailable');
    return { domain, source: 'payment_registry', as_of: day, count: r.count, rows: r.data,
      partial: (r.count ?? 0) > (r.data || []).length };
  }
  if (domain === 'vip') {
    const r = await svc.from('vip_membership_v236429').select('client_name,department,client_id')
      .eq('active', true).limit(30);
    if (r.error) throw new Error('vip_unavailable');
    return { domain, source: 'vip_membership_v236429', as_of: day, rows: r.data,
      partial: true, warning: 'Membership only: do not infer revenue without purchase_history' };
  }
  return null;
}
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: originHeaders(req.headers.get('Origin')) });
  if (req.method !== 'POST') return respond(req, { error: 'method_not_allowed' }, 405);
  const origin = req.headers.get('Origin');
  if (origin && !ORIGINS.has(origin)) return respond(req, { error: 'origin_not_allowed' }, 403);
  const token = String(req.headers.get('Authorization') || '').replace(/^Bearer /, '');
  if (!token || token.length > 6000) return respond(req, { error: 'not_authorized' }, 401);
  const url = Deno.env.get('SUPABASE_URL') || '';
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const openaiKey = Deno.env.get('OPENAI_API_KEY') || '';
  if (!url || !secret || !openaiKey) return respond(req, { error: 'server_configuration_missing' }, 503);
  const svc = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = await svc.auth.getUser(token).catch(() => null);
  const userId = auth?.data?.user?.id;
  if (!userId || userId !== OWNER_ID) return respond(req, { error: 'not_authorized' }, 403);
  const profile = await svc.from('users').select('id,name,role').eq('id', userId).maybeSingle();
  if (profile.error || profile.data?.role !== 'boss' ||
      normalize(profile.data.name) !== 'александр паюшин') return respond(req, { error: 'not_authorized' }, 403);
  let body;
  try { body = await req.json(); } catch { return respond(req, { error: 'bad_json' }, 400); }
  if (body?.kind === 'status') return respond(req, { ready: true, mode: 'director_readonly_v4', domains: DOMAINS });
  if (body?.kind === 'capabilities') return respond(req,{ready:true,mode:'director_readonly_v5',capabilities:getVoiceCapabilities(),sections_registered:getVoiceCapabilities().length});
  const question = String(body?.message || '').trim().slice(0, 400);
  if (question.length < 2) return respond(req, { error: 'question_invalid' }, 400);
  const history = Array.isArray(body.history) ? body.history.slice(-6).map(x => ({
    role: x?.role === 'assistant' ? 'assistant' : 'user', text: String(x?.content || x?.text || '').slice(0, 350)
  })) : [];
  const memory = body?.memory && typeof body.memory === 'object' ? {
    manager: String(body.memory.manager || '').slice(0, 90),
    month: String(body.memory.month || '').slice(0, 7),
    domain: String(body.memory.domain || '').slice(0, 30),
    client: String(body.memory.client || '').slice(0, 90),
    group: String(body.memory.group || '').slice(0, 120),
    subgroup: String(body.memory.subgroup || '').slice(0, 120),
    offset: Math.min(200,Math.max(0,Number(body.memory.offset)||0)),
    level: String(body.memory.level || '').slice(0, 12)
  } : {};
  // Per-dialog reservation shared with legacy v3, existing Yandex TTS spend and daily limit.
  // Claim is transactional; accounting is restricted to the Supabase service role.
  const claimResult = await svc.rpc('crm_ai360_core_claim_v2', { p_user_id: userId, p_reserve_rub: 8 });
  if (claimResult.error) return respond(req, { error: 'budget_meter_unavailable', answer_verified: false }, 503);
  const claim = claimResult.data || {};
  if (claim.allowed !== true) return respond(req, {
    error: String(claim.reason || 'budget_limit_reached'),
    daily_limit: claim.daily_limit || 300, budget_rub: claim.budget_rub || 5000,
    budget_used_rub: claim.used_rub || null, answer_verified: false
  }, 429);
  const claimId = String(claim.claim_id || '');
  const day = localDay(), allowedMonth = period(memory.month, day.slice(0, 7), day);
  const directory=await svc.from('users').select('name').eq('role','manager').limit(100);
  if(directory.error)return respond(req,{error:'staff_directory_unavailable',answer_verified:false},503);
  const managerNames=(directory.data||[]).map(x=>String(x.name||'')).filter(Boolean);
  const subject=requestContext(question,memory,managerNames);
  const invalidSources=[], evidence=[];
  let lastManager=subject.manager,lastMonth=allowedMonth,lastDomain='',lastClientName='',lastGroup='',lastSubgroup='',lastLevel='',lastNextOffset=0;
  const readTool = async args => {
    const domain = args.domain;
    if (!DOMAINS.includes(domain)) return { domain, error: 'unknown_domain' };
    const target=effectiveManager(domain,subject);
    if(target.error)return {domain,error:target.error,message:'Requested manager-specific breakdown is not available in this source. Do not use client totals instead.'};
    let manager;
    try {
      // Subject is resolved from the CURRENT user question, not an AI-supplied name.
      manager=await resolveManager(svc,target.manager);
    }catch{
      return {domain,error:'manager_not_unique',message:'Specify an exact employee surname'};
    }
    const month = period(args.month, allowedMonth, day);
    lastManager = manager;
    lastMonth = month;
    lastDomain = domain;
    try {
      if(domain==='client_detail'){
        const resolved=args.serverResolvedClient||await resolveAnyClient(svc,{
          question,memoryClient:memory.client||'',hint:args.client||''
        });
        if(resolved.error){
          const t={domain,error:resolved.error,candidates:resolved.candidates||[],
             message:'Please confirm customer name. Never reuse another customer sales.'};
          evidence.push(t);return t;
        }
        const askedSubgroups=/(подгрупп|подкатегори)/i.test(question);
        const askedSku=/(артикул|конкретн.*товар|sku|модел[ьи]|по позици)/i.test(question);
        const level=args.serverForceLevel===true&&['groups','subgroups','sku'].includes(args.level)?args.level:(askedSku?'sku':askedSubgroups?'subgroups':(['groups','subgroups','sku'].includes(args.level)?args.level:'groups'));
        const sameClient=String(resolved.name)===String(memory.client||'');
        const group=level==='groups'?null:(args.group||(sameClient?memory.group:null)||null);
        const subgroup=level==='sku'?(args.subgroup||(sameClient?memory.subgroup:null)||null):null;
        if(level!=='groups'&&!group){
          const t={domain,error:'group_required',message:'Ask which product group to expand.'};
          evidence.push(t);return t;
        }
        if(level==='sku'&&!subgroup){
          const t={domain,error:'subgroup_required',message:'Ask which product subgroup to expand.'};
          evidence.push(t);return t;
        }
        const continuation=/\b(?:дальше|продолж|следующ|остальн|еще|ещё)\w*/i.test(question);
        const offset=Math.min(200,Math.max(0,(continuation&&sameClient&&memory.level===level&&Number(args.offset)===0)?Number(memory.offset||0):Number(args.offset)||0));
        const r=await svc.rpc('crm_ai360_client_drilldown_v43',{
          p_client_id:resolved.id,p_level:level,p_group:group,p_subgroup:subgroup,
          p_month:month+'-01',p_limit:level==='sku'?6:12,p_offset:offset
        });
        if(r.error||!r.data||r.data.error)throw new Error('client_detail_source_unavailable');
        const data=r.data;
        const rows=(data.items||[]).slice(0,level==='sku'?6:12).map(x=>({
          category:x.category,subgroup:x.subgroup,sku:x.sku,
          product:x.product?String(x.product).slice(0,100):null,
          previous_byn:x.previous_byn,current_byn:x.current_byn,
          delta_byn:x.delta_byn,change_pct:x.change_pct,
          previous_qty:x.previous_qty,current_qty:x.current_qty,
          missing_sku:x.missing_sku
        }));
        const t={domain,scope:'client_all',source:'crm_ai360_client_drilldown_v43',
          client_name:resolved.name,manager:resolved.manager,level,currency:'BYN',
          current_period:data.current_period,previous_period:data.previous_period,
          group_filter:group,subgroup_filter:subgroup,
          total_items:data.total_items,falling_items:data.falling_items,
          current_byn:data.current_byn,previous_byn:data.previous_byn,delta_byn:data.delta_byn,
          sku_missing_code:data.sku_missing_code,
          offset:data.offset,has_more:data.has_more,items:rows,
          note:'Scope limited to linked purchase_history.client_id; absent SKU codes labelled, not invented.'};
        lastClientName=resolved.name;
        lastLevel=level;lastNextOffset=data.has_more?offset+rows.length:0;
        lastGroup=level==='groups'?(rows.find(x=>Number(x.delta_byn)<0)?.category||''):String(group);
        lastSubgroup=level==='subgroups'?(rows.find(x=>Number(x.delta_byn)<0)?.subgroup||''):
          (level==='sku'?String(subgroup):'');
        lastManager=null;subject.manager=null;subject.subject='client';subject.client=true;
        evidence.push(t);return t;
      }
      if(domain==='client_groups'||domain==='client_schedule'){
        const resolved=await resolveAnyClient(svc,{
          question,memoryClient:memory.client||'',hint:args.client||''
        });
        if(resolved.error){
          const t={domain,error:resolved.error,candidates:resolved.candidates||[],
            message:'No reliable matching client. Ask to confirm the exact customer name.'};
          evidence.push(t);return t;
        }
        const fn=domain==='client_groups'?'crm_ai360_client_groups_v42':'crm_ai360_client_schedule_v42';
        const params=domain==='client_groups'?
          {p_client_id:resolved.id,p_month:month+'-01'}:
          {p_client_id:resolved.id};
        const result=await svc.rpc(fn,params);
        if(result.error||!result.data)throw new Error('client_read_unavailable');
        const {client_id,...data}=result.data;
        const t={domain,source:fn,...data,
          groups:Array.isArray(data.groups)?data.groups.slice(0,8):undefined,
          routes:Array.isArray(data.routes)?data.routes.slice(0,7):undefined,
          tasks:Array.isArray(data.tasks)?data.tasks.slice(0,7):undefined,
          partial:Boolean(data.partial||((data.groups||[]).length>8)||((data.routes||[]).length>7)||((data.tasks||[]).length>7))};
        lastClientName=resolved.name;subject.manager=null;subject.subject='client';subject.client=true;
        lastManager=null;evidence.push(t);return t;
      }
      if(domain==='tasks'){
        const t=await readTasks(svc,manager,question,history,day);
        evidence.push(t);return t;
      }
      if(domain==='clients'){
        const risk=await svc.rpc('crm_ai360_client_risk_v41',{p_manager:manager,p_month:month+'-01'});
        if(risk.error||!risk.data)throw new Error('client_analytics_unavailable');
        const t={domain,source:'crm_ai360_client_risk_v41',...risk.data,clients:(risk.data.clients||[]).slice(0,5),partial:(risk.data.matched_risky_clients||0)>5};
        evidence.push(t);return t;
      }
      if(domain==='stock'){
        const stock=await svc.rpc('crm_ai360_stock_snapshot_v41',{p_warehouse:'Витебск'});
        if(stock.error||!stock.data)throw new Error('stock_analytics_unavailable');
        const t={domain,source:'crm_ai360_stock_snapshot_v41',...stock.data,largest_onhand_skus:(stock.data.largest_onhand_skus||[]).slice(0,5),partial:true};
        evidence.push(t);return t;
      }
      const managed=await managedRead(svc,domain,manager,month,day);
      if(managed){evidence.push(managed);return managed;}
      const tool = getTool(domain);
      if (!tool) return { domain, error: 'unknown_domain' };
      const result = await collectTool(svc, domain, { manager, signal: AbortSignal.timeout(4500) });
      if (result.error) throw new Error('source_unavailable');
      const t={...result,scope:manager?'manager':'network',manager:manager||null,
        as_of:day,partial:true,warning:'This is a short sample; not a complete dataset or verified business conclusion.'};
      evidence.push(t);return t;
    } catch {
      invalidSources.push(domain);
      return { domain, error: 'source_unavailable' };
    }
  };

  // Deterministic customer sales route. Never let the language model substitute network sales.
  const customerAnalysis=/(продаж|отклонен|динамик|паден|анализ|разбор|групп|подгрупп|артикул|sku|товар)/i.test(question);
  const customerNamed=/(?:клиент|клиента|клиенту|клиентом|компани[июея]|покупател[ьяюем])\s+[а-яёa-z0-9«"]/i.test(question);
  const customerFollowup=!!memory.client&&/(подгрупп|групп|артикул|sku|товар|продолж|дальше|остальн|еще|ещё|что\s+по|паден|динамик)/i.test(question)&&!/(все\s+клиенты|всех\s+клиентов|вся\s+сеть)/i.test(question);
  const namedWithoutPrefix=customerAnalysis&&!customerNamed&&!customerFollowup
    ?await resolveAnyClient(svc,{question,memoryClient:''}):null;
  if(customerAnalysis&&(customerNamed||customerFollowup||namedWithoutPrefix?.method==='explicit_name')){
    const resolved=namedWithoutPrefix||await resolveAnyClient(svc,{question,memoryClient:memory.client||''});
    const money=v=>Math.round(Number(v)||0).toLocaleString('ru-RU',{maximumFractionDigits:0});
    const amt=v=>money(Math.abs(Number(v)||0))+' белорусских рублей';
    const ending=delta=>Number(delta)<0?'снижение на '+amt(delta):Number(delta)>0?'рост на '+amt(delta):'без изменений';
    const clean=v=>String(v||'').replace(/[\r\n\t]/g,' ').slice(0,110);
    const itemChoice=(items,query,field)=>{
      const words=(String(query).toLocaleLowerCase('ru-RU').match(/[а-яёa-z]{4,}/g)||[]);
      const scored=(items||[]).map(it=>{
        const label=String(it[field]||'').toLocaleLowerCase('ru-RU');
        const tokens=label.match(/[а-яёa-z]{4,}/g)||[];
        return {it,match:tokens.filter(w=>words.some(q=>q.startsWith(w.slice(0,5))||w.startsWith(q.slice(0,5)))).length};
      }).sort((a,b)=>b.match-a.match);
      return scored[0]?.match>0?scored[0].it:((items||[]).find(x=>Number(x.delta_byn)<0)||(items||[])[0]);
    };
    let brief='',detail='',offer='',verified=false;
    if(resolved.error){
      const suggestions=(resolved.candidates||[]).slice(0,3).map(clean);
      brief=suggestions.length?'Уточни, пожалуйста, клиента: '+suggestions.join(' или ')+'.':'Не смогла однозначно найти этого клиента в справочнике CRM.';
      detail=brief;offer='Назови точное имя компании, как оно записано в CRM.';
    }else{
      const read=async(level,group=null,subgroup=null,offset=0)=>readTool({
        domain:'client_detail',month:allowedMonth,client:resolved.name,level,group,subgroup,offset,
        serverForceLevel:true,serverResolvedClient:resolved
      });
      const continuation=/(?:дальше|продолж|следующ|остальн|еще|ещё)/i.test(question);
      const requestedLevel=continuation&&['groups','subgroups','sku'].includes(memory.level)?memory.level:'groups';
      const pageOffset=continuation?Math.max(0,Math.min(200,Number(memory.offset)||0)):0;
      let groups=null,subs=null,skus=null;
      let groupName='',subgroupName='';
      if(requestedLevel==='groups'){
        groups=await read('groups',null,null,pageOffset);
        if(!groups.error&&groups.items?.length){
          const g=itemChoice(groups.items,question,'category');
          groupName=clean(g?.category);
          if(!continuation){
            subs=await read('subgroups',groupName);
            if(!subs.error&&subs.items?.length){
              subgroupName=clean(itemChoice(subs.items,question,'subgroup')?.subgroup);
              if(subgroupName)skus=await read('sku',groupName,subgroupName);
            }
          }
        }
      }else if(requestedLevel==='subgroups'){
        groupName=clean(memory.group);
        if(groupName){
          subs=await read('subgroups',groupName,null,pageOffset);
          subgroupName=clean(itemChoice(subs.items||[],question,'subgroup')?.subgroup);
        }
      }else{
        groupName=clean(memory.group);subgroupName=clean(memory.subgroup);
        if(groupName&&subgroupName)skus=await read('sku',groupName,subgroupName,pageOffset);
      }
      const primary=groups||subs||skus;
      if(!primary||primary.error){
        brief='Клиента '+clean(resolved.name)+' нашла, но подробный отчёт по его продажам сейчас недоступен.';
        detail=brief+' Не буду подменять его продажами всей сети.';
        offer='Повторить запрос клиентской аналитики?';
      }else{
        const periodName=String(primary.current_period||'').replace('..',' — ');
        const headline='Клиент «'+clean(resolved.name)+'», период '+periodName+'. ';
        const total=groups?'Продажи '+amt(groups.current_byn)+', '+ending(groups.delta_byn)+'. ':'';
        const lines=[];
        if(groups){
          const a=(groups.items||[]).slice(0,12).map(x=>clean(x.category)+': '+ending(x.delta_byn));
          lines.push('Отклонения по группам: '+(a.join('; ')||'данных нет')+'.');
        }
        if(subs&&!subs.error){
          const a=(subs.items||[]).slice(0,12).map(x=>clean(x.subgroup)+': '+ending(x.delta_byn));
          lines.push('В группе «'+groupName+'» подгруппы: '+(a.join('; ')||'данных нет')+'.');
        }
        if(skus&&!skus.error){
          const a=(skus.items||[]).slice(0,6).map(x=>(x.sku?'Артикул '+clean(x.sku)+', ':'Без кода, ')+clean(x.product)+': '+ending(x.delta_byn));
          lines.push('В подгруппе «'+subgroupName+'» товары: '+(a.join('; ')||'данных нет')+'.');
        }
        const deepest=skus&&!skus.error?skus:subs&&!subs.error?subs:groups;
        if(deepest?.has_more)lines.push('Показана только часть списка: следующие позиции доступны по команде продолжения.');
        lines.push('Рекомендация: уточнить у клиента причины снижения заказов, проверить наличие ключевых товаров и согласовать предложение по потерянным артикулам. Причины падения по продажам не доказаны.');
        const pickG=groups?.items?.find(x=>Number(x.delta_byn)<0);
        const pickSub=subs?.items?.find(x=>Number(x.delta_byn)<0);
        const pickSku=skus?.items?.find(x=>Number(x.delta_byn)<0);
        brief=(headline+total+(pickG?'Главное снижение в группе «'+clean(pickG.category)+'» на '+amt(pickG.delta_byn)+'. ':'')+(pickSub?'Подгруппа «'+clean(pickSub.subgroup)+'» — '+amt(pickSub.delta_byn)+'. ':'')+(pickSku?'Артикул '+clean(pickSku.sku||pickSku.product)+' — '+amt(pickSku.delta_byn)+'.':'')).slice(0,430);
        detail=(headline+total+lines.join(' ')).slice(0,3000);
        const hasMore=Boolean((skus&&!skus.error?skus:subs&&!subs.error?subs:groups)?.has_more);
        offer=hasMore?'Продолжить список остальных позиций?':'Проверить следующие группы или сформировать рекомендации менеджеру?';
        verified=true;
      }
    }
    const settled=await svc.rpc('crm_ai360_core_finish_v2',{
      p_claim_id:claimId,p_actual_rub:0,p_input_tokens:0,p_output_tokens:0,p_rounds:0,p_status:'ok'
    });
    if(settled.error||settled.data?.ok!==true)return respond(req,{error:'budget_settlement_unavailable',answer_verified:false},503);
    return respond(req,{
      answer:brief,brief,detail,followup_question:offer,intent:'verified_customer_drilldown',
      answer_verified:verified,sources:verified?['crm_ai360_client_drilldown_v43']:[],
      failed_domains:invalidSources,partial_sources:[],auto_corrected:false,
      month:lastMonth,manager:null,mode:'director_readonly_customer_v1',engine:'deterministic_crm',
      memory:{...memory,manager:'',month:lastMonth,client:resolved.name||'',
        group:lastGroup||memory.group||'',subgroup:lastSubgroup||memory.subgroup||'',
        level:lastLevel||memory.level||'',offset:lastClientName?lastNextOffset:0,
        subject:'client',domain:'client_detail'}
    });
  }


  // A manager's shipment KPI and the network turnover are different source
  // methodologies. For this exact question use one verified source, never
  // let the LLM mix manager facts with aggregate sales or total motivation KPI.
  if(isManagerSalesQuestion(question,{managerNames,memory})){
    const salesMonth=resolveSalesMonth(question,allowedMonth,day);
    const snapshot=await svc.rpc('crm_ai360_sales_kpi_snapshot_v1',{p_month:salesMonth+'-01'});
    const narrative=snapshot.error||!snapshot.data?
      {error:'manager_sales_source_unavailable'}:
      formatManagerSales({question,data:snapshot.data,month:salesMonth,managerNames});
    const settlement=await svc.rpc('crm_ai360_core_finish_v2',{
      p_claim_id:claimId,p_actual_rub:0,p_input_tokens:0,
      p_output_tokens:0,p_rounds:0,p_status:narrative.error?'failed':'ok'
    });
    if(settlement.error||settlement.data?.ok!==true)
      return respond(req,{error:'budget_settlement_unavailable',answer_verified:false},503);
    if(narrative.error)return respond(req,{
      error:narrative.error,answer_verified:false,
      answer:'Проверенные продажи менеджеров сейчас недоступны. Не буду подменять их цифрами другого раздела.'
    },503);
    return respond(req,{
      answer:narrative.brief,brief:narrative.brief,detail:narrative.detail,
      followup_question:narrative.offer,intent:'verified_manager_sales',
      answer_verified:true,sources:[narrative.source],failed_domains:[],partial_sources:[],
      month:salesMonth,manager:narrative.manager,mode:'director_manager_kpi_verified_v1',
      engine:'deterministic_crm',
      memory:{...memory,month:salesMonth,manager:narrative.manager||'',
        domain:'sales_managers',subject:'manager',client:'',group:'',subgroup:'',level:'',offset:0}
    });
  }

  let inputTokens = 0, outputTokens = 0, rounds = 0;
  const request = async payload => {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: 'Bearer ' + openaiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(14000)
    });
    if (!res.ok) throw new Error('openai_upstream_' + res.status);
    const data = await res.json();
    rounds++;
    inputTokens += Math.max(0, Number(data?.usage?.input_tokens || 0));
    outputTokens += Math.max(0, Number(data?.usage?.output_tokens || 0));
    return data;
  };
  const preferredDomain=inferVoiceDomain(question)||(/^(а\s|ещё|еще|какие|покажи|расскажи|а теперь|продолж)/i.test(question)&&DOMAINS.includes(memory.domain)?memory.domain:null);
  const output = await runToolCore({
    question, history, memory: { ...memory,
      manager:subject.manager||'',subject:subject.subject,client:memory.client||'',
      subject_is_client:subject.client,explicit_manager:subject.explicitManager||null,
      catalog: CRM_AI360_TOOLS.map(x => x.id + ': ' + x.label).join('; '),
      today: day, available_domains: DOMAINS },
    domains: DOMAINS, readTool, request, preferredDomain
  });
  // Cost from official gpt-5.4-mini standard text token tariffs:
  // USD 0.75 / million input and USD 4.50 / million output.
  // 100 RUB per USD is intentionally above the 28 Oct CBR rate (80.5307).
  // This protective FX rate may be revised via a reviewed migration.
  const actualRub = Math.min(8, (inputTokens * 0.75 + outputTokens * 4.5) * 100 / 1000000);
  const settlement = await svc.rpc('crm_ai360_core_finish_v2', {
    p_claim_id: claimId, p_actual_rub: Number(actualRub.toFixed(4)),
    p_input_tokens: Math.floor(inputTokens), p_output_tokens: Math.floor(outputTokens),
    p_rounds: rounds, p_status: output.pair ? 'ok' : 'failed'
  });
  if (settlement.error || settlement.data?.ok !== true) {
    return respond(req, { error: 'budget_settlement_unavailable', answer_verified: false }, 503);
  }
  const pair=evidence.length?guardVoicePair(output.pair,{evidence,managers:managerNames,question,period:allowedMonth}):null;
  if(!pair) return respond(req, {
    answer: 'Не смогла получить надёжный ответ. Данные CRM не изменены.',
    answer_verified: false,
    error: /^openai_upstream_429/.test(String(output.error||'')) ? 'openai_provider_rate_limit' :
      /AbortError|TimeoutError|abort/.test(String(output.error||'')) ? 'openai_provider_timeout' :
      'analysis_unavailable',
    mode: 'director_readonly_v4'
  }, 200);
  const safe = x => String(x || '').replace(/<[^>]*>/g, '').trim();
  const answer = safe(pair.brief).slice(0, 450);
  const detail = safe(pair.detail).slice(0, 3000);
  const offer = safe(pair.offer).slice(0, 170);
  return respond(req, {
    answer, brief: answer, detail, followup_question: offer, intent: 'unified_dialog',
    answer_verified: false, // LLM output has not been independently reconciled to the source.
    sources:output.used,failed_domains:invalidSources,partial_sources:evidence.filter(x=>x.partial).map(x=>x.domain),
    auto_corrected:!!pair.corrected,month:lastMonth,manager:subject.manager||null,
    mode:'director_readonly_v41',engine:'gpt-5.4-mini',
    memory:{...memory,month:lastMonth,manager:subject.manager||'',
      client:lastClientName||(subject.subject==='client'?memory.client||'':''),
      group:lastGroup||((subject.subject==='client'&&!lastClientName)?memory.group||'':''),
      subgroup:lastSubgroup||((subject.subject==='client'&&!lastClientName)?memory.subgroup||'':''),
      level:lastLevel||((subject.subject==='client'&&!lastClientName)?memory.level||'':''),
      offset:lastClientName?lastNextOffset:((subject.subject==='client')?Number(memory.offset||0):0),
      subject:subject.subject,domain:lastDomain||output.used[0]?.split('/')[0]||memory.domain||''}
  });
});
