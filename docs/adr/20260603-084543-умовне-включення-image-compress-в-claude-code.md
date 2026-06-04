# Умовне включення image-compress правила в Claude Code

**Status:** Accepted
**Date:** 2026-06-03

## Context and Problem Statement

Правило `.cursor/rules/n-image-compress.mdc` налаштоване з `alwaysApply: false` та `globs: "**/*.{png,jpg,jpeg,gif,svg}"`. У Cursor воно активується лише коли відповідний файл потрапляє в контекст чату. Однак Claude Code не обробляє MDC-frontmatter і включає всі файли, на які є `@`-посилання в `CLAUDE.md`, беззастережно. У репозиторії немає жодного image-файлу, тому правило постійно завантажується в контекст даремно. Паралельно: команда `npx @nitra/cursor` копіює всі правила на диск незалежно від умов активації — рядок `⬇  image-compress → .cursor/rules/n-image-compress.mdc ... ✅` є лише підтвердженням запису файлу, а не активацією в контексті агента.

## Considered Options

- Прибрати `@`-посилання з кореневого `CLAUDE.md`, додати sub-directory `CLAUDE.md` у директорії з зображеннями (наприклад, `public/CLAUDE.md`)
- Залишити `@`-посилання, але додати meta-instruction в `CLAUDE.md`: застосовувати правило лише за наявності image-файлів у сесії
- Прибрати `@`-посилання з `CLAUDE.md` взагалі; додавати вручну в чаті через `@.cursor/rules/n-image-compress.mdc` щоразу, коли потрібна оптимізація зображень
- Окремий `CLAUDE.image.md`-файл; запускати Claude Code з `--config CLAUDE.image.md` або через `additionalContextFiles` у `.claude/settings.json`

## Decision Outcome

Chosen option: "Прибрати `@`-посилання з `CLAUDE.md`, додавати вручну в чаті", because у поточному репозиторії немає жодного image-файлу, тому найпрагматичніший підхід — підключати правило явно лише тоді, коли воно справді потрібне. Якщо в майбутньому з'явиться директорія з ассетами — рекомендовано перейти на sub-directory `CLAUDE.md`.

### Consequences

- Good, because правило `n-image-compress` більше не займає місце в системному контексті кожної сесії, де зображень немає.
- Bad, because transcript не містить підтверджених негативних наслідків.
- Neutral, because якщо з'явиться директорія `assets/` чи `public/` — рекомендовано покласти туди Sub-CLAUDE.md замість ручного підключення.

## More Information

- Правило: `.cursor/rules/n-image-compress.mdc` — `alwaysApply: false`, `globs: "**/*.{png,jpg,jpeg,gif,svg}"`
- Claude Code не обробляє MDC-frontmatter (`alwaysApply`, `globs`) — це виключно Cursor-семантика
- `npx @nitra/cursor` копіює всі правила з `.n-cursor.json` на диск незалежно від умов активації; в Cursor-агента правило активується лише за glob-збігом у чаті
- Sub-directory `CLAUDE.md` (наприклад, `public/CLAUDE.md`) — нативний Claude Code спосіб обмежити scope правила конкретною директорією
- Перевірка відсутності image-файлів: `Glob("**/*.{png,jpg,jpeg,gif,svg}")`
