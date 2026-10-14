function normalizeTaskInput(input = {}) {
  const title = String(input.title ?? '').trim().slice(0, 180);
  if (!title) throw new Error('Укажи, что нужно сделать.');
  const dueAt = String(input.due_at ?? '').trim().slice(0, 25) || null;
  if (dueAt && (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(dueAt) || Number.isNaN(Date.parse(dueAt)))) {
    throw new Error('Укажи корректную дату и время.');
  }
  return { title, dueAt };
}
function taskUrgency({ is_done, due_at }, today) {
  if (Number(is_done) === 1 || is_done === true) return 'done';
  if (!due_at) return 'unscheduled';
  const dueDate = String(due_at).slice(0, 10);
  if (dueDate < today) return 'overdue';
  if (dueDate === today) return 'today';
  return 'upcoming';
}
module.exports = { normalizeTaskInput, taskUrgency };
