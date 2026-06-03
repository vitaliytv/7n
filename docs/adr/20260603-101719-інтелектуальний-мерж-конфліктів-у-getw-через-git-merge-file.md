---
session: 7e30ed38-dea1-44a0-bcf9-97afe7986a1a
captured: 2026-06-03T10:17:19+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/7e30ed38-dea1-44a0-bcf9-97afe7986a1a/7e30ed38-dea1-44a0-bcf9-97afe7986a1a.jsonl
---

## ADR Інтелектуальний мерж конфліктів у `getw` через `git merge-file` + LLM-агент

## Context and Problem Statement

Команда `getw` (у `npm/getw.js`) переносила зміни з git-worktree у поточну гілку через `git checkout <branch> -- .`, що сліпо перезаписувало всі файли версіями з worktree-гілки, знищуючи незалежні зміни поточної гілки. Після переходу на `git apply` виникала нова проблема: при двосторонніх конфліктах (обидві гілки правили одні й ті самі tooling-файли) `git apply --3way` падав із `does not match index`, а `git apply --reject` потребував, щоб агент видаляв `.rej`-файли — що робило вердикт про успіх залежним від дозволів та поведінки агента.

## Considered Options

* `git apply --3way` — падає з `does not match index` на dirty робочому дереві
* `git apply --reject` + агент видаляє `.rej` — крихко: вердикт залежить від `rm`-дозволів агента
* Пофайловий `git merge-file` (3-way по файлах) + агент прибирає лише маркери

## Decision Outcome

Chosen option: "Пофайловий `git merge-file` + агент прибирає маркери", because скрипт повинен детерміновано володіти логікою вердикту (маркери є / нема), а агент — виконувати лише творчу роботу (усунення маркерів); `git merge-file` працює виключно по файлах без індексу, що усуває `does not match index` в принципі.

### Consequences

* Good, because скрипт сам ставить маркери (`git merge-file -p`) і сам перевіряє їх відсутність (`_getw_files_with_markers`) — вердикт не залежить від дозволів чи поведінки агента.
* Good, because `git merge-file` коректно обробляє всі кейси: тільки-theirs, тільки-ours (зберігає), обидва без перетину (чистий мерж), конфлікт (маркери), додавання, видалення, бінарні файли (exit 255 → взяти версію target + попередження).
* Good, because агент потребує лише `Edit,Write,MultiEdit,Read` — жодного `Bash(rm:*)`.
* Bad, because `git merge-file` маркує конфлікт навіть для сусідніх (не лише перетинних) змін — це стандартна поведінка diff3, яку агент має розв'язувати.
* Bad, because `git merge-file` не інтегрований у git index, тому після успішного мержу скрипт виконує `git reset` щоб усе лишалось unstaged (додатковий крок).

## More Information

* Змінені файли: `npm/getw.js`, `npm/README.md`
* Ключові функції: `_getw_resolve_with_agent`, `_getw_files_with_markers` у `ZSH_SCRIPT`
* Команди з transcript: `git merge-file -p -L ... ours base theirs > merged`, `git diff --no-renames --name-only "$merge_base" "$target_branch"`, `git cat-file -e "$target_branch:$rel"`
* Env-змінні для вибору моделі: `GETW_MERGE_MODEL` (для `claude -p`), `GETW_MERGE_CURSOR_MODEL` (для `cursor-agent -p`)
* Фолбек CLI: `claude -p --permission-mode acceptEdits` → `cursor-agent -p --force`
* Функціональний тест: усі 8 кейсів пройшли у `/tmp/getw_func/repo` (тимчасове репо)
* Change-файли додано в `npm/.changes/` з bump `minor` (Added) та `patch` (Fixed, Changed)
