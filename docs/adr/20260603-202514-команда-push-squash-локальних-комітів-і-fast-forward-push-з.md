---
session: d261d410-e912-4f06-8fd5-2770efae874a
captured: 2026-06-03T20:25:14+03:00
transcript: /Users/vitaliytv/.claude/projects/-Users-vitaliytv-www-vitaliytv-7n/d261d410-e912-4f06-8fd5-2770efae874a.jsonl
---

## ADR Команда `push`: squash локальних комітів і fast-forward push з авто-getpull

## Context and Problem Statement
У репозиторії `@7n/n` вже існують команди `getw` і `getpull` для переносу дельти між гілками. Не вистачало симетричної команди, яка колапсувала б усі локальні (ще не запушені) коміти + зміни робочого дерева в один підготовлений коміт і відправляла його на `origin/<branch>`.

## Considered Options
* `getpush` (за аналогією з `getw`/`getpull`)
* `pushup`
* `cmpush`
* `push`

## Decision Outcome
Chosen option: "`push`", because користувач явно обрав цю назву серед запропонованих варіантів.

### Consequences
* Good, because transcript фіксує очікувану користь: команда симетрична до `getpull` і лаконічна в CLI (`n-7 push`).
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Алгоритм у `npm/push.js`: `git fetch` → якщо `origin/<branch>` має нові коміти — автоматично запустити `_n7merge_delta` (ядро `getpull`) замість STOP → `git add -A` (включно untracked) → `git reset --soft origin/<branch>` (squash) → LLM-агент → `git commit --no-verify -F msgfile` → `git push` (fast-forward; нова гілка — `git push -u`).
- Зареєстровано у `npm/index.js` (гілка `push` у `run()`, рядок у `HELP`), `npm/types/index.d.ts`, `npm/package.json` (`files`).
- Тести: `npm/tests/push.test.mjs` + делегування в `npm/tests/index.test.mjs`; всього 45/45.

---

## ADR LLM-генерація multi-line коміт-меседжу українською в стилі Gitmoji + Monorepo

## Context and Problem Statement
Команда `push` мала б формувати інформативний коміт-меседж без ручного введення. Потрібно було визначити формат (subject-only чи multi-line), мову та модель LLM.

## Considered Options
* Subject-рядок (одна стрічка)
* Multi-line меседж (subject + body)

## Decision Outcome
Chosen option: "Multi-line меседж (subject + body)", because користувач явно вказав «Multi-line» у відповідях на питання планування.

### Consequences
* Good, because transcript фіксує очікувану користь: меседж несе і заголовок, і деталі; агент отримує повний diff і `--name-status` для формування scope у дусі Gitmoji + Monorepo (`<emoji> <type>(<scope>): <опис>`).
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- LLM викликається через `claude -p` з фолбеком на `cursor-agent -p`, за патерном `MERGE_ZSH_LIB` у `npm/merge.js`.
- Модель: `N7COMMIT_MODEL` → `N7MERGE_MODEL` → `GETW_MERGE_MODEL` → `sonnet`.
- Промпт містить: `--name-status` усіх файлів + відфільтрований `--cached` diff → результат у tempfile → `git commit --no-verify -F msgfile`.
- Без інтерактивного підтвердження: у `stdout` друкується subject і `--name-status`.

---

## ADR Фільтрація шумного вмісту файлів із LLM-контексту (але не з коміту)

## Context and Problem Statement
При генерації коміт-меседжу повний `git diff --cached` містить великий ADR-наратив, CHANGELOG-рядки, lock-файли, генеровані типи й артефакти збірки, які не несуть інформації про суть змін і ускладнюють визначення scope агентом.

## Considered Options
* Виключити шумні файли повністю з коміту
* Показати лише перелік файлів (`--name-status`), без будь-якого diff
* Передавати повний перелік файлів (`--name-status`) + diff **без вмісту** шумних шляхів (git pathspec `:(exclude)`)

## Decision Outcome
Chosen option: "Передавати повний перелік файлів + diff без вмісту шумних шляхів", because користувач сформулював вимогу «ігнорувати зміст ADR-файлів та інших», а в реалізації перевірено: `--name-status` містить усі 10 ADR-файлів (scope видимий), але заголовків `diff --git … docs/adr/` у відфільтрованому виводі — 0.

### Consequences
* Good, because transcript фіксує очікувану користь: агент бачить повний scope (назви файлів), але другорядний контент не заглушує суть змін.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Реалізовано в `npm/push.js` (блок формування `$ctx`): `git diff --cached -- . :(exclude)docs/adr/** :(exclude)**/CHANGELOG.md :(exclude)**/.changes/** :(exclude)*.lock :(exclude)**/package-lock.json :(exclude)**/pnpm-lock.yaml :(exclude)**/yarn.lock :(exclude)**/*.d.ts :(exclude)**/*.snap :(exclude)**/__snapshots__/** :(exclude)**/*.min.js :(exclude)**/*.map :(exclude)dist/** :(exclude)build/** :(exclude)coverage/**`.
- Env-конфігурація: `N7COMMIT_NO_DEFAULT_EXCLUDE=1` (вимикає дефолти), `N7COMMIT_EXCLUDE="glob1 glob2"` (додає свої pathspec), `N7COMMIT_MAX_DIFF_LINES=1500` (обрізання контексту).
- Тести інваріантів у `npm/tests/push.test.mjs`: наявність `:(exclude)docs/adr/**`, `:(exclude)**/CHANGELOG.md`, підтримка `$N7COMMIT_EXCLUDE`, `$N7COMMIT_NO_DEFAULT_EXCLUDE`, `$N7COMMIT_MAX_DIFF_LINES`.
- `zsh -n` синтаксис валідний після змін.
