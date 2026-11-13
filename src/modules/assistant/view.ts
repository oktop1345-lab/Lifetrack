import { describeError } from '../../ai/errors';
import { activeProvider, configProblem, streamChat } from '../../ai/providers';
import type { ChatMessage } from '../../ai/types';
import { formatDayLong, todayStr } from '../../core/dates';
import { renderMarkdown } from '../../core/markdown';
import type { Cleanup } from '../../core/router';
import { getSetting } from '../../core/settings';
import { h, icon } from '../../core/ui';

// История чата живёт в памяти, пока приложение открыто (в базу не пишется).
const history: ChatMessage[] = [];

const SUGGESTIONS = [
  'Составь план тренировок на неделю для новичка',
  'Как закрепить новую привычку?',
  'С чего начать вести личный бюджет?',
];

function systemPrompt(): string {
  return [
    'Ты - ассистент внутри личного приложения «Трекер»: привычки, тренировки, учёба и финансы одного человека.',
    'Отвечай на русском языке, по делу и коротко: ответ читают на экране телефона.',
    'Используй короткие абзацы и простые списки. Не используй таблицы.',
    `Сегодня ${formatDayLong(todayStr())}.`,
    'Данных пользователя из приложения у тебя пока нет. Если для ответа нужны его цифры, попроси написать их в чат.',
  ].join('\n');
}

export async function render(root: HTMLElement): Promise<Cleanup> {
  root.classList.add('view-chat');

  const log = h('div', { class: 'chat-log' });
  const status = h('div', { class: 'chat-status slot' });
  const input = h('textarea', { rows: 1, placeholder: 'Сообщение', 'aria-label': 'Сообщение' });
  const sendBtn = h('button', { class: 'send-btn', type: 'button', 'aria-label': 'Отправить' }, icon('send'));
  root.append(log, status, h('div', { class: 'composer' }, input, sendBtn));

  let controller: AbortController | null = null;

  const scrollDown = (): void => {
    log.scrollTop = log.scrollHeight;
  };
  const nearBottom = (): boolean => log.scrollHeight - log.scrollTop - log.clientHeight < 80;

  const userBubble = (text: string): HTMLElement => h('div', { class: 'msg msg-user' }, text);
  const assistantBubble = (text: string): HTMLElement => {
    const node = h('div', { class: 'msg msg-assistant' });
    node.append(renderMarkdown(text));
    return node;
  };

  const drawIntro = (): void => {
    const chips = SUGGESTIONS.map((text) => {
      const chip = h('button', { class: 'chip', type: 'button' }, text);
      chip.addEventListener('click', () => void send(text));
      return chip;
    });
    log.replaceChildren(
      h(
        'div',
        { class: 'chat-intro' },
        h('h2', null, 'Спроси что-нибудь'),
        h('p', { class: 'muted' }, 'Позже ассистент научится видеть сводку твоих данных. Пока можно спросить совет:'),
        chips,
      ),
    );
  };

  // Номер текущего чата: если во время ответа нажали «Новый чат», старый ответ не должен попасть в новый.
  let chatEpoch = 0;

  const resetButton = (): HTMLElement => {
    const reset = h('button', { class: 'btn btn-quiet', type: 'button', style: 'align-self:center;min-height:40px' }, 'Новый чат');
    reset.addEventListener('click', () => {
      chatEpoch++;
      controller?.abort();
      history.length = 0;
      status.replaceChildren();
      drawHistory();
    });
    return reset;
  };

  const drawHistory = (): void => {
    if (history.length === 0) {
      drawIntro();
      return;
    }
    log.replaceChildren(
      resetButton(),
      ...history.map((message) => (message.role === 'user' ? userBubble(message.content) : assistantBubble(message.content))),
    );
    scrollDown();
  };

  /** Показывает, что мешает отправить сообщение (нет сети, нет ключа). Возвращает true, если всё готово. */
  const checkReady = async (): Promise<boolean> => {
    if (navigator.onLine === false) {
      status.replaceChildren(
        h('div', { class: 'note' }, 'Нет интернета. AI-ассистент работает только онлайн, остальные разделы доступны как обычно.'),
      );
      return false;
    }
    const { def, cfg } = activeProvider(await getSetting('ai'));
    const problem = configProblem(def, cfg);
    if (problem) {
      status.replaceChildren(
        h(
          'div',
          { class: 'note' },
          problem.message,
          h('a', { class: 'btn btn-primary', href: '#/settings', style: 'margin-top:10px;width:100%' }, 'Открыть настройки'),
        ),
      );
      return false;
    }
    status.replaceChildren();
    return true;
  };

  const setBusy = (busy: boolean): void => {
    sendBtn.replaceChildren(icon(busy ? 'stop' : 'send'));
    sendBtn.setAttribute('aria-label', busy ? 'Остановить' : 'Отправить');
  };

  const autoGrow = (): void => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight + 2, 140)}px`;
  };

  async function send(textArg?: string): Promise<void> {
    if (controller) return;
    const text = (textArg ?? input.value).trim();
    if (!text) return;
    if (!(await checkReady())) return;

    const ai = await getSetting('ai');
    const epoch = chatEpoch;
    if (history.length === 0) log.replaceChildren(resetButton());
    history.push({ role: 'user', content: text });
    log.append(userBubble(text));
    if (!textArg) {
      input.value = '';
      autoGrow();
    }

    const bubble = h('div', { class: 'msg msg-assistant' }, h('div', { class: 'typing' }, h('span'), h('span'), h('span')));
    log.append(bubble);
    scrollDown();

    let answer = '';
    let frame = 0;
    const paint = (): void => {
      frame = 0;
      const stick = nearBottom();
      bubble.replaceChildren(renderMarkdown(answer));
      if (stick) scrollDown();
    };

    controller = new AbortController();
    setBusy(true);
    try {
      const result = await streamChat(ai, {
        system: systemPrompt(),
        messages: history.slice(),
        signal: controller.signal,
        onDelta(delta) {
          answer += delta;
          if (!frame) frame = requestAnimationFrame(paint);
        },
      });
      cancelAnimationFrame(frame);
      paint();
      if (result.note) bubble.append(h('div', { class: 'msg-note' }, result.note));
    } catch (err) {
      cancelAnimationFrame(frame);
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      if (answer) paint();
      else bubble.remove();
      if (aborted) {
        if (answer) bubble.append(h('div', { class: 'msg-note' }, 'Остановлено.'));
      } else {
        const { message, detail } = describeError(err);
        status.replaceChildren(h('div', { class: 'note note-error' }, message, detail ? h('small', null, detail) : null));
      }
    } finally {
      controller = null;
      setBusy(false);
    }

    if (epoch !== chatEpoch) return; // пока шёл ответ, начали новый чат

    if (answer) {
      history.push({ role: 'assistant', content: answer });
    } else {
      // Ответа нет: убираем вопрос из истории и возвращаем текст в поле, чтобы можно было повторить.
      history.pop();
      log.lastElementChild?.remove();
      if (!input.value) {
        input.value = text;
        autoGrow();
      }
      if (history.length === 0) drawIntro();
    }
  }

  sendBtn.addEventListener('click', () => {
    if (controller) controller.abort();
    else void send();
  });
  input.addEventListener('input', autoGrow);

  const onNetworkChange = (): void => void checkReady();
  window.addEventListener('online', onNetworkChange);
  window.addEventListener('offline', onNetworkChange);

  drawHistory();
  await checkReady();

  return () => {
    controller?.abort();
    window.removeEventListener('online', onNetworkChange);
    window.removeEventListener('offline', onNetworkChange);
  };
}
