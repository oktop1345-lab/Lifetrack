import { describe, expect, it } from 'vitest';
import type { Habit, HabitCheck } from '../../core/types';
import {
  bestStreak,
  currentStreak,
  heatLevel,
  heatmapDays,
  indexChecks,
  isScheduled,
  progress,
  scheduleText,
  weeklyStats,
} from './logic';

// 2026-11-02 - понедельник.
const daily: Habit = { id: 'd', name: 'Зарядка', schedule: { type: 'daily' }, createdAt: '2026-11-02T08:00:00' };
const mwf: Habit = {
  id: 'w',
  name: 'Бег',
  schedule: { type: 'weekdays', days: [1, 3, 5] },
  createdAt: '2026-11-02T08:00:00',
};

const checks = (habitId: string, dates: string[]): HabitCheck[] =>
  dates.map((date) => ({ id: `${habitId}-${date}`, habitId, date }));

describe('isScheduled', () => {
  it('ежедневная привычка запланирована каждый день с даты создания', () => {
    expect(isScheduled(daily, '2026-11-02')).toBe(true);
    expect(isScheduled(daily, '2026-11-08')).toBe(true);
    expect(isScheduled(daily, '2026-11-01')).toBe(false);
  });

  it('привычка по дням недели запланирована только в свои дни', () => {
    expect(isScheduled(mwf, '2026-11-02')).toBe(true); // Пн
    expect(isScheduled(mwf, '2026-11-03')).toBe(false); // Вт
    expect(isScheduled(mwf, '2026-11-06')).toBe(true); // Пт
  });

  it('после архивации привычка не запланирована', () => {
    const archived = { ...daily, archivedAt: '2026-11-05T10:00:00' };
    expect(isScheduled(archived, '2026-11-04')).toBe(true);
    expect(isScheduled(archived, '2026-11-05')).toBe(false);
  });
});

describe('currentStreak', () => {
  it('считает дни подряд, включая сегодня', () => {
    const index = indexChecks(checks('d', ['2026-11-04', '2026-11-05', '2026-11-06']));
    expect(currentStreak(daily, index, '2026-11-06')).toBe(3);
  });

  it('не обрывается, пока сегодняшний день не отмечен', () => {
    const index = indexChecks(checks('d', ['2026-11-04', '2026-11-05']));
    expect(currentStreak(daily, index, '2026-11-06')).toBe(2);
  });

  it('обрывается на пропущенном дне', () => {
    const index = indexChecks(checks('d', ['2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06']));
    expect(currentStreak(daily, index, '2026-11-06')).toBe(2);
  });

  it('незапланированные дни серию не прерывают', () => {
    // Пн, Ср, Пт выполнены; Вт и Чт не запланированы.
    const index = indexChecks(checks('w', ['2026-11-02', '2026-11-04', '2026-11-06']));
    expect(currentStreak(mwf, index, '2026-11-07')).toBe(3);
  });

  it('без отметок серия равна нулю', () => {
    expect(currentStreak(daily, indexChecks([]), '2026-11-06')).toBe(0);
  });
});

describe('bestStreak', () => {
  it('находит самую длинную серию в прошлом', () => {
    const index = indexChecks(
      checks('d', ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-06', '2026-11-07']),
    );
    expect(bestStreak(daily, index, '2026-11-08')).toBe(3);
  });

  it('учитывает текущую серию, если сегодня ещё не отмечено', () => {
    const index = indexChecks(checks('d', ['2026-11-02', '2026-11-03']));
    expect(bestStreak(daily, index, '2026-11-04')).toBe(2);
  });
});

describe('progress', () => {
  it('считает выполненное и запланированное по нескольким привычкам', () => {
    const index = indexChecks([
      ...checks('d', ['2026-11-02', '2026-11-03']),
      ...checks('w', ['2026-11-02']),
    ]);
    // За Пн-Ср: зарядка 3 дня, бег 2 дня (Пн, Ср) = 5 запланировано, 3 выполнено.
    expect(progress([daily, mwf], index, '2026-11-02', '2026-11-04')).toEqual({ done: 3, scheduled: 5 });
  });

  it('не считает дни до создания привычки', () => {
    expect(progress([daily], indexChecks([]), '2026-10-30', '2026-11-02')).toEqual({ done: 0, scheduled: 1 });
  });

  it('отметка в незапланированный день в процент не входит', () => {
    const index = indexChecks(checks('w', ['2026-11-03'])); // вторник
    expect(progress([mwf], index, '2026-11-02', '2026-11-04')).toEqual({ done: 0, scheduled: 2 });
  });
});

describe('heatLevel и heatmapDays', () => {
  it('делит долю выполнения на уровни', () => {
    expect(heatLevel({ done: 0, scheduled: 0 })).toBe(-1);
    expect(heatLevel({ done: 0, scheduled: 3 })).toBe(0);
    expect(heatLevel({ done: 1, scheduled: 4 })).toBe(1);
    expect(heatLevel({ done: 1, scheduled: 3 })).toBe(2);
    expect(heatLevel({ done: 2, scheduled: 3 })).toBe(3);
    expect(heatLevel({ done: 3, scheduled: 3 })).toBe(4);
  });

  it('даёт по одной ячейке на день', () => {
    const index = indexChecks(checks('d', ['2026-11-02']));
    const days = heatmapDays([daily], index, '2026-11-01', '2026-11-03');
    expect(days.map((d) => d.level)).toEqual([-1, 4, 0]);
    expect(days.map((d) => d.date)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
  });
});

describe('weeklyStats', () => {
  it('группирует по неделям с понедельника, текущая неделя - до сегодня', () => {
    const index = indexChecks(
      checks('d', ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-09', '2026-11-10']),
    );
    // Сегодня среда 11 ноября.
    const stats = weeklyStats([daily], index, '2026-11-11', 3);
    expect(stats.map((s) => s.weekStart)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09']);
    expect(stats[0]).toMatchObject({ done: 0, scheduled: 0 }); // привычки ещё не было
    expect(stats[1]).toMatchObject({ done: 3, scheduled: 7 });
    expect(stats[2]).toMatchObject({ done: 2, scheduled: 3 }); // Пн-Ср
  });
});

describe('scheduleText', () => {
  it('описывает расписание словами', () => {
    expect(scheduleText(daily)).toBe('Каждый день');
    expect(scheduleText(mwf)).toBe('Пн, Ср, Пт');
    expect(scheduleText({ ...mwf, schedule: { type: 'weekdays', days: [7, 6] } })).toBe('Сб, Вс');
  });
});
