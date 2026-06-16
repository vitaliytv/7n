---
session: 53feef03-086e-4cef-9dd9-a2212f306d1c
captured: 2026-06-16T14:04:05+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/53feef03-086e-4cef-9dd9-a2212f306d1c.jsonl
---

Проаналізую transcript і підготую ADR.

## ADR Додавання `.n-cursor/**` і `*.jsonl` до дефолтних виключень diff-контексту

## Context and Problem Statement

При виконанні `npx @7n/n@latest push` у репозиторії `/Users/vitalii/www/nitra/ai` процес генерації commit-меседжу зависав. Файл `.n-cursor/llm-trace.jsonl` розміром 5.44 MB не був виключений із diff, потрапляв першим (алфавітний порядок), монополізував байтову стелю `N7COMMIT_MAX_DIFF_BYTES=262144`, і до LLM доходив виключно машинний трейс без жодного корисного коду.

## Considered Options

* Додати `:(exclude).n-cursor/**`, `:(exclude)**/.n-cursor/**`, `:(exclude)**/*.jsonl` до дефолтного `noise`-масиву в `npm/push.js`
* Зменшити дефолтну байтову стелю (`N7COMMIT_MAX_DIFF_BYTES`)
* Перейти на `--stat`-first з per-file обрізанням (адаптивний режим)

## Decision Outcome

Chosen option: "Додати `.n-cursor/**` і `*.jsonl` до дефолтного `noise`-масиву", because це найменш інвазивна правка (один масив виключень в `npm/push.js`), яка усуває конкретного виявленого «пожирача» бюджету — `llm-trace.jsonl` — не чіпаючи алгоритм обрізання.

### Consequences

* Good, because розмір diff-контексту на репозиторії `/Users/vitalii/www/nitra/ai` зменшився з 5 443 193 б до 3 344 б (~×1600), і LLM отримує тільки корисний код.
* Bad, because крихкість байтової стелі (`head -c` бере перші N байт у алфавітному порядку файлів) лишається — будь-який новий невиключений великий файл з раннім ім'ям може знову монополізувати контекст. Transcript фіксує це як відому залишкову проблему, але вирішення відкладено.

## More Information

- Змінено: `npm/push.js` — масив `noise` (рядки `334-336`), коментар (рядок 19), JSDoc.
- Змінено: `npm/tests/push.test.mjs` — новий тест перевіряє присутність трьох нових `:(exclude)`-патернів у скрипті.
- Усі 28 тестів пройшли (`bunx vitest run npm/tests/push.test.mjs`).
- Transcript рекомендує також додати `.n-cursor/llm-trace.jsonl` у `.gitignore` проблемного репозиторію — виключення з push-контексту лікує симптом, gitignore усуне причину.
- Правки №2/3 (per-file cap, `--stat`-first) у transcript позначені як окремий більш інвазивний редизайн, не реалізований у цій сесії.
