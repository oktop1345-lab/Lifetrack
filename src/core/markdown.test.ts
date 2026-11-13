import { describe, expect, it } from 'vitest';
import { parseInline, parseMarkdown } from './markdown';

describe('parseInline', () => {
  it('выделяет жирный, курсив, код и ссылки', () => {
    expect(parseInline('a **b** *c* `d` [e](https://x.y)')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'bold', children: [{ type: 'text', text: 'b' }] },
      { type: 'text', text: ' ' },
      { type: 'italic', children: [{ type: 'text', text: 'c' }] },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'd' },
      { type: 'text', text: ' ' },
      { type: 'link', text: 'e', href: 'https://x.y' },
    ]);
  });

  it('не трогает одиночные звёздочки и умножение', () => {
    expect(parseInline('3 * 4 = 12')).toEqual([{ type: 'text', text: '3 * 4 = 12' }]);
  });

  it('не превращает в ссылку адреса не http(s)', () => {
    expect(parseInline('[x](javascript:alert(1))')).toEqual([
      { type: 'text', text: '[x](javascript:alert(1))' },
    ]);
  });
});

describe('parseMarkdown', () => {
  it('разбирает заголовки, абзацы и списки', () => {
    const blocks = parseMarkdown('## Итог\n\nТекст\nвторая строка\n\n- раз\n- два\n\n1. первый\n2. второй');
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list', 'list']);
    expect(blocks[2]).toMatchObject({ ordered: false, items: [[{ text: 'раз' }], [{ text: 'два' }]] });
    expect(blocks[3]).toMatchObject({ ordered: true });
  });

  it('блок кода не разбирается как разметка', () => {
    const blocks = parseMarkdown('```\n**не жирный**\n- не список\n```');
    expect(blocks).toEqual([{ type: 'code', text: '**не жирный**\n- не список' }]);
  });

  it('незакрытый блок кода (ответ ещё печатается) не ломает разбор', () => {
    expect(parseMarkdown('```js\nlet a = 1')).toEqual([{ type: 'code', text: 'let a = 1' }]);
  });

  it('пустой текст даёт пустой результат', () => {
    expect(parseMarkdown('')).toEqual([]);
  });
});
