import { renderPlaceholder } from '../placeholder';

export function render(root: HTMLElement): void {
  renderPlaceholder(root, { icon: 'study', module: 'study', title: 'Учёба', text: 'Этот раздел скоро появится.' });
}
