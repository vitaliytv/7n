---
session: 10799558-6237-4779-978f-51c2d521f437
captured: 2026-06-16T09:23:13+03:00
transcript: /Users/vitalii/.claude/projects/-Users-vitalii-www-vitaliytv-7n/10799558-6237-4779-978f-51c2d521f437.jsonl
---

## ADR Передача prompt у LLM-агентів через stdin замість позиційного аргументу

## Context and Problem Statement
`npx @7n/n push` не зміг згенерувати commit-меседж у великому репо: diff на 1326 рядків зайняв ~5.4 MB, що після вбудовування у рядкову змінну зробило `prompt` ~3.7 MB. Передача цієї змінної позиційним аргументом (`pi ... "$prompt"`, `claude -p "$prompt"`, `cursor-agent ... "$prompt"`) перевищила `ARG_MAX` macOS (1 048 576 байт), тому всі три агенти завершувалися з rc=127 (`argument list too long`) ще до запуску.

## Considered Options
* Передавати prompt через позиційний аргумент (статус-кво)
* Передавати prompt через stdin (`< "$pf"`)

## Decision Outcome
Chosen option: "Передавати prompt через stdin (`< "$pf"`)", because stdin не обмежений `ARG_MAX`, а `pi -p`, `claude -p` та `cursor-agent -p` підтримують читання prompt зі stdin (підтверджено тестовими викликами в transcript). Prompt спочатку записується у tmpfile (`$pf`) через `print -r -- "$prompt" > "$pf"`, а потім кожен агент викликається з `< "$pf"`.

### Consequences
* Good, because `E2BIG` / `argument list too long` більше не виникає незалежно від розміру diff — stdin не має обмеження на розмір.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Змінені виклики у `npm/push.js`:
- `pi "${pi_args[@]}" < "$pf"` замість `pi "${pi_args[@]}" "$prompt"`
- `claude -p --model "$claude_model" < "$pf"` замість `claude -p "$prompt" --model ...`
- `cursor-agent -p --force --output-format text --model "$cursor_model" < "$pf"` замість `cursor-agent ... "$prompt"`
Tmpfile `$pf` прибирається (`rm -f "$pf"`) на всіх шляхах повернення. Усі 27 тестів у `npm/tests/push.test.mjs` пройшли. Синтаксис згенерованого zsh-скрипта перевірено `zsh -n`.

---

## ADR Обмеження diff-контексту за байтами та довжиною рядка на додаток до ліміту рядків

## Context and Problem Statement
Існуючий ліміт `N7COMMIT_MAX_DIFF_LINES` (1500 рядків) не захищав від надмірного розміру prompt: 1326 рядків у репо `/Users/vitalii/www/nitra/ai` дали ~5.4 MB (≈4100 байт/рядок), що роздуло prompt до ~3.7 MB. Довгі рядки (мініфіковане/base64/JSON) обходили line-cap і перевантажували контекстне вікно LLM.

## Considered Options
* Обмежувати лише за кількістю рядків (статус-кво)
* Додати обмеження за довжиною рядка (`N7COMMIT_MAX_LINE`) і за байтами (`N7COMMIT_MAX_DIFF_BYTES`)

## Decision Outcome
Chosen option: "Додати обмеження за довжиною рядка (`N7COMMIT_MAX_LINE`) і за байтами (`N7COMMIT_MAX_DIFF_BYTES`)", because одного ліміту рядків недостатньо, коли рядки містять мінімізований або бінарний вміст; твердий byte-cap гарантує розмір контексту незалежно від структури diff.

### Consequences
* Good, because transcript фіксує очікувану користь: prompt не роздувається, вартість LLM-виклику й ризик перевищення context-вікна знижуються.
* Bad, because transcript не містить підтверджених негативних наслідків.

## More Information
Змінений блок у `npm/push.js`: поряд із `maxl=${N7COMMIT_MAX_DIFF_LINES:-1500}` додано `maxcol=${N7COMMIT_MAX_LINE:-500}` і `maxbytes` (`N7COMMIT_MAX_DIFF_BYTES`). Diff-контекст проходить через `cut`/awk для line-cap та `head -c` для byte-cap перед запитом до LLM. Changelog-запис: `npm/.changes/260616-0922.md` (bump: patch, section: Fixed).
