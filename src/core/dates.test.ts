import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  dateRange,
  daysBetween,
  isoWeekday,
  monthKey,
  startOfWeek,
  toDateStr,
} from './dates';

describe('dates', () => {
  it('форматирует дату в местном времени', () => {
    expect(toDateStr(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('прибавляет дни через границы месяца и года', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('считает разницу в днях', () => {
    expect(daysBetween('2026-11-06', '2026-11-13')).toBe(7);
    expect(daysBetween('2026-11-13', '2026-11-06')).toBe(-7);
    expect(daysBetween('2026-03-01', '2026-03-01')).toBe(0);
  });

  it('день недели: понедельник = 1, воскресенье = 7', () => {
    expect(isoWeekday('2026-11-09')).toBe(1);
    expect(isoWeekday('2026-11-13')).toBe(5);
    expect(isoWeekday('2026-11-15')).toBe(7);
  });

  it('находит понедельник недели', () => {
    expect(startOfWeek('2026-11-13')).toBe('2026-11-09');
    expect(startOfWeek('2026-11-15')).toBe('2026-11-09');
    expect(startOfWeek('2026-11-09')).toBe('2026-11-09');
  });

  it('работает с месяцами', () => {
    expect(monthKey('2026-11-13')).toBe('2026-11');
    expect(addMonths('2026-11', 2)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
  });

  it('строит диапазон дней включительно', () => {
    expect(dateRange('2026-02-27', '2026-03-02')).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ]);
  });
});
