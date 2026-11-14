import { db, SCHEMA_VERSION } from './db';
import { getSetting, setSetting } from './settings';
import type { AiSettings } from '../ai/types';

export const BACKUP_APP_ID = 'life-tracker';
export const BACKUP_INTERVAL_DAYS = 7;
const DAY_MS = 86_400_000;

export interface BackupFile {
  app: string;
  schemaVersion: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
}

/** Настройки, которые относятся к этому устройству и в бэкап не идут. */
const DEVICE_ONLY_SETTINGS = new Set(['firstRunAt', 'lastBackupAt', 'backupSnoozedAt', 'studyTimer']);

// ---------- Чистая логика (покрыта тестами) ----------

/** Убирает API-ключи из строки настроек AI. */
export function stripApiKeys(ai: AiSettings): AiSettings {
  const configs = Object.fromEntries(
    Object.entries(ai.configs).map(([id, cfg]) => [id, { ...cfg, apiKey: '' }]),
  ) as AiSettings['configs'];
  return { ...ai, configs };
}

export function buildBackup(
  tables: Record<string, unknown[]>,
  opts: { includeApiKeys: boolean; now: Date },
): BackupFile {
  const out: Record<string, unknown[]> = {};
  for (const [name, rows] of Object.entries(tables)) {
    if (name !== 'settings') {
      out[name] = rows;
      continue;
    }
    out[name] = (rows as { key: string; value: unknown }[])
      .filter((row) => !DEVICE_ONLY_SETTINGS.has(row.key))
      .map((row) =>
        row.key === 'ai' && !opts.includeApiKeys
          ? { key: row.key, value: stripApiKeys(row.value as AiSettings) }
          : row,
      );
  }
  return {
    app: BACKUP_APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: opts.now.toISOString(),
    tables: out,
  };
}

/** Проверяет файл бэкапа. Возвращает данные или бросает ошибку с понятным текстом. */
export function parseBackup(text: string): BackupFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Файл повреждён или это не файл бэкапа (не удалось прочитать JSON).');
  }
  if (typeof data !== 'object' || data === null) {
    throw new Error('Это не файл бэкапа Трекера.');
  }
  const file = data as Partial<BackupFile>;
  if (file.app !== BACKUP_APP_ID || typeof file.tables !== 'object' || file.tables === null) {
    throw new Error('Это не файл бэкапа Трекера.');
  }
  if (typeof file.schemaVersion !== 'number' || file.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      'Бэкап сделан в более новой версии приложения. Обнови приложение и попробуй снова.',
    );
  }
  for (const rows of Object.values(file.tables)) {
    if (!Array.isArray(rows)) throw new Error('Файл бэкапа повреждён: неверный формат таблиц.');
  }
  return {
    app: file.app,
    schemaVersion: file.schemaVersion,
    exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : '',
    tables: file.tables as Record<string, unknown[]>,
  };
}

/** Пора ли напомнить о бэкапе. */
export function isBackupDue(
  state: { firstRunAt: string | null; lastBackupAt: string | null; backupSnoozedAt: string | null },
  now: Date,
): boolean {
  const since = state.lastBackupAt ?? state.firstRunAt;
  if (!since) return false;
  if (now.getTime() - new Date(since).getTime() < BACKUP_INTERVAL_DAYS * DAY_MS) return false;
  // «Позже» откладывает напоминание на сутки.
  if (state.backupSnoozedAt && now.getTime() - new Date(state.backupSnoozedAt).getTime() < DAY_MS) {
    return false;
  }
  return true;
}

export function backupFileName(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `tracker-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

// ---------- Работа с базой и файлами ----------

async function readAllTables(): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const table of db.tables) out[table.name] = await table.toArray();
  return out;
}

/** Есть ли в базе что-то, кроме настроек. */
export async function hasUserData(): Promise<boolean> {
  for (const table of db.tables) {
    if (table.name !== 'settings' && (await table.count()) > 0) return true;
  }
  return false;
}

export type ExportResult = 'shared' | 'downloaded' | 'cancelled';

/** Экспорт всех данных в один JSON-файл. На iPhone открывает меню «Поделиться» (Сохранить в Файлы). */
export async function exportData(includeApiKeys: boolean): Promise<ExportResult> {
  const now = new Date();
  const backup = buildBackup(await readAllTables(), { includeApiKeys, now });
  const name = backupFileName(now);
  const json = JSON.stringify(backup, null, 2);
  const file = new File([json], name, { type: 'application/json' });

  let result: ExportResult = 'downloaded';
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      result = 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      downloadFile(file);
    }
  } else {
    downloadFile(file);
  }
  await setSetting('lastBackupAt', now.toISOString());
  await setSetting('backupSnoozedAt', null);
  return result;
}

function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Импорт: полностью заменяет данные содержимым файла. Настройки из файла накладываются поверх текущих. */
export async function importData(text: string): Promise<BackupFile> {
  const backup = parseBackup(text);
  const currentAi = await getSetting('ai');

  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      const rows = backup.tables[table.name];
      if (table.name === 'settings') {
        if (rows?.length) await table.bulkPut(rows);
        continue;
      }
      await table.clear();
      if (rows?.length) await table.bulkPut(rows);
    }
  });

  // Если бэкап был без ключей, сохраняем ключи, которые уже есть на устройстве.
  const importedAi = await getSetting('ai');
  let changed = false;
  for (const id of Object.keys(importedAi.configs) as (keyof AiSettings['configs'])[]) {
    if (!importedAi.configs[id].apiKey && currentAi.configs[id].apiKey) {
      importedAi.configs[id].apiKey = currentAi.configs[id].apiKey;
      changed = true;
    }
  }
  if (changed) await setSetting('ai', importedAi);
  return backup;
}

/** Удаляет все записи. Настройки и ключ - только если попросили. */
export async function clearData(alsoSettings: boolean): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      if (table.name === 'settings' && !alsoSettings) continue;
      await table.clear();
    }
  });
  if (alsoSettings) await setSetting('firstRunAt', new Date().toISOString());
}

export async function backupState(): Promise<{
  firstRunAt: string | null;
  lastBackupAt: string | null;
  backupSnoozedAt: string | null;
}> {
  const [firstRunAt, lastBackupAt, backupSnoozedAt] = await Promise.all([
    getSetting('firstRunAt'),
    getSetting('lastBackupAt'),
    getSetting('backupSnoozedAt'),
  ]);
  return { firstRunAt, lastBackupAt, backupSnoozedAt };
}
