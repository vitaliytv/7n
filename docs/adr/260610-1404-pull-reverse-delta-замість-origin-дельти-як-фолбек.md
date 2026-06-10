---
session: b4042850-5fb6-46be-b215-1477180bcdb6
captured: 2026-06-10T14:04:56+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/b4042850-5fb6-46be-b215-1477180bcdb6.jsonl
---

тут є NONE рішення чи продовжувати?

---

Ось два MADR-рішення, які задокументовані в цій сесії:

---

## ADR pull: reverse-delta замість origin-дельти як фолбек

## Context and Problem Statement
Команда `npx @7n/n pull` завжди виконувала `_n7merge_delta "HEAD" "origin/<branch>"` — накочувала дельту upstream як unstaged, не рухаючи HEAD. Це давало «HEAD позаду origin» до ручного коміту, ускладнювало ідемпотентність і призводило до неправильної атрибуції у наступному `push`.

## Considered Options
* Fast-forward (git merge --ff-only) як єдиний механізм
* stash → ff → stash pop
* FF fast-path + фолбек `_n7merge_delta "HEAD" "origin/<branch>"` (origin-дельта на HEAD) — була реалізована до цього рішення
* FF fast-path + фолбек reverse-delta: `git reset --hard origin/<branch>` → `_n7merge_delta "origin/<branch>" "$backup_ref"` (локальна-дельта на origin-базі)

## Decision Outcome
Chosen option: "FF fast-path + reverse-delta фолбек", because reverse-delta дає HEAD=origin після успішного pull (чиста семантика), зберігає локальну роботу як unstaged через той самий перевірений `_n7merge_delta` (без downgrade до слабкого `stash pop`), і ідеально компонується з `push` (який сквошить лише uncommitted-роботу без перетягування upstream-комітів).

### Consequences
* Good, because `git status` після pull коректно показує «up to date» + uncommitted; re-run pull ідемпотентний; `push` сквошить лише локальну роботу без підміни авторства upstream-комітів.
* Bad, because фолбек виконує `git reset --hard`, що переписує HEAD — потребує явного бекап-sha та `trap`-відкату на `INT/TERM`; ризик втрати змін якщо помилка не перехоплена.

## More Information
Файли: `npm/pull.js`, `npm/tests/pull.test.mjs`. Change-файл: `npm/.changes/260610-1357.md`. Бекап-sha друкується перед reset; `trap ERR/INT/TERM` авто-відкочує до `git stash apply $backup_ref`. Smoke-тест у тимчасовому git-репо (розбіжна історія + uncommitted) підтвердив: HEAD=origin, origin-файли закомічені, локальна робота — unstaged, Tier 1 (git apply) вирішив без LLM, повторний pull ідемпотентний.

---

## ADR merge: modify-beats-delete — детермінований резолв delete/modify конфліктів

## Context and Problem Statement
В `_n7merge_delta` (спільне ядро `getw` і `pull`) вже був обробник «видалено в src, змінено в ours → лишаємо ours» (`merge.js:288`). Але дзеркальний випадок — «ours видалив файл, src його змінив» — потрапляв у Tier 1 (git merge-file), а потім при збої — у LLM (Tier 3). Це проявилось у реальному pull: CI-реліз `0.5.0` видалив change-файл на origin, а локально він був відредагований; `pi -p` повернув `<eos>` і залишив конфліктні маркери.

## Considered Options
* Залишити на LLM (Tier 3)
* Детермінований modify-beats-delete: якщо ours видалив файл, а src його змінив — лишити версію src (перемагає той, хто змінив)
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "modify-beats-delete", because сторона, що зробила активну зміну, має вищий пріоритет над пасивним видаленням; це детерміновано, не потребує LLM, і симетрично до вже наявного правила «видалено в src, змінено в ours → ours».

### Consequences
* Good, because delete/modify конфлікти вирішуються без маркерів і без LLM (Tier 3: 0 у smoke-тесті); поведінка симетрична і передбачувана.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Файли: `npm/merge.js` (додано гілку `if ! git cat-file -e "$merge_base:$rel"` перед Tier 1), `npm/tests/merge.test.mjs` (тест `modify-beats-delete`). Change-файл: `npm/.changes/260610-1404.md`. Smoke-тест: origin видалив `.changes/260610-1322.md` (реліз), local відредагував — `modify-beats-delete` зберіг локальний вміст, маркерів нема, Tier 3 LLM не викликався.
