---
session: 0948b55a-fc96-47ff-8d79-350bd173bf4e
captured: 2026-06-09T16:44:53+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/0948b55a-fc96-47ff-8d79-350bd173bf4e.jsonl
---

## ADR Worktree-only виконання скілу `n-fix`

## Context and Problem Statement
Скіл `n-fix` модифікує файли проєкту відповідно до правил `.cursor/rules/`. Щоб ізолювати зміни від основного робочого дерева і не псувати незакомічену роботу, скіл вимагає окремого git-worktree. Transcript фіксує ситуацію: агент запустив скіл у головній директорії (`/Users/vitalii/www/vitaliytv/7n`, гілка `main`), а не у worktree.

## Considered Options
* Запускати `n-fix` безпосередньо в основному дереві (без ізоляції)
* Запускати `n-fix` виключно у виділеному git-worktree (`.worktrees/<current-branch>-fix/`)

## Decision Outcome
Chosen option: "Запускати `n-fix` виключно у виділеному git-worktree", because `SKILL.md` містить явну директиву `Worktree-only skill`, а preflight-перевірка (`git rev-parse --show-toplevel`) зобов'язує агента автоматично створити worktree (`npx @nitra/cursor worktree add "main-fix" "n-fix: worktree-only skill"`) без запиту до користувача, якщо поточний шлях не вказує під `.worktrees/`.

### Consequences
* Good, because transcript фіксує очікувану користь: зміни ізольовані у `.worktrees/main-fix/`, основна гілка `main` залишається незайманою.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Preflight-команда: `git rev-parse --show-toplevel` — перевіряє, чи шлях знаходиться під `.worktrees/`
- Команда створення worktree: `npx @nitra/cursor worktree add "main-fix" "n-fix: worktree-only skill"`
- Конвенція іменування: `<current-branch>-fix` → `main-fix`
- Інсталяція залежностей у worktree: `bun install` (623 пакети)
- Виконання правил: `n_cursor_npx` → результат `✅ fix: 15 правил — все чисто`
- Фінальний git-статус: `nothing to commit, working tree clean`
- Мета-файл скілу: `.cursor/skills/n-fix/SKILL.md`
