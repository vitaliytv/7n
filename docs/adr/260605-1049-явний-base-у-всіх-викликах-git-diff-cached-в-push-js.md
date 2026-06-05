---
session: 55f28a5f-f103-4498-b4de-70910a6d8488
captured: 2026-06-05T10:49:26+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/55f28a5f-f103-4498-b4de-70910a6d8488.jsonl
---

## ADR Явний `"$base"` у всіх викликах `git diff --cached` в `push.js`

## Context and Problem Statement
У `npm/push.js` чотири виклики `git diff --cached`, що формують контекст для commit-меседжу (збір `.changes/`, scope, diff-фолбек, вивід у stdout), покладалися на неявну властивість: після `git reset --soft "$base"` HEAD збігається з `base`. Це робило семантику залежною від порядку операцій і не було самодокументованим.

## Considered Options
* Явно передавати `"$base"` у кожен `git diff --cached` у рядках 207, 226, 257 та пов'язаних місцях
* Залишити неявний варіант (функціонально еквівалентний за поточного порядку операцій)

## Decision Outcome
Chosen option: "Явно передавати `"$base"`", because snapshot-тести й живий дослід підтвердили еквівалентність, а явна форма не зламається при майбутньому рефакторі порядку `reset --soft`.

### Consequences
* Good, because код самодокументує семантику: `git diff --cached "$base" --` чітко виражає «повна дельта від origin до поточного локального стану».
* Bad, because оновлення трьох snapshot-асерцій у `npm/tests/push.test.mjs` (рядки 51, 75, 79, 87) — незначне, але обов'язкове.

## More Information
Змінені виклики в `npm/push.js`: рядки 207, 226, 257 (+ пов'язані `--name-status`).
Оновлені тести: `npm/tests/push.test.mjs`.
Живий дослід у тимчасовому репо підтвердив: після `git add -A` + `git reset --soft "$base"` обидві форми дають ідентичний результат.

---

## ADR Детермінований режим формування commit-меседжу зі `.changes/` файлів

## Context and Problem Statement
`npm/push.js` завжди викликав LLM-агент (`pi` → `claude` → `cursor-agent`) для генерації commit-меседжу, навіть коли застейджені `.changes/*.md` вже містили проза-опис наміру зміни. Це вносило затримку і недетермінованість у випадках, де меседж можна скласти скриптово.

## Considered Options
* Детермінований режим: коли є `.changes/`-файли — будувати меседж скриптом; LLM лише як фолбек (за відсутності change-файлів)
* Залишити LLM для всіх випадків, подаючи change-файли як контекст (попередня поведінка)

## Decision Outcome
Chosen option: "Детермінований режим", because change-файли вже містять структурований опис (`section`, `bump`, текст), достатній для складання subject/body у форматі Gitmoji + Conventional без агента.

### Consequences
* Good, because transcript фіксує очікувану користь: push без LLM-агента в типовому випадку (є change-файли), нуль зовнішніх залежностей для commit-меседжу.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Нова функція `_n7push_build_message_from_changes` у `npm/push.js`.
Маппінг: `Added` → `✨ feat`, `Changed` → `♻️ refactor`, `Fixed` → `🐛 fix`, інше → `📦 chore`.
За кількох change-файлів: `bump`-пріоритет (`major` > `minor` > `patch`) визначає type; scope виводиться зі спільного батьківського каталогу.
Індикатор у stdout: `🧩 Збираю commit-меседж зі change-файлів (.changes/) — без LLM...`.
Тести: `npm/tests/push.test.mjs` — 3 нові кейси; разом 21 pass (push-suite), 60 pass (повний).
Changelog: `npm/.changes/260605-1048.md` (`bump: minor`, `section: Added`).
Майбутній контекст (не реалізовано): розглядається флаг `llm: true` у change-файлі для opt-in у LLM-режим навіть за наявності change-файлів; за відсутності флага — детермінований режим.
