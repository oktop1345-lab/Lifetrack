import { describe, expect, it } from 'vitest';
import { sampleData } from '../modules/today/sample';
import { buildContext } from './context';

describe('buildContext', () => {
  const text = buildContext(sampleData(), '2026-11-13', 30);

  it('содержит итоги по всем разделам', () => {
    expect(text).toContain('ПРИВЫЧКИ');
    expect(text).toContain('- Зарядка: каждый день, выполнено 23%');
    expect(text).toContain('ТРЕНИРОВКИ');
    expect(text).toContain('Тренировок: 2.');
    expect(text).toContain('УЧЁБА');
    expect(text).toContain('Всего 2 ч.');
    expect(text).toContain('Цель «Уровень B2»: 1 ч 30 мин из 10 ч (15%)');
    expect(text).toContain('ФИНАНСЫ (валюта KZT)');
    expect(text).toContain('Доходы 300 000 ₸, расходы 7 500 ₸');
    expect(text).toContain('Еда 7 500 ₸ (100%)');
    expect(text).toContain('Цель накоплений «Ноутбук»: 150 000 ₸ из 600 000 ₸ (25%)');
    expect(text).toContain('ЭКРАННОЕ ВРЕМЯ');
    expect(text).toContain('Среднее 3 ч 20 мин в день (записей: 3).');
    expect(text).toContain('Тянуло скроллить: 2 раз');
    expect(text).toContain('По времени суток: ночь 0, утро 1, день 0, вечер 1.');
  });

  it('помнит причины «тянет скроллить»', () => {
    const data = sampleData();
    data.urges[0]!.note = 'не могу уснуть';
    expect(buildContext(data, '2026-11-13', 30)).toContain('Последние причины: «не могу уснуть».');
  });

  it('отправляет сводку, а не сырые записи', () => {
    const data = sampleData();
    data.transactions[0]!.note = 'секретная покупка';
    data.transactions[1]!.note = 'зарплата за проект';
    data.sessions[0]!.note = 'конспект';
    const result = buildContext(data, '2026-11-13', 30);
    expect(result).not.toContain('секретная покупка');
    expect(result).not.toContain('зарплата за проект');
    expect(result).not.toContain('конспект');
    expect(result.length).toBeLessThan(2500);
  });

  it('период ограничивает данные', () => {
    const week = buildContext(sampleData(), '2026-11-13', 7);
    expect(week).toContain('Тренировок: 1.');
    expect(week).toContain('Доходы 300 000 ₸, расходы 5 000 ₸');
  });

  it('пустая база даёт короткую честную сводку', () => {
    const empty = sampleData();
    Object.assign(empty, { habits: [], checks: [], workouts: [], sessions: [], studyGoals: [], transactions: [], savingsGoals: [], screenDays: [], urges: [], budget: null });
    const result = buildContext(empty, '2026-11-13', 30);
    expect(result).toContain('Привычек нет.');
    expect(result).toContain('За период тренировок нет.');
    expect(result).toContain('За период операций нет.');
    expect(result).toContain('За период записей нет.');
  });
});
