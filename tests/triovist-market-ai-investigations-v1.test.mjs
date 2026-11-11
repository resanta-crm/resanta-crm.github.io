import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const get=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const edge=get('supabase/functions/triovist-market-investigate-v1/index.ts');
const ui=get('assets/266-triovist-market-ai-investigations-v1.js');
const index=get('index.html');
const sql=get('supabase/migrations/20261111134000_triovist_market_ai_investigations_v1.sql');
const action=get('.github/workflows/triovist-market-ai-investigations.yml');

test('new UI and isolated Edge source parse; no direct mutations to competitor parser',()=>{
 assert.doesNotThrow(()=>new vm.Script(ui));
 assert.doesNotThrow(()=>new vm.Script(edge.replace(/^import .*;$/m,'')));
 assert.match(index,/266-triovist-market-ai-investigations-v1\.js\?v=20261111-ai-investigations-v1/);
 assert.match(ui,/insertAdjacentElement\('afterend',el\)/);
 assert.match(ui,/#tr14-panel \[data-tm225\]/);
 assert.doesNotMatch(ui,/\b(?:delete from|alter table|update public\.triovist_market|insert into public\.triovist_market)/i);
});
test('all market scopes are discovered dynamically: no two-category pilot',()=>{
 assert.match(edge,/triovist_market_dashboard_meta_cache_v236357/);
 assert.match(edge,/m\.scopes\.map/);
 assert.match(edge,/scopes_total:groups\.length/);
 assert.match(edge,/triovist_21vek_position_metrics_v236351/);
 assert.match(edge,/triovist_market_comp_position_current_v236352/);
 assert.match(ui,/Все подключённые подгруппы/);
 assert.match(ui,/Групп с сигналами/);
 assert.doesNotMatch(edge,/const (?:ACTIVE|ENABLED|PILOT)_SCOPES\s*=/);
});
test('significance is based on actual ranking changes, not a made-up position',()=>{
 const start=edge.indexOf('function signal(s){');
 const end=edge.indexOf('async function feed(svc){',start);
 const code=edge.slice(start,end);
 const ctx={num:x=>x===null||x===undefined||x===''?null:Number(x)};
 vm.runInNewContext(code+';this.signal=signal;',ctx);
 const fall=ctx.signal({kind:'own',movement:'down',previous_position:25,position:37});
 assert.equal(fall.delta,-12);
 assert.ok(fall.priority>0);
 assert.equal(ctx.signal({kind:'own',movement:'down',previous_position:25,position:27}),null);
 const grow=ctx.signal({kind:'competitor',movement:'up',previous_position:85,position:64});
 assert.equal(grow.delta,21);
 assert.equal(ctx.signal({kind:'competitor',movement:'up',previous_position:85,position:82}),null);
 assert.equal(ctx.signal({kind:'competitor',movement:'outside',previous_position:null,position:null}),null);
});
test('only named live CRM accounts can access service; service key only as cron',()=>{
 assert.match(edge,/svc\.auth\.getUser\(token\)/);
 assert.match(edge,/\.from\("users"\)\.select\("id,email,role,access_scope"\)/);
 assert.match(edge,/prof\.role==="boss"/);
 assert.match(edge,/prof\.access_scope==="triovist"/);
 assert.match(edge,/body\.action==="daily" && key && token===key && !origin/);
 assert.match(edge,/if\(actor\.cron&&body\.action!=="daily"\)/);
 assert.match(edge,/if\(!actor\.leader\)throw fail\("director_only",403\)/);
 assert.match(edge,/item\.manager_email!==actor\.email/);
 assert.doesNotMatch(ui,/SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY/);
});
test('AI uses grounded server-fetched evidence, never browser supplied facts',()=>{
 assert.match(edge,/async function itemEvidence\(svc,scope,kind,key\)/);
 assert.match(edge,/triovist_market_own_position_snapshots_v1/);
 assert.match(edge,/triovist_market_comp_position_snapshots_v236352/);
 assert.match(edge,/triovist_content_cards/);
 assert.match(edge,/Source|source/i);
 assert.match(edge,/Причинность НЕ следует из корреляции/);
 assert.match(edge,/Никаких выдуманных цифр/);
 assert.match(ui,/не доказывает причинность/);
 assert.match(ui,/ИИ не подтверждает причины без доказательств/);
});
test('AI calls are budgeted, shared with Lera and cached by day',()=>{
 assert.match(edge,/MAX_DAILY_AI=24,MAX_CRON_AI=6/);
 assert.match(edge,/crm_ai360_core_claim_v2/);
 assert.match(edge,/crm_ai360_core_finish_v2/);
 assert.match(edge,/p_reserve_rub:4/);
 assert.match(edge,/if\(existing\.ai_status==="ready"\)/);
 assert.match(sql,/unique \(snapshot_day,scope_key,kind,entity_key\)/);
 assert.match(action,/cron: '35 6 \* \* \*'/);
 assert.match(action,/github\.event_name == 'schedule' \|\| github\.event_name == 'workflow_dispatch'/);
 assert.match(action,/SUPABASE_KEY: \$\{\{ secrets\.SUPABASE_KEY \}\}/);
});
test('answers stay unverified until director review; followups never fake effects',()=>{
 assert.match(edge,/manager_answer_at/);
 assert.match(edge,/manager_source/);
 assert.match(edge,/director_reviewed_at/);
 assert.match(edge,/checked_3d_position/);
 assert.match(edge,/checked_7d_position/);
 assert.match(edge,/Date\.parse\(cur\.data\.observed_at\)<Date\.parse\(row\.created_at\)\+3\*864e5/);
 assert.match(ui,/Ответ менеджера \(непроверенное утверждение\)/);
 assert.match(ui,/Утвердить действие/);
 assert.match(ui,/Ожидаем сопоставимый снимок/);
});
test('new tables are RLS protected, inaccessible directly to public/anon/authenticated',()=>{
 assert.match(sql,/alter table public\.triovist_market_ai_investigations_v1 enable row level security/);
 assert.match(sql,/alter table public\.triovist_market_ai_daily_runs_v1 enable row level security/);
 assert.match(sql,/revoke all on public\.triovist_market_ai_investigations_v1 from public,anon,authenticated/);
 assert.match(sql,/revoke all on public\.triovist_market_ai_daily_runs_v1 from public,anon,authenticated/);
 assert.doesNotMatch(sql,/alter table public\.(?!triovist_market_ai_)/i);
});
