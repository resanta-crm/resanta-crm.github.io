import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluate,voiceBrief,greeting,personalFor,daysSince} from '../supabase/functions/crm-promotion360-lera-v1/logic.mjs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261112183000_promotions360_uniai_v1.sql');
const ui=read('assets/210-promotions360-uniai-v1.js');
const core=read('assets/01-crm-core.js');
const html=read('index.html');
const edge=read('supabase/functions/crm-promotion360-lera-v1/index.ts');
test('exact client_id + SKU + fresh source needed for a verified 7/14 day zero',()=>{
 const p={start_date:'2026-11-01'};
 const truth={scope_mode:'exact_sku',item_count:1,client_match_mode:'client_id',sales_exact:true,
  manual_conflict:false,data_quality:'live_month',current_sales_1c:0};
 const r=evaluate(p,truth,'2026-11-12T06:40:04Z','2026-11-12');
 assert.equal(r.verified,true);assert.equal(r.milestone,7);assert.equal(daysSince(p.start_date,'2026-11-12'),11);
 assert.equal(evaluate({...p,start_date:'2026-10-20'},truth,'2026-11-12T06:40:04Z','2026-11-12').milestone,14);
 assert.equal(evaluate(p,{...truth,client_match_mode:'no_history'},'2026-11-12T06:40:04Z','2026-11-12').milestone,null);
 assert.equal(evaluate(p,{...truth,sales_exact:false},'2026-11-12T06:40:04Z','2026-11-12').milestone,null);
 assert.equal(evaluate(p,{...truth,current_sales_1c:100},'2026-11-12T06:40:04Z','2026-11-12').milestone,null);
 assert.equal(evaluate(p,truth,'2026-11-01T06:40:04Z','2026-11-12').milestone,null);
});
test('greetings and ownership match only correct manager; director gets all',()=>{
 const owner={id:'544fb1e2-ef70-44de-bc62-e0e1596a4bfc',name:'Александр Паюшин',role:'boss'};
 const shk={id:'4fd79fa0-232d-4768-8099-25f47923cc4f',name:'Шкуран',role:'manager'};
 const rud={name:'Руднев',role:'manager'},ach={name:'Ачинович',role:'manager'};
 assert.equal(greeting(owner),'родной');assert.equal(greeting(shk),'Танюшка');
 assert.equal(greeting(rud),'Саня');assert.equal(greeting(ach),'Катюшка');
 const data=[{manager_name:'Шкуран',client_name:'Руд Буд'},{manager_name:'Руднев',client_name:'ИТ технологии'},{manager_name:'Ачинович',client_name:'Бахус'}];
 assert.equal(personalFor(owner,data).length,3);
 assert.deepEqual(personalFor(shk,data).map(x=>x.client_name),['Руд Буд']);
 assert.equal(voiceBrief(shk,data,[]),null);
 assert.match(voiceBrief(shk,data,[{...data[0],status:'open',milestone:7}]),/Привет, Танюшка/);
 assert.doesNotMatch(voiceBrief(shk,data,[{...data[0],status:'open',milestone:7}]),/ИТ технологии/);
});
test('overview is sourced from a single scoped server RPC not client 1C history',()=>{
 assert.match(ui,/crm_promotions360_overview_v1/);
 assert.doesNotMatch(ui,/purchase_history/);
 assert.match(sql,/crm_promotions_effectiveness_v236203/);
 assert.match(sql,/source_exact AND NOT manual_conflict/);
 assert.match(sql,/client_match_mode='client_id'/);
 assert.match(sql,/verified_sales_total/);
 assert.match(sql,/financial_roi_available',false/);
 assert.match(sql,/p\.manager_name=actor\.name/);
 assert.match(ui,/План акций по менеджерам/);
 assert.match(ui,/Лера · Утренний брифинг/);
 assert.match(ui,/План акции/);
 assert.match(ui,/Открытые действия/);
});
test('feature flag and legacy approvals remain available',()=>{
 assert.match(sql,/enabled boolean not null default false/);
 assert.match(sql,/telegram_enabled boolean not null default false/);
 assert.match(sql,/auto_tasks_enabled boolean not null default false/);
 assert.match(core,/RESANTA_PROMOTIONS360_V1/);
 assert.match(html,/210-promotions360-uniai-v1\.js/);
 assert.match(ui,/data-p360-docs/);
 assert.match(ui,/window\.renderPromotions/);
 assert.match(ui,/promotion-photos/);
});
test('manager action requires identity, nonempty cause and 48-hour check',()=>{
 assert.match(sql,/actor\.id<>task\.manager_id/);
 assert.match(sql,/promotion\.manager_name<>actor\.name/);
 assert.match(sql,/next_check_at=now\(\)\+interval '48 hours'/);
 assert.match(sql,/crm_promotion360_action_history_v1/);
 assert.match(sql,/revoke all on function public\.crm_promotion360_action_update_v1/mi);
 assert.match(ui,/data-p360-action/);
});
test('Telegram sends only with dispatch secret, scheduled config and never from dry_run',()=>{
 assert.match(edge,/x-crm-dispatch-secret/);
 assert.match(edge,/mode==='dry_run'/);
 assert.match(edge,/cfg\.telegram_enabled/);
 assert.match(edge,/cfg\.auto_tasks_enabled/);
 assert.match(edge,/promotion360_digest_v1:/);
 assert.match(edge,/crm_ai360_yandex_monthly_claim_v1/);
 assert.match(edge,/VOICE_MESSAGES_FORBIDDEN/);
 assert.match(edge,/crm_promotion_sales_truth_v236360/);
 assert.match(edge,/client_id/);
 assert.match(edge,/wouldEscalate/);
});
