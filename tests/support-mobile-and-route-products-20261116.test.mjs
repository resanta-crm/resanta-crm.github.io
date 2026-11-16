import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const {parseHTML}=await import(process.env.CRM_DOM_MODULE||'linkedom');
const core=fs.readFileSync('assets/01-crm-core.js','utf8');
const routeSource=core.slice(core.indexOf('function routeTaskHtml('),core.indexOf('function toggleRouteTaskBlock('));
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function route(tasks,prices=[]){const ctx={esc,allPrice:prices};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(routeSource,ctx);vm.runInContext(fs.readFileSync('assets/289-route-task-products-v1.js','utf8'),ctx);return ctx.routeTaskHtml(tasks,'test-route-task');}

test('route cards show approved SKU, product and quantity without mutating tasks',()=>{
  const tasks=[{id:'kept',text:'Отгрузить утверждённые SKU по маршруту',ai_stock_items:[{sku:'67/1/2',product:'Конвектор Ресанта ОК-2000',qty:3}]}];
  const original=structuredClone(tasks),html=route(tasks),{document}=parseHTML(html);
  assert.match(document.querySelector('.route-task-box').textContent,/67\/1\/2 · Конвектор Ресанта ОК-2000 — 3 шт\./);
  assert.deepEqual(tasks,original);
  assert.equal(document.querySelectorAll('.route-task-item').length,1);
});
test('older SKU snapshots use only an unambiguous already-loaded catalog name',()=>{
  const tasks=[{text:'Отгрузить товары',ai_stock_items:[{sku:'1/2',qty:2}]}];
  assert.match(route(tasks,[{sku:'1/2',product:'Увлажнитель'}]),/Увлажнитель — 2 шт\./);
  const ambiguous=route(tasks,[{sku:'1/2',product:'Первый'},{sku:'1/2',product:'Второй'}]);
  assert.match(ambiguous,/Название товара не указано/);
  assert.doesNotMatch(ambiguous,/Первый|Второй/);
});
test('approved snapshot wins over renamed catalog and escapes product markup',()=>{
  const html=route([{text:'Продать',ai_stock_items:[{sku:'1/2',product:'<img src=x onerror=alert(1)>',qty:1}]}],[{sku:'1/2',product:'Новое имя'}]);
  const {document}=parseHTML(html);
  assert.equal(document.querySelector('img'),null);
  assert.match(document.querySelector('.route-task-box').textContent,/<img src=x onerror=alert\(1\)>/);
  assert.doesNotMatch(html,/Новое имя/);
});
test('historical product text remains visible without duplicating its product list',()=>{
  const text='Предложить 1/2 · Бензопила — 2 шт.';
  const html=route([{text,ai_stock_items:[{sku:'1/2',product:'Бензопила',qty:2}]}]);
  assert.match(html,/Бензопила/);
  assert.doesNotMatch(html,/route-task-products/);
  assert.match(route([{text:'Сверить карточку клиента'}]),/Сверить карточку клиента/);
  assert.equal(route([]),'');
});
test('SKU-only task text gains names in the collapsed preview and matches complete articles',()=>{
  const text='Отгрузка, подтверждённая 1С: 67/4/10 — 4 шт.; 67/4/1 — 2 шт.';
  const tasks=[{text,ai_stock_items:[{sku:'67/4/1',product:'Тепловая пушка',qty:2},{sku:'67/4/10',product:'Конвектор',qty:4}]}];
  const html=route(tasks),{document}=parseHTML(html);
  assert.match(document.querySelector('.route-task-box').textContent,/67\/4\/10 · Конвектор — 4 шт\.; 67\/4\/1 · Тепловая пушка — 2 шт\./);
  assert.equal(tasks[0].text,text);
  assert.doesNotMatch(html,/route-task-products/);
});
test('separate route obligations and malformed legacy snapshots remain safe',()=>{
  const html=route([{text:'Первая',ai_stock_items:[null,{sku:'1/2',product:'Насос',qty:2}]},{text:'Вторая',ai_stock_items:[{sku:'1/2',product:'Насос',qty:5}]},{text:'Третья',ai_stock_items:{sku:'1/2'}}]);
  const {document}=parseHTML(html);
  assert.equal(document.querySelectorAll('.route-task-item').length,3);
  assert.match(document.querySelector('.route-task-box').textContent,/Насос — 2 шт\./);
  assert.match(document.querySelector('.route-task-box').textContent,/Насос — 5 шт\./);
});

const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r))};
function supportFixture(){
  const {document}=parseHTML('<html><body><div id="app"><div class="topbar"><span id="topbar-title">Задачи</span></div><div class="sidebar"></div></div></body></html>');
  const ticks=[],ctx={document,console,Date,Map,Set,Promise,URLSearchParams,navigator:{userAgent:'Android WebView'},location:{search:''},setTimeout,clearTimeout,setInterval:f=>ticks.push(f),currentProfile:{id:'reporter'},db:{rpc:async()=>({data:{allowed:true,approver:false}})}};
  ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('assets/288-support-v1.js','utf8'),ctx);return {document,ctx,ticks};
}
test('support marks its own mobile header and removes it after logout',async()=>{
  const {document,ctx,ticks}=supportFixture();await flush();
  assert.ok(document.querySelector('.topbar.sp-support-topbar #support-quick-v1'));
  assert.equal(document.getElementById('support-quick-v1').textContent,'Сообщить о проблеме');
  ctx.currentProfile=null;await ticks[0]();
  assert.equal(document.getElementById('support-quick-v1'),null);
  assert.equal(document.querySelector('.sp-support-topbar'),null);
});
test('mobile header permits wrapping and gives report action a complete touch row',()=>{
  const css=fs.readFileSync('assets/288-support-v1.css','utf8');
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/#app \.topbar\.sp-support-topbar\{[^}]*height:auto;[^}]*flex-wrap:wrap/);
  assert.match(css,/#app \.topbar #support-quick-v1\{[^}]*flex:1 0 100%;[^}]*max-width:100%;[^}]*min-height:44px/);
  assert.match(css,/#support-v1 input,#support-v1 select,#support-v1 textarea\{min-width:0;max-width:100%\}/);
  assert.match(css,/#support-v1\{box-sizing:border-box;width:100%;max-width:100vw;min-width:0;overflow-x:hidden/);
});
test('narrow support header keeps account controls, title and report on three explicit rows',()=>{
  const css=fs.readFileSync('assets/288-support-v1.css','utf8'),narrow=css.slice(css.indexOf('@media(max-width:420px)'));
  assert.match(narrow,/#app \.topbar\.sp-support-topbar\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1\.35fr\) auto/);
  for(const selector of ['topbar-logo','user-badge','self-password-btn'])assert.match(narrow,new RegExp('\\.'+selector+'\\{[^}]*grid-row:1'));
  assert.match(narrow,/\.topbar-title\{grid-column:1\/3;grid-row:2;overflow-wrap:normal/);
  assert.match(narrow,/\.logout-btn:not\(\.self-password-btn\):not\(#support-quick-v1\)\{grid-column:3;grid-row:2/);
  assert.match(narrow,/#support-quick-v1\{grid-column:1\/-1;grid-row:3/);
});
