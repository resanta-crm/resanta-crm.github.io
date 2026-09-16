/* RESANTA CRM v23.6.129 · TELEGRAM CONNECT UI
 * Safe CRM -> Telegram account binding.
 * - one-time link code from authenticated RPC;
 * - boss configures Telegram webhook through authenticated Edge Function call;
 * - no bot token in browser or repository;
 * - no blank popup on failed setup;
 * - no polling / MutationObserver.
 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_TELEGRAM_CONNECT_V236128)return;
const V='v23.6.129';
const BOT='ResantaCRMActionsBot';
let busy=false,lastStatus=null,lastAt=0,patched=false;
const safe=v=>String(v??'');
function dbc(){try{return typeof db!=='undefined'?db:window.db}catch(_){return window.db}}
function isBoss(){try{return typeof promoIsBoss==='function'&&promoIsBoss()}catch(_){return false}}
function style(){if(document.getElementById('promo-tg-style-v236128'))return;const s=document.createElement('style');s.id='promo-tg-style-v236128';s.textContent=`
#promo-tg-connect-v236128{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;background:#f8fbff;border:1px solid #bfdbfe;border-radius:10px;padding:9px 11px;margin:0 0 12px;font-size:11px}
#promo-tg-connect-v236128 .promo-tg-main{display:flex;align-items:center;gap:8px;min-width:0}.promo-tg-dot-v236128{width:8px;height:8px;border-radius:50%;background:#94a3b8;flex:none}.promo-tg-dot-v236128.ok{background:#22c55e}.promo-tg-title-v236128{font-weight:700}.promo-tg-sub-v236128{color:var(--sub);margin-top:2px}.promo-tg-actions-v236128{display:flex;gap:6px;flex-wrap:wrap}.promo-tg-actions-v236128 .btn-secondary{padding:6px 9px;font-size:10px}@media(max-width:700px){#promo-tg-connect-v236128{align-items:flex-start}.promo-tg-actions-v236128{width:100%}.promo-tg-actions-v236128 button{flex:1}}
`;document.head.appendChild(s)}
function host(){let h=document.getElementById('promo-tg-connect-v236128');if(h)return h;const k=document.getElementById('promo-kpi');if(!k)return null;h=document.createElement('div');h.id='promo-tg-connect-v236128';k.parentNode.insertBefore(h,k);h.addEventListener('click',click);return h}
function render(){const h=host();if(!h)return;const x=lastStatus||{connected:false};const who=x.telegram_username?('@'+x.telegram_username):(x.telegram_first_name||'');h.innerHTML='<div class="promo-tg-main"><span class="promo-tg-dot-v236128 '+(x.connected?'ok':'')+'"></span><div><div class="promo-tg-title-v236128">Telegram · Акции</div><div class="promo-tg-sub-v236128">'+(x.connected?'Подключён'+(who?' · '+who:''):'Подключите личные уведомления по своим акциям и согласованиям')+'</div></div></div><div class="promo-tg-actions-v236128">'+(x.connected?'<button type="button" class="btn-secondary" data-tg-refresh>Проверить</button>':'<button type="button" class="btn-secondary" data-tg-connect>Подключить Telegram</button>')+'</div>'}
async function refresh(force){const d=dbc();if(!d)return;if(!force&&Date.now()-lastAt<10000&&lastStatus){render();return}try{const {data,error}=await d.rpc('crm_telegram_binding_status');if(error)throw error;lastStatus=data&&typeof data==='object'?data:{connected:false};lastAt=Date.now()}catch(e){console.warn(V+' status',e)}render()}
async function setupWebhook(){if(!isBoss())return true;const d=dbc();const {data:sess,error}=await d.auth.getSession();if(error)throw error;const token=sess?.session?.access_token;if(!token)throw Error('Нет активной сессии CRM');const base=typeof SUPABASE_URL!=='undefined'?SUPABASE_URL:'https://baqchjtvtmcfzwjjluhs.supabase.co';const r=await fetch(base+'/functions/v1/crm-promotions-telegram?setup=1',{method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:'{}'});const j=await r.json().catch(()=>({}));if(!r.ok||!j?.ok)throw Error(j?.error||'Не удалось настроить Telegram webhook');return true}
async function connect(){if(busy)return;busy=true;const h=host(),btn=h?.querySelector('[data-tg-connect]');if(btn){btn.disabled=true;btn.textContent='Подключаю…'}try{await setupWebhook();const {data:code,error}=await dbc().rpc('crm_create_telegram_link_code');if(error)throw error;if(!code)throw Error('Не удалось создать одноразовую ссылку');const url='https://t.me/'+BOT+'?start='+encodeURIComponent(code);const w=window.open(url,'_blank');if(!w)window.location.href=url;lastStatus=null;lastAt=0}catch(e){alert('Не удалось подключить Telegram: '+(e?.message||e));}finally{busy=false;if(btn){btn.disabled=false;btn.textContent='Подключить Telegram'}}}
function click(e){const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-tg-connect')){connect();return}if(b.hasAttribute('data-tg-refresh')){lastStatus=null;lastAt=0;refresh(true)}}
function patch(){if(patched)return;style();const r=window.renderPromotions;if(typeof r==='function'&&!r.__promoTelegramConnectV236128){const base=r;const wrapped=function(){const out=base.apply(this,arguments);try{render();refresh(false)}catch(e){console.warn(V,e)}return out};wrapped.__promoTelegramConnectV236128=true;wrapped.__base=base;window.renderPromotions=wrapped;try{renderPromotions=wrapped}catch(_){} }patched=true;try{render();refresh(false)}catch(_){}}
patch();
window.RESANTA_PROMOTIONS_TELEGRAM_CONNECT_V236128=Object.freeze({version:V,bot:BOT,noPolling:true,noMutationObserver:true,refresh:()=>refresh(true)});
})();
