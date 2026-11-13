// Разбор потокового ответа (Server-Sent Events): сервер присылает текст кусочками,
// каждое событие - строки 'data: ...', события разделены пустой строкой.

export interface SseParser {
  push(chunk: string): void;
  flush(): void;
}

export function createSseParser(onData: (data: string) => void): SseParser {
  let buffer = '';
  let dataLines: string[] = [];

  const dispatch = (): void => {
    if (dataLines.length === 0) return;
    const data = dataLines.join('\n');
    dataLines = [];
    onData(data);
  };

  const handleLine = (line: string): void => {
    if (line === '') {
      dispatch();
      return;
    }
    if (line.startsWith(':')) return; // комментарий (например, ': OPENROUTER PROCESSING')
    if (line.startsWith('data:')) {
      const value = line.slice(5);
      dataLines.push(value.startsWith(' ') ? value.slice(1) : value);
    }
    // Поля event:, id:, retry: нам не нужны - тип события есть внутри JSON.
  };

  return {
    push(chunk: string): void {
      buffer += chunk;
      let idx: number;
      while ((idx = buffer.search(/\r\n|\n|\r/)) !== -1) {
        // '\r' в самом конце куска может быть половиной '\r\n' - ждём следующий кусок.
        if (buffer[idx] === '\r' && idx === buffer.length - 1) break;
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + (buffer.startsWith('\r\n', idx) ? 2 : 1));
        handleLine(line);
      }
    },
    flush(): void {
      if (buffer !== '') {
        handleLine(buffer.replace(/\r$/, ''));
        buffer = '';
      }
      dispatch();
    },
  };
}

/** Читает тело ответа как поток и вызывает onData для каждого события. */
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onData: (data: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser(onData);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.flush();
  } finally {
    reader.cancel().catch(() => undefined);
  }
}
