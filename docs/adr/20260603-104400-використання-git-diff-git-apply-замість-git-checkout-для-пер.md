---
session: 7e30ed38-dea1-44a0-bcf9-97afe7986a1a
captured: 2026-06-03T10:44:00+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/7e30ed38-dea1-44a0-bcf9-97afe7986a1a/7e30ed38-dea1-44a0-bcf9-97afe7986a1a.jsonl
---

Проаналізував транскрипт. Ось ADR-документація по ключових рішеннях сесії:

---

## ADR Використання git diff + git apply замість git checkout -- . для перенесення змін worktree

## Context and Problem Statement
Команда `getw` переносила файли з worktree-гілки у поточну гілку через `git checkout "$target_branch" -- .`, що сліпо перезаписувало **всі** файли поточної гілки версіями з worktree-гілки. Оскільки worktree-гілка містить старі версії файлів, яких вона не чіпала, зміни в поточній гілці мовчки затирались.

## Considered Options
* `git checkout <branch> -- .` — перезаписати всі файли (поточна поведінка)
* `git diff merge_base..target | git apply` — перенести лише дельту worktree-гілки

## Decision Outcome
Chosen option: "`git diff merge_base..target | git apply`", because це переносить виключно зміни, які зробила worktree-гілка, а файли поза дельтою (змінені лише в поточній гілці) не зачіпаються.

### Consequences
* Good, because transcript фіксує очікувану користь: файли, змінені лише в поточній гілці, більше не затираються; конфлікти виявляються явно замість мовчазної втрати даних.
* Bad, because `git apply` атомарний — один невдалий файл (наприклад `bun.lock`) блокує застосування всього патчу.

## More Information
Змінено `npm/getw.js`, рядок `git checkout "$target_branch" -- .` замінено на `git diff --binary "$merge_base" "$target_branch" | git apply --whitespace=nowarn`. Merge-base обчислюється через `git merge-base "$current_branch" "$target_branch"`.

---

## ADR Пофайловий 3-way merge через git merge-file замість git apply --3way або git apply --reject

## Context and Problem Statement
Після переходу на `git apply` виникли проблеми з обробкою конфліктів: `git apply --3way` падав з помилкою `does not match index` коли індекс поточної гілки не збігався з preimage-блобами патча (обидві гілки незалежно правили ті самі tooling-файли). `git apply --reject` потребував делегування видалення `.rej`-файлів агенту, що робило вердикт про успіх недетермінованим.

## Considered Options
* `git apply --3way` — 3-way merge через індекс
* `git apply --reject` — часткове застосування з `.rej`-файлами, агент видаляє `.rej`
* Пофайловий `git merge-file --diff3` — 3-way merge безпосередньо по файлах, без індексу

## Decision Outcome
Chosen option: "Пофайловий `git merge-file --diff3`", because він працює виключно по файлах (не через індекс), тому не дає помилки `does not match index`; скрипт сам ставить конфліктні маркери й сам виносить вердикт про успіх (grep маркерів), не покладаючись на агента для видалення артефактів.

### Consequences
* Good, because transcript фіксує очікувану користь: детерміністичний вердикт залишається за скриптом; агент робить лише творчу частину (прибирає маркери); функціональний тест підтвердив коректність для 8 кейсів (only-ours, only-theirs, non-overlapping, conflict, add, delete, modify-delete, binary).
* Bad, because `git merge-file` маркує конфлікт навіть для сусідніх (не лише перетинних) змін — transcript зазначає це як відому поведінку diff3.

## More Information
Реалізовано в `npm/getw.js`: цикл по `git diff --no-renames --name-only "$merge_base" "$target_branch"`, для кожного файлу — `git merge-file --diff3 -p -L ... "$ours_tmp" "$base_tmp" "$theirs_tmp"`. Прапорець `--diff3` лишає base-секцію `|||||||`, необхідну для mergiraf. Вердикт — через `_getw_files_with_markers`. Функціональний тест: `/tmp/getw_func/run.sh`.

---

## ADR Багаторівневий (tiered) резолвер конфліктів: merge-file → mergiraf → LLM-агент

## Context and Problem Statement
Після впровадження `git merge-file` частина конфліктів, які diff3 позначає маркерами, насправді сумісні на синтаксичному рівні (зміни в різних частинах AST). Покладатись одразу на LLM-агента дорого й повільно; потрібні детерміновані авторезолвери, які обробляють прості випадки без агента.

## Considered Options
* Лише `git merge-file` + LLM-агент
* `git merge-file` → mergiraf (AST-авторезолвер) → LLM-агент

## Decision Outcome
Chosen option: "Багаторівневий: `git merge-file` → `mergiraf` → LLM-агент", because mergiraf розв'язує конфлікти, які line-based diff3 позначає дарма (зміни в різних частинах синтаксичного дерева), зменшуючи кількість маркерів, що доходять до агента.

### Consequences
* Good, because transcript фіксує очікувану користь: mergiraf є опційним (вмикається автоматично при наявності в PATH, `GETW_NO_MERGIRAF=1` вимикає); авто-встановлення через `brew install mergiraf` (фолбек `cargo install --locked mergiraf`); fake-mergiraf тест підтвердив wiring усіх трьох tier'ів.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Tier 0: `git apply`; Tier 1: `git merge-file --diff3`; Tier 2: `mergiraf solve <file>` (mergiraf 0.17.0, homebrew-core); Tier 3: `claude -p ... --permission-mode acceptEdits` (фолбек `cursor-agent -p`). Агент отримує лише список файлів з маркерами; вердикт скрипта — `_getw_files_with_markers`. Реалізовано в `npm/getw.js`; helper `_getw_ensure_mergiraf`, `_getw_mergiraf_solve`.

---

## ADR Окрема обробка bun.lock: виключення з патчу + перегенерація через bun install

## Context and Problem Statement
`bun.lock` потрапляв у загальний merge-цикл, де пофайловий merge давав лише шум (lock-файли не призначені для ручного злиття). Крім того, `regen_bun=1` спочатку виставлявся лише у конфліктній гілці, тож якщо `git apply` проходив чисто, `bun install` не викликався навіть коли `bun.lock` реально змінився у дельті.

## Considered Options
* Мержити `bun.lock` як звичайний файл (через `git merge-file` або take-theirs)
* Виключити `bun.lock` з патчу заздалегідь, виставити `regen_bun=1` до будь-якого apply, перегенерувати через `bun install`

## Decision Outcome
Chosen option: "Виключити з патчу заздалегідь + `bun install` після мержу", because `bun.lock` не підлягає ручному злиттю — його правильний стан визначається `bun install` зі змердженого `package.json`; виявлення наявності в дельті (`git diff --name-only`) до apply дозволяє гарантувати `bun install` незалежно від шляху (чистий apply чи конфліктний).

### Consequences
* Good, because transcript фіксує очікувану користь: `regen_bun=1` виставляється до будь-якого apply; патч генерується без `bun.lock` (`git diff ... -- ${(f)non_bun}`); fake-bun тест підтвердив що `bun install` викликається після мержу.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
`bun.lock` виявляється через `echo "$changed_files" | grep -qF 'bun.lock'` перед генерацією патчу. Патч генерується без нього: `git diff --binary "$merge_base" "$target_branch" -- ${(f)non_bun}`. Після успішного мержу: `bun install > /dev/null 2>&1`. Інші lock-файли (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`) беруться з target через `git show "$target_branch:$rel"`. Реалізовано в `npm/getw.js`; тест `/tmp/getw_bun/run.sh`.
