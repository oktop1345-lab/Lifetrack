// Тема оформления. По умолчанию светлая; можно выбрать тёмную или «как в системе».
// Выбор хранится в настройках (уходит в бэкап) и дублируется в localStorage,
// чтобы при запуске тема применилась сразу, без мигания.

export type ThemeMode = 'light' | 'dark' | 'auto';

const STORAGE_KEY = 'lifetrack-theme';
const media = (): MediaQueryList => window.matchMedia('(prefers-color-scheme: dark)');

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'auto';
}

/** Тёмная ли тема получится при этом выборе. */
export function resolveDark(mode: ThemeMode, systemDark: boolean): boolean {
  return mode === 'dark' || (mode === 'auto' && systemDark);
}

/** Применяет тему к странице. Возвращает true, если тема на экране изменилась. */
export function applyTheme(mode: ThemeMode): boolean {
  const dark = resolveDark(mode, media().matches);
  const root = document.documentElement;
  const changed = root.classList.contains('theme-dark') !== dark;
  root.classList.toggle('theme-dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#191919' : '#ffffff');
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // хранилище недоступно - не страшно, тема возьмётся из настроек
  }
  return changed;
}

/** Быстрый выбор при запуске (до чтения базы). */
export function storedTheme(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (isThemeMode(value)) return value;
  } catch {
    // ignore
  }
  return 'light';
}

/** Следит за системной темой; onChange вызывается, только если тема на экране поменялась. */
export function watchSystemTheme(current: () => ThemeMode, onChange: () => void): void {
  media().addEventListener('change', () => {
    if (current() === 'auto' && applyTheme('auto')) onChange();
  });
}
