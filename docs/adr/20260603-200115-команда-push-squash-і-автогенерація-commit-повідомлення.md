# Нова команда `push`: squash локальних комітів та автогенерація commit-повідомлення

**Status:** Accepted
**Date:** 2026-06-03

## Context and Problem Statement

CLI `@7n/n` вже має команди `getw` і `getpull` для перенесення delta-змін між гілками, але не має команди, яка би автоматично генерувала commit-повідомлення українською мовою в стилі Gitmoji + Monorepo і відправляла локальні зміни в один squash-коміт на `origin`.

## Considered Options

- Нова команда `push`: diff `HEAD`..`origin/<branch>` → LLM-генерація повідомлення → squash усіх локальних комітів → `git push`
- Інші варіанти в transcript не обговорювалися.

## Decision Outcome

Chosen option: "Нова команда `push`", because користувач явно визначив поведінку: (1) обчислити diff між локальними комітами та `origin/<branch>`, (2) згенерувати commit-повідомлення українською в стилі Gitmoji + Monorepo на основі цього diff, (3) squash усіх наявних локальних комітів в один і запушити.

### Consequences

- Good, because стандартизований формат повідомлень (Gitmoji + Monorepo style, українська мова) без ручного написання.
- Good, because squash зберігає чисту лінійну історію на `origin`.
- Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

- Спільне ядро: `npm/merge.js` (`MERGE_ZSH_LIB`, `runZsh`).
- Наявні команди-зразки: `npm/getw.js`, `npm/getpull.js`.
- CLI entry point: `npm/index.js`.
- Конвенція commit-повідомлень: `.cursor/rules/n-changelog.mdc`.
- Нова команда має слідувати шаблону `runZsh` із вбудованим zsh-скриптом (аналогічно до `getpull.js`).
- Генерація change-файлів (зразок інтерактивності): `npm/ch.js`.
- Transcript не фіксує деталей реалізації — лише постановку задачі.
