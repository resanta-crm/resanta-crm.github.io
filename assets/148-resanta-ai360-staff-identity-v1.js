/* Shared frontend role discovery only. Real authorization is repeated on each
   Supabase Edge invocation; no role claim from this JS authorizes database access. */
(function(root){
'use strict';
if(root.crmAI360StaffIdentityV1)return;
const STAFF=Object.freeze({
 'ba55dfe5-7e48-4f1f-b40e-674c7752fe1a':{name:'Сидарович К.Н.',role:'boss',region:'Витебск',tier:'branch_director'},
 '19dd9943-99ae-47c4-a39c-4f82a11059a6':{name:'Руднев',role:'manager',region:'Витебск',tier:'field_manager'},
 '3d935a76-c6fe-44b6-b248-fcbe58c6bf1c':{name:'Ачинович',role:'manager',region:'Витебск',tier:'field_manager'},
 '4fd79fa0-232d-4768-8099-25f47923cc4f':{name:'Шкуран',role:'manager',region:'Витебск',tier:'field_manager'},
 '6efa656e-45c6-473b-a853-89eccb9ee43a':{name:'Александренко',role:'manager',region:'Триовист / 21vek.by',tier:'triovist_category'},
 '9076ccde-a8cc-47e3-b71e-c31170b693ff':{name:'Кришталь',role:'manager',region:'Триовист / 21vek.by',tier:'triovist_category'}
});
const norm=x=>String(x||'').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/\s+/g,' ');
root.crmAI360StaffIdentityV1=()=>{
 try{
  if(typeof currentUser==='undefined'||typeof currentProfile==='undefined'||
     document.getElementById('app')?.style.display==='none')return null;
  const p=STAFF[currentUser?.id];
  if(!p||currentProfile?.role!==p.role||currentProfile?.region!==p.region||
      norm(currentProfile?.name)!==norm(p.name))return null;
  return Object.freeze({...p,id:currentUser.id,can_create_tasks:p.tier==='branch_director'});
 }catch{return null;}
};
})(window);
