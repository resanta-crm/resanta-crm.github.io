// Calendar access is wider than analytical access. Never widen the existing CRM data scopes.
export const EXCLUDED='bcc330b8-9100-4c60-b87f-22a36988fc97';
export const OWNER='544fb1e2-ef70-44de-bc62-e0e1596a4bfc';
export const PEER='a24954b8-2fe1-4852-b629-d8f351e1bd36';
const FIELD={'19dd9943-99ae-47c4-a39c-4f82a11059a6':'Руднев','3d935a76-c6fe-44b6-b248-fcbe58c6bf1c':'Ачинович','4fd79fa0-232d-4768-8099-25f47923cc4f':'Шкуран'};
export function meetingAccess(user,profile){
 if(!user?.id||user.id!==profile?.id||user.id===EXCLUDED||profile.role==='auditor_pending')return null;
 if([OWNER,PEER].includes(user.id)&&profile.role==='boss')return {scope:'Все разрешённые данные CRM',managers:null,network:true};
 if(user.id==='ba55dfe5-7e48-4f1f-b40e-674c7752fe1a'&&profile.role==='boss'&&profile.region==='Витебск')return {scope:'Витебск · полевые менеджеры',managers:Object.values(FIELD),network:false};
 if(FIELD[user.id]===profile.name&&profile.role==='manager'&&profile.region==='Витебск')return {scope:profile.name,managers:[profile.name],network:false};
 if(['6efa656e-45c6-473b-a853-89eccb9ee43a','9076ccde-a8cc-47e3-b71e-c31170b693ff'].includes(user.id)&&profile.role==='manager'&&profile.region==='Триовист / 21vek.by')return {scope:profile.name+' · назначенные данные Триовиста',managers:[profile.name],network:false,category:true};
 return {scope:'Личный календарь · аналитика по действующим правам Леры',managers:[],network:false};
}
export function meetingContext(body,today){
 const focus=body?.focus||today,month=body?.month||focus.slice(0,7);
 if(!/^20\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(focus)||new Date(focus+'T12:00Z').toISOString().slice(0,10)!==focus||
 !/^20\d\d-(0[1-9]|1[0-2])$/.test(month))throw Error('invalid_period');
 const meeting_id=body?.meeting_id||null;
 if(meeting_id&&!/^[0-9a-f-]{36}$/i.test(meeting_id))throw Error('invalid_meeting');
 return {focus,month,meeting_id,manager:typeof body?.manager==='string'?body.manager.trim().slice(0,90):null};
}
export function allowedManagers(access,requested){
 if(!requested)return access.managers;
 if(access.network||access.managers.includes(requested))return [requested];
 throw Error('manager_not_allowed');
}
