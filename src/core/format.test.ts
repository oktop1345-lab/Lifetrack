import { describe, expect, it } from 'vitest';
import { countDays, percent, plural } from './format';

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
