/* RESANTA CRM v23.6.127 · STRUCTURED PROMOTION MECHANICS
 * New promotions only:
 * - standard mechanics instead of free-form mechanism text;
 * - automatic photo/control stages per mechanic;
 * - sales plan is mandatory;
 * - non-promotion budget expenses are explicitly redirected away from Promotions.
 * Existing promotions keep their historical mechanics and photo stages unchanged.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_MECHANICS_GUARD_V236127)return;
const V='v23.6.127';
const NEW_CUTOFF='2026-09-16T10:30:00Z';
const MECH=[
  {id:'discount',label:'Скидка / ценовая акция',stages:[],hint:'Контроль по SKU, продажам, плану и сроку. Фото не требуется.'},
  {id:'gift_buyer',label:'Подарок покупателю за покупку',stages:['start','during'],hint:'Подтверждение запуска и фактического проведения.'},
  {id:'advertising',label:'Рекламное размещение',stages:['start'],hint:'Фото или скрин фактического размещения.'},
  {id:'display',label:'Выкладка / паллета / дополнительное место',stages:['start','during'],hint:'Фото размещения на старте и контроль в процессе.'},
  {id:'coupon',label:'Чек-купон / промокод',stages:['start','during'],hint:'Подтверждение запуска и проведения механики.'}
];
const safe=v=>String(v??'');
const esc=v=>safe(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function promos(){try{return typeof allPromotions!=='undefined'?allPromotions:(window.allPromotions||[])}catch(_){return window.allPromotions||[]}}
function promoById(id){return promos().find(x=>safe(x.id)===safe(id))||null}
function isBoss(){try{return typeof promoIsBoss==='function'&&promoIsBoss()}catch(_){return false}}
function isNewRecord(p,id){if(!id)return true;const c=safe(p?.created_at);return !!c&&c>=NEW_CUTOFF}
function form(){return document.getElementById('modal-promotion-edit')}
function original(){return document.getElementById('promotion-mechanics')}
function stageInputs(){return [...document.querySelectorAll('.promotion-photo-stage')]}
function selectedIds(){const h=document.getElementById('promo-mechanics-v236127');return h?[...h.querySelectorAll('[data-mech]:checked')].map(x=>x.value):[]}
function selectedDefs(){const ids=new Set(selectedIds());return MECH.filter(x=>ids.has(x.id))}
function stagesForSelected(){return [...new Set(selectedDefs().flatMap(x=>x.stages))]}
function stageLabel(x){return{before:'До акции',start:'Старт',during:'В процессе',after:'После'}[x]||x}
function canonicalText(){const defs=selectedDefs(),note=(document.getElementById('promo-mechanics-note-v236127')?.value||'').trim();let s=defs.map(x=>x.label).join(' + ');if(note)s+=(s?' — ':'')+note;return s}
function inferSelected(text){const t=safe(text).toLowerCase();const out=[];if(/скид|ценов/.test(t))out.push('discount');if(/подарок/.test(t)&&!/лпр|товаровед|закупщик|др\b/.test(t))out.push('gift_buyer');if(/реклам|баннер|сайт|размещ/.test(t))out.push('advertising');if(/выклад|паллет|полетн|поддон|полк/.test(t))out.push('display');if(/купон|промокод/.test(t))out.push('coupon');return [...new Set(out)]}
function ensureHost(){
  let h=document.getElementById('promo-mechanics-v236127');if(h)return h;
  const o=original();if(!o)return null;const wrap=o.closest('.form-field');if(!wrap)return null;
  h=document.createElement('div');h.id='promo-mechanics-v236127';wrap.parentNode.insertBefore(h,wrap);h.addEventListener('change',e=>{if(e.target.matches('[data-mech]'))applyAutoStages()});h.addEventListener('click',expenseClick);return h;
}
function expenseClick(e){
  const b=e.target.closest('[data-budget-expense]');if(!b)return;
  e.preventDefault();
  const clientId=document.getElementById('promotion-client')?.value||'';
  if(!isBoss()){
    alert('Это не акция на продажи. Подарок ЛПР, одежду сотрудникам, компенсацию и другой хозяйственный/представительский расход нужно оформлять в разделе «Бюджеты → Расход».');
    return;
  }
  let budgets=[];try{budgets=allPromotionBudgets||[]}catch(_){}
  const bgt=budgets.find(x=>safe(x.client_id)===safe(clientId));
  if(!bgt){alert('Сначала выберите клиента и убедитесь, что для него заведён бюджет. Затем оформите «Бюджеты → Расход».');return;}
  try{closeModal('modal-promotion-edit');openBudgetMovement(bgt.id,'expense');setTimeout(()=>{const d=document.getElementById('budget-movement-description');if(d&&!d.value)d.value='Расход бюджета клиента (не акция)';},0)}catch(_){alert('Откройте раздел «Бюджеты» и добавьте расход по клиенту.');}
}
function renderStructured(p){
  const h=ensureHost(),o=original();if(!h||!o)return;
  const inferred=inferSelected(p?.mechanics||'');
  const explicitNew=!p||isNewRecord(p,p?.id);
  h.style.display='block';o.closest('.form-field').style.display='none';
  h.innerHTML='<div class="promo-mech-box-v236127"><div class="promo-mech-title-v236127"><b>Механика акции</b><span>можно выбрать несколько</span></div>'
    +'<div class="promo-mech-grid-v236127">'+MECH.map(x=>'<label class="promo-mech-item-v236127"><input type="checkbox" data-mech value="'+x.id+'" '+(inferred.includes(x.id)?'checked':'')+'><span><b>'+esc(x.label)+'</b><small>'+esc(x.hint)+'</small></span></label>').join('')+'</div>'
    +'<div class="form-field" style="margin:10px 0 0"><label class="form-label">Дополнительные условия</label><textarea class="form-input" id="promo-mechanics-note-v236127" rows="2" placeholder="Только особые условия, если они нужны"></textarea></div>'
    +'<div id="promo-mech-route-v236127" class="promo-mech-route-v236127"></div>'
    +'<div class="promo-not-action-v236127"><b>Это не акция?</b> Подарок ЛПР, одежда сотрудникам, компенсация, проверка, представительские и другие расходы не создаются здесь. <button type="button" data-budget-expense class="btn-secondary">Оформить как расход бюджета</button></div>'
    +'</div>';
  if(explicitNew&&!inferred.length)o.value='';
  applyAutoStages();
}
function applyAutoStages(){
  const stages=stagesForSelected(),boss=isBoss();
  stageInputs().forEach(x=>{x.checked=stages.includes(x.value);x.disabled=!boss;});
  const r=document.getElementById('promo-mech-route-v236127');if(r){r.innerHTML=stages.length?'<b>Автоматический контроль:</b> '+stages.map(stageLabel).join(' → ')+'<br><span>ДФ/ДФС может изменить обязательные этапы при согласовании.</span>':'<b>Автоматический контроль:</b> фото не требуется. Контролируем план, продажи, товар и срок.';}
  const o=original();if(o)o.value=canonicalText();
}
function showLegacy(){const h=document.getElementById('promo-mechanics-v236127'),o=original();if(h)h.style.display='none';if(o)o.closest('.form-field').style.display='';stageInputs().forEach(x=>x.disabled=false)}
function prepareEditor(id){
  const p=id?promoById(id):null;
  if(isNewRecord(p,id))renderStructured(p);else showLegacy();
}
function validateNew(){
  const id=safe(document.getElementById('promotion-id')?.value),p=id?promoById(id):null;if(!isNewRecord(p,id))return true;
  const defs=selectedDefs();if(!defs.length){alert('Выберите механику акции. Если это просто расход бюджета — оформите его в разделе «Бюджеты».');return false;}
  const plan=Number(document.getElementById('promotion-plan')?.value||0);if(!(plan>0)){alert('Для новой акции обязателен план продаж больше 0 BYN. Без плана нельзя контролировать результат и темп.');return false;}
  const title=(document.getElementById('promotion-title')?.value||'').trim();if(/подарок\s*(лпр|закупщик|товаровед)|брендированн\w*\s+одежд|компенсац|госстандарт|провер(к|оч)/i.test(title)){
    alert('По названию это похоже не на акцию продаж, а на расход бюджета. Оформите его через «Бюджеты → Расход».');return false;
  }
  const o=original();if(o)o.value=canonicalText();applyAutoStages();return true;
}
function css(){if(document.getElementById('promo-mechanics-style-v236127'))return;const s=document.createElement('style');s.id='promo-mechanics-style-v236127';s.textContent=`
#promo-mechanics-v236127{margin-bottom:14px}.promo-mech-box-v236127{border:1px solid #bfdbfe;background:#f8fbff;border-radius:12px;padding:12px}.promo-mech-title-v236127{display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:12px;margin-bottom:8px}.promo-mech-title-v236127 span{font-size:10px;color:var(--sub)}.promo-mech-grid-v236127{display:grid;grid-template-columns:1fr 1fr;gap:7px}.promo-mech-item-v236127{display:flex;gap:8px;align-items:flex-start;background:#fff;border:1px solid var(--border);border-radius:9px;padding:8px;cursor:pointer}.promo-mech-item-v236127 input{margin-top:2px}.promo-mech-item-v236127 b{display:block;font-size:11px}.promo-mech-item-v236127 small{display:block;font-size:9px;color:var(--sub);line-height:1.35;margin-top:2px}.promo-mech-route-v236127{margin-top:9px;background:var(--gb);color:var(--g);border-radius:8px;padding:8px 9px;font-size:10px;line-height:1.45}.promo-mech-route-v236127 span{opacity:.85}.promo-not-action-v236127{margin-top:9px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:8px;padding:8px 9px;font-size:10px;line-height:1.45}.promo-not-action-v236127 .btn-secondary{padding:5px 8px;font-size:10px;margin-left:5px}@media(max-width:700px){.promo-mech-grid-v236127{grid-template-columns:1fr}.promo-mech-title-v236127{align-items:flex-start;flex-direction:column}}
`;document.head.appendChild(s)}
function patch(){
  css();
  const O=window.openPromotionEditor;if(typeof O==='function'&&!O.__promoMechanicsV236127){const base=O;const wrapped=function(id){const r=base.apply(this,arguments);Promise.resolve().then(()=>prepareEditor(id));return r};wrapped.__promoMechanicsV236127=true;wrapped.__base=base;window.openPromotionEditor=wrapped;try{openPromotionEditor=wrapped}catch(_){} }
  const S=window.savePromotion;if(typeof S==='function'&&!S.__promoMechanicsV236127){const base=S;const wrapped=async function(){if(!validateNew())return;return base.apply(this,arguments)};wrapped.__promoMechanicsV236127=true;wrapped.__base=base;window.savePromotion=wrapped;try{savePromotion=wrapped}catch(_){} }
}
patch();
window.RESANTA_PROMOTIONS_MECHANICS_GUARD_V236127=Object.freeze({version:V,newOnly:true,planRequired:true,structuredMechanics:true,expenseGuard:true,automaticPhotoStages:true,noLegacyRewrite:true});
})();
