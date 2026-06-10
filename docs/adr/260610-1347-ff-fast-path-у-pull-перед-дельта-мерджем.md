---
session: b4042850-5fb6-46be-b215-1477180bcdb6
captured: 2026-06-10T13:47:51+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/b4042850-5fb6-46be-b215-1477180bcdb6.jsonl
---

(waiting for input, then show ADR output)
[assistant]
[thinking]
The user is asking me to analyze the AI coding session transcript and produce durable decision documentation in the form of MADR-style ADR blocks.

Let me analyze the transcript to identify the key decisions made:

1. **FF fast-path before delta-merge**: The decision to add a fast-forward attempt before falling back to delta-merge in `pull.js`. This was discussed and implemented.

2. **Reverse-delta approach for diverged history**: The decision to use reverse-delta (`_n7merge_delta "origin/<branch>" "$backup"`) instead of stash-based approach when FF is impossible. This replaced the "forward delta" approach.

3. **No stash step for FF**: The decision that stash is not needed for FF - git handles it naturally.

Let me think about what ADRs to produce:

**ADR 1**: Алгоритм pull: FF fast-path + reverse-delta фолбек
- Context: The existing pull algorithm always did delta-merge without trying FF first
- The user expected FF to happen first, then merge
- Decision: Add FF fast-path, and when FF is impossible, use reverse-delta (HEAD → origin) instead of forward delta (origin → HEAD)
- This decision encompasses both changes as they were made together in the session

Actually, let me re-read more carefully. There were two distinct decisions:

1. First decision: Add FF fast-path before delta-merge (implemented first)
2. Second decision: Replace the "forward delta" fallback (origin delta onto local HEAD) with "reverse delta" (local delta onto origin HEAD), using `reset --hard origin + _n7merge_delta origin backup`

These are two related but distinct design choices. Let me produce two ADRs.

**ADR 1**: FF fast-path у `pull` перед дельта-мерджем
- Context: `npx @7n/n pull` не робив fast-forward — завжди застосовував дельту через `_n7merge_delta`, навіть коли FF був би достатнім
- Considered options: Always use `git merge --ff-only` first (chosen), keep current always-delta approach
- Decision: Спробувати FF спочатку, fallback тільки якщо non-zero
- No stash needed for FF (git handles clean tree and non-conflicting local changes)

**ADR 2**: Reverse-delta замість forward-delta у фолбеку pull
- Context: The initial fallback kept `HEAD = local commits, origin delta as unstaged`. This causes issues with `push` (which would include upstream changes in user's squash commit), and the status was always "behind origin" even after a successful pull
- Considered options: stash+ff+stash-pop, reverse-delta (reset to origin + apply local delta back as unstaged)
- Decision: Reverse delta approach
- Good: HEAD = origin (clean status, idempotent re-run, clean composition with push)
- Bad: requires `reset --hard` which moves HEAD (mitigated by backup sha + trap)

Let me write these ADRs now.
</thinking>

## ADR FF fast-path у `pull` перед дельта-мерджем

## Context and Problem Statement
`npx @7n/n pull` завжди виконував `_n7merge_delta "HEAD" "origin/<branch>"`, ігноруючи кейс, коли `HEAD` є предком `origin/<branch>` і справжній fast-forward був би достатнім. Користувач очікував FF-спробу **перед** дельта-мерджем.

## Considered Options
* Завжди намагатися `git merge --ff-only` першим, фолбек на дельта-мердж лише при non-zero
* Залишити поточний підхід (завжди `_n7merge_delta`, FF ніколи)
* `stash → FF → stash pop`

## Decision Outcome
Chosen option: "Завжди намагатися `git merge --ff-only` першим", because `git merge --ff-only` сам коректно обробляє кейси без перетину (чисте дерево і локальні зміни у нечіпаних файлах) і повертає non-zero **лише** коли перетин є — тоді й залучається дельта-мердж. Окремий `stash` зайвий: він не усуває перетин, а переносить його у `stash pop`, втрачаючи багаторівневий резолвер (`mergiraf` + LLM-агент).

### Consequences
* Good, because transcript фіксує очікувану користь: FF проходить без зайвих дій у переважній більшості кейсів (чисте дерево або нечіпані локальні файли).
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Реалізовано у `npm/pull.js`: після `git fetch origin <branch>` — перевірка `git merge-base --is-ancestor HEAD origin/<branch>`, потім `git merge --ff-only`; при non-zero — фолбек. Тести: `npm/tests/pull.test.mjs` (новий файл, раніше тестів для `pull` не існувало). Changelog: `npm/.changes/260610-1322.md`, bump `minor`.

---

## ADR Reverse-delta замість forward-delta у фолбеку `pull`

## Context and Problem Statement
Початковий фолбек `pull` залишав `HEAD = локальні коміти`, а origin-дельту клав як uncommitted. Це давало: (1) `git status` постійно показував «behind origin» навіть після успішного pull; (2) `push` сквошив upstream-зміни разом із локальною роботою, переписуючи авторство чужих комітів; (3) повторний `pull` не був ідемпотентним.

## Considered Options
* `reset --soft base → stash -u → git merge --ff-only origin → stash pop` (stash-gymnastics)
* Reverse-delta: `backup = git stash create; git reset --hard origin/<branch>; _n7merge_delta "origin/<branch>" "$backup"` — той самий `_n7merge_delta`, але зі зміненими ролями `ours`/`src`
* Залишити forward-delta (поточний `_n7merge_delta "HEAD" "origin/<branch>"`)

## Decision Outcome
Chosen option: "Reverse-delta", because підхід `stash+ff+pop` за тими самими витратами на резолв конфліктів деградує до слабкого `git stash pop` (без `mergiraf`/LLM-агента) і так само переписує HEAD. Reverse-delta **зберігає** повну силу `_n7merge_delta`, дає `HEAD = origin` (коректний `git status`, ідемпотентний re-run), і чисту композицію з `push` (сквошить лише локальну роботу).

### Consequences
* Good, because transcript фіксує очікувану користь: після pull `HEAD = origin` (SHA/автори незмінні), uncommitted-діфф містить **лише** локальну роботу, `push` не захоплює upstream-зміни. Ідемпотентність підтверджена інтеграційним smoke-тестом у `mktemp`-репо.
* Bad, because `reset --hard origin/<branch>` переписує HEAD — втрачається попередній інваріант «HEAD не рухається ніколи». Пом'якшено: `backup`-sha фіксується до `reset` через `git stash create`, `trap ERR` відкочує до `$backup`.

## More Information
Реалізовано у `npm/pull.js` zsh-скрипті: `BACKUP_SHA=$(git stash create 2>/dev/null || echo "")` → `git reset --hard origin/$branch` → `_n7merge_delta "origin/$branch" "$BACKUP_SHA_OR_HEAD"`. Лейбли конфліктів перейменовано (`ours`→`origin`, `theirs`→`local`). Синтаксис zsh перевірено `zsh -n`. Тести оновлено в `npm/tests/pull.test.mjs` (68 passed). Changelog: `npm/.changes/260610-1322.md` оновлено під reverse-delta семантику.
