// Shared birthday rules. No network, user-editable role claims or inferred dates.
export const PEOPLE=Object.freeze({
 '544fb1e2-ef70-44de-bc62-e0e1596a4bfc':{name:'Александр Паюшин',role:'boss',region:'Витебск',email:'payushin_ar@resanta.ru',tier:'director'},
 'ba55dfe5-7e48-4f1f-b40e-674c7752fe1a':{name:'Сидарович К.Н.',role:'boss',region:'Витебск',email:'sidarovich_kn@resanta.ru',tier:'director'},
 '19dd9943-99ae-47c4-a39c-4f82a11059a6':{name:'Руднев',role:'manager',region:'Витебск',tier:'manager'},
 '3d935a76-c6fe-44b6-b248-fcbe58c6bf1c':{name:'Ачинович',role:'manager',region:'Витебск',tier:'manager'},
 '4fd79fa0-232d-4768-8099-25f47923cc4f':{name:'Шкуран',role:'manager',region:'Витебск',tier:'manager'},
 '9076ccde-a8cc-47e3-b71e-c31170b693ff':{name:'Кришталь',role:'manager',region:'Триовист / 21vek.by',tier:'triovist'},
 '6efa656e-45c6-473b-a853-89eccb9ee43a':{name:'Александренко',role:'manager',region:'Триовист / 21vek.by',tier:'triovist'}
});
export const DIRECTORS=Object.freeze(Object.keys(PEOPLE).filter(k=>PEOPLE[k].tier==='director'));
export const norm=x=>String(x??'').trim().toLocaleLowerCase('ru-RU').replaceAll('ё','е').replace(/\s+/g,' ');
export function principal(user,profile){const p=PEOPLE[user?.id];if(['service_manager','payment_executor'].includes(profile?.access_scope)||!p||profile?.id!==user.id||!user.email_confirmed_at||norm(user.email)!==norm(profile.email)||profile.role!==p.role||norm(profile.name)!==norm(p.name)||profile.region!==p.region||p.email&&norm(profile.email)!==p.email)return null;return {...profile,tier:p.tier};}
export const validDate=(m,d)=>Number.isInteger(m)&&Number.isInteger(d)&&m>=1&&m<=12&&d>=1&&d<=31&&new Date(Date.UTC(2000,m-1,d)).getUTCMonth()===m-1;
export function localDay(now=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Minsk'}).format(now);}
export function occurrence(year,month,day){if(!validDate(month,day))return null;const max=new Date(Date.UTC(year,month,0)).getUTCDate();return new Date(Date.UTC(year,month-1,Math.min(day,max),12));}
export function nextBirthday(month,day,today){if(!validDate(month,day))return null;const base=new Date(today+'T12:00:00Z');let y=base.getUTCFullYear(),date=occurrence(y,month,day);if(date<base)date=occurrence(++y,month,day);return {date:date.toISOString().slice(0,10),days_until:Math.round((date-base)/86400000),adjusted:date.getUTCDate()!==day};}
export function canRead(actor,person,clientIds){if(!actor||!person.active)return false;if(person.organization_key==='triovist')return actor.tier==='director'||actor.tier==='triovist'&&person.responsible_user_id===actor.id;return actor.tier!=='triovist'&&clientIds.has(person.client_id);}
export function responsible(person,client,profiles){const id=person.organization_key==='triovist'?person.responsible_user_id:Object.keys(PEOPLE).find(k=>PEOPLE[k].tier==='manager'&&PEOPLE[k].name===client?.manager_name);const actual=profiles.find(p=>p.id===id),known=PEOPLE[id];if(!actual||!known||actual.name!==known.name||actual.role!==known.role||actual.region!==known.region||!['manager','triovist'].includes(known.tier))return null;return id;}
export function recipients(person,client,profiles){const id=responsible(person,client,profiles);if(!id)return [];return [...new Set([id,...DIRECTORS.filter(id=>profiles.some(p=>p.id===id&&p.name===PEOPLE[id].name&&p.role==='boss'&&p.region==='Витебск'))])];}
export function eventsFor(person,today){const n=nextBirthday(person.birth_month,person.birth_day,today);return n&&n.days_until<=1?[{event_kind:n.days_until===0?'birthday':'1_day',event_date:n.date,adjusted:n.adjusted}]:[];}
export function vipCategory(client,memberships,overrides=[]){if(client.id==='triovist')return 'ВИП ДД';const hit=memberships.filter(m=>m.active&&(m.client_id===client.id||overrides.some(o=>o.client_id===client.id&&norm(o.vip_name)===norm(m.client_name))));if(hit.some(m=>m.department==='ВИП ДФС'))return 'ВИП ДФС';if(hit.some(m=>m.department==='ВИП ДФ'))return 'ВИП ДФ';return null;}
export function deliveryResult(response,body){if(body?.ok===true&&body.result?.message_id)return {status:'sent',message_id:String(body.result.message_id)};if(body?.ok===false)return {status:'failed',error:'telegram_rejected',retry_after:Math.max(60,Number(body.parameters?.retry_after)||300)};return {status:'delivery_unknown',error:'telegram_response_unknown'};}
export function filterContacts(contacts,{query='',from=0,to=366}={}){const q=norm(query);return contacts.filter(c=>c.days_until>=from&&c.days_until<=to&&(!q||norm([c.full_name,c.client_name,c.position_title].join(' ')).includes(q)));}
