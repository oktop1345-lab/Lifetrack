// Работа с датами. День хранится строкой 'YYYY-MM-DD' в местном времени.

const pad = (n: number): string => String(n).padStart(2, '0');

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr(now: Date = new Date()): string {
  return toDateStr(now);
}

/** 'YYYY-MM-DD' -> Date в полдень местного времени (полдень защищает от сдвигов при переводе часов). */
export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12);
}

export function addDays(s: string, days: number): string {
  const d = parseDate(s);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

/** Сколько дней от a до b (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}

/** День недели: 1 = Пн ... 7 = Вс. */
export function isoWeekday(s: string): number {
  const wd = parseDate(s).getDay();
  return wd === 0 ? 7 : wd;
}

/** Понедельник той недели, в которую попадает день. */
export function startOfWeek(s: string): string {
  return addDays(s, 1 - isoWeekday(s));
}

/** 'YYYY-MM' для дня. */
export function monthKey(s: string): string {
  return s.slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y ?? 1970, (m ?? 1) - 1 + n, 1, 12);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Сколько дней в месяце 'YYYY-MM'. */
export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y ?? 1970, m ?? 1, 0).getDate();
}

/** Первый и последний день месяца 'YYYY-MM'. */
export function monthBounds(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: `${month}-${pad(daysInMonth(month))}` };
}

const monthFmt = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
const monthShortFmt = new Intl.DateTimeFormat('ru-RU', { month: 'short' });

/** '2026-11' -> 'Ноябрь 2026' */
export function formatMonth(month: string): string {
  const text = monthFmt.format(parseDate(`${month}-01`)).replace(/\s*г\.$/, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** '2026-11' -> 'ноя' */
export function formatMonthShort(month: string): string {
  return monthShortFmt.format(parseDate(`${month}-01`)).replace('.', '');
}

/** '9 ноя' - короткая подпись дня для осей диаграмм. */
export function formatDayShort(s: string): string {
  return `${parseDate(s).getDate()} ${formatMonthShort(monthKey(s))}`;
}

/** Все дни от from до to включительно. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const dayWeekFmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
const dateTimeFmt = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});

/** '13 ноября' */
export function formatDay(s: string): string {
  return dayFmt.format(parseDate(s));
}

/** 'пятница, 13 ноября' */
export function formatDayLong(s: string): string {
  return dayWeekFmt.format(parseDate(s));
}

/** ISO-момент -> '13 ноября, 16:40' */
export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso));
}
