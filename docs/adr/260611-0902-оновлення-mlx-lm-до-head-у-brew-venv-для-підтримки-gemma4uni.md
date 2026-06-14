---
session: 989fe445-9e54-428a-ae7d-e9442ed36225
captured: 2026-06-11T09:02:14+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/989fe445-9e54-428a-ae7d-e9442ed36225.jsonl
---

## ADR Оновлення mlx-lm до HEAD у brew-venv для підтримки gemma4_unified

## Context and Problem Statement
В omlx 0.4.3 моделі `gemma-4-12B-it-OptiQ-4bit` та `gemma-4-12B-it-qat-4bit` (архітектура `Gemma4UnifiedForConditionalGeneration`, `model_type: gemma4_unified`) повертали "Missing 711 parameters" при завантаженні. Пін mlx-lm у brew-venv не мав маппінгу `gemma4_unified → gemma4`, доданого у PR `8239c72` (5 червня 2026).

## Considered Options
* Оновити mlx-lm до HEAD (`git+https://github.com/ml-explore/mlx-lm@main`) у brew-venv `/opt/homebrew/opt/omlx/libexec/bin/pip`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Оновити mlx-lm до HEAD", because користувач явно авторизував це після того, як auto-mode classifier заблокував першу спробу. Маппінг `gemma4_unified → gemma4` у `utils.py:55` підтверджено присутнім у встановленому `mlx_lm 0.31.3` HEAD.

### Consequences
* Good, because transcript фіксує очікувану користь: маппінг `"gemma4_unified": "gemma4"` з'явився у `site-packages/mlx_lm/utils.py:55` після апгрейду.
* Bad, because підтримка виявилась частковою: `mlx_lm.load()` все одно повернув "Missing 711 parameters" для `gemma-4-12B-it-OptiQ-4bit`, оскільки PR `8239c72` фіксує лише виявлення архітектури, але не квантизаційний пайплайн для per-layer mixed-precision OptiQ-конвертера. Крім того, ручний апгрейд буде перетертий при переході на omlx 0.4.4.dev1.

## More Information
* Команда апгрейду: `pip install --upgrade --force-reinstall --no-deps "mlx-lm @ git+https://github.com/ml-explore/mlx-lm@main"`
* Brew-venv pip: `/opt/homebrew/opt/omlx/libexec/bin/pip`
* Встановлений файл: `/opt/homebrew/Cellar/omlx/0.4.3/libexec/lib/python3.11/site-packages/mlx_lm/utils.py:55`
* Коміт, що додав маппінг: `8239c72` ("Fix gemma4_unified model type not supported (#1349)"), дата 2026-06-05
* `gemma-4-e4b-it-OptiQ-4bit` (4B) успішно завантажується бо має `model_type: gemma4` (не `unified`)

---

## ADR Видалення несумісних gemma4_unified 12B-моделей

## Context and Problem Statement
Обидві 12B-моделі (`gemma-4-12B-it-OptiQ-4bit`, `gemma-4-12B-it-qat-4bit`) мають `model_type: gemma4_unified` і не завантажуються в omlx 0.4.3 ні через VLM-шлях (mlx-vlm 0.6.2), ні через LLM-fallback. Займали місце (~8.7 GB разом) без можливості використання.

## Considered Options
* Видалити через `DELETE /admin/api/hf/models/{model_id}`
* Скасувати QAT-завантаження й дати фінальний звіт без видалення
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Видалити через API", because непрацюючі моделі займали місце без перспективи виправлення без upstream-фіксу в omlx, а endpoint `DELETE /admin/api/hf/models/{model_id}` безпечно видалив файли з диска і оновив пул.

### Consequences
* Good, because transcript фіксує очікувану користь: обидві моделі підтверджено видалено (`{"success":true}`), звільнено ~8.7 GB.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
* `DELETE http://127.0.0.1:8000/admin/api/hf/models/gemma-4-12B-it-OptiQ-4bit`
* `DELETE http://127.0.0.1:8000/admin/api/hf/models/gemma-4-12B-it-qat-4bit`
* Причина несумісності: `gemma-4-12B-it-OptiQ-4bit` зберігає ключі у форматі `language_model.model.*` (1324 ключі), але квантизаційний predicate у `_quantize()` не розпізнає їх коректно з per-layer mixed-precision конфігом
* `gemma-4-12B-it-qat-4bit`: 17 ключів vision/audio (`embed_audio.*`, `embed_vision.*`), 1341 всього

---

## ADR Міграція omlx 0.4.3 → 0.4.4.dev1 для підтримки VLM-завантаження

## Context and Problem Statement
`gemma-4-e2b-it-4bit` (VLM, конвертований mlx-vlm 0.4.3) не завантажувався в omlx 0.4.3 ні через mlx-vlm 0.6.2, ні через mlx-lm HEAD: обидва повертали "Missing 711 parameters" через несумісність форматів shared-KV у layers 15–34. Версія omlx 0.4.4.dev1 пакує mlx-vlm від коміту `c9a6743` з описом "includes Gemma4 shared-KV/load fixes".

## Considered Options
* Встановити omlx 0.4.4.dev1 через `brew uninstall omlx && brew install --HEAD jundot/omlx/omlx`
* Оновити лише mlx-vlm до HEAD у brew-venv
* Встановити `.dmg` `oMLX-0.4.4.dev1-macos15-sequoia.dmg` з GitHub Releases
* Інші варіанти в transcript не обговорювалися (обрано `brew uninstall` як перший крок; фінальний метод встановлення не зафіксований у transcript).

## Decision Outcome
Chosen option: "brew uninstall omlx (як перший крок міграції)", because користувач явно попросив "видали brew omlx". Transcript підтверджує успішне видалення (`No such keg: /opt/homebrew/Cellar/omlx`, порт 8000 вільний, plist відсутні). Конкретний метод встановлення 0.4.4.dev1 (brew --HEAD чи .dmg) у межах transcript залишився несхваленим.

### Consequences
* Good, because transcript фіксує очікувану користь: omlx-server повністю зупинено, LaunchAgent видалено, `/opt/homebrew/opt/omlx` не існує. Дані моделей у `~/.omlx/models/` (22 GB) збережені для повторного використання.
* Bad, because сервер недоступний до встановлення нової версії; `~/.omlx/cache/` (21 GB KV-кеш) лишився на диску і потребує ручного очищення якщо не потрібен.

## More Information
* Релізи: `https://github.com/jundot/omlx/releases` — `v0.4.4.dev1` (2026-06-10), `v0.4.3` (2026-06-09)
* 0.4.4.dev1 пакує: `mlx-lm @ git+https://github.com/ml-explore/mlx-lm@39c4019f67402c6448eba0d789b5d834460046dd` та mlx-vlm `@ ...@c9a6743` (з Gemma4 shared-KV fix)
* Локально збережені моделі після видалення omlx: `Qwen3-4B-Thinking-2507-4bit` (2.1 GB), `gemma-4-e2b-it-4bit` (4.0 GB), `gemma-4-e4b-it-OptiQ-4bit` (7.0 GB) у `~/.omlx/models/mlx-community/`
* `rajaschitnis/gemma-4-12b-it-text-only-4bit-mlx` (11 GB) у `~/.cache/huggingface/hub/`
