import { describe, expect, it } from 'vitest';
import { backupFileName, buildBackup, isBackupDue, parseBackup, stripApiKeys } from './backup';
import { defaultAiSettings } from './settings';

const now = new Date('2026-11-13T10:00:00Z');

function aiWithKey() {
  const ai = defaultAiSettings();
  ai.configs.anthropic.apiKey = 'sk-secret';
  return ai;
}

describe('buildBackup', () => {
  it('складывает все таблицы в один файл', () => {
    const backup = buildBackup(
      { habits: [{ id: 'h1' }], transactions: [{ id: 't1' }, { id: 't2' }] },
      { includeApiKeys: false, now },
    );
    expect(backup.app).toBe('life-tracker');
    expect(backup.exportedAt).toBe('2026-11-13T10:00:00.000Z');
    expect(backup.tables.habits).toHaveLength(1);
    expect(backup.tables.transactions).toHaveLength(2);
  });

  it('по умолчанию не кладёт API-ключ в файл', () => {
    const backup = buildBackup(
      { settings: [{ key: 'ai', value: aiWithKey() }, { key: 'currency', value: 'KZT' }] },
      { includeApiKeys: false, now },
    );
    expect(JSON.stringify(backup)).not.toContain('sk-secret');
    expect(backup.tables.settings).toContainEqual({ key: 'currency', value: 'KZT' });
  });

  it('кладёт ключ, если попросили', () => {
    const backup = buildBackup(
      { settings: [{ key: 'ai', value: aiWithKey() }] },
      { includeApiKeys: true, now },
    );
    expect(JSON.stringify(backup)).toContain('sk-secret');
  });

  it('не переносит настройки, привязанные к устройству', () => {
    const backup = buildBackup(
      { settings: [{ key: 'lastBackupAt', value: 'x' }, { key: 'firstRunAt', value: 'y' }] },
      { includeApiKeys: false, now },
    );
    expect(backup.tables.settings).toEqual([]);
  });

  it('stripApiKeys не меняет исходный объект', () => {
    const ai = aiWithKey();
    expect(stripApiKeys(ai).configs.anthropic.apiKey).toBe('');
    expect(ai.configs.anthropic.apiKey).toBe('sk-secret');
  });
});

describe('parseBackup', () => {
  it('читает файл, созданный экспортом', () => {
    const text = JSON.stringify(buildBackup({ habits: [{ id: 'h1' }] }, { includeApiKeys: false, now }));
    expect(parseBackup(text).tables.habits).toEqual([{ id: 'h1' }]);
  });

  it('отклоняет не-JSON', () => {
    expect(() => parseBackup('привет')).toThrow(/повреждён/);
  });

  it('отклоняет чужой JSON', () => {
    expect(() => parseBackup('{"foo": 1}')).toThrow(/не файл бэкапа/);
    expect(() => parseBackup('[1,2]')).toThrow(/не файл бэкапа/);
  });

  it('отклоняет бэкап из более новой версии', () => {
    const text = JSON.stringify({ app: 'life-tracker', schemaVersion: 999, tables: {} });
    expect(() => parseBackup(text)).toThrow(/более новой версии/);
  });

  it('отклоняет таблицу, которая не является списком', () => {
    const text = JSON.stringify({ app: 'life-tracker', schemaVersion: 1, tables: { habits: {} } }); // старый бэкап тоже читается
    expect(() => parseBackup(text)).toThrow(/повреждён/);
  });
});

describe('isBackupDue', () => {
  const base = { firstRunAt: null, lastBackupAt: null, backupSnoozedAt: null };

  it('не напоминает в первую неделю после установки', () => {
    expect(isBackupDue({ ...base, firstRunAt: '2026-11-10T10:00:00Z' }, now)).toBe(false);
  });

  it('напоминает, если бэкапа не было больше недели', () => {
    expect(isBackupDue({ ...base, firstRunAt: '2026-11-01T10:00:00Z' }, now)).toBe(true);
    expect(isBackupDue({ ...base, lastBackupAt: '2026-11-05T09:00:00Z' }, now)).toBe(true);
  });

  it('не напоминает, если бэкап свежий', () => {
    expect(
      isBackupDue({ ...base, firstRunAt: '2026-01-01T00:00:00Z', lastBackupAt: '2026-11-12T10:00:00Z' }, now),
    ).toBe(false);
  });

  it('«Позже» откладывает напоминание на сутки', () => {
    const state = { ...base, firstRunAt: '2026-11-01T10:00:00Z' };
    expect(isBackupDue({ ...state, backupSnoozedAt: '2026-11-13T08:00:00Z' }, now)).toBe(false);
    expect(isBackupDue({ ...state, backupSnoozedAt: '2026-11-11T08:00:00Z' }, now)).toBe(true);
  });
});

describe('backupFileName', () => {
  it('содержит дату', () => {
    expect(backupFileName(new Date(2026, 10, 3))).toBe('tracker-backup-2026-11-03.json');
  });
});
