# Delta-мердж у `getpull` замість повного `git checkout origin/<branch> -- .`

**Status:** Accepted
**Date:** 2026-06-03

## Context and Problem Statement

Перша реалізація `getpull` використовувала `git checkout origin/$branch -- .` — повний checkout: він перезаписував **усі** tracked-файли версією з origin незалежно від наявності незакомічених правок у робочому дереві. Під час тестування (реальний виклик `bun ./npm/bin/n.js getpull`) виявлено, що це безпечно лише коли origin попереду локального HEAD без локальних правок поверх; але на «брудному» дереві команда затерла б незакомічені зміни.

## Considered Options

- Повний `git checkout origin/<branch> -- .` (перша реалізація)
- Delta-мердж: лише патч `merge-base(HEAD, origin/<branch>)..origin/<branch>` через `git apply` + багатоступеневі резолвери (той самий алгоритм, що вже використовував `getw`)

## Decision Outcome

Chosen option: "Delta-мердж через `_n7merge_delta`", because повний `git checkout` затирає незакомічені зміни tracked-файлів, що є деструктивним на «брудному» дереві; delta-підхід переносить лише нові зміни відносно спільного предка, зберігаючи локальні правки.

### Consequences

- Good, because `zsh -n` нового скрипту `getpull` — OK; 28/28 тестів — OK.
- Good, because зміни джерела (`origin/<гілка>` замість worktree) ізольовані у `getpull.js`; ядро `_n7merge_delta` у `merge.js` незмінне.
- Bad, because delta-підхід потребує `git fetch` перед мерджем (додатковий мережевий запит); transcript не фіксує це як проблему.

## More Information

- `npm/merge.js` — `MERGE_ZSH_LIB` містить zsh-функцію `_n7merge_delta(ours, source)`: `git diff merge-base(ours,source) source | git apply --index`; після — ітеративна розвʼязка конфліктів через тири (Tier 0–3).
- `npm/getpull.js` — передає `ours=HEAD`, `source=origin/$branch`; перед зверненням до `_n7merge_delta` виконує `git fetch origin $branch`.
- Перша (деструктивна) реалізація — `git checkout origin/$branch -- . && git reset .` — відхилена після user-запиту про безпеку даних.
- Перевірка: `zsh -n` → OK; жоден наявний коміт і жоден untracked-файл не постраждали при реальному запуску першої реалізації лише через те, що `origin/main` був попереду локального HEAD на 3 коміти.

## Update 2026-06-03

Емпірична верифікація delta-підходу на тестових репозиторіях `/tmp/gptest` і `/tmp/gpconf`:
- Staged-вміст (index) та локальні коміти (що не збігаються з origin) лишились незайманими після `getpull`.
- Unstaged-файли, яких `getpull` не торкається, збережено без змін.
- Конфліктний файл отримав diff3-маркери замість тихого перезапису; `getpull` повернув exit code `1` (fail-safe).
- Підтверджено в transcript: суто-unstaged оригінальний вміст конфліктного файлу живе лише всередині конфліктних маркерів; окремого rollback-артефакту без pre-flight знімка немає.
