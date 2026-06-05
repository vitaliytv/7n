---
session: 04a7ecc6-0a82-426f-a618-34ac31f1838c
captured: 2026-06-05T10:58:47+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/04a7ecc6-0a82-426f-a618-34ac31f1838c.jsonl
---

## ADR Відображення часу створення worktree у fzf-інтерфейсі getw

## Context and Problem Statement
Користувач хоче бачити час створення кожного worktree у fzf-меню вибору (`getw`). До цього кожен пункт списку показував лише назву та опис задачі (з файлу-опису `*.md`), але не містив інформації про те, коли worktree було створено.

## Considered Options
* Читати birth time директорії worktree через `stat` (macOS-специфічний підхід)
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Читати birth time директорії через `stat`", because автор сесії обрав цей шлях: "На macOS я читатиму birth time директорії через `stat`." Реалізація вбудована у zsh-скрипт усередині `npm/getw.js` — поруч із вже наявним блоком `_getw_task_desc`.

### Consequences
* Good, because transcript фіксує очікувану користь: час створення тепер відображається в multi-line елементі fzf поруч із назвою та описом задачі, не потребуючи додаткового інструменту.
* Bad, because `stat` для отримання birth time є macOS-специфічним; на Linux birth time через `stat` може бути недоступний або мати інший формат — transcript не містить підтвердженого рішення для цього випадку.

## More Information
* Змінений файл: `npm/getw.js`
* Два `Edit`-виклики: перший додав zsh-функцію отримання часу (поруч із `_getw_task_desc`), другий оновив цикл формування елементів fzf-списку.
* Перевірка: `node -e "import('./npm/getw.js').then(...)` завершилася `import OK`.
* Суміжний ADR: `docs/adr/20260603-111512-відображення-опису-worktree-у-fzf-інтерфейсі-getw.md` — попереднє рішення про відображення опису задачі в тому самому fzf-елементі.
