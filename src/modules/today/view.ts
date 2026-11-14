import { addDays, dateRange, formatDayLong, monthBounds, monthKey, todayStr } from '../../core/dates';
import { db, newId } from '../../core/db';
import { countDays, formatDuration, formatHours, formatNumber, percent } from '../../core/format';
import { formatMoney } from '../../core/money';
import { isStandalone } from '../../core/pwa';
import {
  badge,
  card,
  h,
  icon,
  props,
  seg,
  sparkBars,
  type Child,
  type IconName,
  type ModuleId,
} from '../../core/ui';
import { dailyExpenses, sumBetween } from '../finance/logic';
import { openTransactionForm } from '../finance/view';
import { currentStreak, indexChecks, isScheduled, progress } from '../habits/logic';
import { limitStreak, minutesFor } from '../screen/logic';
import { openUrgeSheet } from '../screen/view';
import { dailyMinutes, totalMinutes } from '../study/logic';
import { openSessionForm } from '../study/view';
import { countBetween, weeklyVolume } from '../workouts/logic';
import { openWorkoutForm } from '../workouts/view';
import { loadAll, type AllData } from './data';
import { change, overview, periods } from './logic';

type Span = '7' | '30';

export async function render(root: HTMLElement): Promise<void> {
  let span: Span = '7';

  const draw = async (): Promise<void> => {
    const data = await loadAll();
    const today = todayStr();
    const scroll = root.scrollTop;
    root.replaceChildren();

    const day = formatDayLong(today);
    root.append(h('p', { class: 'muted', style: 'padding:0 2px' }, day.charAt(0).toUpperCase() + day.slice(1)));

    if (!isStandalone()) {
      root.append(
        h(
          'div',
          { class: 'note' },
          h('strong', null, 'Установка на iPhone. '),
          'Нажми «Поделиться» внизу Safari, затем «На экран „Домой“» - приложение будет открываться как обычное и работать без интернета.',
        ),
      );
    }

    root.append(habitsCard(data, today, draw), quickCard(today, draw), sectionsCard(data, today), overviewCard(data, today, span, (next) => {
      span = next;
      void draw();
    }));
    root.scrollTop = scroll;
  };

  await draw();
}

// ---------- Привычки на сегодня ----------

function habitsCard(data: AllData, today: string, redraw: () => Promise<void>): HTMLElement {
  const index = indexChecks(data.checks);
  const scheduled = data.habits.filter((habit) => isScheduled(habit, today));
  if (data.habits.length === 0) {
    return card(
      'Привычки на сегодня',
      h('p', { class: 'muted small' }, 'Привычек пока нет.'),
      h('a', { class: 'btn btn-sm', href: '#/habits', style: 'align-self:flex-start' }, icon('plus', 16), 'Добавить привычку'),
    );
  }
  const done = scheduled.filter((habit) => index.get(habit.id)?.has(today)).length;
  const rows = scheduled.map((habit) => {
    const checked = index.get(habit.id)?.has(today) ?? false;
    const streak = currentStreak(habit, index, today);
    const row = h(
      'button',
      { class: `habit-row${checked ? ' is-done' : ''}`, type: 'button', role: 'checkbox', 'aria-checked': String(checked) },
      h('span', { class: 'habit-check' }, checked ? icon('check', 16) : null),
      h('span', { class: 'grow habit-name' }, habit.name),
      streak > 0 ? h('span', { class: 'muted small' }, countDays(streak)) : null,
    );
    row.addEventListener('click', () => {
      const action = checked
        ? db.habitChecks.where('[habitId+date]').equals([habit.id, today]).delete()
        : db.habitChecks.put({ id: newId(), habitId: habit.id, date: today });
      void Promise.resolve(action).then(redraw);
    });
    return row;
  });
  return card(
    [h('span', { class: 'grow' }, 'Привычки на сегодня'), h('span', { class: 'muted small', style: 'font-weight:400' }, `${done} из ${scheduled.length}`)],
    rows.length ? h('div', { class: 'list' }, rows) : h('p', { class: 'muted small' }, 'На сегодня ничего не запланировано.'),
  );
}

// ---------- Быстрые действия ----------

function quickCard(today: string, redraw: () => Promise<void>): HTMLElement {
  const button = (module: ModuleId, name: IconName, label: string, run: () => void): HTMLElement => {
    const node = h('button', { class: 'btn', type: 'button' }, badge(module, name, 16), label);
    node.addEventListener('click', run);
    return node;
  };
  return h(
    'div',
    { class: 'quick' },
    button('finance', 'finance', 'Расход', () => void openTransactionForm({ kind: 'expense', date: today }, redraw)),
    button('workouts', 'workouts', 'Тренировка', () => void openWorkoutForm(null, redraw)),
    button('study', 'study', 'Учёба', () => void openSessionForm({ date: today }, redraw)),
    button('screen', 'wave', 'Тянет скроллить', () => void openUrgeSheet(redraw)),
  );
}

// ---------- Мини-графики по разделам ----------

function sectionsCard(data: AllData, today: string): HTMLElement {
  const week = dateRange(addDays(today, -6), today);
  const index = indexChecks(data.checks);
  const money = (minor: number): string => formatMoney(minor, data.currency);

  const row = (module: ModuleId, name: IconName, title: string, value: string, caption: string, spark: HTMLElement): HTMLElement =>
    h(
      'a',
      { class: 'list-row', href: `#/${module}` },
      badge(module, name),
      h(
        'span',
        { class: 'grow' },
        h('div', { class: 'row-title' }, title),
        h('div', { class: 'small' }, h('strong', null, value), h('span', { class: 'muted' }, ` ${caption}`)),
      ),
      h('span', { style: 'flex:0 0 84px' }, spark),
    );

  // Привычки: доля выполненного по дням недели
  const habitWeek = progress(data.habits, index, week[0] ?? today, today);
  const habitDays = week.map((date) => {
    const p = progress(data.habits, index, date, date);
    return p.scheduled > 0 ? (p.done / p.scheduled) * 100 : null;
  });

  // Финансы: расходы по дням
  const expenses = dailyExpenses(data.transactions, week);
  const month = monthBounds(monthKey(today));
  const monthSpent = sumBetween(data.transactions, 'expense', month.from, month.to);

  // Тренировки: объём по неделям
  const volumes = weeklyVolume(data.workouts, today, 7, data.bodyWeight);

  // Учёба: минуты по дням
  const study = dailyMinutes(data.sessions, week);

  // Экранное время: минуты по дням
  const screen = minutesFor(data.screenDays, week);
  const screenToday = screen[screen.length - 1];
  const screenStreak = data.screenLimit ? limitStreak(data.screenDays, data.screenLimit, today) : 0;

  return card(
    'По разделам за 7 дней',
    h(
      'div',
      { class: 'list' },
      row('habits', 'habits', 'Привычки', percent(habitWeek.done, habitWeek.scheduled), 'выполнено', sparkBars(habitDays, 'habits', 100)),
      row(
        'finance',
        'finance',
        'Финансы',
        money(expenses[expenses.length - 1] ?? 0),
        data.budget ? `сегодня · ${percent(monthSpent, data.budget)} бюджета` : `сегодня · ${money(monthSpent)} за месяц`,
        sparkBars(expenses, 'finance'),
      ),
      row(
        'workouts',
        'workouts',
        'Тренировки',
        String(countBetween(data.workouts, week[0] ?? today, today)),
        `за неделю · ${formatNumber(volumes[volumes.length - 1]?.volume ?? 0)} кг`,
        sparkBars(volumes.map((item) => item.count), 'workouts'),
      ),
      row('study', 'study', 'Учёба', formatHours(totalMinutes(data.sessions, week[0] ?? today, today)), `за неделю · сегодня ${formatHours(study[study.length - 1] ?? 0)}`, sparkBars(study, 'study')),
      row(
        'screen',
        'screen',
        'Экранное время',
        screenToday === null || screenToday === undefined ? 'нет записи' : formatHours(screenToday),
        screenStreak > 0 ? `сегодня · ниже лимита ${countDays(screenStreak)}` : 'сегодня',
        sparkBars(screen, 'screen'),
      ),
    ),
    h('p', { class: 'muted tiny' }, 'Столбики - последние 7 дней (у тренировок - 7 недель).'),
  );
}

// ---------- Обзор недели и месяца ----------

function overviewCard(data: AllData, today: string, span: Span, onSpan: (span: Span) => void): HTMLElement {
  const range = periods(today, Number(span));
  const now = overview(data, ...range.current);
  const before = overview(data, ...range.previous);
  const money = (minor: number): string => formatMoney(minor, data.currency);

  const value = (text: string, delta: string): Child => [text, delta ? h('span', { class: 'muted small' }, ` ${delta}`) : null];
  const habitRate = (o: typeof now): number | null => (o.habitsScheduled > 0 ? (o.habitsDone / o.habitsScheduled) * 100 : null);

  return card(
    'Обзор',
    seg<Span>(
      [
        { value: '7', label: 'Неделя' },
        { value: '30', label: 'Месяц' },
      ],
      span,
      onSpan,
    ),
    props([
      { label: 'Привычки', value: value(percent(now.habitsDone, now.habitsScheduled), change(habitRate(now), habitRate(before))) },
      { label: 'Тренировки', value: value(String(now.workouts), change(now.workouts, before.workouts)) },
      { label: 'Объём тренировок', value: value(`${formatNumber(now.volume)} кг`, change(now.volume, before.volume)) },
      { label: 'Учёба', value: value(formatDuration(now.studyMinutes), change(now.studyMinutes, before.studyMinutes)) },
      { label: 'Расходы', value: value(money(now.expense), change(now.expense, before.expense)) },
      { label: 'Доходы', value: value(money(now.income), change(now.income, before.income)) },
      {
        label: 'Экран в день',
        value: value(now.screenAverage === null ? 'нет записей' : formatDuration(now.screenAverage), change(now.screenAverage, before.screenAverage)),
      },
      { label: 'Тянуло скроллить', value: value(String(now.urges), change(now.urges, before.urges)) },
    ]),
    h('p', { class: 'muted tiny' }, `Проценты рядом - изменение к предыдущим ${span === '7' ? '7 дням' : '30 дням'}.`),
  );
}
