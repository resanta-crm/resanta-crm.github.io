/* RESANTA CRM v23.6.126 · PROMOTIONS CONTROL ASSESSMENT SYNC
 * UI-only consistency layer:
 * red/amber action in the control block must not coexist with a green overall assessment.
 * No data writes. No polling. No MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_CONTROL_ASSESSMENT_SYNC_V236126)return;
const V='v23.6.126';
const safe=v=>String(v??'');
function toneFrom(root){
  const a=root?.querySelector?.('.promo-control-action-v236125');
  if(!a)return null;
  if(a.classList.contains('bad'))return'bad';
  if(a.classList.contains('warn'))return'warn';
  if(a.classList.contains('ok'))return'ok';
  return'neutral';
}
function paintCard(card){
  const tone=toneFrom(card);if(!tone)return;
  const badges=card.querySelectorAll('.promo-badge');if(badges.length<2)return;
  const b=badges[1];
  if(tone==='bad'){
    b.textContent='Требует внимания';b.style.background='var(--rb)';b.style.color='var(--r)';
  }else if(tone==='warn'){
    b.textContent='Требует внимания';b.style.background='var(--amb)';b.style.color='var(--am)';
  }
}
function paintCards(){document.querySelectorAll('#promo-list .promo-card').forEach(paintCard)}
function paintDetail(){
  const root=document.getElementById('promotion-detail-body');if(!root)return;
  const tone=toneFrom(root);if(!tone||tone==='ok'||tone==='neutral')return;
  const cards=[...root.querySelectorAll('.card')];
  const c=cards.find(x=>/^Оценка:/i.test(safe(x.textContent).trim()));if(!c)return;
  const head=[...c.querySelectorAll('div')].find(x=>/^Оценка:/i.test(safe(x.textContent).trim()));
  if(head){head.textContent='Оценка: Требует внимания';head.style.color=tone==='bad'?'var(--r)':'var(--am)';}
}
function repaint(){try{paintCards()}catch(e){console.warn(V+' cards',e)}try{paintDetail()}catch(e){console.warn(V+' detail',e)}}
function patch(){
  const rr=window.renderPromotions;
  if(typeof rr==='function'&&!rr.__promoControlAssessmentV236126){
    const base=rr;const wrapped=function(){const out=base.apply(this,arguments);repaint();return out};
    wrapped.__promoControlAssessmentV236126=true;wrapped.__base=base;window.renderPromotions=wrapped;try{renderPromotions=wrapped}catch(_){}
  }
  const od=window.openPromotionDetail;
  if(typeof od==='function'&&!od.__promoControlAssessmentV236126){
    const base=od;const wrapped=function(){const out=base.apply(this,arguments);repaint();return out};
    wrapped.__promoControlAssessmentV236126=true;wrapped.__base=base;window.openPromotionDetail=wrapped;try{openPromotionDetail=wrapped}catch(_){}
  }
  repaint();
}
patch();
window.RESANTA_PROMOTIONS_CONTROL_ASSESSMENT_SYNC_V236126=Object.freeze({version:V,uiOnly:true,noDataWrites:true,repaint});
})();
