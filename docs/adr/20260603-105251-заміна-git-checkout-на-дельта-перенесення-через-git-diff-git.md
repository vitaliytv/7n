---
session: 7e30ed38-dea1-44a0-bcf9-97afe7986a1a
captured: 2026-06-03T10:52:51+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/7e30ed38-dea1-44a0-bcf9-97afe7986a1a/7e30ed38-dea1-44a0-bcf9-97afe7986a1a.jsonl
---

## ADR Заміна `git checkout -- .` на дельта-перенесення через `git diff | git apply` у `getw`

## Context and Problem Statement
Команда `getw` переносила зміни з worktree-гілки у поточну гілку за допомогою `git checkout "$target_branch" -- .`, що замінювало **усі** файли робочого дерева версіями з worktree-гілки. Якщо поточна гілка (`main`) мала власні зміни у файлах, яких worktree-гілка не чіпала, ці зміни **мовчки затирались** без жодного повідомлення про конфлікт.

## Considered Options
* `git checkout "$target_branch" -- .` — поточна реалізація (сліпе перезаписування)
* `git diff --binary "$merge_base" "$target_branch" | git apply` — перенесення лише дельти відносно спільного `merge-base`

## Decision Outcome
Chosen option: "`git diff --binary "$merge_base" "$target_branch" | git apply`", because це переносить лише ті файли, що реально змінила worktree-гілка, а файли, змінені виключно в поточній гілці, не зачіпаються.

### Consequences
* Good, because transcript фіксує очікувану користь: зміни поточної гілки більше не перезаписуються версіями з worktree-гілки, що стало першопричиною звернення.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Файл: `npm/getw.js`. Ключова зміна — `git merge-base "$current_branch" "$target_branch"` та `git diff --binary "$merge_base" "$target_branch" | git apply --whitespace=nowarn`. Зафіксовано в change-файлі пакета `npm/` секція `Fixed`, bump `patch`.

---

## ADR Пофайловий `git merge-file` замість `git apply --3way` і `--reject` для обробки конфліктів у `getw`

## Context and Problem Statement
Перша реалізація конфліктного шляху використала `git apply --3way`, яка впала з помилкою `does not match index` на tooling-файлах, що **обидві** гілки міняли незалежно (`.cursor/rules/*`, `CLAUDE.md`, `bun.lock`). Заміна на `git apply --reject` лишила `.rej`-файли і делегувала агенту їх **видалення** як сигнал успіху — користувач вказав, що це крихко: агент може не мати дозволу на `rm`, або «забути», і тоді вердикт хибний.

## Considered Options
* `git apply --3way` — не підходить: вимагає збігу індексних записів з preimage-блобами патча
* `git apply --reject` + агент видаляє `.rej` — крихко: вердикт про успіх у руках агента
* Пофайловий `git merge-file --diff3` — скрипт ставить маркери безпосередньо у файли (без індексу); скрипт сам перевіряє залишок маркерів

## Decision Outcome
Chosen option: "пофайловий `git merge-file --diff3`", because відсутність необхідності в індексі прибирає клас помилок `does not match index`, а детермінований вердикт (`_getw_files_with_markers`) лишається виключно за скриптом.

### Consequences
* Good, because transcript фіксує очікувану користь: відповідальність за вердикт «мерж успішний» повністю в скрипті; агент лише прибирає маркери у вже наявних файлах і не потребує дозволу на `rm`.
* Bad, because `git merge-file` може позначати сусідні (не лише перетинні) зміни як конфлікт — нормальна поведінка diff3, такі випадки теж потрапляють до mergiraf/агента.

## More Information
Файл: `npm/getw.js`. Флаг `--diff3` навмисно (а не `--zdiff3`): лишає base-секцію `|||||||`, яку потребує mergiraf. Helper `_getw_files_with_markers` (grep `^(<<<<<<<|>>>>>>>)`) — детермінований критерій вердикту. Функціонально перевірено у `/tmp/mftest/probe.sh` та `/tmp/getw_func/run.sh` на кейсах: тільки theirs, тільки ours, неперетинні, конфлікт, додавання, видалення, бінарний.

---

## ADR Багаторівневий пайплайн резолву конфліктів: `git merge-file` → mergiraf → LLM-агент у `getw`

## Context and Problem Statement
Після переходу на `git merge-file` залишок конфліктних маркерів передавався напряму LLM-агенту (`claude -p`). Користувач запропонував поставити **детерміновані авторезолвери** перед агентом, щоб скоротити кількість звернень до LLM.

## Considered Options
* Передавати весь залишок конфліктів одразу агенту
* Багаторівневий пайплайн: line-based merge (Tier 1) → структурний AST-авторезолвер mergiraf (Tier 2) → LLM-агент (Tier 3)

## Decision Outcome
Chosen option: "багаторівневий пайплайн", because детерміновані tier'и (mergiraf AST-merge) розв'язують конфлікти, які `git merge-file` позначає дарма через line-based обмеження, без витрат на LLM.

### Consequences
* Good, because transcript фіксує очікувану користь: агент отримує лише справжній залишок; mergiraf підтримує 25+ мов (JS/TS, Go, Rust, Python, YAML, TOML, JSON тощо).
* Bad, because mergiraf може бути відсутнім; якщо `brew install mergiraf` / `cargo install --locked mergiraf` провалюється, Tier 2 мовчки пропускається.

## More Information
Файл: `npm/getw.js`. Helper `_getw_ensure_mergiraf`: авто-встановлення через `brew install mergiraf` (homebrew-core 0.17.0, bottled), фолбек `cargo install --locked mergiraf`. Вимикається `GETW_NO_MERGIRAF=1`. Tier 2 — `mergiraf solve <file>` in-place; вердикт — grep маркерів скриптом (не exit-код mergiraf). Tested з fake-mergiraf у `/tmp/getw_t2/run.sh`.

---

## ADR Окрема обробка `bun.lock` через `bun install` лише за умови відмінності версій у `getw`

## Context and Problem Statement
`bun.lock` є бінарним/структурованим lock-файлом, пофайловий `git merge-file` для нього дає лише шум. Потрібна стратегія: або брати версію target, або перегенеровувати. Додатково виникло питання — запускати `bun install` завжди, чи лише коли lock-файли реально відрізняються.

## Considered Options
* Брати версію target для `bun.lock` завжди (без `bun install`)
* Перегенеровувати `bun.lock` через `bun install` завжди при появі у дельті
* Перегенеровувати `bun.lock` через `bun install` лише коли `bun.lock` поточної гілки і worktree-гілки **реально відрізняються**

## Decision Outcome
Chosen option: "перегенерувати через `bun install` лише коли lock-и реально відрізняються", because якщо обидві гілки прийшли до однакового lock, зайвий `bun install` не потрібен.

### Consequences
* Good, because transcript фіксує очікувану користь: `bun install` не запускається без потреби; вердикт ґрунтується на порівнянні реального вмісту файлів.
* Bad, because якщо `package.json` змінився, але `bun.lock` у worktree збігається з локальним, `bun install` не запуститься — користувач сам має перевірити залежності. Transcript визнає цей кейс можливим.

## More Information
Файл: `npm/getw.js`. Helper `_getw_bun_lock_differs`: порівнює ours (робоче дерево або `HEAD`) з `target_branch` через `cmp -s`. Змінна `regen_bun_path` зберігає шлях до `bun.lock` (не жорстко `"bun.lock"` у корені). Перед запуском `bun install` — повторна перевірка `_getw_bun_lock_differs`. Аналогічно відкладаються `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, але без `bun install`. Зафіксовано в change-файлі `npm/`, секція `Changed`, bump `patch`.
