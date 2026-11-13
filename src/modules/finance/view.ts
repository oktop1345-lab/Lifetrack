import { renderPlaceholder } from '../placeholder';

export function render(root: HTMLElement): void {
  renderPlaceholder(root, {
    icon: 'finance',
    color: 'var(--c-finance)',
    title: 'Финансы',
    text: 'Этот раздел появится на этапе 3.',
  });
}
