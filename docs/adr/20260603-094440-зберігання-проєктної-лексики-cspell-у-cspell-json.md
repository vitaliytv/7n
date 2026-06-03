---
session: 3003a8ee-7575-4349-bd57-1f5a401ef599
captured: 2026-06-03T09:44:40+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/3003a8ee-7575-4349-bd57-1f5a401ef599.jsonl
---

## ADR Зберігання проєктної лексики cspell у `.cspell.json`

## Context and Problem Statement
`bun run lint` (крок `lint-text → cspell`) виявив ~90 «невідомих слів» — переважно легітимна українськомовна та domain-специфічна лексика (CLI-терміни, DevOps-жаргонізми) у вихідних файлах проєкту, а не помилки коду.

## Considered Options
* Додати слова в `.cspell.json` → поле `words` (проєктно-локальний список)
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Додати в `.cspell.json` words", because користувач явно обрав цей варіант у відповідь на запитання агента.

### Consequences
* Good, because transcript фіксує очікувану користь: `cspell` перестав видавати помилки (CSpell: Files checked: 20, Issues found: 0 in 0 files).
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Файл: `.cspell.json`, поле `words`. Спільний словник `@nitra/cspell-dict` (`node_modules/@nitra/cspell-dict/entities.txt`, 890 рядків) не містив потрібних термінів. Команда: `bun run lint` → `n-cursor lint-text` → `cspell`.

---

## ADR Вимкнення markdownlint для auto-generated контенту

## Context and Problem Statement
`bun run lint` (крок `markdownlint-cli2`) повідомляв 97 помилок двох типів: (A) структурні порушення в ADR-чернетках у `docs/adr/**`, що автоматично генеруються Stop-хуком `capture-decisions.sh`; (B) MD033 (no-inline-html) в `AGENTS.md` та `CLAUDE.md` через `<branch>` — placeholder, що вставляється скриптами `npx @nitra/cursor` з опису скілу `n-worktree`.

## Considered Options
* Додати `docs/adr/**` в `ignorePatterns` і вимкнути `MD033` глобально у `.markdownlint-cli2.jsonc`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Додати `docs/adr/**` в `ignorePatterns` і `\"MD033\": false`", because користувач підтвердив цей варіант: обидва джерела помилок є авто-генерованим контентом, який не редагується вручну.

### Consequences
* Good, because transcript фіксує очікувану користь: markdownlint більше не блокує `bun run lint` через авто-генерований контент.
* Bad, because вимкнення `MD033` глобально приховує справжні inline-HTML помилки в ручних Markdown-файлах. Transcript не містить підтвердження цього ризику, але він є прямим наслідком глобального вимкнення правила.

## More Information
Файл: `.markdownlint-cli2.jsonc`. Авто-генератор ADR: `.claude/hooks/capture-decisions.sh` (описано у `.cursor/rules/n-adr.mdc`). Placeholder `<branch>` у `AGENTS.md` / `CLAUDE.md` вставляє `npx @nitra/cursor worktree add`.

---

## ADR Виключення файлів без JSON-схеми з перевірки `v8r`

## Context and Problem Statement
`bun run lint` (крок `lint-text → v8r`) не міг знайти JSON-схеми для трьох файлів: `npm/tsconfig.emit-types.json`, `.cursor/hooks.json`, `.marksman.toml`. Каталог схем `@nitra/cursor` (v8r-catalog.json) не охоплює ці шляхи. Спроба додати `$schema` у `npm/tsconfig.emit-types.json` не вирішила проблему, тому зміну відкотили.

## Considered Options
* Додати файли в `.v8rignore`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Додати в `.v8rignore`", because користувач явно обрав цей варіант у відповідь на запитання агента для кожного з файлів.

### Consequences
* Good, because transcript фіксує очікувану користь: `v8r` більше не блокує `bun run lint` через відсутні схеми.
* Bad, because файли `npm/tsconfig.emit-types.json`, `.cursor/hooks.json`, `.marksman.toml` повністю виключені з JSON-schema валідації — помилки у цих файлах не будуть виявлені автоматично.

## More Information
Файл: `.v8rignore`. Додані рядки: `npm/tsconfig.emit-types.json`, `.cursor/hooks.json`, `.marksman.toml`. Каталог схем: `node_modules/@nitra/cursor/schemas/v8r-catalog.json`. Команда: `bun run lint` → `n-cursor lint-text` → `v8r`.
