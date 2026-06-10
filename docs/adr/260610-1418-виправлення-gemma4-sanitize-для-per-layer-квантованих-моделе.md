---
session: 989fe445-9e54-428a-ae7d-e9442ed36225
captured: 2026-06-10T14:18:07+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/989fe445-9e54-428a-ae7d-e9442ed36225.jsonl
---

Зупиняюсь — моя роль тут аналізувати транскрипт і видати ADR-документацію, а не продовжувати тестування. Нижче ADR-и за рішеннями, зафіксованими в сесії.

---

## ADR Виправлення gemma4.sanitize() для per-layer квантованих моделей gemma4_unified

## Context and Problem Statement
Моделі `mlx-community/gemma-4-12B-it-OptiQ-4bit` та `mlx-community/gemma-4-12B-it-qat-4bit` з архітектурою `gemma4_unified` не завантажувались в omlx — сервер повертав "Missing 711 parameters". Корінна причина: метод `sanitize()` у `mlx_lm/models/gemma4.py` знімав префікс `language_model.` з ключів ваг, після чого per-layer quant config зі специфікаціями виду `"language_model.model.embed_tokens": {...}` не знаходив відповідних шарів у `_quantize()`.

## Considered Options
* Зняти неправильний strip `language_model.` з `sanitize()`, залишивши тільки фільтрацію vision/audio ключів
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Зняти неправильний strip `language_model.` з `sanitize()`", because ключі у safetensors-файлах OptiQ-12B вже зберігаються у форматі `language_model.model.*`, який безпосередньо відповідає шляхам параметрів моделі (`self.language_model = gemma4_text.Model(...)`), тому стрипінг порушував збіг і ламав per-layer quant lookup.

### Consequences
* Good, because transcript фіксує очікувану користь: після патчу `gemma-4-12B-it-OptiQ-4bit` успішно завантажилась і пройшла всі 4 тести (UA history, missing dollar, sheep trap, RLE 6/6).
* Bad, because `brew upgrade omlx` або `brew reinstall omlx` перезапише патч у brew-venv. Апстрім не отримав цей фікс через PR у transcript — регресія з commit 8239c72 залишається у mainline mlx-lm.

## More Information
- Файл: `/opt/homebrew/opt/omlx/libexec/lib/python3.11/site-packages/mlx_lm/models/gemma4.py`, метод `sanitize()`, рядки 69–78
- Commit що ввів регресію: `ml-explore/mlx-lm@8239c72` ("Fix gemma4_unified model type not supported #1349")
- Відмінність між 4B (працює без патчу) і 12B (ламається): у 4B `quantization` config — плаский `{group_size, bits, mode}`, у 12B — per-layer spec із ключами `"language_model.model.*": {...}`
- Модель-тип `gemma4` (4B) vs `gemma4_unified` (12B OptiQ/QAT) — різні архітектурні класи, але один `sanitize()` у mlx-lm

---

## ADR Вибір моделі для локального LLM-інференсу на 16 GB Mac

## Context and Problem Statement
Потрібно обрати модель для локального LLM-сервера (omlx на Apple Silicon Mac з 16 GB unified memory) для задач з reasoningом, кодом і фактичними запитаннями. Кандидати: `rajaschitnis/gemma-4-12b-it-text-only-4bit-mlx` (vanilla 12B), `mlx-community/gemma-4-e4b-it-OptiQ-4bit` (4B), `mlx-community/Qwen3-4B-Thinking-2507-4bit`.

## Considered Options
* `mlx-community/gemma-4-e4b-it-OptiQ-4bit` — 4B, `gemma4`, 7.5 GB
* `rajaschitnis/gemma-4-12b-it-text-only-4bit-mlx` — 12B text-only thinking, 10.7 GB
* `mlx-community/Qwen3-4B-Thinking-2507-4bit` — Qwen3 4B thinking, ~2.5 GB
* `mlx-community/gemma-4-12B-it-OptiQ-4bit` — 12B OptiQ, 8.3 GB (blocked до патчу)

## Decision Outcome
Chosen option: "`mlx-community/gemma-4-e4b-it-OptiQ-4bit`", because вона пройшла 4/4 тести, дала 28 tps (vs 10 tps у vanilla 12B і 4.5 tps у chunked_prefill режимі), вкладається в 16 GB без memory ceiling issues і не використовує thinking-режим, який у vanilla 12B залипає на code-задачах.

### Consequences
* Good, because transcript фіксує очікувану користь: 4B OptiQ — єдина модель що пройшла всі 4 якісні тести без застрягань у reasoning (vanilla 12B провалила RLE; Qwen3 показала repetition loops на UA-задачі).
* Bad, because параметрів удвічі менше ніж у 12B — складніші reasoning-задачі потенційно слабші. Neutral, because transcript не містить підтвердження наслідку для складніших задач.

## More Information
- Тестовий набір: UA-history (1654 / Переяславська угода), missing dollar riddle, sheep trap (all but 9), Python RLE-encode з unit tests
- Тест-скрипт: `/tmp/omlx_ask.py`
- 12B-OptiQ після патчу gemma4.sanitize() теж пройшла 4/4 і дала 11.5 tps — це альтернатива для задач де потрібна більша модель

---

## ADR Налаштування omlx memory ceiling та chunked prefill для 16 GB Mac

## Context and Problem Statement
omlx-сервер на 16 GB Mac з дефолтними налаштуваннями відмовлявся вантажити 12B-моделі через консервативний `memory_guard_tier: balanced`. Також 12B-інференс без chunked prefill тримав RAM біля стелі і уповільнював токенізацію.

## Considered Options
* Виставити `memory_guard_tier: custom`, `memory_guard_custom_ceiling_gb: 12`, `scheduler.chunked_prefill: true`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "custom ceiling 12 GB + chunked_prefill", because це дозволило завантажити 12B-модель (10.7 GB) у межах 12 GB ceiling і стабілізувало інференс. `chunked_prefill` необхідний щоб уникнути OOM при prefill довгих контекстів.

### Consequences
* Good, because transcript фіксує очікувану користь: 12B vanilla-модель успішно завантажилась і відповідала на 3/4 тестів після активації цих опцій.
* Bad, because `chunked_prefill` знизив швидкість 12B з ~10 tps до ~4.5 tps. Neutral, because transcript не містить підтвердження щодо наслідків для RAM-стабільності в довготривалих сесіях.

## More Information
- Конфіг: `~/.omlx/settings.json` (бекап: `~/.omlx/settings.json.bak.1781072139`)
- Змінені поля: `memory.memory_guard_tier: "balanced" → "custom"`, `memory.memory_guard_custom_ceiling_gb: 0 → 12`, `scheduler.chunked_prefill: false → true`, `auth.api_key: null → "omlx-local-test-key"`
