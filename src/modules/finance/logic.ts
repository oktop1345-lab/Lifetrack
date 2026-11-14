// Логика финансов: суммы, категории, бюджет, цели. Без DOM и без базы.

import { addMonths, daysBetween, daysInMonth, monthBounds, monthKey } from '../../core/dates';
import type { Category, MoneyKind, SavingsGoal, Transaction } from '../../core/types';

export const SERIES_COLORS = 8;

export const DEFAULT_CATEGORIES: { name: string; kind: MoneyKind }[] = [
  { name: 'Еда', kind: 'expense' },
  { name: 'Транспорт', kind: 'expense' },
  { name: 'Жильё', kind: 'expense' },
  { name: 'Развлечения', kind: 'expense' },
  { name: 'Здоровье', kind: 'expense' },
  { name: 'Одежда', kind: 'expense' },
  { name: 'Связь и подписки', kind: 'expense' },
  { name: 'Другое', kind: 'expense' },
  { name: 'Зарплата', kind: 'income' },
  { name: 'Подработка', kind: 'income' },
  { name: 'Подарки', kind: 'income' },
  { name: 'Другое', kind: 'income' },
];

/** Номер цвета для новой категории: следующий по кругу среди категорий того же вида. */
export function nextColor(categories: Category[], kind: MoneyKind): number {
  return categories.filter((category) => category.kind === kind).length % SERIES_COLORS;
}

export interface MonthTotals {
  income: number;
  expense: number;
  balance: number;
}

export function monthTotals(transactions: Transaction[], month: string): MonthTotals {
  let income = 0;
  let expense = 0;
  for (const tx of transactions) {
    if (monthKey(tx.date) !== month) continue;
    if (tx.kind === 'income') income += tx.amount;
    else expense += tx.amount;
  }
  return { income, expense, balance: income - expense };
}

export interface CategorySlice {
  /** id категории или 'other' для свёрнутого остатка. */
  id: string;
  name: string;
  amount: number;
  /** Номер цвета 0..7 или null для «Другое». */
  color: number | null;
}

/**
 * Суммы по категориям за месяц, по убыванию. Показывается не больше maxSlices категорий,
 * остальные складываются в «Прочее». Две категории с одинаковым цветом рядом не показываются:
 * меньшая уходит в «Прочее», чтобы цвета на диаграмме не путались.
 */
export function categoryBreakdown(
  transactions: Transaction[],
  categories: Category[],
  month: string,
  kind: MoneyKind,
  maxSlices = 7,
): CategorySlice[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const sums = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.kind !== kind || monthKey(tx.date) !== month) continue;
    sums.set(tx.categoryId, (sums.get(tx.categoryId) ?? 0) + tx.amount);
  }
  const sorted = [...sums.entries()].sort((a, b) => b[1] - a[1]);

  const slices: CategorySlice[] = [];
  const usedColors = new Set<number>();
  let other = 0;
  for (const [id, amount] of sorted) {
    const category = byId.get(id);
    if (!category || slices.length >= maxSlices || usedColors.has(category.color)) {
      other += amount;
      continue;
    }
    usedColors.add(category.color);
    slices.push({ id, name: category.name, amount, color: category.color });
  }
  if (other > 0) slices.push({ id: 'other', name: 'Прочее', amount: other, color: null });
  return slices;
}

export interface MonthPoint extends MonthTotals {
  month: string;
}

/** Доходы и расходы по месяцам: count месяцев, заканчивая endMonth. */
export function monthlySeries(transactions: Transaction[], endMonth: string, count: number): MonthPoint[] {
  const out: MonthPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const month = addMonths(endMonth, -i);
    out.push({ month, ...monthTotals(transactions, month) });
  }
  return out;
}

export interface BudgetStatus {
  spent: number;
  /** Сколько осталось (отрицательное - перерасход). */
  left: number;
  /** Доля потраченного: 0.5 - половина, больше 1 - перерасход. */
  share: number;
  over: boolean;
  /** Сколько можно тратить в день до конца месяца. null - месяц не текущий или бюджет исчерпан. */
  perDay: number | null;
}

export function budgetStatus(budget: number, spent: number, month: string, today: string): BudgetStatus {
  const left = budget - spent;
  let perDay: number | null = null;
  if (monthKey(today) === month && left > 0) {
    const daysLeft = daysBetween(today, monthBounds(month).to) + 1;
    perDay = Math.floor(left / daysLeft);
  }
  return { spent, left, share: budget > 0 ? spent / budget : 0, over: left < 0, perDay };
}

export interface GoalStatus {
  share: number;
  left: number;
  done: boolean;
  /** Сколько откладывать в месяц, чтобы успеть к сроку. null - срока нет, он прошёл или цель достигнута. */
  perMonth: number | null;
}

export function goalStatus(goal: SavingsGoal, today: string): GoalStatus {
  const left = Math.max(0, goal.target - goal.saved);
  const done = left === 0;
  let perMonth: number | null = null;
  if (!done && goal.deadline && goal.deadline > today) {
    const months = Math.max(1, Math.ceil(daysBetween(today, goal.deadline) / 30.44));
    perMonth = Math.ceil(left / months);
  }
  return { share: goal.target > 0 ? goal.saved / goal.target : 0, left, done, perMonth };
}

export interface DayGroup {
  date: string;
  items: Transaction[];
  /** Сумма расходов за день. */
  expense: number;
  /** Сумма доходов за день. */
  income: number;
}

/** Операции месяца по дням, новые сверху. */
export function groupByDay(transactions: Transaction[], month: string): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const tx of transactions) {
    if (monthKey(tx.date) !== month) continue;
    let group = groups.get(tx.date);
    if (!group) {
      group = { date: tx.date, items: [], expense: 0, income: 0 };
      groups.set(tx.date, group);
    }
    group.items.push(tx);
    if (tx.kind === 'income') group.income += tx.amount;
    else group.expense += tx.amount;
  }
  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/** Расходы по дням за период - для мини-графика: по одному числу на день. */
export function dailyExpenses(transactions: Transaction[], days: string[]): number[] {
  const sums = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.kind === 'expense') sums.set(tx.date, (sums.get(tx.date) ?? 0) + tx.amount);
  }
  return days.map((day) => sums.get(day) ?? 0);
}

/** Сумма операций одного вида за период (включительно). */
export function sumBetween(transactions: Transaction[], kind: MoneyKind, from: string, to: string): number {
  let total = 0;
  for (const tx of transactions) {
    if (tx.kind === kind && tx.date >= from && tx.date <= to) total += tx.amount;
  }
  return total;
}

export { daysInMonth };
