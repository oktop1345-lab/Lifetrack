import Dexie, { type Table } from 'dexie';
import type {
  Category,
  Habit,
  HabitCheck,
  SavingsGoal,
  ScreenDay,
  SettingRow,
  StudyGoal,
  StudySession,
  StudySubject,
  Transaction,
  Urge,
  Workout,
} from './types';

export const DB_NAME = 'life-tracker';

/** Номер последней версии схемы. Увеличивать вместе с новым db.version(n). */
export const SCHEMA_VERSION = 2;

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
  screenDays!: Table<ScreenDay, string>;
  urges!: Table<Urge, string>;

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
    // Версия 2: экранное время и записи «тянет скроллить».
    this.version(2).stores({
      screenDays: 'date',
      urges: 'id, at',
    });
  }
}

export const db = new AppDB();

export function newId(): string {
  return crypto.randomUUID();
}
