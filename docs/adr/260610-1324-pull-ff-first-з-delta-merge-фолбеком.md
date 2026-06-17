# pull: fast-forward-first з delta-merge як фолбеком

**Status:** Accepted
**Date:** 2026-06-10

## Context and Problem Statement

Команда `npx @7n/n pull` (`npm/pull.js`) завжди виконувала `_n7merge_delta` — навіть у тривіальному кейсі, коли локальний HEAD є строгим предком `origin/<branch>` (класичний fast-forward). HEAD при цьому не рухався: дельта накочувалась як unstaged-зміни, а коміт залишався на розсуд користувача. Користувач очікував, що FF виконується спершу, а delta-merge — лише як фолбек.

## Considered Options

- Завжди `_n7merge_delta` (поведінка до цього ADR)
- `git stash → git merge --ff-only → git stash pop`
- `git merge --ff-only` без stash, фолбек на `_n7merge_delta` лише при невдачі

## Decision Outcome

Chosen option: "`git merge --ff-only` без stash, фолбек на `_n7merge_delta`", because `git merge --ff-only` самостійно обробляє кейси 1 і 2 (чисте дерево та локальні зміни у файлах, яких дельта не чіпає) і чесно відмовляє лише в кейсі 3 (перетин файлів) — де `stash pop` усе одно впав би з тими самими конфліктами, що `_n7merge_delta` вже вирішує багаторівнево (apply → 3-way → mergiraf → LLM-агент).

### Consequences

- Good, because у «чистих» кейсах HEAD тепер рухається вперед (справжній FF), і дерево не забруднюється непотрібними unstaged-змінами.
- Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

Змінений файл: `npm/pull.js` — додано перевірку `git merge-base --is-ancestor HEAD origin/$branch` і виклик `git merge --ff-only origin/$branch` перед `_n7merge_delta`.
Нові тести: `npm/tests/pull.test.mjs` (67 тестів, 5 test files — усі проходять).
Change-файл: `npm/.changes/260610-1322.md` (bump minor, секція Changed).
`stash + ff + pop` відхилено: лише переносить конфлікт у момент `pop`, тоді як `_n7merge_delta` вже має тришаровий фолбек для резолюції таких перетинів.
Обговорена також альтернатива «reverse-delta» (reset HEAD → origin, local-дельта як unstaged) — відкладена, не реалізована у цій сесії.
Спільне ядро `_n7merge_delta` для `getw` і `pull` знаходиться у `npm/merge.js`; реалізує zsh-функцію через `runZsh`/`MERGE_ZSH_LIB`.

## Update 2026-06-10 (ранній framing)

Початковий framing проблеми фіксував рішення як «завжди delta-merge через `_n7merge_delta`» з обгрунтуванням: алгоритм переносить лише дельту merge-base..origin як unstaged-зміни — на відміну від `git checkout`, який замінює весь зріз файлів і перетирає локальні правки. Цей підхід залишається актуальним як фолбек (кейс 3).

Архітектурні деталі, підтверджені в ранньому transcript:
- `npm/pull.js` — точка входу `n pull`; делегує логіку до `merge.js`
- `npm/merge.js` — спільне ядро `_n7merge_delta` для `getw` і `pull`; реалізує zsh-функцію через `runZsh`/`MERGE_ZSH_LIB`

## Update 2026-06-10 (проміжний transcript)

Схема FF-first, сформульована й схвалена у сесії до реалізації:
```
git fetch
if git merge-base --is-ancestor HEAD origin/<branch>:
    git merge --ff-only origin/<branch>
    if exit != 0:  # конфлікт у перетинних файлах
        _n7merge_delta HEAD origin/<branch>
else:
    _n7merge_delta HEAD origin/<branch>
```
Варіант `stash → ff → stash pop` відкинутий у тому ж transcript: переносить конфлікт у момент `pop`, не вирішуючи його.

Деталі реалізації merge-алгоритму (`merge.js`): `merge-base` на рядку 245, `git diff` на рядках 252–257, далі `git apply` → `merge-file --diff3` → mergiraf → LLM-агент.

## Update 2026-06-10

**Reverse-delta як фолбек** (рішення по FF fallback уточнено):

Первинний фолбек `_n7merge_delta "HEAD" "origin/<branch>"` (origin-дельта як unstaged, HEAD не рухається) замінено на **reverse-delta**: `git stash create` → `git reset --hard origin/<branch>` → `_n7merge_delta "origin/<branch>" "$backup_ref"`.

Причина: forward-delta давала `git status` «behind origin» навіть після успішного pull і втягувала upstream-коміти у наступний `push`. Reverse-delta: HEAD = origin після успіху, uncommitted = лише локальна робота, повторний pull ідемпотентний.

Варіант `stash → ff → stash pop` відхилено: `stash pop` при конфлікті пускає у стандартний git-merge (без mergiraf/LLM), що є downgrade резолвера.

Страховка: `BACKUP_SHA` друкується у stdout до `reset --hard`; `trap ERR/INT/TERM` авто-відкочує до `git reset --hard $BACKUP_SHA && git stash apply $BACKUP_SHA`. Лейбли конфліктів: `ours`→«Приймач (origin/<branch>)», `theirs`→«Джерело ($backup_ref)». Smoke-тест підтвердив: pull з розбіжною історією (`0e0c006`..`0a295e7`) — `pull.js` і тести змерджились через Tier 1 (git), change-файл — через Tier 3 (LLM). Тести: `npm/tests/pull.test.mjs` (новий файл, 68+ зелених). Changelog: `npm/.changes/260610-1322.md` (bump: `minor`).
