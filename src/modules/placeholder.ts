import { h, icon, type IconName } from '../core/ui';

/** Заглушка для разделов, которые появятся на следующих этапах. */
export function renderPlaceholder(
  root: HTMLElement,
  opts: { icon: IconName; color: string; title: string; text: string },
): void {
  root.append(
    h(
      'div',
      { class: 'empty' },
      h('div', { class: 'badge', style: `background:${opts.color}` }, icon(opts.icon, 32)),
      h('h2', null, opts.title),
      h('p', null, opts.text),
    ),
  );
}
