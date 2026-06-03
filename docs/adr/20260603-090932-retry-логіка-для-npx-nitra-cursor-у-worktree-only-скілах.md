---
session: cd713c0c-cd22-4907-92d1-953d5b0f2822
captured: 2026-06-03T09:09:32+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/cd713c0c-cd22-4907-92d1-953d5b0f2822/cd713c0c-cd22-4907-92d1-953d5b0f2822.jsonl
---

## ADR Retry-логіка для `npx @nitra/cursor` у worktree-only скілах

## Context and Problem Statement
У свіжих git-worktree (без `node_modules`) `npx @nitra/cursor` завершується помилкою `ETARGET`/`notarget`, якщо `package.json` споживача вже містить щойно підняту версію, але edge-вузол npm CDN ще не встиг її пропагувати (лаг зазвичай < 2 хв). Скіли з `meta.json → worktree: true` (зокрема `n-fix`) відразу після `worktree add` запускають `npx` у порожньому дереві — саме там виникає гонка між публікацією і пропагацією CDN.

## Considered Options
* Retry-петля у shell-інструкції скіла / `worktree-notice` snippet: 30 с інтервал, 5 хв дефолт, env-override, тільки на транзитних помилках реєстру
* Retry у JS-хендлерах `@nitra/cursor` CLI
* Запускати `bun install` у worktree перед першим `npx` (комплементарний підхід)

## Decision Outcome
Chosen option: "Retry-петля у shell-інструкції скіла / `worktree-notice` snippet", because на `ETARGET` npm падає до запуску CLI-бінарника — JavaScript-код `@nitra/cursor` не виконується, тож JS-retry для цього кейсу марний; retry має жити там, де викликається `npx`.

### Consequences
* Good, because transcript фіксує очікувану користь: retry покриває всі worktree-only скіли одразу через спільний `npm/scripts/lib/worktree-notice.mjs` (`WORKTREE_START`-блок), без дублювання логіки.
* Good, because ретраяться лише транзитні помилки реєстру (`ETARGET`/`notarget`, `ENOTFOUND`, `ETIMEDOUT`, `EAI_AGAIN`, `ECONNRESET`, HTTP 5xx) — реальний nonzero-exit CLI (lint-помилки, `fix` ❌) не ретраїться і відразу повертається.
* Bad, because новий retry-loop потребує `command substitution`/`variable expansion`, що суперечить обмеженням `worktree.mdc` на snippet без shell-expansion; потрібен окремий крок після `worktree add`, не всередині наявного preflight-snippet.

## More Information
- Параметри: інтервал 30 с, дефолт 5 хв (≈10 спроб), hard-ceiling 10 хв, env-override `N_CURSOR_NPX_RETRY_MAX_MIN`. Обґрунтування ліміту: CDN-пропагація зазвичай < 2 хв; понад 5 хв — ймовірно реальна проблема (невірна версія / аутейдж), краще завершити з помилкою.
- Точки правки у вихідному репозиторії `@nitra/cursor`: `npm/scripts/lib/worktree-notice.mjs`, `npm/skills/fix/SKILL.md` (кроки 1 і 6).
- Комплементарний підхід: `bun install` у worktree одразу після `worktree add` — `npx` бере локальну копію і гонки з CDN немає; retry лишається safety-net.
- Інцидент: версія `3.18.2` опублікована `2026-06-03T05:57:06Z`, помилка зафіксована о `05:59:07Z` (лаг ~2 хв); `npm view @nitra/cursor time --json` підтвердив дату публікації.
