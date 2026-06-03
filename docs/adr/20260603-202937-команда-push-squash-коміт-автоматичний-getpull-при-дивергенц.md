---
session: d261d410-e912-4f06-8fd5-2770efae874a
captured: 2026-06-03T20:29:37+03:00
transcript: /Users/vitaliytv/.claude/projects/-Users-vitaliytv-www-vitaliytv-7n/d261d410-e912-4f06-8fd5-2770efae874a.jsonl
---

## ADR Команда `push`: squash-коміт + автоматичний getpull при дивергенції

## Context and Problem Statement
Проєкту потрібна команда, яка збирає всі локальні незапушені зміни (коміти + робоче дерево) у один підписаний коміт і пушить його. При цьому гілка може дивергувати від `origin/<branch>`, а ручний squash + merge — ручна і складна операція.

## Considered Options
* `getpush` / `pushup` / `cmpush` / `push` як назва команди
* Зупинятись (STOP) при дивергенції з порадою запустити `getpull`
* Автоматично запустити `getpull` при дивергенції і продовжити

## Decision Outcome
Chosen option: "`push` з автоматичним `getpull` при дивергенції", because користувач обрав назву `push` (симетрія до `getw`/`getpull`) і замість STOP вимагав автоматичного підтягування delta (`_n7merge_delta`) без ручного втручання — зупинятись слід лише при нерозв'язаних конфліктах.

### Consequences
* Good, because transcript фіксує очікувану користь: squash через `git reset --soft origin/<branch>` гарантує fast-forward push; auto-getpull усуває ручний крок синхронізації.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Реалізація: `npm/push.js`, функція `push(branch?, spawnFn?)`; squash — `git reset --soft origin/<branch>`, нова гілка — `git push -u origin <branch>`.
- `--no-verify` на коміті (hooks не запускаються) — явна вимога користувача.
- Без інтерактивного підтвердження: у stdout — subject коміту + `--name-status` файлів.
- Env для моделі: `N7COMMIT_MODEL` → `N7MERGE_MODEL` → `GETW_MERGE_MODEL` → `sonnet`.

---

## ADR Фільтрація шумних файлів з diff-контексту LLM-агента

## Context and Problem Statement
LLM-агент генерує commit-меседж на основі `git diff --cached`. Великі шумні файли (ADR, CHANGELOG, lock-файли, generated docs) заглушують суть зміни і витрачають токени, ускладнюючи точне визначення scope і типу коміту.

## Considered Options
* Передавати повний `git diff --cached` без фільтрації
* Виключати вміст шумних шляхів із diff-контексту (але лишати їх у коміті)

## Decision Outcome
Chosen option: "Виключати вміст шумних шляхів із diff-контексту", because користувач явно поставив задачу зменшити шум у diff-промпті; файли залишаються в коміті — тільки їхній diff не потрапляє агенту.

### Consequences
* Good, because transcript фіксує очікувану користь: агент отримує повний `--name-status` (бачить scope), але без зайвого наративу ADR та lock-файлів.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Дефолтний noise-список (pathspec-exclude): `docs/**`, `**/docs/**`, `**/CHANGELOG.md`, `**/.changes/**`, `*.lock`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `**/*.d.ts`, `**/*.snap`, `**/__snapshots__/**`, `**/*.min.js`, `**/*.map`, `dist/**`, `build/**`, `coverage/**`.
- Env-тонкощі: `N7COMMIT_NO_DEFAULT_EXCLUDE=1` — вимкнути дефолти; `N7COMMIT_EXCLUDE="..."` — додати свої глоби; `N7COMMIT_MAX_DIFF_LINES=1500` — ліміт рядків.
- Перевірено: `git diff HEAD~1 -- . ':(exclude)docs/**' ':(exclude)**/docs/**'` → 0 заголовків `docs/adr/` в diff-виводі; `--name-status` містить усі 10 ADR-файлів.
- Реалізовано в `npm/push.js`; тести в `npm/tests/push.test.mjs`.

---

## ADR Колапс docs/adr/ у stdout-переліку файлів

## Context and Problem Statement
Команда `push` друкує у stdout перелік змінених файлів (`--name-status`). Якщо в коміті є ADR-файли (`docs/adr/`), вони можуть займати десятки рядків виводу, ховаючи значущі зміни.

## Considered Options
* Виводити кожен ADR-файл як окремий рядок разом з рештою
* Групувати усі `docs/adr/`-файли в один рядок із кількістю

## Decision Outcome
Chosen option: "Групувати `docs/adr/` в один рядок із кількістю", because користувач явно попросив «не показувати кожен ADR в stdout, а просто писати їх кількість».

### Consequences
* Good, because transcript фіксує очікувану користь: stdout лишається компактним, увага зосереджена на значущих файлах.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- Формат рядка-колапсу: `📄 docs/adr/: N файл(ів)`.
- Інші підтеки `docs/` (не `adr/`) виводяться поштучно — transcript не містить вимоги колапсувати їх.
- Реалізовано в `npm/push.js` (stdout-блок); інваріант перевірено в `npm/tests/push.test.mjs`.
