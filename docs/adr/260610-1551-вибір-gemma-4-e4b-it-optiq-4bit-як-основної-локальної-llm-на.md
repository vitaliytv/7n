---
session: 989fe445-9e54-428a-ae7d-e9442ed36225
captured: 2026-06-10T15:51:02+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/989fe445-9e54-428a-ae7d-e9442ed36225.jsonl
---

## ADR Вибір gemma-4-e4b-it-OptiQ-4bit як основної локальної LLM на 16 GB Mac

## Context and Problem Statement
Потрібна локальна LLM для 16 GB Mac (unified memory). Доступні кілька варіантів Gemma 4 та Qwen3 різного розміру. Вибір впливає на швидкість генерації, вміщуваність у пам'ять та якість відповідей на практичних задачах.

## Considered Options
* `mlx-community/gemma-4-e4b-it-OptiQ-4bit` (4B, 7.5 GB)
* `rajaschitnis/gemma-4-12b-it-text-only-4bit-mlx` (12B, 10.7 GB, thinking)
* `mlx-community/Qwen3-4B-Thinking-2507-4bit` (4B, 2.3 GB, thinking)
* `mlx-community/gemma-4-12B-it-OptiQ-4bit` (12B, 8.3 GB)
* `mlx-community/gemma-4-12B-it-qat-4bit` (12B, 10.2 GB)

## Decision Outcome
Chosen option: "`mlx-community/gemma-4-e4b-it-OptiQ-4bit`", because єдина модель що пройшла 4/4 тестів (UA-знання, логічна задача, пастка «all but 9», Python RLE-код) при швидкості 28 tps і зручному розмірі 7.5 GB без проблем з memory ceiling на 16 GB машині.

### Consequences
* Good, because transcript фіксує очікувану користь: 28.17–28.84 tps проти ~10 tps у 12B-text-only та 4.57 tps у 12B з `chunked_prefill`; 4/4 тести пройдено чисто, RLE-код дав 6/6 unit tests pass.
* Bad, because `rajaschitnis` 12B-text-only дає порівнянну якість на reasoning-задачах, але застрягає у thinking-loop на code-задачах (зафіксовано 2/2 спроби без результату).

## More Information
Тести: UA-історія (Переяславська угода 1654), «missing dollar» (25+3+2=30), «17 sheep / all but 9», `rle_encode(s: str) -> list[tuple[str, int]]`.
Конфіг що змінився:
```
~/.omlx/settings.json:
memory.memory_guard_tier:              balanced → custom
memory.memory_guard_custom_ceiling_gb: 0 → 12
scheduler.chunked_prefill:             false → true
auth.api_key:                          null → "omlx-local-test-key"
```
Бекап: `~/.omlx/settings.json.bak.1781072139`.

---

## ADR gemma4_unified несумісність з omlx — видалення замість workaround

## Context and Problem Statement
`mlx-community/gemma-4-12B-it-OptiQ-4bit` та `gemma-4-12B-it-qat-4bit` мають `architectures: ["Gemma4UnifiedForConditionalGeneration"]` (multimodal text+vision+audio tower). При спробі завантаження в omlx 0.4.3 обидва шляхи — VLM і LLM-fallback — повертають «Missing 711 parameters» через конфлікт між per-layer quant config і маппінгом ваг.

## Considered Options
* Видалити обидві моделі як нефункціональні
* Оновити mlx-lm до HEAD (коміт `8239c72` «Fix gemma4_unified model type not supported»)
* Чекати QAT-4bit завершення завантаження й тестувати далі

## Decision Outcome
Chosen option: "Видалити обидві моделі як нефункціональні", because оновлення mlx-lm до HEAD (0.31.3) виконали, але `mlx_lm.load()` і `mlx_vlm.load()` однаково повертають «Missing 711 parameters» — коміт `8239c72` фіксує лише виявлення архітектури, не завантаження mixed-precision quant ваг у форматі OptiQ/QAT.

### Consequences
* Good, because transcript фіксує очікувану користь: звільнено ~8.7 GB на диску (`4.6 GB + 4.1 GB partial`); список `/v1/models` залишився чистим без broken-записів.
* Bad, because `mlx-lm 0.31.3 HEAD` залишається встановленим у brew-venv (`/opt/homebrew/Cellar/omlx/0.4.3/libexec/...`) замість pin-версії; відкат: `brew reinstall omlx`.

## More Information
Команди видалення:
```
DELETE /admin/api/hf/models/gemma-4-12B-it-OptiQ-4bit
DELETE /admin/api/hf/models/gemma-4-12B-it-qat-4bit
```
Діагностика: `config.json` у OptiQ-12B: `model_type: gemma4_unified`, `text_config.model_type: gemma4_unified_text`; у E4B-4B: `model_type: gemma4`. Ключі ваг у OptiQ-12B починаються з `language_model.model.*` — конфлікт із sanitize/quantize predicate в mlx-lm. PR `8239c72` (2026-06-05) додав `MODEL_REMAPPING["gemma4_unified"] = "gemma4"` у `mlx_lm/utils.py`, але не вирішив повний quant-пайплайн. Файл `omlx/engine_pool.py:1058–1086` — LLM-fallback шлях.
