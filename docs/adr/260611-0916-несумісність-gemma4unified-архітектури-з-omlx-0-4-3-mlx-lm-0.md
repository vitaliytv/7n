---
session: 989fe445-9e54-428a-ae7d-e9442ed36225
captured: 2026-06-11T09:16:33+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/989fe445-9e54-428a-ae7d-e9442ed36225.jsonl
---

## ADR Несумісність `gemma4_unified`-архітектури з omlx 0.4.3 + mlx-lm 0.31.3

## Context and Problem Statement
Дві моделі `mlx-community/gemma-4-12B-it-OptiQ-4bit` та `mlx-community/gemma-4-12B-it-qat-4bit` з архітектурою `Gemma4UnifiedForConditionalGeneration` (`model_type: gemma4_unified`) не вантажились в omlx 0.4.3 — обидва завантажувачі (mlx-vlm 0.6.2 та mlx-lm LLM-fallback) видавали `ValueError: Missing 711 parameters`. Потрібно було встановити причину і вирішити, що робити з цими моделями.

## Considered Options
* Залишити моделі та чекати апстрім-фіксу
* Видалити непрацюючі моделі з omlx і звільнити диск

## Decision Outcome
Chosen option: "Видалити непрацюючі моделі", because коміт `8239c72` у mlx-lm додав маппінг `gemma4_unified → gemma4`, але не повну підтримку per-layer mixed-precision quantization: `_quantize()` predicate не збігається зі структурою ключів у форматі `language_model.model.*` з OptiQ/QAT білдів. Пряме тестування через `mlx_lm.load()` і `mlx_vlm.load()` підтвердило ту саму помилку. Видалення через `DELETE /admin/api/hf/models/{model_name}` звільнило ~8.7 GB.

### Consequences
* Good, because transcript фіксує очікувану користь: звільнено ~8.7 GB (gemma-4-12B-it-OptiQ-4bit + gemma-4-12B-it-qat-4bit), усунуто фантомні записи в пулі omlx.
* Bad, because 12B-моделі тимчасово недоступні до появи повноцінної підтримки `gemma4_unified` quantization у mlx-lm або mlx-vlm.

## More Information
Підтверджені факти з transcript:
- `gemma-4-e4b-it-OptiQ-4bit` (model_type: `gemma4`) вантажиться успішно; `gemma-4-12B-it-OptiQ-4bit` (model_type: `gemma4_unified`) — ні.
- Усі 1324 ключі у safetensors для 12B-OptiQ мають префікс `language_model.model.*`; у 4B-OptiQ (1355 ключів) — аналогічно, але модель `gemma4` (не `unified`), тому sanitize() спрацьовує коректно.
- Команда видалення: `curl -X DELETE http://127.0.0.1:8000/admin/api/hf/models/gemma-4-12B-it-OptiQ-4bit`.
- Коміт mlx-lm з частковим фіксом: `8239c72` (2026-06-05), файл `/Applications/oMLX.app/.../mlx_lm/utils.py` рядок 55: `"gemma4_unified": "gemma4"`.

---

## ADR Вибір шляху оновлення omlx 0.4.3 → 0.4.4.dev1 через DMG

## Context and Problem Statement
omlx 0.4.3 завантажує `gemma-4-e2b-it-4bit` (справжній VLM) як LLM-fallback, ігноруючи vision-ваги — через несумісність mlx-vlm 0.6.2 з форматом shared-KV/load у Gemma 4. У 0.4.4.dev1 mlx-vlm оновлено до коміту `c9a6743` із фіксами для Gemma4.

## Considered Options
* `brew install --HEAD jundot/omlx/omlx` (потребує `brew uninstall` + rebuild)
* Встановити `.dmg` 0.4.4.dev1 з GitHub releases

## Decision Outcome
Chosen option: "DMG `v0.4.4.dev1`", because user обрав цей шлях явно; після встановлення `oMLX.app` запускається автономно без brew-сервісу, а `engine_type` для `gemma-4-e4b-it-OptiQ-4bit` після оновлення показує `vlm` замість LLM-fallback.

### Consequences
* Good, because transcript фіксує очікувану користь: `gemma-4-e4b-it-OptiQ-4bit` тепер вантажиться як `vlm` (engine_type: vlm, 7.44 GB у RAM).
* Bad, because ручний mlx-lm HEAD-апгрейд (зроблений раніше через brew-venv) перетертий пінами з 0.4.4.dev1 — `pyproject.toml` 0.4.4.dev1 фіксує mlx-lm на коміті `39c4019f67402c6448eba0d789b5d834460046dd`.

## More Information
- Реліз: `https://github.com/jundot/omlx/releases/tag/v0.4.4.dev1`, дата: 2026-06-10.
- Залежність у `pyproject.toml`: `mlx-lm @ git+https://github.com/ml-explore/mlx-lm@39c4019f...`.
- Шлях до ресурсів app: `/Applications/oMLX.app/Contents/Resources/omlx/`.
- Після видалення brew omlx: порт 8000 вільний, LaunchAgent відсутній; `~/.omlx/` та моделі збереглися.

---

## ADR Вибір `gemma-4-e4b-it-OptiQ-4bit` як default+pinned моделі в omlx

## Context and Problem Statement
Після очистки репозиторію моделей залишилось чотири варіанти для щоденного використання в omlx. Потрібно визначити, яка модель буде завантажена за замовчуванням і не вивантажуватиметься з RAM.

## Considered Options
* `gemma-4-e4b-it-OptiQ-4bit` (4B, 7.44 GB, text-only факт., 28 tps)
* `rajaschitnis/gemma-4-12b-it-text-only-4bit-mlx` (12B, 10 GB, ~10 tps, thinking)
* `Qwen3-4B-Thinking-2507-4bit` (4B, 2.1 GB, 42 tps, 262k ctx)
* `gemma-4-e2b-it-4bit` (2B, 4.0 GB, VLM)

## Decision Outcome
Chosen option: "`gemma-4-e4b-it-OptiQ-4bit`", because user явно обрав цю модель; вона пройшла 4/4 тестів у попередній сесії, завантажується як VLM на 0.4.4.dev1, і є найбалансованішою за якість/швидкість для 16 GB Mac.

### Consequences
* Good, because transcript фіксує: `is_default=True, pinned=True, loaded=True`, smoke-тести повернули "9" і "Київ", cold-load 9с.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- API-виклик: `PUT /admin/api/models/gemma-4-e4b-it-OptiQ-4bit/settings` з `{"is_default": true, "is_pinned": true}`.
- Force-load: `POST /admin/api/models/gemma-4-e4b-it-OptiQ-4bit/load`.
- Smoke-тест: `GET /v1/chat/completions` з `model: gemma-4-e4b-it-OptiQ-4bit`, max_tokens=200, temperature=0.

---

## ADR Несумісність `gpt-oss-20b-tq3` з omlx через відсутність підтримки TurboQuant-ваг

## Context and Problem Statement
Модель `manjunathshiva/gpt-oss-20b-tq3` (9.3 GB, arch `GptOssForCausalLM`) виявилась у `~/.omlx/models/` та зареєстрована в пулі omlx. При першому ж запиті omlx повернув 500 Internal Server Error. Потрібно діагностувати причину.

## Considered Options
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Модель залишена, але не використовується", because transcript обрізається на читанні `engine_core.py` / `model_loading.py`. Причина відмови встановлена з логу сервера: `KeyError: 'turboquant'` при ініціалізації engine_core — omlx 0.4.4.dev1 підтримує `turboquant_kv` для KV-cache, але не завантаження ваг у TurboQuant-3bit форматі (поле `turboquant` відсутнє у очікуваній схемі конфіга).

### Consequences
* Good, because Neutral, because transcript не містить підтвердження наслідку — рішення щодо моделі (видалити / чекати фікс) не зафіксовано.
* Bad, because 9.3 GB займають місце в `~/.omlx/models/manjunathshiva/` без можливості використання.

## More Information
- Лог: `~/.omlx/logs/server.log` — `KeyError: 'turboquant'` при `POST /v1/chat/completions`.
- Модель: `GptOssForCausalLM`, `model_type: gpt_oss`, `hidden_size: 2880`.
- omlx має TurboQuant лише для KV-cache: `/Applications/oMLX.app/Contents/Resources/omlx/turboquant_kv.py`, `patches/turboquant_attention.py`.
- `maybe_load_custom_quantization()` знаходиться у `/Applications/oMLX.app/Contents/Resources/omlx/utils/model_loading.py:474`.
