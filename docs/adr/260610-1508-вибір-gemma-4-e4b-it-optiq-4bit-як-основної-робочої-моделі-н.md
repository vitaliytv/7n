---
session: 989fe445-9e54-428a-ae7d-e9442ed36225
captured: 2026-06-10T15:08:18+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/989fe445-9e54-428a-ae7d-e9442ed36225.jsonl
---

## ADR Вибір gemma-4-e4b-it-OptiQ-4bit як основної робочої моделі на 16 GB Mac

## Context and Problem Statement
Потрібно обрати робочу LLM для локального inference через omlx на 16 GB Mac (unified memory). Розглядалися кілька варіантів 4-bit Gemma 4 та Qwen3, які відрізняються розміром, швидкістю та поведінкою на 4 стандартних тестах: UA history, missing dollar, sheep trap, RLE code.

## Considered Options
* `mlx-community/gemma-4-e4b-it-OptiQ-4bit` (7.5 GB, архітектура `gemma4`)
* `rajaschitnis/gemma-4-12b-it-text-only-4bit-mlx` (10.7 GB, архітектура `gemma4`, thinking)
* `mlx-community/Qwen3-4B-Thinking-2507-4bit` (2.3 GB, архітектура `qwen3`, thinking, 262k ctx)
* `mlx-community/gemma-4-12B-it-OptiQ-4bit` та `gemma-4-12B-it-qat-4bit` — обидві не завантажуються (архітектура `gemma4_unified` не підтримується)

## Decision Outcome
Chosen option: "gemma-4-e4b-it-OptiQ-4bit", because єдина модель що пройшла 4/4 тести (включно з RLE-кодом, де vanilla 12B завис у reasoning), досягає ~28 tps (проти ~10 tps у rajaschitnis 12B без chunking і ~4.5 tps з chunked_prefill), та комфортно вміщується в unified memory без memory ceiling.

### Consequences
* Good, because transcript фіксує очікувану користь: 4/4 тести, 28 tps, відсутність memory ceiling issues (7.5 GB < 12 GB custom ceiling).
* Bad, because transcript фіксує, що `rajaschitnis/gemma-4-12b-it-text-only-4bit-mlx` дає кращу якість на відкритих завданнях у thinking-режимі, а 4B не має thinking chain-of-thought.

## More Information
Файл harness: `/tmp/omlx_ask.py`. Тести запускались через `MODEL=<id> python3 /tmp/omlx_ask.py`. Unit-тести RLE виконались у `/tmp/rle_check.py` — 6/6 passed. Moдель зберігається у `~/.omlx/models/mlx-community/gemma-4-e4b-it-OptiQ-4bit` (7.52 GB на диску).

---

## ADR Часткова підтримка gemma4_unified в mlx-lm HEAD та видалення несумісних моделей

## Context and Problem Statement
`mlx-community/gemma-4-12B-it-OptiQ-4bit` та `mlx-community/gemma-4-12B-it-qat-4bit` мають архітектуру `Gemma4UnifiedForConditionalGeneration` (`model_type: gemma4_unified`). Обидві не завантажувались через omlx з помилкою "Missing 711 parameters". Коміт `8239c72` (2026-06-05) у mlx-lm додав маппінг `gemma4_unified → gemma4` і sanitize() для стриппінгу vision/audio ваг.

## Considered Options
* Чекати QAT через HF (реальна швидкість ~0.17 MB/s, ETA 14 годин)
* Оновити mlx-lm до HEAD (`pip install --force-reinstall mlx-lm@main` у brew-venv) — вибрано користувачем
* Видалити обидві моделі без тестування

## Decision Outcome
Chosen option: "Оновити mlx-lm до HEAD", because користувач явно обрав "Дозволити mlx-lm HEAD" коли його запитали. Після оновлення до `mlx-lm 0.31.3` (HEAD) і `brew services restart omlx` — моделі все одно не завантажились. Діагностика показала: `sanitize()` правильно стрипає модулі, але per-layer mixed-precision quant config OptiQ/QAT ламає наступний крок `_quantize()` predicate. Маппінг `8239c72` вирішив лише виявлення архітектури, не повний quant-пайплайн. Після підтвердження обидві моделі видалено через `DELETE /admin/api/hf/models/<id>`.

### Consequences
* Good, because transcript фіксує очікувану користь: маппінг `gemma4_unified → gemma4` підтверджено присутнім у `/opt/homebrew/.../mlx_lm/utils.py:55`; `mlx-lm 0.31.3 HEAD` залишається встановленим у brew-venv для майбутніх моделей.
* Bad, because `mlx-lm HEAD` встановлено поверх brew-managed venv; відкіт потребує `brew reinstall omlx`. Бекап оригінальних налаштувань: `~/.omlx/settings.json.bak.1781072139`.

## More Information
Діагностичні факти з transcript: `gemma-4-12B-it-OptiQ-4bit` має `1324 keys` у safetensors, усі з префіксом `language_model.model.*`, без vision/audio ваг. `gemma-4-12B-it-qat-4bit` має `17` vision/audio ключів. `gemma-4-e4b-it-OptiQ-4bit` (4B, працює) має архітектуру `gemma4`, а не `gemma4_unified`. Обидві 12B-моделі видалено через admin API: `DELETE /admin/api/hf/models/{model_name}` (omlx 0.4.3).

---

## ADR Зміни конфігурації omlx для інференсу великих моделей на 16 GB Mac

## Context and Problem Statement
За замовчуванням omlx з `memory_guard_tier: balanced` і вимкненим `chunked_prefill` не дозволяє завантажити 10.7 GB модель (rajaschitnis 12B) через перевищення memory ceiling (~11.84 GB). Також сервер не мав API-key автентифікації.

## Considered Options
* Залишити `balanced` tier і не завантажувати 12B
* Переключити на `custom` tier з явним ceiling 12 GB — вибрано

## Decision Outcome
Chosen option: "custom memory ceiling 12 GB + chunked_prefill + api_key", because необхідно завантажити rajaschitnis 12B (10.7 GB) в рамках 16 GB unified memory і виконувати API-запити зі скриптів.

### Consequences
* Good, because transcript фіксує очікувану користь: rajaschitnis 12B завантажилась і пройшла 3/4 тести; harness `/tmp/omlx_ask.py` працює з Bearer-токеном.
* Bad, because `chunked_prefill: true` знижує throughput 12B з ~10 tps до ~4.5 tps (зафіксовано в transcript task #6).

## More Information
Зміни у `~/.omlx/settings.json`: `memory.memory_guard_tier: balanced → custom`, `memory.memory_guard_custom_ceiling_gb: 0 → 12`, `scheduler.chunked_prefill: false → true`, `auth.api_key: null → "omlx-local-test-key"`. Бекап оригіналу: `~/.omlx/settings.json.bak.1781072139`.
