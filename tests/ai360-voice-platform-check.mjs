import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {inferVoiceDomain,getVoiceCapabilities,CRM_AI360_ALL_DOMAINS,CRM_AI360_TOOLS} from '../supabase/functions/crm-ai360-dialog-v4/catalog.mjs';
import {chooseClientMatch} from '../supabase/functions/crm-ai360-dialog-v4/client-universal.mjs';
import {runToolCore} from '../supabase/functions/crm-ai360-dialog-v4/core.mjs';
const source=path=>readFileSync(resolve(process.cwd(),path),'utf8');
test('All registered read-only sections are discoverable',()=>{
 const caps=getVoiceCapabilities();
 assert.equal(caps.length,CRM_AI360_ALL_DOMAINS.length);
 assert.equal(new Set(caps.map(c=>c.id)).size,caps.length);
 assert.ok(CRM_AI360_TOOLS.length>=25);
 assert.ok(caps.every(c=>c.requires_owner&&c.scope==='registered_read_only'));
});
test('Actual spoken customer inflection resolves one verified customer',()=>{
 const rows=[{id:'1',name:'ЭльХомГарден ООО',manager_name:'Ачинович'},{id:'2',name:'ЭдемГарден ООО'}];
 assert.equal(chooseClientMatch('Проанализируй клиента Эльхом Гардена, группы и SKU',rows).id,'1');
});
test('Important voice sections route correctly',()=>{
 for(const [q,expected] of [
  ['Покажи конкурентов 21век','competitors'],['Проверь ПДЗ','debt'],
  ['Как дела с GPS','gps'],['Инвентаризация склада','warehouse_inventory'],
  ['Уценка товаров','markdown'],['Ошибки карточек 21век','card_issues'],
  ['Продажи филиала','sales'],['Маршруты менеджеров','routes'],
  ['Инфографика','infographics'],['Реестр оплат','payments']
 ]) assert.equal(inferVoiceDomain(q),expected,q);
});
test('Read the named CRM section before generating model answer',async()=>{
 let selected=[];
 const result=await runToolCore({
  question:'Проверь уценку',history:[],memory:{},domains:CRM_AI360_ALL_DOMAINS,preferredDomain:'markdown',
  readTool:async args=>{selected.push(args.domain);return {domain:args.domain,source:'markdown_items',rows:[{status:'active'}]};},
  request:async()=>({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({brief:'Проверила уценку',detail:'Факт подтверждён',offer:'Продолжить?'})}]}]})
 });
 assert.deepEqual(selected,['markdown']);
 assert.equal(result.pair?.brief,'Проверила уценку');
});
test('Never silently downgrade to the legacy AI dialog',()=>{
 const s=source('assets/143-resanta-ai360-unified-dialog-v1.js');
 assert.ok(s.includes("const ENDPOINT='crm-ai360-dialog-v4'"));
 assert.ok(!s.includes('crm-ai360-dialog-v3'));
 assert.ok(!s.includes('pilotFallback'));
});
test('Speak article codes as fractions and rubles without kopecks',()=>{
 const voice=source('assets/136-resanta-voice-quality-v3.js');
 const sourceCode=voice.slice(voice.indexOf('function rubleWord(n)'),voice.indexOf('function cleanSpeech(t)'));
 const {pronounceBYN,pronounceArticles}=new Function(sourceCode+';return {pronounceBYN,pronounceArticles}')();
 const output=pronounceBYN(pronounceArticles('Артикул 70/8/55, снижение 6 526,59 BYN.'));
 assert.match(output,/70 дробь 8 дробь 55/);
 assert.match(output,/6[\s\u00a0\u202f]527 белорусских рублей/);
 assert.doesNotMatch(output,/копеек|копейки|копейка/);
 assert.equal(pronounceArticles('Артикул 70/8/6'),'Артикул 70 дробь 8 дробь 6');
 assert.equal(pronounceArticles('Дата 2026/10/29'),'Дата 2026/10/29');
});
