import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CRM_AI360_ALL_DOMAINS,CRM_AI360_MANAGED_DOMAINS,CRM_AI360_TOOLS,
 collectTool,inferVoiceDomain,getVoiceCapabilities} from '../supabase/functions/crm-ai360-dialog-v4/catalog.mjs';

test('All 34 CRM voice capabilities are still explicitly authorized',()=>{
 assert.equal(CRM_AI360_TOOLS.length,26);
 assert.equal(CRM_AI360_MANAGED_DOMAINS.length,8);
 assert.equal(CRM_AI360_ALL_DOMAINS.length,34);
 const names=CRM_AI360_ALL_DOMAINS;
 assert.equal(new Set(names).size,34);
 assert.deepEqual(getVoiceCapabilities().map(c=>c.id),names);
 assert.ok(getVoiceCapabilities().every(c=>c.requires_owner&&c.scope==='registered_read_only'));
});
test('Every registered table has explicit columns, sorting, limits and no raw access',()=>{
 for(const t of CRM_AI360_TOOLS){
  assert.match(t.table,/^[a-z][a-z0-9_]+$/);
  assert.match(t.columns,/^[a-z0-9_,]+$/);
  assert.ok(Number.isInteger(t.limit)&&t.limit>=1&&t.limit<=12,t.id);
  assert.ok(t.sort&&t.label,t.id);
 }
});
test('Natural voice expressions choose the intended read-only domains',()=>{
 const samples=[
 ['Продажи филиала','sales'],['Покажи сводку','operations'],
 ['Какие акции идут','promotions'],['Состояние Триовиста','triovist'],
 ['ВИП клиенты','vip'],['Реестр оплат','payments'],
 ['Мотивация сотрудников','motivation'],['Покажи визиты','visits'],
 ['Проверь маршруты','routes'],['Открытые задачи','tasks'],
 ['ПДЗ по просрочке','debt'],['GPS контроль','gps'],
 ['Остатки склада','stock'],['Свежесть остатков','stock_freshness'],
 ['Уценка товара','markdown'],['Стенды на торговых точках','stands'],
 ['Комплектация ТСД','warehouse_orders'],['Приёмка склада','warehouse_receiving'],
 ['Инвентаризация склада','warehouse_inventory'],['Конкуренты на 21vek','competitors'],
 ['Карточки 21vek','cards_21vek'],['Ошибки карточек','card_issues'],
 ['Остатки Триовиста','triovist_stock'],['Задачи Триовиста','triovist_tasks'],
 ['ВИП рекомендации','vip_actions'],['Поступления денег','cash'],
 ['Бюджет акции','promotion_budgets'],['Цены МРЦ','mrc'],
 ['Инфографика','infographics'],['Скорость парсера','parser'],
 ['Падающие клиенты','clients']
 ];
 for(const [q,expected] of samples)assert.equal(inferVoiceDomain(q),expected,q);
});
function mockDb(rows){
 const calls=[];
 const builder={eq(...args){calls.push(['eq',...args]);return this;},
  order(...args){calls.push(['order',...args]);return this;},
  range(...args){calls.push(['range',...args]);return this;},
  abortSignal(){calls.push(['signal']);return this;},
  then(resolve){resolve({data:rows,error:null});}
 };
 const svc={from(table){calls.push(['from',table]);return {select(cols){calls.push(['select',cols]);return builder;}}}};
 return {svc,calls};
}
test('Pages never leak the continuation sentinel and expose next offset',async()=>{
 const {svc,calls}=mockDb(Array.from({length:7},(_,i)=>({sku:String(i)})));
 const x=await collectTool(svc,'competitors',{offset:0});
 assert.equal(x.rows.length,6);
 assert.deepEqual(x.rows.map(z=>z.sku),['0','1','2','3','4','5']);
 assert.equal(x.has_more,true);assert.equal(x.partial,true);
 assert.equal(x.next_offset,6);assert.equal(x.total_count_known,false);
 assert.ok(calls.some(c=>c[0]==='range'&&c[1]===0&&c[2]===6));
});
test('A following page keeps the start offset; no phantom next page',async()=>{
 const {svc,calls}=mockDb([{sku:'7'},{sku:'8'}]);
 const x=await collectTool(svc,'competitors',{offset:6});
 assert.equal(x.offset,6);assert.equal(x.rows.length,2);
 assert.equal(x.has_more,false);assert.equal(x.next_offset,null);
 assert.ok(calls.some(c=>c[0]==='range'&&c[1]===6&&c[2]===12));
});
test('Strict limits and security boundaries on the server remain in place',()=>{
 const index=fs.readFileSync('supabase/functions/crm-ai360-dialog-v4/index.ts','utf8');
 const core=fs.readFileSync('supabase/functions/crm-ai360-dialog-v4/core.mjs','utf8');
 assert.match(index,/userId !== OWNER_ID/);
 assert.match(index,/profile\.data\?\.role !== 'boss'/);
 assert.match(index,/getTool\(lastDomain\)\?lastNextOffset/);
 assert.match(index,/isNextPage\?Math\.max\(0,Math\.min\(200/);
 assert.match(index,/domain:'client_detail'/);
 assert.match(core,/total_count_known=false/);
 assert.match(core,/last_page_identity_is_not_a_new_customer|const key=domain/);
});
