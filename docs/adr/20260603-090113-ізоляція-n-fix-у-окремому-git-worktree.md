---
session: 3003a8ee-7575-4349-bd57-1f5a401ef599
captured: 2026-06-03T09:01:13+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/3003a8ee-7575-4349-bd57-1f5a401ef599.jsonl
---

## ADR Ізоляція n-fix у окремому git-worktree

## Context and Problem Statement
Скіл `n-fix` виконує перевірку та виправлення проєкту за всіма правилами `.cursor/rules/`. Запуск безпосередньо в основному робочому дереві може призвести до небажаних побічних ефектів або конфліктів з поточною роботою. Сесія розпочалася з головної гілки (`main`, корінь репо), тоді як `SKILL.md` вимагає окремого worktree.

## Considered Options
* Виконання n-fix у ізольованому git-worktree (`.worktrees/main-fix/`)
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Виконання n-fix у ізольованому git-worktree", because `SKILL.md` містить обов'язковий preflight-блок `n-cursor:worktree:start`: якщо `git rev-parse --show-toplevel` не вказує на `.worktrees/`, скіл зупиняється і створює worktree командою `npx @nitra/cursor worktree add "main-fix" "n-fix: worktree-only skill"`.

### Consequences
* Good, because зміни (зокрема оновлення `CHANGELOG.md`) ізольовані в окремій гілці `main-fix` і не забруднюють основне робоче дерево.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Worktree створено за конвенцією `<current-branch>-fix`: `.worktrees/main-fix/`
- Інвентарний файл-опис: `.worktrees/main-fix.md`
- Команда створення: `npx @nitra/cursor worktree add "main-fix" "n-fix: worktree-only skill"`
- Налаштування `worktree: true` описано в `meta.json` скіла та продубльовано в `CLAUDE.md`

---

## ADR Пінінг `@nitra/cursor` на `^3.18.1` замість `@latest`

## Context and Problem Statement
Під час виконання `n-fix` виклик `npx @nitra/cursor` (без явної версії) і `npx @nitra/cursor@latest` обидва намагалися встановити неіснуючу версію `3.18.2`, завершуючись помилкою `npm error notarget`. Версія `3.18.2` відсутня в npm-реєстрі, тоді як `3.18.1` є останньою доступною.

## Considered Options
* Явний виклик `npx @nitra/cursor@3.18.1 fix`
* `npx @nitra/cursor@latest fix` — призводить до тієї ж помилки, оскільки `@latest` розрезолвився в `3.18.2`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Явний виклик `npx @nitra/cursor@3.18.1 fix`", because версія `3.18.1` визначена як остання доступна через `npm view @nitra/cursor versions --json`, і `package.json` проєкту вже має `@nitra/cursor` pinned at `^3.18.1`, що підтверджено самим `fix adr`-чеком (`package.json: @nitra/cursor pinned at ^3.18.1 → ok`).

### Consequences
* Good, because виклик з `@3.18.1` пройшов усі правила без помилок і підтвердив відповідність конфігурації проєкту.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Команда перевірки наявних версій: `npm view @nitra/cursor versions --json`
- Остання реальна версія на момент сесії: `3.18.1`
- Успішна команда: `npx @nitra/cursor@3.18.1 fix` у `.worktrees/main-fix/`
- Правило `fix adr` перевіряє `package.json` і вимагає `@nitra/cursor` ≥ `^3.18.1`
