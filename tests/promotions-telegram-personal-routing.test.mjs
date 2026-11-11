import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {promotionRecipients,personalPromotionAudience,privatePromotionChat} from '../supabase/functions/crm-promotions-telegram/audience.mjs';

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


test('first approval is routed by verified branch, not fixed Vitebsk chief',()=>{
 const staff=[
  {id:'dfs',name:'Александр Паюшин',role:'boss',email:'payushin_ar@resanta.ru',region:'Витебск'},
  {id:'df',name:'Сидарович К.Н.',role:'boss',email:'sidarovich_kn@resanta.ru',region:'Витебск'},
  {id:'gomel',name:'Самойлов Д. С.',role:'boss',email:'samoilov_ds@resanta.ru',region:'Гомель'},
  {id:'r',name:'Руднев',role:'manager',region:'Витебск'},
  {id:'gm',name:'Новый менеджер',role:'manager',region:'Гомель'},
  {id:'foreign',name:'Кришталь',role:'manager',region:'Триовист / 21vek.by'}
 ];
 const promotions=new Map([['v','Руднев'],['g','Новый менеджер'],['x','Кришталь'],['unknown','Неизвестный']]);
 const context={staff,promotionManagers:promotions};
 const recipients=id=>personalPromotionAudience({event_type:'approval_df',promotion_id:id,recipient_user_id:'df'},primary,context).map(x=>x.id);
 assert.deepEqual(recipients('v'),['df']);
 assert.deepEqual(recipients('g'),['gomel']);
 assert.deepEqual(recipients('x'),[]); // no branch director for this scope
 assert.deepEqual(recipients('unknown'),[]);
 assert.deepEqual(recipients('missing'),[]);
 assert.deepEqual(personalPromotionAudience({event_type:'approval_dfs',promotion_id:'g',recipient_user_id:'dfs'},primary,context).map(x=>x.id),['dfs']);
 assert.deepEqual(personalPromotionAudience({event_type:'missing_photo',promotion_id:'g',recipient_user_id:'manager'},primary,context).map(x=>x.id),['manager']);
 const ambiguous={staff:[...staff,{id:'alternate',name:'Другой ДФ',role:'boss',email:'another@example.com',region:'Гомель'}],promotionManagers:promotions};
 assert.deepEqual(personalPromotionAudience({event_type:'approval_df',promotion_id:'g',recipient_user_id:'df'},primary,ambiguous),[]);
});
test('branch lookup is conditional on actual DF queue and cannot fall back to wrong branch',()=>{
 assert.match(edge,/\\.filter\\(x=>x\\.event_type==='approval_df'\\)/);
 assert.match(edge,/\\.select\\('id,name,email,role,region'\\)/);
 assert.match(edge,/APPROVAL_BRANCH_LOOKUP_FAILED/);
 assert.match(edge,/APPROVAL_BRANCH_DIRECTORY_TOO_LARGE/);
 assert.match(edge,/\\.select\\('id,promotion_id,recipient_user_id,event_type/);
});
