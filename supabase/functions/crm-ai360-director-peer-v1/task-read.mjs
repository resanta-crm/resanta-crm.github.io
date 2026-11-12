// Verified task list for the director dialog: match CRM date and approved/open filters.
const short = value => String(value ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, 180);
const normalize = value => String(value ?? '').trim().toLocaleLowerCase('ru-RU').replaceAll('ё', 'е');
export function taskScope(question, history = []) {
  const q = normalize(question);
  const contextual = /^(а у|а что|у него|у нее|а сейчас)/.test(q);
  const previous = contextual ? ' ' + normalize(history.slice(-3).map(x => x.text).join(' ')) : '';
  const combined = q + previous;
  if (/сегодня|сегодняшн/.test(combined)) return 'today';
  if (/просроч|с истекш/.test(combined)) return 'overdue';
  return 'open';
}
export async function readTasks(svc, manager, question, history, day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('date_invalid');
  const scope = taskScope(question, history);
  let q = svc.from('tasks')
    .select('id,title,text,manager_name,due_date,done,review_status,priority,created_at', { count: 'exact' })
    .eq('done', false).eq('review_status', 'approved');
  if (manager) q = q.eq('manager_name', manager);
  if (scope === 'today') q = q.eq('due_date', day);
  if (scope === 'overdue') q = q.lt('due_date', day);
  const { data, count, error } = await q.order('due_date', { ascending: true }).limit(20);
  if (error) throw new Error('tasks_source_unavailable');
  const rows = (data || []).map(x => ({
    title: short(x.title || x.text), manager_name: short(x.manager_name),
    due_date: x.due_date, priority: x.priority, review_status: x.review_status
  }));
  return {
    domain: 'tasks', source: 'tasks', report_date: day,
    filters: { scope, done: false, review_status: 'approved', manager },
    total_matching: count, returned: rows.length,
    partial: count == null || count > rows.length, rows
  };
}
