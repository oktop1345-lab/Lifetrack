import { describe, expect, it } from 'vitest';
import { createSseParser } from './sse';

function collect(chunks: string[]): string[] {
  const out: string[] = [];
  const parser = createSseParser((data) => out.push(data));
  for (const chunk of chunks) parser.push(chunk);
  parser.flush();
  return out;
}

describe('createSseParser', () => {
  it('разбирает несколько событий', () => {
    expect(collect(['data: {"a":1}\n\ndata: {"a":2}\n\n'])).toEqual(['{"a":1}', '{"a":2}']);
  });

  it('склеивает событие, разрезанное на куски в любом месте', () => {
    expect(collect(['da', 'ta: {"te', 'xt":"при', 'вет"}\n', '\n'])).toEqual(['{"text":"привет"}']);
  });

  it('понимает переводы строк \\r\\n, в том числе разрезанные между кусками', () => {
    expect(collect(['data: one\r', '\n\r\ndata: two\r\n\r\n'])).toEqual(['one', 'two']);
  });

  it('пропускает комментарии и служебные поля', () => {
    expect(
      collect([': OPENROUTER PROCESSING\n\nevent: content_block_delta\nid: 7\ndata: x\n\n']),
    ).toEqual(['x']);
  });

  it('склеивает многострочные data', () => {
    expect(collect(['data: line1\ndata: line2\n\n'])).toEqual(['line1\nline2']);
  });

  it('отдаёт последнее событие без завершающей пустой строки', () => {
    expect(collect(['data: [DONE]'])).toEqual(['[DONE]']);
  });

  it('принимает data без пробела после двоеточия', () => {
    expect(collect(['data:{"a":1}\n\n'])).toEqual(['{"a":1}']);
  });
});
