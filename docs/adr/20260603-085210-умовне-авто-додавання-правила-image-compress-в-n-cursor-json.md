---
session: 594d75c5-fe12-451d-8386-377d07e22f98
captured: 2026-06-03T08:52:10+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/594d75c5-fe12-451d-8386-377d07e22f98/594d75c5-fe12-451d-8386-377d07e22f98.jsonl
---

## ADR Умовне авто-додавання правила `image-compress` в `.n-cursor.json`

## Context and Problem Statement

Правило `image-compress` автоматично додавалося в `.n-cursor.json` будь-якого bun-репозиторію через механізм Type-C залежності (`"auto": ["bun"]` у `npm/rules/image-compress/meta.json`). Це траплялося навіть у проєктах без жодного растрового або SVG-файлу, що суперечить призначенню правила та засмічує конфіг неактивним правилом.

## Considered Options

* Залишити `"auto": ["bun"]` — правило завжди приходить у bun-проєктах
* Перевести `meta.json` на glob-spec `{ "auto": { "glob": "**/*.{png,jpg,jpeg,gif,svg}" } }` — правило додається лише за наявністю реальних зображень у репо

## Decision Outcome

Chosen option: "Перевести `meta.json` на glob-spec", because у репо без зображень правило неактивне (`alwaysApply: false`, glob фронтматтера ні з чим не збігається), тому його присутність у `.n-cursor.json` не дає жодної користі — natomiast механіка `specMatches` / `collectRepoPaths` у `npm/scripts/auto-rules.mjs` вже підтримує glob-форму без змін коду.

### Consequences

* Good, because bun-репозиторії без зображень більше не отримуватимуть `image-compress` у `.n-cursor.json` після `npx @nitra/cursor`.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

* Точка правки: `npm/rules/image-compress/meta.json` — замінити `{ "auto": ["bun"] }` на `{ "auto": { "glob": "**/*.{png,jpg,jpeg,gif,svg}" } }`.
* Канонічний glob взято з frontmatter `npm/rules/image-compress/image-compress.mdc` (`globs: "**/*.{png,jpg,jpeg,gif,svg}"`).
* Код, що реалізує glob-гілку: `scripts/auto-rules.mjs` (`specMatches`, `collectRepoPaths`) та `scripts/lib/rule-meta.mjs` (`parseRuleAutoSpec`, рядки 30–33).
* Тести: видалити перевірку co-activation `image-compress` + `bun`; додати дві фікстури: bun-репо без зображень → правило відсутнє; репо з `*.png` → правило присутнє.
* Дотримуватись конвенцій репо `@nitra/cursor`: change-файл у `.changes/` (bump/section), не редагувати `CHANGELOG.md` вручну.
