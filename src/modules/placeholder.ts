import { emptyState, type IconName, type ModuleId } from '../core/ui';

/** Заглушка для разделов, которые ещё не сделаны. */
export function renderPlaceholder(
  root: HTMLElement,
  opts: { icon: IconName; module: ModuleId; title: string; text: string },
): void {
  root.append(emptyState(opts.module, opts.icon, opts.title, opts.text));
}
