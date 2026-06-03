---
session: cd713c0c-cd22-4907-92d1-953d5b0f2822
captured: 2026-06-03T09:09:30+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/cd713c0c-cd22-4907-92d1-953d5b0f2822/cd713c0c-cd22-4907-92d1-953d5b0f2822.jsonl
---

## ADR Retry-петля для bootstrap `npx @nitra/cursor` при CDN-затримці

## Context and Problem Statement

Після публікації нової версії `@nitra/cursor` у npm, worktree-only скіли (зокрема `n-fix`) одразу ж запускали `npx @nitra/cursor <cmd>` у свіжому worktree без `node_modules`. Оскільки npm CDN ще не встигав пропагувати щойно опублікований тег (~2 хв затримки), команда падала з `ETARGET / notarget No matching version found for @nitra/cursor@3.18.2` — до запуску CLI.

## Considered Options

* Retry-петля на shell-рівні у `worktree-notice` / SKILL.md із детектуванням транзитних помилок реєстру
* Запускати `bun install` у worktree перед першим `npx`, щоб уникнути мережевого запиту взагалі
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome

Chosen option: "Retry-петля на shell-рівні у worktree-notice / SKILL.md", because авторський retry у JS-хендлерах `n-cursor` марний — `ETARGET` стається до запуску бінарника; ретрай потрібен на рівні агентської shell-інструкції. Точки правки у вихідному репозиторії `@nitra/cursor`: `npm/scripts/lib/worktree-notice.mjs` (блок `WORKTREE_START`, покриває всі worktree-only скіли) та `npm/skills/fix/SKILL.md` (кроки 1 і 6).

Параметри: інтервал — 30 с; дефолтний ліміт — 5 хв (≈10 спроб); env-override через `N_CURSOR_NPX_RETRY_MAX_MIN`; hard-ceiling — 10 хв. Ретраїти лише транзитні помилки реєстру: `ETARGET`, `notarget`, `ENOTFOUND`, `ETIMEDOUT`, `EAI_AGAIN`, `ECONNRESET`, HTTP 5xx; будь-який інший nonzero-exit (реальний ❌ від `fix`, lint-помилки) — не ретраїти.

### Consequences

* Good, because покривається вся множина worktree-only скілів одразу через єдиний `worktree-notice` блок, а не патчення кожного SKILL.md окремо.
* Good, because `bun install` у worktree до першого `npx` рекомендований як комплементарна стратегія — тоді `npx` бере локальну копію і CDN-гонка виключена; retry лишається safety-net.
* Bad, because retry-loop потребує command substitution / variable expansion у preflight-snippet, що конфліктує з обмеженням `worktree.mdc` (заборона shell-expansion у snippet створення worktree) — loop слід виносити окремим кроком після `worktree add`.

## More Information

- Симптом: `npm error code ETARGET` о `2026-06-03T05:59:07Z`, версія `3.18.2` опублікована о `05:57:06Z` (≈2 хв до запуску).
- Файли для патчу: `npm/scripts/lib/worktree-notice.mjs`, `npm/skills/fix/SKILL.md`.
- Обґрунтування ліміту: CDN-пропагація npm зазвичай < 2 хв, 5 хв — достатній запас; понад 10 хв → ймовірно реальна проблема (невірна версія / аутейдж), а не транзитна гонка.
- Патч підготовлено як self-contained текстовий промпт для агента у вихідному репозиторії `@nitra/cursor` (через skill `/n-llm-patch`).
