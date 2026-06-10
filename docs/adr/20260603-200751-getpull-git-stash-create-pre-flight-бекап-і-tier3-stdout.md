# Pre-flight бекап через `git stash create` та per-file підсумок Tier-3 агента

**Status:** Accepted
**Date:** 2026-06-03

## Context and Problem Statement

Після впровадження delta-мерджу (Tier 0–3) лишилися два непокриті сценарії:

1. **Pre-flight бекап**: суто-unstaged оригінальний вміст конфліктного файлу при Tier 3 (LLM-агент редагує файли) зберігається лише всередині diff3-маркерів — без окремої точки відкату.
2. **Feedback Tier-3**: єдиним зворотним зв'язком при Tier 3 був детермінований лог (які файли конфліктні + exit code) без структурованого пояснення, що і як розв'язав агент.

## Considered Options

Pre-flight бекап:
- `git stash create` + `git stash store` — знімок-commit, не чіпає робоче дерево
- `git stash push` — повний stash з очищенням дерева
- Без бекапу (попередній стан)

Feedback Tier-3:
- Per-file підсумок у відповіді агента (stdout), без збереження у файл
- Зберігати підсумок у файл-артефакт (`.getmerge.log`)
- Залишити лише детермінований лог скрипта

## Decision Outcome

Chosen option (бекап): "`git stash create` + `git stash store`", because `git stash push` очищає дерево, руйнує staged/unstaged-розрізнення, переносить конфлікт на `stash pop` повз tier-пайплайн і лишає linger-stash при конфліктному `pop`; `create` робить знімок, не чіпаючи дерево; на чистому дереві повертає порожній рядок — крок пропускається автоматично.

Chosen option (feedback): "Per-file підсумок у stdout без файлового артефакту", because артефакт явно відхилив користувач («без артефакту»); zsh запускається зі `stdio:'inherit'`, тому відповідь агента видна наживо в терміналі.

### Consequences

- Good, because знімок реально містить і staged-, і unstaged-правки (перевірено: `git show <sha>:a.txt` → `UNSTAGED_TOP`, `git show <sha>:d.txt` → `STAGED_D`); в stdout друкується точна команда відновлення `git stash apply <sha>`.
- Good, because per-file підсумок (що хотіла кожна сторона і як агент примирив конфлікт) іде наживо в термінал без зайвих файлів у репозиторії.
- Bad, because знімок лишається в `git stash list` після успішного мерджу і потребує ручного `git stash drop` — автоматичне очищення після успіху не реалізовано (інструкція `git stash drop` друкується в stdout, але не виконується автоматично).
- Bad, because per-file підсумок існує лише в буфері терміналу — після закриття сесії недоступний; якість і деталізація залежать від моделі (контракту нема, лише промпт-інструкція).

## More Information

- Pre-flight реалізовано на початку `_n7merge_delta` у `npm/merge.js`. Stdout: `🛟 Бекап … збережено: git stash apply <sha> (відновити) · git stash drop (прибрати)`.
- Тест pre-flight: `npm/tests/merge.test.mjs` перевіряє виклики `git stash create` і `git stash store`, наявність `git stash apply <sha>` у повідомленні.
- Команди верифікації в transcript: `git stash list` (до/після), `git show <sha>:a.txt`.
- Per-file підсумок: промпт у `_n7merge_resolve_with_agent` (`npm/merge.js`): «Наприкінці надрукуй (у відповіді, НЕ у файли) короткий підсумок по КОЖНОМУ файлу: 1-2 рядки — що хотіла кожна сторона і як саме ти це примирив.»
- Тест per-file: `npm/tests/merge.test.mjs` — `expect(prompt).toContain(...)` для рядка-інструкції.

## Update 2026-06-03

Уточнення реалізації pre-flight бекапу: env-контроль для пропуску бекапу не передбачено — знімок створюється завжди (на чистому дереві `git stash create` повертає порожній рядок і крок пропускається автоматично). SHA бекапу виводиться у stdout зі символом `🛟`. Фінальний стан тестів сесії: `bunx vitest run` — 31/31 passed.
