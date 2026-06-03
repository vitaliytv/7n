---
session: 594d75c5-fe12-451d-8386-377d07e22f98
captured: 2026-06-03T08:52:15+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/594d75c5-fe12-451d-8386-377d07e22f98/594d75c5-fe12-451d-8386-377d07e22f98.jsonl
---

## ADR Умовне включення `image-compress` до `.n-cursor.json`: glob замість залежності від `bun`

## Context and Problem Statement
При виконанні `npx @nitra/cursor` в будь-якому bun-репозиторії правило `image-compress` автоматично додавалось до `.n-cursor.json`, навіть якщо в репо немає жодного растрового чи SVG-файлу. Причина: `npm/rules/image-compress/meta.json` містив `{ "auto": ["bun"] }` — Type C залежність, що активує правило щойно виявлено `bun`, незалежно від наявності зображень. Механіка glob-авто-детекту (`specMatches` гілка `'glob'` + `collectRepoPaths` у `npm/scripts/auto-rules.mjs`) вже існувала, але для `image-compress` не використовувалась.

## Considered Options
* Залишити `{ "auto": ["bun"] }` — правило додається до кожного bun-проєкту.
* Перевести на glob-spec `{ "auto": { "glob": "**/*.{png,jpg,jpeg,gif,svg}" } }` — правило додається лише коли в репо-споживачі є відповідні файли.

## Decision Outcome
Chosen option: "glob-spec `{ \"auto\": { \"glob\": \"**/*.{png,jpg,jpeg,gif,svg}\" } }`", because у bun-репозиторії без графічних ассетів правило неактивне (glob frontmatter у `.mdc` дає 0 збігів), і тому його присутність у `.n-cursor.json` не несе цінності — лише шум у конфіг-файлі.

### Consequences
* Good, because `image-compress` більше не потрапляє до `.n-cursor.json` bun-проєктів без зображень, що усуває невідповідність між реальним вмістом репо та списком правил.
* Bad, because у bun-проєктів, де зображення зʼявляться пізніше, правило не буде підхоплено автоматично до наступного `npx @nitra/cursor` — але це штатна поведінка glob-авто-детекту.

## More Information
- Файл з проблемою: `npm/rules/image-compress/meta.json` — значення `{ "auto": ["bun"] }` замінюється на `{ "auto": { "glob": "**/*.{png,jpg,jpeg,gif,svg}" } }`.
- Канонічний glob береться з frontmatter `npm/rules/image-compress/image-compress.mdc` (`globs: "**/*.{png,jpg,jpeg,gif,svg}"`).
- Наявна machinery: `parseRuleAutoSpec` у `npm/scripts/lib/rule-meta.mjs:30-33`, `specMatches` + `collectRepoPaths` у `npm/scripts/auto-rules.mjs:339-342` — без змін.
- Тести: видалити assertion co-activation `image-compress` з `bun`; додати фікстуру «bun-репо без зображень → `image-compress` відсутній» та «репо з `*.png` → `image-compress` присутній» у suite `detectAutoRules`/`auto-rules`.
- Changelog-entry у `.changes/` за конвенцією пакета (поля `bump`/`section`), без ручного редагування `version`/`CHANGELOG.md`.
