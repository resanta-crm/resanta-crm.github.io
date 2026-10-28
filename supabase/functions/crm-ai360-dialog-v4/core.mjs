// Server orchestration of model-requested, validated read-only CRM tools.
export const CORE_LIMITS=Object.freeze({rounds:3,maxTools:4,evidenceChars:2200});
export const CORE_MODEL='gpt-5.4-mini';
export function readToolDefinition(domains){
 return {type:'function',name:'crm_read',
  description:'Read verified CRM information from a permitted domain. Use additional reads if a previous result indicates another useful cause or follow-up check.',
  strict:true,parameters:{type:'object',additionalProperties:false,properties:{
   domain:{type:'string',enum:domains},
   manager:{type:['string','null']},
   month:{type:['string','null']}
  },required:['domain','manager','month']}
 };
}
export function parseModelPair(response){
 const value=(response?.output||[]).filter(x=>x.type==='message').flatMap(x=>x.content||[])
 .filter(x=>x.type==='output_text').map(x=>String(x.text||'')).join('').trim();
 try{const v=JSON.parse(value);
  return typeof v.brief==='string'&&typeof v.detail==='string'&&typeof v.offer==='string'?v:null;
 }catch{return null;}
}
