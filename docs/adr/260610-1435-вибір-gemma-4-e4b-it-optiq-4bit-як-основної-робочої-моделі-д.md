---
session: 989fe445-9e54-428a-ae7d-e9442ed36225
captured: 2026-06-10T14:35:20+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/989fe445-9e54-428a-ae7d-e9442ed36225.jsonl
---

## ADR Вибір gemma-4-e4b-it-OptiQ-4bit як основної робочої моделі для 16 GB Mac

## Context and Problem Statement
Потрібно обрати оптимальну локальну LLM для Mac із 16 GB unified memory в omlx 0.4.3. Порівнювались кілька варіантів Gemma 4 (4B E4B-OptiQ, 12B text-only, 12B OptiQ, 12B QAT) та Qwen3-4B-Thinking за однаковими чотирма тестами: UA history, missing dollar, sheep trap, RLE code.

## Considered Options
* `mlx-community/gemma-4-e4b-it-OptiQ-4bit` (4B, 7.5 GB)
* `rajaschitnis/gemma-4-12b-it-text-only-4bit-mlx` (12B text-only, 10.7 GB)
* `mlx-community/Qwen3-4B-Thinking-2507-4bit` (~2.5 GB)
* `mlx-community/gemma-4-12B-it-OptiQ-4bit` (8.3 GB, blocked)
* `mlx-community/gemma-4-12B-it-qat-4bit` (10.2 GB, blocked)

## Decision Outcome
Chosen option: "`mlx-community/gemma-4-e4b-it-OptiQ-4bit`", because це єдина модель, що набрала 4/4 тестів, комфортно поміщається у 16 GB (7.5 GB на диску, ~7.78 GB RAM), і є найшвидшою серед протестованих — ~28 tps, тоді як 12B text-only дає 10 tps без chunked_prefill або 4.5 tps з ним.

### Consequences
* Good, because transcript фіксує очікувану користь: 4/4 тестів пройшли, 6/6 RLE unit-tests pass, 28 tps vs ≤10 tps у 12B.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Тести: UA history (1654, відповідь правильна), missing dollar (бездоганне пояснення з LaTeX), sheep trap (9, 1 токен / 0.33 с), RLE Python (чистий код, edge case, без markdown fences). Модель: `arch: Gemma4ForConditionalGeneration`, `model_type: gemma4`, 42 шари, hidden 2560, ctx 131072, 4-bit quant, 7.52 GB. Тестовий harness: `/tmp/omlx_ask.py`, endpoint `http://127.0.0.1:8000/v1/chat/completions`, auth `Bearer omlx-local-test-key`.

---

## ADR Несумісність gemma4_unified із omlx: видалення 12B OptiQ та QAT

## Context and Problem Statement
`mlx-community/gemma-4-12B-it-OptiQ-4bit` та `mlx-community/gemma-4-12B-it-qat-4bit` зареєстровані в omlx, але не завантажуються, займаючи 8.3 GB + 10.2 GB диску. Потрібно встановити причину і вирішити, що з ними робити.

## Considered Options
* Видалити обидві моделі через `DELETE /admin/api/hf/models/{model_name}`
* Чекати апстрім-фікс (не видаляти)
* Оновити mlx-lm до HEAD

## Decision Outcome
Chosen option: "Видалити обидві моделі", because після оновлення mlx-lm до HEAD 0.31.3 обидві моделі однаково падають з "Missing 711 parameters" — підтримка `gemma4_unified` у HEAD є лише частковою (маппінг архітектури є, але повний quant-пайплайн для per-layer mixed-precision не реалізований). `mlx_vlm.load()` v0.6.2 так само провалюється.

### Consequences
* Good, because transcript фіксує очікувану користь: звільнено ~18.5 GB диску, список моделей в omlx очищений від нефункціональних записів.
* Bad, because моделі 12B більшої якості недоступні до апстрім-фіксу в mlx-lm / mlx-vlm.

## More Information
Діагностика: `gemma-4-12B-it-OptiQ-4bit` → `model_type: gemma4_unified`, keys у файлах мають префікс `language_model.model.*`, але при завантаженні через `mlx_lm.load()` / `mlx_vlm.load()` падає "Missing 711 parameters". `gemma-4-12B-it-qat-4bit` → та сама архітектура, додатково містить 17 vision/audio ключів (`embed_audio.*`, `embed_vision.*`). PR `8239c72` (2026-06-05) у mlx-lm додав маппінг `"gemma4_unified": "gemma4"` в `MODEL_REMAPPING`, але не вирішив quantization predicate mismatch. Видалення: `DELETE http://127.0.0.1:8000/admin/api/hf/models/gemma-4-12B-it-OptiQ-4bit` та аналогічно для qat-4bit.

---

## ADR Оновлення mlx-lm до HEAD у brew-venv omlx

## Context and Problem Statement
omlx 0.4.3 містить pinned mlx-lm, що не підтримує `gemma4_unified`. PR у mlx-lm від 2026-06-05 (коміт `8239c72`) заявляє підтримку цієї архітектури. Потрібно вирішити, чи оновлювати mlx-lm у brew-venv.

## Considered Options
* Встановити mlx-lm HEAD (`pip install --force-reinstall --no-deps mlx-lm @ git+https://github.com/ml-explore/mlx-lm@main`)
* Чекати офіційного релізу omlx з новим mlx-lm
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Встановити mlx-lm HEAD", because користувач явно авторизував оновлення після блоку auto-mode classifier.

### Consequences
* Good, because transcript фіксує очікувану користь: встановлено mlx-lm 0.31.3 HEAD, `mtime Jun 10 13:54:38 2026`; `gemma-4-e4b-it-OptiQ-4bit` продовжує коректно завантажуватись.
* Bad, because `gemma4_unified` все одно не запрацювала — PR `8239c72` вирішує лише виявлення архітектури, а не завантаження ваг із per-layer quant config. Відкат: `brew reinstall omlx`.

## More Information
Команда: `/opt/homebrew/opt/omlx/libexec/bin/pip install --upgrade --force-reinstall --no-deps "mlx-lm @ git+https://github.com/ml-explore/mlx-lm@main"`. Результат: `mlx_lm-0.31.3-py3-none-any.whl`, шлях `/opt/homebrew/Cellar/omlx/0.4.3/libexec/lib/python3.11/site-packages/mlx_lm/`. `brew services restart omlx` виконаний вручну користувачем після блоку auto-mode.

---

## ADR Додавання Bearer-авторизації до harness-скрипта /tmp/omlx_ask.py

## Context and Problem Statement
omlx-сервер повернув `{"error":{"message":"API key required"}}` при зверненні до `/v1/chat/completions` без заголовку авторизації — вимога API-key була додана в конфіг сесії раніше (`auth.api_key: "omlx-local-test-key"`), але harness-скрипт цього не враховував.

## Considered Options
* Додати `-H "Authorization: Bearer omlx-local-test-key"` до `curl`-виклику в `/tmp/omlx_ask.py`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Додати Bearer-заголовок до curl-виклику", because це пряме виправлення відповідності між конфігом сервера і harness-скриптом.

### Consequences
* Good, because transcript фіксує очікувану користь: всі наступні тести успішно отримали відповіді від моделей.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Файл: `/tmp/omlx_ask.py`. Змінений рядок `subprocess.run(["curl", "-sS", URL, "-H", "Content-Type: application/json", "-d", body, ...])` — додано `-H "Authorization: Bearer omlx-local-test-key"`. Endpoint: `http://127.0.0.1:8000/v1/chat/completions`. Конфіг сервера: `~/.omlx/settings.json` → `auth.api_key: "omlx-local-test-key"`.
