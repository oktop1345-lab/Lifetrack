// Логика тренировок: объём, прогресс по упражнению, распределение по типам. Без DOM и без базы.

import { addDays, startOfWeek } from '../../core/dates';
import type { Workout, WorkoutExercise, WorkoutSet } from '../../core/types';

/** Типы тренировок. Порядок фиксирован: по нему закреплён цвет на диаграмме. Новые - только в конец. */
export const WORKOUT_TYPES = ['Силовая', 'Кардио', 'Функциональная', 'Растяжка', 'Другое', 'Свой вес'];

/** Упражнения, которые обычно делают с собственным весом: для них переключатель включается сам. */
const BODYWEIGHT_WORDS = [
  'подтяг', 'отжим', 'брус', 'пресс', 'скручив', 'планк', 'выпад', 'берпи', 'бёрпи', 'прыж',
  'пистолет', 'гиперэкстенз', 'австралийск', 'вис', 'уголок', 'мостик', 'без веса', 'pull-up', 'pullup',
  'push-up', 'pushup', 'dip', 'burpee', 'squat jump', 'plank',
];

/** Похоже ли название на упражнение с собственным весом. */
export function looksBodyweight(name: string): boolean {
  const key = name.trim().toLowerCase();
  return key !== '' && BODYWEIGHT_WORDS.some((word) => key.includes(word));
}

/** С собственным весом ли упражнение. У старых записей без отметки - если ни в одном подходе нет веса. */
export function isBodyweight(exercise: WorkoutExercise): boolean {
  return exercise.bodyweight ?? (exercise.sets.length > 0 && exercise.sets.every((set) => set.weight === 0));
}

/**
 * Нагрузка в подходе, кг. Для упражнения с собственным весом - вес тела плюс дополнительный вес;
 * если вес тела не указан, такие подходы в килограммы не считаются (только в повторения).
 */
export function setLoad(exercise: WorkoutExercise, set: WorkoutSet, bodyWeight: number | null): number {
  if (!isBodyweight(exercise)) return set.weight;
  return bodyWeight ? bodyWeight + set.weight : 0;
}

/** Номер цвета типа на диаграмме. Неизвестный тип - null (серый). */
export function typeColor(type: string): number | null {
  const index = WORKOUT_TYPES.indexOf(type);
  return index === -1 ? null : index;
}

/**
 * Объём тренировки: сумма «нагрузка × повторения» по всем подходам, кг.
 * Упражнения с собственным весом считаются с весом тела (если он указан в настройках раздела).
 */
export function workoutVolume(workout: Workout, bodyWeight: number | null = null): number {
  let volume = 0;
  for (const exercise of workout.exercises) {
    for (const set of exercise.sets) volume += setLoad(exercise, set, bodyWeight) * set.reps;
  }
  return Math.round(volume);
}

/** Сколько повторений сделано в упражнениях с собственным весом. */
export function bodyweightReps(workout: Workout): number {
  let reps = 0;
  for (const exercise of workout.exercises) {
    if (isBodyweight(exercise)) for (const set of exercise.sets) reps += set.reps;
  }
  return reps;
}

export function workoutSets(workout: Workout): number {
  return workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
}

export interface WeekVolume {
  /** Понедельник недели. */
  weekStart: string;
  volume: number;
  count: number;
  /** Повторения в упражнениях с собственным весом. */
  bodyweightReps: number;
}

/** Объём и число тренировок по неделям: последние `weeks` недель. */
export function weeklyVolume(workouts: Workout[], today: string, weeks: number, bodyWeight: number | null = null): WeekVolume[] {
  const thisWeek = startOfWeek(today);
  const out: WeekVolume[] = [];
  for (let i = weeks - 1; i >= 0; i--) out.push({ weekStart: addDays(thisWeek, -7 * i), volume: 0, count: 0, bodyweightReps: 0 });
  const byWeek = new Map(out.map((week) => [week.weekStart, week]));
  for (const workout of workouts) {
    const week = byWeek.get(startOfWeek(workout.date));
    if (!week) continue;
    week.volume += workoutVolume(workout, bodyWeight);
    week.bodyweightReps += bodyweightReps(workout);
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
  /** 'kg' - лучший вес за тренировку; 'reps' - лучшее число повторений в подходе (собственный вес). */
  unit: 'kg' | 'reps';
  /** Упражнение с собственным весом. */
  bodyweight: boolean;
  points: ProgressPoint[];
}

/** Прогресс по упражнению: лучшее значение за каждую тренировку, по датам. */
export function exerciseProgress(workouts: Workout[], name: string): ExerciseProgress {
  const key = norm(name);
  const days = new Map<string, WorkoutSet[]>();
  let bodyweight = false;
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      if (norm(exercise.name) !== key) continue;
      if (isBodyweight(exercise)) bodyweight = true;
      days.set(workout.date, [...(days.get(workout.date) ?? []), ...exercise.sets]);
    }
  }
  const allSets = [...days.values()].flat();
  // С собственным весом прогресс - в повторениях, даже если иногда был дополнительный вес.
  const unit: ExerciseProgress['unit'] = !bodyweight && allSets.some((set) => set.weight > 0) ? 'kg' : 'reps';
  const points = [...days.entries()]
    .filter(([, sets]) => sets.length > 0)
    .map(([date, sets]) => ({
      date,
      value: Math.max(...sets.map((set) => (unit === 'kg' ? set.weight : set.reps))),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { unit, bodyweight, points };
}

/** Это упражнение с прошлой тренировки (подходы и отметка «свой вес») - чтобы подставить в форму. */
export function lastExercise(workouts: Workout[], name: string): WorkoutExercise | null {
  const key = norm(name);
  const sorted = [...workouts].sort((a, b) => b.date.localeCompare(a.date));
  for (const workout of sorted) {
    const exercise = workout.exercises.find((item) => norm(item.name) === key);
    if (exercise && exercise.sets.length > 0) return exercise;
  }
  return null;
}

/** Подходы этого упражнения с прошлой тренировки. */
export function lastSets(workouts: Workout[], name: string): WorkoutSet[] | null {
  return lastExercise(workouts, name)?.sets ?? null;
}
