---
session: b4042850-5fb6-46be-b215-1477180bcdb6
captured: 2026-06-10T13:15:56+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/b4042850-5fb6-46be-b215-1477180bcdb6.jsonl
---

## ADR `n pull` використовує delta-merge замість fast-forward + merge

## Context and Problem Statement
Команда `npx @7n/n pull` призначена для оновлення поточного робочого дерева зі змінами з `origin`. Користувач очікує класичного git-підходу: спочатку fast-forward, потім merge. Натомість реалізація застосовує власний алгоритм delta-merge через `_n7merge_delta` із `merge.js`.

## Considered Options
* Стандартний git pull (fast-forward → merge)
* Delta-merge: накочувати у робоче дерево ЛИШЕ дельту `merge-base(HEAD, origin/<branch>)..origin/<branch>` як unstaged-зміни

## Decision Outcome
Chosen option: "Delta-merge через `_n7merge_delta`", because алгоритм переносить лише дельту merge-base..origin як unstaged-зміни — на відміну від `git checkout`, який замінює весь зріз файлів і перетирає локальні правки.

### Consequences
* Good, because локальні незакомічені зміни у робочому дереві не перезаписуються — delta накладається поверх них як unstaged.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
- `npm/pull.js` — точка входу команди `n pull`; делегує логіку до `merge.js`
- `npm/merge.js` — спільне ядро `_n7merge_delta` для `getw` і `pull`; реалізує zsh-функцію через `runZsh`/`MERGE_ZSH_LIB`
- Обидві команди (`getw` і `pull`) поділяють один алгоритм delta-merge
