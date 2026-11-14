// Обзор по всем разделам за период. Без DOM и без базы.

import { addDays } from '../../core/dates';
import { sumBetween } from '../finance/logic';
import { indexChecks, progress } from '../habits/logic';
import { averageMinutes } from '../screen/logic';
import { totalMinutes } from '../study/logic';
import { countBetween, workoutVolume } from '../workouts/logic';
import type { AllData } from './data';

export interface Overview {
  habitsDone: number;
  habitsScheduled: number;
  workouts: number;
  /** Объём тренировок, кг. */
  volume: number;
  studyMinutes: number;
  expense: number;
  income: number;
  /** Среднее экранное время в день по дням с записью. null - записей нет. */
  screenAverage: number | null;
  urges: number;
}

/** Итоги по всем разделам за период (включительно). */
export function overview(data: AllData, from: string, to: string): Overview {
  const habits = progress(data.habits, indexChecks(data.checks), from, to);
  // Момент времени записи «тянет скроллить» хранится в ISO; сравниваем по местному началу и концу дня.
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${addDays(to, 1)}T00:00:00`).getTime();
  return {
    habitsDone: habits.done,
    habitsScheduled: habits.scheduled,
    workouts: countBetween(data.workouts, from, to),
    volume: data.workouts
      .filter((workout) => workout.date >= from && workout.date <= to)
      .reduce((sum, workout) => sum + workoutVolume(workout), 0),
    studyMinutes: totalMinutes(data.sessions, from, to),
    expense: sumBetween(data.transactions, 'expense', from, to),
    income: sumBetween(data.transactions, 'income', from, to),
    screenAverage: averageMinutes(data.screenDays, from, to),
    urges: data.urges.filter((urge) => {
      const at = new Date(urge.at).getTime();
      return at >= start && at < end;
    }).length,
  };
}

/** Текущий и предыдущий периоды одинаковой длины, заканчивая сегодня. */
export function periods(today: string, days: number): { current: [string, string]; previous: [string, string] } {
  return {
    current: [addDays(today, -(days - 1)), today],
    previous: [addDays(today, -(2 * days - 1)), addDays(today, -days)],
  };
}

/**
 * Изменение к прошлому периоду, например '+12%' или '−8%'.
 * Пустая строка, если сравнивать не с чем или изменение меньше процента.
 */
export function change(current: number | null, previous: number | null): string {
  if (current === null || previous === null || previous === 0) return '';
  const diff = Math.round(((current - previous) / previous) * 100);
  if (diff === 0) return '';
  return `${diff > 0 ? '+' : '−'}${Math.abs(diff)}%`;
}
