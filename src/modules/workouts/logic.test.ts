import { describe, expect, it } from 'vitest';
import type { Workout } from '../../core/types';
import {
  countBetween,
  exerciseNames,
  exerciseProgress,
  lastSets,
  typeColor,
  typeDistribution,
  weeklyVolume,
  workoutSets,
  workoutVolume,
} from './logic';

const workouts: Workout[] = [
  {
    id: 'a',
    date: '2026-11-02', // понедельник
    type: 'Силовая',
    exercises: [
      { name: 'Приседания', sets: [{ weight: 60, reps: 10 }, { weight: 70, reps: 8 }] },
      { name: 'Подтягивания', sets: [{ weight: 0, reps: 8 }, { weight: 0, reps: 6 }] },
    ],
  },
  {
    id: 'b',
    date: '2026-11-06',
    type: 'Кардио',
    exercises: [],
  },
  {
    id: 'c',
    date: '2026-11-10',
    type: 'Силовая',
    exercises: [
      { name: ' приседания ', sets: [{ weight: 75, reps: 6 }] },
      { name: 'Подтягивания', sets: [{ weight: 0, reps: 10 }] },
    ],
  },
];

describe('объём', () => {
  it('складывает вес на повторения по всем подходам', () => {
    expect(workoutVolume(workouts[0]!)).toBe(60 * 10 + 70 * 8);
    expect(workoutVolume(workouts[1]!)).toBe(0);
    expect(workoutSets(workouts[0]!)).toBe(4);
  });

  it('группирует по неделям с понедельника', () => {
    const weeks = weeklyVolume(workouts, '2026-11-12', 3);
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-10-26', '2026-11-02', '2026-11-09']);
    expect(weeks.map((w) => w.volume)).toEqual([0, 1160, 450]);
    expect(weeks.map((w) => w.count)).toEqual([0, 2, 1]);
  });

  it('считает тренировки за период', () => {
    expect(countBetween(workouts, '2026-11-06', '2026-11-12')).toBe(2);
  });
});

describe('типы', () => {
  it('распределение по типам по убыванию', () => {
    expect(typeDistribution(workouts, '2026-11-01', '2026-11-30')).toEqual([
      { type: 'Силовая', count: 2 },
      { type: 'Кардио', count: 1 },
    ]);
    expect(typeDistribution(workouts, '2026-11-05', '2026-11-07')).toEqual([{ type: 'Кардио', count: 1 }]);
  });

  it('цвет закреплён за типом', () => {
    expect(typeColor('Силовая')).toBe(0);
    expect(typeColor('Кардио')).toBe(1);
    expect(typeColor('Йога')).toBeNull();
  });
});

describe('упражнения', () => {
  it('список названий без повторов, частые сверху, регистр и пробелы не важны', () => {
    expect(exerciseNames(workouts)).toEqual(['Подтягивания', 'Приседания']);
  });

  it('прогресс по весу: лучший вес за тренировку', () => {
    expect(exerciseProgress(workouts, 'Приседания')).toEqual({
      unit: 'kg',
      points: [
        { date: '2026-11-02', value: 70 },
        { date: '2026-11-10', value: 75 },
      ],
    });
  });

  it('упражнение без веса считается по повторениям', () => {
    expect(exerciseProgress(workouts, 'подтягивания')).toEqual({
      unit: 'reps',
      points: [
        { date: '2026-11-02', value: 8 },
        { date: '2026-11-10', value: 10 },
      ],
    });
  });

  it('неизвестное упражнение - пустой прогресс', () => {
    expect(exerciseProgress(workouts, 'Жим').points).toEqual([]);
  });

  it('lastSets возвращает подходы с последней тренировки', () => {
    expect(lastSets(workouts, 'Приседания')).toEqual([{ weight: 75, reps: 6 }]);
    expect(lastSets(workouts, 'Жим')).toBeNull();
  });
});
