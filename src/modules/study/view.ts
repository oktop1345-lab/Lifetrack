import type { Chart } from 'chart.js';
import { barChart, chartBox, cssVar, dataTable, mountChart } from '../../core/charts';
import { addDays, formatDay, todayStr } from '../../core/dates';
import { db, newId } from '../../core/db';
import { formatDuration, formatHours, formatNumber, parseNumber, percent } from '../../core/format';
import type { Cleanup } from '../../core/router';
import { getSetting, setSetting, type StudyTimer } from '../../core/settings';
import type { StudyGoal, StudySession, StudySubject } from '../../core/types';
import {
  card,
  chipSelect,
  confirmSheet,
  emptyState,
  field,
  h,
  icon,
  meter,
  openSheet,
  promptSheet,
  seg,
  tag,
  tiles,
  toast,
} from '../../core/ui';
import { goalProgress, minutesBySubject, timerClock, timerMinutes, totalMinutes } from './logic';

type Period = '7' | '30' | 'all';
const NEW_SUBJECT = '__new__';
const RECENT_LIMIT = 6;

export async function render(root: HTMLElement): Promise<Cleanup> {
  let charts: Chart[] = [];
  let period: Period = '30';
  let tick: number | undefined;

  const draw = async (): Promise<void> => {
    const [subjects, goals, sessions, timer] = await Promise.all([
      db.studySubjects.toArray(),
      db.studyGoals.toArray(),
      db.studySessions.orderBy('date').reverse().toArray(),
      getSetting('studyTimer'),
    ]);
    subjects.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const today = todayStr();
    const scroll = root.scrollTop;
    charts.forEach((chart) => chart.destroy());
    charts = [];
    window.clearInterval(tick);
    root.replaceChildren();

    if (subjects.length === 0) {
      const add = h('button', { class: 'btn btn-primary', type: 'button' }, icon('plus', 18), 'Добавить предмет');
      add.addEventListener('click', () => void addSubject().then((subject) => subject && draw()));
      root.append(
        emptyState(
          'study',
          'study',
          'Пока нет предметов',
          'Добавь предмет - например, «Английский» или «Программирование». Потом записывай занятия таймером или вручную.',
          add,
        ),
      );
      return;
    }

    if (timer) {
      const subject = subjects.find((item) => item.id === timer.subjectId);
      const clock = h('div', { class: 'timer' }, timerClock(timer.startedAt, new Date()));
      tick = window.setInterval(() => {
        clock.textContent = timerClock(timer.startedAt, new Date());
      }, 1000);
      const stop = h('button', { class: 'btn btn-primary', type: 'button' }, 'Завершить');
      const cancel = h('button', { class: 'btn', type: 'button' }, 'Отменить');
      stop.addEventListener('click', () => {
        void openSessionForm(
          { subjectId: timer.subjectId, goalId: timer.goalId, date: today, minutes: timerMinutes(timer.startedAt, new Date()) },
          async () => {
            await setSetting('studyTimer', null);
            await draw();
          },
        );
      });
      cancel.addEventListener('click', () => {
        void confirmSheet({ title: 'Отменить таймер?', text: 'Время этого занятия не сохранится.', confirmLabel: 'Отменить таймер', danger: true }).then(async (ok) => {
          if (!ok) return;
          await setSetting('studyTimer', null);
          await draw();
        });
      });
      root.append(
        card(
          [h('span', { class: 'grow' }, 'Идёт занятие'), tag(subject?.name ?? 'Предмет', 'study')],
          clock,
          h('p', { class: 'muted small', style: 'text-align:center' }, 'Таймер считает время, даже если закрыть приложение.'),
          h('div', { class: 'btn-row' }, stop, cancel),
        ),
      );
    } else {
      const start = h('button', { class: 'btn btn-primary', type: 'button' }, icon('clock', 18), 'Таймер');
      const manual = h('button', { class: 'btn', type: 'button' }, icon('plus', 18), 'Записать');
      start.addEventListener('click', () => void openTimerStart(draw));
      manual.addEventListener('click', () => void openSessionForm({ date: today }, draw));
      root.append(h('div', { class: 'btn-row' }, start, manual));
    }

    root.append(
      tiles([
        { label: 'сегодня', value: formatHours(totalMinutes(sessions, today, today)) },
        { label: 'за 7 дней', value: formatHours(totalMinutes(sessions, addDays(today, -6), today)) },
        { label: 'за 30 дней', value: formatHours(totalMinutes(sessions, addDays(today, -29), today)) },
      ]),
      subjectsCard(sessions, subjects, today, period, charts, (next) => {
        period = next;
        void draw();
      }),
      goalsCard(goals, sessions, subjects, draw),
      sessionsCard(sessions, subjects, draw),
    );

    const manage = h('button', { class: 'btn btn-quiet', type: 'button' }, 'Настроить предметы');
    manage.addEventListener('click', () => openSubjectManager(draw));
    root.append(manage);
    root.scrollTop = scroll;
  };

  await draw();
  return () => {
    window.clearInterval(tick);
    charts.forEach((chart) => chart.destroy());
  };
}

// ---------- Предметы ----------

async function addSubject(): Promise<StudySubject | null> {
  const name = await promptSheet({ title: 'Новый предмет', label: 'Название', placeholder: 'Например, английский', confirmLabel: 'Добавить' });
  if (!name) return null;
  const subject: StudySubject = { id: newId(), name, createdAt: new Date().toISOString() };
  await db.studySubjects.put(subject);
  return subject;
}

/** Выпадающий список предметов с пунктом «Новый предмет». */
function subjectSelect(subjects: StudySubject[], selected: string | undefined, onChange: () => void): HTMLSelectElement {
  const select = h('select', { class: 'select' });
  const fill = (value?: string): void => {
    select.replaceChildren(
      // Без этой строки при пустом списке «Новый предмет» был бы уже выбран и не срабатывал бы.
      ...(subjects.length === 0 ? [h('option', { value: '' }, 'Выбери предмет')] : []),
      ...subjects.map((subject) => h('option', { value: subject.id, selected: subject.id === value }, subject.name)),
      h('option', { value: NEW_SUBJECT }, '+ Новый предмет...'),
    );
  };
  fill(selected);
  select.addEventListener('change', () => {
    if (select.value !== NEW_SUBJECT) {
      onChange();
      return;
    }
    void addSubject().then((subject) => {
      if (subject) subjects.push(subject);
      fill(subject?.id ?? subjects[0]?.id);
      onChange();
    });
  });
  return select;
}

function goalSelect(goals: StudyGoal[], subjectId: string, selected: string | undefined): HTMLSelectElement {
  return h(
    'select',
    { class: 'select' },
    h('option', { value: '' }, 'Без цели'),
    goals
      .filter((goal) => goal.subjectId === subjectId)
      .map((goal) => h('option', { value: goal.id, selected: goal.id === selected }, goal.title)),
  );
}

function openSubjectManager(onChanged: () => Promise<void>): void {
  const list = h('div', { class: 'list' });
  const add = h('button', { class: 'btn', type: 'button' }, icon('plus', 18), 'Новый предмет');

  const draw = async (): Promise<void> => {
    const subjects = (await db.studySubjects.toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    list.replaceChildren(
      ...subjects.map((subject) => {
        const rename = h('button', { class: 'list-row grow', type: 'button' }, h('span', { class: 'grow row-title' }, subject.name));
        rename.addEventListener('click', () => {
          void promptSheet({ title: 'Предмет', label: 'Название', value: subject.name }).then(async (name) => {
            if (!name) return;
            await db.studySubjects.put({ ...subject, name });
            await draw();
            await onChanged();
          });
        });
        const del = h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Удалить предмет ${subject.name}` }, icon('trash', 20));
        del.addEventListener('click', () => {
          void confirmSheet({
            title: 'Удалить предмет?',
            text: `«${subject.name}», его цели и все занятия по нему будут удалены. Это нельзя отменить.`,
            confirmLabel: 'Удалить',
            danger: true,
          }).then(async (ok) => {
            if (!ok) return;
            await db.transaction('rw', db.studySubjects, db.studyGoals, db.studySessions, async () => {
              await db.studySessions.where('subjectId').equals(subject.id).delete();
              await db.studyGoals.where('subjectId').equals(subject.id).delete();
              await db.studySubjects.delete(subject.id);
            });
            const timer = await getSetting('studyTimer');
            if (timer?.subjectId === subject.id) await setSetting('studyTimer', null);
            await draw();
            await onChanged();
          });
        });
        return h('div', { class: 'row' }, rename, del);
      }),
    );
  };
  add.addEventListener('click', () => {
    void addSubject().then(async (subject) => {
      if (!subject) return;
      await draw();
      await onChanged();
    });
  });
  openSheet('Предметы', [list, add]);
  void draw();
}

// ---------- Таймер ----------

async function openTimerStart(onStarted: () => Promise<void>): Promise<void> {
  const [subjects, goals] = await Promise.all([db.studySubjects.toArray(), db.studyGoals.toArray()]);
  subjects.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const goalBox = h('div');
  let goalControl = goalSelect(goals, subjects[0]?.id ?? '', undefined);
  const refreshGoals = (): void => {
    goalControl = goalSelect(goals, subject.value, undefined);
    goalBox.replaceChildren(field('Цель (необязательно)', goalControl));
  };
  const subject = subjectSelect(subjects, subjects[0]?.id, refreshGoals);
  refreshGoals();
  const start = h('button', { class: 'btn btn-primary', type: 'button' }, 'Начать');
  const sheet = openSheet('Таймер учёбы', [field('Предмет', subject), goalBox, start]);
  start.addEventListener('click', () => {
    if (!subject.value || subject.value === NEW_SUBJECT) return;
    const timer: StudyTimer = {
      subjectId: subject.value,
      startedAt: new Date().toISOString(),
      ...(goalControl.value ? { goalId: goalControl.value } : {}),
    };
    void setSetting('studyTimer', timer).then(() => {
      sheet.close();
      return onStarted();
    });
  });
}

// ---------- Занятия ----------

/** Форма занятия. Принимает существующее занятие или заготовку (например, время с таймера). */
export async function openSessionForm(
  source: StudySession | Partial<StudySession>,
  onSaved: () => Promise<void> | void,
): Promise<void> {
  const existing = source.id ? (source as StudySession) : null;
  const [subjects, goals] = await Promise.all([db.studySubjects.toArray(), db.studyGoals.toArray()]);
  subjects.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const goalBox = h('div');
  let goalControl = goalSelect(goals, source.subjectId ?? subjects[0]?.id ?? '', source.goalId);
  const refreshGoals = (): void => {
    goalControl = goalSelect(goals, subject.value, source.goalId);
    goalBox.replaceChildren(field('Цель (необязательно)', goalControl));
  };
  const subject = subjectSelect(subjects, source.subjectId ?? subjects[0]?.id, refreshGoals);
  refreshGoals();

  const minutes = h('input', {
    class: 'input',
    type: 'text',
    inputMode: 'numeric',
    value: source.minutes ? String(source.minutes) : '',
    placeholder: '0',
  });
  const quick = chipSelect(
    ['15', '30', '45', '60', '90'].map((value) => ({ value, label: `${value} мин` })),
    source.minutes ? String(source.minutes) : null,
    (value) => {
      minutes.value = value;
    },
  );
  const date = h('input', { class: 'input', type: 'date', value: source.date ?? todayStr() });
  const note = h('input', { class: 'input', type: 'text', value: source.note ?? '', placeholder: 'Что изучал', maxLength: 120 });
  const save = h('button', { class: 'btn btn-primary', type: 'button' }, existing ? 'Сохранить' : 'Добавить');
  const remove = existing ? h('button', { class: 'btn btn-danger', type: 'button' }, 'Удалить') : null;

  const sheet = openSheet(existing ? 'Занятие' : 'Новое занятие', [
    field('Предмет', subject),
    goalBox,
    field('Сколько минут', minutes),
    quick,
    h('div', { class: 'field-row' }, field('Дата', date), field('Заметка', note)),
    save,
    remove,
  ]);

  save.addEventListener('click', () => {
    const value = parseNumber(minutes.value);
    if (!subject.value || subject.value === NEW_SUBJECT) {
      toast('Выбери предмет', 'error');
      return;
    }
    if (value === null || value < 1 || !date.value) {
      toast('Укажи дату и время от 1 минуты', 'error');
      return;
    }
    const record: StudySession = {
      id: existing?.id ?? newId(),
      subjectId: subject.value,
      date: date.value,
      minutes: Math.round(value),
      ...(goalControl.value ? { goalId: goalControl.value } : {}),
      ...(note.value.trim() ? { note: note.value.trim() } : {}),
    };
    void db.studySessions.put(record).then(() => {
      sheet.close();
      toast(existing ? 'Сохранено' : 'Занятие записано');
      return onSaved();
    });
  });

  remove?.addEventListener('click', () => {
    if (!existing) return;
    void db.studySessions.delete(existing.id).then(() => {
      sheet.close();
      toast('Занятие удалено');
      return onSaved();
    });
  });
}

function sessionsCard(sessions: StudySession[], subjects: StudySubject[], redraw: () => Promise<void>): HTMLElement {
  if (sessions.length === 0) {
    return card('Занятия', h('p', { class: 'muted small' }, 'Пока пусто. Запусти таймер или запиши занятие вручную.'));
  }
  const names = new Map(subjects.map((subject) => [subject.id, subject.name]));
  const rows = sessions.slice(0, RECENT_LIMIT).map((session) => {
    const row = h(
      'button',
      { class: 'list-row', type: 'button' },
      h(
        'span',
        { class: 'grow' },
        h('div', { class: 'row' }, h('span', { class: 'row-title' }, formatDay(session.date)), tag(names.get(session.subjectId) ?? 'Предмет', 'study')),
        session.note ? h('div', { class: 'muted small' }, session.note) : null,
      ),
      h('span', { class: 'row-side' }, formatDuration(session.minutes)),
    );
    row.addEventListener('click', () => void openSessionForm(session, redraw));
    return row;
  });
  return card(
    'Занятия',
    h('div', { class: 'list' }, rows),
    sessions.length > RECENT_LIMIT ? h('p', { class: 'muted small' }, `Показаны последние ${RECENT_LIMIT} из ${sessions.length}.`) : null,
  );
}

// ---------- Часы по предметам ----------

function subjectsCard(
  sessions: StudySession[],
  subjects: StudySubject[],
  today: string,
  period: Period,
  charts: Chart[],
  onPeriod: (period: Period) => void,
): HTMLElement {
  const from = period === 'all' ? '0000-01-01' : addDays(today, -(Number(period) - 1));
  const data = minutesBySubject(sessions, subjects, from, today);
  const switcher = seg<Period>(
    [
      { value: '7', label: '7 дней' },
      { value: '30', label: '30 дней' },
      { value: 'all', label: 'Всё время' },
    ],
    period,
    onPeriod,
  );
  if (data.length === 0) {
    return card('Часы по предметам', switcher, h('p', { class: 'muted small' }, 'За этот период занятий не было.'));
  }
  const hours = (minutes: number): number => Math.round((minutes / 60) * 10) / 10;
  const { box, canvas } = chartBox(Math.max(110, data.length * 38 + 40), 'Часы учёбы по предметам');
  mountChart(canvas, charts, () =>
    barChart(canvas, {
      horizontal: true,
      labels: data.map((item) => (item.name.length > 14 ? `${item.name.slice(0, 13)}…` : item.name)),
      series: [{ label: 'Часы', values: data.map((item) => hours(item.minutes)), color: cssVar('--c-study') }],
      formatTick: (value) => `${formatNumber(value)} ч`,
      tooltipTitle: (i) => data[i]?.name ?? '',
      tooltipValue: (_, i) => formatDuration(data[i]?.minutes ?? 0),
    }),
  );
  return card(
    'Часы по предметам',
    switcher,
    box,
    dataTable(
      ['Предмет', 'Время'],
      data.map((item) => [item.name, formatDuration(item.minutes)]),
    ),
  );
}

// ---------- Цели ----------

function goalsCard(
  goals: StudyGoal[],
  sessions: StudySession[],
  subjects: StudySubject[],
  redraw: () => Promise<void>,
): HTMLElement {
  const add = h('button', { class: 'btn btn-sm', type: 'button' }, icon('plus', 16), 'Цель');
  add.addEventListener('click', () => void openGoalForm(null, redraw));
  const title = [h('span', { class: 'grow' }, 'Цели'), add];
  if (goals.length === 0) {
    return card(title, h('p', { class: 'muted small' }, 'Например, «40 часов английского до марта». Занятия, привязанные к цели, двигают её прогресс.'));
  }
  const names = new Map(subjects.map((subject) => [subject.id, subject.name]));
  goals.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const rows = goals.map((goal) => {
    const progress = goalProgress(goal, sessions);
    const row = h(
      'button',
      { class: 'list-row', type: 'button', style: 'flex-direction:column;align-items:stretch;gap:6px' },
      h(
        'div',
        { class: 'row' },
        h('span', { class: 'grow row-title' }, goal.title),
        h('span', { class: 'row-side' }, percent(progress.minutes, goal.targetMinutes)),
      ),
      meter(progress.share, 'study'),
      h(
        'div',
        { class: 'row muted small' },
        tag(names.get(goal.subjectId) ?? 'Предмет', 'study'),
        h(
          'span',
          { class: 'grow' },
          `${formatDuration(progress.minutes)} из ${formatDuration(goal.targetMinutes)}`,
          progress.done ? ' · достигнута' : goal.deadline ? ` · до ${formatDay(goal.deadline)}` : '',
        ),
      ),
    );
    row.addEventListener('click', () => void openGoalForm(goal, redraw));
    return row;
  });
  return card(title, h('div', { class: 'list' }, rows));
}

async function openGoalForm(goal: StudyGoal | null, onSaved: () => Promise<void>): Promise<void> {
  const subjects = (await db.studySubjects.toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const title = h('input', { class: 'input', type: 'text', value: goal?.title ?? '', placeholder: 'Например, уровень B2', maxLength: 60 });
  const subject = subjectSelect(subjects, goal?.subjectId ?? subjects[0]?.id, () => undefined);
  const hours = h('input', {
    class: 'input',
    type: 'text',
    inputMode: 'decimal',
    value: goal ? String(Math.round((goal.targetMinutes / 60) * 10) / 10).replace('.', ',') : '',
    placeholder: '0',
  });
  const deadline = h('input', { class: 'input', type: 'date', value: goal?.deadline ?? '' });
  const save = h('button', { class: 'btn btn-primary', type: 'button' }, goal ? 'Сохранить' : 'Добавить');
  const remove = goal ? h('button', { class: 'btn btn-danger', type: 'button' }, 'Удалить цель') : null;

  const sheet = openSheet(goal ? 'Цель' : 'Новая цель', [
    field('Название', title),
    field('Предмет', subject),
    h('div', { class: 'field-row' }, field('Сколько часов', hours), field('Срок (необязательно)', deadline)),
    save,
    remove,
  ]);
  if (!goal) title.focus();

  save.addEventListener('click', () => {
    const value = parseNumber(hours.value);
    if (!title.value.trim() || value === null || value <= 0 || !subject.value || subject.value === NEW_SUBJECT) {
      toast('Укажи название, предмет и число часов', 'error');
      return;
    }
    const record: StudyGoal = {
      id: goal?.id ?? newId(),
      subjectId: subject.value,
      title: title.value.trim(),
      targetMinutes: Math.round(value * 60),
      createdAt: goal?.createdAt ?? new Date().toISOString(),
      ...(deadline.value ? { deadline: deadline.value } : {}),
    };
    void db.studyGoals.put(record).then(() => {
      sheet.close();
      toast(goal ? 'Сохранено' : 'Цель добавлена');
      return onSaved();
    });
  });

  remove?.addEventListener('click', () => {
    if (!goal) return;
    void confirmSheet({
      title: 'Удалить цель?',
      text: `«${goal.title}» будет удалена. Занятия останутся, но перестанут быть привязаны к цели.`,
      confirmLabel: 'Удалить',
      danger: true,
    }).then(async (ok) => {
      if (!ok) return;
      await db.transaction('rw', db.studyGoals, db.studySessions, async () => {
        await db.studySessions.where('goalId').equals(goal.id).modify((session) => {
          delete session.goalId;
        });
        await db.studyGoals.delete(goal.id);
      });
      sheet.close();
      await onSaved();
    });
  });
}
