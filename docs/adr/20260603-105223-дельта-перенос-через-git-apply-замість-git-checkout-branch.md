---
session: 7e30ed38-dea1-44a0-bcf9-97afe7986a1a
captured: 2026-06-03T10:52:23+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/7e30ed38-dea1-44a0-bcf9-97afe7986a1a/7e30ed38-dea1-44a0-bcf9-97afe7986a1a.jsonl
---

## ADR Дельта-перенос через `git apply` замість `git checkout <branch> -- .`

## Context and Problem Statement
Команда `getw` переносила зміни з worktree-гілки в поточну через `git checkout "$target_branch" -- .`, що сліпо замінювало **всі** файли версіями з worktree-гілки. Файли, змінені лише в поточній гілці після точки розгалуження, перезаписувались старими версіями — без виявлення конфліктів і без попередження.

## Considered Options
* Сліпе перезаписування через `git checkout <branch> -- .`
* Перенесення лише дельти (merge-base..target) через `git apply`

## Decision Outcome
Chosen option: "Перенесення лише дельти через `git apply`", because перенесення через `git diff "$merge_base" "$target_branch" | git apply` торкається лише файлів, реально змінених у worktree-гілці, і не затирає файли, змінені виключно в поточній гілці.

### Consequences
* Good, because файли, змінені тільки в поточній гілці, більше не перезаписуються.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Файл: `npm/getw.js`. Ключовий рядок до виправлення: `git checkout "$target_branch" -- .`. Після: `git diff --binary "$merge_base" "$target_branch" | git apply --whitespace=nowarn`.

---

## ADR Власник вердикту успіху мержу — скрипт, а не агент

## Context and Problem Statement
У першій версії інтелектуального мержу скрипт делегував агенту не лише розв'язання конфліктів, а й видалення `.rej`-файлів. Сигнал завершення («`.rej` зникли») залежав від того, чи агент виконав `rm` — а це залежить від його дозволів і може бути забуто, що призводить до хибних вердиктів або мовчазної втрати даних.

## Considered Options
* Агент видаляє `.rej`, їхня відсутність — сигнал успіху
* Скрипт детерміновано перевіряє наявність конфліктних маркерів (`<<<<<<<` / `>>>>>>>`) після виходу агента

## Decision Outcome
Chosen option: "Скрипт детерміновано перевіряє наявність конфліктних маркерів", because вердикт про успіх — детермінована операція, яку не можна передавати агенту; скрипт grep-ає маркери через `_getw_files_with_markers` і є єдиним авторитетом щодо завершеності мержу.

### Consequences
* Good, because transcript фіксує очікувану користь: сигнал успіху не залежить від дозволів агента і не може бути пропущений мовчки.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Файл: `npm/getw.js`, helper `_getw_files_with_markers`. Агент дістав звужені `--allowedTools "Edit,Write,MultiEdit,Read"` — без права на `rm`.

---

## ADR Пофайловий `git merge-file --diff3` замість `git apply --3way` / `--reject`

## Context and Problem Statement
Після першого впровадження `git apply --3way` скрипт падав з помилкою `does not match index` на файлах, які обидві гілки незалежно змінили (`.cursor/rules/*`, `CLAUDE.md`, `.n-cursor.json`, `bun.lock`). Причина: `--3way` працює через індекс і вимагає збігу preimage-блобів з індексними записами. Спроба з `git apply --reject` усунула `does not match index`, але залишила проблему видалення `.rej` агентом.

## Considered Options
* `git apply --3way` (через індекс, атомарний)
* `git apply --reject` (по робочому дереву, неатомарний, з `.rej`)
* Пофайловий `git merge-file --diff3` (по файлах, без індексу)

## Decision Outcome
Chosen option: "Пофайловий `git merge-file --diff3`", because він працює виключно по файлах без звернення до індексу, тож помилка `does not match index` зникає в принципі; він неатомарний (невдача одного файлу не блокує решту); `--diff3` лишає base-секцію `|||||||`, яку потребує mergiraf на наступному tier'і.

### Consequences
* Good, because transcript фіксує очікувану користь: усі тест-кейси (тільки ours, тільки theirs, неперетинні зміни, конфлікт, додавання, видалення, бінарний) пройшли у функціональному тесті на тимчасовому репо.
* Bad, because `git merge-file` маркує сусідні (не лише перетинні) зміни як конфлікт — стандартна поведінка diff3; такі «зайві» конфлікти підуть на агента.

## More Information
Файл: `npm/getw.js`. Команди: `git merge-file -p --diff3 -L ... "$ours_tmp" "$base_tmp" "$theirs_tmp"`. Функціональний тест: `/tmp/getw_func/run.sh`. Фіксований change-файл: `npm/.changes/…`, bump `patch`, секція `Fixed`.

---

## ADR Багаторівневий резолв конфліктів: merge-file → mergiraf → LLM-агент

## Context and Problem Statement
Після впровадження `git merge-file` деякі конфлікти лишалися як diff3-маркери, хоча line-based diff3 позначав їх дарма (зміни у різних частинах синтаксичного дерева). Водночас LLM-агент — дорогий і недетермінований — не мав сенсу залучатись до конфліктів, які може розв'язати дешевший автоматичний інструмент.

## Considered Options
* Лише LLM-агент для всіх залишкових конфліктів
* Багаторівнева схема: детерміновані авторезолвери спершу, агент лише на залишок

## Decision Outcome
Chosen option: "Багаторівнева схема", because дешеві детерміновані кроки знімають більшість конфліктів без залучення агента; агент отримує лише справжній залишок.

### Consequences
* Good, because transcript фіксує очікувану користь: `mergiraf solve` розв'язує конфлікти у файлах, де diff3 позначив змін дарма; агент не викликається для вже розв'язаних файлів.
* Bad, because mergiraf не знає типи `.mdc`, lock-файли тощо — вони все одно йдуть на агента або обробляються окремо.

## More Information
Tier'и у `npm/getw.js`:
- **Tier 0** — чистий `git apply`;
- **Tier 1** — `git merge-file --diff3`;
- **Tier 2** — `mergiraf solve` (in-place, off через `GETW_NO_MERGIRAF=1`; авто-встановлення через `brew install mergiraf`, фолбек `cargo install --locked mergiraf`);
- **Tier 3** — `claude -p --permission-mode acceptEdits --model ${GETW_MERGE_MODEL:-sonnet}`, фолбек `cursor-agent -p`.

---

## ADR Окрема обробка `bun.lock`: пропуск мержу + `bun install` лише при реальній різниці

## Context and Problem Statement
`bun.lock` — бінарно-несумісний для line-based merge файл: будь-який merge-file/mergiraf дає лише шум. Водночас запускати `bun install` завжди (навіть коли lock-файли ідентичні) — зайва операція.

## Considered Options
* Брати версію target (без `bun install`)
* Запускати `bun install` завжди при наявності `bun.lock` у дельті
* Запускати `bun install` лише коли `bun.lock` у поточній гілці реально відрізняється від worktree-версії

## Decision Outcome
Chosen option: "Запускати `bun install` лише коли lock-файли реально відрізняються", because порівняння через `cmp` між локальним (або `HEAD`) і `target`-версією lock-файлу є детермінованим і точним критерієм потреби в перегенерації.

### Consequences
* Good, because `bun install` не запускається даремно, якщо обидві гілки привели `bun.lock` до однакового стану.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Файл: `npm/getw.js`, helper `_getw_bun_lock_differs` (порівняння через `cmp -s`). Lock-файли виключені з merge-file, mergiraf та агента; `regen_bun_path` зберігає шлях для виклику `bun install` наприкінці успішного мержу. Інші lock-файли (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`) беруться з target без перегенерації.
