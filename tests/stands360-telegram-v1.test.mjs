import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assessStand,recipientStandRows,briefing,greet,monthStart} from '../supabase/functions/crm-stands-telegram-v1/stands-brief.mjs';
const src=readFileSync(new URL('../supabase/functions/crm-stands-telegram-v1/index.ts',import.meta.url),'utf8');
const now='2026-11-11';
const manager={id:'rud',role:'manager',name:'Руднев',region:'Витебск'};
const others=[manager,{id:'achi',role:'manager',name:'Ачинович',region:'Витебск'},{id:'tri',role:'manager',name:'Кришталь',region:'Триовист',access_scope:'triovist'}];
const p={id:'stand1',client_id:'cid1',client_name:'Наврузов ИП',manager_name:'Руднев',asset_id:'os1',
 installed_at:'2026-01-02',last_control_at:'2026-11-09',last_control_photo_path:'p.jpg',vision_status:'ok',days_installed:300};
test('routes remind but GPS is never required',()=>{
 const o=assessStand(p,[],[],now,true);
 assert.match(o.action,/По маршруту проверить наш стенд/);
 assert.equal(o.route_today,true);
 assert.equal(o.needs_photo,false);
 assert.doesNotMatch(src,/gps_verified|gps_lat|gps_lng|mock_location/);
});
test('no-route seller photos are requested independently and last shipment uses month',()=>{
 const x=assessStand({...p,last_control_at:'2026-09-11',last_control_photo_path:'old.jpg'},
  [{sku:'00001'}],[{client_id:'cid1',sku:'00001',month:'2026-08-01',revenue:100}],now,false);
 assert.match(x.action,/Получить актуальное фото/);
 assert.equal(x.last_ship_month,'2026-08-01');
});
test('poor shipments for registered SKU are flagged, unrelated SKU is excluded',()=>{
 const history=[
  {client_id:'cid1',sku:'A-001',month:'2026-04-01',revenue:3000},
  {client_id:'cid1',sku:'A-001',month:'2026-10-01',revenue:100},
  {client_id:'cid1',sku:'B-999',month:'2026-11-01',revenue:500000},
  {client_id:'other',sku:'A-001',month:'2026-11-01',revenue:100000}
 ];
 const o=assessStand(p,[{sku:'A-001'}],history,now,false);
 assert.equal(o.ship_6m,100);
 assert.equal(o.ship_prev_6m,3000);
 assert.match(o.action,/Проверить слабые отгрузки SKU/);
});
test('user IDs and exact manager surname scope avoid leaks',()=>{
 const rows=[{manager_name:'Руднев',action:'check',client_id:'cid1',client_name:'A'},{manager_name:'Ачинович',action:'check',client_id:'cid2',client_name:'B'}];
 assert.equal(recipientStandRows(manager,rows,others).length,1);
 assert.equal(recipientStandRows({...manager,id:'forged'},rows,others).length,0);
 assert.equal(recipientStandRows({role:'boss',email:'payushin_ar@resanta.ru',name:'Паюшин'},rows,others).length,2);
 assert.equal(recipientStandRows({role:'boss',email:'other@resanta.ru',name:'Branch',region:'Другая'},rows,others).length,0);
 assert.equal(greet(manager),'Саня');
 assert.equal(greet({name:'Ачинович'}),'Катюшка');
});
test('voice brief is short and is a summary, not a command or fabricated payment',()=>{
 const b=briefing(manager,[assessStand(p,[],[],now,true)],now);
 assert.ok(b.voice.length<=240);
 assert.match(b.voice,/Привет, Саня/);
 assert.match(b.lines.join(' '),/ID cid1/);
 assert.doesNotMatch(b.voice,/клиент оплатил|поступили деньги/);
 assert.equal(monthStart(now,-5),'2026-06-01');
});
test('Telegram deployment remains isolated from PDZ, protected, deduplicated and gated',()=>{
 for(const str of ['x-crm-dispatch-secret','stand360_telegram_config','stand360_text_sent:',
 'stand360_route_v2_audio:','crm_ai360_yandex_monthly_claim_v1','VOICE_MESSAGES_FORBIDDEN','sendAudio','sendVoice'])
  assert.ok(src.includes(str),str);
 assert.doesNotMatch(src,/setWebhook\(|getUpdates\(|voice_transcribe|createBot\(/);
 assert.doesNotMatch(src,/\\.from\(['"]client_debt['"]\)/);
});

test('textual stand descriptions are not labelled zero sales in Telegram',()=>{
 const desc=[{sku:'УШМ Ресанта 1 скю'},{sku:'Шуруповёрт Вихрь 2 скю'}];
 const hist=[{client_id:'cid1',sku:'75/12/3',month:'2026-10-01',revenue:45000}];
 const p={id:'stand1',client_id:'cid1',client_name:'ВикингМаркетБай',manager_name:'Шкуран',
  asset_id:'os1',last_control_at:'2026-11-10',last_control_photo_path:'photo.jpg',days_installed:300};
 const x=assessStand(p,desc,hist,now,false);
 assert.equal(x.matched_sku_count,0);
 assert.equal(x.client_history_count,1);
 assert.match(x.action,/Сверить SKU стенда с каталогом/);
 assert.doesNotMatch(x.action,/слабые отгрузки/i);
 const brief=briefing({id:'shk',name:'Шкуран',role:'manager'},[x],now);
 assert.match(brief.lines.join(' '),/не сопоставлено с 1С/);
 assert.doesNotMatch(brief.lines.join(' '),/0 BYN/);
});
test('absent 1C client link is different from verified missing shipments',()=>{
 const p={id:'stand1',client_id:'cid1',client_name:'ИТ технологии',manager_name:'Руднев',
  asset_id:'os1',last_control_at:'2026-11-10',last_control_photo_path:'photo.jpg',days_installed:300};
 const x=assessStand(p,[{sku:'75/12/3'}],[],now,false);
 assert.match(x.action,/Сверить ID клиента/);
 assert.equal(x.matched_sku_count,0);
});
