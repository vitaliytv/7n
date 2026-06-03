---
session: ac5d5ded-3dca-4d75-87e0-5bd3fac9a046
captured: 2026-06-03T19:12:55+03:00
transcript: /Users/vitaliytv/.claude/projects/-Users-vitaliytv-www-vitaliytv-7n/ac5d5ded-3dca-4d75-87e0-5bd3fac9a046.jsonl
---

## ADR Виділення merge-ядра у `merge.js` та команда `getpull`

## Context and Problem Statement
У `getw.js` існував механізм «інтелектуального» багатокрокового мерджу змін із git-worktree у поточну гілку. З'явилася потреба в новій команді `getpull`, яка виконує той самий алгоритм, але як джерело використовує `origin/<назва_гілки>`, а не локальний worktree. Дублювання логіки між двома файлами небажане.

## Considered Options
* Виділити спільне ядро мерджу в окремий модуль `merge.js` і імпортувати його в обидва файли.
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Виділити спільне ядро мерджу в окремий модуль `merge.js`", because користувач прямо вказав: «давай винесемо в окремий lib» — і нова команда `getpull` має використовувати той самий механізм.

Конкретно:
- `merge.js` — новий модуль, що експортує `mergeRefIntoWorktree` та `runZsh`.
- `getw.js` — перероблено: тепер імпортує `mergeRefIntoWorktree` / `runZsh` із `merge.js`.
- `getpull.js` — новий файл; реалізує команду `getpull`, яка отримує назву поточної гілки через `git rev-parse --abbrev-ref HEAD` і викликає `mergeRefIntoWorktree('origin/<branch>')`.
- `index.js` — додано маршрутизацію команди `getpull` і оновлено `io`-інжект для тестів.
- `package.json` — `files` розширено: `ch.js`, `getpull.js`, `merge.js`, `CHANGELOG.md`; версія вирівняна до опублікованої `0.2.0`.
- `types/index.d.ts` — оновлено сигнатуру `run()` (новий параметр `getpull`).
- `tests/merge.test.mjs` — новий файл unit-тестів для `merge.js`.
- `tests/index.test.mjs` — додано тест делегування `getpull`.
- `npm/.changes/1780503067406-5e4bf4.md` — change-файл `bump: minor`.

### Consequences
* Good, because transcript фіксує очікувану користь: логіка мерджу існує в одному місці (`merge.js`), `getw` і `getpull` не дублюють код.
* Good, because `zsh -n` перевірка обох zsh-скриптів пройшла без помилок.
* Good, because 28/28 тестів зелені після рефакторингу.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Нові/змінені файли: `npm/merge.js`, `npm/getw.js`, `npm/getpull.js`, `npm/index.js`, `npm/types/index.d.ts`, `npm/tests/merge.test.mjs`, `npm/tests/index.test.mjs`, `npm/package.json`, `npm/README.md`, `npm/.changes/1780503067406-5e4bf4.md`.
- Changelog-гейт: `npx @nitra/cursor fix changelog` — перевірено, результат `1/1 правил без зауважень`.
- Тести: `bunx vitest run` — `3 passed (3)`, `28 passed (28)`.
- Форматування: `bunx oxfmt` застосовано до 6 файлів.
- Сигнатура публічного API `merge.js`: `mergeRefIntoWorktree(ref: string, spawnFn?)`, `runZsh(script: string, spawnFn?)`.
