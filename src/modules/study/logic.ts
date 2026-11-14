// Логика учёбы: время по предметам, прогресс по целям, таймер. Без DOM и без базы.

import type { StudyGoal, StudySession, StudySubject } from '../../core/types';

export interface SubjectMinutes {
  id: string;
  name: string;
  minutes: number;
}

/** Время по предметам за период (включительно), по убыванию. Предметы без занятий не показываются. */
export function minutesBySubject(
  sessions: StudySession[],
  subjects: StudySubject[],
  from: string,
  to: string,
): SubjectMinutes[] {
  const sums = new Map<string, number>();
  for (const session of sessions) {
    if (session.date < from || session.date > to) continue;
    sums.set(session.subjectId, (sums.get(session.subjectId) ?? 0) + session.minutes);
  }
  const names = new Map(subjects.map((subject) => [subject.id, subject.name]));
  return [...sums.entries()]
    .map(([id, minutes]) => ({ id, name: names.get(id) ?? 'Удалённый предмет', minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

/** Сколько минут за период (включительно). */
export function totalMinutes(sessions: StudySession[], from: string, to: string): number {
  let total = 0;
  for (const session of sessions) {
    if (session.date >= from && session.date <= to) total += session.minutes;
  }
  return total;
}

/** Минуты по дням - для мини-графика: по одному числу на день. */
export function dailyMinutes(sessions: StudySession[], days: string[]): number[] {
  const sums = new Map<string, number>();
  for (const session of sessions) sums.set(session.date, (sums.get(session.date) ?? 0) + session.minutes);
  return days.map((day) => sums.get(day) ?? 0);
}

export interface GoalProgress {
  minutes: number;
  /** Доля выполненного: 0.5 - половина, 1 и больше - цель достигнута. */
  share: number;
  left: number;
  done: boolean;
}

/** Прогресс по цели: сумма занятий, привязанных к этой цели. */
export function goalProgress(goal: StudyGoal, sessions: StudySession[]): GoalProgress {
  let minutes = 0;
  for (const session of sessions) {
    if (session.goalId === goal.id) minutes += session.minutes;
  }
  const left = Math.max(0, goal.targetMinutes - minutes);
  return { minutes, share: goal.targetMinutes > 0 ? minutes / goal.targetMinutes : 0, left, done: left === 0 };
}

/** Сколько минут прошло с запуска таймера (не меньше одной). */
export function timerMinutes(startedAt: string, now: Date): number {
  return Math.max(1, Math.round((now.getTime() - new Date(startedAt).getTime()) / 60_000));
}

/** Показание таймера: '05:07' или '1:05:07'. */
export function timerClock(startedAt: string, now: Date): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000));
  return clock(seconds);
}

/** Секунды -> 'мм:сс' или 'ч:мм:сс'. */
export function clock(totalSeconds: number): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
