import { renderPlaceholder } from '../placeholder';

export function render(root: HTMLElement): void {
  renderPlaceholder(root, {
    icon: 'habits',
    color: 'var(--c-habits)',
    title: 'Привычки',
    text: 'Этот раздел появится на этапе 2.',
  });
}
