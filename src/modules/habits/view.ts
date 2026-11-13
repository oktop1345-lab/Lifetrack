import type { Chart } from 'chart.js';
import { barChart, chartBox, cssVar, dataTable } from '../../core/charts';
import { addDays, formatDay, formatDayLong, todayStr } from '../../core/dates';
import { db, newId } from '../../core/db';
import { countDays, percent } from '../../core/format';
import { heatmapStart, renderHeatmap } from '../../core/heatmap';
import type { Cleanup } from '../../core/router';
import type { Habit, HabitSchedule } from '../../core/types';
import { card, confirmSheet, field, h, icon, openSheet, toast } from '../../core/ui';
import {
  bestStreak,
  currentStreak,
  heatmapDays,
  indexChecks,
  isScheduled,
  progress,
  scheduleText,
  weekdayShort,
  weeklyStats,
  type CheckIndex,
} from './logic';

const WEEKS_ON_CHART = 12;

export async function render(root: HTMLElement): Promise<Cleanup> {
  let day = todayStr();
  let filter = 'all';
  let charts: Chart[] = [];

  const draw = async (): Promise<void> => {
    const [habits, checks] = await Promise.all([db.habits.toArray(), db.habitChecks.toArray()]);
    habits.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const index = indexChecks(checks);
    const today = todayStr();
    if (day > today) day = today;
    if (filter !== 'all' && !habits.some((habit) => habit.id === filter)) filter = 'all';

    const scroll = root.scrollTop;
    charts.forEach((chart) => chart.destroy());
    charts = [];
    root.replaceChildren();

    const addBtn = h('button', { class: 'btn btn-primary', type: 'button' }, icon('plus', 20), 'Добавить привычку');
    addBtn.addEventListener('click', () => openHabitForm(null, draw));

    if (habits.length === 0) {
      root.append(
        h(
          'div',
          { class: 'empty' },
          h('div', { class: 'badge', style: 'background:var(--c-habits)' }, icon('habits', 32)),
          h('h2', null, 'Пока нет привычек'),
          h('p', null, 'Добавь первую - например, «Зарядка» или «Читать 20 минут». Отмечай выполнение каждый день и следи за серией.'),
          addBtn,
        ),
      );
      return;
    }

    root.append(
      dayCard(habits, index, day, today, (next) => {
        day = next;
        void draw();
      }, draw),
      tiles(habits, index, today),
      habitList(habits, index, today, draw),
      addBtn,
      h('h2', { class: 'section-title' }, 'Статистика'),
    );

    if (habits.length > 1) {
      const select = h(
        'select',
        { class: 'select', 'aria-label': 'Какую привычку показывать на диаграммах' },
        h('option', { value: 'all', selected: filter === 'all' }, 'Все привычки'),
        habits.map((habit) => h('option', { value: habit.id, selected: habit.id === filter }, habit.name)),
      );
      select.addEventListener('change', () => {
        filter = select.value;
        void draw();
      });
      root.append(select);
    }

    const shown = filter === 'all' ? habits : habits.filter((habit) => habit.id === filter);
    root.append(yearCard(shown, index, today), weeksCard(shown, index, today, charts));
    root.scrollTop = scroll;
  };

  await draw();
  return () => charts.forEach((chart) => chart.destroy());
}

// ---------- Отметки за день ----------

function dayLabel(day: string, today: string): string {
  if (day === today) return `Сегодня, ${formatDay(day)}`;
  if (day === addDays(today, -1)) return `Вчера, ${formatDay(day)}`;
  const text = formatDayLong(day);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function dayCard(
  habits: Habit[],
  index: CheckIndex,
  day: string,
  today: string,
  onDay: (day: string) => void,
  redraw: () => Promise<void>,
): HTMLElement {
  const prev = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Предыдущий день' }, icon('back'));
  const next = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Следующий день', disabled: day >= today }, icon('chevron'));
  prev.addEventListener('click', () => onDay(addDays(day, -1)));
  next.addEventListener('click', () => onDay(addDays(day, 1)));

  const scheduled = habits.filter((habit) => isScheduled(habit, day));
  const rows = scheduled.map((habit) => {
    const checked = index.get(habit.id)?.has(day) ?? false;
    const streak = currentStreak(habit, index, today);
    const toggle = h(
      'button',
      {
        class: `habit-row${checked ? ' is-done' : ''}`,
        type: 'button',
        role: 'checkbox',
        'aria-checked': String(checked),
      },
      h('span', { class: 'habit-check' }, checked ? icon('check', 22) : null),
      h(
        'span',
        { class: 'grow' },
        h('span', { class: 'habit-name' }, habit.name),
        h('span', { class: 'muted small' }, streak > 0 ? `Серия: ${countDays(streak)}` : 'Серия пока не началась'),
      ),
    );
    toggle.addEventListener('click', () => {
      void toggleCheck(habit.id, day, checked).then(redraw);
    });
    return toggle;
  });

  return card(
    null,
    h('div', { class: 'day-nav' }, prev, h('strong', { class: 'grow' }, dayLabel(day, today)), next),
    rows.length
      ? h('div', { class: 'list' }, rows)
      : h('p', { class: 'muted' }, 'На этот день ничего не запланировано.'),
  );
}

async function toggleCheck(habitId: string, date: string, checked: boolean): Promise<void> {
  if (checked) await db.habitChecks.where('[habitId+date]').equals([habitId, date]).delete();
  else await db.habitChecks.put({ id: newId(), habitId, date });
}

// ---------- Короткая сводка ----------

function tiles(habits: Habit[], index: CheckIndex, today: string): HTMLElement {
  const now = progress(habits, index, today, today);
  const week = progress(habits, index, addDays(today, -6), today);
  const month = progress(habits, index, addDays(today, -29), today);
  const tile = (label: string, value: string): HTMLElement =>
    h('div', { class: 'tile' }, h('span', { class: 'tile-value' }, value), h('span', { class: 'tile-label' }, label));
  return h(
    'div',
    { class: 'tiles' },
    tile('сегодня', `${now.done} из ${now.scheduled}`),
    tile('за 7 дней', percent(week.done, week.scheduled)),
    tile('за 30 дней', percent(month.done, month.scheduled)),
  );
}

// ---------- Список привычек ----------

function habitList(habits: Habit[], index: CheckIndex, today: string, redraw: () => Promise<void>): HTMLElement {
  const rows = habits.map((habit) => {
    const month = progress([habit], index, addDays(today, -29), today);
    const row = h(
      'button',
      { class: 'list-row', type: 'button' },
      h(
        'span',
        { class: 'grow' },
        h('div', { class: 'habit-name' }, habit.name),
        h(
          'div',
          { class: 'muted small' },
          `${scheduleText(habit)} · серия ${currentStreak(habit, index, today)}, рекорд ${bestStreak(habit, index, today)} · ` +
            `${percent(month.done, month.scheduled)} за 30 дней`,
        ),
      ),
      h('span', { class: 'chev' }, icon('chevron', 20)),
    );
    row.addEventListener('click', () => openHabitForm(habit, redraw));
    return row;
  });
  return card('Мои привычки', h('div', { class: 'list' }, rows));
}

// ---------- Форма привычки ----------

function openHabitForm(habit: Habit | null, onSaved: () => Promise<void>): void {
  let type: HabitSchedule['type'] = habit?.schedule.type ?? 'daily';
  const days = new Set<number>(habit?.schedule.type === 'weekdays' ? habit.schedule.days : [1, 2, 3, 4, 5]);

  const name = h('input', {
    class: 'input',
    type: 'text',
    value: habit?.name ?? '',
    placeholder: 'Например, зарядка',
    maxLength: 60,
    enterKeyHint: 'done',
  });

  const dailyBtn = h('button', { type: 'button' }, 'Каждый день');
  const weekBtn = h('button', { type: 'button' }, 'По дням недели');
  const dayChips = [1, 2, 3, 4, 5, 6, 7].map((day) => {
    const chip = h('button', { class: 'day-chip', type: 'button' }, weekdayShort(day));
    chip.addEventListener('click', () => {
      if (days.has(day)) days.delete(day);
      else days.add(day);
      sync();
    });
    return chip;
  });
  const chipRow = h('div', { class: 'day-chips' }, dayChips);
  const save = h('button', { class: 'btn btn-primary', type: 'button' }, habit ? 'Сохранить' : 'Добавить');

  const sync = (): void => {
    dailyBtn.classList.toggle('is-active', type === 'daily');
    weekBtn.classList.toggle('is-active', type === 'weekdays');
    chipRow.hidden = type !== 'weekdays';
    dayChips.forEach((chip, i) => {
      const on = days.has(i + 1);
      chip.classList.toggle('is-active', on);
      chip.setAttribute('aria-pressed', String(on));
    });
    save.disabled = name.value.trim() === '' || (type === 'weekdays' && days.size === 0);
  };
  dailyBtn.addEventListener('click', () => {
    type = 'daily';
    sync();
  });
  weekBtn.addEventListener('click', () => {
    type = 'weekdays';
    sync();
  });
  name.addEventListener('input', sync);

  const content: (HTMLElement | null)[] = [
    field('Название', name),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Когда выполнять'), h('div', { class: 'seg' }, dailyBtn, weekBtn), chipRow),
    save,
  ];

  let remove: HTMLElement | null = null;
  if (habit) {
    remove = h('button', { class: 'btn btn-danger', type: 'button' }, 'Удалить привычку');
    content.push(remove);
  }

  const sheet = openSheet(habit ? 'Привычка' : 'Новая привычка', content);
  sync();
  if (!habit) name.focus();

  save.addEventListener('click', () => {
    const schedule: HabitSchedule =
      type === 'daily' ? { type: 'daily' } : { type: 'weekdays', days: [...days].sort((a, b) => a - b) };
    const record: Habit = habit
      ? { ...habit, name: name.value.trim(), schedule }
      : { id: newId(), name: name.value.trim(), schedule, createdAt: new Date().toISOString() };
    void db.habits.put(record).then(() => {
      sheet.close();
      toast(habit ? 'Сохранено' : 'Привычка добавлена');
      return onSaved();
    });
  });

  remove?.addEventListener('click', () => {
    if (!habit) return;
    void confirmSheet({
      title: 'Удалить привычку?',
      text: `«${habit.name}» и вся история её отметок будут удалены. Это нельзя отменить.`,
      confirmLabel: 'Удалить',
      danger: true,
    }).then(async (ok) => {
      if (!ok) return;
      await db.transaction('rw', db.habits, db.habitChecks, async () => {
        await db.habitChecks.where('[habitId+date]').between([habit.id, ''], [habit.id, '￿']).delete();
        await db.habits.delete(habit.id);
      });
      sheet.close();
      toast('Привычка удалена');
      await onSaved();
    });
  });
}

// ---------- Диаграммы ----------

function yearCard(habits: Habit[], index: CheckIndex, today: string): HTMLElement {
  const single = habits.length === 1;
  const cells = heatmapDays(habits, index, heatmapStart(today), today).map((day) => ({
    date: day.date,
    level: day.level,
    text:
      day.scheduled === 0
        ? 'Не запланировано'
        : single
          ? day.done > 0
            ? 'Выполнено'
            : 'Не выполнено'
          : `${day.done} из ${day.scheduled}`,
  }));
  return card(
    'Год',
    h(
      'p',
      { class: 'muted small' },
      single
        ? 'Закрашенная клетка - день, когда привычка выполнена. Нажми на клетку, чтобы увидеть дату.'
        : 'Чем насыщеннее цвет клетки, тем больше привычек выполнено в этот день. Нажми на клетку, чтобы увидеть день.',
    ),
    renderHeatmap(cells, 'habits', ['меньше', 'больше']),
  );
}

function weeksCard(habits: Habit[], index: CheckIndex, today: string, charts: Chart[]): HTMLElement {
  const stats = weeklyStats(habits, index, today, WEEKS_ON_CHART);
  const rate = (i: number): number => {
    const week = stats[i];
    return week && week.scheduled > 0 ? Math.round((week.done / week.scheduled) * 100) : 0;
  };
  const { box, canvas } = chartBox(190, 'Доля выполненных привычек по неделям, в процентах');
  // Диаграмму создаём после вставки на страницу, иначе у холста ещё нет размеров.
  requestAnimationFrame(() => {
    if (!canvas.isConnected) return;
    charts.push(
      barChart(canvas, {
        labels: stats.map((week) => formatDay(week.weekStart).replace(/^(\d+) (\S{3}).*$/, '$1 $2')),
        values: stats.map((_, i) => rate(i)),
        color: cssVar('--c-habits'),
        max: 100,
        formatTick: (value) => `${value}%`,
        tooltipTitle: (i) => `Неделя с ${formatDay(stats[i]?.weekStart ?? today)}`,
        tooltipValue: (i) => {
          const week = stats[i];
          return week && week.scheduled > 0 ? `${rate(i)}% (${week.done} из ${week.scheduled})` : 'Ничего не запланировано';
        },
      }),
    );
  });
  return card(
    'По неделям',
    h('p', { class: 'muted small' }, `Доля выполненного за последние ${WEEKS_ON_CHART} недель. Нажми на столбец, чтобы увидеть числа.`),
    box,
    dataTable(
      ['Неделя с', 'Выполнено', 'Доля'],
      stats.map((week, i) => [formatDay(week.weekStart), `${week.done} из ${week.scheduled}`, week.scheduled > 0 ? `${rate(i)}%` : '-']),
    ),
  );
}
