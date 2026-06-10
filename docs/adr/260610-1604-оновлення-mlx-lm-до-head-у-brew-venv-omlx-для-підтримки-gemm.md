---
session: 989fe445-9e54-428a-ae7d-e9442ed36225
captured: 2026-06-10T16:04:09+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/989fe445-9e54-428a-ae7d-e9442ed36225.jsonl
---

## ADR Оновлення mlx-lm до HEAD у brew-venv omlx для підтримки gemma4_unified

## Context and Problem Statement
`gemma-4-12B-it-OptiQ-4bit` і `gemma-4-12B-it-qat-4bit` не завантажувались у omlx 0.4.3 з помилкою "Missing 711 parameters" (архітектура `gemma4_unified`). Коміт `8239c72` у mlx-lm HEAD (5 червня 2026) додав маппінг `gemma4_unified → gemma4` в `mlx_lm/utils.py`. Пінована версія mlx-lm у brew-venv цього коміту не містила.

## Considered Options
* Оновити mlx-lm до HEAD (`pip install --force-reinstall --no-deps mlx-lm @ git+https://github.com/ml-explore/mlx-lm@main`)
* Чекати завантаження `gemma-4-12B-it-qat-4bit` (HF тротлив до 0.17 MB/s, ETA ~14 год)
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Оновити mlx-lm до HEAD", because HF rate-limiting робив очікування QAT нежиттєздатним, а коміт `8239c72` явно фіксував відсутнє маппінг архітектури; користувач авторизував після запиту-підтвердження.

### Consequences
* Good, because mlx-lm 0.31.3 HEAD встановлено у `/opt/homebrew/Cellar/omlx/0.4.3/libexec/lib/python3.11/site-packages/mlx_lm/` і маппінг `gemma4_unified → gemma4` присутній у `utils.py:55`.
* Bad, because підтримка виявилась неповною — `mlx_lm.load()` і `mlx_vlm.load()` обидва все одно кидали "Missing 711 parameters" для OptiQ-12B через несумісність per-layer mixed-precision quant-config; оновлення не вирішило задачу завантаження 12B-варіантів.

## More Information
- Установча команда: `PIP=/opt/homebrew/opt/omlx/libexec/bin/pip && $PIP install --upgrade --force-reinstall --no-deps "mlx-lm @ git+https://github.com/ml-explore/mlx-lm@main"`
- Релевантний коміт: `ml-explore/mlx-lm@8239c72` ("Fix gemma4_unified model type not supported (#1349)", 2026-06-05)
- Файл з маппінгом: `mlx_lm/utils.py:55` — `"gemma4_unified": "gemma4"`
- Відкат: `brew reinstall omlx`

---

## ADR Видалення несумісних gemma4_unified моделей (OptiQ-12B, QAT-12B) з omlx

## Context and Problem Statement
Після встановлення mlx-lm HEAD з'ясувалось, що `gemma4_unified` підтримана лише частково: маппінг архітектури є, але per-layer mixed-precision quant-config залишається несумісним з пайплайном `mlx_lm.load()`. Обидві моделі (`gemma-4-12B-it-OptiQ-4bit`, `gemma-4-12B-it-qat-4bit`) займали ~8.7 GB disk і не завантажувались ні через mlx-lm, ні через mlx-vlm 0.6.2.

## Considered Options
* Видалити обидві моделі через `DELETE /admin/api/hf/models/{model_id}`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Видалити обидві моделі", because вони не завантажуються в поточному стеку (omlx 0.4.3 + mlx-lm HEAD + mlx-vlm 0.6.2), а фікс потребує апстрім-змін у omlx або mlx-vlm; продовжувати зберігати ~8.7 GB без можливості використання недоцільно.

### Consequences
* Good, because transcript фіксує очікувану користь: звільнено ~8.7 GB дискового простору; `/v1/models` перестав показувати нефункціональні записи.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Команди видалення: `curl -X DELETE http://127.0.0.1:8000/admin/api/hf/models/gemma-4-12B-it-OptiQ-4bit` та аналогічна для `gemma-4-12B-it-qat-4bit`
- Причина несумісності: `gemma-4-12B-it-OptiQ-4bit` зберігає ключі у форматі `language_model.model.X.*` (1324 ключі), але quant-predicate у mlx-lm не знаходить їх через конфлікт per-layer quant-config (`text_config.model_type: gemma4_unified_text`)
- `gemma-4-12B-it-qat-4bit` додатково містить 17 vision/audio ключів (`embed_audio.*`, `embed_vision.*`); mlx-vlm 0.6.2 не вміє читати цей формат
- Модель `gemma-4-e4b-it-OptiQ-4bit` (4B, `model_type: gemma4`) завантажується успішно — різниця лише в архітектурі `unified` vs звичайної
