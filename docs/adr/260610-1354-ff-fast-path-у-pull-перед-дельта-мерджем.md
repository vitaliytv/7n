---
session: b4042850-5fb6-46be-b215-1477180bcdb6
captured: 2026-06-10T13:54:17+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/b4042850-5fb6-46be-b215-1477180bcdb6.jsonl
---

## ADR FF fast-path у `pull` перед дельта-мерджем

## Context and Problem Statement
`npx @7n/n pull` завжди виконував `_n7merge_delta "HEAD" "origin/<branch>"` — навіть коли HEAD був строгим предком `origin/<branch>` і жодних локальних правок не було. HEAD ніколи не рухався, upstream-дельта лягала як uncommitted, а `git status` показував «behind origin» навіть після успішного pull.

## Considered Options
* Залишити лише `_n7merge_delta` без FF (поточна поведінка)
* Додати FF fast-path (`git merge --ff-only`) і падати на дельта-мердж лише коли FF неможливий

## Decision Outcome
Chosen option: "Додати FF fast-path", because при FF-абельній ситуації справжній `git merge --ff-only` коректніше рухає HEAD і зберігає авторство upstream-комітів; `_n7merge_delta` залишається фолбеком лише коли `git merge --ff-only` повертає non-zero.

### Consequences
* Good, because transcript фіксує очікувану користь: git сам обробляє кейси «чисте дерево» та «локальні правки у файлах, яких дельта не чіпає» без додаткового stash; fолбек відбувається лише у кейсі реального перетину.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Реалізація: `npm/pull.js`. Порядок: 1) `git fetch origin <branch>`; 2) shortcut «Вже актуально» якщо `HEAD == origin/<branch>`; 3) `git merge --base --is-ancestor HEAD origin/<branch>` → `git merge --ff-only`; 4) фолбек на `_n7merge_delta` при non-zero exit. Тести: `npm/tests/pull.test.mjs` (новий файл). Changelog: `npm/.changes/260610-1322.md`.

---

## ADR Reverse-delta як фолбек `pull` замість forward-delta

## Context and Problem Statement
Коли `git merge --ff-only` неможливий (розбіжна історія або перетин uncommitted), потрібен механізм злиття. Оригінальний підхід (`_n7merge_delta "HEAD" "origin/<branch>"`) кладе upstream-дельту як unstaged, не рухаючи HEAD — що означає «behind origin» після pull, переавторування чужих комітів у наступному `push` і незручну семантику для `git status`.

## Considered Options
* Залишити forward-delta: `_n7merge_delta "HEAD" "origin/<branch>"` (HEAD не рухається, upstream-дельта unstaged)
* `stash → git merge --ff-only → stash pop` (обговорювалось і відкинуто)
* Reverse-delta: `git stash create` + `git reset --hard origin/<branch>` + `_n7merge_delta "origin/<branch>" "$backup_ref"` (HEAD = origin, локальна робота unstaged)

## Decision Outcome
Chosen option: "Reverse-delta", because семантика `HEAD = origin` є коректнішою (`git status` — «up to date»), pull стає ідемпотентним, `push` сквошить лише локальну роботу на origin-базі без переавторування чужих комітів; резолвер конфліктів (apply → 3-way → mergiraf → LLM) використовується той самий, лише ролі `ours`/`src` обернені.

Варіант `stash → ff → stash pop` відкинуто явно в transcript: він переносить конфлікт у `stash pop` (звичайний git-merge без mergiraf/LLM) і є даунгрейдом резолву.

### Consequences
* Good, because transcript фіксує очікувану користь: `HEAD = origin/master` після pull; origin-файли закомічені, а не в unstaged; unstaged-діфф = лише локальна робота; повторний pull ідемпотентний (smoke-тест на реальному git-репо підтвердив усі три пункти).
* Bad, because `git reset --hard` переписує HEAD — втрачається інваріант «HEAD не рухається ніколи». Transcript закриває це через: збереження `backup_ref` (`git stash create`) до reset, вивід sha + команди відкату, `trap` на `INT/TERM` для авто-відкату.

## More Information
Реалізація: `npm/pull.js` (zsh-скрипт у JS template literal). Команди у фолбеку: `git stash create`, `git reset --hard "origin/$branch"`, `_n7merge_delta "origin/$branch" "$backup_ref"`. Smoke-тест запускався у `mktemp -d` репо з `GIT_AUTHOR_NAME=t`. Валідація синтаксису: `zsh -n /tmp/pull_check.zsh` → `✅ zsh syntax OK`. Тести: `npm/tests/pull.test.mjs`, 68 passed. Changelog: `npm/.changes/260610-1322.md` (bump: `minor`, section: `Changed`).
