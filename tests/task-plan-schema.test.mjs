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
const value={title:'Отгрузить согласованный товар',basis:'История покупок',expected_result:'Отгрузить точные товары',stage:'shipment',items:[{sku:'75/6/1',qty:2,reason:'Подтверждённая повторная закупка'}],question:null};

test('strict completed plan cannot name an unoffered SKU or exceed that article\'s current available quantity',()=>{
 const format=taskPlanFormat({client_status:'Рабочий'},[{sku:'75/6/1',available:2},{sku:'67/1/24',available:0.5},{sku:'out-of-stock',available:0}]);
 assert.equal(format.type,'json_schema');assert.equal(format.strict,true);assert.equal(accepts(value,format.schema),true);
 for(const items of [[{...value.items[0],sku:'not-offered'}],[{...value.items[0],sku:'out-of-stock'}],[{...value.items[0],qty:3}],[{...value.items[0],qty:0}],[{...value.items[0],qty:-1}],[{sku:'67/1/24',qty:1,reason:'Предложить климат'}]])assert.equal(accepts({...value,items},format.schema),false);
 assert.equal(accepts({...value,items:[{sku:'67/1/24',qty:0.5,reason:'Количество по складу'}]},format.schema),true);
 assert.throws(()=>taskPlanFormat({client_status:'Рабочий'},[{sku:'zero',available:0}]),/TASK_SKU_TARGETS_REQUIRED/);
});

test('strict plan enforces required fields, working stage, maximum ten items and no unexpected keys',()=>{
 const schema=taskPlanFormat({client_status:'Рабочий'},[{sku:'75/6/1',available:200000}]).schema;
 assert.equal(accepts({...value,stage:'profile'},schema),false);
 assert.equal(accepts({...value,items:Array.from({length:11},()=>value.items[0])},schema),false);
 assert.equal(accepts({...value,items:[{...value.items[0],qty:100001}]},schema),false);
 assert.equal(accepts({...value,unexpected:true},schema),false);
 const missing={...value};delete missing.question;assert.equal(accepts(missing,schema),false);
 assert.equal(accepts({...value,question:'Уточните текущий спрос',items:[]},schema),true);
});

test('potential schema requires no SKU or empty enum and supports only meaningful potential stages',()=>{
 const format=taskPlanFormat({client_status:'Потенциальный'},[]),potential={...value,stage:'profile',items:[]};
 assert.equal(accepts(potential,format.schema),true);assert.equal(accepts({...potential,items:value.items},format.schema),false);assert.equal(accepts({...potential,stage:'shipment'},format.schema),false);
 assert.equal(JSON.stringify(format).includes('"enum":[]'),false);assert.equal(format.schema.properties.items.maxItems,0);
});
