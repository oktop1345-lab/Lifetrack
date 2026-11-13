import { describe, expect, it } from 'vitest';
import { AiError, describeError, extractErrorDetail, httpError, networkError } from './errors';

describe('httpError', () => {
  it('различает типы ошибок по коду ответа', () => {
    expect(httpError(401, 'OpenAI').kind).toBe('auth');
    expect(httpError(403, 'OpenAI').kind).toBe('auth');
    expect(httpError(404, 'OpenAI').kind).toBe('not-found');
    expect(httpError(429, 'OpenAI').kind).toBe('rate-limit');
    expect(httpError(400, 'OpenAI').kind).toBe('bad-request');
    expect(httpError(529, 'Anthropic').kind).toBe('server');
  });

  it('сохраняет исходное сообщение провайдера', () => {
    expect(httpError(401, 'OpenAI', 'Incorrect API key').detail).toBe('Incorrect API key');
  });
});

describe('networkError', () => {
  it('без сети говорит про интернет', () => {
    expect(networkError(false, 'OpenAI').kind).toBe('offline');
  });

  it('при сети объясняет про CORS', () => {
    const err = networkError(true, 'Свой сервер');
    expect(err.kind).toBe('network');
    expect(err.message).toContain('CORS');
  });
});

describe('extractErrorDetail', () => {
  it('понимает формат Anthropic и OpenAI', () => {
    expect(extractErrorDetail({ type: 'error', error: { type: 'x', message: 'bad key' } })).toBe('bad key');
  });

  it('понимает формат Gemini (в том числе список)', () => {
    expect(extractErrorDetail([{ error: { code: 400, message: 'API key not valid' } }])).toBe(
      'API key not valid',
    );
  });

  it('понимает строку и неизвестный формат', () => {
    expect(extractErrorDetail({ error: 'oops' })).toBe('oops');
    expect(extractErrorDetail({ foo: 1 })).toBeUndefined();
    expect(extractErrorDetail(null)).toBeUndefined();
  });
});

describe('describeError', () => {
  it('не показывает пользователю техническую ошибку как основной текст', () => {
    expect(describeError(new TypeError('x is undefined')).message).toBe('Что-то пошло не так.');
    expect(describeError(new AiError('auth', 'Ключ не подошёл')).message).toBe('Ключ не подошёл');
  });
});
