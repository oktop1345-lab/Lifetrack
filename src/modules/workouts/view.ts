import type { Chart } from 'chart.js';
import { barChart, chartBox, cssVar, dataTable, donutBlock, lineChart, mountChart, seriesColor } from '../../core/charts';
import { addDays, formatDay, formatDayShort, todayStr } from '../../core/dates';
import { db, newId } from '../../core/db';
import { formatNumber, parseNumber, plural } from '../../core/format';
import type { Cleanup } from '../../core/router';
import type { Workout, WorkoutExercise } from '../../core/types';
import { card, emptyState, field, h, icon, legend, openSheet, props, seg, tag, tiles, toast } from '../../core/ui';
import { getSetting, setSetting } from '../../core/settings';
import {
  bodyweightReps,
  countBetween,
  isBodyweight,
  lastExercise,
  looksBodyweight,
  exerciseNames,
  exerciseProgress,
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
    const [workouts, bodyWeight] = await Promise.all([db.workouts.orderBy('date').reverse().toArray(), getSetting('bodyWeightKg')]);
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
          'Записывай упражнения, подходы, вес и повторения - и упражнения с собственным весом: подтягивания, отжимания, пресс. Приложение покажет прогресс и объём по неделям.',
          add,
        ),
      );
      return;
    }

    const week = weeklyVolume(workouts, today, 1, bodyWeight)[0];
    const hasBodyweight = workouts.some((item) => item.exercises.some(isBodyweight));
    root.append(
      add,
      tiles([
        { label: 'за 7 дней', value: String(countBetween(workouts, addDays(today, -6), today)) },
        { label: 'объём за неделю', value: kg(week?.volume ?? 0) },
        hasBodyweight
          ? { label: 'повт. со своим весом', value: formatNumber(week?.bodyweightReps ?? 0) }
          : { label: 'за 30 дней', value: String(countBetween(workouts, addDays(today, -29), today)) },
      ]),
      recentCard(workouts, bodyWeight, showAll, draw, () => {
        showAll = true;
        void draw();
      }),
      h('h2', { class: 'section-title' }, 'Статистика'),
      volumeCard(workouts, today, bodyWeight, hasBodyweight, charts),
    );
    if (hasBodyweight) root.append(bodyweightCard(workouts, today, bodyWeight, draw));

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

function summary(workout: Workout, bodyWeight: number | null): string {
  const parts: string[] = [];
  const count = workout.exercises.length;
  if (count > 0) {
    parts.push(`${count} ${plural(count, ['упражнение', 'упражнения', 'упражнений'])}`);
    const sets = workoutSets(workout);
    parts.push(`${sets} ${plural(sets, ['подход', 'подхода', 'подходов'])}`);
  }
  const volume = workoutVolume(workout, bodyWeight);
  if (volume > 0) parts.push(kg(volume));
  const reps = bodyweightReps(workout);
  if (reps > 0) parts.push(`${reps} повт. со своим весом`);
  if (workout.note) parts.push(workout.note);
  return parts.join(' · ') || 'Без упражнений';
}

function recentCard(workouts: Workout[], bodyWeight: number | null, showAll: boolean, redraw: () => Promise<void>, onShowAll: () => void): HTMLElement {
  const shown = showAll ? workouts : workouts.slice(0, RECENT_LIMIT);
  const rows = shown.map((workout) => {
    const row = h(
      'button',
      { class: 'list-row', type: 'button' },
      h(
        'span',
        { class: 'grow' },
        h('div', { class: 'row' }, h('span', { class: 'row-title' }, formatDay(workout.date)), tag(workout.type, 'workouts')),
        h('div', { class: 'muted small' }, summary(workout, bodyWeight)),
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
  /** С собственным весом: колонка веса становится «доп. вес». */
  bodyweight: boolean;
  /** Переключатель трогали руками - тогда не меняем его автоматически по названию. */
  bodyweightTouched: boolean;
}

const numText = (value: number): string => (value === 0 ? '' : String(value).replace('.', ','));

export async function openWorkoutForm(workout: Workout | null, onSaved: () => Promise<void> | void): Promise<void> {
  const history = await db.workouts.toArray();
  const names = exerciseNames(history);
  const draft: DraftExercise[] = (workout?.exercises ?? []).map((exercise) => ({
    name: exercise.name,
    bodyweight: isBodyweight(exercise),
    bodyweightTouched: true,
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
        // Выбрали знакомое упражнение - подставляем подходы и «свой вес» с прошлого раза.
        // Новое упражнение вроде «Подтягивания» само переключается на собственный вес.
        name.addEventListener('change', () => {
          const untouched = exercise.sets.every((set) => !set.weight && !set.reps);
          const previous = lastExercise(history, name.value);
          let changed = false;
          if (previous && untouched) {
            exercise.sets = previous.sets.map((set) => ({ weight: numText(set.weight), reps: String(set.reps) }));
            changed = true;
          }
          if (!exercise.bodyweightTouched) {
            const next = previous ? isBodyweight(previous) : looksBodyweight(name.value);
            if (next !== exercise.bodyweight) {
              exercise.bodyweight = next;
              changed = true;
            }
          }
          if (changed) drawExercises();
        });
        const kind = seg<'weight' | 'body'>(
          [
            { value: 'weight', label: 'С весом' },
            { value: 'body', label: 'Свой вес' },
          ],
          exercise.bodyweight ? 'body' : 'weight',
          (value) => {
            exercise.bodyweight = value === 'body';
            exercise.bodyweightTouched = true;
            drawExercises();
          },
        );
        const removeExercise = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Убрать упражнение' }, icon('trash', 20));
        removeExercise.addEventListener('click', () => {
          draft.splice(ei, 1);
          drawExercises();
        });

        const rows = exercise.sets.map((set, si) => {
          const weight = h('input', {
            class: 'input',
            type: 'text',
            inputMode: 'decimal',
            value: set.weight,
            placeholder: '0',
            'aria-label': exercise.bodyweight ? 'Дополнительный вес, кг' : 'Вес, кг',
          });
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
          kind,
          exercise.bodyweight
            ? h('p', { class: 'muted tiny' }, 'Свой вес: считаются повторения. Доп. вес - если с жилетом или блином, иначе оставь пустым.')
            : null,
          rows.length
            ? h(
                'div',
                { class: 'set-row' },
                h('span'),
                h('span', { class: 'set-head' }, exercise.bodyweight ? 'доп. вес, кг' : 'вес, кг'),
                h('span', { class: 'set-head' }, 'повторения'),
                h('span'),
              )
            : null,
          rows,
          addSet,
        );
      }),
    );
  };

  const addExercise = h('button', { class: 'btn', type: 'button' }, icon('plus', 18), 'Упражнение');
  addExercise.addEventListener('click', () => {
    draft.push({ name: '', sets: [{ weight: '', reps: '' }], bodyweight: type.value === 'Свой вес', bodyweightTouched: false });
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
      exercises.push({ name, sets, bodyweight: item.bodyweight });
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

function volumeCard(workouts: Workout[], today: string, bodyWeight: number | null, hasBodyweight: boolean, charts: Chart[]): HTMLElement {
  const weeks = weeklyVolume(workouts, today, WEEKS_ON_CHART, bodyWeight);
  const { box, canvas } = chartBox(190, 'Объём тренировок по неделям, килограммы');
  mountChart(canvas, charts, () =>
    barChart(canvas, {
      labels: weeks.map((week) => formatDayShort(week.weekStart)),
      series: [{ label: 'Объём', values: weeks.map((week) => week.volume), color: cssVar('--c-workouts') }],
      formatTick: (value) => formatNumber(value),
      tooltipTitle: (i) => `Неделя с ${formatDay(weeks[i]?.weekStart ?? today)}`,
      tooltipValue: (_, i) =>
        `${kg(weeks[i]?.volume ?? 0)}, тренировок: ${weeks[i]?.count ?? 0}` +
        (hasBodyweight ? `, повт. со своим весом: ${weeks[i]?.bodyweightReps ?? 0}` : ''),
    }),
  );
  return card(
    'Объём по неделям',
    h(
      'p',
      { class: 'muted small' },
      'Объём - это вес, умноженный на повторения, по всем подходам за неделю.',
      hasBodyweight
        ? bodyWeight
          ? ` Упражнения со своим весом считаются с весом тела ${formatNumber(bodyWeight)} кг.`
          : ' Упражнения со своим весом сюда не входят, пока не указан вес тела (ниже).'
        : '',
    ),
    box,
    dataTable(
      hasBodyweight ? ['Неделя с', 'Тренировок', 'Свой вес, повт.', 'Объём'] : ['Неделя с', 'Тренировок', 'Объём'],
      weeks.map((week) =>
        hasBodyweight
          ? [formatDay(week.weekStart), week.count, week.bodyweightReps, kg(week.volume)]
          : [formatDay(week.weekStart), week.count, kg(week.volume)],
      ),
    ),
  );
}

/** Упражнения с собственным весом: вес тела и повторения за неделю и месяц. */
function bodyweightCard(workouts: Workout[], today: string, bodyWeight: number | null, redraw: () => Promise<void>): HTMLElement {
  const sumReps = (from: string): number =>
    workouts.filter((item) => item.date >= from && item.date <= today).reduce((sum, item) => sum + bodyweightReps(item), 0);
  const edit = h('button', { class: 'btn btn-sm', type: 'button' }, bodyWeight ? 'Изменить' : 'Указать');
  edit.addEventListener('click', () => {
    const input = h('input', {
      class: 'input',
      type: 'text',
      inputMode: 'decimal',
      value: bodyWeight ? String(bodyWeight).replace('.', ',') : '',
      placeholder: 'например, 70',
    });
    const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Сохранить');
    const sheet = openSheet('Вес тела', [
      field('Вес, кг', input, 'Нужен, чтобы упражнения со своим весом попадали в объём тренировок. Хранится только на телефоне.'),
      save,
    ]);
    input.focus();
    save.addEventListener('click', () => {
      const value = input.value.trim() === '' ? null : parseNumber(input.value);
      if (input.value.trim() !== '' && (value === null || value < 20 || value > 300)) {
        toast('Укажи вес от 20 до 300 кг', 'error');
        return;
      }
      void setSetting('bodyWeightKg', value).then(() => {
        sheet.close();
        return redraw();
      });
    });
  });
  return card(
    [h('span', { class: 'grow' }, 'Собственный вес'), edit],
    props([
      { label: 'Вес тела', value: bodyWeight ? `${formatNumber(bodyWeight)} кг` : 'не указан' },
      { label: 'Повторений за 7 дней', value: formatNumber(sumReps(addDays(today, -6))) },
      { label: 'Повторений за 30 дней', value: formatNumber(sumReps(addDays(today, -29))) },
    ]),
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
      progress.unit === 'kg'
        ? 'Лучший вес за тренировку. '
        : progress.bodyweight
          ? 'Упражнение с собственным весом: лучшее число повторений в подходе. '
          : 'Лучшее число повторений за тренировку. ',
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
