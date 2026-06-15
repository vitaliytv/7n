# bunx n-cursor release у canonical snippet — портабельний виклик у CI

**Status:** Accepted
**Date:** 2026-06-10

## Context and Problem Statement

Workflow `.github/workflows/npm-publish.yml` у `7n` викликав `node npm/bin/n-cursor.js release`, але цей файл існує лише у `nitra/cursor` і відсутній у downstream-споживачів. Крок падав з `Cannot find module '/home/runner/work/7n/7n/npm/bin/n-cursor.js'`, блокуючи публікацію `@7n/n`. Постало питання: де вносити правку — безпосередньо у `7n`, чи у canonical сніпет `nitra/cursor`, з якого workflow enforce-иться буквально через `checkSnippet` у `npm/scripts/lib/template.mjs`.

## Considered Options

* `node npm/bin/n-cursor.js release` — пряме посилання на локальний файл (оригінальний виклик)
* `n-cursor release` — через PATH без префіксу
* `bunx n-cursor release` — через `bunx`, який резолвить бінарник із `node_modules`
* Виправити лише `.github/workflows/npm-publish.yml` у `7n` без правки canonical сніпета

## Decision Outcome

Chosen option: "Виправити canonical сніпет у `nitra/cursor` із заміною виклику на `bunx n-cursor release`", because (1) `checkSnippet` у `npm/scripts/lib/template.mjs` звіряє поле `run` буквально (`actual !== snippet`) — правка лише в `7n` призвела б до conformance-порушення; (2) голий `run:` у GitHub Actions не додає `node_modules/.bin` до PATH, тому `n-cursor release` без префіксу падав з exit 127 (`command not found`); `bunx` резолвить бінарник із `node_modules/.bin` незалежно від середовища виконання.

### Consequences

* Good, because крок `Release (bump + CHANGELOG + tag)` стає портабельним: будь-який downstream-споживач `@nitra/cursor` отримає коректний `npm-publish.yml` автоматично після оновлення версії.
* Good, because єдиний фікс у canonical сніпеті охоплює всі майбутні downstream-репозиторії без окремих правок у кожному.
* Bad, because потребує спочатку релізу `@nitra/cursor`, а потім окремого оновлення у `7n` — дворівнева процедура.
* Neutral, because ланцюжок зафіксований у transcript: `nitra/cursor` (коміт `24cd76ae`) → `@nitra/cursor@5.0.1` → `7n` (коміт `1623c62`) → `@7n/n@0.4.0`.

## More Information

CI runs що задокументували послідовність рішень:
- run `27183176446` (failure): `node npm/bin/n-cursor.js release` → `MODULE_NOT_FOUND`
- run `27211204232` (failure): `n-cursor release` → exit 127 (`command not found`)
- run `27212228284` (success, 54s): `bunx n-cursor release` → `@nitra/cursor@5.0.1` опубліковано
- run `27212501564` (success, 36s): `bunx n-cursor release` → `@7n/n@0.4.0` опубліковано

Файли-джерела, змінені в `nitra/cursor` (коміт `24cd76ae`):
- `npm/rules/npm-module/policy/npm_publish_yml/template/npm-publish.yml.snippet.yml:40`
- `.github/workflows/npm-publish.yml:40`
- `npm/rules/npm-module/npm-module.mdc:68`
- `.cursor/rules/n-npm-module.mdc:112`

Зміни в `7n` (коміт `1623c62`):
- `.github/workflows/npm-publish.yml:40`
- `package.json`: `"@nitra/cursor": "^5.0.0"` → `"^5.0.1"`
- `bun.lock`, `npm/.changes/260609-1415.md`

Template-enforcement: `checkSnippet` у `npm/scripts/lib/template.mjs` — порівняння `actual !== snippet` для скалярних листків, включаючи поле `run` у кожному кроці `steps[]`.
