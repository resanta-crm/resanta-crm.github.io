/* RESANTA CRM v23.6.3 · PROMOTIONS: BOSS CREATE + ACTIVE SUBSTITUTE
 * Scope:
 * - every boss can create a promotion;
 * - client manager is still taken from the client card;
 * - Sidorovich's existing create shortcut remains unchanged (goes to Payushin final approval);
 * - other boss-created promotions start at manager confirmation;
 * - an active substitute from manager_absences may confirm/accept for the absent manager;
 * - first approval remains Sidorovich; final approval remains Payushin.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_BOSS_SUBSTITUTE_V2363)return;
const VERSION='v23.6.3';
let substitutions=[],subLoadedAt=0,subFlight=null;
const norm=v=>String(v||'').trim().toLowerCase().replace(/ё/g,'е').replace(/\s+/g,' ');
const today=()=>String((typeof TODAY!=='undefined'&&TODAY)||new Date().toISOString().slice(0,10));
function actor(){try{return typeof promoActorName==='function'?String(promoActorName()||'').trim():'';}catch(_){return '';}}
function isActiveSubstitute(managerName,actorName){const m=norm(managerName),a=norm(actorName||actor());if(!m||!a)return false;return substitutions.some(x=>norm(x.manager_name)===m&&norm(x.substitute_name)===a&&String(x.status||'').toLowerCase()==='active'&&String(x.date_from||'')<=today()&&String(x.date_to||'')>=today());}
async function refreshSubstitutions(force=false){
  if(typeof db==='undefined')return substitutions;
  if(subFlight)return subFlight;
  if(!force&&Date.now()-subLoadedAt<60000)return substitutions;
  subFlight=(async()=>{const d=today();const {data,error}=await db.from('manager_absences').select('manager_name,substitute_name,date_from,date_to,status').eq('status','active').lte('date_from',d).gte('date_to',d);if(error)throw error;substitutions=Array.isArray(data)?data.filter(x=>x.substitute_name):[];subLoadedAt=Date.now();window.RESANTA_ACTIVE_MANAGER_SUBSTITUTIONS_V2363=substitutions.slice();return substitutions;})().catch(e=>{console.warn('Promotions '+VERSION+' substitutions:',e);return substitutions;}).finally(()=>{subFlight=null;});
  return subFlight;
}
function compilePatched(name,replacements){
  const base=window[name];if(typeof base!=='function')throw new Error(name+' is not available');
  let src=Function.prototype.toString.call(base);
  for(const [from,to,label] of replacements){if(!src.includes(from))throw new Error(name+': expected fragment not found: '+label);src=src.replace(from,to);}
  const fn=(0,eval)('('+src+')');if(typeof fn!=='function')throw new Error(name+': patched function did not compile');window[name]=fn;try{eval(name+'=window[name]');}catch(_){}return fn;
}
function patchCreateFlow(){
  compilePatched('openPromotionEditor',[["if(!p&&promoIsBoss()&&!promoIsDF())","if(false)",'new promotion boss guard']]);
  compilePatched('savePromotion',[
    ["const dfCreates=!old&&promoIsDF();","const dfCreates=!old&&promoIsDF();const bossCreates=!old&&boss&&!dfCreates;",'boss create state'],
    ["if(!old&&boss&&!dfCreates)","if(false)",'save boss guard'],
    ["status:old?.status||(dfCreates?'pending_dfs':'pending_df')","status:old?.status||(dfCreates?'pending_dfs':bossCreates?'draft_manager':'pending_df')",'boss manager-first status']
  ]);
}
function patchPermissions(){
  const baseSubmit=window.promoCanSubmitManager;
  if(typeof baseSubmit==='function'){window.promoCanSubmitManager=function(p){return !!baseSubmit(p)||(!!p&&['draft_manager','rejected'].includes(p.status)&&isActiveSubstitute(p.manager_name));};try{promoCanSubmitManager=window.promoCanSubmitManager;}catch(_){}}
  const baseAccept=window.promoCanAcceptWork;
  if(typeof baseAccept==='function'){window.promoCanAcceptWork=function(p){return !!baseAccept(p)||(!!p&&p.status==='approved'&&isActiveSubstitute(p.manager_name));};try{promoCanAcceptWork=window.promoCanAcceptWork;}catch(_){}}
}
function patchRender(){
  const base=window.renderPromotions;if(typeof base!=='function')return;
  window.renderPromotions=function(){refreshSubstitutions(false);const r=base.apply(this,arguments);const b=document.getElementById('promo-create-btn');if(b&&typeof promoIsBoss==='function'&&promoIsBoss())b.style.display='inline-flex';return r;};
  try{renderPromotions=window.renderPromotions;}catch(_){}
}
function labelSubstituteAction(){
  document.addEventListener('click',e=>{const btn=e.target?.closest?.('button');if(!btn)return;const t=String(btn.textContent||'').trim();if(!/подтвердить/i.test(t))return;setTimeout(()=>refreshSubstitutions(false),0);},true);
}
function install(){
  if(window.RESANTA_PROMOTIONS_BOSS_SUBSTITUTE_V2363)return true;
  if(typeof window.renderPromotions!=='function'||typeof window.openPromotionEditor!=='function'||typeof window.savePromotion!=='function'||typeof window.promoCanSubmitManager!=='function')return false;
  try{
    patchCreateFlow();patchPermissions();patchRender();labelSubstituteAction();
    refreshSubstitutions(true).then(()=>{try{window.renderPromotions();}catch(_){}});
    window.RESANTA_PROMOTIONS_BOSS_SUBSTITUTE_V2363=Object.freeze({version:VERSION,bossCanCreate:true,bossCreateManagerFirst:true,sidorovichCreateShortcutPreserved:true,activeSubstitutionTable:'manager_absences',firstApproval:'Сидарович',finalApproval:'Паюшин'});
    console.info('RESANTA promotions '+VERSION+' installed');
    return true;
  }catch(e){console.error('Promotions '+VERSION+' NOT installed safely:',e);return false;}
}
if(!install()){let tries=0;const timer=setInterval(()=>{tries++;if(install()||tries>=60)clearInterval(timer);},250);}
})();

/* v23.6.4 bridge: actual GPS client visit order. */
(function(){
'use strict';
if(window.RESANTA_GPS_VISIT_ORDER_V2364||document.querySelector('script[data-gps-visit-order-v2364]'))return;
const s=document.createElement('script');
s.src='./assets/26-gps-visit-order-v2364.js?_='+Date.now();
s.async=false;
s.dataset.gpsVisitOrderV2364='1';
s.onerror=()=>console.warn('GPS visit order v23.6.4 failed to load; v23.6.2 viewer remains available.');
document.head.appendChild(s);
})();

/* v23.6.9 bridge: stable Triovist access for managers and leaders. */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_ACCESS_V2369||document.querySelector('script[data-triovist-access-v2369]'))return;
const s=document.createElement('script');
s.src='./assets/30-triovist-access-v2369.js?_='+Date.now();
s.async=false;
s.dataset.triovistAccessV2369='1';
s.onerror=()=>console.warn('Triovist v23.6.9 failed to load; base Triovist remains available.');
document.head.appendChild(s);
})();

/* v23.6.10 bridge: compact manager UI, VAT budget and price safety. */
(function(){
'use strict';
if(window.RESANTA_TRIOVIST_UI_PRICE_V23610||document.querySelector('script[data-triovist-ui-price-v23610]'))return;
const s=document.createElement('script');
s.src='./assets/31-triovist-ui-price-v23610.js?_='+Date.now();
s.async=false;
s.dataset.triovistUiPriceV23610='1';
s.onerror=()=>console.warn('Triovist v23.6.10 UI failed to load; v23.6.9 remains available.');
document.head.appendChild(s);
})();

/* v23.6.8 bridge: director-friendly promotion approvals, budgets and interim sales. */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_DECISION_UI_V2368||document.querySelector('script[data-promotions-decision-ui-v2368]'))return;
const s=document.createElement('script');
s.src='./assets/29-promotions-decision-ui-v2368.js?_='+Date.now();
s.async=false;
s.dataset.promotionsDecisionUiV2368='1';
s.onerror=()=>console.warn('Promotions decision UI v23.6.8 failed to load; existing promotions remain available.');
document.head.appendChild(s);
})();
