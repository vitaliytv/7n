---
session: b4042850-5fb6-46be-b215-1477180bcdb6
captured: 2026-06-10T15:50:54+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/b4042850-5fb6-46be-b215-1477180bcdb6.jsonl
---

Готово, баг знайдено й виправлено.

## Що відбулось і що виправлено

**Знайдений баг у живому тесті:** коли `package.json` потрапляє в конфлікт (з diff3-маркерами), Node.js читає цей файл ще ДО запуску резолвера — щоб визначити тип модуля. Невалідний JSON → `ERR_INVALID_PACKAGE_CONFIG` → резолвер **падає, не стартувавши**.

**Фікс:** `omlx.js` → `omlx.mjs`, `omlx-resolve.js` → `omlx-resolve.mjs`. При `.mjs`-розширенні Node визначає ESM автоматично і **не читає** `package.json` під час старту.

**Доведено:** ізольований тест з навмисно зламаним `package.json` поряд із резолвером: `.mjs` — стартує нормально; `.js`-контроль — падає з `ERR_INVALID_PACKAGE_CONFIG`. У повному pull-флоу: помилка тепер акуратна — `omlx-resolve: omlx HTTP 507: memory ceiling` (резолвер стартував, дістався omlx, граційно відрепортив проблему пам'яті).

**Поточний стан:** `merge.js` + rename + `package.json` + оновлені тести — **90/90 зелених, lint чисто**. `.changes/` з двома файлами (до закоміту).

Коли звільниш пам'ять (e4b потребує ~7.3 GB вільного під стелю 11.84), ще раз `bun ./npm/bin/n.js pull` покаже повний успішний omlx-резолв. Закомітити?
---

<system-reminder>Today's date is 2026-06-10.</system-reminder>

## ADR pull: reverse-delta замість origin-delta як фолбек на FF-неможливість

## Context and Problem Statement
У команді `pull` (`npm/pull.js`) при неможливості fast-forward використовувався підхід «origin-дельта на HEAD». Це не зберігало реальних SHA і авторів upstream. Потрібно було замінити фолбек на підхід, який зберігає HEAD на origin та повертає локальну роботу як unstaged.

## Considered Options
* Reverse-delta: `git stash create` → `git reset --hard origin/<branch>` → `_n7merge_delta "origin/<branch>" "$backup_ref"` (локальна дельта назад як unstaged)
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "reverse-delta", because підхід зберігає реальні SHA і авторів upstream після reset і повертає локальну роботу через той самий `_n7merge_delta` з оберненими ролями; є страховка: бекап-sha друкується з командою відкату і `trap` авто-відкочує локальний стан на `INT/TERM`.

### Consequences
* Good, because transcript фіксує очікувану користь: HEAD після pull відповідає реальному origin; unstaged-діфф = лише локальна робота; повторний pull ідемпотентний і не чіпає незакомічену роботу.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Змінений файл: `npm/pull.js`. Тест: `npm/tests/pull.test.mjs`. Перевірено на реальній розбіжній git-механіці (FF-неможливий, uncommitted файли). Команда відкату: `git reset --hard <backup_sha> && git stash apply <stash_sha>`.

---

## ADR merge: детермінований розв'язок delete/modify конфліктів (modify-beats-delete)

## Context and Problem Statement
У `_n7merge_delta` (`npm/merge.js`) при конфлікті типу «одна сторона видалила файл, а інша його змінила» файл потрапляв у LLM Tier-3. LLM (`pi`) повертав `<eos>` і лишав маркери. Потрібно було закрити цей клас конфліктів детерміновано.

## Considered Options
* Детермінований modify-beats-delete у Tier-1: сторона, що змінила, перемагає сторону, що видалила — для обох напрямків (delete в `ours`/delete в `src`)
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "детермінований modify-beats-delete у Tier-1", because обидва напрямки (delete-in-ours і delete-in-src) закриваються без 3-way і без LLM, результат reviewable через `git diff`.

### Consequences
* Good, because transcript фіксує очікувану користь: на живому pull кейс «origin-реліз видалив change-файл, локально змінено» вирішується без LLM (`Tier 3 (LLM): 0 файл(ів)`), маркерів нема, файл збережено з локальним вмістом.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Змінений файл: `npm/merge.js` (функція `_n7merge_delta` + хелпер `_n7merge_rescued`). Тест: `npm/tests/merge.test.mjs`. Банер: `╭─ 💀→✅ ВРЯТОВАНО ВІД ВИДАЛЕННЯ`. Людські підписи `ours_label`/`src_label` передаються як `$3`/`$4` (дефолт = ref); `pull.js` передає `"локальна робота"` для src-сторони.

---

## ADR merge Tier-3: заміна cloud-агентів (pi/claude/cursor) на локальний omlx (MLX)

## Context and Problem Statement
Tier-3 резолв конфліктів у `_n7merge_resolve_with_agent` (`npm/merge.js`) використовував ланцюг `pi → claude → cursor-agent`. `pi` поверталт `<eos>` і exit 0 при failure, залишаючи маркери. Потрібно замінити cloud-агентів на локальний omlx (MLX-сервер, OpenAI-compatible API, `http://127.0.0.1:8000`).

## Considered Options
* Повна заміна LLM-тіру на omlx-only з JS клієнтським generate-validate циклом (Tier 0–2 git-операції лишаються в zsh)
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "omlx-only з JS generate-validate циклом", because аплай і валідація переходять у детермінований JS-резолвер (`npm/omlx.mjs`, `npm/omlx-resolve.mjs`), що виключає клас помилок «модель не застосувала зміну»; результат unit-тестований через fake-fetch; cloud-агентів більше нема.

### Consequences
* Good, because transcript фіксує очікувану користь: live e2e на `gemma-4-e4b-it-OptiQ-4bit` розв'язав конфлікт (pure-add `host` збережено, `port` замінено, маркерів нема, Tier 3 omlx).
* Bad, because без cloud-фолбеку при недоступному omlx (memory ceiling, сервер лежить) маркери лишаються на ручний резолв; `gemma-4-e4b` слабша за claude/cursor на складних мерджах.

## More Information
Нові файли: `npm/omlx.mjs` (клієнт, парсер diff3-хунків, валідатори V1–V7, generate-validate цикл з ретраями), `npm/omlx-resolve.mjs` (CLI-ентрі для zsh).
Конфіг: `~/.omlx/settings.json` (URL, ключ-дефолт `omlx-local-test-key`), `~/.omlx/model_settings.json` (`is_default` → модель); env-оверайди `N7MERGE_OMLX_URL|MODEL|KEY|MAX_TOKENS|RETRIES|STRICT`.
Температура форсується 0 (server-default 1.0 руйнує детермінізм). Sentinel-блок `<<<N7-RESOLVED` / `N7-RESOLVED>>>` замість JSON (крихітна модель плутає екранування переносів у JSON-payload).
Агресивна валідація: V1 маркери · V2 непорожньо · V3 прозу/code-fence · V4 галюцинації (толерує комбінації) · V5/V6 pure-add покриття обох сторін · V7 довжина-guard; V6 дефолтно-увімкнено.
Критичний баг знайдено й виправлено у live-тесті: `.js`-розширення резолвера спричиняло `ERR_INVALID_PACKAGE_CONFIG` коли `package.json` у конфлікті (Node читає найближчий package.json для визначення типу модуля); `.mjs` обходить цю проблему.
Тест: `npm/tests/omlx.test.mjs` (90 тестів, 6 файлів).
