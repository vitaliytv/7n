---
session: 2ac84166-fcf0-4623-8456-46ff69ce8784
captured: 2026-06-05T10:19:47+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/2ac84166-fcf0-4623-8456-46ff69ce8784.jsonl
---

## ADR Формат імені change-файлу в `ch.js`: `YYMMDD-HHMM` з числовим суфіксом

## Context and Problem Statement
`npm/ch.js` використовував формат імені `<epoch-ms>-<rand-hex>.md` (3 random-байти), що відповідало `@nitra/cursor@3.20.0`. У `3.21.0` канон перейшов на `YYMMDD-HHMM.md` з атомарним числовим суфіксом при колізії. Необхідно було вирівняти `ch.js` з актуальним каноном, щоб уникнути проблем з лексикографічним сортуванням у `.changes/` після оновлення залежності.

## Considered Options
* Залишити `epoch-ms + random hex` (сумісно з встановленою 3.20.0)
* Перейти на `YYMMDD-HHMM` + числовий суфікс через атомарний `wx` write (відповідає 3.21.0)

## Decision Outcome
Chosen option: "Перейти на `YYMMDD-HHMM` + числовий суфікс через атомарний `wx` write", because при підйомі `@nitra/cursor` до 3.21.0 у `.changes/` співіснували б два формати імен — epoch-рядки (`1…`) лексикографічно сортувалися б перед date-рядками (`2…`) незалежно від реального часу, порушуючи порядок записів у CHANGELOG.

### Consequences
* Good, because `changeFileName` у `ch.js` синхронізований з `formatChangeTimestamp` канонічного `@nitra/cursor@3.21.0`; лексикографічний порядок у `.changes/` тепер збігається з хронологічним.
* Bad, because встановлена версія в 7n — `3.20.0`, тобто канонічний `n-cursor change` CLI досі генерує старий формат до оновлення залежності; перехідний період зі змішаними форматами неминучий.

## More Information
- Змінені файли: `npm/ch.js`, `npm/tests/ch.test.mjs`
- Прибрано: `import { randomBytes } from 'node:crypto'`, інжект `io.rand`, хелпер `formatCreated`
- Додано: `formatChangeTimestamp` (дзеркало `change-file.mjs:71`), `writeUniqueChange` з циклом `wx` + `EEXIST`-інкрементом
- Канонічне джерело: `/Users/vitalii/www/nitra/cursor/npm/rules/release/lib/change-file.mjs` (`@nitra/cursor@3.21.0`)
- 16/16 тестів проходять після змін
- Change-файл покладено: `npm/.changes/260605-1011.md`
- Поле `created` у frontmatter (`serializeChange`) — не чіпали; формально дрейф від канону, але `parseChangeFile` ігнорує невідомі ключі
