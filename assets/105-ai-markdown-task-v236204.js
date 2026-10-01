/* RESANTA CRM v23.6.204 · AI PLAN MARKDOWN TASK
 * Mandatory separate Markdown task in AI planner preview.
 * Read-only preview first; assignment happens only after explicit approval.
 * One markdown_sale task per manager + due date. No polling / MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_AI_MARKDOWN_TASK_V236204)return;
const V='v23.6.204';
const S={key:'',mgr:'',date:'',mode:'',due:'',data:null,loading:false,flight:null};

const safe=v=>String(v??'');
const esc=v=>safe(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' BYN';
function d10(v){return safe(v).slice(0,10)}
function monthEnd(v){
  const s=d10(v||window.TODAY||new Date().toISOString()),y=Number(s.slice(0,4)),m=Number(s.slice(5,7));
  return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
}
function due(date,mode){return mode==='call'?monthEnd(window.TODAY):d10(date||window.TODAY||new Date().toISOString())}
function root(){return document.getElementById('aiweek-result')}
function active(){return !!document.getElementById('modal-ai-week')?.classList.contains('open')}
function shorten(v,n=240){const s=safe(v).replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n)+'…':s}
function reasonText(r){
  const m={
    auth_required:'Нужно заново войти в CRM.',
    boss_only:'Блок доступен руководителю.',
    invalid_input:'Не определён менеджер или срок.',
    no_ready_markdown:'Нет свободного экземпляра Уценки с утверждённой ценой и фото.'
  };
  return m[r]||safe(r||'Неизвестная причина');
}
function style(){
  if(document.getElementById('ai-md-style-v236204'))return;
  const s=document.createElement('style');s.id='ai-md-style-v236204';s.textContent=`
.ai-md204{margin:0 0 12px;padding:12px 13px;border:1px solid #86efac;border-left:4px solid #16a34a;border-radius:10px;background:#f0fdf4}
.ai-md204.warn{border-color:#fdba74;border-left-color:#f59e0b;background:#fff7ed}
.ai-md204.done{border-color:#93c5fd;border-left-color:#2563eb;background:#eff6ff}
.ai-md204-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}
.ai-md204-title{font-size:13px;font-weight:800}.ai-md204-sub{font-size:11px;color:var(--sub);margin-top:2px}
.ai-md204-name{font-size:13px;font-weight:700;margin-top:7px}.ai-md204-meta{font-size:11px;line-height:1.5;margin-top:4px}
.ai-md204-note{font-size:11px;color:#166534;line-height:1.45;margin-top:7px}.ai-md204.warn .ai-md204-note{color:#9a3412}
.ai-md204-btn{padding:6px 11px;background:var(--g);color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer}
.ai-md204-badge{display:inline-flex;padding:2px 7px;border-radius:999px;background:#dcfce7;color:#166534;font-size:10px;font-weight:700;margin-left:5px}
`;document.head.appendChild(s);
}
function cardHtml(){
  const x=S.data;
  if(S.loading&&!x)return '<div id="ai-markdown-v236204" class="ai-md204"><div class="ai-md204-title">♻️ Обязательная 4-я задача · Уценка</div><div class="ai-md204-sub">Подбираю свободный экземпляр с согласованной ценой и фото…</div></div>';
  if(!x)return '';
  if(!x.ok)return '<div id="ai-markdown-v236204" class="ai-md204 warn"><div class="ai-md204-title">♻️ Обязательная 4-я задача · Уценка</div><div class="ai-md204-note">'+esc(reasonText(x.reason))+'</div></div>';
  if(x.existing){
    const i=x.item||{};
    return '<div id="ai-markdown-v236204" class="ai-md204 done"><div class="ai-md204-head"><div><div class="ai-md204-title">♻️ Обязательная 4-я задача · Уценка <span class="ai-md204-badge">✅ уже в работе</span></div>'
      +'<div class="ai-md204-sub">'+esc(S.mgr)+' · срок '+esc(S.due)+' · отдельная задача менеджера, без привязки к маст-листу клиента</div></div></div>'
      +(i.nomenclature?'<div class="ai-md204-name">'+esc(i.nomenclature)+'</div>':'')
      +(i.article?'<div class="ai-md204-meta">Артикул <b>'+esc(i.article)+'</b> · экземпляр <b>'+esc(i.instance_code||'—')+'</b> · цена <b>'+money(i.final_price)+'</b> · фото '+Number(i.photo_count||0)+'</div>':'')
      +'</div>';
  }
  if(!x.available){
    return '<div id="ai-markdown-v236204" class="ai-md204 warn"><div class="ai-md204-title">♻️ Обязательная 4-я задача · Уценка</div>'
      +'<div class="ai-md204-sub">'+esc(S.mgr)+' · срок '+esc(S.due)+'</div>'
      +'<div class="ai-md204-note">'+esc(reasonText(x.reason))+'</div></div>';
  }
  const i=x.item||{};
  return '<div id="ai-markdown-v236204" class="ai-md204"><div class="ai-md204-head"><div><div class="ai-md204-title">♻️ Обязательная 4-я задача · Уценка <span class="ai-md204-badge">цена + фото готовы</span></div>'
    +'<div class="ai-md204-sub">'+esc(S.mgr)+' · срок '+esc(S.due)+' · отдельная задача менеджера, НЕ зависит от модели/ассортимента клиента</div></div>'
    +'<button type="button" class="ai-md204-btn" onclick="crmApproveAiMarkdownV236204()">✓ В работу</button></div>'
    +'<div class="ai-md204-name">'+esc(i.nomenclature||'Уценённый товар')+'</div>'
    +'<div class="ai-md204-meta">Артикул <b>'+esc(i.article||'—')+'</b> · экземпляр <b>'+esc(i.instance_code||'—')+'</b> · финальная цена <b>'+money(i.final_price)+'</b>'
    +(Number(i.discount_pct||0)>0?' · скидка <b>'+Number(i.discount_pct).toFixed(1)+'%</b>':'')+' · фото <b>'+Number(i.photo_count||0)+'</b></div>'
    +(i.condition_comment?'<div class="ai-md204-note"><b>Состояние:</b> '+esc(shorten(i.condition_comment))+'</div>':'')
    +'<div class="ai-md204-note">Эта задача должна идти дополнительно к коммерческой ИИ-задаче. Она не участвует в правиле основной товар 70% / допродажа 30%.</div>'
    +'</div>';
}
function paint(){
  if(!active())return;
  const box=root();if(!box)return;style();
  box.querySelector('#ai-markdown-v236204')?.remove();
  const h=cardHtml();if(h)box.insertAdjacentHTML('afterbegin',h);
  const all=[...box.querySelectorAll('button')].find(b=>/^✅ Утвердить все/.test(safe(b.textContent).trim()));
  if(all&&S.data?.available&&!S.data?.existing&&!/Уценк/.test(all.textContent))all.textContent=all.textContent+' + Уценка';
}
async function load(mgr,date,mode,force=false){
  const dd=due(date,mode),key=[mgr,dd].join('|');
  S.mgr=safe(mgr);S.date=safe(date);S.mode=safe(mode);S.due=dd;
  if(!force&&S.key===key&&S.data){paint();return S.data}
  if(S.flight&&S.key===key)return S.flight;
  S.key=key;S.data=null;S.loading=true;paint();
  S.flight=(async()=>{
    const client=typeof db!=='undefined'?db:window.db;
    if(!client?.rpc)throw new Error('Supabase недоступен');
    const {data,error}=await client.rpc('markdown_ai_candidate_v236204',{p_manager_name:S.mgr,p_due_date:S.due});
    if(error)throw error;
    S.data=data||{ok:false,reason:'empty_response'};
    return S.data;
  })().catch(e=>{S.data={ok:false,reason:e?.message||String(e)};return S.data})
    .finally(()=>{S.loading=false;S.flight=null;paint()});
  return S.flight;
}
async function approve(){
  if(S.loading)return;
  const client=typeof db!=='undefined'?db:window.db;if(!client?.rpc)return;
  const btn=document.querySelector('#ai-markdown-v236204 .ai-md204-btn');if(btn){btn.disabled=true;btn.textContent='⏳ Ставлю…'}
  try{
    const {data,error}=await client.rpc('markdown_ai_ensure_task_v236199',{p_manager_name:S.mgr,p_due_date:S.due});
    if(error)throw error;
    if(!data?.ok)throw new Error(reasonText(data?.reason));
    const tid=data.task_id||data.assignment?.task_id||null;
    if(tid){
      try{
        const {data:t}=await client.from('tasks').select('*').eq('id',tid).single();
        if(t){
          try{
            const arr=typeof allTasks!=='undefined'?allTasks:window.allTasks;
            if(Array.isArray(arr)&&!arr.some(x=>safe(x.id)===safe(t.id)))arr.unshift(t);
          }catch(_){}
        }
      }catch(_){}
    }
    await load(S.mgr,S.date,S.mode,true);
    try{renderTasks?.();buildDashboard?.();updateTasksAlertDot?.()}catch(_){}
  }catch(e){
    alert('Не удалось поставить задачу по Уценке: '+(e?.message||e));
    await load(S.mgr,S.date,S.mode,true);
  }
}
function install(){
  style();
  const rr=window.renderAIWeekProposals;
  if(typeof rr==='function'&&!rr.__aiMarkdownV236204){
    const base=rr;
    const wrapped=function(mgr,date,mode){
      const out=base.apply(this,arguments);
      setTimeout(()=>load(mgr,date,mode,false),0);
      return out;
    };
    wrapped.__aiMarkdownV236204=true;wrapped.__base=base;
    window.renderAIWeekProposals=wrapped;try{renderAIWeekProposals=wrapped}catch(_){}
  }
  const one=window.approveAIWeekTask;
  if(typeof one==='function'&&!one.__aiMarkdownV236204){
    const base=one;
    const wrapped=async function(idx,mgr,date,mode){
      const out=await base.apply(this,arguments);
      setTimeout(()=>load(mgr,date,mode,true),80);
      return out;
    };
    wrapped.__aiMarkdownV236204=true;wrapped.__base=base;
    window.approveAIWeekTask=wrapped;try{approveAIWeekTask=wrapped}catch(_){}
  }
  const all=window.approveAllAIWeek;
  if(typeof all==='function'&&!all.__aiMarkdownV236204){
    const base=all;
    const wrapped=async function(mgr,date,mode){
      const out=await base.apply(this,arguments);
      setTimeout(()=>load(mgr,date,mode,true),100);
      return out;
    };
    wrapped.__aiMarkdownV236204=true;wrapped.__base=base;
    window.approveAllAIWeek=wrapped;try{approveAllAIWeek=wrapped}catch(_){}
  }
}
window.crmApproveAiMarkdownV236204=approve;
window.RESANTA_AI_MARKDOWN_TASK_V236204=Object.freeze({version:V,mandatory:true,separateFromClientModel:true,previewBeforeApproval:true,noPolling:true,noMutationObserver:true,load,approve});
install();[100,400,1000,2500].forEach(ms=>setTimeout(install,ms));
})();