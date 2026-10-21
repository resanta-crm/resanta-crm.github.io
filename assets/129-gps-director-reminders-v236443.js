/* GPS director reminders v23.6.443. Lightweight director RPC only, no GPS point reads, no automatic AI. */
(function(){
'use strict';
if(window.RESANTA_GPS_REMINDERS_V236443)return;
const emails=new Set(['payushin_ar@resanta.ru','sidarovich_kn@resanta.ru']);
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const profile=()=>{try{return typeof currentProfile!=='undefined'?currentProfile:null}catch(_){return null}};
const user=()=>{try{return typeof currentUser!=='undefined'?currentUser:null}catch(_){return null}};
const allowed=()=>profile()?.role==='boss'&&emails.has(String(profile()?.email||user()?.email||'').trim().toLowerCase());
const actionTitle={
 to_meeting:'В повестку совещания',review_coordinates:'Проверить координаты ТТ',
 review_visit:'Разобрать посещение',defer:'Отложено до проверки',
 resolved_technical:'Технический вопрос закрыт',resolved_verified:'Проверка завершена'
};
const severity={
 overdue:{name:'Просрочено',color:'#991b1b',background:'#fef2f2'},
 today:{name:'Сегодня',color:'#9a3412',background:'#fff7ed'},
 no_deadline:{name:'Без срока',color:'#475569',background:'#f8fafc'},
 upcoming:{name:'Ближайшие 7 дней',color:'#185fa5',background:'#eff6ff'}
};
let busy=false,lastAt=0;
function panel(){return document.getElementById('gps-director-reminders-v236443')}
function active(){
 const box=panel();
 return allowed()&&box&&box.offsetParent!==null;
}
const shortDate=v=>{const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?m[3]+'.'+m[2]+'.'+m[1]:'Срок не указан'};
function render(data){
 const target=document.getElementById('gps-reminders-content-v236443');if(!target)return;
 const items=Array.isArray(data?.items)?data.items:[],counts=data?.counts||{};
 const statuses=[
 ['overdue',counts.overdue||0],['today',counts.today||0],['no_deadline',counts.no_deadline||0],['upcoming',counts.upcoming||0]
 ];
 const badges=statuses.map(([key,n])=>{
   const x=severity[key];
   return '<span style="display:inline-flex;align-items:center;gap:5px;background:'+x.background+';color:'+x.color+';padding:7px 9px;border-radius:8px;font-size:12px">'+esc(x.name)+': <strong>'+Number(n||0)+'</strong></span>';
 }).join('');
 const overview='<div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px">'+badges+'</div>';
 if(!items.length){
  target.innerHTML=overview+'<div style="color:var(--sub);font-size:12px;line-height:1.6">Пока нет открытых поручений с решением директора. Когда на разборе ТТ нажмёшь «Сохранить решение», оно появится здесь — со сроком или пометкой «Без срока».</div>';
  return;
 }
 const visible=items.map((x)=>{
   const color=severity[x.urgency]||severity.no_deadline;
   const title=actionTitle[x.action]||'Решение руководителя';
   return '<div style="border:1px solid var(--border);border-left:3px solid '+color.color+';border-radius:9px;padding:11px;margin-top:7px">'+
     '<div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">'+
       '<b style="font-size:13px">'+esc(x.manager_name)+' · '+esc(x.client_name)+'</b>'+
       '<span style="font-size:11px;color:'+color.color+'">'+esc(color.name)+(x.due_date?' · '+shortDate(x.due_date):'')+'</span></div>'+
     '<div style="font-size:12px;margin-top:5px"><b>'+esc(title)+'</b>'+(x.next_step?' — '+esc(x.next_step):'')+'</div>'+
     (x.comment?'<div style="font-size:11px;color:var(--sub);margin-top:4px">'+esc(x.comment)+'</div>':'')+
     '<div style="margin-top:8px"><button type="button" class="btn-secondary" data-gps-brief-case="'+esc(x.route_plan_id)+'">Открыть решение</button></div></div>';
 }).join('');
 const total=Number(counts.open_total||0),future=Number(counts.future||0);
 const count='<div style="margin-top:9px;font-size:11px;color:var(--sub)">Открытых решений всего: '+total+
 (future?' · На более поздние даты: '+future:'')+
 (items.length<total-future?' · Показаны первые '+items.length:'')+
 '. Выполненные и закрытые вопросы не отображаются.</div>';
 target.innerHTML=overview+visible+count;
}
async function load(force=false){
 if(!active()||busy||(!force&&Date.now()-lastAt<60000))return;
 const content=document.getElementById('gps-reminders-content-v236443');
 if(!content)return;
 busy=true;
 const btn=document.getElementById('gps-reminders-refresh-v236443');
 if(btn)btn.disabled=true;
 if(!lastAt)content.textContent='Загружаю поручения руководителя…';
 try{
  const {data,error}=await db.rpc('gps_director_reminders_v236443',{p_limit:60});
  if(error)throw error;
  render(data);lastAt=Date.now();
 }catch(e){content.innerHTML='<div style="font-size:12px;color:#991b1b">Напоминания временно не загружены: '+esc(e?.message||e)+'. Маршруты продолжают работать.</div>';}
 finally{busy=false;if(btn)btn.disabled=false;}
}
document.addEventListener('click',e=>{
 const tab=e.target.closest?.('#gps-tab-director-v236427');
 if(tab)setTimeout(()=>load(false),160);
 const btn=e.target.closest?.('#gps-reminders-refresh-v236443');
 if(btn){lastAt=0;load(true);}
},true);
document.addEventListener('resanta-gps-decision-updated',()=>{lastAt=0;load(true)});
setTimeout(()=>{if(active())load(false)},900);
window.RESANTA_GPS_REMINDERS_V236443=Object.freeze({version:'v23.6.443',onlyApprovedDecisions:true,onTabOpen:true,initialDelayMs:900,rawGpsReads:false});
})();