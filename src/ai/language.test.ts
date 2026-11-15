import { describe, expect, it } from 'vitest';
import { detectLanguage, languageInstruction, replyLanguage } from './language';
import type { ChatMessage } from './types';

const user = (content: string): ChatMessage => ({ role: 'user', content });
const bot = (content: string): ChatMessage => ({ role: 'assistant', content });

describe('detectLanguage', () => {
  it('русский и английский', () => {
    expect(detectLanguage('Проанализируй мои траты')).toBe('ru');
    expect(detectLanguage('Analyze my spending this month')).toBe('en');
  });

  it('английские названия внутри русской фразы не меняют язык', () => {
    expect(detectLanguage('Сколько я сидел в YouTube и TikTok?')).toBe('ru');
    expect(detectLanguage('Как мне учить Python быстрее')).toBe('ru');
  });

  it('русское слово внутри английской фразы не меняет язык', () => {
    expect(detectLanguage('How is my habit «Зарядка» going this week?')).toBe('en');
  });

  it('без букв - не определяется', () => {
    expect(detectLanguage('👍 100%')).toBeNull();
  });
});

describe('replyLanguage', () => {
  it('следует за последним сообщением, даже если раньше писали на другом языке', () => {
    expect(replyLanguage([user('Привет'), bot('Здравствуй'), user('Now in English please')])).toBe('en');
    expect(replyLanguage([user('Hi'), bot('Hello'), user('А теперь по-русски')])).toBe('ru');
  });

  it('сообщение без букв берёт язык предыдущего', () => {
    expect(replyLanguage([user('Make me a workout plan'), bot('...'), user('👍')])).toBe('en');
  });

  it('по умолчанию русский', () => {
    expect(replyLanguage([])).toBe('ru');
    expect(replyLanguage([user('123')])).toBe('ru');
  });

  it('инструкция на нужном языке', () => {
    expect(languageInstruction('en')).toContain('Reply in English only');
    expect(languageInstruction('ru')).toContain('Отвечай только на русском');
  });
});
