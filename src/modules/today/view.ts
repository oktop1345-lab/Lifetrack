import { formatDayLong, todayStr } from '../../core/dates';
import { isStandalone } from '../../core/pwa';
import { card, h, icon, type IconName } from '../../core/ui';

const SECTIONS: { id: string; title: string; text: string; icon: IconName; color: string }[] = [
  { id: 'habits', title: 'Привычки', text: 'Чекины, серии, тепловая карта', icon: 'habits', color: 'var(--c-habits)' },
  { id: 'workouts', title: 'Тренировки', text: 'Упражнения, подходы, прогресс', icon: 'workouts', color: 'var(--c-workouts)' },
  { id: 'study', title: 'Учёба', text: 'Сессии, таймер, цели', icon: 'study', color: 'var(--c-study)' },
  { id: 'finance', title: 'Финансы', text: 'Доходы, расходы, бюджет', icon: 'finance', color: 'var(--c-finance)' },
];

export function render(root: HTMLElement): void {
  const day = formatDayLong(todayStr());
  root.append(h('p', { class: 'muted', style: 'padding:0 4px' }, day.charAt(0).toUpperCase() + day.slice(1)));

  if (!isStandalone()) {
    root.append(
      card(
        'Установка на iPhone',
        h(
          'p',
          null,
          'Чтобы приложение работало как обычное и без интернета: нажми кнопку «Поделиться» внизу Safari, ' +
            'затем «На экран „Домой“».',
        ),
      ),
    );
  }

  root.append(
    card(
      'Разделы',
      h(
        'div',
        { class: 'list' },
        SECTIONS.map((section) =>
          h(
            'a',
            { class: 'list-row', href: `#/${section.id}` },
            h('span', { class: 'badge', style: `background:${section.color}` }, icon(section.icon)),
            h(
              'span',
              { class: 'grow' },
              h('div', { style: 'font-weight:600' }, section.title),
              h('div', { class: 'muted small' }, section.text),
            ),
            h('span', { class: 'chev' }, icon('chevron', 20)),
          ),
        ),
      ),
    ),
    h(
      'p',
      { class: 'muted small', style: 'padding:0 4px' },
      'Здесь появятся чекины привычек на сегодня, быстрое добавление трат и тренировок и мини-графики.',
    ),
  );
}
