import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const OSM=read('assets/gps-viewer-osm-v23616.html');
const YANDEX=read('assets/gps-viewer-v2360.html');
function scriptOf(html){
 const matches=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
 assert.ok(matches.length,'Inline route-map controller missing');
 return matches.at(-1)[1];
}
test('OSM and Yandex route viewers contain valid JS after fix',()=>{
 assert.doesNotThrow(()=>new vm.Script(scriptOf(OSM)));
 assert.doesNotThrow(()=>new vm.Script(scriptOf(YANDEX)));
});
for(const [label,html] of [['OpenStreetMap',OSM],['Yandex',YANDEX]]){
 test(label+': unverified coordinates are not a claim that the manager was absent',()=>{
  assert.match(html,/Геозона ТТ не выверена/);
  assert.match(html,/Отсутствие GPS не доказывает отсутствие визита/);
  assert.match(html,/Трек может существовать/);
  assert.match(html,/const missing=plans\.filter/);
  assert.match(html,/coordWarning/);
  assert.match(html,/физическую ТТ, не юридическое лицо/);
 });
 test(label+': GPS track and visit-report have separate labels',()=>{
  assert.match(html,/Визиты по отчётам/);
  assert.match(html,/визит зафиксирован \(GPS отдельно\)/);
  assert.match(html,/GPS-трек и подтверждённое посещение ТТ — разные показатели/);
 });
 test(label+': legacy auto-technical stops never declared director-verified',()=>{
  assert.match(html,/original==='technical'\?'unidentified':original/);
  assert.match(html,/Неопознанная GPS-стоянка/);
  assert.match(html,/Причина не подтверждена директором/);
  assert.doesNotMatch(html,/Техническая GPS-остановка/);
  assert.doesNotMatch(html,/🔧 Техническая остановка/);
  assert.doesNotMatch(html,/if\(cls==='technical'\)/);
 });
 test(label+': raw GPS, active routes and old backend RPCs unchanged',()=>{
  assert.match(html,/gps_get_workday_aggregate_director_v236417/);
  assert.match(html,/gps_rebuild_workday_aggregate_v236417/);
  assert.doesNotMatch(html,/\.from\(['"]route_plans['"]\).*\.update/);
  assert.doesNotMatch(html,/\.from\(['"]gps_track_points['"]\).*\.delete/);
 });
}
test('director GPS360 module, independent server evidence and tasks untouched',()=>{
 const index=read('index.html');
 assert.match(index,/181-gps-director360-v1\.js\?v=20261105-director360-1/);
 assert.match(index,/124-gps-director-report-v236427\.js\?v=20261105-director360-1/);
 assert.match(read('assets/181-gps-director360-v1.js'),/gps_director360_evidence_v20261105/);
});
