// Логика тренировок: объём, прогресс по упражнению, распределение по типам. Без DOM и без базы.

import { addDays, startOfWeek } from '../../core/dates';
import type { Workout, WorkoutSet } from '../../core/types';

/** Типы тренировок. Порядок фиксирован: по нему закреплён цвет на диаграмме. */
export const WORKOUT_TYPES = ['Силовая', 'Кардио', 'Функциональная', 'Растяжка', 'Другое'];

/** Номер цвета типа на диаграмме. Неизвестный тип - null (серый). */
export function typeColor(type: string): number | null {
  const index = WORKOUT_TYPES.indexOf(type);
  return index === -1 ? null : index;
}

/** Объём тренировки: сумма «вес × повторения» по всем подходам, кг. */
export function workoutVolume(workout: Workout): number {
  let volume = 0;
  for (const exercise of workout.exercises) {
    for (const set of exercise.sets) volume += set.weight * set.reps;
  }
  return volume;
}

export function workoutSets(workout: Workout): number {
  return workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
}

export interface WeekVolume {
  /** Понедельник недели. */
  weekStart: string;
  volume: number;
  count: number;
}

/** Объём и число тренировок по неделям: последние `weeks` недель. */
export function weeklyVolume(workouts: Workout[], today: string, weeks: number): WeekVolume[] {
  const thisWeek = startOfWeek(today);
  const out: WeekVolume[] = [];
  for (let i = weeks - 1; i >= 0; i--) out.push({ weekStart: addDays(thisWeek, -7 * i), volume: 0, count: 0 });
  const byWeek = new Map(out.map((week) => [week.weekStart, week]));
  for (const workout of workouts) {
    const week = byWeek.get(startOfWeek(workout.date));
    if (!week) continue;
    week.volume += workoutVolume(workout);
    week.count++;
  }
  return out;
}

/** Сколько тренировок за период (включительно). */
export function countBetween(workouts: Workout[], from: string, to: string): number {
  return workouts.filter((workout) => workout.date >= from && workout.date <= to).length;
}

export interface TypeCount {
  type: string;
  count: number;
}

/** Распределение тренировок по типам за период, по убыванию. */
export function typeDistribution(workouts: Workout[], from: string, to: string): TypeCount[] {
  const counts = new Map<string, number>();
  for (const workout of workouts) {
    if (workout.date < from || workout.date > to) continue;
    counts.set(workout.type, (counts.get(workout.type) ?? 0) + 1);
  }
  return [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
}

const norm = (name: string): string => name.trim().toLowerCase();

/** Названия упражнений, которые уже встречались: самые частые сверху. */
export function exerciseNames(workouts: Workout[]): string[] {
  const seen = new Map<string, { name: string; count: number }>();
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      const key = norm(exercise.name);
      if (!key) continue;
      const entry = seen.get(key);
      if (entry) entry.count++;
      else seen.set(key, { name: exercise.name.trim(), count: 1 });
    }
  }
  return [...seen.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).map((entry) => entry.name);
}

export interface ProgressPoint {
  date: string;
  value: number;
}

export interface ExerciseProgress {
  /** 'kg' - лучший вес за тренировку; 'reps' - лучшее число повторений (упражнение без веса). */
  unit: 'kg' | 'reps';
  points: ProgressPoint[];
}

/** Прогресс по упражнению: лучшее значение за каждую тренировку, по датам. */
export function exerciseProgress(workouts: Workout[], name: string): ExerciseProgress {
  const key = norm(name);
  const days = new Map<string, WorkoutSet[]>();
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      if (norm(exercise.name) !== key) continue;
      days.set(workout.date, [...(days.get(workout.date) ?? []), ...exercise.sets]);
    }
  }
  const allSets = [...days.values()].flat();
  const unit: ExerciseProgress['unit'] = allSets.some((set) => set.weight > 0) ? 'kg' : 'reps';
  const points = [...days.entries()]
    .filter(([, sets]) => sets.length > 0)
    .map(([date, sets]) => ({
      date,
      value: Math.max(...sets.map((set) => (unit === 'kg' ? set.weight : set.reps))),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { unit, points };
}

/** Подходы этого упражнения с прошлой тренировки - чтобы подставить в форму. */
export function lastSets(workouts: Workout[], name: string): WorkoutSet[] | null {
  const key = norm(name);
  const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date));
  for (const workout of sorted) {
    const exercise = workout.exercises.find((item) => norm(item.name) === key);
    if (exercise && exercise.sets.length > 0) return exercise.sets;
  }
  return null;
}
