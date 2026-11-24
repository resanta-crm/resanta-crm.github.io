import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const visual=fs.readFileSync('assets/160-manager-kpi360-visual-v2.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261102_manager_kpi360_history_v3.sql','utf8');
const html=fs.readFileSync('index.html','utf8');

test('KPI visuals retain manager facts, client detail and export without the old ranking panels',()=>{
 new vm.Script(visual,{filename:'assets/160-manager-kpi360-visual-v2.js'});
 for(const must of [
  'Продажи по менеджерам','Новые и вернувшиеся клиенты по менеджерам',
  'АКБ по менеджерам','Выполнение плана продаж','rank_overall','rank_sales','rank_akb','rank_bonus',
  'function launchLera','function exportCsv',
  'data-manager','Вся АКБ','Закрыть список'
 ])assert.ok(visual.includes(must),'missing UI '+must);
 assert.doesNotMatch(visual,/Задачи на сегодня|Динамика за 6 месяцев|>Место<|Списки скрыты/);
 assert.ok(html.includes('160-manager-kpi360-visual-v2.js'));
 assert.match(html,/data-kv-lera[^>]*>✦ Спросить Леру/);
});

test('six-month rank SQL is ownership scoped BEFORE exposing result and uses all 3 plan metrics',()=>{
 assert.match(sql,/where id=auth\.uid\(\)/);
 assert.match(sql,/actor\.role='manager' and actor\.region='Витебск'/);
 assert.match(sql,/actor\.role='boss' and actor\.region='Витебск'/);
 assert.match(sql,/where actor\.role='boss' or r\.mk=public\.crm_v2263_norm\(actor\.name\)/);
 assert.match(sql,/from periods p\s+cross join lateral public\.crm_manager_kpi_leaderboard/);
 assert.match(sql,/when shipment_plan>0/);
 assert.match(sql,/when akb_plan>0/);
 assert.match(sql,/when bonus_plan>0/);
 assert.match(sql,/position_overall/);
 assert.match(sql,/rank_bonus/);
 assert.match(sql,/having count\(distinct id\)=1/);
 assert.match(sql,/when not exists\(/);
 assert.match(sql,/recent\.sale_month>=\(a\.sale_month-interval '6 months'\)::date/);
 assert.match(sql,/revoke all on function public\.crm_manager_kpi360_history_v3\(text\) from public,anon/);
 assert.match(sql,/grant execute on function public\.crm_manager_kpi360_history_v3\(text\) to authenticated/);
 assert.doesNotMatch(sql,/\b(insert|update|delete|truncate)\s+(?:into\s+|from\s+)?public\.(?:clients|purchase_history|manager_kpi_plans)/i);
});

test('client list is hidden until a manager is chosen',()=>{
 assert.match(visual,/host\.hidden=!target/);
 assert.match(visual,/if\(!target\)\{host\.replaceChildren\(\);return/);
 assert.match(visual,/function openManager\(data,rows,name\)/);
 assert.match(visual,/selectedManager=name;clientFilter='bonus';\s+renderDetails\(data,rows\)/);
 assert.match(visual,/<button type="button" class="kv-manager-link" data-manager=/);
});

test('no cross-manager data access from client; old plan editor and premium rules unchanged',()=>{
 assert.match(visual,/crm_manager_kpi360_dashboard_v2/);
 assert.match(visual,/crm_manager_kpi360_history_v3/);
 assert.match(visual,/if\(!isBoss\(\)&&!rows\.some/);
 assert.match(visual,/plans\.style\.display=isBoss\(\)\?'inline-flex':'none'/);
 assert.match(visual,/data\.history=\{rows:\[\],unavailable:true\}/);
 assert.match(visual,/serial===generation&&requestKey\(\)===key/);
 assert.match(visual,/6 полных месяцев/);
 assert.match(visual,/function launchLera\(\)/);
 assert.match(visual,/input\.value=question/);
 assert.doesNotMatch(visual,/querySelector\('\.rva-send'\)\?\.click\(\)/);
});
