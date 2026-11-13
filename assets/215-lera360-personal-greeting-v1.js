/* Lera's per-account opt-in welcome. DISPLAY ONLY; no authorization or network calls.
 * Backend remains responsible for checking current JWT, roles and CRM data.
 */
(function(root){
 'use strict';
 if(root.crmAI360GreetingV1)return;
 const profiles=Object.freeze({
  '544fb1e2-ef70-44de-bc62-e0e1596a4bfc':{name:'Александр Паюшин',role:'boss',region:'Витебск',address:'Александр'},
  'ba55dfe5-7e48-4f1f-b40e-674c7752fe1a':{name:'Сидарович К.Н.',role:'boss',region:'Витебск',address:'Кирилл'},
  '19dd9943-99ae-47c4-a39c-4f82a11059a6':{name:'Руднев',role:'manager',region:'Витебск',address:'Александр'},
  '3d935a76-c6fe-44b6-b248-fcbe58c6bf1c':{name:'Ачинович',role:'manager',region:'Витебск',address:'Екатерина'},
  '4fd79fa0-232d-4768-8099-25f47923cc4f':{name:'Шкуран',role:'manager',region:'Витебск',address:'Татьяна'},
  '6efa656e-45c6-473b-a853-89eccb9ee43a':{name:'Александренко',role:'manager',region:'Триовист / 21vek.by',address:'Александр'},
  '9076ccde-a8cc-47e3-b71e-c31170b693ff':{name:'Кришталь',role:'manager',region:'Триовист / 21vek.by',address:'Наталья'},
  'a24954b8-2fe1-4852-b629-d8f351e1bd36':{name:'Руководство компании',role:'boss',region:'Все филиалы',
    email:'petrovichev@resanta.ru',scope:'standard',address:'Виталий'}
 });
 const norm=x=>String(x||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ru-RU').replaceAll('ё','е');
 function identity(){
  try{
   if(typeof currentUser==='undefined'||typeof currentProfile==='undefined'||
      !currentUser?.id||document.getElementById('app')?.style.display==='none')return null;
   const p=profiles[currentUser.id];
   if(!p||norm(currentProfile.name)!==norm(p.name)||currentProfile.role!==p.role||
      currentProfile.region!==p.region)return null;
   if(p.email&&(norm(currentUser.email)!==p.email||norm(currentProfile.email)!==p.email||
     currentProfile.access_scope!==p.scope))return null;
   return Object.freeze({id:currentUser.id,address:p.address,
     greeting:'Здравствуйте, '+p.address+'. Чем могу помочь?'});
  }catch{return null;}
 }
 root.crmAI360GreetingV1=identity;
 root.crmAI360IsExecutivePeerV1=()=>identity()?.id==='a24954b8-2fe1-4852-b629-d8f351e1bd36';
})(window);
