/* RESANTA CRM v23.6.47 compatibility bridge -> v23.6.49 root */
(function(){'use strict';
if(window.RESANTA_TRIOVIST_MONTH_ROOT_V23649||document.querySelector('script[data-triovist-month-root-v23649]'))return;
const s=document.createElement('script');
s.src='./assets/59-triovist-month-root-v23649.js?_='+Date.now();
s.async=false;
s.dataset.triovistMonthRootV23649='1';
s.onerror=()=>console.warn('Triovist month root v23.6.49 failed to load; base tasks remain available.');
document.head.appendChild(s);
window.RESANTA_TRIOVIST_MONTH_CYCLE_V23647=Object.freeze({version:'v23.6.47-bridge',root:'v23.6.49'});
})();