/* RESANTA CRM v23.6.299 · TRIOVIST / 21VEK AUTOMATIC MARKET
 * Automatic market map from the first two 21vek ranking pages.
 * Separate read-only analytical contour; production own-card parser is untouched.
 */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_COMPETITORS_V236218)return;
const V='v23.6.299',TTL=30000;
let flight=null,last=null,lastAt=0,listingFlight=null,listingCache=new Map(),exportFlight=null,xlsxFlight=null;
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const N=v=>Number.isFinite(Number(v))?Number(v):null;
const money=v=>N(v)==null||N(v)<=0?'нет данных':N(v).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
const pct=v=>N(v)==null?'—':(N(v)>0?'+':'')+N(v).toFixed(1).replace('.',',')+'%';
const dt=v=>{if(!v)return'—';try{return new Date(v).toLocaleString('ru-RU',{timeZone:'Europe/Minsk',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}catch(_){return String(v)}};
function dbx(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
async function rpc(name,args={}){
 const d=dbx();if(!d?.rpc)throw Error('Соединение с базой ещё не готово');
 const call=()=>d.rpc(name,args);
 const r=typeof window.crmAuthRetryV236166==='function'?await window.crmAuthRetryV236166(call):await call();
 if(r?.error)throw r.error;return r?.data||{};
}
async function load(force=false){
 if(last&&!force&&Date.now()-lastAt<TTL)return last;
 if(flight)return flight;
 flight=rpc('triovist_market_dashboard_v236283',{}).then(d=>{last=d;lastAt=Date.now();return d}).finally(()=>flight=null);
 return flight;
}
async function loadListing(days=7,force=false){
 const d=[1,3,7,14,30].includes(Number(days))?Number(days):7;
 const cached=listingCache.get(d);
 if(cached&&!force&&Date.now()-cached.at<TTL)return cached.data;
 if(listingFlight)return listingFlight;
 listingFlight=rpc('triovist_market_own_listing_v236235',{p_days:d})
  .then(data=>{listingCache.set(d,{data,at:Date.now()});return data})
  .finally(()=>listingFlight=null);
 return listingFlight;
}
function statusLabel(s){
 if(s==='ours_stronger')return['🟢 Мы сильнее','good'];
 if(s==='competitor_stronger')return['🔴 Конкурент сильнее','bad'];
 if(s==='parity')return['🟡 Паритет','warn'];
 if(s==='data_incomplete')return['🟡 Недостаточно данных','warn'];
 return['—',''];
}
function rowStatus(r){
 if(r?.is_main_competitor===false)return['⚪ Ориентир рынка',''];
 return statusLabel(r?.status);
}
function competitorBadge(r){
 if(r?.is_main_competitor===true && r?.profile_key==='chainsaw_gas')return '<span class="tm224-main-badge">⭐ Основной конкурент</span>';
 if(r?.is_main_competitor===false)return '<span class="tm224-market-badge">Рынок / ориентир</span>';
 return '';
}
function gradeLabel(g){
 return ({direct:'Прямой аналог',close:'Близкий аналог',conditional:'Условный аналог',no_direct:'Не аналог'})[g]||'—';
}
function specLine(k,v){
 if(v==null)return'';
 const names={
  device_type:'Тип устройства',power_w:'Мощность обогрева',area_m2:'Площадь обогрева',heater_type:'Нагревательный элемент',thermostat_type:'Термостат',technologies:'Технологии',power_supply:'Питание',
  control_type:'Управление',display_present:'Дисплей',power_adjustment:'Регулировка мощности',temperature_adjustment:'Регулировка температуры',wheels_present:'Колеса для перемещения',remote_control:'Пульт ДУ',fan_present:'Встроенный вентилятор',fan_only_mode:'Обдув без нагрева',indicator_light:'Световой индикатор',power_modes:'Количество режимов мощности',overheat_protection:'Защита от перегрева',
  ip_rating:'Влагозащита',installation_type:'Установка',weight_kg:'Вес',sections_count:'Секции',
  fuel_type:'Тип',heating_mode:'Нагрев',airflow_m3h:'Производительность',fuel_consumption_kgh:'Расход топлива',
  tank_l:'Бак',width_mm:'Ширина',humidistat:'Гигростат',noise_db:'Шум',output_mlh:'Макс. расход воды',
  base_type:'Цоколь',color_temp_k:'Цветовая температура',luminous_flux_lm:'Световой поток',bulb_shape:'Форма',
  engine_cc:'Объём двигателя',bar_length_cm:'Шина',chain_pitch_in:'Шаг цепи',drive_links:'Звенья',
  fuel_tank_l:'Топливный бак',chain_speed_ms:'Скорость цепи',motor_position:'Двигатель',purpose:'Назначение',
  tool_free_tension:'Быстрое натяжение цепи',chain_brake:'Тормоз цепи',auto_chain_lubrication:'Автоматическая смазка цепи',voltage_v:'Напряжение',equipment:'Комплектация',
  snow_blower_type:'Тип снегоуборщика',power_source:'Источник питания',battery_capacity_ah:'Емкость аккумулятора',battery_voltage_v:'Напряжение аккумулятора',
  clearing_width_cm:'Ширина обработки',intake_height_cm:'Высота обработки',throw_distance_m:'Макс. дальность выброса',drive_type:'Движитель',
  operator_panel_control:'Управление с панели оператора',motor_power_w:'Мощность двигателя',gears:'Количество передач',headlight:'Фара',
  engine_start_type:'Пуск двигателя',starter_power_source:'Питание электростартера',starter_voltage_v:'Напряжение электростартера',
  heated_handles:'Подогрев ручек',clutch_type:'Сцепление',skid_height_adjustment:'Регулировка высоты полозьев',
  construction:'Конструкция',air_speed_ms:'Скорость воздушного потока',engine_type:'Тип двигателя',battery_type:'Тип аккумулятора',
  rpm:'Обороты двигателя',functions:'Функции',fuel_power_w:'Мощность топливного двигателя',
  max_auger_diameter_mm:'Макс. диаметр бура',shaft_diameter_mm:'Диаметр посадочного отверстия',
  processed_material:'Перерабатываемый материал',body_material:'Материал корпуса',cutting_mechanism:'Режущий механизм',
  input_power_w:'Входная мощность',cutting_speed_rpm:'Скорость резания',max_branch_diameter_mm:'Макс. диаметр веток',
  collector_capacity_l:'Емкость бункера/травосборника',feed_openings_count:'Кол-во загрузочных отверстий',
  collector_present:'Бункер/травосборник',collector_type:'Тип бункера/травосборника',
  tool_type:'Тип инструмента',knife_type:'Тип ножа',blade_type:'Тип лезвия',max_cut_diameter_mm:'Максимальная толщина среза',
  application_area:'Область применения',carry_type:'Вид переноски',flow_rate_lmin:'Производительность',
  tank_capacity_l:'Объем емкости',fuel_engine_type:'Тип бензинового двигателя',spray_radius_m:'Радиус опрыскивания',
  wrench_type:'Тип гайковерта',motor_type:'Тип электродвигателя',reverse_present:'Реверс',operating_modes:'Режимы',
  chuck_type:'Тип патрона',drive_size_in:'Посадочный квадрат/шестигранник',rotation_adjustment:'Регулировка вращения',
  max_rpm:'Макс. скорость вращения',max_torque_nm:'Макс. крутящий момент',charging_time_min:'Время зарядки',
  cut_speed_adjustment:'Регулировка скорости распила',cut_depth_90_mm:'Глубина реза 90°',cut_depth_45_mm:'Глубина реза 45°',
  blade_diameter_mm:'Диаметр пильного диска',arbor_diameter_mm:'Диаметр посадочного гнезда',tilt_angle_deg:'Угол наклона диска',
  speed_count:'Количество скоростей',impact_present:'Наличие удара',battery_count:'Количество АКБ в комплекте',case_present:'Наличие кейса',
  tank_position:'Расположение бачка',pressure_bar:'Давление',
  cut_depth_wood_mm:'Максимальная глубина пропила',strokes_per_min:'Количество ходов в минуту',
  width_mm:'Ширина',height_mm:'Высота',depth_mm:'Глубина'
 };
 const units={power_w:' Вт',area_m2:' м²',power_modes:' шт.',weight_kg:' кг',sections_count:' шт.',
  airflow_m3h:' м³/ч',fuel_consumption_kgh:' кг/ч',tank_l:' л',width_mm:' мм',noise_db:' дБ',
  output_mlh:' мл/ч',color_temp_k:' K',luminous_flux_lm:' лм',engine_cc:' см³',bar_length_cm:' см',
  chain_pitch_in:'"',drive_links:' шт.',fuel_tank_l:' л',chain_speed_ms:' м/с',voltage_v:' В',
  battery_capacity_ah:' А·ч',battery_voltage_v:' В',starter_voltage_v:' В',clearing_width_cm:' см',intake_height_cm:' см',throw_distance_m:' м',motor_power_w:' Вт',
  air_speed_ms:' м/с',rpm:' об/мин',fuel_power_w:' Вт',max_auger_diameter_mm:' мм',shaft_diameter_mm:' мм',
  input_power_w:' Вт',cutting_speed_rpm:' об/мин',max_branch_diameter_mm:' мм',collector_capacity_l:' л',feed_openings_count:' шт.',
  max_cut_diameter_mm:' мм',flow_rate_lmin:' л/мин',tank_capacity_l:' л',spray_radius_m:' м',
  drive_size_in:'"',max_rpm:' об/мин',max_torque_nm:' Н·м',charging_time_min:' мин',
  cut_depth_90_mm:' мм',cut_depth_45_mm:' мм',blade_diameter_mm:' мм',arbor_diameter_mm:' мм',tilt_angle_deg:'°',
  speed_count:' шт.',battery_count:' шт.',pressure_bar:' бар',cut_depth_wood_mm:' мм',strokes_per_min:' ход/мин',
  width_mm:' мм',height_mm:' мм',depth_mm:' мм'};
 const x=typeof v==='boolean'?(v?'да':'нет'):v;
 return '<span><b>'+E(names[k]||k)+':</b> '+E(x)+E(units[k]||'')+'</span>';
}
function convectorResult(k,a,b){
 if(a==null||b==null)return 'нет данных';
 if(k==='power_w'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return 'нет данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1);
  if(d<=.05)return 'полное совпадение';
  if(d<=.10)return 'близкое совпадение';
  if(d<=.20)return 'частичное совпадение';
  return 'существенное отличие';
 }
 if(typeof a==='boolean'||typeof b==='boolean')return Boolean(a)===Boolean(b)?'совпадает':'отличается';
 const na=String(a).trim().toLowerCase(),nb=String(b).trim().toLowerCase();
 return na===nb||na.includes(nb)||nb.includes(na)?'совпадает':'отличается';
}
function convectorValue(k,v){
 if(v==null)return 'нет данных';
 if(typeof v==='boolean')return v?'есть':'нет';
 if(k==='power_w')return E(v)+' Вт';
 return E(v);
}
function oilRadiatorValue(k,v){
 if(v==null)return 'нет данных';
 if(typeof v==='boolean')return v?'есть':'нет';
 if(k==='power_w')return E(v)+' Вт';
 if(k==='sections_count')return E(v)+' шт.';
 return E(v);
}
function oilRadiatorResult(k,a,b){
 if(a==null||b==null)return 'нет данных';
 if(k==='power_w'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return 'нет данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1);
  if(d<=.05)return 'полное совпадение';
  if(d<=.10)return 'близкое совпадение';
  if(d<=.20)return 'частичное совпадение';
  return 'существенное отличие';
 }
 if(k==='sections_count'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return 'нет данных';
  const d=Math.abs(av-bv);
  if(d<.5)return 'полное совпадение';
  if(d<=1)return 'близкое совпадение · разница 1 секция';
  if(d<=2)return 'частичное совпадение · разница '+Math.round(d)+' секции';
  return 'существенное отличие · разница '+Math.round(d)+' секций';
 }
 if(typeof a==='boolean'||typeof b==='boolean')return Boolean(a)===Boolean(b)?'совпадает':'отличается';
 const na=String(a).trim().toLowerCase(),nb=String(b).trim().toLowerCase();
 return na===nb||na.includes(nb)||nb.includes(na)?'совпадает':'отличается';
}
function fanHeaterValue(k,v){
 if(v==null)return 'нет данных';
 if(typeof v==='boolean')return v?'есть':'нет';
 if(k==='power_w')return E(v)+' Вт';
 return E(v);
}
function fanHeaterResult(k,a,b){
 if(a==null||b==null)return 'нет данных';
 if(k==='power_w'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return 'нет данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1);
  if(d<=.05)return 'полное совпадение';
  if(d<=.10)return 'близкое совпадение';
  if(d<=.20)return 'частичное совпадение';
  return 'существенное отличие';
 }
 if(k==='thermostat_type'){
  const present=x=>!/нет|отсутств|не предусмотр/i.test(String(x));
  return present(a)===present(b)?'наличие совпадает':'отличается';
 }
 if(typeof a==='boolean'||typeof b==='boolean')return Boolean(a)===Boolean(b)?'совпадает':'отличается';
 const na=String(a).trim().toLowerCase(),nb=String(b).trim().toLowerCase();
 return na===nb||na.includes(nb)||nb.includes(na)?'совпадает':'отличается';
}
function heatGunType(v){
 if(v==null)return 'нет данных';
 return ({electric:'электрическая',gas:'газовая',diesel:'дизельная'})[String(v)]||E(v);
}
function heatGunHeating(v){
 if(v==null)return 'нет данных';
 return ({direct:'прямой',indirect:'непрямой'})[String(v)]||E(v);
}
function heatGunValue(k,v){
 if(v==null)return 'нет данных';
 if(k==='fuel_type')return heatGunType(v);
 if(k==='heating_mode')return heatGunHeating(v);
 if(typeof v==='boolean')return v?'есть':'нет';
 if(k==='power_w')return E(v)+' Вт';
 if(k==='airflow_m3h')return E(v)+' м³/ч';
 if(k==='voltage_v')return E(v)+' В';
 if(k==='fuel_consumption_kgh')return E(v)+' кг/ч';
 if(k==='tank_l')return E(v)+' л';
 return E(v);
}
function heatGunResult(k,a,b){
 if(a==null||b==null)return 'нет данных';
 if(k==='fuel_type')return String(a)===String(b)?'один тип':'разный тип — не аналог';
 if(k==='heating_mode')return String(a)===String(b)?'совпадает':'прямой/непрямой — не аналог';
 if(k==='voltage_v'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return 'нет данных';
  const cls=x=>x>=200&&x<=250?'1 фаза · 220/230 В':(x>=360&&x<=420?'3 фазы · 380/400 В':String(x)+' В');
  return cls(av)===cls(bv)?cls(av):'разный класс питания — не аналог';
 }
 if(k==='power_w'||k==='airflow_m3h'||k==='fuel_consumption_kgh'||k==='tank_l'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return 'нет данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1);
  const t=k==='power_w'?[.05,.10,.20]:[.10,.20,.30];
  if(d<=t[0])return 'полное совпадение';
  if(d<=t[1])return 'близкое совпадение';
  if(d<=t[2])return 'частичное совпадение';
  return 'существенное отличие';
 }
 if(k==='thermostat_type'){
  const present=x=>!/нет|отсутств|не предусмотр/i.test(String(x));
  return present(a)===present(b)?'наличие совпадает':'отличается';
 }
 if(typeof a==='boolean'||typeof b==='boolean')return Boolean(a)===Boolean(b)?'совпадает':'отличается';
 const na=String(a).trim().toLowerCase(),nb=String(b).trim().toLowerCase();
 return na===nb||na.includes(nb)||nb.includes(na)?'совпадает':'отличается';
}
function humidifierTech(v){
 if(v==null)return 'нет данных';
 return ({ultrasonic:'ультразвуковая',traditional:'традиционная',steam:'паровая'})[String(v)]||E(v);
}
function humidifierSupply(v){
 if(v==null)return 'нет данных';
 return ({
  mains:'от сети',usb:'USB',battery:'аккумулятор/батарея',
  'mains+usb':'сеть + USB','mains+battery':'сеть + аккумулятор',
  'usb+battery':'USB + аккумулятор','mains+usb+battery':'сеть + USB + аккумулятор'
 })[String(v)]||E(v);
}
function humidifierValue(k,v){
 if(v==null)return 'нет данных';
 if(k==='technologies')return humidifierTech(v);
 if(k==='power_supply')return humidifierSupply(v);
 if(typeof v==='boolean')return v?'есть':'нет';
 if(k==='power_w')return E(v)+' Вт';
 if(k==='area_m2')return E(v)+' м²';
 if(k==='tank_l')return E(v)+' л';
 if(k==='output_mlh')return E(v)+' мл/ч';
 return E(v);
}
function humidifierResult(k,a,b){
 if(a==null||b==null)return 'нет данных';
 if(k==='device_type'){
  const fam=x=>{
   const s=String(x).toLowerCase();
   if(/мойк.*воздух/.test(s))return 'air_washer';
   if(/диффуз/.test(s)&&!/увлажн/.test(s))return 'diffuser';
   if(/ультразв/.test(s)&&/увлажн/.test(s))return 'humidifier_ultrasonic';
   if(/традиц|холодн.*испар|естествен.*испар/.test(s)&&/увлажн/.test(s))return 'humidifier_traditional';
   if(/паров|горяч.*пар/.test(s)&&/увлажн/.test(s))return 'humidifier_steam';
   return /увлажн/.test(s)?'humidifier':s;
  };
  const aa=fam(a),bb=fam(b);
  const specific=x=>/^humidifier_/.test(x);
  return (specific(aa)&&specific(bb)&&aa!==bb)?'разный тип увлажнения — не аналог':(aa===bb||aa==='humidifier'||bb==='humidifier'?'совпадает':'разный тип — не аналог');
 }
 if(k==='technologies')return String(a)===String(b)?'совпадает':'набор технологий отличается';
 if(k==='output_mlh'||k==='area_m2'||k==='tank_l'||k==='power_w'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return 'нет данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1);
  const t=k==='power_w'?[.15,.30,.50]:[.10,.20,.30];
  if(d<=t[0])return 'полное совпадение';
  if(d<=t[1])return 'близкое совпадение';
  if(d<=t[2])return 'частичное совпадение';
  return 'существенное отличие';
 }
 if(typeof a==='boolean'||typeof b==='boolean')return Boolean(a)===Boolean(b)?'совпадает':'отличается';
 const na=String(a).trim().toLowerCase(),nb=String(b).trim().toLowerCase();
 return na===nb||na.includes(nb)||nb.includes(na)?'совпадает':'отличается';
}







function jigsawMotor(v){
 if(v==null)return'нет данных';
 const s=String(v).toLowerCase();
 if(/brushless|бесщет|бесщёточ/.test(s))return'бесщеточный';
 if(/brushed|щеточ|щёточ|коллектор/.test(s))return'щеточный';
 return E(v);
}
function jigsawValue(k,v){
 if(v==null)return'нет данных';
 if(k==='input_power_w')return E(v)+' Вт';
 if(k==='cut_depth_wood_mm')return E(v)+' мм';
 if(k==='strokes_per_min')return E(v)+' ход/мин';
 if(k==='motor_type')return jigsawMotor(v);
 return E(v);
}
function jigsawResult(k,a,b){
 if(a==null||b==null)return'недостаточно данных';
 if(k==='input_power_w'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv);
  if(d<=100)return'полное совпадение · допуск ±100 Вт';
  return av>bv?'наша мощность выше на '+Math.round(d)+' Вт':'мощность конкурента выше на '+Math.round(d)+' Вт';
 }
 if(k==='cut_depth_wood_mm'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1e-9);
  if(d<=.10)return'полное совпадение · допуск ±10%';
  return av>bv?'у нас глубина пропила больше':'у конкурента глубина пропила больше';
 }
 if(k==='strokes_per_min'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1e-9);
  if(d<=.10)return'полное совпадение · допуск ±10%';
  if(d<=.20)return'близкое совпадение';
  return'частота ходов отличается';
 }
 if(k==='motor_type'){
  const aa=jigsawMotor(a),bb=jigsawMotor(b);
  if(aa===bb)return'совпадает';
  if(aa==='бесщеточный'&&bb==='щеточный')return'наш бесщеточный — преимущество';
  if(aa==='щеточный'&&bb==='бесщеточный')return'у конкурента бесщеточный';
  return'тип двигателя отличается';
 }
 return String(a)===String(b)?'совпадает':'отличается';
}
function paintSprayerTank(v){
 if(v==null)return'нет данных';
 const s=String(v).toLowerCase();
 if(/upper|верхн|сверху/.test(s))return'верхнее';
 if(/lower|нижн|снизу/.test(s))return'нижнее';
 if(/remote|separate|выносн|отдельн|раздельн/.test(s))return'выносное/отдельное';
 return E(v);
}
function paintSprayerValue(k,v){
 if(v==null)return'нет данных';
 if(k==='input_power_w')return E(v)+' Вт';
 if(k==='tank_position')return paintSprayerTank(v);
 if(k==='pressure_bar')return E(v)+' бар';
 return E(v);
}
function paintSprayerResult(k,a,b){
 if(a==null||b==null)return'недостаточно данных';
 if(k==='input_power_w'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv);
  if(d<=100)return'полное совпадение · допуск ±100 Вт';
  return av>bv?'наша мощность выше на '+Math.round(d)+' Вт':'мощность конкурента выше на '+Math.round(d)+' Вт';
 }
 if(k==='tank_position'){
  const aa=paintSprayerTank(a),bb=paintSprayerTank(b);
  return aa===bb?'совпадает':'расположение бачка отличается';
 }
 if(k==='pressure_bar'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1e-9);
  if(d<=.10)return'полное совпадение · допуск ±10%';
  return av>bv?'наше давление выше':'давление конкурента выше';
 }
 return String(a)===String(b)?'совпадает':'отличается';
}
function screwdriverMotor(v){
 if(v==null)return'нет данных';
 const s=String(v).toLowerCase();
 if(/brushless|бесщет|бесщёточ/.test(s))return'бесщеточный';
 if(/brushed|щеточ|щёточ|коллектор/.test(s))return'щеточный';
 return E(v);
}
function screwdriverValue(k,v){
 if(v==null)return'нет данных';
 if(k==='battery_capacity_ah')return E(v)+' А·ч';
 if(k==='motor_type')return screwdriverMotor(v);
 if(k==='max_torque_nm')return E(v)+' Н·м';
 if(k==='impact_present'||k==='case_present')return Boolean(v)?'есть':'нет';
 if(k==='battery_count')return E(v)+' шт.';
 return E(v);
}
function screwdriverResult(k,a,b){
 if(a==null||b==null)return'недостаточно данных';
 if(k==='battery_capacity_ah'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1e-9);
  if(d<=.15)return'полное совпадение · допуск ±15%';
  return av>bv?'у нас больше емкость АКБ':'у конкурента больше емкость АКБ';
 }
 if(k==='motor_type'){
  const aa=screwdriverMotor(a),bb=screwdriverMotor(b);
  if(aa===bb)return'совпадает';
  if(aa==='бесщеточный'&&bb==='щеточный')return'наш бесщеточный — преимущество';
  if(aa==='щеточный'&&bb==='бесщеточный')return'у конкурента бесщеточный';
  return'тип двигателя отличается';
 }
 if(k==='max_torque_nm'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1e-9);
  if(d<=.10)return'полное совпадение · допуск ±10%';
  return av>bv?'наш крутящий момент выше':'крутящий момент конкурента выше';
 }
 if(k==='impact_present'){
  if(Boolean(a)===Boolean(b))return Boolean(a)?'удар есть у обоих':'удара нет у обоих';
  return Boolean(a)?'удар есть у нас — преимущество':'удар есть у конкурента';
 }
 if(k==='battery_count'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  if(av===bv)return'совпадает';
  return av>bv?'у нас больше АКБ в комплекте':'у конкурента больше АКБ в комплекте';
 }
 if(k==='case_present'){
  if(Boolean(a)===Boolean(b))return Boolean(a)?'кейс есть у обоих':'кейса нет у обоих';
  return Boolean(a)?'кейс есть у нас — преимущество':'кейс есть у конкурента';
 }
 return String(a)===String(b)?'совпадает':'отличается';
}
function impactDrillDevice(v){
 if(v==null)return'';
 const s=String(v).toLowerCase();
 if(/перфоратор|rotary hammer/.test(s))return'перфоратор';
 if(/шуруповерт|шуруповёрт|drill driver/.test(s))return'дрель-шуруповерт';
 if(/миксер/.test(s))return'дрель-миксер';
 if(/безудар|non[- ]?impact/.test(s))return'безударная дрель';
 if(/удар|impact/.test(s)&&/дрел/.test(s))return'ударная дрель';
 if(/дрел/.test(s))return'дрель';
 return E(v);
}
function impactDrillValue(k,v){
 if(v==null)return'нет данных';
 if(k==='input_power_w')return E(v)+' Вт';
 if(k==='speed_count')return E(v)+' шт.';
 if(k==='max_rpm')return E(v)+' об/мин';
 if(k==='impact_present')return Boolean(v)?'есть':'нет';
 if(k==='device_type')return impactDrillDevice(v);
 return E(v);
}
function impactDrillResult(k,a,b){
 if(a==null||b==null)return'недостаточно данных';
 if(k==='input_power_w'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv);
  if(d<=100)return'полное совпадение · допуск ±100 Вт';
  return av>bv?'наша мощность выше на '+Math.round(d)+' Вт':'мощность конкурента выше на '+Math.round(d)+' Вт';
 }
 if(k==='speed_count'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  if(av===bv)return'совпадает';
  return av>bv?'у нас больше скоростей':'у конкурента больше скоростей';
 }
 if(k==='max_rpm'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1e-9);
  if(d<=.10)return'полное совпадение';
  if(d<=.20)return'близкое совпадение';
  return'обороты отличаются';
 }
 if(k==='impact_present'){
  if(Boolean(a)===Boolean(b))return Boolean(a)?'удар есть у обоих':'удара нет у обоих';
  return Boolean(a)?'у нас есть удар — конкурент не аналог':'у конкурента есть удар — наш не аналог';
 }
 return String(a)===String(b)?'совпадает':'отличается';
}
function circularSawDevice(v){
 if(v==null)return'';
 const s=String(v).toLowerCase();
 if(/станок/.test(s)&&/циркуляр|распилов|настоль/.test(s))return'циркулярный станок';
 if(/торцов|miter|mitre/.test(s))return'торцовочная пила';
 if(/погруж|plunge/.test(s))return'погружная дисковая пила';
 if(/мини.*дисков|минипил|mini circular|compact circular/.test(s))return'мини-дисковая пила';
 if((/дисков/.test(s)&&/пил/.test(s))||/циркуляр/.test(s))return'дисковая пила';
 return E(v);
}
function circularSawSource(v){
 if(v==null)return'';
 const s=String(v).toLowerCase();
 if(/battery|аккумуля|батар|li[- ]?ion/.test(s))return'аккумуляторный';
 if(/mains|corded|electric|сетев|сеть|220|230|электр/.test(s))return'сетевой';
 return E(v);
}
function circularSawMotor(v){
 if(v==null)return'';
 const s=String(v).toLowerCase();
 if(/brushless|бесщет|бесщёточ/.test(s))return'бесщеточный';
 if(/brushed|щеточ|щёточ|коллектор/.test(s))return'щеточный';
 return E(v);
}
function circularSawBladeClass(v){
 const n=N(v);if(n==null)return'';
 if(n>=75&&n<=95)return'85/90';
 if(n>=100&&n<=125)return'115';
 if(n>=126&&n<=150)return'140';
 if(n>=151&&n<=172)return'160/165';
 if(n>=173&&n<=195)return'185/190';
 if(n>=196&&n<=220)return'200/210';
 if(n>=221&&n<=245)return'235';
 return String(n);
}
function circularSawArborClass(v){
 const n=N(v);if(n==null)return'';
 const z=[10,12.7,15.875,16,20,22.23,25.4,30,32];
 let best=z[0];for(const x of z)if(Math.abs(n-x)<Math.abs(n-best))best=x;
 return Math.abs(n-best)<=.6?String(best):String(Number(n.toFixed(2)));
}
function circularSawVoltage(v){
 const n=N(v);if(n==null)return'нет данных';
 if(n>=9&&n<=13)return'10,8/12 В';
 if(n>=16&&n<=22)return'18/20 В';
 if(n>=23&&n<=28)return'24 В';
 if(n>=34&&n<=42)return'36/40 В';
 if(n>=46&&n<=52)return'48 В';
 if(n>=54&&n<=62)return'60 В';
 if(n>=72&&n<=84)return'80 В';
 return E(v)+' В';
}
function circularSawValue(k,v){
 if(v==null)return'нет данных';
 if(k==='device_type')return circularSawDevice(v);
 if(k==='power_source')return circularSawSource(v);
 if(k==='input_power_w')return E(v)+' Вт';
 if(k==='cut_speed_adjustment')return Boolean(v)?'есть':'нет';
 if(k==='max_rpm')return E(v)+' об/мин';
 if(k==='cut_depth_90_mm'||k==='cut_depth_45_mm'||k==='blade_diameter_mm'||k==='arbor_diameter_mm')return E(v)+' мм';
 if(k==='tilt_angle_deg')return E(v)+'°';
 if(k==='motor_type')return circularSawMotor(v);
 if(k==='battery_type')return sprayerBattery(v);
 if(k==='battery_voltage_v')return circularSawVoltage(v);
 if(k==='battery_capacity_ah')return E(v)+' А·ч';
 return E(v);
}
function circularSawResult(k,a,b){
 if(a==null||b==null)return'недостаточно данных';
 if(k==='device_type')return circularSawDevice(a)===circularSawDevice(b)?'один тип':'другой тип пилы — не аналог';
 if(k==='power_source')return circularSawSource(a)===circularSawSource(b)?'совпадает':'разный тип питания — не аналог';
 if(k==='blade_diameter_mm'){
  const aa=circularSawBladeClass(a),bb=circularSawBladeClass(b);
  if(aa!==bb)return'другой класс диска — не аналог';
  const av=N(a),bv=N(b),d=Math.abs(av-bv)/Math.max(av,bv,1);
  return d<=.03?'совпадает · класс '+aa+' мм':'соседний размер · один класс '+aa+' мм';
 }
 if(k==='arbor_diameter_mm')return circularSawArborClass(a)===circularSawArborClass(b)?'строго совпадает':'другая посадка — не аналог';
 if(k==='battery_voltage_v')return circularSawVoltage(a)===circularSawVoltage(b)?'один класс · '+circularSawVoltage(a):'разный класс АКБ — не аналог';
 if(k==='cut_speed_adjustment'){
  if(Boolean(a)===Boolean(b))return'совпадает';
  return Boolean(a)?'есть у нас — преимущество':'есть у конкурента';
 }
 if(k==='motor_type'){
  const aa=circularSawMotor(a),bb=circularSawMotor(b);
  if(aa===bb)return'совпадает';
  if(aa==='бесщеточный'&&bb==='щеточный')return'наш бесщеточный — преимущество';
  if(aa==='щеточный'&&bb==='бесщеточный')return'у конкурента бесщеточный';
  return'тип двигателя отличается';
 }
 if(k==='input_power_w'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv);
  if(d<=150)return'полное совпадение · допуск ±150 Вт';
  return av>bv?'наша мощность выше на '+Math.round(d)+' Вт':'мощность конкурента выше на '+Math.round(d)+' Вт';
 }
 if(['max_rpm','cut_depth_90_mm','cut_depth_45_mm'].includes(k)){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1e-9);
  if(d<=.10)return'полное совпадение';
  if(k==='max_rpm')return d<=.20?'близкое совпадение':'обороты отличаются';
  if(d<=.20)return av>bv?'наш показатель выше':'показатель конкурента выше';
  return av>bv?'наш показатель заметно выше':'показатель конкурента заметно выше';
 }
 if(k==='tilt_angle_deg'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv);
  if(d<=5)return'сопоставимо · разница до 5°';
  return av>bv?'у нас больший угол наклона':'у конкурента больший угол наклона';
 }
 if(k==='battery_capacity_ah'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1e-9);
  if(d<=.15)return'полное совпадение';
  return av>bv?'у нас больше емкость АКБ':'у конкурента больше емкость АКБ';
 }
 if(k==='battery_type')return sprayerBattery(a)===sprayerBattery(b)?'совпадает':'тип аккумулятора отличается';
 const na=String(a).trim().toLowerCase(),nb=String(b).trim().toLowerCase();
 return na===nb||na.includes(nb)||nb.includes(na)?'совпадает':'отличается';
}
function impactWrenchDevice(v){
 if(v==null)return'';
 const s=String(v).toLowerCase();
 if(/гайковерт|гайковёрт|impact wrench/.test(s))return'гайковерт';
 if(/винтоверт|винтовёрт|impact driver/.test(s))return'винтоверт';
 if(/шуруповерт|шуруповёрт/.test(s))return'шуруповерт';
 if(/дрель/.test(s))return'дрель';
 return E(v);
}
function impactWrenchKind(v){
 if(v==null)return'';
 const s=String(v).toLowerCase();
 if(/non_impact|безудар|без удара/.test(s))return'безударный';
 if(/impact|ударн/.test(s))return'ударный';
 return E(v);
}
function impactWrenchSource(v){
 if(v==null)return'';
 const s=String(v).toLowerCase();
 if(/pneumatic|пневм|compressed air|воздуш/.test(s))return'пневматический';
 if(/battery|аккумуля|батар|li[- ]?ion/.test(s))return'аккумуляторный';
 if(/mains|electric|сетев|сеть|220|230|corded/.test(s))return'сетевой';
 return E(v);
}
function impactWrenchMotor(v){
 if(v==null)return'';
 const s=String(v).toLowerCase();
 if(/brushless|бесщет|бесщёточ/.test(s))return'бесщеточный';
 if(/brushed|щеточ|щёточ|коллектор/.test(s))return'щеточный';
 return E(v);
}
function impactWrenchChuck(v){
 if(v==null)return'';
 const s=String(v).toLowerCase();
 if(/square|квадрат|четырехгран|четырёхгран/.test(s))return'квадрат';
 if(/hex|шестигран/.test(s))return'шестигранник';
 return E(v);
}
function impactWrenchDrive(v){
 const n=N(v);if(n==null)return'нет данных';
 const z=[[.25,'1/4"'],[.375,'3/8"'],[.5,'1/2"'],[.75,'3/4"'],[1,'1"']];
 for(const [x,t] of z)if(Math.abs(n-x)<=.025)return t;
 return E(v)+'"';
}
function impactWrenchVoltage(v){
 const n=N(v);if(n==null)return'нет данных';
 if(n>=9&&n<=13)return'10,8/12 В';
 if(n>=16&&n<=22)return'18/20 В';
 if(n>=23&&n<=28)return'24 В';
 if(n>=34&&n<=42)return'36/40 В';
 if(n>=46&&n<=52)return'48 В';
 if(n>=54&&n<=62)return'60 В';
 if(n>=72&&n<=84)return'80 В';
 return E(v)+' В';
}
function impactWrenchModes(v){
 if(v==null)return'нет данных';
 const s=String(v),m=s.match(/count:(\d+)/);
 if(m)return m[1]+' режима';
 return E(s.replace(/\+/g,', '));
}
function impactWrenchValue(k,v){
 if(v==null)return'нет данных';
 if(k==='device_type')return impactWrenchDevice(v);
 if(k==='wrench_type')return impactWrenchKind(v);
 if(k==='power_source')return impactWrenchSource(v);
 if(k==='motor_type')return impactWrenchMotor(v);
 if(k==='input_power_w')return E(v)+' Вт';
 if(k==='reverse_present'||k==='rotation_adjustment')return Boolean(v)?'есть':'нет';
 if(k==='operating_modes')return impactWrenchModes(v);
 if(k==='chuck_type')return impactWrenchChuck(v);
 if(k==='drive_size_in')return impactWrenchDrive(v);
 if(k==='max_rpm')return E(v)+' об/мин';
 if(k==='max_torque_nm')return E(v)+' Н·м';
 if(k==='battery_type')return sprayerBattery(v);
 if(k==='battery_voltage_v')return impactWrenchVoltage(v);
 if(k==='battery_capacity_ah')return E(v)+' А·ч';
 if(k==='charging_time_min')return E(v)+' мин';
 return E(v);
}
function impactWrenchResult(k,a,b){
 if(a==null||b==null)return'недостаточно данных';
 if(k==='device_type')return impactWrenchDevice(a)===impactWrenchDevice(b)?'один тип':'другой инструмент — не аналог';
 if(k==='wrench_type')return impactWrenchKind(a)===impactWrenchKind(b)?'совпадает':'ударный/безударный — не аналог';
 if(k==='power_source')return impactWrenchSource(a)===impactWrenchSource(b)?'совпадает':'разный тип питания — не аналог';
 if(k==='motor_type'){
  const aa=impactWrenchMotor(a),bb=impactWrenchMotor(b);
  if(aa===bb)return'совпадает';
  if(aa==='бесщеточный'&&bb==='щеточный')return'наш бесщеточный — преимущество';
  if(aa==='щеточный'&&bb==='бесщеточный')return'у конкурента бесщеточный';
  return'тип двигателя отличается';
 }
 if(k==='chuck_type')return impactWrenchChuck(a)===impactWrenchChuck(b)?'совпадает':'тип патрона отличается — не прямой аналог';
 if(k==='drive_size_in')return impactWrenchDrive(a)===impactWrenchDrive(b)?'строго совпадает':'другая посадка — не аналог';
 if(k==='battery_voltage_v')return impactWrenchVoltage(a)===impactWrenchVoltage(b)?'один класс · '+impactWrenchVoltage(a):'разный класс АКБ — не аналог';
 if(k==='reverse_present'||k==='rotation_adjustment'){
  if(Boolean(a)===Boolean(b))return'совпадает';
  return Boolean(a)?'есть у нас — преимущество':'есть у конкурента';
 }
 if(k==='operating_modes'){
  const ca=(String(a).match(/count:(\d+)/)||[])[1],cb=(String(b).match(/count:(\d+)/)||[])[1];
  if(ca&&cb&&ca!==cb)return Number(ca)>Number(cb)?'у нас больше режимов':'у конкурента больше режимов';
  return String(a)===String(b)?'совпадает':'режимы отличаются';
 }
 if(['input_power_w','max_rpm','max_torque_nm'].includes(k)){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1e-9);
  if(d<=.10)return'полное совпадение';
  if(k==='max_torque_nm')return av>bv?'наш крутящий момент выше':'крутящий момент конкурента выше';
  if(d<=.20)return'близкое совпадение';
  if(d<=.30)return'частичное совпадение';
  return'существенное отличие';
 }
 if(k==='battery_capacity_ah'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1e-9);
  if(d<=.15)return'полное совпадение';
  return av>bv?'у нас больше емкость АКБ':'у конкурента больше емкость АКБ';
 }
 if(k==='charging_time_min'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1e-9);
  if(d<=.15)return'сопоставимо';
  return av<bv?'наш заряжается быстрее':'конкурент заряжается быстрее';
 }
 if(k==='battery_type')return sprayerBattery(a)===sprayerBattery(b)?'совпадает':'тип аккумулятора отличается';
 const na=String(a).trim().toLowerCase(),nb=String(b).trim().toLowerCase();
 return na===nb||na.includes(nb)||nb.includes(na)?'совпадает':'отличается';
}
function sprayerDevice(v){
 if(v==null)return'';
 const s=String(v).toLowerCase();
 return /опрыскив|sprayer/.test(s)?'опрыскиватель':E(v);
}
function sprayerSource(v){
 if(v==null)return'';
 const s=String(v).toLowerCase();
 if(s==='battery'||/аккумуля|батар|battery|li[- ]?ion/.test(s))return'аккумуляторный';
 if(s==='fuel'||/бензин|топлив|двс|petrol|gasoline/.test(s))return'бензиновый';
 if(s==='mains'||/сетев|сеть|220|230/.test(s))return'сетевой';
 if(s==='manual'||/ручн|механическ|помпов|рычаж/.test(s))return'ручной';
 return E(v);
}
function sprayerCarry(v){
 if(v==null)return'';
 const s=String(v).toLowerCase();
 if(/backpack|ранцев|рюкзач|на спин/.test(s))return'ранцевый';
 if(/shoulder|плеч/.test(s))return'плечевой';
 if(/wheeled|колес|тележ/.test(s))return'колёсный';
 if(/handheld|ручн|переносн|в руке/.test(s))return'ручной';
 return E(v);
}
function sprayerEngine(v){
 if(v==null)return'';
 const s=String(v).toLowerCase();
 if(/2stroke|двухтакт|2\s*[- ]?такт|two\s*stroke/.test(s))return'2-тактный';
 if(/4stroke|четырехтакт|4\s*[- ]?такт|four\s*stroke/.test(s))return'4-тактный';
 return E(v);
}
function sprayerBattery(v){
 if(v==null)return'';
 const s=String(v).toLowerCase();
 if(/lifepo4|li[ -]?fe[ -]?po4|литий.*железо/.test(s))return'LiFePO4';
 if(/li[ -]?ion|литий.*ион/.test(s))return'Li-Ion';
 if(/li[ -]?pol|lipo|литий.*полимер/.test(s))return'Li-Pol';
 if(/sla|свинцово.*кислот/.test(s))return'SLA';
 if(/gel|гелев/.test(s))return'GEL';
 if(/ni[ -]?mh|никель.*металл/.test(s))return'Ni-MH';
 if(/ni[ -]?cd|никель.*кадм/.test(s))return'Ni-Cd';
 return E(v);
}
function sprayerVoltage(v){
 const n=N(v);if(n==null)return'нет данных';
 if(n>=3&&n<=4.5)return'3,7 В';
 if(n>=10&&n<16)return'12 В';
 if(n>=16&&n<=22)return'18/20 В';
 if(n>=23&&n<=28)return'24 В';
 if(n>=34&&n<=42)return'36/40 В';
 if(n>=46&&n<=52)return'48 В';
 if(n>=54&&n<=62)return'60 В';
 if(n>=72&&n<=84)return'80 В';
 return E(v)+' В';
}
function sprayerApplication(v){
 if(v==null)return'';
 const s=String(v).toLowerCase(),z=[];
 if(/garden|сад|огород|растен|дерев|кустар/.test(s))z.push('сад/огород');
 if(/agriculture|сельск|агро|поле|ферм/.test(s))z.push('сельское хозяйство');
 if(/disinfection|дезинф|санитар|обработк.*помещ/.test(s))z.push('дезинфекция');
 if(/fertilizer|удобрен|подкорм/.test(s))z.push('удобрения');
 if(/plant_protection|вредител|инсекти|гербиц|пестиц/.test(s))z.push('защита растений');
 return z.length?[...new Set(z)].join(' + '):E(v);
}
function sprayerValue(k,v){
 if(v==null)return'нет данных';
 if(k==='device_type')return sprayerDevice(v);
 if(k==='application_area')return sprayerApplication(v);
 if(k==='carry_type')return sprayerCarry(v);
 if(k==='voltage_v')return sprayerVoltage(v);
 if(k==='flow_rate_lmin')return E(v)+' л/мин';
 if(k==='power_source')return sprayerSource(v);
 if(k==='battery_type')return sprayerBattery(v);
 if(k==='battery_capacity_ah')return E(v)+' А·ч';
 if(k==='tank_capacity_l')return E(v)+' л';
 if(k==='fuel_engine_type')return sprayerEngine(v);
 if(k==='fuel_power_w'){
  const n=N(v);return n==null?E(v):(n>=1000?(n/1000).toFixed(2).replace('.',',')+' кВт':n+' Вт');
 }
 if(k==='engine_cc')return E(v)+' см³';
 if(k==='fuel_tank_l')return E(v)+' л';
 if(k==='spray_radius_m')return E(v)+' м';
 return E(v);
}
function sprayerResult(k,a,b){
 if(a==null||b==null)return'недостаточно данных';
 if(k==='device_type')return sprayerDevice(a)===sprayerDevice(b)?'один тип':'разный тип — не аналог';
 if(k==='power_source')return sprayerSource(a)===sprayerSource(b)?'совпадает':'разный тип питания — не аналог';
 if(k==='carry_type')return sprayerCarry(a)===sprayerCarry(b)?'совпадает':'вид переноски отличается — не прямой аналог';
 if(k==='voltage_v')return sprayerVoltage(a)===sprayerVoltage(b)?'один класс · '+sprayerVoltage(a):'разный класс АКБ — не аналог';
 if(k==='fuel_engine_type')return sprayerEngine(a)===sprayerEngine(b)?'совпадает':'2Т/4Т отличаются — не прямой аналог';
 if(k==='battery_type')return sprayerBattery(a)===sprayerBattery(b)?'совпадает':'тип аккумулятора отличается';
 if(k==='application_area')return sprayerApplication(a)===sprayerApplication(b)?'совпадает':'область применения отличается';
 if(['flow_rate_lmin','battery_capacity_ah','tank_capacity_l','fuel_tank_l','spray_radius_m'].includes(k)){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1e-9);
  if(d<=.15)return'полное совпадение';
  if(d<=.30)return'близкое совпадение';
  if(d<=.45)return'частичное совпадение';
  return'существенное отличие';
 }
 if(['fuel_power_w','engine_cc'].includes(k)){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1e-9);
  if(d<=.10)return'полное совпадение';
  if(d<=.20)return'близкое совпадение';
  if(d<=.30)return'частичное совпадение';
  return'существенное отличие';
 }
 const na=String(a).trim().toLowerCase(),nb=String(b).trim().toLowerCase();
 return na===nb||na.includes(nb)||nb.includes(na)?'совпадает':'отличается';
}
function batteryPrunerDevice(v){
 if(v==null)return'';
 const s=String(v).toLowerCase();
 if(/секатор/.test(s))return'секатор';
 if(/сучкорез/.test(s))return'сучкорез';
 if(/ножниц/.test(s))return'садовые ножницы';
 return s.trim();
}
function batteryPrunerTool(v){
 return batteryPrunerDevice(v);
}
function batteryPrunerSource(v){
 if(v==null)return'';
 const s=String(v).toLowerCase();
 if(s==='battery'||/аккумуля|батар|battery|li[- ]?ion/.test(s))return'аккумуляторный';
 if(/сетев|сеть|220|230|electric|электр/.test(s))return'сетевой';
 if(/ручн|механическ|manual/.test(s))return'ручной';
 return s.trim();
}
function batteryPrunerBattery(v){
 if(v==null)return'';
 const s=String(v).toLowerCase();
 if(/lifepo4|li[ -]?fe[ -]?po4|литий.*железо/.test(s))return'LiFePO4';
 if(/li[ -]?ion|литий.*ион/.test(s))return'Li-Ion';
 if(/ni[ -]?mh|никель.*металл/.test(s))return'Ni-MH';
 if(/ni[ -]?cd|никель.*кадм/.test(s))return'Ni-Cd';
 return E(v);
}
function batteryPrunerKnife(v){
 if(v==null)return'';
 const s=String(v).toLowerCase();
 if(/обводн|bypass/.test(s))return'обводной';
 if(/наковальн|anvil/.test(s))return'с наковальней';
 if(/двойн|двухлезв|double/.test(s))return'двойной';
 if(/подвиж/.test(s))return'подвижный';
 if(/неподвиж/.test(s))return'неподвижный';
 return E(v);
}
function batteryPrunerBlade(v){
 if(v==null)return'';
 const s=String(v).toLowerCase();
 if(/обводн|bypass/.test(s))return'обводное';
 if(/наковальн|anvil/.test(s))return'с наковальней';
 if(/двусторон|двухсторон|double edge/.test(s))return'двустороннее';
 if(/односторон|single edge/.test(s))return'одностороннее';
 if(/изогнут|curved/.test(s))return'изогнутое';
 if(/прям|straight/.test(s))return'прямое';
 return E(v);
}
function batteryPrunerVoltage(v){
 const n=N(v);if(n==null)return'нет данных';
 if(n>=10&&n<16)return'12 В';
 if(n>=16&&n<=22)return'18/20 В';
 if(n>=23&&n<=28)return'24 В';
 if(n>=34&&n<=42)return'36/40 В';
 if(n>=46&&n<=52)return'48 В';
 if(n>=54&&n<=62)return'60 В';
 if(n>=72&&n<=84)return'80 В';
 return E(v)+' В';
}
function batteryPrunerValue(k,v){
 if(v==null)return'нет данных';
 if(k==='device_type')return E(batteryPrunerDevice(v)||v);
 if(k==='tool_type')return E(batteryPrunerTool(v)||v);
 if(k==='power_source')return E(batteryPrunerSource(v)||v);
 if(k==='voltage_v')return batteryPrunerVoltage(v);
 if(k==='battery_type')return batteryPrunerBattery(v);
 if(k==='battery_capacity_ah')return E(v)+' А·ч';
 if(k==='knife_type')return batteryPrunerKnife(v);
 if(k==='blade_type')return batteryPrunerBlade(v);
 if(k==='max_cut_diameter_mm')return E(v)+' мм';
 return E(v);
}
function batteryPrunerResult(k,a,b){
 if(a==null||b==null)return'недостаточно данных';
 if(k==='device_type')return batteryPrunerDevice(a)===batteryPrunerDevice(b)?'один тип':'разный тип — не аналог';
 if(k==='tool_type')return batteryPrunerTool(a)===batteryPrunerTool(b)?'совпадает':'разный инструмент — не аналог';
 if(k==='power_source')return batteryPrunerSource(a)===batteryPrunerSource(b)?'аккумуляторный класс':'разный тип питания — не аналог';
 if(k==='voltage_v')return batteryPrunerVoltage(a)===batteryPrunerVoltage(b)?'один класс · '+batteryPrunerVoltage(a):'разный класс АКБ — не аналог';
 if(k==='battery_type')return batteryPrunerBattery(a)===batteryPrunerBattery(b)?'совпадает':'тип аккумулятора отличается';
 if(k==='battery_capacity_ah'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1);
  if(d<=.15)return'полное совпадение';
  if(d<=.25)return'близкое совпадение';
  if(d<=.40)return'частичное совпадение';
  return'существенное отличие';
 }
 if(k==='max_cut_diameter_mm'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1);
  if(d<=.10)return'полное совпадение';
  if(d<=.20)return'близкое совпадение';
  if(d<=.30)return'частичное совпадение';
  return'существенное отличие';
 }
 if(k==='knife_type')return batteryPrunerKnife(a)===batteryPrunerKnife(b)?'совпадает':'тип ножа отличается — не прямое совпадение';
 if(k==='blade_type')return batteryPrunerBlade(a)===batteryPrunerBlade(b)?'совпадает':'тип лезвия отличается — не прямое совпадение';
 const na=String(a).trim().toLowerCase(),nb=String(b).trim().toLowerCase();
 return na===nb||na.includes(nb)||nb.includes(na)?'совпадает':'отличается';
}
function gardenShredderFamily(v){
 if(v==null)return '';
 const s=String(v).toLowerCase();
 if((/измельч/.test(s)&&(/сад|вет/.test(s)))||/шредер/.test(s))return'garden_shredder';
 return s.trim();
}
function gardenShredderEngine(v){
 if(v==null)return '';
 const s=String(v).toLowerCase();
 if(/аккумуля|батар|battery|li[- ]?ion/.test(s))return'аккумуляторный';
 if(/бензин|двс|топлив/.test(s))return'бензиновый';
 if(/электр|сетев|сеть|220|230|380|400/.test(s))return'сетевой электрический';
 return s.trim();
}
function gardenShredderCutting(v){
 if(v==null)return '';
 const s=String(v).toLowerCase();
 if(/турбин/.test(s))return'турбинный';
 if(/фрез/.test(s))return'фрезерный';
 if(/валков|валец|ролик/.test(s))return'валковый';
 if(/нож/.test(s))return'ножевой';
 if(/диск/.test(s))return'дисковый';
 return s.trim();
}
function gardenShredderMaterials(v){
 if(v==null)return[];
 const s=String(v).toLowerCase(),z=[];
 if(/branches|ветк|ветв|суч|древес/.test(s))z.push('ветки');
 if(/leaves|лист|листв/.test(s))z.push('листья');
 if(/grass|трав/.test(s))z.push('трава');
 if(/soft_waste|мягк|зел[её]н|растительн/.test(s))z.push('мягкие растительные отходы');
 if(/garden_waste|садов.*отход|органич|компост/.test(s))z.push('садовые отходы');
 return [...new Set(z)];
}
function gardenShredderVoltage(v){
 const n=N(v);if(n==null)return'нет данных';
 if(n>=200&&n<=250)return'220/230 В';
 if(n>=360&&n<=420)return'380/400 В';
 if(n>=16&&n<=22)return'18/20 В';
 if(n>=34&&n<=42)return'36/40 В';
 if(n>=46&&n<=52)return'48 В';
 if(n>=54&&n<=62)return'60 В';
 if(n>=72&&n<=84)return'80 В';
 return E(v)+' В';
}
function gardenShredderValue(k,v){
 if(v==null)return'нет данных';
 if(k==='device_type')return'garden_shredder'===gardenShredderFamily(v)?'садовый измельчитель':E(v);
 if(k==='engine_type')return E(gardenShredderEngine(v)||v);
 if(k==='processed_material'){
  const z=gardenShredderMaterials(v);return z.length?z.join(' + '):E(v);
 }
 if(k==='cutting_mechanism')return E(gardenShredderCutting(v)||v);
 if(k==='collector_present')return Boolean(v)?'есть':'нет';
 if(k==='input_power_w')return E(v)+' Вт';
 if(k==='voltage_v')return gardenShredderVoltage(v);
 if(k==='noise_db')return E(v)+' дБ';
 if(k==='cutting_speed_rpm')return E(v)+' об/мин';
 if(k==='max_branch_diameter_mm')return E(v)+' мм';
 if(k==='collector_capacity_l')return E(v)+' л';
 if(k==='feed_openings_count')return E(v)+' шт.';
 return E(v);
}
function gardenShredderResult(k,a,b){
 if(a==null||b==null)return'недостаточно данных';
 if(k==='device_type')return gardenShredderFamily(a)===gardenShredderFamily(b)?'один класс':'разный тип — не аналог';
 if(k==='engine_type')return gardenShredderEngine(a)===gardenShredderEngine(b)?'совпадает':'разный тип двигателя/питания — не аналог';
 if(k==='voltage_v')return gardenShredderVoltage(a)===gardenShredderVoltage(b)?'один класс · '+gardenShredderVoltage(a):'разный класс питания — не аналог';
 if(k==='cutting_mechanism')return gardenShredderCutting(a)===gardenShredderCutting(b)?'совпадает':'режущий механизм отличается — не прямой аналог';
 if(k==='processed_material'){
  const aa=new Set(gardenShredderMaterials(a)),bb=new Set(gardenShredderMaterials(b));
  if(!aa.size||!bb.size)return'недостаточно данных';
  const same=aa.size===bb.size&&[...aa].every(x=>bb.has(x));
  if(same)return'совпадает';
  const ourMore=[...aa].every(x=>bb.has(x))&&bb.size>aa.size;
  const compMore=[...bb].every(x=>aa.has(x))&&aa.size>bb.size;
  if(compMore)return'наш перерабатывает больше типов';
  if(ourMore)return'конкурент перерабатывает больше типов';
  return'набор материалов отличается';
 }
 if(k==='noise_db'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv);
  if(d<=3)return'сопоставимо · разница '+d.toFixed(1).replace('.',',')+' дБ';
  if(d<=6)return'близко · разница '+d.toFixed(1).replace('.',',')+' дБ';
  if(d<=10)return'частичное совпадение · разница '+d.toFixed(1).replace('.',',')+' дБ';
  return'существенное отличие';
 }
 if(['input_power_w','cutting_speed_rpm','max_branch_diameter_mm','collector_capacity_l'].includes(k)){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1);
  const t=k==='collector_capacity_l'?[.15,.30,.45]:[.10,.20,.30];
  if(d<=t[0])return'полное совпадение';
  if(d<=t[1])return'близкое совпадение';
  if(d<=t[2])return'частичное совпадение';
  return'существенное отличие';
 }
 if(k==='feed_openings_count'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  return Math.round(av)===Math.round(bv)?'совпадает':'количество отверстий отличается';
 }
 if(k==='collector_present')return Boolean(a)===Boolean(b)?'совпадает':(Boolean(a)?'у нас есть, у конкурента нет':'у конкурента есть, у нас нет');
 const na=String(a).trim().toLowerCase(),nb=String(b).trim().toLowerCase();
 return na===nb||na.includes(nb)||nb.includes(na)?'совпадает':'отличается';
}
function earthAugerFamily(v){
 if(v==null)return '';
 const s=String(v).toLowerCase();
 if(/мотобур|бензобур|землебур|earth auger|auger/.test(s))return'earth_auger';
 return s.trim();
}
function earthAugerEngine(v){
 if(v==null)return '';
 const s=String(v).toLowerCase();
 if(/двухтакт|2\s*[- ]?такт|two\s*stroke/.test(s))return'2-тактный';
 if(/четырехтакт|4\s*[- ]?такт|four\s*stroke/.test(s))return'4-тактный';
 return s.trim();
}
function earthAugerValue(k,v){
 if(v==null)return'нет данных';
 if(k==='fuel_power_w'){
  const n=N(v);return n==null?E(v):(n>=1000?(n/1000).toFixed(2).replace('.',',')+' кВт':n+' Вт');
 }
 if(k==='fuel_tank_l')return E(v)+' л';
 if(k==='rpm')return E(v)+' об/мин';
 if(k==='engine_cc')return E(v)+' см³';
 if(k==='max_auger_diameter_mm'||k==='shaft_diameter_mm')return E(v)+' мм';
 if(k==='engine_type')return E(earthAugerEngine(v)||v);
 return E(v);
}
function earthAugerResult(k,a,b){
 if(a==null||b==null)return'недостаточно данных';
 if(k==='device_type')return earthAugerFamily(a)===earthAugerFamily(b)?'один класс':'разный тип — не аналог';
 if(k==='engine_type')return earthAugerEngine(a)===earthAugerEngine(b)?'совпадает':'разный тип двигателя — не аналог';
 if(k==='shaft_diameter_mm'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  return Math.abs(av-bv)<=0.15?'совпадает':'разная посадка — не аналог';
 }
 if(['fuel_power_w','fuel_tank_l','rpm','engine_cc','max_auger_diameter_mm'].includes(k)){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'недостаточно данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1);
  const t=k==='engine_cc'?[.05,.10,.20]:[.10,.20,.30];
  if(d<=t[0])return'полное совпадение';
  if(d<=t[1])return'близкое совпадение';
  if(d<=t[2])return'частичное совпадение';
  return'существенное отличие';
 }
 const na=String(a).trim().toLowerCase(),nb=String(b).trim().toLowerCase();
 return na===nb?'совпадает':'отличается';
}
function leafBlowerSource(v){
 if(v==null)return 'нет данных';
 const s=String(v).toLowerCase();
 if(s==='battery'||/аккумуля|батар|battery|li-ion|li ion/.test(s))return 'аккумуляторная';
 if(s==='electric'||/электр|сеть|сетев|220|230|розет/.test(s))return 'сетевая электрическая';
 if(s==='fuel'||/бензин|топлив|двс/.test(s))return 'бензиновая';
 return E(v);
}
function leafBlowerValue(k,v){
 if(v==null)return 'нет данных';
 if(k==='power_source')return leafBlowerSource(v);
 if(k==='air_speed_ms')return E(v)+' м/с';
 if(k==='airflow_m3h')return E(v)+' м³/ч';
 if(k==='battery_capacity_ah')return E(v)+' А·ч';
 if(k==='battery_voltage_v')return E(v)+' В';
 if(k==='rpm')return E(v)+' об/мин';
 if(k==='noise_db')return E(v)+' дБ';
 if(k==='motor_power_w'||k==='fuel_power_w')return E(v)+' Вт';
 if(k==='engine_cc')return E(v)+' см³';
 if(k==='fuel_tank_l')return E(v)+' л';
 if(k==='functions'){
  const s=String(v).toLowerCase(),z=[];
  if(/blow|обдув|выдув|воздуходув/.test(s))z.push('обдув');
  if(/vacuum|всасыв|пылесос/.test(s))z.push('всасывание');
  if(/shred|измельч|мульч/.test(s))z.push('измельчение');
  return z.length?z.join(' + '):E(v);
 }
 return E(v);
}
function leafBlowerResult(k,a,b){
 if(a==null||b==null)return 'нет данных';
 if(k==='power_source')return leafBlowerSource(a)===leafBlowerSource(b)?'один класс':'разный тип питания — не аналог';
 if(k==='construction'){
  const fam=x=>{
   const s=String(x).toLowerCase();
   if(/ранцев|рюкзач/.test(s))return'backpack';
   if(/ручн|переносн/.test(s))return'handheld';
   if(/колес/.test(s))return'wheeled';
   return s;
  };
  return fam(a)===fam(b)?'совпадает':'разная конструкция — максимум близкий аналог';
 }
 if(k==='battery_voltage_v'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'нет данных';
  const cls=x=>x>=16&&x<=22?'18/20 В':(x>=34&&x<=42?'36/40 В':(x>=46&&x<=52?'48 В':(x>=54&&x<=62?'60 В':(x>=72&&x<=84?'80 В':String(x)+' В'))));
  return cls(av)===cls(bv)?'один класс · '+cls(av):'разный класс АКБ';
 }
 if(k==='noise_db'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'нет данных';
  const d=Math.abs(av-bv);
  if(d<=3)return'полное совпадение · разница '+d.toFixed(1).replace('.',',')+' дБ';
  if(d<=6)return'близкое совпадение · разница '+d.toFixed(1).replace('.',',')+' дБ';
  if(d<=10)return'частичное совпадение · разница '+d.toFixed(1).replace('.',',')+' дБ';
  return'существенное отличие';
 }
 if(['air_speed_ms','airflow_m3h','rpm','battery_capacity_ah','fuel_tank_l','motor_power_w','fuel_power_w','engine_cc'].includes(k)){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'нет данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1);
  const t=(k==='motor_power_w'||k==='fuel_power_w'||k==='engine_cc')?[.05,.10,.20]:[.10,.20,.30];
  if(d<=t[0])return'полное совпадение';
  if(d<=t[1])return'близкое совпадение';
  if(d<=t[2])return'частичное совпадение';
  return'существенное отличие';
 }
 if(k==='functions'){
  const tok=x=>{
   const s=String(x).toLowerCase(),z=[];
   if(/blow|обдув|выдув|воздуходув/.test(s))z.push('blow');
   if(/vacuum|всасыв|пылесос/.test(s))z.push('vacuum');
   if(/shred|измельч|мульч/.test(s))z.push('shred');
   return z.sort().join('+');
  };
  return tok(a)===tok(b)?'совпадает':'набор функций отличается';
 }
 const na=String(a).trim().toLowerCase(),nb=String(b).trim().toLowerCase();
 return na===nb||na.includes(nb)||nb.includes(na)?'совпадает':'отличается';
}
function snowBlowerSource(v){
 if(v==null)return 'нет данных';
 const s=String(v).toLowerCase();
 if(s==='battery'||/аккумуля|батар|battery|li-ion|li ion/.test(s))return 'аккумуляторный';
 if(s==='electric'||/электр|сеть|сетев|220|230|розет/.test(s))return 'сетевой электрический';
 if(s==='fuel'||/бензин|топлив|двс/.test(s))return 'бензиновый';
 return E(v);
}
function snowBlowerStartText(s){
 const v=s?.engine_start_type;
 if(v==null)return 'нет данных';
 const n=String(v).toLowerCase();
 const parts=[];
 if(/manual|руч/.test(n))parts.push('ручной');
 if(/electric/.test(n)||/электр/.test(n))parts.push('электростартер');
 let src=s?.starter_power_source;
 if(src==='mains')src='сеть';
 else if(src==='battery')src='АКБ';
 const vv=N(s?.starter_voltage_v);
 let tail='';
 if(src)tail=' · '+src+(vv!=null?' '+E(vv)+' В':'');
 return (parts.length?parts.join(' + '):E(v))+tail;
}
function snowBlowerStartResult(a,b){
 const av=a?.engine_start_type,bv=b?.engine_start_type;
 if(av==null&&bv==null)return 'нет данных';
 if(av!=null&&bv==null)return 'у конкурента нет данных — не считать одинаковыми';
 if(av==null&&bv!=null)return 'у нас нет данных';
 const as=snowBlowerStartText(a),bs=snowBlowerStartText(b);
 return as===bs?'совпадает':'способ запуска отличается';
}
function snowBlowerValue(k,v){
 if(v==null)return 'нет данных';
 if(k==='power_source')return snowBlowerSource(v);
 if(typeof v==='boolean')return v?'есть':'нет';
 if(k==='battery_capacity_ah')return E(v)+' А·ч';
 if(k==='battery_voltage_v')return E(v)+' В';
 if(k==='clearing_width_cm'||k==='intake_height_cm')return E(v)+' см';
 if(k==='throw_distance_m')return E(v)+' м';
 if(k==='motor_power_w')return E(v)+' Вт';
 if(k==='engine_cc')return E(v)+' см³';
 if(k==='tank_l')return E(v)+' л';
 return E(v);
}
function snowBlowerResult(k,a,b){
 if(a==null||b==null)return 'нет данных';
 if(k==='power_source')return snowBlowerSource(a)===snowBlowerSource(b)?'один класс':'разный источник — не аналог';
 if(k==='device_type'){
  const fam=x=>/насадк/i.test(String(x))?'attachment':(/лопат/i.test(String(x))?'shovel':(/снегоубор/i.test(String(x))?'snow':'other'));
  return fam(a)===fam(b)?'совпадает':'разный тип — не аналог';
 }
 if(k==='snow_blower_type'){
  const tok=x=>{
   const s=String(x).toLowerCase(),z=[];
   if(/несамоход/.test(s))z.push('non_self');else if(/самоход/.test(s))z.push('self');
   if(/одноступ|1\s*ступ/.test(s))z.push('one');
   if(/двухступ|2\s*ступ/.test(s))z.push('two');
   if(/трехступ|3\s*ступ/.test(s))z.push('three');
   return z.sort().join('+');
  };
  const aa=tok(a),bb=tok(b);
  if(aa&&bb&&aa!==bb)return 'критическое отличие — не аналог';
  return String(a).toLowerCase()===String(b).toLowerCase()?'совпадает':'тип отличается';
 }
 if(k==='drive_type'){
  const fam=x=>/гусен/.test(String(x).toLowerCase())?'track':(/колес/.test(String(x).toLowerCase())?'wheel':String(x).toLowerCase());
  return fam(a)===fam(b)?'совпадает':({track:true,wheel:true}[fam(a)]&&{track:true,wheel:true}[fam(b)]?'колёса/гусеницы — не прямой аналог':'отличается');
 }
 if(k==='battery_voltage_v'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return 'нет данных';
  const cls=x=>x>=16&&x<=22?'18/20 В':(x>=34&&x<=42?'36/40 В':(x>=46&&x<=52?'48 В':(x>=54&&x<=62?'60 В':(x>=72&&x<=84?'80 В':String(x)+' В'))));
  return cls(av)===cls(bv)?'один класс · '+cls(av):'разный класс АКБ';
 }
 if(k==='clearing_width_cm'||k==='intake_height_cm'||k==='throw_distance_m'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return 'нет данных';
  const d=Math.abs(av-bv),t=k==='throw_distance_m'?[1,2,4]:[3,5,10],unit=k==='throw_distance_m'?' м':' см';
  if(d<=t[0])return 'полное совпадение · разница '+d.toFixed(1).replace('.',',')+unit;
  if(d<=t[1])return 'близкое совпадение · разница '+d.toFixed(1).replace('.',',')+unit;
  if(d<=t[2])return 'частичное совпадение · разница '+d.toFixed(1).replace('.',',')+unit;
  return 'существенное отличие · разница '+d.toFixed(1).replace('.',',')+unit;
 }
 if(k==='motor_power_w'||k==='engine_cc'||k==='tank_l'||k==='battery_capacity_ah'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return 'нет данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1);
  const t=(k==='tank_l'||k==='battery_capacity_ah')?[.10,.20,.30]:[.05,.10,.20];
  if(d<=t[0])return 'полное совпадение';
  if(d<=t[1])return 'близкое совпадение';
  if(d<=t[2])return 'частичное совпадение';
  return 'существенное отличие';
 }
 if(typeof a==='boolean'||typeof b==='boolean')return Boolean(a)===Boolean(b)?'совпадает':'отличается';
 const na=String(a).trim().toLowerCase(),nb=String(b).trim().toLowerCase();
 return na===nb||na.includes(nb)||nb.includes(na)?'совпадает':'отличается';
}
function chainsawResult(k,a,b){
 if(a==null||b==null)return 'нет данных';
 const av=N(a),bv=N(b);if(av==null||bv==null)return 'нет данных';
 const d=Math.abs(av-bv);
 if(k==='engine_cc'){
  if(d<=3)return 'полное совпадение · разница '+d.toFixed(1).replace('.',',')+' см³';
  if(d<=5)return 'близкое совпадение · разница '+d.toFixed(1).replace('.',',')+' см³';
  if(d<=8)return 'частичное совпадение · разница '+d.toFixed(1).replace('.',',')+' см³';
  return 'существенное отличие · разница '+d.toFixed(1).replace('.',',')+' см³';
 }
 if(k==='power_w'){
  if(d<=200)return 'полное совпадение · разница '+Math.round(d)+' Вт';
  if(d<=350)return 'близкое совпадение · разница '+Math.round(d)+' Вт';
  if(d<=500)return 'частичное совпадение · разница '+Math.round(d)+' Вт';
  return 'существенное отличие · разница '+Math.round(d)+' Вт';
 }
 return '—';
}
function chainsawValue(k,v){
 if(v==null)return 'нет данных';
 if(k==='engine_cc')return E(v)+' см³';
 if(k==='power_w')return E(v)+' Вт';
 return E(v);
}
function electricChainsawSupply(v){
 if(v==null)return 'нет данных';
 const s=String(v).toLowerCase();
 if(s==='battery'||/аккумуля|батар|battery|li-ion|li ion/.test(s))return 'аккумулятор';
 if(s==='mains'||/сеть|сетев|220|230|розет/.test(s))return 'сеть';
 return E(v);
}
function electricChainsawValue(k,v){
 if(v==null)return 'нет данных';
 if(k==='power_supply')return electricChainsawSupply(v);
 if(typeof v==='boolean')return v?'есть':'нет';
 if(k==='bar_length_cm')return E(v)+' см';
 if(k==='power_w')return E(v)+' Вт';
 return E(v);
}
function electricChainsawResult(k,a,b){
 if(a==null||b==null)return 'нет данных';
 if(k==='power_supply'){
  return electricChainsawSupply(a)===electricChainsawSupply(b)?'совпадает':'сеть/аккумулятор — не аналог';
 }
 if(k==='purpose'){
  const fam=x=>{
   const s=String(x).toLowerCase();
   if(/полупроф/.test(s))return'semi_professional';
   if(/проф/.test(s))return'professional';
   if(/бытов/.test(s))return'household';
   return s;
  };
  return fam(a)===fam(b)?'совпадает':'назначение отличается';
 }
 if(k==='device_type'){
  const fam=x=>{
   const s=String(x).toLowerCase();
   if(/сабел/.test(s))return'recip';
   if(/дисков|циркуляр/.test(s))return'circular';
   if(/торцов/.test(s))return'mitre';
   if(/цепн|электропил/.test(s))return'chain';
   return s;
  };
  return fam(a)===fam(b)?'совпадает':'разный тип — не аналог';
 }
 if(k==='bar_length_cm'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'нет данных';
  const d=Math.abs(av-bv);
  if(d<=2)return'полное совпадение · разница '+d.toFixed(1).replace('.',',')+' см';
  if(d<=5)return'близкое совпадение · разница '+d.toFixed(1).replace('.',',')+' см';
  if(d<=10)return'частичное совпадение · разница '+d.toFixed(1).replace('.',',')+' см';
  return'существенное отличие · разница '+d.toFixed(1).replace('.',',')+' см';
 }
 if(k==='power_w'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return'нет данных';
  const d=Math.abs(av-bv)/Math.max(Math.abs(av),Math.abs(bv),1);
  if(d<=.05)return'полное совпадение';
  if(d<=.10)return'близкое совпадение';
  if(d<=.20)return'частичное совпадение';
  return'существенное отличие';
 }
 if(typeof a==='boolean'||typeof b==='boolean')return Boolean(a)===Boolean(b)?'совпадает':'отличается';
 const na=String(a).trim().toLowerCase(),nb=String(b).trim().toLowerCase();
 return na===nb||na.includes(nb)||nb.includes(na)?'совпадает':'отличается';
}
function infraredEnergy(v){
 if(v==null)return 'нет данных';
 if(String(v)==='gas')return 'газовый';
 if(String(v)==='electric')return 'электрический';
 return E(v);
}
function infraredValue(k,v){
 if(v==null)return 'нет данных';
 if(k==='energy_type')return infraredEnergy(v);
 if(typeof v==='boolean')return v?'есть':'нет';
 if(k==='power_w')return E(v)+' Вт';
 if(k==='voltage_v')return E(v)+' В';
 return E(v);
}
function infraredResult(k,a,b){
 if(a==null||b==null)return 'нет данных';
 if(k==='energy_type')return String(a)===String(b)?'совпадает':'разный класс — не аналог';
 if(k==='power_w'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return 'нет данных';
  const d=Math.abs(av-bv);
  if(d<=100)return 'полное совпадение · разница '+Math.round(d)+' Вт';
  if(d<=250)return 'близкое совпадение · разница '+Math.round(d)+' Вт';
  if(d<=400)return 'частичное совпадение · разница '+Math.round(d)+' Вт';
  return 'существенное отличие · разница '+Math.round(d)+' Вт';
 }
 if(k==='voltage_v'){
  const av=N(a),bv=N(b);if(av==null||bv==null)return 'нет данных';
  const ca=av>=200&&av<=250?'220/230 В':(av>=360&&av<=420?'380/400 В':String(av));
  const cb=bv>=200&&bv<=250?'220/230 В':(bv>=360&&bv<=420?'380/400 В':String(bv));
  return ca===cb?'один класс питания':'разный класс питания';
 }
 if(k==='installation_type'){
  const na=String(a).toLowerCase(),nb=String(b).toLowerCase();
  const tok=x=>new Set([...(x.includes('настен')?['wall']:[]),...(x.includes('наполь')?['floor']:[]),...(x.includes('потол')?['ceiling']:[]),...(x.includes('универс')?['wall','floor','ceiling']:[])]);
  const aa=tok(na),bb=tok(nb);return [...aa].some(x=>bb.has(x))?'совпадает':'отличается';
 }
 if(k==='thermostat_type'){
  const present=x=>!/нет|отсутств|не предусмотр/i.test(String(x));
  return present(a)===present(b)?'наличие совпадает':'отличается';
 }
 if(typeof a==='boolean'||typeof b==='boolean')return Boolean(a)===Boolean(b)?'совпадает':'отличается';
 const na=String(a).trim().toLowerCase(),nb=String(b).trim().toLowerCase();
 return na===nb||na.includes(nb)||nb.includes(na)?'совпадает':'отличается';
}
function listingKey(scope,sku){return String(scope||'')+'|'+String(sku||'')}
function listingRowsMap(listing){
 const m=new Map();for(const x of (listing?.rows||[]))m.set(listingKey(x.scope_key,x.sku),x);return m;
}
function listingSummaryMap(listing){
 const m=new Map();for(const x of (listing?.summary||[]))m.set(String(x.scope_key||''),x);return m;
}
function listingPos(l){
 if(!l)return 'не найдено';
 if(l.listing_state==='no_card')return 'нет карточки';
 if(l.listing_state==='top120'&&N(l.position)!=null)return '#'+N(l.position);
 return '>120';
}
function listingPastPos(l){
 if(!l||!l.past_date)return null;
 if(l.past_state==='top120'&&N(l.past_position)!=null)return '#'+N(l.past_position);
 if(l.past_state==='outside_top120')return '>120';
 if(l.past_state==='no_card')return 'нет карточки';
 return '—';
}
function listingTrendClass(l){
 if(!l)return '';
 if(l.trend==='up'||l.trend==='new')return 'good';
 if(l.trend==='down'||(l.trend==='outside'&&l.past_state==='top120'))return 'bad';
 if(l.trend==='stable')return 'warn';
 return '';
}
function listingTrendText(l,days){
 if(!l)return 'позиция ещё не загружена';
 if(l.listing_state==='no_card')return 'нет карточки 21vek';
 if(l.trend==='new')return '↑ вошёл в TOP-120';
 if(l.listing_state==='outside_top120'){
  if(l.past_state==='top120')return '↓ вышел из TOP-120';
  return 'вне TOP-120';
 }
 if(l.trend==='no_history')return 'история накапливается';
 const d=N(l.position_delta);
 if(l.trend==='up'&&d!=null)return '↑ +'+d+' за '+days+'д';
 if(l.trend==='down'&&d!=null)return '↓ '+d+' за '+days+'д';
 if(l.trend==='stable')return '→ без изменений за '+days+'д';
 return 'история накапливается';
}
function listingInline(l,days){
 const past=listingPastPos(l);
 return '<span class="tm224-own-pos"><b>Листинг 21vek: '+E(listingPos(l))+'</b></span>'
  +'<span class="'+listingTrendClass(l)+'">'+E(listingTrendText(l,days))+(past?' · было '+E(past):'')+'</span>';
}
function listingHistoryBlock(l){
 if(!l)return '';
 const hist=Array.isArray(l.history)?l.history:[];
 const xs=hist.slice(0,12).map(x=>{
  const p=x.state==='top120'&&N(x.position)!=null?'#'+N(x.position):(x.state==='outside_top120'?'>120':'нет карточки');
  return '<span><b>'+E(String(x.date||'').slice(5))+'</b> '+E(p)+'</span>';
 }).join('');
 return '<div class="tm224-listing-history"><b>История нашего листинга 21vek</b>'
  +(xs?'<div>'+xs+'</div>':'<small>История начнёт накапливаться после ежедневных сборов.</small>')+'</div>';
}
function details(r,l){
 const a=r.our_specs||{},b=r.competitor_specs||{};
 if(r.profile_key==='convector'){
  const keys=[
   ['heater_type','Нагревательный элемент'],
   ['power_w','Мощность обогрева'],
   ['power_adjustment','Регулировка мощности'],
   ['temperature_adjustment','Регулировка температуры'],
   ['thermostat_type','Термостат'],
   ['control_type','Управление'],
   ['display_present','Наличие дисплея']
  ];
  const body=keys.map(([k,n])=>'<tr><td><b>'+E(n)+'</b></td><td>'+convectorValue(k,b[k])+'</td><td>'+convectorValue(k,a[k])+'</td><td>'+E(convectorResult(k,a[k],b[k]))+'</td></tr>').join('');
  const area='<div class="tm224-ref"><b>Справочно — площадь обогрева:</b> конкурент '+(b.area_m2==null?'нет данных':E(b.area_m2)+' м²')+' · наш товар '+(a.area_m2==null?'нет данных':E(a.area_m2)+' м²')+'. <b>В сопоставимости не участвует.</b></div>';
  return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
   +'<div class="tm224-conv-table"><table><thead><tr><th>Характеристика</th><th>Конкурент</th><th>Наш товар</th><th>Результат</th></tr></thead><tbody>'+body+'</tbody></table></div>'+area
   +listingHistoryBlock(l)
   +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
   +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
   +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
 }
 if(r.profile_key==='humidifier'){
  const keys=[
   ['device_type','Тип'],
   ['power_w','Потребляемая мощность'],
   ['power_supply','Питание'],
   ['area_m2','Макс. обслуживаемая площадь'],
   ['tank_l','Емкость резервуара для воды'],
   ['output_mlh','Макс. расход воды'],
   ['technologies','Технологии'],
   ['remote_control','Дистанционное управление'],
   ['control_type','Управление']
  ];
  const body=keys.map(([k,n])=>'<tr><td><b>'+E(n)+'</b></td><td>'+humidifierValue(k,b[k])+'</td><td>'+humidifierValue(k,a[k])+'</td><td>'+E(humidifierResult(k,a[k],b[k]))+'</td></tr>').join('');
  const ref='<div class="tm224-ref"><b>Формула сопоставимости:</b> тип 10% · технологии 20% · макс. расход воды 20% · площадь 15% · резервуар 15% · потребляемая мощность 7% · питание 5% · управление 5% · дистанционное управление 3%. Тип увлажнителя — критический фильтр: ультразвуковой, традиционный и паровой между собой не считаются аналогами. Технологии/функции участвуют с весом 20%. <b>Цена в подборе аналога не участвует.</b></div>';
  return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
   +'<div class="tm224-conv-table"><table><thead><tr><th>Характеристика</th><th>Конкурент</th><th>Наш товар</th><th>Результат</th></tr></thead><tbody>'+body+'</tbody></table></div>'+ref
   +listingHistoryBlock(l)
   +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
   +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
   +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
 }
 if(r.profile_key==='heat_gun'){
  const type=String(a.fuel_type||b.fuel_type||'');
  let keys=[],formula='';
  if(type==='electric'){
   keys=[
    ['fuel_type','Тип'],['power_w','Тепловая мощность'],['airflow_m3h','Производительность'],
    ['voltage_v','Напряжение'],['heater_type','Тип нагревательного элемента'],['control_type','Управление'],
    ['thermostat_type','Термостат'],['overheat_protection','Защита от перегрева'],['power_adjustment','Регулировка мощности'],
    ['temperature_adjustment','Регулировка температуры'],['fan_only_mode','Режим вентиляции']
   ];
   formula='Электрические: тип 10% · мощность 25% · производительность 15% · напряжение 15% · нагревательный элемент 10% · управление 5% · термостат 5% · защита 4% · регулировка мощности 5% · регулировка температуры 3% · вентиляция 3%. 220/230 В и 380/400 В между собой не аналоги.';
  }else if(type==='gas'){
   keys=[
    ['fuel_type','Тип'],['power_w','Тепловая мощность'],['airflow_m3h','Производительность'],
    ['fuel_consumption_kgh','Расход топлива'],['control_type','Управление'],['thermostat_type','Термостат'],
    ['overheat_protection','Защита от перегрева'],['power_adjustment','Регулировка мощности'],
    ['temperature_adjustment','Регулировка температуры'],['fan_only_mode','Режим вентиляции']
   ];
   formula='Газовые: тип 15% · мощность 30% · производительность 20% · расход топлива 10% · управление 5% · термостат 5% · защита 5% · регулировка мощности 5% · регулировка температуры 3% · вентиляция 2%.';
  }else{
   keys=[
    ['fuel_type','Тип'],['power_w','Тепловая мощность'],['airflow_m3h','Производительность'],
    ['heating_mode','Нагрев'],['fuel_consumption_kgh','Расход топлива'],['tank_l','Емкость бака'],
    ['voltage_v','Напряжение'],['control_type','Управление'],['thermostat_type','Термостат'],
    ['overheat_protection','Защита от перегрева'],['power_adjustment','Регулировка мощности'],
    ['temperature_adjustment','Регулировка температуры'],['fan_only_mode','Режим вентиляции']
   ];
   formula='Дизельные: тип 10% · мощность 24% · производительность 15% · прямой/непрямой нагрев 15% · расход топлива 10% · бак 8% · напряжение 5% · управление 3% · термостат 3% · защита 3% · регулировка мощности 2% · регулировка температуры 1% · вентиляция 1%. Прямой и непрямой нагрев между собой не аналоги.';
  }
  const body=keys.map(([k,n])=>'<tr><td><b>'+E(n)+'</b></td><td>'+heatGunValue(k,b[k])+'</td><td>'+heatGunValue(k,a[k])+'</td><td>'+E(heatGunResult(k,a[k],b[k]))+'</td></tr>').join('');
  const ref='<div class="tm224-ref"><b>'+E(formula)+'</b> <b>Цена в подборе технического аналога не участвует.</b></div>';
  return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
   +'<div class="tm224-conv-table"><table><thead><tr><th>Характеристика</th><th>Конкурент</th><th>Наш товар</th><th>Результат</th></tr></thead><tbody>'+body+'</tbody></table></div>'+ref
   +listingHistoryBlock(l)
   +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
   +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
   +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
 }
 if(r.profile_key==='oil_radiator'){
  const keys=[
   ['device_type','Тип устройства'],
   ['sections_count','Количество секций'],
   ['power_w','Мощность обогрева'],
   ['power_adjustment','Регулировка мощности'],
   ['temperature_adjustment','Регулировка температуры'],
   ['control_type','Управление'],
   ['wheels_present','Колеса для перемещения'],
   ['thermostat_type','Термостат']
  ];
  const body=keys.map(([k,n])=>'<tr><td><b>'+E(n)+'</b></td><td>'+oilRadiatorValue(k,b[k])+'</td><td>'+oilRadiatorValue(k,a[k])+'</td><td>'+E(oilRadiatorResult(k,a[k],b[k]))+'</td></tr>').join('');
  const ref='<div class="tm224-ref"><b>Формула сопоставимости:</b> тип устройства 15% · секции 25% · мощность 25% · регулировка мощности 10% · регулировка температуры 7% · управление 7% · колеса 4% · термостат 7%. <b>Цена в подборе аналога не участвует.</b></div>';
  return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
   +'<div class="tm224-conv-table"><table><thead><tr><th>Характеристика</th><th>Конкурент</th><th>Наш товар</th><th>Результат</th></tr></thead><tbody>'+body+'</tbody></table></div>'+ref
   +listingHistoryBlock(l)
   +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
   +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
   +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
 }
 if(r.profile_key==='fan_heater'){
  const keys=[
   ['device_type','Тип устройства'],
   ['heater_type','Нагревательный элемент'],
   ['power_w','Мощность обогрева'],
   ['power_adjustment','Регулировка мощности'],
   ['thermostat_type','Термостат'],
   ['control_type','Управление'],
   ['remote_control','Пульт ДУ'],
   ['fan_present','Встроенный вентилятор'],
   ['fan_only_mode','Обдув без нагрева'],
   ['indicator_light','Световой индикатор'],
   ['display_present','Дисплей']
  ];
  const body=keys.map(([k,n])=>'<tr><td><b>'+E(n)+'</b></td><td>'+fanHeaterValue(k,b[k])+'</td><td>'+fanHeaterValue(k,a[k])+'</td><td>'+E(fanHeaterResult(k,a[k],b[k]))+'</td></tr>').join('');
  const ref='<div class="tm224-ref"><b>Формула сопоставимости:</b> тип устройства 12% · нагревательный элемент 18% · мощность 22% · регулировка мощности 10% · термостат 8% · управление 7% · пульт ДУ 5% · встроенный вентилятор 4% · обдув без нагрева 5% · световой индикатор 3% · дисплей 6%. <b>Цена в подборе аналога не участвует.</b></div>';
  return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
   +'<div class="tm224-conv-table"><table><thead><tr><th>Характеристика</th><th>Конкурент</th><th>Наш товар</th><th>Результат</th></tr></thead><tbody>'+body+'</tbody></table></div>'+ref
   +listingHistoryBlock(l)
   +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
   +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
   +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
 }







 if(r.profile_key==='jigsaw'){
  const keys=[
   ['input_power_w','Мощность'],['cut_depth_wood_mm','Максимальная глубина пропила'],
   ['strokes_per_min','Количество ходов в минуту'],['motor_type','Щеточный/бесщеточный']
  ];
  const body=keys.map(([k,n])=>'<tr><td><b>'+E(n)+'</b></td><td>'+jigsawValue(k,b[k])+'</td><td>'+jigsawValue(k,a[k])+'</td><td>'+E(jigsawResult(k,a[k],b[k]))+'</td></tr>').join('');
  const ref='<div class="tm224-ref"><b>Лобзики:</b> сетевые и аккумуляторные модели не смешиваются между собой. По мощности для сетевых полное совпадение — ±100 Вт. Максимальная глубина пропила берется именно по дереву и сравнивается с допуском ±10%; большая глубина считается преимуществом. Количество ходов в минуту — допуск ±10%, но больше ходов само по себе не означает лучший лобзик. Бесщеточный двигатель считается преимуществом над щеточным. Если не подтверждены глубина пропила по дереву или количество ходов, а для сетевого лобзика также мощность — вывод «сильнее/слабее» блокируется.</div>';
  return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
   +'<div class="tm224-conv-table"><table><thead><tr><th>Характеристика</th><th>Конкурент</th><th>Наш товар</th><th>Результат</th></tr></thead><tbody>'+body+'</tbody></table></div>'+ref
   +listingHistoryBlock(l)
   +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
   +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
   +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
 }
 if(r.profile_key==='paint_sprayer'){
  const keys=[
   ['input_power_w','Мощность'],['tank_position','Расположение бачка'],['pressure_bar','Давление']
  ];
  const body=keys.map(([k,n])=>'<tr><td><b>'+E(n)+'</b></td><td>'+paintSprayerValue(k,b[k])+'</td><td>'+paintSprayerValue(k,a[k])+'</td><td>'+E(paintSprayerResult(k,a[k],b[k]))+'</td></tr>').join('');
  const ref='<div class="tm224-ref"><b>Краскопульты:</b> сравниваются электрические и аккумуляторные краскопульты. Пневматические модели, аэрографы и отдельные окрасочные станции исключаются из прямого рынка. По мощности полное совпадение — ±100 Вт. Давление приводится к барам: МПа и PSI автоматически пересчитываются, полное совпадение — ±10%; при большей разнице более высокое давление фиксируется как преимущество. Верхнее, нижнее и выносное расположение бачка считаются разными конструктивными вариантами, но само по себе не делает модель сильнее. Если не подтверждены мощность или давление — вывод «сильнее/слабее» блокируется.</div>';
  return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
   +'<div class="tm224-conv-table"><table><thead><tr><th>Характеристика</th><th>Конкурент</th><th>Наш товар</th><th>Результат</th></tr></thead><tbody>'+body+'</tbody></table></div>'+ref
   +listingHistoryBlock(l)
   +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
   +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
   +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
 }
 if(r.profile_key==='cordless_screwdriver'){
  const keys=[
   ['battery_capacity_ah','Емкость АКБ'],['motor_type','Щеточный/бесщеточный'],
   ['max_torque_nm','Крутящий момент'],['impact_present','Наличие удара'],
   ['battery_count','Количество АКБ в комплекте'],['case_present','Наличие кейса']
  ];
  const body=keys.map(([k,n])=>'<tr><td><b>'+E(n)+'</b></td><td>'+screwdriverValue(k,b[k])+'</td><td>'+screwdriverValue(k,a[k])+'</td><td>'+E(screwdriverResult(k,a[k],b[k]))+'</td></tr>').join('');
  const ref='<div class="tm224-ref"><b>Шуруповерты:</b> в этом профиле сравниваются аккумуляторные шуруповерты и дрели-шуруповерты. Гайковерты, перфораторы, обычные дрели и отдельные ударные винтоверты исключаются. Емкость АКБ сравнивается с допуском ±15%, крутящий момент — ±10% и является главным силовым параметром. Бесщеточный двигатель считается преимуществом над щеточным. Наличие удара, количество АКБ и кейс учитываются как преимущества комплектации/функциональности. Значение 0 АКБ ставится только когда отсутствие аккумулятора прямо подтверждено. Если не подтверждены емкость АКБ или крутящий момент — вывод «сильнее/слабее» блокируется.</div>';
  return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
   +'<div class="tm224-conv-table"><table><thead><tr><th>Характеристика</th><th>Конкурент</th><th>Наш товар</th><th>Результат</th></tr></thead><tbody>'+body+'</tbody></table></div>'+ref
   +listingHistoryBlock(l)
   +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
   +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
   +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
 }
 if(r.profile_key==='impact_drill'){
  const keys=[
   ['input_power_w','Мощность'],['speed_count','Количество скоростей'],
   ['max_rpm','Максимальное число оборотов'],['impact_present','Наличие удара']
  ];
  const body=keys.map(([k,n])=>'<tr><td><b>'+E(n)+'</b></td><td>'+impactDrillValue(k,b[k])+'</td><td>'+impactDrillValue(k,a[k])+'</td><td>'+E(impactDrillResult(k,a[k],b[k]))+'</td></tr>').join('');
  const ref='<div class="tm224-ref"><b>Ударные дрели:</b> сравниваются только ударные дрели; перфораторы, дрели-шуруповерты, дрели-миксеры и безударные дрели не считаются прямыми аналогами. По мощности полное совпадение — ±100 Вт. Количество скоростей сравнивается по фактическому числу; больше скоростей — функциональное преимущество, но не другой класс. Максимальные обороты — допуск ±10%, при этом больше оборотов само по себе не означает лучший инструмент. Наличие удара — жесткое условие. Если не подтверждены мощность, максимальные обороты или наличие удара — вывод «сильнее/слабее» блокируется.</div>';
  return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
   +'<div class="tm224-conv-table"><table><thead><tr><th>Характеристика</th><th>Конкурент</th><th>Наш товар</th><th>Результат</th></tr></thead><tbody>'+body+'</tbody></table></div>'+ref
   +listingHistoryBlock(l)
   +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
   +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
   +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
 }
 if(r.profile_key==='circular_saw'){
  const keys=[
   ['device_type','Тип'],['power_source','Тип питания'],['input_power_w','Потребляемая мощность'],
   ['cut_speed_adjustment','Регулировка скорости распила'],['max_rpm','Макс. обороты холостого хода'],
   ['cut_depth_90_mm','Глубина реза 90°'],['cut_depth_45_mm','Глубина реза 45°'],
   ['blade_diameter_mm','Диаметр пильного диска'],['arbor_diameter_mm','Диаметр посадочного гнезда'],
   ['tilt_angle_deg','Угол наклона диска'],['motor_type','Тип электродвигателя'],['battery_type','Тип аккумулятора'],
   ['battery_voltage_v','Напряжение аккумулятора'],['battery_capacity_ah','Емкость аккумулятора']
  ];
  const body=keys.map(([k,n])=>'<tr><td><b>'+E(n)+'</b></td><td>'+circularSawValue(k,b[k])+'</td><td>'+circularSawValue(k,a[k])+'</td><td>'+E(circularSawResult(k,a[k],b[k]))+'</td></tr>').join('');
  const ref='<div class="tm224-ref"><b>Дисковые пилы:</b> обычные, погружные и мини-дисковые пилы разделяются по типу; сетевые и аккумуляторные не смешиваются. Диаметр диска задает класс: 160/165, 185/190 и 200/210 объединяются как соседние стандартные размеры, а существенно разные классы не сравниваются напрямую. Посадочное отверстие сравнивается строго. По потребляемой мощности допуск ±150 Вт; глубина реза 90° и 45° и обороты — ±10%; угол наклона — до ±5° считается сопоставимым. Для аккумуляторных напряжение сравнивается по классу, емкость АКБ — ±15%. Бесщеточный двигатель считается преимуществом. Если нет типа, питания, диаметра диска, посадки или глубины реза 90°, а для аккумуляторной еще и напряжения АКБ — вывод «сильнее/слабее» блокируется.</div>';
  return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
   +'<div class="tm224-conv-table"><table><thead><tr><th>Характеристика</th><th>Конкурент</th><th>Наш товар</th><th>Результат</th></tr></thead><tbody>'+body+'</tbody></table></div>'+ref
   +listingHistoryBlock(l)
   +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
   +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
   +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
 }
 if(r.profile_key==='impact_wrench'){
  const keys=[
   ['device_type','Тип'],['wrench_type','Тип гайковерта'],['power_source','Тип питания'],
   ['motor_type','Тип электродвигателя'],['input_power_w','Потребляемая мощность'],['reverse_present','Реверс'],
   ['operating_modes','Режимы'],['chuck_type','Тип патрона'],['drive_size_in','Посадочный квадрат/шестигранник'],
   ['rotation_adjustment','Регулировка вращения'],['max_rpm','Макс. скорость вращения'],['max_torque_nm','Макс. крутящий момент'],
   ['battery_type','Тип аккумулятора'],['battery_voltage_v','Напряжение аккумулятора'],
   ['battery_capacity_ah','Емкость аккумулятора'],['charging_time_min','Время зарядки']
  ];
  const body=keys.map(([k,n])=>'<tr><td><b>'+E(n)+'</b></td><td>'+impactWrenchValue(k,b[k])+'</td><td>'+impactWrenchValue(k,a[k])+'</td><td>'+E(impactWrenchResult(k,a[k],b[k]))+'</td></tr>').join('');
  const ref='<div class="tm224-ref"><b>Гайковерты:</b> тип инструмента, ударный/безударный тип, питание и посадочный квадрат/шестигранник — жесткие границы класса. 1/4″, 3/8″, 1/2″, 3/4″ и 1″ сравниваются строго. Максимальный крутящий момент — ключевой параметр, прямое совпадение ±10%; скорость вращения и потребляемая мощность — ±10%, но больше оборотов само по себе не означает лучший инструмент. Для аккумуляторных 10,8/12 В и 18/20 В нормализуются по классу; емкость АКБ и время зарядки — ±15%. Бесщеточный двигатель считается преимуществом над щеточным. Если нет типа гайковерта, питания, посадки или максимального момента, а для аккумуляторного еще и напряжения АКБ — вывод «сильнее/слабее» блокируется.</div>';
  return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
   +'<div class="tm224-conv-table"><table><thead><tr><th>Характеристика</th><th>Конкурент</th><th>Наш товар</th><th>Результат</th></tr></thead><tbody>'+body+'</tbody></table></div>'+ref
   +listingHistoryBlock(l)
   +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
   +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
   +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
 }
 if(r.profile_key==='sprayer'){
  const keys=[
   ['device_type','Тип'],['application_area','Область применения'],['carry_type','Вид переноски'],
   ['voltage_v','Напряжение'],['flow_rate_lmin','Производительность'],['power_source','Тип питания'],
   ['battery_type','Тип аккумулятора'],['battery_capacity_ah','Емкость аккумулятора'],['tank_capacity_l','Объем емкости'],
   ['fuel_engine_type','Тип бензинового двигателя'],['fuel_power_w','Мощность'],['engine_cc','Объем двигателя'],
   ['fuel_tank_l','Объем топливного бака'],['spray_radius_m','Радиус опрыскивания']
  ];
  const body=keys.map(([k,n])=>'<tr><td><b>'+E(n)+'</b></td><td>'+sprayerValue(k,b[k])+'</td><td>'+sprayerValue(k,a[k])+'</td><td>'+E(sprayerResult(k,a[k],b[k]))+'</td></tr>').join('');
  const ref='<div class="tm224-ref"><b>Опрыскиватели:</b> тип питания — жёсткий фильтр: ручные, аккумуляторные, сетевые и бензиновые между собой не смешиваются. У аккумуляторных напряжение сравнивается по классу АКБ; производительность, емкость аккумулятора, объем емкости и радиус — допуск ±15%. У бензиновых 2Т/4Т не считаются прямыми аналогами, мощность и объем двигателя — ±10%, топливный бак — ±15%. Разный вид переноски оставляет товар близким, но не прямым аналогом. Критические параметры зависят от типа питания; при их отсутствии вывод «сильнее/слабее» блокируется.</div>';
  return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
   +'<div class="tm224-conv-table"><table><thead><tr><th>Характеристика</th><th>Конкурент</th><th>Наш товар</th><th>Результат</th></tr></thead><tbody>'+body+'</tbody></table></div>'+ref
   +listingHistoryBlock(l)
   +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
   +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
   +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
 }
 if(r.profile_key==='battery_pruner'){
  const keys=[
   ['device_type','Тип'],['tool_type','Тип инструмента'],['voltage_v','Напряжение'],
   ['power_source','Тип питания'],['battery_type','Тип аккумулятора'],['battery_capacity_ah','Емкость аккумулятора'],
   ['knife_type','Тип ножа'],['blade_type','Тип лезвия'],['max_cut_diameter_mm','Максимальная толщина среза']
  ];
  const body=keys.map(([k,n])=>'<tr><td><b>'+E(n)+'</b></td><td>'+batteryPrunerValue(k,b[k])+'</td><td>'+batteryPrunerValue(k,a[k])+'</td><td>'+E(batteryPrunerResult(k,a[k],b[k]))+'</td></tr>').join('');
  const ref='<div class="tm224-ref"><b>Аккумуляторные секаторы:</b> тип, тип инструмента и аккумуляторное питание должны совпадать. Напряжение сравнивается по классу АКБ: 18/20 В — один класс, 36/40 В — другой. Емкость аккумулятора — допуск ±15%; максимальная толщина среза — ключевой параметр с допуском ±10%. Тип ножа и тип лезвия сравниваются отдельно: различие не делает инструмент автоматически сильнее, но не дает прямое совпадение. Если нет типа инструмента, питания, напряжения или максимальной толщины среза — вывод «сильнее/слабее» блокируется как недостаточно данных.</div>';
  return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
   +'<div class="tm224-conv-table"><table><thead><tr><th>Характеристика</th><th>Конкурент</th><th>Наш товар</th><th>Результат</th></tr></thead><tbody>'+body+'</tbody></table></div>'+ref
   +listingHistoryBlock(l)
   +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
   +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
   +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
 }
 if(r.profile_key==='garden_shredder'){
  const keys=[
   ['device_type','Тип'],['processed_material','Перерабатываемый материал измельчителем'],['body_material','Материал корпуса'],
   ['cutting_mechanism','Режущий механизм'],['input_power_w','Входная мощность'],['voltage_v','Напряжение'],
   ['noise_db','Уровень шума'],['cutting_speed_rpm','Скорость резания'],['max_branch_diameter_mm','Максимальный диаметр веток'],
   ['engine_type','Тип двигателя'],['collector_capacity_l','Емкость бункера/травосборника'],
   ['feed_openings_count','Кол-во загрузочных отверстий'],['collector_present','Бункер/травосборник'],
   ['collector_type','Тип бункера/травосборника']
  ];
  const body=keys.map(([k,n])=>'<tr><td><b>'+E(n)+'</b></td><td>'+gardenShredderValue(k,b[k])+'</td><td>'+gardenShredderValue(k,a[k])+'</td><td>'+E(gardenShredderResult(k,a[k],b[k]))+'</td></tr>').join('');
  const ref='<div class="tm224-ref"><b>Садовые измельчители:</b> тип устройства и тип двигателя/питания — жесткие фильтры; 220/230 В считается одним сетевым классом. Режущий механизм — ключевой параметр: разные механизмы не получают прямой аналог. Входная мощность, скорость резания и максимальный диаметр веток — допуск ±10%; уровень шума — сопоставим при разнице до 3 дБ; емкость бункера — ±15%. Количество загрузочных отверстий сравнивается точно. Основные параметры класса: режущий механизм + тип двигателя + максимальный диаметр веток + мощность. Если нет режущего механизма, типа двигателя, мощности или максимального диаметра веток — вывод «сильнее/слабее» блокируется как недостаточно данных.</div>';
  return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
   +'<div class="tm224-conv-table"><table><thead><tr><th>Характеристика</th><th>Конкурент</th><th>Наш товар</th><th>Результат</th></tr></thead><tbody>'+body+'</tbody></table></div>'+ref
   +listingHistoryBlock(l)
   +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
   +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
   +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
 }
 if(r.profile_key==='earth_auger'){
  const keys=[
   ['device_type','Тип'],['engine_type','Тип двигателя'],['fuel_power_w','Мощность топливного двигателя'],
   ['fuel_tank_l','Емкость топливного бака'],['rpm','Кол-во оборотов'],['engine_cc','Объем двигателя'],
   ['max_auger_diameter_mm','Макс. диаметр бура'],['shaft_diameter_mm','Диаметр посадочного отверстия']
  ];
  const body=keys.map(([k,n])=>'<tr><td><b>'+E(n)+'</b></td><td>'+earthAugerValue(k,b[k])+'</td><td>'+earthAugerValue(k,a[k])+'</td><td>'+E(earthAugerResult(k,a[k],b[k]))+'</td></tr>').join('');
  const ref='<div class="tm224-ref"><b>Мотобуры:</b> тип и тип двигателя должны совпадать; посадочный диаметр сравнивается строго после нормализации (например, 1″ = 25,4 мм). Мощность, бак, обороты и максимальный диаметр бура — допуск ±10%; объем двигателя — ±5%. Основные параметры класса: мощность + объем двигателя + максимальный диаметр бура. Если нет типа двигателя, мощности, максимального диаметра бура или посадочного диаметра — вывод «сильнее/слабее» блокируется как недостаточно данных. Больше оборотов само по себе не означает лучший мотобур.</div>';
  return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
   +'<div class="tm224-conv-table"><table><thead><tr><th>Характеристика</th><th>Конкурент</th><th>Наш товар</th><th>Результат</th></tr></thead><tbody>'+body+'</tbody></table></div>'+ref
   +listingHistoryBlock(l)
   +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
   +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
   +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
 }
 if(r.profile_key==='leaf_blower'){
  const type=String(a.power_source||b.power_source||'');
  let keys=[],formula='';
  if(type==='fuel'){
   keys=[
    ['device_type','Тип'],['construction','Конструкция'],['air_speed_ms','Скорость воздушного потока'],['engine_type','Тип двигателя'],
    ['power_source','Тип питания'],['functions','Функции'],['airflow_m3h','Расход воздуха'],['noise_db','Уровень шума'],
    ['fuel_power_w','Мощность топливного двигателя'],['engine_cc','Рабочий объем двигателя'],['fuel_tank_l','Емкость топливного бака']
   ];
   formula='Бензиновые: тип 8% · конструкция 12% · скорость потока 14% · тип двигателя 7% · тип питания 10% · функции 8% · расход воздуха 15% · шум 4% · мощность ДВС 9% · объем двигателя 7% · бак 6%.';
  }else if(type==='battery'){
   keys=[
    ['device_type','Тип'],['construction','Конструкция'],['air_speed_ms','Скорость воздушного потока'],['engine_type','Тип двигателя'],
    ['power_source','Тип питания'],['battery_type','Тип аккумулятора'],['battery_capacity_ah','Емкость аккумулятора'],
    ['battery_voltage_v','Напряжение аккумулятора'],['rpm','Обороты двигателя'],['functions','Функции'],
    ['airflow_m3h','Расход воздуха'],['noise_db','Уровень шума'],['motor_power_w','Номинальная мощность двигателя']
   ];
   formula='Аккумуляторные: тип 8% · конструкция 10% · скорость потока 15% · тип двигателя 6% · тип питания 10% · тип АКБ 5% · емкость АКБ 7% · напряжение 12% · обороты 5% · функции 8% · расход воздуха 8% · шум 2% · мощность 4%. 18/20 В и 36/40 В считаются одним классом.';
  }else{
   keys=[
    ['device_type','Тип'],['construction','Конструкция'],['air_speed_ms','Скорость воздушного потока'],['engine_type','Тип двигателя'],
    ['power_source','Тип питания'],['rpm','Обороты двигателя'],['functions','Функции'],['airflow_m3h','Расход воздуха'],
    ['noise_db','Уровень шума'],['motor_power_w','Номинальная мощность двигателя']
   ];
   formula='Сетевые: тип 10% · конструкция 12% · скорость потока 18% · тип двигателя 7% · тип питания 12% · обороты 7% · функции 10% · расход воздуха 16% · шум 3% · мощность 5%.';
  }
  const body=keys.map(([k,n])=>'<tr><td><b>'+E(n)+'</b></td><td>'+leafBlowerValue(k,b[k])+'</td><td>'+leafBlowerValue(k,a[k])+'</td><td>'+E(leafBlowerResult(k,a[k],b[k]))+'</td></tr>').join('');
  const ref='<div class="tm224-ref"><b>'+E(formula)+'</b> <b>Бензиновые, аккумуляторные и сетевые воздуходувки между собой не аналоги. Разная конструкция не может получить прямой аналог. Для потока, расхода, мощности, оборотов, АКБ и бака действуют согласованные допуски. Цена в подборе технического аналога не участвует.</b></div>';
  return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
   +'<div class="tm224-conv-table"><table><thead><tr><th>Характеристика</th><th>Конкурент</th><th>Наш товар</th><th>Результат</th></tr></thead><tbody>'+body+'</tbody></table></div>'+ref
   +listingHistoryBlock(l)
   +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
   +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
   +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
 }
 if(r.profile_key==='snow_blower'){
  const type=String(a.power_source||b.power_source||'');
  let keys=[],formula='';
  if(type==='fuel'){
   keys=[
    ['device_type','Тип'],['snow_blower_type','Тип снегоуборщика'],['clearing_width_cm','Ширина обработки'],
    ['intake_height_cm','Высота обработки'],['throw_distance_m','Максимальная дальность выброса'],['drive_type','Движитель'],
    ['operator_panel_control','Управление с панели оператора'],['gears','Количество передач'],['headlight','Фара'],
    ['motor_power_w','Мощность двигателя на топливе'],['engine_cc','Рабочий объем двигателя'],['tank_l','Емкость бака'],
    ['engine_start_type','Пуск двигателя'],['heated_handles','Подогрев ручек'],['clutch_type','Сцепление'],
    ['skid_height_adjustment','Регулировка высоты полозьев']
   ];
   formula='Бензиновые: тип 10% · тип снегоуборщика 10% · ширина 12% · высота 8% · дальность выброса 8% · движитель 10% · управление с панели 4% · передачи 8% · фара 3% · мощность ДВС 10% · объем двигателя 5% · бак 3% · пуск 3% · подогрев ручек 2% · сцепление 2% · полозья 2%.';
  }else if(type==='electric'){
   keys=[
    ['device_type','Тип'],['snow_blower_type','Тип снегоуборщика'],['power_source','Источник питания'],
    ['clearing_width_cm','Ширина обработки'],['intake_height_cm','Высота обработки'],['throw_distance_m','Максимальная дальность выброса'],
    ['drive_type','Движитель'],['motor_power_w','Мощность электродвигателя'],['operator_panel_control','Управление с панели оператора'],
    ['headlight','Фара'],['skid_height_adjustment','Регулировка высоты полозьев']
   ];
   formula='Электрические: тип 12% · тип снегоуборщика 10% · источник питания 10% · ширина 18% · высота 12% · дальность выброса 10% · движитель 8% · мощность электродвигателя 12% · управление с панели 3% · фара 2% · полозья 3%.';
  }else{
   keys=[
    ['device_type','Тип'],['snow_blower_type','Тип снегоуборщика'],['power_source','Источник питания'],
    ['battery_capacity_ah','Емкость аккумулятора'],['battery_voltage_v','Напряжение аккумулятора'],
    ['clearing_width_cm','Ширина обработки'],['intake_height_cm','Высота обработки'],['throw_distance_m','Максимальная дальность выброса'],
    ['drive_type','Движитель'],['operator_panel_control','Управление с панели оператора'],['headlight','Фара'],
    ['skid_height_adjustment','Регулировка высоты полозьев']
   ];
   formula='Аккумуляторные: тип 10% · тип снегоуборщика 8% · источник питания 8% · ширина 16% · высота 10% · дальность выброса 10% · движитель 7% · емкость АКБ 10% · напряжение АКБ 12% · управление с панели 3% · фара 2% · полозья 4%. 18/20 В и 36/40 В считаются одним классом.';
  }
  const body=keys.map(([k,n])=>{
   if(k==='engine_start_type'){
    return '<tr><td><b>'+E(n)+'</b></td><td>'+snowBlowerStartText(b)+'</td><td>'+snowBlowerStartText(a)+'</td><td>'+E(snowBlowerStartResult(a,b))+'</td></tr>';
   }
   return '<tr><td><b>'+E(n)+'</b></td><td>'+snowBlowerValue(k,b[k])+'</td><td>'+snowBlowerValue(k,a[k])+'</td><td>'+E(snowBlowerResult(k,a[k],b[k]))+'</td></tr>';
  }).join('');
  const missingStart=a?.engine_start_type&&!b?.engine_start_type
   ?'<div class="tm224-market-note"><b>Важно:</b> у нашего товара подтверждён тип запуска, а у конкурента 21vek его не указал. Отсутствие данных не считается отсутствием функции, поэтому вывод «конкурент сильнее» только из-за цены блокируется.</div>'
   :'';
  const ref='<div class="tm224-ref"><b>'+E(formula)+'</b> <b>Бензиновые, сетевые и аккумуляторные между собой не аналоги. Для ширины/высоты/дальности и мощности действуют согласованные допуски. Цена в подборе технического аналога не участвует.</b></div>'+missingStart;
  return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
   +'<div class="tm224-conv-table"><table><thead><tr><th>Характеристика</th><th>Конкурент</th><th>Наш товар</th><th>Результат</th></tr></thead><tbody>'+body+'</tbody></table></div>'+ref
   +listingHistoryBlock(l)
   +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
   +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
   +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
 }
 if(r.profile_key==='chainsaw_electric'){
  const keys=[
   ['device_type','Тип'],
   ['purpose','Назначение'],
   ['power_supply','Тип питания электропилы'],
   ['bar_length_cm','Длина шины'],
   ['power_w','Мощность'],
   ['chain_brake','Тормоз цепи'],
   ['tool_free_tension','Быстрое натяжение цепи'],
   ['auto_chain_lubrication','Автоматическая смазка цепи'],
   ['motor_position','Расположение двигателя']
  ];
  const body=keys.map(([k,n])=>'<tr><td><b>'+E(n)+'</b></td><td>'+electricChainsawValue(k,b[k])+'</td><td>'+electricChainsawValue(k,a[k])+'</td><td>'+E(electricChainsawResult(k,a[k],b[k]))+'</td></tr>').join('');
  const ref='<div class="tm224-ref"><b>Формула сопоставимости электропил:</b> тип 10% · назначение 10% · тип питания 20% · длина шины 20% · мощность 18% · тормоз цепи 7% · быстрое натяжение 5% · автоматическая смазка 5% · расположение двигателя 5%. <b>Сетевая и аккумуляторная пила между собой не аналоги. Цена в подборе аналога не участвует.</b></div>';
  return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
   +'<div class="tm224-conv-table"><table><thead><tr><th>Характеристика</th><th>Конкурент</th><th>Наш товар</th><th>Результат</th></tr></thead><tbody>'+body+'</tbody></table></div>'+ref
   +listingHistoryBlock(l)
   +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
   +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
   +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
 }
 if(r.profile_key==='chainsaw_gas'){
  const keys=[['engine_cc','Объём двигателя'],['power_w','Мощность']];
  const body=keys.map(([k,n])=>'<tr><td><b>'+E(n)+'</b></td><td>'+chainsawValue(k,b[k])+'</td><td>'+chainsawValue(k,a[k])+'</td><td>'+E(chainsawResult(k,a[k],b[k]))+'</td></tr>').join('');
  const marketNote=r.is_main_competitor===false
   ?'<div class="tm224-market-note"><b>Рыночный ориентир.</b> Товар остаётся в полном списке и сравнивается технически, но не участвует в основном выводе «мы сильнее / конкурент сильнее».</div>'
   :'';
  const rec=r.is_main_competitor===false
   ?'Контролировать позицию, цену и характеристики как ориентир рынка. Основные конкурентные действия строить по прямым конкурентам.'
   :(r.recommendation||r.gap_reason||'—');
  return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
   +'<div class="tm224-conv-table"><table><thead><tr><th>Характеристика</th><th>Конкурент</th><th>Наш товар</th><th>Результат</th></tr></thead><tbody>'+body+'</tbody></table></div>'
   +'<div class="tm224-ref"><b>Техническая сопоставимость бензопил:</b> только объём двигателя 50% + мощность 50%. Остальные характеристики на процент не влияют.</div>'
   +marketNote
   +listingHistoryBlock(l)
   +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
   +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
   +'<div class="tm224-rec"><b>Что делать:</b> '+E(rec)+'</div></details>';
 }
 if(r.profile_key==='infrared_heater'){
  const keys=[
   ['energy_type','Тип устройства / источник энергии'],
   ['heater_type','Нагревательный элемент'],
   ['power_w','Мощность обогрева'],
   ['installation_type','Способ установки / монтаж'],
   ['power_adjustment','Регулировка мощности'],
   ['thermostat_type','Термостат'],
   ['display_present','Дисплей'],
   ['temperature_adjustment','Регулировка температуры'],
   ['control_type','Управление'],
   ['voltage_v','Напряжение']
  ];
  const body=keys.map(([k,n])=>'<tr><td><b>'+E(n)+'</b></td><td>'+infraredValue(k,b[k])+'</td><td>'+infraredValue(k,a[k])+'</td><td>'+E(infraredResult(k,a[k],b[k]))+'</td></tr>').join('');
  const ref='<div class="tm224-ref"><b>Не участвуют в проценте:</b> площадь обогрева и вес. Газовые и электрические инфракрасные обогреватели между собой не сопоставляются.</div>';
  return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
   +'<div class="tm224-conv-table"><table><thead><tr><th>Характеристика</th><th>Конкурент</th><th>Наш товар</th><th>Результат</th></tr></thead><tbody>'+body+'</tbody></table></div>'+ref
   +listingHistoryBlock(l)
   +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
   +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
   +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
 }
 const keys=[...new Set([...Object.keys(a),...Object.keys(b)])];
 return '<details class="tm224-details"><summary>Характеристики и аргументы</summary>'
  +'<div class="tm224-compare"><div><b>Наш товар</b>'+keys.map(k=>specLine(k,a[k])).filter(Boolean).join('')+'</div>'
  +'<div><b>Конкурент</b>'+keys.map(k=>specLine(k,b[k])).filter(Boolean).join('')+'</div></div>'
  +listingHistoryBlock(l)
  +'<div class="tm224-ab"><div><b>Наши подтверждённые преимущества</b>'+((r.advantages||[]).length?'<ul>'+(r.advantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div>'
  +'<div><b>Где конкурент сильнее</b>'+((r.disadvantages||[]).length?'<ul>'+(r.disadvantages||[]).map(x=>'<li>'+E(x)+'</li>').join('')+'</ul>':'<span>—</span>')+'</div></div>'
  +'<div class="tm224-rec"><b>Что делать:</b> '+E(r.recommendation||r.gap_reason||'—')+'</div></details>';
}
function positionHistoryText(r){
 const x7=N(r.position_7d),x30=N(r.position_30d),xs=[];
 if(x7!=null)xs.push('7д: #'+x7);
 if(x30!=null)xs.push('30д: #'+x30);
 return xs.length?'было '+xs.join(' · '):'история позиции накапливается';
}
function competitorPriceTrend(r,days){
 const d=[3,7,10,14,20,30].includes(Number(days))?Number(days):7;
 const current=N(r.competitor_price),past=N(r['price_'+d+'d']);
 if(current==null||current<=0||past==null||past<=0)return{kind:'no_history',className:'',delta:null,pct:null,past,text:'нет истории цены за '+d+'д'};
 const delta=current-past;
 if(Math.abs(delta)<0.005)return{kind:'stable',className:'warn',delta:0,pct:0,past,text:'→ без изменений за '+d+'д · было '+money(past)};
 const p=delta/past*100;
 if(delta<0)return{kind:'down',className:'bad',delta,pct:p,past,text:'↓ снизил на '+money(Math.abs(delta))+' ('+pct(p)+') за '+d+'д · было '+money(past)};
 return{kind:'up',className:'good',delta,pct:p,past,text:'↑ поднял на '+money(Math.abs(delta))+' ('+pct(p)+') за '+d+'д · было '+money(past)};
}
function rowHtml(r,ownMap,days,priceDays){
 const gap=!!r.is_gap,[sl,sc]=rowStatus(r),pos=N(r.position),cp=N(r.competitor_price),priceMissing=cp==null||cp<=0,pt=competitorPriceTrend(r,priceDays);
 const lp=gap?null:ownMap.get(listingKey(r.scope_key,r.our_sku));
 return '<div class="tm224-row '+(gap?'gap':'')+'"><div class="tm224-main">'
  +'<div><small>Позиция 21vek</small><b class="'+(pos!=null&&pos<=10?'bad':'')+'">#'+E(pos??'—')+'</b><span>страница '+E(r.page_no??'—')+'</span><span>'+E(positionHistoryText(r))+'</span></div>'
  +'<div><small>Конкурент</small><b>'+E(r.brand||'—')+'</b>'+competitorBadge(r)+'<span>'+E(r.model||'')+'</span>'+(r.product_url?'<a target="_blank" rel="noopener" href="'+E(r.product_url)+'">21vek ↗</a>':'')+'</div>'
  +'<div><small>Цена конкурента</small><b>'+money(r.competitor_price)+'</b><span class="'+E(pt.className)+'">'+E(pt.text)+'</span></div>'
  +(gap?'<div class="tm224-gapbox"><small>Наша матрица</small><b>⚠ Пробел в ассортименте</b><span>лучшее совпадение '+pct(r.best_similarity).replace('+','')+'</span></div>'
    :'<div><small>Наш SKU</small><b>'+E(r.our_sku||'—')+'</b><span>'+E(r.our_product_name||'')+'</span>'+listingInline(lp,days)+(r.our_product_url?'<a target="_blank" rel="noopener" href="'+E(r.our_product_url)+'">наша карточка ↗</a>':'')+'</div>')
  +(gap?'':('<div><small>Наша цена / МРЦ</small><b>'+money(r.our_price)+' / '+money(r.mrc_byn)+'</b><span class="'+(N(r.mrc_delta_pct)<0?'bad':'good')+'">от МРЦ '+pct(r.mrc_delta_pct)+'</span></div>'
   +'<div><small>Сопоставимость</small><b>'+pct(r.similarity_score).replace('+','')+'</b><span>'+E(gradeLabel(r.analog_grade))+'</span></div>'
   +'<div><small>Итог</small><b class="'+sc+'">'+sl+'</b><span>'+(priceMissing?'сравнение цены невозможно':'цена к конкуренту '+pct(r.price_delta_pct))+'</span></div>'))
  +'</div>'+details(r,lp)+'</div>';
}
function css(){
 if(document.getElementById('tm224-css'))return;
 const s=document.createElement('style');s.id='tm224-css';s.textContent=`
 .tm224-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}.tm224-note{font-size:11px;color:#64748b;line-height:1.45;max-width:900px}.tm224-actions{display:flex;gap:7px;flex-wrap:wrap}
 .tm224-kpi{display:grid;grid-template-columns:repeat(8,minmax(95px,1fr));gap:7px;margin:12px 0}.tm224-kpi>div{background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:9px}.tm224-kpi span{font-size:8px;color:#64748b;text-transform:uppercase;display:block}.tm224-kpi b{font-size:16px;display:block;margin-top:3px}
 .tm224-filters{display:grid;grid-template-columns:repeat(4,minmax(155px,1fr));gap:8px;padding:10px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;margin-bottom:10px}.tm224-filters select,.tm224-filters input{min-height:38px;border:1px solid #cbd5e1;border-radius:8px;padding:7px;background:#fff}
 .tm224-toggles{display:flex;gap:12px;flex-wrap:wrap;grid-column:1/-1;font-size:11px}.tm224-toggles label{display:flex;gap:5px;align-items:center}
 .tm224-scope{border:1px solid #dbe4ee;border-radius:12px;padding:10px;margin:10px 0;background:#fbfdff}.tm224-scope-head{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}.tm224-brands{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.tm224-brand{font-size:10px;padding:5px 7px;border-radius:99px;background:#fff;border:1px solid #dbe4ee}.tm224-brand b{color:#0c447c}
 .tm224-row{border:1px solid #e5e7eb;border-radius:12px;margin:9px 0;background:#fff;overflow:hidden}.tm224-row.gap{border-color:#fbbf24;background:#fffdf5}.tm224-main{display:grid;grid-template-columns:85px minmax(220px,1.8fr) 150px minmax(220px,1.6fr) 165px 130px 145px;gap:9px;padding:11px;align-items:start}.tm224-main small{display:block;color:#64748b;font-size:8px;text-transform:uppercase;margin-bottom:3px}.tm224-main b{display:block;font-size:11px}.tm224-main span{display:block;font-size:9px;color:#64748b;margin-top:3px}.tm224-main a{font-size:10px;color:#185fa5;text-decoration:none;display:inline-block;margin-top:4px}.tm224-gapbox{grid-column:4/8}
 .tm224-details{border-top:1px solid #e5e7eb;background:#fbfdff;padding:7px 11px}.tm224-details summary{cursor:pointer;font-size:10px;font-weight:800;color:#0c447c}.tm224-compare,.tm224-ab{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:8px}.tm224-compare>div,.tm224-ab>div{border:1px solid #e5e7eb;background:#fff;border-radius:8px;padding:8px}.tm224-compare span{display:block;font-size:10px;margin:2px 0}.tm224-ab{font-size:10px}.tm224-ab ul{margin:5px 0 0 16px}.tm224-conv-table{overflow:auto;margin-top:8px}.tm224-conv-table table{width:100%;border-collapse:collapse;background:#fff;font-size:10px}.tm224-conv-table th,.tm224-conv-table td{padding:7px;border:1px solid #e5e7eb;text-align:left;vertical-align:top}.tm224-conv-table th{background:#f8fafc}.tm224-ref{margin-top:7px;padding:7px 8px;border-radius:8px;background:#fff7ed;border:1px solid #fed7aa;font-size:10px}.tm224-own-pos{margin-top:5px!important;color:#0c447c!important}.tm224-listing-history{margin-top:8px;padding:8px;border:1px solid #dbeafe;background:#f8fbff;border-radius:8px;font-size:10px}.tm224-listing-history>div{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.tm224-listing-history span{padding:4px 6px;border:1px solid #dbe4ee;border-radius:999px;background:#fff}.tm224-own-summary{font-size:10px;margin-top:6px;color:#334155}.tm224-main-badge,.tm224-market-badge{display:inline-block!important;width:max-content;padding:2px 6px;border-radius:999px;font-size:8px!important;font-weight:800;margin-top:4px!important}.tm224-main-badge{background:#fef3c7;color:#92400e!important;border:1px solid #fcd34d}.tm224-market-badge{background:#f1f5f9;color:#475569!important;border:1px solid #cbd5e1}.tm224-market-note{margin-top:7px;padding:7px 8px;border-radius:8px;background:#f8fafc;border:1px solid #cbd5e1;font-size:10px;color:#475569}.tm224-rec{margin-top:8px;padding:8px;border-radius:8px;background:#eff6ff;border:1px solid #bfdbfe;font-size:10px}.tm224-empty{padding:18px;border:1px dashed #cbd5e1;border-radius:10px;color:#64748b;text-align:center}.tm224-meta{font-size:9px;color:#64748b;margin-top:9px}
 .good{color:#166534!important}.warn{color:#92400e!important}.bad{color:#b91c1c!important}
 @media(max-width:1250px){.tm224-kpi{grid-template-columns:repeat(4,1fr)}.tm224-filters{grid-template-columns:repeat(3,minmax(150px,1fr))}.tm224-main{grid-template-columns:repeat(3,minmax(0,1fr))}.tm224-gapbox{grid-column:auto}}
 @media(max-width:760px){.tm224-kpi,.tm224-filters,.tm224-main,.tm224-compare,.tm224-ab{grid-template-columns:1fr}.tm224-toggles{grid-column:auto}}
 `;document.head.appendChild(s);
}
function scopeHtml(s,summaryMap){
 const configured=N(s.main_competitors)!=null&&N(s.competitors)!=null&&N(s.main_competitors)<N(s.competitors);
 const brands=(s.brands||[]).map(b=>'<span class="tm224-brand"><b>'+E(b.brand)+'</b>'+(configured&&b.is_main_competitor?' ⭐':'')+' · '+E(b.models)+' мод. · лучшая #'+E(b.best_position??'—')+' · средняя '+E(b.avg_position??'—')+' · '+E(b.share_pct??0)+'%</span>').join('');
 const q=summaryMap.get(String(s.scope_key||''))||{};
 const ownSummary='<div class="tm224-own-summary"><b>Наш листинг:</b> TOP-10 — '+E(q.top10??0)+' · TOP-30 — '+E(q.top30??0)+' · TOP-60 — '+E(q.top60??0)+' · TOP-120 — '+E(q.top120??0)+' · вне TOP-120 — '+E(q.outside_top120??0)+(N(q.no_card)>0?' · без карточки — '+E(q.no_card):'')+'</div>';
 const marketSummary=configured?'<div class="tm224-own-summary"><b>Основные конкуренты:</b> '+E(s.main_competitors??0)+' товаров из '+E(s.competitors??0)+' в полном рынке.</div>':'';
 return '<div class="tm224-scope" data-scope-card="'+E(s.scope_key)+'"><div class="tm224-scope-head"><div><b>'+E(s.subgroup)+'</b><div class="tm224-note">TOP-2 21vek · запрос «'+E(s.search_query)+'» · наших SKU '+E(s.own_sku_count??0)+' · конкурентов '+E(s.competitors??0)+'</div>'+marketSummary+ownSummary+'</div><b class="'+((s.gaps||0)>0?'warn':'good')+'">пробелы '+E(s.gaps??0)+'</b></div><div class="tm224-brands">'+brands+'</div></div>';
}
function refreshBrandOptions(panel,d){
 const scope=panel.querySelector('[data-f-scope]')?.value||'',sel=panel.querySelector('[data-f-brand]');
 if(!sel)return;
 const prev=sel.value||'';
 const rows=(Array.isArray(d.rows)?d.rows:[]).filter(r=>!scope||r.scope_key===scope);
 const brands=[...new Set(rows.map(r=>String(r.brand||'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
 sel.innerHTML='<option value="">Все бренды</option>'+brands.map(x=>'<option value="'+E(x)+'">'+E(x)+'</option>').join('');
 sel.value=brands.includes(prev)?prev:'';
}
function applyFilters(panel,d,listing){
 const scope=panel.querySelector('[data-f-scope]')?.value||'',brand=panel.querySelector('[data-f-brand]')?.value||'',status=panel.querySelector('[data-f-status]')?.value||'',sku=(panel.querySelector('[data-f-sku]')?.value||'').trim().toLowerCase();
 const competitorKind=panel.querySelector('[data-f-competitor-kind]')?.value||'all';
 const trend=panel.querySelector('[data-f-trend]')?.value||'',days=N(panel.querySelector('[data-f-days]')?.value)||N(listing?.period_days)||7;
 const priceTrend=panel.querySelector('[data-f-price-trend]')?.value||'',priceDays=N(panel.querySelector('[data-f-price-days]')?.value)||7;
 const top10=!!panel.querySelector('[data-f-top10]')?.checked,gaps=!!panel.querySelector('[data-f-gaps]')?.checked,mrc=!!panel.querySelector('[data-f-mrc]')?.checked;
 const all=Array.isArray(d.rows)?d.rows:[],base=all.filter(r=>!scope||r.scope_key===scope),ownMap=listingRowsMap(listing);
 const rows=base.filter(r=>{
  if(brand&&String(r.brand||'')!==brand)return false;
  if(competitorKind==='main'&&r.is_main_competitor!==true)return false;
  if(competitorKind==='market'&&r.is_main_competitor!==false)return false;
  if(status&&(r.is_main_competitor===false||r.status!==status))return false;
  if(sku&&!String(r.our_sku||'').toLowerCase().includes(sku))return false;
  if(top10&&N(r.position)>10)return false;
  if(gaps&&!r.is_gap)return false;
  if(mrc&&!(N(r.mrc_delta_pct)<0))return false;
  if(priceTrend&&competitorPriceTrend(r,priceDays).kind!==priceTrend)return false;
  if(trend){
   if(r.is_gap||!r.our_sku)return false;
   const l=ownMap.get(listingKey(r.scope_key,r.our_sku));
   if(!l)return false;
   if(trend==='outside'&&l.listing_state!=='outside_top120')return false;
   if(trend!=='outside'&&l.trend!==trend)return false;
  }
  return true;
 });
 panel.querySelectorAll('[data-scope-card]').forEach(x=>{x.style.display=!scope||x.getAttribute('data-scope-card')===scope?'':'none'});
 const holder=panel.querySelector('[data-tm224-rows]');
 holder.innerHTML=rows.length?rows.map(r=>rowHtml(r,ownMap,days,priceDays)).join(''):'<div class="tm224-empty">По выбранным фильтрам ничего нет.</div>';
 panel.querySelector('[data-tm224-count]').textContent='Показано '+rows.length+' из '+base.length+' · полный список без ограничений по менеджеру';
}
function loadXlsx(){
 if(window.XLSX)return Promise.resolve(window.XLSX);
 if(xlsxFlight)return xlsxFlight;
 xlsxFlight=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';s.onload=()=>window.XLSX?resolve(window.XLSX):reject(Error('Excel модуль не загрузился'));s.onerror=()=>reject(Error('Не удалось загрузить Excel модуль'));document.head.appendChild(s)}).finally(()=>xlsxFlight=null);
 return xlsxFlight;
}
async function exportKind(kind){
 const all=[];for(let off=0;;off+=500){const d=await rpc('triovist_market_export_v236224',{p_kind:kind,p_offset:off,p_limit:500});const rows=Array.isArray(d.rows)?d.rows:[];all.push(...rows);if(!d.has_more||!rows.length)break}return all;
}
async function exportExcel(btn){
 if(exportFlight)return exportFlight;
 exportFlight=(async()=>{
  const old=btn?.textContent;if(btn){btn.disabled=true;btn.textContent='⏳ Готовлю Excel…'}
  try{
   const [XLSX,summary,comparison,raw,gaps,errors]=await Promise.all([loadXlsx(),exportKind('summary'),exportKind('comparison'),exportKind('raw'),exportKind('gaps'),exportKind('errors')]);
   const wb=XLSX.utils.book_new();
   for(const [name,rows] of [['Сводка',summary],['Сравнение',comparison],['Конкуренты RAW',raw],['Пробелы ассортимента',gaps],['Ошибки данных',errors]]){
    const ws=XLSX.utils.json_to_sheet(rows);ws['!cols']=Object.keys(rows[0]||{}).map(k=>({wch:Math.min(55,Math.max(12,String(k).length+4))}));if(rows.length)ws['!autofilter']={ref:ws['!ref']};XLSX.utils.book_append_sheet(wb,ws,name);
   }
   XLSX.writeFile(wb,'Triovist_21vek_Конкуренты_'+new Date().toISOString().slice(0,10)+'.xlsx',{compression:true});
  }catch(e){alert('Не удалось выгрузить конкурентный анализ: '+(e?.message||e))}
  finally{if(btn){btn.disabled=false;btn.textContent=old||'📥 Выгрузить конкурентный анализ Excel'}}
 })().finally(()=>exportFlight=null);return exportFlight;
}
function render(panel,d,listing){
 css();
 const s=d.summary||{},scopes=Array.isArray(d.scopes)?d.scopes:[],rows=Array.isArray(d.rows)?d.rows:[],run=d.last_run||{},summaryMap=listingSummaryMap(listing);
 const brands=[...new Set(rows.map(r=>String(r.brand||'')).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
 const pd=N(listing?.period_days)||7;
 panel.innerHTML='<div class="tm224-head"><div><h3 style="margin:0">⚔️ Конкуренты 21vek · рынок TOP-2</h3><div class="tm224-note">Позиции конкурентов и наших товаров снимаются из одного и того же листинга 21vek по популярности. <b>Паюшин, Сидорович, Александренко и Кришталь видят одинаковый полный рынок без ограничения по зонам менеджеров.</b> Для бензопил основной конкурентный вывод строится только по отмеченным прямым конкурентам; остальные бренды остаются видимыми как ориентир рынка.</div></div><div class="tm224-actions"><button class="tr14-refresh" data-tm224-export>📥 Выгрузить конкурентный анализ Excel</button><button class="tr14-refresh" data-tm224-refresh>↻ Обновить</button></div></div>'
  +'<div class="tm224-kpi"><div><span>Категорий</span><b>'+E(s.scopes??0)+'</b></div><div><span>Товаров конкурентов</span><b>'+E(s.products??0)+'</b></div><div><span>Брендов</span><b>'+E(s.brands??0)+'</b></div><div><span>Мы сильнее</span><b class="good">'+E(s.ours_stronger??0)+'</b></div><div><span>Паритет</span><b class="warn">'+E(s.parity??0)+'</b></div><div><span>Конкурент сильнее</span><b class="bad">'+E(s.competitor_stronger??0)+'</b></div><div><span>Пробелы</span><b class="warn">'+E(s.gaps??0)+'</b></div><div><span>Ниже МРЦ</span><b class="'+((s.below_mrc||0)>0?'bad':'good')+'">'+E(s.below_mrc??0)+'</b></div></div>'
  +'<div class="tm224-filters"><select data-f-scope><option value="">Все подгруппы</option>'+scopes.map(x=>'<option value="'+E(x.scope_key)+'">'+E(x.subgroup)+'</option>').join('')+'</select><select data-f-brand><option value="">Все бренды</option>'+brands.map(x=>'<option>'+E(x)+'</option>').join('')+'</select><select data-f-status><option value="">Любой итог</option><option value="ours_stronger">Мы сильнее</option><option value="parity">Паритет</option><option value="competitor_stronger">Конкурент сильнее</option></select><select data-f-competitor-kind><option value="all">Все конкуренты</option><option value="main">Только основные</option><option value="market">Остальной рынок</option></select><select data-f-price-days><option value="3">Цена: 3 дня</option><option value="7" selected>Цена: 7 дней</option><option value="10">Цена: 10 дней</option><option value="14">Цена: 14 дней</option><option value="20">Цена: 20 дней</option><option value="30">Цена: 30 дней</option></select><select data-f-price-trend><option value="">Цена конкурента: все</option><option value="down">🔻 Снизил цену</option><option value="up">🔺 Поднял цену</option><option value="stable">→ Без изменений</option><option value="no_history">Нет истории цены</option></select><select data-f-days><option value="1">Наш листинг: 1 день</option><option value="3">Наш листинг: 3 дня</option><option value="7">Наш листинг: 7 дней</option><option value="14">Наш листинг: 14 дней</option><option value="30">Наш листинг: 30 дней</option></select><select data-f-trend><option value="">Наш листинг: все</option><option value="up">Растём</option><option value="down">Падаем</option><option value="stable">Без изменений</option><option value="outside">Вне TOP-120</option><option value="new">Новый в TOP-120</option></select><input data-f-sku placeholder="Наш SKU"><div class="tm224-toggles"><label><input type="checkbox" data-f-top10> только TOP-10 конкурентов</label><label><input type="checkbox" data-f-gaps> только пробелы</label><label><input type="checkbox" data-f-mrc> только ниже МРЦ</label><b data-tm224-count></b></div></div>'
  +scopes.map(x=>scopeHtml(x,summaryMap)).join('')+'<div data-tm224-rows></div>'
  +'<div class="tm224-meta">Последний сбор: <b>'+E(run.status||'ещё не запускался')+'</b> · '+dt(run.finished_at||run.started_at)+' · конкурентных товаров '+E(run.competitor_count??0)+' · сравнений '+E(run.comparison_count??0)+' · пробелов '+E(run.gap_count??0)+' · ошибок '+E(run.error_count??0)+'. Наш листинг: страница 1 = места 1–60, страница 2 = 61–120; если карточка есть, но товар не найден на двух страницах, показываем >120.</div>';
 const daySel=panel.querySelector('[data-f-days]');if(daySel)daySel.value=String(pd);
 refreshBrandOptions(panel,{...d,rows});
 applyFilters(panel,{...d,rows},listing);
 panel.querySelector('[data-f-scope]')?.addEventListener('change',()=>{refreshBrandOptions(panel,d);applyFilters(panel,d,listing)});
 panel.querySelectorAll('[data-f-brand],[data-f-status],[data-f-competitor-kind],[data-f-sku],[data-f-trend],[data-f-price-days],[data-f-price-trend],[data-f-top10],[data-f-gaps],[data-f-mrc]').forEach(x=>x.addEventListener(x.tagName==='INPUT'&&x.type==='text'?'input':'change',()=>applyFilters(panel,d,listing)));
 panel.querySelector('[data-f-days]')?.addEventListener('change',async e=>{
   const days=N(e.currentTarget.value)||7;e.currentTarget.disabled=true;
   try{listing=await loadListing(days,false);applyFilters(panel,d,listing)}
   catch(err){alert('Не удалось загрузить историю нашего листинга: '+(err?.message||err))}
   finally{e.currentTarget.disabled=false}
 });
 panel.querySelector('[data-tm224-refresh]')?.addEventListener('click',async()=>{last=null;lastAt=0;listingCache.clear();await open(panel,null,true)});
 panel.querySelector('[data-tm224-export]')?.addEventListener('click',e=>exportExcel(e.currentTarget));
}
async function open(panel,ctx,force=false){
 if(!panel)return;panel.style.setProperty('display','block','important');panel.innerHTML='<div class="tr14-info">Загружаю автоматический анализ рынка и наш листинг 21vek…</div>';
 try{
  const [dash,listing]=await Promise.all([load(force),loadListing(7,force)]);
  render(panel,dash,listing);
 }catch(e){panel.innerHTML='<div class="tr14-warn"><b>Конкурентный анализ пока недоступен.</b><br>'+E(e?.message||e)+'</div>'}
}
window.RESANTA_TRIOVIST_COMPETITORS_V236218=Object.freeze({version:V,open,refresh:()=>{last=null;lastAt=0;listingCache.clear();return Promise.all([load(true),loadListing(7,true)])},automaticMarket:true,positionHistory:true,competitorPriceHistory:true,competitorPriceFilters:[3,7,10,14,20,30],sprayerProfile:true,impactWrenchProfile:true,circularSawProfile:true,impactDrillProfile:true,cordlessScrewdriverProfile:true,paintSprayerProfile:true,jigsawProfile:true,ownListingHistory:true,fullMarketAccess:true,mainCompetitorModel:true,excel:true});
})();