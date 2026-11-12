/* Resanta Lera 360 private TEXT history.
 * No audio recording. No direct table access. Server verifies JWT and owner ID.
 * Explicit opt-in; disabling or clearing purges only the current user's turns.
 */
(function(root){
 'use strict';
 if(root.crmAI360HistoryV1)return;
 const ENDPOINT='crm-ai360-agent-v1';
 const TYPES=['Неверные данные','Не поняла вопрос','Ошибка озвучки','Неудобный интерфейс','Другое'];
 let modal=null,enabled=false,selected=null,busy=false,notice=null,list=null,toggle=null,correction=null;
 function btn(label,callback,cls){
  const b=document.createElement('button');b.type='button';b.textContent=label;
  b.style.cssText='border:1px solid #bac9d8;border-radius:9px;background:#fff;color:#243b53;padding:8px 10px;cursor:pointer;font:inherit;';
  if(cls)b.className=cls;
  if(callback)b.addEventListener('click',callback);
  return b;
 }
 function div(text,css=''){
  const d=document.createElement('div');d.textContent=text||'';if(css)d.style.cssText=css;return d;
 }
 const setStatus=text=>{if(notice)notice.textContent=String(text||'');};
 async function call(action,extra={}){
  if(!root.db?.functions?.invoke&&!((typeof db!=='undefined')&&db?.functions?.invoke))
   throw Error('Пожалуйста, войди в CRM заново.');
  const client=root.db||(typeof db!=='undefined'?db:null);
  if(typeof root.crmEnsureFreshSessionV236166==='function'){
   const sess=await root.crmEnsureFreshSessionV236166(false);
   if(!sess?.access_token)throw Error('Нужен повторный вход в CRM.');
  }
  const r=await client.functions.invoke(ENDPOINT,{body:{action,...extra}});
  if(r.error){
   let msg='Сервис истории недоступен';
   try{msg=String((await r.error.context?.json?.())?.error||msg);}catch{}
   throw Error(msg);
  }
  if(r.data?.error)throw Error(String(r.data.error));
  return r.data||{};
 }
 async function refresh(){
  if(busy)return;busy=true;setStatus('Загружаю личную историю…');
  try{
   const r=await call('history:list',{limit:50});
   enabled=r.history_enabled===true;
   toggle.textContent=enabled?'Отключить сохранение':'Включить сохранение';
   render(r.turns||[]);
   setStatus(enabled?'Хранятся только твои текстовые вопросы и ответы до 30 дней.':
    'История выключена. Старые переписки не восстановятся автоматически.');
  }catch(e){setStatus('Ошибка истории: '+String(e?.message||e).slice(0,100));}
  finally{busy=false;}
 }
 function render(turns){
  list.replaceChildren();selected=null;correction.hidden=true;
  if(!enabled){list.append(div('Включи сохранение, если хочешь возвращаться к разговорам и исправлять ответы.', 'padding:12px;'));return;}
  if(!turns.length){list.append(div('Сохранённых разговоров пока нет. Следующий успешный ответ появится здесь.', 'padding:12px;'));return;}
  for(const t of turns){
   const item=document.createElement('section');
   item.style.cssText='border:1px solid #e1e8f0;border-radius:10px;padding:11px;margin-bottom:9px;background:#fbfcff;';
   const when=div(new Date(t.created_at).toLocaleString('ru-RU')+
    ' · '+(t.mode==='crm'?'CRM · '+(t.answer_verified?'источники проверены':'ответ требует проверки'):'Свободный разговор'),
    'font-size:11px;color:#60748b;margin-bottom:6px;');
   const question=div('Ты: '+String(t.question||''),'white-space:pre-wrap;font-weight:600;margin-bottom:5px;');
   const answer=div('Лера: '+String(t.answer||''),'white-space:pre-wrap;font-size:13px;');
   item.append(when,question,answer);
   if(t.feedback_type){
    item.append(div('⚑ '+t.feedback_type+(t.feedback_note?' · '+t.feedback_note:''),
      'font-size:12px;color:#874f28;margin-top:6px;'));
   }
   const fix=btn('⚑ Исправить ответ',()=>{
    selected=t.id;correction.hidden=false;correction.querySelector('select').value=t.feedback_type||TYPES[0];
    correction.querySelector('textarea').value=t.feedback_note||'';
    correction.scrollIntoView?.({block:'nearest',behavior:'smooth'});
   });
   fix.style.marginTop='8px';item.append(fix);list.append(item);
  }
 }
 function ensure(){
  if(modal)return;
  const frame=document.createElement('section');
  frame.setAttribute('role','dialog');frame.setAttribute('aria-modal','true');
  frame.setAttribute('aria-label','Лера · история разговоров');
  frame.hidden=true;
  frame.style.cssText='position:fixed;z-index:100050;inset:7% auto auto 50%;transform:translateX(-50%);width:min(680px,94vw);max-height:86vh;overflow:auto;border-radius:15px;background:#fff;color:#182e43;border:1px solid #cbd5e1;box-shadow:0 12px 40px rgba(0,0,0,.22);padding:18px;font:14px system-ui,sans-serif;';
  const row=document.createElement('div');row.style.cssText='display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;';
  const title=div('Лера · история разговоров','font-size:18px;font-weight:700;');
  row.append(title,btn('Закрыть',()=>{frame.hidden=true;}));
  const note=div('Личная история: до 30 дней. Аудио не сохраняется. Ты можешь всё удалить. Замечания помогают улучшать беседу, но не изменяют факты CRM.',
    'font-size:12px;color:#52677c;margin:10px 0;');
  const actions=document.createElement('div');actions.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;';
  toggle=btn('Проверяю…',async()=>{
   if(busy)return;
   const next=!enabled;
   if(next&&!root.confirm('Включить сохранение твоих текстовых вопросов и ответов на 30 дней? Аудио не сохраняется.'))return;
   if(!next&&!root.confirm('Отключить историю и удалить все сохранённые разговоры и исправления?'))return;
   busy=true;
   try{
    const r=await call('history:enable',{enabled:next});
    enabled=r.history_enabled===true;setStatus(enabled?'Сохранение включено.':'История отключена и удалена.');
   }catch(e){setStatus('Не получилось изменить настройку: '+String(e?.message||e));}
   finally{busy=false;}
   await refresh();
  });
  const clear=btn('Удалить всю историю',async()=>{
   if(busy||!enabled||!root.confirm('Безвозвратно удалить твои вопросы, ответы и исправления?'))return;
   busy=true;
   try{await call('history:clear');setStatus('Переписка удалена.');}catch(e){setStatus('Ошибка: '+String(e?.message||e));}
   finally{busy=false;}
   await refresh();
  });
  actions.append(toggle,clear,btn('Обновить',()=>void refresh()));
  notice=div('','font-size:12px;color:#586e84;margin:7px 0 10px;');
  list=document.createElement('div');list.style.cssText='max-height:42vh;overflow-y:auto;';
  correction=document.createElement('div');correction.hidden=true;
  correction.style.cssText='padding:12px;border:1px solid #d4deeb;border-radius:11px;margin-top:12px;';
  correction.append(div('Что нужно исправить?','font-weight:650;margin-bottom:8px;'));
  const kind=document.createElement('select');
  kind.style.cssText='width:100%;padding:9px;margin-bottom:8px;border:1px solid #cad6e3;border-radius:8px;';
  for(const t of TYPES){const o=document.createElement('option');o.value=t;o.textContent=t;kind.append(o);}
  const comment=document.createElement('textarea');comment.rows=3;comment.maxLength=500;
  comment.placeholder='Объясни Лере, что было неверно и как нужно отвечать в следующий раз…';
  comment.style.cssText='box-sizing:border-box;width:100%;resize:vertical;padding:8px;border:1px solid #cad6e3;border-radius:8px;';
  const save=btn('Сохранить исправление',async()=>{
   if(!selected||busy)return;
   if(!comment.value.trim()){setStatus('Напиши, что именно Лере нужно исправить.');return;}
   busy=true;
   try{
    await call('history:feedback',{turn_id:selected,feedback_type:kind.value,
     feedback_note:comment.value.trim().slice(0,500)});
    setStatus('Замечание сохранено. Лера учтёт его в обычном разговоре. Цифры CRM проверяются отдельно.');
   }catch(e){setStatus('Ошибка сохранения: '+String(e?.message||e));}
   finally{busy=false;}
   await refresh();
  });
  correction.append(kind,comment,save);
  frame.append(row,note,actions,notice,list,correction);
  document.body.append(frame);modal=frame;
 }
 async function open(){
  ensure();modal.hidden=false;await refresh();
 }
 function attachPanel(panel){
  if(!panel||panel.querySelector('.lera-history-launch'))return;
  const b=btn('История Леры',()=>void open(),'lera-history-launch');
  b.style.cssText='font-size:12px;padding:6px 8px;border:1px solid #c3d2e2;border-radius:8px;background:#fff;color:#234b72;cursor:pointer;';
  const target=panel.querySelector('.rva-head-buttons')||
   (panel.classList?.contains('rsa-branch-panel')?panel.firstElementChild:null);
  if(target)target.prepend(b);
 }
 async function submitFeedback({turnId,kind,note}){
  if(!turnId)return {error:'Этот ответ не был сохранён. Открой «История Леры» и включи сохранение.'};
  if(!note?.trim())return {error:'Напиши в замечании, что нужно исправить.'};
  try{
   return await call('history:feedback',{turn_id:turnId,
    feedback_type:TYPES.includes(kind)?kind:TYPES[4],feedback_note:String(note).slice(0,500)});
  }catch(e){return {error:String(e?.message||e)};}
 }
 root.crmAI360HistoryV1=Object.freeze({attachPanel,open,submitFeedback});
})(window);
