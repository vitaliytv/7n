# Включення CHANGELOG.md до поля `files` у `npm/package.json`

**Status:** Accepted
**Date:** 2026-06-03

## Context and Problem Statement

Автоматична перевірка правила `fix-changelog` командою `npx @nitra/cursor fix` виявила відсутність запису `"CHANGELOG.md"` у полі `files` файлу `npm/package.json` пакета `@7n/n`. Правило `n-changelog` вимагає, щоб CHANGELOG потрапляв у склад опублікованого npm-пакета.

## Considered Options

- Додати `"CHANGELOG.md"` до масиву `files` у `npm/package.json`
- Інші варіанти в transcript не обговорювалися.

## Decision Outcome

Chosen option: "Додати `CHANGELOG.md` до масиву `files`", because правило `n-changelog`, що перевіряється `npx @nitra/cursor fix changelog`, вимагає присутності CHANGELOG у складі опублікованого пакету; порушення зафіксовано автоматичною перевіркою і виправлено негайно.

### Consequences

- Good, because після виправлення `npx @nitra/cursor fix changelog` повертає `✅` без зауважень.
- Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

- Змінений файл: `npm/package.json`, поле `files` — додано рядок `"CHANGELOG.md"`.
- Форматування після редагування: `oxfmt npm/package.json`.
- Правило: `.cursor/rules/n-changelog.mdc`, перевіряється командою `npx @nitra/cursor fix changelog`.
- Виконувалось у worktree `.worktrees/main-fix` (worktree-only skill `n-fix`).
