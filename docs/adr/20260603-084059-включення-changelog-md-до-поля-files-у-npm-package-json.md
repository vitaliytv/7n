---
session: 43088861-6ecb-448d-b852-d363917a0717
captured: 2026-06-03T08:40:59+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/43088861-6ecb-448d-b852-d363917a0717.jsonl
---

## ADR Включення CHANGELOG.md до поля `files` у `npm/package.json`

## Context and Problem Statement

Перевірка правила `fix-changelog` у рамках `npx @nitra/cursor fix` виявила, що поле `files` у `npm/package.json` (пакет `@7n/n`) не містить запису `"CHANGELOG.md"`. Це порушує проєктне правило `n-changelog`, яке вимагає, щоб файл CHANGELOG потрапляв у npm-пакет.

## Considered Options

* Додати `"CHANGELOG.md"` до масиву `files` у `npm/package.json`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome

Chosen option: "Додати `"CHANGELOG.md"` до масиву `files` у `npm/package.json`", because правило `n-changelog`, що перевіряється `npx @nitra/cursor fix changelog`, вимагає присутності CHANGELOG у складі опублікованого пакету; порушення зафіксовано автоматичною перевіркою і виправлено негайно.

### Consequences

* Good, because після виправлення `npx @nitra/cursor fix changelog` повертає `✅` без зауважень, тобто пакет `@7n/n` відповідає вимогам правила.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

* Змінений файл: `npm/package.json`, поле `files` — додано рядок `"CHANGELOG.md"`.
* Форматування після редагування: `oxfmt npm/package.json`.
* Правило, що порушувалося: `.cursor/rules/n-changelog.mdc`, перевіряється командою `npx @nitra/cursor fix changelog`.
* Виконання відбувалося у worktree `.worktrees/main-fix` (worktree-only skill `n-fix` відповідно до `.cursor/skills/n-fix/SKILL.md`).
