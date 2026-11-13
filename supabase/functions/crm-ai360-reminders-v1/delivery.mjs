// No automatic retries after an ambiguous Telegram response: avoid duplicate messages.
export async function deliverReminder(row,{binding,ownerAllowed,send,save}){
 if(!ownerAllowed||!binding||Number(binding.chat_id)<=0){await save(row.id,{status:'failed',error_reason:!ownerAllowed?'owner_access_revoked':'private_telegram_not_bound'});return 'failed';}
 let result;
 try{result=await send(binding.chat_id,'Лера · напоминание\n'+row.title+(row.details&&row.details!==row.title?'\n'+row.details:''));}
 catch{await save(row.id,{status:'delivery_unknown',error_reason:'telegram_response_unknown'});return 'delivery_unknown';}
 if(!result?.ok||!Number.isSafeInteger(result.message_id)){
  await save(row.id,{status:'failed',error_reason:'telegram_rejected'});return 'failed';
 }
 const stored=await save(row.id,{status:'sent',telegram_message_id:result.message_id,delivered_at:new Date().toISOString(),error_reason:null});
 return stored?'sent':'delivery_unknown';
}
