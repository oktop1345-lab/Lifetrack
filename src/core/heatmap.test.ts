import { describe, expect, it } from 'vitest';
import { dateRange, isoWeekday } from './dates';
import { heatmapStart, monthLabels } from './heatmap';

describe('heatmapStart', () => {
  it('начинается с понедельника и покрывает нужное число недель', () => {
    const start = heatmapStart('2026-11-13', 53);
    expect(isoWeekday(start)).toBe(1);
    expect(start).toBe('2025-11-10');
    expect(dateRange(start, '2026-11-13')).toHaveLength(52 * 7 + 5);
  });
});

describe('monthLabels', () => {
  it('подписывает месяц над первой неделей, которая в нём начинается', () => {
    // 5 недель с понедельника 26 октября 2026: 26.10, 02.11, 09.11, 16.11, 23.11
    const labels = monthLabels(dateRange('2026-10-26', '2026-11-29'));
    expect(labels).toEqual([{ column: 1, text: 'ноя' }]);
  });

  it('расставляет подписи по столбцам недель', () => {
    const labels = monthLabels(dateRange('2026-09-07', '2026-11-29'));
    expect(labels).toEqual([
      { column: 0, text: 'сен' },
      { column: 4, text: 'окт' },
      { column: 8, text: 'ноя' },
    ]);
  });
});
