import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

// Version 47 promotion only. Existing historical CI guards still receive every
// other changed path, and their role, security, and feature tests still run.
const baseline = 'd18f03063e70539ee4f4cf2c55bdd4235d788cd3';
const approved = new Set([
 ".github/workflows/crm-view-resume-isolated.yml",
 ".github/workflows/gps-director360-evidence-v1.yml",
 ".github/workflows/gps360-complete-one-time-geo-v1.yml",
 ".github/workflows/gps360-map-decisions-ci.yml",
 ".github/workflows/triovist-brainstorm-subgroups-v2.yml",
 ".github/workflows/triovist-competitors-uni-listing.yml",
 ".github/workflows/triovist-decisions360-ci.yml",
 ".github/workflows/triovist-demand-ai-v2-budget-resume.yml",
 ".github/workflows/triovist-search360-ci.yml",
 ".github/workflows/triovist-tasks360-safe-ui.yml",
 ".github/workflows/triovist-unix-director.yml",
 "assets/100-safe-upgrades-loader-v236272.js",
 "assets/104-safe-triovist-v236200.js",
 "assets/106-triovist-competitors-v236218.js",
 "assets/168-triovist-summary-360-v1.js",
 "assets/169-triovist-tasks360-ux-v1.js",
 "assets/171-triovist-unix-director-v1.js",
 "assets/174-triovist-stock-director-v1.js",
 "assets/175-triovist-motivation-director-v1.js",
 "assets/176-triovist-parser-uniai-unix-v1.js",
 "assets/178-crm-view-resume-v1.js",
 "assets/179-triovist-demand-ai-v1.js",
 "assets/182-triovist-shares360-v1.js",
 "assets/266-triovist-market-ai-investigations-v1.js",
 "assets/32-triovist-v23611.js",
 "assets/34-triovist-root-v23614.js",
 "assets/61-triovist-task-month-safe-v23651.js",
 "assets/66-performance-root-v23657.js",
 "assets/80-triovist-21vek-control-v236107.js",
 "assets/82-triovist-group-dynamics-v236120.js",
 "assets/83-triovist-group-dynamics-fixes-v236121.js",
 "index.html",
 "supabase/functions/triovist-market-investigate-v1/index.ts",
 "supabase/migrations/20261123105749_triovist_ai_demand_latest_closed_baseline.sql",
 "tests/crm-view-resume-v1.test.mjs",
 "tests/triovist-action-center-v1.test.mjs",
 "tests/triovist-ai-plan-retirement-20261105.test.mjs",
 "tests/triovist-competitors-uni-cache.test.mjs",
 "tests/triovist-competitors-uni-listing.test.mjs",
 "tests/triovist-decisions360-v1.test.mjs",
 "tests/triovist-demand-ai-v2.test.mjs",
 "tests/triovist-groups-single-screen-v1.test.mjs",
 "tests/triovist-market-ai-investigations-v1.test.mjs",
 "tests/triovist-motivation-director-v1.test.mjs",
 "tests/triovist-native-sections-v1.test.mjs",
 "tests/triovist-parser-hybrid-v1.test.mjs",
 "tests/triovist-production-rollout-scope-v1.mjs",
 "tests/triovist-stock-director-v1.test.mjs",
 "tests/triovist-summary-360-v1.test.mjs",
 "tests/triovist-tasks360-ux-v1.test.mjs",
 "tests/triovist-unix-director-v1.test.mjs"
]);
const rollout = process.argv[2];
assert.ok(rollout, 'Pass a changed-file manifest');
const changed = readFileSync(rollout, 'utf8').split(/\r?\n/).filter(Boolean);
assert.deepEqual(changed.filter(path => !approved.has(path)), [], 'Unexpected production dependency in Triovist rollout');

const versionedScripts = new Set([
 '61-triovist-task-month-safe-v23651.js',
 '168-triovist-summary-360-v1.js',
 '169-triovist-tasks360-ux-v1.js',
 '171-triovist-unix-director-v1.js',
 '182-triovist-shares360-v1.js',
 '34-triovist-root-v23614.js',
 '174-triovist-stock-director-v1.js',
 '175-triovist-motivation-director-v1.js',
 '66-performance-root-v23657.js',
 '100-safe-upgrades-loader-v236272.js',
 '266-triovist-market-ai-investigations-v1.js',
 '179-triovist-demand-ai-v1.js',
 '178-crm-view-resume-v1.js'
]);
function withoutSectionVersions(html) {
 return html.replace(/(<script defer src="\.\/assets\/)([^"?]+)\?[^"]+("><\/script>)/g,
  (line, open, file, close) => versionedScripts.has(file) ? open + file + close : line);
}
const prior = execFileSync('git', ['show', baseline + ':index.html'], { encoding: 'utf8' });
assert.equal(withoutSectionVersions(readFileSync('index.html', 'utf8')), withoutSectionVersions(prior),
 'Only the selected script version queries may change in production index.html');

// The worker and migration below already run in the common project. The other
// two paths are browser UI for Triovist, with dedicated listing/parser tests.
const checkedByRollout = new Set([
 'assets/80-triovist-21vek-control-v236107.js',
 'assets/106-triovist-competitors-v236218.js',
 'supabase/functions/triovist-market-investigate-v1/index.ts',
 'supabase/migrations/20261123105749_triovist_ai_demand_latest_closed_baseline.sql'
]);
const remaining = changed.filter(path => !checkedByRollout.has(path));
writeFileSync(rollout, remaining.length ? remaining.join('\n') + '\n' : '');
console.log('Triovist-only promotion verified against the production entry point.');
