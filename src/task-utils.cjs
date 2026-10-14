function normalizeTaskInput(input = {}) {
  const title = String(input.title ?? '').trim().slice(0, 180);
  if (!title) throw new Error('Укажи, что нужно сделать.');
  const dueAt = String(input.due_at ?? '').trim() || null;
  if (dueAt) {
    const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(dueAt);
    if (!match) throw new Error('Укажи корректную дату и время.');
    const [, yearText, monthText, dayText, hourText, minuteText] = match;
    const year = Number(yearText), month = Number(monthText), day = Number(dayText);
    const hour = hourText === undefined ? null : Number(hourText);
    const minute = minuteText === undefined ? null : Number(minuteText);
    const date = new Date(Date.UTC(year, month - 1, day));
    const validDate = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    const validTime = hour === null || (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59);
    if (!validDate || !validTime) throw new Error('Укажи корректную дату и время.');
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
