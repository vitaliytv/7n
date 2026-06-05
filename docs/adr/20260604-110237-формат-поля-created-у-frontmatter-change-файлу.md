---
session: d7fcb361-0332-4c17-88e1-d1606fa08586
captured: 2026-06-04T11:02:37+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/d7fcb361-0332-4c17-88e1-d1606fa08586.jsonl
---

## ADR Формат поля `created` у frontmatter change-файлу

## Context and Problem Statement
У `npm/ch.js` генерується change-файл із frontmatter, що містить лише `bump` і `section`. Потрібно було додати мітку часу створення, видиму в заголовку файлу, щоб можна було відстежити, коли саме було зафіксовано зміну.

## Considered Options
* Поле `created` у frontmatter у форматі `DD.MM HH:MM` (локальний час, нулями)
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Поле `created` у frontmatter у форматі `DD.MM HH:MM`", because формат є лаконічним, людинозрозумілим і достатнім для ідентифікації дня й часу без зайвого року чи таймзони.

### Consequences
* Good, because transcript фіксує очікувану користь: поле відображає день, місяць, годину і хвилини безпосередньо у frontmatter, напр. `created: 03.06 14:30`.
* Bad, because парсер `@nitra/cursor` описаний як «мінімальний — лише ці два ключі (`bump`, `section`)»; сумісність із додатковим ключем `created` під час `n-cursor release` не була підтверджена до кінця сесії (transcript обірваний на читанні `change-file.mjs`).

## More Information
- Змінені файли: `npm/ch.js`, `npm/tests/ch.test.mjs`
- Нова публічна функція: `formatCreated(now: Date): string` — повертає рядок `DD.MM HH:MM` із нулями
- Змінена сигнатура: `serializeChange(entry, now)` — приймає `now` для вставки `created` між `section` і закриваючим `---`
- Перевірка сумісності: `node_modules/@nitra/cursor/rules/release/lib/change-file.mjs` — парсер описує себе як мінімальний; зайві ключі, найімовірніше, ігноруються, але явного підтвердження в transcript не зафіксовано
- Попередній ADR із тієї самої теми: `docs/adr/20260603-160207-додавання-поля-created-у-frontmatter-change-файлу.md`
- Тести: 14 passed — `bun run vitest run tests/ch.test.mjs`
