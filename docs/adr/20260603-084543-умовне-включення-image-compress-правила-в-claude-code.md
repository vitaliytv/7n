---
session: 594d75c5-fe12-451d-8386-377d07e22f98
captured: 2026-06-03T08:45:43+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/594d75c5-fe12-451d-8386-377d07e22f98/594d75c5-fe12-451d-8386-377d07e22f98.jsonl
---

У Claude Code нема нативного glob-trigger, тому є кілька підходів з різними компромісами:

---

### Варіант 1 — Sub-directory CLAUDE.md (рекомендовано)

Прибираєте `@.cursor/rules/n-image-compress.mdc` з кореневого `CLAUDE.md`.
Створюєте `CLAUDE.md` у директорії, де живуть зображення (наприклад, `public/` або `assets/`):

```markdown
<!-- public/CLAUDE.md -->
@../.cursor/rules/n-image-compress.mdc
```

Claude Code читає CLAUDE.md ієрархічно — підхопить цей файл тільки коли файли з `public/` потраплять у контекст сесії. Це найближче до Cursor-поведінки.

**Мінус:** треба знати заздалегідь, де будуть зображення.

---

### Варіант 2 — Meta-instruction у root CLAUDE.md

Залишаєте `@`-посилання, але додаєте умову одразу після нього:

```markdown
@.cursor/rules/n-image-compress.mdc

> Застосовуй правило `n-image-compress` тільки якщо в поточній сесії присутні
> файли з розширеннями .png, .jpg, .jpeg, .gif, .svg. Інакше — ігноруй його.
```

Простіше, але крихко — залежить від того, чи Claude правильно інтерпретує умову.

---

### Варіант 3 — Видалити з CLAUDE.md, додавати явно в чаті

Прибираєте `@`-посилання з `CLAUDE.md` взагалі.
Коли потрібна оптимізація зображень — просто пишете в чаті:

```
@.cursor/rules/n-image-compress.mdc
optimize this logo.svg
```

Максимально явно, нуль «зайвого» контексту. Мінус — потрібна ручна дія кожного разу.

---

### Варіант 4 — Окремий `CLAUDE.image.md` + alias

Прибираєте з головного `CLAUDE.md`, створюєте `CLAUDE.image.md`:

```markdown
<!-- CLAUDE.image.md -->
@.cursor/rules/n-image-compress.mdc
```

Запускаєте сесію зі спеціальним config-файлом:

```bash
claude --config CLAUDE.image.md
```

Або через `.claude/settings.json` → `additionalContextFiles`. Добре для проєктів, де обробка зображень — окремий workflow.

---

**Резюме:** для вашого tooling-репо, де зображень зараз нема взагалі, найпрагматичніший варіант — **Варіант 3** (видалити, додавати вручну). Якщо ж колись буде директорія `assets/` чи `public/` — одразу кладіть туди Sub-CLAUDE.md (**Варіант 1**).

---

<output>
## ADR Умовне включення image-compress правила в Claude Code

## Context and Problem Statement

У проєкті `.cursor/rules/n-image-compress.mdc` налаштоване з `alwaysApply: false` та `globs: "**/*.{png,jpg,jpeg,gif,svg}"` — тобто у Cursor воно активується лише тоді, коли відповідний файл потрапляє в контекст чату. Однак Claude Code не розуміє MDC-frontmatter і включає всі файли, на які є `@`-посилання в `CLAUDE.md`, беззастережно. В репозиторії немає жодного файлу, що відповідає glob-патерну, тому правило image-compress постійно завантажується в контекст даремно.

## Considered Options

* Прибрати `@`-посилання з кореневого `CLAUDE.md`, додати sub-directory `CLAUDE.md` у директорії з зображеннями (наприклад, `public/CLAUDE.md` або `assets/CLAUDE.md`)
* Залишити `@`-посилання, але додати meta-instruction в `CLAUDE.md`, що обмежує застосування правила умовою "тільки якщо в сесії є image-файли"
* Прибрати `@`-посилання з `CLAUDE.md` взагалі; додавати посилання вручну в чаті через `@.cursor/rules/n-image-compress.mdc` щоразу, коли потрібна оптимізація зображень
* Окремий `CLAUDE.image.md`-файл із `@`-посиланням на правило; запускати Claude Code з `--config CLAUDE.image.md` або через `additionalContextFiles` у `.claude/settings.json` для image-workflow

## Decision Outcome

Chosen option: "Видалити з `CLAUDE.md`, додавати вручну в чаті", because у поточному репозиторії немає жодного image-файлу, тому найпрагматичніший підхід — прибрати `@.cursor/rules/n-image-compress.mdc` з кореневого `CLAUDE.md` і підключати правило явно лише тоді, коли воно справді потрібне. Якщо в майбутньому з'явиться директорія з ассетами — рекомендовано перейти на sub-directory `CLAUDE.md`.

### Consequences

* Good, because правило `n-image-compress` більше не займає місце в системному контексті кожної сесії, де зображень немає.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information

* Правило: `.cursor/rules/n-image-compress.mdc` — `alwaysApply: false`, `globs: "**/*.{png,jpg,jpeg,gif,svg}"`
* Кореневий файл: `CLAUDE.md` — всі `@`-посилання включаються безумовно
* Claude Code не обробляє MDC-frontmatter (`alwaysApply`, `globs`) — це виключно Cursor-семантика
* Sub-directory `CLAUDE.md` (наприклад, `public/CLAUDE.md`) — нативний Claude Code спосіб обмежити scope правила конкретною директорією
* Команда для перевірки відсутності image-файлів: `Glob("**/*.{png,jpg,jpeg,gif,svg}")`
</output>
