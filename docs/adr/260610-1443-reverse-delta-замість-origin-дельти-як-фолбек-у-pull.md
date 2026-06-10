---
session: b4042850-5fb6-46be-b215-1477180bcdb6
captured: 2026-06-10T14:43:54+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/b4042850-5fb6-46be-b215-1477180bcdb6.jsonl
---

---

Тепер, проаналізувавши транскрипт, продукую ADR-документацію по ключових рішеннях сесії.

## ADR reverse-delta замість origin-дельти як фолбек у pull

## Context and Problem Statement
Команда `npx @7n/n pull` завжди виконувала delta-мердж (`_n7merge_delta "HEAD" "origin/<branch>"`), не намагаючись fast-forward навіть коли він тривіально можливий. Окрім того, кінцевий стан після pull лишав HEAD на локальних комітах, а upstream-зміни клались як uncommitted — що означало «позаду origin» у `git status` і нечисту атрибуцію при подальшому `push`.

## Considered Options
* Fast-forward (`git merge --ff-only`) + delta-мердж як фолбек — оригінальний `HEAD`→`origin` напрямок
* `stash → pull → stash pop` перед FF
* Reverse-delta: бекап → `reset --hard origin/<branch>` → `_n7merge_delta "origin/<branch>" "$backup_ref"` (обернені ролі)

## Decision Outcome
Chosen option: "reverse-delta фолбек", because він дає `HEAD = origin` (реальні SHA/автори upstream) і uncommitted = лише локальна робота, що точно відповідає семантиці `push` (сквошить тільки власне); `git status` після pull чесно показує «up to date»; re-run pull ідемпотентний; `stash pop` на відміну від нього не вирішував, а переносив конфлікт із тим самим перетином.

### Consequences
* Good, because transcript фіксує очікувану користь: `HEAD = origin/master` після pull, origin-файли committed (не unstaged), unstaged-діфф = лише локальна робота, повторний pull → «Вже актуально» без зачіпання uncommitted змін (інтеграційний smoke-тест пройдено).
* Bad, because `reset --hard` переписує HEAD — вищий blast radius, ніж поточний інваріант «HEAD не рухається ніколи». Закрито: `git stash create` + друк sha + `trap` на `INT/TERM` авто-відкочує до бекапу, якщо мід-флоу перервати.

## More Information
Реалізовано у `npm/pull.js`. Алгоритм у zsh-шаблоні: `git fetch` → up-to-date shortcut (`HEAD == origin/<branch>`) → `git merge --ff-only` (якщо предок) → при non-zero: `git stash create` (бекап-sha) + `git reset --hard origin/$branch` + `_n7merge_delta "origin/$branch" "$backup_ref" "origin/$branch" "локальна робота"`. Тести: `npm/tests/pull.test.mjs`.

---

## ADR modify-beats-delete у _n7merge_delta без LLM

## Context and Problem Statement
У реальному запуску `pull` зіткнулись із кейсом: origin-реліз видалив change-файл (консумував у CHANGELOG), а локально цей самий файл редагувався. `_n7merge_delta` відправив його на LLM (Tier 3), `pi` повернув `<eos>`, маркери лишились. Попередня обробка «видалено у `src`, але змінено в `ours`» у коді вже існувала, але симетричного правила для «видалено в `ours`, але змінено у `src`» не було.

## Considered Options
* Відправляти delete/modify на LLM (попередня поведінка)
* Детермінована політика modify-beats-delete для обох симетричних кейсів

## Decision Outcome
Chosen option: "modify-beats-delete для обох напрямків", because сторона, що змінила контент, завжди семантично правіша за сторону, що просто видалила; детекція точна (`! -f "$rel"` + `git cat-file -e "$merge_base:$rel"`); LLM на цьому кейсі ненадійний (підтверджено `<eos>` від `pi`).

### Consequences
* Good, because transcript фіксує очікувану користь: інтеграційний тест показав «♻️ ВРЯТОВАНО ВІД ВИДАЛЕННЯ», `Tier 3 (LLM): 0` навіть без LLM-агентів у PATH, маркерів нема, change-файл уцілів з локальним вмістом.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Реалізовано в `npm/merge.js`, функція `_n7merge_delta`: нова гілка перед Tier-1 3-way loop. Спільний банер `_n7merge_rescued` для обох напрямків (банер `╭─ 💀→✅ ВРЯТОВАНО ВІД ВИДАЛЕННЯ`). `_n7merge_delta` розширено до 4-х параметрів: `$3/$4` = людські підписи для виводу (`ours_label`/`src_label`), git-операції завжди на реальних ref `$1/$2`. `pull.js` передає `"origin/$branch" "локальна робота"` як підписи. Тести: `npm/tests/merge.test.mjs`. Change-файл: `npm/.changes/260610-1404.md`.

---

## ADR заміна LLM-агентів (pi/claude/cursor) на omlx у Tier 3

## Context and Problem Statement
Tier 3 у `_n7merge_resolve_with_agent` використовував агентний tool-loop (`pi -p` → `claude -p` → `cursor-agent -p`): модель мала самостійно викликати `edit`-інструмент, щоб прибрати маркери. Цей підхід дав збій (`pi` повернув `<eos>` з exit 0 — файл лишився з маркерами). Хочеться замінити на `omlx` — локальний OpenAI-сумісний HTTP-сервер на Apple Silicon — і перенести аплай та валідацію у JS-клієнт.

## Considered Options
* Залишити поточний ланцюг `pi → claude → cursor` з виправленням обробки `<eos>`
* Замінити лише LLM-тір на omlx з клієнтським generate-validate-retry циклом у JS, зберегти cloud-агентів як фолбек
* Повна заміна: omlx-only, без cloud-фолбеку, ланцюг `pi/claude/cursor` видалити

## Decision Outcome
Chosen option: "повна заміна на omlx-only (Tier 0–2 у zsh лишаються незмінними)", because проблема з `pi` — у агентному tool-loop: модель може не викликати `edit`, і перевірити це неможливо до повернення exit 0. З omlx клієнт (JS) сам робить аплай і валідацію → модель відповідає лише за текст резолву. Cloud-агентів видаляють свідомо — деградація при недоступному omlx = маркери лишаються + чітка помилка (безпечно прикрито `git stash create`-бекапом).

### Consequences
* Good, because transcript фіксує очікувану користь: per-hunk підхід під крихітну e4b/e2b модель; детермінований sentinel `<<<RESOLVED`/`RESOLVED>>>` унеможливлює silent `<eos>` баг; клієнтський retry-цикл (N=3) з feedback у messages; конфіг автозчитується з `~/.omlx/settings.json` (`auth.api_key`, `is_default` model); env-оверайди `N7MERGE_OMLX_URL|KEY|MODEL|MAX_TOKENS`.
* Bad, because відсутній cloud-фолбек: якщо omlx недоступний або модель не вміщується у пам'ять (transcript: `projected memory 15.78GB would exceed ceiling 11.84GB`), конфлікти лишаються нерозв'язаними — користувач мусить резолвити вручну.

## More Information
Реалізація: новий файл `npm/resolve-conflicts.js` (CLI: `node resolve-conflicts.js [--ours-label X] [--src-label Y] <file...>`); `_n7merge_resolve_with_agent` у `npm/merge.js` замінюється на виклик цього скрипту через `node "$N7OMLX_RESOLVER"`, де `N7OMLX_RESOLVER` інжектується з `fileURLToPath(new URL('./resolve-conflicts.js', import.meta.url))` у JS-шаблон. Health-check `GET /v1/models` перед роботою; при недоступному omlx — exit 1 без авто-старту. API: `POST /v1/chat/completions`, `temperature: 0`, model = `is_default` з `~/.omlx/model_settings.json` або перший з `/v1/models`. Warm-latency e4b: ~0.85s/хунк (cold: ~32s). Auth: `omlx-local-test-key` дефолт + авто-читання з `settings.json`. На момент завершення сесії реалізація `resolve-conflicts.js` була підготовлена, але не записана у файлову систему.
