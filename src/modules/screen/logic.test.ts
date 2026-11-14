import { describe, expect, it } from 'vitest';
import type { ScreenDay, Urge } from '../../core/types';
import {
  appTotals,
  averageMinutes,
  compareGroups,
  dayPart,
  durationToInput,
  limitStreak,
  minutesFor,
  parseDuration,
  parseScreenReply,
  screenLevel,
  urgeStats,
  weekSummary,
} from './logic';

const day = (date: string, totalMinutes: number, apps: [string, number][] = []): ScreenDay => ({
  date,
  totalMinutes,
  apps: apps.map(([name, minutes]) => ({ name, minutes })),
  source: 'manual',
});

const days: ScreenDay[] = [
  day('2026-11-09', 150, [['TikTok', 60], ['YouTube', 50]]),
  day('2026-11-10', 170, [['tiktok ', 90], ['Telegram', 30]]),
  day('2026-11-11', 260, [['YouTube', 120]]),
  day('2026-11-12', 120),
  day('2026-11-13', 100),
];

describe('parseDuration', () => {
  it('понимает минуты, ч:мм и запись со словами', () => {
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('1:30')).toBe(90);
    expect(parseDuration('1ч 30м')).toBe(90);
    expect(parseDuration('2 ч')).toBe(120);
    expect(parseDuration('45 мин')).toBe(45);
    expect(parseDuration('1,5ч')).toBe(90);
  });

  it('отклоняет пустое и мусор', () => {
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('много')).toBeNull();
  });

  it('durationToInput даёт ч:мм', () => {
    expect(durationToInput(95)).toBe('1:35');
    expect(parseDuration(durationToInput(215))).toBe(215);
  });
});

describe('limitStreak', () => {
  it('считает дни подряд ниже лимита, начиная с сегодня', () => {
    expect(limitStreak(days, 180, '2026-11-13')).toBe(2); // 13 и 12, 11-го превышение
  });

  it('если за сегодня записи нет, считает со вчера', () => {
    expect(limitStreak(days, 180, '2026-11-14')).toBe(2);
  });

  it('день без записи обрывает серию', () => {
    expect(limitStreak(days, 180, '2026-11-16')).toBe(0);
  });

  it('время ровно на лимите считается выполненным', () => {
    expect(limitStreak([day('2026-11-13', 180)], 180, '2026-11-13')).toBe(1);
  });
});

describe('ряды и средние', () => {
  it('минуты по дням с пропусками', () => {
    expect(minutesFor(days, ['2026-11-08', '2026-11-09', '2026-11-10'])).toEqual([null, 150, 170]);
  });

  it('среднее только по дням с записью', () => {
    expect(averageMinutes(days, '2026-11-09', '2026-11-13')).toBe(160);
    expect(averageMinutes(days, '2026-01-01', '2026-01-31')).toBeNull();
  });

  it('уровень закраски относительно лимита', () => {
    expect(screenLevel(60, 180, 300)).toBe(1);
    expect(screenLevel(180, 180, 300)).toBe(2);
    expect(screenLevel(250, 180, 300)).toBe(3);
    expect(screenLevel(300, 180, 300)).toBe(4);
  });
});

describe('appTotals', () => {
  it('складывает приложения без учёта регистра и пробелов, по убыванию', () => {
    expect(appTotals(days, '2026-11-09', '2026-11-13')).toEqual([
      { name: 'YouTube', minutes: 170 },
      { name: 'TikTok', minutes: 150 },
      { name: 'Telegram', minutes: 30 },
    ]);
  });

  it('сворачивает хвост в «Прочее»', () => {
    expect(appTotals(days, '2026-11-09', '2026-11-13', 1)).toEqual([
      { name: 'YouTube', minutes: 170 },
      { name: 'Прочее', minutes: 180 },
    ]);
  });
});

describe('compareGroups', () => {
  it('сравнивает средние в двух группах', () => {
    const result = compareGroups([
      { minutes: 100, flag: true },
      { minutes: 120, flag: true },
      { minutes: 140, flag: true },
      { minutes: 200, flag: false },
      { minutes: 220, flag: false },
      { minutes: 240, flag: false },
      { minutes: 999, flag: null },
    ]);
    expect(result).toEqual({ yes: { average: 120, days: 3 }, no: { average: 220, days: 3 }, enough: true });
  });

  it('при малом числе дней говорит, что данных мало', () => {
    expect(compareGroups([{ minutes: 100, flag: true }, { minutes: 200, flag: false }]).enough).toBe(false);
  });
});

describe('urgeStats', () => {
  // Местное время: без 'Z', чтобы тест не зависел от часового пояса.
  const urges: Urge[] = [
    { id: '1', at: '2026-11-09T23:10:00', trigger: 'bedtime', insteadOf: 'Почитал' },
    { id: '2', at: '2026-11-09T14:00:00', trigger: 'boredom' },
    { id: '3', at: '2026-11-11T22:30:00', trigger: 'bedtime' },
    { id: '4', at: '2026-11-15T03:00:00', trigger: 'stress' },
  ];

  it('считает по триггерам, времени суток и дням недели', () => {
    const stats = urgeStats(urges);
    expect(stats.total).toBe(4);
    expect(stats.replaced).toBe(1);
    expect(stats.byTrigger[0]).toEqual({ trigger: 'bedtime', label: 'Перед сном', count: 2 });
    expect(stats.byPart).toEqual([1, 0, 1, 2]); // ночь, утро, день, вечер
    expect(stats.byWeekday).toEqual([2, 0, 1, 0, 0, 0, 1]); // Пн, Ср, Вс
  });

  it('часть суток по часу', () => {
    expect([0, 5, 6, 11, 12, 17, 18, 23].map(dayPart)).toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
  });
});

describe('parseScreenReply', () => {
  it('читает JSON, даже если модель обернула его текстом и разметкой', () => {
    const reply = 'Вот данные:\n```json\n{"date": "2026-11-13", "total_minutes": 215, "apps": [{"name": "TikTok", "minutes": 80}, {"name": "YouTube", "minutes": "45"}]}\n```';
    expect(parseScreenReply(reply)).toEqual({
      date: '2026-11-13',
      totalMinutes: 215,
      apps: [
        { name: 'TikTok', minutes: 80 },
        { name: 'YouTube', minutes: 45 },
      ],
    });
  });

  it('если общего времени нет, складывает приложения', () => {
    expect(parseScreenReply('{"apps": [{"name": "A", "minutes": 30}, {"name": "B", "minutes": 20}]}')).toEqual({
      date: null,
      totalMinutes: 50,
      apps: [
        { name: 'A', minutes: 30 },
        { name: 'B', minutes: 20 },
      ],
    });
  });

  it('отбрасывает невозможные числа и мусорные строки', () => {
    const parsed = parseScreenReply('{"total_minutes": 200, "apps": [{"name": "A", "minutes": 5000}, {"name": "", "minutes": 10}, null], "date": "вчера"}');
    expect(parsed).toEqual({ date: null, totalMinutes: 200, apps: [] });
  });

  it('возвращает null, если чисел нет', () => {
    expect(parseScreenReply('Я не вижу на картинке экранного времени.')).toBeNull();
    expect(parseScreenReply('{"total_minutes": null, "apps": []}')).toBeNull();
    expect(parseScreenReply('{сломанный json')).toBeNull();
  });
});

describe('weekSummary', () => {
  it('собирает короткую сводку для AI', () => {
    const urges: Urge[] = [{ id: '1', at: '2026-11-12T23:10:00', trigger: 'bedtime', insteadOf: 'Почитал книгу' }];
    const text = weekSummary(days, urges, 180, '2026-11-13');
    expect(text).toContain('Лимит в сутки: 3 ч.');
    expect(text).toContain('Дней выше лимита: 1 из 5.');
    expect(text).toContain('YouTube 2 ч 50 мин');
    expect(text).toContain('Перед сном 1');
    expect(text).toContain('Почитал книгу');
  });

  it('без данных честно говорит, что их нет', () => {
    const text = weekSummary([], [], null, '2026-11-13');
    expect(text).toContain('Лимит не задан.');
    expect(text).toContain('Записей экранного времени за неделю нет.');
  });
});
