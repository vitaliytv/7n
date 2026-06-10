---
session: b4042850-5fb6-46be-b215-1477180bcdb6
captured: 2026-06-10T13:24:54+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/b4042850-5fb6-46be-b215-1477180bcdb6.jsonl
---

## ADR pull використовує delta-merge замість fast-forward merge

## Context and Problem Statement

Команда `npx @7n/n pull` (`npm/pull.js`) завжди виконувала `_n7merge_delta` — навіть у тривіальному кейсі, коли локальний HEAD є строгим предком `origin/<branch>` (класичний fast-forward). HEAD при цьому не рухався ніколи: дельта накочувалась як unstaged-зміни, а коміт залишався на розсуд користувача. Користувач очікував, що FF виконується спершу, а дельта-мердж — лише як фолбек.

## Considered Options

* Завжди `_n7merge_delta` (поточна поведінка до цього ADR)
* `git stash → git merge --ff-only → git stash pop` як FF-крок
* `git merge --ff-only` без stash, фолбек на `_n7merge_delta` лише при невдачі

## Decision Outcome

Chosen option: "`git merge --ff-only` без stash, фолбек на `_n7merge_delta`", because `git merge --ff-only` самостійно обробляє кейси 1 і 2 (чисте дерево та локальні зміни у файлах, яких дельта не чіпає) і чесно відмовляє лише в кейсі 3 (перетин файлів) — де `stash pop` усе одно впав би з тими самими конфліктами, що й `_n7merge_delta` вже вирішує багаторівнево (apply → 3-way → mergiraf → LLM-агент).

### Consequences

* Good, because transcript фіксує очікувану користь: у «чистих» кейсах HEAD тепер рухається вперед (справжній FF), і дерево не забруднюється непотрібними unstaged-змінами.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

Змінений файл: `npm/pull.js` — додано перевірку `git merge-base --is-ancestor HEAD origin/$branch` і виклик `git merge --ff-only origin/$branch` перед `_n7merge_delta`.
Нові тести: `npm/tests/pull.test.mjs` (67 тестів, 5 test files — усі проходять).
Change-файл: `npm/.changes/260610-1322.md` (bump minor, секція Changed).
Stash як окремий крок відхилено: `stash + ff + pop` лише переносить конфлікт у момент `pop`, не вирішуючи його — а `_n7merge_delta` вже має тришаровий фолбек для резолюції таких перетинів.
