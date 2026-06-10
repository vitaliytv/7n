---
session: b4042850-5fb6-46be-b215-1477180bcdb6
captured: 2026-06-10T14:54:51+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/b4042850-5fb6-46be-b215-1477180bcdb6.jsonl
---

Проаналізую transcript і сформую ADR-документи.

## ADR FF fast-path та reverse-delta у `pull`

## Context and Problem Statement
Команда `npx @7n/n pull` завжди виконувала `_n7merge_delta "HEAD" "origin/<branch>"`, навіть коли HEAD є строгим предком origin — тобто класичний fast-forward без конфліктів. HEAD ніколи не рухався, а upstream-зміни клались як uncommitted, що давало неправильний `git status` («behind origin») і змушувало комітити чужі зміни від свого імені.

## Considered Options
* Fast-path `git merge --ff-only`, фолбек на `_n7merge_delta "HEAD" "origin/<branch>"` (origin-дельта на локальний HEAD)
* Fast-path `git merge --ff-only`, фолбек через `stash → ff → stash pop`
* Fast-path `git merge --ff-only`, фолбек через reverse-delta: `backup → git reset --hard origin → _n7merge_delta "origin/<branch>" "$backup_ref"` (локальна-дельта на origin-base)

## Decision Outcome
Chosen option: "Fast-path `git merge --ff-only`, фолбек через reverse-delta", because схема `stash → ff → pop` переносить конфлікт у `stash pop` і деградує резолвер до звичайного git-merge без bagatorivnevogo резолву, тоді як reverse-delta зберігає повний ланцюг `_n7merge_delta` (apply → 3-way → mergiraf → LLM) і дає коректнішу git-семантику: HEAD = origin (реальні SHA/автори), локальна робота — як unstaged.

### Consequences
* Good, because `git status` після pull чесно показує «up to date»; повторний pull ідемпотентний; upstream-коміти лишаються з оригінальними SHA/авторами; `push` сквошить лише локальну роботу без переавторення чужих змін.
* Bad, because фолбек виконує `git reset --hard origin/<branch>`, тобто рухає HEAD — безпековий інваріант «HEAD не рухається ніколи» втрачається; застрахований через `git stash create` (sha бекапу) + `trap` авто-відкату на INT/TERM.

## More Information
Реалізовано у `npm/pull.js`. Порядок кроків фолбеку: `git stash create` (знімок до reset) → `git reset --hard origin/<branch>` → `_n7merge_delta "origin/$branch" "$backup_ref" "origin/$branch" "локальна робота"`. Бекап-sha та команда відкату виводяться у stderr. Тести: `npm/tests/pull.test.mjs`, 68 passed. Changelog: `npm/.changes/260610-1357.md` (bump: minor).

---

## ADR modify-beats-delete у `_n7merge_delta`

## Context and Problem Statement
CI-реліз (`@7n/n@0.5.0`) консумував change-файл `npm/.changes/260610-1322.md` (видалив його з дерева), поки цей самий файл локально редагувався. `_n7merge_delta` отримав класичний delete/modify конфлікт, відправив файл у Tier 3 (LLM через `pi -p`), і агент повернув порожнечу (`<eos>`) з exit 0 — файл лишився з конфліктними маркерами.

## Considered Options
* Відправляти delete/modify у LLM (поточна поведінка)
* Детермінована правила «modify-beats-delete»: та сторона, що *змінила* контент, перемагає сторону, що *видалила*; жодного 3-way і LLM

## Decision Outcome
Chosen option: "Детермінована правила «modify-beats-delete»", because delete/modify — це не семантичний конфлікт змісту, а структурний вибір між «видалити» і «зберегти нову версію»; детермінований вердикт надійніший за LLM, вихід якого непередбачуваний, і повністю скриптовий.

### Consequences
* Good, because transcript фіксує очікувану користь: Tier 3 (LLM) = 0 у тестовому сценарії, файл зберігається з коректним вмістом без маркерів навіть без LLM-агента у PATH.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Реалізовано у `npm/merge.js` у функції `_n7merge_delta`: детекція `[[ ! -f "$rel" ]] && git cat-file -e "$merge_base:$rel"`. Симетричне правило (delete в `ours` / modify у `src`) доповнює вже наявне (delete у `src` / modify в `ours`). Спільний хелпер `_n7merge_rescued` виводить однаковий яскравий банер `╭─ 💀→✅ ВРЯТОВАНО ВІД ВИДАЛЕННЯ` для обох напрямків. Людські підписи `$3`/`$4` (з дефолтом → ref) дозволяють `pull.js` передавати `"origin/$branch" "локальна робота"`. Тести: `npm/tests/merge.test.mjs`, 71 passed. Changelog: `npm/.changes/260610-1404.md` (bump: minor).

---

## ADR Заміна LLM-тіра на JS-резолвер через omlx

## Context and Problem Statement
LLM-ланцюг `pi -p → claude -p → cursor-agent` у `_n7merge_resolve_with_agent` ненадійний: `pi` повертає `<eos>` з exit 0, конфліктні маркери лишаються, але скрипт не знає про збій. Потрібен детермінованіший клієнтський цикл із валідацією результату, де аплай і верифікація контролюються на нашій стороні, а не залежать від агентного tool-loop.

## Considered Options
* Лишити ланцюг `pi → claude → cursor` з поліпшеним error-handling
* Замінити LLM-тір на JS-резолвер, що викликає локальний omlx (OpenAI-сумісний сервер, `127.0.0.1:8000`) з клієнтським generate-validate-retry циклом
* Повна переписка всього `_n7merge_delta` на JS (включно з git-apply/3-way/mergiraf)

## Decision Outcome
Chosen option: "Замінити LLM-тір на JS-резолвер через omlx (скоуп A: тільки LLM-тір)", because Tier 0–2 (`git apply → merge-file --diff3 → mergiraf`) детерміновані і не потребують LLM; замінюємо лише той фрагмент, де LLM давав збій; JS-резолвер unit-тестований, аплай і валідація — на нашій стороні, а не у агентному tool-loop.

### Consequences
* Good, because клієнтський цикл generate-validate-retry перехоплює `<eos>` і галюцинації, валідатори V1–V7 детерміновані, теплий виклик e4b ~0.85 с.
* Bad, because gemma-4-e4b (основна модель) слабша за cloud-агентів на merge-резолві; без cloud-фолбеку auto-резолв проседатиме для складних хунків; при недоступному omlx (сервер не запущено / memory ceiling) маркери лишаються без авто-старту.

## More Information
omlx: `GET /v1/models` (health-check) та `POST /v1/chat/completions` на `http://127.0.0.1:8000`. Аутентифікація обов'язкова (`skip_api_key_verification: false` за замовч.); дефолт ключа `omlx-local-test-key` + читання `auth.api_key` з `~/.omlx/settings.json`; env-оверайд `N7MERGE_OMLX_KEY`. Дефолт-модель — з поля `is_default: true` у `~/.omlx/model_settings.json`; env-оверайд `N7MERGE_OMLX_MODEL`. Температура форсується `0` (server-default `1.0` руйнує детермінізм). Granularity: per-chunk (diff3 `<<<<<<< / ||||||| / ======= / >>>>>>>` парсинг у JS). Lifecycle: тільки health-check, no auto-start. Реалізація запланована у новому модулі `npm/omlx.js`; `_n7merge_resolve_with_agent` у `merge.js` замінюється на `node "$N7MERGE_RESOLVER" <files>`. Transcript не містить підтверджень завершеної реалізації — рішення зафіксовано на стадії проєктування й перевірки живого сервера.

---

## ADR `response_format: json_schema` та валідатори V1–V7 для omlx-резолвера

## Context and Problem Statement
Sentinel-блоки (`<<<N7-RESOLVED` / `N7-RESOLVED>>>`) як формат виводу ненадійні для маленьких моделей (e4b додає прозу поза sentinel). Guided/constrained decoding (`guided_choice`) у даному білді omlx не енфорситься сервером. Потрібен надійний спосіб парсингу + агресивна валідація, що ловить галюцинації і тихе скорочення.

## Considered Options
* Sentinel-блоки (`<<<N7-RESOLVED` / `N7-RESOLVED>>>`) + regex-парсинг
* `response_format: json_schema` (поле `resolved: string`) + `JSON.parse`

## Decision Outcome
Chosen option: "`response_format: json_schema` + `JSON.parse` + валідатори V1–V7", because емпіричний тест підтвердив, що gemma-4-e4b коректно екранує лапки та `\n` у JSON-полі `resolved`, повертає валідний JSON без преамбул, і зберігає унікальні рядки обох сторін; JSON.parse є детермінованим структурним валідатором першого рівня.

### Consequences
* Good, because transcript фіксує очікувану користь: omlx із `json_schema` зберіг обидва unique-рядки (`host = "0.0.0.0"` і `port = 3000`), escape-послідовності коректні, відповідь без преамбул.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Валідатори (застосовуються пер-хунк після `JSON.parse`): V1 — відсутність маркерів `<<<<<<<` / `|||||||` / `=======` / `>>>>>>>`; V2 — непорожньо (крім випадку обидва боки порожні); V3 — ніякого тексту поза sentinel, відсутність code-fence і преамбул («Here is», «Note:»); V4 — кожен непорожній рядок результату присутній (trim) в `ours ∪ base ∪ theirs` (захист від галюцинацій); V5 — якщо є unique-рядки в обох `ours` і `theirs`, у результаті має бути ≥1 unique з кожної (покриття обох сторін); V6 — усі unique-рядки кожної сторони мусять вціліти (увімкнено дефолтно, пара зайвих ретраїв прийнятна); V7 — рядків результату ≥ max(meaningful(ours), meaningful(theirs)) (length-guard). Ретрай-бюджет N (дефолт 3); невалідний хунк → таргетований ретрай із фідбеком про відсутні рядки; після вичерпання — лишаємо маркери. Реалізація запланована у `npm/omlx.js` з інжекцією fake-`fetch` для vitest.
