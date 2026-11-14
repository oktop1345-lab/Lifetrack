// Простой роутер по адресу после '#': #/today, #/habits ... Работает на GitHub Pages без настройки сервера.

import type { IconName, ModuleId } from './ui';

/** Функция очистки: вызывается при уходе с экрана (остановить таймеры, запросы). */
export type Cleanup = () => void;

export interface RouteDef {
  id: string;
  title: string;
  icon: IconName;
  /** Показывать в нижней навигации. */
  tab: boolean;
  /** Короткая подпись для нижней навигации (если заголовок длинный). */
  tabLabel?: string;
  /** Раздел - задаёт цвет значка в шапке. */
  module?: ModuleId;
  render(root: HTMLElement): void | Cleanup | Promise<void | Cleanup>;
}

export interface Router {
  current(): RouteDef;
  /** Перерисовать текущий экран (например, после импорта данных). */
  refresh(): void;
}

export function navigate(id: string): void {
  location.hash = `#/${id}`;
}

export function startRouter(
  routes: RouteDef[],
  root: HTMLElement,
  onChange: (route: RouteDef) => void,
): Router {
  const fallback = routes[0];
  if (!fallback) throw new Error('Нет ни одного экрана');
  let cleanup: Cleanup | void;
  let token = 0;

  const resolve = (): RouteDef => {
    const id = location.hash.replace(/^#\/?/, '');
    return routes.find((route) => route.id === id) ?? fallback;
  };

  const show = (): void => {
    const route = resolve();
    const mine = ++token;
    try {
      cleanup?.();
    } catch (err) {
      console.error(err);
    }
    cleanup = undefined;
    root.className = 'view';
    root.replaceChildren();
    root.scrollTop = 0;
    onChange(route);

    Promise.resolve()
      .then(() => route.render(root))
      .then((result) => {
        // Пока экран загружался, пользователь мог уйти на другой.
        if (mine === token) cleanup = result;
        else result?.();
      })
      .catch((err: unknown) => {
        console.error(err);
        if (mine !== token) return;
        const box = document.createElement('div');
        box.className = 'note note-error';
        box.textContent = 'Не удалось открыть этот экран. Закрой приложение и открой снова.';
        root.replaceChildren(box);
      });
  };

  window.addEventListener('hashchange', show);
  show();
  return { current: resolve, refresh: show };
}
