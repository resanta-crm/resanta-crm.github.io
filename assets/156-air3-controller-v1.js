/* AIR3 controller: only the authenticated director's existing CRM session may create/approve/revoke. */
(()=>{'use strict';
 if(window.__air3ControllerV1)return;window.__air3ControllerV1=true;
 const END='https://baqchjtvtmcfzwjjluhs.supabase.co/functions/v1/crm-ai360-air3-gateway-v1';
 let visible=false,root,codeEl,requestsEl,noticeEl,watch=null;
 const el=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e;};
 const eligible=()=>{try{return typeof currentProfile!=='undefined'&&currentProfile?.role==='boss'&&String(currentProfile?.name||'').trim().toLowerCase()==='александр паюшин'&&document.getElementById('app')?.style.display!=='none'}catch{return false}};
 const error=e=>{if(noticeEl)noticeEl.textContent=String(e?.message||e)};
 async function call(action,data={}){
  const {data:s,error}=await db.auth.getSession();if(error||!s?.session?.access_token)throw Error('Сначала войдите в CRM');
  const res=await fetch(END,{method:'POST',cache:'no-store',headers:{'content-type':'application/json','authorization':'Bearer '+s.session.access_token},body:JSON.stringify({action,...data})});
  const value=await res.json();if(!res.ok||!value.ok)throw Error(value.error||'Ошибка запроса');return value;
 }
 function makeButton(title,handler){const b=el('button',title);b.type='button';b.style.cssText='padding:10px;border:1px solid #cbd5e1;background:#eef5ff;border-radius:9px;cursor:pointer';b.addEventListener('click',handler);return b;}
 async function refresh(){
  if(!visible)return;
  try{
   const res=await call('pending');
   requestsEl.replaceChildren();
   for(const p of res.items||[]){
    if(['revoked','rejected'].includes(p.status))continue;
    const row=el('div',new Date(p.created_at).toLocaleTimeString('ru-RU')+' · '+p.status);
    row.style.cssText='padding:9px;margin:8px 0;background:#f8fafc;border-radius:8px';
    if(p.status==='pending_approval'&&new Date(p.expires_at).getTime()>Date.now()){
      row.appendChild(makeButton('Разрешить вход',async()=>{try{await call('approve',{id:p.id});await refresh()}catch(e){error(e)}}));
    }
    if(['created','pending_approval','approved','redeemed'].includes(p.status)){
      row.appendChild(makeButton('Отключить',async()=>{try{await call('revoke',{id:p.id});await refresh()}catch(e){error(e)}}));
    }
    requestsEl.appendChild(row);
   }
   if(!requestsEl.childNodes.length)requestsEl.textContent='Активных заявок нет.';
  }catch(e){error(e)}
 }
 function open(){
  if(!eligible())return;visible=true;
  if(!root){
    root=el('div');root.style.cssText='position:fixed;z-index:999999;inset:0;background:#0009;display:flex;align-items:center;justify-content:center;padding:15px';
    const box=el('div');box.style.cssText='width:min(480px,100%);max-height:90vh;overflow:auto;background:white;color:#17253b;border-radius:15px;padding:24px;font:15px Arial,sans-serif;box-shadow:0 20px 60px #0003';
    box.appendChild(el('h2','INMO AIR3 · временный вход'));
    box.appendChild(el('p','Код действует 2 минуты. После ввода на очках подтвердите заявку здесь.'));
    codeEl=el('div','—');codeEl.style.cssText='font-size:32px;font-weight:800;letter-spacing:9px;text-align:center;padding:14px';box.appendChild(codeEl);
    const line=el('div');line.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
    line.append(makeButton('Создать код',async()=>{try{noticeEl.textContent='';const r=await call('create');codeEl.textContent=r.code;await refresh()}catch(e){error(e)}}));
    line.append(makeButton('Обновить заявки',refresh));
    line.append(makeButton('Закрыть окно',close));box.appendChild(line);
    noticeEl=el('div','');noticeEl.style.cssText='color:#b91c1c;padding:8px';box.append(noticeEl,el('h3','Подключения'));
    requestsEl=el('div');box.appendChild(requestsEl);root.appendChild(box);
  }
  document.body.appendChild(root);refresh();if(!watch)watch=setInterval(refresh,4000);
 }
 function close(){visible=false;if(watch){clearInterval(watch);watch=null}root?.remove();if(codeEl)codeEl.textContent='—'}
 function attach(){
  let btn=document.getElementById('air3-pair-launch');
  if(!eligible()){btn?.remove();close();return}
  if(btn)return;
  const bar=document.querySelector('#app .topbar');if(!bar)return;
  btn=makeButton('🥽 Подключить очки',open);btn.id='air3-pair-launch';
  bar.insertBefore(btn,bar.querySelector('.user-badge'));
 }
 attach();setInterval(attach,4500);
 window.addEventListener('pagehide',close);
})();