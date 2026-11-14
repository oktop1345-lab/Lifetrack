import { describe, expect, it } from 'vitest';
import type { Category, SavingsGoal, Transaction } from '../../core/types';
import {
  budgetStatus,
  categoryBreakdown,
  dailyExpenses,
  goalStatus,
  groupByDay,
  monthlySeries,
  monthTotals,
  nextColor,
  sumBetween,
} from './logic';

const cats: Category[] = [
  { id: 'food', name: 'Еда', kind: 'expense', color: 0 },
  { id: 'bus', name: 'Транспорт', kind: 'expense', color: 1 },
  { id: 'fun', name: 'Развлечения', kind: 'expense', color: 2 },
  { id: 'pay', name: 'Зарплата', kind: 'income', color: 0 },
];

let n = 0;
const tx = (kind: 'income' | 'expense', amount: number, categoryId: string, date: string): Transaction => ({
  id: `t${n++}`,
  kind,
  amount,
  categoryId,
  date,
});

const txs: Transaction[] = [
  tx('income', 300000_00, 'pay', '2026-11-01'),
  tx('expense', 5000_00, 'food', '2026-11-02'),
  tx('expense', 3000_00, 'food', '2026-11-02'),
  tx('expense', 1000_00, 'bus', '2026-11-03'),
  tx('expense', 20000_00, 'fun', '2026-10-15'),
  tx('income', 250000_00, 'pay', '2026-10-01'),
];

describe('monthTotals', () => {
  it('считает доходы, расходы и остаток только за нужный месяц', () => {
    expect(monthTotals(txs, '2026-11')).toEqual({ income: 300000_00, expense: 9000_00, balance: 291000_00 });
    expect(monthTotals(txs, '2026-10')).toEqual({ income: 250000_00, expense: 20000_00, balance: 230000_00 });
    expect(monthTotals(txs, '2026-09')).toEqual({ income: 0, expense: 0, balance: 0 });
  });
});

describe('categoryBreakdown', () => {
  it('складывает по категориям и сортирует по убыванию', () => {
    expect(categoryBreakdown(txs, cats, '2026-11', 'expense')).toEqual([
      { id: 'food', name: 'Еда', amount: 8000_00, color: 0 },
      { id: 'bus', name: 'Транспорт', amount: 1000_00, color: 1 },
    ]);
  });

  it('сворачивает лишние категории в «Прочее»', () => {
    const slices = categoryBreakdown(txs, cats, '2026-11', 'expense', 1);
    expect(slices).toEqual([
      { id: 'food', name: 'Еда', amount: 8000_00, color: 0 },
      { id: 'other', name: 'Прочее', amount: 1000_00, color: null },
    ]);
  });

  it('две категории одного цвета не показываются вместе', () => {
    const same = [...cats, { id: 'cafe', name: 'Кафе', kind: 'expense' as const, color: 0 }];
    const more = [...txs, tx('expense', 500_00, 'cafe', '2026-11-05')];
    const slices = categoryBreakdown(more, same, '2026-11', 'expense');
    expect(slices.map((s) => s.id)).toEqual(['food', 'bus', 'other']);
    expect(slices[2]?.amount).toBe(500_00);
  });

  it('операции удалённой категории попадают в «Прочее»', () => {
    const more = [...txs, tx('expense', 700_00, 'gone', '2026-11-06')];
    const slices = categoryBreakdown(more, cats, '2026-11', 'expense');
    expect(slices[slices.length - 1]).toEqual({ id: 'other', name: 'Прочее', amount: 700_00, color: null });
  });

  it('сумма долей равна сумме расходов', () => {
    const total = categoryBreakdown(txs, cats, '2026-11', 'expense', 1).reduce((sum, s) => sum + s.amount, 0);
    expect(total).toBe(monthTotals(txs, '2026-11').expense);
  });
});

describe('monthlySeries', () => {
  it('даёт месяцы подряд, включая пустые', () => {
    const series = monthlySeries(txs, '2026-11', 3);
    expect(series.map((p) => p.month)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(series.map((p) => p.expense)).toEqual([0, 20000_00, 9000_00]);
    expect(series.map((p) => p.income)).toEqual([0, 250000_00, 300000_00]);
  });
});

describe('budgetStatus', () => {
  it('считает остаток и сколько можно тратить в день', () => {
    // 21 ноября: до конца месяца 10 дней, включая сегодня.
    const status = budgetStatus(100000_00, 60000_00, '2026-11', '2026-11-21');
    expect(status.left).toBe(40000_00);
    expect(status.share).toBeCloseTo(0.6);
    expect(status.over).toBe(false);
    expect(status.perDay).toBe(4000_00);
  });

  it('замечает перерасход', () => {
    const status = budgetStatus(100000_00, 120000_00, '2026-11', '2026-11-21');
    expect(status.over).toBe(true);
    expect(status.left).toBe(-20000_00);
    expect(status.perDay).toBeNull();
  });

  it('для прошлого месяца не считает «в день»', () => {
    expect(budgetStatus(100000_00, 50000_00, '2026-10', '2026-11-21').perDay).toBeNull();
  });
});

describe('goalStatus', () => {
  const goal: SavingsGoal = { id: 'g', name: 'Ноутбук', target: 600000_00, saved: 150000_00, createdAt: '2026-01-01T00:00:00Z' };

  it('считает долю и остаток', () => {
    const status = goalStatus(goal, '2026-11-14');
    expect(status.share).toBeCloseTo(0.25);
    expect(status.left).toBe(450000_00);
    expect(status.perMonth).toBeNull();
  });

  it('со сроком считает, сколько откладывать в месяц', () => {
    // До 14 февраля 2027 - 92 дня, это 4 месяца (с округлением вверх).
    const status = goalStatus({ ...goal, deadline: '2027-02-14' }, '2026-11-14');
    expect(status.perMonth).toBe(112500_00);
  });

  it('достигнутая цель', () => {
    const status = goalStatus({ ...goal, saved: 700000_00 }, '2026-11-14');
    expect(status.done).toBe(true);
    expect(status.left).toBe(0);
    expect(status.share).toBeGreaterThan(1);
  });
});

describe('groupByDay, dailyExpenses, sumBetween', () => {
  it('группирует операции месяца по дням, новые сверху', () => {
    const groups = groupByDay(txs, '2026-11');
    expect(groups.map((g) => g.date)).toEqual(['2026-11-03', '2026-11-02', '2026-11-01']);
    expect(groups[1]).toMatchObject({ expense: 8000_00, income: 0 });
    expect(groups[1]?.items).toHaveLength(2);
    expect(groups[2]).toMatchObject({ expense: 0, income: 300000_00 });
  });

  it('расходы по дням для мини-графика', () => {
    expect(dailyExpenses(txs, ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'])).toEqual([
      0, 8000_00, 1000_00, 0,
    ]);
  });

  it('сумма за произвольный период', () => {
    expect(sumBetween(txs, 'expense', '2026-11-02', '2026-11-02')).toBe(8000_00);
    expect(sumBetween(txs, 'income', '2026-10-01', '2026-11-30')).toBe(550000_00);
  });
});

describe('nextColor', () => {
  it('выдаёт следующий цвет по кругу внутри вида', () => {
    expect(nextColor(cats, 'expense')).toBe(3);
    expect(nextColor(cats, 'income')).toBe(1);
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, name: `c${i}`, kind: 'expense' as const, color: i }));
    expect(nextColor(many, 'expense')).toBe(0);
  });
});
