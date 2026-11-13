import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {routeMatchesStand,selectDelivery,briefing,assessStand} from '../supabase/functions/crm-stands-telegram-v1/stands-brief.mjs';
const read=x=>readFileSync(new URL('../'+x,import.meta.url),'utf8');
const ui=read('assets/268-stands360-uniai-unix-v2.js');
const css=read('assets/269-stands360-feedback-v3.css');
const sql=read('supabase/migrations/20261112133500_stands360_v3_feedback.sql');
const tg=read('supabase/functions/crm-stands-telegram-v1/index.ts');
const route={approved:true,removed:false,is_office_day:false,manager_name:'Руднев',client_id:'client-a'};
const stand={id:'stand-a',client_id:'client-a',client_name:'Клиент №1',manager_name:'Руднев',asset_id:'os',vision_status:'review'};
test('route matches only approved current ID, linked ID or confirmed physical point, never client name',()=>{
 assert.equal(routeMatchesStand(route,stand),true);
 assert.equal(routeMatchesStand({...route,approved:false},stand),false);
 assert.equal(routeMatchesStand({...route,removed:true},stand),false);
 assert.equal(routeMatchesStand({...route,manager_name:'Шкуран'},stand),false);
 assert.equal(routeMatchesStand({...route,client_id:'different',client_name:stand.client_name},stand),false);
 assert.equal(routeMatchesStand({...route,client_id:'different',linked_client_ids:['client-a']},stand),true);
 assert.equal(routeMatchesStand({...route,client_id:'different',physical_point_id:'point-1'},stand,[{point_id:'point-1',client_id:'client-a'}]),true);
});
test('manager receives only today route; no route skips daily, nonroute exceptions weekly max three',()=>{
 const manager={id:'x',role:'manager',name:'Руднев'};
 const candidates=Array.from({length:8},(_,i)=>assessStand({...stand,id:String(i),client_name:'Клиент '+i,asset_id:null},[],[],'2026-11-12',false));
 assert.equal(selectDelivery(manager,candidates,'2026-11-12').mode,'skip');
 const monday=selectDelivery(manager,candidates,'2026-11-16');
 assert.equal(monday.mode,'weekly');assert.equal(monday.rows.length,3);
 const oneRoute=[{...candidates[0],route_today:true},...candidates.slice(1)];
 const only=selectDelivery(manager,oneRoute,'2026-11-12');
 assert.equal(only.mode,'route');assert.equal(only.rows.length,1);
});
test('director voice enumerates all ten, not only first client',()=>{
 const u={id:'544fb1e2-ef70-44de-bc62-e0e1596a4bfc',name:'Александр Паюшин',role:'boss'};
 const data=Array.from({length:10},(_,i)=>({...stand,client_name:'Клиент '+(i+1),action:'Проверить фото',needs_photo:i%2===0,matched_sku_count:0,sku_count:3,route_today:false}));
 const b=briefing(u,data,'2026-11-12','director',10);
 assert.match(b.voice,/Привет, Александр/);
 for(let i=1;i<=10;i++)assert.ok(b.voice.includes('Клиент '+i+' —'),String(i));
 assert.equal(b.lines.length,10);assert.equal(b.stand_count,10);
});
test('server scopes route to manager and verified relationship and sends no daily backlog',()=>{
 for(const q of ["selectDelivery(user,own,now)","routeMatchesStand(r,p,links||[])","route_physical_point_clients","linked_client_ids","approved,removed,is_office_day","mode==='skip'","stand360_route_v2_text:","dry_run"])
  assert.ok(tg.includes(q),q);
 assert.doesNotMatch(tg,/route\=\(routes\|\|\[\]\)\.some\(r\=\>r\.client_id\=\=\=p\.client_id/);
});
test('photo original can zoom and seller photo reruns Vision without GPS',()=>{
 for(const x of ["openOriginalPhoto","createSignedUrl(current,600)","pointerdown","pointermove","wheel","s268-photo-overlay","rerunVision","crm-stands-vision-v236347","Проверить фото с ИИ"])
  assert.ok(ui.includes(x),x);
 assert.match(css,/touch-action:none/);
 assert.match(ui,/crm_stands_photo_control_v1/);
});
test('multiple SKU selection and legal/asset changes are audited, not overwriting 1C or raw rows',()=>{
 for(const q of ["crm_stands_multi_sku_save_v3","crm_stands_client_bind_v3","crm_stands_asset_confirm_v3","crm_stands_points_find_v3","crm_stands_360_skus_v3","crm_stands_360_v3","stand_360_edit_audit_v3","array_agg","in_full_catalog is true"])
  assert.ok(sql.includes(q),q);
 for(const q of ["data-s268-save-group","data-s268-add","data-s268-drop","data-s268-client-save","data-s268-asset-confirm"])
  assert.ok(ui.includes(q),q);
 assert.doesNotMatch(sql,/delete from public\.stand_placement_items_v236346/i);
 assert.doesNotMatch(sql,/update public\.purchase_history/i);
 assert.match(sql,/private\.crm_stands_v3_check\(p_placement_id,false\)/);
 assert.match(sql,/private\.crm_stands_v3_check\(p_placement_id,true\)/);
});
test('explainable 25/25/35/15 AI and missing evidence not mistaken for negative performance',()=>{
 for(const weight of [25,35,15])assert.match(ui,new RegExp(',\\s*'+weight+'\\s*,'));
 assert.match(ui,/available>=50/);
 assert.match(ui,/полнота/);
 assert.match(ui,/не является розничными продажами со стенда/);
 assert.doesNotMatch(ui,/crm_stands_return_placement/);
});
