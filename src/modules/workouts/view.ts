import type { Chart } from 'chart.js';
import { barChart, chartBox, cssVar, dataTable, donutBlock, lineChart, mountChart, seriesColor } from '../../core/charts';
import { addDays, formatDay, formatDayShort, todayStr } from '../../core/dates';
import { db, newId } from '../../core/db';
import { formatNumber, parseNumber, plural } from '../../core/format';
import type { Cleanup } from '../../core/router';
import type { Workout, WorkoutExercise } from '../../core/types';
import { card, emptyState, field, h, icon, legend, openSheet, tag, tiles, toast } from '../../core/ui';
import {
  countBetween,
  exerciseNames,
  exerciseProgress,
  lastSets,
  typeColor,
  typeDistribution,
  weeklyVolume,
  WORKOUT_TYPES,
  workoutSets,
  workoutVolume,
} from './logic';

const WEEKS_ON_CHART = 12;
const RECENT_LIMIT = 6;

const kg = (value: number): string => `${formatNumber(value)} кг`;

export async function render(root: HTMLElement): Promise<Cleanup> {
  let charts: Chart[] = [];
  let exercise = '';
  let showAll = false;

  const draw = async (): Promise<void> => {
    const workouts = await db.workouts.orderBy('date').reverse().toArray();
    const today = todayStr();
    const scroll = root.scrollTop;
    charts.forEach((chart) => chart.destroy());
    charts = [];
    root.replaceChildren();

    const add = h('button', { class: 'btn btn-primary', type: 'button' }, icon('plus', 18), 'Добавить тренировку');
    add.addEventListener('click', () => void openWorkoutForm(null, draw));

    if (workouts.length === 0) {
      root.append(
        emptyState(
          'workouts',
          'workouts',
          'Пока нет тренировок',
          'Записывай упражнения, подходы, вес и повторения - приложение покажет прогресс и объём по неделям.',
          add,
        ),
      );
      return;
    }

    const week = weeklyVolume(workouts, today, 1)[0];
    root.append(
      add,
      tiles([
        { label: 'за 7 дней', value: String(countBetween(workouts, addDays(today, -6), today)) },
        { label: 'за 30 дней', value: String(countBetween(workouts, addDays(today, -29), today)) },
        { label: 'объём за неделю', value: kg(week?.volume ?? 0) },
      ]),
      recentCard(workouts, showAll, draw, () => {
        showAll = true;
        void draw();
      }),
      h('h2', { class: 'section-title' }, 'Статистика'),
      volumeCard(workouts, today, charts),
    );

    const names = exerciseNames(workouts);
    if (names.length > 0) {
      if (!names.includes(exercise)) exercise = names[0] ?? '';
      root.append(
        progressCard(workouts, names, exercise, charts, (name) => {
          exercise = name;
          void draw();
        }),
      );
    }
    root.append(typesCard(workouts, today, charts));
    root.scrollTop = scroll;
  };

  await draw();
  return () => charts.forEach((chart) => chart.destroy());
}

// ---------- Список тренировок ----------

function summary(workout: Workout): string {
  const parts: string[] = [];
  const count = workout.exercises.length;
  if (count > 0) {
    parts.push(`${count} ${plural(count, ['упражнение', 'упражнения', 'упражнений'])}`);
    const sets = workoutSets(workout);
    parts.push(`${sets} ${plural(sets, ['подход', 'подхода', 'подходов'])}`);
  }
  const volume = workoutVolume(workout);
  if (volume > 0) parts.push(kg(volume));
  if (workout.note) parts.push(workout.note);
  return parts.join(' · ') || 'Без упражнений';
}

function recentCard(workouts: Workout[], showAll: boolean, redraw: () => Promise<void>, onShowAll: () => void): HTMLElement {
  const shown = showAll ? workouts : workouts.slice(0, RECENT_LIMIT);
  const rows = shown.map((workout) => {
    const row = h(
      'button',
      { class: 'list-row', type: 'button' },
      h(
        'span',
        { class: 'grow' },
        h('div', { class: 'row' }, h('span', { class: 'row-title' }, formatDay(workout.date)), tag(workout.type, 'workouts')),
        h('div', { class: 'muted small' }, summary(workout)),
      ),
      h('span', { class: 'chev' }, icon('chevron', 18)),
    );
    row.addEventListener('click', () => void openWorkoutForm(workout, redraw));
    return row;
  });
  const more =
    !showAll && workouts.length > RECENT_LIMIT
      ? h('button', { class: 'btn btn-quiet btn-sm', type: 'button' }, `Показать все (${workouts.length})`)
      : null;
  more?.addEventListener('click', onShowAll);
  return card('Тренировки', h('div', { class: 'list' }, rows), more);
}

// ---------- Форма тренировки ----------

interface DraftSet {
  weight: string;
  reps: string;
}

interface DraftExercise {
  name: string;
  sets: DraftSet[];
}

const numText = (value: number): string => (value === 0 ? '' : String(value).replace('.', ','));

export async function openWorkoutForm(workout: Workout | null, onSaved: () => Promise<void> | void): Promise<void> {
  const history = await db.workouts.toArray();
  const names = exerciseNames(history);
  const draft: DraftExercise[] = (workout?.exercises ?? []).map((exercise) => ({
    name: exercise.name,
    sets: exercise.sets.map((set) => ({ weight: numText(set.weight), reps: String(set.reps) })),
  }));

  const date = h('input', { class: 'input', type: 'date', value: workout?.date ?? todayStr() });
  const type = h(
    'select',
    { class: 'select' },
    WORKOUT_TYPES.map((name) => h('option', { value: name, selected: name === (workout?.type ?? WORKOUT_TYPES[0]) }, name)),
  );
  const note = h('input', { class: 'input', type: 'text', value: workout?.note ?? '', placeholder: 'Например, бег 5 км', maxLength: 120 });
  const listId = `exercise-names-${newId()}`;
  const datalist = h('datalist', { id: listId }, names.map((name) => h('option', { value: name })));
  const box = h('div', { class: 'stack' });

  const drawExercises = (): void => {
    box.replaceChildren(
      ...draft.map((exercise, ei) => {
        const name = h('input', {
          class: 'input',
          type: 'text',
          value: exercise.name,
          placeholder: 'Название упражнения',
          maxLength: 60,
          autocomplete: 'off',
        });
        name.setAttribute('list', listId);
        name.addEventListener('input', () => {
          exercise.name = name.value;
        });
        // Выбрали знакомое упражнение - подставляем подходы с прошлого раза.
        name.addEventListener('change', () => {
          const untouched = exercise.sets.every((set) => !set.weight && !set.reps);
          const previous = untouched ? lastSets(history, name.value) : null;
          if (previous) {
            exercise.sets = previous.map((set) => ({ weight: numText(set.weight), reps: String(set.reps) }));
            drawExercises();
          }
        });
        const removeExercise = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Убрать упражнение' }, icon('trash', 20));
        removeExercise.addEventListener('click', () => {
          draft.splice(ei, 1);
          drawExercises();
        });

        const rows = exercise.sets.map((set, si) => {
          const weight = h('input', { class: 'input', type: 'text', inputMode: 'decimal', value: set.weight, placeholder: '0', 'aria-label': 'Вес, кг' });
          const reps = h('input', { class: 'input', type: 'text', inputMode: 'numeric', value: set.reps, placeholder: '0', 'aria-label': 'Повторения' });
          weight.addEventListener('input', () => {
            set.weight = weight.value;
          });
          reps.addEventListener('input', () => {
            set.reps = reps.value;
          });
          const removeSet = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Убрать подход', style: 'width:40px;height:40px' }, icon('close', 18));
          removeSet.addEventListener('click', () => {
            exercise.sets.splice(si, 1);
            drawExercises();
          });
          return h('div', { class: 'set-row' }, h('span', { class: 'set-n' }, String(si + 1)), weight, reps, removeSet);
        });

        const addSet = h('button', { class: 'btn btn-sm', type: 'button' }, icon('plus', 16), 'Подход');
        addSet.addEventListener('click', () => {
          const last = exercise.sets[exercise.sets.length - 1];
          exercise.sets.push(last ? { ...last } : { weight: '', reps: '' });
          drawExercises();
        });

        return h(
          'div',
          { class: 'exercise' },
          h('div', { class: 'row' }, h('div', { class: 'grow' }, name), removeExercise),
          rows.length
            ? h('div', { class: 'set-row' }, h('span'), h('span', { class: 'set-head' }, 'вес, кг'), h('span', { class: 'set-head' }, 'повторения'), h('span'))
            : null,
          rows,
          addSet,
        );
      }),
    );
  };

  const addExercise = h('button', { class: 'btn', type: 'button' }, icon('plus', 18), 'Упражнение');
  addExercise.addEventListener('click', () => {
    draft.push({ name: '', sets: [{ weight: '', reps: '' }] });
    drawExercises();
    box.lastElementChild?.querySelector('input')?.focus();
  });

  const save = h('button', { class: 'btn btn-primary', type: 'button' }, workout ? 'Сохранить' : 'Добавить');
  const remove = workout ? h('button', { class: 'btn btn-danger', type: 'button' }, 'Удалить тренировку') : null;

  const sheet = openSheet(workout ? 'Тренировка' : 'Новая тренировка', [
    h('div', { class: 'field-row' }, field('Дата', date), field('Тип', type)),
    datalist,
    box,
    addExercise,
    field('Заметка', note),
    save,
    remove,
  ]);
  drawExercises();

  save.addEventListener('click', () => {
    if (!date.value) {
      toast('Укажи дату', 'error');
      return;
    }
    const exercises: WorkoutExercise[] = [];
    for (const item of draft) {
      const name = item.name.trim();
      const sets = item.sets
        .map((set) => ({ weight: parseNumber(set.weight) ?? 0, reps: Math.round(parseNumber(set.reps) ?? 0) }))
        .filter((set) => set.reps > 0);
      if (!name && sets.length === 0) continue;
      if (!name) {
        toast('У упражнения с подходами нет названия', 'error');
        return;
      }
      exercises.push({ name, sets });
    }
    const record: Workout = {
      id: workout?.id ?? newId(),
      date: date.value,
      type: type.value,
      exercises,
      ...(note.value.trim() ? { note: note.value.trim() } : {}),
    };
    void db.workouts.put(record).then(() => {
      sheet.close();
      toast(workout ? 'Сохранено' : 'Тренировка добавлена');
      return onSaved();
    });
  });

  remove?.addEventListener('click', () => {
    if (!workout) return;
    void db.workouts.delete(workout.id).then(() => {
      sheet.close();
      toast('Тренировка удалена');
      return onSaved();
    });
  });
}

// ---------- Диаграммы ----------

function volumeCard(workouts: Workout[], today: string, charts: Chart[]): HTMLElement {
  const weeks = weeklyVolume(workouts, today, WEEKS_ON_CHART);
  const { box, canvas } = chartBox(190, 'Объём тренировок по неделям, килограммы');
  mountChart(canvas, charts, () =>
    barChart(canvas, {
      labels: weeks.map((week) => formatDayShort(week.weekStart)),
      series: [{ label: 'Объём', values: weeks.map((week) => week.volume), color: cssVar('--c-workouts') }],
      formatTick: (value) => formatNumber(value),
      tooltipTitle: (i) => `Неделя с ${formatDay(weeks[i]?.weekStart ?? today)}`,
      tooltipValue: (_, i) => `${kg(weeks[i]?.volume ?? 0)}, тренировок: ${weeks[i]?.count ?? 0}`,
    }),
  );
  return card(
    'Объём по неделям',
    h('p', { class: 'muted small' }, 'Объём - это вес, умноженный на повторения, по всем подходам за неделю.'),
    box,
    dataTable(
      ['Неделя с', 'Тренировок', 'Объём'],
      weeks.map((week) => [formatDay(week.weekStart), week.count, kg(week.volume)]),
    ),
  );
}

function progressCard(
  workouts: Workout[],
  names: string[],
  selected: string,
  charts: Chart[],
  onSelect: (name: string) => void,
): HTMLElement {
  const select = h(
    'select',
    { class: 'select', 'aria-label': 'Упражнение' },
    names.map((name) => h('option', { value: name, selected: name === selected }, name)),
  );
  select.addEventListener('change', () => onSelect(select.value));

  const progress = exerciseProgress(workouts, selected);
  const unit = progress.unit === 'kg' ? 'кг' : 'повт.';
  const value = (n: number): string => `${formatNumber(n)} ${unit}`;

  if (progress.points.length < 2) {
    return card(
      'Прогресс по упражнению',
      select,
      h('p', { class: 'muted small' }, 'Линия появится, когда это упражнение будет записано хотя бы в двух тренировках.'),
    );
  }
  const { box, canvas } = chartBox(190, `Прогресс по упражнению ${selected}`);
  mountChart(canvas, charts, () =>
    lineChart(canvas, {
      labels: progress.points.map((point) => formatDayShort(point.date)),
      values: progress.points.map((point) => point.value),
      color: cssVar('--c-workouts'),
      formatTick: (n) => formatNumber(n),
      tooltipTitle: (i) => formatDay(progress.points[i]?.date ?? ''),
      tooltipValue: (i) => value(progress.points[i]?.value ?? 0),
    }),
  );
  const first = progress.points[0]?.value ?? 0;
  const last = progress.points[progress.points.length - 1]?.value ?? 0;
  return card(
    'Прогресс по упражнению',
    select,
    h(
      'p',
      { class: 'muted small' },
      progress.unit === 'kg' ? 'Лучший вес за тренировку. ' : 'Лучшее число повторений за тренировку. ',
      `Было ${value(first)}, стало ${value(last)}.`,
    ),
    box,
    dataTable(
      ['Дата', progress.unit === 'kg' ? 'Лучший вес' : 'Повторений'],
      progress.points.map((point) => [formatDay(point.date), value(point.value)]),
    ),
  );
}

function typesCard(workouts: Workout[], today: string, charts: Chart[]): HTMLElement {
  const types = typeDistribution(workouts, addDays(today, -89), today);
  if (types.length === 0) {
    return card('Типы тренировок', h('p', { class: 'muted small' }, 'За последние 90 дней тренировок не было.'));
  }
  const total = types.reduce((sum, item) => sum + item.count, 0);
  const colors = types.map((item) => seriesColor(typeColor(item.type)));
  return card(
    'Типы тренировок',
    h('p', { class: 'muted small' }, 'За последние 90 дней.'),
    donutBlock(
      charts,
      'Распределение тренировок по типам за 90 дней',
      { value: String(total), caption: plural(total, ['тренировка', 'тренировки', 'тренировок']) },
      {
        labels: types.map((item) => item.type),
        values: types.map((item) => item.count),
        colors,
        tooltipValue: (i) => `${types[i]?.count ?? 0} (${Math.round(((types[i]?.count ?? 0) / total) * 100)}%)`,
      },
    ),
    legend(
      types.map((item, i) => ({
        color: colors[i] ?? '',
        label: item.type,
        value: `${item.count} · ${Math.round((item.count / total) * 100)}%`,
      })),
    ),
  );
}
