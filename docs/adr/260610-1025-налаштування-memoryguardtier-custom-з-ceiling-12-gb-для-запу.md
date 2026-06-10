---
session: 989fe445-9e54-428a-ae7d-e9442ed36225
captured: 2026-06-10T10:25:40+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/989fe445-9e54-428a-ae7d-e9442ed36225.jsonl
---

## ADR Налаштування memory_guard_tier = "custom" з ceiling 12 GB для запуску Gemma 4 12B на 16 GB Mac

## Context and Problem Statement
На 16 GB Mac при запущеному Claude Code, WindowServer та інших процесах omlx (tier `balanced`) динамічно рахує доступний ceiling як ~10.3–10.44 GB. Модель `rajaschitnis--gemma-4-12b-it-text-only-4bit-mlx` важить 10.70 GB і не вміщається, повертаючи `server_error`: "does not fit under the memory ceiling".

## Considered Options
* `memory_guard_tier: "balanced"` (дефолт — динамічний ceiling з `vm_stat`)
* `memory_guard_tier: "custom"` + `memory_guard_custom_ceiling_gb: 12.0`
* Звільнити RAM / закрити інші застосунки

## Decision Outcome
Chosen option: "`memory_guard_tier: custom` + `memory_guard_custom_ceiling_gb: 12.0`", because параметр `custom` є єдиним tier, який поважає `memory_guard_custom_ceiling_gb`; при `balanced` ця директива ігнорується. Зміни внесено до `~/.omlx/settings.json`.

### Consequences
* Good, because transcript фіксує очікувану користь: модель завантажилась і перші тести пройшли після рестарту сервісу.
* Bad, because якщо інші процеси займуть ≥3–4 GB, система може почати свопувати (metal_cap Apple ~11.8 GB), оскільки ручне ceiling не враховує реальну доступну RAM.

## More Information
Файл: `~/.omlx/settings.json`, поля `memory_guard_tier` і `memory_guard_custom_ceiling_gb`. Логіка ceiling у `/opt/homebrew/opt/omlx/libexec/lib/python3.11/site-packages/omlx/process_memory_enforcer.py`. Backup перед зміною: `~/.omlx/settings.json.bak.<mtime>`. Перезапуск через `brew services restart omlx`.

---

## ADR Увімкнення chunked_prefill для усунення RuntimeError при накопиченому KV-кеші

## Context and Problem Statement
Після кількох послідовних chat-completion запитів до omlx з'явився `RuntimeError: Prefill context too large for available memory` в `engine_core.py:814`. Причина — накопичений KV-cache збільшує peak RAM-spoживання під час prefill-фази до рівня, що перевищує залишок після завантаження ваг моделі.

## Considered Options
* `chunked_prefill: false` (дефолт) — prefill обробляється цілим блоком, peak RAM висока
* `chunked_prefill: true` — prefill нарізається на частини, peak RAM знижується
* Очищення hot-cache вручну через `/admin/api/hot-cache/clear` (потребує admin-аутентифікації)

## Decision Outcome
Chosen option: "`chunked_prefill: true`", because це єдиний спосіб знизити peak prefill RAM без доступу до admin API (ключ ще не був заданий). Зміни внесено до `~/.omlx/settings.json`.

### Consequences
* Good, because transcript фіксує очікувану користь: тест 3b ("sheep trap") пройшов успішно після рестарту.
* Bad, because throughput знизився — з ~10.24 tps (тест 2) до 4.57 tps (тест 3b після ввімкнення chunked_prefill).

## More Information
Файл: `~/.omlx/settings.json`, поле `chunked_prefill`. Помилка зафіксована в `/opt/homebrew/var/log/omlx.log` — `omlx/engine_core.py:814`. Рестарт через `brew services restart omlx`.

---

## ADR brew services як єдиний менеджер omlx-сервера (без .dmg app)

## Context and Problem Statement
omlx розповсюджується двома шляхами: Homebrew Formula (`brew install omlx`) і нативний macOS .app (`.dmg` з GitHub Releases). Обидва варіанти запускають сервер на порту `8000`, тому одночасно не можуть працювати.

## Considered Options
* brew services керує сервером — headless, автозапуск через LaunchAgent
* .dmg / `oMLX.app` керує сервером — menu bar UI, auto-update вбудований
* pip+venv встановлення з HEAD репозиторію

## Decision Outcome
Chosen option: "brew services керує сервером", because користувач явно вибрав цей варіант ("brew керує сервером, тести з Gemma продовжуй") після пояснення конфлікту на порту.

### Consequences
* Good, because transcript фіксує очікувану користь: всі `brew services restart omlx` проходили штатно, CLI `omlx` доступний з `/opt/homebrew/bin/omlx`.
* Bad, because transcript містить застереження: будь-який `brew upgrade omlx` перезаписує venv, включно з ручними `pip install` патчами (наприклад, підміна mlx-lm на HEAD).

## More Information
Formula: `jundot/omlx` tap, файл `Formula/omlx.rb`. Команди: `brew services stop/start/restart omlx`. Альтернативні .dmg-збірки: `oMLX-0.4.3-macos15-sequoia.dmg` і `oMLX-0.4.3-macos26-27.dmg` в GitHub Releases `v0.4.3`.

---

## ADR Вибір mlx-community/gemma-4-e4b-it-OptiQ-4bit як порівняльної моделі

## Context and Problem Statement
Для порівняльного тестування з Gemma 4 12B (10.7 GB) потрібна менша Gemma 4 модель, що вміщується у вільні ~5 GB RAM на 16 GB Mac після завантаження 12B або може бути єдиною завантаженою моделлю.

## Considered Options
* `mlx-community/gemma-4-e4b-it-OptiQ-4bit` — 7.52 GB, 4-bit OptiQ, MoE (~4B активних параметрів)
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "`mlx-community/gemma-4-e4b-it-OptiQ-4bit`", because це найменша доступна Gemma 4 MLX модель у результатах пошуку HF (`/admin/api/hf/search?q=gemma-4-4b-it`), що вміщується на 16 GB Mac при custom ceiling 12 GB.

### Consequences
* Good, because transcript фіксує очікувану користь: модель успішно завантажується через `/admin/api/hf/download` (task `50e3d226-4de6-4354-be78-789c0e803843`), прогрес зростав до 90.5%+ без помилок.
* Bad, because Neutral, because transcript не містить підтвердження наслідку щодо якості відповідей E4B vs 12B — тестові прогони на E4B ще не завершились на момент закінчення transcript.

## More Information
HF repo: `mlx-community/gemma-4-e4b-it-OptiQ-4bit`, total size 7.52 GB (7 518 775 956 байт). Завантаження ініційовано через `POST /admin/api/hf/download`, відстежувалось через `GET /admin/api/hf/tasks`. Admin-аутентифікація: `~/.omlx/settings.json` → `auth.api_key: "omlx-local-test-key"`, Bearer token у HTTP-заголовку.
