# getw: bun.lock — виключення з merge-pipeline й умовний bun install

**Status:** Accepted
**Date:** 2026-06-03

## Context and Problem Statement

`bun.lock` потрапляв у загальний merge-цикл команди `getw`, де пофайловий `git merge-file` давав лише шум — lock-файли генеруються детерміновано з `package.json` і не придатні для ручного злиття. Крім того, прапорець `regen_bun=1` спочатку виставлявся лише у конфліктній гілці (`else`-шлях, Tier 1+), тому при чистому `git apply` (Tier 0) `bun install` не запускався навіть якщо `bun.lock` реально змінився у дельті.

## Considered Options

* Мержити `bun.lock` як звичайний файл (через `git merge-file` / mergiraf / агент)
* Брати версію `bun.lock` з target (worktree-гілки) без перегенерації
* Пропустити `bun.lock` у merge-file і завжди запускати `bun install` після мержу
* Пропустити `bun.lock` у merge-file і запускати `bun install` лише коли lock-файли реально відрізняються

## Decision Outcome

Chosen option: "Пропустити `bun.lock` у merge-file і запускати `bun install` лише коли lock-файли реально відрізняються", because `bun.lock` — auto-generated файл, його merge є семантично некоректним; `bun install` потрібен лише коли є реальна розбіжність між локальним lock і версією worktree-гілки, що перевіряється через `cmp -s`.

### Consequences

* Good, because `bun install` не запускається, якщо `bun.lock` збігається — зайвих викликів пакетного менеджера немає.
* Good, because `bun.lock` не потрапляє ні до mergiraf, ні до LLM-агента.
* Bad, because якщо `package.json` змінився, а `bun.lock` у дельті відсутній (нетиповий кейс), `bun install` не запуститься і залежності можуть бути неузгодженими.

## More Information

Файл: `npm/getw.js`. Helper `_getw_bun_lock_differs`: отримує **ours** з робочого дерева або `HEAD`, **theirs** з `git show $target_branch:$rel`, порівнює через `cmp -s`; повертає 0 (різні) або 1 (однакові). Змінна `regen_bun_path` зберігає шлях. `bun install` запускається лише після повністю успішного мержу (при залишкових конфліктних маркерах функція повертає 1 раніше). Інші lock-файли (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`) беруться з target без перегенерації. Функціональний тест: `/tmp/getw_bun/run.sh` з fake-bun stub.

## Update 2026-06-03

### Уточнення: хоїстинг `regen_bun` до фази виявлення дельти

Спочатку `regen_bun=0` оголошувався всередині `else`-гілки (конфліктний шлях Tier 1+). Це означало, що `bun install` не викликався при чистому `git apply` (Tier 0), навіть якщо дельта містила зміни `bun.lock` або `package.json`.

**Рішення:** Виставляти `regen_bun` до розгалуження `if/elif/else`, через попередній аналіз дельти: `git diff --no-renames --name-only "$merge_base" "$target_branch" | grep -qE '(^|/)bun\.lock$|(^|/)package\.json$'`. Це гарантує `bun install` незалежно від шляху — чистий apply чи конфліктний.

* Neutral, because реалізація залишилась незавершеною: редагування `getw.js` заблоковано запитом на дозвіл наприкінці сесії — рішення обговорено, але в код не внесено.
