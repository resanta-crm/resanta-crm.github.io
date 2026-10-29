/* Field manager personal fuel mileage. Director GPS reports remain unchanged. */
(function(root){'use strict';
if(root.crmMyMileageV1)return;
const IDS=new Map([['Руднев','19dd9943-99ae-47c4-a39c-4f82a11059a6'],
 ['Ачинович','3d935a76-c6fe-44b6-b248-fcbe58c6bf1c'],
 ['Шкуран','4fd79fa0-232d-4768-8099-25f47923cc4f']]);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const km=v=>Number(v||0).toLocaleString('ru-RU',{maximumFractionDigits:1})+' км';
let button=null,windowEl=null,busy=false;
function mine(){try{const p=currentProfile,u=currentUser;
 return p?.role==='manager'&&p.region==='Витебск'&&IDS.get(p.name)===u?.id&&
 document.getElementById('app')?.style.display!=='none';}catch{return false;}}
function monthNow(){
 const d=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Minsk',year:'numeric',month:'2-digit'}).format(new Date());
 return d;
}
function mount(){
 if(!mine())return;
 const route=document.getElementById('page-route'),workday=document.getElementById('page-workday');
 if(route&&!document.getElementById('my-mileage-open-v1')){
  button=document.createElement('button');button.id='my-mileage-open-v1';
  button.className='btn-secondary';button.textContent='🚗 Мой пробег / ГСМ';
  button.style.cssText='margin:7px 0 14px';button.addEventListener('click',open);
  route.insertBefore(button,route.children[1]||null);
 }
 if(workday&&!document.getElementById('my-mileage-workday-v1')){
  const btn=document.createElement('button');btn.id='my-mileage-workday-v1';
  btn.className='btn-secondary';btn.textContent='🚗 Мой пробег';
  btn.addEventListener('click',open);workday.insertBefore(btn,workday.children[1]||null);
 }
}
function ensure(){
 if(windowEl)return;
 windowEl=document.createElement('div');windowEl.id='my-mileage-modal-v1';windowEl.className='modal-bg';
 windowEl.innerHTML='<div class="modal" style="width:min(94vw,800px);max-height:90vh;overflow:auto">'+
 '<div style="display:flex;justify-content:space-between;gap:12px"><h3>🚗 Мой пробег и топливо</h3>'+
 '<button class="btn-secondary" id="my-mileage-close-v1">Закрыть</button></div>'+
 '<label>Месяц <input class="form-input" type="month" id="my-mileage-month-v1"></label>'+
 '<button class="btn-secondary" id="my-mileage-refresh-v1">↻ Обновить</button>'+
 '<div id="my-mileage-content-v1" style="margin-top:14px"></div></div>';
 document.body.appendChild(windowEl);
 windowEl.querySelector('#my-mileage-close-v1').addEventListener('click',close);
 windowEl.querySelector('#my-mileage-refresh-v1').addEventListener('click',load);
 windowEl.querySelector('#my-mileage-month-v1').addEventListener('change',load);
}
function close(){windowEl?.classList.remove('open');}
async function open(){
 if(!mine())return;ensure();windowEl.querySelector('#my-mileage-month-v1').value=monthNow();
 windowEl.classList.add('open');await load();
}
async function load(){
 if(!mine()||busy||!windowEl?.classList.contains('open'))return;
 busy=true;const content=windowEl.querySelector('#my-mileage-content-v1');
 content.textContent='Проверяю свои GPS-дни и нормы топлива…';
 try{
  const session=await db.auth.getSession();if(!session.data?.session?.access_token)throw Error('Войдите в CRM');
  const month=windowEl.querySelector('#my-mileage-month-v1').value;
  const {data,error}=await db.functions.invoke('crm-my-mileage-v1',{body:{month}});
  if(error||data?.mode!=='my_gps_mileage_v1'||data.manager_name!==currentProfile?.name)throw Error('Нет подтверждённых данных GPS');
  const r=data,rows=r.days||[];
  content.innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">'+
   '<div class="card">Сегодня<b style="display:block;font-size:20px">'+(r.today_km===null?'—':km(r.today_km))+'</b></div>'+
   '<div class="card">За месяц<b style="display:block;font-size:20px">'+km(r.month_km)+'</b></div>'+
   '<div class="card">Расход по норме<b style="display:block;font-size:20px">'+
    (r.month_fuel_l==null?'Не задана норма':r.month_fuel_l+' л')+'</b></div>'+
   '<div class="card">Стоимость ГСМ<b style="display:block;font-size:20px">'+
    (r.month_fuel_cost_byn==null?'Нет цены':r.month_fuel_cost_byn+' бел. руб.')+'</b></div></div>'+
   '<p style="font-size:12px;color:var(--sub)">'+esc(r.warning)+
   (r.vehicle?' Авто: '+esc(r.vehicle):'')+
   (r.consumption_l_per_100km==null?' Норму расхода устанавливает руководитель.':' Норма: '+r.consumption_l_per_100km+' л/100 км.')+'</p>'+
   '<div style="overflow:auto"><table class="tbl"><thead><tr><th>Дата</th><th>Пробег</th><th>Сессий</th><th>Топливо</th><th>Статус</th></tr></thead><tbody>'+
   (rows.length?rows.map(x=>'<tr><td>'+esc(x.date)+'</td><td>'+km(x.distance_km)+'</td>'+
    '<td>'+Number(x.sessions||0)+'</td><td>'+(x.fuel_l==null?'—':Number(x.fuel_l)+' л')+'</td>'+
    '<td>'+(x.status==='ok'?'✓ Завершён':x.status==='incomplete'?'⏳ Предварительно':'⚠ Проверить')+'</td></tr>').join(''):
    '<tr><td colspan="5">GPS-дней в этом месяце нет.</td></tr>')+'</tbody></table></div>';
 }catch(e){content.textContent='Не удалось загрузить собственный пробег: '+String(e.message||e);}
 finally{busy=false;}
}
function reconcile(){
 if(mine())mount();
 else {if(button)button.style.display='none';close();}
}
reconcile();root.setInterval(reconcile,5000);
root.crmMyMileageV1={open,load,role:mine};
})(window);