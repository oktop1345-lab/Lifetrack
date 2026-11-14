// Логика экранного времени: лимит и серия, разбивка по приложениям, триггеры, разбор ответа AI.
// Без DOM и без базы.

import { addDays, isoWeekday } from '../../core/dates';
import { formatDuration } from '../../core/format';
import type { ScreenApp, ScreenDay, Urge, UrgeTrigger } from '../../core/types';

export const TRIGGERS: { value: UrgeTrigger; label: string }[] = [
  { value: 'boredom', label: 'Скука' },
  { value: 'stress', label: 'Стресс' },
  { value: 'tired', label: 'Усталость' },
  { value: 'bedtime', label: 'Перед сном' },
  { value: 'other', label: 'Другое' },
];

export function triggerLabel(trigger: UrgeTrigger): string {
  return TRIGGERS.find((item) => item.value === trigger)?.label ?? 'Другое';
}

/**
 * Разбирает длительность из поля ввода: '90' (минуты), '1:30', '1ч 30м', '2ч', '45м'.
 * Возвращает минуты или null.
 */
export function parseDuration(text: string): number | null {
  const clean = text.trim().toLowerCase().replace(',', '.');
  if (clean === '') return null;
  let match = /^(\d+):(\d{1,2})$/.exec(clean);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  match = /^(?:(\d+(?:\.\d+)?)\s*ч\.?)?\s*(?:(\d+)\s*м(?:ин)?\.?)?$/.exec(clean);
  if (match && (match[1] !== undefined || match[2] !== undefined)) {
    return Math.round(Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0));
  }
  return /^\d+$/.test(clean) ? Number(clean) : null;
}

/** Минуты -> 'ч:мм' для подстановки в поле ввода. */
export function durationToInput(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Серия дней ниже лимита: сколько дней подряд есть запись и время не больше лимита.
 * Если за сегодня записи ещё нет, счёт идёт со вчера. День без записи обрывает серию.
 */
export function limitStreak(days: ScreenDay[], limit: number, today: string): number {
  const byDate = new Map(days.map((day) => [day.date, day]));
  let cursor = byDate.has(today) ? today : addDays(today, -1);
  let streak = 0;
  for (;;) {
    const day = byDate.get(cursor);
    if (!day || day.totalMinutes > limit) break;
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Минуты по дням: null там, где записи нет. */
export function minutesFor(days: ScreenDay[], dates: string[]): (number | null)[] {
  const byDate = new Map(days.map((day) => [day.date, day.totalMinutes]));
  return dates.map((date) => byDate.get(date) ?? null);
}

/** Среднее за период по дням, где есть запись. null - записей нет. */
export function averageMinutes(days: ScreenDay[], from: string, to: string): number | null {
  const values = days.filter((day) => day.date >= from && day.date <= to).map((day) => day.totalMinutes);
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/**
 * Уровень закраски дня на тепловой карте (1..4, больше - темнее).
 * С лимитом: до половины лимита, до лимита, до полутора лимитов, больше.
 * Без лимита: четверти от самого большого дня.
 */
export function screenLevel(minutes: number, limit: number | null, max: number): number {
  const base = limit && limit > 0 ? limit : max / 1.5 || 1;
  const ratio = minutes / base;
  if (ratio <= 0.5) return 1;
  if (ratio <= 1) return 2;
  if (ratio <= 1.5) return 3;
  return 4;
}

/** Время по приложениям за период: самые большие сверху, хвост сворачивается в «Прочее». */
export function appTotals(days: ScreenDay[], from: string, to: string, maxApps = 6): ScreenApp[] {
  const sums = new Map<string, ScreenApp>();
  for (const day of days) {
    if (day.date < from || day.date > to) continue;
    for (const app of day.apps) {
      const key = app.name.trim().toLowerCase();
      if (!key) continue;
      const entry = sums.get(key);
      if (entry) entry.minutes += app.minutes;
      else sums.set(key, { name: app.name.trim(), minutes: app.minutes });
    }
  }
  const sorted = [...sums.values()].sort((a, b) => b.minutes - a.minutes);
  const top = sorted.slice(0, maxApps);
  const rest = sorted.slice(maxApps).reduce((sum, app) => sum + app.minutes, 0);
  if (rest > 0) top.push({ name: 'Прочее', minutes: rest });
  return top;
}

/** Названия приложений, которые уже вносились (для подсказок в форме). */
export function appNames(days: ScreenDay[]): string[] {
  return appTotals(days, '0000-01-01', '9999-12-31', 50)
    .map((app) => app.name)
    .filter((name) => name !== 'Прочее');
}

export interface GroupStat {
  /** Среднее экранное время, минут. */
  average: number;
  /** Сколько дней в группе. */
  days: number;
}

export interface Comparison {
  yes: GroupStat;
  no: GroupStat;
  /** Хватает ли данных, чтобы сравнение что-то значило (по 3 дня в каждой группе). */
  enough: boolean;
}

/**
 * Сравнивает среднее экранное время в двух группах дней.
 * flag: true - день в первой группе, false - во второй, null - день не учитывается.
 */
export function compareGroups(items: { minutes: number; flag: boolean | null }[]): Comparison {
  const stat = (flag: boolean): GroupStat => {
    const values = items.filter((item) => item.flag === flag).map((item) => item.minutes);
    const average = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
    return { average, days: values.length };
  };
  const yes = stat(true);
  const no = stat(false);
  return { yes, no, enough: yes.days >= 3 && no.days >= 3 };
}

export const DAY_PARTS = ['Ночь', 'Утро', 'День', 'Вечер'];

/** Часть суток по часу: ночь 0-5, утро 6-11, день 12-17, вечер 18-23. */
export function dayPart(hour: number): number {
  return Math.floor(hour / 6);
}

export interface UrgeStats {
  total: number;
  byTrigger: { trigger: UrgeTrigger; label: string; count: number }[];
  /** Ночь, утро, день, вечер. */
  byPart: number[];
  /** Пн..Вс. */
  byWeekday: number[];
  /** Сколько раз удалось сделать что-то вместо скролла. */
  replaced: number;
}

/** Сводка по записям «тянет скроллить». Время берётся местное. */
export function urgeStats(urges: Urge[]): UrgeStats {
  const byPart = [0, 0, 0, 0];
  const byWeekday = [0, 0, 0, 0, 0, 0, 0];
  const counts = new Map<UrgeTrigger, number>();
  let replaced = 0;
  for (const urge of urges) {
    const at = new Date(urge.at);
    const part = dayPart(at.getHours());
    byPart[part] = (byPart[part] ?? 0) + 1;
    const pad = (n: number): string => String(n).padStart(2, '0');
    const weekday = isoWeekday(`${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`) - 1;
    byWeekday[weekday] = (byWeekday[weekday] ?? 0) + 1;
    counts.set(urge.trigger, (counts.get(urge.trigger) ?? 0) + 1);
    if (urge.insteadOf) replaced++;
  }
  const byTrigger = TRIGGERS.map((item) => ({ trigger: item.value, label: item.label, count: counts.get(item.value) ?? 0 }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count);
  return { total: urges.length, byTrigger, byPart, byWeekday, replaced };
}

export interface ParsedScreen {
  date: string | null;
  totalMinutes: number;
  apps: ScreenApp[];
}

/**
 * Достаёт числа из ответа AI на скриншот. Модель просили вернуть JSON вида
 * {"date": "YYYY-MM-DD" | null, "total_minutes": 215, "apps": [{"name": "...", "minutes": 80}]}.
 * Возвращает null, если в ответе нет пригодных чисел.
 */
export function parseScreenReply(text: string): ParsedScreen | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const raw = data as { date?: unknown; total_minutes?: unknown; apps?: unknown };

  const minutes = (value: unknown): number | null => {
    const n = typeof value === 'string' ? Number(value) : value;
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1440 ? Math.round(n) : null;
  };
  const apps: ScreenApp[] = [];
  if (Array.isArray(raw.apps)) {
    for (const item of raw.apps) {
      if (typeof item !== 'object' || item === null) continue;
      const { name, minutes: value } = item as { name?: unknown; minutes?: unknown };
      const parsed = minutes(value);
      if (typeof name === 'string' && name.trim() && parsed !== null && parsed > 0) {
        apps.push({ name: name.trim().slice(0, 40), minutes: parsed });
      }
    }
  }
  const appsSum = apps.reduce((sum, app) => sum + app.minutes, 0);
  const total = minutes(raw.total_minutes) ?? (appsSum > 0 ? Math.min(1440, appsSum) : null);
  if (total === null || (total === 0 && apps.length === 0)) return null;
  const date = typeof raw.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : null;
  return { date, totalMinutes: total, apps };
}

/** Текст сводки за неделю для отчёта AI: только итоги, без лишних подробностей. */
export function weekSummary(days: ScreenDay[], urges: Urge[], limit: number | null, today: string): string {
  const from = addDays(today, -6);
  const week = days.filter((day) => day.date >= from && day.date <= today).sort((a, b) => a.date.localeCompare(b.date));
  const weekUrges = urges.filter((urge) => urge.at.slice(0, 10) >= from);
  const lines: string[] = [`Период: ${from} - ${today}.`];
  lines.push(limit ? `Лимит в сутки: ${formatDuration(limit)}.` : 'Лимит не задан.');
  if (week.length === 0) lines.push('Записей экранного времени за неделю нет.');
  else {
    const weekdays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    lines.push(
      'Экранное время по дням: ' +
        week.map((day) => `${weekdays[isoWeekday(day.date) - 1]} ${formatDuration(day.totalMinutes)}`).join(', ') +
        '.',
    );
    const average = averageMinutes(week, from, today);
    if (average !== null) lines.push(`Среднее: ${formatDuration(average)} в день.`);
    if (limit) lines.push(`Дней выше лимита: ${week.filter((day) => day.totalMinutes > limit).length} из ${week.length}.`);
    const apps = appTotals(week, from, today, 5);
    if (apps.length) lines.push('Приложения за неделю: ' + apps.map((app) => `${app.name} ${formatDuration(app.minutes)}`).join(', ') + '.');
  }
  const stats = urgeStats(weekUrges);
  if (stats.total === 0) lines.push('Записей «тянет скроллить» за неделю нет.');
  else {
    lines.push(`Записей «тянет скроллить»: ${stats.total}, из них удалось заменить другим делом: ${stats.replaced}.`);
    lines.push('По триггерам: ' + stats.byTrigger.map((item) => `${item.label} ${item.count}`).join(', ') + '.');
    lines.push('По времени суток: ' + DAY_PARTS.map((name, i) => `${name.toLowerCase()} ${stats.byPart[i] ?? 0}`).join(', ') + '.');
    lines.push('По дням недели: ' + ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((name, i) => `${name} ${stats.byWeekday[i] ?? 0}`).join(', ') + '.');
    const replacements = weekUrges.map((urge) => urge.insteadOf?.trim()).filter((value): value is string => Boolean(value));
    if (replacements.length) lines.push('Что делал вместо скролла: ' + [...new Set(replacements)].slice(0, 8).map((value) => value.slice(0, 60)).join('; ') + '.');
  }
  return lines.join('\n');
}
