/* Lera 360 private text history / corrections (no audio).
 * All actions use JWT+principal-verified Edge gateway, never client SQL.
 */
(function(root){
 'use strict';
 if(root.crmAI360HistoryUIV1)return;
 const API='crm-ai360-agent-v1';
 const CATEGORIES=['Неверные данные','Не поняла вопрос','Ошибка озвучки','Неудобный интерфейс','Другое'];
 function element(tag,text,css){
  const e=document.createElement(tag);
  if(text!==undefined)e.textContent=text;
  if(css)e.style.cssText=css;
  return e;
 }
 function mount(host,options={}){
  if(!host||typeof host.appendChild!=='function')return null;
  if(host.querySelector?.('[data-lera-history-ui="v1"]'))return null;
  // An in-place account switch must never reuse a previous person's DOM
  // history. Bind this mount to the exact authenticated CRM identity.
  const currentId=()=>{try{
   return typeof currentUser!=='undefined'?String(currentUser?.id||''):'';
  }catch{return '';}};
  const ownerId=currentId();
  // CRM uses a global lexical 'const db' (not necessarily window.db).
  const crm=()=>{try{return typeof db!=='undefined'?db:root.db;}catch{return root.db;}};
  const permitted=()=>{try{
   return !!ownerId&&currentId()===ownerId&&options.allowed?.()===true;
  }catch{return false;}};
  const wrapper=element('details',undefined,
   'font-size:12px;color:#31577c;border:1px solid #d3e2f1;border-radius:10px;padding:8px;background:#f8fbff;min-width:190px;max-height:290px;overflow:auto');
  wrapper.setAttribute('data-lera-history-ui','v1');
  const summary=element('summary','🕘 История разговоров');
  summary.style.cssText='cursor:pointer;font-weight:650;user-select:none';
  const body=element('div',undefined,'display:grid;gap:8px;margin-top:8px;');
  const note=element('small',
   'Личные тексты хранятся 30 дней. Аудио не сохраняется. Исправления — подсказки для будущих бесед, не изменения данных CRM.',
   'color:#607d96;line-height:1.45');
  const status=element('div','Открой историю, чтобы проверить сохранение.',
    'font-size:11px;color:#456989');
  status.setAttribute('role','status');
  const toolbar=element('div',undefined,'display:flex;gap:6px;flex-wrap:wrap;');
  function button(label,fn){
   const el=element('button',label,
    'border:1px solid #abc6e1;background:white;color:#24517c;padding:6px 9px;border-radius:7px;cursor:pointer;font-size:11px;');
   el.type='button';el.addEventListener('click',()=>void fn(el));return el;
  }
  let enabled=false,loading=false;
  const toggle=button('Включить личную историю',async el=>{
   if(!permitted())return;
   if(enabled && !root.confirm?.('Выключить память Леры и безвозвратно удалить сохранённую переписку?'))return;
   await busyCall(async()=>{
    const r=await invoke('history:enable',{enabled:!enabled});
    enabled=r.history_enabled===true;
    status.textContent=enabled?'Личная память включена.':'Память выключена, прежние записи удалены.';
    await render();
   },el);
  });
  const reload=button('Обновить',async el=>busyCall(render,el));
  const clear=button('Удалить всё',async el=>{
   if(!permitted()||!enabled)return;
   if(!root.confirm?.('Удалить всю сохранённую переписку Леры? Это действие нельзя отменить.'))return;
   await busyCall(async()=>{await invoke('history:clear');await render();},el);
  });
  toolbar.append(toggle,reload,clear);
  const list=element('div',undefined,'display:grid;gap:7px;max-height:215px;overflow:auto;');
  async function invoke(action,data={}){
   if(!permitted())throw Error('Проверь вход в CRM.');
   const session=typeof root.crmEnsureFreshSessionV236166==='function'
    ?await root.crmEnsureFreshSessionV236166(false)
    :await crm()?.auth?.getSession?.().then(x=>x?.data?.session);
   if(!session?.access_token)throw Error('Сессия истекла. Войди заново.');
   const res=await crm().functions.invoke(API,{body:{action,...data}});
   if(res.error||res.data?.error){
    let code=String(res.data?.error||'');
    if(!code&&res.error?.context?.json){try{code=String((await res.error.context.json())?.error||'');}catch{}}
    if(code==='history_optin_required')throw Error('Сначала включи личную историю.');
    if(code==='history_unavailable')throw Error('История временно недоступна.');
    throw Error('Не удалось выполнить действие с историей. Повтори позже.');
   }
   return res.data||{};
  }
  async function busyCall(work,btn){
   if(loading||!permitted())return;
   loading=true;
   const buttons=[toggle,reload,clear];
   for(const b of buttons)b.disabled=true;
   if(btn)btn.disabled=true;
   try{await work();}catch(e){status.textContent=String(e?.message||'Ошибка истории').slice(0,140);}
   finally{loading=false;for(const b of buttons)b.disabled=false;}
  }
  function card(item){
   const box=element('article',undefined,
    'padding:8px;background:white;border:1px solid #dbe7f4;border-radius:8px;display:grid;gap:5px;overflow-wrap:anywhere');
   const stamp=element('small',
    (item.mode==='crm'?'CRM · ':'Беседа · ')+
    (item.created_at?new Date(item.created_at).toLocaleString('ru-RU'):''),
    'color:#567491');
   const q=element('div','Ты: '+String(item.question||''),'font-weight:600;white-space:pre-wrap');
   const a=element('div','Лера: '+String(item.answer||''),'white-space:pre-wrap');
   const fb=button(item.feedback_type?'Изменить замечание':'Отметить ошибку',()=>{});
   const form=element('div',undefined,'display:none;gap:6px;margin-top:4px');
   const select=element('select',undefined,
    'padding:6px;border:1px solid #b9ccdf;border-radius:7px;width:100%;background:white;color:#173650');
   for(const category of CATEGORIES){const opt=element('option',category);opt.value=category;select.appendChild(opt);}
   if(CATEGORIES.includes(item.feedback_type))select.value=item.feedback_type;
   const textarea=element('textarea',undefined,
    'padding:7px;border:1px solid #b9ccdf;border-radius:7px;min-height:56px;resize:vertical;width:100%;box-sizing:border-box;');
   textarea.maxLength=500;
   textarea.placeholder='Что было неверно и как лучше ответить?';
   textarea.value=String(item.feedback_note||'');
   const save=button('Сохранить исправление',async el=>{
    if(!item.id||loading)return;
    await busyCall(async()=>{
     await invoke('history:feedback',{
      turn_id:item.id,feedback_type:select.value,feedback_note:textarea.value.slice(0,500)
     });
     status.textContent='Замечание сохранено. Оно не меняет данные CRM.';
     form.style.display='none';
     fb.textContent='Изменить замечание';
    },el);
   });
   form.append(select,textarea,save);
   fb.addEventListener('click',()=>{form.style.display=form.style.display==='none'?'grid':'none';});
   box.append(stamp,q,a,fb,form);
   return box;
  }
  async function render(){
   const setting=await invoke('history:status');
   enabled=setting.history_enabled===true;
   toggle.textContent=enabled?'Отключить и удалить историю':'Включить личную историю';
   reload.hidden=!enabled;clear.hidden=!enabled;
   list.replaceChildren();
   if(!enabled){status.textContent='История выключена. Включается только по твоему согласию.';return;}
   const result=await invoke('history:list',{limit:40});
   const turns=Array.isArray(result.turns)?result.turns:[];
   status.textContent=turns.length?'Сохранено записей: '+turns.length+' (показаны последние 40).':
    'Личная память включена. Новые вопросы появятся здесь после ответа Леры.';
   for(const item of turns)list.appendChild(card(item));
  }
  // Clear visible confidential transcript on logout/account switch.
  crm()?.auth?.onAuthStateChange?.((_event,session)=>{
   if(session?.user?.id!==ownerId){
    list.replaceChildren();enabled=false;wrapper.open=false;
    status.textContent='Сессия изменилась. Открой CRM заново.';
   }
  });
  wrapper.addEventListener('toggle',()=>{if(wrapper.open)void busyCall(render);});
  body.append(note,toolbar,status,list);wrapper.append(summary,body);
  host.appendChild(wrapper);
  return wrapper;
 }
 root.crmAI360HistoryUIV1=Object.freeze({mount});
})(window);
