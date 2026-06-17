# Детермінований modify-beats-delete для delete/modify конфліктів у _n7merge_delta

**Status:** Accepted
**Date:** 2026-06-10

## Context and Problem Statement

`_n7merge_delta` (`npm/merge.js`) вже містив обробник для кейсу «видалено у `src`, але змінено в `ours` → лишаємо `ours`», але не мав симетричного правила для «видалено в `ours`, але змінено у `src`». Такий конфлікт потрапляв у Tier 1 (`git merge-file --diff3`), а потім при збої — у Tier 3 (LLM). На практиці це проявилось під час реального `pull`: CI-реліз `0.5.0` видалив `npm/.changes/260610-1322.md` на `origin/main`, а локально цей файл редагувався — LLM-агент повернув порожній результат (`<eos>`), залишивши конфліктні маркери.

## Considered Options

* LLM-резолвер (Tier 3) — поточна поведінка: файл передається в `pi → claude → cursor-agent`
* Детермінований modify-beats-delete: якщо файл видалено з одного боку, але змінено з іншого — зберегти версію що несе контентну зміну, без 3-way і без LLM
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome

Chosen option: "Детермінований modify-beats-delete", because сторона, яка несе контентну зміну, завжди інформативніша за просте видалення; детермінований `cp + continue` у Tier 1 надійніший, ніж LLM, що може повернути `<eos>`, і консистентний з вже наявною половиною тієї самої політики у `_n7merge_delta`.

### Consequences

* Good, because transcript фіксує очікувану користь: при відтворенні сценарію (origin видаляє файл, локально редагується) `Tier 3 (LLM): 0`, маркерів немає, файл збережено з контентом сторони що змінила.
* Good, because результат — unstaged-зміна під `git diff`, яку розробник може переглянути і відкинути вручну якщо видалення дійсно навмисне.
* Bad, because transcript не містить підтверджених негативних наслідків. Теоретично: якщо видалення навмисне (security-fix, removal of deprecated API), `modify-beats-delete` проігнорує його — але це загальна властивість будь-якого merge, а не специфічна регресія.

## More Information

Реалізація: `npm/merge.js`, нова гілка детекції перед 3-way блоком. Детекція: `[[ ! -f "$rel" ]] && git cat-file -e "$merge_base:$rel"` — файла нема в дереві ours (видалено), але він існував у base і є у src (змінено). Дія: `mkdir -p "$(dirname "$rel")"` → `cp "$theirs_tmp" "$rel"` → банер → `tier1++` → `continue`. `_n7merge_delta` отримав опціональні параметри `$3`/`$4` (`ours_label`/`src_label`; дефолт — `$1`/`$2`). Правило поширюється на `getw` (спільне ядро `_n7merge_delta`). Тести: `npm/tests/merge.test.mjs` — тест `delete/modify вирішує детерміновано (modify-beats-delete)`; 71 тест зелений. Change-файл: `npm/.changes/260610-1404.md` (bump: `minor`, section: `Changed`).
