const DEFAULT_REMINDER_SETTINGS = Object.freeze({
  enabled: true,
  taskDeadlines: true,
  missingShiftReports: true,
  overdueProjects: true,
  startHour: 9,
  endHour: 19,
  weekdaysOnly: true,
  staleShiftDays: 2,
  repeatEveryHours: 24
});

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeReminderSettings(input = {}) {
  const s = { ...DEFAULT_REMINDER_SETTINGS, ...(input && typeof input === 'object' ? input : {}) };
  return {
    enabled: s.enabled !== false,
    taskDeadlines: s.taskDeadlines !== false,
    missingShiftReports: s.missingShiftReports !== false,
    overdueProjects: s.overdueProjects !== false,
    startHour: Math.max(0, Math.min(23, Math.trunc(Number(s.startHour) || 0))),
    endHour: Math.max(1, Math.min(24, Math.trunc(Number(s.endHour) || 19))),
    weekdaysOnly: s.weekdaysOnly !== false,
    staleShiftDays: Math.max(1, Math.min(30, Math.trunc(Number(s.staleShiftDays) || 2))),
    repeatEveryHours: Math.max(1, Math.min(168, Math.trunc(Number(s.repeatEveryHours) || 24)))
  };
}

function isReminderWindow(now, settingsInput = {}) {
  const settings = normalizeReminderSettings(settingsInput);
  if (!settings.enabled) return false;
  if (settings.weekdaysOnly && (now.getDay() === 0 || now.getDay() === 6)) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= settings.startHour * 60 && minutes < settings.endHour * 60;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetweenDateKeys(from, to) {
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null;
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.floor((b - a) / 86400000) : null;
}

function buildReminders({ tasks = [], projects = [], now = new Date(), settings: settingsInput = {}, lastSent = {} } = {}) {
  const settings = normalizeReminderSettings(settingsInput);
  if (!isReminderWindow(now, settings)) return [];
  const today = localDateKey(now);
  const reminders = [];
  const push = (key, title, body, level = 'warning') => {
    const sentAt = parseDate(lastSent[key]);
    if (sentAt && now.getTime() - sentAt.getTime() < settings.repeatEveryHours * 3600000) return;
    reminders.push({ key, title, body, level });
  };

  if (settings.taskDeadlines) {
    for (const task of tasks) {
      if (!task || Number(task.is_done) === 1 || !task.due_at) continue;
      const due = parseDate(task.due_at);
      if (!due || due.getTime() > now.getTime()) continue;
      const overdueDays = daysBetweenDateKeys(localDateKey(due), today) ?? 0;
      push(`task:${task.id}`, overdueDays > 0 ? 'Просрочена задача' : 'Срок задачи наступил', `${task.title || 'Задача'}${task.project_title ? ` · ${task.project_title}` : ''}${overdueDays > 0 ? `. Просрочка: ${overdueDays} дн.` : '. Проверь и отметь результат.'}`);
    }
  }

  for (const project of projects) {
    if (!project || project.status !== 'active') continue;
    if (settings.overdueProjects && project.end_date && project.end_date < today) {
      push(`project-deadline:${project.id}`, 'Объект вышел за плановый срок', `${project.title || 'Объект'}: плановое завершение было ${project.end_date}. Обнови прогноз и оставшийся объём.`, 'danger');
    }
    if (settings.missingShiftReports) {
      const referenceDate = project.last_shift_date || (project.start_date || String(project.created_at || '').slice(0, 10));
      const staleDays = daysBetweenDateKeys(referenceDate, today);
      if (staleDays !== null && staleDays >= settings.staleShiftDays) {
        push(`shift-report:${project.id}`, 'Нет свежего отчёта смены', `${project.title || 'Объект'}: отчёт не обновлялся ${staleDays} дн. Внеси фактический результат, простой и остаток работ.`);
      }
    }
  }
  return reminders;
}

module.exports = { DEFAULT_REMINDER_SETTINGS, normalizeReminderSettings, isReminderWindow, buildReminders, localDateKey };
