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

// ---------- Поддержка «тянет скроллить» (тексты на английском) ----------

const TRIGGER_EN: Record<UrgeTrigger, string> = {
  boredom: 'boredom',
  stress: 'stress',
  tired: 'tiredness',
  bedtime: 'before bed',
  other: 'other',
};

const PART_EN = ['night', 'morning', 'afternoon', 'evening'];
const WEEKDAY_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Встроенные тексты на случай, когда AI недоступен (нет интернета или ключа). */
export const FALLBACK_COACH: Record<UrgeTrigger, string[]> = {
  boredom: [
    'Boredom is not an emergency. It is space - and space is where good ideas grow. The feed will not give you anything you will remember tomorrow. Give the next ten minutes to something your future self will thank you for.',
    'Discipline is choosing what you want most over what you want now. Right now you want a quick hit of novelty. What you want most is a day you are proud of. Stand up, move, and start one small useful thing.',
  ],
  stress: [
    'Scrolling feels like relief, but it only postpones the stress and adds noise on top. Take five slow breaths. Then write down the one thing that is worrying you and the next tiny step. Calm comes from action, not from the feed.',
    'Your mind is asking for a break, not for more input. Give it a real one: walk, stretch, drink some water. Strong people are not the ones who never feel pressure - they are the ones who respond to it on purpose.',
  ],
  tired: [
    'When you are tired, the feed is the most expensive way to rest: it drains attention and gives nothing back. Close your eyes for five minutes, get some fresh air, or simply go to bed earlier. Rest is a discipline too.',
    'Fatigue makes every scroll feel harmless. It is not. Protect the little energy you have left: put the phone down, stretch your back, and do one calm thing that actually restores you.',
  ],
  bedtime: [
    'The best thing you can do for tomorrow happens tonight. Every minute of scrolling now is borrowed from your sleep, your mood and your focus tomorrow. Put the phone away from the bed and read a few pages instead.',
    'Bedtime scrolling is a loop with no ending - there is always one more video. Decide that the day is done. A calm mind and a good night of sleep are worth more than anything on that screen.',
  ],
  other: [
    'You noticed the urge instead of obeying it - that is already discipline. Now make the next ten minutes count: do something small that moves your life forward. The feed will still be there; this moment will not.',
    'Attention is the most valuable thing you own. Spend it like money. Ask yourself: will scrolling right now make my day better? If not, choose one habit, one task or one walk instead.',
  ],
};

/** Встроенный текст для этого триггера. n - любое число, чтобы тексты чередовались. */
export function fallbackCoach(trigger: UrgeTrigger, n: number): string {
  const list = FALLBACK_COACH[trigger];
  return list[Math.abs(Math.floor(n)) % list.length] ?? FALLBACK_COACH.other[0] ?? '';
}

const localDate = (at: Date): string =>
  `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;

const hhmm = (at: Date): string => `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;

/**
 * «Память» о тяге к скроллу для AI: когда и почему это случалось раньше.
 * current - текущая запись (в историю не попадает), now - текущий момент.
 * Берутся последние 30 дней: итоги и до 8 последних записей с причинами.
 */
export function urgeMemory(urges: Urge[], current: Urge, now: Date): string {
  const since = now.getTime() - 30 * 86_400_000;
  const past = urges
    .filter((urge) => urge.id !== current.id && new Date(urge.at).getTime() >= since)
    .sort((a, b) => b.at.localeCompare(a.at));
  const at = new Date(current.at);
  const lines: string[] = [
    `Right now: ${WEEKDAY_EN[isoWeekday(localDate(at)) - 1]} ${hhmm(at)} (${PART_EN[dayPart(at.getHours())]}), trigger: ${TRIGGER_EN[current.trigger]}` +
      (current.note ? `, reason in their words: "${current.note.slice(0, 140)}"` : '') +
      '.',
  ];
  if (past.length === 0) {
    lines.push('No earlier urges recorded in the last 30 days.');
    return lines.join('\n');
  }
  const stats = urgeStats(past);
  const top = (values: number[], names: string[]): string =>
    values
      .map((count, i) => ({ count, name: names[i] ?? '' }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((item) => `${item.name} ${item.count}`)
      .join(', ');
  lines.push(
    `Last 30 days: ${stats.total} earlier urges, ${stats.replaced} of them replaced with something else.`,
    'Triggers: ' + stats.byTrigger.map((item) => `${TRIGGER_EN[item.trigger]} ${item.count}`).join(', ') + '.',
    `Most often at: ${top(stats.byPart, PART_EN)}. Most often on: ${top(stats.byWeekday, WEEKDAY_EN)}.`,
    'Recent entries (newest first):',
  );
  for (const urge of past.slice(0, 8)) {
    const when = new Date(urge.at);
    lines.push(
      `- ${WEEKDAY_EN[isoWeekday(localDate(when)) - 1]} ${hhmm(when)}, ${TRIGGER_EN[urge.trigger]}` +
        (urge.note ? `, reason: "${urge.note.slice(0, 100)}"` : '') +
        (urge.insteadOf ? `, did instead: "${urge.insteadOf.slice(0, 60)}"` : ''),
    );
  }
  return lines.join('\n');
}

/** Системная инструкция для коротких текстов поддержки. */
export const COACH_SYSTEM = [
  'You are a calm, direct coach inside a personal habit tracker. The user just felt the urge to scroll social media feeds and pressed a button instead.',
  'Write in English only, even if their notes are in Russian. 4-6 short sentences, plain text, no headings, no lists, no emojis, no quotes from famous people.',
  'Acknowledge their current reason and, if the history shows a pattern (same time of day, same trigger, same day), name it briefly so they feel remembered.',
  'Talk about discipline, attention and self-respect without shaming. End with one concrete, better thing to do in the next 10 minutes - prefer one of their open habits if any are listed.',
  'Never promise to block apps.',
].join('\n');
