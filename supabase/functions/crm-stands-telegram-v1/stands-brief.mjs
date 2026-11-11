/* Pure stand360 Telegram decisions: ownership, evidence and 1C shipment proxy. */
export const norm=x=>String(x??'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,' ').trim();
export const surname=x=>norm(x).split(' ')[0]||'';
export const ruMoney=x=>Number(x||0).toLocaleString('ru-RU',{maximumFractionDigits:0});
export const monthStart=(date,offset=0)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+offset);return d.toISOString().slice(0,10);};
export const greet=user=>({'руднев':'Саня','ачинович':'Катюшка','шкуран':'Танюшка','паюшин':'родной','сидарович':'Кирюшка'})[surname(user?.name)]||String(user?.name||'коллега').trim().split(' ')[0];
export const registeredSku=x=>String(x??'').trim().replace(/\s+/g,'').toUpperCase();
export function assessStand(p,items,history,today,hasRoute){
 const keys=new Set((items||[]).map(x=>registeredSku(x.sku)).filter(Boolean));
 const relevant=(history||[]).filter(x=>x.client_id===p.client_id&&keys.has(registeredSku(x.sku)));
 const six=monthStart(today,-5),prev=monthStart(today,-11);
 const current=relevant.filter(x=>x.month>=six).reduce((a,x)=>a+Number(x.revenue||0),0);
 const prior=relevant.filter(x=>x.month>=prev&&x.month<six).reduce((a,x)=>a+Number(x.revenue||0),0);
 const latest=relevant.map(x=>String(x.month||'')).sort().at(-1)||null;
 const lastPhoto=p.last_control_at||p.installed_at||null;
 const photoDays=lastPhoto?Math.floor((Date.parse(today+'T12:00:00Z')-Date.parse(String(lastPhoto).slice(0,10)+'T12:00:00Z'))/86400000):null;
 const needsPhoto=!p.last_control_photo_path&&!p.installation_photo_path||photoDays===null||photoDays>31;
 let action='';
 if(!p.asset_id)action='Сверить ОС нашего стенда';
 if(needsPhoto)action=action||'Получить актуальное фото стенда у продавца или сделать самому';
 if(p.vision_status==='review'||p.vision_status==='bad_photo')action=action||'Проверить состояние и использование нашего стенда';
 if(keys.size&&Number(p.days_installed||100)>60&&(current<=0||(prior>0&&current<prior*.75)))action=action||'Уточнить причину слабых отгрузок по SKU стенда';
 if(hasRoute)action=action||'На сегодняшнем визите проверить наш стенд и сделать фото';
 return {id:p.id,client_id:p.client_id,client_name:p.client_name,manager_name:p.manager_name,
  asset_id:p.asset_id,action,route_today:!!hasRoute,needs_photo:needsPhoto,photo_days:photoDays,
  sku_count:keys.size,ship_6m:current,ship_prev_6m:prior,last_ship_month:latest};
}
export function recipientStandRows(user,standRows,managerProfiles){
 if(user?.role==='manager'){
  const verified=(managerProfiles||[]).find(m=>m.id===user.id&&m.role==='manager'&&m.access_scope!=='triovist');
  return verified?(standRows||[]).filter(x=>surname(x.manager_name)===surname(verified.name)):[];
 }
 if(user?.role==='boss'){
  if(String(user.email||'').toLowerCase()==='payushin_ar@resanta.ru')return standRows||[];
  const owned=new Set((managerProfiles||[]).filter(m=>m.role==='manager'&&m.region===user.region&&m.access_scope!=='triovist').map(m=>surname(m.name)));
  return (standRows||[]).filter(x=>owned.has(surname(x.manager_name)));
 }
 return [];
}
export function briefing(user,rows,today){
 const relevant=(rows||[]).filter(x=>x.action);
 if(!relevant.length)return null;
 const sorted=[...relevant].sort((a,b)=>Number(b.route_today)-Number(a.route_today)||Number(b.needs_photo)-Number(a.needs_photo));
 const hello=greet(user),isLeader=user.role==='boss';
 const intro='Привет, '+hello+'. Это Лера. У '+(isLeader?'команды':'тебя')+' '+sorted.length+' стендов требуют внимания.';
 const first=sorted[0];
 let voice=intro+' '+(first.route_today?'Сегодня маршрут к клиенту ':'Проверь стенд у клиента ')+first.client_name+'. '+first.action+'.';
 if(voice.length>240)voice=intro+' В первую очередь проверь '+first.client_name+'.';
 if(voice.length>240)voice=intro;
 const lines=sorted.slice(0,8).map((x,i)=>String(i+1)+'. '+x.client_name+
  ' · ID '+x.client_id.slice(0,8)+' · '+x.action+
  ' · отгрузки SKU за 6 мес.: '+(x.sku_count?ruMoney(x.ship_6m)+' BYN':'нет точных SKU'));
 return {voice,lines,scope_count:sorted.length,priority_client_id:first.client_id,stand_count:rows.length};
}
