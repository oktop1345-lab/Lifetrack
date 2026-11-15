// Язык ответа AI в чате: на каком языке пользователь написал последнее сообщение, на таком и отвечаем.

import type { ChatMessage } from './types';

export type ReplyLanguage = 'ru' | 'en';

/** Язык текста по буквам: кириллица - русский, латиница - английский. Без букв (эмодзи, цифры) - null. */
export function detectLanguage(text: string): ReplyLanguage | null {
  const cyrillic = (text.match(/[а-яё]/gi) ?? []).length;
  const latin = (text.match(/[a-z]/gi) ?? []).length;
  if (cyrillic === 0 && latin === 0) return null;
  // Названия вроде «YouTube» или «Python» внутри русской фразы не должны переключать язык.
  return cyrillic >= latin * 0.3 && cyrillic > 0 ? 'ru' : 'en';
}

/**
 * Язык для ответа: по последнему сообщению пользователя. Если в нём нет букв («👍», «100»),
 * берём язык предыдущего его сообщения. По умолчанию - русский.
 */
export function replyLanguage(messages: ChatMessage[]): ReplyLanguage {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message?.role !== 'user') continue;
    const lang = detectLanguage(message.content);
    if (lang) return lang;
  }
  return 'ru';
}

/** Строка для системной инструкции. Идёт последней, после русской сводки данных, чтобы модель её не потеряла. */
export function languageInstruction(lang: ReplyLanguage): string {
  return lang === 'en'
    ? 'LANGUAGE: The user wrote their last message in English. Reply in English only. The data summary above is in Russian - translate any names and numbers you use from it into English.'
    : 'ЯЗЫК: пользователь написал последнее сообщение по-русски. Отвечай только на русском.';
}
