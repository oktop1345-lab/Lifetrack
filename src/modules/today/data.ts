// Загрузка всех данных приложения разом - для экрана «Сегодня» и сводки для AI.

import { db } from '../../core/db';
import { getSetting } from '../../core/settings';
import type {
  Category,
  Habit,
  HabitCheck,
  SavingsGoal,
  ScreenDay,
  StudyGoal,
  StudySession,
  StudySubject,
  Transaction,
  Urge,
  Workout,
} from '../../core/types';

export interface AllData {
  habits: Habit[];
  checks: HabitCheck[];
  workouts: Workout[];
  subjects: StudySubject[];
  studyGoals: StudyGoal[];
  sessions: StudySession[];
  categories: Category[];
  transactions: Transaction[];
  savingsGoals: SavingsGoal[];
  screenDays: ScreenDay[];
  urges: Urge[];
  currency: string;
  budget: number | null;
  screenLimit: number | null;
}

export async function loadAll(): Promise<AllData> {
  const [
    habits,
    checks,
    workouts,
    subjects,
    studyGoals,
    sessions,
    categories,
    transactions,
    savingsGoals,
    screenDays,
    urges,
    currency,
    budget,
    screenLimit,
  ] = await Promise.all([
    db.habits.toArray(),
    db.habitChecks.toArray(),
    db.workouts.toArray(),
    db.studySubjects.toArray(),
    db.studyGoals.toArray(),
    db.studySessions.toArray(),
    db.categories.toArray(),
    db.transactions.toArray(),
    db.savingsGoals.toArray(),
    db.screenDays.toArray(),
    db.urges.toArray(),
    getSetting('currency'),
    getSetting('monthlyBudget'),
    getSetting('screenLimitMinutes'),
  ]);
  habits.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    habits,
    checks,
    workouts,
    subjects,
    studyGoals,
    sessions,
    categories,
    transactions,
    savingsGoals,
    screenDays,
    urges,
    currency,
    budget,
    screenLimit,
  };
}
