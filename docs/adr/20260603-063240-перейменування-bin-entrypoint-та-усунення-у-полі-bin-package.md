---
session: ab3011c1-78a9-4cd9-a140-83733702e73e
captured: 2026-06-03T06:32:40+03:00
transcript: /Users/vitaliytv/.claude/projects/-Users-vitaliytv-www-vitaliytv-7n/ab3011c1-78a9-4cd9-a140-83733702e73e.jsonl
---

---

## ADR Перейменування bin-entrypoint та усунення `./` у полі `bin` package.json

## Context and Problem Statement

При `npm publish` пакету `@7n/7` npm видаляв bin-запис із попередженням `"bin[7]" script name bin/7.js was invalid and removed`. Це призводило до того, що після встановлення пакета команда `7` не реєструвалася. Першопричина виявилась у двох місцях: підозрюваний ключ `"7"` та провідний `./` у значенні поля `bin`.

## Considered Options

* Перейменувати bin-команду з `"7"` на `"n7"` чи `"7n"`, залишивши файл `bin/7.js`
* Перейменувати файл `bin/7.js` → `bin/cli.js` і оновити посилання
* Прибрати префікс `./` у значенні поля `bin`

## Decision Outcome

Chosen option: "перейменувати `bin/7.js` → `bin/cli.js` та прибрати `./` зі значення поля `bin`", because перейменування файлу — запит користувача (варіант 2 з обговорення), а усунення `./` — емпірично підтверджена справжня причина: `"cli": "./bin/cli.js"` з `./` теж видалялось, тоді як `"7n": "bin/cli.js"` без `./` проходить `npm publish --dry-run` без жодних попереджень.

### Consequences

* Good, because `npm publish --dry-run` більше не виводить `auto-corrected` / `invalid and removed` для bin-запису; `bin/cli.js` потрапляє в пакет і команда `7n` буде зареєстрована після `npm i -g @7n/7`.
* Bad, because `npm pkg fix` цю проблему не ловить — попередження npm-документації вводить в оману, що `npm pkg fix` її виправить.

## More Information

Емпіричне порівняння у temp-пакеті:

| `bin` значення | результат `publish --dry-run` |
|---|---|
| `"7n": "./bin/cli.js"` | ❌ removed |
| `"cli": "./bin/cli.js"` | ❌ removed |
| `"7n": "bin/cli.js"` | ✅ clean |

Змінені файли:

* `npm/package.json` — ключ `bin`: `"7"` → `"7n"`, значення `./bin/7.js` → `bin/cli.js`; `scripts.start`: `bun ./bin/7.js` → `bun ./bin/cli.js`
* `npm/bin/7.js` → `npm/bin/cli.js` (перейменовано через `mv`)
