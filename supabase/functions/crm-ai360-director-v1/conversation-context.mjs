/* Read-only AI360 conversation resolver. History is untrusted context, never authority. */
const norm = s => String(s || '').toLocaleLowerCase('ru-RU').replaceAll('ё', 'е').trim();
const directTopic = /(продаж|выруч|оборот|отгруз|кпи|kpi|план|долг|задолж|пдз|оплат|задач|поруч|маршрут|визит|посещ|клиент|закуп|покуп)/i;
const followup = /^(?:(?:а|и|ну|тогда|хорошо|ладно)\s+)?(?:почему|из-за чего|в чем причина|что делать|как быть|что предлагаешь|что порекомендуешь|какие риски|что дальше|а если|сравни|поподробнее|подробнее|объясни|поясни|по ним|по нему|по ней|по этим|у него|у нее|они|он|она|а у него|а у нее|а они|а он|а она)(?:\b|\s|\?|$)/i;
const incompatibleArea = /(триовист|21\s*век|21vek|уценк|стенд|акци|склад|остатк)/i;
export function resolveConversationIntent(question, history, classify) {
  const q=norm(question);
  const direct=classify(question);
  if (!Array.isArray(history) || !history.length || directTopic.test(q) || incompatibleArea.test(q) || !followup.test(q))
    return {intent:direct,context_used:false};
  const recent=history.slice(-8).reverse();
  for(const entry of recent) {
    if(entry?.role!=='user') continue;
    const previous=norm(entry.content).slice(0,400);
    if(!previous || incompatibleArea.test(previous))break;
    if(!directTopic.test(previous))continue;
    const inherited=classify(previous);
    if(['sales','debt','tasks','routes','visits','clients'].includes(inherited))
      return {intent: /(?:почему|причин|что делать|как быть|предлага|порекоменду)/i.test(q)?'analysis':inherited,
        context_used:true,previous_intent:inherited};
    break;
  }
  return {intent:direct,context_used:false};
}
