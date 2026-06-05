---
session: 2ac84166-fcf0-4623-8456-46ff69ce8784
captured: 2026-06-05T10:27:49+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/2ac84166-fcf0-4623-8456-46ff69ce8784.jsonl
---

## ADR Вирівнювання формату імені change-файлу в `ch.js` під `@nitra/cursor@3.21.0`

## Context and Problem Statement
`ch.js` (пакет `npm/` у 7n) генерував change-файли з іменем `<epoch-ms>-<rand-hex>.md` (3 random-байти через `randomBytes`) — схема відповідала `@nitra/cursor@3.20.0`. У версії `3.21.0` канон змінив формат на людино-читаблий `YYMMDD-HHMM.md` із числовим суфіксом (`-2`, `-3`) при колізії в ту саму хвилину. Після оновлення залежності у `.changes/` співіснували б два несумісні формати імен, що ламало б лексикографічне сортування в `readChangeFiles`.

## Considered Options
* Залишити `epoch-ms + random hex` (відповідає `@nitra/cursor@3.20.0`)
* Перейти на `YYMMDD-HHMM[-n].md` із атомарним `wx` create-only + числовим інкрементом (відповідає `@nitra/cursor@3.21.0`)

## Decision Outcome
Chosen option: "Перейти на `YYMMDD-HHMM[-n].md` із атомарним `wx` create-only + числовим інкрементом", because ім'я файлу стає людино-читабельним, анти-колізія — детермінованою, і `ch.js` повністю вирівнюється з канонічним `@nitra/cursor@3.21.0`.

### Consequences
* Good, because transcript фіксує очікувану користь: лексикографічний порядок `.changes/*.md` у `readChangeFiles` тепер відповідає хронологічному; `ch.js` і `n-cursor change` генерують однорідні імена в одному каталозі.
* Bad, because файли у `.changes/`, створені старою `ch.js` (`epoch-ms-hex.md`), лексикографічно будуть стояти перед новими (`2…`-іменами) незалежно від реального часу — але це наслідок перехідного стану, не архітектурний вибір.

## More Information
- Змінено: `npm/ch.js` — видалено `import { randomBytes }`, замінено `changeFileName` + `io.rand`; додано `formatChangeTimestamp` (дзеркало `change-file.mjs:71`) і `writeUniqueChange` з `writeFile(..., { flag: 'wx' })` + інкрементом.
- Канон-джерело: `/Users/vitalii/www/nitra/cursor/npm/rules/release/lib/change-file.mjs` (`@nitra/cursor@3.21.0`).
- Встановлена версія у 7n на момент змін: `@nitra/cursor@3.20.0` (`node_modules/@nitra/cursor/package.json`).
- Тести: `npm/tests/ch.test.mjs` — 15/15 після оновлення.

---

## ADR Видалення поля `created` з frontmatter change-файлу в `ch.js`

## Context and Problem Statement
`ch.js` записував у frontmatter change-файлу третє поле `created: дд.мм гг:хх` (через `formatCreated`), якого немає в канонічній специфікації `@nitra/cursor` (жодна версія). Виникло питання: чи варто це поле додати в канон, чи прибрати з `ch.js`.

## Considered Options
* Додати `created` у `@nitra/cursor` як стандартне поле
* Прибрати `created` з `ch.js`, вирівнявши серіалізацію під канонічний мінімум (`bump` + `section`)

## Decision Outcome
Chosen option: "Прибрати `created` з `ch.js`", because у схемі `3.21.0` момент створення вже закодовано в імені `YYMMDD-HHMM.md`; `parseChangeFile` поле `created` ніколи не читає і не передає далі; дата в `CHANGELOG.md` — це дата релізу (`release.mjs:76`), а не дата створення change-файлу; канонічна шапка `change-file.mjs` явно декларує мінімальний parser лише з двома ключами.

### Consequences
* Good, because `ch.js` тепер генерує frontmatter, ідентичний канонічному (`bump` + `section` + опис); тести детерміновані (немає залежності від годинника у вмісті файлу).
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Видалено з `npm/ch.js`: функція `formatCreated`, параметр `now` у `serializeChange`, поле `created:` у серіалізованому frontmatter.
- Канон-підтвердження: `serializeChangeFile` у `change-file.mjs` (канон) записує рівно `bump` і `section`; `parseChangeFile` валідує лише ці два ключі.
- Дата в CHANGELOG встановлюється `n-cursor release` через `new Date().toISOString().slice(0,10)` (`release.mjs:76`), незалежно від `created`.
- Тести: `npm/tests/ch.test.mjs` — 15/15 після видалення `formatCreated`-кейсу.
