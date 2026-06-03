---
session: 7e30ed38-dea1-44a0-bcf9-97afe7986a1a
captured: 2026-06-03T10:43:04+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/7e30ed38-dea1-44a0-bcf9-97afe7986a1a/7e30ed38-dea1-44a0-bcf9-97afe7986a1a.jsonl
---

## ADR Заміна `git checkout <branch> -- .` на цільове `git diff | git apply` у `getw`

## Context and Problem Statement
Команда `getw` переносила зміни з worktree-гілки через `git checkout "$target_branch" -- .`, що замінювало геть усе робоче дерево файлами target-гілки. Коли поточна гілка після розгалуження незалежно правила файли, яких worktree не чіпав, їх стара версія з worktree затирала свіжі зміни без попередження і без конфліктного повідомлення.

## Considered Options
* `git checkout "$target_branch" -- .` (старий підхід)
* `git diff --binary "$merge_base" "$target_branch" | git apply`

## Decision Outcome
Chosen option: "`git diff --binary merge_base target | git apply`", because потрібно переносити лише дельту (зміни worktree відносно спільного предка), а не весь зріз дерева; файли, змінені виключно в поточній гілці, повинні лишатись незайманими.

### Consequences
* Good, because файли, яких worktree не чіпав, більше не перезаписуються старими версіями.
* Bad, because `git apply` є атомарним (один невдалий файл блокує всі), і потребує подальшої стратегії для конфліктів.

## More Information
Файл `npm/getw.js`; ключовий рядок до виправлення: `git checkout "$target_branch" -- .`; замінений на `git diff --binary "$merge_base" "$target_branch" | git apply --whitespace=nowarn`.

---

## ADR Пофайловий `git merge-file` замість `git apply --3way` або `--reject`

## Context and Problem Statement
При конфліктах спочатку використовувався `git apply --3way`, однак він провалювався з `does not match index` на брудному робочому дереві, де поточна й worktree-гілка незалежно правили ті самі файли. Заміна на `git apply --reject` виявилась атомарно-залежною (lockfile блокував усі файли), а `.rej`-файли як сигнал завершення вимагали делегування `rm` агенту.

## Considered Options
* `git apply --3way`
* `git apply --reject` з подальшим видаленням `.rej` агентом
* Пофайловий `git merge-file --diff3` (без звернення до індексу)

## Decision Outcome
Chosen option: "Пофайловий `git merge-file --diff3`", because він працює виключно по файлах без індексу (усуває `does not match index`), є неатомарним (один файл не блокує решту), і в режимі `--diff3` лишає base-секцію `|||||||`, необхідну для Tier-2 авторезолвера mergiraf.

### Consequences
* Good, because скрипт детерміновано контролює результат через grep маркерів, а не через делегування `rm` агенту.
* Bad, because `git merge-file` позначає конфліктними навіть сусідні (але не перетинні) зміни, що може збільшити кількість маркерів, які доведеться розв'язувати агенту.

## More Information
Файл `npm/getw.js`; helper `_getw_files_with_markers`; функціональний тест у `/tmp/getw_func/run.sh`; кейси: ours_only, theirs_only, неперетинні зміни, конфлікт, додавання, видалення, бінарні файли.

---

## ADR Детермінований вердикт скриптом, не агентом

## Context and Problem Statement
Перша реалізація агентського мержу використовувала «агент видалив `.rej`-файли» як сигнал успіху. Це крихко: залежить від дозволу агента на `rm`, агент може забути видалити файл, а якщо скрипт сліпо видаляв `.rej` «за фактом запуску», пропущений хунк зникав безшумно.

## Considered Options
* Агент видаляє `.rej` / очищає маркери як сигнал завершення
* Скрипт grep-ує маркери після виходу агента як детермінований вердикт

## Decision Outcome
Chosen option: "Скрипт grep-ує маркери після виходу агента", because вердикт про успіх мержу є детермінованою відповідальністю скрипта; агент виконує лише творчу роботу (прибирає маркери у вже наявних файлах), не видаляє файли і не сигналізує результат.

### Consequences
* Good, because transcript фіксує очікувану користь: «fail-safe — нічого не втрачається, worktree зберігається при залишкових маркерах».
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Файл `npm/getw.js`; helper `_getw_files_with_markers`; агент викликається з `--allowedTools "Edit,Write,MultiEdit,Read"` (без `Bash(rm:*)`); критерій успіху — відсутність рядків `^(<<<<<<<|>>>>>>>)` після виходу агента.

---

## ADR Багаторівневий резолв конфліктів: merge-file → mergiraf → LLM-агент

## Context and Problem Statement
Після переходу на `git merge-file` залишились конфлікти, які line-based diff3 позначає помилково (зміни в різних частинах синтаксичного дерева). Виклик LLM-агента на всі конфлікти підряд — надмірно; потрібні дешевші детерміновані авторезолвери перед агентом.

## Considered Options
* Лише `git merge-file` + LLM-агент
* `git merge-file` → `mergiraf solve` (структурний AST) → LLM-агент

## Decision Outcome
Chosen option: "`git merge-file` → `mergiraf solve` → LLM-агент", because mergiraf є структурним AST-авторезолвером на tree-sitter, підтримує 25+ мов і розв'язує конфлікти, які diff3 позначив дарма; агент отримує лише реальний залишок. Mergiraf вмикається автоматично, якщо доступний у `PATH`; якщо ні — ставиться через `brew install mergiraf` (фолбек: `cargo install --locked mergiraf`); вимикається `GETW_NO_MERGIRAF=1`.

### Consequences
* Good, because transcript фіксує очікувану користь: зменшення навантаження на LLM-агент за рахунок детермінованого структурного резолву.
* Bad, because авто-встановлення через brew або cargo під час операції може зайняти кілька хвилин і блокує виконання.

## More Information
Файл `npm/getw.js`; helpers `_getw_ensure_mergiraf`, `_getw_mergiraf_solve`; `mergiraf solve` — in-place, exit 0/1/2; `brew info mergiraf` підтвердив наявність формули (0.17.0, homebrew-core); тест Tier-2 з fake-mergiraf у `/tmp/getw_t2/run.sh`.

---

## ADR Обробка `bun.lock`: пропуск мержу й умовний `bun install`

## Context and Problem Statement
`bun.lock` є lockfile, чий пофайловий merge через `git merge-file` дає лише шум і неробочий результат. Потрібно визначити, коли саме запускати `bun install` для перегенерації.

## Considered Options
* Брати версію target сліпо (як решта lockfiles)
* `bun install` завжди при наявності `bun.lock` у дельті
* `bun install` лише коли `bun.lock` поточної гілки реально відрізняється від версії worktree-гілки

## Decision Outcome
Chosen option: "`bun install` лише коли `bun.lock` відрізняється", because запуск `bun install`, коли обидва lock-файли ідентичні, є зайвою операцією; порівняння через `cmp` дає точний сигнал.

### Consequences
* Good, because `bun install` не запускається, якщо worktree й поточна гілка вже мають однаковий `bun.lock`.
* Bad, because якщо `package.json` змінився в обох гілках, але `bun.lock` збігається (нетиповий кейс), `bun install` не запуститься і залежності можуть бути неузгодженими.

## More Information
Файл `npm/getw.js`; helper `_getw_bun_lock_differs` використовує `git cat-file -p target:bun.lock` і `cmp -s`; інші lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`) беруться з target без перегенерації; функціональний тест у `/tmp/getw_bun/run.sh` з fake-bun.
