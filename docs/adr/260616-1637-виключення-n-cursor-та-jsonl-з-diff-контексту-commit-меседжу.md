---
session: 53feef03-086e-4cef-9dd9-a2212f306d1c
captured: 2026-06-16T16:37:51+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/53feef03-086e-4cef-9dd9-a2212f306d1c.jsonl
---

## ADR Виключення `.n-cursor/**` та `*.jsonl` з diff-контексту commit-меседжу

## Context and Problem Statement
`npx @7n/n@latest push` висів при генерації commit-меседжу у репозиторії `/Users/vitalii/www/nitra/ai`. Аналіз показав, що `.n-cursor/llm-trace.jsonl` (5 439 849 б, ~89% diff) не був у списку `noise`-виключень у `npm/push.js`, тому машинний трейс n-cursor цілком потрапляв у LLM-промпт. Оскільки файл починається з `.` — він сортується першим, і глобальна байтова стеля `head -c 262144` зрізала тільки перші 256 KB трейсу, тоді як реальний код до моделі не доходив.

## Considered Options
* Додати `:(exclude).n-cursor/**`, `:(exclude)**/.n-cursor/**`, `:(exclude)**/*.jsonl` до дефолтного `noise`-масиву
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Додати патерни виключення в `noise`-масив `npm/push.js`", because це той самий механізм, що вже використовується для `docs/**`, `.changes/**`, `*.lock` тощо — одна зміна константи без впливу на решту логіки.

### Consequences
* Good, because transcript фіксує очікувану користь: diff-контекст у `/Users/vitalii/www/nitra/ai` зменшився з **5 443 193 б до 3 344 б** (~1600×), час виклику `pi -p` відповідно впав із «висить» до секунд.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Файл: `npm/push.js`, дефолтний `noise`-масив (рядки ~334-336):
```sh
':(exclude).n-cursor/**'
':(exclude)**/.n-cursor/**'
':(exclude)**/*.jsonl'
```
Тест: `npm/tests/push.test.mjs` — доданий тест перевіряє наявність усіх трьох патернів у `PUSH_ZSH_SCRIPT`. Всього 29 тестів, всі зелені. Додаткова рекомендація з transcript: додати `.n-cursor/llm-trace.jsonl` у `.gitignore` репозиторію — виключення з push-контексту лікує симптом, gitignore — причину.

---

## ADR Рівномірний per-file байт-бюджет у diff-контексті замість глобального `head -c`

## Context and Problem Statement
Глобальна стеля `head -c "$maxbytes"` (256 KiB) обрізала diff **в алфавітному порядку файлів**: будь-який один великий файл із раннім ім'ям (`.`-файли, `a*`) міг монополізувати весь бюджет і витіснити решту файлів із контексту. Навіть після виключення `.n-cursor/llm-trace.jsonl` вада залишалась структурною і могла проявитись з будь-яким іншим великим файлом.

## Considered Options
* Рівномірний per-file байт-бюджет (`N7COMMIT_MAX_FILE_BYTES`, дефолт 16 KiB на файл) із глобальним backstop
* Інші варіанти в transcript не обговорювалися.

## Decision Outcome
Chosen option: "Per-file байт-бюджет з глобальним backstop", because це усуває весь клас проблеми (монополізація контексту одним файлом) без скасування глобальної стелі `N7COMMIT_MAX_DIFF_BYTES`.

### Consequences
* Good, because transcript фіксує очікувану користь: синтетичний тест (великий багаторядковий файл ~280 KB + 3 малі) показав — великий обрізається до ~16 KB з маркером `# … (вміст X обрізано до ~N б)`, всі малі файли присутні, загальний контекст 16 835 б; без патчу стара логіка взяла б усі 256 KB одного файлу і не включила б решту.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Файл: `npm/push.js`, `else`-гілка `_n7push_build_message_from_diff` (рядки ~387-426). Алгоритм:
1. `git diff --cached "$base" --name-only` отримує список файлів.
2. Для кожного файлу `cap = min(N7COMMIT_MAX_FILE_BYTES, залишок глобальної стелі)`.
3. Те саме тришарове обрізання (рядки → `cut -c` довжина → `head -c` байти) застосовується **на кожен файл** окремо.
4. Обрізані файли позначаються маркером; файли понад глобальну стелю — `# … N файл(ів) пропущено`.

Нові env-ручки: `N7COMMIT_MAX_FILE_BYTES` (дефолт `16384`), `N7COMMIT_MAX_DIFF_BYTES` (дефолт `262144`). Тест: `npm/tests/push.test.mjs` — оновлено тест обрізання на per-file pipeline, додано тест рівномірного бюджету, `N7COMMIT_MAX_FILE_BYTES` внесено в env-config тест. Всього 29 тестів пройшли; повний suite — 114 тестів, всі зелені.
