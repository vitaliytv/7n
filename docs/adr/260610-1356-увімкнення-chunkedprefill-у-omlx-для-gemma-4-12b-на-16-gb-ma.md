---
session: 989fe445-9e54-428a-ae7d-e9442ed36225
captured: 2026-06-10T13:56:13+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/989fe445-9e54-428a-ae7d-e9442ed36225.jsonl
---

## ADR Увімкнення chunked_prefill у omlx для Gemma 4 12B на 16 GB Mac

## Context and Problem Statement
На Mac з 16 GB unified memory сервер omlx із завантаженою `rajaschitnis--gemma-4-12b-it-text-only-4bit-mlx` (~10.7 GB) систематично падав з `RuntimeError: Prefill context too large for available memo` при inference. Apple Metal за замовчуванням обмежує GPU-пам'ять ~11.8 GB (`metal_cap`), тому після завантаження моделі залишається ~1.1 GB для prefill-піків, чого не вистачає.

## Considered Options
* Увімкнути `chunked_prefill: true` у `~/.omlx/settings.json`
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Увімкнути `chunked_prefill: true`", because це дозволяє нарізати prefill на менші шматки й не перевищувати metal_cap, що усуває `Prefill context too large` без зміни моделі чи metal-ліміту.

### Consequences
* Good, because transcript фіксує очікувану користь: помилка зникла, тест 3b (sheep trap) пройшов успішно після увімкнення.
* Bad, because throughput впав з ~10.07 tps до ~4.57 tps — chunked_prefill знижує швидкість у ~2.2×.

## More Information
Зміна в `~/.omlx/settings.json`: `"chunked_prefill": false → true`. Перезапуск: `brew services restart omlx`. Оригінальний бекап: `~/.omlx/settings.json.bak.1781072139`.

---

## ADR Gemma 4 E4B (OptiQ-4bit) як основна модель замість vanilla 12B на 16 GB Mac

## Context and Problem Statement
`rajaschitnis--gemma-4-12b-it-text-only-4bit-mlx` (10.7 GB) вичерпує metal_cap, потребує `chunked_prefill` (throughput ~4.5 tps) і застрягає у chain-of-thought на code-задачах (не повертає `content` навіть при `max_tokens: 2500`). Постало питання вибору кращої моделі для 16 GB машини.

## Considered Options
* `mlx-community/gemma-4-e4b-it-OptiQ-4bit` (7.5 GB, 4-bit, MoE ~4B active params)
* `mlx-community/gemma-4-12B-it-OptiQ-4bit` (9.0 GB) — заблокована через несумісність mlx-lm піну в omlx
* `mlx-community/gemma-4-12B-it-qat-4bit` (11 GB) — QAT завантажувалась у фоні; HF rate limit знизив швидкість до 0.17 MB/s (~14 год ETA)
* `Qwen3-4B-Thinking-2507-4bit` — протестована паралельно: зациклювалась на тексті, проімперський наратив в UA-відповідях, wandering у reasoning без чіткого фіналу

## Decision Outcome
Chosen option: "`mlx-community/gemma-4-e4b-it-OptiQ-4bit`", because вона вміщається в metal_cap без `chunked_prefill`, дає ~28 tps (vs ~4.5 tps у 12B із chunking), і на 4 з 4 тестових завдань — UA-факти, missing dollar, sheep trap, RLE-код — відповідь правильна та точна (12B не дав `content` взагалі на code-задачі).

### Consequences
* Good, because transcript фіксує очікувану користь: 6/6 unit tests пройшли для `rle_encode`, 28 tps, немає проблеми з prefill cap.
* Bad, because це MoE-модель з ~4B активними параметрами — на складніших задачах, ніж ті що тестувались, якість може поступатися повноцінній 12B.

## More Information
Моделі завантажені в `~/.omlx/models/mlx-community/`. Тестовий harness: `/tmp/omlx_ask.py` (Python 3, `curl` з Bearer-токеном `omlx-local-test-key`). Тести: UA-факти (рік 1654), missing dollar puzzle, sheep word trap, `rle_encode` Python function.

---

## ADR Оновлення mlx-lm до HEAD у brew-venv omlx для підтримки OptiQ-12B

## Context and Problem Statement
`mlx-community/gemma-4-12B-it-OptiQ-4bit` не завантажувалась в omlx: `Missing 711 parameters` (зокрема `language_model.model.embed_tokens.biases`, `q_proj.biases`, `v_proj.scales` тощо). Причина — omlx пінить стару версію `mlx-lm`, яка не підтримує формат ваг OptiQ-4bit від mlx-community.

## Considered Options
* Встановити `mlx-lm @ git+https://github.com/ml-explore/mlx-lm@main` через `pip` у brew-venv (`/opt/homebrew/opt/omlx/libexec/bin/pip`)
* Пропустити OptiQ-12B і чекати QAT-4bit
* Пропустити обидва і залишитись на E4B

## Decision Outcome
Chosen option: "Встановити `mlx-lm @ git+https://github.com/ml-explore/mlx-lm@main`", because користувач явно обрав «Дозволити mlx-lm HEAD» коли отримав запит про варіанти вирішення несумісності.

### Consequences
* Good, because transcript фіксує очікувану користь: `mlx_lm-0.31.3` wheel зібрався і встановився успішно.
* Bad, because auto-mode класифікатор заблокував наступний `brew services restart` після установки, тому перевірити що OptiQ-12B завантажується — в transcript не підтверджено.

## More Information
Команда: `/opt/homebrew/opt/omlx/libexec/bin/pip install --upgrade --force-reinstall --no-deps "mlx-lm @ git+https://github.com/ml-explore/mlx-lm@main"`. Встановлена версія: `mlx_lm-0.31.3`. Brew-venv: `/opt/homebrew/opt/omlx/libexec/`.

---

## ADR Brew services як менеджер omlx-сервера (замість .app)

## Context and Problem Statement
omlx доступний двома способами: `brew install jundot/omlx/omlx` (CLI + LaunchAgent-сервіс) і `.dmg`-додаток з menu bar. Обидва тримають HTTP-сервер на порту 8000, тому одночасна робота неможлива. Потрібно вибрати, хто керує сервером.

## Considered Options
* `brew services` керує сервером (LaunchAgent, автостарт після reboot)
* `.app` (oMLX) керує сервером з menu bar та вбудованим auto-update

## Decision Outcome
Chosen option: "`brew services` керує сервером", because користувач явно відповів «brew керує сервером» у відповідь на опис плану співіснування.

### Consequences
* Good, because transcript фіксує очікувану користь: `brew services restart omlx` стабільно використовувався протягом усієї сесії без конфліктів.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Сервіс: `homebrew.mxcl.omlx`. Перезапуск: `brew services restart omlx`. Логи: `/opt/homebrew/var/log/omlx.log`. Config: `~/.omlx/settings.json`.
