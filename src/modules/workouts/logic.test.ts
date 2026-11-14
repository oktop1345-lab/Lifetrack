import { describe, expect, it } from 'vitest';
import type { Workout } from '../../core/types';
import {
  bodyweightReps,
  countBetween,
  isBodyweight,
  lastExercise,
  looksBodyweight,
  setLoad,
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
    expect(weeks.map((w) => w.bodyweightReps)).toEqual([0, 14, 10]);
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
      bodyweight: false,
      points: [
        { date: '2026-11-02', value: 70 },
        { date: '2026-11-10', value: 75 },
      ],
    });
  });

  it('упражнение без веса считается по повторениям', () => {
    expect(exerciseProgress(workouts, 'подтягивания')).toEqual({
      unit: 'reps',
      bodyweight: true,
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

describe('собственный вес', () => {
  const bw: Workout = {
    id: 'bw',
    date: '2026-11-11',
    type: 'Свой вес',
    exercises: [
      { name: 'Отжимания', bodyweight: true, sets: [{ weight: 0, reps: 20 }, { weight: 0, reps: 15 }] },
      { name: 'Подтягивания', bodyweight: true, sets: [{ weight: 10, reps: 5 }] },
      { name: 'Жим лёжа', sets: [{ weight: 50, reps: 10 }] },
    ],
  };

  it('узнаёт упражнения с собственным весом по названию', () => {
    expect(looksBodyweight('Подтягивания широким хватом')).toBe(true);
    expect(looksBodyweight('Отжимания на брусьях')).toBe(true);
    expect(looksBodyweight('Планка')).toBe(true);
    expect(looksBodyweight('Жим лёжа')).toBe(false);
    expect(looksBodyweight('')).toBe(false);
  });

  it('старые записи без отметки считаются по подходам без веса', () => {
    expect(isBodyweight({ name: 'X', sets: [{ weight: 0, reps: 8 }] })).toBe(true);
    expect(isBodyweight({ name: 'X', sets: [{ weight: 20, reps: 8 }] })).toBe(false);
    expect(isBodyweight({ name: 'X', bodyweight: false, sets: [{ weight: 0, reps: 8 }] })).toBe(false);
  });

  it('без веса тела в объём идёт только обычный вес, повторения считаются отдельно', () => {
    expect(workoutVolume(bw)).toBe(500);
    expect(bodyweightReps(bw)).toBe(40);
  });

  it('с весом тела в объём идёт вес тела плюс дополнительный вес', () => {
    // отжимания (70 × 35) + подтягивания ((70 + 10) × 5) + жим 500
    expect(workoutVolume(bw, 70)).toBe(70 * 35 + 80 * 5 + 500);
    expect(setLoad(bw.exercises[1]!, { weight: 10, reps: 5 }, 70)).toBe(80);
    expect(setLoad(bw.exercises[2]!, { weight: 50, reps: 10 }, 70)).toBe(50);
  });

  it('недели считают повторения с собственным весом', () => {
    const weeks = weeklyVolume([bw], '2026-11-12', 1, 70);
    expect(weeks[0]).toMatchObject({ count: 1, bodyweightReps: 40, volume: 70 * 35 + 80 * 5 + 500 });
  });

  it('прогресс по упражнению с собственным весом - в повторениях, даже с доп. весом', () => {
    const other: Workout = { id: 'b2', date: '2026-11-13', type: 'Свой вес', exercises: [{ name: 'Подтягивания', bodyweight: true, sets: [{ weight: 0, reps: 9 }] }] };
    expect(exerciseProgress([bw, other], 'Подтягивания')).toEqual({
      unit: 'reps',
      bodyweight: true,
      points: [
        { date: '2026-11-11', value: 5 },
        { date: '2026-11-13', value: 9 },
      ],
    });
  });

  it('lastExercise возвращает и отметку «свой вес»', () => {
    expect(lastExercise([bw], 'отжимания')?.bodyweight).toBe(true);
  });

  it('новый тип добавлен в конец, цвета старых типов не сдвинулись', () => {
    expect(typeColor('Силовая')).toBe(0);
    expect(typeColor('Свой вес')).toBe(5);
  });
});
