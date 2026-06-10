---
session: b4042850-5fb6-46be-b215-1477180bcdb6
captured: 2026-06-10T13:18:05+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/b4042850-5fb6-46be-b215-1477180bcdb6.jsonl
---

## ADR `n pull` використовує delta-merge замість fast-forward merge

## Context and Problem Statement
Команда `npx @7n/n pull` реалізована через `_n7merge_delta` (`npm/merge.js`): вона завжди обчислює дельту `merge-base(HEAD, origin/<branch>)..origin/<branch>` і накладає її як unstaged-зміни через `git apply` → `git merge-file --diff3` → mergiraf → LLM-агент. HEAD ніколи не рухається. Користувач очікував, що у тривіальному випадку (HEAD — прямий предок `origin/<branch>`) відбудеться класичний fast-forward, а delta-мердж — лише тоді, коли FF неможливий.

## Considered Options
* Завжди delta-merge (поточна реалізація `npm/pull.js`)
* Fast-forward-first: спробувати `git merge --ff-only`, при невдачі — фолбек на `_n7merge_delta`
* `git stash → git merge --ff-only → git stash pop`

## Decision Outcome
Chosen option: "Завжди delta-merge", because поточна реалізація свідомо не рухає HEAD, щоб не перезаписувати незакомічені локальні правки tracked-файлів; дельта накладається як unstaged, а людина вирішує, що й коли комітити.

Під час сесії обговорена й схвалена як кращий майбутній варіант схема **fast-forward-first**:
```
git fetch
if git merge-base --is-ancestor HEAD origin/<branch>:
git merge --ff-only origin/<branch>
if exit != 0:                          # конфлікт у перетинних файлах
_n7merge_delta HEAD origin/<branch>
else:
_n7merge_delta HEAD origin/<branch>
```
Варіант `stash → ff → stash pop` відкинутий: він переносить конфлікт у момент `pop`, не вирішуючи його, тоді як `_n7merge_delta` уже вміє резолвити перетин багаторівнево.

### Consequences
* Good, because поточний алгоритм ніколи не затирає незакомічені локальні зміни — HEAD залишається на місці, а дельта лягає як unstaged для контрольованого коміту.
* Bad, because у тривіальному кейсі (чисте дерево, HEAD — предок origin) відбувається delta-apply замість простого FF, що є зайвою операцією; transcript фіксує очікування користувача, що FF має відбуватися першим.

## More Information
- `npm/pull.js` — точка входу команди `n pull`; `git fetch` на рядку 30, виклик `_n7merge_delta` на рядку 42, коментар «переглянь і закоміть» на рядку 47
- `npm/merge.js` — реалізація `_n7merge_delta`: `merge-base` на рядку 245, `git diff` на рядках 252–257, далі тири `git apply` → `merge-file --diff3` → mergiraf → LLM-агент
- Запропонована FF-first схема ще не реалізована в коді (кінець transcript — запит підтвердження від користувача)
