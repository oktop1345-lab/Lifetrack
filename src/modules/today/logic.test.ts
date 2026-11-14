import { describe, expect, it } from 'vitest';
import { change, overview, periods } from './logic';
import { sampleData } from './sample';

describe('overview', () => {
  it('собирает итоги по всем разделам за период', () => {
    expect(overview(sampleData(), '2026-11-07', '2026-11-13')).toEqual({
      habitsDone: 2,
      habitsScheduled: 7,
      workouts: 1,
      volume: 600,
      studyMinutes: 90,
      expense: 500000,
      income: 30000000,
      screenAverage: 150,
      urges: 1,
    });
  });

  it('пустой период - нули и отсутствие экранного времени', () => {
    const result = overview(sampleData(), '2026-09-01', '2026-09-07');
    expect(result.workouts).toBe(0);
    expect(result.habitsScheduled).toBe(0);
    expect(result.screenAverage).toBeNull();
  });
});

describe('periods', () => {
  it('текущий и предыдущий периоды идут подряд и равны по длине', () => {
    expect(periods('2026-11-13', 7)).toEqual({
      current: ['2026-11-07', '2026-11-13'],
      previous: ['2026-10-31', '2026-11-06'],
    });
  });
});

describe('change', () => {
  it('показывает рост и падение в процентах', () => {
    expect(change(112, 100)).toBe('+12%');
    expect(change(92, 100)).toBe('−8%');
  });

  it('молчит, когда сравнивать не с чем', () => {
    expect(change(5, 0)).toBe('');
    expect(change(null, 100)).toBe('');
    expect(change(100, null)).toBe('');
    expect(change(100, 100)).toBe('');
  });
});
