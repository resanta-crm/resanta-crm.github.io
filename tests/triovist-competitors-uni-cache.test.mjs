import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=x=>fs.readFileSync(new URL('../'+x,import.meta.url),'utf8');
const loader=read('assets/100-safe-upgrades-loader-v236272.js');
const index=read('index.html');
const market=read('assets/106-triovist-competitors-v236218.js');
test('competitor and lazy modules compile safely',()=>{
 assert.doesNotThrow(()=>new vm.Script(loader));
 assert.doesNotThrow(()=>new vm.Script(market));
});
test('competitor script gets precisely one new version query, no old double query',()=>{
 assert.match(loader,/path==='assets\/106-triovist-competitors-v236218\.js'\?'20261111-actionable-overview1'/);
 assert.match(loader,/load\('assets\/106-triovist-competitors-v236218\.js','RESANTA_TRIOVIST_COMPETITORS_V236218'\)/);
 assert.doesNotMatch(loader,/load\('assets\/106-triovist-competitors-v236218\.js\?v=/);
 assert.match(market,/v23\.6\.399-uni1/);
});
test('index invalidates the old loader URL, retaining the existing navigation and other modules',()=>{
 assert.match(index,/100-safe-upgrades-loader-v236272\.js\?v=20261111-actionable-overview1-loader1/);
 assert.match(index,/173-triovist-native-sections-v1\.js/);
 assert.match(index,/34-triovist-root-v23614\.js/);
 assert.match(loader,/20261105-groups-single-121/);
});
