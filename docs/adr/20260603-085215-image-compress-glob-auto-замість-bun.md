# image-compress: glob-spec замість залежності від `bun` у `meta.json`

**Status:** Accepted
**Date:** 2026-06-03

## Context and Problem Statement

При виконанні `npx @nitra/cursor` в будь-якому bun-репозиторії правило `image-compress` автоматично додавалося до `.n-cursor.json` навіть за відсутності растрових або SVG-файлів. Причина: `npm/rules/image-compress/meta.json` містив `{ "auto": ["bun"] }` (Type C залежність), що активує правило щойно виявлено `bun`, незалежно від наявності зображень. Оскільки правило має `alwaysApply: false` і glob-frontmatter, у проєктах без зображень воно ніколи не потрапляє в контекст агента — тобто його присутність у `.n-cursor.json` є шумом.

## Considered Options

- Залишити `{ "auto": ["bun"] }` — правило додається до кожного bun-проєкту незалежно від вмісту репо
- Перевести на glob-spec `{ "auto": { "glob": "**/*.{png,jpg,jpeg,gif,svg}" } }` — правило додається лише коли в репо-споживачі є відповідні файли

## Decision Outcome

Chosen option: "Перевести meta.json на glob-spec з полем `auto.glob`", because у bun-репозиторії без графічних ассетів правило неактивне (glob frontmatter у `.mdc` дає 0 збігів), тому його присутність у `.n-cursor.json` не несе цінності — лише шум у конфіг-файлі; механіка `specMatches` / `collectRepoPaths` у `npm/scripts/auto-rules.mjs` вже підтримує glob-форму без змін коду.

### Consequences

- Good, because bun-репозиторії без зображень більше не отримуватимуть `image-compress` у `.n-cursor.json` після `npx @nitra/cursor`, що усуває невідповідність між реальним вмістом репо та списком правил.
- Bad, because у bun-проєктів, де зображення з'являться пізніше, правило не буде підхоплено автоматично до наступного `npx @nitra/cursor` — але це штатна поведінка glob-авто-детекту.

## More Information

- Точка правки: `npm/rules/image-compress/meta.json` — замінити `{ "auto": ["bun"] }` на `{ "auto": { "glob": "**/*.{png,jpg,jpeg,gif,svg}" } }`.
- Канонічний glob береться з frontmatter `npm/rules/image-compress/image-compress.mdc` (`globs: "**/*.{png,jpg,jpeg,gif,svg}"`).
- Наявна machinery: `parseRuleAutoSpec` у `npm/scripts/lib/rule-meta.mjs:30-33`, `specMatches` + `collectRepoPaths` у `npm/scripts/auto-rules.mjs:339-342` — без змін коду.
- Тести: видалити assertion co-activation `image-compress` + `bun`; додати фікстури: bun-репо без зображень → правило відсутнє; репо з `*.png` → правило присутнє (suite `detectAutoRules`/`auto-rules`).
- Changelog-entry у `.changes/` за конвенцією пакета (поля `bump`/`section`), без ручного редагування `version`/`CHANGELOG.md`.
