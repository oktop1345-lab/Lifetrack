import { describe, expect, it } from 'vitest';
import { AiError } from './errors';
import { configProblem, normalizeBaseUrl, PROVIDERS, type StreamState } from './providers';
import type { ChatMessage } from './types';

const messages: ChatMessage[] = [
  { role: 'user', content: 'привет' },
  { role: 'assistant', content: 'здравствуй' },
  { role: 'user', content: 'как дела?' },
];

describe('Anthropic', () => {
  const def = PROVIDERS.anthropic;

  it('добавляет заголовок прямого доступа из браузера и ключ', () => {
    const req = def.chatRequest({ apiKey: 'sk-ant-1', model: 'claude-opus-5-5' }, 'система', messages);
    expect(req.url).toBe('https://api.anthropic.com/v1/messages');
    expect(req.headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(req.headers['x-api-key']).toBe('sk-ant-1');
    expect(req.body).toMatchObject({ model: 'claude-opus-5-5', stream: true, system: 'система', messages });
  });

  it('включает запасную модель только там, где она поддерживается', () => {
    const withFallback = def.chatRequest({ apiKey: 'k', model: 'claude-opus-5-5' }, 's', messages);
    expect(withFallback.body?.fallbacks).toBe('default');
    expect(withFallback.headers['anthropic-beta']).toBeDefined();

    const without = def.chatRequest({ apiKey: 'k', model: 'claude-haiku-5-5' }, 's', messages);
    expect(without.body?.fallbacks).toBeUndefined();
    expect(without.headers['anthropic-beta']).toBeUndefined();
  });

  it('достаёт текст из событий потока и игнорирует остальное', () => {
    const state: StreamState = {};
    expect(
      def.readEvent({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'При' } }, state),
    ).toBe('При');
    expect(def.readEvent({ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: '' } }, state)).toBe('');
    expect(def.readEvent({ type: 'message_start', message: {} }, state)).toBe('');
    expect(state.note).toBeUndefined();
  });

  it('замечает отказ модели и обрезанный ответ', () => {
    const refusal: StreamState = {};
    def.readEvent({ type: 'message_delta', delta: { stop_reason: 'refusal' } }, refusal);
    expect(refusal.note).toMatch(/отказалась/);

    const cut: StreamState = {};
    def.readEvent({ type: 'message_delta', delta: { stop_reason: 'max_tokens' } }, cut);
    expect(cut.note).toMatch(/обрезан/);
  });

  it('превращает событие error в понятную ошибку', () => {
    expect(() =>
      def.readEvent({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, {}),
    ).toThrow(AiError);
  });

  it('читает обычный ответ целиком', () => {
    const text = def.readFull(
      { stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Ответ' }] },
      {},
    );
    expect(text).toBe('Ответ');
  });
});

describe('OpenAI и совместимые', () => {
  it('кладёт системное сообщение первым и ключ в Authorization', () => {
    const req = PROVIDERS.openai.chatRequest({ apiKey: 'sk-1', model: 'gpt-x' }, 'система', messages);
    expect(req.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(req.headers.authorization).toBe('Bearer sk-1');
    const sent = req.body?.messages as { role: string }[];
    expect(sent[0]).toEqual({ role: 'system', content: 'система' });
    expect(sent).toHaveLength(4);
  });

  it('достаёт текст из потока', () => {
    const state: StreamState = {};
    expect(PROVIDERS.openai.readEvent({ choices: [{ delta: { content: 'Да' } }] }, state)).toBe('Да');
    expect(PROVIDERS.openai.readEvent({ choices: [{ delta: {}, finish_reason: 'stop' }] }, state)).toBe('');
    expect(PROVIDERS.openai.readEvent({ choices: [] }, state)).toBe('');
    expect(state.note).toBeUndefined();
  });

  it('ошибка внутри потока становится AiError', () => {
    expect(() => PROVIDERS.openrouter.readEvent({ error: { message: 'No credits' } }, {})).toThrow(AiError);
  });

  it('в списке моделей OpenAI остаются только чат-модели', () => {
    const models = PROVIDERS.openai.readModels({
      data: [{ id: 'gpt-x' }, { id: 'text-embedding-3-small' }, { id: 'gpt-x-audio-preview' }, { id: 'o9-mini' }],
    });
    expect(models).toEqual(['gpt-x', 'o9-mini']);
  });

  it('свой сервер: адрес нормализуется, ключ не обязателен', () => {
    expect(normalizeBaseUrl(' https://my.host/v1/ ')).toBe('https://my.host/v1');
    expect(normalizeBaseUrl('https://my.host/v1/chat/completions')).toBe('https://my.host/v1');
    const req = PROVIDERS.custom.chatRequest(
      { apiKey: '', model: 'llama', baseUrl: 'https://my.host/v1/' },
      's',
      messages,
    );
    expect(req.url).toBe('https://my.host/v1/chat/completions');
    expect(req.headers.authorization).toBeUndefined();
  });
});

describe('Gemini', () => {
  const def = PROVIDERS.gemini;

  it('переводит роли и системную инструкцию в формат Gemini', () => {
    const req = def.chatRequest({ apiKey: 'AIza', model: 'gemini-x' }, 'система', messages);
    expect(req.url).toContain('/models/gemini-x:streamGenerateContent?alt=sse');
    expect(req.headers['x-goog-api-key']).toBe('AIza');
    const contents = req.body?.contents as { role: string }[];
    expect(contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    expect(req.body?.systemInstruction).toEqual({ parts: [{ text: 'система' }] });
  });

  it('достаёт текст и пропускает «мысли» модели', () => {
    const text = def.readEvent(
      { candidates: [{ content: { parts: [{ text: 'скрыто', thought: true }, { text: 'Ответ' }] } }] },
      {},
    );
    expect(text).toBe('Ответ');
  });

  it('блокировка запроса становится понятной ошибкой', () => {
    expect(() => def.readEvent({ promptFeedback: { blockReason: 'SAFETY' } }, {})).toThrow(/заблокировал/);
  });

  it('в списке остаются только модели для генерации текста', () => {
    const models = def.readModels({
      models: [
        { name: 'models/gemini-x', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/embedding-1', supportedGenerationMethods: ['embedContent'] },
      ],
    });
    expect(models).toEqual(['gemini-x']);
  });
});

describe('configProblem', () => {
  it('сообщает, чего не хватает', () => {
    expect(configProblem(PROVIDERS.openai, { apiKey: '', model: 'm' })?.kind).toBe('no-key');
    expect(configProblem(PROVIDERS.openai, { apiKey: 'k', model: '' })?.kind).toBe('no-model');
    expect(configProblem(PROVIDERS.openai, { apiKey: 'k', model: '' }, false)).toBeNull();
    expect(configProblem(PROVIDERS.custom, { apiKey: '', model: 'm', baseUrl: '' })?.kind).toBe('no-url');
    expect(configProblem(PROVIDERS.custom, { apiKey: '', model: 'm', baseUrl: 'my.host' })?.kind).toBe('no-url');
    expect(configProblem(PROVIDERS.custom, { apiKey: '', model: 'm', baseUrl: 'https://my.host/v1' })).toBeNull();
  });
});
