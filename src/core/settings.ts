import { db } from './db';
import type { AiSettings } from '../ai/types';

export interface AppSettings {
  /** Код валюты ISO 4217, например 'KZT'. */
  currency: string;
  /** Месячный бюджет в минимальных единицах валюты или null, если не задан. */
  monthlyBudget: number | null;
  ai: AiSettings;
  firstRunAt: string | null;
  lastBackupAt: string | null;
  backupSnoozedAt: string | null;
}

export const CURRENCIES: { code: string; label: string }[] = [
  { code: 'KZT', label: 'Тенге (₸)' },
  { code: 'RUB', label: 'Рубль (₽)' },
  { code: 'USD', label: 'Доллар ($)' },
  { code: 'EUR', label: 'Евро (€)' },
  { code: 'KGS', label: 'Сом (KGS)' },
  { code: 'UZS', label: 'Сум (UZS)' },
  { code: 'BYN', label: 'Белорусский рубль (BYN)' },
  { code: 'UAH', label: 'Гривна (₴)' },
  { code: 'TRY', label: 'Лира (₺)' },
  { code: 'GBP', label: 'Фунт (£)' },
];

export function defaultAiSettings(): AiSettings {
  return {
    provider: 'anthropic',
    configs: {
      anthropic: { apiKey: '', model: 'claude-opus-5-5' },
      openai: { apiKey: '', model: '' },
      openrouter: { apiKey: '', model: '' },
      gemini: { apiKey: '', model: '' },
      custom: { apiKey: '', model: '', baseUrl: '' },
    },
  };
}

function defaults(): AppSettings {
  return {
    currency: 'KZT',
    monthlyBudget: null,
    ai: defaultAiSettings(),
    firstRunAt: null,
    lastBackupAt: null,
    backupSnoozedAt: null,
  };
}

export async function getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
  const row = await db.settings.get(key);
  const fallback = defaults()[key];
  if (!row || row.value === undefined) return fallback;
  if (key === 'ai') {
    // Достраиваем недостающих провайдеров, если их добавили в новой версии приложения.
    const saved = row.value as Partial<AiSettings>;
    const base = defaultAiSettings();
    return {
      provider: saved.provider ?? base.provider,
      configs: { ...base.configs, ...(saved.configs ?? {}) },
    } as AppSettings[K];
  }
  return row.value as AppSettings[K];
}

export async function setSetting<K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
): Promise<void> {
  await db.settings.put({ key, value });
}
