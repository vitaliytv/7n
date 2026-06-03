---
session: ab3011c1-78a9-4cd9-a140-83733702e73e
captured: 2026-06-03T06:35:15+03:00
transcript: /Users/vitaliytv/.claude/projects/-Users-vitaliytv-www-vitaliytv-7n/ab3011c1-78a9-4cd9-a140-83733702e73e.jsonl
---

`publishConfig.access: "public"` збережено. Dry-run підтверджує **public access**.

Тепер можна: `npm publish`
---

Готово.

## ADR Перейменування bin-entrypoint та усунення у полі bin package.json

## Context and Problem Statement

`npm publish` у пакеті `@7n/7` видаляв bin-запис із оманливим попередженням "bin[7] script name bin/7.js was invalid and removed". Потрібно було знайти справжню причину та виправити `npm/package.json`, щоб entrypoint потрапляв у опублікований пакет.

## Considered Options

* Перейменувати ключ `bin` з числового `"7"` на буквений (наприклад `"n7"`, `"7n"`)
* Залишити файл `bin/7.js`, але замінити ключ `bin` (на `"7n"`)
* Перейменувати сам файл `bin/7.js` → `bin/cli.js`
* Прибрати префікс `./` у значенні `bin`

## Decision Outcome

Chosen option: "перейменування `bin/7.js` → `bin/cli.js` + ключ `cli` + прибирання `./` у значенні `bin`", because емпірична перевірка (`npm publish --dry-run` в ізольованих temp-пакетах) показала, що справжня причина видалення — **префікс `./`** у значенні `bin`, а не числове ім'я команди; ключ `cli` та шлях `bin/cli.js` без `./` дали чистий dry-run без попереджень.

### Consequences

* Good, because `npm publish --dry-run` більше не виводить попередження про видалення bin-запису, і `bin/cli.js` підтверджено потрапляє в пакет.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

* Файли: `npm/package.json`, `npm/bin/cli.js` (перейменований з `bin/7.js`)
* Ключові зміни в `package.json`:
* `"bin": { "cli": "bin/cli.js" }` (без `./`, ключ `cli`)
* `"scripts.start": "bun ./bin/cli.js"` (оновлено після перейменування)
* `"publishConfig": { "access": "public" }` (додано окремо — для scoped-пакету `@7n/7`)
* Емпіричний тест: `"cli": "./bin/cli.js"` → ❌ removed; `"7n": "bin/cli.js"` → ✅ clean; `"cli": "bin/cli.js"` → ✅ clean
* `npm pkg fix` не виявляє проблему з `./` і тому не допомагає
