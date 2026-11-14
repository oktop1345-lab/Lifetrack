import { describe, expect, it } from 'vitest';
import { isThemeMode, resolveDark } from './theme';

describe('тема', () => {
  it('по умолчанию и при выборе «светлая» тема светлая даже при тёмной системе', () => {
    expect(resolveDark('light', true)).toBe(false);
  });

  it('«тёмная» всегда тёмная, «как в системе» следует за iPhone', () => {
    expect(resolveDark('dark', false)).toBe(true);
    expect(resolveDark('auto', true)).toBe(true);
    expect(resolveDark('auto', false)).toBe(false);
  });

  it('проверяет сохранённое значение', () => {
    expect(isThemeMode('dark')).toBe(true);
    expect(isThemeMode('blue')).toBe(false);
    expect(isThemeMode(null)).toBe(false);
  });
});
