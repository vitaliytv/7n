---
session: 989fe445-9e54-428a-ae7d-e9442ed36225
captured: 2026-06-10T15:25:55+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/989fe445-9e54-428a-ae7d-e9442ed36225.jsonl
---

## ADR Gemma 4 E4B OptiQ як основна локальна LLM на 16 GB Mac

## Context and Problem Statement
На 16 GB Mac (unified memory) з omlx 0.4.3 потрібно обрати оптимальну локальну LLM для текстових задач — UA history, логічні пастки, code generation — з урахуванням обмежень пам'яті та швидкості inference.

## Considered Options
* `mlx-community/gemma-4-e4b-it-OptiQ-4bit` (7.5 GB, `gemma4`)
* `rajaschitnis/gemma-4-12b-it-text-only-4bit-mlx` (10.7 GB, `Gemma4TextForCausalLM`)
* `mlx-community/Qwen3-4B-Thinking-2507-4bit` (2.3 GB, `Qwen3ForCausalLM`)
* `mlx-community/gemma-4-12B-it-OptiQ-4bit` та `mlx-community/gemma-4-12B-it-qat-4bit` (обидві `gemma4_unified`)

## Decision Outcome
Chosen option: "`mlx-community/gemma-4-e4b-it-OptiQ-4bit`", because єдина модель, що пройшла 4/4 тестів (UA-history: 1654 ✅, missing-dollar ✅, sheep-trap ✅, RLE-код 6/6 unit tests ✅), має ~28 tps (vs ~10 tps у text-only 12B і ~4.5 tps у chunked-prefill 12B) та комфортно вміщується у 16 GB без `chunked_prefill`.

### Consequences
* Good, because transcript фіксує очікувану користь: 28.17–28.84 tps проти 4.57–10.07 tps у 12B-варіантів; RLE-задача вирішена коректно, тоді як 12B (rajaschitnis) зависав у reasoning.
* Bad, because модель `gemma4` (4B) меньша за 12B — на складніших задачах якість може відставати; також хоча config.json містить `vision_config`/`audio_config`, у safetensors-файлах **0** vision/audio ваг (OptiQ-build їх стрипнув), тобто фактично text-only, а не повноцінний VLM.

## More Information
* Файли моделі: `~/.omlx/models/mlx-community/gemma-4-e4b-it-OptiQ-4bit/` (1355 ключів у safetensors, 0 vision/audio ваг).
* Скрипт тестування: `/tmp/omlx_ask.py`, виклики через `http://127.0.0.1:8000/v1/chat/completions`.
* Підтверджено через `mlx_lm.load()`: `E4B SUCCESS`, тоді як 12B-OptiQ і 12B-QAT дали `Missing 711 parameters`.

---

## ADR Несумісність gemma4_unified з omlx 0.4.3 і рішення про видалення цих моделей

## Context and Problem Statement
`mlx-community/gemma-4-12B-it-OptiQ-4bit` та `mlx-community/gemma-4-12B-it-qat-4bit` були завантажені як альтернативи 12B-варіанту, але при спробі інференсу повертали `Internal server error` з повідомленням `Missing 711 parameters`.

## Considered Options
* Оновити `mlx-lm` до git HEAD (PR #1349 додав маппінг `gemma4_unified → gemma4`)
* Чекати апстрім фіксу без змін
* Видалити моделі та звільнити диск

## Decision Outcome
Chosen option: "Оновити `mlx-lm` до git HEAD, а після підтвердження часткового фіксу — видалити обидві моделі", because PR #1349 (`8239c72`, 2026-06-05) додав маппінг, але завантаження per-layer mixed-precision quant config (специфічного для OptiQ/QAT) все одно провалюється — `mlx_lm.load()` і `mlx_vlm.load()` однаково видають `Missing 711 parameters` навіть після HEAD.

### Consequences
* Good, because transcript фіксує очікувану користь: `~8.7 GB` звільнено на диску після `DELETE /admin/api/hf/models/gemma-4-12B-it-OptiQ-4bit` та `DELETE /admin/api/hf/models/gemma-4-12B-it-qat-4bit`; `mlx-lm 0.31.3 HEAD` залишається встановленим у brew-venv і не блокує роботу інших моделей.
* Bad, because оновлення mlx-lm до HEAD у `brew`-venv (`/opt/homebrew/opt/omlx/libexec/bin/pip install --force-reinstall --no-deps "mlx-lm @ git+https://github.com/ml-explore/mlx-lm@main"`) відбулось поза штатним керуванням пакетів `brew reinstall omlx` — відкат потребує `brew reinstall omlx`. Бекап оригінального `settings.json`: `~/.omlx/settings.json.bak.1781072139`.

## More Information
* Коміт із частковим фіксом: `ml-explore/mlx-lm@8239c72` — `Fix gemma4_unified model type not supported (#1349)`.
* Ключова діагностика: `gemma-4-12B-it-OptiQ-4bit` має `model_type: gemma4_unified`, `text model_type: gemma4_unified_text`; ваги в safetensors вже у форматі `language_model.model.*`, що конфліктує з per-layer quant predicate у `_quantize()`.
* `gemma-4-12B-it-qat-4bit` додатково має 17 vision/audio ключів (`embed_audio.*`, `embed_vision.*`), але та сама проблема з 711 відсутніми параметрами.
* `mlx_vlm 0.6.2` — та сама помилка, незалежно від завантажувача.
* Ендпоінт видалення: `DELETE http://127.0.0.1:8000/admin/api/hf/models/{model_name}` (omlx admin API).

---

## ADR Зміна конфігурації omlx для підтримки 12B моделей та авторизації

## Context and Problem Statement
За замовчуванням omlx 0.4.3 відмовляв у завантаженні 12B моделі (~10.7 GB) через `memory_guard_tier: balanced`, а API-запити проходили без автентифікації — що ускладнювало тести через `omlx_ask.py`.

## Considered Options
* Змінити `memory_guard_tier` на `custom` з ручним `ceiling_gb`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Змінити `memory_guard_tier: balanced → custom`, `ceiling_gb: 12`, увімкнути `chunked_prefill: true`, встановити `auth.api_key: "omlx-local-test-key"`", because без `ceiling_gb: 12` 12B модель відхилялась із помилкою `projected memory 11.89GB would exceed memory ceiling 11.84GB`; `chunked_prefill` знадобився щоб сервер взагалі прийняв запит до 12B при зайнятій пам'яті.

### Consequences
* Good, because transcript фіксує очікувану користь: після змін 12B (`rajaschitnis`) завантажилась і відповіла на тести; `auth.api_key` дозволив використовувати стандартний заголовок `Authorization: Bearer omlx-local-test-key` у скриптах.
* Bad, because `chunked_prefill: true` знизив throughput 12B з ~10 tps до ~4.57 tps на prefill-важких запитах, що зафіксовано в transcript.

## More Information
* Файл конфігурації: `~/.omlx/settings.json`; бекап: `~/.omlx/settings.json.bak.1781072139`.
* Ключі що змінились: `memory.memory_guard_tier`, `memory.memory_guard_custom_ceiling_gb`, `scheduler.chunked_prefill`, `auth.api_key`.
* Команди admin API: `POST http://127.0.0.1:8000/admin/api/hf/download`, `GET http://127.0.0.1:8000/admin/api/hf/tasks`, авторизація через cookie `/tmp/omlx_cookie.txt`.
