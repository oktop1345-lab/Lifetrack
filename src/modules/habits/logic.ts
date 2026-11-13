// Логика привычек: расписание, серии, проценты, данные для диаграмм. Без DOM и без базы.

import { addDays, dateRange, isoWeekday, startOfWeek, toDateStr } from '../../core/dates';
import type { Habit, HabitCheck } from '../../core/types';

/** Отметки: для каждой привычки - множество дней, когда она выполнена. */
export type CheckIndex = Map<string, Set<string>>;

export function indexChecks(checks: HabitCheck[]): CheckIndex {
  const index: CheckIndex = new Map();
  for (const check of checks) {
    let days = index.get(check.habitId);
    if (!days) {
      days = new Set();
      index.set(check.habitId, days);
    }
    days.add(check.date);
  }
  return index;
}

/** День, с которого привычка считается (день создания). */
export function habitStart(habit: Habit): string {
  return toDateStr(new Date(habit.createdAt));
}

/** Нужно ли выполнять привычку в этот день. */
export function isScheduled(habit: Habit, date: string): boolean {
  if (date < habitStart(habit)) return false;
  if (habit.archivedAt && date >= toDateStr(new Date(habit.archivedAt))) return false;
  if (habit.schedule.type === 'daily') return true;
  return habit.schedule.days.includes(isoWeekday(date));
}

const done = (habit: Habit, index: CheckIndex, date: string): boolean =>
  index.get(habit.id)?.has(date) ?? false;

/**
 * Текущая серия: сколько запланированных дней подряд выполнено, считая назад от сегодня.
 * Если сегодня ещё не отмечено, серия не обрывается (день ещё не закончился).
 * Дни, когда привычка не запланирована, серию не прерывают.
 */
export function currentStreak(habit: Habit, index: CheckIndex, today: string): number {
  const start = habitStart(habit);
  let streak = 0;
  for (let day = today; day >= start; day = addDays(day, -1)) {
    if (!isScheduled(habit, day)) continue;
    if (done(habit, index, day)) streak++;
    else if (day !== today) break;
  }
  return streak;
}

/** Самая длинная серия за всё время. */
export function bestStreak(habit: Habit, index: CheckIndex, today: string): number {
  let best = 0;
  let run = 0;
  for (const day of dateRange(habitStart(habit), today)) {
    if (!isScheduled(habit, day)) continue;
    if (done(habit, index, day)) {
      run++;
      best = Math.max(best, run);
    } else if (day !== today) run = 0;
  }
  return best;
}

export interface Progress {
  done: number;
  scheduled: number;
}

/** Сколько запланировано и сколько выполнено за период (включительно) по списку привычек. */
export function progress(habits: Habit[], index: CheckIndex, from: string, to: string): Progress {
  const result: Progress = { done: 0, scheduled: 0 };
  if (from > to) return result;
  for (const day of dateRange(from, to)) {
    for (const habit of habits) {
      if (!isScheduled(habit, day)) continue;
      result.scheduled++;
      if (done(habit, index, day)) result.done++;
    }
  }
  return result;
}

/** Уровень закраски ячейки тепловой карты: -1 - ничего не запланировано, 0 - ничего не сделано, 1..4 - доля. */
export function heatLevel(p: Progress): number {
  if (p.scheduled === 0) return -1;
  if (p.done === 0) return 0;
  const share = p.done / p.scheduled;
  if (share >= 1) return 4;
  if (share >= 2 / 3) return 3;
  if (share >= 1 / 3) return 2;
  return 1;
}

export interface HeatDay extends Progress {
  date: string;
  level: number;
}

/** Данные тепловой карты: по одному значению на каждый день периода. */
export function heatmapDays(habits: Habit[], index: CheckIndex, from: string, to: string): HeatDay[] {
  return dateRange(from, to).map((date) => {
    const p = progress(habits, index, date, date);
    return { date, ...p, level: heatLevel(p) };
  });
}

export interface WeekStat extends Progress {
  /** Понедельник недели. */
  weekStart: string;
}

/** Выполнение по неделям: последние `weeks` недель, текущая неделя считается до сегодняшнего дня. */
export function weeklyStats(habits: Habit[], index: CheckIndex, today: string, weeks: number): WeekStat[] {
  const thisWeek = startOfWeek(today);
  const out: WeekStat[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const weekStart = addDays(thisWeek, -7 * i);
    const weekEnd = addDays(weekStart, 6);
    out.push({ weekStart, ...progress(habits, index, weekStart, weekEnd < today ? weekEnd : today) });
  }
  return out;
}

const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export function weekdayShort(day: number): string {
  return WEEKDAY_SHORT[day - 1] ?? '';
}

/** Текст расписания: 'Каждый день' или 'Пн, Ср, Пт'. */
export function scheduleText(habit: Habit): string {
  if (habit.schedule.type === 'daily' || habit.schedule.days.length === 7) return 'Каждый день';
  return [...habit.schedule.days]
    .sort((a, b) => a - b)
    .map(weekdayShort)
    .join(', ');
}
