---
session: 7e30ed38-dea1-44a0-bcf9-97afe7986a1a
captured: 2026-06-03T10:52:47+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/7e30ed38-dea1-44a0-bcf9-97afe7986a1a/7e30ed38-dea1-44a0-bcf9-97afe7986a1a.jsonl
---

## ADR Перехід від `git checkout -- .` до дельта-патчу через `git apply`

## Context and Problem Statement
Команда `getw` переносила зміни з worktree-гілки у поточну гілку через `git checkout "$target_branch" -- .`, яка сліпо перезаписувала **всі** файли робочого дерева зрізом target. Файли, змінені лише в поточній гілці після розгалуження, затиралися старими версіями з worktree, і конфлікти не виявлялися.

## Considered Options
* `git checkout <branch> -- .` — поточна поведінка (зріз дерева)
* `git apply` на дельту `merge-base..target` — переносити лише файли, реально змінені в worktree-гілці

## Decision Outcome
Chosen option: "`git apply` на дельту `merge-base..target`", because цей підхід переносить лише зміни, внесені worktree-гілкою відносно спільного предка, і не чіпає файли поза патчем; git без `--index` кладе зміни як unstaged.

### Consequences
* Good, because файли, змінені тільки в поточній гілці, більше не затираються.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Файл: `npm/getw.js`. Ключова заміна: рядок `git checkout "$target_branch" -- .` → `git diff --binary "$merge_base" "$target_branch" | git apply --whitespace=nowarn`. Визначення merge-base: `git merge-base "$current_branch" "$target_branch"`.

---

## ADR Обробка конфліктів через пофайловий `git merge-file` замість `git apply --3way` або `--reject`

## Context and Problem Statement
Два послідовні підходи до конфліктів не спрацювали. `git apply --3way` падав з `does not match index`, бо поточна гілка і worktree незалежно правили одні файли, й індекс поточної гілки не збігався з preimage-блобами патча. `git apply --reject` вирішував проблему індексу, але залишав `.rej`-файли, й скрипт делегував їх **видалення** агенту — що є крихкою точкою відмови (залежить від дозволу `rm`, агент може забути).

## Considered Options
* `git apply --3way` — через індекс, лишає конфліктні маркери
* `git apply --reject` — без індексу, лишає `*.rej`-файли, агент видаляє `.rej`
* Пофайловий `git merge-file --diff3` — без індексу, скрипт сам ставить diff3-маркери і сам виносить вердикт

## Decision Outcome
Chosen option: "Пофайловий `git merge-file --diff3`", because `git merge-file` працює лише по файлах без індексу (немає `does not match index`), є неатомарним (один файл не блокує решту), а головне — скрипт сам детерміновано ставить маркери і сам перевіряє їхню відсутність; агент лише творчо прибирає маркери, а не ухвалює рішення про завершення.

### Consequences
* Good, because transcript фіксує очікувану користь: чіткий розподіл ролей — скрипт детерміновано виносить вердикт через `_getw_files_with_markers`, агент не може «прогавити» файл або не мати дозволу на `rm`.
* Bad, because `git merge-file` позначає конфліктом і сусідні (а не лише перетинні) зміни — такі дрібні ненеобхідні конфлікти теж йдуть на агента.

## More Information
Файл: `npm/getw.js`. Цикл: `git diff --no-renames --name-only "$merge_base" "$target_branch"` → `git merge-file -p --diff3 "$ours_tmp" "$base_tmp" "$theirs_tmp"`. Helper вердикту: `_getw_files_with_markers` (grep `^(<<<<<<<|>>>>>>>)`). Перевірено функціонально: кейси `ours_only`, `theirs_only`, `clean merge`, `real conflict`, `add`, `delete`, `binary` — всі пройшли.

---

## ADR Багаторівневий (tiered) резолв конфліктів із mergiraf як Tier 2

## Context and Problem Statement
Після впровадження `git merge-file` конфлікти, які line-based diff3 позначає помилково (зміни в різних частинах синтаксичного дерева, але в сусідніх рядках), надмірно потрапляли до LLM-агента. Виникло питання: чи існують детерміновані авторезолвери, які варто застосувати **перед** агентом.

## Considered Options
* Лише `git merge-file` + LLM-агент
* `git merge-file` → Mergiraf (AST/tree-sitter) → LLM-агент

## Decision Outcome
Chosen option: "`git merge-file` → Mergiraf → LLM-агент", because Mergiraf виконує структурний AST-мерж на tree-sitter для 25+ мов і розв'язує хибні конфлікти детерміновано й дешевше за LLM; LLM отримує лише справжній залишок.

### Consequences
* Good, because transcript фіксує очікувану користь: кількість викликів LLM зменшується; детерміновані рівні дешевші та відтворювані.
* Bad, because Mergiraf потребує встановлення (`brew install mergiraf` / `cargo install --locked mergiraf`); невідомі типи файлів (`.mdc`, lock) лишають маркери й все одно потрапляють до агента.

## More Information
Файл: `npm/getw.js`. Tier'и: **0** — чистий `git apply`; **1** — `git merge-file --diff3`; **2** — `mergiraf solve` (in-place, exit 0/1/2, off через `GETW_NO_MERGIRAF=1`; авто-встановлення через `_getw_ensure_mergiraf`: `brew install mergiraf`, фолбек `cargo install --locked mergiraf`); **3** — LLM-агент (`claude -p --permission-mode acceptEdits`, фолбек `cursor-agent -p`). Env-змінні: `GETW_MERGE_MODEL` (default `sonnet`), `GETW_MERGE_CURSOR_MODEL`. Формула homebrew-core: `mergiraf` 0.17.0, підтверджено `brew info mergiraf`.

---

## ADR Окрема обробка `bun.lock`: пропуск мержу та `bun install` лише при розбіжності

## Context and Problem Statement
`bun.lock` — бінарний/генерований lock-файл; пофайловий merge-file для нього дає лише шум. Перша версія: завжди запускати `bun install` якщо `bun.lock` є в дельті. Потім уточнено: `bun install` тільки якщо lock у поточній гілці **реально відрізняється** від версії у worktree-гілці.

## Considered Options
* Мержити `bun.lock` через `git merge-file` нарівні з іншими файлами
* Брати версію з target і запускати `bun install` завжди при наявності в дельті
* Пропускати мерж, запускати `bun install` лише коли локи реально відрізняються (порівняння через `cmp`)

## Decision Outcome
Chosen option: "Пропускати мерж, `bun install` лише при розбіжності", because порівняння через `cmp -s` між ours (робоче дерево або HEAD) і theirs (target-гілка) виключає зайвий `bun install` коли обидві гілки привели lock до однакового стану.

### Consequences
* Good, because transcript фіксує очікувану користь: не запускається зайвий `bun install` коли lock-и збігаються.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Файл: `npm/getw.js`. Helper `_getw_bun_lock_differs`: витягує ours через `git show HEAD:"$rel"` або з файлу, theirs через `git show "$tgt:$rel"`, порівнює `cmp -s`. Прапорець `regen_bun=1` + `regen_bun_path` ставляться в циклі лише коли differs повертає 0. Повторна перевірка перед `bun install` після мержу. Аналогічна логіка (пропуск мержу, версія з target) для `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` — але без `bun install`.
