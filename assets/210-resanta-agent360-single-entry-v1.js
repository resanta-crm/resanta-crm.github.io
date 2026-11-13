/* RESANTA AI Agent 360 - opt-in client adapter, without new CRM UI or auto-start.
 * The same adapter can be loaded by existing browser, Android WebView and INMO
 * after each platform's explicit user activation; server always checks scope.
 * This file alone does not activate microphone, speakers or native background wake.
 */
(function(w){
 'use strict';
 if(w.crmAgent360SingleEntryV1)return;
 const ENDPOINT='crm-ai360-agent-v1';
 let history=[],memory={},activeUser='',inFlight=false;
 const clean=s=>String(s||'').trim();
 function userId(){
  try{return typeof currentUser!=='undefined'?clean(currentUser?.id):'';}
  catch{return '';}
 }
 function clear(){history=[];memory={};activeUser='';}
 function client(){
  return typeof db!=='undefined'&&db?.functions?.invoke?db:null;
 }
 async function session(){
  if(typeof w.crmEnsureFreshSessionV236166==='function')
   return w.crmEnsureFreshSessionV236166(false);
  if(!client()?.auth?.getSession)return null;
  const result=await client().auth.getSession();
  return result?.data?.session||null;
 }
 function assertCurrent(id){
  if(!id||!userId()||id!==userId()){
   clear();throw new Error('agent_session_changed');
  }
 }
 async function invoke(action,question){
  if(inFlight)throw new Error('agent_request_in_progress');
  inFlight=true;
  try{
   const id=userId();
   if(!id||!client())throw new Error('agent_not_authorized');
  if(activeUser&&activeUser!==id)clear();
  activeUser=id;
  const s=await session();
  assertCurrent(id);
  if(!s?.access_token)throw new Error('agent_not_authorized');
  const payload=action==='capabilities'?{action}:
   {action:'ask',question,history:history.slice(-6),memory};
   const response=await client().functions.invoke(ENDPOINT,{body:payload});
   assertCurrent(id);
   if(response.error||response.data?.error)
    throw new Error(String(response.data?.error||response.error?.message||'agent_unavailable').slice(0,90));
   if(!response.data)throw new Error('agent_empty_response');
   if(action==='ask'){
    const answer=clean(response.data.answer||response.data.brief);
    if(!answer)throw new Error('agent_empty_answer');
    history.push({role:'user',content:question.slice(0,1000)},
     {role:'assistant',content:answer.slice(0,250)});
    history=history.slice(-6);
    if(response.data.memory&&typeof response.data.memory==='object')
     memory={...response.data.memory};
   }
   return response.data;
  }finally{inFlight=false;}
 }
 w.crmAgent360SingleEntryV1=Object.freeze({
  version:'1.0.0',
  // Only explicit calls invoke the network. No polling or automatic mic activation.
  ask:question=>{
   if(typeof question!=='string'||question.trim().length<2||question.length>2400)
    return Promise.reject(new Error('agent_question_invalid'));
   return invoke('ask',question.trim());
  },
  capabilities:()=>invoke('capabilities'),
  reset:clear
 });
})(window);
