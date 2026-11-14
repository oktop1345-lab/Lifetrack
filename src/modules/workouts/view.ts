import { renderPlaceholder } from '../placeholder';

export function render(root: HTMLElement): void {
  renderPlaceholder(root, { icon: 'workouts', module: 'workouts', title: 'Тренировки', text: 'Этот раздел скоро появится.' });
}
