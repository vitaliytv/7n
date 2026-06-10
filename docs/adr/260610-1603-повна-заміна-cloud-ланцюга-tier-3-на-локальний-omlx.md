---
session: b4042850-5fb6-46be-b215-1477180bcdb6
captured: 2026-06-10T16:03:40+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/b4042850-5fb6-46be-b215-1477180bcdb6.jsonl
---

## ADR Повна заміна cloud-ланцюга Tier-3 на локальний omlx

## Context and Problem Statement
Tier-3 конфліктний резолвер у `_n7merge_resolve_with_agent` (merge.js) викликав хмарних агентів `pi → claude → cursor-agent`. Агент `pi -p` повертав `<eos>` з exit 0 — скрипт фіксував залишені маркери, але контроль передавався людині без фактичного резолву. Постало питання: чи можна замінити весь агентний ланцюг на локальний generate-validate цикл у JS з omlx (локальний OpenAI-сумісний HTTP-сервер для Apple Silicon, `127.0.0.1:8000`), де застосування результату належить нашому коду, а не агенту.

## Considered Options
* Замінити лише `pi` — лишити `claude` і `cursor-agent` як фолбек
* Повна заміна: лише omlx, без cloud-фолбеку (обраний варіант)
* Залишити cloud-ланцюг, полагодити `<eos>`-баг на стороні pi

## Decision Outcome
Chosen option: "Повна заміна — omlx-only, без cloud-фолбеку", because усунення агентного tool-loop виводить аплай і валідацію на нашу сторону, що позбавляє баг `<eos>` принципово — модель генерує лише текст у sentinel-блоку, а JS зберігає файл детерміновано. Скоуп: лише LLM-тір (Tier 0–2: `git apply → merge-file → mergiraf` лишаються без змін). При недоступності omlx (сервер лежить / memory ceiling) — маркери лишаються, чітка помилка — backup через `git stash create` прикриває.

### Consequences
* Good, because transcript фіксує очікувану користь: баг `<eos>` з exit 0 усунено архітектурно — model cannot «забути» застосувати зміну; end-to-end прогін на `gemma-4-e2b-it-4bit` / `gemma-4-e4b-it-OptiQ-4bit` підтвердив резолв без маркерів.
* Bad, because локальні 2–4B-моделі слабші за cloud на мердж-резолві; при зайнятій RAM (`memory ceiling`) auto-резолв Tier 3 деградує до «лишаємо маркери», чого не було при cloud-фолбеку.

## More Information
Нові файли: `npm/omlx.mjs` (клієнт + парсер хунків + validate + цикл), `npm/omlx-resolve.mjs` (CLI-ентрі). Змінено: `_n7merge_resolve_with_agent` у `merge.js` шелл-аутить `node "$N7MERGE_RESOLVER"`. Auth: ключ з `~/.omlx/settings.json` (`auth.api_key`), дефолт `omlx-local-test-key`; env-оверайд `N7MERGE_OMLX_KEY`. Модель: `is_default: true` з `~/.omlx/model_settings.json`; env-оверайд `N7MERGE_OMLX_MODEL`. Температура форсується 0 (server-default 1.0 руйнує детермінізм).

---

## ADR `.mjs`-розширення для CLI-ентрі omlx-резолвера

## Context and Problem Statement
Під час першого живого pull-тесту виявлено: коли `npm/package.json` є одним із конфліктних файлів (містить diff3-маркери), запуск `node omlx-resolve.js` падав із `ERR_INVALID_PACKAGE_CONFIG` ще до будь-якого резолву — Node.js на старті читає найближчий `package.json` для визначення типу модуля (ESM/CJS), а він тимчасово невалідний JSON.

## Considered Options
* Перейменувати на `.mjs`
* Передавати `--input-type=module` через env у spawn
* Обгортати резолвер у окремий subprocess із тимчасовим package.json

## Decision Outcome
Chosen option: "Перейменувати `omlx.js`/`omlx-resolve.js` → `omlx.mjs`/`omlx-resolve.mjs`", because Node.js визначає ESM за розширенням `.mjs` і взагалі не звертається до `package.json` для цього — мінімальна зміна з максимальним ефектом.

### Consequences
* Good, because transcript фіксує очікувану користь: ізольований тест підтвердив — `.mjs` стартує при зламаному `package.json`, `.js`-контроль кидає `ERR_INVALID_PACKAGE_CONFIG`; повний pull-флоу показав «резолвер стартував, дійшов до omlx, отримав чисту HTTP-507».
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Оновлено: `merge.js` (`RESOLVER_PATH` → `omlx-resolve.mjs`), `package.json` → `files`, імпорти в `tests/omlx.test.mjs`, регекс у `tests/merge.test.mjs`. Команда перейменування: `git mv npm/omlx.js npm/omlx.mjs && git mv npm/omlx-resolve.js npm/omlx-resolve.mjs`.

---

## ADR Sentinel-блок замість JSON як транспорт для LLM-виводу резолву

## Context and Problem Statement
Потрібно було надійно витягувати резолвований текст файлу з відповіді omlx-моделі. Розглядалися `response_format: json_schema` (structured output) і raw-sentinel-блок (`<<<N7-RESOLVED` / `N7-RESOLVED>>>`). Живий тест виявив: `gemma-4` при JSON-транспорті правильно екранувала `"` і `\` у regex, але перетворювала справжні переноси рядків на літеральні `\n` — після JSON.parse вміст ставав **одним рядком** із `\n` всередині замість реальних переносів.

## Considered Options
* `response_format: json_schema` з полем `resolved`
* Sentinel-блок у plain-text відповіді
* JSON-масив рядків `{"lines": [...]}`

## Decision Outcome
Chosen option: "Sentinel-блок (`<<<N7-RESOLVED` / `N7-RESOLVED>>>`)", because нуль екранування — модель друкує код дослівно між маркерами; наш JS відкидає все поза ними. `json_schema` гарантує синтаксис JSON, але не коректне тіло коду при багаторядковому payload у маленьких моделей.

### Consequences
* Good, because transcript фіксує очікувану користь: sentinel-парсинг детермінований і не залежить від здатності моделі правильно екранувати переноси.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
`extractResolved()` у `npm/omlx.mjs`: витягує рядки між `<<<N7-RESOLVED` і `N7-RESOLVED>>>`, стрипає оточуючі code-fence (```). `guided_choice` / `guided_grammar_enabled` у live-тесті сервер проігнорував — constrained decoding у цьому білді omlx не enforced.

---

## ADR Pure-add семантика для валідаторів V5/V6 у omlx-резолвері

## Context and Problem Statement
При реалізації валідаторів Tier-3 резолву перший варіант V5/V6 вимагав, щоб «усі unique-рядки кожної сторони вціліли в результаті». Unit-тест одразу виявив проблему: канонічний коректний мердж (локальна сторона міняє `const port = 8080` → `const port = 3000 // override`) відхилявся V6, бо `port=8080` (ours-unique) відсутній у результаті — хоча це законна same-line-правка.

## Considered Options
* Наївний V5/V6: «усі unique мусять вціліти» (без виключень)
* Pure-add семантика: захищати лише рядки, що є **доповненням**, а не правкою аналогічного рядка іншої сторони
* Вимкнути V6 за замовч. через ризик хибних спрацювань

## Decision Outcome
Chosen option: "Pure-add семантика через `similarEdit()` (спільний префікс ≥ половини коротшого і ≥3 символи)", because дозволяє відрізнити «same-line-правку» (port=8080 → port=3000) від «pure-addition» (додавання нового рядка `const host = "0.0.0.0"`). V5 захищає ≥1 pure-add з кожної сторони, V6 (дефолт-увімкнений) захищає всі pure-adds — пара зайвих ретраїв прийнятна.

### Consequences
* Good, because transcript фіксує очікувану користь: live e2e-тест показав збереження `host` (pure-add origin-сторони) при одночасній заміні `port` (same-line, не відхиляється).
* Bad, because `similarEdit` — евристика; edge-cases на межі порогу можуть давати зайві ретраї для легітимних правок.

## More Information
`similarEdit(a, b)` і `pureAdds(added, otherAdded)` у `npm/omlx.mjs`. Ретрай-бюджет N=3 (env `N7MERGE_OMLX_RETRIES`); температура між спробами підвищується 0→0.3→0.6. Таргетований фідбек у ретраї: «missing from origin side: `const host…`». Тест-покриття у `npm/tests/omlx.test.mjs`.
