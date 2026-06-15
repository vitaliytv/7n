---
session: eda94f92-d9ae-4517-88e7-a92fc970f0de
captured: 2026-06-15T08:58:28+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/eda94f92-d9ae-4517-88e7-a92fc970f0de.jsonl
---

## ADR `ch`-команда як тонка обгортка над `@nitra/cursor change`

## Context and Problem Statement
У CLI `@7n/n` існує підкоманда `ch`, реалізована у файлі `npm/ch.js`. Сесія з'ясовує її інтерфейс і алгоритм. Коментар у `ch.js` розкриває ключові архітектурні рішення, закладені в реалізацію.

## Considered Options
* Тонка обгортка над `npx @nitra/cursor change` з доповненням дефолтами
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Тонка обгортка над `npx @nitra/cursor change`", because коментар у `npm/ch.js` явно позначає підхід як "тонка обгортка" (`spawn`), яка лише ДОПОВНЮЄ дефолти (`bump=minor`, `section=Changed`) та робить `--message` обов'язковим аргументом, не переймаючи решту логіки у власну реалізацію.

### Consequences
* Good, because transcript фіксує очікувану користь: команда лишається простою (делегує реальну роботу `@nitra/cursor change`) і одночасно нав'язує опінативні дефолти — `bump=minor`, `section=Changed` — щоб зменшити кількість обов'язкових аргументів для типових викликів.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- `npm/bin/n.js` — точка входу CLI; викликає `run(process.argv.slice(2))` з `index.js`.
- `npm/index.js` — диспетчер; імпортує `runCh` з `./ch.js`.
- `npm/ch.js` — реалізація: `spawn` + дефолти `bump=minor`, `section=Changed`; `--message` є обов'язковим; іменування change-файлу за схемою `YYMMDD-HHMM` з анти-колізійною логікою (деталі в transcript обрізані).
- Базова команда: `npx @nitra/cursor change`.
