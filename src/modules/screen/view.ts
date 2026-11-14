import type { Chart } from 'chart.js';
import { describeError } from '../../ai/errors';
import { activeProvider, configProblem, streamChat } from '../../ai/providers';
import type { ChatImage } from '../../ai/types';
import { barChart, chartBox, cssVar, dataTable, mountChart } from '../../core/charts';
import { addDays, dateRange, formatDay, formatDayShort, formatDateTime, isoWeekday, todayStr } from '../../core/dates';
import { db, newId } from '../../core/db';
import { countDays, formatDuration, formatHours, parseNumber } from '../../core/format';
import { heatmapStart, renderHeatmap } from '../../core/heatmap';
import { renderMarkdown } from '../../core/markdown';
import type { Cleanup } from '../../core/router';
import { getSetting, setSetting } from '../../core/settings';
import type { ScreenApp, ScreenDay, Urge, UrgeTrigger } from '../../core/types';
import { append, card, chipSelect, emptyState, field, h, icon, meter, openSheet, seg, tag, tiles, toast } from '../../core/ui';
import { indexChecks, isScheduled, progress as habitProgress } from '../habits/logic';
import { clock } from '../study/logic';
import {
  appNames,
  appTotals,
  averageMinutes,
  compareGroups,
  DAY_PARTS,
  durationToInput,
  limitStreak,
  minutesFor,
  parseDuration,
  parseScreenReply,
  screenLevel,
  TRIGGERS,
  triggerLabel,
  urgeStats,
  urgeMemory,
  weekSummary,
  COACH_SYSTEM,
  fallbackCoach,
  type Comparison,
} from './logic';

type Range = '7' | '30';
const URGE_TIMER_SECONDS = 10 * 60;
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const NO_BLOCKING_NOTE =
  'Приложение не может блокировать другие приложения и само не видит их время: iPhone этого не разрешает. ' +
  'Для настоящих ограничений включи лимиты в настройках iPhone: Настройки → Экранное время → Лимиты приложений.';

export async function render(root: HTMLElement): Promise<Cleanup> {
  let charts: Chart[] = [];
  let range: Range = '7';
  let report = '';
  let reportAbort: AbortController | null = null;

  const draw = async (): Promise<void> => {
    const [days, urges, limit] = await Promise.all([
      db.screenDays.orderBy('date').toArray(),
      db.urges.orderBy('at').reverse().toArray(),
      getSetting('screenLimitMinutes'),
    ]);
    const today = todayStr();
    const scroll = root.scrollTop;
    charts.forEach((chart) => chart.destroy());
    charts = [];
    root.replaceChildren();

    const urgeBtn = h('button', { class: 'btn btn-primary', type: 'button' }, icon('wave', 18), 'Тянет скроллить');
    urgeBtn.addEventListener('click', () => void openUrgeSheet(draw));
    const manual = h('button', { class: 'btn', type: 'button' }, icon('plus', 18), 'Внести время');
    manual.addEventListener('click', () => void openScreenDayForm({ date: today }, draw));
    const fileInput = h('input', { type: 'file', accept: 'image/*', hidden: true });
    const shot = h('button', { class: 'btn', type: 'button' }, icon('camera', 18), 'По скриншоту');
    shot.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (file) void readScreenshot(file, draw);
    });
    const actions = [urgeBtn, h('div', { class: 'btn-row' }, manual, shot), fileInput];

    if (days.length === 0 && urges.length === 0) {
      root.append(
        emptyState(
          'screen',
          'screen',
          'Экранное время',
          'Вноси время за день вручную или по скриншоту из настроек iPhone. А когда тянет скроллить - жми кнопку: запишем причину и переждём 10 минут.',
        ),
        ...actions,
        h('div', { class: 'note' }, NO_BLOCKING_NOTE),
      );
      return;
    }

    const todayRecord = days.find((day) => day.date === today);
    const average = averageMinutes(days, addDays(today, -6), today);
    root.append(
      ...actions,
      tiles([
        { label: 'сегодня', value: todayRecord ? formatHours(todayRecord.totalMinutes) : 'нет записи' },
        { label: 'среднее за 7 дней', value: average === null ? '-' : formatHours(average) },
        { label: 'ниже лимита подряд', value: limit ? countDays(limitStreak(days, limit, today)) : '-' },
      ]),
      limitCard(limit, todayRecord, draw),
    );

    if (days.length > 0) {
      root.append(
        h('h2', { class: 'section-title' }, 'Статистика'),
        seg<Range>(
          [
            { value: '7', label: 'Неделя' },
            { value: '30', label: 'Месяц' },
          ],
          range,
          (value) => {
            range = value;
            void draw();
          },
        ),
        dynamicsCard(days, limit, today, range, charts),
        appsCard(days, today, range, charts),
        yearCard(days, limit, today),
        await linksCard(days, today),
      );
    }

    root.append(urgesCard(urges, today, draw));

    // Недельный отчёт от AI
    const output = h('div', { class: 'msg-assistant slot' });
    if (report) output.append(renderMarkdown(report));
    const status = h('div', { class: 'slot' });
    const reportBtn = h('button', { class: 'btn', type: 'button' }, icon('assistant', 18), report ? 'Составить заново' : 'Составить отчёт за неделю');
    reportBtn.addEventListener('click', () => {
      if (reportAbort) {
        reportAbort.abort();
        return;
      }
      void (async () => {
        const ai = await getSetting('ai');
        const { def, cfg } = activeProvider(ai);
        const problem = navigator.onLine === false ? new Error('offline') : configProblem(def, cfg);
        if (problem) {
          status.replaceChildren(
            h(
              'div',
              { class: 'note' },
              navigator.onLine === false ? 'Нет интернета. Отчёт от AI можно составить только онлайн.' : problem.message,
              navigator.onLine === false ? null : h('a', { class: 'btn btn-sm', href: '#/settings', style: 'margin-top:8px' }, 'Открыть настройки'),
            ),
          );
          return;
        }
        status.replaceChildren();
        report = '';
        output.replaceChildren(h('div', { class: 'typing' }, h('span'), h('span'), h('span')));
        reportAbort = new AbortController();
        reportBtn.replaceChildren('Остановить');
        try {
          await streamChat(ai, {
            system: [
              'Ты помогаешь человеку меньше залипать в телефоне. Тебе дают сводку за неделю из его личного трекера.',
              'Найди закономерности: по триггерам, времени суток и дням недели. Затем дай 3-5 коротких практичных советов именно под эти данные.',
              'Не обещай блокировку приложений: трекер этого не умеет. Для жёстких ограничений можно посоветовать встроенное «Экранное время» iPhone.',
              'Если данных мало, честно скажи об этом и предложи, что записывать. Отвечай по-русски, коротко, списками, без таблиц.',
            ].join('\n'),
            messages: [{ role: 'user', content: `Сводка за неделю:\n${weekSummary(days, urges, limit, today)}\n\nСоставь недельный отчёт.` }],
            signal: reportAbort.signal,
            onDelta(delta) {
              report += delta;
              output.replaceChildren(renderMarkdown(report));
            },
          });
        } catch (err) {
          if (!(err instanceof DOMException && err.name === 'AbortError')) {
            const { message, detail } = describeError(err);
            status.replaceChildren(h('div', { class: 'note note-error' }, message, detail ? h('small', null, detail) : null));
          }
          if (!report) output.replaceChildren();
        } finally {
          reportAbort = null;
          reportBtn.replaceChildren(icon('assistant', 18), report ? 'Составить заново' : 'Составить отчёт за неделю');
        }
      })();
    });
    root.append(
      card(
        'Отчёт за неделю от AI',
        h('p', { class: 'muted small' }, 'AI получит только сводку за 7 дней: время по дням, приложения, триггеры и что ты делал вместо скролла.'),
        output,
        status,
        reportBtn,
      ),
      h('div', { class: 'note' }, NO_BLOCKING_NOTE),
    );
    root.scrollTop = scroll;
  };

  await draw();
  return () => {
    reportAbort?.abort();
    charts.forEach((chart) => chart.destroy());
  };
}

// ---------- Лимит ----------

function limitCard(limit: number | null, todayRecord: ScreenDay | undefined, redraw: () => Promise<void>): HTMLElement {
  const edit = h('button', { class: 'btn btn-sm', type: 'button' }, limit ? 'Изменить' : 'Задать');
  edit.addEventListener('click', () => openLimitForm(limit, redraw));
  const title = [h('span', { class: 'grow' }, 'Лимит в сутки'), edit];
  if (!limit) {
    return card(title, h('p', { class: 'muted small' }, 'Задай цель - например, не больше 3 часов в день. Приложение будет считать серию дней ниже лимита.'));
  }
  if (!todayRecord) {
    return card(title, h('p', { class: 'small' }, `Цель: не больше ${formatDuration(limit)} в день. За сегодня записи пока нет.`));
  }
  const over = todayRecord.totalMinutes > limit;
  return card(
    title,
    meter(todayRecord.totalMinutes / limit, 'screen'),
    h(
      'p',
      { class: 'small' },
      `Сегодня ${formatDuration(todayRecord.totalMinutes)} из ${formatDuration(limit)}. `,
      over
        ? h('strong', { style: 'color:var(--danger)' }, `Больше лимита на ${formatDuration(todayRecord.totalMinutes - limit)}.`)
        : `В запасе ${formatDuration(limit - todayRecord.totalMinutes)}.`,
    ),
  );
}

function hoursMinutes(minutes: number | null): { hours: HTMLInputElement; mins: HTMLInputElement; row: HTMLElement; read: () => number | null } {
  const hours = h('input', { class: 'input', type: 'text', inputMode: 'numeric', placeholder: '0', value: minutes === null ? '' : String(Math.floor(minutes / 60)) });
  const mins = h('input', { class: 'input', type: 'text', inputMode: 'numeric', placeholder: '0', value: minutes === null ? '' : String(minutes % 60) });
  const read = (): number | null => {
    if (hours.value.trim() === '' && mins.value.trim() === '') return null;
    const hv = hours.value.trim() === '' ? 0 : parseNumber(hours.value);
    const mv = mins.value.trim() === '' ? 0 : parseNumber(mins.value);
    if (hv === null || mv === null) return null;
    const total = Math.round(hv * 60 + mv);
    return total <= 1440 ? total : null;
  };
  return { hours, mins, row: h('div', { class: 'field-row' }, field('Часы', hours), field('Минуты', mins)), read };
}

function openLimitForm(limit: number | null, onSaved: () => Promise<void>): void {
  const time = hoursMinutes(limit);
  const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Сохранить');
  const clear = limit ? h('button', { class: 'btn btn-danger', type: 'button' }, 'Убрать лимит') : null;
  const sheet = openSheet('Лимит в сутки', [time.row, h('div', { class: 'note' }, NO_BLOCKING_NOTE), save, clear]);
  time.hours.focus();
  save.addEventListener('click', () => {
    const value = time.read();
    if (value === null || value === 0) {
      toast('Укажи время больше нуля', 'error');
      return;
    }
    void setSetting('screenLimitMinutes', value).then(() => {
      sheet.close();
      return onSaved();
    });
  });
  clear?.addEventListener('click', () => {
    void setSetting('screenLimitMinutes', null).then(() => {
      sheet.close();
      return onSaved();
    });
  });
}

// ---------- Запись за день ----------

interface DraftApp {
  name: string;
  time: string;
}

/** Форма экранного времени за день. Принимает запись или заготовку (например, числа со скриншота). */
export async function openScreenDayForm(
  source: Partial<ScreenDay> & { date: string },
  onSaved: () => Promise<void> | void,
  hint?: string,
): Promise<void> {
  const all = await db.screenDays.toArray();
  const existing = all.find((day) => day.date === source.date && source.totalMinutes === undefined) ?? null;
  const base = existing ?? source;
  const names = appNames(all);

  const date = h('input', { class: 'input', type: 'date', value: base.date, max: todayStr() });
  const time = hoursMinutes(base.totalMinutes ?? null);
  const sleep = h('input', {
    class: 'input',
    type: 'text',
    inputMode: 'decimal',
    placeholder: 'например, 7,5',
    value: base.sleepMinutes ? String(Math.round((base.sleepMinutes / 60) * 10) / 10).replace('.', ',') : '',
  });
  const draft: DraftApp[] = (base.apps ?? []).map((app) => ({ name: app.name, time: durationToInput(app.minutes) }));
  const listId = `app-names-${newId()}`;
  const datalist = h('datalist', { id: listId }, names.map((name) => h('option', { value: name })));
  const box = h('div', { class: 'stack' });

  const drawApps = (): void => {
    box.replaceChildren(
      ...draft.map((app, i) => {
        const name = h('input', { class: 'input', type: 'text', value: app.name, placeholder: 'Приложение', maxLength: 40, autocomplete: 'off' });
        name.setAttribute('list', listId);
        name.addEventListener('input', () => {
          app.name = name.value;
        });
        const value = h('input', { class: 'input', type: 'text', value: app.time, placeholder: 'ч:мм', style: 'text-align:center', 'aria-label': 'Время' });
        value.addEventListener('input', () => {
          app.time = value.value;
        });
        const remove = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Убрать приложение' }, icon('close', 18));
        remove.addEventListener('click', () => {
          draft.splice(i, 1);
          drawApps();
        });
        return h('div', { class: 'row' }, h('div', { class: 'grow' }, name), h('div', { style: 'flex:0 0 88px' }, value), remove);
      }),
    );
  };

  const addApp = h('button', { class: 'btn btn-sm', type: 'button' }, icon('plus', 16), 'Приложение');
  addApp.addEventListener('click', () => {
    draft.push({ name: '', time: '' });
    drawApps();
    box.lastElementChild?.querySelector('input')?.focus();
  });

  const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Сохранить');
  const remove = existing ? h('button', { class: 'btn btn-danger', type: 'button' }, 'Удалить запись') : null;

  const sheet = openSheet(existing ? 'Экранное время за день' : 'Внести экранное время', [
    hint ? h('div', { class: 'note note-warn' }, hint) : null,
    field('Дата', date),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Всего за день'), time.row),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'По приложениям (необязательно)'), datalist, box, addApp),
    field('Сон прошлой ночью, часов (необязательно)', sleep, 'Нужно, чтобы увидеть связь экранного времени со сном.'),
    save,
    remove,
  ]);
  drawApps();

  save.addEventListener('click', () => {
    const total = time.read();
    if (!date.value || total === null) {
      toast('Укажи дату и общее время (не больше 24 часов)', 'error');
      return;
    }
    const apps: ScreenApp[] = [];
    for (const app of draft) {
      const name = app.name.trim();
      if (!name && !app.time.trim()) continue;
      const minutes = parseDuration(app.time);
      if (!name || minutes === null) {
        toast('У приложения нужно название и время, например 1:20', 'error');
        return;
      }
      if (minutes > 0) apps.push({ name, minutes });
    }
    if (apps.reduce((sum, app) => sum + app.minutes, 0) > total) {
      toast('По приложениям получилось больше общего времени - проверь числа', 'error');
      return;
    }
    const sleepHours = sleep.value.trim() === '' ? null : parseNumber(sleep.value);
    if (sleep.value.trim() !== '' && (sleepHours === null || sleepHours > 24)) {
      toast('Сон укажи числом часов, например 7,5', 'error');
      return;
    }
    const record: ScreenDay = {
      date: date.value,
      totalMinutes: total,
      apps,
      source: source.source ?? existing?.source ?? 'manual',
      ...(sleepHours ? { sleepMinutes: Math.round(sleepHours * 60) } : {}),
    };
    void (async () => {
      // Если дату поменяли, старая запись не должна остаться.
      if (existing && existing.date !== record.date) await db.screenDays.delete(existing.date);
      await db.screenDays.put(record);
      sheet.close();
      toast('Сохранено');
      await onSaved();
    })();
  });

  remove?.addEventListener('click', () => {
    if (!existing) return;
    void db.screenDays.delete(existing.date).then(() => {
      sheet.close();
      toast('Запись удалена');
      return onSaved();
    });
  });
}

// ---------- Ввод по скриншоту ----------

/** Уменьшает картинку и переводит в JPEG: так запрос к AI быстрее и дешевле. */
async function fileToImage(file: File): Promise<ChatImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    return { mime: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function readScreenshot(file: File, onSaved: () => Promise<void>): Promise<void> {
  const today = todayStr();
  const body = h('div', { class: 'stack' });
  const controller = new AbortController();
  const sheet = openSheet('Скриншот экранного времени', body, () => controller.abort());

  const manualBtn = (): HTMLElement => {
    const button = h('button', { class: 'btn btn-primary', type: 'button' }, 'Ввести вручную');
    button.addEventListener('click', () => {
      sheet.close();
      void openScreenDayForm({ date: today }, onSaved);
    });
    return button;
  };
  const fail = (message: string, detail?: string, settingsLink = false): void => {
    body.replaceChildren();
    append(body, [
      h('div', { class: 'note note-error' }, message, detail ? h('small', null, detail) : null),
      manualBtn(),
      settingsLink ? h('a', { class: 'btn', href: '#/settings' }, 'Открыть настройки AI') : null,
    ]);
    if (settingsLink) body.querySelector('a')?.addEventListener('click', () => sheet.close());
  };

  if (navigator.onLine === false) {
    fail('Нет интернета. Распознать скриншот можно только онлайн - пока введи числа вручную.');
    return;
  }
  const ai = await getSetting('ai');
  const { def, cfg } = activeProvider(ai);
  const problem = configProblem(def, cfg);
  if (problem) {
    fail(`${problem.message} Без AI скриншот не распознать - можно ввести числа вручную.`, undefined, true);
    return;
  }

  body.replaceChildren(
    h('p', null, 'Отправляю скриншот в ', h('strong', null, def.label), ' и жду числа...'),
    h('div', { class: 'typing' }, h('span'), h('span'), h('span')),
    h('p', { class: 'muted small' }, 'Скриншот не сохраняется в приложении. Перед сохранением числа можно будет поправить.'),
  );

  let reply = '';
  try {
    const image = await fileToImage(file);
    await streamChat(ai, {
      system: 'Ты извлекаешь числа со скриншота экрана «Экранное время» (Screen Time) на iPhone. Отвечай только JSON, без пояснений.',
      messages: [
        {
          role: 'user',
          images: [image],
          content:
            'На скриншоте - экран «Экранное время» iOS. Верни JSON строго такого вида: ' +
            '{"date": "YYYY-MM-DD" или null, "total_minutes": число, "apps": [{"name": "название", "minutes": число}]}. ' +
            'total_minutes - общее время за день в минутах. apps - приложения и их время в минутах, как на экране (не больше 10). ' +
            `Сегодня ${today}; если на экране написано «Сегодня» или «Вчера», вычисли дату. ` +
            'Если на скриншоте нет экранного времени за один день, верни {"date": null, "total_minutes": null, "apps": []}. Ничего не выдумывай.',
        },
      ],
      signal: controller.signal,
      onDelta(delta) {
        reply += delta;
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return;
    const { message, detail } = describeError(err);
    fail(`Не получилось распознать скриншот. Возможно, выбранная модель не умеет читать изображения. ${message}`, detail);
    return;
  }

  const parsed = parseScreenReply(reply);
  if (!parsed) {
    fail('AI не нашёл на картинке экранное время за день. Проверь, что это скриншот из Настройки → Экранное время, или введи числа вручную.');
    return;
  }
  sheet.close();
  await openScreenDayForm(
    { date: parsed.date && parsed.date <= today ? parsed.date : today, totalMinutes: parsed.totalMinutes, apps: parsed.apps, source: 'screenshot' },
    onSaved,
    'Числа распознаны со скриншота. Проверь их и поправь, если AI ошибся, - затем сохрани.',
  );
}

// ---------- «Тянет скроллить» ----------

/** Запись тяги к скроллу и таймер на 10 минут с предложением заменить скролл привычкой. */
export async function openUrgeSheet(onSaved: () => Promise<void> | void): Promise<void> {
  let trigger: UrgeTrigger = 'boredom';
  const note = h('input', { class: 'input', type: 'text', placeholder: 'Почему тянет? Например, «не могу уснуть»', maxLength: 140 });
  const startTimer = h('button', { class: 'btn btn-primary', type: 'button' }, icon('clock', 18), 'Переждать 10 минут');
  const justSave = h('button', { class: 'btn', type: 'button' }, 'Просто записать');
  const body = h(
    'div',
    { class: 'stack' },
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Что подтолкнуло'), chipSelect(TRIGGERS, trigger, (value) => {
      trigger = value;
    })),
    note,
    startTimer,
    justSave,
    h(
      'p',
      { class: 'muted small' },
      'Приложение запомнит, когда и почему тянет. Пока идёт таймер, AI напишет пару слов поддержки на английском с учётом твоей причины и прошлых раз.',
    ),
  );
  let tick: number | undefined;
  const coachAbort = new AbortController();
  const sheet = openSheet('Тянет скроллить', body, () => {
    window.clearInterval(tick);
    coachAbort.abort();
    void onSaved();
  });

  const saveUrge = async (): Promise<Urge> => {
    const urge: Urge = { id: newId(), at: new Date().toISOString(), trigger, ...(note.value.trim() ? { note: note.value.trim() } : {}) };
    await db.urges.put(urge);
    return urge;
  };

  justSave.addEventListener('click', () => {
    void saveUrge().then(() => {
      toast('Записано');
      sheet.close();
    });
  });

  startTimer.addEventListener('click', () => {
    void (async () => {
      const urge = await saveUrge();
      const endAt = Date.now() + URGE_TIMER_SECONDS * 1000;
      const today = todayStr();
      const [habits, checks] = await Promise.all([db.habits.toArray(), db.habitChecks.where('date').equals(today).toArray()]);
      const done = new Set(checks.map((check) => check.habitId));
      const open = habits.filter((habit) => isScheduled(habit, today) && !done.has(habit.id));

      const coachBox = h('div', { class: 'note coach', lang: 'en' }, h('div', { class: 'typing' }, h('span'), h('span'), h('span')));
      const coachNote = h('p', { class: 'muted tiny slot' });
      void writeCoach(urge, open.map((habit) => habit.name), coachBox, coachNote, coachAbort.signal);

      const display = h('div', { class: 'timer' }, clock(URGE_TIMER_SECONDS));
      const caption = h('p', { class: 'muted', style: 'text-align:center' }, 'Подожди 10 минут. Если после этого всё ещё хочется - решай сам.');
      const instead = h('input', { class: 'input', type: 'text', placeholder: 'Что сделал вместо скролла', maxLength: 140 });
      const finish = h('button', { class: 'btn btn-primary', type: 'button' }, 'Готово');

      const habitBox = h('div', { class: 'chips' });
      for (const habit of open) {
        const chip = h('button', { class: 'chip-btn', type: 'button' }, habit.name);
        chip.addEventListener('click', () => {
          void db.habitChecks.put({ id: newId(), habitId: habit.id, date: today }).then(() => {
            chip.classList.add('is-active');
            chip.disabled = true;
            instead.value = instead.value ? `${instead.value}, ${habit.name}` : habit.name;
            toast(`Привычка «${habit.name}» отмечена`);
          });
        });
        habitBox.append(chip);
      }

      body.replaceChildren(
        display,
        caption,
        coachBox,
        coachNote,
        open.length
          ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Сделай вместо этого привычку - нажми, когда выполнишь'), habitBox)
          : h('p', { class: 'muted small' }, 'Идеи на 10 минут: пройтись, выпить воды, сделать разминку, написать другу.'),
        instead,
        finish,
      );

      const update = (): void => {
        const left = Math.ceil((endAt - Date.now()) / 1000);
        if (left <= 0) {
          window.clearInterval(tick);
          display.textContent = '00:00';
          caption.textContent = '10 минут прошло. Тяга ослабла? Запиши, чем занялся.';
        } else display.textContent = clock(left);
      };
      tick = window.setInterval(update, 1000);

      finish.addEventListener('click', () => {
        const text = instead.value.trim();
        void (text ? db.urges.update(urge.id, { insteadOf: text }) : Promise.resolve()).then(() => {
          toast(text ? 'Отлично, записано' : 'Записано');
          sheet.close();
        });
      });
    })();
  });
}

/**
 * Пишет текст поддержки на английском: от AI (с учётом причины и истории) или встроенный, если AI недоступен.
 * Готовый текст сохраняется в запись, чтобы его можно было перечитать.
 */
async function writeCoach(urge: Urge, openHabits: string[], box: HTMLElement, note: HTMLElement, signal: AbortSignal): Promise<void> {
  const useFallback = (reason: string): void => {
    const text = fallbackCoach(urge.trigger, Date.now() / 60_000);
    box.replaceChildren(text);
    note.textContent = reason;
    void db.urges.update(urge.id, { coach: text });
  };

  if (navigator.onLine === false) {
    useFallback('Нет интернета - показан встроенный текст. С интернетом AI учтёт твою историю.');
    return;
  }
  const ai = await getSetting('ai');
  const { def, cfg } = activeProvider(ai);
  if (configProblem(def, cfg)) {
    useFallback('Встроенный текст. Подключи AI в настройках - тогда тексты будут учитывать твою причину и прошлые разы.');
    return;
  }

  const history = await db.urges.toArray();
  let text = '';
  try {
    await streamChat(ai, {
      system: COACH_SYSTEM,
      messages: [
        {
          role: 'user',
          content:
            urgeMemory(history, urge, new Date()) +
            '\n' +
            (openHabits.length ? `Open habits for today: ${openHabits.join(', ')}.` : 'No open habits for today.') +
            '\nWrite the message now.',
        },
      ],
      signal,
      onDelta(delta) {
        text += delta;
        box.replaceChildren(text);
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      if (text.trim()) void db.urges.update(urge.id, { coach: text.trim() });
      return;
    }
    useFallback(`AI сейчас недоступен (${describeError(err).message}) - показан встроенный текст.`);
    return;
  }
  if (!text.trim()) {
    useFallback('AI ответил пустым текстом - показан встроенный.');
    return;
  }
  note.textContent = 'Текст от AI с учётом твоей причины и прошлых раз.';
  await db.urges.update(urge.id, { coach: text.trim() });
}

function openUrgeEdit(urge: Urge, onSaved: () => Promise<void>): void {
  let trigger = urge.trigger;
  const note = h('input', { class: 'input', type: 'text', value: urge.note ?? '', placeholder: 'Почему тянуло', maxLength: 140 });
  const instead = h('input', { class: 'input', type: 'text', value: urge.insteadOf ?? '', placeholder: 'Что сделал вместо скролла', maxLength: 140 });
  const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Сохранить');
  const remove = h('button', { class: 'btn btn-danger', type: 'button' }, 'Удалить запись');
  const sheet = openSheet(formatDateTime(urge.at), [
    chipSelect(TRIGGERS, trigger, (value) => {
      trigger = value;
    }),
    field('Почему тянуло', note),
    field('Вместо скролла', instead),
    urge.coach ? h('div', { class: 'note coach', lang: 'en' }, urge.coach) : null,
    save,
    remove,
  ]);
  save.addEventListener('click', () => {
    const record: Urge = {
      id: urge.id,
      at: urge.at,
      trigger,
      ...(note.value.trim() ? { note: note.value.trim() } : {}),
      ...(instead.value.trim() ? { insteadOf: instead.value.trim() } : {}),
      ...(urge.coach ? { coach: urge.coach } : {}),
    };
    void db.urges.put(record).then(() => {
      sheet.close();
      return onSaved();
    });
  });
  remove.addEventListener('click', () => {
    void db.urges.delete(urge.id).then(() => {
      sheet.close();
      return onSaved();
    });
  });
}

function urgesCard(urges: Urge[], today: string, redraw: () => Promise<void>): HTMLElement {
  if (urges.length === 0) {
    return card('Тянет скроллить', h('p', { class: 'muted small' }, 'Записей пока нет. Когда потянет открыть ленту - нажми кнопку вверху экрана.'));
  }
  const from = new Date(`${addDays(today, -29)}T00:00:00`).toISOString();
  const stats = urgeStats(urges.filter((urge) => urge.at >= from));
  const maxPart = Math.max(1, ...stats.byPart);
  const maxDay = Math.max(1, ...stats.byWeekday);
  const bars = (labels: string[], values: number[], max: number): HTMLElement =>
    h(
      'div',
      { class: 'compare m-screen' },
      labels.flatMap((label, i) => [
        h('span', { class: 'muted' }, label),
        h('span', null, h('span', { class: 'bar', style: `display:block;width:${((values[i] ?? 0) / max) * 100}%` })),
        h('span', { class: 'row-side' }, String(values[i] ?? 0)),
      ]),
    );
  const rows = urges.slice(0, 5).map((urge) => {
    const row = h(
      'button',
      { class: 'list-row', type: 'button' },
      h(
        'span',
        { class: 'grow' },
        h('div', { class: 'row' }, h('span', { class: 'row-title' }, formatDateTime(urge.at)), tag(triggerLabel(urge.trigger), 'screen')),
        urge.note ? h('div', { class: 'muted small' }, `Почему: ${urge.note}`) : null,
        urge.insteadOf ? h('div', { class: 'muted small' }, `Вместо этого: ${urge.insteadOf}`) : null,
      ),
      h('span', { class: 'chev' }, icon('chevron', 18)),
    );
    row.addEventListener('click', () => openUrgeEdit(urge, redraw));
    return row;
  });
  return card(
    'Тянет скроллить',
    h(
      'p',
      { class: 'small' },
      `За 30 дней: ${stats.total}. Удалось заменить другим делом: ${stats.replaced}.`,
    ),
    stats.byTrigger.length
      ? h('div', { class: 'row-wrap' }, stats.byTrigger.map((item) => tag(`${item.label} · ${item.count}`, 'screen')))
      : null,
    stats.total > 0 ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'По времени суток'), bars(DAY_PARTS, stats.byPart, maxPart)) : null,
    stats.total > 0 ? h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'По дням недели'), bars(WEEKDAYS, stats.byWeekday, maxDay)) : null,
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, 'Последние записи'), h('div', { class: 'list' }, rows)),
  );
}

// ---------- Диаграммы ----------

function dynamicsCard(days: ScreenDay[], limit: number | null, today: string, range: Range, charts: Chart[]): HTMLElement {
  const dates = dateRange(addDays(today, -(Number(range) - 1)), today);
  const values = minutesFor(days, dates);
  const { box, canvas } = chartBox(190, 'Экранное время по дням, часы');
  mountChart(canvas, charts, () =>
    barChart(canvas, {
      labels: dates.map((date) => (range === '7' ? (WEEKDAYS[isoWeekday(date) - 1] ?? '') : formatDayShort(date))),
      series: [{ label: 'Экранное время', values: values.map((value) => (value === null ? null : Math.round((value / 60) * 100) / 100)), color: cssVar('--c-screen') }],
      ...(limit ? { limit: limit / 60 } : {}),
      formatTick: (value) => `${value} ч`,
      tooltipTitle: (i) => formatDay(dates[i] ?? today),
      tooltipValue: (_, i) => (values[i] === null || values[i] === undefined ? 'Нет записи' : formatDuration(values[i] ?? 0)),
    }),
  );
  return card(
    range === '7' ? 'Динамика за неделю' : 'Динамика за месяц',
    limit ? h('p', { class: 'muted small' }, `Пунктир - лимит ${formatDuration(limit)}.`) : null,
    box,
    dataTable(
      ['День', 'Время'],
      dates.map((date, i) => [formatDay(date), values[i] === null || values[i] === undefined ? '-' : formatDuration(values[i] ?? 0)]),
    ),
  );
}

function appsCard(days: ScreenDay[], today: string, range: Range, charts: Chart[]): HTMLElement {
  const apps = appTotals(days, addDays(today, -(Number(range) - 1)), today);
  if (apps.length === 0) {
    return card('По приложениям', h('p', { class: 'muted small' }, 'За этот период время по приложениям не вносилось.'));
  }
  const { box, canvas } = chartBox(Math.max(110, apps.length * 36 + 40), 'Экранное время по приложениям');
  mountChart(canvas, charts, () =>
    barChart(canvas, {
      horizontal: true,
      labels: apps.map((app) => (app.name.length > 14 ? `${app.name.slice(0, 13)}…` : app.name)),
      series: [{ label: 'Время', values: apps.map((app) => Math.round((app.minutes / 60) * 10) / 10), color: cssVar('--c-screen') }],
      formatTick: (value) => `${value} ч`,
      tooltipTitle: (i) => apps[i]?.name ?? '',
      tooltipValue: (_, i) => formatDuration(apps[i]?.minutes ?? 0),
    }),
  );
  return card(
    'По приложениям',
    box,
    dataTable(
      ['Приложение', 'Время'],
      apps.map((app) => [app.name, formatDuration(app.minutes)]),
    ),
  );
}

function yearCard(days: ScreenDay[], limit: number | null, today: string): HTMLElement {
  const byDate = new Map(days.map((day) => [day.date, day.totalMinutes]));
  const max = Math.max(1, ...days.map((day) => day.totalMinutes));
  const cells = dateRange(heatmapStart(today), today).map((date) => {
    const minutes = byDate.get(date);
    return {
      date,
      level: minutes === undefined ? -1 : screenLevel(minutes, limit, max),
      text: minutes === undefined ? 'Нет записи' : formatDuration(minutes),
    };
  });
  return card(
    'Год',
    h('p', { class: 'muted small' }, 'Чем насыщеннее цвет клетки, тем больше экранного времени в этот день. Пустая рамка - записи нет.'),
    renderHeatmap(cells, 'screen', ['меньше', 'больше']),
  );
}

/** Связь экранного времени с тренировками, привычками и сном (за 90 дней). */
async function linksCard(days: ScreenDay[], today: string): Promise<HTMLElement> {
  const from = addDays(today, -89);
  const recent = days.filter((day) => day.date >= from);
  const [workouts, habits, checks] = await Promise.all([
    db.workouts.where('date').aboveOrEqual(from).toArray(),
    db.habits.toArray(),
    db.habitChecks.where('date').aboveOrEqual(from).toArray(),
  ]);
  const workoutDays = new Set(workouts.map((workout) => workout.date));
  const index = indexChecks(checks);

  const block = (title: string, yesLabel: string, noLabel: string, result: Comparison): HTMLElement => {
    if (!result.enough) {
      return h('div', { class: 'field' }, h('span', { class: 'row-title' }, title), h('span', { class: 'muted small' }, 'Мало данных: нужно хотя бы по 3 дня в каждой группе.'));
    }
    const max = Math.max(result.yes.average, result.no.average, 1);
    return h(
      'div',
      { class: 'field' },
      h('span', { class: 'row-title' }, title),
      h(
        'div',
        { class: 'compare m-screen' },
        h('span', { class: 'muted' }, `${yesLabel} (${result.yes.days} дн.)`),
        h('span', null, h('span', { class: 'bar', style: `display:block;width:${(result.yes.average / max) * 100}%` })),
        h('span', { class: 'row-side' }, formatHours(result.yes.average)),
        h('span', { class: 'muted' }, `${noLabel} (${result.no.days} дн.)`),
        h('span', null, h('span', { class: 'bar is-alt', style: `display:block;width:${(result.no.average / max) * 100}%` })),
        h('span', { class: 'row-side' }, formatHours(result.no.average)),
      ),
    );
  };

  return card(
    'Связь с тренировками, привычками и сном',
    h('p', { class: 'muted small' }, 'Среднее экранное время в разные дни за последние 90 дней.'),
    block(
      'Тренировки',
      'С тренировкой',
      'Без',
      compareGroups(recent.map((day) => ({ minutes: day.totalMinutes, flag: workoutDays.has(day.date) }))),
    ),
    block(
      'Привычки',
      'Все выполнены',
      'Не все',
      compareGroups(
        recent.map((day) => {
          const p = habitProgress(habits, index, day.date, day.date);
          return { minutes: day.totalMinutes, flag: p.scheduled === 0 ? null : p.done === p.scheduled };
        }),
      ),
    ),
    block(
      'Сон',
      'От 7 часов',
      'Меньше 7',
      compareGroups(recent.map((day) => ({ minutes: day.totalMinutes, flag: day.sleepMinutes ? day.sleepMinutes >= 420 : null }))),
    ),
    h('p', { class: 'muted tiny' }, 'Это совпадения в твоих записях, а не доказанные причины.'),
  );
}
