// Небольшой набор данных для тестов обзора и сводки AI.

import type { AllData } from './data';

export function sampleData(): AllData {
  return {
    habits: [{ id: 'h', name: 'Зарядка', schedule: { type: 'daily' }, createdAt: '2026-11-01T08:00:00' }],
    checks: [
      { id: 'c1', habitId: 'h', date: '2026-11-10' },
      { id: 'c2', habitId: 'h', date: '2026-11-11' },
      { id: 'c3', habitId: 'h', date: '2026-11-04' },
    ],
    workouts: [
      { id: 'w1', date: '2026-11-10', type: 'Силовая', exercises: [{ name: 'Приседания', sets: [{ weight: 60, reps: 10 }] }] },
      { id: 'w2', date: '2026-11-03', type: 'Кардио', exercises: [] },
    ],
    subjects: [{ id: 's', name: 'Английский', createdAt: '2026-11-01T00:00:00Z' }],
    studyGoals: [{ id: 'g', subjectId: 's', title: 'Уровень B2', targetMinutes: 600, createdAt: '2026-11-01T00:00:00Z' }],
    sessions: [
      { id: 'ss1', subjectId: 's', goalId: 'g', date: '2026-11-12', minutes: 90 },
      { id: 'ss2', subjectId: 's', date: '2026-11-05', minutes: 30 },
    ],
    categories: [
      { id: 'food', name: 'Еда', kind: 'expense', color: 0 },
      { id: 'pay', name: 'Зарплата', kind: 'income', color: 0 },
    ],
    transactions: [
      { id: 't1', kind: 'expense', amount: 500000, categoryId: 'food', date: '2026-11-11' },
      { id: 't2', kind: 'income', amount: 30000000, categoryId: 'pay', date: '2026-11-09' },
      { id: 't3', kind: 'expense', amount: 250000, categoryId: 'food', date: '2026-11-04' },
    ],
    savingsGoals: [{ id: 'sg', name: 'Ноутбук', target: 60000000, saved: 15000000, createdAt: '2026-10-01T00:00:00Z' }],
    screenDays: [
      { date: '2026-11-12', totalMinutes: 200, apps: [{ name: 'TikTok', minutes: 90 }], source: 'manual' },
      { date: '2026-11-13', totalMinutes: 100, apps: [], source: 'manual' },
      { date: '2026-11-05', totalMinutes: 300, apps: [], source: 'manual' },
    ],
    urges: [
      { id: 'u1', at: '2026-11-12T22:30:00', trigger: 'bedtime' },
      { id: 'u2', at: '2026-11-02T10:00:00', trigger: 'boredom' },
    ],
    currency: 'KZT',
    budget: 20000000,
    screenLimit: 180,
  };
}
