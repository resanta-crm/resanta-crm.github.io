import {inverterWelder} from './assortment.mjs';
// Explicit SKU targets only. No guessed quantities or silent partial parsing.
export function routeItems(text){
 const s=String(text||'').replace(/\s*дробь\s*/giu,'/').replace(/\s*\/\s*/g,'/');
 const skus=[...s.matchAll(/\b\d+(?:\/\d+){1,5}\b/g)].map(x=>x[0]);
 const matches=[...s.matchAll(/\b(\d+(?:\/\d+){1,5})\s*(?:[—–:=-]|количество|в количестве)?\s*(\d+(?:[.,]\d+)?)\s*(?:шт(?:ук(?:и|а)?)?\.?|ед(?:иниц(?:ы|а)?)?\.?)(?=$|[\s,;.!])/giu)];
 if(!skus.length||matches.length!==skus.length||skus.length>10||new Set(skus).size!==skus.length)return null;
 const items=matches.map(x=>({sku:x[1],qty:Number(x[2].replace(',','.'))}));
 return items.every(x=>Number.isFinite(x.qty)&&x.qty>0&&x.qty<=100000)?items:null;
}
const enc=new TextEncoder();
async function digest(secret,user,draft,until){
 const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const bytes=await crypto.subtle.sign('HMAC',key,enc.encode(JSON.stringify({source:'route-task-v4',user,until,draft})));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function signRoute(secret,user,draft,now=Date.now()){
 const until=now+300000;return {approval_token:until+'.'+await digest(secret,user,draft,until),expires_at:new Date(until).toISOString()};
}
export async function verifyRoute(secret,user,draft,token,now=Date.now()){
 const m=/^(\d{13})\.([a-f0-9]{64})$/.exec(String(token||''));if(!m)return false;
 const until=Number(m[1]);if(until<=now||until>now+300000)return false;
 const expected=await digest(secret,user,draft,until);let delta=0;for(let i=0;i<64;i++)delta|=expected.charCodeAt(i)^m[2].charCodeAt(i);return delta===0;
}
export async function routeAction({caller,user,input,secret}){
 const profile=await caller.from('users').select('role,region').eq('id',user.id).maybeSingle();
 if(profile.error||profile.data?.role!=='boss'||!['Витебск','Все филиалы'].includes(profile.data?.region))throw Error('TASK_CREATE_FORBIDDEN');
 if(input.action==='commit_route_task'){
  const d=input.draft;
  if(input.confirmation!=='подтверждаю'||d?.action!=='route_task_v4'||d.client_id!==input.client_id||!await verifyRoute(secret,user.id,d,input.approval_token))throw Error('TASK_CONFIRMATION_INVALID');
  // Route identity must still match the signed client; RPC checks current assignment, stock and duplicate legal week atomically.
  const route=await caller.from('route_plans').select('id,client_id').eq('id',d.route_id).maybeSingle();
  if(route.error||route.data?.client_id!==d.client_id)throw Error('TASK_ROUTE_REQUIRED');
  const made=await caller.rpc('crm_task_create_v4',{p_route:d.route_id,p_items:d.items.map(x=>({sku:x.sku,qty:x.qty}))});
  if(made.error)throw Error(made.error.message);
  if(!made.data?.task?.id)throw Error('TASK_CREATE_UNCONFIRMED');
  return {mode:'created_task',created:1,task_id:made.data.task.id,task:made.data.task,assigned_to:made.data.task.manager_name,note:'План SKU и автоматическая проверка 1С подключены.'};
 }
 const items=routeItems(input.transcript);
 if(!items)return {mode:'needs_details',question:'Укажи каждый артикул и количество: например, 75/6/1 — 2 шт. Количества не угадываю. Ничего не создано.'};
 const [r,c,p]=await Promise.all([
  caller.from('route_plans').select('id,client_id,manager_name,visit_date,approved,review_status,removed').eq('id',input.route_id).maybeSingle(),
  caller.from('clients').select('id,name,client_status,manager_name').eq('id',input.client_id).maybeSingle(),
  caller.from('price_list').select('sku,product').in('sku',items.map(x=>x.sku))]);
 if(r.error||c.error||p.error)throw Error('task_context_unavailable');
 if(!r.data||r.data.client_id!==input.client_id||r.data.removed||!(r.data.approved||r.data.review_status==='approved')||r.data.manager_name!==c.data?.manager_name)throw Error('TASK_ROUTE_REQUIRED');
 if(c.data?.client_status!=='Рабочий')throw Error('TASK_WORKING_CLIENT_REQUIRED');
 const resolved=items.map(x=>{const names=[...new Set((p.data||[]).filter(y=>y.sku===x.sku).map(y=>y.product))];if(names.length!==1)throw Error('shelf_unknown_sku');if(inverterWelder(names[0]))throw Error('TASK_FIELD_INVERTER_FORBIDDEN');return {...x,product:names[0]};});
 const draft={action:'route_task_v4',client_id:c.data.id,route_id:r.data.id,manager_name:r.data.manager_name,route_day:r.data.visit_date,items:resolved};
 const proof=await signRoute(secret,user.id,draft);
 return {mode:'prepared',draft,...proof,requires_confirmation:true,writes:false,summary:`${c.data.name} · ${r.data.manager_name} · маршрут ${r.data.visit_date}. Отгрузить: `+resolved.map(x=>`${x.sku} · ${x.product} — ${x.qty} шт.`).join('; ')+'. Контроль — пятница 15:00, факт по 1С. Остатки будут повторно проверены при создании.'};
}
