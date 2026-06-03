---
session: cd713c0c-cd22-4907-92d1-953d5b0f2822
captured: 2026-06-03T09:02:43+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/cd713c0c-cd22-4907-92d1-953d5b0f2822/cd713c0c-cd22-4907-92d1-953d5b0f2822.jsonl
---

## ADR Запуск `bun install` перед `npx` у свіжому worktree щоб уникнути CDN-гонки

## Context and Problem Statement
У свіжому git-worktree `.worktrees/main-fix` не було `node_modules`. Коли `/n-fix` запустив `npx @nitra/cursor fix` приблизно за 2 хвилини після публікації `@nitra/cursor@3.18.2` (05:57:06 UTC → 05:59:07 UTC), npm CDN ще не встиг розповсюдити нові метадані, і команда впала з `npm error notarget No matching version found for @nitra/cursor@3.18.2`.

## Considered Options
* Запустити `bun install` перед `npx` — щоб `@nitra/cursor` ліг у локальний `node_modules` і `npx` брав локальну копію, а не реєстр
* Зачекати кілька хвилин після `npm publish` перед запуском скілів, що тягнуть нову версію через `npx`

## Decision Outcome
Chosen option: "Запустити `bun install` перед `npx` у свіжому worktree", because локальна копія в `node_modules` повністю усуває залежність від стану CDN-кешу реєстру і є надійнішою, ніж очікування довільної затримки пропагації.

### Consequences
* Good, because `npx` бере пакет із локального `node_modules`, а не з реєстру, — CDN-стан не впливає на результат.
* Bad, because `bun install` додає крок перед запуском скілів у нових worktree і збільшує час старту.

## More Information
- Зафіксована затримка пропагації: ~2 хвилини між `npm publish` (`3.18.2: 2026-06-03T05:57:06.846Z`) та запуском `npx` (`05:59:07 UTC`).
- Залежність у `package.json`: `"@nitra/cursor": "^3.18.2"`.
- Worktree: `.worktrees/main-fix` (без попереднього `bun install`).
- Команда для відтворення виправлення: `cd /Users/vitalii/www/vitaliytv/7n/.worktrees/main-fix && npx @nitra/cursor fix`.
