import { describe, expect, it } from 'vitest';
import type { StudyGoal, StudySession, StudySubject } from '../../core/types';
import { clock, dailyMinutes, goalProgress, minutesBySubject, timerClock, timerMinutes, totalMinutes } from './logic';

const subjects: StudySubject[] = [
  { id: 'en', name: 'Английский', createdAt: '2026-10-01T00:00:00Z' },
  { id: 'py', name: 'Python', createdAt: '2026-10-01T00:00:00Z' },
  { id: 'ma', name: 'Математика', createdAt: '2026-10-01T00:00:00Z' },
];

const sessions: StudySession[] = [
  { id: '1', subjectId: 'en', date: '2026-11-10', minutes: 30, goalId: 'g1' },
  { id: '2', subjectId: 'py', date: '2026-11-10', minutes: 90 },
  { id: '3', subjectId: 'en', date: '2026-11-12', minutes: 45, goalId: 'g1' },
  { id: '4', subjectId: 'en', date: '2026-10-01', minutes: 60 },
];

describe('minutesBySubject', () => {
  it('складывает время по предметам за период, по убыванию', () => {
    expect(minutesBySubject(sessions, subjects, '2026-11-01', '2026-11-30')).toEqual([
      { id: 'py', name: 'Python', minutes: 90 },
      { id: 'en', name: 'Английский', minutes: 75 },
    ]);
  });

  it('занятия удалённого предмета не теряются', () => {
    const result = minutesBySubject([{ id: 'x', subjectId: 'gone', date: '2026-11-11', minutes: 20 }], subjects, '2026-11-01', '2026-11-30');
    expect(result).toEqual([{ id: 'gone', name: 'Удалённый предмет', minutes: 20 }]);
  });
});

describe('суммы', () => {
  it('всего минут за период', () => {
    expect(totalMinutes(sessions, '2026-11-10', '2026-11-10')).toBe(120);
    expect(totalMinutes(sessions, '2026-01-01', '2026-12-31')).toBe(225);
  });

  it('минуты по дням для мини-графика', () => {
    expect(dailyMinutes(sessions, ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'])).toEqual([0, 120, 0, 45]);
  });
});

describe('goalProgress', () => {
  const goal: StudyGoal = { id: 'g1', subjectId: 'en', title: 'Уровень B2', targetMinutes: 300, createdAt: '2026-11-01T00:00:00Z' };

  it('считает только занятия, привязанные к цели', () => {
    expect(goalProgress(goal, sessions)).toEqual({ minutes: 75, share: 0.25, left: 225, done: false });
  });

  it('достигнутая цель', () => {
    const progress = goalProgress({ ...goal, targetMinutes: 60 }, sessions);
    expect(progress.done).toBe(true);
    expect(progress.left).toBe(0);
    expect(progress.share).toBeGreaterThan(1);
  });
});

describe('таймер', () => {
  const start = '2026-11-14T10:00:00.000Z';

  it('считает минуты от времени старта и не даёт нулевое занятие', () => {
    expect(timerMinutes(start, new Date('2026-11-14T10:25:20.000Z'))).toBe(25);
    expect(timerMinutes(start, new Date('2026-11-14T10:00:10.000Z'))).toBe(1);
    expect(timerMinutes(start, new Date('2026-11-14T11:30:40.000Z'))).toBe(91);
  });

  it('показывает часы только когда они есть', () => {
    expect(timerClock(start, new Date('2026-11-14T10:05:07.000Z'))).toBe('05:07');
    expect(timerClock(start, new Date('2026-11-14T11:05:07.000Z'))).toBe('1:05:07');
    expect(clock(600)).toBe('10:00');
    expect(clock(-5)).toBe('00:00');
  });
});
