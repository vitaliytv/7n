---
session: 2ac84166-fcf0-4623-8456-46ff69ce8784
captured: 2026-06-04T11:06:41+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/2ac84166-fcf0-4623-8456-46ff69ce8784.jsonl
---

## ADR Формат імені change-файлу: `YYMMDD-HHMM` замість `<epoch_ms>-<rand_hex>`

## Context and Problem Statement
У `@nitra/cursor@3.20.0` change-файли йшли у `.changes/<epoch_ms>-<rand_hex>.md` (де rand = `randomBytes(3).toString('hex')`). Версія 3.21.0 у `/Users/vitalii/www/nitra/cursor` замінила цей шаблон. Сесія виявила розбіжність між встановленим пакетом і актуальним джерелом.

## Considered Options
* `<epoch_ms>-<rand_hex>.md` — мілісекундний UNIX-timestamp + 3 random hex-байти (стара схема, 3.20.0)
* `YYMMDD-HHMM.md` з числовим суфіксом (`-2`, `-3`, …) при колізії хвилини (нова схема, 3.21.0)

## Decision Outcome
Chosen option: "`YYMMDD-HHMM.md` з numeric-суфіксом при колізії", because `@nitra/cursor@3.21.0` (`npm/rules/release/lib/change-file.mjs`, `npm/rules/release/change.mjs`) переписує шаблон на людиночитний формат дати та часу; документація у `change-file.mjs:1-5` явно описує нову конвенцію разом із механізмом уникнення колізій.

### Consequences
* Good, because імена файлів стають людиночитними без декодування epoch-рядка.
* Bad, because `npm/ch.js` у репозиторії `7n` все ще використовує стару схему `<epoch_ms>-<rand_hex>` і після оновлення до 3.21.0 розійдеться з канонічним форматом.

## More Information
* Канонічний код: `/Users/vitalii/www/nitra/cursor/npm/rules/release/lib/change-file.mjs`, `/Users/vitalii/www/nitra/cursor/npm/rules/release/change.mjs`
* Встановлена версія в 7n: `node_modules/@nitra/cursor@3.20.0` (стара схема)
* Актуальна версія джерела: `3.21.0` (нова схема)
* Правило проєкту: `.cursor/rules/n-changelog.mdc`

---

## ADR Поле `created` у frontmatter `ch.js` — розширення поза специфікацією

## Context and Problem Statement
Під час аудиту `npm/ch.js` виявлено, що локальний генератор change-файлів у репозиторії `7n` записує у frontmatter додаткове поле `created`, якого нема в специфікації `@nitra/cursor`. Питання — чи це ламає release-пайплайн і чи є дрейф навмисним.

## Considered Options
* Frontmatter лише з двома ключами `bump` + `section` (канон `@nitra/cursor`)
* Frontmatter із трьома ключами `bump` + `section` + `created` (реалізація в `ch.js`)

## Decision Outcome
Chosen option: "три ключі (`bump`, `section`, `created`)", because `ch.js` реалізує функцію `formatCreated` (ch.js:30) і `serializeChange` (ch.js:42), які явно дописують `created: дд.мм гг:хх` у локальному форматі. Поле несе метадані про час створення change-файлу.

### Consequences
* Good, because `parseChangeFile` у `@nitra/cursor@3.20.0` (change-file.mjs) не робить strict-валідацію на невідомі ключі — зайве поле мовчки ігнорується, release не ламається.
* Bad, because якщо `@nitra/cursor` введе strict-перевірку на невідомі ключі frontmatter, файли від `ch.js` стануть некоректними; поле `created` не потрапляє до `CHANGELOG.md` і є мертвим метаданим поза специфікацією.

## More Information
* `npm/ch.js:18` — константа `CHANGES_DIR`
* `npm/ch.js:30` — `formatCreated` (локальний формат `дд.мм гг:хх`)
* `npm/ch.js:42` — `serializeChange` (додає третій ключ)
* `npm/ch.js:158` — генерація `randomBytes(3).toString('hex')`
* Канонічний серіалізатор: `node_modules/@nitra/cursor/rules/release/lib/change-file.mjs:60` (`serializeChangeFile`)
