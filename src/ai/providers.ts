// Подключение к AI-провайдерам напрямую из браузера, без сервера-посредника.
// Чтобы добавить провайдера, достаточно описать его в PROVIDERS.

import { AiError, extractErrorDetail, httpError, networkError, offlineError } from './errors';
import { readSseStream } from './sse';
import type { AiSettings, ChatMessage, ProviderConfig, ProviderId } from './types';

export interface HttpRequest {
  url: string;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
}

/** Что накопилось за время ответа, кроме самого текста. */
export interface StreamState {
  /** Пояснение, если ответ закончился необычно (обрезан, модель отказалась). */
  note?: string;
}

export interface ProviderDef {
  id: ProviderId;
  label: string;
  keyPlaceholder: string;
  /** Где взять ключ - показывается под полем. */
  keyHelp: string;
  keyRequired: boolean;
  needsBaseUrl: boolean;
  chatRequest(cfg: ProviderConfig, system: string, messages: ChatMessage[]): HttpRequest;
  /** Разбирает одно событие потока и возвращает новый кусочек текста. */
  readEvent(json: unknown, state: StreamState): string;
  /** Разбирает обычный (не потоковый) ответ целиком. */
  readFull(json: unknown, state: StreamState): string;
  modelsRequest(cfg: ProviderConfig): HttpRequest;
  readModels(json: unknown): string[];
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const asJson = (value: unknown): Json => (typeof value === 'object' && value !== null ? (value as Json) : {});

// ---------- Anthropic ----------

const ANTHROPIC_VERSION = '2026-10-21';
const ANTHROPIC_FALLBACK_BETA = 'server-side-fallback-2026-07-01';
/** Модели, для которых можно включить автоматический переход на запасную модель при отказе. */
const ANTHROPIC_FALLBACK_MODELS = new Set([
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
  'claude-fable-5-2',
  'claude-fable-5-1',
]);

function anthropicHeaders(cfg: ProviderConfig): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-api-key': cfg.apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    // Разрешает прямые запросы из браузера (без своего сервера).
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

function anthropicStop(reason: unknown, state: StreamState): void {
  if (reason === 'refusal') state.note = 'Модель отказалась отвечать на этот запрос.';
  if (reason === 'max_tokens') state.note = 'Ответ обрезан: достигнут предел длины.';
}

const anthropic: ProviderDef = {
  id: 'anthropic',
  label: 'Anthropic (Claude)',
  keyPlaceholder: 'sk-ant-...',
  keyHelp: 'Ключ создаётся на platform.claude.com в разделе API keys.',
  keyRequired: true,
  needsBaseUrl: false,
  chatRequest(cfg, system, messages) {
    const headers = anthropicHeaders(cfg);
    const body: Record<string, unknown> = {
      model: cfg.model,
      max_tokens: 64000,
      stream: true,
      system,
      messages,
    };
    if (ANTHROPIC_FALLBACK_MODELS.has(cfg.model)) {
      headers['anthropic-beta'] = ANTHROPIC_FALLBACK_BETA;
      body.fallbacks = 'default';
    }
    return { url: 'https://api.anthropic.com/v1/messages', headers, body };
  },
  readEvent(json, state) {
    const event = asJson(json);
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      return typeof event.delta.text === 'string' ? event.delta.text : '';
    }
    if (event.type === 'message_delta') anthropicStop(event.delta?.stop_reason, state);
    if (event.type === 'error') {
      const overloaded = event.error?.type === 'overloaded_error';
      throw overloaded
        ? httpError(529, 'Anthropic (Claude)', extractErrorDetail(event))
        : new AiError('server', 'Провайдер прервал ответ с ошибкой.', extractErrorDetail(event));
    }
    return '';
  },
  readFull(json, state) {
    const message = asJson(json);
    anthropicStop(message.stop_reason, state);
    const blocks: Json[] = Array.isArray(message.content) ? message.content : [];
    return blocks
      .filter((block) => block?.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('');
  },
  modelsRequest(cfg) {
    return { url: 'https://api.anthropic.com/v1/models?limit=1000', headers: anthropicHeaders(cfg) };
  },
  readModels(json) {
    return idList(asJson(json).data);
  },
};

// ---------- OpenAI и совместимые (OpenRouter, свой endpoint) ----------

function idList(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => asJson(item).id)
    .filter((id): id is string => typeof id === 'string' && id !== '');
}

function bearerHeaders(cfg: ProviderConfig): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`;
  return headers;
}

function openAiStop(reason: unknown, state: StreamState): void {
  if (reason === 'length') state.note = 'Ответ обрезан: достигнут предел длины.';
  if (reason === 'content_filter') state.note = 'Ответ остановлен фильтром содержания провайдера.';
}

function openAiReadEvent(json: unknown, state: StreamState): string {
  const event = asJson(json);
  if (event.error) {
    throw new AiError('server', 'Провайдер прервал ответ с ошибкой.', extractErrorDetail(event));
  }
  const choice = asJson(Array.isArray(event.choices) ? event.choices[0] : undefined);
  openAiStop(choice.finish_reason, state);
  const text = choice.delta?.content;
  return typeof text === 'string' ? text : '';
}

function openAiReadFull(json: unknown, state: StreamState): string {
  const choice = asJson(asJson(json).choices?.[0]);
  openAiStop(choice.finish_reason, state);
  const text = choice.message?.content;
  return typeof text === 'string' ? text : '';
}

/** Приводит адрес к виду 'https://host/v1' (без завершающих '/' и '/chat/completions'). */
export function normalizeBaseUrl(raw: string): string {
  return raw
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/, '')
    .replace(/\/+$/, '');
}

function openAiCompatible(
  meta: Pick<ProviderDef, 'id' | 'label' | 'keyPlaceholder' | 'keyHelp' | 'keyRequired' | 'needsBaseUrl'>,
  baseUrl: (cfg: ProviderConfig) => string,
  readModels: (json: unknown) => string[],
): ProviderDef {
  return {
    ...meta,
    chatRequest(cfg, system, messages) {
      return {
        url: `${baseUrl(cfg)}/chat/completions`,
        headers: bearerHeaders(cfg),
        body: {
          model: cfg.model,
          stream: true,
          messages: [{ role: 'system', content: system }, ...messages],
        },
      };
    },
    readEvent: openAiReadEvent,
    readFull: openAiReadFull,
    modelsRequest(cfg) {
      return { url: `${baseUrl(cfg)}/models`, headers: bearerHeaders(cfg) };
    },
    readModels,
  };
}

const OPENAI_CHAT_MODEL = /^(gpt-|o\d|chatgpt-)/;
const OPENAI_NOT_CHAT = /(audio|realtime|tts|transcribe|image|embedding|moderation|search|instruct|whisper|dall-e)/;

const openai = openAiCompatible(
  {
    id: 'openai',
    label: 'OpenAI',
    keyPlaceholder: 'sk-...',
    keyHelp: 'Ключ создаётся на platform.openai.com в разделе API keys.',
    keyRequired: true,
    needsBaseUrl: false,
  },
  () => 'https://api.openai.com/v1',
  (json) =>
    idList(asJson(json).data).filter((id) => OPENAI_CHAT_MODEL.test(id) && !OPENAI_NOT_CHAT.test(id)),
);

const openrouter = openAiCompatible(
  {
    id: 'openrouter',
    label: 'OpenRouter',
    keyPlaceholder: 'sk-or-...',
    keyHelp: 'Ключ создаётся на openrouter.ai в разделе Keys.',
    keyRequired: true,
    needsBaseUrl: false,
  },
  () => 'https://openrouter.ai/api/v1',
  (json) => idList(asJson(json).data),
);

const custom = openAiCompatible(
  {
    id: 'custom',
    label: 'Свой сервер (OpenAI-совместимый)',
    keyPlaceholder: 'ключ, если сервер его требует',
    keyHelp: 'Подойдёт любой сервер с OpenAI-совместимым API. Сервер должен разрешать запросы из браузера (CORS).',
    keyRequired: false,
    needsBaseUrl: true,
  },
  (cfg) => normalizeBaseUrl(cfg.baseUrl ?? ''),
  (json) => idList(asJson(json).data),
);

// ---------- Google Gemini ----------

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function geminiRead(json: unknown, state: StreamState): string {
  const event = asJson(Array.isArray(json) ? json[0] : json);
  if (event.error) {
    throw new AiError('server', 'Провайдер прервал ответ с ошибкой.', extractErrorDetail(event));
  }
  if (event.promptFeedback?.blockReason) {
    throw new AiError(
      'refusal',
      'Gemini заблокировал запрос фильтром безопасности.',
      String(event.promptFeedback.blockReason),
    );
  }
  const candidate = asJson(Array.isArray(event.candidates) ? event.candidates[0] : undefined);
  const reason = candidate.finishReason;
  if (reason === 'MAX_TOKENS') state.note = 'Ответ обрезан: достигнут предел длины.';
  else if (typeof reason === 'string' && reason !== 'STOP' && reason !== 'FINISH_REASON_UNSPECIFIED') {
    state.note = `Ответ остановлен провайдером (${reason}).`;
  }
  const parts: Json[] = Array.isArray(candidate.content?.parts) ? candidate.content.parts : [];
  return parts
    .filter((part) => typeof part?.text === 'string' && part.thought !== true)
    .map((part) => part.text as string)
    .join('');
}

const gemini: ProviderDef = {
  id: 'gemini',
  label: 'Google Gemini',
  keyPlaceholder: 'AIza...',
  keyHelp: 'Ключ создаётся на aistudio.google.com (кнопка Get API key).',
  keyRequired: true,
  needsBaseUrl: false,
  chatRequest(cfg, system, messages) {
    return {
      url: `${GEMINI_BASE}/models/${encodeURIComponent(cfg.model)}:streamGenerateContent?alt=sse`,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey },
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        })),
      },
    };
  },
  readEvent: geminiRead,
  readFull: geminiRead,
  modelsRequest(cfg) {
    return { url: `${GEMINI_BASE}/models?pageSize=1000`, headers: { 'x-goog-api-key': cfg.apiKey } };
  },
  readModels(json) {
    const models: Json[] = Array.isArray(asJson(json).models) ? asJson(json).models : [];
    return models
      .filter(
        (model) =>
          Array.isArray(model?.supportedGenerationMethods) &&
          model.supportedGenerationMethods.includes('generateContent'),
      )
      .map((model) => String(model.name ?? '').replace(/^models\//, ''))
      .filter((name) => name !== '');
  },
};

// ---------- Общее ----------

export const PROVIDERS: Record<ProviderId, ProviderDef> = { anthropic, openai, openrouter, gemini, custom };
export const PROVIDER_ORDER: ProviderId[] = ['anthropic', 'openai', 'openrouter', 'gemini', 'custom'];

export function activeProvider(ai: AiSettings): { def: ProviderDef; cfg: ProviderConfig } {
  return { def: PROVIDERS[ai.provider], cfg: ai.configs[ai.provider] };
}

/** Чего не хватает в настройках, чтобы отправить запрос. null - всё на месте. */
export function configProblem(def: ProviderDef, cfg: ProviderConfig, needModel = true): AiError | null {
  if (def.needsBaseUrl) {
    const url = normalizeBaseUrl(cfg.baseUrl ?? '');
    if (!url) return new AiError('no-url', 'Укажи адрес сервера в настройках AI.');
    if (!/^https?:\/\//.test(url)) {
      return new AiError('no-url', 'Адрес сервера должен начинаться с https://');
    }
  }
  if (def.keyRequired && !cfg.apiKey.trim()) {
    return new AiError('no-key', 'Сначала добавь API-ключ в настройках.');
  }
  if (needModel && !cfg.model.trim()) {
    return new AiError('no-model', 'Выбери модель в настройках AI (кнопка «Выбрать из списка»).');
  }
  return null;
}

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

async function send(def: ProviderDef, req: HttpRequest, signal?: AbortSignal): Promise<Response> {
  if (isOffline()) throw offlineError();
  let res: Response;
  try {
    res = await fetch(req.url, {
      method: req.body ? 'POST' : 'GET',
      headers: req.headers,
      body: req.body ? JSON.stringify(req.body) : undefined,
      signal,
    });
  } catch (err) {
    if (isAbort(err)) throw err;
    throw networkError(!isOffline(), def.label);
  }
  return res;
}

async function failFromResponse(def: ProviderDef, res: Response): Promise<never> {
  const text = await res.text().catch(() => '');
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    // не JSON - покажем как есть
  }
  throw httpError(res.status, def.label, extractErrorDetail(body));
}

export interface ChatOptions {
  system: string;
  messages: ChatMessage[];
  onDelta: (text: string) => void;
  signal?: AbortSignal;
}

/**
 * Отправляет чат выбранному провайдеру. Текст приходит кусочками в onDelta (потоковый вывод);
 * если провайдер не умеет поток - весь ответ придёт одним куском.
 */
export async function streamChat(ai: AiSettings, opts: ChatOptions): Promise<StreamState> {
  const { def, cfg } = activeProvider(ai);
  const problem = configProblem(def, cfg);
  if (problem) throw problem;

  const req = def.chatRequest(cfg, opts.system, opts.messages);
  let res = await send(def, req, opts.signal);
  if (res.status === 400 && req.body?.fallbacks !== undefined) {
    // Запасная модель недоступна для этого аккаунта - повторяем обычным запросом.
    const { fallbacks: _fallbacks, ...body } = req.body;
    const { 'anthropic-beta': _beta, ...headers } = req.headers;
    res = await send(def, { url: req.url, headers, body }, opts.signal);
  }
  if (!res.ok) await failFromResponse(def, res);

  const state: StreamState = {};
  let gotText = false;
  const emit = (text: string): void => {
    if (!text) return;
    gotText = true;
    opts.onDelta(text);
  };

  const isStream = (res.headers.get('content-type') ?? '').includes('text/event-stream');
  try {
    if (isStream && res.body) {
      await readSseStream(res.body, (data) => {
        if (data === '[DONE]') return;
        let json: unknown;
        try {
          json = JSON.parse(data);
        } catch {
          return;
        }
        emit(def.readEvent(json, state));
      });
    } else {
      emit(def.readFull(await res.json(), state));
    }
  } catch (err) {
    if (isAbort(err) || err instanceof AiError) throw err;
    throw new AiError(
      isOffline() ? 'offline' : 'network',
      'Соединение прервалось во время ответа. Проверь интернет и попробуй ещё раз.',
    );
  }

  if (!gotText && !state.note) {
    throw new AiError('empty', 'Провайдер вернул пустой ответ. Попробуй ещё раз или выбери другую модель.');
  }
  return state;
}

/** Загружает список моделей, доступных с этим ключом. Заодно проверяет, что ключ рабочий. */
export async function listModels(ai: AiSettings): Promise<string[]> {
  const { def, cfg } = activeProvider(ai);
  const problem = configProblem(def, cfg, false);
  if (problem) throw problem;
  const res = await send(def, def.modelsRequest(cfg));
  if (!res.ok) await failFromResponse(def, res);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new AiError('server', 'Сервер прислал непонятный ответ вместо списка моделей.');
  }
  return [...new Set(def.readModels(json))].sort((a, b) => a.localeCompare(b));
}
