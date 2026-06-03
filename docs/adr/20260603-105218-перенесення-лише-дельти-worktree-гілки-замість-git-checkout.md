---
session: 7e30ed38-dea1-44a0-bcf9-97afe7986a1a
captured: 2026-06-03T10:52:18+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/7e30ed38-dea1-44a0-bcf9-97afe7986a1a/7e30ed38-dea1-44a0-bcf9-97afe7986a1a.jsonl
---

## ADR Перенесення лише дельти worktree-гілки замість git checkout -- .

## Context and Problem Statement
Команда `getw` переносила файли з worktree-гілки (`main-fix`) у поточну гілку (`main`) через `git checkout "$target_branch" -- .`, що сліпо перезаписувала всі файли з worktree-гілки, затираючи зміни, присутні лише в поточній гілці.

## Considered Options
* `git checkout <branch> -- .` — перезаписування всього робочого дерева
* `git diff <merge-base> <target> | git apply` — перенесення лише дельти worktree-гілки від спільного предка

## Decision Outcome
Chosen option: "`git diff <merge-base> <target> | git apply`", because лише так переносяться файли, реально змінені у worktree-гілці, а файли, змінені тільки в поточній гілці, не зачіпаються. Спільний предок обчислюється через `git merge-base`.

### Consequences
* Good, because transcript фіксує очікувану користь: файли, змінені лише в `main`, більше не затираються.
* Bad, because `git apply` без `--index` є атомарним — один невдалий hunk блокує решту (виявилось при подальшому тестуванні).

## More Information
Файл `npm/getw.js`, рядки ~64–68. Команда `git apply --whitespace=nowarn`; `git merge-base "$current_branch" "$target_branch"` для знаходження merge-base.

---

## ADR Пофайловий git merge-file замість git apply --3way або --reject для конфліктів

## Context and Problem Statement
При конфліктах між гілками, що незалежно змінювали одні й ті самі файли (`.cursor/rules/*`, `CLAUDE.md`, `bun.lock`), `git apply --3way` падав з помилкою `does not match index` — бо `--3way` вимагає відповідності preimage-блобів патча з індексом. `git apply --reject` (наступна спроба) делегувало видалення `.rej`-файлів LLM-агенту, що є крихким: залежить від дозволів на `rm`, агент може не видалити — і скрипт хибно вважатиме мерж незавершеним або мовчки втрачатиме хунки.

## Considered Options
* `git apply --3way` — конфліктні маркери в індексі
* `git apply --reject` + агент видаляє `.rej` — агент відповідає за вердикт
* `git merge-file --diff3` (пофайловий, без індексу) + агент лише прибирає маркери + скрипт перевіряє маркери

## Decision Outcome
Chosen option: "`git merge-file --diff3` (пофайловий, без індексу) + агент лише прибирає маркери + скрипт перевіряє маркери", because скрипт має повністю контролювати детерміновану частину (підготовка конфлікту, вердикт, прибирання), а агент виконує лише творчу частину — знімає маркери. `git merge-file` не чіпає індекс → немає `does not match index`. Детермінований вердикт — grep маркерів `_getw_files_with_markers`.

### Consequences
* Good, because transcript фіксує очікувану користь: проблема `does not match index` зникає в принципі; агент не може «загубити» файл і вердикт не залежить від дозволів на `rm`.
* Bad, because `git merge-file` позначає конфліктом і сусідні (не лише перетинні) зміни — це стандартна поведінка diff3; такі хибні конфлікти теж потрапляють до агента.

## More Information
Файл `npm/getw.js`; helper `_getw_files_with_markers` (grep `^(<<<<<<<|>>>>>>>)`); флаг `--diff3` спеціально збережено (не `--zdiff3`) для сумісності з mergiraf (потребує base-секції `|||||||`). Функціонально перевірено на тимчасовому репозиторії (`/tmp/getw_func`): 8 кейсів (тільки theirs, тільки ours, неперетинні, перетинні, додавання, видалення, бінарні).

---

## ADR Багаторівневий пайплайн резолву конфліктів (Tier 0–3)

## Context and Problem Statement
Після переходу на `git merge-file` залишались «конфлікти», які line-based diff3 позначав дарма (зміни в різних частинах AST-дерева). LLM-агент для них надлишковий; запускати агента завжди — дорого й повільно.

## Considered Options
* Лише LLM-агент на всі конфлікти
* Mergiraf (AST/tree-sitter авторезолвер) перед агентом
* Багаторівневий пайплайн: `git apply` → `git merge-file` → `mergiraf solve` → LLM-агент

## Decision Outcome
Chosen option: "Багаторівневий пайплайн", because дешеві детерміновані резолвери обробляють конфлікти першими; LLM-агент задіюється лише для залишку.

### Consequences
* Good, because transcript фіксує очікувану користь: mergiraf розв'язує AST-конфлікти без агента; агент отримує лише справжні семантичні конфлікти.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Tier 0 — `git apply` (чисте накочування). Tier 1 — `git merge-file --diff3` (пофайловий, без індексу). Tier 2 — `mergiraf solve` (in-place, коди `0`/`1`/`2`); helper `_getw_ensure_mergiraf`: авто-встановлення `brew install mergiraf`, фолбек `cargo install --locked mergiraf`; вимикається `GETW_NO_MERGIRAF=1`. Tier 3 — LLM-агент (`claude -p --permission-mode acceptEdits`, фолбек `cursor-agent -p`); моделі через `GETW_MERGE_MODEL` / `GETW_MERGE_CURSOR_MODEL`. Файл `npm/getw.js`, helper `_getw_mergiraf_solve`, `_getw_ensure_mergiraf`, `_getw_resolve_with_agent`.

---

## ADR Окрема обробка bun.lock через bun install лише при розбіжності

## Context and Problem Statement
`bun.lock` потрапляв у пофайловий merge-file, що для lock-файлів дає лише шум (вони генеруються автоматично). При цьому запускати `bun install` щоразу надлишково — якщо lock-файли в обох гілках однакові, перегенерація не потрібна.

## Considered Options
* Брати `bun.lock` з target (без `bun install`)
* Пропускати `bun.lock` у merge-file і завжди запускати `bun install` після мержу
* Пропускати `bun.lock` у merge-file і запускати `bun install` лише коли lock-файли реально відрізняються

## Decision Outcome
Chosen option: "Пропускати `bun.lock` у merge-file і запускати `bun install` лише коли lock-файли реально відрізняються", because `bun install` має право запускатися лише тоді, коли є реальна розбіжність між локальним lock і версією worktree-гілки.

### Consequences
* Good, because transcript фіксує очікувану користь: `bun install` не запускається, якщо `bun.lock` збігається — зайвих викликів пакетного менеджера немає.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Helper `_getw_bun_lock_differs`: отримує **ours** з робочого дерева або `HEAD`, **theirs** з `git show $target:$rel`, порівнює через `cmp -s`; повертає 0 (різні) або 1 (однакові). Lock-файли `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` — беруться з target без `bun install`. Перегенерація `bun install` відбувається лише після **повністю успішного** мержу (на конфліктах/маркерах `return 1` раніше). Файл `npm/getw.js`, змінна `regen_bun_path`.
