/* RESANTA CRM v23.6.25 · LOGIN SAFETY
 * Prevents the office-manager account from being accidentally reused by another
 * user on a shared browser. Does not change Supabase auth or saved sessions.
 */
(function(){
'use strict';
if(window.RESANTA_LOGIN_SAFETY_V23625)return;
const OFFICE_EMAIL='vitebsk@resanta.ru';
let userTouched=false;
function els(){return {email:document.getElementById('login-email'),pass:document.getElementById('login-pass'),wrap:document.getElementById('login-wrap')}}
function tune(){
  const {email,pass}=els();
  if(email){
    email.setAttribute('autocomplete','off');
    email.setAttribute('autocapitalize','none');
    email.setAttribute('spellcheck','false');
    if(!email.dataset.loginSafetyBound){email.dataset.loginSafetyBound='1';email.addEventListener('input',()=>{userTouched=true},{passive:true})}
  }
  if(pass){
    pass.setAttribute('autocomplete','new-password');
    if(!pass.dataset.loginSafetyBound){pass.dataset.loginSafetyBound='1';pass.addEventListener('input',()=>{userTouched=true},{passive:true})}
  }
}
function clearOfficeAutofill(){
  const {email,pass,wrap}=els();
  if(!email||!pass||!wrap||userTouched)return false;
  if(getComputedStyle(wrap).display==='none')return false;
  if(String(email.value||'').trim().toLowerCase()!==OFFICE_EMAIL)return false;
  email.value='';pass.value='';
  try{email.dispatchEvent(new Event('input',{bubbles:true}));pass.dispatchEvent(new Event('input',{bubbles:true}))}catch(_){}
  return true;
}
function clearLoginFields(){
  const {email,pass}=els();
  if(email)email.value='';if(pass)pass.value='';userTouched=false;
}
function install(){
  tune();
  [0,120,450,1000].forEach(ms=>setTimeout(()=>{tune();clearOfficeAutofill()},ms));
  try{
    if(typeof doLogout==='function'&&!doLogout.__loginSafetyV23625){
      const base=doLogout;
      const wrapped=async function(){try{return await base.apply(this,arguments)}finally{setTimeout(clearLoginFields,0)}};
      wrapped.__loginSafetyV23625=true;
      doLogout=wrapped;window.doLogout=wrapped;
    }
  }catch(_){}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
window.addEventListener('pageshow',()=>setTimeout(install,0));
window.RESANTA_LOGIN_SAFETY_V23625=Object.freeze({version:'v23.6.25',officeAutofillIsolation:true,authUntouched:true});
})();
