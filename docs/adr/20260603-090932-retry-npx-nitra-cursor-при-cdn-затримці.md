# Retry-петля для `npx @nitra/cursor` у worktree-only скілах при CDN-затримці

**Status:** Accepted
**Date:** 2026-06-03

## Context and Problem Statement

Скіли з `meta.json → worktree: true` (зокрема `n-fix`) відразу після `worktree add` запускають `npx @nitra/cursor <cmd>` у свіжому worktree без `node_modules`. Після щойно виконаного `npm publish` CDN-вузли реєстру ще не встигають синхронізувати нову версію — запит потрапляє на edge із застарілими метаданими й отримує `ETARGET / notarget No matching version found`. `ETARGET` стається до запуску CLI-бінарника, тому JS-рівень `@nitra/cursor` не виконується і retry усередині нього марний.

## Considered Options

* Retry-петля на shell-рівні у `worktree-notice` / SKILL.md із детектуванням транзитних помилок реєстру
* Retry у JS-хендлерах `@nitra/cursor` CLI
* Запускати `bun install` у worktree перед першим `npx` (комплементарний підхід)

## Decision Outcome

Chosen option: "Retry-петля на shell-рівні у `worktree-notice` / SKILL.md", because `ETARGET` виникає до запуску бінарника — JavaScript-код `@nitra/cursor` не виконується, тому JS-retry для цього кейсу марний; retry має жити там, де викликається `npx`.

### Consequences

* Good, because retry покриває всі worktree-only скіли одразу через спільний `npm/scripts/lib/worktree-notice.mjs` (`WORKTREE_START`-блок) без дублювання логіки.
* Good, because ретраються лише транзитні помилки реєстру (`ETARGET`, `notarget`, `ENOTFOUND`, `ETIMEDOUT`, `EAI_AGAIN`, `ECONNRESET`, HTTP 5xx) — реальний nonzero-exit CLI (lint-помилки, `fix` ❌) не ретраїться і відразу повертається.
* Bad, because новий retry-loop потребує command substitution / variable expansion, що суперечить обмеженням `worktree.mdc` на snippet без shell-expansion; потрібен окремий крок після `worktree add`, не всередині наявного preflight-snippet.

## More Information

Параметри retry: інтервал 30 с, дефолт 5 хв (≈10 спроб), hard-ceiling 10 хв, env-override `N_CURSOR_NPX_RETRY_MAX_MIN`. Обґрунтування ліміту: CDN-пропагація npm зазвичай < 2 хв; понад 5 хв — ймовірно реальна проблема (невірна версія / аутейдж), краще завершити з помилкою.

Точки правки у вихідному репозиторії `@nitra/cursor`: `npm/scripts/lib/worktree-notice.mjs` (блок `WORKTREE_START`, покриває всі worktree-only скіли), `npm/skills/fix/SKILL.md` (кроки 1 і 6). Патч підготовлено через `/n-llm-patch`.

Комплементарний підхід: `bun install` у worktree одразу після `worktree add` — `npx` бере локальну копію і CDN-гонки немає; retry лишається safety-net.

Інцидент: `@nitra/cursor@3.18.2` опублікована `2026-06-03T05:57:06Z`, помилка зафіксована о `05:59:07Z` (лаг ~2 хв).
