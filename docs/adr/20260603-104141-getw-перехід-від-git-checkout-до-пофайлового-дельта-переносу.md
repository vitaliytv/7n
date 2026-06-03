---
session: 7e30ed38-dea1-44a0-bcf9-97afe7986a1a
captured: 2026-06-03T10:41:41+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/7e30ed38-dea1-44a0-bcf9-97afe7986a1a/7e30ed38-dea1-44a0-bcf9-97afe7986a1a.jsonl
---

The session covered a design decision about when `bun install` triggers—only when `bun.lock` is in the worktree branch's delta AND clean `git apply` failed, not on clean merges or when bun.lock wasn't changed by the worktree branch. This is the final clarifying question in a long session about `getw` conflict resolution strategy.
---

## ADR `getw`: перехід від `git checkout -- .` до пофайлового дельта-переносу

## Context and Problem Statement
Команда `getw` виконувала `git checkout "$target_branch" -- .`, що сліпо перезаписувало **всі** файли поточної гілки вмістом worktree-гілки — включно з файлами, яких worktree не чіпав. Якщо поточна гілка мала власні зміни у цих файлах, вони мовчки знищувалися без будь-якого виявлення конфліктів.

## Considered Options
* `git checkout <branch> -- .` — існуючий підхід (сліпе перезаписування всього робочого дерева)
* `git diff merge-base..target | git apply` — перенесення лише дельти worktree-гілки відносно спільного предка

## Decision Outcome
Chosen option: "перенесення лише дельти через `git diff | git apply`", because це єдиний спосіб не зачіпати файли, які змінювала виключно поточна гілка, — `git checkout -- .` не розрізняє «дельту worktree» і «весь зріз дерева».

### Consequences
* Good, because файли, змінені тільки в поточній гілці, більше не затираються.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Файл `npm/getw.js`, рядок з `git checkout "$target_branch" -- .` замінено на `git diff --binary "$merge_base" "$target_branch" | git apply --whitespace=nowarn`. Функція `getw()` у `ZSH_SCRIPT`.

---

## ADR `getw`: багаторівневий резолв конфліктів замість падіння

## Context and Problem Statement
Після переходу на `git apply` з дельтою, при конфлікті скрипт падав з помилкою, лишаючи worktree для ручного перенесення. Необхідно було обробляти конфлікти без ручного втручання, зберігаючи при цьому дані поточної гілки.

## Considered Options
* `git apply` — падає при конфлікті
* `git apply --3way` — намагається 3-way merge через індекс, падає з `does not match index` коли worktree брудний
* `git apply --reject` + агент видаляє `.rej` — крихко: вердикт успіху залежить від дозволів агента на `rm`
* Пофайловий `git merge-file` + агент прибирає маркери (скрипт виносить вердикт)

## Decision Outcome
Chosen option: "пофайловий `git merge-file --diff3` (скрипт ставить маркери й виносить вердикт), агент лише прибирає маркери", because лише цей підхід дає **детерміністичний** вердикт скрипту незалежно від дозволів агента. `git merge-file` працює по файлах без індексу — уникає `does not match index`. Агент не отримує жодних деструктивних прав (тільки `Edit,Write,MultiEdit,Read`).

### Consequences
* Good, because розподіл ролей чіткий: скрипт детермінований (merge-file, grep маркерів, вердикт), агент творчий (прибрати маркери). Worktree зберігається при будь-якій невдачі — дані не губляться.
* Bad, because `git merge-file` маркує конфлікт навіть для сусідніх (не лише перетинних) змін — ці дрібні хибні конфлікти теж ідуть до агента.

## More Information
Helper `_getw_files_with_markers` (grep `^(<<<<<<<|>>>>>>>)`) — детермінований вердикт. Helper `_getw_resolve_with_agent` — `claude -p ... --permission-mode acceptEdits --allowedTools Edit,Write,MultiEdit,Read`, фолбек `cursor-agent -p`. Функціональний тест у `/tmp/getw_func/run.sh` (7 кейсів, всі пройшли). Файл `npm/getw.js`.

---

## ADR `getw`: структурний авторезолвер mergiraf як Tier 2 перед LLM-агентом

## Context and Problem Statement
Line-based `git merge-file` позначає конфліктними навіть зміни у різних частинах синтаксичного дерева (сусідні рядки), що необґрунтовано завантажує LLM-агента хибними конфліктами.

## Considered Options
* Лише `git merge-file` → агент
* `git merge-file --diff3` → `mergiraf solve` (AST/tree-sitter, 25+ мов) → агент лише на залишок

## Decision Outcome
Chosen option: "tier-based pipeline: `git apply` → `git merge-file --diff3` → `mergiraf solve` → LLM-агент", because кожен tier дешевший за наступний; mergiraf вирішує структурні конфлікти детерміністично і безкоштовно, LLM отримує лише справжній залишок. `--diff3` обраний спеціально (не `--zdiff3`) — лишає `|||||||` base-секцію, яку потребує mergiraf для реконструкції.

### Consequences
* Good, because кількість звернень до агента мінімізована; transcript фіксує очікувану користь: mergiraf вирішив тест-файл `can_solve.txt`, LLM отримав лише `no_solve.txt` з маркерами.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Helper `_getw_ensure_mergiraf`: `brew install mergiraf` (формула homebrew-core, 0.17.0), фолбек `cargo install --locked mergiraf`. `GETW_NO_MERGIRAF=1` вимикає Tier 2 повністю. Функціональний тест у `/tmp/getw_t2/run.sh` з fake-mergiraf (перевірив що `can_solve.txt` не пішов до агента, `no_solve.txt` — пішов). Файл `npm/getw.js`.

---

## ADR `getw`: `bun.lock` виключено з merge-pipeline, перегенерується через `bun install`

## Context and Problem Statement
`bun.lock` є автогенерованим файлом; спроба поелементно злити дві версії через `git merge-file` дає лише шум і не гарантує консистентного стану — правильний lockfile отримується лише через `bun install` зі змердженим `package.json`.

## Considered Options
* Брати версію target (`git checkout target -- bun.lock`) — простіше, але ігнорує поточні залежності
* Виключити з merge-pipeline, запустити `bun install` після успішного мержу

## Decision Outcome
Chosen option: "виключити `bun.lock` з merge-pipeline, запустити `bun install` після успішного мержу", because `bun install` дає єдиний правильний lockfile відносно фінального `package.json`, тоді як будь-яке поелементне злиття lockfile є семантично некоректним.

### Consequences
* Good, because `bun.lock` завжди консистентний з `package.json` після мержу.
* Bad, because `bun install` викликається лише якщо `bun.lock` присутній у дельті worktree-гілки **і** чистий `git apply` провалився. Якщо чистий apply пройшов — `bun install` не запускається навіть якщо `bun.lock` змінився.

## More Information
Умова: `regen_bun=1` встановлюється в циклі при `bn = "bun.lock"`, `bun install` викликається лише у гілці пофайлового merge після успішного вердикту. Інші lock-файли (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`) беруться з target без регенерації. Функціональний тест у `/tmp/getw_bun/run.sh` з fake-bun (пройшов). Файл `npm/getw.js`.
