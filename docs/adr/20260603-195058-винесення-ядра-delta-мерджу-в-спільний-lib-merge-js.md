---
session: ac5d5ded-3dca-4d75-87e0-5bd3fac9a046
captured: 2026-06-03T19:50:58+03:00
transcript: /Users/vitaliytv/.claude/projects/-Users-vitaliytv-www-vitaliytv-7n/ac5d5ded-3dca-4d75-87e0-5bd3fac9a046.jsonl
---

## ADR Винесення ядра delta-мерджу в спільний lib `merge.js`

## Context and Problem Statement
Логіка багатокрокового «інтелектуального» мерджу (Tier 0–3: `git apply` → `git merge-file --diff3` → `mergiraf solve` → LLM-агент) була вбудована прямо в `getw.js`. Потрібна нова команда `getpull` з ідентичним алгоритмом мерджу, але іншим джерелом (`origin/<гілка>` замість локального worktree).

## Considered Options
* Дублювати zsh-логіку в `getpull.js`
* Винести спільне ядро у `merge.js` і імпортувати з обох команд

## Decision Outcome
Chosen option: "Винести спільне ядро у `merge.js`", because так обидві команди отримують один і той самий алгоритм без дублювання — користувач явно сформулював це як умову задачі.

### Consequences
* Good, because `npm/merge.js` експортує `MERGE_ZSH_LIB` (рядок zsh-функцій, що вбудовується в скрипти обох команд) і `runZsh` (спільний запуск); `getw.js` і `getpull.js` містять лише команд-специфічну підготовку (`src`, `ours`) — жодного дублювання алгоритму.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- `npm/merge.js` — `MERGE_ZSH_LIB`, `runZsh(script, spawnFn, argv)`
- `npm/getw.js` — імпортує `MERGE_ZSH_LIB`, `runZsh`; передає `ours=current_branch`, `src=target_branch`
- `npm/getpull.js` — імпортує ті самі експорти; передає `ours=HEAD`, `src=origin/<branch>`
- `npm/tests/merge.test.mjs` — unit-тести `MERGE_ZSH_LIB` і `runZsh`

---

## ADR Реалізація `getpull` на delta-логіці замість повного `git checkout origin/<branch> -- .`

## Context and Problem Statement
Перша реалізація `getpull` використовувала `git checkout origin/$branch -- .` — деструктивний повний checkout: він перезаписував увесь tracked-стан робочого дерева версіями з origin, не лишаючи незапушені зміни. На практиці це виявилось щойно після першого реального запуску команди.

## Considered Options
* Повний checkout `git checkout origin/<branch> -- .` (перша реалізація)
* Delta-мердж `_n7merge_delta HEAD origin/<branch>` через спільне ядро `merge.js`

## Decision Outcome
Chosen option: "Delta-мердж `_n7merge_delta` через спільне ядро", because після реального запуску `getpull` виявилось, що повний checkout затирає локальні незапушені правки tracked-файлів — той самий ризик, через який було переписано `getw`; користувач підтвердив, що потрібна та сама delta-логіка.

### Consequences
* Good, because `getpull` тепер переносить **лише дельту** `merge-base(HEAD, origin/<branch>)..origin/<branch>`: незапушені локальні зміни tracked-файлів зберігаються, конфлікти резолвляться тими ж Tier 0–3 хелперами.
* Good, because transcript фіксує очікувану користь: `zsh -n` валідація обох скриптів повертає OK після рефакторингу; 29/29 тестів проходять.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Перша небезпечна реалізація (`git checkout origin/$branch -- .`) — виявлена під час першого реального запуску `bun ./npm/bin/n.js getpull`
- `npm/merge.js` — функція `_n7merge_delta <ours_ref> <src_ref>` у `MERGE_ZSH_LIB`
- `npm/getpull.js` — `git fetch origin <branch>` → `_n7merge_delta "HEAD" "origin/<branch>"`
- Перевірка безпеки після першого запуску: `git diff --stat origin/main -- ':(exclude)docs/**' ':(exclude)npm/.changes/**'` повернула порожній результат (нічого не затерлось)

---

## ADR Нейтральні env-змінні `N7MERGE_*` з backward-сумісним фолбеком на `GETW_*`

## Context and Problem Statement
Перша реалізація спільного ядра `merge.js` успадкувала env-змінні з `getw`-часів: `GETW_MERGE_MODEL`, `GETW_MERGE_CURSOR_MODEL`, `GETW_NO_MERGIRAF`. Після виносу ядра у `merge.js` ці імена стали семантично невідповідними — ядро обслуговує і `getpull`, і `getw`.

## Considered Options
* Лишити `GETW_*` (без змін)
* Ввести `N7MERGE_*` і видалити `GETW_*` (breaking change)
* Ввести `N7MERGE_*` із вкладеним фолбеком `${N7MERGE_X:-${GETW_X:-default}}` (backward-сумісно)

## Decision Outcome
Chosen option: "`N7MERGE_*` із вкладеним фолбеком на `GETW_*`", because користувач явно попросив нейтральні імена, зберігши backward-сумісність для наявних конфігурацій.

### Consequences
* Good, because перевірено в zsh: `N7MERGE_MODEL` має пріоритет над `GETW_MERGE_MODEL`; якщо виставлено лише `GETW_MERGE_MODEL` — продовжує працювати; без жодного — дефолт `sonnet`.
* Good, because `npm/tests/merge.test.mjs` містить спеціальний тест `'env-кнопки нейтральні (N7MERGE_*) із backward-фолбеком на GETW_*'`.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Env-змінні у `MERGE_ZSH_LIB` (`npm/merge.js`): `N7MERGE_MODEL` / `GETW_MERGE_MODEL`, `N7MERGE_CURSOR_MODEL` / `GETW_MERGE_CURSOR_MODEL`, `N7MERGE_NO_MERGIRAF` / `GETW_NO_MERGIRAF`
- Перевірка: `zsh -c 'echo "${N7MERGE_MODEL:-${GETW_MERGE_MODEL:-sonnet}}"'`
- Документація оновлена: `npm/README.md`, JSDoc у `npm/getw.js` і `npm/getpull.js`
