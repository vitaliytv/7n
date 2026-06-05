# Lint-конфігурація: cspell, markdownlint та v8r

**Status:** Accepted
**Date:** 2026-06-03

## Context and Problem Statement

`bun run lint` виявив три незалежних групи порушень: (1) ~90 «невідомих слів» у `cspell` — легітимна українська та domain-специфічна лексика у вихідних файлах проєкту; (2) 97 помилок `markdownlint-cli2` — структурні порушення в ADR-чернетках `docs/adr/**` (авто-генерується `.claude/hooks/capture-decisions.sh`) та MD033 через `<branch>`-плейсхолдери в `AGENTS.md`/`CLAUDE.md` (вставляє `npx @nitra/cursor worktree add`); (3) `v8r` не міг знайти JSON-схеми для трьох файлів — `npm/tsconfig.emit-types.json`, `.cursor/hooks.json`, `.marksman.toml` — яких немає в каталозі схем `@nitra/cursor`.

## Considered Options

* Додати слова в `.cspell.json` → поле `words`
* Додати `docs/adr/**` в `ignorePatterns` і вимкнути `MD033` у `.markdownlint-cli2.jsonc`
* Додати файли в `.v8rignore`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome

Chosen option: "Налаштувати кожен інструмент окремо (`.cspell.json words`, `ignorePatterns` + `MD033: false`, `.v8rignore`)", because користувач явно підтвердив кожен варіант у відповідь на запитання агента; обидва джерела markdownlint-помилок є авто-генерованим контентом, який не редагується вручну, а файли у `.v8rignore` не покриті каталогом схем і не вимагають schema-валідації.

### Consequences

* Good, because `cspell` перестав видавати помилки (Files checked: 20, Issues found: 0 in 0 files).
* Good, because `markdownlint-cli2` більше не блокує `bun run lint` через авто-генерований контент.
* Good, because `v8r` більше не блокує `bun run lint` через відсутні схеми.
* Bad, because вимкнення `MD033` глобально приховує справжні inline-HTML помилки в ручних Markdown-файлах.
* Bad, because файли `npm/tsconfig.emit-types.json`, `.cursor/hooks.json`, `.marksman.toml` повністю виключені з JSON-schema валідації — помилки в них не будуть виявлені автоматично.

## More Information

- `.cspell.json`, поле `words`. Спільний словник `@nitra/cspell-dict` (`node_modules/@nitra/cspell-dict/entities.txt`, 890 рядків) не містив потрібних термінів.
- `.markdownlint-cli2.jsonc`: додано `"docs/adr/**"` до `ignorePatterns` та `"MD033": false`. Авто-генератор ADR: `.claude/hooks/capture-decisions.sh` (описано у `.cursor/rules/n-adr.mdc`). Placeholder `<branch>` вставляє `npx @nitra/cursor worktree add`.
- `.v8rignore`: додано `npm/tsconfig.emit-types.json`, `.cursor/hooks.json`, `.marksman.toml`. Каталог схем: `node_modules/@nitra/cursor/schemas/v8r-catalog.json`. Спроба додати `$schema` у `npm/tsconfig.emit-types.json` не вирішила проблему — зміну відкотили.
- Команда: `bun run lint` → `n-cursor lint-text` → `cspell` / `markdownlint-cli2` / `v8r`.
