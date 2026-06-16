---
session: 53feef03-086e-4cef-9dd9-a2212f306d1c
captured: 2026-06-16T10:37:59+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/53feef03-086e-4cef-9dd9-a2212f306d1c.jsonl
---

## ADR Два режими фільтрації файлів для LLM-контексту: ignore vs stats-only

## Context and Problem Statement
При генерації commit-меседжу через LLM, git diff може містити файли різної цінності: службові логи, документацію, lockfiles, схеми. Усі вони збільшують обсяг промпта, уповільнюючи LLM, але різною мірою несуть корисну для commit-меседжу інформацію.

## Considered Options
* Єдиний список ігнорування — повне виключення небажаних файлів
* Два режими: повне ігнорування (`N7COMMIT_IGNORE_PATHS`) і заміна на рядок статистики (`N7COMMIT_STATS_ONLY_PATHS`)
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Два режими фільтрації: `N7COMMIT_IGNORE_PATHS` і `N7COMMIT_STATS_ONLY_PATHS`", because файли з `N7COMMIT_STATS_ONLY_PATHS` (наприклад, `docs/`) корисні для контексту коміту, але їх повний diff зайвий — замість нього LLM отримує рядок `stats: +N/-M lines (content replaced with stats for brevity)`.

### Consequences
* Good, because docs-файли замінюються на однорядковий summary, що суттєво скорочує розмір промпта при збереженні мінімального сигналу для LLM.
* Bad, because матчинг здійснюється через `block.path.includes(p)` (підрядок, не glob), тому паттерн `docs/` спрацьовує на будь-який сегмент шляху (`run/gt/src/actions/docs/`), що може дати несподівані ефекти для файлів з `docs` у назві не-docs-директорії.

## More Information
Реалізація: `npm/push.js`, рядки 18–20, 43–55. Фактичне значення в проєкті: `.env` репозиторію `/Users/vitalii/www/nitra/ai` містить `N7COMMIT_STATS_ONLY_PATHS=docs/` і `N7COMMIT_IGNORE_PATHS=.n-cursor/llm-trace.jsonl`. Рядок заміни: `stats: +${additions}/-${deletions} lines (content replaced with stats for brevity)`.

---

## ADR Трирівнева черга пріоритетів для заповнення бюджету LLM-diff

## Context and Problem Statement
Після фільтрації файлів (`ignore`/`stats-only`) залишки diff все одно можуть перевищувати бюджет `N7COMMIT_MAX_DIFF_BYTES` / `N7COMMIT_MAX_DIFF_LINES`. Потрібно визначити, які файли потрапляють у промпт першими при обмеженому бюджеті.

## Considered Options
* Порядок відповідно до `git diff` (як вийшло — так і є)
* Трирівнева черга: `priorityFiles` (код) → `mediumPriorityFiles` (`.json`) → `lowPriorityFiles` (`.md`, `.lock`, `.snap`, `.jsonl`, медіа)
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Трирівнева черга пріоритетів", because LLM-промпт для commit-меседжу має найбільшу цінність від змін у вихідному коді, тому код посідає бюджет першим, json-схеми — другими, а документація й бінарні формати — в останню чергу або відкидаються через `budget overflow`.

### Consequences
* Good, because при переповненні бюджету в промпт потрапляє саме код, а не документація чи lockfiles.
* Bad, because `.json`-схеми класифікуються як `mediumPriority` (`push.js:86–87`) і можуть самі вичерпати бюджет (у репозиторії `nitra/ai` вони складали ~128 KB після виключення docs і trace), унаслідок чого промпт все одно стає великим і LLM відповідає повільно. Рекомендація з transcript: додати `.json` до `N7COMMIT_STATS_ONLY_PATHS`.

## More Information
Реалізація: `npm/push.js`, рядки 66–107. Класифікація: `.md`, `.lock`, `.snap`, `.jsonl`, PNG/JPG/SVG/шрифти → `lowPriorityFiles`; `.json` → `mediumPriorityFiles`; решта → `priorityFiles`. Рекомендація з transcript: `N7COMMIT_STATS_ONLY_PATHS=docs/,.json` для зменшення промпта з ~184K до ~15–20K символів.
