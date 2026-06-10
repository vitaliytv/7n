---
session: 989fe445-9e54-428a-ae7d-e9442ed36225
captured: 2026-06-10T10:35:48+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/989fe445-9e54-428a-ae7d-e9442ed36225.jsonl
---

## ADR Налаштування memory_guard для запуску Gemma 4 12B на 16 GB Mac через omlx

## Context and Problem Statement
omlx відхиляв завантаження моделі `rajaschitnis--gemma-4-12b-it-text-only-4bit-mlx` (10.70 GB) з помилкою «does not fit under the memory ceiling (10.44 GB)». Tier `balanced` у `~/.omlx/settings.json` динамічно обчислює ліміт з `vm_stat`; встановлення лише `memory_guard_custom_ceiling_gb: 12.0` не мало ефекту, тому що `process_memory_enforcer` поважає кастомний поріг тільки при `memory_guard_tier == "custom"`.

## Considered Options
* Встановити `memory_guard_tier: "custom"` + `memory_guard_custom_ceiling_gb: 12.0`
* Перейти на `memory_guard_tier: "performance"` (вбудована формула з вищим порогом)
* Звільнити достатньо RAM, щоб вкластися в поточний `balanced`-ceiling
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Встановити `memory_guard_tier: \"custom\"` + `memory_guard_custom_ceiling_gb: 12.0`", because користувач явно вибрав «Custom ceiling 12 GB» у діалозі вибору, а аналіз `process_memory_enforcer.py` підтвердив, що кастомний поріг є єдиним числом, яке задається вручну і не перераховується під час завантаження.

### Consequences
* Good, because модель 10.70 GB успішно завантажилась і відповідає на запити після зміни обох полів і `brew services restart omlx`.
* Bad, because при 16 GB RAM і 12 GB ceiling для системи й інших процесів лишається лише ~4 GB — omlx може вбити модель під тиском пам'яті. Крім того, будь-який `brew upgrade omlx` може скинути `settings.json` до дефолтів, тому налаштування потрібно відновлювати вручну.

## More Information
Змінені поля в `~/.omlx/settings.json`:
```json
"memory_guard_tier": "custom",
"memory_guard_custom_ceiling_gb": 12.0
```
Резервна копія зроблена як `~/.omlx/settings.json.bak.1781072139`. Логіка tier-перевірки знаходиться в `/opt/homebrew/opt/omlx/libexec/lib/python3.11/site-packages/omlx/process_memory_enforcer.py` (рядки 321–385).

---

## ADR Увімкнення chunked_prefill для уникнення «Prefill context too large»

## Context and Problem Statement
Після успішного завантаження 12B-моделі повторні запити з накопиченим KV-cache падали з `RuntimeError: Prefill context too large for available memo` (`engine_core.py:814`). Після завантаження моделі в Metal GPU доступно лише ~1.1 GB — замало для піку prefill при стандартному батчуванні.

## Considered Options
* Увімкнути `chunked_prefill: true` — нарізає prefill на дрібні шматки, знижуючи пік пам'яті
* Очистити hot-cache через `/admin/api/hot-cache/clear` — відхилено, endpoint вимагав admin-аутентифікації, яка ще не була налаштована
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Увімкнути `chunked_prefill: true`", because це єдиний наявний config-прапор, який безпосередньо знижує пік prefill без втрати моделі.

### Consequences
* Good, because запити перестали падати з `RuntimeError`; sheep-trap тест (тест 3b) пройшов після ввімкнення.
* Bad, because пропускна здатність впала з ~10 tps до ~4.57 tps (за виміром тесту 3b на тому ж промпті), що приблизно вдвічі знижує інтерактивну швидкість 12B-моделі.

## More Information
Змінене поле в `~/.omlx/settings.json`:
```json
"chunked_prefill": true
```
Стек помилки до виправлення: `/opt/homebrew/Cellar/omlx/0.4.3/libexec/lib/python3.11/site-packages/omlx/engine_core.py:814` → `raise RuntimeError(final_output.error)`. Замір: 12B без chunking ~10 tps, з chunking ~4.5 tps; E4B-4bit ~28 tps незалежно від chunking.

---

## ADR Вибір mlx-community/gemma-4-e4b-it-OptiQ-4bit як порівняльної «малої» моделі

## Context and Problem Statement
Для порівняльного тестування (UA history, missing dollar, sheep trap, RLE code) потрібна була модель класу «4B» з сімейства Gemma 4. Пошук через `omlx admin HF search` показав, що самостійної моделі «Gemma 4 4B» не існує: найменша Gemma 4 — E4B (MoE-архітектура, ~4B активних параметрів).

## Considered Options
* `mlx-community/gemma-4-e4b-it-OptiQ-4bit` (7.52 GB, OptiQ-4bit)
* `mlx-community/gemma-4-12B-it-OptiQ-4bit` (8.86 GB, 4-bit) — відкинуто як занадто близький до вже наявного 12B
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "`mlx-community/gemma-4-e4b-it-OptiQ-4bit`", because це єдиний доступний в MLX-форматі представник «4B»-класу Gemma 4, і 7.52 GB вкладається в custom ceiling 12 GB поряд з вільною RAM після розвантаження 12B.

### Consequences
* Good, because модель завантажилась успішно, всі 4 порівняльні тести пройшли, throughput ~28 tps (проти ~4.5–10 у 12B), код RLE пройшов 6/6 unit-тестів.
* Bad, because E4B — MoE-модель, тому її характеристики (відповіді без reasoning-блоку, відсутній chain-of-thought) відрізняються від 12B IT-thinking-моделі; пряме порівняння якості є частково некоректним.

## More Information
Model ID в `/v1/models`: `gemma-4-e4b-it-OptiQ-4bit`. Завантаження через `/admin/api/hf/download` (task ID `50e3d226-4de6-4354-be78-789c0e803843`), тривало ~10 хв для 7.52 GB. Порівняльні результати: E4B відповідає без `reasoning_content`; 12B (rajaschitnis build) заходить у thinking-режим і вичерпує `max_tokens` навіть на 2500 токенах для задачі RLE.
