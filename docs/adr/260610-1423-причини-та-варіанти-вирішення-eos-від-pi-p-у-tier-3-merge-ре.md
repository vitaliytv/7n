---
session: b4042850-5fb6-46be-b215-1477180bcdb6
captured: 2026-06-10T14:23:41+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/b4042850-5fb6-46be-b215-1477180bcdb6.jsonl
---

Тепер маю повну картину. Поговоримо без коду.

## Чому `pi -p` повертає `<eos>`

`<eos>` — це буквально **end-of-sequence токен** Gemma, який просочився у вивід як текст. Це означає, що модель **згенерувала його першим токеном** — тобто вирішила одразу завершити відповідь, не сказавши нічого.

Є три ймовірних причини, і вони утворюють стек:

### Причина 1 (найімовірніша): відсутність API-ключа у `pi`
Сервер omlx зараз вимагає `Authorization: Bearer omlx-local-test-key` (ти сам налаштував це за ADR від сьогодні). `pi` — це Node.js-агент (`@earendil-works/pi-coding-agent` v0.78.1), і він майже напевно **не знає про цей ключ**. Без ключа сервер повертає `401 Unauthorized`. А `pi` у такому разі або мовчки падає, або повертає `<eos>` як sentinel-значення помилки.

Підтвердження: перевіривши `curl` без ключа → `{"error": "API key required"}`.

### Причина 2: відсутній chat-template у `-p` режимі
`pi -p` — stdin-pipe режим, де `pi` бере raw stdin і кидає в модель. Gemma-chat моделі очікують **обгортку з chat template**:
```
<start_of_turn>user
...конфліктний файл...
<end_of_turn>
<start_of_turn>model
```
Якщо `pi -p` надсилає «голий» текст без template → модель бачить out-of-distribution вхід → одразу генерує `<eos>`. Саме це видно у `settings.local.json` з попередньої сесії: vanilla 12B та `pi` → `<eos>` тричі підряд.

### Причина 3 (можлива додатково): завантажена не та модель
Зараз `e4b-OptiQ-4bit` **не завантажується** (memory ceiling 11.84 GB, модель потребує 12.75 GB) — що підтверджує API. Тобто `pi` навіть якщо і надішле запит із ключем, отримає `server_error`. Що зараз завантажено? Мабуть `Qwen3-4B-Thinking-2507-4bit` — він і відповів на тестовий `curl` вище.

## Чи можна виправити?

**Так, але ціна залежить від того, де fix:**

| Варіант | Що дає | Ціна |
|---|---|---|
| Передати `pi` API-ключ (env-змінна або конфіг) | Зникає причина 1 | Треба знати де `pi` зберігає конфіг; часто — `~/.config/pi/config.json` або env `OMLX_API_KEY` |
| Прямий HTTP з JS (замість `pi`) | Закриває **всі три причини**: сам формуємо chat template, сам передаємо ключ, сам обробляємо порожню відповідь | Це і є "замінити на omlx + JS-цикл" |
| Вимкнути API-ключ у omlx (`auth.api_key: null`) | Причина 1 зникає без конфігурування `pi` | Знижує безпеку, якщо omlx доступний не тільки localhost |

**Найшвидший fix**: перевірити, чи є у `pi` змінна оточення для API-ключа, і виставити її. Якщо `pi` її підтримує — причина 1 закрита, і можна перевірити чи `<eos>` зникає. Якщо причина 2 (chat template) теж є — тоді без JS-контролю не обійтись.

Хочеш спершу перевірити `pi --help` / `pi config` на предмет API-ключа — чи одразу переходимо до концепції JS-циклу?

---

Тепер у мене є матеріал для ADR-чернетки, що тут відбувається. Зафіксую перед продовженням?

## ADR Причини та варіанти вирішення `<eos>` від `pi -p` у Tier-3 merge-резолверу

## Context and Problem Statement
`_n7merge_delta` у `npm/merge.js` використовує `pi -p` як перший LLM-агент у Tier 3 для розв'язання merge-конфліктів через stdin. У реальному run `pull` оголосило «🤖 Коментар LLM (thinking): `<eos>`» і не прибрало маркери — модель згенерувала token `<eos>` як першу (і єдину) відповідь.

## Considered Options
* Передати `pi` API-ключ omlx через env-змінну або конфіг
* Вимкнути `auth.api_key` в omlx (`null`) для localhost-only сервера
* Замінити `pi -p` прямим HTTP-викликом з JS із повним контролем chat-template, ключа і retry-логіки

## Decision Outcome
Chosen option: "обговорення — рішення не прийнято", because на момент transcript рішення не зафіксовано; користувач хоче спершу зрозуміти причину.

### Consequences
* Good, because transcript фіксує очікувану користь: три конкретні гіпотези ідентифіковано (відсутній API-ключ, відсутній chat-template, неактивна модель).
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- omlx API endpoint: `http://127.0.0.1:8000/v1/chat/completions`, вимагає `Authorization: Bearer omlx-local-test-key`
- `pi` binary: `/opt/homebrew/bin/pi` v0.78.1 (`@earendil-works/pi-coding-agent`)
- Зараз завантажена `Qwen3-4B-Thinking-2507-4bit`; `gemma-4-e4b-it-OptiQ-4bit` не завантажується через memory ceiling 11.84 GB (модель потребує 12.75 GB)
- Chat template Gemma: `<start_of_turn>user\n...<end_of_turn>\n<start_of_turn>model\n`
