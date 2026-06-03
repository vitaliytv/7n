---
session: 7e30ed38-dea1-44a0-bcf9-97afe7986a1a
captured: 2026-06-03T08:57:47+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/7e30ed38-dea1-44a0-bcf9-97afe7986a1a/7e30ed38-dea1-44a0-bcf9-97afe7986a1a.jsonl
---

## ADR Заміна сліпого `git checkout -- .` на delta-перенесення через `git apply`

## Context and Problem Statement

Команда `getw` переносила зміни з git-worktree у поточну гілку за допомогою `git checkout "$target_branch" -- .`, що перезаписувало **всі** файли робочого дерева поточної гілки версіями worktree-гілки, включно з файлами, яких worktree-гілка не торкалася, але де та мала застарілі версії від моменту відгалуження. Локальні зміни в поточній гілці мовчки затирались.

## Considered Options

* `git checkout "$target_branch" -- .` — поточний підхід (сліпий перезапис усього дерева)
* `git diff --binary merge_base target | git apply` — перенесення лише дельти від merge-base

## Decision Outcome

Chosen option: "`git diff --binary merge_base target | git apply`", because це дозволяє переносити лише файли, реально змінені у worktree-гілці (від спільного merge-base), не зачіпаючи файли, яких вона не торкалась.

### Consequences

* Good, because файли, змінені лише в поточній гілці, більше не затираються.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

Змінено `npm/getw.js`: `git checkout "$target_branch" -- .` → `git diff --binary "$merge_base" "$target_branch" | git apply --whitespace=nowarn`. Додано обчислення `merge_base` через `git merge-base "$current_branch" "$target_branch"` і перевірку, що він непорожній. Патч іде через тимчасовий файл. `git reset .` після старого `checkout` також прибрано. Оновлено `npm/README.md` та JSDoc. Додано change-файл `bump patch`, секція `Fixed`.

---

## ADR Інтелектуальний мерж конфліктів через LLM-агента (`claude -p` / `cursor-agent -p`)

## Context and Problem Statement

Після переходу на `git apply` у `getw` при конфлікті команда зупинялась з помилкою та зберігала worktree для ручного доведення. Користувач хотів, щоб конфлікти розв'язувались автоматично через LLM-агента замість аварійного виходу.

## Considered Options

* Падати при конфлікті, зберігати worktree для ручного розв'язання
* `git apply --3way` з подальшим викликом LLM-агента для розв'язання конфліктних маркерів

## Decision Outcome

Chosen option: "`git apply --3way` + LLM-агент", because це дозволяє зберегти дані обох сторін у вигляді конфліктних маркерів і делегувати інтелектуальне злиття агенту без втрати змін.

### Consequences

* Good, because transcript фіксує очікувану користь: конфлікти розв'язуються без ручного втручання; worktree видаляється лише після підтвердження чистоти.
* Bad, because якщо жодного з CLI (`claude`, `cursor-agent`) немає в `PATH` або агент не прибирає всі маркери — worktree зберігається і потрібне ручне доведення.

## More Information

Алгоритм: 1) `git apply` (без `--3way`) — якщо чисто, кінець; 2) при конфлікті — `git apply --3way --whitespace=nowarn`; 3) знайти конфліктні файли через `git diff --name-only --diff-filter=U`; 4) викликати `_getw_resolve_with_agent`: спершу `claude -p ... --permission-mode acceptEdits --model "${GETW_MERGE_MODEL:-sonnet}"`, фолбек `cursor-agent -p --force --output-format text --model "${GETW_MERGE_CURSOR_MODEL:-claude-4.6-sonnet-medium}"`; 5) перевірити відсутність маркерів `<<<<<<<` / `>>>>>>>`; 6) `git reset` → worktree видаляється. Конфігурація моделей — через змінні середовища `GETW_MERGE_MODEL` та `GETW_MERGE_CURSOR_MODEL`. Додано change-файл `bump minor`, секція `Added`. Синтаксис zsh перевірено через `zsh -n`.
