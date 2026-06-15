# push: Debug-таймлайн увімкнений за замовчуванням

**Status:** Accepted
**Date:** 2026-06-09

## Context and Problem Statement

Команда `npx @7n/n push` «зависала» на невизначений час під час генерації commit-меседжу LLM-агентом (`pi -p`). Без проміжних таймінгових рядків неможливо визначити, на якому з етапів (fetch, add, збір контексту, виклик `pi`/`claude`/`cursor-agent`) виникає затримка. Потрібно було додати діагностичний вивід і вирішити, чи буде він opt-in або opt-out.

## Considered Options

* Opt-in: debug-таймлайн вмикається явним `N7COMMIT_DEBUG=1`
* Opt-out: debug-таймлайн активний за замовчуванням, вимикається `N7COMMIT_DEBUG=0`

## Decision Outcome

Chosen option: "Opt-out", because після реалізації opt-in-варіанту користувач явно запросив зробити діагностику активною за замовчуванням.

### Consequences

* Good, because без будь-якого env у stderr одразу видно рядки таймлайну з тривалістю кожного етапу та кожного LLM-агента — не потрібно пам'ятати флаг при відлагодженні.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

- Файли: `npm/push.js`, `npm/tests/push.test.mjs`, `npm/README.md`, `npm/.changes/260609-0902.md`
- Gate у zsh: `[[ "${N7COMMIT_DEBUG:-1}" != "0" ]] || return 0` в обох хелперах (`_n7dbg`, `_n7dbg_agent_done`)
- Хелпер `_n7dbg`: timestamped рядок у stderr з назвою етапу та часом від старту
- Хелпер `_n7dbg_agent_done`: фіксує тривалість, exit code, розмір відповіді та перші рядки виводу
- Вивід іде у stderr (`>&2`), щоб не потрапити в commit-меседж (який збирається зі stdout)
- Формат: `🔎 [   0.00s] git fetch origin master: старт`, `🔎 [   1.46s] pi -p: фініш rc=0 за 1.38s`
- Верифікація: `zsh -n /tmp/push_check.zsh`, 24 тести pass
