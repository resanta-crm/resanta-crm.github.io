/* RESANTA CRM loader · promotions close flow v23.6.56 */
(function(){
'use strict';
if(window.RESANTA_PROMOTIONS_CLOSE_V23656||document.querySelector('script[data-promotions-close-v23656]'))return;
const s=document.createElement('script');
s.src='./assets/65-promotions-close-v23656.js?_='+Date.now();
s.async=true;
s.dataset.promotionsCloseV23656='1';
s.onerror=()=>console.warn('Promotions close v23.6.56 failed to load; base promotions remain available.');
document.head.appendChild(s);
})();