---
session: 7e30ed38-dea1-44a0-bcf9-97afe7986a1a
captured: 2026-06-03T10:53:56+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/7e30ed38-dea1-44a0-bcf9-97afe7986a1a/7e30ed38-dea1-44a0-bcf9-97afe7986a1a.jsonl
---

## ADR Дельта-перенесення worktree замість сліпого git checkout

## Context and Problem Statement
Команда `getw` для перенесення змін з git-worktree у поточну гілку використовувала `git checkout "$target_branch" -- .`, що сліпо перезаписувало всі файли робочого дерева версіями з worktree-гілки. Файли, змінені лише в поточній гілці (але не в worktree), містили старі версії — їх перезаписувано без конфліктних попереджень, зміни втрачалися безповоротно.

## Considered Options
* `git checkout "$target_branch" -- .` (поточна поведінка — сліпе перезаписування)
* `git diff merge-base..target | git apply` (перенесення лише дельти від спільного merge-base)

## Decision Outcome
Chosen option: "git diff merge-base..target | git apply", because перенесення лише дельти worktree-гілки (від спільного `merge-base`) не зачіпає файли поза патчем — зміни поточної гілки зберігаються. `git apply` без `--index` кладе зміни як unstaged, не чіпаючи індекс.

### Consequences
* Good, because файли, змінені лише в поточній гілці, більше не затираються — transcript фіксує очікувану користь: «ours_only.txt збережено (ключове виправлення)».
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Виправлено у `npm/getw.js`; попередній рядок: `git checkout "$target_branch" -- .`; замінено на `git diff --binary "$merge_base" "$target_branch" | git apply --whitespace=nowarn`.

---

## ADR Багаторівневий детермінований пайплайн розв'язання конфліктів у getw

## Context and Problem Statement
Після переходу на дельта-перенесення при конфлікті потрібна стратегія. Підходи `git apply --3way` і `git apply --reject` перевірялися і відкидалися: `--3way` падав з помилкою `does not match index` на брудному робочому дереві; `--reject` делегував видалення `.rej`-файлів агенту, що робило вердикт про успіх недетермінованим.

## Considered Options
* `git apply --3way` (з конфліктними маркерами через індекс)
* `git apply --reject` (часткове накочування, решта у `*.rej`)
* Пофайловий `git merge-file --diff3` + Mergiraf (AST) + LLM-агент на залишок

## Decision Outcome
Chosen option: "Пофайловий git merge-file --diff3 + Mergiraf + LLM-агент на залишок", because `git merge-file` працює лише по файлах без індексу (усуває `does not match index`), Mergiraf розв'язує структурно-нешкідливі конфлікти до агента, LLM отримує лише справжній залишок. Вердикт і прибирання — завжди за скриптом (`_getw_files_with_markers`), а не за агентом.

### Consequences
* Good, because transcript фіксує очікувану користь: усі тестові кейси (only-ours, only-theirs, non-overlapping, true conflict, add, delete, binary) відпрацювали коректно у функціональному тесті на тимчасовому репо.
* Bad, because `git merge-file` маркує конфліктними навіть сусідні (не лише перетинні) зміни — такі «зайві» конфлікти потрапляють на mergiraf/агента; transcript фіксує це як відому поведінку diff3.

## More Information
Tier 0: `git apply`; Tier 1: `git merge-file --diff3` (у `npm/getw.js`); Tier 2: `mergiraf solve` (опційно, `GETW_NO_MERGIRAF=1` вимикає, авто-встановлення через `brew install mergiraf` → `cargo install --locked mergiraf`); Tier 3: `claude -p --permission-mode acceptEdits --allowedTools "Edit,Write,MultiEdit,Read"`, фолбек `cursor-agent -p`. Зміни у `npm/getw.js`, `npm/README.md`.

---

## ADR Скрипт володіє вердиктом і прибиранням, агент — лише творчою роботою

## Context and Problem Statement
Перша реалізація конфліктного резолву через `git apply --reject` передавала агенту завдання «видалити `.rej`-файли», що означало: успіх мержу залежав від того, чи має агент дозвіл на `rm` і чи виконає він видалення. Якщо агент забував або не мав дозволу — скрипт або хибно вважав мерж незавершеним, або (гірше) мовчки втрачав хунки.

## Considered Options
* Агент видаляє `.rej`-файли як сигнал успіху
* Скрипт виносить вердикт через grep маркерів (`_getw_files_with_markers`), агент лише редагує файли

## Decision Outcome
Chosen option: "Скрипт виносить вердикт через grep маркерів, агент лише редагує файли", because вердикт про успіх не можна віддавати агенту — це детермінована операція. Агент отримує тільки творчу частину (прибрати конфліктні маркери), а дозволи звужено до `Edit,Write,MultiEdit,Read`.

### Consequences
* Good, because transcript фіксує очікувану користь: сценарій «агент забув видалити» або «немає дозволу на rm» більше не призводить до втрати даних — worktree завжди зберігається при незавершеному мержі.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Helper `_getw_files_with_markers` у `npm/getw.js`; критерій вердикту — `grep -qE '^(<<<<<<<|>>>>>>>)'` по файлах конфліктного списку після агента.

---

## ADR Окрема обробка bun.lock: пропуск мержу, bun install лише при відмінності

## Context and Problem Statement
`bun.lock` потрапляв у загальний пайплайн merge-file/mergiraf/агент, хоча пофайловий merge lock-файлу дає лише шум. Постало питання: коли саме запускати `bun install` — завжди, або лише коли lock-и реально відрізняються між гілками.

## Considered Options
* Завжди запускати `bun install` коли `bun.lock` є в дельті
* Запускати `bun install` лише коли локальний `bun.lock` і версія у worktree-гілці реально відрізняються (`cmp -s`)
* Брати `bun.lock` з target без жодного `bun install`

## Decision Outcome
Chosen option: "Запускати bun install лише коли локальний bun.lock і версія у worktree-гілці реально відрізняються", because це мінімізує зайві перегенерації і є семантично точним. `bun.lock` не мержиться жодним tier'ом; helper `_getw_bun_lock_differs` порівнює ours (з робочого дерева або `HEAD`) і theirs (з `target_branch`) через `cmp -s`; конвенція: `bun.lock` існує лише в корені репо.

### Consequences
* Good, because transcript фіксує очікувану користь: якщо lock-и збігаються — `bun install` не запускається; якщо відрізняються — запускається після повністю успішного мержу.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Helper `_getw_bun_lock_differs` і прапорець `regen_bun` у `npm/getw.js`; перевірка точного шляху `[[ "$rel" = "bun.lock" ]]` у циклі; `npm/README.md` оновлено. Інші lock-файли (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`) беруться з target без `bun install`.
