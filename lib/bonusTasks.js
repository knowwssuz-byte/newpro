export const BONUS_TASKS_KEY = 'bonus_tasks_v1';

export const BONUS_TASK_TYPES = Object.freeze({
  telegram_channel: {
    label: 'Telegram kanal',
    verification: 'telegram_membership',
  },
  external_link: {
    label: 'Havolaga kirish',
    verification: 'timer',
  },
  telegram_bot: {
    label: 'Telegram bot',
    verification: 'timer',
  },
  mini_app: {
    label: 'Mini App',
    verification: 'timer',
  },
});

function clean(value = '', max = 240) {
  return String(value || '').trim().slice(0, max);
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function safeUrl(value = '') {
  const text = clean(value, 700);
  if (!text) return '';

  try {
    const url = new URL(text);
    if (!['https:', 'http:'].includes(url.protocol)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

export function normalizeBonusTask(value = {}) {
  const task = value && typeof value === 'object' ? value : {};
  const type = BONUS_TASK_TYPES[task.type] ? task.type : 'external_link';

  return {
    id: clean(task.id, 72).replace(/[^a-zA-Z0-9_-]/g, ''),
    title: clean(task.title, 90),
    subtitle: clean(task.subtitle, 150),
    type,
    reward: Math.floor(boundedNumber(task.reward, 1, 1, 100_000)),
    url: safeUrl(task.url),
    chatId: clean(task.chatId, 120),
    waitMinutes: Math.floor(boundedNumber(task.waitMinutes, 30, 0, 10_080)),
    accent: ['purple', 'blue', 'green', 'gold', 'rose'].includes(task.accent)
      ? task.accent
      : 'purple',
    isActive: task.isActive !== false,
    sortOrder: Math.floor(boundedNumber(task.sortOrder, 0, 0, 100_000)),
    createdAt: clean(task.createdAt, 50) || new Date().toISOString(),
    updatedAt: clean(task.updatedAt, 50) || new Date().toISOString(),
  };
}

export function normalizeBonusTasks(value) {
  const source = Array.isArray(value)
    ? value
    : Array.isArray(value?.tasks)
      ? value.tasks
      : [];

  return source
    .map(normalizeBonusTask)
    .filter((task) => task.id && task.title && task.url)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt));
}

export function bonusTasksRow(tasks = []) {
  return {
    key: BONUS_TASKS_KEY,
    value: {
      version: 1,
      tasks: normalizeBonusTasks(tasks),
      updatedAt: new Date().toISOString(),
    },
  };
}

export async function getBonusTasks(supabase, { includeInactive = false } = {}) {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', BONUS_TASKS_KEY)
    .maybeSingle();

  if (error) throw error;

  const tasks = normalizeBonusTasks(data?.value);
  return includeInactive ? tasks : tasks.filter((task) => task.isActive);
}

export function bonusTaskForClient(task, progress = null, now = Date.now()) {
  const completed = progress?.status === 'completed';
  const instantVerification = task.type === 'telegram_channel';
  const eligibleAt = progress?.eligibleAt || null;
  const eligibleTime = eligibleAt ? new Date(eligibleAt).getTime() : 0;
  const waiting = !completed && !instantVerification && Boolean(progress?.startedAt) && eligibleTime > now;
  const ready = !completed && Boolean(progress?.startedAt) && (
    instantVerification || !eligibleTime || eligibleTime <= now
  );

  return {
    id: task.id,
    title: task.title,
    subtitle: task.subtitle,
    type: task.type,
    typeLabel: BONUS_TASK_TYPES[task.type]?.label || 'Task',
    reward: task.reward,
    url: task.url,
    waitMinutes: task.type === 'telegram_channel' ? 0 : task.waitMinutes,
    accent: task.accent,
    status: completed ? 'completed' : waiting ? 'waiting' : ready ? 'ready' : 'available',
    startedAt: progress?.startedAt || null,
    eligibleAt,
    completedAt: progress?.completedAt || null,
  };
}
