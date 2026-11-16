import test from 'node:test';
import assert from 'node:assert/strict';
import {taskPlanFormat} from '../supabase/functions/crm-tasks-assistant-v4/workspace-v5.mjs';

// Small independent evaluator for the JSON Schema subset sent to Responses.
// This exercises generated constraints against completed model-shaped values.
function accepts(value,schema){
 if(schema.anyOf)return schema.anyOf.some(option=>accepts(value,option));
 const kind=value===null?'null':Array.isArray(value)?'array':typeof value;
 if(schema.type&&!(Array.isArray(schema.type)?schema.type:[schema.type]).includes(kind))return false;
 if(schema.enum&&!schema.enum.includes(value))return false;
 if(kind==='object'){
  if((schema.required||[]).some(key=>!Object.prototype.hasOwnProperty.call(value,key)))return false;
  if(schema.additionalProperties===false&&Object.keys(value).some(key=>!Object.prototype.hasOwnProperty.call(schema.properties,key)))return false;
  return Object.entries(schema.properties||{}).every(([key,property])=>!Object.prototype.hasOwnProperty.call(value,key)||accepts(value[key],property));
 }
 if(kind==='array')return (schema.maxItems===undefined||value.length<=schema.maxItems)&&(schema.minItems===undefined||value.length>=schema.minItems)&&value.every(item=>accepts(item,schema.items));
 if(kind==='number')return Number.isFinite(value)&&(schema.exclusiveMinimum===undefined||value>schema.exclusiveMinimum)&&(schema.maximum===undefined||value<=schema.maximum);
 return true;
}
const value={title:'Отгрузить согласованный товар',basis:'История покупок',items:[{sku:'75/6/1',qty:2,reason:'Подтверждённая повторная закупка'}],question:null};

test('strict completed plan cannot name an unoffered SKU or exceed that article\'s current available quantity',()=>{
 const format=taskPlanFormat({client_status:'Рабочий'},[{sku:'75/6/1',available:2},{sku:'67/1/24',available:0.5},{sku:'out-of-stock',available:0}]);
 assert.equal(format.type,'json_schema');assert.equal(format.strict,true);assert.equal(accepts(value,format.schema),true);
 for(const items of [[{...value.items[0],sku:'not-offered'}],[{...value.items[0],sku:'out-of-stock'}],[{...value.items[0],qty:3}],[{...value.items[0],qty:0}],[{...value.items[0],qty:-1}],[{sku:'67/1/24',qty:1,reason:'Предложить климат'}]])assert.equal(accepts({...value,items},format.schema),false);
 assert.equal(accepts({...value,items:[{sku:'67/1/24',qty:0.5,reason:'Количество по складу'}]},format.schema),true);
 assert.throws(()=>taskPlanFormat({client_status:'Рабочий'},[{sku:'zero',available:0}]),/TASK_SKU_TARGETS_REQUIRED/);
});

test('strict working plan leaves deterministic fields to the server and enforces required output and ten-item maximum',()=>{
 const schema=taskPlanFormat({client_status:'Рабочий'},[{sku:'75/6/1',available:200000}]).schema;
 assert.equal(accepts({...value,stage:'profile'},schema),false);
 assert.equal(schema.properties.stage,undefined);assert.equal(schema.properties.expected_result,undefined);
 assert.equal(accepts({...value,items:Array.from({length:11},()=>value.items[0])},schema),false);
 assert.equal(accepts({...value,items:[{...value.items[0],qty:100001}]},schema),false);
 assert.equal(accepts({...value,unexpected:true},schema),false);
 const missing={...value};delete missing.question;assert.equal(accepts(missing,schema),false);
 assert.equal(accepts({...value,question:'Уточните текущий спрос',items:[]},schema),true);
});

test('potential schema requires no SKU or empty enum and supports only meaningful potential stages',()=>{
 const format=taskPlanFormat({client_status:'Потенциальный'},[]),potential={...value,expected_result:'Уточнить профиль и следующий шаг',stage:'profile',items:[]};
 assert.equal(accepts(potential,format.schema),true);assert.equal(accepts({...potential,items:value.items},format.schema),false);assert.equal(accepts({...potential,stage:'shipment'},format.schema),false);
 assert.equal(JSON.stringify(format).includes('"enum":[]'),false);assert.equal(format.schema.properties.items.maxItems,0);
});

test('grouped stock maxima accept exactly the same SKU/quantity pairs as individual schema branches',()=>{
 const rows=Array.from({length:100},(_,index)=>({sku:'75/6/'+index,available:1+index%7}));rows.push({sku:'large-a',available:200000},{sku:'large-b',available:400000});
 const grouped=taskPlanFormat({client_status:'Рабочий'},rows).schema.properties.items;
 const original={type:'array',maxItems:10,items:{anyOf:rows.map(row=>({type:'object',properties:{sku:{type:'string',enum:[row.sku]},qty:{type:'number',exclusiveMinimum:0,maximum:Math.min(100000,row.available)},reason:{type:'string'}},required:['sku','qty','reason'],additionalProperties:false}))}};
 assert.equal(grouped.items.anyOf.length,8);
 for(const row of [...rows,{sku:'unknown',available:1}])for(const qty of [-1,0,0.5,1,row.available,row.available+0.1,100000,100001]){
  const proposal=[{sku:row.sku,qty,reason:'Обоснованная позиция'}];assert.equal(accepts(proposal,grouped),accepts(proposal,original));
 }
 assert(JSON.stringify(grouped).length<JSON.stringify(original).length*.25);
});
