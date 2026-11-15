// Клавиатура iPhone. Когда она открыта, iOS уменьшает только видимую часть экрана (visualViewport),
// а «полный» экран остаётся прежним - поэтому всё, что прижато к низу, уходит под клавиатуру.
// Здесь приложение и шторки подгоняются под видимую часть, а поле ввода прокручивается над клавиатурой.

/** Насколько прокрутить контейнер, чтобы элемент целиком попал в видимую область (с отступом). */
export function scrollDelta(
  item: { top: number; bottom: number },
  box: { top: number; bottom: number },
  margin = 16,
): number {
  const visible = box.bottom - box.top - 2 * margin;
  const height = item.bottom - item.top;
  // Поле выше видимой области или оно выше самой области - показываем его верх.
  if (item.top < box.top + margin || height > visible) return item.top - (box.top + margin);
  if (item.bottom > box.bottom - margin) return item.bottom - (box.bottom - margin);
  return 0;
}

/** Ближайший предок, который прокручивается по вертикали. */
function scrollParent(el: Element): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
  }
  return null;
}

const isField = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;

/** Прокручивает контейнеры так, чтобы поле в фокусе было видно над клавиатурой. */
function revealFocused(): void {
  const el = document.activeElement;
  if (!isField(el)) return;
  const vv = window.visualViewport;
  const screenTop = vv ? vv.offsetTop : 0;
  const screenBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const container = scrollParent(el);
  if (!container) return;
  const box = container.getBoundingClientRect();
  const delta = scrollDelta(el.getBoundingClientRect(), {
    top: Math.max(box.top, screenTop),
    bottom: Math.min(box.bottom, screenBottom),
  });
  if (delta !== 0) container.scrollTop += delta;
}

let revealTimer: number | undefined;

/** Повторяем несколько раз: клавиатура выезжает с анимацией, и размеры меняются не сразу. */
function scheduleReveal(): void {
  window.clearTimeout(revealTimer);
  requestAnimationFrame(revealFocused);
  revealTimer = window.setTimeout(() => {
    revealFocused();
    revealTimer = window.setTimeout(revealFocused, 250);
  }, 120);
}

function sync(): void {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  root.style.setProperty('--app-h', `${vv.height}px`);
  root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
  root.classList.toggle('kb-open', window.innerHeight - vv.height > 120);
  if (isField(document.activeElement)) scheduleReveal();
}

export function initKeyboard(): void {
  window.visualViewport?.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('scroll', sync);
  document.addEventListener('focusin', (event) => {
    if (isField(event.target as Element)) scheduleReveal();
  });
  sync();
}
