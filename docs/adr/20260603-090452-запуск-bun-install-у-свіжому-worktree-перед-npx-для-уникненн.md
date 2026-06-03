---
session: cd713c0c-cd22-4907-92d1-953d5b0f2822
captured: 2026-06-03T09:04:52+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/cd713c0c-cd22-4907-92d1-953d5b0f2822/cd713c0c-cd22-4907-92d1-953d5b0f2822.jsonl
---

## ADR Запуск `bun install` у свіжому worktree перед `npx` для уникнення гонки CDN-пропагації

## Context and Problem Statement
При запуску скіла `/n-fix` (`.worktrees/main-fix`) команда `npx @nitra/cursor fix` впала з помилкою `npm error notarget No matching version found for @nitra/cursor@3.18.2`. Версія `3.18.2` була опублікована в npm о 05:57:06 UTC, а `npx` у свіжому worktree (без `node_modules`) звернувся до реєстру за ~2 хвилини після публікації — edge-вузол CDN ще не встиг синхронізувати нові метадані.

## Considered Options
* Запускати `bun install` у worktree до виклику `npx @nitra/cursor`
* Використовувати `npx --prefer-offline` (local cache → registry fallback)
* Зачекати кілька хвилин після `npm publish` перед запуском скілів

## Decision Outcome
Chosen option: "Запускати `bun install` у worktree до виклику `npx @nitra/cursor`", because `npx` при наявному `node_modules/.bin/@nitra/cursor` бере локальну копію і не звертається до реєстру взагалі, що повністю усуває залежність від CDN-пропагації.

### Consequences
* Good, because `npx` більше не робить мережевого запиту за пакетом, якщо він вже є у `node_modules` — гонка між `npm publish` і CDN-синхронізацією стає неможливою.
* Bad, because `npx --prefer-offline` не врятував би в описаному інциденті: `3.18.2` ще жодного разу не завантажувалася, тому локального кешу `~/.npm/_cacache` теж не було — все одно похід у реєстр із тим самим результатом.

## More Information
- Команда для відтворення фіксу: `cd .worktrees/main-fix && bun install && npx @nitra/cursor fix`
- Час публікації `3.18.2`: `2026-06-03T05:57:06.846Z`; час помилки в лозі: `05:59:07` — затримка ~2 хв.
- `registry.npmjs.org` обслуговується через CDN (Cloudflare/Fastly); «реєстр» і «CDN-кеш» — один ендпоінт, вибору між ними немає.
- Відповідні файли: `package.json` (`"@nitra/cursor": "^3.18.2"`), `.n-cursor.json`, `.worktrees/main-fix/`.
