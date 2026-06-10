---
session: 989fe445-9e54-428a-ae7d-e9442ed36225
captured: 2026-06-10T10:23:02+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/989fe445-9e54-428a-ae7d-e9442ed36225.jsonl
---

## ADR Вибір `memory_guard_tier: "custom"` для активації кастомного memory ceiling в omlx

## Context and Problem Statement
На 16 GB Mac модель `rajaschitnis--gemma-4-12b-it-text-only-4bit-mlx` (10.70 GB) не запускалась з помилкою `Model does not fit under the memory ceiling (10.44 GB)`, хоча в `~/.omlx/settings.json` вже було виставлено `memory_guard_custom_ceiling_gb: 12.0`.

## Considered Options
* `memory_guard_tier: "balanced"` (дефолт) + `memory_guard_custom_ceiling_gb: 12.0` — custom ceiling ігнорується; ceiling рахується динамічно з `vm_stat`
* `memory_guard_tier: "custom"` + `memory_guard_custom_ceiling_gb: 12.0` — custom ceiling дійсно застосовується

## Decision Outcome
Chosen option: `memory_guard_tier: "custom"` + `memory_guard_custom_ceiling_gb: 12.0`, because логіка в `process_memory_enforcer.py` враховує `memory_guard_custom_ceiling_bytes` лише коли `tier == "custom"`; при будь-якому іншому tier значення просто ігнорується.

### Consequences
* Good, because модель 10.70 GB успішно завантажується і відповідає на всі тести.
* Bad, because відповідальність за безпечний ліміт пам'яті переходить на користувача: omlx більше не захищає систему від OOM через динамічний розрахунок `vm_stat`; на 16 GB Mac ceiling 12.0 GB лишає ~4 GB для ОС і інших процесів.

## More Information
Файл: `~/.omlx/settings.json`; логіка ceiling: `/opt/homebrew/opt/omlx/libexec/lib/python3.11/site-packages/omlx/process_memory_enforcer.py`.
Версія omlx: `0.4.3` (brew tap `jundot/omlx`).
Перед зміною було зроблено бекап: `~/.omlx/settings.json.bak.1781072139`.

---

## ADR Увімкнення `chunked_prefill` для запобігання `Prefill context too large` на 16 GB Mac

## Context and Problem Statement
Після успішного завантаження 12B моделі з `memory_guard_tier: "custom"` виникала нова помилка: `RuntimeError: Prefill context too large for available memory` (зафіксована в `/opt/homebrew/var/log/omlx.log` → `engine_core.py:814`). Metal cap (~11.8 GB) залишав ~1.1 GB для prefill peak, чого виявилось недостатньо.

## Considered Options
* `chunked_prefill: false` (дефолт) — весь prefill виконується суцільно, peak пам'яті перевищує доступний залишок
* `chunked_prefill: true` — prefill нарізається на шматки, знижуючи пік потреб у пам'яті за рахунок throughput

## Decision Outcome
Chosen option: `chunked_prefill: true`, because це єдиний спосіб зменшити пік prefill пам'яті без зміни моделі або перезавантаження системи.

### Consequences
* Good, because transcript фіксує очікувану користь: `RuntimeError` зникає, тест `sheep trap` проходить успішно.
* Bad, because throughput знижується приблизно вдвічі: 12B з `chunked_prefill: true` показала ~4.5 tok/s проти ~10 tok/s без цього налаштування (зафіксовано в тесті latency).

## More Information
Файл: `~/.omlx/settings.json`, поле `chunked_prefill`.
Версія omlx: `0.4.3`.
Пов'язаний ADR: [[memory-guard-tier-custom]].

---

## ADR Вибір `mlx-community/gemma-4-e4b-it-OptiQ-4bit` як меншої Gemma 4 моделі для порівняння

## Context and Problem Statement
Виникла потреба порівняти Gemma 4 12B з легшою моделлю для оцінки trade-off між якістю та швидкістю на 16 GB Mac. Пошук через `/admin/api/hf/search?q=gemma-4-4b-it` не знайшов справжньої `4B` моделі Gemma 4.

## Considered Options
* `mlx-community/gemma-4-e4b-it-OptiQ-4bit` (7.52 GB, 4-bit MLX, ~4B активних параметрів, MoE-архітектура)
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: `mlx-community/gemma-4-e4b-it-OptiQ-4bit`, because у пошуковій видачі HF це найменше доступне квантування серед моделей класу Gemma 4 E4B, яке поміщається на 16 GB Mac разом з omlx-сервером.

### Consequences
* Good, because transcript фіксує очікувану користь: E4B показала ~3× вищий throughput (17.63 vs 5.13 tok/s на довгих запитах) при збереженні якості відповідей на всіх тестах (UA history, reasoning, code, structured JSON).
* Bad, because `e4b` — це MoE з ~4B активних параметрів, а не класична dense 4B; поведінка під навантаженням або з довшими контекстами може відрізнятись від dense-моделі того ж розміру.

## More Information
Завантаження через `/admin/api/hf/download` з `repo_id: "mlx-community/gemma-4-e4b-it-OptiQ-4bit"`, task_id: `50e3d226-4de6-4354-be78-789c0e803843`.
Розмір: 7.52 GB. Версія omlx: `0.4.3`.
Gemma 4 патчі (`gemma4_unified`, KV projections) вже включені в omlx `v0.4.3` через пін `mlx-lm@39c4019` — окремого оновлення `mlx-lm` не потрібно.
