/* RESANTA CRM v23.6.125 · PROMOTIONS CONTROL LAYER
 * Read-only control layer for existing and new promotions.
 * - no data writes;
 * - no status changes;
 * - no polling / MutationObserver;
 * - adds elapsed period, plan completion, pace and the next required action.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_CONTROL_V236125)return;
const V='v23.6.125';
const STAGE_LABEL={before:'До акции',start:'Старт',during:'В процессе',after:'После'};
const safe=v=>String(v??'');
const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const esc=v=>safe(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=v=>Math.round(num(v));
function today(){try{return safe(TODAY).slice(0,10)||new Date().toISOString().slice(0,10)}catch(_){return new Date().toISOString().slice(0,10)}}
function dateMs(v){const d=new Date(safe(v).slice(0,10)+'T12:00:00');return Number.isFinite(d.getTime())?d.getTime():0}
function dayDiff(a,b){const x=dateMs(a),y=dateMs(b);return x&&y?Math.round((y-x)/86400000):0}
function progress(p){
  const s=safe(p?.start_date).slice(0,10),e=safe(p?.end_date).slice(0,10),t=today();
  if(!s||!e)return{elapsed:0,left:null,total:null};
  const total=Math.max(1,dayDiff(s,e)+1);
  let done=t<s?0:(t>e?total:Math.max(0,dayDiff(s,t)+1));
  done=Math.min(total,done);
  return{elapsed:done/total*100,left:t>e?0:Math.max(0,dayDiff(t,e)),total};
}
function status(p){try{return typeof promoActualStatus==='function'?promoActualStatus(p):safe(p?.status)}catch(_){return safe(p?.status)}}
function metric(p){try{return typeof promoMetric==='function'?promoMetric(p):{sales:0,plan:num(p?.sales_plan),completion:0,photos:{missing:[]}}}catch(_){return{sales:0,plan:num(p?.sales_plan),completion:0,photos:{missing:[]}}}}
function photoProgress(p){
  try{if(typeof promoPhotoProgress==='function')return promoPhotoProgress(p)}catch(_){}
  const req=Array.isArray(p?.required_photo_stages)?p.required_photo_stages:[];
  let rows=[];try{rows=(allPromotionPhotos||[]).filter(x=>safe(x.promotion_id)===safe(p?.id)&&x.approved!==false)}catch(_){}
  const have=new Set(rows.map(x=>safe(x.stage)));
  return{have:req.filter(x=>have.has(x)).length,total:req.length,missing:req.filter(x=>!have.has(x))};
}
function missingExpected(p,st,elapsed){
  const ph=photoProgress(p),m=ph.missing||[];
  if(!m.length)return null;
  if(st==='planned')return m.includes('before')?'before':null;
  if(st==='active'){
    if(m.includes('before'))return'before';
    if(m.includes('start'))return'start';
    if(elapsed>=35&&m.includes('during'))return'during';
    return null;
  }
  if(st==='awaiting'){
    return ['before','start','during','after'].find(x=>m.includes(x))||m[0]||null;
  }
  return null;
}
function control(p){
  const st=status(p),m=metric(p),pr=progress(p),completion=num(m.completion),pace=m.plan>0?completion-pr.elapsed:null;
  const manager=safe(p?.manager_name||'Менеджер'),missing=missingExpected(p,st,pr.elapsed),report=safe(p?.manager_report).trim();
  let tone='ok',action='Контроль: отклонений нет';
  if(st==='draft_manager'){tone='warn';action=manager+': отправить акцию на согласование';}
  else if(st==='pending_df'){tone='warn';action='Сидорович: согласовать или вернуть на доработку';}
  else if(st==='pending_dfs'){tone='warn';action='Паюшин: выполнить финальное согласование';}
  else if(st==='waiting_manager'){tone='warn';action=manager+': взять согласованную акцию в работу';}
  else if(st==='planned'){
    if(missing){tone='bad';action=manager+': загрузить фото «'+STAGE_LABEL[missing]+'» до начала акции';}
    else action='Акция начнётся '+safe(p.start_date);
  }
  else if(st==='active'){
    if(missing){tone='bad';action=manager+': загрузить обязательное фото «'+STAGE_LABEL[missing]+'»';}
    else if(pace!=null&&pace<=-15){tone='warn';action=manager+': продажи отстают от темпа на '+Math.abs(Math.round(pace))+' п.п. — требуется отработка';}
    else if(pr.left!=null&&pr.left<=3){tone='warn';action='До окончания '+pr.left+' дн. — проверить выполнение и подготовить закрытие';}
  }
  else if(st==='awaiting'){
    if(missing){tone='bad';action=manager+': акция закончилась — загрузить фото «'+STAGE_LABEL[missing]+'»';}
    else if(!report){tone='bad';action=manager+': заполнить итоговый отчёт по акции';}
    else{tone='warn';action='Паюшин: проверить результат и закрыть акцию';}
  }
  else if(st==='completed'){action='Акция закрыта';}
  else if(st==='rejected'){tone='neutral';action='Акция отклонена';}
  const planPct=m.plan>0?completion:null;
  return{st,m,elapsed:pr.elapsed,left:pr.left,pace,planPct,tone,action,photos:photoProgress(p)};
}
function style(){
  if(document.getElementById('promo-control-style-v236125'))return;
  const s=document.createElement('style');s.id='promo-control-style-v236125';s.textContent=`
  .promo-control-v236125{margin-top:10px;border:1px solid #dbe7f3;border-radius:10px;background:#fbfdff;padding:9px 10px}
  .promo-control-head-v236125{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:11px;font-weight:700;margin-bottom:7px}
  .promo-control-grid-v236125{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
  .promo-control-stat-v236125{background:#fff;border:1px solid var(--border);border-radius:8px;padding:6px 8px;min-width:0}
  .promo-control-label-v236125{font-size:9px;color:var(--sub);text-transform:uppercase;letter-spacing:.03em}
  .promo-control-value-v236125{font-size:12px;font-weight:700;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .promo-control-action-v236125{margin-top:7px;border-radius:8px;padding:7px 9px;font-size:11px;font-weight:650;line-height:1.35}
  .promo-control-action-v236125.ok{background:var(--gb);color:var(--g)}
  .promo-control-action-v236125.warn{background:var(--amb);color:var(--am)}
  .promo-control-action-v236125.bad{background:var(--rb);color:var(--r)}
  .promo-control-action-v236125.neutral{background:var(--bg);color:var(--sub)}
  #promotion-detail-body .promo-control-v236125{margin-top:12px;padding:12px}
  #promotion-detail-body .promo-control-grid-v236125{grid-template-columns:repeat(4,minmax(110px,1fr))}
  @media(max-width:700px){.promo-control-grid-v236125,#promotion-detail-body .promo-control-grid-v236125{grid-template-columns:repeat(2,minmax(0,1fr))}}
  `;document.head.appendChild(s);
}
function signed(v){const x=Math.round(num(v));return(x>0?'+':'')+x+' п.п.'}
function html(p){
  const c=control(p),plan=c.planPct==null?'Без плана':pct(c.planPct)+'%',pace=c.pace==null?'—':signed(c.pace),left=c.left==null?'—':(c.st==='awaiting'||c.st==='completed'?'0 дн.':c.left+' дн.');
  return '<div class="promo-control-v236125" data-promo-control="'+esc(p.id)+'">'
    +'<div class="promo-control-head-v236125"><span>🎯 Контроль акции</span><span style="color:var(--sub);font-weight:500">Фото '+c.photos.have+'/'+c.photos.total+'</span></div>'
    +'<div class="promo-control-grid-v236125">'
    +'<div class="promo-control-stat-v236125"><div class="promo-control-label-v236125">Прошло срока</div><div class="promo-control-value-v236125">'+pct(c.elapsed)+'%</div></div>'
    +'<div class="promo-control-stat-v236125"><div class="promo-control-label-v236125">План выполнен</div><div class="promo-control-value-v236125">'+plan+'</div></div>'
    +'<div class="promo-control-stat-v236125"><div class="promo-control-label-v236125">Темп</div><div class="promo-control-value-v236125" style="color:'+(c.pace!=null&&c.pace<0?'var(--r)':'var(--g)')+'">'+pace+'</div></div>'
    +'<div class="promo-control-stat-v236125"><div class="promo-control-label-v236125">До окончания</div><div class="promo-control-value-v236125">'+left+'</div></div>'
    +'</div><div class="promo-control-action-v236125 '+c.tone+'">'+esc(c.action)+'</div></div>';
}
function promoIdFromCard(card){
  const b=[...(card?.querySelectorAll?.('button')||[])].find(x=>/Открыть/i.test(safe(x.textContent)));
  const m=safe(b?.getAttribute?.('onclick')).match(/[0-9a-f]{8}-[0-9a-f-]{27,}/i);return m?m[0]:'';
}
function promotion(id){try{return (allPromotions||[]).find(x=>safe(x.id)===safe(id))||null}catch(_){return null}}
function paintCards(){
  const list=document.getElementById('promo-list');if(!list)return;
  list.querySelectorAll('.promo-card').forEach(card=>{
    const p=promotion(promoIdFromCard(card));if(!p)return;
    card.querySelector('.promo-control-v236125')?.remove();
    const foot=card.lastElementChild,box=document.createElement('div');box.innerHTML=html(p);const node=box.firstElementChild;
    if(foot)card.insertBefore(node,foot);else card.appendChild(node);
  });
}
function paintDetail(id){
  const root=document.getElementById('promotion-detail-body'),p=promotion(id);if(!root||!p)return;
  root.querySelector('.promo-control-v236125')?.remove();
  const anchor=root.querySelector('.promo-grid'),box=document.createElement('div');box.innerHTML=html(p);const node=box.firstElementChild;
  if(anchor)anchor.insertAdjacentElement('afterend',node);else root.prepend(node);
}
function patch(){
  style();
  const rr=window.renderPromotions;
  if(typeof rr==='function'&&!rr.__promoControlV236125){
    const base=rr;const wrapped=function(){const out=base.apply(this,arguments);try{paintCards()}catch(e){console.warn(V+' cards',e)}return out};
    wrapped.__promoControlV236125=true;wrapped.__base=base;window.renderPromotions=wrapped;try{renderPromotions=wrapped}catch(_){}
  }
  const od=window.openPromotionDetail;
  if(typeof od==='function'&&!od.__promoControlV236125){
    const base=od;const wrapped=function(id){const out=base.apply(this,arguments);try{paintDetail(id)}catch(e){console.warn(V+' detail',e)}return out};
    wrapped.__promoControlV236125=true;wrapped.__base=base;window.openPromotionDetail=wrapped;try{openPromotionDetail=wrapped}catch(_){}
  }
  try{paintCards()}catch(_){}
}
patch();
window.RESANTA_PROMOTIONS_CONTROL_V236125=Object.freeze({version:V,readOnly:true,noDataWrites:true,noPolling:true,noMutationObserver:true,repaint:()=>{paintCards();try{if(typeof promotionDetailId!=='undefined'&&promotionDetailId)paintDetail(promotionDetailId)}catch(_){}}});
})();
