import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const get=name=>fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');
const ui=get('assets/169-triovist-tasks360-ux-v1.js');
const index=get('index.html');
const sql=get('supabase/migrations/20261105_triovist_disable_deprecated_subgroup_ai_task_v236254.sql');
test('old 8/10/12/15 AI plan buttons and rules are not displayed',()=>{
 assert.doesNotThrow(()=>new vm.Script(ui));
 assert.match(ui,/#tri-task-generate-btn/);
 assert.match(ui,/#tri-task-plan-size-wrap/);
 assert.match(ui,/button.disabled=true/);
 assert.match(ui,/className='tm360-generator-pause'/);
 assert.doesNotMatch(ui,/Сформировать план ИИ/);
 assert.doesNotMatch(ui,/Генератор 8 \/ 10 \/ 12 \/ 15 задач/);
});
test('server refuses abandoned generator even through legacy alias',()=>{
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.triovist_tasks_generate_subgroup_v236254/);
 assert.match(sql,/Требуется вход в CRM/);
 assert.match(sql,/Недостаточно прав для формирования плана Triovist/);
 assert.match(sql,/Старая методика задач Триовист отключена/);
 assert.doesNotMatch(sql,/INSERT INTO public\.triovist_ai_tasks|DELETE FROM public\.triovist_ai_tasks/i);
});
test('new UI version is loaded without modifying competitors or parser',()=>{
 assert.match(index,/169-triovist-tasks360-ux-v1\.js\?v=20261105-retire-old-plan1/);
 assert.match(index,/173-triovist-native-sections-v1\.js/);
 assert.match(index,/106-triovist-competitors-v236218\.js|100-safe-upgrades-loader-v236272\.js/);
});
