# Налаштування memory_guard_custom_ceiling_gb для запуску Gemma 4 12B на 16 GB Mac

**Status:** Accepted
**Date:** 2026-06-10

## Context and Problem Statement

Модель `rajaschitnis--gemma-4-12b-it-text-only-4bit-mlx` (10.70 GB) не запускалась через omlx v0.4.3 (brew): сервер повертав помилку «does not fit under the memory ceiling (10.44 GB)». На 16 GB Mac реально доступно ~8.84 GB вільної RAM — решту з'їдено іншими процесами.

## Considered Options

* Тимчасово встановити `memory_guard_tier: "performance"`
* Встановити `memory_guard_custom_ceiling_gb: 12.0` у `~/.omlx/settings.json`
* Звільнити RAM (закрити фонові застосунки)
* Використати меншу модель (Gemma 4 4B ~3 GB)

## Decision Outcome

Chosen option: "Встановити `memory_guard_custom_ceiling_gb: 12.0`", because користувач явно обрав цей варіант, щоб отримати точний ліміт без зміни глобального `performance`-тиру, який послаблює всі обмеження одночасно.

### Consequences

* Good, because дозволяє завантажити модель 10.70 GB без підняття системного `performance`-тиру.
* Bad, because після перезапуску omlx (`brew services restart omlx`) помилка ceiling persisted (`10.30 GB < 10.70 GB`) — `memory_guard_custom_ceiling_gb` або не набрало чинності через те, що active free memory < ceiling, або читається інакше, ніж очікувалось; кінцевий результат тесту в transcript відсутній.
* Neutral, because аналіз `pyproject.toml` omlx показав, що mlx-lm пін `39c4019` (2026-06-08) новіший за всі Gemma 4 PR (`8239c72` gemma4_unified — 2026-06-05), тому ручне оновлення до HEAD mlx-lm не потрібне для підтримки Gemma 4.

## More Information

- Змінений файл: `~/.omlx/settings.json` — поле `memory_guard_custom_ceiling_gb` з `0.0` → `12.0`.
- Резервна копія: `~/.omlx/settings.json.bak.1781072139`.
- Логіка ceiling: `/opt/homebrew/opt/omlx/libexec/lib/python3.11/site-packages/omlx/server.py:387-388`.
- Команда рестарту: `brew services restart omlx`.
- omlx версія: `0.4.3` (brew tap `jundot/omlx`).
- `pyproject.toml` omlx: `"mlx-lm @ git+https://github.com/ml-explore/mlx-lm@39c4019f..."` (commit 2026-06-08) — містить усі актуальні Gemma 4 патчі.
- Варіант HEAD-pip (якщо потрібен): `/opt/homebrew/opt/omlx/libexec/bin/pip install --upgrade --force-reinstall --no-deps "mlx-lm @ git+https://github.com/ml-explore/mlx-lm@main"` + `brew services restart omlx`. Прапор `--no-deps` обов'язковий — без нього pip може оновити `transformers`/`tokenizers` і зламати `mlx-vlm`/`mlx-embeddings`.
