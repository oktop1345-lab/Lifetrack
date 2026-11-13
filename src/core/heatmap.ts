// Тепловая карта по дням (как календарь активности): столбец - неделя, строка - день недели.

import { addDays, formatDay, parseDate, startOfWeek } from './dates';
import { h } from './ui';

export interface HeatCell {
  date: string;
  /** -1 - нет данных/не запланировано, 0 - пусто, 1..4 - интенсивность. */
  level: number;
  /** Текст для выбранного дня, например '3 из 4'. */
  text: string;
}

const CELL = 14;
const GAP = 3;
const STEP = CELL + GAP;
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** С какого понедельника начинать карту, чтобы она покрыла `weeks` недель до сегодняшней включительно. */
export function heatmapStart(today: string, weeks = 53): string {
  return addDays(startOfWeek(today), -7 * (weeks - 1));
}

/**
 * Строит карту. `cells` - дни подряд, начиная с понедельника (см. heatmapStart) и до сегодня.
 * `ramp` - имя набора цветов из CSS (например 'habits' -> переменные --heat-habits-1..4).
 */
export function renderHeatmap(cells: HeatCell[], ramp: string, legend: [string, string]): HTMLElement {
  const grid = h('div', { class: 'heat-grid' });
  const months = h('div', { class: 'heat-months' });
  const readout = h('p', { class: 'heat-readout', 'aria-live': 'polite' });
  const nodes: HTMLElement[] = [];

  cells.forEach((cell) => {
    const node = h('div', { class: 'heat-cell', 'data-l': String(cell.level) });
    nodes.push(node);
    grid.append(node);
  });
  for (const label of monthLabels(cells.map((cell) => cell.date))) {
    months.append(h('span', { style: `left:${label.column * STEP}px` }, label.text));
  }

  let selected = -1;
  const select = (index: number): void => {
    const cell = cells[index];
    if (!cell) return;
    nodes[selected]?.classList.remove('is-selected');
    selected = index;
    nodes[index]?.classList.add('is-selected');
    readout.replaceChildren(h('strong', null, cell.text), ` - ${formatDay(cell.date)}`);
  };

  // Касание считается по координатам, а не по самой клетке: попасть пальцем в 14 пикселей трудно.
  grid.addEventListener('click', (event) => {
    const box = grid.getBoundingClientRect();
    const col = Math.floor((event.clientX - box.left) / STEP);
    const row = Math.min(6, Math.max(0, Math.floor((event.clientY - box.top) / STEP)));
    const index = Math.min(cells.length - 1, Math.max(0, col * 7 + row));
    select(index);
  });

  const scroll = h('div', { class: 'heat-scroll' }, months, grid);
  const days = h(
    'div',
    { class: 'heat-days', 'aria-hidden': 'true' },
    ['Пн', '', 'Ср', '', 'Пт', '', ''].map((label) => h('span', null, label)),
  );

  const scale = h(
    'div',
    { class: 'heat-legend' },
    legend[0],
    [0, 1, 2, 3, 4].map((level) => h('span', { class: 'heat-cell', 'data-l': String(level) })),
    legend[1],
  );

  const root = h(
    'div',
    { class: 'heat', style: rampStyle(ramp) },
    h('div', { class: 'heat-body' }, days, scroll),
    h('div', { class: 'heat-foot' }, readout, scale),
  );

  select(cells.length - 1);
  // Показываем последние недели: прокручиваем вправо после вставки на страницу.
  requestAnimationFrame(() => {
    scroll.scrollLeft = scroll.scrollWidth;
  });
  return root;
}

function rampStyle(ramp: string): string {
  return [1, 2, 3, 4].map((step) => `--heat-${step}:var(--heat-${ramp}-${step})`).join(';');
}

/**
 * Подписи месяцев над картой: месяц подписан над первой неделей, которая в нём начинается.
 * `dates` - дни подряд, начиная с понедельника. Возвращает номер столбца (недели) и текст.
 */
export function monthLabels(dates: string[]): { column: number; text: string }[] {
  const out: { column: number; text: string }[] = [];
  let prevMonth = -1;
  for (let i = 0; i < dates.length; i += 7) {
    const date = dates[i];
    if (!date) continue;
    const month = parseDate(date).getMonth();
    if (month !== prevMonth) {
      // Если первая неделя - хвост прошлого месяца, её подпись наехала бы на следующую: заменяем.
      const last = out[out.length - 1];
      if (last && i / 7 - last.column < 2) out.pop();
      out.push({ column: i / 7, text: MONTHS[month] ?? '' });
    }
    prevMonth = month;
  }
  return out;
}
