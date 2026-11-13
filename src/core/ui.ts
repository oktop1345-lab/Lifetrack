// Маленькие помощники для построения интерфейса без фреймворка.

export type Child = Node | string | number | null | undefined | false | Child[];

type Props = Record<string, unknown>;

/** Создаёт элемент: h('button', { class: 'btn', onclick: fn }, 'Текст'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = String(value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value as EventListener);
    } else if (key in node && key !== 'list' && key !== 'form') {
      (node as unknown as Props)[key] = value;
    } else node.setAttribute(key, value === true ? '' : String(value));
  }
  append(node, children);
  return node;
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(parent, child);
    else parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(node: Element): void {
  node.replaceChildren();
}

// ---------- Иконки (встроенные SVG, без внешних файлов) ----------

const ICONS = {
  today:
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  habits: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
  workouts: '<path d="M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>',
  study:
    '<path d="M12 6.5C10 5 7 4.5 4 5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5zM12 6.5v13"/>',
  finance:
    '<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3M4 7.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 1 4 7.5z"/><circle cx="16" cy="13.5" r="1" fill="currentColor" stroke="none"/>',
  assistant:
    '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8L12 3zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.3.9a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.5a7.6 7.6 0 0 0-2.6 1.5l-2.3-.9-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.3-.9a7.6 7.6 0 0 0 2.6 1.5l.5 2.5h4l.5-2.5a7.6 7.6 0 0 0 2.6-1.5l2.3.9 2-3.4-2-1.5z"/>',
  send: '<path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName, size = 24): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name]; // статичные строки из этого файла
  return svg;
}

// ---------- Всплывающее сообщение ----------

let toastTimer: number | undefined;

export function toast(text: string, kind: 'ok' | 'error' = 'ok'): void {
  document.querySelector('.toast')?.remove();
  const node = h('div', { class: `toast toast-${kind}`, role: 'status' }, text);
  document.body.append(node);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => node.remove(), kind === 'error' ? 5000 : 2500);
}

// ---------- Шторка снизу (формы, подтверждения, списки) ----------

export interface Sheet {
  close(): void;
  body: HTMLElement;
}

export function openSheet(title: string, content: Child, onClose?: () => void): Sheet {
  const body = h('div', { class: 'sheet-body' }, content);
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Закрыть' }, icon('close'));
  const panel = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('h2', null, title), closeBtn),
    body,
  );
  const backdrop = h('div', { class: 'sheet-backdrop' }, panel);

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    onClose?.();
  };
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  document.body.append(backdrop);
  return { close, body };
}

export function confirmSheet(opts: {
  title: string;
  text: Child;
  confirmLabel: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let answer = false;
    const ok = h('button', { class: `btn ${opts.danger ? 'btn-danger' : 'btn-primary'}`, type: 'button' }, opts.confirmLabel);
    const cancel = h('button', { class: 'btn', type: 'button' }, 'Отмена');
    const sheet = openSheet(
      opts.title,
      [h('div', { class: 'sheet-text' }, opts.text), h('div', { class: 'stack' }, ok, cancel)],
      () => resolve(answer),
    );
    ok.addEventListener('click', () => {
      answer = true;
      sheet.close();
    });
    cancel.addEventListener('click', () => sheet.close());
  });
}

// ---------- Готовые блоки ----------

export function card(title: string | null, ...children: Child[]): HTMLElement {
  return h('section', { class: 'card' }, title ? h('h2', { class: 'card-title' }, title) : null, children);
}

export function field(label: string, control: HTMLElement, hint?: Child): HTMLElement {
  return h(
    'label',
    { class: 'field' },
    h('span', { class: 'field-label' }, label),
    control,
    hint ? h('span', { class: 'field-hint' }, hint) : null,
  );
}
