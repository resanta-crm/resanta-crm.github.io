/* Pure stand360 Telegram decisions: ownership, evidence and 1C shipment proxy. */
export const norm=x=>String(x??'').toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^a-zа-я0-9]+/g,' ').trim();
export const surname=x=>norm(x).split(' ')[0]||'';
export const ruMoney=x=>Number(x||0).toLocaleString('ru-RU',{maximumFractionDigits:0});
export const monthStart=(date,offset=0)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+offset);return d.toISOString().slice(0,10);};
export const greet=user=>{
 const byId={
  "544fb1e2-ef70-44de-bc62-e0e1596a4bfc": "Александр",
  "a24954b8-2fe1-4852-b629-d8f351e1bd36": "Виталий",
  "ba55dfe5-7e48-4f1f-b40e-674c7752fe1a": "Кирилл",
  "19dd9943-99ae-47c4-a39c-4f82a11059a6": "Александр",
  "3d935a76-c6fe-44b6-b248-fcbe58c6bf1c": "Екатерина",
  "4fd79fa0-232d-4768-8099-25f47923cc4f": "Татьяна",
  "6efa656e-45c6-473b-a853-89eccb9ee43a": "Александр",
  "9076ccde-a8cc-47e3-b71e-c31170b693ff": "Наталья"
};
 if(byId[String(user?.id||'')])return byId[String(user.id)];
 const all=norm(user?.name),fallback={'руднев':'Александр','ачинович':'Екатерина','шкуран':'Татьяна','паюшин':'Александр','сидорович':'Кирилл'};
 return Object.entries(fallback).find(([k])=>all.split(' ').includes(k))?.[1]||String(user?.name||'коллега').trim().split(' ')[0];
};
export const registeredSku=x=>String(x??'').trim().replace(/\s+/g,'').toUpperCase();
export function assessStand(p,items,history,today,hasRoute){
 const keys=new Set((items||[]).map(x=>registeredSku(x.sku)).filter(Boolean));
 const clientHistory=(history||[]).filter(x=>x.client_id===p.client_id);
 const relevant=clientHistory.filter(x=>keys.has(registeredSku(x.sku)));
 const historyMatchedSku=new Set(relevant.map(x=>registeredSku(x.sku)));
 const six=monthStart(today,-5),prev=monthStart(today,-11);
 const current=relevant.filter(x=>x.month>=six).reduce((a,x)=>a+Number(x.revenue||0),0);
 const prior=relevant.filter(x=>x.month>=prev&&x.month<six).reduce((a,x)=>a+Number(x.revenue||0),0);
 const latest=relevant.map(x=>String(x.month||'')).sort().at(-1)||null;
 const lastPhoto=p.last_control_at||p.installed_at||null;
 const photoDays=lastPhoto?Math.floor((Date.parse(today+'T12:00:00Z')-Date.parse(String(lastPhoto).slice(0,10)+'T12:00:00Z'))/86400000):null;
 const needsPhoto=!p.last_control_photo_path&&!p.installation_photo_path||photoDays===null||photoDays>31;
 const actions=[];
 if(hasRoute)actions.push('По маршруту проверить наш стенд');
 if(!p.asset_id)actions.push('Сверить ОС');
 if(needsPhoto)actions.push('Получить актуальное фото от МПП или продавца');
 if(p.vision_status==='review'||p.vision_status==='bad_photo')actions.push('Исправить замечания Vision');
 if(!keys.size)actions.push('Уточнить точные SKU стенда');
 else if(historyMatchedSku.size===0)actions.push(clientHistory.length?'Сверить SKU стенда с каталогом и отгрузками 1С':'Сверить ID клиента и источник отгрузок 1С');
 else if(Number(p.days_installed??100)>60&&(current<=0||(prior>0&&current<prior*.75)))actions.push('Проверить слабые отгрузки SKU стенда');
 const action=actions.slice(0,4).join('; ');
 return {id:p.id,client_id:p.client_id,client_name:p.client_name,manager_name:p.manager_name,
  asset_id:p.asset_id,action,route_today:!!hasRoute,needs_photo:needsPhoto,photo_days:photoDays,
  sku_count:keys.size,matched_sku_count:historyMatchedSku.size,client_history_count:clientHistory.length,
  ship_6m:current,ship_prev_6m:prior,last_ship_month:latest};
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
// Approved, non-removed visit in today's route. Never match by a possibly duplicated client name.
export function routeMatchesStand(route,stand,pointLinks=[]){
 if(!route||!stand||!route.approved||route.removed===true||route.is_office_day===true)return false;
 if(surname(route.manager_name)!==surname(stand.manager_name))return false;
 const client=String(stand.client_id||'');
 if(!client)return false;
 if(String(route.client_id||'')===client)return true;
 if(Array.isArray(route.linked_client_ids)&&route.linked_client_ids.some(id=>String(id)===client))return true;
 return !!route.physical_point_id&&(pointLinks||[]).some(x=>String(x.point_id)===String(route.physical_point_id)&&String(x.client_id)===client);
}
// Daily MPP alerts are strictly today's approved route; other cases are a
// separate, max-three-item Monday check-in, not an endless daily backlog.
export function selectDelivery(user,owned,today){
 if(user?.role==='boss')return {mode:'director',rows:owned||[],total:owned?.length||0};
 const route=(owned||[]).filter(x=>x.route_today);
 if(route.length)return {mode:'route',rows:route,total:owned.length};
 const monday=new Date(today+'T12:00:00Z').getUTCDay()===1;
 const exceptions=(owned||[]).filter(x=>!x.route_today&&(x.needs_photo||!x.asset_id||x.client_history_count===0||x.matched_sku_count===0));
 return {mode:monday&&exceptions.length?'weekly':'skip',rows:monday?exceptions.slice(0,3):[],total:owned?.length||0};
}
export function briefing(user,selected,today,mode='director',total=selected.length){
 const all=(selected||[]),relevant=all.filter(x=>x.action);
 if(!relevant.length)return null;
 const sorted=[...relevant].sort((a,b)=>Number(b.route_today)-Number(a.route_today)||Number(b.needs_photo)-Number(a.needs_photo)||String(a.client_name).localeCompare(String(b.client_name),'ru'));
 const intro='Привет, '+greet(user)+'. Это Лера. ';
 const isLeader=mode==='director';
 const nameLine=x=>x.client_name+' — '+(x.needs_photo?'обновить фото':x.matched_sku_count===0?'сверить артикулы и данные 1С':!x.asset_id?'сверить имущество':x.vision_status==='review'?'проверить выкладку':'проверить стенд');
 const enumerated=sorted.map((x,i)=>(i+1)+'. '+nameLine(x)+'.').join(' ');
 let voice;
 if(isLeader){
  const routed=all.filter(x=>x.route_today).length;
  voice=intro+'В сети '+total+' стендов. В утверждённых маршрутах сегодня '+routed+'. Перечисляю все '+sorted.length+' стендов по порядку. '+enumerated;
 }else if(mode==='route'){
  voice=intro+'Сегодня в твоём утверждённом маршруте '+sorted.length+' клиента со стендами. '+enumerated;
 }else{
  voice=intro+'Маршрутных стендов сегодня нет. Это отдельная еженедельная проверка: '+sorted.length+' клиента вне маршрута. '+enumerated;
 }
 // Never claim to cover all 10 if audio lists only the first. Limit inputs
 // via capped business population rather than silently truncating enumerations.
 if(voice.length>3400)voice=intro+'Полный перечень '+sorted.length+' стендов отправлен текстом. Голосовой обзор ограничен длиной. Обязательно открой список.';
 const lines=sorted.map((x,i)=>String(i+1)+'. '+x.client_name+
  ' · ID '+String(x.client_id).slice(0,8)+' · '+x.action+
  ' · отгрузки по SKU за 6 мес.: '+(x.matched_sku_count?ruMoney(x.ship_6m)+' BYN (сопоставлено '+x.matched_sku_count+' из '+x.sku_count+')':'не сопоставлено с 1С'));
 return {voice,lines,scope_count:sorted.length,priority_client_id:sorted[0]?.client_id,
  stand_count:total,mode,route_count:all.filter(x=>x.route_today).length};
}
