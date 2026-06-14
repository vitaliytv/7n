---
session: 989fe445-9e54-428a-ae7d-e9442ed36225
captured: 2026-06-11T09:00:53+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/989fe445-9e54-428a-ae7d-e9442ed36225.jsonl
---

## ADR Оновлення mlx-lm до HEAD у brew-venv omlx для підтримки gemma4_unified

## Context and Problem Statement
Моделі `gemma-4-12B-it-OptiQ-4bit` та `gemma-4-12B-it-qat-4bit` не завантажувались в omlx 0.4.3: обидві мають `architectures: ["Gemma4UnifiedForConditionalGeneration"]` / `model_type: gemma4_unified`, який відсутній у релізному mlx-lm. Спроба завантаження через VLM і LLM-fallback провалювалась з "Missing 711 parameters: language_model.model.embed_tokens.*".

## Considered Options
* Оновити mlx-lm до HEAD (git+https://github.com/ml-explore/mlx-lm@main) у brew venv через `/opt/homebrew/opt/omlx/libexec/bin/pip install --force-reinstall --no-deps`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Оновити mlx-lm до HEAD", because коміт `8239c72` (2026-06-05) додав маппінг `"gemma4_unified": "gemma4"` у `MODEL_REMAPPING` та sanitize-фільтрацію vision/audio ваг у `models/gemma4.py`, що за задумом дає LLM-fallback можливість завантажувати ці моделі.

### Consequences
* Good, because transcript фіксує очікувану користь: mlx-lm 0.31.3 HEAD успішно встановлено (mtime Jun 10 13:54:38 2026), `utils.py:55` містить рядок `"gemma4_unified": "gemma4"`.
* Bad, because підтримка виявилась частковою: `mlx_lm.load()` HEAD все одно повертає "Missing 711 parameters" для `gemma-4-12B-it-OptiQ-4bit` — per-layer mixed-precision quant config OptiQ несумісний з quantize-predicate. Проблема не в sanitize, а в подальшому `_quantize()` кроці. Оновлення mlx-vlm (0.6.2) також не допомогло.

## More Information
- Команда встановлення: `/opt/homebrew/opt/omlx/libexec/bin/pip install --upgrade --force-reinstall --no-deps "mlx-lm @ git+https://github.com/ml-explore/mlx-lm@main"`
- Ключовий файл після встановлення: `/opt/homebrew/Cellar/omlx/0.4.3/libexec/lib/python3.11/site-packages/mlx_lm/utils.py`, рядок 55
- `gemma-4-e4b-it-OptiQ-4bit` (4B, `model_type: gemma4`) успішно завантажується через `mlx_lm.load()` тим самим pip-середовищем — підтверджує, що проблема специфічна для `gemma4_unified` квантизованих ваг

---

## ADR Видалення непрацюючих моделей gemma4_unified з omlx

## Context and Problem Statement
Після встановлення mlx-lm HEAD з'ясувалось, що `gemma-4-12B-it-OptiQ-4bit` та `gemma-4-12B-it-qat-4bit` залишаються непридатними — обидві використовують `gemma4_unified` архітектуру, підтримка якої в mlx-lm/mlx-vlm 0.6.2 неповна. Моделі займали місце на диску (OptiQ ~4.6 GB, QAT ~4.1 GB partial) і були зареєстровані в omlx без можливості успішного завантаження.

## Considered Options
* Видалити через `DELETE /admin/api/hf/models/{model_id}`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Видалити через admin API", because transcript фіксує явне рішення користувача ("повидаляй" у запиті про робочі моделі), а API-виклик є безпечним (сервер сам очищує disk + оновлює pool).

### Consequences
* Good, because transcript фіксує очікувану користь: обидва виклики повернули `{"success":true}`, звільнено ~8.7 GB на диску.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- `DELETE http://127.0.0.1:8000/admin/api/hf/models/gemma-4-12B-it-OptiQ-4bit`
- `DELETE http://127.0.0.1:8000/admin/api/hf/models/gemma-4-12B-it-qat-4bit`
- Endpoint визначено в `omlx/admin/routes.py:5005`; видаляє файли з `~/.omlx/models/` і викликає refresh model pool

---

## ADR Повне видалення brew omlx замість патчу окремих Python-пакетів

## Context and Problem Statement
Після завантаження `mlx-community/gemma-4-e2b-it-4bit` (3.61 GB, VLM-конвертований через mlx-vlm) модель завантажилась у omlx 0.4.3 як LLM-fallback (text-only): mlx-vlm 0.6.2 повертав "strict=True, received 140 parameters not in model" і не міг читати vision encoder для image-input. Виявлено, що omlx 0.4.4.dev1 (вийшов 2026-06-10) пінує mlx-vlm до коміту з фіксом для "Gemma4 shared-KV/load" — саме та версія, якої не вистачає.

## Considered Options
* Оновити mlx-vlm окремо через pip (аналогічно тому, як вже оновлювали mlx-lm)
* Повністю видалити omlx через `brew uninstall` для наступного встановлення 0.4.4.dev1 (brew --HEAD або .dmg)
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Повністю видалити omlx через brew uninstall", because користувач явно сказав "видали brew omlx" — підготовка до встановлення 0.4.4.dev1, яка пінує mlx-vlm до коміту c9a6743 з Gemma4 VLM-фіксом і mlx-lm до 39c4019 ("short-prompt think-token fix"); patch окремих пакетів у попередній сесії показав часткову ефективність і потребував ручного brew services restart.

### Consequences
* Good, because transcript фіксує очікувану користь: `brew uninstall` завершився успішно; `/opt/homebrew/opt/omlx` відсутній; порт 8000 вільний; plist-файлів у LaunchAgents/LaunchDaemons не залишилось; `~/.omlx/models` (22 GB) збережений.
* Bad, because ручний апгрейд mlx-lm HEAD (встановлений раніше в сесії) видалено разом зі всім venv; для повернення до роботи потрібне встановлення 0.4.4.dev1.

## More Information
- omlx 0.4.4.dev1 deps: `mlx-lm @ git+https://github.com/ml-explore/mlx-lm@39c4019`, mlx-vlm @ commit c9a6743 (`jq`-результат `gh api repos/jundot/omlx/contents/pyproject.toml?ref=v0.4.4.dev1`)
- Релізи: `https://github.com/jundot/omlx/releases/tag/v0.4.4.dev1` (2026-06-10T02:39:24Z)
- `~/.omlx/settings.json` та моделі збережені; бекап оригінальних налаштувань: `~/.omlx/settings.json.bak.1781072139`
- Варіанти встановлення після видалення: `brew install --HEAD jundot/omlx/omlx` або .dmg з releases
