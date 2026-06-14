# Видалення поля `created` з frontmatter change-файлу в `ch.js`

**Status:** Accepted
**Date:** 2026-06-05

## Context and Problem Statement

`ch.js` записував у frontmatter change-файлу третє поле `created: дд.мм гг:хх` (функція `formatCreated`), якого немає в канонічній специфікації `@nitra/cursor` жодної версії. Після переходу формату імені change-файлу на `YYMMDD-HHMM.md` момент створення вже закодований в імені файлу, тому поле `created` стало повністю надлишковим. Постало питання: канонізувати `created` в `@nitra/cursor`, чи прибрати його з `ch.js`.

## Considered Options

* Додати `created` до канону `@nitra/cursor` як стандартне поле
* Прибрати `created`/`formatCreated` з `ch.js`, вирівнявши серіалізацію під канонічний мінімум (`bump` + `section`)

## Decision Outcome

Chosen option: "Прибрати `created`/`formatCreated` з `ch.js`", because у схемі `@nitra/cursor@3.21.0` момент створення вже закодовано в імені `YYMMDD-HHMM.md`; `parseChangeFile` поле `created` ніколи не читає і не передає далі; дата в `CHANGELOG.md` — це дата релізу (ставить `n-cursor release` з `new Date().toISOString().slice(0,10)` у CI, `release.mjs:76`), а не дата створення change-файлу; канон свідомо декларує мінімальний frontmatter (`bump` + `section` + опис).

### Consequences

* Good, because `serializeChange` у `ch.js` тепер видає рівно `bump` + `section` + опис — повний збіг із `serializeChangeFile` у `@nitra/cursor@3.21.0`.
* Good, because усуває ризик помилки при майбутньому strict-парсингу невідомих ключів у `parseChangeFile`; тести детерміновані (немає залежності від годинника у вмісті файлу).
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

* Видалено з `npm/ch.js`: функція `formatCreated`, параметр `now` у `serializeChange`, поле `created:` у серіалізованому frontmatter; відповідний тест `formatCreated` видалено з `npm/tests/ch.test.mjs`.
* Канон-підтвердження: `serializeChangeFile` у `change-file.mjs` записує рівно `bump` і `section`; `parseChangeFile` валідує лише ці два ключі.
* Аргумент проти канонізації: `git blame`/commit-час вже зберігає момент створення; поле `created` у `ch.js` ніколи не читалося жодним консюмером.
* Перевірка: `grep -rn "formatCreated\|created" npm/ch.js npm/tests/ch.test.mjs` → exit 1 (не знайдено); тести → 15/15 passed.

## Update 2026-06-05

Додаткове підтвердження з окремої сесії:
- `parseChangeFile` у `change-file.mjs:39` валідує лише `bump`/`section`; поле `created` ніколи не читалося жодним консюмером.
- Перевірка після видалення: `grep -rn "formatCreated\|created" npm/ch.js npm/tests/ch.test.mjs` → exit 1.
