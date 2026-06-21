# Вибір квантування Gemma 4 для локального Mac-інференсу через omlx

**Status:** Accepted
**Date:** 2026-06-10

## Context and Problem Statement

На 16 GB Mac (Apple Silicon) з omlx 0.4.3 потрібно вибрати оптимальне квантування Gemma 4 для локального інференсу. Початкова модель `rajaschitnis--gemma-4-12b-it-text-only-4bit-mlx` (10.7 GB) вимагала `chunked_prefill`, застрягала в reasoning loop при code-завданнях навіть з `max_tokens=2500`, і показала ~4.5–10 tok/s. Потрібен порівняльний аналіз доступних варіантів.

## Considered Options

- `rajaschitnis/gemma-4-12b-it-text-only-4bit-mlx` — ручне 4-bit квантування, 10.7 GB; thinking-модель (chain-of-thought у `reasoning_content`)
- `mlx-community/gemma-4-e4b-it-OptiQ-4bit` — Gemma 4 E4B (MoE ~4B активних), 4-bit OptiQ, 7.5 GB; відповідає без reasoning-блоку
- `mlx-community/gemma-4-12B-it-OptiQ-4bit` — 12B, 4-bit OptiQ, 9.0 GB
- `mlx-community/gemma-4-12B-it-qat-4bit` — 12B, QAT (quantization-aware training), 12.4 GB; thinking-модель що виходить до `[answer]`

## Decision Outcome

Chosen option: два переможці залежно від пріоритету:
1. **`gemma-4-e4b-it-OptiQ-4bit`** для задач де потрібна швидкість, because 28 tps (3.5× швидше за 12B), поміщається без `chunked_prefill`, 4/4 тестів pass, відповідає без reasoning overhead.
2. **`gemma-4-12B-it-qat-4bit`** для задач де потрібен chain-of-thought, because це єдиний 12B-варіант де thinking-модель виходить з reasoning до `[answer]` (QAT зберігає точність активацій), 7.5 tps.

Модель `rajaschitnis` видалена з системи — вивантажена з RAM, видалення з диска через `rm -rf ~/.cache/huggingface/hub/models--rajaschitnis--gemma-4-12b-it-text-only-4bit-mlx` або `huggingface-cli delete-cache`.

### Consequences

- Good, because `rajaschitnis` видалена — звільняється 10.7 GB RAM і ~10.55 GB на диску; E4B 4/4 тестів зелені; `rle_encode` пройшов 6/6 unit-тестів.
- Good, because `12B-OptiQ` (9 GB, 8 tps, без `chunked_prefill`) залишається як збалансований варіант між швидкістю і якістю.
- Bad, because `12B-QAT` (12.4 GB) потребує `chunked_prefill` на 16 GB Mac при зайнятій системній RAM — memory ceiling залишається `custom: 12.0 GB`.
- Bad, because E4B — MoE-модель (~4B активних параметрів, не dense 4B); поведінка під навантаженням або з довшими контекстами може відрізнятись; пряме порівняння якості з dense 12B є частково некоректним.

## More Information

Benchmark (omlx 0.4.3, 16 GB Apple Silicon):
- E4B: UA history 3.5s/5.1 tps, sheep trap 3.3s/7.5 tps, missing $ 2.6s/7.3 tps, RLE 6.0s/6.1 tps; short outputs 22–23 tps, long 12 tps
- 12B rajaschitnis: UA 18.9s/10.1 tps, sheep 15.5s/4.5 tps (з chunked_prefill), missing $ 11.9s/10.2 tps, RLE 43.1s/10.4 tps; RLE застрягала в reasoning loop при `max_tokens=2500`

Завантаження E4B: `POST /admin/api/hf/download` з `repo_id: "mlx-community/gemma-4-e4b-it-OptiQ-4bit"`, task_id: `50e3d226-4de6-4354-be78-789c0e803843`.
Змінені параметри `~/.omlx/settings.json`: `memory_guard_tier: "custom"`, `memory_guard_custom_ceiling_gb: 12.0`, `chunked_prefill: true`, `auth.api_key: "omlx-local-test-key"`. Backup: `~/.omlx/settings.json.bak.1781072139`.
Gemma 4 патчі включені в omlx `v0.4.3` через пін `mlx-lm@39c4019` — окремого оновлення `mlx-lm` не потрібно.

## Update 2026-06-10

**gemma4.sanitize() регресія для per-layer квантованих моделей (omlx 0.4.3 / mlx-lm):**

`mlx-community/gemma-4-12B-it-OptiQ-4bit` та `gemma-4-12B-it-qat-4bit` не завантажувались з помилкою «Missing 711 parameters». Корінна причина: метод `sanitize()` у `mlx_lm/models/gemma4.py` (регресія коміту `8239c72`, 2026-06-05) знімав префікс `language_model.` з ключів ваг, після чого per-layer quant config зі специфікаціями `"language_model.model.embed_tokens": {...}` не знаходив шарів у `_quantize()`. Тимчасовий патч brew-venv (рядки 69–78 `sanitize()`): прибрати неправильний strip, залишивши лише фільтрацію vision/audio ключів. Після патчу `gemma-4-12B-it-OptiQ-4bit` завантажилась і пройшла 4/4 тестових задач. Відмінність: `gemma-4-e4b-it-OptiQ-4bit` (`model_type: gemma4`) — плаский quant config, патч не потрібен; 12B-моделі (`model_type: gemma4_unified`) — per-layer quant, патч потрібен. Патч локальний: `brew upgrade omlx` перезапише. PR до апстріму mlx-lm у transcript не відкривався.

## Update 2026-06-10

**Підсумок порівняння моделей та остаточні рішення для 16 GB Mac:**

`mlx-community/gemma-4-e4b-it-OptiQ-4bit` (4B, 7.5 GB, `model_type: gemma4`) обрана основною моделлю: 4/4 тестів (UA history 1654, missing dollar, sheep trap, RLE Python 6/6 unit tests), ~28 tps, вкладається у 16 GB без memory ceiling issues. `rajaschitnis/gemma-4-12b-it-text-only-4bit-mlx` — 10 tps без chunked_prefill / 4.5 tps з ним, провалила RLE (не повернула content). `Qwen3-4B-Thinking-2507-4bit` — зациклення на UA-history, проімперський наратив, wandering у reasoning.

`gemma-4-12B-it-OptiQ-4bit` і `gemma-4-12B-it-qat-4bit` видалені (`DELETE /admin/api/hf/models/{name}`, ~18.5 GB вивільнено): архітектура `gemma4_unified` несумісна з omlx 0.4.3 на рівні quant-завантаження навіть після mlx-lm HEAD 0.31.3 та локального патчу `sanitize()`. mlx-lm HEAD: `pip install --upgrade --force-reinstall --no-deps "mlx-lm @ git+https://github.com/ml-explore/mlx-lm@main"` → `mlx_lm-0.31.3`; відкат: `brew reinstall omlx`. Статичний api_key: `~/.omlx/settings.json` → `"api_key": "omlx-local-test-key"` (localhost-only); harness: `curl -H "Authorization: Bearer omlx-local-test-key"`. Тест-скрипт: `/tmp/omlx_ask.py`, endpoint `http://127.0.0.1:8000/v1/chat/completions`.

## Update 2026-06-10

**Вибір gemma-4-e4b-it-OptiQ-4bit як основної робочої моделі**

Порівняння на 4 тестах (UA history, missing dollar, sheep trap, RLE code):
- `mlx-community/gemma-4-e4b-it-OptiQ-4bit` (4B, 7.5 GB): 4/4, ~28 tps без chunked_prefill
- `rajaschitnis/gemma-4-12b-it-text-only-4bit-mlx` (12B, 10.7 GB, thinking): 3/4 — двічі зависав у reasoning на RLE без результату
- `mlx-community/gemma-4-12B-it-OptiQ-4bit` та `gemma-4-12B-it-qat-4bit`: не завантажуються (`gemma4_unified`)

Обрано `gemma-4-e4b-it-OptiQ-4bit`: єдина 4/4, ~2.8× вища швидкість (28 tps vs 10 tps), вільно міститься у 16 GB без chunked_prefill.

**gemma4_unified несумісність та видалення моделей**

Обидві 12B повертають «Missing 711 parameters». Коміт `8239c72` (mlx-lm, 2026-06-05) додав маппінг `gemma4_unified → gemma4` у `utils.py:55`, але per-layer mixed-precision quant config (OptiQ/QAT) несумісний із `_quantize()` predicate — провалюється навіть після HEAD (0.31.3). Оновлення через `/opt/homebrew/opt/omlx/libexec/bin/pip install --force-reinstall --no-deps "mlx-lm @ git+https://github.com/ml-explore/mlx-lm@main"`; відкат: `brew reinstall omlx`.

Видалено через `DELETE /admin/api/hf/models/{model_name}` (~8.7 GB). Залишились: `gemma-4-e4b-it-OptiQ-4bit`, `rajaschitnis--gemma-4-12b-it-text-only-4bit-mlx`, `Qwen3-4B-Thinking-2507-4bit`, `MarkItDown`. Тести: `/tmp/omlx_ask.py`, `/tmp/rle_check.py`. Бекап: `~/.omlx/settings.json.bak.1781072139`.

## Update 2026-06-10 (Qwen3 та multimodal E2B)

**Qwen3-4B-Thinking-2507-4bit** (2.3 GB, ~42 tps, ctx 262k): зациклює відповідь на українській мові — відхилений. Transcript не містить результатів sheep trap та RLE для Qwen3.

**gemma-4-e2b-it-4bit для справжнього multimodal**

`gemma-4-e4b-it-OptiQ-4bit` фактично text-only: OptiQ-build стрипнув vision/audio ваги (0 ключів у safetensors попри `vision_config`/`audio_config` у `config.json`). Для повноцінного VLM обрано `mlx-community/gemma-4-e2b-it-4bit` (3.61 GB, конвертована через mlx-vlm з `google/gemma-4-e2b-it`, 67 755 завантажень). HF task ID: `d2a9bec8-d254-4f68-b3d3-953997bda29d`, ~0.70 MB/s, ETA ~80 хв. Пошук: `GET /admin/api/hf/search?q=gemma-4-e2b-it&limit=15`.

Бенчмарк E4B: UA-history cold `wall=36.48s`, missing dollar `28.84 tps`, sheep trap `0.33s/1 token`. RLE: 6/6 assert у `/tmp/rle_check.py`. Конфіг: `hidden_size=2560`, 42 layers, ctx 131072.

## Update 2026-06-10 (конфігурація omlx та структура ваг)

**Зміни конфігурації `~/.omlx/settings.json`**

`memory.memory_guard_tier: balanced → custom`, `memory.memory_guard_custom_ceiling_gb: 0 → 12`, `scheduler.chunked_prefill: false → true`, `auth.api_key: null → "omlx-local-test-key"`. Без ceiling 12 GB rajaschitnis 12B відхилялась: `projected memory 11.89 GB would exceed memory ceiling 11.84 GB`. `chunked_prefill: true` знизив throughput 12B з ~10 tps до ~4.57 tps.

**Діагностика структури ваг**

`gemma-4-e4b-it-OptiQ-4bit`: `model_type: gemma4`, 1355 ключів, 0 vision/audio ваг — `mlx_lm.load()` успішний. `gemma-4-12B-it-OptiQ-4bit`: `model_type: gemma4_unified`, `text_config.model_type: gemma4_unified_text`, ваги під `language_model.model.*` конфліктують із quantize predicate. `gemma-4-12B-it-qat-4bit`: 17 vision/audio ключів (`embed_audio.*`, `embed_vision.*`) + та сама помилка 711 parameters.

## Update 2026-06-10 (діагностика engine_pool та admin API)

`gemma-4-12B-it-qat-4bit` додатково має 17 vision/audio ключів (`embed_audio.*`, `embed_vision.*`) у safetensors — та сама помилка «Missing 711 parameters» при завантаженні через будь-який шлях (mlx-lm / mlx-vlm 0.6.2). LLM-fallback шлях у omlx: `omlx/engine_pool.py:1058–1086`. Admin API: `DELETE http://127.0.0.1:8000/admin/api/hf/models/{model_name}` підтверджено; також: `POST /admin/api/hf/download`, `GET /admin/api/hf/tasks`; авторизація через cookie `/tmp/omlx_cookie.txt`. `mlx-lm 0.31.3 HEAD` залишається у brew-venv після видалення моделей; відкат: `brew reinstall omlx`.

## Update 2026-06-10 (деталі PR 8239c72)

PR `8239c72` (2026-06-05): додав `MODEL_REMAPPING["gemma4_unified"] = "gemma4"` у `mlx_lm/utils.py` та `sanitize()` у `gemma4.py` — лише виявлення архітектури та стриппінг vision/audio ваг. Не вирішив: ваги `language_model.model.*` у safetensors несумісні з `_quantize()` predicate при per-layer mixed-precision quant (OptiQ/QAT). Файл після HEAD-інсталяції: `/opt/homebrew/Cellar/omlx/0.4.3/libexec/lib/python3.11/site-packages/mlx_lm/__init__.py` (mtime: Jun 10 13:54:38 2026). E4B підтверджено: `model_type: gemma4` (не `unified`), 1355 ключів, `mlx_lm.load()` → `E4B SUCCESS`.
