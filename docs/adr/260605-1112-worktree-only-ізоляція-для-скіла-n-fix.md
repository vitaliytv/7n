---
session: 0df8485a-64ea-4764-b78b-490f8b381e50
captured: 2026-06-05T11:12:21+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/0df8485a-64ea-4764-b78b-490f8b381e50.jsonl
---

## ADR Worktree-only ізоляція для скіла `n-fix`

## Context and Problem Statement
Скіл `n-fix` виконує потенційно деструктивні зміни у файлах проєкту відповідно до правил `.cursor/rules/`. Щоб не забруднювати основне робоче дерево і зберегти можливість відкату, скіл вимагає запуску виключно в ізольованому git-worktree.

## Considered Options
* Запуск `n-fix` безпосередньо в основному дереві (`main`)
* Запуск `n-fix` в окремому git-worktree (`.worktrees/main-fix/`)

## Decision Outcome
Chosen option: "Запуск `n-fix` в окремому git-worktree", because `meta.json` → `worktree: true` та preflight-блок у `SKILL.md` жорстко вимагають цього: якщо `git rev-parse --show-toplevel` не вказує під `.worktrees/`, скіл зобов'язаний створити worktree через `npx @nitra/cursor worktree add` і лише після цього продовжувати.

### Consequences
* Good, because зміни залишаються ізольованими — основна гілка `main` не зачіпається до явного злиття.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Preflight команда: `git rev-parse --show-toplevel && git branch --show-current`
- Створення worktree: `npx @nitra/cursor worktree add "main-fix" "n-fix: worktree-only skill"` → `/Users/vitalii/www/vitaliytv/7n/.worktrees/main-fix`
- Bootstrap: `bun install` у worktree
- Перевірка правил: `npx @nitra/cursor fix` — результат `✨ Результат: 1/1 правил без зауважень` по всіх перевірених правилах, `❌` відсутні
- Конфігурація скіла: `.cursor/skills/n-fix/SKILL.md`
- Правила проєкту: `.cursor/rules/`
