// Общая настройка Chart.js: подключаем только нужные части, цвета берём из темы приложения.

import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js';
import { h } from './ui';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

/** Значение CSS-переменной темы, например cssVar('--c-habits'). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

interface ChartTheme {
  muted: string;
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipText: string;
  font: string;
}

function chartTheme(): ChartTheme {
  return {
    muted: cssVar('--chart-muted'),
    grid: cssVar('--chart-grid'),
    axis: cssVar('--chart-axis'),
    tooltipBg: cssVar('--text'),
    tooltipText: cssVar('--bg'),
    font: cssVar('--font'),
  };
}

/** Контейнер фиксированной высоты с холстом внутри (Chart.js подгоняет холст под контейнер). */
export function chartBox(height: number, label: string): { box: HTMLElement; canvas: HTMLCanvasElement } {
  const canvas = h('canvas', { role: 'img', 'aria-label': label });
  const box = h('div', { class: 'chart-box', style: `height:${height}px` }, canvas);
  return { box, canvas };
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

export interface BarChartOptions {
  labels: string[];
  values: number[];
  /** Цвет столбцов (обычный CSS-цвет). */
  color: string;
  /** Верхняя граница оси, если она известна заранее (например, 100 для процентов). */
  max?: number;
  formatTick?: (value: number) => string;
  /** Заголовок и текст подсказки по номеру столбца. */
  tooltipTitle?: (index: number) => string;
  tooltipValue?: (index: number) => string;
}

/** Столбчатая диаграмма с одной серией. Вернувшийся объект нужно уничтожить (destroy) при уходе с экрана. */
export function barChart(canvas: HTMLCanvasElement, opts: BarChartOptions): Chart {
  const theme = chartTheme();
  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: opts.labels,
      datasets: [
        {
          data: opts.values,
          backgroundColor: opts.color,
          borderRadius: { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 },
          borderSkipped: false,
          maxBarThickness: 24,
          categoryPercentage: 0.8,
          barPercentage: 0.85,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      // Подсказка появляется при касании всей колонки, а не только самого столбца.
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 6 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          backgroundColor: theme.tooltipBg,
          titleColor: theme.tooltipText,
          bodyColor: theme.tooltipText,
          titleFont: { family: theme.font, size: 12, weight: 'normal' },
          bodyFont: { family: theme.font, size: 14, weight: 'bold' },
          padding: 10,
          cornerRadius: 10,
          callbacks: {
            title: (items) => {
              const index = items[0]?.dataIndex ?? 0;
              return opts.tooltipTitle?.(index) ?? opts.labels[index] ?? '';
            },
            label: (item) => opts.tooltipValue?.(item.dataIndex) ?? String(item.parsed.y),
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: theme.axis },
          ticks: {
            color: theme.muted,
            font: { family: theme.font, size: 11 },
            maxRotation: 0,
            autoSkip: true,
            autoSkipPadding: 10,
          },
        },
        y: {
          beginAtZero: true,
          max: opts.max,
          grid: { color: theme.grid, drawTicks: false },
          border: { display: false },
          ticks: {
            color: theme.muted,
            font: { family: theme.font, size: 11 },
            padding: 8,
            maxTicksLimit: 5,
            callback: (value) => (opts.formatTick ? opts.formatTick(Number(value)) : String(value)),
          },
        },
      },
    },
  });
}
