export const criteria = [
  'Установление контакта', 'Выявление потребности', 'Качество вопросов',
  'Знание продукта', 'Коммерческое предложение', 'Аргументация преимуществ',
  'Работа с возражениями', 'Дополнительные продажи', 'Управление инициативой',
  'Следующий шаг с клиентом',
];
export const clean = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const scores = [2, 1, 0.5];

export function initialReview(value, segments, managerSpeakers, makeId = () => crypto.randomUUID()) {
  const voices = new Set(managerSpeakers);
  const managerLine = index => Number.isInteger(index) && voices.has(segments[index]?.speaker) ? segments[index] : null;
  const clientLine = index => Number.isInteger(index) && segments[index]?.speaker && !voices.has(segments[index].speaker) ? segments[index] : null;
  const opinions = Array.isArray(value?.criteria) ? value.criteria : [];
  const marked = criteria.map((name, index) => {
    const item = opinions[index];
    const segment = managerLine(item?.line);
    const score = segment && [0, 1, 2].includes(item.score) ? item.score : null;
    return {name, score, evidence: score === null ? null : segment, reason: score === null ? '' : clean(item?.reason, 280)};
  });
  const seen = new Set();
  const cases = (Array.isArray(value?.cases) ? value.cases : []).slice(0, 3).flatMap(item => {
    const evidence = managerLine(item?.line);
    const question = clean(item?.question, 420);
    const issue = clean(item?.issue, 260);
    if (!evidence || !question || !issue || seen.has(question)) return [];
    seen.add(question);
    return [{id: makeId(), evidence, client_context: clientLine(item?.context_line),
      issue, question, attempts: [], feedback: '', score: null, plan: null}];
  });
  const applicable = marked.filter(item => item.score !== null);
  if (!applicable.length && !cases.length) throw Error('invalid_analysis');
  return {
    summary: clean(value.summary, 500),
    criteria: marked,
    quality: applicable.length ? Math.round(100 * applicable.reduce((sum, x) => sum + x.score, 0) / (2 * applicable.length)) : null,
    cases,
  };
}

export const isReportedGap = answer =>
  /^(?:не (?:выявил[аи]?|уточнил[аи]?|выяснил[аи]?|узнал[аи]?|спросил[аи]?)|не знаю)[.!\s]*$/iu.test(answer.trim());

export function applyAnswer(situation, answer, value) {
  const feedback = clean(value?.feedback, 600);
  const verdict = isReportedGap(answer) ? 'improve' : value?.verdict;
  const followup = clean(value?.followup, 420);
  const lastReply = {text: answer, status: verdict};
  if (!feedback || !['clarification', 'improve', 'accept'].includes(verdict)) throw Error('invalid_analysis');
  if (situation.score !== null) throw Error('case_completed');
  if (verdict === 'clarification') return {...situation, feedback, followup, last_reply: lastReply};
  const attempts = [...situation.attempts, answer];
  const complete = verdict === 'accept' || attempts.length >= scores.length;
  if (!complete) return {...situation, attempts, feedback, followup, last_reply: lastReply};
  const action = clean(value?.action, 420);
  const result = clean(value?.result, 350);
  const check = clean(value?.check, 350);
  if (!action || !result || !check) throw Error('invalid_analysis');
  return {
    ...situation, attempts, feedback, followup: '', last_reply: lastReply,
    score: verdict === 'accept' ? scores[attempts.length - 1] : 0,
    plan: {action, result, check, source: verdict === 'accept' ? 'manager' : 'ai'},
  };
}

export function report(rows, tasks) {
  const grouped = new Map();
  for (const row of rows) {
    const entry = grouped.get(row.owner_id) ?? {
      name: row.manager_name, reviewed: 0, waiting: 0, completed: 0, points: 0,
      quality_count: 0, quality_sum: 0, first: 0, second: 0, third: 0, assisted: 0, tasks: 0, done: 0,
    };
    if (row.review) {
      entry.reviewed++;
      if (row.review.quality !== null) {
        entry.quality_count++;
        entry.quality_sum += row.review.quality;
      }
      for (const item of row.review.cases) {
        if (item.score === null) {
          entry.waiting++;
        } else {
          entry.completed++;
          entry.points += item.score;
          entry[{2: 'first', 1: 'second', 0.5: 'third', 0: 'assisted'}[item.score]]++;
        }
        if (item.task_id) {
          entry.tasks++;
          if (tasks.get(item.task_id)?.done === true) entry.done++;
        }
      }
    }
    grouped.set(row.owner_id, entry);
  }
  return [...grouped.values()].map(entry => {
    const rate = entry.completed ? 100 * entry.points / (2 * entry.completed) : null;
    const independence = rate === null ? null : Math.round(rate * 10) / 10;
    const category = entry.completed < 10 ? 'Недостаточно данных' : rate >= 80 ? 'Лидер' : rate >= 50 ? 'Средний уровень' : 'Нужна поддержка';
    return {...entry, independence, category, quality: entry.quality_count ? Math.round(entry.quality_sum / entry.quality_count) : null};
  }).sort((a, b) => (b.independence ?? -1) - (a.independence ?? -1) || a.name.localeCompare(b.name, 'ru'));
}
