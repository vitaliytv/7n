---
session: 7e30ed38-dea1-44a0-bcf9-97afe7986a1a
captured: 2026-06-03T09:56:01+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/7e30ed38-dea1-44a0-bcf9-97afe7986a1a/7e30ed38-dea1-44a0-bcf9-97afe7986a1a.jsonl
---

## ADR getw: вибіркова дельта замість сліпого git checkout

## Context and Problem Statement
Команда `getw` переносила зміни з worktree-гілки в поточну через `git checkout "$target_branch" -- .`, яка перезаписувала **усі** файли знімком worktree-гілки. Оскільки worktree відгалужено від `main` раніше, у ній лежали старі версії файлів, яких вона не чіпала — і вони затирали свіжі правки `main` без жодного попередження та можливості відновлення.

## Considered Options
* `git checkout <branch> -- .` — слі́пе перезаписування всього робочого дерева (початковий підхід)
* `git diff --binary merge_base target | git apply` — перенесення лише дельти (від спільного merge-base до target) у робоче дерево без зачіпання індексу

## Decision Outcome
Chosen option: "`git diff --binary merge_base target | git apply`", because це накладає тільки хунки, що реально змінені у worktree-гілці; файли, яких вона не торкалась, залишаються недоторканими; при конфлікті `git apply` зупиняється з помилкою замість мовчазної втрати даних.

### Consequences
* Good, because файли, змінені лише в поточній гілці, більше не перезаписуються старою версією з worktree-гілки.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Виправлення в `npm/getw.js`: замінено рядок `git checkout "$target_branch" -- .` на обчислення `merge_base=$(git merge-base ...)` і подальший `git diff --binary "$merge_base" "$target_branch" | git apply --whitespace=nowarn`. Флаг `--binary` забезпечує коректну обробку бінарних файлів. Change-файл: `bump patch`, секція `Fixed`.

---

## ADR getw: інтелектуальний мерж конфліктів через LLM-агента

## Context and Problem Statement
Після переходу на `git apply` (дельта merge-base..target) виникла вимога не падати при конфліктах, а виконувати автоматичне розв'язання засобами LLM, щоб не залишати користувача з ручним зливанням.

## Considered Options
* Падіння (`return 1`) при будь-якому конфлікті — початкова поведінка після першого виправлення
* `git apply --3way` з конфліктними маркерами + резолюція LLM-агентом
* `git apply --reject` з `.rej`-файлами + резолюція LLM-агентом (прийнятий врешті)

## Decision Outcome
Chosen option: "`git apply --reject` + LLM-агент (`claude -p`, fallback `cursor-agent -p`)", because `--3way` вимагає збігу індексних записів з preimage-блобами патча, що неможливо на брудному робочому дереві (обидві гілки незалежно правили ті самі файли — `does not match index`); `--reject` не чіпає індекс, неатомарний (один невдалий файл не блокує решту) і залишає `.rej`-файли як чіткі маркери неинтегрованих хунків для агента.

### Consequences
* Good, because transcript фіксує очікувану користь: чисті хунки лягають механічно, агент інтегрує тільки `.rej`, а worktree зберігається при неуспіху — даних не втрачається (fail-safe).
* Good, because `bun.lock` та інші tooling-файли з конфліктами більше не блокують перенесення решти файлів (неатомарність `--reject`).
* Bad, because для роботи `claude -p` потрібен дозвіл `Bash(rm:*)` (передається через `--allowedTools "Edit,Write,MultiEdit,Read,Bash(rm:*)"`); без нього `.rej` лишаться і worktree буде збережено.

## More Information
Helper-функція `_getw_resolve_with_agent` у `npm/getw.js`: пріоритет `claude -p --permission-mode acceptEdits --allowedTools "Edit,Write,MultiEdit,Read,Bash(rm:*)" --model "${GETW_MERGE_MODEL:-sonnet}"`, fallback `cursor-agent -p --force --output-format text --model "${GETW_MERGE_CURSOR_MODEL:-claude-4.6-sonnet-medium}"`. Критерій успіху — відсутність `*.rej` після виконання агента (перевіряється `_getw_list_rejects`). Lock-файли агент може залишити як є з нагадуванням виконати `bun install`. Change-файл: `bump patch`, секція `Fixed`. Синтаксис zsh перевірено через `zsh -n`.
