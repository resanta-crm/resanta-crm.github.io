import { createClient } from 'npm:@supabase/supabase-js@2';
import * as XLSX from 'npm:xlsx@0.18.5';

const SUPABASE_URL=Deno.env.get('SUPABASE_URL')||'';
const ANON_KEY=Deno.env.get('SUPABASE_ANON_KEY')||'';

const json=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json; charset=utf-8'}});
const hhmm=(v:unknown)=>{const s=String(v??'');return /^\d{2}:\d{2}/.test(s)?s.slice(0,5):'';};
const localTime=(v:unknown)=>{if(!v)return '';try{return new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Minsk',hour:'2-digit',minute:'2-digit'}).format(new Date(String(v)));}catch(_){return ''}};
const delta=(v:unknown)=>{const n=Number(v);if(!Number.isFinite(n))return '';if(n===0)return '0:00';const a=Math.abs(Math.round(n));return (n<0?'−':'+')+Math.floor(a/60)+':'+String(a%60).padStart(2,'0');};
const day=(v:unknown)=>{const s=String(v??'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const [y,m,d]=s.split('-');return `${d}.${m}.${y}`;};

Deno.serve(async(req)=>{
  if(req.method!=='POST')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
  try{
    const auth=req.headers.get('authorization')||'';
    if(!auth.toLowerCase().startsWith('bearer '))return json({ok:false,error:'UNAUTHORIZED'},401);
    if(!SUPABASE_URL||!ANON_KEY)throw new Error('SUPABASE_ENV_MISSING');

    const body=await req.json().catch(()=>({}));
    const from=String(body?.from||''),to=String(body?.to||''),manager=String(body?.manager||'all');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))return json({ok:false,error:'INVALID_DATE_RANGE'},400);

    const userDb=createClient(SUPABASE_URL,ANON_KEY,{global:{headers:{Authorization:auth}},auth:{persistSession:false}});
    const {data,error}=await userDb.rpc('gps_director_report_v236421',{p_from:from,p_to:to,p_manager:manager});
    if(error)throw error;

    const visits=Array.isArray(data?.visits)?data.visits:[];
    const technical=Array.isArray(data?.technical_stops)?data.technical_stops:[];
    const visitRows=visits.map((r:any)=>({
      'Дата':day(r.date),'Менеджер':r.manager_name||'','№':Number(r.sort_order)||'','ТТ':r.client_name||'',
      'Город':r.city||'','Адрес':r.address||'','План с':hhmm(r.planned_start),'План до':hhmm(r.planned_end),
      'Приехал':localTime(r.actual_arrival_at),'Уехал':localTime(r.actual_departure_at),
      'В ТТ, мин':r.actual_minutes==null?'':Number(r.actual_minutes),'Отклонение приезда':delta(r.arrival_delta_minutes)
    }));
    const techRows=technical.map((r:any)=>({
      'Дата':day(r.date),'Менеджер':r.manager_name||'','Остановка №':Number(r.stop_seq)||'',
      'Начало':localTime(r.start_at),'Конец':localTime(r.end_at),
      'Длительность, мин':r.minutes==null?'':Number(r.minutes),
      'Средняя точность, м':r.avg_accuracy==null?'':Math.round(Number(r.avg_accuracy))
    }));

    const wb=XLSX.utils.book_new();
    const ws1=XLSX.utils.json_to_sheet(visitRows,{header:['Дата','Менеджер','№','ТТ','Город','Адрес','План с','План до','Приехал','Уехал','В ТТ, мин','Отклонение приезда']});
    ws1['!cols']=[{wch:12},{wch:18},{wch:6},{wch:34},{wch:18},{wch:34},{wch:10},{wch:10},{wch:10},{wch:10},{wch:12},{wch:20}];
    ws1['!autofilter']={ref:`A1:L${Math.max(1,visitRows.length+1)}`};
    XLSX.utils.book_append_sheet(wb,ws1,'Посещения ТТ');

    const ws2=XLSX.utils.json_to_sheet(techRows,{header:['Дата','Менеджер','Остановка №','Начало','Конец','Длительность, мин','Средняя точность, м']});
    ws2['!cols']=[{wch:12},{wch:18},{wch:14},{wch:10},{wch:10},{wch:20},{wch:22}];
    ws2['!autofilter']={ref:`A1:G${Math.max(1,techRows.length+1)}`};
    XLSX.utils.book_append_sheet(wb,ws2,'Технические остановки');

    const bytes=XLSX.write(wb,{bookType:'xlsx',type:'array'});
    const utfName=`GPS_Руководитель_${from}_${to}.xlsx`;
    return new Response(bytes,{status:200,headers:{
      'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition':`attachment; filename="gps_director_${from}_${to}.xlsx"; filename*=UTF-8''${encodeURIComponent(utfName)}`,
      'cache-control':'no-store'
    }});
  }catch(e){
    console.error(e);
    return json({ok:false,error:e instanceof Error?e.message:String(e)},500);
  }
});