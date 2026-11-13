import { renderPlaceholder } from '../placeholder';

export function render(root: HTMLElement): void {
  renderPlaceholder(root, {
    icon: 'workouts',
    color: 'var(--c-workouts)',
    title: 'Тренировки',
    text: 'Этот раздел появится на этапе 4.',
  });
}
