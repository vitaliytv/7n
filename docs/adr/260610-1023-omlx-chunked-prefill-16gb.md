# Увімкнення chunked_prefill для усунення «Prefill context too large» в omlx

**Status:** Accepted
**Date:** 2026-06-10

## Context and Problem Statement

Після успішного завантаження `rajaschitnis--gemma-4-12b-it-text-only-4bit-mlx` (10.70 GB) на 16 GB Mac з omlx 0.4.3 повторні запити з накопиченим KV-cache падали з `RuntimeError: Prefill context too large for available memory` (`engine_core.py:814`). Після завантаження ваг у Metal GPU доступно лише ~1.1 GB вільної RAM — замало для піку prefill при стандартному батчуванні.

## Considered Options

- `chunked_prefill: false` (дефолт) — весь prefill обробляється цілим блоком, пік RAM перевищує доступний залишок
- `chunked_prefill: true` — prefill нарізається на частини, знижуючи пік потреб у пам'яті за рахунок throughput
- Очистити hot-cache через `/admin/api/hot-cache/clear` — відхилено, endpoint вимагав admin-аутентифікації, яка ще не була налаштована

## Decision Outcome

Chosen option: "`chunked_prefill: true`", because це єдиний наявний config-прапор, який безпосередньо знижує пік prefill без втрати моделі або доступу до admin API.

### Consequences

- Good, because `RuntimeError` зникає: sheep-trap тест пройшов успішно після `brew services restart omlx`.
- Bad, because throughput знизився приблизно вдвічі: 12B з `chunked_prefill: true` показала ~4.5 tok/s проти ~10 tok/s без цього налаштування.
- Neutral, because E4B-4bit (~28 tps) не потребує `chunked_prefill` — її вага 7.52 GB вкладається в balanced-ceiling без додаткового налаштування.

## More Information

Змінене поле в `~/.omlx/settings.json`: `"chunked_prefill": true`.
Стек помилки до виправлення: `/opt/homebrew/opt/omlx/libexec/lib/python3.11/site-packages/omlx/engine_core.py:814` → `raise RuntimeError(final_output.error)`.
Версія omlx: `0.4.3` (brew tap `jundot/omlx`). Рестарт через `brew services restart omlx`.

## Update 2026-06-10

Додатковий stack trace із Cellar-шляху: `/opt/homebrew/Cellar/omlx/0.4.3/libexec/lib/python3.11/site-packages/omlx/engine_core.py:814` → `raise RuntimeError(final_output.error)`. Конкретний шлях через Cellar відрізняється від симлінка `opt/homebrew/opt/omlx/...`, але вказує на той самий рядок.

Альтернатива «очистити hot-cache через `/admin/api/hot-cache/clear`» відхилена ще й тому, що адмін-аутентифікація (`auth.api_key`) на момент виникнення помилки ще не була задана в `settings.json`.

Точні виміри throughput: 12B без chunked_prefill ~10 tps, з chunked_prefill ~4.57 tps (тест 3b, sheep trap, однаковий промпт). E4B-4bit показала ~28 tps незалежно від chunked_prefill.
