---
session: 5b26f1bc-0998-47bb-8bf7-c4d2f7e7db49
captured: 2026-06-03T10:36:19+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/5b26f1bc-0998-47bb-8bf7-c4d2f7e7db49/5b26f1bc-0998-47bb-8bf7-c4d2f7e7db49.jsonl
---

## ADR Subset-of перевірка `npm_publish_yml` не покриває повний канон `release-publish`

## Context and Problem Statement
У consumer-репо виклик `n-fix` (`npx @nitra/cursor fix npm-module`) завершується з exit 0, але лишає legacy-форму `jobs.publish` (без `contents: write`, без кроку `Release`, без `setup-bun-deps`, без `Configure git identity`) незміненою. Канон у `n-npm-module.mdc` описує job `release-publish` із повним release-flow, однак rego-policy `npm_module.npm_publish_yml` перевіряє лише підмножину полів (`on.push.paths`/`branches`, `id-token: write`, наявність publish-кроку), тому legacy-workflow проходить перевірку без помилок. Це створює хибне очікування, що `fix` дотягне будь-який `npm-publish.yml` до повного канону.

## Considered Options
* **Autofix-апгрейд:** `fix npm-module` детектує legacy `publish`-only job і переписує його до канонічного `release-publish` — але лише коли в репо присутні передумови (`./.github/actions/setup-bun-deps` та `npm/bin/n-cursor.js`); інакше лишає `subset-of`-перевірку як є.
* **Уточнення документації канону:** розділити у `npm-module.mdc` «мінімальний subset-канон» (enforced check) і «розширений `release-publish` приклад» (опційний), щоб усунути хибне очікування без зміни логіки autofix.

## Decision Outcome
Chosen option: рішення не прийнято в межах цієї сесії, because сесія використала скіл `n-llm-patch` для підготовки самодостатнього промпта до агента в репозиторії `@nitra/cursor` — зміни до source-пакету не вносились; вибір між двома варіантами делеговано виконавцю в тому репозиторії.

### Consequences
* Good, because transcript фіксує очікувану користь: підготовлений промпт містить точні точки правки (`rules/npm-module/policy/npm_module/npm_publish_yml/`, `rules/npm-module/js/check.mjs`, `npm-module.mdc`), критерії ідемпотентності та умови збереження `subset-of` для simple-consumer без release-flow.
* Bad, because `subset-of` перевірка навмисно не охоплює повний канон, щоб не ламати consumer-проєкти без `setup-bun-deps`/`n-cursor.js`; розрив між документацією і enforcement лишається до реалізації в `@nitra/cursor`.

## More Information
- Поточний legacy-workflow цього репо: `.github/workflows/npm-publish.yml` (`jobs.publish`, `contents: read`, `persist-credentials: false`, без release-кроку).
- Канон: `.cursor/rules/n-npm-module.mdc`, секція «## npm publish» — job `release-publish`, `contents: write`, `persist-credentials: true`, `fetch-depth: 0`, кроки `setup-bun-deps`, `Configure git identity`, `Release`.
- Rego-policy для перевірки: `npm_module.npm_publish_yml` (розташована в пакеті `@nitra/cursor`, шлях `rules/npm-module/policy/npm_module/npm_publish_yml/*.rego`).
- Скіл: `.cursor/skills/n-llm-patch/SKILL.md` — read-only аналіз, жодних змін у поточному репо не вносилося.
- Команда, виконана агентом: `npx @nitra/cursor fix npm-module` (exit 0 без змін файлу).
