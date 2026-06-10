---
session: 989fe445-9e54-428a-ae7d-e9442ed36225
captured: 2026-06-10T14:54:19+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/989fe445-9e54-428a-ae7d-e9442ed36225.jsonl
---

## ADR Вибір gemma-4-e4b-it-OptiQ-4bit як основної робочої моделі на 16 GB Mac

## Context and Problem Statement
На Mac з 16 GB unified memory порівнювались кілька 4-bit варіантів Gemma 4 за якістю та швидкістю на чотирьох тестах: UA history, missing dollar, sheep trap, RLE code. Потрібно було визначити найкращу модель для повсякденного використання в omlx 0.4.3.

## Considered Options
* `mlx-community/gemma-4-e4b-it-OptiQ-4bit` (7.5 GB, ~28 tps)
* `rajaschitnis/gemma-4-12b-it-text-only-4bit-mlx` (10.7 GB, ~10 tps / 4.5 tps з chunked_prefill)
* `mlx-community/Qwen3-4B-Thinking-2507-4bit` (2.3 GB, ~42 tps)

## Decision Outcome
Chosen option: "`mlx-community/gemma-4-e4b-it-OptiQ-4bit`", because єдина модель з 4/4 тестів: правильна UA-відповідь, пояснення missing dollar, sheep trap = 9, RLE-код пройшов 6/6 unit tests. 12B-rajaschitnis двічі зависає у reasoning на code-задачах (RLE не завершився при 2500 max_tokens). Qwen3 зациклює відповідь на українській мові.

### Consequences
* Good, because 28 tps (2.8× швидше за 12B без chunked_prefill, 6× швидше з chunked_prefill), вільно міститься в 16 GB без memory ceiling проблем.
* Bad, because модель формально `Gemma4ForConditionalGeneration` з vision/audio конфігом, але у safetensors **0** відповідних ваг — фактично text-only; для справжнього multimodal потрібна окрема модель.

## More Information
Тест RLE верифікований: `/tmp/rle_check.py` та `/tmp/rle_qwen.py`, 6/6 assert-ів. Benchmark: `finish=stop`, UA history `in=54 out=67 wall=36.48s` (перший cold load включно), missing dollar `28.84 tps`, sheep trap `0.33s / 1 token`. Конфіг моделі: `hidden_size=2560`, 42 layers, ctx 131072. Оновлення `~/.omlx/settings.json`: `memory_guard_tier=custom`, `memory_guard_custom_ceiling_gb=12`, `chunked_prefill=true`, `auth.api_key="omlx-local-test-key"`.

---

## ADR Видалення несумісних gemma4_unified моделей з omlx

## Context and Problem Statement
`mlx-community/gemma-4-12B-it-OptiQ-4bit` та `mlx-community/gemma-4-12B-it-qat-4bit` — обидві мають `architectures: ["Gemma4UnifiedForConditionalGeneration"]` і `model_type: gemma4_unified`. При спробі завантажити через omlx та напряму через `mlx_lm.load()` повертається `Missing 711 parameters` (увесь `language_model.model.*` простір відсутній у результаті завантаження).

## Considered Options
* Видалити моделі з диску через `DELETE /admin/api/hf/models/{model_name}` і чекати upstream-фіксу
* Залишити моделі, використовувати після появи підтримки

## Decision Outcome
Chosen option: "Видалити моделі з диску", because обидві не завантажуються ані через mlx-lm, ані через mlx-vlm 0.6.2, займаючи ~8.7 GB. Баг підтверджений як upstream: коміт `8239c72` (mlx-lm, 5 червня 2026) додає лише маппінг `gemma4_unified → gemma4` у `MODEL_REMAPPING`, але pipeline `sanitize()` + `_quantize()` не обробляє per-layer mixed-precision quant config OptiQ-формату — weights залишаються під ключами `language_model.model.*`, які модель не очікує.

### Consequences
* Good, because звільнено ~8.7 GB (4.6 GB + 4.1 GB partial download); список моделей в omlx стає актуальним.
* Bad, because transcript не містить підтверджених негативних наслідків (моделі виявились нефункціональними до видалення).

## More Information
Перевірка: `mlx_lm.__version__ = 0.31.3` (HEAD), `mlx_vlm.__version__ = 0.6.2`. Пряме завантаження через `mlx_lm.load('/Users/vitalii/.omlx/models/mlx-community/gemma-4-12B-it-OptiQ-4bit')` → `ValueError: Missing 711 parameters`. E4B (4B) завантажується успішно (`LOAD: ✅ OK`) — архітектура `gemma4` (не `unified`), vision/audio ваг у safetensors = 0. Ендпоінт для видалення: `DELETE /admin/api/hf/models/{model_name}` (omlx admin API).

---

## ADR Оновлення mlx-lm до HEAD у brew-venv omlx для підтримки gemma4_unified

## Context and Problem Statement
`mlx-community/gemma-4-12B-it-OptiQ-4bit` не завантажувалась — підозра, що пінована версія mlx-lm у brew omlx 0.4.3 не має підтримки `gemma4_unified`. Коміт `8239c72` (5 червня 2026) в mlx-lm репозиторії описаний як "Fix gemma4_unified model type not supported (#1349)".

## Considered Options
* Оновити mlx-lm до HEAD (`pip install --upgrade --force-reinstall --no-deps "mlx-lm @ git+https://github.com/ml-explore/mlx-lm@main"`) у brew-venv
* Чекати офіційного релізу omlx з оновленою mlx-lm

## Decision Outcome
Chosen option: "Оновити mlx-lm до HEAD", because користувач явно авторизував дію ("Дозволити mlx-lm HEAD") після пояснення ризиків. Встановлено `mlx-lm 0.31.3` з HEAD у `/opt/homebrew/Cellar/omlx/0.4.3/libexec/lib/python3.11/site-packages/`.

### Consequences
* Good, because маппінг `gemma4_unified → gemma4` та `sanitize()` з фільтрацією vision/audio ваг тепер присутні у встановленій версії.
* Bad, because оновлення виявилось **недостатнім**: `mlx_lm.load()` і `mlx_vlm.load()` однаково повертають `Missing 711 parameters` для OptiQ-12B — коміт `8239c72` фіксує лише детектування архітектури, але не per-layer mixed-precision quant pipeline. Відкочування: `brew reinstall omlx`.

## More Information
Команда: `PIP=/opt/homebrew/opt/omlx/libexec/bin/pip && $PIP install --upgrade --force-reinstall --no-deps "mlx-lm @ git+https://github.com/ml-explore/mlx-lm@main"`. Результат білду: `mlx_lm-0.31.3-py3-none-any.whl`. Файл: `/opt/homebrew/Cellar/omlx/0.4.3/libexec/lib/python3.11/site-packages/mlx_lm/models/gemma4.py` — `sanitize()` рядок 55; `utils.py` рядок 55: `"gemma4_unified": "gemma4"`.

---

## ADR Вибір gemma-4-e2b-it-4bit для тестування справжнього multimodal

## Context and Problem Statement
`gemma-4-e4b-it-OptiQ-4bit` (4B) формально має vision/audio конфіг, але є фактично text-only — жодних vision/audio ваг у safetensors. Для повноцінного multimodal (текст + зображення) потрібна окрема модель.

## Considered Options
* `mlx-community/gemma-4-e2b-it-4bit` (3.3 GB, конвертована mlx-vlm, 2B effective)
* `mlx-community/gemma-4-E2B-it-qat-4bit` (також знайдена у пошуку)
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "`mlx-community/gemma-4-e2b-it-4bit`", because це найпопулярніший варіант (67 755 завантажень, 17 likes) серед E2B результатів пошуку; model card підтверджує конвертацію через mlx-vlm з `google/gemma-4-e2b-it`.

### Consequences
* Good, because transcript фіксує очікувану користь: модель convertована через mlx-vlm і зберігає vision/audio ваги (підтверджено model card), тобто є справжнім VLM на відміну від E4B.
* Bad, because HF rate-limit дає лише 0.7–1.6 MB/s на момент завантаження (ETA ~80 хв); transcript не містить підтверджених негативних наслідків щодо якості моделі.

## More Information
HF task ID: `d2a9bec8-d254-4f68-b3d3-953997bda29d`. Розмір: 3.61 GB (фактичний download). Швидкість: 0.70 MB/s при 8.7% прогресу. Пошук виконано через `GET /admin/api/hf/search?q=gemma-4-e2b-it&limit=15` в omlx admin API.
