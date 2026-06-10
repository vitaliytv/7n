---
session: b4042850-5fb6-46be-b215-1477180bcdb6
captured: 2026-06-10T14:12:45+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/b4042850-5fb6-46be-b215-1477180bcdb6.jsonl
---

```markdown
## ADR pull — спершу fast-forward, потім reverse-delta як фолбек

## Context and Problem Statement
`npx @7n/n pull` завжди виконував `_n7merge_delta "HEAD" "origin/<branch>"`: обчислював origin-дельту і клав її у робоче дерево як unstaged, ніколи не рухаючи HEAD. Очікувана поведінка — спершу спробувати справжній fast-forward, і лише коли FF неможливий — переходити до мерджу. Крім того, старий підхід (origin-дельта як unstaged на незмінному HEAD) давав некоректну git-семантику: `git status` показував «behind origin» навіть після успішного pull, а подальший `push` втягував upstream-коміти у свій сквош, переавторовуючи чужі зміни.

## Considered Options
* **Поточний підхід** — завжди `_n7merge_delta "HEAD" "origin/<branch>"`, HEAD не рухається, origin-дельта як unstaged.
* **stash → `git merge --ff-only` → stash pop** — обговорено і відхилено: `stash pop` при конфлікті пускає у звичайний git-merge замість багаторівневого резолвера; `stash pop` при неконфліктному кейсі зайвий (git сам зберігає незачеплені правки під FF).
* **FF fast-path + reverse-delta fallback** — `git merge --ff-only` там, де FF можливий; коли ні — `git stash create` → `git reset --hard origin/<branch>` → `_n7merge_delta "origin/<branch>" "$backup_ref"` (обернені ролі, той самий резолвер).

## Decision Outcome
Chosen option: "FF fast-path + reverse-delta fallback", because це зберігає той самий багаторівневий резолвер (`apply → merge-file --diff3 → mergiraf → LLM`) для конфліктного кейсу й водночас дає коректну git-семантику: після успішного pull `HEAD = origin/<branch>`, локальна робота лежить як unstaged, `git status` каже «up to date», повторний `pull` ідемпотентний.

### Consequences
* Good, because `HEAD = origin` (реальні SHA/автори upstream) — `git push` сквошить лише локальну роботу, не переавторовуючи чужі коміти.
* Good, because ідемпотентність: повторний `pull` на вже актуальному дереві одразу виходить із «Вже актуально», не чіпаючи uncommitted-роботу.
* Good, because FF без локальних перетинів (кейси 1–2) проходить без будь-якого `stash`-overhead; перетин (кейс 3) розрулює повний резолвер, а не слабкий `stash pop`.
* Bad, because `git reset --hard origin/<branch>` переписує HEAD — безпековий інваріант «HEAD не рухається ніколи» втрачається. Transcript фіксує очікувану користь: компенсується `git stash create`-бекапом до reset, збереженим у stash-store, та друком команди повного відкату у stdout.

## More Information
Реалізація: `npm/pull.js` — zsh-функція `pull`; `npm/merge.js` — `_n7merge_delta` (спільне ядро, незмінне).
Порядок кроків: `git fetch origin "$branch"` → shortcut «вже актуально» → `git merge-base --is-ancestor HEAD origin/<branch>` → `git merge --ff-only` → при non-zero: `git stash create` → `git reset --hard origin/<branch>` → `_n7merge_delta "origin/$branch" "$backup_ref" "origin/$branch" "локальна робота"`.
Страховка: бекап-sha друкується у stdout (`🛟 Бекап ... Відкат: git reset --hard <sha> && git stash apply <sha>`); `trap` на `INT`/`TERM` авто-відкочує до локального стану.
Тести: `npm/tests/pull.test.mjs` (новий файл, 68+ тестів зелені після цієї зміни); інтеграційний прогін у тимчасовому git-репо підтвердив всі три кейси.
Change-файл: `npm/.changes/260610-1357.md` (bump: `minor`, section: `Changed`).
```

```markdown
## ADR merge — детермінований modify-beats-delete для delete/modify конфліктів

## Context and Problem Statement
Під час реального запуску `pull` виник конфлікт типу **delete/modify**: `origin/main` видалив `npm/.changes/260610-1322.md` (CI-реліз `0.5.0` консумував change-файл у `CHANGELOG.md`), а локально цей самий файл редагувався. `_n7merge_delta` передав файл у LLM-резолвер (`pi -p`), який повернув порожній результат (`<eos>`), лишивши конфліктні маркери. Аналіз показав, що `_n7merge_delta` вже містив детермінований обробник для дзеркального кейсу («видалено у `src`, але змінено в `ours`» → лишаємо `ours`), але не мав симетричного правила для «видалено в `ours`, але змінено у `src`».

## Considered Options
* **LLM-резолвер** (поточна поведінка) — файл передається в `pi → claude → cursor-agent`.
* **Детермінований modify-beats-delete** — симетричне правило: якщо файл видалено в одній стороні, але змінено в іншій, версія, що змінила, перемагає — без 3-way і без LLM.
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Детермінований modify-beats-delete", because сторона, яка несе контентну зміну, завжди інформативніша за просте видалення; детермінований `cp + continue` у Tier 1 надійніший, ніж LLM, що може повернути порожній результат, і консистентний з вже наявною половиною тієї самої політики в `_n7merge_delta`.

### Consequences
* Good, because transcript фіксує очікувану користь: при відтворенні сценарію (origin видаляє файл, локально редагується) `Tier 3 (LLM): 0`, маркерів немає, файл збережено з локальним вмістом.
* Good, because результат — unstaged-зміна, яку можна переглянути через `git diff` перед комітом; рішення не остаточне і не приховане.
* Bad, because transcript не містить підтверджених негативних наслідків. Теоретично: якщо видалення навмисне (security-fix, removal of deprecated API), `modify-beats-delete` його проігнорує — але це загальна властивість будь-якого merge, не специфічна регресія.

## More Information
Реалізація: `npm/merge.js`, функція `_n7merge_delta`, нова гілка перед 3-way блоком.
Детекція: `[[ ! -f "$rel" ]] && git cat-file -e "$merge_base:$rel"` — файла нема в дереві (ours видалив), але він був у base і є у src (src змінив).
Дія: `mkdir -p "$(dirname "$rel")"` → `cp "$theirs_tmp" "$rel"` → `_n7merge_rescued` банер → `tier1++` → `continue`.
Банер у stdout: `╭─ 💀→✅ ВРЯТОВАНО ВІД ВИДАЛЕННЯ / │  📄 <path> / │  «<ours_label>» видалив цей файл, але «<src_label>» його змінив. / ╰─ лишаю версію «<src_label>» (modify-beats-delete) — переглянь у git diff.`
`_n7merge_delta` отримав опціональні параметри `$3`/`$4` (`ours_label`/`src_label`; дефолт — `$1`/`$2`) — `pull.js` передає `"origin/$branch" "локальна робота"` для людиночитаного виводу.
Правило діє і для `getw` (спільне ядро `_n7merge_delta`).
Тести: `npm/tests/merge.test.mjs` — новий тест `delete/modify вирішує детерміновано (modify-beats-delete)`; **71 тест зелений**.
Change-файл: `npm/.changes/260610-1404.md` (bump: `minor`, section: `Changed`).
```
