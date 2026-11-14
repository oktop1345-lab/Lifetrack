import type { Chart } from 'chart.js';
import { barChart, chartBox, dataTable, donutBlock, mountChart, seriesColor } from '../../core/charts';
import { addMonths, formatDay, formatMonth, formatMonthShort, monthKey, todayStr } from '../../core/dates';
import { db, newId } from '../../core/db';
import { percent } from '../../core/format';
import { formatMoney, formatMoneyShort, moneyToInput, parseMoney } from '../../core/money';
import type { Cleanup } from '../../core/router';
import { getSetting, setSetting } from '../../core/settings';
import type { Category, MoneyKind, SavingsGoal, Transaction } from '../../core/types';
import {
  card,
  confirmSheet,
  field,
  h,
  icon,
  legend,
  meter,
  openSheet,
  periodNav,
  promptSheet,
  seg,
  tag,
  props,
  toast,
} from '../../core/ui';
import {
  budgetStatus,
  categoryBreakdown,
  DEFAULT_CATEGORIES,
  goalStatus,
  groupByDay,
  monthlySeries,
  monthTotals,
  nextColor,
} from './logic';

const MONTHS_ON_CHART = 6;
const NEW_CATEGORY = '__new__';

/** Создаёт стандартные категории при первом использовании. */
export async function ensureCategories(): Promise<Category[]> {
  const existing = await db.categories.toArray();
  if (existing.length > 0) return existing;
  const created: Category[] = [];
  for (const item of DEFAULT_CATEGORIES) {
    created.push({ id: newId(), name: item.name, kind: item.kind, color: nextColor(created, item.kind) });
  }
  await db.categories.bulkPut(created);
  return created;
}

export async function render(root: HTMLElement): Promise<Cleanup> {
  let month = monthKey(todayStr());
  let charts: Chart[] = [];

  const draw = async (): Promise<void> => {
    const [categories, transactions, goals, currency, budget] = await Promise.all([
      ensureCategories(),
      db.transactions.toArray(),
      db.savingsGoals.toArray(),
      getSetting('currency'),
      getSetting('monthlyBudget'),
    ]);
    const today = todayStr();
    const money = (minor: number): string => formatMoney(minor, currency);
    const totals = monthTotals(transactions, month);

    const scroll = root.scrollTop;
    charts.forEach((chart) => chart.destroy());
    charts = [];
    root.replaceChildren();

    const addExpense = h('button', { class: 'btn btn-primary', type: 'button' }, icon('plus', 18), 'Расход');
    const addIncome = h('button', { class: 'btn', type: 'button' }, icon('plus', 18), 'Доход');
    const defaultDate = month === monthKey(today) ? today : `${month}-01`;
    addExpense.addEventListener('click', () => void openTransactionForm({ kind: 'expense', date: defaultDate }, draw));
    addIncome.addEventListener('click', () => void openTransactionForm({ kind: 'income', date: defaultDate }, draw));

    root.append(
      card(
        null,
        periodNav(formatMonth(month), () => {
          month = addMonths(month, -1);
          void draw();
        }, month >= monthKey(today) ? null : () => {
          month = addMonths(month, 1);
          void draw();
        }),
        props([
          { label: 'Доходы', value: money(totals.income) },
          { label: 'Расходы', value: money(totals.expense) },
          { label: 'Остаток', value: money(totals.balance), strong: true },
        ]),
        h('div', { class: 'btn-row' }, addExpense, addIncome),
      ),
      budgetCard(budget, totals.expense, month, today, money, draw),
      categoriesCard(transactions, categories, month, totals.expense, money, charts),
      transactionsCard(transactions, categories, month, money, draw),
      monthsCard(transactions, monthKey(today), money, charts),
      goalsCard(goals, today, money, draw),
    );

    const manage = h('button', { class: 'btn btn-quiet', type: 'button' }, 'Настроить категории');
    manage.addEventListener('click', () => openCategoryManager(draw));
    root.append(manage);
    root.scrollTop = scroll;
  };

  await draw();
  return () => charts.forEach((chart) => chart.destroy());
}

// ---------- Бюджет ----------

function budgetCard(
  budget: number | null,
  spent: number,
  month: string,
  today: string,
  money: (minor: number) => string,
  redraw: () => Promise<void>,
): HTMLElement {
  const edit = h('button', { class: 'btn btn-sm', type: 'button' }, budget ? 'Изменить' : 'Задать');
  edit.addEventListener('click', () => openBudgetForm(budget, redraw));
  const title = [h('span', { class: 'grow' }, 'Бюджет на месяц'), edit];

  if (!budget) {
    return card(title, h('p', { class: 'muted small' }, 'Задай сумму, которую готов потратить за месяц, - приложение покажет, сколько осталось и сколько можно тратить в день.'));
  }
  const status = budgetStatus(budget, spent, month, today);
  return card(
    title,
    meter(status.share, 'finance'),
    h(
      'p',
      { class: 'small' },
      `Потрачено ${money(spent)} из ${money(budget)} (${percent(spent, budget)}). `,
      status.over
        ? h('strong', { style: 'color:var(--danger)' }, `Перерасход ${money(-status.left)}.`)
        : `Осталось ${money(status.left)}.`,
      status.perDay !== null ? ` Это около ${money(Math.floor(status.perDay / 100) * 100)} в день до конца месяца.` : '',
    ),
  );
}

function openBudgetForm(budget: number | null, onSaved: () => Promise<void>): void {
  const input = amountInput(budget);
  const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Сохранить');
  const clear = budget ? h('button', { class: 'btn btn-danger', type: 'button' }, 'Убрать бюджет') : null;
  const sheet = openSheet('Бюджет на месяц', [field('Сумма на месяц', input), save, clear]);
  input.focus();
  save.addEventListener('click', () => {
    const amount = parseMoney(input.value);
    if (amount === null) {
      toast('Введи сумму больше нуля', 'error');
      return;
    }
    void setSetting('monthlyBudget', amount).then(() => {
      sheet.close();
      return onSaved();
    });
  });
  clear?.addEventListener('click', () => {
    void setSetting('monthlyBudget', null).then(() => {
      sheet.close();
      return onSaved();
    });
  });
}

// ---------- Расходы по категориям ----------

function categoriesCard(
  transactions: Transaction[],
  categories: Category[],
  month: string,
  total: number,
  money: (minor: number) => string,
  charts: Chart[],
): HTMLElement {
  const slices = categoryBreakdown(transactions, categories, month, 'expense');
  if (slices.length === 0) {
    return card('Расходы по категориям', h('p', { class: 'muted small' }, 'В этом месяце расходов пока нет.'));
  }
  const colors = slices.map((slice) => seriesColor(slice.color));
  return card(
    'Расходы по категориям',
    donutBlock(
      charts,
      `Расходы по категориям за ${formatMonth(month)}`,
      { value: money(total), caption: 'всего' },
      {
        labels: slices.map((slice) => slice.name),
        values: slices.map((slice) => slice.amount / 100),
        colors,
        tooltipValue: (i) => `${money(slices[i]?.amount ?? 0)} (${percent(slices[i]?.amount ?? 0, total)})`,
      },
    ),
    legend(
      slices.map((slice, i) => ({
        color: colors[i] ?? '',
        label: slice.name,
        value: `${money(slice.amount)} · ${percent(slice.amount, total)}`,
      })),
    ),
  );
}

// ---------- Операции ----------

function transactionsCard(
  transactions: Transaction[],
  categories: Category[],
  month: string,
  money: (minor: number) => string,
  redraw: () => Promise<void>,
): HTMLElement {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const groups = groupByDay(transactions, month);
  if (groups.length === 0) {
    return card('Операции', h('p', { class: 'muted small' }, 'Пока пусто. Добавь первый расход или доход кнопками выше.'));
  }
  const list = h('div', { class: 'list' });
  for (const group of groups) {
    list.append(
      h(
        'div',
        { class: 'list-head' },
        h('span', null, formatDay(group.date)),
        h('span', null, group.expense > 0 ? `−${money(group.expense)}` : `+${money(group.income)}`),
      ),
    );
    for (const tx of group.items) {
      const category = byId.get(tx.categoryId);
      const row = h(
        'button',
        { class: 'list-row', type: 'button' },
        h(
          'span',
          { class: 'grow' },
          h('div', { class: 'row-title' }, tx.note || category?.name || 'Без категории'),
          tx.note ? h('div', null, tag(category?.name ?? 'Без категории', tx.kind === 'income' ? 'habits' : 'finance')) : null,
        ),
        h(
          'span',
          { class: `row-side${tx.kind === 'income' ? ' amount-plus' : ''}` },
          `${tx.kind === 'income' ? '+' : '−'}${money(tx.amount)}`,
        ),
      );
      row.addEventListener('click', () => void openTransactionForm(tx, redraw));
      list.append(row);
    }
  }
  return card('Операции', list);
}

function amountInput(minor: number | null | undefined): HTMLInputElement {
  return h('input', {
    class: 'input',
    type: 'text',
    inputMode: 'decimal',
    placeholder: '0',
    value: minor ? moneyToInput(minor) : '',
    autocomplete: 'off',
  });
}

/** Форма операции. Принимает существующую операцию или заготовку новой (вид и дата). */
export async function openTransactionForm(
  source: Transaction | { kind: MoneyKind; date: string },
  onSaved: () => Promise<void> | void,
): Promise<void> {
  const existing = 'id' in source ? source : null;
  let kind: MoneyKind = source.kind;
  let categories = await ensureCategories();

  const amount = amountInput(existing?.amount);
  const categorySelect = h('select', { class: 'select' });
  const date = h('input', { class: 'input', type: 'date', value: source.date });
  const note = h('input', { class: 'input', type: 'text', value: existing?.note ?? '', placeholder: 'Например, обед', maxLength: 80 });
  const save = h('button', { class: 'btn btn-primary', type: 'button' }, existing ? 'Сохранить' : 'Добавить');
  const remove = existing ? h('button', { class: 'btn btn-danger', type: 'button' }, 'Удалить') : null;

  const fillCategories = (selected?: string): void => {
    const options = categories.filter((category) => category.kind === kind);
    categorySelect.replaceChildren(
      ...(options.length === 0 ? [h('option', { value: '' }, 'Выбери категорию')] : []),
      ...options.map((category) => h('option', { value: category.id, selected: category.id === selected }, category.name)),
      h('option', { value: NEW_CATEGORY }, '+ Новая категория...'),
    );
    if (!options.some((category) => category.id === selected) && options[0]) categorySelect.value = options[0].id;
  };
  fillCategories(existing?.categoryId);

  categorySelect.addEventListener('change', () => {
    if (categorySelect.value !== NEW_CATEGORY) return;
    void promptSheet({ title: 'Новая категория', label: 'Название', confirmLabel: 'Добавить' }).then(async (name) => {
      if (name) {
        const category: Category = { id: newId(), name, kind, color: nextColor(categories, kind) };
        await db.categories.put(category);
        categories = [...categories, category];
        fillCategories(category.id);
      } else fillCategories();
    });
  });

  const kindSwitch = seg<MoneyKind>(
    [
      { value: 'expense', label: 'Расход' },
      { value: 'income', label: 'Доход' },
    ],
    kind,
    (value) => {
      kind = value;
      fillCategories();
    },
  );

  const sheet = openSheet(existing ? 'Операция' : 'Новая операция', [
    kindSwitch,
    field('Сумма', amount),
    field('Категория', categorySelect),
    h('div', { class: 'field-row' }, field('Дата', date), field('Заметка', note)),
    save,
    remove,
  ]);
  if (!existing) amount.focus();

  save.addEventListener('click', () => {
    const value = parseMoney(amount.value);
    if (value === null) {
      toast('Введи сумму больше нуля', 'error');
      return;
    }
    if (!date.value || !categorySelect.value || categorySelect.value === NEW_CATEGORY) {
      toast('Выбери дату и категорию', 'error');
      return;
    }
    const record: Transaction = {
      id: existing?.id ?? newId(),
      kind,
      amount: value,
      categoryId: categorySelect.value,
      date: date.value,
      ...(note.value.trim() ? { note: note.value.trim() } : {}),
    };
    void db.transactions.put(record).then(() => {
      sheet.close();
      toast(existing ? 'Сохранено' : kind === 'expense' ? 'Расход добавлен' : 'Доход добавлен');
      return onSaved();
    });
  });

  remove?.addEventListener('click', () => {
    if (!existing) return;
    void db.transactions.delete(existing.id).then(() => {
      sheet.close();
      toast('Операция удалена');
      return onSaved();
    });
  });
}

// ---------- Доходы и расходы по месяцам ----------

function monthsCard(
  transactions: Transaction[],
  endMonth: string,
  money: (minor: number) => string,
  charts: Chart[],
): HTMLElement {
  const series = monthlySeries(transactions, endMonth, MONTHS_ON_CHART);
  const incomeColor = seriesColor(2);
  const expenseColor = seriesColor(1);
  const { box, canvas } = chartBox(200, 'Доходы и расходы по месяцам');
  mountChart(canvas, charts, () =>
    barChart(canvas, {
      labels: series.map((point) => formatMonthShort(point.month)),
      series: [
        { label: 'Доходы', values: series.map((point) => point.income / 100), color: incomeColor },
        { label: 'Расходы', values: series.map((point) => point.expense / 100), color: expenseColor },
      ],
      formatTick: (value) => formatMoneyShort(value * 100),
      tooltipTitle: (i) => formatMonth(series[i]?.month ?? endMonth),
      tooltipValue: (s, i) => money((s === 0 ? series[i]?.income : series[i]?.expense) ?? 0),
    }),
  );
  return card(
    'Доходы и расходы по месяцам',
    h(
      'div',
      { class: 'legend-inline' },
      h('span', null, h('i', { class: 'swatch', style: `background:${incomeColor}` }), 'Доходы'),
      h('span', null, h('i', { class: 'swatch', style: `background:${expenseColor}` }), 'Расходы'),
    ),
    box,
    dataTable(
      ['Месяц', 'Доходы', 'Расходы'],
      series.map((point) => [formatMonth(point.month), money(point.income), money(point.expense)]),
    ),
  );
}

// ---------- Цели накоплений ----------

function goalsCard(
  goals: SavingsGoal[],
  today: string,
  money: (minor: number) => string,
  redraw: () => Promise<void>,
): HTMLElement {
  const add = h('button', { class: 'btn btn-sm', type: 'button' }, icon('plus', 16), 'Цель');
  add.addEventListener('click', () => openGoalForm(null, redraw));
  const title = [h('span', { class: 'grow' }, 'Цели накоплений'), add];
  if (goals.length === 0) {
    return card(title, h('p', { class: 'muted small' }, 'Например, «Ноутбук» или «Подушка безопасности». Приложение покажет прогресс и сколько откладывать в месяц.'));
  }
  goals.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const rows = goals.map((goal) => {
    const status = goalStatus(goal, today);
    const row = h(
      'button',
      { class: 'list-row', type: 'button', style: 'flex-direction:column;align-items:stretch;gap:6px' },
      h(
        'div',
        { class: 'row' },
        h('span', { class: 'grow row-title' }, goal.name),
        h('span', { class: 'row-side' }, percent(goal.saved, goal.target)),
      ),
      meter(status.share, 'finance'),
      h(
        'div',
        { class: 'muted small' },
        `${money(goal.saved)} из ${money(goal.target)}`,
        status.done
          ? ' · цель достигнута'
          : status.perMonth !== null
            ? ` · по ${money(status.perMonth)} в месяц до ${formatDay(goal.deadline ?? today)}`
            : ` · осталось ${money(status.left)}`,
      ),
    );
    row.addEventListener('click', () => openGoalForm(goal, redraw));
    return row;
  });
  return card(title, h('div', { class: 'list' }, rows));
}

function openGoalForm(goal: SavingsGoal | null, onSaved: () => Promise<void>): void {
  const name = h('input', { class: 'input', type: 'text', value: goal?.name ?? '', placeholder: 'Например, ноутбук', maxLength: 60 });
  const target = amountInput(goal?.target);
  const saved = amountInput(goal?.saved);
  const deadline = h('input', { class: 'input', type: 'date', value: goal?.deadline ?? '' });
  const save = h('button', { class: 'btn btn-primary', type: 'button' }, goal ? 'Сохранить' : 'Добавить');

  const topUp = amountInput(null);
  const topUpBtn = h('button', { class: 'btn', type: 'button' }, 'Пополнить');
  const remove = goal ? h('button', { class: 'btn btn-danger', type: 'button' }, 'Удалить цель') : null;

  const sheet = openSheet(goal ? 'Цель' : 'Новая цель', [
    goal
      ? h('div', { class: 'note stack' }, h('span', { class: 'field-label' }, 'Отложил ещё'), h('div', { class: 'row' }, h('div', { class: 'grow' }, topUp), topUpBtn))
      : null,
    field('Название', name),
    h('div', { class: 'field-row' }, field('Нужно накопить', target), field('Уже накоплено', saved)),
    field('Срок (необязательно)', deadline),
    save,
    remove,
  ]);
  if (!goal) name.focus();

  topUpBtn.addEventListener('click', () => {
    if (!goal) return;
    const amount = parseMoney(topUp.value);
    if (amount === null) {
      toast('Введи сумму больше нуля', 'error');
      return;
    }
    void db.savingsGoals.put({ ...goal, saved: goal.saved + amount }).then(() => {
      sheet.close();
      toast('Цель пополнена');
      return onSaved();
    });
  });

  save.addEventListener('click', () => {
    const targetValue = parseMoney(target.value);
    if (!name.value.trim() || targetValue === null) {
      toast('Укажи название и сумму цели', 'error');
      return;
    }
    const record: SavingsGoal = {
      id: goal?.id ?? newId(),
      name: name.value.trim(),
      target: targetValue,
      saved: parseMoney(saved.value) ?? 0,
      createdAt: goal?.createdAt ?? new Date().toISOString(),
      ...(deadline.value ? { deadline: deadline.value } : {}),
    };
    void db.savingsGoals.put(record).then(() => {
      sheet.close();
      toast(goal ? 'Сохранено' : 'Цель добавлена');
      return onSaved();
    });
  });

  remove?.addEventListener('click', () => {
    if (!goal) return;
    void confirmSheet({ title: 'Удалить цель?', text: `«${goal.name}» будет удалена.`, confirmLabel: 'Удалить', danger: true }).then(async (ok) => {
      if (!ok) return;
      await db.savingsGoals.delete(goal.id);
      sheet.close();
      await onSaved();
    });
  });
}

// ---------- Категории ----------

function openCategoryManager(onChanged: () => Promise<void>): void {
  let kind: MoneyKind = 'expense';
  const list = h('div', { class: 'list' });
  const add = h('button', { class: 'btn', type: 'button' }, icon('plus', 18), 'Новая категория');

  const draw = async (): Promise<void> => {
    const [categories, transactions] = await Promise.all([db.categories.toArray(), db.transactions.toArray()]);
    const used = new Set(transactions.map((tx) => tx.categoryId));
    list.replaceChildren(
      ...categories
        .filter((category) => category.kind === kind)
        .map((category) => {
          const rename = h(
            'button',
            { class: 'list-row grow', type: 'button' },
            h('span', { class: 'swatch', style: `background:${seriesColor(category.color)}` }),
            h('span', { class: 'grow row-title' }, category.name),
          );
          rename.addEventListener('click', () => {
            void promptSheet({ title: 'Категория', label: 'Название', value: category.name }).then(async (name) => {
              if (!name) return;
              await db.categories.put({ ...category, name });
              await draw();
              await onChanged();
            });
          });
          const del = h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Удалить категорию ${category.name}` }, icon('trash', 20));
          del.addEventListener('click', () => {
            if (used.has(category.id)) {
              toast('В этой категории есть операции. Сначала измени у них категорию.', 'error');
              return;
            }
            void db.categories.delete(category.id).then(async () => {
              await draw();
              await onChanged();
            });
          });
          return h('div', { class: 'row' }, rename, del);
        }),
    );
  };

  add.addEventListener('click', () => {
    void promptSheet({ title: 'Новая категория', label: 'Название', confirmLabel: 'Добавить' }).then(async (name) => {
      if (!name) return;
      const categories = await db.categories.toArray();
      await db.categories.put({ id: newId(), name, kind, color: nextColor(categories, kind) });
      await draw();
      await onChanged();
    });
  });

  openSheet('Категории', [
    seg<MoneyKind>(
      [
        { value: 'expense', label: 'Расходы' },
        { value: 'income', label: 'Доходы' },
      ],
      kind,
      (value) => {
        kind = value;
        void draw();
      },
    ),
    list,
    add,
  ]);
  void draw();
}
