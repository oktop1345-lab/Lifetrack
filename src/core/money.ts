// Деньги хранятся целым числом в минимальных единицах (тиыны, копейки, центы).

const formatters = new Map<string, Intl.NumberFormat>();

function formatter(currency: string): Intl.NumberFormat {
  let fmt = formatters.get(currency);
  if (!fmt) {
    fmt = new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currencyDisplay: 'narrowSymbol',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
    formatters.set(currency, fmt);
  }
  return fmt;
}

/** 1250000 -> '12 500 ₸'. Копейки показываются, только если они есть. */
export function formatMoney(minor: number, currency: string): string {
  return formatter(currency).format(minor / 100);
}

const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });

/** Короткая запись для осей диаграмм: 1250000 -> '12,5 тыс.' (без знака валюты). */
export function formatMoneyShort(minor: number): string {
  return compact.format(minor / 100);
}

/**
 * Разбирает то, что человек ввёл в поле суммы: '12 500', '99,90', '1.5'.
 * Возвращает сумму в минимальных единицах или null, если это не положительное число.
 */
export function parseMoney(text: string): number | null {
  const clean = text.replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const minor = Math.round(Number(clean) * 100);
  return minor > 0 ? minor : null;
}

/** Сумма для подстановки в поле ввода: 1250000 -> '12500', 9990 -> '99.9'. */
export function moneyToInput(minor: number): string {
  return String(minor / 100);
}
