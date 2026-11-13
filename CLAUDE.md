# Трекер жизни (PWA для iPhone)

Личное приложение: привычки, тренировки, учёба, финансы, диаграммы и AI-ассистент.
Ставится на экран «Домой» из Safari. Без бэкенда, без регистрации, без App Store.

## Владелец и стиль работы

- Владелец не разработчик, у него только iPhone (нет Mac, нет локального терминала).
  Объяснять простым языком, по шагам. Не предлагать ничего, что требует компьютера.
- Результат владелец смотрит только по ссылке GitHub Pages в Safari на iPhone.
- Работа идёт этапами. После каждого этапа: `npm run test`, `npm run build`, без ошибок,
  затем коммит и push (деплой запускается сам), затем короткое объяснение «как посмотреть».
- Не добавлять зависимости и функции, которых не просили.
- Интерфейс на русском языке.

## Стек (зафиксирован)

- Vite + TypeScript, без UI-фреймворков (обычный DOM, маленькие функции-помощники).
- Dexie (IndexedDB) для данных.
- Chart.js через npm, входит в сборку. Никаких CDN, внешних шрифтов и скриптов.
- vite-plugin-pwa: манифест + service worker (precache всей сборки, офлайн после первой загрузки).
- Vitest для тестов логики (только dev-зависимость).
- Деплой: GitHub Actions -> GitHub Pages. Репозиторий `oktop1345-lab/Lifetrack`, ветка `main`.
  `base` в Vite берётся из переменной `BASE_PATH`, её задаёт workflow как `/<имя-репозитория>/`.
  Адрес приложения: https://oktop1345-lab.github.io/Lifetrack/

## Жёсткие правила

- Все данные только на устройстве (IndexedDB). Никакой аналитики, никаких сторонних запросов,
  кроме запросов к выбранному AI-провайдеру.
- API-ключ хранится только на устройстве (таблица `settings`), никогда не попадает в репозиторий,
  в экспорт по умолчанию не включается (при экспорте спрашивать отдельной галочкой).
- AI получает сводки за период, а не всю базу.
- Офлайн: всё, кроме AI, работает без сети. AI без сети показывает понятное сообщение.
- Ошибки сети/CORS/неверного ключа показывать человеческим текстом, не пустым экраном.
- Mobile-first: нижняя навигация, зоны нажатия от 44px, safe-area (`env(safe-area-inset-*)`),
  тёмная/светлая тема через `prefers-color-scheme`.

## Структура проекта

```
lifetrack/
  index.html              meta-теги iOS, apple-touch-icon, viewport-fit=cover
  vite.config.ts          base path, vite-plugin-pwa (манифест, service worker), настройки vitest
  public/icons/           apple-touch-icon.png (180), icon-192.png, icon-512.png, favicon.svg
  .github/workflows/deploy.yml
  src/
    main.ts               запуск: каркас (шапка, навигация), роутер, persist(), напоминание о бэкапе,
                          подгонка высоты под клавиатуру iPhone
    routes.ts             список экранов - новый модуль подключается одной строкой здесь
    core/
      db.ts               схема Dexie (все таблицы и версии), newId()
      types.ts            типы записей
      router.ts           hash-роутер (#/today, #/habits ...) - работает на GitHub Pages
      ui.ts               h() для DOM, иконки SVG, toast, шторка снизу (openSheet, confirmSheet), card, field
      dates.ts            работа с датами (локальные YYYY-MM-DD, недели, месяцы)
      markdown.ts         разбор и отрисовка Markdown для ответов AI (без innerHTML)
      pwa.ts              service worker, проверка обновления, persist(), isStandalone()
      backup.ts           экспорт/импорт JSON, очистка, напоминание раз в неделю
      settings.ts         чтение/запись настроек, список валют
      charts.ts           (этап 2) общая настройка Chart.js
    styles/               base.css (переменные темы, каркас), components.css
    modules/
      placeholder.ts      заглушка для ещё не сделанных разделов
      today/              view.ts
      habits/             logic.ts  logic.test.ts  view.ts  charts.ts
      finance/            logic.ts  logic.test.ts  view.ts  charts.ts
      workouts/           logic.ts  logic.test.ts  view.ts  charts.ts
      study/              logic.ts  logic.test.ts  view.ts  charts.ts
      assistant/          view.ts (чат)
      settings/           view.ts
    ai/
      types.ts            ProviderId, AiSettings, ChatMessage
      providers.ts        Anthropic, OpenAI, OpenRouter, Gemini, свой OpenAI-совместимый; streamChat, listModels
      sse.ts              разбор потокового ответа
      errors.ts           понятные тексты ошибок (нет сети, CORS, 401, 404, 429)
      context.ts          (этап 5) сборка сводки данных для модели
```

Правило модулей: каждый модуль - своя папка. `logic.ts` - чистые функции без DOM и без БД
(их и тестируем). `view.ts` экспортирует `render(container)`. Модуль подключается одной строкой
в `routes.ts` и своими таблицами в `db.ts`. Модули не импортируют друг друга; общее - в `core/`.
Исключения: `today` и `ai/context.ts` читают `logic.ts` других модулей.

## Данные (Dexie, база `life-tracker`)

Общие правила:
- `id` - строка `crypto.randomUUID()`.
- День - строка `YYYY-MM-DD` в местном времени. Момент времени - ISO-строка.
- Деньги - целое число в минимальных единицах (копейки/тиыны/центы), без дробей.
- Длительность - целые минуты.
- Новая таблица или индекс = новая версия `db.version(n)`, старые версии не трогать.

| Таблица | Поля | Индексы |
|---|---|---|
| `settings` | `key`, `value` | `key` |
| `habits` | `id`, `name`, `schedule: {type:'daily'} \| {type:'weekdays', days:number[]}` (1=Пн..7=Вс), `createdAt`, `archivedAt?` | `id` |
| `habitChecks` | `id`, `habitId`, `date` | `id`, `[habitId+date]` (уникальный), `date` |
| `workouts` | `id`, `date`, `type`, `note?`, `exercises: [{name, sets:[{weight, reps}]}]` | `id`, `date` |
| `studySubjects` | `id`, `name`, `createdAt`, `archivedAt?` | `id` |
| `studyGoals` | `id`, `subjectId`, `title`, `targetMinutes`, `deadline?`, `createdAt`, `doneAt?` | `id`, `subjectId` |
| `studySessions` | `id`, `subjectId`, `goalId?`, `date`, `minutes`, `note?` | `id`, `date`, `subjectId`, `goalId` |
| `categories` | `id`, `name`, `kind:'income'\|'expense'` | `id`, `kind` |
| `transactions` | `id`, `kind:'income'\|'expense'`, `amount`, `categoryId`, `date`, `note?` | `id`, `date`, `categoryId` |
| `savingsGoals` | `id`, `name`, `target`, `saved`, `deadline?`, `createdAt` | `id` |

Ключи `settings` (тип `AppSettings` в `core/settings.ts`): `currency` (по умолчанию `KZT`), `monthlyBudget`,
`ai` (`{provider, configs: {<провайдер>: {apiKey, model, baseUrl?}}}` - у каждого провайдера свой ключ и модель),
`firstRunAt`, `lastBackupAt`, `backupSnoozedAt`. На этапе 4 добавится `studyTimer`
(`{subjectId, goalId?, startedAt}` - таймер считается от времени старта, потому что iOS останавливает JS в фоне).

История чата с AI живёт только в памяти до закрытия приложения (в БД не пишется).

## Бэкап

- Экспорт: один JSON `{app, schemaVersion, exportedAt, tables: {имя: [...]}}`. Экспорт проходит по всем
  таблицам `db.tables` автоматически - новый модуль попадает в бэкап без правок.
- Импорт: проверка `app` и `schemaVersion`, затем полная замена данных в одной транзакции
  (с подтверждением). Настройки из файла накладываются поверх текущих; если в файле нет ключей,
  ключи на устройстве сохраняются. `firstRunAt`, `lastBackupAt`, `backupSnoozedAt` в файл не идут.
- На iPhone экспорт открывает меню «Поделиться» (Сохранить в Файлы), иначе - обычное скачивание.
- Напоминание: если с `lastBackupAt` прошло больше 7 дней - плашка при открытии приложения
  (фоновые уведомления в PWA на iOS ненадёжны, поэтому напоминание внутри приложения).
- При запуске: `navigator.storage.persist()`.

## AI

- Провайдеры: Anthropic (`anthropic-dangerous-direct-browser-access: true`), OpenAI, OpenRouter,
  Gemini, свой OpenAI-совместимый endpoint (base URL + модель).
- Единый интерфейс: `streamChat(ai, {system, messages, onDelta, signal})`. Потоковый вывод через SSE,
  если поток недоступен - обычный ответ целиком. Запросы через `fetch`, без SDK (лишняя зависимость).
- Anthropic: версия API `2026-10-21`, модель по умолчанию `claude-opus-5-5`, `max_tokens: 64000`,
  без `temperature` и без параметра `thinking`. Для моделей из `ANTHROPIC_FALLBACK_MODELS` шлём
  `fallbacks: "default"` + beta `server-side-fallback-2026-07-01`; при ответе 400 повторяем без них.
- У OpenAI, OpenRouter и Gemini модели по умолчанию нет (названия быстро устаревают): в настройках
  кнопка «Выбрать из списка» грузит модели, доступные с ключом пользователя (`listModels`).
- Перед написанием кода провайдеров сверять актуальные API (модели, заголовки) с документацией.
- Контекст: сводки за выбранный период (по умолчанию 30 дней) - суммы по категориям, серии и проценты
  привычек, объём тренировок по неделям, часы учёбы по предметам. Сырые записи не отправлять.

## Навигация

Нижняя панель (5 вкладок): Сегодня, Привычки, Тренировки, Учёба, Финансы.
AI-ассистент и Настройки - кнопки в шапке справа.

Шапка статуса iOS: `apple-mobile-web-app-status-bar-style = default` (при `black-translucent` часы
в светлой теме были бы белыми на светлом фоне).

## Команды

- `npm run dev` - локальный запуск
- `npm run test` - тесты логики (Vitest)
- `npm run build` - проверка типов + сборка в `dist/`
- Проверка как на GitHub Pages: `BASE_PATH=/Lifetrack/ npm run build`, затем
  `BASE_PATH=/Lifetrack/ npx vite preview` и открыть в Playwright с `devices['iPhone 14']`.

## Этапы

- [x] 1. Каркас: проект, PWA, навигация, тема, схема БД, настройки (экспорт/импорт, AI-ключ), простой чат, деплой
- [ ] 2. Привычки + диаграммы (тепловая карта за год, столбцы по неделям)
- [ ] 3. Финансы + диаграммы (кольцо по категориям, доходы/расходы по месяцам, прогресс к цели)
- [ ] 4. Тренировки и учёба + диаграммы
- [ ] 5. «Сегодня», обзоры недели и месяца, AI с контекстом данных

Отмечать выполненные этапы здесь и дописывать принятые решения.
