import { describe, expect, it } from 'vitest';
import { scrollDelta } from './keyboard';

describe('scrollDelta', () => {
  const box = { top: 100, bottom: 500 };

  it('поле видно - ничего не прокручиваем', () => {
    expect(scrollDelta({ top: 200, bottom: 250 }, box)).toBe(0);
  });

  it('поле под клавиатурой - прокручиваем вниз ровно настолько, чтобы его было видно', () => {
    expect(scrollDelta({ top: 600, bottom: 650 }, box)).toBe(650 - (500 - 16));
  });

  it('поле выше видимой области - прокручиваем вверх', () => {
    expect(scrollDelta({ top: 40, bottom: 90 }, box)).toBe(40 - 116);
  });

  it('высокое поле (как многострочное) - показываем его верх', () => {
    expect(scrollDelta({ top: 300, bottom: 900 }, box)).toBe(300 - 116);
  });
});
