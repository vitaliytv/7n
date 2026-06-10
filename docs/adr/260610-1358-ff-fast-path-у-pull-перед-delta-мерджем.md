---
session: b4042850-5fb6-46be-b215-1477180bcdb6
captured: 2026-06-10T13:58:53+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/b4042850-5fb6-46be-b215-1477180bcdb6.jsonl
---

## ADR FF fast-path у `pull` перед delta-мерджем

## Context and Problem Statement
`npx @7n/n pull` завжди виконував `_n7merge_delta "HEAD" "origin/<branch>"` — навіть коли HEAD є строгим предком `origin/<branch>` і локальні зміни не перетинаються з апдейтом (класичний fast-forward). HEAD при цьому ніколи не рухався, а upstream-дельта лягала як uncommitted, лишаючи `git status` у стані «behind origin by N».

## Considered Options
* Залишити delta-only (поточна поведінка до змін)
* Спершу `git merge --ff-only`; лише на non-zero фолбек на `_n7merge_delta`

## Decision Outcome
Chosen option: "Спершу `git merge --ff-only`; лише на non-zero фолбек на `_n7merge_delta`", because git самостійно обробляє кейс «чисте дерево» та «локальні зміни, що не перетинаються» (зберігає їх) і повертає non-zero лише коли є реальний перетин — тобто стеш як окремий крок зайвий, а `git merge --ff-only` дешевший за delta-apply в trivial-кейсі.

### Consequences
* Good, because transcript фіксує очікувану користь: в FF-кейсі HEAD рухається до `origin/<branch>` — `git status` чесно показує «up to date».
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Реалізація у `npm/pull.js`: `git merge-base --is-ancestor HEAD origin/$branch` → `git merge --ff-only origin/$branch`; shortcut «Вже актуально» (`HEAD == origin/<branch>`). Тести: `npm/tests/pull.test.mjs`. Changelog: `npm/.changes/260610-1357.md` (bump `minor`).

---

## ADR Reverse-delta як фолбек замість stash+FF+stash-pop

## Context and Problem Statement
Коли `git merge --ff-only` неможливий (розбіжна історія або перетин локальних змін із upstream), постало питання: як отримати фінальний стан «HEAD = origin, моя робота як uncommitted» — через `stash → ff → stash pop` чи через reverse-delta (`reset --hard origin` + `_n7merge_delta` з оберненими ролями)?

## Considered Options
* `git stash -u` → `git merge --ff-only` → `git stash pop`
* Reverse-delta: `git stash create` (бекап) → `git reset --hard origin/<branch>` → `_n7merge_delta "origin/<branch>" "$backup_ref"`

## Decision Outcome
Chosen option: "Reverse-delta", because `stash pop` при конфлікті використовує звичайний `git merge` (лишає маркери, без mergiraf/LLM), тоді як reverse-delta зберігає повний багаторівневий резолвер (apply → 3-way → mergiraf → LLM-агент); крім того `stash pop` не швидший за delta-apply, а re-run pull після reverse-delta ідемпотентний (HEAD вже = origin → shortcut «Вже актуально»), тоді як після stash-схеми повторний pull змазаний.

### Consequences
* Good, because transcript фіксує очікувану користь: HEAD = реальні SHA/автори upstream; `git push` (який сквошить uncommitted) не захоплює чужі коміти у власний сквош; `git status` після успіху показує «up to date» + uncommitted локальна робота; повторний `pull` ідемпотентний.
* Bad, because `reset --hard` переписує HEAD — transcript закриває це страховкою: `git stash create` зберігається **до** reset, sha бекапу друкується в stdout, `trap ERR/INT/TERM` авторевертує `git reset --hard $backup_ref && git stash apply $stash_ref`.

## More Information
Реалізація у `npm/pull.js`: zsh-блок `# ↩️ FF неможливий — reverse-delta`. Конфліктні лейбли перейменовано: `ours`→«Приймач (поточна origin/<branch>)», `theirs`→«Джерело ($backup_ref)». Інтеграційний smoke-тест підтвердив: origin-файл `c.txt` закомічений, unstaged = лише локальна робота, re-run → «Вже актуально». Реальний pull на робочому репо (розбіжна історія `0e0c006`..`0a295e7`) підтвердив кейс delete/modify: `pull.js` і тести змерджились через Tier 1 (git), change-файл — через Tier 3 (LLM).
