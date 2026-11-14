// Сводка данных для AI. Модель получает только итоги за период: проценты, суммы, средние.
// Сами записи (отдельные траты, заметки, занятия) не отправляются.

import { addDays, formatDayLong, monthBounds, monthKey } from '../core/dates';
import { formatDuration, formatNumber } from '../core/format';
import { formatMoney } from '../core/money';
import { categoryTotals, goalStatus, sumBetween } from '../modules/finance/logic';
import { bestStreak, currentStreak, indexChecks, isScheduled, progress, scheduleText } from '../modules/habits/logic';
import { appTotals, averageMinutes, limitStreak, urgeStats } from '../modules/screen/logic';
import { goalProgress, minutesBySubject, totalMinutes } from '../modules/study/logic';
import type { AllData } from '../modules/today/data';
import { countBetween, exerciseNames, exerciseProgress, typeDistribution, weeklyVolume } from '../modules/workouts/logic';

const pct = (part: number, whole: number): string => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : 'нет данных');

/** Текстовая сводка по всем разделам за последние `days` дней. */
export function buildContext(data: AllData, today: string, days: number): string {
  const from = addDays(today, -(days - 1));
  const money = (minor: number): string => formatMoney(minor, data.currency).replace(/[  ]/g, ' ');
  const lines: string[] = [`Сегодня ${formatDayLong(today)} (${today}). Сводка за последние ${days} дней: с ${from} по ${today}.`];

  // Привычки
  lines.push('', 'ПРИВЫЧКИ');
  if (data.habits.length === 0) lines.push('Привычек нет.');
  else {
    const index = indexChecks(data.checks);
    const all = progress(data.habits, index, from, today);
    lines.push(`Выполнено ${all.done} из ${all.scheduled} запланированных (${pct(all.done, all.scheduled)}).`);
    for (const habit of data.habits) {
      const own = progress([habit], index, from, today);
      const doneToday = index.get(habit.id)?.has(today) ?? false;
      lines.push(
        `- ${habit.name}: ${scheduleText(habit).toLowerCase()}, выполнено ${pct(own.done, own.scheduled)}, ` +
          `серия ${currentStreak(habit, index, today)}, рекорд ${bestStreak(habit, index, today)}` +
          (isScheduled(habit, today) ? `, сегодня ${doneToday ? 'выполнена' : 'ещё не выполнена'}` : ''),
      );
    }
  }

  // Тренировки
  lines.push('', 'ТРЕНИРОВКИ');
  const workouts = data.workouts.filter((workout) => workout.date >= from && workout.date <= today);
  if (workouts.length === 0) lines.push('За период тренировок нет.');
  else {
    lines.push(`Тренировок: ${countBetween(data.workouts, from, today)}.`);
    lines.push('По типам: ' + typeDistribution(data.workouts, from, today).map((item) => `${item.type} ${item.count}`).join(', ') + '.');
    const weeks = weeklyVolume(data.workouts, today, Math.min(8, Math.ceil(days / 7)));
    lines.push('Объём по неделям, кг (от старых к новым): ' + weeks.map((week) => formatNumber(week.volume)).join(', ') + '.');
    for (const name of exerciseNames(workouts).slice(0, 6)) {
      const progressData = exerciseProgress(workouts, name);
      const first = progressData.points[0];
      const last = progressData.points[progressData.points.length - 1];
      if (!first || !last) continue;
      const unit = progressData.unit === 'kg' ? 'кг' : 'повт.';
      lines.push(
        `- ${name}: ${progressData.points.length} раз, лучший результат в начале ${formatNumber(first.value)} ${unit}, в конце ${formatNumber(last.value)} ${unit}`,
      );
    }
  }

  // Учёба
  lines.push('', 'УЧЁБА');
  const studied = totalMinutes(data.sessions, from, today);
  if (studied === 0) lines.push('За период занятий нет.');
  else {
    lines.push(`Всего ${formatDuration(studied)}.`);
    lines.push(
      'По предметам: ' +
        minutesBySubject(data.sessions, data.subjects, from, today)
          .map((item) => `${item.name} ${formatDuration(item.minutes)}`)
          .join(', ') +
        '.',
    );
  }
  for (const goal of data.studyGoals) {
    const state = goalProgress(goal, data.sessions);
    lines.push(
      `- Цель «${goal.title}»: ${formatDuration(state.minutes)} из ${formatDuration(goal.targetMinutes)} (${pct(state.minutes, goal.targetMinutes)})` +
        (goal.deadline ? `, срок ${goal.deadline}` : ''),
    );
  }

  // Финансы
  lines.push('', `ФИНАНСЫ (валюта ${data.currency})`);
  const expense = sumBetween(data.transactions, 'expense', from, today);
  const income = sumBetween(data.transactions, 'income', from, today);
  if (expense === 0 && income === 0) lines.push('За период операций нет.');
  else {
    lines.push(`Доходы ${money(income)}, расходы ${money(expense)}, разница ${money(income - expense)}.`);
    const byCategory = categoryTotals(data.transactions, data.categories, 'expense', from, today);
    if (byCategory.length) {
      lines.push('Расходы по категориям: ' + byCategory.slice(0, 10).map((item) => `${item.name} ${money(item.amount)} (${pct(item.amount, expense)})`).join(', ') + '.');
    }
  }
  if (data.budget) {
    const month = monthBounds(monthKey(today));
    lines.push(`Бюджет на текущий месяц ${money(data.budget)}, потрачено ${money(sumBetween(data.transactions, 'expense', month.from, month.to))}.`);
  }
  for (const goal of data.savingsGoals) {
    const state = goalStatus(goal, today);
    lines.push(
      `- Цель накоплений «${goal.name}»: ${money(goal.saved)} из ${money(goal.target)} (${pct(goal.saved, goal.target)})` +
        (goal.deadline ? `, срок ${goal.deadline}` : '') +
        (state.perMonth !== null ? `, нужно ${money(state.perMonth)} в месяц` : ''),
    );
  }

  // Экранное время
  lines.push('', 'ЭКРАННОЕ ВРЕМЯ');
  const screen = data.screenDays.filter((day) => day.date >= from && day.date <= today);
  const average = averageMinutes(data.screenDays, from, today);
  if (average === null) lines.push('За период записей нет.');
  else {
    lines.push(`Среднее ${formatDuration(average)} в день (записей: ${screen.length}).`);
    if (data.screenLimit) {
      lines.push(
        `Лимит ${formatDuration(data.screenLimit)} в день, дней выше лимита: ${screen.filter((day) => day.totalMinutes > data.screenLimit!).length}, ` +
          `серия ниже лимита: ${limitStreak(data.screenDays, data.screenLimit, today)}.`,
      );
    }
    const apps = appTotals(data.screenDays, from, today, 6);
    if (apps.length) lines.push('По приложениям: ' + apps.map((app) => `${app.name} ${formatDuration(app.minutes)}`).join(', ') + '.');
  }
  const start = new Date(`${from}T00:00:00`).getTime();
  const urges = urgeStats(data.urges.filter((urge) => new Date(urge.at).getTime() >= start));
  if (urges.total > 0) {
    lines.push(
      `Тянуло скроллить: ${urges.total} раз, удалось заменить другим делом: ${urges.replaced}. ` +
        'Триггеры: ' +
        urges.byTrigger.map((item) => `${item.label.toLowerCase()} ${item.count}`).join(', ') +
        '.',
    );
  }

  return lines.join('\n');
}
