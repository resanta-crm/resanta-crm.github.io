// Лера AI 360°: deterministic read-only client budget calculations, no LLM.
// Formula parity with promoBudgetSummary in assets/01-crm-core.js (11 Nov 2026).
export const fold=v=>String(v??'').trim().toLocaleLowerCase('ru-RU')
 .replaceAll('ё','е').replace(/[«»"'.(),;:!?]/g,' ')
 .replace(/\s+/g,' ').trim();
const n=v=>Number.isFinite(Number(v))?Number(v):0;
export const amount=v=>n(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';

export function scopeForVoice(profile,staff,networkId){
 if(!profile?.id||!['boss','manager'].includes(profile.role))return null;
 const duplicates=(staff||[]).filter(x=>x.id!==profile.id&&x.role==='manager'&&fold(x.name)===fold(profile.name));
 if(profile.role==='manager'){
  if(duplicates.length||!profile.name||fold(profile.region)==='триовист / 21vek.by')return null;
  return {tier:'field_manager',role:'manager',region:profile.region,managers:[profile.name],subject_manager:profile.name};
 }
 if(profile.id===networkId&&String(profile.email||'').trim().toLowerCase()==='payushin_ar@resanta.ru')
  return {tier:'network_director',role:'boss',region:'Сеть',managers:null,subject_manager:null};
 if(!profile.region)return null;
 const managers=(staff||[]).filter(x=>x.role==='manager'&&fold(x.region)===fold(profile.region))
  .filter(x=>(staff||[]).filter(y=>y.role==='manager'&&fold(y.name)===fold(x.name)).length===1)
  .map(x=>x.name);
 return {tier:'branch_director',role:'boss',region:profile.region,managers,subject_manager:null};
}

export function permittedBudgetClients(scope,clients,staff){
 if(!scope)return [];
 const members=(staff||[]).filter(x=>x.role==='manager');
 const verifiedManager=name=>members.filter(x=>fold(x.name)===fold(name)).length===1;
 return (clients||[]).filter(c=>{
  if(!c?.id||!c.manager_name)return false;
  if(!verifiedManager(c.manager_name))return false;
  return scope.tier==='network_director'||scope.managers?.some(x=>fold(x)===fold(c.manager_name));
 });
}

export function summarizeBudget(b,movements,promotions){
 const ms=(movements||[]).filter(x=>String(x.budget_id)===String(b.id));
 const ps=(promotions||[]).filter(x=>String(x.budget_id)===String(b.id));
 const sum=type=>ms.filter(x=>x.movement_type===type).reduce((s,x)=>s+n(x.amount),0);
 const accrued=sum('accrual'),adjustments=sum('adjustment'),movementSpent=sum('expense');
 const legacySpent=ps.reduce((s,p)=>{
  const linked=ms.filter(x=>x.movement_type==='expense'&&String(x.promotion_id||'')===String(p.id))
   .reduce((a,x)=>a+n(x.amount),0);
  return s+Math.max(0,n(p.actual_spend)-linked);
 },0);
 const spent=movementSpent+legacySpent;
 const reserved=ps.filter(p=>['approved','in_work'].includes(p.status))
  .reduce((s,p)=>s+Math.max(0,n(p.budget_reserved)-n(p.actual_spend)),0);
 const opening=n(b.opening_balance!=null?b.opening_balance:b.budget_total);
 const total=opening+accrued+adjustments;
 return {opening,accrued,adjustments,total,spent,reserved,free:total-spent-reserved};
}

const ignored=new Set(['ооо','чтуп','ип','одо','уоо','зао','оао','торговый','дом','компания','фирма','магазин']);
const tokens=name=>fold(name).split(' ').filter(x=>x.length>=5&&!ignored.has(x));

export function selectBudgetClient(question,entries,memory={},generic=false){
 const q=fold(question);
 const named=(entries||[]).map(x=>{
  const ts=tokens(x.client.name||x.budget.client_name);
  const score=Math.max(0,...ts.map(t=>q.includes(t)?t.length:q.includes(t.slice(0,-1))?t.length-1:0));
  return {...x,score};
 }).filter(x=>x.score>=4).sort((a,b)=>b.score-a.score);
 if(named.length>1&&named[0].score===named[1].score)
  return {error:'ambiguous',candidates:named.filter(x=>x.score===named[0].score).slice(0,5).map(x=>x.client.name)};
 if(named[0])return {entry:named[0]};
 const clientId=String(memory?.client_id||'');
 if(!generic&&clientId&&/^(а |а сколько|а какие|и |сколько|какой|какая|его |у него|у нее|у неё|покажи)/.test(q)){
  const remembered=(entries||[]).find(x=>String(x.client.id)===clientId);
  if(remembered)return {entry:remembered};
 }
 return {entry:null};
}
const sourceInfo='Расчёт из действующих бюджетов, движений и резервов CRM. Не банковская выписка.';
export function answerBudgetVoice(question,entries,memory={},debtRows=[]){
 const q=fold(question);
 const metric=/резерв|зарезерв/.test(q)?'reserved':/расход|потрач|списан/.test(q)?'spent':
  /свобод|остаток|остал|доступно/.test(q)?'free':/начисл/.test(q)?'accrued':'total';
 const generic=/всех|по всем|по филиалу|по сети|в целом|всего|все клиенты|все бюджеты|у клиентов|по клиентам/.test(q);
 const matching=selectBudgetClient(question,entries,memory,generic);
 if(matching.error)return {answer:'Нашла несколько похожих клиентов: '+matching.candidates.join(', ')+'. Уточни название.',client_id:null};
 const entry=matching.entry;
 const debt=/пдз|просроч|долг|задолж|сколько должен|нам должен/.test(q);
 const promotion=/акци|промо|согласовани/.test(q);
 if(!entry){
  if(debt||promotion)return {answer:'Назови конкретного клиента, чтобы проверить задолженность или акции.',client_id:null};
  if(/(?:у|клиента) [а-яa-z0-9]{4,}/.test(q)&&!generic)
   return {answer:'Не нашла клиента с таким бюджетом среди доступных тебе записей. Уточни название.',client_id:null};
  if(!entries.length)return {answer:'У тебя пока нет доступных клиентских бюджетов.',client_id:null};
  const sum={total:0,spent:0,reserved:0,free:0,accrued:0};
  entries.forEach(x=>Object.keys(sum).forEach(k=>sum[k]+=n(x.metrics[k])));
  const lbl={total:'Общий бюджет',spent:'Расходы',reserved:'Резерв',free:'Свободно',accrued:'Начислено'};
  const list=/покажи|перечисли|какие|список/.test(q);
  return {
   answer:lbl[metric]+' по '+entries.length+' клиентам: '+amount(sum[metric])+'.'+
    (list?' '+entries.slice(0,12).map(x=>x.client.name+' — '+amount(x.metrics[metric])).join('; ')+
      (entries.length>12?'. Показаны первые 12 клиентов.':''):'')+
    ' '+sourceInfo,client_id:null
  };
 }
 const name=entry.client.name,metrics=entry.metrics;
 if(debt){
  const related=(debtRows||[]).filter(x=>fold(x.manager_name)===fold(entry.client.manager_name))
   .filter(x=>tokens(name).some(t=>fold(x.client_name).includes(t)));
  if(!related.length)return {answer:'Для «'+name+'» подтверждённая строка просрочки в доступном отчёте 1С не найдена. Не буду угадывать сумму.',client_id:entry.client.id};
  related.sort((a,b)=>String(b.report_date||'').localeCompare(String(a.report_date||'')));
  const latest=String(related[0].report_date||'');
  const same=related.filter(x=>String(x.report_date||'')===latest);
  if(same.length!==1)return {answer:'По «'+name+'» найдено несколько строк на '+latest+'. Нужна сверка клиента, чтобы не завысить долг.',client_id:entry.client.id};
  return {answer:'Просроченная задолженность «'+name+'»: '+amount(related[0].debt_overdue)+
    '. Отчёт 1С на '+latest+'. Изменение ПДЗ само по себе не подтверждает получение денег.',client_id:entry.client.id};
 }
 if(promotion){
  const active=entry.promotions.filter(x=>!['completed','rejected'].includes(x.status));
  const statuses=active.map(x=>(x.title||'Акция')+' — '+x.status).slice(0,8);
  return {answer:'У «'+name+'» '+active.length+' незавершённых акций. '+
    (statuses.length?statuses.join('; ')+'.':'Действующих или ожидающих акций не найдено.'),client_id:entry.client.id};
 }
 const labels={total:'общий бюджет',spent:'потрачено',reserved:'зарезервировано',free:'свободный остаток',accrued:'начислено'};
 let answer='У «'+name+'» '+labels[metric]+': '+amount(metrics[metric])+'.';
 if(metric==='total')answer+=' Потрачено '+amount(metrics.spent)+', резерв '+amount(metrics.reserved)+
   ', свободно '+amount(metrics.free)+'.';
 if(metrics.free<0)answer+=' Внимание: перерасход '+amount(-metrics.free)+'.';
 return {answer:answer+' '+sourceInfo,client_id:entry.client.id};
}
