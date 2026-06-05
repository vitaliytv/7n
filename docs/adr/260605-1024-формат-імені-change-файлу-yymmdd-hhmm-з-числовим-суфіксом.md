---
session: 2ac84166-fcf0-4623-8456-46ff69ce8784
captured: 2026-06-05T10:24:50+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/2ac84166-fcf0-4623-8456-46ff69ce8784.jsonl
---

## ADR Формат імені change-файлу: YYMMDD-HHMM з числовим суфіксом

## Context and Problem Statement
`ch.js` генерував ім'я change-файлу за схемою `<epoch-ms>-<random-hex>.md`, яка відповідала `@nitra/cursor@3.20.0`. У версії `3.21.0` канон перейшов на людино-читабельний формат `YYMMDD-HHMM.md` із детермінованим числовим суфіксом при колізії. При співіснуванні двох форматів у `.changes/` лексикографічне сортування давало неправильний порядок записів усередині секції релізу.

## Considered Options
* Залишити `epoch-ms + random-hex` (відповідає `@nitra/cursor@3.20.0`)
* Перейти на `YYMMDD-HHMM[-N].md` з атомарним `wx`-записом (відповідає `@nitra/cursor@3.21.0`)

## Decision Outcome
Chosen option: "Перейти на `YYMMDD-HHMM[-N].md` з атомарним `wx`-записом", because `@nitra/cursor@3.21.0` встановлює цей формат каноном, а epoch-ms-імена порушують лексикографічний порядок при спільному використанні `.changes/` після оновлення залежності.

### Consequences
* Good, because ім'я файлу стає людино-читабельним (момент створення видно без зайвих метаданих).
* Good, because анти-колізія стає детермінованою (`-2`, `-3`) замість ймовірнісної (random-hex), що спрощує тести та відлагодження.
* Bad, because transcript не містить підтверджених негативних наслідків (встановлений у 7n `@nitra/cursor` лишається `3.20.0`, тобто вбудований `change`-CLI поки що сам генерує старий формат до оновлення залежності).

## More Information
- Файли: `npm/ch.js` (`changeFileName`, `formatChangeTimestamp`, `writeUniqueChange`), `npm/tests/ch.test.mjs`
- Канонічна реалізація: `/Users/vitalii/www/nitra/cursor/npm/rules/release/lib/change-file.mjs` (`formatChangeTimestamp`, рядок ~71; `writeUniqueChangeFile`, атомарний `{ flag: 'wx' }`)
- Change-файл: `npm/.changes/260605-1011.md`
- Перевірка: `bun run vitest run tests/ch.test.mjs` → 15/15 passed; `npx @nitra/cursor fix changelog` → exit 0

---

## ADR Видалення поля `created` з frontmatter change-файлу

## Context and Problem Statement
`ch.js` дописував до frontmatter третє поле `created: дд.мм гг:хх` (функція `formatCreated`), якого немає в специфікації `@nitra/cursor`. Після переходу на `YYMMDD-HHMM`-імена (ADR вище) поле стало повністю надлишковим: момент створення вже кодований в імені файлу. Постало питання: чи варто канонізувати `created` в `@nitra/cursor`, чи прибрати його з `ch.js`.

## Considered Options
* Додати `created` до канону `@nitra/cursor`
* Прибрати `created`/`formatCreated` з `ch.js`, вирівнявшись із каноном

## Decision Outcome
Chosen option: "Прибрати `created`/`formatCreated` з `ch.js`", because поле дублює інформацію з імені файлу, `parseChangeFile` його мовчки ігнорує, дата в CHANGELOG — це дата релізу (ставить `n-cursor release` з `new Date()` у CI, `release.mjs:76`), а не дата створення change-файлу; канон свідомо декларує мінімальний frontmatter (`bump` + `section` + опис).

### Consequences
* Good, because `serializeChange` у `ch.js` тепер видає рівно `bump` + `section` + опис — повний збіг із `serializeChangeFile` у `@nitra/cursor@3.21.0`.
* Good, because усуває ризик помилки при майбутньому strict-парсингу невідомих ключів у `parseChangeFile`.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Видалені: `export function formatCreated` і її виклик у `serializeChange` (`npm/ch.js`); імпорт і тест `formatCreated` (`npm/tests/ch.test.mjs`)
- Аргумент проти канонізації: `git blame`/commit-час вже зберігає момент створення; поле `created` у `ch.js` ніколи не читалося жодним консюмером (`parseChangeFile` у `change-file.mjs:39` валідує лише `bump`/`section`)
- Перевірка: `grep -rn "formatCreated\|created" npm/ch.js npm/tests/ch.test.mjs` → exit 1 (не знайдено); тести → 15/15 passed
