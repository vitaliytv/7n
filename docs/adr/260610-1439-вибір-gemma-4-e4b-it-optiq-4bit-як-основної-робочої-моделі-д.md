---
session: 989fe445-9e54-428a-ae7d-e9442ed36225
captured: 2026-06-10T14:39:10+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/989fe445-9e54-428a-ae7d-e9442ed36225.jsonl
---

## ADR Вибір gemma-4-e4b-it-OptiQ-4bit як основної робочої моделі для 16 GB Mac

## Context and Problem Statement
Потрібно обрати практичний локальний LLM для 16 GB Mac (omlx 0.4.3). На розгляді були варіанти Gemma 4 з різними розмірами та квантизаціями. Базова лінія — `rajaschitnis/gemma-4-12b-it-text-only-4bit-mlx`, яка вже стояла в omlx. Проведено порівняльне тестування на чотирьох задачах: UA history, missing dollar, sheep trap, RLE code.

## Considered Options
* `mlx-community/gemma-4-e4b-it-OptiQ-4bit` (4B, 7.5 GB)
* `rajaschitnis/gemma-4-12b-it-text-only-4bit-mlx` (12B text-only, 10.7 GB, з thinking-режимом)
* `mlx-community/gemma-4-12B-it-OptiQ-4bit` (12B, 8.3 GB)
* `mlx-community/gemma-4-12B-it-qat-4bit` (12B QAT, 10.2 GB)

## Decision Outcome
Chosen option: "`mlx-community/gemma-4-e4b-it-OptiQ-4bit`", because модель єдина пройшла 4/4 тестів (12B text-only — 3/4, провал на RLE через зависання у reasoning), показала ~2.8× вищу швидкість (28 tps vs 10 tps без chunked_prefill, 4.5 tps з ним) і не потребує обхідного `chunked_prefill` через memory ceiling.

### Consequences
* Good, because transcript фіксує очікувану користь: 4/4 unit tests pass для RLE, 28.17–28.84 tps, вільно поміщається в 16 GB unified RAM без chunked_prefill.
* Bad, because `rajaschitnis` 12B має thinking-режим, що може краще впоратися зі складними задачами — але у двох з двох спроб RLE він зависав у reasoning chain без виходу; 4B E4B не має цього механізму.

## More Information
Тести: `/tmp/omlx_ask.py`, валідація: `/tmp/rle_check.py`. Моделі в `~/.omlx/models/mlx-community/`. Налаштування omlx змінено: `memory_guard_tier=custom`, `memory_guard_custom_ceiling_gb=12`, `scheduler.chunked_prefill=true`, `auth.api_key="omlx-local-test-key"`. Бекап: `~/.omlx/settings.json.bak.1781072139`.

---

## ADR Підтримка gemma4_unified в mlx-lm: оновлення до HEAD замість пошуку workaround

## Context and Problem Statement
`mlx-community/gemma-4-12B-it-OptiQ-4bit` і `mlx-community/gemma-4-12B-it-qat-4bit` не завантажуються в omlx — обидві використовують архітектуру `gemma4_unified` (`Gemma4UnifiedForConditionalGeneration`). LLM-fallback в omlx кидає "Missing 711 parameters" через неправильний маппінг ключів ваг. Коміт `8239c72` в ml-explore/mlx-lm від 2026-06-05 оголошував фікс `gemma4_unified model type not supported`.

## Considered Options
* Оновити `mlx-lm` до HEAD через `pip install --force-reinstall mlx-lm@git+https://github.com/ml-explore/mlx-lm@main`
* Чекати QAT-4bit завершення і перевірити чи там інша ситуація
* Видалити обидві моделі і не намагатися запустити `gemma4_unified`

## Decision Outcome
Chosen option: "Оновити `mlx-lm` до HEAD", because користувач явно обрав цей варіант після отримання попередження про broken models і необхідність upstream fix.

### Consequences
* Good, because `mlx-lm 0.31.3 HEAD` встановлено, маппінг `"gemma4_unified": "gemma4"` в `utils.py:55` присутній, sanitize() у `gemma4.py` стрипає vision/audio ваги.
* Bad, because оновлення не вирішило проблему: `gemma4_unified` підтримана лише частково — маппінг архітектури є, але per-layer mixed-precision quant config (OptiQ/QAT) несумісний з `_quantize()` predicate. Обидва `mlx_lm.load()` і `mlx_vlm.load()` (v0.6.2) повертають "Missing 711 parameters". Крім того, auto-mode classifier заблокував `brew services restart omlx` — довелося вручну.

## More Information
Встановлено: `/opt/homebrew/opt/omlx/libexec/bin/pip install --upgrade --force-reinstall --no-deps "mlx-lm @ git+https://github.com/ml-explore/mlx-lm@main"`. Файл після інсталяції: `/opt/homebrew/Cellar/omlx/0.4.3/libexec/lib/python3.11/site-packages/mlx_lm/__init__.py` (mtime: Jun 10 13:54:38 2026). Діагностика: `gemma-4-e4b-it-OptiQ-4bit` (model_type: `gemma4`) завантажується успішно; `gemma-4-12B-it-OptiQ-4bit` (model_type: `gemma4_unified`, `text_config.model_type: gemma4_unified_text`) — ні.

---

## ADR Видалення непрацюючих gemma4_unified моделей з omlx

## Context and Problem Statement
Після підтвердженої несумісності `gemma4_unified` архітектури в `mlx-lm 0.31.3 HEAD` і `mlx-vlm 0.6.2` обидві завантажені моделі (`gemma-4-12B-it-OptiQ-4bit`, 4.6 GB; `gemma-4-12B-it-qat-4bit`, 4.1 GB partial) займали місце на диску без можливості запуску.

## Considered Options
* Видалити обидві моделі через admin API `DELETE /admin/api/hf/models/{model_name}`
* Залишити і чекати upstream fix

## Decision Outcome
Chosen option: "Видалити обидві моделі через admin API", because користувач запитав залишити тільки робочі моделі та видалити непрацюючі.

### Consequences
* Good, because transcript фіксує очікувану користь: звільнено ~8.7 GB, залишилися тільки три перевірені LLM + MarkItDown utility.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Команди: `DELETE http://127.0.0.1:8000/admin/api/hf/models/gemma-4-12B-it-OptiQ-4bit`, `DELETE http://127.0.0.1:8000/admin/api/hf/models/gemma-4-12B-it-qat-4bit`. Після видалення в omlx залишились: `gemma-4-e4b-it-OptiQ-4bit`, `rajaschitnis--gemma-4-12b-it-text-only-4bit-mlx`, `Qwen3-4B-Thinking-2507-4bit`, `MarkItDown`. Endpoint знайдено у `omlx/admin/routes.py:5005`.
