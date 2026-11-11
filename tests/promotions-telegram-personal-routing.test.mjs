import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {promotionRecipients,privatePromotionChat} from '../supabase/functions/crm-promotions-telegram/audience.mjs';

const edge=readFileSync(new URL('../supabase/functions/crm-promotions-telegram/index.ts',import.meta.url),'utf8');
const primary=new Map([
 ['dfs',{id:'dfs',name:'Паюшин',role:'boss'}],
 ['df',{id:'df',name:'Сидарович',role:'boss'}],
 ['manager',{id:'manager',name:'Шкуран',role:'manager'}],
 ['gomel',{id:'gomel',name:'Самойлов',role:'boss'}]
]);
const assigned=(event_type,recipient_user_id)=>promotionRecipients({event_type,recipient_user_id},primary).map(x=>x.id);

test('direct personal event ownership; no automatic fan-out to every leader',()=>{
 assert.deepEqual(assigned('missing_photo','manager'),['manager']);
 assert.deepEqual(assigned('accept_work','manager'),['manager']);
 assert.deepEqual(assigned('ending_soon','manager'),['manager']);
 assert.deepEqual(assigned('close_overdue','manager'),['manager']);
 assert.deepEqual(assigned('approval_df','df'),['df']);
 assert.deepEqual(assigned('approval_dfs','dfs'),['dfs']);
 assert.deepEqual(assigned('approval_df','gomel'),['gomel']);
 assert.deepEqual(assigned('missing_photo','ghost'),[]);
 assert.deepEqual(assigned('missing_photo',null),[]);
});

test('commercial notices never go to groups or unbound users',()=>{
 assert.equal(privatePromotionChat({active:true,chat_id:321765432}),true);
 assert.equal(privatePromotionChat({active:true,chat_id:-10019234}),false);
 assert.equal(privatePromotionChat({active:true,chat_id:0}),false);
 assert.equal(privatePromotionChat({active:false,chat_id:321765432}),false);
 assert.equal(privatePromotionChat(null),false);
 assert.match(edge,/msg\?\.chat\?\.type !== 'private'/);
 assert.match(edge,/privatePromotionChat\(x\)/);
});

test('edge integrates direct-only route but retains confidential dispatch and dedup',()=>{
 assert.match(edge,/promotionRecipients\(r,primaryMap\)/);
 assert.doesNotMatch(edge,/list\.push\(\.\.\.leaders\)/);
 assert.doesNotMatch(edge,/const leaders = \(leaderUsers/);
 assert.match(edge,/x-crm-dispatch-secret/);
 assert.match(edge,/promotion_notification_delivery_log/);
 assert.match(edge,/queue_id,recipient_user_id/);
 assert.match(edge,/crm_refresh_promotion_notifications_v2/);
 assert.match(edge,/audience\.every\(x=>delivered\.has/);
 assert.match(edge,/configurePdzGroup/);
 assert.match(edge,/pdzGroupStatus/);
});

test('no browser re-render loops, polling or frontend budget changes in this release',()=>{
 assert.doesNotMatch(edge,/(MutationObserver|setInterval|\.renderBudgetsPage\s*=)/);
 assert.match(edge,/if \(!rows\.length\) return json/);
 assert.match(edge,/\.limit\(100\)/);
});
