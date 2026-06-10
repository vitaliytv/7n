---
session: 989fe445-9e54-428a-ae7d-e9442ed36225
captured: 2026-06-10T09:30:58+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/989fe445-9e54-428a-ae7d-e9442ed36225.jsonl
---

## ADR Налаштування memory_guard_custom_ceiling_gb для запуску Gemma 4 12B на 16 GB Mac

## Context and Problem Statement
Модель `rajaschitnis--gemma-4-12b-it-text-only-4bit-mlx` (10.70 GB) не запускалась через omlx v0.4.3, встановлений через brew: сервер повертав помилку «does not fit under the memory ceiling (10.44 GB)». На 16 GB Mac реально доступно ~8.84 GB (free + inactive + speculative), решта з'їдена іншими процесами.

## Considered Options
* Тимчасово встановити `memory_guard_tier: "performance"`
* Встановити `memory_guard_custom_ceiling_gb: 12.0` у `~/.omlx/settings.json`
* Звільнити RAM (закрити фонові застосунки)
* Використати меншу модель (Gemma 4 4B ~3 GB)

## Decision Outcome
Chosen option: "Custom ceiling 12 GB", because користувач явно обрав цей варіант серед запропонованих, щоб отримати точний ліміт без зміни глобального тиру безпеки.

### Consequences
* Good, because transcript фіксує очікувану користь: дозволяє завантажити модель 10.70 GB без підняття системного `performance`-тиру, який послаблює усі обмеження.
* Bad, because transcript не містить підтверджених негативних наслідків — сервіс перезапущено двічі, але помилка ceiling persisted (10.30 GB < 10.70 GB), що свідчить: `memory_guard_custom_ceiling_gb` у `settings.json` або не набрав чинності через active free memory < ceiling, або поле читається інакше, ніж очікувалось. Кінцевий результат тесту в transcript відсутній.

## More Information
- Змінений файл: `~/.omlx/settings.json` — поле `memory_guard_custom_ceiling_gb` з `0.0` → `12.0`
- Резервна копія: `~/.omlx/settings.json.bak.1781072139`
- Логіка ceiling знаходиться в `/opt/homebrew/opt/omlx/libexec/lib/python3.11/site-packages/omlx/server.py:387-388`
- Команда рестарту: `brew services restart omlx`
- omlx версія: `0.4.3` (brew tap `jundot/omlx`)

---

## ADR Gemma 4 патчі вже включені в mlx-lm pin omlx v0.4.3

## Context and Problem Statement
Користувач побачив свіжі Gemma 4 коміти в репо `ml-explore/mlx-lm` і хотів підтвердити, що локальний omlx використовує актуальний код для інференсу Gemma 4.

## Considered Options
* Оновити до HEAD mlx-lm поверх brew-omlx (`pip install --force-reinstall` в libexec venv)
* Перейти на `brew install --HEAD jundot/omlx/omlx`
* Залишити поточний brew-реліз v0.4.3 без змін

## Decision Outcome
Chosen option: "Залишити поточний brew-реліз v0.4.3 без змін", because аналіз `pyproject.toml` репо omlx показав, що mlx-lm пін `39c4019` (2026-06-08) **новіший** за всі Gemma 4 PR (`8239c72` gemma4_unified — 2026-06-05, `df1d3f3` KV projections — 2026-05-04); HEAD mlx-lm у момент сесії містив лише один коміт поверх піна — косметичний фікс `top_k` error message.

### Consequences
* Good, because transcript фіксує очікувану користь: не потрібно вручну патчити libexec venv або переходити на нестабільний `--HEAD` tap, щоб отримати Gemma 4 підтримку.
* Bad, because `brew upgrade omlx` у майбутньому перезапише будь-який ручний pip-патч mlx-lm у libexec — якщо колись знадобиться HEAD mlx-lm, після кожного апгрейду потрібно буде повторювати `pip install --force-reinstall --no-deps "mlx-lm @ git+https://github.com/ml-explore/mlx-lm@main"`.

## More Information
- `pyproject.toml` omlx: `"mlx-lm @ git+https://github.com/ml-explore/mlx-lm@39c4019f..."` (commit 2026-06-08)
- Варіант HEAD-pip: `$PIP=/opt/homebrew/opt/omlx/libexec/bin/pip install --upgrade --force-reinstall --no-deps "mlx-lm @ git+https://github.com/ml-explore/mlx-lm@main"` + `brew services restart omlx`
- Прапор `--no-deps` обов'язковий — без нього pip може оновити `transformers`/`tokenizers` і зламати `mlx-vlm`/`mlx-embeddings`
