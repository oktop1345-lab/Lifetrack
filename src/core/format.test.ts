import { describe, expect, it } from 'vitest';
import { countDays, formatDuration, formatHours, parseNumber, percent, plural } from './format';

describe('plural', () => {
  const forms: [string, string, string] = ['день', 'дня', 'дней'];
  it('выбирает правильную форму', () => {
    expect(plural(1, forms)).toBe('день');
    expect(plural(2, forms)).toBe('дня');
    expect(plural(5, forms)).toBe('дней');
    expect(plural(11, forms)).toBe('дней');
    expect(plural(21, forms)).toBe('день');
    expect(plural(104, forms)).toBe('дня');
    expect(plural(112, forms)).toBe('дней');
    expect(plural(0, forms)).toBe('дней');
  });
  it('countDays склеивает число и слово', () => {
    expect(countDays(3)).toBe('3 дня');
  });
});

describe('percent', () => {
  it('округляет и не делит на ноль', () => {
    expect(percent(5, 6)).toBe('83%');
    expect(percent(0, 4)).toBe('0%');
    expect(percent(0, 0)).toBe('-');
  });
});

describe('formatDuration', () => {
  it('пишет часы и минуты по-человечески', () => {
    expect(formatDuration(45)).toBe('45 мин');
    expect(formatDuration(60)).toBe('1 ч');
    expect(formatDuration(85)).toBe('1 ч 25 мин');
    expect(formatDuration(0)).toBe('0 мин');
  });

  it('короткая запись для плиток', () => {
    expect(formatHours(45)).toBe('45 мин');
    expect(formatHours(60)).toBe('1 ч');
    expect(formatHours(451)).toBe('7,5 ч');
  });
});

describe('parseNumber', () => {
  it('понимает запятую и точку, отклоняет мусор', () => {
    expect(parseNumber('7,5')).toBe(7.5);
    expect(parseNumber('62.5')).toBe(62.5);
    expect(parseNumber('100')).toBe(100);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('-3')).toBeNull();
  });
});
