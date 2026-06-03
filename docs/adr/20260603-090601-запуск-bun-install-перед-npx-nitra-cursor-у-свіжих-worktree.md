---
session: cd713c0c-cd22-4907-92d1-953d5b0f2822
captured: 2026-06-03T09:06:01+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/cd713c0c-cd22-4907-92d1-953d5b0f2822/cd713c0c-cd22-4907-92d1-953d5b0f2822.jsonl
---

## ADR Запуск `bun install` перед `npx @nitra/cursor` у свіжих worktree

## Context and Problem Statement
Скіли, що створюють свіжий git-worktree (наприклад, `/n-fix`), одразу запускали `npx @nitra/cursor <command>`. У свіжому worktree відсутній `node_modules`, тому `npx` ішов тягнути пакет із npm-реєстру. Після щойно виконаного `npm publish` CDN-вузли реєстру ще не встигали синхронізувати нову версію — запит потрапляв на edge із застарілими метаданими й отримував помилку `ETARGET: No matching version found for @nitra/cursor@3.18.2`.

## Considered Options
* Запускати `bun install` перед `npx @nitra/cursor` у свіжому worktree, щоб пакет завжди брався з локального `node_modules`
* Використовувати `npx --prefer-offline` (відхилено: не допомагає, якщо локальний кеш `~/.npm/_cacache` не містить щойно опублікованої версії — cache miss → все одно мережевий запит)
* Зачекати кілька хвилин після `npm publish` вручну (відхилено: ненадійно і не усуває причину)

## Decision Outcome
Chosen option: "Запускати `bun install` перед `npx @nitra/cursor`", because `bun install` встановлює `@nitra/cursor` локально в `node_modules` worktree, і `npx` більше не звертається до реєстру — він бере вже встановлений бінарний файл із `node_modules/.bin`.

### Consequences
* Good, because `npx @nitra/cursor` у свіжому worktree більше не залежить від стану CDN-пропагації npm — версія завжди доступна локально після `bun install`.
* Bad, because кожен запуск скіла у свіжому worktree отримує додатковий крок `bun install`, який займає час; transcript не містить підтверджених негативних наслідків понад цей оверхед.

## More Information
Зміни внесено у файли:
- `.cursor/skills/n-fix/SKILL.md`
- `.cursor/skills/n-coverage-fix/SKILL.md`
- `.cursor/skills/n-fix-tests/SKILL.md`
- `.cursor/skills/n-lint/SKILL.md`
- `.cursor/skills/n-start-check/SKILL.md`
- `.cursor/skills/n-taze/SKILL.md`
- `.cursor/skills/n-worktree/SKILL.md`
- `AGENTS.md`
- `.cursor/rules/n-npm-module.mdc`

Патерн заміни: `npx @nitra/cursor <cmd>` → `bun install && npx @nitra/cursor <cmd>` (та `npx nitra-cursor worktree` → `bun install && npx nitra-cursor worktree` для n-worktree). Інцидент стався `2026-06-03T05:59:07`, версія `3.18.2` опублікована о `2026-06-03T05:57:06.846Z` — затримка пропагації ~2 хвилини.
