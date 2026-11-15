/* Calendar-only invitations. Existing CONNECT transport and permissions are retained. */
(function(window,document){'use strict';
if(window.crmCalendarInvitesV3)return;
let actor='',polling=false,notices=[],openedLink=false,seenPush=new Set();
const uid=()=>{try{return String(currentUser?.id||'')}catch{return ''}},client=()=>typeof db!=='undefined'?db:window.db;
const allowed=()=>{try{return uid()&&currentProfile?.id===uid()&&uid()!=='bcc330b8-9100-4c60-b87f-22a36988fc97'&&currentProfile.role!=='auditor_pending'&&document.getElementById('app')?.style.display!=='none'}catch{return false}};
async function rpc(name,args={}){if(!allowed())throw Error('calendar_not_allowed');const before=uid(),r=await client().rpc(name,args);if(before!==uid()||!allowed())throw Error('session_changed');if(r.error)throw r.error;return r.data;}
function remove(){document.getElementById('cmp-invitation-banner')?.remove();}
function open(payload){if(payload.account_id&&payload.account_id!==uid())return;const id=payload.meeting_id,day=payload.calendar_day||payload.starts_at?.slice(0,10);if(!/^[0-9a-f-]{36}$/i.test(id||'')||!/^20\d\d-\d\d-\d\d$/.test(day||''))return;document.getElementById('nav-meeting-planner')?.click();window.crmMeetingPlannerPilotV1?.openInvitation?.(id,day);}
function paint(){remove();if(!allowed()||!notices.length||notices[0].account_id!==uid()||document.hidden)return;const n=notices[0],box=document.createElement('aside');box.id='cmp-invitation-banner';box.className='cmp-invitation-banner';box.setAttribute('role','status');
 const title=document.createElement('strong');title.textContent=({invitation:'Новое приглашение',changed:'Встреча изменена',cancelled:'Встреча отменена',reminder:'Напоминание о встрече'}[n.kind]||'Событие календаря')+': '+n.title;
 const info=document.createElement('span');info.textContent=n.organizer+' · '+new Date(n.starts_at).toLocaleString('ru-RU',{timeZone:'Europe/Minsk'})+' · Минск';
 const see=document.createElement('button');see.type='button';see.textContent='Открыть календарь';see.onclick=()=>{open({...n,calendar_day:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(n.starts_at))});void ack(n.id)};
 const close=document.createElement('button');close.type='button';close.textContent='Прочитано';close.onclick=()=>void ack(n.id);box.append(title,info,see,close);document.body.append(box);
}
async function ack(id){try{await rpc('crm_calendar_ack_v3',{p_event:id});notices=notices.filter(x=>x.id!==id);paint();}catch{}}
async function poll(){if(!allowed()){actor='';notices=[];remove();return}if(polling)return;polling=true;const u=uid();try{if(actor!==u){actor=u;seenPush.clear();notices=[];remove();openedLink=false;}notices=(await rpc('crm_calendar_inbox_v3')||[]).map(x=>({...x,account_id:u}));if(u!==uid())return;paint();
 if(!openedLink){const p=new URLSearchParams(window.location.search);if(p.get('calendar_account')===u&&p.get('calendar_meeting')){openedLink=true;open({meeting_id:p.get('calendar_meeting'),calendar_day:p.get('calendar_day'),account_id:u});}}
 }catch{}finally{polling=false;}}
window.crmCalendarInvitesV3=Object.freeze({directory:()=>rpc('crm_calendar_directory_v3'),list:(from,to)=>rpc('crm_calendar_list_v3',{p_from:from,p_to:to}),status:id=>rpc('crm_calendar_delivery_status_v3',{p_meeting:id}),poll});
window.addEventListener('focus',()=>void poll());document.addEventListener('visibilitychange',()=>{if(document.hidden)remove();else void poll()});
navigator.serviceWorker?.addEventListener('message',e=>{const p=e.data?.payload;if(!allowed()||p?.account_id!==uid()||!/^CALENDAR_(PUSH|OPEN)$/.test(e.data?.type||''))return;if(e.data.type==='CALENDAR_OPEN')open(p);if(!seenPush.has(p.delivery_id)){seenPush.add(p.delivery_id);void poll();void window.crmMeetingPlannerPilotV1?.refresh?.();}});
setInterval(()=>{if(actor&&actor!==uid()){actor='';notices=[];remove();}},1000);setInterval(()=>void poll(),30000);setTimeout(()=>{void poll();navigator.serviceWorker?.getRegistration?.().then(r=>r?.update()).catch(()=>{});},1800);
})(window,document);
