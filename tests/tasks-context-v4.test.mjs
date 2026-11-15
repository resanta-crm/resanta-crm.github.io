import test from 'node:test';import assert from 'node:assert/strict';
import {selectedTaskQuestion} from '../supabase/functions/crm-ai360-agent-v1/task-context.mjs';
const context={client_id:'11111111-1111-4111-8111-111111111111'};
test('selected-client shipment question uses verified task context',()=>assert.equal(selectedTaskQuestion({task_context:context,question:'Почему задача ещё не закрыта?'}).client_id,context.client_id));
test('creation and other writes retain existing signed action path',()=>{for(const question of ['Создай задачу по клиенту','Лера, перенеси задачу','Поставь задачу менеджеру'])assert.equal(selectedTaskQuestion({task_context:context,question}),null);});
test('no context or unrelated question never reroutes another CRM section',()=>{assert.equal(selectedTaskQuestion({question:'Почему задача не закрыта?'}),null);assert.equal(selectedTaskQuestion({task_context:context,question:'Какая погода?'}),null);});
