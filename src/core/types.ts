// Типы записей базы данных. Правила: id - строка UUID, день - 'YYYY-MM-DD' (местное время),
// момент времени - ISO-строка, деньги - целое в минимальных единицах, длительность - минуты.

export interface SettingRow {
  key: string;
  value: unknown;
}

export type HabitSchedule =
  | { type: 'daily' }
  | { type: 'weekdays'; days: number[] }; // 1 = Пн ... 7 = Вс

export interface Habit {
  id: string;
  name: string;
  schedule: HabitSchedule;
  createdAt: string;
  archivedAt?: string;
}

export interface HabitCheck {
  id: string;
  habitId: string;
  date: string;
}

export interface WorkoutSet {
  weight: number;
  reps: number;
}

export interface WorkoutExercise {
  name: string;
  sets: WorkoutSet[];
}

export interface Workout {
  id: string;
  date: string;
  type: string;
  note?: string;
  exercises: WorkoutExercise[];
}

export interface StudySubject {
  id: string;
  name: string;
  createdAt: string;
  archivedAt?: string;
}

export interface StudyGoal {
  id: string;
  subjectId: string;
  title: string;
  targetMinutes: number;
  deadline?: string;
  createdAt: string;
  doneAt?: string;
}

export interface StudySession {
  id: string;
  subjectId: string;
  goalId?: string;
  date: string;
  minutes: number;
  note?: string;
}

export type MoneyKind = 'income' | 'expense';

export interface Category {
  id: string;
  name: string;
  kind: MoneyKind;
  /** Номер цвета на диаграммах (0..7). Закреплён за категорией и не меняется. */
  color: number;
}

export interface Transaction {
  id: string;
  kind: MoneyKind;
  amount: number;
  categoryId: string;
  date: string;
  note?: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  saved: number;
  deadline?: string;
  createdAt: string;
}

export interface ScreenApp {
  name: string;
  minutes: number;
}

/** Экранное время за один день (вносится вручную или по скриншоту). */
export interface ScreenDay {
  date: string;
  totalMinutes: number;
  apps: ScreenApp[];
  /** Сон прошлой ночью, минут (необязательно) - для связи со сном. */
  sleepMinutes?: number;
  source: 'manual' | 'screenshot';
}

export type UrgeTrigger = 'boredom' | 'stress' | 'tired' | 'bedtime' | 'other';

/** Запись «тянет скроллить». */
export interface Urge {
  id: string;
  /** Момент времени, ISO. */
  at: string;
  trigger: UrgeTrigger;
  note?: string;
  /** Что сделал вместо скролла. */
  insteadOf?: string;
  /** Текст поддержки на английском, который показали в этот раз (от AI или встроенный). */
  coach?: string;
}
