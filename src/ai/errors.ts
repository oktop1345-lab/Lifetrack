// Понятные тексты ошибок AI вместо технических сообщений.

export type AiErrorKind =
  | 'offline'
  | 'network'
  | 'no-key'
  | 'no-model'
  | 'no-url'
  | 'auth'
  | 'not-found'
  | 'rate-limit'
  | 'bad-request'
  | 'server'
  | 'refusal'
  | 'empty';

export class AiError extends Error {
  readonly kind: AiErrorKind;
  /** Исходное сообщение провайдера (на английском) - показываем мелким текстом. */
  readonly detail?: string;

  constructor(kind: AiErrorKind, message: string, detail?: string) {
    super(message);
    this.name = 'AiError';
    this.kind = kind;
    this.detail = detail;
  }
}

export function offlineError(): AiError {
  return new AiError(
    'offline',
    'Нет интернета. AI-ассистент работает только онлайн, остальные разделы доступны как обычно.',
  );
}

/** fetch не смог выполнить запрос (браузер не говорит почему - перечисляем возможные причины). */
export function networkError(online: boolean, providerLabel: string): AiError {
  if (!online) return offlineError();
  return new AiError(
    'network',
    `Не удалось связаться с «${providerLabel}». Возможные причины: провайдер не разрешает запросы ` +
      'прямо из браузера (CORS), неверный адрес сервера, провайдер недоступен в твоей стране ' +
      'или сеть блокирует соединение. Попробуй другую сеть или другого провайдера.',
  );
}

/** Сервер ответил ошибкой. */
export function httpError(status: number, providerLabel: string, detail?: string): AiError {
  if (status === 401 || status === 403) {
    return new AiError(
      'auth',
      `«${providerLabel}» не принял ключ. Проверь, что ключ вставлен целиком, не отозван и ` +
        'что на аккаунте есть доступ к API.',
      detail,
    );
  }
  if (status === 404) {
    return new AiError(
      'not-found',
      'Модель или адрес не найдены. Открой настройки и выбери модель из списка.',
      detail,
    );
  }
  if (status === 429) {
    return new AiError(
      'rate-limit',
      'Превышен лимит запросов или закончились средства на аккаунте провайдера. ' +
        'Подожди минуту или проверь баланс и лимиты.',
      detail,
    );
  }
  if (status === 402) {
    return new AiError('rate-limit', 'На аккаунте провайдера закончились средства.', detail);
  }
  if (status === 400 || status === 413 || status === 422) {
    return new AiError(
      'bad-request',
      'Провайдер отклонил запрос. Чаще всего это неверное название модели - выбери её из списка в настройках.',
      detail,
    );
  }
  if (status >= 500) {
    return new AiError(
      'server',
      `Сервер «${providerLabel}» сейчас перегружен или недоступен. Попробуй ещё раз через минуту.`,
      detail,
    );
  }
  return new AiError('server', `Ошибка провайдера (код ${status}).`, detail);
}

/** Достаёт текст ошибки из ответа провайдера: у всех он лежит в error.message. */
export function extractErrorDetail(body: unknown): string | undefined {
  if (typeof body === 'string') return body.slice(0, 300) || undefined;
  const item: unknown = Array.isArray(body) ? body[0] : body;
  if (typeof item !== 'object' || item === null) return undefined;
  const err = (item as { error?: unknown }).error;
  if (typeof err === 'string') return err;
  if (typeof err === 'object' && err !== null) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  const message = (item as { message?: unknown }).message;
  return typeof message === 'string' ? message : undefined;
}

export function describeError(err: unknown): { message: string; detail?: string } {
  if (err instanceof AiError) return { message: err.message, detail: err.detail };
  if (err instanceof Error) return { message: 'Что-то пошло не так.', detail: err.message };
  return { message: 'Что-то пошло не так.' };
}
