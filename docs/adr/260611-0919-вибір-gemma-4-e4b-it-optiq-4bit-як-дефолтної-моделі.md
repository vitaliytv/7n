---
session: 989fe445-9e54-428a-ae7d-e9442ed36225
captured: 2026-06-11T09:19:37+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/989fe445-9e54-428a-ae7d-e9442ed36225.jsonl
---

## ADR Вибір gemma-4-e4b-it-OptiQ-4bit як дефолтної моделі

## Context and Problem Statement
На 16 GB Mac потрібно вибрати одну завжди завантажену модель для повсякденного використання. Кілька 12B варіантів (OptiQ-4bit, qat-4bit) виявились непрацездатними в omlx; залишились три робочих претенденти різного розміру та якості.

## Considered Options
* `gemma-4-e4b-it-OptiQ-4bit` (4B effective, 7.44 GB, 28 tps, 4/4 тестів)
* `rajaschitnis/gemma-4-12b-it-text-only-4bit-mlx` (12B, 11 GB, 10 tps, thinking-режим зациклюється на code-задачах)
* `Qwen3-4B-Thinking-2507-4bit` (4B, 2.3 GB, 42 tps, зациклюється на українській мові)

## Decision Outcome
Chosen option: "`gemma-4-e4b-it-OptiQ-4bit`", because вона пройшла 4/4 тестів, дає 28 tps, займає 7.44 GB (вміщається в Metal cap ~12 GB з запасом 4.56 GB), і на ній не виявлено зациклювань на типових задачах.

### Consequences
* Good, because transcript фіксує очікувану користь: модель завантажується без swap, тести пройдено, headroom 4.56 GB достатній для фонових процесів.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Виставлено через `PUT /admin/api/models/gemma-4-e4b-it-OptiQ-4bit/settings` з `{"is_default": true, "is_pinned": true}`; підтверджено `POST /admin/api/models/gemma-4-e4b-it-OptiQ-4bit/load` → `engine_type: vlm`, `actual_size_formatted: 7.44 GB`. Конфіг: `architectures: ["Gemma4ForConditionalGeneration"]`, `hidden_size: 2560`, 42 layers, ctx 131k. Vision/audio ваги у safetensors відсутні — де-факто text-only.

---

## ADR Оновлення omlx 0.4.3 → 0.4.4.dev1 через .dmg

## Context and Problem Statement
omlx 0.4.3 (brew) не вантажить `mlx-community/gemma-4-e2b-it-4bit` як VLM: mlx-vlm 0.6.2 кидає `Missing keys` в layers 15-34 (спільні KV-проекції Gemma 4 E2B). Потрібна нова версія зі свіжішим mlx-vlm-пінком.

## Considered Options
* Оновити omlx до 0.4.4.dev1 через `.dmg` з GitHub Releases
* Оновити mlx-vlm вручну через pip у brew-venv (спроба вже робилась: mlx-vlm 0.6.2 — та сама помилка)
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Оновлення через .dmg (`v0.4.4.dev1`)", because brew-version mlx-vlm (0.6.2) не підтримує shared-KV формат E2B, а 0.4.4.dev1 пакує mlx-vlm з коміту `c9a6743` із фіксом Gemma 4 shared-KV/load.

### Consequences
* Good, because transcript фіксує очікувану користь: після встановлення 0.4.4.dev1 `gemma-4-e4b-it-OptiQ-4bit` завантажилась як `engine_type: vlm` (а не LLM-fallback як в 0.4.3).
* Bad, because ручне підняття mlx-lm до HEAD з попередньої сесії було перезаписане — 0.4.4.dev1 тримає власний пін (`mlx-lm @ git+…@39c4019f`).

## More Information
Файл: `jundot/omlx/releases/tag/v0.4.4.dev1`. В `pyproject.toml` тієї версії: `"mlx-lm @ git+https://github.com/ml-explore/mlx-lm@39c4019f…"` та mlx-vlm-пін з коментарем "includes Gemma4 shared-KV/load fixes". Попередній brew-venv видалено командою `brew uninstall omlx`. Сервер сам більше не запускається через brew-сервіс — тільки через `.app`.

---

## ADR Відмова від gpt-oss-20b на 16 GB Mac без підняття Metal cap

## Context and Problem Statement
Модель `gpt-oss-20b-tq3` (9.3 GB на диску) дала `Internal server error` при завантаженні; user хотів зрозуміти чи є робочий варіант gpt-oss-20b в рамках наявної пам'яті.

## Considered Options
* `mlx-community/gpt-oss-20b-MXFP4-Q8` (11.8 GB) — стандартний формат
* `InferenceIllusionist/gpt-oss-20b-MLX-4bit` (11.0 GB) — 4-bit affine
* Підняти Metal cap через `sudo sysctl iogpu.wired_limit_mb=14336` і тоді завантажити одну з моделей
* Залишити як є (без gpt-oss-20b)

## Decision Outcome
Chosen option: "Залишити як є (без gpt-oss-20b)", because мінімальний розмір будь-якого gpt-oss-20b — 11 GB, що перевищує дефолтний Metal cap (~12 GB) без достатнього headroom; підняття cap до 14 GB залишало б лише ~2 GB на ОС.

### Consequences
* Good, because transcript фіксує очікувану користь: e4b залишається завантаженою без swap (headroom 4.56 GB), ОС не голодує.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Причина помилки `gpt-oss-20b-tq3`: `KeyError: 'turboquant'` в `model_loading.py` — omlx dispatcher не обробляє `quantization_config.mode == "turboquant"`, падає на стандартний `mlx-lm` шлях, який не знає цього формату. Видалено через `DELETE /admin/api/hf/models/gpt-oss-20b-tq3`. Metal cap перевірено: `sysctl iogpu.wired_limit_mb` → `0` (дефолт, ~12 GB на 16 GB Mac); зміна `memory_guard_custom_ceiling_gb: 12` у `~/.omlx/settings.json` була лише software-limiter omlx, а не системним Metal cap.
