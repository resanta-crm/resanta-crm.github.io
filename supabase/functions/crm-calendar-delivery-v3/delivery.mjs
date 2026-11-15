export function calendarMessage(event,meeting,organizer){
 const label={invitation:'Приглашение на встречу',changed:'Встреча изменена',cancelled:'Встреча отменена',reminder:'Скоро встреча'}[event.kind];
 if(!label)throw Error('invalid_event');
 const when=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Minsk',dateStyle:'short',timeStyle:'short'}).format(new Date(meeting.starts_at));
 return {title:label+' · РЕСАНТА',body:String(meeting.title).slice(0,160)+' · '+when+' (Минск)',text:label+'\n'+String(meeting.title).slice(0,160)+'\n'+when+' (Минск), '+meeting.duration_minutes+' мин.\nОрганизатор: '+String(organizer).slice(0,100)+(meeting.purpose?'\nЦель: '+String(meeting.purpose).slice(0,800):'')+'\nhttps://resanta-crm.by/?'+new URLSearchParams({calendar_meeting:event.meeting_id,calendar_account:event.recipient_id,calendar_day:new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(meeting.starts_at))})};
}
export function summarizeDelivery(results){
 const sent=results.some(x=>x.status==='sent'),uncertain=results.some(x=>x.status==='unknown'),failed=results.some(x=>x.status==='failed');
 return sent?(uncertain||failed?'partial':'sent'):uncertain?'unknown':failed?'failed':'no_channel';
}
