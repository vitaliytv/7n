# Відображення опису worktree у fzf-інтерфейсі getw

**Status:** Accepted
**Date:** 2026-06-03

## Context and Problem Statement

Команда `getw` (реалізована у `npm/getw.js` як вбудований `ZSH_SCRIPT`) запускає `fzf` для вибору git-worktree з `.worktrees/`. Поруч з кожною директорією worktree може існувати файл `<name>.md` з рядком `**Задача:**`, що описує мету worktree. Потрібно було зробити цей опис видимим під час вибору без захаращення самого списку імен директорій.

## Considered Options

* Багаторядкові елементи fzf (`--read0 --gap`): назва директорії + рядок `Задача:` безпосередньо в самому списку
* Назви директорій у списку + опис у `--preview`-панелі

## Decision Outcome

Chosen option: "Назви директорій у списку + опис у `--preview`-панелі", because перший варіант (багаторядкові елементи) змушував preview розширюватись і показував одночасно й список, й контент — user explicit.

### Consequences

* Good, because список залишається компактним (лише назви директорій), а опис доступний без шуму в основному полі вибору.
* Good, because `--preview-window=bottom:30%:wrap` фіксує висоту preview у 30% — панель не займає пів-екрана.
* Bad, because preview-скрипт виконується у підоболонці fzf і не має доступу до `_getw_task_desc()`, тому парсинг `**Задача:**` дублюється inline через `grep + cut`.

## More Information

- Файл: `npm/getw.js`, константа `ZSH_SCRIPT`
- Preview-команда: `root=$(git rev-parse --show-toplevel 2>/dev/null); md="$root/.worktrees/{1}.md"; printf "%s\n\n" "{1}"; if [ -f "$md" ]; then grep "Задача" "$md" | cut -d" " -f2-; else echo "опис відсутній"; fi`
- Формат файлу-опису: `.worktrees/<name>.md` з рядком `**Задача:** <текст>`
- `{1}` — fzf-плейсхолдер для назви обраної директорії worktree
- Логіка вилучення результату спрощена до `wt_name="${selected}"` (однорядковий елемент, стрипінг newline не потрібен)
- Додаткової інформації в transcript не зафіксовано.
