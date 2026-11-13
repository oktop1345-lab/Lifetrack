import Dexie, { type Table } from 'dexie';
import type {
  Category,
  Habit,
  HabitCheck,
  SavingsGoal,
  SettingRow,
  StudyGoal,
  StudySession,
  StudySubject,
  Transaction,
  Workout,
} from './types';

export const DB_NAME = 'life-tracker';

/** Номер последней версии схемы. Увеличивать вместе с новым db.version(n). */
export const SCHEMA_VERSION = 1;

export class AppDB extends Dexie {
  settings!: Table<SettingRow, string>;
  habits!: Table<Habit, string>;
  habitChecks!: Table<HabitCheck, string>;
  workouts!: Table<Workout, string>;
  studySubjects!: Table<StudySubject, string>;
  studyGoals!: Table<StudyGoal, string>;
  studySessions!: Table<StudySession, string>;
  categories!: Table<Category, string>;
  transactions!: Table<Transaction, string>;
  savingsGoals!: Table<SavingsGoal, string>;

  constructor() {
    super(DB_NAME);
    // Новый модуль = новая версия ниже (version(2) и т.д.). Старые версии не менять.
    this.version(1).stores({
      settings: 'key',
      habits: 'id',
      habitChecks: 'id, &[habitId+date], date',
      workouts: 'id, date',
      studySubjects: 'id',
      studyGoals: 'id, subjectId',
      studySessions: 'id, date, subjectId, goalId',
      categories: 'id, kind',
      transactions: 'id, date, categoryId',
      savingsGoals: 'id',
    });
  }
}

export const db = new AppDB();

export function newId(): string {
  return crypto.randomUUID();
}
