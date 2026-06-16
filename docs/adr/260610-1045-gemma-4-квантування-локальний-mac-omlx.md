# Вибір квантування Gemma 4 для локального Mac-інференсу через omlx

**Status:** Accepted
**Date:** 2026-06-10

## Context and Problem Statement

На 16 GB Mac (Apple Silicon) з omlx 0.4.3 потрібно вибрати оптимальне квантування Gemma 4 для локального інференсу. Початкова модель `rajaschitnis--gemma-4-12b-it-text-only-4bit-mlx` (10.7 GB) вимагала `chunked_prefill`, застрягала в reasoning loop при code-завданнях навіть з `max_tokens=2500`, і показала ~4.5–10 tok/s. Потрібен порівняльний аналіз доступних варіантів.

## Considered Options

- `rajaschitnis/gemma-4-12b-it-text-only-4bit-mlx` — ручне 4-bit квантування, 10.7 GB; thinking-модель (chain-of-thought у `reasoning_content`)
- `mlx-community/gemma-4-e4b-it-OptiQ-4bit` — Gemma 4 E4B (MoE ~4B активних), 4-bit OptiQ, 7.5 GB; відповідає без reasoning-блоку
- `mlx-community/gemma-4-12B-it-OptiQ-4bit` — 12B, 4-bit OptiQ, 9.0 GB
- `mlx-community/gemma-4-12B-it-qat-4bit` — 12B, QAT (quantization-aware training), 12.4 GB; thinking-модель що виходить до `[answer]`

## Decision Outcome

Chosen option: два переможці залежно від пріоритету:
1. **`gemma-4-e4b-it-OptiQ-4bit`** для задач де потрібна швидкість, because 28 tps (3.5× швидше за 12B), поміщається без `chunked_prefill`, 4/4 тестів pass, відповідає без reasoning overhead.
2. **`gemma-4-12B-it-qat-4bit`** для задач де потрібен chain-of-thought, because це єдиний 12B-варіант де thinking-модель виходить з reasoning до `[answer]` (QAT зберігає точність активацій), 7.5 tps.

Модель `rajaschitnis` видалена з системи — вивантажена з RAM, видалення з диска через `rm -rf ~/.cache/huggingface/hub/models--rajaschitnis--gemma-4-12b-it-text-only-4bit-mlx` або `huggingface-cli delete-cache`.

### Consequences

- Good, because `rajaschitnis` видалена — звільняється 10.7 GB RAM і ~10.55 GB на диску; E4B 4/4 тестів зелені; `rle_encode` пройшов 6/6 unit-тестів.
- Good, because `12B-OptiQ` (9 GB, 8 tps, без `chunked_prefill`) залишається як збалансований варіант між швидкістю і якістю.
- Bad, because `12B-QAT` (12.4 GB) потребує `chunked_prefill` на 16 GB Mac при зайнятій системній RAM — memory ceiling залишається `custom: 12.0 GB`.
- Bad, because E4B — MoE-модель (~4B активних параметрів, не dense 4B); поведінка під навантаженням або з довшими контекстами може відрізнятись; пряме порівняння якості з dense 12B є частково некоректним.

## More Information

Benchmark (omlx 0.4.3, 16 GB Apple Silicon):
- E4B: UA history 3.5s/5.1 tps, sheep trap 3.3s/7.5 tps, missing $ 2.6s/7.3 tps, RLE 6.0s/6.1 tps; short outputs 22–23 tps, long 12 tps
- 12B rajaschitnis: UA 18.9s/10.1 tps, sheep 15.5s/4.5 tps (з chunked_prefill), missing $ 11.9s/10.2 tps, RLE 43.1s/10.4 tps; RLE застрягала в reasoning loop при `max_tokens=2500`

Завантаження E4B: `POST /admin/api/hf/download` з `repo_id: "mlx-community/gemma-4-e4b-it-OptiQ-4bit"`, task_id: `50e3d226-4de6-4354-be78-789c0e803843`.
Змінені параметри `~/.omlx/settings.json`: `memory_guard_tier: "custom"`, `memory_guard_custom_ceiling_gb: 12.0`, `chunked_prefill: true`, `auth.api_key: "omlx-local-test-key"`. Backup: `~/.omlx/settings.json.bak.1781072139`.
Gemma 4 патчі включені в omlx `v0.4.3` через пін `mlx-lm@39c4019` — окремого оновлення `mlx-lm` не потрібно.
