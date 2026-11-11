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
