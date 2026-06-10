---
session: b4042850-5fb6-46be-b215-1477180bcdb6
captured: 2026-06-10T15:18:37+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/b4042850-5fb6-46be-b215-1477180bcdb6.jsonl
---

## ADR Заміна cloud-агентів (pi/claude/cursor) на локальний omlx у Tier-3 резолві конфліктів

## Context and Problem Statement
Ядро `_n7merge_delta` (`npm/merge.js`) делегувало нерозв'язані конфліктні маркери ланцюжку `pi -p → claude -p → cursor-agent`. Агент `pi` повертав `<eos>` із exit 0, не виконував жодних edit-викликів і лишав маркери у файлах без помилки. Поруч виникла семантична проблема pull: `_n7merge_delta "HEAD" "origin/<branch>"` переносила upstream-дельту як uncommitted зміни, а HEAD лишався на локальних комітах — push потім включав чужі коміти у власний сквош.

## Considered Options
* Залишити ланцюг `pi → claude → cursor` і виправити лише баг `<eos>`
* Замінити тільки `pi` на omlx, зберігши cloud-агентів як фолбек
* Повна заміна ланцюга: omlx-only, без cloud-фолбеку (обраний варіант)
* Reverse-delta з обертанням ролей у `_n7merge_delta`: `HEAD → origin`, локальна робота як unstaged

## Decision Outcome
Chosen option: "Повна заміна ланцюга: omlx-only + reverse-delta", because:
1. Керування клієнтським generate-validate циклом у JS (а не інструментальний loop агента) усуває клас помилок типу `<eos>`: аплай і валідація детерміновані на боці JS, модель лише генерує текст.
2. Reverse-delta (`git reset --hard origin/<branch>` → `_n7merge_delta "origin/<branch>" "$backup_ref"`) дає `HEAD = origin` після pull — чиста git-семантика, ідемпотентність, правильна атрибуція у push.
3. Детермінована обробка `delete/modify`-конфліктів (modify-beats-delete) додана до `_n7merge_delta` — знімає LLM із рішень, де відповідь детермінована.

### Consequences
* Good, because `HEAD = origin/main` після pull: `git status` чесно каже «up to date», повторний pull ідемпотентний, push сквошить лише локальну роботу.
* Good, because modify-beats-delete вирішує `delete/modify` детерміновано (Tier 1, без 3-way і LLM); банер `💀→✅ ВРЯТОВАНО ВІД ВИДАЛЕННЯ` з людськими підписами сторін (ours_label/src_label).
* Good, because JS-резолвер (`npm/omlx.js`) є unit-тестованим через fake-fetch; 90 тестів зелені.
* Bad, because gemma-4-e4b (2–4B) слабша за cloud-агентів на семантичному мерджі: може обрати одну сторону замість злиття. transcript фіксує очікувану компенсацію: валідатори V1–V7 (включно V6 strict за замовчуванням) з таргетованим ретраєм.
* Bad, because omlx вимагає API-ключ (`auth.api_key` у `~/.omlx/settings.json`, дефолт `omlx-local-test-key`); без запущеного omlx-сервера Tier 3 скіпається і маркери лишаються на ручний резолв.

## More Information
Змінені файли: `npm/merge.js`, `npm/pull.js`, `npm/omlx.js` (новий), `npm/omlx-resolve.js` (новий), `npm/tests/omlx.test.mjs` (новий), `npm/tests/merge.test.mjs`, `npm/tests/pull.test.mjs`, `npm/tests/push.test.mjs`, `npm/package.json`.

Ключові параметри:
- omlx endpoint: `~/.omlx/settings.json` → `server.host/port`, env-оверайд `N7MERGE_OMLX_URL`
- модель: `is_default` з `~/.omlx/model_settings.json`, env-оверайд `N7MERGE_OMLX_MODEL`
- ключ: `auth.api_key` з settings, дефолт `omlx-local-test-key`, env-оверайд `N7MERGE_OMLX_KEY`
- температура форсована 0 (server-default 1.0 руйнує детермінізм)
- ретраї: `N7MERGE_OMLX_RETRIES` (дефолт 3), strict V6: `N7MERGE_OMLX_STRICT` (дефолт увімкнено)
- `RESOLVER_PATH`: `fileURLToPath(new URL('omlx-resolve.js', import.meta.url))` інжектується у `runZsh` через `env`

Транспорт відповіді: sentinel-блок `<<<N7-RESOLVED` / `N7-RESOLVED>>>` (JSON зі структурою відхилено: e4b плутає екранування переносів у JSON-рядках, видає `\\n` замість `\n`).

Валідатори (усі — чисті функції над рядками, unit-тестовані):
- V1: відсутність маркерів у результаті
- V2: непорожній результат (крім explicit-empty)
- V3: відсутність прози поза sentinel
- V4: кожен рядок результату існує в ours∪base∪theirs (anti-hallucination)
- V5: ≥1 pure-add з кожної сторони вцілів, якщо обидві мають pure-adds
- V6 (strict): всі pure-adds вцілюють; `similarEdit()` розрізняє same-line-правку від окремого доповнення (загальний префікс ≥50% і ≥3 символи)
- V7: length-guard — рядків результату ≥ max(meaningful(ours), meaningful(theirs))

---
