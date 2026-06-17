---
session: 10799558-6237-4779-978f-51c2d521f437
captured: 2026-06-16T16:41:10+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/10799558-6237-4779-978f-51c2d521f437.jsonl
---

## ADR Передача LLM-промпта через stdin замість argv

## Context and Problem Statement
У `_n7push_gen_message` (файл `npm/push.js`) prompt (~3.7 MB) передавався як позиційний аргумент до `pi`, `claude` та `cursor-agent`. macOS обмежує сумарний розмір argv значенням `ARG_MAX = 1 048 576 байт`. На великому репо diff-контекст перевищував ліміт, `execve` повертав `E2BIG`, а zsh друкував `argument list too long: <cmd>` ще до запуску бінарника (rc=127, ~0.3 s) — генерація commit-меседжу й коміт не відбувались.

## Considered Options
* Передача prompt як позиційного аргументу (поточна поведінка)
* Передача prompt через stdin (тимчасовий файл + перенаправлення `< "$pf"`)

## Decision Outcome
Chosen option: "Передача prompt через stdin (тимчасовий файл)", because stdin не має ліміту `ARG_MAX`; усі три агенти (`pi -p`, `claude -p`, `cursor-agent -p`) підтвердили читання промпта зі stdin. Prompt пишеться в `mktemp`-файл `$pf`, агенти викликаються з `< "$pf"`, файл прибирається на всіх шляхах виходу функції.

### Consequences
* Good, because transcript фіксує очікувану користь: баг відтворено (4 MB argv → `argument list too long`) і усунено (stdin-підхід проходить для всіх трьох агентів).
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Файл: `npm/push.js`, функція `_n7push_gen_message`
- `getconf ARG_MAX` = 1048576 (підтверджено в transcript)
- Тест: `npm/tests/push.test.mjs` — додано 2 нові перевірки (stdin-механіка)
- `zsh -n` підтвердив синтаксис; `bun test` — 27/27 pass

---

## ADR Тришарове обрізання diff-контексту (рядки → колонки → байти)

## Context and Problem Statement
До фіксу diff-контекст у `_n7push_gen_message` обрізався лише за кількістю рядків (`N7COMMIT_MAX_DIFF_LINES`=1500). На репо `/Users/vitalii/www/nitra/ai` 1326 рядків дали 5.4 MB (≈4100 байт/рядок) — у diff потрапили дуже довгі рядки (мініфіковане/згенероване/base64). Навіть якщо передати prompt через stdin, такий обсяг надмірний за вартістю і може перевищити context-вікно моделі.

## Considered Options
* Обрізання лише за рядками (поточна поведінка)
* Тришарове обрізання: `head -n` (рядки) → `cut -c` (довжина рядка) → `head -c` (байти)

## Decision Outcome
Chosen option: "Тришарове обрізання: рядки → колонки → байти", because жодного з трьох лімітів окремо недостатньо — рядковий ліміт не захищає від одного довгого рядка, байтовий без рядкового дає нечитаємий обрізок посередині, column-cap без byte-cap не дає тверду гарантію. Додано змінні `N7COMMIT_MAX_LINE` (=500) і `N7COMMIT_MAX_DIFF_BYTES` (=256 KiB) поряд із наявним `N7COMMIT_MAX_DIFF_LINES`.

### Consequences
* Good, because transcript фіксує очікувану користь: розмір контексту, надісланого в LLM, стає передбачуваним незалежно від вмісту файлів у diff.
* Bad, because Neutral, because transcript не містить підтвердження наслідку — обрізання може відкинути частину значущого diff для дуже великих змін.

## More Information
- Файл: `npm/push.js`, блок збирання diff-контексту (секція `_n7push_gen_message`)
- Debug-рядок тепер виводить байти і всі три ліміти
- Тест у `npm/tests/push.test.mjs` — додано перевірку байтового обрізання

---

## ADR Floor-синхронізація локальної версії з npm-реєстром перед релізом у CI

## Context and Problem Statement
`n-cursor release` рахує bump від **локального `package.json`**, а не від реєстру. Коли commit-back версії програє гонку (non-fast-forward) і не потрапляє в `origin/main`, git і npm розходяться (git = N-1, npm = N). Наступний запуск `n-cursor release` пропонує вже опубліковану версію N: `npm-publish` (strategy=`upgrade`) тихо пропускає публікацію (`type: none`), а реліз вважається успішним — нова версія взагалі не виходить.

## Considered Options
* Гейтувати `npm publish` на успішний commit-back (не публікувати, якщо push відхилено)
* Floor-синхронізація: перед релізом підняти локальний `package.json` до `max(local, published)`, а bump додати поверх

## Decision Outcome
Chosen option: "Floor-синхронізація перед релізом", because зберігає семантику bump з change-файлів (minor/major-наміри не губляться) і гарантує, що `npm-publish` завжди публікує версію вищу за реєстр — без мовчазного пропуску. Реалізовано кроком `Sync version floor to published` у `.github/workflows/npm-publish.yml` перед `bunx n-cursor release`.

### Consequences
* Good, because transcript фіксує очікувану користь: флоор коректний у всіх сценаріях — phantom (git=0.12.0, npm=0.12.1 → floor=0.12.1, bump → 0.12.2), норма, git-попереду, minor/major pending, перша публікація.
* Bad, because Neutral, because transcript не містить підтвердження наслідку — за постійного дрейфу між git і npm кожен реліз буде «patch вище очікуваного» замість очікуваного номера.

## More Information
- Файл: `.github/workflows/npm-publish.yml` — новий крок між `Configure git identity` і `Release (bump + CHANGELOG + tag)`
- `JS-DevTools/npm-publish` зі strategy=`upgrade` тихо пропускає публікацію, якщо версія вже існує (`type: none`) — це першопричина мовчазного зникнення релізу
- YAML валідований через `python3 -c "import yaml; yaml.safe_load(...)"` ✅

---

## ADR Явна перевірка push із rebase-retry у `n-cursor release`

## Context and Problem Statement
У `npm/rules/release/release.mjs` рядок 115 викликав `await runGit(['push', '--follow-tags'])`. `runGit` повертав `null` при будь-якій помилці (тихий runner); результат не перевірявся. Коли `git push` отримував non-fast-forward (паралельний push в `origin/main`), `release()` усе одно повертав успіх і виводив `✅` — commit-back не потрапляв у git, але npm-publish далі опублікував нову версію. Так і виник «фантом» 0.12.1 (є в npm, відсутній у git).

## Considered Options
* Не перевіряти результат push (поточна поведінка)
* Перевіряти і кидати помилку на будь-якому non-zero (жодного retry)
* Перевіряти, на non-ff робити `fetch` + `rebase` + повторний push (до N спроб), потім кидати помилку

## Decision Outcome
Chosen option: "Fetch + rebase + повторний push (до N спроб), потім помилка", because single-retry покриває типову гонку (один паралельний push), а явна помилка після вичерпання спроб не дає CI рапортувати успіх із неприземленим commit-back. Після rebase теги пересуваються на новий HEAD перед повторним push.

### Consequences
* Good, because transcript фіксує очікувану користь: commit-back тепер надійно потрапляє в git навіть за паралельних push; при вичерпанні спроб CI явно падає — git і npm лишаються узгодженими.
* Bad, because Neutral, because transcript не містить підтвердження наслідку — rebase може додати merge-конфлікт, якщо паралельний коміт зачепив ті самі файли, що й release-commit.

## More Information
- Файл: `/Users/vitalii/www/nitra/cursor/npm/rules/release/release.mjs`
- Change-файл: `npm/.changes/260616-1637.md` (`patch` / `Fixed`)
- Тест: `npm/rules/release/js/tests/release.test.mjs` — додано 4 перевірки (non-ff → retry, успіх після retry, падіння після N спроб, переміщення тегів після rebase); `npx vitest run` — 14/14 pass
