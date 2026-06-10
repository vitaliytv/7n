# Формат назви change-файлу: `<timestamp>-<rand>.md`

**Status:** Accepted
**Date:** 2026-06-04

## Context and Problem Statement

У монорепо потрібен спосіб генерувати унікальні change-файли без конфліктів при паралельному запуску кількох агентів або розробників. Питання виникло як перевірка узгодженості між локальним `npm/ch.js` і канонічною реалізацією `@nitra/cursor`.

## Considered Options

* `<timestamp>-<rand>.md` — час створення + криптографічна випадкова послідовність
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome

Chosen option: "`<timestamp>-<rand>.md`", because обидві реалізації — `npm/ch.js` і `node_modules/@nitra/cursor/rules/release/lib/change-file.mjs` — незалежно використовують `randomBytes` з `node:crypto` та той самий шаблон шляху `<ws>/.changes/<timestamp>-<rand>.md`, що підтверджує канонічність цього формату.

### Consequences

* Good, because timestamp гарантує хронологічне сортування файлів, а `randomBytes` унеможливлює колізії навіть при одночасному запуску.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

- Локальний генератор: `npm/ch.js` — `import { randomBytes } from 'node:crypto'`.
- Канонічна бібліотека: `node_modules/@nitra/cursor/rules/release/lib/change-file.mjs` — той самий import.
- Команда CLI: `node_modules/@nitra/cursor/rules/release/change.mjs`.
- Правило проєкту: `.cursor/rules/n-changelog.mdc` (version `3.2`, `alwaysApply: true`).
- YAML-frontmatter у файлі містить рівно два обов'язкові ключі: `bump` і `section`.
