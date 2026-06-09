---
session: ad333f3d-ec6d-4010-bb52-5a2c0641f4e4
captured: 2026-06-09T16:49:16+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/ad333f3d-ec6d-4010-bb52-5a2c0641f4e4.jsonl
---

## ADR Портабельний виклик `n-cursor release` у сніпеті `npm-publish.yml`

## Context and Problem Statement
CI-пайплайн `npm-publish` downstream-пакета `@7n/n` падав на старті з помилкою `Cannot find module '/home/runner/work/7n/7n/npm/bin/n-cursor.js'`. Воркфлоу `7n/.github/workflows/npm-publish.yml` звіряється зі сніпетом-джерелом істини `nitra/cursor`, який жорстко вшивав шлях до бінарника через файлову систему — шлях валідний лише в самому `nitra/cursor`.

## Considered Options
* Замінити `node npm/bin/n-cursor.js release` → `node npm/bin/n.js release` лише у `7n` (без правки сніпета)
* Замінити `node npm/bin/n-cursor.js release` → `n-cursor release` у канонічному сніпеті `nitra/cursor` та поширити правку на всі залежні файли

## Decision Outcome
Chosen option: "Замінити `node npm/bin/n-cursor.js release` → `n-cursor release` у канонічному сніпеті", because рушій `checkSnippet` у `npm/scripts/lib/template.mjs` звіряє значення поля `run` буквально (`if (actual !== snippet)`), тому правка лише в `7n` викликала б conformance-порушення; крім того, `npm/bin/n.js` у `7n` не містить команди `release` — вона реалізована в `@nitra/cursor`. Бінарник `n-cursor` доступний на PATH після `setup-bun-deps` і в `nitra/cursor`, і в усіх downstream-споживачах.

### Consequences
* Good, because крок `Release (bump + CHANGELOG + tag)` стає портабельним: будь-який downstream-модуль, що підключає `@nitra/cursor` як devDependency, отримає коректний `npm-publish.yml` без змін локального шляху.
* Bad, because transcript фіксує, що відразу після правки сніпета власний CI `nitra/cursor` впав через несинхронізований `bun.lock` (видалено 1 пакет `@nitra/cursor@4.1.2`, що виявилося застарілим записом) — блокувало реліз до закомічення оновленого `bun.lock`.

## More Information
Файли, що потребують синхронного оновлення в `nitra/cursor`:
- `npm/rules/npm-module/policy/npm_publish_yml/template/npm-publish.yml.snippet.yml:40` — джерело істини (enforce)
- `npm/rules/npm-module/npm-module.mdc:68` — проза правила
- `.cursor/rules/n-npm-module.mdc:68,112` — генерований sync-артефакт (не редагувати вручну, перегенерується через `inline-template-links`)
- `.github/workflows/npm-publish.yml:40` — власний workflow `nitra/cursor`

Downstream-дія після релізу нової версії `@nitra/cursor`:
- `7n/.github/workflows/npm-publish.yml:40` → `run: n-cursor release`
- підняти `@nitra/cursor` у `7n/package.json` до версії з виправленим сніпетом

Помилка, що підтвердила рішення: `Cannot find module '/home/runner/work/7n/7n/npm/bin/n-cursor.js'`, run `27183176446`, GitHub Actions workflow `npm-publish`, 2026-06-09T04:07.
