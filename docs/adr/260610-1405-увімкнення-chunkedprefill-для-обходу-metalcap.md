---
session: 989fe445-9e54-428a-ae7d-e9442ed36225
captured: 2026-06-10T14:05:14+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/989fe445-9e54-428a-ae7d-e9442ed36225.jsonl
---

## ADR Увімкнення chunked_prefill для обходу metal_cap

## Context and Problem Statement
На Mac з 16 GB unified memory Apple metal_cap (~11.8 GB) обмежує пікове споживання під час prefill. Після завантаження `rajaschitnis--gemma-4-12b-it-text-only-4bit-mlx` (~10.7 GB) залишалося ~1.1 GB для prefill-піку, чого не вистачало: `omlx-server` кидав `RuntimeError: Prefill context too large for available memory`.

## Considered Options
* Увімкнути `chunked_prefill: true` у `~/.omlx/settings.json`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Увімкнути `chunked_prefill: true`", because це нарізає prefill на шматки й збиває пікове споживання пам'яті, що дозволяє прогнати inference навіть при тісному metal_cap.

### Consequences
* Good, because transcript фіксує очікувану користь: тест 3b ("sheep trap") пройшов успішно після увімкнення, де раніше падав.
* Bad, because throughput знизився з ~10 tps до ~4.57 tps (зменшення ~2.2×), що підтверджено в transcript.

## More Information
Зміна: `~/.omlx/settings.json` → `"chunked_prefill": false` → `"chunked_prefill": true`. Перезапуск: `brew services restart omlx`. Первинна причина виявлена через `tail /opt/homebrew/var/log/omlx.log`: `RuntimeError: Prefill context too large for available memory`.

---

## ADR Вибір gemma-4-e4b-it-OptiQ-4bit як основної моделі на 16 GB Mac

## Context and Problem Statement
Потрібно вибрати оптимальну локальну LLM для Mac з 16 GB unified memory серед доступних Gemma 4 варіантів. 12B-моделі вимагають chunked_prefill і деградують throughput; новіші 12B-варіанти (`OptiQ-4bit`, `qat-4bit`) використовують архітектуру `gemma4_unified` (multimodal), яка не підтримується у поточній версії omlx.

## Considered Options
* `gemma-4-e4b-it-OptiQ-4bit` (7.5 GB, `gemma4` arch, text-only)
* `gemma-4-12B-it-OptiQ-4bit` (8.3–9.0 GB, `gemma4_unified` arch)
* `gemma-4-12B-it-qat-4bit` (11.0 GB, `gemma4_unified` arch)
* `rajaschitnis--gemma-4-12b-it-text-only-4bit-mlx` (10.7 GB, `gemma4` arch — застрягає в reasoning на code-задачах)
* `Qwen3-4B-Thinking-2507-4bit` (text-only, fast)

## Decision Outcome
Chosen option: "`gemma-4-e4b-it-OptiQ-4bit`", because вільно вміщається в memory ceiling без chunked_prefill, дає ~28 tps, якість на рівні 12B на 3 з 4 тестів і перевершує vanilla 12B на code-задачі (RLE: 6/6 tests pass vs 12B не дав відповіді взагалі).

### Consequences
* Good, because transcript фіксує очікувану користь: 28 tps (3× швидше ніж 12B з chunked_prefill), усі 4 тести пройшли, code generation коректна.
* Bad, because Qwen3-4B показав зациклення на UA-history та wandering на missing dollar — якість нижча за E4B на тих самих задачах.

## More Information
Модель розташована: `~/.omlx/models/mlx-community/gemma-4-e4b-it-OptiQ-4bit`. `config.json` → `"model_type": "gemma4"`. Тестування: `/tmp/omlx_ask.py` з `MODEL=gemma-4-e4b-it-OptiQ-4bit`. Верифікація RLE-коду: `/tmp/rle_check.py` — 6/6 passed.

---

## ADR Встановлення статичного api_key для omlx

## Context and Problem Statement
Під час тестування виникла необхідність звертатися до `/v1/chat/completions` через Bearer-токен, а також до `/admin/api/hot-cache/clear` та `/admin/api/hf/tasks`. Без `api_key` усі запити до inference endpoint були заблоковані з помилкою `authentication_error`.

## Considered Options
* Встановити статичний `api_key` у `~/.omlx/settings.json`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Встановити статичний `api_key`", because це єдиний спосіб автентифікувати harness-скрипти (`/tmp/omlx_ask.py`) та curl-виклики до admin API без ручного login-flow через cookie.

### Consequences
* Good, because transcript фіксує очікувану користь: після встановлення ключа inference і admin API стали доступні, тести продовжились.
* Bad, because статичний ключ `omlx-local-test-key` не є секретним і збережений у plaintext у `~/.omlx/settings.json` — прийнятно лише для localhost-dev.

## More Information
Зміна: `~/.omlx/settings.json` → `"api_key": null` → `"api_key": "omlx-local-test-key"`. Harness оновлено: `/tmp/omlx_ask.py` — додано `-H "Authorization: Bearer omlx-local-test-key"` до curl-виклику. Admin login: `curl -X POST /admin/api/login -d '{"api_key":"omlx-local-test-key"}'` → cookie збережено у `/tmp/omlx_cookie.txt`.

---

## ADR gemma4_unified архітектура несумісна з поточною версією omlx

## Context and Problem Statement
При спробі завантажити `gemma-4-12B-it-OptiQ-4bit` та `gemma-4-12B-it-qat-4bit` omlx кидав помилку "Missing 711 parameters" з довгим списком `language_model.model.*`. Оновлення mlx-lm до HEAD (0.31.3) не вирішило проблему.

## Considered Options
* Чекати фіксу в omlx upstream
* Оновити mlx-lm до HEAD (спробовано)
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Чекати фіксу в omlx upstream", because проблема у fallback-логіці самого omlx: сервер намагається завантажити `gemma4_unified` (VLM з vision+audio) як VLM через mlx-vlm, після невдачі LLM-fallback не знімає префікс `language_model.model.*` з ключів ваг.

### Consequences
* Good, because Neutral, because transcript не містить підтвердження наслідку — рішення зафіксовано, але позитивний ефект залежить від upstream.
* Bad, because 12B-OptiQ і 12B-QAT недоступні для тестування в поточній версії omlx незалежно від версії mlx-lm.

## More Information
`config.json` для `gemma-4-12B-it-OptiQ-4bit` і `gemma-4-12B-it-qat-4bit`: `"model_type": "gemma4_unified"`, `"architectures": ["Gemma4UnifiedForConditionalGeneration"]`. Робоча модель `gemma-4-e4b-it-OptiQ-4bit` має `"model_type": "gemma4"`, `"architectures": ["Gemma4ForConditionalGeneration"]`. Версія omlx: `0.4.3`. mlx-lm після оновлення: `0.31.3` (`/opt/homebrew/Cellar/omlx/0.4.3/libexec/lib/python3.11/site-packages/mlx_lm/`).
