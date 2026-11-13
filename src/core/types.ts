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
