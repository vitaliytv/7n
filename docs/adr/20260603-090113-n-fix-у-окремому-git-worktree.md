# n-fix: ізоляція в окремому git-worktree

**Status:** Accepted
**Date:** 2026-06-03

## Context and Problem Statement

Скіл `n-fix` виконує перевірку та виправлення проєкту за всіма правилами `.cursor/rules/`. Запуск безпосередньо в основному робочому дереві може призвести до небажаних побічних ефектів або конфліктів з поточною роботою. Паралельно виявлено, що виклик `npx @nitra/cursor` без явної версії та `npx @nitra/cursor@latest` завершувалися помилкою `npm error notarget`, оскільки `@latest` розрезолвувався у неіснуючу версію `3.18.2`.

## Considered Options

- Виконання `n-fix` у ізольованому git-worktree (`.worktrees/main-fix/`)
- Інші варіанти ізоляції в transcript не обговорювалися.

(Для виклику `@nitra/cursor`): `npx @nitra/cursor@latest fix` (помилка `notarget`) vs явний `npx @nitra/cursor@3.18.1 fix`.

## Decision Outcome

Chosen option: "Виконання `n-fix` у ізольованому git-worktree + явний виклик `npx @nitra/cursor@3.18.1`", because `SKILL.md` містить обов'язковий preflight-блок `n-cursor:worktree:start`: якщо `git rev-parse --show-toplevel` не вказує на `.worktrees/`, скіл зупиняється і створює worktree; явна версія `@3.18.1` обрана через підтверджену доступність в реєстрі (`npm view @nitra/cursor versions --json`).

### Consequences

- Good, because зміни ізольовані в окремій гілці `main-fix` і не забруднюють основне робоче дерево.
- Good, because виклик з `@3.18.1` пройшов усі правила без помилок і підтвердив відповідність конфігурації проєкту.
- Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

- Worktree створено командою: `npx @nitra/cursor worktree add "main-fix" "n-fix: worktree-only skill"`
- Worktree шлях: `.worktrees/main-fix/`, інвентарний файл: `.worktrees/main-fix.md`
- Конвенція іменування: `<current-branch>-fix`
- Налаштування `worktree: true` описано в `meta.json` скіла та продубльовано в `CLAUDE.md`
- Команда перевірки наявних версій: `npm view @nitra/cursor versions --json`
- Остання реальна версія на момент сесії: `3.18.1`; `@latest` розрезолвувався у `3.18.2` (неіснуюча у реєстрі)
- Правило `fix adr` перевіряє `package.json` і вимагає `@nitra/cursor` ≥ `^3.18.1`

## Update 2026-06-03

Підтвердження preflight в реальному запуску: `git rev-parse --show-toplevel && git branch --show-current` виявило запуск у `main`; worktree автоматично створено командою `npx @nitra/cursor worktree add "main-fix" "n-fix: worktree-only skill"` за шляхом `/Users/vitalii/www/vitaliytv/7n/.worktrees/main-fix`. Перевірені артефакти: `.claude/hooks/capture-decisions.sh`, `.claude/hooks/normalize-decisions.sh` — збіглися з канонічними. Результат: всі перевірки `✅`, робоче дерево чисте.
