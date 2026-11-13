// GPS session timestamps and strict first-point arrival are distinct facts.
// Callers must authenticate and authorize the manager scope BEFORE invoking this helper.
export function gpsQuestionDay(question,today){
 const q=String(question||'').toLocaleLowerCase('ru-RU');
 const iso=q.match(/\b(20\d\d-\d\d-\d\d)\b/);
 const ru=q.match(/\b(\d\d)\.(\d\d)\.(20\d\d)\b/);
 const date=iso?.[1]||(ru?`${ru[3]}-${ru[2]}-${ru[1]}`:null);
 if(date&&Number.isFinite(Date.parse(date+'T12:00:00Z'))&&new Date(date+'T12:00:00Z').toISOString().slice(0,10)===date&&date<=today)return date;
 const shift=/позавчера/.test(q)?-2:/вчера/.test(q)?-1:0;
 return new Date(Date.parse(today+'T12:00:00Z')+shift*86400000).toISOString().slice(0,10);
}
export function isGpsStartQuestion(q){return /во\s+сколько|начал[а-я]*\s+работ|выш[а-я]*\s+на\s+работ|выход[а-я]*\s+на\s+работ|начало\s+работ|перв[а-я]*\s+(?:сигнал|точк|прибыт)/i.test(q);}
export async function readGpsEvidence(svc,{manager=null,month,day,question='',firstTT=null}){
 const daily=isGpsStartQuestion(question)||/вчера|сегодня|позавчера|\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4}/i.test(question);
 const target=gpsQuestionDay(question,day);
 let sessions=svc.from('gps_workdays').select('manager_name,work_date,started_at,ended_at,status,last_point_at');
 let aggregates=svc.from('gps_workday_aggregates').select('manager_name,work_date,planned_count,visited_count,missed_count,aggregation_status,source_last_point_at');
 if(manager){sessions=sessions.eq('manager_name',manager);aggregates=aggregates.eq('manager_name',manager);}
 if(daily){sessions=sessions.eq('work_date',target);aggregates=aggregates.eq('work_date',target);}
 else{
  const end=new Date(month+'-01T12:00:00Z');end.setUTCMonth(end.getUTCMonth()+1);
  sessions=sessions.gte('work_date',month+'-01').lt('work_date',end.toISOString().slice(0,10));
  aggregates=aggregates.gte('work_date',month+'-01').lt('work_date',end.toISOString().slice(0,10));
 }
 const [s,a]=await Promise.all([sessions.order('work_date',{ascending:false}).limit(20),aggregates.order('work_date',{ascending:false}).limit(20)]);
 if(s.error||a.error)return {domain:'gps',error:'gps_evidence_unavailable'};
 let arrivals=[],arrivalError='';
 if(daily&&firstTT){
  try{const r=await firstTT(target);if(r.error)arrivalError='first_point_proof_unavailable';
   else arrivals=(r.data||[]).filter(x=>(!manager||x.manager_name===manager)&&/^gps_confirmed_/.test(x.proof_status||'')&&x.actual_arrival)
    .map(x=>({manager_name:x.manager_name,work_date:x.work_date,first_tt_name:x.first_tt_name,actual_arrival:x.actual_arrival,proof_status:x.proof_status}));
  }catch{arrivalError='first_point_proof_unavailable';}
 }
 return {domain:'gps',source:'gps_workdays + gps_workday_aggregates',date:daily?target:null,month,
  manager,timezone:'Europe/Minsk',workday_sessions:(s.data||[]).map(x=>({manager_name:x.manager_name,date:x.work_date,
   recorded_session_start:x.started_at,status:x.status,recorded_session_end:x.ended_at,last_signal_at:x.last_point_at})),
  route_summaries:a.data||[],confirmed_first_arrivals:arrivals,arrival_warning:arrivalError||null,
  work_start_proven:false,partial:!daily||(s.data||[]).length===20||(a.data||[]).length===20,
  interpretation:'recorded_session_start — регистрация GPS-сеанса в приложении, а НЕ доказательство фактического начала работы. last_signal_at — время сигнала, а НЕ выход на работу. Прибытие в первую ТТ подтверждено только в confirmed_first_arrivals. Сырые остановки не являются доказательством работы.'};
}
export function gpsStartAnswer(evidence,{question='' }={}){
 if(!isGpsStartQuestion(question))return null;
 const e=evidence.find(x=>x?.domain==='gps'&&!x.error&&x.work_start_proven===false);
 if(!e)return null;
 const time=x=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Minsk',hour:'2-digit',minute:'2-digit'}).format(new Date(x));
 const rows=(e.workday_sessions||[]).filter(x=>x.recorded_session_start).slice(0,4);
 const registered=rows.map(x=>x.manager_name+': GPS-сеанс зарегистрирован в '+time(x.recorded_session_start)).join('; ');
 const arrivals=(e.confirmed_first_arrivals||[]).slice(0,4).map(x=>x.manager_name+' — '+time(x.actual_arrival)+(x.first_tt_name?' ('+x.first_tt_name+')':'')).join('; ');
 const brief=(e.date?'За '+e.date+' по минскому времени. ':'')+
  (registered?registered+'. ':'Нет подтверждённого времени регистрации GPS-сеанса. ')+
  'Это не доказывает фактическое начало работы. '+(arrivals?'Подтверждённое прибытие в первую торговую точку: '+arrivals+'.':'Подтверждённое прибытие в первую торговую точку в этом ответе не установлено.');
 return {brief,detail:brief,offer:''};
}
