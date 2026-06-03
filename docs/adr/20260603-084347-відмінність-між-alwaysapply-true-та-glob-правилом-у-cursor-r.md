---
session: 594d75c5-fe12-451d-8386-377d07e22f98
captured: 2026-06-03T08:43:47+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/594d75c5-fe12-451d-8386-377d07e22f98/594d75c5-fe12-451d-8386-377d07e22f98.jsonl
---

answer

---

## ADR Відмінність між `alwaysApply: true` та glob-правилом у `.cursor/rules/`

## Context and Problem Statement
У Cursor-репо налаштовані правила двох типів: одні завантажуються в контекст агента завжди, інші — лише коли у контексті є відповідний файл. Виникло питання, чому `n-image-compress.mdc` з'явився у виводі терміналу під час `npx @nitra/cursor`.

## Considered Options
* Glob-активація (`alwaysApply: false` + `globs`): правило потрапляє в контекст лише за наявності відповідного файлу
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Glob-активація", because `n-image-compress.mdc` має frontmatter `alwaysApply: false` + `globs: "**/*.{png,jpg,jpeg,gif,svg}"`, що означає: команда `npx @nitra/cursor` копіює файл на диск (як і всі 16 правил), але в контекст агента він потрапляє лише при відкритті/прикріпленні зображення.

### Consequences
* Good, because правило не збільшує обсяг контексту агента без потреби.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Файл правила: `.cursor/rules/n-image-compress.mdc`
- Синхронізація запускається командою `npx @nitra/cursor`, яка завантажує всі правила з `.n-cursor.json` незалежно від умов активації
- Рядок у терміналі: `⬇  image-compress → .cursor/rules/n-image-compress.mdc ... ✅` є лише підтвердженням запису файлу на диск, а не активацією правила
