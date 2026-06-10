# Додавання поля `created` у frontmatter change-файлу

**Status:** Accepted
**Date:** 2026-06-03

## Context and Problem Statement

Генератор change-файлів (`npm/ch.js`) записував у frontmatter лише `bump` і `section`. Виникла потреба також зберігати дату й час створення (день, місяць, година, хвилини), щоб читач одразу бачив, коли запис було сформовано.

## Considered Options

- Додати поле `created` у frontmatter через окрему функцію `formatCreated`, яка приймає об'єкт `Date`
- Інші варіанти в transcript не обговорювалися.

## Decision Outcome

Chosen option: "Додати поле `created` у frontmatter через окрему функцію `formatCreated`", because вона дозволяє форматувати мітку часу детерміновано та незалежно від таймзони — `runCh` передає вже наявний об'єкт `now` у `serializeChange(entry, now)`, а тести перевіряють значення через той самий `formatCreated`, уникаючи жорсткого кодування рядка дати.

### Consequences

- Good, because тести залишаються стабільними в будь-якій таймзоні: очікуване значення обчислюється тією ж функцією `formatCreated`, що й у продакшн-коді.
- Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

- Змінені файли: `npm/ch.js`, `npm/tests/ch.test.mjs`
- Нова публічна функція `formatCreated` додана до іменованих експортів `ch.js` та імпортована в тестах.
- Виклик змінено з `serializeChange(entry)` на `serializeChange(entry, now)`.
- Тести: `bun run vitest run tests/ch.test.mjs` — 14 passed (1 file).
