// Всё, что связано с работой как установленное приложение: офлайн-кэш, обновления, хранилище.

import { registerSW } from 'virtual:pwa-register';

let registration: ServiceWorkerRegistration | undefined;

/** Включает service worker: после первой загрузки приложение открывается без интернета. */
export function initPwa(): void {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      registration = reg;
    },
  });
}

export type UpdateResult = 'updating' | 'latest' | 'unavailable';

/** Проверяет, не вышла ли новая версия. Если вышла - страница перезагрузится сама. */
export async function checkForUpdate(): Promise<UpdateResult> {
  if (!registration) return 'unavailable';
  try {
    await registration.update();
  } catch {
    return 'unavailable';
  }
  return registration.installing || registration.waiting ? 'updating' : 'latest';
}

/** Просит браузер не удалять данные приложения при нехватке места. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function isPersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false;
  } catch {
    return false;
  }
}

/** Запущено ли приложение с экрана «Домой» (а не во вкладке Safari). */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}
