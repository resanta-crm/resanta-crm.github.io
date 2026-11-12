/* Access 360 · Self-service corporate email invitations. Server is authority. */
(function(){
'use strict';if(window.crmAccess360)return;
const OWNER="544fb1e2-ef70-44de-bc62-e0e1596a4bfc";
const roles=[["executive_viewer","Руководство компании · просмотр"],["manager","МПП / менеджер"],["office_manager","Офис-менеджер"],["service_manager","Сервисный центр"],["auditor","Ревизор"]];
const regions=["Все филиалы","Витебск","Могилёв","Гомель","ЦО","Триовист / 21vek.by"];
const state={people:[],invites:[],history:[],loading:false,error:""};
const el=id=>document.getElementById(id);
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const mine=()=>typeof currentProfile!=="undefined"&&currentProfile?.id===OWNER;
const client=()=>typeof db!=="undefined"?db:window.db;
async function api(body){
 const {data,error}=await client().functions.invoke("crm-access-admin-v1",{body});
 if(error){let desc="Сервис доступов недоступен";try{desc=(await error.context?.json())?.error||desc}catch(_){}
 throw new Error(desc)}
 if(!data?.ok)throw new Error(data?.error||"Не удалось сохранить");
 return data;
}
function prepare(){
 const page=el("page-users");if(!page||!mine())return null;
 if(!el("a360-style")){const s=document.createElement("style");s.id="a360-style";s.textContent="#page-users>#access360-root~*{display:none!important}#access360-root{color:#101828}.a360-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}.a360-head h2{font-size:23px;margin:0}.a360-head p,.a360-muted{font-size:12px;color:#667085;line-height:1.5}.a360-btn{border:1px solid #d0d5dd;border-radius:10px;padding:10px 13px;background:white;cursor:pointer}.a360-red{background:#c7192d;color:#fff;border-color:#c7192d}.a360-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:14px 0}.a360-card{padding:13px;border:1px solid #e4e7ec;border-radius:13px;background:white;margin-bottom:12px}.a360-card b{font-size:24px}.a360-card h3{font-size:15px;margin:0 0 9px}.a360-person{display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid #e5e7eb;padding:12px 3px}.a360-person:last-child{border-bottom:0}.a360-person strong{font-size:13px}.a360-person small{display:block;color:#667085;font-size:11px;margin-top:5px}.a360-person .a360-btn{font-size:11px}.a360-shade{position:fixed;inset:0;background:#10182899;z-index:15000;display:grid;place-items:center;padding:10px}.a360-modal{background:white;border-radius:16px;width:min(460px,95vw);padding:19px;max-height:95dvh;overflow:auto}.a360-modal h3{margin:0 0 12px}.a360-field{margin:12px 0}.a360-field label{display:block;font-size:12px;font-weight:750;margin:0 0 5px}.a360-field input,.a360-field select{box-sizing:border-box;width:100%;padding:10px;border:1px solid #d0d5dd;border-radius:8px;font-size:14px;background:#fff}.a360-actions{display:flex;flex-wrap:wrap;gap:6px}.a360-error{color:#b42318;background:#fff0f0;border-radius:9px;padding:10px}.a360-chip{display:inline-block;background:#f2f4f7;border-radius:99px;padding:4px 8px;font-size:10px}@media(max-width:650px){.a360-cards{grid-template-columns:1fr 1fr}.a360-person{align-items:flex-start;flex-direction:column}}";document.head.appendChild(s)}
 let root=el("access360-root");if(!root){root=document.createElement("div");root.id="access360-root";page.prepend(root)}return root;
}
function render(){
 const root=prepare();if(!root)return;const n=state.people.length;
 const roleName=x=>roles.find(v=>v[0]===x)?.[1]||x;
 root.innerHTML='<div class="a360-head"><div><h2>🔐 Пользователи и роли 360°</h2><p>Почтовые приглашения · Роли · Филиалы · История</p></div>'+
 '<div class="a360-actions"><button class="a360-btn" data-a360-refresh>↻ Обновить</button><button class="a360-btn a360-red" data-a360-invite>+ Пригласить сотрудника</button></div></div>'+
 (state.error?'<p class="a360-error">'+esc(state.error)+'</p>':'')+
 '<div class="a360-cards">'+[["Сотрудники",n],["Руководство · просмотр",state.people.filter(x=>x.role==="executive_viewer").length],["Приглашения",state.invites.length]].map(x=>
 '<div class="a360-card"><span class="a360-muted">'+x[0]+'</span><br><b>'+x[1]+'</b></div>').join("")+'</div>'+
 '<div class="a360-card"><h3>Сотрудники и доступы</h3>'+
 (state.loading?'<p class="a360-muted">Загружаю с сервера…</p>':state.people.map(p=>
 '<div class="a360-person"><div><strong>'+esc(p.name||p.email)+'</strong><small>'+esc(p.email)+' · '+esc(p.region||"—")+
 ' · <span class="a360-chip">'+esc(roleName(p.role))+'</span></small></div>'+
 (p.id===OWNER||p.role==="boss"?'<span class="a360-chip">Защищённая роль</span>':
 '<div class="a360-actions"><button class="a360-btn" data-a360-edit="'+esc(p.email)+'">Настроить</button>'+
 (p.role==="disabled"?"":'<button class="a360-btn" data-a360-disable="'+esc(p.email)+'">Отключить</button>')+'</div>')+'</div>').join(""))+'</div>'+
 '<div class="a360-card"><h3>Приглашения</h3>'+(
 state.invites.length?state.invites.map(i=>'<div class="a360-person"><div><strong>'+esc(i.email)+'</strong><small>'+
 esc(roleName(i.requested_role))+' · '+esc(i.region)+' · '+esc(i.status)+'</small></div></div>').join(""):
 '<p class="a360-muted">Пока не отправлялись.</p>')+'</div>'+
 '<details class="a360-card"><summary>Журнал изменения прав</summary>'+
 state.history.map(i=>'<p class="a360-muted">'+esc(new Date(i.created_at).toLocaleString("ru-RU"))+' · '+
 esc(i.target_email)+' · '+esc(i.action)+' · '+esc(i.old_role||"—")+' → '+esc(i.new_role||"—")+'</p>').join("")+'</details>'+
 '<p class="a360-muted">Руководство компании получает отдельный режим только для просмотра. Права обычного директора филиала не назначаются автоматически.</p>';
}
async function refresh(){if(!mine())return;state.loading=true;state.error="";render();
 try{const response=await api({action:"list"});state.people=response.people||[];state.invites=response.invites||[];state.history=response.history||[]}
 catch(e){state.error=e.message||String(e)}finally{state.loading=false;render()}}
function modal(initial,edit){
 el("a360-overlay")?.remove();const role=initial.role||"executive_viewer";
 const option=(values,chosen)=>values.map(x=>'<option value="'+esc(x[0])+'" '+(x[0]===chosen?'selected':'')+'>'+esc(x[1])+'</option>').join("");
 const box=document.createElement("div");box.id="a360-overlay";box.className="a360-shade";
 box.innerHTML='<section class="a360-modal" role="dialog" aria-modal="true"><h3>'+esc(edit?"Настроить доступ":"Пригласить сотрудника")+'</h3>'+
 '<div class="a360-field"><label>Имя</label><input id="a360-name" value="'+esc(initial.name||"")+'"></div>'+
 '<div class="a360-field"><label>Почта</label><input id="a360-email" type="email" value="'+esc(initial.email||"")+'" '+(edit?"readonly":"")+'></div>'+
 '<div class="a360-field"><label>Роль</label><select id="a360-role">'+option(roles,role)+'</select></div>'+
 '<div class="a360-field"><label>Филиал</label><select id="a360-region">'+option(regions.map(x=>[x,x]),initial.region||"Все филиалы")+'</select></div>'+
 '<p class="a360-muted">'+(edit?"Изменение фиксируется в журнале. Повышение до администратора запрещено.":"Приглашение отправляется на почту. До выдачи роли нового доступа нет.")+'</p>'+
 '<p class="a360-error" id="a360-form-error" hidden></p>'+
 '<div class="a360-actions" style="justify-content:flex-end"><button class="a360-btn" data-a360-close>Отмена</button><button class="a360-btn a360-red" id="a360-submit">Сохранить</button></div></section>';
 document.body.appendChild(box);
 el("a360-role").addEventListener("change",()=>{if(el("a360-role").value==="executive_viewer")el("a360-region").value="Все филиалы"});
 el("a360-submit").addEventListener("click",async()=>{
  const btn=el("a360-submit"),err=el("a360-form-error");btn.disabled=true;btn.textContent="Проверяю…";
  const payload={action:edit?"update":"invite",email:el("a360-email").value, name:el("a360-name").value,
   role:el("a360-role").value,region:el("a360-region").value};
  try{await api(payload);box.remove();await refresh();alert(edit?"Права сохранены.":"Приглашение отправлено на почту.")}
  catch(e){err.hidden=false;err.textContent=e.message||String(e)}
  finally{btn.disabled=false;btn.textContent="Сохранить"}
 });
}
function openInvite(){modal({email:"petrovichev@resanta.ru",name:"Руководство компании",role:"executive_viewer",region:"Все филиалы"},false)}
document.addEventListener("click",e=>{
 const b=e.target.closest?.("[data-a360-invite]");if(b){openInvite();return}
 if(e.target.closest?.("[data-a360-refresh]")){refresh();return}
 const ed=e.target.closest?.("[data-a360-edit]");if(ed){const p=state.people.find(x=>x.email===ed.dataset.a360Edit);if(p)modal(p,true);return}
 const del=e.target.closest?.("[data-a360-disable]");if(del){const email=del.dataset.a360Disable;
 if(confirm("Отключить доступ "+email+"?"))api({action:"disable",email}).then(refresh).catch(e=>alert(e.message));return}
 if(e.target.closest?.("[data-a360-close]")){el("a360-overlay")?.remove()}
});
document.addEventListener("keydown",e=>{if(e.key==="Escape")el("a360-overlay")?.remove()});
window.crmAccess360={render:refresh,openInvite,ready:true};
})();
