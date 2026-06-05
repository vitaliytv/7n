---
session: 2ac84166-fcf0-4623-8456-46ff69ce8784
captured: 2026-06-05T10:41:41+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/2ac84166-fcf0-4623-8456-46ff69ce8784.jsonl
---

## ADR Формат імені change-файлу: YYMMDD-HHMM з числовим суфіксом замість epoch-ms + hex

## Context and Problem Statement
`ch.js` генерував change-файли за схемою `<epoch-ms>-<rand3bytes-hex>.md`, яка відповідала `@nitra/cursor@3.20.0`. У `@nitra/cursor@3.21.0` схему переписали на людино-читабельну `YYMMDD-HHMM.md` з атомарною анти-колізією (числовий суфікс `-2`, `-3`…), і `ch.js` почав розходитись із каноном — при співіснуванні двох форматів у тому самому `.changes/` лексикографічне сортування відносно реального часу ламається.

## Considered Options
* Залишити `<epoch-ms>-<rand-hex>.md` (сумісність із 3.20.0)
* Перейти на `YYMMDD-HHMM[-n].md` з атомарним `wx` create-only (3.21.0-схема)

## Decision Outcome
Chosen option: "Перейти на `YYMMDD-HHMM[-n].md` з атомарним `wx` create-only", because потрібна повна відповідність канонічному `@nitra/cursor@3.21.0`: людино-читабельне ім'я + детермінована анти-колізія без random.

### Consequences
* Good, because transcript фіксує очікувану користь: лексикографічний порядок `.changes/*.md` збігається з хронологічним; ім'я файлу само несе час створення без окремого поля.
* Bad, because у `.changes/` можуть співіснувати старі файли формату `<epoch-ms>-<rand>.md` від попередніх версій `ch.js` — сортування між старими й новими файлами буде некоректним до їхнього видалення.

## More Information
Змінено `npm/ch.js`: видалено `import { randomBytes }`, перероблено `changeFileName` і додано `formatChangeTimestamp` + `writeUniqueChange` з `{ flag: 'wx' }`. Канонічний відповідник: `/Users/vitalii/www/nitra/cursor/npm/rules/release/lib/change-file.mjs` (`newChangeFileName`, `writeUniqueChangeFile`). Change-файл: `npm/.changes/260605-1011.md`.

---

## ADR Видалення поля `created` з frontmatter change-файлу

## Context and Problem Statement
`ch.js` додавав у frontmatter третє поле `created: дд.мм гг:хх` (локальний час), якого ніколи не було в специфікації `@nitra/cursor`. Після переходу на `YYMMDD-HHMM.md` поле стало повністю надлишковим — момент створення вже кодується в самому імені файлу.

## Considered Options
* Залишити `created` як розширення (ігнорується парсером, але є в файлі)
* Видалити `created`/`formatCreated` і привести frontmatter до канону: лише `bump` + `section`

## Decision Outcome
Chosen option: "Видалити `created`/`formatCreated`", because поле дублює інформацію з імені файлу, ніколи не потрапляє в CHANGELOG (парсер `parseChangeFile` валідує лише `bump`/`section`), і канон `change-file.mjs` прямо декларує мінімальний frontmatter без зовнішніх залежностей.

### Consequences
* Good, because `serializeChange` у `ch.js` тепер ідентичний `serializeChangeFile` у `@nitra/cursor` — жодних розбіжностей у вмісті файлу.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Видалено функцію `formatCreated` і параметр `now` з `serializeChange` у `npm/ch.js`. Оновлено `npm/tests/ch.test.mjs`: прибрано `describe('formatCreated')` і `formatCreated`-імпорт, content-асерти в `runCh` оновлені під двоключовий frontmatter. 15/15 тестів проходять.

---

## ADR Перехід `ch.js` до повністю неінтерактивного режиму з дефолтами

## Context and Problem Statement
`ch.js` містив інтерактивний шар (`selectPrompt`, `requiredPrompt`, readline), який питав `bump`, `section`, `message` коли вони відсутні у флагах. Цей шар ускладнював код і заважав використанню в скриптах та агентах. Потрібно було визначити, що робити з відсутніми полями: fail-fast, дефолти, або залишити інтерактив.

## Considered Options
* Залишити інтерактивний шар (status quo)
* Прибрати інтерактив, зробити всі три поля обов'язковими флагами (fail-fast без дефолтів)
* Прибрати інтерактив, додати дефолти: `bump=minor`, `section=Changed`; `--message` — єдиний обов'язковий флаг

## Decision Outcome
Chosen option: "Прибрати інтерактив, додати дефолти `bump=minor`, `section=Changed`", because користувач сформулював: «bump дефолт minor, а там хай користувач праве вручну якщо це не так; section дефолт Changed» — дефолти відповідають найпоширенішому сценарію (нова фіча = minor bump), а ручне виправлення `md`-файлу дешевше за інтерактивний ввід.

### Consequences
* Good, because transcript фіксує очікувану користь: `ch` стає придатним для автоматичних pipeline і агентів без TTY; код спрощується — видалено `selectPrompt`, `requiredPrompt`, `createInterface`, `io.prompt`, `io.isTTY`.
* Bad, because Neutral, because transcript не містить підтвердження наслідку: якщо автор забуде перевірити дефолтний `minor` bump, версія в CHANGELOG може виявитися завищеною.

## More Information
Видалено `import { createInterface }` і `import { stdin, stdout }`. `collectChange` замінено на `resolveChange` — чиста функція без side-effects: доповнює дефолтами й валідує. `runCh` більше не відкриває readline; відсутній `--message` → `exit 1` з USAGE. Константи дефолтів: `DEFAULT_BUMP = 'minor'`, `DEFAULT_SECTION = 'Changed'`. Оновлено help-рядок у `npm/index.js`. 57/57 тестів проходять.
