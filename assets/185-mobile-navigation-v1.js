/* Complete role-aware mobile navigation and disposable in-app GPS viewer. */
(function(w){
'use strict';
if(w.crmMobileNavigationV1)return;
let menu=null,viewer=null,frame=null,previousFocus=null;
function closeMenu(){if(menu){menu.remove();menu=null;}previousFocus?.focus?.();}
function openMenu(){
 closeMenu();previousFocus=document.activeElement;
 menu=document.createElement('div');menu.className='crm-mobile-menu';menu.setAttribute('role','dialog');menu.setAttribute('aria-modal','true');menu.setAttribute('aria-label','Разделы CRM');
 menu.innerHTML='<section><header><b>Все разделы</b><button type="button" aria-label="Закрыть меню">✕</button></header><div class="crm-mobile-menu-grid"></div></section>';
 menu.querySelector('header button').onclick=closeMenu;
 menu.addEventListener('click',e=>{if(e.target===menu)closeMenu()});
 const grid=menu.querySelector('.crm-mobile-menu-grid');
 for(const source of document.querySelectorAll('.sidebar .nav-item')){
  if(source.hidden||getComputedStyle(source).display==='none')continue;
  const b=document.createElement('button');b.type='button';b.textContent=source.textContent.trim();
  b.className=source.classList.contains('active')?'selected':'';
  b.onclick=()=>{closeMenu();source.click()};grid.append(b);
 }
 document.getElementById('app')?.append(menu);menu.querySelector('header button').focus();
}
function closeGps(){if(frame)frame.src='about:blank';viewer?.remove();viewer=null;frame=null;previousFocus?.focus?.();}
function openGps(id){
 if(!w.matchMedia('(max-width:768px)').matches&&!document.documentElement.classList.contains('native-app'))return false;
 if(!/^[a-f0-9-]{36}$/i.test(String(id)))return true;
 closeGps();previousFocus=document.activeElement;
 viewer=document.createElement('section');viewer.className='crm-mobile-gps';viewer.setAttribute('role','dialog');viewer.setAttribute('aria-label','GPS-маршрут');viewer.setAttribute('aria-modal','true');
 const close=document.createElement('button');close.className='crm-mobile-gps-back';close.textContent='← К списку менеджеров';close.onclick=closeGps;
 frame=document.createElement('iframe');frame.title='Карта выбранного рабочего дня';frame.src='./assets/gps-viewer-v2360.html?workday='+encodeURIComponent(id)+'&v=20261106-feedback';
 viewer.append(close,frame);document.getElementById('app')?.append(viewer);close.focus();return true;
}
w.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===frame?.contentWindow&&e.data?.type==='resanta-gps-close')closeGps()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenu();closeGps()}});
function install(){
 const bar=document.querySelector('.bottom-nav');if(!bar||document.getElementById('bn-all-sections'))return;
 const b=document.createElement('button');b.type='button';b.id='bn-all-sections';b.className='bn-item';b.innerHTML='☰<span>Разделы</span>';b.onclick=openMenu;bar.prepend(b);
 const style=document.createElement('style');style.textContent=`
 #bn-all-sections{position:sticky;left:0;z-index:2;background:#fff;box-shadow:3px 0 9px #152e4820;color:#185fa5;font-weight:800}
 .crm-mobile-menu{position:fixed;inset:0;z-index:20000;background:#152e4870;display:flex;align-items:flex-end;padding:10px}
 .crm-mobile-menu>section{background:#f8fafc;width:100%;max-height:85dvh;overflow:auto;border-radius:18px;padding:16px 16px calc(16px + env(safe-area-inset-bottom));box-shadow:0 8px 32px #10243a40}
 .crm-mobile-menu header{display:flex;justify-content:space-between;align-items:center;font-size:19px;margin-bottom:16px}
 .crm-mobile-menu header button{border:0;background:#e8eef5;border-radius:12px;padding:10px 15px;font-size:18px}
 .crm-mobile-menu-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
 .crm-mobile-menu-grid button{border:1px solid #dce4ed;background:#fff;border-radius:12px;padding:14px 10px;text-align:left;min-height:55px;font-size:13px;overflow-wrap:anywhere;color:#18334e}
 .crm-mobile-menu-grid button.selected{background:#e5f1ff;border-color:#185fa5;color:#185fa5;font-weight:800}
 .crm-mobile-gps{position:fixed;inset:0;z-index:19000;background:#f8fafc;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}
 .crm-mobile-gps-back{border:0;border-bottom:1px solid #dce4ed;background:#fff;padding:14px;text-align:left;color:#185fa5;font-size:15px;font-weight:700}
 .crm-mobile-gps iframe{border:0;flex:1;width:100%;min-height:0}
 @media(min-width:769px){#bn-all-sections{display:none}.crm-mobile-menu>section{max-width:700px;margin:auto}}
 `;document.head.append(style);
}
w.crmMobileGpsOpenV1=openGps;w.crmMobileNavigationV1={openMenu,closeMenu,closeGps};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(window);
