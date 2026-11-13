const DAY=86400000;
export function minskDate(now=new Date()){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)
}
export function daysSince(start,today){
 if(!start||!today)return 0;
 const a=Date.parse(start+'T12:00:00Z'),b=Date.parse(today+'T12:00:00Z');
 return Number.isFinite(a)&&Number.isFinite(b)?Math.max(0,Math.floor((b-a)/DAY)):0;
}
export function evaluate(p,truth,sourceAt,today){
 const age=daysSince(p?.start_date,today);
 const fresh=!!sourceAt&&(Date.parse(sourceAt)>=Date.parse(today+'T00:00:00Z')-72*3600000);
 const exact=truth?.scope_mode==='exact_sku'&&Number(truth?.item_count||0)>0&&truth?.client_match_mode==='client_id'
  &&truth?.sales_exact===true&&!truth?.manual_conflict
  &&['live_month','exact_closed_month','exact_snapshots','exact_zero_live','exact_zero_period'].includes(truth?.data_quality);
 const verified=!!(fresh&&exact&&truth?.current_sales_1c!=null);
 const actual=verified?Number(truth.current_sales_1c):null;
 const hasZero=verified&&Number.isFinite(actual)&&actual===0;
 return {age,verified,actual,zero:hasZero,milestone:hasZero&&age>=14?14:hasZero&&age>=7?7:null,
  reason:!fresh?'import_stale':!exact?'client_sku_or_period_unverified':'verified_1c'};
}
export function greeting(user){
 const id=String(user?.id||''),n=String(user?.name||'').toLowerCase();
 const names={"544fb1e2-ef70-44de-bc62-e0e1596a4bfc":"Александр","a24954b8-2fe1-4852-b629-d8f351e1bd36":"Виталий","ba55dfe5-7e48-4f1f-b40e-674c7752fe1a":"Кирилл","19dd9943-99ae-47c4-a39c-4f82a11059a6":"Александр","3d935a76-c6fe-44b6-b248-fcbe58c6bf1c":"Екатерина","4fd79fa0-232d-4768-8099-25f47923cc4f":"Татьяна","6efa656e-45c6-473b-a853-89eccb9ee43a":"Александр","9076ccde-a8cc-47e3-b71e-c31170b693ff":"Наталья"};
 if(names[id])return names[id];
 if(n.includes('шкуран'))return 'Татьяна';
 if(n.includes('ру́днев')||n.includes('руднев'))return 'Александр';
 if(n.includes('ачинович'))return 'Екатерина';
 return String(user?.name||'коллега').split(' ')[0];
}
export function personalFor(user,rows){
 if(user?.role==='boss')return rows||[];
 return (rows||[]).filter(x=>String(x.manager_name||'').toLowerCase().trim()===String(user?.name||'').toLowerCase().trim());
}
export function voiceBrief(user,active,actions){
 const intro='Привет, '+greeting(user)+'! Это Лера. ';
 const mine=personalFor(user,active),tasks=personalFor(user,actions);
 if(user?.role==='boss'){
  const evidence=mine.filter(x=>x.evidence_valid===true).length;
  const pending=tasks.filter(x=>x.status!=='closed');
  const names=pending.slice(0,5).map((x,i)=>(i+1)+'. '+x.client_name+'.').join(' ');
  return intro+'В филиальной сети '+mine.length+' действующих акций. Проверенный факт есть по '+evidence+
   '. Требуется сверка остальных. Открытых поручений '+pending.length+'. '+(names?'Приоритеты: '+names:'Подробности в CRM.');
 }
 const pending=tasks.filter(x=>x.status!=='closed');
 if(!pending.length)return null;
 return intro+'По твоим акциям '+(pending.length===1?'одно поручение':pending.length<5?pending.length+' поручения':pending.length+' поручений')+'. '+
  pending.slice(0,5).map((x,i)=>(i+1)+'. '+x.client_name+' — '+(x.status==='escalated'?'срок нарушен':x.milestone===14?'проверка на четырнадцатый день':'проверка после первой недели')+'.').join(' ')+
  ' Укажи причину, действие и срок. Результат фиксируй в CRM.';
}
