---
session: cd713c0c-cd22-4907-92d1-953d5b0f2822
captured: 2026-06-03T09:02:44+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/cd713c0c-cd22-4907-92d1-953d5b0f2822/cd713c0c-cd22-4907-92d1-953d5b0f2822.jsonl
---

## ADR npm CDN-пропагація: запуск `npx @nitra/cursor` у свіжому worktree після `publish`

## Context and Problem Statement
Скіл `/n-fix` створює свіжий worktree `.worktrees/main-fix` і запускає `npx @nitra/cursor fix`. Якщо `package.json` вже містить збільшену версію `@nitra/cursor`, яку щойно опублікували (< кількох хвилин тому), `npx` тягне пакет із реєстру, але CDN npm ще не встиг розповсюдити нові метадані — результат: `ETARGET / No matching version found`.

## Considered Options
* Запускати `bun install` у worktree перед `npx @nitra/cursor`, щоб локальний `node_modules` слугував джерелом і `npx` не ходив до реєстру.
* Зачекати кілька хвилин після `npm publish` перед запуском скілів, що завантажують нову версію через `npx`.

## Decision Outcome
Chosen option: "запускати `bun install` у worktree перед `npx @nitra/cursor`", because якщо пакет є в локальному `node_modules`, `npx` бере його звідти і не звертається до реєстру — це усуває залежність від часу CDN-пропагації.

### Consequences
* Good, because `npx @nitra/cursor fix` більше не падає через `ETARGET`, навіть якщо нову версію опубліковано секунди тому.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Файл: `package.json`, рядок 22 — `"@nitra/cursor": "^3.18.2"`.
- Час публікації `3.18.2`: `2026-06-03T05:57:06.846Z`, час помилки: `05:59:07` UTC — затримка ~2 хв.
- Worktree: `.worktrees/main-fix`.
- Команда відновлення: `cd /Users/vitalii/www/vitaliytv/7n/.worktrees/main-fix && npx @nitra/cursor fix`.
- Діагностика: `npm view @nitra/cursor time --json`, `npm view @nitra/cursor version`.
