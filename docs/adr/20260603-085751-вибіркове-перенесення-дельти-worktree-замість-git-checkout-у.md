---
session: 7e30ed38-dea1-44a0-bcf9-97afe7986a1a
captured: 2026-06-03T08:57:51+03:00
transcript: /Users/vitalii/.cursor/projects/Users-vitalii-www-vitaliytv-7n/agent-transcripts/7e30ed38-dea1-44a0-bcf9-97afe7986a1a/7e30ed38-dea1-44a0-bcf9-97afe7986a1a.jsonl
---

## ADR Вибіркове перенесення дельти worktree замість `git checkout -- .` у `getw`

## Context and Problem Statement

Команда `getw` переносила файли з worktree-гілки у поточну гілку через `git checkout "$target_branch" -- .`, що сліпо перезаписувало **всі** файли, включно з тими, які worktree-гілка не змінювала. Якщо поточна гілка мала власні зміни у файлах, які worktree-гілка не чіпала, вони затиралися старими версіями без жодного конфліктного попередження.

## Considered Options

* `git checkout "$target_branch" -- .` (поточна поведінка: сліпе перезаписування всього дерева)
* `git diff --binary merge_base target | git apply` (перенесення лише дельти від спільного merge-base)

## Decision Outcome

Chosen option: "`git diff --binary merge_base target | git apply`", because цей підхід переносить **виключно дельту** worktree-гілки відносно спільного merge-base, не зачіпаючи файли, яких worktree-гілка не модифікувала, і безпечно сигналізує про конфлікт замість мовчазної втрати даних.

### Consequences

* Good, because файли, змінені лише у поточній гілці, більше не перезаписуються: `git apply` без `--index` застосовує зміни лише до тих файлів, які фактично присутні у патчі.
* Bad, because `git apply` потребує визначення merge-base (`git merge-base`) — якщо спільного предка немає, операцію неможливо виконати; `getw` завершується з помилкою.

## More Information

Файли: `npm/getw.js` (рядки 64–78 після правки), `npm/README.md`.
Команди в transcript: `git merge-base "$current_branch" "$target_branch"`, `git diff --binary "$merge_base" "$target_branch" | git apply --whitespace=nowarn`.
Change-файл: `npm/.changes/…`, bump `patch`, секція `Fixed`.

---

## ADR Інтелектуальний мерж конфліктів через LLM-агента (`claude -p` / `cursor-agent -p`) у `getw`

## Context and Problem Statement

Після переходу на `git apply` виникла потреба вирішити, що робити при конфліктах: попередня версія просто падала й зберігала worktree. Користувач явно запросив замінити падіння на автоматичне інтелектуальне злиття засобами LLM-агента.

## Considered Options

* Зупинитися з помилкою при конфлікті (попередня поведінка після першого виправлення)
* `git apply --3way` + виклик `claude -p` (фолбек `cursor-agent -p`) для розв'язання маркерів

## Decision Outcome

Chosen option: "`git apply --3way` + `claude -p` / `cursor-agent -p`", because так `getw` лишає конфліктні маркери у файлах замість падіння, а LLM-агент об'єднує наміри обох сторін та прибирає маркери без ручного втручання; worktree видаляється лише після підтвердженого чистого результату.

### Consequences

* Good, because transcript фіксує очікувану користь: при конфлікті втрата даних не відбувається — worktree зберігається до успішного або явно підтвердженого ручного завершення.
* Good, because пріоритетний вибір CLI (`claude` → `cursor-agent`) відповідає конвенції LLM-хуків проєкту; моделі налаштовуються через `GETW_MERGE_MODEL` / `GETW_MERGE_CURSOR_MODEL`.
* Bad, because `--3way` потребує, щоб blob-об'єкти merge-base були доступні у репозиторії; `claude -p` має бути авторизований у середовищі виконання — без цього агентська гілка недоступна.

## More Information

Файли: `npm/getw.js` (helper `_getw_resolve_with_agent`, рядки 9–31 і 93–155), `npm/README.md`.
Команди: `git apply --3way --whitespace=nowarn`, `claude -p "$prompt" --permission-mode acceptEdits --model "${GETW_MERGE_MODEL:-sonnet}"`, `cursor-agent -p --force --output-format text --model "${GETW_MERGE_CURSOR_MODEL:-claude-4.6-sonnet-medium}"`.
Перевірка відсутності маркерів: `grep -rq '<<<<<<<\|>>>>>>>' $files`.
Change-файл: `npm/.changes/…`, bump `minor`, секція `Added`.
