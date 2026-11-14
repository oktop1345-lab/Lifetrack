import { describeError } from '../../ai/errors';
import { listModels, PROVIDER_ORDER, PROVIDERS } from '../../ai/providers';
import type { AiSettings, ProviderConfig, ProviderId } from '../../ai/types';
import { clearData, exportData, importData } from '../../core/backup';
import { formatDateTime } from '../../core/dates';
import { checkForUpdate, isPersisted, requestPersistence } from '../../core/pwa';
import { CURRENCIES, getSetting, setSetting } from '../../core/settings';
import { append, card, confirmSheet, field, h, icon, openSheet, seg, toast } from '../../core/ui';
import type { ThemeMode } from '../../core/theme';

export async function render(root: HTMLElement): Promise<void> {
  const [ai, currency, lastBackupAt, persisted, theme] = await Promise.all([
    getSetting('ai'),
    getSetting('currency'),
    getSetting('lastBackupAt'),
    isPersisted(),
    getSetting('theme'),
  ]);
  // После восстановления из копии тема могла поменяться - применяем её.
  window.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
  const rerender = (): void => {
    root.replaceChildren();
    void render(root);
  };

  root.append(
    aiCard(ai),
    themeCard(theme),
    currencyCard(currency),
    dataCard(lastBackupAt, persisted, rerender),
    aboutCard(),
  );
}

// ---------- AI ----------

function aiCard(ai: AiSettings): HTMLElement {
  const box = h('div', { class: 'stack', style: 'gap:14px' });
  let saveTimer: number | undefined;

  const save = (): void => {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void setSetting('ai', ai), 300);
  };

  const draw = (): void => {
    const def = PROVIDERS[ai.provider];
    const cfg: ProviderConfig = ai.configs[ai.provider];

    const providerSelect = h(
      'select',
      { class: 'select' },
      PROVIDER_ORDER.map((id) => h('option', { value: id, selected: id === ai.provider }, PROVIDERS[id].label)),
    );
    providerSelect.addEventListener('change', () => {
      ai.provider = providerSelect.value as ProviderId;
      void setSetting('ai', ai);
      draw();
    });

    const keyInput = h('input', {
      class: 'input',
      type: 'password',
      value: cfg.apiKey,
      placeholder: def.keyPlaceholder,
      autocomplete: 'off',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: false,
    });
    keyInput.addEventListener('input', () => {
      cfg.apiKey = keyInput.value.trim();
      save();
    });
    const eye = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Показать или скрыть ключ' }, icon('eye'));
    eye.addEventListener('click', () => {
      keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
    });

    const urlInput = h('input', {
      class: 'input',
      type: 'url',
      inputMode: 'url',
      value: cfg.baseUrl ?? '',
      placeholder: 'https://example.com/v1',
      autocomplete: 'off',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: false,
    });
    urlInput.addEventListener('input', () => {
      cfg.baseUrl = urlInput.value.trim();
      save();
    });

    const modelInput = h('input', {
      class: 'input',
      type: 'text',
      value: cfg.model,
      placeholder: 'название модели',
      autocomplete: 'off',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: false,
    });
    modelInput.addEventListener('input', () => {
      cfg.model = modelInput.value.trim();
      save();
    });

    const pickBtn = h('button', { class: 'btn', type: 'button' }, 'Выбрать из списка');
    const status = h('div', { class: 'slot' });
    pickBtn.addEventListener('click', () => {
      pickBtn.disabled = true;
      pickBtn.textContent = 'Загружаю список...';
      status.replaceChildren();
      window.clearTimeout(saveTimer);
      void setSetting('ai', ai)
        .then(() => listModels(ai))
        .then((models) => {
          if (models.length === 0) {
            status.replaceChildren(
              h('div', { class: 'note' }, 'Сервер не вернул ни одной модели. Впиши название модели вручную.'),
            );
            return;
          }
          openModelPicker(models, cfg.model, (model) => {
            cfg.model = model;
            modelInput.value = model;
            void setSetting('ai', ai);
            toast('Ключ работает, модель выбрана');
          });
        })
        .catch((err: unknown) => {
          const { message, detail } = describeError(err);
          status.replaceChildren(h('div', { class: 'note note-error' }, message, detail ? h('small', null, detail) : null));
        })
        .finally(() => {
          pickBtn.disabled = false;
          pickBtn.textContent = 'Выбрать из списка';
        });
    });

    box.replaceChildren();
    append(box, [
      field('Провайдер', providerSelect),
      def.needsBaseUrl
        ? field('Адрес сервера (base URL)', urlInput, 'Обычно заканчивается на /v1. Адрес должен начинаться с https://')
        : null,
      field('API-ключ', h('div', { class: 'input-wrap' }, keyInput, eye), def.keyHelp),
      field(
        'Модель',
        modelInput,
        ai.provider === 'anthropic'
          ? 'По умолчанию самая умная модель. Дешевле: claude-sonnet-5-5, ещё дешевле: claude-haiku-5-5.'
          : ai.provider === 'gemini'
            ? 'Нажми «Выбрать из списка» - приложение загрузит модели, доступные с твоим ключом. ' +
              'Для начала подойдёт модель со словом flash в названии: она быстрая и недорогая.'
            : 'Нажми «Выбрать из списка» - приложение загрузит модели, доступные с твоим ключом.',
      ),
      pickBtn,
      status,
      h(
        'div',
        { class: 'note note-warn' },
        'Ключ хранится только на этом устройстве, в хранилище браузера, и отправляется только выбранному ' +
          'провайдеру. Хранилище браузера не сейф: задай в кабинете провайдера лимит расходов на месяц.',
      ),
      h('a', { class: 'btn btn-primary', href: '#/assistant' }, 'Открыть чат'),
    ]);
  };

  draw();
  return card('AI-ассистент', box);
}

function openModelPicker(models: string[], current: string, onPick: (model: string) => void): void {
  const search = h('input', {
    class: 'input',
    type: 'search',
    placeholder: `Поиск (${models.length})`,
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: false,
  });
  const list = h('div', { class: 'list' });
  const sheet = openSheet('Модель', [search, list]);

  const draw = (): void => {
    const query = search.value.trim().toLowerCase();
    const found = models.filter((model) => model.toLowerCase().includes(query));
    list.replaceChildren(
      ...found.slice(0, 150).map((model) => {
        const row = h(
          'button',
          { class: 'list-row', type: 'button' },
          h('span', { class: 'grow', style: 'overflow-wrap:anywhere' }, model),
          model === current ? h('span', { style: 'color:var(--accent)' }, icon('habits', 22)) : null,
        );
        row.addEventListener('click', () => {
          onPick(model);
          sheet.close();
        });
        return row;
      }),
    );
    if (found.length === 0) list.append(h('p', { class: 'muted' }, 'Ничего не найдено'));
    if (found.length > 150) list.append(h('p', { class: 'muted small' }, 'Показаны первые 150. Уточни поиск.'));
  };
  search.addEventListener('input', draw);
  draw();
}

// ---------- Тема ----------

function themeCard(theme: ThemeMode): HTMLElement {
  return card(
    'Оформление',
    seg<ThemeMode>(
      [
        { value: 'light', label: 'Светлая' },
        { value: 'dark', label: 'Тёмная' },
        { value: 'auto', label: 'Как в iPhone' },
      ],
      theme,
      (value) => {
        void setSetting('theme', value).then(() => {
          window.dispatchEvent(new CustomEvent('themechange', { detail: value }));
        });
      },
    ),
  );
}

// ---------- Валюта ----------

function currencyCard(currency: string): HTMLElement {
  const select = h(
    'select',
    { class: 'select' },
    CURRENCIES.map((item) => h('option', { value: item.code, selected: item.code === currency }, item.label)),
  );
  select.addEventListener('change', () => {
    void setSetting('currency', select.value).then(() => toast('Валюта сохранена'));
  });
  return card('Валюта', field('В какой валюте считать финансы', select));
}

// ---------- Данные: бэкап, импорт, очистка ----------

function dataCard(lastBackupAt: string | null, persisted: boolean, rerender: () => void): HTMLElement {
  const includeKeys = h('input', { type: 'checkbox' });

  const exportBtn = h('button', { class: 'btn btn-primary', type: 'button' }, 'Сохранить копию данных');
  exportBtn.addEventListener('click', () => {
    void exportData(includeKeys.checked)
      .then((result) => {
        if (result === 'cancelled') return;
        toast(result === 'shared' ? 'Копия сохранена' : 'Файл с копией скачан');
        rerender();
      })
      .catch(() => toast('Не удалось сохранить копию', 'error'));
  });

  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  const importBtn = h('button', { class: 'btn', type: 'button' }, 'Восстановить из копии');
  importBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    void (async () => {
      const ok = await confirmSheet({
        title: 'Восстановить данные?',
        text: `Все текущие записи будут заменены данными из файла «${file.name}». Это нельзя отменить.`,
        confirmLabel: 'Заменить данные',
        danger: true,
      });
      if (!ok) return;
      try {
        await importData(await file.text());
        toast('Данные восстановлены');
        rerender();
      } catch (err) {
        toast(err instanceof Error ? err.message : 'Не удалось прочитать файл', 'error');
      }
    })();
  });

  const clearBtn = h('button', { class: 'btn btn-danger', type: 'button' }, 'Удалить все данные');
  clearBtn.addEventListener('click', () => {
    const alsoSettings = h('input', { type: 'checkbox' });
    void confirmSheet({
      title: 'Удалить все данные?',
      text: [
        h('p', null, 'Привычки, тренировки, учёба и финансы будут удалены с этого устройства. Это нельзя отменить.'),
        h('label', { class: 'check', style: 'margin-top:10px' }, alsoSettings, 'Также удалить настройки и API-ключ'),
      ],
      confirmLabel: 'Удалить',
      danger: true,
    }).then(async (ok) => {
      if (!ok) return;
      await clearData(alsoSettings.checked);
      toast('Данные удалены');
      rerender();
    });
  });

  const persistNote = h(
    'div',
    { class: 'note' },
    persisted
      ? 'Постоянное хранилище включено: браузер не удалит данные сам при нехватке места.'
      : 'Браузер пока не подтвердил постоянное хранилище. Добавь приложение на экран «Домой» и делай копии раз в неделю.',
  );
  if (!persisted) {
    void requestPersistence().then((granted) => {
      if (granted) {
        persistNote.textContent = 'Постоянное хранилище включено: браузер не удалит данные сам при нехватке места.';
      }
    });
  }

  return card(
    'Данные',
    h(
      'p',
      { class: 'muted small' },
      lastBackupAt ? `Последняя копия: ${formatDateTime(lastBackupAt)}` : 'Копий ещё не было.',
      ' Все данные хранятся только на этом iPhone. Копия - один файл, его можно сохранить в «Файлы» или iCloud.',
    ),
    exportBtn,
    h('label', { class: 'check' }, includeKeys, 'Включить API-ключи в копию'),
    importBtn,
    fileInput,
    persistNote,
    clearBtn,
  );
}

// ---------- О приложении ----------

function aboutCard(): HTMLElement {
  const updateBtn = h('button', { class: 'btn', type: 'button' }, 'Проверить обновление');
  updateBtn.addEventListener('click', () => {
    updateBtn.disabled = true;
    void checkForUpdate().then((result) => {
      updateBtn.disabled = false;
      if (result === 'updating') toast('Найдена новая версия, обновляю...');
      else if (result === 'latest') toast('Установлена последняя версия');
      else toast('Не удалось проверить. Нужен интернет.', 'error');
    });
  });
  return card(
    'О приложении',
    h('p', { class: 'muted small' }, `Версия ${__APP_VERSION__}, сборка от ${formatDateTime(__BUILD_TIME__)}.`),
    updateBtn,
  );
}
