---
session: 7e30ed38-dea1-44a0-bcf9-97afe7986a1a
captured: 2026-06-03T10:54:06+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/7e30ed38-dea1-44a0-bcf9-97afe7986a1a/7e30ed38-dea1-44a0-bcf9-97afe7986a1a.jsonl
---

## ADR Заміна `git checkout -- .` на перенесення лише дельти через `git apply`

## Context and Problem Statement
Команда `getw` переносила зміни з worktree-гілки до поточної гілки за допомогою `git checkout "$target_branch" -- .`, що сліпо перезаписувало **всі** файли поточної гілки вмістом worktree. Файли, змінені лише у поточній гілці після точки розгалуження, затиралися старою версією з worktree — без виявлення конфліктів і без попередження.

## Considered Options
* `git checkout <branch> -- .` (поточний підхід — сліпе перезаписування)
* `git diff merge-base..target | git apply` — перенесення лише дельти worktree-гілки від спільного предка

## Decision Outcome
Chosen option: "`git diff merge-base..target | git apply`", because `git checkout -- .` не розрізняє файли, що змінювала worktree-гілка, від файлів, що не змінювала, — і затирає поточну гілку в обох випадках; перенесення дельти через `git apply` без `--index` накладає лише те, що реально змінив worktree, і не чіпає файли поза патчем.

### Consequences
* Good, because файли, змінені лише у поточній гілці, більше не затираються.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Файл: `npm/getw.js`. Команда: `git merge-base "$current_branch" "$target_branch"` → `git diff --binary "$merge_base" "$target_branch" | git apply --whitespace=nowarn`. Перший підхід у transcript — до переходу на пофайловий `git merge-file`.

---

## ADR Пофайловий 3-way merge через `git merge-file --diff3` замість `git apply --3way`

## Context and Problem Statement
При конфлікті перший варіант виправлення намагався застосувати `git apply --3way`, але він завершувався помилкою `does not match index` — бо обидві гілки (`main` і `main-lint`) незалежно змінювали ті самі tooling-файли, тож індексні записи `main` не збігалися з preimage-блобами патча. Крім того, `git apply` атомарний: один невдалий файл (`bun.lock`) блокував накладання решти.

## Considered Options
* `git apply --3way` (перша спроба)
* `git apply --reject` (друга спроба — неатомарний, але агент мав видаляти `.rej`)
* Пофайловий `git merge-file --diff3` — скрипт сам ставить маркери, вердикт — завжди за скриптом

## Decision Outcome
Chosen option: "Пофайловий `git merge-file --diff3`", because він працює лише по файлах без звернення до git-індексу, тому помилка `does not match index` усунена в принципі; `--diff3` залишає base-секцію `|||||||`, яку потребує `mergiraf`; підхід неатомарний — кожен файл обробляється окремо.

### Consequences
* Good, because transcript фіксує очікувану користь: виключено клас помилок `does not match index`; кожен файл обробляється незалежно.
* Bad, because `git merge-file` може позначати конфліктом сусідні (не лише перетинні) зміни — такі «хибні» конфлікти йдуть до mergiraf/агента, хоч могли б лягти чисто.

## More Information
Файл: `npm/getw.js`. Команда: `git merge-file -p -L "поточна ($current_branch)" -L "база" -L "worktree ($target_branch)" "$ours_tmp" "$base_tmp" "$theirs_tmp" > "$ours_tmp.merged"`. Функціональний тест усіх кейсів (only-ours, only-theirs, no-overlap, conflict, add, delete, binary) — у `/tmp/getw_func/run.sh`.

---

## ADR Скрипт виносить вердикт, агент лише прибирає маркери

## Context and Problem Statement
В одній з проміжних версій агенту (LLM) було делеговано видалення `.rej`-файлів як сигнал завершення мержу. Це крихко: залежить від дозволу агента на `rm`, агент може пропустити файл, а скрипт не має надійного способу відрізнити «агент не впорався» від «дозволу на rm не було».

## Considered Options
* Агент видаляє `.rej` — скрипт довіряє факту виклику агента
* Скрипт сам перевіряє маркери — агент лише редагує файли, не видаляє нічого

## Decision Outcome
Chosen option: "Скрипт сам перевіряє маркери", because вердикт про успіх не можна віддавати агенту — скрипт єдиний детермінований компонент у пайплайні; helper `_getw_files_with_markers` після агента грепає `<<<<<<<`/`>>>>>>>` і виносить остаточний вердикт незалежно від поведінки агента.

### Consequences
* Good, because transcript фіксує очікувану користь: усунено клас хибних успіхів, коли агент не видаляв `.rej`; дозволи агента звужено до `Edit,Write,MultiEdit,Read`.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Файл: `npm/getw.js`. Helper: `_getw_files_with_markers`. Перевірка після агента: `local leftover=$(_getw_files_with_markers "$conflict_files")`. Якщо маркери лишилися — worktree зберігається, `return 1`.

---

## ADR Багаторівневий резолв конфліктів: git merge-file → mergiraf → LLM-агент

## Context and Problem Statement
Після переходу на `git merge-file --diff3` деякі конфлікти, які line-based diff3 позначає помилково (зміни у різних частинах синтаксичного дерева), все одно потрапляли до LLM-агента — хоч їх міг би розв'язати дешевший детермінований інструмент.

## Considered Options
* Лише `git merge-file` → LLM-агент
* Багаторівневий пайплайн: `git apply` (Tier 0) → `git merge-file --diff3` (Tier 1) → `mergiraf solve` (Tier 2, AST) → LLM-агент (Tier 3)

## Decision Outcome
Chosen option: "Багаторівневий пайплайн з `mergiraf` як Tier 2", because дешеві детерміновані резолвери (mergiraf — Rust/tree-sitter, підтримує 25+ мов) мають йти перед дорогим LLM-агентом; агент отримує лише справжній залишок маркерів. `mergiraf` вмикається автоматично якщо є в `PATH` (або встановлюється через `brew install mergiraf`, фолбек `cargo install --locked mergiraf`); вимикається `GETW_NO_MERGIRAF=1`.

### Consequences
* Good, because transcript фіксує очікувану користь: знижується навантаження на LLM-агент; mergiraf вирішує «хибні» diff3-конфлікти детерміновано.
* Bad, because `--diff3`-маркери (з base-секцією `|||||||`) потрібні mergiraf; якщо mergiraf недоступний і brew/cargo відсутні — Tier 2 пропускається з попередженням, без падіння.

## More Information
Файл: `npm/getw.js`. Helpers: `_getw_ensure_mergiraf`, `_getw_mergiraf_solve`. Команда встановлення: `brew install mergiraf` (homebrew-core, v0.17.0). Env-змінні моделі агента: `GETW_MERGE_MODEL` (claude), `GETW_MERGE_CURSOR_MODEL` (cursor-agent).

---

## ADR Особлива обробка `bun.lock`: відкладення мержу та `bun install` лише при розбіжності

## Context and Problem Statement
`bun.lock` — бінарно-схожий lock-файл, пофайловий merge якого дає лише шум. Крім того, після мержу `package.json` lock може стати неактуальним. Потрібно визначити: коли і чи взагалі запускати `bun install`.

## Considered Options
* Включати `bun.lock` у звичайний merge-file пайплайн
* Брати версію з target-гілки завжди
* Лишати локальну версію і запускати `bun install` завжди, коли lock є в дельті
* Лишати локальну версію і запускати `bun install` лише коли lock у поточній гілці реально відрізняється від lock у worktree

## Decision Outcome
Chosen option: "Лишати локальну версію, `bun install` лише при реальній розбіжності", because пофайловий merge lock-файлу дає шум; `bun install` зайвий, якщо lock-и однакові — він уповільнює операцію без користі. Порівняння — через `cmp` між ours (робоче дерево або HEAD) і theirs (target-гілка). `bun.lock` знаходиться лише в корені репо (`rel = "bun.lock"`).

### Consequences
* Good, because transcript фіксує очікувану користь: уникнення зайвих `bun install`; детерміноване поводження з lock-файлом.
* Bad, because якщо `package.json` змінено, але `bun.lock` в обох гілках однаковий (теоретично можливо), `bun install` не запуститься — lock залишиться потенційно неактуальним.

## More Information
Файл: `npm/getw.js`. Helper: `_getw_bun_lock_differs`. Умова: `[[ "$rel" = "bun.lock" ]]` (точний шлях, не `basename`). Порівняння: `cmp -s "$ours_tmp" "$theirs_tmp"`. Перегенерація: `bun install` у корені робочого дерева після успішного завершення всіх tier'ів.
