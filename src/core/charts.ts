// Общая настройка Chart.js: подключаем только нужные части, цвета берём из темы приложения.

import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  DoughnutController,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { h } from './ui';

Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
);

/** Значение CSS-переменной темы, например cssVar('--c-habits'). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Цвет категории по её номеру (0..7). null - серый цвет для «Прочее». */
export function seriesColor(slot: number | null): string {
  return cssVar(slot === null ? '--series-other' : `--series-${(slot % 8) + 1}`);
}

interface ChartTheme {
  muted: string;
  grid: string;
  axis: string;
  surface: string;
  tooltipBg: string;
  tooltipText: string;
  font: string;
}

function chartTheme(): ChartTheme {
  return {
    muted: cssVar('--chart-muted'),
    grid: cssVar('--chart-grid'),
    axis: cssVar('--chart-axis'),
    surface: cssVar('--surface'),
    tooltipBg: cssVar('--text'),
    tooltipText: cssVar('--bg'),
    font: cssVar('--font'),
  };
}

function tooltipStyle(theme: ChartTheme, showColors: boolean) {
  return {
    displayColors: showColors,
    boxWidth: 8,
    boxHeight: 8,
    boxPadding: 4,
    backgroundColor: theme.tooltipBg,
    titleColor: theme.tooltipText,
    bodyColor: theme.tooltipText,
    titleFont: { family: theme.font, size: 12, weight: 'normal' as const },
    bodyFont: { family: theme.font, size: 13, weight: 'bold' as const },
    padding: 10,
    cornerRadius: 8,
  };
}

function tickFont(theme: ChartTheme): { family: string; size: number } {
  return { family: theme.font, size: 11 };
}

/** Контейнер фиксированной высоты с холстом внутри (Chart.js подгоняет холст под контейнер). */
export function chartBox(height: number, label: string): { box: HTMLElement; canvas: HTMLCanvasElement } {
  const canvas = h('canvas', { role: 'img', 'aria-label': label });
  const box = h('div', { class: 'chart-box', style: `height:${height}px` }, canvas);
  return { box, canvas };
}

/**
 * Создаёт диаграмму после вставки холста на страницу (до этого у него нет размеров)
 * и кладёт её в список, чтобы экран мог уничтожить её при перерисовке.
 */
export function mountChart(canvas: HTMLCanvasElement, charts: Chart[], create: () => Chart): void {
  requestAnimationFrame(() => {
    if (canvas.isConnected) charts.push(create());
  });
}

/** Раскрывающаяся таблица с теми же числами, что на диаграмме. */
export function dataTable(headers: string[], rows: (string | number)[][]): HTMLElement {
  return h(
    'details',
    { class: 'chart-table' },
    h('summary', null, 'Показать числа'),
    h(
      'table',
      null,
      h('thead', null, h('tr', null, headers.map((text) => h('th', null, text)))),
      h(
        'tbody',
        null,
        rows.map((row) => h('tr', null, row.map((cell) => h('td', null, String(cell))))),
      ),
    ),
  );
}

export interface BarSeries {
  label: string;
  /** null - за эту точку данных нет (столбец не рисуется). */
  values: (number | null)[];
  /** Обычный CSS-цвет. */
  color: string;
}

export interface BarChartOptions {
  labels: string[];
  series: BarSeries[];
  /** Горизонтальные полосы (удобно для длинных названий). */
  horizontal?: boolean;
  /** Верхняя граница оси, если она известна заранее (например, 100 для процентов). */
  max?: number;
  /** Горизонтальная пунктирная линия-порог (например, лимит). */
  limit?: number;
  formatTick?: (value: number) => string;
  /** Заголовок подсказки по номеру столбца и текст значения. */
  tooltipTitle?: (index: number) => string;
  tooltipValue?: (seriesIndex: number, index: number) => string;
}

/** Столбчатая диаграмма: одна серия или несколько рядом. */
export function barChart(canvas: HTMLCanvasElement, opts: BarChartOptions): Chart {
  const theme = chartTheme();
  const multi = opts.series.length > 1;
  const valueAxis = {
    beginAtZero: true,
    max: opts.max,
    grid: { color: theme.grid, drawTicks: false },
    border: { display: false },
    ticks: {
      color: theme.muted,
      font: tickFont(theme),
      padding: 8,
      maxTicksLimit: 5,
      callback: (value: string | number) => (opts.formatTick ? opts.formatTick(Number(value)) : String(value)),
    },
  };
  const categoryAxis = {
    grid: { display: false },
    border: { color: theme.axis },
    ticks: { color: theme.muted, font: tickFont(theme), maxRotation: 0, autoSkip: !opts.horizontal, autoSkipPadding: 10 },
  };
  const round = 4;
  const limitLine =
    opts.limit === undefined
      ? []
      : [
          {
            type: 'line',
            label: 'limit',
            data: opts.labels.map(() => opts.limit),
            borderColor: cssVar('--text-3'),
            borderWidth: 1.5,
            borderDash: [5, 4],
            pointRadius: 0,
            pointHoverRadius: 0,
          } as never,
        ];
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: opts.labels,
      datasets: [...opts.series.map((series) => ({
        label: series.label,
        data: series.values,
        backgroundColor: series.color,
        borderRadius: opts.horizontal
          ? { topRight: round, bottomRight: round, topLeft: 0, bottomLeft: 0 }
          : { topLeft: round, topRight: round, bottomLeft: 0, bottomRight: 0 },
        borderSkipped: false,
        maxBarThickness: multi ? 16 : 24,
        categoryPercentage: 0.8,
        barPercentage: multi ? 0.9 : 0.85,
      })), ...limitLine],
    },
    options: {
      indexAxis: opts.horizontal ? 'y' : 'x',
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      // Подсказка появляется при касании всей колонки, а не только самого столбца.
      interaction: { mode: 'index', intersect: false, axis: opts.horizontal ? 'y' : 'x' },
      layout: { padding: { top: 6, right: opts.horizontal ? 8 : 0 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle(theme, multi),
          filter: (item) => item.dataset.label !== 'limit',
          callbacks: {
            title: (items) => {
              const index = items[0]?.dataIndex ?? 0;
              return opts.tooltipTitle?.(index) ?? opts.labels[index] ?? '';
            },
            label: (item) => {
              const text = opts.tooltipValue?.(item.datasetIndex, item.dataIndex) ?? String(item.raw);
              return multi ? `${item.dataset.label ?? ''}: ${text}` : text;
            },
          },
        },
      },
      scales: opts.horizontal ? { x: valueAxis, y: categoryAxis } : { x: categoryAxis, y: valueAxis },
    },
  });
}

export interface LineChartOptions {
  labels: string[];
  values: number[];
  color: string;
  formatTick?: (value: number) => string;
  tooltipTitle?: (index: number) => string;
  tooltipValue?: (index: number) => string;
}

/** Линия с точками: изменение одной величины во времени. */
export function lineChart(canvas: HTMLCanvasElement, opts: LineChartOptions): Chart {
  const theme = chartTheme();
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: opts.labels,
      datasets: [
        {
          data: opts.values,
          borderColor: opts.color,
          borderWidth: 2,
          borderJoinStyle: 'round',
          borderCapStyle: 'round',
          tension: 0,
          pointRadius: opts.values.length > 24 ? 0 : 4,
          pointHoverRadius: 5,
          pointBackgroundColor: opts.color,
          pointBorderColor: theme.surface,
          pointBorderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 8, right: 8 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle(theme, false),
          callbacks: {
            title: (items) => {
              const index = items[0]?.dataIndex ?? 0;
              return opts.tooltipTitle?.(index) ?? opts.labels[index] ?? '';
            },
            label: (item) => opts.tooltipValue?.(item.dataIndex) ?? String(item.raw),
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: theme.axis },
          ticks: { color: theme.muted, font: tickFont(theme), maxRotation: 0, autoSkip: true, autoSkipPadding: 14 },
        },
        y: {
          grace: '10%',
          grid: { color: theme.grid, drawTicks: false },
          border: { display: false },
          ticks: {
            color: theme.muted,
            font: tickFont(theme),
            padding: 8,
            maxTicksLimit: 5,
            callback: (value) => (opts.formatTick ? opts.formatTick(Number(value)) : String(value)),
          },
        },
      },
    },
  });
}

export interface DoughnutOptions {
  labels: string[];
  values: number[];
  colors: string[];
  tooltipValue?: (index: number) => string;
}

/** Кольцо: доли целого. Между сегментами оставлен зазор цвета фона. */
export function doughnutChart(canvas: HTMLCanvasElement, opts: DoughnutOptions): Chart {
  const theme = chartTheme();
  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: opts.labels,
      datasets: [
        {
          data: opts.values,
          backgroundColor: opts.colors,
          borderColor: theme.surface,
          borderWidth: opts.values.length > 1 ? 2 : 0,
          hoverOffset: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      aspectRatio: 1,
      animation: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          ...tooltipStyle(theme, true),
          callbacks: {
            title: () => '',
            label: (item) => `${item.label}: ${opts.tooltipValue?.(item.dataIndex) ?? String(item.raw)}`,
          },
        },
      },
    },
  });
}

/** Кольцо с числом в центре, готовое для вставки в карточку. */
export function donutBlock(
  charts: Chart[],
  label: string,
  center: { value: string; caption: string },
  opts: DoughnutOptions,
): HTMLElement {
  const canvas = h('canvas', { role: 'img', 'aria-label': label });
  mountChart(canvas, charts, () => doughnutChart(canvas, opts));
  return h(
    'div',
    { class: 'donut' },
    canvas,
    h('div', { class: 'donut-center' }, h('strong', null, center.value), h('span', null, center.caption)),
  );
}
