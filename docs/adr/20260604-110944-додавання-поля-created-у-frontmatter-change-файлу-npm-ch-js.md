---
session: d7fcb361-0332-4c17-88e1-d1606fa08586
captured: 2026-06-04T11:09:44+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/d7fcb361-0332-4c17-88e1-d1606fa08586.jsonl
---

## ADR Додавання поля `created` у frontmatter change-файлу (`npm/ch.js`)

## Context and Problem Statement
Change-файли, що генеруються `npm/ch.js` (`<ws>/.changes/<timestamp>-<rand>.md`), мали frontmatter лише з двома ключами (`bump`, `section`). Користувач попросив додати у заголовок час створення файлу — день, місяць, годину й хвилини.

## Considered Options
* Додати поле `created` у frontmatter change-файлу з локальним часом у форматі `ДД.ММ ГГ:ХХ`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Додати поле `created` у frontmatter change-файлу з локальним часом у форматі `ДД.ММ ГГ:ХХ`", because це покриває вимогу показувати день, місяць, годину та хвилини в заголовку файлу без зміни його структури.

Реалізація:
- У `npm/ch.js` додано функцію `formatCreated(now: Date): string`, що повертає рядок `DD.MM HH:mm` (локальний час, з дозаповненням нулями через `padStart`).
- `serializeChange(entry, now)` отримала другий параметр `now`; поле `created: <значення>` вставляється між `section` і закриваючим `---`.
- Перевірка парсера: `node_modules/@nitra/cursor/rules/release/lib/change-file.mjs` → `parseFrontmatterBlock` читає всі `ключ: значення` рядки у загальну мапу й не відхиляє невідомі ключі; `parseChangeFile` використовує тільки `bump` і `section` — поле `created` тихо ігнорується, реліз не ламається.

### Consequences
* Good, because час створення з'являється в заголовку change-файлу, що полегшує навігацію та аудит у файловому менеджері.
* Good, because парсер `@nitra/cursor release` толерантний до довільних ключів frontmatter — додавання поля не потребує змін у зовнішньому пакеті.
* Bad, because `@nitra/cursor` (v3.20.0) має власний `serializeChangeFile`, який не додає `created`, тому файли, створені через `npx @nitra/cursor change`, матимуть інший формат frontmatter, ніж файли з `npm/ch.js` — повної симетрії між двома генераторами нема.

## More Information
- Змінені файли: `npm/ch.js`, `npm/tests/ch.test.mjs`
- Перевірений парсер: `node_modules/@nitra/cursor/rules/release/lib/change-file.mjs` (`@nitra/cursor` v3.20.0)
- Запуск тестів: `cd npm && bun run vitest run tests/ch.test.mjs` → 14 passed
- Приклад згенерованого frontmatter:
```
---
bump: minor
section: Added
created: 03.06 14:30
---
опис
```
