// Простой разбор Markdown для ответов AI: заголовки, списки, жирный, курсив, код, ссылки.
// Разбор (parse) - чистая функция и покрыт тестами; отрисовка строит DOM без innerHTML.

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold'; children: Inline[] }
  | { type: 'italic'; children: Inline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; href: string };

export type Block =
  | { type: 'paragraph'; content: Inline[] }
  | { type: 'heading'; level: number; content: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'code'; text: string }
  | { type: 'rule' };

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n][^\n]*?\*\*)|(\*[^*\s][^*\n]*?\*)|(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest) {
    const match = INLINE.exec(rest);
    if (!match) {
      out.push({ type: 'text', text: rest });
      break;
    }
    if (match.index > 0) out.push({ type: 'text', text: rest.slice(0, match.index) });
    const token = match[0];
    if (match[1]) out.push({ type: 'code', text: token.slice(1, -1) });
    else if (match[2]) out.push({ type: 'bold', children: parseInline(token.slice(2, -2)) });
    else if (match[3]) out.push({ type: 'italic', children: parseInline(token.slice(1, -1)) });
    else {
      const split = token.indexOf('](');
      out.push({ type: 'link', text: token.slice(1, split), href: token.slice(split + 2, -1) });
    }
    rest = rest.slice(match.index + token.length);
  }
  return out;
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length) blocks.push({ type: 'paragraph', content: parseInline(paragraph.join('\n')) });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    if (line.trimStart().startsWith('```')) {
      flushParagraph();
      const code: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').trimStart().startsWith('```')) {
        code.push(lines[i] ?? '');
        i++;
      }
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      continue;
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph();
      blocks.push({ type: 'rule' });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ type: 'heading', level: (heading[1] ?? '#').length, content: parseInline(heading[2] ?? '') });
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = !bullet;
      const last = blocks[blocks.length - 1];
      const item = parseInline((bullet ?? numbered)?.[1] ?? '');
      if (last?.type === 'list' && last.ordered === ordered) last.items.push(item);
      else blocks.push({ type: 'list', ordered, items: [item] });
      continue;
    }

    paragraph.push(line.trim());
  }
  flushParagraph();
  return blocks;
}

function renderInline(parent: Node, items: Inline[]): void {
  for (const item of items) {
    if (item.type === 'text') parent.appendChild(document.createTextNode(item.text));
    else if (item.type === 'code') {
      const code = document.createElement('code');
      code.textContent = item.text;
      parent.appendChild(code);
    } else if (item.type === 'link') {
      const a = document.createElement('a');
      a.href = item.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = item.text;
      parent.appendChild(a);
    } else {
      const node = document.createElement(item.type === 'bold' ? 'strong' : 'em');
      renderInline(node, item.children);
      parent.appendChild(node);
    }
  }
}

export function renderMarkdown(source: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  for (const block of parseMarkdown(source)) {
    if (block.type === 'paragraph') {
      const p = document.createElement('p');
      renderInline(p, block.content);
      fragment.appendChild(p);
    } else if (block.type === 'heading') {
      const heading = document.createElement(block.level <= 2 ? 'h3' : 'h4');
      renderInline(heading, block.content);
      fragment.appendChild(heading);
    } else if (block.type === 'list') {
      const list = document.createElement(block.ordered ? 'ol' : 'ul');
      for (const item of block.items) {
        const li = document.createElement('li');
        renderInline(li, item);
        list.appendChild(li);
      }
      fragment.appendChild(list);
    } else if (block.type === 'code') {
      const pre = document.createElement('pre');
      pre.textContent = block.text;
      fragment.appendChild(pre);
    } else {
      fragment.appendChild(document.createElement('hr'));
    }
  }
  return fragment;
}
