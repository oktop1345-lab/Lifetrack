// Оформление чисел и слов для интерфейса.

/** Выбирает форму слова по числу: plural(5, ['день', 'дня', 'дней']) -> 'дней'. */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

/** '5 дней' */
export function countDays(n: number): string {
  return `${n} ${plural(n, ['день', 'дня', 'дней'])}`;
}

/** Доля 0..1 -> '83%'. Для пустого знаменателя - прочерк. */
export function percent(part: number, whole: number): string {
  if (whole <= 0) return '-';
  return `${Math.round((part / whole) * 100)}%`;
}

/** Минуты -> '1 ч 25 мин', '45 мин', '2 ч'. */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} мин`;
  return rest === 0 ? `${hours} ч` : `${hours} ч ${rest} мин`;
}

/** Короткая запись для плиток: до часа - '45 мин', дальше - '7,5 ч'. */
export function formatHours(minutes: number): string {
  if (minutes < 60) return `${Math.max(0, Math.round(minutes))} мин`;
  return `${String(Math.round((minutes / 60) * 10) / 10).replace('.', ',')} ч`;
}

const numberFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

/** Число с пробелами между разрядами: 4250 -> '4 250'. */
export function formatNumber(value: number): string {
  return numberFmt.format(value);
}

/** Разбирает число из поля ввода ('7,5' или '7.5'). Пустое или неверное - null. */
export function parseNumber(text: string): number | null {
  const clean = text.replace(/[\s\u00a0]/g, '').replace(',', '.');
  if (clean === '' || !/^\d+(\.\d+)?$/.test(clean)) return null;
  return Number(clean);
}
