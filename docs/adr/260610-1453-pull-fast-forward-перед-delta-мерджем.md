---
session: b4042850-5fb6-46be-b215-1477180bcdb6
captured: 2026-06-10T14:53:27+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/b4042850-5fb6-46be-b215-1477180bcdb6.jsonl
---

Схоже, для запису **нового** файлу потрібен явний дозвіл. Натисніть «Allow» у запиті дозволу вище, щоб дозволити `Write` на `npm/omlx.js`, або я можу створити його через Bash.

Поки чекаємо — покажу, що ще треба буде змінити в `merge.js` після того, як `omlx.js` буде на місці:

1. Додати імпорти `fileURLToPath`, `dirname`, `join` та визначити `_n7OmlxResolver` шлях.
2. Замінити все тіло `_n7merge_resolve_with_agent` на один виклик `node "${_n7OmlxResolver}"`.
3. Прибрати `_n7agent_report_failure` (більше не потрібна).
4. Оновити топ-коментар про Tier 3.

Якщо хочеш — підтвердь дозвіл і я продовжу. Або скажи «через bash» і я спробую інший шлях.

---

Тим часом підготую ADR-документ для цієї сесії — всі ключові рішення вже прийняті і задокументовані в контексті.

---

## ADR pull: fast-forward перед delta-мерджем

## Context and Problem Statement
`npx @7n/n pull` завжди виконував delta-мердж навіть у тривіальному кейсі, коли HEAD є строгим предком `origin/<branch>`. Користувач очікував fast-forward у першу чергу.

## Considered Options
* Fast-forward (`git merge --ff-only`) як перший крок, delta-мердж як фолбек
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Fast-forward-first з фолбеком на delta-мердж", because FF дешевший, ідемпотентний і зберігає правильну git-семантику (HEAD рухається); delta-мердж залишається на кейс, коли FF неможливий або локальні зміни перетинаються з апдейтом.

### Consequences
* Good, because `git status` після pull коректно каже «up to date».
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
`npm/pull.js` — FF через `git merge --ff-only`; при non-zero фолбек на `_n7merge_delta`. Тести: `npm/tests/pull.test.mjs`.

---

## ADR pull: reverse-delta замість origin-delta як фолбек

## Context and Problem Statement
Після FF-fast-path потрібен фолбек для розбіжної історії. Поточний `_n7merge_delta("HEAD", "origin/<branch>")` клав upstream-зміни як uncommitted, лишаючи HEAD на локальних комітах — `git status` показував «behind origin», push змішував чужі коміти з локальними.

## Considered Options
* `stash → ff → stash pop` (user пропозиція)
* Reverse-delta: `reset --hard origin` + `_n7merge_delta("origin/<branch>", backup)` (рекомендація асистента)
* Поточна поведінка (origin-delta на локальний base)

## Decision Outcome
Chosen option: "Reverse-delta (HEAD → origin, локальна робота як unstaged)", because HEAD = origin дає коректний `git status`, push сквошить лише локальну роботу без переавторингу upstream-комітів, а `stash pop` дав би той самий конфлікт без багаторівневого резолвера.

### Consequences
* Good, because transcript фіксує очікувану користь: ідемпотентність pull, чиста git-семантика, push не змішує авторів.
* Bad, because `reset --hard` переписує HEAD — прикрито `git stash create`-бекапом + `trap` на відкат.

## More Information
`npm/pull.js`: `git stash create` → `git reset --hard origin/<branch>` → `_n7merge_delta "origin/$branch" "$backup_ref" "origin/$branch" "локальна робота"`. Підписи `ours_label`/`src_label` для human-readable виводу.

---

## ADR merge: детермінований resolve delete/modify конфліктів

## Context and Problem Statement
Під час reverse-delta pull виникав реальний кейс: origin-реліз видаляв change-файл (консумував у CHANGELOG), а локально той файл редагувався — класичний delete/modify конфлікт. Попередній алгоритм передавав такий файл у LLM (Tier 3), де `pi` повернув `<eos>` і лишив маркери.

## Considered Options
* Детермінований `modify-beats-delete` у `_n7merge_delta` (Tier 1), без LLM
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "modify-beats-delete у Tier 1", because сторона, що змінила контент, завжди важливіша за сторону, що видалила — результат детермінований, reviewable, не залежить від LLM.

### Consequences
* Good, because transcript фіксує: Tier 3 (LLM) = 0, маркерів нема, change-файл збережено з локальним вмістом.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
`npm/merge.js` → `_n7merge_rescued()` хелпер + дві симетричні гілки (deleted-in-src і deleted-in-ours). Підписи `ours_label`/`src_label` у `_n7merge_delta` ($3/$4, дефолт = ref). Банер `╭─ 💀→✅ ВРЯТОВАНО ВІД ВИДАЛЕННЯ`. `npm/tests/merge.test.mjs` тест 69.

---

## ADR merge: заміна LLM-tier на omlx HTTP API з клієнтським циклом валідації

## Context and Problem Statement
Поточний Tier 3 (`pi → claude → cursor-agent`) — агентний tool-loop, де модель сама редагує файли. `pi` повернув `<eos>` з exit 0, не прибравши маркери. Потрібна локальна детермінована альтернатива без cloud-залежності.

## Considered Options
* omlx HTTP API (`/v1/chat/completions`) з generate-validate циклом у JS (обраний варіант)
* Збереження `pi → claude → cursor` (поточне)
* `stash → ff → stash pop` (відхилено: дає той самий конфлікт при `stash pop` без резолвера)

## Decision Outcome
Chosen option: "omlx-only, клієнтський цикл у JS", because JS-резолвер забирає аплай і валідацію собі (model не може «забути» застосувати зміну), тестований через fake-fetch, не залежить від PATH-агентів. Заміна лише LLM-tier (Tier 0–2 — git apply/3-way/mergiraf — без змін).

### Consequences
* Good, because transcript фіксує очікувану користь: детермінована валідація, тестовність через fake-fetch, 0.85 с теплий виклик.
* Bad, because gemma-e4b (4B) слабша за cloud-агентів на складних мерджах; при недоступному omlx маркери лишаються без cloud-фолбеку (явний вибір).

## More Information
`npm/omlx.js`: 6-рівнева валідація (no-markers, non-empty, size-bound ×1.5, common-lines-guard, parse-integrity JSON/JS, novel-content ≤5%), two-phase для складних хунків, sentinel `<MERGE_RESULT>...</MERGE_RESULT>`, temp=0 (server-default 1.0). Конфіг: `~/.omlx/settings.json` (url, api_key) + `model_settings.json` (is_default), env `N7MERGE_OMLX_{URL,KEY,MODEL,MAX_TOKENS,RETRIES}`. Auth обов'язковий (`Bearer omlx-local-test-key` за замовченням). Оновлення `merge.js`: `_n7merge_resolve_with_agent` → виклик `node omlx.js`.
