---
session: ac5d5ded-3dca-4d75-87e0-5bd3fac9a046
captured: 2026-06-03T20:18:49+03:00
transcript: /Users/vitaliytv/.claude/projects/-Users-vitaliytv-www-vitaliytv-7n/ac5d5ded-3dca-4d75-87e0-5bd3fac9a046.jsonl
---

## ADR Виділення спільного ядра delta-мерджу у `npm/merge.js`

## Context and Problem Statement
`getw` містив власну реалізацію багатокрокового merge-механізму. Для нової команди `pull` (колишня `getpull`) потрібна ідентична логіка, а третя команда `push` також потребує того самого ядра при auto-підтягуванні дивергенції.

## Considered Options
* Дублювати merge-логіку в кожній команді
* Винести спільний zsh-фрагмент і `runZsh`-runner у окремий модуль `merge.js`

## Decision Outcome
Chosen option: "Винести у `merge.js`", because інакше три команди (`getw`, `pull`, `push`) тримали б копії одного і того самого многоярусного алгоритму.

### Consequences
* Good, because `MERGE_ZSH_LIB` (рядок з усіма tier-хелперами + `_n7merge_delta`) і `runZsh` стали єдиним джерелом правди; `getw.js`, `pull.js`, `push.js` вбудовують його через ES-import і передають лише пару `(ours, src)`.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Файли: `npm/merge.js`, `npm/getw.js`, `npm/pull.js`, `npm/push.js`. Експорти `merge.js`: `MERGE_ZSH_LIB` (zsh-рядок), `runZsh(script, spawnFn, argv)`. Тести: `npm/tests/merge.test.mjs`.

---

## ADR Delta-стратегія мерджу (merge-base..src) замість повного `git checkout src -- .`

## Context and Problem Statement
Перша реалізація `pull` робила `git checkout origin/$branch -- .`, щоб накотити стан гілки. Після живого запуску виявилось, що в загальному випадку це деструктивно: перезаписує всі tracked-файли версією з origin, затираючи незакомічені правки.

## Considered Options
* Повний checkout (`git checkout origin/$branch -- .`)
* Delta-мердж: `patch = git diff $(git merge-base HEAD src)..src`, далі `git apply`

## Decision Outcome
Chosen option: "Delta-мердж через `merge-base`", because переносити треба **лише зміни, введені у `src` відносно спільного предка**, а не весь зріз — тоді файли, яких дельта не чіпає, лишаються недоторканими.

### Consequences
* Good, because transcript фіксує очікувану користь: незакомічені правки tracked-файлів не затираються; підтверджено емпірично (`git diff --cached` після `pull` = байт-у-байт ідентичний до запуску).
* Bad, because при `git apply` конфліктів потребує багатоярусного резолвера (Tier 0–3), що ускладнює логіку порівняно з простим checkout.

## More Information
Функція `_n7merge_delta(ours, src)` у `MERGE_ZSH_LIB` (`npm/merge.js`). Команда розрахунку бази: `git merge-base "$ours" "$src"`. Команда побудови патча: `git diff "$merge_base" "$src"`. Потік: `git apply` → `git merge-file --diff3` → `mergiraf solve` → LLM-агент.

---

## ADR Pre-flight бекап через `git stash create` (не `git stash push`)

## Context and Problem Statement
Перед delta-мерджем потрібна безпечна точка відкату на випадок, якщо Tier-3-агент зіпсує файл. Мердж може тривати декілька хвилин, і ручний rollback складний.

## Considered Options
* `git stash push` (ревертить робоче дерево і index до HEAD)
* `git stash create` + `git stash store` (commit-знімок **без** очищення робочого дерева)
* Без бекапу

## Decision Outcome
Chosen option: "`git stash create` + `git stash store`", because `git stash push` знищує staged/unstaged-розрізнення, переносить конфлікт на `stash pop` поза tier-пайплайном і на порожньому дереві ризикує дістати старий stash; `git stash create` не чіпає ні index, ні working tree.

### Consequences
* Good, because transcript фіксує очікувану користь: знімок реально містить і staged (`STAGED_D`), і unstaged (`UNSTAGED_TOP`) правки (підтверджено `git show <sha>:file`); мердж лишається прямим, tiers і збереження index працюють незмінно; на чистому дереві `git stash create` повертає порожній рядок → крок автоматично пропускається.
* Bad, because у `git stash list` лишається запис, який треба прибрати вручну (`git stash drop`) після успішного мерджу — transcript не містить авто-cleanup логіки.

## More Information
Початок `_n7merge_delta` у `npm/merge.js`: `backup_sha=$(git stash create "n7merge: backup before delta ($ours <- $src)")`. Stdout: `🛟 Бекап незакомічених змін збережено: git stash apply <sha> · git stash drop`. Тест: `npm/tests/merge.test.mjs` — перевіряє виклики `git stash create`/`store`/`apply`.

---

## ADR Нейтральні env-змінні `N7MERGE_*` з backward-фолбеком на `GETW_*`

## Context and Problem Statement
Після виділення спільного ядра в `merge.js` env-кнопки мали префікс `GETW_` (`GETW_MERGE_MODEL`, `GETW_NO_MERGIRAF`), що не відображало їхню спільну природу: ними керують і `pull`, і `push`.

## Considered Options
* Залишити `GETW_*` (несемантично для `pull`/`push`)
* Замінити на `N7MERGE_*` без фолбека (ламає наявні скрипти)
* `N7MERGE_*` з фолбеком: `${N7MERGE_MODEL:-${GETW_MERGE_MODEL:-sonnet}}`

## Decision Outcome
Chosen option: "`N7MERGE_*` з backward-фолбеком на `GETW_*`", because нейтральний префікс відповідає спільному ядру, а фолбек не ламає існуючі `GETW_`-скрипти.

### Consequences
* Good, because транскрипт підтверджує семантику: `zsh -c '...'` — пріоритет `N7MERGE_MODEL` → `GETW_MERGE_MODEL` → `sonnet` перевірено в реальному zsh.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Env-кнопки: `N7MERGE_MODEL` (фолбек `GETW_MERGE_MODEL`, дефолт `sonnet`), `N7MERGE_CURSOR_MODEL` (фолбек `GETW_MERGE_CURSOR_MODEL`, дефолт `claude-4.6-sonnet-medium`), `N7MERGE_NO_MERGIRAF` (фолбек `GETW_NO_MERGIRAF`, дефолт `0`). Файл: `npm/merge.js`. Тест: `npm/tests/merge.test.mjs` — `'env-кнопки нейтральні (N7MERGE_*) із backward-фолбеком на GETW_*'`.

---

## ADR Per-file підсумок від Tier-3-агента у stdout без файлу-артефакту

## Context and Problem Statement
При дорогінні до Tier 3 (LLM-агент) незрозуміло, що саме агент вирішив у кожному конфліктному файлі — яка сторона «перемогла» і чому. Потрібна прозорість без залишення тимчасових логів.

## Considered Options
* Без підсумку (агент лише усуває маркери)
* Підсумок у stdout (у промпті сказати агенту надрукувати per-file summary у відповіді)
* Підсумок у файл-лог (наприклад, `.getmerge.log`)

## Decision Outcome
Chosen option: "Підсумок у stdout, без файлу-артефакту", because файл-лог ускладнює cleanup і не потрібен для одноразового перегляду; stdout іде наживо в термінал через `stdio:'inherit'`.

### Consequences
* Good, because transcript фіксує очікувану користь: при Tier 3 користувач бачить у терміналі не лише детермінований лог скрипта (які файли конфліктні, вердикт), а й пояснення агента per-file.
* Bad, because підсумок — наратив моделі, а не структурований контракт; промпт містить інструкцію «надрукуй у відповіді, **НЕ у файли**», але формат залежить від моделі. Transcript не містить підтвердженого прикладу фактичного виводу агента.

## More Information
Зміна у функції `_n7merge_resolve_with_agent` (`npm/merge.js`): до промпту додано «Наприкінці надрукуй (у відповіді, **НЕ у файли**) короткий підсумок по КОЖНОМУ файлу: 1-2 рядки — що хотіла кожна сторона у конфлікті і як саме ти це примирив.» Запуск агента: `claude -p "$prompt" --permission-mode acceptEdits ...` або `cursor-agent -p --force --output-format text ...` — обидва з `stdio:'inherit'`.
