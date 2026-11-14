import './styles/base.css';
import './styles/components.css';

import { backupState, exportData, hasUserData, isBackupDue } from './core/backup';
import { initPwa, requestPersistence } from './core/pwa';
import { navigate, startRouter, type RouteDef } from './core/router';
import { getSetting, setSetting } from './core/settings';
import { h, icon, toast } from './core/ui';
import { ROUTES } from './routes';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app не найден');

// ---------- Каркас ----------

const title = h('h1', null, '');
const titleIcon = h('span', { class: 'topbar-icon' });
const headerButtons = new Map<string, HTMLElement>();
const tabs = new Map<string, HTMLElement>();

for (const route of ROUTES) {
  if (route.tab) {
    tabs.set(route.id, h('a', { class: 'tab', href: `#/${route.id}` }, icon(route.icon, 22), route.tabLabel ?? route.title));
  } else {
    headerButtons.set(
      route.id,
      h('a', { class: 'icon-btn', href: `#/${route.id}`, 'aria-label': route.title }, icon(route.icon)),
    );
  }
}

const bannerSlot = h('div', null);
const view = h('main', { class: 'view' });

app.append(
  h('header', { class: 'topbar' }, titleIcon, title, [...headerButtons.values()]),
  bannerSlot,
  view,
  h('nav', { class: 'tabbar', 'aria-label': 'Разделы' }, [...tabs.values()]),
);

function onRouteChange(route: RouteDef): void {
  title.textContent = route.title;
  titleIcon.className = `topbar-icon${route.module ? ` m-${route.module}` : ''}`;
  titleIcon.replaceChildren(icon(route.icon, 24));
  document.title = route.id === 'today' ? 'Трекер' : `${route.title} - Трекер`;
  for (const [id, node] of [...tabs, ...headerButtons]) {
    const active = id === route.id;
    node.classList.toggle('is-active', active);
    if (active) node.setAttribute('aria-current', 'page');
    else node.removeAttribute('aria-current');
  }
  void showBackupReminder();
}

// ---------- Напоминание о бэкапе ----------

async function showBackupReminder(): Promise<void> {
  const due = isBackupDue(await backupState(), new Date()) && (await hasUserData());
  bannerSlot.replaceChildren();
  if (!due) return;

  const save = h('button', { class: 'btn', type: 'button' }, 'Сохранить копию');
  const later = h('button', { class: 'btn', type: 'button' }, 'Позже');
  save.addEventListener('click', () => {
    void exportData(false)
      .then((result) => {
        if (result === 'cancelled') return;
        toast('Копия данных сохранена');
        bannerSlot.replaceChildren();
      })
      .catch(() => toast('Не удалось сохранить копию', 'error'));
  });
  later.addEventListener('click', () => {
    void setSetting('backupSnoozedAt', new Date().toISOString());
    bannerSlot.replaceChildren();
  });
  bannerSlot.append(
    h(
      'div',
      { class: 'banner' },
      'Прошло больше недели без резервной копии. iPhone может стереть данные приложения - сохрани копию в «Файлы».',
      h('div', { class: 'banner-actions' }, save, later),
    ),
  );
}

// ---------- Клавиатура iPhone ----------
// Когда открывается клавиатура, видимая часть экрана уменьшается. Подгоняем под неё высоту приложения,
// чтобы поле ввода оставалось на виду.

function syncViewport(): void {
  const vv = window.visualViewport;
  if (!vv) return;
  document.documentElement.style.setProperty('--app-h', `${vv.height}px`);
  document.documentElement.classList.toggle('kb-open', window.innerHeight - vv.height > 120);
  if (vv.offsetTop > 0) window.scrollTo(0, 0);
}

window.visualViewport?.addEventListener('resize', syncViewport);
window.visualViewport?.addEventListener('scroll', syncViewport);
syncViewport();

// ---------- Запуск ----------

async function boot(): Promise<void> {
  initPwa();
  void requestPersistence();
  if (!(await getSetting('firstRunAt'))) await setSetting('firstRunAt', new Date().toISOString());
  if (!location.hash) navigate('today');
  const router = startRouter(ROUTES, view, onRouteChange);

  // При смене светлой/тёмной темы перерисовываем экран, чтобы диаграммы взяли новые цвета.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const busy = document.querySelector('.sheet-backdrop') !== null || router.current().id === 'assistant';
    if (!busy) router.refresh();
  });
}

boot().catch((err: unknown) => {
  console.error(err);
  app.replaceChildren(
    h(
      'div',
      { class: 'note note-error', style: 'margin:24px 16px' },
      'Приложение не смогло запуститься. Возможно, в Safari включён режим, который запрещает хранить данные ' +
        '(например, «Частный доступ»). Открой приложение в обычной вкладке.',
    ),
  );
});
