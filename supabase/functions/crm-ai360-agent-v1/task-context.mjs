// The caller JWT is reauthorized by the task assistant and existing RLS.
export function selectedTaskQuestion(input){
 const c=input?.task_context;
 if(!c||!/^[0-9a-f-]{36}$/i.test(String(c.client_id||'')))return null;
 const q=String(input.question||'');
 if(/^(?:лера[,\s]+)?(?:пожалуйста[,\s]+)?(?:создай|поставь|назначь|перенеси|отмени|сохрани|запиши|напомни|отправь)/iu.test(q))return null;
 if(!/задач|артикул|sku|скю|отгруз|полк|мерчен|ротаци|возраж|этому клиент|здесь|почему|что.*сделать|договор/iu.test(q))return null;
 return {action:'question',client_id:c.client_id,transcript:q};
}
