---
session: ad333f3d-ec6d-4010-bb52-5a2c0641f4e4
captured: 2026-06-09T17:22:54+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/ad333f3d-ec6d-4010-bb52-5a2c0641f4e4.jsonl
---

Based on the transcript, here are the ADR blocks:

---

## ADR Портабельний виклик `n-cursor release` через `bunx` у canonical snippet

## Context and Problem Statement
Workflow `npm-publish` у downstream-пакеті `@7n/n` падав з `Cannot find module '/home/runner/work/7n/7n/npm/bin/n-cursor.js'`, бо канонічний сніпет `npm/rules/npm-module/policy/npm_publish_yml/template/npm-publish.yml.snippet.yml` (джерело істини, значення якого enforce-ується буквально через `checkSnippet`) жорстко вшив шлях `node npm/bin/n-cursor.js release`, що є валідним лише для самого `nitra/cursor`, але не існує у споживачів. Версія `@7n/n` не публікувалась (у реєстрі залишалась `0.3.1`).

## Considered Options
* `node npm/bin/n-cursor.js release` — оригінальний виклик прямим шляхом до файлу
* `n-cursor release` — bare-команда без префікса
* `bunx n-cursor release` — виклик через `bunx`

## Decision Outcome
Chosen option: "`bunx n-cursor release`", because голий workflow `run:` не додає `node_modules/.bin` до `PATH` (перша спроба з `n-cursor release` впала з `command not found`, exit 127), тоді як `bunx` резолвить бінарник із `node_modules` незалежно від середовища — і в `nitra/cursor`, і в будь-якому downstream-споживачі.

### Consequences
* Good, because transcript фіксує очікувану користь: після правки `npm-publish` у `nitra/cursor` (run 27212228284) і `@7n/n` (run 27212501564) пройшли успішно, `@nitra/cursor@5.0.1` і `@7n/n@0.4.0` опубліковано.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Змінені файли в `nitra/cursor`:
- `npm/rules/npm-module/policy/npm_publish_yml/template/npm-publish.yml.snippet.yml:40`
- `.github/workflows/npm-publish.yml:40`
- `npm/rules/npm-module/npm-module.mdc:68`
- `.cursor/rules/n-npm-module.mdc:112`
- `npm/.changes/260609-0925.md`, `npm/.changes/260609-1130.md`, `npm/.changes/260609-1400.md`

Змінені файли в `7n`:
- `.github/workflows/npm-publish.yml:40`
- `package.json`: `"@nitra/cursor": "^5.0.0"` → `"^5.0.1"`
- `bun.lock`
- `npm/.changes/260609-1415.md`

Template-enforcement: `checkSnippet` у `npm/scripts/lib/template.mjs` звіряє значення листків буквально (`if (actual !== snippet)`) — поле `run` кожного кроку `steps` має збігатися точно, тому правка сніпета є єдиним джерелом і автоматично enforce-ується у downstream після оновлення версії `@nitra/cursor`.

---

## ADR Виправлення застарілого `bun.lock` перед ретригером `npm-publish`

## Context and Problem Statement
Після коміту фіксу сніпета (`c2e31217`) workflow `npm-publish` у `nitra/cursor` падав ще на кроці `setup-bun-deps` з помилкою `error: lockfile had changes, but lockfile is frozen` — до кроку `n-cursor release` виконання навіть не доходило. `bun.lock` не був оновлений у коміті зі зміненим `package.json` (devDep `@nitra/cursor` змінений з `^4.0.0` на `^4.1.0`).

## Considered Options
* Додати оновлений `bun.lock` окремим комітом і тригернути `npm-publish` через change-файл у `npm/.changes/`

## Decision Outcome
Chosen option: "Додати оновлений `bun.lock` окремим комітом і тригернути `npm-publish` через change-файл у `npm/.changes/`", because workflow `npm-publish` у `nitra/cursor` тригериться лише на `npm/.changes/**`; `re-run` старого run взяв би застарілий tree без виправленого `bun.lock`.

### Consequences
* Good, because transcript фіксує очікувану користь: після push `bun.lock` + `npm/.changes/260609-1130.md` крок `setup-bun-deps` у run 27211204232 пройшов успішно (`✓`).
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Змінені файли в `nitra/cursor`: `bun.lock`, `npm/.changes/260609-1130.md`. `bun install` (без `--frozen-lockfile`) показав: `Removed: 1`, `bun.lock | 20 +++-----------------` — lockfile розійшовся на 1 пакет (`@nitra/cursor` ^4.0.0 → ^4.1.0).
