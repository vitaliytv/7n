# Запуск `bun install` перед `npx @nitra/cursor` у свіжому worktree

**Status:** Accepted
**Date:** 2026-06-03

## Context and Problem Statement

У свіжому git-worktree відсутній `node_modules`. Скіли, що створюють worktree (наприклад `/n-fix`), одразу запускали `npx @nitra/cursor <command>`, і `npx` ішов тягнути пакет із npm-реєстру. Якщо нова версія `@nitra/cursor` щойно опублікована (< кількох хвилин тому), edge-вузли CDN npm ще не встигають синхронізувати нові метадані — команда падає з `npm error code ETARGET: No matching version found for @nitra/cursor@3.18.2`.

## Considered Options

* Запускати `bun install` у worktree до виклику `npx @nitra/cursor` — щоб пакет лежав у локальному `node_modules` і `npx` не звертався до реєстру
* Використовувати `npx --prefer-offline` (local cache → registry fallback)
* Зачекати кілька хвилин після `npm publish` вручну

## Decision Outcome

Chosen option: "Запускати `bun install` у worktree до виклику `npx @nitra/cursor`", because `npx` при наявному `node_modules/.bin/@nitra/cursor` бере локальну копію і не звертається до реєстру взагалі, що повністю усуває залежність від CDN-пропагації.

### Consequences

* Good, because `npx @nitra/cursor` у свіжому worktree більше не залежить від стану CDN-пропагації npm — версія завжди доступна локально після `bun install`.
* Bad, because кожен запуск скіла у свіжому worktree отримує додатковий крок `bun install`, який займає час.
* Neutral, because `npx --prefer-offline` не врятував би в описаному інциденті: `3.18.2` ще жодного разу не завантажувалася, тому локального кешу `~/.npm/_cacache` теж не було — cache miss → мережевий запит із тим самим результатом. `registry.npmjs.org` обслуговується через CDN (Cloudflare/Fastly); вибору між реєстром і CDN-кешем немає — один ендпоінт.

## More Information

Патерн заміни у SKILL.md файлах: `npx @nitra/cursor <cmd>` → `bun install && npx @nitra/cursor <cmd>` (та `npx nitra-cursor worktree` → `bun install && npx nitra-cursor worktree` для `n-worktree`).

Змінені файли:
- `.cursor/skills/n-fix/SKILL.md`
- `.cursor/skills/n-coverage-fix/SKILL.md`
- `.cursor/skills/n-fix-tests/SKILL.md`
- `.cursor/skills/n-lint/SKILL.md`
- `.cursor/skills/n-start-check/SKILL.md`
- `.cursor/skills/n-taze/SKILL.md`
- `.cursor/skills/n-worktree/SKILL.md`
- `AGENTS.md`
- `.cursor/rules/n-npm-module.mdc`

Інцидент: `@nitra/cursor@3.18.2` опублікована `2026-06-03T05:57:06.846Z`, помилка зафіксована о `05:59:07 UTC` — затримка пропагації ~2 хвилини. Worktree: `.worktrees/main-fix` (без попереднього `bun install`). Залежність у `package.json`: `"@nitra/cursor": "^3.18.2"`.

## Update 2026-06-03

Команди для діагностики публікації та пропагації: `npm view @nitra/cursor time --json` (час публікації кожної версії), `npm view @nitra/cursor version` (поточна версія в реєстрі).
