---
session: 989fe445-9e54-428a-ae7d-e9442ed36225
captured: 2026-06-10T15:54:47+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/989fe445-9e54-428a-ae7d-e9442ed36225.jsonl
---

## ADR Вибір `gemma-4-e4b-it-OptiQ-4bit` як основної локальної LLM на Mac з 16 GB RAM

## Context and Problem Statement
Потрібно визначити найкращу локальну LLM для Mac з 16 GB RAM на базі omlx 0.4.3. Кілька варіантів Gemma 4 і Qwen3 порівнювалися на практичних задачах: фактичне питання з UA-history, логічна пастка «missing dollar», просте числове питання про овець, та Python-код rle_encode.

## Considered Options
* `mlx-community/gemma-4-e4b-it-OptiQ-4bit` (4B, 7.52 GB, ~28 tps)
* `rajaschitnis/gemma-4-12b-it-text-only-4bit-mlx` (12B, 11 GB, ~10 tps)
* `mlx-community/Qwen3-4B-Thinking-2507-4bit` (4B, 2.3 GB, ~42 tps)
* `mlx-community/gemma-4-12B-it-OptiQ-4bit` та `gemma-4-12B-it-qat-4bit` (blocked)

## Decision Outcome
Chosen option: "`mlx-community/gemma-4-e4b-it-OptiQ-4bit`", because пройшла 4/4 тестів з коректними відповідями, вкладається в memory ceiling 12 GB, і має найкращу якість/швидкість серед реально працюючих варіантів.

### Consequences
* Good, because transcript фіксує очікувану користь: 4/4 тестів, ~28 tps, RAM-комфортний (7.52 GB фактично).
* Bad, because модель є формально multimodal (`Gemma4ForConditionalGeneration`), але фактично text-only — vision/audio ваги відсутні у safetensors (0 з 1355 ключів), тому vision-функціонал недоступний.

## More Information
* Файл: `~/.omlx/models/mlx-community/gemma-4-e4b-it-OptiQ-4bit/config.json` — `model_type: gemma4`, `hidden_size: 2560`, 42 layers, `max_model_len: 131072`
* Тест-скрипт: `/tmp/omlx_ask.py` через `http://127.0.0.1:8000/v1/chat/completions`
* Qwen3 зациклювався на українській; rajaschitnis 12B зависав у reasoning-циклі на code-задачах

---

## ADR Видалення `gemma4_unified` моделей через несумісність архітектури з omlx

## Context and Problem Statement
Завантажені `gemma-4-12B-it-OptiQ-4bit` і `gemma-4-12B-it-qat-4bit` не вантажаться в omlx 0.4.3: обидві мають архітектуру `Gemma4UnifiedForConditionalGeneration` (`model_type: gemma4_unified`). Сервер повертає `Internal server error` з логом "Missing 711 parameters: language_model.model.embed_tokens.*".

## Considered Options
* Видалити моделі і звільнити дисковий простір
* Чекати апстрім фіксу в omlx або mlx-lm/mlx-vlm
* Оновити mlx-lm до HEAD (було спробовано, не вирішило)

## Decision Outcome
Chosen option: "Видалити моделі", because обидві моделі займали ~8.7 GB диску і не давали жодної функціональності; проблема є upstream-рівня (omlx VLM→LLM fallback + per-layer quant pipeline), і час фіксу не визначений.

### Consequences
* Good, because transcript фіксує очікувану користь: ~8.7 GB звільнено (`DELETE /admin/api/hf/models/{model_id}` → `{"success":true}`).
* Bad, because якщо omlx отримає підтримку `gemma4_unified` у майбутньому, моделі доведеться завантажувати повторно.

## More Information
* Корінь помилки: `gemma4_unified` зберігає ваги з префіксом `language_model.model.*` у safetensors; mlx-lm `sanitize()` в `models/gemma4.py` додає цей префікс повторно → "Missing 711 parameters"
* `mlx-lm 0.31.3 HEAD` (коміт `8239c72` від 2026-06-05) додав маппінг `"gemma4_unified": "gemma4"` у `utils.py:55`, але не виправив per-layer quant predicate
* API видалення: `DELETE http://127.0.0.1:8000/admin/api/hf/models/{model_id}` (cookie-auth)
* `mlx-community/gemma-4-e4b-it-OptiQ-4bit` (4B) використовує `gemma4` (не `unified`) і завантажується без помилок

---

## ADR Оновлення mlx-lm до HEAD у brew-venv omlx для підтримки `gemma4_unified`

## Context and Problem Statement
`gemma-4-12B-it-OptiQ-4bit` (model_type: `gemma4_unified`) не завантажувалась в omlx — "Missing 711 parameters". Реліз mlx-lm 0.31.3 у brew-venv не містив маппінгу `gemma4_unified → gemma4`. Коміт `8239c72` (2026-06-05) в upstream HEAD додав цей маппінг.

## Considered Options
* Оновити mlx-lm до HEAD через `pip install --force-reinstall --no-deps "mlx-lm @ git+https://github.com/ml-explore/mlx-lm@main"` у brew-venv
* Чекати офіційного релізу mlx-lm з підтримкою `gemma4_unified`

## Decision Outcome
Chosen option: "Оновити mlx-lm до HEAD", because користувач явно авторизував цю дію після пояснення проблеми; HEAD вже містив потрібний коміт.

### Consequences
* Good, because маппінг `gemma4_unified → gemma4` у `utils.py:55` підтверджено встановленим (`mlx_lm.__file__` mtime Jun 10 13:54:38).
* Bad, because оновлення **не вирішило** проблему завантаження — per-layer mixed-precision quant pipeline для OptiQ-формату залишився несумісним; `mlx_lm.load()` і `mlx_vlm.load()` обидва повертають "Missing 711 parameters".

## More Information
* Команда встановлення: `/opt/homebrew/opt/omlx/libexec/bin/pip install --upgrade --force-reinstall --no-deps "mlx-lm @ git+https://github.com/ml-explore/mlx-lm@main"`
* Відкотити: `brew reinstall omlx`
* Встановлена версія: `mlx_lm 0.31.3` (HEAD), path: `/opt/homebrew/Cellar/omlx/0.4.3/libexec/lib/python3.11/site-packages/mlx_lm/`
* Сервіс рестартовано вручну (`brew services restart omlx`) після встановлення

---

## ADR Завантаження `gemma-4-e2b-it-4bit` як справжнього multimodal VLM

## Context and Problem Statement
З'ясувалося, що `gemma-4-e4b-it-OptiQ-4bit` є фактично text-only (0 vision/audio ваг у safetensors, незважаючи на `Gemma4ForConditionalGeneration` в config). Для реального multimodal тестування (текст + зображення) потрібна інша модель.

## Considered Options
* `mlx-community/gemma-4-e2b-it-4bit` (3.3 GB, converted via mlx-vlm)
* `mlx-community/gemma-4-E2B-it-qat-4bit` (пошук показав наявність варіанту)
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "`mlx-community/gemma-4-e2b-it-4bit`", because model card підтверджує конвертацію через `mlx-vlm` з `google/gemma-4-e2b-it`, що гарантує наявність vision ваг; 3.3 GB вміщується в бюджет RAM.

### Consequences
* Good, because transcript фіксує очікувану користь: модель є справжнім VLM (конвертований через mlx-vlm), на відміну від e4b-OptiQ.
* Bad, because Neutral, because transcript не містить підтвердження наслідку — завантаження не завершилося в межах транскрипту (зупинено на 99%).

## More Information
* Endpoint для завантаження: `POST http://127.0.0.1:8000/admin/api/hf/download` з `{"repo_id":"mlx-community/gemma-4-e2b-it-4bit"}`
* Task ID: `a70b7946-0ae1-4f71-a110-6f0d9a1bae4a`
* HF швидкість під час завантаження варіювалась: 0.7–4.7 MB/s (rate limiting)
* Пошук виконано через `GET http://127.0.0.1:8000/admin/api/hf/search?q=gemma-4-e2b-it`
