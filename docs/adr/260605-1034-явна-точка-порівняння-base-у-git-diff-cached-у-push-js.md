---
session: 55f28a5f-f103-4498-b4de-70910a6d8488
captured: 2026-06-05T10:34:53+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/55f28a5f-f103-4498-b4de-70910a6d8488.jsonl
---

## ADR Явна точка порівняння `$base` у `git diff --cached` у `push.js`

## Context and Problem Statement

У `npm/push.js` всі виклики `git diff --cached`, що формують контекст для агента (change-файли, diff-фолбек, scope-файли), спиралися на неявну інваріанту: після `git reset --soft "$base"` HEAD дорівнює `origin/$branch`, тому `--cached` без аргументу вже означає дельту від origin. Ця неявність ускладнювала читання коду й створювала ризик при майбутньому рефакторингу, якщо хтось переставить `reset --soft` і `diff` місцями.

## Considered Options

* Залишити `git diff --cached` без аргументу (покладаючись на неявний HEAD==base після `reset --soft`)
* Передавати `"$base"` явно в кожен виклик `git diff --cached` у секції формування контексту

## Decision Outcome

Chosen option: "Передавати `"$base"` явно", because під час сесії підтверджено, що поведінка вже є коректною (experiment із трьома джерелами: origin-committed, local-committed, unstaged — усі потрапляли в аналіз), а explicit-форма лише самодокументує інваріанту й захищає від майбутнього рефактора.

### Consequences

* Good, because код стає самодокументованим: читач одразу бачить, що дельта вимірюється відносно `$base` (=`origin/$branch`), не потребуючи знання про порядок `reset --soft`.
* Bad, because зміна торкнулась snapshot-тестів у `npm/tests/push.test.mjs` (рядки з `git diff --cached --name-only`, `git diff --cached -- . "${noise[@]}"`, `git diff --cached --name-status`), які необхідно підтримувати синхронізованими з точними рядками zsh-скрипта.

## More Information

Змінені файли: `npm/push.js`, `npm/tests/push.test.mjs`.

Конкретні зміни в `npm/push.js`:
- `git diff --cached --name-only` → `git diff --cached --name-only "$base" --`
- `git diff --cached --name-status` → `git diff --cached --name-status "$base" --`
- `git diff --cached -- . "${noise[@]}"` → `git diff --cached "$base" -- . "${noise[@]}"`

Changelog-запис: `npm/.changes/260605-1033.md` (bump: patch, section: Changed).

Перевірку проходять усі 18 тестів: `bun test tests/push.test.mjs` — 18 pass, 0 fail.
