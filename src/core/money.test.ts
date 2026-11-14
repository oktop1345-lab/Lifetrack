import { describe, expect, it } from 'vitest';
import { formatMoney, formatMoneyShort, moneyToInput, parseMoney } from './money';

// Intl ставит неразрывные пробелы - для сравнения заменяем их обычными.
const plain = (text: string): string => text.replace(/[  ]/g, ' ');

describe('formatMoney', () => {
  it('показывает сумму без копеек, если их нет', () => {
    expect(plain(formatMoney(1250000, 'KZT'))).toBe('12 500 ₸');
    expect(plain(formatMoney(0, 'KZT'))).toBe('0 ₸');
  });

  it('показывает копейки, если они есть', () => {
    expect(plain(formatMoney(9990, 'RUB'))).toBe('99,9 ₽');
  });

  it('короткая запись для осей', () => {
    expect(plain(formatMoneyShort(1250000))).toBe('12,5 тыс.');
    expect(plain(formatMoneyShort(50000))).toBe('500');
  });
});

describe('parseMoney', () => {
  it('понимает пробелы, запятую и точку', () => {
    expect(parseMoney('12 500')).toBe(1250000);
    expect(parseMoney('99,90')).toBe(9990);
    expect(parseMoney('1.5')).toBe(150);
    expect(parseMoney(' 7 ')).toBe(700);
  });

  it('не теряет копейки из-за дробной арифметики', () => {
    expect(parseMoney('19,99')).toBe(1999);
    expect(parseMoney('0,07')).toBe(7);
  });

  it('отклоняет пустое, отрицательное, ноль и текст', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('0')).toBeNull();
    expect(parseMoney('-5')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('1,234')).toBeNull();
  });

  it('moneyToInput и parseMoney обратны друг другу', () => {
    expect(parseMoney(moneyToInput(1250000))).toBe(1250000);
    expect(parseMoney(moneyToInput(9990))).toBe(9990);
  });
});
