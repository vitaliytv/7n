---
session: 989fe445-9e54-428a-ae7d-e9442ed36225
captured: 2026-06-11T09:04:32+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/989fe445-9e54-428a-ae7d-e9442ed36225.jsonl
---

## ADR Оновлення mlx-lm до HEAD у brew-venv omlx для підтримки gemma4_unified

## Context and Problem Statement
`gemma-4-12B-it-OptiQ-4bit` та `gemma-4-12B-it-qat-4bit` не завантажувались в omlx 0.4.3: обидві мають `model_type: gemma4_unified` (`Gemma4UnifiedForConditionalGeneration`), тоді як пінована версія mlx-lm в omlx не знала цього маппінгу, що призводило до помилки "Missing 711 parameters".

## Considered Options
* Оновити mlx-lm до HEAD (`git+https://github.com/ml-explore/mlx-lm@main`) у brew-venv `/opt/homebrew/opt/omlx/libexec/bin/pip`
* Чекати офіційного релізу з підтримкою `gemma4_unified`
* Видалити несумісні моделі без спроби ремонту

## Decision Outcome
Chosen option: "Оновити mlx-lm до HEAD", because користувач явно авторизував це після того, як auto-mode заблокував першу спробу; коміт `8239c72` у mlx-lm (2026-06-05) додав `MODEL_REMAPPING["gemma4_unified"] = "gemma4"` і sanitize-логіку для видалення vision/audio-ваг.

### Consequences
* Good, because маппінг `gemma4_unified → gemma4` та `sanitize()` для VLM-ваг дійсно з'явились в інсталяції (`mlx_lm/utils.py:55`).
* Bad, because оновлення лише частково вирішило проблему: per-layer mixed-precision quantization config (OptiQ-формат) усе одно спричиняв "Missing 711 parameters" — і через `mlx_lm.load()`, і через `mlx_vlm.load()` (версія 0.6.2). Коміт `8239c72` фіксував лише виявлення архітектури, але не повний quant-пайплайн.

## More Information
* Команда апгрейду: `pip install --upgrade --force-reinstall --no-deps --ignore-installed "mlx-lm @ git+https://github.com/ml-explore/mlx-lm@main"` у `/opt/homebrew/opt/omlx/libexec/bin/pip`
* Встановлена версія після апгрейду: `mlx-lm 0.31.3` (HEAD build), файл `/opt/homebrew/Cellar/omlx/0.4.3/libexec/lib/python3.11/site-packages/mlx_lm/__init__.py`
* Підтверджена несправність через прямий тест: `mlx_lm.load('/Users/vitalii/.omlx/models/mlx-community/gemma-4-12B-it-OptiQ-4bit')` → "Missing 711 parameters"
* `gemma-4-e4b-it-OptiQ-4bit` (4B) завантажується коректно, бо має `model_type: gemma4` (не `unified`)

---

## ADR Видалення несумісних моделей gemma4_unified і стабів HF-кешу

## Context and Problem Statement
Після підтвердження, що `gemma-4-12B-it-OptiQ-4bit` (8.3 GB) і `gemma-4-12B-it-qat-4bit` (4.1 GB partial) є несумісними з наявними версіями mlx-lm та mlx-vlm, вони займали місце без можливості використання. Додатково у `~/.cache/huggingface/hub/` накопичились metadata-стаби від раніше видалених моделей (gpt-oss-20b-tq3, gemma-4-12B-4bit тощо).

## Considered Options
* Видалити несумісні моделі через omlx admin API (`DELETE /admin/api/hf/models/{model_name}`) і прибрати HF-стаби вручну
* Залишити моделі в очікуванні апстрім-фіксу

## Decision Outcome
Chosen option: "Видалити несумісні моделі через omlx admin API", because вони не завантажуються в жодному з доступних завантажувачів (mlx-lm HEAD, mlx-vlm 0.6.2), а займають ~12 GB.

### Consequences
* Good, because transcript фіксує очікувану користь: звільнено ~12 GB на диску, список `GET /v1/models` очищено від нефункціональних записів.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
* Команда видалення: `curl -X DELETE http://127.0.0.1:8000/admin/api/hf/models/{model_name}` з cookie-авторизацією — повернула `{"success":true}`
* HF-стаби видалені: `rm -rf` по `~/.cache/huggingface/hub/models--*` directories зі скидом замків у `.locks/`
* Залишились на диску після очистки: `gemma-4-e4b-it-OptiQ-4bit` (7 GB), `gemma-4-e2b-it-4bit` (4 GB), `Qwen3-4B-Thinking-2507-4bit` (2.1 GB) — усі функціональні як text-only LLM
* `rajaschitnis/gemma-4-12b-it-text-only-4bit-mlx` (~10 GB) лежить у `~/.cache/huggingface/hub/` і доступний як text-only 12B

---

## ADR Видалення omlx 0.4.3 для переходу на 0.4.4.dev1 з підтримкою Gemma4 shared-KV у mlx-vlm

## Context and Problem Statement
`gemma-4-e2b-it-4bit` (справжній VLM, сконвертований через mlx-vlm) не завантажувався через `mlx_vlm.load()` у версії 0.6.2, яка постачалась з omlx 0.4.3: помилка "Missing k_proj/v_proj у layers 15-34 (shared-KV)" — несумісність формату квантизованої моделі. omlx 0.4.4.dev1 (реліз 2026-06-10) пакує mlx-vlm від коміту `c9a6743` з "Gemma4 shared-KV/load fixes".

## Considered Options
* Видалити omlx 0.4.3 через `brew uninstall omlx` і встановити 0.4.4.dev1 (brew `--HEAD` або `.dmg`)
* Оновити тільки mlx-vlm вручну всередині brew-venv
* Залишити поточну версію і використовувати E2B лише як text-only через fallback

## Decision Outcome
Chosen option: "Видалити omlx 0.4.3 через brew uninstall", because користувач обрав цей шлях після отримання інформації про те, що 0.4.4.dev1 містить саме потрібний фікс mlx-vlm; `brew uninstall omlx` виконано успішно.

### Consequences
* Good, because transcript фіксує очікувану користь: після встановлення 0.4.4.dev1 `gemma-4-e2b-it-4bit` зможе завантажуватись як повноцінний VLM з підтримкою image-input.
* Bad, because `brew uninstall` видалив разом із omlx залежності (`rust 1.96.0`, `python@3.11`, `llvm 22.1.7`, `pkgconf`) — якщо вони використовувались іншими formulae, їх доведеться відновити окремо. Transcript фіксує видалення цих пакетів, але не фіксує перевірки залежностей.

## More Information
* Виконана команда: `brew services stop omlx && brew uninstall omlx`
* Стан після видалення: порт 8000 вільний, `launchctl list` не показує omlx, `/opt/homebrew/opt/omlx` відсутній
* Дані моделей збережені: `~/.omlx/models/` (22 GB) та `~/.omlx/settings.json` не видалялись
* omlx 0.4.4.dev1 опублікований: `https://github.com/jundot/omlx/releases/tag/v0.4.4.dev1` (2026-06-10)
* mlx-lm пін у 0.4.4.dev1: коміт `39c4019f67402c6448eba0d789b5d834460046dd` (v0.31.3 + short-prompt think-token fix)
* mlx-vlm пін у 0.4.4.dev1: коміт `c9a6743` з Gemma4 shared-KV/load fixes
