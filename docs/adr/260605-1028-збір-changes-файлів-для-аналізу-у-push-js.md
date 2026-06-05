---
session: 55f28a5f-f103-4498-b4de-70910a6d8488
captured: 2026-06-05T10:28:37+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/55f28a5f-f103-4498-b4de-70910a6d8488.jsonl
---

## ADR Збір `.changes/`-файлів для аналізу у `push.js`

## Context and Problem Statement
У `npm/push.js` при формуванні commit-меседжу джерелом є `.changes/`-файли. Постало питання: чи охоплює поточна реалізація лише застейджену дельту, чи й раніше закомічені локальні `.changes/`-файли та незастейджені зміни з робочого дерева.

## Considered Options
* Читати `.changes/` лише з поточної застейдженої дельти (`git diff --cached` до `git add -A`)
* Охоплювати всі джерела одночасно: локальні коміти між `origin/<branch>..HEAD`, застейджені та незастейджені зміни — через `git reset --soft "$base"` + `git add -A` перед `git diff --cached`

## Decision Outcome
Chosen option: "Охоплювати всі джерела через `git reset --soft "$base"` + `git add -A`", because після виклику `git reset --soft "$base"` всі локальні коміти `origin/<branch>..HEAD` розкладаються в індекс, після чого `git add -A` додає також незастейджені та неtracked файли — тому `git diff --cached --name-only | grep -F '.changes/'` фіксує **всі** `.changes/`-файли незалежно від того, де вони були: у попередніх локальних комітах, у staging чи в робочому дереві.

### Consequences
* Good, because transcript фіксує очікувану користь: експеримент у тимчасовому репо підтвердив, що і `001-committed.md` (з локального коміту), і `002-unstaged.md` (незастейджений) опиняються в `git diff --cached` після `reset --soft` + `git add -A`.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Файл реалізації: `npm/push.js` (функція `push`, рядки ~157–234)
- Послідовність git-операцій: `git reset --soft "$base"` → `git add -A` → `git diff --cached --name-only | grep -F '.changes/'`
- Тести: `npm/tests/push.test.mjs` перевіряє наявність `git reset --soft "$base"` та `git add -A` у згенерованому zsh-скрипті
