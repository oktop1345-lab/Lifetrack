import { renderPlaceholder } from '../placeholder';

export function render(root: HTMLElement): void {
  renderPlaceholder(root, {
    icon: 'study',
    color: 'var(--c-study)',
    title: 'Учёба',
    text: 'Этот раздел появится на этапе 4.',
  });
}
