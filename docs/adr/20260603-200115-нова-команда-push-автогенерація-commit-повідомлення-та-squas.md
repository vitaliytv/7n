---
session: d261d410-e912-4f06-8fd5-2770efae874a
captured: 2026-06-03T20:01:15+03:00
transcript: /Users/vitaliytv/.claude/projects/-Users-vitaliytv-www-vitaliytv-7n/d261d410-e912-4f06-8fd5-2770efae874a.jsonl
---

## ADR Нова команда `push`: автогенерація commit-повідомлення та squash локальних комітів

## Context and Problem Statement
У CLI `@7n/n` вже є команди `getw` і `getpull` для перенесення delta-змін між гілками, але немає команди, яка би автоматично генерувала commit-повідомлення українською мовою в стилі Gitmoji + Monorepo і відправляла локальні зміни в один squash-коміт на `origin`.

## Considered Options
* Нова команда `push` (або `getpush`): diff `HEAD`..`origin/<branch>` → LLM-генерація повідомлення → `git rebase -i` squash → `git push`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Нова команда `push`/`getpush`", because користувач явно визначив поведінку: (1) обчислити diff між локальними комітами/зміненими файлами та `origin/<branch>`, (2) згенерувати коміт-повідомлення українською в стилі Gitmoji + Monorepo на основі цього diff, (3) усі наявні локальні коміти squash-нути в один і запушити.

### Consequences
* Good, because transcript фіксує очікувану користь: стандартизований формат повідомлень (Gitmoji + Monorepo style, українська мова) без ручного написання.
* Good, because transcript фіксує очікувану користь: squash зберігає чисту лінійну історію на `origin`.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Спільне ядро delta-мерджу: `npm/merge.js` (`MERGE_ZSH_LIB`, `runZsh`)
- Наявні команди-зразки: `npm/getw.js`, `npm/getpull.js`
- CLI entry point: `npm/index.js`
- Конвенція commit-повідомлень: `.cursor/rules/n-changelog.mdc`
- Тести для `merge.js`: `npm/tests/merge.test.mjs`
- Генерація change-файлів (зразок інтерактивності): `npm/ch.js`
- Нова команда має слідувати шаблону `runZsh` із вбудованим zsh-скриптом (аналогічно до `getpull.js`)
