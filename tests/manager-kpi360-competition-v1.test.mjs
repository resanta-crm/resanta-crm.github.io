import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const moduleJs=fs.readFileSync('assets/165-kpi360-mpp-competition-v1.js','utf8');
const dashboard=fs.readFileSync('assets/160-manager-kpi360-visual-v2.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261102_manager_kpi360_history_competition_v4.sql','utf8');
const html=fs.readFileSync('index.html','utf8');
function start(){
 const window={};
 const document={readyState:'loading',addEventListener(){}};
 new vm.Script(moduleJs).runInNewContext({window,document});
 return window.RESANTA_KPI360_LEAGUE_V1;
}
const base={
 month:'2026-10',
 sales:[{manager_name:'Ачинович',shipment:101566,shipment_plan:145000}],
 history:{version:'kpi360-history-v4',
 team:[
  {month:'2026-09',manager_name:'Ачинович',rank_overall:3,overall_score:81,team_size:3},
  {month:'2026-09',manager_name:'Руднев',rank_overall:1,overall_score:119,team_size:3},
  {month:'2026-09',manager_name:'Шкуран',rank_overall:2,overall_score:92,team_size:3},
  {month:'2026-10',manager_name:'Руднев',rank_overall:1,overall_score:133,team_size:3},
  {month:'2026-10',manager_name:'Ачинович',rank_overall:2,overall_score:109,team_size:3},
  {month:'2026-10',manager_name:'Шкуран',rank_overall:3,overall_score:63,team_size:3}
 ],
 rows:[{month:'2026-10',manager_name:'Ачинович',sales:101566,sales_plan:145000,akb:33,akb_plan:37,bonus:5,bonus_plan:3}]
 }};
test('MPP league computes October ranks, upward trend, and gap from real sanitized scores',()=>{
 const m=start().model(base,{role:'manager',name:'Ачинович'});
 assert.equal(m.self.rank_overall,2);
 assert.equal(m.movement,1);
 assert.equal(m.gap,24);
 assert.equal(m.board.length,3);
 assert.equal(m.series.length,2);
});
test('competition remains hidden to bosses and when team scores unavailable',()=>{
 const ui=start();
 assert.equal(ui.markup(base,{role:'boss',name:'Директор'}),'');
 assert.equal(ui.model(base,{role:'boss',name:'Директор'}),null);
 assert.match(ui.markup({...base,history:{rows:[]}}, {role:'manager',name:'Ачинович'}),/Рейтинг появится/);
});
test('league never renders confidential customer sales or clients',()=>{
 const html=start().markup(base,{role:'manager',name:'Ачинович'});
 assert.match(html,/Руднев/);
 assert.match(html,/Ачинович/);
 assert.match(html,/109%/);
 assert.match(html,/24 п.п./);
 assert.doesNotMatch(html,/101566/);
 assert.doesNotMatch(html,/145000/);
 assert.doesNotMatch(html,/client_name|client_id/);
});
test('secure SQL gives managers only own detailed rows and all-staff sanitized ranks',()=>{
 assert.match(sql,/where id=auth\.uid\(\)/);
 assert.match(sql,/actor\.role='manager' and actor\.region='Витебск'/);
 assert.match(sql,/filter \(where actor\.role='boss' or r\.mk=public\.crm_v2263_norm\(actor\.name\)\)/);
 assert.match(sql,/into result_json,team_json/);
 assert.match(sql,/'team',coalesce\(team_json/);
 assert.match(sql,/'competition_scope','team_names_places_and_overall_score_only'/);
 assert.match(sql,/revoke all on function public\.crm_manager_kpi360_history_v4\(text\) from public,anon/);
 assert.doesNotMatch(sql,/\b(update|delete|insert|truncate)\s+(?:into\s+|from\s+)?public\.(?:purchase_history|clients|manager_kpi_plans)/i);
});
test('approved KPI view calls v4 with fallback and loads competition module first',()=>{
 assert.match(dashboard,/crm_manager_kpi360_history_v4/);
 assert.match(dashboard,/crm_manager_kpi360_history_v3/);
 assert.match(dashboard,/RESANTA_KPI360_LEAGUE_V1\?\.markup/);
 assert.ok(html.indexOf('165-kpi360-mpp-competition-v1.js')<html.indexOf('160-manager-kpi360-visual-v2.js'));
 assert.match(html,/160-manager-kpi360-visual-v2\.js\?v=20261102-5/);
});
