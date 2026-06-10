---
session: ad333f3d-ec6d-4010-bb52-5a2c0641f4e4
captured: 2026-06-10T09:01:53+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/ad333f3d-ec6d-4010-bb52-5a2c0641f4e4.jsonl
---

Workflow було заблоковано — виконую аналіз безпосередньо.

---

## ADR bunx як портабельний спосіб виклику n-cursor release у CI

## Context and Problem Statement
Workflow `.github/workflows/npm-publish.yml` у `7n` викликав `node npm/bin/n-cursor.js release`, але цей файл існує лише у власному репозиторії `nitra/cursor` і відсутній у downstream-споживачів. Крок падав з `Cannot find module '/home/runner/work/7n/7n/npm/bin/n-cursor.js'`, блокуючи публікацію `@7n/n`.

## Considered Options
* `node npm/bin/n-cursor.js release` — пряме посилання на локальний файл
* `n-cursor release` — через PATH (очікувалось, що `node_modules/.bin` підхоплено автоматично)
* `bunx n-cursor release` — через `bunx`, який резолвить бінарник із `node_modules`

## Decision Outcome
Chosen option: "`bunx n-cursor release`", because голий `run:` у GitHub Actions не додає `node_modules/.bin` до PATH (на відміну від npm/bun-скриптів), тому `n-cursor release` падав з exit 127 (`command not found`); `bunx` резолвить бінарник із `node_modules/.bin` незалежно від середовища виконання.

### Consequences
* Good, because команда однаково працює і у `nitra/cursor`, і у downstream-репозиторіях (підтверджено: run `27212228284` та `27212501564` — обидва success).
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Два явних невдалих підходи до правки зафіксовано в runs:
- run `27183176446` (failure): `node npm/bin/n-cursor.js release` → `MODULE_NOT_FOUND`
- run `27211204232` (failure): `n-cursor release` → exit 127 (`command not found`)
- run `27212228284` (success, 54s): `bunx n-cursor release` → `@nitra/cursor@5.0.1` опубліковано
- run `27212501564` (success, 36s): `bunx n-cursor release` → `@7n/n@0.4.0` опубліковано

Виправлені файли-джерела у `nitra/cursor`:
- `npm/rules/npm-module/policy/npm_publish_yml/template/npm-publish.yml.snippet.yml:40`
- `.github/workflows/npm-publish.yml:40`
- `npm/rules/npm-module/npm-module.mdc:68`
- `.cursor/rules/n-npm-module.mdc:112`

---

## ADR виправлення у canonical snippet, а не у downstream-репозиторії

## Context and Problem Statement
Після виявлення причини збою (`node npm/bin/n-cursor.js release`) постало питання: де вносити правку — безпосередньо у `.github/workflows/npm-publish.yml` репозиторію `7n`, чи у canonical сніпет `nitra/cursor`, з якого цей workflow enforce-иться. Template-рушій (`npm/scripts/lib/template.mjs`) звіряє значення листків буквально (`if (actual !== snippet)`), тому правка лише у `7n` призвела б до порушення conformance-перевірки.

## Considered Options
* Виправити лише `.github/workflows/npm-publish.yml` у `7n`
* Виправити canonical сніпет у `nitra/cursor` і синхронізувати `7n` після релізу

## Decision Outcome
Chosen option: "Виправити canonical сніпет у `nitra/cursor` і синхронізувати `7n` після релізу", because `checkSnippet` у `npm/scripts/lib/template.mjs` звіряє поле `run` кожного кроку `steps[]` буквально; правка лише downstream порушила б перевірку `npm_module.npm_publish_yml` і не усунула б проблему для інших споживачів.

### Consequences
* Good, because усі майбутні downstream-споживачі `@nitra/cursor` отримають коректний сніпет автоматично (transcript фіксує очікувану користь: єдиний фікс охоплює будь-який новий репозиторій).
* Bad, because потребує спочатку релізу `@nitra/cursor`, а потім окремого оновлення у `7n` — дворівнева процедура (підтверджено в transcript: `@nitra/cursor@5.0.1` → потім `@7n/n@0.4.0`).

## More Information
Файл-джерело істини: `nitra/cursor/npm/rules/npm-module/policy/npm_publish_yml/template/npm-publish.yml.snippet.yml`
Синхрокопія: `nitra/cursor/.cursor/rules/n-npm-module.mdc`
Рушій перевірки: `nitra/cursor/npm/scripts/lib/template.mjs` (функція `checkSnippet`, порівняння `actual !== snippet` для скалярів)
Зафіксований ланцюжок: `nitra/cursor` (коміт `24cd76ae`) → `@nitra/cursor@5.0.1` → `7n` (коміт `1623c62`) → `@7n/n@0.4.0`
