// Promotions: explicit primary ownership only.
// Never fan out manager reminders to senior leaders; approval tasks are
// independently addressed by the existing queue to their approvers.
export function promotionRecipients(row,usersById){
 const owner=row?.recipient_user_id?usersById.get(String(row.recipient_user_id)):null;
 return owner?.id?[owner]:[];
}
// A private chat is required for individual commercial information.
// Telegram groups / supergroups have negative chat ids.
export function privatePromotionChat(binding){
 return binding?.active===true &&
   typeof binding.chat_id!=='undefined' &&
   Number.isSafeInteger(Number(binding.chat_id)) && Number(binding.chat_id)>0;
}

const normalize = value => String(value||'').trim().toLocaleLowerCase('ru-RU').replaceAll('ё','е').replace(/\\s+/g,' ');
// The current queue historically targets the Vitebsk DF. Correct only the
// first-approval recipient using authenticated server-side CRM staff/region facts.
// Never fall back to the former Vitebsk approver when the branch is unknown.
export function personalPromotionAudience(row,usersById,branchContext){
 if(row?.event_type!=='approval_df')return promotionRecipients(row,usersById);
 if(!row?.promotion_id||!branchContext)return[];
 const managerName=branchContext.promotionManagers?.get(String(row.promotion_id));
 const managerMatches=(branchContext.staff||[]).filter(p=>p?.role==='manager'&&normalize(p.name)===normalize(managerName));
 if(managerMatches.length!==1)return[];
 const region=normalize(managerMatches[0].region);
 if(!region)return[];
 const directors=(branchContext.staff||[]).filter(p=>
   p?.role==='boss'&&normalize(p.region)===region&&
   normalize(p.email)!=='payushin_ar@resanta.ru');
 return directors.length===1?[directors[0]]:[];
}
