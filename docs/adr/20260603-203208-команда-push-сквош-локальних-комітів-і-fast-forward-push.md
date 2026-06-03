## ADR Команда `push`: сквош локальних комітів і fast-forward push

**Status:** Accepted
**Date:** 2026-06-03

## Context and Problem Statement
У CLI-утиліті `@7n/n` не було команди для одночасного сквошу накопичених локальних комітів і відправки у `origin/<branch>`. Для коміт-меседжу потрібна LLM-генерація в стилі Gitmoji + Monorepo українською. Також потрібно було вирішити: назва, які файли включати (`git add -A` vs `-u`), підтвердження перед push, hooks і формат меседжу.

## Considered Options
* `push` — симетрична назва до наявних `getw`/`getpull`
* `getpush`, `pushup`, `cmpush` — обговорювались під час планування, відхилені

## Decision Outcome
Chosen option: "`push`", because користувач явно обрав цю назву з-поміж запропонованих варіантів.

Додатково зафіксовані рішення у цій самій сесії:
- `git add -A` (усі файли, включно untracked) — за рішенням користувача.
- Без інтерактивного підтвердження (`[y/N]`) — у stdout друкуються subject коміту і список файлів.
- `--no-verify` (hooks не запускаються) — за рішенням користувача.
- Multi-line commit message (subject + body) — за рішенням користувача.

### Consequences
* Good, because transcript фіксує очікувану користь: команда сквошить довільну кількість локальних комітів в один (`git reset --soft origin/<branch>`), гарантуючи fast-forward push без ручного rebase.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Реалізація: `npm/push.js`, `npm/index.js`, `npm/types/index.d.ts`, `npm/tests/push.test.mjs`, `npm/README.md`, `npm/.changes/1780506647000-211678.md`. Change-bump: `minor`, section: `Added`. Тести: 46/46 pass. `zsh -n` синтаксис валідний.
