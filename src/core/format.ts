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
