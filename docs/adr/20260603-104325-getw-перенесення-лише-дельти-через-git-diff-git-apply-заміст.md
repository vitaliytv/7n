---
session: 7e30ed38-dea1-44a0-bcf9-97afe7986a1a
captured: 2026-06-03T10:43:25+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/7e30ed38-dea1-44a0-bcf9-97afe7986a1a/7e30ed38-dea1-44a0-bcf9-97afe7986a1a.jsonl
---

## ADR getw: перенесення лише дельти через git diff + git apply замість git checkout -- .

## Context and Problem Statement
`getw` (npm/getw.js) переносив зміни з worktree-гілки у поточну гілку командою `git checkout "$target_branch" -- .`, яка сліпо перезаписувала **всі** файли робочого дерева вмістом worktree-гілки. Файли, змінені тільки в поточній гілці після точки розгалуження worktree, затирались без жодного попередження — конфлікти не виявлялись.

## Considered Options
* `git checkout <branch> -- .` — сліпе перезаписування (поточна реалізація)
* `git diff <merge-base> <target> | git apply` — перенесення лише дельти worktree-гілки від спільного предка

## Decision Outcome
Chosen option: "`git diff <merge-base> <target> | git apply`", because лише ця форма переносить виключно файли, реально змінені у worktree-гілці, не чіпаючи файли, яких та гілка не торкалась.

### Consequences
* Good, because transcript фіксує очікувану користь: файли, змінені тільки в поточній гілці, більше не перезаписуються.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Файл: `npm/getw.js`. Ключова зміна: `git merge-base "$current_branch" "$target_branch"` → `git diff --binary "$merge_base" "$target_branch" | git apply`. Функціональний тест підтвердив: `ours_only.txt` збережено.

---

## ADR getw: пофайловий git merge-file --diff3 замість git apply --3way або git apply --reject

## Context and Problem Statement
Після переходу на `git diff | git apply` виникла потреба обробляти конфлікти. Спроба `git apply --3way` давала помилку `does not match index`, бо обидві гілки незалежно правили ті самі tooling-файли і індекс `main` не збігався з preimage-блобами патча; крім того, `git apply` є атомарним — один `bun.lock` блокував перенесення решти файлів. Наступна спроба `git apply --reject` (+ агент видаляє `.rej`) виявилась крихкою: скрипт делегував вердикт успіху агенту через факт видалення `.rej`.

## Considered Options
* `git apply --3way` — через індекс, з конфліктними маркерами
* `git apply --reject` + агент видаляє `.rej`
* Пофайловий `git merge-file --diff3` — без індексу, детермінований вердикт у скрипті

## Decision Outcome
Chosen option: "Пофайловий `git merge-file --diff3`", because цей варіант працює **лише по файлах без індексу** (усуває `does not match index` в принципі), є неатомарним (кожен файл обробляється окремо), а вердикт «чи лишились маркери» виноситься детерміновано скриптом (`_getw_files_with_markers`), без делегування агенту.

### Consequences
* Good, because transcript фіксує очікувану користь: `does not match index` зникло, `bun.lock` більше не блокує інші файли, скрипт повністю контролює вердикт.
* Bad, because `git merge-file` маркує конфлікт навіть для сусідніх (не лише перетинних) змін — звичайна поведінка diff3; такі «зайві» конфлікти підуть до агента.

## More Information
Файл: `npm/getw.js`. Флаг `--diff3` вибрано спеціально: лишає base-секцію `|||||||`, яку потребує mergiraf (Tier 2). Helper `_getw_files_with_markers` — детермінований grep на `^(<<<<<<<|>>>>>>>)`. Функціональний тест перевірив 8 кейсів (тільки theirs, тільки ours, обидва без перетину, конфлікт, додавання, видалення, видалення з локальними змінами, бінарний файл).

---

## ADR getw: багаторівневий резолв конфліктів — mergiraf як Tier 2 перед LLM-агентом

## Context and Problem Statement
Після введення `git merge-file` залишались конфлікти, які line-based diff3 позначав дарма (зміни у різних частинах синтаксичного дерева). Передавати їх відразу LLM-агенту — дорого і повільно. Виникло питання: чи є детерміновані авторезолвери, дешевші за агента.

## Considered Options
* Відразу LLM-агент на всі залишкові маркери
* Mergiraf (`mergiraf solve`) як проміжний Tier між `git merge-file` і LLM-агентом

## Decision Outcome
Chosen option: "Mergiraf як Tier 2", because це структурний AST-merge на tree-sitter (підтримує 25+ мов), що автоматично зливає конфлікти, які diff3 позначив дарма, і лише при невдачі передає файли агенту.

### Consequences
* Good, because transcript фіксує очікувану користь: конфлікти, які mergiraf «розв'язав», не йдуть до агента; невідомі типи (`.mdc`, lock-файли) → лишає маркери → падає на агента без шкоди.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Файл: `npm/getw.js`. Тир-схема: Tier 0 — чистий `git apply`; Tier 1 — `git merge-file --diff3`; Tier 2 — `mergiraf solve` (off через `GETW_NO_MERGIRAF=1`); Tier 3 — `claude -p --permission-mode acceptEdits`, фолбек `cursor-agent -p`. Авто-встановлення: `brew install mergiraf`, фолбек `cargo install --locked mergiraf`. Вердикт скрипта — виключно grep маркерів `_getw_files_with_markers`. Перевірено з fake-mergiraf.

---

## ADR getw: bun.lock не мержиться — bun install лише коли lock-файли реально відрізняються

## Context and Problem Statement
`bun.lock` є auto-generated файлом: результат пофайлового `git merge-file` для нього семантично безглуздий і може дати шум; передавати його mergiraf чи агенту також не має сенсу. Водночас просто брати версію target не завжди правильно — якщо обидва lock-файли однакові, `bun install` зайвий.

## Considered Options
* Мержити `bun.lock` як звичайний файл (merge-file / mergiraf / агент)
* Брати версію target завжди
* Пропустити мерж і запускати `bun install` лише коли lock-файли реально відрізняються

## Decision Outcome
Chosen option: "Пропустити мерж і запускати `bun install` лише коли lock-файли реально відрізняються", because `bun.lock` — auto-generated, його мерж семантично некоректний; `bun install` потрібен тільки коли lock поточної гілки (робоче дерево або HEAD) і lock worktree-гілки розбіжні, тобто залежності дійсно оновились.

### Consequences
* Good, because transcript фіксує очікувану користь: зайвий `bun install` не запускається коли lock-файли збігаються; `bun.lock` не потрапляє до mergiraf чи агента.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Файл: `npm/getw.js`. Helper `_getw_bun_lock_differs` порівнює через `cmp -s` (ours з робочого дерева або HEAD vs theirs з `target_branch`). Прапорець `regen_bun=1` та шлях `regen_bun_path` виставляються лише коли `cmp` виявляє розбіжність. `bun install` запускається після повністю успішного мержу (без маркерів) з повторною перевіркою через `_getw_bun_lock_differs`. Аналогічно відкладаються `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` (без `bun install` — перегенерація вручну).
