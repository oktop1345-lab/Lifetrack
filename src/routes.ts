// Список экранов. Новый модуль подключается одной строкой здесь.

import type { RouteDef } from './core/router';
import { render as assistant } from './modules/assistant/view';
import { render as finance } from './modules/finance/view';
import { render as habits } from './modules/habits/view';
import { render as settings } from './modules/settings/view';
import { render as study } from './modules/study/view';
import { render as today } from './modules/today/view';
import { render as workouts } from './modules/workouts/view';

export const ROUTES: RouteDef[] = [
  { id: 'today', title: 'Сегодня', icon: 'today', tab: true, render: today },
  { id: 'habits', title: 'Привычки', icon: 'habits', tab: true, module: 'habits', render: habits },
  { id: 'workouts', title: 'Тренировки', tabLabel: 'Спорт', icon: 'workouts', tab: true, module: 'workouts', render: workouts },
  { id: 'study', title: 'Учёба', icon: 'study', tab: true, module: 'study', render: study },
  { id: 'finance', title: 'Финансы', icon: 'finance', tab: true, module: 'finance', render: finance },
  { id: 'assistant', title: 'AI-ассистент', icon: 'assistant', tab: false, render: assistant },
  { id: 'settings', title: 'Настройки', icon: 'settings', tab: false, render: settings },
];
